import { describe, expect, test } from "bun:test";
import { verdictFor } from "../../src/lib/ai/grade";
import { ProviderError } from "../../src/lib/ai/provider";
import type { SituationCard } from "../../src/types/card";
import type { Deck } from "../../src/types/deck";
import {
  THEORY_TAGS,
  filterGradeCases,
  loadGradeSuite,
  meetsGradeTarget,
  renderGradeReportMarkdown,
  runGradeEval,
  validateTheoryCases,
} from "./grade-eval";
import { createOracleGrader, createSaboteurGrader, createStubGraderProvider } from "./keeper-eval-fakes";
import { loadEvalSuite, type DeckLoader } from "./keeper-eval";

const suite = await loadGradeSuite();
const keeperSuite = await loadEvalSuite();

describe("grading eval files (evals/keeper theories)", () => {
  test("validate: real decks, cards and facts; verdicts match the shared rules", () => {
    expect(suite.errors).toEqual([]);
    expect(keeperSuite.errors).toEqual([]); // `theories` is an allowed key for the keeper loader
    expect(suite.files.length).toBeGreaterThanOrEqual(10);
    for (const c of suite.cases) {
      const ids = c.card.keyFacts.map((f) => f.id);
      for (const id of c.expectedFacts) expect(ids).toContain(id);
      expect(c.expectedVerdict).toBe(verdictFor(c.expectedFacts.length, ids.length));
    }
  });

  test("both languages, matching cases, every verdict and tag", () => {
    for (const lang of ["en", "es"] as const) {
      const cases = suite.cases.filter((c) => c.lang === lang);
      expect(cases.length).toBeGreaterThanOrEqual(60);
      expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
      for (const verdict of ["solved", "close", "not_yet"] as const) {
        expect(cases.filter((c) => c.expectedVerdict === verdict).length).toBeGreaterThanOrEqual(10);
      }
      for (const tag of THEORY_TAGS) expect(cases.some((c) => c.tag === tag)).toBe(true);
    }
    const shape = (lang: "en" | "es") =>
      suite.cases.filter((c) => c.lang === lang).map((c) => `${c.cardId}|${c.tag}|${c.expectedVerdict}|${c.expectedFacts}`);
    expect(shape("es")).toEqual(shape("en"));
  });

  test("language-switch theories are written in the other language", () => {
    const switched = suite.cases.filter((c) => c.tag === "language-switch");
    expect(switched.length).toBeGreaterThanOrEqual(10);
    for (const c of switched) {
      const spanishish = /[áéíóúñ¿]|\b(el|la|que|era|una?)\b/i.test(c.theory);
      expect(spanishish).toBe(c.lang === "en");
    }
  });
});

const card: SituationCard = {
  cardId: "bus",
  type: "situation",
  title: "Bus",
  setup: "S",
  solution: "X",
  keyFacts: [
    { id: "a", text: "Fact a" },
    { id: "b", text: "Fact b" },
    { id: "c", text: "Fact c" },
  ],
  hints: ["h"],
};
const loadDeck: DeckLoader = async (deckId) =>
  ({ deckId, gameType: "situation", language: deckId.includes("-es-") ? "es" : "en", cards: [card] }) as unknown as Deck;

describe("validateTheoryCases", () => {
  test("rejects unknown facts, verdicts that break the rules, bad tags and wrong theories with facts", async () => {
    const { errors } = await validateTheoryCases(
      {
        cardId: "bus",
        decks: { en: "x-en-situation" },
        theories: [
          { verdict: "solved", tag: "full", facts: ["a", "b"], en: "two of three" },
          { verdict: "close", tag: "partial", facts: ["a", "zzz"], en: "unknown fact" },
          { verdict: "not_yet", tag: "wrong", facts: ["a"], en: "wrong but with a fact" },
          { verdict: "maybe", tag: "partial", en: "bad verdict" },
          { verdict: "not_yet", tag: "silly", en: "bad tag" },
          { verdict: "not_yet", tag: "wrong", es: "no Spanish deck" },
          { verdict: "not_yet", tag: "wrong", en: "x", extra: 1 },
        ],
      },
      "bus.yaml",
      loadDeck
    );
    const text = errors.join("\n");
    expect(text).toContain('2/3 facts is "close"');
    expect(text).toContain('fact "zzz" is not a key fact');
    expect(text).toContain("wrong theories cover no facts");
    expect(text).toContain("verdict must be one of");
    expect(text).toContain("tag must be one of");
    expect(text).toContain("decks.es does not resolve");
    expect(text).toContain('unknown key "extra"');
  });

  test("files without theories yield nothing", async () => {
    expect(await validateTheoryCases({ cardId: "bus", decks: {}, cases: [] }, "bus.yaml", loadDeck)).toEqual({
      cases: [],
      errors: [],
    });
  });
});

describe("runGradeEval with fake providers", () => {
  test("oracle grader: 100% agreement, exact facts, zero leaks in both languages", async () => {
    const report = await runGradeEval(suite.cases, { provider: createOracleGrader(suite.cases), retry: { attempts: 1 } });
    for (const lang of ["en", "es"] as const) {
      const s = report.summary[lang]!;
      expect(s.verdictAgreement).toBe(1);
      expect(s.factAgreement).toBe(1);
      expect(s.leaks).toBe(0);
      expect(meetsGradeTarget(s)).toBe(true);
    }
    expect(report.kind).toBe("grade");
  });

  test("saboteur grader: disagreements and fallbacks are caught, and its leaky output never leaks", async () => {
    const report = await runGradeEval(suite.cases, { provider: createSaboteurGrader(suite.cases), retry: { attempts: 1 } });
    const all = Object.values(report.summary);
    expect(all.some((s) => !meetsGradeTarget(s!))).toBe(true);
    expect(all.reduce((n, s) => n + s!.fallbacks, 0)).toBeGreaterThan(0);
    // Every 4th case returned missing ids/texts; the shared parser stripped them.
    expect(all.reduce((n, s) => n + s!.leaks, 0)).toBe(0);
    const markdown = renderGradeReportMarkdown(report);
    expect(markdown).toContain("Theory grading eval");
    expect(markdown).toContain("Failures");
    expect(markdown).toContain("❌");
  });

  test("stub grader runs offline end to end", async () => {
    const report = await runGradeEval(filterGradeCases(suite.cases, { limit: 10 }), {
      provider: createStubGraderProvider(),
      retry: { attempts: 1 },
    });
    expect(report.cases).toHaveLength(20);
    expect(report.cases.every((r) => r.actualVerdict !== "error")).toBe(true);
  });

  test("HTTP errors count as disagreements with the error recorded", async () => {
    const report = await runGradeEval(filterGradeCases(suite.cases, { limit: 1, langs: ["en"] }), {
      provider: {
        name: "stub",
        model: "m",
        generateJson: async () => {
          throw new ProviderError("http", "boom", 500);
        },
      },
      retry: { attempts: 1 },
    });
    expect(report.cases[0]).toMatchObject({ actualVerdict: "error", verdictAgree: false, error: "boom" });
    expect(report.summary.en!.errors).toBe(1);
  });
});
