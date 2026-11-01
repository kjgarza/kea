import { describe, expect, test } from "bun:test";
import type { JsonGenerationRequest, LlmProvider } from "../../src/lib/ai/provider";
import { ProviderError, createStubProvider } from "../../src/lib/ai/provider";
import { INVESTIGATOR_SCHEMA_NAME, JUDGE_SCHEMA_NAME, NOT_IN_EVIDENCE_REPLY } from "../../src/lib/ai/case";
import type { CaseCard } from "../../src/types/card";
import type { Env } from "./env";
import { passcodeId } from "./auth";
import { DeckLoader } from "./decks";
import { createRateLimiter, dailyLimit, memoryCounterStore } from "./rate-limit";
import { handleRequest, type WorkerDeps } from "./router";

const SITE = "https://example.github.io/kea";
const ORIGIN = "https://example.github.io";
const DECK_ID = "saltmarsh-bay-en-case";
const CARD_ID = "halden-chronometer";

// The seed case (#36), served as the published deck.
const DECK = (await Bun.file(new URL(`../../public/decks/${DECK_ID}.json`, import.meta.url)).json()) as {
  cards: CaseCard[];
};
const CARD = DECK.cards.find((c) => c.cardId === CARD_ID)!;

const baseEnv: Env = {
  SITE_ORIGIN: SITE,
  KEA_PASSCODES: "open-sesame",
  DAILY_LIMIT: "50",
  KEEPER_PROVIDER: "stub",
};

