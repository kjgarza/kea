"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Camera, History, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BackupButtons } from "@/components/history/backup-buttons";
import { PasscodeSection } from "@/components/settings/passcode-section";
import { SettingsSection } from "@/components/settings/settings-section";
import { isAiConfigured } from "@/lib/ai/client";
import { getStore } from "@/lib/storage";
import { persistenceState, queryPersisted, useHistoryState } from "@/lib/history";
import type { TranslateFn } from "@/lib/i18n";

export { SettingsSection };

interface Props {
  t: TranslateFn;
  className?: string;
}

/**
 * Gear button + app settings sheet. Sections are small components below;
 * `PasscodeSection` (AI Worker passcode) renders only when
 * NEXT_PUBLIC_KEA_API_URL is set.
 */
export function AppSettingsButton({ t, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={`rounded-full ${className}`}
        onClick={() => setOpen(true)}
        aria-label={t("settings.open")}
        title={t("settings.open")}
        data-testid="settings-open"
      >
        <Settings className="h-5 w-5" />
      </Button>
      <AppSettingsSheet open={open} onOpenChange={setOpen} t={t} />
    </>
  );
}

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: TranslateFn;
}

export function AppSettingsSheet({ open, onOpenChange, t }: SheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto rounded-3xl"
        data-testid="settings-sheet"
      >
        <DialogHeader>
          <DialogTitle className="font-display">{t("settings.title")}</DialogTitle>
          <DialogDescription>{t("settings.description")}</DialogDescription>
        </DialogHeader>
        {open && <StorageSection t={t} />}
        {open && <PasscodeSection t={t} />}
        {open && <AuthoringSection t={t} />}
        <SettingsSection title={t("settings.backup.title")}>
          <p className="text-sm text-muted-foreground">{t("settings.backup.body")}</p>
          <BackupButtons t={t} />
          <Button asChild variant="ghost" className="w-full rounded-full">
            <Link href="/history">
              <History className="h-4 w-4" />
              {t("settings.history")}
            </Link>
          </Button>
        </SettingsSection>
      </DialogContent>
    </Dialog>
  );
}

/** Link to photo quick-add (#38); hidden when the AI Worker is not configured. */
function AuthoringSection({ t }: { t: TranslateFn }) {
  if (!isAiConfigured()) return null;
  return (
    <SettingsSection title={t("add.settingsLink")}>
      <p className="text-sm text-muted-foreground">{t("add.settingsBody")}</p>
      <Button asChild variant="outline" className="w-full rounded-full">
        <Link href="/add" data-testid="settings-add-puzzle">
          <Camera className="h-4 w-4" />
          {t("add.settingsLink")}
        </Link>
      </Button>
    </SettingsSection>
  );
}

/** Whether the browser promised to keep Kea's data (`navigator.storage`). */
function StorageSection({ t }: { t: TranslateFn }) {
  const { settings } = useHistoryState();
  const [live, setLive] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void queryPersisted().then((value) => {
      if (!cancelled) setLive(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const apiAvailable = typeof navigator !== "undefined" && Boolean(navigator.storage?.persist);
  const state = persistenceState(settings, live, getStore().isPersistent(), apiAvailable);

  return (
    <SettingsSection title={t("settings.storage.title")}>
      <p className="text-sm" data-testid="settings-persistence" data-state={state}>
        {t(`settings.storage.${state}`)}
      </p>
    </SettingsSection>
  );
}
