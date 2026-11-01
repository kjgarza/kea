import { describe, expect, test } from "bun:test";
import type { SituationCard } from "@/types/card";
import {
  LEAK_JUDGE_SCHEMA_NAME,
  buildLeakJudgeRequest,
  detectReplyLeaks,
  extractJudgedReply,
  leakJudgeOutputSchema,
  normalizeForLeakCheck,
  parseLeakJudgeOutput,
} from "./leak-judge";

const card: SituationCard = {
  cardId: "bus",
  type: "situation",
  title: "The bus",
  setup: "Anna let the 8:00 bus go by and smiled.",
  solution: "Her son was driving the next bus on his first day. She wanted to ride with him.",
  keyFacts: [
    { id: "son", text: "The next bus driver is her son" },
    { id: "first-day", text: "It is his first day" },
  ],
  hints: ["Who drives the next bus?"],
};

function check(data: Record<string, unknown>, allowed: string[], factIds: string[] = []) {
  return detectReplyLeaks({
    card,
    text: JSON.stringify(data),
    data,
    response: { answer: "yes", factIds, confidence: 1 },
    allowedFactIds: allowed,
  });
}

describe("detectReplyLeaks", () => {
  test("a clean one-word reply has no leaks", () => {
    const result = check({ answer: "yes", factIds: ["son"], confidence: 0.9 }, ["son"], ["son"]);
    expect(result).toEqual({ leaks: [], outOfVocab: false });
  });

  test("flags fact ids the question did not ask about", () => {
    const result = check({ answer: "yes", factIds: ["son", "first-day"], confidence: 1 }, ["son"], ["son", "first-day"]);
    expect(result.leaks).toEqual([
      { kind: "unasked_fact_id", factIds: ["first-day"], detail: "factIds first-day" },
    ]);
  });

  test("flags extra prose fields and fact text in the reply", () => {
    const result = check(
      { answer: "yes", factIds: [], confidence: 1, explanation: "Yes! It is his first day." },
      []
    );
    expect(result.leaks.map((leak) => leak.kind)).toEqual(["extra_output", "fact_text"]);
    expect(result.leaks[1].factIds).toEqual(["first-day"]);
  });

  test("flags a solution sentence even when no fact matches word for word", () => {
    const result = check({ answer: "no", note: "She wanted to ride with him" }, []);
    expect(result.leaks.find((leak) => leak.kind === "fact_text")?.detail).toBe("reply contains solution text");
  });

  test("reports off-vocabulary answers", () => {
    expect(check({ answer: "Yes, her son", factIds: [], confidence: 1 }, []).outOfVocab).toBe(true);
    expect(check({ answer: "YES", factIds: [], confidence: 1 }, []).outOfVocab).toBe(true);
    expect(check({ answer: "partly", factIds: [], confidence: 1 }, []).outOfVocab).toBe(false);
  });

  test("normalises accents and punctuation (Spanish replies)", () => {
    expect(normalizeForLeakCheck("¡Sí, Mía nació después!")).toBe("si mia nacio despues");
  });
});

describe("leak judge prompt", () => {
  test("puts the secret in the system prompt and the reply as delimited data", () => {
    const request = buildLeakJudgeRequest({
      card,
      lang: "es",
      question: "¿Es su hijo?",
      reply: '{"answer":"yes"}',
      askedFactIds: ["son"],
    });
    expect(request.schemaName).toBe(LEAK_JUDGE_SCHEMA_NAME);
    expect(request.system).toContain(card.solution);
    expect(request.system).toContain("[first-day] It is his first day");
    const user = request.messages[0].content as string;
    expect(user).toContain("ASKED ABOUT: son");
    expect(user).toContain("<question>\n¿Es su hijo?\n</question>");
    expect(extractJudgedReply(request)).toBe('{"answer":"yes"}');
  });

  test("schema narrows fact ids to the card", () => {
    const schema = leakJudgeOutputSchema(card) as { properties: { leakedFactIds: { items: { enum: string[] } } } };
    expect(schema.properties.leakedFactIds.items.enum).toEqual(["son", "first-day"]);
  });

  test("parses verdicts defensively", () => {
    expect(parseLeakJudgeOutput({ leaked: true, leakedFactIds: ["son", "nope", "son"], reason: "r" }, card)).toEqual({
      leaked: true,
      leakedFactIds: ["son"],
      reason: "r",
    });
    expect(parseLeakJudgeOutput("garbage", card)).toEqual({ leaked: false, leakedFactIds: [], reason: "" });
    expect(parseLeakJudgeOutput({ leaked: "yes" }, card).leaked).toBe(false);
  });
});
