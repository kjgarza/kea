"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  backupFileName,
  downloadJson,
  exportBackup,
  getSettings,
  shouldRemindExport,
  snoozeExportReminder,
  updateSettings,
  useHistoryState,
} from "@/lib/history";
import {
  canPromptInstall,
  isIos,
  isStandalone,
  promptInstall,
  subscribeInstallPrompt,
} from "@/lib/pwa/install-prompt";
import type { TranslateFn } from "@/lib/i18n";

interface Props {
  t: TranslateFn;
}

/**
 * Shown on the end screen of a finished puzzle:
 * - the add-to-home-screen prompt, once ever (after the first finished
 *   puzzle), because Safari clears a site's storage after ~7 days unless it's
 *   installed;
 * - otherwise, an export reminder every 10 new records while the browser
 *   hasn't granted persistent storage.
 */
export function AfterPuzzleNotices({ t }: Props) {
  const { history, settings } = useHistoryState();
  const [showInstall, setShowInstall] = useState(false);

  // Decide once per mount; mark the prompt as shown so it never comes back.
  useEffect(() => {
    if (history.length === 0) return;
    if (getSettings().installPromptShown) return;
    updateSettings({ installPromptShown: true });
    if (isStandalone()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off decision after reading the store
    setShowInstall(true);
  }, [history.length]);

  if (showInstall) return <InstallPrompt t={t} onDismiss={() => setShowInstall(false)} />;
  if (shouldRemindExport(history.length, settings)) return <ExportReminder t={t} />;
  return null;
}

function InstallPrompt({ t, onDismiss }: Props & { onDismiss: () => void }) {
  const canInstall = useSyncExternalStore(subscribeInstallPrompt, canPromptInstall, () => false);
  const ios = isIos();

  return (
    <div
      className="relative rounded-3xl border-2 border-situation/40 bg-white/95 shadow-sm p-4 pr-12 space-y-2"
      role="region"
      aria-label={t("install.title")}
      data-testid="install-prompt"
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-3 right-3 h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-muted"
        aria-label={t("install.dismiss")}
      >
        <X className="h-4 w-4" />
      </button>
      <h2 className="flex items-center gap-2 font-bold font-display">
        <Smartphone className="h-5 w-5 text-situation" />
        {t("install.title")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("install.body")}</p>
      {ios ? (
        <p className="text-sm font-medium">{t("install.ios")}</p>
      ) : canInstall ? (
        <Button
          className="rounded-full"
          onClick={async () => {
            await promptInstall();
            onDismiss();
          }}
        >
          {t("install.button")}
        </Button>
      ) : (
        <p className="text-sm font-medium">{t("install.other")}</p>
      )}
    </div>
  );
}

function ExportReminder({ t }: Props) {
  return (
    <div
      className="rounded-3xl border bg-amber-50 shadow-sm p-4 space-y-2"
      role="region"
      aria-label={t("history.reminder.title")}
      data-testid="export-reminder"
    >
      <h2 className="font-bold font-display">{t("history.reminder.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("history.reminder.body")}</p>
      <div className="flex gap-2">
        <Button
          className="rounded-full"
          onClick={() => {
            const now = new Date();
            downloadJson(backupFileName(now), exportBackup(now));
          }}
        >
          <Download className="h-4 w-4" />
          {t("history.reminder.export")}
        </Button>
        <Button variant="ghost" className="rounded-full" onClick={snoozeExportReminder}>
          {t("history.reminder.later")}
        </Button>
      </div>
    </div>
  );
}
