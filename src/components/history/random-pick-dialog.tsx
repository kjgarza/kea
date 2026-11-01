"use client";

import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  filterCandidates,
  MAX_MINUTES_OPTIONS,
  pickRandom,
  updateSettings,
  type PickCandidate,
  type RandomFilters,
} from "@/lib/history";
import type { TranslateFn } from "@/lib/i18n";

interface Props<C extends PickCandidate> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cards: readonly C[];
  played: ReadonlySet<string>;
  filters: RandomFilters;
  onPick: (card: C) => void;
  t: TranslateFn;
}

/** F4: random pick with filters (unplayed, max minutes, exclude warnings). */
export function RandomPickDialog<C extends PickCandidate>({
  open,
  onOpenChange,
  cards,
  played,
  filters,
  onPick,
  t,
}: Props<C>) {
  const matches = filterCandidates(cards, filters, played).length;
  const setFilters = (patch: Partial<RandomFilters>) =>
    updateSettings({ randomFilters: { ...filters, ...patch } });

  const pick = () => {
    const card = pickRandom(cards, filters, played);
    if (!card) return;
    onOpenChange(false);
    onPick(card);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl" aria-describedby={undefined} data-testid="random-pick-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">{t("history.random.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>{t("history.random.unplayed")}</span>
            <Switch
              checked={filters.unplayed}
              onCheckedChange={(unplayed) => setFilters({ unplayed })}
              aria-label={t("history.random.unplayed")}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>{t("history.random.excludeWarnings")}</span>
            <Switch
              checked={filters.excludeWarnings}
              onCheckedChange={(excludeWarnings) => setFilters({ excludeWarnings })}
              aria-label={t("history.random.excludeWarnings")}
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm mb-2">{t("history.random.maxMinutes")}</legend>
            <div className="flex flex-wrap gap-2">
              {MAX_MINUTES_OPTIONS.map((minutes) => {
                const selected = filters.maxMinutes === minutes;
                return (
                  <button
                    key={String(minutes)}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setFilters({ maxMinutes: minutes })}
                    className={`h-9 rounded-full px-3 text-sm font-medium border transition ${
                      selected
                        ? "bg-situation text-white border-situation"
                        : "bg-white border-border"
                    }`}
                  >
                    {minutes === null
                      ? t("history.random.anyLength")
                      : t("history.random.minutes", { minutes })}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <p className="text-sm text-muted-foreground" data-testid="random-pick-matches">
            {matches > 0
              ? t("history.random.matches", { count: matches })
              : t("history.random.none")}
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button className="rounded-full" onClick={pick} disabled={matches === 0}>
            <Shuffle className="h-4 w-4" />
            {t("history.random.pick")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
