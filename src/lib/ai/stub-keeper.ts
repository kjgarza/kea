/**
 * Offline keeper for local development (`KEEPER_PROVIDER=stub`). It reads the
 * key facts back out of the keeper prompt and answers "yes" when the question
 * shares a word with a fact, "rephrase" when it asks for the answer, and
 * "irrelevant" otherwise. Good enough to click through the UI; NOT a keeper.
 *
 * `stubGraderRespond` does the same for theories (a fact counts when the
 * theory contains at least half of its longer words), and `stubRespond`
 * routes a request to the right one by schema name.
 */
import { GRADER_SCHEMA_NAME } from "./grade";
import type { JsonGenerationRequest } from "./provider";

const ASK_FOR_ANSWER = /\b(answer|solution|tell me|respuesta|soluci[oó]n|dime)\b/i;

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4)
  );
}

function promptFacts(system: string) {
  return Array.from(system.matchAll(/^- \[([^\]]+)\] (.+)$/gm), (m) => ({ id: m[1], text: m[2] }));
}

function userText(request: JsonGenerationRequest): string {
  return request.messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
}

export function stubKeeperRespond(request: JsonGenerationRequest) {
  const user = userText(request);
  const question = user.match(/<question>\n([\s\S]*?)\n<\/question>/)?.[1] ?? "";
  if (ASK_FOR_ANSWER.test(question)) return { answer: "rephrase", factIds: [], confidence: 0.9 };

  const asked = words(question);
  const facts = promptFacts(request.system);
  const hits = facts.filter((fact) => Array.from(words(fact.text)).some((word) => asked.has(word)));
  if (hits.length > 0) return { answer: "yes", factIds: hits.map((fact) => fact.id), confidence: 0.4 };
  return { answer: "irrelevant", factIds: [], confidence: 0.3 };
}

/** Offline grader: a fact is "correct" when the theory has at least half of its words. */
export function stubGraderRespond(request: JsonGenerationRequest) {
  const theory = words(userText(request).match(/<theory>\n([\s\S]*?)\n<\/theory>/)?.[1] ?? "");
  const correctFactIds = promptFacts(request.system)
    .filter((fact) => {
      const factWords = Array.from(words(fact.text));
      const hits = factWords.filter((word) => theory.has(word)).length;
      return factWords.length > 0 && hits * 2 >= factWords.length;
    })
    .map((fact) => fact.id);
  return { correctFactIds };
}

/** Offline provider callback for every Worker endpoint, routed by schema name. */
export function stubRespond(request: JsonGenerationRequest) {
  return request.schemaName === GRADER_SCHEMA_NAME ? stubGraderRespond(request) : stubKeeperRespond(request);
}
