/**
 * Per-passcode daily request limit.
 *
 * Uses the RATE_LIMIT KV namespace when bound. KV is eventually consistent
 * and has no atomic increment, so the limit is approximate (a burst from
 * several edge locations can overshoot it a little); that is fine for cost
 * control. Without KV it falls back to a per-isolate in-memory counter, which
 * resets whenever the isolate is recycled. KV errors fail open (logged).
 *
 * Within one isolate, `consume` calls for the same key are serialised (a
 * per-key promise chain), so concurrent requests cannot all read the same
 * count and pass. Across isolates/locations KV has no atomic increment, so the
 * limit stays approximate; a hard limit would need a Durable Object.
 */
import type { KVNamespace } from "@cloudflare/workers-types";
import type { Env } from "./env";

export const DEFAULT_DAILY_LIMIT = 200;

export interface CounterStore {
  get(key: string): Promise<number>;
  put(key: string, value: number, ttlSeconds: number): Promise<void>;
}

export function kvCounterStore(kv: KVNamespace): CounterStore {
  return {
    async get(key) {
      const raw = await kv.get(key);
      const value = raw === null ? 0 : Number.parseInt(raw, 10);
      return Number.isFinite(value) ? value : 0;
    },
    async put(key, value, ttlSeconds) {
      // KV requires an expiration TTL of at least 60 seconds.
      await kv.put(key, String(value), { expirationTtl: Math.max(60, ttlSeconds) });
    },
  };
}

export function memoryCounterStore(map = new Map<string, number>()): CounterStore {
  return {
    async get(key) {
      return map.get(key) ?? 0;
    },
    async put(key, value) {
      map.set(key, value);
    },
  };
}

/** `null` = unlimited. */
export function dailyLimit(env: Env): number | null {
  if (env.DAILY_LIMIT === undefined || env.DAILY_LIMIT.trim() === "") return DEFAULT_DAILY_LIMIT;
  const value = Number.parseInt(env.DAILY_LIMIT, 10);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_DAILY_LIMIT;
  return value === 0 ? null : value;
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Seconds until the next UTC midnight. */
export function secondsUntilReset(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number | null;
  remaining: number | null;
  retryAfter: number;
}

export interface RateLimiter {
  /** Read today's state without counting a request. */
  peek(id: string, now: Date, limitOverride?: number | null): Promise<RateLimitResult>;
  /**
   * Count one request; `allowed: false` once the limit is reached.
   * `limitOverride` replaces the limiter's limit for this key family (used for
   * the failed-passcode counter).
   */
  consume(id: string, now: Date, limitOverride?: number | null): Promise<RateLimitResult>;
}

export function createRateLimiter(store: CounterStore, defaultLimit: number | null): RateLimiter {
  /** Tail of the pending consume chain per key (isolate-local mutex). */
  const chains = new Map<string, Promise<unknown>>();

  function serialise<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = chains.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    const tail = run.catch(() => undefined);
    chains.set(key, tail);
    void tail.then(() => {
      if (chains.get(key) === tail) chains.delete(key);
    });
    return run;
  }

  const keyFor = (id: string, now: Date) => `rl:${utcDay(now)}:${id}`;

  async function read(id: string, now: Date): Promise<number | null> {
    try {
      return await store.get(keyFor(id, now));
    } catch (error) {
      console.warn("rate-limit read failed; allowing request", String(error));
      return null;
    }
  }

  return {
    async peek(id, now, limitOverride) {
      const limit = limitOverride === undefined ? defaultLimit : limitOverride;
      const retryAfter = secondsUntilReset(now);
      if (limit === null) return { allowed: true, limit, remaining: null, retryAfter };
      const used = (await read(id, now)) ?? 0;
      return { allowed: used < limit, limit, remaining: Math.max(0, limit - used), retryAfter };
    },
    async consume(id, now, limitOverride) {
      const limit = limitOverride === undefined ? defaultLimit : limitOverride;
      const retryAfter = secondsUntilReset(now);
      if (limit === null) return { allowed: true, limit, remaining: null, retryAfter };
      const key = keyFor(id, now);
      return serialise(key, async () => {
        const used = await read(id, now);
        if (used === null) return { allowed: true, limit, remaining: null, retryAfter };
        if (used >= limit) return { allowed: false, limit, remaining: 0, retryAfter };
        try {
          await store.put(key, used + 1, retryAfter + 3600);
        } catch (error) {
          console.warn("rate-limit write failed; allowing request", String(error));
        }
        return { allowed: true, limit, remaining: Math.max(0, limit - used - 1), retryAfter };
      });
    },
  };
}
