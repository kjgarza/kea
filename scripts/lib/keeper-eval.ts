/**
 * AI keeper eval harness (issue #30, spec §6.5).
 *
 * Eval files live in `evals/keeper/<cardId>.yaml`, one per puzzle, with each
 * case written in English and Spanish side by side so both languages share
 * the same expected answer. Puzzles are referenced by deck + card id (the
 * seed decks from #26), never copied.
 *
 * This module loads and validates the files, runs every case through the
 * same keeper turn the Worker uses (`answerKeeperQuestion`), checks the
 * replies for leaks and scores them. Rendering lives in keeper-eval-report.ts.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { KEEPER_ANSWERS, isKeeperAnswer, type KeeperAnswer } from "../../src/lib/ai/answers";
import type { AiLanguage, KeeperTranscriptTurn } from "../../src/lib/ai/api";
import { KEEPER_PROMPT_VERSION } from "../../src/lib/ai/config";
import { KEEPER_RULES, answerKeeperQuestion, buildKeeperPrompt } from "../../src/lib/ai/keeper";
import {
  LEAK_JUDGE_RULES,
  buildLeakJudgeRequest,
  detectReplyLeaks,
  parseLeakJudgeOutput,
  type LeakFinding,
  type LeakKind,
} from "../../src/lib/ai/leak-judge";
import { generateJsonWithRetry, type LlmProvider } from "../../src/lib/ai/provider";
import type { SituationCard } from "../../src/types/card";
import type { Deck } from "../../src/types/deck";

export const EVAL_DIR = "evals/keeper";
export const EVAL_LANGUAGES: readonly AiLanguage[] = ["en", "es"];

/** Case tags. `fact` is ordinary play; the rest are the red-team set. */
export const EVAL_TAGS = [
  "fact",
  "demand",
  "leading",
  "non-yes-no",
  "injection",
  "language-switch",
  "consistency",
] as const;
export type EvalTag = (typeof EVAL_TAGS)[number];

const FACT_ANSWERS: readonly KeeperAnswer[] = ["yes", "no", "partly"];

// ---------------------------------------------------------------------------
// File format
// ---------------------------------------------------------------------------

/** Text per language. At least one language is required. */
export type LocalizedText = Partial<Record<AiLanguage, string>>;

export interface EvalTurnInput extends LocalizedText {
  a: KeeperAnswer;
}

export interface EvalCaseInput extends LocalizedText {
  /** Expected answer. */
  a: KeeperAnswer;
  /** Key-fact ids the reply should list (only for yes/no/partly). */
  facts?: string[];
  /** Extra fact ids the reply may list without counting as a leak. */
  allow?: string[];
  tag?: EvalTag;
  /** Earlier turns, for consistency cases. */
  transcript?: EvalTurnInput[];
  note?: string;
}

export interface EvalFile {
  cardId: string;
  decks: Partial<Record<AiLanguage, string>>;
  cases: EvalCaseInput[];
}

/** One case in one language, ready to run. */
export interface EvalCase {
  /** Stable key: `<cardId>/<slug of the question>`; unique per language. */
  id: string;
  cardId: string;
  deckId: string;
  lang: AiLanguage;
  tag: EvalTag;
  question: string;
  transcript: KeeperTranscriptTurn[];
  expected: KeeperAnswer;
  expectedFacts: string[];
  allowedFacts: string[];
  card: SituationCard;
}

export type DeckLoader = (deckId: string) => Promise<Deck | null>;

/** Loads decks from public/decks (cached). */
export function createFileDeckLoader(dir = "public/decks"): DeckLoader {
  const cache = new Map<string, Promise<Deck | null>>();
  return (deckId) => {
    let pending = cache.get(deckId);
    if (!pending) {
      const file = Bun.file(path.join(dir, `${deckId}.json`));
      pending = file.exists().then((exists) => (exists ? (file.json() as Promise<Deck>) : null));
      cache.set(deckId, pending);
    }
    return pending;
  };
}

export function slugifyQuestion(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/, "") || "q"
  );
}

const CASE_KEYS = new Set(["a", "en", "es", "facts", "allow", "tag", "transcript", "note"]);
const TURN_KEYS = new Set(["a", "en", "es"]);
// `theories` holds the grading cases (#32); scripts/lib/grade-eval.ts reads them.
const FILE_KEYS = new Set(["cardId", "decks", "cases", "theories"]);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export interface EvalFileResult {
  cases: EvalCase[];
  errors: string[];
}

/**
 * Validate one parsed eval file against the real decks and flatten it into
 * per-language cases. Every error names the file and case.
 */
