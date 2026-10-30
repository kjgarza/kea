/**
 * Per-passcode daily request limit.
 *
 * Uses the RATE_LIMIT KV namespace when bound. KV is eventually consistent
 * and has no atomic increment, so the limit is approximate (a burst from
 * several edge locations can overshoot it a little); that is fine for cost
 * control. Without KV it falls back to a per-isolate in-memory counter, which
 * resets whenever the isolate is recycled. KV errors fail open (logged).
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
  peek(id: string, now: Date): Promise<RateLimitResult>;
  /** Count one request; `allowed: false` once the limit is reached. */
  consume(id: string, now: Date): Promise<RateLimitResult>;
}

export function createRateLimiter(store: CounterStore, limit: number | null): RateLimiter {
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
    async peek(id, now) {
      const retryAfter = secondsUntilReset(now);
      if (limit === null) return { allowed: true, limit, remaining: null, retryAfter };
      const used = (await read(id, now)) ?? 0;
      return { allowed: used < limit, limit, remaining: Math.max(0, limit - used), retryAfter };
    },
    async consume(id, now) {
      const retryAfter = secondsUntilReset(now);
      if (limit === null) return { allowed: true, limit, remaining: null, retryAfter };
      const used = await read(id, now);
      if (used === null) return { allowed: true, limit, remaining: null, retryAfter };
      if (used >= limit) return { allowed: false, limit, remaining: 0, retryAfter };
      try {
        await store.put(keyFor(id, now), used + 1, retryAfter + 3600);
      } catch (error) {
        console.warn("rate-limit write failed; allowing request", String(error));
      }
      return { allowed: true, limit, remaining: Math.max(0, limit - used - 1), retryAfter };
    },
  };
}
