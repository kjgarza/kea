import type { SituationCard } from "@/types/card";
import type { SituationSessionState } from "@/types/session";
import { questionsAsked, soloScore } from "@/lib/game/modules/situation/logic";
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
  const mode = session.mode ?? "human";
  return {
    deckId,
    cardId: card.cardId,
    group: group.id,
    mode,
    language: session.language === "es" ? "es" : "en",
    startedAt: puzzle.startedAt,
    endedAt,
    questions: questionsAsked(puzzle),
    hintsUsed: puzzle.hintsUsed,
    outcome,
    ...(mode === "solo" ? { score: soloScore({ ...puzzle, outcome }) } : {}),
    ...(group.name ? { groupName: group.name } : {}),
    title: card.title,
    ...(deckName ? { deckName } : {}),
  };
}
