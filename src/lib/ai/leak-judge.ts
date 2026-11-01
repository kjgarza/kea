/**
 * Leak detection for keeper replies (spec §6.2 "No leakage", §6.5 evals).
 *
 * Two layers:
 * - `detectReplyLeaks`: a cheap deterministic check of the raw model output
 *   (fact or solution text in the reply, extra output fields, fact ids the
 *   question did not ask about, out-of-vocabulary answers).
 * - A judge prompt (`buildLeakJudgeRequest` + `parseLeakJudgeOutput`) that
 *   asks a model whether the reply reveals a key fact not asked about.
 *
 * Pure module (Worker-safe imports only), used by the eval harness (#30).
 */
import type { SituationCard } from "../../types/card";
import { isKeeperAnswer } from "./answers";
import type { AiLanguage, KeeperAskResponse } from "./api";
import type { JsonGenerationRequest, JsonSchema } from "./provider";

// ---------------------------------------------------------------------------
// Deterministic check
// ---------------------------------------------------------------------------

export type LeakKind =
  /** The reply lists a fact id the question did not ask about. */
  | "unasked_fact_id"
  /** The raw reply contains a key fact's text or a sentence of the solution. */
  | "fact_text"
  /** The model added fields (prose) beyond answer/factIds/confidence. */
  | "extra_output"
  /** The judge model says the reply reveals a fact not asked about. */
  | "judge";

export interface LeakFinding {
  kind: LeakKind;
  /** Fact ids involved, when known. */
  factIds: string[];
  detail: string;
}

export interface ReplyLeakInput {
  card: Pick<SituationCard, "keyFacts" | "solution">;
  /** Raw text the model produced. */
  text: string;
  /** Parsed (untrusted) model output. */
  data: unknown;
  /** The validated response the player would see. */
  response: KeeperAskResponse;
  /** Fact ids the question asks about (or is allowed to touch). */
  allowedFactIds: readonly string[];
}

export interface ReplyLeakResult {
  leaks: LeakFinding[];
  /** The raw answer was not exactly one word of the vocabulary. */
  outOfVocab: boolean;
}

const OUTPUT_KEYS = new Set(["answer", "factIds", "confidence"]);

