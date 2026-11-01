#!/usr/bin/env bun
/**
 * Deck Translation Script — English → Spanish
 *
 * Usage:
 *   bun scripts/translate-decks.ts --all              # Translate all English decks
 *   bun scripts/translate-decks.ts --deck animals-en-charades  # Translate one deck
 *   bun scripts/translate-decks.ts --all --force      # Re-translate even if Spanish exists
 *   bun scripts/translate-decks.ts --all --dry-run    # Preview without API calls
 */

import { parseArgs } from "util";
import { generateBatch, generateWithRetry } from "./lib/llm-client";
import type { Card, CaseCard } from "../src/types/card";
import {
  TRANSLATION_BATCH_SIZE,
  isTranslatableGameType,
  toSpanishDeckId,
  translatedDeckLicensing,
  translateCardsWith,
  untranslatableGameTypeMessage,
} from "./lib/deck-translation";
import type { Deck, DeckIndex } from "../src/types/deck";
import { updateDeckIndexFile } from "./lib/deck-index";
import { copyDeckAssets, createFileAssetExists } from "./lib/case-assets";
import { deckAssetPaths } from "./lib/case-pack";
import { validateCaseDeck } from "./lib/validators";

const OUTPUT_DIR = "./public/decks";
const TRANSLATION_TEMPERATURE = 0.3;
const TRANSLATION_MODEL = "gpt-4o-mini";

// Parse CLI arguments
const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    all: { type: "boolean", default: false },
    deck: { type: "string" },
    force: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (args.help) {
  console.log(`
Deck Translation Script (English → Spanish)

Usage:
  bun scripts/translate-decks.ts --all                 Translate all English decks
  bun scripts/translate-decks.ts --deck <deckId>       Translate a specific deck
  bun scripts/translate-decks.ts --all --force         Re-translate even if Spanish version exists
  bun scripts/translate-decks.ts --all --dry-run       Preview without API calls or file writes
  bun scripts/translate-decks.ts --help                Show this help

Examples:
  bun scripts/translate-decks.ts --all
  bun scripts/translate-decks.ts --deck animals-en-charades
  bun scripts/translate-decks.ts --deck animals-en-charades --dry-run
`);
  process.exit(0);
}

/**
 * Translate the deck name to Spanish
 */
async function translateDeckName(name: string, dryRun: boolean): Promise<string> {
  if (dryRun) return `${name} (ES)`;

  const result = await generateWithRetry(
    "You are a professional English to Spanish translator. Return only a JSON object with the translated name.",
    `Translate this party game deck name to Spanish. Return JSON: { "name": "..." }\n\nDeck name: "${name}"`,
    (content) => {
      const parsed = JSON.parse(content);
      return typeof parsed.name === "string" ? parsed.name : name;
    },
    TRANSLATION_TEMPERATURE,
    TRANSLATION_MODEL
  );

  return result.success && result.data ? result.data : name;
}

/**
 * Translate all cards in a deck using parallel batching
 */
async function translateCards(
  cards: Card[],
  gameType: string,
  dryRun: boolean
): Promise<Card[]> {
  const batchCount = Math.ceil(cards.length / TRANSLATION_BATCH_SIZE);
  console.log(`   Translating ${cards.length} cards in ${batchCount} batch(es)...`);

  if (dryRun) {
    console.log(
      `   [DRY RUN] Would send ${batchCount} batch(es) of up to ${TRANSLATION_BATCH_SIZE} cards each`
    );
    return cards; // Return original cards unchanged
  }

  // Run batches in parallel (concurrency 5)
  const { cards: translatedCards, failedBatches } = await translateCardsWith(
    cards,
    gameType,
    (prompts) =>
      generateBatch(
        prompts,
        (content) => {
          const parsed = JSON.parse(content);
          return (Array.isArray(parsed.cards) ? parsed.cards : []) as Record<string, unknown>[];
        },
        5,
        TRANSLATION_TEMPERATURE,
        TRANSLATION_MODEL
      ),
    { warn: (message) => console.warn(`   ⚠️  ${message}`) }
  );

  if (failedBatches > 0) {
    console.warn(`   ⚠️  ${failedBatches} batch(es) failed — those cards kept in English`);
  }

  return translatedCards;
}

/**
 * Translate a single deck
 */
async function translateDeck(
  sourceDeck: Deck,
  force: boolean,
  dryRun: boolean
): Promise<Deck | null> {
  if (!isTranslatableGameType(sourceDeck.gameType)) {
    console.log(`   ⚠️  Skipping ${sourceDeck.deckId} — ${untranslatableGameTypeMessage(sourceDeck.gameType)}`);
    return null;
  }

  const spanishDeckId = toSpanishDeckId(sourceDeck.deckId);

  if (spanishDeckId === sourceDeck.deckId) {
    console.log(`   ⚠️  Skipping ${sourceDeck.deckId} — no '-en-' in ID, cannot derive Spanish ID`);
    return null;
  }

  // Check if Spanish version already exists
  if (!force && !dryRun) {
    const existingPath = `${OUTPUT_DIR}/${spanishDeckId}.json`;
    const existingFile = Bun.file(existingPath);
    if (await existingFile.exists()) {
      console.log(`   ⏭️  Skipping — ${spanishDeckId}.json already exists (use --force to overwrite)`);
      return null;
    }
  }

  // Translate the deck name
  console.log("   Translating deck name...");
  const spanishName = await translateDeckName(sourceDeck.name, dryRun);

  // Translate all cards
  const translatedCards = await translateCards(sourceDeck.cards, sourceDeck.gameType, dryRun);

  if (dryRun) {
    console.log(`   [DRY RUN] Would write: ${spanishDeckId}.json (${translatedCards.length} cards)`);
    console.log(`   [DRY RUN] Translated name: "${spanishName}"`);
    return null;
  }

  const spanishDeck: Deck = {
    schemaVersion: sourceDeck.schemaVersion,
    deckId: spanishDeckId,
    version: new Date().toISOString(),
    name: spanishName,
    gameType: sourceDeck.gameType,
    language: "es",
    difficulty: sourceDeck.difficulty,
    topics: sourceDeck.topics,
    nsfw: sourceDeck.nsfw,
    ...translatedDeckLicensing(sourceDeck),
    cards: translatedCards,
  };

  return spanishDeck;
}

