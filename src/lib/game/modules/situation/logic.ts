import type { SituationCard } from "@/types/card";
import type { Deck } from "@/types/deck";
import type { SituationSessionState } from "@/types/session";
import { countCompletedCards, createBaseSession } from "../stack";
import type { Progress, StartOptions } from "../types";

/**
 * Pure logic for situation puzzles. For now this is only the card stack
 * ("which puzzle is next"); per-puzzle keeper state (spec §4.4) arrives with
 * the keeper screen (#25).
 */

export type SituationAction =
  /** Finish the current puzzle and move to the next one. */
  | { type: "next" }
  /** Skip the current puzzle (discarded, not recycled). */
  | { type: "skip" };

export function createSituationSession(
  deck: Deck<SituationCard>,
  opts: StartOptions
): SituationSessionState {
  return { ...createBaseSession(deck, opts), gameType: "situation" };
}

function advance(session: SituationSessionState): SituationSessionState {
  const [nextCardId, ...rest] = session.remainingCardIds;
  return {
    ...session,
    currentCardId: nextCardId ?? null,
    remainingCardIds: rest,
    isRevealed: false,
  };
}

export function reduceSituation(
  session: SituationSessionState,
  action: SituationAction
): SituationSessionState {
  if (!session.currentCardId) return session;
  switch (action.type) {
    case "next":
    case "skip":
      return advance(session);
  }
}

export function isSituationComplete(session: SituationSessionState): boolean {
  return session.currentCardId === null && session.remainingCardIds.length === 0;
}

export function situationProgress(
  session: SituationSessionState,
  deck: Deck<SituationCard>
): Progress {
  const total = deck.cards.length;
  const remaining =
    session.remainingCardIds.length + (session.currentCardId ? 1 : 0);
  return {
    completed: countCompletedCards(total, remaining, 0),
    remaining,
    passed: 0,
    total,
  };
}

export function situationCardIds(session: SituationSessionState): string[] {
  return [
    ...session.remainingCardIds,
    ...session.passedCardIds,
    ...(session.currentCardId ? [session.currentCardId] : []),
  ];
}
