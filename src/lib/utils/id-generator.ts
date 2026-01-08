/**
 * Generate deterministic deck ID
 * Format: slug(name)-language-gameType
 */
export function generateDeckId(
  name: string,
  language: string,
  gameType: string
): string {
  const slug = slugify(name);
  return `${slug}-${language}-${gameType}`;
}

/**
 * Generate deterministic card ID (sync version using simple hash)
 * Format: shortHash(deckId + "::" + normalizedContent)
 */
export function generateCardId(
  deckId: string,
  content: Record<string, unknown>
): string {
  const normalized = normalizeContent(content);
  const input = `${deckId}::${normalized}`;
  const hash = simpleHash(input);
  return hash.slice(0, 12);
}

/**
 * Generate deterministic card ID (async version using SHA-256)
 * More secure but requires async context
 */
export async function generateCardIdAsync(
  deckId: string,
  content: Record<string, unknown>
): Promise<string> {
  const normalized = normalizeContent(content);
  const input = `${deckId}::${normalized}`;
  const hash = await sha256(input);
  return hash.slice(0, 12);
}

/**
 * Slugify a string for use in IDs
 * Converts to lowercase, removes special chars, replaces spaces with hyphens
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove non-word chars except spaces and hyphens
    .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with single hyphen
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Normalize content object for consistent hashing
 * Sorts keys alphabetically and stringifies
 */
function normalizeContent(content: Record<string, unknown>): string {
  const sorted = Object.keys(content)
    .sort()
    .reduce(
      (acc, key) => {
        acc[key] = content[key];
        return acc;
      },
      {} as Record<string, unknown>
    );

  return JSON.stringify(sorted).replace(/\s+/g, " ").trim();
}

/**
 * Simple string hash function (djb2)
 * Fast, deterministic, suitable for non-cryptographic IDs
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  // Convert to base36 for shorter, URL-safe string
  return Math.abs(hash >>> 0).toString(36);
}

/**
 * SHA-256 hash as base64url
 * More secure, requires Web Crypto API
 */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  // Convert to base64url (URL-safe base64)
  const base64 = btoa(String.fromCharCode(...hashArray));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