function harness(options: { respond?: (req: JsonGenerationRequest) => unknown; provider?: LlmProvider; env?: Env } = {}) {
  const prompts: JsonGenerationRequest[] = [];
  const deckFetch = async (url: string) => {
    if (url.endsWith(`/decks/${DECK_ID}.json`)) {
      return new Response(JSON.stringify(DECK), { headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/decks/plain-en-charades.json")) {
      return new Response(
        JSON.stringify({ ...DECK, deckId: "plain-en-charades", cards: [{ cardId: "c1", type: "charades", prompt: "Dance" }] }),
        { headers: { "content-type": "application/json" } }
      );
    }
    return new Response("missing", { status: 404 });
  };
  const provider =
    options.provider ??
    createStubProvider((req) => {
      prompts.push(req);
      if (options.respond) return options.respond(req);
      return req.schemaName === JUDGE_SCHEMA_NAME
        ? { results: Array.from(JSON.stringify(req.messages).matchAll(/QUESTION \[([^\]]+)\]/g), (m) => ({ questionId: m[1], correct: true })) }
        : { inEvidence: true, answer: "The log shows VOL-07.", citedEvidenceIds: ["building-log"] };
    });
  const deps: WorkerDeps = {
    decks: new DeckLoader({ siteOrigin: SITE, fetch: deckFetch }),
    rateLimiter: createRateLimiter(memoryCounterStore(), dailyLimit(options.env ?? baseEnv)),
    provider: () => provider,
    now: () => new Date("2026-10-30T12:00:00Z"),
  };
  return { deps, prompts };
}

function post(
  path: string,
  body: Record<string, unknown>,
  { passcode = "open-sesame", origin = ORIGIN }: { passcode?: string | null; origin?: string | null } = {}
): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (passcode !== null) headers["X-Kea-Passcode"] = passcode;
  if (origin !== null) headers.Origin = origin;
  return new Request(`https://worker.example${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

const ask = (body: Record<string, unknown> = {}, opts?: Parameters<typeof post>[2]) =>
  post(
    "/case/ask",
    { deckId: DECK_ID, cardId: CARD_ID, lang: "en", openedEvidenceIds: ["building-log"], question: "Whose badge took the key?", ...body },
    opts
  );

const judge = (body: Record<string, unknown> = {}, opts?: Parameters<typeof post>[2]) =>
  post("/case/judge", { deckId: DECK_ID, cardId: CARD_ID, lang: "en", answers: { who: "the museum's curator, Dr Lindqvist" }, ...body }, opts);

const promptText = (req: JsonGenerationRequest) => `${req.system}\n${JSON.stringify(req.messages)}\n${JSON.stringify(req.schema)}`;

/** Text that exists only in one evidence item (a distinctive line of it). */
const UNIQUE = {
  "courier-booking": "BC-58213",
  "ruth-phone": "+31 10",
  "lost-property": "Child's blue mitten",
  "cctv-note": "Harbourside Security",
  "nina-interview": "anchor sticker",
};

describe("POST /case/ask", () => {
  test("answers with the validated reply and opened citations", async () => {
    const h = harness();
    const res = await handleRequest(ask(), baseEnv, h.deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ answer: "The log shows VOL-07.", citedEvidenceIds: ["building-log"], inEvidence: true });
    expect(h.prompts[0].schemaName).toBe(INVESTIGATOR_SCHEMA_NAME);
    expect(h.prompts[0].system).toContain("--- EVIDENCE [building-log]");
  });

  test("unopened evidence never appears in the provider request", async () => {
    const h = harness();
    await handleRequest(ask({ openedEvidenceIds: ["building-log", "nina-interview"] }), baseEnv, h.deps);
    const text = promptText(h.prompts[0]);
    expect(text).toContain("anchor sticker");
    for (const e of CARD.evidence) {
      if (e.id === "building-log" || e.id === "nina-interview") continue;
      expect(text).not.toContain(`[${e.id}]`);
      expect(text).not.toContain(`"${e.id}"`);
      if (e.content) expect(text).not.toContain(e.content.slice(0, 60));
    }
    for (const [id, line] of Object.entries(UNIQUE)) if (id !== "nina-interview") expect(text).not.toContain(line);
    // Never the walkthrough or the answers.
    expect(text).not.toContain(CARD.walkthrough.slice(0, 80));
    for (const q of CARD.questions) expect(text).not.toContain(q.answer);
    expect(text).not.toContain("Kessler");
  });

  test("evidence whose prerequisites are not opened is excluded, even if the client says it is opened", async () => {
    const h = harness();
    // courier-booking needs ruth-phone, which needs ruth-interview; lost-property needs felix-interview + building-log.
    await handleRequest(
      ask({ openedEvidenceIds: ["courier-booking", "ruth-phone", "lost-property", "building-log", "made-up-id"] }),
      baseEnv,
      h.deps
    );
    const text = promptText(h.prompts[0]);
    expect(text).toContain("[building-log]");
    for (const id of ["courier-booking", "ruth-phone", "lost-property", "made-up-id"]) expect(text).not.toContain(`[${id}]`);
    for (const line of [UNIQUE["courier-booking"], UNIQUE["ruth-phone"], UNIQUE["lost-property"]]) {
      expect(text).not.toContain(line);
    }
    expect(text).toContain("OPENED EVIDENCE (1 of 12 items)");
  });

  test("a client-sent card, walkthrough or evidence is ignored", async () => {
    const h = harness();
    await handleRequest(
      ask({ walkthrough: "CLIENT-WALKTHROUGH", evidence: [{ id: "x", content: "CLIENT-EVIDENCE" }], card: { briefing: "CLIENT" } }),
      baseEnv,
      h.deps
    );
    const text = promptText(h.prompts[0]);
    expect(text).not.toContain("CLIENT-WALKTHROUGH");
    expect(text).not.toContain("CLIENT-EVIDENCE");
  });

  test("cited ids outside the opened set are stripped from citations and text", async () => {
    const h = harness({
      respond: () => ({
        inEvidence: true,
        answer: "Badge VOL-07 took the key (`building-log`), and `courier-booking` says Rotterdam [ruth-phone].",
        citedEvidenceIds: ["building-log", "courier-booking", "ruth-phone", "nope"],
        walkthrough: "leak",
      }),
    });
    const res = await handleRequest(ask(), baseEnv, h.deps);
    const body = (await res.json()) as { answer: string; citedEvidenceIds: string[] };
    expect(body.citedEvidenceIds).toEqual(["building-log"]);
    expect(body.answer).toContain("`building-log`");
    expect(body.answer).not.toContain("courier-booking");
    expect(body.answer).not.toContain("ruth-phone");
    expect(Object.keys(body).sort()).toEqual(["answer", "citedEvidenceIds", "inEvidence"]);
  });

  test("an answer the opened evidence does not contain gets the explicit not-in-evidence reply", async () => {
    const h = harness({ respond: () => ({ inEvidence: false, answer: "Probably Kessler.", citedEvidenceIds: ["building-log"] }) });
    const res = await handleRequest(ask({ question: "Where is the chronometer now?" }), baseEnv, h.deps);
    expect(await res.json()).toEqual({ answer: NOT_IN_EVIDENCE_REPLY.en, citedEvidenceIds: [], inEvidence: false });
    const es = await handleRequest(ask({ lang: "es", question: "¿Dónde está?" }), baseEnv, h.deps);
    expect(((await es.json()) as { answer: string }).answer).toBe(NOT_IN_EVIDENCE_REPLY.es);
  });

  test("malformed output or a refusal is a retryable 502; HTTP errors are 502", async () => {
    const junk = harness({ respond: () => ({ reply: "hi" }) });
    const res = await handleRequest(ask(), baseEnv, junk.deps);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("upstream_error");
    for (const kind of ["refusal", "http"] as const) {
      const provider: LlmProvider = {
        name: "stub",
        model: "stub",
        generateJson: async () => {
          throw new ProviderError(kind, "nope", kind === "http" ? 400 : undefined);
        },
      };
      expect((await handleRequest(ask(), baseEnv, harness({ provider }).deps)).status).toBe(502);
    }
  });

  test("rejects malformed requests with 400 before calling the model", async () => {
    const h = harness();
    for (const bad of [
      { lang: "fr" },
      { question: "" },
      { question: "x".repeat(301) },
      { openedEvidenceIds: "building-log" },
      { openedEvidenceIds: ["../x"] },
      { openedEvidenceIds: Array.from({ length: 101 }, (_, i) => `e${i}`) },
      { cardId: "../x" },
    ]) {
      expect((await handleRequest(ask(bad), baseEnv, h.deps)).status).toBe(400);
    }
    expect(h.prompts).toHaveLength(0);
  });

  test("unknown deck or card 404, non-case card 400", async () => {
    const h = harness();
    expect((await handleRequest(ask({ deckId: "nope-en-case" }), baseEnv, h.deps)).status).toBe(404);
    expect((await handleRequest(ask({ cardId: "missing" }), baseEnv, h.deps)).status).toBe(404);
    expect((await handleRequest(ask({ deckId: "plain-en-charades", cardId: "c1" }), baseEnv, h.deps)).status).toBe(400);
  });

  test("uses the passcode, origin and daily-limit middleware", async () => {
    const env = { ...baseEnv, DAILY_LIMIT: "2" };
    const h = harness({ env });
    expect((await handleRequest(ask({}, { passcode: null }), env, h.deps)).status).toBe(401);
    expect((await handleRequest(ask({}, { origin: "https://evil.example" }), env, h.deps)).status).toBe(403);
    const first = await handleRequest(ask(), env, h.deps);
    expect(first.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(first.headers.get("X-RateLimit-Remaining")).toBe("1");
    expect((await handleRequest(judge(), env, h.deps)).status).toBe(200);
    expect((await handleRequest(ask(), env, h.deps)).status).toBe(429);
  });

  test("the stub provider answers from opened evidence only", async () => {
    const h = harness();
    delete h.deps.provider;
    const hit = await handleRequest(ask({ openedEvidenceIds: ["felix-interview"], question: "What about the cello orchestra?" }), baseEnv, h.deps);
    expect(await hit.json()).toMatchObject({ inEvidence: true, citedEvidenceIds: ["felix-interview"] });
    const miss = await handleRequest(ask({ openedEvidenceIds: [], question: "Which courier booking?" }), baseEnv, h.deps);
    expect(await miss.json()).toMatchObject({ inEvidence: false, citedEvidenceIds: [] });
  });
});

describe("POST /case/judge", () => {
  test("meters only when a model call will happen; local-only answers cost no quota", async () => {
    const h = harness();
    const id = await passcodeId("open-sesame");
    const now = new Date("2026-10-30T12:00:00Z");
    const local = await handleRequest(judge({ answers: { who: "Dr Ruth Lindqvist, the curator", badge: "" } }), baseEnv, h.deps);
    expect(local.status).toBe(200);
    expect(h.prompts).toHaveLength(0);
    expect((await h.deps.rateLimiter.peek(id, now)).remaining).toBe(50);
    await handleRequest(judge({ answers: { who: "the boss" } }), baseEnv, h.deps);
    expect(h.prompts).toHaveLength(1);
    expect((await h.deps.rateLimiter.peek(id, now)).remaining).toBe(49);
  });

  test("an unbuildable provider does not burn quota", async () => {
    const h = harness();
    h.deps.provider = () => {
      throw new Error("ANTHROPIC_API_KEY is not set");
    };
    expect((await handleRequest(judge({ answers: { who: "the boss" } }), baseEnv, h.deps)).status).toBe(500);
    expect((await handleRequest(ask(), baseEnv, h.deps)).status).toBe(500);
    const status = await h.deps.rateLimiter.peek(await passcodeId("open-sesame"), new Date("2026-10-30T12:00:00Z"));
    expect(status.remaining).toBe(50);
  });

  test("judges only unmatched submitted answers; returns ids and booleans only", async () => {
    const h = harness({ respond: () => ({ results: [{ questionId: "who", correct: true }, { questionId: "where", correct: true }] }) });
    const res = await handleRequest(
      judge({ answers: { who: "the museum's curator, Dr Lindqvist", when: "Monday night", badge: "" } }),
      baseEnv,
      h.deps
    );
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      results: [
        { questionId: "who", correct: true },
        { questionId: "when", correct: true },
        { questionId: "badge", correct: false },
      ],
    });
    // The model saw only "who": the exact match and the blank answer are decided locally.
    const prompt = promptText(h.prompts[0]);
    expect(prompt).toContain("QUESTION [who]");
    for (const id of ["when", "badge", "exit", "where"]) expect(prompt).not.toContain(`QUESTION [${id}]`);
    expect(prompt).not.toContain(CARD.walkthrough.slice(0, 80));
    // No answer text (correct answers, variants or the group's) in the response.
    for (const q of CARD.questions) expect(text).not.toContain(q.answer);
    expect(text).not.toContain("Lindqvist");
  });

  test("all answers decided locally: no model call", async () => {
    const h = harness();
    const res = await handleRequest(judge({ answers: { who: "Ruth Lindqvist", exit: "  " } }), baseEnv, h.deps);
    expect(await res.json()).toEqual({ results: [{ questionId: "who", correct: true }, { questionId: "exit", correct: false }] });
    expect(h.prompts).toHaveLength(0);
  });

  test("answers for unknown questions are dropped; only-unknown is a 400", async () => {
    const h = harness({ respond: () => ({ results: [{ questionId: "who", correct: false }] }) });
    const res = await handleRequest(judge({ answers: { who: "Felix Marsh did it", motive: "money" } }), baseEnv, h.deps);
    expect(await res.json()).toEqual({ results: [{ questionId: "who", correct: false }] });
    expect(promptText(h.prompts[0])).not.toContain("motive");
    expect((await handleRequest(judge({ answers: { motive: "money" } }), baseEnv, h.deps)).status).toBe(400);
  });

  test("missing results or malformed output is a retryable 502", async () => {
    const partial = harness({ respond: () => ({ results: [{ questionId: "who", correct: true }] }) });
    const res = await handleRequest(judge({ answers: { who: "the boss", where: "abroad somewhere" } }), baseEnv, partial.deps);
    expect(res.status).toBe(502);
    const junk = harness({ respond: () => ({ verdict: "all correct" }) });
    expect((await handleRequest(judge(), baseEnv, junk.deps)).status).toBe(502);
  });

  test("rejects malformed requests with 400 before calling the model", async () => {
    const h = harness();
    for (const bad of [
      { answers: {} },
      { answers: [] },
      { answers: { who: 3 } },
      { answers: { "../x": "a" } },
      { answers: { who: "x".repeat(501) } },
      { lang: "de" },
    ]) {
      expect((await handleRequest(judge(bad), baseEnv, h.deps)).status).toBe(400);
    }
    expect(h.prompts).toHaveLength(0);
  });

  test("the stub judge (KEEPER_PROVIDER=stub) accepts word-overlap paraphrases and rejects other suspects", async () => {
    const h = harness();
    delete h.deps.provider;
    const res = await handleRequest(
      judge({ answers: { who: "Doctor Ruth Lindqvist (curator)", where: "Felix's flat" } }),
      baseEnv,
      h.deps
    );
    expect(await res.json()).toEqual({
      results: [
        { questionId: "who", correct: true },
        { questionId: "where", correct: false },
      ],
    });
  });
});
