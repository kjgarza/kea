"use client";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n";

interface RoundCompleteScreenProps {
  round: number;
  language?: string;
  onNextRound: () => void;
}

/** Full-screen interstitial between Monikers rounds. */
export function RoundCompleteScreen({ round, language, onNextRound }: RoundCompleteScreenProps) {
  const { t } = useLocale(language);
  const nextRound = (round + 1) as 2 | 3;

  return (
    <div data-game="monikers" className="card-back pt-safe flex min-h-dvh flex-col justify-between">
      <div className="px-6 pt-16">
        <h1 className="display-type text-[4.5rem] [--type-width:80%]">
          {t("monikers.roundComplete", { round })}
        </h1>
        <p className="mt-6 max-w-[22ch] text-2xl leading-snug font-bold">{t(`monikers.next.${nextRound}`)}</p>
      </div>
      <div className="pb-safe-5 px-4">
        <Button className="h-16 w-full bg-ink text-xl text-paper" onClick={onNextRound}>
          {t("monikers.startRound", { round: nextRound })}
        </Button>
      </div>
    </div>
  );
}
