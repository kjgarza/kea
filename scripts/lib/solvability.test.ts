import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SituationCard } from "../../src/types/card";
import type { Deck } from "../../src/types/deck";
import { DEFAULT_ANTHROPIC_MODEL, SOLVABILITY_LIMITS } from "../../src/lib/ai/config";
import { GRADER_SCHEMA_NAME } from "../../src/lib/ai/grade";
import { KEEPER_SCHEMA_NAME } from "../../src/lib/ai/keeper";
import {
  ProviderError,
  type JsonGenerationRequest,
  type JsonGenerationResult,
  type LlmProvider,
  type TokenUsage,
} from "../../src/lib/ai/provider";
import { AMBIGUITY_SCHEMA_NAME, SOLVER_SCHEMA_NAME } from "../../src/lib/ai/solver";
import { validateSituationCard } from "./validators";
import { mergeTranslation, extractTranslatableFields } from "./deck-translation";
import {
  aiLanguageFor,
  checkPuzzleSolvability,
  renderSolvabilitySummary,
  runSolvabilityStage,
  type SolvabilityProviders,
  type DraftsFile,
} from "./solvability";

// ---------------------------------------------------------------------------
// Fixtures and scripted fakes
// ---------------------------------------------------------------------------

function makeCard(id: string, overrides: Partial<SituationCard> = {}): SituationCard {
  return {
    cardId: id,
    type: "situation",
    title: `Puzzle ${id}`,
    setup: `A man in puzzle ${id} walks into a bar and asks for a glass of water.`,
    solution: `SECRET-SOLUTION-${id}: he had hiccups and the barman scared them away with a gun.`,
    keyFacts: [
      { id: `kf-hiccups-${id}`, text: `SECRET-FACT-hiccups-${id}` },
      { id: `kf-scare-${id}`, text: `SECRET-FACT-scare-${id}` },
      { id: `kf-thanks-${id}`, text: `SECRET-FACT-thanks-${id}` },
    ],
    hints: ["Think about the body."],
    source: { origin: "generated" },
    ...overrides,
  };
}

const USAGE: TokenUsage = { inputTokens: 1000, outputTokens: 100 };
/** Cost of one fake call at the default model's price: 1000×$4/M + 100×$20/M. */
const CALL_COST = 0.006;

/** A fake provider that records every request and answers from `respond`. */
function scripted(
  _role: string,
  respond: (request: JsonGenerationRequest, call: number) => unknown,
  usage: TokenUsage | undefined = USAGE
): LlmProvider & { requests: JsonGenerationRequest[] } {
  const requests: JsonGenerationRequest[] = [];
  return {
    name: "stub",
    model: DEFAULT_ANTHROPIC_MODEL,
    requests,
    async generateJson(request): Promise<JsonGenerationResult> {
      requests.push(request);
      const data = await respond(request, requests.length - 1);
      return { data, text: JSON.stringify(data), model: DEFAULT_ANTHROPIC_MODEL, provider: "stub", usage };
    },
  };
}

/** Solver that asks `questionsBefore` questions, then submits `theory` (repeatedly). */
function solverAsking(questionsBefore: number, theory = "SOLVE IT") {
  return scripted("solver", (request) => {
    expect(request.schemaName).toBe(SOLVER_SCHEMA_NAME);
    const asked = (String(request.messages[0].content).match(/^\d+\. Q: /gm) ?? []).length;
    const props = request.schema.properties as Record<string, { enum: string[] }>;
    const mustTheorize = !props.action.enum.includes("ask");
    if (!mustTheorize && asked < questionsBefore) return { action: "ask", text: `Question ${asked + 1}?` };
    return { action: "theory", text: theory };
  });
}

function keeperAnswering(answer = "irrelevant") {
  return scripted("keeper", (request) => {
    expect(request.schemaName).toBe(KEEPER_SCHEMA_NAME);
    return { answer, factIds: [], confidence: 0.9 };
  });
}

/** Grader that marks every fact correct for "SOLVE IT", none otherwise. */
function graderSolving() {
  return scripted("grader", (request) => {
    expect(request.schemaName).toBe(GRADER_SCHEMA_NAME);
    const ids = Array.from(request.system.matchAll(/^- \[([^\]]+)\]/gm), (m) => m[1]);
    const theory = String(request.messages[0].content);
    return { correctFactIds: theory.includes("SOLVE IT") ? ids : ids.slice(0, 1) };
  });
}

function reviewer(ambiguous = false) {
  return scripted("ambiguity", (request) => {
    expect(request.schemaName).toBe(AMBIGUITY_SCHEMA_NAME);
    return ambiguous
      ? { ambiguous: true, alternative: "He was simply thirsty.", reason: "Thirst explains the setup equally well." }
      : { ambiguous: false, alternative: "", reason: "" };
  });
}

