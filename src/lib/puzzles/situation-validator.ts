/**
 * Situation puzzle validator (spec §4.1, issue #24). Pure (no fs, no `@/`
 * imports) so the scripts, the app (/add, #38) and the Worker share it.
 * `scripts/lib/validators.ts` re-exports it.
 */
import type { SituationCard, SituationKeyFact } from "../../types/card";
import type { Difficulty } from "../../types/game";
import { normalizeContentWarning } from "../data/content-warnings";
import { contentSourceErrors, normalizeContentSource } from "../content/licenses";

export interface SituationValidationResult {
  valid: boolean;
  errors: string[];
  card?: SituationCard;
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
): SituationValidationResult {
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
    contentSourceErrors(obj.source).forEach(fail);
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
    ...(source ? { source: normalizeContentSource(source) } : {}),
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
