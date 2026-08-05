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

/** Lo que hay que hacer con cada estado, que es lo único que importa aquí. */
export const PINTA: Record<string, { icon: string; label: string; urge: boolean }> = {
  a_medias: { icon: "●", label: "trabajando", urge: false },
  pregunta: { icon: "▲", label: "TE ESPERA", urge: true },
  ofrece: { icon: "▲", label: "TE ESPERA", urge: true },
  tuya: { icon: "▲", label: "te toca", urge: true },
  lista: { icon: "✓", label: "terminó", urge: false },
  "": { icon: "·", label: "no se sabe", urge: false },
};

/**
 * En qué columna cae un agente según lo que esté haciendo.
 *
 * El estado desconocido («») cae en «Trabajando» y no en una columna propia:
 * son los primeros segundos de una terminal recién abierta, y una quinta
 * columna que se llena y se vacía sola cada vez que abres algo es ruido. La
 * tarjeta lo dice igualmente, con el punto de «no se sabe».
 */
export function columnaDe(state: WorkState): Exclude<Columna, "porhacer"> {
  if (state === "pregunta" || state === "ofrece" || state === "tuya") return "espera";
  if (state === "lista") return "hecho";
  return "trabajando";
}

/** «4 min». Los segundos no se enseñan: nadie decide nada con ellos. */
export function haceCuanto(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}
