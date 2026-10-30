import { describe, expect, test } from "bun:test";
import YAML from "yaml";
import {
  createOracleInvestigator,
  createOracleJudge,
  createSaboteurInvestigator,
  createSaboteurJudge,
  findAskLeaks,
  loadCaseEvalSuite,
  meetsCaseTarget,
  runCaseAskEval,
  runCaseJudgeEval,
  validateCaseEvalFile,
} from "./case-eval";
import { createFileDeckLoader } from "./keeper-eval";

const suite = await loadCaseEvalSuite();
const loadDeck = createFileDeckLoader();
const offline = { retry: { attempts: 1, delayMs: 0 } };

describe("case eval files (evals/case)", () => {
  test("validate against the seed case", () => {
    expect(suite.errors).toEqual([]);
    expect(suite.files).toContain("halden-chronometer.yaml");
  });

  test("cover both endpoints, both languages and the required scenarios", () => {
    for (const lang of ["en", "es"] as const) {
      const ask = suite.ask.filter((c) => c.lang === lang);
      const judge = suite.judge.filter((c) => c.lang === lang);
      expect(ask.length).toBeGreaterThanOrEqual(10);
      expect(judge.length).toBeGreaterThanOrEqual(10);
      for (const tag of ["answer", "unopened", "locked", "red-team", "injection"]) expect(ask.some((c) => c.tag === tag)).toBe(true);
      // Paraphrases accepted, wrong suspects rejected.
      expect(judge.some((c) => c.tag === "paraphrase" && c.correct)).toBe(true);
      expect(judge.some((c) => c.tag === "wrong-suspect" && c.questionId === "who" && !c.correct)).toBe(true);
    }
    // Spanish answers are judged against the Spanish deck.
    expect(suite.judge.filter((c) => c.lang === "es").every((c) => c.deckId === "saltmarsh-bay-es-case")).toBe(true);
    // Locked cases claim evidence the server must not use.
    for (const c of suite.ask.filter((c) => c.tag === "locked")) expect(c.allowed.length).toBeLessThan(c.opened.length);
  });

  test("the validator rejects broken cases", async () => {
    const raw = YAML.parse(`
cardId: halden-chronometer
decks: { en: saltmarsh-bay-en-case }
ask:
  - { tag: answer, opened: [building-log], expect: answer, cites: [courier-booking], en: "Q1?" }
  - { tag: unopened, opened: [building-log], expect: not_in_evidence, forbid: [VOL-07], en: "Q2?" }
  - { tag: nope, opened: [], expect: answer, en: "Q3?" }
judge:
  - { question: who, correct: true, tag: paraphrase, en: "Ruth Lindqvist" }
  - { question: who, correct: true, tag: wrong-suspect, en: "Felix the volunteer" }
  - { question: motive, correct: false, tag: vague, en: "money" }
`);
    const { errors } = await validateCaseEvalFile(raw, "halden-chronometer.yaml", loadDeck);
    const all = errors.join("\n");
    expect(all).toContain('cites "courier-booking", which is not opened and unlocked');
    expect(all).toContain('forbid "VOL-07" appears in the en briefing or opened evidence');
    expect(all).toContain("tag must be one of");
    expect(all).toContain("decided locally (variant)");
    expect(all).toContain("wrong-suspect answers should be wrong");
    expect(all).toContain('"motive" is not a question');
  });
});

describe("case evals run offline", () => {
  test("a perfect investigator and judge meet the target with zero leaks", async () => {
    const ask = await runCaseAskEval(suite.ask, { provider: createOracleInvestigator(suite.ask), ...offline });
    const judge = await runCaseJudgeEval(suite.judge, { provider: createOracleJudge(suite.judge), ...offline });
    for (const lang of ["en", "es"] as const) {
      expect(meetsCaseTarget(ask.summary[lang]!)).toBe(true);
      expect(meetsCaseTarget(judge.summary[lang]!)).toBe(true);
    }
  });

  test("a bad investigator and judge are caught; stripped unopened ids are not leaks", async () => {
    const ask = await runCaseAskEval(suite.ask, { provider: createSaboteurInvestigator(suite.ask), ...offline });
    const judge = await runCaseJudgeEval(suite.judge, { provider: createSaboteurJudge(suite.judge), ...offline });
    expect(meetsCaseTarget(ask.summary.en!)).toBe(false);
    expect((ask.summary.en?.leaks ?? 0) + (ask.summary.es?.leaks ?? 0)).toBeGreaterThan(0);
    const leakKinds = ask.results.flatMap((r) => r.leaks.map((l) => l.kind));
    expect(leakKinds.every((k) => k === "forbidden-text")).toBe(true);
    expect(meetsCaseTarget(judge.summary.en!)).toBe(false);
    expect((judge.summary.en?.falseAccepts ?? 0) + (judge.summary.es?.falseAccepts ?? 0)).toBeGreaterThan(0);
  });

  test("findAskLeaks flags unopened ids, citations and forbidden text", () => {
    const c = suite.ask.find((x) => x.tag === "locked")!;
    const leaks = findAskLeaks(c, { answer: `It went via courier-booking to ${c.forbid[0]}`, citedEvidenceIds: ["courier-booking"], inEvidence: true });
    expect(leaks.map((l) => l.kind).sort()).toEqual(["forbidden-text", "unopened-citation", "unopened-id"]);
  });
});
