import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useReactFlow, useViewport } from "@xyflow/react";
import { getStroke } from "perfect-freehand";
import rough from "roughjs/bin/rough";
import { useT } from "../lib/i18n";
import { escribiendoTexto } from "../lib/atajos";
import type { FontId } from "../lib/piezas";

// Dibujo libre sobre el lienzo, estilo Excalidraw: flechas, recuadros, notas a
// mano alzada y texto suelto, encima de las terminales y de los widgets.
//
// Por qué propio y no Excalidraw embebido: Excalidraw trae su PROPIO lienzo con
// su propio zoom y su propio panning. Meterlo dentro de React Flow es tener dos
// cámaras que hay que mantener sincronizadas a mano; en cuanto una se desfasa
// medio píxel, la flecha que rodeaba una terminal deja de rodearla. Aquí los
// trazos se guardan en coordenadas DEL LIENZO y se pintan con el mismo
// viewport que los nodos, así que la flecha señala lo mismo con cualquier zoom
// y se exporta en el mismo archivo. Son ~250 líneas frente a una dependencia
// de 900 KB, y el día que haga falta más (capas, selección múltiple) esto no
// impide meter Excalidraw en una pestaña aparte.

export type DrawTool =
  | "sel"
  | "marco"
  | "lapiz"
  | "flecha"
  | "linea"
  | "caja"
  | "rombo"
  | "elipse"
  | "texto"
  | "goma";

/** Las que dejan trazo. Existe para que el validador del archivo no tenga su
    propia lista de strings sueltos: era la quinta copia de esta misma lista, y
    la única que el compilador no protegía. */
export const FIGURAS = ["lapiz", "flecha", "linea", "caja", "rombo", "elipse", "texto"] as const;

export interface Trazo {
  id: string;
  t: (typeof FIGURAS)[number];
  color: string;
  /** Grosor en unidades del lienzo (escala con el zoom, como los nodos). */
  w: number;
  /** lápiz: pares x,y. El resto: [x1,y1,x2,y2]. texto: [x,y]. */
  p: number[];
  txt?: string;
  /** Con halo, como cuando algo está seleccionado, pero para siempre. Sirve
      para que un trazo destaque sobre una captura clara o sobre el código de
      una terminal, donde una línea fina se pierde. */
  glow?: boolean;
  /** El relleno de una caja o una elipse, si lo tiene.
   *
   *  Se guarda la OPACIDAD y no un color: el relleno siempre es el color del
   *  trazo, más o menos transparente. Dos colores por figura obligarían a dos
   *  paletas en la barra, y en un tablero de trabajo lo que se quiere es tapar
   *  el fondo detrás de una nota, no combinar colores. `0` o sin poner es hueca,
   *  que es como nacen. */
  relleno?: number;
  /** Solo para el texto: con qué tipografía se escribe. */
  font?: FontId;
  /** Los extremos de una flecha o una línea, cuando están pegados a una pieza. */
  anclaDe?: Ancla;
  anclaA?: Ancla;
  /** Dibujado a mano alzada, con el trazo tembloroso de un boceto. */
  rugoso?: boolean;
  /** El dado de ese temblor.
   *
   *  Se guarda, y esto no es opcional: RoughJS es aleatorio, así que sin un
   *  número fijo la misma caja tiembla distinto en cada repintado y el tablero
   *  entero parece hervir mientras mueves el ratón. Es EL detalle que separa un
   *  boceto de un error. */
  seed?: number;
}

/**
 * Un extremo pegado a una pieza del lienzo.
 *
 * Se guarda EN PROPORCIÓN a su caja (0 es el borde de arriba o de la izquierda,
 * 1 el de abajo o el de la derecha) y no en coordenadas absolutas. Es lo que
 * hace Excalidraw en `binding.ts`, y el motivo es que así el extremo sobrevive
 * a mover la pieza Y a redimensionarla: una flecha que apuntaba al centro de una
 * terminal le sigue apuntando al centro después de estirarla.
 */
export interface Ancla {
  /** El id del nodo de React Flow. */
  nodo: string;
  rx: number;
  ry: number;
}

/**
 * Cuánto se puede fallar apuntando y que aun así se alinee solo, en píxeles de
 * PANTALLA. Es el `SNAP_DISTANCE` de Excalidraw, y como todos los umbrales de
 * aquí se divide por el zoom: el imán tiene que sentirse igual de fuerte con el
 * tablero cerca y lejos. Ocho es suficiente para acertar sin querer y poco para
 * estorbar cuando de verdad quieres poner algo torcido.
 */
export const IMAN = 8;

/** A qué valores merece la pena alinearse en cada eje: los dos bordes y el
    centro de cada caja. Lo mismo que hace Figma, y es lo que hace que un
    tablero hecho a mano parezca ordenado sin haberlo medido. */
export function guiasDe(cajas: Iterable<Caja>): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const c of cajas) {
    xs.push(c.x, c.x + c.w / 2, c.x + c.w);
    ys.push(c.y, c.y + c.h / 2, c.y + c.h);
  }
  return { xs, ys };
}

/** El valor imantado más cercano, o el original si no hay ninguno a tiro. */
export function imantar(v: number, candidatos: number[], umbral: number): number {
  let mejor = v;
  let d = umbral;
  for (const c of candidatos) {
    const dd = Math.abs(v - c);
    if (dd < d) {
      d = dd;
      mejor = c;
    }
  }
  return mejor;
}

/** Dónde cae ese ancla ahora mismo, en coordenadas del lienzo. */
export function puntoDeAncla(a: Ancla, cajas: Map<string, Caja>): [number, number] | null {
  const c = cajas.get(a.nodo);
  if (!c) return null;
  return [c.x + c.w * a.rx, c.y + c.h * a.ry];
}

/** Qué pieza hay bajo un punto, y en qué proporción de ella cae.
 *
 *  Se recorre al revés porque el último de la lista es el que se pinta encima:
 *  si dos piezas se solapan, gana la que está a la vista. */
export function anclaEn(x: number, y: number, cajas: Map<string, Caja>): Ancla | undefined {
  const entradas = [...cajas.entries()].reverse();
  for (const [nodo, c] of entradas) {
    if (x < c.x || x > c.x + c.w || y < c.y || y > c.y + c.h) continue;
    if (c.w <= 0 || c.h <= 0) continue;
    return { nodo, rx: (x - c.x) / c.w, ry: (y - c.y) / c.h };
  }
  return undefined;
}

/** Los iconos van en SVG y no en glifos de texto: «⌖», «╱» y «⌫» dependen de
    la fuente que tenga el sistema, salen de tamaños distintos entre sí y en un
    equipo sin esa fuente aparecen como un cuadrado. Dibujados, siempre son
    ocho iconos del mismo peso. */
