"use client";

import { Check } from "lucide-react";
import type { Card } from "@/types/card";
import {
  isCharadesCard,
  isTriviaCard,
  isTriviaMCQCard,
  isTabooCard,
  isJustOneCard,
  isMonikersCard,
} from "@/types/card";
import { useLocale, type TranslateFn } from "@/lib/i18n";
import { fitType } from "@/lib/ui/fit-type";
import { cn } from "@/lib/utils";

interface CardDisplayProps {
  card: Card;
  /** The deck's language; card labels follow it unless the user switched. */
  language?: string;
  isRevealed?: boolean;
  onReveal?: () => void;
}

const FACE = "absolute inset-0 flex flex-col overflow-hidden rounded-[1.75rem] shadow-[0_10px_24px_-10px_rgb(0_0_0/0.6)]";

/**
 * One face per game. Each is drawn from how that game is played, and the word
 * being played is always the largest thing on screen.
 */
export function CardDisplay({ card, language, isRevealed = false, onReveal }: CardDisplayProps) {
  const { t } = useLocale(language);

  if (isCharadesCard(card)) return <CharadesFace prompt={card.prompt} t={t} />;
  if (isTriviaCard(card)) return <TriviaFace card={card} isRevealed={isRevealed} onReveal={onReveal} t={t} />;
  if (isTabooCard(card)) return <TabooFace target={card.target} forbidden={card.forbidden} t={t} />;
  if (isJustOneCard(card)) return <JustOneFace target={card.target} t={t} />;
  if (isMonikersCard(card)) return <MonikersFace phrase={card.phrase} description={card.description} />;
  return null;
}

/** A stage: the prompt stands in the spotlight. "Artist - Song" prompts split in two. */
function CharadesFace({ prompt, t }: { prompt: string; t: TranslateFn }) {
  const [main, detail] = splitPrompt(prompt);
  return (
    <div
      className={`${FACE} text-[#fffdf7]`}
      style={{
        background:
          "radial-gradient(90% 62% at 62% -6%, rgb(255 233 190 / 0.62), rgb(255 200 150 / 0.14) 55%, transparent 74%), var(--game-deep)",
      }}
    >
      <p className="px-6 pt-5 text-lg font-bold">{t("card.actItOut")}</p>
      <div className="mt-auto px-6 pb-7">
        <p className="display-type" style={fitType(main)}>
          {main}
        </p>
        {detail && <p className="mt-3 text-xl leading-tight font-bold">{detail}</p>}
      </div>
    </div>
  );
}

function splitPrompt(prompt: string): [string, string?] {
  const at = prompt.indexOf(" - ");
  return at === -1 ? [prompt] : [prompt.slice(at + 3), prompt.slice(0, at)];
}

