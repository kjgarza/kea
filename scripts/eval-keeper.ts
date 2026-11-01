#!/usr/bin/env bun
/**
 * AI keeper eval (issue #30, spec §6.5) and theory-grading eval (#32).
 *
 * Runs every case in evals/keeper/*.yaml through the shared keeper
 * (`answerKeeperQuestion` in src/lib/ai/keeper.ts, the same code path as the
 * Worker), checks replies for leaks and reports agreement, leaks and a
 * confusion matrix per language. The `theories:` in the same files run
 * through the shared grader (`gradeTheory` in src/lib/ai/grade.ts) and are
 * scored on verdict agreement, exact facts and leaks of missing facts.
 *
 * Case files (#37): `--suite case-ask` runs evals/case/*.yaml `ask:` cases
 * through the shared investigator (`answerInvestigatorQuestion`, the same
 * code path as POST /case/ask) and `--suite case-judge` runs the `judge:`
 * cases through `judgeAnswers` (POST /case/judge). Offline providers:
 * oracle | saboteur | stub.
 *
 * Usage:
 *   bun scripts/eval-keeper.ts [options]
 *
 * Options:
 *   --suite <name>        keeper | grade | case-ask | case-judge | case | all (default all)
 *   --provider <name>     anthropic (default) | openai | stub | oracle | saboteur
 *                         (oracle/saboteur/stub run offline, no API keys)
 *   --model <id>          Override the keeper model (default: KEEPER_MODEL or config)
 *   --judge <name>        Leak judge: same (default: same as --provider) | anthropic |
 *                         openai | scripted | none
 *   --judge-model <id>    Override the judge model
 *   --lang <en|es|all>    Languages to run (default all)
 *   --puzzle <cardId>     Only this puzzle (repeatable)
 *   --tag <tag>           Only this case tag (repeatable), e.g. demand, injection
 *                         (keeper tags and theory tags: full, partial, wrong,
 *                         paraphrase, language-switch, injection)
 *   --limit <n>           At most n cases per language
 *   --concurrency <n>     Parallel keeper calls (default 4)
 *   --save <file>         Write the keeper JSON report (use as a baseline later)
 *   --save-grade <file>   Write the grading JSON report
 *   --save-case <file>    Write the case JSON reports ({ ask, judge })
 *   --baseline <file>     Compare with an earlier JSON report and show the delta
 *   --markdown <file>     Also write the markdown report to this file
 *   --strict              Exit 1 unless every language meets the target (each suite run)
 *   --validate            Only validate the eval files (keeper cases and theories)
 *
 * The leak judge only applies to keeper replies: graded responses are rebuilt
 * from fact ids server-side, and their leak check is deterministic.
 *
 * The markdown report goes to stdout and, when GITHUB_STEP_SUMMARY is set,
 * is appended to the job summary.
 */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import type { AiLanguage } from "../src/lib/ai/api";
import { isProviderName, type LlmProvider } from "../src/lib/ai/provider";
import { createLlmProvider } from "./lib/llm-client";
import {
  EVAL_LANGUAGES,
  EVAL_TAGS,
  filterCases,
  loadEvalSuite,
  meetsTarget,
  runKeeperEval,
  type EvalCase,
  type EvalReport,
  type EvalTag,
} from "./lib/keeper-eval";
import {
  createOracleGrader,
  createOracleProvider,
  createSaboteurGrader,
  createSaboteurProvider,
  createScriptedJudge,
  createStubGraderProvider,
  createStubKeeperProvider,
} from "./lib/keeper-eval-fakes";
import {
  THEORY_TAGS,
  filterGradeCases,
  loadGradeSuite,
  meetsGradeTarget,
  renderGradeReportMarkdown,
  runGradeEval,
  type GradeEvalCase,
  type GradeEvalReport,
  type TheoryTag,
} from "./lib/grade-eval";
import { diffReports, renderReportMarkdown } from "./lib/keeper-eval-report";
import {
  ASK_TAGS,
  JUDGE_TAGS,
  createOracleInvestigator,
  createOracleJudge,
  createSaboteurInvestigator,
  createSaboteurJudge,
  createStubCaseProvider,
  filterCaseCases,
  loadCaseEvalSuite,
  meetsCaseTarget,
  renderCaseReportMarkdown,
  runCaseAskEval,
  runCaseJudgeEval,
  type AskCaseResult,
  type AskEvalCase,
  type CaseEvalReport,
  type JudgeCaseResult,
  type JudgeEvalCase,
} from "./lib/case-eval";

