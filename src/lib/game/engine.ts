import type { SessionState } from "@/types/session";
import type { Deck } from "@/types/deck";
import type { Card } from "@/types/card";
import { getGameModule } from "./modules/registry";
import type { GameActionBase, Progress, StartOptions } from "./modules/types";

/**
 * Game-agnostic entry points. Every call is routed to the session's game
 * module (src/lib/game/modules/registry.ts); game-specific logic lives in the
 * modules, not here.
 */

export { getCurrentCard } from "./modules/stack";

/** Create a fresh session for a deck. */
export function createInitialSession(
  deck: Deck,
  options: StartOptions
): SessionState {
  return getGameModule(deck.gameType).createSession(deck, options);
}

/** Apply a module action (e.g. `{ type: "next" }`) to a session. */
export function applyAction(
  session: SessionState,
  action: GameActionBase,
  deck: Deck
): SessionState {
  return getGameModule(session.gameType).reduce(session, action, deck);
}

/** Start over with the same deck and shuffle settings. */
export function restartSession(session: SessionState, deck: Deck): SessionState {
  return createInitialSession(deck, {
    shuffleEnabled: session.shuffleEnabled,
    shuffleSeed: session.shuffleSeed,
  });
}

export function isSessionComplete(session: SessionState): boolean {
  return getGameModule(session.gameType).isComplete(session);
}

/**
 * Progress counts. `completed` is every card not still upcoming, waiting to
 * be retried or on screen; for discard games that includes passed cards; for
 * Monikers the counts are per round.
 */
export function getSessionProgress(session: SessionState, deck: Deck): Progress {
  return getGameModule(session.gameType).progress(session, deck);
}

export function getCardById(deck: Deck, cardId: string): Card | null {
  return deck.cards.find((c) => c.cardId === cardId) ?? null;
}
