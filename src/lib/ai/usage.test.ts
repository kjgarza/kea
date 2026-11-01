import { describe, expect, test } from "bun:test";
import { DEFAULT_ANTHROPIC_MODEL, MODEL_PRICING } from "./config";
import { anthropicUsage, createAnthropicProvider, createOpenAIProvider, createStubProvider, openAIUsage } from "./provider";
import { emptyUsage, estimateCostUsd, formatCostUsd, meterProvider, pricingFor, recordUsage, sumUsage } from "./usage";

const request = {
  system: "S",
  messages: [{ role: "user" as const, content: "Q" }],
  schema: { type: "object" },
  schemaName: "x",
};

function jsonFetch(body: unknown) {
  return async () => new Response(JSON.stringify(body), { status: 200 });
}

describe("provider usage", () => {
  test("anthropic responses carry usage, including cache tokens", async () => {
    const provider = createAnthropicProvider({
      apiKey: "k",
      fetch: jsonFetch({
        model: DEFAULT_ANTHROPIC_MODEL,
        stop_reason: "end_turn",
        content: [{ type: "text", text: "{}" }],
        usage: { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
      }),
    });
    const result = await provider.generateJson(request);
    expect(result.usage).toEqual({
      inputTokens: 1200,
      outputTokens: 80,
      cacheReadInputTokens: 900,
      cacheCreationInputTokens: 0,
    });
  });

  test("openai responses carry usage", async () => {
    const provider = createOpenAIProvider({
      apiKey: "k",
      fetch: jsonFetch({
        model: "gpt-4o",
        choices: [{ message: { content: "{}" } }],
        usage: { prompt_tokens: 50, completion_tokens: 7, total_tokens: 57 },
      }),
    });
    expect((await provider.generateJson(request)).usage).toEqual({ inputTokens: 50, outputTokens: 7 });
  });

  test("missing or malformed usage is tolerated", () => {
    expect(anthropicUsage(undefined)).toBeUndefined();
    expect(openAIUsage(null)).toBeUndefined();
    expect(anthropicUsage({ input_tokens: "x", output_tokens: -3 })).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

describe("cost estimation", () => {
  test("prices every token kind from the single pricing table", () => {
    const price = MODEL_PRICING[DEFAULT_ANTHROPIC_MODEL];
    const cost = estimateCostUsd(DEFAULT_ANTHROPIC_MODEL, {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadInputTokens: 1_000_000,
      cacheCreationInputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(
      price.inputPerMTok + price.outputPerMTok + price.cacheReadPerMTok! + price.cacheWritePerMTok!,
      6
    );
  });

  test("unknown models are unpriced, suffixed ids resolve to their base", () => {
    expect(estimateCostUsd("mystery-model", { inputTokens: 10, outputTokens: 10 })).toBeNull();
    expect(pricingFor(`${DEFAULT_ANTHROPIC_MODEL}-20990101`)).toBe(MODEL_PRICING[DEFAULT_ANTHROPIC_MODEL]);
    expect(pricingFor(`x-${DEFAULT_ANTHROPIC_MODEL}`)).toBeNull();
  });

  test("recordUsage counts unpriced and usage-less calls separately", () => {
    const totals = emptyUsage();
    recordUsage(totals, { model: DEFAULT_ANTHROPIC_MODEL, usage: { inputTokens: 1000, outputTokens: 100 } });
    recordUsage(totals, { model: "mystery", usage: { inputTokens: 5, outputTokens: 5 } });
    recordUsage(totals, { model: "stub" });
    expect(totals).toMatchObject({ calls: 3, callsWithoutUsage: 1, unpricedCalls: 1, inputTokens: 1005, outputTokens: 105 });
    expect(totals.costUsd).toBeCloseTo(1000 * 4e-6 + 100 * 20e-6, 9);
    expect(formatCostUsd(totals)).toBe("$0.0060 (partial)");
    expect(sumUsage([totals, totals]).calls).toBe(6);
  });

  test("meterProvider records each successful call", async () => {
    const totals = emptyUsage();
    const metered = meterProvider(createStubProvider(() => ({ ok: true })), totals);
    await metered.generateJson(request);
    await metered.generateJson(request);
    expect(totals.calls).toBe(2);
    expect(formatCostUsd(totals)).toBe("no usage reported");
    expect(formatCostUsd(emptyUsage())).toBe("$0.0000");
  });
});
