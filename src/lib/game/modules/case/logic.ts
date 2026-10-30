import type { CaseCard, Evidence } from "@/types/card";
import type { Deck } from "@/types/deck";
import type { CaseSessionState } from "@/types/session";
import { countCompletedCards, createBaseSession } from "../stack";
import type { Progress, StartOptions } from "../types";

/**
 * Pure logic for case files. Placeholder (#34): only the card stack ("which
 * case is next"). Per-case state (opened evidence, notes, answers, score;
 * spec §4.4) arrives with the case play screen (#35).
 */

export type CaseAction =
  /** Finish the current case and move to the next one. */
  | { type: "next" }
  /** Skip the current case (discarded, not recycled). */
  | { type: "skip" };

export function createCaseSession(
  deck: Deck<CaseCard>,
  opts: StartOptions
): CaseSessionState {
  return { ...createBaseSession(deck, opts), gameType: "case" };
}

function advance(session: CaseSessionState): CaseSessionState {
  const [nextCardId, ...rest] = session.remainingCardIds;
  return {
    ...session,
    currentCardId: nextCardId ?? null,
    remainingCardIds: rest,
    isRevealed: false,
  };
}

export function reduceCase(
  session: CaseSessionState,
  action: CaseAction
): CaseSessionState {
  if (!session.currentCardId) return session;
  switch (action.type) {
    case "next":
    case "skip":
      return advance(session);
  }
}

export function isCaseComplete(session: CaseSessionState): boolean {
  return session.currentCardId === null && session.remainingCardIds.length === 0;
}

export function caseProgress(
  session: CaseSessionState,
  deck: Deck<CaseCard>
): Progress {
  const total = deck.cards.length;
  const remaining =
    session.remainingCardIds.length + (session.currentCardId ? 1 : 0);
  return {
    completed: countCompletedCards(total, remaining, 0),
    remaining,
    passed: 0,
    total,
  };
}

export function caseCardIds(session: CaseSessionState): string[] {
  return [
    ...session.remainingCardIds,
    ...session.passedCardIds,
    ...(session.currentCardId ? [session.currentCardId] : []),
  ];
}

/**
 * Whether an evidence item can be opened, given the ids opened so far: every
 * id in `unlockAfter` must already be open. Shared by the play screen (#35)
 * and the investigator (#37).
 */
export function isEvidenceUnlocked(
  evidence: Evidence,
  openedIds: ReadonlySet<string> | readonly string[]
): boolean {
  const opened = openedIds instanceof Set ? openedIds : new Set(openedIds);
  return (evidence.unlockAfter ?? []).every((id) => opened.has(id));
}

/** Total points available in a case (sum of its questions). */
export function caseMaxPoints(card: CaseCard): number {
  return card.questions.reduce((sum, q) => sum + q.points, 0);
}
