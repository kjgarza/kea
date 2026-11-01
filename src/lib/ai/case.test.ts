import { describe, expect, test } from "bun:test";
import type { CaseCard } from "../../types/card";
import {
  allowedEvidenceIds,
  answerInvestigatorQuestion,
  buildInvestigatorRequest,
  buildJudgeRequest,
  judgeAnswers,
  localAnswerMatch,
  normalizeCaseAnswer,
  NOT_IN_EVIDENCE_REPLY,
  parseInvestigatorOutput,
  parseJudgeOutput,
  questionsForJudge,
  sanitizeInvestigatorReply,
  validateCaseAskRequest,
  validateCaseJudgeRequest,
} from "./case";
import { createStubProvider, ProviderError, type JsonGenerationRequest } from "./provider";

const card: CaseCard = {
  cardId: "k",
  type: "case",
  title: "The case",
  briefing: "Someone took the cup.",
  evidence: [
    { id: "a", title: "A", kind: "document", content: "SECRET-A" },
    { id: "b", title: "B", kind: "document", content: "SECRET-B", unlockAfter: ["a"] },
    { id: "c", title: "C", kind: "image", src: "c.svg", unlockAfter: ["b"] },
    { id: "d", title: "D", kind: "interview", content: "SECRET-D" },
  ],
  questions: [
    { id: "who", prompt: "Who?", answer: "Coach Lena", acceptedVariants: ["Lena"], points: 2 },
    { id: "why", prompt: "Why?", answer: "The engraving", acceptedVariants: [], points: 1 },
  ],
  walkthrough: "WALKTHROUGH-TEXT",
};

describe("allowedEvidenceIds", () => {
  test("keeps opened, known, unlocked ids in card order", () => {
    expect(allowedEvidenceIds(card, ["d", "b", "a", "zzz"])).toEqual(["a", "b", "d"]);
  });
  test("drops a chain from its missing link onwards", () => {
    expect(allowedEvidenceIds(card, ["c", "b", "d"])).toEqual(["d"]);
    expect(allowedEvidenceIds(card, [])).toEqual([]);
  });
});

describe("investigator prompt", () => {
  test("contains the briefing and allowed evidence only, never the walkthrough or answers", () => {
    const req = buildInvestigatorRequest({ card, lang: "es", openedEvidenceIds: ["a", "c"], question: "¿Quién?" });
    const text = req.system + JSON.stringify(req.messages) + JSON.stringify(req.schema);
    expect(text).toContain("SECRET-A");
    expect(text).toContain("Someone took the cup.");
    expect(text).toContain("Spanish");
    for (const secret of ["SECRET-B", "SECRET-D", "[c]", "WALKTHROUGH-TEXT", "Coach Lena", "engraving"]) {
      expect(text).not.toContain(secret);
    }
    expect((req.schema as { properties: { citedEvidenceIds: { items: { enum: string[] } } } }).properties.citedEvidenceIds.items.enum).toEqual(["a"]);
  });
});

describe("parseInvestigatorOutput", () => {
  test("strips unopened ids from citations and text, keeps inline allowed citations", () => {
    const parsed = parseInvestigatorOutput(
      { inEvidence: true, answer: "A says so (`a`); `d` and [b] disagree, see d.", citedEvidenceIds: ["d", "b"] },
      card,
      ["a"],
      "en"
    );
    expect(parsed).toEqual({ answer: "A says so (`a`); and disagree, see.", citedEvidenceIds: ["a"], inEvidence: true });
  });
  test("not in evidence, empty or fully stripped replies become the explicit reply", () => {
    const none = { answer: NOT_IN_EVIDENCE_REPLY.en, citedEvidenceIds: [], inEvidence: false };
    expect(parseInvestigatorOutput({ inEvidence: false, answer: "Lena did it", citedEvidenceIds: ["a"] }, card, ["a"], "en")).toEqual(none);
    expect(parseInvestigatorOutput({ inEvidence: true, answer: "`d`", citedEvidenceIds: [] }, card, ["a"], "en")).toEqual(none);
  });
  test("malformed output is null", () => {
    expect(parseInvestigatorOutput({ answer: "x" }, card, [], "en")).toBeNull();
    expect(parseInvestigatorOutput("x", card, [], "en")).toBeNull();
  });
  test("sanitize leaves unrelated code spans alone", () => {
    expect(sanitizeInvestigatorReply(card, "Badge `VOL-07` in `a`", ["a"])).toEqual({ text: "Badge `VOL-07` in `a`", inlineIds: ["a"] });
  });
});

