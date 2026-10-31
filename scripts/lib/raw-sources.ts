/**
 * Raw items from external sources (#58), as written by the importers to
 * `decks/sources/<source>/*.json` and read by `scripts/normalize-sources.ts`.
 *
 * Raw items keep the source text plus everything the credits need (post or
 * page URL, author, licence). They are a cache for human review and LLM
 * normalisation; nothing in the app reads them. Third-party raw items are
 * not committed (decks/sources/ is git-ignored); only drafts that went
 * through review are.
 *
 * Determinism: raw JSON has a fixed key order and no fetch timestamps, so
 * re-running an importer on the same upstream data writes identical files.
 */

export const RAW_SOURCES_DIR = "decks/sources";
export const SOURCE_DRAFTS_DIR = "decks/drafts/sources";

export interface RawAuthor {
  role: "question" | "answer" | "author";
  name: string;
  url?: string;
  license: string; // licence id of this author's part
}

/** A puzzle-shaped item (question + accepted answer). */
export interface RawPuzzleItem {
  kind: "puzzle";
  source: "stackexchange";
  id: string; // e.g. "puzzling-1001"
  site: string; // e.g. "puzzling"
  questionId: number;
  answerId: number;
  title: string;
  setup: string; // question body as plain text
  solution: string; // accepted answer as plain text
  url: string; // question URL
  answerUrl: string;
  authors: RawAuthor[];
  /** Licence for a card combining both parts (latest share-alike version). */
  license: string;
  /** Credit line for the card. */
  credit: string;
  score: number;
  created: string; // ISO, question creation
  tags: string[];
  /** Reasons a reviewer should look twice (e.g. names a commercial source). */
  flags: string[];
}

/** A story-shaped item (a whole public-domain or openly licensed text). */
export interface RawStoryItem {
  kind: "story";
  source: "story";
  id: string; // slug
  title: string;
  author: string;
  url: string;
  license: string;
  language: string;
  text: string;
  flags: string[];
}

export type RawSourceItem = RawPuzzleItem | RawStoryItem;

/** Stable JSON for a raw item (2-space indent, trailing newline). */
export function serializeRawItem(item: RawSourceItem): string {
  return JSON.stringify(item, null, 2) + "\n";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Light structural check when reading raw files back. */
export function parseRawItem(value: unknown, fileName = "raw item"): RawSourceItem {
  if (!isRecord(value) || (value.kind !== "puzzle" && value.kind !== "story")) {
    throw new Error(`${fileName}: not a raw source item (expected kind "puzzle" or "story")`);
  }
  for (const field of ["id", "title", "url", "license"]) {
    if (typeof value[field] !== "string" || !(value[field] as string).trim()) {
      throw new Error(`${fileName}: '${field}' is missing`);
    }
  }
  if (value.kind === "puzzle") {
    for (const field of ["setup", "solution", "credit"]) {
      if (typeof value[field] !== "string") throw new Error(`${fileName}: '${field}' is missing`);
    }
  } else if (typeof value.text !== "string" || typeof value.author !== "string") {
    throw new Error(`${fileName}: 'text' and 'author' are required for stories`);
  }
  return value as unknown as RawSourceItem;
}

// ---------------------------------------------------------------------------
// Known commercial sources (never import; see docs/content-sources.md)

const COMMERCIAL_MARKERS: readonly [RegExp, string][] = [
  [/\bblack stories\b/i, "mentions Black Stories (commercial)"],
  [/\bhistorias negras\b/i, "mentions Historias negras (commercial)"],
  [/\bsloane\b/i, "mentions Paul Sloane (commercial books)"],
  [/\bmachale\b/i, "mentions Des MacHale (commercial books)"],
  [/\bbrecher\b/i, "mentions Erwin Brecher (commercial books)"],
  [/\bdetective stories\b/i, "mentions Detective Stories (commercial game)"],
  [/\b(from|in) (a|the|my) (book|puzzle book)\b/i, "says it comes from a book"],
  [/\bnot (my|mine|original)\b|\bheard (it|this)\b/i, "the poster may not be its author"],
];

/** Reasons the text may not be the poster's to license. */
export function commercialSourceFlags(...texts: string[]): string[] {
  const text = texts.join("\n");
  return COMMERCIAL_MARKERS.filter(([re]) => re.test(text)).map(([, reason]) => reason);
}
