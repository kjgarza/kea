#!/usr/bin/env bun
/**
 * Deck Generation Script
 *
 * Usage:
 *   bun scripts/generate-decks.ts --all              # Generate all decks
 *   bun scripts/generate-decks.ts --deck animals     # Generate specific deck
 *   bun scripts/generate-decks.ts --dry-run          # Preview without calling API
 */

import { parseArgs } from "util";
import {
  loadAllConfigs,
  loadConfig,
  generateDeckIdFromConfig,
  type DeckSourceConfig,
} from "./lib/config-loader";
import { buildContext, truncateContext } from "./lib/context-fetcher";
import { generateCards } from "./lib/llm-client";
import { validateCard, deduplicateCards } from "./lib/validators";
import { buildPrompt, type PromptContext } from "./prompts";
import type { Card } from "../src/types/card";
import type { Deck, DeckIndex, DeckMeta } from "../src/types/deck";

const SOURCE_DIR = "./decks/source";
const OUTPUT_DIR = "./public/decks";

// Parse CLI arguments
const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    all: { type: "boolean", default: false },
    deck: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (args.help) {
  console.log(`
Deck Generation Script

Usage:
  bun scripts/generate-decks.ts --all              Generate all decks
  bun scripts/generate-decks.ts --deck <name>      Generate specific deck (without .yaml)
  bun scripts/generate-decks.ts --dry-run          Preview without calling API
  bun scripts/generate-decks.ts --help             Show this help

Examples:
  bun scripts/generate-decks.ts --all
  bun scripts/generate-decks.ts --deck animals-en-charades
  bun scripts/generate-decks.ts --deck animals-en-charades --dry-run
`);
  process.exit(0);
}

/**
 * Generate a single deck from config
 */
async function generateDeck(
  configName: string,
  config: DeckSourceConfig,
  dryRun: boolean
): Promise<Deck | null> {
  const deckId = generateDeckIdFromConfig(config);
  console.log(`\n📦 Generating deck: ${deckId}`);
  console.log(`   Game: ${config.gameType}, Cards: ${config.cardCount}`);

  // Build context from markdown + URLs (in parallel)
  console.log("   Fetching context...");
  const rawContext = await buildContext(config);
  const context = truncateContext(rawContext);

  // Build prompts
  const promptCtx: PromptContext = { config, context };
  const { systemPrompt, userPrompt } = buildPrompt(config.gameType, promptCtx);

  if (dryRun) {
    console.log("\n   [DRY RUN] Would send prompt:");
    console.log("   System:", systemPrompt.slice(0, 200) + "...");
    console.log("   User:", userPrompt.slice(0, 200) + "...");
    return null;
  }

  // Generate cards via LLM
  console.log("   Calling OpenAI API...");
  const result = await generateCards(systemPrompt, userPrompt);

  if (!result.success || !result.data) {
    console.error(`   ❌ Generation failed: ${result.error}`);
    return null;
  }

  console.log(`   Received ${result.data.length} raw cards`);

  // Validate and transform cards
  console.log("   Validating cards...");
  const validCards: Card[] = [];
  let invalidCount = 0;

  for (let i = 0; i < result.data.length; i++) {
    const cardId = generateCardId(deckId, i);
    const validation = validateCard(result.data[i], config.gameType, cardId);

    if (validation.valid && validation.card) {
      validCards.push(validation.card);
    } else {
      invalidCount++;
      if (invalidCount <= 3) {
        console.warn(`   ⚠️  Card ${i} invalid:`, validation.errors.join(", "));
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

  // Build deck object
  const deck: Deck = {
    schemaVersion: 1,
    deckId,
    version: new Date().toISOString(),
    name: config.name,
    gameType: config.gameType,
    language: config.language,
    difficulty: config.difficulty,
    topics: config.topics,
    nsfw: config.nsfw,
    cards: uniqueCards,
  };

  return deck;
}

/**
 * Generate a simple card ID
 */
function generateCardId(deckId: string, index: number): string {
  const prefix = deckId.slice(0, 2);
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
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
 * Update the deck index
 */
async function updateIndex(decks: Deck[]): Promise<void> {
  const indexPath = `${OUTPUT_DIR}/index.json`;

  // Load existing index or create new
  let index: DeckIndex;
  try {
    const existing = await Bun.file(indexPath).json();
    index = existing as DeckIndex;
  } catch {
    index = { schemaVersion: 1, decks: [] };
  }

  // Update/add deck metadata
  for (const deck of decks) {
    const meta: DeckMeta = {
      deckId: deck.deckId,
      name: deck.name,
      gameType: deck.gameType,
      language: deck.language,
      difficulty: deck.difficulty,
      topics: deck.topics,
      recommended: true, // TODO: get from config
      nsfw: deck.nsfw,
      version: deck.version,
      cardCount: deck.cards.length,
    };

    // Find and update existing, or add new
    const existingIdx = index.decks.findIndex((d) => d.deckId === deck.deckId);
    if (existingIdx >= 0) {
      index.decks[existingIdx] = meta;
    } else {
      index.decks.push(meta);
    }
  }

  // Sort by name
  index.decks.sort((a, b) => a.name.localeCompare(b.name));

  await Bun.write(indexPath, JSON.stringify(index, null, 2));
  console.log(`\n📋 Updated ${indexPath} (${index.decks.length} decks)`);
}

/**
 * Main entry point
 */
async function main() {
  console.log("🎴 Deck Generator\n");

  // Check for API key
  if (!process.env.OPENAI_API_KEY && !args["dry-run"]) {
    console.error("❌ OPENAI_API_KEY environment variable is required");
    console.error("   Set it with: export OPENAI_API_KEY=your-key");
    process.exit(1);
  }

  const dryRun = args["dry-run"] ?? false;
  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No API calls will be made\n");
  }

  let configs: Map<string, DeckSourceConfig>;

  if (args.deck) {
    // Single deck mode
    const configPath = `${SOURCE_DIR}/${args.deck}.yaml`;
    try {
      const config = await loadConfig(configPath);
      configs = new Map([[args.deck, config]]);
    } catch (error) {
      console.error(`❌ Could not load config: ${configPath}`);
      process.exit(1);
    }
  } else if (args.all) {
    // All decks mode
    configs = await loadAllConfigs(SOURCE_DIR);
    console.log(`Found ${configs.size} deck configs`);
  } else {
    console.error("❌ Please specify --all or --deck <name>");
    console.error("   Run with --help for usage");
    process.exit(1);
  }

  // Generate decks in parallel
  const configEntries = Array.from(configs.entries());
  const results = await Promise.all(
    configEntries.map(([name, config]) => generateDeck(name, config, dryRun))
  );

  // Filter successful decks
  const successfulDecks = results.filter((d): d is Deck => d !== null);

  if (dryRun) {
    console.log("\n🔍 Dry run complete - no files written");
    return;
  }

  if (successfulDecks.length === 0) {
    console.log("\n⚠️  No decks were generated successfully");
    return;
  }

  // Write decks in parallel
  await Promise.all(successfulDecks.map(writeDeck));

  // Update index
  await updateIndex(successfulDecks);

  console.log(`\n✨ Done! Generated ${successfulDecks.length} deck(s)`);
}

// Run
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
