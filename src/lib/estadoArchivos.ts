// Qué color lleva cada archivo del panel de Archivos.
//
// Munir, 2026-10-08: «que se vaya actualizando en tiempo real, y colores de
// estado: si están siendo tocados esos archivos, en amarillo; si hay cambios
// sin guardar; si hay cambios nuevos o correcciones…». Esto decide el estado de
// cada fila con tres fuentes, y es puro para poder probarlo sin la app
// (`scripts/estado-archivos-check.ts`):
//
//   · la hora de cada archivo, del listado y de git: escrito hace menos de
//     `TOCANDO_MS` es que alguien (casi siempre un agente) lo está tocando ahora;
//   · `git status`: cambiado, nuevo, borrado o en conflicto desde el último
//     commit;
//   · lo que tienes abierto en el editor de Adeorq con cambios sin guardar.
//
// Un archivo puede estar en varios a la vez y se pinta con el que más importa
// (`PESO`): un conflicto, antes que nada; luego lo que se mueve ahora; luego lo
// tuyo sin guardar; y al final lo que git ya sabe. Una carpeta lleva el más
// importante de lo que tiene dentro, para que se vea sin desplegarla.

import type { Cambio } from "./archivos";

export type EstadoArchivo = "conflicto" | "tocando" | "sinGuardar" | "nuevo" | "cambiado" | "borrado";

/** Cuánto dura el amarillo después de la última escritura. */
export const TOCANDO_MS = 15_000;

const PESO: Record<EstadoArchivo, number> = {
  conflicto: 6,
  tocando: 5,
  sinGuardar: 4,
  nuevo: 3,
  cambiado: 2,
  borrado: 1,
};

/** El orden en que se cuentan arriba del árbol. */
export const ESTADOS: EstadoArchivo[] = ["conflicto", "tocando", "sinGuardar", "nuevo", "cambiado", "borrado"];

/** Una ruta comparable: las barras de Windows, las mayúsculas y la barra final no cuentan. */
export function clave(ruta: string): string {
  return ruta.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

const DE_GIT: Record<Cambio["estado"], EstadoArchivo> = {
  U: "conflicto",
  A: "nuevo",
  D: "borrado",
  R: "cambiado",
  M: "cambiado",
};

function poner(m: Map<string, EstadoArchivo>, ruta: string, e: EstadoArchivo): void {
  const k = clave(ruta);
  const antes = m.get(k);
  if (!antes || PESO[e] > PESO[antes]) m.set(k, e);
}

/** El estado de cada archivo que tiene alguno, por su `clave`. */
export function estadosDe(
  entradas: Iterable<{ ruta: string; carpeta: boolean; cuando: number }>,
  cambios: Cambio[],
  sinGuardar: Iterable<string>,
  ahora: number,
): Map<string, EstadoArchivo> {
  const m = new Map<string, EstadoArchivo>();
  const reciente = (cuando: number) => cuando > 0 && ahora - cuando < TOCANDO_MS;
  for (const c of cambios) {
    poner(m, c.ruta, DE_GIT[c.estado] ?? "cambiado");
    if (c.estado !== "D" && reciente(c.cuando)) poner(m, c.ruta, "tocando");
  }
  // Fuera de git (o lo que git ignora) también se ve lo que se está escribiendo.
  for (const e of entradas) if (!e.carpeta && reciente(e.cuando)) poner(m, e.ruta, "tocando");
  for (const r of sinGuardar) poner(m, r, "sinGuardar");
  return m;
}

/** Lo más importante que hay dentro de una carpeta, o nada si está todo como en el commit. */
export function estadoDeCarpeta(carpeta: string, estados: Map<string, EstadoArchivo>): EstadoArchivo | null {
  const dentro = `${clave(carpeta)}/`;
  let mejor: EstadoArchivo | null = null;
  for (const [k, e] of estados) {
    if (k.startsWith(dentro) && (!mejor || PESO[e] > PESO[mejor])) mejor = e;
  }
  return mejor;
}

/** Cuántos archivos hay de cada estado dentro de la raíz, para la línea de arriba. */
export function contar(raiz: string, estados: Map<string, EstadoArchivo>): Partial<Record<EstadoArchivo, number>> {
  const dentro = `${clave(raiz)}/`;
  const n: Partial<Record<EstadoArchivo, number>> = {};
  for (const [k, e] of estados) if (k.startsWith(dentro)) n[e] = (n[e] ?? 0) + 1;
  return n;
}
