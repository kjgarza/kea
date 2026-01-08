# Claude Instructions

Project-specific guidance for AI assistants working on this codebase.

## Runtime

Use Bun instead of Node.js for all operations:

- `bun install` - Install dependencies
- `bun run dev` - Start Next.js dev server
- `bun run build` - Build static export
- `bun scripts/generate-decks.ts` - Run deck generator
- Bun auto-loads `.env` files (no dotenv needed)

## Architecture

### Frontend (Next.js 16)

- **Static export** - All pages pre-rendered, decks load as JSON at runtime
- **App Router** - Pages in `src/app/`, layouts cascade
- **Tailwind v4** - CSS-based config in `src/app/globals.css`
- **shadcn/ui** - Components in `src/components/ui/`

### Type System

Card types use discriminated unions in `src/types/card.ts`:

```typescript
type Card = CharadesCard | TriviaCard | TabooCard | JustOneCard | MonikersCard;
```

Each card has a `type` field for narrowing. Use switch statements on `card.type` for exhaustive handling.

### Game Engine

State machine in `src/lib/game/engine.ts` handles all game logic:

- `nextCard()` - Advance to next card
- `passCard()` - Skip current card (recycles for Monikers, discards for others)
- `correctCard()` - Mark card correct and advance
- `advanceRound()` - Monikers only: move to next round
- `resetGame()` - Start over with same deck

### Session Persistence

Sessions stored in localStorage via `src/lib/session/`:

- Sessions keyed by `gameType-deckId`
- Deterministic shuffle using seeded PRNG (same seed = same order)
- Session includes: current index, seen cards, scores, round (Monikers)

### Deck Loading

Decks loaded from `public/decks/*.json` via `src/lib/data/deck-loader.ts`:

- `getDeckIndex()` - Returns list of all available decks
- `getDeck(deckId)` - Loads specific deck JSON
- Results cached in memory

## Generation Pipeline

Scripts in `scripts/` generate deck content from YAML configs:

1. **Config** (`decks/source/*.yaml`) - Deck metadata and context
2. **Prompts** (`scripts/prompts/`) - Game-specific LLM instructions
3. **Validation** (`scripts/lib/validators.ts`) - Game rules enforcement
4. **Output** (`public/decks/*.json`) - Ready-to-use deck files

### Adding New Game Types

1. Add type to `src/types/game.ts`
2. Add card type to `src/types/card.ts`
3. Add validation in `scripts/lib/validators.ts`
4. Create prompt template in `scripts/prompts/`
5. Add UI in `src/components/play/card-display.tsx`
6. Update game engine if needed

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
| `src/lib/game/engine.ts` | All game state transitions |
| `src/types/card.ts` | Card type definitions |
| `src/lib/session/session-storage.ts` | localStorage operations |
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
- `action-bar.tsx` - Pass/correct buttons
- `play-screen.tsx` - Overall orchestration

### Debug session issues

Check localStorage in browser devtools. Sessions stored as:
```
session-{gameType}-{deckId}
```
