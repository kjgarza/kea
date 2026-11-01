"use client";

import { isAiPlayEnabled } from "@/lib/features";
import { useAiAvailability, type AiAvailability } from "./use-ai-availability";

/**
 * AI availability for play features (AI keeper, solo, grading, investigator,
 * judge). `deferred` means AI-assisted play is switched off for this release
 * (see `isAiPlayEnabled`); it wins over every other state.
 */
export type AiPlayAvailability = AiAvailability | "deferred";

export function useAiPlayAvailability(): AiPlayAvailability {
  const availability = useAiAvailability();
  return isAiPlayEnabled() ? availability : "deferred";
}
