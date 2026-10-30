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

### Solvability Check (Situation Decks)

Generated situation puzzles must pass a solvability check before they reach `public/decks/`:

1. **Ambiguity check.** A reviewer model reads the setup and the solution and asks whether the setup admits another coherent story that the keeper's yes/no answers would not rule out. Ambiguous puzzles fail.
2. **Solver run.** A solver model sees **only the title and setup** (never the solution or key facts) and asks up to 40 questions. Each one is answered by the same keeper code players use (`answerKeeperQuestion`). It can submit a theory at any point (3 attempts) and must submit one when the questions run out; theories are graded by the player grader (`gradeTheory`). A "solved" grade passes.

Passed puzzles keep a `solvability: { questions, checkedAt, model }` field (questions to solve, a difficulty signal). Failed puzzles, and puzzles whose check errored, are written to `decks/drafts/<deckId>.json` with the reasons, the solver transcript and the cost, so they can be fixed by hand and re-imported (for example as a YAML pack). The generator prints passed/failed counts, the reasons, and the tokens and estimated cost per puzzle (prices live in `MODEL_PRICING` in `src/lib/ai/config.ts`).

```bash
# Needs ANTHROPIC_API_KEY (keeper/grader: KEEPER_PROVIDER/KEEPER_MODEL, solver: SOLVER_PROVIDER/SOLVER_MODEL)
bun scripts/generate-decks.ts --deck classic-en-situation

# Skip the check (every valid puzzle is written to public/decks/)
bun scripts/generate-decks.ts --deck classic-en-situation --skip-solvability

# Re-check an existing deck (e.g. a hand-written seed deck) and write a report to reports/
bun scripts/check-solvability.ts --deck classic-en-situation [--puzzle cl-001] [--limit 5] [--skip-ambiguity] [--strict]

# Offline smoke test of the pipeline (the stub solver cannot solve anything)
bun scripts/check-solvability.ts --deck sample-en-situation --provider stub
```

`check-solvability.ts` never modifies the deck.

### Automated Deck Generation (CI)

The workflow at `.github/workflows/generate-decks.yml` automatically regenerates decks when YAML source configs change. Add `OPENAI_API_KEY` to your repository secrets to enable it, and `ANTHROPIC_API_KEY` for the situation-deck solvability check (or run it manually with `skip_solvability`). The workflow commits `decks/drafts/` together with `public/decks/`.

### Case File Decks

Each case card has a briefing, evidence items and questions (see `CaseCard` in `src/types/card.ts`). Evidence files (`image`, `pdf`, `map` kinds) go in `public/decks/assets/<deckId>/`, and `src` is the path relative to that folder (e.g. `"src": "receipt.svg"`). `unlockAfter` lists evidence ids that must be opened first. The validator (`validateCaseCard` / `validateCaseDeck` in `scripts/lib/validators.ts`) rejects duplicate ids, unknown or cyclic `unlockAfter` references and missing asset files; `bun test scripts/lib/case-validators.test.ts` checks every committed case deck.

- **Seed case:** `saltmarsh-bay-en-case` / `saltmarsh-bay-es-case` ("The Halden Chronometer"), written by hand in `decks/cases/` and imported (see below). `bun test scripts/lib/case-seed.test.ts` checks that it is fair: every question is proved by reachable evidence, the walkthrough cites only real evidence ids, and EN/ES share ids, kinds, asset paths and points.
- **Generation:** a config with `gameType: case` (and `cardCount` = number of cases) goes through `generate-decks.ts` with the prompt in `scripts/prompts/case.ts`. Generated cases must have 8–15 **text-only** evidence items (`document`, `interview`, `phone_log`; generation cannot create images), 3–5 questions, at least two `unlockAfter` chains and a walkthrough that cites evidence ids in backticks (`scripts/lib/case-generation.ts`); other cases are dropped with the reason.
- **Translation:** `translate-decks.ts` translates the title, briefing, evidence titles and contents, question prompts, answers and accepted variants, the walkthrough and content warnings. Ids, kinds, `src`, `unlockAfter` and points always come from the English deck, and a translated walkthrough must keep every evidence citation. The evidence files are copied to `public/decks/assets/<es deckId>/` with the same paths (files already there are kept, so you can drop in localised images).

### Importing Hand-Written Case Files

Case files you write yourself are YAML packs at `decks/cases/<pack>-<lang>.yaml`. Evidence files live in `decks/cases/assets/<pack>/`, shared by every language of the pack; a file with the same name in `decks/cases/assets/<pack>/<lang>/` replaces it for that language (e.g. a clipping with a translated caption), so every language keeps the same `src` paths.

```yaml
pack: saltmarsh-bay          # slug; must match the file name
language: en                 # must match the file name
name: Saltmarsh Bay Case Files
deckId: saltmarsh-bay-en-case   # optional; default <pack>-<language>-case
difficulty: medium           # optional: easy | medium | hard (default medium)
topics: [museum, theft]      # optional
nsfw: false                  # optional (default false)
recommended: true            # optional (default false)

cases:
  - id: halden-chronometer   # optional (title slug); set it so translations share it
    title: The Halden Chronometer
    briefing: |-             # markdown
      At **09:10 on Tuesday**, ...
    evidence:                # every item needs an id (unlockAfter and the walkthrough refer to it)
      - id: building-log
        title: Building access log
        kind: document       # document | interview | phone_log (content) | image | map | pdf (src)
        content: |-
          | Day | Time | Door | Badge |
          |---|---|---|---|
          | Mon | 21:12 | Key box | VOL-07 |
      - id: floor-plan
        title: Museum floor plan
        kind: map
        src: floor-plan.svg  # decks/cases/assets/saltmarsh-bay/floor-plan.svg
      - id: courier-booking
        title: Courier booking
        kind: document
        content: ...
        unlockAfter: [ruth-phone]
    questions:
      - id: who
        prompt: Who swapped the chronometer?
        answer: Dr Ruth Lindqvist, the curator
        acceptedVariants: [Ruth Lindqvist, Ruth, the curator]   # optional (default [])
        points: 3                                               # optional (default 1)
        proof: [building-log, lost-property]                    # optional, checked, never shipped
    walkthrough: |-          # cite evidence ids in backticks
      The key was taken with badge VOL-07 (`building-log`) ...
    contentWarnings: [theft]
    estMinutes: 30
```

