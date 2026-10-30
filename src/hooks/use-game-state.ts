"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import type { SessionState } from "@/types/session";
import type { Deck } from "@/types/deck";
import type { Card } from "@/types/card";
import type { AnyGameModule, GameActionBase } from "@/lib/game/modules/types";
import { getGameModule } from "@/lib/game/modules/registry";
import { getCurrentCard } from "@/lib/game/modules/stack";
import { useDeck } from "./use-deck";
import { useSession } from "./use-session";

export interface UseGameStateReturn {
  // Data
  deck: Deck | null;
  /** The deck's game module (null until the deck loads). */
  gameModule: AnyGameModule | null;
  /** Session once the game has started or resumed, else null. */
  session: SessionState | null;
  currentCard: Card | null;

  // Status
  isLoading: boolean;
  error: Error | null;
  isNotFound: boolean;
  isComplete: boolean;
  hasSavedSession: boolean;

  // Actions
  startGame: (shuffleEnabled: boolean) => void;
  resumeGame: () => void;
  /** Send a module-specific action through the module's reducer. */
  dispatch: (action: GameActionBase) => void;
  handleRestart: () => void;
}

/**
 * Main hook for the play screen: loads the deck and session and routes every
 * game action through the deck's module from the registry. It has no
 * knowledge of individual game types.
 */
export function useGameState(deckId: string): UseGameStateReturn {
  const { deck, isLoading: isDeckLoading, error, isNotFound } = useDeck(deckId);
  const {
    session,
    isLoading: isSessionLoading,
    hasSavedSession,
    setSession,
  } = useSession(deckId, deck);

  const [hasStarted, setHasStarted] = useState(false);

  const gameModule = useMemo(
    () => (deck ? getGameModule(deck.gameType) : null),
    [deck]
  );

  const currentCard = deck && session ? getCurrentCard(session, deck) : null;
  const isComplete =
    session && gameModule ? gameModule.isComplete(session) : false;

  // Auto-resume if we have a saved session
  useEffect(() => {
    if (!isDeckLoading && !isSessionLoading && hasSavedSession && session) {
      setHasStarted(true);
    }
  }, [isDeckLoading, isSessionLoading, hasSavedSession, session]);

  const startGame = useCallback(
    (shuffleEnabled: boolean) => {
      if (!deck || !gameModule) return;
      const shuffleSeed = shuffleEnabled
        ? `${Date.now()}-${Math.random()}`
        : undefined;
      setSession(gameModule.createSession(deck, { shuffleEnabled, shuffleSeed }));
      setHasStarted(true);
    },
    [deck, gameModule, setSession]
  );

  const resumeGame = useCallback(() => {
    if (session) setHasStarted(true);
  }, [session]);

  const dispatch = useCallback(
    (action: GameActionBase) => {
      if (!session || !deck || !gameModule) return;
      const next = gameModule.reduce(session, action, deck);
      if (next !== session) setSession(next);
    },
    [session, deck, gameModule, setSession]
  );

  const handleRestart = useCallback(() => {
    if (!session || !deck || !gameModule) return;
    setSession(
      gameModule.createSession(deck, {
        shuffleEnabled: session.shuffleEnabled,
        shuffleSeed: session.shuffleSeed,
      })
    );
  }, [session, deck, gameModule, setSession]);

  return {
    deck,
    gameModule,
    session: hasStarted ? session : null,
    currentCard: hasStarted ? currentCard : null,

    isLoading: isDeckLoading || isSessionLoading,
    error,
    isNotFound,
    isComplete: hasStarted && isComplete,
    hasSavedSession,

    startGame,
    resumeGame,
    dispatch,
    handleRestart,
  };
}
