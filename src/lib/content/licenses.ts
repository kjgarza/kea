/**
 * Content licence policy (issue #58). Pure (no fs, no `@/` imports) so the
 * scripts, the app (credits UI) and the Worker share one allow-list.
 * `scripts/lib/licenses.ts` re-exports it.
 *
 * Rules (see docs/content-sources.md):
 * - Only licences in `LICENSES` are accepted. Anything else is an error.
 * - External content (`origin: "adapted"`) must name its `license` and `url`.
 * - Licences that require attribution (CC BY, CC BY-SA, MIT) need an `author`.
 * - Share-alike content lives in its own decks: when any card in a deck is
 *   share-alike, every card must be share-alike and the deck licence must be
 *   that share-alike licence (same family, same or later version). A card
 *   under an older version is only accepted when it is `modified` (an
 *   adaptation may use a later version of the same licence).
 *
 * Licence ids follow SPDX where SPDX has one. `PDM-1.0` (Creative Commons
 * Public Domain Mark) is not an SPDX id; it marks works in the public domain.
 */
import type { ContentOrigin, ContentSource } from "../../types/card";

export interface LicenseInfo {
  id: string;
  /** Short human name, shown in the credits. */
  name: string;
  /** Licence deed. */
  url: string;
  /** Adaptations must carry the same licence. */
  shareAlike: boolean;
  /** The author must be credited. */
  attribution: boolean;
  /** Family for share-alike compatibility, e.g. "CC-BY-SA". */
  family: string;
  /** Version number for compatibility (0 when not versioned). */
  version: number;
}

const cc = (
  id: string,
  name: string,
  path: string,
  family: string,
  version: number,
  shareAlike: boolean
): LicenseInfo => ({
  id,
  name,
  url: `https://creativecommons.org/${path}`,
  shareAlike,
  attribution: family !== "CC0" && family !== "PDM",
  family,
  version,
});

/** The allow-list. Order is display order in docs. */
export const LICENSES: readonly LicenseInfo[] = [
  cc("PDM-1.0", "Public domain", "publicdomain/mark/1.0/", "PDM", 1, false),
  cc("CC0-1.0", "CC0 1.0", "publicdomain/zero/1.0/", "CC0", 1, false),
  cc("CC-BY-3.0", "CC BY 3.0", "licenses/by/3.0/", "CC-BY", 3, false),
  cc("CC-BY-4.0", "CC BY 4.0", "licenses/by/4.0/", "CC-BY", 4, false),
  cc("CC-BY-SA-2.5", "CC BY-SA 2.5", "licenses/by-sa/2.5/", "CC-BY-SA", 2.5, true),
  cc("CC-BY-SA-3.0", "CC BY-SA 3.0", "licenses/by-sa/3.0/", "CC-BY-SA", 3, true),
  cc("CC-BY-SA-4.0", "CC BY-SA 4.0", "licenses/by-sa/4.0/", "CC-BY-SA", 4, true),
  {
    id: "MIT",
    name: "MIT",
    url: "https://opensource.org/license/mit",
    shareAlike: false,
    attribution: true,
    family: "MIT",
    version: 0,
  },
];

export const LICENSE_IDS: readonly string[] = LICENSES.map((l) => l.id);

export const CONTENT_ORIGINS: readonly ContentOrigin[] = [
  "generated",
  "original",
  "transcribed",
  "adapted",
];

/** Origins that mean the text came from somewhere else. */
export const EXTERNAL_ORIGINS: readonly ContentOrigin[] = ["adapted"];

export function getLicense(id: string | undefined): LicenseInfo | undefined {
  return id === undefined ? undefined : LICENSES.find((l) => l.id === id);
}

export function isAllowedLicense(id: unknown): id is string {
  return typeof id === "string" && LICENSE_IDS.includes(id);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** True for http(s) URLs only (the credits UI links to them). */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Card source

/**
 * Check a card's `source` object. Returns messages without a card prefix
 * (callers add their own), e.g. `'source.license' "GPL-3.0" is not allowed…`.
 */
export function contentSourceErrors(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return [`'source' must be an object with an 'origin'`];
  }
  const source = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (!CONTENT_ORIGINS.includes(source.origin as ContentOrigin)) {
    errors.push(`'source.origin' must be one of ${CONTENT_ORIGINS.join(", ")}`);
  }
  for (const field of ["pack", "ref", "author"] as const) {
    if (source[field] !== undefined && !isNonEmptyString(source[field])) {
      errors.push(`'source.${field}' must be a non-empty string`);
    }
  }
  if (source.url !== undefined && !isHttpUrl(source.url)) {
    errors.push(`'source.url' must be an http(s) URL`);
  }
  if (source.modified !== undefined && typeof source.modified !== "boolean") {
    errors.push(`'source.modified' must be true or false`);
  }
  if (source.license !== undefined && !isAllowedLicense(source.license)) {
    errors.push(
      `'source.license' "${String(source.license)}" is not allowed; use one of ${LICENSE_IDS.join(", ")}`
    );
  }
  if (EXTERNAL_ORIGINS.includes(source.origin as ContentOrigin)) {
    if (source.license === undefined) {
      errors.push(`'source.license' is required for ${String(source.origin)} content`);
    }
    if (source.url === undefined) {
      errors.push(`'source.url' is required for ${String(source.origin)} content`);
    }
  }
  const license = getLicense(source.license as string | undefined);
  if (license?.attribution && !isNonEmptyString(source.author)) {
    errors.push(`'source.author' is required by ${license.name}`);
  }
  return errors;
}