/**
 * Load a deck JSON file
 */
async function loadDeck(deckId: string): Promise<Deck | null> {
  const filePath = `${OUTPUT_DIR}/${deckId}.json`;
  try {
    return await Bun.file(filePath).json() as Deck;
  } catch {
    console.error(`   ❌ Could not load deck: ${filePath}`);
    return null;
  }
}

/**
 * Case decks: copy the evidence files to the Spanish deck's asset folder
 * (same `src` paths; files already there are kept, so hand-localised images
 * survive) and validate the result. Returns false when the deck is invalid.
 */
async function prepareCaseDeck(source: Deck, translated: Deck): Promise<boolean> {
  const srcs = deckAssetPaths({ cards: translated.cards as CaseCard[] });
  const { copied, kept, missing } = await copyDeckAssets(source.deckId, translated.deckId, srcs);
  if (copied.length > 0) console.log(`   Copied ${copied.length} asset(s) to assets/${translated.deckId}/`);
  if (kept.length > 0) console.log(`   Kept ${kept.length} existing asset(s) in assets/${translated.deckId}/`);
  if (missing.length > 0) console.warn(`   ⚠️  Missing source assets: ${missing.join(", ")}`);
  const errors = validateCaseDeck(translated, { assetExists: createFileAssetExists() });
  if (errors.length > 0) {
    console.error(`   ❌ ${translated.deckId} is not a valid case deck; not written:`);
    for (const e of errors) console.error(`      - ${e}`);
    return false;
  }
  return true;
}

/**
 * Write deck to file
 */
async function writeDeck(deck: Deck): Promise<void> {
  const filePath = `${OUTPUT_DIR}/${deck.deckId}.json`;
  await Bun.write(filePath, JSON.stringify(deck, null, 2));
  console.log(`   Written to ${filePath}`);
}

/**
 * Update the deck index with translated decks
 */
async function updateIndex(decks: Deck[]): Promise<void> {
  const indexPath = `${OUTPUT_DIR}/index.json`;
  const index = await updateDeckIndexFile(
    indexPath,
    decks.map((deck) => ({ deck, recommended: true }))
  );
  console.log(`\n📋 Updated ${indexPath} (${index.decks.length} decks total)`);
}

/**
 * Get all English deck IDs from the index
 */
async function getEnglishDeckIds(): Promise<string[]> {
  const indexPath = `${OUTPUT_DIR}/index.json`;
  const index = await Bun.file(indexPath).json() as DeckIndex;
  return index.decks
    .filter((d) => d.language === "en" && d.deckId.includes("-en-"))
    .map((d) => d.deckId);
}

/**
 * Main entry point
 */
async function main() {
  console.log("🌐 Deck Translator (English → Spanish)\n");

  const dryRun = args["dry-run"] ?? false;
  const force = args.force ?? false;

  if (dryRun) {
    console.log("🔍 DRY RUN MODE — no API calls or file writes\n");
  }

  // Check for API key
  if (!process.env.OPENAI_API_KEY && !dryRun) {
    console.error("❌ OPENAI_API_KEY environment variable is required");
    console.error("   Set it with: export OPENAI_API_KEY=your-key");
    process.exit(1);
  }

  let deckIds: string[];

  if (args.deck) {
    deckIds = [args.deck];
  } else if (args.all) {
    deckIds = await getEnglishDeckIds();
    console.log(`Found ${deckIds.length} English deck(s) to translate`);
  } else {
    console.error("❌ Please specify --all or --deck <deckId>");
    console.error("   Run with --help for usage");
    process.exit(1);
  }

  const translated: Deck[] = [];

  for (const deckId of deckIds) {
    console.log(`\n📦 Translating: ${deckId}`);

    const sourceDeck = await loadDeck(deckId);
    if (!sourceDeck) continue;

    console.log(`   Game: ${sourceDeck.gameType}, Cards: ${sourceDeck.cards.length}`);

    const result = await translateDeck(sourceDeck, force, dryRun);
    if (result && result.gameType === "case" && !(await prepareCaseDeck(sourceDeck, result))) {
      continue;
    }
    if (result) {
      await writeDeck(result);
      translated.push(result);
      console.log(`   ✅ ${result.deckId} — ${result.cards.length} cards`);
    }
  }

  if (dryRun) {
    console.log("\n🔍 Dry run complete — no files written");
    return;
  }

  if (translated.length === 0) {
    console.log("\n⚠️  No decks were translated (all skipped or failed)");
    return;
  }

  await updateIndex(translated);
  console.log(`\n✨ Done! Translated ${translated.length} deck(s)`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
