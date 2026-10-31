import type { Difficulty } from "../../src/types/game";
import {
  generateJsonWithRetry,
  type JsonGenerationRequest,
  type JsonSchema,
  type LlmProvider,
} from "../../src/lib/ai/provider";
import { EVIDENCE_KINDS, TEXT_EVIDENCE_KINDS, type EvidenceKind } from "../../src/types/card";
import { CASE_ADAPT_RULES, PUZZLE_NORMALIZE_RULES } from "../prompts/source-normalize";
import { getLicense, requiredShareAlikeLicense } from "./licenses";
import {
  puzzlePackToDeck,
  serializePuzzlePack,
  slugify,
  type PuzzleInput,
  type PuzzlePack,
} from "./puzzle-pack";
import {
  casePackToDeck,
  serializeCasePack,
  type CaseEvidenceInput,
  type CaseInput,
  type CasePack,
  type CaseQuestionInput,
} from "./case-pack";
import type { RawPuzzleItem, RawStoryItem } from "./raw-sources";
import { SITUATION_LIMITS } from "./validators";

/**
 * Normalisation (#58): raw external items → pack YAML drafts, through the
 * shared LLM provider interface (src/lib/ai/provider.ts). The output is a
 * draft for human review in `decks/drafts/sources/`; a reviewer edits it,
 * moves it to `decks/puzzles/` or `decks/cases/`, and imports it with the
 * existing importers (which validate it again, licences included).
 *
 * Every normalised card is `origin: adapted`, `modified: true`, and carries
 * the item's licence, credit line and URL. The model never decides the
 * licence or the credit; those come from the raw item.
 *
 * Requests include an `Item id:` line so a replay provider (recorded
 * responses keyed by item id) can answer them offline and deterministically.
 */

export const PUZZLE_NORMALIZE_SCHEMA_NAME = "source_puzzle";
export const CASE_ADAPT_SCHEMA_NAME = "source_case";

const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
const LANGUAGE_NAMES: Record<string, string> = { en: "English", es: "Spanish" };

function languageName(lang: string): string {
  return LANGUAGE_NAMES[lang] ?? lang;
}

// ---------------------------------------------------------------------------
// Shared helpers

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/[ \t]+/g, " ").trim() : "";
}

function cleanLine(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = cleanLine(item);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
  }
  return out.slice(0, max);
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** The item id a request is about (the `Item id:` line). */
export function requestItemId(request: JsonGenerationRequest): string | null {
  for (const message of request.messages) {
    const text = typeof message.content === "string"
      ? message.content
      : message.content.map((p) => (p.type === "text" ? p.text : "")).join("\n");
    const match = text.match(/^Item id: (\S+)$/m);
    if (match) return match[1];
  }
  return null;
}

/**
 * A provider that replays recorded model output keyed by item id (offline,
 * deterministic). For tests and for re-running a normalisation without keys.
 */
export function createReplayProvider(responses: Record<string, unknown>): LlmProvider {
  return {
    name: "stub",
    model: "replay",
    async generateJson(request) {
      const id = requestItemId(request);
      if (!id || !(id in responses)) {
        throw new Error(`replay provider has no recorded response for item "${id ?? "?"}"`);
      }
      const data = responses[id];
      return { data, text: JSON.stringify(data), model: "replay", provider: "stub" };
    },
  };
}

// ---------------------------------------------------------------------------
// Situation puzzles

export function puzzleNormalizeSchema(): JsonSchema {
  const text = { type: "string" };
  const list = { type: "array", items: { type: "string" } };
  return {
    type: "object",
    properties: {
      isSituationPuzzle: { type: "boolean" },
      rejectReason: text,
      title: text,
      setup: text,
      solution: text,
      keyFacts: list,
      hints: list,
      difficulty: { type: "string", enum: [...DIFFICULTIES] },
      estMinutes: { type: "number" },
      contentWarnings: list,
    },
    required: [
      "isSituationPuzzle",
      "rejectReason",
      "title",
      "setup",
      "solution",
      "keyFacts",
      "hints",
      "difficulty",
      "estMinutes",
      "contentWarnings",
    ],
    additionalProperties: false,
  };
}

