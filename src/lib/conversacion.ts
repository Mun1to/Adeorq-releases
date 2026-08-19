// La conversación de una sesión, sin pasar por la consola.
//
// Es la otra cara de la misma sesión: en la Cabina sale como una terminal, con
// sus códigos de escape y sus cajas; aquí sale como lo que de verdad es, una
// conversación. Sale del transcript que el CLI ya escribe en `~/.claude`, así
// que **no cuesta ni un token**: no hay una segunda llamada a nadie.
//
// Esa es la decisión de fondo del modo chat (`docs/CHAT.md` §3): la cara es
// nuestra, el motor es tu CLI y quien paga es tu suscripción. Un chat que
// pareciera normal y por detrás cobrara por clave sería el camino corto a una
// factura sorpresa.

import { invoke } from "@tauri-apps/api/core";

export interface Turno {
  /** "tu" o "agente". No "user"/"assistant": esto se pinta, no se manda. */
  rol: "tu" | "agente";
  texto: string;
  /** ISO tal cual lo escribió el CLI. Se formatea aquí, que es quien sabe el idioma. */
  hora: string;
  /** Las herramientas de ese turno, por nombre. */
  herramientas: string[];
}

/**
 * Si dos lecturas del transcript dicen lo mismo.
 *
 * Se relee cada tres segundos, pero casi siempre no ha cambiado nada: sin esto
 * se devolvía un array nuevo igualmente y React repintaba los 60 turnos por
 * costumbre. Devolviendo el array de antes, el repintado no llega a empezar.
 *
 * Se compara el texto y no una fecha porque el CLI reescribe el último turno
 * mientras lo va escribiendo, sin cambiarle la hora: mirando la hora, la
 * respuesta se quedaría congelada a medias.
 */
export function igualQue(a: Turno[], b: Turno[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (t, i) =>
      t.texto === b[i].texto &&
      t.rol === b[i].rol &&
      t.herramientas.length === b[i].herramientas.length,
  );
}

export function sessionMessages(
  cwd: string,
  sessionId?: string,
  max?: number,
): Promise<Turno[]> {
  return invoke("session_messages", { cwd, sessionId, max });
}

/* ── La actividad: lo que pasa por detrás de la terminal ──────────────────
   Mismo motor y misma economía que el chat: se lee del transcript que ya
   está en el disco, así que mirar no cuesta ni un token. */

export interface EventoActividad {
  /** Decide el icono y el color: skill, mcp, agente o herramienta. */
  clase: "skill" | "mcp" | "agente" | "herramienta";
  nombre: string;
  detalle: string;
  hora: string;
  veces: number;
}

export interface LlamadaModelo {
  hora: string;
  modelo: string;
  entrada: number;
  salida: number;
  cacheLeida: number;
  cacheEscrita: number;
}

export interface Actividad {
  eventos: EventoActividad[];
  llamadas: LlamadaModelo[];
  totalLlamadas: number;
  entradaTotal: number;
  salidaTotal: number;
}

export function sessionActivity(cwd: string, sessionId?: string): Promise<Actividad> {
  return invoke("session_activity", { cwd, sessionId });
}

/**
 * Las herramientas de un turno, contadas y en cristiano.
 *
 * Un chat que esconde que el agente ha estado escribiendo archivos miente sobre
 * lo que ha pasado; el volcado de cada llamada tampoco es conversación. El
 * término medio es una línea: «leyó 3 · escribió 2».
 */
export function resumeHerramientas(nombres: string[]): string {
  if (!nombres.length) return "";
  const cuenta = new Map<string, number>();
  for (const n of nombres) {
    const q = FAMILIA[n] ?? "usó herramientas";
    cuenta.set(q, (cuenta.get(q) ?? 0) + 1);
  }
  return [...cuenta].map(([q, n]) => (n > 1 ? `${q} ×${n}` : q)).join(" · ");
}

/** De qué va cada herramienta, dicho como lo diría alguien. */
const FAMILIA: Record<string, string> = {
  Read: "leyó",
  Glob: "buscó",
  Grep: "buscó",
  Edit: "editó",
  Write: "escribió",
  NotebookEdit: "editó",
  Bash: "ejecutó",
  PowerShell: "ejecutó",
  Task: "mandó un subagente",
  Agent: "mandó un subagente",
  WebFetch: "miró en la web",
  WebSearch: "buscó en la web",
  TodoWrite: "apuntó tareas",
  AskUserQuestion: "te preguntó",
};

/** «Hoy», «Ayer», «Esta semana» o el mes: los cajones de la lista. */
export function cajonDe(horas: number, t: (s: string) => string): string {
  if (horas < 24) return t("Hoy");
  if (horas < 48) return t("Ayer");
  if (horas < 24 * 7) return t("Esta semana");
  if (horas < 24 * 30) return t("Este mes");
  return t("Más atrás");
}
