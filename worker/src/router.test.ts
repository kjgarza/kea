import { describe, expect, test } from "bun:test";
import type { JsonGenerationRequest, LlmProvider } from "../../src/lib/ai/provider";
import { ProviderError, createStubProvider } from "../../src/lib/ai/provider";
import type { Env } from "./env";
import { DeckLoader } from "./decks";
import { createRateLimiter, dailyLimit, memoryCounterStore } from "./rate-limit";
import { handleRequest, providerFromEnv, type WorkerDeps } from "./router";
import { passcodeId } from "./auth";
import { FAILED_PASSCODE_DAILY_LIMIT, JSON_BODY_MAX_BYTES } from "../../src/lib/ai/config";
import { stubKeeperRespond } from "../../src/lib/ai/stub-keeper";
import { GRADER_SCHEMA_NAME } from "../../src/lib/ai/grade";

const SITE = "https://example.github.io/kea";
const ORIGIN = "https://example.github.io";

const FIXTURE_DECK = {
  schemaVersion: 1,
  deckId: "fixture-en-situation",
  version: "2026-01-01T00:00:00.000Z",
  name: "Fixture",
  gameType: "situation",
  language: "en",
  difficulty: "easy",
  topics: [],
  nsfw: false,
  cards: [
    {
      cardId: "bus",
      type: "situation",
      title: "The bus",
      setup: "Every weekday Anna catches the 8:00 bus, but today she let it go by and smiled.",
      solution: "SERVER-SIDE-SOLUTION: her son had just qualified as a bus driver and was driving the next one.",
      keyFacts: [
        { id: "son", text: "The driver of the next bus is her son" },
        { id: "first-day", text: "It is his first day as a driver" },
        { id: "proud", text: "She waited to ride with him" },
      ],
      hints: ["Think about who drives the next bus."],
    },
    { cardId: "not-a-puzzle", type: "charades", prompt: "Dance" },
  ],
};

const baseEnv: Env = {
  SITE_ORIGIN: SITE,
  KEA_PASSCODES: "open-sesame, second-code",
  DAILY_LIMIT: "3",
  KEEPER_PROVIDER: "stub",
};

interface Harness {
  deps: WorkerDeps;
  deckFetches: string[];
  prompts: JsonGenerationRequest[];
  setNow(date: Date): void;
}

function harness(
  options: {
    respond?: (req: JsonGenerationRequest) => unknown;
    provider?: LlmProvider;
    env?: Env;
    deckStatus?: number;
  } = {}
): Harness {
  const deckFetches: string[] = [];
  const prompts: JsonGenerationRequest[] = [];
  let now = new Date("2026-10-30T12:00:00Z");
  const deckFetch = async (url: string) => {
    deckFetches.push(url);
    if (options.deckStatus) return new Response("nope", { status: options.deckStatus });
    if (!url.endsWith("/decks/fixture-en-situation.json")) return new Response("missing", { status: 404 });
    return new Response(JSON.stringify(FIXTURE_DECK), { headers: { "content-type": "application/json" } });
  };
  const provider =
    options.provider ??
    createStubProvider((req) => {
      prompts.push(req);
      return options.respond ? options.respond(req) : { answer: "yes", factIds: ["son"], confidence: 0.9 };
    });
  const deps: WorkerDeps = {
    decks: new DeckLoader({ siteOrigin: SITE, fetch: deckFetch, now: () => now.getTime() }),
    rateLimiter: createRateLimiter(memoryCounterStore(), dailyLimit(options.env ?? baseEnv)),
    provider: () => provider,
    now: () => now,
  };
  return { deps, deckFetches, prompts, setNow: (d) => (now = d) };
}

function ask(
  body: Record<string, unknown> = {},
  { passcode = "open-sesame", origin = ORIGIN }: { passcode?: string | null; origin?: string | null } = {}
): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (passcode !== null) headers["X-Kea-Passcode"] = passcode;
  if (origin !== null) headers.Origin = origin;
  return new Request("https://worker.example/keeper/ask", {
    method: "POST",
    headers,
    body: JSON.stringify({
      deckId: "fixture-en-situation",
      cardId: "bus",
      lang: "en",
      transcript: [],
      question: "Is the bus driver related to Anna?",
      ...body,
    }),
  });
}

