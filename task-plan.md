1) Product overview

Goal

A fully static web app that lets players play multiple party card/word games (Charades, Trivia, Taboo, Just One, Monikers) using pre-generated curated decks. The app acts as a replacement when players don’t have the physical cards.

Key constraints
	•	App is read-only at runtime: no live generation in production.
	•	Decks are generated in a repo pipeline (GitHub Actions) using an external LLM API and optional URL/markdown context.
	•	Frontend stack: Next.js + Tailwind + shadcn/ui
	•	Data stored as JSON (preferred for fully static); SQLite optional for pipeline/dev tooling but output should be JSON shipped with the static site.

⸻

2) Supported games and card rules

Reveal behavior (per game)
	•	Charades: prompt shown immediately; no hidden content.
	•	Trivia:
	•	Multiple-choice: question + choices shown; answer hidden until Reveal.
	•	Open-ended: question shown; answer hidden until Reveal.
	•	Taboo: target + forbidden words shown immediately (no reveal needed).
	•	Just One: target shown immediately; nothing hidden.
	•	Monikers: phrase shown immediately; nothing hidden (round rules change, not the card).

Skip/Pass behavior (game-dependent defaults)
	•	Charades: Recycle-to-end (pass moves card to end of remaining list).
	•	Trivia: Discard (pass removes card from session remaining list).
	•	Taboo: Recycle-to-end
	•	Just One: Discard
	•	Monikers: Recycle-to-end

⸻

3) UX flows and IA

Primary flow (v1)

Game-first
	1.	Home → select game
	2.	Game page → pick deck (filters + search + sort + shuffle toggle)
	3.	Play → fullscreen card experience

Routes (suggested)
	•	/ → Game selection
	•	/game/[gameType] → Deck list + filters for that game
	•	/play/[deckId] → Play screen for that deck
	•	Monikers uses same route but with additional round controls.

⸻

4) Deck selection requirements

Deck metadata defaults
	•	Deck name: required
	•	Game type: required (one of charades|trivia|taboo|justone|monikers)
	•	Language: required
	•	Topics: optional; default “random/any” (i.e., no filter)
	•	Difficulty: default medium
	•	Card count target: default 50
	•	Source context: optional (markdown and/or URLs)
	•	Safety rules: default no NSFW

Filters (v1)
	•	Language dropdown
	•	Default: browser language; fallback en
	•	Difficulty segmented control (Easy/Medium/Hard)
	•	Default: Medium
	•	Topics chip multi-select
	•	Default: none selected = Any/Random
	•	Search by deck name (typeahead)
	•	Family-safe toggle (ON by default)
	•	ON = excludes NSFW decks
	•	OFF = shows all decks (still exclude illegal/hate content at generation time)

Sort (v1)
	•	Default: Recommended (curator-driven, via metadata)
	•	Secondary: A–Z

Shuffle option
	•	Decks have a curated order by default.
	•	On the deck selection screen:
	•	“Shuffle” toggle (default OFF)
	•	Applied at session start only (no mid-session reshuffle).

⸻

5) Play experience requirements

Layout
	•	Fullscreen, one-card-at-a-time
	•	Optimized for portrait + landscape + tablet layouts.
	•	Primary use context: phone on table shared viewing.
	•	No mirror/rotate text mode (explicitly not in v1).

Controls & gestures
	•	No “Back” control in v1.
	•	Controls:
	•	Bottom: Pass (if game supports), Next
	•	Top/right: Restart (with confirm), Exit
	•	Reveal control appears only for Trivia (and only matters there in v1).
	•	Gestures:
	•	Swipe left → Next
	•	Swipe right → disabled/no-op (since no Back)

Accidental action prevention
	•	None (no confirm for Next/Reveal/Pass). Fast party play.

Exit behavior
	•	Exit immediately (no confirm). Session is still saved automatically.

Restart behavior
	•	Restart is available on the play screen.
	•	Requires confirm modal: “Restart session? This will reset progress for this deck.”

Card position indicator
	•	Hidden (no “12/50” display).

⸻

6) Monikers mode (3 rounds)

Round structure

Monikers supports 3 rounds (true mode), no timer:
	•	Round 1: free description
	•	Round 2: one word
	•	Round 3: charades

Turn model (no teams tracked in v1)
	•	Provide an End Turn button.
	•	End Turn shows a simple overlay: “Turn ended — pass device to next team/player” with Continue.
	•	No team names, no scoring, no activeTeamIndex.

Card actions (simplest)

Per-card buttons:
	•	Correct: removes card from remaining pile
	•	Pass: recycle-to-end
	•	End Turn: shows overlay (no state beyond maybe a turnCount if desired)