function fail(message: string): never {
  console.error(`eval-keeper: ${message}`);
  process.exit(2);
}

function positiveInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) fail(`${name} must be a positive integer`);
  return n;
}

function keeperProvider(name: string, cases: EvalCase[], model?: string): LlmProvider {
  switch (name) {
    case "oracle":
      return createOracleProvider(cases);
    case "saboteur":
      return createSaboteurProvider(cases);
    case "stub":
      return createStubKeeperProvider();
    case "anthropic":
    case "openai":
      // Same env as the Worker: KEEPER_MODEL overrides the default model.
      return createLlmProvider(name, { model: model ?? (process.env.KEEPER_MODEL?.trim() || undefined) });
    default:
      fail(`unknown provider "${name}"`);
  }
}

function graderProvider(name: string, cases: GradeEvalCase[], keeper: LlmProvider | null, model?: string): LlmProvider {
  switch (name) {
    case "oracle":
      return createOracleGrader(cases);
    case "saboteur":
      return createSaboteurGrader(cases);
    case "stub":
      return createStubGraderProvider();
    case "anthropic":
    case "openai":
      return keeper ?? createLlmProvider(name, { model: model ?? (process.env.KEEPER_MODEL?.trim() || undefined) });
    default:
      fail(`unknown provider "${name}"`);
  }
}

function caseProvider(
  name: string,
  kind: "ask" | "judge",
  cases: { ask: AskEvalCase[]; judge: JudgeEvalCase[] },
  shared: LlmProvider | null,
  model?: string
): LlmProvider {
  switch (name) {
    case "oracle":
      return kind === "ask" ? createOracleInvestigator(cases.ask) : createOracleJudge(cases.judge);
    case "saboteur":
      return kind === "ask" ? createSaboteurInvestigator(cases.ask) : createSaboteurJudge(cases.judge);
    case "stub":
      return createStubCaseProvider();
    case "anthropic":
    case "openai":
      return shared ?? createLlmProvider(name, { model: model ?? (process.env.KEEPER_MODEL?.trim() || undefined) });
    default:
      fail(`unknown provider "${name}"`);
  }
}

