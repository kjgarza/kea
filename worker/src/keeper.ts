/** POST /keeper/ask */
import {
  FALLBACK_KEEPER_RESPONSE,
  buildKeeperRequest,
  parseKeeperOutput,
  validateKeeperAskRequest,
} from "../../src/lib/ai/keeper";
import { ProviderError, generateJsonWithRetry } from "../../src/lib/ai/provider";
import type { KeeperAskResponse } from "../../src/lib/ai/api";
import type { SituationCard } from "../../src/types/card";
import { DeckLoadError } from "./decks";
import { errorResponse, json } from "./http";
import type { HandlerContext } from "./router";

export async function handleKeeperAsk(ctx: HandlerContext): Promise<Response> {
  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return errorResponse(400, "bad_request", "Body must be JSON");
  }
  const parsed = validateKeeperAskRequest(body);
  if (!parsed.ok) return errorResponse(400, "bad_request", parsed.error);
  const req = parsed.value;

  let card: SituationCard;
  try {
    const deck = await ctx.decks.load(req.deckId);
    const found = deck.cards.find((c) => c.cardId === req.cardId);
    if (!found) return errorResponse(404, "not_found", `Card ${req.cardId} is not in deck ${req.deckId}`);
    if (found.type !== "situation") {
      return errorResponse(400, "bad_request", `Card ${req.cardId} is not a situation puzzle`);
    }
    card = found;
  } catch (error) {
    if (error instanceof DeckLoadError) {
      return error.status === 404
        ? errorResponse(404, "not_found", error.message)
        : errorResponse(502, "deck_unavailable", error.message);
    }
    throw error;
  }

  const limited = await ctx.meter();
  if (limited) return limited;

  const provider = ctx.provider();
  const request = buildKeeperRequest({
    card,
    lang: req.lang,
    transcript: req.transcript,
    question: req.question,
  });

  let result: KeeperAskResponse;
  try {
    const output = await generateJsonWithRetry(provider, request, { attempts: 2, delayMs: 250 });
    result = parseKeeperOutput(output.data, card);
  } catch (error) {
    if (error instanceof ProviderError && error.kind !== "http") {
      // Declined, truncated or malformed: ask the player to rephrase.
      console.warn("keeper fallback", error.kind, error.message);
      result = FALLBACK_KEEPER_RESPONSE;
    } else {
      console.error("keeper upstream error", String(error));
      return errorResponse(502, "upstream_error", "The keeper is unavailable. Try again.");
    }
  }
  return json(result);
}
