/**
 * Fetch-based LLM providers with JSON-schema structured output.
 *
 * Pure module: uses only `fetch` (injectable), so it runs in the Cloudflare
 * Worker, in Bun scripts and in tests with a mocked fetch. No SDKs.
 */
import {
  ANTHROPIC_API_VERSION,
  ANTHROPIC_FALLBACK_BETA,
  ANTHROPIC_MESSAGES_URL,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  OPENAI_CHAT_URL,
} from "./config";

export type ProviderName = "anthropic" | "openai" | "stub";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** A JSON Schema object. Keep to the subset both providers accept. */
export type JsonSchema = Record<string, unknown>;

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: string; data: string };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | ContentPart[];
}

export interface JsonGenerationRequest {
  system: string;
  messages: ChatMessage[];
  /** Schema the output must match (structured output). */
  schema: JsonSchema;
  /** Short identifier for the schema (OpenAI needs one). */
  schemaName: string;
  maxTokens?: number;
  /** Anthropic effort level; ignored by OpenAI. */
  effort?: "low" | "medium" | "high";
}

export interface JsonGenerationResult {
  /** Parsed JSON. Still untrusted: validate it against your own rules. */
  data: unknown;
  /** Raw text the model produced. */
  text: string;
  model: string;
  provider: ProviderName;
}

export interface LlmProvider {
  readonly name: ProviderName;
  readonly model: string;
  generateJson(request: JsonGenerationRequest): Promise<JsonGenerationResult>;
}

export type ProviderErrorKind = "http" | "refusal" | "truncated" | "invalid_json" | "empty";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "ProviderError";
  }

  /** Worth retrying: network/5xx/429 or a malformed reply. */
  get retryable(): boolean {
    if (this.kind === "http") return this.status === undefined || this.status === 429 || this.status >= 500;
    return this.kind === "invalid_json" || this.kind === "empty" || this.kind === "truncated";
  }
}

// Calling a global `fetch` through a stored reference throws "Illegal
// invocation" in Workers, so always wrap it.
const defaultFetch: FetchLike = (input, init) => fetch(input, init);

function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new ProviderError("empty", "Model returned no text");
  try {
    return JSON.parse(trimmed);
  } catch {
    // Tolerate a fenced block, just in case.
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        /* fall through */
      }
    }
    throw new ProviderError("invalid_json", "Model output is not valid JSON");
  }
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Anthropic (Messages API, raw HTTP)
// ---------------------------------------------------------------------------

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
  fetch?: FetchLike;
  baseUrl?: string;
  /** Server-side refusal fallback (default true). */
  fallbacks?: boolean;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicMessageResponse {
  model?: string;
  content?: AnthropicContentBlock[];
  stop_reason?: string;
}

function toAnthropicContent(content: ChatMessage["content"]) {
  if (typeof content === "string") return content;
  return content.map((part) =>
    part.type === "text"
      ? { type: "text", text: part.text }
      : {
          type: "image",
          source: { type: "base64", media_type: part.mediaType, data: part.data },
        }
  );
}

export function createAnthropicProvider(options: AnthropicProviderOptions): LlmProvider {
  const model = options.model || DEFAULT_ANTHROPIC_MODEL;
  const doFetch = options.fetch ?? defaultFetch;
  const url = options.baseUrl ?? ANTHROPIC_MESSAGES_URL;
  const useFallbacks = options.fallbacks ?? true;

  return {
    name: "anthropic",
    model,
    async generateJson(request) {
      const outputConfig: Record<string, unknown> = {
        format: { type: "json_schema", schema: request.schema },
      };
      if (request.effort) outputConfig.effort = request.effort;

      const body: Record<string, unknown> = {
        model,
        max_tokens: request.maxTokens ?? 4000,
        system: request.system,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: toAnthropicContent(m.content),
        })),
        output_config: outputConfig,
      };
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-api-key": options.apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      };
      if (useFallbacks) {
        body.fallbacks = "default";
        headers["anthropic-beta"] = ANTHROPIC_FALLBACK_BETA;
      }

      let response: Response;
      try {
        response = await doFetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      } catch (error) {
        throw new ProviderError("http", `Anthropic request failed: ${String(error)}`);
      }
      if (!response.ok) {
        const detail = await readErrorBody(response);
        throw new ProviderError("http", `Anthropic HTTP ${response.status}: ${detail}`, response.status);
      }

      const json = (await response.json()) as AnthropicMessageResponse;
      if (json.stop_reason === "refusal") {
        throw new ProviderError("refusal", "Model declined the request");
      }
      const text = (json.content ?? [])
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
        .join("");
      if (json.stop_reason === "max_tokens" && !text.trim()) {
        throw new ProviderError("truncated", "Model hit max_tokens before answering");
      }
      return { data: parseJsonText(text), text, model: json.model ?? model, provider: "anthropic" };
    },
  };
}

