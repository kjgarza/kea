/**
 * Markdown rendering and report diffing for the keeper eval harness (#30).
 * The markdown is written for `$GITHUB_STEP_SUMMARY` (GitHub-flavoured).
 */
import { KEEPER_ANSWERS } from "../../src/lib/ai/answers";
import type { AiLanguage } from "../../src/lib/ai/api";
import {
  CONFUSION_COLUMNS,
  EVAL_LANGUAGES,
  EVAL_TAGS,
  EVAL_TARGET,
  meetsTarget,
  type CaseResult,
  type EvalReport,
  type LanguageSummary,
} from "./keeper-eval";

const LANGUAGE_LABELS: Record<AiLanguage, string> = { en: "English", es: "Spanish" };

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function signedPct(value: number): string {
  const points = value * 100;
  return `${points >= 0 ? "+" : ""}${points.toFixed(1)} pts`;
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export interface LanguageDelta {
  lang: AiLanguage;
  before: { agreement: number; leaks: number; total: number } | null;
  after: { agreement: number; leaks: number; total: number } | null;
  agreementDelta: number | null;
  leaksDelta: number | null;
}

export interface CaseChange {
  key: string;
  question: string;
  expected: string;
  before: string;
  after: string;
}

export interface ReportDiff {
  promptChanged: boolean;
  judgePromptChanged: boolean;
  before: { createdAt: string; provider: string; keeperPromptVersion: string; keeperPromptHash: string };
  languages: LanguageDelta[];
  /** Disagree -> agree. */
  fixed: CaseChange[];
  /** Agree -> disagree. */
  regressed: CaseChange[];
  /** Same agreement, different answer (e.g. one wrong answer for another). */
  changed: CaseChange[];
  newLeaks: CaseChange[];
  resolvedLeaks: CaseChange[];
  onlyBefore: number;
  onlyAfter: number;
}

function caseKey(c: CaseResult): string {
  return `${c.lang}:${c.id}`;
}

function leakLabel(c: CaseResult): string {
  return c.leaks.length > 0 ? c.leaks.map((leak) => leak.kind).join("+") : "none";
}

export function diffReports(before: EvalReport, after: EvalReport): ReportDiff {
  const prev = new Map(before.cases.map((c) => [caseKey(c), c]));
  const curr = new Map(after.cases.map((c) => [caseKey(c), c]));
  const fixed: CaseChange[] = [];
  const regressed: CaseChange[] = [];
  const changed: CaseChange[] = [];
  const newLeaks: CaseChange[] = [];
  const resolvedLeaks: CaseChange[] = [];

  for (const [key, c] of curr) {
    const p = prev.get(key);
    if (!p) continue;
    const change = { key, question: c.question, expected: c.expected, before: p.actual, after: c.actual };
    if (!p.agree && c.agree) fixed.push(change);
    else if (p.agree && !c.agree) regressed.push(change);
    else if (p.actual !== c.actual) changed.push(change);
    const leakChange = { ...change, before: leakLabel(p), after: leakLabel(c) };
    if (p.leaks.length === 0 && c.leaks.length > 0) newLeaks.push(leakChange);
    if (p.leaks.length > 0 && c.leaks.length === 0) resolvedLeaks.push(leakChange);
  }

  const languages: LanguageDelta[] = [];
  for (const lang of EVAL_LANGUAGES) {
    const b = before.summary[lang];
    const a = after.summary[lang];
    if (!a && !b) continue;
    languages.push({
      lang,
      before: b ? { agreement: b.agreement, leaks: b.leaks, total: b.total } : null,
      after: a ? { agreement: a.agreement, leaks: a.leaks, total: a.total } : null,
      agreementDelta: a && b ? a.agreement - b.agreement : null,
      leaksDelta: a && b ? a.leaks - b.leaks : null,
    });
  }

  return {
    promptChanged: before.keeperPromptHash !== after.keeperPromptHash,
    judgePromptChanged: (before.judgePromptHash ?? null) !== (after.judgePromptHash ?? null),
    before: {
      createdAt: before.createdAt,
      provider: `${before.provider.name}/${before.provider.model}`,
      keeperPromptVersion: before.keeperPromptVersion,
      keeperPromptHash: before.keeperPromptHash,
    },
    languages,
    fixed,
    regressed,
    changed,
    newLeaks,
    resolvedLeaks,
    onlyBefore: [...prev.keys()].filter((key) => !curr.has(key)).length,
    onlyAfter: [...curr.keys()].filter((key) => !prev.has(key)).length,
  };
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function summaryTable(report: EvalReport): string[] {
  const lines = [
    "| Language | Cases | Agreement | Leaks | Out-of-vocab | Fact recall | Errors | Target |",
    "|---|---:|---:|---:|---:|---:|---:|---|",
  ];
  for (const lang of EVAL_LANGUAGES) {
    const s = report.summary[lang];
    if (!s) continue;
    const recall = s.factRecall.total > 0 ? pct(s.factRecall.matched / s.factRecall.total) : "n/a";
    lines.push(
      `| ${LANGUAGE_LABELS[lang]} | ${s.total} | ${pct(s.agreement)} (${s.agree}/${s.total}) | ${s.leaks} | ${s.outOfVocab} | ${recall} | ${s.errors} | ${meetsTarget(s) ? "PASS" : "FAIL"} |`
    );
  }
  return lines;
}

function leakTable(s: LanguageSummary): string {
  const k = s.leaksByKind;
  return `Leak signals: unasked fact ids ${k.unasked_fact_id}, fact/solution text ${k.fact_text}, extra output ${k.extra_output}, judge ${k.judge}.`;
}

function confusionTable(s: LanguageSummary): string[] {
  const lines = [
    `| expected \\ actual | ${CONFUSION_COLUMNS.join(" | ")} |`,
    `|---|${CONFUSION_COLUMNS.map(() => "---:").join("|")}|`,
  ];
  for (const expected of KEEPER_ANSWERS) {
    const row = CONFUSION_COLUMNS.map((actual) => {
      const n = s.confusion[expected][actual];
      return expected === actual ? `**${n}**` : String(n);
    });
    lines.push(`| ${expected} | ${row.join(" | ")} |`);
  }
  return lines;
}

function tagTable(s: LanguageSummary): string[] {
  const lines = ["| Set | Cases | Agreement | Leaks |", "|---|---:|---:|---:|"];
  for (const tag of EVAL_TAGS) {
    const t = s.byTag[tag];
    if (!t) continue;
    lines.push(`| ${tag} | ${t.total} | ${pct(t.total > 0 ? t.agree / t.total : 0)} | ${t.leaks} |`);
  }
  return lines;
}

function failureRows(cases: CaseResult[], max: number): string[] {
  const lines = ["| Case | Question | Expected | Actual | Leaks |", "|---|---|---|---|---|"];
  for (const c of cases.slice(0, max)) {
    const leaks = c.leaks.map((leak) => `${leak.kind}: ${leak.detail}`).join("; ") || "";
    const actual = c.error ? `error: ${c.error}` : c.actual;
    lines.push(
      `| \`${c.lang}:${c.id}\` | ${escapeCell(c.question)} | ${c.expected} | ${escapeCell(actual)} | ${escapeCell(leaks)} |`
    );
  }
  if (cases.length > max) lines.push(`| ... | ${cases.length - max} more in the JSON report | | | |`);
  return lines;
}

function changeRows(title: string, changes: CaseChange[], max: number): string[] {
  if (changes.length === 0) return [];
  const lines = [`**${title}** (${changes.length})`, "", "| Case | Question | Expected | Before | After |", "|---|---|---|---|---|"];
  for (const c of changes.slice(0, max)) {
    lines.push(`| \`${c.key}\` | ${escapeCell(c.question)} | ${c.expected} | ${c.before} | ${c.after} |`);
  }
  if (changes.length > max) lines.push(`| ... | ${changes.length - max} more | | | |`);
  lines.push("");
  return lines;
}

export function renderDiffMarkdown(diff: ReportDiff, maxRows = 30): string {
  const lines = [
    "## Change vs baseline",
    "",
    `Baseline: ${diff.before.createdAt}, ${diff.before.provider}, prompt ${diff.before.keeperPromptVersion} (\`${diff.before.keeperPromptHash}\`).`,
    `Keeper prompt ${diff.promptChanged ? "**changed**" : "unchanged"}; judge prompt ${diff.judgePromptChanged ? "changed" : "unchanged"}.`,
    "",
    "| Language | Agreement before | Agreement now | Delta | Leaks before | Leaks now | Delta |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const l of diff.languages) {
    lines.push(
      `| ${LANGUAGE_LABELS[l.lang]} | ${l.before ? pct(l.before.agreement) : "n/a"} | ${l.after ? pct(l.after.agreement) : "n/a"} | ${l.agreementDelta === null ? "n/a" : signedPct(l.agreementDelta)} | ${l.before?.leaks ?? "n/a"} | ${l.after?.leaks ?? "n/a"} | ${l.leaksDelta === null ? "n/a" : signed(l.leaksDelta)} |`
    );
  }
  lines.push("");
  if (diff.onlyBefore || diff.onlyAfter) {
    lines.push(`Cases only in the baseline: ${diff.onlyBefore}; only in this run: ${diff.onlyAfter}.`, "");
  }
  lines.push(
    ...changeRows("Regressed", diff.regressed, maxRows),
    ...changeRows("Fixed", diff.fixed, maxRows),
    ...changeRows("Changed wrong answer", diff.changed, maxRows),
    ...changeRows("New leaks", diff.newLeaks, maxRows),
    ...changeRows("Resolved leaks", diff.resolvedLeaks, maxRows)
  );
  return lines.join("\n");
}

export function renderReportMarkdown(
  report: EvalReport,
  options: { diff?: ReportDiff | null; maxFailures?: number } = {}
): string {
  const maxFailures = options.maxFailures ?? 40;
  const judge = report.judge ? `${report.judge.name}/${report.judge.model}` : "off (deterministic checks only)";
  const filter = [
    report.filter.cardIds.length ? `puzzles ${report.filter.cardIds.join(", ")}` : null,
    report.filter.tags.length ? `tags ${report.filter.tags.join(", ")}` : null,
    report.filter.limit !== null ? `limit ${report.filter.limit}/language` : null,
  ].filter(Boolean);

  const lines = [
    "# Keeper eval",
    "",
    `Provider **${report.provider.name}/${report.provider.model}**, leak judge ${judge}. Keeper prompt ${report.keeperPromptVersion} (\`${report.keeperPromptHash}\`). ${report.createdAt}.`,
    filter.length ? `Filter: ${filter.join("; ")}.` : "",
    `Target (spec §6.5): agreement ≥ ${pct(EVAL_TARGET.agreement)} and ${EVAL_TARGET.leaks} leaks per language.`,
    "",
    ...summaryTable(report),
    "",
  ];

  if (options.diff) lines.push(renderDiffMarkdown(options.diff), "");

  for (const lang of EVAL_LANGUAGES) {
    const s = report.summary[lang];
    if (!s) continue;
    const failures = report.cases.filter((c) => c.lang === lang && (!c.agree || c.leaks.length > 0));
    lines.push(
      `## ${LANGUAGE_LABELS[lang]}`,
      "",
      leakTable(s),
      s.fallbacks || s.judgeErrors ? `Keeper fallbacks: ${s.fallbacks}; judge errors: ${s.judgeErrors}.` : "",
      "",
      "Confusion matrix:",
      "",
      ...confusionTable(s),
      "",
      ...tagTable(s),
      ""
    );
    if (failures.length > 0) {
      lines.push(
        `<details><summary>Disagreements and leaks (${failures.length})</summary>`,
        "",
        ...failureRows(failures, maxFailures),
        "",
        "</details>",
        ""
      );
    }
  }
  return lines.filter((line, i, all) => !(line === "" && all[i - 1] === "")).join("\n");
}
