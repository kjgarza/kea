import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DeckMeta } from "@/types/deck";

interface DeckCardProps {
  deck: DeckMeta;
}

export function DeckCard({ deck }: DeckCardProps) {
  return (
    <Link href={`/play/${deck.deckId}`}>
      <Card className="h-full transition-all hover:shadow-lg hover:border-primary cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg">{deck.name}</CardTitle>
            {deck.recommended && (
              <Badge variant="secondary" className="shrink-0">
                Recommended
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
            <Badge variant="outline">{deck.cardCount} cards</Badge>
          </div>
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
