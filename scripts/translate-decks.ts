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
import type { Card } from "../src/types/card";
import type { Deck, DeckIndex, DeckMeta } from "../src/types/deck";

const OUTPUT_DIR = "./public/decks";
const BATCH_SIZE = 15;
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

const SYSTEM_PROMPT = `You are a professional translator specializing in English to Latin American Spanish translation for party games.
Translate the text fields of the provided game cards from English to Spanish.
Return a JSON object with a "cards" array containing the translated cards.
Preserve all cardId and type fields exactly as-is — never change them.
Only translate the text content fields (prompts, targets, phrases, questions, choices, answers, forbidden words).
Never add, remove, or reorder items in any arrays (for example: choices, forbidden). Only translate the text of existing items.
Preserve any index fields such as answerIndex exactly as provided. For multiple-choice (mcq) trivia cards, do not reorder the choices array; only translate the text of each choice so that the existing answerIndex continues to point to the same logical answer.
Keep proper nouns (names of people, brands, specific places) untranslated unless they have a well-known standard Spanish form.
Ensure the translations are natural and appropriate for a party game context.`;

/**
 * Extract just the translatable fields from a card (to minimize context sent to LLM)
 */
function extractTranslatableFields(card: Card): Record<string, unknown> {
  const base = { cardId: card.cardId, type: card.type };

  switch (card.type) {
    case "charades":
      return { ...base, prompt: card.prompt };
    case "justone":
      return { ...base, target: card.target };
    case "monikers":
      return { ...base, phrase: card.phrase };
    case "taboo":
      return { ...base, target: card.target, forbidden: card.forbidden };
    case "trivia":
      if (card.format === "mcq") {
        return {
          ...base,
          format: card.format,
          question: card.question,
          choices: card.choices,
          answerText: card.answerText,
          answerIndex: card.answerIndex,
        };
      } else {
        return {
          ...base,
          format: card.format,
          question: card.question,
          answerText: card.answerText,
        };
      }
  }
}

/**
 * Merge translated fields back into the original card structure
 */
function mergeTranslation(original: Card, translated: Record<string, unknown>): Card {
  switch (original.type) {
    case "charades":
      return { ...original, prompt: String(translated.prompt ?? original.prompt) };
    case "justone":
      return { ...original, target: String(translated.target ?? original.target) };
    case "monikers":
      return { ...original, phrase: String(translated.phrase ?? original.phrase) };
    case "taboo":
      return {
        ...original,
        target: String(translated.target ?? original.target),
        forbidden: Array.isArray(translated.forbidden)
          ? (translated.forbidden as string[])
          : original.forbidden,
      };
    case "trivia":
      if (original.format === "mcq") {
        // Safely merge MCQ translations while keeping answerIndex consistent.
        let mergedChoices = original.choices;
        let mergedAnswerIndex = original.answerIndex;

        if (Array.isArray(translated.choices)) {
          const candidateChoices = (translated.choices as unknown[]).filter(
            (c) => typeof c === "string"
          ) as string[];

          // Only accept translated choices if they are all strings and the length matches.
          if (candidateChoices.length === original.choices.length) {
            mergedChoices = candidateChoices;

            // If a translated answerIndex is provided and valid for the new choices, use it.
            if (
              typeof (translated as { answerIndex?: unknown }).answerIndex === "number" &&
              Number.isInteger(
                (translated as { answerIndex?: number }).answerIndex as number
              )
            ) {
              const translatedIndex = (translated as { answerIndex: number }).answerIndex;
              if (
                translatedIndex >= 0 &&
                translatedIndex < candidateChoices.length
              ) {
                mergedAnswerIndex = translatedIndex;
              }
            }
          }
        }

        return {
          ...original,
          question: String(translated.question ?? original.question),
          choices: mergedChoices,
          answerIndex: mergedAnswerIndex,
          answerText: String(translated.answerText ?? original.answerText),
        };
      } else {
        return {
          ...original,
          question: String(translated.question ?? original.question),
          answerText: String(translated.answerText ?? original.answerText),
        };
      }
  }
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
      return String(parsed.name ?? name);
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
  // Split into batches of BATCH_SIZE
  const batches: Card[][] = [];
  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    batches.push(cards.slice(i, i + BATCH_SIZE));
  }

  console.log(`   Translating ${cards.length} cards in ${batches.length} batch(es)...`);

  if (dryRun) {
    console.log(`   [DRY RUN] Would send ${batches.length} batch(es) of up to ${BATCH_SIZE} cards each`);
    return cards; // Return original cards unchanged
  }

  // Build prompts for all batches
  const prompts = batches.map((batch, i) => ({
    systemPrompt: SYSTEM_PROMPT,
    prompt: `Translate these ${gameType} game cards to Spanish:\n\n${JSON.stringify(
      batch.map(extractTranslatableFields)
    )}\n\nReturn: { "cards": [...] }`,
    batchIndex: i,
    originalBatch: batch,
  }));

  // Run batches in parallel (concurrency 5)
  const results = await generateBatch(
    prompts.map(({ systemPrompt, prompt }) => ({ systemPrompt, prompt })),
    (content) => {
      const parsed = JSON.parse(content);
      const translatedCards = Array.isArray(parsed.cards) ? parsed.cards : [];
      return translatedCards as Record<string, unknown>[];
    },
    5,
    TRANSLATION_TEMPERATURE,
    TRANSLATION_MODEL
  );

  // Merge results back
  const translatedCards: Card[] = [];
  let failedBatches = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const originalBatch = batches[i];

    if (!result.success || !result.data) {
      console.warn(`   ⚠️  Batch ${i + 1} failed: ${result.error} — keeping originals`);
      failedBatches++;
      translatedCards.push(...originalBatch);
      continue;
    }

    const translatedBatch = result.data as Array<{ cardId?: string } & Record<string, unknown>>;

    // Build a lookup map from cardId -> translated card so we don't depend on order
    const translatedById = new Map<string, (typeof translatedBatch)[number]>();
    for (const translated of translatedBatch) {
      if (translated && typeof translated.cardId === "string") {
        translatedById.set(translated.cardId, translated);
      }
    }

    for (const original of originalBatch) {
      const translated = translatedById.get(original.cardId);

      if (translated) {
        translatedCards.push(mergeTranslation(original, translated));
      } else {
        // No matching translation for this cardId — keep original to avoid data loss
        console.warn(
          `   ⚠️  No matching translated card for cardId ${original.cardId} in batch ${i + 1} — keeping original`
        );
        translatedCards.push(original);
      }
    }
  }

  if (failedBatches > 0) {
    console.warn(`   ⚠️  ${failedBatches} batch(es) failed — those cards kept in English`);
  }

  return translatedCards;
}

/**
 * Derive the Spanish deck ID from an English deck ID
 */
function toSpanishDeckId(deckId: string): string {
  return deckId.replace("-en-", "-es-");
}

/**
 * Translate a single deck
 */
async function translateDeck(
  sourceDeck: Deck,
  force: boolean,
  dryRun: boolean
): Promise<Deck | null> {
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

  let index: DeckIndex;
  try {
    index = await Bun.file(indexPath).json() as DeckIndex;
  } catch {
    index = { schemaVersion: 1, decks: [] };
  }

  for (const deck of decks) {
    const meta: DeckMeta = {
      deckId: deck.deckId,
      name: deck.name,
      gameType: deck.gameType,
      language: deck.language,
      difficulty: deck.difficulty,
      topics: deck.topics,
      recommended: true,
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
  }

  index.decks.sort((a, b) => a.name.localeCompare(b.name));
  await Bun.write(indexPath, JSON.stringify(index, null, 2));
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
