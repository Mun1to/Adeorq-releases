import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import Sidebar from "./components/Sidebar";
import SkillsPanel from "./components/SkillsPanel";
import ArchivosPanel from "./components/ArchivosPanel";
import PanelDerecho, { type Cara } from "./components/PanelDerecho";
import EditorPane from "./components/EditorPane";
import WebPane from "./components/WebPane";
import TerminalPane, { FONDO_EVENTO, SOLTADO_EVENTO } from "./components/TerminalPane";
import PanelView from "./components/PanelView";
import Foreman, { type ForemanExec } from "./components/Foreman";
import AvisoCuota from "./components/AvisoCuota";
import Vigia from "./components/Vigia";
import SettingsView from "./components/SettingsView";
import CommandsView from "./components/CommandsView";
import CanvasView, { type CanvasPane } from "./components/CanvasView";
import ChatView from "./components/ChatView";
import AgendaView from "./components/AgendaView";
import MemoriaView from "./components/MemoriaView";
import NewSession, { type Launch } from "./components/NewSession";
import Onboarding from "./components/Onboarding";
import Orbe from "./components/Orbe";
import RepartoView from "./components/RepartoView";
import Tour from "./components/Tour";
import AccountsView from "./components/AccountsView";
import { Overlays } from "./components/Overlays";
import LayoutPicker from "./components/LayoutPicker";
import CrewBoard from "./components/CrewBoard";
import Fondo from "./components/Fondo";
import { ObjetivosFlotante } from "./components/Objetivos";
import Pulso from "./components/Pulso";
import Estadisticas from "./components/Estadisticas";
import { IconoObjetivos } from "./components/IconosSeccion";
import {
  FONDO_DESENFOQUE_KEY,
  FONDO_OPACIDAD_KEY,
  leerFondo,
  ponerFondo,
  quitarFondo,
} from "./lib/fondo";
import { empezarRedimension, terminarRedimension } from "./lib/redimension";
import { aQuienLeToca, encolar, sacarDeCola, tocaDesmaximizar } from "./lib/saltos";
import { guardarEncuadre, leerEncuadre, type Encuadre } from "./lib/encuadre";
import { guardarCabecera, leerCabecera, visibles, type Cabecera } from "./lib/cabecera";
import {
  AccountIcon,
  AgendaIcon,
  CanvasIcon,
  ChatIcon,
  CloseIcon,
  CockpitIcon,
  EstadoIcon,
  CommandIcon,
  MemoryIcon,
  MinimizeIcon,
  UnminimizeIcon,
  PanelIcon,
  PlusIcon,
  SettingsIcon,
  StreamIcon,
} from "./components/Icons";
import {
  DISCORD_KEY,
  loadDiscord,
  useDiscordPresence,
  type DiscordConfig,
} from "./lib/discord";
import {
  addPane as layoutAdd,
  aplicarVistas,
  applyPreset,
  presetFor,
  rects as layoutRects,
  removePane as layoutRemove,
  edgeAt,
  floorFor,
  MIN_PANE_H,
  MIN_PANE_W,
  movePane,
  resizeCol,
  resizeRow,
  swapPanes,
  type Col,
  type Edge,
  type Preset,
} from "./lib/layout";
import NowPlaying from "./components/NowPlaying";
import {
  detectLang,
  LangContext,
  LANG_KEY,
  makeT,
  THEME_KEY,
  type Lang,
  type ThemeId,
} from "./lib/i18n";
import {
  MAIN_ACCOUNT,
  mainAccount,
  accountDir,
  cliEffort,
  findAgy,
  forgetAccount,
  killPty,
  transcriptExists,
  saveEncargo,
  loadUiState,
  saveUiState,
  writePty,
  listProjects,
  mcpReply,
  onPedidoMcp,
  sacarPanel,
  onVuelvePanel,
  anotarRastro,
  carpetaClaude,
  renameSession,
  type Account,
  type Project,
  type SessionInfo,
  type PaneStatus,
  type RailMode,
  type WorkState,
} from "./lib/pty";
import { leerPerfil, raiz, tocarPerfil } from "./lib/perfil";
import { exigenciaDeRol, modoAviso, recetar } from "./lib/router";
import { cerebroPorDefecto } from "./lib/models";
import { acabaDeReclamar, PINTA } from "./lib/estados";
import { nombreDeRuta } from "./lib/arbol";
import { fotoRapida, parteDelEquipo } from "./lib/mundo";
import { NOTIFY_KEY, type NotifyMode } from "./lib/notify";
import { bonito, useRamPanes } from "./lib/ram";
import { apagon, aplicarApagon } from "./lib/temasTerm";
import { aplicarRendimiento, debeAhorrar, prefRendimiento } from "./lib/rendimiento";
import { powershellCommand, sessionIdOf, shellCommand } from "./lib/comandos";
import { entornoDe } from "./lib/apikeys";
import { kindDeComando } from "./components/KindIcon";
import { guardarAtajos, leerAtajos, type Atajos } from "./lib/atajos";
import { tecleandoEnOtro } from "./lib/tecleando";
import { cancelaMudanza, empiezaMudanza } from "./lib/mudanza";
import { lineaDeArranque, PROVIDERS, providerOf, sabe, type Provider } from "./lib/providers";
import { planDeArranque, type Peticion, type Plan } from "./lib/arranque";
import { actaDeRelevo } from "./lib/relevo";
import {
  ARRANCAN_CON_ENCARGO,
  carpetaDe,
  cliPedido,
  nombreDe,
  parteDeApertura,
  type PedidoMcp,
} from "./lib/supremo";
import { type Hit } from "./lib/redact";
import "@xterm/xterm/css/xterm.css";
import "./App.css";

interface Pane {
  id: number;
  cwd: string;
  name: string;
  command?: string[];
  /** Which account it was born with: CLAUDE_CONFIG_DIR, set once at spawn. */
  env?: Record<string, string>;
  account?: string;
  /** La cuadrilla a la que pertenece, si nació dentro de un reparto. Sirve
      para que se VEA que esas terminales van juntas: seis paneles iguales no
      dicen que estén trabajando en lo mismo. */
  team?: Team;
  /** El grupo de la barra lateral del que salió, si vino de abrir uno entero.
      Es lo que permite tratar un grupo como un espacio de trabajo: enseñar el
      que estás usando y apartar los demás sin cerrarlos. */
  grupo?: string;
  shadow?: boolean;
  /** Si esto está puesto, el hueco no es una terminal: son ESOS archivos
      abiertos, con pestañas. Munir eligió esta colocación tocando un prototipo
      el 2026-08-15, y el motivo es su propio eje: el archivo se queda al lado
      del agente que lo está escribiendo. Todo lo que trata un pane como un
      proceso (matarlo, medir su RAM, leerle el estado) se lo encuentra vacío y
      no pasa nada: preguntar por un id que no tiene proceso ya devolvía nada. */
  archivos?: string[];
  /** Cuál de ellos se está viendo. */
  activo?: string;
  /** Y si esto está puesto, el hueco es una vista previa de esa dirección. */
  web?: string;
  /** Todas sus pestañas y cuál se ve. `web` sigue siendo la activa, para que
      todo lo que ya miraba «¿es un panel web?» siga mirando lo mismo. */
  webTabs?: string[];
  webActiva?: number;
}

/** Una cuadrilla: varias terminales repartiéndose una sola tarea. */
export interface Team {
  id: string;
  /** El objetivo común, para poder enseñarlo en cada panel. */
  objetivo: string;
  /** El color con el que se marcan todos sus paneles. */
  color: string;
  /** Qué puesto ocupa este panel dentro de la cuadrilla. */
  rol: string;
  /** Lo que se le mandó a ESTE puesto, no a la cuadrilla. El objetivo de
      arriba es común a todos y por eso no distingue: seis filas con el mismo
      objetivo y un rol de una palabra no dicen quién hace qué. */
  encargo: string;
  /** Los archivos que son SUYOS, cuando el reparto los calculó. Es la única
      respuesta a «¿y estos dos no se van a pisar?», y hasta ahora se calculaba
      para el prompt y se tiraba. */
  frontera?: string;
  /** Cuándo se abrió la cuadrilla entera. Lo comparten todos sus puestos, así
      que sirve para saber cuánto lleva viva sin preguntárselo a nadie. */
  desde?: number;
  /** Cuántos son en total, para el "2 de 5". */
  de: number;
  n: number;
}

/** Los colores de las cuadrillas, en orden. Se van rotando para que dos
    equipos abiertos a la vez no se confundan entre sí. */
const TEAM_COLORS = ["#5fd0ff", "#6fe0bb", "#ffd166", "#c4b5fd", "#ff9f6b"];

/** Lo que trae quien abre el Reparto sin ser el botón de la barra. La Misión
    del Panel y el kanban del lienzo lo abren ya escrito, para que lo último
    que se vea antes de gastar sea siempre la misma vista previa. */
export interface RepartoInicial {
  texto?: string;
  proyecto?: string;
  objetivo?: string;
  /** Qué hacer SI se abrió la cuadrilla de verdad. Cerrar sin abrir no lo
      llama: es lo que quita las tarjetas del kanban, y quitarlas por haber
      mirado sería perderlas. */
  alAbrir?: () => void;
}

// The mosaic model lives in lib/layout.ts. Panes are rendered as siblings and
// positioned from it, so moving one never changes its place in the React tree
// (which would unmount it and kill its terminal).

type View =
  | "panel"
  | "cabina"
  | "chat"
  | "agenda"
  | "lienzo"
  | "memoria"
  | "cuentas"
  | "comandos"
  | "ajustes";
type SplitDir = "right" | "down";

// Opening a whole project spawns one claude per session (~200 MB each), so the
// cap is about RAM, not correctness. Raised from 6 to 12 on Munir's 32 GB box;
// they start staggered so twelve CLIs don't fight for the CPU at once.
const MAX_OPEN_ALL = 12;
const OPEN_ALL_STAGGER_MS = 350;
const SIDEBAR_KEY = "adeorq-sidebar-w";
const STREAM_KEY = "adeorq-stream";
const OBJETIVOS_KEY = "adeorq-objetivos-abierto";
/** Qué panel de la derecha se está viendo, o vacío si solo está la franja de
    iconos. Vive aquí y no dentro del panel porque desde el 2026-08-15 se monta
    dos veces, en la Cabina y en el Chat, y la de la Cabina no se desmonta al
    cambiar de vista: con un estado por instancia, cerrarlo en una dejaba la
    otra abierta. */
const LATERAL_KEY = "adeorq-lateral";
const FONT_KEY = "adeorq-term-font";
const AUTOFONT_KEY = "adeorq-term-autofont";
const OPENALL_KEY = "adeorq-open-all";
const LAYOUT_KEY = "adeorq-layout";
const RESTORE_KEY = "adeorq-restore";
const JUMP_KEY = "adeorq-saltar-al-que-termina";
const OLLAMA_KEY = "adeorq-modelo-local";
/** Con qué modo nace cada Claude nuevo, hasta que se cambie a mano con Mayús+Tab. */
const PERMISSION_MODE_KEY = "adeorq-permission-mode";
/** Cuánto se ve a través de las terminales. -1 = automático (lo que diga el CSS). */
const TERMINAL_VER_KEY = "adeorq-terminal-ver";
const RESTORE_STAGGER_MS = 400;
// Accounts live here and not in the UI-state file because the sidebar owns
// that file: two writers with their own copy would overwrite each other.
const ACCOUNTS_KEY = "adeorq-accounts";

// A terminal is a running program: closing Adeorq kills it, and no update can
// carry a live process across a restart. What CAN be carried is the board: the
// same panes, in the same folders, with each Claude resuming ITS OWN
// conversation. That is why every Claude is launched with its own session id.
interface SavedPane {
  name: string;
  cwd: string;
  command?: string[];
  env?: Record<string, string>;
  account?: string;
  // Sin esto una cuadrilla se deshacía al reabrir Adeorq: los paneles volvían
  // pero ya no se veían como el mismo encargo. Opcional a propósito, porque un
  // tablero guardado antes de que este campo existiera no lo trae.
  team?: Team;
  /** El grupo de la barra al que pertenece, para poder volver a apartarlo. */
  grupo?: string;
  /** Estaba minimizada. Se guarda EN el panel y no como una lista de ids
      aparte, porque los ids se reparten de nuevo en cada arranque y una lista
      de números viejos apartaría terminales al azar. */
  minimizado?: boolean;
  /** No era una terminal, eran estos archivos. Vuelven abiertos donde estaban,
      que cuesta lo mismo que olvidarlos y evita tener que buscarlos otra vez. */
  archivos?: string[];
  activo?: string;
  /** Era una vista previa de esta dirección. */
  web?: string;
  /** Sus pestañas, si tenía más de una. Un tablero guardado antes de que
      existieran no las trae y vuelve con la de siempre. */
  webTabs?: string[];
  webActiva?: number;
}

/** The whole board: which panes, and the mosaic they were arranged in. */
interface SavedLayout {
  panes: SavedPane[];
  cols: Array<{ w: number; hs: number[]; idx: number[] }>;
  /**
   * Los grupos que estaban apartados. Al reiniciar, Adeorq se olvidaba de en
   * qué estabas trabajando y te devolvía las doce terminales encima (Munir,
   * 2026-08-02): apartar es una decisión y sobrevive al cierre, como el resto
   * del tablero. Los ids son los del estado de la barra, que sí son estables.
   */
  ocultos?: string[];
}


/** The six modes `claude --permission-mode` accepts, checked against its own
    `--help` on 2026-08-01. */
export type PermissionMode =
  | "acceptEdits"
  | "auto"
  | "bypassPermissions"
  | "manual"
  | "dontAsk"
  | "plan";

// Munir's choice 2026-07-25: every Claude used to start in acceptEdits (edits
// go through, risky commands still ask), the terminal twin of the desktop
// app's Auto. That is now Ajustes' default and not a fixed value, so it stays
// exactly as before for anyone who never opens that screen.
const DEFAULT_PERMISSION_MODE: PermissionMode = "acceptEdits";

/** Los seis, como lista, para poder comprobar que lo guardado es uno de ellos. */
const PERMISSION_MODES: PermissionMode[] = [
  "acceptEdits",
  "auto",
  "bypassPermissions",
  "manual",
  "dontAsk",
  "plan",
];

/**
 * Lo guardado, SOLO si es uno de los seis.
 *
 * Lo que salga de aquí se pega dentro de una línea de comandos, y localStorage
 * es texto que cualquiera puede dejar a medias: una versión futura que renombre
 * un modo, un valor cortado, o algo pegado a mano. Sin esta verja, ese texto
 * viajaría tal cual a la terminal. Con ella, lo que no reconozcamos vuelve al
 * modo de siempre en vez de convertirse en un argumento inventado.
 */
function modoGuardado(): PermissionMode {
  const v = localStorage.getItem(PERMISSION_MODE_KEY);
  return PERMISSION_MODES.find((m) => m === v) ?? DEFAULT_PERMISSION_MODE;
}

// claudeCommand sits above the App component, next to every other function
// that spawns a Claude, so a mode chosen from a single opener (the wizard's
// "modo plan", for instance) can override it without touching the rest. When
// nobody overrides it, it reads Ajustes' setting straight from localStorage:
// there is no React state to hand it here, and localStorage is the one store
// both sides can already see. Shift+Tab inside a pane still cycles the mode
// for that one session, same as always.
function claudeCommand(args = "", mode?: PermissionMode, conTexto = false): string[] {
  const m = mode ?? modoGuardado();
  const inner = `claude --permission-mode ${m}${args ? ` ${args}` : ""}`;
  // `conTexto` = en `args` viaja un encargo escrito por una persona, entre las
  // comillas simples de PowerShell. Entonces el envoltorio TIENE que ser
  // PowerShell, aunque pese diez veces más: en cmd esas comillas no agrupan
  // nada (llegarían al CLI como parte del texto y el encargo se partiría por
  // cada espacio) y un «&» dictado ejecutaría lo que venga detrás. Sin encargo
  // —abrir una terminal, retomar una sesión, restaurar el tablero, que es la
  // mayoría— va el envoltorio ligero. Ver `shellCommand` para los números.
  return conTexto ? powershellCommand(inner) : shellCommand(inner);
}

// The effort his settings.json is set to, read once at startup. Every Claude
// is launched with it: a resumed session used to come back without repainting
// the footer Adeorq reads the effort from, and a pane that says nothing about
// its effort looks exactly like a pane whose effort changed on its own.
let defaultEffort: string | null = null;

/** Reads it once and remembers it; safe to call again. */
async function loadEffort(): Promise<void> {
  if (defaultEffort !== null) return;
  defaultEffort = await cliEffort(null).catch(() => null);
}

/** Adds --effort unless the caller already chose one. */
function withEffort(args: string): string {
  if (!defaultEffort || /--effort/.test(args)) return args;
  return `${args} --effort ${defaultEffort}`;
}

/** A fresh Claude, tagged with an id we choose so it can be resumed later. */
function newClaudeCommand(extra = "", mode?: PermissionMode, conTexto = false): string[] {
  return claudeCommand(
    withEffort(`--session-id ${crypto.randomUUID()}${extra ? ` ${extra}` : ""}`),
    mode,
    conTexto,
  );
}

/** Turns a pane's command into the one that brings its conversation back. */
async function resumeCommandFor(pane: SavedPane): Promise<string[] | undefined> {
  const joined = pane.command?.join(" ") ?? "";
  const id = joined.match(/--(?:session-id|resume)\s+([0-9a-f-]{8,})/i)?.[1];
  if (!id) return pane.command;
  // A session that never got a message has no transcript, and --resume on it
  // fails with "No conversation found": reopen it as a fresh one instead.
  const exists = await transcriptExists(pane.cwd, id).catch(() => false);
  // Restoring the board is exactly where the effort went missing, so it is
  // put back on the command line rather than hoped for.
  return exists
    ? claudeCommand(withEffort(`--resume ${id}`))
    : claudeCommand(withEffort(`--session-id ${id}`));
}

/**
 * The other agent CLIs. Where its own --help confirmed an equivalent of
 * Claude's acceptEdits, the pane starts there, so it behaves the same whoever
 * is inside: edits go through, risky things still ask. Where it did not, the
 * CLI starts plain: a made-up flag is worse than one less convenience, and
 * Copilot's --allow-all-tools is full permission, which is not ours to grant.
 *
 * Cada una de esas líneas vive AHORA en la tabla de proveedores, en su columna
 * `arranque`. Aquí había un `switch` con los nombres escritos otra vez, que era
 * uno de los diecinueve archivos que había que visitar para añadir un cliente
 * (2026-08-13).
 */
const providerInner = lineaDeArranque;

/** Abrirlo sin nada dentro: ni encargo, ni modelo, ni modo. Es el caso de
 *  todos los días (el botón de la barra, un atajo de proyecto). */
function providerCommand(provider: string): string[] {
  // El `?? shellCommand(...)` no es defensa por si acaso: `comandoDe` devuelve
  // `undefined` para la consola pelada, y aquí siempre llega un CLI de verdad.
  return comandoDe({ cli: provider }) ?? shellCommand(providerInner(provider));
}

/**
 * El comando con el que nace una terminal, sea del CLI que sea.
 *
 * Es la única traducción de un plan de arranque a un comando de verdad. La
 * DECISIÓN vive aparte y es pura (`lib/arranque.ts`, comprobada sin abrir la
 * app); esto es la mitad que no se puede probar, porque necesita un id de
 * sesión nuevo y el modo guardado en `localStorage`.
 *
 * Devuelve `undefined` solo para la consola pelada, que es una terminal sin
 * nada dentro y no un fallo.
 */
function comandoDe(p: Peticion): string[] | undefined {
  return comandoDelPlan(planDeArranque(p));
}

/** La misma traducción, cuando quien llama ya tiene el plan en la mano y
 *  necesita mirarlo (para copiar el encargo, o para saber en qué se abre). */
function comandoDelPlan(plan: Plan): string[] | undefined {
  switch (plan.tipo) {
    case "consola":
      return undefined;
    case "claude":
      return newClaudeCommand(plan.extra, plan.modo, plan.conTexto);
    case "agy":
      return agyCommand(plan.exe, plan.encargo);
    case "linea":
      // Con un encargo dictado dentro, PowerShell: en cmd las comillas simples
      // no agrupan nada y un «&» ejecutaría lo que venga detrás. Ver la nota de
      // `claudeCommand`, que es la misma razón.
      return plan.conTexto ? powershellCommand(plan.inner) : shellCommand(plan.inner);
  }
}

/**
 * Descargar un CLI desde el centro de cuentas, en una terminal de las de aquí.
 *
 * Descarga y para. No encadena el arranque del programa, que es lo que dispara
 * su login: tener el cliente en el equipo y darle tu cuenta son dos decisiones
 * distintas, y la segunda es suya (Munir, 2026-07-28). Al acabar dice en verde
 * qué escribir el día que quiera conectarlo, y la terminal se queda ahí.
 */
