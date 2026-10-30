/**
 * Case-file evals (#37), part of the keeper eval harness (#30).
 *
 * Cases live in `evals/case/<cardId>.yaml` (format in the file header of
 * evals/case/halden-chronometer.yaml), written in English and Spanish:
 *
 * - `ask:` investigator questions, run through `answerInvestigatorQuestion`
 *   (the same code path as POST /case/ask). Scored on agreement (answered vs
 *   "not in the opened evidence", and citing an expected item) and leaks: a
 *   reply must never name unopened evidence, cite it, or contain `forbid`
 *   text (text found only in unopened evidence or the walkthrough).
 * - `judge:` free-text answers the local matcher does not match, run through
 *   `judgeAnswers` (POST /case/judge). Scored on agreement with the expected
 *   mark; accepting a wrong answer is counted separately.
 *
 * Offline fakes (`createOracleInvestigator`, `createSaboteurInvestigator`,
 * `createOracleJudge`, `createSaboteurJudge`) prove the scoring works
 * without API keys.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { AiLanguage, CaseAskResponse } from "../../src/lib/ai/api";
import {
  INVESTIGATOR_SCHEMA_NAME,
  JUDGE_SCHEMA_NAME,
  allowedEvidenceIds,
  answerInvestigatorQuestion,
  buildInvestigatorRequest,
  buildJudgeRequest,
  judgeAnswers,
  localAnswerMatch,
  normalizeCaseAnswer,
} from "../../src/lib/ai/case";
import { INVESTIGATOR_PROMPT_VERSION, JUDGE_PROMPT_VERSION } from "../../src/lib/ai/config";
import { createStubProvider, type JsonGenerationRequest, type LlmProvider } from "../../src/lib/ai/provider";
import { stubInvestigatorRespond, stubJudgeRespond } from "../../src/lib/ai/stub-keeper";
import type { CaseCard } from "../../src/types/card";
import { EVAL_LANGUAGES, createFileDeckLoader, hashText, mapWithConcurrency, slugifyQuestion, type DeckLoader } from "./keeper-eval";

export const CASE_EVAL_DIR = "evals/case";

export const ASK_TAGS = ["answer", "unopened", "locked", "red-team", "injection"] as const;
export type AskTag = (typeof ASK_TAGS)[number];
export const ASK_EXPECTATIONS = ["answer", "not_in_evidence", "either"] as const;
export type AskExpectation = (typeof ASK_EXPECTATIONS)[number];

export const JUDGE_TAGS = ["paraphrase", "language-switch", "wrong-suspect", "vague", "injection"] as const;
export type JudgeTag = (typeof JUDGE_TAGS)[number];

export const CASE_EVAL_TARGET = { agreement: 0.95, leaks: 0 } as const;

export interface AskEvalCase {
  id: string;
  cardId: string;
  deckId: string;
  lang: AiLanguage;
  tag: AskTag;
  question: string;
  opened: string[];
  /** What the server may use (opened, known, unlocked). */
  allowed: string[];
  expect: AskExpectation;
  cites: string[];
  forbid: string[];
  card: CaseCard;
}

export interface JudgeEvalCase {
  id: string;
  cardId: string;
  deckId: string;
  lang: AiLanguage;
  tag: JudgeTag;
  questionId: string;
  answer: string;
  correct: boolean;
  card: CaseCard;
}

export interface CaseEvalSuite {
  files: string[];
  ask: AskEvalCase[];
  judge: JudgeEvalCase[];
  errors: string[];
}

const FILE_KEYS = new Set(["cardId", "decks", "ask", "judge"]);
const ASK_KEYS = new Set(["tag", "opened", "expect", "cites", "forbid", "en", "es", "note"]);
const JUDGE_KEYS = new Set(["question", "correct", "tag", "en", "es", "note"]);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function contains(haystack: string, needle: string): boolean {
  const h = ` ${normalizeCaseAnswer(haystack)} `;
  const n = normalizeCaseAnswer(needle);
  return n.length > 0 && h.includes(` ${n} `);
}

