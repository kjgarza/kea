"use client";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n";

interface EndTurnOverlayProps {
  onContinue: () => void;
  cardsRemaining: number;
  language?: string;
}

/** Covers the card so the next team doesn't see it when the phone changes hands. */
export function EndTurnOverlay({ onContinue, cardsRemaining, language }: EndTurnOverlayProps) {
  const { t } = useLocale(language);
  return (
    <div className="card-back pt-safe fixed inset-0 z-50 flex flex-col justify-between">
      <div className="px-6 pt-16">
        <h2 className="display-type text-[4.5rem] [--type-width:84%]">{t("monikers.turnEnded")}</h2>
        <p className="mt-6 text-2xl font-bold">
          {cardsRemaining === 1
            ? t("monikers.cardRemaining")
            : t("monikers.cardsRemaining", { count: cardsRemaining })}
        </p>
        <p className="mt-1 text-xl font-bold">{t("monikers.passPhone")}</p>
      </div>
      <div className="pb-safe-5 px-4">
        <Button size="lg" className="h-16 w-full bg-ink text-xl text-paper" onClick={onContinue}>
          {t("monikers.startTurn")}
        </Button>
      </div>
    </div>
  );
}
