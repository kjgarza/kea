import type { RandomFilters } from "./types";

/**
 * Random pick with filters (F4). Pure: the caller passes the candidates, the
 * set of card ids the selected group has played, and a random source.
 */

/** The fields of a puzzle card the filters look at. */
export interface PickCandidate {
  cardId: string;
  estMinutes?: number;
  contentWarnings?: string[];
}

export const DEFAULT_RANDOM_FILTERS: RandomFilters = {
  unplayed: true,
  maxMinutes: null,
  excludeWarnings: false,
};

/** Choices offered for the max-minutes filter (null = any). */
export const MAX_MINUTES_OPTIONS = [null, 5, 10, 15, 20, 30] as const;

/**
 * Whether the filters let `card` through. A card without an estimate passes
 * a max-minutes filter (we cannot say it is too long).
 */
export function passesFilters(
  card: PickCandidate,
  filters: RandomFilters,
  played: ReadonlySet<string>
): boolean {
  if (filters.unplayed && played.has(card.cardId)) return false;
  if (
    filters.maxMinutes !== null &&
    card.estMinutes !== undefined &&
    card.estMinutes > filters.maxMinutes
  ) {
    return false;
  }
  if (filters.excludeWarnings && (card.contentWarnings ?? []).length > 0) return false;
  return true;
}

export function filterCandidates<C extends PickCandidate>(
  cards: readonly C[],
  filters: RandomFilters,
  played: ReadonlySet<string>
): C[] {
  return cards.filter((c) => passesFilters(c, filters, played));
}

/**
 * Pick one card uniformly at random from those that pass the filters, or
 * null when none do. `random` returns a number in [0, 1) (Math.random).
 */
export function pickRandom<C extends PickCandidate>(
  cards: readonly C[],
  filters: RandomFilters,
  played: ReadonlySet<string>,
  random: () => number = Math.random
): C | null {
  const pool = filterCandidates(cards, filters, played);
  if (pool.length === 0) return null;
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[Math.max(0, index)];
}

export function isRandomFilters(value: unknown): value is RandomFilters {
  if (typeof value !== "object" || value === null) return false;
  const f = value as Record<string, unknown>;
  return (
    typeof f.unplayed === "boolean" &&
    typeof f.excludeWarnings === "boolean" &&
    (f.maxMinutes === null || typeof f.maxMinutes === "number")
  );
}
