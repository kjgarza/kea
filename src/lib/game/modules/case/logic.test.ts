import { describe, expect, test } from "bun:test";
import type { CaseCard } from "@/types/card";
import type { Deck } from "@/types/deck";
import {
  caseCardIds,
  caseMaxPoints,
  caseProgress,
  createCaseSession,
  isCaseComplete,
  isEvidenceUnlocked,
  reduceCase,
} from "./logic";

function card(cardId: string): CaseCard {
  return {
    cardId,
    type: "case",
    title: `Case ${cardId}`,
    briefing: "Briefing",
    evidence: [
      { id: "a", title: "A", kind: "document", content: "x" },
      { id: "b", title: "B", kind: "document", content: "y", unlockAfter: ["a"] },
    ],
    questions: [
      { id: "q1", prompt: "?", answer: "!", acceptedVariants: [], points: 2 },
      { id: "q2", prompt: "?", answer: "!", acceptedVariants: [], points: 3 },
    ],
    walkthrough: "Walkthrough",
  };
}

const deck = {
  schemaVersion: 1,
  deckId: "test-en-case",
  version: "2026-10-30T00:00:00Z",
  name: "Test",
  gameType: "case",
  language: "en",
  difficulty: "easy",
  topics: [],
  nsfw: false,
  cards: [card("c1"), card("c2")],
} satisfies Deck<CaseCard>;

describe("case logic (placeholder stack)", () => {
  test("plays the cases in order and completes", () => {
    let s = createCaseSession(deck, { shuffleEnabled: false });
    expect(s.gameType).toBe("case");
    expect(s.currentCardId).toBe("c1");
    expect(caseCardIds(s).sort()).toEqual(["c1", "c2"]);
    s = reduceCase(s, { type: "next" });
    expect(s.currentCardId).toBe("c2");
    expect(caseProgress(s, deck)).toEqual({ completed: 1, remaining: 1, passed: 0, total: 2 });
    s = reduceCase(s, { type: "skip" });
    expect(isCaseComplete(s)).toBe(true);
    expect(reduceCase(s, { type: "next" })).toBe(s);
  });

  test("evidence unlocks once its prerequisites are opened", () => {
    const [a, b] = card("c1").evidence;
    expect(isEvidenceUnlocked(a, [])).toBe(true);
    expect(isEvidenceUnlocked(b, [])).toBe(false);
    expect(isEvidenceUnlocked(b, new Set(["a"]))).toBe(true);
  });

  test("max points sums the questions", () => {
    expect(caseMaxPoints(card("c1"))).toBe(5);
  });
});
