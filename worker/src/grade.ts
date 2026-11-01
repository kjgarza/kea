/** POST /keeper/grade (#32, spec F10). */
import type { KeeperGradeResponse } from "../../src/lib/ai/api";
import { gradeTheory, validateKeeperGradeRequest } from "../../src/lib/ai/grade";
import { errorResponse, json, readJsonBody } from "./http";
import type { HandlerContext } from "./router";
import { loadSituationCard } from "./situation-card";

export async function handleKeeperGrade(ctx: HandlerContext): Promise<Response> {
  const read = await readJsonBody(ctx.request);
  if (!read.ok) return read.response;
  const parsed = validateKeeperGradeRequest(read.body);
  if (!parsed.ok) return errorResponse(400, "bad_request", parsed.error);
  const req = parsed.value;

  const card = await loadSituationCard(ctx.decks, req.deckId, req.cardId);
  if (card instanceof Response) return card;

  // Build the provider first: a misconfigured Worker must not burn quota.
  const provider = ctx.provider();
  const limited = await ctx.meter();
  if (limited) return limited;

  let result;
  try {
    result = await gradeTheory(provider, { card, lang: req.lang, theory: req.theory });
  } catch (error) {
    console.error("grader upstream error", String(error));
    return errorResponse(502, "upstream_error", "The grader is unavailable. Try again.");
  }
  if (result.fallback) {
    // No usable grade: let the player retry rather than record a wrong verdict.
    console.warn("grader fallback", result.fallback);
    return errorResponse(502, "upstream_error", "The grader could not grade this theory. Try again.");
  }

  // Rebuilt field by field: only known correct ids, a count, and the verdict.
  // Missing fact ids or texts can never be part of the response.
  const response: KeeperGradeResponse = {
    correctFactIds: result.response.correctFactIds,
    missingCount: result.response.missingCount,
    verdict: result.response.verdict,
  };
  return json(response);
}
