import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useReactFlow, useViewport } from "@xyflow/react";
import { getStroke } from "perfect-freehand";
import rough from "roughjs/bin/rough";
import { useT } from "../lib/i18n";
import { escribiendoTexto } from "../lib/atajos";
import {
  ALCANCE_RATON,
  IMAN,
  INTERLINEA,
  anclaEn,
  cajaDe,
  cajaTexto,
  aRejilla,
  caminoCurvo,
  conSuGrupo,
  cuerpoEtiqueta,
  distTrazo,
  fuente,
  guiasDe,
  guionDe,
  imantar,
  movido,
  nuevoId,
  puntasDe,
  puntosRombo,
  seTocan,
  tamPara,
  tiradoresDe,
  type Caja,
  type DrawTool,
  type FontId,
  type Punta as TipoPunta,
  type Trama,
  type Tirador,
  type Trazo,
} from "../lib/trazos";

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
//
// El MODELO (qué es un trazo, cuánto ocupa, dónde cae) vive en
// `src/lib/trazos.ts`: es aritmética pura y se puede probar sin navegador.
// Aquí queda lo que solo se puede mirar, que es el SVG.

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
  /** Con qué se rellena lo próximo: macizo, rayado o cruzado. */
  trama: Trama;
  /** Si lo próximo sale con las esquinas vivas. */
  vivas: boolean;
  /** Si la próxima línea o flecha sale curva. */
  curva: boolean;
  /** La rejilla del lienzo. Con ella puesta, lo que dibujas cae en una casilla
      en vez de imantarse a los bordes de lo que hay al lado: son dos formas de
      alinear y encenderlas a la vez se pelearían por el mismo píxel. */
  rejilla: boolean;
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


