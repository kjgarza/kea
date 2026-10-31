import { parse, stringify } from "yaml";
import type { Difficulty } from "../../types/game";
import type {
  SituationCard,
  SituationKeyFact,
  SituationOrigin,
} from "../../types/card";
import type { SituationDeck } from "../../types/deck";
import { validateSituationCard } from "./situation-validator";
import {
  CONTENT_ORIGINS,
  LICENSE_IDS,
  deckLicenseErrors,
  isAllowedLicense,
  isHttpUrl,
} from "../content/licenses";

/**
 * Hand-written situation puzzle packs (issue #27, spec §5.4 F20).
 *
 * A pack lives in `decks/puzzles/<pack>-<lang>.yaml` and is imported into
 * `public/decks/<deckId>.json` by `scripts/import-puzzles.ts`.
 *
 * This module is pure (no filesystem, no Bun APIs) so other producers of the
 * same YAML — e.g. the photo quick-add Worker (#38) — can import it:
 *
 * - `parsePuzzlePack(text, {fileName?})` → `{ pack, errors }` (YAML → typed pack)
 * - `serializePuzzlePack(pack)` → YAML text in the canonical format
 * - `puzzlePackToDeck(pack, {version})` → `{ deck, errors }` (ids + shared validator)
 * - `generateId`/`slugify` → the deterministic id scheme (card ids: title slug,
 *   max 40 chars; key-fact ids: fact-text slug, max 32 chars; `-2`, `-3`… on clashes)
 *
 * Determinism: card ids and key-fact ids are derived from content (slugs of
 * titles / fact text), never from randomness or the clock, so importing the
 * same YAML twice yields identical JSON. The deck `version` is supplied by
 * the caller (the importer keeps the existing one when nothing changed).
 */

export const PUZZLE_PACK_DIR = "decks/puzzles";

const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
const ORIGINS: readonly SituationOrigin[] = CONTENT_ORIGINS;

/** A key fact as written in YAML: a bare string, or `{ id?, text }`. */
export type PuzzleKeyFactInput = string | { id?: string; text: string };

/** One puzzle as written in YAML. Only title/setup/solution/keyFacts/hints are required. */
export interface PuzzleInput {
  id?: string; // card id; generated from the title when missing
  title: string;
  setup: string;
  solution: string;
  keyFacts: PuzzleKeyFactInput[];
  hints: string[];
  difficulty?: Difficulty;
  contentWarnings?: string[];
  estMinutes?: number;
  origin?: SituationOrigin; // defaults to the pack origin
  ref?: string; // e.g. book + page for transcribed puzzles, or a post id
  // Provenance (#58); required for `origin: adapted` (license + url)
  license?: string; // licence id, e.g. "CC-BY-SA-4.0"
  author?: string;
  url?: string;
  modified?: boolean;
}

/** A whole pack (one YAML file). */
export interface PuzzlePack {
  pack: string; // slug, e.g. "kitchen-table"
  language: string; // e.g. "en", "es"
  name: string;
  deckId?: string; // defaults to `<pack>-<language>-situation`
  difficulty?: Difficulty; // default "medium"
  topics?: string[]; // default []
  nsfw?: boolean; // default false
  recommended?: boolean; // default false
  origin?: SituationOrigin; // default for puzzles; default "original"
  license?: string; // deck licence (#58); share-alike puzzles require it
  attribution?: string; // deck credit line shown on the deck page
  puzzles: PuzzleInput[];
}

export interface ParseResult<T> {
  value: T | null;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Ids

/** Lower-case ASCII slug ("¿Qué pasó?" → "que-paso"), cut at a word boundary. */
export function slugify(text: string, maxLength = 40): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= maxLength) return slug;
  const cut = slug.slice(0, maxLength + 1);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 0 ? cut.slice(0, lastDash) : slug.slice(0, maxLength)).replace(/-+$/, "");
}

/**
 * A deterministic id from `text` that is not in `taken` (`slug`, `slug-2`, …).
 * Falls back to `fallback` when the text has no slug-able characters.
 * Adds the result to `taken`.
 */
