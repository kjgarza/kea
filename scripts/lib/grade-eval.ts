/**
 * Theory-grading evals (issue #32), part of the keeper eval harness (#30).
 *
 * Grading cases live next to the keeper cases, under `theories:` in
 * `evals/keeper/<cardId>.yaml`, each written in English and Spanish:
 *
 *   theories:
 *     - { verdict: close, tag: partial, facts: [poison-in-ice, ice-melted-slowly],
 *         en: "The poison was frozen in the ice…", es: "El veneno estaba congelado…" }
 *
 * `facts` are the key facts the theory states correctly; `verdict` must be
 * what the shared rules (`verdictFor` in src/lib/ai/grade.ts) give for that
 * many facts, so the file cannot disagree with the grader's rules.
 *
 * Every case runs through `gradeTheory`, the same code path as the Worker,
 * and is scored on verdict agreement, exact fact agreement, and leaks: the
 * player-facing response must never name a missing fact (`findGradeLeaks`).
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { AiLanguage, KeeperGradeResponse, TheoryVerdict } from "../../src/lib/ai/api";
import { GRADER_PROMPT_VERSION } from "../../src/lib/ai/config";
import {
  GRADER_RULES,
  GRADE_THRESHOLDS,
  THEORY_VERDICTS,
  buildGradePrompt,
  findGradeLeaks,
  gradeTheory,
  isTheoryVerdict,
  verdictFor,
  type GradeLeak,
} from "../../src/lib/ai/grade";
import type { LlmProvider } from "../../src/lib/ai/provider";
import type { SituationCard } from "../../src/types/card";
import {
  EVAL_DIR,
  EVAL_LANGUAGES,
  createFileDeckLoader,
  hashText,
  mapWithConcurrency,
  slugifyQuestion,
  type DeckLoader,
} from "./keeper-eval";

/** `full`/`paraphrase` cover every fact; `wrong`/`injection` cover none. */
export const THEORY_TAGS = ["full", "partial", "wrong", "paraphrase", "language-switch", "injection"] as const;
export type TheoryTag = (typeof THEORY_TAGS)[number];

export interface GradeEvalCase {
  /** `<cardId>/theory-<slug>`; unique per language. */
  id: string;
  cardId: string;
  deckId: string;
  lang: AiLanguage;
  tag: TheoryTag;
  theory: string;
  expectedFacts: string[];
  expectedVerdict: TheoryVerdict;
  card: SituationCard;
}

const THEORY_KEYS = new Set(["verdict", "facts", "tag", "en", "es", "note"]);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export interface GradeFileResult {
  cases: GradeEvalCase[];
  errors: string[];
}

/**
 * Validate the `theories` of one parsed eval file and flatten them into
 * per-language cases. Files without `theories` yield nothing. Deck problems
 * are reported by the keeper validator; here they only skip the language.
 */