describe("passcode", () => {
  test("rejects a request without the passcode", async () => {
    const h = harness();
    const res = await handleRequest(ask({}, { passcode: null }), baseEnv, h.deps);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("unauthorized");
    expect(h.prompts).toHaveLength(0);
  });

  test("rejects a wrong passcode", async () => {
    const h = harness();
    const res = await handleRequest(ask({}, { passcode: "open-sesame!" }), baseEnv, h.deps);
    expect(res.status).toBe(401);
  });

  test("accepts any configured passcode", async () => {
    const h = harness();
    expect((await handleRequest(ask(), baseEnv, h.deps)).status).toBe(200);
    expect((await handleRequest(ask({}, { passcode: "second-code" }), baseEnv, h.deps)).status).toBe(200);
  });

  test("fails closed when no passcode is configured", async () => {
    const h = harness();
    const res = await handleRequest(ask(), { ...baseEnv, KEA_PASSCODES: "" }, h.deps);
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("misconfigured");
  });
});

describe("origin / CORS", () => {
  test("rejects a browser request from another origin", async () => {
    const h = harness();
    const res = await handleRequest(ask({}, { origin: "https://evil.example" }), baseEnv, h.deps);
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(h.prompts).toHaveLength(0);
  });

  test("rejects a preflight from another origin", async () => {
    const h = harness();
    const req = new Request("https://worker.example/keeper/ask", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" },
    });
    expect((await handleRequest(req, baseEnv, h.deps)).status).toBe(403);
  });

  test("answers a preflight from the Pages origin without a passcode", async () => {
    const h = harness();
    const req = new Request("https://worker.example/keeper/ask", {
      method: "OPTIONS",
      headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST" },
    });
    const res = await handleRequest(req, baseEnv, h.deps);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("X-Kea-Passcode");
  });

  test("echoes the allowed origin on real responses, including errors", async () => {
    const h = harness();
    const ok = await handleRequest(ask(), baseEnv, h.deps);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    const denied = await handleRequest(ask({}, { passcode: "nope" }), baseEnv, h.deps);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });

  test("ALLOWED_ORIGINS overrides the SITE_ORIGIN default", async () => {
    const h = harness();
    const env = { ...baseEnv, ALLOWED_ORIGINS: "http://localhost:3000" };
    expect((await handleRequest(ask(), env, h.deps)).status).toBe(403);
    expect((await handleRequest(ask({}, { origin: "http://localhost:3000" }), env, h.deps)).status).toBe(200);
  });

  test("allows requests without an Origin header (curl, scripts) that carry the passcode", async () => {
    const h = harness();
    expect((await handleRequest(ask({}, { origin: null }), baseEnv, h.deps)).status).toBe(200);
  });
});

describe("daily limit", () => {
  test("returns 429 once the per-passcode limit is reached, per passcode, until the next UTC day", async () => {
    const h = harness();
    for (let i = 0; i < 3; i++) {
      const res = await handleRequest(ask(), baseEnv, h.deps);
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe(String(2 - i));
    }
    const limited = await handleRequest(ask(), baseEnv, h.deps);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBe(12 * 3600);
    expect(h.prompts).toHaveLength(3);

    // Another passcode has its own budget.
    expect((await handleRequest(ask({}, { passcode: "second-code" }), baseEnv, h.deps)).status).toBe(200);

    h.setNow(new Date("2026-10-31T00:00:01Z"));
    expect((await handleRequest(ask(), baseEnv, h.deps)).status).toBe(200);
  });

  test("rejected requests (bad passcode) do not use the quota; /status peeks without counting", async () => {
    const h = harness();
    await handleRequest(ask({}, { passcode: "wrong" }), baseEnv, h.deps);
    await handleRequest(ask(), baseEnv, h.deps);
    const status = await handleRequest(
      new Request("https://worker.example/status", {
        headers: { "X-Kea-Passcode": "open-sesame", Origin: ORIGIN },
      }),
      baseEnv,
      h.deps
    );
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ ok: true, remaining: 2, limit: 3 });
    const again = await handleRequest(
      new Request("https://worker.example/status", { headers: { "X-Kea-Passcode": "open-sesame" } }),
      baseEnv,
      h.deps
    );
    expect(((await again.json()) as { remaining: number }).remaining).toBe(2);
  });

  test("DAILY_LIMIT=0 disables the limit", async () => {
    const env = { ...baseEnv, DAILY_LIMIT: "0" };
    const h = harness({ env });
    for (let i = 0; i < 5; i++) expect((await handleRequest(ask(), env, h.deps)).status).toBe(200);
  });

  test("a failing counter store fails open", async () => {
    const h = harness();
    h.deps.rateLimiter = createRateLimiter(
      {
        get: async () => {
          throw new Error("KV down");
        },
        put: async () => {},
      },
      1
    );
    for (let i = 0; i < 3; i++) expect((await handleRequest(ask(), baseEnv, h.deps)).status).toBe(200);
  });
});

