#!/usr/bin/env bun
/**
 * Import Just One Text File
 *
 * Converts a numbered word list (e.g. the `justone` file) into a deck JSON
 * compatible with the app format.
 *
 * Usage:
 *   bun scripts/import-justone-text.ts                     # uses ./justone
 *   bun scripts/import-justone-text.ts --file path/to/file
 */

import { parseArgs } from "util";
import type { JustOneCard } from "../src/types/card";
import type { Deck, DeckIndex, DeckMeta } from "../src/types/deck";

const OUTPUT_DIR = "./public/decks";

const DECK_ID = "classic-en-justone";
const DECK_META = {
  name: "Classic Just One",
  gameType: "justone" as const,
  language: "en",
  difficulty: "medium" as const,
  topics: ["general"],
  nsfw: false,
};

const DECK_RECOMMENDED = true;

const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    file: { type: "string", default: "./justone" },
    help: { type: "boolean", default: false },
  },
});

if (args.help) {
  console.log(`
Import Just One Text File

Usage:
  bun scripts/import-justone-text.ts                  Use default ./justone file
  bun scripts/import-justone-text.ts --file <path>    Use custom file path
`);
  process.exit(0);
}

function toTitleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

async function parseWordFile(filePath: string): Promise<string[]> {
  const file = Bun.file(filePath);
  const text = await file.text();
  const words: string[] = [];

  for (const line of text.split("\n")) {
    const match = line.trim().match(/^\d+\.\s+(.+)$/);
    if (match) {
      words.push(match[1].trim());
    }
  }

  return words;
}

async function updateIndex(deck: Deck): Promise<void> {
  const indexPath = `${OUTPUT_DIR}/index.json`;

  let index: DeckIndex;
  try {
    index = await Bun.file(indexPath).json();
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
    recommended: DECK_RECOMMENDED,
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
  console.log(`Updated ${indexPath} (${index.decks.length} decks)`);
}

async function main() {
  const filePath = args.file!;
  console.log(`Importing from: ${filePath}`);

  const words = await parseWordFile(filePath);
  console.log(`Parsed ${words.length} words`);

  const cards: JustOneCard[] = words.map((word, i) => ({
    cardId: `ju-${String(i + 1).padStart(3, "0")}`,
    type: "justone",
    target: toTitleCase(word),
  }));

  const deck: Deck<JustOneCard> = {
    schemaVersion: 1,
    deckId: DECK_ID,
    version: new Date().toISOString(),
    ...DECK_META,
    cards,
  };

  const outPath = `${OUTPUT_DIR}/${DECK_ID}.json`;
  await Bun.write(outPath, JSON.stringify(deck, null, 2));
  console.log(`Written ${cards.length} cards to ${outPath}`);

  await updateIndex(deck);
  console.log("Done!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
