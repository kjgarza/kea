import { describe, expect, test } from "bun:test";
import { ANTHROPIC_API_VERSION, ANTHROPIC_FALLBACK_BETA, DEFAULT_ANTHROPIC_MODEL } from "./config";
import {
  ProviderError,
  createAnthropicProvider,
  createOpenAIProvider,
  generateJsonWithRetry,
  type JsonGenerationRequest,
} from "./provider";

const request: JsonGenerationRequest = {
  system: "SYS",
  messages: [{ role: "user", content: "Q" }],
  schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false },
  schemaName: "keeper_answer",
  maxTokens: 123,
  effort: "low",
};

function mockFetch(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetch, calls };
}

describe("anthropic provider", () => {
  test("sends a structured-output Messages request and parses the text block", async () => {
    const { fetch, calls } = mockFetch({
      model: DEFAULT_ANTHROPIC_MODEL,
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "" },
        { type: "text", text: '{"answer":"yes"}' },
      ],
    });
    const provider = createAnthropicProvider({ apiKey: "sk-test", fetch });
    const result = await provider.generateJson(request);
    expect(result.data).toEqual({ answer: "yes" });
    expect(provider.model).toBe(DEFAULT_ANTHROPIC_MODEL);

    const { url, init } = calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-version"]).toBe(ANTHROPIC_API_VERSION);
    expect(headers["anthropic-beta"]).toBe(ANTHROPIC_FALLBACK_BETA);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 123,
      system: "SYS",
      messages: [{ role: "user", content: "Q" }],
      output_config: { format: { type: "json_schema", schema: request.schema }, effort: "low" },
      fallbacks: "default",
    });
    // Sampling parameters are rejected on current API versions.
    expect(body.temperature).toBeUndefined();
  });

  test("maps images to base64 image blocks", async () => {
    const { fetch, calls } = mockFetch({ content: [{ type: "text", text: "{}" }] });
    await createAnthropicProvider({ apiKey: "k", fetch, fallbacks: false }).generateJson({
      ...request,
      messages: [{ role: "user", content: [{ type: "image", mediaType: "image/png", data: "AAA" }] }],
    });
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.messages[0].content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "AAA" },
    });
    expect(body.fallbacks).toBeUndefined();
  });

  test("refusal, HTTP and JSON errors are typed", async () => {
    const refusal = mockFetch({ stop_reason: "refusal", content: [] });
    await expect(createAnthropicProvider({ apiKey: "k", fetch: refusal.fetch }).generateJson(request)).rejects.toMatchObject({
      kind: "refusal",
    });
    const http = mockFetch({ error: {} }, 529);
    const err = await createAnthropicProvider({ apiKey: "k", fetch: http.fetch })
      .generateJson(request)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect([err.kind, err.status, err.retryable]).toEqual(["http", 529, true]);
    const junk = mockFetch({ content: [{ type: "text", text: "not json" }] });
    await expect(createAnthropicProvider({ apiKey: "k", fetch: junk.fetch }).generateJson(request)).rejects.toMatchObject({
      kind: "invalid_json",
    });
  });
});

describe("openai provider", () => {
  test("sends a json_schema response_format and parses the message", async () => {
    const { fetch, calls } = mockFetch({ model: "m", choices: [{ message: { content: '{"answer":"no"}' } }] });
    const result = await createOpenAIProvider({ apiKey: "k", model: "m", fetch }).generateJson(request);
    expect(result.data).toEqual({ answer: "no" });
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.messages[0]).toEqual({ role: "system", content: "SYS" });
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "keeper_answer", schema: request.schema, strict: true },
    });
  });
});

describe("generateJsonWithRetry", () => {
  test("retries retryable errors only", async () => {
    let calls = 0;
    const flaky = {
      name: "stub" as const,
      model: "s",
      generateJson: async () => {
        calls++;
        if (calls < 2) throw new ProviderError("http", "overloaded", 529);
        return { data: { ok: true }, text: "", model: "s", provider: "stub" as const };
      },
    };
    expect((await generateJsonWithRetry(flaky, request, { delayMs: 0 })).data).toEqual({ ok: true });

    calls = 0;
    const bad = {
      ...flaky,
      generateJson: async () => {
        calls++;
        throw new ProviderError("http", "bad request", 400);
      },
    };
    await expect(generateJsonWithRetry(bad, request, { delayMs: 0 })).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toBe(1);
  });
});