export function generateId(
  text: string,
  taken: Set<string>,
  fallback: string,
  maxLength = 40
): string {
  const base = slugify(text, maxLength) || fallback;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

export function defaultDeckId(pack: Pick<PuzzlePack, "pack" | "language">): string {
  return `${pack.pack}-${pack.language}-situation`;
}

// ---------------------------------------------------------------------------
// YAML → pack (structural checks only; puzzle content is checked by the shared validator)

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Split `kitchen-table-en.yaml` into `{ pack: "kitchen-table", language: "en" }`. */
export function packNameFromFileName(fileName: string): { pack: string; language: string } | null {
  const base = fileName.split(/[\\/]/).pop()!.replace(/\.ya?ml$/i, "");
  const match = base.match(/^(.+)-([a-z]{2}(?:-[A-Za-z]{2})?)$/);
  return match ? { pack: match[1], language: match[2] } : null;
}

/** Human label for a puzzle in error messages: `puzzles[2] "The Bus" (id "x")`. */
export function puzzleLabel(index: number, raw: unknown, cardId?: string): string {
  let label = `puzzles[${index}]`;
  if (isRecord(raw) && typeof raw.title === "string" && raw.title.trim()) {
    label += ` "${raw.title.trim()}"`;
  }
  if (cardId) label += ` (id "${cardId}")`;
  return label;
}

/**
 * Parse pack YAML. Checks pack metadata and the shape of `puzzles`; puzzle
 * fields are left for `puzzlePackToDeck` (which runs the shared validator).
 * When `fileName` is given, `pack`/`language` default from it and must match it.
 */
export function parsePuzzlePack(text: string, opts: { fileName?: string } = {}): ParseResult<PuzzlePack> {
  const errors: string[] = [];
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (err) {
    return { value: null, errors: [`invalid YAML: ${(err as Error).message}`] };
  }
  if (!isRecord(doc)) {
    return { value: null, errors: ["the file must be a YAML mapping with pack metadata and 'puzzles'"] };
  }

  const fromFile = opts.fileName ? packNameFromFileName(opts.fileName) : null;
  if (opts.fileName && !fromFile) {
    errors.push(`file name "${opts.fileName}" must look like <pack>-<lang>.yaml`);
  }
  const pack = doc.pack ?? fromFile?.pack;
  const language = doc.language ?? fromFile?.language;

  if (typeof pack !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(pack)) {
    errors.push(`'pack' must be a lower-case slug (letters, digits, dashes)`);
  } else if (fromFile && pack !== fromFile.pack) {
    errors.push(`'pack' is "${pack}" but the file name says "${fromFile.pack}"`);
  }
  if (typeof language !== "string" || !/^[a-z]{2}(-[A-Za-z]{2})?$/.test(language)) {
    errors.push(`'language' must be a language code such as "en" or "es"`);
  } else if (fromFile && language !== fromFile.language) {
    errors.push(`'language' is "${language}" but the file name says "${fromFile.language}"`);
  }
  if (typeof doc.name !== "string" || !doc.name.trim()) {
    errors.push(`'name' is required and must be a non-empty string`);
  }
  if (doc.deckId !== undefined && (typeof doc.deckId !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(doc.deckId))) {
    errors.push(`'deckId' must be a lower-case slug`);
  }
  if (doc.difficulty !== undefined && !DIFFICULTIES.includes(doc.difficulty as Difficulty)) {
    errors.push(`'difficulty' must be one of ${DIFFICULTIES.join(", ")}`);
  }
  if (doc.topics !== undefined && (!Array.isArray(doc.topics) || doc.topics.some((t) => typeof t !== "string"))) {
    errors.push(`'topics' must be a list of strings`);
  }
  for (const field of ["nsfw", "recommended"] as const) {
    if (doc[field] !== undefined && typeof doc[field] !== "boolean") {
      errors.push(`'${field}' must be true or false`);
    }
  }
  if (doc.origin !== undefined && !ORIGINS.includes(doc.origin as SituationOrigin)) {
    errors.push(`'origin' must be one of ${ORIGINS.join(", ")}`);
  }
  if (doc.license !== undefined && !isAllowedLicense(doc.license)) {
    errors.push(`'license' "${String(doc.license)}" is not allowed; use one of ${LICENSE_IDS.join(", ")}`);
  }
  if (doc.attribution !== undefined && (typeof doc.attribution !== "string" || !doc.attribution.trim())) {
    errors.push(`'attribution' must be a non-empty string`);
  }
  if (!Array.isArray(doc.puzzles) || doc.puzzles.length === 0) {
    errors.push(`'puzzles' is required and must be a non-empty list`);
  } else {
    doc.puzzles.forEach((p: unknown, i: number) => {
      if (!isRecord(p)) {
        errors.push(`${puzzleLabel(i, p)}: must be a mapping with title, setup, solution, keyFacts and hints`);
        return;
      }
      const label = puzzleLabel(i, p);
      if (p.id !== undefined && (typeof p.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id))) {
        errors.push(`${label}: 'id' must be a lower-case slug`);
      }
      if (p.origin !== undefined && !ORIGINS.includes(p.origin as SituationOrigin)) {
        errors.push(`${label}: 'origin' must be one of ${ORIGINS.join(", ")}`);
      }
      for (const field of ["ref", "author", "license"] as const) {
        if (p[field] !== undefined && typeof p[field] !== "string") {
          errors.push(`${label}: '${field}' must be a string`);
        }
      }
      if (p.url !== undefined && !isHttpUrl(p.url)) {
        errors.push(`${label}: 'url' must be an http(s) URL`);
      }
      if (p.modified !== undefined && typeof p.modified !== "boolean") {
        errors.push(`${label}: 'modified' must be true or false`);
      }
      if (Array.isArray(p.keyFacts)) {
        p.keyFacts.forEach((f: unknown, j: number) => {
          if (typeof f === "string") return;
          if (!isRecord(f) || typeof f.text !== "string") {
            errors.push(`${label}: keyFacts[${j}] must be a string or a mapping with 'text' (and optional 'id')`);
          } else if (f.id !== undefined && typeof f.id !== "string") {
            errors.push(`${label}: keyFacts[${j}].id must be a string`);
          }
        });
      }
    });
  }

  if (errors.length > 0) return { value: null, errors };
  return {
    value: { ...(doc as unknown as PuzzlePack), pack: pack as string, language: language as string },
    errors: [],
  };
}

