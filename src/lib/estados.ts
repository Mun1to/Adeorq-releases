// Cómo se lee el estado de un agente, en un solo sitio.
//
// Esto vivía dentro de CrewBoard.tsx, y ahora lo miran dos tableros: el de la
// cuadrilla en la cabina y el kanban del lienzo. Duplicarlo habría sido tener
// dos vocabularios para lo mismo, que es como acabas con un agente que en una
// pantalla «TE ESPERA» y en la otra está «trabajando».

import type { WorkState } from "./pty";

/** Las cuatro columnas del kanban. El orden es el del tablero. */
export const COLUMNAS = ["porhacer", "trabajando", "espera", "hecho"] as const;

export type Columna = (typeof COLUMNAS)[number];

export const TITULO: Record<Columna, string> = {
  porhacer: "Por hacer",
  trabajando: "Trabajando",
  espera: "Te espera",
  hecho: "Hecho",
};

/** Lo que hay que hacer con cada estado, que es lo único que importa aquí.
 *
 * El dibujo NO vive aquí: es `EstadoIcon` (`components/Icons.tsx`), que recibe
 * el estado y lo pinta. Hasta el 2026-08-07 esto llevaba un glifo de texto por
 * estado (● ▲ ✓ ·), y un glifo cambia de forma según la tipografía que cargue
 * el sistema, no escala y se ve prestado al lado de los iconos de la casa. */
export const PINTA: Record<string, { label: string; urge: boolean }> = {
  a_medias: { label: "trabajando", urge: false },
  pregunta: { label: "TE ESPERA", urge: true },
  ofrece: { label: "TE ESPERA", urge: true },
  tuya: { label: "en reposo", urge: false },
  lista: { label: "terminó", urge: false },
  "": { label: "en reposo", urge: false },
};

/**
 * En qué columna cae un agente según lo que esté haciendo.
 *
 * Ante la duda, callado (Munir, 2026-10-11). Hay dos estados que no dicen qué
 * pasa, y ninguno reclama nada:
 *   · «» es que no se ha leído nada todavía: una terminal recién abierta.
 *   · `tuya` es que lo último del transcript es un mensaje TUYO sin contestar.
 *     En una terminal viva eso es casi siempre que acabas de escribirle y
 *     todavía piensa; alguna vez, que se quedó parada. No se distinguen, y
 *     hasta ese día contaba como «te toca»: cada mensaje que mandabas a una
 *     sesión terminada hacía saltar un «te espera» mientras el agente
 *     arrancaba. En la lista de sesiones cerradas sí sigue siendo «te toca»
 *     (`AgendaSesiones.tsx`), que ahí nadie está pensando.
 *
 * Los dos caen en «Trabajando» y no en una columna propia: una quinta columna
 * que se llena y se vacía sola cada vez que abres algo es ruido. La tarjeta lo
 * dice igualmente, con el punto de «en reposo».
 */
export function columnaDe(state: WorkState): Exclude<Columna, "porhacer"> {
  if (state === "pregunta" || state === "ofrece") return "espera";
  if (state === "lista") return "hecho";
  return "trabajando";
}

/**
 * ¿Este agente ha dejado de trabajar y ahora te toca a ti?
 *
 * Es el disparo del ajuste «saltar a la sesión que termina». Ese salto colgaba
 * SOLO de la campana del terminal, y una campana es un pitido: no dice si el
 * agente acabó o si te está preguntando algo, y si el CLI no la toca no pasa
 * nada de nada y no hay forma de saber por qué (Munir, 2026-08-10: «la tengo
 * activada y no funciona»). El transcript sí lo sabe, y Adeorq ya lo lee para
 * pintar el estado de cada panel.
 *
 * Entran los tres estados en los que la pelota es tuya, no solo «terminó»:
 * si el agente se para a preguntarte algo también quieres tenerlo delante, que
 * es literalmente lo que se pide al encender el ajuste.
 */
export function reclamaTuAtencion(state: WorkState): boolean {
  return columnaDe(state) !== "trabajando";
}

/**
 * Y el disparo de verdad: solo en el INSTANTE en que cambia.
 *
 * El estado de un panel se recalcula cada pocos segundos, así que preguntar
 * «¿te espera?» daría que sí una y otra vez mientras el agente espera, y la
 * pantalla saltaría en bucle. Solo cuenta el momento en que pasa de trabajar a
 * esperarte.
 *
 * Un `antes` desconocido nunca dispara: son los paneles que se restauran al
 * abrir la app, que a menudo nacen ya terminados. Arrancar Adeorq no puede
 * significar que se te ponga a pantalla completa lo último que hiciste ayer.
 * Y «desconocido» es también «»: un panel restaurado no pasa de nada a
 * «terminó», pasa por «» mientras se lee su transcript, y por ahí se colaba
 * un aviso por cada terminal en cada arranque. De «» solo dispara una
 * pregunta, que es de ahora mismo (un menú en pantalla); un «terminó» que ya
 * estaba ahí cuando se pudo leer no es una noticia.
 */
export function acabaDeReclamar(antes: WorkState | undefined, ahora: WorkState): boolean {
  if (antes === undefined) return false;
  if (antes === ahora) return false;
  if (antes === "") return ahora === "pregunta";
  return reclamaTuAtencion(ahora) && !reclamaTuAtencion(antes);
}

/** «4 min». Los segundos no se enseñan: nadie decide nada con ellos. */
export function haceCuanto(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}
