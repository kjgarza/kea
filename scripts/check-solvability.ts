#!/usr/bin/env bun
/**
 * Re-run the solvability check (#33) on an existing situation deck, e.g. the
 * hand-written seed decks, and write a report. Never modifies the deck.
 *
 * Usage:
 *   bun scripts/check-solvability.ts --deck <deckId> [options]
 *
 * Options:
 *   --deck <id>             Deck in public/decks/ (required)
 *   --provider <name>       anthropic | openai | stub for every role (default:
 *                           KEEPER_PROVIDER / SOLVER_PROVIDER, else anthropic).
 *                           `stub` runs offline and cannot solve anything; it
 *                           only exercises the pipeline.
 *   --puzzle <cardId>       Only this puzzle (repeatable)
 *   --limit <n>             At most n puzzles
 *   --concurrency <n>       Puzzles checked in parallel (default 4)
 *   --max-questions <n>     Question budget (default 40)
 *   --skip-ambiguity        Skip the ambiguity check
 *   --out <file>            JSON report (default reports/solvability-<deckId>.json)
 *   --strict                Exit 1 when any puzzle fails or errors
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { isProviderName } from "../src/lib/ai/provider";
import { stubRespond } from "../src/lib/ai/stub-keeper";
import type { SituationCard } from "../src/types/card";
import { createLlmProvider, getSolvabilityProviders } from "./lib/llm-client";
import { createFileDeckLoader } from "./lib/keeper-eval";
import {
  aiLanguageFor,
  checkDeckSolvability,
  formatPuzzleLine,
  renderSolvabilitySummary,
  type SolvabilityProviders,
} from "./lib/solvability";

const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    deck: { type: "string" },
    provider: { type: "string" },
    puzzle: { type: "string", multiple: true },
    limit: { type: "string" },
    concurrency: { type: "string", default: "4" },
    "max-questions": { type: "string" },
    "skip-ambiguity": { type: "boolean", default: false },
    out: { type: "string" },
    strict: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

function positiveInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`❌ --${name} must be a positive integer`);
    process.exit(1);
  }
  return n;
}

function providersFor(name: string | undefined): SolvabilityProviders {
  if (name === undefined) return getSolvabilityProviders();
  if (!isProviderName(name)) {
    console.error(`❌ Unknown provider "${name}" (anthropic | openai | stub)`);
    process.exit(1);
  }
  const provider = createLlmProvider(name, name === "stub" ? { respond: stubRespond } : {});
  return { solver: provider, keeper: provider, grader: provider, ambiguity: provider };
}

async function main() {
  if (args.help || !args.deck) {
    console.log(
      "Usage: bun scripts/check-solvability.ts --deck <deckId> [--provider anthropic|openai|stub] [--puzzle id] [--limit n] [--concurrency n] [--max-questions n] [--skip-ambiguity] [--out file] [--strict]"
    );
    process.exit(args.help ? 0 : 1);
  }

  const deck = await createFileDeckLoader()(args.deck);
  if (!deck) {
    console.error(`❌ Deck not found: public/decks/${args.deck}.json`);
    process.exit(1);
  }
  if (deck.gameType !== "situation") {
    console.error(`❌ ${deck.deckId} is a ${deck.gameType} deck; only situation decks can be checked`);
    process.exit(1);
  }

  let cards = deck.cards.filter((card): card is SituationCard => card.type === "situation");
  if (args.puzzle?.length) cards = cards.filter((card) => args.puzzle!.includes(card.cardId));
  const limit = positiveInt(args.limit, "limit");
  if (limit) cards = cards.slice(0, limit);
  if (cards.length === 0) {
    console.error("❌ No puzzles selected");
    process.exit(1);
  }

  let providers: SolvabilityProviders;
  try {
    providers = providersFor(args.provider);
  } catch (error) {
    console.error(`❌ ${(error as Error).message}`);
    process.exit(1);
  }
  if (args["skip-ambiguity"]) providers = { ...providers, ambiguity: null };

  const lang = aiLanguageFor(deck.language);
  console.log(`🧩 Solvability check: ${deck.deckId} (${cards.length} puzzles, ${lang})`);
  console.log(
    `   solver ${providers.solver.name}/${providers.solver.model}, keeper ${providers.keeper.name}/${providers.keeper.model}`
  );

  const report = await checkDeckSolvability(cards, {
    providers,
    lang,
    concurrency: positiveInt(args.concurrency, "concurrency"),
    maxQuestions: positiveInt(args["max-questions"], "max-questions"),
    onResult: (result, done, total) => console.log(formatPuzzleLine(result, done, total)),
  });

  for (const line of renderSolvabilitySummary(report, null)) console.log(line);

  const out = args.out ?? path.join("reports", `solvability-${deck.deckId}.json`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(
    out,
    `${JSON.stringify({ deckId: deck.deckId, deckVersion: deck.version, createdAt: new Date().toISOString(), ...report }, null, 2)}\n`
  );
  console.log(`\n📄 Report written to ${out}`);

  if (args.strict && report.counts.passed < report.results.length) process.exit(1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