// ---------------------------------------------------------------------------
// pack → deck

/** Fill in card ids and key-fact ids deterministically. Explicit ids always win. */
export function assignPuzzleIds(pack: PuzzlePack): PuzzleInput[] {
  const cardIds = new Set(pack.puzzles.map((p) => p.id).filter((id): id is string => !!id));
  return pack.puzzles.map((puzzle, i) => {
    const id = puzzle.id ?? generateId(puzzle.title ?? "", cardIds, `puzzle-${String(i + 1).padStart(3, "0")}`);
    const facts = Array.isArray(puzzle.keyFacts) ? puzzle.keyFacts : [];
    const factIds = new Set(
      facts.map((f) => (typeof f === "string" ? undefined : f?.id)).filter((x): x is string => !!x)
    );
    const keyFacts = facts.map((f, j) => {
      const text = typeof f === "string" ? f : f.text;
      const factId =
        typeof f !== "string" && f.id ? f.id : generateId(text ?? "", factIds, `f${j + 1}`, 32);
      return { id: factId, text };
    });
    return { ...puzzle, id, keyFacts };
  });
}

export interface PackToDeckResult {
  deck: SituationDeck | null;
  recommended: boolean;
  errors: string[];
}

/**
 * Turn a parsed pack into a deck, running every puzzle through the shared
 * `validateSituationCard`. Errors name the puzzle (index, title, id) and the
 * field. Nothing is returned unless every puzzle is valid.
 */
