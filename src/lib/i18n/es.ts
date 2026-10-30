import type { Messages } from "./types";

/**
 * Spanish UI messages. Typed as `Messages`, so a missing (or extra) key is a
 * type error. Hand-translated.
 */
export const es: Messages = {
  // Shared
  "common.backToHome": "Volver al inicio",
  "common.chooseDifferentDeck": "Elegir otra baraja",
  "common.cancel": "Cancelar",
  "common.cardCount": "{count} cartas",

  // Language switch
  "locale.switchLabel": "Idioma: {language}. Cambiar a {other}",
  "locale.name.en": "English",
  "locale.name.es": "Español",

  // Play: loading / error
  "play.error.notFoundTitle": "Baraja no encontrada",
  "play.error.notFoundBody": "Esta baraja no existe.",
  "play.error.title": "¡Ups!",
  "play.error.body": "Algo salió mal al cargar la baraja.",

  // Play: start screen
  "play.start.shuffle": "Barajar cartas",
  "play.start.start": "Empezar partida",
  "play.start.resume": "Continuar partida",
  "play.start.startNew": "Nueva partida",

  // Play: header
  "play.header.exit": "Salir",
  "play.header.restart": "Reiniciar",

  // Play: restart dialog
  "play.restart.title": "¿Reiniciar la partida?",
  "play.restart.body": "Se borrará tu progreso y empezarás desde el principio.",
  "play.restart.confirm": "Reiniciar",

  // Play: completion screen
  "play.complete.deckTitle": "¡Baraja completada!",
  "play.complete.gameTitle": "¡Partida terminada!",
  "play.complete.playAgain": "Jugar otra vez",

  // Deck list (/game/[gameType])
  "decks.backToGames": "Volver a los juegos",
  "decks.howToPlay": "Cómo se juega",
  "decks.chooseDeck": "Elige una baraja",
  "decks.recommended": "Recomendada",
  "decks.loadError": "No se pudieron cargar las barajas",
  "decks.empty": "Todavía no hay barajas para este juego.",
  "decks.contentWarnings": "Advertencias de contenido: {warnings}",

  // Situation puzzles
  "situation.card.badge": "Enigma",
  "situation.card.contentWarnings": "Advertencias de contenido: {warnings}",
  "situation.complete.title": "¡Has jugado todos los enigmas!",

  // Situation: puzzle picker (never shows solutions)
  "situation.picker.title": "Elige un enigma",
  "situation.picker.subtitle": "El narrador lee la situación en voz alta; los jugadores hacen preguntas de sí o no.",
  "situation.picker.left": "Quedan {count}",
  "situation.picker.nextUp": "Siguiente",
  "situation.picker.minutes": "~{minutes} min",
  "situation.picker.warnings": "Advertencias: {warnings}",

  // Situation: content-warning interstitial
  "situation.warnings.title": "Advertencia de contenido",
  "situation.warnings.body": "Este enigma trata sobre:",
  "situation.warnings.continue": "Mostrar la situación",
  "situation.warnings.choose": "Elegir otro enigma",

  // Situation: setup + reveal confirmation
  "situation.setup.readAloud": "Lee en voz alta",
  "situation.setup.reveal": "Narrador: ver solución",
  "situation.setup.back": "Otro enigma",
  "situation.reveal.title": "¿Mostrar la solución?",
  "situation.reveal.body": "Solo debe mirar el narrador. Asegúrate de que los jugadores no vean la pantalla.",
  "situation.reveal.confirm": "Soy el narrador, mostrar",

  // Situation: human keeper crib sheet
  "situation.keeper.time": "Tiempo",
  "situation.keeper.questions": "Preguntas",
  "situation.keeper.addQuestion": "+1 pregunta",
  "situation.keeper.removeQuestion": "Deshacer última pregunta",
  "situation.keeper.setup": "Situación",
  "situation.keeper.solution": "Solución",
  "situation.keeper.facts": "Hechos clave {found}/{total}",
  "situation.keeper.factsHelp": "Toca un hecho cuando los jugadores lo descubran.",
  "situation.keeper.hints": "Pistas",
  "situation.keeper.hint": "Pista {number}",
  "situation.keeper.giveHint": "Dar pista {number}",
  "situation.keeper.noMoreHints": "No hay más pistas",
  "situation.keeper.solved": "Resuelto",
  "situation.keeper.giveUp": "Rendirse",
  "situation.keeper.modeUnavailable": "Este modo de narrador aún no está disponible.",

  // Situation: end screen
  "situation.end.solved": "¡Resuelto!",
  "situation.end.gaveUp": "Esto es lo que pasó",
  "situation.end.solution": "Solución",
  "situation.end.time": "Tiempo",
  "situation.end.questions": "Preguntas",
  "situation.end.hints": "Pistas",
  "situation.end.facts": "Hechos",
  "situation.end.transcript": "Preguntas hechas",
  "situation.end.next": "Siguiente enigma",
  "situation.end.finish": "Terminar",
  "situation.end.choose": "Elegir enigma",

  // Situation: keeper answer vocabulary (spec §6.2)
  "situation.answer.yes": "Sí",
  "situation.answer.no": "No",
  "situation.answer.irrelevant": "Irrelevante",
  "situation.answer.partly": "En parte",
  "situation.answer.rephrase": "Reformula",
};
