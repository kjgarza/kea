#!/usr/bin/env bun
/**
 * Monikers Deck Importer
 *
 * Imports Monikers cards from the yene/Monikers open-source dataset,
 * splitting them into separate decks by Genre.
 *
 * Source: https://github.com/yene/Monikers/blob/master/cards.json
 *
 * Usage:
 *   bun scripts/import-monikers-deck.ts
 *   bun scripts/import-monikers-deck.ts --url <url>     Import from custom URL
 *   bun scripts/import-monikers-deck.ts --dry-run       Preview without writing files
 *   bun scripts/import-monikers-deck.ts --help          Show this help
 */

import { parseArgs } from "util";
import { validateCard, deduplicateCards } from "./lib/validators";
import type { Card } from "../src/types/card";
import type { Deck, DeckIndex, DeckMeta } from "../src/types/deck";

const SOURCE_URL =
  "https://raw.githubusercontent.com/yene/Monikers/master/cards.json";
const OUTPUT_DIR = "./public/decks";

interface SourceCard {
  Person: string;
  Text?: string;
  Genre: string;
  Points?: number;
}

interface GenreConfig {
  deckId: string;
  name: string;
  topics: string[];
}

const GENRE_CONFIGS: Record<string, GenreConfig> = {
  CELEBRITY: {
    deckId: "community-celebrity-en-monikers",
    name: "Community Monikers: Celebrities",
    topics: ["celebrities", "pop culture"],
  },
  "FICTIONAL CHARACTER": {
    deckId: "community-fictional-en-monikers",
    name: "Community Monikers: Fictional Characters",
    topics: ["fictional characters", "pop culture"],
  },
  "HISTORICAL FIGURE": {
    deckId: "community-historical-en-monikers",
    name: "Community Monikers: Historical Figures",
    topics: ["history", "famous people"],
  },
  "ET CETERA": {
    deckId: "community-etcetera-en-monikers",
    name: "Community Monikers: Et Cetera",
    topics: ["general", "mixed"],
  },
};

// Parse CLI arguments
const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    url: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (args.help) {
  console.log(`
Monikers Deck Importer

Usage:
  bun scripts/import-monikers-deck.ts                     Import from default URL
  bun scripts/import-monikers-deck.ts --url <url>         Import from custom URL
  bun scripts/import-monikers-deck.ts --dry-run           Preview without writing files
  bun scripts/import-monikers-deck.ts --help              Show this help

Default source:
  ${SOURCE_URL}
`);
  process.exit(0);
}

/**
 * Fetch JSON content from URL or local file
 */
async function fetchJson(source: string): Promise<SourceCard[]> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    console.log(`   Fetching from URL: ${source}`);
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch JSON: ${response.status} ${response.statusText}`
      );
    }
    return response.json();
  } else {
    console.log(`   Reading from file: ${source}`);
    return Bun.file(source).json();
  }
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
  console.log(`   📋 Updated ${indexPath} (${index.decks.length} decks)`);
}

/**
 * Main entry point
 */
async function main() {
  console.log("🎴 Monikers Deck Importer\n");

  const dryRun = args["dry-run"] ?? false;
  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No files will be written\n");
  }

  const source = args.url ?? SOURCE_URL;

  // Fetch source JSON
  console.log("📥 Loading source data...");
  let sourceCards: SourceCard[];
  try {
    sourceCards = await fetchJson(source);
  } catch (error) {
    console.error(`❌ Failed to load source: ${error}`);
    process.exit(1);
  }

  console.log(`   Found ${sourceCards.length} source cards`);

  // Group cards by Genre
  const byGenre = new Map<string, SourceCard[]>();
  let unknownGenreCount = 0;

  for (const card of sourceCards) {
    const genre = (card.Genre ?? "").trim().toUpperCase();
    if (!GENRE_CONFIGS[genre]) {
      unknownGenreCount++;
      continue;
    }
    if (!byGenre.has(genre)) byGenre.set(genre, []);
    byGenre.get(genre)!.push(card);
  }

  if (unknownGenreCount > 0) {
    console.warn(`   ⚠️  Skipped ${unknownGenreCount} cards with unknown genre`);
  }

  console.log(`\n📂 Genres found: ${[...byGenre.keys()].join(", ")}\n`);

  // Process each genre
  const results: Array<{ deckId: string; name: string; count: number }> = [];

  for (const [genre, cards] of byGenre.entries()) {
    const config = GENRE_CONFIGS[genre];
    const slug = config.deckId.split("-")[1]; // e.g. "celebrity"

    console.log(`🏷️  Processing "${genre}" (${cards.length} cards)...`);

    // Validate cards
    const validCards: Card[] = [];
    let invalidCount = 0;

    for (let i = 0; i < cards.length; i++) {
      const cardId = `mk-${slug}-${String(i + 1).padStart(3, "0")}`;
      const raw = {
        type: "monikers",
        phrase: cards[i].Person?.trim() ?? "",
        ...(cards[i].Text?.trim() ? { description: cards[i].Text!.trim() } : {}),
      };
      const validation = validateCard(raw, "monikers", cardId);

      if (validation.valid && validation.card) {
        validCards.push(validation.card);
      } else {
        invalidCount++;
        if (invalidCount <= 3) {
          console.warn(
            `   ⚠️  Card ${i} ("${cards[i].Person}") invalid: ${validation.errors.join(", ")}`
          );
        }
      }
    }

    if (invalidCount > 3) {
      console.warn(`   ⚠️  ... and ${invalidCount - 3} more invalid cards`);
    }

    // Deduplicate
    const uniqueCards = deduplicateCards(validCards);
    const dupeCount = validCards.length - uniqueCards.length;
    if (dupeCount > 0) {
      console.log(`   Removed ${dupeCount} duplicates`);
    }

    console.log(`   ✅ ${uniqueCards.length} valid unique cards`);

    if (dryRun) {
      if (uniqueCards.length > 0) {
        console.log("   Sample cards:");
        uniqueCards.slice(0, 3).forEach((c) => {
          if (c.type === "monikers") {
            console.log(`     - ${c.phrase}${c.description ? ` (${c.description.slice(0, 60)}...)` : ""}`);
          }
        });
      }
      results.push({ deckId: config.deckId, name: config.name, count: uniqueCards.length });
      console.log();
      continue;
    }

    if (uniqueCards.length === 0) {
      console.warn(`   ⚠️  No valid cards — skipping deck\n`);
      continue;
    }

    // Build deck
    const deck: Deck = {
      schemaVersion: 1,
      deckId: config.deckId,
      version: new Date().toISOString(),
      name: config.name,
      gameType: "monikers",
      language: "en",
      difficulty: "medium",
      topics: config.topics,
      nsfw: false,
      cards: uniqueCards,
    };

    // Write deck file
    const deckPath = `${OUTPUT_DIR}/${config.deckId}.json`;
    await Bun.write(deckPath, JSON.stringify(deck, null, 2));
    console.log(`   💾 Written to ${deckPath}`);

    // Update index
    await updateIndex(deck, true);

    results.push({ deckId: config.deckId, name: config.name, count: uniqueCards.length });
    console.log();
  }

  // Summary
  console.log("✨ Done!\n");
  console.log("Summary:");
  for (const r of results) {
    console.log(`  ${r.count.toString().padStart(4)} cards → ${r.name}`);
  }
}

// Run
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
