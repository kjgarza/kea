/**
 * Solvability check for situation puzzles (issue #33, spec §5.4 F19).
 *
 * For each puzzle:
 * 1. Ambiguity check: a reviewer model reads the setup AND the solution and
 *    says whether the setup admits another coherent story the keeper's
 *    answers would not rule out. Ambiguous puzzles fail straight away.
 * 2. Solver loop: a solver model sees ONLY the title and setup (via
 *    `toSolverView`) plus its own transcript. It asks up to `maxQuestions`
 *    (40) questions, each answered by the shared `answerKeeperQuestion` (the
 *    same code path as players), and may submit a theory at any point,
 *    graded by the shared `gradeTheory`. When the questions run out it must
 *    submit a final theory. A "solved" grade passes the puzzle.
 *
 * Every provider is injected, so tests run the whole pipeline with scripted
 * fakes. Token usage is metered per puzzle and per role, and priced from the
 * single `MODEL_PRICING` table.
 *
 * Passed cards get `solvability: { questions, checkedAt, model }`; failed
 * cards go to `decks/drafts/<deckId>.json` with their reasons.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Card, SituationCard } from "../../src/types/card";
import type { Deck } from "../../src/types/deck";
import type { AiLanguage, KeeperTranscriptTurn } from "../../src/lib/ai/api";
import { KEEPER_LIMITS, SOLVABILITY_LIMITS, SOLVER_PROMPT_VERSION, THEORY_LIMITS } from "../../src/lib/ai/config";
import { gradeTheory } from "../../src/lib/ai/grade";
import { answerKeeperQuestion } from "../../src/lib/ai/keeper";
import type { LlmProvider } from "../../src/lib/ai/provider";
import {
  checkAmbiguity,
  nextSolverMove,
  toSolverView,
  type AmbiguityVerdict,
  type SolverHistoryEntry,
} from "../../src/lib/ai/solver";
import { emptyUsage, formatCostUsd, meterProvider, sumUsage, type UsageTotals } from "../../src/lib/ai/usage";
import { mapWithConcurrency } from "./keeper-eval";

export const DRAFTS_DIR = "decks/drafts";

export interface SolvabilityProviders {
  /** Plays the puzzle; never sees the solution. */
  solver: LlmProvider;
  /** Answers the solver's questions (the player keeper). */
  keeper: LlmProvider;
  /** Grades the solver's theories (the player grader). */
  grader: LlmProvider;
  /** Ambiguity reviewer; defaults to the solver provider. null skips the check. */
  ambiguity?: LlmProvider | null;
}

export interface SolvabilityOptions {
  providers: SolvabilityProviders;
  lang: AiLanguage;
  maxQuestions?: number;
  maxTheories?: number;
  retry?: { attempts?: number; delayMs?: number };
  now?: () => Date;
}

export type PuzzleCheckStatus = "passed" | "failed" | "error";

export const SOLVABILITY_ROLES = ["solver", "keeper", "grader", "ambiguity"] as const;
export type SolvabilityRole = (typeof SOLVABILITY_ROLES)[number];