```bash
bun scripts/import-cases.ts                                    # every pack in decks/cases/
bun scripts/import-cases.ts --file decks/cases/saltmarsh-bay-es.yaml
bun scripts/import-cases.ts --dry-run                          # validate only
```

The importer runs the shared case validator (each error names the case, the evidence item or question, and the field), checks that every backticked id in the walkthrough is an evidence id and that every `proof` id exists and is cited in the walkthrough, then writes `public/decks/<deckId>.json`, copies the referenced files to `public/decks/assets/<deckId>/` and updates `public/decks/index.json`. A pack with any error writes nothing. The output is deterministic: the deck `version` only changes when the deck or one of its files changes, so re-running the import is byte-identical. The manually triggered workflow `.github/workflows/import-cases.yml` runs the same import and commits the result. Note that `translate-decks.ts --force` would overwrite a hand-written Spanish deck.

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

**Photo quick-add.** With the AI Worker configured, `/add` (linked from the settings sheet) turns photos of a physical card's front and back into a pack in this format: photos are downscaled to JPEG on the phone, the Worker transcribes them (never storing them), and the YAML is shown in an editor that validates as you type with the importer's rules. "Open in GitHub" opens a prefilled new `decks/puzzles/<pack>-<lang>.yaml` (or, for an existing pack, tells you to paste the puzzle at the end of its list); very long puzzles fall back to copy-to-clipboard. The repo defaults to `kjgarza/kea` on `main`; override with `NEXT_PUBLIC_KEA_REPO=owner/name` and `NEXT_PUBLIC_KEA_REPO_BRANCH`.

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

### Keeper evals

`evals/keeper/<cardId>.yaml` holds the keeper eval set: 20 seed puzzles (referenced by deck and card id) with about 30 scripted questions each, written in English and Spanish side by side so both languages share one expected answer. Each case is `{ a, en, es, facts?, allow?, tag?, transcript?, note? }`:

- `a`: expected answer (`yes | no | irrelevant | partly | rephrase`). Use `irrelevant` only when the solution and key facts do not settle the question; demands for the answer, prompt injection and non-yes/no questions are `rephrase`.
- `facts`: key-fact ids the reply should list; `allow`: ids it may also list without counting as a leak. Any other fact id in a reply is a leak.
- `tag`: `fact` (default) or a red-team set: `demand`, `leading`, `non-yes-no`, `injection`, `language-switch` (the question is in the other language), `consistency` (with a `transcript` of earlier turns).

`bun run test:unit` checks every file against the decks (cards, facts, vocabulary, EN/ES parity). Run the eval with:

```bash
bun scripts/eval-keeper.ts                         # Anthropic keeper + leak judge (needs ANTHROPIC_API_KEY)
bun scripts/eval-keeper.ts --lang es --limit 50    # a quick Spanish sample
bun scripts/eval-keeper.ts --save evals/keeper/baselines/keeper-v1.json
bun scripts/eval-keeper.ts --baseline evals/keeper/baselines/keeper-v1.json   # delta after a prompt change
bun scripts/eval-keeper.ts --provider oracle       # offline: perfect keeper (100%, no leaks)
bun scripts/eval-keeper.ts --provider saboteur     # offline: broken keeper (errors and leaks are reported)
```

Each case goes through `answerKeeperQuestion` in `src/lib/ai/keeper.ts`, the same code the Worker runs. The report gives agreement, leaks (unasked fact ids, fact or solution text in the reply, extra output, and a judge model's verdict from `src/lib/ai/leak-judge.ts`), off-vocabulary replies and a confusion matrix per language, and is appended to `$GITHUB_STEP_SUMMARY` in CI. The **Keeper eval** workflow (`.github/workflows/eval-keeper.yml`, manual) runs it and uploads the JSON report, which can be committed as a baseline. Target before the AI keeper is on by default: ≥ 95% agreement and zero leaks per language.

#### Theory grading evals

Ten of the eval files also have `theories:` (#32), graded by `gradeTheory` in `src/lib/ai/grade.ts`, the same code as `POST /keeper/grade`. Each is `{ verdict, facts?, tag, en, es, note? }`: `facts` are the key facts the theory states correctly, and `verdict` must match the shared rules (`solved` = every key fact, `close` = at least half of them rounded up, `not_yet` = fewer), so a file cannot disagree with the grader. Tags: `full`, `partial`, `wrong`, `paraphrase`, `language-switch` (theory in the other language), `injection`.

```bash
bun scripts/eval-keeper.ts --suite grade                     # grading only (default --suite all runs both)
bun scripts/eval-keeper.ts --suite grade --provider oracle   # offline: perfect grader
bun scripts/eval-keeper.ts --suite grade --provider saboteur # offline: wrong grades and leaky output are caught/stripped
```

The grading report gives verdict agreement, exact-fact agreement, a verdict confusion matrix and leaks: a leak is any missing fact's id or text in the response the player would see. Target: ≥ 95% verdict agreement and zero leaks per language.

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
│   ├── puzzles/                # Hand-written situation puzzle packs
│   ├── cases/                  # Hand-written case packs (+ assets/<pack>/)
│   └── drafts/                 # Generated puzzles that failed the solvability check
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
