import { describe, expect, test } from "bun:test";
import type { SituationCard } from "../../src/types/card";
import {
  finalizeSituationCards,
  isDeathRelatedWarning,
  mentionsDeath,
} from "./situation-generation";

function puzzle(overrides: Partial<SituationCard> = {}): SituationCard {
  return {
    cardId: "x-001",
    type: "situation",
    title: "The Bus",
    setup: "A woman lets her bus go by and goes home happy.",
    solution: "Her son was driving it on his first day.",
    keyFacts: [
      { id: "son", text: "The driver was her son." },
      { id: "first-day", text: "It was his first day." },
      { id: "watching", text: "She only came to watch." },
    ],
    hints: ["She never meant to get on."],
    ...overrides,
  };
}

describe("death detection", () => {
  test("recognises death-related warnings", () => {
    for (const w of ["death", "Child Death", "murder", "suicide", "animal death", "muerte", "asesinato"]) {
      expect(isDeathRelatedWarning(w)).toBe(true);
    }
    for (const w of ["animal in danger", "medical emergency", "spiders"]) {
      expect(isDeathRelatedWarning(w)).toBe(false);
    }
  });

  test("scans the puzzle text too", () => {
    expect(mentionsDeath(puzzle())).toBe(false);
    expect(mentionsDeath(puzzle({ solution: "He had been murdered." }))).toBe(true);
    expect(mentionsDeath(puzzle({ hints: ["Someone died."] }))).toBe(true);
    expect(mentionsDeath(puzzle({ contentWarnings: ["suicide"] }))).toBe(true);
    // Words that merely contain "dead"/"die" are fine
    expect(mentionsDeath(puzzle({ setup: "She met the deadline on a diet." }))).toBe(false);
  });
});

describe("finalizeSituationCards", () => {
  test("marks cards as generated and merges deck warnings", () => {
    const { cards, rejected } = finalizeSituationCards(
      [puzzle({ contentWarnings: ["gore"], source: { origin: "original", pack: "x" } })],
      { tone: "macabre", allowDeath: true, contentWarnings: ["Death", "gore"] }
    );
    expect(rejected).toEqual([]);
    expect(cards[0].source).toEqual({ origin: "generated", pack: "x" });
    expect(cards[0].contentWarnings).toEqual(["gore", "death"]);
  });

  test("leaves warnings out when there are none", () => {
    const { cards } = finalizeSituationCards([puzzle()], {
      tone: "funny",
      allowDeath: true,
      contentWarnings: [],
    });
    expect("contentWarnings" in cards[0]).toBe(false);
    expect(cards[0].source).toEqual({ origin: "generated" });
  });

  test("drops puzzles that mention death when death is not allowed", () => {
    const { cards, rejected } = finalizeSituationCards(
      [
        puzzle(),
        puzzle({ cardId: "x-002", contentWarnings: ["death"] }),
        puzzle({ cardId: "x-003", solution: "The man was dead all along." }),
      ],
      { tone: "no-death", allowDeath: false, contentWarnings: [] }
    );
    expect(cards.map((c) => c.cardId)).toEqual(["x-001"]);
    expect(rejected.map((r) => r.cardId)).toEqual(["x-002", "x-003"]);
  });
});
