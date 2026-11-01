import type { Card } from "@/types/card";
import type { Deck } from "@/types/deck";
import type {
  MonikersRound,
  MonikersSessionState,
  SessionState,
} from "@/types/session";
import { shuffleForRound } from "@/lib/game/shuffle";
import { countCompletedCards, createBaseSession } from "../stack";
import type { Progress, StartOptions } from "../types";

/**
 * Pure logic for Monikers: three rounds over the same cards. Within a round,
 * correct cards leave play, passed cards cycle back, and ending a turn puts
 * passed cards back into the pile for the next team.
 */

export type MonikersAction =
  | { type: "next" }
  | { type: "pass" }
  | { type: "correct" }
  | { type: "endTurn" }
  | { type: "nextRound" };

export function isMonikersSession(
  session: SessionState
): session is MonikersSessionState {
  return session.gameType === "monikers";
}

export function createMonikersSession(
  deck: Deck,
  opts: StartOptions
): MonikersSessionState {
  const base = createBaseSession(deck, opts);
  return {
    ...base,
    gameType: "monikers",
    monikersRound: 1 as MonikersRound,
    monikersRemainingCardIds: base.remainingCardIds,
    monikersPassedCardIds: [],
  };
}

/** Advance to the next card in the round (pass pile is used once remaining is empty). */
export function nextMonikers(
  session: MonikersSessionState
): MonikersSessionState {
  const { monikersRemainingCardIds, monikersPassedCardIds } = session;

  if (monikersRemainingCardIds.length > 0) {
    const [nextCardId, ...rest] = monikersRemainingCardIds;
    return {
      ...session,
      currentCardId: nextCardId,
      monikersRemainingCardIds: rest,
      isRevealed: false,
    };
  }

  if (monikersPassedCardIds.length > 0) {
    const [nextCardId, ...rest] = monikersPassedCardIds;
    return {
      ...session,
      currentCardId: nextCardId,
      monikersRemainingCardIds: rest,
      monikersPassedCardIds: [],
      isRevealed: false,
    };
  }

  return { ...session, currentCardId: null, isRevealed: false };
}

export function passMonikers(
  session: MonikersSessionState
): MonikersSessionState {
  const currentCardId = session.currentCardId;
  if (!currentCardId) return session;

  const [nextCardId, ...remainingRest] = session.monikersRemainingCardIds;
  if (nextCardId) {
    return {
      ...session,
      monikersPassedCardIds: [...session.monikersPassedCardIds, currentCardId],
      currentCardId: nextCardId,
      monikersRemainingCardIds: remainingRest,
      isRevealed: false,
    };
  }

  if (session.monikersPassedCardIds.length > 0) {
    const [firstPassed, ...restPassed] = [
      ...session.monikersPassedCardIds,
      currentCardId,
    ];
    return {
      ...session,
      currentCardId: firstPassed,
      monikersRemainingCardIds: restPassed,
      monikersPassedCardIds: [],
      isRevealed: false,
    };
  }

  // Only one card left; can't pass.
  return session;
}

/** Correct: the current card leaves play for this round. */
export function correctMonikers(
  session: MonikersSessionState
): MonikersSessionState {
  if (!session.currentCardId) return session;
  return nextMonikers(session);
}

/** End turn: the current card and passed cards go back into the pile. */
export function endTurnMonikers(
  session: MonikersSessionState
): MonikersSessionState {
  const allCards = session.currentCardId
    ? [
        session.currentCardId,
        ...session.monikersRemainingCardIds,
        ...session.monikersPassedCardIds,
      ]
    : [...session.monikersRemainingCardIds, ...session.monikersPassedCardIds];

  if (allCards.length === 0) {
    return {
      ...session,
      currentCardId: null,
      monikersRemainingCardIds: [],
      monikersPassedCardIds: [],
    };
  }

  const [first, ...rest] = allCards;
  return {
    ...session,
    currentCardId: first,
    monikersRemainingCardIds: rest,
    monikersPassedCardIds: [],
    isRevealed: false,
  };
}

/** Start the next round with every card back in play (reshuffled per round). */
export function nextRoundMonikers(
  session: MonikersSessionState,
  deck: Deck
): MonikersSessionState {
  const nextRound = (session.monikersRound + 1) as MonikersRound;
  if (nextRound > 3) return session;

  const cardIds = deck.cards.map((c) => c.cardId);
  const roundSeed = session.shuffleSeed ?? deck.deckId;
  const orderedCardIds = session.shuffleEnabled
    ? shuffleForRound(cardIds, roundSeed, nextRound)
    : cardIds;
  const [firstCard, ...remainingCards] = orderedCardIds;

  return {
    ...session,
    monikersRound: nextRound,
    monikersRemainingCardIds: remainingCards,
    monikersPassedCardIds: [],
    currentCardId: firstCard ?? null,
    isRevealed: false,
  };
}

export function reduceMonikers(
  session: MonikersSessionState,
  action: MonikersAction,
  deck: Deck
): MonikersSessionState {
  switch (action.type) {
    case "next":
      return nextMonikers(session);
    case "pass":
      return passMonikers(session);
    case "correct":
      return correctMonikers(session);
    case "endTurn":
      return endTurnMonikers(session);
    case "nextRound":
      return nextRoundMonikers(session, deck);
  }
}

/** No cards left in the current round. */
export function isMonikersRoundComplete(session: MonikersSessionState): boolean {
  return (
    session.currentCardId === null &&
    session.monikersRemainingCardIds.length === 0 &&
    session.monikersPassedCardIds.length === 0
  );
}

/** The game is over once round 3 is complete. */
export function isMonikersComplete(session: MonikersSessionState): boolean {
  return session.monikersRound === 3 && isMonikersRoundComplete(session);
}

/** Cards still to guess this round (remaining + passed + on screen). */
export function monikersCardsLeft(session: MonikersSessionState): number {
  return (
    session.monikersRemainingCardIds.length +
    session.monikersPassedCardIds.length +
    (session.currentCardId ? 1 : 0)
  );
}

export function monikersProgress(
  session: MonikersSessionState,
  deck: Deck<Card>
): Progress {
  const total = deck.cards.length;
  const passed = session.monikersPassedCardIds.length;
  const remaining =
    session.monikersRemainingCardIds.length + (session.currentCardId ? 1 : 0);
  return {
    completed: countCompletedCards(total, remaining, passed),
    remaining,
    passed,
    total,
  };
}

export function monikersCardIds(session: MonikersSessionState): string[] {
  return [
    ...session.remainingCardIds,
    ...session.passedCardIds,
    ...(session.currentCardId ? [session.currentCardId] : []),
    ...session.monikersRemainingCardIds,
    ...session.monikersPassedCardIds,
  ];
}
