import type { CSSProperties } from "react";

/**
 * Big card type that fills the card. Anybody is a variable font whose width
 * axis runs from 50% to 150%, so short words set wide and long ones set narrow
 * instead of everything shrinking to the size of the longest word.
 *
 * Sizes are in `cqi`, so the element must sit inside a size container.
 *
 * The letter widths below were tuned so that no word in any deck overflows a
 * card on a 375px phone (measured in the browser across every prompt).
 */

/** A letter's width relative to an average lowercase letter. */
function letterUnits(char: string): number {
  if ("ilj.,'’:;!|".includes(char)) return 0.55;
  if ("ft-I1()".includes(char)) return 0.75;
  if ("mw".includes(char)) return 1.45;
  if ("r".includes(char)) return 0.92;
  if ("MW".includes(char)) return 1.8;
  if (/\p{Lu}/u.test(char)) return 1.35;
  if (/\d/.test(char)) return 1.15;
  return 1;
}

/** A word's width in average letters. */
export function wordUnits(word: string): number {
  let units = 0;
  for (const char of word) units += letterUnits(char);
  return units;
}

/** An average lowercase letter's advance at a given width axis, in em. */
export const glyphAdvance = (width: number) => 0.64 * (width / 100) + 0.02;

const widthFor = (longestWord: number) => {
  if (longestWord <= 6) return 118;
  if (longestWord <= 8.5) return 100;
  if (longestWord <= 11) return 82;
  if (longestWord <= 15) return 66;
  return 54;
};

interface FitOptions {
  /** Upper limit in px, so a one-letter word doesn't take over the screen. */
  maxPx?: number;
  /** Share of the container's width the text may use. */
  measure?: number;
  /** Height the text may fill, relative to the container's width. */
  aspect?: number;
}

export function fitType(
  text: string,
  { maxPx = 104, measure = 76, aspect = 0.8 }: FitOptions = {}
): CSSProperties {
  const words = text.trim().split(/\s+/);
  const longest = Math.max(1, ...words.map(wordUnits));
  const total = Math.max(1, wordUnits(text.trim()));
  const width = widthFor(longest);
  const glyph = glyphAdvance(width);

  // No word may be wider than the measure.
  const byWord = measure / (longest * glyph);
  // All the text, wrapped, has to fit in the available area (line height 1).
  const byArea = Math.sqrt((measure * measure * aspect) / (total * glyph));
  const size = Math.min(byWord, byArea);

  return {
    fontSize: `min(${size.toFixed(2)}cqi, ${maxPx}px)`,
    "--type-width": `${width}%`,
  } as CSSProperties;
}

/** Number of card edges to draw under a deck, so a big deck looks thick. */
export function deckDepth(cardCount: number): number {
  return Math.min(9, Math.max(1, Math.round(Math.log2(Math.max(1, cardCount)))));
}

/** Layered shadows that draw `deckDepth` card edges under a deck. */
export function deckDepthShadow(cardCount: number, step = 2): string {
  const layers = deckDepth(cardCount);
  const edges: string[] = [];
  for (let i = 1; i <= layers; i++) {
    const y = i * step;
    edges.push(`0 ${y}px 0 ${i % 2 ? "var(--game-deep)" : "var(--paper)"}`);
  }
  edges.push(`0 ${layers * step + 6}px 14px -4px rgb(0 0 0 / 0.45)`);
  return edges.join(", ");
}
