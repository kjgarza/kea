import type { CaseCard } from "@/types/card";
import type { CaseSessionState } from "@/types/session";
import { CasePlayView } from "@/components/case/case-play-view";
import { defineGameModule } from "../types";
import {
  caseCardIds,
  caseProgress,
  createCaseSession,
  isCaseComplete,
  reduceCase,
  type CaseAction,
} from "./logic";

export type { CaseAction } from "./logic";

/**
 * Case files. Placeholder module (#34): shows each case's warnings and
 * briefing so decks can be listed and opened; the case board (#35) replaces
 * the PlayView and extends the session state.
 */
export const caseModule = defineGameModule<CaseSessionState, CaseCard, CaseAction>({
  type: "case",
  createSession: (deck, opts) => createCaseSession(deck, opts),
  reduce: (session, action) => reduceCase(session, action),
  isComplete: isCaseComplete,
  progress: caseProgress,
  cardIds: caseCardIds,
  PlayView: CasePlayView,
  completeTitle: "case.complete.title",
  theme: {
    gradient: "from-case/15 via-case/8 to-case/20",
    pattern: "text-case",
  },
});
