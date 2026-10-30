import { existsSync, statSync } from "fs";
import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import type { AssetExists } from "./validators";

/**
 * File-system side of case assets: the validator takes an injected
 * `AssetExists` so it stays pure; scripts and tests that read the real
 * repository use this one.
 */

/** Where case assets live on disk: public/decks/assets/<deckId>/<src>. */
export const CASE_ASSETS_DIR = "public/decks/assets";

export function caseAssetFilePath(
  deckId: string,
  src: string,
  root: string = CASE_ASSETS_DIR
): string {
  return join(root, deckId, src);
}

/** An `AssetExists` that checks for a regular file under `root`. */
export function createFileAssetExists(root: string = CASE_ASSETS_DIR): AssetExists {
  return (deckId, src) => {
    const path = caseAssetFilePath(deckId, src, root);
    try {
      return existsSync(path) && statSync(path).isFile();
    } catch {
      return false;
    }
  };
}

/**
 * Copy the evidence files `srcs` from one deck's asset folder to another's,
 * keeping the same relative paths (translations share `src` values, #36).
 * Files that already exist at the target are kept (they may be localised)
 * unless `overwrite` is set. Returns the paths that were copied and the ones
 * missing at the source.
 */
export async function copyDeckAssets(
  fromDeckId: string,
  toDeckId: string,
  srcs: readonly string[],
  { root = CASE_ASSETS_DIR, overwrite = false }: { root?: string; overwrite?: boolean } = {}
): Promise<{ copied: string[]; kept: string[]; missing: string[] }> {
  const copied: string[] = [];
  const kept: string[] = [];
  const missing: string[] = [];
  for (const src of [...new Set(srcs)].sort()) {
    const from = caseAssetFilePath(fromDeckId, src, root);
    const to = caseAssetFilePath(toDeckId, src, root);
    if (!existsSync(from)) {
      missing.push(src);
      continue;
    }
    if (!overwrite && existsSync(to)) {
      kept.push(src);
      continue;
    }
    await mkdir(dirname(to), { recursive: true });
    await Bun.write(to, Bun.file(from));
    copied.push(src);
  }
  return { copied, kept, missing };
}
