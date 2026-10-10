import type { AgenteDeSesion } from "./pty";

// Lo que dice la lista de agentes de una terminal (el robot de su cabecera).
//
// Munir, 2026-10-10: no quería que Adeorq cerrase agentes quietos por su
// cuenta, pero sí «un mayor control de los agentes»: el robot decía cuántos
// había fuera y nada de quién era cada uno ni qué hacía. La lista la da Rust
// leyendo el historial de la sesión (`session_agents`); aquí está lo que se
// decide con ella, que es puro y se prueba sin ventana (`pnpm bancos agentes`).

/** En qué anda un agente, para pintarlo. */
export type EstadoDeAgente = "fuera" | "fondo" | "fallo" | "volvio";

/**
 * «fuera» es que sigue trabajando. Uno lanzado en segundo plano devuelve en el
 * acto un acuse de que salió, y de ahí en adelante el historial no dice si ya
 * terminó: se cuenta como «fondo» y no como «volvió», que sería mentir.
 */
export function estadoDeAgente(a: AgenteDeSesion): EstadoDeAgente {
  if (a.vivo) return "fuera";
  if (a.fallo) return "fallo";
  return a.fondo ? "fondo" : "volvio";
}

/** Un rato, en corto: «45 s», «3 min», «1 h 05 min». */
export function rato(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

/**
 * Cuánto lleva fuera (si sigue) o cuánto tardó (si volvió). Vacío si el
 * historial no trae las horas: mejor nada que un «0 s» inventado.
 */
export function tiempoDe(a: AgenteDeSesion, ahora: number): string {
  const desde = Date.parse(a.desde);
  if (Number.isNaN(desde)) return "";
  if (a.vivo) return rato(ahora - desde);
  const hasta = a.hasta ? Date.parse(a.hasta) : NaN;
  // El acuse de uno en segundo plano llega al instante: eso no es lo que tardó.
  if (a.fondo || Number.isNaN(hasta)) return "";
  return rato(hasta - desde);
}

/** Cuántos hay de cada: lo que va en la cabecera de la lista. */
export function recuento(lista: AgenteDeSesion[]) {
  const de = (e: EstadoDeAgente) => lista.filter((a) => estadoDeAgente(a) === e).length;
  return { fuera: de("fuera"), fondo: de("fondo"), fallo: de("fallo"), volvio: de("volvio") };
}

/** Dónde se pinta la lista: debajo del robot si cabe, encima si no, y sin
    salirse por los lados. Todo en píxeles de la ventana. */
export function sitioDeLaLista(
  robot: { left: number; top: number; bottom: number },
  lista: { ancho: number; alto: number },
  ventana: { ancho: number; alto: number },
): { x: number; y: number } {
  const MARGEN = 8;
  const x = Math.max(MARGEN, Math.min(robot.left - 10, ventana.ancho - lista.ancho - MARGEN));
  const debajo = robot.bottom + 6;
  const cabeDebajo = debajo + lista.alto <= ventana.alto - MARGEN;
  const y = cabeDebajo ? debajo : Math.max(MARGEN, robot.top - 6 - lista.alto);
  return { x, y };
}
