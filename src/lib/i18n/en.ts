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

  // History, groups and random pick (#28)
  "history.title": "Play history",
  "history.link": "History",
  "history.back": "Back",
  "history.empty": "No puzzles finished yet. Finished puzzles show up here.",
  "history.count": "Puzzles finished: {count}",
  "history.item.questions": "Questions: {count}",
  "history.item.hints": "Hints: {count}",
  "history.outcome.solved": "Solved",
  "history.outcome.gave_up": "Gave up",
  "history.outcome.partial": "Partly solved",
  "history.export": "Export backup",
  "history.import": "Import backup",
  "history.import.done": "Backup imported. New finished puzzles: {count}.",
  "history.import.invalid": "That file isn't a Kea backup.",
  "history.group.label": "Playing as",
  "history.group.default": "My group",
  "history.group.add": "New group",
  "history.group.rename": "Rename group",
  "history.group.addTitle": "New group",
  "history.group.renameTitle": "Rename group",
  "history.group.name": "Group name",
  "history.group.namePlaceholder": "e.g. Berlin crew, partner, solo",
  "history.group.save": "Save",
  "history.group.hidePlayed": "Hide puzzles this group has played",
  "history.picker.played": "Played",
  "history.picker.hiddenCount": "Played and hidden: {count}",
  "history.picker.allPlayed": "This group has played every puzzle left in this deck. Turn off hiding to see them again.",
  "history.random.button": "Random puzzle",
  "history.random.title": "Pick a random puzzle",
  "history.random.unplayed": "Only puzzles this group hasn't played",
  "history.random.maxMinutes": "Maximum length",
  "history.random.anyLength": "Any length",
  "history.random.minutes": "Up to {minutes} min",
  "history.random.excludeWarnings": "Skip puzzles with content warnings",
  "history.random.matches": "Matching puzzles: {count}",
  "history.random.none": "No puzzle matches these filters.",
  "history.random.pick": "Pick one",
  "history.reminder.title": "Back up your history",
  "history.reminder.body": "This browser hasn't promised to keep Kea's data. Export a backup file so you don't lose your history.",
  "history.reminder.export": "Export now",
  "history.reminder.later": "Later",

  // Add to home screen (#28)
  "install.title": "Add Kea to your home screen",
  "install.body": "Browsers can delete a site's data after about a week without a visit. Installing Kea keeps your history safe.",
  "install.ios": "On iPhone or iPad: tap the Share button, then “Add to Home Screen”.",
  "install.other": "Open your browser menu and choose “Install app” or “Add to Home screen”.",
  "install.button": "Install Kea",
  "install.dismiss": "Dismiss",

  // App settings sheet (#28; #29 adds the passcode section)
  "settings.open": "Settings",
  "settings.title": "Settings",
  "settings.description": "Kea keeps everything on this phone.",
  "settings.storage.title": "Storage",
  "settings.storage.granted": "The browser will keep Kea's data.",
  "settings.storage.denied": "The browser may clear Kea's data. Export a backup now and then.",
  "settings.storage.notAsked": "Not asked yet. Kea asks after your first finished puzzle.",
  "settings.storage.unsupported": "This browser can't promise to keep Kea's data. Export a backup now and then.",
  "settings.storage.memoryOnly": "Storage is blocked: nothing is saved after you close this page.",
  "settings.backup.title": "Backup",
  "settings.backup.body": "Move your history, groups and games to another phone.",
  "settings.history": "View play history",
  "settings.passcode.title": "AI keeper",
  "settings.passcode.body": "Enter the passcode you were given to use the AI features. It stays on this phone and is not included in backups.",
  "settings.passcode.label": "Passcode",
  "settings.passcode.save": "Save",
  "settings.passcode.remove": "Remove",
  "settings.passcode.saved": "Passcode saved.",
  "settings.passcode.removed": "Passcode removed.",
  "settings.passcode.check": "Check passcode",
  "settings.passcode.checking": "Checking…",
  "settings.passcode.ok": "Passcode works. {remaining} requests left today.",
  "settings.passcode.okUnlimited": "Passcode works.",
  "settings.passcode.wrong": "That passcode was not accepted.",
  "settings.passcode.limited": "Today's limit is used up. Try again tomorrow.",
  "settings.passcode.error": "Could not reach the AI service. Try again later.",
} as const;
