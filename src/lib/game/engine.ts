import type {
  SessionState,
  MonikersSessionState,
  StandardSessionState,
  MonikersRound,
} from "@/types/session";
import type { Deck } from "@/types/deck";
import type { Card } from "@/types/card";
import { GAMES } from "@/types/game";
import { isMonikersSession, CURRENT_SCHEMA_VERSION } from "@/types/session";
import { shuffleArray, shuffleForRound } from "./shuffle";

/**
 * Create initial session state for a deck
 */
export function createInitialSession(
  deck: Deck,
  options: { shuffleEnabled: boolean }
): SessionState {
  const cardIds = deck.cards.map((c) => c.cardId);
  const orderedCardIds = options.shuffleEnabled
    ? shuffleArray(cardIds, deck.deckId)
    : cardIds;

  const [firstCard, ...remainingCards] = orderedCardIds;

  const baseSession = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    deckId: deck.deckId,
    deckVersion: deck.version,
    gameType: deck.gameType,
    shuffleEnabled: options.shuffleEnabled,
    remainingCardIds: remainingCards,
    passedCardIds: [] as string[],
    currentCardId: firstCard ?? null,
    isRevealed: false,
  };

  if (deck.gameType === "monikers") {
    return {
      ...baseSession,
      gameType: "monikers",
      monikersRound: 1 as MonikersRound,
      monikersRemainingCardIds: remainingCards,
      monikersPassedCardIds: [] as string[],
    } as MonikersSessionState;
  }

  return baseSession as StandardSessionState;
}

/**
 * Get the current card from session
 */
export function getCurrentCard(session: SessionState, deck: Deck): Card | null {
  if (!session.currentCardId) return null;
  return deck.cards.find((c) => c.cardId === session.currentCardId) ?? null;
}

/**
 * Get a card by ID from deck
 */
export function getCardById(deck: Deck, cardId: string): Card | null {
  return deck.cards.find((c) => c.cardId === cardId) ?? null;
}

/**
 * Advance to next card (marks current as completed)
 */
export function nextCard(session: SessionState): SessionState {
  if (isMonikersSession(session)) {
    return nextCardMonikers(session);
  }
  return nextCardStandard(session);
}

function nextCardStandard(session: StandardSessionState): SessionState {
  const { remainingCardIds, passedCardIds } = session;

  // Move to next remaining card
  if (remainingCardIds.length > 0) {
    const [nextCardId, ...rest] = remainingCardIds;
    return {
      ...session,
      currentCardId: nextCardId,
      remainingCardIds: rest,
      isRevealed: false,
    };
  }

  // Check passed cards (for recycle games)
  const gameConfig = GAMES[session.gameType];
  if (gameConfig.passBehavior === "recycle" && passedCardIds.length > 0) {
    const [nextCardId, ...rest] = passedCardIds;
    return {
      ...session,
      currentCardId: nextCardId,
      remainingCardIds: rest,
      passedCardIds: [],
      isRevealed: false,
    };
  }

  // No more cards - deck complete
  return {
    ...session,
    currentCardId: null,
    isRevealed: false,
  };
}

function nextCardMonikers(session: MonikersSessionState): MonikersSessionState {
  const { monikersRemainingCardIds, monikersPassedCardIds } = session;

  // Move to next card in current round
  if (monikersRemainingCardIds.length > 0) {
    const [nextCardId, ...rest] = monikersRemainingCardIds;
    return {
      ...session,
      currentCardId: nextCardId,
      monikersRemainingCardIds: rest,
      isRevealed: false,
    };
  }

  // Check passed cards
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

  // Round complete - no more cards
  return {
    ...session,
    currentCardId: null,
    isRevealed: false,
  };
}

/**
 * Pass current card (behavior depends on game type)
 */
export function passCard(session: SessionState): SessionState {
  if (!session.currentCardId) return session;

  if (isMonikersSession(session)) {
    return passCardMonikers(session);
  }

  return passCardStandard(session as StandardSessionState);
}

function passCardStandard(session: StandardSessionState): SessionState {
  const gameConfig = GAMES[session.gameType];
  const currentCardId = session.currentCardId!;

  if (gameConfig.passBehavior === "recycle") {
    // Add to passed list, move to next
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

    // No remaining cards, check if we can cycle passed cards
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

    // Only one card left, can't pass
    return session;
  }

  // Discard behavior - just move to next without saving
  return nextCard(session);
}

function passCardMonikers(session: MonikersSessionState): MonikersSessionState {
  const currentCardId = session.currentCardId!;

  // Monikers always recycles within the current turn
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

  // No remaining cards, cycle passed cards
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

  // Only one card left, can't pass
  return session;
}