export async function validateTheoryCases(raw: unknown, fileName: string, loadDeck: DeckLoader): Promise<GradeFileResult> {
  const errors: string[] = [];
  const cases: GradeEvalCase[] = [];
  const fail = (msg: string) => errors.push(`${fileName}: ${msg}`);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { cases, errors };
  const file = raw as Record<string, unknown>;
  if (file.theories === undefined) return { cases, errors };
  if (!Array.isArray(file.theories) || file.theories.length === 0) {
    fail("theories must be a non-empty list");
    return { cases, errors };
  }
  const cardId = typeof file.cardId === "string" ? file.cardId : "";
  const decks = file.decks && typeof file.decks === "object" ? (file.decks as Record<string, unknown>) : {};

  const cards: Partial<Record<AiLanguage, { card: SituationCard; deckId: string }>> = {};
  for (const lang of EVAL_LANGUAGES) {
    const deckId = decks[lang];
    if (typeof deckId !== "string") continue;
    const card = (await loadDeck(deckId))?.cards.find((c) => c.cardId === cardId);
    if (card?.type === "situation") cards[lang] = { card, deckId };
  }

  const seen = new Set<string>();
  file.theories.forEach((rawCase, index) => {
    const where = `theories[${index}]`;
    if (!rawCase || typeof rawCase !== "object" || Array.isArray(rawCase)) {
      fail(`${where} must be a mapping`);
      return;
    }
    const c = rawCase as Record<string, unknown>;
    const label = `${where} (${String(c.en ?? c.es ?? "?").slice(0, 40)})`;
    for (const key of Object.keys(c)) if (!THEORY_KEYS.has(key)) fail(`${label}: unknown key "${key}"`);
    if (!isTheoryVerdict(c.verdict)) {
      fail(`${label}: verdict must be one of ${THEORY_VERDICTS.join(", ")}`);
      return;
    }
    const verdict = c.verdict;
    const tag = c.tag as TheoryTag;
    if (!THEORY_TAGS.includes(tag)) {
      fail(`${label}: tag must be one of ${THEORY_TAGS.join(", ")}`);
      return;
    }
    const facts = c.facts ?? [];
    if (!isStringArray(facts)) {
      fail(`${label}: facts must be a list of fact ids`);
      return;
    }
    if (new Set(facts).size !== facts.length) fail(`${label}: facts has duplicates`);
    if ((tag === "wrong" || tag === "injection") && facts.length > 0) fail(`${label}: ${tag} theories cover no facts`);
    if (c.note !== undefined && typeof c.note !== "string") fail(`${label}: note must be text`);

    let hasLanguage = false;
    for (const lang of EVAL_LANGUAGES) {
      const theory = c[lang];
      if (theory === undefined) continue;
      hasLanguage = true;
      if (typeof theory !== "string" || !theory.trim()) {
        fail(`${label}: ${lang} must be non-empty text`);
        continue;
      }
      const resolved = cards[lang];
      if (!resolved) {
        fail(`${label}: has ${lang} text but decks.${lang} does not resolve to card "${cardId}"`);
        continue;
      }
      const known = resolved.card.keyFacts.map((fact) => fact.id);
      for (const id of facts) {
        if (!known.includes(id)) fail(`${label}: fact "${id}" is not a key fact of ${resolved.deckId}/${cardId}`);
      }
      const expected = verdictFor(facts.length, known.length);
      if (expected !== verdict) {
        fail(`${label}: ${facts.length}/${known.length} facts is "${expected}" under the grading rules, not "${verdict}"`);
      }
      if ((tag === "full" || tag === "paraphrase") && verdict !== "solved") {
        fail(`${label}: ${tag} theories should cover every key fact`);
      }
      const id = `${cardId}/theory-${slugifyQuestion(theory)}`;
      if (seen.has(`${lang}:${id}`)) fail(`${label}: duplicate ${lang} theory`);
      seen.add(`${lang}:${id}`);
      cases.push({
        id,
        cardId,
        deckId: resolved.deckId,
        lang,
        tag,
        theory: theory.trim(),
        // Card order, like the grader's response.
        expectedFacts: known.filter((factId) => facts.includes(factId)),
        expectedVerdict: verdict,
        card: resolved.card,
      });
    }
    if (!hasLanguage) fail(`${label}: needs en and/or es text`);
  });
  return { cases, errors };
}

export interface GradeSuite {
  files: string[];
  cases: GradeEvalCase[];
  errors: string[];
}

