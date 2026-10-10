// Los movimientos de la mascota: sus posturas, sus guiones y quién decide qué
// fotograma toca. El dibujo lo pinta `components/Mascota.tsx`.
//
// La primera versión (0.9.186) se movía poco a propósito: parpadeaba, saludaba
// y daba dos saltitos. Munir pidió ese mismo día que tuviera «varias
// reacciones y movimientos», como un sprite de verdad. Así que cada ánimo es
// ahora un guion: unos fotogramas que se repiten, una entrada que se ve una
// vez al llegar a ese ánimo, y unos gestos que salen de vez en cuando al azar
// (mirar a los lados, estirarse, cambiar el peso de pie) para que no sea un
// bucle que se aprende en diez segundos.
//
// Es una rejilla de 20 × 14 cuadros: las dos filas de arriba son aire, para
// saltar y para lo que le sale encima de la cabeza (la exclamación, las zetas,
// las chispas).
//
// Todo lo que decide es puro y se prueba sin ventana: `pnpm bancos mascota`.

import type { Animo } from "./campana";

export const ANCHO = 20;
export const ALTO = 14;
/** Cuántas filas de aire hay encima del cuerpo. */
const AIRE = 2;

/** El cuerpo. B cuerpo, W blanco del ojo. La pupila la pone cada mirada. */
const CUERPO = [
  "......BBBBBBBB......",
  "......BBBWWBBB......",
  ".....BBBBWWBBBB.....",
  ".....BBBWWWWBBB.....",
  ".....BBBWWWWBBB.....",
  "....BBBBWWWWBBBB....",
  "....BBBBBBBBBBBB....",
  "....BBBBBBBBBBBB....",
  "...BBBBB....BBBBB...",
  "...BBBB......BBBB...",
  "...BBBB......BBBB...",
  "..BBBBB......BBBBB..",
];

type Punto = readonly [number, number];

/** El brazo izquierdo en cada postura; el derecho es su espejo. */
const BRAZOS = {
  abajo: [[3, 6], [2, 7], [2, 8]],
  medio: [[3, 6], [2, 6], [1, 7]],
  arriba: [[3, 5], [2, 4], [2, 3]],
  saluda: [[3, 5], [2, 4], [1, 3]],
  recto: [[3, 6], [2, 6], [1, 6]],
  teclaA: [[3, 6], [2, 7], [1, 7]],
  teclaB: [[3, 6], [2, 7], [1, 8]],
} as const satisfies Record<string, readonly Punto[]>;
export type Brazo = keyof typeof BRAZOS;

/** Dónde está la pupila (o qué forma tiene el ojo cerrado). */
const OJOS = {
  abierto: [[9, 4], [10, 4]],
  izq: [[8, 4], [9, 4]],
  der: [[10, 4], [11, 4]],
  bajo: [[9, 5], [10, 5]],
  arriba: [[9, 3], [10, 3]],
  // Susto: la pupila grande, de dos filas.
  grande: [[9, 3], [10, 3], [9, 4], [10, 4]],
} as const satisfies Record<string, readonly Punto[]>;
/** Cerrado es una raya; feliz, un arco hacia arriba. En los dos no hay blanco. */
const PARPADOS = {
  cerrado: [[8, 4], [9, 4], [10, 4], [11, 4]],
  feliz: [[8, 4], [9, 3], [10, 3], [11, 4]],
} as const satisfies Record<string, readonly Punto[]>;
export type Ojo = keyof typeof OJOS | keyof typeof PARPADOS;

/** Lo que le sale por encima, en coordenadas de la rejilla entera. */
const EXTRAS = {
  alerta: { color: "#ffb454", puntos: [[16, 0], [16, 1], [16, 2], [16, 4]] },
  // Una zeta de cuatro por cuatro: a tres por tres se lee como una I.
  zetaA: { color: "#9fb4d6", puntos: [[15, 0], [16, 0], [17, 0], [18, 0], [17, 1], [16, 2], [15, 3], [16, 3], [17, 3], [18, 3]] },
  zetaB: { color: "#9fb4d6", puntos: [[16, 0], [17, 0], [18, 0], [19, 0], [18, 1], [17, 2], [16, 3], [17, 3], [18, 3], [19, 3]] },
  chispaA: { color: "#ffd166", puntos: [[3, 1], [17, 2], [1, 5], [18, 6]] },
  chispaB: { color: "#ffd166", puntos: [[2, 3], [16, 0], [0, 7], [19, 4]] },
} as const satisfies Record<string, { color: string; puntos: readonly Punto[] }>;
export type Extra = keyof typeof EXTRAS;

export interface Pose {
  izq: Brazo;
  der: Brazo;
  ojo: Ojo;
  /** Un cuadro hacia arriba: el salto. */
  salta?: boolean;
  /** Levanta un pie, para cambiar el peso de lado. */
  pie?: "izq" | "der";
  extra?: Extra;
}

const AZUL = "#39a9f6";
const BRAZO_COLOR = "#2389e0";
const BLANCO = "#f1faff";
const PUPILA = "#0e2c47";

export interface Cuadro {
  x: number;
  y: number;
  c: string;
}