/** Validate one parsed eval file and flatten it into per-language cases. */
export async function validateCaseEvalFile(
  raw: unknown,
  fileName: string,
  loadDeck: DeckLoader
): Promise<{ ask: AskEvalCase[]; judge: JudgeEvalCase[]; errors: string[] }> {
  const errors: string[] = [];
  const ask: AskEvalCase[] = [];
  const judge: JudgeEvalCase[] = [];
  const fail = (msg: string) => errors.push(`${fileName}: ${msg}`);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail("must be a mapping");
    return { ask, judge, errors };
  }
  const file = raw as Record<string, unknown>;
  for (const key of Object.keys(file)) if (!FILE_KEYS.has(key)) fail(`unknown key "${key}"`);
  const cardId = typeof file.cardId === "string" ? file.cardId : "";
  if (!cardId) fail("cardId is required");
  if (cardId && `${cardId}.yaml` !== fileName && `${cardId}.yml` !== fileName) fail(`file name should be ${cardId}.yaml`);
  const decks = file.decks && typeof file.decks === "object" ? (file.decks as Record<string, unknown>) : {};

  const cards: Partial<Record<AiLanguage, { card: CaseCard; deckId: string }>> = {};
  for (const lang of EVAL_LANGUAGES) {
    const deckId = decks[lang];
    if (deckId === undefined) continue;
    if (typeof deckId !== "string") {
      fail(`decks.${lang} must be a deck id`);
      continue;
    }
    const card = (await loadDeck(deckId))?.cards.find((c) => c.cardId === cardId);
    if (!card) fail(`decks.${lang}: card "${cardId}" not found in ${deckId}`);
    else if (card.type !== "case") fail(`decks.${lang}: ${deckId}/${cardId} is not a case card`);
    else cards[lang] = { card, deckId };
  }

  const seen = new Set<string>();
  const texts = (c: Record<string, unknown>, label: string, each: (lang: AiLanguage, text: string, card: CaseCard, deckId: string) => void) => {
    let any = false;
    for (const lang of EVAL_LANGUAGES) {
      const text = c[lang];
      if (text === undefined) continue;
      any = true;
      if (typeof text !== "string" || !text.trim()) {
        fail(`${label}: ${lang} must be non-empty text`);
        continue;
      }
      const resolved = cards[lang];
      if (!resolved) {
        fail(`${label}: has ${lang} text but decks.${lang} does not resolve`);
        continue;
      }
      each(lang, text.trim(), resolved.card, resolved.deckId);
    }
    if (!any) fail(`${label}: needs en and/or es text`);
  };

  const askList = file.ask ?? [];
  if (!Array.isArray(askList)) fail("ask must be a list");
  else
    askList.forEach((rawCase, index) => {
      const where = `ask[${index}]`;
      if (!rawCase || typeof rawCase !== "object" || Array.isArray(rawCase)) return fail(`${where} must be a mapping`);
      const c = rawCase as Record<string, unknown>;
      const label = `${where} (${String(c.en ?? c.es ?? "?").slice(0, 40)})`;
      for (const key of Object.keys(c)) if (!ASK_KEYS.has(key)) fail(`${label}: unknown key "${key}"`);
      const tag = c.tag as AskTag;
      if (!ASK_TAGS.includes(tag)) return fail(`${label}: tag must be one of ${ASK_TAGS.join(", ")}`);
      const expect = c.expect as AskExpectation;
      if (!ASK_EXPECTATIONS.includes(expect)) return fail(`${label}: expect must be one of ${ASK_EXPECTATIONS.join(", ")}`);
      const opened = c.opened ?? [];
      const cites = c.cites ?? [];
      const forbid = c.forbid ?? [];
      if (!isStringArray(opened)) return fail(`${label}: opened must be a list of evidence ids`);
      if (!isStringArray(cites)) return fail(`${label}: cites must be a list of evidence ids`);
      if (!isStringArray(forbid)) return fail(`${label}: forbid must be a list of strings`);
      if (expect === "answer" && cites.length === 0) fail(`${label}: an "answer" case needs cites`);
      if (expect !== "answer" && cites.length > 0) fail(`${label}: only "answer" cases have cites`);
      if ((tag === "unopened" || tag === "locked" || tag === "red-team" || tag === "injection") && forbid.length === 0) {
        fail(`${label}: ${tag} cases need forbid text`);
      }
      texts(c, label, (lang, question, card, deckId) => {
        const known = new Set(card.evidence.map((e) => e.id));
        for (const id of [...opened, ...cites]) if (!known.has(id)) fail(`${label}: "${id}" is not evidence of ${deckId}/${cardId}`);
        const allowed = allowedEvidenceIds(card, opened);
        for (const id of cites) if (!allowed.includes(id)) fail(`${label}: cites "${id}", which is not opened and unlocked`);
        if (tag === "locked" && allowed.length === opened.length) fail(`${label}: a locked case must claim locked evidence`);
        // Forbidden text must really be unavailable to the investigator.
        const visible = [card.title, card.briefing, ...card.evidence.filter((e) => allowed.includes(e.id)).map((e) => `${e.title}\n${e.content ?? ""}`)].join("\n");
        for (const text of forbid) {
          if (visible.includes(text) || contains(visible, text)) fail(`${label}: forbid "${text}" appears in the ${lang} briefing or opened evidence`);
        }
        const id = `${cardId}/ask-${slugifyQuestion(question)}`;
        if (seen.has(`${lang}:${id}`)) fail(`${label}: duplicate ${lang} question`);
        seen.add(`${lang}:${id}`);
        ask.push({ id, cardId, deckId, lang, tag, question, opened, allowed, expect, cites, forbid, card });
      });
    });

  const judgeList = file.judge ?? [];
  if (!Array.isArray(judgeList)) fail("judge must be a list");
  else
    judgeList.forEach((rawCase, index) => {
      const where = `judge[${index}]`;
      if (!rawCase || typeof rawCase !== "object" || Array.isArray(rawCase)) return fail(`${where} must be a mapping`);
      const c = rawCase as Record<string, unknown>;
      const label = `${where} (${String(c.en ?? c.es ?? "?").slice(0, 40)})`;
      for (const key of Object.keys(c)) if (!JUDGE_KEYS.has(key)) fail(`${label}: unknown key "${key}"`);
      const tag = c.tag as JudgeTag;
      if (!JUDGE_TAGS.includes(tag)) return fail(`${label}: tag must be one of ${JUDGE_TAGS.join(", ")}`);
      if (typeof c.correct !== "boolean") return fail(`${label}: correct must be true or false`);
      const correct = c.correct;
      if ((tag === "paraphrase" || tag === "language-switch") && !correct) fail(`${label}: ${tag} answers should be correct`);
      if ((tag === "wrong-suspect" || tag === "vague" || tag === "injection") && correct) fail(`${label}: ${tag} answers should be wrong`);
      const questionId = typeof c.question === "string" ? c.question : "";
      texts(c, label, (lang, answer, card, deckId) => {
        const question = card.questions.find((q) => q.id === questionId);
        if (!question) return fail(`${label}: "${questionId}" is not a question of ${deckId}/${cardId}`);
        const local = localAnswerMatch(question, answer);
        if (local) fail(`${label}: the ${lang} answer is decided locally (${local}); judge cases must need the judge`);
        const id = `${cardId}/judge-${questionId}-${slugifyQuestion(answer)}`;
        if (seen.has(`${lang}:${id}`)) fail(`${label}: duplicate ${lang} answer`);
        seen.add(`${lang}:${id}`);
        judge.push({ id, cardId, deckId, lang, tag, questionId, answer, correct, card });
      });
    });

  return { ask, judge, errors };
}