/** Load the `theories` of every eval file. */
export async function loadGradeSuite(options: { dir?: string; loadDeck?: DeckLoader } = {}): Promise<GradeSuite> {
  const dir = options.dir ?? EVAL_DIR;
  const loadDeck = options.loadDeck ?? createFileDeckLoader();
  const names = (await readdir(dir)).filter((name) => /\.ya?ml$/.test(name)).sort();
  const files: string[] = [];
  const cases: GradeEvalCase[] = [];
  const errors: string[] = [];
  for (const name of names) {
    let raw: unknown;
    try {
      raw = YAML.parse(await Bun.file(path.join(dir, name)).text());
    } catch (error) {
      errors.push(`${name}: invalid YAML: ${String(error)}`);
      continue;
    }
    const result = await validateTheoryCases(raw, name, loadDeck);
    if (result.cases.length > 0) files.push(name);
    cases.push(...result.cases);
    errors.push(...result.errors);
  }
  return { files, cases, errors };
}

export interface GradeEvalFilter {
  langs?: readonly AiLanguage[];
  cardIds?: readonly string[];
  tags?: readonly TheoryTag[];
  /** Max cases per language, after the other filters. */
  limit?: number;
}

export function filterGradeCases(cases: readonly GradeEvalCase[], filter: GradeEvalFilter = {}): GradeEvalCase[] {
  const out: GradeEvalCase[] = [];
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

export type ActualVerdict = TheoryVerdict | "error";
export const VERDICT_COLUMNS: readonly ActualVerdict[] = [...THEORY_VERDICTS, "error"];

export interface GradeCaseResult {
  id: string;
  cardId: string;
  lang: AiLanguage;
  tag: TheoryTag;
  theory: string;
  expectedVerdict: TheoryVerdict;
  actualVerdict: ActualVerdict;
  verdictAgree: boolean;
  expectedFacts: string[];
  correctFactIds: string[];
  /** The grader marked exactly the expected facts. */
  factsExact: boolean;
  missingCount: number | null;
  /** Missing facts the player-facing response would give away. */
  leaks: GradeLeak[];
  /** No usable output (declined/truncated/malformed); counted as a disagreement. */
  fallback: string | null;
  /** HTTP error from the provider; counted as a disagreement. */
  error?: string;
}

export interface GradeLanguageSummary {
  total: number;
  verdictAgree: number;
  verdictAgreement: number;
  factsExact: number;
  factAgreement: number;
  /** Cases whose response would reveal a missing fact. Target: 0. */
  leaks: number;
  errors: number;
  fallbacks: number;
  /** expected verdict -> actual verdict -> count */
  confusion: Record<TheoryVerdict, Record<ActualVerdict, number>>;
  byTag: Partial<Record<TheoryTag, { total: number; agree: number; leaks: number }>>;
}

export interface GradeEvalReport {
  schemaVersion: 1;
  kind: "grade";
  createdAt: string;
  graderPromptVersion: string;
  graderPromptHash: string;
  thresholds: typeof GRADE_THRESHOLDS;
  provider: { name: string; model: string };
  filter: { langs: AiLanguage[]; cardIds: string[]; tags: string[]; limit: number | null };
  summary: Partial<Record<AiLanguage, GradeLanguageSummary>>;
  cases: GradeCaseResult[];
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

export function graderPromptHash(): string {
  const { system, user } = buildGradePrompt({ card: PROMPT_PROBE, lang: "en", theory: "t" });
  return hashText(`${GRADER_RULES}\n${system}\n${user}\n${JSON.stringify(GRADE_THRESHOLDS)}`);
}

export interface GradeRunOptions {
  provider: LlmProvider;
  concurrency?: number;
  retry?: { attempts?: number; delayMs?: number };
  filter?: GradeEvalFilter;
  onProgress?: (done: number, total: number, result: GradeCaseResult) => void;
  now?: () => Date;
}

async function runGradeCase(c: GradeEvalCase, options: GradeRunOptions): Promise<GradeCaseResult> {
  const base = {
    id: c.id,
    cardId: c.cardId,
    lang: c.lang,
    tag: c.tag,
    theory: c.theory,
    expectedVerdict: c.expectedVerdict,
    expectedFacts: c.expectedFacts,
  };
  let response: KeeperGradeResponse;
  let fallback: string | null;
  try {
    const result = await gradeTheory(
      options.provider,
      { card: c.card, lang: c.lang, theory: c.theory },
      options.retry ?? { attempts: 3, delayMs: 1000 }
    );
    response = result.response;
    fallback = result.fallback;
  } catch (error) {
    return {
      ...base,
      actualVerdict: "error",
      verdictAgree: false,
      correctFactIds: [],
      factsExact: false,
      missingCount: null,
      leaks: [],
      fallback: null,
      error: String(error instanceof Error ? error.message : error).slice(0, 500),
    };
  }
  // A fallback is what the Worker turns into a 502: no verdict reaches the player.
  const actualVerdict: ActualVerdict = fallback ? "error" : response.verdict;
  return {
    ...base,
    actualVerdict,
    verdictAgree: actualVerdict === c.expectedVerdict,
    correctFactIds: response.correctFactIds,
    factsExact:
      !fallback &&
      response.correctFactIds.length === c.expectedFacts.length &&
      c.expectedFacts.every((id) => response.correctFactIds.includes(id)),
    missingCount: fallback ? null : response.missingCount,
    leaks: findGradeLeaks(c.card, response),
    fallback,
  };
}

function emptyConfusion(): Record<TheoryVerdict, Record<ActualVerdict, number>> {
  const out = {} as Record<TheoryVerdict, Record<ActualVerdict, number>>;
  for (const expected of THEORY_VERDICTS) {
    out[expected] = {} as Record<ActualVerdict, number>;
    for (const actual of VERDICT_COLUMNS) out[expected][actual] = 0;
  }
  return out;
}

export function summarizeGrades(results: readonly GradeCaseResult[]): Partial<Record<AiLanguage, GradeLanguageSummary>> {
  const summary: Partial<Record<AiLanguage, GradeLanguageSummary>> = {};
  for (const r of results) {
    const s = (summary[r.lang] ??= {
      total: 0,
      verdictAgree: 0,
      verdictAgreement: 0,
      factsExact: 0,
      factAgreement: 0,
      leaks: 0,
      errors: 0,
      fallbacks: 0,
      confusion: emptyConfusion(),
      byTag: {},
    });
    s.total++;
    if (r.verdictAgree) s.verdictAgree++;
    if (r.factsExact) s.factsExact++;
    if (r.leaks.length > 0) s.leaks++;
    if (r.error) s.errors++;
    if (r.fallback) s.fallbacks++;
    s.confusion[r.expectedVerdict][r.actualVerdict]++;
    const tag = (s.byTag[r.tag] ??= { total: 0, agree: 0, leaks: 0 });
    tag.total++;
    if (r.verdictAgree) tag.agree++;
    if (r.leaks.length > 0) tag.leaks++;
  }
  for (const s of Object.values(summary)) {
    s.verdictAgreement = s.total > 0 ? s.verdictAgree / s.total : 0;
    s.factAgreement = s.total > 0 ? s.factsExact / s.total : 0;
  }
  return summary;
}

export async function runGradeEval(cases: readonly GradeEvalCase[], options: GradeRunOptions): Promise<GradeEvalReport> {
  const selected = filterGradeCases(cases, options.filter);
  let done = 0;
  const results = await mapWithConcurrency(selected, options.concurrency ?? 4, async (c) => {
    const result = await runGradeCase(c, options);
    done++;
    options.onProgress?.(done, selected.length, result);
    return result;
  });
  const filter = options.filter ?? {};
  return {
    schemaVersion: 1,
    kind: "grade",
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
    graderPromptVersion: GRADER_PROMPT_VERSION,
    graderPromptHash: graderPromptHash(),
    thresholds: GRADE_THRESHOLDS,
    provider: { name: options.provider.name, model: options.provider.model },
    filter: {
      langs: [...(filter.langs ?? EVAL_LANGUAGES)],
      cardIds: [...(filter.cardIds ?? [])],
      tags: [...(filter.tags ?? [])],
      limit: filter.limit ?? null,
    },
    summary: summarizeGrades(results),
    cases: results,
  };
}

/** Grading must agree with the expected verdict and never leak a missing fact. */
export const GRADE_EVAL_TARGET = { verdictAgreement: 0.95, leaks: 0 } as const;

export function meetsGradeTarget(summary: GradeLanguageSummary): boolean {
  return summary.verdictAgreement >= GRADE_EVAL_TARGET.verdictAgreement && summary.leaks <= GRADE_EVAL_TARGET.leaks;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const LANGUAGE_LABELS: Record<AiLanguage, string> = { en: "English", es: "Spanish" };
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function renderGradeReportMarkdown(report: GradeEvalReport, options: { maxFailures?: number } = {}): string {
  const lines: string[] = [];
  lines.push("## Theory grading eval");
  lines.push("");
  lines.push(
    `Grader: \`${report.provider.name}\` / \`${report.provider.model}\` · prompt ${report.graderPromptVersion} (\`${report.graderPromptHash}\`) · close at ≥${report.thresholds.closeShare * 100}% of key facts`
  );
  lines.push("");
  lines.push("| Language | Cases | Verdict agreement | Exact facts | Leaks | Errors | Fallbacks | Target |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const lang of EVAL_LANGUAGES) {
    const s = report.summary[lang];
    if (!s) continue;
    lines.push(
      `| ${LANGUAGE_LABELS[lang]} | ${s.total} | ${pct(s.verdictAgreement)} (${s.verdictAgree}) | ${pct(s.factAgreement)} | ${s.leaks} | ${s.errors} | ${s.fallbacks} | ${meetsGradeTarget(s) ? "✅" : "❌"} |`
    );
  }
  lines.push("");
  lines.push(
    `Target: verdict agreement ≥ ${pct(GRADE_EVAL_TARGET.verdictAgreement)} and ${GRADE_EVAL_TARGET.leaks} leaks per language.`
  );

  for (const lang of EVAL_LANGUAGES) {
    const s = report.summary[lang];
    if (!s) continue;
    lines.push("");
    lines.push(`### ${LANGUAGE_LABELS[lang]}: verdicts (rows expected, columns actual)`);
    lines.push("");
    lines.push(`| | ${VERDICT_COLUMNS.join(" | ")} |`);
    lines.push(`|---|${VERDICT_COLUMNS.map(() => "---").join("|")}|`);
    for (const expected of THEORY_VERDICTS) {
      lines.push(`| **${expected}** | ${VERDICT_COLUMNS.map((a) => s.confusion[expected][a]).join(" | ")} |`);
    }
    lines.push("");
    lines.push("| Tag | Cases | Agree | Leaks |");
    lines.push("|---|---|---|---|");
    for (const tag of THEORY_TAGS) {
      const t = s.byTag[tag];
      if (t) lines.push(`| ${tag} | ${t.total} | ${t.agree} | ${t.leaks} |`);
    }
  }

  const failures = report.cases.filter((r) => !r.verdictAgree || r.leaks.length > 0);
  if (failures.length > 0) {
    const max = options.maxFailures ?? 40;
    lines.push("");
    lines.push(`### Failures (${failures.length}${failures.length > max ? `, first ${max}` : ""})`);
    lines.push("");
    lines.push("| Case | Lang | Expected | Actual | Facts expected | Facts marked | Leaks |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const r of failures.slice(0, max)) {
      lines.push(
        `| ${cell(r.id)} | ${r.lang} | ${r.expectedVerdict} | ${r.actualVerdict}${r.error ? ` (${cell(r.error.slice(0, 60))})` : ""} | ${r.expectedFacts.join(", ")} | ${r.correctFactIds.join(", ")} | ${r.leaks.map((l) => `${l.factId} (${l.via})`).join(", ")} |`
      );
    }
  }
  return lines.join("\n");
}
