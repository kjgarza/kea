#!/usr/bin/env bun
/**
 * Situation Puzzle Importer (issue #27)
 *
 * Imports hand-written puzzle packs from `decks/puzzles/<pack>-<lang>.yaml`
 * into `public/decks/<deckId>.json` and updates the deck index. See the
 * README ("Importing hand-written situation puzzles") for the YAML format.
 *
 * Usage:
 *   bun scripts/import-puzzles.ts                        # every pack in decks/puzzles/
 *   bun scripts/import-puzzles.ts --file decks/puzzles/kitchen-table-en.yaml
 *   bun scripts/import-puzzles.ts --dry-run              # validate only
 */

import { parseArgs } from "util";
import { PUZZLE_PACK_DIR } from "./lib/puzzle-pack";
import { importPuzzleFile } from "./lib/puzzle-import";

const OUTPUT_DIR = "./public/decks";

const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    file: { type: "string", multiple: true },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (args.help) {
  console.log(`
Situation Puzzle Importer

Usage:
  bun scripts/import-puzzles.ts                    Import every pack in ${PUZZLE_PACK_DIR}/
  bun scripts/import-puzzles.ts --file <path>      Import one pack (repeatable)
  bun scripts/import-puzzles.ts --dry-run          Validate without writing files
  bun scripts/import-puzzles.ts --help             Show this help
`);
  process.exit(0);
}

async function listPackFiles(): Promise<string[]> {
  const glob = new Bun.Glob("*.{yaml,yml}");
  const files: string[] = [];
  for await (const f of glob.scan({ cwd: PUZZLE_PACK_DIR })) {
    files.push(`${PUZZLE_PACK_DIR}/${f}`);
  }
  return files.sort();
}

async function main() {
  const dryRun = args["dry-run"] ?? false;
  const files = args.file?.length ? args.file : await listPackFiles();
  if (files.length === 0) {
    console.error(`No puzzle packs found in ${PUZZLE_PACK_DIR}/`);
    process.exit(1);
  }

  let failed = 0;
  for (const file of files) {
    const result = await importPuzzleFile(file, { outputDir: OUTPUT_DIR, dryRun });
    if (result.errors.length > 0) {
      failed++;
      console.error(`✗ ${file}: ${result.errors.length} problem(s)`);
      for (const e of result.errors) console.error(`  - ${e}`);
      continue;
    }
    const deck = result.deck!;
    const status = result.changed ? "updated" : "unchanged";
    const verb = dryRun ? "valid" : `written (${status})`;
    console.log(`✓ ${file} → ${deck.deckId}: ${deck.cards.length} puzzles ${verb}`);
  }

  if (failed > 0) {
    console.error(`\n${failed} pack(s) failed validation; nothing was written for them.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