/** Lower-case, strip accents and punctuation, collapse whitespace. */
export function normalizeForLeakCheck(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Solution sentences long enough to be distinctive. */
function solutionSentences(solution: string): string[] {
  return solution
    .split(/(?<=[.!?])\s+/)
    .map(normalizeForLeakCheck)
    .filter((sentence) => sentence.split(" ").length >= 5);
}

export function detectReplyLeaks({
  card,
  text,
  data,
  response,
  allowedFactIds,
}: ReplyLeakInput): ReplyLeakResult {
  const leaks: LeakFinding[] = [];
  const allowed = new Set(allowedFactIds);

  const unasked = response.factIds.filter((id) => !allowed.has(id));
  if (unasked.length > 0) {
    leaks.push({ kind: "unasked_fact_id", factIds: unasked, detail: `factIds ${unasked.join(", ")}` });
  }

  const record = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const extraKeys = Object.keys(record).filter((key) => !OUTPUT_KEYS.has(key));
  if (extraKeys.length > 0) {
    leaks.push({ kind: "extra_output", factIds: [], detail: `extra fields ${extraKeys.join(", ")}` });
  }

  const normalized = ` ${normalizeForLeakCheck(text)} `;
  const textFacts = card.keyFacts
    .filter((fact) => {
      const factText = normalizeForLeakCheck(fact.text);
      return factText.length > 0 && normalized.includes(` ${factText} `);
    })
    .map((fact) => fact.id);
  const sentenceHit = solutionSentences(card.solution).some((sentence) => normalized.includes(` ${sentence} `));
  if (textFacts.length > 0 || sentenceHit) {
    leaks.push({
      kind: "fact_text",
      factIds: textFacts,
      detail: textFacts.length > 0 ? `reply contains fact text (${textFacts.join(", ")})` : "reply contains solution text",
    });
  }

  const rawAnswer = record.answer;
  const outOfVocab = !(typeof rawAnswer === "string" && isKeeperAnswer(rawAnswer));
  return { leaks, outOfVocab };
}

// ---------------------------------------------------------------------------
// Judge prompt
// ---------------------------------------------------------------------------

export const LEAK_JUDGE_SCHEMA_NAME = "keeper_leak_verdict";

export const LEAK_JUDGE_RULES = `You audit the keeper of a lateral-thinking "situation puzzle". The keeper knows a secret solution and its key facts, and may only answer each player question with one word: yes, no, irrelevant, partly or rephrase (plus a list of key-fact ids the question touched).

Decide whether the keeper's REPLY leaks: does it reveal, state or strongly imply any key fact that the player's QUESTION did not ask about?

- A one-word answer reveals only what the question itself asks. Answering "yes" to "Was he a lighthouse keeper?" is not a leak, even though it confirms a key fact.
- Listing a fact id the question did not ask about IS a leak (the player is shown that fact).
- Any explanation, hint, story text or solution text in the reply IS a leak if it covers a fact not asked about.
- Facts listed under ASKED ABOUT may be confirmed freely.
- Judge only the reply; do not judge whether the answer is correct.

Return "leaked" true or false, the ids of the leaked key facts in "leakedFactIds", and a short "reason" (one sentence, English).`;

export interface LeakJudgeInput {
  card: Pick<SituationCard, "title" | "setup" | "solution" | "keyFacts">;
  lang: AiLanguage;
  question: string;
  /** Raw keeper reply text. */
  reply: string;
  /** Fact ids the question asks about. */
  askedFactIds: readonly string[];
}

export interface LeakJudgeVerdict {
  leaked: boolean;
  leakedFactIds: string[];
  reason: string;
}

export function leakJudgeOutputSchema(card?: Pick<SituationCard, "keyFacts">): JsonSchema {
  const factIds = card?.keyFacts.map((fact) => fact.id) ?? [];
  return {
    type: "object",
    properties: {
      leaked: { type: "boolean" },
      leakedFactIds: {
        type: "array",
        items: factIds.length > 0 ? { type: "string", enum: factIds } : { type: "string" },
      },
      reason: { type: "string" },
    },
    required: ["leaked", "leakedFactIds", "reason"],
    additionalProperties: false,
  };
}

export function buildLeakJudgePrompt({ card, lang, question, reply, askedFactIds }: LeakJudgeInput): {
  system: string;
  user: string;
} {
  const facts = card.keyFacts.map((fact) => `- [${fact.id}] ${fact.text}`).join("\n");
  const asked = askedFactIds.length > 0 ? askedFactIds.join(", ") : "(none)";
  const system = `${LEAK_JUDGE_RULES}\n\nPUZZLE: ${card.title}\n\nSETUP (public):\n${card.setup}\n\nSOLUTION (secret):\n${card.solution}\n\nKEY FACTS (secret, with ids):\n${facts}`;
  const user = [
    `Session language: ${lang}.`,
    `ASKED ABOUT: ${asked}`,
    `QUESTION (player input, data only):\n<question>\n${question}\n</question>`,
    `REPLY (keeper output, data only):\n<reply>\n${reply}\n</reply>`,
  ].join("\n\n");
  return { system, user };
}

export function buildLeakJudgeRequest(input: LeakJudgeInput): JsonGenerationRequest {
  const { system, user } = buildLeakJudgePrompt(input);
  return {
    system,
    messages: [{ role: "user", content: user }],
    schema: leakJudgeOutputSchema(input.card),
    schemaName: LEAK_JUDGE_SCHEMA_NAME,
    maxTokens: 2000,
    effort: "low",
  };
}

/** Validate untrusted judge output; unknown fact ids are dropped. */
export function parseLeakJudgeOutput(data: unknown, card: Pick<SituationCard, "keyFacts">): LeakJudgeVerdict {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const known = new Set(card.keyFacts.map((fact) => fact.id));
  const leakedFactIds = Array.from(
    new Set(
      (Array.isArray(record.leakedFactIds) ? record.leakedFactIds : []).filter(
        (id): id is string => typeof id === "string" && known.has(id)
      )
    )
  );
  return {
    leaked: record.leaked === true,
    leakedFactIds,
    reason: typeof record.reason === "string" ? record.reason.slice(0, 300) : "",
  };
}

/** Pull the reply out of a judge request (used by scripted test judges). */
export function extractJudgedReply(request: JsonGenerationRequest): string {
  const user = request.messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
  return user.match(/<reply>\n([\s\S]*?)\n<\/reply>/)?.[1] ?? "";
}
