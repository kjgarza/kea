#!/usr/bin/env bun
/**
 * Story importer (issue #58)
 *
 * Takes a plain-text public-domain or openly licensed story and writes a raw
 * story item to `decks/sources/stories/<id>.json` (git-ignored). Project
 * Gutenberg headers and footers are stripped. Adapt it into a draft case
 * with `scripts/normalize-sources.ts`, review it, then import it. Check the
 * licence in BOTH the US and Spain first (docs/content-sources.md).
 *
 * Usage:
 *   bun scripts/import-story.ts --file story.txt --url <source page> \
 *     --author "Name" --license PDM-1.0 [--title "…"] [--lang en] [--id slug]
 *
 * Options:
 *   --file <path>        Plain-text story (required)
 *   --url <url>          Page the text came from (required)
 *   --author <name>      Author credit (required)
 *   --license <id>       Licence id from the allow-list, e.g. PDM-1.0, CC0-1.0, CC-BY-4.0 (required)
 *   --title <title>      Default: the first line of the text
 *   --lang <code>        Language of the text (default en)
 *   --id <slug>          Default: slug of the title
 *   --out <dir>          Output folder (default decks/sources/stories)
 *   --dry-run            Validate and print, write nothing
 */
import { parseArgs } from "node:util";
import { storyToRawItem } from "./lib/story-source";
import { RAW_SOURCES_DIR } from "./lib/raw-sources";
import { writeRawItems } from "./lib/raw-source-files";

const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    file: { type: "string" },
    url: { type: "string" },
    author: { type: "string" },
    license: { type: "string" },
    title: { type: "string" },
    lang: { type: "string" },
    id: { type: "string" },
    out: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (args.help || !args.file) {
  console.log(
    (await Bun.file(import.meta.path).text()).match(/\/\*\*([\s\S]*?)\*\//)![1].replace(/^ \* ?/gm, "")
  );
  process.exit(args.help ? 0 : 1);
}

async function main() {
  const text = await Bun.file(args.file!).text();
  const { item, errors } = storyToRawItem(text, {
    url: args.url ?? "",
    author: args.author ?? "",
    license: args.license ?? "",
    title: args.title,
    language: args.lang,
    id: args.id,
  });
  if (!item) {
    for (const e of errors) console.error(`  - ${e}`);
    console.error(`✗ ${args.file}: not imported`);
    process.exit(1);
  }
  const out = args.out ?? `${RAW_SOURCES_DIR}/stories`;
  const res = await writeRawItems([item], out, { dryRun: args["dry-run"] });
  const status = res.written.length ? (args["dry-run"] ? "would write" : "written") : "unchanged";
  console.log(`✓ ${item.id}: "${item.title}" by ${item.author} (${item.license}), ${item.text.length} chars, ${status} → ${out}/`);
  if (item.flags.length) console.log(`  ⚠ ${item.flags.join("; ")}`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