export default function CanvasDraw({
  tool,
  color,
  grosor,
  glow,
  relleno,
  rugoso,
  trama,
  vivas,
  curva,
  rejilla,
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
    /** Y si además viene esto, lo que se escribe es la ETIQUETA de esa figura,
        no un texto suelto: vive dentro de la caja y se mueve con ella. */
    dentro?: boolean;
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
    /** Cuando la banda es un GRUPO de dibujo y no la selección del marco, las
        piezas del tablero no se mueven con ella: nadie las ha cogido. */
    soloTrazos?: boolean;
  } | null>(null);
  const capa = useRef<SVGSVGElement>(null);
  const activo = tool !== "sel";
  /** El trazo en curso, en un ref: los cierres que lo terminan (una tecla, un
      doble clic) no pueden depender del render en el que se crearon. */
  const dibujandoRef = useRef<Trazo | null>(null);
  dibujandoRef.current = dibujando;
  /** Si la línea o la flecha en curso es de VARIOS puntos: entonces cada clic
      clava un punto más en vez de terminarla. Se enciende sola cuando haces
      clic sin arrastrar, que es el gesto con el que nadie quería una línea de
      cero píxeles. */
  const multi = useRef(false);
  /** Si la goma está apoyada: mientras lo esté, todo lo que pase por debajo cae. */
  const borrando = useRef(false);
  /** Las líneas de alineación que se están enseñando ahora mismo. */
  const [guias, setGuias] = useState<{ x?: number; y?: number } | null>(null);

  /** Borra lo que haya bajo el punto, si hay algo. */
  const gomear = useCallback(
    (x: number, y: number) => {
      const cerca = trazos
        // Lo clavado al tablero no lo alcanza la goma: para eso está clavado.
        .filter((s) => !s.bloq)
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
        // Lo clavado no se borra con una tecla: primero se desclava. Si no,
        // «bloquear» solo protegería del ratón, que es media protección.
        if (trazos.find((s) => s.id === sel)?.bloq) return;
        e.preventDefault();
        onBorrar(sel);
        onSel(null);
      } else if (e.key === "Escape") {
        onSel(null);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [sel, trazos, onBorrar, onSel]);

  /**
   * Cerrar una línea de varios puntos.
   *
   * El último par de coordenadas es el que va siguiendo al ratón, así que al
   * cerrar se descarta: lo dibujado son los puntos que has clavado, no dónde
   * tenías el cursor al pulsar Enter.
   */
  const cerrarMulti = useCallback(
    (guardar: boolean) => {
      if (!multi.current) return;
      multi.current = false;
      const s = dibujandoRef.current;
      setDibujando(null);
      setGuias(null);
      if (!guardar || !s || s.p.length < 6) return;
      const p = s.p.slice(0, -2);
      onAdd({
        ...s,
        p,
        anclaDe: anclaEn(p[0], p[1], cajasNodos),
        anclaA: anclaEn(p[p.length - 2], p[p.length - 1], cajasNodos),
      });
      onFin();
    },
    [cajasNodos, onAdd, onFin],
  );

  // Enter la cierra y Escape la tira, que es lo mismo que hace el cuadro de
  // texto de al lado: dos gestos y los mismos en toda la app.
  useEffect(() => {
    if (!dibujando) return;
    const tecla = (e: KeyboardEvent) => {
      if (escribiendoTexto() || !multi.current) return;
      if (e.key === "Enter") {
        e.preventDefault();
        cerrarMulti(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        cerrarMulti(false);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [dibujando, cerrarMulti]);

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
      // Con la rejilla puesta manda la rejilla, y no se enseña guía: la guía
      // dice «te has alineado con AQUELLO», y aquí no te alineas con nada, caes
      // en una casilla. La cuadrícula del fondo ya enseña dónde.
      if (rejilla) {
        setGuias(null);
        return [aRejilla(x), aRejilla(y)];
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
    [punto, cajasNodos, trazos, zoom, rejilla],
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
    // Una línea de varios puntos ya empezada: cada clic clava un punto más y
    // sigue. El último par es el que va siguiendo al ratón, así que se fija
    // donde has pulsado y se añade otro que siga.
    if (multi.current && dibujando) {
      const [ix, iy] = puntoIman(e);
      setDibujando((s) => {
        if (!s) return s;
        const p = [...s.p];
        p[p.length - 2] = ix;
        p[p.length - 1] = iy;
        return { ...s, p: [...p, ix, iy] };
      });
      return;
    }
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
      // Lo mismo con el resto: solo donde significan algo. La trama vive con el
      // relleno, las esquinas solo las tienen el recuadro y el rombo, y curvar
      // una elipse no quiere decir nada.
      trama:
        (tool === "caja" || tool === "rombo" || tool === "elipse") && relleno && trama !== "macizo"
          ? trama
          : undefined,
      vivas: (tool === "caja" || tool === "rombo") && vivas ? true : undefined,
      curva: (tool === "linea" || tool === "flecha") && curva ? true : undefined,
      rugoso: rugoso || undefined,
      // El dado del temblor se echa UNA vez, aquí, y viaja con el trazo. Ver
      // `seed` en Trazo: sin él la figura hierve en cada repintado. También lo
      // necesita la trama rayada, que la calcula el mismo RoughJS.
      seed:
        rugoso || (relleno && trama !== "macizo")
          ? Math.floor(Math.random() * 2 ** 31)
          : undefined,
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
    // Clavado al tablero: ni se coge ni se mueve. El clic sigue su camino hacia
    // abajo, así que se puede agarrar lo que haya debajo del marco de fondo.
    if (s.bloq) return;
    // Sin esto React Flow tomaría el gesto por un panning del lienzo.
    e.stopPropagation();
    onGesto();
    const [x, y] = punto(e);
    // Agrupado: coger uno es coger a todos sus compañeros, y moverlo es mover
    // el grupo entero. Es lo que significa haberlos agrupado.
    const conGrupo = s.grupo ? conSuGrupo([s.id], trazos) : null;
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
    } else if (conGrupo && conGrupo.size > 1) {
      onSel(s.id);
      arrastre.current = {
        id: s.id,
        x,
        y,
        base: s,
        banda: trazos.filter((z) => conGrupo.has(z.id)),
        ux: 0,
        uy: 0,
        soloTrazos: true,
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
      if (!a.soloTrazos) onMoverNodos(dx - (a.ux ?? 0), dy - (a.uy ?? 0));
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
      // Se mueve SIEMPRE el último par, que en una figura de dos puntos es el
      // segundo y en una línea de varios es el que aún sigue al ratón.
      if (s.t !== "lapiz") {
        const p = [...s.p];
        p[p.length - 2] = x;
        p[p.length - 1] = y;
        return { ...s, p };
      }
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
        // Lo clavado no lo coge el marco: barrer por encima de un marco de
        // fondo para seleccionar lo de dentro es justo para lo que sirve.
        gesto
          ? trazos.filter((s) => !s.bloq && seTocan(caja, cajaDe(s))).map((s) => s.id)
          : [],
        gesto && marco.sumar,
      );
      setMarco(null);
      return;
    }
    if (!dibujando) return;
    e.stopPropagation();
    // En una línea de varios puntos, soltar no termina nada: se sigue clavando
    // puntos hasta el doble clic, el Enter o el Escape.
    if (multi.current) return;
    // Un clic sin arrastre no es una figura, es un clic: no deja rastro.
    const grande =
      dibujando.t === "lapiz"
        ? dibujando.p.length > 4
        : Math.hypot(dibujando.p[2] - dibujando.p[0], dibujando.p[3] - dibujando.p[1]) > 6 / zoom;
    if (!grande && (dibujando.t === "linea" || dibujando.t === "flecha")) {
      // Un clic suelto con la línea puesta no es un fallo: es que la quieres de
      // varios puntos. Se queda abierta y el siguiente clic clava el segundo.
      multi.current = true;
      return;
    }
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
      if (viejo && escribiendo.dentro) {
        // La etiqueta de una figura. Vacía se quita, pero la figura se queda:
        // borrar el rótulo de una caja no puede borrar la caja.
        onCambiar({ ...viejo, etiqueta: limpio || undefined });
      } else if (viejo) {
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

  /** Doble clic: sobre un texto lo reescribe; sobre una figura le pone el
   *  rótulo de dentro.
   *
   *  La etiqueta no es un texto suelto colocado encima: es un campo de la
   *  figura, así que se mueve con ella, se estira con ella y se borra con ella.
   *  Es lo que más se usa en un diagrama de verdad, y hacerlo con dos trazos
   *  sueltos obliga a recolocar el rótulo cada vez que mueves la caja. */
  const editarTexto = (e: React.MouseEvent, s: Trazo) => {
    if (tool !== "sel" || s.bloq) return;
    const rotulable = s.t === "caja" || s.t === "rombo" || s.t === "elipse";
    if (s.t !== "texto" && !rotulable) return;
    e.stopPropagation();
    if (rotulable) {
      const c = cajaDe(s);
      const cuerpo = cuerpoEtiqueta(s);
      setTexto(s.etiqueta ?? "");
      // Centrado en la figura, igual que se va a pintar: el cuadro de escribir
      // tiene que estar donde acabará el texto, no en una esquina. El `w` es el
      // que hace que el cuadro use el MISMO cuerpo de letra que el rótulo,
      // porque abajo se pinta como `8 * w`.
      setEscribiendo({
        mx: (c.x + c.w / 2) * zoom + vx,
        my: (c.y + c.h / 2) * zoom + vy - cuerpo * zoom * 0.7,
        x: c.x + c.w / 2,
        y: c.y + c.h / 2,
        id: s.id,
        dentro: true,
        color: s.color,
        w: cuerpo / 8,
        font: s.font,
      });
      return;
    }
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
        // El doble clic cierra una línea de varios puntos, que es el gesto de
        // toda la vida en un editor de vectores.
        onDoubleClick={() => cerrarMulti(true)}
      >
        {/* El viewport de React Flow, aplicado a mano: los trazos viven en
            coordenadas del lienzo, así que hacen zoom y se desplazan con los
            nodos en vez de quedarse pegados a la pantalla. */}
        <g transform={`translate(${vx},${vy}) scale(${zoom})`}>
          {vistos.map((s) => (
            <g
              key={s.id}
              className="canvas-draw-shape"
              // El id, también en el DOM: es como el exportador sabe qué grupo
              // es cada trazo cuando serializa esta misma capa.
              data-id={s.id}
              data-sel={s.id === sel || grupo.has(s.id)}
              data-bloq={s.bloq || undefined}
              data-grab={tool === "sel" && !s.bloq}
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
  const clave = `${s.id}|${s.seed}|${a}|${b}|${c}|${d}|${s.t}|${s.w}|${s.relleno ?? 0}|${s.trama ?? ""}|${s.vivas ? 1 : 0}`;
  const hecho = cacheRugosa.get(clave);
  if (hecho) return hecho;
  const opciones = {
    seed: s.seed || 1,
    // Menos temblor en las figuras pequeñas: una caja de veinte píxeles con la
    // rugosidad al máximo es una mancha ilegible. Es el `adjustRoughness` de
    // Excalidraw, con la misma idea aunque no con su fórmula exacta.
    // Casi cero cuando lo único que se quería eran las rayas y no el boceto: la
    // figura sale con el borde recto y solo el relleno viene de RoughJS.
    roughness: s.rugoso
      ? Math.min(1.6, Math.max(0.6, Math.hypot(c - a, d - b) / 260))
      : 0.35,
    strokeWidth: s.w,
    bowing: 1,
    fill: s.relleno ? s.color : undefined,
    // El nombre de RoughJS para lo que la barra llama trama. `hachure` sigue
    // siendo el valor por defecto del modo boceto: es lo que hacía antes de que
    // esto existiera, así que un tablero guardado se ve igual al actualizar.
    fillStyle:
      s.trama === "cruzado" ? "cross-hatch" : s.trama === "macizo" ? "solid" : "hachure",
    fillWeight: s.w / 2,
    hachureGap: s.w * 4,
    // Con poco temblor, obliga a que los vértices caigan donde tocan: si no,
    // una flecha «casi» toca la caja a la que apunta y se nota.
    preserveVertices: true,
  };
  const dib =
    s.t === "caja"
      ? rugo.rectangle(Math.min(a, c), Math.min(b, d), Math.abs(c - a), Math.abs(d - b), opciones)
      // RoughJS no sabe redondear esquinas, así que en modo boceto la caja sale
      // siempre con las esquinas vivas. No es una carencia que tapar: un boceto
      // hecho a mano no tiene radios exactos, y en Excalidraw pasa lo mismo.
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

/**
 * La punta de una línea, en el extremo (`x2`,`y2`) y apuntando en la dirección
 * que trae desde (`x1`,`y1`).
 *
 * El tamaño va con el grosor y no es fijo: una punta de seis píxeles en una
 * línea gruesa desaparece dentro de la propia línea.
 */
function Punta({
  x1,
  y1,
  x2,
  y2,
  s,
  tipo,
  agarre,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  s: Trazo;
  tipo: TipoPunta;
  agarre?: number;
}) {
  if (tipo === "nada") return null;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const L = 6 + s.w * 2.2;
  const ax = x2 - L * Math.cos(ang - Math.PI / 7);
  const ay = y2 - L * Math.sin(ang - Math.PI / 7);
  const bx = x2 - L * Math.cos(ang + Math.PI / 7);
  const by = y2 - L * Math.sin(ang + Math.PI / 7);
  if (tipo === "triangulo") {
    return (
      <polygon points={`${x2},${y2} ${ax},${ay} ${bx},${by}`} fill={agarre ? "transparent" : s.color} />
    );
  }
  // Abierta: dos rayas, como una flecha dibujada a mano. Nunca lleva guiones
  // aunque la línea sí: una punta a puntitos no se lee como punta.
  return (
    <path
      d={`M${ax} ${ay} L${x2} ${y2} L${bx} ${by}`}
      fill="none"
      stroke={agarre ? "transparent" : s.color}
      strokeWidth={agarre ?? s.w}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** Un trazo, ya en coordenadas del lienzo. Con `agarre` se pinta el mismo
    camino transparente y grueso, que es lo que el ratón puede acertar.
    La opacidad se aplica al conjunto, borde y relleno a la vez: es lo que
    significa «dejarlo medio transparente». */
function Forma({ s, agarre }: { s: Trazo; agarre?: number }) {
  if (!agarre && s.opacidad !== undefined && s.opacidad < 1) {
    return (
      <g opacity={s.opacidad}>
        <Pintada s={s} />
      </g>
    );
  }
  return <Pintada s={s} agarre={agarre} />;
}

function Pintada({ s, agarre }: { s: Trazo; agarre?: number }) {
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
  const macizo = !!s.relleno && (s.t === "caja" || s.t === "rombo" || s.t === "elipse");
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
        // El patrón va SOLO en lo que se ve: si el camino de agarre llevara
        // guiones, el ratón se colaría por los huecos y la línea se volvería
        // imposible de coger justo donde no hay tinta.
        strokeDasharray: guionDe(s),
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
  // Y también cuando la trama es rayada o cruzada aunque NO esté el modo
  // boceto: esas rayas las calcula RoughJS y no existen en SVG plano. Es lo
  // mismo que hace Excalidraw, que dibuja su relleno con Rough incluso con el
  // trazo «arquitecto». El temblor lo pone `roughness`, no esta rama.
  const conRayas = !!s.relleno && (s.trama === "rayado" || s.trama === "cruzado");
  if (
    (s.rugoso || conRayas) &&
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

  if (s.t === "caja" || s.t === "rombo" || s.t === "elipse") {
    // La esquina crece con la caja hasta un tope, en vez de ser siempre 6.
    // Con un radio fijo, una caja pequeña sale casi redonda y una grande casi
    // recta: las dos «igual de redondeadas» solo lo parecen si el radio es una
    // proporción. El 25 % con tope de 32 es de Excalidraw, medido allí.
    const lado = Math.min(Math.abs(c - a), Math.abs(d - b));
    const figura =
      s.t === "caja" ? (
        <rect
          x={Math.min(a, c)}
          y={Math.min(b, d)}
          width={Math.abs(c - a)}
          height={Math.abs(d - b)}
          rx={s.vivas ? 0 : Math.min(32, lado * 0.25)}
          {...comun}
        />
      ) : s.t === "rombo" ? (
        <polygon points={puntosRombo(s.p).map(([x, y]) => `${x},${y}`).join(" ")} {...comun} />
      ) : (
        <ellipse
          cx={(a + c) / 2}
          cy={(b + d) / 2}
          rx={Math.abs(c - a) / 2}
          ry={Math.abs(d - b) / 2}
          {...comun}
        />
      );
    if (agarre || !s.etiqueta) return figura;
    return (
      <>
        {figura}
        <Etiqueta s={s} />
      </>
    );
  }

  // Línea y flecha, de dos puntos o de veinte. Se pintan como una polilínea
  // única y no como tramos sueltos: así una esquina se une sola en vez de
  // dejar una muesca donde se tocan dos trazos.
  const puntos: string[] = [];
  for (let i = 0; i + 1 < s.p.length; i += 2) puntos.push(`${s.p[i]},${s.p[i + 1]}`);
  const [pDe, pA] = puntasDe(s);
  const n = s.p.length;
  return (
    <g>
      {/* Curva o recta, el mismo trazo por los mismos puntos. Para AGARRARLA se
          usa siempre la polilínea recta: la zona de agarre puede quedar un pelo
          por fuera de la curva y nadie lo nota, pero un `<path>` curvo con
          `stroke` gordo cuesta más de acertar que dos segmentos rectos. */}
      {s.curva && !agarre ? (
        <path d={caminoCurvo(s.p)} {...comun} />
      ) : (
        <polyline points={puntos.join(" ")} {...comun} />
      )}
      {/* Cada punta mira hacia fuera por el tramo que la trae: en una línea
          doblada, la del final apunta como el ÚLTIMO tramo, no como la recta
          imaginaria entre los dos extremos. */}
      <Punta x1={s.p[2]} y1={s.p[3]} x2={s.p[0]} y2={s.p[1]} s={s} tipo={pDe} agarre={agarre} />
      <Punta
        x1={s.p[n - 4]}
        y1={s.p[n - 3]}
        x2={s.p[n - 2]}
        y2={s.p[n - 1]}
        s={s}
        tipo={pA}
        agarre={agarre}
      />
    </g>
  );
}

/**
 * El rótulo escrito DENTRO de una figura.
 *
 * Se centra en la caja y se parte en líneas a mano, porque un `<text>` de SVG
 * no sabe hacer saltos de línea: cada línea es un `<tspan>` colocado a su
 * altura. El cuerpo de letra no es el grosor del borde (una caja de trazo
 * gordo no lleva letra gigante), sino un tamaño propio que baja si el texto no
 * cabe a lo ancho, que es lo que hace Excalidraw con sus contenedores.
 */
function Etiqueta({ s }: { s: Trazo }) {
  const c = cajaDe(s);
  const lineas = (s.etiqueta ?? "").split("\n");
  const f = fuente(s.font);
  // El tamaño lo decide `cuerpoEtiqueta`, que es el MISMO que usa el cuadro de
  // escribir: si no, se escribe con una letra y sale con otra.
  const cuerpo = cuerpoEtiqueta(s);
  const alto = cuerpo * INTERLINEA;
  const y0 = c.y + c.h / 2 - ((lineas.length - 1) * alto) / 2 + cuerpo * 0.34;
  return (
    <text
      x={c.x + c.w / 2}
      y={y0}
      fill={s.color}
      fontSize={cuerpo}
      fontFamily={f.css}
      textAnchor="middle"
      className="canvas-draw-label"
    >
      {lineas.map((l, i) => (
        <tspan key={i} x={c.x + c.w / 2} dy={i === 0 ? 0 : alto}>
          {l || " "}
        </tspan>
      ))}
    </text>
  );
}
