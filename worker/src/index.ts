/**
 * Kea AI Worker (spec §6). One small Worker holds the model API key and serves
 * every AI feature; Kea itself stays a static site.
 */
import { DeckLoader, DEFAULT_DECK_TTL_SECONDS } from "./decks";
import type { Env } from "./env";
import { createRateLimiter, dailyLimit, kvCounterStore, memoryCounterStore } from "./rate-limit";
import { handleRequest, type WorkerDeps } from "./router";

// Per-isolate state, reused across requests.
let deps: WorkerDeps | null = null;
let depsKey = "";
const memoryCounters = new Map<string, number>();

function getDeps(env: Env): WorkerDeps {
  const key = `${env.SITE_ORIGIN}|${env.DAILY_LIMIT}|${env.DECK_CACHE_TTL}|${Boolean(env.RATE_LIMIT)}`;
  if (deps && depsKey === key) return deps;
  const ttl = Number.parseInt(env.DECK_CACHE_TTL ?? "", 10);
  const edgeCache = typeof caches !== "undefined" ? (caches as unknown as { default: Cache }).default : null;
  deps = {
    decks: new DeckLoader({
      siteOrigin: env.SITE_ORIGIN,
      fetch: (input, init) => fetch(input, init),
      ttlSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_DECK_TTL_SECONDS,
      edgeCache,
    }),
    rateLimiter: createRateLimiter(
      env.RATE_LIMIT ? kvCounterStore(env.RATE_LIMIT) : memoryCounterStore(memoryCounters),
      dailyLimit(env)
    ),
  };
  if (!env.RATE_LIMIT) console.warn("RATE_LIMIT KV not bound: using a per-isolate in-memory daily limit");
  depsKey = key;
  return deps;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env, getDeps(env));
  },
} satisfies ExportedHandler<Env>;
