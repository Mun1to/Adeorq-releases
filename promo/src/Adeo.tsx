import { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import {
  ALTO,
  ANCHO,
  GUIONES,
  REACCIONES,
  arrancar,
  avanzar,
  cuadrosDe,
  type Marcha,
  type Mirada,
  type Paso,
  type Pose,
} from "../../src/lib/mascota";
import type { Animo } from "./guion";

/**
 * Adeo, la mascota, dibujado por la app.
 *
 * Aquí no hay ni una postura ni un color suyos: las posturas, los guiones de
 * cada ánimo y quién decide el fotograma salen de `src/lib/mascota.ts`, el
 * mismo archivo que mueve al de la barra de Adeorq. Si mañana gana un gesto
 * allí, el del vídeo lo tiene en el siguiente render.
 *
 * Lo único que cambia es el reloj. En la app lo lleva un temporizador y el
 * azar de verdad; un vídeo tiene que dar el mismo fotograma cada vez que se le
 * pide, así que aquí se recorre el guion desde cero con un azar con semilla y
 * se apunta qué postura toca en cada milisegundo (`cinta`).
 */

function sembrado(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Fotograma = { ms: number; pose: Pose };

/**
 * Qué postura tiene Adeo en cada momento de un ánimo.
 *
 * `antes` son pasos que hace nada más aparecer, delante de su guion: sirve
 * para que salude, o para sacarle ya un gesto que en la app tardaría diez
 * segundos en salir al azar. Los pasos se cogen de `GUIONES` y `REACCIONES`,
 * nunca se escriben aquí.
 */
export function cinta(animo: Animo, hastaMs: number, antes: readonly Paso[] = [], semilla = 1): Fotograma[] {
  const azar = sembrado(semilla);
  let m: Marcha = arrancar(animo, 0, azar);
  if (antes.length) m = { ...m, cola: [...antes, ...m.cola] };
  const out: Fotograma[] = [];
  let ms = 0;
  while (ms <= hastaMs) {
    const r = avanzar(m, ms, azar);
    m = r.marcha;
    out.push({ ms, pose: m.pose });
    ms += r.espera;
  }
  return out;
}

/** Un gesto de los que un ánimo saca al azar, para ponerlo en `antes`. */
export const gesto = (animo: Animo, cual: number): readonly Paso[] => GUIONES[animo].gestos?.[cual] ?? [];
/** Una vuelta del bucle de un ánimo. */
export const bucle = (animo: Animo): readonly Paso[] => GUIONES[animo].bucle;
/* Este archivo es la única puerta a `src/lib/mascota.ts`: quien necesite una
   reacción o el tipo de un paso lo coge de aquí. */
export { REACCIONES, type Paso };

function poseEn(c: Fotograma[], ms: number): Pose {
  let pose = c[0].pose;
  for (const f of c) {
    if (f.ms > ms) break;
    pose = f.pose;
  }
  return pose;
}

/** El alto que de verdad se pinta: cada cuadro de la rejilla mide un número
    entero de píxeles, o los bordes salen borrosos. */
export const altoDeAdeo = (alto: number) => Math.max(1, Math.round(alto / ALTO)) * ALTO;
export const anchoDeAdeo = (alto: number) => (altoDeAdeo(alto) / ALTO) * ANCHO;

export function Adeo({
  animo,
  alto,
  antes,
  semilla = 1,
  mirada = "",
  desde = 0,
}: {
  animo: Animo;
  /** En píxeles; el ancho sale de la rejilla. */
  alto: number;
  antes?: readonly Paso[];
  semilla?: number;
  /** A dónde mira cuando su postura tiene el ojo de frente. */
  mirada?: Mirada;
  /** El fotograma en el que empieza su guion. Antes de ese, espera en su
      primera postura. */
  desde?: number;
}) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const c = useMemo(
    () => cinta(animo, (durationInFrames / fps) * 1000, antes, semilla),
    [animo, antes, semilla, durationInFrames, fps],
  );
  const pose = poseEn(c, (Math.max(0, frame - desde) / fps) * 1000);
  const h = altoDeAdeo(alto);

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      width={(h / ALTO) * ANCHO}
      height={h}
      shapeRendering="crispEdges"
      style={{ display: "block", overflow: "visible" }}
    >
      {cuadrosDe(pose, mirada).map((q, i) => (
        <rect key={i} x={q.x} y={q.y} width={1} height={1} fill={q.c} />
      ))}
    </svg>
  );
}