export function puzzlePackToDeck(pack: PuzzlePack, opts: { version: string }): PackToDeckResult {
  const errors: string[] = [];
  const cards: SituationCard[] = [];
  const setups = new Map<string, string>();
  const packOrigin = pack.origin ?? "original";

  assignPuzzleIds(pack).forEach((puzzle, i) => {
    const raw = pack.puzzles[i];
    const cardId = puzzle.id!;
    const label = puzzleLabel(i, raw, cardId);
    const candidate = {
      title: puzzle.title,
      setup: puzzle.setup,
      solution: puzzle.solution,
      keyFacts: puzzle.keyFacts,
      hints: puzzle.hints,
      difficulty: puzzle.difficulty,
      contentWarnings: puzzle.contentWarnings,
      estMinutes: puzzle.estMinutes,
      source: {
        origin: puzzle.origin ?? packOrigin,
        pack: pack.pack,
        ...(puzzle.ref !== undefined ? { ref: puzzle.ref } : {}),
        ...(puzzle.license !== undefined ? { license: puzzle.license } : {}),
        ...(puzzle.author !== undefined ? { author: puzzle.author } : {}),
        ...(puzzle.url !== undefined ? { url: puzzle.url } : {}),
        ...(puzzle.modified !== undefined ? { modified: puzzle.modified } : {}),
      },
    };
    const prefix = `situation card "${cardId}": `;
    const result = validateSituationCard(candidate, cardId);
    if (!result.valid || !result.card) {
      for (const e of result.errors) {
        errors.push(`${label}: ${e.startsWith(prefix) ? e.slice(prefix.length) : e}`);
      }
      return;
    }
    const card = result.card as SituationCard;
    const setupKey = card.setup.toLowerCase();
    const dupOf = setups.get(setupKey);
    if (dupOf) {
      errors.push(`${label}: 'setup' duplicates puzzle "${dupOf}"`);
      return;
    }
    setups.set(setupKey, cardId);
    cards.push(card);
  });

  if (errors.length > 0) return { deck: null, recommended: false, errors };

  const deck: SituationDeck = {
    schemaVersion: 1,
    deckId: pack.deckId ?? defaultDeckId(pack),
    version: opts.version,
    name: pack.name.trim(),
    gameType: "situation",
    language: pack.language,
    difficulty: pack.difficulty ?? "medium",
    topics: pack.topics ?? [],
    nsfw: pack.nsfw ?? false,
    ...(pack.license !== undefined ? { license: pack.license } : {}),
    ...(pack.attribution !== undefined ? { attribution: pack.attribution.trim() } : {}),
    cards,
  };
  const licenseErrors = deckLicenseErrors(deck);
  if (licenseErrors.length > 0) return { deck: null, recommended: false, errors: licenseErrors };
  return { deck, recommended: pack.recommended ?? false, errors: [] };
}

/** Deck JSON as written to disk (stable key order from `puzzlePackToDeck`). */
export function serializeDeck(deck: SituationDeck): string {
  return JSON.stringify(deck, null, 2) + "\n";
}

/** True when two decks are identical apart from `version`. */
export function sameDeckContent(a: SituationDeck, b: SituationDeck): boolean {
  return JSON.stringify({ ...a, version: "" }) === JSON.stringify({ ...b, version: "" });
}

// ---------------------------------------------------------------------------
// pack → YAML (for producers such as photo quick-add, #38)

/**
 * Canonical YAML for a pack: metadata first, then puzzles with fields in a
 * fixed order; undefined fields are omitted. Round-trips through `parsePuzzlePack`.
 */
export function serializePuzzlePack(pack: PuzzlePack): string {
  const clean = <T extends object>(o: T) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
  const ordered = clean({
    pack: pack.pack,
    language: pack.language,
    name: pack.name,
    deckId: pack.deckId,
    difficulty: pack.difficulty,
    topics: pack.topics,
    nsfw: pack.nsfw,
    recommended: pack.recommended,
    origin: pack.origin,
    license: pack.license,
    attribution: pack.attribution,
    puzzles: pack.puzzles.map((p) =>
      clean({
        id: p.id,
        title: p.title,
        setup: p.setup,
        solution: p.solution,
        keyFacts: p.keyFacts.map((f) => (typeof f === "string" ? f : clean({ id: f.id, text: f.text }))),
        hints: p.hints,
        difficulty: p.difficulty,
        contentWarnings: p.contentWarnings,
        estMinutes: p.estMinutes,
        origin: p.origin,
        ref: p.ref,
        license: p.license,
        author: p.author,
        url: p.url,
        modified: p.modified,
      })
    ),
  });
  return stringify(ordered, { lineWidth: 0 });
}

/** Convenience for producers: the key facts of a deck card back as YAML input. */
export function cardToPuzzleInput(card: SituationCard): PuzzleInput {
  const facts: SituationKeyFact[] = card.keyFacts;
  return {
    id: card.cardId,
    title: card.title,
    setup: card.setup,
    solution: card.solution,
    keyFacts: facts.map((f) => ({ id: f.id, text: f.text })),
    hints: card.hints,
    difficulty: card.difficulty,
    contentWarnings: card.contentWarnings,
    estMinutes: card.estMinutes,
    origin: card.source?.origin,
    ref: card.source?.ref,
    license: card.source?.license,
    author: card.source?.author,
    url: card.source?.url,
    modified: card.source?.modified,
  };
}