type FakeProvider = LlmProvider & { requests: JsonGenerationRequest[] };

/** Defaults: asks 5 questions then solves; not ambiguous. Overrides are cast for test access. */
function providers(overrides: Partial<Record<keyof SolvabilityProviders, LlmProvider | null>> = {}) {
  return {
    solver: solverAsking(5),
    keeper: keeperAnswering(),
    grader: graderSolving(),
    ambiguity: reviewer(),
    ...overrides,
  } as { solver: FakeProvider; keeper: FakeProvider; grader: FakeProvider; ambiguity: FakeProvider | null };
}

const FIXED_NOW = () => new Date("2026-10-30T12:00:00.000Z");
const FAST = { attempts: 1, delayMs: 0 };

// ---------------------------------------------------------------------------
// Puzzle level
// ---------------------------------------------------------------------------

describe("checkPuzzleSolvability", () => {
  test("passes when the solver's theory is graded solved, counting questions", async () => {
    const p = providers();
    const result = await checkPuzzleSolvability(makeCard("a"), { providers: p, lang: "en", retry: FAST, now: FIXED_NOW });
    expect(result.status).toBe("passed");
    expect(result.reasons).toEqual([]);
    expect(result.questions).toBe(5);
    expect(result.theories).toBe(1);
    expect(result.transcript.at(-1)).toMatchObject({ kind: "theory", verdict: "solved", correct: 3, missing: 0 });
    expect(result.checkedAt).toBe("2026-10-30T12:00:00.000Z");
    expect(p.keeper.requests).toHaveLength(5);
  });

  test("the keeper gets the growing transcript, like a player session", async () => {
    const p = providers();
    await checkPuzzleSolvability(makeCard("a"), { providers: p, lang: "en", retry: FAST });
    const lastKeeperPrompt = String(p.keeper.requests[4].messages[0].content);
    expect(lastKeeperPrompt).toContain("4. Q: Question 4?\n   A: irrelevant");
    expect(lastKeeperPrompt).toContain("<question>\nQuestion 5?\n</question>");
  });

  test(`fails when not solved within ${SOLVABILITY_LIMITS.maxQuestions} questions`, async () => {
    const p = providers({ solver: solverAsking(1000, "Wrong guess") });
    const result = await checkPuzzleSolvability(makeCard("b"), { providers: p, lang: "en", retry: FAST });
    expect(result.status).toBe("failed");
    expect(result.questions).toBe(SOLVABILITY_LIMITS.maxQuestions);
    expect(result.theories).toBe(1);
    expect(result.reasons[0]).toBe(`not solved within ${SOLVABILITY_LIMITS.maxQuestions} questions; best theory got 1/3 key facts`);
    // 40 questions + 1 forced final theory.
    expect(p.solver.requests).toHaveLength(SOLVABILITY_LIMITS.maxQuestions + 1);
    expect(p.keeper.requests).toHaveLength(SOLVABILITY_LIMITS.maxQuestions);
  });

  test("fails when every theory attempt is used up", async () => {
    const p = providers({ solver: solverAsking(2, "Wrong guess") });
    const result = await checkPuzzleSolvability(makeCard("c"), { providers: p, lang: "en", retry: FAST, maxTheories: 2 });
    expect(result.status).toBe("failed");
    expect(result.theories).toBe(2);
    expect(result.reasons[0]).toContain("used all 2 theories after 2 questions");
  });

  test("an ambiguous puzzle fails before the solver runs", async () => {
    const p = providers({ ambiguity: reviewer(true) });
    const result = await checkPuzzleSolvability(makeCard("d"), { providers: p, lang: "en", retry: FAST });
    expect(result.status).toBe("failed");
    expect(result.reasons[0]).toBe(
      "ambiguous: Thirst explains the setup equally well. Alternative: He was simply thirsty."
    );
    expect(result.ambiguity?.ambiguous).toBe(true);
    expect(p.solver.requests).toHaveLength(0);
  });

  test("ambiguity check can be skipped with ambiguity: null", async () => {
    const p = providers({ ambiguity: null });
    const result = await checkPuzzleSolvability(makeCard("e"), { providers: p, lang: "en", retry: FAST });
    expect(result.status).toBe("passed");
    expect(result.ambiguity).toBeNull();
    expect(result.usageByRole.ambiguity.calls).toBe(0);
  });

  test("provider failures become status error, never a pass", async () => {
    const down = scripted("keeper", () => {
      throw new ProviderError("http", "Anthropic HTTP 529: overloaded", 529);
    });
    const result = await checkPuzzleSolvability(makeCard("f"), { providers: providers({ keeper: down }), lang: "en", retry: FAST });
    expect(result.status).toBe("error");
    expect(result.reasons[0]).toContain("provider error after 0 questions: Anthropic HTTP 529");

    const noGrade = scripted("grader", () => ({ nothing: true }));
    const r2 = await checkPuzzleSolvability(makeCard("g"), { providers: providers({ grader: noGrade }), lang: "en", retry: FAST });
    expect(r2.status).toBe("error");
    expect(r2.reasons[0]).toContain("grader returned no grade after 5 questions (invalid_json)");
  });

  test("accounts tokens and estimated cost per role", async () => {
    const result = await checkPuzzleSolvability(makeCard("h"), { providers: providers(), lang: "en", retry: FAST });
    // 1 ambiguity + 6 solver turns + 5 keeper answers + 1 grade.
    expect(result.usageByRole.ambiguity.calls).toBe(1);
    expect(result.usageByRole.solver.calls).toBe(6);
    expect(result.usageByRole.keeper.calls).toBe(5);
    expect(result.usageByRole.grader.calls).toBe(1);
    expect(result.usage.calls).toBe(13);
    expect(result.usage.inputTokens).toBe(13_000);
    expect(result.usage.outputTokens).toBe(1_300);
    expect(result.usage.costUsd).toBeCloseTo(13 * CALL_COST, 9);
    expect(result.usage.unpricedCalls).toBe(0);
  });

  test("the solver NEVER sees the solution, key facts or fact ids", async () => {
    const card = makeCard("leak");
    const p = providers({ solver: solverAsking(40, "Wrong guess") });
    await checkPuzzleSolvability(card, { providers: p, lang: "en", retry: FAST });
    expect(p.solver.requests.length).toBeGreaterThan(40);
    const secrets = [card.solution, "SECRET", ...card.keyFacts.flatMap((f) => [f.id, f.text]), ...card.hints];
    for (const request of p.solver.requests) {
      const prompt = JSON.stringify(request);
      for (const secret of secrets) expect(prompt).not.toContain(secret);
      expect(prompt).toContain(card.setup);
    }
    // Sanity: the keeper and grader, by contrast, do get the solution.
    expect(p.keeper.requests[0].system).toContain(card.solution);
    expect(p.grader.requests[0].system).toContain(card.solution);
  });
});