/** A validated `source` with fields in a fixed order and undefined ones left out. */
export function normalizeContentSource(source: ContentSource): ContentSource {
  return {
    origin: source.origin,
    ...(source.pack !== undefined ? { pack: source.pack } : {}),
    ...(source.ref !== undefined ? { ref: source.ref } : {}),
    ...(source.license !== undefined ? { license: source.license } : {}),
    ...(source.author !== undefined ? { author: source.author.trim() } : {}),
    ...(source.url !== undefined ? { url: source.url } : {}),
    ...(source.modified !== undefined ? { modified: source.modified } : {}),
  };
}

// ---------------------------------------------------------------------------
// Deck licensing

export interface DeckLicensing {
  license?: string;
  attribution?: string;
}

/** Check deck-level `license` / `attribution` fields. */
export function deckLicenseFieldErrors(deck: DeckLicensing): string[] {
  const errors: string[] = [];
  if (deck.license !== undefined && !isAllowedLicense(deck.license)) {
    errors.push(
      `'license' "${String(deck.license)}" is not allowed; use one of ${LICENSE_IDS.join(", ")}`
    );
  }
  if (deck.attribution !== undefined && !isNonEmptyString(deck.attribution)) {
    errors.push(`'attribution' must be a non-empty string`);
  }
  return errors;
}

interface LicensedCard {
  cardId: string;
  source?: Pick<ContentSource, "license" | "modified">;
}

/**
 * Share-alike rule for a whole deck. Errors name the deck and the cards, e.g.
 * `deck "x": card "a" is CC BY-SA 4.0 (share-alike) but card "b" is not; keep
 * share-alike content in its own deck`.
 */
export function deckLicenseErrors(
  deck: DeckLicensing & { deckId: string; cards: readonly LicensedCard[] }
): string[] {
  const label = `deck "${deck.deckId}"`;
  const errors = deckLicenseFieldErrors(deck).map((e) => `${label}: ${e}`);
  const deckLicense = getLicense(deck.license);
  const licenseOf = (card: LicensedCard) => getLicense(card.source?.license);
  const shareAlike = deck.cards.filter((c) => licenseOf(c)?.shareAlike);

  if (shareAlike.length === 0) {
    return errors;
  }

  const sa = shareAlike[0];
  const saLicense = licenseOf(sa)!;
  const others = deck.cards.filter((c) => !licenseOf(c)?.shareAlike);
  if (others.length > 0) {
    const names = others.slice(0, 3).map((c) => `"${c.cardId}"`).join(", ");
    const more = others.length > 3 ? ` and ${others.length - 3} more` : "";
    errors.push(
      `${label}: card "${sa.cardId}" is ${saLicense.name} (share-alike) but card${others.length > 1 ? "s" : ""} ${names}${more} ${others.length > 1 ? "are" : "is"} not; keep share-alike content in its own deck`
    );
  }

  if (!deckLicense) {
    errors.push(
      `${label}: contains share-alike cards (${saLicense.name}), so the deck 'license' must be set to that share-alike licence`
    );
    return errors;
  }
  if (!deckLicense.shareAlike) {
    errors.push(
      `${label}: contains share-alike cards (${saLicense.name}) but the deck licence is ${deckLicense.name}; share-alike content needs a share-alike deck licence`
    );
    return errors;
  }

  for (const card of shareAlike) {
    const lic = licenseOf(card)!;
    if (lic.family !== deckLicense.family) {
      errors.push(
        `${label}: card "${card.cardId}" is ${lic.name}, which cannot be relicensed as ${deckLicense.name}`
      );
    } else if (lic.version > deckLicense.version) {
      errors.push(
        `${label}: card "${card.cardId}" is ${lic.name}, newer than the deck licence ${deckLicense.name}`
      );
    } else if (lic.version < deckLicense.version && card.source?.modified !== true) {
      errors.push(
        `${label}: card "${card.cardId}" is ${lic.name}; it can only ship under ${deckLicense.name} as an adaptation ('modified: true')`
      );
    }
  }
  return errors;
}

/**
 * The deck licence a set of share-alike cards needs: the latest version of
 * their family. `undefined` when no card is share-alike.
 */
export function requiredShareAlikeLicense(licenseIds: readonly (string | undefined)[]): string | undefined {
  let best: LicenseInfo | undefined;
  for (const id of licenseIds) {
    const lic = getLicense(id);
    if (lic?.shareAlike && (!best || lic.version > best.version)) best = lic;
  }
  if (!best) return undefined;
  const family = LICENSES.filter((l) => l.family === best!.family);
  return family.reduce((a, b) => (b.version > a.version ? b : a)).id;
}

// ---------------------------------------------------------------------------
// Stack Exchange

/**
 * Licence of a Stack Exchange post by its creation date (Stack Exchange's
 * published cut-overs, UTC): before 2011-04-08 CC BY-SA 2.5, before
 * 2018-05-02 CC BY-SA 3.0, otherwise CC BY-SA 4.0. The API's own
 * `content_license` wins when present (see `stackExchangeLicense`).
 */
export function stackExchangeLicenseByDate(created: Date): string {
  const t = created.getTime();
  if (t < Date.UTC(2011, 3, 8)) return "CC-BY-SA-2.5";
  if (t < Date.UTC(2018, 4, 2)) return "CC-BY-SA-3.0";
  return "CC-BY-SA-4.0";
}

/** Map the API's `content_license` ("CC BY-SA 4.0") to our id; null when unknown. */
export function stackExchangeLicense(contentLicense: unknown): string | null {
  if (typeof contentLicense !== "string") return null;
  const id = contentLicense.trim().replace(/\s+/g, "-").toUpperCase();
  const withVersion = /\d$/.test(id) && !/\.\d$/.test(id) ? `${id}.0` : id;
  return isAllowedLicense(withVersion) ? withVersion : null;
}
