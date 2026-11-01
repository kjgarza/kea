import { describe, expect, test } from "bun:test";
import type { Card, CaseCard, SituationCard } from "../../src/types/card";
import {
  buildTranslationPrompts,
  extractTranslatableFields,
  isTranslatableGameType,
  mergeTranslation,
  toSpanishDeckId,
  translateCardsWith,
  type BatchTranslator,
} from "./deck-translation";

function puzzle(cardId: string, overrides: Partial<SituationCard> = {}): SituationCard {
  return {
    cardId,
    type: "situation",
    title: "The Bus",
    setup: "A woman lets her bus go by.",
    solution: "Her son was driving it.",
    keyFacts: [
      { id: "son", text: "The driver was her son." },
      { id: "first-day", text: "It was his first day." },
      { id: "watching", text: "She only came to watch." },
    ],
    hints: ["She never meant to get on.", "Who was driving?"],
    difficulty: "easy",
    contentWarnings: ["death"],
    estMinutes: 8,
    source: { origin: "original" },
    ...overrides,
  };
}

/** The JSON card array embedded in a translation prompt. */
function cardsInPrompt(prompt: string): Record<string, unknown>[] {
  const json = prompt.split("\n\n")[1];
  return JSON.parse(json) as Record<string, unknown>[];
}

/** Pretend model: "translates" by prefixing ES: and can mangle ids. */
function mockTranslator(
  transform: (card: Record<string, unknown>) => Record<string, unknown> = spanish
): { translate: BatchTranslator; prompts: string[] } {
  const prompts: string[] = [];
  const translate: BatchTranslator = async (batch) =>
    batch.map(({ prompt }) => {
      prompts.push(prompt);
      return { success: true, data: cardsInPrompt(prompt).map(transform) };
    });
  return { translate, prompts };
}

function spanish(card: Record<string, unknown>): Record<string, unknown> {
  const c = card as unknown as SituationCard;
  return {
    ...card,
    title: `ES ${c.title}`,
    setup: `ES ${c.setup}`,
    solution: `ES ${c.solution}`,
    // A sloppy model "translates" the ids too; they must be ignored.
    keyFacts: c.keyFacts.map((f) => ({ id: `es-${f.id}`, text: `ES ${f.text}` })),
    hints: c.hints.map((h) => `ES ${h}`),
    contentWarnings: (c.contentWarnings ?? []).map(() => "Muerte"),
  };
}

describe("extractTranslatableFields (situation)", () => {
  test("sends only text fields plus ids", () => {
    const fields = extractTranslatableFields(puzzle("cl-001"));
    expect(Object.keys(fields).sort()).toEqual(
      ["cardId", "contentWarnings", "hints", "keyFacts", "setup", "solution", "title", "type"].sort()
    );
    expect(fields).not.toHaveProperty("estMinutes");
    expect(fields).not.toHaveProperty("source");
  });
});

