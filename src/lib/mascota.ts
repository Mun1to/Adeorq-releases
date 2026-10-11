// Los movimientos de la mascota: sus posturas, sus guiones y quién decide qué
// fotograma toca. El dibujo lo pinta `components/Mascota.tsx`.
//
// Se llama ADEO (Munir, 2026-10-11), y ese mismo día pidió «más animaciones y
// estados». Para verlos todos moviéndose, sin esperar a que le toque cada uno:
// `node scripts/mascota-muestra.mjs <ruta.html>` escribe una página con todos.
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
  // En jarra: sale y vuelve a la cintura.
  cadera: [[3, 6], [2, 6], [3, 7]],
  // La mano junto a la cabeza: a la oreja, o a la barbilla.
  oreja: [[3, 5], [3, 4], [4, 3]],
  // La mano encima de la cabeza: apuro, o rascarse.
  cabeza: [[3, 4], [4, 3], [5, 1]],
  // Estirado y un poco hacia arriba: una ola, bailando.
  ola: [[3, 6], [2, 5], [1, 4]],
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
/** Cerrado es una raya; feliz, un arco hacia arriba; triste, hacia abajo. En
    ninguno hay blanco. */
const PARPADOS = {
  cerrado: [[8, 4], [9, 4], [10, 4], [11, 4]],
  feliz: [[8, 4], [9, 3], [10, 3], [11, 4]],
  triste: [[8, 3], [9, 4], [10, 4], [11, 3]],
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
  // Lo que piensa: tres bolitas que le suben de la cabeza, cada una más grande.
  piensaA: { color: "#cfe3ff", puntos: [[15, 3]] },
  piensaB: { color: "#cfe3ff", puntos: [[15, 3], [16, 1]] },
  piensaC: { color: "#cfe3ff", puntos: [[15, 3], [16, 1], [18, 0], [19, 0], [18, 1], [19, 1]] },
  // Una interrogación: hay una decisión esperando y no sabe por dónde tirar.
  duda: { color: "#c9b8ff", puntos: [[16, 0], [17, 0], [18, 1], [17, 2], [17, 4]] },
  // Una gota de sudor, que le cae por un lado de la cabeza.
  gotaA: { color: "#8fd3ff", puntos: [[15, 2], [15, 3]] },
  gotaB: { color: "#8fd3ff", puntos: [[15, 3], [15, 4]] },
  // Una nota de música, a un lado y al otro.
  notaA: { color: "#ffd166", puntos: [[3, 0], [4, 0], [3, 1], [2, 2], [3, 2]] },
  notaB: { color: "#ffd166", puntos: [[16, 1], [17, 1], [16, 2], [15, 3], [16, 3]] },
  // Lo que le llega al oído mientras escribes.
  ondaA: { color: "#9fd0ff", puntos: [[1, 4], [1, 6]] },
  ondaB: { color: "#9fd0ff", puntos: [[1, 4], [1, 6], [0, 3], [0, 5], [0, 7]] },
  // Un corazón: la has tocado varias veces seguidas.
  corazon: { color: "#ff7a9c", puntos: [[16, 0], [18, 0], [16, 1], [17, 1], [18, 1], [17, 2]] },
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
  /** Lo que tiene delante, y le tapa lo que caiga detrás. */
  cosa?: Cosa;
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

/* ── lo que tiene delante ─────────────────────────────────────────────────────
   Una COSA está delante de Adeo y tapa lo que cae detrás: sus cuadros se
   pintan, y los del cuerpo o de los brazos que coincidan con ellos, no. Nació
   para el teclado: «trabaja» tecleaba en el aire moviendo un cuadro de cada
   mano, y Munir lo rechazó dos veces el 2026-10-11 hasta decirlo él: «haz como
   si estuviese escribiendo en un teclado». Se queda detrás de él, con las
   piernas tapadas, y baja las manos a sus dos extremos. */
const TABLA = "#56658a";
const TECLA = "#e6edfa";
const PULSADA = "#7ee08a";

/**
 * El teclado: una tabla de 18 × 3 al pie de la rejilla, con dos filas de teclas
 * a tresbolillo y la barra espaciadora debajo. `pulsadas` son las columnas de
 * la fila de arriba que se están pulsando: se encienden.
 */
function teclado(pulsadas: readonly number[] = []): Cuadro[] {
  const FILAS = [
    [2, 4, 6, 8, 11, 13, 15, 17],
    [3, 5, 7, 9, 10, 12, 14, 16],
    [6, 7, 8, 9, 10, 11, 12, 13],
  ];
  const out: Cuadro[] = [];
  FILAS.forEach((teclas, i) => {
    for (let x = 1; x <= ANCHO - 2; x++) {
      const c = i === 0 && pulsadas.includes(x) ? PULSADA : teclas.includes(x) ? TECLA : TABLA;
      out.push({ x, y: ALTO - FILAS.length + i, c });
    }
  });
  return out;
}

const COSAS = {
  teclado: teclado(),
  tecladoIzq: teclado([1, 2]),
  tecladoDer: teclado([17, 18]),
  tecladoDos: teclado([1, 2, 17, 18]),
} satisfies Record<string, Cuadro[]>;
export type Cosa = keyof typeof COSAS;

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
  // Lo que tiene delante: va al final, y nada se pinta debajo.
  const delante = pose.cosa ? COSAS[pose.cosa] : [];
  const tapado = new Set(delante.map((q) => `${q.x},${q.y}`));
  const pon = (x: number, y: number, c: string) => {
    if (!tapado.has(`${x},${y}`)) out.push({ x, y, c });
  };
  CUERPO.forEach((fila, y) => {
    // El pie levantado: a esa pierna le falta la última fila.
    if (y === CUERPO.length - 1 && pose.pie) fila = pose.pie === "izq" ? `.......${fila.slice(7)}` : `${fila.slice(0, 13)}.......`;
    for (let x = 0; x < fila.length; x++) {
      const ch = fila[x];
      if (ch === ".") continue;
      pon(x, y + AIRE - sube, esPupila(x, y) ? PUPILA : ch === "W" && !parpado ? BLANCO : AZUL);
    }
  });
  for (const [x, y] of BRAZOS[pose.izq]) pon(x, y + AIRE - sube, BRAZO_COLOR);
  for (const [x, y] of BRAZOS[pose.der]) pon(ANCHO - 1 - x, y + AIRE - sube, BRAZO_COLOR);
  if (pose.extra) for (const [x, y] of EXTRAS[pose.extra].puntos) pon(x, y, EXTRAS[pose.extra].color);
  out.push(...delante);
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
      // Se pone en jarra y se balancea.
      [[p("cadera", "cadera", "abierto", { pie: "izq" }), 300], [p("cadera", "cadera"), 200], [p("cadera", "cadera", "abierto", { pie: "der" }), 300], [p("cadera", "cadera"), 200]],
      // Mira arriba, a ver qué pasa por ahí.
      [[p("abajo", "abajo", "arriba"), 700], [REPOSO, 240]],
      // Te guiña el ojo.
      [[p("abajo", "abajo", "feliz"), 280], [REPOSO, 200]],
    ],
    cada: [6000, 11000],
  },
  // Tus agentes trabajan: teclea en su teclado, una mano y luego la otra, y la
  // tecla de debajo se enciende. Cada pocas pulsaciones baja las dos a la vez.
  trabaja: {
    // La mano que no pulsa se queda un cuadro por encima de las teclas, no con
    // el brazo estirado: con el brazo en cruz parecía que señalaba, no que
    // tecleaba. Lo que se ve de lejos es la tecla que se enciende.
    bucle: [
      [p("teclaB", "teclaA", "bajo", { cosa: "tecladoIzq" }), 130],
      [p("teclaA", "teclaB", "bajo", { cosa: "tecladoDer" }), 130],
      [p("teclaB", "teclaA", "bajo", { cosa: "tecladoIzq" }), 130],
      [p("teclaA", "teclaB", "bajo", { cosa: "tecladoDer" }), 130],
      [p("teclaB", "teclaB", "bajo", { cosa: "tecladoDos" }), 150],
      [p("teclaA", "teclaA", "bajo", { cosa: "teclado" }), 110],
    ],
    gestos: [
      // Se para a pensar la frase, con una mano en la barbilla y la otra en las teclas.
      [
        [p("teclaB", "oreja", "arriba", { cosa: "teclado" }), 700],
        [p("teclaB", "oreja", "izq", { cosa: "teclado" }), 350],
        [p("teclaB", "oreja", "arriba", { cosa: "teclado" }), 300],
      ],
      // Una ráfaga: teclea a toda prisa.
      [
        [p("teclaA", "teclaB", "cerrado", { cosa: "tecladoDer" }), 105],
        [p("teclaB", "teclaA", "cerrado", { cosa: "tecladoIzq" }), 105],
        [p("teclaA", "teclaB", "cerrado", { cosa: "tecladoDer" }), 105],
        [p("teclaB", "teclaA", "cerrado", { cosa: "tecladoIzq" }), 105],
        [p("teclaA", "teclaB", "cerrado", { cosa: "tecladoDer" }), 105],
        [p("teclaB", "teclaA", "cerrado", { cosa: "tecladoIzq" }), 105],
        [p("teclaA", "teclaB", "cerrado", { cosa: "tecladoDer" }), 105],
        [p("teclaB", "teclaA", "cerrado", { cosa: "tecladoIzq" }), 105],
      ],
      // Le da al intro con ganas: las dos manos arriba, abajo, y chispas.
      [
        [p("arriba", "arriba", "abierto", { cosa: "teclado" }), 220],
        [p("teclaB", "teclaB", "feliz", { cosa: "tecladoDos" }), 200],
        [p("recto", "recto", "feliz", { cosa: "teclado", extra: "chispaA" }), 260],
      ],
      // Se cruje los dedos antes de seguir.
      [
        [p("recto", "recto", "cerrado", { cosa: "teclado" }), 300],
        [p("ola", "ola", "cerrado", { cosa: "teclado" }), 260],
        [p("recto", "recto", "bajo", { cosa: "teclado" }), 200],
      ],
      // Se seca el sudor de la frente sin soltar el teclado.
      [
        [p("teclaB", "cabeza", "cerrado", { cosa: "teclado", extra: "gotaA" }), 340],
        [p("teclaB", "medio", "cerrado", { cosa: "teclado" }), 260],
      ],
    ],
    cada: [4000, 7500],
  },
  // El conserje está contestando: mira arriba con la mano en la barbilla y le
  // van saliendo las bolitas de pensar. Es lo que se ve en el chat en vez de un
  // punto que late (Munir, 2026-10-11: «es la mascota que piensa y trabaja»).
  piensa: {
    bucle: [
      [p("abajo", "medio", "arriba", { extra: "piensaA" }), 380],
      [p("abajo", "medio", "arriba", { extra: "piensaB" }), 380],
      [p("abajo", "medio", "arriba", { extra: "piensaC" }), 620],
      [p("abajo", "medio", "arriba"), 260],
    ],
    gestos: [
      // Busca la idea a un lado y al otro.
      [[p("abajo", "medio", "izq"), 520], [p("abajo", "medio", "der"), 520], [p("abajo", "medio", "arriba"), 240]],
      // Se rasca la cabeza con los ojos cerrados.
      [[p("abajo", "arriba", "cerrado"), 230], [p("abajo", "saluda", "cerrado"), 230], [p("abajo", "arriba", "cerrado"), 230], [p("abajo", "saluda", "cerrado"), 230]],
      // Se le ocurre algo: da un respingo, y a seguir pensando.
      [[p("abajo", "abajo", "grande", { salta: true, extra: "chispaA" }), 190], [p("arriba", "arriba", "feliz", { extra: "chispaB" }), 210], [p("abajo", "medio", "arriba"), 260]],
      // Cambia el peso de pie mientras le da vueltas.
      [[p("abajo", "medio", "arriba", { pie: "izq" }), 300], [p("abajo", "medio", "arriba"), 200], [p("abajo", "medio", "arriba", { pie: "der" }), 300]],
    ],
    cada: [3200, 6200],
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
      // Se pone en jarra y da golpecitos con el pie: lleva un rato esperándote.
      [
        [p("cadera", "cadera", "abierto", { pie: "der", extra: "alerta" }), 220],
        [p("cadera", "cadera", "abierto", { extra: "alerta" }), 180],
        [p("cadera", "cadera", "abierto", { pie: "der", extra: "alerta" }), 220],
        [p("cadera", "cadera", "abierto", { extra: "alerta" }), 180],
      ],
    ],
    cada: [2600, 4600],
  },
  // Hay una decisión esperándote en Decisiones: no sabe por dónde tirar hasta
  // que elijas. Una interrogación, y la mano en la barbilla.
  duda: {
    entrada: [
      [p("abajo", "abajo", "grande", { salta: true, extra: "duda" }), 200],
      [p("abajo", "abajo", "arriba", { extra: "duda" }), 260],
    ],
    bucle: [
      [p("cadera", "oreja", "arriba", { extra: "duda" }), 700],
      [p("cadera", "oreja", "izq", { extra: "duda" }), 500],
      [p("cadera", "oreja", "der", { extra: "duda" }), 500],
    ],
    gestos: [
      // Se encoge de hombros.
      [[p("recto", "recto", "arriba", { extra: "duda" }), 320], [p("medio", "medio", "abierto", { extra: "duda" }), 320], [p("recto", "recto", "arriba", { extra: "duda" }), 320]],
      // Te mira y te señala la pregunta.
      [[p("abajo", "saluda", "abierto", { extra: "duda" }), 260], [p("abajo", "arriba", "abierto", { extra: "duda" }), 260], [p("abajo", "saluda", "abierto", { extra: "duda" }), 260]],
      // Se rasca la cabeza.
      [[p("abajo", "cabeza", "cerrado", { extra: "duda" }), 240], [p("abajo", "arriba", "cerrado", { extra: "duda" }), 240], [p("abajo", "cabeza", "cerrado", { extra: "duda" }), 240]],
    ],
    cada: [3000, 5600],
  },
  // Algo ha fallado (el conserje no pudo contestar, o un encargo programado se
  // ha parado): se lleva las manos a la cabeza, y le cae la gota.
  apurada: {
    entrada: [
      [p("abajo", "abajo", "grande", { salta: true }), 180],
      [p("cabeza", "cabeza", "grande", { extra: "gotaA" }), 260],
    ],
    bucle: [
      [p("cabeza", "cabeza", "triste", { extra: "gotaA" }), 520],
      [p("cabeza", "cabeza", "triste", { extra: "gotaB" }), 520],
    ],
    gestos: [
      // Mira a los lados, por si alguien lo ha visto.
      [[p("cabeza", "cabeza", "izq"), 420], [p("cabeza", "cabeza", "der"), 420]],
      // Se seca el sudor y respira hondo.
      [[p("abajo", "cabeza", "cerrado", { extra: "gotaA" }), 300], [p("abajo", "medio", "cerrado"), 300], [p("abajo", "abajo", "triste"), 420]],
      // Da dos pisotones, en jarra.
      [[p("cadera", "cadera", "triste", { pie: "izq" }), 200], [p("cadera", "cadera", "triste"), 160], [p("cadera", "cadera", "triste", { pie: "der" }), 200], [p("cadera", "cadera", "triste"), 160]],
    ],
    cada: [3200, 6000],
  },
  // Estás escribiendo en el chat: te atiende, con la mano en la oreja.
  escucha: {
    bucle: [
      [p("oreja", "abajo", "abierto", { extra: "ondaA" }), 420],
      [p("oreja", "abajo", "abierto", { extra: "ondaB" }), 420],
      [p("oreja", "abajo"), 300],
    ],
    gestos: [
      // Asiente.
      [[p("oreja", "abajo", "cerrado"), 160], [p("oreja", "abajo", "feliz", { salta: true }), 160], [p("oreja", "abajo"), 200]],
      // Mira lo que vas escribiendo.
      [[p("oreja", "medio", "bajo"), 600], [p("oreja", "abajo"), 240]],
    ],
    cada: [2600, 4800],
  },
  // Suena música y nadie te reclama: baila.
  baila: {
    bucle: [
      [p("arriba", "abajo", "feliz", { pie: "izq", extra: "notaA" }), 300],
      [p("ola", "ola"), 220],
      [p("abajo", "arriba", "feliz", { pie: "der", extra: "notaB" }), 300],
      [p("ola", "ola"), 220],
    ],
    gestos: [
      // Brazos arriba y salto.
      [[p("arriba", "arriba", "feliz", { salta: true, extra: "notaA" }), 200], [p("recto", "recto", "feliz", { extra: "notaB" }), 200], [p("arriba", "arriba", "feliz", { salta: true, extra: "notaA" }), 200]],
      // Pasito a un lado y al otro, en jarra.
      [[p("cadera", "cadera", "izq", { pie: "izq" }), 240], [p("cadera", "cadera"), 160], [p("cadera", "cadera", "der", { pie: "der" }), 240], [p("cadera", "cadera"), 160]],
      // Guitarra de aire.
      [[p("medio", "teclaA", "cerrado", { extra: "notaB" }), 220], [p("medio", "teclaB", "cerrado"), 220], [p("medio", "teclaA", "cerrado", { extra: "notaA" }), 220], [p("medio", "teclaB", "cerrado"), 220]],
    ],
    cada: [3600, 6400],
  },
  // Un agente terminó y no lo has visto: lo celebra.
  lista: {
    entrada: [...SALTITO, ...SALTITO, ...SALTITO],
    bucle: [
      [p("arriba", "arriba", "feliz", { extra: "chispaA" }), 620],
      [p("arriba", "arriba", "feliz", { extra: "chispaB" }), 620],
    ],
    gestos: [
      SALTITO,
      [[p("abajo", "saluda", "feliz"), 220], [p("abajo", "arriba", "feliz"), 220], [p("abajo", "saluda", "feliz"), 220]],
      // El baile de la victoria: un brazo y un pie cada vez.
      [
        [p("arriba", "abajo", "feliz", { pie: "izq", extra: "chispaA" }), 200],
        [p("abajo", "arriba", "feliz", { pie: "der", extra: "chispaB" }), 200],
        [p("arriba", "abajo", "feliz", { pie: "izq", extra: "chispaA" }), 200],
        [p("abajo", "arriba", "feliz", { pie: "der", extra: "chispaB" }), 200],
      ],
    ],
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
  // Le mandas algo (el chat del móvil): lo mira subir y se queda contenta.
  enviado: [
    [p("abajo", "medio", "arriba"), 170],
    [p("abajo", "arriba", "arriba"), 170],
    [p("abajo", "abajo", "feliz"), 240],
  ],
  // La tocas tres veces seguidas: le sale un corazón.
  mimo: [
    [p("abajo", "abajo", "feliz", { extra: "corazon" }), 260],
    [p("arriba", "arriba", "feliz", { salta: true, extra: "corazon" }), 200],
    [p("abajo", "abajo", "feliz", { extra: "corazon" }), 320],
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
