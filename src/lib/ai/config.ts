/**
 * AI configuration shared by the Worker, the scripts and the client.
 *
 * Pure module: no Next, Bun or Node APIs, so the Cloudflare Worker can import
 * it. Change the default keeper model here and only here.
 */

/** Default Anthropic model for the keeper (and the other Worker endpoints). */
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

/** Default OpenAI model when a script picks the OpenAI provider. */
export const DEFAULT_OPENAI_MODEL = "gpt-4o";

/** `anthropic-version` header sent with raw Messages API requests. */
export const ANTHROPIC_API_VERSION = "2026-10-21";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Server-side refusal fallback for Anthropic requests: on a safety decline
 * the API re-runs the request on a fallback model it picks. Sent as
 * `fallbacks: "default"` with this beta header.
 */
export const ANTHROPIC_FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Per-endpoint generation limits. */
export const KEEPER_MAX_TOKENS = 4000;
export const KEEPER_EFFORT = "low" as const;

/** Request limits enforced by the Worker (and mirrored by the client). */
export const KEEPER_LIMITS = {
  questionMaxChars: 300,
  transcriptMaxEntries: 80,
  idMaxChars: 120,
} as const;

/** Header carrying the shared passcode from the client to the Worker. */
export const PASSCODE_HEADER = "X-Kea-Passcode";

/** Bump when the keeper prompt changes in a way evals should notice. */
export const KEEPER_PROMPT_VERSION = "keeper-v1";

/** Theory grader (POST /keeper/grade, #32). */
export const GRADER_MAX_TOKENS = 4000;
export const GRADER_EFFORT = "low" as const;

/** Bump when the grader prompt or verdict rules change in a way evals should notice. */
export const GRADER_PROMPT_VERSION = "grader-v1";

export const THEORY_LIMITS = {
  /** Longest theory the Worker accepts (characters, after trimming). */
  theoryMaxChars: 1200,
} as const;

// ---------------------------------------------------------------------------
// Solvability check (#33): solver + ambiguity check, run by the generation
// scripts against the same keeper and grader players use.
// ---------------------------------------------------------------------------

export const SOLVABILITY_LIMITS = {
  /** Questions the solver may ask before it must submit a final theory (spec F19). */
  maxQuestions: 40,
  /** Theories the solver may submit in total, the final one included. */
  maxTheories: 3,
} as const;

export const SOLVER_MAX_TOKENS = 4000;
export const SOLVER_EFFORT = "medium" as const;
export const AMBIGUITY_MAX_TOKENS = 4000;
export const AMBIGUITY_EFFORT = "medium" as const;

/** Bump when the solver or ambiguity prompts change. */
export const SOLVER_PROMPT_VERSION = "solver-v1";

// ---------------------------------------------------------------------------
// Pricing (USD per million tokens), used only to ESTIMATE script costs in
// logs. Keep every price in this one table. Unknown models are reported as
// "unpriced" rather than guessed.
// ---------------------------------------------------------------------------

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  /** Cache reads; defaults to the input price. */
  cacheReadPerMTok?: number;
  /** Cache writes (5-minute TTL); defaults to the input price. */
  cacheWritePerMTok?: number;
}

export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
  [DEFAULT_ANTHROPIC_MODEL]: {
    inputPerMTok: 4,
    outputPerMTok: 20,
    cacheReadPerMTok: 0.2,
    cacheWritePerMTok: 5,
  },
  [DEFAULT_OPENAI_MODEL]: { inputPerMTok: 2.5, outputPerMTok: 10, cacheReadPerMTok: 1.25 },
};

// ---------------------------------------------------------------------------
// Case files (#37): AI investigator (POST /case/ask) and answer judge
// (POST /case/judge).
// ---------------------------------------------------------------------------

export const INVESTIGATOR_MAX_TOKENS = 4000;
export const INVESTIGATOR_EFFORT = "low" as const;
export const JUDGE_MAX_TOKENS = 4000;
export const JUDGE_EFFORT = "low" as const;

/** Bump when the investigator or judge prompts change in a way evals should notice. */
export const INVESTIGATOR_PROMPT_VERSION = "investigator-v1";
export const JUDGE_PROMPT_VERSION = "judge-v1";

export const CASE_AI_LIMITS = {
  /** Longest investigator question (characters, after trimming). */
  questionMaxChars: 300,
  /** Most opened evidence ids a request may list. */
  openedMaxEntries: 100,
  /** Most answers one judge request may carry. */
  answersMaxEntries: 20,
  /** Longest answer the judge accepts (mirrors CASE_INPUT_LIMITS.answerMaxChars). */
  answerMaxChars: 500,
  /** Longest investigator reply returned to players. */
  replyMaxChars: 1200,
} as const;

// ---------------------------------------------------------------------------
// Photo quick-add (#38): POST /author/photo transcribes a photographed card.
// ---------------------------------------------------------------------------

export const PHOTO_SCHEMA_NAME = "photo_transcription";
export const PHOTO_MAX_TOKENS = 4000;
export const PHOTO_EFFORT = "medium" as const;
/** Bump when the transcription prompt changes. */
export const PHOTO_PROMPT_VERSION = "photo-v1";
/** Pack slug used when the request names none. */
export const PHOTO_DEFAULT_PACK = "quick-add";

export const PHOTO_LIMITS = {
  /** Front and back. */
  maxImages: 2,
  /** Largest decoded image (bytes). The /add page downscales well below this. */
  maxImageBytes: 5 * 1024 * 1024,
  /**
   * Largest request body (bytes): two max-size images as base64 (4/3) plus
   * room for the JSON around them.
   */
  maxBodyBytes: Math.ceil((2 * 5 * 1024 * 1024 * 4) / 3) + 16 * 1024,
  /** Longest pack slug. */
  packMaxChars: 40,
  /** Longest `ref` kept from the photo (book / card number). */
  refMaxChars: 200,
} as const;