export function buildPuzzleNormalizeRequest(item: RawPuzzleItem, lang: string): JsonGenerationRequest {
  const text = [
    `Item id: ${item.id}`,
    `Write every field in ${languageName(lang)}.`,
    "",
    `<post_title>${item.title}</post_title>`,
    `<question>\n${item.setup}\n</question>`,
    `<accepted_answer>\n${item.solution}\n</accepted_answer>`,
  ].join("\n");
  return {
    system: PUZZLE_NORMALIZE_RULES,
    messages: [{ role: "user", content: text }],
    schema: puzzleNormalizeSchema(),
    schemaName: PUZZLE_NORMALIZE_SCHEMA_NAME,
    maxTokens: 2000,
  };
}

export type PuzzleNormalizeResult =
  | { ok: true; puzzle: PuzzleInput }
  | { ok: false; reason: string };

/** Untrusted model output + the raw item → a puzzle input with credits. */
export function parsePuzzleNormalizeOutput(data: unknown, item: RawPuzzleItem): PuzzleNormalizeResult {
  if (!isRecord(data)) return { ok: false, reason: "the model returned no object" };
  if (data.isSituationPuzzle === false) {
    return { ok: false, reason: cleanLine(data.rejectReason) || "not a situation puzzle" };
  }
  const title = cleanLine(data.title) || item.title;
  const setup = cleanLine(data.setup);
  const solution = cleanText(data.solution);
  if (!setup || !solution) return { ok: false, reason: "the model left the setup or solution empty" };
  const difficulty = DIFFICULTIES.includes(data.difficulty as Difficulty)
    ? (data.difficulty as Difficulty)
    : undefined;
  const contentWarnings = cleanList(data.contentWarnings, 8);
  return {
    ok: true,
    puzzle: {
      id: slugify(`${item.id}`),
      title,
      setup,
      solution,
      keyFacts: cleanList(data.keyFacts, SITUATION_LIMITS.maxKeyFacts),
      hints: cleanList(data.hints, SITUATION_LIMITS.maxHints),
      ...(difficulty ? { difficulty } : {}),
      ...(contentWarnings.length > 0 ? { contentWarnings } : {}),
      ...(positiveNumber(data.estMinutes) ? { estMinutes: positiveNumber(data.estMinutes) } : {}),
      origin: "adapted",
      ref: `${item.site}:q${item.questionId}/a${item.answerId}`,
      license: item.license,
      author: item.credit,
      url: item.url,
      modified: true,
    },
  };
}

export interface PackMeta {
  pack: string;
  language: string;
  name: string;
  attribution?: string;
  topics?: string[];
}

export interface NormalizePuzzlesResult {
  pack: PuzzlePack | null;
  rejected: { id: string; reason: string }[];
  /** Validation problems in the draft (it is still written for review). */
  errors: string[];
}

/** Default deck credit for a Stack Exchange pack. */
export function stackExchangeAttribution(license: string | undefined): string {
  const name = getLicense(license)?.name ?? "CC BY-SA";
  return `Puzzles adapted from Puzzling Stack Exchange posts under ${name}. Each puzzle credits its authors and links to the original post.`;
}

/**
 * Normalise puzzle items one by one (in item order). Items flagged by the
 * importer are skipped unless `includeFlagged`.
 */
export async function normalizePuzzleItems(
  provider: LlmProvider,
  items: readonly RawPuzzleItem[],
  meta: PackMeta,
  { includeFlagged = false, retry }: { includeFlagged?: boolean; retry?: { attempts?: number; delayMs?: number } } = {}
): Promise<NormalizePuzzlesResult> {
  const rejected: NormalizePuzzlesResult["rejected"] = [];
  const puzzles: PuzzleInput[] = [];
  const licenses: string[] = [];
  for (const item of items) {
    if (item.flags.length > 0 && !includeFlagged) {
      rejected.push({ id: item.id, reason: `flagged: ${item.flags.join("; ")}` });
      continue;
    }
    const res = await generateJsonWithRetry(provider, buildPuzzleNormalizeRequest(item, meta.language), retry);
    const parsed = parsePuzzleNormalizeOutput(res.data, item);
    if (!parsed.ok) {
      rejected.push({ id: item.id, reason: parsed.reason });
      continue;
    }
    puzzles.push(parsed.puzzle);
    licenses.push(item.license);
  }
  if (puzzles.length === 0) return { pack: null, rejected, errors: ["no item became a puzzle"] };

  const license = requiredShareAlikeLicense(licenses);
  const pack: PuzzlePack = {
    pack: meta.pack,
    language: meta.language,
    name: meta.name,
    ...(meta.topics ? { topics: meta.topics } : {}),
    recommended: false,
    origin: "adapted",
    ...(license ? { license } : {}),
    attribution: meta.attribution ?? stackExchangeAttribution(license),
    puzzles,
  };
  const check = puzzlePackToDeck(pack, { version: "" });
  return { pack, rejected, errors: check.errors };
}

