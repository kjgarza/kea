"use client";

import { useState, useEffect, useCallback } from "react";
import type { SessionState } from "@/types/session";
import type { Deck } from "@/types/deck";
import {
  loadSession,
  saveSession,
  clearSession,
} from "@/lib/session/session-storage";
import {
  validateSessionAgainstDeck,
  type ValidationResult,
} from "@/lib/session/session-validator";

export interface UseSessionOptions {
  /** Auto-save session on changes */
  autoSave?: boolean;
}

export interface UseSessionReturn {
  /** Current session state (null if not loaded or invalid) */
  session: SessionState | null;
  /** Whether session is being loaded */
  isLoading: boolean;
  /** Validation result if session exists but is invalid */
  validationError: ValidationResult | null;
  /** Whether a saved session exists for this deck */
  hasSavedSession: boolean;
  /** Update session state */
  setSession: (session: SessionState) => void;
  /** Clear the session */
  clear: () => void;
  /** Force reload session from storage */
  reload: () => void;
}

/**
 * Hook for managing game session state
 * Handles loading, saving, and validating sessions
 */
export function useSession(
  deckId: string,
  deck: Deck | null,
  options: UseSessionOptions = {}
): UseSessionReturn {
  const { autoSave = true } = options;

  const [session, setSessionState] = useState<SessionState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [validationError, setValidationError] =
    useState<ValidationResult | null>(null);
  const [hasSavedSession, setHasSavedSession] = useState(false);

  // Load session on mount
  useEffect(() => {
    setIsLoading(true);
    const savedSession = loadSession(deckId);

    if (savedSession) {
      setHasSavedSession(true);

      // Validate against deck if deck is loaded
      if (deck) {
        const validation = validateSessionAgainstDeck(savedSession, deck);
        if (validation.isValid) {
          setSessionState(savedSession);
          setValidationError(null);
        } else {
          setSessionState(null);
          setValidationError(validation);
        }
      } else {
        // Deck not loaded yet, store session temporarily
        setSessionState(savedSession);
      }
    } else {
      setHasSavedSession(false);
      setSessionState(null);
    }

    setIsLoading(false);
  }, [deckId, deck]);

  // Re-validate when deck loads
  useEffect(() => {
    if (deck && session && !validationError) {
      const validation = validateSessionAgainstDeck(session, deck);
      if (!validation.isValid) {
        setValidationError(validation);
        setSessionState(null);
      }
    }
  }, [deck, session, validationError]);

  // Auto-save session changes
  useEffect(() => {
    if (autoSave && session) {
      saveSession(session);
    }
  }, [autoSave, session]);

  const setSession = useCallback((newSession: SessionState) => {
    setSessionState(newSession);
    setValidationError(null);
    setHasSavedSession(true);
  }, []);

  const clear = useCallback(() => {
    clearSession(deckId);
    setSessionState(null);
    setValidationError(null);
    setHasSavedSession(false);
  }, [deckId]);

  const reload = useCallback(() => {
    setIsLoading(true);
    const savedSession = loadSession(deckId);

    if (savedSession && deck) {
      const validation = validateSessionAgainstDeck(savedSession, deck);
      if (validation.isValid) {
        setSessionState(savedSession);
        setValidationError(null);
        setHasSavedSession(true);
      } else {
        setSessionState(null);
        setValidationError(validation);
        setHasSavedSession(true);
      }
    } else if (savedSession) {
      setSessionState(savedSession);
      setHasSavedSession(true);
    } else {
      setSessionState(null);
      setHasSavedSession(false);
    }

    setIsLoading(false);
  }, [deckId, deck]);

  return {
    session,
    isLoading,
    validationError,
    hasSavedSession,
    setSession,
    clear,
    reload,
  };
}
