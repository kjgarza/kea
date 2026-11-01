"use client";

import { AlertTriangle, ArrowRight, FolderSearch, SkipForward } from "lucide-react";
import { motion } from "framer-motion";
import type { CaseCard } from "@/types/card";
import type { CaseSessionState } from "@/types/session";
import type { PlayViewProps } from "@/lib/game/modules/types";
import type { CaseAction } from "@/lib/game/modules/case/logic";
import { useLocale } from "@/lib/i18n";
import { CardStage } from "@/components/play/card-stage";
import { ActionBar, ActionButton } from "@/components/play/action-bar";

type Props = PlayViewProps<CaseSessionState, CaseCard, CaseAction>;

/**
 * Placeholder case screen (#34): content warnings and the briefing. The case
 * board with the evidence drawer, notes and accusation (#35) replaces this.
 */
export function CasePlayView({ deck, currentCard, dispatch }: Props) {
  const { t } = useLocale(deck.language);
  if (!currentCard) return null;

  return (
    <>
      <CardStage>
        <CaseBriefingCard card={currentCard} language={deck.language} />
      </CardStage>
      <p className="px-6 text-center text-sm text-muted-foreground">
        {t("case.play.boardComingSoon")}
      </p>
      <ActionBar>
        <ActionButton
          variant="pass"
          onClick={() => dispatch({ type: "skip" })}
          icon={<SkipForward className="h-5 w-5" />}
        >
          {t("case.play.skip")}
        </ActionButton>
        <ActionButton
          variant="primary"
          onClick={() => dispatch({ type: "next" })}
          icon={<ArrowRight className="h-5 w-5" />}
        >
          {t("case.play.nextCase")}
        </ActionButton>
      </ActionBar>
    </>
  );
}

interface BriefingCardProps {
  card: CaseCard;
  /** Deck language; picks the UI locale unless overridden. */
  language?: string;
}

/** The cover of a case file: title, warnings, briefing and what's inside. */
export function CaseBriefingCard({ card, language }: BriefingCardProps) {
  const { t } = useLocale(language);
  const warnings = card.contentWarnings ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative h-full rounded-3xl bg-gradient-to-br from-case to-case-dark overflow-hidden shadow-2xl shadow-case/30"
      data-testid="case-card"
    >
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10" />
      <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5" />

      <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm">
        <FolderSearch className="w-4 h-4 text-white" />
        <span className="text-xs font-semibold text-white uppercase tracking-wide">
          {t("case.card.badge")}
        </span>
      </div>

      <div className="relative flex flex-col h-full p-6 pt-16 gap-4 overflow-y-auto">
        <h2 className="text-2xl font-bold text-white font-display">{card.title}</h2>
        {warnings.length > 0 && (
          <p
            className="flex items-start gap-2 rounded-xl bg-black/25 px-3 py-2 text-sm text-white"
            data-testid="case-content-warnings"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {t("case.card.contentWarnings", { warnings: warnings.join(", ") })}
          </p>
        )}
        <p
          className="text-lg leading-relaxed text-white whitespace-pre-line"
          data-testid="case-briefing"
        >
          {card.briefing}
        </p>
        <p className="mt-auto text-sm text-white/80" data-testid="case-contents">
          {t("case.card.contents", {
            evidence: card.evidence.length,
            questions: card.questions.length,
          })}
        </p>
      </div>
    </motion.div>
  );
}
