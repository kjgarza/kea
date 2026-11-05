import type { GameType } from "@/types/game";

interface Props {
  game: GameType;
  className?: string;
}

/**
 * Each game's mark, drawn from how the game is played: a spotlight, the
 * question, the forbidden sign, a sticky note, three rounds, a keyhole and a
 * case folder. Decorative, so hidden from screen readers.
 */
export function GameMark({ game, className }: Props) {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" className={className} aria-hidden="true">
      {MARKS[game]}
    </svg>
  );
}

const MARKS: Record<GameType, React.ReactNode> = {
  charades: (
    <>
      <path d="M38 0h24l24 74a36 12 0 0 1-72 0z" opacity="0.32" />
      <ellipse cx="50" cy="76" rx="36" ry="12" />
    </>
  ),
  trivia: (
    <path d="M50 4c-21 0-35 12-36 31h22c1-8 6-12 14-12s13 4 13 10c0 6-3 9-11 14-11 7-15 13-15 25v3h22v-2c0-7 2-10 10-15 11-7 17-14 17-26C86 15 72 4 50 4zM37 80h24v18H37z" />
  ),
  taboo: (
    <path
      fillRule="evenodd"
      d="M50 4a46 46 0 1 0 0 92 46 46 0 0 0 0-92zM22 50c0-6 2-11 5-16l39 39a28 28 0 0 1-44-23zm56 0c0 6-2 11-5 16L34 27a28 28 0 0 1 44 23z"
    />
  ),
  justone: (
    <>
      <path d="M8 12l80-6 6 80-62 6-20-20z" opacity="0.26" />
      <path d="M44 24l18-2 4 56-18 1-3-38-11 3-2-13z" />
    </>
  ),
  monikers: (
    <>
      <rect x="6" y="10" width="88" height="22" rx="6" />
      <rect x="6" y="39" width="62" height="22" rx="6" />
      <rect x="6" y="68" width="30" height="22" rx="6" />
    </>
  ),
  situation: (
    <path
      fillRule="evenodd"
      d="M50 4a30 30 0 0 0-14 56.5L26 96h48L64 60.500A30 30 0 0 0 50 4z"
    />
  ),
  case: (
    <path d="M4 22a6 6 0 0 1 6-6h28l10 12h42a6 6 0 0 1 6 6v50a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" />
  ),
};
