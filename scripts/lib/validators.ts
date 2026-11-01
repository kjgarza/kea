import type { Difficulty, GameType } from "../../src/types/game";
import type {
  Card,
  CharadesCard,
  TriviaCard,
  TabooCard,
  JustOneCard,
  MonikersCard,
  SituationCard,
  SituationKeyFact,
  SituationOrigin,
  CaseCard,
  CaseQuestion,
  Evidence,
  EvidenceKind,
} from "../../src/types/card";
import {
  EVIDENCE_KINDS,
  FILE_EVIDENCE_KINDS,
  TEXT_EVIDENCE_KINDS,
} from "../../src/types/card";
import { normalizeContentWarning } from "../../src/lib/data/content-warnings";
import { isSafeAssetPath } from "../../src/lib/data/case-assets";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  card?: Card;
}

/**
 * Validate and transform a raw card object based on game type
 */
export function validateCard(
  raw: unknown,
  gameType: GameType,
  cardId: string,
  options: CaseValidationOptions = {}
): ValidationResult {
  if (!raw || typeof raw !== "object") {
    return { valid: false, errors: ["Card is not an object"] };
  }

  switch (gameType) {
    case "charades":
      return validateCharadesCard(raw, cardId);
    case "trivia":
      return validateTriviaCard(raw, cardId);
    case "taboo":
      return validateTabooCard(raw, cardId);
    case "justone":
      return validateJustOneCard(raw, cardId);
    case "monikers":
      return validateMonikersCard(raw, cardId);
    case "situation":
      return validateSituationCard(raw, cardId);
    case "case":
      return validateCaseCard(raw, cardId, options);
    default:
      return { valid: false, errors: [`Unknown game type: ${gameType}`] };
  }
}

function validateCharadesCard(
  raw: unknown,
  cardId: string
): ValidationResult {
  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];

  if (!obj.prompt || typeof obj.prompt !== "string") {
    errors.push("Missing or invalid 'prompt' field");
  } else if (obj.prompt.length < 1 || obj.prompt.length > 100) {
    errors.push("Prompt must be 1-100 characters");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const card: CharadesCard = {
    cardId,
    type: "charades",
    prompt: (obj.prompt as string).trim(),
  };

  return { valid: true, errors: [], card };
}

