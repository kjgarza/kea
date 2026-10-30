import { describe, expect, test } from "bun:test";
import type { CaseCard } from "@/types/card";
import type { Deck } from "@/types/deck";
import type { CaseSessionState } from "@/types/session";
import { casePlayRecord } from "@/lib/history/case-record";
import {
  caseCardIds,
  caseClosing,
  caseMaxPoints,
  casePhase,
  caseProgress,
  createCaseSession,
  isCaseComplete,
  isEvidenceUnlocked,
  missingUnlocks,
  normalizeCaseSession,
  openedEvidence,
  reduceCase,
  type CaseAction,
} from "./logic";

const AT = "2026-10-30T10:00:00.000Z";
const LATER = "2026-10-30T10:30:00.000Z";

function card(cardId: string, warnings?: string[]): CaseCard {
  return {
    cardId,
    type: "case",
    title: `Case ${cardId}`,
    briefing: "Briefing",
    evidence: [
      { id: "a", title: "A", kind: "document", content: "x" },
      { id: "b", title: "B", kind: "document", content: "y", unlockAfter: ["a"] },
      { id: "c", title: "C", kind: "image", src: "c.svg", unlockAfter: ["a", "b"] },
    ],
    questions: [
      { id: "q1", prompt: "Who?", answer: "Coach Lena", acceptedVariants: ["Lena"], points: 2 },
      { id: "q2", prompt: "Why?", answer: "Engraving", acceptedVariants: [], points: 3 },
    ],
    walkthrough: "Walkthrough",
    ...(warnings ? { contentWarnings: warnings } : {}),
  };
}

const deck = {
  schemaVersion: 1,
  deckId: "test-en-case",
  version: "2026-10-30T00:00:00Z",
  name: "Test",
  gameType: "case",
  language: "en",
  difficulty: "easy",
  topics: [],
  nsfw: false,
  cards: [card("c1", ["theft"]), card("c2")],
} satisfies Deck<CaseCard>;

function play(actions: CaseAction[], from?: CaseSessionState): CaseSessionState {
  let s = from ?? createCaseSession(deck, { shuffleEnabled: false });
  for (const a of actions) s = reduceCase(s, a, deck);
  return s;
}

const started = () => play([{ type: "start", at: AT }]);

describe("case logic: stack", () => {
  test("plays the cases in order and completes", () => {
    let s = createCaseSession(deck, { shuffleEnabled: false });
    expect(s.gameType).toBe("case");
    expect(s.currentCardId).toBe("c1");
    expect(s.caseCardId).toBe("c1");
    expect(casePhase(s)).toBe("cover");
    expect(caseCardIds(s).sort()).toEqual(["c1", "c2"]);
    s = reduceCase(s, { type: "skip" }, deck);
    expect(s.currentCardId).toBe("c2");
    expect(s.caseCardId).toBe("c2");
    expect(caseProgress(s, deck)).toEqual({ completed: 1, remaining: 1, passed: 0, total: 2 });
    s = reduceCase(s, { type: "skip" }, deck);
    expect(isCaseComplete(s)).toBe(true);
    expect(reduceCase(s, { type: "next" }, deck)).toBe(s);
  });

  test("evidence unlocks once its prerequisites are opened", () => {
    const [a, b] = card("c1").evidence;
    expect(isEvidenceUnlocked(a, [])).toBe(true);
    expect(isEvidenceUnlocked(b, [])).toBe(false);
    expect(isEvidenceUnlocked(b, new Set(["a"]))).toBe(true);
  });

  test("max points sums the questions", () => {
    expect(caseMaxPoints(card("c1"))).toBe(5);
  });

  test("a session saved before #35 is normalised to a fresh case", () => {
    const old = { ...createCaseSession(deck, { shuffleEnabled: false }) } as Partial<CaseSessionState>;
    delete old.opened;
    delete old.notes;
    delete old.answers;
    delete old.caseCardId;
    const s = normalizeCaseSession(old as CaseSessionState);
    expect(s.opened).toEqual([]);
    expect(s.notes).toEqual({ suspects: "", timeline: "", free: "" });
    expect(casePhase(old as CaseSessionState)).toBe("cover");
    const opened = play([{ type: "start", at: AT }, { type: "open", evidenceId: "a" }], old as CaseSessionState);
    expect(opened.opened).toEqual(["a"]);
  });
});

