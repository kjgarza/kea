import { describe, expect, test } from "bun:test";
import { parseConfig } from "../lib/config-loader";
import { buildPrompt } from "./index";
import { buildSituationPrompt } from "./situation";

function promptFor(yaml: string) {
  const config = parseConfig(`name: Test\ngameType: situation\n${yaml}`);
  return buildSituationPrompt({ config, context: "" });
}

describe("buildSituationPrompt", () => {
  test("is the prompt builder for the situation game type", () => {
    const config = parseConfig("name: Test\ngameType: situation\n");
    expect(buildPrompt("situation", { config, context: "" })).toEqual(
      buildSituationPrompt({ config, context: "" })
    );
  });

  test("asks for every SituationCard field and the validator limits", () => {
    const { systemPrompt, userPrompt } = promptFor("cardCount: 22\n");
    for (const field of ["title", "setup", "solution", "keyFacts", "hints", "contentWarnings", "estMinutes"]) {
      expect(systemPrompt).toContain(`"${field}"`);
    }
    expect(systemPrompt).toContain("at most 400 characters");
    expect(systemPrompt).toContain("3–8");
    expect(systemPrompt).toMatch(/mild to strong/);
    expect(userPrompt).toContain("Generate 22 unique situation puzzles");
  });

  test("tone options change the guidance", () => {
    expect(promptFor("tone: macabre\n").systemPrompt).toContain("Tone: MACABRE");
    expect(promptFor("tone: funny\n").systemPrompt).toContain("Tone: FUNNY");
    const noDeath = promptFor("tone: no-death\n").systemPrompt;
    expect(noDeath).toContain("Tone: NO DEATH");
    expect(noDeath).toContain("nobody dies");
    expect(promptFor("tone: funny\nallowDeath: false\n").systemPrompt).toContain("NO DEATH:");
  });

  test("difficulty guidance follows the deck difficulty", () => {
    expect(promptFor("difficulty: easy\n").systemPrompt).toContain("Puzzle difficulty: EASY");
    expect(promptFor("difficulty: hard\n").systemPrompt).toContain("Puzzle difficulty: HARD");
  });

  test("mentions deck-level warnings and the language", () => {
    const { systemPrompt, userPrompt } = promptFor(
      "language: es\ncontentWarnings: [death]\n"
    );
    expect(systemPrompt).toContain("Language: ES");
    expect(userPrompt).toContain("already warns about: death");
  });
});