/** A dónde mira cuando sigue el ratón. "" es «a donde diga la postura». */
export type Mirada = "" | "izq" | "der" | "bajo";

/**
 * Los cuadros de una postura.
 *
 * `mirada` solo se aplica si la postura tiene el ojo abierto de frente: una
 * que está tecleando (mira abajo) o parpadeando no gira el ojo por el ratón.
 */
export function cuadrosDe(pose: Pose, mirada: Mirada = ""): Cuadro[] {
  const sube = pose.salta ? 1 : 0;
  const ojo: Ojo = pose.ojo === "abierto" && mirada ? mirada : pose.ojo;
  const parpado = ojo in PARPADOS ? PARPADOS[ojo as keyof typeof PARPADOS] : null;
  const pupila = parpado ?? OJOS[ojo as keyof typeof OJOS];
  const esPupila = (x: number, y: number) => pupila.some(([px, py]) => px === x && py === y);
  const out: Cuadro[] = [];
  CUERPO.forEach((fila, y) => {
    // El pie levantado: a esa pierna le falta la última fila.
    if (y === CUERPO.length - 1 && pose.pie) fila = pose.pie === "izq" ? `.......${fila.slice(7)}` : `${fila.slice(0, 13)}.......`;
    for (let x = 0; x < fila.length; x++) {
      const ch = fila[x];
      if (ch === ".") continue;
      const c = esPupila(x, y) ? PUPILA : ch === "W" && !parpado ? BLANCO : AZUL;
      out.push({ x, y: y + AIRE - sube, c });
    }
  });
  for (const [x, y] of BRAZOS[pose.izq]) out.push({ x, y: y + AIRE - sube, c: BRAZO_COLOR });
  for (const [x, y] of BRAZOS[pose.der]) out.push({ x: ANCHO - 1 - x, y: y + AIRE - sube, c: BRAZO_COLOR });
  if (pose.extra) for (const [x, y] of EXTRAS[pose.extra].puntos) out.push({ x, y, c: EXTRAS[pose.extra].color });
  return out;
}

/* ── los guiones ──────────────────────────────────────────────────────────── */

/** Una postura y cuántos milisegundos se queda. */
export type Paso = readonly [Pose, number];

export interface Guion {
  /** Lo que se repite mientras dure el ánimo. */
  bucle: readonly Paso[];
  /** Lo que se ve UNA vez al llegar a este ánimo. */
  entrada?: readonly Paso[];
  /** Gestos que salen de vez en cuando, uno al azar. */
  gestos?: ReadonlyArray<readonly Paso[]>;
  /** Cada cuánto sale un gesto: entre tanto y tanto, en milisegundos. */
  cada?: readonly [number, number];
}

const p = (izq: Brazo, der: Brazo, ojo: Ojo = "abierto", mas: Partial<Pose> = {}): Pose => ({ izq, der, ojo, ...mas });
const REPOSO = p("abajo", "abajo");
const SALTITO: readonly Paso[] = [
  [p("arriba", "arriba", "feliz", { salta: true, extra: "chispaA" }), 170],
  [p("arriba", "arriba", "feliz", { extra: "chispaB" }), 150],
];

export const GUIONES: Record<Animo, Guion> = {
  // Nada te reclama: respira, parpadea, y de vez en cuando hace algo.
  quieta: {
    bucle: [
      [REPOSO, 3200],
      [p("abajo", "abajo", "cerrado"), 130],
    ],
    gestos: [
      // Mira a un lado y al otro.
      [[p("abajo", "abajo", "izq"), 620], [REPOSO, 240], [p("abajo", "abajo", "der"), 620], [REPOSO, 300]],
      // Se estira.
      [[p("recto", "recto", "cerrado"), 320], [p("arriba", "arriba", "cerrado"), 620], [p("recto", "recto"), 260]],
      // Cambia el peso de un pie al otro.
      [[p("abajo", "abajo", "abierto", { pie: "izq" }), 260], [REPOSO, 180], [p("abajo", "abajo", "abierto", { pie: "der" }), 260], [REPOSO, 180]],
      // Te saluda un momento.
      [[p("abajo", "arriba"), 200], [p("abajo", "saluda"), 200], [p("abajo", "arriba"), 200], [p("abajo", "saluda"), 200]],
    ],
    cada: [6000, 11000],
  },
  // Tus agentes trabajan: teclea, y a ratos levanta la vista para pensar.
  trabaja: {
    bucle: [
      [p("teclaA", "teclaB", "bajo"), 170],
      [p("teclaB", "teclaA", "bajo"), 170],
    ],
    gestos: [
      // Piensa mirando arriba.
      [[p("abajo", "medio", "arriba"), 950], [p("abajo", "abajo", "arriba"), 450]],
      // Levanta la vista y parpadea.
      [[REPOSO, 520], [p("abajo", "abajo", "cerrado"), 130], [REPOSO, 320]],
      // Estira los dedos.
      [[p("recto", "recto", "cerrado"), 300], [p("recto", "recto", "bajo"), 260]],
    ],
    cada: [4500, 8500],
  },
  // Alguien te espera: se asusta al enterarse, y luego no para de llamarte.
  espera: {
    entrada: [
      [p("abajo", "abajo", "grande", { salta: true, extra: "alerta" }), 230],
      [p("abajo", "abajo", "grande", { extra: "alerta" }), 200],
    ],
    bucle: [
      [p("abajo", "arriba", "abierto", { extra: "alerta" }), 280],
      [p("abajo", "saluda"), 280],
      [p("abajo", "arriba", "abierto", { extra: "alerta" }), 280],
      [p("abajo", "saluda"), 280],
    ],
    gestos: [
      // Salta con los dos brazos para que la veas.
      [
        [p("arriba", "arriba", "grande", { salta: true, extra: "alerta" }), 180],
        [p("arriba", "arriba"), 150],
        [p("arriba", "arriba", "grande", { salta: true, extra: "alerta" }), 180],
        [p("abajo", "arriba"), 150],
      ],
    ],
    cada: [2600, 4600],
  },
  // Un agente terminó y no lo has visto: lo celebra.
  lista: {
    entrada: [...SALTITO, ...SALTITO, ...SALTITO],
    bucle: [
      [p("arriba", "arriba", "feliz", { extra: "chispaA" }), 620],
      [p("arriba", "arriba", "feliz", { extra: "chispaB" }), 620],
    ],
    gestos: [SALTITO, [[p("abajo", "saluda", "feliz"), 220], [p("abajo", "arriba", "feliz"), 220], [p("abajo", "saluda", "feliz"), 220]]],
    cada: [3200, 6000],
  },
  // No hay terminales: duerme, con sus zetas.
  dormida: {
    bucle: [
      [p("abajo", "abajo", "cerrado", { extra: "zetaA" }), 1100],
      [p("abajo", "abajo", "cerrado", { extra: "zetaB" }), 1100],
      [p("abajo", "abajo", "cerrado"), 700],
    ],
  },
};

