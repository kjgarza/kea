import type { ClientErrorCode } from "@/lib/ai/client";
import type { PlainMessageKey } from "@/lib/i18n";

/** Message for a failed Worker call (keeper questions and theories). */
export function errorMessageKey(code: ClientErrorCode | undefined): PlainMessageKey {
  switch (code) {
    case "network":
      return "situation.ai.error.network";
    case "missing_passcode":
    case "unauthorized":
      return "situation.ai.error.passcode";
    case "rate_limited":
      return "situation.ai.error.limited";
    case "not_configured":
      return "situation.ai.error.notConfigured";
    default:
      return "situation.ai.error.generic";
  }
}
