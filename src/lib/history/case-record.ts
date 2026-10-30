import type { CaseCard } from "@/types/card";
import type { CaseSessionState } from "@/types/session";
import { caseOutcome, totalPoints } from "@/lib/game/modules/case/scoring";
import { localeFromLanguage } from "@/lib/i18n/translate";
import type { PlayGroup, PlayRecord } from "./types";

interface Input {
  deckId: string;
  deckName?: string;
  /** Deck language (EN/ES). */
  language?: string;
  /** The session right after the case was scored (`scored` and `endedAt` set). */
  session: CaseSessionState;
  card: CaseCard;
  group: PlayGroup;
}

/**
 * Build the PlayRecord for a case that has just been closed (walkthrough
 * revealed). Mode is "coop" (one phone, one joint accusation). `questions` is
 * the number of accusation questions, `score` the team's points, and the
 * outcome is "solved" when every answer was right, otherwise "partial".
 * Returns null when the case is not scored.
 */
export function casePlayRecord({
  deckId,
  deckName,
  language,
  session,
  card,
  group,
}: Input): PlayRecord | null {
  const scored = session.scored;
  if (!scored || !session.startedAt || !session.endedAt) return null;
  if (session.caseCardId !== card.cardId) return null;
  return {
    deckId,
    cardId: card.cardId,
    group: group.id,
    mode: "coop",
    language: localeFromLanguage(language),
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    questions: card.questions.length,
    hintsUsed: 0,
    outcome: caseOutcome(scored),
    score: totalPoints(scored),
    ...(group.name ? { groupName: group.name } : {}),
    title: card.title,
    ...(deckName ? { deckName } : {}),
  };
}
