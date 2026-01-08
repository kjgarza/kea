import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = "gpt-4o";
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
  prompt: string,
  systemPrompt: string,
  parseResponse: (content: string) => T
): Promise<GenerationResult<T>> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
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
  concurrency: number = 5
): Promise<GenerationResult<T>[]> {
  const results: GenerationResult<T>[] = [];

  // Process in batches
  for (let i = 0; i < prompts.length; i += concurrency) {
    const batch = prompts.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(({ prompt, systemPrompt }) =>
        generateWithRetry(prompt, systemPrompt, parseResponse)
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
