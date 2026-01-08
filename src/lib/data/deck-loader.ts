import type { DeckIndex, Deck, DeckMeta } from "@/types/deck";
import type { GameType } from "@/types/game";
import { withBasePath } from "@/lib/utils/base-path";

// In-memory cache for loaded data
let deckIndexCache: DeckIndex | null = null;
const deckCache = new Map<string, Deck>();

/**
 * Load the deck index (cached in memory)
 */
export async function loadDeckIndex(): Promise<DeckIndex> {
  if (deckIndexCache) {
    return deckIndexCache;
  }

  const response = await fetch(withBasePath("/decks/index.json"));
  if (!response.ok) {
    throw new Error(`Failed to load deck index: ${response.status}`);
  }

  const index: DeckIndex = await response.json();
  deckIndexCache = index;
  return index;
}

/**
 * Load a specific deck by ID (cached in memory)
 */
export async function loadDeck(deckId: string): Promise<Deck> {
  const cached = deckCache.get(deckId);
  if (cached) {
    return cached;
  }

  const response = await fetch(withBasePath(`/decks/${deckId}.json`));
  if (!response.ok) {
    if (response.status === 404) {
      throw new DeckNotFoundError(deckId);
    }
    throw new Error(`Failed to load deck: ${response.status}`);
  }

  const deck: Deck = await response.json();
  deckCache.set(deckId, deck);
  return deck;
}

/**
 * Get deck metadata filtered by game type
 */
export async function getDecksForGame(gameType: GameType): Promise<DeckMeta[]> {
  const index = await loadDeckIndex();
  return index.decks.filter((deck) => deck.gameType === gameType);
}

/**
 * Get a single deck's metadata from the index
 */
export async function getDeckMeta(deckId: string): Promise<DeckMeta | null> {
  const index = await loadDeckIndex();
  return index.decks.find((deck) => deck.deckId === deckId) ?? null;
}

/**
 * Get all unique languages from decks
 */
export async function getAvailableLanguages(): Promise<string[]> {
  const index = await loadDeckIndex();
  const languages = new Set(index.decks.map((deck) => deck.language));
  return Array.from(languages).sort();
}

/**
 * Get all unique topics from decks for a specific game type
 */
export async function getAvailableTopics(gameType: GameType): Promise<string[]> {
  const decks = await getDecksForGame(gameType);
  const topics = new Set(decks.flatMap((deck) => deck.topics));
  return Array.from(topics).sort();
}

/**
 * Clear all caches (useful for testing or force refresh)
 */
export function clearDeckCache(): void {
  deckIndexCache = null;
  deckCache.clear();
}

/**
 * Prefetch a deck into the cache
 */
export async function prefetchDeck(deckId: string): Promise<void> {
  if (!deckCache.has(deckId)) {
    await loadDeck(deckId);
  }
}

// Custom error for deck not found
export class DeckNotFoundError extends Error {
  constructor(public deckId: string) {
    super(`Deck not found: ${deckId}`);
    this.name = "DeckNotFoundError";
  }
}
