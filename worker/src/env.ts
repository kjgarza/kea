/**
 * Worker bindings. Secrets are set with `wrangler secret put`, vars live in
 * wrangler.toml, and the KV namespace is optional (see wrangler.toml).
 */
import type { KVNamespace } from "@cloudflare/workers-types";

export interface Env {
  /** Base URL of the deployed site, e.g. https://kjgarza.github.io/kea (decks at `${SITE_ORIGIN}/decks/<id>.json`). */
  SITE_ORIGIN: string;
  /** Comma-separated origins allowed by CORS. Default: the origin of SITE_ORIGIN. */
  ALLOWED_ORIGINS?: string;
  /** Requests per passcode per UTC day. "0" disables the limit. Default 200. */
  DAILY_LIMIT?: string;
  /** "anthropic" (default), "openai" or "stub" (offline local dev only). */
  KEEPER_PROVIDER?: string;
  /** Overrides the default model id from src/lib/ai/config.ts. */
  KEEPER_MODEL?: string;
  /** Deck cache lifetime in seconds. Default 600. */
  DECK_CACHE_TTL?: string;

  /** Secret: comma- or newline-separated passcodes. Required. */
  KEA_PASSCODES?: string;
  /** Secret: required when KEEPER_PROVIDER is anthropic. */
  ANTHROPIC_API_KEY?: string;
  /** Secret: required when KEEPER_PROVIDER is openai. */
  OPENAI_API_KEY?: string;

  /** Optional KV namespace for the per-passcode daily limit. */
  RATE_LIMIT?: KVNamespace;
}
