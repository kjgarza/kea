/**
 * Solvability check prompts (#33, spec §5.4 F19).
 *
 * - The SOLVER plays a situation puzzle like a player: it sees only the
 *   title and setup plus its own transcript (keeper answers and theory
 *   grades). It never sees the solution or the key facts. Its input type,
 *   `SolverPuzzleView`, is built by `toSolverView`, which copies only the
 *   public fields, so a whole card cannot be passed in by mistake.
 * - The AMBIGUITY check reads the setup and the solution and asks whether the
 *   setup admits another coherent story that a fair player could reach and
 *   that the keeper's yes/no answers would not rule out.
 *
 * Pure module shared with the scripts (scripts/lib/solvability.ts).
 */
import type { SituationCard } from "../../types/card";
import type { KeeperAnswer } from "./answers";
import type { AiLanguage, TheoryVerdict } from "./api";
import { AMBIGUITY_EFFORT, AMBIGUITY_MAX_TOKENS, SOLVER_EFFORT, SOLVER_MAX_TOKENS } from "./config";
import { LANGUAGE_NAMES, puzzleBlock } from "./keeper";
import type { JsonGenerationRequest, JsonGenerationResult, JsonSchema, LlmProvider } from "./provider";
import { ProviderError, generateJsonWithRetry } from "./provider";

// ---------------------------------------------------------------------------
// Solver
// ---------------------------------------------------------------------------

/** Everything a player can see of a puzzle. Never the solution or key facts. */
export interface SolverPuzzleView {
  title: string;
  setup: string;
}

/** The only way to build a solver view from a card: copies the public fields. */
export function toSolverView(card: Pick<SituationCard, "title" | "setup">): SolverPuzzleView {
  return { title: card.title, setup: card.setup };
}

export type SolverHistoryEntry =
  | { kind: "question"; text: string; answer: KeeperAnswer }
  | { kind: "theory"; text: string; verdict: TheoryVerdict; correct: number; missing: number };

export interface SolverPromptInput {
  puzzle: SolverPuzzleView;
  lang: AiLanguage;
  history: SolverHistoryEntry[];
  questionsLeft: number;
  theoriesLeft: number;
}

export type SolverMove = { action: "ask" | "theory"; text: string };

export const SOLVER_SCHEMA_NAME = "solver_move";

export const SOLVER_RULES = `You are playing a lateral-thinking "situation puzzle" (like Black Stories). You see only the setup. A keeper who knows the hidden story answers your yes/no questions with one of: yes, no, partly, irrelevant, rephrase.

Your goal is to reconstruct the hidden story: who did what, why, and the twist that explains the setup.

Each turn, do exactly one of:
- "ask": one short, clear yes/no question (one thing at a time, under 200 characters).
- "theory": your full explanation of the story, in a few sentences. A grader tells you how many key facts it gets right and how many are missing, never which.

Play well:
1. Start broad (people, place, cause, intent), then narrow down. Question every assumption the setup invites.
2. Build on earlier answers. Never repeat a question.
3. Submit a theory only when the answers support it; you have few theories. After a "close" verdict, ask about what may be missing before trying again.
4. When no questions are left you must submit your best theory.
5. Write in the session language.`;

/** Output schema; with no questions left, only a theory is allowed. */
export function solverOutputSchema(questionsLeft: number): JsonSchema {
  return {
    type: "object",
    properties: {
      action: { type: "string", enum: questionsLeft > 0 ? ["ask", "theory"] : ["theory"] },
      text: { type: "string" },
    },
    required: ["action", "text"],
    additionalProperties: false,
  };
}

function historyBlock(history: SolverHistoryEntry[]): string {
  if (history.length === 0) return "Nothing yet.";
  return history
    .map((entry, i) =>
      entry.kind === "question"
        ? `${i + 1}. Q: ${entry.text}\n   A: ${entry.answer}`
        : `${i + 1}. THEORY: ${entry.text}\n   GRADE: ${entry.verdict} (${entry.correct} key facts right, ${entry.missing} missing)`
    )
    .join("\n");
}

export function buildSolverPrompt(input: SolverPromptInput): { system: string; user: string } {
  const { puzzle, lang, history, questionsLeft, theoriesLeft } = input;
  const system = `${SOLVER_RULES}\n\nPUZZLE: ${puzzle.title}\n\nSETUP:\n${puzzle.setup}`;
  const budget =
    questionsLeft > 0
      ? `You have ${questionsLeft} question(s) and ${theoriesLeft} theory attempt(s) left.`
      : `You have no questions left. Submit your final theory now (action "theory").`;
  const user = [
    `Session language: ${LANGUAGE_NAMES[lang]}.`,
    `YOUR QUESTIONS, THEORIES AND THE ANSWERS SO FAR:\n${historyBlock(history)}`,
    budget,
  ].join("\n\n");
  return { system, user };
}

export function buildSolverRequest(input: SolverPromptInput): JsonGenerationRequest {
  const { system, user } = buildSolverPrompt(input);
  return {
    system,
    messages: [{ role: "user", content: user }],
    schema: solverOutputSchema(input.questionsLeft),
    schemaName: SOLVER_SCHEMA_NAME,
    maxTokens: SOLVER_MAX_TOKENS,
    effort: SOLVER_EFFORT,
  };
}

