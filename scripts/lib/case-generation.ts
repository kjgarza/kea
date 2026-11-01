import type { CaseCard } from "../../src/types/card";
import { TEXT_EVIDENCE_KINDS } from "../../src/types/card";
import { findUnlockCycle } from "./validators";
import { walkthroughEvidenceRefs } from "./case-pack";

/**
 * Rules for generated case files (issue #36, spec F18), on top of the shared
 * `validateCaseCard`. Hand-written cases (YAML import) may be smaller or use
 * image/map/pdf evidence; generated ones may not, because generation cannot
 * create the files.
 */
export const CASE_GENERATION_LIMITS = {
  minEvidence: 8,
  maxEvidence: 15,
  minQuestions: 3,
  maxQuestions: 5,
  minUnlockChains: 2,
} as const;

/** Problems that keep a validated, generated case out of the deck. */
export function generatedCaseProblems(card: CaseCard): string[] {
  const { minEvidence, maxEvidence, minQuestions, maxQuestions, minUnlockChains } =
    CASE_GENERATION_LIMITS;
  const problems: string[] = [];
  const n = card.evidence.length;
  if (n < minEvidence || n > maxEvidence) {
    problems.push(`has ${n} evidence items (expected ${minEvidence}–${maxEvidence})`);
  }
  const q = card.questions.length;
  if (q < minQuestions || q > maxQuestions) {
    problems.push(`has ${q} questions (expected ${minQuestions}–${maxQuestions})`);
  }
  for (const e of card.evidence) {
    if (!TEXT_EVIDENCE_KINDS.includes(e.kind) || e.src !== undefined) {
      problems.push(`evidence "${e.id}" is ${e.kind}; generated cases may only use ${TEXT_EVIDENCE_KINDS.join(", ")}`);
    }
  }
  const locked = card.evidence.filter((e) => (e.unlockAfter?.length ?? 0) > 0).length;
  if (locked < minUnlockChains) {
    problems.push(`has ${locked} locked evidence item(s) (expected at least ${minUnlockChains} unlockAfter chains)`);
  }
  if (card.evidence.every((e) => (e.unlockAfter?.length ?? 0) > 0)) {
    problems.push(`has no evidence available at the start`);
  }
  if (findUnlockCycle(card.evidence)) {
    problems.push(`has an unlockAfter cycle`);
  }
  const ids = new Set(card.evidence.map((e) => e.id));
  const refs = walkthroughEvidenceRefs(card.walkthrough);
  if (refs.length === 0) {
    problems.push(`walkthrough cites no evidence ids (write them in backticks)`);
  }
  for (const ref of refs) {
    if (!ids.has(ref)) problems.push(`walkthrough cites unknown evidence id \`${ref}\``);
  }
  return problems;
}

/** Split generated cases into kept and rejected (with reasons). */
export function finalizeCaseCards(cards: readonly CaseCard[]): {
  cards: CaseCard[];
  rejected: { cardId: string; reason: string }[];
} {
  const kept: CaseCard[] = [];
  const rejected: { cardId: string; reason: string }[] = [];
  for (const card of cards) {
    const problems = generatedCaseProblems(card);
    if (problems.length > 0) {
      rejected.push({ cardId: card.cardId, reason: problems.join("; ") });
    } else {
      kept.push(card);
    }
  }
  return { cards: kept, rejected };
}
