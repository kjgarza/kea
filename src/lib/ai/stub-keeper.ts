/**
 * Offline keeper for local development (`KEEPER_PROVIDER=stub`). It reads the
 * key facts back out of the keeper prompt and answers "yes" when the question
 * shares a word with a fact, "rephrase" when it asks for the answer, and
 * "irrelevant" otherwise. Good enough to click through the UI; NOT a keeper.
 */
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

export function stubKeeperRespond(request: JsonGenerationRequest) {
  const user = request.messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
  const question = user.match(/<question>\n([\s\S]*?)\n<\/question>/)?.[1] ?? "";
  if (ASK_FOR_ANSWER.test(question)) return { answer: "rephrase", factIds: [], confidence: 0.9 };

  const asked = words(question);
  const facts = Array.from(request.system.matchAll(/^- \[([^\]]+)\] (.+)$/gm), (m) => ({
    id: m[1],
    text: m[2],
  }));
  const hits = facts.filter((fact) => Array.from(words(fact.text)).some((word) => asked.has(word)));
  if (hits.length > 0) return { answer: "yes", factIds: hits.map((fact) => fact.id), confidence: 0.4 };
  return { answer: "irrelevant", factIds: [], confidence: 0.3 };
}
