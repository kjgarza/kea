import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { KVNamespace } from "@cloudflare/workers-types";
import type { JsonGenerationRequest, LlmProvider } from "../../src/lib/ai/provider";
import { ProviderError, createStubProvider } from "../../src/lib/ai/provider";
import { PHOTO_LIMITS, PHOTO_SCHEMA_NAME } from "../../src/lib/ai/config";
import { parsePuzzlePack, puzzlePackToDeck } from "../../src/lib/puzzles/puzzle-pack";
import type { Env } from "./env";
import { DeckLoader } from "./decks";
import { createRateLimiter, dailyLimit, kvCounterStore } from "./rate-limit";
import { handleRequest, type WorkerDeps } from "./router";

const SITE = "https://example.github.io/kea";
const ORIGIN = "https://example.github.io";

const baseEnv: Env = {
  SITE_ORIGIN: SITE,
  KEA_PASSCODES: "open-sesame",
  DAILY_LIMIT: "50",
  KEEPER_PROVIDER: "stub",
};

/** Base64 of `bytes` followed by a recognisable filler, so tests can look for it. */
function fakeImage(magic: number[], size = 512): string {
  const bytes = new Uint8Array(size);
  bytes.set(magic);
  for (let i = magic.length; i < size; i++) bytes[i] = 65 + (i % 26); // "ABC…"
  return Buffer.from(bytes).toString("base64");
}

