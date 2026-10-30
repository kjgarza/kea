"use client";

import { AlertTriangle, ArrowRight, Search, SkipForward } from "lucide-react";
import { motion } from "framer-motion";
import type { SituationCard } from "@/types/card";
import type { SituationSessionState } from "@/types/session";
import type { PlayViewProps } from "@/lib/game/modules/types";
import type { SituationAction } from "@/lib/game/modules/situation/logic";
import { useLocale } from "@/lib/i18n";
import { CardStage } from "@/components/play/card-stage";
import { ActionBar, ActionButton } from "@/components/play/action-bar";

type Props = PlayViewProps<SituationSessionState, SituationCard, SituationAction>;

/**
 * Placeholder situation screen: content warnings first (F5), then the setup
 * to read aloud. The solution is not shown here; the keeper view (#25)
 * replaces this with the reveal flow.
 */
export function SituationPlayView({ deck, currentCard, dispatch }: Props) {
  const { t } = useLocale(deck.language);
  if (!currentCard) return null;

  return (
    <>
      <CardStage>
        <SituationSetupCard card={currentCard} language={deck.language} />
      </CardStage>
      <p className="px-6 text-center text-sm text-muted-foreground">
        {t("situation.play.keeperComingSoon")}
      </p>
      <ActionBar>
        <ActionButton
          variant="pass"
          onClick={() => dispatch({ type: "skip" })}
          icon={<SkipForward className="h-5 w-5" />}
        >
          {t("situation.play.skip")}
        </ActionButton>
        <ActionButton
          variant="primary"
          onClick={() => dispatch({ type: "next" })}
          icon={<ArrowRight className="h-5 w-5" />}
        >
          {t("situation.play.nextPuzzle")}
        </ActionButton>
      </ActionBar>
    </>
  );
}

interface SetupCardProps {
  card: SituationCard;
  /** Deck language; picks the UI locale unless overridden. */
  language?: string;
}

/** The front of a situation card: title, warnings, setup. */
export function SituationSetupCard({ card, language }: SetupCardProps) {
  const { t } = useLocale(language);
  const warnings = card.contentWarnings ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative h-full rounded-3xl bg-gradient-to-br from-situation to-situation-dark overflow-hidden shadow-2xl shadow-situation/30"
      data-testid="situation-card"
    >
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10" />
      <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5" />

      <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm">
        <Search className="w-4 h-4 text-white" />
        <span className="text-xs font-semibold text-white uppercase tracking-wide">
          {t("situation.card.badge")}
        </span>
      </div>

      <div className="relative flex flex-col h-full p-6 pt-16 gap-4 overflow-y-auto">
        <h2 className="text-2xl font-bold text-white font-display">{card.title}</h2>
        {warnings.length > 0 && (
          <p
            className="flex items-start gap-2 rounded-xl bg-black/25 px-3 py-2 text-sm text-white"
            data-testid="situation-content-warnings"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {t("situation.card.contentWarnings", { warnings: warnings.join(", ") })}
          </p>
        )}
        <p className="text-xl md:text-2xl leading-relaxed text-white">{card.setup}</p>
      </div>
    </motion.div>
  );
}
