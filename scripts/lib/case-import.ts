import { existsSync, statSync } from "fs";
import { dirname, join } from "path";
import { mkdir } from "fs/promises";
import type { CaseDeck } from "../../src/types/deck";
import { updateDeckIndexFile } from "./deck-index";
import { CASE_ASSETS_DIR } from "./case-assets";
import {
  CASE_PACK_ASSETS_DIR,
  casePackToDeck,
  deckAssetPaths,
  parseCasePack,
  sameCaseDeckContent,
  serializeCaseDeck,
  type CasePack,
} from "./case-pack";

/**
 * File-system side of the case importer (issue #36). Pure parsing and
 * validation live in ./case-pack.ts.
 */

export interface ImportCaseOptions {
  outputDir: string; // e.g. "./public/decks"
  /** Where pack assets are read from (default decks/cases/assets). */
  packAssetsDir?: string;
  /** Where deck assets are written to (default public/decks/assets). */
  deckAssetsDir?: string;
  dryRun?: boolean;
  now?: () => Date; // injectable clock for tests
}

export interface ImportCaseResult {
  file: string;
  deck: CaseDeck | null;
  changed: boolean; // deck content or an asset differs from what is on disk
  assets: string[]; // src paths copied (or that would be copied)
  errors: string[];
}

function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Where an evidence file for this pack is read from: the language folder
 * (`<packAssetsDir>/<pack>/<lang>/<src>`) wins over the shared one
 * (`<packAssetsDir>/<pack>/<src>`). Null when neither exists.
 */
export function resolvePackAsset(
  pack: Pick<CasePack, "pack" | "language">,
  src: string,
  packAssetsDir: string = CASE_PACK_ASSETS_DIR
): string | null {
  const localised = join(packAssetsDir, pack.pack, pack.language, src);
  if (isFile(localised)) return localised;
  const shared = join(packAssetsDir, pack.pack, src);
  return isFile(shared) ? shared : null;
}

async function readExistingDeck(path: string): Promise<CaseDeck | null> {
  try {
    return (await Bun.file(path).json()) as CaseDeck;
  } catch {
    return null;
  }
}

async function sameBytes(a: string, b: string): Promise<boolean> {
  if (!isFile(b)) return false;
  const [x, y] = await Promise.all([Bun.file(a).bytes(), Bun.file(b).bytes()]);
  return x.length === y.length && x.every((byte, i) => byte === y[i]);
}

/**
 * Import one case pack. Writes `<outputDir>/<deckId>.json`, copies every
 * referenced evidence file to `<deckAssetsDir>/<deckId>/<src>` and upserts the
 * index entry. The deck `version` is kept when neither the deck nor any asset
 * changed, so re-running the import produces byte-identical files.
 */
export async function importCaseFile(
  file: string,
  opts: ImportCaseOptions
): Promise<ImportCaseResult> {
  const packAssetsDir = opts.packAssetsDir ?? CASE_PACK_ASSETS_DIR;
  const deckAssetsDir = opts.deckAssetsDir ?? CASE_ASSETS_DIR;
  const fail = (errors: string[]): ImportCaseResult => ({
    file,
    deck: null,
    changed: false,
    assets: [],
    errors: errors.map((e) => `${file}: ${e}`),
  });

  const parsed = parseCasePack(await Bun.file(file).text(), { fileName: file });
  if (!parsed.value) return fail(parsed.errors);
  const pack = parsed.value;

  const draft = casePackToDeck(pack, {
    version: "",
    assetExists: (_deckId, src) => resolvePackAsset(pack, src, packAssetsDir) !== null,
  });
  if (!draft.deck) {
    // The validator names the deck folder; point authors at the pack folder instead.
    return fail(
      draft.errors.map((e) =>
        e.replace(
          /was not found at public\/decks\/assets\/[^/]+\/(.+)$/,
          `was not found in ${packAssetsDir}/${pack.pack}/ (or its ${pack.language}/ folder): $1`
        )
      )
    );
  }

  const deckId = draft.deck.deckId;
  const assets = deckAssetPaths(draft.deck);
  const copies = assets.map((src) => ({
    from: resolvePackAsset(pack, src, packAssetsDir)!,
    to: join(deckAssetsDir, deckId, src),
  }));
  const staleAssets: typeof copies = [];
  for (const copy of copies) {
    if (!(await sameBytes(copy.from, copy.to))) staleAssets.push(copy);
  }

  const deckPath = `${opts.outputDir}/${deckId}.json`;
  const existing = await readExistingDeck(deckPath);
  const changed =
    !existing || !sameCaseDeckContent(existing, draft.deck) || staleAssets.length > 0;
  const version =
    !changed && existing ? existing.version : (opts.now?.() ?? new Date()).toISOString();
  const deck: CaseDeck = { ...draft.deck, version };

  if (!opts.dryRun) {
    for (const copy of staleAssets) {
      await mkdir(dirname(copy.to), { recursive: true });
      await Bun.write(copy.to, Bun.file(copy.from));
    }
    await Bun.write(deckPath, serializeCaseDeck(deck));
    await updateDeckIndexFile(`${opts.outputDir}/index.json`, [
      { deck, recommended: draft.recommended },
    ]);
  }
  return { file, deck, changed, assets, errors: [] };
}
