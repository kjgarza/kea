/**
 * Offline keeper for local development (`KEEPER_PROVIDER=stub`). It reads the
 * key facts back out of the keeper prompt and answers "yes" when the question
 * shares a word with a fact, "rephrase" when it asks for the answer, and
 * "irrelevant" otherwise. Good enough to click through the UI; NOT a keeper.
 *
 * `stubGraderRespond` does the same for theories (a fact counts when the
 * theory contains at least half of its longer words), and `stubRespond`
 * routes a request to the right one by schema name.
 */
import { INVESTIGATOR_SCHEMA_NAME, JUDGE_SCHEMA_NAME, normalizeCaseAnswer } from "./case";
import { GRADER_SCHEMA_NAME } from "./grade";
import type { JsonGenerationRequest } from "./provider";
import { AMBIGUITY_SCHEMA_NAME, SOLVER_SCHEMA_NAME } from "./solver";

const ASK_FOR_ANSWER = /\b(answer|solution|tell me|respuesta|soluci[oó]n|dime)\b/i;

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4)
  );
}

function promptFacts(system: string) {
  return Array.from(system.matchAll(/^- \[([^\]]+)\] (.+)$/gm), (m) => ({ id: m[1], text: m[2] }));
}

function userText(request: JsonGenerationRequest): string {
  return request.messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
}

export function stubKeeperRespond(request: JsonGenerationRequest) {
  const user = userText(request);
  const question = user.match(/<question>\n([\s\S]*?)\n<\/question>/)?.[1] ?? "";
  if (ASK_FOR_ANSWER.test(question)) return { answer: "rephrase", factIds: [], confidence: 0.9 };

  const asked = words(question);
  const facts = promptFacts(request.system);
  const hits = facts.filter((fact) => Array.from(words(fact.text)).some((word) => asked.has(word)));
  if (hits.length > 0) return { answer: "yes", factIds: hits.map((fact) => fact.id), confidence: 0.4 };
  return { answer: "irrelevant", factIds: [], confidence: 0.3 };
}

/** Offline grader: a fact is "correct" when the theory has at least half of its words. */
export function stubGraderRespond(request: JsonGenerationRequest) {
  const theory = words(userText(request).match(/<theory>\n([\s\S]*?)\n<\/theory>/)?.[1] ?? "");
  const correctFactIds = promptFacts(request.system)
    .filter((fact) => {
      const factWords = Array.from(words(fact.text));
      const hits = factWords.filter((word) => theory.has(word)).length;
      return factWords.length > 0 && hits * 2 >= factWords.length;
    })
    .map((fact) => fact.id);
  return { correctFactIds };
}

/**
 * Offline solver (solvability check, #33): asks a few generic questions, then
 * submits the setup itself as its theory. It cannot solve anything; it only
 * exercises the pipeline without API keys.
 */
const STUB_SOLVER_QUESTIONS = [
  "Did someone die?",
  "Is anyone in danger?",
  "Did someone act on purpose?",
  "Is the place important?",
];

export function stubSolverRespond(request: JsonGenerationRequest) {
  const user = userText(request);
  const asked = (user.match(/^\d+\. Q: /gm) ?? []).length;
  const outOfQuestions = /no questions left/i.test(user);
  if (!outOfQuestions && asked < STUB_SOLVER_QUESTIONS.length) {
    return { action: "ask", text: STUB_SOLVER_QUESTIONS[asked] };
  }
  const setup = request.system.split("SETUP:\n")[1] ?? "I do not know.";
  return { action: "theory", text: setup.trim() };
}

/** Offline ambiguity check: never flags anything. */
export function stubAmbiguityRespond() {
  return { ambiguous: false, alternative: "", reason: "" };
}

/**
 * Offline investigator (#37): picks the opened evidence item sharing the most
 * longer words with the question and quotes its first line; otherwise says
 * the answer is not in the opened evidence. It can only see what the prompt
 * holds, like the real investigator.
 */
export function stubInvestigatorRespond(request: JsonGenerationRequest) {
  const question = userText(request).match(/<question>\n([\s\S]*?)\n<\/question>/)?.[1] ?? "";
  if (ASK_FOR_ANSWER.test(question)) return { inEvidence: false, answer: "", citedEvidenceIds: [] };
  const asked = words(question);
  const start = request.system.lastIndexOf("\nOPENED EVIDENCE (");
  const opened = start >= 0 ? request.system.slice(start) : "";
  const items = Array.from(
    opened.matchAll(/^--- EVIDENCE \[([^\]]+)\] [a-z_]+: (.*)\n([\s\S]*?)(?=\n\n--- |\n--- END)/gm),
    (m) => ({ id: m[1], title: m[2], body: m[3] })
  );
  let best: { id: string; title: string; body: string; score: number } | null = null;
  for (const item of items) {
    const score = Array.from(words(`${item.title} ${item.body}`)).filter((w) => asked.has(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { ...item, score };
  }
  if (!best) return { inEvidence: false, answer: "", citedEvidenceIds: [] };
  const line = best.body.split("\n").find((l) => l.trim().length > 0)?.trim() ?? best.title;
  return { inEvidence: true, answer: `\`${best.id}\` (${best.title}): ${line.slice(0, 200)}`, citedEvidenceIds: [best.id] };
}

/**
 * Offline judge (#37): an answer is correct when it shares at least half of
 * the longer words of the answer or of a variant.
 */
export function stubJudgeRespond(request: JsonGenerationRequest) {
  const user = userText(request);
  const blocks = user.split(/\n(?=QUESTION \[)/).filter((b) => b.startsWith("QUESTION ["));
  const results = blocks.map((block) => {
    const questionId = block.match(/^QUESTION \[([^\]]+)\]/)?.[1] ?? "";
    const correctAnswer = block.match(/^CORRECT ANSWER: (.*)$/m)?.[1] ?? "";
    const variants = (block.match(/^ACCEPTED VARIANTS: (.*)$/m)?.[1] ?? "").split("; ");
    const given = words(normalizeCaseAnswer(block.match(/<answer id="[^"]*">\n([\s\S]*?)\n<\/answer>/)?.[1] ?? ""));
    const correct = [correctAnswer, ...variants].some((target) => {
      const targetWords = Array.from(words(normalizeCaseAnswer(target)));
      const hits = targetWords.filter((w) => given.has(w)).length;
      return targetWords.length > 0 && hits * 2 >= targetWords.length;
    });
    return { questionId, correct };
  });
  return { results };
}

/** Offline provider callback for every Worker endpoint and script prompt, routed by schema name. */
export function stubRespond(request: JsonGenerationRequest) {
  switch (request.schemaName) {
    case GRADER_SCHEMA_NAME:
      return stubGraderRespond(request);
    case SOLVER_SCHEMA_NAME:
      return stubSolverRespond(request);
    case AMBIGUITY_SCHEMA_NAME:
      return stubAmbiguityRespond();
    case INVESTIGATOR_SCHEMA_NAME:
      return stubInvestigatorRespond(request);
    case JUDGE_SCHEMA_NAME:
      return stubJudgeRespond(request);
    default:
      return stubKeeperRespond(request);
  }
}
