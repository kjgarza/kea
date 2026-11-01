import { describe, expect, test } from "bun:test";
import { KEEPER_ANSWERS } from "../../src/lib/ai/answers";
import { ProviderError, createStubProvider } from "../../src/lib/ai/provider";
import type { SituationCard } from "../../src/types/card";
import type { Deck } from "../../src/types/deck";
import {
  EVAL_TAGS,
  filterCases,
  loadEvalSuite,
  mapWithConcurrency,
  meetsTarget,
  runKeeperEval,
  validateEvalFile,
  type DeckLoader,
  type EvalCase,
} from "./keeper-eval";
import { createOracleProvider, createSaboteurProvider, createStubKeeperProvider } from "./keeper-eval-fakes";
import { diffReports, renderReportMarkdown } from "./keeper-eval-report";

const suite = await loadEvalSuite();

describe("eval files (evals/keeper)", () => {
  test("load without errors: every case references an existing deck, card and fact and uses the vocabulary", () => {
    expect(suite.errors).toEqual([]);
    expect(suite.files.length).toBeGreaterThanOrEqual(20);
    for (const c of suite.cases) {
      expect(KEEPER_ANSWERS).toContain(c.expected);
      const factIds = c.card.keyFacts.map((fact) => fact.id);
      for (const id of [...c.expectedFacts, ...c.allowedFacts]) expect(factIds).toContain(id);
      expect(c.card.cardId).toBe(c.cardId);
      if (c.expected === "irrelevant" || c.expected === "rephrase") expect(c.expectedFacts).toEqual([]);
    }
  });

  test("about 20 puzzles x 30 questions in both languages, with matching cases", () => {
    for (const lang of ["en", "es"] as const) {
      const cases = suite.cases.filter((c) => c.lang === lang);
      expect(cases.length).toBeGreaterThanOrEqual(600);
      expect(new Set(cases.map((c) => c.cardId)).size).toBeGreaterThanOrEqual(20);
      expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    }
    const shape = (lang: "en" | "es") =>
      suite.cases.filter((c) => c.lang === lang).map((c) => `${c.cardId}|${c.expected}|${c.tag}|${c.expectedFacts.join(",")}`);
    expect(shape("es")).toEqual(shape("en"));
  });

  test("covers every answer and every red-team set in both languages", () => {
    for (const lang of ["en", "es"] as const) {
      const cases = suite.cases.filter((c) => c.lang === lang);
      for (const answer of KEEPER_ANSWERS) expect(cases.some((c) => c.expected === answer)).toBe(true);
      for (const tag of EVAL_TAGS) expect(cases.filter((c) => c.tag === tag).length).toBeGreaterThanOrEqual(10);
    }
  });

  test("red-team demands, injections and non-yes/no questions expect rephrase", () => {
    for (const c of suite.cases) {
      if (c.tag === "demand" || c.tag === "injection" || c.tag === "non-yes-no") expect(c.expected).toBe("rephrase");
    }
  });

  test("puzzles come from the seed decks and EN/ES decks share card ids", () => {
    for (const c of suite.cases) {
      expect(c.deckId).toMatch(c.lang === "en" ? /-en-situation$/ : /-es-situation$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

const fixtureCard: SituationCard = {
  cardId: "p-1",
  type: "situation",
  title: "Puzzle",
  setup: "Setup.",
  solution: "The whole story is here and nowhere else.",
  keyFacts: [
    { id: "a", text: "Fact A" },
    { id: "b", text: "Fact B" },
  ],
  hints: ["h"],
};

const fixtureDeck = (deckId: string, language: string): Deck => ({
  schemaVersion: 1,
  deckId,
  version: "1",
  name: deckId,
  gameType: "situation",
  language,
  difficulty: "medium",
  topics: [],
  nsfw: false,
  cards: [fixtureCard],
});

const loader: DeckLoader = async (deckId) =>
  ({ "x-en-situation": fixtureDeck("x-en-situation", "en"), "x-es-situation": fixtureDeck("x-es-situation", "es") })[
    deckId
  ] ?? null;

const decks = { en: "x-en-situation", es: "x-es-situation" };

describe("validateEvalFile", () => {
  test("flattens a valid file into one case per language", async () => {
    const result = await validateEvalFile(
      {
        cardId: "p-1",
        decks,
        cases: [
          { a: "yes", facts: ["a"], en: "Is it A?", es: "¿Es A?" },
          { a: "no", allow: ["b"], en: "Is it C?" },
          { a: "yes", tag: "consistency", transcript: [{ a: "yes", en: "Is it A?" }], en: "Is it A?" },
        ],
      },
      "p-1.yaml",
      loader
    );
    expect(result.errors).toEqual([]);
    expect(result.cases.map((c) => `${c.lang}:${c.id}`)).toEqual([
      "en:p-1/is-it-a",
      "es:p-1/es-a",
      "en:p-1/is-it-c",
      "en:p-1/is-it-a~2",
    ]);
    expect(result.cases[3].transcript).toEqual([{ q: "Is it A?", a: "yes" }]);
  });

  test("reports missing decks, cards, facts and bad answers", async () => {
    const result = await validateEvalFile(
      {
        cardId: "p-1",
        decks: { en: "x-en-situation", es: "missing-es-situation" },
        cases: [
          { a: "maybe", en: "Q1?" },
          { a: "yes", facts: ["zzz"], en: "Q2?" },
          { a: "irrelevant", facts: ["a"], en: "Q3?" },
          { a: "yes", es: "¿Q4?" },
          { a: "yes", tag: "bogus", en: "Q5?" },
          { a: "yes", en: "Q2?" },
          { a: "yes", answer: "x", en: "Q6?" },
          { a: "yes" },
        ],
      },
      "wrong-name.yaml",
      loader
    );
    const text = result.errors.join("\n");
    expect(text).toContain("file name should be p-1.yaml");
    expect(text).toContain('deck "missing-es-situation" does not exist');
    expect(text).toContain("a must be one of yes, no, irrelevant, partly, rephrase");
    expect(text).toContain('fact "zzz" is not a key fact');
    expect(text).toContain("facts/allow only make sense for yes, no or partly");
    expect(text).toContain("has es text but decks.es is missing or invalid");
    expect(text).toContain("tag must be one of");
    expect(text).toContain('duplicate en question "Q2?"');
    expect(text).toContain('unknown key "answer"');
    expect(text).toContain("needs en and/or es text");
  });

  test("rejects a card that is not in the deck", async () => {
    const result = await validateEvalFile({ cardId: "nope", decks, cases: [{ a: "yes", en: "Q?" }] }, "nope.yaml", loader);
    expect(result.errors.join("\n")).toContain('card "nope" is not a situation card');
  });
});

// ---------------------------------------------------------------------------
// Runner, scoring and report, end to end with offline providers
// ---------------------------------------------------------------------------

describe("runKeeperEval", () => {
  test("a keeper that gives the expected answers scores 100% with zero leaks", async () => {
    const report = await runKeeperEval(suite.cases, {
      provider: createOracleProvider(suite.cases),
      judge: createOracleProvider(suite.cases),
      concurrency: 8,
      retry: { attempts: 1 },
    });
    for (const lang of ["en", "es"] as const) {
      const s = report.summary[lang]!;
      expect(s.total).toBe(suite.cases.filter((c) => c.lang === lang).length);
      expect(s.agreement).toBe(1);
      expect(s.leaks).toBe(0);
      expect(s.outOfVocab).toBe(0);
      expect(s.factRecall.matched).toBe(s.factRecall.total);
      expect(meetsTarget(s)).toBe(true);
      for (const answer of KEEPER_ANSWERS) {
        const row = s.confusion[answer];
        expect(Object.values(row).reduce((a, b) => a + b, 0)).toBe(row[answer]);
      }
    }
    const markdown = renderReportMarkdown(report);
    const n = report.summary.en!.total;
    expect(markdown).toContain(`| English | ${n} | 100.0% (${n}/${n}) | 0 |`);
    expect(markdown).toContain("| PASS |");
    expect(markdown).not.toContain("Disagreements and leaks");
  });

  test("a deliberately bad keeper is caught: wrong answers, leaks of every kind, off-vocabulary replies", async () => {
    const report = await runKeeperEval(suite.cases, {
      provider: createSaboteurProvider(suite.cases),
      judge: createSaboteurProvider(suite.cases),
      concurrency: 8,
      retry: { attempts: 1 },
    });
    for (const lang of ["en", "es"] as const) {
      const s = report.summary[lang]!;
      expect(s.agreement).toBeLessThan(0.8);
      expect(s.leaks).toBeGreaterThan(0);
      expect(s.leaksByKind.unasked_fact_id).toBeGreaterThan(0);
      expect(s.leaksByKind.fact_text).toBeGreaterThan(0);
      expect(s.leaksByKind.extra_output).toBeGreaterThan(0);
      expect(s.leaksByKind.judge).toBeGreaterThan(0);
      expect(s.outOfVocab).toBeGreaterThan(0);
      expect(meetsTarget(s)).toBe(false);
    }
    const markdown = renderReportMarkdown(report);
    expect(markdown).toContain("| FAIL |");
    expect(markdown).toContain("Disagreements and leaks");
  });

  test("the Worker's offline stub keeper runs through the same path", async () => {
    const report = await runKeeperEval(suite.cases, {
      provider: createStubKeeperProvider(),
      judge: null,
      filter: { langs: ["es"], limit: 40 },
      retry: { attempts: 1 },
    });
    expect(report.summary.en).toBeUndefined();
    expect(report.summary.es!.total).toBe(40);
    expect(report.judge).toBeNull();
  });

  test("provider HTTP errors count as disagreements, not crashes", async () => {
    const provider = createStubProvider(() => {
      throw new ProviderError("http", "boom", 500);
    });
    const report = await runKeeperEval(suite.cases, {
      provider,
      filter: { limit: 3 },
      retry: { attempts: 1, delayMs: 0 },
    });
    expect(report.summary.en!.errors).toBe(3);
    expect(report.summary.en!.agree).toBe(0);
    expect(report.cases[0].error).toContain("boom");
    expect(report.summary.en!.confusion[report.cases[0].expected].error).toBeGreaterThan(0);
  });
});

describe("filterCases", () => {
  test("filters by language, puzzle and tag and limits per language", () => {
    const picked = filterCases(suite.cases, { langs: ["en"], cardIds: ["cl-001"], tags: ["demand"] });
    expect(picked.length).toBe(2);
    expect(picked.every((c) => c.lang === "en" && c.cardId === "cl-001" && c.tag === "demand")).toBe(true);
    const limited = filterCases(suite.cases, { limit: 5 });
    expect(limited.filter((c) => c.lang === "en").length).toBe(5);
    expect(limited.filter((c) => c.lang === "es").length).toBe(5);
  });
});

describe("diffReports", () => {
  test("shows the delta and the cases that changed when the prompt changes", async () => {
    const cases: EvalCase[] = filterCases(suite.cases, { cardIds: ["cl-001", "la-002"] });
    const run = (provider: ReturnType<typeof createOracleProvider>) =>
      runKeeperEval(cases, { provider, judge: null, retry: { attempts: 1 } });
    const before = await run(createOracleProvider(cases));
    const after = await run(createSaboteurProvider(cases));
    after.keeperPromptHash = "changed0";

    const diff = diffReports(before, after);
    expect(diff.promptChanged).toBe(true);
    const en = diff.languages.find((l) => l.lang === "en")!;
    expect(en.agreementDelta).toBeCloseTo(after.summary.en!.agreement - 1);
    expect(en.leaksDelta).toBe(after.summary.en!.leaks);
    expect(diff.regressed.length).toBe(after.cases.filter((c) => !c.agree).length);
    expect(diff.fixed).toEqual([]);
    expect(diff.newLeaks.length).toBeGreaterThan(0);

    const back = diffReports(after, before);
    expect(back.fixed.length).toBe(diff.regressed.length);
    expect(back.resolvedLeaks.length).toBe(diff.newLeaks.length);

    const markdown = renderReportMarkdown(after, { diff });
    expect(markdown).toContain("## Change vs baseline");
    expect(markdown).toContain("Keeper prompt **changed**");
    expect(markdown).toMatch(/\| English \| 100\.0% \| \d+\.\d% \| -\d+\.\d pts \|/);
  });
});

describe("mapWithConcurrency", () => {
  test("keeps order and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBe(3);
  });
});
