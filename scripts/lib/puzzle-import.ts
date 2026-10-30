import type { SituationDeck } from "../../src/types/deck";
import { updateDeckIndexFile } from "./deck-index";
import {
  parsePuzzlePack,
  puzzlePackToDeck,
  sameDeckContent,
  serializeDeck,
} from "./puzzle-pack";

/**
 * File-system side of the puzzle importer (issue #27). Pure parsing and
 * validation live in ./puzzle-pack.ts.
 */

export interface ImportPuzzleOptions {
  outputDir: string; // e.g. "./public/decks"
  dryRun?: boolean;
  now?: () => Date; // injectable clock for tests
}

export interface ImportPuzzleResult {
  file: string;
  deck: SituationDeck | null;
  changed: boolean; // deck content differs from what is on disk
  errors: string[];
}

async function readExistingDeck(path: string): Promise<SituationDeck | null> {
  try {
    return (await Bun.file(path).json()) as SituationDeck;
  } catch {
    return null;
  }
}

/**
 * Import one pack file. Writes `<outputDir>/<deckId>.json` and upserts the
 * index entry. The deck `version` is kept when the content is unchanged, so
 * re-running the import produces byte-identical files (no spurious diff).
 */
export async function importPuzzleFile(
  file: string,
  opts: ImportPuzzleOptions
): Promise<ImportPuzzleResult> {
  const text = await Bun.file(file).text();
  const parsed = parsePuzzlePack(text, { fileName: file });
  if (!parsed.value) {
    return { file, deck: null, changed: false, errors: parsed.errors.map((e) => `${file}: ${e}`) };
  }

  // Build once with a placeholder version to compare with what is on disk.
  const draft = puzzlePackToDeck(parsed.value, { version: "" });
  if (!draft.deck) {
    return { file, deck: null, changed: false, errors: draft.errors.map((e) => `${file}: ${e}`) };
  }

  const deckPath = `${opts.outputDir}/${draft.deck.deckId}.json`;
  const existing = await readExistingDeck(deckPath);
  const changed = !existing || !sameDeckContent(existing, draft.deck);
  const version =
    !changed && existing ? existing.version : (opts.now?.() ?? new Date()).toISOString();
  const deck: SituationDeck = { ...draft.deck, version };

  if (!opts.dryRun) {
    await Bun.write(deckPath, serializeDeck(deck));
    await updateDeckIndexFile(`${opts.outputDir}/index.json`, [
      { deck, recommended: draft.recommended },
    ]);
  }
  return { file, deck, changed, errors: [] };
}