describe("case logic: board", () => {
  test("start leaves the cover once", () => {
    const s = started();
    expect(casePhase(s)).toBe("board");
    expect(s.startedAt).toBe(AT);
    expect(reduceCase(s, { type: "start", at: LATER }, deck)).toBe(s);
  });

  test("nothing opens from the cover", () => {
    const s = createCaseSession(deck, { shuffleEnabled: false });
    expect(reduceCase(s, { type: "open", evidenceId: "a" }, deck)).toBe(s);
  });

  test("open respects unlockAfter and ignores unknown/duplicate ids", () => {
    let s = started();
    expect(reduceCase(s, { type: "open", evidenceId: "b" }, deck)).toBe(s);
    expect(reduceCase(s, { type: "open", evidenceId: "zzz" }, deck)).toBe(s);
    s = play([{ type: "open", evidenceId: "a" }], s);
    expect(reduceCase(s, { type: "open", evidenceId: "a" }, deck)).toBe(s);
    expect(reduceCase(s, { type: "open", evidenceId: "c" }, deck)).toBe(s);
    s = play([{ type: "open", evidenceId: "b" }, { type: "open", evidenceId: "c" }], s);
    expect(s.opened).toEqual(["a", "b", "c"]);
    expect(openedEvidence(deck.cards[0], s).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  test("missingUnlocks names what still has to be opened", () => {
    const c = card("c1").evidence[2];
    expect(missingUnlocks(c, [])).toEqual(["a", "b"]);
    expect(missingUnlocks(c, ["a"])).toEqual(["b"]);
    expect(missingUnlocks(c, ["a", "b"])).toEqual([]);
  });

  test("notes are saved per tab and survive other actions", () => {
    let s = play([
      { type: "setNote", tab: "suspects", text: "Lena lied" },
      { type: "setNote", tab: "timeline", text: "16:05 call" },
    ], started());
    expect(s.notes).toEqual({ suspects: "Lena lied", timeline: "16:05 call", free: "" });
    expect(reduceCase(s, { type: "setNote", tab: "suspects", text: "Lena lied" }, deck)).toBe(s);
    s = play([{ type: "open", evidenceId: "a" }, { type: "accuse", at: LATER }], s);
    // Notes stay editable after the accusation.
    s = play([{ type: "setNote", tab: "free", text: "ok" }], s);
    expect(s.notes.free).toBe("ok");
  });

  test("answers only change on the board and only for known questions", () => {
    let s = play([{ type: "setAnswer", questionId: "q1", text: "Lena" }], started());
    expect(s.answers).toEqual({ q1: "Lena" });
    expect(reduceCase(s, { type: "setAnswer", questionId: "nope", text: "x" }, deck)).toBe(s);
    s = play([{ type: "accuse", at: LATER }], s);
    expect(casePhase(s)).toBe("review");
    expect(reduceCase(s, { type: "setAnswer", questionId: "q1", text: "Marco" }, deck)).toBe(s);
    s = play([{ type: "editAnswers" }], s);
    expect(casePhase(s)).toBe("board");
    s = play([{ type: "setAnswer", questionId: "q1", text: "Marco" }], s);
    expect(s.answers.q1).toBe("Marco");
  });
});

describe("case logic: accusation and scoring", () => {
  const accused = (q1: string, q2: string) =>
    play(
      [
        { type: "setAnswer", questionId: "q1", text: q1 },
        { type: "setAnswer", questionId: "q2", text: q2 },
        { type: "accuse", at: LATER },
      ],
      started()
    );

  test("exact and variant matches score without marks", () => {
    let s = accused("lena", "  ENGRAVING! ");
    s = play([{ type: "reveal", at: LATER }], s);
    expect(casePhase(s)).toBe("closed");
    expect(s.scored).toEqual([
      { questionId: "q1", correct: true, points: 2, by: "variant" },
      { questionId: "q2", correct: true, points: 3, by: "exact" },
    ]);
    expect(s.endedAt).toBe(LATER);
  });

  test("unmatched answers block the reveal until the group marks them", () => {
    let s = accused("Coach Lena", "she wanted it engraved");
    const blocked = reduceCase(s, { type: "reveal", at: LATER }, deck);
    expect(blocked).toBe(s);
    // Locally matched answers cannot be marked.
    expect(reduceCase(s, { type: "mark", questionId: "q1", correct: false }, deck)).toBe(s);
    s = play([{ type: "mark", questionId: "q2", correct: true }], s);
    expect(s.marks).toEqual({ q2: { correct: true, by: "group" } });
    s = play([{ type: "mark", questionId: "q2", correct: null }], s);
    expect(s.marks).toEqual({});
    s = play([{ type: "mark", questionId: "q2", correct: false }, { type: "reveal", at: LATER }], s);
    expect(s.scored).toEqual([
      { questionId: "q1", correct: true, points: 2, by: "exact" },
      { questionId: "q2", correct: false, points: 0, by: "group" },
    ]);
  });

  test("blank answers score zero without a mark", () => {
    const s = play([{ type: "reveal", at: LATER }], accused("", "engraving"));
    expect(s.scored?.[0]).toEqual({ questionId: "q1", correct: false, points: 0, by: "blank" });
  });

  test("judge marks fill only unmarked unmatched answers; the group can override", () => {
    let s = accused("the trainer", "she wanted it engraved");
    s = play([{ type: "mark", questionId: "q1", correct: false }], s);
    s = play(
      [{ type: "judgeMarks", results: [{ questionId: "q1", correct: true }, { questionId: "q2", correct: true }] }],
      s
    );
    expect(s.marks).toEqual({
      q1: { correct: false, by: "group" },
      q2: { correct: true, by: "judge" },
    });
    s = play([{ type: "mark", questionId: "q2", correct: false }], s);
    expect(s.marks?.q2).toEqual({ correct: false, by: "group" });
  });

  test("editing answers clears marks", () => {
    let s = play([{ type: "mark", questionId: "q2", correct: true }], accused("Lena", "x"));
    s = play([{ type: "editAnswers" }, { type: "accuse", at: LATER }], s);
    expect(s.marks).toEqual({});
  });

  test("next moves on only after the reveal and resets the case", () => {
    let s = accused("Lena", "engraving");
    expect(reduceCase(s, { type: "next" }, deck)).toBe(s);
    s = play([{ type: "reveal", at: LATER }], s);
    expect(reduceCase(s, { type: "skip" }, deck)).toBe(s);
    s = play([{ type: "next" }], s);
    expect(s.currentCardId).toBe("c2");
    expect(casePhase(s)).toBe("cover");
    expect(s.opened).toEqual([]);
    expect(s.answers).toEqual({});
    expect(s.scored).toBeUndefined();
  });

  test("caseClosing + casePlayRecord write a scored record", () => {
    const s = accused("Lena", "nope");
    expect(caseClosing(s, { type: "reveal", at: LATER }, deck)).toBeNull();
    const marked = play([{ type: "mark", questionId: "q2", correct: false }], s);
    const closed = caseClosing(marked, { type: "reveal", at: LATER }, deck);
    expect(closed?.scored).toBeDefined();
    const record = casePlayRecord({
      deckId: deck.deckId,
      deckName: deck.name,
      language: deck.language,
      session: closed!,
      card: deck.cards[0],
      group: { id: "default", name: "", hidePlayed: false },
    });
    expect(record).toMatchObject({
      deckId: "test-en-case",
      cardId: "c1",
      group: "default",
      mode: "coop",
      language: "en",
      startedAt: AT,
      endedAt: LATER,
      questions: 2,
      hintsUsed: 0,
      outcome: "partial",
      score: 2,
      title: "Case c1",
    });
    const all = play([{ type: "editAnswers" }, { type: "setAnswer", questionId: "q2", text: "engraving" }, { type: "accuse", at: LATER }], marked);
    const solved = caseClosing(all, { type: "reveal", at: LATER }, deck)!;
    expect(
      casePlayRecord({ deckId: deck.deckId, session: solved, card: deck.cards[0], group: { id: "g", name: "Crew", hidePlayed: false } })
    ).toMatchObject({ outcome: "solved", score: 5, groupName: "Crew" });
  });
});
