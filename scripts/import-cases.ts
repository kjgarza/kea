#!/usr/bin/env bun
/**
 * Case File Importer (issue #36)
 *
 * Imports hand-written case packs from `decks/cases/<pack>-<lang>.yaml` into
 * `public/decks/<deckId>.json`, copies their evidence files from
 * `decks/cases/assets/<pack>/` (or its `<lang>/` folder) to
 * `public/decks/assets/<deckId>/`, and updates the deck index. See the README
 * ("Importing hand-written case files") for the YAML format.
 *
 * Usage:
 *   bun scripts/import-cases.ts                                # every pack in decks/cases/
 *   bun scripts/import-cases.ts --file decks/cases/saltmarsh-bay-en.yaml
 *   bun scripts/import-cases.ts --dry-run                      # validate only
 */

import { parseArgs } from "util";
import { CASE_PACK_DIR } from "./lib/case-pack";
import { importCaseFile } from "./lib/case-import";

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
Case File Importer

Usage:
  bun scripts/import-cases.ts                    Import every pack in ${CASE_PACK_DIR}/
  bun scripts/import-cases.ts --file <path>      Import one pack (repeatable)
  bun scripts/import-cases.ts --dry-run          Validate without writing files
  bun scripts/import-cases.ts --help             Show this help
`);
  process.exit(0);
}

async function listPackFiles(): Promise<string[]> {
  const glob = new Bun.Glob("*.{yaml,yml}");
  const files: string[] = [];
  for await (const f of glob.scan({ cwd: CASE_PACK_DIR })) {
    files.push(`${CASE_PACK_DIR}/${f}`);
  }
  return files.sort();
}

async function main() {
  const dryRun = args["dry-run"] ?? false;
  const files = args.file?.length ? args.file : await listPackFiles();
  if (files.length === 0) {
    console.error(`No case packs found in ${CASE_PACK_DIR}/`);
    process.exit(1);
  }

  let failed = 0;
  for (const file of files) {
    const result = await importCaseFile(file, { outputDir: OUTPUT_DIR, dryRun });
    if (result.errors.length > 0) {
      failed++;
      console.error(`✗ ${file}: ${result.errors.length} problem(s)`);
      for (const e of result.errors) console.error(`  - ${e}`);
      continue;
    }
    const deck = result.deck!;
    const status = result.changed ? "updated" : "unchanged";
    const verb = dryRun ? "valid" : `written (${status})`;
    console.log(
      `✓ ${file} → ${deck.deckId}: ${deck.cards.length} case(s), ${result.assets.length} asset(s) ${verb}`
    );
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
