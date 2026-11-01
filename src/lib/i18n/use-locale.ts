"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  getLocaleOverride,
  setLocaleOverride,
  subscribeLocaleOverride,
} from "./locale-store";
import { createTranslator, localeFromLanguage } from "./translate";
import type { Locale, TranslateFn } from "./types";

export interface UseLocaleResult {
  /** Effective locale: manual override, else the deck language, else "en". */
  locale: Locale;
  /** `t(key, vars)` bound to `locale`. */
  t: TranslateFn;
  /** The manual override, or null when following the deck language. */
  override: Locale | null;
  /** Set (or clear with null) the manual override; persisted across reloads. */
  setOverride: (locale: Locale | null) => void;
}

const getServerOverride = () => null;

/**
 * UI locale for a screen. Pass the deck's language (DeckMeta/Deck `language`)
 * when there is one; the user's manual switch wins over it everywhere.
 */
export function useLocale(deckLanguage?: string | null): UseLocaleResult {
  const override = useSyncExternalStore(
    subscribeLocaleOverride,
    getLocaleOverride,
    getServerOverride
  );
  const locale = override ?? localeFromLanguage(deckLanguage);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const setOverride = useCallback((l: Locale | null) => setLocaleOverride(l), []);
  return { locale, t, override, setOverride };
}