/** Lo que hace cuando la tocas o te acercas, sea cual sea su ánimo. */
export const REACCIONES = {
  // La pulsas: un brinco contento.
  toque: [
    [p("abajo", "abajo", "feliz", { salta: true }), 150],
    [p("arriba", "arriba", "feliz"), 150],
    [p("abajo", "abajo", "feliz"), 120],
  ],
  // Pasas el ratón por encima: te mira y te saluda.
  hola: [
    [p("abajo", "arriba"), 170],
    [p("abajo", "saluda"), 170],
    [p("abajo", "arriba"), 170],
    [p("abajo", "saluda"), 170],
  ],
} as const satisfies Record<string, readonly Paso[]>;
export type Reaccion = keyof typeof REACCIONES;

/** La postura de un ánimo cuando no se anima nada (modo rendimiento). */
export function reposoDe(animo: Animo): Pose {
  return GUIONES[animo].bucle[0][0];
}

/* ── quién decide el fotograma ────────────────────────────────────────────── */

/** Por dónde va la animación. */
export interface Marcha {
  animo: Animo;
  /** Los pasos que quedan por enseñar antes de volver a pensar. */
  cola: readonly Paso[];
  pose: Pose;
  /** A partir de cuándo puede salir el siguiente gesto. */
  proximoGesto: number;
}

/** Un número entre `de` y `a` según `azar` (que da de 0 a 1). */
const entre = ([de, a]: readonly [number, number], azar: () => number) => de + Math.round((a - de) * azar());

/** Empieza un ánimo: primero su entrada, si tiene, y luego su bucle. */
export function arrancar(animo: Animo, ahora: number, azar: () => number): Marcha {
  const g = GUIONES[animo];
  return {
    animo,
    cola: [...(g.entrada ?? []), ...g.bucle],
    pose: (g.entrada ?? g.bucle)[0][0],
    proximoGesto: ahora + (g.cada ? entre(g.cada, azar) : Infinity),
  };
}

/**
 * El siguiente fotograma y cuánto se queda.
 *
 * Cuando se acaba lo que había en la cola, toca el bucle otra vez; y si ya ha
 * pasado el rato, antes del bucle va un gesto al azar. Un gesto nunca corta un
 * bucle a medias: sale entre vuelta y vuelta.
 */
export function avanzar(m: Marcha, ahora: number, azar: () => number): { marcha: Marcha; espera: number } {
  const g = GUIONES[m.animo];
  let cola = m.cola;
  let proximoGesto = m.proximoGesto;
  if (cola.length === 0) {
    if (g.gestos?.length && g.cada && ahora >= proximoGesto) {
      const gesto = g.gestos[Math.min(g.gestos.length - 1, Math.floor(azar() * g.gestos.length))];
      cola = [...gesto, ...g.bucle];
      proximoGesto = ahora + entre(g.cada, azar);
    } else cola = g.bucle;
  }
  const [pose, espera] = cola[0];
  return { marcha: { animo: m.animo, cola: cola.slice(1), pose, proximoGesto }, espera };
}

/** Mete una reacción delante de todo: es lo siguiente que se ve. */
export function reaccionar(m: Marcha, cual: Reaccion): Marcha {
  return { ...m, cola: [...REACCIONES[cual], ...m.cola] };
}
