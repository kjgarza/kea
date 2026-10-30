import { describe, expect, test } from "bun:test";
import type { SituationCard } from "../../types/card";
import { createStubProvider, ProviderError } from "./provider";
import {
  AMBIGUITY_SCHEMA_NAME,
  SOLVER_SCHEMA_NAME,
  buildAmbiguityPrompt,
  buildSolverPrompt,
  buildSolverRequest,
  checkAmbiguity,
  nextSolverMove,
  parseAmbiguityOutput,
  parseSolverOutput,
  toSolverView,
} from "./solver";
import { stubRespond } from "./stub-keeper";

const card: SituationCard = {
  cardId: "sit-x",
  type: "situation",
  title: "The Late Bus",
  setup: "Anna always takes the 8:00 bus but today she waited for the 8:15.",
  solution: "Her son was driving the 8:15 on his first day as a bus driver.",
  keyFacts: [
    { id: "son-driver", text: "Her son drives the later bus" },
    { id: "first-day", text: "It was his first day at work" },
    { id: "kf-proud-mum", text: "She wanted to cheer him on" },
  ],
  hints: ["Think about who is driving."],
};

describe("solver prompt", () => {
  test("toSolverView copies only the title and setup", () => {
    expect(toSolverView(card)).toEqual({ title: card.title, setup: card.setup });
  });

  test("never contains the solution or key facts", () => {
    const { system, user } = buildSolverPrompt({
      puzzle: toSolverView(card),
      lang: "en",
      history: [
        { kind: "question", text: "Is the driver important?", answer: "yes" },
        { kind: "theory", text: "She avoided someone.", verdict: "not_yet", correct: 0, missing: 3 },
      ],
      questionsLeft: 38,
      theoriesLeft: 2,
    });
    const prompt = `${system}\n${user}`;
    expect(prompt).toContain(card.setup);
    expect(prompt).not.toContain(card.solution);
    for (const fact of card.keyFacts) {
      expect(prompt).not.toContain(fact.text);
      expect(prompt).not.toContain(fact.id);
    }
    expect(user).toContain("38 question(s) and 2 theory attempt(s) left");
    expect(user).toContain("GRADE: not_yet (0 key facts right, 3 missing)");
  });

  test("with no questions left only a theory is allowed", () => {
    const req = buildSolverRequest({ puzzle: toSolverView(card), lang: "es", history: [], questionsLeft: 0, theoriesLeft: 1 });
    expect(req.schemaName).toBe(SOLVER_SCHEMA_NAME);
    const props = req.schema.properties as Record<string, { enum?: string[] }>;
    expect(props.action.enum).toEqual(["theory"]);
    expect(String(req.messages[0].content)).toContain("Spanish");
    expect(String(req.messages[0].content)).toContain("Submit your final theory now");
  });

  test("parseSolverOutput validates and forces a theory when out of questions", () => {
    expect(parseSolverOutput({ action: "ask", text: " Is it night? " }, 3)).toEqual({ action: "ask", text: "Is it night?" });
    expect(parseSolverOutput({ action: "ask", text: "Her son" }, 0)).toEqual({ action: "theory", text: "Her son" });
    expect(parseSolverOutput({ action: "shout", text: "x" }, 3)).toBeNull();
    expect(parseSolverOutput({ action: "ask", text: "  " }, 3)).toBeNull();
    expect(parseSolverOutput(null, 3)).toBeNull();
  });

  test("nextSolverMove reports unusable output, re-throws HTTP errors", async () => {
    const bad = createStubProvider(() => ({ nope: true }));
    const turn = await nextSolverMove(bad, { puzzle: toSolverView(card), lang: "en", history: [], questionsLeft: 1, theoriesLeft: 1 }, { attempts: 1 });
    expect(turn).toMatchObject({ move: null, failure: "invalid_json" });

    const down = createStubProvider(() => {
      throw new ProviderError("http", "down", 400);
    });
    await expect(
      nextSolverMove(down, { puzzle: toSolverView(card), lang: "en", history: [], questionsLeft: 1, theoriesLeft: 1 }, { attempts: 1 })
    ).rejects.toThrow("down");
  });
});

describe("ambiguity check", () => {
  test("the reviewer sees the setup and the solution", () => {
    const { user } = buildAmbiguityPrompt({ card, lang: "en" });
    expect(user).toContain(card.setup);
    expect(user).toContain(card.solution);
  });

  test("parses verdicts", async () => {
    expect(parseAmbiguityOutput({ ambiguous: true, alternative: " B ", reason: " R " })).toEqual({
      ambiguous: true,
      alternative: "B",
      reason: "R",
    });
    expect(parseAmbiguityOutput({ ambiguous: "yes" })).toBeNull();
    const provider = createStubProvider((req) => {
      expect(req.schemaName).toBe(AMBIGUITY_SCHEMA_NAME);
      return { ambiguous: false, alternative: "", reason: "" };
    });
    expect((await checkAmbiguity(provider, { card, lang: "en" })).verdict?.ambiguous).toBe(false);
  });
});

describe("stub solver", () => {
  test("asks a few questions, then submits the setup as a theory", () => {
    const ask = stubRespond(buildSolverRequest({ puzzle: toSolverView(card), lang: "en", history: [], questionsLeft: 40, theoriesLeft: 3 }));
    expect(ask).toMatchObject({ action: "ask" });
    const final = stubRespond(buildSolverRequest({ puzzle: toSolverView(card), lang: "en", history: [], questionsLeft: 0, theoriesLeft: 1 }));
    expect(final).toEqual({ action: "theory", text: card.setup });
  });
});