/**
 * Reveal answer (only meaningful for Trivia)
 */
export function revealCard(session: SessionState): SessionState {
  return {
    ...session,
    isRevealed: true,
  };
}

/**
 * Monikers: Mark card as correct (removes from current round)
 */
export function monikersCorrect(
  session: MonikersSessionState
): MonikersSessionState {
  if (!session.currentCardId) return session;

  // Move to next card, current card is removed from play
  const [nextCardId, ...remainingRest] = session.monikersRemainingCardIds;

  if (nextCardId) {
    return {
      ...session,
      currentCardId: nextCardId,
      monikersRemainingCardIds: remainingRest,
      // Note: currentCardId is not added anywhere - it's out of play
      isRevealed: false,
    };
  }

  // Check passed cards
  if (session.monikersPassedCardIds.length > 0) {
    const [firstPassed, ...restPassed] = session.monikersPassedCardIds;
    return {
      ...session,
      currentCardId: firstPassed,
      monikersRemainingCardIds: restPassed,
      monikersPassedCardIds: [],
      isRevealed: false,
    };
  }

  // No more cards in this round
  return {
    ...session,
    currentCardId: null,
    isRevealed: false,
  };
}

/**
 * Monikers: End current turn (puts passed cards back into remaining)
 */
export function monikersEndTurn(
  session: MonikersSessionState
): MonikersSessionState {
  // Merge passed cards back into remaining for next turn
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

/**
 * Monikers: Start next round (resets all cards)
 */
export function monikersStartNextRound(
  session: MonikersSessionState,
  deck: Deck
): MonikersSessionState {
  const nextRound = (session.monikersRound + 1) as MonikersRound;
  if (nextRound > 3) return session; // Already finished

  const cardIds = deck.cards.map((c) => c.cardId);
  const orderedCardIds = session.shuffleEnabled
    ? shuffleForRound(cardIds, deck.deckId, nextRound)
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

/**
 * Restart session from beginning
 */
export function restartSession(session: SessionState, deck: Deck): SessionState {
  return createInitialSession(deck, { shuffleEnabled: session.shuffleEnabled });
}

/**
 * Check if session is complete (no more cards to play)
 */
export function isSessionComplete(session: SessionState): boolean {
  if (isMonikersSession(session)) {
    // Monikers is complete only after round 3 is done
    return (
      session.monikersRound === 3 &&
      session.currentCardId === null &&
      session.monikersRemainingCardIds.length === 0 &&
      session.monikersPassedCardIds.length === 0
    );
  }

  return (
    session.currentCardId === null &&
    session.remainingCardIds.length === 0 &&
    session.passedCardIds.length === 0
  );
}

/**
 * Check if current round is complete (Monikers)
 */
export function isRoundComplete(session: MonikersSessionState): boolean {
  return (
    session.currentCardId === null &&
    session.monikersRemainingCardIds.length === 0 &&
    session.monikersPassedCardIds.length === 0
  );
}

/**
 * Get progress stats for session
 */
export function getSessionProgress(session: SessionState): {
  completed: number;
  remaining: number;
  passed: number;
  total: number;
} {
  if (isMonikersSession(session)) {
    const remaining =
      session.monikersRemainingCardIds.length +
      session.monikersPassedCardIds.length +
      (session.currentCardId ? 1 : 0);

    // For Monikers, we don't track completed cards the same way
    return {
      completed: 0, // Cards removed via "correct"
      remaining,
      passed: session.monikersPassedCardIds.length,
      total: remaining, // Total in current round
    };
  }

  const remaining =
    session.remainingCardIds.length + (session.currentCardId ? 1 : 0);
  const total =
    remaining + session.passedCardIds.length + countCompletedCards(session);

  return {
    completed: countCompletedCards(session),
    remaining,
    passed: session.passedCardIds.length,
    total,
  };
}

function countCompletedCards(session: SessionState): number {
  // Completed cards are not stored, we need deck info to calculate
  // For now, return 0 - this will be calculated in UI with deck context
  return 0;
}

/**
 * Get the count of cards that will be played
 * (accounting for recycle vs discard behavior)
 */
export function getTotalCardsToPlay(session: SessionState, deck: Deck): number {
  const gameConfig = GAMES[session.gameType];

  if (gameConfig.passBehavior === "discard") {
    // All cards will be played once (passed cards are discarded)
    return deck.cards.length;
  }

  // For recycle games, cards can be seen multiple times
  // Return total unique cards
  return deck.cards.length;
}
