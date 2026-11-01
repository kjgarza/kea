import { parse, stringify } from "yaml";
import type { Difficulty } from "../../src/types/game";
import type { CaseCard, ContentOrigin, ContentSource, Evidence, EvidenceKind } from "../../src/types/card";
import type { CaseDeck } from "../../src/types/deck";
import { validateCaseCard, type AssetExists } from "./validators";
import { generateId, packNameFromFileName } from "./puzzle-pack";
import {
  CONTENT_ORIGINS,
  LICENSE_IDS,
  deckLicenseErrors,
  isAllowedLicense,
  isHttpUrl,
} from "./licenses";

/**
 * Hand-written case packs (issue #36, spec §5.4 F20).
 *
 * A pack lives in `decks/cases/<pack>-<lang>.yaml`; its evidence files live
 * in `decks/cases/assets/<pack>/` (shared by every language of the pack), and
 * a file in `decks/cases/assets/<pack>/<lang>/` overrides the shared one for
 * that language (e.g. a newspaper clipping with a translated caption). The
 * importer (`scripts/import-cases.ts`) writes `public/decks/<deckId>.json`
 * and copies the referenced files to `public/decks/assets/<deckId>/`, so all
 * languages of a case keep the same `src` paths.
 *
 * This module is pure (no filesystem, no Bun APIs): asset lookups are
 * injected as an `AssetExists`.
 *
 * Determinism: card ids come from the YAML (or the title slug), evidence and
 * question ids must be written out, and the deck `version` is supplied by the
 * caller, so importing the same YAML twice yields identical JSON.
 *
 * Walkthrough convention: an inline code span (`` `phone-log` ``) in the
 * walkthrough cites an evidence id. The importer rejects citations of ids
 * that do not exist, and `questions[].proof` (pack-only, not shipped) lists
 * the evidence that settles each answer; every proof id must be cited in the
 * walkthrough so the explanation and the fairness check stay in sync.
 */

export const CASE_PACK_DIR = "decks/cases";
export const CASE_PACK_ASSETS_DIR = `${CASE_PACK_DIR}/assets`;

const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface CaseEvidenceInput {
  id: string;
  title: string;
  kind: EvidenceKind;
  content?: string;
  src?: string;
  unlockAfter?: string[];
}

export interface CaseQuestionInput {
  id: string;
  prompt: string;
  answer: string;
  acceptedVariants?: string[]; // default []
  points?: number; // default 1
  /** Evidence ids that settle this answer. Checked, never shipped. */
  proof?: string[];
}

export interface CaseInput {
  id?: string; // card id; generated from the title when missing
  title: string;
  briefing: string;
  evidence: CaseEvidenceInput[];
  questions: CaseQuestionInput[];
  walkthrough: string;
  contentWarnings?: string[];
  estMinutes?: number;
  // Provenance (#58). A card `source` is written only when one of these is
  // set; `origin` then defaults to "original". `adapted` needs license + url.
  origin?: ContentOrigin;
  ref?: string;
  license?: string;
  author?: string;
  url?: string;
  modified?: boolean;
}

/** Pack-level provenance fields of a case, in YAML order. */
const CASE_SOURCE_FIELDS = ["origin", "ref", "license", "author", "url", "modified"] as const;

/** The card `source` for a case input, or undefined when it has none. */
export function caseInputSource(input: CaseInput, pack: string): ContentSource | undefined {
  if (CASE_SOURCE_FIELDS.every((f) => input[f] === undefined)) return undefined;
  return {
    origin: input.origin ?? "original",
    pack,
    ...(input.ref !== undefined ? { ref: input.ref } : {}),
    ...(input.license !== undefined ? { license: input.license } : {}),
    ...(input.author !== undefined ? { author: input.author } : {}),
    ...(input.url !== undefined ? { url: input.url } : {}),
    ...(input.modified !== undefined ? { modified: input.modified } : {}),
  };
}

export interface CasePack {
  pack: string;
  language: string;
  name: string;
  deckId?: string; // default `<pack>-<language>-case`
  difficulty?: Difficulty; // default "medium"
  topics?: string[];
  nsfw?: boolean;
  recommended?: boolean;
  license?: string; // deck licence (#58)
  attribution?: string; // deck credit line
  cases: CaseInput[];
}

