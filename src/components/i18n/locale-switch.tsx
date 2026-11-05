"use client";

import { cn } from "@/lib/utils";
import { useLocale, type Locale } from "@/lib/i18n";

interface LocaleSwitchProps {
  /** The deck language this screen defaults to, if any. */
  deckLanguage?: string | null;
  className?: string;
}

const NEXT_LOCALE: Record<Locale, Locale> = { en: "es", es: "en" };

/**
 * EN/ES toggle. Sets the manual override (persisted via the shared store), so
 * the choice wins over the deck language on every screen and survives reloads.
 */
export function LocaleSwitch({ deckLanguage, className }: LocaleSwitchProps) {
  const { locale, t, setOverride } = useLocale(deckLanguage);
  const other = NEXT_LOCALE[locale];

  return (
    <button
      type="button"
      data-testid="locale-switch"
      onClick={() => setOverride(other)}
      aria-label={t("locale.switchLabel", {
        language: t(`locale.name.${locale}`),
        other: t(`locale.name.${other}`),
      })}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-full bg-foreground/10 text-sm font-bold uppercase transition-colors active:bg-foreground/20",
        className
      )}
    >
      {locale}
    </button>
  );
}
