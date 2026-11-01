/**
 * Token usage and cost accounting for script-side model calls (#33).
 *
 * `meterProvider` wraps any `LlmProvider` and records the usage of every
 * successful call, so shared helpers (`answerKeeperQuestion`, `gradeTheory`)
 * can be metered without knowing about it. Prices come from the single
 * `MODEL_PRICING` table in ./config.
 *
 * Pure module (no Bun/Node APIs).
 */
import { MODEL_PRICING, type ModelPricing } from "./config";
import type { JsonGenerationResult, LlmProvider, TokenUsage } from "./provider";

export interface UsageTotals {
  /** Successful provider calls. */
  calls: number;
  /** Calls whose provider reported no usage (e.g. the stub). */
  callsWithoutUsage: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  /** Estimated cost of the priced calls, in USD. */
  costUsd: number;
  /** Calls made with a model that is not in the pricing table. */
  unpricedCalls: number;
}

export function emptyUsage(): UsageTotals {
  return {
    calls: 0,
    callsWithoutUsage: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    costUsd: 0,
    unpricedCalls: 0,
  };
}

/** Find a model's price; tolerates dated or suffixed model ids ("<id>-2026…"). */
export function pricingFor(
  model: string,
  table: Readonly<Record<string, ModelPricing>> = MODEL_PRICING
): ModelPricing | null {
  if (table[model]) return table[model];
  const prefix = Object.keys(table)
    .filter((id) => model.startsWith(`${id}-`) || model.startsWith(`${id}[`))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? table[prefix] : null;
}

/** Estimated USD cost of one call, or null when the model is unpriced. */
export function estimateCostUsd(
  model: string,
  usage: TokenUsage,
  table: Readonly<Record<string, ModelPricing>> = MODEL_PRICING
): number | null {
  const price = pricingFor(model, table);
  if (!price) return null;
  const perToken = (perMTok: number) => perMTok / 1_000_000;
  return (
    usage.inputTokens * perToken(price.inputPerMTok) +
    usage.outputTokens * perToken(price.outputPerMTok) +
    (usage.cacheReadInputTokens ?? 0) * perToken(price.cacheReadPerMTok ?? price.inputPerMTok) +
    (usage.cacheCreationInputTokens ?? 0) * perToken(price.cacheWritePerMTok ?? price.inputPerMTok)
  );
}

/** Add one call's result to running totals (mutates and returns `totals`). */
export function recordUsage(
  totals: UsageTotals,
  result: Pick<JsonGenerationResult, "model" | "usage">,
  table: Readonly<Record<string, ModelPricing>> = MODEL_PRICING
): UsageTotals {
  totals.calls += 1;
  const usage = result.usage;
  if (!usage) {
    totals.callsWithoutUsage += 1;
    return totals;
  }
  totals.inputTokens += usage.inputTokens;
  totals.outputTokens += usage.outputTokens;
  totals.cacheReadInputTokens += usage.cacheReadInputTokens ?? 0;
  totals.cacheCreationInputTokens += usage.cacheCreationInputTokens ?? 0;
  const cost = estimateCostUsd(result.model, usage, table);
  if (cost === null) totals.unpricedCalls += 1;
  else totals.costUsd += cost;
  return totals;
}

/** Sum several totals into a new object. */
export function sumUsage(items: readonly UsageTotals[]): UsageTotals {
  const total = emptyUsage();
  for (const item of items) {
    total.calls += item.calls;
    total.callsWithoutUsage += item.callsWithoutUsage;
    total.inputTokens += item.inputTokens;
    total.outputTokens += item.outputTokens;
    total.cacheReadInputTokens += item.cacheReadInputTokens;
    total.cacheCreationInputTokens += item.cacheCreationInputTokens;
    total.costUsd += item.costUsd;
    total.unpricedCalls += item.unpricedCalls;
  }
  return total;
}

/** Wrap a provider so every successful call is added to `totals`. */
export function meterProvider(
  provider: LlmProvider,
  totals: UsageTotals,
  table: Readonly<Record<string, ModelPricing>> = MODEL_PRICING
): LlmProvider {
  return {
    name: provider.name,
    model: provider.model,
    async generateJson(request) {
      const result = await provider.generateJson(request);
      recordUsage(totals, result, table);
      return result;
    },
  };
}

/** "$0.0123" (4 decimals under a dollar); "unpriced" / "no usage reported" when nothing could be priced. */
export function formatCostUsd(totals: Pick<UsageTotals, "costUsd" | "unpricedCalls" | "calls" | "callsWithoutUsage">): string {
  const priced = totals.calls - totals.unpricedCalls - totals.callsWithoutUsage;
  if (totals.calls > 0 && totals.callsWithoutUsage === totals.calls) return "no usage reported";
  if (totals.calls > 0 && priced <= 0) return "unpriced";
  const amount = totals.costUsd < 1 ? totals.costUsd.toFixed(4) : totals.costUsd.toFixed(2);
  const note = totals.unpricedCalls + totals.callsWithoutUsage > 0 ? " (partial)" : "";
  return `$${amount}${note}`;
}
