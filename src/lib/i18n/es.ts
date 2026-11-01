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
};
