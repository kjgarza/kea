import { describe, expect, test } from "bun:test";
import type { SituationCard } from "../../types/card";
import {
  GRADER_SCHEMA_NAME,
  buildGradeRequest,
  closeMinimum,
  findGradeLeaks,
  gradeOutputSchema,
  gradeTheory,
  parseGradeOutput,
  toGradeResponse,
  validateKeeperGradeRequest,
  verdictFor,
} from "./grade";
import { ProviderError, createStubProvider, type LlmProvider } from "./provider";
import { stubGraderRespond, stubRespond } from "./stub-keeper";

const card: SituationCard = {
  cardId: "bus",
  type: "situation",
  title: "The bus",
  setup: "Anna let the 8:00 bus go by and smiled.",
  solution: "Her son was driving the next bus on his first day.",
  keyFacts: [
    { id: "son", text: "The driver of the next bus is her son" },
    { id: "first-day", text: "It is his first day as a driver" },
    { id: "proud", text: "She waited to ride with him" },
    { id: "smile", text: "She smiled because she was proud" },
  ],
  hints: ["Who drives the next bus?"],
};

describe("verdict rules", () => {
  test("solved = all facts, close = at least half (rounded up), not_yet otherwise", () => {
    expect(closeMinimum(3)).toBe(2);
    expect(closeMinimum(4)).toBe(2);
    expect(closeMinimum(5)).toBe(3);
    expect(closeMinimum(8)).toBe(4);
    expect([0, 1, 2, 3, 4].map((n) => verdictFor(n, 4))).toEqual(["not_yet", "not_yet", "close", "close", "solved"]);
    expect([0, 1, 2, 3].map((n) => verdictFor(n, 3))).toEqual(["not_yet", "not_yet", "close", "solved"]);
    expect(verdictFor(0, 0)).toBe("not_yet");
  });

  test("toGradeResponse keeps known ids only, in card order, and counts the rest", () => {
    expect(toGradeResponse(card, ["smile", "son", "son", "nope", 3, null])).toEqual({
      correctFactIds: ["son", "smile"],
      missingCount: 2,
      verdict: "close",
    });
  });
});

describe("grader prompt and output", () => {
  test("request carries the solution server-side, the theory as data, and a schema narrowed to fact ids", () => {
    const req = buildGradeRequest({ card, lang: "es", theory: "Su hijo conducía el autobús." });
    expect(req.schemaName).toBe(GRADER_SCHEMA_NAME);
    expect(req.system).toContain(card.solution);
    expect(req.system).toContain("[first-day]");
    const user = String(req.messages[0].content);
    expect(user).toContain("Spanish");
    expect(user).toContain("<theory>\nSu hijo conducía el autobús.\n</theory>");
    expect(req.schema).toEqual(gradeOutputSchema(card));
    const items = (req.schema.properties as Record<string, { items: { enum: string[] } }>).correctFactIds.items;
    expect(items.enum).toEqual(["son", "first-day", "proud", "smile"]);
  });

  test("parseGradeOutput ignores the model's own verdict and any extra fields", () => {
    const parsed = parseGradeOutput(
      { correctFactIds: ["son"], verdict: "solved", missing: ["first-day"], explanation: card.keyFacts[1].text },
      card
    );
    expect(parsed).toEqual({ correctFactIds: ["son"], missingCount: 3, verdict: "not_yet" });
    expect(JSON.stringify(parsed)).not.toContain("first-day");
    expect(parseGradeOutput("junk", card)).toEqual({ correctFactIds: [], missingCount: 4, verdict: "not_yet" });
  });

  test("gradeTheory: valid output -> response; malformed/refusal -> fallback; HTTP -> throws", async () => {
    const ok = await gradeTheory(createStubProvider(() => ({ correctFactIds: ["son", "first-day", "proud", "smile"] })), {
      card,
      lang: "en",
      theory: "x",
    });
    expect(ok.fallback).toBeNull();
    expect(ok.response.verdict).toBe("solved");

    const malformed = await gradeTheory(createStubProvider(() => ({ ids: [] })), { card, lang: "en", theory: "x" });
    expect(malformed.fallback).toBe("invalid_json");
    expect(malformed.response.verdict).toBe("not_yet");

    const refusing: LlmProvider = {
      name: "stub",
      model: "s",
      generateJson: async () => {
        throw new ProviderError("refusal", "no");
      },
    };
    expect((await gradeTheory(refusing, { card, lang: "en", theory: "x" })).fallback).toBe("refusal");

    const down: LlmProvider = {
      name: "stub",
      model: "s",
      generateJson: async () => {
        throw new ProviderError("http", "boom", 500);
      },
    };
    await expect(gradeTheory(down, { card, lang: "en", theory: "x" }, { attempts: 1 })).rejects.toThrow("boom");
  });
});

describe("validateKeeperGradeRequest", () => {
  const base = { deckId: "d-en-situation", cardId: "bus", lang: "en", theory: "  her son  " };

  test("trims the theory and drops unknown fields", () => {
    const result = validateKeeperGradeRequest({ ...base, solution: "SECRET", correctFactIds: ["son"] });
    expect(result).toEqual({ ok: true, value: { deckId: "d-en-situation", cardId: "bus", lang: "en", theory: "her son" } });
  });

  test("rejects bad bodies", () => {
    for (const bad of [null, [], { ...base, lang: "fr" }, { ...base, theory: " " }, { ...base, theory: "x".repeat(1201) }, { ...base, deckId: "a/b" }]) {
      expect(validateKeeperGradeRequest(bad).ok).toBe(false);
    }
  });
});

describe("stub grader", () => {
  test("matches facts by keyword overlap and is routed by schema name", () => {
    const req = buildGradeRequest({ card, lang: "en", theory: "The driver was her son, on his first day." });
    expect(stubGraderRespond(req).correctFactIds).toEqual(["son", "first-day"]);
    expect(stubRespond(req)).toEqual(stubGraderRespond(req));
  });
});

describe("findGradeLeaks", () => {
  test("a sanitized response never leaks; ids or texts of missing facts do", () => {
    const safe = toGradeResponse(card, ["son"]);
    expect(findGradeLeaks(card, safe)).toEqual([]);
    expect(
      findGradeLeaks(card, { ...safe, hint: ["first-day"], note: "She smiled because she was PROUD!" })
    ).toEqual([
      { factId: "first-day", via: "id" },
      { factId: "smile", via: "text" },
    ]);
  });
});
