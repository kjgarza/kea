import { describe, expect, test } from "bun:test";
import type { Deck } from "@/types/deck";
import type { GameType } from "@/types/game";
import type { SessionState } from "@/types/session";
import {
  applyAction,
  createInitialSession,
  getSessionProgress,
} from "./engine";

function makeTestHelpers(deck: Deck) {
  return {
    nextCard: (s: SessionState) => applyAction(s, { type: "next" }, deck),
    passCard: (s: SessionState) => applyAction(s, { type: "pass" }, deck),
    correct: (s: SessionState) => applyAction(s, { type: "correct" }, deck),
  };
}

function makeDeck(gameType: GameType, size: number): Deck {
  return {
    deckId: `test-${gameType}`,
    gameType,
    version: "2026-01-01T00:00:00Z",
    cards: Array.from({ length: size }, (_, i) => ({
      cardId: `c${i + 1}`,
      type: gameType,
    })),
  } as unknown as Deck;
}

describe("getSessionProgress", () => {
  test("fresh standard deck has nothing completed", () => {
    const deck = makeDeck("charades", 5);
    const session = createInitialSession(deck, { shuffleEnabled: false });
    expect(getSessionProgress(session, deck)).toEqual({
      completed: 0,
      remaining: 5,
      passed: 0,
      total: 5,
    });
  });

  test("counts completed cards after advancing (recycle game)", () => {
    const deck = makeDeck("charades", 5);
    const { nextCard, passCard } = makeTestHelpers(deck);
    let session = createInitialSession(deck, { shuffleEnabled: false });
    session = nextCard(session); // c1 done
    session = passCard(session); // c2 passed
    session = nextCard(session); // c3 done
    expect(getSessionProgress(session, deck)).toEqual({
      completed: 2,
      remaining: 2,
      passed: 1,
      total: 5,
    });
  });

  test("discard game counts passed cards as played", () => {
    const deck = makeDeck("trivia", 4);
    const { nextCard, passCard } = makeTestHelpers(deck);
    let session = createInitialSession(deck, { shuffleEnabled: false });
    session = passCard(session);
    session = nextCard(session);
    expect(getSessionProgress(session, deck)).toEqual({
      completed: 2,
      remaining: 2,
      passed: 0,
      total: 4,
    });
  });

  test("finished deck is fully completed", () => {
    const deck = makeDeck("taboo", 3);
    const { nextCard } = makeTestHelpers(deck);
    let session = createInitialSession(deck, { shuffleEnabled: false });
    for (let i = 0; i < 3; i++) session = nextCard(session);
    expect(getSessionProgress(session, deck).completed).toBe(3);
  });

  test("monikers counts correct cards in the current round", () => {
    const deck = makeDeck("monikers", 4);
    const { correct, passCard } = makeTestHelpers(deck);
    let session = createInitialSession(deck, { shuffleEnabled: false });
    session = correct(session);
    session = passCard(session);
    expect(getSessionProgress(session, deck)).toEqual({
      completed: 1,
      remaining: 2,
      passed: 1,
      total: 4,
    });
  });
});
