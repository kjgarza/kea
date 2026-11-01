import type { Deck, DeckIndex, DeckMeta } from "../../src/types/deck";
import { deckContentWarnings } from "../../src/lib/data/content-warnings";

/**
 * The one place scripts build `DeckMeta` entries and write
 * `public/decks/index.json`, so every importer/generator computes derived
 * fields (cardCount, contentWarnings) the same way.
 */

export interface DeckIndexEntry {
  deck: Deck;
  recommended: boolean;
}

/** Index metadata for a deck. */
export function buildDeckMeta(deck: Deck, recommended: boolean): DeckMeta {
  return {
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
    contentWarnings: deckContentWarnings(deck.cards),
    // Only when set, so decks without a licence keep their index entry as is.
    ...(deck.license !== undefined ? { license: deck.license } : {}),
    ...(deck.attribution !== undefined ? { attribution: deck.attribution } : {}),
  };
}

/** Insert or replace entries (by deckId) and keep the index sorted by name. */
export function upsertDeckIndex(
  index: DeckIndex,
  entries: readonly DeckIndexEntry[]
): DeckIndex {
  const decks = [...index.decks];
  for (const { deck, recommended } of entries) {
    const meta = buildDeckMeta(deck, recommended);
    const existingIdx = decks.findIndex((d) => d.deckId === deck.deckId);
    if (existingIdx >= 0) {
      decks[existingIdx] = meta;
    } else {
      decks.push(meta);
    }
  }
  decks.sort((a, b) => a.name.localeCompare(b.name));
  return { ...index, decks };
}

/** Read the index at `indexPath`, or an empty one if missing/unreadable. */
export async function readDeckIndex(indexPath: string): Promise<DeckIndex> {
  try {
    return (await Bun.file(indexPath).json()) as DeckIndex;
  } catch {
    return { schemaVersion: 1, decks: [] };
  }
}

/** Read, upsert and write the index. Returns the written index. */
export async function updateDeckIndexFile(
  indexPath: string,
  entries: readonly DeckIndexEntry[]
): Promise<DeckIndex> {
  const index = upsertDeckIndex(await readDeckIndex(indexPath), entries);
  await Bun.write(indexPath, JSON.stringify(index, null, 2));
  return index;
}
