import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useReactFlow, useViewport } from "@xyflow/react";
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
  | "elipse"
  | "texto"
  | "goma";

export interface Trazo {
  id: string;
  t: Exclude<DrawTool, "sel" | "marco" | "goma">;
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
  /** Solo para el texto: con qué tipografía se escribe. */
  font?: FontId;
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
  { t: "elipse", icon: <Ico d="M8 3.2 c3.6 0 6.2 2.1 6.2 4.8 c0 2.7 -2.6 4.8 -6.2 4.8 c-3.6 0 -6.2 -2.1 -6.2 -4.8 c0 -2.7 2.6 -4.8 6.2 -4.8 z" />, label: "Elipse" },
  { t: "texto", icon: <Ico d="M3 3.6 h10 M8 3.6 v9 M6 12.6 h4" />, label: "Texto" },
  { t: "goma", icon: <Ico d="M6.4 12.8 L2.6 9 a1 1 0 0 1 0 -1.4 l5.2 -5.2 a1 1 0 0 1 1.4 0 l3.8 3.8 a1 1 0 0 1 0 1.4 l-4.4 4.4 z M13.4 12.8 h-7" />, label: "Borrar trazos" },
];

export const DRAW_COLORS = ["#ff6b6b", "#ffd166", "#6fe0bb", "#5fd0ff", "#c4b5fd", "#e6edf7"];
export const DRAW_WIDTHS = [2, 4, 8];

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
  /** Con qué tipografía se escribe el texto. */
  font: FontId;
  trazos: Trazo[];
  onAdd: (t: Trazo) => void;
  onBorrar: (id: string) => void;
  /** Reemplaza un trazo por su versión nueva: moverlo o reescribir su texto. */
  onCambiar: (t: Trazo) => void;
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

/** Un trazo movido: todos sus puntos, desplazados lo mismo. */
export function movido(s: Trazo, dx: number, dy: number): Trazo {
  return { ...s, p: s.p.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) };
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
 * La caja que ocupa un texto, calculada y no medida.
 *
 * Medirla de verdad (`getBBox`) obligaría a tener el nodo pintado antes de
 * saber dónde está, y esto se usa para DECIDIR si el ratón le ha dado. La
 * aproximación por número de letras se queda corta con mayúsculas y larga con
 * íes, y para agarrar y borrar da igual: nadie apunta al píxel.
 */
export function cajaTexto(s: Trazo): Caja {
  const alto = 8 * s.w;
  const ancho = Math.max(alto * 0.6, (s.txt?.length ?? 1) * alto * fuente(s.font).ancho);
  // La `y` de un <text> es su línea base, no su borde de arriba.
  return { x: s.p[0], y: s.p[1] - alto * 0.85, w: ancho, h: alto * 1.2 };
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

/** El tamaño de letra que toca al arrastrar el tirador hasta `x`. */
function tamPara(s: Trazo, x: number): number {
  const letras = Math.max(s.txt?.length ?? 1, 1);
  const ancho = Math.max(x - s.p[0], 4);
  // Se despeja de la misma cuenta con la que se dibuja la caja, para que el
  // texto acabe midiendo justo lo que has estirado.
  const alto = ancho / (letras * fuente(s.font).ancho);
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
  font,
  trazos,
  onAdd,
  onBorrar,
  onCambiar,
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
      const cerca = trazos
        .map((s) => ({ s, d: distTrazo(s, x, y) }))
        .filter((o) => o.d < 12 / zoom)
        .sort((a, b) => a.d - b.d)[0];
      if (cerca) onBorrar(cerca.s.id);
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
    const [x, y] = punto(e);
    arrastre.current = { id: s.id, x, y, base: s, tir };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const mueve = (e: React.PointerEvent) => {
    const a = arrastre.current;
    if (a?.tir) {
      e.stopPropagation();
      const [x, y] = punto(e);
      const t = a.tir;
      if (t.tam) {
        onCambiar({ ...a.base, w: tamPara(a.base, x) });
      } else {
        const p = [...a.base.p];
        p[t.ix] = x;
        p[t.iy] = y;
        onCambiar({ ...a.base, p });
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
    const [x, y] = punto(e);
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
    if (arrastre.current) {
      arrastre.current = null;
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
      onAdd(dibujando);
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
    });
  };

  const vistos = dibujando ? [...trazos, dibujando] : trazos;

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
                  <Forma s={s} agarre={22 / zoom} />
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
        <input
          className="canvas-draw-text"
          autoFocus
          // Mientras escribes se ve ya con su tipografía y su tamaño: si el
          // cuadro escribiera con otra letra, lo que sale al pulsar Enter
          // sería una sorpresa cada vez.
          style={{
            left: escribiendo.mx,
            top: escribiendo.my,
            color,
            fontSize: 8 * grosor * zoom,
            fontFamily: fuente(font).css,
          }}
          placeholder={t("Escribe y Enter")}
          value={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") cerrarTexto(true);
            if (e.key === "Escape") cerrarTexto(false);
            e.stopPropagation();
          }}
          onBlur={() => cerrarTexto(true)}
        />
      )}
    </>
  );
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
  const comun = agarre
    ? {
        stroke: "transparent",
        strokeWidth: Math.max(agarre, s.w),
        fill: "none",
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
      }
    : {
        stroke: s.color,
        strokeWidth: s.w,
        fill: "none",
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
        {s.txt}
      </text>
    );
  }

  if (s.t === "lapiz") {
    let d = "";
    for (let i = 0; i + 1 < s.p.length; i += 2) {
      d += `${i === 0 ? "M" : "L"}${s.p[i]} ${s.p[i + 1]} `;
    }
    return <path d={d} {...comun} />;
  }

  const [a, b, c, d] = s.p;

  if (s.t === "caja") {
    return (
      <rect
        x={Math.min(a, c)}
        y={Math.min(b, d)}
        width={Math.abs(c - a)}
        height={Math.abs(d - b)}
        rx={6}
        {...comun}
      />
    );
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