function validateTriviaCard(
  raw: unknown,
  cardId: string
): ValidationResult {
  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];

  const format = obj.format as string;
  if (format !== "mcq" && format !== "open") {
    errors.push("Format must be 'mcq' or 'open'");
    return { valid: false, errors };
  }

  if (!obj.question || typeof obj.question !== "string") {
    errors.push("Missing or invalid 'question' field");
  }

  if (!obj.answerText || typeof obj.answerText !== "string") {
    errors.push("Missing or invalid 'answerText' field");
  }

  if (format === "mcq") {
    if (!Array.isArray(obj.choices) || obj.choices.length !== 4) {
      errors.push("MCQ must have exactly 4 choices");
    }

    const answerIndex = obj.answerIndex;
    if (typeof answerIndex !== "number" || answerIndex < 0 || answerIndex > 3) {
      errors.push("answerIndex must be 0-3");
    }

    // Verify answerText matches the correct choice
    if (Array.isArray(obj.choices) && typeof answerIndex === "number") {
      const correctChoice = obj.choices[answerIndex];
      if (correctChoice !== obj.answerText) {
        errors.push("answerText must match the correct choice");
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  if (format === "mcq") {
    const card: TriviaCard = {
      cardId,
      type: "trivia",
      format: "mcq",
      question: (obj.question as string).trim(),
      choices: (obj.choices as string[]).map((c) => c.trim()),
      answerIndex: obj.answerIndex as number,
      answerText: (obj.answerText as string).trim(),
    };
    return { valid: true, errors: [], card };
  }

  const card: TriviaCard = {
    cardId,
    type: "trivia",
    format: "open",
    question: (obj.question as string).trim(),
    answerText: (obj.answerText as string).trim(),
  };
  return { valid: true, errors: [], card };
}

function validateTabooCard(
  raw: unknown,
  cardId: string
): ValidationResult {
  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];

  if (!obj.target || typeof obj.target !== "string") {
    errors.push("Missing or invalid 'target' field");
  }

  if (!Array.isArray(obj.forbidden)) {
    errors.push("Missing 'forbidden' array");
  } else {
    // Must have 5-6 forbidden words
    if (obj.forbidden.length < 5 || obj.forbidden.length > 6) {
      errors.push("Must have 5-6 forbidden words");
    }

    // All must be unique
    const uniqueForbidden = new Set(
      obj.forbidden.map((w: string) => w.toLowerCase().trim())
    );
    if (uniqueForbidden.size !== obj.forbidden.length) {
      errors.push("Forbidden words must be unique");
    }

    // None can equal the target
    const targetLower = (obj.target as string)?.toLowerCase().trim();
    for (const word of obj.forbidden) {
      const wordLower = (word as string).toLowerCase().trim();
      if (wordLower === targetLower) {
        errors.push("Forbidden word cannot equal target");
      }
      // Check for simple variations (plural)
      if (wordLower === targetLower + "s" || wordLower + "s" === targetLower) {
        errors.push(`Forbidden word "${word}" is too similar to target`);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const card: TabooCard = {
    cardId,
    type: "taboo",
    target: (obj.target as string).trim(),
    forbidden: (obj.forbidden as string[]).slice(0, 5).map((w) => w.trim()),
  };

  return { valid: true, errors: [], card };
}

function validateJustOneCard(
  raw: unknown,
  cardId: string
): ValidationResult {
  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];

  if (!obj.target || typeof obj.target !== "string") {
    errors.push("Missing or invalid 'target' field");
  } else if (obj.target.length < 1 || obj.target.length > 50) {
    errors.push("Target must be 1-50 characters");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const card: JustOneCard = {
    cardId,
    type: "justone",
    target: (obj.target as string).trim(),
  };

  return { valid: true, errors: [], card };
}

function validateMonikersCard(
  raw: unknown,
  cardId: string
): ValidationResult {
  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];

  if (!obj.phrase || typeof obj.phrase !== "string") {
    errors.push("Missing or invalid 'phrase' field");
  } else if (obj.phrase.length < 1 || obj.phrase.length > 100) {
    errors.push("Phrase must be 1-100 characters");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  if (
    obj.description !== undefined &&
    (typeof obj.description !== "string" || obj.description.trim().length === 0)
  ) {
    errors.push("'description' must be a non-empty string if provided");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const card: MonikersCard = {
    cardId,
    type: "monikers",
    phrase: (obj.phrase as string).trim(),
    ...(obj.description && typeof obj.description === "string"
      ? { description: obj.description.trim() }
      : {}),
  };

  return { valid: true, errors: [], card };
}

/** Situation puzzle limits (spec §4.1, issue #24). */
export const SITUATION_LIMITS = {
  setupMaxChars: 400,
  minKeyFacts: 3,
  maxKeyFacts: 8,
  minHints: 1,
  maxHints: 4,
} as const;

const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
const SITUATION_ORIGINS: readonly SituationOrigin[] = [
  "generated",
  "original",
  "transcribed",
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validate a situation puzzle. Every error names the card id and the field
 * (e.g. `situation card "x-001": keyFacts[2].id "f1" is a duplicate`) so
 * hand-written and generated puzzles can be fixed quickly. All problems are
 * reported at once rather than stopping at the first.
 */
export function validateSituationCard(
  raw: unknown,
  cardId: string
): ValidationResult {
  const label = `situation card "${cardId}"`;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, errors: [`${label}: card is not an object`] };
  }
  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];
  const fail = (message: string) => errors.push(`${label}: ${message}`);

  // Required text fields
  for (const field of ["title", "setup", "solution"] as const) {
    if (!isNonEmptyString(obj[field])) {
      fail(`'${field}' is required and must be a non-empty string`);
    }
  }
  if (
    isNonEmptyString(obj.setup) &&
    obj.setup.trim().length > SITUATION_LIMITS.setupMaxChars
  ) {
    fail(
      `'setup' is ${obj.setup.trim().length} characters; the maximum is ${SITUATION_LIMITS.setupMaxChars}`
    );
  }

  // Key facts: 3–8, each { id, text }, ids unique
  const keyFacts: SituationKeyFact[] = [];
  if (!Array.isArray(obj.keyFacts)) {
    fail(`'keyFacts' is required and must be an array`);
  } else {
    const { minKeyFacts, maxKeyFacts } = SITUATION_LIMITS;
    if (obj.keyFacts.length < minKeyFacts || obj.keyFacts.length > maxKeyFacts) {
      fail(
        `'keyFacts' has ${obj.keyFacts.length} items; it must have ${minKeyFacts}–${maxKeyFacts}`
      );
    }
    const seenIds = new Set<string>();
    obj.keyFacts.forEach((fact: unknown, i: number) => {
      if (!fact || typeof fact !== "object") {
        fail(`keyFacts[${i}] must be an object with 'id' and 'text'`);
        return;
      }
      const { id, text } = fact as Record<string, unknown>;
      let ok = true;
      if (!isNonEmptyString(id)) {
        fail(`keyFacts[${i}].id is required and must be a non-empty string`);
        ok = false;
      } else if (seenIds.has(id.trim())) {
        fail(`keyFacts[${i}].id "${id.trim()}" is a duplicate; fact ids must be unique`);
        ok = false;
      } else {
        seenIds.add(id.trim());
      }
      if (!isNonEmptyString(text)) {
        fail(`keyFacts[${i}].text is required and must be a non-empty string`);
        ok = false;
      }
      if (ok) {
        keyFacts.push({ id: (id as string).trim(), text: (text as string).trim() });
      }
    });
  }

  // Hints: 1–4 non-empty strings, ordered mild → strong
  if (!Array.isArray(obj.hints)) {
    fail(`'hints' is required and must be an array`);
  } else {
    const { minHints, maxHints } = SITUATION_LIMITS;
    if (obj.hints.length < minHints || obj.hints.length > maxHints) {
      fail(`'hints' has ${obj.hints.length} items; it must have ${minHints}–${maxHints}`);
    }
    obj.hints.forEach((hint: unknown, i: number) => {
      if (!isNonEmptyString(hint)) {
        fail(`hints[${i}] must be a non-empty string`);
      }
    });
  }

  // Optional fields
  if (
    obj.difficulty !== undefined &&
    !DIFFICULTIES.includes(obj.difficulty as Difficulty)
  ) {
    fail(`'difficulty' must be one of ${DIFFICULTIES.join(", ")}`);
  }

  if (obj.contentWarnings !== undefined) {
    if (!Array.isArray(obj.contentWarnings)) {
      fail(`'contentWarnings' must be an array of strings`);
    } else {
      obj.contentWarnings.forEach((w: unknown, i: number) => {
        if (!isNonEmptyString(w)) {
          fail(`contentWarnings[${i}] must be a non-empty string`);
        }
      });
    }
  }

  if (
    obj.estMinutes !== undefined &&
    (typeof obj.estMinutes !== "number" ||
      !Number.isFinite(obj.estMinutes) ||
      obj.estMinutes <= 0)
  ) {
    fail(`'estMinutes' must be a positive number`);
  }

  if (obj.source !== undefined) {
    const source = obj.source as Record<string, unknown> | null;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      fail(`'source' must be an object with an 'origin'`);
    } else {
      if (!SITUATION_ORIGINS.includes(source.origin as SituationOrigin)) {
        fail(`'source.origin' must be one of ${SITUATION_ORIGINS.join(", ")}`);
      }
      for (const field of ["pack", "ref"] as const) {
        if (source[field] !== undefined && typeof source[field] !== "string") {
          fail(`'source.${field}' must be a string`);
        }
      }
    }
  }

  if (obj.solvability !== undefined) {
    const solvability = obj.solvability as Record<string, unknown> | null;
    if (!solvability || typeof solvability !== "object" || Array.isArray(solvability)) {
      fail(`'solvability' must be an object with 'questions' and 'checkedAt'`);
    } else {
      const { questions, checkedAt, model } = solvability;
      if (typeof questions !== "number" || !Number.isInteger(questions) || questions < 0) {
        fail(`'solvability.questions' must be a non-negative integer`);
      }
      if (!isNonEmptyString(checkedAt) || Number.isNaN(Date.parse(checkedAt))) {
        fail(`'solvability.checkedAt' must be an ISO date string`);
      }
      if (model !== undefined && !isNonEmptyString(model)) {
        fail(`'solvability.model' must be a non-empty string`);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const contentWarnings = [
    ...new Set(
      ((obj.contentWarnings as string[] | undefined) ?? []).map(
        normalizeContentWarning
      )
    ),
  ];
  const source = obj.source as SituationCard["source"] | undefined;
  const solvability = obj.solvability as SituationCard["solvability"] | undefined;

  const card: SituationCard = {
    cardId,
    type: "situation",
    title: (obj.title as string).trim(),
    setup: (obj.setup as string).trim(),
    solution: (obj.solution as string).trim(),
    keyFacts,
    hints: (obj.hints as string[]).map((h) => h.trim()),
    ...(obj.difficulty !== undefined
      ? { difficulty: obj.difficulty as Difficulty }
      : {}),
    ...(contentWarnings.length > 0 ? { contentWarnings } : {}),
    ...(obj.estMinutes !== undefined
      ? { estMinutes: obj.estMinutes as number }
      : {}),
    ...(source
      ? {
          source: {
            origin: source.origin,
            ...(source.pack !== undefined ? { pack: source.pack } : {}),
            ...(source.ref !== undefined ? { ref: source.ref } : {}),
          },
        }
      : {}),
    ...(solvability
      ? {
          solvability: {
            questions: solvability.questions,
            checkedAt: solvability.checkedAt,
            ...(solvability.model !== undefined ? { model: solvability.model.trim() } : {}),
          },
        }
      : {}),
  };

  return { valid: true, errors: [], card };
}

/**
 * Whether an evidence file exists. `src` is relative to
 * `public/decks/assets/<deckId>/`. Injected so the validator stays pure:
 * scripts pass `createFileAssetExists()` (scripts/lib/case-assets.ts), tests
 * pass a fake.
 */
export type AssetExists = (deckId: string, src: string) => boolean;

export interface CaseValidationOptions {
  /** The deck the card belongs to; needed to check `src` files. */
  deckId?: string;
  /**
   * Checks that each `src` file exists. When omitted, `src` paths are only
   * checked for shape (safe relative path), not existence.
   */
  assetExists?: AssetExists;
}

/** Case file limits (spec §4.2, issue #34). */
export const CASE_LIMITS = {
  minEvidence: 1,
  minQuestions: 1,
} as const;

/**
 * Find a cycle in the evidence unlock graph (`unlockAfter` edges). Returns
 * the cycle as a path that starts and ends on the same id (e.g.
 * `["a", "b", "a"]`), or null when the graph is acyclic. Ids that are not
 * evidence ids are ignored here (the validator reports them separately).
 */
export function findUnlockCycle(
  evidence: readonly { id: string; unlockAfter?: readonly string[] }[]
): string[] | null {
  const edges = new Map<string, readonly string[]>();
  for (const item of evidence) {
    if (!edges.has(item.id)) edges.set(item.id, item.unlockAfter ?? []);
  }
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    state.set(id, "visiting");
    stack.push(id);
    for (const next of edges.get(id) ?? []) {
      if (!edges.has(next)) continue;
      const nextState = state.get(next);
      if (nextState === "visiting") {
        return [...stack.slice(stack.indexOf(next)), next];
      }
      if (nextState === undefined) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, "done");
    return null;
  };

  for (const id of edges.keys()) {
    if (state.get(id) === undefined) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Validate a case file. Every error names the card id, the evidence or
 * question (index and id) and the field, e.g.
 * `case card "c-001": evidence[2] ("photo").src "photo.png" was not found in public/decks/assets/<deckId>/`.
 * All problems are reported at once.
 */
export function validateCaseCard(
  raw: unknown,
  cardId: string,
  { deckId, assetExists }: CaseValidationOptions = {}
): ValidationResult {
  const label = `case card "${cardId}"`;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, errors: [`${label}: card is not an object`] };
  }
  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];
  const fail = (message: string) => errors.push(`${label}: ${message}`);

  for (const field of ["title", "briefing", "walkthrough"] as const) {
    if (!isNonEmptyString(obj[field])) {
      fail(`'${field}' is required and must be a non-empty string`);
    }
  }

  if (assetExists && !isNonEmptyString(deckId)) {
    fail(`cannot check evidence files without the deck id`);
  }

  // Evidence
  const evidence: Evidence[] = [];
  if (!Array.isArray(obj.evidence)) {
    fail(`'evidence' is required and must be an array`);
  } else {
    if (obj.evidence.length < CASE_LIMITS.minEvidence) {
      fail(`'evidence' must have at least ${CASE_LIMITS.minEvidence} item`);
    }
    const ids = new Set<string>();
    for (const item of obj.evidence as unknown[]) {
      const id = (item as Record<string, unknown> | null)?.id;
      if (isNonEmptyString(id)) ids.add(id.trim());
    }
    const seenIds = new Set<string>();

    obj.evidence.forEach((item: unknown, i: number) => {
      const rawId = (item as Record<string, unknown> | null)?.id;
      const where = isNonEmptyString(rawId)
        ? `evidence[${i}] ("${rawId.trim()}")`
        : `evidence[${i}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        fail(`${where} must be an object with 'id', 'title' and 'kind'`);
        return;
      }
      const e = item as Record<string, unknown>;
      let ok = true;
      const bad = (message: string) => {
        fail(`${where}.${message}`);
        ok = false;
      };

      if (!isNonEmptyString(e.id)) {
        bad(`id is required and must be a non-empty string`);
      } else if (seenIds.has(e.id.trim())) {
        bad(`id "${e.id.trim()}" is a duplicate; evidence ids must be unique`);
      } else {
        seenIds.add(e.id.trim());
      }
      if (!isNonEmptyString(e.title)) {
        bad(`title is required and must be a non-empty string`);
      }

      const kind = e.kind as EvidenceKind;
      if (!EVIDENCE_KINDS.includes(kind)) {
        bad(`kind must be one of ${EVIDENCE_KINDS.join(", ")}`);
      }

      if (e.content !== undefined && !isNonEmptyString(e.content)) {
        bad(`content must be a non-empty string`);
      } else if (TEXT_EVIDENCE_KINDS.includes(kind) && e.content === undefined) {
        bad(`content is required for ${kind} evidence`);
      }

      if (e.src !== undefined) {
        if (typeof e.src !== "string" || !isSafeAssetPath(e.src)) {
          bad(
            `src must be a relative path inside public/decks/assets/<deckId>/ (no leading "/", "..", or URLs)`
          );
        } else if (assetExists && isNonEmptyString(deckId) && !assetExists(deckId, e.src)) {
          bad(`src "${e.src}" was not found at public/decks/assets/${deckId}/${e.src}`);
        }
      } else if (FILE_EVIDENCE_KINDS.includes(kind)) {
        bad(`src is required for ${kind} evidence`);
      }

      const unlockAfter: string[] = [];
      if (e.unlockAfter !== undefined) {
        if (!Array.isArray(e.unlockAfter)) {
          bad(`unlockAfter must be an array of evidence ids`);
        } else {
          e.unlockAfter.forEach((ref: unknown, j: number) => {
            if (!isNonEmptyString(ref)) {
              bad(`unlockAfter[${j}] must be a non-empty string`);
            } else if (!ids.has(ref.trim())) {
              bad(`unlockAfter[${j}] "${ref.trim()}" is not an evidence id in this case`);
            } else if (!unlockAfter.includes(ref.trim())) {
              unlockAfter.push(ref.trim());
            }
          });
        }
      }

      if (ok) {
        evidence.push({
          id: (e.id as string).trim(),
          title: (e.title as string).trim(),
          kind,
          ...(e.content !== undefined ? { content: (e.content as string).trim() } : {}),
          ...(e.src !== undefined ? { src: e.src as string } : {}),
          ...(unlockAfter.length > 0 ? { unlockAfter } : {}),
        });
      }
    });

    const cycle = findUnlockCycle(evidence);
    if (cycle) {
      fail(
        `evidence unlockAfter forms a cycle (${cycle.join(" -> ")}); that evidence could never be opened`
      );
    }
  }

  // Questions
  const questions: CaseQuestion[] = [];
  if (!Array.isArray(obj.questions)) {
    fail(`'questions' is required and must be an array`);
  } else {
    if (obj.questions.length < CASE_LIMITS.minQuestions) {
      fail(`'questions' must have at least ${CASE_LIMITS.minQuestions} item`);
    }
    const seenIds = new Set<string>();
    obj.questions.forEach((item: unknown, i: number) => {
      const rawId = (item as Record<string, unknown> | null)?.id;
      const where = isNonEmptyString(rawId)
        ? `questions[${i}] ("${rawId.trim()}")`
        : `questions[${i}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        fail(`${where} must be an object with 'id', 'prompt', 'answer' and 'points'`);
        return;
      }
      const q = item as Record<string, unknown>;
      let ok = true;
      const bad = (message: string) => {
        fail(`${where}.${message}`);
        ok = false;
      };

      if (!isNonEmptyString(q.id)) {
        bad(`id is required and must be a non-empty string`);
      } else if (seenIds.has(q.id.trim())) {
        bad(`id "${q.id.trim()}" is a duplicate; question ids must be unique`);
      } else {
        seenIds.add(q.id.trim());
      }
      for (const field of ["prompt", "answer"] as const) {
        if (!isNonEmptyString(q[field])) {
          bad(`${field} is required and must be a non-empty string`);
        }
      }
      if (!Array.isArray(q.acceptedVariants)) {
        bad(`acceptedVariants is required and must be an array of strings (may be empty)`);
      } else {
        q.acceptedVariants.forEach((v: unknown, j: number) => {
          if (!isNonEmptyString(v)) bad(`acceptedVariants[${j}] must be a non-empty string`);
        });
      }
      if (
        typeof q.points !== "number" ||
        !Number.isFinite(q.points) ||
        q.points <= 0
      ) {
        bad(`points must be a number greater than 0`);
      }

      if (ok) {
        questions.push({
          id: (q.id as string).trim(),
          prompt: (q.prompt as string).trim(),
          answer: (q.answer as string).trim(),
          acceptedVariants: [
            ...new Set((q.acceptedVariants as string[]).map((v) => v.trim())),
          ],
          points: q.points as number,
        });
      }
    });
  }

  if (obj.contentWarnings !== undefined) {
    if (!Array.isArray(obj.contentWarnings)) {
      fail(`'contentWarnings' must be an array of strings`);
    } else {
      obj.contentWarnings.forEach((w: unknown, i: number) => {
        if (!isNonEmptyString(w)) fail(`contentWarnings[${i}] must be a non-empty string`);
      });
    }
  }

  if (
    obj.estMinutes !== undefined &&
    (typeof obj.estMinutes !== "number" ||
      !Number.isFinite(obj.estMinutes) ||
      obj.estMinutes <= 0)
  ) {
    fail(`'estMinutes' must be a positive number`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const contentWarnings = [
    ...new Set(
      ((obj.contentWarnings as string[] | undefined) ?? []).map(normalizeContentWarning)
    ),
  ];

  const card: CaseCard = {
    cardId,
    type: "case",
    title: (obj.title as string).trim(),
    briefing: (obj.briefing as string).trim(),
    evidence,
    questions,
    walkthrough: (obj.walkthrough as string).trim(),
    ...(contentWarnings.length > 0 ? { contentWarnings } : {}),
    ...(obj.estMinutes !== undefined ? { estMinutes: obj.estMinutes as number } : {}),
  };

  return { valid: true, errors: [], card };
}

/**
 * Validate every card of a case deck (and that card ids are unique). Returns
 * all errors; empty means the deck is valid.
 */
export function validateCaseDeck(
  deck: { deckId: string; gameType: string; cards: readonly unknown[] },
  { assetExists }: Pick<CaseValidationOptions, "assetExists"> = {}
): string[] {
  if (deck.gameType !== "case") {
    return [`deck "${deck.deckId}": gameType is "${deck.gameType}", expected "case"`];
  }
  const errors: string[] = [];
  const seen = new Set<string>();
  deck.cards.forEach((raw, i) => {
    const cardId = (raw as { cardId?: unknown } | null)?.cardId;
    if (!isNonEmptyString(cardId)) {
      errors.push(`deck "${deck.deckId}": cards[${i}].cardId is required`);
      return;
    }
    if (seen.has(cardId)) {
      errors.push(`deck "${deck.deckId}": cardId "${cardId}" is a duplicate`);
    }
    seen.add(cardId);
    if ((raw as { type?: unknown }).type !== "case") {
      errors.push(`case card "${cardId}": 'type' must be "case"`);
    }
    errors.push(...validateCaseCard(raw, cardId, { deckId: deck.deckId, assetExists }).errors);
  });
  return errors;
}

/**
 * Deduplicate cards based on content
 */
export function deduplicateCards<T extends Card>(cards: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const card of cards) {
    const key = getCardContentKey(card);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(card);
    }
  }

  return unique;
}

function getCardContentKey(card: Card): string {
  switch (card.type) {
    case "charades":
      return `charades:${card.prompt.toLowerCase()}`;
    case "trivia":
      return `trivia:${card.question.toLowerCase()}`;
    case "taboo":
      return `taboo:${card.target.toLowerCase()}`;
    case "justone":
      return `justone:${card.target.toLowerCase()}`;
    case "monikers":
      return `monikers:${card.phrase.toLowerCase()}`;
    case "situation":
      return `situation:${card.setup.toLowerCase()}`;
    case "case":
      return `case:${card.title.toLowerCase()}`;
  }
}
