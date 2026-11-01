import type { ComponentType } from "react";
import type { Card } from "@/types/card";
import type { Deck } from "@/types/deck";
import type { GameType } from "@/types/game";
import type { BaseSessionState } from "@/types/session";

/** Options chosen on the start screen. */
export interface StartOptions {
  shuffleEnabled: boolean;
  /** Per-session nonce; same seed = same order. Undefined = deck order / deckId seed. */
  shuffleSeed?: string;
}

/** Progress counts. For multi-round games these are per round. */
export interface Progress {
  completed: number;
  remaining: number;
  passed: number;
  total: number;
}

/**
 * Every action is a tagged object. Each module defines its own union
 * (e.g. `{ type: "next" } | { type: "pass" }`); shared code never inspects it.
 */
export interface GameActionBase {
  type: string;
}

/** Props the play screen passes to a module's views. */
export interface PlayViewProps<
  S extends BaseSessionState,
  C extends Card,
  A extends GameActionBase,
> {
  deck: Deck<C>;
  session: S;
  /** The card at `session.currentCardId`, or null (e.g. between rounds). */
  currentCard: C | null;
  /** Apply an action through the module's `reduce` and persist the result. */
  dispatch: (action: A) => void;
}

/** Props for the optional header slot (centre of the in-game header). */
export interface HeaderViewProps<S extends BaseSessionState, C extends Card> {
  deck: Deck<C>;
  session: S;
}

/**
 * A game type's engine + UI. Register it in `registry.ts`.
 *
 * Shared code (useGameState, PlayScreen, session validator) only talks to
 * modules through this interface, so a new game type plugs in its own session
 * state `S`, card type `C`, action union `A` and views without editing shared
 * code beyond adding a registry entry and the type unions.
 *
 * Contract:
 * - `createSession`, `reduce` must be pure and deterministic given the same
 *   inputs (shuffles are seeded from `shuffleSeed ?? deck.deckId`).
 * - `reduce` returns the same object when an action is a no-op.
 * - `isComplete` true makes the play screen show the shared completion screen.
 */
export interface GameModule<
  S extends BaseSessionState,
  C extends Card,
  A extends GameActionBase,
> {
  type: GameType;

  createSession(deck: Deck<C>, opts: StartOptions): S;
  reduce(session: S, action: A, deck: Deck<C>): S;
  isComplete(session: S): boolean;
  progress(session: S, deck: Deck<C>): Progress;

  /**
   * Every card ID the session refers to (used to check a saved session still
   * matches the deck). May contain duplicates.
   */
  cardIds(session: S): string[];

  /** The in-game screen body (card + controls + overlays). */
  PlayView: ComponentType<PlayViewProps<S, C, A>>;

  /** Optional centre of the header; defaults to the deck name. */
  HeaderView?: ComponentType<HeaderViewProps<S, C>>;

  /**
   * Whether the shared chrome (header with exit/restart, background) wraps
   * the PlayView for this session state. Default true. Monikers returns false
   * for its full-screen "round complete" interstitial.
   */
  showChrome?(session: S): boolean;

  /** Completion screen heading. Default "Deck Complete!". */
  completeTitle?: string;

  /**
   * Tailwind classes for the play/start/complete screens. Written out in full
   * so Tailwind's source scan picks them up.
   */
  theme: {
    /** Gradient stops for `bg-gradient-to-b`, e.g. "from-x/15 via-x/8 to-x/20". */
    gradient: string;
    /** Text colour class used by the `.game-bg-pattern` overlay. */
    pattern: string;
  };
}

/**
 * A module with its type parameters erased, for the heterogeneous registry.
 * Each module is fully typed where it is defined; shared code only passes
 * values between a module's own methods.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameModule = GameModule<any, any, any>;

/** Identity helper that infers S, C, A for a module literal. */
export function defineGameModule<
  S extends BaseSessionState,
  C extends Card,
  A extends GameActionBase,
>(module: GameModule<S, C, A>): GameModule<S, C, A> {
  return module;
}