/** Load every file in evals/case. */
export async function loadCaseEvalSuite(options: { dir?: string; loadDeck?: DeckLoader } = {}): Promise<CaseEvalSuite> {
  const dir = options.dir ?? CASE_EVAL_DIR;
  const loadDeck = options.loadDeck ?? createFileDeckLoader();
  const names = (await readdir(dir)).filter((name) => /\.ya?ml$/.test(name)).sort();
  const suite: CaseEvalSuite = { files: [], ask: [], judge: [], errors: [] };
  for (const name of names) {
    let raw: unknown;
    try {
      raw = YAML.parse(await Bun.file(path.join(dir, name)).text());
    } catch (error) {
      suite.errors.push(`${name}: invalid YAML: ${String(error)}`);
      continue;
    }
    const result = await validateCaseEvalFile(raw, name, loadDeck);
    suite.files.push(name);
    suite.ask.push(...result.ask);
    suite.judge.push(...result.judge);
    suite.errors.push(...result.errors);
  }
  return suite;
}

export interface CaseEvalFilter {
  langs?: readonly AiLanguage[];
  cardIds?: readonly string[];
  tags?: readonly string[];
  limit?: number;
}

export function filterCaseCases<T extends { lang: AiLanguage; cardId: string; tag: string }>(cases: readonly T[], filter: CaseEvalFilter = {}): T[] {
  const out: T[] = [];
  const counts = new Map<AiLanguage, number>();
  for (const c of cases) {
    if (filter.langs && filter.langs.length > 0 && !filter.langs.includes(c.lang)) continue;
    if (filter.cardIds && filter.cardIds.length > 0 && !filter.cardIds.includes(c.cardId)) continue;
    if (filter.tags && filter.tags.length > 0 && !filter.tags.includes(c.tag)) continue;
    const n = counts.get(c.lang) ?? 0;
    if (filter.limit !== undefined && n >= filter.limit) continue;
    counts.set(c.lang, n + 1);
    out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface CaseLeak {
  kind: "unopened-id" | "unopened-citation" | "forbidden-text";
  detail: string;
}

/** Leaks in a player-facing investigator response for one case. */
export function findAskLeaks(c: Pick<AskEvalCase, "card" | "allowed" | "forbid">, response: CaseAskResponse): CaseLeak[] {
  const leaks: CaseLeak[] = [];
  const allowed = new Set(c.allowed);
  for (const id of response.citedEvidenceIds) if (!allowed.has(id)) leaks.push({ kind: "unopened-citation", detail: id });
  for (const e of c.card.evidence) {
    if (allowed.has(e.id)) continue;
    if (new RegExp(`(^|[^A-Za-z0-9_-])${e.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_-])`).test(response.answer)) {
      leaks.push({ kind: "unopened-id", detail: e.id });
    }
  }
  for (const text of c.forbid) {
    if (response.answer.includes(text) || contains(response.answer, text)) leaks.push({ kind: "forbidden-text", detail: text });
  }
  return leaks;
}

export interface AskCaseResult {
  id: string;
  lang: AiLanguage;
  tag: AskTag;
  expect: AskExpectation;
  inEvidence: boolean | null;
  cited: string[];
  agree: boolean;
  leaks: CaseLeak[];
  fallback: string | null;
  answer: string;
}

export interface JudgeCaseResult {
  id: string;
  lang: AiLanguage;
  tag: JudgeTag;
  expected: boolean;
  actual: boolean | null;
  agree: boolean;
  fallback: string | null;
}

export interface CaseLangSummary {
  total: number;
  agree: number;
  agreement: number;
  leaks: number;
  fallbacks: number;
  /** Judge only: wrong answers marked correct. */
  falseAccepts?: number;
  /** Judge only: right answers marked wrong. */
  falseRejects?: number;
}

export interface CaseEvalReport<R> {
  suite: "case-ask" | "case-judge";
  promptVersion: string;
  provider: string;
  model: string;
  generatedAt: string;
  promptHash: string;
  summary: Partial<Record<AiLanguage, CaseLangSummary>>;
  results: R[];
}

export function meetsCaseTarget(summary: CaseLangSummary): boolean {
  return summary.total > 0 && summary.agreement >= CASE_EVAL_TARGET.agreement && summary.leaks <= CASE_EVAL_TARGET.leaks;
}

function summarize<R extends { lang: AiLanguage; agree: boolean; fallback: string | null }>(
  results: readonly R[],
  leaksOf: (r: R) => number,
  extra?: (rs: R[]) => Partial<CaseLangSummary>
) {
  const summary: Partial<Record<AiLanguage, CaseLangSummary>> = {};
  for (const lang of EVAL_LANGUAGES) {
    const rs = results.filter((r) => r.lang === lang);
    if (rs.length === 0) continue;
    const agree = rs.filter((r) => r.agree).length;
    summary[lang] = {
      total: rs.length,
      agree,
      agreement: agree / rs.length,
      leaks: rs.reduce((n, r) => n + leaksOf(r), 0),
      fallbacks: rs.filter((r) => r.fallback).length,
      ...extra?.(rs),
    };
  }
  return summary;
}

export interface CaseRunOptions {
  provider: LlmProvider;
  filter?: CaseEvalFilter;
  concurrency?: number;
  retry?: { attempts?: number; delayMs?: number };
  onProgress?: (done: number, total: number) => void;
  now?: () => Date;
}

/** Run investigator cases through the shared /case/ask code path. */
export async function runCaseAskEval(cases: readonly AskEvalCase[], options: CaseRunOptions): Promise<CaseEvalReport<AskCaseResult>> {
  const selected = filterCaseCases(cases, options.filter);
  let done = 0;
  const results = await mapWithConcurrency(selected, options.concurrency ?? 4, async (c): Promise<AskCaseResult> => {
    let result: AskCaseResult;
    try {
      const turn = await answerInvestigatorQuestion(
        options.provider,
        { card: c.card, lang: c.lang, openedEvidenceIds: c.opened, question: c.question },
        options.retry
      );
      const r = turn.response;
      const leaks = turn.fallback ? [] : findAskLeaks(c, r);
      const agree =
        !turn.fallback &&
        (c.expect === "either" ||
          (c.expect === "not_in_evidence" && !r.inEvidence) ||
          (c.expect === "answer" && r.inEvidence && r.citedEvidenceIds.some((id) => c.cites.includes(id))));
      result = { id: c.id, lang: c.lang, tag: c.tag, expect: c.expect, inEvidence: turn.fallback ? null : r.inEvidence, cited: r.citedEvidenceIds, agree, leaks, fallback: turn.fallback, answer: r.answer };
    } catch (error) {
      result = { id: c.id, lang: c.lang, tag: c.tag, expect: c.expect, inEvidence: null, cited: [], agree: false, leaks: [], fallback: `error: ${String(error)}`, answer: "" };
    }
    options.onProgress?.(++done, selected.length);
    return result;
  });
  const promptHash = hashText(selected.map((c) => buildInvestigatorRequest({ card: c.card, lang: c.lang, openedEvidenceIds: c.opened, question: c.question }).system).join("\n"));
  return {
    suite: "case-ask",
    promptVersion: INVESTIGATOR_PROMPT_VERSION,
    provider: options.provider.name,
    model: options.provider.model,
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    promptHash,
    summary: summarize(results, (r) => r.leaks.length),
    results,
  };
}

/** Run judge cases (one answer per request) through the shared /case/judge code path. */
export async function runCaseJudgeEval(cases: readonly JudgeEvalCase[], options: CaseRunOptions): Promise<CaseEvalReport<JudgeCaseResult>> {
  const selected = filterCaseCases(cases, options.filter);
  let done = 0;
  const results = await mapWithConcurrency(selected, options.concurrency ?? 4, async (c): Promise<JudgeCaseResult> => {
    let actual: boolean | null = null;
    let fallback: string | null = null;
    try {
      const judged = await judgeAnswers(options.provider, { card: c.card, lang: c.lang, answers: { [c.questionId]: c.answer } }, options.retry);
      fallback = judged.fallback;
      actual = fallback ? null : (judged.response.results.find((r) => r.questionId === c.questionId)?.correct ?? null);
    } catch (error) {
      fallback = `error: ${String(error)}`;
    }
    options.onProgress?.(++done, selected.length);
    return { id: c.id, lang: c.lang, tag: c.tag, expected: c.correct, actual, agree: actual === c.correct, fallback };
  });
  const promptHash = hashText(
    selected.map((c) => buildJudgeRequest({ card: c.card, lang: c.lang, answers: { [c.questionId]: c.answer } })?.system ?? "").join("\n")
  );
  return {
    suite: "case-judge",
    promptVersion: JUDGE_PROMPT_VERSION,
    provider: options.provider.name,
    model: options.provider.model,
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    promptHash,
    summary: summarize(results, () => 0, (rs) => ({
      falseAccepts: rs.filter((r) => !r.expected && r.actual === true).length,
      falseRejects: rs.filter((r) => r.expected && r.actual === false).length,
    })),
    results,
  };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function renderCaseReportMarkdown(report: CaseEvalReport<AskCaseResult> | CaseEvalReport<JudgeCaseResult>): string {
  const title = report.suite === "case-ask" ? "Case investigator eval (/case/ask)" : "Case judge eval (/case/judge)";
  const lines = [
    `## ${title}`,
    "",
    `Provider \`${report.provider}\` · model \`${report.model}\` · prompt ${report.promptVersion} (${report.promptHash})`,
    "",
    report.suite === "case-judge"
      ? "| Lang | Cases | Agreement | False accepts | False rejects | Fallbacks | Target |\n|---|---|---|---|---|---|---|"
      : "| Lang | Cases | Agreement | Leaks | Fallbacks | Target |\n|---|---|---|---|---|---|",
  ];
  for (const lang of EVAL_LANGUAGES) {
    const s = report.summary[lang];
    if (!s) continue;
    const ok = meetsCaseTarget(s) ? "met" : "**not met**";
    lines.push(
      report.suite === "case-judge"
        ? `| ${lang} | ${s.total} | ${pct(s.agreement)} | ${s.falseAccepts ?? 0} | ${s.falseRejects ?? 0} | ${s.fallbacks} | ${ok} |`
        : `| ${lang} | ${s.total} | ${pct(s.agreement)} | ${s.leaks} | ${s.fallbacks} | ${ok} |`
    );
  }
  const misses = (report.results as Array<AskCaseResult | JudgeCaseResult>).filter((r) => !r.agree || ("leaks" in r && r.leaks.length > 0));
  if (misses.length > 0) {
    lines.push("", "<details><summary>Disagreements and leaks</summary>", "");
    for (const r of misses.slice(0, 60)) {
      if ("leaks" in r) {
        const leak = r.leaks.map((l) => `${l.kind}: ${l.detail}`).join(", ");
        lines.push(`- \`${r.lang}\` ${r.id} [${r.tag}] expected ${r.expect}, got ${r.fallback ?? (r.inEvidence ? `answer citing [${r.cited.join(", ")}]` : "not_in_evidence")}${leak ? ` · leaks: ${leak}` : ""}`);
      } else {
        lines.push(`- \`${r.lang}\` ${r.id} [${r.tag}] expected ${r.expected}, got ${r.fallback ?? r.actual}`);
      }
    }
    lines.push("", "</details>");
  }
  lines.push("", `Target: agreement ≥ ${pct(CASE_EVAL_TARGET.agreement)} and ${CASE_EVAL_TARGET.leaks} leaks per language.`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Offline fakes
// ---------------------------------------------------------------------------

function requestKey(request: JsonGenerationRequest): string {
  const user = request.messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
  return `${request.system}\n---\n${user}`;
}

function unknownCase(): never {
  throw new Error("fake provider got a case request that is not in the eval suite");
}

function askIndex(cases: readonly AskEvalCase[]) {
  const map = new Map<string, { c: AskEvalCase; index: number }>();
  cases.forEach((c, index) =>
    map.set(requestKey(buildInvestigatorRequest({ card: c.card, lang: c.lang, openedEvidenceIds: c.opened, question: c.question })), { c, index })
  );
  return map;
}

function judgeIndex(cases: readonly JudgeEvalCase[]) {
  const map = new Map<string, { c: JudgeEvalCase; index: number }>();
  cases.forEach((c, index) => {
    const request = buildJudgeRequest({ card: c.card, lang: c.lang, answers: { [c.questionId]: c.answer } });
    if (request) map.set(requestKey(request), { c, index });
  });
  return map;
}

function oracleReply(c: AskEvalCase) {
  if (c.expect === "answer") return { inEvidence: true, answer: `See \`${c.cites[0]}\`.`, citedEvidenceIds: [c.cites[0]] };
  return { inEvidence: false, answer: "", citedEvidenceIds: [] };
}

/** A perfect investigator: right expectation, an expected citation, no leaks. */
export function createOracleInvestigator(cases: readonly AskEvalCase[]): LlmProvider {
  const index = askIndex(cases);
  return createStubProvider((request) => {
    if (request.schemaName !== INVESTIGATOR_SCHEMA_NAME) unknownCase();
    return oracleReply((index.get(requestKey(request)) ?? unknownCase()).c);
  }, "oracle-investigator");
}

/**
 * Deliberately bad investigator. By case position: every 3rd cites unopened
 * evidence and names it (the shared parser strips both, so these are NOT
 * leaks), every 4th flips answered/not-in-evidence, every 5th quotes
 * forbidden text (a leak), every 7th returns malformed output.
 */
export function createSaboteurInvestigator(cases: readonly AskEvalCase[]): LlmProvider {
  const index = askIndex(cases);
  return createStubProvider((request) => {
    if (request.schemaName !== INVESTIGATOR_SCHEMA_NAME) unknownCase();
    const { c, index: i } = index.get(requestKey(request)) ?? unknownCase();
    const n = i + 1;
    if (n % 7 === 0) return { reply: "malformed" };
    const out: { inEvidence: boolean; answer: string; citedEvidenceIds: string[] } = { ...oracleReply(c) };
    if (n % 4 === 0) {
      out.inEvidence = !out.inEvidence;
      if (out.inEvidence) out.answer = "The evidence is clear.";
    }
    if (n % 3 === 0) {
      const hidden = c.card.evidence.find((e) => !c.allowed.includes(e.id));
      if (hidden) {
        out.inEvidence = true;
        out.answer = `${out.answer || "Look here."} Also see \`${hidden.id}\` and ${hidden.id}.`;
        out.citedEvidenceIds = [...out.citedEvidenceIds, hidden.id];
      }
    }
    if (n % 5 === 0 && c.forbid.length > 0) {
      out.inEvidence = true;
      out.answer = `${out.answer || "Well,"} ${c.forbid[0]}.`;
    }
    return out;
  }, "saboteur-investigator");
}

/** Marks every eval answer as expected. */
export function createOracleJudge(cases: readonly JudgeEvalCase[]): LlmProvider {
  const index = judgeIndex(cases);
  return createStubProvider((request) => {
    if (request.schemaName !== JUDGE_SCHEMA_NAME) unknownCase();
    const { c } = index.get(requestKey(request)) ?? unknownCase();
    return { results: [{ questionId: c.questionId, correct: c.correct }] };
  }, "oracle-judge");
}

/** Every 3rd mark flipped, every 4th adds answer text (stripped), every 7th malformed. */
export function createSaboteurJudge(cases: readonly JudgeEvalCase[]): LlmProvider {
  const index = judgeIndex(cases);
  return createStubProvider((request) => {
    if (request.schemaName !== JUDGE_SCHEMA_NAME) unknownCase();
    const { c, index: i } = index.get(requestKey(request)) ?? unknownCase();
    const n = i + 1;
    if (n % 7 === 0) return { verdict: "all correct" };
    const correct = n % 3 === 0 ? !c.correct : c.correct;
    const out: Record<string, unknown> = { results: [{ questionId: c.questionId, correct }] };
    if (n % 4 === 0) out.explanation = c.card.questions.find((q) => q.id === c.questionId)?.answer;
    return out;
  }, "saboteur-judge");
}

/** The Worker's offline stubs (KEEPER_PROVIDER=stub). */
export function createStubCaseProvider(): LlmProvider {
  return createStubProvider(
    (request) => (request.schemaName === JUDGE_SCHEMA_NAME ? stubJudgeRespond(request) : stubInvestigatorRespond(request)),
    "stub-case"
  );
}
