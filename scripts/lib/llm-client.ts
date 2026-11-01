import OpenAI from "openai";
import {
  ProviderError,
  createAnthropicProvider,
  createStubProvider,
  generateJsonWithRetry,
  isProviderName,
  type ChatMessage,
  type JsonGenerationRequest,
  type JsonGenerationResult,
  type LlmProvider,
  type ProviderName,
} from "../../src/lib/ai/provider";
import { DEFAULT_ANTHROPIC_MODEL, DEFAULT_OPENAI_MODEL } from "../../src/lib/ai/config";

export type { JsonGenerationRequest, JsonGenerationResult, LlmProvider, ProviderName };
export { ProviderError, generateJsonWithRetry };

let _openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const DEFAULT_MODEL = "gpt-4o";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export interface GenerationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate content with retry logic
 */
export async function generateWithRetry<T>(
  systemPrompt: string,
  prompt: string,
  parseResponse: (content: string) => T,
  temperature: number = 0.7,
  model: string = DEFAULT_MODEL
): Promise<GenerationResult<T>> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await getClient().chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response from OpenAI");
      }

      const data = parseResponse(content);
      return { success: true, data };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Attempt ${attempt + 1} failed:`, lastError.message);

      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  return {
    success: false,
    error: lastError?.message ?? "Unknown error",
  };
}

/**
 * Generate multiple items in parallel with rate limiting
 */
export async function generateBatch<T>(
  prompts: { prompt: string; systemPrompt: string }[],
  parseResponse: (content: string) => T,
  concurrency: number = 5,
  temperature: number = 0.7,
  model: string = DEFAULT_MODEL
): Promise<GenerationResult<T>[]> {
  const results: GenerationResult<T>[] = [];

  // Process in batches
  for (let i = 0; i < prompts.length; i += concurrency) {
    const batch = prompts.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(({ prompt, systemPrompt }) =>
        generateWithRetry(systemPrompt, prompt, parseResponse, temperature, model)
      )
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Generate cards for a deck
 * Returns raw JSON string that needs to be parsed by the caller
 */
export async function generateCards(
  systemPrompt: string,
  userPrompt: string
): Promise<GenerationResult<unknown[]>> {
  return generateWithRetry(systemPrompt, userPrompt, (content) => {
    const parsed = JSON.parse(content);
    // Handle both { cards: [...] } and direct array formats
    return Array.isArray(parsed) ? parsed : parsed.cards ?? [];
  });
}

/**
 * Generate a single card (for regeneration/retry scenarios)
 */
export async function generateSingleCard(
  systemPrompt: string,
  userPrompt: string
): Promise<GenerationResult<unknown>> {
  return generateWithRetry(systemPrompt, userPrompt, (content) => {
    const parsed = JSON.parse(content);
    return parsed;
  });
}

// ---------------------------------------------------------------------------
// Provider interface (spec §6.3)
//
// Deck generation above stays on the OpenAI SDK. Structured-output callers
// (keeper evals #30, solvability #33, grading/judging) use an `LlmProvider`,
// which is the same interface the Worker uses, so scripts exercise the same
// prompts and schemas as players.
// ---------------------------------------------------------------------------

function toOpenAIMessageContent(content: ChatMessage["content"]) {
  if (typeof content === "string") return content;
  return content.map((part) =>
    part.type === "text"
      ? { type: "text" as const, text: part.text }
      : {
          type: "image_url" as const,
          image_url: { url: `data:${part.mediaType};base64,${part.data}` },
        }
  );
}

/** OpenAI provider backed by the existing OpenAI SDK client. */
export function createOpenAISdkProvider(model: string = DEFAULT_OPENAI_MODEL): LlmProvider {
  return {
    name: "openai",
    model,
    async generateJson(request: JsonGenerationRequest): Promise<JsonGenerationResult> {
      let response;
      try {
        response = await getClient().chat.completions.create({
          model,
          max_tokens: request.maxTokens ?? 4000,
          messages: [
            { role: "system", content: request.system },
            ...request.messages.map((m) =>
              m.role === "user"
                ? { role: "user" as const, content: toOpenAIMessageContent(m.content) }
                : {
                    role: "assistant" as const,
                    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
                  }
            ),
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: request.schemaName, schema: request.schema, strict: true },
          },
        });
      } catch (error) {
        const status = (error as { status?: number }).status;
        throw new ProviderError("http", `OpenAI request failed: ${String(error)}`, status);
      }
      const message = response.choices[0]?.message;
      if (message?.refusal) throw new ProviderError("refusal", "Model declined the request");
      const text = message?.content ?? "";
      if (!text.trim()) throw new ProviderError("empty", "Model returned no text");
      try {
        return { data: JSON.parse(text), text, model: response.model ?? model, provider: "openai" };
      } catch {
        throw new ProviderError("invalid_json", "Model output is not valid JSON");
      }
    },
  };
}

export interface ProviderOptions {
  model?: string;
  /** Only for `stub`. */
  respond?: (request: JsonGenerationRequest) => unknown;
}

/**
 * Build a provider by name. Keys come from the environment
 * (ANTHROPIC_API_KEY / OPENAI_API_KEY; Bun loads .env).
 */
export function createLlmProvider(name: ProviderName, options: ProviderOptions = {}): LlmProvider {
  switch (name) {
    case "anthropic": {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
      return createAnthropicProvider({ apiKey, model: options.model ?? DEFAULT_ANTHROPIC_MODEL });
    }
    case "openai":
      if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
      return createOpenAISdkProvider(options.model ?? DEFAULT_OPENAI_MODEL);
    case "stub":
      return createStubProvider(options.respond ?? (() => ({})), options.model);
  }
}

/**
 * The keeper's provider for scripts: Anthropic by default, overridable with
 * KEEPER_PROVIDER (anthropic|openai|stub) and KEEPER_MODEL, the same
 * variables the Worker reads.
 */
export function getKeeperProvider(options: ProviderOptions = {}): LlmProvider {
  const name = process.env.KEEPER_PROVIDER?.trim() || "anthropic";
  if (!isProviderName(name)) throw new Error(`Unknown KEEPER_PROVIDER "${name}"`);
  return createLlmProvider(name, {
    ...options,
    model: options.model ?? (process.env.KEEPER_MODEL?.trim() || undefined),
  });
}