/** Validate a solver move; null when unusable. Forces a theory when out of questions. */
export function parseSolverOutput(data: unknown, questionsLeft: number): SolverMove | null {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (!text) return null;
  if (record.action !== "ask" && record.action !== "theory") return null;
  const action = questionsLeft > 0 ? record.action : "theory";
  return { action, text };
}

export interface SolverTurnResult {
  move: SolverMove | null;
  raw: JsonGenerationResult | null;
  /** Why no usable move was produced, else null. */
  failure: Exclude<ProviderError["kind"], "http"> | null;
}

/** One solver turn (with retries). HTTP errors are re-thrown. */
export async function nextSolverMove(
  provider: LlmProvider,
  input: SolverPromptInput,
  retry: { attempts?: number; delayMs?: number } = { attempts: 2, delayMs: 250 }
): Promise<SolverTurnResult> {
  try {
    const raw = await generateJsonWithRetry(provider, buildSolverRequest(input), retry);
    const move = parseSolverOutput(raw.data, input.questionsLeft);
    return { move, raw, failure: move ? null : "invalid_json" };
  } catch (error) {
    if (error instanceof ProviderError && error.kind !== "http") {
      return { move: null, raw: null, failure: error.kind };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Ambiguity check
// ---------------------------------------------------------------------------

export const AMBIGUITY_SCHEMA_NAME = "ambiguity_check";

export const AMBIGUITY_RULES = `You review lateral-thinking "situation puzzles" (like Black Stories) before they are published. Players see only the setup and ask yes/no questions; a keeper answers from the solution and key facts.

A puzzle is AMBIGUOUS when the setup admits another coherent story that:
- explains every detail of the setup at least as naturally as the official solution,
- is materially different (a different cause, motive or twist, not a rewording or a minor detail), and
- would not be ruled out by the keeper's yes/no answers until the players had already committed to it, because the solution and key facts leave the deciding questions "irrelevant" or undetermined.

It is NOT ambiguous just because the setup is surprising, because many wrong guesses exist, or because players could ask about details the solution does not cover, as long as asking about the twist itself gets a clear yes or no.

Also flag a setup that cannot lead to the solution at all: it depends on specialist knowledge, a detail the setup contradicts, or a fact no yes/no question could uncover.

Be strict but fair: most well-made puzzles pass. If you flag one, give the strongest alternative story in one or two sentences and a one-sentence reason.`;

export interface AmbiguityPromptInput {
  card: SituationCard;
  lang: AiLanguage;
}

export interface AmbiguityVerdict {
  ambiguous: boolean;
  /** The competing story, empty when not ambiguous. */
  alternative: string;
  /** One-sentence reason, empty when not ambiguous. */
  reason: string;
}

export function ambiguityOutputSchema(): JsonSchema {
  return {
    type: "object",
    properties: {
      ambiguous: { type: "boolean" },
      alternative: { type: "string" },
      reason: { type: "string" },
    },
    required: ["ambiguous", "alternative", "reason"],
    additionalProperties: false,
  };
}

export function buildAmbiguityPrompt({ card, lang }: AmbiguityPromptInput): { system: string; user: string } {
  return {
    system: AMBIGUITY_RULES,
    user: [
      `The puzzle is in ${LANGUAGE_NAMES[lang]}; answer in English.`,
      puzzleBlock(card),
      `Is this puzzle ambiguous?`,
    ].join("\n\n"),
  };
}

export function buildAmbiguityRequest(input: AmbiguityPromptInput): JsonGenerationRequest {
  const { system, user } = buildAmbiguityPrompt(input);
  return {
    system,
    messages: [{ role: "user", content: user }],
    schema: ambiguityOutputSchema(),
    schemaName: AMBIGUITY_SCHEMA_NAME,
    maxTokens: AMBIGUITY_MAX_TOKENS,
    effort: AMBIGUITY_EFFORT,
  };
}

export function parseAmbiguityOutput(data: unknown): AmbiguityVerdict | null {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (!record || typeof record.ambiguous !== "boolean") return null;
  const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  return { ambiguous: record.ambiguous, alternative: str(record.alternative), reason: str(record.reason) };
}

export interface AmbiguityResult {
  verdict: AmbiguityVerdict | null;
  raw: JsonGenerationResult | null;
  failure: Exclude<ProviderError["kind"], "http"> | null;
}

/** Run the ambiguity check (with retries). HTTP errors are re-thrown. */
export async function checkAmbiguity(
  provider: LlmProvider,
  input: AmbiguityPromptInput,
  retry: { attempts?: number; delayMs?: number } = { attempts: 2, delayMs: 250 }
): Promise<AmbiguityResult> {
  try {
    const raw = await generateJsonWithRetry(provider, buildAmbiguityRequest(input), retry);
    const verdict = parseAmbiguityOutput(raw.data);
    return { verdict, raw, failure: verdict ? null : "invalid_json" };
  } catch (error) {
    if (error instanceof ProviderError && error.kind !== "http") {
      return { verdict: null, raw: null, failure: error.kind };
    }
    throw error;
  }
}
