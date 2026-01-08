import type { GameType } from "../../src/types/game";
import type {
  Card,
  CharadesCard,
  TriviaCard,
  TabooCard,
  JustOneCard,
  MonikersCard,
} from "../../src/types/card";

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
  const errors: string[] = [];

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

  const card: MonikersCard = {
    cardId,
    type: "monikers",
    phrase: (obj.phrase as string).trim(),
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
  }
}
