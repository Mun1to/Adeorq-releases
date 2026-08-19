import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  EMPTY_UI_STATE,
  deleteSession,
  findAgy,
  detectClis,
  forgetProjectIcons,
  listProjects,
  loadUiState,
  openInAntigravity,
  projectDirty,
  deleteProject,
  projectIcons,
  readEncargos,
  renameSession,
  saveUiState,
  scanSessions,
  type Account,
  type DirtyReport,
  type Encargo,
  type Project,
  type RailMode,
  type SessionInfo,
  type UiState,
} from "../lib/pty";
import { anadirProyecto, raiz, sinRaiz } from "../lib/perfil";
import {
  alternarFijada,
  colocarSuelta,
  conOrdenManual,
  desplazamiento,
  huecoEn,
  leerMarcaDeColocar,
  marcaDeColocar,
  fijadasDe,
  ladoDeCaida,
  moverGrupo,
  moverProyecto,
  sinFijadas,
  zonaDeFila,
  ordenarProyectos,
  type Lado,
} from "../lib/ordenBarra";
import { levantar, type Fantasma } from "../lib/fantasma";
import { saleEnLaBarra } from "../lib/enLaBarra";
import UpdateBar from "./UpdateBar";
import { hueOf } from "../lib/colors";
import { sessionIdOf } from "../lib/comandos";
import { propsDeVelo } from "../lib/velo";
import { PROVIDERS, providerOf } from "../lib/providers";
import { ATAJOS_PROV_EVENTO, leerAtajosProv } from "../lib/atajosProveedor";
import { useT } from "../lib/i18n";
import { encaja } from "../lib/buscar";
import { useMenu } from "./Overlays";
import ProjectAvatar, { initials } from "./ProjectAvatar";
import ProviderMark, { tieneMarca } from "./ProviderMark";
import FilaBotones from "./FilaBotones";
import { ClaudeMark } from "./KindIcon";
import {
  ArchiveIcon,
  ChevronIcon,
  CloseIcon,
  EnterIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  GridIcon,
  GroupIcon,
  ImageIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  RefreshIcon,
  RobotIcon,
  RowsIcon,
  StripIcon,
  TerminalIcon,
  TrashIcon,
  UnlinkIcon,
} from "./Icons";

interface Props {
  width: number;
  refreshKey: number;
  focusReq: { name: string; sesion?: string; n: number } | null;
  /** Conversaciones traídas desde el ＋: se apuntan aquí y salen en la lista,
      tengan la edad que tengan. No abren nada; abrirlas es un clic tuyo. */
  traerReq: { ids: string[]; n: number } | null;
  /** Extra accounts (META 6): each one can open its own session per project. */
  accounts: Account[];
  /** The ＋ of the rail: the two-step wizard, without leaving the cockpit. */
  onNewSession: () => void;
  onOpenTerminal: (name: string, cwd: string) => void;
  onOpenClaude: (name: string, cwd: string) => void;
  onOpenAgy: (name: string, cwd: string, prompt?: string) => void;
  /** Any other agent CLI that turns out to be installed (Codex, Gemini…). */
  onOpenProvider: (provider: string, name: string, cwd: string) => void;
  onOpenAccount: (account: Account, name: string, cwd: string) => void;
  onResume: (session: SessionInfo) => void;
  /** `grupo` marca las terminales que nacen de ahí, para poder tratar ese
      grupo como un espacio de trabajo y apartar los demás. */
  onOpenAll: (name: string, cwd: string, sessions: SessionInfo[], grupo?: string) => void;
  /** Cuántas abre de verdad ese botón. Lo manda App porque es un ajuste (2 a 20
      en Ajustes › Terminales) y aquí había una constante 12 escrita a mano: el
      globo prometía doce y con el ajuste subido se abrían veinte. */
  topeAbrirTodas: number;
  /** Las terminales abiertas ahora, para las que no tienen historial que
      escanear. Las manda App, que es quien las tiene. */
  abiertas: Abierta[];
  /** Llevarte a una terminal viva, cambiando de vista si hace falta. */
  onFocusPane: (paneId: number, enLienzo: boolean) => void;
  /** Los grupos apartados: su lista se pliega aquí Y sus terminales salen del
      mosaico de la Cabina, sin cerrarse. Lo lleva App porque es lo mismo que
      mira la barra de la cuadrilla. */
  gruposOcultos: Set<string>;
  onPlegarGrupo: (groupId: string) => void;
  /** Cómo se está dibujando la barra. Lo necesita fuera el tirador de
      ensanchar: en la tira no hay ancho que elegir, así que se quita. */
  onRail?: (mode: RailMode) => void;
}

/**
 * Una terminal ABIERTA ahora mismo que no tiene transcript que listar.
 *
 * La barra lateral enseña sesiones de Claude, o sea conversaciones a las que
 * puedes volver, y las lee de `~/.claude/projects`. Una PowerShell no escribe
 * nada ahí, así que abrir una sesión suelta de terminal no aparecía en ningún
 * sitio de la barra y parecía que se hubiera perdido (Munir, 2026-07-30).
 *
 * Van en el cajón de las sueltas, marcadas como abiertas, y desaparecen al
 * cerrarlas: no es historial, es lo que hay vivo. Por eso se dice en la propia
 * fila, para no prometer que se puede volver a algo que no deja rastro.
 */
export interface Abierta {
  paneId: number;
  name: string;
  cwd: string;
  /** Con qué nació. De aquí sale su id de sesión, que es lo que permite no
      pintarla dos veces cuando su transcript ya está en la lista. */
  command?: string[];
  /** Un CLI de agente, frente a una consola pelada. */
  agente: boolean;
  /** En qué vista vive, para saber a dónde llevarte al pulsarla. */
  enLienzo: boolean;
  /** Cómo se llama la cuenta con la que nació, si no es la de siempre. Lo
      guarda el propio panel desde que se abre, así que se sabe antes de que
      la conversación haya escrito una sola línea. */
  cuenta?: string;
}

interface Group {
  name: string;
  path: string;
  hasGit: boolean;
  sessions: SessionInfo[];
  archivedSessions: SessionInfo[];
  hasLive: boolean;
  waiting: number;
  minHours: number;
  /** Las sueltas: sesiones que no viven en ningún proyecto de C:\proyectos.
      No es un proyecto, así que no tiene una carpeta suya y los botones de
      «abre algo AQUÍ» no le valen: cada sesión trae la suya. */
  suelto?: boolean;
  /** Terminales vivas sin historial, solo en el cajón de las sueltas. */
  vivas?: Abierta[];
}

interface MenuState {
  s: SessionInfo;
  projectPath: string;
  x: number;
  y: number;
  mode: "main" | "group";
}

interface ConfirmState {
  s: SessionInfo;
  dirty: DirtyReport | null;
}

/** The panel a logo opens on hover: which project, and where to draw it. */
interface FlyoutState {
  name: string;
  top: number;
  left: number;
  /** The logo's own side, so the unfolded row starts with a photo that size. */
  size: number;
  /** Clicked open: it then survives the mouse leaving, like a menu. */
  pinned: boolean;
}

/** Los colores que puede llevar un grupo. Los mismos que reparte el Capataz a
    sus cuadrillas, para que un grupo hecho a mano y uno nacido de un reparto
    hablen el mismo idioma de colores. */
const COLORES_GRUPO = ["#5fd0ff", "#6fe0bb", "#ffd166", "#c4b5fd", "#ff9f6b", "#ff8fa3"];

/** El nombre con el que Rust agrupa a las que no son de ningún proyecto. Ya no
    se pinta como un cajón, pero sigue siendo la llave de ese saco. */
const SUELTAS = "Sueltas";

/**
 * El grupo de mentira con el que se pintan las filas de la sección «Fijadas».
 *
 * `sessionRow` pide un grupo porque las filas normales lo necesitan (para
 * archivar en su carpeta, para saber si enseñar la ruta), y las fijadas no
 * tienen uno: cada una viene del suyo. Va con `suelto: true` para que cada fila
 * enseñe su carpeta debajo, que es exactamente lo que hace falta cuando una
 * sesión está fuera de su sitio, y con la ruta vacía porque esta sección no ES
 * ninguna carpeta y nada puede dar a entender que se trabaja dentro de ella.
 */
const GRUPO_FIJADAS: Group = {
  name: "Fijadas",
  path: "",
  hasGit: false,
  sessions: [],
  archivedSessions: [],
  hasLive: false,
  waiting: 0,
  minHours: Infinity,
  suelto: true,
};
/** La última carpeta de una ruta, que es como se reconoce de un vistazo. */
const carpetaDe = (ruta: string) => ruta.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || ruta;
/** Lo que ocupa la tira. Da para un logo de 44 y sus dos márgenes, que es el
    mínimo en el que una foto de proyecto todavía se reconoce de un vistazo. */
const TIRA_W = 64;
const SCAN_EVERY_MS = 45_000;
// Hovering a logo opens its sessions, but only if you meant it: the delay in
// lets the mouse cross the rail without firing thirty panels, and the delay
// out lets it cross the gap into the panel it just opened. Both were half this
// and both were wrong: passing over a logo on the way stole the panel, and a
// hand that hesitates for a fifth of a second lost it. Munir, 2026-07-26.
const FLYOUT_IN_MS = 170;
/** Below this the panel would show a header and nothing else, so it climbs. */
const MIN_FLYOUT_PX = 260;
const FLYOUT_OUT_MS = 420;
/** Beyond this many extra accounts the row would not fit: the rest stay in the
    right-click menu, which lists every one of them. */
const MAX_ACCOUNT_BUTTONS = 4;
/** Hand-picked logos are stored, not linked, so they survive a moved file. */
const AVATAR_PX = 64;
// Claude has its own ✦ button and agy its own AG; the rest share one lookup.
const OTHER_CLIS = PROVIDERS.filter((p) => p.id !== "claude" && p.id !== "agy");

