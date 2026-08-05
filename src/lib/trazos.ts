// El modelo del dibujo del lienzo: qué es un trazo, cuánto ocupa y dónde cae.
//
// Vive aparte de `CanvasDraw.tsx` porque son dos cosas distintas: aquí está la
// geometría, que es aritmética pura y se puede probar compilando este módulo y
// ejecutándolo con node; allí está el SVG, que solo se puede mirar. Antes
// estaban mezclados en un archivo de mil líneas donde para tocar una fórmula
// había que pasar por encima de doscientas de JSX.

import type { FontId } from "./piezas";

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

/** Cómo se pinta la línea: entera, a guiones o a puntos.
 *
 *  Se guarda el nombre y no el `dasharray` ya calculado porque el patrón
 *  depende del grosor y del zoom: un guion de cinco píxeles en una línea de
 *  ocho es casi una línea entera. El número sale en `guionDe()`. */
export type Guion = "solido" | "guiones" | "puntos";

/** Qué lleva cada extremo de una flecha o una línea. */
export type Punta = "nada" | "flecha" | "triangulo";

export interface Trazo {
  id: string;
  t: (typeof FIGURAS)[number];
  color: string;
  /** Grosor en unidades del lienzo (escala con el zoom, como los nodos). */
  w: number;
  /** lápiz: pares x,y. El resto: [x1,y1,x2,y2]. texto: [x,y].
   *  Flecha y línea admiten MÁS de dos pares: son los puntos intermedios. */
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
  /** Lo transparente que está la figura ENTERA, borde incluido. Distinto del
   *  relleno, que es solo el interior: esto es para dejar algo de fondo, como
   *  una marca de agua, sin cambiarle el color. Sin poner es opaca. */
  opacidad?: number;
  /** El patrón de la línea. Sin poner es entera, que es como nacen todas. */
  guion?: Guion;
  /** Qué lleva cada punta, solo en flechas y líneas. Sin poner, una flecha
   *  lleva punta al final y una línea no lleva ninguna: es como se han
   *  dibujado siempre, así que los tableros viejos no cambian de aspecto. */
  puntaDe?: Punta;
  puntaA?: Punta;
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
  /** Clavado al tablero: ni se coge, ni se mueve, ni la goma lo alcanza. Para
   *  el marco de un diagrama, que está para que dibujes DENTRO y estorba en
   *  cuanto lo rozas. */
  bloq?: boolean;
  /** A qué grupo pertenece. Coger uno coge a todos los que llevan la misma
   *  marca: es lo que convierte cinco trazos en «el diagrama». */
  grupo?: string;
  /** El texto escrito DENTRO de una figura, que viaja con ella. Distinto de un
   *  trazo de texto suelto: este no se puede coger por su cuenta ni se queda
   *  atrás al mover la caja, que es justo lo que se espera de una etiqueta. */
  etiqueta?: string;
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

/** Un rectángulo del lienzo. Lo hablan el marco de selección, los trazos y las
    piezas, que es lo único que necesitan saber unos de otros para esto. */
export interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Cuánto se puede fallar apuntando y que aun así se alinee solo, en píxeles de
 * PANTALLA. Es el `SNAP_DISTANCE` de Excalidraw, y como todos los umbrales de
 * aquí se divide por el zoom: el imán tiene que sentirse igual de fuerte con el
 * tablero cerca y lejos. Ocho es suficiente para acertar sin querer y poco para
 * estorbar cuando de verdad quieres poner algo torcido.
 */
export const IMAN = 8;

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
 * un lado y 22 de grosor, o sea 11 de radio, por el otro: casi lo mismo, pero
 * dos números sueltos que nadie sabía que iban emparejados.
 */
export const ALCANCE_RATON = 12;

/** Cuánto baja de una línea a la siguiente, en cuerpos de letra. 1,25 es el
    valor por defecto de Excalidraw para sus tipografías, y es el que hace que
    un párrafo corto se lea sin apelotonarse ni desperdigarse. */
export const INTERLINEA = 1.25;

export const DRAW_COLORS = ["#ff6b6b", "#ffd166", "#6fe0bb", "#5fd0ff", "#c4b5fd", "#e6edf7"];
export const DRAW_WIDTHS = [2, 4, 8];

/** Los tres pasos del relleno: hueca, se ve lo de debajo, tapa. */
export const RELLENOS = [0, 0.25, 0.85];
/** Y los de la opacidad. El 1 va primero porque es como nace todo. */
export const OPACIDADES = [1, 0.6, 0.3];

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

let contador = 0;
export const nuevoId = () => `d${(contador++).toString(36)}${Math.floor(performance.now())}`;

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
export function distSeg(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
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
export function anchoDeTexto(txt: string, px: number, css: string): number | null {
  // Fuera del navegador (una prueba con node) no hay `document`: se cae a la
  // estimación de siempre en vez de reventar.
  if (typeof document === "undefined") return null;
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
 * cosas a la vez, dónde se puede agarrar el texto, hasta dónde llega la goma y
 * si el marco lo ha cogido, así que un «MMMM» en Arial Black tenía la zona de
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

/** La caja que envuelve a varios trazos a la vez. Es lo que necesitan alinear,
    distribuir y exportar: los tres trabajan sobre el conjunto, no sobre uno. */
export function cajaDeVarios(ts: Trazo[]): Caja | null {
  if (!ts.length) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const s of ts) {
    const c = cajaDe(s);
    x1 = Math.min(x1, c.x);
    y1 = Math.min(y1, c.y);
    x2 = Math.max(x2, c.x + c.w);
    y2 = Math.max(y2, c.y + c.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Lo cerca que pasa un trazo del punto dado. */
export function distTrazo(s: Trazo, x: number, y: number): number {
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
  if (s.t === "flecha" || s.t === "linea") {
    // Tramo a tramo: desde que hay líneas de varios puntos, medir solo del
    // primero al último daría "lejos" en cualquier codo.
    let min = Infinity;
    for (let i = 0; i + 3 < s.p.length; i += 2) {
      min = Math.min(min, distSeg(x, y, s.p[i], s.p[i + 1], s.p[i + 2], s.p[i + 3]));
    }
    return min;
  }
  const [a, b, c, d] = s.p;
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

/** Las cuatro puntas de un rombo inscrito en la caja que has arrastrado: los
    puntos medios de sus cuatro lados. */
export function puntosRombo(p: number[]): [number, number][] {
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
 * El patrón de guiones de un trazo, o `undefined` si va entero.
 *
 * Se calcula sobre el GROSOR y no sobre un número fijo, porque un patrón de
 * cinco píxeles en una línea de ocho de gruesa no se lee como discontinuo, se
 * lee como una línea sucia. Y se divide por el zoom fuera, en quien pinta.
 */
export function guionDe(s: Trazo): string | undefined {
  if (s.guion === "guiones") return `${s.w * 3.2} ${s.w * 2.4}`;
  if (s.guion === "puntos") return `${s.w * 0.05} ${s.w * 2}`;
  return undefined;
}

/**
 * Qué punta lleva cada extremo si nadie lo ha dicho.
 *
 * Una flecha nace con punta al final y una línea sin ninguna, que es como se
 * han dibujado desde el primer día: así los tableros de antes se ven igual
 * después de que exista este campo.
 */
export function puntasDe(s: Trazo): [Punta, Punta] {
  const fin: Punta = s.t === "flecha" ? "triangulo" : "nada";
  return [s.puntaDe ?? "nada", s.puntaA ?? fin];
}

/**
 * El cuerpo de letra del rótulo de una figura.
 *
 * No es el grosor del borde: una caja dibujada con trazo gordo no lleva letra
 * gigante. Sale del ALTO de la figura, con tope, y encoge si el texto no cabe a
 * lo ancho, que es lo que hace Excalidraw con sus contenedores.
 *
 * Vive aquí y no dentro del que pinta porque hay dos que la necesitan: el que
 * pinta el rótulo y el cuadro donde se escribe. Con dos cuentas parecidas, se
 * escribe con una letra y al pulsar Enter sale con otra, que es exactamente el
 * fallo que ya tuvo el texto suelto.
 */
export function cuerpoEtiqueta(s: Trazo, texto?: string): number {
  const c = cajaDe(s);
  const lineas = (texto ?? s.etiqueta ?? "").split("\n");
  const base = Math.max(8, Math.min(20, c.h * 0.3));
  const f = fuente(s.font);
  const anchoMax = Math.max(
    1,
    ...lineas.map((l) => anchoDeTexto(l, base, f.css) ?? l.length * base * f.ancho),
  );
  return anchoMax > c.w * 0.88 ? (base * c.w * 0.88) / anchoMax : base;
}

/**
 * Un tirador de la selección: el punto que se arrastra para ESTIRAR algo, en
 * vez de moverlo entero. Lleva qué par de coordenadas toca (`ix`, `iy`), o la
 * marca `tam` si lo que cambia es el tamaño de la letra.
 */
export interface Tirador {
  x: number;
  y: number;
  ix: number;
  iy: number;
  tam?: boolean;
  cursor: string;
}

/** Dónde se agarra cada figura para estirarla. */
export function tiradoresDe(s: Trazo): Tirador[] {
  if (s.bloq) return [];
  if (s.t === "texto") {
    // Uno solo, a la derecha de la palabra: se tira y la letra crece. Es más
    // directo que buscar el botón de tamaño en la barra de arriba.
    const c = cajaTexto(s);
    return [{ x: c.x + c.w, y: c.y + c.h, ix: 0, iy: 1, tam: true, cursor: "nwse-resize" }];
  }
  // El lápiz no lleva: son cientos de puntos y estirar uno solo deformaría el
  // garabato en vez de agrandarlo, que no es lo que nadie espera.
  if (s.t === "lapiz") return [];
  if (s.t === "linea" || s.t === "flecha") {
    // Uno por punto, incluidos los intermedios: así se dobla una línea ya
    // dibujada sin tener que rehacerla.
    const out: Tirador[] = [];
    for (let i = 0; i + 1 < s.p.length; i += 2) {
      out.push({ x: s.p[i], y: s.p[i + 1], ix: i, iy: i + 1, cursor: "grab" });
    }
    return out;
  }
  const [a, b, c, d] = s.p;
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
export function tamPara(s: Trazo, x: number): number {
  const ancho = Math.max(x - s.p[0], 4);
  const f = fuente(s.font);
  const txt = s.txt ?? "";
  const REF = 100;
  const anchoRef = (txt ? anchoDeTexto(txt, REF, f.css) : null) ??
    Math.max(txt.length, 1) * REF * f.ancho;
  const alto = (ancho * REF) / Math.max(anchoRef, 1);
  return Math.min(Math.max(alto / 8, 0.6), 24);
}

/** Los ids que hay que coger de verdad al coger estos: si uno está agrupado,
    entran todos sus compañeros. Coger medio grupo no existe. */
export function conSuGrupo(ids: Iterable<string>, todos: Trazo[]): Set<string> {
  const out = new Set(ids);
  const marcas = new Set<string>();
  for (const s of todos) if (out.has(s.id) && s.grupo) marcas.add(s.grupo);
  if (marcas.size) for (const s of todos) if (s.grupo && marcas.has(s.grupo)) out.add(s.id);
  return out;
}

/**
 * A qué se alinean varios trazos, y dónde acaba cada uno.
 *
 * Devuelve solo los que se mueven, para no reescribir el tablero entero por
 * alinear tres cosas.
 */
export type Alineacion = "izq" | "centroH" | "der" | "arriba" | "centroV" | "abajo";

export function alineados(ts: Trazo[], como: Alineacion): Trazo[] {
  const marco = cajaDeVarios(ts);
  if (!marco || ts.length < 2) return [];
  const out: Trazo[] = [];
  for (const s of ts) {
    const c = cajaDe(s);
    let dx = 0;
    let dy = 0;
    if (como === "izq") dx = marco.x - c.x;
    else if (como === "der") dx = marco.x + marco.w - (c.x + c.w);
    else if (como === "centroH") dx = marco.x + marco.w / 2 - (c.x + c.w / 2);
    else if (como === "arriba") dy = marco.y - c.y;
    else if (como === "abajo") dy = marco.y + marco.h - (c.y + c.h);
    else dy = marco.y + marco.h / 2 - (c.y + c.h / 2);
    if (dx || dy) out.push(movido(s, dx, dy));
  }
  return out;
}

/**
 * Repartir el hueco a partes iguales entre varios trazos.
 *
 * Los dos de los extremos no se tocan: son los que marcan de dónde a dónde va
 * el reparto. Hacen falta tres para que la palabra signifique algo.
 */
export function repartidos(ts: Trazo[], horizontal: boolean): Trazo[] {
  if (ts.length < 3) return [];
  const con = ts.map((s) => ({ s, c: cajaDe(s) }));
  con.sort((a, b) => (horizontal ? a.c.x - b.c.x : a.c.y - b.c.y));
  const primero = con[0].c;
  const ultimo = con[con.length - 1].c;
  const ocupado = con.reduce((n, o) => n + (horizontal ? o.c.w : o.c.h), 0);
  const total = horizontal
    ? ultimo.x + ultimo.w - primero.x
    : ultimo.y + ultimo.h - primero.y;
  const hueco = (total - ocupado) / (con.length - 1);
  const out: Trazo[] = [];
  let cursor = horizontal ? primero.x : primero.y;
  for (let i = 0; i < con.length; i++) {
    const { s, c } = con[i];
    const donde = horizontal ? c.x : c.y;
    const d = cursor - donde;
    if (i > 0 && i < con.length - 1 && d) out.push(movido(s, horizontal ? d : 0, horizontal ? 0 : d));
    cursor += (horizontal ? c.w : c.h) + hueco;
  }
  return out;
}

/** La marca del portapapeles del lienzo. Va dentro del JSON para no intentar
    pegar cualquier texto copiado por ahí como si fueran trazos. */
export const MARCA_PORTAPAPELES = "adeorq/trazos@1";

export interface Portapapeles {
  tipo: typeof MARCA_PORTAPAPELES;
  trazos: Trazo[];
}

/** Lo copiado, listo para el portapapeles del sistema. */
export function empaquetar(ts: Trazo[]): string {
  return JSON.stringify({ tipo: MARCA_PORTAPAPELES, trazos: ts } satisfies Portapapeles);
}

/**
 * Lo que había en el portapapeles, si eran trazos nuestros.
 *
 * Devuelve copias con id nuevo y desplazadas, que es lo que se quiere al pegar:
 * pegar encima exacto de lo copiado parece que no ha pasado nada. Los grupos se
 * renumeran para que pegar dos veces no funda las dos copias en un grupo solo.
 */
export function desempaquetar(txt: string, dx = 0, dy = 0): Trazo[] {
  let dato: unknown;
  try {
    dato = JSON.parse(txt);
  } catch {
    return [];
  }
  const d = dato as Partial<Portapapeles>;
  if (!d || d.tipo !== MARCA_PORTAPAPELES || !Array.isArray(d.trazos)) return [];
  const renombre = new Map<string, string>();
  return d.trazos.map((s) => {
    const copia = movido({ ...s, id: nuevoId() }, dx, dy);
    if (copia.grupo) {
      const nuevo = renombre.get(copia.grupo) ?? nuevoId();
      renombre.set(copia.grupo, nuevo);
      copia.grupo = nuevo;
    }
    return copia;
  });
}