export async function validateEvalFile(raw: unknown, fileName: string, loadDeck: DeckLoader): Promise<EvalFileResult> {
  const errors: string[] = [];
  const cases: EvalCase[] = [];
  const fail = (msg: string) => errors.push(`${fileName}: ${msg}`);

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail("must be a mapping with cardId, decks and cases");
    return { cases, errors };
  }
  const file = raw as Record<string, unknown>;
  for (const key of Object.keys(file)) if (!FILE_KEYS.has(key)) fail(`unknown key "${key}"`);
  if (typeof file.cardId !== "string" || !file.cardId) {
    fail("cardId is required");
    return { cases, errors };
  }
  const cardId = file.cardId;
  if (path.basename(fileName, path.extname(fileName)) !== cardId) fail(`file name should be ${cardId}.yaml`);

  const decksRaw = file.decks && typeof file.decks === "object" ? (file.decks as Record<string, unknown>) : {};
  const cards: Partial<Record<AiLanguage, SituationCard>> = {};
  const deckIds: Partial<Record<AiLanguage, string>> = {};
  for (const key of Object.keys(decksRaw)) {
    if (!EVAL_LANGUAGES.includes(key as AiLanguage)) fail(`decks.${key}: unknown language`);
  }
  for (const lang of EVAL_LANGUAGES) {
    const deckId = decksRaw[lang];
    if (deckId === undefined) continue;
    if (typeof deckId !== "string") {
      fail(`decks.${lang} must be a deck id`);
      continue;
    }
    const deck = await loadDeck(deckId);
    if (!deck) {
      fail(`decks.${lang}: deck "${deckId}" does not exist`);
      continue;
    }
    if (deck.gameType !== "situation") fail(`decks.${lang}: deck "${deckId}" is not a situation deck`);
    if (deck.language && !deck.language.toLowerCase().startsWith(lang)) {
      fail(`decks.${lang}: deck "${deckId}" is in language "${deck.language}"`);
    }
    const card = deck.cards.find((c) => c.cardId === cardId);
    if (!card || card.type !== "situation") {
      fail(`decks.${lang}: card "${cardId}" is not a situation card in "${deckId}"`);
      continue;
    }
    cards[lang] = card;
    deckIds[lang] = deckId;
  }
  if (Object.keys(deckIds).length === 0) fail("decks must name at least one deck (en and/or es)");

  if (!Array.isArray(file.cases) || file.cases.length === 0) {
    fail("cases must be a non-empty list");
    return { cases, errors };
  }

  const seen = new Map<string, number>();
  file.cases.forEach((rawCase, index) => {
    const where = `cases[${index}]`;
    if (!rawCase || typeof rawCase !== "object" || Array.isArray(rawCase)) {
      fail(`${where} must be a mapping`);
      return;
    }
    const c = rawCase as Record<string, unknown>;
    const label = `${where} (${String(c.en ?? c.es ?? "?").slice(0, 40)})`;
    for (const key of Object.keys(c)) if (!CASE_KEYS.has(key)) fail(`${label}: unknown key "${key}"`);

    if (!isKeeperAnswer(c.a)) {
      fail(`${label}: a must be one of ${KEEPER_ANSWERS.join(", ")}`);
      return;
    }
    const expected = c.a;
    const tag = (c.tag ?? "fact") as EvalTag;
    if (!EVAL_TAGS.includes(tag)) fail(`${label}: tag must be one of ${EVAL_TAGS.join(", ")}`);
    const facts = c.facts ?? [];
    const allow = c.allow ?? [];
    if (!isStringArray(facts)) fail(`${label}: facts must be a list of fact ids`);
    if (!isStringArray(allow)) fail(`${label}: allow must be a list of fact ids`);
    if (!isStringArray(facts) || !isStringArray(allow)) return;
    if ((facts.length > 0 || allow.length > 0) && !FACT_ANSWERS.includes(expected)) {
      fail(`${label}: facts/allow only make sense for yes, no or partly (got ${expected})`);
    }
    if (c.note !== undefined && typeof c.note !== "string") fail(`${label}: note must be text`);

    const transcriptRaw = c.transcript ?? [];
    if (!Array.isArray(transcriptRaw)) {
      fail(`${label}: transcript must be a list`);
      return;
    }
    for (const [t, turn] of transcriptRaw.entries()) {
      const tr = (turn ?? {}) as Record<string, unknown>;
      for (const key of Object.keys(tr)) if (!TURN_KEYS.has(key)) fail(`${label}: transcript[${t}] unknown key "${key}"`);
      if (!isKeeperAnswer(tr.a)) fail(`${label}: transcript[${t}].a must be one of ${KEEPER_ANSWERS.join(", ")}`);
    }

    let hasLanguage = false;
    for (const lang of EVAL_LANGUAGES) {
      const question = c[lang];
      if (question === undefined) continue;
      hasLanguage = true;
      if (typeof question !== "string" || !question.trim()) {
        fail(`${label}: ${lang} must be non-empty text`);
        continue;
      }
      const card = cards[lang];
      const deckId = deckIds[lang];
      if (!card || !deckId) {
        fail(`${label}: has ${lang} text but decks.${lang} is missing or invalid`);
        continue;
      }
      const known = new Set(card.keyFacts.map((fact) => fact.id));
      for (const id of [...facts, ...allow]) {
        if (!known.has(id)) fail(`${label}: fact "${id}" is not a key fact of ${deckId}/${cardId}`);
      }
      const transcript: KeeperTranscriptTurn[] = [];
      for (const [t, turn] of (transcriptRaw as Record<string, unknown>[]).entries()) {
        const q = turn?.[lang];
        if (typeof q !== "string" || !q.trim()) {
          fail(`${label}: transcript[${t}] has no ${lang} text`);
          continue;
        }
        transcript.push({ q, a: turn.a as KeeperAnswer });
      }

      const base = `${cardId}/${slugifyQuestion(question)}`;
      const dupKey = `${lang}:${base}`;
      const count = (seen.get(dupKey) ?? 0) + 1;
      seen.set(dupKey, count);
      if (count > 1 && transcript.length === 0) fail(`${label}: duplicate ${lang} question "${question}"`);
      cases.push({
        id: count > 1 ? `${base}~${count}` : base,
        cardId,
        deckId,
        lang,
        tag,
        question: question.trim(),
        transcript,
        expected,
        expectedFacts: facts,
        allowedFacts: allow,
        card,
      });
    }
    if (!hasLanguage) fail(`${label}: needs en and/or es text`);
  });

  return { cases, errors };
}

