"use client";

import { Languages } from "lucide-react";
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
        "inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/80 backdrop-blur-sm border shadow-sm text-xs font-semibold uppercase hover:bg-white transition-colors",
        className
      )}
    >
      <Languages className="h-3.5 w-3.5" aria-hidden />
      {locale}
    </button>
  );
}
