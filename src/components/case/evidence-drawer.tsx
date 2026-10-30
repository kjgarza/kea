"use client";

import { Check, ChevronRight, FileText, Image as ImageIcon, Lock, Map as MapIcon, MessageSquare, Phone } from "lucide-react";
import type { CaseCard, Evidence, EvidenceKind } from "@/types/card";
import type { TranslateFn } from "@/lib/i18n";
import { isEvidenceUnlocked, missingUnlocks } from "@/lib/game/modules/case/logic";
import { CaseSheet } from "./case-sheet";

export const EVIDENCE_ICONS: Record<EvidenceKind, React.ComponentType<{ className?: string }>> = {
  document: FileText,
  interview: MessageSquare,
  phone_log: Phone,
  image: ImageIcon,
  pdf: FileText,
  map: MapIcon,
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: CaseCard;
  opened: readonly string[];
  /** Open (if new) and view an item. */
  onView: (evidence: Evidence) => void;
  t: TranslateFn;
}

/**
 * F12: every evidence item of the case. Opened items can be viewed again,
 * unlocked ones open on tap, and locked ones name the evidence that unlocks
 * them ("Open X first").
 */
export function EvidenceDrawer({ open, onOpenChange, card, opened, onView, t }: Props) {
  const titles = new Map(card.evidence.map((e) => [e.id, e.title]));
  return (
    <CaseSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("case.evidence.title")}
      description={t("case.evidence.progress", {
        opened: opened.length,
        total: card.evidence.length,
      })}
      testId="case-evidence-drawer"
    >
      <p className="mb-3 text-sm text-muted-foreground">{t("case.evidence.description")}</p>
      <ul className="space-y-2">
        {card.evidence.map((evidence) => {
          const isOpened = opened.includes(evidence.id);
          const unlocked = isOpened || isEvidenceUnlocked(evidence, opened);
          const state = isOpened ? "opened" : unlocked ? "unlocked" : "locked";
          const Icon = EVIDENCE_ICONS[evidence.kind];
          const missing = unlocked
            ? []
            : missingUnlocks(evidence, opened).map((id) => `“${titles.get(id) ?? id}”`);
          return (
            <li key={evidence.id}>
              <button
                type="button"
                disabled={!unlocked}
                onClick={() => onView(evidence)}
                data-testid={`case-evidence-item-${evidence.id}`}
                data-state={state}
                className={`w-full min-h-14 flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                  state === "locked"
                    ? "bg-muted/60 text-muted-foreground"
                    : state === "opened"
                      ? "bg-white hover:bg-case/5"
                      : "bg-case/10 border-case/40 hover:bg-case/15"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    state === "locked" ? "bg-muted" : "bg-case/15 text-case-dark"
                  }`}
                >
                  {state === "locked" ? <Lock className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-tight">{evidence.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {state === "locked" ? (
                      <span data-testid="case-evidence-locked-hint">
                        {t("case.evidence.openFirst", {
                          items: missing.join(t("case.evidence.and")),
                        })}
                      </span>
                    ) : (
                      t(`case.evidence.kind.${evidence.kind}`)
                    )}
                  </span>
                </span>
                {state === "opened" && <Check className="h-5 w-5 text-emerald-600" />}
                {state === "unlocked" && (
                  <span className="rounded-full bg-case px-2 py-0.5 text-xs font-semibold text-white">
                    {t("case.evidence.new")}
                  </span>
                )}
                {state !== "locked" && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
            </li>
          );
        })}
      </ul>
    </CaseSheet>
  );
}
