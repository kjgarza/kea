#!/usr/bin/env bun
/**
 * AI keeper eval (issue #30, spec §6.5).
 *
 * Runs every case in evals/keeper/*.yaml through the shared keeper
 * (`answerKeeperQuestion` in src/lib/ai/keeper.ts, the same code path as the
 * Worker), checks replies for leaks and reports agreement, leaks and a
 * confusion matrix per language.
 *
 * Usage:
 *   bun scripts/eval-keeper.ts [options]
 *
 * Options:
 *   --provider <name>     anthropic (default) | openai | stub | oracle | saboteur
 *                         (oracle/saboteur/stub run offline, no API keys)
 *   --model <id>          Override the keeper model (default: KEEPER_MODEL or config)
 *   --judge <name>        Leak judge: same (default: same as --provider) | anthropic |
 *                         openai | scripted | none
 *   --judge-model <id>    Override the judge model
 *   --lang <en|es|all>    Languages to run (default all)
 *   --puzzle <cardId>     Only this puzzle (repeatable)
 *   --tag <tag>           Only this case tag (repeatable), e.g. demand, injection
 *   --limit <n>           At most n cases per language
 *   --concurrency <n>     Parallel keeper calls (default 4)
 *   --save <file>         Write the JSON report (use as a baseline later)
 *   --baseline <file>     Compare with an earlier JSON report and show the delta
 *   --markdown <file>     Also write the markdown report to this file
 *   --strict              Exit 1 unless every language meets the target
 *   --validate            Only validate the eval files
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
  createOracleProvider,
  createSaboteurProvider,
  createScriptedJudge,
  createStubKeeperProvider,
} from "./lib/keeper-eval-fakes";
import { diffReports, renderReportMarkdown } from "./lib/keeper-eval-report";

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

  const suite = await loadEvalSuite();
  if (suite.errors.length > 0) {
    for (const error of suite.errors) console.error(`  ${error}`);
    fail(`${suite.errors.length} problem(s) in evals/keeper`);
  }
  const perLang = EVAL_LANGUAGES.map((lang) => `${lang} ${suite.cases.filter((c) => c.lang === lang).length}`);
  console.error(`Loaded ${suite.files.length} eval files: ${perLang.join(", ")} cases.`);
  if (values.validate) return;

  const langs: AiLanguage[] =
    values.lang === "all" ? [...EVAL_LANGUAGES] : EVAL_LANGUAGES.includes(values.lang as AiLanguage) ? [values.lang as AiLanguage] : fail(`--lang must be en, es or all`);
  const tags = (values.tag ?? []) as EvalTag[];
  for (const tag of tags) if (!EVAL_TAGS.includes(tag)) fail(`unknown tag "${tag}"`);
  const filter = { langs, cardIds: values.puzzle ?? [], tags, limit: positiveInt(values.limit, "--limit") };
  if (filterCases(suite.cases, filter).length === 0) fail("no cases match the filters");

  let provider: LlmProvider;
  let judge: LlmProvider | null;
  try {
    provider = keeperProvider(values.provider!, suite.cases, values.model);
    judge = judgeProvider(values.judge!, provider, values.provider!, values["judge-model"]);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const offline = ["oracle", "saboteur", "stub"].includes(values.provider!);

  let lastLog = 0;
  const report = await runKeeperEval(suite.cases, {
    provider,
    judge,
    filter,
    concurrency: positiveInt(values.concurrency, "--concurrency"),
    retry: offline ? { attempts: 1, delayMs: 0 } : { attempts: 3, delayMs: 1500 },
    onProgress(done, total) {
      if (done === total || Date.now() - lastLog > 2000) {
        lastLog = Date.now();
        console.error(`  ${done}/${total}`);
      }
    },
  });

  let diff = null;
  if (values.baseline) {
    const file = Bun.file(values.baseline);
    if (await file.exists()) {
      diff = diffReports((await file.json()) as EvalReport, report);
    } else {
      console.error(`Baseline ${values.baseline} not found; skipping the comparison.`);
    }
  }

  const markdown = renderReportMarkdown(report, { diff });
  console.log(markdown);
  if (values.markdown) {
    await mkdir(path.dirname(values.markdown), { recursive: true });
    await writeFile(values.markdown, `${markdown}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  if (values.save) {
    await mkdir(path.dirname(values.save), { recursive: true });
    await writeFile(values.save, `${JSON.stringify(report, null, 2)}\n`);
    console.error(`Saved report to ${values.save}`);
  }

  if (values.strict) {
    const missed = langs.filter((lang) => {
      const s = report.summary[lang];
      return !s || !meetsTarget(s);
    });
    if (missed.length > 0) {
      console.error(`Target not met for: ${missed.join(", ")}`);
      process.exit(1);
    }
  }
}

await main();