Round completion
	•	Round ends when remainingCardIds is empty.
	•	Next round begins with the full original set of cards again.
	•	Shuffle behavior:
	•	If shuffle toggle is ON: shuffle at the start of each round
	•	If OFF: use the curated order each round

⸻

7) Session persistence (localStorage)

Requirement

The app must resume sessions using localStorage.

Session scope

Assumption (recommended): store sessions per deck (multiple simultaneous saved sessions).
Key: cg.session.<deckId>

Minimal session payload (v1)

Global
	•	schemaVersion (number)
	•	deckId
	•	deckVersion (string) — compare to shipped deck metadata
	•	gameType
	•	shuffleEnabled (bool)
	•	remainingCardIds (string[])
	•	passedCardIds (string[]) — only meaningful for recycle games
	•	currentCardId (string | null)
	•	isRevealed (bool) — only for current card (Trivia)

Monikers-only
	•	monikersRound (1|2|3)
	•	monikersRemainingCardIds (string[]) — current round state
	•	monikersPassedCardIds (string[]) — recycle-to-end state

Resume validation & deck updates
	•	If deckVersion in localStorage does not match the deck’s current version, do hard reset:
	•	Clear that deck session
	•	Start from the beginning
	•	Optionally show a toast: “Deck updated — session restarted.”

⸻

8) Data model and file structure (shipped)

Output format

Ship static JSON under public/decks/… (or src/data/decks/… if bundled).

Deck index (for listing/filtering)

public/decks/index.json

{
  "schemaVersion": 1,
  "decks": [
    {
      "deckId": "animals-en-charades",
      "name": "Animals",
      "gameType": "charades",
      "language": "en",
      "difficulty": "medium",
      "topics": ["animals", "nature"],
      "recommended": true,
      "nsfw": false,
      "version": "2026-01-07T10:12:00Z",
      "cardCount": 50
    }
  ]
}

Deck file

public/decks/<deckId>.json

{
  "schemaVersion": 1,
  "deckId": "animals-en-charades",
  "version": "2026-01-07T10:12:00Z",
  "name": "Animals",
  "gameType": "charades",
  "language": "en",
  "difficulty": "medium",
  "topics": ["animals", "nature"],
  "nsfw": false,
  "cards": [ /* game-specific card objects */ ]
}

Card union types

Charades card

{ "cardId": "…", "type": "charades", "prompt": "Octopus" }

Trivia card (multiple choice)

{
  "cardId": "…",
  "type": "trivia",
  "format": "mcq",
  "question": "Which planet is known as the Red Planet?",
  "choices": ["Venus", "Mars", "Jupiter", "Mercury"],
  "answerIndex": 1,
  "answerText": "Mars"
}

Trivia card (open-ended)

{
  "cardId": "…",
  "type": "trivia",
  "format": "open",
  "question": "What is the capital of Canada?",
  "answerText": "Ottawa"
}

Taboo card

{
  "cardId": "…",
  "type": "taboo",
  "target": "Beach",
  "forbidden": ["sand", "ocean", "sun", "waves", "vacation"]
}

Just One card

{ "cardId": "…", "type": "justone", "target": "Volcano" }

Monikers card

{ "cardId": "…", "type": "monikers", "phrase": "Sherlock Holmes" }


⸻

9) ID strategy (deterministic)

Deck ID

Deterministic slug:
deckId = slug(deckName) + "-" + language + "-" + gameType

Card ID

Deterministic hash:
cardId = shortHash(deckId + "::" + normalizedCardContent)

Implementation detail:
	•	Use SHA-256 → base64url → truncate (e.g., 12–16 chars) to keep IDs compact.
	•	Normalization: trim, collapse whitespace, stable JSON stringify for objects.

⸻

10) Generation pipeline (GitHub Actions)

Authoring input (in-repo)

Curator edits a config file per deck, e.g.:
/decks/source/<deckSlug>.yaml

Example:

name: Animals
gameType: charades
language: en
topics: []          # optional; empty means any/random
difficulty: medium  # default
cardCount: 50       # default
nsfw: false         # default
recommended: true
context:
  markdown: |
    A list of common animals, nature terms, and behaviors…
  urls:
    - "https://example.com/animal-list"
rules:
  disallow:
    - "nsfw"

GitHub Action job

