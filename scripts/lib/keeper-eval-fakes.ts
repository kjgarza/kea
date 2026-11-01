/**
 * Offline providers for testing the keeper eval harness without API keys.
 *
 * - `oracle`: answers every eval case with its expected answer and facts
 *   (proves a perfect keeper scores 100% with zero leaks).
 * - `saboteur`: deterministically wrong on a share of cases, lists unasked
 *   fact ids, adds prose with solution text and off-vocabulary answers
 *   (proves the report catches errors and leaks).
 * - `stub`: the Worker's offline keeper (`stubKeeperRespond`).
 *
 * All of them answer leak-judge requests with `scriptedJudgeRespond`, which
 * flags replies that contain key-fact or solution text.
 *
 * Theory grading (#32) has its own fakes: `createOracleGrader`,
 * `createSaboteurGrader` and `createStubGraderProvider`.
 */
import { KEEPER_ANSWERS, type KeeperAnswer } from "../../src/lib/ai/answers";
import { KEEPER_SCHEMA_NAME, buildKeeperRequest } from "../../src/lib/ai/keeper";
import {
  LEAK_JUDGE_SCHEMA_NAME,
  extractJudgedReply,
  normalizeForLeakCheck,
} from "../../src/lib/ai/leak-judge";
import { createStubProvider, type JsonGenerationRequest, type LlmProvider } from "../../src/lib/ai/provider";
import { GRADER_SCHEMA_NAME, buildGradeRequest } from "../../src/lib/ai/grade";
import { stubGraderRespond, stubKeeperRespond } from "../../src/lib/ai/stub-keeper";
import type { GradeEvalCase } from "./grade-eval";
import type { EvalCase } from "./keeper-eval";

export const FAKE_PROVIDERS = ["oracle", "saboteur"] as const;
export type FakeProviderName = (typeof FAKE_PROVIDERS)[number];

function requestKey(request: JsonGenerationRequest): string {
  const user = request.messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
  return `${request.system}\n---\n${user}`;
}

function caseIndex(cases: readonly EvalCase[]): Map<string, { c: EvalCase; index: number }> {
  const map = new Map<string, { c: EvalCase; index: number }>();
  cases.forEach((c, index) => {
    const request = buildKeeperRequest({ card: c.card, lang: c.lang, transcript: c.transcript, question: c.question });
    map.set(requestKey(request), { c, index });
  });
  return map;
}

/** Judge stand-in: a leak is any key-fact text or solution text in the reply. */
export function scriptedJudgeRespond(request: JsonGenerationRequest) {
  const reply = ` ${normalizeForLeakCheck(extractJudgedReply(request))} `;
  const facts = Array.from(request.system.matchAll(/^- \[([^\]]+)\] (.+)$/gm), (m) => ({ id: m[1], text: m[2] }));
  const leaked = facts.filter((fact) => reply.includes(` ${normalizeForLeakCheck(fact.text)} `)).map((f) => f.id);
  const solution = request.system.match(/SOLUTION \(secret\):\n([\s\S]*?)\n\nKEY FACTS/)?.[1] ?? "";
  const solutionHit = solution.length > 0 && reply.includes(` ${normalizeForLeakCheck(solution)} `);
  const isLeak = leaked.length > 0 || solutionHit;
  return {
    leaked: isLeak,
    leakedFactIds: leaked,
    reason: isLeak ? "The reply contains secret story text." : "One-word answer only.",
  };
}

function withJudge(respond: (request: JsonGenerationRequest) => unknown) {
  return (request: JsonGenerationRequest) =>
    request.schemaName === LEAK_JUDGE_SCHEMA_NAME ? scriptedJudgeRespond(request) : respond(request);
}

function unknownCase(): never {
  throw new Error("fake provider got a keeper request that is not in the eval suite");
}

export function createOracleProvider(cases: readonly EvalCase[]): LlmProvider {
  const index = caseIndex(cases);
  return createStubProvider(
    withJudge((request) => {
      if (request.schemaName !== KEEPER_SCHEMA_NAME) unknownCase();
      const hit = index.get(requestKey(request)) ?? unknownCase();
      return { answer: hit.c.expected, factIds: hit.c.expectedFacts, confidence: 1 };
    }),
    "oracle"
  );
}