const JPEG = fakeImage([0xff, 0xd8, 0xff, 0xe0]);
const PNG = fakeImage([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HEIC = fakeImage([0, 0, 0, 0x18, ...Array.from("ftypheic", (c) => c.charCodeAt(0))]);
/** A distinctive slice of the image payload that must never leave the request. */
const JPEG_MARKER = JPEG.slice(40, 80);

const TRANSCRIPTION = {
  readable: true,
  title: "The Cold Coffee",
  setup: "A man orders a hot coffee, pays, and pours it straight into the snow outside the cafe. Then he smiles.",
  solution:
    "His car's windscreen was frozen solid and he had no scraper. The hot coffee melted the ice on the windscreen so he could drive to work.",
  keyFacts: [
    "His car windscreen was frozen.",
    "He had nothing to scrape the ice with.",
    "The hot coffee melted the ice.",
    "He needed to drive somewhere.",
  ],
  hints: ["He never wanted to drink it.", "Think about what is parked outside."],
  difficulty: "easy",
  contentWarnings: [],
  ref: "Winter Puzzles, card 12",
};

interface FakeKv {
  kv: KVNamespace;
  writes: { key: string; value: string }[];
}

function fakeKv(): FakeKv {
  const data = new Map<string, string>();
  const writes: { key: string; value: string }[] = [];
  const kv = {
    async get(key: string) {
      return data.get(key) ?? null;
    },
    async put(key: string, value: string) {
      writes.push({ key, value: String(value) });
      data.set(key, String(value));
    },
    async delete() {
      throw new Error("unexpected delete");
    },
    async list() {
      throw new Error("unexpected list");
    },
    async getWithMetadata() {
      throw new Error("unexpected getWithMetadata");
    },
  } as unknown as KVNamespace;
  return { kv, writes };
}

function harness(options: { respond?: (req: JsonGenerationRequest) => unknown; provider?: LlmProvider; limit?: string } = {}) {
  const prompts: JsonGenerationRequest[] = [];
  const deckFetches: string[] = [];
  const cacheCalls: string[] = [];
  const { kv, writes } = fakeKv();
  const env: Env = { ...baseEnv, RATE_LIMIT: kv, ...(options.limit ? { DAILY_LIMIT: options.limit } : {}) };
  const edgeCache = {
    match: async () => {
      cacheCalls.push("match");
      return undefined;
    },
    put: async () => {
      cacheCalls.push("put");
    },
    delete: async () => {
      cacheCalls.push("delete");
      return false;
    },
  } as unknown as Cache;
  const provider =
    options.provider ??
    createStubProvider((req) => {
      prompts.push(req);
      return options.respond ? options.respond(req) : TRANSCRIPTION;
    });
  const deps: WorkerDeps = {
    decks: new DeckLoader({
      siteOrigin: SITE,
      fetch: async (url: string) => {
        deckFetches.push(url);
        return new Response("missing", { status: 404 });
      },
      edgeCache,
    }),
    rateLimiter: createRateLimiter(kvCounterStore(kv), dailyLimit(env)),
    provider: () => provider,
    now: () => new Date("2026-10-30T12:00:00Z"),
  };
  return { deps, env, prompts, writes, deckFetches, cacheCalls };
}

function photo(body: unknown, { passcode = "open-sesame", origin = ORIGIN }: { passcode?: string | null; origin?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (passcode !== null) headers["X-Kea-Passcode"] = passcode;
  if (origin !== null) headers.Origin = origin;
  return new Request("https://worker.example/author/photo", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = (extra: Record<string, unknown> = {}) => ({
  images: [
    { mediaType: "image/jpeg", data: JPEG },
    { mediaType: "image/png", data: PNG },
  ],
  lang: "en",
  pack: "winter-puzzles",
  ...extra,
});

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

// Capture every console line so tests can assert nothing sensitive is logged.
const logged: string[] = [];
const originals = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
beforeEach(() => {
  logged.length = 0;
  for (const level of Object.keys(originals) as (keyof typeof originals)[]) {
    console[level] = (...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    };
  }
});
afterEach(() => Object.assign(console, originals));

describe("POST /author/photo", () => {
  test("returns YAML in the import format that imports cleanly", async () => {
    const h = harness();
    const res = await handleRequest(photo(validBody()), h.env, h.deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { yaml: string; fileName: string; errors: string[] };
    expect(Object.keys(body).sort()).toEqual(["errors", "fileName", "yaml"]);
    expect(body.errors).toEqual([]);
    expect(body.fileName).toBe("decks/puzzles/winter-puzzles-en.yaml");

    const parsed = parsePuzzlePack(body.yaml, { fileName: body.fileName });
    expect(parsed.errors).toEqual([]);
    const { deck, errors } = puzzlePackToDeck(parsed.value!, { version: "2026-10-30T00:00:00.000Z" });
    expect(errors).toEqual([]);
    expect(deck!.deckId).toBe("winter-puzzles-en-situation");
    const [card] = deck!.cards;
    expect(card.cardId).toBe("the-cold-coffee");
    expect(card.keyFacts).toHaveLength(4);
    expect(card.source).toEqual({ origin: "transcribed", pack: "winter-puzzles", ref: "Winter Puzzles, card 12" });
  });

  test("sends both photos to the vision model with structured output", async () => {
    const h = harness();
    await handleRequest(photo(validBody({ lang: "es" })), h.env, h.deps);
    expect(h.prompts).toHaveLength(1);
    const [req] = h.prompts;
    expect(req.schemaName).toBe(PHOTO_SCHEMA_NAME);
    const content = req.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    const images = (content as { type: string; mediaType?: string; data?: string }[]).filter((p) => p.type === "image");
    expect(images).toEqual([
      { type: "image", mediaType: "image/jpeg", data: JPEG },
      { type: "image", mediaType: "image/png", data: PNG },
    ]);
    expect(JSON.stringify(content)).toContain("Spanish");
  });

  test("defaults the pack and accepts a single photo", async () => {
    const h = harness();
    const res = await handleRequest(photo({ images: [{ mediaType: "image/jpeg", data: JPEG }], lang: "es" }), h.env, h.deps);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { fileName: string }).fileName).toBe("decks/puzzles/quick-add-es.yaml");
  });

  test("validator problems come back with the YAML so they can be fixed in the editor", async () => {
    const h = harness({ respond: () => ({ ...TRANSCRIPTION, keyFacts: ["Only one fact."], hints: [] }) });
    const res = await handleRequest(photo(validBody()), h.env, h.deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { yaml: string; errors: string[] };
    expect(body.yaml).toContain("Only one fact.");
    expect(body.errors.join("\n")).toContain("'keyFacts' has 1 items");
    expect(body.errors.join("\n")).toContain("'hints' has 0 items");
  });

  test("never stores or logs the images (no KV beyond the counter, no cache, no deck fetch)", async () => {
    const h = harness();
    expect((await handleRequest(photo(validBody()), h.env, h.deps)).status).toBe(200);
    // Upstream failures log something; make sure that is not the image either.
    const failing: LlmProvider = {
      name: "stub",
      model: "stub",
      generateJson: async () => {
        throw new ProviderError("http", "upstream said no", 500);
      },
    };
    const h2 = harness({ provider: failing });
    expect((await handleRequest(photo(validBody()), h2.env, h2.deps)).status).toBe(502);

    for (const run of [h, h2]) {
      // The only storage write is the daily counter: a number under a hashed passcode key.
      expect(run.writes.length).toBeLessThanOrEqual(1);
      for (const write of run.writes) {
        expect(write.value).toMatch(/^\d+$/);
        expect(write.key).not.toContain(JPEG_MARKER);
      }
      expect(run.cacheCalls).toEqual([]);
      expect(run.deckFetches).toEqual([]);
    }
    const allLogs = logged.join("\n");
    expect(allLogs).not.toContain(JPEG_MARKER);
    expect(allLogs).not.toContain(PNG.slice(40, 80));
    expect(allLogs).not.toContain(TRANSCRIPTION.solution);
  });

  test("rejects oversized images with 413 before calling the model", async () => {
    const h = harness();
    const big = fakeImage([0xff, 0xd8, 0xff, 0xe0], PHOTO_LIMITS.maxImageBytes + 3);
    const res = await handleRequest(photo(validBody({ images: [{ mediaType: "image/jpeg", data: big }] })), h.env, h.deps);
    expect(res.status).toBe(413);
    expect(await errorCode(res)).toBe("payload_too_large");

    const declared = new Request("https://worker.example/author/photo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(PHOTO_LIMITS.maxBodyBytes + 1),
        "X-Kea-Passcode": "open-sesame",
        Origin: ORIGIN,
      },
      body: "{}",
    });
    expect((await handleRequest(declared, h.env, h.deps)).status).toBe(413);
    expect(h.prompts).toHaveLength(0);
    expect(h.writes).toEqual([]); // not metered either
  });

  test("rejects invalid images and bodies with 400 before calling the model", async () => {
    const h = harness();
    const bad: unknown[] = [
      "not json",
      [],
      {},
      { images: [], lang: "en" },
      { images: [{ mediaType: "image/jpeg", data: JPEG }, { mediaType: "image/jpeg", data: JPEG }, { mediaType: "image/jpeg", data: JPEG }], lang: "en" },
      validBody({ lang: "fr" }),
      validBody({ pack: "Not A Slug" }),
      validBody({ pack: "../etc" }),
      validBody({ images: [{ mediaType: "image/heic", data: HEIC }] }),
      validBody({ images: [{ mediaType: "image/jpeg", data: HEIC }] }),
      validBody({ images: [{ mediaType: "image/png", data: JPEG }] }),
      validBody({ images: [{ mediaType: "image/jpeg", data: "data:image/jpeg;base64," + JPEG }] }),
      validBody({ images: [{ mediaType: "image/jpeg", data: "@@@@" }] }),
      validBody({ images: [{ mediaType: "image/jpeg" }] }),
      validBody({ images: ["x"] }),
    ];
    for (const body of bad) {
      const res = await handleRequest(photo(body), h.env, h.deps);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe("bad_request");
    }
    expect(h.prompts).toHaveLength(0);
  });

  test("an unreadable photo is 422; junk output and refusals are a retryable 502", async () => {
    const unreadable = harness({ respond: () => ({ ...TRANSCRIPTION, readable: false, title: "", setup: "", solution: "" }) });
    const res = await handleRequest(photo(validBody()), unreadable.env, unreadable.deps);
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe("unreadable_image");

    const junk = harness({ respond: () => "hello" });
    expect((await handleRequest(photo(validBody()), junk.env, junk.deps)).status).toBe(502);

    const refusing: LlmProvider = {
      name: "stub",
      model: "stub",
      generateJson: async () => {
        throw new ProviderError("refusal", "declined");
      },
    };
    const h = harness({ provider: refusing });
    const refused = await handleRequest(photo(validBody()), h.env, h.deps);
    expect(refused.status).toBe(502);
    expect(await errorCode(refused)).toBe("upstream_error");
  });

  test("uses the shared passcode, origin and daily-limit middleware", async () => {
    const h = harness({ limit: "1" });
    expect((await handleRequest(photo(validBody(), { passcode: null }), h.env, h.deps)).status).toBe(401);
    expect((await handleRequest(photo(validBody(), { origin: "https://evil.example" }), h.env, h.deps)).status).toBe(403);
    expect(h.prompts).toHaveLength(0);
    const first = await handleRequest(photo(validBody()), h.env, h.deps);
    expect(first.status).toBe(200);
    expect(first.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const second = await handleRequest(photo(validBody()), h.env, h.deps);
    expect(second.status).toBe(429);
    expect(h.prompts).toHaveLength(1);
  });
});