describe("deck loading", () => {
  test("fetches the deck from SITE_ORIGIN once and caches it in memory", async () => {
    const h = harness({ env: { ...baseEnv, DAILY_LIMIT: "0" } });
    const env = { ...baseEnv, DAILY_LIMIT: "0" };
    await Promise.all([handleRequest(ask(), env, h.deps), handleRequest(ask(), env, h.deps)]);
    await handleRequest(ask(), env, h.deps);
    expect(h.deckFetches).toEqual([`${SITE}/decks/fixture-en-situation.json`]);
  });

  test("refetches after the TTL expires", async () => {
    let now = 0;
    const urls: string[] = [];
    const loader = new DeckLoader({
      siteOrigin: SITE,
      ttlSeconds: 60,
      now: () => now,
      fetch: async (url) => {
        urls.push(url);
        return new Response(JSON.stringify(FIXTURE_DECK));
      },
    });
    await loader.load("fixture-en-situation");
    now = 59_000;
    await loader.load("fixture-en-situation");
    expect(urls).toHaveLength(1);
    now = 61_000;
    await loader.load("fixture-en-situation");
    expect(urls).toHaveLength(2);
  });

  test("uses and fills the edge cache", async () => {
    const store = new Map<string, Response>();
    const edgeCache = {
      match: async (url: string) => store.get(url)?.clone(),
      put: async (url: string, res: Response) => void store.set(url, res),
    } as unknown as Cache;
    let fetches = 0;
    const fetchDeck = async () => {
      fetches++;
      return new Response(JSON.stringify(FIXTURE_DECK));
    };
    await new DeckLoader({ siteOrigin: SITE, fetch: fetchDeck, edgeCache }).load("fixture-en-situation");
    // A fresh isolate (new loader, empty memory) is served by the edge cache.
    const deck = await new DeckLoader({ siteOrigin: SITE, fetch: fetchDeck, edgeCache }).load(
      "fixture-en-situation"
    );
    expect(fetches).toBe(1);
    expect(deck.cards).toHaveLength(2);
  });

  test("unknown deck -> 404, origin failure -> 502, unknown card -> 404, wrong card type -> 400", async () => {
    const h = harness();
    expect((await handleRequest(ask({ deckId: "nope-en-situation" }), baseEnv, h.deps)).status).toBe(404);
    expect((await handleRequest(ask({ cardId: "missing" }), baseEnv, h.deps)).status).toBe(404);
    expect((await handleRequest(ask({ cardId: "not-a-puzzle" }), baseEnv, h.deps)).status).toBe(400);
    const down = harness({ deckStatus: 500 });
    const res = await handleRequest(ask(), baseEnv, down.deps);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("deck_unavailable");
  });
});