const Ico = ({ d }: { d: string }) => (
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const DRAW_TOOLS: Array<{ t: DrawTool; icon: ReactElement; label: string }> = [
  { t: "sel", icon: <Ico d="M4 2 L4 14 L7.2 11 L9.4 15 L11.2 14.1 L9.1 10.4 L13.5 10 Z" />, label: "Mover y seleccionar" },
  {
    t: "marco",
    icon: (
      <Ico d="M3 6 V4.4 a1.4 1.4 0 0 1 1.4 -1.4 H6 M10 3 h1.6 a1.4 1.4 0 0 1 1.4 1.4 V6 M13 10 v1.6 a1.4 1.4 0 0 1 -1.4 1.4 H10 M6 13 H4.4 a1.4 1.4 0 0 1 -1.4 -1.4 V10" />
    ),
    label: "Rodear varias a la vez",
  },
  { t: "lapiz", icon: <Ico d="M2.6 13.4 L3.3 10.6 L10.7 3.2 L12.8 5.3 L5.4 12.7 Z M9.6 4.3 L11.7 6.4" />, label: "Lápiz" },
  { t: "flecha", icon: <Ico d="M3 13 L13 3 M13 3 L8.4 3.4 M13 3 L12.6 7.6" />, label: "Flecha" },
  { t: "linea", icon: <Ico d="M3 13 L13 3" />, label: "Línea" },
  { t: "caja", icon: <Ico d="M2.5 4 h11 a1 1 0 0 1 1 1 v6 a1 1 0 0 1 -1 1 h-11 a1 1 0 0 1 -1 -1 v-6 a1 1 0 0 1 1 -1 z" />, label: "Recuadro" },
  { t: "rombo", icon: <Ico d="M8 1.8 L14.2 8 L8 14.2 L1.8 8 Z" />, label: "Rombo" },
  { t: "elipse", icon: <Ico d="M8 3.2 c3.6 0 6.2 2.1 6.2 4.8 c0 2.7 -2.6 4.8 -6.2 4.8 c-3.6 0 -6.2 -2.1 -6.2 -4.8 c0 -2.7 2.6 -4.8 6.2 -4.8 z" />, label: "Elipse" },
  { t: "texto", icon: <Ico d="M3 3.6 h10 M8 3.6 v9 M6 12.6 h4" />, label: "Texto" },
  { t: "goma", icon: <Ico d="M6.4 12.8 L2.6 9 a1 1 0 0 1 0 -1.4 l5.2 -5.2 a1 1 0 0 1 1.4 0 l3.8 3.8 a1 1 0 0 1 0 1.4 l-4.4 4.4 z M13.4 12.8 h-7" />, label: "Borrar trazos" },
];

export const DRAW_COLORS = ["#ff6b6b", "#ffd166", "#6fe0bb", "#5fd0ff", "#c4b5fd", "#e6edf7"];
export const DRAW_WIDTHS = [2, 4, 8];

/**
 * Cuánto se puede fallar apuntando a un trazo, en píxeles de PANTALLA.
 *
 * Se divide por el zoom en cada uso, que es la regla de Excalidraw y la que hace
 * que un lienzo se sienta bien: el margen de error tiene que ser el mismo para
 * el dedo, no para el tablero. Un umbral en unidades del lienzo es generoso
 * alejado e imposible de acertar de cerca.
 *
 * Es UNA constante porque hay dos maneras de saber si le has dado a un trazo, y
 * tienen que decir lo mismo. Agarrar lo resuelve el navegador con un camino
 * transparente y grueso (`pointer-events: stroke`), que es gratis y exacto;
 * borrar tiene que hacer la cuenta a mano, porque con la goma puesta la capa se
 * queda todos los eventos y ningún trazo llega a recibirlos. Antes eran 12 por
 * un lado y 22 de grosor —o sea 11 de radio— por el otro: casi lo mismo, pero
 * dos números sueltos que nadie sabía que iban emparejados.
 */
export const ALCANCE_RATON = 12;

/** Las tipografías del texto del lienzo.
 *
 *  Cinco y de familias distintas, no quince parecidas: en un tablero la letra
 *  sirve para separar un título de una nota al margen, y para eso hace falta
 *  que se distingan de un vistazo. Todas son fuentes que Windows ya trae, así
 *  que ningún tablero depende de que instales nada.
 *  El `ancho` es cuánto ocupa cada letra respecto a su alto, y se usa para
 *  saber dónde está el texto cuando lo agarras o lo borras. */
export const DRAW_FONTS: Array<{ id: FontId; label: string; css: string; ancho: number }> = [
  { id: "app", label: "De la app", css: "inherit", ancho: 0.55 },
  { id: "mono", label: "De terminal", css: 'ui-monospace, "Cascadia Code", Consolas, monospace', ancho: 0.62 },
  { id: "serif", label: "Con remates", css: 'Georgia, "Times New Roman", serif', ancho: 0.52 },
  { id: "mano", label: "A mano", css: '"Segoe Script", "Comic Sans MS", cursive', ancho: 0.58 },
  { id: "titular", label: "De titular", css: '"Arial Black", Impact, sans-serif', ancho: 0.66 },
];

export type { FontId };

export function fuente(id?: FontId) {
  return DRAW_FONTS.find((f) => f.id === id) ?? DRAW_FONTS[0];
}

interface Props {
  tool: DrawTool;
  color: string;
  grosor: number;
  /** Si lo próximo que dibujes sale con halo. */
  glow: boolean;
  /** Con cuánto relleno nace la próxima caja o elipse (0 = hueca). */
  relleno: number;
  /** Si lo próximo sale con el trazo tembloroso de un boceto. */
  rugoso: boolean;
  /** Lo que ocupa cada pieza del lienzo, para poder pegarle una flecha. Lo
      manda el padre, que es quien tiene los nodos: una sola fuente para las
      cajas evita que el dibujo y el tablero discrepen medio píxel. */
  cajasNodos: Map<string, Caja>;
  /** Con qué tipografía se escribe el texto. */
  font: FontId;
  trazos: Trazo[];
  onAdd: (t: Trazo) => void;
  onBorrar: (id: string) => void;
  /** Reemplaza un trazo por su versión nueva: moverlo o reescribir su texto. */
  onCambiar: (t: Trazo) => void;
  /** Aviso de que empieza un gesto que va a cambiar algo: mover o estirar.
   *
   *  Existe por el deshacer. `onCambiar` se dispara una vez por fotograma
   *  mientras arrastras, así que si la foto se tomara ahí, arrastrar un trazo
   *  de un lado a otro dejaría cien pasos que deshacer para volver donde
   *  estabas. Este se llama UNA vez, en el pointerdown. */
  onGesto: () => void;
  /** Y al soltar, para que lo siguiente vuelva a ser un paso propio. */
  onFinGesto: () => void;
  /** Qué trazo está cogido. Vive en el padre porque la barra de arriba también
      lo necesita: los colores y el grosor pintan sobre lo seleccionado. */
  sel: string | null;
  onSel: (id: string | null) => void;
  /** Se avisa al terminar un trazo para poder volver solo a la mano. */
  onFin: () => void;
  /** Los trazos que ha cogido el marco. La selección múltiple vive en el padre
      porque incluye piezas, y las piezas no son de esta capa. */
  grupo: Set<string>;
  /** Marco soltado: qué rectángulo se ha barrido y qué trazos caen dentro. El
      padre añade sus piezas y decide, que es quien las conoce. */
  onMarco: (caja: Caja, ids: string[], sumar: boolean) => void;
  /** Mover varios trazos de golpe: así se arrastra el grupo. */
  onCambiarVarios: (ts: Trazo[]) => void;
  /** Cuánto se ha movido el grupo desde el último aviso, para que las piezas
      seleccionadas acompañen al trazo que se está arrastrando. */
  onMoverNodos: (dx: number, dy: number) => void;
}

/** Un trazo movido: todos sus puntos, desplazados lo mismo.
 *
 *  Si estaba pegado a alguna pieza, se despega: lo has cogido y lo has llevado
 *  a otro sitio, así que mandas tú. Volver a pegarlo es arrastrar su punta
 *  encima de la pieza. */
export function movido(s: Trazo, dx: number, dy: number): Trazo {
  const m = { ...s, p: s.p.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) };
  if (m.anclaDe || m.anclaA) {
    delete m.anclaDe;
    delete m.anclaA;
  }
  return m;
}

