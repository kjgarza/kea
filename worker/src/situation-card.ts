/** Load a situation card from the published deck, or the error Response to send. */
import type { SituationCard } from "../../src/types/card";
import { DeckLoadError, type DeckLoader } from "./decks";
import { errorResponse } from "./http";

export async function loadSituationCard(
  decks: DeckLoader,
  deckId: string,
  cardId: string
): Promise<SituationCard | Response> {
  try {
    const deck = await decks.load(deckId);
    const found = deck.cards.find((c) => c.cardId === cardId);
    if (!found) return errorResponse(404, "not_found", `Card ${cardId} is not in deck ${deckId}`);
    if (found.type !== "situation") {
      return errorResponse(400, "bad_request", `Card ${cardId} is not a situation puzzle`);
    }
    return found;
  } catch (error) {
    if (error instanceof DeckLoadError) {
      return error.status === 404
        ? errorResponse(404, "not_found", error.message)
        : errorResponse(502, "deck_unavailable", error.message);
    }
    throw error;
  }
}