function installCommand(p: Provider, listo: string): string[] {
  // PowerShell a propósito: `$?` y `Write-Host -ForegroundColor` son suyos y en
  // cmd no existen. Es una terminal que dura lo que tarda la descarga, así que
  // sus 74 MB de envoltorio no son los que hay que perseguir (ver `shellCommand`).
  return powershellCommand(
    `${p.cmd}; if ($?) { Write-Host ''; Write-Host '${listo.replace(/'/g, "''")}' -ForegroundColor Green }`,
  );
}

// Antigravity CLI (agy): same shape as claude, so it lives in a pane too.
// Its installer only adds %LOCALAPPDATA%\agy\bin to the PATH for NEW shells,
// so call it through the path Rust found. --mode accept-edits is agy's Auto.
export function agyCommand(exe: string, prompt?: string): string[] {
  // Con encargo va por PowerShell, y no por ahorrar trabajo: ese texto lo ha
  // dictado Munir y en una línea de cmd un «&» o un «%» lo partiría o, peor,
  // ejecutaría lo de detrás. Las comillas simples de PowerShell no interpretan
  // nada de lo que llevan dentro. Sin encargo no hay texto de nadie, así que se
  // lleva el envoltorio ligero, que es el caso de todos los días (el botón AG).
  if (prompt) {
    return powershellCommand(
      `& '${exe}' --mode accept-edits '${prompt.replace(/'/g, "''")}'`,
    );
  }
  return shellCommand(`"${exe}" --mode accept-edits`);
}

/** Where the draggable seams go, derived from the same rectangles. */
type Divider =
  | { kind: "col"; i: number; at: number }
  | { kind: "row"; ci: number; ri: number; at: number; x: number; w: number };

function dividers(cols: Col[]): Divider[] {
  const out: Divider[] = [];
  const total = cols.reduce((a, c) => a + c.w, 0) || 1;
  let x = 0;
  cols.forEach((col, i) => {
    const w = col.w / total;
    if (i < cols.length - 1) out.push({ kind: "col", i, at: x + w });
    const hTotal = col.hs.reduce((a, b) => a + b, 0) || 1;
    let y = 0;
    col.panes.forEach((_, ri) => {
      y += (col.hs[ri] ?? 1) / hTotal;
      if (ri < col.panes.length - 1) out.push({ kind: "row", ci: i, ri, at: y, x, w });
    });
    x += w;
  });
  return out;
}

