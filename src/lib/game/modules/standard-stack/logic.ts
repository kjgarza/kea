import type { Card } from "@/types/card";
import type { Deck } from "@/types/deck";
import type { PassBehavior } from "@/types/game";
import type { StandardSessionState } from "@/types/session";
import { countCompletedCards, createBaseSession } from "../stack";
import type { Progress, StartOptions } from "../types";

/**
 * Pure logic for the "standard stack" games (Charades, Trivia, Taboo,
 * Just One): one pass through the deck; passed cards are either recycled to
 * the end or discarded, per the game's `passBehavior`.
 */

export type StandardAction =
  | { type: "next" }
  | { type: "pass" }
  | { type: "reveal" };

export function createStandardSession(
  deck: Deck,
  opts: StartOptions
): StandardSessionState {
  return createBaseSession(deck, opts) as StandardSessionState;
}

export function nextStandard(
  session: StandardSessionState,
  passBehavior: PassBehavior
): StandardSessionState {
  const { remainingCardIds, passedCardIds } = session;

  if (remainingCardIds.length > 0) {
    const [nextCardId, ...rest] = remainingCardIds;
    return {
      ...session,
      currentCardId: nextCardId,
      remainingCardIds: rest,
      isRevealed: false,
    };
  }

  if (passBehavior === "recycle" && passedCardIds.length > 0) {
    const [nextCardId, ...rest] = passedCardIds;
    return {
      ...session,
      currentCardId: nextCardId,
      remainingCardIds: rest,
      passedCardIds: [],
      isRevealed: false,
    };
  }

  return { ...session, currentCardId: null, isRevealed: false };
}

export function passStandard(
  session: StandardSessionState,
  passBehavior: PassBehavior
): StandardSessionState {
  const currentCardId = session.currentCardId;
  if (!currentCardId) return session;

  if (passBehavior === "discard") {
    return nextStandard(session, passBehavior);
  }

  const [nextCardId, ...remainingRest] = session.remainingCardIds;
  if (nextCardId) {
    return {
      ...session,
      passedCardIds: [...session.passedCardIds, currentCardId],
      currentCardId: nextCardId,
      remainingCardIds: remainingRest,
      isRevealed: false,
    };
  }

  if (session.passedCardIds.length > 0) {
    const [firstPassed, ...restPassed] = [
      ...session.passedCardIds,
      currentCardId,
    ];
    return {
      ...session,
      currentCardId: firstPassed,
      remainingCardIds: restPassed,
      passedCardIds: [],
      isRevealed: false,
    };
  }

  // Only one card left; can't pass.
  return session;
}

export function reduceStandard(
  session: StandardSessionState,
  action: StandardAction,
  passBehavior: PassBehavior
): StandardSessionState {
  switch (action.type) {
    case "next":
      return nextStandard(session, passBehavior);
    case "pass":
      return passStandard(session, passBehavior);
    case "reveal":
      return session.isRevealed ? session : { ...session, isRevealed: true };
  }
}

export function isStandardComplete(session: StandardSessionState): boolean {
  return (
    session.currentCardId === null &&
    session.remainingCardIds.length === 0 &&
    session.passedCardIds.length === 0
  );
}

export function standardProgress(
  session: StandardSessionState,
  deck: Deck<Card>
): Progress {
  const total = deck.cards.length;
  const passed = session.passedCardIds.length;
  const remaining =
    session.remainingCardIds.length + (session.currentCardId ? 1 : 0);
  return {
    completed: countCompletedCards(total, remaining, passed),
    remaining,
    passed,
    total,
  };
}

export function standardCardIds(session: StandardSessionState): string[] {
  return [
    ...session.remainingCardIds,
    ...session.passedCardIds,
    ...(session.currentCardId ? [session.currentCardId] : []),
  ];
}
