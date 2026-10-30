import type { Card } from "@/types/card";
import type { Deck } from "@/types/deck";
import type { BaseSessionState } from "@/types/session";
import { CURRENT_SCHEMA_VERSION } from "@/types/session";
import { shuffleArray } from "@/lib/game/shuffle";
import type { StartOptions } from "./types";

/**
 * Shared helpers for modules built on Kea's card stack (every current game,
 * and the planned situation/case games for "which puzzle is next").
 */

/** Card IDs in play order for a new session. */
export function orderCardIds(deck: Deck, opts: StartOptions): string[] {
  const cardIds = deck.cards.map((c) => c.cardId);
  const seed = opts.shuffleSeed ?? deck.deckId;
  return opts.shuffleEnabled ? shuffleArray(cardIds, seed) : cardIds;
}

/**
 * The base session fields for a fresh stack: first card current, the rest
 * remaining. Modules spread this and add their own fields.
 */
export function createBaseSession(
  deck: Deck,
  opts: StartOptions
): BaseSessionState & { remainingCardIds: string[] } {
  const [firstCard, ...remainingCards] = orderCardIds(deck, opts);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    deckId: deck.deckId,
    deckVersion: deck.version,
    gameType: deck.gameType,
    shuffleEnabled: opts.shuffleEnabled,
    shuffleSeed: opts.shuffleSeed,
    remainingCardIds: remainingCards,
    passedCardIds: [],
    currentCardId: firstCard ?? null,
    isRevealed: false,
  };
}

/** The card at `session.currentCardId`, or null. */
export function getCurrentCard<C extends Card>(
  session: BaseSessionState,
  deck: Deck<C>
): C | null {
  if (!session.currentCardId) return null;
  return deck.cards.find((c) => c.cardId === session.currentCardId) ?? null;
}

/** Every card that is not upcoming, waiting to be retried or on screen. */
export function countCompletedCards(
  deckSize: number,
  remaining: number,
  passed: number
): number {
  return Math.max(0, deckSize - remaining - passed);
}
