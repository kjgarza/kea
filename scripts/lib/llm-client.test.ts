import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_ANTHROPIC_MODEL } from "../../src/lib/ai/config";
import { createLlmProvider, getKeeperProvider } from "./llm-client";

const saved = { ...process.env };
afterEach(() => {
  for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "KEEPER_PROVIDER", "KEEPER_MODEL"]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("provider interface", () => {
  test("the keeper defaults to Anthropic with the configured default model", () => {
    delete process.env.KEEPER_PROVIDER;
    delete process.env.KEEPER_MODEL;
    process.env.ANTHROPIC_API_KEY = "test";
    const provider = getKeeperProvider();
    expect([provider.name, provider.model]).toEqual(["anthropic", DEFAULT_ANTHROPIC_MODEL]);
  });

  test("KEEPER_PROVIDER / KEEPER_MODEL override it", () => {
    process.env.KEEPER_PROVIDER = "openai";
    process.env.KEEPER_MODEL = "some-model";
    process.env.OPENAI_API_KEY = "test";
    const provider = getKeeperProvider();
    expect([provider.name, provider.model]).toEqual(["openai", "some-model"]);
    process.env.KEEPER_PROVIDER = "nope";
    expect(() => getKeeperProvider()).toThrow(/Unknown KEEPER_PROVIDER/);
  });

  test("missing keys fail loudly; the stub needs none", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => createLlmProvider("anthropic")).toThrow(/ANTHROPIC_API_KEY/);
    const stub = createLlmProvider("stub", { respond: () => ({ answer: "no" }) });
    const result = await stub.generateJson({ system: "", messages: [], schema: {}, schemaName: "x" });
    expect(result.data).toEqual({ answer: "no" });
  });
});
