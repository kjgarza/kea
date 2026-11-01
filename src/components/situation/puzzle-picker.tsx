"use client";

import { AlertTriangle, ChevronRight, Clock } from "lucide-react";
import type { SituationCard } from "@/types/card";
import type { TranslateFn } from "@/lib/i18n";
import { SituationShell } from "./situation-shell";

interface Props {
  /** Upcoming puzzles, current first. */
  cards: SituationCard[];
  onPick: (cardId: string) => void;
  t: TranslateFn;
}

/**
 * Puzzle picker (F2): title, content warnings and estimated minutes only —
 * never the setup's answer, solution, facts or hints.
 */
export function PuzzlePicker({ cards, onPick, t }: Props) {
  return (
    <SituationShell testId="situation-picker">
      <div className="pt-2">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold font-display">{t("situation.picker.title")}</h1>
          <span className="text-sm text-muted-foreground shrink-0">
            {t("situation.picker.left", { count: cards.length })}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{t("situation.picker.subtitle")}</p>
      </div>

      <ul className="space-y-3">
        {cards.map((card, index) => {
          const warnings = card.contentWarnings ?? [];
          return (
            <li key={card.cardId}>
              <button
                type="button"
                onClick={() => onPick(card.cardId)}
                data-testid={`situation-pick-${card.cardId}`}
                className={`w-full text-left rounded-3xl border bg-white/90 backdrop-blur-sm shadow-sm p-4 min-h-16 flex items-center gap-3 active:scale-[0.99] transition ${
                  index === 0 ? "border-situation border-2" : ""
                }`}
              >
                <div className="flex-1 min-w-0 space-y-1">
                  {index === 0 && (
                    <span className="inline-block text-xs font-semibold uppercase tracking-wide text-situation">
                      {t("situation.picker.nextUp")}
                    </span>
                  )}
                  <span className="block text-lg font-bold font-display leading-tight">
                    {card.title}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    {card.estMinutes !== undefined && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {t("situation.picker.minutes", { minutes: card.estMinutes })}
                      </span>
                    )}
                    {warnings.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {t("situation.picker.warnings", { warnings: warnings.join(", ") })}
                      </span>
                    )}
                  </span>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
    </SituationShell>
  );
}