// ---------------------------------------------------------------------------
// Case files from stories

const CASE_EVIDENCE_KINDS = TEXT_EVIDENCE_KINDS;

export function caseAdaptSchema(): JsonSchema {
  const text = { type: "string" };
  const list = { type: "array", items: { type: "string" } };
  return {
    type: "object",
    properties: {
      title: text,
      briefing: text,
      evidence: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: text,
            title: text,
            kind: { type: "string", enum: [...CASE_EVIDENCE_KINDS] },
            content: text,
            unlockAfter: list,
          },
          required: ["id", "title", "kind", "content", "unlockAfter"],
          additionalProperties: false,
        },
      },
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: text,
            prompt: text,
            answer: text,
            acceptedVariants: list,
            points: { type: "number" },
            proof: list,
          },
          required: ["id", "prompt", "answer", "acceptedVariants", "points", "proof"],
          additionalProperties: false,
        },
      },
      walkthrough: text,
      estMinutes: { type: "number" },
      contentWarnings: list,
    },
    required: ["title", "briefing", "evidence", "questions", "walkthrough", "estMinutes", "contentWarnings"],
    additionalProperties: false,
  };
}

export function buildCaseAdaptRequest(item: RawStoryItem, lang: string): JsonGenerationRequest {
  const text = [
    `Item id: ${item.id}`,
    `Write every field in ${languageName(lang)}.`,
    "",
    `<story title="${item.title.replace(/"/g, "'")}" author="${item.author.replace(/"/g, "'")}">`,
    item.text,
    "</story>",
  ].join("\n");
  return {
    system: CASE_ADAPT_RULES,
    messages: [{ role: "user", content: text }],
    schema: caseAdaptSchema(),
    schemaName: CASE_ADAPT_SCHEMA_NAME,
    maxTokens: 8000,
    effort: "high",
  };
}

/** Untrusted model output + the raw story → a case input with credits. */
export function parseCaseAdaptOutput(data: unknown, item: RawStoryItem): { ok: true; input: CaseInput } | { ok: false; reason: string } {
  if (!isRecord(data)) return { ok: false, reason: "the model returned no object" };
  const evidence: CaseEvidenceInput[] = (Array.isArray(data.evidence) ? data.evidence : [])
    .filter(isRecord)
    .map((e) => {
      const kind = (EVIDENCE_KINDS as readonly string[]).includes(e.kind as string)
        ? (e.kind as EvidenceKind)
        : "document";
      const unlockAfter = cleanList(e.unlockAfter, 12).map((id) => slugify(id));
      return {
        id: slugify(cleanLine(e.id)),
        title: cleanLine(e.title),
        kind,
        content: cleanText(e.content),
        ...(unlockAfter.length > 0 ? { unlockAfter } : {}),
      };
    });
  const questions: CaseQuestionInput[] = (Array.isArray(data.questions) ? data.questions : [])
    .filter(isRecord)
    .map((q) => {
      const proof = cleanList(q.proof, 12).map((id) => slugify(id));
      return {
        id: slugify(cleanLine(q.id)),
        prompt: cleanLine(q.prompt),
        answer: cleanLine(q.answer),
        acceptedVariants: cleanList(q.acceptedVariants, 12),
        points: positiveNumber(q.points) ?? 1,
        ...(proof.length > 0 ? { proof } : {}),
      };
    });
  const title = cleanLine(data.title) || item.title;
  const briefing = cleanText(data.briefing);
  const walkthrough = cleanText(data.walkthrough);
  if (!briefing || evidence.length === 0 || questions.length === 0 || !walkthrough) {
    return { ok: false, reason: "the model left the briefing, evidence, questions or walkthrough empty" };
  }
  const contentWarnings = cleanList(data.contentWarnings, 8);
  return {
    ok: true,
    input: {
      id: item.id,
      title,
      briefing,
      evidence,
      questions,
      walkthrough,
      ...(contentWarnings.length > 0 ? { contentWarnings } : {}),
      ...(positiveNumber(data.estMinutes) ? { estMinutes: positiveNumber(data.estMinutes) } : {}),
      origin: "adapted",
      ref: item.title,
      license: item.license,
      author: item.author,
      url: item.url,
      modified: true,
    },
  };
}