/** Un rectángulo del lienzo. Lo hablan el marco de selección, los trazos y las
    piezas, que es lo único que necesitan saber unos de otros para esto. */
export interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Si dos rectángulos se tocan.
 *
 * El marco coge lo que ROZA y no solo lo que encierra del todo: una terminal
 * ocupa media pantalla, y exigir rodearla entera obligaría a alejar el zoom
 * antes de cada selección, que es justo el trabajo que esto viene a quitar.
 */
export function seTocan(a: Caja, b: Caja): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Distancia de un punto a un segmento, para que la goma borre lo que hay
    debajo del cursor y no lo que tiene el centro más cerca (una caja grande
    tiene el centro lejos de todos sus bordes). */
function distSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const largo = dx * dx + dy * dy;
  const t = largo === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / largo));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * El lienzo de medir. Uno solo para toda la app, y nunca se pinta.
 *
 * `measureText` es la única forma de saber lo que ocupa un texto sin tenerlo ya
 * en pantalla, y crear un canvas por medición cuesta más que la medición.
 */
let medidor: CanvasRenderingContext2D | null = null;
function anchoDeTexto(txt: string, px: number, css: string): number | null {
  if (!medidor) medidor = document.createElement("canvas").getContext("2d");
  if (!medidor) return null;
  // `inherit` no significa nada fuera del DOM: para la fuente de la app se mide
  // con la misma familia que el CSS le acaba dando.
  const familia = css === "inherit" ? 'system-ui, "Segoe UI", sans-serif' : css;
  medidor.font = `${px}px ${familia}`;
  return medidor.measureText(txt).width;
}

/**
 * La caja que ocupa un texto.
 *
 * Se MIDE, no se estima. Antes se calculaba como «número de letras × alto ×
 * ancho medio de la familia», y el propio comentario admitía que se quedaba
 * corta con mayúsculas y larga con íes. El problema es que esa caja decide tres
 * cosas a la vez —dónde se puede agarrar el texto, hasta dónde llega la goma y
 * si el marco lo ha cogido—, así que un «MMMM» en Arial Black tenía la zona de
 * clic desplazada media palabra. `measureText` cuesta lo mismo y acierta.
 *
 * Si el navegador no da contexto 2D (nunca, en un WebView2), se cae a la
 * estimación de antes en vez de dejar el texto sin caja.
 */
export function cajaTexto(s: Trazo): Caja {
  const alto = 8 * s.w;
  const f = fuente(s.font);
  const lineas = (s.txt ?? "").split("\n");
  const ancho = Math.max(
    alto * 0.6,
    ...lineas.map((l) => anchoDeTexto(l, alto, f.css) ?? l.length * alto * f.ancho),
  );
  // La `y` de un <text> es su línea base, no su borde de arriba.
  return {
    x: s.p[0],
    y: s.p[1] - alto * 0.85,
    w: ancho,
    h: alto * (0.2 + lineas.length * INTERLINEA),
  };
}

/** Cuánto baja de una línea a la siguiente, en cuerpos de letra. 1,25 es el
    valor por defecto de Excalidraw para sus tipografías, y es el que hace que
    un párrafo corto se lea sin apelotonarse ni desperdigarse. */
const INTERLINEA = 1.25;

/** Lo que ocupa un trazo cualquiera, para saber si el marco lo ha pillado. */
export function cajaDe(s: Trazo): Caja {
  if (s.t === "texto") return cajaTexto(s);
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (let i = 0; i + 1 < s.p.length; i += 2) {
    x1 = Math.min(x1, s.p[i]);
    x2 = Math.max(x2, s.p[i]);
    y1 = Math.min(y1, s.p[i + 1]);
    y2 = Math.max(y2, s.p[i + 1]);
  }
  // Una línea recta no tiene grosor en una de sus dos medidas, y un rectángulo
  // de alto cero no toca nada: el grosor del trazo le da cuerpo.
  const m = s.w;
  return { x: x1 - m, y: y1 - m, w: x2 - x1 + m * 2, h: y2 - y1 + m * 2 };
}

/**
 * Un tirador de la selección: el punto que se arrastra para ESTIRAR algo, en
 * vez de moverlo entero. Lleva qué par de coordenadas toca (`ix`, `iy`), o la
 * marca `tam` si lo que cambia es el tamaño de la letra.
 */
interface Tirador {
  x: number;
  y: number;
  ix: number;
  iy: number;
  tam?: boolean;
  cursor: string;
}

/** Dónde se agarra cada figura para estirarla. */
function tiradoresDe(s: Trazo): Tirador[] {
  if (s.t === "texto") {
    // Uno solo, a la derecha de la palabra: se tira y la letra crece. Es más
    // directo que buscar el botón de tamaño en la barra de arriba.
    const c = cajaTexto(s);
    return [{ x: c.x + c.w, y: c.y + c.h, ix: 0, iy: 1, tam: true, cursor: "nwse-resize" }];
  }
  // El lápiz no lleva: son cientos de puntos y estirar uno solo deformaría el
  // garabato en vez de agrandarlo, que no es lo que nadie espera.
  if (s.t === "lapiz") return [];
  const [a, b, c, d] = s.p;
  if (s.t === "linea" || s.t === "flecha") {
    return [
      { x: a, y: b, ix: 0, iy: 1, cursor: "grab" },
      { x: c, y: d, ix: 2, iy: 3, cursor: "grab" },
    ];
  }
  return [
    { x: a, y: b, ix: 0, iy: 1, cursor: "nwse-resize" },
    { x: c, y: b, ix: 2, iy: 1, cursor: "nesw-resize" },
    { x: a, y: d, ix: 0, iy: 3, cursor: "nesw-resize" },
    { x: c, y: d, ix: 2, iy: 3, cursor: "nwse-resize" },
  ];
}

/** El tamaño de letra que toca al arrastrar el tirador hasta `x`.
 *
 *  Se despeja de la MISMA medida con la que se dibuja la caja, para que el texto
 *  acabe midiendo justo lo que has estirado. Como ahora el ancho se mide de
 *  verdad y no se estima, se mide una vez a un tamaño de referencia y se escala:
 *  el ancho de un texto es proporcional al cuerpo de la letra, así que una
 *  medición basta para cualquier tamaño. */
