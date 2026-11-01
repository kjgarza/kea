"use client";

import { AlertTriangle, Clock, FolderOpen, FolderSearch, SkipForward } from "lucide-react";
import type { CaseCard, Evidence } from "@/types/card";
import type { TranslateFn } from "@/lib/i18n";
import { ActionButton } from "@/components/play/action-bar";
import { Markdown } from "@/components/markdown/markdown";
import { SituationPanel as CasePanel, SituationShell as CaseShell } from "@/components/situation/situation-shell";
import { EVIDENCE_ICONS } from "./evidence-drawer";

export { CasePanel, CaseShell };

interface CoverProps {
  card: CaseCard;
  onOpen: () => void;
  onSkip: () => void;
  t: TranslateFn;
}

/**
 * The case cover: title, estimated time and how to play. Content warnings
 * are shown here, before the briefing (F5), like the situation interstitial.
 */
export function CaseCoverScreen({ card, onOpen, onSkip, t }: CoverProps) {
  const warnings = card.contentWarnings ?? [];
  return (
    <CaseShell
      testId="case-cover"
      footer={
        <>
          <ActionButton
            variant="primary"
            className="w-full"
            onClick={onOpen}
            icon={<FolderOpen className="h-5 w-5" />}
          >
            {t("case.cover.open")}
          </ActionButton>
          <ActionButton
            variant="pass"
            className="w-full"
            onClick={onSkip}
            icon={<SkipForward className="h-5 w-5" />}
          >
            {t("case.play.skip")}
          </ActionButton>
        </>
      }
    >
      <div
        className="mt-4 relative overflow-hidden rounded-3xl bg-gradient-to-br from-case to-case-dark p-6 text-white shadow-2xl shadow-case/30"
        data-testid="case-card"
      >
        <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/10" />
        <div className="relative space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
            <FolderSearch className="h-4 w-4" />
            {t("case.card.badge")}
          </span>
          <h1 className="text-2xl font-bold font-display">{card.title}</h1>
          <p className="flex flex-wrap gap-x-3 text-sm text-white/85" data-testid="case-contents">
            <span>
              {t("case.card.contents", {
                evidence: card.evidence.length,
                questions: card.questions.length,
              })}
            </span>
            {card.estMinutes ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {t("case.cover.minutes", { minutes: card.estMinutes })}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {warnings.length > 0 && (
        <CasePanel className="text-center space-y-3" data-testid="case-warning-screen">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
          <h2 className="text-xl font-bold font-display">{t("case.cover.warningsTitle")}</h2>
          <p className="font-medium">{t("case.cover.warningsBody")}</p>
          <ul className="flex flex-wrap justify-center gap-2" data-testid="case-content-warnings">
            {warnings.map((w) => (
              <li key={w} className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900">
                {w}
              </li>
            ))}
          </ul>
        </CasePanel>
      )}

      <p className="px-2 text-center text-sm text-muted-foreground">{t("case.cover.howTo")}</p>
    </CaseShell>
  );
}

interface BoardProps {
  card: CaseCard;
  opened: Evidence[];
  onView: (evidence: Evidence) => void;
  /** Sticky footer (evidence / notes / accuse buttons). */
  footer: React.ReactNode;
  /** Extra panels (e.g. the AI investigator, #37). */
  children?: React.ReactNode;
  t: TranslateFn;
}

/** F12: the case board — briefing and the evidence opened so far. */
export function CaseBoard({ card, opened, onView, footer, children, t }: BoardProps) {
  return (
    <CaseShell testId="case-board" footer={footer}>
      <h1 className="pt-2 text-2xl font-bold font-display leading-tight">{card.title}</h1>
      <CasePanel>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("case.board.briefing")}
        </h2>
        <Markdown source={card.briefing} data-testid="case-briefing" />
      </CasePanel>

      <CasePanel>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("case.board.opened")} ({opened.length}/{card.evidence.length})
        </h2>
        {opened.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("case.board.noneOpened")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2" data-testid="case-opened-list">
            {opened.map((e) => {
              const Icon = EVIDENCE_ICONS[e.kind];
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onView(e)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-white px-3 py-2 text-sm font-medium hover:bg-case/5"
                    data-testid={`case-opened-${e.id}`}
                  >
                    <Icon className="h-4 w-4 text-case-dark" />
                    {e.title}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CasePanel>
      {children}
    </CaseShell>
  );
}

/** One of the three big board buttons in the sticky footer. */
export function BoardButton({
  icon,
  label,
  badge,
  onClick,
  primary,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  onClick: () => void;
  primary?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`relative flex h-16 flex-col items-center justify-center gap-1 rounded-2xl text-sm font-bold transition-colors ${
        primary
          ? "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25"
          : "border-2 bg-white/80 hover:bg-white"
      }`}
    >
      {icon}
      {label}
      {badge && (
        <span className="absolute top-1.5 right-2 rounded-full bg-case px-1.5 text-[11px] font-semibold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}
