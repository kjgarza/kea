import { describe, expect, test } from "bun:test";
import { createRateLimiter, memoryCounterStore } from "./rate-limit";

const NOW = new Date("2026-10-30T12:00:00Z");

describe("rate limiter concurrency", () => {
  test("50 concurrent consumes with limit 5 allow exactly 5 (memory store)", async () => {
    const map = new Map<string, number>();
    const limiter = createRateLimiter(memoryCounterStore(map), 5);
    const results = await Promise.all(Array.from({ length: 50 }, () => limiter.consume("pass", NOW)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect([...map.values()]).toEqual([5]);
    expect((await limiter.peek("pass", NOW)).remaining).toBe(0);
  });

  test("keys do not block each other, and a limit override applies per call", async () => {
    const limiter = createRateLimiter(memoryCounterStore(), 5);
    const results = await Promise.all([
      ...Array.from({ length: 10 }, () => limiter.consume("a", NOW, 2)),
      ...Array.from({ length: 10 }, () => limiter.consume("b", NOW)),
    ]);
    expect(results.slice(0, 10).filter((r) => r.allowed)).toHaveLength(2);
    expect(results.slice(10).filter((r) => r.allowed)).toHaveLength(5);
  });
});