function tamPara(s: Trazo, x: number): number {
  const ancho = Math.max(x - s.p[0], 4);
  const f = fuente(s.font);
  const txt = s.txt ?? "";
  const REF = 100;
  const anchoRef = (txt ? anchoDeTexto(txt, REF, f.css) : null) ??
    Math.max(txt.length, 1) * REF * f.ancho;
  const alto = (ancho * REF) / Math.max(anchoRef, 1);
  return Math.min(Math.max(alto / 8, 0.6), 24);
}

/** Lo cerca que pasa un trazo del punto dado. */
function distTrazo(s: Trazo, x: number, y: number): number {
  if (s.t === "texto") {
    // Por su CAJA, no por su ancla. Medido desde la esquina de abajo a la
    // izquierda, apuntar al centro de la palabra daba "lejos" y la goma no
    // borraba nada: justo lo que pasaba al intentar borrar un texto.
    const c = cajaTexto(s);
    const dx = Math.max(c.x - x, 0, x - (c.x + c.w));
    const dy = Math.max(c.y - y, 0, y - (c.y + c.h));
    return Math.hypot(dx, dy);
  }
  if (s.t === "lapiz") {
    let min = Infinity;
    for (let i = 0; i + 3 < s.p.length; i += 2) {
      min = Math.min(min, distSeg(x, y, s.p[i], s.p[i + 1], s.p[i + 2], s.p[i + 3]));
    }
    return s.p.length === 2 ? Math.hypot(x - s.p[0], y - s.p[1]) : min;
  }
  const [a, b, c, d] = s.p;
  if (s.t === "flecha" || s.t === "linea") return distSeg(x, y, a, b, c, d);
  // Caja y elipse se miden por su perímetro rectangular: es una aproximación,
  // pero borrar apuntando al borde es exactamente lo que uno intenta hacer.
  const x1 = Math.min(a, c);
  const x2 = Math.max(a, c);
  const y1 = Math.min(b, d);
  const y2 = Math.max(b, d);
  return Math.min(
    distSeg(x, y, x1, y1, x2, y1),
    distSeg(x, y, x2, y1, x2, y2),
    distSeg(x, y, x2, y2, x1, y2),
    distSeg(x, y, x1, y2, x1, y1),
  );
}

let contador = 0;
const nuevoId = () => `d${(contador++).toString(36)}${Math.floor(performance.now())}`;

