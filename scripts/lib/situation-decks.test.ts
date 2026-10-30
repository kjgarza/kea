import { describe, expect, test } from "bun:test";
import type { SituationCard } from "../../src/types/card";
import type { Deck, DeckIndex } from "../../src/types/deck";
import { validateSituationCard } from "./validators";
import { isDeathRelatedWarning, mentionsDeath } from "./situation-generation";
import { toSpanishDeckId } from "./deck-translation";

/**
 * Checks for the committed situation seed decks (issue #26) and their
 * Spanish translations.
 */

const DECKS_DIR = "public/decks";
const SEED_DECKS = [
  "classic-en-situation",
  "no-death-en-situation",
  "lateral-thinking-en-situation",
];

async function loadDeck(deckId: string): Promise<Deck<SituationCard>> {
  return (await Bun.file(`${DECKS_DIR}/${deckId}.json`).json()) as Deck<SituationCard>;
}

async function situationDeckIds(): Promise<string[]> {
  const index = (await Bun.file(`${DECKS_DIR}/index.json`).json()) as DeckIndex;
  return index.decks.filter((d) => d.gameType === "situation").map((d) => d.deckId);
}

describe("situation decks", () => {
  test("every situation deck in the index passes the validator unchanged", async () => {
    const ids = await situationDeckIds();
    expect(ids).toEqual(expect.arrayContaining(SEED_DECKS.flatMap((id) => [id, toSpanishDeckId(id)])));
    for (const deckId of ids) {
      const deck = await loadDeck(deckId);
      expect(deck.gameType).toBe("situation");
      for (const card of deck.cards) {
        const result = validateSituationCard(card, card.cardId);
        expect(result.errors).toEqual([]);
        expect(result.card).toEqual(card);
      }
      const cardIds = deck.cards.map((c) => c.cardId);
      expect(new Set(cardIds).size).toBe(cardIds.length);
    }
  });

  for (const enId of SEED_DECKS) {
    const esId = toSpanishDeckId(enId);

    test(`${enId} has 20–30 original puzzles`, async () => {
      const deck = await loadDeck(enId);
      expect(deck.language).toBe("en");
      expect(deck.cards.length).toBeGreaterThanOrEqual(20);
      expect(deck.cards.length).toBeLessThanOrEqual(30);
      for (const card of deck.cards) {
        expect(card.source?.origin).toBe("original");
      }
    });

    test(`${esId} keeps the card and key-fact ids of ${enId}`, async () => {
      const [en, es] = await Promise.all([loadDeck(enId), loadDeck(esId)]);
      expect(es.language).toBe("es");
      expect(es.cards.map((c) => c.cardId)).toEqual(en.cards.map((c) => c.cardId));
      es.cards.forEach((esCard, i) => {
        const enCard = en.cards[i];
        expect(esCard.keyFacts.map((f) => f.id)).toEqual(enCard.keyFacts.map((f) => f.id));
        expect(esCard.hints.length).toBe(enCard.hints.length);
        expect(esCard.difficulty).toBe(enCard.difficulty);
        expect(esCard.estMinutes).toBe(enCard.estMinutes);
        expect((esCard.contentWarnings ?? []).length).toBe((enCard.contentWarnings ?? []).length);
        // Actually translated, not copied
        expect(esCard.setup).not.toBe(enCard.setup);
        expect(esCard.solution).not.toBe(enCard.solution);
      });
      expect(es.nsfw).toBe(en.nsfw);
      expect(es.difficulty).toBe(en.difficulty);
    });
  }

  test("the no-death decks are family-safe and never mention death", async () => {
    for (const deckId of ["no-death-en-situation", "no-death-es-situation"]) {
      const deck = await loadDeck(deckId);
      expect(deck.nsfw).toBe(false);
      for (const card of deck.cards) {
        expect((card.contentWarnings ?? []).filter(isDeathRelatedWarning)).toEqual([]);
        expect(mentionsDeath(card)).toBe(false);
      }
    }
    const index = (await Bun.file(`${DECKS_DIR}/index.json`).json()) as DeckIndex;
    for (const deckId of ["no-death-en-situation", "no-death-es-situation"]) {
      const meta = index.decks.find((d) => d.deckId === deckId);
      expect(meta?.nsfw).toBe(false);
      expect(meta?.contentWarnings).toEqual([]);
    }
  });
});
