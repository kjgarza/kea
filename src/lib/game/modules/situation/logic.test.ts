import { describe, expect, test } from "bun:test";
import type { SituationCard } from "@/types/card";
import type { Deck } from "@/types/deck";
import type { SituationSessionState } from "@/types/session";
import {
  createSituationSession,
  factProgress,
  formatElapsed,
  isSituationComplete,
  pickableCardIds,
  puzzleEnding,
  puzzleElapsedMs,
  reduceSituation,
  situationCardIds,
  situationPhase,
  situationProgress,
  soloScore,
  SOLO_SCORE,
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
const T2 = "2026-10-30T20:09:00.000Z";

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

describe("AI keeper answers (#31)", () => {
  const playing = () => run(fresh(), { type: "pick", cardId: "a", at: T0, mode: "ai" });
  const answer = (
    extra: Partial<Extract<SituationAction, { type: "recordAnswer" }>> = {}
  ): SituationAction => ({
    type: "recordAnswer",
    cardId: "a",
    q: "Was it raining?",
    a: "yes",
    factIds: ["f1"],
    at: T1,
    ...extra,
  });

  test("pick can switch the mode in the same step", () => {
    const s = playing();
    expect(s.mode).toBe("ai");
    expect(situationPhase(s)).toBe("playing");
  });

  test("appends to the transcript (latest last) and unions fact ids", () => {
    const s = run(
      playing(),
      answer(),
      answer({ q: "Was it night?", a: "partly", factIds: ["f1", "f2"] })
    );
    expect(s.puzzle?.transcript).toEqual([
      { q: "Was it raining?", a: "yes", factIds: ["f1"], at: T1 },
      { q: "Was it night?", a: "partly", factIds: ["f1", "f2"], at: T1 },
    ]);
    expect(s.puzzle?.factsRevealed).toEqual(["f1", "f2"]);
    expect(factProgress(s.puzzle!, deck.cards[0])).toBeCloseTo(2 / 3);
  });

  test("drops unknown fact ids and facts on irrelevant/rephrase", () => {
    const s = run(
      playing(),
      answer({ factIds: ["nope", "f3", "f3"] }),
      answer({ a: "irrelevant", factIds: ["f1"] }),
      answer({ a: "rephrase", factIds: ["f2"] })
    );
    expect(s.puzzle?.transcript.map((e) => e.factIds)).toEqual([["f3"], [], []]);
    expect(s.puzzle?.factsRevealed).toEqual(["f3"]);
  });

  test("normalises odd answers to rephrase and trims the question", () => {
    const s = run(
      playing(),
      answer({ a: "maybe" as never, q: "  " + "x".repeat(400) + "  " })
    );
    const entry = s.puzzle!.transcript[0];
    expect(entry.a).toBe("rephrase");
    expect(entry.q.length).toBe(300);
  });

  test("ignores blank questions, other cards and ended puzzles", () => {
    const s = playing();
    expect(run(s, answer({ q: "   " }))).toBe(s);
    expect(run(s, answer({ cardId: "c" }))).toBe(s);
    const ended = run(s, { type: "end", outcome: "gave_up", at: T1 });
    expect(run(ended, answer())).toBe(ended);
    // Not started (warnings still up): no transcript yet.
    const warned = run(fresh(), { type: "pick", cardId: "b", at: T0, mode: "solo" });
    expect(run(warned, answer({ cardId: "b" }))).toBe(warned);
  });

  test("hints work in AI mode and transcript survives other actions", () => {
    const s = run(playing(), answer(), { type: "useHint" }, answer({ q: "Again?" }));
    expect(s.puzzle?.hintsUsed).toBe(1);
    expect(s.puzzle?.transcript).toHaveLength(2);
  });
});

describe("solo score", () => {
  const base = () =>
    run(fresh(), { type: "pick", cardId: "a", at: T0, mode: "solo" }).puzzle!;

  test("starts at the maximum and drops per question and hint", () => {
    const p = base();
    expect(soloScore(p)).toBe(SOLO_SCORE.start);
    const asked = {
      ...p,
      hintsUsed: 1,
      transcript: Array.from({ length: 5 }, () => ({ q: "q", a: "no" as const, factIds: [], at: T1 })),
    };
    expect(soloScore(asked)).toBe(100 - 5 * 2 - 10);
  });

  test("has a floor when solved and is 0 after giving up", () => {
    const p = { ...base(), questionCount: 200 };
    expect(soloScore({ ...p, outcome: "solved" })).toBe(SOLO_SCORE.solvedMin);
    expect(soloScore({ ...p, outcome: "gave_up" })).toBe(0);
  });
});

describe("theories (#32)", () => {
  const playing = () => run(fresh(), { type: "pick", cardId: "a", at: T0, mode: "solo" });
  const theory = (
    extra: Partial<Extract<SituationAction, { type: "addTheory" }>> = {}
  ): SituationAction => ({
    type: "addTheory",
    cardId: "a",
    text: "  It was raining at night.  ",
    correctFactIds: ["f1"],
    at: T1,
    ...extra,
  });

  test("records the theory with a verdict recomputed from the correct ids (unknown ids dropped)", () => {
    const s = run(playing(), theory({ correctFactIds: ["f2", "nope", "f1"] }));
    expect(s.puzzle?.theories).toEqual([
      { text: "It was raining at night.", verdict: "close", correctFactIds: ["f1", "f2"], missingCount: 1, at: T1 },
    ]);
    expect(s.puzzle?.factsRevealed).toEqual(["f1", "f2"]);
    expect(situationPhase(s)).toBe("playing");
  });

  test("not_yet keeps playing; theories accumulate oldest first", () => {
    const s = run(playing(), theory(), theory({ text: "Second", correctFactIds: [] }));
    expect(s.puzzle?.theories.map((t) => [t.text, t.verdict, t.missingCount])).toEqual([
      ["It was raining at night.", "not_yet", 2],
      ["Second", "not_yet", 3],
    ]);
  });

  test("a solved theory ends the puzzle as solved", () => {
    const s = run(playing(), theory({ correctFactIds: ["f1", "f2", "f3"], at: T2 }));
    expect(s.puzzle?.outcome).toBe("solved");
    expect(s.puzzle?.endedAt).toBe(T2);
    expect(situationPhase(s)).toBe("ended");
    expect(s.puzzle?.theories[0].verdict).toBe("solved");
  });

  test("ignored for another card, an empty theory, or a puzzle that is not in play", () => {
    const s = playing();
    expect(run(s, theory({ cardId: "b" }))).toBe(s);
    expect(run(s, theory({ text: "   " }))).toBe(s);
    const ended = run(s, { type: "end", outcome: "gave_up", at: T1 });
    expect(run(ended, theory())).toBe(ended);
  });

  test("puzzleEnding reports end and solved theories, nothing else", () => {
    const s = playing();
    expect(puzzleEnding(s, theory(), deck)).toBeNull();
    expect(puzzleEnding(s, theory({ correctFactIds: ["f1", "f2", "f3"], at: T2 }), deck)).toEqual({
      outcome: "solved",
      at: T2,
    });
    expect(puzzleEnding(s, { type: "end", outcome: "gave_up", at: T1 }, deck)).toEqual({ outcome: "gave_up", at: T1 });
    expect(puzzleEnding(s, { type: "useHint" }, deck)).toBeNull();
    const ended = run(s, { type: "end", outcome: "gave_up", at: T1 });
    expect(puzzleEnding(ended, { type: "end", outcome: "solved", at: T2 }, deck)).toBeNull();
  });
});
