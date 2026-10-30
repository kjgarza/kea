import { en } from "./en";
import { es } from "./es";
import {
  DEFAULT_LOCALE,
  LOCALES,
  type Locale,
  type MessageArgs,
  type MessageKey,
  type Messages,
  type TranslateFn,
} from "./types";

export const CATALOGUES: Record<Locale, Messages> = { en, es };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Map a deck language (DeckMeta.language, e.g. "es", "es-MX", "EN") to a
 * supported UI locale, falling back to English.
 */
export function localeFromLanguage(language: string | null | undefined): Locale {
  const base = language?.toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

/** Replace `{name}` placeholders. Unknown placeholders are left as-is. */
export function interpolate(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

/**
 * Translate `key` into `locale`. Falls back to English if a catalogue entry is
 * somehow empty at runtime (the types already require every key).
 */
export function translate<K extends MessageKey>(
  locale: Locale,
  key: K,
  ...args: MessageArgs<K>
): string {
  const template = CATALOGUES[locale][key] || en[key] || key;
  return interpolate(template, args[0] as Record<string, string | number> | undefined);
}

/** A `t()` bound to one locale. */
export function createTranslator(locale: Locale): TranslateFn {
  return (key, ...args) => translate(locale, key, ...args);
}
