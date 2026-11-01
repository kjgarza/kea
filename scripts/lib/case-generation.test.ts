import { describe, expect, test } from "bun:test";
import type { CaseCard, Evidence } from "../../src/types/card";
import type { CaseDeck } from "../../src/types/deck";
import { CASE_GENERATION_LIMITS, finalizeCaseCards, generatedCaseProblems } from "./case-generation";
import { validateCaseCard } from "./validators";

function evidence(n: number): Evidence[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `e${i + 1}`,
    title: `Item ${i + 1}`,
    kind: i % 3 === 0 ? "interview" : i % 3 === 1 ? "phone_log" : "document",
    content: `Content ${i + 1}`,
    ...(i >= n - 2 ? { unlockAfter: [`e${i}`] } : {}),
  }));
}

function generated(overrides: Partial<CaseCard> = {}): CaseCard {
  return {
    cardId: "ge-001",
    type: "case",
    title: "Generated",
    briefing: "Something happened.",
    evidence: evidence(9),
    questions: ["who", "when", "where"].map((id) => ({
      id,
      prompt: `${id}?`,
      answer: id,
      acceptedVariants: [],
      points: 1,
    })),
    walkthrough: "See `e1` and `e9`.",
    ...overrides,
  };
}

describe("generatedCaseProblems", () => {
  test("a text-only case within the limits passes (and is a valid case card)", () => {
    const card = generated();
    expect(validateCaseCard(card, card.cardId).valid).toBe(true);
    expect(generatedCaseProblems(card)).toEqual([]);
  });

  test("evidence and question counts are enforced", () => {
    const { minEvidence, maxQuestions } = CASE_GENERATION_LIMITS;
    expect(generatedCaseProblems(generated({ evidence: evidence(minEvidence - 1) }))).toContain(
      `has ${minEvidence - 1} evidence items (expected 8–15)`
    );
    expect(generatedCaseProblems(generated({ evidence: evidence(16) }))[0]).toContain("16 evidence");
    const tooMany = Array.from({ length: maxQuestions + 1 }, (_, i) => ({
      id: `q${i}`, prompt: "?", answer: "a", acceptedVariants: [], points: 1,
    }));
    expect(generatedCaseProblems(generated({ questions: tooMany }))).toContain(
      "has 6 questions (expected 3–5)"
    );
  });

  test("image, map and pdf evidence are rejected (generation cannot create files)", () => {
    const items = evidence(9);
    items[2] = { id: "e3", title: "Photo", kind: "image", src: "photo.svg" };
    expect(generatedCaseProblems(generated({ evidence: items }))[0]).toContain(
      'evidence "e3" is image'
    );
  });

  test("unlock chains are required and nothing may start locked", () => {
    const flat = evidence(9).map((e) => ({ ...e, unlockAfter: undefined }));
    expect(generatedCaseProblems(generated({ evidence: flat }))).toContain(
      "has 0 locked evidence item(s) (expected at least 2 unlockAfter chains)"
    );
  });

  test("the walkthrough must cite evidence ids, and only existing ones", () => {
    expect(generatedCaseProblems(generated({ walkthrough: "She did it." }))).toContain(
      "walkthrough cites no evidence ids (write them in backticks)"
    );
    expect(generatedCaseProblems(generated({ walkthrough: "See `e1` and `nope`." }))).toContain(
      "walkthrough cites unknown evidence id `nope`"
    );
  });

  test("the hand-written seed case would not pass as generated (it has image and map evidence)", async () => {
    const deck = (await Bun.file("public/decks/saltmarsh-bay-en-case.json").json()) as CaseDeck;
    const problems = generatedCaseProblems(deck.cards[0]);
    expect(problems.some((p) => p.includes("is image"))).toBe(true);
    expect(problems.some((p) => p.includes("is map"))).toBe(true);
  });
});

describe("finalizeCaseCards", () => {
  test("splits kept and rejected cases with reasons", () => {
    const bad = generated({ cardId: "ge-002", evidence: evidence(3) });
    const { cards, rejected } = finalizeCaseCards([generated(), bad]);
    expect(cards.map((c) => c.cardId)).toEqual(["ge-001"]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].cardId).toBe("ge-002");
    expect(rejected[0].reason).toContain("3 evidence items");
  });
});
