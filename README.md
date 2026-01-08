# Party Card Games

A fully static web app for playing party card games with friends. Supports 5 game types with LLM-generated card decks.

## Games

- **Charades** - Act out prompts without speaking
- **Trivia** - Answer multiple choice or open-ended questions
- **Taboo** - Describe words without using forbidden terms
- **Just One** - Give one-word clues cooperatively
- **Monikers** - 3-round party game (describe, one word, act)

## Tech Stack

- **Framework:** Next.js 16 with static export
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Runtime:** Bun
- **Content:** LLM-generated JSON decks via OpenAI GPT-4

## Getting Started

```bash
# Install dependencies
bun install

# Run development server
bun run dev

# Build for production
bun run build
```

## Deck Generation

Decks are generated from YAML configs in `decks/source/` using OpenAI's API.

```bash
# Generate all decks
bun run generate

# Dry run (preview prompts without API calls)
bun run generate:dry

# Generate a specific deck
bun scripts/generate-decks.ts --deck animals-en-charades
```

### Creating New Decks

1. Create a YAML config in `decks/source/`:

```yaml
name: My Deck
gameType: charades  # charades | trivia | taboo | justone | monikers
language: en
topics: [topic1, topic2]
difficulty: medium  # easy | medium | hard
cardCount: 50
nsfw: false
context:
  markdown: |
    Instructions for the LLM about what kind of cards to generate...
  urls:
    - https://example.com/reference-content
```

2. Run `bun run generate --deck my-deck-name`

### GitHub Actions

The workflow at `.github/workflows/generate-decks.yml` automatically regenerates decks when source configs change. Add `OPENAI_API_KEY` to repository secrets.

## Project Structure

```
cards-game/
├── src/
│   ├── app/                    # Next.js pages
│   │   ├── page.tsx           # Home (game selection)
│   │   ├── [game]/page.tsx    # Deck selection
│   │   └── [game]/play/       # Game play screen
│   ├── components/
│   │   ├── home/              # Game grid
│   │   ├── decks/             # Deck selection UI
│   │   └── play/              # Card display, action bar
│   ├── hooks/                 # useSession, useDeck, useGameState
│   ├── lib/
│   │   ├── data/              # Deck loading
│   │   ├── game/              # Game engine (state machine)
│   │   ├── session/           # localStorage persistence
│   │   └── utils/             # ID generation, shuffle
│   └── types/                 # TypeScript definitions
├── scripts/
│   ├── generate-decks.ts      # Main generator CLI
│   ├── lib/                   # Config loader, LLM client, validators
│   └── prompts/               # Game-specific prompt templates
├── decks/
│   └── source/                # YAML deck configs
├── public/
│   └── decks/                 # Generated JSON decks
└── .github/
    └── workflows/             # CI/CD for deck generation
```

## How It Works

1. **Session Management:** Game progress persists in localStorage with deterministic card shuffling
2. **Static Export:** All pages are pre-rendered; decks load as JSON at runtime
3. **Game Engine:** State machine handles card transitions, scoring, and round management
4. **Deck Generation:** YAML configs define deck metadata; LLM generates card content with validation

## License

MIT