export interface ParseResult<T> {
  value: T | null;
  errors: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function defaultCaseDeckId(pack: Pick<CasePack, "pack" | "language">): string {
  return `${pack.pack}-${pack.language}-case`;
}

/** `cases[0] "The Title" (id "x")` for error messages. */
export function caseLabel(index: number, raw: unknown, cardId?: string): string {
  let label = `cases[${index}]`;
  if (isRecord(raw) && typeof raw.title === "string" && raw.title.trim()) {
    label += ` "${raw.title.trim()}"`;
  }
  if (cardId) label += ` (id "${cardId}")`;
  return label;
}

// ---------------------------------------------------------------------------
// Walkthrough citations

/** Evidence ids cited in a walkthrough (inline code spans), in order, unique. */
export function walkthroughEvidenceRefs(walkthrough: string): string[] {
  const refs: string[] = [];
  for (const match of walkthrough.matchAll(/`([^`\n]+)`/g)) {
    const id = match[1].trim();
    if (!refs.includes(id)) refs.push(id);
  }
  return refs;
}

/** Cited ids that are not evidence ids of the case. */
export function unknownWalkthroughRefs(
  card: Pick<CaseCard, "walkthrough" | "evidence">
): string[] {
  const ids = new Set(card.evidence.map((e) => e.id));
  return walkthroughEvidenceRefs(card.walkthrough).filter((id) => !ids.has(id));
}

// ---------------------------------------------------------------------------
// YAML → pack (structure only; content goes through the shared validator)

/**
 * Parse pack YAML. When `fileName` is given, `pack`/`language` default from
 * it and must match it.
 */
export function parseCasePack(text: string, opts: { fileName?: string } = {}): ParseResult<CasePack> {
  const errors: string[] = [];
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (err) {
    return { value: null, errors: [`invalid YAML: ${(err as Error).message}`] };
  }
  if (!isRecord(doc)) {
    return { value: null, errors: ["the file must be a YAML mapping with pack metadata and 'cases'"] };
  }

  const fromFile = opts.fileName ? packNameFromFileName(opts.fileName) : null;
  if (opts.fileName && !fromFile) {
    errors.push(`file name "${opts.fileName}" must look like <pack>-<lang>.yaml`);
  }
  const pack = doc.pack ?? fromFile?.pack;
  const language = doc.language ?? fromFile?.language;

  if (typeof pack !== "string" || !SLUG.test(pack)) {
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
  if (doc.deckId !== undefined && (typeof doc.deckId !== "string" || !SLUG.test(doc.deckId))) {
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

  if (doc.license !== undefined && !isAllowedLicense(doc.license)) {
    errors.push(`'license' "${String(doc.license)}" is not allowed; use one of ${LICENSE_IDS.join(", ")}`);
  }
  if (doc.attribution !== undefined && (typeof doc.attribution !== "string" || !doc.attribution.trim())) {
    errors.push(`'attribution' must be a non-empty string`);
  }

  if (!Array.isArray(doc.cases) || doc.cases.length === 0) {
    errors.push(`'cases' is required and must be a non-empty list`);
  } else {
    doc.cases.forEach((c: unknown, i: number) => {
      const label = caseLabel(i, c);
      if (!isRecord(c)) {
        errors.push(`${label}: must be a mapping with title, briefing, evidence, questions and walkthrough`);
        return;
      }
      if (c.id !== undefined && (typeof c.id !== "string" || !SLUG.test(c.id))) {
        errors.push(`${label}: 'id' must be a lower-case slug`);
      }
      if (c.origin !== undefined && !CONTENT_ORIGINS.includes(c.origin as ContentOrigin)) {
        errors.push(`${label}: 'origin' must be one of ${CONTENT_ORIGINS.join(", ")}`);
      }
      for (const field of ["ref", "author", "license"] as const) {
        if (c[field] !== undefined && typeof c[field] !== "string") {
          errors.push(`${label}: '${field}' must be a string`);
        }
      }
      if (c.url !== undefined && !isHttpUrl(c.url)) {
        errors.push(`${label}: 'url' must be an http(s) URL`);
      }
      if (c.modified !== undefined && typeof c.modified !== "boolean") {
        errors.push(`${label}: 'modified' must be true or false`);
      }
      if (Array.isArray(c.evidence)) {
        c.evidence.forEach((e: unknown, j: number) => {
          if (isRecord(e) && (typeof e.id !== "string" || !SLUG.test(e.id))) {
            errors.push(`${label}: evidence[${j}].id is required and must be a lower-case slug`);
          }
        });
      }
      if (Array.isArray(c.questions)) {
        c.questions.forEach((q: unknown, j: number) => {
          if (!isRecord(q)) return;
          if (typeof q.id !== "string" || !SLUG.test(q.id)) {
            errors.push(`${label}: questions[${j}].id is required and must be a lower-case slug`);
          }
          if (
            q.proof !== undefined &&
            (!Array.isArray(q.proof) || q.proof.some((p) => typeof p !== "string"))
          ) {
            errors.push(`${label}: questions[${j}].proof must be a list of evidence ids`);
          }
        });
      }
    });
  }

  if (errors.length > 0) return { value: null, errors };
  return {
    value: { ...(doc as unknown as CasePack), pack: pack as string, language: language as string },
    errors: [],
  };
}

// ---------------------------------------------------------------------------
// pack → deck

/** Card ids: explicit ids win; missing ones come from the title slug. */
export function assignCaseIds(pack: CasePack): string[] {
  const taken = new Set(pack.cases.map((c) => c.id).filter((id): id is string => !!id));
  return pack.cases.map(
    (c, i) => c.id ?? generateId(c.title ?? "", taken, `case-${String(i + 1).padStart(3, "0")}`)
  );
}

/** The `src` paths a deck references (sorted, unique). */
export function deckAssetPaths(deck: Pick<CaseDeck, "cards">): string[] {
  const paths = new Set<string>();
  for (const card of deck.cards) {
    for (const e of card.evidence) if (e.src) paths.add(e.src);
  }
  return [...paths].sort();
}

export interface CasePackToDeckOptions {
  version: string;
  /**
   * Checks evidence files where the importer will read them from (the pack
   * asset folder), keyed by the target deck id. Omit to check shape only.
   */
  assetExists?: AssetExists;
}

export interface CasePackToDeckResult {
  deck: CaseDeck | null;
  recommended: boolean;
  errors: string[];
}

/**
 * Turn a parsed pack into a deck: the shared `validateCaseCard`, plus the
 * pack-level checks (walkthrough citations and question proofs). Nothing is
 * returned unless every case is valid.
 */
export function casePackToDeck(pack: CasePack, opts: CasePackToDeckOptions): CasePackToDeckResult {
  const errors: string[] = [];
  const cards: CaseCard[] = [];
  const titles = new Map<string, string>();
  const deckId = pack.deckId ?? defaultCaseDeckId(pack);
  const ids = assignCaseIds(pack);

  pack.cases.forEach((input, i) => {
    const cardId = ids[i];
    const label = caseLabel(i, input, cardId);
    const candidate = {
      type: "case",
      title: input.title,
      briefing: input.briefing,
      evidence: Array.isArray(input.evidence)
        ? input.evidence.map((e) =>
            isRecord(e)
              ? {
                  id: e.id,
                  title: e.title,
                  kind: e.kind,
                  ...(e.content !== undefined ? { content: e.content } : {}),
                  ...(e.src !== undefined ? { src: e.src } : {}),
                  ...(e.unlockAfter !== undefined ? { unlockAfter: e.unlockAfter } : {}),
                }
              : e
          )
        : input.evidence,
      questions: Array.isArray(input.questions)
        ? input.questions.map((q) =>
            isRecord(q)
              ? {
                  id: q.id,
                  prompt: q.prompt,
                  answer: q.answer,
                  acceptedVariants: q.acceptedVariants ?? [],
                  points: q.points ?? 1,
                }
              : q
          )
        : input.questions,
      walkthrough: input.walkthrough,
      contentWarnings: input.contentWarnings,
      estMinutes: input.estMinutes,
      source: caseInputSource(input, pack.pack),
    };
    const prefix = `case card "${cardId}": `;
    const result = validateCaseCard(candidate, cardId, {
      deckId,
      assetExists: opts.assetExists,
    });
    if (!result.valid || !result.card) {
      for (const e of result.errors) {
        errors.push(`${label}: ${e.startsWith(prefix) ? e.slice(prefix.length) : e}`);
      }
      return;
    }
    const card = result.card as CaseCard;

    for (const id of unknownWalkthroughRefs(card)) {
      errors.push(`${label}: walkthrough cites \`${id}\`, which is not an evidence id in this case`);
    }
    const cited = new Set(walkthroughEvidenceRefs(card.walkthrough));
    const evidenceIds = new Set(card.evidence.map((e) => e.id));
    input.questions.forEach((q, j) => {
      for (const id of q.proof ?? []) {
        if (!evidenceIds.has(id)) {
          errors.push(`${label}: questions[${j}] ("${q.id}").proof "${id}" is not an evidence id in this case`);
        } else if (!cited.has(id)) {
          errors.push(`${label}: questions[${j}] ("${q.id}").proof "${id}" is not cited in the walkthrough`);
        }
      }
    });

    const titleKey = card.title.toLowerCase();
    const dupOf = titles.get(titleKey);
    if (dupOf) errors.push(`${label}: 'title' duplicates case "${dupOf}"`);
    titles.set(titleKey, cardId);
    cards.push(card);
  });

  if (errors.length > 0) return { deck: null, recommended: false, errors };

  const deck: CaseDeck = {
    schemaVersion: 1,
    deckId,
    version: opts.version,
    name: pack.name.trim(),
    gameType: "case",
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

/** Deck JSON as written to disk. */
export function serializeCaseDeck(deck: CaseDeck): string {
  return JSON.stringify(deck, null, 2) + "\n";
}

/** True when two decks are identical apart from `version`. */
export function sameCaseDeckContent(a: CaseDeck, b: CaseDeck): boolean {
  return JSON.stringify({ ...a, version: "" }) === JSON.stringify({ ...b, version: "" });
}

// ---------------------------------------------------------------------------
// pack → YAML (for producers such as photo quick-add, #38)

/** Canonical YAML for a pack; round-trips through `parseCasePack`. */
export function serializeCasePack(pack: CasePack): string {
  const clean = <T extends object>(o: T) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
  return stringify(
    clean({
      pack: pack.pack,
      language: pack.language,
      name: pack.name,
      deckId: pack.deckId,
      difficulty: pack.difficulty,
      topics: pack.topics,
      nsfw: pack.nsfw,
      recommended: pack.recommended,
      license: pack.license,
      attribution: pack.attribution,
      cases: pack.cases.map((c) =>
        clean({
          id: c.id,
          title: c.title,
          briefing: c.briefing,
          evidence: c.evidence.map((e) =>
            clean({ id: e.id, title: e.title, kind: e.kind, content: e.content, src: e.src, unlockAfter: e.unlockAfter })
          ),
          questions: c.questions.map((q) =>
            clean({
              id: q.id,
              prompt: q.prompt,
              answer: q.answer,
              acceptedVariants: q.acceptedVariants,
              points: q.points,
              proof: q.proof,
            })
          ),
          walkthrough: c.walkthrough,
          contentWarnings: c.contentWarnings,
          estMinutes: c.estMinutes,
          origin: c.origin,
          ref: c.ref,
          license: c.license,
          author: c.author,
          url: c.url,
          modified: c.modified,
        })
      ),
    }),
    { lineWidth: 0 }
  );
}

/** A deck card back as pack input (no proofs). */
export function cardToCaseInput(card: CaseCard): CaseInput {
  return {
    id: card.cardId,
    title: card.title,
    briefing: card.briefing,
    evidence: card.evidence.map((e: Evidence) => ({ ...e })),
    questions: card.questions.map((q) => ({ ...q })),
    walkthrough: card.walkthrough,
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

