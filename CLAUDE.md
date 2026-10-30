# Claude Instructions

Project-specific guidance for AI assistants working on this codebase.

## Runtime

Use Bun instead of Node.js for all operations:

- `bun install` - Install dependencies
- `bun run dev` - Start Next.js dev server
- `bun run build` - Build static export
- `bun scripts/generate-decks.ts` - Run deck generator
- `bun run lint` - ESLint CLI with flat config (`eslint.config.mjs`, `eslint-config-next`)
- `bunx tsc --noEmit` - Type check
- `bun run lint && bunx tsc --noEmit` - What `just check` runs (`just` may not be installed; run the commands directly)
- `bun run test:unit` - Unit tests via `bun test` (`*.test.ts` under `src/` and `scripts/`)
- `bunx playwright test --project=chromium` - E2E tests in `tests/` (starts `bun run dev`). If the preinstalled browser revision does not match, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a local chromium/headless-shell binary
- Bun auto-loads `.env` files (no dotenv needed)

## Architecture

### Frontend (Next.js 16)

- **Static export** - All pages pre-rendered, decks load as JSON at runtime
- **basePath** - Production builds serve under `/${NEXT_PUBLIC_REPO_NAME}` (default `kea`); see `next.config.ts` and `src/lib/utils/base-path.ts`
- **App Router** - Pages in `src/app/`, layouts cascade
- **Tailwind v4** - CSS-based config in `src/app/globals.css`
- **shadcn/ui** - Components in `src/components/ui/`

### Type System

Card types use discriminated unions in `src/types/card.ts`:

```typescript
type Card = CharadesCard | TriviaCard | TabooCard | JustOneCard | MonikersCard | SituationCard;
```

Each card has a `type` field for narrowing. Use switch statements on `card.type` for exhaustive handling.

### Game Engine (module registry)

Each game type is a `GameModule` (`src/lib/game/modules/types.ts`) registered in `src/lib/game/modules/registry.ts` (`GAME_MODULES: Record<GameType, AnyGameModule>`, `getGameModule(type)`). Shared code never branches on game type; it calls the module:

- `createSession(deck, { shuffleEnabled, shuffleSeed? })` - fresh session
- `reduce(session, action, deck)` - pure state transition for the module's own action union (returns the same object for a no-op)
- `isComplete(session)`, `progress(session, deck)` (`completed` = deck size minus remaining, passed and current), `cardIds(session)` (used by the session validator)
- `PlayView` - in-game body (card + controls + overlays); gets `{ deck, session, currentCard, dispatch }`
- optional `HeaderView` (header centre, default deck name), `showChrome(session)` (false = PlayView renders full-screen), `completeTitle`; required `theme` (`gradient`, `pattern` Tailwind classes)

Modules today:

- `standard-stack/` - Charades, Trivia, Taboo, Just One via `createStandardStackModule({ type, PlayView, theme })`. Actions `next | pass | reveal`. Pass behaviour comes from `GAMES[type].passBehavior` (`src/types/game.ts`): Charades and Taboo **recycle**, Trivia and Just One **discard**. Views: `src/components/play/views/{standard,trivia,taboo}-play-view.tsx` (the Taboo timer lives in the Taboo view)
- `monikers/` - actions `next | pass | correct | endTurn | nextRound`; three rounds, round-complete interstitial, end-turn overlay. View: `src/components/monikers/monikers-play-view.tsx`

Pure logic lives in `modules/*/logic.ts` (unit-testable); `modules/stack.ts` has shared card-stack helpers (`createBaseSession`, `orderCardIds`, `getCurrentCard`). `src/lib/game/engine.ts` is a thin facade (`createInitialSession`, `applyAction`, `restartSession`, `isSessionComplete`, `getSessionProgress`) that routes through the registry.

`useGameState` (`src/hooks/use-game-state.ts`) exposes `gameModule`, `session`, `currentCard`, `dispatch(action)`, `startGame`, `resumeGame`, `handleRestart`. `PlayScreen` keeps only shared chrome: loading/error, start screen, header (exit/restart), restart dialog, completion screen.

### Storage

All browser storage goes through `src/lib/storage/` (no direct `localStorage` anywhere else):

