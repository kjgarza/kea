"use client";

import { useState } from "react";
import { Bot, KeyRound, User, Users } from "lucide-react";
import type { SituationMode } from "@/types/session";
import type { AiAvailability } from "@/hooks/use-ai-availability";
import type { TranslateFn } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { AppSettingsSheet } from "@/components/settings/app-settings-sheet";

interface Props {
  mode: SituationMode;
  onChange: (mode: SituationMode) => void;
  availability: AiAvailability;
  t: TranslateFn;
}

const MODES: { mode: SituationMode; icon: typeof Users; needsAi: boolean }[] = [
  { mode: "human", icon: Users, needsAi: false },
  { mode: "ai", icon: Bot, needsAi: true },
  { mode: "solo", icon: User, needsAi: true },
];

/**
 * Keeper mode on the puzzle picker (spec §3): human keeper, AI keeper, solo.
 * The AI modes are disabled, with the reason, when the build has no Worker
 * URL or no passcode is saved on this phone.
 */
export function ModePicker({ mode, onChange, availability, t }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const aiOk = availability === "available";

  return (
    <div className="rounded-3xl border bg-white/90 shadow-sm p-4 space-y-3" data-testid="mode-picker">
      <div className="text-sm font-medium text-muted-foreground" id="situation-mode-label">
        {t("situation.mode.label")}
      </div>
      <div
        className="grid grid-cols-3 gap-2"
        role="radiogroup"
        aria-labelledby="situation-mode-label"
      >
        {MODES.map(({ mode: option, icon: Icon, needsAi }) => {
          const selected = option === mode;
          const disabled = needsAi && !aiOk;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={disabled}
              disabled={disabled}
              onClick={() => onChange(option)}
              data-testid={`mode-${option}`}
              className={`min-h-16 rounded-2xl border-2 px-2 py-2 flex flex-col items-center justify-center gap-1 text-sm font-semibold leading-tight transition disabled:opacity-45 ${
                selected
                  ? "bg-situation text-white border-situation"
                  : "bg-white text-foreground border-border"
              }`}
            >
              <Icon className="h-5 w-5" />
              {t(`situation.mode.${option}`)}
            </button>
          );
        })}
      </div>
      {!aiOk && (
        <div className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="mode-unavailable">
          <KeyRound className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p>
              {availability === "not_configured"
                ? t("situation.mode.notConfigured")
                : t("situation.mode.missingPasscode")}
            </p>
            {availability === "missing_passcode" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setSettingsOpen(true)}
                  data-testid="mode-open-settings"
                >
                  {t("situation.mode.openSettings")}
                </Button>
                <AppSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} t={t} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
