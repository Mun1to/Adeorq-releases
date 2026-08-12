import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { open as abrirArchivo, save as guardarComo } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { shellCommand, sessionIdOf } from "../lib/comandos";
import {
  accionDe,
  comoTexto,
  escribiendoTexto,
  resolver,
  type AccionId,
  type Atajos,
} from "../lib/atajos";
import { tecleandoEnOtro } from "../lib/tecleando";
import TerminalPane from "./TerminalPane";
import WidgetNode, { ES_UTILIDAD, WIDGETS, type WidgetData, type WidgetKind } from "./CanvasWidgets";
import ImageNode, { type ImageData, type Shape } from "./CanvasImage";
import NoteNode, { NOTE_COLORS, type NoteData } from "./CanvasNote";
import GalleryNode, { type GalleryData } from "./CanvasGallery";
import WebNode, { comoUrl, type WebData } from "./CanvasWeb";
import { encargoDeNota } from "../lib/notas";
import CanvasDraw, { DRAW_TOOLS } from "./CanvasDraw";
import {
  DRAW_COLORS,
  DRAW_FONTS,
  DRAW_WIDTHS,
  OPACIDADES,
  REJILLA,
  RELLENOS,
  TRAMAS,
  alineados,
  cajaDe,
  cajaDeVarios,
  conSuGrupo,
  desempaquetar,
  empaquetar,
  fuente,
  movido,
  nuevoId,
  puntoDeAncla,
  repartidos,
  seTocan,
  type Alineacion,
  type Ancla,
  type Caja,
  type DrawTool,
  type FontId,
  type Guion,
  type Punta,
  type Trama,
  type Trazo,
} from "../lib/trazos";
import {
  BrowserIcon,
  ChatIcon,
  GalleryIcon,
  GridIcon,
  KanbanIcon,
  NoteIcon,
  PencilIcon,
  PinIcon,
  TrashIcon,
  UndoIcon,
} from "./Icons";
import { kindDeComando } from "./KindIcon";
import {
  CANVAS_FILE_KIND,
  CANVAS_FILE_VERSION,
  nombreSugerido,
  parsear,
  resumen,
  type CanvasFile,
  type FlechaGuardada,
  type NodoGuardado,
} from "../lib/canvasFile";
import {
  lastReply,
  listProjects,
  noteRead,
  readBoard,
  readCanvasFile,
  saveBoard,
  saveCanvasFile,
  saveDrawing,
  savePastedImage,
  sessionContext,
  writePty,
  type PaneStatus,
  type Project,
  type WorkState,
} from "../lib/pty";
import { useT } from "../lib/i18n";
import { propsDeVelo } from "../lib/velo";
import KanbanNode, { type AgenteVivo, type KanbanData, type Pendiente } from "./CanvasKanban";
import ChatNode, { MODELO_DEFECTO, type ChatData } from "./CanvasChat";
import { chatOlvidar } from "../lib/chat";
import { useMenu, type MenuItem } from "./Overlays";
import type { NotifyMode } from "../lib/notify";
import type { Hit } from "../lib/redact";

// META 5: the cockpit as a board. The grid stays untouched (it works and is
// used daily); this is a second workspace where terminals can be placed freely
// AND wired together, so one agent's result feeds the next one.

/** Si dejaste puesta la rejilla del lienzo. */
const REJILLA_KEY = "adeorq-lienzo-rejilla";

/** En qué modo dejaste el lienzo. */
const MODO_KEY = "adeorq-lienzo-modo";

/**
 * Los tres lienzos que caben en el lienzo (Munir, 2026-08-09).
 *
 * El tablero hace dos trabajos que casi nunca se hacen a la vez: dirigir
 * agentes y pensar dibujando. Con las dos cosas siempre encima, la barra tiene
 * diecisiete botones de los que en cada momento sobran diez, y basta un clic
 * torcido para plantar una flecha cuando ibas a mover una terminal.
 *
 * · `terminales` es el tablero de trabajo: terminales y piezas (kanban, notas,
 *   chat, relojes) y nada de dibujo. Los trazos no se borran, se guardan igual
 *   y vuelven enteros al cambiar de modo: esto es una vista, no una papelera.
 * · `dibujo` es la pizarra: todas las herramientas y todos los trazos. Las
 *   piezas siguen viéndose, porque dibujar sirve justamente para anotarlas,
 *   pero no se arrastran: con el lápiz en la mano, un arrastre es un trazo.
 * · `todo` es lo de siempre, para quien lo quiera todo a la vez.
 */
export type ModoLienzo = "terminales" | "dibujo" | "todo";

const MODOS: Array<{ id: ModoLienzo; label: string; tip: string }> = [
  {
    id: "terminales",
    label: "Terminales",
    tip: "Solo el trabajo: terminales y piezas, sin nada de dibujo. Tus trazos no se borran, vuelven al cambiar de modo.",
  },
  {
    id: "dibujo",
    label: "Dibujo",
    tip: "La pizarra: todas las herramientas y tus trazos. Las piezas se ven para poder anotarlas, pero no se arrastran.",
  },
  { id: "todo", label: "Todo", tip: "Las dos cosas a la vez, como siempre." },
];

export interface CanvasPane {
  id: number;
  cwd: string;
  name: string;
  command?: string[];
  /** Con qué cuenta y con qué clave nace, decidido una sola vez al abrirla.
      Igual que en la cabina: si el router elige una cuenta secundaria, la
      terminal tiene que arrancar de verdad en ella. */
  env?: Record<string, string>;
  account?: string;
  shadow?: boolean;
}

type SpawnKind = "claude" | "shell" | "agy";

/** Todo lo que puede vivir en el lienzo. */
type CanvasNode =
  | Node<TermData>
  | Node<WidgetData>
  | Node<ImageData>
  | Node<NoteData>
  | Node<GalleryData>
  | Node<WebData>
  | Node<KanbanData>
  | Node<ChatData>;

interface Props {
  /** Si la vista del Lienzo es la que se está viendo AHORA.
   *
   *  Hace falta porque el lienzo no se desmonta al cambiar de pestaña: se
   *  esconde con `display: none`, o sus terminales se morirían. Y un elemento
   *  escondido así mide CERO, así que el encuadre automático de React Flow, que
   *  se hace al montar, calcula sobre una caja de 0x0 y deja la cámara en
   *  cualquier sitio. Al volver, el tablero aparece arriba a la izquierda y tú
   *  mirando el vacío de abajo a la derecha (Munir, 2026-08-12). */
  visible: boolean;
  panes: CanvasPane[];
  /** Las de la cabina, solo para que el kanban pueda contarlas: el lienzo no
      las pinta ni las toca. Sin ellas el tablero diría que no hay nadie
      trabajando mientras seis agentes trabajan en la otra vista. */
  panesCabina: CanvasPane[];
  /** Lo que hace cada terminal ahora, de las dos vistas. Lo junta App. */
  estados: Record<number, PaneStatus>;
  /** Para que las del lienzo también reporten: antes solo lo hacían las de la
      cabina, así que ni el kanban ni el Capataz sabían nada de estas. */
  onStatus: (s: PaneStatus) => void;
  fontSize: number;
  autoFont: boolean;
  stream: boolean;
  onSecret: (hits: Hit[], severe: boolean) => void;
  notifyMode: NotifyMode;
  /** Con esto puesto, cuando un agente del lienzo termina la cámara va a él. */
  saltarAlTerminar: boolean;
  /** Los que él haya cambiado en Ajustes; el resto salen de fábrica. */
  atajos: Atajos;
  /** Creates a pane and returns it whole: the node must mount with the real
   *  command or the terminal would start as a plain shell and stay one. */
  onCreate: (
    kind: SpawnKind,
    project: Project,
    propio?: { name?: string; command?: string[] },
  ) => CanvasPane;
  /** Recuperar el tablero al abrir, el mismo ajuste que usa la Cabina. */
  recuperar: boolean;
  /** Convierte el comando con el que nació una terminal en el que la devuelve
   *  a SU conversación. Lo resuelve App, que es quien sabe de sesiones. */
  alVolver: (cwd: string, command?: string[]) => Promise<string[] | undefined>;
  /** Abre una terminal del lienzo con un encargo dentro, y lo deja apuntado.
   *  Lo resuelve App, que es quien sabe acuñar sesiones y guardar encargos. */
  onLanzarEncargo: (texto: string, project: Project) => void;
  /** Varias tarjetas juntas: abre el Reparto ya escrito para que decida
   *  cerebros y fronteras antes de gastar nada. */
  onRepartirTarjetas: (texto: string, project: Project, alAbrir: () => void) => void;
  onClose: (id: number) => void;
  /** El asa para que una sesión suprema pida flechas por MCP. La rellena el
   *  lienzo al montarse y la vacía al irse, así que App puede preguntar si hay
   *  lienzo abierto sin saber nada de él. Ver `docs/SUPREMA.md`. */
  enlazarRef?: React.MutableRefObject<
    ((from: number, to: number, auto: boolean) => boolean) | null
  >;
}

/** What travels along an arrow when the upstream agent finishes. */
interface Relay {
  edgeId: string;
  fromId: number;
  toId: number;
  fromName: string;
  toName: string;
  brief: string;
  /** Arrows marked auto skip the button and hand over on their own. */
  auto: boolean;
  /** Por qué este relevo sigue parado, cuando lo está. La entrega automática
   *  se frena sola si el agente de origen no terminó (te preguntó algo) o si
   *  la flecha se ha desbocado; el motivo se enseña en la barra en vez de
   *  dejar un relevo quieto sin explicación. */
  espera?: string;
}

/** Los estados en los que el agente NO ha terminado: te está hablando a ti.
 *  Entregar aquí le manda media respuesta al siguiente de la cadena. */
const TE_HABLA_A_TI = new Set<WorkState>(["pregunta", "ofrece", "tuya"]);

/** Cuántas entregas automáticas seguidas admite una flecha, y en cuánto rato.
 *  Dos flechas automáticas que se apuntan la una a la otra se pasan el relevo
 *  para siempre, y cada vuelta es un turno de agente que se paga. */
const TOPE_AUTO = 3;
const VENTANA_AUTO = 10 * 60_000;

/** ¿Se llega de `desde` hasta `hasta` siguiendo flechas? Sirve para avisar de
 *  que la flecha que acabas de dibujar cierra un círculo. */
function alcanza(desde: string, hasta: string, list: Edge[]): boolean {
  const vistos = new Set<string>();
  const pila = [desde];
  while (pila.length) {
    const n = pila.pop() as string;
    if (n === hasta) return true;
    if (vistos.has(n)) continue;
    vistos.add(n);
    for (const e of list) if (e.source === n) pila.push(e.target);
  }
  return false;
}

interface TermData extends Record<string, unknown> {
  pane: CanvasPane;
  /** Qué se abrió aquí y en qué proyecto. Un PTY vivo no cabe en un archivo:
   *  para poder reabrir el tablero hay que guardar la receta, no el proceso. */
  kind: SpawnKind;
  proyecto: string;
  fontSize: number;
  autoFont: boolean;
  stream: boolean;
  onSecret: (hits: Hit[], severe: boolean) => void;
  notifyMode: NotifyMode;
  focused: boolean;
  onFocus: (id: number) => void;
  onClose: (id: number) => void;
  onSplit: (id: number) => void;
  onZoom: (id: number) => void;
  onTurnEnd: (id: number) => void;
  /** Su estado hacia arriba: lo consume el kanban y el Capataz. */
  onStatus: (s: PaneStatus) => void;
}

const NODE_W = 640;
const NODE_H = 420;
// Aquí vivía `GAP`, la separación entre piezas cuando las nuevas se colocaban
// solas en filas de tres desde el origen. Se fue con esa forma de colocarlas
// (2026-08-09): ahora nacen centradas en lo que estás mirando, así que no hay
// ninguna fila que separar. Se quita en vez de dejarla por si acaso, que una
// constante sin dueño es una pista falsa para el siguiente.

/** Lo que mide una pieza. React Flow lo sabe una vez pintada (`measured`); si
    aún no lo está, manda lo que se le pidió, y si tampoco, el tamaño de casa. */
const medida = (n: CanvasNode, wDef: number, hDef: number) => ({
  w: n.measured?.width ?? Number(n.style?.width) ?? wDef,
  h: n.measured?.height ?? Number(n.style?.height) ?? hDef,
});

/** Lo que ocupa una pieza en el lienzo, en el mismo idioma que los trazos. */
const cajaNodo = (n: CanvasNode): Caja => ({
  x: n.position.x,
  y: n.position.y,
  ...medida(n, NODE_W, NODE_H),
});

/** A live terminal inside a node. The header doubles as the drag handle. */
function TermNode({ data, selected }: NodeProps<Node<TermData>>) {
  const d = data;
  return (
    // `nodrag` estaba aquí, en la raíz del nodo, y hacía imposible arrastrar la
    // terminal por su cabecera. React Flow exige LAS DOS cosas a la vez:
    //   (!noDragClassName || !hasSelector(target, '.nodrag')) &&
    //   (!handleSelector  ||  hasSelector(target, handleSelector))
    // y como `.pane-head` vive dentro de este div, la primera siempre daba
    // falso. Parecía intermitente porque el borde del nodo sí queda fuera.
    // Con `dragHandle: ".pane-head"` puesto, `nodrag` sobra: la segunda
    // condición ya impide que un arrastre empiece dentro del terminal.
    // `nowheel` se queda: eso es la rueda, y ahí sí hay que scrollear el
    // terminal en vez del lienzo.
    <div className="rf-term nowheel" data-selected={selected}>
      <NodeResizer minWidth={360} minHeight={220} isVisible={selected} />
      <Handle type="target" position={Position.Left} className="rf-handle" />
      <TerminalPane
        id={d.pane.id}
        cwd={d.pane.cwd}
        name={d.pane.name}
        command={d.pane.command}
        env={d.pane.env}
        account={d.pane.account}
        hidden={false}
        focused={d.focused}
        maximized={false}
        fontSize={d.fontSize}
        autoFont={d.autoFont}
        stream={d.stream}
        onSecret={d.onSecret}
        notifyMode={d.notifyMode}
        onClose={d.onClose}
        onFocusPane={d.onFocus}
        onSplit={(id) => d.onSplit(id)}
        onToggleMax={(id) => d.onZoom(id)}
        onTurnEnd={d.onTurnEnd}
        onStatus={d.onStatus}
        shadow={d.pane.shadow}
      />
      <Handle type="source" position={Position.Right} className="rf-handle" />
    </div>
  );
}

/** Bracketed paste: without it every newline of a brief would hit Enter and
 *  send the message in pieces. This is how a real paste reaches the CLI. */
function pasteInto(id: number, text: string, send: boolean): void {
  const body = `\x1b[200~${text}\x1b[201~`;
  void writePty(id, send ? `${body}\r` : body).catch(() => {});
}

function sidOf(pane: CanvasPane): string | undefined {
  return sessionIdOf(pane.command);
}