export interface PuzzleCheckResult {
  cardId: string;
  title: string;
  status: PuzzleCheckStatus;
  /** Why the puzzle failed or errored; empty when it passed. */
  reasons: string[];
  /** Questions the solver asked. */
  questions: number;
  /** Theories the solver submitted. */
  theories: number;
  transcript: SolverHistoryEntry[];
  ambiguity: AmbiguityVerdict | null;
  usage: UsageTotals;
  usageByRole: Record<SolvabilityRole, UsageTotals>;
  checkedAt: string;
  solverModel: string;
  durationMs: number;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Check one puzzle. Never throws: provider failures become status "error". */
export async function checkPuzzleSolvability(
  card: SituationCard,
  options: SolvabilityOptions
): Promise<PuzzleCheckResult> {
  const maxQuestions = options.maxQuestions ?? SOLVABILITY_LIMITS.maxQuestions;
  const maxTheories = Math.max(1, options.maxTheories ?? SOLVABILITY_LIMITS.maxTheories);
  const now = options.now ?? (() => new Date());
  const startedAt = Date.now();

  const usageByRole = Object.fromEntries(SOLVABILITY_ROLES.map((role) => [role, emptyUsage()])) as Record<
    SolvabilityRole,
    UsageTotals
  >;
  const { providers } = options;
  const solver = meterProvider(providers.solver, usageByRole.solver);
  const keeper = meterProvider(providers.keeper, usageByRole.keeper);
  const grader = meterProvider(providers.grader, usageByRole.grader);
  const reviewerBase = providers.ambiguity === undefined ? providers.solver : providers.ambiguity;
  const reviewer = reviewerBase ? meterProvider(reviewerBase, usageByRole.ambiguity) : null;

  const transcript: SolverHistoryEntry[] = [];
  let questions = 0;
  let theories = 0;
  let ambiguity: AmbiguityVerdict | null = null;

  const finish = (status: PuzzleCheckStatus, reasons: string[]): PuzzleCheckResult => ({
    cardId: card.cardId,
    title: card.title,
    status,
    reasons,
    questions,
    theories,
    transcript,
    ambiguity,
    usage: sumUsage(Object.values(usageByRole)),
    usageByRole,
    checkedAt: now().toISOString(),
    solverModel: providers.solver.model,
    durationMs: Date.now() - startedAt,
  });

  try {
    // 1. Ambiguity (fail fast: no point paying for a solver run).
    if (reviewer) {
      const result = await checkAmbiguity(reviewer, { card, lang: options.lang }, options.retry);
      if (!result.verdict) {
        return finish("error", [`ambiguity check returned no usable verdict (${result.failure})`]);
      }
      ambiguity = result.verdict;
      if (ambiguity.ambiguous) {
        const reason = ambiguity.reason || "the setup admits another coherent story";
        const alternative = ambiguity.alternative ? ` Alternative: ${ambiguity.alternative}` : "";
        return finish("failed", [`ambiguous: ${reason}${alternative}`]);
      }
    }

    // 2. Solver loop. The solver only ever gets `toSolverView(card)`.
    const puzzle = toSolverView(card);
    let best: { correct: number; missing: number } | null = null;
    for (;;) {
      const questionsLeft = Math.max(0, maxQuestions - questions);
      const theoriesLeft = maxTheories - theories;
      const turn = await nextSolverMove(
        solver,
        { puzzle, lang: options.lang, history: transcript, questionsLeft, theoriesLeft },
        options.retry
      );
      if (!turn.move) {
        return finish("error", [`solver returned no usable move after ${questions} questions (${turn.failure})`]);
      }

      if (turn.move.action === "ask") {
        const question = turn.move.text.slice(0, KEEPER_LIMITS.questionMaxChars);
        const keeperTranscript: KeeperTranscriptTurn[] = transcript.flatMap((entry) =>
          entry.kind === "question" ? [{ q: entry.text, a: entry.answer }] : []
        );
        const answer = await answerKeeperQuestion(
          keeper,
          { card, lang: options.lang, transcript: keeperTranscript, question },
          options.retry
        );
        transcript.push({ kind: "question", text: question, answer: answer.response.answer });
        questions++;
        continue;
      }

      const theory = turn.move.text.slice(0, THEORY_LIMITS.theoryMaxChars);
      const grade = await gradeTheory(grader, { card, lang: options.lang, theory }, options.retry);
      if (grade.fallback) {
        return finish("error", [`grader returned no grade after ${questions} questions (${grade.fallback})`]);
      }
      const { verdict, correctFactIds, missingCount } = grade.response;
      theories++;
      transcript.push({ kind: "theory", text: theory, verdict, correct: correctFactIds.length, missing: missingCount });
      if (verdict === "solved") return finish("passed", []);
      if (!best || correctFactIds.length > best.correct) best = { correct: correctFactIds.length, missing: missingCount };

      const total = card.keyFacts.length;
      const bestText = `best theory got ${best.correct}/${total} key facts`;
      if (questionsLeft === 0) {
        return finish("failed", [`not solved within ${maxQuestions} questions; ${bestText}`]);
      }
      if (theories >= maxTheories) {
        return finish("failed", [
          `used all ${maxTheories} theories after ${questions} questions without solving; ${bestText}`,
        ]);
      }
    }
  } catch (error) {
    return finish("error", [`provider error after ${questions} questions: ${describeError(error)}`]);
  }
}

// ---------------------------------------------------------------------------
// Deck level
// ---------------------------------------------------------------------------

export interface DeckCheckOptions extends SolvabilityOptions {
  /** Puzzles checked in parallel (default 4). */
  concurrency?: number;
  onResult?: (result: PuzzleCheckResult, done: number, total: number) => void;
}

export interface SolvabilityReport {
  schemaVersion: 1;
  solverPromptVersion: string;
  lang: AiLanguage;
  maxQuestions: number;
  models: { solver: string; keeper: string; grader: string; ambiguity: string | null };
  results: PuzzleCheckResult[];
  counts: Record<PuzzleCheckStatus, number>;
  usage: UsageTotals;
}

export async function checkDeckSolvability(
  cards: readonly SituationCard[],
  options: DeckCheckOptions
): Promise<SolvabilityReport> {
  let done = 0;
  const results = await mapWithConcurrency(cards, options.concurrency ?? 4, async (card) => {
    const result = await checkPuzzleSolvability(card, options);
    done++;
    options.onResult?.(result, done, cards.length);
    return result;
  });
  const counts: Record<PuzzleCheckStatus, number> = { passed: 0, failed: 0, error: 0 };
  for (const result of results) counts[result.status]++;
  const { providers } = options;
  const reviewer = providers.ambiguity === undefined ? providers.solver : providers.ambiguity;
  return {
    schemaVersion: 1,
    solverPromptVersion: SOLVER_PROMPT_VERSION,
    lang: options.lang,
    maxQuestions: options.maxQuestions ?? SOLVABILITY_LIMITS.maxQuestions,
    models: {
      solver: providers.solver.model,
      keeper: providers.keeper.model,
      grader: providers.grader.model,
      ambiguity: reviewer ? reviewer.model : null,
    },
    results,
    counts,
    usage: sumUsage(results.map((r) => r.usage)),
  };
}

/** Record the check on a passed card (difficulty signal). */
export function applySolvability(card: SituationCard, result: PuzzleCheckResult): SituationCard {
  return {
    ...card,
    solvability: { questions: result.questions, checkedAt: result.checkedAt, model: result.solverModel },
  };
}

/** Deck language → keeper language. */
export function aiLanguageFor(language: string): AiLanguage {
  return language.toLowerCase().startsWith("es") ? "es" : "en";
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export interface DraftEntry {
  status: Exclude<PuzzleCheckStatus, "passed">;
  reasons: string[];
  questions: number;
  theories: number;
  checkedAt: string;
  solverModel: string;
  costUsd: number;
  ambiguity: AmbiguityVerdict | null;
  transcript: SolverHistoryEntry[];
  card: SituationCard;
}

export interface DraftsFile {
  schemaVersion: 1;
  deckId: string;
  createdAt: string;
  /** Same instant as `createdAt`; tells a reader how fresh the failures are. */
  generatedAt: string;
  solverPromptVersion: string;
  deck: Pick<Deck, "name" | "gameType" | "language" | "difficulty" | "topics" | "nsfw">;
  drafts: DraftEntry[];
}

export function buildDraftsFile(deck: Deck, report: SolvabilityReport, createdAt: string): DraftsFile {
  const cards = new Map(deck.cards.map((card) => [card.cardId, card]));
  const drafts: DraftEntry[] = [];
  for (const result of report.results) {
    if (result.status === "passed") continue;
    const card = cards.get(result.cardId);
    if (!card || card.type !== "situation") continue;
    drafts.push({
      status: result.status,
      reasons: result.reasons,
      questions: result.questions,
      theories: result.theories,
      checkedAt: result.checkedAt,
      solverModel: result.solverModel,
      costUsd: Number(result.usage.costUsd.toFixed(6)),
      ambiguity: result.ambiguity,
      transcript: result.transcript,
      card,
    });
  }
  return {
    schemaVersion: 1,
    deckId: deck.deckId,
    createdAt,
    generatedAt: createdAt,
    solverPromptVersion: report.solverPromptVersion,
    deck: {
      name: deck.name,
      gameType: deck.gameType,
      language: deck.language,
      difficulty: deck.difficulty,
      topics: deck.topics,
      nsfw: deck.nsfw,
    },
    drafts,
  };
}

/** Remove a stale drafts file (a clean run must not leave old failures behind). */
export async function removeDraftsFile(dir: string, deckId: string): Promise<boolean> {
  const file = path.join(dir, `${deckId}.json`);
  try {
    await rm(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function writeDraftsFile(dir: string, drafts: DraftsFile): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${drafts.deckId}.json`);
  await writeFile(file, `${JSON.stringify(drafts, null, 2)}\n`);
  return file;
}

// ---------------------------------------------------------------------------
// Generation stage (generate-decks.ts)
// ---------------------------------------------------------------------------

export interface SolvabilityStageOptions extends Omit<DeckCheckOptions, "lang"> {
  /** Defaults to the deck language. */
  lang?: AiLanguage;
  draftsDir?: string;
  log?: (line: string) => void;
}

export interface SolvabilityStageResult {
  /** The deck with only passed cards, each carrying `solvability`. */
  deck: Deck;
  report: SolvabilityReport;
  /** Where failed puzzles were written, or null when none failed. */
  draftsPath: string | null;
}

/**
 * Check every situation card of a freshly generated deck. Passed cards stay
 * in the deck (with `solvability` metadata); failed and errored cards are
 * removed and written to `<draftsDir>/<deckId>.json` with their reasons and a
 * `generatedAt` timestamp. A run with no failures deletes a stale file.
 * Non-situation cards are left untouched.
 */
export async function runSolvabilityStage(
  deck: Deck,
  options: SolvabilityStageOptions
): Promise<SolvabilityStageResult> {
  const log = options.log ?? (() => {});
  const lang = options.lang ?? aiLanguageFor(deck.language);
  const situationCards = deck.cards.filter((card): card is SituationCard => card.type === "situation");

  const report = await checkDeckSolvability(situationCards, {
    ...options,
    lang,
    onResult: (result, done, total) => {
      log(formatPuzzleLine(result, done, total));
      options.onResult?.(result, done, total);
    },
  });

  const byId = new Map(report.results.map((r) => [r.cardId, r]));
  const cards = deck.cards.flatMap((card): Card[] => {
    if (card.type !== "situation") return [card];
    const result = byId.get(card.cardId);
    return result?.status === "passed" ? [applySolvability(card, result)] : [];
  });

  let draftsPath: string | null = null;
  const draftsDir = options.draftsDir ?? DRAFTS_DIR;
  if (report.counts.failed + report.counts.error > 0) {
    const createdAt = (options.now ?? (() => new Date()))().toISOString();
    draftsPath = await writeDraftsFile(draftsDir, buildDraftsFile(deck, report, createdAt));
  } else if (await removeDraftsFile(draftsDir, deck.deckId)) {
    log(`   Removed stale drafts file for ${deck.deckId} (all puzzles passed)`);
  }

  for (const line of renderSolvabilitySummary(report, draftsPath)) log(line);
  return { deck: { ...deck, cards }, report, draftsPath };
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function tokens(usage: UsageTotals): string {
  const fmt = (n: number) => n.toLocaleString("en-US");
  const cache =
    usage.cacheReadInputTokens + usage.cacheCreationInputTokens > 0
      ? `, cache ${fmt(usage.cacheReadInputTokens)} read / ${fmt(usage.cacheCreationInputTokens)} written`
      : "";
  return `${fmt(usage.inputTokens)} in / ${fmt(usage.outputTokens)} out tokens${cache}`;
}

const STATUS_ICON: Record<PuzzleCheckStatus, string> = { passed: "✅", failed: "❌", error: "⚠️ " };

/** One log line per puzzle, including its token usage and estimated cost. */
export function formatPuzzleLine(result: PuzzleCheckResult, done?: number, total?: number): string {
  const progress = done !== undefined && total !== undefined ? `[${done}/${total}] ` : "";
  const outcome =
    result.status === "passed"
      ? `solved in ${result.questions} questions, ${result.theories} theor${result.theories === 1 ? "y" : "ies"}`
      : `${result.status}: ${result.reasons.join("; ")}`;
  return `   ${STATUS_ICON[result.status]} ${progress}${result.cardId} "${result.title}" ${outcome} · ${result.usage.calls} calls, ${tokens(result.usage)} · ${formatCostUsd(result.usage)}`;
}

export function renderSolvabilitySummary(report: SolvabilityReport, draftsPath: string | null): string[] {
  const { counts, results } = report;
  const passed = results.filter((r) => r.status === "passed");
  const lines = [
    `   Solvability: ${counts.passed} passed, ${counts.failed} failed, ${counts.error} errors (of ${results.length})`,
  ];
  if (passed.length > 0) {
    const qs = passed.map((r) => r.questions).sort((a, b) => a - b);
    const median = qs[Math.floor((qs.length - 1) / 2)];
    lines.push(`   Questions to solve: min ${qs[0]}, median ${median}, max ${qs[qs.length - 1]}`);
  }
  for (const result of results) {
    if (result.status === "passed") continue;
    lines.push(`     - ${result.cardId} (${result.status}): ${result.reasons.join("; ")}`);
  }
  const perPuzzle = results.length > 0 ? report.usage.costUsd / results.length : 0;
  lines.push(
    `   Usage: ${report.usage.calls} calls, ${tokens(report.usage)} · total ${formatCostUsd(report.usage)}, ~$${perPuzzle.toFixed(4)}/puzzle`
  );
  if (draftsPath) lines.push(`   Failed puzzles written to ${draftsPath}`);
  return lines;
}