describe("translateCardsWith (mocked LLM)", () => {
  test("translates situation text and keeps card and key-fact ids", async () => {
    const noWarnings = puzzle("cl-002");
    delete noWarnings.contentWarnings;
    const cards: Card[] = [puzzle("cl-001"), noWarnings];
    const { translate } = mockTranslator();
    const { cards: out, failedBatches } = await translateCardsWith(cards, "situation", translate);
    expect(failedBatches).toBe(0);

    const first = out[0] as SituationCard;
    expect(first.cardId).toBe("cl-001");
    expect(first.title).toBe("ES The Bus");
    expect(first.setup).toBe("ES A woman lets her bus go by.");
    expect(first.solution).toBe("ES Her son was driving it.");
    expect(first.keyFacts.map((f) => f.id)).toEqual(["son", "first-day", "watching"]);
    expect(first.keyFacts[0].text).toBe("ES The driver was her son.");
    expect(first.hints).toEqual(["ES She never meant to get on.", "ES Who was driving?"]);
    expect(first.contentWarnings).toEqual(["muerte"]);
    // Untranslated metadata is kept
    expect(first.estMinutes).toBe(8);
    expect(first.difficulty).toBe("easy");
    expect(first.source).toEqual({ origin: "original" });

    const second = out[1] as SituationCard;
    expect(second.cardId).toBe("cl-002");
    expect("contentWarnings" in second).toBe(false);
  });

  test("ignores translated arrays whose length changed", async () => {
    const { translate } = mockTranslator((card) => ({
      ...spanish(card),
      keyFacts: [{ id: "x", text: "only one" }],
      hints: ["one", "two", "three"],
    }));
    const [card] = (await translateCardsWith([puzzle("cl-001")], "situation", translate))
      .cards as SituationCard[];
    expect(card.title).toBe("ES The Bus");
    expect(card.keyFacts).toEqual(puzzle("cl-001").keyFacts);
    expect(card.hints).toEqual(puzzle("cl-001").hints);
  });

  test("matches replies by cardId, not order, and keeps originals for missing cards", async () => {
    const cards: Card[] = [puzzle("a-1"), puzzle("a-2"), puzzle("a-3")];
    const translate: BatchTranslator = async (prompts) =>
      prompts.map(() => ({
        success: true,
        data: [spanish(extractTranslatableFields(cards[2])), spanish(extractTranslatableFields(cards[0]))],
      }));
    const warnings: string[] = [];
    const { cards: out } = await translateCardsWith(cards, "situation", translate, {
      warn: (m) => warnings.push(m),
    });
    expect(out.map((c) => c.cardId)).toEqual(["a-1", "a-2", "a-3"]);
    expect((out[0] as SituationCard).title).toBe("ES The Bus");
    expect((out[1] as SituationCard).title).toBe("The Bus");
    expect((out[2] as SituationCard).title).toBe("ES The Bus");
    expect(warnings).toHaveLength(1);
  });

  test("batches cards and keeps a failed batch in the original language", async () => {
    const cards = Array.from({ length: 5 }, (_, i) => puzzle(`b-${i}`));
    let call = 0;
    const translate: BatchTranslator = async (prompts) =>
      prompts.map(({ prompt }) => {
        call++;
        if (call === 2) return { success: false, error: "boom" };
        return { success: true, data: cardsInPrompt(prompt).map(spanish) };
      });
    const { cards: out, failedBatches } = await translateCardsWith(cards, "situation", translate, {
      batchSize: 2,
    });
    expect(failedBatches).toBe(1);
    expect(out.map((c) => (c as SituationCard).title)).toEqual([
      "ES The Bus",
      "ES The Bus",
      "The Bus",
      "The Bus",
      "ES The Bus",
    ]);
  });

  test("builds one prompt per batch with the game type", () => {
    const { batches, prompts } = buildTranslationPrompts(
      Array.from({ length: 16 }, (_, i) => puzzle(`c-${i}`)),
      "situation"
    );
    expect(batches.map((b) => b.length)).toEqual([15, 1]);
    expect(prompts[0].prompt).toContain("Translate these situation game cards to Spanish");
    expect(prompts[0].systemPrompt).toContain("Never change key fact ids");
  });
});

describe("toSpanishDeckId", () => {
  test("swaps the language segment", () => {
    expect(toSpanishDeckId("classic-en-situation")).toBe("classic-es-situation");
  });
});

describe("case decks (not translated until #36)", () => {
  const caseCard: CaseCard = {
    cardId: "case-001",
    type: "case",
    title: "The Missing Trophy",
    briefing: "The trophy is gone.",
    evidence: [{ id: "note", title: "Note", kind: "document", content: "Locked at 3." }],
    questions: [{ id: "who", prompt: "Who?", answer: "Lena", acceptedVariants: [], points: 1 }],
    walkthrough: "Lena took it.",
  };

  test("case is not a translatable game type", () => {
    expect(isTranslatableGameType("case")).toBe(false);
    expect(isTranslatableGameType("situation")).toBe(true);
  });

  test("translateCardsWith refuses case cards with a clear error", async () => {
    const { translate, prompts } = mockTranslator();
    await expect(translateCardsWith([caseCard], "case", translate)).rejects.toThrow(
      /case decks cannot be translated automatically yet/
    );
    expect(prompts).toEqual([]);
  });

  test("case cards pass through extract/merge untouched", () => {
    expect(extractTranslatableFields(caseCard)).toEqual({ cardId: "case-001", type: "case" });
    expect(mergeTranslation(caseCard, { title: "ES" })).toBe(caseCard);
  });
});