function Canvas({
  visible,
  panes,
  panesCabina,
  estados,
  onStatus,
  fontSize,
  autoFont,
  stream,
  onSecret,
  notifyMode,
  saltarAlTerminar,
  atajos,
  recuperar,
  alVolver,
  onCreate,
  onLanzarEncargo,
  onRepartirTarjetas,
  onClose,
  enlazarRef,
}: Props) {
  const { t } = useT();
  const flow = useReactFlow();
  /** Ver lib/velo.ts: distingue pinchar el velo de soltar ahí un arrastre que
      empezó dentro del diálogo, que es lo que cerraba sin querer. */
  const bajoEnVelo = useRef(false);
  // El lienzo ya no lleva solo terminales: los widgets son nodos de pleno
  // derecho, con sus propios datos, así que el estado guarda la unión.
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  /** Si ya se encuadró el tablero desde que se abrió la app. Una sola vez: a
      partir de ahí manda dónde lo hayas dejado tú. */
  const encuadrado = useRef(false);
  /* Encuadrar el tablero la PRIMERA vez que se ve de verdad.
   *
   * El `fitView` que React Flow trae de serie se hace al montar, y aquí el
   * lienzo se monta escondido con `display: none` (ver la prop `visible`), o
   * sea midiendo cero. Encuadrar sobre una caja de 0x0 no encuadra nada, y por
   * eso al entrar te encontrabas el trabajo arriba a la izquierda y la cámara
   * mirando al vacío. Aquí se esperan las dos condiciones que hacen que la
   * cuenta signifique algo: que la vista esté delante y que haya algo que
   * encuadrar.
   *
   * Una sola vez, y ese es el punto: si se encuadrara en cada visita, volver
   * del Panel te movería el tablero que acabas de colocar. */
  useEffect(() => {
    if (!visible || encuadrado.current || nodes.length === 0) return;
    // Un respiro para que el navegador aplique el `display` y el contenedor
    // tenga medidas: leerlas en el mismo tick devuelve las de antes.
    const t = window.setTimeout(() => {
      encuadrado.current = true;
      void flow.fitView({ padding: 0.15, duration: 260 });
    }, 60);
    return () => window.clearTimeout(t);
  }, [visible, nodes.length, flow]);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState("");
  const [relays, setRelays] = useState<Relay[]>([]);
  const [editing, setEditing] = useState<Edge | null>(null);
  const [brief, setBrief] = useState("");
  const [note, setNote] = useState<string | null>(null);
  // Dibujo: la herramienta viva y lo ya dibujado. Los trazos son del lienzo y
  // no de un nodo, porque su gracia es rodear y unir varios a la vez.
  const [tool, setTool] = useState<DrawTool>("sel");
  /**
   * La rejilla: con ella puesta, todo cae en una casilla.
   *
   * El fondo del lienzo lleva desde siempre una cuadrícula de puntos pintada
   * que no sujetaba nada, así que las piezas caían ENTRE los puntos: se veía
   * una rejilla y no servía de nada. Ahora es de verdad, y usa el mismo paso
   * que esos puntos (`REJILLA`), para que lo que ves y lo que pasa sean la
   * misma cosa.
   *
   * Apagada de fábrica: es un cambio grande en cómo se siente mover algo, y
   * eso se enciende queriendo. Se recuerda entre sesiones.
   */
  const [rejilla, setRejilla] = useState(
    () => localStorage.getItem(REJILLA_KEY) === "1",
  );
  /** En cuál de los tres lienzos estás. Ver `MODOS` arriba. */
  const [modo, setModo] = useState<ModoLienzo>(() => {
    const g = localStorage.getItem(MODO_KEY);
    return g === "terminales" || g === "dibujo" ? g : "todo";
  });
  const dibujable = modo !== "terminales";
  const [color, setColor] = useState(DRAW_COLORS[0]);
  const [grosor, setGrosor] = useState(DRAW_WIDTHS[1]);
  /** Dibujar con halo: lo que le gustó del resaltado de la selección, pero
      puesto a propósito y para siempre. */
  const [glow, setGlow] = useState(false);
  /** Cuánto relleno lleva la próxima caja o elipse: 0 hueca, 0.25 translúcida,
      0.85 maciza. Tres pasos y no una barra, ver el botón. */
  const [relleno, setRelleno] = useState(0);
  /** Lo transparente que sale lo próximo, borde incluido. 1 es opaco. */
  const [opacidad, setOpacidad] = useState(1);
  /** El patrón de la línea: entera, a guiones o a puntos. */
  const [guion, setGuion] = useState<Guion>("solido");
  /** Si lo próximo se dibuja a mano alzada. Nace apagado a propósito: encenderlo
      de fábrica cambiaría el aspecto de todos los tableros que ya existen. */
  const [rugoso, setRugoso] = useState(false);
  /** Con qué se rellena lo próximo: macizo, rayado o cruzado (Excalidraw). */
  const [trama, setTrama] = useState<Trama>("macizo");
  /** Si lo próximo sale con las esquinas vivas en vez de redondeadas. */
  const [vivas, setVivas] = useState(false);
  /** Si la próxima línea o flecha sale curva en vez de recta. */
  const [curva, setCurva] = useState(false);
  const [fuenteId, setFuenteId] = useState<FontId>("app");
  /** El trazo cogido con la flecha, si hay alguno. */
  const [selTrazo, setSelTrazo] = useState<string | null>(null);
  /** Y los que se han cogido de varios en varios, rodeándolos con el marco. Se
      declara aquí arriba, lejos de su historia (ver «coger varias cosas a la
      vez»), porque la barra de estilo lo necesita y la barra se monta antes. */
  const [grupo, setGrupo] = useState<Set<string>>(new Set());
  /** Si el grupo se ha pedido a propósito: es lo que saca la barra de acciones.
      Ver «coger varias cosas a la vez» para el porqué de que sea aparte. */
  const [activo, setActivo] = useState(false);
  const [trazos, setTrazos] = useState<Trazo[]>([]);
  const [fijar, setFijar] = useState(false);
  // Un lienzo leído de disco, esperando el OK: importar abre procesos.
  const [entrante, setEntrante] = useState<CanvasFile | null>(null);
  const [picker, setPicker] = useState(false);
  const [filtro, setFiltro] = useState("");
  const menu = useMenu();
  // Read inside callbacks that must not be rebuilt on every state change.
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const saltarRef = useRef(saltarAlTerminar);
  saltarRef.current = saltarAlTerminar;
  const trazosRef = useRef(trazos);
  trazosRef.current = trazos;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  // Los atajos de verdad, releídos cuando cambian en Ajustes. En un ref porque
  // el manejador de teclas no debe rehacerse por esto.
  const mapaRef = useRef(resolver(atajos));
  mapaRef.current = resolver(atajos);
  const panesRef = useRef(panes);
  panesRef.current = panes;
  /** Flechas que ya han intentado entregar con la campana de ahora, para no
   *  repetir el intento en cada repintado. Se vacía en la campana siguiente. */
  const firedRef = useRef<Set<string>>(new Set());
  /** Cuándo entregó sola cada flecha, para cortar las que se desbocan. */
  const autoRef = useRef<Map<string, number[]>>(new Map());

  useEffect(() => {
    listProjects()
      .then((list) => {
        setProjects(list);
        setProject((p) => p || list[0]?.name || "");
      })
      .catch(() => {});
  }, []);

  const handleClose = useCallback(
    (id: number) => {
      onClose(id);
      setNodes((prev) => prev.filter((n) => n.id !== String(id)));
      setEdges((prev) =>
        prev.filter((e) => e.source !== String(id) && e.target !== String(id)),
      );
    },
    [onClose],
  );

  /** La cámara a una pieza cualquiera, por su id de NODO. */
  const zoomANodo = useCallback(
    (nodeId: string) => {
      if (flow.getNode(nodeId)) {
        void flow.fitView({ nodes: [{ id: nodeId }], duration: 300, padding: 0.1 });
      }
    },
    [flow],
  );

  /** La cámara a una TERMINAL, que se llama como su número de panel. */
  const zoomTo = useCallback((id: number) => zoomANodo(String(id)), [zoomANodo]);

  // An agent finished its turn: every arrow leaving it becomes a pending relay.
  const onTurnEnd = useCallback((id: number) => {
    // Y, si lo has pedido en Ajustes, la cámara va a esa pieza. Aquí no se
    // maximiza nada (el lienzo no tiene pantalla completa): se acerca, que es
    // lo mismo dicho en tablero. Si estás escribiendo en otra terminal no se
    // mueve, por lo mismo que en la cabina.
    if (saltarRef.current && !tecleandoEnOtro(id)) {
      setFocusedId(id);
      zoomTo(id);
    }
    const outgoing = edgesRef.current.filter((e) => e.source === String(id));
    if (!outgoing.length) return;
    // Cada campana da derecho a UN intento por flecha. Es lo que permite que
    // un relevo frenado porque el agente preguntó vuelva a intentarse solo en
    // cuanto le contestas, sin reintentar en bucle mientras tanto.
    for (const e of outgoing) firedRef.current.delete(e.id);
    const list = panesRef.current;
    const from = list.find((p) => p.id === id);
    setRelays((prev) => {
      const fresh = outgoing
        .filter((e) => !prev.some((r) => r.edgeId === e.id))
        .map((e) => {
          const to = list.find((p) => p.id === Number(e.target));
          return {
            edgeId: e.id,
            fromId: id,
            toId: Number(e.target),
            fromName: from?.name ?? String(id),
            toName: to?.name ?? e.target,
            brief: String(e.data?.brief ?? ""),
            auto: !!e.data?.auto,
          };
        })
        .filter((r) => list.some((p) => p.id === r.toId));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, [zoomTo]);

  const splitRef = useRef<(id: number) => void>(() => {});

  /**
   * Dónde nace una pieza nueva: centrada en lo que la cámara enseña ahora.
   *
   * `n` solo sirve para escalonarla un poco. Sin eso, abrir tres seguidas sin
   * tocar el lienzo las dejaría exactamente una encima de otra y parecería que
   * solo se abrió una, que es el mismo fallo del que venimos con otra cara.
   */
  const centroDeLaVista = useCallback(
    (n: number) => {
      const caja = hoja.current?.getBoundingClientRect();
      const escalon = (n % 4) * 28;
      if (!caja) return { x: escalon, y: escalon };
      const c = flow.screenToFlowPosition({
        x: caja.left + caja.width / 2,
        y: caja.top + caja.height / 2,
      });
      // Del CENTRO de la pieza, no de su esquina: si se colocara la esquina en
      // el centro de la pantalla, media terminal quedaría fuera por abajo y por
      // la derecha, que era casi el mismo problema en pequeño.
      return { x: c.x - NODE_W / 2 + escalon, y: c.y - NODE_H / 2 + escalon };
    },
    [flow],
  );

  const place = useCallback(
    (
      kind: SpawnKind,
      p: Project,
      en?: { x: number; y: number; w?: number; h?: number },
      propio?: { name?: string; command?: string[] },
    ): CanvasPane => {
      const pane = onCreate(kind, p, propio);
      setNodes((prev) => {
        /* Nace EN EL CENTRO DE LO QUE ESTÁS MIRANDO. Al importar un lienzo la
           posición viene dada: ahí manda el archivo.

           ⚠ Antes se colocaban en filas de tres contando desde el origen
           (`x: (i%3)*ancho, y: floor(i/3)*alto`), y eso solo funciona mientras
           nadie mueva nada. En el lienzo de Munir, con doce piezas repartidas
           entre y=-969 e y=382, la siguiente le salía en y=1840: mil
           cuatrocientos píxeles por debajo de lo más bajo que tenía. La
           terminal se abría perfectamente y él no la veía, así que parecía que
           el botón no hacía nada (2026-08-09). Un contador no sabe dónde estás
           mirando; la cámara sí. */
        const position = en ?? centroDeLaVista(prev.length);
        // Anotado a mano: con el estado ya en unión (terminales + widgets),
        // un literal suelto haría que TypeScript fundiese los dos `data` y no
        // encajaría en ninguno de los dos.
        const nodo: Node<TermData> = {
          id: String(pane.id),
          type: "term",
          position,
          style: { width: en?.w ?? NODE_W, height: en?.h ?? NODE_H },
          dragHandle: ".pane-head",
          data: {
            pane,
            kind,
            proyecto: p.name,
            fontSize,
            autoFont,
            stream,
            onSecret,
            notifyMode,
            focused: false,
            onFocus: setFocusedId,
            onClose: handleClose,
            onSplit: (id: number) => splitRef.current(id),
            onZoom: zoomTo,
            onTurnEnd,
            onStatus,
          },
        };
        return [...prev, nodo];
      });
      setFocusedId(pane.id);
      return pane;
    },
    [
      onCreate,
      fontSize,
      autoFont,
      stream,
      onSecret,
      notifyMode,
      handleClose,
      zoomTo,
      onTurnEnd,
      onStatus,
    ],
  );

  const spawn = useCallback(
    (kind: SpawnKind) => {
      const p = projects.find((x) => x.name === project);
      if (p) place(kind, p);
    },
    [projects, project, place],
  );

  // The pane's ◫ button on the canvas means "a console next to this one, in
  // the same folder", already wired so the pair reads as one unit.
  splitRef.current = (id: number) => {
    const src = panesRef.current.find((p) => p.id === id);
    if (!src) return;
    const born = place("shell", { name: src.name, path: src.cwd, hasGit: false });
    setEdges((prev) =>
      addEdge(
        {
          id: `e-${id}-${born.id}`,
          source: String(id),
          target: String(born.id),
          animated: false,
          data: { brief: "", auto: false },
          label: "encargo…",
        },
        prev,
      ),
    );
  };

  // Nodes hold a copy of the pane data; keep it in step with App's list without
  // ever replacing the node object identity (that would kill the terminal).
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n): CanvasNode => {
        // Un widget no tiene panel que sincronizar: se salta entero, y así el
        // resto del bloque puede seguir hablando solo de terminales.
        if (n.type !== "term") return n;
        const term = n as Node<TermData>;
        const pane = panes.find((p) => p.id === Number(term.id));
        if (!pane) return term;
        const focused = focusedId === pane.id;
        if (
          term.data.pane === pane &&
          term.data.focused === focused &&
          term.data.fontSize === fontSize &&
          term.data.autoFont === autoFont &&
          term.data.stream === stream &&
          term.data.notifyMode === notifyMode
        ) {
          return term;
        }
        return {
          ...term,
          data: { ...term.data, pane, focused, fontSize, autoFont, stream, notifyMode },
        };
      }),
    );
  }, [panes, focusedId, fontSize, autoFont, stream, notifyMode]);

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) =>
      setNodes((prev) => applyNodeChanges(changes, prev)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((prev) => applyEdgeChanges(changes, prev)),
    [],
  );

  /** Le escribe a una terminal lo que dice una nota, sin enviarlo. */
  const pasarNota = useCallback(
    async (noteId: string, paneId: number) => {
      try {
        const f = await noteRead(noteId);
        pasteInto(paneId, encargoDeNota(f), false);
        setFocusedId(paneId);
        setNote(t("Tu nota está escrita en esa terminal. El Enter lo das tú."));
      } catch (e) {
        setNote(String(e));
      }
    },
    [t],
  );

  /**
   * Una flecha nueva. Con dos terminales espera a que la de origen termine su
   * turno; con una NOTA de origen no hay turno que esperar, así que conectar
   * ES entregar: se le escribe ahí mismo lo que dice la nota. Es lo que uno
   * espera al arrastrar una flecha de sus tareas a un agente.
   */
  /* La flecha que pide un agente por MCP, no un dedo arrastrando.
   *
   * Es la MISMA flecha que dibujas tú: entra en `edges` igual, la mueve el
   * mismo `onTurnEnd` y la frena el mismo tope de tres entregas. Lo único que
   * cambia es quién la pidió, así que nace SIEMPRE a la espera de un clic salvo
   * que el agente pida automática a conciencia: una flecha automática gasta
   * cuota sin que nadie mire.
   *
   * Devuelve si se pudo, y no se puede si alguna de las dos terminales no está
   * en el lienzo: ahí no hay nada a lo que enganchar la punta. Ver
   * `docs/SUPREMA.md`. */
  useEffect(() => {
    if (!enlazarRef) return;
    enlazarRef.current = (from, to, auto) => {
      if (!flow.getNode(String(from)) || !flow.getNode(String(to))) return false;
      if (from === to) return false;
      if (alcanza(String(to), String(from), edgesRef.current)) {
        setNote(t("Un agente ha pedido una flecha que cierra un círculo."));
        window.setTimeout(() => setNote(null), 8000);
      }
      setEdges((prev) =>
        addEdge(
          {
            source: String(from),
            target: String(to),
            // Sin asa concreta: una flecha pedida por un agente no sale de un
            // punto de la caja, sale de la terminal entera.
            sourceHandle: null,
            targetHandle: null,
            animated: true,
            label: "encargo…",
            data: { brief: "", auto },
          },
          prev,
        ),
      );
      return true;
    };
    return () => {
      enlazarRef.current = null;
    };
  }, [enlazarRef, flow, t]);

  const onConnect = useCallback(
    (c: Connection) => {
      const origen = flow.getNode(String(c.source));
      // Cerrar un círculo puede ser lo que quieres (dos agentes que se revisan
      // el trabajo), así que no se prohíbe: se avisa. En automático, un círculo
      // gira solo hasta que alguien lo para, y ese alguien cobra por turno.
      if (alcanza(String(c.target), String(c.source), edgesRef.current)) {
        setNote(t("Ojo: esta flecha cierra un círculo. En automático giraría sin parar."));
        window.setTimeout(() => setNote(null), 8000);
      }
      const noteId =
        origen?.type === "note" ? String((origen.data as NoteData).noteId) : undefined;
      setEdges((prev) =>
        addEdge(
          {
            ...c,
            animated: true,
            label: noteId ? t("notas") : "encargo…",
            data: { brief: "", auto: false, nota: noteId },
          },
          prev,
        ),
      );
      const destino = flow.getNode(String(c.target));
      if (noteId && destino?.type === "term") void pasarNota(noteId, Number(c.target));

      // Una captura enganchada a una terminal se manda, igual que una nota.
      // Aplanarla (imagen + flechas) solo sabe el propio nodo, así que aquí se
      // le deja el recado y él se encarga.
      if (origen?.type === "img" && destino?.type === "term") {
        const paneId = Number(c.target);
        setNodes((prev) =>
          prev.map((nodo) => {
            if (nodo.id !== origen.id || nodo.type !== "img") return nodo;
            const d = nodo.data as ImageData;
            const pedido = { paneId, n: (d.pedido?.n ?? 0) + 1 };
            return { ...nodo, data: { ...d, pedido } } as CanvasNode;
          }),
        );
      }
    },
    [flow, pasarNota, setNodes, t],
  );

  const saveBrief = () => {
    if (!editing) return;
    setEdges((prev) =>
      prev.map((e) =>
        e.id === editing.id
          ? { ...e, label: brief.trim() || "encargo…", data: { ...e.data, brief: brief.trim() } }
          : e,
      ),
    );
    setEditing(null);
  };

  const toggleAuto = () => {
    if (!editing) return;
    const next = !editing.data?.auto;
    setEditing({ ...editing, data: { ...editing.data, auto: next } });
    setEdges((prev) =>
      prev.map((e) => (e.id === editing.id ? { ...e, data: { ...e.data, auto: next } } : e)),
    );
  };

  /** Deja el relevo parado con su motivo, en vez de descartarlo. Vuelve a
   *  intentarse solo en la campana siguiente. */
  const frenar = (edgeId: string, motivo: string) =>
    setRelays((prev) =>
      prev.map((x) => (x.edgeId === edgeId && x.espera !== motivo ? { ...x, espera: motivo } : x)),
    );

  /** `auto` distingue quién manda el relevo: el reloj o tú. Solo el automático
   *  comprueba nada — si le das al botón, entregas y punto. */
  const runRelay = async (r: Relay, send: boolean, auto = false) => {
    const from = panes.find((p) => p.id === r.fromId);
    // La campana del CLI suena al acabar el turno Y cuando el agente se para a
    // preguntarte algo: desde fuera son la misma señal. El transcript sí las
    // distingue, así que en automático se le pregunta antes de entregar; si no,
    // el siguiente de la cadena recibe media respuesta y se pone a trabajar
    // sobre ella. Es el fallo que hacía que encadenar no saliese a cuenta.
    if (auto && from) {
      // La campana llega un pelo antes de que el transcript tenga escrita la
      // última línea. Sin esta pausa se lee el estado de la vuelta anterior.
      await new Promise((ok) => window.setTimeout(ok, 400));
      let estado: WorkState = "";
      try {
        estado = (await sessionContext(from.cwd, sidOf(from)))?.state ?? "";
      } catch {
        // Sin transcript no hay nada que comprobar (una PowerShell, por
        // ejemplo): se entrega, que es lo que se hacía siempre.
        estado = "";
      }
      if (TE_HABLA_A_TI.has(estado)) {
        frenar(r.edgeId, t("«{n}» te preguntó algo antes de terminar", { n: r.fromName }));
        return;
      }
    }
    setRelays((prev) => prev.filter((x) => x.edgeId !== r.edgeId));
    let result = "";
    if (from) {
      try {
        result = (await lastReply(from.cwd, sidOf(from))) ?? "";
      } catch {
        result = "";
      }
    }
    if (!result) {
      setNote(
        t("No pude leer la respuesta del agente anterior: se manda solo tu encargo."),
      );
      window.setTimeout(() => setNote(null), 6000);
    }
    const text = [
      r.brief,
      result && `Resultado de «${r.fromName}»:\n"""\n${result}\n"""`,
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!text.trim()) return;
    pasteInto(r.toId, text, send);
    setFocusedId(r.toId);
    zoomTo(r.toId);
    firedRef.current.delete(r.edgeId);
  };

  // Arrows set to automatic hand over on their own; the rest wait for the
  // button, because the house rule is that nothing runs without an OK.
  useEffect(() => {
    for (const r of relays) {
      if (!r.auto || firedRef.current.has(r.edgeId)) continue;
      const ahora = Date.now();
      const marcas = (autoRef.current.get(r.edgeId) ?? []).filter(
        (t0) => ahora - t0 < VENTANA_AUTO,
      );
      if (marcas.length >= TOPE_AUTO) {
        // Se ha desbocado: casi siempre es un círculo de flechas automáticas,
        // y cada vuelta cuesta un turno de agente de verdad. Se pasa a mano y
        // se deja el relevo en la barra para que decidas tú.
        autoRef.current.set(r.edgeId, []);
        firedRef.current.add(r.edgeId);
        setEdges((prev) =>
          prev.map((e) => (e.id === r.edgeId ? { ...e, data: { ...e.data, auto: false } } : e)),
        );
        frenar(
          r.edgeId,
          t("«{a}» → «{b}» se pasó el relevo {n} veces seguidas: la he puesto a mano", {
            a: r.fromName,
            b: r.toName,
            n: String(TOPE_AUTO),
          }),
        );
        continue;
      }
      autoRef.current.set(r.edgeId, [...marcas, ahora]);
      firedRef.current.add(r.edgeId);
      void runRelay(r, true, true);
    }
    // runRelay reads fresh state through refs and removes the relay itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relays]);

  const nodeTypes = useMemo(
    () => ({
      term: TermNode,
      widget: WidgetNode,
      img: ImageNode,
      note: NoteNode,
      gal: GalleryNode,
      web: WebNode,
      kanban: KanbanNode,
      chat: ChatNode,
    }),
    [],
  );


  // Los widgets no son terminales: no tienen PTY, ni sesión, ni proyecto. Solo
  // son un nodo más del lienzo, y por eso quitarlos es quitar el nodo y ya.
  const quitarWidget = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
  }, []);


  // Entrega la captura anotada a un agente. Aplanada ya viene; aquí solo se
  // guarda en disco y se le escribe la ruta en el prompt SIN enviar: el Enter
  // lo da él, que es la regla de la casa para todo lo que teclea la app.
  const enviarCaptura = useCallback(
    async (paneId: number, png: Blob, nota: string) => {
      try {
        const bytes = [...new Uint8Array(await png.arrayBuffer())];
        const ruta = await savePastedImage(bytes, "png");
        const texto = nota ? `${nota}
${ruta}` : ruta;
        pasteInto(paneId, texto, false);
        setNote(t("Captura entregada. Dale al Enter en esa terminal."));
      } catch (e) {
        setNote(String(e));
      }
    },
    [t],
  );

  // El tablero, contado en texto para que un agente pueda razonar sobre él.
  //
  // Es la diferencia entre un lienzo donde dibujas y un lienzo que la IA
  // entiende: el agente deja de ver solo su terminal y pasa a saber quién más
  // está trabajando, en qué proyecto, y qué flechas salen de dónde. Se arma
  // aquí y no en el agente porque esto es un hecho comprobable, no algo que
  // deba adivinar.
  const tableroTexto = useCallback((paraId: number): string => {
    const term = nodes.filter((n) => n.type === "term") as Node<TermData>[];
    const otros = nodes.filter((n) => n.type !== "term");
    const nombre = (id: string) =>
      term.find((n) => n.id === id)?.data.pane.name ?? `nodo ${id}`;

    const lineas: string[] = ["## El tablero del lienzo de Adeorq", ""];
    lineas.push(`Terminales abiertas (${term.length}):`);
    for (const n of term) {
      const yo = n.data.pane.id === paraId ? "  ← ESTA ERES TÚ" : "";
      lineas.push(`- ${n.data.pane.name} · ${n.data.pane.cwd}${yo}`);
    }
    if (otros.length) {
      const cuenta = new Map<string, number>();
      for (const n of otros) {
        const k =
          n.type === "img"
            ? "captura"
            : n.type === "note"
              ? "nota"
              : String((n.data as { kind?: string }).kind ?? n.type);
        cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
      }
      lineas.push(
        "",
        `Otras piezas: ${[...cuenta].map(([k, v]) => `${v} ${k}`).join(", ")}.`,
      );
    }
    if (edges.length) {
      lineas.push("", "Flechas (la salida de la primera alimenta a la segunda):");
      for (const e of edges) {
        const brief = String(e.data?.brief ?? "").trim();
        lineas.push(
          `- ${nombre(e.source)} → ${nombre(e.target)}${brief ? `: ${brief}` : ""}${
            e.data?.auto ? " (automática)" : ""
          }`,
        );
      }
    } else {
      lineas.push("", "No hay flechas: nadie alimenta a nadie todavía.");
    }
    lineas.push(
      "",
      "Es una foto de ahora mismo, no una orden. Úsala para no pisar el trabajo",
      "de otro y para saber a quién le toca lo que tú no vas a hacer.",
    );
    return lineas.join("\n");
  }, [nodes, edges]);

  const mandarTablero = useCallback(
    (paneId: number) => {
      pasteInto(paneId, tableroTexto(paneId), false);
      setNote(t("Tablero escrito en esa terminal. El Enter lo das tú."));
    },
    [tableroTexto, t],
  );

  /**
   * Dónde cae una pieza nueva.
   *
   * Antes caían en una cuadrícula de tres en tres contada desde el origen del
   * lienzo, así que la número veinte aparecía a pantallas de distancia de
   * donde estabas mirando: pegabas un pantallazo y no pasaba nada, porque el
   * pantallazo estaba lejísimos. Ahora cae donde tienes el ratón, y si el
   * ratón no está sobre el lienzo, en el centro de lo que estás viendo.
   *
   * Se resta media pieza para que quede centrada en el punto y no colgando de
   * su esquina, y se aparta un poco si ya hay algo justo ahí: pegar tres
   * seguidas sin mover el ratón tiene que dejar ver las tres.
   */
  const hoja = useRef<HTMLDivElement>(null);
  const raton = useRef<{ x: number; y: number } | null>(null);
  const dondeCae = useCallback(
    (w: number, h: number, ya: CanvasNode[]) => {
      const lienzo = hoja.current?.getBoundingClientRect();
      const p = raton.current;
      const dentro =
        p && lienzo && p.x >= lienzo.left && p.x <= lienzo.right && p.y >= lienzo.top && p.y <= lienzo.bottom;
      const pantalla = dentro
        ? p
        : lienzo
          ? { x: lienzo.left + lienzo.width / 2, y: lienzo.top + lienzo.height / 2 }
          : { x: 0, y: 0 };
      const centro = flow.screenToFlowPosition(pantalla);
      let x = centro.x - w / 2;
      let y = centro.y - h / 2;
      // Mientras haya una pieza en ese mismo sitio, bajar y correr un poco.
      // El tope evita la escalera infinita si el lienzo está muy poblado.
      for (let intento = 0; intento < 12; intento++) {
        const chocan = ya.some((n) => Math.abs(n.position.x - x) < 24 && Math.abs(n.position.y - y) < 24);
        if (!chocan) break;
        x += 28;
        y += 28;
      }
      return { x, y };
    },
    [flow],
  );

  /** Las anotaciones de una captura las dibuja su nodo; aquí se guardan para
      que salgan en el archivo exportado. */
  const guardarFormas = useCallback((nodeId: string, formas: Shape[]) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId ? ({ ...n, data: { ...n.data, formas } } as CanvasNode) : n,
      ),
    );
  }, []);

  /** Mete una imagen en el tablero. La usan el Ctrl+V y la galería, que hacen
      lo mismo: una la trae del portapapeles y la otra de lo ya pegado. */
  const ponerImagen = useCallback(
    (src: string, iw: number, ih: number) => {
      setNodes((prev) => {
        const nodeId = `i${Date.now().toString(36)}${prev.length}`;
        // Entra con el ancho de un nodo y su alto proporcional: una captura
        // de pantalla completa ocuparía media pantalla si entrara a tamaño.
        const ancho = 460;
        const alto = Math.round((ancho * ih) / iw) + 148;
        const nodo: Node<ImageData> = {
          id: nodeId,
          type: "img",
          position: dondeCae(ancho, alto, prev),
          style: { width: ancho, height: alto },
          data: {
            src,
            w: iw,
            h: ih,
            nodeId,
            onClose: quitarWidget,
            onFormas: guardarFormas,
            terminales: panesRef.current
              .filter((x) => !!x.command)
              .map((x) => ({ id: x.id, name: x.name })),
            onEnviar: (id, blob, nota) => void enviarCaptura(id, blob, nota),
          },
        };
        return [...prev, nodo];
      });
    },
    [quitarWidget, guardarFormas, enviarCaptura, dondeCae],
  );

  // Ctrl+V en el lienzo: la captura entra como nodo. Las terminales vivas se
  // leen AL MANDARLA y no al pegar, para que una abierta después también salga
  // en la lista.
  const pegar = useCallback(
    (e: React.ClipboardEvent) => {
      const file = [...(e.clipboardData?.items ?? [])]
        .find((i) => i.type.startsWith("image/"))
        ?.getAsFile();
      if (!file) return;
      e.preventDefault();
      const lector = new FileReader();
      lector.onload = () => {
        const src = String(lector.result);
        const img = new Image();
        img.onload = () => ponerImagen(src, img.naturalWidth, img.naturalHeight);
        img.src = src;
      };
      lector.readAsDataURL(file);
    },
    [ponerImagen],
  );

  /** La galería: un cajón con todo lo que ha pegado, para volver a sacarlo. */
  const ponerGaleria = useCallback(() => {
    setNodes((prev) => {
      const nodeId = `g${Date.now().toString(36)}${prev.length}`;
      const nodo: Node<GalleryData> = {
        id: nodeId,
        type: "gal",
        position: dondeCae(340, 380, prev),
        style: { width: 340, height: 380 },
        data: { nodeId, onClose: quitarWidget, onSoltar: ponerImagen },
      };
      return [...prev, nodo];
    });
  }, [quitarWidget, ponerImagen, dondeCae]);

  /** La dirección de un nodo de web, guardada en el propio nodo. */
  const cambiarUrl = useCallback((nodeId: string, url: string) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId && n.type === "web"
          ? ({ ...n, data: { ...(n.data as WebData), url } } as CanvasNode)
          : n,
      ),
    );
  }, []);

  /**
   * Editar por clic la página que se está viendo.
   *
   * Son dos cosas, y las dos son el paso aburrido: arrancar el companion en la
   * carpeta del proyecto (una terminal más del lienzo, al lado de la ventana) y
   * abrir la página en el navegador de verdad. Lo que NO puede hacer Adeorq es
   * editar aquí dentro: froede es una extensión del navegador y esto es el
   * WebView de la app, sin extensiones. Lo que queda para él, pegar el puerto y
   * el token en el botón de froede, es la parte que sí es suya.
   */
  const abrirFroede = useCallback(
    (url: string) => {
      const p = projects.find((x) => x.name === project);
      if (!p) {
        setNote(t("Elige arriba de qué proyecto es esa página: froede escribe en su carpeta."));
        return;
      }
      void openUrl(url).catch(() => {});
      place("shell", p, undefined, {
        name: `${p.name} · froede`,
        command: shellCommand("npx froede"),
      });
      setNote(
        t(
          "froede arrancando en {p}. Copia de esa terminal el puerto y el token, pégalos en el botón de froede del navegador y dale a Edit.",
        ).replace("{p}", p.name),
      );
    },
    [projects, project, place, t],
  );

  const ponerWeb = useCallback(() => {
    setNodes((prev) => {
      const nodeId = `n${Date.now().toString(36)}${prev.length}`;
      const nodo: Node<WebData> = {
        id: nodeId,
        type: "web",
        position: dondeCae(520, 420, prev),
        style: { width: 520, height: 420 },
        data: {
          nodeId,
          url: comoUrl("1420"),
          onClose: quitarWidget,
          onUrl: cambiarUrl,
          onFroede: abrirFroede,
        },
      };
      return [...prev, nodo];
    });
  }, [quitarWidget, cambiarUrl, abrirFroede, dondeCae]);

  const ponerWidget = useCallback(
    (kind: WidgetKind) => {
      setNodes((prev) => {
        const nodeId = `w${Date.now().toString(36)}${prev.length}`;
        // El calendario nace más alto que el resto: lleva debajo la nota del
        // día, y con 300 px salía con el cuadro de escribir aplastado.
        const w = kind === "cal" ? 300 : 260;
        const h = kind === "cal" ? 430 : 300;
        const nodo: Node<WidgetData> = {
          id: nodeId,
          type: "widget",
          position: dondeCae(w, h, prev),
          style: { width: w, height: h },
          data: { kind, nodeId, onClose: quitarWidget },
        };
        return [...prev, nodo];
      });
    },
    [quitarWidget, dondeCae],
  );

  /** Quitar un chat se lleva su conversación: la pieza ya no está, y guardar
      para siempre una charla que sacaste del tablero es guardar basura. */
  const quitarChat = useCallback(
    (nodeId: string) => {
      const nodo = flow.getNode(nodeId) as Node<ChatData> | undefined;
      const chatId = nodo?.data?.chatId;
      if (chatId) void chatOlvidar(chatId).catch(() => {});
      quitarWidget(nodeId);
    },
    [flow, quitarWidget],
  );

  const cambiarModelo = useCallback((nodeId: string, modelo: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? ({ ...n, data: { ...n.data, modelo } } as CanvasNode) : n)),
    );
  }, []);

  const ponerChat = useCallback(
    (chatId?: string, modelo?: string, en?: { x: number; y: number; w: number; h: number }) => {
      setNodes((prev) => {
        const nodeId = `c${Date.now().toString(36)}${prev.length}`;
        const nodo: Node<ChatData> = {
          id: nodeId,
          type: "chat",
          position: en ?? dondeCae(380, 420, prev),
          style: { width: en?.w ?? 380, height: en?.h ?? 420 },
          dragHandle: ".ch-head",
          data: {
            nodeId,
            // El id del ARCHIVO se genera aquí y viaja con el nodo, así que
            // quitar el chat del tablero y volver a ponerlo NO recupera la
            // charla: quitarlo la borra, que es lo que dice quitarChat.
            chatId: chatId ?? `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
            modelo: modelo || MODELO_DEFECTO,
            onClose: quitarChat,
            onModelo: cambiarModelo,
          },
        };
        return [...prev, nodo];
      });
    },
    [dondeCae, quitarChat, cambiarModelo],
  );

  /** El color de un post-it es del tablero y no del archivo: la nota es lo que
      pone, no de qué color la dejaste ese día. */
  const colorNota = useCallback((nodeId: string, color: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? ({ ...n, data: { ...n.data, color } } as CanvasNode) : n)),
    );
  }, []);

  /** Una nota nueva. El id del ARCHIVO se genera aquí y viaja con el nodo, así
      que quitarla del tablero y volver a ponerla recupera lo escrito. */
  const ponerNota = useCallback(
    (noteId?: string, color?: string) => {
      setNodes((prev) => {
        const nodeId = `n${Date.now().toString(36)}${prev.length}`;
        const nodo: Node<NoteData> = {
          id: nodeId,
          type: "note",
          position: dondeCae(280, 260, prev),
          style: { width: 280, height: 260 },
          data: {
            noteId: noteId ?? `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
            color: color ?? NOTE_COLORS[0],
            nodeId,
            onClose: quitarWidget,
            onColor: colorNota,
          },
        };
        return [...prev, nodo];
      });
    },
    [quitarWidget, colorNota, dondeCae],
  );

  /* -------------------------------------------------- el kanban del trabajo */

  /**
   * Los agentes del tablero: los del lienzo y los de la cabina juntos.
   *
   * Las dos vistas, porque el tablero dice «quién está trabajando» y con solo
   * las del lienzo diría que nadie mientras seis agentes trabajan al lado. Las
   * consolas peladas se quedan fuera: no tienen estado que contar, y un tablero
   * de trabajo con seis PowerShell dentro no dice nada de nadie.
   */
  const agentesVivos = useMemo<AgenteVivo[]>(() => {
    const de = (p: CanvasPane, enLienzo: boolean): AgenteVivo | null => {
      const st = estados[p.id];
      // Sin comando es una consola; y si ya reportó, lo que él diga manda.
      if (!(st?.agent ?? !!p.command)) return null;
      return {
        paneId: p.id,
        name: p.name,
        cwd: p.cwd,
        state: st?.state ?? "",
        command: p.command,
        percent: st?.percent,
        agentsLive: st?.agentsLive ?? 0,
        enLienzo,
      };
    };
    return [...panes.map((p) => de(p, true)), ...panesCabina.map((p) => de(p, false))].filter(
      (a): a is AgenteVivo => a !== null,
    );
  }, [panes, panesCabina, estados]);

  const cambiarPendientes = useCallback((nodeId: string, lista: Pendiente[]) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId ? ({ ...n, data: { ...n.data, pendientes: lista } } as CanvasNode) : n,
      ),
    );
  }, []);

  /** Lanzar una tarjeta: nace en el proyecto del lienzo si la tarjeta no dice
      otro, que es el caso normal porque el tablero vive en un tablero. */
  const lanzarPendiente = useCallback(
    (texto: string, ruta?: string): boolean => {
      const p =
        (ruta ? projects.find((x) => x.path === ruta) : undefined) ??
        projects.find((x) => x.name === project);
      if (!p) {
        setNote(t("Elige antes un proyecto arriba: la terminal tiene que nacer en algún sitio."));
        // Falso: el tablero se queda la tarjeta en vez de tragársela.
        return false;
      }
      onLanzarEncargo(texto, p);
      return true;
    },
    [projects, project, onLanzarEncargo, t],
  );

  /** Varias tarjetas juntas. Mismo criterio de proyecto que una sola: sin un
      sitio donde nacer no se abre nada, y las tarjetas se quedan. */
  const repartirPendientes = useCallback(
    (textos: string[], ruta: string | undefined, alAbrir: () => void): boolean => {
      const p =
        (ruta ? projects.find((x) => x.path === ruta) : undefined) ??
        projects.find((x) => x.name === project);
      if (!p) {
        setNote(t("Elige antes un proyecto arriba: la terminal tiene que nacer en algún sitio."));
        return false;
      }
      onRepartirTarjetas(textos.join("\n"), p, alAbrir);
      return true;
    },
    [projects, project, onRepartirTarjetas, t],
  );

  const ponerKanban = useCallback(
    (pendientes: Pendiente[] = []) => {
      // Uno solo: son cuatro columnas de lo mismo, y dos tableros iguales al
      // lado solo reparten tu atención entre dos sitios que dicen igual. Se
      // comprueba AQUÍ y no dentro de setNodes: mover la cámara desde el
      // actualizador de estado es un efecto donde no toca, y en modo estricto
      // se haría dos veces.
      const ya = flow.getNodes().find((n) => n.type === "kanban");
      if (ya) {
        zoomANodo(ya.id);
        return;
      }
      setNodes((prev) => {
        const nodeId = `k${Date.now().toString(36)}`;
        const nodo: Node<KanbanData> = {
          id: nodeId,
          type: "kanban",
          position: dondeCae(760, 400, prev),
          style: { width: 760, height: 400 },
          // Solo por la cabecera, como las terminales: dentro se arrastran las
          // tarjetas, y un cuerpo que además mueve la pieza entera hace que
          // coger una tarjeta se lleve el tablero por delante.
          dragHandle: ".kb-head",
          data: {
            nodeId,
            onClose: quitarWidget,
            agentes: [],
            pendientes,
            onPendientes: cambiarPendientes,
            onFocus: zoomTo,
            onLanzar: lanzarPendiente,
            onRepartir: repartirPendientes,
          },
        };
        return [...prev, nodo];
      });
    },
    [
      flow,
      quitarWidget,
      dondeCae,
      cambiarPendientes,
      zoomTo,
      lanzarPendiente,
      repartirPendientes,
      zoomANodo,
    ],
  );

  // Los agentes cambian de estado a cada rato y el tablero es un nodo, así que
  // hay que volcárselos. Solo si hay tablero puesto: sin él, este efecto sería
  // un repintado del lienzo entero cada vez que un agente respira.
  useEffect(() => {
    setNodes((prev) => {
      if (!prev.some((n) => n.type === "kanban")) return prev;
      return prev.map((n) =>
        n.type === "kanban"
          ? ({
              ...n,
              data: {
                ...n.data,
                agentes: agentesVivos,
                onPendientes: cambiarPendientes,
                onFocus: zoomTo,
                onLanzar: lanzarPendiente,
                onRepartir: repartirPendientes,
              },
            } as CanvasNode)
          : n,
      );
    });
  }, [agentesVivos, cambiarPendientes, zoomTo, lanzarPendiente, repartirPendientes]);

  /**
   * Y al revés: una terminal que existe en la lista pero no tiene nodo.
   *
   * `place` crea las dos cosas a la vez, pero NO todo el mundo pasa por
   * `place`: el kanban, al soltar una tarjeta en «Trabajando», le pide el
   * panel directamente a App. El proceso arrancaba, el tablero lo contaba como
   * agente vivo y reportaba su estado, pero en el lienzo no había nada que
   * mirar: una terminal invisible. Y «Ir a esta terminal» no hacía nada porque
   * la cámara buscaba un nodo que nunca se creó (Munir, 2026-08-02).
   */
  useEffect(() => {
    setNodes((prev) => {
      const conNodo = new Set(prev.filter((n) => n.type === "term").map((n) => n.id));
      const huerfanos = panes.filter((p) => !conNodo.has(String(p.id)));
      if (!huerfanos.length) return prev;
      const nuevos: CanvasNode[] = [];
      let acumulado = prev;
      for (const pane of huerfanos) {
        const cli = kindDeComando(pane.command?.join(" ") ?? "");
        const nodo: Node<TermData> = {
          id: String(pane.id),
          type: "term",
          position: dondeCae(NODE_W, NODE_H, acumulado),
          style: { width: NODE_W, height: NODE_H },
          dragHandle: ".pane-head",
          data: {
            pane,
            kind: cli === "agy" ? "agy" : cli === "claude" ? "claude" : "shell",
            proyecto: pane.cwd.split(/[\\/]/).filter(Boolean).pop() ?? pane.cwd,
            fontSize,
            autoFont,
            stream,
            onSecret,
            notifyMode,
            focused: false,
            onFocus: setFocusedId,
            onClose: handleClose,
            onSplit: (id: number) => splitRef.current(id),
            onZoom: zoomTo,
            onTurnEnd,
            onStatus,
          },
        };
        nuevos.push(nodo);
        acumulado = [...acumulado, nodo];
      }
      return [...prev, ...nuevos];
    });
  }, [
    panes,
    dondeCae,
    fontSize,
    autoFont,
    stream,
    onSecret,
    notifyMode,
    handleClose,
    zoomTo,
    onTurnEnd,
    onStatus,
  ]);

  // Si una terminal desaparece por fuera del lienzo (la cierra el Capataz, o
  // muere su proceso), su nodo se va con ella. Sin esto quedaba una pieza
  // pintando una terminal que ya no existe, y encima el tablero la contaría
  // como alguien trabajando.
  useEffect(() => {
    const vivos = new Set(panes.map((p) => String(p.id)));
    setNodes((prev) =>
      prev.some((n) => n.type === "term" && !vivos.has(n.id))
        ? prev.filter((n) => n.type !== "term" || vivos.has(n.id))
        : prev,
    );
  }, [panes]);

  // Los avisos se van solos: son acuses de recibo, no algo que haya que cerrar.
  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 7000);
    return () => window.clearTimeout(id);
  }, [note]);

  /* ----------------------------------------------------------- el dibujo */

  /* -------------------------------------------------------- deshacer de verdad
   *
   * Lo de antes era `trazos.slice(0, -1)`: quitaba el ÚLTIMO del array, que casi
   * nunca es lo que acabas de tocar. Mover un trazo y pulsar Ctrl+Z te borraba
   * otro; cambiar un color, estirar una caja o vaciar el dibujo entero no se
   * podían deshacer en absoluto.
   *
   * Se guardan FOTOS del array, no diferencias: con decenas de trazos una foto
   * son unos kilobytes, y el código que hay que mantener es una décima parte del
   * de un sistema de deltas. El tope evita que un lienzo de horas se coma la
   * memoria.
   *
   * La regla que hace que esto se sienta bien es de Excalidraw: la foto se toma
   * cuando EMPIEZA un gesto, nunca en cada movimiento. Arrastrar un trazo cien
   * píxeles llama a `onCambiar` una vez por fotograma; sin esta regla habría que
   * pulsar Ctrl+Z cien veces para volver donde estabas. Por eso `cambiarTrazo`
   * NO recuerda nada y quien recuerda es `alEmpezarGesto`, en el pointerdown. */
  const PASOS_ATRAS = 60;
  const historia = useRef<Trazo[][]>([]);
  const futuro = useRef<Trazo[][]>([]);
  // El array de trazos de ESTE render, para poder fotografiarlo desde un
  // callback sin arrastrar `trazos` como dependencia por toda la cadena.
  const trazosVivos = useRef(trazos);
  trazosVivos.current = trazos;

  // Cuántos pasos hay a cada lado. Las pilas son refs (no queremos un render por
  // fotograma de arrastre), pero los dos botones tienen que saber si están vivos
  // o apagados, y para eso hace falta estado.
  const [pasos, setPasos] = useState({ atras: 0, alante: 0 });

  // Mientras dura un gesto no se toman más fotos. Arrastrar la goma sobre diez
  // trazos es UNA cosa que has hecho, así que se deshace de una vez.
  const enGesto = useRef(false);

  const recordar = useCallback(() => {
    if (enGesto.current) return;
    historia.current.push(trazosVivos.current);
    if (historia.current.length > PASOS_ATRAS) historia.current.shift();
    // Cualquier cosa nueva cierra el camino de vuelta: es lo que hace todo
    // editor, y lo contrario deja un «rehacer» que reaparece cambios de otra
    // rama de la historia.
    futuro.current = [];
    setPasos({ atras: historia.current.length, alante: 0 });
  }, []);

  const addTrazo = useCallback(
    (s: Trazo) => {
      recordar();
      setTrazos((p) => [...p, s]);
    },
    [recordar],
  );
  const borrarTrazo = useCallback(
    (id: string) => {
      recordar();
      setTrazos((p) => p.filter((s) => s.id !== id));
    },
    [recordar],
  );
  const cambiarTrazo = useCallback(
    (s: Trazo) => setTrazos((p) => p.map((x) => (x.id === s.id ? s : x))),
    [],
  );

  /* Elegir color o grosor hace dos cosas según lo que haya cogido: si hay un
     trazo seleccionado, lo repinta; si no, deja preparado el siguiente. Es lo
     que hace cualquier editor de dibujo y evita tener dos juegos de botones
     para lo mismo. */

  /**
   * Todo lo que está cogido ahora mismo, sea de uno en uno o rodeado.
   *
   * Los dos caminos existían ya y no hablaban entre ellos: `selTrazo` para el
   * trazo suelto, con sus tiradores; `grupo` para lo barrido con el marco. La
   * barra de estilo solo miraba al primero, así que rodear diez flechas y
   * pulsar un color repintaba una. Esta lista los une, y con ella el color, el
   * grosor, el relleno y todo lo demás valen para lo que tengas cogido.
   */
  const cogidos = useMemo(() => {
    // Lo agrupado va entero: coger un trazo de un grupo es coger el grupo, y
    // por eso la lista se expande aquí y no en cada sitio que la use.
    if (grupo.size) return [...conSuGrupo(grupo, trazos)];
    return selTrazo ? [...conSuGrupo([selTrazo], trazos)] : [];
  }, [grupo, selTrazo, trazos]);
  const cogidosRef = useRef(cogidos);
  cogidosRef.current = cogidos;

  /** Los trazos cogidos, no sus ids: lo que necesitan alinear, copiar y exportar. */
  const trazosCogidos = useMemo(() => {
    const set = new Set(cogidos);
    return trazos.filter((s) => set.has(s.id));
  }, [trazos, cogidos]);

  /** Repinta lo que esté cogido, si hay algo.
   *
   *  Salir antes cuando no hay nada seleccionado no es un ahorro cosmético:
   *  un `map` que no cambia ni un trazo devuelve igualmente un array NUEVO, y
   *  con él cambia la identidad de `construir`, se reinicia el temporizador del
   *  autoguardado y se reescribe el tablero ENTERO en disco —capturas en base64
   *  incluidas— para dejarlo exactamente como estaba. Cada clic en un color con
   *  la mano vacía costaba eso. */
  const retocarSel = useCallback(
    (cambio: Partial<Trazo>) => {
      if (!cogidos.length) return;
      const set = new Set(cogidos);
      recordar();
      setTrazos((p) => p.map((x) => (set.has(x.id) ? { ...x, ...cambio } : x)));
    },
    [cogidos, recordar],
  );

  const usarColor = useCallback(
    (c: string) => {
      setColor(c);
      retocarSel({ color: c });
    },
    [retocarSel],
  );

  const usarGrosor = useCallback(
    (w: number) => {
      setGrosor(w);
      retocarSel({ w });
    },
    [retocarSel],
  );

  /** La tipografía del texto. Mismo trato que el color y el grosor. */
  const usarFuente = useCallback(
    (id: FontId) => {
      setFuenteId(id);
      retocarSel({ font: id });
    },
    [retocarSel],
  );

  /** El halo, encendido o apagado. Igual que el color: si hay algo cogido lo
      cambia, y si no, deja preparado lo siguiente que dibujes. */
  const usarGlow = useCallback(() => {
    const siguiente = !glow;
    setGlow(siguiente);
    retocarSel({ glow: siguiente });
  }, [glow, retocarSel]);

  /** El relleno rota entre los tres pasos. Un botón que cicla y no tres
      botones: es una sola idea con tres grados, y en la barra el sitio manda. */
  const usarRelleno = useCallback(() => {
    const i = RELLENOS.indexOf(relleno);
    const siguiente = RELLENOS[(i + 1) % RELLENOS.length];
    setRelleno(siguiente);
    retocarSel({ relleno: siguiente });
  }, [relleno, retocarSel]);

  /** Lo transparente que va todo el trazo. Mismo botón que cicla, misma idea:
      opaco, medio y fantasma. Distinto del relleno, que es solo el interior. */
  const usarOpacidad = useCallback(() => {
    const i = OPACIDADES.indexOf(opacidad);
    const siguiente = OPACIDADES[(i + 1) % OPACIDADES.length];
    setOpacidad(siguiente);
    retocarSel({ opacidad: siguiente === 1 ? undefined : siguiente });
  }, [opacidad, retocarSel]);

  /** Entera, a guiones o a puntos. */
  const GUIONES: Guion[] = ["solido", "guiones", "puntos"];
  const usarGuion = useCallback(() => {
    const i = GUIONES.indexOf(guion);
    const siguiente = GUIONES[(i + 1) % GUIONES.length];
    setGuion(siguiente);
    retocarSel({ guion: siguiente === "solido" ? undefined : siguiente });
  }, [guion, retocarSel]);

  /** Quién tapa a quién. El orden de pintado ES el orden del array, así que
      subir algo al frente es llevarlo al final. Hace falta desde que hay
      relleno: dos cajas macizas que se solapan tienen que poder intercambiarse,
      y hasta ahora el único orden posible era el de dibujado. */
  const mandarAlBorde = useCallback(
    (alFrente: boolean) => {
      if (!cogidos.length) return;
      const set = new Set(cogidos);
      recordar();
      setTrazos((p) => {
        const elegidos = p.filter((x) => set.has(x.id));
        if (!elegidos.length) return p;
        const resto = p.filter((x) => !set.has(x.id));
        return alFrente ? [...resto, ...elegidos] : [...elegidos, ...resto];
      });
    },
    [cogidos, recordar],
  );

  /** El trazo a mano alzada. Al encenderlo sobre algo ya dibujado hay que darle
      su dado, o RoughJS usaría el mismo para todo y dos cajas iguales saldrían
      temblando exactamente igual, que se nota. */
  const usarRugoso = useCallback(() => {
    const siguiente = !rugoso;
    setRugoso(siguiente);
    retocarSel(
      siguiente
        ? { rugoso: true, seed: Math.floor(Math.random() * 2 ** 31) }
        : { rugoso: undefined },
    );
  }, [rugoso, retocarSel]);

  /** Macizo → rayado → cruzado → macizo. Un botón que rota, como el guion y la
      opacidad: son tres estados y un desplegable para tres es un clic de más. */
  const usarTrama = useCallback(() => {
    const siguiente = TRAMAS[(TRAMAS.indexOf(trama) + 1) % TRAMAS.length];
    setTrama(siguiente);
    // El rayado y el cruzado los calcula RoughJS, que es aleatorio: sin dado
    // propio, dos cajas rayadas saldrían con las rayas EXACTAMENTE iguales, que
    // es justo lo que delata que no está dibujado a mano. Mismo motivo que el
    // trazo de boceto de aquí arriba.
    retocarSel({
      trama: siguiente,
      ...(siguiente === "macizo" ? null : { seed: Math.floor(Math.random() * 2 ** 31) }),
    });
  }, [trama, retocarSel]);

  /** Esquinas vivas o redondeadas, en recuadros y rombos. */
  const usarVivas = useCallback(() => {
    const siguiente = !vivas;
    setVivas(siguiente);
    retocarSel({ vivas: siguiente || undefined });
  }, [vivas, retocarSel]);

  /** Recta o curva, en líneas y flechas. */
  const usarCurva = useCallback(() => {
    const siguiente = !curva;
    setCurva(siguiente);
    retocarSel({ curva: siguiente || undefined });
  }, [curva, retocarSel]);

  /** Si lo que hay cogido admite relleno: entonces el botón sale aunque la
      herramienta sea la flecha, que es como se le cambia el fondo a una caja
      que ya está dibujada. */
  const rellenable = useMemo(
    () => trazosCogidos.some((s) => s.t === "caja" || s.t === "rombo" || s.t === "elipse"),
    [trazosCogidos],
  );

  /** Si lo cogido tiene esquinas que redondear. La elipse queda fuera a
      propósito: no las tiene, y ofrecer el botón sería prometer algo que no
      va a pasar. */
  const esquinable = useMemo(
    () => trazosCogidos.some((s) => s.t === "caja" || s.t === "rombo"),
    [trazosCogidos],
  );

  /** Si entre lo cogido hay alguna línea o flecha: entonces salen los botones
      de las puntas, que en una caja no significarían nada. */
  const conPuntas = useMemo(
    () => trazosCogidos.some((s) => s.t === "flecha" || s.t === "linea"),
    [trazosCogidos],
  );

  /* ------------------------------------------------- copiar, pegar, duplicar
   *
   * El portapapeles va en JSON con una marca dentro (`empaquetar`), y no en un
   * estado de React: así se pega en OTRO tablero, que es donde esto de verdad
   * hace falta. Un estado interno solo serviría dentro de la misma pantalla.
   */

  /** Coge estos trazos y suelta lo demás. Se usa al pegar y al duplicar: lo
      recién puesto queda cogido, que es lo que uno espera para moverlo. */
  const cogerSolo = useCallback((ids: string[]) => {
    setSelTrazo(ids.length === 1 ? ids[0] : null);
    setGrupo(ids.length > 1 ? new Set(ids) : new Set());
    setActivo(ids.length > 1);
    setTool("sel");
  }, []);

  const copiar = useCallback(async () => {
    if (!trazosCogidos.length) return;
    try {
      await navigator.clipboard.writeText(empaquetar(trazosCogidos));
    } catch {
      // Sin permiso de portapapeles no hay nada que hacer, y avisar de esto en
      // mitad de un dibujo estorbaría más que el fallo.
    }
  }, [trazosCogidos]);

  /** Lo mismo que copiar y pegar, pero de un tirón y sin tocar el portapapeles:
      así duplicar no te pisa lo que tuvieras copiado. */
  const DESPLAZA = 16;
  const duplicar = useCallback(() => {
    if (!trazosCogidos.length) return;
    const copias = desempaquetar(empaquetar(trazosCogidos), DESPLAZA, DESPLAZA);
    if (!copias.length) return;
    recordar();
    setTrazos((p) => [...p, ...copias]);
    cogerSolo(copias.map((s) => s.id));
  }, [trazosCogidos, recordar, cogerSolo]);

  /** Pegar trazos del portapapeles. Devuelve si se ha quedado con el evento,
      para que la captura de pantalla siga teniendo su turno. */
  const pegarTrazos = useCallback(
    (e: React.ClipboardEvent) => {
      const txt = e.clipboardData?.getData("text/plain");
      if (!txt) return false;
      const copias = desempaquetar(txt, DESPLAZA, DESPLAZA);
      if (!copias.length) return false;
      e.preventDefault();
      recordar();
      setTrazos((p) => [...p, ...copias]);
      cogerSolo(copias.map((s) => s.id));
      return true;
    },
    [recordar, cogerSolo],
  );

  /* ------------------------------------------------ clavar, agrupar, alinear */

  /** Clavar al tablero o soltarlo. Si hay de todo, se clava todo: es lo que se
      quiere decir al pulsarlo con cinco cosas cogidas. */
  const bloquear = useCallback(() => {
    if (!trazosCogidos.length) return;
    const clavar = trazosCogidos.some((s) => !s.bloq);
    retocarSel({ bloq: clavar || undefined });
  }, [trazosCogidos, retocarSel]);

  /** Agrupar lo cogido, o deshacer el grupo si ya lo era. */
  const agrupar = useCallback(() => {
    if (trazosCogidos.length < 2) return;
    const yaEsGrupo =
      trazosCogidos.every((s) => s.grupo) &&
      new Set(trazosCogidos.map((s) => s.grupo)).size === 1;
    retocarSel({ grupo: yaEsGrupo ? undefined : nuevoId() });
  }, [trazosCogidos, retocarSel]);

  /** Alinear a un borde común. La cuenta vive en `trazos.ts`, aquí solo se
      guarda: así se puede probar sin abrir la app. */
  const alinear = useCallback(
    (como: Alineacion) => {
      const movidos = alineados(trazosCogidos, como);
      if (!movidos.length) return;
      const porId = new Map(movidos.map((s) => [s.id, s]));
      recordar();
      setTrazos((p) => p.map((x) => porId.get(x.id) ?? x));
    },
    [trazosCogidos, recordar],
  );

  const repartir = useCallback(
    (horizontal: boolean) => {
      const movidos = repartidos(trazosCogidos, horizontal);
      if (!movidos.length) return;
      const porId = new Map(movidos.map((s) => [s.id, s]));
      recordar();
      setTrazos((p) => p.map((x) => porId.get(x.id) ?? x));
    },
    [trazosCogidos, recordar],
  );

  /** Mover lo cogido con las flechas del teclado: una unidad, o diez con
      Mayús. Es la única forma de colocar algo al píxel sin pelearse con el
      imán, y la tiene cualquier editor. */
  const moverCogidos = useCallback(
    (dx: number, dy: number) => {
      const set = new Set(cogidosRef.current);
      if (!set.size) return;
      recordar();
      setTrazos((p) => p.map((x) => (set.has(x.id) && !x.bloq ? movido(x, dx, dy) : x)));
    },
    [recordar],
  );

  /** El estilo copiado con Ctrl+Alt+C, esperando a que lo peguen. No es estado
      de React porque no se pinta en ningún sitio: solo se recuerda. */
  const estiloRef = useRef<Partial<Trazo> | null>(null);
  const copiarEstilo = useCallback(() => {
    const s = trazosCogidos[0];
    if (!s) return;
    estiloRef.current = {
      color: s.color,
      w: s.w,
      glow: s.glow,
      relleno: s.relleno,
      opacidad: s.opacidad,
      guion: s.guion,
      rugoso: s.rugoso,
      trama: s.trama,
      vivas: s.vivas,
      curva: s.curva,
      font: s.font,
      puntaDe: s.puntaDe,
      puntaA: s.puntaA,
    };
  }, [trazosCogidos]);
  const pegarEstilo = useCallback(() => {
    if (estiloRef.current) retocarSel(estiloRef.current);
  }, [retocarSel]);

  /**
   * El dibujo, en una imagen.
   *
   * Se serializa el SVG que YA está pintado en vez de volver a dibujarlo con
   * cadenas de texto: cualquier otra cosa sería un segundo motor de dibujo que
   * hay que mantener a la par del de verdad, y el día que se le añada una
   * figura, el exportador se queda corto sin que nadie se entere. Del clon se
   * quitan las capas que no son dibujo (los agarres invisibles, el marco, las
   * guías) y se recorta a lo que ocupa el tablero.
   *
   * A PNG se pasa por un `<canvas>`: el navegador ya sabe rasterizar un SVG,
   * así que no hace falta ninguna librería.
   */
  const exportarDibujo = useCallback(
    async (comoPng: boolean) => {
      const vivos = trazosRef.current;
      // Si hay algo cogido se exporta ESO, y si no, el tablero entero. Es lo
      // que hace Excalidraw y evita tener dos botones para lo mismo.
      const elegidos = cogidosRef.current.length
        ? vivos.filter((s) => cogidosRef.current.includes(s.id))
        : vivos;
      const marco = cajaDeVarios(elegidos);
      const fuenteSvg = hoja.current?.querySelector<SVGSVGElement>(".canvas-draw");
      if (!marco || !fuenteSvg) {
        setNote(t("No hay nada dibujado que exportar"));
        return;
      }
      const M = 24;
      const w = Math.ceil(marco.w + M * 2);
      const h = Math.ceil(marco.h + M * 2);
      const clon = fuenteSvg.cloneNode(true) as SVGSVGElement;
      clon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clon.setAttribute("width", String(w));
      clon.setAttribute("height", String(h));
      clon.setAttribute("viewBox", `0 0 ${w} ${h}`);
      for (const fuera of clon.querySelectorAll(
        ".canvas-draw-grab, .canvas-marco, .canvas-guia, .canvas-imana, .canvas-draw-tirador",
      )) {
        fuera.remove();
      }
      // El grupo de dentro lleva el viewport de la pantalla: se cambia por el
      // desplazamiento que deja el dibujo pegado a la esquina de la imagen.
      const capa = clon.querySelector("g");
      if (capa) capa.setAttribute("transform", `translate(${M - marco.x},${M - marco.y})`);
      if (cogidosRef.current.length) {
        const dentro = new Set(elegidos.map((s) => s.id));
        for (const g of clon.querySelectorAll<SVGGElement>(".canvas-draw-shape")) {
          // El clon no guarda qué trazo es cada grupo, así que se cuentan en el
          // mismo orden en el que se pintaron.
          if (!g.dataset.id || !dentro.has(g.dataset.id)) g.remove();
        }
      }
      const texto = new XMLSerializer().serializeToString(clon);
      try {
        const ruta = await guardarComo({
          defaultPath: `${nombreSugerido(project).replace(/\.json$/i, "")}.${comoPng ? "png" : "svg"}`,
          filters: [
            comoPng
              ? { name: "Imagen PNG", extensions: ["png"] }
              : { name: "Dibujo SVG", extensions: ["svg"] },
          ],
        });
        if (!ruta) return;
        if (!comoPng) {
          await saveDrawing(ruta, [...new TextEncoder().encode(texto)]);
        } else {
          // Al doble, que es lo que hace que un diagrama exportado no se vea
          // borroso al pegarlo en cualquier sitio.
          const escala = 2;
          const lienzo = document.createElement("canvas");
          lienzo.width = w * escala;
          lienzo.height = h * escala;
          const ctx = lienzo.getContext("2d");
          if (!ctx) throw new Error("sin contexto 2D");
          const img = new Image();
          const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(texto)}`;
          await new Promise<void>((ok, mal) => {
            img.onload = () => ok();
            img.onerror = () => mal(new Error("no se pudo rasterizar el dibujo"));
            img.src = url;
          });
          ctx.scale(escala, escala);
          ctx.drawImage(img, 0, 0, w, h);
          const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/png"));
          if (!blob) throw new Error("no se pudo generar el PNG");
          await saveDrawing(ruta, [...new Uint8Array(await blob.arrayBuffer())]);
        }
        setNote(t("Dibujo guardado en {r}", { r: ruta }));
      } catch (e) {
        setNote(String(e));
      }
    },
    [project, t],
  );
  /* ------------------------------------------------------ flechas que se pegan
   *
   * Una flecha dibujada sobre una terminal se queda pegada a ella y la sigue.
   * Antes guardaba dos puntos sueltos, así que en cuanto reordenabas el tablero
   * todas las flechas se quedaban señalando al aire donde estuvo algo, y había
   * que redibujarlas una a una. El ancla va en PROPORCIÓN a la caja de la pieza
   * (ver `Ancla`), de modo que aguanta también redimensionarla.
   *
   * Esto es distinto de las flechas de React Flow, que unen dos terminales para
   * pasarles el relevo: aquellas son una tubería de trabajo, estas son dibujo.
   * Se puede rodear tres cosas y señalarlas sin montar ningún encadenado. */
  const cajasNodos = useMemo(() => {
    const m = new Map<string, Caja>();
    for (const n of nodes) m.set(n.id, cajaNodo(n));
    return m;
  }, [nodes]);

  useEffect(() => {
    setTrazos((prev) => {
      let tocado = false;
      const next = prev.map((s) => {
        if (!s.anclaDe && !s.anclaA) return s;
        const p = [...s.p];
        const de = s.anclaDe && puntoDeAncla(s.anclaDe, cajasNodos);
        const a = s.anclaA && puntoDeAncla(s.anclaA, cajasNodos);
        if (de && (p[0] !== de[0] || p[1] !== de[1])) [p[0], p[1]] = de;
        if (a && (p[2] !== a[0] || p[3] !== a[1])) [p[2], p[3]] = a;
        // La pieza que se borró se lleva su ancla, no arrastra la flecha: el
        // extremo se queda donde estaba y a partir de ahí es tuyo otra vez.
        const huerfano = (s.anclaDe && !de) || (s.anclaA && !a);
        if (p.every((v, i) => v === s.p[i]) && !huerfano) return s;
        tocado = true;
        const limpio: Trazo = { ...s, p };
        if (s.anclaDe && !de) delete limpio.anclaDe;
        if (s.anclaA && !a) delete limpio.anclaA;
        return limpio;
      });
      // Devolver el MISMO array cuando no ha cambiado nada es lo que evita el
      // bucle: un array nuevo reinicia el autoguardado, que reescribe el
      // tablero, que vuelve a pasar por aquí.
      return tocado ? next : prev;
    });
  }, [cajasNodos]);

  /** Lo llama la capa de dibujo al empezar a mover, estirar o borrar: una foto
      por gesto, no por fotograma ni por trazo. */
  const alEmpezarGesto = useCallback(() => {
    recordar();
    enGesto.current = true;
  }, [recordar]);

  /** Y al soltar. A partir de aquí lo siguiente vuelve a ser un paso propio. */
  const alSoltarGesto = useCallback(() => {
    enGesto.current = false;
  }, []);

  const deshacer = useCallback(() => {
    const antes = historia.current.pop();
    if (!antes) return;
    futuro.current.push(trazosVivos.current);
    setTrazos(antes);
    setPasos({ atras: historia.current.length, alante: futuro.current.length });
  }, []);

  const rehacer = useCallback(() => {
    const despues = futuro.current.pop();
    if (!despues) return;
    historia.current.push(trazosVivos.current);
    setTrazos(despues);
    setPasos({ atras: historia.current.length, alante: futuro.current.length });
  }, []);
  // Tras dibujar se vuelve a la mano, como en Excalidraw. No es un capricho:
  // una herramienta que se queda puesta hace que el siguiente arrastre pinte
  // en vez de mover, y el usuario concluye que el lienzo "no le deja arrastrar".
  // La chincheta está para quien va a dibujar cinco flechas seguidas.
  //
  // Con el lápiz esa regla se cae sola: a mano alzada NADIE dibuja de un solo
  // trazo. Una cara son tres y subrayar dos cosas, dos; soltar el ratón te
  // devolvía la flecha y había que volver a la barra entre raya y raya. Así que
  // el lápiz se queda puesto y las figuras de un gesto (flecha, línea, caja,
  // elipse, texto) siguen soltándose, que es donde el automatismo acierta. Y
  // para salir del lápiz siguen estando Esc y la propia flecha.
  const finTrazo = useCallback(() => {
    if (!fijar && tool !== "lapiz") setTool("sel");
  }, [fijar, tool]);

  // Deshacer el trazo, pero SOLO mientras dibujas: dentro de una terminal ese
  // atajo suspende el proceso que esté corriendo, y robárselo sería peor que no
  // tener deshacer. Por eso este no entra en el catálogo general de abajo.
  useEffect(() => {
    if (tool === "sel") return;
    const onKey = (e: KeyboardEvent) => {
      const a = accionDe(e, mapaRef.current);
      if (a !== "deshacer" && a !== "rehacer") return;
      e.preventDefault();
      if (a === "deshacer") deshacer();
      else rehacer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, deshacer, rehacer]);

  /* ---------------------------------------------- coger varias cosas a la vez
   *
   * La selección de las PIEZAS la lleva React Flow en el propio nodo
   * (`selected`), y la de los TRAZOS vive aquí, porque el dibujo no es suyo.
   * Las dos juntas son "lo seleccionado", y de ahí salen las tres cosas que se
   * pueden hacer con ello: moverlo, borrarlo y soltarlo.
   *
   * `activo` es aparte del número: un clic normal sobre una terminal también la
   * deja seleccionada, y no por eso hay que sacar una barra de acciones. La
   * barra solo aparece cuando el usuario ha pedido un grupo a propósito
   * (rodeando, con Mayús o pidiendo todo).
   */

  /** El botón de borrar, esperando el sí: cerrar terminales mata procesos. */
  const [confirmar, setConfirmar] = useState(false);
  const grupoRef = useRef(grupo);
  grupoRef.current = grupo;

  const cuantos = nodes.filter((n) => n.selected).length + grupo.size;
  const hayGrupo = activo && cuantos > 0;

  const soltar = useCallback(() => {
    setNodes((prev) => prev.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setGrupo(new Set());
    setActivo(false);
    setConfirmar(false);
  }, []);

  /** El marco, ya soltado: se queda lo que roza, piezas y dibujo. */
  const marcar = useCallback((caja: Caja, ids: string[], sumar: boolean) => {
    setNodes((prev) =>
      prev.map((n) => {
        const dentro = seTocan(caja, cajaNodo(n));
        const sel = sumar ? dentro || !!n.selected : dentro;
        return sel === !!n.selected ? n : { ...n, selected: sel };
      }),
    );
    setGrupo((prev) => (sumar ? new Set([...prev, ...ids]) : new Set(ids)));
    setActivo(true);
    setConfirmar(false);
    // Lo cogido de uno en uno se suelta: si no, Supr borraría ese trazo por su
    // cuenta además de preguntar por el grupo, que son dos borrados distintos.
    setSelTrazo(null);
    // Se vuelve solo a la mano: lo siguiente que quieres es arrastrar el grupo,
    // y quedarte con el marco puesto haría un marco nuevo en vez de moverlo.
    setTool("sel");
  }, []);

  /**
   * Rodear con el botón DERECHO, sin cambiar de herramienta.
   *
   * El marco de la barra sigue estando, pero obliga a ir arriba, marcarlo y
   * volver. Con el derecho el gesto sale de la mano: mantienes y barres. Y el
   * clic derecho suelto no pierde nada, sigue abriendo el menú de añadir; lo
   * que decide es si hubo arrastre o no.
   *
   * El rectángulo se pinta en coordenadas de PANTALLA (un div encima del
   * lienzo) en vez de en el SVG del dibujo: así el gesto no depende de qué
   * herramienta esté puesta ni de si la capa de dibujo está escuchando.
   */
  interface MarcoDer {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    sumar: boolean;
  }
  const [marcoDer, setMarcoDer] = useState<MarcoDer | null>(null);
  // El gesto se lleva también en un ref: al soltar hay que leerlo y decidir, y
  // hacer eso dentro de un setState convierte el cálculo en un efecto
  // escondido que React puede ejecutar dos veces.
  const marcoRef = useRef<MarcoDer | null>(null);
  /** Un arrastre con el derecho no debe acabar abriendo el menú al soltar. */
  const comioMenu = useRef(false);

  const derechoAbajo = useCallback((e: React.PointerEvent) => {
    if (e.button !== 2) return;
    const r = hoja.current?.getBoundingClientRect();
    if (!r) return;
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const m = { x1: x, y1: y, x2: x, y2: y, sumar: e.shiftKey };
    marcoRef.current = m;
    setMarcoDer(m);
  }, []);

  const derechoMueve = useCallback((e: { clientX: number; clientY: number }) => {
    const m = marcoRef.current;
    const r = hoja.current?.getBoundingClientRect();
    if (!m || !r) return;
    const next = { ...m, x2: e.clientX - r.left, y2: e.clientY - r.top };
    marcoRef.current = next;
    setMarcoDer(next);
  }, []);

  const derechoArriba = useCallback(() => {
    const m = marcoRef.current;
    marcoRef.current = null;
    setMarcoDer(null);
    if (!m) return;
    // Un clic derecho normal tiembla dos o tres píxeles. Por debajo de eso no
    // era un marco, era un clic, y el menú tiene que salir como siempre.
    if (Math.abs(m.x2 - m.x1) < 6 && Math.abs(m.y2 - m.y1) < 6) return;
    comioMenu.current = true;
    const r = hoja.current?.getBoundingClientRect();
    if (!r) return;
    const a = flow.screenToFlowPosition({
      x: r.left + Math.min(m.x1, m.x2),
      y: r.top + Math.min(m.y1, m.y2),
    });
    const b = flow.screenToFlowPosition({
      x: r.left + Math.max(m.x1, m.x2),
      y: r.top + Math.max(m.y1, m.y2),
    });
    const caja: Caja = { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
    marcar(
      caja,
      trazosRef.current.filter((s) => seTocan(caja, cajaDe(s))).map((s) => s.id),
      m.sumar,
    );
  }, [flow, marcar]);

  // El resto del gesto se escucha en la VENTANA, no en el lienzo. Capturar el
  // puntero sería lo natural, pero el clic derecho también dispara el menú
  // contextual, y con el puntero capturado ese menú deja de salirle a la
  // terminal sobre la que hiciste clic. Escuchando fuera, un barrido que se
  // sale del tablero sigue terminando bien y nadie pierde su menú.
  useEffect(() => {
    if (!marcoDer) return;
    const mueve = (e: PointerEvent) => derechoMueve(e);
    const arriba = () => derechoArriba();
    window.addEventListener("pointermove", mueve);
    window.addEventListener("pointerup", arriba);
    window.addEventListener("pointercancel", arriba);
    return () => {
      window.removeEventListener("pointermove", mueve);
      window.removeEventListener("pointerup", arriba);
      window.removeEventListener("pointercancel", arriba);
    };
  }, [marcoDer, derechoMueve, derechoArriba]);

  const todo = useCallback(() => {
    setNodes((prev) => prev.map((n) => (n.selected ? n : { ...n, selected: true })));
    setGrupo(new Set(trazos.map((s) => s.id)));
    setActivo(true);
    setConfirmar(false);
    setSelTrazo(null);
    setTool("sel");
  }, [trazos]);

  /** Borrar el grupo entero. Las terminales no se quitan del lienzo y ya: cada
      una tiene un proceso vivo detrás al que hay que decirle que se acabó. */
  const borrarGrupo = useCallback(() => {
    const fuera = nodes.filter((n) => n.selected);
    const ids = new Set(fuera.map((n) => n.id));
    for (const n of fuera) if (n.type === "term") onClose(Number(n.id));
    setNodes((prev) => prev.filter((n) => !ids.has(n.id)));
    setEdges((prev) => prev.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    // Los trazos SÍ vuelven con Ctrl+Z; las terminales no, porque cerrarlas mata
    // a su agente. Por eso esto se pregunta antes y aquello no.
    recordar();
    setTrazos((prev) => prev.filter((s) => !grupoRef.current.has(s.id)));
    setGrupo(new Set());
    setActivo(false);
    setConfirmar(false);
  }, [nodes, onClose, recordar]);

  /** Cuántas terminales caerían: es lo único de esto que no se puede deshacer. */
  const termsDentro = nodes.filter((n) => n.selected && n.type === "term").length;

  /** Mover el grupo agarrándolo por una PIEZA: React Flow ya mueve las demás
      piezas seleccionadas, así que aquí solo hay que arrastrar el dibujo. */
  const arrastreRef = useRef<{ x: number; y: number; base: Trazo[] } | null>(null);

  const empiezaArrastre = useCallback(
    (n: CanvasNode) => {
      arrastreRef.current = null;
      if (!grupo.size) return;
      // Se mira la selección PROPIA y no la del nodo que entrega React Flow:
      // ese mismo gesto acaba de tocarla, y aquí hace falta saber cómo estaba
      // antes de empezar a arrastrar.
      if (!nodes.some((x) => x.id === n.id && x.selected)) {
        // Arrastrar una pieza que no estaba cogida deshace el grupo: React Flow
        // ya la ha dejado sola, y el dibujo no puede quedarse cogido a nada.
        setGrupo(new Set());
        setActivo(false);
        return;
      }
      // Una foto al empezar el arrastre, no en cada fotograma de `durantArrastre`.
      recordar();
      arrastreRef.current = {
        x: n.position.x,
        y: n.position.y,
        base: trazos.filter((s) => grupo.has(s.id)),
      };
    },
    [grupo, trazos, nodes, recordar],
  );

  const durantArrastre = useCallback((n: CanvasNode) => {
    const a = arrastreRef.current;
    if (!a) return;
    const dx = n.position.x - a.x;
    const dy = n.position.y - a.y;
    const nuevos = new Map(a.base.map((s) => [s.id, movido(s, dx, dy)]));
    setTrazos((prev) => prev.map((s) => nuevos.get(s.id) ?? s));
  }, []);

  /** Y agarrándolo por un TRAZO: entonces son las piezas las que acompañan. */
  const moverNodosSel = useCallback((dx: number, dy: number) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.selected ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n,
      ),
    );
  }, []);

  const cambiarVarios = useCallback((ts: Trazo[]) => {
    const nuevos = new Map(ts.map((s) => [s.id, s]));
    setTrazos((prev) => prev.map((s) => nuevos.get(s.id) ?? s));
  }, []);

  /** Coger un trazo de uno en uno deshace el grupo, salvo que ya estuviera
      dentro: si no, moverías una flecha suelta con diez piezas encendidas y
      Suprimir se llevaría por delante todo lo que creías haber soltado. */
  const elegirTrazo = useCallback(
    (id: string | null) => {
      setSelTrazo(id);
      if (id && !grupoRef.current.has(id)) soltar();
    },
    [soltar],
  );

  // Ponerse a dibujar suelta el grupo: tener diez piezas encendidas mientras
  // trazas una flecha solo despista, y el marco siguiente empieza de cero igual.
  useEffect(() => {
    if (tool === "sel" || tool === "marco") return;
    setGrupo(new Set());
    setActivo(false);
    setConfirmar(false);
  }, [tool]);

  /**
   * El teclado del lienzo, todo por el mismo sitio.
   *
   * Qué tecla dispara qué lo decide `lib/atajos`, no este componente: aquí solo
   * está qué hace cada acción. Así el editor de Ajustes puede cambiarlas sin
   * que este archivo se entere, y no hay teclas escritas a mano repartidas por
   * media pantalla.
   *
   * Quién NO recibe estas teclas, en orden: si el lienzo no está a la vista
   * (sigue montado aunque estés en Ajustes), si el foco está en algo donde se
   * escribe (eso lo mira `accionDe`), y si el atajo cae dentro de una terminal
   * y es de los que ahí significan otra cosa.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!hoja.current?.offsetParent) return;
      const accion = accionDe(e, mapaRef.current);
      // Deshacer y rehacer los lleva el efecto de arriba, que solo escucha
      // mientras hay herramienta puesta: dentro de una terminal Ctrl+Z suspende
      // el proceso que corre ahí, y robárselo sería peor que no tener deshacer.
      if (!accion || accion === "deshacer" || accion === "rehacer") return;

      // Un pane con el teclado es una terminal escuchando: no se le quitan las
      // teclas por la espalda. Solo pasan las que necesitan el foco fuera para
      // tener sentido, y para eso ya está la comprobación de arriba.
      switch (accion) {
        case "claude":
        case "shell":
        case "agy":
          e.preventDefault();
          spawn(accion);
          return;
        case "nota":
          e.preventDefault();
          ponerNota();
          return;
        case "web":
          e.preventDefault();
          ponerWeb();
          return;
        case "galeria":
          e.preventDefault();
          ponerGaleria();
          return;
        case "todo":
          e.preventDefault();
          todo();
          return;
        case "encajar":
          e.preventDefault();
          void flow.fitView({ duration: 400, padding: 0.15 });
          return;
        case "soltar":
          // Esc hace dos cosas según lo que haya puesto, y en este orden: suelta
          // el grupo si lo hay, y si no, deja la herramienta de dibujo. Al revés
          // haría falta pulsarlo dos veces para lo más común.
          if (hayGrupo) soltar();
          else if (toolRef.current !== "sel") setTool("sel");
          return;
        case "borrar":
          if (!hayGrupo) return;
          e.preventDefault();
          // Se pregunta SOLO si caen terminales: cerrar una mata a su agente y
          // eso no se deshace. Un puñado de trazos vuelve con Ctrl+Z, así que
          // pedir permiso para borrarlos era una pregunta con una sola
          // respuesta posible, y encima dejaba la tecla pulsada sin efecto
          // visible: parecía que Suprimir no hacía nada.
          if (confirmar || !termsDentro) borrarGrupo();
          else setConfirmar(true);
          return;
        case "copiar":
          if (!cogidosRef.current.length) return;
          e.preventDefault();
          void copiar();
          return;
        case "duplicar":
          if (!cogidosRef.current.length) return;
          e.preventDefault();
          duplicar();
          return;
        case "agrupar":
          e.preventDefault();
          agrupar();
          return;
        case "clavar":
          e.preventDefault();
          bloquear();
          return;
        case "alFrente":
          e.preventDefault();
          mandarAlBorde(true);
          return;
        case "alFondo":
          e.preventDefault();
          mandarAlBorde(false);
          return;
        case "estiloCopiar":
          e.preventDefault();
          copiarEstilo();
          return;
        case "estiloPegar":
          e.preventDefault();
          pegarEstilo();
          return;
        case "exportar":
          e.preventDefault();
          void exportarDibujo(true);
          return;
        default: {
          // Lo que queda son las herramientas de dibujo, que se llaman igual
          // que su acción menos la mano.
          const t: DrawTool = accion === "mano" ? "sel" : (accion as DrawTool);
          e.preventDefault();
          setTool(t);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    hayGrupo,
    confirmar,
    termsDentro,
    soltar,
    todo,
    borrarGrupo,
    spawn,
    ponerNota,
    ponerWeb,
    ponerGaleria,
    flow,
    copiar,
    duplicar,
    agrupar,
    bloquear,
    mandarAlBorde,
    copiarEstilo,
    pegarEstilo,
    exportarDibujo,
  ]);

  /**
   * Las flechas del teclado mueven lo cogido.
   *
   * No entran en el catálogo de atajos porque no son UNA tecla sino cuatro con
   * el mismo significado, y porque nadie va a querer cambiarlas: son las
   * flechas en todos los editores que existen. Una unidad del lienzo por
   * pulsación, diez con Mayús, que es lo justo para colocar algo al píxel sin
   * pelearse con el imán.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!hoja.current?.offsetParent || escribiendoTexto()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const paso = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -paso : e.key === "ArrowRight" ? paso : 0;
      const dy = e.key === "ArrowUp" ? -paso : e.key === "ArrowDown" ? paso : 0;
      if (!dx && !dy) return;
      if (!cogidosRef.current.length) return;
      e.preventDefault();
      moverCogidos(dx, dy);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moverCogidos]);

  /* ------------------------------------------------- el lienzo, en archivo */

  /**
   * El tablero entero, en el formato del archivo.
   *
   * Lo usan dos cosas que se parecen y no son iguales: guardarlo en un `.json`
   * para llevártelo, y el guardado automático que lo devuelve al abrir. La
   * diferencia es `conComandos`: el que vuelve solo lleva apuntado el comando
   * de cada terminal, para que cada Claude retome SU conversación; el que
   * compartes no, porque ahí dentro va el identificador de una sesión que solo
   * existe en esta máquina y que en otra no abre nada.
   */
  const construir = useCallback(
    (conComandos: boolean): CanvasFile => {
    const guardados: NodoGuardado[] = [];
    for (const n of nodes) {
      const pos = { id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y) };
      if (n.type === "term") {
        const d = (n as Node<TermData>).data;
        guardados.push({
          ...pos,
          ...medida(n, NODE_W, NODE_H),
          tipo: "term",
          kind: d.kind,
          proyecto: d.proyecto,
          ruta: d.pane.cwd,
          cmd: conComandos ? d.pane.command : undefined,
        });
      } else if (n.type === "widget") {
        guardados.push({
          ...pos,
          ...medida(n, 260, 300),
          tipo: "widget",
          kind: (n as Node<WidgetData>).data.kind,
        });
      } else if (n.type === "note") {
        const d = (n as Node<NoteData>).data;
        guardados.push({
          ...pos,
          ...medida(n, 280, 260),
          tipo: "nota",
          nota: d.noteId,
          color: d.color,
        });
      } else if (n.type === "img") {
        const d = (n as Node<ImageData>).data;
        guardados.push({
          ...pos,
          ...medida(n, 460, 400),
          tipo: "img",
          src: d.src,
          iw: d.w,
          ih: d.h,
          formas: d.formas ?? [],
        });
      } else if (n.type === "web") {
        guardados.push({
          ...pos,
          ...medida(n, 520, 420),
          tipo: "web",
          url: (n as Node<WebData>).data.url,
        });
      } else if (n.type === "chat") {
        const dd = (n as Node<ChatData>).data;
        guardados.push({
          ...pos,
          ...medida(n, 380, 420),
          tipo: "chat",
          chat: dd.chatId,
          modelo: dd.modelo,
        });
      } else if (n.type === "kanban") {
        // Solo las tarjetas tuyas: las otras tres columnas son el estado de los
        // agentes de AHORA, y guardar eso sería guardar una foto que al abrir
        // ya sería mentira.
        guardados.push({
          ...pos,
          ...medida(n, 760, 400),
          tipo: "kanban",
          pendientes: (n as Node<KanbanData>).data.pendientes ?? [],
        });
      }
    }
    const flechas: FlechaGuardada[] = edges.map((e) => ({
      id: e.id,
      de: e.source,
      a: e.target,
      encargo: String(e.data?.brief ?? ""),
      auto: !!e.data?.auto,
    }));
    return {
      kind: CANVAS_FILE_KIND,
      v: CANVAS_FILE_VERSION,
      guardado: new Date().toISOString(),
      proyecto: project,
      nodos: guardados,
      flechas,
      trazos,
    };
    },
    [nodes, edges, trazos, project],
  );

  const exportar = useCallback(async () => {
    const archivo = construir(false);
    try {
      const ruta = await guardarComo({
        defaultPath: nombreSugerido(project),
        filters: [{ name: "Lienzo de Adeorq", extensions: ["json"] }],
      });
      if (!ruta) return;
      await saveCanvasFile(ruta, JSON.stringify(archivo, null, 2));
      setNote(t("Lienzo guardado en {r}", { r: ruta }));
    } catch (e) {
      setNote(String(e));
    }
  }, [construir, project, t]);

  const elegirArchivo = useCallback(async () => {
    try {
      const ruta = await abrirArchivo({
        multiple: false,
        filters: [{ name: "Lienzo de Adeorq", extensions: ["json"] }],
      });
      if (!ruta || typeof ruta !== "string") return;
      const leido = parsear(await readCanvasFile(ruta));
      if (!leido) {
        setNote(t("Ese archivo no es un lienzo de Adeorq."));
        return;
      }
      setEntrante(leido);
    } catch (e) {
      setNote(String(e));
    }
  }, [t]);

  /** Vuelca un lienzo leído sobre el actual. No borra nada de lo que ya hay:
   *  si estabas trabajando, tu tablero sigue vivo y el importado se le suma.
   *
   *  `callado` es para el tablero que vuelve solo al abrir: hace lo mismo, pero
   *  sin anunciarlo. Un aviso de «lienzo importado» al arrancar sobra, porque
   *  eso no lo ha pedido nadie ahora mismo, es lo normal. */
  const aplicarImport = useCallback(
    async (f: CanvasFile, abrirTerminales: boolean, callado = false) => {
      setEntrante(null);
      const mapa = new Map<string, string>();
      const sello = Date.now().toString(36);

      for (const n of f.nodos) {
        if (n.tipo === "term") {
          if (!abrirTerminales) continue;
          // Con comando apuntado, vuelve a SU conversación; sin él (un tablero
          // de otra máquina) nace como una terminal nueva de ese tipo.
          const command = n.cmd ? await alVolver(n.ruta, n.cmd) : undefined;
          const pane = place(
            n.kind,
            { name: n.proyecto || n.ruta, path: n.ruta, hasGit: false },
            { x: n.x, y: n.y, w: n.w, h: n.h },
            command ? { command } : undefined,
          );
          mapa.set(n.id, String(pane.id));
        } else if (n.tipo === "widget") {
          const nodeId = `w${sello}${mapa.size}`;
          mapa.set(n.id, nodeId);
          setNodes((prev) => [
            ...prev,
            {
              id: nodeId,
              type: "widget",
              position: { x: n.x, y: n.y },
              style: { width: n.w, height: n.h },
                  data: { kind: n.kind, nodeId, onClose: quitarWidget },
            } as Node<WidgetData>,
          ]);
        } else if (n.tipo === "nota") {
          // La nota vuelve por su id de archivo: el texto lo lee ella sola de
          // disco, así que un tablero reabierto trae los apuntes al día y no
          // los que tenía el día que lo guardaste.
          const nodeId = `n${sello}${mapa.size}`;
          mapa.set(n.id, nodeId);
          setNodes((prev) => [
            ...prev,
            {
              id: nodeId,
              type: "note",
              position: { x: n.x, y: n.y },
              style: { width: n.w, height: n.h },
                  data: {
                noteId: n.nota,
                color: n.color,
                nodeId,
                onClose: quitarWidget,
                onColor: colorNota,
              },
            } as Node<NoteData>,
          ]);
        } else if (n.tipo === "chat") {
          // Con su archivo y su modelo: la conversación la lee él solo del
          // disco, así que un tablero reabierto trae la charla donde la dejaste.
          ponerChat(n.chat, n.modelo, { x: n.x, y: n.y, w: n.w, h: n.h });
        } else if (n.tipo === "kanban") {
          // Con las tarjetas que trae, y en su sitio: `ponerKanban` decide solo
          // si ya había uno puesto, que es lo que evita el segundo tablero al
          // importar un lienzo encima de otro.
          ponerKanban(n.pendientes);
        } else if (n.tipo === "web") {
          const nodeId = `n${sello}${mapa.size}w`;
          mapa.set(n.id, nodeId);
          setNodes((prev) => [
            ...prev,
            {
              id: nodeId,
              type: "web",
              position: { x: n.x, y: n.y },
              style: { width: n.w, height: n.h },
              data: {
                nodeId,
                url: n.url,
                onClose: quitarWidget,
                onUrl: cambiarUrl,
                onFroede: abrirFroede,
              },
            } as Node<WebData>,
          ]);
        } else {
          const nodeId = `i${sello}${mapa.size}`;
          mapa.set(n.id, nodeId);
          setNodes((prev) => [
            ...prev,
            {
              id: nodeId,
              type: "img",
              position: { x: n.x, y: n.y },
              style: { width: n.w, height: n.h },
                  data: {
                src: n.src,
                w: n.iw,
                h: n.ih,
                nodeId,
                formas: n.formas,
                onClose: quitarWidget,
                onFormas: guardarFormas,
                terminales: panesRef.current
                  .filter((x) => !!x.command)
                  .map((x) => ({ id: x.id, name: x.name })),
                onEnviar: (id: number, blob: Blob, nota: string) =>
                  void enviarCaptura(id, blob, nota),
              },
            } as Node<ImageData>,
          ]);
        }
      }

      // Solo sobreviven las flechas cuyos dos extremos han entrado: una flecha
      // a un nodo que no existe se pintaría en el vacío.
      setEdges((prev) => [
        ...prev,
        ...f.flechas
          .filter((e) => mapa.has(e.de) && mapa.has(e.a))
          .map((e) => {
            // De qué nota sale, si sale de una. No se guarda en el archivo:
            // se deduce del nodo de origen, que es la única fuente que no
            // puede quedarse desfasada.
            const desde = f.nodos.find((n) => n.id === e.de);
            const nota = desde?.tipo === "nota" ? desde.nota : undefined;
            return {
              id: `e-${sello}-${e.id}`,
              source: mapa.get(e.de)!,
              target: mapa.get(e.a)!,
              animated: true,
              label: e.encargo || (nota ? t("notas") : "encargo…"),
              data: { brief: e.encargo, auto: e.auto, nota },
            };
          }),
      ]);

      // Los ids de los trazos se rehacen: importar dos veces el mismo archivo
      // dejaría dos trazos con el mismo id y la goma borraría los dos.
      // Las flechas pegadas a una pieza siguen pegadas: los ids de los nodos se
      // reparten de nuevo al importar (`mapa`), así que el ancla se traduce al
      // id nuevo. Si esa pieza no llegó a abrirse —un tablero traído con las
      // terminales sin abrir—, el ancla se cae y la flecha se queda donde el
      // dibujo la dejó, que es mejor que apuntar a un id que no existe.
      const reancla = (a?: Ancla): Ancla | undefined => {
        if (!a) return undefined;
        const nodo = mapa.get(a.nodo);
        return nodo ? { ...a, nodo } : undefined;
      };
      setTrazos((prev) => [
        ...prev,
        ...f.trazos.map((s) => ({
          ...s,
          id: `${sello}-${s.id}`,
          anclaDe: reancla(s.anclaDe),
          anclaA: reancla(s.anclaA),
        })),
      ]);

      if (!callado) {
        const r = resumen(f);
        setNote(
          abrirTerminales
            ? t("Lienzo importado: {n} terminales abriéndose.", { n: String(r.terminales) })
            : t("Lienzo importado sin abrir terminales."),
        );
      }
      window.setTimeout(() => void flow.fitView({ duration: 400, padding: 0.15 }), 250);
    },
    [
      place,
      quitarWidget,
      guardarFormas,
      enviarCaptura,
      colorNota,
      cambiarUrl,
      abrirFroede,
      alVolver,
      flow,
      t,
    ],
  );

  /* --------------------------------- el tablero que vuelve solo al abrir
   *
   * La Cabina ya recuperaba sus terminales; el lienzo no recuperaba nada, así
   * que cerrar Adeorq se llevaba por delante el tablero entero: piezas,
   * posiciones, flechas con su encargo, notas y dibujo. Había que acordarse de
   * exportarlo a un archivo a mano, y acordarse no es una función.
   *
   * Va al MISMO archivo que exportarías tú, en la carpeta de datos de la app,
   * y con el comando de cada terminal apuntado para que cada Claude vuelva a
   * su conversación.
   */
  const vueltaPedida = useRef(false);
  /**
   * Hasta que la vuelta TERMINA no se guarda nada, y son dos banderas y no una
   * por un motivo concreto: entre que se pide el archivo y se aplica pasa un
   * rato (leerlo, y abrir una terminal por cada una que hubiera). Con una sola
   * bandera puesta al empezar, el guardado automático se disparaba en ese
   * hueco y escribía el tablero medio montado —o vacío, si la lectura fallaba—
   * encima del bueno. El que se cae por su propio salvavidas.
   */
  const [puedeGuardar, setPuedeGuardar] = useState(false);

  useEffect(() => {
    if (vueltaPedida.current) return;
    vueltaPedida.current = true;
    void (async () => {
      try {
        const crudo = await readBoard();
        const leido = crudo ? parsear(crudo) : null;
        // Las terminales solo si él tiene puesto recuperarlas, igual que en la
        // Cabina: son procesos, y el resto del tablero no cuesta nada.
        if (leido) await aplicarImport(leido, recuperar, true);
      } catch {
        // Un tablero que no se puede leer no puede impedir abrir la app: se
        // empieza en blanco, y el primer cambio lo reescribe.
      } finally {
        setPuedeGuardar(true);
      }
    })();
    // A propósito solo al montar: es la vuelta, no algo que se repita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Y se guarda solo mientras trabajas, con un respiro: arrastrar una pieza
      dispara un cambio por fotograma, y escribir el archivo en cada uno sería
      escribir en disco sesenta veces por segundo para guardar lo mismo. Al
      soltar, una sola escritura con el resultado. */
  useEffect(() => {
    if (!puedeGuardar) return;
    const t = window.setTimeout(() => {
      void saveBoard(JSON.stringify(construir(true))).catch(() => {});
    }, 900);
    return () => window.clearTimeout(t);
  }, [puedeGuardar, construir]);

  /* --------------------------------------------------------- los menús */

  // Agrupado, no una lista de quince cosas del mismo peso: arriba lo que
  // guarda trabajo suyo, luego los cacharros que corren solos, y al final las
  // utilidades. Con dos piezas daba igual; con quince, ya no.
  const itemsPiezas = useCallback(
    (): MenuItem[] => [
      { label: t("Tu trabajo"), heading: true },
      // El atajo va donde está la acción: es como se aprende una tecla, en vez
      // de yendo a buscarla a Ajustes. Si él se lo quitó, no se enseña nada.
      {
        icon: <NoteIcon size={15} />,
        label: t("Nota"),
        hint: comoTexto(mapaRef.current.nota) || t("se guarda sola"),
        onClick: () => ponerNota(),
      },
      {
        icon: <GalleryIcon size={15} />,
        label: t("Galería"),
        hint: comoTexto(mapaRef.current.galeria) || t("lo que has pegado"),
        onClick: ponerGaleria,
      },
      {
        icon: <BrowserIcon size={15} />,
        label: t("Ventana de localhost"),
        hint: comoTexto(mapaRef.current.web) || t("ver la web mientras se hace"),
        onClick: ponerWeb,
      },
      {
        icon: <KanbanIcon size={15} />,
        label: t("Tablero del trabajo"),
        hint: t("quién trabaja y quién te espera"),
        onClick: () => ponerKanban(),
      },
      {
        icon: <ChatIcon size={15} />,
        label: t("Chat con un modelo"),
        hint: t("por tu clave, sin gastar suscripción"),
        onClick: () => ponerChat(),
      },
      { label: "", separator: true },
      { label: t("Cacharros"), heading: true },
      ...WIDGETS.filter((w) => !ES_UTILIDAD.has(w.kind)).map((w) => ({
        icon: w.icon,
        label: t(w.label),
        onClick: () => ponerWidget(w.kind),
      })),
      { label: "", separator: true },
      { label: t("Utilidades"), hint: t("nada sale de aquí"), heading: true },
      ...WIDGETS.filter((w) => ES_UTILIDAD.has(w.kind)).map((w) => ({
        icon: w.icon,
        label: t(w.label),
        onClick: () => ponerWidget(w.kind),
      })),
    ],
    [t, ponerNota, ponerGaleria, ponerWeb, ponerWidget, ponerKanban, ponerChat],
  );

  const menuPiezas = (e: React.MouseEvent) => menu(e, itemsPiezas());

  /** Un texto de ayuda con su tecla detrás, si esa acción tiene una puesta. */
  const conTecla = (texto: string, id: AccionId) => {
    const k = comoTexto(mapaRef.current[id]);
    return k ? `${texto} (${k})` : texto;
  };

  const menuLienzo = (e: React.MouseEvent) =>
    menu(e, [
      { label: t("Guardar el lienzo…"), hint: t("a un .json"), onClick: () => void exportar() },
      { label: t("Abrir un lienzo…"), onClick: () => void elegirArchivo() },
      { label: "", separator: true },
      // El dibujo, aparte del tablero: un .json de Adeorq solo lo abre Adeorq,
      // y un diagrama hay que poder pegarlo en un sitio cualquiera.
      {
        label: t("Exportar el dibujo a PNG"),
        hint: comoTexto(mapaRef.current.exportar),
        onClick: () => void exportarDibujo(true),
      },
      { label: t("Exportar el dibujo a SVG"), onClick: () => void exportarDibujo(false) },
      { label: "", separator: true },
      {
        label: t("Encajar todo en la pantalla"),
        hint: comoTexto(mapaRef.current.encajar),
        onClick: () => void flow.fitView({ duration: 400, padding: 0.15 }),
      },
      {
        label: t("Borrar todo el dibujo"),
        hint: trazos.length ? String(trazos.length) : undefined,
        danger: trazos.length > 0,
        onClick: () => setTrazos([]),
      },
    ]);

  const visibles = projects.filter((p) =>
    p.name.toLowerCase().includes(filtro.trim().toLowerCase()),
  );

  return (
    <div
      className="canvas-wrap"
      // Dos pegados por el mismo sitio y en este orden: si lo copiado son
      // trazos nuestros, entran como dibujo; si no, se mira si es una captura.
      onPaste={(e) => {
        if (!pegarTrazos(e)) pegar(e);
      }}
      tabIndex={-1}
    >
      {/* La barra manda tres cosas distintas (dónde trabajo, con qué dibujo,
          qué le hago al tablero) y antes eran nueve botones seguidos, todos
          del mismo peso. Ahora cada cosa es un grupo y el trabajo va primero. */}
      <div className="canvas-bar">
        <div className="cb-group">
          <div className="cb-proj-wrap">
            <button
              className="cb-proj"
              data-open={picker}
              data-tip={t("En qué proyecto se abre lo que sueltes aquí")}
              onClick={() => {
                setFiltro("");
                setPicker((v) => !v);
              }}
            >
              <span className="cb-proj-name">{project || t("Elige proyecto")}</span>
              <span className="cb-caret" aria-hidden="true">
                ▾
              </span>
            </button>
            {picker && (
              <>
                <div className="cb-veil" onClick={() => setPicker(false)} />
                <div className="cb-pop">
                  <input
                    className="finder cb-find"
                    autoFocus
                    placeholder={t("Buscar proyecto")}
                    value={filtro}
                    onChange={(e) => setFiltro(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setPicker(false);
                      if (e.key === "Enter" && visibles[0]) {
                        setProject(visibles[0].name);
                        setPicker(false);
                      }
                    }}
                  />
                  <ul className="cb-list">
                    {visibles.map((p) => (
                      <li key={p.path}>
                        <button
                          data-on={p.name === project}
                          onClick={() => {
                            setProject(p.name);
                            setPicker(false);
                          }}
                        >
                          <span className="cb-list-name">{p.name}</span>
                        </button>
                      </li>
                    ))}
                    {!visibles.length && <li className="cb-empty">{t("Nada con ese nombre.")}</li>}
                  </ul>
                </div>
              </>
            )}
          </div>
          <span className="cb-div" />
          <button
            className="cb-spawn cb-primary"
            disabled={!project}
            data-tip={conTecla(t("Nueva sesión de Claude Code aquí"), "claude")}
            onClick={() => spawn("claude")}
          >
            <span aria-hidden="true">✦</span> Claude
          </button>
          <button
            className="cb-spawn"
            disabled={!project}
            data-tip={conTecla(t("Terminal PowerShell aquí"), "shell")}
            onClick={() => spawn("shell")}
          >
            <span aria-hidden="true">&gt;_</span> {t("Terminal")}
          </button>
          <button
            className="cb-spawn"
            disabled={!project}
            data-tip={conTecla(t("Antigravity (agy) en una terminal aquí"), "agy")}
            onClick={() => spawn("agy")}
          >
            <span aria-hidden="true">◈</span> Antigravity
          </button>
        </div>

        {/* Los tres lienzos. Va ANTES de las herramientas porque decide cuáles
            de ellas existen: primero eliges a qué vienes, luego con qué. */}
        <div className="cb-group cb-modos">
          {MODOS.map((m) => (
            <button
              key={m.id}
              className="cb-modo"
              data-on={modo === m.id}
              data-tip={t(m.tip)}
              onClick={() => {
                setModo(m.id);
                localStorage.setItem(MODO_KEY, m.id);
                // Al entrar en «terminales» la herramienta vuelve a la mano: si
                // te quedaste con el lápiz cogido, al volver a «dibujo» te
                // encontrarías dibujando sin haberlo pedido.
                if (m.id === "terminales") setTool("sel");
              }}
            >
              {t(m.label)}
            </button>
          ))}
        </div>

        {/* Dibujo: flechas y notas encima del tablero, no dentro de un nodo. */}
        {dibujable && (
        <div className="cb-group cb-tools">
          {DRAW_TOOLS.map((h) => {
            // La mano se llama "sel" como herramienta y "mano" como acción;
            // las demás se llaman igual en los dos sitios.
            const tecla = comoTexto(mapaRef.current[(h.t === "sel" ? "mano" : h.t) as AccionId]);
            return (
              <button
                key={h.t}
                className="cb-tool"
                data-on={tool === h.t}
                data-tip={tecla ? `${t(h.label)} (${tecla})` : t(h.label)}
                onClick={() => setTool(h.t)}
              >
                {h.icon}
              </button>
            );
          })}
        </div>
        )}

        {/* La rejilla va en su propio grupo y NO con las herramientas de
            dibujo, aunque naciera ahí: coloca terminales igual que coloca
            trazos, así que en el modo «terminales» tiene que seguir estando.
            Y no es una herramienta: no se «coge», cambia cómo se comportan
            todas las demás. */}
        <div className="cb-group">
          <button
            className="cb-tool"
            data-on={rejilla}
            data-tip={
              rejilla
                ? t("Rejilla puesta: todo cae en una casilla. Púlsalo para moverlo libre otra vez.")
                : t("Poner la rejilla: lo que muevas cae en la casilla más cercana, terminales y dibujo. Los puntos del fondo son las casillas.")
            }
            onClick={() => {
              const v = !rejilla;
              setRejilla(v);
              localStorage.setItem(REJILLA_KEY, v ? "1" : "0");
            }}
          >
            <GridIcon size={15} />
          </button>
        </div>

        <div className="cb-group">
          <button className="cb-btn" data-tip={t("Pomodoro, cronómetro, calculadora o calendario")} onClick={menuPiezas}>
            <span aria-hidden="true">＋</span> {t("Añadir")} <span className="cb-caret">▾</span>
          </button>
          <button
            className="cb-btn"
            disabled={!focusedId}
            data-tip={
              focusedId
                ? t("Contarle a la terminal enfocada qué más hay en el lienzo y qué flechas salen de dónde")
                : t("Enfoca una terminal del lienzo para poder contarle el tablero")
            }
            onClick={() => focusedId && mandarTablero(focusedId)}
          >
            <span aria-hidden="true">⌘</span> {t("Contar el tablero")}
          </button>
        </div>

        <span className="cb-spacer" />

        <div className="cb-group">
          <button className="cb-btn" data-tip={t("Guardar este tablero en un archivo o abrir otro")} onClick={menuLienzo}>
            <span aria-hidden="true">⤓</span> {t("Lienzo")} <span className="cb-caret">▾</span>
          </button>
          <button
            className="cb-tool"
            data-tip={t(
              "Arrastra de un borde a otro para encadenar: cuando el primero termina, su resultado pasa al siguiente.\nCtrl+V pega una captura. Ctrl+A coge todo el lienzo y Supr se lo lleva. Esc suelta.",
            )}
          >
            ?
          </button>
        </div>
      </div>

      {/* Los ajustes del trazo cuando hay algo que ajustar: una herramienta
          puesta, o algo cogido con la flecha, que es cuando repintan. */}
      {((tool !== "sel" && tool !== "marco") || selTrazo) && (
        <div className="canvas-props">
          <span className="cp-title">
            {selTrazo && tool === "sel"
              ? t("Lo seleccionado")
              : t(DRAW_TOOLS.find((h) => h.t === tool)?.label ?? "")}
          </span>
          {tool !== "goma" && (
            <>
              <span className="cp-grupo">{t("Color")}</span>
              {DRAW_COLORS.map((c) => (
                <button
                  key={c}
                  className="cp-color"
                  data-on={color === c}
                  style={{ background: c }}
                  onClick={() => usarColor(c)}
                />
              ))}
              {/* Y el que no está en la fila: la rueda del sistema, para no
                  quedarse en seis colores cuando uno quiere el suyo. */}
              <label className="cp-color cp-pick" data-tip={t("Cualquier otro color")}>
                <span className="cp-pick-face" style={{ background: color }} />
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#ff6b6b"}
                  onChange={(e) => usarColor(e.currentTarget.value)}
                />
              </label>
              <span className="cp-grupo">{t("Grosor")}</span>
              {DRAW_WIDTHS.map((w) => (
                <button
                  key={w}
                  className="cp-width"
                  data-on={grosor === w}
                  data-tip={t("Grosor")}
                  onClick={() => usarGrosor(w)}
                >
                  <span style={{ height: w }} />
                </button>
              ))}
              {/* La tipografía, solo cuando hay texto de por medio: en una
                  flecha no significa nada y sería un botón muerto. */}
              {(tool === "texto" || trazos.find((x) => x.id === selTrazo)?.t === "texto") && (
                <>
                  <span className="cp-grupo">{t("Tipografía")}</span>
                  <button
                    className="cp-font"
                    data-tip={t("Tipografía")}
                    style={{ fontFamily: fuente(fuenteId).css }}
                    onClick={(e) =>
                      menu(
                        e,
                        DRAW_FONTS.map((f) => ({
                          label: t(f.label),
                          // Cada opción escrita con SU letra: así se elige
                          // mirando, no leyendo un nombre.
                          icon: (
                            <span style={{ fontFamily: f.css, fontSize: 13, fontWeight: 700 }}>
                              Aa
                            </span>
                          ),
                          onClick: () => usarFuente(f.id),
                        })),
                      )
                    }
                  >
                    Aa
                  </button>
                </>
              )}
              {/* El relleno, el boceto y las puntas se quedan SIEMPRE en la
                  barra, apagados donde no significan nada, en vez de aparecer y
                  desaparecer. Estaban escondidos tras la herramienta que
                  tuvieras puesta, así que con el lápiz en la mano la barra se
                  veía igual que antes de que existieran y parecía que no
                  estaban. Un botón apagado se aprende; uno que no está, no. */}
              <span className="cp-grupo">{t("Relleno")}</span>
              <button
                className="cp-fill"
                data-on={relleno > 0}
                disabled={!(tool === "caja" || tool === "rombo" || tool === "elipse" || rellenable)}
                data-tip={t("Relleno: hueca, translúcida o maciza")}
                onClick={usarRelleno}
              >
                <span style={{ background: color, opacity: relleno || 0.12 }} />
              </button>
              <button
                className="cp-btn"
                data-on={rugoso}
                disabled={
                  !(
                    tool === "caja" ||
                    tool === "rombo" ||
                    tool === "elipse" ||
                    tool === "linea" ||
                    tool === "flecha" ||
                    rellenable ||
                    conPuntas
                  )
                }
                data-tip={t("Dibujar a mano alzada")}
                onClick={usarRugoso}
              >
                <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                  <path
                    d="M2 11.5 C4 9 5 13 7.5 10.5 S11.5 6 14 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              {/* Con qué se pinta el relleno: macizo, rayado o cruzado. Solo
                  tiene sentido cuando hay relleno, así que se apaga sin él en
                  vez de dejarte pulsar algo que no cambia nada. */}
              <button
                className="cp-btn"
                data-on={trama !== "macizo"}
                disabled={
                  !relleno || !(tool === "caja" || tool === "rombo" || tool === "elipse" || rellenable)
                }
                data-tip={t("Relleno: macizo, rayado o cruzado")}
                onClick={usarTrama}
              >
                <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                  <rect x="2" y="3.5" width="12" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  {trama !== "macizo" && (
                    <path d="M3.4 11 L6.4 4.8 M6.6 11.6 L9.6 5 M9.9 11.9 L12.6 6" stroke="currentColor" strokeWidth="1" fill="none" />
                  )}
                  {trama === "cruzado" && (
                    <path d="M3.4 6 L6.1 11.9 M6.4 4.9 L9.6 11.7 M9.9 5 L12.6 10.8" stroke="currentColor" strokeWidth="1" fill="none" />
                  )}
                  {trama === "macizo" && <rect x="4" y="5.5" width="8" height="5" fill="currentColor" opacity="0.75" />}
                </svg>
              </button>
              {/* Esquinas vivas o redondeadas. La elipse no entra: no tiene
                  esquinas que redondear. */}
              <span className="cp-grupo">{t("Forma")}</span>
              <button
                className="cp-btn"
                data-on={vivas}
                disabled={!(tool === "caja" || tool === "rombo" || esquinable)}
                data-tip={t("Esquinas: redondeadas o vivas")}
                onClick={usarVivas}
              >
                <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                  <path
                    d={vivas ? "M3 13 V4 H13" : "M3 13 V7 a3 3 0 0 1 3 -3 H13"}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <span className="cp-grupo">{t("Línea")}</span>
              {/* Recta o curva, solo para líneas y flechas. */}
              <button
                className="cp-btn"
                data-on={curva}
                disabled={!(tool === "linea" || tool === "flecha" || conPuntas)}
                data-tip={t("Línea recta o curva")}
                onClick={usarCurva}
              >
                <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                  <path
                    d={curva ? "M2 12 C5 12 5 4 8 4 S11 12 14 12" : "M2 12 L14 4"}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              {/* El patrón de la línea: entera, a guiones, a puntos. El botón
                  enseña el que viene, que es más rápido de leer que un nombre. */}
              <button
                className="cp-btn"
                data-on={guion !== "solido"}
                data-tip={t("Línea: entera, a guiones o a puntos")}
                onClick={usarGuion}
              >
                <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                  <path
                    d="M1.5 8 H14.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeDasharray={
                      guion === "guiones" ? "4 2.6" : guion === "puntos" ? "0.1 3" : undefined
                    }
                  />
                </svg>
              </button>
              {/* Lo transparente que va TODO, borde incluido: es lo que
                  convierte una caja en una marca de agua sobre una terminal. */}
              <span className="cp-grupo">{t("Transparencia")}</span>
              <button
                className="cp-fill"
                data-on={opacidad < 1}
                data-tip={t("Transparencia: opaco, medio o fantasma")}
                onClick={usarOpacidad}
              >
                <span style={{ background: color, opacity: opacidad }} />
              </button>
              {/* Las puntas, solo si hay una línea o una flecha de por medio:
                  en una caja no hay dónde ponerlas. */}
              {(conPuntas || tool === "flecha" || tool === "linea") && (
                <button
                  className="cp-btn"
                  data-tip={t("Las puntas de la línea")}
                  onClick={(e) =>
                    menu(
                      e,
                      (
                        [
                          ["nada", t("Sin punta")],
                          ["flecha", t("Punta abierta")],
                          ["triangulo", t("Punta maciza")],
                        ] as Array<[Punta, string]>
                      ).flatMap(([p, label]) => [
                        {
                          label: `${label} · ${t("al final")}`,
                          onClick: () => retocarSel({ puntaA: p }),
                        },
                        {
                          label: `${label} · ${t("al principio")}`,
                          onClick: () => retocarSel({ puntaDe: p }),
                        },
                      ]),
                    )
                  }
                >
                  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                    <path
                      d="M2 8 H11 M11 8 L8 5.4 M11 8 L8 10.6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
              <span className="cp-grupo">{t("Efecto")}</span>
              {/* El halo. Se pinta con el color que tengas puesto, así que el
                  botón enseña justo cómo va a quedar. */}
              <button
                className="cp-glow"
                data-on={glow}
                data-tip={t("Dibujar con brillo")}
                onClick={usarGlow}
              >
                <span style={{ background: color, boxShadow: `0 0 6px ${color}, 0 0 12px ${color}` }} />
              </button>
              <span className="cp-grupo">{t("Al dibujar")}</span>
              {tool !== "sel" && (
                <button
                  className="cp-btn"
                  data-on={fijar}
                  data-tip={t("Mantener la herramienta puesta para dibujar varias seguidas")}
                  onClick={() => setFijar((v) => !v)}
                >
                  <PinIcon size={14} />
                </button>
              )}
            </>
          )}
          {cogidos.length > 0 && tool === "sel" ? (
            <>
              <button
                className="cp-btn"
                data-tip={conTecla(t("Duplicar"), "duplicar")}
                onClick={duplicar}
              >
                <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                  <rect x="1.8" y="1.8" width="9" height="9" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.5" />
                  <rect x="5.2" y="5.2" width="9" height="9" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </button>
              <button
                className="cp-btn"
                data-on={trazosCogidos.every((s) => s.bloq)}
                data-tip={conTecla(t("Clavar al tablero"), "clavar")}
                onClick={bloquear}
              >
                <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                  <rect x="3.2" y="7" width="9.6" height="6.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M5.4 7 V5.2 a2.6 2.6 0 0 1 5.2 0 V7" fill="none" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </button>
              {cogidos.length > 1 && (
                <>
                  <button
                    className="cp-btn"
                    data-on={
                      trazosCogidos.every((s) => s.grupo) &&
                      new Set(trazosCogidos.map((s) => s.grupo)).size === 1
                    }
                    data-tip={conTecla(t("Agrupar o desagrupar"), "agrupar")}
                    onClick={agrupar}
                  >
                    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                      <rect x="1.6" y="1.6" width="5.4" height="5.4" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
                      <rect x="9" y="9" width="5.4" height="5.4" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
                      <path d="M7 4.3 H12 a2 2 0 0 1 2 2 V9" fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.55" />
                    </svg>
                  </button>
                  {/* Alinear y repartir van en un menú y no en ocho botones: se
                      usan de vez en cuando y la barra ya está llena. */}
                  <button
                    className="cp-btn"
                    data-tip={t("Alinear y repartir")}
                    onClick={(e) =>
                      menu(e, [
                        { label: t("A la izquierda"), onClick: () => alinear("izq") },
                        { label: t("Centrados a lo ancho"), onClick: () => alinear("centroH") },
                        { label: t("A la derecha"), onClick: () => alinear("der") },
                        { label: t("Arriba"), onClick: () => alinear("arriba") },
                        { label: t("Centrados a lo alto"), onClick: () => alinear("centroV") },
                        { label: t("Abajo"), onClick: () => alinear("abajo") },
                        { label: t("Repartir a lo ancho"), onClick: () => repartir(true) },
                        { label: t("Repartir a lo alto"), onClick: () => repartir(false) },
                      ])
                    }
                  >
                    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                      <path d="M2 2 V14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      <rect x="4.4" y="3.4" width="9.6" height="3.4" rx="1" fill="currentColor" opacity="0.8" />
                      <rect x="4.4" y="9.2" width="6" height="3.4" rx="1" fill="currentColor" opacity="0.55" />
                    </svg>
                  </button>
                </>
              )}
              <span className="cp-grupo">{t("Orden")}</span>
              <button
                className="cp-btn"
                data-tip={t("Traer al frente")}
                onClick={() => mandarAlBorde(true)}
              >
                <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                  <rect x="2.5" y="2.5" width="8" height="8" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.45" />
                  <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" fill="currentColor" stroke="none" />
                </svg>
              </button>
              <button
                className="cp-btn"
                data-tip={t("Enviar al fondo")}
                onClick={() => mandarAlBorde(false)}
              >
                <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                  <rect x="2.5" y="2.5" width="8" height="8" rx="1.6" fill="currentColor" stroke="none" />
                  <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.45" />
                </svg>
              </button>
              <span className="cp-grupo">{t("Acciones")}</span>
              <button
                className="cp-btn"
                data-tip={conTecla(t("Borrar lo seleccionado"), "borrar")}
                onClick={() => {
                  // Lo clavado no se borra desde aquí: primero se desclava.
                  const fuera = new Set(
                    trazosCogidos.filter((s) => !s.bloq).map((s) => s.id),
                  );
                  if (!fuera.size) return;
                  recordar();
                  setTrazos((p) => p.filter((s) => !fuera.has(s.id)));
                  setSelTrazo(null);
                  setGrupo(new Set());
                }}
              >
                <TrashIcon size={15} />
              </button>
              <button
                className="cp-btn cp-done"
                data-tip={conTecla(t("Soltar la selección"), "soltar")}
                onClick={() => {
                  setSelTrazo(null);
                  setGrupo(new Set());
                }}
              >
                {t("Soltar")}
              </button>
            </>
          ) : (
            <>
              <button
                className="cp-btn"
                disabled={!pasos.atras}
                data-tip={conTecla(t("Deshacer"), "deshacer")}
                onClick={deshacer}
              >
                <UndoIcon size={14} />
              </button>
              <button
                className="cp-btn"
                disabled={!pasos.alante}
                data-tip={t("Rehacer")}
                onClick={rehacer}
              >
                <UndoIcon size={14} redo />
              </button>
              <button
                className="cp-btn cp-done"
                data-tip={conTecla(t("Volver a mover"), "soltar")}
                onClick={() => setTool("sel")}
              >
                {t("Listo")}
              </button>
            </>
          )}
        </div>
      )}

      {/* El ratón se apunta aquí, en el contenedor, y no en el ReactFlow: así
          sigue valiendo aunque el puntero esté encima de una pieza. */}
      <div
        className="canvas-flow"
        ref={hoja}
        data-grupo={hayGrupo}
        onPointerDownCapture={derechoAbajo}
        onPointerMove={(e) => {
          raton.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerLeave={() => {
          raton.current = null;
        }}
        // En captura, no al burbujear: el menú lo abre un descendiente (el
        // pane de React Flow), así que para poder tragárselo tras un marco hay
        // que interceptarlo ANTES de que baje hasta él.
        onContextMenuCapture={(e) => {
          if (!comioMenu.current) return;
          comioMenu.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={(_, e) => {
            setEditing(e);
            setBrief(String(e.data?.brief ?? ""));
          }}
          // Clic derecho en el hueco: el mismo menú de añadir, donde apuntaste.
          // Es donde va la mano cuando quieres poner algo en un sitio concreto,
          // en vez de subir a la barra y volver.
          onPaneContextMenu={(e) =>
            menu(e as React.MouseEvent, [
              ...itemsPiezas(),
              ...(nodes.length || trazos.length
                ? [
                    { label: "", separator: true },
                    {
                      label: t("Coger todo el lienzo"),
                      hint: comoTexto(mapaRef.current.todo),
                      onClick: todo,
                    },
                  ]
                : []),
            ])
          }
          // Tocar el hueco suelta el grupo, que es lo que hace cualquier editor
          // y ahorra buscar el botón de soltar.
          onPaneClick={() => hayGrupo && soltar()}
          // Con Mayús se suma una pieza al grupo; sin Mayús, un clic vuelve a
          // ser un clic y deshace la selección anterior.
          onNodeClick={(e) => {
            // Un clic pelado ya deja React Flow una sola pieza seleccionada;
            // aquí solo hay que soltar el dibujo, que es lo que él no conoce.
            if (e.shiftKey) setActivo(true);
            else if (hayGrupo) {
              setGrupo(new Set());
              setActivo(false);
              setConfirmar(false);
            }
          }}
          onNodeDragStart={(_, n) => empiezaArrastre(n as CanvasNode)}
          onNodeDrag={(_, n) => durantArrastre(n as CanvasNode)}
          onNodeDragStop={() => {
            arrastreRef.current = null;
          }}
          // Backspace inside a terminal must never delete a node.
          deleteKeyCode={null}
          multiSelectionKeyCode="Shift"
          // El marco de fábrica (Mayús y arrastrar) queda apagado a propósito:
          // solo coge nodos, así que con dibujo por medio seleccionaría la
          // mitad de lo que hay dentro. El de la barra coge las dos cosas.
          selectionKeyCode={null}
          // Con una herramienta de dibujo puesta, el mismo arrastre no puede
          // significar dos cosas: aquí manda el trazo y el lienzo se queda
          // quieto. La rueda sigue haciendo zoom, que nunca estorba.
          panOnDrag={tool === "sel"}
          // En «dibujo» las piezas se ven pero no se cogen: con el lápiz en la
          // mano, un arrastre encima de una terminal es un trazo y no una
          // mudanza. En los otros dos modos manda la herramienta, como siempre.
          nodesDraggable={tool === "sel" && modo !== "dibujo"}
          // La rejilla para las terminales la trae React Flow de serie, así que
          // aquí no hay cuenta que hacer: solo decirle el paso, que es el mismo
          // con el que el fondo pinta sus puntos.
          snapToGrid={rejilla}
          snapGrid={[REJILLA, REJILLA]}
          selectionOnDrag={false}
          minZoom={0.3}
          maxZoom={1.4}
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
          fitView
        >
          {/* El paso sale de `REJILLA` y no de un 26 escrito aquí: estos puntos
              son la promesa de dónde van a caer las cosas, así que tienen que
              ser el MISMO número que las sujeta. Con la rejilla puesta se ven
              un poco más, porque entonces dejan de ser decoración. */}
          <Background
            variant={BackgroundVariant.Dots}
            gap={REJILLA}
            size={rejilla ? 1.6 : 1}
          />
          {/* La capa de dibujo entera desaparece en «terminales». No se pinta
              vacía ni transparente: no se monta, así que ni los trazos se ven
              ni su capa se come un solo clic. Los trazos siguen en su sitio, en
              memoria y en el archivo, y vuelven enteros al cambiar de modo:
              esto es una vista, no una papelera (Munir, 2026-08-09). */}
          {dibujable && (
          <CanvasDraw
            tool={tool}
            color={color}
            grosor={grosor}
            glow={glow}
            relleno={relleno}
            rugoso={rugoso}
            trama={trama}
            vivas={vivas}
            curva={curva}
            rejilla={rejilla}
            cajasNodos={cajasNodos}
            font={fuenteId}
            trazos={trazos}
            onAdd={addTrazo}
            onBorrar={borrarTrazo}
            onCambiar={cambiarTrazo}
            onGesto={alEmpezarGesto}
            onFinGesto={alSoltarGesto}
            sel={selTrazo}
            onSel={elegirTrazo}
            onFin={finTrazo}
            grupo={grupo}
            onMarco={marcar}
            onCambiarVarios={cambiarVarios}
            onMoverNodos={moverNodosSel}
          />
          )}
          <MiniMap pannable zoomable className="canvas-map" />
          <Controls showInteractive={false} />
        </ReactFlow>

        {/* El marco del botón derecho mientras se barre. Va aquí fuera y en
            píxeles de pantalla: no tiene que hacer zoom con el tablero, es el
            gesto de tu mano, no una cosa puesta en el lienzo. */}
        {marcoDer && (
          <div
            className="canvas-marco-der"
            style={{
              left: Math.min(marcoDer.x1, marcoDer.x2),
              top: Math.min(marcoDer.y1, marcoDer.y2),
              width: Math.abs(marcoDer.x2 - marcoDer.x1),
              height: Math.abs(marcoDer.y2 - marcoDer.y1),
            }}
          />
        )}

        {/* Lo que se puede hacer con el grupo, ahí abajo mientras haya grupo.
            Va fuera del ReactFlow para que no se mueva con el lienzo: es una
            barra de acciones, no algo que esté puesto en el tablero. */}
        {hayGrupo && (
          <div className="canvas-sel" role="toolbar">
            <span className="cs-n">{cuantos}</span>
            <span className="cs-txt">{cuantos === 1 ? t("cogida") : t("cogidas")}</span>
            <span className="cb-div" />
            <button className="cp-btn" data-tip={conTecla(t("Coger todo el lienzo"), "todo")} onClick={todo}>
              {t("Todo")}
            </button>
            {confirmar ? (
              <>
                <span className="cs-ask">
                  {termsDentro
                    ? t("Se cierran {n} terminales. ¿Seguro?").replace("{n}", String(termsDentro))
                    : t("¿Seguro?")}
                </span>
                <button className="cp-btn cs-danger" onClick={borrarGrupo}>
                  {t("Sí, borrar")}
                </button>
                <button className="cp-btn" onClick={() => setConfirmar(false)}>
                  {t("Cancelar")}
                </button>
              </>
            ) : (
              <button
                className="cp-btn cs-danger"
                data-tip={conTecla(t("Quitar del lienzo todo lo cogido"), "borrar")}
                // Igual que la tecla: solo se pregunta si hay terminales de por
                // medio, que es lo único que no se puede deshacer.
                onClick={() => (termsDentro ? setConfirmar(true) : borrarGrupo())}
              >
                {t("Borrar")}
              </button>
            )}
            <button className="cp-btn" data-tip={conTecla(t("Dejar de tenerlo cogido"), "soltar")} onClick={soltar}>
              {t("Soltar")}
            </button>
          </div>
        )}

        {nodes.length === 0 && trazos.length === 0 && (
          <div className="canvas-empty">
            <p className="empty-title">{t("El lienzo está vacío.")}</p>
            <p>
              {t(
                "Elige un proyecto arriba y suelta una terminal. Muévelas donde quieras, únelas con una flecha y escribe en la flecha qué debe pasarle el primero al segundo.",
              )}
            </p>
            <p>
              {t(
                "Encima puedes dibujar, pegar una captura con Ctrl+V y guardarlo todo en un archivo para volver mañana.",
              )}
            </p>
          </div>
        )}
      </div>

      {editing && (
        <div className="modal-overlay" {...propsDeVelo(bajoEnVelo, () => setEditing(null))}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{t("Qué pasa por esta flecha")}</h3>
            <p className="modal-text">
              {editing.data?.nota
                ? t(
                    "Esta flecha sale de una nota. Al conectarla ya le escribió sus tareas al agente; púlsalo de nuevo cuando añadas más.",
                  )
                : t(
                    "Cuando el agente de origen termine su turno, Adeorq le entrega al de destino este encargo junto con su última respuesta.",
                  )}
            </p>
            {!!editing.data?.nota && (
              <div className="modal-actions canvas-note-again">
                <button
                  className="mini"
                  onClick={() => {
                    void pasarNota(String(editing.data?.nota), Number(editing.target));
                    setEditing(null);
                  }}
                >
                  {t("Pasarle la nota otra vez")}
                </button>
              </div>
            )}
            <textarea
              className="mission-text"
              rows={3}
              autoFocus
              placeholder={t("Ej.: revisa este resultado y escribe los tests que falten")}
              value={brief}
              onChange={(e) => setBrief(e.currentTarget.value)}
            />
            <label className="role-chip canvas-auto">
              <input type="checkbox" checked={!!editing.data?.auto} onChange={toggleAuto} />
              {t("Enviar solo, sin preguntarme")}
            </label>
            <div className="modal-actions">
              <button
                className="mini modal-cancel"
                onClick={() => {
                  setEdges((prev) => prev.filter((e) => e.id !== editing.id));
                  setEditing(null);
                }}
              >
                {t("Quitar la flecha")}
              </button>
              <button className="np-btn" onClick={saveBrief}>
                {t("Guardar")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Importar no es solo pintar: una terminal guardada vuelve a abrirse, y
          eso arranca procesos de verdad. Por eso se cuenta lo que trae el
          archivo y se pregunta, en vez de abrir cinco Claudes de golpe. */}
      {entrante && (
        <div className="modal-overlay" {...propsDeVelo(bajoEnVelo, () => setEntrante(null))}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{t("Abrir este lienzo")}</h3>
            <ul className="canvas-import">
              {(() => {
                const r = resumen(entrante);
                const filas: Array<[string, number]> = [
                  [t("terminales"), r.terminales],
                  [t("cacharros"), r.widgets],
                  [t("capturas"), r.capturas],
                  [t("notas"), r.notas],
                  [t("ventanas de localhost"), r.webs],
                  [t("trazos de dibujo"), r.trazos],
                ];
                return filas
                  .filter(([, n]) => n > 0)
                  .map(([nombre, n]) => (
                    <li key={nombre}>
                      <b>{n}</b> {nombre}
                    </li>
                  ));
              })()}
            </ul>
            <p className="modal-text">
              {t(
                "Se suma a lo que ya tienes en el lienzo, no lo reemplaza. Las terminales guardadas son sesiones NUEVAS en la misma carpeta: lo que hablaste con ellas no vuelve.",
              )}
            </p>
            <div className="modal-actions">
              <button className="mini modal-cancel" onClick={() => setEntrante(null)}>
                {t("Cancelar")}
              </button>
              <button className="mini" onClick={() => void aplicarImport(entrante, false)}>
                {t("Solo el dibujo y las piezas")}
              </button>
              <button className="np-btn" onClick={() => void aplicarImport(entrante, true)}>
                {t("Todo, abre las terminales")}
              </button>
            </div>
          </div>
        </div>
      )}

      {(relays.length > 0 || note) && (
        <div className="relay-bar">
          {note && <span className="relay-note">{note}</span>}
          {relays.map((r) => (
            <span key={r.edgeId} className={r.espera ? "relay relay-parado" : "relay"}>
              <span className="relay-text">
                {r.espera ?? `«${r.fromName}» ${t("terminó")} → «${r.toName}»`}
              </span>
              <button className="np-btn relay-btn" onClick={() => void runRelay(r, true)}>
                {t("Pasar el relevo")}
              </button>
              <button className="mini" data-tip={t("Escribirlo sin enviar")} onClick={() => void runRelay(r, false)}>
                <PencilIcon size={13} />
              </button>
              <button
                className="mini"
                data-tip={t("Descartar")}
                onClick={() => setRelays((prev) => prev.filter((x) => x.edgeId !== r.edgeId))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** The provider has to sit above the board for useReactFlow to work. */
export default function CanvasView(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