/** Any image the user picks becomes a small centred PNG we keep ourselves. */
function shrinkToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No he podido leer ese archivo"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Ese archivo no es una imagen que pueda mostrar"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_PX;
        canvas.height = AVATAR_PX;
        const ctx = canvas.getContext("2d");
        if (!ctx || !img.width || !img.height) {
          reject(new Error("Esa imagen viene vacía"));
          return;
        }
        // Contain, not cover: a wide wordmark must stay readable, not cropped.
        const scale = Math.min(AVATAR_PX / img.width, AVATAR_PX / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (AVATAR_PX - w) / 2, (AVATAR_PX - h) / 2, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function stateDotClass(s: SessionInfo): string {
  if (s.live) return "dot-live";
  if (s.state === "pregunta" || s.state === "ofrece") return "dot-ask";
  if (s.state === "a_medias") return "dot-half";
  return "dot-idle";
}

/** Sessions holding a question get the amber/red treatment of the desktop app. */
function waitKind(s: SessionInfo): "ask" | "offer" | null {
  if (s.state === "pregunta") return "ask";
  if (s.state === "ofrece") return "offer";
  return null;
}

export default function Sidebar({
  width,
  refreshKey,
  focusReq,
  traerReq,
  accounts,
  onNewSession,
  onOpenTerminal,
  onOpenClaude,
  onOpenAgy,
  onOpenProvider,
  onOpenAccount,
  onResume,
  onOpenAll,
  topeAbrirTodas,
  abiertas,
  onFocusPane,
  gruposOcultos,
  onPlegarGrupo,
  onRail,
}: Props) {
  const { t } = useT();
  const showMenu = useMenu();
  const [agy, setAgy] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ui, setUi] = useState<UiState>(EMPTY_UI_STATE);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  /** The session the bin is pointing at, waiting for a yes. */
  const [binning, setBinning] = useState<SessionInfo | null>(null);
  /** El proyecto cuya CARPETA estás a punto de borrar del disco, esperando tu
      OK. Es la acción rara: la de todos los días es «Quitar de Adeorq», que
      solo lo saca de esta lista (ver `ui.hiddenProjects`). */
  const [tirando, setTirando] = useState<Group | null>(null);
  /** El cajón de los proyectos que quitaste, desplegado o no. */
  const [verOcultos, setVerOcultos] = useState(false);
  /**
   * Enseñar también las de más de una semana.
   *
   * La barra corta por edad para que no crezca sin fin, y hasta ahora ese corte
   * era mudo: una conversación de hace ocho días simplemente no estaba, sin que
   * nada dijera que existía. No se guarda a propósito: es una mirada al pasado,
   * no un ajuste, y al abrir Adeorq lo que quieres ver es lo de ahora.
   */
  const [verViejas, setVerViejas] = useState(false);
  /** Lo tecleado en la casilla de confirmación: hay que escribir el nombre del
      proyecto para que el botón se encienda, como al borrar un repo en GitHub.
      El 31-jul-2026 se fueron 17 carpetas a la papelera en veinte minutos con
      solo un clic de por medio, y nadie se acordaba de haberlo hecho. */
  const [tirandoTexto, setTirandoTexto] = useState("");
  /** Qué botones de «abrir aquí» quiere ver, elegidos en Cuentas. */
  const [atajosProv, setAtajosProv] = useState<string[]>(() => leerAtajosProv());
  const [showArchived, setShowArchived] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [found, setFound] = useState<Record<string, string>>({});
  const [clis, setClis] = useState<string[]>([]);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [flyout, setFlyout] = useState<FlyoutState | null>(null);
  /** Renaming what a project is CALLED here; the folder is never touched. */
  const [naming, setNaming] = useState<{ name: string; value: string } | null>(null);
  /** El grupo al que se le está cambiando el nombre. */
  const [gnaming, setGnaming] = useState<{ id: string; value: string } | null>(null);
  /** El grupo con la ficha de edición abierta (nombre, color, disolver). */
  const [editandoGrupo, setEditandoGrupo] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  /** Ver lib/velo.ts: distingue pinchar el velo de soltar ahí un arrastre que
      empezó dentro del diálogo, que es lo que cerraba sin querer. */
  const bajoEnVelo = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const flyTimer = useRef(0);
  const flyRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  /** La lista que se desplaza sola cuando arrastras cerca de un borde. */
  const listaRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  const refresh = () => {
    listProjects().then(setProjects).catch((e) => setError(String(e)));
    scanSessions()
      .then((list) => {
        setSessions(list);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    refresh();
    // Y lo que se haya tocado mientras tanto se reaplica encima, en orden. Ver
    // `mutate`: es lo que impide que el primer segundo borre la organización
    // entera de la barra.
    const llegar = (guardado: UiState) => {
      const encolado = pendientes.current;
      pendientes.current = [];
      cargado.current = true;
      const final = encolado.reduce((acc, f) => f(acc), guardado);
      setUi(final);
      if (encolado.length) void saveUiState(final).catch(() => {});
    };
    loadUiState()
      .then(llegar)
      // Sin archivo (primer arranque) el estado vacío ES el bueno, y a partir
      // de ahí sí se puede escribir.
      .catch(() => llegar(EMPTY_UI_STATE));
    findAgy().then(setAgy).catch(() => {});
    // Whichever other agent CLIs exist get their own entry per project.
    detectClis(OTHER_CLIS.map((p) => [p.id, p.exe] as [string, string]))
      .then((list) => setClis(list.map((c) => c.id)))
      .catch(() => {});
    const timer = setInterval(() => {
      scanSessions().then(setSessions).catch(() => {});
    }, SCAN_EVERY_MS);
    return () => clearInterval(timer);
  }, [refreshKey]);

  // Logos are read from disk once per project and kept in Rust: this fires on
  // every project list change, but a hit costs nothing.
  useEffect(() => {
    if (!projects.length) return;
    projectIcons(projects.map((p) => p.path))
      .then(setFound)
      .catch(() => {});
  }, [projects]);

  // Lo que trae el ＋: se apunta en el estado de la barra y se reescanea sin
  // esperar al reloj de los 45 s, que era justo lo que hacía parecer que traer
  // una conversación no la añadía a ningún sitio.
  useEffect(() => {
    if (!traerReq?.ids.length) return;
    mutate((prev) => ({
      ...prev,
      traidas: [...new Set([...prev.traidas, ...traerReq.ids])],
    }));
    refresh();
  }, [traerReq]);

  useEffect(() => {
    if (!focusReq) return;
    // Si se pide por una sesión, manda dónde la tengas TÚ puesta: arrastrar una
    // sesión a otro proyecto cambia su sitio aquí y no en el escaneo, así que
    // el nombre que llega de fuera puede señalar a la fila equivocada.
    const donde =
      (focusReq.sesion ? ui.sessionProject[focusReq.sesion] : "") || focusReq.name;
    if (!donde) return;
    // Si lo habías quitado de la barra y vuelves a abrir algo suyo, vuelve.
    // Lo otro sería abrir una terminal y no verla en ningún lado, que es el
    // fallo que esto venía a arreglar.
    if (ocultos.has(donde)) devolverProyecto(donde);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(donde);
      return next;
    });
  }, [focusReq]);

  useEffect(() => {
    renameRef.current?.select();
  }, [renaming?.id]);

  // Any click outside the popover closes it (capture: before other handlers).
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.(".sess-menu")) setMenu(null);
    };
    window.addEventListener("mousedown", close, true);
    return () => window.removeEventListener("mousedown", close, true);
  }, [menu]);

  // A pinned flyout behaves like a menu: Escape or a click outside close it.
  useEffect(() => {
    if (!flyout?.pinned) return;
    const close = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest?.(".rail-flyout") && !el.closest?.(".project-logo")) {
        setFlyout(null);
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFlyout(null);
    };
    window.addEventListener("mousedown", close, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", close, true);
      window.removeEventListener("keydown", key);
    };
  }, [flyout?.pinned]);

  useEffect(() => () => window.clearTimeout(flyTimer.current), []);

  // A project near the bottom would hang its panel off the screen. Measured
  // after painting (the height depends on how many sessions it has) and pulled
  // up by exactly what it overflows, which is cheaper than guessing.
  useLayoutEffect(() => {
    const el = flyRef.current;
    if (!el || !flyout) return;
    // The panel must START where the logo starts, or the photo in its header
    // stops lining up with the card underneath and the whole illusion breaks.
    // So the height gives way, not the position: it takes the room below the
    // logo and its list scrolls. Only when there is not even room for the
    // header and a session or two does it climb.
    const below = window.innerHeight - 10 - flyout.top;
    if (below >= MIN_FLYOUT_PX) {
      el.style.top = `${flyout.top}px`;
      el.style.maxHeight = `${below}px`;
    } else {
      el.style.maxHeight = `${MIN_FLYOUT_PX}px`;
      el.style.top = `${Math.max(10, window.innerHeight - 10 - MIN_FLYOUT_PX)}px`;
    }
    const side = window.innerWidth - 10 - el.offsetWidth;
    el.style.left = `${Math.max(4, Math.min(flyout.left, side))}px`;
    // No dependency list on purpose: every render writes the anchor position
    // back into the style, so the correction has to run again or the panel
    // jumps the next time the scanner brings in a session.
  });

  // The panel has to live OUTSIDE the sidebar. The sidebar is frosted glass
  // (backdrop-filter), and that gives it a layer of its own: anything inside
  // it, at any z-index, still ends up under the cockpit next door. It rendered
  // fine and then the mouse, crossing over, touched the cockpit instead of the
  // panel and the panel closed. Hoisted to .app so it keeps the streaming
  // rules that hide session titles, which document.body would have lost.
  useEffect(() => {
    setHost(asideRef.current?.parentElement ?? document.body);
  }, []);

  // Cuentas avisa por aquí al cambiar la lista: así los botones aparecen en el
  // momento, sin reiniciar ni salir y volver a entrar en la pestaña.
  useEffect(() => {
    const al = () => setAtajosProv(leerAtajosProv());
    window.addEventListener(ATAJOS_PROV_EVENTO, al);
    return () => window.removeEventListener(ATAJOS_PROV_EVENTO, al);
  }, []);

  // Para qué se abrió cada sesión, si la abrió el Capataz. Se relee cuando el
  // escáner trae sesiones nuevas: una recién desplegada tiene que traer su
  // encargo puesto, no en el siguiente arranque.
  const [encargos, setEncargos] = useState<Record<string, Encargo>>({});
  useEffect(() => {
    void readEncargos()
      .then(setEncargos)
      .catch(() => {});
  }, [sessions.length]);

  /**
   * El porqué de una sesión, para el globo de ayuda.
   *
   * El título lo escribe Claude resumiendo la conversación, y eso NO es para
   * qué la abriste: por eso siete sesiones de un mismo despliegue salen con
   * siete nombres parecidos y ninguno dice cuál hacía qué. Esto es lo que se
   * le mandó, tal cual, el día que se desplegó.
   */
  const porQue = (id: string): string => {
    const e = encargos[id];
    if (!e?.encargo) return "";
    const cabecera = e.objetivo
      ? `\n\n⚑ ${e.objetivo}${e.rol ? ` · ${e.rol}` : ""}`
      : "\n\n⚑ Encargo del Capataz";
    // Cortado, que un cometido puede ser un párrafo entero y un globo de ayuda
    // de veinte líneas tapa justo la lista que estás intentando leer.
    const texto = e.encargo.length > 220 ? `${e.encargo.slice(0, 220)}…` : e.encargo;
    return `${cabecera}\n${texto}`;
  };

  /**
   * Cambiar el estado de la barra y guardarlo.
   *
   * ⚠ No se escribe NADA hasta haber leído el archivo. El estado arranca vacío
   * y `loadUiState()` llega un momento después, así que cualquier cambio hecho
   * en ese primer instante (traer una sesión, renombrar, arrastrar) guardaba el
   * estado VACÍO con ese cambio dentro y se llevaba por delante los grupos, los
   * alias, los logos y los archivados. Un segundo de ventana, todo el trabajo
   * de organizar la barra.
   *
   * Lo que se hace en esa ventana no se pierde: se apunta la operación y se
   * vuelve a aplicar SOBRE lo que llegue del disco, que es lo que la hace
   * inofensiva. En pantalla se ve al instante igual que siempre.
   */
  const cargado = useRef(false);
  const pendientes = useRef<Array<(prev: UiState) => UiState>>([]);

  const mutate = (fn: (prev: UiState) => UiState) => {
    if (!cargado.current) pendientes.current.push(fn);
    setUi((prev) => {
      const next = fn(prev);
      if (cargado.current) void saveUiState(next).catch((e) => setError(String(e)));
      return next;
    });
  };

  const archived = useMemo(() => new Set(ui.archived), [ui.archived]);
  const traidas = useMemo(() => new Set(ui.traidas), [ui.traidas]);
  /* Los proyectos que quitaste de la barra. Ojo con el nombre: `gruposOcultos`,
     que llega por props, es otra cosa (los grupos de sesiones plegados). */
  const ocultos = useMemo(() => new Set(ui.hiddenProjects), [ui.hiddenProjects]);

  const todo = useMemo<{
    proyectos: Group[];
    sueltas: Group | null;
    fijadas: SessionInfo[];
  }>(() => {
    /** Las conversaciones que tienes AHORA en un panel. Lo dice el propio
        comando del panel, que lleva su `--resume <id>` dentro. */
    const enPantalla = new Set(
      abiertas.map((a) => sessionIdOf(a.command)).filter((x): x is string => !!x),
    );
    // Las de más de una semana no se enseñan... salvo que las tengas abiertas o
    // que las hayas traído tú desde el ＋. La regla entera, con su porqué, en
    // `lib/enLaBarra.ts`: la comparte el asistente del ＋, que es quien decide
    // cuáles te FALTAN, y tenerla escrita dos veces era justo el fallo (ofrecía
    // traer las que ya estaban aquí, una y otra vez).
    const fresh = sessions.filter((s) =>
      saleEnLaBarra(s, { enPantalla, traidas, verViejas }),
    );
    const byProject = new Map<string, SessionInfo[]>();
    for (const s of fresh) {
      // Donde tú la mandaste gana a donde la puso su carpeta: si arrastraste
      // una suelta a un proyecto, ahí es donde vive a partir de entonces.
      const donde = ui.sessionProject[s.id] ?? s.project;
      const list = byProject.get(donde) ?? [];
      list.push(s);
      byProject.set(donde, list);
    }

    // Las que de verdad han quedado listadas, no todas las escaneadas: una que
    // se haya quedado fuera por vieja tiene que poder salir al menos como
    // terminal abierta, en vez de no salir en ningún sitio.
    const yaListadas = new Set(fresh.map((s) => s.id));

    /* Las terminales que tienes ABIERTAS y todavía no han escrito nada.
     *
     * Una conversación no existe en el disco hasta el primer mensaje, así que
     * abrir una terminal y no verla en ningún sitio de la barra es
     * indistinguible de que no se haya abierto. Le pasó a Munir el 2026-08-06
     * con una cuenta nueva: abrió dos, no salió ninguna, y la única fila
     * parecida que veía era de la otra cuenta.
     *
     * Van a SU proyecto, y el proyecto se decide por la RUTA y no por el
     * nombre de la carpeta: dos carpetas que se llamen igual en sitios
     * distintos son dos proyectos distintos, y casar por nombre las mezcla. */
    const norma = (p: string) => p.toLowerCase().replace(/[\\/]+$/, "").replace(/\//g, "\\");
    const vivasDe = new Map<string, Abierta[]>();
    const vivasSueltas: Abierta[] = [];
    for (const a of abiertas) {
      // Con transcript ya listado tiene su propia fila; pintarla otra vez la
      // duplicaría. El id sale del comando, y vale igual para una sesión
      // retomada (`--resume`) que para una recién acuñada (`--session-id`).
      const sid = sessionIdOf(a.command);
      if (sid && yaListadas.has(sid)) continue;
      const cwd = norma(a.cwd);
      const dueño = projects.find((p) => {
        const r = norma(p.path);
        return !!r && (cwd === r || cwd.startsWith(`${r}\\`));
      });
      // La carpeta madre NO es un proyecto: lo abierto ahí va suelto, igual
      // que sus conversaciones (ver abajo).
      if (!dueño) vivasSueltas.push(a);
      else vivasDe.set(dueño.name, [...(vivasDe.get(dueño.name) ?? []), a]);
    }

    const build = (name: string, path: string, hasGit: boolean, all: SessionInfo[]): Group => {
      const active = all.filter((s) => !archived.has(s.id));
      // Lo fijado se ve arriba, en su propia sección, así que sale de la LISTA
      // del proyecto: una sesión en dos sitios a la vez es una sesión que
      // parece dos.
      //
      // Pero solo de la lista. Las insignias del proyecto (que algo está vivo,
      // que algo te espera, cuánto hace del último movimiento) se siguen
      // calculando con TODAS las suyas: si no, fijar una sesión apagaría el
      // aviso de su proyecto y ese proyecto pasaría a mentir sobre lo que
      // tiene dentro.
      const vivas = vivasDe.get(name) ?? [];
      return {
        name,
        path,
        hasGit,
        sessions: sinFijadas(active, ui.pinned),
        archivedSessions: all.filter((s) => archived.has(s.id)),
        hasLive: active.some((s) => s.live) || vivas.length > 0,
        waiting: active.filter((s) => s.state === "pregunta" || s.state === "ofrece")
          .length,
        minHours: active.length ? Math.min(...active.map((s) => s.hours)) : Infinity,
        vivas,
      };
    };

    const result: Group[] = projects.map((p) => {
      const list = byProject.get(p.name) ?? [];
      byProject.delete(p.name);
      return build(p.name, p.path, p.hasGit, list);
    });

    /* La carpeta madre ya no es una fila de la barra.
     *
     * `C:\proyectos` salía como un proyecto más, con su logo y su nombre, y
     * dentro caía TODO lo que se hubiera abierto ahí sin entrar en ninguna
     * carpeta: veintitrés conversaciones sin nada que ver entre ellas metidas
     * en un cajón que no es un proyecto de nada (Munir, 2026-08-06: «me
     * gustaría que estuviesen literalmente sueltas»). Ahora bajan al «sin
     * proyecto» del final, que es donde vive lo que no pertenece a ningún
     * sitio, cada una enseñando su carpeta. Las que él haya metido a mano en
     * un proyecto siguen ahí: eso lo decide `ui.sessionProject`, más arriba. */

    // Y lo que queda: todo lo que se abrió FUERA de la carpeta de proyectos.
    // Hasta ahora
    // se escaneaba y luego se tiraba en silencio, porque el mapa solo se leía
    // para los proyectos conocidos y para la raíz: una sesión abierta en tu
    // carpeta de usuario existía en el disco y no salía por ningún lado
    // (Munir, 2026-07-29). Van todas juntas en un cajón, como la lista de
    // chats de la app de escritorio: cada una recuerda su carpeta, así que
    // retomarlas funciona igual que las de un proyecto.

    // Lo que sobra son las sesiones sueltas, y ya no van en un cajón que las
    // envuelva: un cajón llamado «Sueltas» es una carpeta que no existe en
    // ningún disco, y para entrar en ella había que plegarla y desplegarla como
    // si fuera un proyecto más. Ahora cuelgan al final de la barra, cada una
    // enseñando SU carpeta, y se meten en un proyecto o en un grupo cuando tú
    // lo digas (Munir, 2026-08-02). El Group sigue existiendo como saco para
    // pintarlas, pero no entra en la lista de proyectos.
    const sesionesSueltas = [...byProject.values()].flat();
    let sueltas: Group | null = null;
    if (sesionesSueltas.length || vivasSueltas.length) {
      sueltas = build(SUELTAS, "", false, sesionesSueltas);
      // Y el orden que les diste a mano, si diste alguno. Va DESPUÉS de
      // `build` porque `build` es quien las filtra (archivadas, fijadas) y
      // ordenar antes de filtrar habría dejado huecos en tu orden.
      sueltas.sessions = conOrdenManual(sueltas.sessions, ui.ordenLista.sueltas ?? []);
      sueltas.suelto = true;
      sueltas.vivas = vivasSueltas;
      if (vivasSueltas.length) sueltas.hasLive = true;
    }

    // Las fijadas se recogen de la lista ENTERA y no grupo a grupo, porque su
    // orden es uno solo para toda la barra: el de `ui.pinned`. Recogerlas por
    // proyecto y juntarlas después habría dado el orden de los proyectos, no el
    // que les diste tú.
    const fijadas = fijadasDe(sessions, ui.pinned);

    // El orden, con sus reglas y sus casos, en `lib/ordenBarra.ts`.
    return { proyectos: ordenarProyectos(result, ui.projectOrder), sueltas, fijadas };
  }, [
    projects,
    sessions,
    archived,
    traidas,
    abiertas,
    ui.sessionProject,
    ui.projectOrder,
    ui.pinned,
    // Sin esto la barra no se rehace al colocar una suelta a mano: el orden se
    // guardaba bien en disco pero React no tenía por qué volver a pintar, así
    // que la sesión saltaba a su sitio de antes y parecía que el arrastre no
    // había servido de nada (Munir, 2026-08-09: «no se quedan donde las
    // mueves»). Cada lista de orden que se lea aquí dentro tiene que estar en
    // esta lista de abajo, o miente.
    ui.ordenLista,
    verViejas,
  ]);

  /** Cuántas hay escondidas por edad, para que el botón diga un número y no
      «cargar más» a ciegas. Si son cero, el botón no existe. */
  const viejasOcultas = useMemo(
    () => (verViejas ? 0 : sessions.filter((s) => s.fresh === "muerta").length),
    [sessions, verViejas],
  );

  /* Los que quitaste de la barra salen de la lista aquí, y no dentro del memo
     de arriba, para que sus sesiones se vayan con ellos en vez de caer al
     cajón de las sueltas: quitar un proyecto es dejar de verlo entero, no
     desperdigarlo. Se quedan aparte, enteros, para el cajón «Ocultos». */
  const groups = useMemo(
    () => todo.proyectos.filter((g) => !ocultos.has(g.name)),
    [todo.proyectos, ocultos],
  );

  const proyectosOcultos = useMemo(
    () => todo.proyectos.filter((g) => ocultos.has(g.name)),
    [todo.proyectos, ocultos],
  );

  /* El filtro compara con `encaja` (ver lib/buscar.ts) y no con un `includes`
     a secas, que es lo que había: así «sesion» encuentra «sesión» y dos
     palabras sueltas encuentran una frase que las tiene en otro orden. Y busca
     también por CARPETA en los proyectos, no solo en las sueltas: eso era una
     diferencia sin motivo entre dos listas de la misma barra. */
  const shown = useMemo(() => {
    if (!filter.trim()) return groups;
    return groups.filter(
      (g) =>
        encaja(`${g.name} ${g.path}`, filter) ||
        g.sessions.some((s) => encaja(s.title, filter)),
    );
  }, [groups, filter]);

  /** Cuántos proyectos se está tragando el filtro, para poder decirlo. */
  const ocultosPorFiltro = groups.length - shown.length;

  /** Las sueltas que pasan el filtro de búsqueda. Con el filtro puesto, una
      suelta que no case desaparece igual que un proyecto que no case. */
  const sueltas = useMemo(() => {
    const g = todo.sueltas;
    if (!g) return null;
    if (!filter.trim()) return g;
    const sessions = g.sessions.filter((s) => encaja(`${s.title} ${s.cwd}`, filter));
    const vivas = (g.vivas ?? []).filter((a) => encaja(`${a.name} ${a.cwd}`, filter));
    if (!sessions.length && !vivas.length) return null;
    return { ...g, sessions, vivas };
  }, [todo.sueltas, filter]);

  const archivedTotal = useMemo(
    () => groups.reduce((n, g) => n + g.archivedSessions.length, 0),
    [groups],
  );

  const rail: RailMode = ui.railMode;

  const setRail = (mode: RailMode) => {
    setFlyout(null);
    // En la tira no se ve el buscador, así que un filtro escrito antes dejaría
    // media lista fuera sin nada en pantalla que explicara por qué.
    if (mode === "tira") setFilter("");
    mutate((prev) => ({ ...prev, railMode: mode }));
  };

  // El modo se guarda en disco, así que al arrancar llega un rato después de
  // pintar: hay que avisar cuando llegue, no solo cuando se pulse un botón.
  useEffect(() => {
    onRail?.(rail);
  }, [rail, onRail]);

  /**
   * The panel starts ON the logo, not next to it: same corner, same size of
   * photo as its first piece. So hovering does not open a popup beside the
   * card, it unfolds the card itself into the whole row of his mock, photo
   * first, then the name, then the counts (Munir, 2026-07-26, third attempt:
   * the panel WAS glued to the right edge and it still read as two things).
   */
  const anchor = (name: string, el: HTMLElement, pinned: boolean): FlyoutState => {
    const r = el.getBoundingClientRect();
    return { name, top: r.top, left: r.left, size: Math.round(r.width), pinned };
  };

  const hoverLogo = (name: string, el: HTMLElement) => {
    window.clearTimeout(flyTimer.current);
    const next = anchor(name, el, false);
    flyTimer.current = window.setTimeout(() => setFlyout(next), FLYOUT_IN_MS);
  };

  const leaveLogo = () => {
    window.clearTimeout(flyTimer.current);
    flyTimer.current = window.setTimeout(
      () => setFlyout((f) => (f?.pinned ? f : null)),
      FLYOUT_OUT_MS,
    );
  };

  const keepFlyout = () => window.clearTimeout(flyTimer.current);

  const toggle = (name: string) => {
    // El clic que el navegador manda detrás de un arrastre no pliega nada.
    // `proyUp` levanta esta bandera y la baja en el turno siguiente; hasta hoy
    // la escribía sin que nadie la leyera aquí, y no se notaba porque la fila
    // no se podía agarrar por su botón. Desde que sí (`data-agarre`), sin esta
    // línea cada vez que colocaras un proyecto se plegaría o se desplegaría.
    if (soltoRecien.current) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const openMenu = (e: React.MouseEvent, s: SessionInfo, projectPath: string) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setNewGroup("");
    // `getBoundingClientRect` mide contra la VENTANA, y desde que el menú
    // cuelga del `body` eso es justo lo que hace falta. Antes vivía dentro del
    // sidebar, y un `backdrop-filter` le fija el ancla a un `position: fixed`
    // de dentro: estas coordenadas de ventana se leían como si fueran del
    // sidebar, así que el menú nacía desplazado hacia dentro de la terminal.
    // El tope de la derecha son los 200 de `min-width` más 16 de aire: sin él,
    // con el sidebar ensanchado, el menú se saldría de la pantalla.
    const x = Math.min(r.right + 4, Math.max(4, window.innerWidth - 216));
    setMenu({ s, projectPath, x, y: r.top, mode: "main" });
  };

  const startRename = (s: SessionInfo) => {
    setMenu(null);
    setRenaming({ id: s.id, value: s.title === "(sin título)" ? "" : s.title });
  };

  const commitRename = () => {
    if (!renaming) return;
    const title = renaming.value.trim();
    const s = sessions.find((x) => x.id === renaming.id);
    setRenaming(null);
    if (!title || !s || title === s.title) return;
    // Optimistic: show the new title now; the scanner re-reads it on refresh.
    setSessions((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, title } : x)),
    );
    renameSession(s.folder, s.id, title)
      .then(() => refresh())
      .catch((e) => setError(String(e)));
  };

  const askArchive = (s: SessionInfo, projectPath: string) => {
    setMenu(null);
    setConfirm({ s, dirty: null });
    projectDirty(projectPath)
      .then((d) => setConfirm((c) => (c?.s.id === s.id ? { s, dirty: d } : c)))
      .catch(() =>
        setConfirm((c) =>
          c?.s.id === s.id ? { s, dirty: { isRepo: false, files: [], total: 0 } } : c,
        ),
      );
  };

  const doArchive = (id: string) => {
    setConfirm(null);
    mutate((prev) => ({ ...prev, archived: [...prev.archived, id] }));
  };

  const unarchive = (id: string) => {
    mutate((prev) => ({ ...prev, archived: prev.archived.filter((x) => x !== id) }));
  };

  const doDelete = (s: SessionInfo) => {
    setBinning(null);
    // Gone from the list at once: the scan runs on its own clock and a row
    // that lingers after you binned it reads as "it did not work".
    setSessions((prev) => prev.filter((x) => x.id !== s.id));
    // `s.fuente` es de qué CLI es: sin ese dato, una sesión de Codex se buscaba
    // en la carpeta de Claude, no se borraba nada, y volvía a la lista en cuanto
    // el escáner releía el disco (Munir, 2026-08-08).
    deleteSession(s.folder, s.id, s.fuente)
      .then(() => refresh())
      .catch((e) => {
        setError(String(e));
        refresh();
      });
  };

  const assignGroup = (sessionId: string, groupId: string | null) => {
    setMenu(null);
    mutate((prev) => {
      const sessionGroup = { ...prev.sessionGroup };
      if (groupId) sessionGroup[sessionId] = groupId;
      else delete sessionGroup[sessionId];
      return { ...prev, sessionGroup };
    });
  };

  const createGroup = (project: string, sessionId: string) => {
    const name = newGroup.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    setMenu(null);
    setNewGroup("");
    mutate((prev) => ({
      ...prev,
      groups: [...prev.groups, { id, project, name }],
      sessionGroup: { ...prev.sessionGroup, [sessionId]: id },
    }));
  };

  /**
   * Arrastrar una sesión para agruparla, que es lo que faltaba.
   *
   * Los grupos existían desde hace tiempo, pero solo se llegaba a ellos por el
   * menú ⋯ de cada sesión, dos niveles adentro: existir sin encontrarse es no
   * existir (Munir, 2026-08-02). Ahora se arrastra la fila y se suelta encima
   * de un grupo (entra), encima de otra sesión (nace un grupo con las dos) o
   * fuera de todos (sale del suyo).
   *
   * Por punteros y no con el arrastre del navegador: el HTML5 nativo está
   * muerto dentro de esta ventana porque Tauri se queda los eventos de
   * arrastre antes de que el WebView los vea. Con umbral de movimiento, para
   * que un clic normal siga abriendo la sesión.
   */
  /**
   * El arrastre en curso. Lleva TODO lo que hace falta para resolverlo, y por
   * eso guarda también el proyecto de origen y el destino de cada momento: el
   * `pointerup` que aplica el cambio se escucha en `window` (ver abajo), y ahí
   * no hay ni evento de React ni estado fresco que consultar.
   */
  const arrastre = useRef<{
    id: string;
    x: number;
    y: number;
    activo: boolean;
    proyecto: string;
    destino: string | null;
    /**
     * En qué lista vas a soltar (`p:Adeorq`, `g:<uuid>`, `sueltas`).
     *
     * Va aquí y NO dentro de `destino`, aunque parezca un dato más de lo mismo.
     * Estuvo dentro, como `r:<lado>:<lista>:<fila>`, y al leerlo con un
     * `split(":")` de cuatro trozos la propia clave se partía por su mitad:
     * `p:Adeorq` daba lista `"p"` y fila `"Adeorq"`, así que no se encontraba
     * ninguna lista con ese nombre y soltar no hacía nada. El cajón del final se
     * salvaba de milagro, porque su clave (`sueltas`) es la única sin dos
     * puntos: por eso ahí sí funcionaba y dentro de un proyecto no.
     */
    lista: string;
  } | null>(null);
  /** Bandera de un instante: distingue el clic que abre del que acaba de
      soltar un arrastre, porque el navegador dispara los dos igual. */
  const soltoRecien = useRef(false);
  const [llevando, setLlevando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  /**
   * El hueco que se abre mientras arrastras: en qué lista, de qué puesto salió
   * la fila y en cuál caería ahora. Con eso, cada fila sabe si tiene que
   * apartarse (`desplazamiento`, en `lib/ordenBarra.ts`).
   *
   * `alto` en píxeles y no un 100 %: las filas de esta barra NO miden todas lo
   * mismo (la que enseña su carpeta debajo es más alta), así que apartarse «su
   * propio alto» dejaría huecos de distinto tamaño según por dónde pasaras.
   */
  const [hueco, setHueco] = useState<{ dy: Record<string, number>; alto: number } | null>(
    null,
  );

  const sesionDown = (e: React.PointerEvent<HTMLLIElement>, id: string, proyecto: string) => {
    if ((e.target as HTMLElement).closest(".sess-more, .sess-bin, input")) return;
    arrastre.current = {
      id,
      x: e.clientX,
      y: e.clientY,
      activo: false,
      proyecto,
      destino: null,
      lista: "",
    };
  };

  // Red de seguridad del arrastre. Si el puntero se levanta en un sitio que no
  // es la fila (fuera de la ventana, sobre otra pieza, o porque la captura se
  // perdió al repintar), `sesionUp` no llega a correr nunca: el arrastre se
  // queda vivo, la zona de destino iluminada, y a partir de ahí el resto de la
  // barra deja de responder a los clics. Pasó a la primera (Munir, 2026-08-02).
  useEffect(() => {
    // `pointerup` RESUELVE el arrastre (mueve, agrupa, coloca). Los otros dos
    // solo limpian: perder el foco o que el sistema cancele el gesto no es
    // soltar en un sitio, y no puede reordenar nada a tus espaldas.
    const soltar = (e: PointerEvent) => {
      if (!arrastre.current) return;
      // Por el ref y no directo: este efecto se registra UNA vez, así que
      // llamar a `sesionUp` desde su closure usaría para siempre el `ui` del
      // primer pintado, y el orden se guardaría encima de una foto vieja. El
      // ref se refresca en cada render, unas líneas más abajo.
      alSoltar.current(e);
    };
    const limpiar = () => {
      if (!arrastre.current) return;
      arrastre.current = null;
      soltarFantasma();
      pararAuto();
      setLlevando(null);
      setSobre(null);
      // Y el hueco, que si no se queda abierto para siempre: un espacio en
      // blanco en mitad de la lista que ya no significa nada.
      setHueco(null);
    };
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", limpiar);
    window.addEventListener("blur", limpiar);
    return () => {
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", limpiar);
      window.removeEventListener("blur", limpiar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------------------------------------- ordenar
   *
   * Arrastrar un proyecto para ponerlo donde tú quieres. El gesto es el mismo
   * que el de una sesión (por punteros, con umbral de seis píxeles, ver más
   * arriba el porqué), pero el estado va aparte para que arrastrar un proyecto
   * no encienda las zonas de destino de las sesiones.
   *
   * El orden que se guarda es el de la barra ENTERA tal y como se está viendo,
   * no solo el del que has movido: así, el primer arrastre congela lo que ya
   * tenías delante y a partir de ahí nada se mueve solo. */
  const arrProy = useRef<{ name: string; x: number; y: number; activo: boolean } | null>(null);
  const [moviendoProy, setMoviendoProy] = useState<string | null>(null);
  /**
   * Dónde va a caer, con el LADO. Antes era solo el nombre del destino y la
   * raya la pintaba el CSS siempre arriba: bajabas un proyecto, la veías sobre
   * el destino y acababa debajo (`ladoDeCaida` lo cuenta entero). Ahora el lado
   * sale del mismo cálculo que hace el movimiento, así que no pueden discrepar.
   */
  const [sobreProy, setSobreProy] = useState<{ name: string; lado: Lado } | null>(null);

  /**
   * De dónde se puede agarrar una fila.
   *
   * Antes era «de cualquier sitio que no sea un botón», y eso dejaba fuera el
   * logo, el nombre y la flecha, porque los tres viven DENTRO del botón que
   * pliega el proyecto. En la práctica solo se podía agarrar por el hueco que
   * queda a la derecha, que son unos pocos píxeles (Munir, 2026-08-08: «haz que
   * también se pueda arrastrar desde el logo»).
   *
   * Ahora el botón principal lleva `data-agarre` y sí se puede agarrar: el clic
   * no se pierde porque el arrastre no empieza hasta los seis píxeles, y el que
   * llega después de arrastrar ya venía anulado. Los demás botones de la fila
   * (las insignias, el ⋯, la papelera) siguen siendo botones y nada más.
   */
  const agarrable = (t: HTMLElement): boolean => {
    if (t.closest("input")) return false;
    const btn = t.closest("button");
    return !btn || btn.hasAttribute("data-agarre");
  };

  /**
   * La copia que va pegada al puntero mientras arrastras, sea lo que sea lo que
   * lleves. Una sola para toda la barra: no se puede arrastrar un proyecto y un
   * grupo a la vez, así que dos referencias distintas solo servirían para que
   * una se quedara sin recoger. Ver `lib/fantasma.ts`.
   */
  const fantasma = useRef<Fantasma | null>(null);

  const soltarFantasma = () => {
    fantasma.current?.soltar();
    fantasma.current = null;
  };

  const proyDown = (e: React.PointerEvent<HTMLDivElement>, name: string) => {
    if (!agarrable(e.target as HTMLElement)) return;
    arrProy.current = { name, x: e.clientX, y: e.clientY, activo: false };
  };

  const proyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = arrProy.current;
    if (!a) return;
    if (!a.activo) {
      if (Math.hypot(e.clientX - a.x, e.clientY - a.y) < 6) return;
      a.activo = true;
      setMoviendoProy(a.name);
      e.currentTarget.setPointerCapture(e.pointerId);
      // Se levanta desde donde EMPEZÓ el gesto, no desde donde está el puntero
      // al cruzar el umbral: así la fila conserva el punto por el que la
      // cogiste en vez de dar un salto de seis píxeles al arrancar.
      //
      // Y con la barra de corral: fuera de ella no se puede soltar nada, así
      // que dejar la copia salir prometía un sitio que no existe (Munir,
      // 2026-08-08: «que no se pueda mover de donde la pestaña de workspaces»).
      fantasma.current = levantar(e.currentTarget, a.x, a.y, undefined, asideRef.current);
    }
    fantasma.current?.mover(e.clientX, e.clientY);
    cercaDelBorde(e.clientX, e.clientY, a.name);
    const bajo = document.elementFromPoint(e.clientX, e.clientY);
    const destino = bajo?.closest<HTMLElement>("[data-proyecto]")?.dataset.proyecto;
    const lado = destino ? ladoDeCaida(groups.map((g) => g.name), a.name, destino) : null;
    setSobreProy(destino && lado ? { name: destino, lado } : null);
  };

  const proyUp = () => {
    const a = arrProy.current;
    const destino = sobreProy?.name;
    arrProy.current = null;
    soltarFantasma();
    pararAuto();
    setMoviendoProy(null);
    setSobreProy(null);
    if (!a?.activo) return;
    // El clic que viene detrás de un arrastre no debe plegar el proyecto.
    soltoRecien.current = true;
    window.setTimeout(() => {
      soltoRecien.current = false;
    }, 0);
    if (!destino) return;
    const orden = moverProyecto(groups.map((g) => g.name), a.name, destino);
    mutate((prev) => ({ ...prev, projectOrder: orden }));
  };

  // La misma red de seguridad que el arrastre de sesiones: un puntero que se
  // levanta fuera de la fila dejaría el proyecto pegado al ratón para siempre.
  useEffect(() => {
    const limpiar = () => {
      if (!arrProy.current) return;
      arrProy.current = null;
      soltarFantasma();
      pararAuto();
      setMoviendoProy(null);
      setSobreProy(null);
    };
    window.addEventListener("pointerup", limpiar);
    window.addEventListener("pointercancel", limpiar);
    window.addEventListener("blur", limpiar);
    return () => {
      window.removeEventListener("pointerup", limpiar);
      window.removeEventListener("pointercancel", limpiar);
      window.removeEventListener("blur", limpiar);
    };
  }, []);

  /* ------------------------------------------------- ordenar los grupos
   *
   * El mismo gesto, un puesto más adentro: los grupos de un proyecto salían en
   * el orden en que se crearon y no había forma de tocarlo. El orden ES el del
   * array `ui.groups`, así que arrastrar lo reordena y se guarda solo, sin una
   * lista de orden aparte que mantener en sitio.
   *
   * Estado propio, como el de proyectos, para que arrastrar un grupo no encienda
   * las zonas de destino de las sesiones ni las de los proyectos. */
  const arrGrupo = useRef<{ id: string; x: number; y: number; activo: boolean } | null>(null);
  const [moviendoGrupo, setMoviendoGrupo] = useState<string | null>(null);
  const [sobreGrupo, setSobreGrupo] = useState<{ id: string; lado: Lado } | null>(null);

  /** Los grupos visibles de un proyecto, que es la lista sobre la que se mueve. */
  const gruposDe = (proyecto: string) => ui.groups.filter((x) => x.project === proyecto);

  const grupoDown = (e: React.PointerEvent<HTMLLIElement>, id: string) => {
    // Un grupo se agarra por SU CABECERA. El `li` del grupo envuelve también la
    // lista de sesiones que cuelga de él, y ahí dentro cada sesión tiene su
    // propio arrastre: sin esta línea, empezar a mover una sesión movería
    // además el grupo entero.
    if (!(e.target as HTMLElement).closest(".sgroup-head")) return;
    // Su nombre y su punto de color se agarran igual que el logo de un
    // proyecto; el lápiz y el ⋯ de al lado siguen siendo botones y nada más.
    if (!agarrable(e.target as HTMLElement)) return;
    // Y que no se entere el proyecto de arriba: sin esto se arrastrarían los
    // dos a la vez y la barra entera se recolocaría al soltar un grupo.
    e.stopPropagation();
    arrGrupo.current = { id, x: e.clientX, y: e.clientY, activo: false };
  };

  const grupoMove = (e: React.PointerEvent<HTMLLIElement>, proyecto: string) => {
    const a = arrGrupo.current;
    if (!a) return;
    if (!a.activo) {
      if (Math.hypot(e.clientX - a.x, e.clientY - a.y) < 6) return;
      a.activo = true;
      setMoviendoGrupo(a.id);
      e.currentTarget.setPointerCapture(e.pointerId);
      // Se levanta SU CABECERA y no el `li` entero: ese envuelve también las
      // sesiones desplegadas, así que llevarías una columna de diez filas
      // colgando del ratón en vez del grupo.
      const cab = e.currentTarget.querySelector<HTMLElement>(".sgroup-head");
      // `--sg` se lleva a mano: vive en el `li` de arriba, y sin él una
      // cuadrilla se levantaría en gris, que es justo su seña de identidad.
      if (cab) {
        const color = e.currentTarget.style.getPropertyValue("--sg");
        fantasma.current = levantar(cab, a.x, a.y, { "--sg": color }, asideRef.current);
      }
    }
    fantasma.current?.mover(e.clientX, e.clientY);
    e.stopPropagation();
    cercaDelBorde(e.clientX, e.clientY, a.id);
    const bajo = document.elementFromPoint(e.clientX, e.clientY);
    const destino = bajo?.closest<HTMLElement>("[data-grupo-orden]")?.dataset.grupoOrden;
    const lado = destino
      ? ladoDeCaida(gruposDe(proyecto).map((x) => x.id), a.id, destino)
      : null;
    setSobreGrupo(destino && lado ? { id: destino, lado } : null);
  };

  const grupoUp = (e: React.PointerEvent<HTMLLIElement>, proyecto: string) => {
    const a = arrGrupo.current;
    const destino = sobreGrupo?.id;
    arrGrupo.current = null;
    soltarFantasma();
    pararAuto();
    setMoviendoGrupo(null);
    setSobreGrupo(null);
    if (!a?.activo) return;
    e.stopPropagation();
    // Igual que con los proyectos: el clic que viene detrás de un arrastre no
    // debe abrir las sesiones del grupo.
    soltoRecien.current = true;
    window.setTimeout(() => {
      soltoRecien.current = false;
    }, 0);
    if (!destino) return;
    mutate((prev) => ({ ...prev, groups: moverGrupo(prev.groups, proyecto, a.id, destino) }));
  };

  useEffect(() => {
    const limpiar = () => {
      if (!arrGrupo.current) return;
      arrGrupo.current = null;
      soltarFantasma();
      pararAuto();
      setMoviendoGrupo(null);
      setSobreGrupo(null);
    };
    window.addEventListener("pointerup", limpiar);
    window.addEventListener("pointercancel", limpiar);
    window.addEventListener("blur", limpiar);
    return () => {
      window.removeEventListener("pointerup", limpiar);
      window.removeEventListener("pointercancel", limpiar);
      window.removeEventListener("blur", limpiar);
    };
  }, []);

  /** Qué hay debajo del puntero, para pintar dónde va a caer. */
  /**
   * Abre el hueco donde caería la fila que llevas.
   *
   * Los índices salen del DOM y no del estado a propósito: lo que hay que
   * apartar es lo que se está VIENDO, y la lista visible ya viene filtrada
   * (archivadas fuera, fijadas fuera, el buscador). Con los índices del estado
   * se apartaría la fila equivocada en cuanto hubiera un filtro puesto.
   *
   * `hasta` es el índice de la fila que tienes debajo, sin más, y eso no es una
   * casualidad: `moverProyecto` deja al arrastrado EXACTAMENTE en ese puesto.
   * Así el hueco que ves y el orden que queda salen del mismo número y no
   * pueden discrepar, que es lo que le pasaba a la raya.
   */
  /** Si dos huecos son el mismo. Comparar por JSON sería más corto y bastante
      más caro: esto corre una vez por fotograma mientras arrastras. */
  const mismoHueco = (a: Record<string, number>, b: Record<string, number>) => {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every((k) => b[k] === a[k]);
  };

  /**
   * El sitio que una lista reserva mientras tiene el hueco abierto.
   *
   * Las filas se apartan con `transform`, que mueve el dibujo pero NO ocupa
   * sitio, y la que llevas en la mano ya salió del flujo. O sea que la lista se
   * encoge justo lo que las de abajo se han desplazado: la última se salía por
   * el borde y se pintaba ENCIMA de la cabecera del proyecto siguiente, con los
   * dos nombres montados uno sobre otro (Munir, 2026-08-14, con la captura de
   * «ORQUIO VA…» encima de «VoCript»).
   *
   * Devolviéndole ese alto por abajo, la lista mide lo mismo durante todo el
   * gesto y nada se sale de su caja.
   */
  const reservaHueco = (ids: string[]): React.CSSProperties | undefined =>
    hueco && ids.some((id) => hueco.dy[id]) ? { paddingBottom: hueco.alto } : undefined;

  const abrirHueco = (
    li: HTMLElement | null | undefined,
    id: string,
    destino: string,
    alto: number,
    lado: Lado,
  ) => {
    const ul = li?.closest("ul");
    if (!ul || !alto) return setHueco(null);
    const filas = [...ul.querySelectorAll<HTMLElement>("[data-sesion]")].map(
      (e) => e.dataset.sesion ?? "",
    );
    // SIN la que llevas en la mano: esa ya no ocupa sitio (sale del flujo con
    // `display: none`), así que las de abajo suben solas a taparlo. Contarla
    // aquí es lo que montaba unas filas encima de otras.
    const sin = filas.filter((f) => f !== id);
    if (!filas.includes(id) || !sin.includes(destino)) return setHueco(null);
    const donde = huecoEn(sin, destino, lado);
    if (donde < 0) return setHueco(null);
    // Se guarda ya resuelto, fila por fila, en vez del índice: así no hace
    // falta identificar de qué lista es cada fila al pintarla, que con varias
    // listas llamadas igual (`ul.sessions`) no tiene forma fiable.
    const dy: Record<string, number> = {};
    for (const [i, sid] of sin.entries()) {
      if (desplazamiento(i, donde)) dy[sid] = 1;
    }
    // Si el hueco cae donde ya estaba, no se toca el estado. Sin esta guarda,
    // cada fotograma creaba un objeto nuevo y React repintaba la barra entera
    // para dejarla exactamente igual: mover el ratón dentro de una misma fila
    // costaba decenas de repintados que no cambiaban un píxel.
    setHueco((antes) => {
      if (antes && antes.alto === alto && mismoHueco(antes.dy, dy)) return antes;
      return { dy, alto };
    });
  };

  /**
   * La fila que tienes debajo, aunque no la tengas debajo.
   *
   * `elementFromPoint` no vale por sí solo desde que existe el hueco: al
   * abrirse, el puntero se queda sobre espacio VACÍO, así que el DOM contesta
   * que ahí no hay ninguna fila. Y entonces ganaba la zona de sueltas, que
   * envuelve la lista entera, y el destino pasaba de «colócala aquí» a
   * «mándala a sueltas», donde ya estaba: soltabas y volvía a su sitio, con el
   * recuadro azul encendido. Ese era el bug que Munir vio tres veces seguidas
   * (2026-08-09), y el cuadro azul que él señaló era exactamente el síntoma.
   *
   * Así que dentro de una lista se elige por GEOMETRÍA: la fila cuyo centro
   * está más cerca en vertical. Un hueco deja de ser un agujero por el que se
   * cuela el gesto.
   */
  const filaCercana = (ul: Element, y: number, id: string): HTMLElement | null => {
    let mejor: HTMLElement | null = null;
    let cerca = Infinity;
    for (const el of ul.querySelectorAll<HTMLElement>("[data-sesion]")) {
      if (el.dataset.sesion === id) continue; // la que llevas no cuenta
      const r = el.getBoundingClientRect();
      if (!r.height) continue; // la arrastrada, colapsada
      const d = Math.abs(y - (r.top + r.height / 2));
      if (d < cerca) {
        cerca = d;
        mejor = el;
      }
    }
    return mejor;
  };

  /** La clave de una lista de sesiones en `ui.ordenLista`. Un solo sitio, o el
      que guarda y el que pinta acabarían mirando cajones distintos. */
  const claveLista = (g: Group) => (g.suelto ? "sueltas" : `p:${g.name}`);

  const mirarDestino = (x: number, y: number, id: string) => {
    const bajo = document.elementFromPoint(x, y);
    const grupo = bajo?.closest<HTMLElement>("[data-grupo]")?.dataset.grupo;
    // Si el puntero cae dentro de una lista de sesiones pero no sobre una fila
    // (o sea, sobre el hueco), se busca la más cercana en vez de rendirse.
    const enLista = bajo?.closest("ul.sessions");
    const liDirecto = bajo?.closest<HTMLElement>("[data-sesion]");
    const li = liDirecto ?? (enLista ? filaCercana(enLista, y, id) : null);
    const fila = li?.dataset.sesion;
    const fuera = bajo?.closest<HTMLElement>("[data-fuera]")?.dataset.fuera;
    const global = !!bajo?.closest("[data-sueltas]");
    const proyecto = bajo?.closest<HTMLElement>("[data-proyecto]")?.dataset.proyecto;
    // De más adentro a más afuera, y ese orden es todo el sentido:
    //   · un grupo está DENTRO de un proyecto, así que soltar ahí significa el
    //     grupo y no el proyecto que lo contiene;
    //   · otra sesión gana sobre la zona de sueltas: soltar encima de una
    //     suelta crea un grupo con las dos, que es la forma más corta de
    //     hacer uno y sería una pena perderla;
    //   · la zona de sueltas, que es donde una sesión SALE de su grupo;
    //   · y el proyecto, que es lo más ancho.
    //   · y por encima de la zona de sueltas de un proyecto va la GLOBAL, la
    //     del final de la barra: si estás dentro de ella, lo que quieres es
    //     que la sesión deje de ser de ningún proyecto, no meterla en el saco
    //     como si el saco fuera uno más.
    // Todo destino se apunta TAMBIÉN en el ref: el manejador que lo aplica vive
    // en `window` y no puede leer el estado de React.
    // La lista se limpia con cada destino nuevo: si no, la de un borde por el
    // que pasaste antes sobreviviría a un destino que ya no es de colocar.
    const marcar = (d: string | null, lista = "") => {
      setSobre(d);
      if (arrastre.current) {
        arrastre.current.destino = d;
        arrastre.current.lista = lista;
      }
    };
    if (grupo) marcar(grupo);
    else if (fila && fila !== id) {
      // Sobre una fila caben DOS gestos, y los separa dónde sueltas: en un
      // borde se reordena (sale la raya) y en el centro se agrupa (se enciende
      // la fila). Ver `zonaDeFila`, que es donde está el porqué y el 30 %.
      // Entre dos fijadas no hay centro: agrupar dos sesiones que has puesto
      // arriba a mano no significa nada, y su sección solo sabe de orden.
      const caja = li?.getBoundingClientRect();
      const zona = caja ? zonaDeFila(y, caja.top, caja.height) : "centro";
      const ambasFijadas = ui.pinned.includes(id) && ui.pinned.includes(fila);
      if (zona === "centro" && !ambasFijadas) {
        marcar(`s:${fila}`);
        setHueco(null); // agrupar no abre hueco: se enciende la fila y ya
      } else {
        const lado: Lado = zona === "centro" ? "antes" : zona;
        // En QUÉ lista está la fila sobre la que sueltas. Se lee de la lista
        // que la contiene y no de dónde venía la que llevas: son dos sitios
        // distintos en cuanto arrastras de un proyecto a otro, y el orden se
        // guarda en el de destino. Sin este dato solo se sabía colocar en el
        // cajón del final, así que arrastrar dentro de un proyecto abría el
        // hueco y al soltar no pasaba nada (Munir, 2026-08-12).
        const lista = li?.closest<HTMLElement>("ul.sessions[data-orden]")?.dataset.orden ?? "";
        marcar(marcaDeColocar(lado, fila), lista);
        abrirHueco(li, id, fila, caja?.height ?? 0, lado);
      }
    }
    else if (global) marcar("sueltas");
    else if (fuera) marcar(`fuera:${fuera}`);
    else if (proyecto) marcar(`p:${proyecto}`);
    else marcar(null);
  };

  /**
   * La lista se desplaza sola mientras arrastras cerca de un borde. Sin esto,
   * una sesión del final de la barra no podía llegar a un proyecto de arriba:
   * el arrastre no hace scroll por sí mismo y no había forma de subir con la
   * sesión en la mano (Munir, 2026-08-02). Va con requestAnimationFrame porque
   * si el puntero se queda quieto en la zona caliente ya no llegan más eventos,
   * y quieto en el borde es exactamente como se pide «sigue subiendo».
   */
  const auto = useRef({ v: 0, raf: 0, x: 0, y: 0, id: "" });

  const pararAuto = () => {
    if (auto.current.raf) cancelAnimationFrame(auto.current.raf);
    auto.current = { v: 0, raf: 0, x: 0, y: 0, id: "" };
  };

  const tick = () => {
    const cont = listaRef.current;
    if (!cont || !auto.current.v) {
      auto.current.raf = 0;
      return;
    }
    const antes = cont.scrollTop;
    cont.scrollTop += auto.current.v;
    // Al desplazarse cambia lo que hay bajo un puntero que no se ha movido.
    if (cont.scrollTop !== antes) mirarDestino(auto.current.x, auto.current.y, auto.current.id);
    auto.current.raf = requestAnimationFrame(tick);
  };

  const cercaDelBorde = (x: number, y: number, id: string) => {
    const cont = listaRef.current;
    if (!cont) return;
    const r = cont.getBoundingClientRect();
    const ZONA = 56;
    let v = 0;
    if (y < r.top + ZONA) v = -Math.min(18, Math.ceil((r.top + ZONA - y) / 3));
    else if (y > r.bottom - ZONA) v = Math.min(18, Math.ceil((y - (r.bottom - ZONA)) / 3));
    auto.current.v = v;
    auto.current.x = x;
    auto.current.y = y;
    auto.current.id = id;
    if (v && !auto.current.raf) auto.current.raf = requestAnimationFrame(tick);
  };

  /** El fotograma pendiente para recalcular el destino, y la última posición
      del ratón. Ver el porqué dentro de `sesionMove`. */
  const rafDestino = useRef(0);
  const ultimoRaton = useRef<{ x: number; y: number; id: string } | null>(null);

  const sesionMove = (e: React.PointerEvent<HTMLLIElement>) => {
    const a = arrastre.current;
    if (!a) return;
    if (!a.activo) {
      // Seis píxeles: por debajo de eso es el temblor de un clic, no un gesto.
      if (Math.hypot(e.clientX - a.x, e.clientY - a.y) < 6) return;
      a.activo = true;
      setLlevando(a.id);
      e.currentTarget.setPointerCapture(e.pointerId);
      fantasma.current = levantar(e.currentTarget, a.x, a.y, undefined, asideRef.current);
    }
    // La copia que llevas se mueve SIEMPRE y en el acto: es lo único que tiene
    // que ir pegado al dedo, y es barato (un `transform` sobre un solo nodo).
    fantasma.current?.mover(e.clientX, e.clientY);
    cercaDelBorde(e.clientX, e.clientY, a.id);
    // Lo caro va una vez por fotograma, no una por evento del ratón.
    //
    // Buscar el destino mide la caja de CADA fila de la lista, y con treinta y
    // tres sesiones eso son treinta y tres medidas más un repintado de la barra
    // entera. El ratón dispara muchos más eventos que fotogramas tiene la
    // pantalla, así que se hacía varias veces para pintar lo mismo: de ahí los
    // tirones que Munir notó (2026-08-09). Con esto se hace como mucho una vez
    // por fotograma y se descarta lo que llegue de más, quedándose con la
    // última posición, que es la única que importa.
    ultimoRaton.current = { x: e.clientX, y: e.clientY, id: a.id };
    if (rafDestino.current) return;
    rafDestino.current = requestAnimationFrame(() => {
      rafDestino.current = 0;
      const p = ultimoRaton.current;
      if (arrastre.current?.activo && p) mirarDestino(p.x, p.y, p.id);
    });
  };

  /**
   * Resolver un arrastre de sesión. Lo llama el `pointerup` de `window`, NUNCA
   * la fila, y eso es el arreglo del 2026-08-09 después de tres intentos.
   *
   * Vivía en el `<li>` y dependía de su captura de puntero, que se pierde en
   * cuanto ese elemento se esconde, se mueve o se repinta. Como el arrastre
   * hace justo eso —la fila sale del flujo para abrir el hueco—, el `pointerup`
   * dejaba de llegar y el orden no se guardaba nunca: soltabas la sesión y
   * volvía a su sitio. En `window` no hay nada que se pueda perder.
   *
   * Por lo mismo, el destino y el proyecto salen del ref del arrastre y no del
   * estado de React: este manejador se registra una sola vez, así que su
   * closure vería para siempre los valores del primer render.
   */
  /** La última versión de `sesionUp`, para que el oyente de `window` no se
      quede con la del primer render. Ver el porqué en el efecto de arriba. */
  const alSoltar = useRef<(e: { clientX: number; clientY: number }) => void>(() => {});

  /**
   * Los ids de una lista, en el orden EN QUE SE ESTÁN VIENDO.
   *
   * Salen del DOM y no de reconstruir la lista desde el estado, y eso es lo que
   * hace que colocar valga igual en las sueltas de un proyecto, en las de un
   * grupo y en el cajón del final sin tres caminos distintos: quién está
   * primero lo sabe exactamente quien lo está pintando. Antes se sacaban de
   * `sueltas.sessions`, o sea del cajón del final y de ningún otro sitio, y por
   * eso arrastrar dentro de un proyecto no colocaba nada.
   *
   * Con el buscador puesto devuelve vacío a propósito: lo que se ve es media
   * lista, y guardar ese orden borraría el sitio de todo lo que el filtro
   * esconde.
   */
  const idsVisiblesDe = (lista: string): string[] => {
    if (!lista || filter.trim()) return [];
    const ul = document.querySelector<HTMLElement>(
      `ul.sessions[data-orden="${CSS.escape(lista)}"]`,
    );
    if (!ul) return [];
    return [...ul.querySelectorAll<HTMLElement>("[data-sesion]")]
      .map((el) => el.dataset.sesion ?? "")
      .filter(Boolean);
  };

  const sesionUp = (e: { clientX: number; clientY: number }) => {
    const a = arrastre.current;
    const destino = a?.destino ?? null;
    const proyecto = a?.proyecto ?? "";
    arrastre.current = null;
    soltarFantasma();
    pararAuto();
    setLlevando(null);
    setSobre(null);
    setHueco(null);
    if (!a?.activo) return;
    // Se acaba de arrastrar: el clic que viene detrás no debe abrir la sesión.
    soltoRecien.current = true;
    window.setTimeout(() => {
      soltoRecien.current = false;
    }, 0);

    if (!destino) {
      // Fuera de todo grupo, pero DENTRO de la lista: sacarla del suyo. Si se
      // suelta en cualquier otro sitio de la ventana no se toca nada, que es
      // lo que se espera de un arrastre abandonado a medias.
      const bajo = document.elementFromPoint(e.clientX, e.clientY);
      if (bajo?.closest(".sueltas-zona")) {
        // Soltada abajo del todo: vuelve a ser suelta, y de paso sale del
        // grupo, que era del proyecto del que acaba de irse.
        devolverASueltas(a.id);
        return;
      }
      if (bajo?.closest(".sessions") && ui.sessionGroup[a.id]) assignGroup(a.id, null);
      return;
    }
    // Soltada en el borde de otra fila: se coloca a mano, ni se agrupa ni se
    // mueve de proyecto. Dos listas distintas la pueden recibir, y cada una
    // guarda su orden en su sitio.
    const colocar = leerMarcaDeColocar(destino);
    if (colocar) {
      const { lado, fila: hasta } = colocar;
      // La lista viene por el ref y NO de la marca: ver `marcaDeColocar`.
      const lista = a?.lista ?? "";
      // `colocarSuelta` con el mismo `lado` que abrió el hueco, y sobre la lista
      // SIN la fila que llevas, que es exactamente lo que ella hace por dentro.
      // Así el sitio que viste abierto y el que ocupa al soltar son el mismo
      // número, que es la regla que esta barra ya rompió una vez con la raya.
      // Dónde cae decide el DESTINO, no de dónde venía. Una sesión fijada
      // arrastrada abajo, entre las sueltas, se DESFIJA; y una suelta subida a
      // la sección de arriba se fija. Antes solo se miraba si las dos estaban
      // fijadas, así que sacar una de la sección no hacía absolutamente nada y
      // se quedaba clavada donde estaba (Munir, 2026-08-09). Arrastrarla fuera
      // ES la forma de quitarla, igual que arrastrar una sesión fuera de un
      // grupo la saca de él.
      if (ui.pinned.includes(hasta)) {
        mutate((prev) => ({
          ...prev,
          pinned: colocarSuelta(prev.pinned, a.id, hasta, lado),
        }));
      } else if (ui.pinned.includes(a.id)) {
        // Bajaba de las fijadas a una lista normal: sale de arriba y se coloca
        // donde la has dejado. Las dos cosas en la MISMA escritura, o entre una
        // y otra la barra se pintaría con la sesión en ningún sitio.
        const visibles = idsVisiblesDe(lista);
        mutate((prev) => ({
          ...prev,
          pinned: prev.pinned.filter((x) => x !== a.id),
          ordenLista: visibles.includes(hasta)
            ? { ...prev.ordenLista, [lista]: colocarSuelta(visibles, a.id, hasta, lado) }
            : prev.ordenLista,
        }));
      } else if (lista) {
        /* El orden se guarda ENTERO tal y como se está viendo, y por eso hace
           falta la lista visible: hasta el primer arrastre no hay orden manual
           ninguno, así que guardar solo la movida dejaría al resto bailando con
           la actividad alrededor de la que acabas de colocar.
           Con el buscador puesto NO se coloca a mano, y es a propósito: lo que
           se ve es media lista, así que guardar ese orden se comería de un
           plumazo el sitio de todas las que el filtro esconde. Arrastrar sigue
           valiendo para agrupar y para mover de proyecto, que no dependen del
           orden; colocar, no.

           Y los ids salen del DOM de esa lista (ver `idsVisiblesDe`), no de
           reconstruirla desde el estado. */
        const visibles = idsVisiblesDe(lista);
        if (visibles.includes(hasta)) {
          mutate((prev) => ({
            ...prev,
            ordenLista: { ...prev.ordenLista, [lista]: colocarSuelta(visibles, a.id, hasta, lado) },
          }));
          // Y si venía de OTRA lista, además de colocarla hay que mudarla: si
          // no, se guardaría su sitio en una lista donde no se pinta.
          if (lista.startsWith("g:")) assignGroup(a.id, lista.slice(2));
          else if (lista === "sueltas") asignarProyecto(a.id, SUELTAS);
          else if (lista.startsWith("p:")) {
            const suyo = lista.slice(2);
            if (suyo !== proyecto) asignarProyecto(a.id, suyo);
            else if (ui.sessionGroup[a.id]) assignGroup(a.id, null);
          }
        }
      }
      return;
    }
    if (destino === "sueltas") {
      // La zona del final: la sesión deja de pertenecer a ningún proyecto.
      // Va por `asignarProyecto` al saco y no por `devolverASueltas`, que es
      // otra cosa: aquel la devuelve a donde diga SU CARPETA, y si su carpeta
      // es un proyecto de la lista volvería a subir ahí en el acto.
      //
      // Y si venía fijada, se desfija: has arrastrado la sesión hasta aquí
      // abajo, y dejarla arriba sería no hacer caso al gesto. Vale también
      // cuando sueltas en el hueco de la zona sin acertar ninguna fila.
      if (ui.pinned.includes(a.id)) {
        mutate((prev) => ({ ...prev, pinned: prev.pinned.filter((x) => x !== a.id) }));
      }
      asignarProyecto(a.id, SUELTAS);
      return;
    }
    if (destino.startsWith("fuera:")) {
      // La zona de sueltas de un proyecto: aquí una sesión SALE de su grupo.
      // Si además viene de otro proyecto, se queda en este, que es lo que dice
      // el gesto: la has traído hasta aquí.
      const suyo = destino.slice(6);
      if (suyo !== proyecto) asignarProyecto(a.id, suyo);
      else if (ui.sessionGroup[a.id]) assignGroup(a.id, null);
      return;
    }
    if (destino.startsWith("p:")) {
      // Soltada sobre el proyecto en el que YA está: no es un movimiento, es
      // un arrastre que no llegó a ninguna parte. Sin esto, la sesión salía de
      // su grupo por el camino, que no lo ha pedido nadie.
      if (destino.slice(2) !== proyecto) asignarProyecto(a.id, destino.slice(2));
      return;
    }
    if (!destino.startsWith("s:")) {
      assignGroup(a.id, destino);
      return;
    }
    // Sobre otra sesión: si esa ya tiene grupo, se une a él; si no, nace uno
    // con las dos dentro, que es la forma más corta de crear un grupo.
    const otra = destino.slice(2);
    const suyo = ui.sessionGroup[otra];
    if (suyo) {
      assignGroup(a.id, suyo);
      return;
    }
    const id = crypto.randomUUID();
    const n = ui.groups.filter((x) => x.project === proyecto).length + 1;
    mutate((prev) => ({
      ...prev,
      groups: [...prev.groups, { id, project: proyecto, name: `Grupo ${n}` }],
      sessionGroup: { ...prev.sessionGroup, [otra]: id, [a.id]: id },
    }));
  };

  // En cada pintado, para que el oyente de `window` llame SIEMPRE a la versión
  // de ahora y no a la del primer render. Sin asignación condicional a
  // propósito: cuesta nada y una condición aquí es una forma de equivocarse.
  alSoltar.current = sesionUp;

  /**
   * Mandar una sesión a un proyecto que no es el de su carpeta. Es una
   * etiqueta tuya, no un hecho del disco: la sesión sigue trabajando donde
   * trabajaba, y por eso su fila enseña su carpeta cuando no coincide.
   */
  const asignarProyecto = (id: string, proyecto: string) => {
    mutate((prev) => ({
      ...prev,
      sessionProject: { ...prev.sessionProject, [id]: proyecto },
      // Su grupo era de otro proyecto: quedarse en él la dejaría dentro de una
      // caja que ya no se pinta en ningún sitio.
      sessionGroup: Object.fromEntries(
        Object.entries(prev.sessionGroup).filter(([k]) => k !== id),
      ),
    }));
  };

  /** Deshacer lo anterior: vuelve a estar donde diga su carpeta. */
  /** Clavar una sesión arriba de su lista, o soltarla. La regla de dónde cae
      vive en `alternarFijada` (`lib/ordenBarra.ts`), con sus casos probados. */
  const fijar = (id: string) => {
    mutate((prev) => ({ ...prev, pinned: alternarFijada(prev.pinned, id) }));
  };

  const devolverASueltas = (id: string) => {
    mutate((prev) => ({
      ...prev,
      sessionProject: Object.fromEntries(
        Object.entries(prev.sessionProject).filter(([k]) => k !== id),
      ),
      sessionGroup: Object.fromEntries(
        Object.entries(prev.sessionGroup).filter(([k]) => k !== id),
      ),
    }));
  };

  /**
   * Una carpeta suelta pasa a ser un proyecto del panel, esté donde esté del
   * disco. Es lo que convierte «he abierto una terminal ahí» en «esto es una
   * cosa mía»: a partir de aquí tiene su fila, su logo y sus sesiones juntas.
   */
  const ascender = (cwd: string) => {
    if (!anadirProyecto(cwd)) {
      setError(t("Esa carpeta ya está en el panel."));
      return;
    }
    setError(null);
    refresh();
  };

  /** Cambiarle el nombre a un grupo, ahí mismo. Uno que nace de un arrastre se
      llama «Grupo 2», y sin esto habría que deshacerlo para renombrarlo. */
  const renameGroup = (groupId: string, name: string) => {
    const limpio = name.trim();
    setGnaming(null);
    if (!limpio) return;
    mutate((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.id === groupId ? { ...g, name: limpio.slice(0, 40) } : g)),
    }));
  };

  /** Su color. El mismo campo que ya traen las cuadrillas cuando nacen de un
      reparto: aquí se elige a mano, y sirve para lo mismo, distinguir un grupo
      de otro sin leer su nombre. */
  const colorGroup = (groupId: string, color?: string) => {
    mutate((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.id === groupId ? { ...g, color } : g)),
    }));
  };

  // Plegar un grupo NO es solo doblar su lista aquí: aparta también sus
  // terminales de la Cabina, que es lo que Munir esperaba del botón
  // (2026-08-02). Por eso el estado vive en App y llega como prop: lo miran
  // las dos pantallas.
  const plegarGrupo = onPlegarGrupo;

  const dissolveGroup = (groupId: string) => {
    mutate((prev) => {
      const sessionGroup = { ...prev.sessionGroup };
      for (const key of Object.keys(sessionGroup)) {
        if (sessionGroup[key] === groupId) delete sessionGroup[key];
      }
      return {
        ...prev,
        groups: prev.groups.filter((g) => g.id !== groupId),
        sessionGroup,
      };
    });
  };

  /** What you picked wins over what we found in the folder. */
  const iconFor = (g: Group): string | undefined => ui.projectIcon[g.name] ?? found[g.path];

  /**
   * What a project is called on screen. The folder name stays the key for
   * everything else: sessions are grouped by it and Claude indexes its
   * transcripts by path, so renaming the folder would cut both.
   */
  // El alias que le pusiste, si le pusiste uno. El cajón de las sueltas pasa
  // además por el diccionario: no es el nombre de una carpeta de nadie, es una
  // palabra de la app, y en inglés tiene que decirse en inglés. Para todo lo
  // demás `t` devuelve la misma cadena, que es justo lo que queremos con el
  // nombre de un proyecto.
  const shownName = (name: string): string =>
    ui.projectAlias[name] || (name === SUELTAS ? t(SUELTAS) : name);

  /**
   * Lo saca de la barra y ya está. La carpeta sigue donde estaba, con todo
   * dentro, y sus conversaciones tampoco se tocan: esto es una lista de lo que
   * quieres tener delante, no un inventario del disco. Se recupera desde el
   * cajón «Ocultos» del final de la barra.
   */
  const quitarDeAdeorq = (name: string) => {
    setFlyout(null);
    mutate((prev) => ({
      ...prev,
      hiddenProjects: [...new Set([...prev.hiddenProjects, name])],
    }));
  };

  /** Lo devuelve a la barra, tal y como estaba. */
  const devolverProyecto = (name: string) => {
    mutate((prev) => ({
      ...prev,
      hiddenProjects: prev.hiddenProjects.filter((n) => n !== name),
    }));
  };

  /** Abre el diálogo de borrar la carpeta, siempre con la casilla en blanco. */
  const pedirTirar = (g: Group) => {
    setTirandoTexto("");
    setTirando(g);
  };

  /** ¿Ha escrito el nombre del proyecto que está a punto de tirar? Sin
      distinguir mayúsculas: la idea es que teclee el nombre entero y se dé
      cuenta de lo que hace, no castigarle por una letra. */
  const tirarDesbloqueado =
    tirando !== null &&
    tirandoTexto.trim().toLowerCase() === shownName(tirando.name).toLowerCase();

  const tirarAhora = () => {
    if (!tirando || !tirarDesbloqueado) return;
    const g = tirando;
    setTirando(null);
    deleteProject(g.path)
      .then(() => refresh())
      .catch((e) => setError(String(e)));
  };

  const saveAlias = () => {
    if (!naming) return;
    const value = naming.value.trim();
    const real = naming.name;
    setNaming(null);
    mutate((prev) => {
      const projectAlias = { ...prev.projectAlias };
      // Typing the folder name back, or nothing, removes the alias.
      if (!value || value === real) delete projectAlias[real];
      else projectAlias[real] = value.slice(0, 40);
      return { ...prev, projectAlias };
    });
  };

  const askLogo = (project: string) => {
    setPickFor(project);
    fileRef.current?.click();
  };

  const takeLogo = (file: File | undefined) => {
    const project = pickFor;
    setPickFor(null);
    if (!file || !project) return;
    shrinkToDataUri(file)
      .then((uri) =>
        mutate((prev) => ({
          ...prev,
          projectIcon: { ...prev.projectIcon, [project]: uri },
        })),
      )
      .catch((e: Error) => setError(e.message));
  };

  const clearLogo = (project: string) => {
    mutate((prev) => {
      const projectIcon = { ...prev.projectIcon };
      delete projectIcon[project];
      return { ...prev, projectIcon };
    });
  };

  const rescanLogos = () => {
    forgetProjectIcons()
      .then(() => projectIcons(projects.map((p) => p.path)))
      .then(setFound)
      .catch((e) => setError(String(e)));
  };

  /** Right-click on a workspace: everything the row can do, spelled out. */
  const projectMenu = (g: Group) => [
    // Lo que la fila no puede enseñar por falta de sitio: dónde está de
    // verdad, cuántas sesiones tiene, cuántas te esperan y de cuándo es la
    // última. Informa, no se pulsa.
    {
      heading: true,
      label: shownName(g.name),
      hint: [
        g.path,
        `${g.sessions.length} ${g.sessions.length === 1 ? "sesión" : "sesiones"}`,
        g.hasLive ? "una abierta ahora" : null,
        g.waiting > 0 ? `${g.waiting} te ${g.waiting === 1 ? "espera" : "esperan"}` : null,
        // El «hace» lo pone aquí quien escribe la frase: `ago` llega desnudo
        // desde Rust («1 día»), porque en la fila esa palabra solo estorbaba.
        g.sessions[0]?.ago ? `última hace ${g.sessions[0].ago}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    },
    { label: "", separator: true },
    // Todo lo de «aquí» solo si hay un aquí: en el cajón de las sueltas la
    // carpeta está vacía, y abrir una terminal en "" no la abre en ningún
    // sitio, la abre donde el sistema quiera.
    ...(g.suelto
      ? []
      : [
    { label: t("Nueva sesión de Claude Code aquí"), onClick: () => onOpenClaude(shownName(g.name), g.path) },
    { label: t("Terminal PowerShell aquí"), onClick: () => onOpenTerminal(shownName(g.name), g.path) },
    {
      label: agy ? t("Antigravity (agy) en una terminal aquí") : t("Abrir en Antigravity"),
      onClick: () => {
        if (agy) onOpenAgy(shownName(g.name), g.path);
        else openInAntigravity(g.path).catch((err) => setError(String(err)));
      },
    },
    ...clis.map((id) => ({
      label: `${providerOf(id).label} ${t("en una terminal aquí")}`,
      onClick: () => onOpenProvider(id, shownName(g.name), g.path),
    })),
    ...(accounts.length ? [{ label: "", separator: true }] : []),
    ...accounts.map((a) => ({
      label: `${providerOf(a.provider).label} · ${a.label}`,
      onClick: () => onOpenAccount(a, shownName(g.name), g.path),
    })),
        ]),
    { label: "", separator: true },
    {
      label: t("Abrir sus {n} sesiones a la vez", {
        n: Math.min(g.sessions.length, topeAbrirTodas),
      }),
      onClick: () => onOpenAll(g.name, g.path, g.sessions),
    },
    { label: "", separator: true },
    {
      label: t("Cambiar el nombre que se ve…"),
      icon: <PencilIcon size={14} />,
      onClick: () => setNaming({ name: g.name, value: shownName(g.name) }),
    },
    ...(ui.projectAlias[g.name]
      ? [
          {
            label: t("Volver a llamarlo «{n}»", { n: g.name }),
            onClick: () =>
              mutate((prev) => {
                const projectAlias = { ...prev.projectAlias };
                delete projectAlias[g.name];
                return { ...prev, projectAlias };
              }),
          },
        ]
      : []),
    {
      label: ui.projectIcon[g.name] ? t("Cambiar su logo…") : t("Ponerle un logo…"),
      onClick: () => askLogo(g.name),
    },
    ...(ui.projectIcon[g.name]
      ? [{ label: t("Quitar el logo que le puse"), onClick: () => clearLogo(g.name) }]
      : []),
    { label: t("Volver a buscar logos en las carpetas"), onClick: rescanLogos },
    // Solo cuando hay algo que deshacer: si nunca has arrastrado nada, esta
    // línea no dice nada de lo que está pasando.
    ...(ui.projectOrder.length
      ? [
          {
            label: t("Volver al orden automático"),
            hint: t("lo abierto y lo reciente arriba"),
            onClick: () => mutate((prev) => ({ ...prev, projectOrder: [] })),
          },
        ]
      : []),
    // Las dos formas de dejar de ver un proyecto, en el orden en que se
    // necesitan. Arriba la de siempre: quitarlo de la lista, que no toca el
    // disco y se deshace desde el cajón «Ocultos». Abajo del todo, separada y
    // en rojo, la que borra su carpeta de verdad; hasta la 0.9.54 esta era la
    // ÚNICA, se llamaba «Tirar este proyecto…» y por ese camino se fueron
    // diecisiete carpetas a la papelera en una madrugada. Ninguna de las dos
    // sale en el cajón de las sueltas, que no es una carpeta de nadie.
    ...(g.suelto
      ? []
      : [
          { label: "", separator: true },
          {
            label: t("Quitar de Adeorq"),
            icon: <EyeOffIcon size={14} />,
            hint: t("no borra nada"),
            onClick: () => quitarDeAdeorq(g.name),
          },
          { label: "", separator: true },
          {
            label: t("Borrar la carpeta del disco…"),
            icon: <TrashIcon size={14} />,
            danger: true,
            onClick: () => pedirTirar(g),
          },
        ]),
  ];

  /**
   * The buttons a workspace offers. They only appear once the row is yours
   * (hover), which is why the name and the logo step aside for them: the row
   * is 300px wide and the name was eating all of it. Munir's ask, 2026-07-26.
   */
  const actionButtons = (g: Group) => (
    <>
      {/* El botón de abrirlas todas de un vistazo vivía aquí, con su número al
          lado. Se quita de la fila (Munir, 2026-08-02): con dieciséis
          sesiones, un solo clic sin pedir nada abría doce terminales de golpe,
          demasiado fácil de darle sin querer. La acción sigue en el menú
          contextual del proyecto («Abrir sus N sesiones a la vez»), que pide
          al menos un clic derecho antes. */}
      {/* Abrir «aquí» necesita un aquí. El cajón de las sueltas no es una
          carpeta —cada sesión trae la suya—, así que estos botones se van. */}
      {!g.suelto && (
        <>
      {/* Los que TÚ has elegido en Cuentas, en su orden. Antes eran tres
          fijos escritos a mano —Claude, PowerShell y Antigravity— y esa lista
          no era la de nadie: la terminal pelada casi nunca es lo que abres
          sobre un proyecto (sigue estando en el clic derecho) y los CLIs que
          de verdad usas no salían. */}
      {atajosProv.map((id) => {
        const p = providerOf(id);
        if (id === "claude") {
          return (
            <button
              key={id}
              className="mini mini-claude"
              data-tip={t("Nueva sesión de Claude Code aquí")}
              onClick={() => onOpenClaude(shownName(g.name), g.path)}
            >
              <ClaudeMark />
            </button>
          );
        }
        if (id === "shell") {
          return (
            <button
              key={id}
              className="mini"
              data-tip={t("Terminal PowerShell aquí")}
              onClick={() => onOpenTerminal(shownName(g.name), g.path)}
            >
              <TerminalIcon />
            </button>
          );
        }
        if (id === "agy") {
          return (
            <button
              key={id}
              className="mini mini-account mini-marca"
              style={{ ["--c" as string]: p.hue }}
              data-tip={
                agy
                  ? t("Antigravity (agy) en una terminal aquí")
                  : t("Abrir el IDE de Antigravity aquí (su CLI agy no está instalado)")
              }
              onClick={() => {
                if (agy) onOpenAgy(shownName(g.name), g.path);
                else openInAntigravity(g.path).catch((e) => setError(String(e)));
              }}
            >
              <ProviderMark id="agy" />
            </button>
          );
        }
        // Su marca si la tenemos dibujada; si no, sus iniciales, que es lo que
        // llevaban todos hasta ahora. Un CLI nuevo entra sin dibujo y sigue
        // saliendo bien, solo que menos reconocible.
        const marca = tieneMarca(id);
        return (
          <button
            key={id}
            className={marca ? "mini mini-account mini-marca" : "mini mini-account"}
            style={{ ["--c" as string]: p.hue }}
            data-tip={`${p.label} ${t("en una terminal aquí")}`}
            onClick={() => onOpenProvider(id, shownName(g.name), g.path)}
          >
            {marca ? <ProviderMark id={id} /> : initials(p.label)}
          </button>
        );
      })}
      {/* One per extra account: the same session, signed in as someone else. */}
      {accounts.slice(0, MAX_ACCOUNT_BUTTONS).map((a) => (
        <button
          key={a.id}
          className="mini mini-account"
          style={{ ["--c" as string]: providerOf(a.provider).hue }}
          data-tip={t("Nueva sesión de {cli} con la cuenta «{acc}» aquí", {
            cli: providerOf(a.provider).label,
            acc: a.label,
          })}
          onClick={() => onOpenAccount(a, shownName(g.name), g.path)}
        >
          {initials(a.label)}
        </button>
      ))}
        </>
      )}
    </>
  );

  /**
   * Cómo se llama la cuenta con la que se escribió una sesión, o `null` si es
   * la de siempre.
   *
   * Solo se marcan las OTRAS: si se etiquetaran todas, la etiqueta dejaría de
   * decir nada y la lista se llenaría de la misma palabra repetida. Lo que hay
   * que poder ver de un vistazo es «esta no es la de siempre».
   */
  const nombreCuenta = (s: SessionInfo): string | null => {
    if (!s.cuenta) return null;
    const a = accounts.find((x) => x.dir === s.cuenta);
    // Sin ficha en el panel (la cuenta se quitó pero su carpeta sigue en el
    // disco, con sus conversaciones dentro) el nombre de la carpeta dice más
    // que no decir nada.
    return a?.label ?? s.cuenta.split(/[\\/]/).pop() ?? null;
  };

  const sessionRow = (s: SessionInfo, g: Group, isArchived: boolean) => {
    if (renaming?.id === s.id) {
      return (
        <li key={s.id} className="rename-row">
          <input
            ref={renameRef}
            className="finder rename-input"
            value={renaming.value}
            placeholder={t("Nombre nuevo de la sesión")}
            onChange={(e) => setRenaming({ id: s.id, value: e.currentTarget.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              else if (e.key === "Escape") setRenaming(null);
            }}
            onBlur={commitRename}
          />
        </li>
      );
    }
    const wait = isArchived ? null : waitKind(s);
    // De qué cliente salió la sesión: Rust ya lista los rollouts de Codex
    // además de los transcripts de Claude. El valor por defecto se queda para
    // que una versión vieja del binario, durante la actualización, no deje
    // filas sin marca.
    const fuente = s.fuente ?? "claude";
    return (
      <li
        key={s.id}
        className="session-row"
        data-archived={isArchived}
        data-wait={wait ?? undefined}
        /* Encendido SOLO mientras escribe de verdad. Es lo que enciende el hilo
           de luz del borde, y por eso no vale con «viva»: una sesión abierta y
           quieta no está trabajando, y treinta hilos girando a la vez para
           decir «existo» es exactamente el ruido que esto evita. */
        data-trabajando={s.state === "a_medias" || undefined}
        data-sesion={s.id}
        data-fijada={ui.pinned.includes(s.id) || undefined}
        data-llevando={llevando === s.id || undefined}
        data-suelta={(llevando && sobre === `s:${s.id}`) || undefined}
        /* Apartarse para dejar el hueco. Sustituye a la raya que había aquí, y
           el motivo está escrito en `desplazamiento`: una raya PROMETE dónde va
           a caer y ya mintió una vez; un hueco no promete, enseña. Munir
           rechazó la raya dos veces antes de pedir esto (2026-08-09). */
        style={
          hueco?.dy[s.id]
            ? ({ "--dy": `${hueco.dy[s.id] * hueco.alto}px` } as React.CSSProperties)
            : undefined
        }
        data-apartada={hueco?.dy[s.id] ? "" : undefined}
        onPointerDown={(e) => sesionDown(e, s.id, g.name)}
        onPointerMove={sesionMove}
      >
        <button
          className="session"
          onContextMenu={(e) =>
            showMenu(e, isArchived
              ? [{ label: t("Restaurar: vuelve a la lista normal"), onClick: () => unarchive(s.id) }]
              : [
                  // Con su icono, como todas: sin él era la única fila cuyo
                  // texto arrancaba en el margen, así que la primera línea del
                  // menú salía descuadrada respecto a las seis de debajo. Y es
                  // el mismo icono que el botón de retomar de la fila.
                  {
                    label: t("Retomar la sesión aquí"),
                    icon: <EnterIcon size={15} />,
                    onClick: () => onResume(s),
                  },
                  { label: "", separator: true },
                  {
                    label: ui.pinned.includes(s.id)
                      ? t("Quitar de arriba")
                      : t("Fijar arriba"),
                    // Tachado para quitar: poner y quitar son acciones
                    // opuestas y tenían el mismo dibujo, así que el icono no
                    // decía nada y había que leer el texto para saber cuál era.
                    icon: <PinIcon size={15} off={ui.pinned.includes(s.id)} />,
                    onClick: () => fijar(s.id),
                  },
                  { label: t("Renombrar"), icon: <PencilIcon size={15} />, onClick: () => startRename(s) },
                  { label: t("Mover a grupo…"), icon: <GroupIcon size={15} />, onClick: () => openMenu(e, s, g.path) },
                  // Solo para las que mandaste tú aquí: deshacerlo arrastrando
                  // funciona, pero hay que saber que se puede arrastrar.
                  ...(ui.sessionProject[s.id]
                    ? [
                        {
                          label: t("Sacarla de este proyecto"),
                          icon: <UnlinkIcon size={15} />,
                          onClick: () => devolverASueltas(s.id),
                        },
                      ]
                    : []),
                  // Ascender su carpeta a proyecto. Estaba en la fila, en la
                  // pastilla que decía dónde trabaja, y se fue con ella: es
                  // algo que se hace UNA vez, y lo que se hace una vez no
                  // ocupa sitio en una lista que se lee todo el día.
                  ...(s.cwd && (g.suelto || ui.sessionProject[s.id])
                    ? [
                        {
                          label: t("Hacer un proyecto de «{c}»", { c: carpetaDe(s.cwd) }),
                          hint: s.cwd,
                          // Una CARPETA, que es lo que asciende, y no el
                          // cuadro-dentro-de-cuadro de «Mover a grupo…»: las
                          // dos filas llevaban el mismo dibujo dos renglones
                          // seguidos, y un icono repetido no distingue nada.
                          icon: <FolderIcon size={15} />,
                          onClick: () => ascender(s.cwd),
                        },
                      ]
                    : []),
                  // Su icono de verdad. Llevaba el glifo «⊟» pegado al texto,
                  // que lo dibuja la fuente del sistema con otro grosor y otro
                  // tamaño, y además caía en la columna del texto en vez de en
                  // la del icono: era la única fila torcida de las siete.
                  {
                    label: t("Archivar"),
                    icon: <ArchiveIcon size={15} />,
                    danger: true,
                    onClick: () => askArchive(s, g.path),
                  },
                  {
                    label: t("Borrar la sesión"),
                    icon: <TrashIcon size={15} />,
                    danger: true,
                    onClick: () => {
                      setMenu(null);
                      setBinning(s);
                    },
                  },
                ])
          }
          data-tip={`${s.title}\nhace ${s.ago}${s.live ? " · abierta ahora" : ""}${
            // La ruta entera: la fila enseña solo la última carpeta, que es lo
            // que se reconoce, pero dos carpetas se pueden llamar igual.
            s.cwd && (g.suelto || ui.sessionProject[s.id]) ? `\n${s.cwd}` : ""
          }${
            nombreCuenta(s)
              ? `\n${t("Escrita con la cuenta «{acc}», y ahí se retoma", {
                  acc: nombreCuenta(s) as string,
                })}`
              : ""
          }${porQue(s.id)}${
            wait === "ask"
              ? "\n⚠ Claude te dejó una pregunta con opciones"
              : wait === "offer"
                ? "\n⚠ Claude terminó preguntándote algo"
                : ""
          }\n${t(
            "Clic: retomar la sesión aquí. Arrástrala sobre otra para agruparlas, o sobre un proyecto para meterla en él.",
          )}`}
          onClick={() => {
            // Si viene de soltar un arrastre, el clic no es un clic: es la
            // cola del gesto, y abrir la sesión ahí no lo ha pedido nadie.
            if (soltoRecien.current) return;
            onResume(s);
          }}
        >
          <span className={`dot ${stateDotClass(s)}`} />
          {tieneMarca(fuente) && (
            <span className="sess-prov" style={{ ["--c" as string]: providerOf(fuente).hue }}>
              <ProviderMark id={fuente} />
            </span>
          )}
          <span className="session-title">{s.title}</span>
          {/* De qué cuenta es, cuando no es la de siempre. Sin esto, entrar con
              una cuenta nueva y ver sus conversaciones mezcladas con las de la
              otra no se distingue de que se hayan mezclado de verdad (Munir,
              2026-08-06). Va con el color de la cuenta, que es el mismo que
              lleva su botón en la cabecera del proyecto. */}
          {nombreCuenta(s) && (
            <span
              className="sess-cuenta"
              style={{ ["--c" as string]: hueOf(nombreCuenta(s) as string) }}
            >
              {nombreCuenta(s)}
            </span>
          )}
          {/* El puesto que ocupaba en su cuadrilla, cuando salió de una. Es lo
              que distingue de un vistazo seis sesiones del mismo encargo, que
              es justo cuando la lista se vuelve ilegible. */}
          {encargos[s.id]?.rol && <span className="sess-rol">{encargos[s.id].rol}</span>}
          {/* Only while they are actually out: a stale count is worse than
              none, and this used to be visible only inside an open pane. */}
          {s.agentsLive > 0 && (
            <span
              className="sess-agents"
              data-tip={`${s.agentsLive} ${s.agentsLive === 1 ? "agente trabajando" : "agentes trabajando"} ahora dentro de esta sesión · ${s.agentsTotal} desplegados en total`}
            >
              <RobotIcon size={12} /> {s.agentsLive}
            </span>
          )}
          {/* Sin chincheta en la fila: lo fijado ya vive bajo un encabezado que
              se llama «Fijadas», así que repetirlo en cada fila es decir dos
              veces lo mismo dentro de la misma caja. */}
          <span className="session-ago">{s.ago}</span>
        </button>
        {/* Aquí vivía la pastilla con la carpeta (`.sess-donde`), que además era
            el botón de ascenderla a proyecto. Fuera de la fila desde el
            2026-08-09, por lo que se ve mirando la lista entera: las treinta y
            tres sueltas de Munir están en `C:\proyectos`, así que las treinta y
            tres ponían «proyectos». Una etiqueta que dice lo mismo en todas las
            filas no distingue ninguna, y esta se llevaba 84 px de una barra
            donde el título ya se leía «S..». La carpeta sigue estando: sale
            entera en el globo de la fila. Y ascenderla también, en su menú, que
            es donde vive lo que se hace una vez en la vida de una sesión. */}
        {isArchived ? (
          <button
            className="mini sess-more"
            data-tip={t("Restaurar: vuelve a la lista normal")}
            onClick={() => unarchive(s.id)}
          >
            <EnterIcon size={13} />
          </button>
        ) : (
          <button
            className="mini sess-more"
            data-tip={t("Renombrar, agrupar o archivar")}
            onClick={(e) => openMenu(e, s, g.path)}
          >
            ⋯
          </button>
        )}
        {/* The bin sits in the row itself and not only in the menu: it is the
            one thing he asked for by name, and two clicks deep is not it. */}
        <button
          className="mini sess-bin"
          data-tip={t("Borrar la sesión: va a la papelera de Windows")}
          onClick={() => setBinning(s)}
        >
          <TrashIcon size={15} />
        </button>
      </li>
    );
  };

  const sessionList = (g: Group) => {
    const projectGroups = ui.groups.filter((x) => x.project === g.name);
    const grouped = new Set(
      g.sessions
        .filter((s) => {
          const gid = ui.sessionGroup[s.id];
          return gid && projectGroups.some((pg) => pg.id === gid);
        })
        .map((s) => s.id),
    );
    const loose = g.sessions.filter((s) => !grouped.has(s.id));
    return (
      <ul className="sessions" style={reservaHueco(g.archivedSessions.map((s) => s.id))}>
        {projectGroups.map((pg) => {
          // An emptied group stays visible so it can be refilled or dissolved.
          const inside = g.sessions.filter((s) => ui.sessionGroup[s.id] === pg.id);
          return (
            <li
              key={pg.id}
              className="sgroup"
              // Su color, cuando lo trae: es lo que distingue una cuadrilla de
              // un grupo cualquiera con un vistazo, sin tener que leer el
              // nombre. Los grupos hechos a mano no traen color y se quedan
              // con el gris de siempre, que sigue siendo válido para ellos.
              style={pg.color ? { ["--sg" as string]: pg.color } : undefined}
              data-cuadrilla={!!pg.color}
              data-grupo={pg.id}
              // Solo mientras hay algo EN el aire: sin la condición, un estado
              // que se quedara pegado dejaría el grupo iluminado para siempre.
              data-suelta={(llevando && sobre === pg.id) || undefined}
              // Zona de destino para ORDENAR grupos, con nombre propio y no el
              // `data-grupo` de arriba: ese ya significa «suelta aquí una
              // sesión», y las dos cosas se buscan durante el mismo arrastre.
              data-grupo-orden={pg.id}
              data-moviendo={moviendoGrupo === pg.id || undefined}
              data-encima={sobreGrupo?.id === pg.id ? sobreGrupo.lado : undefined}
              onPointerDown={(e) => grupoDown(e, pg.id)}
              onPointerMove={(e) => grupoMove(e, g.name)}
              onPointerUp={(e) => grupoUp(e, g.name)}
              onPointerCancel={(e) => grupoUp(e, g.name)}
            >
              <div className="sgroup-head">
                {/* Aquí NO se renombra. Hubo un segundo input en esta cabecera,
                    atado al mismo `gnaming` que el de la ficha, y era el que
                    rompía el renombrado: al teclear la primera letra abajo,
                    `gnaming.id` pasaba a ser este grupo, esta cabecera se
                    convertía en un input con autoFocus, robaba el foco, y el
                    blur del de la ficha guardaba ese único carácter y cerraba
                    la edición (Munir, 2026-08-02: «solo me deja cambiar un
                    carácter y luego se para»). Un nombre, un sitio. */}
                <button
                  className="sgroup-main"
                  type="button"
                  // Igual que el del proyecto: se pulsa para abrir sus sesiones
                  // y se agarra para cambiarlo de sitio.
                  data-agarre
                  // Pulsar el grupo ABRE sus sesiones, igual que pulsar un
                  // proyecto abre las suyas. Estaba puesto para plegar, y por
                  // eso «no se abría el grupo» por más que se pulsara: hacía
                  // otra cosa (Munir, 2026-08-02). Plegar tiene su ▴ al lado.
                  data-tip={t("Abrir sus {n} sesiones a la vez", { n: inside.length })}
                  disabled={inside.length === 0}
                  // Y aquí lo mismo que en `toggle`, con más motivo: soltar un
                  // grupo en su sitio nuevo no puede abrirte sus seis sesiones.
                  onClick={() => {
                    if (soltoRecien.current) return;
                    onOpenAll(pg.name, g.path, inside, pg.id);
                  }}
                >
                  {pg.color && <span className="sgroup-dot" />}
                  <span className="sgroup-name">{pg.name}</span>
                  <span className="sgroup-count">{inside.length}</span>
                </button>
                <button
                  className="mini sgroup-edit"
                  data-active={editandoGrupo === pg.id}
                  data-tip={t("Nombre y color del grupo")}
                  onClick={() => {
                    const abriendo = editandoGrupo !== pg.id;
                    setEditandoGrupo(abriendo ? pg.id : null);
                    // El nombre entra ya cargado: se corrige sobre lo que hay,
                    // que es lo que se quiere casi siempre, en vez de tener que
                    // escribirlo entero otra vez.
                    setGnaming(abriendo ? { id: pg.id, value: pg.name } : null);
                  }}
                >
                  <PencilIcon size={13} />
                </button>
                {/* Plegar, con su botón propio y siempre a la vista. La
                    cabecera entera ya pliega al pulsarla, pero eso hay que
                    descubrirlo: un tablero se maneja con lo que se ve. */}
                <button
                  className="mini sgroup-fold"
                  data-activo={gruposOcultos.has(pg.id) || undefined}
                  data-tip={
                    gruposOcultos.has(pg.id)
                      ? t("Traer de vuelta sus terminales")
                      : t("Apartar sus terminales (siguen trabajando)")
                  }
                  onClick={() => plegarGrupo(pg.id)}
                >
                  {gruposOcultos.has(pg.id) ? "▾" : "▴"}
                </button>
              </div>

              {editandoGrupo === pg.id && (
                <div className="sgroup-ficha">
                  {/* El único sitio donde se escribe el nombre. Abre con el
                      foco puesto y el texto entero seleccionado: la ficha se
                      abre para cambiar el nombre, así que empezar a teclear
                      tiene que bastar. */}
                  <input
                    className="finder sgroup-input"
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    value={gnaming?.id === pg.id ? gnaming.value : pg.name}
                    placeholder={t("Nombre del grupo")}
                    onChange={(e) => setGnaming({ id: pg.id, value: e.currentTarget.value })}
                    onBlur={() => gnaming?.id === pg.id && renameGroup(pg.id, gnaming.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && gnaming?.id === pg.id) {
                        renameGroup(pg.id, gnaming.value);
                        setEditandoGrupo(null);
                      } else if (e.key === "Escape") {
                        // Dejarlo como estaba: `gnaming` fuera ANTES de cerrar,
                        // para que el blur del desmontaje no guarde lo tecleado.
                        setGnaming(null);
                        setEditandoGrupo(null);
                      }
                    }}
                  />
                  <div className="sgroup-colores">
                    {COLORES_GRUPO.map((c) => (
                      <button
                        key={c}
                        className="sgroup-color"
                        data-on={pg.color === c}
                        style={{ ["--sc" as string]: c }}
                        data-tip={t("Marcar el grupo con este color")}
                        onClick={() => colorGroup(pg.id, c)}
                      />
                    ))}
                    <button
                      className="sgroup-color sgroup-color-no"
                      data-on={!pg.color}
                      data-tip={t("Sin color")}
                      onClick={() => colorGroup(pg.id, undefined)}
                    >
                      ×
                    </button>
                  </div>
                  <button
                    className="mini sgroup-disolver"
                    data-tip={t("Disolver el grupo (las sesiones no se tocan)")}
                    onClick={() => {
                      setEditandoGrupo(null);
                      dissolveGroup(pg.id);
                    }}
                  >
                    {t("Disolver")}
                  </button>
                </div>
              )}

              {!gruposOcultos.has(pg.id) && (
                /* `data-orden` es la CLAVE de esta lista en `ui.ordenLista`, y
                   la lee `mirarDestino` del DOM al soltar. Así el que coloca no
                   tiene que adivinar en qué lista estabas: se lo dice la lista
                   misma, que es la única que lo sabe con seguridad.
                   (`data-lista` NO vale: la zona de sueltas ya lo usa para otra
                   cosa, marcar que llevas algo en la mano.) */
                <ul
                  className="sessions sgroup-list"
                  data-orden={`g:${pg.id}`}
                  style={reservaHueco(inside.map((s) => s.id))}
                >
                  {conOrdenManual(inside, ui.ordenLista[`g:${pg.id}`] ?? []).map((s) =>
                    sessionRow(s, g, false),
                  )}
                </ul>
              )}
            </li>
          );
        })}
        {/* Las vivas primero: es lo que está pasando ahora, frente a un
            historial que lleva ahí horas. Mismas clases que una sesión normal,
            para que la fila sea la misma fila; lo que cambia es el rótulo. */}
        {(g.vivas ?? []).map((a) => (
          <li key={`viva${a.paneId}`} className="session-row">
            <button
              className="session"
              data-tip={`${a.name}\n${a.cwd}${
                a.cuenta ? `\n${t("Cuenta: {acc}", { acc: a.cuenta })}` : ""
              }\n${t(
                a.agente
                  ? "Abierta ahora. Clic: ir a ella."
                  : "Abierta ahora. Una terminal no deja historial: al cerrarla no queda nada suyo.",
              )}`}
              onClick={() => onFocusPane(a.paneId, a.enLienzo)}
            >
              <span className="dot dot-live" />
              <span className="session-title">{a.name}</span>
              {/* La cuenta también aquí, y no solo en las filas del historial:
                  una terminal recién abierta con otra cuenta es justo cuando
                  hace falta saberlo, porque todavía no ha escrito nada con lo
                  que reconocerla. */}
              {a.cuenta && (
                <span className="sess-cuenta" style={{ ["--c" as string]: hueOf(a.cuenta) }}>
                  {a.cuenta}
                </span>
              )}
              <span className="sess-abierta">{t("ABIERTA")}</span>
            </button>
          </li>
        ))}
        {/* Las sueltas de este proyecto, en su propia zona y no sueltas en el
            `ul`. Es lo que hacía falta para poder SACAR una sesión de un grupo
            arrastrando (Munir, 2026-08-08: «no puedo mover una sesión fuera de
            un grupo a suelta»): el `li` de un grupo envuelve también sus
            sesiones, así que cualquier punto de dentro contaba como «este
            grupo» y no quedaba ni un píxel donde soltarla para que saliera.
            Solo enciende cuando llevas algo que está EN un grupo: si no, sería
            una caja parpadeando sin significado. */}
        <li
          className="sueltas-de"
          data-fuera={g.name}
          data-suelta={(llevando && sobre === `fuera:${g.name}`) || undefined}
          data-lista={(llevando && !!ui.sessionGroup[llevando]) || undefined}
        >
          {loose.length === 0 && llevando && ui.sessionGroup[llevando] && (
            <span className="sueltas-pista">{t("Aquí queda fuera de su grupo")}</span>
          )}
          {/* El cajón del final de la barra pasa por aquí igual que un
              proyecto, pero su clave es `sueltas` y no `p:<nombre>`: es la que
              ya venía escrita de antes, y cambiársela le barajaría a Munir el
              orden que tiene puesto. */}
          <ul
            className="sessions sueltas-lista"
            data-orden={claveLista(g)}
            style={reservaHueco(loose.map((s) => s.id))}
          >
            {conOrdenManual(loose, ui.ordenLista[claveLista(g)] ?? []).map((s) =>
              sessionRow(s, g, false),
            )}
          </ul>
        </li>
        {showArchived && g.archivedSessions.map((s) => sessionRow(s, g, true))}
      </ul>
    );
  };

  const flyGroup = flyout
    ? flyout.name === SUELTAS
      ? sueltas
      : (groups.find((g) => g.name === flyout.name) ?? null)
    : null;
  const menuGroups = menu ? ui.groups.filter((x) => x.project === menu.s.project) : [];
  const currentGroupId = menu ? ui.sessionGroup[menu.s.id] : undefined;

  // La tira manda su propio ancho: es el modo entero, no una preferencia que
  // se pueda arrastrar. Al salir de ella vuelve el ancho que él eligió.
  const tira = rail === "tira";

  return (
    <aside
      className="sidebar"
      data-rail={rail}
      style={{ width: tira ? TIRA_W : width }}
      ref={asideRef}
    >
      {tira ? (
        // En la tira solo caben dos cosas, y son las dos que no pueden faltar:
        // abrir algo nuevo y volver. El filtro y los nombres viven en el panel
        // que abre cada logo al pasarle el ratón por encima.
        <div className="rail-mini">
          <button
            className="mini rail-new"
            data-tip={t("Abrir una sesión: eliges carpeta y herramienta")}
            onClick={onNewSession}
          >
            <PlusIcon />
          </button>
          <button
            className="mini"
            data-tip={t("Volver a la barra ancha")}
            onClick={() => setRail("full")}
          >
            <RowsIcon />
          </button>
        </div>
      ) : (
        <>
      {/* El buscador, y debajo lo que estaba escondiendo.
          Con texto escrito se lleva media barra por delante sin decir nada:
          esconde proyectos enteros y obliga a los demás a salir desplegados,
          así que el clic del logo deja de plegar. Desde fuera eso no se
          distingue de que se hayan borrado (Munir). Ahora el cuadro se ve
          encendido, tiene su X, y una línea dice cuántos faltan. */}
      <div className="finder-caja" data-lleno={!!filter.trim() || undefined}>
        <input
          className="finder"
          placeholder={t("Filtrar proyectos y sesiones")}
          value={filter}
          onChange={(e) => setFilter(e.currentTarget.value)}
        />
        {filter && (
          <button
            className="finder-x"
            data-tip={t("Quitar el filtro")}
            onClick={() => setFilter("")}
          >
            <CloseIcon size={13} />
          </button>
        )}
      </div>
      {filter.trim() && ocultosPorFiltro > 0 && (
        <button className="finder-aviso" onClick={() => setFilter("")}>
          {t("{n} proyectos escondidos por el filtro. Pulsa para verlos.", {
            n: ocultosPorFiltro,
          })}
        </button>
      )}
      {/* Las que trajiste a mano desde el ＋. Salen aunque sean viejas, y hasta
          hoy la única forma de sacarlas era archivarlas una a una.

          Y SE PUEDE CERRAR, que es lo que le faltaba. Este cartel salía siempre
          que hubiera alguna traída, y su único botón las quitaba TODAS de la
          lista: un aviso permanente cuya única acción deshace lo que acabas de
          hacer (Munir, 2026-08-10, con 110 traídas: «me está incitando a que
          quite las sesiones»). Ahora la ✕ lo calla sin tocar ninguna, y si otro
          día traes más vuelve a salir con las nuevas, que eso sí es algo que no
          sabías. */}
      {ui.traidas.length > (ui.traidasVisto ?? 0) && !filter.trim() && (
        <div className="finder-aviso-fila">
          <button
            className="finder-aviso"
            data-tip={t("Dejan de verse las que trajiste a mano. No se borra ninguna.")}
            onClick={() => mutate((prev) => ({ ...prev, traidas: [], traidasVisto: 0 }))}
          >
            {t("{n} traídas a mano. Pulsa para quitarlas de la lista.", {
              n: ui.traidas.length,
            })}
          </button>
          <button
            className="finder-aviso-x"
            data-tip={t("Entendido: dejar de avisar. Las sesiones se quedan donde están.")}
            onClick={() =>
              mutate((prev) => ({ ...prev, traidasVisto: prev.traidas.length }))
            }
          >
            ×
          </button>
        </div>
      )}
      <div className="side-label">
        <span>{t("Workspaces")}</span>
        <span className="rail-tabs">
          <button
            className="mini rail-new"
            data-tip={t("Abrir una sesión: eliges carpeta y herramienta")}
            onClick={onNewSession}
          >
            <PlusIcon />
          </button>
          {/* Two ways to read the same rail: marks, or marks with their names. */}
          <button
            className="mini rail-tab"
            data-active={rail === "logo"}
            data-tip={t("Solo los logos, en grande")}
            onClick={() => setRail("logo")}
          >
            <GridIcon />
          </button>
          <button
            className="mini rail-tab"
            data-active={rail === "full"}
            data-tip={t("Logo y nombre")}
            onClick={() => setRail("full")}
          >
            <RowsIcon />
          </button>
          <button
            className="mini rail-tab"
            data-tip={t("Encogerla del todo: solo los logos, en una tira")}
            onClick={() => setRail("tira")}
          >
            <StripIcon />
          </button>
          {archivedTotal > 0 && (
            <button
              className="mini"
              data-active={showArchived}
              data-tip={
                showArchived
                  ? t("Ocultar las sesiones archivadas")
                  : t("Ver las {n} sesiones archivadas", { n: archivedTotal })
              }
              onClick={() => setShowArchived((v) => !v)}
            >
              <ArchiveIcon />
              {archivedTotal}
            </button>
          )}
          <button className="mini" onClick={refresh} data-tip={t("Releer proyectos y sesiones")}>
            <RefreshIcon />
          </button>
        </span>
      </div>
        </>
      )}
      <div
        className="projects"
        ref={listaRef}
        data-rail={rail}
        onScroll={() => setFlyout(null)}
      >
        {/* Lo fijado, arriba del todo y con su nombre escrito. Se pinta con el
            MISMO `sessionRow` que el resto de la barra —menú del clic derecho,
            arrastre, insignias, todo— para que una sesión no se comporte de una
            manera aquí y de otra dentro de su proyecto.
            El grupo que se le pasa es de mentira y va con `suelto: true` a
            propósito: eso hace que cada fila enseñe su carpeta debajo, que es
            justo lo que hace falta cuando una sesión está fuera de su sitio. */}
        {todo.fijadas.length > 0 && rail === "full" && !tira && !filter.trim() && (
          <div className="fijadas">
            <span className="fijadas-tag">{t("Fijadas")}</span>
            <ul className="sessions">
              {todo.fijadas.map((s) => sessionRow(s, GRUPO_FIJADAS, false))}
            </ul>
          </div>
        )}
        {shown.map((g) => {
          const open = expanded.has(g.name) || filter.trim() !== "";
          const shownCount =
            g.sessions.length +
            (g.vivas?.length ?? 0) +
            (showArchived ? g.archivedSessions.length : 0);

          // Logos only: the mark fills its card and the sessions live in the
          // panel it opens on hover, so the rail stays a wall of marks. La tira
          // pinta lo mismo, en una sola columna y más pequeño: cambia el CSS,
          // no lo que hay debajo, así que el panel del ratón ya funciona ahí.
          if (rail === "logo" || tira) {
            return (
              <button
                key={g.name}
                className="project-logo"
                data-live={g.hasLive}
                data-active={flyout?.name === g.name}
                style={{ ["--c" as string]: hueOf(g.name) }}
                onMouseEnter={(e) => hoverLogo(g.name, e.currentTarget)}
                onMouseLeave={leaveLogo}
                onClick={() => {
                  // A click opens the whole project, which is what he asked
                  // for: the hover already shows what is inside, so the click
                  // has no business just pinning a panel open.
                  keepFlyout();
                  setFlyout(null);
                  onOpenAll(shownName(g.name), g.path, g.sessions);
                }}
                onContextMenu={(e) => showMenu(e, projectMenu(g))}
              >
                <ProjectAvatar name={g.name} src={iconFor(g)} className="pavatar-xl" />
                {/* Only the photos, he said. So no numbers here: just the two
                    things that cannot wait for a hover, one alive and one
                    asking. The counts live in the panel it opens. */}
                {g.hasLive && <span className="logo-live" />}
                {g.waiting > 0 && <span className="logo-asks" />}
              </button>
            );
          }

          return (
            <div key={g.name} className="group">
              {/* Aquí iba una raya de «sin sesiones recientes» que partía la
                  barra en dos. Fuera desde la 0.9.69, a petición de Munir: la
                  barra ya la ordena él a mano desde la 0.9.56, y una raya que
                  parte la lista según la actividad contradice ese orden y hace
                  que un proyecto se mude de sección solo por no haberlo tocado
                  hoy. El dato no se pierde: los que no tienen sesiones siguen
                  yendo detrás por su propio orden (`ordenarProyectos`). */}
              {/* El clic derecho vive en la FILA, no en el botón de la
                  izquierda: las insignias y los botones de acción son hermanos
                  suyos, así que pulsando ahí no aparecía nada y había que
                  apuntar al avatar o al nombre para encontrar el menú. */}
              <div
                className="project"
                data-open={open}
                data-live={g.hasLive}
                // Zona de destino de un arrastre: soltar una sesión aquí la
                // manda a este proyecto aunque su carpeta sea otra.
                data-proyecto={g.name}
                data-suelta={(llevando && sobre === `p:${g.name}`) || undefined}
                // Arrastrándolo se coloca donde quieras, y ahí se queda.
                data-moviendo={moviendoProy === g.name || undefined}
                // El LADO, no un sí/nada: la raya se pinta arriba o abajo según
                // dónde vaya a caer de verdad. Antes iba siempre arriba y
                // mentía cada vez que bajabas un proyecto.
                data-encima={sobreProy?.name === g.name ? sobreProy.lado : undefined}
                style={{ ["--c" as string]: hueOf(g.name) }}
                onContextMenu={(e) => showMenu(e, projectMenu(g))}
                onPointerDown={(e) => proyDown(e, g.name)}
                onPointerMove={proyMove}
                onPointerUp={proyUp}
                onPointerCancel={proyUp}
              >
                <button
                  className="project-main"
                  // Se pulsa Y se agarra: el logo, el nombre y la flecha están
                  // aquí dentro, así que sin esto la fila solo se podía
                  // arrastrar por los pocos píxeles que quedan a la derecha.
                  data-agarre
                  onClick={() => toggle(g.name)}
                  data-tip={
                    g.sessions.length
                      ? `${shownName(g.name)}: ${open ? "plegar" : "ver"} sus ${g.sessions.length} sesiones`
                      : `${shownName(g.name)} no tiene sesiones recientes`
                  }
                >
                  {/* The mark and, on its corner, the one thing that has to be
                      visible without hovering: a session of this project is
                      open right now. It used to float between the name and the
                      counters, where it looked like a glitch. */}
                  <span className="project-mark">
                    <ProjectAvatar name={g.name} src={iconFor(g)} />
                    {g.hasLive && (
                      <span
                        className="mark-live"
                        data-tip={t("Tiene una sesión abierta ahora mismo")}
                      />
                    )}
                  </span>
                  <span className="project-name">{shownName(g.name)}</span>
                  {/* Under the mouse the name steps aside, so the arrow keeps
                      both jobs: it folds the sessions and it counts them. */}
                  <span className="project-caret">
                    {open ? "▾" : "▸"}
                    {g.sessions.length > 0 && ` ${g.sessions.length}`}
                  </span>
                </button>
                <span className="project-badges">
                  {shownCount > 0 && (
                    <span
                      className="badge badge-count"
                      // Las terminales vivas sin historial cuentan aquí: si no,
                      // el cajón de las sueltas podía tener una dentro y salir
                      // sin número, como si estuviera vacío.
                      data-tip={`${shownCount} ${shownCount === 1 ? "sesión reciente" : "sesiones recientes"}`}
                    >
                      {shownCount}
                    </span>
                  )}
                  {g.waiting > 0 && (
                    <span
                      className="badge badge-wait"
                      data-tip={`${g.waiting} ${g.waiting === 1 ? "sesión espera" : "sesiones esperan"} tu respuesta`}
                    >
                      {g.waiting}
                    </span>
                  )}
                </span>
                <FilaBotones className="project-actions">{actionButtons(g)}</FilaBotones>
              </div>
              {open && shownCount > 0 && sessionList(g)}
            </div>
          );
        })}

        {/* Y al final, sin caja que las envuelva, las que no son de ningún
            proyecto. En la pared de marcas siguen teniendo la suya, porque si
            no, en ese modo desaparecerían del panel entero. */}
        {/* La zona existe tambien SIN sueltas mientras llevas una sesion en la
            mano: si solo apareciera cuando ya hay alguna, la primera no tendria
            adonde ir, que es justo lo que Munir seguia sin poder hacer
            (2026-08-08: «sigue sin poder arrastrar la sesion de un proyecto al
            de no sesiones»). */}
        {/* En la pared de marcas y en la tira, su logo: sin el, en esos modos
            desaparecerian del panel entero. Ahi hace falta que HAYA sueltas. */}
        {sueltas && (rail === "logo" || tira) && (
          <>
            <button
              className="project-logo project-logo-sueltas"
              data-live={sueltas.hasLive}
              data-active={flyout?.name === SUELTAS}
              onMouseEnter={(e) => hoverLogo(SUELTAS, e.currentTarget)}
              onMouseLeave={leaveLogo}
              onClick={() => {
                keepFlyout();
                setFlyout(null);
                onOpenAll(t(SUELTAS), "", sueltas.sessions);
              }}
            >
              <span className="logo-sueltas-mark">↯</span>
              {sueltas.hasLive && <span className="logo-live" />}
              {sueltas.waiting > 0 && <span className="logo-asks" />}
            </button>
          </>
        )}
        {!tira && rail !== "logo" && (sueltas || llevando) && (
            <div
              className="sueltas-zona"
              /* Destino de arrastre con nombre propio: aqui una sesion deja de
                 pertenecer a un proyecto. Sin esto, `mirarDestino` veia dentro
                 el `data-fuera` del saco o una fila cualquiera, y nunca se
                 llegaba a la rama que la suelta. */
              data-sueltas=""
              data-suelta={(llevando && sobre === "sueltas") || undefined}
              data-lista={llevando || undefined}
            >
              <div className="side-divider side-divider-sueltas">
                {/* «sin proyecto» decía de dónde NO son, que es la mitad menos
                    útil: aquí caen las que no encajan en ninguna carpeta de la
                    lista, y lo que hace falta saber es qué son (Munir,
                    2026-08-08). */}
                {t("sesiones no agrupadas")}
                <span className="sueltas-n">
                  {sueltas ? sueltas.sessions.length + (sueltas.vivas?.length ?? 0) : 0}
                </span>
              </div>
              {sueltas ? (
                sessionList(sueltas)
              ) : (
                <p className="sueltas-pista">{t("Aquí deja de ser de ningún proyecto")}</p>
              )}
            </div>
        )}

        {/* Lo que quitaste de la barra, al final y plegado. Ocultar algo sin
            una forma visible de recuperarlo es el mismo error que borrar sin
            avisar, solo que más pequeño: mientras haya uno oculto, esta línea
            está aquí. En la pared de marcas y en la tira no cabe un renglón de
            texto, y tampoco hacen falta dos sitios donde buscarlo. */}
        {!tira && rail !== "logo" && proyectosOcultos.length > 0 && (
          <div className="ocultos-zona">
            <button
              className="ocultos-cab"
              data-open={verOcultos}
              onClick={() => setVerOcultos((v) => !v)}
            >
              <EyeOffIcon size={13} />
              <span>{t("Ocultos")}</span>
              <span className="sueltas-n">{proyectosOcultos.length}</span>
              <ChevronIcon size={12} up={verOcultos} />
            </button>
            {verOcultos && (
              <div className="ocultos-lista">
                {proyectosOcultos.map((g) => (
                  <div key={g.name} className="oculto" title={g.path}>
                    <ProjectAvatar
                      name={g.name}
                      src={iconFor(g)}
                      className="pavatar-mini"
                    />
                    <span className="oculto-nombre">{shownName(g.name)}</span>
                    <button
                      className="mini"
                      data-tip={t("Devolverlo a la barra")}
                      onClick={() => devolverProyecto(g.name)}
                    >
                      <EyeIcon size={13} />
                    </button>
                  </div>
                ))}
                <p className="ocultos-pie">{t("Sus carpetas siguen en el disco, intactas.")}</p>
              </div>
            )}
          </div>
        )}

        {/* Abajo del todo, lo que la barra estaba escondiendo por viejo.
            La barra corta por edad (una semana) para no crecer sin fin, y ese
            corte era mudo: una conversación de hace ocho días no estaba y nada
            decía que existiera. Ahora dice cuántas son y se traen con un clic
            (Munir, 2026-08-08). No hay botón para volver a esconderlas porque
            se van solas al reiniciar: es una mirada al pasado, no un ajuste. */}
        {!tira && rail !== "logo" && viejasOcultas > 0 && (
          <button className="mas-viejas" onClick={() => setVerViejas(true)}>
            {t("Cargar {n} sesiones más antiguas", { n: viejasOcultas })}
          </button>
        )}
      </div>
      {/* La tarjeta de actualizar, al final de la barra y FUERA de la lista con
          scroll: si fuera dentro, con veinte proyectos habría que bajar hasta
          el fondo para enterarse de que hay versión nueva. Este es el sitio que
          pidió Munir y el de su referencia, la app de escritorio de Claude.
          En la tira y en la pared de marcas no cabe: allí sigue avisando el
          globo de Windows, que es lo que ya hacía. */}
      {!tira && rail !== "logo" && <UpdateBar />}
      {/* The browser's own file dialog: no extra Tauri plugin for one picker. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          takeLogo(e.currentTarget.files?.[0]);
          e.currentTarget.value = "";
        }}
      />
      {error && <p className="side-error">{error}</p>}
      {!tira && (
        <footer className="side-foot">
          {sinRaiz()
            ? t("tus proyectos, uno a uno · sesiones de ~/.claude")
            : `${raiz()} · ${t("sesiones de ~/.claude")}`}
        </footer>
      )}

      {/* What the logo hides: its name, its buttons and its sessions, one
          mouse away. Clicking the logo pins it so it can be used calmly. */}
      {flyout &&
        flyGroup &&
        host &&
        createPortal(
          <div
            ref={flyRef}
            className="rail-flyout"
            data-pinned={flyout.pinned}
            style={{ top: flyout.top, left: flyout.left }}
            onMouseEnter={keepFlyout}
            onMouseLeave={leaveLogo}
            onClick={(e) => {
              const el = e.target as HTMLElement;
              // Anything that opens a terminal takes the panel with it; the
              // rename and the ⋯ menu need it to stay.
              if (el.closest(".session") || el.closest(".fly-actions")) setFlyout(null);
            }}
          >
            {/* His mock, left to right: the photo, the name in its long box,
                how many sessions, and the one that needs him. */}
            <header className="fly-head" style={{ height: flyout.size }}>
              {/* La foto es la foto y ya está. Fue el botón de «abrir todas»
                  durante un tiempo, y eso era un botón sin nombre: nadie
                  adivina que una foto abre ocho terminales, y quien lo
                  descubría era por haberlas abierto sin querer. Ahora esa
                  acción tiene su botón, con su nombre, ahí abajo. */}
              <span className="fly-photo" style={{ width: flyout.size }}>
                <ProjectAvatar
                  name={flyGroup.name}
                  src={iconFor(flyGroup)}
                  className="pavatar-xl"
                />
              </span>
              {/* Two lines of plain text, no boxes: what it is, and what is
                  inside it. Counters as a sentence beat counters in coloured
                  squares, which have to be decoded. */}
              <span className="fly-id">
                <span className="fly-name">
                  {shownName(flyGroup.name)}
                  {flyGroup.hasLive && (
                    <span className="live-dot" data-tip="sesión abierta ahora" />
                  )}
                </span>
                <span className="fly-sub">
                  {flyGroup.sessions.length === 0
                    ? t("sin sesiones recientes")
                    : `${flyGroup.sessions.length} ${
                        flyGroup.sessions.length === 1 ? t("sesión") : t("sesiones")
                      }`}
                  {flyGroup.waiting > 0 && (
                    <>
                      <span className="fly-dot-sep">·</span>
                      <span className="fly-waiting">
                        {flyGroup.waiting} {t("esperando")}
                      </span>
                    </>
                  )}
                </span>
              </span>
              {/* Dónde está de verdad. Es el único dato que la fila de la barra
                  no puede enseñar nunca por falta de sitio, y es el que
                  distingue dos proyectos que se llaman parecido. */}
              {!flyGroup.suelto && flyGroup.path && (
                <span className="fly-path">{flyGroup.path}</span>
              )}
            </header>
            <FilaBotones className="fly-actions">{actionButtons(flyGroup)}</FilaBotones>
            {/* Retomar el día entero de un proyecto de una vez. Encabeza la
                lista que va a abrir, que es donde se entiende qué hace, y con
                el número escrito para que no haya sorpresas: son terminales de
                verdad, no pestañas. Desde dos sesiones para arriba; con una,
                abrirla es pulsarla. */}
            {flyGroup.sessions.length > 1 && (
              <button
                className="fly-todas"
                onClick={() => {
                  setFlyout(null);
                  onOpenAll(shownName(flyGroup.name), flyGroup.path, flyGroup.sessions);
                }}
              >
                <GridIcon size={13} />
                {t("Abrir sus {n} sesiones a la vez", {
                  n: Math.min(flyGroup.sessions.length, topeAbrirTodas),
                })}
              </button>
            )}
            {flyGroup.sessions.length ? (
              sessionList(flyGroup)
            ) : (
              <p className="fly-empty">{t("Sin sesiones recientes")}</p>
            )}
            {/* Lo que le haces AL proyecto, separado de lo que abres DENTRO.
                Antes todo esto vivía solo en el clic derecho, que es un gesto
                que hay que saberse: aquí está a la vista y en su propio pie,
                sin competir con los botones de arriba. */}
            {!flyGroup.suelto && (
              <footer className="fly-manage">
                <button
                  className="fly-mini"
                  data-tip={t("Cambiar el nombre que se ve")}
                  onClick={() =>
                    setNaming({ name: flyGroup.name, value: shownName(flyGroup.name) })
                  }
                >
                  <PencilIcon size={13} />
                </button>
                <button
                  className="fly-mini"
                  data-tip={
                    ui.projectIcon[flyGroup.name] ? t("Cambiar su logo") : t("Ponerle un logo")
                  }
                  onClick={() => askLogo(flyGroup.name)}
                >
                  <ImageIcon size={13} />
                </button>
                {flyGroup.archivedSessions.length > 0 && (
                  <button
                    className="fly-mini"
                    data-tip={t("Ver las archivadas")}
                    onClick={() => setShowArchived((v) => !v)}
                  >
                    <ArchiveIcon size={13} /> {flyGroup.archivedSessions.length}
                  </button>
                )}
                <span className="fly-manage-sep" />
                {/* La de todos los días: sacarlo de la barra sin tocar el
                    disco. Va ANTES que la papelera y sin color de peligro,
                    porque es la que se quiere el 99% de las veces. */}
                <button
                  className="fly-mini"
                  data-tip={t("Quitar de Adeorq: sale de la barra, la carpeta no se toca")}
                  onClick={() => quitarDeAdeorq(flyGroup.name)}
                >
                  <EyeOffIcon size={13} />
                </button>
                <button
                  className="fly-mini fly-mini-danger"
                  data-tip={t("Borrar su carpeta del disco: se va a la papelera de Windows")}
                  onClick={() => {
                    setFlyout(null);
                    pedirTirar(flyGroup);
                  }}
                >
                  <TrashIcon size={13} />
                </button>
              </footer>
            )}
          </div>,
          host,
        )}

      {/* Al `body` por un portal, y no ahí donde cae en el árbol.
          El sidebar es cristal (`backdrop-filter`), y eso le da una capa
          propia: cualquier z-index de dentro compite solo contra sus hermanos
          del sidebar, así que este menú se pintaba DEBAJO de la terminal de al
          lado por muy alto que fuese el número. Munir lo dijo cinco veces y las
          cuatro primeras se le buscó al color, que llevaba bien desde el día 9.
          Es el mismo arreglo que ya llevan `.ctx-menu` y `.tip` (Overlays.tsx)
          y el panel desplegable de aquí arriba. `position: fixed` sigue
          midiendo contra la ventana, así que las coordenadas no cambian, y el
          cierre por clic fuera busca `.sess-menu` en el DOM real, que el portal
          no mueve de sitio. */}
      {menu && createPortal(
        <div className="sess-menu" style={{ left: menu.x, top: menu.y }}>
          {menu.mode === "main" ? (
            <>
              <button className="menu-item" onClick={() => startRename(menu.s)}>
                <PencilIcon size={13} /> {t("Renombrar")}
              </button>
              <button
                className="menu-item"
                onClick={() => setMenu({ ...menu, mode: "group" })}
              >
                <GroupIcon size={13} /> {t("Mover a grupo…")}
              </button>
              <button
                className="menu-item menu-warn"
                onClick={() => askArchive(menu.s, menu.projectPath)}
              >
                <ArchiveIcon size={13} /> {t("Archivar")}
              </button>
            </>
          ) : (
            <>
              <div className="menu-label">{t("Grupos de {p}", { p: menu.s.project })}</div>
              {menuGroups.map((pg) => (
                <button
                  key={pg.id}
                  className="menu-item"
                  data-active={currentGroupId === pg.id}
                  onClick={() => assignGroup(menu.s.id, pg.id)}
                >
                  {currentGroupId === pg.id ? "✓ " : ""}
                  {pg.name}
                </button>
              ))}
              {currentGroupId && (
                <button
                  className="menu-item"
                  onClick={() => assignGroup(menu.s.id, null)}
                >
                  {t("Quitar del grupo")}
                </button>
              )}
              <div className="menu-new">
                <input
                  className="finder menu-input"
                  placeholder={t("Grupo nuevo")}
                  value={newGroup}
                  autoFocus={menuGroups.length === 0}
                  onChange={(e) => setNewGroup(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createGroup(menu.s.project, menu.s.id);
                    else if (e.key === "Escape") setMenu(null);
                  }}
                />
                <button
                  className="np-btn menu-create"
                  disabled={!newGroup.trim()}
                  onClick={() => createGroup(menu.s.project, menu.s.id)}
                >
                  {t("Crear")}
                </button>
              </div>
            </>
          )}
        </div>,
        document.body,
      )}

      {naming && (
        <div className="modal-overlay" {...propsDeVelo(bajoEnVelo, () => setNaming(null))}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{t("Cómo se llama aquí")}</h3>
            <p className="modal-text modal-dim">
              {t(
                "Cambia solo lo que ves en Adeorq. La carpeta se queda como está, y por eso tus sesiones de Claude siguen encontrándola: van por su ruta, no por su nombre.",
              )}
            </p>
            <p className="modal-text">
              {t("Carpeta")}: <strong>{naming.name}</strong>
            </p>
            <input
              className="finder name-input"
              autoFocus
              value={naming.value}
              placeholder={naming.name}
              onChange={(e) => setNaming({ ...naming, value: e.currentTarget.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveAlias();
                else if (e.key === "Escape") setNaming(null);
              }}
            />
            <div className="modal-actions">
              <button className="mini modal-cancel" onClick={() => setNaming(null)}>
                {t("Cancelar")}
              </button>
              <button className="np-btn" onClick={saveAlias}>
                {t("Guardar")}
              </button>
            </div>
          </div>
        </div>
      )}

      {tirando && (
        <div className="modal-overlay" {...propsDeVelo(bajoEnVelo, () => setTirando(null))}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{t("Borrar la carpeta del disco")}</h3>
            <p className="modal-text">
              {t(
                "Esto borra del disco la CARPETA de «{n}», con todo lo que tenga dentro. Va a la papelera de Windows, así que se recupera desde el escritorio, pero deja de estar en su sitio y lo que la use dejará de encontrarla.",
              ).replace("{n}", shownName(tirando.name))}
            </p>
            <p className="modal-text modal-dim">{tirando.path}</p>
            {tirando.sessions.length + tirando.archivedSessions.length > 0 && (
              <div className="modal-warn">
                <p className="modal-warn-title">
                  {t(
                    "⚠ Tiene {n} sesiones de Claude. Sus conversaciones NO se borran: viven en tu carpeta de Claude, no en esta. Pero se quedarán apuntando a una carpeta que ya no está.",
                  ).replace(
                    "{n}",
                    String(tirando.sessions.length + tirando.archivedSessions.length),
                  )}
                </p>
              </div>
            )}
            {/* La salida buena, justo antes de la casilla: casi nadie que llega
                aquí quiere borrar una carpeta, quiere dejar de ver el proyecto.
                Y con el botón puesto, no hay que saberse el otro camino. */}
            <p className="modal-text">
              {t("Si lo que quieres es dejar de verlo en la barra, no hace falta borrar nada:")}
            </p>
            <button
              className="mini modal-salida"
              onClick={() => {
                const g = tirando;
                setTirando(null);
                quitarDeAdeorq(g.name);
              }}
            >
              <EyeOffIcon size={13} /> {t("Quitar de Adeorq, sin tocar la carpeta")}
            </button>
            <p className="modal-text">
              {t("Escribe «{n}» para confirmar:").replace("{n}", shownName(tirando.name))}
            </p>
            <input
              className="finder name-input"
              autoFocus
              value={tirandoTexto}
              placeholder={shownName(tirando.name)}
              onChange={(e) => setTirandoTexto(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") tirarAhora();
                else if (e.key === "Escape") setTirando(null);
              }}
            />
            <div className="modal-actions">
              <button className="mini modal-cancel" onClick={() => setTirando(null)}>
                {t("Cancelar")}
              </button>
              <button
                // Rojo, que borra una carpeta del disco. Ponía `danger`, que no
                // existe en App.css: salía del mismo azul que «Cancelar».
                className="np-btn modal-danger"
                disabled={!tirarDesbloqueado}
                onClick={tirarAhora}
              >
                {t("Borrar la carpeta")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="modal-overlay" {...propsDeVelo(bajoEnVelo, () => setConfirm(null))}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{t("Archivar sesión")}</h3>
            <p className="modal-text">
              «{confirm.s.title}» se ocultará de la lista. Es reversible (botón ⊟
              arriba) y no borra nada del disco: ni la conversación ni tus archivos.
            </p>
            {confirm.dirty === null ? (
              <p className="modal-text modal-dim">Comprobando si el proyecto tiene
              trabajo sin guardar…</p>
            ) : confirm.dirty.isRepo && confirm.dirty.total > 0 ? (
              <div className="modal-warn">
                <p className="modal-warn-title">
                  ⚠ Este proyecto tiene {confirm.dirty.total}{" "}
                  {confirm.dirty.total === 1 ? "archivo" : "archivos"} con cambios sin
                  guardar en git:
                </p>
                <ul className="modal-files">
                  {confirm.dirty.files.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                  {confirm.dirty.total > confirm.dirty.files.length && (
                    <li>… y {confirm.dirty.total - confirm.dirty.files.length} más</li>
                  )}
                </ul>
                <p className="modal-warn-note">
                  Adeorq no los toca. Pero si esta sesión era la que trabajaba en
                  ellos, guárdalos (commit) antes de despedirla. La app oficial de
                  Claude, al archivar, los borraría sin avisar; aquí están a salvo.
                </p>
              </div>
            ) : (
              <p className="modal-ok">
                ✓ {confirm.dirty.isRepo
                  ? "El proyecto está limpio: todo su trabajo está guardado en git."
                  : "Esta carpeta no usa git, no hay nada que comprobar."}
              </p>
            )}
            <div className="modal-actions">
              <button className="mini modal-cancel" onClick={() => setConfirm(null)}>
                {t("Cancelar")}
              </button>
              <button
                className="np-btn"
                disabled={confirm.dirty === null}
                onClick={() => doArchive(confirm.s.id)}
              >
                {t("Archivar")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Short on purpose. It is one sentence and one button, because the
          recycle bin is the real safety net: the dialog is here to stop a
          misclick, not to make him read. */}
      {binning && (
        <div className="modal-overlay" {...propsDeVelo(bajoEnVelo, () => setBinning(null))}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{t("Borrar la sesión")}</h3>
            <p className="modal-text">
              {t(
                "«{n}» se va a la papelera de Windows. Desaparece de Adeorq y también de Claude Code, así que ya no podrás retomarla. Si te arrepientes, está en la papelera.",
                { n: binning.title },
              )}
            </p>
            {binning.live && (
              <div className="modal-warn">
                <p className="modal-warn-title">⚠ {t("Esta sesión está abierta ahora mismo.")}</p>
                <p className="modal-warn-note">
                  La terminal sigue funcionando, pero su conversación deja de estar en
                  disco: al cerrarla no habrá nada que retomar.
                </p>
              </div>
            )}
            <div className="modal-actions">
              <button className="mini modal-cancel" onClick={() => setBinning(null)}>
                {t("Cancelar")}
              </button>
              <button className="np-btn modal-danger" onClick={() => doDelete(binning)}>
                {t("Borrar")}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
