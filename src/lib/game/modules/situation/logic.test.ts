import { describe, expect, test } from "bun:test";
import type { SituationCard } from "@/types/card";
import type { Deck } from "@/types/deck";
import type { SituationSessionState } from "@/types/session";
import {
  createSituationSession,
  formatElapsed,
  isSituationComplete,
  pickableCardIds,
  puzzleElapsedMs,
  reduceSituation,
  situationCardIds,
  situationPhase,
  situationProgress,
  type SituationAction,
} from "./logic";

function card(cardId: string, extra: Partial<SituationCard> = {}): SituationCard {
  return {
    cardId,
    type: "situation",
    title: `Title ${cardId}`,
    setup: `Setup ${cardId}`,
    solution: `Solution ${cardId}`,
    keyFacts: [
      { id: "f1", text: "Fact 1" },
      { id: "f2", text: "Fact 2" },
      { id: "f3", text: "Fact 3" },
    ],
    hints: ["h1", "h2"],
    ...extra,
  };
}

const deck = {
  deckId: "test-es-situation",
  gameType: "situation",
  language: "es",
  version: "v1",
  cards: [card("a"), card("b", { contentWarnings: ["gore"] }), card("c")],
} as unknown as Deck<SituationCard>;

const T0 = "2026-10-30T20:00:00.000Z";
const T1 = "2026-10-30T20:07:05.000Z";

function run(s: SituationSessionState, ...actions: SituationAction[]) {
  return actions.reduce((acc, a) => reduceSituation(acc, a, deck), s);
}

function fresh() {
  return createSituationSession(deck, { shuffleEnabled: false });
}

