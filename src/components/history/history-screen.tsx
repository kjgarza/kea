"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocaleSwitch } from "@/components/i18n/locale-switch";
import { AppSettingsButton } from "@/components/settings/app-settings-sheet";
import { newestFirst, useHistoryState, type PlayGroup, type PlayRecord } from "@/lib/history";
import { useLocale, type TranslateFn } from "@/lib/i18n";
import { BackupButtons } from "./backup-buttons";
import { groupLabel } from "./group-picker";

/** Play history list (#28): date, puzzle, group, outcome, questions, hints. */
export function HistoryScreen() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const { history, groups } = useHistoryState();
  const records = useMemo(() => newestFirst(history), [history]);
  const groupsById = useMemo(
    () => new Map(groups.groups.map((g) => [g.id, g])),
    [groups.groups]
  );
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale]
  );

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-lg mx-auto space-y-4">
        <header className="flex items-center justify-between gap-2">
          <Button variant="ghost" className="rounded-full gap-2 -ml-2" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            {t("history.back")}
          </Button>
          <div className="flex items-center gap-1">
            <LocaleSwitch />
            <AppSettingsButton t={t} />
          </div>
        </header>

        <div>
          <h1 className="text-3xl font-bold font-display">{t("history.title")}</h1>
          <p className="text-sm text-muted-foreground" data-testid="history-count">
            {t("history.count", { count: records.length })}
          </p>
        </div>

        <BackupButtons t={t} />

        {records.length === 0 ? (
          <p className="rounded-3xl border bg-white/90 p-5 text-muted-foreground" data-testid="history-empty">
            {t("history.empty")}
          </p>
        ) : (
          <ul className="space-y-3" data-testid="history-list">
            {records.map((r) => (
              <HistoryItem
                key={`${r.deckId}|${r.cardId}|${r.group}|${r.startedAt}`}
                record={r}
                group={groupsById.get(r.group)}
                date={dateFormat.format(new Date(r.endedAt))}
                t={t}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

interface ItemProps {
  record: PlayRecord;
  group: PlayGroup | undefined;
  date: string;
  t: TranslateFn;
}

function HistoryItem({ record, group, date, t }: ItemProps) {
  const name = group ? groupLabel(group, t) : record.groupName || t("history.group.default");
  const solved = record.outcome === "solved";
  return (
    <li className="rounded-3xl border bg-white/90 shadow-sm p-4 space-y-1" data-testid="history-item">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold font-display leading-tight truncate">
            {record.title ?? record.cardId}
          </p>
          <p className="text-xs text-muted-foreground truncate">{record.deckName ?? record.deckId}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            solved ? "bg-situation/15 text-situation" : "bg-muted text-muted-foreground"
          }`}
        >
          {t(`history.outcome.${record.outcome}`)}
        </span>
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>{date}</span>
        <span className="font-medium text-foreground">{name}</span>
        <span>{t("history.item.questions", { count: record.questions })}</span>
        <span>{t("history.item.hints", { count: record.hintsUsed })}</span>
        {record.score !== undefined && (
          <span>{t("history.item.score", { score: record.score })}</span>
        )}
      </p>
    </li>
  );
}