export interface EvalSuite {
  files: string[];
  cases: EvalCase[];
  errors: string[];
}

/** Load and validate every `*.yaml` file in the eval directory. */
export async function loadEvalSuite(
  options: { dir?: string; loadDeck?: DeckLoader } = {}
): Promise<EvalSuite> {
  const dir = options.dir ?? EVAL_DIR;
  const loadDeck = options.loadDeck ?? createFileDeckLoader();
  const files = (await readdir(dir)).filter((name) => /\.ya?ml$/.test(name)).sort();
  const cases: EvalCase[] = [];
  const errors: string[] = [];
  for (const name of files) {
    const text = await Bun.file(path.join(dir, name)).text();
    let raw: unknown;
    try {
      raw = YAML.parse(text);
    } catch (error) {
      errors.push(`${name}: invalid YAML: ${String(error)}`);
      continue;
    }
    const result = await validateEvalFile(raw, name, loadDeck);
    cases.push(...result.cases);
    errors.push(...result.errors);
  }
  return { files, cases, errors };
}

export interface EvalFilter {
  langs?: readonly AiLanguage[];
  cardIds?: readonly string[];
  tags?: readonly EvalTag[];
  /** Max cases per language, after the other filters. */
  limit?: number;
}

export function filterCases(cases: readonly EvalCase[], filter: EvalFilter = {}): EvalCase[] {
  const out: EvalCase[] = [];
  const perLang = new Map<AiLanguage, number>();
  for (const c of cases) {
    if (filter.langs && !filter.langs.includes(c.lang)) continue;
    if (filter.cardIds && filter.cardIds.length > 0 && !filter.cardIds.includes(c.cardId)) continue;
    if (filter.tags && filter.tags.length > 0 && !filter.tags.includes(c.tag)) continue;
    const n = perLang.get(c.lang) ?? 0;
    if (filter.limit !== undefined && n >= filter.limit) continue;
    perLang.set(c.lang, n + 1);
    out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Running and scoring
// ---------------------------------------------------------------------------

export type ActualAnswer = KeeperAnswer | "error";
export const CONFUSION_COLUMNS: readonly ActualAnswer[] = [...KEEPER_ANSWERS, "error"];

export interface CaseResult {
  id: string;
  cardId: string;
  lang: AiLanguage;
  tag: EvalTag;
  question: string;
  expected: KeeperAnswer;
  actual: ActualAnswer;
  agree: boolean;
  expectedFacts: string[];
  factIds: string[];
  /** Expected facts all listed (only meaningful when expectedFacts is non-empty). */
  factsMatched: boolean;
  outOfVocab: boolean;
  fallback: string | null;
  leaks: LeakFinding[];
  /** Raw model text, truncated. */
  raw: string;
  /** Keeper call failed (HTTP); counted as a disagreement. */
  error?: string;
  /** Judge call failed; the case was only checked deterministically. */
  judgeError?: string;
}

export interface LanguageSummary {
  total: number;
  agree: number;
  agreement: number;
  /** Cases with at least one leak finding. */
  leaks: number;
  leaksByKind: Record<LeakKind, number>;
  outOfVocab: number;
  errors: number;
  judgeErrors: number;
  fallbacks: number;
  /** Agreeing cases with expected facts that listed all of them. */
  factRecall: { matched: number; total: number };
  /** expected answer -> actual answer -> count */
  confusion: Record<KeeperAnswer, Record<ActualAnswer, number>>;
  byTag: Partial<Record<EvalTag, { total: number; agree: number; leaks: number }>>;
}

export interface EvalReport {
  schemaVersion: 1;
  createdAt: string;
  keeperPromptVersion: string;
  /** Hash of the keeper prompt template; changes when the prompt does. */
  keeperPromptHash: string;
  judgePromptHash: string | null;
  provider: { name: string; model: string };
  judge: { name: string; model: string } | null;
  filter: { langs: AiLanguage[]; cardIds: string[]; tags: string[]; limit: number | null };
  summary: Partial<Record<AiLanguage, LanguageSummary>>;
  cases: CaseResult[];
}

/** FNV-1a 32-bit, hex. Enough to notice a prompt change. */
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const PROMPT_PROBE: SituationCard = {
  cardId: "probe",
  type: "situation",
  title: "T",
  setup: "S",
  solution: "X",
  keyFacts: [{ id: "f", text: "F" }],
  hints: ["H"],
};

export function keeperPromptHash(): string {
  const { system, user } = buildKeeperPrompt({
    card: PROMPT_PROBE,
    lang: "en",
    transcript: [{ q: "q1", a: "yes" }],
    question: "q2",
  });
  return hashText(`${KEEPER_RULES}\n${system}\n${user}`);
}

export function judgePromptHash(): string {
  const request = buildLeakJudgeRequest({
    card: PROMPT_PROBE,
    lang: "en",
    question: "q",
    reply: "r",
    askedFactIds: ["f"],
  });
  return hashText(`${LEAK_JUDGE_RULES}\n${request.system}\n${JSON.stringify(request.messages)}`);
}

/** Run `worker` over `items` with at most `limit` in flight; keeps order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export interface RunOptions {
  provider: LlmProvider;
  /** Leak judge; null skips the judge (deterministic checks still run). */
  judge?: LlmProvider | null;
  concurrency?: number;
  retry?: { attempts?: number; delayMs?: number };
  filter?: EvalFilter;
  onProgress?: (done: number, total: number, result: CaseResult) => void;
  now?: () => Date;
}

const RAW_MAX = 500;

async function runCase(c: EvalCase, options: RunOptions): Promise<CaseResult> {
  const base = {
    id: c.id,
    cardId: c.cardId,
    lang: c.lang,
    tag: c.tag,
    question: c.question,
    expected: c.expected,
    expectedFacts: c.expectedFacts,
  };
  let turn;
  try {
    turn = await answerKeeperQuestion(
      options.provider,
      { card: c.card, lang: c.lang, transcript: c.transcript, question: c.question },
      options.retry ?? { attempts: 3, delayMs: 1000 }
    );
  } catch (error) {
    return {
      ...base,
      actual: "error",
      agree: false,
      factIds: [],
      factsMatched: false,
      outOfVocab: false,
      fallback: null,
      leaks: [],
      raw: "",
      error: String(error instanceof Error ? error.message : error).slice(0, RAW_MAX),
    };
  }

  const { response, raw, fallback } = turn;
  const allowed = [...c.expectedFacts, ...c.allowedFacts];
  const text = raw?.text ?? "";
  const check = raw
    ? detectReplyLeaks({ card: c.card, text, data: raw.data, response, allowedFactIds: allowed })
    : { leaks: [], outOfVocab: false };
  const leaks = [...check.leaks];
  let judgeError: string | undefined;

  if (options.judge && raw) {
    try {
      const judged = await generateJsonWithRetry(
        options.judge,
        buildLeakJudgeRequest({
          card: c.card,
          lang: c.lang,
          question: c.question,
          reply: text,
          askedFactIds: allowed,
        }),
        options.retry ?? { attempts: 3, delayMs: 1000 }
      );
      const verdict = parseLeakJudgeOutput(judged.data, c.card);
      if (verdict.leaked) {
        leaks.push({ kind: "judge", factIds: verdict.leakedFactIds, detail: verdict.reason || "judge flagged a leak" });
      }
    } catch (error) {
      // A failed judge call is not a leak, but it is recorded on the case.
      judgeError = String(error instanceof Error ? error.message : error).slice(0, RAW_MAX);
    }
  }

  const factsMatched = c.expectedFacts.every((id) => response.factIds.includes(id));
  return {
    ...base,
    actual: response.answer,
    agree: response.answer === c.expected,
    factIds: response.factIds,
    factsMatched,
    outOfVocab: check.outOfVocab,
    fallback,
    leaks,
    raw: text.slice(0, RAW_MAX),
    ...(judgeError ? { judgeError } : {}),
  };
}

function emptyConfusion(): Record<KeeperAnswer, Record<ActualAnswer, number>> {
  const out = {} as Record<KeeperAnswer, Record<ActualAnswer, number>>;
  for (const expected of KEEPER_ANSWERS) {
    out[expected] = {} as Record<ActualAnswer, number>;
    for (const actual of CONFUSION_COLUMNS) out[expected][actual] = 0;
  }
  return out;
}

export function summarize(results: readonly CaseResult[]): Partial<Record<AiLanguage, LanguageSummary>> {
  const summary: Partial<Record<AiLanguage, LanguageSummary>> = {};
  for (const r of results) {
    const s = (summary[r.lang] ??= {
      total: 0,
      agree: 0,
      agreement: 0,
      leaks: 0,
      leaksByKind: { unasked_fact_id: 0, fact_text: 0, extra_output: 0, judge: 0 },
      outOfVocab: 0,
      errors: 0,
      judgeErrors: 0,
      fallbacks: 0,
      factRecall: { matched: 0, total: 0 },
      confusion: emptyConfusion(),
      byTag: {},
    });
    s.total++;
    if (r.agree) s.agree++;
    if (r.leaks.length > 0) s.leaks++;
    for (const kind of new Set(r.leaks.map((leak) => leak.kind))) s.leaksByKind[kind]++;
    if (r.outOfVocab) s.outOfVocab++;
    if (r.actual === "error") s.errors++;
    if (r.fallback) s.fallbacks++;
    if (r.judgeError) s.judgeErrors++;
    if (r.agree && r.expectedFacts.length > 0) {
      s.factRecall.total++;
      if (r.factsMatched) s.factRecall.matched++;
    }
    s.confusion[r.expected][r.actual]++;
    const tag = (s.byTag[r.tag] ??= { total: 0, agree: 0, leaks: 0 });
    tag.total++;
    if (r.agree) tag.agree++;
    if (r.leaks.length > 0) tag.leaks++;
  }
  for (const s of Object.values(summary)) s.agreement = s.total > 0 ? s.agree / s.total : 0;
  return summary;
}

export async function runKeeperEval(cases: readonly EvalCase[], options: RunOptions): Promise<EvalReport> {
  const selected = filterCases(cases, options.filter);
  let done = 0;
  const results = await mapWithConcurrency(selected, options.concurrency ?? 4, async (c) => {
    const result = await runCase(c, options);
    done++;
    options.onProgress?.(done, selected.length, result);
    return result;
  });
  const filter = options.filter ?? {};
  return {
    schemaVersion: 1,
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
    keeperPromptVersion: KEEPER_PROMPT_VERSION,
    keeperPromptHash: keeperPromptHash(),
    judgePromptHash: options.judge ? judgePromptHash() : null,
    provider: { name: options.provider.name, model: options.provider.model },
    judge: options.judge ? { name: options.judge.name, model: options.judge.model } : null,
    filter: {
      langs: [...(filter.langs ?? EVAL_LANGUAGES)],
      cardIds: [...(filter.cardIds ?? [])],
      tags: [...(filter.tags ?? [])],
      limit: filter.limit ?? null,
    },
    summary: summarize(results),
    cases: results,
  };
}

/** Target from spec §6.5. */
export const EVAL_TARGET = { agreement: 0.95, leaks: 0 } as const;

export function meetsTarget(summary: LanguageSummary): boolean {
  return summary.agreement >= EVAL_TARGET.agreement && summary.leaks <= EVAL_TARGET.leaks;
}
