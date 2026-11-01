"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { backupFileName, downloadJson, exportBackup, importBackup } from "@/lib/history";
import type { TranslateFn } from "@/lib/i18n";

interface Props {
  t: TranslateFn;
}

/** Export/import everything Kea keeps on this phone (history, groups, games). */
export function BackupButtons({ t }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleExport = () => {
    const now = new Date();
    downloadJson(backupFileName(now), exportBackup(now));
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      parsed = null;
    }
    const result = importBackup(parsed);
    setMessage(
      result.ok
        ? t("history.import.done", { count: result.records })
        : t("history.import.invalid")
    );
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 rounded-full" onClick={handleExport}>
          <Download className="h-4 w-4" />
          {t("history.export")}
        </Button>
        <Button
          variant="outline"
          className="flex-1 rounded-full"
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {t("history.import")}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="backup-import-input"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </div>
      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