describe("answerInvestigatorQuestion", () => {
  test("fallback on refusal and malformed output; HTTP errors throw", async () => {
    const input = { card, lang: "en" as const, openedEvidenceIds: ["a"], question: "?" };
    const junk = await answerInvestigatorQuestion(createStubProvider(() => ({ nope: 1 })), input, { attempts: 1 });
    expect(junk.fallback).toBe("invalid_json");
    const refusing = createStubProvider(() => {
      throw new ProviderError("refusal", "no");
    });
    expect((await answerInvestigatorQuestion(refusing, input, { attempts: 1 })).fallback).toBe("refusal");
    const down = createStubProvider(() => {
      throw new ProviderError("http", "down", 500);
    });
    await expect(answerInvestigatorQuestion(down, input, { attempts: 1 })).rejects.toThrow();
  });
});

describe("judge", () => {
  test("local matches skip the model; only unmatched submitted questions are in the prompt", async () => {
    expect(localAnswerMatch(card.questions[0], "lena!")).toBe("variant");
    expect(questionsForJudge(card, { who: "the coach, Lena B." }).map((q) => q.id)).toEqual(["who"]);
    expect(buildJudgeRequest({ card, lang: "en", answers: { who: "Lena", why: " " } })).toBeNull();
    const seen: JsonGenerationRequest[] = [];
    const provider = createStubProvider((req) => {
      seen.push(req);
      return { results: [{ questionId: "why", correct: true }, { questionId: "who", correct: true }] };
    });
    const result = await judgeAnswers(provider, { card, lang: "en", answers: { who: "Lena", why: "because of what was engraved" } });
    expect(result.response.results).toEqual([
      { questionId: "who", correct: true },
      { questionId: "why", correct: true },
    ]);
    expect(result.localIds).toEqual(["who"]);
    expect(JSON.stringify(seen[0].messages)).not.toContain("QUESTION [who]");
    expect(seen[0].system).not.toContain("WALKTHROUGH");
  });
  test("parseJudgeOutput needs a boolean for every expected id", () => {
    expect(parseJudgeOutput({ results: [{ questionId: "who", correct: "yes" }] }, ["who"])).toBeNull();
    expect(parseJudgeOutput({ results: [{ questionId: "x", correct: true }] }, ["who"])).toBeNull();
    expect(Array.from(parseJudgeOutput({ results: [{ questionId: "who", correct: false }, { questionId: "who", correct: true }] }, ["who"])!)).toEqual([["who", false]]);
  });
});

describe("request validation", () => {
  test("case ask keeps known fields and dedupes ids", () => {
    const r = validateCaseAskRequest({ deckId: "d", cardId: "k", lang: "en", openedEvidenceIds: ["a", "a"], question: " q ", walkthrough: "x" });
    expect(r).toEqual({ ok: true, value: { deckId: "d", cardId: "k", lang: "en", openedEvidenceIds: ["a"], question: "q" } });
  });
  test("case judge rejects empty or non-text answers", () => {
    expect(validateCaseJudgeRequest({ deckId: "d", cardId: "k", lang: "en", answers: {} }).ok).toBe(false);
    expect(validateCaseJudgeRequest({ deckId: "d", cardId: "k", lang: "en", answers: { who: 1 } }).ok).toBe(false);
    expect(validateCaseJudgeRequest({ deckId: "d", cardId: "k", lang: "es", answers: { who: "Lena" } }).ok).toBe(true);
  });
});

describe("answer normalisation: separators inside words", () => {
  test('"VOL-07" == "VOL07" == "vol 07" and "Felix\'s badge" == "Felixs badge"', () => {
    expect(normalizeCaseAnswer("VOL-07")).toBe("vol 07");
    expect(normalizeCaseAnswer("Felix's badge")).toBe(normalizeCaseAnswer("Felixs badge"));
    expect(normalizeCaseAnswer("Felix\u2019s badge")).toBe("felixs badge");
    const q = { answer: "VOL-07", acceptedVariants: ["Felix's badge"] };
    expect(localAnswerMatch(q, "VOL07")).toBe("exact");
    expect(localAnswerMatch(q, "vol 07")).toBe("exact");
    expect(localAnswerMatch(q, "Felixs badge")).toBe("variant");
    expect(localAnswerMatch(q, "VOL-08")).toBeNull();
  });

  test("keeps accent and article behaviour", () => {
    expect(normalizeCaseAnswer("The Coach")).toBe("coach");
    expect(normalizeCaseAnswer("Él")).toBe("el");
    expect(normalizeCaseAnswer("La   Cañada!")).toBe("canada");
  });
});
