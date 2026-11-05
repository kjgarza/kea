"use client";

import { useLocale } from "@/lib/i18n";
import type { MonikersRound } from "@/types/session";

interface RoundIndicatorProps {
  round: MonikersRound;
  language?: string;
}

/** Which round this is and the rule for it, so nobody has to ask mid-turn. */
export function RoundIndicator({ round, language }: RoundIndicatorProps) {
  const { t } = useLocale(language);

  return (
    <div className="min-w-0">
      <p className="font-display text-lg leading-none font-extrabold">{t("monikers.round", { round })}</p>
      <p className="mt-1 truncate text-sm leading-none font-bold text-muted-foreground">
        {t(`monikers.hint.${round}`)}
      </p>
    </div>
  );
}