// ---------------------------------------------------------------------------
// Generation stage: deck + drafts
// ---------------------------------------------------------------------------

describe("runSolvabilityStage", () => {
  let dir: string | null = null;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  test("keeps passed puzzles (with metadata) and writes failed ones to drafts", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "kea-drafts-"));
    const cards = [makeCard("ok-1"), makeCard("hard"), makeCard("vague"), makeCard("ok-2")];
    const deck: Deck = {
      schemaVersion: 1,
      deckId: "test-en-situation",
      version: "2026-10-30T00:00:00.000Z",
      name: "Test",
      gameType: "situation",
      language: "en",
      difficulty: "medium",
      topics: ["test"],
      nsfw: false,
      cards,
    };
    // "hard" is never solved, "vague" is ambiguous.
    const solver = scripted("solver", (request) => {
      const hard = request.system.includes("puzzle hard");
      const asked = (String(request.messages[0].content).match(/^\d+\. Q: /gm) ?? []).length;
      const props = request.schema.properties as Record<string, { enum: string[] }>;
      if (props.action.enum.includes("ask") && (hard || asked < 3)) return { action: "ask", text: `Q${asked}?` };
      return { action: "theory", text: hard ? "no idea" : "SOLVE IT" };
    });
    const ambiguity = scripted("ambiguity", (request) =>
      String(request.messages[0].content).includes("puzzle vague")
        ? { ambiguous: true, alternative: "Another story.", reason: "Two stories fit." }
        : { ambiguous: false, alternative: "", reason: "" }
    );
    const lines: string[] = [];
    const stage = await runSolvabilityStage(deck, {
      providers: { solver, keeper: keeperAnswering(), grader: graderSolving(), ambiguity },
      retry: FAST,
      concurrency: 2,
      draftsDir: dir,
      now: FIXED_NOW,
      log: (line) => lines.push(line),
    });

    // Only passed cards remain, each with questions-to-solve.
    expect(stage.deck.cards.map((c) => c.cardId)).toEqual(["ok-1", "ok-2"]);
    for (const card of stage.deck.cards as SituationCard[]) {
      expect(card.solvability).toEqual({ questions: 3, checkedAt: "2026-10-30T12:00:00.000Z", model: DEFAULT_ANTHROPIC_MODEL });
      // The metadata survives the shared validator unchanged.
      const revalidated = validateSituationCard(card, card.cardId);
      expect(revalidated.errors).toEqual([]);
      expect((revalidated.card as SituationCard).solvability).toEqual(card.solvability);
    }
    expect(stage.report.counts).toEqual({ passed: 2, failed: 2, error: 0 });

    // Failed cards are in decks/drafts/<deckId>.json with reasons.
    expect(stage.draftsPath).toBe(path.join(dir, "test-en-situation.json"));
    const drafts = JSON.parse(await readFile(stage.draftsPath!, "utf8")) as DraftsFile;
    expect(drafts.deckId).toBe("test-en-situation");
    expect(drafts.deck.language).toBe("en");
    expect(drafts.drafts.map((d) => d.card.cardId)).toEqual(["hard", "vague"]);
    expect(drafts.drafts[0].reasons[0]).toContain("not solved within 40 questions");
    expect(drafts.drafts[0].questions).toBe(40);
    expect(drafts.drafts[0].card.solvability).toBeUndefined();
    expect(drafts.drafts[1].reasons[0]).toBe("ambiguous: Two stories fit. Alternative: Another story.");
    expect(drafts.drafts[0].costUsd).toBeGreaterThan(0);

    // Logs: one line per puzzle with its cost, then a summary with reasons.
    expect(lines.filter((l) => /\[\d\/4\]/.test(l))).toHaveLength(4);
    expect(lines.every((l) => !/\[\d\/4\]/.test(l) || /\$\d+\.\d{4}/.test(l))).toBe(true);
    expect(lines).toContain("   Solvability: 2 passed, 2 failed, 0 errors (of 4)");
    expect(lines.some((l) => l.includes("- hard (failed): not solved within 40 questions"))).toBe(true);
    expect(lines.some((l) => l.includes("- vague (failed): ambiguous"))).toBe(true);
    expect(lines.some((l) => l.startsWith("   Usage:") && l.includes("/puzzle"))).toBe(true);
    expect(lines.at(-1)).toBe(`   Failed puzzles written to ${stage.draftsPath}`);
  });

  test("writes no drafts file when everything passes", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "kea-drafts-"));
    const deck = {
      schemaVersion: 1,
      deckId: "all-good",
      version: "v",
      name: "All good",
      gameType: "situation",
      language: "es-MX",
      difficulty: "easy",
      topics: [],
      nsfw: false,
      cards: [makeCard("x")],
    } satisfies Deck;
    const p = providers();
    const stage = await runSolvabilityStage(deck, { providers: p, retry: FAST, draftsDir: dir });
    expect(stage.draftsPath).toBeNull();
    expect(stage.report.lang).toBe("es");
    expect(String(p.keeper.requests[0].messages[0].content)).toContain("Spanish");
    expect(renderSolvabilitySummary(stage.report, null)[1]).toBe("   Questions to solve: min 5, median 5, max 5");
  });
});

