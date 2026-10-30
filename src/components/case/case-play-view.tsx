"use client";

import { useState } from "react";
import { FolderOpen, Gavel, NotebookPen } from "lucide-react";
import type { CaseCard, Evidence } from "@/types/card";
import type { CaseSessionState } from "@/types/session";
import type { PlayViewProps } from "@/lib/game/modules/types";
import {
  investigatorTranscript,
  caseClosing,
  caseMaxPoints,
  casePhase,
  normalizeCaseSession,
  openedEvidence,
  type CaseAction,
} from "@/lib/game/modules/case/logic";
import { totalPoints, unmatchedQuestionIds } from "@/lib/game/modules/case/scoring";
import { useLocale } from "@/lib/i18n";
import { useAiAvailability } from "@/hooks/use-ai-availability";
import { casePlayRecord, getGroups, recordPlay, selectedGroup } from "@/lib/history";
import { AfterPuzzleNotices } from "@/components/history/after-puzzle-notices";
import { AccusationSheet } from "./accusation-sheet";
import { BoardButton, CaseBoard, CaseCoverScreen } from "./case-screens";
import { EvidenceDrawer } from "./evidence-drawer";
import { EvidenceViewer } from "./evidence-viewer";
import { InvestigatorPanel, InvestigatorSheet } from "./investigator-sheet";
import { JudgeSlot } from "./judge-slot";
import { NotesSheet } from "./notes-sheet";
import { CaseClosedScreen, CaseReviewScreen } from "./verdict-screens";

type Props = PlayViewProps<CaseSessionState, CaseCard, CaseAction>;

type Sheet = "evidence" | "notes" | "accuse" | "investigator" | null;

const now = () => new Date().toISOString();

/**
 * Case files (#35, F12–F17), played cooperatively on one phone:
 * cover (content warnings) → case board (briefing, evidence drawer and
 * viewer, notes, accusation form) → review (the group marks unmatched
 * answers) → walkthrough with the team score → next case. Everything that
 * must survive a reload (opened evidence, notes, answers, marks, score) is in
 * the session; only which sheet is open lives here.
 */
export function CasePlayView({ deck, session: rawSession, currentCard, dispatch }: Props) {
  const { t, locale } = useLocale(deck.language);
  // The AI investigator (#37) shows only with a Worker URL and a passcode.
  const aiAvailable = useAiAvailability() === "available";
  const [sheet, setSheet] = useState<Sheet>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  if (!currentCard) return null;
  const session = normalizeCaseSession(rawSession);
  const phase = casePhase(session);

  // A closed case is written to `kea.history` (#28) for the selected group.
  const dispatchAndRecord = (action: CaseAction) => {
    const closed = caseClosing(session, action, deck);
    if (closed) {
      const record = casePlayRecord({
        deckId: deck.deckId,
        deckName: deck.name,
        language: deck.language,
        session: closed,
        card: currentCard,
        group: selectedGroup(getGroups()),
      });
      if (record) recordPlay(record);
    }
    dispatch(action);
  };

  switch (phase) {
    case "cover":
      return (
        <CaseCoverScreen
          card={currentCard}
          onOpen={() => dispatch({ type: "start", at: now() })}
          onSkip={() => dispatch({ type: "skip" })}
          t={t}
        />
      );

    case "board": {
      const opened = openedEvidence(currentCard, session);
      const view = (evidence: Evidence) => {
        if (!session.opened.includes(evidence.id)) {
          dispatch({ type: "open", evidenceId: evidence.id });
        }
        setSheet(null);
        setViewingId(evidence.id);
      };
      // Include an item being opened right now (dispatch is not applied yet).
      const viewerItems =
        viewingId && !opened.some((e) => e.id === viewingId)
          ? [...opened, ...currentCard.evidence.filter((e) => e.id === viewingId)]
          : opened;
      return (
        <>
          <CaseBoard
            card={currentCard}
            opened={opened}
            onView={view}
            t={t}
            footer={
              <div className="grid grid-cols-3 gap-2">
                <BoardButton
                  icon={<FolderOpen className="h-5 w-5" />}
                  label={t("case.board.evidence")}
                  badge={`${opened.length}/${currentCard.evidence.length}`}
                  onClick={() => setSheet("evidence")}
                  testId="case-evidence-open"
                />
                <BoardButton
                  icon={<NotebookPen className="h-5 w-5" />}
                  label={t("case.board.notes")}
                  onClick={() => setSheet("notes")}
                  testId="case-notes-open"
                />
                <BoardButton
                  icon={<Gavel className="h-5 w-5" />}
                  label={t("case.board.accuse")}
                  onClick={() => setSheet("accuse")}
                  primary
                  testId="case-accuse-open"
                />
              </div>
            }
          >
            {aiAvailable && (
              <InvestigatorPanel
                count={investigatorTranscript(session).length}
                onOpen={() => setSheet("investigator")}
                t={t}
              />
            )}
          </CaseBoard>
          {aiAvailable && (
            <InvestigatorSheet
              open={sheet === "investigator"}
              onOpenChange={(open) => setSheet(open ? "investigator" : null)}
              deckId={deck.deckId}
              card={currentCard}
              session={session}
              language={locale}
              dispatch={dispatch}
              onViewEvidence={view}
              t={t}
            />
          )}
          <EvidenceDrawer
            open={sheet === "evidence"}
            onOpenChange={(open) => setSheet(open ? "evidence" : null)}
            card={currentCard}
            opened={session.opened}
            onView={view}
            t={t}
          />
          <NotesSheet
            open={sheet === "notes"}
            onOpenChange={(open) => setSheet(open ? "notes" : null)}
            notes={session.notes}
            onChange={(tab, text) => dispatch({ type: "setNote", tab, text })}
            t={t}
          />
          <AccusationSheet
            open={sheet === "accuse"}
            onOpenChange={(open) => setSheet(open ? "accuse" : null)}
            card={currentCard}
            answers={session.answers}
            onAnswer={(questionId, text) => dispatch({ type: "setAnswer", questionId, text })}
            onSubmit={() => {
              setSheet(null);
              dispatch({ type: "accuse", at: now() });
            }}
            t={t}
          />
          <EvidenceViewer
            deckId={deck.deckId}
            items={viewerItems}
            viewingId={viewingId}
            onViewingChange={setViewingId}
            t={t}
          />
        </>
      );
    }

    case "review":
      return (
        <CaseReviewScreen
          card={currentCard}
          answers={session.answers}
          marks={session.marks ?? {}}
          onMark={(questionId, correct) => dispatch({ type: "mark", questionId, correct })}
          onReveal={() => dispatchAndRecord({ type: "reveal", at: now() })}
          onEdit={() => dispatch({ type: "editAnswers" })}
          judge={
            <JudgeSlot
              deck={deck}
              session={session}
              card={currentCard}
              unmatchedIds={unmatchedQuestionIds(currentCard, session.answers)}
              language={locale}
              dispatch={dispatch}
              t={t}
            />
          }
          t={t}
        />
      );

    case "closed": {
      const scored = session.scored ?? [];
      return (
        <CaseClosedScreen
          card={currentCard}
          answers={session.answers}
          scored={scored}
          score={totalPoints(scored)}
          max={caseMaxPoints(currentCard)}
          hasMore={session.remainingCardIds.length > 0}
          onNext={() => dispatch({ type: "next" })}
          notices={<AfterPuzzleNotices t={t} />}
          t={t}
        />
      );
    }
  }
}
