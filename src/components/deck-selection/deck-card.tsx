"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { deckDepthShadow } from "@/lib/ui/fit-type";
import type { DeckMeta } from "@/types/deck";

interface DeckCardProps {
  deck: DeckMeta;
}

/** A deck as a row: a pile whose thickness follows its card count, then its name. */
export function DeckCard({ deck }: DeckCardProps) {
  // Deck list labels follow the manual switch (or English), not each deck.
  const { t } = useLocale();
  // Older index files may predate `contentWarnings`.
  const warnings = deck.contentWarnings ?? [];
  return (
    <Link
      href={`/play/${deck.deckId}`}
      className="flex min-h-[5.5rem] items-center gap-4 px-5 py-3 transition-colors active:bg-foreground/10"
    >
      <span
        aria-hidden
        className="card-back block h-16 w-12 shrink-0 -translate-y-1 rounded-md"
        style={{ boxShadow: deckDepthShadow(deck.cardCount, 1.5) }}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-display text-[1.375rem] leading-[1.05] font-bold [font-stretch:80%]">{deck.name}</span>
        <span className="text-[0.9375rem] text-muted-foreground">
          {t("decks.meta", {
            count: deck.cardCount,
            difficulty: t(`decks.difficulty.${deck.difficulty}`),
          })}
        </span>
        {warnings.length > 0 && (
          <span
            className="mt-1 flex items-start gap-1.5 text-sm leading-snug text-[#ffc46b]"
            data-testid="deck-content-warnings"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{t("decks.contentWarnings", { warnings: warnings.join(", ") })}</span>
          </span>
        )}
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