describe("solvability metadata", () => {
  test("validator accepts well-formed metadata and rejects bad values", () => {
    const ok = validateSituationCard(
      { ...makeCard("m"), solvability: { questions: 12, checkedAt: "2026-10-30T12:00:00Z", model: " m " } },
      "m"
    );
    expect((ok.card as SituationCard).solvability).toEqual({ questions: 12, checkedAt: "2026-10-30T12:00:00Z", model: "m" });

    const bad = validateSituationCard({ ...makeCard("m"), solvability: { questions: -1.5, checkedAt: "soon" } }, "m");
    expect(bad.valid).toBe(false);
    expect(bad.errors).toEqual([
      `situation card "m": 'solvability.questions' must be a non-negative integer`,
      `situation card "m": 'solvability.checkedAt' must be an ISO date string`,
    ]);
    expect(validateSituationCard({ ...makeCard("m"), solvability: [] }, "m").valid).toBe(false);
  });

  test("translation keeps the metadata and does not send it to the translator", () => {
    const card = { ...makeCard("t"), solvability: { questions: 9, checkedAt: "2026-10-30T12:00:00Z" } };
    expect(extractTranslatableFields(card)).not.toHaveProperty("solvability");
    const merged = mergeTranslation(card, { ...extractTranslatableFields(card), title: "Título" }) as SituationCard;
    expect(merged.title).toBe("Título");
    expect(merged.solvability).toEqual(card.solvability);
  });

  test("aiLanguageFor maps deck languages", () => {
    expect(aiLanguageFor("es")).toBe("es");
    expect(aiLanguageFor("ES-mx")).toBe("es");
    expect(aiLanguageFor("en")).toBe("en");
    expect(aiLanguageFor("fr")).toBe("en");
  });
});
