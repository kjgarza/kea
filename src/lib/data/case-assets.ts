/**
 * Case file assets (images, PDFs, maps) live under
 * `public/decks/assets/<deckId>/`, and an evidence item's `src` is a path
 * relative to that folder (e.g. "photo-kitchen.svg" or "maps/street.png").
 * Pure helpers shared by the app, the validator and the scripts.
 */

/** Folder (relative to the site root) holding a deck's case assets. */
export const CASE_ASSETS_URL_PREFIX = "/decks/assets";

/**
 * Whether `src` is a safe relative path inside the deck's asset folder: no
 * absolute paths, URLs, backslashes, empty segments, "." or "..".
 */
export function isSafeAssetPath(src: string): boolean {
  if (src.length === 0 || src !== src.trim()) return false;
  if (src.startsWith("/") || src.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(src)) {
    return false;
  }
  return src.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/** Site-relative URL of an evidence file (prefix it with `withBasePath`). */
export function caseAssetPath(deckId: string, src: string): string {
  return `${CASE_ASSETS_URL_PREFIX}/${deckId}/${src}`;
}
