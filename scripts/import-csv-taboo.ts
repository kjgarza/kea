#!/usr/bin/env bun
/**
 * Taboo CSV Importer
 *
 * Imports Taboo cards from a CSV file (local or remote) into the deck format.
 * CSV format: index,TARGET WORD,"forbidden1,forbidden2,forbidden3,forbidden4,forbidden5"
 *
 * Source: https://github.com/nehasinha/Taboo/blob/master/assets/cards.csv
 *
 * Usage:
 *   bun scripts/import-csv-taboo.ts
 *   bun scripts/import-csv-taboo.ts --file ./local.csv
 *   bun scripts/import-csv-taboo.ts --dry-run
 */

import { parseArgs } from "util";
import { validateCard, deduplicateCards } from "./lib/validators";
import type { Card } from "../src/types/card";
import type { Deck, DeckIndex, DeckMeta } from "../src/types/deck";

const CSV_URL =
  "https://raw.githubusercontent.com/nehasinha/Taboo/master/assets/cards.csv";
const OUTPUT_DIR = "./public/decks";
const DECK_ID = "community-taboo-en-taboo";

const DECK_META = {
  name: "Community Taboo Cards",
  gameType: "taboo" as const,
  language: "en",
  difficulty: "medium" as const,
  topics: ["general", "mixed"],
  nsfw: false,
  recommended: true,
};

// Parse CLI arguments
const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    file: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (args.help) {
  console.log(`
Taboo CSV Importer

Usage:
  bun scripts/import-csv-taboo.ts                     Import from default URL
  bun scripts/import-csv-taboo.ts --file <path>       Import from local CSV file
  bun scripts/import-csv-taboo.ts --dry-run           Preview without writing files
  bun scripts/import-csv-taboo.ts --help              Show this help

Default source:
  ${CSV_URL}
`);
  process.exit(0);
}

/**
 * Fetch CSV content from URL or local file
 */
async function fetchCsv(source: string): Promise<string> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    console.log(`   Fetching from URL: ${source}`);
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
    }
    return response.text();
  } else {
    console.log(`   Reading from file: ${source}`);
    return Bun.file(source).text();
  }
}

/**
 * Parse a CSV line that may contain quoted fields with commas inside.
 * Format: index,"TARGET","word1,word2,word3,word4,word5"
 * or:     index,TARGET,"word1,word2,word3,word4,word5"
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parse CSV text into raw card objects
 */
function parseCsv(csv: string): Array<{ target: string; forbidden: string[] }> {
  const lines = csv.split(/\r?\n|\r/).filter((l) => l.trim().length > 0);
  const rawCards: Array<{ target: string; forbidden: string[] }> = [];

  for (const line of lines) {
    const fields = parseCsvLine(line);
    // Expected: [index, target, "word1,word2,word3,word4,word5"]
    if (fields.length < 3) continue;

    const target = fields[1].trim();
    const forbiddenRaw = fields[2].trim();

    if (!target || !forbiddenRaw) continue;

    // The forbidden words are comma-separated within the third field
    const forbidden = forbiddenRaw
      .split(",")
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    if (forbidden.length === 0) continue;

    rawCards.push({ target, forbidden });
  }

  return rawCards;
}

/**
 * Update the deck index file
 */
async function updateIndex(deck: Deck, recommended: boolean): Promise<void> {
  const indexPath = `${OUTPUT_DIR}/index.json`;

  let index: DeckIndex;
  try {
    const existing = await Bun.file(indexPath).json();
    index = existing as DeckIndex;
  } catch {
    index = { schemaVersion: 1, decks: [] };
  }

  const meta: DeckMeta = {
    deckId: deck.deckId,
    name: deck.name,
    gameType: deck.gameType,
    language: deck.language,
    difficulty: deck.difficulty,
    topics: deck.topics,
    recommended,
    nsfw: deck.nsfw,
    version: deck.version,
    cardCount: deck.cards.length,
  };

  const existingIdx = index.decks.findIndex((d) => d.deckId === deck.deckId);
  if (existingIdx >= 0) {
    index.decks[existingIdx] = meta;
  } else {
    index.decks.push(meta);
  }

  index.decks.sort((a, b) => a.name.localeCompare(b.name));

  await Bun.write(indexPath, JSON.stringify(index, null, 2));
  console.log(`\n📋 Updated ${indexPath} (${index.decks.length} decks)`);
}

/**
 * Main entry point
 */
async function main() {
  console.log("🎴 Taboo CSV Importer\n");

  const dryRun = args["dry-run"] ?? false;
  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No files will be written\n");
  }

  const source = args.file ?? CSV_URL;

  // Fetch CSV
  console.log("📥 Loading CSV...");
  let csvText: string;
  try {
    csvText = await fetchCsv(source);
  } catch (error) {
    console.error(`❌ Failed to load CSV: ${error}`);
    process.exit(1);
  }

  // Parse CSV
  console.log("   Parsing rows...");
  const rawCards = parseCsv(csvText);
  console.log(`   Found ${rawCards.length} raw rows`);

  // Validate cards
  console.log("\n✅ Validating cards...");
  const validCards: Card[] = [];
  let invalidCount = 0;

  for (let i = 0; i < rawCards.length; i++) {
    const cardId = `tb-csv-${String(i + 1).padStart(3, "0")}`;
    const raw = { ...rawCards[i], type: "taboo" };
    const validation = validateCard(raw, "taboo", cardId);

    if (validation.valid && validation.card) {
      validCards.push(validation.card);
    } else {
      invalidCount++;
      if (invalidCount <= 5) {
        console.warn(
          `   ⚠️  Row ${i} ("${rawCards[i].target}") invalid: ${validation.errors.join(", ")}`
        );
      }
    }
  }

  if (invalidCount > 5) {
    console.warn(`   ⚠️  ... and ${invalidCount - 5} more invalid rows`);
  }

  console.log(`   Valid: ${validCards.length}, Invalid: ${invalidCount}`);

  // Deduplicate
  const uniqueCards = deduplicateCards(validCards);
  const dupeCount = validCards.length - uniqueCards.length;
  if (dupeCount > 0) {
    console.log(`   Removed ${dupeCount} duplicates`);
  }

  console.log(`   ✅ ${uniqueCards.length} valid unique cards`);

  if (dryRun) {
    console.log("\n🔍 Dry run complete - no files written");
    if (uniqueCards.length > 0) {
      console.log("\nSample cards:");
      uniqueCards.slice(0, 3).forEach((c) => {
        if (c.type === "taboo") {
          console.log(`  - ${c.target}: [${c.forbidden.join(", ")}]`);
        }
      });
    }
    return;
  }

  if (uniqueCards.length === 0) {
    console.error("\n❌ No valid cards to write");
    process.exit(1);
  }

  // Build deck
  const deck: Deck = {
    schemaVersion: 1,
    deckId: DECK_ID,
    version: new Date().toISOString(),
    name: DECK_META.name,
    gameType: DECK_META.gameType,
    language: DECK_META.language,
    difficulty: DECK_META.difficulty,
    topics: DECK_META.topics,
    nsfw: DECK_META.nsfw,
    cards: uniqueCards,
  };

  // Write deck file
  const deckPath = `${OUTPUT_DIR}/${DECK_ID}.json`;
  await Bun.write(deckPath, JSON.stringify(deck, null, 2));
  console.log(`\n💾 Written to ${deckPath}`);

  // Update index
  await updateIndex(deck, DECK_META.recommended);

  console.log(`\n✨ Done! Imported ${uniqueCards.length} cards as "${DECK_META.name}"`);
}

// Run
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