/** A quiz sheet: the question up top, the options as a printed list under it. */
function TriviaFace({
  card,
  isRevealed,
  onReveal,
  t,
}: {
  card: Card & { type: "trivia" };
  isRevealed: boolean;
  onReveal?: () => void;
  t: TranslateFn;
}) {
  const isMCQ = isTriviaMCQCard(card);
  return (
    <div className={`${FACE} bg-game text-game-ink`}>
      <div className="flex min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {/* my-auto, not items-center: centring would put an overflowing question out of scroll reach. */}
        <p className="display-type my-auto leading-[1.02]" style={{ ...fitType(card.question, { maxPx: 46, aspect: 0.62, measure: 80 }), "--type-width": "84%" } as React.CSSProperties}>
          {card.question}
        </p>
      </div>

      {isMCQ && (
        <ol className="flex shrink-0 flex-col gap-1.5 px-3">
          {card.choices.map((choice, idx) => {
            const isAnswer = isRevealed && idx === card.answerIndex;
            const isDimmed = isRevealed && !isAnswer;
            return (
              <li
                key={idx}
                className={`flex min-h-12 items-center gap-3 rounded-2xl px-4 py-2 text-[1.0625rem] leading-tight font-bold transition-colors ${
                  isAnswer
                    ? "bg-success text-success-foreground"
                    : isDimmed
                      ? "bg-paper/25 text-game-ink"
                      : "bg-paper text-ink"
                }`}
              >
                <span className="font-display text-lg font-extrabold">{String.fromCharCode(65 + idx)}</span>
                <span className="min-w-0 flex-1">{choice}</span>
                {isAnswer && <Check className="size-5 shrink-0" aria-hidden />}
              </li>
            );
          })}
        </ol>
      )}

      <div className="shrink-0 p-3">
        {!isRevealed && (
          <button
            type="button"
            onClick={onReveal}
            className="font-display h-14 w-full rounded-2xl border-2 border-game-ink/70 text-lg font-extrabold transition-[background-color,transform] active:scale-[0.98] active:bg-black/15"
          >
            {t("card.reveal")}
          </button>
        )}
        {isRevealed && !isMCQ && (
          <div className="rounded-2xl bg-success p-4 text-success-foreground">
            <p className="text-sm font-bold">{t("card.answer")}</p>
            <p className="font-display text-2xl leading-tight font-extrabold">{card.answerText}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** A hard print job: the target in black, then the banned list, ruled and in red. */
function TabooFace({ target, forbidden, t }: { target: string; forbidden: string[]; t: TranslateFn }) {
  return (
    <div className={`${FACE} bg-paper text-ink`}>
      <div className="flex min-h-[28%] flex-1 items-center px-5 py-3">
        <p className="display-type" style={fitType(target, { aspect: 0.34, maxPx: 80, measure: 79 })}>
          {target}
        </p>
      </div>
      <div className="flex shrink-0 flex-col bg-game px-5 pt-3 pb-2 text-game-ink">
        <p className="pb-1 text-base font-bold">{t("card.forbidden")}</p>
        <ul className="divide-y divide-white/30">
          {forbidden.map((word, idx) => (
            <li
              key={`${word}-${idx}`}
              className="font-display py-[clamp(0.25rem,1.3cqh,0.6rem)] text-[clamp(1.25rem,4.4cqh,1.75rem)] leading-tight font-bold [font-stretch:92%]"
            >
              {word}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** A sticky note, a little crooked, with the word in marker-heavy type. */
function JustOneFace({ target, t }: { target: string; t: TranslateFn }) {
  return (
    <div
      className={cn(FACE, "card-back rounded-[0.5rem] [clip-path:polygon(0_0,100%_0,100%_calc(100%-2.75rem),calc(100%-2.75rem)_100%,0_100%)]")}
    >
      <div className="flex min-h-0 flex-1 items-center px-6">
        <p className="display-type" style={fitType(target, { aspect: 0.7 })}>
          {target}
        </p>
      </div>
      <p className="max-w-[22ch] px-6 pb-7 text-xl leading-snug font-bold">{t("card.oneClue")}</p>
      <span
        aria-hidden
        className="absolute right-0 bottom-0 size-11 bg-game-deep/70 [clip-path:polygon(0_0,100%_0,0_100%)]"
      />
    </div>
  );
}

/** Name in big type, with its printed description underneath as a reference. */
function MonikersFace({ phrase, description }: { phrase: string; description?: string }) {
  // Imported descriptions carry the line breaks of the printed card.
  const clean = description?.replace(/\s*\n\s*/g, " ").trim();
  return (
    <div className={`${FACE} card-back`}>
      <div className={`flex min-h-0 px-6 pt-6 ${clean ? "shrink-0" : "flex-1 items-center"}`}>
        <p className="display-type" style={fitType(phrase, { aspect: clean ? 0.5 : 0.8 })}>
          {phrase}
        </p>
      </div>
      {clean && (
        <p className="mt-4 min-h-0 flex-1 overflow-y-auto px-6 pb-6 text-lg leading-snug font-bold">
          {clean}
        </p>
      )}
    </div>
  );
}
