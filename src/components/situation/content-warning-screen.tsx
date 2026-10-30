"use client";

import { AlertTriangle, ArrowLeft, Eye } from "lucide-react";
import type { SituationCard } from "@/types/card";
import type { TranslateFn } from "@/lib/i18n";
import { ActionButton } from "@/components/play/action-bar";
import { SituationPanel, SituationShell } from "./situation-shell";

interface Props {
  card: SituationCard;
  onContinue: () => void;
  onBack: () => void;
  t: TranslateFn;
}

/** F5: content warnings are shown before the setup, never after. */
export function ContentWarningScreen({ card, onContinue, onBack, t }: Props) {
  const warnings = card.contentWarnings ?? [];
  return (
    <SituationShell
      testId="situation-warning-screen"
      footer={
        <>
          <ActionButton
            variant="primary"
            className="w-full"
            onClick={onContinue}
            icon={<Eye className="h-5 w-5" />}
          >
            {t("situation.warnings.continue")}
          </ActionButton>
          <ActionButton
            variant="pass"
            className="w-full"
            onClick={onBack}
            icon={<ArrowLeft className="h-5 w-5" />}
          >
            {t("situation.warnings.choose")}
          </ActionButton>
        </>
      }
    >
      <SituationPanel className="mt-6 text-center space-y-4">
        <AlertTriangle className="h-12 w-12 mx-auto text-amber-600" />
        <h1 className="text-2xl font-bold font-display">{t("situation.warnings.title")}</h1>
        <p className="text-muted-foreground">{card.title}</p>
        <p className="font-medium">{t("situation.warnings.body")}</p>
        <ul className="flex flex-wrap justify-center gap-2" data-testid="situation-content-warnings">
          {warnings.map((w) => (
            <li
              key={w}
              className="rounded-full bg-amber-100 text-amber-900 px-3 py-1 text-sm font-medium"
            >
              {w}
            </li>
          ))}
        </ul>
      </SituationPanel>
    </SituationShell>
  );
}
