"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n";
import type { DeckMeta } from "@/types/deck";

interface DeckCardProps {
  deck: DeckMeta;
}

export function DeckCard({ deck }: DeckCardProps) {
  // Deck list labels follow the manual switch (or English), not each deck.
  const { t } = useLocale();
  // Older index files may predate `contentWarnings`.
  const warnings = deck.contentWarnings ?? [];
  return (
    <Link href={`/play/${deck.deckId}`}>
      <Card className="h-full transition-all hover:shadow-lg hover:border-primary cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg">{deck.name}</CardTitle>
            {deck.recommended && (
              <Badge variant="secondary" className="shrink-0">
                {t("decks.recommended")}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge variant="outline">{deck.language.toUpperCase()}</Badge>
            <Badge variant="outline" className="capitalize">
              {deck.difficulty}
            </Badge>
            <Badge variant="outline">{t("common.cardCount", { count: deck.cardCount })}</Badge>
          </div>
          {warnings.length > 0 && (
            <p
              className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 mb-3"
              data-testid="deck-content-warnings"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{t("decks.contentWarnings", { warnings: warnings.join(", ") })}</span>
            </p>
          )}
          {deck.topics.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {deck.topics.map((topic) => (
                <span
                  key={topic}
                  className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded"
                >
                  {topic}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
