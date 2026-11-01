import { afterEach, describe, expect, test } from "bun:test";
import { createMemoryBackend, createStore, setStore } from "@/lib/storage";
import type { KeeperAskRequest, KeeperGradeRequest } from "./api";
import { askKeeper, getKeaApiUrl, gradeKeeperTheory, getWorkerStatus, isAiConfigured, KeaApiError } from "./client";
import { getPasscode, setPasscode } from "./passcode";

afterEach(() => {
  setStore(undefined);
  delete process.env.NEXT_PUBLIC_KEA_API_URL;
});

function recordFetch(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetch, calls };
}

const req: KeeperAskRequest = {
  deckId: "classic-en-situation",
  cardId: "cl-001",
  lang: "en",
  transcript: [{ q: "Was it night?", a: "yes" }],
  question: "Did he work in a lighthouse?",
};

describe("configuration", () => {
  test("AI is off without NEXT_PUBLIC_KEA_API_URL", () => {
    expect(getKeaApiUrl()).toBeNull();
    expect(isAiConfigured()).toBe(false);
    process.env.NEXT_PUBLIC_KEA_API_URL = "  ";
    expect(isAiConfigured()).toBe(false);
  });

  test("trims the trailing slash", () => {
    process.env.NEXT_PUBLIC_KEA_API_URL = "https://kea.example.workers.dev/";
    expect(getKeaApiUrl()).toBe("https://kea.example.workers.dev");
  });

  test("throws not_configured / missing_passcode before any network call", async () => {
    setStore(createStore(createMemoryBackend()));
    const { fetch, calls } = recordFetch({});
    await expect(askKeeper(req, { fetch })).rejects.toMatchObject({ code: "not_configured" });
    await expect(askKeeper(req, { fetch, baseUrl: "https://w" })).rejects.toMatchObject({ code: "missing_passcode" });
    expect(calls).toHaveLength(0);
  });
});

describe("askKeeper", () => {
  test("sends the passcode header and only the typed fields: never the solution", async () => {
    setStore(createStore(createMemoryBackend()));
    setPasscode("  open-sesame ");
    expect(getPasscode()).toBe("open-sesame");
    process.env.NEXT_PUBLIC_KEA_API_URL = "https://w.example";
    const { fetch, calls } = recordFetch({ answer: "yes", factIds: ["lighthouse-keeper"], confidence: 0.9 });

    // A caller that accidentally spreads a whole card into the request.
    const sloppy = {
      ...req,
      solution: "SECRET",
      transcript: [{ q: "Was it night?", a: "yes" as const, factIds: ["x"], at: "2026-10-30" }],
    } as unknown as KeeperAskRequest;
    const res = await askKeeper(sloppy, { fetch });

    expect(res.answer).toBe("yes");
    expect(calls[0].url).toBe("https://w.example/keeper/ask");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["X-Kea-Passcode"]).toBe("open-sesame");
    const body = JSON.parse(String(calls[0].init.body));
    expect(Object.keys(body).sort()).toEqual(["cardId", "deckId", "lang", "question", "transcript"]);
    expect(body.transcript).toEqual([{ q: "Was it night?", a: "yes" }]);
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });

  test("the request type has no solution field", () => {
    const body: KeeperAskRequest = {
      ...req,
      // @ts-expect-error - the client cannot send a solution
      solution: "nope",
    };
    expect(body).toBeDefined();
  });

  test("maps Worker errors to KeaApiError", async () => {
    const { fetch } = recordFetch({ error: { code: "rate_limited", message: "Daily limit reached" } }, 429);
    const error = await askKeeper(req, { fetch, baseUrl: "https://w", passcode: "p" }).catch((e) => e);
    expect(error).toBeInstanceOf(KeaApiError);
    expect([error.code, error.status]).toEqual(["rate_limited", 429]);

    const offline = async () => {
      throw new TypeError("Failed to fetch");
    };
    await expect(askKeeper(req, { fetch: offline, baseUrl: "https://w", passcode: "p" })).rejects.toMatchObject({
      code: "network",
    });
  });

  test("getWorkerStatus is a GET without a body", async () => {
    const { fetch, calls } = recordFetch({ ok: true, remaining: 5, limit: 10 });
    expect(await getWorkerStatus({ fetch, baseUrl: "https://w", passcode: "p" })).toEqual({
      ok: true,
      remaining: 5,
      limit: 10,
    });
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
  });
});

describe("gradeKeeperTheory", () => {
  test("posts only ids and the theory to /keeper/grade", async () => {
    setStore(createStore(createMemoryBackend()));
    setPasscode("open-sesame");
    process.env.NEXT_PUBLIC_KEA_API_URL = "https://w.example";
    const { fetch, calls } = recordFetch({ correctFactIds: ["a"], missingCount: 2, verdict: "not_yet" });
    const sloppy = {
      deckId: "classic-en-situation",
      cardId: "cl-001",
      lang: "en",
      theory: "The keeper switched off the lamp.",
      keyFacts: [{ id: "a", text: "SECRET" }],
    } as unknown as KeeperGradeRequest;
    const res = await gradeKeeperTheory(sloppy, { fetch });
    expect(res.verdict).toBe("not_yet");
    expect(calls[0].url).toBe("https://w.example/keeper/grade");
    const body = JSON.parse(String(calls[0].init.body));
    expect(Object.keys(body).sort()).toEqual(["cardId", "deckId", "lang", "theory"]);
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });
});

describe("request timeout", () => {
  const hangingFetch = (_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const abort = () => reject(new DOMException("aborted", "AbortError"));
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener("abort", abort);
    });
  const base = { baseUrl: "https://w.example", passcode: "p" };

  test("a hung Worker surfaces as KeaApiError network after the timeout", async () => {
    const started = Date.now();
    await expect(askKeeper(req, { ...base, fetch: hangingFetch, timeoutMs: 20 })).rejects.toMatchObject({
      name: "KeaApiError",
      code: "network",
    });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test("a caller abort still surfaces as AbortError, not a timeout", async () => {
    const controller = new AbortController();
    const pending = askKeeper(req, { ...base, fetch: hangingFetch, timeoutMs: 5000, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const already = new AbortController();
    already.abort();
    await expect(askKeeper(req, { ...base, fetch: hangingFetch, signal: already.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  test("a fast answer is unaffected and the timer is cleared", async () => {
    const { fetch } = recordFetch({ answer: "yes", factIds: [], confidence: 1 });
    await expect(askKeeper(req, { ...base, fetch, timeoutMs: 20 })).resolves.toMatchObject({ answer: "yes" });
    await new Promise((r) => setTimeout(r, 40));
  });
});
