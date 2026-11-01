# Kea 🦜

> Named after the Kea — one of the world's most intelligent and mischievous birds — this app brings the same playful energy to your party game nights.

**Play it:** [kjgarza.github.io/kea](https://kjgarza.github.io/kea/)

A party card games app with 5 game types and LLM-generated card decks. Play directly in the browser with no accounts, no servers, no fuss.

## Games

| Game | Players | How to Play |
|------|---------|-------------|
| **Charades** | 2+ | Act out prompts without speaking |
| **Trivia** | 1+ | Answer multiple-choice or open-ended questions |
| **Taboo** | 2+ | Describe words without using forbidden terms |
| **Just One** | 3–7 | Give one-word clues cooperatively |
| **Monikers** | 4+ | 3-round party game (describe → one word → act) |

## Tech Stack

- **Framework:** Next.js 16 with static export
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Runtime:** Bun
- **Content:** LLM-generated JSON decks via OpenAI GPT-4

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- An [OpenAI API key](https://platform.openai.com/api-keys) (only needed for deck generation)

### Installation

```bash
# Clone the repository
git clone https://github.com/kjgarza/kea.git
cd kea

# Install dependencies
bun install
```

### Running Locally

```bash
# Start the development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Select a game, pick a deck, and start playing.

### Building for Production

```bash
# Build a static export
bun run build
```

Output is written to `out/` and can be hosted on any static file server (GitHub Pages, Netlify, Vercel, etc.).

## Deck Generation

Pre-built decks are included in the repo. To regenerate or create new ones, you need an OpenAI API key.

```bash
# Set your API key
export OPENAI_API_KEY=your-key-here

# Generate all decks
bun run generate

# Dry run — preview prompts without making API calls
bun run generate:dry

# Generate a single deck by name (without the .yaml extension)
bun scripts/generate-decks.ts --deck animals-en-charades
```

### Creating a New Deck

1. Create a YAML config in `decks/source/`:

```yaml
name: Animals
gameType: charades        # charades | trivia | taboo | justone | monikers
language: en
topics:
  - animals
  - nature
difficulty: medium        # easy | medium | hard
cardCount: 50
nsfw: false
recommended: true
context:
  markdown: |
    Instructions for the LLM about what kind of cards to generate.
    The more specific you are, the better the results.
  urls:
    - https://example.com/reference-content  # optional: URLs to pull context from
```

2. Generate it:

```bash
bun scripts/generate-decks.ts --deck my-deck-name
```

The generated deck is written to `public/decks/<deck-id>.json` and the deck index is updated automatically.

### Existing Decks

| Deck | Game |
|------|------|
| Animals | Charades |
| Music (1990s) | Charades |
| Music (2010s) | Charades |
| Everyday Words | Taboo |
| Films (1990s) | Taboo |
| Stranger Things | Taboo |
| General Knowledge | Trivia |
| Random Concepts | Just One |
| Simple Words | Just One |
| Pop Culture | Monikers |

### Automated Deck Generation (CI)

The workflow at `.github/workflows/generate-decks.yml` automatically regenerates decks when YAML source configs change. Add `OPENAI_API_KEY` to your repository secrets to enable it.

### Importing Hand-Written Situation Puzzles

Situation puzzles you write or transcribe yourself can be imported without running generation. Each pack is a YAML file at `decks/puzzles/<pack>-<lang>.yaml` (for example `decks/puzzles/kitchen-table-en.yaml`):

```yaml
pack: kitchen-table          # slug; must match the file name
language: en                 # must match the file name
name: Kitchen Table Mysteries
deckId: kitchen-table-en-situation   # optional; default <pack>-<language>-situation
difficulty: easy             # optional: easy | medium | hard (default medium)
topics: [everyday, family]   # optional
nsfw: false                  # optional (default false)
recommended: false           # optional (default false)
origin: original             # optional default for puzzles: original | transcribed | generated

puzzles:
  - id: wet-letter           # optional; generated from the title when missing
    title: The Wet Letter
    setup: Maria receives a letter, reads it, and puts it under a running tap...   # max 400 characters
    solution: Her nephew had written it in ink that only shows up when wet...
    keyFacts:                # 3–8 facts; a plain string or { id, text }
      - id: invisible-ink
        text: The letter was written in ink that only appears when wet.
      - The letter came from a child in her family.   # id generated from the text
      - The message was good news about a visit.
    hints:                   # 1–4, mild → strong
      - Maria wasn't trying to destroy the letter.
      - The letter looked blank at first.
    difficulty: easy         # optional, overrides the deck difficulty
    contentWarnings: []      # optional, e.g. [death, animal death]
    estMinutes: 8            # optional
    origin: transcribed      # optional, overrides the pack origin
    ref: "Book title, p. 12" # optional source reference
```

Import every pack, or one file:

```bash
bun scripts/import-puzzles.ts
bun scripts/import-puzzles.ts --file decks/puzzles/kitchen-table-en.yaml
bun scripts/import-puzzles.ts --dry-run    # validate only
```

The importer writes `public/decks/<deckId>.json` and updates `public/decks/index.json`. Puzzles are checked with the same validator as generated decks; each error names the puzzle (position, title and id) and the field, and a pack with any error is not written. Missing ids are derived from the content (card id from the title, key-fact id from the fact text, with `-2`, `-3`… on clashes), and the deck `version` only changes when the content does, so re-running the import produces no diff. Give puzzles explicit ids if you plan to retitle them later or want matching ids across languages.

The manually triggered workflow `.github/workflows/import-puzzles.yml` runs the same import and commits the result.

## AI Features (optional Worker)

The AI keeper (and later the theory grader, case investigator, answer judge and photo import) runs on a small Cloudflare Worker in `worker/`, which holds the model API key. Kea stays a static site: **if `NEXT_PUBLIC_KEA_API_URL` is not set at build time, every AI feature is hidden** and the app looks exactly as without it.

Setup, in short (details, API and local development in [worker/README.md](worker/README.md)):

1. `cd worker && bun install && bunx wrangler login`
2. Secrets: `bunx wrangler secret put KEA_PASSCODES` (comma-separated shared passcodes) and `bunx wrangler secret put ANTHROPIC_API_KEY`.
3. Optional but recommended: `bunx wrangler kv namespace create RATE_LIMIT` and paste the id into `worker/wrangler.toml` (per-passcode daily limit; without it the limit is per-isolate and approximate).
4. Check `SITE_ORIGIN` in `worker/wrangler.toml` (decks are read from `${SITE_ORIGIN}/decks/<deckId>.json`; CORS allows its origin).
5. Deploy with `bunx wrangler deploy`, or via the **Deploy AI Worker** workflow (`.github/workflows/deploy-worker.yml`; repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
6. Set the repo variable `NEXT_PUBLIC_KEA_API_URL` to the Worker URL; the Pages workflow passes it to the build.
7. Players enter the passcode once in the settings sheet (gear icon); it stays on the phone and is not exported in backups.

Shared prompts, schemas and API types live in `src/lib/ai/` (pure, imported by the Worker and the scripts). Scripts get a provider via `scripts/lib/llm-client.ts` (`getKeeperProvider()`: Anthropic by default; `KEEPER_PROVIDER`, `KEEPER_MODEL`, `ANTHROPIC_API_KEY`). Deck generation stays on OpenAI.

## Project Structure

```
kea/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx            # Home (game selection)
│   │   ├── [game]/page.tsx     # Deck selection
│   │   └── [game]/play/        # Game play screen
│   ├── components/
│   │   ├── home/               # Game grid
│   │   ├── decks/              # Deck selection UI
│   │   └── play/               # Card display, action bar
│   ├── hooks/                  # useSession, useDeck, useGameState
│   ├── lib/
│   │   ├── data/               # Deck loading
│   │   ├── game/               # Game engine (state machine)
│   │   ├── session/            # localStorage persistence
│   │   └── utils/              # ID generation, shuffle
│   └── types/                  # TypeScript definitions
├── scripts/
│   ├── generate-decks.ts       # Main generator CLI
│   ├── lib/                    # Config loader, LLM client, validators
│   └── prompts/                # Game-specific prompt templates
├── decks/
│   ├── source/                 # YAML deck configs
│   └── puzzles/                # Hand-written situation puzzle packs
├── public/
│   └── decks/                  # Generated JSON decks (committed)
└── .github/
    └── workflows/              # CI/CD for deck generation and deployment
```

## How It Works

1. **Session Management:** Game progress persists in localStorage with deterministic card shuffling — resume exactly where you left off.
2. **Static Export:** All pages are pre-rendered; decks load as JSON at runtime with no backend required.
3. **Game Engine:** A state machine in `src/lib/game/engine.ts` handles card transitions, scoring, and round management.
4. **Deck Generation:** YAML configs define deck metadata and context; the LLM generates card content which is then validated and deduplicated.

## Development

### Available Commands

```bash
bun run dev          # Start dev server at localhost:3000
bun run build        # Build static export to out/
bun run start        # Serve the built output
bun run lint         # Run ESLint
bunx tsc --noEmit    # Type-check without emitting
bun run test:unit    # Unit tests (src, scripts)
bun run worker:typecheck && bun run worker:test   # AI Worker (after bun run worker:install)
```

If you have [just](https://github.com/casey/just) installed, all commands are also available as recipes:

```bash
just dev             # Start dev server
just build           # Build
just check           # Lint + type-check
just test            # Run Playwright tests
just generate        # Generate all decks
```

### Running Tests

The project uses [Playwright](https://playwright.dev) for end-to-end tests.

```bash
# Install browsers (first time only)
bunx playwright install

# Run all tests
bunx playwright test

# Run with UI explorer
bunx playwright test --ui

# Run a specific test file
bunx playwright test tests/card-view-spacing.spec.ts
```

## Troubleshooting

**`OPENAI_API_KEY` is not set**
The generator requires an API key to call OpenAI. Use `export OPENAI_API_KEY=your-key` before running, or add it to a `.env` file in the project root.

**Deck generation produces no valid cards**
Check the YAML config for typos in `gameType`. Each game type has strict validation rules — run with `--dry-run` first to inspect the prompts being sent.

**Session not persisting between reloads**
Sessions are keyed by `gameType-deckId` in localStorage. Check your browser's privacy settings; private/incognito mode may block localStorage writes.

**Build fails after adding a new game type**
The card type system uses discriminated unions. Make sure you've added the new type to `src/types/card.ts`, `src/types/game.ts`, validation in `scripts/lib/validators.ts`, and rendering in `src/components/play/card-display.tsx`.

**Port 3000 already in use**
```bash
bun run dev -- --port 3001
```

## Contributing

Contributions are welcome. The most useful contributions are:

- **New deck configs** — Add a YAML file to `decks/source/` and open a PR. No code changes needed.
- **New game types** — See the [Adding New Game Types](#adding-new-game-types) section in `CLAUDE.md` for the full checklist.
- **Bug fixes and UI improvements** — Open an issue first for larger changes so we can discuss the approach.

### Adding New Game Types

1. Add the type to `src/types/game.ts`
2. Add a card type to `src/types/card.ts`
3. Add validation in `scripts/lib/validators.ts`
4. Create a prompt template in `scripts/prompts/`
5. Add rendering in `src/components/play/card-display.tsx`
6. Update the game engine if the new type needs custom state transitions

### Development Setup

```bash
git clone https://github.com/kjgarza/kea.git
cd kea
bun install
bun run dev
```

No additional services are needed to run the app locally. Deck generation requires an OpenAI API key but is optional — pre-generated decks are committed to the repo.

## License

MIT — see [LICENSE](LICENSE) for details.

## Citation

If you use this software in academic work, please cite it using the metadata in [CITATION.CFF](CITATION.CFF).
