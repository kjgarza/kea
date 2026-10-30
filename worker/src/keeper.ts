/** POST /keeper/ask */
import { answerKeeperQuestion, validateKeeperAskRequest } from "../../src/lib/ai/keeper";
import type { KeeperAskResponse } from "../../src/lib/ai/api";
import { errorResponse, json } from "./http";
import type { HandlerContext } from "./router";
import { loadSituationCard } from "./situation-card";

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

  const card = await loadSituationCard(ctx.decks, req.deckId, req.cardId);
  if (card instanceof Response) return card;

  const limited = await ctx.meter();
  if (limited) return limited;

  const provider = ctx.provider();
  let result: KeeperAskResponse;
  try {
    const turn = await answerKeeperQuestion(provider, {
      card,
      lang: req.lang,
      transcript: req.transcript,
      question: req.question,
    });
    if (turn.fallback) console.warn("keeper fallback", turn.fallback);
    result = turn.response;
  } catch (error) {
    console.error("keeper upstream error", String(error));
    return errorResponse(502, "upstream_error", "The keeper is unavailable. Try again.");
  }
  return json(result);
}
