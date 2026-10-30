import type { SituationCard } from "@/types/card";
import type { SituationSessionState } from "@/types/session";
import type { PlayGroup, PlayRecord } from "./types";

interface Input {
  deckId: string;
  deckName?: string;
  session: SituationSessionState;
  card: SituationCard;
  group: PlayGroup;
  outcome: "solved" | "gave_up";
  endedAt: string;
}

/**
 * Build the PlayRecord for a situation puzzle that is ending now. Returns
 * null when no puzzle is active (not started yet, or already ended).
 */
export function situationPlayRecord({
  deckId,
  deckName,
  session,
  card,
  group,
  outcome,
  endedAt,
}: Input): PlayRecord | null {
  const puzzle = session.puzzle ?? null;
  if (!puzzle || puzzle.startedAt === null || puzzle.outcome !== null) return null;
  if (puzzle.cardId !== card.cardId) return null;
  return {
    deckId,
    cardId: card.cardId,
    group: group.id,
    mode: session.mode ?? "human",
    language: session.language === "es" ? "es" : "en",
    startedAt: puzzle.startedAt,
    endedAt,
    questions: Math.max(puzzle.questionCount, puzzle.transcript.length),
    hintsUsed: puzzle.hintsUsed,
    outcome,
    ...(group.name ? { groupName: group.name } : {}),
    title: card.title,
    ...(deckName ? { deckName } : {}),
  };
}