function judgeProvider(name: string, keeper: LlmProvider, providerName: string, model?: string): LlmProvider | null {
  if (name === "none") return null;
  if (name === "scripted") return createScriptedJudge();
  if (name === "same") {
    // Offline keepers come with the scripted judge built in.
    if (!isProviderName(providerName) || providerName === "stub") return keeper;
    return model ? createLlmProvider(providerName, { model }) : keeper;
  }
  if (name === "anthropic" || name === "openai") return createLlmProvider(name, model ? { model } : {});
  fail(`unknown judge "${name}"`);
}

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      suite: { type: "string", default: "all" },
      provider: { type: "string", default: "anthropic" },
      model: { type: "string" },
      judge: { type: "string", default: "same" },
      "judge-model": { type: "string" },
      lang: { type: "string", default: "all" },
      puzzle: { type: "string", multiple: true },
      tag: { type: "string", multiple: true },
      limit: { type: "string" },
      concurrency: { type: "string", default: "4" },
      save: { type: "string" },
      "save-grade": { type: "string" },
      "save-case": { type: "string" },
      baseline: { type: "string" },
      markdown: { type: "string" },
      strict: { type: "boolean", default: false },
      validate: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log("See the header of scripts/eval-keeper.ts for usage.");
    return;
  }

  const suiteName = values.suite!;
  const SUITES = ["keeper", "grade", "case-ask", "case-judge", "case", "all"];
  if (!SUITES.includes(suiteName)) fail(`--suite must be one of ${SUITES.join(", ")}`);
  const runKeeper = suiteName === "keeper" || suiteName === "all";
  const runGrade = suiteName === "grade" || suiteName === "all";
  const runCaseAsk = ["case-ask", "case", "all"].includes(suiteName);
  const runCaseJudge = ["case-judge", "case", "all"].includes(suiteName);

  const suite = await loadEvalSuite();
  const gradeSuite = await loadGradeSuite();
  const caseSuite = await loadCaseEvalSuite();
  const errors = [...suite.errors, ...gradeSuite.errors, ...caseSuite.errors];
  if (errors.length > 0) {
    for (const error of errors) console.error(`  ${error}`);
    fail(`${errors.length} problem(s) in evals/keeper or evals/case`);
  }
  const perLang = EVAL_LANGUAGES.map((lang) => `${lang} ${suite.cases.filter((c) => c.lang === lang).length}`);
  const gradePerLang = EVAL_LANGUAGES.map((lang) => `${lang} ${gradeSuite.cases.filter((c) => c.lang === lang).length}`);
  console.error(`Loaded ${suite.files.length} eval files: ${perLang.join(", ")} keeper cases; ${gradePerLang.join(", ")} theories.`);
  console.error(`Loaded ${caseSuite.files.length} case eval files: ${caseSuite.ask.length} investigator and ${caseSuite.judge.length} judge cases.`);
  if (values.validate) return;

  const langs: AiLanguage[] =
    values.lang === "all" ? [...EVAL_LANGUAGES] : EVAL_LANGUAGES.includes(values.lang as AiLanguage) ? [values.lang as AiLanguage] : fail(`--lang must be en, es or all`);
  const tags = values.tag ?? [];
  for (const tag of tags) {
    const known = [...EVAL_TAGS, ...THEORY_TAGS, ...ASK_TAGS, ...JUDGE_TAGS] as readonly string[];
    if (!known.includes(tag)) fail(`unknown tag "${tag}"`);
  }
  const limit = positiveInt(values.limit, "--limit");
  const keeperTags = tags.filter((tag): tag is EvalTag => EVAL_TAGS.includes(tag as EvalTag));
  const theoryTags = tags.filter((tag): tag is TheoryTag => THEORY_TAGS.includes(tag as TheoryTag));
  // A tag filter that names only theory tags skips the keeper cases, and vice versa.
  const filter = { langs, cardIds: values.puzzle ?? [], tags: keeperTags, limit };
  const gradeFilter = { langs, cardIds: values.puzzle ?? [], tags: theoryTags, limit };
  const doKeeper = runKeeper && !(tags.length > 0 && keeperTags.length === 0) && filterCases(suite.cases, filter).length > 0;
  const doGrade = runGrade && !(tags.length > 0 && theoryTags.length === 0) && filterGradeCases(gradeSuite.cases, gradeFilter).length > 0;
  const askTags = tags.filter((tag) => (ASK_TAGS as readonly string[]).includes(tag));
  const judgeTags = tags.filter((tag) => (JUDGE_TAGS as readonly string[]).includes(tag));
  const askFilter = { langs, cardIds: values.puzzle ?? [], tags: askTags, limit };
  const judgeFilter = { langs, cardIds: values.puzzle ?? [], tags: judgeTags, limit };
  const doCaseAsk = runCaseAsk && !(tags.length > 0 && askTags.length === 0) && filterCaseCases(caseSuite.ask, askFilter).length > 0;
  const doCaseJudge = runCaseJudge && !(tags.length > 0 && judgeTags.length === 0) && filterCaseCases(caseSuite.judge, judgeFilter).length > 0;
  if (!doKeeper && !doGrade && !doCaseAsk && !doCaseJudge) fail("no cases match the filters");

  const offline = ["oracle", "saboteur", "stub"].includes(values.provider!);
  const retry = offline ? { attempts: 1, delayMs: 0 } : { attempts: 3, delayMs: 1500 };
  const concurrency = positiveInt(values.concurrency, "--concurrency");
  let lastLog = 0;
  const onProgress = (done: number, total: number) => {
    if (done === total || Date.now() - lastLog > 2000) {
      lastLog = Date.now();
      console.error(`  ${done}/${total}`);
    }
  };

  let provider: LlmProvider | null = null;
  let judge: LlmProvider | null = null;
  let grader: LlmProvider | null = null;
  let investigator: LlmProvider | null = null;
  let caseJudge: LlmProvider | null = null;
  try {
    if (doKeeper) {
      provider = keeperProvider(values.provider!, suite.cases, values.model);
      judge = judgeProvider(values.judge!, provider, values.provider!, values["judge-model"]);
    }
    if (doGrade) grader = graderProvider(values.provider!, gradeSuite.cases, offline ? null : provider, values.model);
    if (doCaseAsk) investigator = caseProvider(values.provider!, "ask", caseSuite, offline ? null : (provider ?? grader), values.model);
    if (doCaseJudge) caseJudge = caseProvider(values.provider!, "judge", caseSuite, offline ? null : (provider ?? grader ?? investigator), values.model);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const sections: string[] = [];
  let report: EvalReport | null = null;
  if (doKeeper && provider) {
    report = await runKeeperEval(suite.cases, { provider, judge, filter, concurrency, retry, onProgress });
    let diff = null;
    if (values.baseline) {
      const file = Bun.file(values.baseline);
      if (await file.exists()) {
        diff = diffReports((await file.json()) as EvalReport, report);
      } else {
        console.error(`Baseline ${values.baseline} not found; skipping the comparison.`);
      }
    }
    sections.push(renderReportMarkdown(report, { diff }));
  }
  let gradeReport: GradeEvalReport | null = null;
  if (doGrade && grader) {
    console.error("Grading theories…");
    gradeReport = await runGradeEval(gradeSuite.cases, { provider: grader, filter: gradeFilter, concurrency, retry, onProgress });
    sections.push(renderGradeReportMarkdown(gradeReport));
  }

  let askReport: CaseEvalReport<AskCaseResult> | null = null;
  if (doCaseAsk && investigator) {
    console.error("Running case investigator cases…");
    askReport = await runCaseAskEval(caseSuite.ask, { provider: investigator, filter: askFilter, concurrency, retry, onProgress });
    sections.push(renderCaseReportMarkdown(askReport));
  }
  let judgeReport: CaseEvalReport<JudgeCaseResult> | null = null;
  if (doCaseJudge && caseJudge) {
    console.error("Running case judge cases…");
    judgeReport = await runCaseJudgeEval(caseSuite.judge, { provider: caseJudge, filter: judgeFilter, concurrency, retry, onProgress });
    sections.push(renderCaseReportMarkdown(judgeReport));
  }

  const markdown = sections.join("\n\n");
  console.log(markdown);
  if (values.markdown) {
    await mkdir(path.dirname(values.markdown), { recursive: true });
    await writeFile(values.markdown, `${markdown}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  if (values.save && report) {
    await mkdir(path.dirname(values.save), { recursive: true });
    await writeFile(values.save, `${JSON.stringify(report, null, 2)}\n`);
    console.error(`Saved report to ${values.save}`);
  }
  if (values["save-grade"] && gradeReport) {
    await mkdir(path.dirname(values["save-grade"]), { recursive: true });
    await writeFile(values["save-grade"], `${JSON.stringify(gradeReport, null, 2)}\n`);
    console.error(`Saved grading report to ${values["save-grade"]}`);
  }

  if (values["save-case"] && (askReport || judgeReport)) {
    await mkdir(path.dirname(values["save-case"]), { recursive: true });
    await writeFile(values["save-case"], `${JSON.stringify({ ask: askReport, judge: judgeReport }, null, 2)}\n`);
    console.error(`Saved case reports to ${values["save-case"]}`);
  }

  if (values.strict) {
    const missed: string[] = [];
    for (const lang of langs) {
      if (report && !(report.summary[lang] && meetsTarget(report.summary[lang]!))) missed.push(`keeper ${lang}`);
      if (gradeReport && !(gradeReport.summary[lang] && meetsGradeTarget(gradeReport.summary[lang]!))) missed.push(`grading ${lang}`);
      if (askReport && !(askReport.summary[lang] && meetsCaseTarget(askReport.summary[lang]!))) missed.push(`case-ask ${lang}`);
      if (judgeReport && !(judgeReport.summary[lang] && meetsCaseTarget(judgeReport.summary[lang]!))) missed.push(`case-judge ${lang}`);
    }
    if (missed.length > 0) {
      console.error(`Target not met for: ${missed.join(", ")}`);
      process.exit(1);
    }
  }
}

await main();