export default function CanvasDraw({
  tool,
  color,
  grosor,
  glow,
  relleno,
  rugoso,
  cajasNodos,
  font,
  trazos,
  onAdd,
  onBorrar,
  onCambiar,
  onGesto,
  onFinGesto,
  sel,
  onSel,
  onFin,
  grupo,
  onMarco,
  onCambiarVarios,
  onMoverNodos,
}: Props) {
  const { t } = useT();
  const flow = useReactFlow();
  const { x: vx, y: vy, zoom } = useViewport();
  const [dibujando, setDibujando] = useState<Trazo | null>(null);
  /** El rectángulo que se está barriendo, mientras dura el gesto. */
  const [marco, setMarco] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    sumar: boolean;
  } | null>(null);
  const [escribiendo, setEscribiendo] = useState<{
    mx: number;
    my: number;
    x: number;
    y: number;
    /** Si viene, se está reescribiendo ese trazo en vez de crear uno nuevo. */
    id?: string;
    /** Con qué se pinta el cuadro. Al reescribir un texto que ya existe son
        los SUYOS, no los de la barra: si no, abrir una nota roja a mano para
        cambiarle una palabra la enseñaba azul y con otra letra mientras la
        editabas, y solo volvía a su sitio al pulsar Enter. */
    color?: string;
    w?: number;
    font?: FontId;
  } | null>(null);
  const [texto, setTexto] = useState("");
  const arrastre = useRef<{
    id: string;
    x: number;
    y: number;
    base: Trazo;
    /** Si viene, el gesto estira por ese tirador en vez de mover la figura. */
    tir?: Tirador;
    /** Si el trazo agarrado estaba en la selección: los demás trazos del grupo
        tal como estaban, y cuánto se le ha contado ya a las piezas. */
    banda?: Trazo[];
    ux?: number;
    uy?: number;
  } | null>(null);
  const capa = useRef<SVGSVGElement>(null);
  const activo = tool !== "sel";
  /** Si la goma está apoyada: mientras lo esté, todo lo que pase por debajo cae. */
  const borrando = useRef(false);
  /** Las líneas de alineación que se están enseñando ahora mismo. */
  const [guias, setGuias] = useState<{ x?: number; y?: number } | null>(null);

  /** Borra lo que haya bajo el punto, si hay algo. */
  const gomear = useCallback(
    (x: number, y: number) => {
      const cerca = trazos
        .map((s) => ({ s, d: distTrazo(s, x, y) }))
        .filter((o) => o.d < ALCANCE_RATON / zoom)
        .sort((a, b) => a.d - b.d)[0];
      if (cerca) onBorrar(cerca.s.id);
    },
    [trazos, zoom, onBorrar],
  );

  // La selección es de la flecha: cambiar de herramienta la suelta, para que
  // el resaltado no se quede encendido mientras dibujas otra cosa.
  useEffect(() => {
    if (tool !== "sel") onSel(null);
  }, [tool, onSel]);

  // Suprimir borra lo seleccionado, como en cualquier editor. Se ignora si el
  // foco está en un campo de texto: ahí Suprimir es borrar una letra.
  useEffect(() => {
    if (!sel) return;
    const tecla = (e: KeyboardEvent) => {
      if (escribiendoTexto()) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onBorrar(sel);
        onSel(null);
      } else if (e.key === "Escape") {
        onSel(null);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [sel, onBorrar, onSel]);

  /** Punto del ratón en coordenadas del lienzo. */
  const punto = useCallback(
    (e: React.PointerEvent): [number, number] => {
      const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      return [p.x, p.y];
    },
    [flow],
  );

  /** Lo mismo, pero alineándose con lo que ya hay en el tablero.
   *
   *  Se imanta a los bordes y a los centros de las piezas y de los demás
   *  trazos, y mientras dura enseña la guía. Con **Ctrl** no se imanta nada: es
   *  la salida de emergencia para cuando de verdad quieres poner algo un poco
   *  torcido, y la tiene cualquier editor por el mismo motivo. */
  const puntoIman = useCallback(
    (e: React.PointerEvent, ignorar?: string): [number, number] => {
      const [x, y] = punto(e);
      if (e.ctrlKey) {
        setGuias(null);
        return [x, y];
      }
      const cajas = [
        ...cajasNodos.values(),
        ...trazos.filter((s) => s.id !== ignorar).map(cajaDe),
      ];
      const { xs, ys } = guiasDe(cajas);
      const u = IMAN / zoom;
      const ix = imantar(x, xs, u);
      const iy = imantar(y, ys, u);
      setGuias(ix === x && iy === y ? null : { x: ix === x ? undefined : ix, y: iy === y ? undefined : iy });
      return [ix, iy];
    },
    [punto, cajasNodos, trazos, zoom],
  );

  const abajo = (e: React.PointerEvent) => {
    if (e.button !== 0 || !activo) return;
    // Sin esto, React Flow interpretaría el mismo gesto como un panning y el
    // lienzo se movería debajo del trazo mientras lo dibujas.
    e.stopPropagation();
    // Y sin esto el cuadro de texto no llegaba a existir: tras el pointerdown
    // el navegador dispara su mousedown de compatibilidad, cuyo efecto por
    // defecto es mover el foco. Como React ya había montado el input con
    // autoFocus, ese mousedown se lo quitaba, saltaba el onBlur y el cuadro se
    // cerraba solo antes de que se pudiera escribir una letra.
    e.preventDefault();
    const [x, y] = punto(e);
    if (tool === "marco") {
      // Con Mayús el marco SUMA a lo que ya había cogido, en vez de empezar de
      // cero: es como se selecciona en todas partes y no cuesta nada respetarlo.
      capa.current?.setPointerCapture(e.pointerId);
      setMarco({ x1: x, y1: y, x2: x, y2: y, sumar: e.shiftKey });
      return;
    }
    if (tool === "goma") {
      // Se borra arrastrando, no clic a clic: pasar la goma por encima de cinco
      // rayas y que se vaya solo una es de las cosas que hacen que una
      // herramienta parezca rota. Todo lo que caiga bajo el mismo arrastre
      // cuenta como UN paso de deshacer.
      capa.current?.setPointerCapture(e.pointerId);
      onGesto();
      borrando.current = true;
      gomear(x, y);
      return;
    }
    if (tool === "texto") {
      const r = capa.current?.getBoundingClientRect();
      setTexto("");
      setEscribiendo({ mx: e.clientX - (r?.left ?? 0), my: e.clientY - (r?.top ?? 0), x, y });
      return;
    }
    capa.current?.setPointerCapture(e.pointerId);
    setDibujando({
      id: nuevoId(),
      t: tool,
      color,
      w: grosor,
      glow,
      font,
      // Solo donde significa algo: una flecha rellena no existe, y guardarlo
      // igualmente ensuciaría el archivo con un campo que nadie lee.
      relleno: tool === "caja" || tool === "rombo" || tool === "elipse" ? relleno : undefined,
      rugoso: rugoso || undefined,
      // El dado del temblor se echa UNA vez, aquí, y viaja con el trazo. Ver
      // `seed` en Trazo: sin él la figura hierve en cada repintado.
      seed: rugoso ? Math.floor(Math.random() * 2 ** 31) : undefined,
      p: tool === "lapiz" ? [x, y] : [x, y, x, y],
    });
  };

  /** Agarrar un trazo con la flecha: lo selecciona y empieza a moverlo.
   *
   *  Si ese trazo está en la selección, el gesto no lo saca del grupo para
   *  moverlo solo: mueve el grupo entero. Es lo que uno espera después de
   *  haberse molestado en rodear diez cosas. */
  const agarrar = (e: React.PointerEvent, s: Trazo) => {
    if (tool !== "sel" || e.button !== 0) return;
    // Sin esto React Flow tomaría el gesto por un panning del lienzo.
    e.stopPropagation();
    onGesto();
    const [x, y] = punto(e);
    if (grupo.has(s.id)) {
      arrastre.current = {
        id: s.id,
        x,
        y,
        base: s,
        banda: trazos.filter((z) => grupo.has(z.id)),
        ux: 0,
        uy: 0,
      };
    } else {
      onSel(s.id);
      arrastre.current = { id: s.id, x, y, base: s };
    }
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  /** Agarrar un tirador: no mueve la figura, la estira. */
  const agarrarTirador = (e: React.PointerEvent, s: Trazo, tir: Tirador) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onGesto();
    const [x, y] = punto(e);
    arrastre.current = { id: s.id, x, y, base: s, tir };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const mueve = (e: React.PointerEvent) => {
    if (borrando.current) {
      const [x, y] = punto(e);
      gomear(x, y);
      return;
    }
    const a = arrastre.current;
    if (a?.tir) {
      e.stopPropagation();
      const t = a.tir;
      if (t.tam) {
        // El tirador del tamaño de letra no se imanta: lo que se está eligiendo
        // es un cuerpo de letra, no una posición en el tablero.
        const [x] = punto(e);
        onCambiar({ ...a.base, w: tamPara(a.base, x) });
      } else {
        // Estirar imanta: es donde más se agradece, porque un lado de una caja
        // a ras del de la de al lado no se acierta a pulso.
        const [ix, iy] = puntoIman(e, a.base.id);
        const p = [...a.base.p];
        p[t.ix] = ix;
        p[t.iy] = iy;
        // Arrastrar un extremo lo repega a donde lo sueltes, o lo despega si lo
        // sacas fuera de todo. Sin esto, mover la punta de una flecha anclada
        // la devolvía a su sitio en el siguiente render, y parecía que el
        // tirador no funcionaba.
        const repegado =
          a.base.t === "flecha" || a.base.t === "linea"
            ? t.ix === 0
              ? { anclaDe: anclaEn(ix, iy, cajasNodos) }
              : { anclaA: anclaEn(ix, iy, cajasNodos) }
            : null;
        onCambiar({ ...a.base, p, ...repegado });
      }
      return;
    }
    if (a?.banda) {
      e.stopPropagation();
      const [x, y] = punto(e);
      const dx = x - a.x;
      const dy = y - a.y;
      // A los trazos se les da la posición final (base + lo andado) y a las
      // piezas solo el trocito nuevo: React Flow las mueve él, así que aquí no
      // se sabe dónde están, solo cuánto les toca desplazarse.
      onCambiarVarios(a.banda.map((z) => movido(z, dx, dy)));
      onMoverNodos(dx - (a.ux ?? 0), dy - (a.uy ?? 0));
      a.ux = dx;
      a.uy = dy;
      return;
    }
    if (a) {
      e.stopPropagation();
      const [x, y] = punto(e);
      onCambiar(movido(a.base, x - a.x, y - a.y));
      return;
    }
    if (marco) {
      e.stopPropagation();
      const [x, y] = punto(e);
      setMarco((m) => m && { ...m, x2: x, y2: y });
      return;
    }
    if (!dibujando) return;
    e.stopPropagation();
    // El lápiz NO se imanta: es a mano alzada, y un imán le daría tirones a
    // cada punto que pasara cerca de un borde. Las figuras de dos puntos sí.
    const [x, y] = dibujando.t === "lapiz" ? punto(e) : puntoIman(e);
    setDibujando((s) => {
      if (!s) return s;
      if (s.t !== "lapiz") return { ...s, p: [s.p[0], s.p[1], x, y] };
      // Se decima el trazo: guardar un punto por cada píxel de pantalla llena
      // el archivo exportado de ruido y no se nota al dibujar.
      const ux = s.p[s.p.length - 2];
      const uy = s.p[s.p.length - 1];
      if (Math.hypot(x - ux, y - uy) < 2 / zoom) return s;
      return { ...s, p: [...s.p, x, y] };
    });
  };

  const arriba = (e: React.PointerEvent) => {
    // Las guías son de mientras dura el gesto: al soltar, fuera.
    setGuias(null);
    if (borrando.current) {
      borrando.current = false;
      onFinGesto();
      e.stopPropagation();
      return;
    }
    if (arrastre.current) {
      arrastre.current = null;
      onFinGesto();
      e.stopPropagation();
      return;
    }
    if (marco) {
      e.stopPropagation();
      const caja: Caja = {
        x: Math.min(marco.x1, marco.x2),
        y: Math.min(marco.y1, marco.y2),
        w: Math.abs(marco.x2 - marco.x1),
        h: Math.abs(marco.y2 - marco.y1),
      };
      // Un clic sin arrastre no es un marco de cero por cero: es "suelta lo que
      // tengas cogido", y así se sale de una selección sin buscar ningún botón.
      const gesto = caja.w > 5 / zoom || caja.h > 5 / zoom;
      onMarco(
        caja,
        gesto ? trazos.filter((s) => seTocan(caja, cajaDe(s))).map((s) => s.id) : [],
        gesto && marco.sumar,
      );
      setMarco(null);
      return;
    }
    if (!dibujando) return;
    e.stopPropagation();
    // Un clic sin arrastre no es una figura, es un clic: no deja rastro.
    const grande =
      dibujando.t === "lapiz"
        ? dibujando.p.length > 4
        : Math.hypot(dibujando.p[2] - dibujando.p[0], dibujando.p[3] - dibujando.p[1]) > 6 / zoom;
    if (grande) {
      // Una flecha o una línea que acaba sobre una terminal se PEGA a ella, y a
      // partir de ahí la sigue cuando la muevas. Es lo que uno da por hecho al
      // dibujar una flecha entre dos cosas, y sin esto el tablero se
      // desmoronaba en cuanto reordenabas las piezas: las flechas se quedaban
      // señalando al aire donde estuvo algo.
      const pegado =
        dibujando.t === "flecha" || dibujando.t === "linea"
          ? {
              ...dibujando,
              anclaDe: anclaEn(dibujando.p[0], dibujando.p[1], cajasNodos),
              anclaA: anclaEn(dibujando.p[2], dibujando.p[3], cajasNodos),
            }
          : dibujando;
      onAdd(pegado);
      onFin();
    }
    setDibujando(null);
  };

  const cerrarTexto = (guardar: boolean) => {
    if (guardar && escribiendo) {
      const limpio = texto.trim();
      const viejo = escribiendo.id ? trazos.find((s) => s.id === escribiendo.id) : null;
      if (viejo) {
        // Reescribir: si lo deja vacío es que lo quería quitar.
        if (limpio) onCambiar({ ...viejo, txt: limpio });
        else onBorrar(viejo.id);
      } else if (limpio) {
        onAdd({
          id: nuevoId(),
          t: "texto",
          color,
          w: grosor,
          p: [escribiendo.x, escribiendo.y],
          txt: limpio,
          // La letra y el halo, que se quedaban por el camino: el cuadro de
          // escritura SÍ los usaba para la vista previa, así que elegías «A
          // mano», lo veías escrito a mano, pulsabas Enter y salía con la letra
          // de la app. Justo la sorpresa que el comentario de ese cuadro dice
          // que no puede pasar.
          font,
          glow,
        });
        onFin();
      }
    }
    setEscribiendo(null);
    setTexto("");
  };

  /** Doble clic sobre un texto: se reescribe donde está. */
  const editarTexto = (e: React.MouseEvent, s: Trazo) => {
    if (tool !== "sel" || s.t !== "texto") return;
    e.stopPropagation();
    setTexto(s.txt ?? "");
    // De coordenadas del lienzo a píxeles de la capa: el mismo viewport con el
    // que se pintan los trazos. La línea base del texto va abajo, el cuadro se
    // coloca por arriba, de ahí el alto de fuente de menos.
    setEscribiendo({
      mx: s.p[0] * zoom + vx,
      my: s.p[1] * zoom + vy - 8 * s.w * zoom,
      x: s.p[0],
      y: s.p[1],
      id: s.id,
      color: s.color,
      w: s.w,
      font: s.font,
    });
  };

  const vistos = dibujando ? [...trazos, dibujando] : trazos;

  // Lo que se ve del tablero ahora mismo, en sus propias coordenadas: es hasta
  // dónde tienen que llegar las guías para que se lean de lado a lado.
  const anchoCapa = capa.current?.clientWidth ?? window.innerWidth;
  const altoCapa = capa.current?.clientHeight ?? window.innerHeight;
  const vistaX = -vx / zoom;
  const vistaY = -vy / zoom;
  const vistaW = anchoCapa / zoom;
  const vistaH = altoCapa / zoom;

  /** La pieza sobre la que está la punta ahora mismo, si la hay: es la que se
      va a quedar la flecha. Se mira el extremo que se está moviendo, que al
      dibujar es siempre el segundo. */
  const pegandoA = (() => {
    const s = dibujando;
    if (!s || (s.t !== "flecha" && s.t !== "linea")) return null;
    const a = anclaEn(s.p[2], s.p[3], cajasNodos);
    return a ? (cajasNodos.get(a.nodo) ?? null) : null;
  })();

  return (
    <>
      <svg
        ref={capa}
        className="canvas-draw"
        data-activo={activo}
        data-goma={tool === "goma"}
        onPointerDown={abajo}
        onPointerMove={mueve}
        onPointerUp={arriba}
        onPointerCancel={arriba}
      >
        {/* El viewport de React Flow, aplicado a mano: los trazos viven en
            coordenadas del lienzo, así que hacen zoom y se desplazan con los
            nodos en vez de quedarse pegados a la pantalla. */}
        <g transform={`translate(${vx},${vy}) scale(${zoom})`}>
          {vistos.map((s) => (
            <g
              key={s.id}
              className="canvas-draw-shape"
              data-sel={s.id === sel || grupo.has(s.id)}
              data-grab={tool === "sel"}
              onPointerDown={tool === "sel" ? (e) => agarrar(e, s) : undefined}
              onDoubleClick={(e) => editarTexto(e, s)}
            >
              <Forma s={s} />
              {/* El agarre: el mismo trazo, invisible y mucho más grueso. Una
                  línea de dos píxeles es imposible de acertar con el ratón, y
                  esto no cambia nada de lo que se ve. El texto también lo
                  lleva: dejarlo fuera obligaba a acertar en la tinta de una
                  letra, y entre letra y letra no hay tinta. */}
              {tool === "sel" && (
                <g className="canvas-draw-grab">
                  {/* El doble, porque un `stroke-width` se reparte a los dos
                      lados del camino: 24 de grosor son 12 de radio, que es lo
                      mismo que alcanza la goma. */}
                  <Forma s={s} agarre={(ALCANCE_RATON * 2) / zoom} />
                </g>
              )}
            </g>
          ))}

          {/* Los tiradores van fuera de las figuras y los últimos, para que
              queden por encima de todo y no se los coma el trazo de al lado. */}
          {tool === "sel" &&
            vistos
              .filter((s) => s.id === sel)
              .flatMap((s) =>
                tiradoresDe(s).map((tir, i) => (
                  <circle
                    key={`${s.id}-t${i}`}
                    className="canvas-draw-tirador"
                    cx={tir.x}
                    cy={tir.y}
                    r={5.5 / zoom}
                    strokeWidth={1.6 / zoom}
                    style={{ cursor: tir.cursor }}
                    onPointerDown={(e) => agarrarTirador(e, s, tir)}
                  />
                )),
              )}

          {/* Las guías de alineación. Se dibujan de lado a lado del tablero
              visible, que es como se lee «esto está a la misma altura que
              aquello»: una raya corta al lado del cursor no dice con QUÉ te
              estás alineando. */}
          {guias?.x !== undefined && (
            <line
              className="canvas-guia"
              x1={guias.x}
              y1={vistaY}
              x2={guias.x}
              y2={vistaY + vistaH}
              strokeWidth={1 / zoom}
            />
          )}
          {guias?.y !== undefined && (
            <line
              className="canvas-guia"
              x1={vistaX}
              y1={guias.y}
              x2={vistaX + vistaW}
              y2={guias.y}
              strokeWidth={1 / zoom}
            />
          )}

          {/* La pieza a la que se va a pegar el extremo, mientras dibujas.
              Sin esto el anclaje sería invisible: la flecha se pegaría o no
              según dónde soltaras, y no habría forma de saberlo hasta mover la
              terminal un rato después. */}
          {pegandoA && (
            <rect
              className="canvas-imana"
              x={pegandoA.x}
              y={pegandoA.y}
              width={pegandoA.w}
              height={pegandoA.h}
              strokeWidth={2 / zoom}
              rx={12 / zoom}
            />
          )}

          {/* El marco, mientras se barre. El guion y el grosor se dividen por
              el zoom para que se vea igual de fino con el lienzo lejos. */}
          {marco && (
            <rect
              className="canvas-marco"
              x={Math.min(marco.x1, marco.x2)}
              y={Math.min(marco.y1, marco.y2)}
              width={Math.abs(marco.x2 - marco.x1)}
              height={Math.abs(marco.y2 - marco.y1)}
              strokeWidth={1.6 / zoom}
              strokeDasharray={`${7 / zoom} ${5 / zoom}`}
            />
          )}
        </g>
      </svg>

      {escribiendo && (
        <textarea
          className="canvas-draw-text"
          autoFocus
          rows={texto.split("\n").length}
          // Mientras escribes se ve ya con su tipografía y su tamaño: si el
          // cuadro escribiera con otra letra, lo que sale al pulsar Enter
          // sería una sorpresa cada vez.
          style={{
            left: escribiendo.mx,
            top: escribiendo.my,
            color: escribiendo.color ?? color,
            fontSize: 8 * (escribiendo.w ?? grosor) * zoom,
            fontFamily: fuente(escribiendo.font ?? font).css,
            lineHeight: INTERLINEA,
          }}
          placeholder={t("Escribe y Enter · Mayús+Enter para otra línea")}
          value={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          onKeyDown={(e) => {
            // Enter cierra y Mayús+Enter baja de línea, como en cualquier chat:
            // el gesto de siempre se conserva y el párrafo largo cabe. Con un
            // Enter que bajara de línea, la mitad de los rótulos de una palabra
            // se quedarían abiertos esperando un botón.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              cerrarTexto(true);
            }
            if (e.key === "Escape") cerrarTexto(false);
            e.stopPropagation();
          }}
          onBlur={() => cerrarTexto(true)}
        />
      )}
    </>
  );
}

/**
 * El camino de un trazo de lápiz, con grosor variable.
 *
 * Antes era una polilínea de grosor constante: correcta, y con la pinta de
 * haberla dibujado un ordenador. `perfect-freehand` devuelve el CONTORNO del
 * trazo —un polígono que se rellena, no una línea que se traza—, y ahí es donde
 * está la diferencia: entra afilado, engorda donde vas más despacio y sale
 * afilado, que es lo que hace un rotulador de verdad.
 *
 * Los números son los de Excalidraw, tal cual: están medidos allí y cualquier
 * otro juego se nota peor. El `easing` senoidal es el que afila las puntas.
 *
 * Se guardan los puntos CRUDOS y el contorno se calcula al pintar. Así el
 * archivo no engorda, el hit-testing sigue midiendo distancias a la línea de
 * verdad, y cambiar estos parámetros mañana mejora también los trazos de ayer.
 */
function caminoLapiz(s: Trazo): string {
  const puntos: number[][] = [];
  for (let i = 0; i + 1 < s.p.length; i += 2) puntos.push([s.p[i], s.p[i + 1]]);
  const contorno = getStroke(puntos, {
    size: s.w * 4.25,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    easing: (t: number) => Math.sin((t * Math.PI) / 2),
    last: true,
  });
  if (!contorno.length) return "";
  // A curvas cuadráticas entre los puntos medios, que es como lo cierra
  // Excalidraw: un polígono a segmentos rectos se ve dentado al acercar el zoom.
  let d = `M${contorno[0][0].toFixed(2)} ${contorno[0][1].toFixed(2)}`;
  for (let i = 0; i < contorno.length; i++) {
    const [x0, y0] = contorno[i];
    const [x1, y1] = contorno[(i + 1) % contorno.length];
    d += `Q${x0.toFixed(2)} ${y0.toFixed(2)} ${((x0 + x1) / 2).toFixed(2)} ${((y0 + y1) / 2).toFixed(2)}`;
  }
  return `${d}Z`;
}

/** Las cuatro puntas de un rombo inscrito en la caja que has arrastrado: los
    puntos medios de sus cuatro lados. */
function puntosRombo(p: number[]): [number, number][] {
  const [a, b, c, d] = p;
  const cx = (a + c) / 2;
  const cy = (b + d) / 2;
  return [
    [cx, Math.min(b, d)],
    [Math.max(a, c), cy],
    [cx, Math.max(b, d)],
    [Math.min(a, c), cy],
  ];
}

/**
 * El generador del trazo tembloroso. Uno para toda la app: no dibuja nada por
 * su cuenta, solo calcula caminos.
 */
const rugo = rough.generator();

/** Los caminos de una figura dibujada a mano alzada, en cacheados por trazo.
 *
 *  La caché importa: RoughJS tarda lo suyo y React repinta esta capa en cada
 *  fotograma de pan y de zoom. La clave lleva la geometría, así que estirar una
 *  caja la recalcula y moverla por el tablero no.
 */
const cacheRugosa = new Map<string, string[]>();
function caminosRugosos(s: Trazo): string[] {
  const [a, b, c, d] = s.p;
  const clave = `${s.id}|${s.seed}|${a}|${b}|${c}|${d}|${s.t}|${s.w}|${s.relleno ?? 0}`;
  const hecho = cacheRugosa.get(clave);
  if (hecho) return hecho;
  const opciones = {
    seed: s.seed || 1,
    // Menos temblor en las figuras pequeñas: una caja de veinte píxeles con la
    // rugosidad al máximo es una mancha ilegible. Es el `adjustRoughness` de
    // Excalidraw, con la misma idea aunque no con su fórmula exacta.
    roughness: Math.min(1.6, Math.max(0.6, Math.hypot(c - a, d - b) / 260)),
    strokeWidth: s.w,
    bowing: 1,
    fill: s.relleno ? s.color : undefined,
    fillStyle: "hachure",
    fillWeight: s.w / 2,
    hachureGap: s.w * 4,
    // Con poco temblor, obliga a que los vértices caigan donde tocan: si no,
    // una flecha «casi» toca la caja a la que apunta y se nota.
    preserveVertices: true,
  };
  const dib =
    s.t === "caja"
      ? rugo.rectangle(Math.min(a, c), Math.min(b, d), Math.abs(c - a), Math.abs(d - b), opciones)
      : s.t === "elipse"
        ? rugo.ellipse((a + c) / 2, (b + d) / 2, Math.abs(c - a), Math.abs(d - b), opciones)
        : s.t === "rombo"
          ? rugo.polygon(puntosRombo(s.p), opciones)
          : rugo.line(a, b, c, d, opciones);
  const caminos = rugo.toPaths(dib).map((p) => p.d);
  // Un tope tonto para que un lienzo de horas no acumule caminos de trazos que
  // ya se movieron veinte veces.
  if (cacheRugosa.size > 4000) cacheRugosa.clear();
  cacheRugosa.set(clave, caminos);
  return caminos;
}

/** Un trazo, ya en coordenadas del lienzo. Con `agarre` se pinta el mismo
    camino transparente y grueso, que es lo que el ratón puede acertar. */
function Forma({ s, agarre }: { s: Trazo; agarre?: number }) {
  // El halo se pinta con el color del propio trazo, no con uno fijo: un rojo
  // con halo azul se vería sucio, y la gracia es que parezca neón de ESE color.
  const halo =
    !agarre && s.glow
      ? { filter: `drop-shadow(0 0 ${s.w * 0.8}px ${s.color}) drop-shadow(0 0 ${s.w * 2.4}px ${s.color})` }
      : undefined;
  // Una figura rellena se agarra por DENTRO; una hueca, solo por su borde. Es
  // la regla de Excalidraw y es la que espera cualquiera: si el interior de una
  // caja vacía capturase el ratón, taparía todo lo que hubiera debajo —una
  // terminal, por ejemplo— con un rectángulo de aire.
  const macizo = !!s.relleno && (s.t === "caja" || s.t === "elipse");
  const comun = agarre
    ? {
        stroke: "transparent",
        strokeWidth: Math.max(agarre, s.w),
        fill: macizo ? "transparent" : "none",
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
      }
    : {
        stroke: s.color,
        strokeWidth: s.w,
        fill: macizo ? s.color : "none",
        fillOpacity: macizo ? s.relleno : undefined,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        style: halo,
      };

  if (s.t === "texto") {
    // Como agarre, un rectángulo invisible del tamaño de la palabra: es lo
    // que se puede coger con el ratón y lo que la goma puede alcanzar.
    if (agarre) {
      const c = cajaTexto(s);
      return (
        <rect className="canvas-draw-hit" x={c.x} y={c.y} width={c.w} height={c.h} fill="transparent" />
      );
    }
    // Varias líneas: un <tspan> por línea, con la `x` repetida porque sin ella
    // cada tspan continuaría donde acabó el anterior en vez de volver al margen.
    const lineas = (s.txt ?? "").split("\n");
    return (
      <text
        x={s.p[0]}
        y={s.p[1]}
        fill={s.color}
        fontSize={8 * s.w}
        fontFamily={fuente(s.font).css}
        className="canvas-draw-label"
        // El halo del texto se calcula sobre el tamaño de la letra, no sobre
        // el grosor, que en un texto ES el tamaño.
        style={
          s.glow
            ? { filter: `drop-shadow(0 0 ${s.w}px ${s.color}) drop-shadow(0 0 ${s.w * 3}px ${s.color})` }
            : undefined
        }
      >
        {lineas.map((l, i) => (
          <tspan key={i} x={s.p[0]} dy={i === 0 ? 0 : 8 * s.w * INTERLINEA}>
            {/* Una línea vacía sin nada dentro no ocupa alto: el espacio duro
                la mantiene, para que un párrafo con un hueco lo conserve. */}
            {l || " "}
          </tspan>
        ))}
      </text>
    );
  }

  if (s.t === "lapiz") {
    // Para agarrarlo, la polilínea de siempre con un trazo gordo y transparente:
    // el contorno relleno de abajo no sirve de zona de agarre, porque un trazo
    // fino deja un polígono estrechísimo y habría que apuntar al píxel.
    if (agarre) {
      let d = "";
      for (let i = 0; i + 1 < s.p.length; i += 2) {
        d += `${i === 0 ? "M" : "L"}${s.p[i]} ${s.p[i + 1]} `;
      }
      return <path d={d} {...comun} />;
    }
    return <path d={caminoLapiz(s)} fill={s.color} stroke="none" style={halo} />;
  }

  const [a, b, c, d] = s.p;

  // A mano alzada: RoughJS devuelve varios caminos por figura (el contorno lleva
  // dos pasadas, y el relleno son sus rayas), así que se pintan todos. Para
  // agarrarla se sigue usando la figura limpia de abajo: el contorno tembloroso
  // es una tira finísima y habría que apuntar al píxel.
  if (
    s.rugoso &&
    !agarre &&
    (s.t === "caja" || s.t === "rombo" || s.t === "elipse" || s.t === "linea")
  ) {
    return (
      <g style={halo}>
        {caminosRugosos(s).map((camino, i) => (
          <path
            key={i}
            d={camino}
            stroke={s.color}
            strokeWidth={s.w}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </g>
    );
  }

  if (s.t === "caja") {
    // La esquina crece con la caja hasta un tope, en vez de ser siempre 6.
    // Con un radio fijo, una caja pequeña sale casi redonda y una grande casi
    // recta: las dos «igual de redondeadas» solo lo parecen si el radio es una
    // proporción. El 25 % con tope de 32 es de Excalidraw, medido allí.
    const lado = Math.min(Math.abs(c - a), Math.abs(d - b));
    return (
      <rect
        x={Math.min(a, c)}
        y={Math.min(b, d)}
        width={Math.abs(c - a)}
        height={Math.abs(d - b)}
        rx={Math.min(32, lado * 0.25)}
        {...comun}
      />
    );
  }

  if (s.t === "rombo") {
    return <polygon points={puntosRombo(s.p).map(([x, y]) => `${x},${y}`).join(" ")} {...comun} />;
  }

  if (s.t === "elipse") {
    return (
      <ellipse
        cx={(a + c) / 2}
        cy={(b + d) / 2}
        rx={Math.abs(c - a) / 2}
        ry={Math.abs(d - b) / 2}
        {...comun}
      />
    );
  }

  if (s.t === "linea") return <line x1={a} y1={b} x2={c} y2={d} {...comun} />;

  // Flecha: la punta tiene tamaño propio para que una flecha corta no acabe
  // siendo solo punta.
  const ang = Math.atan2(d - b, c - a);
  const L = 6 + s.w * 2.2;
  const pts = [
    `${c},${d}`,
    `${c - L * Math.cos(ang - Math.PI / 7)},${d - L * Math.sin(ang - Math.PI / 7)}`,
    `${c - L * Math.cos(ang + Math.PI / 7)},${d - L * Math.sin(ang + Math.PI / 7)}`,
  ].join(" ");
  return (
    <g>
      <line x1={a} y1={b} x2={c} y2={d} {...comun} />
      <polygon points={pts} fill={agarre ? "transparent" : s.color} />
    </g>
  );
}