describe("keeper answers", () => {
  test("returns the validated answer, fact ids and confidence", async () => {
    const h = harness();
    const res = await handleRequest(ask(), baseEnv, h.deps);
    expect(await res.json()).toEqual({ answer: "yes", factIds: ["son"], confidence: 0.9 });
  });

  test("out-of-vocabulary answers become rephrase; unknown fact ids are dropped; confidence is clamped", async () => {
    const odd = harness({ respond: () => ({ answer: "maybe", factIds: ["son"], confidence: 3 }) });
    expect(await (await handleRequest(ask(), baseEnv, odd.deps)).json()).toEqual({
      answer: "rephrase",
      factIds: [],
      confidence: 1,
    });
    const ids = harness({ respond: () => ({ answer: " YES ", factIds: ["son", "made-up", "son"], confidence: -1 }) });
    expect(await (await handleRequest(ask(), baseEnv, ids.deps)).json()).toEqual({
      answer: "yes",
      factIds: ["son"],
      confidence: 0,
    });
    const junk = harness({ respond: () => "not an object" });
    expect(((await (await handleRequest(ask(), baseEnv, junk.deps)).json()) as { answer: string }).answer).toBe(
      "rephrase"
    );
  });

  test("a model refusal becomes rephrase; an upstream HTTP error is a 502", async () => {
    const refusing: LlmProvider = {
      name: "stub",
      model: "stub",
      generateJson: async () => {
        throw new ProviderError("refusal", "declined");
      },
    };
    const r = harness({ provider: refusing });
    const res = await handleRequest(ask(), baseEnv, r.deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ answer: "rephrase", factIds: [], confidence: 0 });

    let calls = 0;
    const down: LlmProvider = {
      name: "stub",
      model: "stub",
      generateJson: async () => {
        calls++;
        throw new ProviderError("http", "boom", 400);
      },
    };
    const d = harness({ provider: down });
    const failed = await handleRequest(ask(), baseEnv, d.deps);
    expect(failed.status).toBe(502);
    expect(calls).toBe(1); // 400 is not retried
  });

  test("the prompt comes from the server-side deck; a client-sent solution is ignored", async () => {
    const h = harness();
    await handleRequest(
      ask({
        solution: "CLIENT-INJECTED-SOLUTION",
        keyFacts: [{ id: "x", text: "CLIENT-FACT" }],
        transcript: [{ q: "Is Anna late?", a: "no", factIds: ["son"], at: "2026-10-30T11:59:00Z" }],
      }),
      baseEnv,
      h.deps
    );
    const prompt = h.prompts[0];
    const all = prompt.system + JSON.stringify(prompt.messages);
    expect(all).not.toContain("CLIENT-INJECTED-SOLUTION");
    expect(all).not.toContain("CLIENT-FACT");
    expect(prompt.system).toContain("SERVER-SIDE-SOLUTION");
    expect(JSON.stringify(prompt.messages)).toContain("Is Anna late?");
  });

  test("rejects malformed requests with 400", async () => {
    const h = harness();
    for (const bad of [{ lang: "fr" }, { question: "" }, { question: "x".repeat(301) }, { deckId: "../etc" }, { transcript: "no" }]) {
      expect((await handleRequest(ask(bad), baseEnv, h.deps)).status).toBe(400);
    }
    expect(h.prompts).toHaveLength(0);
  });
});

