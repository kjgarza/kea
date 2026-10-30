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

  // Situation: keeper mode on the picker (#31)
  "situation.mode.label": "¿Quién guarda el secreto?",
  "situation.mode.human": "Narrador",
  "situation.mode.ai": "Narrador IA",
  "situation.mode.solo": "En solitario",
  "situation.mode.human.desc": "Una persona lee la situación y responde en voz alta a preguntas de sí o no.",
  "situation.mode.ai.desc": "Juega todo el mundo: escribe o di tus preguntas y responde el narrador IA.",
  "situation.mode.solo.desc": "Juega a solas contra el narrador IA, con pistas y puntuación.",
  "situation.mode.notConfigured": "El narrador IA no está configurado en este sitio, así que solo se puede jugar con narrador humano.",
  "situation.mode.missingPasscode": "Introduce el código de IA en los ajustes para jugar con el narrador IA o en solitario.",
  "situation.mode.openSettings": "Abrir ajustes",

  // Situation: AI keeper and solo play (#31)
  "situation.ai.setup": "El enigma",
  "situation.ai.progress": "Datos clave descubiertos",
  "situation.ai.progressValue": "{found} de {total}",
  "situation.ai.transcript": "Vuestras preguntas",
  "situation.ai.empty": "Haz una pregunta de sí o no para empezar.",
  "situation.ai.latest": "El narrador dice",
  "situation.ai.rephraseHelp": "Pregunta algo que se pueda responder con sí o no.",
  "situation.ai.inputLabel": "Tu pregunta",
  "situation.ai.placeholder": "Haz una pregunta de sí o no…",
  "situation.ai.send": "Preguntar",
  "situation.ai.sending": "Preguntando al narrador…",
  "situation.ai.micStart": "Preguntar por voz",
  "situation.ai.micStop": "Dejar de escuchar",
  "situation.ai.listening": "Escuchando…",
  "situation.ai.micDenied": "El micrófono está bloqueado. Permítelo en los ajustes del navegador o escribe la pregunta.",
  "situation.ai.micFailed": "No se ha entendido. Inténtalo de nuevo o escribe la pregunta.",
  "situation.ai.retry": "Reintentar",
  "situation.ai.discard": "Descartar pregunta",
  "situation.ai.offline": "No hay conexión. Tus preguntas se guardan; envíalas cuando vuelvas a estar en línea.",
  "situation.ai.error.network": "No se pudo conectar con el narrador IA. Comprueba la conexión y reintenta.",
  "situation.ai.error.passcode": "Falta el código de IA o no es válido. Revísalo en los ajustes.",
  "situation.ai.error.limited": "Ya se usó el límite de IA de hoy. Cambia a narrador humano o vuelve mañana.",
  "situation.ai.error.notConfigured": "El narrador IA no está configurado en este sitio.",
  "situation.ai.error.generic": "El narrador IA ha tenido un problema. Inténtalo de nuevo.",
  "situation.ai.getHint": "Pedir pista {number}",
  "situation.ai.solved": "Lo hemos resuelto",
  "situation.ai.solvedSolo": "Lo he resuelto",
  "situation.ai.score": "Puntos",
  "situation.ai.scoreHelp": "Cada pregunta resta {perQuestion} puntos y cada pista {perHint}.",
  "situation.end.score": "Puntuación: {score}",

  // Historial, grupos y elección al azar (#28)
  "history.title": "Historial de partidas",
  "history.link": "Historial",
  "history.back": "Volver",
  "history.empty": "Aún no has terminado ningún enigma. Los enigmas terminados aparecen aquí.",
  "history.count": "Enigmas terminados: {count}",
  "history.item.questions": "Preguntas: {count}",
  "history.item.hints": "Pistas: {count}",
  "history.outcome.solved": "Resuelto",
  "history.outcome.gave_up": "Se rindieron",
  "history.outcome.partial": "Resuelto en parte",
  "history.export": "Exportar copia",
  "history.import": "Importar copia",
  "history.import.done": "Copia importada. Enigmas terminados nuevos: {count}.",
  "history.import.invalid": "Ese archivo no es una copia de Kea.",
  "history.group.label": "Quién juega",
  "history.group.default": "Mi grupo",
  "history.group.add": "Nuevo grupo",
  "history.group.rename": "Renombrar grupo",
  "history.group.addTitle": "Nuevo grupo",
  "history.group.renameTitle": "Renombrar grupo",
  "history.group.name": "Nombre del grupo",
  "history.group.namePlaceholder": "p. ej. los de Berlín, pareja, solo",
  "history.group.save": "Guardar",
  "history.group.hidePlayed": "Ocultar enigmas que este grupo ya jugó",
  "history.picker.played": "Jugado",
  "history.picker.hiddenCount": "Jugados y ocultos: {count}",
  "history.picker.allPlayed": "Este grupo ya jugó todos los enigmas que quedan en este mazo. Desactiva la opción de ocultar para verlos.",
  "history.random.button": "Enigma al azar",
  "history.random.title": "Elegir un enigma al azar",
  "history.random.unplayed": "Solo enigmas que este grupo no ha jugado",
  "history.random.maxMinutes": "Duración máxima",
  "history.random.anyLength": "Cualquier duración",
  "history.random.minutes": "Hasta {minutes} min",
  "history.random.excludeWarnings": "Saltar enigmas con advertencias de contenido",
  "history.random.matches": "Enigmas que coinciden: {count}",
  "history.random.none": "Ningún enigma coincide con estos filtros.",
  "history.random.pick": "Elegir uno",
  "history.reminder.title": "Haz una copia de tu historial",
  "history.reminder.body": "Este navegador no ha prometido guardar los datos de Kea. Exporta una copia para no perder tu historial.",
  "history.reminder.export": "Exportar ahora",
  "history.reminder.later": "Más tarde",

  // Añadir a la pantalla de inicio (#28)
  "install.title": "Añade Kea a tu pantalla de inicio",
  "install.body": "Los navegadores pueden borrar los datos de un sitio tras una semana sin visitarlo. Instalar Kea mantiene tu historial a salvo.",
  "install.ios": "En iPhone o iPad: toca el botón Compartir y luego «Añadir a pantalla de inicio».",
  "install.other": "Abre el menú del navegador y elige «Instalar aplicación» o «Añadir a pantalla de inicio».",
  "install.button": "Instalar Kea",
  "install.dismiss": "Descartar",

  // Ajustes de la app (#28; #29 añade la clave de acceso)
  "settings.open": "Ajustes",
  "settings.title": "Ajustes",
  "settings.description": "Kea guarda todo en este teléfono.",
  "settings.storage.title": "Almacenamiento",
  "settings.storage.granted": "El navegador guardará los datos de Kea.",
  "settings.storage.denied": "El navegador puede borrar los datos de Kea. Exporta una copia de vez en cuando.",
  "settings.storage.notAsked": "Aún no se ha pedido. Kea lo pide al terminar tu primer enigma.",
  "settings.storage.unsupported": "Este navegador no puede prometer guardar los datos de Kea. Exporta una copia de vez en cuando.",
  "settings.storage.memoryOnly": "El almacenamiento está bloqueado: no se guarda nada al cerrar esta página.",
  "settings.backup.title": "Copia de seguridad",
  "settings.backup.body": "Lleva tu historial, grupos y partidas a otro teléfono.",
  "settings.history": "Ver historial de partidas",
  "settings.passcode.title": "Guardián con IA",
  "settings.passcode.body": "Escribe el código que te dieron para usar las funciones de IA. Se queda en este teléfono y no se incluye en las copias de seguridad.",
  "settings.passcode.label": "Código",
  "settings.passcode.save": "Guardar",
  "settings.passcode.remove": "Quitar",
  "settings.passcode.saved": "Código guardado.",
  "settings.passcode.removed": "Código quitado.",
  "settings.passcode.check": "Comprobar código",
  "settings.passcode.checking": "Comprobando…",
  "settings.passcode.ok": "El código funciona. Quedan {remaining} consultas hoy.",
  "settings.passcode.okUnlimited": "El código funciona.",
  "settings.passcode.wrong": "Ese código no es válido.",
  "settings.passcode.limited": "Ya se usó el límite de hoy. Vuelve a intentarlo mañana.",
  "settings.passcode.error": "No se pudo conectar con el servicio de IA. Inténtalo más tarde.",
};
