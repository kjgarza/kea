/**
 * Live validation for the /add YAML editor (photo quick-add, #38). Runs the
 * same parser and shared situation validator as `bun scripts/import-puzzles.ts`,
 * so "no errors here" means "imports cleanly". Pure.
 */
import { puzzlePackFileName } from "../ai/photo";
import { parsePuzzlePack, puzzlePackToDeck, type PuzzlePack } from "../puzzles/puzzle-pack";

export interface PackCheck {
  pack: PuzzlePack | null;
  /** `decks/puzzles/<pack>-<lang>.yaml` from the YAML itself, when it parses. */
  fileName: string | null;
  /** Deck id the importer would write. */
  deckId: string | null;
  errors: string[];
}

export function checkPackYaml(text: string): PackCheck {
  const parsed = parsePuzzlePack(text);
  if (!parsed.value) return { pack: null, fileName: null, deckId: null, errors: parsed.errors };
  const pack = parsed.value;
  const fileName = puzzlePackFileName(pack.pack, pack.language);
  const { deck, errors } = puzzlePackToDeck(pack, { version: "1970-01-01T00:00:00.000Z" });
  return { pack, fileName, deckId: deck?.deckId ?? pack.deckId ?? `${pack.pack}-${pack.language}-situation`, errors };
}

export interface FieldErrors {
  /** Field name ("setup", "keyFacts", "pack", "yaml", ...). */
  field: string;
  /** Puzzle label (`puzzles[0] "Title" (id "x")`) or null for pack-level errors. */
  puzzle: string | null;
  messages: string[];
}

const PUZZLE_PREFIX = /^(puzzles\[\d+\](?: "[^"]*")?(?: \(id "[^"]*"\))?): /;

/** Field an importer error is about: `'setup' is 512 characters…` → "setup". */
export function errorField(message: string): string {
  if (/^invalid YAML/.test(message)) return "yaml";
  const quoted = message.match(/^'([A-Za-z]+)(?:\.[A-Za-z]+)?'/);
  if (quoted) return quoted[1];
  const bare = message.match(/^([A-Za-z]+)(?:\[\d+\])?(?:\.[A-Za-z]+)?\b/);
  if (bare && bare[1] !== "the" && bare[1] !== "file") return bare[1];
  return "general";
}

/** Group importer errors by puzzle and field, keeping their order. */
export function groupPackErrors(errors: readonly string[]): FieldErrors[] {
  const groups: FieldErrors[] = [];
  for (const error of errors) {
    const match = error.match(PUZZLE_PREFIX);
    const puzzle = match ? match[1] : null;
    const message = match ? error.slice(match[0].length) : error;
    const field = errorField(message);
    let group = groups.find((g) => g.field === field && g.puzzle === puzzle);
    if (!group) {
      group = { field, puzzle, messages: [] };
      groups.push(group);
    }
    group.messages.push(message);
  }
  return groups;
}

/**
 * The `puzzles:` entries of a pack, to paste at the end of an existing pack
 * file's `puzzles:` list. Falls back to the whole text.
 */
export function puzzleEntries(text: string): string {
  const match = text.match(/^puzzles:[ \t]*\r?\n/m);
  if (!match || match.index === undefined) return text;
  return text.slice(match.index + match[0].length);
}
