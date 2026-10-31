#!/usr/bin/env bun
/**
 * Stack Exchange importer (issue #58)
 *
 * Fetches `lateral-thinking` questions with accepted answers from the Stack
 * Exchange API and writes one raw item per post to
 * `decks/sources/stackexchange/<site>-<questionId>.json` (git-ignored), with
 * the post URL, both authors and the CC BY-SA licence by post date. Nothing
 * is published: normalise the raw items into a draft pack with
 * `scripts/normalize-sources.ts`, review it, then import it. See
 * docs/content-sources.md before importing anything for real.
 *
 * Usage:
 *   bun scripts/import-stackexchange.ts [--max 30] [--min-score 10] [--dry-run]
 *   bun scripts/import-stackexchange.ts --recorded scripts/fixtures/sources/stackexchange
 *
 * Options:
 *   --site <name>        Stack Exchange site (default puzzling)
 *   --tag <tag>          Tag (default lateral-thinking)
 *   --min-score <n>      Minimum question score (default 5)
 *   --max <n>            At most n items (default 50)
 *   --out <dir>          Output folder (default decks/sources/stackexchange)
 *   --recorded <dir>     Serve the API from questions.json + answers.json in <dir> (offline)
 *   --dry-run            Print what would be written
 */
import { parseArgs } from "node:util";
import path from "node:path";
import { fetchStackExchangeItems } from "./lib/stackexchange";
import { RAW_SOURCES_DIR } from "./lib/raw-sources";
import { createRecordedStackExchangeFetch, writeRawItems } from "./lib/raw-source-files";

const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    site: { type: "string", default: "puzzling" },
    tag: { type: "string", default: "lateral-thinking" },
    "min-score": { type: "string", default: "5" },
    max: { type: "string", default: "50" },
    out: { type: "string" },
    recorded: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (args.help) {
  console.log(
    (await Bun.file(import.meta.path).text()).match(/\/\*\*([\s\S]*?)\*\//)![1].replace(/^ \* ?/gm, "")
  );
  process.exit(0);
}

function int(value: string | undefined, name: string): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < 0) {
    console.error(`❌ --${name} must be a non-negative integer`);
    process.exit(1);
  }
  return n;
}

async function main() {
  const out = args.out ?? `${RAW_SOURCES_DIR}/stackexchange`;
  const fetch = args.recorded
    ? createRecordedStackExchangeFetch({
        questions: await Bun.file(path.join(args.recorded, "questions.json")).json(),
        answers: await Bun.file(path.join(args.recorded, "answers.json")).json(),
      })
    : globalThis.fetch.bind(globalThis);

  const { items, skipped } = await fetchStackExchangeItems({
    fetch,
    site: args.site,
    tag: args.tag,
    minScore: int(args["min-score"], "min-score"),
    max: int(args.max, "max"),
  });

  for (const s of skipped) console.log(`  skip q${s.questionId}: ${s.reason}`);
  for (const item of items) {
    const flags = item.flags.length ? `  ⚠ ${item.flags.join("; ")}` : "";
    console.log(`  ${item.id}: "${item.title}" (${item.license}, ${item.credit})${flags}`);
  }
  const res = await writeRawItems(items, out, { dryRun: args["dry-run"] });
  const verb = args["dry-run"] ? "would write" : "wrote";
  console.log(`✓ ${items.length} item(s): ${verb} ${res.written.length}, unchanged ${res.unchanged.length} → ${out}/`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
