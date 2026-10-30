"use client";

import { AlertTriangle, Search } from "lucide-react";
import { motion } from "framer-motion";
import type { SituationCard } from "@/types/card";
import type { SituationSessionState } from "@/types/session";
import type { PlayViewProps } from "@/lib/game/modules/types";
import {
  getMode,
  getPuzzle,
  pickableCardIds,
  situationPhase,
  type SituationAction,
} from "@/lib/game/modules/situation/logic";
import { useLocale } from "@/lib/i18n";
import { ContentWarningScreen } from "./content-warning-screen";
import { SituationEndScreen } from "./end-screen";
import { KEEPER_PANELS } from "./keeper-panels";
import { PuzzlePicker } from "./puzzle-picker";

type Props = PlayViewProps<SituationSessionState, SituationCard, SituationAction>;

const now = () => new Date().toISOString();

/**
 * Situation puzzles: picker → content warnings (F5) → mode-specific keeper
 * panel (setup, reveal, crib sheet; see keeper-panels.tsx) → end screen
 * (F11) → next puzzle along the card stack. All per-puzzle state lives in the
 * session, so a reload resumes exactly where the keeper was.
 */
export function SituationPlayView({ deck, session, currentCard, dispatch }: Props) {
  const { t } = useLocale(deck.language);
  const phase = situationPhase(session);
  const puzzle = getPuzzle(session);

  if (phase === "picker" || !puzzle) {
    const byId = new Map(deck.cards.map((c) => [c.cardId, c]));
    const cards = pickableCardIds(session)
      .map((id) => byId.get(id))
      .filter((c): c is SituationCard => Boolean(c));
    return (
      <PuzzlePicker
        cards={cards}
        onPick={(cardId) => dispatch({ type: "pick", cardId, at: now() })}
        t={t}
      />
    );
  }

  if (!currentCard) return null;

  switch (phase) {
    case "warnings":
      return (
        <ContentWarningScreen
          card={currentCard}
          onContinue={() => dispatch({ type: "acceptWarnings", at: now() })}
          onBack={() => dispatch({ type: "backToPicker" })}
          t={t}
        />
      );
    case "playing": {
      const Panel = KEEPER_PANELS[getMode(session)];
      return (
        <Panel
          deck={deck}
          session={session}
          puzzle={puzzle}
          card={currentCard}
          dispatch={dispatch}
          t={t}
        />
      );
    }
    case "ended":
      return (
        <SituationEndScreen
          card={currentCard}
          puzzle={puzzle}
          hasMore={session.remainingCardIds.length > 0}
          onNext={() => dispatch({ type: "next", at: now() })}
          onChoose={() => dispatch({ type: "next", at: now(), toPicker: true })}
          t={t}
        />
      );
  }
}

interface SetupCardProps {
  card: SituationCard;
  /** Deck language; picks the UI locale unless overridden. */
  language?: string;
}

/**
 * Compact card face: title, warnings, setup (no solution). Kept for reuse in
 * lists/previews; the play flow uses `SetupScreen` for large type.
 */
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
