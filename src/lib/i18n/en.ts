/**
 * English UI messages — the source catalogue. Every other locale is typed
 * against this one's keys (see `Messages` in ./types.ts), so a key added here
 * and missing elsewhere fails type-checking.
 *
 * Keys are flat dotted strings grouped by screen. Placeholders use `{name}`
 * and are type-checked by `t()`.
 */
export const en = {
  // Shared
  "common.backToHome": "Back to Home",
  "common.chooseDifferentDeck": "Choose Different Deck",
  "common.cancel": "Cancel",
  "common.cardCount": "{count} cards",

  // Language switch
  "locale.switchLabel": "Language: {language}. Switch to {other}",
  "locale.name.en": "English",
  "locale.name.es": "Español",

  // Play: loading / error
  "play.error.notFoundTitle": "Deck Not Found",
  "play.error.notFoundBody": "This deck doesn't exist.",
  "play.error.title": "Oops!",
  "play.error.body": "Something went wrong loading the deck.",

  // Play: start screen
  "play.start.shuffle": "Shuffle cards",
  "play.start.start": "Start Game",
  "play.start.resume": "Resume Game",
  "play.start.startNew": "Start New Game",

  // Play: header
  // NB: no accessible name may contain "start game" (tests/card-view-spacing.spec.ts).
  "play.header.exit": "Exit",
  "play.header.restart": "Restart",

  // Play: restart dialog
  "play.restart.title": "Restart Game?",
  "play.restart.body": "This will reset your progress and start from the beginning.",
  "play.restart.confirm": "Restart",

  // Play: completion screen
  "play.complete.deckTitle": "Deck Complete!",
  "play.complete.gameTitle": "Game Complete!",
  "play.complete.playAgain": "Play Again",

  // Deck list (/game/[gameType])
  "decks.backToGames": "Back to games",
  "decks.howToPlay": "How to Play",
  "decks.chooseDeck": "Choose a Deck",
  "decks.recommended": "Recommended",
  "decks.loadError": "Failed to load decks",
  "decks.empty": "No decks available for this game yet.",
  "decks.contentWarnings": "Content warnings: {warnings}",

  // Situation puzzles (placeholder screen until the keeper view, #25)
  "situation.card.badge": "Situation",
  "situation.card.contentWarnings": "Content warnings: {warnings}",
  "situation.play.nextPuzzle": "Next puzzle",
  "situation.play.skip": "Skip",
  "situation.play.keeperComingSoon": "The keeper view is coming soon. Read the setup aloud and answer yes/no questions.",
  "situation.complete.title": "All puzzles played!",
} as const;
