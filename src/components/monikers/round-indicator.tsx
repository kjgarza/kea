"use client";

import { Badge } from "@/components/ui/badge";
import type { MonikersRound } from "@/types/session";

interface RoundIndicatorProps {
  round: MonikersRound;
}

const ROUND_INFO: Record<MonikersRound, { name: string; hint: string }> = {
  1: {
    name: "Describe It",
    hint: "Use any words except the name",
  },
  2: {
    name: "One Word",
    hint: "Only ONE word allowed",
  },
  3: {
    name: "Act It Out",
    hint: "No words! Just actions",
  },
};

export function RoundIndicator({ round }: RoundIndicatorProps) {
  const info = ROUND_INFO[round];

  return (
    <div className="flex flex-col items-center gap-1">
      <Badge variant="secondary" className="text-sm">
        Round {round}/3
      </Badge>
      <span className="text-xs font-medium text-primary">{info.name}</span>
      <span className="text-xs text-muted-foreground">{info.hint}</span>
    </div>
  );
}

export function RoundBadge({ round }: RoundIndicatorProps) {
  return (
    <Badge variant="secondary" className="gap-1">
      <span>Round {round}</span>
      <span className="text-muted-foreground">/ 3</span>
    </Badge>
  );
}
