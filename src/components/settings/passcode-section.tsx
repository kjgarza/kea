"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getWorkerStatus, isAiConfigured, KeaApiError } from "@/lib/ai/client";
import { getPasscode, setPasscode } from "@/lib/ai/passcode";
import type { PlainMessageKey, TranslateFn } from "@/lib/i18n";
import { SettingsSection } from "./settings-section";

interface Props {
  t: TranslateFn;
}

type Feedback =
  | { kind: "message"; key: PlainMessageKey; tone: "ok" | "error" }
  | { kind: "remaining"; remaining: number }
  | null;

/**
 * Passcode for the AI Worker. Rendered only when the build has
 * NEXT_PUBLIC_KEA_API_URL, so without it the sheet looks exactly as before.
 */
export function PasscodeSection({ t }: Props) {
  if (!isAiConfigured()) return null;
  return <PasscodeForm t={t} />;
}

function PasscodeForm({ t }: Props) {
  // Rendered only inside the open dialog (client side), so reading storage
  // in the initialiser is safe.
  const [value, setValue] = useState(() => getPasscode() ?? "");
  const [stored, setStored] = useState(() => getPasscode());
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const save = () => {
    setPasscode(value);
    const next = getPasscode();
    setStored(next);
    setFeedback({ kind: "message", key: next ? "settings.passcode.saved" : "settings.passcode.removed", tone: "ok" });
  };

  const remove = () => {
    setPasscode("");
    setStored(null);
    setValue("");
    setFeedback({ kind: "message", key: "settings.passcode.removed", tone: "ok" });
  };

  const check = async () => {
    setChecking(true);
    setFeedback(null);
    try {
      const status = await getWorkerStatus({ passcode: value.trim() || null });
      setFeedback(
        status.remaining === null
          ? { kind: "message", key: "settings.passcode.okUnlimited", tone: "ok" }
          : { kind: "remaining", remaining: status.remaining }
      );
    } catch (error) {
      const code = error instanceof KeaApiError ? error.code : "network";
      const key: PlainMessageKey =
        code === "unauthorized" || code === "missing_passcode"
          ? "settings.passcode.wrong"
          : code === "rate_limited"
            ? "settings.passcode.limited"
            : "settings.passcode.error";
      setFeedback({ kind: "message", key, tone: "error" });
    } finally {
      setChecking(false);
    }
  };

  const trimmed = value.trim();

  return (
    <SettingsSection title={t("settings.passcode.title")}>
      <p className="text-sm text-muted-foreground">{t("settings.passcode.body")}</p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label htmlFor="kea-passcode" className="sr-only">
          {t("settings.passcode.label")}
        </label>
        <Input
          id="kea-passcode"
          type="password"
          autoComplete="off"
          placeholder={t("settings.passcode.label")}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-11 rounded-full px-4"
          data-testid="passcode-input"
        />
        <Button
          type="submit"
          className="h-11 rounded-full"
          disabled={trimmed === (stored ?? "")}
          data-testid="passcode-save"
        >
          {t("settings.passcode.save")}
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={check}
          disabled={checking || !trimmed}
          data-testid="passcode-check"
        >
          {checking ? t("settings.passcode.checking") : t("settings.passcode.check")}
        </Button>
        {stored && (
          <Button type="button" variant="ghost" className="rounded-full" onClick={remove} data-testid="passcode-remove">
            {t("settings.passcode.remove")}
          </Button>
        )}
      </div>
      {feedback && (
        <p
          role="status"
          className={`text-sm ${feedback.kind === "message" && feedback.tone === "error" ? "text-destructive" : ""}`}
          data-testid="passcode-feedback"
        >
          {feedback.kind === "remaining"
            ? t("settings.passcode.ok", { remaining: feedback.remaining })
            : t(feedback.key)}
        </p>
      )}
    </SettingsSection>
  );
}
