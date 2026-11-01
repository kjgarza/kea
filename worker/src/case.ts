/**
 * POST /case/ask (AI investigator, F15) and POST /case/judge (answer judge,
 * F16), #37. Both rebuild their responses field by field, so nothing the
 * model writes beyond the validated fields reaches a player.
 */
import type { CaseAskResponse, CaseJudgeResponse } from "../../src/lib/ai/api";
import {
  answerInvestigatorQuestion,
  judgeAnswers,
  validateCaseAskRequest,
  validateCaseJudgeRequest,
} from "../../src/lib/ai/case";
import { loadCaseCard } from "./case-card";
import { errorResponse, json } from "./http";
import type { HandlerContext } from "./router";

async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

export async function handleCaseAsk(ctx: HandlerContext): Promise<Response> {
  const read = await readJson(ctx.request);
  if (!read.ok) return errorResponse(400, "bad_request", "Body must be JSON");
  const parsed = validateCaseAskRequest(read.body);
  if (!parsed.ok) return errorResponse(400, "bad_request", parsed.error);
  const req = parsed.value;

  const card = await loadCaseCard(ctx.decks, req.deckId, req.cardId);
  if (card instanceof Response) return card;

  const limited = await ctx.meter();
  if (limited) return limited;

  let result;
  try {
    // The prompt is built from the server-side card and only the evidence
    // that is opened, exists and is unlocked (`allowedEvidenceIds`).
    result = await answerInvestigatorQuestion(ctx.provider(), {
      card,
      lang: req.lang,
      openedEvidenceIds: req.openedEvidenceIds,
      question: req.question,
    });
  } catch (error) {
    console.error("investigator upstream error", String(error));
    return errorResponse(502, "upstream_error", "The investigator is unavailable. Try again.");
  }
  if (result.fallback) {
    console.warn("investigator fallback", result.fallback);
    return errorResponse(502, "upstream_error", "The investigator could not answer. Try again.");
  }
  const response: CaseAskResponse = {
    answer: result.response.answer,
    citedEvidenceIds: result.response.citedEvidenceIds,
    inEvidence: result.response.inEvidence,
  };
  return json(response);
}

export async function handleCaseJudge(ctx: HandlerContext): Promise<Response> {
  const read = await readJson(ctx.request);
  if (!read.ok) return errorResponse(400, "bad_request", "Body must be JSON");
  const parsed = validateCaseJudgeRequest(read.body);
  if (!parsed.ok) return errorResponse(400, "bad_request", parsed.error);
  const req = parsed.value;

  const card = await loadCaseCard(ctx.decks, req.deckId, req.cardId);
  if (card instanceof Response) return card;

  // Only questions of this card that the group submitted are judged.
  const known = new Set(card.questions.map((q) => q.id));
  const answers = Object.fromEntries(Object.entries(req.answers).filter(([id]) => known.has(id)));
  if (Object.keys(answers).length === 0) {
    return errorResponse(400, "bad_request", `None of the answers is for a question of ${req.cardId}`);
  }

  const limited = await ctx.meter();
  if (limited) return limited;

  let result;
  try {
    result = await judgeAnswers(ctx.provider(), { card, lang: req.lang, answers });
  } catch (error) {
    console.error("judge upstream error", String(error));
    return errorResponse(502, "upstream_error", "The judge is unavailable. Try again.");
  }
  if (result.fallback) {
    console.warn("judge fallback", result.fallback);
    return errorResponse(502, "upstream_error", "The judge could not mark these answers. Try again.");
  }
  // Ids and booleans only: never the answers, variants or the group's text.
  const response: CaseJudgeResponse = {
    results: result.response.results.map(({ questionId, correct }) => ({ questionId, correct })),
  };
  return json(response);
}
