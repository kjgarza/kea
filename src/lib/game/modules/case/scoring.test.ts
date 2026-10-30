import { describe, expect, test } from "bun:test";
import type { CaseCard, CaseQuestion } from "@/types/card";
import {
  caseOutcome,
  matchAnswer,
  normalizeAnswer,
  scoreAccusation,
  totalPoints,
  unmatchedQuestionIds,
} from "./scoring";

const who: CaseQuestion = {
  id: "who",
  prompt: "Who took the trophy?",
  answer: "Coach Lena Brandt",
  acceptedVariants: ["Lena Brandt", "the coach"],
  points: 2,
};
const donde: CaseQuestion = {
  id: "where",
  prompt: "¿Dónde está?",
  answer: "En el taller de grabado",
  acceptedVariants: ["el grabador"],
  points: 1,
};

describe("normalizeAnswer", () => {
  test("ignores case, accents, punctuation, spacing and a leading article", () => {
    expect(normalizeAnswer("  Coach   Lena-Brandt! ")).toBe("coach lena brandt");
    expect(normalizeAnswer("The Coach")).toBe("coach");
    expect(normalizeAnswer("El Grabador")).toBe("grabador");
    expect(normalizeAnswer("Dónde")).toBe("donde");
    expect(normalizeAnswer("")).toBe("");
    expect(normalizeAnswer("the")).toBe("the");
  });
});

describe("matchAnswer", () => {
  test("exact, variant, blank and unmatched", () => {
    expect(matchAnswer(who, "coach lena brandt")).toBe("exact");
    expect(matchAnswer(who, "Lena Brandt.")).toBe("variant");
    expect(matchAnswer(who, "Coach")).toBe("variant");
    expect(matchAnswer(who, "   ")).toBe("blank");
    expect(matchAnswer(who, undefined)).toBe("blank");
    expect(matchAnswer(who, "Marco")).toBeNull();
    expect(matchAnswer(donde, "grabador")).toBe("variant");
  });
});

describe("scoreAccusation", () => {
  const card = { questions: [who, donde] } as CaseCard;

  test("returns null until every unmatched answer is marked", () => {
    const answers = { who: "Lena", where: "el grabador" };
    expect(unmatchedQuestionIds(card, answers)).toEqual(["who"]);
    expect(scoreAccusation(card, answers)).toBeNull();
    const scored = scoreAccusation(card, answers, { who: { correct: true, by: "group" } })!;
    expect(scored).toEqual([
      { questionId: "who", correct: true, points: 2, by: "group" },
      { questionId: "where", correct: true, points: 1, by: "variant" },
    ]);
    expect(totalPoints(scored)).toBe(3);
    expect(caseOutcome(scored)).toBe("solved");
  });

  test("a wrong answer makes the outcome partial", () => {
    const scored = scoreAccusation(card, { who: "Lena Brandt", where: "" })!;
    expect(totalPoints(scored)).toBe(2);
    expect(caseOutcome(scored)).toBe("partial");
    expect(caseOutcome([])).toBe("partial");
  });
});
