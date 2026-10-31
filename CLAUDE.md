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
- `bun run worker:install|worker:typecheck|worker:test|worker:dev` - AI Worker in `worker/` (own package; also needs the root `bun install`)
- `bunx playwright test --project=chromium` - E2E tests in `tests/` (starts `bun run dev`). If the preinstalled browser revision does not match, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a local chromium/headless-shell binary. AI specs need `NEXT_PUBLIC_KEA_API_URL=https://kea-worker.test` exported for both the dev server and Playwright (kill a reused dev server first); they mock the Worker with `page.route`
- `bun run build` modifies `next-env.d.ts`; don't commit that
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
type Card = CharadesCard | TriviaCard | TabooCard | JustOneCard | MonikersCard | SituationCard | CaseCard;
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
- `situation/` - situation puzzles (Black Stories-style). Session holds `mode` (human | ai | solo) and a nested `puzzle` (transcript, facts, hints, theories, outcome); phases via `situationPhase` (picker → warnings → playing → ended). Keeper panels per mode in `src/components/situation/keeper-panels.tsx`; the AI keeper/solo theory grading call the Worker
- `case/` - case files (evidence board, unlockable evidence, notes, accusation, scoring). Always read sessions through `normalizeCaseSession`; phases via `casePhase` (cover → board → review → closed). Scoring in `case/scoring.ts`; UI in `src/components/case/` (AI investigator sheet + judge slot use the Worker). Evidence files live in `public/decks/assets/<deckId>/` (`caseAssetPath`)

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

### i18n

All UI strings live in `src/lib/i18n/en.ts` and `es.ts` (flat dotted keys, `{placeholders}`; `es` is typed `Messages`, so a missing key is a type error). Components use `const { t, locale } = useLocale(deck.language)`; outside React `translate(locale, key, vars)`. The global override (`kea.locale`) wins over the deck language.

### History and settings

`src/lib/history/` (barrel `@/lib/history`): play records (`recordPlay`), groups, app settings, backup export/import (`kea.passcode` is never exported). The settings sheet is `src/components/settings/app-settings-sheet.tsx` (storage status, AI passcode, photo quick-add link, backup).

### AI Worker (optional)

Kea stays static; AI features call a Cloudflare Worker in `worker/` that holds the model key. **Every AI UI is hidden unless `NEXT_PUBLIC_KEA_API_URL` is set** (`isAiConfigured()`, `useAiAvailability()`).

- Shared pure code in `src/lib/ai/` (relative imports only, so the Worker can bundle it): `api.ts` (request/response types for every route), `config.ts` (the one place for model ids, limits, prompt versions, prices), `provider.ts` (fetch-based Anthropic/OpenAI/stub providers with JSON-schema output and image content), one module per feature with `buildXRequest` / `parseXOutput` / `validateXRequest` and a top-level helper: `keeper.ts` (`answerKeeperQuestion`), `grade.ts` (`gradeTheory`), `solver.ts` (solvability), `case.ts` (investigator + judge), `photo.ts` (photo transcription). Offline stubs in `stub-keeper.ts` (`stubRespond`, routed by schema name). Browser-only: `client.ts` (`postToWorker`, typed helpers, `KeaApiError`) and `passcode.ts`
- Worker routes: `worker/src/router.ts` `ROUTES` (passcode → origin/CORS → daily limit via `ctx.meter()` right before the model call). Endpoints: `/keeper/ask`, `/keeper/grade`, `/case/ask`, `/case/judge`, `/author/photo`, `/status`. Responses are rebuilt field by field from validated data; solutions never reach players. Tests: `worker/src/*.test.ts` with injected deck fetch + stub provider
- Evals (no keys needed for the fakes): `bun scripts/eval-keeper.ts --suite keeper|grade|case|all --provider oracle|saboteur|stub|anthropic|openai`; sets in `evals/keeper/` and `evals/case/`. Solvability: `bun scripts/check-solvability.ts --deck <id>`

### Content importers

