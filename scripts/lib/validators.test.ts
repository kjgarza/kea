import { describe, expect, test } from "bun:test";
import type { Deck } from "../../src/types/deck";
import type { SituationCard } from "../../src/types/card";
import { SITUATION_LIMITS, validateCard, validateSituationCard, validateSituationDeck } from "./validators";

function validPuzzle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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

function errorsFor(raw: unknown, cardId = "sit-001"): string[] {
  return validateSituationCard(raw, cardId).errors;
}

describe("validateSituationCard", () => {
  test("accepts a minimal valid puzzle and trims fields", () => {
    const result = validateSituationCard(
      validPuzzle({ title: "  The Bus  ", hints: [" one "] }),
      "sit-001"
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    const card = result.card as SituationCard;
    expect(card.cardId).toBe("sit-001");
    expect(card.type).toBe("situation");
    expect(card.title).toBe("The Bus");
    expect(card.hints).toEqual(["one"]);
    expect(card.keyFacts).toHaveLength(3);
    expect("contentWarnings" in card).toBe(false);
  });

  test("is reached through validateCard for the situation game type", () => {
    expect(validateCard(validPuzzle(), "situation", "x").valid).toBe(true);
  });

  test("keeps and normalises optional fields", () => {
    const card = validateSituationCard(
      validPuzzle({
        difficulty: "hard",
        contentWarnings: ["Child  Death", "gore", "child death"],
        estMinutes: 15,
        source: { origin: "transcribed", pack: "Black Stories", ref: "12" },
      }),
      "sit-001"
    ).card as SituationCard;
    expect(card.difficulty).toBe("hard");
    expect(card.contentWarnings).toEqual(["child death", "gore"]);
    expect(card.estMinutes).toBe(15);
    expect(card.source).toEqual({ origin: "transcribed", pack: "Black Stories", ref: "12" });
  });

  test.each(["title", "setup", "solution", "keyFacts", "hints"])(
    "rejects a missing %s, naming the card and field",
    (field) => {
      const raw = validPuzzle();
      delete raw[field];
      const errors = errorsFor(raw);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('situation card "sit-001"');
      expect(errors[0]).toContain(`'${field}'`);
    }
  );

  test("rejects blank text fields", () => {
    expect(errorsFor(validPuzzle({ solution: "   " }))[0]).toContain("'solution'");
  });

  test("rejects a setup over 400 characters", () => {
    const setup = "x".repeat(SITUATION_LIMITS.setupMaxChars + 1);
    const errors = errorsFor(validPuzzle({ setup }));
    expect(errors).toEqual([
      `situation card "sit-001": 'setup' is 401 characters; the maximum is 400`,
    ]);
    const atLimit = "x".repeat(SITUATION_LIMITS.setupMaxChars);
    expect(errorsFor(validPuzzle({ setup: atLimit }))).toEqual([]);
  });

  test("requires 3–8 key facts", () => {
    const fact = (i: number) => ({ id: `f${i}`, text: `Fact ${i}` });
    const two = Array.from({ length: 2 }, (_, i) => fact(i));
    const nine = Array.from({ length: 9 }, (_, i) => fact(i));
    const eight = Array.from({ length: 8 }, (_, i) => fact(i));
    expect(errorsFor(validPuzzle({ keyFacts: two }))[0]).toContain(
      "'keyFacts' has 2 items; it must have 3–8"
    );
    expect(errorsFor(validPuzzle({ keyFacts: nine }))[0]).toContain("has 9 items");
    expect(errorsFor(validPuzzle({ keyFacts: eight }))).toEqual([]);
  });

  test("requires unique, non-empty key fact ids and text", () => {
    const errors = errorsFor(
      validPuzzle({
        keyFacts: [
          { id: "a", text: "One" },
          { id: "a", text: "Two" },
          { id: "", text: "Three" },
          { id: "d", text: "" },
          "not an object",
        ],
      })
    );
    expect(errors).toEqual([
      `situation card "sit-001": keyFacts[1].id "a" is a duplicate; fact ids must be unique`,
      `situation card "sit-001": keyFacts[2].id is required and must be a non-empty string`,
      `situation card "sit-001": keyFacts[3].text is required and must be a non-empty string`,
      `situation card "sit-001": keyFacts[4] must be an object with 'id' and 'text'`,
    ]);
  });

  test("requires 1–4 non-empty hints", () => {
    expect(errorsFor(validPuzzle({ hints: [] }))[0]).toContain(
      "'hints' has 0 items; it must have 1–4"
    );
    expect(errorsFor(validPuzzle({ hints: ["a", "b", "c", "d", "e"] }))[0]).toContain(
      "has 5 items"
    );
    expect(errorsFor(validPuzzle({ hints: ["ok", ""] }))).toEqual([
      `situation card "sit-001": hints[1] must be a non-empty string`,
    ]);
  });

  test("rejects invalid optional fields", () => {
    const errors = errorsFor(
      validPuzzle({
        difficulty: "extreme",
        contentWarnings: "gore",
        estMinutes: 0,
        source: { origin: "copied" },
      })
    );
    expect(errors).toHaveLength(4);
    expect(errors.join("\n")).toContain("'difficulty'");
    expect(errors.join("\n")).toContain("'contentWarnings'");
    expect(errors.join("\n")).toContain("'estMinutes'");
    expect(errors.join("\n")).toContain("'source.origin'");
  });

  test("reports every problem at once", () => {
    const errors = errorsFor({ type: "situation" });
    expect(errors.length).toBe(5);
  });

  test("rejects non-objects", () => {
    expect(errorsFor(null)).toEqual([`situation card "sit-001": card is not an object`]);
    expect(errorsFor([])).toEqual([`situation card "sit-001": card is not an object`]);
  });
});

describe("sample situation deck", () => {
  test("every card in public/decks/sample-en-situation.json validates unchanged", async () => {
    const deck = (await Bun.file(
      new URL("../../public/decks/sample-en-situation.json", import.meta.url)
    ).json()) as Deck<SituationCard>;
    expect(deck.gameType).toBe("situation");
    expect(new Set(deck.cards.map((c) => c.cardId)).size).toBe(deck.cards.length);
    for (const card of deck.cards) {
      const result = validateCard(card, "situation", card.cardId);
      expect(result.errors).toEqual([]);
      expect(result.card).toEqual(card);
    }
  });
});

describe("validateSituationDeck (translated decks)", () => {
  test("accepts a valid deck and names the card and problem of an invalid one", () => {
    const good = { cardId: "p-1", ...validPuzzle() };
    expect(validateSituationDeck({ deckId: "x-es-situation", gameType: "situation", cards: [good] })).toEqual([]);
    const errors = validateSituationDeck({
      deckId: "x-es-situation",
      gameType: "situation",
      cards: [good, { ...good, cardId: "p-2", solution: "" }, { ...good, cardId: "p-1" }],
    });
    expect(errors.some((e) => e.startsWith('situation card "p-2":'))).toBe(true);
    expect(errors).toContain('deck "x-es-situation": cardId "p-1" is a duplicate');
    expect(validateSituationDeck({ deckId: "d", gameType: "case", cards: [] })[0]).toContain("expected");
  });

  test("every committed Spanish situation deck passes", async () => {
    const index = (await Bun.file("public/decks/index.json").json()) as {
      decks: { deckId: string; gameType: string; language: string }[];
    };
    const ids = index.decks.filter((d) => d.gameType === "situation" && d.language === "es").map((d) => d.deckId);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const deck = (await Bun.file(`public/decks/${id}.json`).json()) as Deck;
      expect(validateSituationDeck(deck)).toEqual([]);
    }
  });
});
