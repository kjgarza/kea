"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronRight, Clock, History, Shuffle } from "lucide-react";
import type { SituationCard } from "@/types/card";
import type { SituationMode } from "@/types/session";
import type { AiPlayAvailability } from "@/hooks/use-ai-play-availability";
import type { TranslateFn } from "@/lib/i18n";
import { playedCardIds, selectedGroup, useHistoryState } from "@/lib/history";
import { ActionButton } from "@/components/play/action-bar";
import { GroupPicker } from "@/components/history/group-picker";
import { RandomPickDialog } from "@/components/history/random-pick-dialog";
import { AppSettingsButton } from "@/components/settings/app-settings-sheet";
import { ModePicker } from "./mode-picker";
import { SituationShell } from "./situation-shell";

interface Props {
  deckId: string;
  /** Upcoming puzzles, current first. */
  cards: SituationCard[];
  onPick: (cardId: string) => void;
  /** Keeper mode the next puzzle will be played in. */
  mode: SituationMode;
  onModeChange: (mode: SituationMode) => void;
  /** Whether the AI modes can be chosen (Worker URL + passcode). */
  aiAvailability: AiPlayAvailability;
  t: TranslateFn;
}

/**
 * Puzzle picker (F2): title, content warnings and estimated minutes only —
 * never the setup's answer, solution, facts or hints. Also: who is playing
 * (group, F3), hiding puzzles that group has played, and random pick (F4).
 */
export function PuzzlePicker({
  deckId,
  cards,
  onPick,
  mode,
  onModeChange,
  aiAvailability,
  t,
}: Props) {
  const { history, groups, settings } = useHistoryState();
  const group = selectedGroup(groups);
  const played = useMemo(
    () => playedCardIds(history, deckId, group.id),
    [history, deckId, group.id]
  );
  const [randomOpen, setRandomOpen] = useState(false);
  const visible = group.hidePlayed ? cards.filter((c) => !played.has(c.cardId)) : cards;
  const hiddenCount = cards.length - visible.length;

  return (
    <SituationShell
      testId="situation-picker"
      footer={
        cards.length > 0 && (
          <ActionButton
            variant="pass"
            className="w-full"
            onClick={() => setRandomOpen(true)}
            icon={<Shuffle className="h-5 w-5" />}
          >
            {t("history.random.button")}
          </ActionButton>
        )
      }
    >
      <div className="pt-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold font-display">{t("situation.picker.title")}</h1>
          <div className="flex items-center shrink-0">
            <Link
              href="/history"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent"
              aria-label={t("history.link")}
              title={t("history.link")}
            >
              <History className="h-5 w-5" />
            </Link>
            <AppSettingsButton t={t} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {t(`situation.mode.${mode}.desc`)}{" "}
          <span className="whitespace-nowrap">
            {t("situation.picker.left", { count: cards.length })}
          </span>
        </p>
      </div>

      <ModePicker mode={mode} onChange={onModeChange} availability={aiAvailability} t={t} />

      <GroupPicker groups={groups} t={t} />

      {hiddenCount > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="situation-hidden-count">
          {visible.length === 0
            ? t("history.picker.allPlayed")
            : t("history.picker.hiddenCount", { count: hiddenCount })}
        </p>
      )}

      <ul className="space-y-3">
        {visible.map((card, index) => {
          const warnings = card.contentWarnings ?? [];
          const wasPlayed = played.has(card.cardId);
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
                    {wasPlayed && (
                      <span
                        className="inline-flex items-center gap-1 text-situation font-medium"
                        data-testid="situation-played-badge"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {t("history.picker.played")}
                      </span>
                    )}
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

      <RandomPickDialog
        open={randomOpen}
        onOpenChange={setRandomOpen}
        cards={cards}
        played={played}
        filters={settings.randomFilters}
        onPick={(card) => onPick(card.cardId)}
        t={t}
      />
    </SituationShell>
  );
}
