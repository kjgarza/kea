"use client";

import { useSyncExternalStore } from "react";
import { isAiConfigured } from "@/lib/ai/client";
import { getPasscode, subscribePasscode } from "@/lib/ai/passcode";

/**
 * Why AI features can or cannot be used right now:
 * - `not_configured`: the build has no Worker URL (NEXT_PUBLIC_KEA_API_URL).
 * - `missing_passcode`: the Worker is configured but no passcode is saved.
 */
export type AiAvailability = "available" | "not_configured" | "missing_passcode";

function snapshot(): AiAvailability {
  if (!isAiConfigured()) return "not_configured";
  return getPasscode() ? "available" : "missing_passcode";
}

/** Server render: assume unavailable, so AI controls never flash enabled. */
function serverSnapshot(): AiAvailability {
  return isAiConfigured() ? "missing_passcode" : "not_configured";
}

export function useAiAvailability(): AiAvailability {
  return useSyncExternalStore(subscribePasscode, snapshot, serverSnapshot);
}
