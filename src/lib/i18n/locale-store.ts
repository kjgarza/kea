import { defineStoredValue } from "@/lib/storage";
import type { Locale } from "./types";
import { isLocale } from "./translate";

/**
 * The manual language override, persisted through the shared store under
 * `kea.locale`. `null` means "follow the deck language".
 */
const localeOverride = defineStoredValue<Locale>("locale", {
  version: 1,
  validate: isLocale,
});

const listeners = new Set<() => void>();

export function getLocaleOverride(): Locale | null {
  return localeOverride.get();
}

export function setLocaleOverride(locale: Locale | null): void {
  if (locale) localeOverride.set(locale);
  else localeOverride.remove();
  listeners.forEach((l) => l());
}

export function subscribeLocaleOverride(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
