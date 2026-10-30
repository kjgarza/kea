"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { CaseNoteTab, CaseNotes } from "@/types/session";
import type { TranslateFn } from "@/lib/i18n";
import { CASE_INPUT_LIMITS, CASE_NOTE_TABS } from "@/lib/game/modules/case/logic";
import { CaseSheet } from "./case-sheet";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: CaseNotes;
  onChange: (tab: CaseNoteTab, text: string) => void;
  t: TranslateFn;
}

/**
 * F14: shared notes in three tabs (suspects, timeline, free notes). Every
 * keystroke goes through the reducer into the saved session, so the notes
 * survive a reload.
 */
export function NotesSheet({ open, onOpenChange, notes, onChange, t }: Props) {
  const [tab, setTab] = useState<CaseNoteTab>("suspects");
  return (
    <CaseSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("case.notes.title")}
      description={t("case.notes.description")}
      testId="case-notes-sheet"
    >
      <div role="tablist" className="mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
        {CASE_NOTE_TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`case-notes-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="case-notes-panel"
            onClick={() => setTab(id)}
            data-testid={`case-notes-tab-${id}`}
            className={`h-11 rounded-xl text-sm font-semibold transition-colors ${
              tab === id ? "bg-white shadow-sm" : "text-muted-foreground"
            }`}
          >
            {t(`case.notes.tab.${id}`)}
            {notes[id] && tab !== id && <span className="ml-1 text-case">•</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="case-notes-panel" aria-labelledby={`case-notes-tab-${tab}`}>
        <textarea
          key={tab}
          value={notes[tab]}
          onChange={(e) => onChange(tab, e.target.value)}
          placeholder={t(`case.notes.placeholder.${tab}`)}
          aria-label={t(`case.notes.tab.${tab}`)}
          maxLength={CASE_INPUT_LIMITS.noteMaxChars}
          rows={10}
          className="w-full min-h-56 rounded-2xl border bg-white p-4 text-base leading-relaxed outline-none focus:ring-2 focus:ring-case/40"
          data-testid="case-notes-input"
        />
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
          <Check className="h-3 w-3" />
          {t("case.notes.saved")}
        </p>
      </div>
    </CaseSheet>
  );
}