function App() {
  const nextId = useRef(1);
  const nextCol = useRef(1);
  /** Para que dos cuadrillas seguidas no salgan del mismo color. */
  const teamColor = useRef(0);
  /** Una cola, no una promesa suelta: los puestos de una cuadrilla se abren
      escalonados y cada uno quiere anotar su hueco en el MISMO archivo de
      grupos. Sin encadenar las escrituras, la segunda podía leer el estado de
      antes de que la primera terminara de guardar y se perdía una de las dos. */
  const uiStateChain = useRef(Promise.resolve());
  const [view, setView] = useState<View>("panel");
  /** La vista de ahora, para quien la necesita sin querer volver a crearse cada
   *  vez que cambias de pestaña. La lee `addPane` para saber dónde estás. */
  const viewRef = useRef<View>("panel");
  viewRef.current = view;
  const [panes, setPanes] = useState<Pane[]>([]);
  /**
   * Los grupos apartados: sus terminales no se ven en la Cabina, pero siguen
   * vivas y trabajando, y vuelven enteras al desplegarlos.
   *
   * UN solo concepto para las tres puertas que llevan a lo mismo: el ▴ del
   * grupo en la barra lateral, el ◲ de la barra de una cuadrilla, y abrir otro
   * grupo (que aparta los demás). Antes había un «espacio activo» por un lado
   * y unas «cuadrillas ocultas» por otro, con una cinta que explicaba el
   * invento: dos estados para una idea, y un cartel para disimularlo (Munir,
   * 2026-08-02). Vive en App porque lo miran la Cabina y la barra a la vez.
   */
  const [gruposOcultos, setGruposOcultos] = useState<Set<string>>(() => new Set());
  /**
   * Terminales minimizadas: fuera del mosaico, vivas y trabajando.
   *
   * Minimizar tiene una trampa que hay que resolver o es una trampa de verdad:
   * si un agente te pregunta algo estando minimizado, y minimizar significara
   * «desaparece», te quedarías esperando a alguien que te está esperando a ti.
   * Por eso baja a una tira donde SIGUE diciendo qué hace, y el que te
   * necesita se pinta en ámbar. Apartar no puede ser perder de vista.
   */
  const [minimizados, setMinimizados] = useState<Set<number>>(() => new Set());

  const alternarMinimizado = useCallback((id: number) => {
    setMinimizados((prev) => {
      const s = new Set(prev);
      if (!s.delete(id)) s.add(id);
      return s;
    });
  }, []);

  /** Los paneles de ahora, para leerlos desde un callback estable sin volver a
      crearlo cada vez que se abre o se cierra una terminal. */
  const panesRef = useRef<Pane[]>([]);
  /** Las terminales que están fuera, en su propia ventana. Se guardan enteras
      para poder devolverlas tal como estaban cuando cierren esa ventana. */
  const fueraRef = useRef<Map<number, Pane>>(new Map());

  /** Todo de vuelta al mosaico. Entrar en un grupo aparta lo demás de golpe,
      así que salir tiene que costar lo mismo: sin esto había que ir trayendo
      una a una lo que se apartó con un solo clic. */
  const traerTodo = useCallback(() => {
    setMinimizados(new Set());
    setGruposOcultos(new Set());
  }, []);

  const alternarGrupo = useCallback((id: string) => {
    setGruposOcultos((prev) => {
      const s = new Set(prev);
      if (!s.delete(id)) s.add(id);
      return s;
    });
  }, []);
  // Lo que hace cada panel AHORA, reportado por él mismo. Existe para el
  // Capataz: sin esto solo conocía los nombres de las terminales abiertas, que
  // no distinguen una que te espera de una que ya entregó.
  const [paneStatus, setPaneStatus] = useState<Record<number, PaneStatus>>({});
  /* El estado que tenía cada panel la última vez, para saber cuándo CAMBIA.
     Es lo que dispara el salto a pantalla completa: ver `alTerminarRef`. */
  const estadoAntes = useRef<Record<number, WorkState>>({});
  const alTerminarRef = useRef<((id: number) => void) | null>(null);
  const onPaneStatus = useCallback((st: PaneStatus) => {
    const antes = estadoAntes.current[st.id];
    estadoAntes.current[st.id] = st.state;
    /* SEGUNDO CAMINO PARA EL SALTO, y el bueno.
       El ajuste «saltar a la sesión que termina» colgaba solo de la campana del
       terminal, que es un pitido: no distingue acabar de preguntarte, y si el
       CLI no la toca no pasa nada y no hay forma de saber por qué (Munir,
       2026-08-10: «la tengo activada y no funciona»). El transcript sí lo sabe,
       y Adeorq ya lo lee para pintar el estado de cada panel: colgarlo también
       de aquí cubre además el «o necesita mi feedback», que la campana no sabe
       decir. Las reglas y sus casos, en `lib/estados.ts`. */
    if (acabaDeReclamar(antes, st.state)) alTerminarRef.current?.(st.id);
    setPaneStatus((prev) => ({ ...prev, [st.id]: st }));
  }, []);
  const [cols, setCols] = useState<Col[]>([]);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [maximizedId, setMaximizedId] = useState<number | null>(null);
  /** Lo mismo, para leerlo desde el `onData` de un panel sin rehacer nada. */
  const maximizedRef = useRef<number | null>(null);
  maximizedRef.current = maximizedId;
  /**
   * Quién está a pantalla completa PORQUE terminó, y no porque tú lo pusieras.
   *
   * Es la diferencia entre las dos maneras de llegar ahí: la automática se
   * deshace sola en cuanto le contestas, la tuya no se toca. Sin esta marca no
   * hay forma de distinguirlas, porque el estado es el mismo.
   */
  const maxPorSaltoRef = useRef<number | null>(null);
  /**
   * El acompañante del maximizado: el panel de archivos que se abre AL LADO de
   * una sesión a pantalla completa, mitad y mitad.
   *
   * Sin esto, abrir un archivo con una terminal maximizada lo mandaba al
   * mosaico de detrás, o sea a ninguna parte: el clic en el árbol no enseñaba
   * nada (Munir, 2026-08-16). Solo lo pone `abrirArchivo`; se va solo al salir
   * de pantalla completa, porque es un acompañante del maximizado, no un
   * segundo maximizado.
   */
  const [ladoMaxId, setLadoMaxId] = useState<number | null>(null);
  /* Derivado y no usado a pelo: si el panel acompañante se cerró o el
     maximizado ya es él mismo, no hay lado que pintar. */
  const ladoMax =
    maximizedId != null &&
    ladoMaxId != null &&
    ladoMaxId !== maximizedId &&
    panes.some((p) => p.id === ladoMaxId)
      ? ladoMaxId
      : null;
  useEffect(() => {
    if (maximizedId == null) setLadoMaxId(null);
  }, [maximizedId]);
  /** Los que terminaron mientras escribías en otra y esperan su turno. */
  const colaSaltoRef = useRef<number[]>([]);
  // Quién tiene el teclado, leído desde callbacks que no se rehacen con cada
  // cambio de foco (el Capataz escribe en él).
  const focusedIdRef2 = useRef<number | null>(null);
  focusedIdRef2.current = focusedId;
  const [refreshKey, setRefreshKey] = useState(0);
  const [focusReq, setFocusReq] = useState<{
    name: string;
    /** Cuando se pide por una sesión concreta: la barra sabe mejor que nadie en
        qué proyecto la tiene puesta, porque tú pudiste moverla a mano. */
    sesion?: string;
    n: number;
  } | null>(null);
  /** Lo que el ＋ manda a la barra: ids de conversaciones que quieres ver ahí,
      sin abrir ninguna terminal. Lo guarda el Sidebar, que es su dueño. */
  const [traerReq, setTraerReq] = useState<{ ids: string[]; n: number } | null>(null);
  /** Quién ha pedido el teclado desde el tablero, y cuántas veces. */
  const [tecladoReq, setTecladoReq] = useState<{ id: number; n: number } | null>(null);
  const [sideW, setSideW] = useState(() => {
    const saved = Number(localStorage.getItem(SIDEBAR_KEY));
    return saved >= 200 && saved <= 480 ? saved : 300;
  });
  /** Cómo se dibuja la barra. Lo decide y lo guarda ella; aquí solo se sabe
      para quitar el tirador cuando está encogida en tira. */
  const [railMode, setRailMode] = useState<RailMode>("full");
  // The canvas keeps its own terminals: mixing them with the grid's would mean
  // one layout stealing panes from the other every time the view changes.
  const [canvasPanes, setCanvasPanes] = useState<CanvasPane[]>([]);
  /** Las del lienzo, para leerlas desde callbacks estables (como `panesRef`):
      el renombrado desde la cabecera vive en el `data` de un nodo de React
      Flow, que se escribe una vez al crearlo y no se vuelve a tocar. */
  const canvasPanesRef = useRef<CanvasPane[]>([]);
  canvasPanesRef.current = canvasPanes;
  const [showForeman, setShowForeman] = useState(false);
  /** Cierto cuando quien abre el Asistente es el atajo del dictado: nace
      grabando. Se apaga al cerrarlo, para que la siguiente vez que lo abras a
      mano no se ponga a grabar por su cuenta. */
  const [dictarAlAbrir, setDictarAlAbrir] = useState(false);
  // META 6: extra Claude Code accounts, each one a config folder of its own.
  const [accounts, setAccounts] = useState<Account[]>(() => {
    try {
      const saved: Account[] =
        JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "{}").accounts ?? [];
      // Accounts saved before other CLIs existed were all Claude's.
      return saved.map((a) => ({ ...a, provider: a.provider || "claude" }));
    } catch {
      return [];
    }
  });
  const [defaultAccount, setDefaultAccount] = useState<string>(() => {
    try {
      return (
        JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "{}").defaultAccount ??
        MAIN_ACCOUNT.id
      );
    } catch {
      return MAIN_ACCOUNT.id;
    }
  });
  // Streaming safety: an opaque curtain (never a blur, which a recorder can
  // partly undo), raised by hand with Ctrl+Shift+P or on its own the moment
  // something key-shaped reaches a pane.
  // META 7: what his Discord says he is doing. Off until he sets it up.
  const [discord, setDiscord] = useState<DiscordConfig>(loadDiscord);
  const [discordError, setDiscordError] = useState<string | null>(null);
  const [wizard, setWizard] = useState(false);
  /** La bienvenida: sale sola la primera vez y se puede repetir desde Ajustes.
      Sin esto, un ordenador que no tuviera C:\proyectos abría un panel vacío
      sin decir por qué ni dónde arreglarlo. */
  /** El Reparto: varias tareas de golpe, cada una a su cliente y su cerebro.
      No es un sí/no porque hay tres puertas a la misma pantalla, y dos de
      ellas (la Misión y el kanban) llegan con las tareas ya escritas. */
  const [reparto, setReparto] = useState<RepartoInicial | null>(null);
  const [onboarding, setOnboarding] = useState(() => !leerPerfil().hecho);
  /** El recorrido por las funciones, encadenado al final de la bienvenida. */
  const [tour, setTour] = useState(false);
  const [panic, setPanic] = useState(false);
  const [burnt, setBurnt] = useState<Hit[] | null>(null);
  const burntTimer = useRef(0);
  /** El título de la sesión que se ha intentado abrir estando ya viva en otro
      sitio. Ver `onResume`: abrirla dos veces la cuelga. */
  const [sesionOcupada, setSesionOcupada] = useState<string | null>(null);
  const ocupadaTimer = useRef(0);
  // Held Alt reveals the masked labels: streaming must not stop him working,
  // but a hover must never be enough to expose them.
  const [peek, setPeek] = useState(false);
  // Stream mode: Munir does live vibe-coding streams, and paths, emails and
  // whatever an agent prints are his private working life. One switch hides
  // the lot; each pane can also be blurred on its own.
  const [stream, setStream] = useState(
    () => localStorage.getItem(STREAM_KEY) === "1",
  );
  /** El panel flotante de objetivos: si lo dejaste abierto, sigue abierto. */
  const [verObjetivos, setVerObjetivos] = useState(
    () => localStorage.getItem(OBJETIVOS_KEY) === "1",
  );
  const [lang, setLang] = useState<Lang>(detectLang);
  const [theme, setTheme] = useState<ThemeId>(
    () => (localStorage.getItem(THEME_KEY) as ThemeId) || "azul",
  );
  const [fontSize, setFontSize] = useState(
    () => Number(localStorage.getItem(FONT_KEY)) || 15,
  );
  // On by default: with nine panes open the fixed size was unreadable.
  const [autoFont, setAutoFont] = useState(
    () => localStorage.getItem(AUTOFONT_KEY) !== "0",
  );
  const [openAllCap, setOpenAllCap] = useState(
    () => Number(localStorage.getItem(OPENALL_KEY)) || MAX_OPEN_ALL,
  );
  const [notifyMode, setNotifyMode] = useState<NotifyMode>(
    () => (localStorage.getItem(NOTIFY_KEY) as NotifyMode) || "fondo",
  );
  // Solo para que Ajustes pinte el que está activo: claudeCommand no lee este
  // estado, lee localStorage directamente (ver su comentario), así que las dos
  // copias nunca pueden desincronizarse por un render de más.
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(
    modoGuardado,
  );
  const [restoreOnStart, setRestoreOnStart] = useState(
    () => localStorage.getItem(RESTORE_KEY) !== "0",
  );
  /** Al terminar un agente, ponerlo él solo a pantalla completa. Apagado de
      fábrica: es lo único de la app que te cambia la pantalla sin pedírselo. */
  const [saltarAlQueTermina, setSaltarAlQueTermina] = useState(
    () => localStorage.getItem(JUMP_KEY) === "1",
  );
  // Solo los que él haya cambiado: los de fábrica no se guardan, así que si
  // algún día cambia uno por defecto, quien no lo tocó se lleva el nuevo.
  const [atajos, setAtajos] = useState<Atajos>(() => leerAtajos());
  /** El fondo: la ruta vive en disco (la sabe Rust), y aquí solo su ajuste. */
  const [fondo, setFondo] = useState("");
  const [fondoSello, setFondoSello] = useState(0);
  // 60 y no 35. El velo se lleva lo que este número no deja pasar, y con 35 la
  // foto salía de su capa apagada a un tercio ANTES de encontrarse el panel del
  // pane y el lienzo de xterm; detrás de una terminal no llegaba nada, que es
  // justo donde se quiere ver (Munir, tres veces: «sigue sin funcionar»). Quien
  // prefiera el texto por encima de la foto lo baja, y ese ajuste sí se guarda.
  const [fondoOpacidad, setFondoOpacidad] = useState(
    () => Number(localStorage.getItem(FONDO_OPACIDAD_KEY) ?? 60),
  );
  const [fondoDesenfoque, setFondoDesenfoque] = useState(
    () => Number(localStorage.getItem(FONDO_DESENFOQUE_KEY) ?? 0),
  );
  /** Qué trozo de la foto se ve. Antes era una regla fija del CSS; ver `lib/encuadre.ts`. */
  const [fondoEncuadre, setFondoEncuadre] = useState<Encuadre>(() => leerEncuadre());
  /** Qué pestañas salen arriba y en qué orden. Ver `lib/cabecera.ts`. */
  const [cabecera, setCabecera] = useState<Cabecera>(() => leerCabecera());
  /**
   * Cuánto se ve a TRAVÉS de las terminales: 0 opacas, 100 invisibles.
   *
   * El lienzo de xterm no es CSS, lo pinta su renderer con el color de su tema,
   * así que la única forma de graduarlo es cambiarle ese color. Hasta ahora
   * tenía dos valores fijos (0.45 normal, 0.2 con foto puesta) y el mando de
   * «cuánto se ve» solo tocaba la foto, no la capa que la tapa.
   *
   * -1 es AUTOMÁTICO y es lo que viene de fábrica: manda el CSS y todo queda
   * exactamente como estaba. En cuanto se mueve el mando, decide él.
   */
  const [terminalVer, setTerminalVer] = useState(
    () => Number(localStorage.getItem(TERMINAL_VER_KEY) ?? -1),
  );

  useEffect(() => {
    const root = document.documentElement;
    if (terminalVer < 0) {
      root.style.removeProperty("--xterm-bg");
      root.style.removeProperty("--pane-abre");
    } else {
      // El color se compone ENTERO aquí. Escribir `rgba(var(--xterm-rgb), …)`
      // parece más limpio y rompe las terminales: TerminalPane lee esta
      // variable y se la da a xterm tal cual, y xterm no resuelve var().
      const rgb =
        getComputedStyle(root).getPropertyValue("--xterm-rgb").trim() || "13, 21, 36";
      const abre = 1 - terminalVer / 100;
      root.style.setProperty("--xterm-bg", `rgba(${rgb}, ${abre.toFixed(2)})`);
      // Y el panel que hay DEBAJO del lienzo, o el mando no cumple lo que
      // promete: con la terminal al 100 % seguías viendo este color en vez de
      // la foto, porque son dos capas en serie y ayer solo se abrió una.
      root.style.setProperty("--pane-abre", abre.toFixed(2));
    }
    localStorage.setItem(TERMINAL_VER_KEY, String(terminalVer));
    // Las terminales ya abiertas leyeron el color al nacer, así que hay que
    // avisarlas para que lo relean.
    window.dispatchEvent(new Event(FONDO_EVENTO));
    // `fondo` está en las dependencias aunque no se use aquí, y es a propósito:
    // poner o quitar la foto cambia el valor automático (0.45 -> 0.2) y hasta
    // ahora no lo anunciaba NADIE, así que las terminales abiertas se quedaban
    // con el color de antes hasta reiniciar la app. Este efecto corre después
    // de pintar, o sea con el elemento .fondo ya en el DOM, que es lo que hace
    // que el nuevo valor esté disponible cuando se lee.
  }, [terminalVer, fondo]);

  useEffect(() => {
    void leerFondo()
      .then((p) => {
        setFondo(p);
        setFondoSello(Date.now());
      })
      .catch(() => {});
  }, []);
  /** El modelo de Ollama que resume qué necesita cada sesión de ti. "" = ninguno,
      y entonces la Agenda se queda solo con lo que sabe del disco, que ya es
      la mayor parte. */
  const [modeloLocal, setModeloLocal] = useState(
    () => localStorage.getItem(OLLAMA_KEY) ?? "",
  );
  const [restoring, setRestoring] = useState(0);

  // What Discord gets told, built from primitives so the presence object only
  // changes identity when it would change what his profile says. The project
  // is taken from the FOLDER, never from the pane's name: a resumed session is
  // named after its title ("arreglar el login de…"), which says far more about
  // the work than the switch he turned on ever promised.
  const focusProject =
    panes
      .find((p) => p.id === focusedId)
      ?.cwd.split(/[\\/]/)
      .filter(Boolean)
      .pop() ?? null;
  const presence = useMemo(
    () => ({ panes: panes.length, project: focusProject, stream }),
    [panes.length, focusProject, stream],
  );

  /* Qué carpeta enseña el explorador de la derecha: la de la terminal que
     tienes delante. Es el eje de Adeorq aplicado a los archivos («gana por
     saber dónde estás»): no hay que elegir proyecto en ningún desplegable,
     porque ya lo elegiste al ponerte delante de una terminal.
     Un pane de ARCHIVO no manda aquí, y por eso solo cuentan los que tienen
     proceso: si mandara, abrir un archivo del árbol cambiaría la raíz de ese
     mismo árbol y perderías de vista de dónde había salido. */
  const [raizArchivos, setRaizArchivos] = useState(() => raiz());
  useEffect(() => {
    const foco = panes.find((p) => p.id === focusedId && !p.archivos && p.web == null);
    if (foco?.cwd) {
      setRaizArchivos(foco.cwd);
      return;
    }
    // Sin terminal enfocada solo se estrena, y nunca en blanco: con la Cabina
    // vacía se enseña la carpeta de los proyectos, que es de donde salen todos.
    // Un panel que dice «abre un proyecto» teniéndolos ahí al lado no sirve de
    // nada (Munir, 2026-08-15).
    setRaizArchivos((prev) => prev || panes.find((p) => !p.archivos && p.web == null)?.cwd || raiz());
  }, [panes, focusedId]);
  const raizArchivosRef = useRef("");
  raizArchivosRef.current = raizArchivos;
  useDiscordPresence(discord, presence, setDiscordError, lang);

  // Theme lives on <html> so it also tints things rendered outside .app.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // El apagón también vive en <html>, y se pone una vez al arrancar: quien lo
  // dejó encendido ayer no tiene que volver a Ajustes hoy.
  useEffect(() => {
    aplicarApagon(apagon());
  }, []);

  /**
   * El cristal, encendido o apagado según lo que tengas abierto.
   *
   * Se recalcula con CADA cambio del tablero y no solo al arrancar, porque el
   * modo de fábrica es automático: la app tiene que apagar el cristal cuando
   * abres la cuarta terminal y devolvértelo al cerrarla. Cuentan las de la
   * cabina Y las del lienzo, que pintan las mismas capas de cristal y cuestan
   * exactamente lo mismo.
   *
   * Quién decide es `debeAhorrar`, que es puro y está comprobado en
   * `scripts/rendimiento-check.ts`. Aquí solo se cuenta y se aplica.
   */
  useEffect(() => {
    aplicarRendimiento(
      debeAhorrar(prefRendimiento(), panes.length + canvasPanes.length),
    );
  }, [panes.length, canvasPanes.length]);

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useMemo(() => makeT(lang), [lang]);
  const dragging = useRef(false);
  // Guards the restore so it runs once, and blocks saving until it finished.
  const restored = useRef(false);
  const agyExe = useRef<string | null>(null);
  // Read by addPane, which must keep stable identity (half the app depends on
  // it), so the accounts reach it through a ref instead of its deps.
  const accountsRef = useRef({ list: accounts, def: defaultAccount });
  accountsRef.current = { list: accounts, def: defaultAccount };

  useEffect(() => {
    findAgy()
      .then((p) => {
        agyExe.current = p;
      })
      .catch(() => {});
    void loadEffort();
  }, []);

  /** El panel sobre el que se está soltando un archivo ahora mismo. */
  const [soltandoEn, setSoltandoEn] = useState<number | null>(null);

  /** Las cuentas cuya cuota Adeorq sabe leer, que son las que alimentan el
   *  aviso de plan y el panel de uso. Se filtran por la capacidad `usage` de la
   *  tabla y no por «¿eres Claude?», que era lo que ponía aquí: el día que otro
   *  CLI publique su porcentaje entra solo con marcarlo en su fila.
   *
   *  El relevo también las usa, y ahí hace falta ADEMÁS que la sesión se pueda
   *  retomar; eso lo comprueba `TerminalPane` con `sabe(kind, "retomable")`,
   *  así que no se pierde nada aunque algún día las dos listas dejen de
   *  coincidir. */
  const cuentasConCuota = useMemo(
    () => [MAIN_ACCOUNT, ...accounts.filter((a) => sabe(a.provider, "usage"))],
    [accounts],
  );

  /**
   * Soltar archivos sobre una terminal.
   *
   * Va por el evento NATIVO de Tauri y no por el `drop` del DOM, y ahí está
   * toda la historia de por qué arrastrar una imagen no funcionó nunca: en
   * Tauri 2 la ventana nace con `dragDropEnabled` en true, así que el sistema
   * entrega los archivos a Tauri y el WebView NO llega a ver el evento. El
   * `onDrop` de React recibía un `dataTransfer.files` vacío, así que daba igual
   * lo que se escribiera dentro. Se arregló dos veces mirando el sitio
   * equivocado antes de mirar la configuración de la ventana (Munir, 2026-08-01).
   *
   * Y este camino además es MEJOR que el del DOM: trae la ruta de verdad del
   * archivo, que ya está en el disco. No hay que copiar nada, y esa ruta es
   * justo lo que Claude Code lee para ver una imagen.
   *
   * Ojo: esto no rompe el arrastre de paneles ni el de texto, que sí llegan al
   * DOM. Tauri solo se queda los archivos que vienen de fuera de la ventana.
   */
  useEffect(() => {
    let off: (() => void) | undefined;
    let vivo = true;

    /** Qué panel hay bajo el cursor, si hay alguno. */
    const paneBajo = (pos: { x: number; y: number }): number | null => {
      // La posición viene en píxeles FÍSICOS y el DOM mide en píxeles CSS: sin
      // dividir por la escala, en una pantalla al 150 % el punto cae muy por
      // debajo de donde de verdad está el ratón.
      const r = window.devicePixelRatio || 1;
      const el = document.elementFromPoint(pos.x / r, pos.y / r);
      const caja = el?.closest("[data-pane-id]");
      const id = caja ? Number(caja.getAttribute("data-pane-id")) : NaN;
      return Number.isFinite(id) ? id : null;
    };

    void getCurrentWebview()
      .onDragDropEvent((e) => {
        if (!vivo) return;
        if (e.payload.type === "enter" || e.payload.type === "over") {
          setSoltandoEn(paneBajo(e.payload.position));
          return;
        }
        if (e.payload.type === "leave") {
          setSoltandoEn(null);
          return;
        }
        setSoltandoEn(null);
        const id = paneBajo(e.payload.position);
        if (id == null || e.payload.paths.length === 0) return;
        setFocusedId(id);
        // Entre comillas y con un espacio detrás, para que él escriba al lado
        // qué quiere que hagan con ella. Sin Enter, como todo lo que Adeorq
        // deja escrito en una terminal.
        const linea = e.payload.paths.map((p) => `"${p}"`).join(" ");
        void writePty(id, `${linea} `).catch(() => {});
        window.dispatchEvent(
          new CustomEvent(SOLTADO_EVENTO, { detail: { id, paths: e.payload.paths } }),
        );
      })
      .then((f) => {
        // Si el componente murió mientras se registraba, se suelta al vuelo:
        // sin esto quedaría un oyente vivo apuntando a un estado que ya no está.
        if (vivo) off = f;
        else f();
      })
      .catch(() => {});

    return () => {
      vivo = false;
      off?.();
    };
  }, []);

  /**
   * Con qué entorno nace una terminal: en qué cuenta y con qué clave.
   *
   * Vive suelto porque hay DOS sitios que abren terminales (la cabina y el
   * lienzo) y hasta ahora solo uno lo calculaba: una terminal del lienzo nacía
   * siempre en la cuenta principal, así que si el router elegía otra, se abría
   * en la de siempre sin decirlo. Un panel que miente sobre en qué cuenta está
   * es peor que uno que no elige.
   */
  const entornoDePane = useCallback(
    (command: string[] | undefined, account?: Account) => {
      // Only an agent pane cares which account it is: a PowerShell console has
      // nothing to log in with. A main account carries no variable at all, so
      // every CLI keeps working exactly as it did before Adeorq existed.
      const { list, def } = accountsRef.current;
      const joined = command?.join(" ") ?? "";
      const acc =
        account ??
        (joined.includes("claude")
          ? [MAIN_ACCOUNT, ...list].find((a) => a.id === def)
          : undefined);
      const p = acc ? providerOf(acc.provider) : null;
      const runsIt = !!p && (joined.includes(p.exe) || !!account);
      const cuenta = acc?.dir && p?.envVar && runsIt ? { [p.envVar]: acc.dir } : undefined;
      // Y la clave de API, si en Cuentas marcaste que ese CLI abra con ella en
      // vez de con tu suscripción. Va AQUÍ y no en cada sitio que abre una
      // terminal porque son cinco caminos distintos (la barra, el asistente de
      // sesión nueva, Cuentas, el Capataz, el lienzo) y todos pasan por este.
      // El proveedor se saca del comando, igual que la cabecera del panel.
      const clave = entornoDe(kindDeComando(joined));
      return {
        env: cuenta || clave ? { ...cuenta, ...clave } : undefined,
        etiqueta: cuenta ? acc?.label : undefined,
      };
    },
    [],
  );

  const addPane = useCallback(
    (
      name: string,
      cwd: string,
      command?: string[],
      at?: { relTo: number; dir: SplitDir },
      account?: Account,
      team?: Team,
      shadow?: boolean,
      grupo?: string,
    ) => {
      const id = nextId.current++;
      const { env, etiqueta } = entornoDePane(command, account);

      /* Estando en el LIENZO, la terminal nace en el lienzo.
         Antes esto acababa siempre en `setView("cabina")`, así que pulsar
         «✦ Claude» mientras trabajabas en el tablero te sacaba de él y dejaba
         allí solo su tarjeta del kanban, que es lo que Munir preguntó
         (2026-08-09: «¿por qué solo se me abren en el kanban?»). Un botón de
         abrir no tiene por qué mudarte de sitio: abre donde estás mirando.

         Dos excepciones, y las dos por lo mismo (allí ese panel no existiría):
         · `at` es partir OTRO panel en dos, y eso es del mosaico de la cabina;
         · `team` es un puesto de cuadrilla, y el tablero que las agrupa y las
           cuenta vive en la cabina. Abrir media cuadrilla en cada vista sería
           partirla por donde nadie la puede ver entera. */
      if (viewRef.current === "lienzo" && !at && !team) {
        setCanvasPanes((prev) => [
          ...prev,
          { id, cwd, name, command, env, account: etiqueta },
        ]);
        return { id, donde: "lienzo" as const };
      }

      setPanes((prev) => [
        ...prev,
        { id, cwd, name, command, env, account: etiqueta, team, shadow, grupo },
      ]);
      setCols((prev) => layoutAdd(prev, id, () => nextCol.current++, at));
      setFocusedId(id);
      setView("cabina");
      // Devuelve QUÉ abrió y DÓNDE. Casi nadie lo mira, y a los que no lo miran
      // no les cambia nada; lo necesita el puente del MCP, que tiene que
      // contestarle al agente con el número de su terminal nueva y decirle si
      // cayó en un sitio donde existan las flechas (`docs/SUPREMA.md`).
      return { id, donde: "cabina" as const };
    },
    [entornoDePane],
  );

  const openTerminal = useCallback(
    (name: string, cwd: string) => addPane(`${name} · terminal`, cwd),
    [addPane],
  );

  const openClaude = useCallback(
    (name: string, cwd: string) =>
      addPane(`${name} · claude`, cwd, newClaudeCommand()),
    [addPane],
  );

  // Accounts are configuration, written as one blob and kept in the ref too so
  // two changes in a row (add, then make it the default) never race.
  const mutateAccounts = useCallback(
    (fn: (prev: { list: Account[]; def: string }) => { list: Account[]; def: string }) => {
      const next = fn(accountsRef.current);
      accountsRef.current = next;
      setAccounts(next.list);
      setDefaultAccount(next.def);
      localStorage.setItem(
        ACCOUNTS_KEY,
        JSON.stringify({ accounts: next.list, defaultAccount: next.def }),
      );
    },
    [],
  );

  const addAccount = useCallback(
    async (provider: Provider, label: string) => {
      const dir = await accountDir(`${provider.id} ${label}`);
      const acc: Account = { id: crypto.randomUUID(), label, dir, provider: provider.id };
      mutateAccounts((prev) => ({ ...prev, list: [...prev.list, acc] }));
      // With no credentials in that folder, the CLI opens its own login flow.
      addPane(
        `${label} · ${provider.label}`,
        raiz(),
        providerCommand(provider.id),
        undefined,
        acc,
      );
    },
    [addPane, mutateAccounts],
  );

  const removeAccount = useCallback(
    (acc: Account) => {
      mutateAccounts((prev) => ({
        list: prev.list.filter((a) => a.id !== acc.id),
        def: prev.def === acc.id ? MAIN_ACCOUNT.id : prev.def,
      }));
      // Panes already running keep their own process: killing them here would
      // take work away without being asked.
      forgetAccount(acc.dir).catch(() => {});
    },
    [mutateAccounts],
  );

  /**
   * Retomar una sesión. Una sesión, en UN sitio.
   *
   * Dos `claude --resume` sobre la misma sesión no se reparten el trabajo: se
   * pelean por el mismo archivo de transcript y uno se queda bloqueado, con
   * cero CPU, sin avanzar y sin decir por qué. Lo que más lo dispara es
   * `/compact`, que es justo la operación que más escribe: se queda clavado en
   * un porcentaje y no sale de ahí.
   *
   * Munir perdió media tarde con esto. Abrió en un panel la MISMA sesión que
   * tenía viva en la app de escritorio, y desde fuera es idéntico a que la
   * terminal se congele — no hay ningún mensaje de error en ninguno de los dos
   * lados (2026-07-30).
   *
   * El dato para evitarlo ya lo teníamos: `s.live` dice si la sesión está
   * corriendo en algún proceso vivo, y los paneles abiertos llevan su id en el
   * comando. Solo faltaba mirarlos antes de abrir.
   */
  /**
   * Las conversaciones que YA están en un panel de Adeorq.
   *
   * Lo sabe el propio comando del panel (`--resume <id>`), así que no hace
   * falta guardar nada aparte. Con esto, el asistente puede enseñar cuáles ya
   * tienes en vez de ofrecértelas otra vez: abrir dos veces la misma sesión es
   * la forma más fácil de bloquear las dos.
   */
  const sesionesEnPantalla = useMemo(
    () => new Set(panes.map((p) => sessionIdOf(p.command)).filter((x): x is string => !!x)),
    [panes],
  );

  const onResume = useCallback(
    (s: SessionInfo, grupo?: string) => {
      // Ya abierta AQUÍ: no se abre otra, se va a la que hay. Duplicar el panel
      // es la forma más fácil de provocar el bloqueo, y además nunca es lo que
      // quieres: querías volver a esa conversación, y esa conversación es esa.
      const abierto = panes.find((p) => sessionIdOf(p.command) === s.id);
      if (abierto) {
        setView("cabina");
        setMaximizedId(null);
        setFocusedId(abierto.id);
        setTecladoReq((prev) => ({ id: abierto.id, n: (prev?.n ?? 0) + 1 }));
        return;
      }
      // Viva FUERA de Adeorq (la app de escritorio, otra terminal, otro
      // Adeorq). Aquí no se puede saltar a ella porque no es nuestra, así que
      // se dice y no se abre: abrirla es exactamente lo que la cuelga.
      if (s.live) {
        setSesionOcupada(s.title);
        window.clearTimeout(ocupadaTimer.current);
        ocupadaTimer.current = window.setTimeout(() => setSesionOcupada(null), 9_000);
        return;
      }
      const cwd = s.resumeCwd || s.cwd || raiz();
      // En SU cuenta, no en la que esté por defecto. Cada cuenta guarda sus
      // propios transcripts, así que un `--resume` lanzado desde otra contesta
      // «No conversation found» y el panel se queda con una sesión en blanco:
      // parecía que la conversación se hubiera perdido.
      const suya = s.cuenta
        ? accountsRef.current.list.find((a) => a.dir === s.cuenta)
        : undefined;
      addPane(s.title, cwd, claudeCommand(withEffort(`--resume ${s.id}`)), undefined, suya, undefined, undefined, grupo);
    },
    [addPane, panes],
  );

  /**
   * Lo que escribes en el chat, bajado a la terminal de esa misma sesión.
   *
   * Aquí es donde la cara se pega al motor: el chat no habla con ninguna API,
   * habla con TU CLI, y por eso gasta tu suscripción en vez de una clave (ver
   * `docs/CHAT.md` §3). Si esa conversación no está abierta como terminal, se
   * abre primero y se espera a que el CLI arranque; escribir en un PTY que
   * todavía está pintando su pantalla se come parte del texto, que es el mismo
   * motivo por el que los `/model` van escalonados.
   *
   * Y como en todo lo demás de la casa: los ajustes se envían, el mensaje
   * también, porque aquí SÍ le has dado a enviar. Es la diferencia con el
   * Asistente, que solo deja el encargo escrito.
   */
  const enviarAlChat = useCallback(
    (s: SessionInfo, texto: string, modelo?: string, esfuerzo?: string) => {
      const ajustes = [modelo ? `/model ${modelo}` : "", esfuerzo ? `/effort ${esfuerzo}` : ""]
        .filter(Boolean);
      const escribir = (id: number) => {
        ajustes.forEach((linea, i) => {
          window.setTimeout(() => void writePty(id, `${linea}\r`).catch(() => {}), i * 400);
        });
        window.setTimeout(
          () => void writePty(id, `${texto}\r`).catch(() => {}),
          ajustes.length * 400 + 250,
        );
      };

      const abierto = panesRef.current.find((p) => sessionIdOf(p.command) === s.id);
      if (abierto) {
        escribir(abierto.id);
        return;
      }
      // Sin panel: se abre y se espera a que exista. `onResume` no devuelve el
      // id (lo crea React), así que se busca el que aparece con esta sesión
      // dentro; si en cinco segundos no ha nacido, es que no se pudo abrir
      // (una sesión viva fuera de Adeorq, por ejemplo) y no se escribe nada, en
      // vez de mandar el texto a la terminal equivocada.
      onResume(s);
      const desde = Date.now();
      const espera = window.setInterval(() => {
        const p = panesRef.current.find((x) => sessionIdOf(x.command) === s.id);
        if (p) {
          window.clearInterval(espera);
          // Un respiro para que el CLI termine de pintar su pantalla de inicio.
          window.setTimeout(() => escribir(p.id), 1200);
        } else if (Date.now() - desde > 5_000) {
          window.clearInterval(espera);
        }
      }, 200);
    },
    [onResume],
  );

  const openAgy = useCallback(
    (name: string, cwd: string, prompt?: string) => {
      if (!agyExe.current) return;
      addPane(`${name} · antigravity`, cwd, agyCommand(agyExe.current, prompt));
    },
    [addPane],
  );

  // The wizard hands back a folder and a tool; turning that into a command is
  // this file's job, same as every other opener here.
  const launchFromWizard = useCallback(
    (l: Launch) => {
      setWizard(false);
      const tag =
        l.provider === "shell"
          ? "terminal"
          : // El de casa se llama por su modelo y no por «ollama»: en el mosaico
            // lo que hace falta saber es con QUIÉN estás hablando, y «ollama» es
            // el programa, no el interlocutor.
            l.provider === "ollama"
            ? (l.localModel ?? "local")
            : l.provider;
      // A command per terminal, never a shared one: each Claude has to carry
      // its own --session-id or they would all resume the same conversation.
      //
      const commandFor = () =>
        comandoDe({
          cli: l.provider,
          modelo: l.model,
          plan: l.plan,
          modeloLocal: l.localModel,
          agyExe: agyExe.current,
        });

      const n = Math.max(1, Math.min(l.count, openAllCap));
      for (let i = 0; i < n; i++) {
        const label = n === 1 ? `${l.name} · ${tag}` : `${l.name} · ${tag} ${i + 1}`;
        // Staggered: nine CLIs starting at the same instant fight for the CPU
        // and every one of them feels slow.
        window.setTimeout(
          () => addPane(label, l.cwd, commandFor(), undefined, l.account),
          i * OPEN_ALL_STAGGER_MS,
        );
      }

      // Once they are all in, deal them into a grid. Only if these are the
      // ONLY panes: a board he already arranged is his, not ours to re-deal.
      if (n > 1) {
        window.setTimeout(() => {
          setCols((prev) => {
            const total = prev.reduce((k, c) => k + c.panes.length, 0);
            return total === n
              ? applyPreset(prev, presetFor(n), () => nextCol.current++)
              : prev;
          });
        }, n * OPEN_ALL_STAGGER_MS + 150);
      }
    },
    [addPane, openAllCap],
  );

  /**
   * Traer conversaciones desde el asistente del ＋: a la BARRA, no a la pantalla.
   *
   * Antes abría una terminal por cada una, y con eso el botón de «tráete las que
   * te faltan» era una forma de encender ciento veintidós CLIs de 200 MB a la
   * vez. Munir lo cortó en seco el 2026-08-06: «que no se abran directamente,
   * sino que se abran solo en el menú de la izquierda». Traer es hacerlas
   * visibles y a mano; abrirlas es un clic tuyo, cuando quieras y de una en una.
   *
   * Quien guarda esa lista es la barra, que es la dueña del estado de la
   * interfaz (`adeorq-state.json`) y la única que lo escribe: si lo escribiera
   * también desde aquí, dos escrituras seguidas se pisarían.
   */
  const retomarVarias = useCallback((sesiones: SessionInfo[]) => {
    setWizard(false);
    if (!sesiones.length) return;
    setTraerReq((prev) => ({
      ids: sesiones.map((s) => s.id),
      n: (prev?.n ?? 0) + 1,
    }));
    // Y se despliega el proyecto de la primera, que puede estar al final de la
    // lista y plegado: eso es lo mismo que no estar cuando lo que quieres es
    // comprobar que llegó. Va con el id además del nombre porque el sitio de
    // una sesión lo puedes haber decidido tú arrastrándola, y eso solo lo sabe
    // la barra (`ui.sessionProject`).
    const s0 = sesiones[0];
    setFocusReq((prev) => ({ name: s0.project, sesion: s0.id, n: (prev?.n ?? 0) + 1 }));
  }, []);

  /**
   * Mete esta sesión en el grupo de su cuadrilla, creándolo si es la primera.
   *
   * Reaprovecha el agrupado manual que la barra lateral ya tenía («▣ Mover a
   * grupo…»): una cuadrilla no necesita un mueble nuevo, necesita rellenar
   * ese mismo mueble sola. El id del grupo es el id de la cuadrilla, así que
   * dos puestos de la misma cuadrilla caen siempre en el mismo grupo aunque
   * esta función se llame una vez por puesto.
   */
  const meterEnGrupoDeCuadrilla = useCallback((sid: string, cwd: string, team: Team) => {
    const proyecto = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd;
    uiStateChain.current = uiStateChain.current
      .then(() => loadUiState())
      .then((ui) => {
        const yaEsta = ui.groups.some((g) => g.id === team.id);
        const groups = yaEsta
          ? ui.groups
          : [...ui.groups, { id: team.id, project: proyecto, name: team.objetivo, color: team.color }];
        const sessionGroup = { ...ui.sessionGroup, [sid]: team.id };
        return saveUiState({ ...ui, groups, sessionGroup });
      })
      .then(() => setRefreshKey((k) => k + 1))
      .catch(() => {
        // Si esto falla la cuadrilla se sigue abriendo igual: agruparla en la
        // barra es una comodidad de encima, no una condición para trabajar.
      });
  }, []);

  const openClaudePrompt = useCallback(
    (
      label: string,
      cwd: string,
      prompt: string,
      model?: string,
      team?: Team,
      shadow?: boolean,
      /** Lo que añade el router: con cuánto esfuerzo nace, y en qué cuenta. */
      extras?: { esfuerzo?: string; cuenta?: Account },
    ) => {
      // Single-quote for PowerShell -Command; embedded quotes double up. El
      // `true` del `newClaudeCommand` de abajo es lo que garantiza que el
      // envoltorio sea PowerShell y estas comillas signifiquen algo.
      const safe = prompt.replace(/'/g, "''");
      // The model goes on the command line, not through /model afterwards: a
      // pane born on the right model never spends a token on the wrong one.
      // Y por lo mismo el esfuerzo: `withEffort` respeta el que venga escrito,
      // así que poner uno aquí gana al de sus ajustes sin pisárselo.
      const extra = [
        model ? `--model ${model}` : "",
        extras?.esfuerzo ? `--effort ${extras.esfuerzo}` : "",
        `'${safe}'`,
      ]
        .filter(Boolean)
        .join(" ");
      const command = newClaudeCommand(extra, undefined, true);
      // Y queda apuntado PARA QUÉ se abrió, indexado por el id de sesión que
      // acaba de acuñar ese comando. El título que verás luego en la lista lo
      // pone Claude resumiendo la charla, y eso no dice de qué encargo salió:
      // media hora después son siete nombres cortados y ninguna pista.
      const sid = command.join(" ").match(/--session-id\s+([0-9a-f-]{8,})/i)?.[1];
      if (sid) {
        void saveEncargo(sid, {
          encargo: prompt.trim().slice(0, 600),
          rol: team?.rol,
          objetivo: team?.objetivo,
          cuando: new Date().toISOString(),
        }).catch(() => {});
        if (team) meterEnGrupoDeCuadrilla(sid, cwd, team);
      }
      // Su cuadrilla ES su grupo, con el mismo id: así apartarla desde la barra
      // de la Cabina y desde la barra lateral son la misma acción sobre la
      // misma cosa, en vez de dos mecanismos que hay que mantener a la par.
      addPane(label, cwd, command, undefined, extras?.cuenta, team, shadow, team?.id);
    },
    [addPane, meterEnGrupoDeCuadrilla],
  );

  /**
   * Abre una terminal nueva tal como la recetó el router (`lib/router.ts`): su
   * CLI, su cuenta, su cerebro y su esfuerzo, con el encargo ya dentro.
   *
   * Existe aparte de `openClaudePrompt` porque la receta puede no ser de
   * Claude, y ahí las reglas cambian: solo Claude y Antigravity aceptan un
   * encargo en la línea de arranque. Al resto se les abre la terminal y el
   * encargo va al portapapeles, que es exactamente lo que el Capataz ya hacía
   * con Antigravity antes de que su CLI existiera.
   */
  /**
   * Seguir esta terminal en otra cuenta, con acta.
   *
   * Lo usan los dos caminos: el aviso cuando una cuenta se agota, y el clic
   * derecho del panel cuando lo decides tú. Es el mismo trabajo, así que es la
   * misma función: si un día se mejora el acta, mejora en los dos sitios.
   */
  const relevar = useCallback(
    (
      cuenta: Account,
      origen: { cwd: string; name?: string; sessionId?: string; account?: string },
    ) => {
      const proj = origen.cwd.split(/[\\/]/).filter(Boolean).pop() ?? "claude";
      void actaDeRelevo(origen)
        .then((acta) => {
          openClaudePrompt(`${proj} · relevo`, origen.cwd, acta, undefined, undefined, undefined, {
            cuenta,
          });
        })
        .catch(() => {
          // Sin acta se abre igual: quedarse sin relevo porque no se pudo leer
          // un transcript sería el peor cambio posible.
          addPane(`${proj} · ${cuenta.provider}`, origen.cwd, providerCommand(cuenta.provider), undefined, cuenta);
        });
    },
    [addPane, openClaudePrompt],
  );

  const openReceta = useCallback(
    (
      r: { cli: string; cuenta?: Account; modelo?: string; esfuerzo?: string },
      cwd: string,
      label: string,
      encargo: string,
      /** Con qué cuadrilla nace, si nace dentro de una. Va hasta el final por
          los tres caminos: el tablero de la Cabina no sabe quién abrió la
          terminal, solo si lleva la marca puesta, y una receta que no sea de
          Claude la perdía por el camino. */
      team?: Team,
      shadow?: boolean,
    ) => {
      const plan = planDeArranque({
        cli: r.cli,
        encargo,
        modelo: r.modelo,
        esfuerzo: r.esfuerzo,
        agyExe: agyExe.current,
      });
      // Claude no se abre con un comando y ya: `openClaudePrompt` además cuenta
      // el encargo por el PTY y engancha la sesión, así que ese camino se queda
      // suyo. Lo que ya NO se pregunta aquí es «¿eres Claude?», sino en qué
      // acabó el plan.
      if (plan.tipo === "claude") {
        openClaudePrompt(label, cwd, encargo, r.modelo, team, shadow, {
          esfuerzo: r.esfuerzo,
          cuenta: r.cuenta,
        });
        return;
      }
      if (plan.tipo === "linea" && plan.alPortapapeles) {
        void navigator.clipboard.writeText(plan.alPortapapeles).catch(() => {});
      }
      addPane(label, cwd, comandoDelPlan(plan), undefined, r.cuenta, team, shadow);
    },
    [addPane, openClaudePrompt],
  );

  /* ── LA SESIÓN SUPREMA ───────────────────────────────────────────────────
     Un agente con el MCP de Adeorq puesto pide abrir otra terminal, o unir dos
     con una flecha. Rust no sabe montar un panel (eso es React), así que emite
     el pedido y espera aquí; lo que decide qué abrir vive aparte, en
     `lib/supremo.ts`, para poder probarlo sin abrir la app.

     Los topes (seis vivas, doce por hora) están en Rust a propósito: son
     presupuesto, y el presupuesto no lo guarda quien lo gasta. El plano entero
     está en `docs/SUPREMA.md`. */
  const enlazarRef = useRef<((from: number, to: number, auto: boolean) => boolean) | null>(null);

  useEffect(() => {
    const atender = async (p: PedidoMcp) => {
      const responder = (r: Parameters<typeof mcpReply>[1]) =>
        void mcpReply(p.peticion, r).catch(() => {});
      try {
        if (p.clase === "link_panes") {
          const hecho = enlazarRef.current?.(Number(p.from), Number(p.to), !!p.auto);
          responder(
            hecho
              ? {}
              : {
                  error:
                    "No se pudo dibujar: las flechas solo existen en el Lienzo, y esas dos terminales tienen que estar las dos allí.",
                },
          );
          return;
        }
        // Cuánto queda en cada cuenta. Lo contesta la ventana y no Rust porque
        // aquí ya está leído y guardado: preguntárselo otra vez a los CLIs
        // costaría un proceso de cinco segundos por cuenta para saber lo mismo.
        if (p.clase === "uso") {
          // Con reloj: el puente de Rust espera 25 s como mucho, y refrescar la
          // cuota de tres cuentas frías son tres procesos de cinco segundos.
          // Ocho segundos dan de sobra para refrescar lo que haga falta, y si
          // no llega se contesta con lo último que se supo, que es infinitamente
          // mejor que dejar al agente sin respuesta.
          const vivas = await fotoRapida(accountsRef.current.list, 8000);
          responder({ parte: parteDelEquipo(vivas) });
          return;
        }
        if (p.clase !== "open_pane") {
          responder({ error: `No sé atender «${p.clase}».` });
          return;
        }

        const elegido = cliPedido(p.cli);
        if ("error" in elegido) return responder({ error: elegido.error });
        const { cli } = elegido;

        const proyectos = await listProjects().catch(() => []);
        const donde = carpetaDe(p, proyectos);
        if ("error" in donde) return responder({ error: donde.error });
        const cwd = donde.cwd;

        const brief = (p.brief ?? "").trim();
        const label = nombreDe(p, cwd, cli);
        // Solo Claude y Antigravity aceptan el encargo en la línea de arranque.
        // Al resto se les abre la terminal y se le DICE al agente que lo mande
        // él: meterle texto suelto a un CLI que espera un subcomando es abrirle
        // una terminal con un error dentro.
        const conEncargo = !!brief && ARRANCAN_CON_ENCARGO.has(cli);
        const command = comandoDe({ cli, encargo: brief, agyExe: agyExe.current });

        const abierto = addPane(label, cwd, command);
        if (!abierto) return responder({ error: "no pude abrir la terminal" });

        // La flecha de paso, si la pidió: así el árbol le queda hecho sin una
        // segunda llamada. Solo cuela en el lienzo, y se dice cuando no.
        let flecha: "hecha" | "sin-lienzo" | undefined;
        if (typeof p.from === "number" && p.from > 0) {
          const ok =
            abierto.donde === "lienzo" &&
            !!enlazarRef.current?.(p.from, abierto.id, false);
          flecha = ok ? "hecha" : "sin-lienzo";
        }

        responder({
          pane_id: abierto.id,
          donde: abierto.donde,
          parte: parteDeApertura({
            paneId: abierto.id,
            cli,
            donde: abierto.donde,
            conEncargo: conEncargo || !brief,
            flecha,
          }),
        });
      } catch (e) {
        responder({ error: String(e) });
      }
    };

    let vivo = true;
    const un = onPedidoMcp((p) => {
      if (vivo) void atender(p);
    });
    return () => {
      vivo = false;
      void un.then((f) => f()).catch(() => {});
    };
  }, [addPane]);

  /* Una terminal que estaba fuera ha cerrado su ventana: vuelve al tablero tal
     como se fue. Vuelve y NO muere, que es la diferencia entre esto y la X de
     un panel: cerrar la ventana suelta es «tráemela», no «mátala». Para matar
     al agente está su X de dentro, que sigue siendo la de siempre. */
  useEffect(() => {
    let vivo = true;
    const un = onVuelvePanel((id) => {
      if (!vivo) return;
      const p = fueraRef.current.get(id);
      if (!p) return;
      fueraRef.current.delete(id);
      // La marca de mudanza, fuera. Si la ventana murió tan pronto que el panel
      // ni llegó a desmontarse, nadie la habría gastado, y una marca olvidada
      // deja esa terminal sin poder matarse nunca con su X.
      cancelaMudanza(id);
      // Por si acaso llegara dos veces: un panel duplicado en la lista son dos
      // terminales pintando el mismo proceso y el teclado yendo por duplicado.
      setPanes((prev) => (prev.some((x) => x.id === id) ? prev : [...prev, p]));
      // Y hay que devolverle su hueco en el mosaico. Un panel que está en la
      // lista pero no en ninguna columna no se pinta (el render lo salta si no
      // tiene sitio), así que sin esto la terminal volvía a existir y no se
      // veía por ninguna parte.
      setCols((prev) =>
        prev.some((c) => c.panes.includes(id))
          ? prev
          : layoutAdd(prev, id, () => nextCol.current++),
      );
    });
    return () => {
      vivo = false;
      void un.then((f) => f()).catch(() => {});
    };
  }, []);

  /** Abre una cuadrilla entera: una terminal por puesto, todas marcadas con el
      mismo color y sabiendo que trabajan juntas. Se escalonan unos cientos de
      milisegundos porque arrancar seis Claudes a la vez es medio giga de golpe
      y la ventana se queda tiesa mientras tanto. */
  const openTeam = useCallback(
    (
      objetivo: string,
      cwd: string,
      partes: Array<{
        label: string;
        prompt: string;
        model?: string;
        /** Lo decide el router por el puesto: el que traduce cadenas no
         *  necesita el mismo esfuerzo que el que audita seguridad. */
        esfuerzo?: string;
        rol: string;
        cwd?: string;
        /** Con qué cliente y en qué cuenta. Sin `cli` es claude, que es como
         *  nació esto y como lo siguen llamando los dos caminos del Capataz. */
        cli?: string;
        cuenta?: Account;
        /** Lo que se le pidió en cristiano. Sin esto el tablero enseña el
         *  prompt entero, con el acta y las reglas del reparto dentro. */
        encargo?: string;
        frontera?: string;
      }>,
      shadow?: boolean,
    ) => {
      const id = `t${Date.now().toString(36)}`;
      const color = TEAM_COLORS[teamColor.current++ % TEAM_COLORS.length];
      // El mismo para todos los puestos: es cuándo se abrió LA CUADRILLA, no
      // cuándo le tocó el turno a cada uno dentro del escalonado.
      const desde = Date.now();
      partes.forEach((parte, i) => {
        const team: Team = {
          id,
          objetivo,
          color,
          rol: parte.rol,
          encargo: parte.encargo ?? parte.prompt,
          frontera: parte.frontera,
          desde,
          n: i + 1,
          de: partes.length,
        };
        window.setTimeout(
          () =>
            openReceta(
              {
                cli: parte.cli ?? "claude",
                cuenta: parte.cuenta,
                modelo: parte.model,
                esfuerzo: parte.esfuerzo,
              },
              parte.cwd ?? cwd,
              parte.label,
              parte.prompt,
              team,
              shadow,
            ),
          i * OPEN_ALL_STAGGER_MS,
        );
      });
    },
    [openReceta],
  );

  const onOpenAll = useCallback(
    (name: string, cwd: string, sessions: SessionInfo[], grupo?: string) => {
      if (!sessions.length) {
        openTerminal(name, cwd);
        return;
      }
      // Abrir un grupo es ENTRAR en él: los demás que tengan terminales
      // abiertas se apartan, sin cerrarse. Sin esto, abrir el segundo grupo
      // dejaba los dos encima y salía el aviso de «esa sesión ya está
      // abierta» (Munir, 2026-08-02). Se calcula de los paneles que hay, así
      // que solo aparta grupos que de verdad estorban.
      if (grupo) {
        setGruposOcultos(
          new Set(
            panesRef.current
              .map((p) => p.grupo)
              .filter((g): g is string => !!g && g !== grupo),
          ),
        );
        // Y las que no son de ningún grupo, que también estaban ahí. Apartar
        // solo los OTROS grupos dejaba encima la terminal en la que estabas
        // trabajando, así que entrar en un grupo no era entrar en ningún
        // sitio: era sumar (Munir, 2026-08-02). Todas bajan a la tira del pie,
        // vivas, contadas y diciendo qué hacen.
        setMinimizados((prev) => {
          const s = new Set(prev);
          for (const p of panesRef.current) if (!p.grupo) s.add(p.id);
          return s;
        });
      }
      sessions.slice(0, openAllCap).forEach((s, i) => {
        if (i === 0) onResume(s, grupo);
        else window.setTimeout(() => onResume(s, grupo), i * OPEN_ALL_STAGGER_MS);
      });
    },
    [openTerminal, onResume, openAllCap],
  );

  const createCanvasPane = useCallback(
    (
      kind: "claude" | "shell" | "agy",
      project: Project,
      // Una terminal del lienzo con un encargo concreto (froede): el nombre y
      // el comando los pone quien la pide, porque eso no es ni un agente ni una
      // consola vacía, es una herramienta puesta a andar.
      propio?: { name?: string; command?: string[] },
      /** En qué cuenta nace, cuando la eligió el router. Sin esto el lienzo
          abría siempre en la principal. */
      cuenta?: Account,
    ): CanvasPane => {
      const id = nextId.current++;
      // Sin `propio.command`, el kind manda. El lienzo solo guarda `claude`,
      // `agy` y `shell` (lo convierte en `CanvasView`), así que aquí «el resto»
      // es siempre la consola pelada.
      const command = propio?.command ?? comandoDe({ cli: kind, agyExe: agyExe.current });
      const { env, etiqueta } = entornoDePane(command, cuenta);
      const pane: CanvasPane = {
        id,
        cwd: project.path,
        name:
          propio?.name ??
          // El rótulo sale de la tabla, en minúscula como el resto de nombres
          // del lienzo. Antes había tres casos escritos a mano y un CLI nuevo
          // salía como «terminal» aunque fuese un agente.
          `${project.name} · ${kind === "shell" ? "terminal" : providerOf(kind).label.toLowerCase()}`,
        command,
        env,
        account: etiqueta,
      };
      setCanvasPanes((prev) => [...prev, pane]);
      return pane;
    },
    [entornoDePane],
  );

  /**
   * Una terminal del LIENZO que nace con un encargo dentro.
   *
   * Es lo que pasa al arrastrar una tarjeta del tablero a «Trabajando». El
   * encargo va en la línea de comando y no escrito después, por lo mismo que en
   * `openClaudePrompt`: una terminal que nace con su encargo no gasta ni un
   * token en no tenerlo. Y queda apuntado por su id de sesión, que es lo que
   * luego permite saber para qué se abrió cada una.
   */
  const lanzarEnLienzo = useCallback(
    async (texto: string, project: Project) => {
      const limpio = texto.trim();
      if (!limpio) return;
      // El MISMO router que usa el Asistente decide con qué nace. Hasta ahora
      // toda tarjeta arrastrada abría un Claude con el modelo por defecto:
      // «traduce los tooltips» y «audita el login» salían iguales. Deducirlo de
      // las palabras de la tarjeta no cuesta un token, es una tabla, así que la
      // tarjeta sigue abriéndose de un tirón.
      const receta = recetar(exigenciaDeRol(limpio), {
        cuentas: await fotoRapida([
          ...PROVIDERS.map((p) => mainAccount(p.id)),
          ...accountsRef.current.list,
        ]),
        avisos: modoAviso(),
        usa: leerPerfil().clis,
      }, undefined, cerebroPorDefecto());
      const titulo = limpio.length > 30 ? `${limpio.slice(0, 30)}…` : limpio;
      const nombre = `${project.name} · ${titulo}`;

      // Solo Claude y Antigravity aceptan el encargo en la línea de arranque;
      // al resto se les abre la terminal y el encargo va al portapapeles. Es la
      // misma regla que `openReceta` aplica en la cabina.
      const plan = planDeArranque({
        cli: receta.cli,
        encargo: limpio,
        modelo: receta.modelo,
        esfuerzo: receta.esfuerzo,
        agyExe: agyExe.current,
      });
      // A quien no acepta el encargo al arrancar se le copia y se le abre la
      // terminal: el plan devuelve el texto justo para esto, así que copiarlo y
      // decidirlo no pueden separarse.
      if (plan.tipo === "linea" && plan.alPortapapeles) {
        void navigator.clipboard.writeText(plan.alPortapapeles).catch(() => {});
      }
      const command = comandoDelPlan(plan);
      if (plan.tipo !== "claude") {
        createCanvasPane(plan.tipo === "agy" ? "agy" : "shell", project, {
          name: nombre,
          command,
        }, receta.cuenta);
        return;
      }
      const sid = sessionIdOf(command);
      if (sid) {
        void saveEncargo(sid, {
          encargo: limpio.slice(0, 600),
          cuando: new Date().toISOString(),
        }).catch(() => {});
      }
      // El nombre, con el encargo cortado: siete terminales llamadas «claude»
      // no se distinguen, y el título que pone Claude tarda en llegar.
      createCanvasPane("claude", project, { name: nombre, command }, receta.cuenta);
    },
    [createCanvasPane],
  );

  const closeCanvasPane = useCallback((id: number) => {
    // La X de un panel del lienzo es una X de verdad, no un movimiento: mata
    // igual que la de la cabina. Ver el comentario de `closePane`.
    void killPty(id).catch(() => {});
    setCanvasPanes((prev) => prev.filter((p) => p.id !== id));
  }, []);

  /**
   * Sacar una terminal a su propia ventana de Windows.
   *
   * El agente NO se toca: su proceso vive en Rust y esto solo cambia quién lo
   * pinta. Por eso el orden importa y no es intercambiable:
   *
   *   1. Se marca la mudanza. Si no, al quitar el panel React lo desmonta, el
   *      desmontaje llama a `killPty` y el agente muere por haberlo movido.
   *   2. Se APUNTA como fuera antes de pedir la ventana. Ver abajo: es lo que
   *      arregla la terminal que desaparecía sin dejar ventana.
   *   3. Se abre la ventana Y SE ESPERA. Quitar el panel antes de saber que la
   *      ventana ha abierto dejaría la terminal en tierra de nadie: fuera del
   *      tablero y sin ventana donde aparecer.
   *   4. Solo entonces se quita de aquí, que es lo que impide que el teclado
   *      llegue por duplicado al mismo agente.
   *
   * ⚠ LA CARRERA QUE SE PERDÍA UNA TERMINAL (Munir, 2026-08-14: «se ha ido la
   * sesión pero no se ha abierto la ventana»). El apunte de «esta está fuera»
   * se hacía DESPUÉS de que la ventana abriera. Si esa ventana moría nada más
   * nacer, su aviso de vuelta llegaba antes que el apunte, no encontraba nada
   * que devolver y se iba de vacío; medio segundo después el `then` quitaba el
   * panel del tablero para siempre. El panel seguía vivo en Rust, pintándose en
   * ningún sitio. Se apunta ANTES, y el `then` solo lo quita si sigue apuntado.
   */
  const sacarFuera = useCallback((id: number) => {
    const p = panesRef.current.find((x) => x.id === id);
    if (!p) return;
    empiezaMudanza(id);
    // Se GUARDA entero, no se tira. Al volver hay que devolverla con su
    // cuadrilla, su cuenta, su entorno y su grupo, y eso no se puede
    // reconstruir preguntándole a Rust: Rust solo sabe la carpeta y el
    // comando, lo demás es cosa del tablero.
    fueraRef.current.set(id, p);
    void sacarPanel(id, p.name)
      .then(() => {
        // Si mientras se abría la ventana ya llegó su aviso de vuelta, el panel
        // ya no está apuntado: entonces NO se quita del tablero, porque volvió.
        if (fueraRef.current.has(id)) {
          setPanes((prev) => prev.filter((x) => x.id !== id));
          // Y su hueco del mosaico, TAMBIÉN. Sin esta línea el panel se iba de
          // la lista pero su sitio seguía reservado, así que quedaba un
          // agujero transparente donde antes había una terminal y las demás no
          // se repartían el espacio. Es lo que Munir contó con estas palabras:
          // «queda como su hueco, pero está invisible» (2026-08-15). `cerrar`
          // ya lo hacía desde siempre; sacar se lo dejó.
          setCols((prev) => layoutRemove(prev, id));
        }
      })
      .catch((e) => {
        // No salió: se deshace todo o esa terminal se quedaría sin poder
        // matarse nunca, que es peor que no haberla sacado. Y queda anotado,
        // porque esta ventana no tiene consola y un catch mudo convierte esto
        // en un «le doy al botón y no pasa nada» imposible de mirar.
        fueraRef.current.delete(id);
        cancelaMudanza(id);
        void anotarRastro(`sacar_panel(${id}) falló: ${e}`);
      });
  }, []);

  const closePane = useCallback((id: number) => {
    // Cerrar MATA, y lo hace aquí mismo. Antes el proceso moría por el camino
    // largo —quitar el panel, que React lo desmonte, y que la limpieza del
    // desmontaje llamara a `killPty`—, o sea que la muerte del agente dependía
    // de que un efecto de React se ejecutara. Pedirlo directamente no depende
    // de nada: la X del panel y el agente se van juntos. Rust mata la rama
    // entera (`claude.exe` es un lanzador y el agente cuelga de él), y llamarlo
    // dos veces no hace daño: la segunda no encuentra sesión y no hace nada.
    void killPty(id).catch(() => {});
    setPanes((prev) => prev.filter((p) => p.id !== id));
    // También las del lienzo: desde que el Capataz las ve, puede proponer
    // cerrar una, y este es el único camino por el que llega ese cierre. El
    // lienzo se entera solo y retira su nodo (ver el efecto de sincronía allí).
    setCanvasPanes((prev) => prev.filter((p) => p.id !== id));
    setPaneStatus((prev) => {
      if (!(id in prev)) return prev;
      const { [id]: _gone, ...rest } = prev;
      return rest;
    });
    setCols((prev) => layoutRemove(prev, id));
    setMaximizedId((m) => (m === id ? null : m));
    setLadoMaxId((l) => (l === id ? null : l));
    setFocusedId((f) => (f === id ? null : f));
  }, []);

  /**
   * El nombre nuevo que se tecleó en la cabecera de una terminal (doble clic
   * en el nombre, Munir 2026-08-16). Vale para las de la Cabina y las del
   * lienzo, que son dos listas: se cambia en la que lo tenga.
   *
   * Y si el panel sabe QUÉ sesión corre dentro (`--resume` o `--session-id` en
   * su comando), el título va también al transcript, con la misma línea
   * `custom-title` que escribe el renombrado de la barra lateral: así la
   * barra, la app oficial y la cabecera dicen lo mismo. Sin id no se toca
   * ningún transcript: adivinar cuál es y escribirle el título a la sesión de
   * otro sería peor que quedarse solo con el nombre del panel.
   */
  const renombrarPane = useCallback((id: number, nombre: string) => {
    setPanes((prev) => prev.map((p) => (p.id === id ? { ...p, name: nombre } : p)));
    setCanvasPanes((prev) => prev.map((p) => (p.id === id ? { ...p, name: nombre } : p)));
    const p =
      panesRef.current.find((x) => x.id === id) ??
      canvasPanesRef.current.find((x) => x.id === id);
    const sid = p ? sessionIdOf(p.command) : undefined;
    if (p && sid) {
      renameSession(carpetaClaude(p.cwd), sid, nombre).catch((e) =>
        // El panel ya quedó renombrado; esto solo deja constancia de que el
        // transcript no se pudo tocar (recién abierto sin mensajes, cuenta
        // rara...), porque desde fuera no se ve y «no pasa nada» no se puede
        // mirar.
        void anotarRastro(`renombrar sesión del panel ${id}: ${e}`),
      );
    }
  }, []);

  /**
   * Abrir un archivo del explorador.
   *
   * Va como PESTAÑA al panel de archivos que ya tengas, y solo se crea uno
   * nuevo si no hay ninguno. Un panel por archivo parte el mosaico en cuatro al
   * tercero, y entonces ni se lee el código ni se ven las terminales.
   *
   * Si ese archivo ya está abierto en algún sitio NO se duplica: se enfoca el
   * que hay. Dos hojas del mismo archivo serían dos textos distintos del mismo
   * sitio, y la segunda que guardara pisaría a la primera sin que ninguna
   * avisara, que es justo lo que este panel existe para evitar.
   */
  const abrirArchivo = useCallback((ruta: string) => {
    setView("cabina");
    const paneles = panesRef.current;

    /* El final común de las tres ramas. Con una sesión a pantalla completa, el
       archivo se pone A SU LADO en vez de al mosaico de detrás: ahí el clic en
       el árbol no enseñaba nada y parecía que no había hecho nada (Munir,
       2026-08-16). */
    const enfocar = (paneId: number) => {
      setFocusedId(paneId);
      if (maximizedRef.current != null && maximizedRef.current !== paneId) {
        setLadoMaxId(paneId);
      }
    };

    const yaAbierto = paneles.find((p) => p.archivos?.includes(ruta));
    if (yaAbierto) {
      setPanes((prev) =>
        prev.map((p) => (p.id === yaAbierto.id ? { ...p, activo: ruta } : p)),
      );
      enfocar(yaAbierto.id);
      return;
    }

    // El que tengas delante manda; si el foco está en una terminal, el primero
    // que haya. Así abrir dos archivos seguidos no los reparte por el mosaico.
    const destino =
      paneles.find((p) => p.id === focusedIdRef2.current && p.archivos) ??
      paneles.find((p) => p.archivos);
    if (destino) {
      setPanes((prev) =>
        prev.map((p) =>
          p.id === destino.id
            ? { ...p, archivos: [...(p.archivos ?? []), ruta], activo: ruta }
            : p,
        ),
      );
      enfocar(destino.id);
      return;
    }

    const id = nextId.current++;
    setPanes((prev) => [
      ...prev,
      {
        id,
        cwd: raizArchivosRef.current,
        name: nombreDeRuta(ruta),
        archivos: [ruta],
        activo: ruta,
      },
    ]);
    setCols((prev) => layoutAdd(prev, id, () => nextCol.current++));
    enfocar(id);
  }, []);

  /** Cerrar UNA pestaña. Con la última se va el panel entero: un panel de
      archivos vacío es un hueco del mosaico que no enseña nada. */
  const cerrarPestana = useCallback(
    (paneId: number, ruta: string) => {
      const p = panesRef.current.find((x) => x.id === paneId);
      const antes = p?.archivos ?? [];
      const quedan = antes.filter((a) => a !== ruta);
      if (!quedan.length) {
        closePane(paneId);
        return;
      }
      // La de al lado, como en cualquier navegador: cerrar no debe dejarte
      // mirando a otra cosa si todavía queda algo abierto.
      const donde = Math.min(antes.indexOf(ruta), quedan.length - 1);
      setPanes((prev) =>
        prev.map((x) =>
          x.id === paneId
            ? {
                ...x,
                archivos: quedan,
                activo: x.activo === ruta ? quedan[donde] : x.activo,
                name: nombreDeRuta(quedan[donde]),
              }
            : x,
        ),
      );
    },
    [closePane],
  );

  /**
   * La vista previa de la web, en un hueco del mosaico.
   *
   * Si ya hay una, se enfoca en vez de abrir otra: dos vistas de la misma
   * página son dos iframes pidiendo lo mismo al mismo servidor de desarrollo,
   * y ninguna de las dos dice nada que no diga la otra.
   */
  const abrirWeb = useCallback(() => {
    setView("cabina");
    const ya = panesRef.current.find((p) => p.web != null);
    if (ya) {
      setFocusedId(ya.id);
      return;
    }
    const id = nextId.current++;
    setPanes((prev) => [
      ...prev,
      { id, cwd: raizArchivosRef.current, name: "localhost", web: "http://localhost:1420" },
    ]);
    setCols((prev) => layoutAdd(prev, id, () => nextCol.current++));
    setFocusedId(id);
  }, []);

  /** La foto de las pestañas del panel web, para que sobrevivan al reinicio.
      Estable a propósito: el panel la llama desde un efecto, y una función
      nueva en cada pintado lo dispararía sin parar y App y el panel se
      retroalimentarían. */
  const onWebEstado = useCallback((paneId: number, tabs: string[], activa: number) => {
    setPanes((prev) =>
      prev.map((x) =>
        x.id === paneId
          ? { ...x, web: tabs[activa] ?? "", webTabs: tabs, webActiva: activa }
          : x,
      ),
    );
  }, []);

  /** Cambiar de pestaña dentro de un panel de archivos. */
  const activarPestana = useCallback((paneId: number, ruta: string) => {
    setPanes((prev) =>
      prev.map((p) =>
        p.id === paneId ? { ...p, activo: ruta, name: nombreDeRuta(ruta) } : p,
      ),
    );
  }, []);

  /**
   * Reanimar un panel cuyo CLI se ha quedado colgado: matar la rama entera y
   * retomar LA MISMA sesión en un panel nuevo. El transcript vive en disco,
   * así que no se pierde nada — es la salida de emergencia para el cuelgue
   * esporádico del CLI de Claude (fallo suyo, conocido, cerrado «not planned»
   * en su GitHub), que antes costaba Administrador de tareas y empezar de
   * cero. Verificado la noche del 2026-07-30: matar el proceso y hacer
   * `--resume` recupera la conversación intacta.
   */
  const revivirPane = useCallback(
    (id: number, sessionId: string | undefined, cwd: string, name: string) => {
      closePane(id); // ya mata la rama del panel
      const command = sessionId
        ? claudeCommand(withEffort(`--resume ${sessionId}`))
        : newClaudeCommand();
      // Un respiro para que el cierre suelte el PTY y el proceso muera antes
      // de que el nuevo intente retomar el mismo transcript.
      window.setTimeout(() => addPane(name, cwd, command), 400);
    },
    [closePane, addPane],
  );

  const splitPane = useCallback(
    (id: number, dir: SplitDir) => {
      const src = panes.find((p) => p.id === id);
      if (src) addPane(`${src.name} · shell`, src.cwd, undefined, { relTo: id, dir });
    },
    [panes, addPane],
  );

  const onToggleMax = useCallback((id: number) => {
    // Maximizar a mano cancela la marca del salto: a partir de ahí es TUYA, y
    // escribir en ella ya no la devuelve al mosaico.
    maxPorSaltoRef.current = null;
    setMaximizedId((prev) => (prev === id ? null : id));
  }, []);

  /**
   * Un agente ha terminado su turno y el ajuste dice que quieres verlo: se
   * pone a pantalla completa y se lleva el teclado, sin tener que buscarlo
   * entre nueve paneles.
   *
   * Con una excepción, y es importante: si en ese momento estás ESCRIBIENDO en
   * otra terminal, no te la quita. Que otro acabe no es motivo para arrancarte
   * el cursor a mitad de una frase, y esa frase se perdería en la terminal que
   * ya no está delante. En ese caso se queda el aviso de siempre (el brillo
   * azul y la campana), que para eso están.
   *
   * "Escribiendo" se mide por teclas pulsadas de verdad y no por dónde está el
   * foco: xterm mantiene un textarea enfocado mientras miras cualquier
   * terminal, así que preguntarle al foco daba que sí siempre y el salto no
   * llegaba a ocurrir nunca. Ver lib/tecleando.
   */
  const saltarA = useCallback((id: number) => {
    setView("cabina");
    setMaximizedId(id);
    maxPorSaltoRef.current = id;
    setFocusedId(id);
    setTecladoReq((prev) => ({ id, n: (prev?.n ?? 0) + 1 }));
  }, []);

  const alTerminar = useCallback(
    (id: number) => {
      if (!saltarAlQueTermina) return;
      /* Si estás escribiendo en otra, este ESPERA SU TURNO. Antes se
         descartaba: no te robaba la pantalla, pero tampoco volvías a saber de
         esa sesión hasta que la buscabas a mano entre nueve (Munir,
         2026-08-11). Ahora hace cola y se le atiende en cuanto sueltas el
         teclado, por orden de llegada. */
      if (tecleandoEnOtro(id)) {
        colaSaltoRef.current = encolar(colaSaltoRef.current, id);
        return;
      }
      saltarA(id);
    },
    [saltarAlQueTermina, saltarA],
  );

  /* El turno de los que esperan. Se mira despacio a propósito: es una cola de
     cortesía, no una alarma, y solo se vacía cuando de verdad has dejado de
     escribir. */
  useEffect(() => {
    if (!saltarAlQueTermina) return;
    const beat = window.setInterval(() => {
      const cola = colaSaltoRef.current;
      if (!cola.length) return;
      const vivos = new Set(panesRef.current.map((p) => p.id));
      const id = aQuienLeToca(cola, vivos);
      // Los que ya no existen salen de la cola aunque no le toque a nadie.
      colaSaltoRef.current = cola.filter((x) => vivos.has(x));
      if (id === null || tecleandoEnOtro(id)) return;
      colaSaltoRef.current = sacarDeCola(colaSaltoRef.current, id);
      saltarA(id);
    }, 1500);
    return () => window.clearInterval(beat);
  }, [saltarAlQueTermina, saltarA]);

  /**
   * Le has contestado a la que estaba a pantalla completa: vuelve el mosaico.
   *
   * Solo si la puso ahí el salto automático. Si la maximizaste tú, escribir en
   * ella no te la quita, que para eso la pusiste.
   */
  const alEscribirEn = useCallback(
    (id: number, data: string) => {
      if (!tocaDesmaximizar(maximizedRef.current, maxPorSaltoRef.current, id, data)) return;
      maxPorSaltoRef.current = null;
      setMaximizedId(null);
    },
    [],
  );
  // Por ref, para que `onPaneStatus` pueda dispararlo sin rehacerse: ese
  // callback lo tienen guardado todos los paneles vivos.
  alTerminarRef.current = alTerminar;

  const goProject = useCallback((name: string) => {
    setView("cabina");
    setFocusReq((prev) => ({ name, n: (prev?.n ?? 0) + 1 }));
  }, []);

  /** Ir a un puesto de la cuadrilla: marcarlo activo y darle el teclado. Sin
      lo segundo, «ir a la terminal que te espera» te dejaba delante de ella
      pero teniendo que hacer otro clic para poder contestarle. */
  const irAPuesto = useCallback((id: number) => {
    setMaximizedId(null);
    setFocusedId(id);
    setTecladoReq((prev) => ({ id, n: (prev?.n ?? 0) + 1 }));
  }, []);

  /**
   * Las terminales abiertas ahora, para la barra lateral.
   *
   * La barra lista transcripts, y una consola pelada no escribe ninguno: abrir
   * una sesión suelta de terminal no salía por ningún lado y parecía perdida
   * (Munir, 2026-07-30). Con esto la barra puede enseñar lo que está vivo
   * además de lo que se puede retomar.
   */
  const abiertas = useMemo(
    () => [
      ...panes.map((p) => ({
        paneId: p.id,
        name: p.name,
        cwd: p.cwd,
        command: p.command,
        agente: !!p.command,
        enLienzo: false,
        cuenta: p.account,
      })),
      ...canvasPanes.map((p) => ({
        paneId: p.id,
        name: p.name,
        cwd: p.cwd,
        command: p.command,
        agente: !!p.command,
        enLienzo: true,
        cuenta: p.account,
      })),
    ],
    [panes, canvasPanes],
  );

  /** Llevarte a una terminal viva desde la barra, esté en la vista que esté. */
  const irATerminal = useCallback(
    (id: number, enLienzo: boolean) => {
      if (enLienzo) {
        // En el lienzo el foco lo lleva la propia vista: aquí basta con
        // cambiarla y pedirle el teclado, que es lo que acerca la cámara.
        setView("lienzo");
        setTecladoReq((prev) => ({ id, n: (prev?.n ?? 0) + 1 }));
        return;
      }
      setView("cabina");
      irAPuesto(id);
    },
    [irAPuesto],
  );

  const onCreated = useCallback(
    (name: string) => {
      setRefreshKey((k) => k + 1);
      goProject(name);
    },
    [goProject],
  );

  // Remember the board on every change, so a crash or an update loses nothing:
  // the same panes, in the same folders, with the same sizes.
  useEffect(() => {
    if (!restored.current) return;
    const order = new Map<number, number>();
    const saved: SavedPane[] = [];
    panes.forEach((pane) => {
      order.set(pane.id, saved.length);
      saved.push({
        name: pane.name,
        cwd: pane.cwd,
        command: pane.command,
        env: pane.env,
        account: pane.account,
        team: pane.team,
        grupo: pane.grupo,
        minimizado: minimizados.has(pane.id) || undefined,
        archivos: pane.archivos,
        activo: pane.activo,
        web: pane.web,
        webTabs: pane.webTabs,
        webActiva: pane.webActiva,
      });
    });
    const layout: SavedLayout = {
      panes: saved,
      cols: cols.map((c) => ({
        w: c.w,
        hs: c.hs,
        idx: c.panes.map((id) => order.get(id) ?? -1).filter((i) => i >= 0),
      })),
      ocultos: [...gruposOcultos],
    };
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  }, [panes, cols, minimizados, gruposOcultos]);

  // ...and bring it back when Adeorq opens, one pane at a time so twelve CLIs
  // do not start at once. Each Claude resumes ITS OWN conversation.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (!restoreOnStart) return;
    let layout: SavedLayout | null = null;
    try {
      layout = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null") as SavedLayout;
    } catch {
      layout = null;
    }
    if (!layout?.panes?.length) return;
    const saved = layout;
    let cancelled = false;
    setRestoring(saved.panes.length);
    // Antes de abrir nada: si los grupos apartados llegaran después de sus
    // terminales, se verían un instante todas encima, que es justo lo que se
    // había apartado.
    if (saved.ocultos?.length) setGruposOcultos(new Set(saved.ocultos));
    void (async () => {
      // Before rebuilding anything: the restored panes are precisely the ones
      // that were coming back without their effort, so the answer has to be in
      // hand before the first command line is written.
      await loadEffort();
      const ids: number[] = [];
      for (const pane of saved.panes) {
        if (cancelled) return;
        // Un archivo abierto vuelve tal cual: no hay conversación que retomar
        // ni proceso que arrancar, así que tampoco hace falta el respiro entre
        // uno y otro (eso es para que no arranquen doce CLIs a la vez).
        if (pane.web != null) {
          const id = nextId.current++;
          ids.push(id);
          setPanes((prev) => [
            ...prev,
            {
              id,
              cwd: pane.cwd,
              name: pane.name,
              web: pane.web,
              webTabs: pane.webTabs,
              webActiva: pane.webActiva,
            },
          ]);
          if (pane.minimizado) setMinimizados((prev) => new Set(prev).add(id));
          setCols((prev) => layoutAdd(prev, id, () => nextCol.current++));
          setRestoring((n) => n - 1);
          continue;
        }
        if (pane.archivos?.length) {
          const abiertos = pane.archivos;
          const id = nextId.current++;
          ids.push(id);
          setPanes((prev) => [
            ...prev,
            {
              id,
              cwd: pane.cwd,
              name: pane.name,
              archivos: abiertos,
              activo: pane.activo ?? abiertos[0],
            },
          ]);
          if (pane.minimizado) setMinimizados((prev) => new Set(prev).add(id));
          setCols((prev) => layoutAdd(prev, id, () => nextCol.current++));
          setRestoring((n) => n - 1);
          continue;
        }
        const command = await resumeCommandFor(pane);
        const id = nextId.current++;
        ids.push(id);
        // env comes back with the pane: a terminal that belonged to an account
        // must be reborn in that same account, or it would resume a
        // conversation the main account cannot see.
        setPanes((prev) => [
          ...prev,
          {
            id,
            cwd: pane.cwd,
            name: pane.name,
            command,
            env: pane.env,
            account: pane.account,
            team: pane.team,
            grupo: pane.grupo,
          },
        ]);
        // Lo apartado sigue apartado: el id es nuevo, así que se marca aquí,
        // con el panel en la mano, y no con la lista de ids del arranque
        // anterior, que ya no señala a estas terminales.
        if (pane.minimizado) setMinimizados((prev) => new Set(prev).add(id));
        setCols((prev) => layoutAdd(prev, id, () => nextCol.current++));
        setRestoring((n) => n - 1);
        await new Promise((r) => window.setTimeout(r, RESTORE_STAGGER_MS));
      }
      if (cancelled) return;
      // The mosaic goes back exactly as it was, sizes included.
      const cols: Col[] = (saved.cols ?? [])
        .map((c) => ({
          cid: nextCol.current++,
          w: c.w || 1,
          panes: c.idx.map((i) => ids[i]).filter((x) => x !== undefined),
          hs: c.idx.map((_, k) => c.hs?.[k] || 1),
        }))
        .filter((c) => c.panes.length > 0);
      setCols(
        cols.length
          ? cols
          : [{ cid: nextCol.current++, w: 1, panes: ids, hs: ids.map(() => 1) }],
      );
      setView("cabina");
    })();
    return () => {
      cancelled = true;
    };
  }, [restoreOnStart]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      const k = e.key.toLowerCase();
      if ((k === "d" || e.key === "ArrowDown") && focusedId != null) {
        e.preventDefault();
        splitPane(focusedId, "down");
      } else if (e.key === "ArrowRight" && focusedId != null) {
        e.preventDefault();
        splitPane(focusedId, "right");
      } else if (k === "f" && focusedId != null) {
        e.preventDefault();
        onToggleMax(focusedId);
      } else if (k === "a") {
        e.preventDefault();
        // Abierto a mano no graba: solo el atajo del micrófono pone esto.
        setDictarAlAbrir(false);
        setShowForeman((v) => !v);
      } else if (k === "m" && !showForeman) {
        // Dictar desde donde estés: se abre el Asistente ya grabando. Con el
        // Asistente abierto este atajo es suyo (enciende y apaga), y por eso
        // aquí solo se coge cuando está cerrado: si lo cogieran los dos, un
        // Ctrl+Mayús+M abriría dos micrófonos a la vez.
        e.preventDefault();
        setDictarAlAbrir(true);
        setShowForeman(true);
      } else if (k === "p") {
        e.preventDefault();
        setPanic((v) => !v);
      } else if (k === "e") {
        e.preventDefault();
        setStream((v) => {
          localStorage.setItem(STREAM_KEY, v ? "0" : "1");
          return !v;
        });
      } else if (k === "t") {
        e.preventDefault();
        const src = panes.find((p) => p.id === focusedId);
        addPane(
          src ? `${src.name} · shell` : "proyectos · terminal",
          src?.cwd ?? raiz(),
        );
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [focusedId, panes, addPane, splitPane, onToggleMax]);

  useEffect(() => {
    if (!stream) {
      setPeek(false);
      return;
    }
    const down = (e: KeyboardEvent) => {
      if (e.key === "Alt") setPeek(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") setPeek(false);
    };
    // Losing focus with Alt held would leave everything exposed.
    const off = () => setPeek(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", off);
    };
  }, [stream]);

  const onDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setSideW(Math.min(480, Math.max(200, e.clientX - 52)));
  }, []);

  const onDragEnd = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    setSideW((w) => {
      localStorage.setItem(SIDEBAR_KEY, String(w));
      return w;
    });
  }, []);

  /**
   * Ha aparecido algo que no debía verse. Se avisa, y ya está.
   *
   * NO se tapa la pantalla, y el motivo es que taparla no protegía nada: el
   * escudo enmascara los bytes ANTES de que el panel los pinte, así que cuando
   * esto se entera el secreto ya son puntitos. El telón cubría una pantalla en
   * la que no quedaba nada que cubrir; lo único que hacía de verdad era dejar a
   * Munir a ciegas cada vez que un agente imprimía una variable con la palabra
   * KEY en el nombre (que en esta app es todo el rato).
   *
   * Yo mismo lo empeoré el 2026-07-29 al devolver a «alta» dos reglas que
   * Antigravity había bajado. Bajarlas era el arreglo equivocado, pero el
   * problema que intentaba resolver era real: el equivocado era el telón.
   *
   * Se queda como botón MANUAL (Ctrl+Mayús+P), que es para lo que sirve: ha
   * entrado alguien en la habitación y tapas todo tú.
   *
   * Lo grave se distingue durando más en pantalla, no interrumpiendo: el aviso
   * ya se pinta distinto según la severidad (`data-sev` en la barra).
   */
  const onSecret = useCallback((hits: Hit[], severe: boolean) => {
    setBurnt(hits);
    window.clearTimeout(burntTimer.current);
    burntTimer.current = window.setTimeout(() => setBurnt(null), severe ? 9_000 : 5_000);
  }, []);

  const pasteToFocused = useCallback(
    (text: string) => {
      if (focusedId != null) void writePty(focusedId, text).catch(() => {});
    },
    [focusedId],
  );

  // Weekly quota can only be seen from inside a session (/usage), so Settings
  // types the command into the focused pane and takes Munir there to read it.
  const askUsage = useCallback(() => {
    if (focusedId == null) return;
    void writePty(focusedId, "/usage\r").catch(() => {});
    setView("cabina");
  }, [focusedId]);

  /* Qué panel de la derecha se ve. Una sola verdad para las dos vistas: ver
     `LATERAL_KEY` arriba. La clave vieja (`adeorq-skills-open`) se lee una
     única vez para que quien lo tenía cerrado no se lo encuentre abierto. */
  const [cara, setCara] = useState<Cara>(() => {
    const guardada = localStorage.getItem(LATERAL_KEY);
    if (guardada != null) return guardada as Cara;
    return localStorage.getItem("adeorq-skills-open") === "0" ? "" : "skills";
  });
  const cambiarCara = useCallback((c: Cara) => {
    localStorage.setItem(LATERAL_KEY, c);
    setCara(c);
  }, []);

  /* Lo mismo que `askUsage` pero desde el Chat, donde no hay pane enfocado: la
     conversación que estás leyendo ES la sesión, así que el comando va a la
     suya y te lleva a la Cabina, que es donde se ve la tarjeta. */
  const usageDeSesion = useCallback(
    (s: SessionInfo) => {
      enviarAlChat(s, "/usage");
      setView("cabina");
    },
    [enviarAlChat],
  );

  // Moving a pane: pointer-driven, because HTML5 drag never reaches the page
  // here. Press the header, drag over another pane, release: they swap.
  const [drag, setDrag] = useState<{
    id: number;
    name: string;
    x: number;
    y: number;
    over: number | null;
    /** Which half or edge of the target it would land on. */
    edge: Edge;
    /** The preview rectangle, in screen pixels. */
    box: { left: number; top: number; width: number; height: number } | null;
    moved: boolean;
  } | null>(null);

  const onHeaderDown = useCallback(
    (id: number, e: React.PointerEvent) => {
      const pane = panes.find((p) => p.id === id);
      setFocusedId(id);
      setDrag({
        id,
        name: pane?.name ?? "",
        x: e.clientX,
        y: e.clientY,
        over: null,
        edge: "center",
        box: null,
        moved: false,
      });
    },
    [panes],
  );

  useEffect(() => {
    if (!drag) return;
    // Windows-style snap: what is under the cursor, and which zone of it. The
    // preview box is the target's own rectangle, halved when landing on a side.
    const aim = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const host = el?.closest?.("[data-pane-id]") as HTMLElement | null;
      const id = host ? Number(host.dataset.paneId) : null;
      if (id == null || id === drag.id || !host) {
        return { over: null, edge: "center" as Edge, box: null };
      }
      const r = host.getBoundingClientRect();
      const edge = edgeAt((x - r.left) / r.width, (y - r.top) / r.height);
      const box =
        edge === "left"
          ? { left: r.left, top: r.top, width: r.width / 2, height: r.height }
          : edge === "right"
            ? { left: r.left + r.width / 2, top: r.top, width: r.width / 2, height: r.height }
            : edge === "top"
              ? { left: r.left, top: r.top, width: r.width, height: r.height / 2 }
              : edge === "bottom"
                ? { left: r.left, top: r.top + r.height / 2, width: r.width, height: r.height / 2 }
                : { left: r.left, top: r.top, width: r.width, height: r.height };
      return { over: id, edge, box };
    };
    const move = (e: PointerEvent) => {
      setDrag((d) => {
        if (!d) return d;
        // A few pixels of slack, so a plain click on the header is not a move.
        const moved = d.moved || Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6;
        const hit = moved ? aim(e.clientX, e.clientY) : { over: null, edge: "center" as Edge, box: null };
        return { ...d, x: e.clientX, y: e.clientY, moved, ...hit };
      });
    };
    const up = (e: PointerEvent) => {
      const hit = aim(e.clientX, e.clientY);
      setDrag((d) => {
        if (d?.moved && hit.over != null) {
          setCols((prev) => movePane(prev, d.id, hit.over as number, hit.edge, () => nextCol.current++));
          setFocusedId(d.id);
        }
        return null;
      });
    };
    const cancel = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id]);

  const onSwap = useCallback((from: number, to: number) => {
    setCols((prev) => swapPanes(prev, from, to));
    setFocusedId(from);
  }, []);

  const usePreset = useCallback((preset: Preset) => {
    setCols((prev) => applyPreset(prev, preset, () => nextCol.current++));
    setMaximizedId(null);
  }, []);

  // Dragging a divider: the grid's own size turns pixels into fractions.
  const gridRef = useRef<HTMLElement>(null);
  const dragDiv = useRef<
    | { kind: "col"; i: number; from: number }
    | { kind: "row"; ci: number; ri: number; from: number }
    | null
  >(null);
  /** El mosaico que se está viendo, para el arrastre de las barras. */
  const colsVisiblesRef = useRef<Col[]>([]);
  /**
   * El reparto MIENTRAS se arrastra, que no pasa por React.
   *
   * Aquí estaba el lag de verdad, y las dos primeras vueltas lo buscaron en el
   * sitio equivocado (Munir, 2026-08-11, después de dos intentos: «sigue yendo
   * lag, tiene que ser más directo y fluido»). Cada movimiento llamaba a
   * `setCols`, y eso vuelve a renderizar la cabina ENTERA con sus nueve
   * `TerminalPane` dentro, que no están memoizados y son mil quinientas líneas
   * de JSX cada uno. Bajar la cadencia del reflow de xterm no lo tocaba
   * siquiera: el trabajo caro era el de React, y ocurría igual.
   *
   * Así que durante el arrastre React no se entera: el reparto vive en este
   * ref y los anchos se escriben directamente en el DOM, que es lo que hacen
   * los separadores que van finos (split.js, Allotment, react-resizable-panels
   * hacen exactamente esto). Al soltar se hace UN `setCols` con el resultado y
   * el estado vuelve a mandar.
   */
  const enVueloRef = useRef<Col[] | null>(null);

  const onDividerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    spec: { kind: "col"; i: number } | { kind: "row"; ci: number; ri: number },
  ) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    // Las terminales bajan la cadencia de su reflow: ver `lib/redimension.ts`.
    empezarRedimension();
    // Y el reparto sale de React hasta que sueltes.
    enVueloRef.current = colsVisiblesRef.current;
    dragDiv.current =
      spec.kind === "col"
        ? { kind: "col", i: spec.i, from: e.clientX }
        : { kind: "row", ci: spec.ci, ri: spec.ri, from: e.clientY };
  };

  /* Un cambio de reparto por frame, no uno por aviso del ratón.
   *
   * Un ratón moderno manda entre 125 y 1000 posiciones por segundo, y cada una
   * que pasara el umbral llamaba a `setCols`, que vuelve a renderizar el panel
   * con sus nueve terminales dentro (`TerminalPane` no está memoizado, así que
   * se re-renderizan todas). Pintar más de una vez por frame no se ve: lo
   * único que hace es competir con el propio arrastre. Se guarda la última
   * posición y se aplica en el frame siguiente. */
  const arrastrePedido = useRef(0);
  const ultimoPuntero = useRef({ x: 0, y: 0 });

  const onDividerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragDiv.current) return;
    ultimoPuntero.current = { x: e.clientX, y: e.clientY };
    if (arrastrePedido.current) return;
    arrastrePedido.current = requestAnimationFrame(() => {
      arrastrePedido.current = 0;
      aplicarArrastre();
    });
  };

  const aplicarArrastre = () => {
    const d = dragDiv.current;
    const box = gridRef.current?.getBoundingClientRect();
    if (!d || !box) return;
    const p = ultimoPuntero.current;
    // Se estira lo que SE VE, y el resultado se copia al mosaico de verdad
    // (ver `aplicarVistas`): los índices de una barra son los del mosaico
    // visible, y aplicarlos al completo movía la columna equivocada en cuanto
    // había una terminal apartada.
    const vistas = enVueloRef.current ?? colsVisiblesRef.current;
    // The floor is worked out here and not in the model, because only the
    // cockpit knows how many pixels a fraction is worth right now.
    // El umbral es el mínimo que mueve un píxel de verdad, y no medio por
    // ciento: ahora que esto no cuesta un render, pedirle al arrastre que
    // avance a saltos de trece píxeles era lo que lo hacía sentir pastoso.
    const minimo = 0.0005;
    let tras: Col[] | null = null;
    if (d.kind === "col") {
      // El delta se ACUMULA entre frames: `from` solo avanza cuando el
      // movimiento supera el umbral, así que arrastrar despacio sigue moviendo
      // la barra en vez de quedarse muerto por debajo del mínimo.
      const delta = (p.x - d.from) / box.width;
      if (Math.abs(delta) < minimo) return;
      dragDiv.current = { ...d, from: p.x };
      tras = resizeCol(vistas, d.i, delta, floorFor(MIN_PANE_W, box.width, vistas.length));
    } else {
      const delta = (p.y - d.from) / box.height;
      if (Math.abs(delta) < minimo) return;
      dragDiv.current = { ...d, from: p.y };
      tras = resizeRow(
        vistas,
        d.ci,
        d.ri,
        delta,
        floorFor(MIN_PANE_H, box.height, vistas[d.ci]?.panes.length ?? 1),
      );
    }
    enVueloRef.current = tras;
    pintarEnCrudo(tras);
  };

  /**
   * Escribe el reparto en el DOM, sin pasar por React.
   *
   * Son las mismas cuentas que hace el render (`rects` y `dividers`, los
   * mismos del modelo), puestas a mano en los elementos que ya existen. No se
   * crea ni se destruye nada: solo cambian cuatro propiedades por panel, que
   * es lo único que de verdad cambia al mover una barra.
   */
  const pintarEnCrudo = (vistas: Col[]) => {
    const grid = gridRef.current;
    if (!grid) return;
    for (const [id, caja] of layoutRects(vistas)) {
      const el = grid.querySelector<HTMLElement>(`[data-pane-id="${id}"]`);
      if (!el) continue;
      el.style.left = `${caja.x * 100}%`;
      el.style.top = `${caja.y * 100}%`;
      el.style.width = `${caja.w * 100}%`;
      el.style.height = `${caja.h * 100}%`;
    }
    // Y las barras, que si no se quedan quietas mientras arrastras justo la
    // que tienes cogida.
    for (const d of dividers(vistas)) {
      const clave = d.kind === "col" ? `c${d.i}` : `r${d.ci}-${d.ri}`;
      const el = grid.querySelector<HTMLElement>(`[data-div="${clave}"]`);
      if (!el) continue;
      if (d.kind === "col") {
        el.style.left = `${d.at * 100}%`;
      } else {
        el.style.top = `${d.at * 100}%`;
        el.style.left = `${d.x * 100}%`;
        el.style.width = `${d.w * 100}%`;
      }
    }
  };

  const onDividerUp = () => {
    // El último movimiento se aplica ANTES de soltar el arrastre, que si no se
    // perdería: soltar justo después de mover dejaba la barra un frame por
    // detrás de donde apuntabas. Y `aplicarArrastre` necesita `dragDiv`, así
    // que anularlo va al final.
    if (arrastrePedido.current) {
      cancelAnimationFrame(arrastrePedido.current);
      arrastrePedido.current = 0;
      aplicarArrastre();
    }
    dragDiv.current = null;
    // Y AHORA se entera React, una sola vez, del reparto definitivo. Hasta
    // esta línea el estado seguía siendo el de antes de empezar a arrastrar:
    // sin esto, el primer re-render por cualquier otro motivo devolvería las
    // barras a su sitio de partida.
    const tras = enVueloRef.current;
    enVueloRef.current = null;
    if (tras) setCols((prev) => aplicarVistas(prev, tras));
    terminarRedimension();
  };

  /**
   * Qué terminales se ven ahora mismo. Escondida NO es cerrada: su panel se
   * sigue montando (desmontarlo mataría su terminal), solo que sin sitio en el
   * mosaico y sin pintarse.
   */
  const oculto = useCallback(
    (p: Pane) => minimizados.has(p.id) || (p.grupo != null && gruposOcultos.has(p.grupo)),
    [gruposOcultos, minimizados],
  );

  /* Si el panel maximizado se aparta (minimizar, esconder su grupo, apartar
     todas), la pantalla completa se suelta sola. Sin esto, `maximizedId`
     seguía apuntando a un panel que ya no se pinta, y como la pantalla
     completa esconde a TODAS las demás, la Cabina se quedaba vacía hasta
     desminimizarlo (Munir, 2026-08-17: «minimizo una terminal en pantalla
     completa y las demás desaparecen»). Va aquí, sobre `oculto`, y no en cada
     botón que aparta: cualquier puerta nueva que esconda paneles queda
     cubierta sin acordarse de esta regla. */
  useEffect(() => {
    if (maximizedId == null) return;
    const p = panes.find((x) => x.id === maximizedId);
    if (!p || oculto(p)) setMaximizedId(null);
  }, [maximizedId, panes, oculto]);

  /** Lo que hay fuera del mosaico, para la tira del pie: es la única respuesta
      a «cuántos agentes tengo apartados» que no obliga a contarlos a mano. */
  const apartadas = useMemo(() => panes.filter(oculto), [panes, oculto]);

  /** La memoria de cada terminal. Un solo sondeo para todas y desde aquí, que
      es quien las conoce: cada panel preguntando lo suyo serían seis recorridos
      de la tabla de procesos del sistema para el mismo dato. */
  const ramPanes = useRamPanes(panes.length > 0 || canvasPanes.length > 0);

  /**
   * Un solo mando para las dos direcciones: si queda algo en pantalla, lo
   * aparta todo; si no queda nada, lo trae todo de vuelta.
   *
   * Eran dos botones en dos sitios distintos, uno arriba y otro colgando de la
   * tira, para lo que es una sola idea y nunca se pueden querer las dos a la
   * vez (Munir, 2026-08-02). El de la tira además solo existía cuando ya había
   * algo apartado, así que aparecía y desaparecía debajo de las fichas.
   */
  const todoApartado = panes.length > 0 && apartadas.length === panes.length;

  const alternarTodas = useCallback(() => {
    if (todoApartado) traerTodo();
    else setMinimizados(new Set(panes.map((p) => p.id)));
  }, [todoApartado, panes, traerTodo]);

  /**
   * Vaciar la Cabina de una vez. Cerrar una a una es lo que hay hoy, y con
   * nueve terminales abiertas son nueve viajes al mismo botón (Munir,
   * 2026-08-02).
   *
   * Cerrar MATA al agente, así que esto mata a todos a la vez: por eso pasa por
   * una pregunta, que es la misma condición que ya se le pide a la papelera de
   * una sesión. Apartar («Minimizar todas») sigue siendo la salida sin muertos,
   * y el diálogo la ofrece ahí mismo para quien haya venido a esto buscando
   * despejar la pantalla y no matar nada.
   */
  const [cerrandoTodas, setCerrandoTodas] = useState(false);

  const cerrarTodas = useCallback(() => {
    setCerrandoTodas(false);
    // Sobre una copia: `closePane` va tocando `panes` por el camino, y recorrer
    // la lista viva mientras se vacía se deja terminales sin cerrar.
    for (const p of [...panesRef.current]) closePane(p.id);
  }, [closePane]);

  /** El mosaico se reparte SOLO entre las que se ven, así que apartar un grupo
      le devuelve su hueco a las demás en vez de dejar un agujero. El `cols` de
      verdad no se toca: al volver, cada una recupera su sitio. */
  panesRef.current = panes;

  const colsVisibles = useMemo(() => {
    const fuera = panes.filter(oculto);
    if (!fuera.length) return cols;
    return fuera.reduce((c, p) => layoutRemove(c, p.id), cols);
  }, [cols, panes, oculto]);
  // Lo que ve el arrastre de las barras, que corre desde un manejador y no
  // desde el render (ver `onDividerMove`).
  colsVisiblesRef.current = colsVisibles;

  const placement = layoutRects(colsVisibles);

  const foremanExec: ForemanExec = {
    focused: () => focusedIdRef2.current,
    // Se ESCRIBE en el panel, no se envía: el encargo lo manda él dándole a
    // Enter, que es la regla de la casa y aquí importa más que nunca, porque
    // este texto lo ha redactado un modelo.
    onPasteFocused: (txt, send) => {
      const id = focusedIdRef2.current;
      if (id != null) void writePty(id, send ? `${txt}
` : txt).catch(() => {});
    },
    // El despacho del router: primero se ajusta el panel, luego se deja el
    // encargo escrito. Los `/model` y `/effort` SÍ se envían, porque un ajuste
    // a medio escribir no ajusta nada; el encargo no, porque es lo único que
    // gasta y esa decisión sigue siendo suya.
    //
    // Escalonados: el CLI repinta su pantalla al cambiar de modelo, y escribir
    // encima mientras lo hace se come parte del texto. Mismo motivo que el
    // retraso entre terminales de `onAll`.
    onDespachar: (encargo, modelo, esfuerzo) => {
      const id = focusedIdRef2.current;
      if (id == null) return;
      const ajustes = [
        modelo ? `/model ${modelo}` : "",
        esfuerzo ? `/effort ${esfuerzo}` : "",
      ].filter(Boolean);
      ajustes.forEach((linea, i) => {
        window.setTimeout(() => void writePty(id, `${linea}\r`).catch(() => {}), i * 400);
      });
      window.setTimeout(
        () => void writePty(id, encargo).catch(() => {}),
        ajustes.length * 400 + 250,
      );
      setView("cabina");
    },
    onAbrirReceta: openReceta,
    // Todas: la principal de cada CLI (que existe siempre, aunque nunca se
    // haya abierto la pestaña Cuentas) más las que Munir haya añadido. El
    // router necesita las de los OTROS CLIs para poder proponerlos.
    cuentas: () => [...PROVIDERS.map((p) => mainAccount(p.id)), ...accountsRef.current.list],
    onResume,
    onOpenClaude: openClaude,
    onOpenClaudePrompt: openClaudePrompt,
    onOpenTeam: openTeam,
    onOpenTerminal: openTerminal,
    onOpenAgy: openAgy,
    onCommand: (cmd: string) => {
      pasteToFocused(cmd);
      setView("cabina");
    },
    // The one action that is sent for real instead of typed: changing a
    // setting in nine terminals is useless if he then has to press Enter nine
    // times. The OK was already given when he ran the plan, and the gate only
    // lets slash commands through.
    // Antes esto devolvía solo los NOMBRES. Ahora va el estado entero: es lo
    // que permite al Capataz proponer cerrar, y a la reja negarse.
    // Las de las DOS vistas. Antes solo iban las de la cabina, así que las del
    // lienzo eran invisibles para el Capataz: proponía abrir una sesión para
    // algo que ya tenía a alguien puesto, y a la pregunta de una terminal del
    // lienzo no llegaba nunca. Ahora las del lienzo también reportan su estado.
    panes: () =>
      [...panes, ...canvasPanes].map(
        (p) =>
          paneStatus[p.id] ?? {
            id: p.id,
            name: p.name,
            cwd: p.cwd,
            agent: !!p.command,
            agentsLive: 0,
            // Un panel que aún no ha reportado es un desconocido, y a un
            // desconocido no se le cierra.
            state: "" as const,
          },
      ),
    onClosePane: closePane,
    onAll: (cmd: string) => {
      const line = cmd.trim();
      if (!line) return;
      // Agent panes only: a plain PowerShell would just print "/effort: not
      // recognized". A pane with no command IS a plain shell.
      const targets = panes.filter((p) => !!p.command);
      targets.forEach((p, i) => {
        window.setTimeout(() => {
          void writePty(p.id, `${line}\r`).catch(() => {});
        }, i * 120);
      });
      setView("cabina");
    },
  };

  /* `beta` marca lo que todavía no está terminado. No es adorno: quien abre una
     sección sin saberlo la juzga como si estuviera acabada, y luego no vuelve. */
  const tabs: Array<{ key: View; icon: React.ReactElement; label: string; beta?: boolean }> = [
    { key: "panel", icon: <PanelIcon size={16} />, label: "Panel" },
    { key: "cabina", icon: <CockpitIcon size={16} />, label: "Cabina" },
    // Justo detrás de la Cabina porque es la misma cosa vista de otra manera:
    // las mismas sesiones, sin la consola delante.
    { key: "chat", icon: <ChatIcon size={16} />, label: "Chat", beta: true },
    { key: "agenda", icon: <AgendaIcon size={16} />, label: "Agenda" },
    { key: "lienzo", icon: <CanvasIcon size={16} />, label: "Lienzo" },
    { key: "memoria", icon: <MemoryIcon size={16} />, label: "Memoria" },
    { key: "cuentas", icon: <AccountIcon size={16} />, label: "Cuentas" },
    // La Guía ya no está aquí: se mira el primer día y casi nunca más, y una
    // pestaña permanente es sitio que le quitaba a lo que se usa a diario. Vive
    // entera en Ajustes › Ayuda, junto al enlace a la documentación de la web.
    { key: "comandos", icon: <CommandIcon size={16} />, label: "Comandos" },
    { key: "ajustes", icon: <SettingsIcon size={16} />, label: "Ajustes" },
  ];

  // Las que él quiere ver, en el orden que él ha puesto. Apagar una la quita de
  // la fila pero NO de la app: su atajo de teclado sigue abriéndola, y los
  // botones de otras pantallas que llevan a ella también. Ver `lib/cabecera.ts`.
  const tabsVisibles = visibles(tabs, cabecera);

  return (
    <LangContext.Provider value={{ lang, t }}>
    <Overlays>
    <div className="app" data-stream={stream} data-peek={peek}>
      {/* Debajo de todo lo demás, y sin recibir un clic. */}
      <Fondo
        path={fondo}
        sello={fondoSello}
        opacidad={fondoOpacidad}
        desenfoque={fondoDesenfoque}
        encuadre={fondoEncuadre}
      />
      {/* La tarjeta de actualizar ya NO se monta aquí: vive al final de la
          barra de la izquierda, como en la app de escritorio de Claude, que es
          la referencia que dio Munir. Flotando en la esquina se posaba encima
          del contenido y tapaba lo que hubiera debajo; en la barra ocupa su
          sitio y no le quita nada a nadie. */}
      {verObjetivos && (
        <ObjetivosFlotante
          onCerrar={() => {
            localStorage.setItem(OBJETIVOS_KEY, "0");
            setVerObjetivos(false);
          }}
        />
      )}
      {/* Que enterarse de que se acabó el plan no sea el agente plantándose a
          mitad de una tarea. Solo mira si hay alguien trabajando, y solo las
          cuentas de Claude, que son las únicas que publican su porcentaje. */}
      <AvisoCuota
        cuentas={cuentasConCuota}
        paneles={panes
          .filter((p) => kindDeComando(p.command?.join(" ") ?? "") === "claude")
          .map((p) => ({
            cwd: p.cwd,
            account: p.account,
            name: p.name,
            // Su transcript, que es de donde sale el acta del relevo. Sin él la
            // terminal nueva nacería igual, pero sin saber dónde ibas.
            sessionId: sessionIdOf(p.command),
          }))}
        onAbrir={relevar}
      />
      {/* El vigía de las cuadrillas. No pinta nada: mira lo que ya se sabe de
          cada puesto y el BUZON.md que ellos mismos escriben, y si algo pide tu
          atención deja UNA línea en la bandeja de la Agenda. Nunca escribe en
          una terminal ni abre ni cierra nada: propone, decides tú. */}
      <Vigia panes={panes} status={paneStatus} />
      <header className="topbar">
        {/* Sin la marca al lado: a 20px el logo pierde la proa y se lee como
            un cuadrado azul cualquiera, y el nombre ya dice de quién es la
            ventana. El logo sigue donde sí se ve, que es el icono de la app. */}
        <span className="brand">
          Adeorq
        </span>
        <nav className="tabs">
          {tabsVisibles.map((tab) => (
            <button
              key={tab.key}
              className="tab"
              // El recorrido de la bienvenida busca los botones por aquí: una
              // clase o una posición se mueven al rediseñar la barra, la clave
              // de la vista no.
              data-tab={tab.key}
              data-active={view === tab.key}
              data-tip={
                tab.beta
                  ? `${t(tab.label)}
${t("En beta: funciona, pero le faltan cosas y puede cambiar")}`
                  : t(tab.label)
              }
              onClick={() => setView(tab.key)}
            >
              <span className="tab-icon">{tab.icon}</span>
              {/* El nombre se va solo cuando la ventana no da: en una pantalla
                  estrecha la barra hacía scroll horizontal y el Capataz se
                  quedaba fuera, que es el botón que más falta hace. Con el
                  icono dibujado, sin nombre sigue siendo reconocible, y el
                  globo dice cuál es. */}
              <span className="tab-label">{t(tab.label)}</span>
              {tab.beta && <span className="tab-beta">{t("beta")}</span>}
              {tab.key === "cabina" && panes.length > 0 && (
                <span className="tab-count">{panes.length}</span>
              )}
              {tab.key === "lienzo" && canvasPanes.length > 0 && (
                <span className="tab-count">{canvasPanes.length}</span>
              )}
            </button>
          ))}
        </nav>
        {/* A la derecha, y en su propio grupo: lo de la izquierda es dónde
            estás y esto es qué haces. Antes era todo una sola fila con el
            mismo hueco entre cosas, así que al crecer una se comía a la de
            al lado en vez de que el grupo entero se apretara. */}
        <div className="topbar-acciones">
        {/* Los objetivos del día, a un clic desde donde estés. Una lista del
            día que solo se ve entrando a la Agenda se mira por la mañana y se
            olvida; aquí acompaña al día. */}
        <button
          className="tab objetivos-toggle"
          data-on={verObjetivos}
          data-tip={t("Tus objetivos de hoy")}
          onClick={() =>
            setVerObjetivos((v) => {
              localStorage.setItem(OBJETIVOS_KEY, v ? "0" : "1");
              return !v;
            })
          }
        >
          <span className="tab-icon">
            <IconoObjetivos />
          </span>
        </button>
        <Pulso />
        <NowPlaying />
        <button
          className="tab stream-toggle"
          data-on={stream}
          data-tip={t(
            stream
              ? "Modo emisión ACTIVO: se tapan rutas, correos y claves en las terminales (Ctrl+Mayús+E) · Alt para mirar"
              : "Modo emisión: tapa rutas, claves y datos personales (Ctrl+Mayús+E) · Alt para mirar · Ctrl+Mayús+P tapa la pantalla",
          )}
          onClick={() =>
            setStream((v) => {
              localStorage.setItem(STREAM_KEY, v ? "0" : "1");
              return !v;
            })
          }
        >
          {/* Solo el icono, como el orbe del Asistente (Munir, 2026-08-10). El
              rótulo decía «Emisión» o «En emisión», y de las dos cosas que hay
              que saber de este botón (qué hace, y si está puesto) la primera la
              cuenta el globo y la segunda se ve mucho mejor en los anillos que
              en una palabra. Un botón que solo se enciende no necesita
              anunciarse con letra en una cabecera donde el sitio es de las
              pestañas. */}
          <span className="tab-icon">
            <StreamIcon size={16} on={stream} />
          </span>
        </button>
        {/* UNA puerta, no dos. El Reparto tenía su propio botón aquí al lado, y
            el comentario que lo justificaba ya decía lo que era: «la misma
            pregunta con una lista en vez de una frase». Dos botones seguidos
            para la misma pregunta es hacer elegir antes de escribir. Ahora se
            escribe primero y el Asistente reparte solo cuando hay varias
            líneas (Munir, 2026-08-05). */}
        <button
          className="tab foreman-call"
          data-tip={t("Llamar al Asistente (Ctrl+Mayús+A · Ctrl+Mayús+M para dictarle)")}
          onClick={() => {
            setDictarAlAbrir(false);
            setShowForeman((v) => !v);
          }}
        >
          <Orbe estado={showForeman ? "escucha" : "reposo"} size={28} />
        </button>
        {/* El último grupo de la fila, pegado al borde: son los únicos botones
            de aquí que solo aparecen a veces (con la Cabina y más de un
            panel), y una cosa que va y viene en mitad de una barra mueve de
            sitio a todas las de su derecha cada vez. Al final no mueve nada.
            Los tres llevan su nombre escrito, igual que las pestañas de la
            izquierda: nacieron mudos, con solo el icono, y en una barra donde
            todo lo demás se lee no había forma de encontrarlos (Munir,
            2026-08-02). Pero el nombre se va con el resto de la barra por
            debajo de 1700px (misma regla que las pestañas, ver App.css):
            tres botones más escritos es lo que desbordaba la barra entera en
            un portátil y dejaba «Cerrar todas» cortado fuera de la ventana
            sin que se notara que estaba ahí (Munir, 2026-08-02). */}
        {view === "cabina" && panes.length > 1 && (
          <>
            {/* Despejar la pantalla entera, o recuperarla. Va aquí, con la
                disposición, porque las dos hacen lo mismo: ordenar el mosaico.
                Y aparece con la misma condición que ella para que la barra no
                cambie de forma dos veces por lo mismo. */}
            <button
              className="tab"
              data-tip={
                todoApartado
                  ? t("Devolver al mosaico todo lo que está apartado")
                  : t("Apartar todas las terminales: siguen vivas en la tira de abajo")
              }
              onClick={alternarTodas}
            >
              <span className="tab-icon">
                {todoApartado ? <UnminimizeIcon size={15} /> : <MinimizeIcon size={15} />}
              </span>
              <span className="tab-label">
                {todoApartado ? t("Traer todas") : t("Minimizar todas")}
              </span>
            </button>
            <LayoutPicker onPick={usePreset} />
            {/* Y la salida de verdad, la que se lleva a los agentes por
                delante. Va la última y separada de su vecina de arriba a
                propósito: es la única de la barra que no se puede deshacer, y
                pegada a «Minimizar todas» se pulsaría queriendo apartar. */}
            <button
              className="tab tab-danger"
              data-tip={t("Cerrar las {n} terminales: mata a sus agentes", {
                n: panes.length,
              })}
              onClick={() => setCerrandoTodas(true)}
            >
              <span className="tab-icon">
                <CloseIcon size={15} />
              </span>
              <span className="tab-label">{t("Cerrar todas")}</span>
            </button>
          </>
        )}
        </div>
      </header>

      <div className="view-cabina" style={{ display: view === "cabina" ? "flex" : "none" }}>
        <Sidebar
          width={sideW}
          refreshKey={refreshKey}
          focusReq={focusReq}
          traerReq={traerReq}
          abiertas={abiertas}
          onFocusPane={irATerminal}
          onOpenTerminal={openTerminal}
          onOpenClaude={openClaude}
          onOpenAgy={openAgy}
          accounts={accounts}
          topeAbrirTodas={openAllCap}
          onNewSession={() => setWizard(true)}
          onOpenProvider={(provider, name, cwd) =>
            addPane(`${name} · ${providerOf(provider).label}`, cwd, providerCommand(provider))
          }
          onOpenAccount={(account, name, cwd) =>
            // The pane's own pill says which account it is, and that pill is
            // one of the things the stream curtain hides: keep it out of the
            // title, which is always on screen.
            addPane(
              `${name} · ${account.provider}`,
              cwd,
              providerCommand(account.provider),
              undefined,
              account,
            )
          }
          onResume={onResume}
          onOpenAll={onOpenAll}
          gruposOcultos={gruposOcultos}
          onPlegarGrupo={alternarGrupo}
          onRail={setRailMode}
        />
        <div
          className="resizer"
          // Con la tira puesta no hay ancho que elegir: el tirador seguía ahí,
          // se arrastraba y no pasaba nada, que es peor que no estar.
          data-off={railMode === "tira"}
          data-tip={t("Arrastra para ensanchar la lista")}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        />
        {/* El tablero va encima del mosaico, no flotando sobre él: lo que dice
            —quién te espera— hay que verlo sin buscarlo, y una capa flotante
            taparía justo la terminal a la que vas a ir. Se pliega, y cuando no
            hay ninguna cuadrilla abierta no ocupa nada porque no se pinta. */}
        <div className="cabina-work">
          <CrewBoard
            panes={panes}
            status={paneStatus}
            onFocus={irAPuesto}
            onCerrar={(ids) => ids.forEach(closePane)}
            ocultas={gruposOcultos}
            onMinimizar={alternarGrupo}
          />
          <main className="grid" ref={gridRef}>
          {cols.length === 0 ? (
            // La primera pantalla que se ve, y hasta hoy era un manual: dos
            // renglones enumerando seis botones con su glifo (⧉ ✦ >_ AG ⋯) en
            // mitad de un párrafo. Esos botones salen solos al pasar el ratón y
            // cada uno lleva su globo, así que la lista no enseñaba nada que no
            // se descubra en un segundo, y tapaba lo único que hay que saber:
            // de dónde sale una terminal (Munir, 2026-08-06).
            <div className="empty">
              <p className="empty-title">{t("La cabina está lista.")}</p>
              <p>
                {t("Elige una conversación en la barra de la izquierda para retomarla, o abre una nueva aquí.")}
              </p>
              {/* Lo que llevas trabajado. Va ENTRE la frase y el botón, y no al
                  final: este hueco es el único momento del día en que se puede
                  mirar atrás sin quitarle sitio a nada, y el botón sigue siendo
                  lo último que se lee, que es lo que hay que pulsar. Si no hay
                  datos no se pinta nada, en vez de una fila de ceros. */}
              <Estadisticas />
              <button className="np-btn empty-new" onClick={() => setWizard(true)}>
                <PlusIcon size={15} /> {t("Abrir una sesión…")}
              </button>
              <p className="card-hint empty-pie">
                {t("Cada proyecto enseña sus botones al pasar el ratón. Y si algo no cuadra, está la pestaña Guía.")}
              </p>
            </div>
          ) : (
            <>
              {panes.map((p) => {
                const escondido = oculto(p);
                const r = placement.get(p.id);
                if (!r && !escondido) return null;
                const max = maximizedId === p.id;
                /* El acompañante de la pantalla completa: el editor que se
                   abrió con una sesión maximizada delante. Mitad y mitad, sin
                   separador que arrastrar: es una compañía, no otro mosaico. */
                const lado = ladoMax === p.id;
                // Escondida: se monta igual (desmontarla mataría su terminal)
                // pero sin ocupar nada y sin pintarse. Sigue viva y trabajando.
                const style: React.CSSProperties = escondido
                  ? { left: 0, top: 0, width: 0, height: 0, visibility: "hidden" }
                  : max
                  ? { left: 0, top: 0, width: ladoMax != null ? "50%" : "100%", height: "100%" }
                  : lado
                  ? { left: "50%", top: 0, width: "50%", height: "100%" }
                  : {
                      left: `${r!.x * 100}%`,
                      top: `${r!.y * 100}%`,
                      width: `${r!.w * 100}%`,
                      height: `${r!.h * 100}%`,
                    };
                // No es una terminal, es un archivo abierto. Ocupa el mismo
                // hueco y se mueve, maximiza y cierra igual: para el mosaico es
                // un panel más, que es justo lo que Munir eligió.
                if (p.web != null) {
                  return (
                    <WebPane
                      key={p.id}
                      id={p.id}
                      tabs={p.webTabs ?? [p.web]}
                      activa={p.webActiva ?? 0}
                      focused={focusedId === p.id}
                      hidden={escondido || (maximizedId != null && !max && !lado)}
                      maximized={max}
                      style={style}
                      onFocusPane={setFocusedId}
                      onClose={closePane}
                      onToggleMax={onToggleMax}
                      onHeaderDown={onHeaderDown}
                      onEstado={onWebEstado}
                    />
                  );
                }
                if (p.archivos?.length) {
                  return (
                    <EditorPane
                      key={p.id}
                      id={p.id}
                      archivos={p.archivos}
                      activo={p.activo ?? p.archivos[0]}
                      raiz={p.cwd}
                      focused={focusedId === p.id}
                      hidden={escondido || (maximizedId != null && !max && !lado)}
                      maximized={max}
                      style={style}
                      onFocusPane={setFocusedId}
                      onClose={closePane}
                      onToggleMax={onToggleMax}
                      onHeaderDown={onHeaderDown}
                      onActivar={(ruta) => activarPestana(p.id, ruta)}
                      onCerrarPestana={(ruta) => cerrarPestana(p.id, ruta)}
                    />
                  );
                }
                return (
                  <TerminalPane
                    key={p.id}
                    id={p.id}
                    cwd={p.cwd}
                    name={p.name}
                    command={p.command}
                    env={p.env}
                    account={p.account}
                    team={p.team}
                    hidden={escondido || (maximizedId != null && !max && !lado)}
                    focused={focusedId === p.id}
                    pideTeclado={tecladoReq?.id === p.id ? tecladoReq.n : 0}
                    ram={ramPanes.get(p.id)}
                    maximized={max}
                    fontSize={fontSize}
                    autoFont={autoFont}
                    stream={stream}
                    onSecret={onSecret}
                    notifyMode={notifyMode}
                    style={style}
                    onSwap={onSwap}
                    onHeaderDown={onHeaderDown}
                    onSacar={sacarFuera}
                    cuentas={cuentasConCuota}
                    onRelevar={(cuenta) =>
                      relevar(cuenta, {
                        cwd: p.cwd,
                        name: p.name,
                        sessionId: sessionIdOf(p.command),
                        account: p.account,
                      })
                    }
                    dropTarget={drag?.over === p.id || soltandoEn === p.id}
                    onClose={closePane}
                    onRename={renombrarPane}
                    onStatus={onPaneStatus}
                    onRevivir={revivirPane}
                    alone={panes.length <= 1}
                    onFocusPane={setFocusedId}
                    onSplit={splitPane}
                    onMinimizar={alternarMinimizado}
                    onToggleMax={onToggleMax}
                    onTurnEnd={alTerminar}
                    onEscribir={alEscribirEn}
                  />
                );
              })}
              {/* Las barras salen del mosaico que SE VE, no del completo: con
                  una terminal apartada, el completo las colocaba en sitios que
                  ya no eran ningún borde. */}
              {maximizedId == null &&
                dividers(colsVisibles).map((d) =>
                  d.kind === "col" ? (
                    <div
                      key={`c${d.i}`}
                      // Para poder moverla desde `pintarEnCrudo` sin React.
                      data-div={`c${d.i}`}
                      className="divider divider-col"
                      style={{ left: `${d.at * 100}%` }}
                      data-tip={t("Arrastra para repartir el ancho")}
                      onPointerDown={(e) => onDividerDown(e, { kind: "col", i: d.i })}
                      onPointerMove={onDividerMove}
                      onPointerUp={onDividerUp}
                      onPointerCancel={onDividerUp}
                    />
                  ) : (
                    <div
                      key={`r${d.ci}-${d.ri}`}
                      data-div={`r${d.ci}-${d.ri}`}
                      className="divider divider-row"
                      style={{
                        top: `${d.at * 100}%`,
                        left: `${d.x * 100}%`,
                        width: `${d.w * 100}%`,
                      }}
                      data-tip={t("Arrastra para repartir el alto")}
                      onPointerDown={(e) =>
                        onDividerDown(e, { kind: "row", ci: d.ci, ri: d.ri })
                      }
                      onPointerMove={onDividerMove}
                      onPointerUp={onDividerUp}
                      onPointerCancel={onDividerUp}
                    />
                  ),
                )}
            </>
          )}
          </main>
          {/* La tira de lo apartado. Están TODAS las que no se ven, tanto las
              minimizadas de una en una como las de un grupo entero: apartar un
              grupo dejaba a sus agentes trabajando sin que nada dijera cuántos
              había fuera ni qué hacían, que es la forma de acabar esperando a
              alguien que te espera a ti (Munir, 2026-08-02). Cada una sigue
              reportando: la que te necesita va en ámbar. Pulsar la devuelve, y
              si estaba apartada con su grupo, vuelve el grupo entero. */}
          {apartadas.length > 0 && (
            <div className="minim">
              <span className="minim-eti">
                {t("Apartadas")}
                <b>{apartadas.length}</b>
              </span>
              {apartadas.map((p) => {
                const estado = paneStatus[p.id]?.state ?? "";
                const pinta = PINTA[estado] ?? PINTA[""];
                const porGrupo = !minimizados.has(p.id) && p.grupo != null;
                return (
                  <button
                    key={p.id}
                    className="minim-chip"
                    data-estado={estado || "sinsaber"}
                    data-urge={pinta.urge || undefined}
                    data-grupo={porGrupo || undefined}
                    style={p.team ? { ["--crew" as string]: p.team.color } : undefined}
                    data-tip={`${p.name}\n${t(pinta.label)}\n\n${
                      porGrupo
                        ? t("Está apartada con su grupo. Pulsa para traer el grupo entero.")
                        : t("Traerla de vuelta al mosaico")
                    }`}
                    onClick={() =>
                      porGrupo && p.grupo ? alternarGrupo(p.grupo) : alternarMinimizado(p.id)
                    }
                  >
                    <span className="minim-ico">
                      <EstadoIcon estado={estado} size={13} />
                    </span>
                    <span className="minim-nombre">{p.name}</span>
                    {pinta.urge && <span className="minim-urge">{t(pinta.label)}</span>}
                    {/* Lo que cuesta tenerla apartada. Aquí es donde de verdad
                        hacía falta: una terminal a la vista se ve trabajando,
                        una escondida solo se recuerda si algo dice lo que
                        ocupa. */}
                    {ramPanes.get(p.id)?.ramMb ? (
                      <span className="minim-ram">
                        {bonito(ramPanes.get(p.id)!.ramMb, lang)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <PanelDerecho
          cara={cara}
          onCara={cambiarCara}
          onWeb={abrirWeb}
          skills={
            <SkillsPanel
              canPaste={focusedId != null}
              onUse={pasteToFocused}
              onUsage={focusedId != null ? askUsage : null}
              cuentas={cuentasConCuota}
            />
          }
          archivos={
            <ArchivosPanel
              raiz={raizArchivos}
              onAbrir={abrirArchivo}
              abierto={panes.find((p) => p.id === focusedId)?.activo ?? null}
            />
          }
        />
      </div>

      {/* Mounted always, hidden with CSS: unmounting it would kill its PTYs. */}
      <div
        className="view-lienzo"
        style={{ display: view === "lienzo" ? "flex" : "none" }}
      >
        <CanvasView
          visible={view === "lienzo"}
          panes={canvasPanes}
          // Las de la cabina van solo como DATO, para que el tablero del lienzo
          // pueda contarlas: con las del lienzo a secas diría que no trabaja
          // nadie mientras seis agentes trabajan en la otra vista.
          panesCabina={panes}
          estados={paneStatus}
          onStatus={onPaneStatus}
          onLanzarEncargo={lanzarEnLienzo}
          // Varias tarjetas van al Reparto, no directas a terminales: es el
          // único sitio que sabe separarles los archivos para que no se pisen,
          // y de paso enseña lo que van a costar antes de abrir nada.
          onRepartirTarjetas={(texto, project, alAbrir) =>
            setReparto({ texto, proyecto: project.path, alAbrir })
          }
          fontSize={fontSize}
          autoFont={autoFont}
          stream={stream}
          onSecret={onSecret}
          notifyMode={notifyMode}
          saltarAlTerminar={saltarAlQueTermina}
          atajos={atajos}
          recuperar={restoreOnStart}
          // El lienzo guarda con qué nació cada terminal suya; traducirlo al
          // comando que la devuelve a SU conversación es lo mismo que hace la
          // Cabina al arrancar, y se hace en el mismo sitio para que no haya
          // dos versiones de esa regla.
          alVolver={(cwd, command) => resumeCommandFor({ name: "", cwd, command })}
          onCreate={createCanvasPane}
          onClose={closeCanvasPane}
          onRename={renombrarPane}
          // El asa de las flechas para la sesión suprema: mientras el lienzo
          // esté montado, un agente puede pedir por MCP que se unan dos
          // terminales. Ver `docs/SUPREMA.md`.
          enlazarRef={enlazarRef}
        />
      </div>

      {view === "panel" && (
        <PanelView
          onGoProject={goProject}
          onCreated={onCreated}
          onGoCabina={() => setView("cabina")}
          foremanCard={
            <Foreman
              mode="card"
              exec={foremanExec}
              onRepartir={(texto) => setReparto({ texto })}
            />
          }
        />
      )}
      {/* La otra cara de la Cabina: las mismas sesiones, leídas como
          conversación en vez de como consola. Se monta y se desmonta con su
          pestaña porque no tiene nada vivo dentro: lo que corre son las
          terminales de la Cabina, que siguen en pie donde estaban. */}
      {view === "chat" && (
        <ChatView
          onEnviar={enviarAlChat}
          onResume={onResume}
          onNueva={() => setWizard(true)}
          cuentas={cuentasConCuota}
          cara={cara}
          onCara={cambiarCara}
          raizArchivos={raizArchivos}
          onAbrirArchivo={abrirArchivo}
          onWeb={abrirWeb}
          onUsage={usageDeSesion}
        />
      )}
      {view === "agenda" && (
        <AgendaView
          current={focusProject}
          onOpenProject={goProject}
          modeloLocal={modeloLocal}
          onResume={onResume}
        />
      )}
      {/* La Memoria se monta y se desmonta con su pestaña, al revés que el
          Lienzo: aquí no hay ninguna terminal viva que perder, y guardar en pie
          un índice de quinientos documentos que no se está mirando no le hace
          bien a nadie. El índice de verdad vive en Rust y sobrevive igual. */}
      {view === "memoria" && <MemoriaView />}
      {view === "cuentas" && (
        <AccountsView
          accounts={accounts}
          defaultAccount={defaultAccount}
          onAdd={addAccount}
          onRename={(id, label) =>
            label &&
            mutateAccounts((prev) => ({
              ...prev,
              list: prev.list.map((a) => (a.id === id ? { ...a, label } : a)),
            }))
          }
          onRemove={removeAccount}
          onSetDefault={(id) => mutateAccounts((prev) => ({ ...prev, def: id }))}
          onTerminal={(acc) => {
            const p = providerOf(acc.provider);
            addPane(
              `${acc.label} · ${p.label}`,
              raiz(),
              providerCommand(acc.provider),
              undefined,
              acc,
            );
          }}
          onInstall={(p) =>
            addPane(
              `${p.label} · ${t("instalar")}`,
              raiz(),
              installCommand(
                p,
                t("Ya está descargado. Cuando quieras usarlo, escribe aquí: {c}").replace(
                  "{c}",
                  providerInner(p.id),
                ),
              ),
            )
          }
        />
      )}
      {view === "comandos" && (
        <CommandsView
          onUse={focusedId != null ? (cmd) => pasteToFocused(cmd) : null}
        />
      )}
      {view === "ajustes" && (
        <SettingsView
          lang={lang}
          onLang={setLang}
          theme={theme}
          onTheme={setTheme}
          fontSize={fontSize}
          onFontSize={(n) => {
            setFontSize(n);
            localStorage.setItem(FONT_KEY, String(n));
          }}
          autoFont={autoFont}
          onAutoFont={(v) => {
            setAutoFont(v);
            localStorage.setItem(AUTOFONT_KEY, v ? "1" : "0");
          }}
          openAll={openAllCap}
          onOpenAll={(n) => {
            setOpenAllCap(n);
            localStorage.setItem(OPENALL_KEY, String(n));
          }}
          notifyMode={notifyMode}
          onNotifyMode={(m) => {
            setNotifyMode(m);
            localStorage.setItem(NOTIFY_KEY, m);
          }}
          permissionMode={permissionMode}
          onPermissionMode={(m) => {
            setPermissionMode(m);
            localStorage.setItem(PERMISSION_MODE_KEY, m);
          }}
          restore={restoreOnStart}
          onRestore={(v) => {
            setRestoreOnStart(v);
            localStorage.setItem(RESTORE_KEY, v ? "1" : "0");
          }}
          saltar={saltarAlQueTermina}
          onSaltar={(v) => {
            setSaltarAlQueTermina(v);
            localStorage.setItem(JUMP_KEY, v ? "1" : "0");
          }}
          atajos={atajos}
          onAtajos={(next) => {
            setAtajos(next);
            guardarAtajos(next);
          }}
          modeloLocal={modeloLocal}
          onModeloLocal={(m) => {
            setModeloLocal(m);
            localStorage.setItem(OLLAMA_KEY, m);
          }}
          fondo={fondo}
          fondoSello={fondoSello}
          fondoOpacidad={fondoOpacidad}
          fondoDesenfoque={fondoDesenfoque}
          fondoEncuadre={fondoEncuadre}
          cabecera={cabecera}
          onCabecera={(c) => {
            setCabecera(c);
            guardarCabecera(c);
          }}
          terminalVer={terminalVer}
          onTerminalVer={setTerminalVer}
          onFondo={async (ruta) => {
            if (!ruta) {
              await quitarFondo();
              setFondo("");
              return;
            }
            const dentro = await ponerFondo(ruta);
            setFondo(dentro);
            // El sello cambia siempre: los dos archivos se llaman igual, así
            // que sin esto pondrías otro fondo y verías el de antes.
            setFondoSello(Date.now());
            // Y el encuadre vuelve al centro: heredar el recorte de la foto
            // anterior es enseñar la esquina de una foto que no tiene nada que
            // ver con la otra, y parece que la nueva ha entrado mal puesta.
            setFondoEncuadre((e) => {
              const limpio = { ...e, x: 50, y: 50, zoom: 100 };
              guardarEncuadre(limpio);
              return limpio;
            });
          }}
          onFondoEncuadre={(e) => {
            setFondoEncuadre(e);
            guardarEncuadre(e);
          }}
          onFondoOpacidad={(n) => {
            setFondoOpacidad(n);
            localStorage.setItem(FONDO_OPACIDAD_KEY, String(n));
          }}
          onFondoDesenfoque={(n) => {
            setFondoDesenfoque(n);
            localStorage.setItem(FONDO_DESENFOQUE_KEY, String(n));
          }}
          onUsage={askUsage}
          canUsage={focusedId != null}
          discord={discord}
          onDiscord={(next) => {
            setDiscord(next);
            localStorage.setItem(DISCORD_KEY, JSON.stringify(next));
          }}
          discordError={discordError}
          onVerBienvenida={() => setOnboarding(true)}
          onVerTour={() => setTour(true)}
          onRaizCambiada={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {reparto && (
        <RepartoView
          cuentas={[...PROVIDERS.map((p) => mainAccount(p.id)), ...accounts]}
          sugerido={focusProject}
          inicial={reparto}
          onAbrirLote={openTeam}
          onClose={() => setReparto(null)}
        />
      )}

      {onboarding && (
        <Onboarding
          lang={lang}
          theme={theme}
          onLang={setLang}
          onTheme={setTheme}
          onDone={(verTour) => {
            setOnboarding(false);
            setTour(verTour);
          }}
        />
      )}

      {tour && (
        <Tour
          onClose={() => {
            setTour(false);
            tocarPerfil({ tour: true });
          }}
        />
      )}

      {wizard && (
        <NewSession
          accounts={accounts}
          maxPanes={openAllCap}
          suggested={focusProject}
          yaAbiertas={sesionesEnPantalla}
          onLaunch={launchFromWizard}
          onRetomar={retomarVarias}
          onClose={() => setWizard(false)}
        />
      )}

      {drag?.moved && drag.box && (
        <div className="snap-preview" style={drag.box} data-edge={drag.edge} />
      )}

      {drag?.moved && (
        <div
          className="drag-ghost"
          style={{ left: drag.x + 14, top: drag.y + 14 }}
        >
          {drag.over == null
            ? drag.name
            : drag.edge === "center"
              ? t("Soltar aquí para intercambiar")
              : t("Soltar para colocarla a este lado")}
        </div>
      )}

      {restoring > 0 && (
        <div className="restore-bar">
          {t("Recuperando tus terminales…")} {restoring}
        </div>
      )}


      {sesionOcupada && (
        <div className="ocupada-bar">
          <strong>«{sesionOcupada}»</strong> ya está abierta en otro sitio (la app de
          escritorio, otra terminal u otro Adeorq). No la abro aquí: dos Claude sobre la
          misma sesión se bloquean y se queda congelada sin decir por qué. Ciérrala allí
          y vuelve a intentarlo.
          <button className="pane-close" onClick={() => setSesionOcupada(null)}>
            ×
          </button>
        </div>
      )}

      {burnt && (
        // The advice belongs to whatever fired, not to a single scary sentence
        // for everything: a path with your username is not a burnt credential.
        <div
          className="burnt-bar"
          data-sev={burnt.some((h) => h.severity === "alta") ? "alta" : "baja"}
        >
          <span>
            <strong>
              {t("Tapé algo que parece")} {burnt.map((h) => t(h.name)).join(", ")}.
            </strong>{" "}
            {t(burnt[0].advice)}
          </span>
          <button className="mini" onClick={() => setBurnt(null)}>
            {t("Entendido")}
          </button>
        </div>
      )}

      {panic && (
        <div
          className="panic"
          onClick={() => setPanic(false)}
        >
          <span className="panic-title">{t("Pantalla tapada")}</span>
          <span className="panic-hint">
            {t("Clic o Ctrl+Mayús+P para volver. Nadie ve lo que hay debajo.")}
          </span>
        </div>
      )}

      {cerrandoTodas && (
        <div className="modal-overlay" onClick={() => setCerrandoTodas(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{t("Cerrar todas las terminales")}</h3>
            <p className="modal-text">
              {t(
                "Se cierran las {n} terminales de la Cabina y se mata a sus agentes. Las conversaciones NO se borran: siguen en la lista de la izquierda y se retoman cuando quieras.",
                { n: panes.length },
              )}
            </p>
            {/* Lo que de verdad se pierde. Una terminal parada se cierra sin
                más; una a medias se lleva por delante el trabajo que estaba
                haciendo, y eso hay que verlo ANTES de pulsar. */}
            {(() => {
              const trabajando = panes.filter(
                (p) => paneStatus[p.id]?.state === "a_medias",
              );
              if (!trabajando.length) return null;
              return (
                <div className="modal-warn">
                  <p className="modal-warn-title">
                    {t("⚠ {n} están trabajando ahora mismo:", { n: trabajando.length })}
                  </p>
                  <ul className="modal-files">
                    {trabajando.slice(0, 6).map((p) => (
                      <li key={p.id}>{p.name}</li>
                    ))}
                    {trabajando.length > 6 && (
                      <li>{t("… y {n} más", { n: trabajando.length - 6 })}</li>
                    )}
                  </ul>
                </div>
              );
            })()}
            <div className="modal-actions">
              <button className="mini modal-cancel" onClick={() => setCerrandoTodas(false)}>
                {t("Cancelar")}
              </button>
              {/* La salida sin muertos, para quien vino a despejar la pantalla
                  y no a matar nada: es la misma tecla de escape que da la barra,
                  puesta donde se está dudando. */}
              <button
                className="mini"
                onClick={() => {
                  setCerrandoTodas(false);
                  setMinimizados(new Set(panes.map((p) => p.id)));
                }}
              >
                {t("Mejor apartarlas")}
              </button>
              <button className="np-btn modal-danger" onClick={cerrarTodas}>
                {t("Cerrar todas")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForeman && (
        <Foreman
          mode="overlay"
          onRepartir={(texto) => {
            setShowForeman(false);
            setReparto({ texto });
          }}
          exec={foremanExec}
          dictarAlAbrir={dictarAlAbrir}
          onClose={() => {
            setShowForeman(false);
            setDictarAlAbrir(false);
          }}
        />
      )}
    </div>
    </Overlays>
    </LangContext.Provider>
  );
}

export default App;
