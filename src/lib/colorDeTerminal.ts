// El color de cada terminal de la Cabina, que tiñe su cabecera.
//
// Munir, 2026-11-26: «arregla los headers que tengan colores diferentes, me
// confundo de terminal». Había pegado en la terminal de Adeorq una captura que
// era para Orquio General, con nueve terminales abiertas y cinco de ellas del
// mismo `_revision-orquio`. Por eso el color es de la TERMINAL y no del
// proyecto: dos del mismo proyecto tienen que distinguirse igual. Eligió la
// cabecera teñida (decisión d1a218767b38, la 1 de tres en el probador): un velo
// de su color en toda la cabecera, la letra como estaba. El borde no se toca:
// alrededor de una terminal solo van los tres estados (`lib/aroDeEstado.ts`).
//
// Cada terminal recibe su tono al nacer, lo guarda con el tablero
// (`SavedPane.tono`) y lo conserva mientras viva y al reabrir Adeorq: si
// cambiara al cerrar otra, dejaría de servir para reconocerla.

import type { CSSProperties } from "react";

/** Nueve tonos de 80° a 316°, a 26° unos de otros, lejos de los tres del aro
 *  (rojo 0°, amarillo 47°, azul 211°): una cabecera roja o amarilla se leería
 *  como una terminal que te necesita o que terminó. Van en el orden en que se
 *  reparten, que salta por la rueda: la que nace después cae lejos de la de
 *  antes. */
export const TONOS_TERMINAL: readonly number[] = [80, 238, 158, 316, 106, 264, 184, 290, 132];

/** El tono que se le da a la siguiente: el primero sin usar y, con las nueve
 *  ya repartidas, el que menos terminales tenga. */
function tonoMenosUsado(usos: Map<number, number>): number {
  let mejor = TONOS_TERMINAL[0];
  for (const t of TONOS_TERMINAL) if ((usos.get(t) ?? 0) < (usos.get(mejor) ?? 0)) mejor = t;
  return mejor;
}

interface ConTono {
  tono?: number;
  web?: string;
  archivos?: string[];
}

/** Una terminal de verdad: los archivos abiertos y las vistas web van aparte. */
const esTerminal = (p: ConTono): boolean => p.web == null && !p.archivos?.length;

/**
 * Las mismas terminales, con su tono puesto a las que aún no lo tienen. Las
 * que ya lo tienen no cambian nunca. Si no falta ninguno, devuelve el MISMO
 * array, para que el efecto que lo llama no vuelva a pintar.
 */
export function conTonos<P extends ConTono>(panes: P[]): P[] {
  if (panes.every((p) => !esTerminal(p) || p.tono != null)) return panes;
  const usos = new Map<number, number>();
  for (const p of panes) if (esTerminal(p) && p.tono != null) usos.set(p.tono, (usos.get(p.tono) ?? 0) + 1);
  return panes.map((p) => {
    if (!esTerminal(p) || p.tono != null) return p;
    const tono = tonoMenosUsado(usos);
    usos.set(tono, (usos.get(tono) ?? 0) + 1);
    return { ...p, tono };
  });
}

/** Un tono leído del tablero guardado, solo si es uno de los nuestros. */
export function tonoGuardado(x: unknown): number | undefined {
  return typeof x === "number" && TONOS_TERMINAL.includes(x) ? x : undefined;
}

/** El estilo del panel con su color, que lee la cabecera (`42-aspectos.css`). */
export function conColorDeTerminal(style: CSSProperties | undefined, tono: number | undefined): CSSProperties | undefined {
  return tono == null ? style : { ...style, ["--color-term" as string]: `hsl(${tono} 78% 64%)` };
}