// ---------------------------------------------------------------------------
// OpenAI (Chat Completions, raw HTTP)
// ---------------------------------------------------------------------------

export interface OpenAIProviderOptions {
  apiKey: string;
  model?: string;
  fetch?: FetchLike;
  baseUrl?: string;
}

interface OpenAIChatResponse {
  model?: string;
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
}

function toOpenAIContent(content: ChatMessage["content"]) {
  if (typeof content === "string") return content;
  return content.map((part) =>
    part.type === "text"
      ? { type: "text", text: part.text }
      : { type: "image_url", image_url: { url: `data:${part.mediaType};base64,${part.data}` } }
  );
}

export function createOpenAIProvider(options: OpenAIProviderOptions): LlmProvider {
  const model = options.model || DEFAULT_OPENAI_MODEL;
  const doFetch = options.fetch ?? defaultFetch;
  const url = options.baseUrl ?? OPENAI_CHAT_URL;

  return {
    name: "openai",
    model,
    async generateJson(request) {
      const body = {
        model,
        max_tokens: request.maxTokens ?? 4000,
        messages: [
          { role: "system", content: request.system },
          ...request.messages.map((m) => ({ role: m.role, content: toOpenAIContent(m.content) })),
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: request.schemaName, schema: request.schema, strict: true },
        },
      };
      let response: Response;
      try {
        response = await doFetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch (error) {
        throw new ProviderError("http", `OpenAI request failed: ${String(error)}`);
      }
      if (!response.ok) {
        const detail = await readErrorBody(response);
        throw new ProviderError("http", `OpenAI HTTP ${response.status}: ${detail}`, response.status);
      }
      const json = (await response.json()) as OpenAIChatResponse;
      const choice = json.choices?.[0];
      if (choice?.message?.refusal) throw new ProviderError("refusal", "Model declined the request");
      const text = choice?.message?.content ?? "";
      return { data: parseJsonText(text), text, model: json.model ?? model, provider: "openai" };
    },
  };
}

// ---------------------------------------------------------------------------
// Stub (tests and offline local dev)
// ---------------------------------------------------------------------------

export function createStubProvider(
  respond: (request: JsonGenerationRequest) => unknown | Promise<unknown>,
  model = "stub"
): LlmProvider {
  return {
    name: "stub",
    model,
    async generateJson(request) {
      const data = await respond(request);
      return { data, text: JSON.stringify(data), model, provider: "stub" };
    },
  };
}

// ---------------------------------------------------------------------------
// Factory + retry
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  provider: ProviderName;
  apiKey?: string;
  model?: string;
  fetch?: FetchLike;
  /** Only for `stub`. */
  respond?: (request: JsonGenerationRequest) => unknown | Promise<unknown>;
}

export function createProvider(config: ProviderConfig): LlmProvider {
  switch (config.provider) {
    case "anthropic":
      if (!config.apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
      return createAnthropicProvider({ apiKey: config.apiKey, model: config.model, fetch: config.fetch });
    case "openai":
      if (!config.apiKey) throw new Error("OPENAI_API_KEY is not set");
      return createOpenAIProvider({ apiKey: config.apiKey, model: config.model, fetch: config.fetch });
    case "stub":
      return createStubProvider(config.respond ?? (() => ({})), config.model);
  }
}

export function isProviderName(value: unknown): value is ProviderName {
  return value === "anthropic" || value === "openai" || value === "stub";
}

/** Run `generateJson` with retries on retryable errors (linear backoff). */
export async function generateJsonWithRetry(
  provider: LlmProvider,
  request: JsonGenerationRequest,
  { attempts = 3, delayMs = 1000 }: { attempts?: number; delayMs?: number } = {}
): Promise<JsonGenerationResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await provider.generateJson(request);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof ProviderError ? error.retryable : true;
      if (!retryable || attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
  throw lastError;
}
