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
import { moverProyecto, ordenarProyectos } from "../lib/ordenBarra";
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
  EnterIcon,
  EyeIcon,
  EyeOffIcon,
  GridIcon,
  GroupIcon,
  ImageIcon,
  PencilIcon,
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
    loadUiState().then(setUi).catch(() => {});
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

  const mutate = (fn: (prev: UiState) => UiState) => {
    setUi((prev) => {
      const next = fn(prev);
      void saveUiState(next).catch((e) => setError(String(e)));
      return next;
    });
  };

  const archived = useMemo(() => new Set(ui.archived), [ui.archived]);
  const traidas = useMemo(() => new Set(ui.traidas), [ui.traidas]);
  /* Los proyectos que quitaste de la barra. Ojo con el nombre: `gruposOcultos`,
     que llega por props, es otra cosa (los grupos de sesiones plegados). */
  const ocultos = useMemo(() => new Set(ui.hiddenProjects), [ui.hiddenProjects]);

  const todo = useMemo<{ proyectos: Group[]; sueltas: Group | null }>(() => {
    /** Las conversaciones que tienes AHORA en un panel. Lo dice el propio
        comando del panel, que lleva su `--resume <id>` dentro. */
    const enPantalla = new Set(
      abiertas.map((a) => sessionIdOf(a.command)).filter((x): x is string => !!x),
    );
    // Las de más de una semana no se enseñan... salvo que las tengas abiertas o
    // que las hayas traído tú desde el ＋. Desde que ese cuadro sabe buscar
    // entre las viejas, la regla de la semana las hacía desaparecer justo
    // después de elegirlas: ir a por una de hace un mes y no verla en ningún
    // lado. Lo que está en pantalla, y lo que has pedido a mano, mandan sobre
    // la edad.
    const fresh = sessions.filter(
      (s) => s.fresh !== "muerta" || enPantalla.has(s.id) || traidas.has(s.id),
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
      const vivas = vivasDe.get(name) ?? [];
      return {
        name,
        path,
        hasGit,
        sessions: active,
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
      sueltas.suelto = true;
      sueltas.vivas = vivasSueltas;
      if (vivasSueltas.length) sueltas.hasLive = true;
    }

    // El orden, con sus reglas y sus casos, en `lib/ordenBarra.ts`.
    return { proyectos: ordenarProyectos(result, ui.projectOrder), sueltas };
  }, [projects, sessions, archived, traidas, abiertas, ui.sessionProject, ui.projectOrder]);

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
    setMenu({ s, projectPath, x: r.right + 4, y: r.top, mode: "main" });
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
    deleteSession(s.folder, s.id)
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
  const arrastre = useRef<{ id: string; x: number; y: number; activo: boolean } | null>(null);
  /** Bandera de un instante: distingue el clic que abre del que acaba de
      soltar un arrastre, porque el navegador dispara los dos igual. */
  const soltoRecien = useRef(false);
  const [llevando, setLlevando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  const sesionDown = (e: React.PointerEvent<HTMLLIElement>, id: string) => {
    if ((e.target as HTMLElement).closest(".sess-more, .sess-bin, input")) return;
    arrastre.current = { id, x: e.clientX, y: e.clientY, activo: false };
  };

  // Red de seguridad del arrastre. Si el puntero se levanta en un sitio que no
  // es la fila (fuera de la ventana, sobre otra pieza, o porque la captura se
  // perdió al repintar), `sesionUp` no llega a correr nunca: el arrastre se
  // queda vivo, la zona de destino iluminada, y a partir de ahí el resto de la
  // barra deja de responder a los clics. Pasó a la primera (Munir, 2026-08-02).
  useEffect(() => {
    const limpiar = () => {
      if (!arrastre.current) return;
      arrastre.current = null;
      pararAuto();
      setLlevando(null);
      setSobre(null);
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
  const [sobreProy, setSobreProy] = useState<string | null>(null);

  const proyDown = (e: React.PointerEvent<HTMLDivElement>, name: string) => {
    // Los botones de la fila (plegar, insignias, ⋯) siguen siendo botones.
    if ((e.target as HTMLElement).closest("button, input")) return;
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
    }
    cercaDelBorde(e.clientX, e.clientY, a.name);
    const bajo = document.elementFromPoint(e.clientX, e.clientY);
    const destino = bajo?.closest<HTMLElement>("[data-proyecto]")?.dataset.proyecto;
    setSobreProy(destino && destino !== a.name ? destino : null);
  };

  const proyUp = () => {
    const a = arrProy.current;
    const destino = sobreProy;
    arrProy.current = null;
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

  /** Qué hay debajo del puntero, para pintar dónde va a caer. */
  const mirarDestino = (x: number, y: number, id: string) => {
    const bajo = document.elementFromPoint(x, y);
    const grupo = bajo?.closest<HTMLElement>("[data-grupo]")?.dataset.grupo;
    const fila = bajo?.closest<HTMLElement>("[data-sesion]")?.dataset.sesion;
    const proyecto = bajo?.closest<HTMLElement>("[data-proyecto]")?.dataset.proyecto;
    // El grupo primero: está DENTRO de un proyecto, así que soltar sobre él
    // tiene que significar el grupo y no el proyecto que lo contiene.
    if (grupo) setSobre(grupo);
    else if (fila && fila !== id) setSobre(`s:${fila}`);
    else if (proyecto) setSobre(`p:${proyecto}`);
    else setSobre(null);
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

  const sesionMove = (e: React.PointerEvent<HTMLLIElement>) => {
    const a = arrastre.current;
    if (!a) return;
    if (!a.activo) {
      // Seis píxeles: por debajo de eso es el temblor de un clic, no un gesto.
      if (Math.hypot(e.clientX - a.x, e.clientY - a.y) < 6) return;
      a.activo = true;
      setLlevando(a.id);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    cercaDelBorde(e.clientX, e.clientY, a.id);
    mirarDestino(e.clientX, e.clientY, a.id);
  };

  const sesionUp = (e: React.PointerEvent<HTMLLIElement>, proyecto: string) => {
    const a = arrastre.current;
    const destino = sobre;
    arrastre.current = null;
    pararAuto();
    setLlevando(null);
    setSobre(null);
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
        g.sessions[0]?.ago ? `última ${g.sessions[0].ago}` : null,
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
        data-sesion={s.id}
        data-llevando={llevando === s.id || undefined}
        data-suelta={(llevando && sobre === `s:${s.id}`) || undefined}
        onPointerDown={(e) => sesionDown(e, s.id)}
        onPointerMove={sesionMove}
        onPointerUp={(e) => sesionUp(e, g.name)}
        onPointerCancel={(e) => sesionUp(e, g.name)}
      >
        <button
          className="session"
          onContextMenu={(e) =>
            showMenu(e, isArchived
              ? [{ label: t("Restaurar: vuelve a la lista normal"), onClick: () => unarchive(s.id) }]
              : [
                  { label: t("Retomar la sesión aquí"), onClick: () => onResume(s) },
                  { label: "", separator: true },
                  { label: t("Renombrar"), icon: <PencilIcon size={14} />, onClick: () => startRename(s) },
                  { label: t("Mover a grupo…"), icon: <GroupIcon size={14} />, onClick: () => openMenu(e, s, g.path) },
                  // Solo para las que mandaste tú aquí: deshacerlo arrastrando
                  // funciona, pero hay que saber que se puede arrastrar.
                  ...(ui.sessionProject[s.id]
                    ? [
                        {
                          label: t("Sacarla de este proyecto"),
            icon: <UnlinkIcon size={14} />,
                          onClick: () => devolverASueltas(s.id),
                        },
                      ]
                    : []),
                  { label: t("⊟ Archivar"), danger: true, onClick: () => askArchive(s, g.path) },
                  {
                    label: t("Borrar la sesión"),
            icon: <TrashIcon size={14} />,
                    danger: true,
                    onClick: () => {
                      setMenu(null);
                      setBinning(s);
                    },
                  },
                ])
          }
          data-tip={`${s.title}\n${s.ago}${s.live ? " · abierta ahora" : ""}${
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
          <span className="session-ago">{s.ago}</span>
        </button>
        {/* La carpeta, y a la vez el botón de ascenderla a proyecto. Empezó
            siendo dos cosas —una segunda línea bajo el título y un ⊞ aparte— y
            las dos rompían la fila: la línea de más la hacía distinta de todas
            las demás de la barra, y un cuarto botón dejaba el título en cuatro
            letras (Munir, 2026-08-02). Una pastilla en línea, como el rol de
            una cuadrilla, dice dónde trabaja y se pulsa para hacerla tuya. */}
        {s.cwd && (g.suelto || ui.sessionProject[s.id]) && !isArchived && (
          <button
            className="sess-donde"
            data-tip={`${s.cwd}\n${t("Pulsa para convertirla en un proyecto del panel")}`}
            onClick={() => ascender(s.cwd)}
          >
            {carpetaDe(s.cwd)}
          </button>
        )}
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
      <ul className="sessions">
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
                  // Pulsar el grupo ABRE sus sesiones, igual que pulsar un
                  // proyecto abre las suyas. Estaba puesto para plegar, y por
                  // eso «no se abría el grupo» por más que se pulsara: hacía
                  // otra cosa (Munir, 2026-08-02). Plegar tiene su ▴ al lado.
                  data-tip={t("Abrir sus {n} sesiones a la vez", { n: inside.length })}
                  disabled={inside.length === 0}
                  onClick={() => onOpenAll(pg.name, g.path, inside, pg.id)}
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
                <ul className="sessions sgroup-list">
                  {inside.map((s) => sessionRow(s, g, false))}
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
        {loose.map((s) => sessionRow(s, g, false))}
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
      <input
        className="finder"
        placeholder={t("Filtrar proyectos y sesiones")}
        value={filter}
        onChange={(e) => setFilter(e.currentTarget.value)}
      />
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
        {shown.map((g, i) => {
          const open = expanded.has(g.name) || filter.trim() !== "";
          const firstQuiet =
            g.sessions.length === 0 &&
            i > 0 &&
            shown[i - 1].sessions.length > 0;
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
              {firstQuiet && (
                <div className="side-divider">{t("sin sesiones recientes")}</div>
              )}
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
                data-encima={sobreProy === g.name || undefined}
                style={{ ["--c" as string]: hueOf(g.name) }}
                onContextMenu={(e) => showMenu(e, projectMenu(g))}
                onPointerDown={(e) => proyDown(e, g.name)}
                onPointerMove={proyMove}
                onPointerUp={proyUp}
                onPointerCancel={proyUp}
              >
                <button
                  className="project-main"
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
        {sueltas &&
          (rail === "logo" || tira ? (
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
          ) : (
            <div className="sueltas-zona">
              <div className="side-divider side-divider-sueltas">
                {t("sin proyecto")}
                <span className="sueltas-n">
                  {sueltas.sessions.length + (sueltas.vivas?.length ?? 0)}
                </span>
              </div>
              {sessionList(sueltas)}
            </div>
          ))}

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
      </div>
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

      {menu && (
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
                {t("⊟ Archivar")}
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
        </div>
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
