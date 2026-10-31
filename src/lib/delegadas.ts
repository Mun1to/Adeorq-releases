// Qué conversaciones son de una terminal que abrió un agente, para que al
// recrear su panel vuelva siendo delegada.
//
// La Suprema, 2026-10-30 (BUZON): tras reiniciar Adeorq sus delegadas volvían
// sin el «de: …» de su cabecera, en el modo de Ajustes (`acceptEdits`) y no en
// el `auto` con el que nacieron, y sin compactarse solas a la raya roja. Lo
// que sí sobrevive al reinicio es su conversación (el tablero la retoma con
// `--resume`), así que Rust las guarda por ella (`mcp/delegadas.rs`) y aquí se
// leen una vez al arrancar. Las que se abren después las apunta
// `lib/puenteMcp.ts`, y las que se cierran se olvidan: retomada otro día desde
// la barra, una cerrada ya es tuya.

import { invoke } from "@tauri-apps/api/core";
import { sessionIdOf } from "./comandos";
import { marcarDelegada } from "./contexto";

export interface Guardada {
  /** El título de la cabecera de quien la abrió: su «de: …». */
  abiertaPor?: string;
  /** El modo de permisos con el que nació. */
  modo?: string;
}

const GUARDADAS = new Map<string, Guardada>();
let cargadas: Promise<void> | null = null;

/** Lo que guarda Rust, una vez por arranque. Sin Tauri (un banco), nada. */
export function cargarDelegadas(): Promise<void> {
  cargadas ??= invoke<{ sesion: string; abiertaPor?: string | null; modo?: string | null }[]>("delegadas_guardadas")
    .then((lista) => {
      for (const g of lista) {
        if (!GUARDADAS.has(g.sesion)) GUARDADAS.set(g.sesion, { abiertaPor: g.abiertaPor ?? undefined, modo: g.modo ?? undefined });
      }
    })
    .catch(() => {});
  return cargadas;
}

/** El modo de permisos que lleva un comando de Claude Code. */
function modoDe(command: string[]): string | undefined {
  return /--permission-mode\s+([A-Za-z]+)/.exec(command.join(" "))?.[1];
}

/** Una que acaba de abrir un agente (`open_pane` o un encargo programado). */
export function apuntarDelegada(command: string[] | undefined, abiertaPor: string | undefined): void {
  const sesion = sessionIdOf(command);
  if (sesion) GUARDADAS.set(sesion, { abiertaPor, modo: command ? modoDe(command) : undefined });
}

/** Una que se cerró (con `close_pane` o con la X): ya no vuelve como delegada. */
export function olvidarDelegada(sesion: string | undefined): void {
  if (sesion) GUARDADAS.delete(sesion);
}

/** Si el comando retoma la conversación de una delegada que nadie cerró. */
export function delegadaDe(command: string[] | undefined): Guardada | undefined {
  const sesion = sessionIdOf(command);
  return sesion ? GUARDADAS.get(sesion) : undefined;
}

/** Al nacer un panel con este comando: si es de una delegada, lo marca para que
 *  compacte sola (`esDelegada`) y devuelve su «de: …». `dado` es el que ya
 *  trae quien lo abre, y manda. */
export function delegacionDe(id: number, command: string[] | undefined, dado?: string): string | undefined {
  const g = delegadaDe(command);
  if (!g && !dado) return undefined;
  marcarDelegada(id);
  return dado ?? g?.abiertaPor;
}
