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
} from "../../src/types/card";
import { normalizeContentWarning } from "../../src/lib/data/content-warnings";

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
  cardId: string
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
  }
}
