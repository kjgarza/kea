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