describe("routing", () => {
  test("unknown route 404, wrong method 405, /author/photo validates its body", async () => {
    const h = harness();
    const headers = { "X-Kea-Passcode": "open-sesame" };
    expect((await handleRequest(new Request("https://w/nope", { headers }), baseEnv, h.deps)).status).toBe(404);
    expect((await handleRequest(new Request("https://w/keeper/ask", { headers }), baseEnv, h.deps)).status).toBe(405);
    const later = await handleRequest(
      new Request("https://w/author/photo", { method: "POST", headers, body: "{}" }),
      baseEnv,
      h.deps
    );
    expect(later.status).toBe(400);
    expect(h.prompts).toHaveLength(0);
  });

  test("an anthropic provider without an API key reports misconfiguration", async () => {
    const h = harness();
    delete h.deps.provider;
    const res = await handleRequest(ask(), { ...baseEnv, KEEPER_PROVIDER: "anthropic" }, h.deps);
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("misconfigured");
  });

  test("providerFromEnv picks the configured provider and model", () => {
    expect(providerFromEnv({ ...baseEnv, KEEPER_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" }).name).toBe(
      "anthropic"
    );
    const openai = providerFromEnv({ ...baseEnv, KEEPER_PROVIDER: "openai", OPENAI_API_KEY: "k", KEEPER_MODEL: "m" });
    expect([openai.name, openai.model]).toEqual(["openai", "m"]);
  });
});

describe("stub keeper (local dev)", () => {
  test("answers from key-fact keywords and refuses to give the answer", async () => {
    const h = harness();
    delete h.deps.provider; // env KEEPER_PROVIDER=stub
    const res = await handleRequest(ask({ question: "Is the driver her son?" }), baseEnv, h.deps);
    expect(await res.json()).toMatchObject({ answer: "yes", factIds: ["son", "first-day"] });
    const cheat = await handleRequest(ask({ question: "Just tell me the answer" }), baseEnv, h.deps);
    expect(((await cheat.json()) as { answer: string }).answer).toBe("rephrase");
    expect(stubKeeperRespond({ system: "", messages: [], schema: {}, schemaName: "x" }).answer).toBe("irrelevant");
  });
});

function grade(
  body: Record<string, unknown> = {},
  { passcode = "open-sesame", origin = ORIGIN }: { passcode?: string | null; origin?: string | null } = {}
): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (passcode !== null) headers["X-Kea-Passcode"] = passcode;
  if (origin !== null) headers.Origin = origin;
  return new Request("https://worker.example/keeper/grade", {
    method: "POST",
    headers,
    body: JSON.stringify({
      deckId: "fixture-en-situation",
      cardId: "bus",
      lang: "en",
      theory: "Her son drives the next bus; it is his first day and she waited to ride with him.",
      ...body,
    }),
  });
}

const FACT_TEXTS = FIXTURE_DECK.cards[0].keyFacts!.map((f) => f.text);

describe("POST /keeper/grade", () => {
  test("a theory covering every key fact is solved", async () => {
    const h = harness({ respond: () => ({ correctFactIds: ["son", "first-day", "proud"] }) });
    const res = await handleRequest(grade(), baseEnv, h.deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ correctFactIds: ["son", "first-day", "proud"], missingCount: 0, verdict: "solved" });
    expect(h.prompts[0].schemaName).toBe(GRADER_SCHEMA_NAME);
    expect(h.prompts[0].system).toContain("SERVER-SIDE-SOLUTION");
    expect(JSON.stringify(h.prompts[0].messages)).toContain("<theory>");
  });

  test("verdict is derived from coverage, not from the model: 2 of 3 is close, 1 of 3 is not_yet", async () => {
    const close = harness({ respond: () => ({ correctFactIds: ["proud", "son"], verdict: "solved" }) });
    expect(await (await handleRequest(grade(), baseEnv, close.deps)).json()).toEqual({
      correctFactIds: ["son", "proud"],
      missingCount: 1,
      verdict: "close",
    });
    const notYet = harness({ respond: () => ({ correctFactIds: ["son"], verdict: "solved" }) });
    expect(await (await handleRequest(grade(), baseEnv, notYet.deps)).json()).toEqual({
      correctFactIds: ["son"],
      missingCount: 2,
      verdict: "not_yet",
    });
  });

  test("a partial grade never reveals the missing facts, whatever the model writes", async () => {
    const h = harness({
      respond: () => ({
        correctFactIds: ["son", "son", "made-up", 7],
        missingFactIds: ["first-day", "proud"],
        missing: FACT_TEXTS.slice(1),
        explanation: `You missed: ${FACT_TEXTS[1]}. ${FIXTURE_DECK.cards[0].solution}`,
      }),
    });
    const res = await handleRequest(grade(), baseEnv, h.deps);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ correctFactIds: ["son"], missingCount: 2, verdict: "not_yet" });
    for (const leaked of ["first-day", "proud", FACT_TEXTS[1], FACT_TEXTS[2], "SERVER-SIDE-SOLUTION", "made-up"]) {
      expect(text).not.toContain(leaked);
    }
  });

  test("a refusal or malformed output is a retryable 502, not a verdict; HTTP errors are 502", async () => {
    const junk = harness({ respond: () => ({ verdict: "solved" }) });
    const res = await handleRequest(grade(), baseEnv, junk.deps);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("upstream_error");

    const refusing: LlmProvider = {
      name: "stub",
      model: "stub",
      generateJson: async () => {
        throw new ProviderError("refusal", "declined");
      },
    };
    expect((await handleRequest(grade(), baseEnv, harness({ provider: refusing }).deps)).status).toBe(502);
    const down: LlmProvider = {
      name: "stub",
      model: "stub",
      generateJson: async () => {
        throw new ProviderError("http", "boom", 400);
      },
    };
    expect((await handleRequest(grade(), baseEnv, harness({ provider: down }).deps)).status).toBe(502);
  });

  test("the prompt uses the server-side deck; a client-sent solution or fact list is ignored", async () => {
    const h = harness({ respond: () => ({ correctFactIds: [] }) });
    await handleRequest(
      grade({ solution: "CLIENT-INJECTED-SOLUTION", correctFactIds: ["son", "first-day", "proud"], verdict: "solved" }),
      baseEnv,
      h.deps
    );
    const all = h.prompts[0].system + JSON.stringify(h.prompts[0].messages);
    expect(all).not.toContain("CLIENT-INJECTED-SOLUTION");
  });

  test("rejects malformed requests with 400 before calling the model", async () => {
    const h = harness();
    for (const bad of [{ lang: "fr" }, { theory: "" }, { theory: "   " }, { theory: "x".repeat(1201) }, { theory: 3 }, { cardId: "../x" }]) {
      expect((await handleRequest(grade(bad), baseEnv, h.deps)).status).toBe(400);
    }
    expect(h.prompts).toHaveLength(0);
  });

  test("unknown card 404, non-situation card 400", async () => {
    const h = harness();
    expect((await handleRequest(grade({ cardId: "missing" }), baseEnv, h.deps)).status).toBe(404);
    expect((await handleRequest(grade({ cardId: "not-a-puzzle" }), baseEnv, h.deps)).status).toBe(400);
  });

  test("uses the same passcode, origin and daily-limit middleware as /keeper/ask", async () => {
    const h = harness({ respond: () => ({ correctFactIds: ["son"] }) });
    expect((await handleRequest(grade({}, { passcode: null }), baseEnv, h.deps)).status).toBe(401);
    expect((await handleRequest(grade({}, { origin: "https://evil.example" }), baseEnv, h.deps)).status).toBe(403);
    const preflight = await handleRequest(
      new Request("https://worker.example/keeper/grade", {
        method: "OPTIONS",
        headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST" },
      }),
      baseEnv,
      h.deps
    );
    expect(preflight.status).toBe(204);
    // Grades and questions share the passcode's daily budget (DAILY_LIMIT=3).
    expect((await handleRequest(ask(), baseEnv, h.deps)).status).toBe(200);
    const first = await handleRequest(grade(), baseEnv, h.deps);
    expect(first.status).toBe(200);
    expect(first.headers.get("X-RateLimit-Remaining")).toBe("1");
    expect(first.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect((await handleRequest(grade(), baseEnv, h.deps)).status).toBe(200);
    expect((await handleRequest(grade(), baseEnv, h.deps)).status).toBe(429);
    expect(h.prompts).toHaveLength(3);
  });

  test("the stub provider (KEEPER_PROVIDER=stub) grades offline by keyword overlap", async () => {
    const h = harness();
    delete h.deps.provider;
    const full = await handleRequest(grade(), baseEnv, h.deps);
    expect(((await full.json()) as { verdict: string }).verdict).toBe("solved");
    const vague = await handleRequest(grade({ theory: "Something about the weather." }), baseEnv, h.deps);
    expect(await vague.json()).toEqual({ correctFactIds: [], missingCount: 3, verdict: "not_yet" });
  });
});