Triggered on:
	•	push to main affecting /decks/source/**
	•	manual workflow_dispatch

Steps:
	1.	Checkout
	2.	Install deps (node + pnpm/npm)
	3.	Run generator script:
	•	Fetch URL content (server-side in action)
	•	Convert HTML → markdown/plaintext
	•	Build prompt(s) based on gameType and constraints
	•	Call external LLM API (secret key stored in repo secrets)
	4.	Validate outputs:
	•	JSON schema validation
	•	Deduplicate cards
	•	Enforce min/max lengths, forbidden counts, etc.
	•	Safety filters: remove NSFW if nsfw:false
	5.	Write outputs:
	•	Update public/decks/index.json
	•	Write public/decks/<deckId>.json
	•	Update version timestamps
	6.	Commit results back to repo (or open PR)
	•	Recommendation: open a PR for review, then merge (safer)

Prompting (high-level templates)
	•	Include:
	•	game rules + format constraints
	•	difficulty guidance
	•	language requirement
	•	safety policy (“no NSFW” default)
	•	topic guidance (if provided)
	•	context (markdown + extracted URL text)
	•	Output must be strict JSON matching schema.

Quality gates
	•	Taboo: forbidden list length must be 5–6, all unique, none equal target, avoid trivial plurals
	•	Just One: words must be clue-able, not overly obscure (difficulty governs)
	•	Monikers: proper-noun heavy, culturally varied, avoid ultra-niche unless difficulty hard
	•	Trivia:
	•	MCQ should include plausible distractors
	•	Answer must match one choice exactly
	•	Open-ended must be unambiguous

⸻

11) Frontend architecture (Next.js static)

Rendering strategy
	•	Use static assets (JSON) loaded via:
	•	fetch('/decks/index.json') and fetch('/decks/<deckId>.json')
	•	or import at build time if preferred (but fetch keeps bundle smaller)

Core modules
	•	data/ utilities:
	•	loadDeckIndex()
	•	loadDeck(deckId)
	•	state/ session:
	•	loadSession(deckId)
	•	saveSession(deckId, session)
	•	clearSession(deckId)
	•	validateSessionAgainstDeck(session, deck) (checks deckVersion)
	•	game/ engines:
	•	createInitialSession(deck, { shuffleEnabled })
	•	nextCard(session)
	•	passCard(session)
	•	reveal(session)
	•	restart(session)
	•	monikersStartRound(session, roundNumber)

UI components (shadcn)
	•	Game selection tiles
	•	Deck list:
	•	search input
	•	filter controls (language, difficulty, topics)
	•	family-safe toggle
	•	sort dropdown
	•	shuffle toggle
	•	deck cards
	•	Play:
	•	Card display component
	•	Bottom action bar (Pass/Next)
	•	Reveal control (Trivia)
	•	Restart (confirm dialog)
	•	End Turn overlay (Monikers)
	•	Round indicator (Monikers: “Round 1 / 2 / 3”)

⸻

12) Error handling strategies

Data loading errors
	•	If index fails to load:
	•	show error state + “Retry”
	•	If deck fails to load or deckId not found:
	•	show “Deck not found” with link back to game page

Corrupted session data
	•	If JSON parse fails or required fields missing:
	•	clear session and start fresh
	•	If deckVersion mismatch:
	•	clear session and restart (hard reset)

Runtime UX errors
	•	If no cards remain:
	•	show “Deck complete” screen
	•	actions: “Restart” and “Back to decks”

Accessibility and responsiveness
	•	Large tap targets (>=44px)
	•	High contrast text
	•	Support landscape/tablet with centered card and persistent action bar

⸻

13) Testing plan

Unit tests (Jest/Vitest)
	•	ID generation:
	•	deterministic deckId slugging
	•	deterministic cardId hashing
	•	Schema validation:
	•	deck + each card type conforms
	•	Game engine logic:
	•	next/pass transitions for discard vs recycle
	•	trivia reveal toggling
	•	monikers round transitions; “correct removes”, “pass cycles”
	•	Session persistence:
	•	save/load/clear
	•	mismatch deckVersion triggers reset

Integration tests (Playwright)
	•	Game-first flow:
	•	select game → filter deck list → start deck → next/pass/restart/exit
	•	Trivia reveal-only:
	•	verify answer hidden until reveal
	•	Shuffle toggle:
	•	same deck, shuffle on/off yields different initial order (where applicable)
	•	Resume:
	•	start deck, advance, reload page → resumes
	•	simulate deck version change → session resets

Pipeline tests
	•	Generator script:
	•	given fixture context, produces valid JSON
	•	enforces taboo forbidden count, uniqueness
	•	removes NSFW when required
	•	CI check:
	•	fail build if generated JSON doesn’t validate

⸻

14) Open items (explicit assumptions made)
	•	Multiple saved sessions: I assumed per deck localStorage keys (recommended). If you prefer “only last session,” the storage wrapper changes but everything else stays.
	•	Swipe right/back is disabled since v1 has no Back control, even though swipe gestures are supported.

If you want, I can also provide:
	•	JSON Schema files for deck + cards (/schemas/*.json)
	•	A concrete folder structure + TypeScript types
	•	A sample GitHub Actions YAML + generator pseudocode/templates