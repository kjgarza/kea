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

  // Situation puzzles
  "situation.card.badge": "Situation",
  "situation.card.contentWarnings": "Content warnings: {warnings}",
  "situation.complete.title": "All puzzles played!",

  // Situation: puzzle picker (never shows solutions)
  "situation.picker.title": "Choose a puzzle",
  "situation.picker.subtitle": "The keeper reads the setup aloud; players ask yes/no questions.",
  "situation.picker.left": "{count} left",
  "situation.picker.nextUp": "Next up",
  "situation.picker.minutes": "~{minutes} min",
  "situation.picker.warnings": "Warnings: {warnings}",

  // Situation: content-warning interstitial
  "situation.warnings.title": "Content warning",
  "situation.warnings.body": "This puzzle deals with:",
  "situation.warnings.continue": "Show the setup",
  "situation.warnings.choose": "Choose another puzzle",

  // Situation: setup + reveal confirmation
  "situation.setup.readAloud": "Read aloud",
  "situation.setup.reveal": "Keeper: show solution",
  "situation.setup.back": "Other puzzle",
  "situation.reveal.title": "Show the solution?",
  "situation.reveal.body": "Only the keeper should look. Make sure the players can't see the screen.",
  "situation.reveal.confirm": "I'm the keeper, show it",

  // Situation: human keeper crib sheet
  "situation.keeper.time": "Time",
  "situation.keeper.questions": "Questions",
  "situation.keeper.addQuestion": "+1 question",
  "situation.keeper.removeQuestion": "Undo last question",
  "situation.keeper.setup": "Setup",
  "situation.keeper.solution": "Solution",
  "situation.keeper.facts": "Key facts {found}/{total}",
  "situation.keeper.factsHelp": "Tap a fact when the players uncover it.",
  "situation.keeper.hints": "Hints",
  "situation.keeper.hint": "Hint {number}",
  "situation.keeper.giveHint": "Give hint {number}",
  "situation.keeper.noMoreHints": "No more hints",
  "situation.keeper.solved": "Solved",
  "situation.keeper.giveUp": "Give up",
  "situation.keeper.modeUnavailable": "This keeper mode is not available yet.",

  // Situation: end screen
  "situation.end.solved": "Solved!",
  "situation.end.gaveUp": "Here's what happened",
  "situation.end.solution": "Solution",
  "situation.end.time": "Time",
  "situation.end.questions": "Questions",
  "situation.end.hints": "Hints",
  "situation.end.facts": "Facts",
  "situation.end.transcript": "Questions asked",
  "situation.end.next": "Next puzzle",
  "situation.end.finish": "Finish",
  "situation.end.choose": "Choose puzzle",

  // Situation: keeper answer vocabulary (spec §6.2)
  "situation.answer.yes": "Yes",
  "situation.answer.no": "No",
  "situation.answer.irrelevant": "Irrelevant",
  "situation.answer.partly": "Partly",
  "situation.answer.rephrase": "Rephrase",
} as const;