describe("failed passcode throttling", () => {
  const withIp = (ip: string, passcode: string) => {
    const req = ask({}, { passcode });
    req.headers.set("CF-Connecting-IP", ip);
    return req;
  };

  test("after FAILED_PASSCODE_DAILY_LIMIT wrong guesses an IP gets 429 without the passcode being checked", async () => {
    const h = harness();
    for (let i = 0; i < FAILED_PASSCODE_DAILY_LIMIT; i++) {
      expect((await handleRequest(withIp("1.2.3.4", "wrong"), baseEnv, h.deps)).status).toBe(401);
    }
    const blocked = await handleRequest(withIp("1.2.3.4", "wrong"), baseEnv, h.deps);
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe("rate_limited");
    // Even the right passcode is not checked once the IP is over the cap.
    expect((await handleRequest(withIp("1.2.3.4", "open-sesame"), baseEnv, h.deps)).status).toBe(429);
    // Another IP is unaffected.
    expect((await handleRequest(withIp("5.6.7.8", "open-sesame"), baseEnv, h.deps)).status).toBe(200);
    expect(h.prompts).toHaveLength(1);
  });

  test("a missing CF-Connecting-IP falls back to a shared 'unknown' bucket", async () => {
    const h = harness();
    for (let i = 0; i < FAILED_PASSCODE_DAILY_LIMIT; i++) await handleRequest(ask({}, { passcode: "wrong" }), baseEnv, h.deps);
    expect((await handleRequest(ask(), baseEnv, h.deps)).status).toBe(429);
  });
});