- Situation packs: `decks/puzzles/<pack>-<lang>.yaml` → `bun scripts/import-puzzles.ts`. The pure module is `src/lib/puzzles/puzzle-pack.ts` (`parsePuzzlePack`, `puzzlePackToDeck`, `serializePuzzlePack`; re-exported from `scripts/lib/puzzle-pack.ts`) and the situation validator is `src/lib/puzzles/situation-validator.ts` (re-exported from `scripts/lib/validators.ts`), shared by the app and the Worker
- Case packs: `decks/cases/<pack>-<lang>.yaml` (+ `decks/cases/assets/`) → `bun scripts/import-cases.ts` (`scripts/lib/case-pack.ts`). Seed case decks are edited through their YAML, never the JSON
- Photo quick-add: `/add` page (`src/components/authoring/`, `src/lib/authoring/`) sends photos to `/author/photo` and produces pack YAML plus a prefilled GitHub new-file link (repo from `NEXT_PUBLIC_KEA_REPO`, default `kjgarza/kea`)
- External sources (#58): licence allow-list and share-alike rule in `src/lib/content/licenses.ts` (`scripts/lib/licenses.ts`); card `source` = `ContentSource` (`license`, `author`, `url`, `modified`, origin `adapted`), deck/`DeckMeta` optional `license`/`attribution`. Raw importers `scripts/import-stackexchange.ts` / `import-story.ts` → `decks/sources/` (git-ignored) → `scripts/normalize-sources.ts` (LLM, `--replay`) → draft in `decks/drafts/sources/` → human review → move to `decks/puzzles|cases/` → import. Credits UI: `src/components/credits/source-credit.tsx`. Policy and research: `docs/content-sources.md`
- Every script that writes decks updates `public/decks/index.json` via `scripts/lib/deck-index.ts` (a test checks the index matches the deck files)

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
5. Add validation in `scripts/lib/validators.ts` (pure; keep shared validators in `src/lib/` if the app or Worker needs them)
6. Create prompt template in `scripts/prompts/` and handle the type in `scripts/lib/deck-translation.ts` and `src/lib/data/content-warnings.ts`
7. Add UI strings to `src/lib/i18n/en.ts` + `es.ts`, a colour token in `globals.css` and an icon key in the game tile
8. Narrow `StandardSessionState.gameType` so the `SessionState` union stays discriminated; add a fixture deck (listed in `index.json`) for the Playwright spec
9. AI features: add the shared module in `src/lib/ai/`, a Worker handler + route, a stub in `stub-keeper.ts`, a client helper, and gate the UI on `useAiAvailability()`

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
| `src/lib/game/modules/situation/logic.ts` | Situation puzzle reducer and phases |
| `src/lib/game/modules/case/logic.ts` | Case file reducer and phases (`case/scoring.ts` for points) |
| `src/lib/i18n/en.ts` / `es.ts` | UI strings |
| `src/lib/history/index.ts` | Play history, groups, settings, backups |
| `src/lib/ai/` | Shared AI prompts, schemas, validation, providers (`client.ts` = browser client) |
| `worker/src/router.ts` | AI Worker routes and middleware |
| `src/lib/puzzles/puzzle-pack.ts` | Situation pack YAML (parse, validate, serialise) |
| `scripts/generate-decks.ts` | Deck generation CLI (situation decks also run the solvability check) |
| `scripts/lib/validators.ts` | Card validation rules |
| `scripts/eval-keeper.ts` | Keeper / grader / case AI eval CLI |

## Common Tasks

### Add a new deck

1. Create `decks/source/my-deck.yaml`
2. Run `bun scripts/generate-decks.ts --deck my-deck`

### Add hand-written or photographed puzzles

Write `decks/puzzles/<pack>-<lang>.yaml` (format in README) or use `/add` with the AI Worker, then `bun scripts/import-puzzles.ts --file <file>` (`--dry-run` to validate). Cases: `decks/cases/<pack>-<lang>.yaml` + `bun scripts/import-cases.ts`.

### Work on an AI feature

Change the shared module in `src/lib/ai/`, keep the Worker handler thin, run `bun run worker:test` and the unit tests, then the eval CLI with a fake provider. No real model can run without keys; say so when you can't verify.

### Modify card validation

Edit `scripts/lib/validators.ts` - each game type has its own validation function (situation: `src/lib/puzzles/situation-validator.ts`).

### Change game UI

Edit components in `src/components/play/`:
- `card-display.tsx` - Card rendering
- `action-bar.tsx` - `ActionBar`, `ActionButton`, `PassButton` building blocks
- `views/*-play-view.tsx` - Per-game controls (Monikers: `src/components/monikers/`, situation: `src/components/situation/`, case: `src/components/case/`)
- `play-screen.tsx` - Shared chrome (header, restart dialog, start/complete screens)

### Debug session issues

Check localStorage in browser devtools. Sessions stored as:
```
kea.session.{deckId}  ->  { "v": 1, "data": <SessionState> }
```
Older builds used `cg.session.{deckId}`; these are migrated on first load.
