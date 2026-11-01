import { describe, expect, test } from "bun:test";
import type { Deck, DeckIndex } from "../../src/types/deck";
import { buildDeckMeta, upsertDeckIndex } from "./deck-index";

const DECKS_DIR = new URL("../../public/decks/", import.meta.url);

function deck(deckId: string, name: string, cards: unknown[]): Deck {
  return {
    schemaVersion: 1,
    deckId,
    version: "2026-01-01T00:00:00Z",
    name,
    gameType: cards.length && (cards[0] as { type: string }).type === "situation" ? "situation" : "charades",
    language: "en",
    difficulty: "easy",
    topics: [],
    nsfw: false,
    cards,
  } as Deck;
}

describe("buildDeckMeta", () => {
  test("non-puzzle decks get no content warnings", () => {
    const meta = buildDeckMeta(
      deck("a-en-charades", "A", [{ cardId: "1", type: "charades", prompt: "x" }]),
      true
    );
    expect(meta.contentWarnings).toEqual([]);
    expect(meta.cardCount).toBe(1);
    expect(meta.recommended).toBe(true);
  });

  test("situation decks get the normalised, sorted union of card warnings", () => {
    const meta = buildDeckMeta(
      deck("s-en-situation", "S", [
        { cardId: "1", type: "situation", contentWarnings: ["Gore", "death"] },
        { cardId: "2", type: "situation" },
        { cardId: "3", type: "situation", contentWarnings: ["death", " Child  death "] },
      ]),
      false
    );
    expect(meta.contentWarnings).toEqual(["child death", "death", "gore"]);
  });
});

describe("upsertDeckIndex", () => {
  test("replaces by deckId, adds new decks and sorts by name", () => {
    const index: DeckIndex = {
      schemaVersion: 1,
      decks: [buildDeckMeta(deck("b", "B", []), true)],
    };
    const next = upsertDeckIndex(index, [
      { deck: deck("b", "B", [{ cardId: "1", type: "charades", prompt: "x" }]), recommended: false },
      { deck: deck("a", "A", []), recommended: true },
    ]);
    expect(next.decks.map((d) => d.deckId)).toEqual(["a", "b"]);
    expect(next.decks[1].cardCount).toBe(1);
    expect(next.decks[1].recommended).toBe(false);
    expect(index.decks[0].cardCount).toBe(0); // input untouched
  });
});

describe("public/decks/index.json", () => {
  test("every entry matches what buildDeckMeta computes from its deck file", async () => {
    const index = (await Bun.file(new URL("index.json", DECKS_DIR)).json()) as DeckIndex;
    for (const meta of index.decks) {
      const file = (await Bun.file(new URL(`${meta.deckId}.json`, DECKS_DIR)).json()) as Deck;
      expect(meta).toEqual(buildDeckMeta(file, meta.recommended));
    }
  });

  test("lists the sample situation deck with its warnings", async () => {
    const index = (await Bun.file(new URL("index.json", DECKS_DIR)).json()) as DeckIndex;
    const sample = index.decks.find((d) => d.deckId === "sample-en-situation");
    expect(sample?.gameType).toBe("situation");
    expect(sample?.contentWarnings).toEqual(["animal in danger", "medical emergency"]);
  });
});