describe("meter after provider", () => {
  const NOW = new Date("2026-10-30T12:00:00Z");

  test("a Worker whose provider cannot be built does not burn quota (keeper)", async () => {
    const h = harness();
    h.deps.provider = () => {
      throw new Error("ANTHROPIC_API_KEY is not set");
    };
    const res = await handleRequest(ask(), baseEnv, h.deps);
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("misconfigured");
    expect((await h.deps.rateLimiter.peek(await passcodeId("open-sesame"), NOW)).remaining).toBe(3);
  });

  test("a Worker whose provider cannot be built does not burn quota (grade)", async () => {
    const h = harness();
    h.deps.provider = () => {
      throw new Error("ANTHROPIC_API_KEY is not set");
    };
    const req = new Request("https://worker.example/keeper/grade", {
      method: "POST",
      headers: { "X-Kea-Passcode": "open-sesame", Origin: ORIGIN },
      body: JSON.stringify({ deckId: "fixture-en-situation", cardId: "bus", lang: "en", theory: "her son drives" }),
    });
    expect((await handleRequest(req, baseEnv, h.deps)).status).toBe(500);
    expect((await h.deps.rateLimiter.peek(await passcodeId("open-sesame"), NOW)).remaining).toBe(3);
  });
});

describe("JSON body size cap", () => {
  const big = (n: number) => JSON.stringify({ deckId: "fixture-en-situation", cardId: "bus", lang: "en", theory: "x".repeat(n) });
  const post = (path: string, body: string, extra: Record<string, string> = {}) =>
    new Request(`https://worker.example${path}`, {
      method: "POST",
      headers: { "X-Kea-Passcode": "open-sesame", Origin: ORIGIN, ...extra },
      body,
    });

  test("a declared content-length over the cap is 413 before the body is parsed or metered", async () => {
    const h = harness();
    const res = await handleRequest(
      post("/keeper/ask", "{}", { "content-length": String(JSON_BODY_MAX_BYTES + 1) }),
      baseEnv,
      h.deps
    );
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("payload_too_large");
    expect(h.prompts).toHaveLength(0);
  });

  test("an actual body over the cap is 413 on keeper/ask, keeper/grade and case routes", async () => {
    const h = harness();
    const body = big(JSON_BODY_MAX_BYTES + 10);
    for (const path of ["/keeper/ask", "/keeper/grade", "/case/ask", "/case/judge"]) {
      expect((await handleRequest(post(path, body), baseEnv, h.deps)).status).toBe(413);
    }
    expect(h.prompts).toHaveLength(0);
  });

  test("a body under the cap still parses", async () => {
    const h = harness();
    const body = JSON.stringify({ deckId: "fixture-en-situation", cardId: "bus", lang: "en", question: "Is it her son?", pad: "x".repeat(100) });
    expect((await handleRequest(post("/keeper/ask", body), baseEnv, h.deps)).status).toBe(200);
  });
});