- `getStore()` returns the app-wide `KeaStore`: `get(key, schema?)`, `set(key, value, schema?)` (returns false if only kept in memory), `remove`, `list(prefix)`, `exportAll`, `importAll`, `isPersistent()`
- Logical keys are namespaced under `kea.` and every value is stored as `{ v, data }`. A `StorageSchema { version, migrate?, validate? }` migrates older `v` on read and writes the result back
- Typed helpers: `defineStoredValue<T>(key, schema)` and `defineStoredCollection<T>(prefix, schema)` (`get/set/remove(id)`, `ids()`)
- Every call is wrapped in try/catch. If localStorage is missing, blocked or full, values are kept in memory (games still play; progress just isn't kept across reloads)
- Legacy keys (`cg.session.<deckId>`) are migrated to `kea.session.<deckId>` when the store is first created (`legacy.ts`)
- Tests inject a backend with `setStore(createStore(backend))` / `createMemoryBackend()`

### Session Persistence

Sessions are stored via `src/lib/session/session-storage.ts` on top of the store:

- Key `kea.session.<deckId>` (`getSessionKey()` / `SESSION_KEY_PREFIX = "session."` in `src/types/session.ts`), envelope version 1, session `schemaVersion` = `CURRENT_SCHEMA_VERSION` (1)
- Deterministic shuffle using seeded PRNG (same seed = same order)
- Session includes: `currentCardId`, `remainingCardIds`, `passedCardIds`, `isRevealed`, shuffle settings, deck version; Monikers adds `monikersRound`, `monikersRemainingCardIds`, `monikersPassedCardIds`
- `session-validator.ts` checks a saved session still matches the deck (card IDs come from the module's `cardIds`)

### Deck Loading

Decks loaded from `public/decks/*.json` via `src/lib/data/deck-loader.ts`:

- `loadDeckIndex()` - Returns list of all available decks
- `loadDeck(deckId)` - Loads specific deck JSON
- `getDecksForGame(gameType)`, `getDeckMeta(deckId)` - Index helpers
- Results cached in memory

## Generation Pipeline

Scripts in `scripts/` generate deck content from YAML configs:

1. **Config** (`decks/source/*.yaml`) - Deck metadata and context
2. **Prompts** (`scripts/prompts/`) - Game-specific LLM instructions
3. **Validation** (`scripts/lib/validators.ts`) - Game rules enforcement
4. **Output** (`public/decks/*.json`) - Ready-to-use deck files

### Adding New Game Types

1. Add type to `src/types/game.ts` (and `GAMES` metadata)
2. Add card type to `src/types/card.ts`
3. Add the session state type to the `SessionState` union in `src/types/session.ts`
4. Create a module in `src/lib/game/modules/<type>/` (`logic.ts` + `index.ts` using `defineGameModule`) with its PlayView, and register it in `registry.ts`
5. Add validation in `scripts/lib/validators.ts`
6. Create prompt template in `scripts/prompts/`

## Conventions

### File Naming

- Components: `kebab-case.tsx` (e.g., `card-display.tsx`)
- Types: `kebab-case.ts` (e.g., `card.ts`)
- Hooks: `use-*.ts` (e.g., `use-session.ts`)

### Component Structure

```typescript
// Props interface at top
interface Props {
  deck: Deck;
  onStart: () => void;
}

// Named export for components
export function MyComponent({ deck, onStart }: Props) {
  // ...
}
```

### Imports

- Use `@/` alias for src imports
- Group: React, external libs, internal modules, types, styles

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/game/modules/registry.ts` | GameType -> GameModule |
| `src/lib/game/modules/types.ts` | `GameModule` interface |
| `src/types/card.ts` | Card type definitions |
| `src/lib/storage/index.ts` | Typed `kea.` store (only place that touches localStorage) |
| `src/lib/session/session-storage.ts` | Session load/save on top of the store |
| `scripts/generate-decks.ts` | Deck generation CLI |
| `scripts/lib/validators.ts` | Card validation rules |

## Common Tasks

### Add a new deck

1. Create `decks/source/my-deck.yaml`
2. Run `bun scripts/generate-decks.ts --deck my-deck`

### Modify card validation

Edit `scripts/lib/validators.ts` - each game type has its own validation function.

### Change game UI

Edit components in `src/components/play/`:
- `card-display.tsx` - Card rendering
- `action-bar.tsx` - `ActionBar`, `ActionButton`, `PassButton` building blocks
- `views/*-play-view.tsx` - Per-game controls (Monikers: `src/components/monikers/`)
- `play-screen.tsx` - Shared chrome (header, restart dialog, start/complete screens)

### Debug session issues

Check localStorage in browser devtools. Sessions stored as:
```
kea.session.{deckId}  ->  { "v": 1, "data": <SessionState> }
```
Older builds used `cg.session.{deckId}`; these are migrated on first load.