describe("situation session", () => {
  test("starts in the picker, human mode, deck language", () => {
    const s = fresh();
    expect(s.gameType).toBe("situation");
    expect(s.mode).toBe("human");
    expect(s.language).toBe("es");
    expect(s.puzzle).toBeNull();
    expect(situationPhase(s)).toBe("picker");
    expect(pickableCardIds(s)).toEqual(["a", "b", "c"]);
  });

  test("setMode only works from the picker", () => {
    let s = run(fresh(), { type: "setMode", mode: "ai" });
    expect(s.mode).toBe("ai");
    s = run(s, { type: "pick", cardId: "a", at: T0 });
    expect(run(s, { type: "setMode", mode: "solo" })).toBe(s);
  });

  test("picking a puzzle without warnings starts it", () => {
    const s = run(fresh(), { type: "pick", cardId: "a", at: T0 });
    expect(situationPhase(s)).toBe("playing");
    expect(s.puzzle).toMatchObject({
      cardId: "a",
      startedAt: T0,
      solutionRevealed: false,
      questionCount: 0,
      hintsUsed: 0,
      factsRevealed: [],
      transcript: [],
      theories: [],
      outcome: null,
      endedAt: null,
    });
  });

  test("picking a later puzzle moves it to the front of the stack", () => {
    const s = run(fresh(), { type: "pick", cardId: "c", at: T0 });
    expect(s.currentCardId).toBe("c");
    expect(s.remainingCardIds).toEqual(["a", "b"]);
    expect(s.puzzle?.cardId).toBe("c");
  });

  test("unknown or already-played cards cannot be picked", () => {
    const s = fresh();
    expect(run(s, { type: "pick", cardId: "zzz", at: T0 })).toBe(s);
  });

  test("puzzles with warnings show the interstitial first", () => {
    let s = run(fresh(), { type: "pick", cardId: "b", at: T0 });
    expect(situationPhase(s)).toBe("warnings");
    expect(s.puzzle?.startedAt).toBeNull();
    // Play actions are ignored until the warnings are accepted.
    expect(run(s, { type: "revealSolution" })).toBe(s);
    s = run(s, { type: "acceptWarnings", at: T1 });
    expect(situationPhase(s)).toBe("playing");
    expect(s.puzzle?.startedAt).toBe(T1);
  });

  test("backToPicker abandons an unfinished puzzle", () => {
    const s = run(fresh(), { type: "pick", cardId: "c", at: T0 }, { type: "backToPicker" });
    expect(s.puzzle).toBeNull();
    expect(pickableCardIds(s)).toEqual(["c", "a", "b"]);
  });

  test("keeper actions: reveal, facts, hints, questions", () => {
    let s = run(
      fresh(),
      { type: "pick", cardId: "a", at: T0 },
      { type: "revealSolution" },
      { type: "toggleFact", factId: "f2" },
      { type: "toggleFact", factId: "f1" },
      { type: "toggleFact", factId: "f2" },
      { type: "toggleFact", factId: "nope" },
      { type: "useHint" },
      { type: "useHint" },
      { type: "useHint" },
      { type: "addQuestion" },
      { type: "addQuestion" },
      { type: "addQuestion" },
      { type: "removeQuestion" }
    );
    expect(s.puzzle).toMatchObject({
      solutionRevealed: true,
      factsRevealed: ["f1"],
      hintsUsed: 2, // capped at the card's 2 hints
      questionCount: 2,
    });
    s = run(s, { type: "removeQuestion" }, { type: "removeQuestion" }, { type: "removeQuestion" });
    expect(s.puzzle?.questionCount).toBe(0);
  });

  test("revealSolution is idempotent", () => {
    const s = run(fresh(), { type: "pick", cardId: "a", at: T0 }, { type: "revealSolution" });
    expect(run(s, { type: "revealSolution" })).toBe(s);
  });

  test("end records outcome and time, then freezes the puzzle", () => {
    let s = run(
      fresh(),
      { type: "pick", cardId: "a", at: T0 },
      { type: "addQuestion" },
      { type: "end", outcome: "gave_up", at: T1 }
    );
    expect(situationPhase(s)).toBe("ended");
    expect(s.puzzle).toMatchObject({
      outcome: "gave_up",
      endedAt: T1,
      solutionRevealed: true,
      questionCount: 1,
    });
    expect(puzzleElapsedMs(s.puzzle!, Date.now())).toBe(7 * 60_000 + 5_000);
    expect(run(s, { type: "addQuestion" })).toBe(s);
    expect(run(s, { type: "end", outcome: "solved", at: T1 })).toBe(s);
    expect(run(s, { type: "backToPicker" })).toBe(s);
    s = run(s, { type: "next", at: T1 });
    expect(s.currentCardId).toBe("b");
  });

  test("next only advances once the puzzle has ended", () => {
    const s = run(fresh(), { type: "pick", cardId: "a", at: T0 });
    expect(run(s, { type: "next", at: T1 })).toBe(s);
  });

  test("next starts the next puzzle, or opens the picker", () => {
    const ended = run(
      fresh(),
      { type: "pick", cardId: "a", at: T0 },
      { type: "end", outcome: "solved", at: T1 }
    );
    const direct = run(ended, { type: "next", at: T1 });
    expect(direct.currentCardId).toBe("b");
    expect(situationPhase(direct)).toBe("warnings"); // b has warnings
    expect(direct.remainingCardIds).toEqual(["c"]);

    const picker = run(ended, { type: "next", at: T1, toPicker: true });
    expect(picker.currentCardId).toBe("b");
    expect(situationPhase(picker)).toBe("picker");
    expect(pickableCardIds(picker)).toEqual(["b", "c"]);
  });

  test("plays through the whole deck and completes", () => {
    let s = fresh();
    for (const id of ["a", "b", "c"]) {
      s = run(s, { type: "pick", cardId: id, at: T0 });
      if (situationPhase(s) === "warnings") s = run(s, { type: "acceptWarnings", at: T0 });
      s = run(s, { type: "end", outcome: "solved", at: T1 }, { type: "next", at: T1, toPicker: true });
    }
    expect(isSituationComplete(s)).toBe(true);
    expect(situationProgress(s, deck)).toEqual({ completed: 3, remaining: 0, passed: 0, total: 3 });
    expect(situationCardIds(s)).toEqual([]);
    expect(run(s, { type: "pick", cardId: "a", at: T0 })).toBe(s);
  });

  test("tolerates sessions saved before puzzle state existed", () => {
    const legacy = { ...fresh() } as Partial<SituationSessionState>;
    delete legacy.puzzle;
    delete legacy.mode;
    const s = legacy as SituationSessionState;
    expect(situationPhase(s)).toBe("picker");
    expect(run(s, { type: "pick", cardId: "a", at: T0 }).puzzle?.cardId).toBe("a");
  });
});

describe("formatElapsed", () => {
  test("formats minutes and hours", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
  });
});
