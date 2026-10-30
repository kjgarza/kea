import { existsSync, statSync } from "fs";
import { join } from "path";
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