/** Default deck credit for a case adapted from a story. */
export function storyAttribution(item: RawStoryItem): string {
  const license = getLicense(item.license);
  const terms = license?.family === "PDM" ? "public domain" : (license?.name ?? item.license);
  return `Adapted from “${item.title}” by ${item.author} (${terms}).`;
}

export interface NormalizeStoryResult {
  pack: CasePack | null;
  errors: string[];
}

/**
 * Adapt stories into one case pack (one case per story, in item order).
 * Share-alike stories make the deck that share-alike licence; the deck
 * attribution names every story unless `meta.attribution` is given.
 */
export async function normalizeStoryItems(
  provider: LlmProvider,
  items: readonly RawStoryItem[],
  meta: PackMeta,
  { retry }: { retry?: { attempts?: number; delayMs?: number } } = {}
): Promise<NormalizeStoryResult> {
  const errors: string[] = [];
  const cases: CaseInput[] = [];
  for (const item of items) {
    const res = await generateJsonWithRetry(provider, buildCaseAdaptRequest(item, meta.language), retry);
    const parsed = parseCaseAdaptOutput(res.data, item);
    if (parsed.ok) cases.push(parsed.input);
    else errors.push(`${item.id}: ${parsed.reason}`);
  }
  if (cases.length === 0) return { pack: null, errors: errors.length ? errors : ["no story became a case"] };
  const license = requiredShareAlikeLicense(items.map((i) => i.license));
  const pack: CasePack = {
    pack: meta.pack,
    language: meta.language,
    name: meta.name,
    ...(meta.topics ? { topics: meta.topics } : {}),
    recommended: false,
    ...(license ? { license } : {}),
    attribution: meta.attribution ?? items.map(storyAttribution).join(" "),
    cases,
  };
  const check = casePackToDeck(pack, { version: "" });
  return { pack, errors: [...errors, ...check.errors] };
}

// ---------------------------------------------------------------------------
// Draft files

/** Comment header for a draft: where it came from and the review steps. */
export function draftHeader(kind: "puzzles" | "cases", sources: readonly string[], errors: readonly string[]): string {
  const target = kind === "puzzles" ? "decks/puzzles/" : "decks/cases/";
  const importer = kind === "puzzles" ? "import-puzzles.ts" : "import-cases.ts";
  const lines = [
    "DRAFT for human review (scripts/normalize-sources.ts). Not imported.",
    `Sources: ${sources.join(", ")}`,
    "Review: check the licence and author on the live page, compare with the",
    "original wording, fix the text, run the content-warning and fairness checks.",
    `Then move this file to ${target} and run bun scripts/${importer} --file <it>.`,
    ...(errors.length > 0 ? ["Validation problems to fix:", ...errors.map((e) => `  - ${e}`)] : []),
  ];
  return lines.map((l) => `# ${l}`.trimEnd()).join("\n") + "\n";
}

export function puzzleDraftYaml(pack: PuzzlePack, sources: readonly string[], errors: readonly string[]): string {
  return draftHeader("puzzles", sources, errors) + serializePuzzlePack(pack);
}

export function caseDraftYaml(pack: CasePack, sources: readonly string[], errors: readonly string[]): string {
  return draftHeader("cases", sources, errors) + serializeCasePack(pack);
}
