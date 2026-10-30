import { describe, expect, test } from "bun:test";
import type { SituationCard } from "@/types/card";
import type { Deck } from "@/types/deck";
import {
  createSituationSession,
  isSituationComplete,
  reduceSituation,
  situationCardIds,
  situationProgress,
} from "./logic";

const deck = {
  deckId: "test-en-situation",
  gameType: "situation",
  version: "v1",
  cards: ["a", "b", "c"].map((cardId) => ({ cardId, type: "situation" })),
} as unknown as Deck<SituationCard>;

describe("situation placeholder logic", () => {
  test("walks the stack with next/skip and completes", () => {
    let s = createSituationSession(deck, { shuffleEnabled: false });
    expect(s.gameType).toBe("situation");
    expect(s.currentCardId).toBe("a");
    s = reduceSituation(s, { type: "skip" });
    expect(s.currentCardId).toBe("b");
    expect(situationProgress(s, deck)).toEqual({ completed: 1, remaining: 2, passed: 0, total: 3 });
    s = reduceSituation(s, { type: "next" });
    s = reduceSituation(s, { type: "next" });
    expect(isSituationComplete(s)).toBe(true);
    expect(reduceSituation(s, { type: "next" })).toBe(s);
    expect(situationCardIds(s)).toEqual([]);
  });
});