function wrongAnswer(answer: KeeperAnswer): KeeperAnswer {
  return KEEPER_ANSWERS[(KEEPER_ANSWERS.indexOf(answer) + 1) % KEEPER_ANSWERS.length];
}

/**
 * Deliberately bad keeper. By case position in the suite:
 * every 3rd case gets the wrong answer, every 5th lists all fact ids, every
 * 7th adds an "explanation" with the solution, every 11th answers in prose.
 */
export function createSaboteurProvider(cases: readonly EvalCase[]): LlmProvider {
  const index = caseIndex(cases);
  return createStubProvider(
    withJudge((request) => {
      if (request.schemaName !== KEEPER_SCHEMA_NAME) unknownCase();
      const { c, index: i } = index.get(requestKey(request)) ?? unknownCase();
      const n = i + 1;
      const out: Record<string, unknown> = {
        answer: n % 3 === 0 ? wrongAnswer(c.expected) : c.expected,
        factIds: n % 5 === 0 ? c.card.keyFacts.map((fact) => fact.id) : c.expectedFacts,
        confidence: 0.5,
      };
      if (n % 7 === 0) out.explanation = c.card.solution;
      if (n % 11 === 0) out.answer = `${c.expected}, because ${c.card.keyFacts[0]?.text ?? ""}`;
      return out;
    }),
    "saboteur"
  );
}

/** The Worker's offline stub keeper, plus the scripted judge. */
export function createStubKeeperProvider(): LlmProvider {
  return createStubProvider(withJudge(stubKeeperRespond), "stub-keeper");
}

/** Judge stand-in for offline runs. */
export function createScriptedJudge(): LlmProvider {
  return createStubProvider(scriptedJudgeRespond, "scripted-judge");
}

// ---------------------------------------------------------------------------
// Theory grading (#32)
// ---------------------------------------------------------------------------

function gradeCaseIndex(cases: readonly GradeEvalCase[]): Map<string, { c: GradeEvalCase; index: number }> {
  const map = new Map<string, { c: GradeEvalCase; index: number }>();
  cases.forEach((c, index) => {
    map.set(requestKey(buildGradeRequest({ card: c.card, lang: c.lang, theory: c.theory })), { c, index });
  });
  return map;
}

function unknownTheory(): never {
  throw new Error("fake grader got a request that is not in the grading eval suite");
}

/** Marks exactly the expected facts: a perfect grader scores 100% with zero leaks. */
export function createOracleGrader(cases: readonly GradeEvalCase[]): LlmProvider {
  const index = gradeCaseIndex(cases);
  return createStubProvider((request) => {
    if (request.schemaName !== GRADER_SCHEMA_NAME) unknownTheory();
    const hit = index.get(requestKey(request)) ?? unknownTheory();
    return { correctFactIds: hit.c.expectedFacts };
  }, "oracle-grader");
}

/**
 * Deliberately bad grader. By case position: every 3rd case drops an expected
 * fact (or claims an extra one), every 4th also returns the missing fact ids
 * and texts plus its own "solved" verdict (which the shared parser must strip:
 * these must NOT show up as leaks), every 7th returns malformed output.
 */
export function createSaboteurGrader(cases: readonly GradeEvalCase[]): LlmProvider {
  const index = gradeCaseIndex(cases);
  return createStubProvider((request) => {
    if (request.schemaName !== GRADER_SCHEMA_NAME) unknownTheory();
    const { c, index: i } = index.get(requestKey(request)) ?? unknownTheory();
    const n = i + 1;
    if (n % 7 === 0) return { verdict: "solved" };
    let ids = [...c.expectedFacts];
    if (n % 3 === 0) {
      const extra = c.card.keyFacts.find((fact) => !ids.includes(fact.id));
      ids = ids.length > 0 ? ids.slice(1) : extra ? [extra.id] : ids;
    }
    const out: Record<string, unknown> = { correctFactIds: ids };
    if (n % 4 === 0) {
      const missing = c.card.keyFacts.filter((fact) => !ids.includes(fact.id));
      out.missingFactIds = missing.map((fact) => fact.id);
      out.explanation = `Missing: ${missing.map((fact) => fact.text).join(" ")}`;
      out.verdict = "solved";
    }
    return out;
  }, "saboteur-grader");
}

/** The Worker's offline stub grader (keyword overlap). */
export function createStubGraderProvider(): LlmProvider {
  return createStubProvider(stubGraderRespond, "stub-grader");
}
