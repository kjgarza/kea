import { describe, expect, test } from "bun:test";
import type { Deck } from "@/types/deck";
import type { GameType } from "@/types/game";
import {
  createInitialSession,
  getSessionProgress,
  monikersCorrect,
  nextCard,
  passCard,
} from "./engine";
import type { MonikersSessionState } from "@/types/session";

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
    let session = createInitialSession(deck, { shuffleEnabled: false });
    for (let i = 0; i < 3; i++) session = nextCard(session);
    expect(getSessionProgress(session, deck).completed).toBe(3);
  });

  test("monikers counts correct cards in the current round", () => {
    const deck = makeDeck("monikers", 4);
    let session = createInitialSession(deck, {
      shuffleEnabled: false,
    }) as MonikersSessionState;
    session = monikersCorrect(session);
    session = passCard(session) as MonikersSessionState;
    expect(getSessionProgress(session, deck)).toEqual({
      completed: 1,
      remaining: 2,
      passed: 1,
      total: 4,
    });
  });
});
