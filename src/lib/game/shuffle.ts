/**
 * Deterministic shuffle using seed string
 * Uses Fisher-Yates algorithm with seeded PRNG for reproducibility
 *
 * @param array - Array to shuffle (not mutated)
 * @param seed - Seed string for deterministic results
 * @returns New shuffled array
 */
export function shuffleArray<T>(array: T[], seed: string): T[] {
  const result = [...array];
  const random = seedRandom(seed);

  // Fisher-Yates shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

/**
 * Shuffle card IDs with a deck-specific seed
 * Ensures same deck always shuffles the same way for a given seed
 */
export function shuffleCardIds(cardIds: string[], deckId: string): string[] {
  return shuffleArray(cardIds, deckId);
}

/**
 * Shuffle card IDs with round-specific seed (for Monikers)
 * Each round gets a different but deterministic shuffle
 */
export function shuffleForRound(
  cardIds: string[],
  deckId: string,
  round: number
): string[] {
  return shuffleArray(cardIds, `${deckId}-round-${round}`);
}

/**
 * Create a seeded random number generator
 * Uses mulberry32 algorithm - fast and has good distribution
 *
 * @param seed - Seed string
 * @returns Function that returns random numbers between 0 and 1
 */
function seedRandom(seed: string): () => number {
  let h = hashString(seed);

  return function mulberry32() {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simple string hash function (djb2)
 * Converts string to 32-bit integer for seeding
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // Convert to unsigned 32-bit
}

/**
 * Get a random item from an array using seed
 */
export function randomItem<T>(array: T[], seed: string): T | undefined {
  if (array.length === 0) return undefined;
  const random = seedRandom(seed);
  const index = Math.floor(random() * array.length);
  return array[index];
}

/**
 * Generate a random subset of items from array
 */
export function randomSubset<T>(
  array: T[],
  count: number,
  seed: string
): T[] {
  const shuffled = shuffleArray(array, seed);
  return shuffled.slice(0, Math.min(count, array.length));
}
