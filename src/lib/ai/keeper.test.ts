import { describe, expect, test } from "bun:test";
import type { SituationCard } from "@/types/card";
import { KEEPER_ANSWERS, normalizeKeeperAnswer } from "./answers";
import { ProviderError, createStubProvider } from "./provider";
import {
  FALLBACK_KEEPER_RESPONSE,
  KEEPER_RULES,
  answerKeeperQuestion,
  buildKeeperPrompt,
  buildKeeperRequest,
  keeperOutputSchema,
  parseKeeperOutput,
  validateKeeperAskRequest,
} from "./keeper";

const card: SituationCard = {
  cardId: "bus",
  type: "situation",
  title: "The bus",
  setup: "Anna let the 8:00 bus go by and smiled.",
  solution: "Her son was driving the next bus on his first day.",
  keyFacts: [
    { id: "son", text: "The next bus driver is her son" },
    { id: "first-day", text: "It is his first day" },
  ],
  hints: ["Who drives the next bus?"],
};

describe("answer vocabulary", () => {
  test("is exactly the spec's five answers", () => {
    expect([...KEEPER_ANSWERS]).toEqual(["yes", "no", "irrelevant", "partly", "rephrase"]);
  });
  test("normalises case and maps anything else to rephrase", () => {
    expect(normalizeKeeperAnswer(" Partly ")).toBe("partly");
    expect(normalizeKeeperAnswer("sí")).toBe("rephrase");
    expect(normalizeKeeperAnswer(undefined)).toBe("rephrase");
  });
});

describe("keeper prompt", () => {
  test("puts the solution and facts in the system prompt and the question in the user turn", () => {
    const { system, user } = buildKeeperPrompt({
      card,
      lang: "es",
      transcript: [{ q: "¿Es tarde?", a: "no" }],
      question: "¿El conductor es su hijo?",
    });
    expect(system.startsWith(KEEPER_RULES)).toBe(true);
    expect(system).toContain(card.solution);
    expect(system).toContain("[son] The next bus driver is her son");
    expect(user).toContain("Spanish");
    expect(user).toContain("1. Q: ¿Es tarde?\n   A: no");
    expect(user).toContain("<question>\n¿El conductor es su hijo?\n</question>");
    expect(user).not.toContain(card.solution);
  });

  test("states the no-leak and consistency rules", () => {
    expect(KEEPER_RULES).toContain("Never invent details");
    expect(KEEPER_RULES).toContain("Never volunteer information");
    expect(KEEPER_RULES).toContain("just tell me the answer");
    expect(KEEPER_RULES).toContain("same answer");
  });

  test("request uses a schema narrowed to the card's fact ids", () => {
    const request = buildKeeperRequest({ card, lang: "en", transcript: [], question: "Q?" });
    expect(request.schema).toEqual(keeperOutputSchema(card));
    const props = (request.schema as { properties: Record<string, { enum?: string[]; items?: { enum?: string[] } }> })
      .properties;
    expect(props.answer.enum).toEqual([...KEEPER_ANSWERS]);
    expect(props.factIds.items?.enum).toEqual(["son", "first-day"]);
    expect(request.schema.additionalProperties).toBe(false);
  });
});

describe("parseKeeperOutput", () => {
  test("keeps valid output", () => {
    expect(parseKeeperOutput({ answer: "partly", factIds: ["first-day"], confidence: 0.7 }, card)).toEqual({
      answer: "partly",
      factIds: ["first-day"],
      confidence: 0.7,
    });
  });
  test("drops fact ids for irrelevant/rephrase and unknown ids", () => {
    expect(parseKeeperOutput({ answer: "irrelevant", factIds: ["son"], confidence: 0.5 }, card).factIds).toEqual([]);
    expect(parseKeeperOutput({ answer: "no", factIds: ["x", "son"], confidence: 0.5 }, card).factIds).toEqual(["son"]);
  });
  test("handles garbage", () => {
    expect(parseKeeperOutput(null, card)).toEqual({ answer: "rephrase", factIds: [], confidence: 0 });
    expect(parseKeeperOutput({ answer: "yes", factIds: "son", confidence: "high" }, card)).toEqual({
      answer: "yes",
      factIds: [],
      confidence: 0,
    });
  });
});

describe("validateKeeperAskRequest", () => {
  const valid = { deckId: "d-en-situation", cardId: "bus", lang: "en", transcript: [], question: " Is it? " };

  test("rebuilds the request from known fields only", () => {
    const result = validateKeeperAskRequest({ ...valid, solution: "leak", keyFacts: [] });
    expect(result).toEqual({
      ok: true,
      value: { deckId: "d-en-situation", cardId: "bus", lang: "en", transcript: [], question: "Is it?" },
    });
  });

  test("normalises transcript answers and keeps only q/a", () => {
    const result = validateKeeperAskRequest({
      ...valid,
      transcript: [{ q: "A?", a: "YES", factIds: ["son"], at: "now" }, { q: "B?", a: "dunno" }],
    });
    expect(result.ok && result.value.transcript).toEqual([
      { q: "A?", a: "yes" },
      { q: "B?", a: "rephrase" },
    ]);
  });

  test("rejects bad input", () => {
    for (const bad of [
      null,
      [],
      { ...valid, deckId: "" },
      { ...valid, cardId: "a/b" },
      { ...valid, lang: "de" },
      { ...valid, question: "   " },
      { ...valid, question: "x".repeat(301) },
      { ...valid, transcript: {} },
      { ...valid, transcript: [{ a: "yes" }] },
    ]) {
      expect(validateKeeperAskRequest(bad).ok).toBe(false);
    }
  });
});

describe("answerKeeperQuestion (shared by the Worker and the evals)", () => {
  const input = { card, lang: "en" as const, transcript: [], question: "Is it her son?" };

  test("validates the model output", async () => {
    const provider = createStubProvider(() => ({ answer: "YES", factIds: ["son", "x"], confidence: 3 }));
    const turn = await answerKeeperQuestion(provider, input);
    expect(turn.response).toEqual({ answer: "yes", factIds: ["son"], confidence: 1 });
    expect(turn.fallback).toBeNull();
    expect(turn.raw?.text).toContain("YES");
  });

  test("falls back to rephrase when the model declines", async () => {
    const provider = createStubProvider(() => {
      throw new ProviderError("refusal", "no");
    });
    const turn = await answerKeeperQuestion(provider, input, { attempts: 1 });
    expect(turn).toEqual({ response: FALLBACK_KEEPER_RESPONSE, raw: null, fallback: "refusal" });
  });

  test("re-throws HTTP errors", async () => {
    const provider = createStubProvider(() => {
      throw new ProviderError("http", "down", 400);
    });
    await expect(answerKeeperQuestion(provider, input, { attempts: 1 })).rejects.toThrow("down");
  });
});
