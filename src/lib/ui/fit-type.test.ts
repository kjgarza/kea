import { describe, expect, test } from "bun:test";
import { deckDepth, fitType, glyphAdvance, wordUnits } from "./fit-type";

const sizeOf = (text: string) =>
  Number(/min\(([\d.]+)cqi/.exec(String(fitType(text).fontSize))?.[1]);
const widthOf = (text: string) =>
  parseInt(String((fitType(text) as Record<string, unknown>)["--type-width"]), 10);

describe("fitType", () => {
  test("short words set wider than long ones", () => {
    expect(widthOf("Beach")).toBeGreaterThan(widthOf("Astronaut"));
    expect(widthOf("Astronaut")).toBeGreaterThan(widthOf("Supercalifragilistic"));
  });

  test("longer text sets smaller", () => {
    expect(sizeOf("Whitney Houston I Will Always Love You")).toBeLessThan(sizeOf("Whitney"));
  });

  test("capitals and wide letters count for more", () => {
    expect(wordUnits("WAVE")).toBeGreaterThan(wordUnits("wave"));
    expect(wordUnits("mummy")).toBeGreaterThan(wordUnits("lilly"));
    expect(sizeOf("MAMBO")).toBeLessThan(sizeOf("lilly"));
  });

  test("the longest word fits inside the measure", () => {
    for (const word of ["Kangaroo", "UNIVERSITY", "Supercalifragilistic"]) {
      expect(sizeOf(word) * wordUnits(word) * glyphAdvance(widthOf(word))).toBeLessThanOrEqual(76.1);
    }
  });

  test("handles empty text", () => {
    expect(Number.isFinite(sizeOf(""))).toBe(true);
  });
});

describe("deckDepth", () => {
  test("grows with the deck and stays within bounds", () => {
    expect(deckDepth(1)).toBe(1);
    expect(deckDepth(10)).toBeLessThan(deckDepth(125));
    expect(deckDepth(125)).toBeLessThanOrEqual(deckDepth(550));
    expect(deckDepth(100000)).toBe(9);
  });
});
