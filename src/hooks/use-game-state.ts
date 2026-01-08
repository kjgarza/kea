"use client";

import { useState, useCallback, useEffect } from "react";
import type { SessionState, MonikersSessionState } from "@/types/session";
import type { Deck } from "@/types/deck";
import type { Card } from "@/types/card";
import { isMonikersSession } from "@/types/session";
import { useDeck } from "./use-deck";
import { useSession } from "./use-session";
import {
  createInitialSession,
  getCurrentCard,
  nextCard,
  passCard,
  revealCard,
  restartSession,
  isSessionComplete,
  monikersCorrect,
  monikersEndTurn,
  monikersStartNextRound,
  isRoundComplete,
} from "@/lib/game/engine";

export interface UseGameStateReturn {
  // Data
  deck: Deck | null;
  session: SessionState | null;
  currentCard: Card | null;

  // Status
  isLoading: boolean;
  error: Error | null;
  isNotFound: boolean;
  isComplete: boolean;
  isRoundComplete: boolean;
  hasSavedSession: boolean;

  // Monikers specific
  monikersRound: 1 | 2 | 3 | null;

  // Actions
  startGame: (shuffleEnabled: boolean) => void;
  resumeGame: () => void;
  handleNext: () => void;
  handlePass: () => void;
  handleReveal: () => void;
  handleRestart: () => void;
  handleMonikersCorrect: () => void;
  handleMonikersEndTurn: () => void;
  handleMonikersNextRound: () => void;
}

/**
 * Main hook for managing game state on the play screen
 * Combines deck loading, session management, and game actions
 */
export function useGameState(deckId: string): UseGameStateReturn {
  const { deck, isLoading: isDeckLoading, error, isNotFound } = useDeck(deckId);
  const {
    session,
    isLoading: isSessionLoading,
    hasSavedSession,
    setSession,
    clear: clearSession,
  } = useSession(deckId, deck);

  const [hasStarted, setHasStarted] = useState(false);

  // Determine current card
  const currentCard =
    deck && session ? getCurrentCard(session, deck) : null;

  // Check completion status
  const isComplete = session ? isSessionComplete(session) : false;
  const roundComplete =
    session && isMonikersSession(session) ? isRoundComplete(session) : false;

  // Get Monikers round if applicable
  const monikersRound = session && isMonikersSession(session)
    ? session.monikersRound
    : null;

  // Auto-resume if we have a saved session
  useEffect(() => {
    if (!isDeckLoading && !isSessionLoading && hasSavedSession && session) {
      setHasStarted(true);
    }
  }, [isDeckLoading, isSessionLoading, hasSavedSession, session]);

  // Start a new game
  const startGame = useCallback(
    (shuffleEnabled: boolean) => {
      if (!deck) return;

      const newSession = createInitialSession(deck, { shuffleEnabled });
      setSession(newSession);
      setHasStarted(true);
    },
    [deck, setSession]
  );

  // Resume existing game
  const resumeGame = useCallback(() => {
    if (session) {
      setHasStarted(true);
    }
  }, [session]);

  // Handle next card action
  const handleNext = useCallback(() => {
    if (!session) return;
    setSession(nextCard(session));
  }, [session, setSession]);

  // Handle pass action
  const handlePass = useCallback(() => {
    if (!session) return;
    setSession(passCard(session));
  }, [session, setSession]);

  // Handle reveal (trivia only)
  const handleReveal = useCallback(() => {
    if (!session) return;
    setSession(revealCard(session));
  }, [session, setSession]);

  // Handle restart
  const handleRestart = useCallback(() => {
    if (!session || !deck) return;
    setSession(restartSession(session, deck));
  }, [session, deck, setSession]);

  // Monikers: handle correct
  const handleMonikersCorrect = useCallback(() => {
    if (!session || !isMonikersSession(session)) return;
    setSession(monikersCorrect(session));
  }, [session, setSession]);

  // Monikers: handle end turn
  const handleMonikersEndTurn = useCallback(() => {
    if (!session || !isMonikersSession(session)) return;
    setSession(monikersEndTurn(session));
  }, [session, setSession]);

  // Monikers: handle next round
  const handleMonikersNextRound = useCallback(() => {
    if (!session || !isMonikersSession(session) || !deck) return;
    setSession(monikersStartNextRound(session, deck));
  }, [session, deck, setSession]);

  return {
    // Data
    deck,
    session: hasStarted ? session : null,
    currentCard: hasStarted ? currentCard : null,

    // Status
    isLoading: isDeckLoading || isSessionLoading,
    error,
    isNotFound,
    isComplete: hasStarted && isComplete,
    isRoundComplete: hasStarted && roundComplete,
    hasSavedSession,

    // Monikers specific
    monikersRound: hasStarted ? monikersRound : null,

    // Actions
    startGame,
    resumeGame,
    handleNext,
    handlePass,
    handleReveal,
    handleRestart,
    handleMonikersCorrect,
    handleMonikersEndTurn,
    handleMonikersNextRound,
  };
}
