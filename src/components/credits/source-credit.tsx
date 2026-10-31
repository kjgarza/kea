"use client";

import { ExternalLink } from "lucide-react";
import type { ContentSource } from "@/types/card";
import type { Deck } from "@/types/deck";
import type { TranslateFn } from "@/lib/i18n";
import { getLicense, isHttpUrl, type LicenseInfo } from "@/lib/content/licenses";

/**
 * Credits for externally sourced content (#58): the deck licence and
 * attribution on the deck page, and a card's source on the situation end
 * screen and the case walkthrough. Render nothing for Kea's own content.
 */

function licenseLabel(license: LicenseInfo, t: TranslateFn): string {
  return license.family === "PDM" ? t("credits.publicDomain") : license.name;
}

function LicenseLink({ license, t, testId }: { license: LicenseInfo; t: TranslateFn; testId: string }) {
  return (
    <a
      href={license.url}
      target="_blank"
      rel="noopener noreferrer license"
      className="underline underline-offset-2 hover:text-foreground"
      data-testid={testId}
    >
      {licenseLabel(license, t)}
    </a>
  );
}

/** True when a card source has anything worth crediting. */
export function hasSourceCredit(source: ContentSource | undefined): source is ContentSource {
  return !!source && (source.author !== undefined || source.url !== undefined || source.license !== undefined);
}

interface SourceCreditProps {
  source: ContentSource | undefined;
  t: TranslateFn;
  className?: string;
}

export function SourceCredit({ source, t, className = "" }: SourceCreditProps) {
  if (!hasSourceCredit(source)) return null;
  const license = getLicense(source.license);
  const url = isHttpUrl(source.url) ? source.url : undefined;
  return (
    <aside
      className={`text-xs leading-relaxed text-muted-foreground ${className}`}
      data-testid="source-credit"
      aria-label={t("credits.source")}
    >
      <span className="font-semibold uppercase tracking-wide">{t("credits.source")}</span>
      {": "}
      {source.author && <span data-testid="source-credit-author">{t("credits.by", { author: source.author })}</span>}
      {url && (
        <>
          {source.author && " · "}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
            data-testid="source-credit-link"
          >
            {t("credits.original")}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </>
      )}
      {license && (
        <>
          {" · "}
          {t("credits.licenseLabel")}{" "}
          <LicenseLink license={license} t={t} testId="source-credit-license" />
        </>
      )}
      {source.modified && (
        <>
          {" · "}
          <span data-testid="source-credit-modified">{t("credits.modified")}</span>
        </>
      )}
    </aside>
  );
}

interface DeckCreditsProps {
  deck: Pick<Deck, "license" | "attribution">;
  t: TranslateFn;
  className?: string;
}

export function DeckCredits({ deck, t, className = "" }: DeckCreditsProps) {
  const license = getLicense(deck.license);
  if (!license && !deck.attribution) return null;
  return (
    <div
      className={`rounded-2xl bg-muted/50 p-3 text-left text-xs leading-relaxed text-muted-foreground ${className}`}
      data-testid="deck-credits"
    >
      <p className="font-semibold uppercase tracking-wide">{t("credits.title")}</p>
      {license && (
        <p>
          {t("credits.licenseLabel")}{" "}
          <LicenseLink license={license} t={t} testId="deck-credits-license" />
        </p>
      )}
      {deck.attribution && <p data-testid="deck-credits-attribution">{deck.attribution}</p>}
    </div>
  );
}
