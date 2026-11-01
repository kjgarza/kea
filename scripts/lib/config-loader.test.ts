import { describe, expect, test } from "bun:test";
import {
  generateDeckIdFromConfig,
  loadConfig,
  parseConfig,
  parseSituationConfig,
} from "./config-loader";

const SITUATION_YAML = `
name: Test Puzzles
gameType: situation
language: en
`;

describe("situation config", () => {
  test("defaults: macabre tone, death allowed, no deck warnings", () => {
    const config = parseConfig(SITUATION_YAML);
    expect(config.situation).toEqual({
      tone: "macabre",
      allowDeath: true,
      contentWarnings: [],
    });
  });

  test("the no-death tone always forbids death", () => {
    expect(parseSituationConfig({ tone: "no-death" }).allowDeath).toBe(false);
    expect(parseSituationConfig({ tone: "no-death", allowDeath: true }).allowDeath).toBe(false);
  });

  test("allowDeath can be turned off for other tones", () => {
    expect(parseSituationConfig({ tone: "funny", allowDeath: false })).toEqual({
      tone: "funny",
      allowDeath: false,
      contentWarnings: [],
    });
  });

  test("normalises and de-duplicates deck content warnings", () => {
    expect(
      parseSituationConfig({ contentWarnings: ["Death", " death ", "Child  Death"] })
        .contentWarnings
    ).toEqual(["death", "child death"]);
  });

  test("rejects invalid values", () => {
    expect(() => parseSituationConfig({ tone: "spooky" })).toThrow(/tone/);
    expect(() => parseSituationConfig({ allowDeath: "yes" })).toThrow(/allowDeath/);
    expect(() => parseSituationConfig({ contentWarnings: "death" })).toThrow(/contentWarnings/);
    expect(() => parseSituationConfig({ contentWarnings: [""] })).toThrow(/contentWarnings/);
  });

  test("other game types get no situation settings", () => {
    const config = parseConfig("name: Animals\ngameType: charades\n");
    expect(config.situation).toBeUndefined();
  });
});

describe("seed situation configs", () => {
  const seeds = [
    ["classic-en-situation", "macabre", true],
    ["no-death-en-situation", "no-death", false],
    ["lateral-thinking-en-situation", "funny", true],
  ] as const;

  for (const [name, tone, allowDeath] of seeds) {
    test(`${name} loads and its deck id matches the file name`, async () => {
      const config = await loadConfig(`decks/source/${name}.yaml`);
      expect(config.gameType).toBe("situation");
      expect(generateDeckIdFromConfig(config)).toBe(name);
      expect(config.situation?.tone).toBe(tone);
      expect(config.situation?.allowDeath).toBe(allowDeath);
      expect(config.cardCount).toBeGreaterThanOrEqual(20);
      expect(config.cardCount).toBeLessThanOrEqual(30);
      expect(config.nsfw).toBe(false);
    });
  }
});
