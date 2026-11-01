import { describe, expect, test } from "bun:test";
import type { Deck } from "@/types/deck";
import type { GameType } from "@/types/game";
import { GAME_TYPES } from "@/types/game";
import type { MonikersSessionState, SessionState } from "@/types/session";
import { GAME_MODULES, getGameModule } from "./registry";
import { validateSessionAgainstDeck } from "@/lib/session/session-validator";

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

function play(deck: Deck, actions: string[], start?: SessionState) {
  const m = getGameModule(deck.gameType);
  let s: SessionState = start ?? m.createSession(deck, { shuffleEnabled: false });
  for (const type of actions) s = m.reduce(s, { type }, deck);
  return s;
}

describe("registry", () => {
  test("every game type has a module of that type", () => {
    for (const type of GAME_TYPES) {
      expect(GAME_MODULES[type].type).toBe(type);
      expect(typeof GAME_MODULES[type].PlayView).toBe("function");
    }
  });
});

describe("standard stack", () => {
  test("recycle game (charades) brings passed cards back at the end", () => {
    const deck = makeDeck("charades", 3);
    const s = play(deck, ["pass", "next", "next"]);
    expect(s.currentCardId).toBe("c1");
    expect(getGameModule("charades").isComplete(s)).toBe(false);
    const done = play(deck, ["next"], s);
    expect(getGameModule("charades").isComplete(done)).toBe(true);
  });

  test("discard game (trivia) drops passed cards", () => {
    const deck = makeDeck("trivia", 3);
    const s = play(deck, ["pass", "next", "next"]);
    expect(s.currentCardId).toBeNull();
    expect(getGameModule("trivia").isComplete(s)).toBe(true);
  });

  test("reveal sets isRevealed and next clears it", () => {
    const deck = makeDeck("trivia", 2);
    const revealed = play(deck, ["reveal"]);
    expect(revealed.isRevealed).toBe(true);
    expect(play(deck, ["next"], revealed).isRevealed).toBe(false);
  });

  test("cannot pass the last remaining card in a recycle game", () => {
    const deck = makeDeck("taboo", 1);
    const s = play(deck, []);
    expect(play(deck, ["pass"], s)).toBe(s);
  });

  test("same seed gives the same order", () => {
    const deck = makeDeck("justone", 20);
    const m = getGameModule("justone");
    const a = m.createSession(deck, { shuffleEnabled: true, shuffleSeed: "x" });
    const b = m.createSession(deck, { shuffleEnabled: true, shuffleSeed: "x" });
    expect(a).toEqual(b);
  });
});

describe("monikers", () => {
  test("three rounds, then complete", () => {
    const deck = makeDeck("monikers", 2);
    const m = getGameModule("monikers");
    let s = play(deck, ["correct", "correct"]) as MonikersSessionState;
    expect(s.monikersRound).toBe(1);
    expect(s.currentCardId).toBeNull();
    expect(m.isComplete(s)).toBe(false);
    expect(m.showChrome!(s)).toBe(false);

    s = play(deck, ["nextRound", "correct", "correct"], s) as MonikersSessionState;
    expect(s.monikersRound).toBe(2);
    s = play(deck, ["nextRound", "pass", "correct", "correct"], s) as MonikersSessionState;
    expect(s.monikersRound).toBe(3);
    expect(m.isComplete(s)).toBe(true);
  });

  test("end turn returns passed cards to the pile", () => {
    const deck = makeDeck("monikers", 3);
    const s = play(deck, ["pass", "endTurn"]) as MonikersSessionState;
    expect(s.currentCardId).toBe("c2");
    expect(s.monikersRemainingCardIds).toEqual(["c3", "c1"]);
    expect(s.monikersPassedCardIds).toEqual([]);
  });
});

describe("session validator uses module card IDs", () => {
  test("valid session passes; unknown card fails", () => {
    const deck = makeDeck("monikers", 3);
    const s = play(deck, ["pass"]) as MonikersSessionState;
    expect(validateSessionAgainstDeck(s, deck).isValid).toBe(true);
    const bad = { ...s, monikersPassedCardIds: ["zzz"] };
    expect(validateSessionAgainstDeck(bad, deck).reason).toBe("cards_changed");
  });
});
