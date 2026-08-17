import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import {
  deleteSession,
  killPty,
  onPtyData,
  onPtyExit,
  onPtyMudo,
  resizePty,
  savePastedImage,
  sessionContext,
  spawnPty,
  writePty,
  type Account,
  type ContextInfo,
  type PaneStatus,
  type WorkState,
  // Shadow Git:
  shadowInit,
  shadowDiff,
  shadowStatus,
  shadowAccept,
  shadowDiscard,
  type ShadowSession,
  type ShadowFile,
} from "../lib/pty";
import { raiz } from "../lib/perfil";
import { useT } from "../lib/i18n";
import { useMenu } from "./Overlays";
import { RedactStream, type Hit } from "../lib/redact";
import {
  CheckIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  GitBranchIcon,
  MaximizeIcon,
  MinimizeIcon,
  DevolverIcon,
  SacarIcon,
  RestoreIcon,
  RobotIcon,
  TrashIcon,
} from "./Icons";
import KindIcon, { kindDeComando } from "./KindIcon";
import { hueOf } from "../lib/colors";
import { chime, forgetPane, notify, type NotifyMode } from "../lib/notify";
import { seMuda } from "../lib/mudanza";
import { apuntaTecla } from "../lib/tecleando";
import { bonito, type PanePulso } from "../lib/ram";
import { coloresTerm, TEMA_TERM_EVENTO } from "../lib/temasTerm";
import { hayQueAjustar, hayQueRecolocar, volverA } from "../lib/scrollTerm";
import { EVENTO_REFIT, redimensionando, tocaAjustar } from "../lib/redimension";
import { modoRendimiento } from "../lib/rendimiento";
import { sessionIdOf } from "../lib/comandos";
import { propsDeVelo } from "../lib/velo";
import { sabe } from "../lib/providers";

interface Props {
  id: number;
  cwd: string;
  name: string;
  command?: string[];
  /** Environment for this pane only: carries CLAUDE_CONFIG_DIR (META 6). */
  env?: Record<string, string>;
  /** Which account this terminal belongs to, when it is not the main one. */
  account?: string;
  /** La cuadrilla a la que pertenece este panel, si nació dentro de un
      reparto: su color, su puesto y el objetivo común. */
  team?: { id: string; objetivo: string; color: string; rol: string; n: number; de: number };
  hidden: boolean;
  focused: boolean;
  /** Un contador que sube cuando alguien pide el teclado para ESTE panel desde
      fuera (hoy, el tablero de cuadrilla). Marcar el panel como activo no
      bastaba: dejaba el borde encendido y el cursor donde estuviera, así que
      «ir a la terminal que te espera» te dejaba a medio camino. Es un contador
      y no un booleano para que pedirlo dos veces seguidas funcione igual. */
  pideTeclado?: number;
  /** Lo que ocupa el árbol de procesos de ESTA terminal. Llega ya medido desde
      fuera (un solo sondeo para todas), no lo pide cada panel por su cuenta:
      seis paneles preguntando serían seis recorridos de la tabla de procesos
      del sistema para el mismo dato. */
  ram?: PanePulso;
  maximized: boolean;
  /** The size chosen in Settings: a ceiling, not a fixed value. */
  fontSize: number;
  /** Shrink the type so a crowded pane still fits a usable line. */
  autoFont: boolean;
  onClose: (id: number) => void;
  /** Cambiarle el nombre a esta sesión: doble clic en el nombre de la
      cabecera y se teclea ahí mismo. Ausente en la ventana suelta, donde el
      nombre viaja en la dirección de la ventana y no hay a quién contárselo. */
  onRename?: (id: number, nombre: string) => void;
  onFocusPane: (id: number) => void;
  onSplit: (id: number, dir: "right" | "down") => void;
  onToggleMax: (id: number) => void;
  /** Baja a la tira de minimizadas. Opcional: en el lienzo no hay mosaico del
      que salir, así que allí el botón no se pinta. */
  onMinimizar?: (id: number) => void;
  /** Fired when the agent finishes its turn: the canvas chains on this. */
  onTurnEnd?: (id: number) => void;
  /** Lo que se teclea aquí, tal cual, para que la cabina sepa que ya estás
      atendiendo esta terminal. */
  onEscribir?: (id: number, data: string) => void;
  /** What this pane is doing, reported up so the Foreman can reason about it.
      Everything here was already known INSIDE the pane (it is what the header
      paints); it just never left it. */
  onStatus?: (s: PaneStatus) => void;
  /** Streaming mode: mask secrets in the stream before xterm paints them. */
  stream: boolean;
  onSecret: (hits: Hit[], severe: boolean) => void;
  /** Absolute placement in the cockpit's mosaic (absent on the canvas). */
  style?: React.CSSProperties;
  /** Reanimar: matar el proceso colgado y retomar LA MISMA sesión en el
      sitio. El CLI de Claude se cuelga a veces a mitad de turno (fallo suyo,
      conocido y sin arreglo oficial); antes eso costaba Administrador de
      tareas y sesión perdida, ahora un clic — el transcript se conserva. */
  onRevivir?: (id: number, sessionId: string | undefined, cwd: string, name: string) => void;
  /** Las cuentas de Claude que hay configuradas, para poder relevar a otra. */
  cuentas?: Account[];
  /** Sigue ESTA terminal en otra cuenta, con un acta de dónde iba. */
  onRelevar?: (cuenta: Account) => void;
  /** Dropping one pane's header on another trades their places. */
  onSwap?: (from: number, to: number) => void;
  /** Pressing the header starts a move: the cockpit tracks it from here. */
  onHeaderDown?: (id: number, e: React.PointerEvent) => void;
  /** True while a pane is being dragged over this one. */
  dropTarget?: boolean;
  /** When to send a desktop notification for this pane. */
  notifyMode: NotifyMode;
  /** True cuando es la única terminal abierta: entonces el aviso naranja no
      pinta nada, porque no hay ninguna otra de la que distinguirla. El sonido
      sí se mantiene: puedes estar en otra ventana. */
  alone?: boolean;
  shadow?: boolean;
  /** Sacar esta terminal a su propia ventana de Windows. Ausente cuando ya
      está fuera, que es lo que quita el botón sin tener que preguntarlo. */
  onSacar?: (id: number) => void;
  /** Este panel vive SUELTO, en su propia ventana. Cambia lo que significa
      cerrar: aquí `onClose` DEVUELVE la terminal a Adeorq, no la mata, y el
      botón tiene que decirlo con su icono y sus palabras. Con la ✕ de siempre
      y su «Cerrar terminal», nadie la pulsaba por miedo a perder al agente, y
      Munir buscaba un botón de volver que «no existía» (2026-08-15). También
      esconde el maximizar del panel: en una ventana de verdad eso ya lo hace
      la barra de título de Windows, y el del panel ahí no hacía nada. */
  suelta?: boolean;
  /** Lo ya dicho en este panel, para escribirlo al nacer. Solo lo usa la
      terminal que renace en su propia ventana: el proceso lleva rato vivo y sin
      esto la ventana nueva empezaría en negro con la conversación perdida. */
  volcar?: string;
  /** Avisa de que el volcado ya se hizo, para que no se repita en otro montaje. */
  onVolcado?: () => void;
}

/** Our own drag type, so a dragged pane is never read as pasted text. */
export const PANE_MIME = "application/x-adeorq-pane";

/**
 * El color de fondo del lienzo de xterm, leído del CSS.
 *
 * No puede ser una constante: el renderer de xterm pinta su fondo él mismo, así
 * que no lo alcanza ninguna regla de CSS, y con una foto de fondo puesta hay que
 * abrirlo o la imagen no se ve. La variable la decide `App.css` (`--xterm-bg`),
 * que es quien sabe si hay fondo y qué tema está activo; aquí solo se lee.
 */
function fondoDeXterm(): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--xterm-bg")
    .trim();
  return v || FONDO_RESERVA;
}

/**
 * Si el fondo que le toca a la terminal es SÓLIDO, o sea que no hay nada que
 * dejar ver a través.
 *
 * Con transparencia, xterm renuncia a su camino rápido: tiene que componer cada
 * celda contra lo que hay debajo en vez de pintar y ya. Es lo correcto cuando
 * la gracia es ver tu foto por detrás, y es tirar rendimiento cuando el fondo
 * es negro sólido (el Apagón) o cuando has pedido el modo rendimiento.
 *
 * Se mira el COLOR que va a usar, no el ajuste: así vale para las tres formas
 * de acabar con un fondo sólido sin tener que acordarse de ninguna.
 */
function esFondoSolido(): boolean {
  const c = fondoDeXterm();
  const m = c.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const partes = m[1].split(/[,/]/).map((x) => x.trim());
    // Sin cuarto valor es un rgb() de toda la vida: opaco.
    return partes.length < 4 || Number(partes[3]) >= 0.999;
  }
  // `#rrggbbaa` y `#rgba` llevan la transparencia dentro; el resto es opaco.
  if (c.startsWith("#")) return c.length !== 9 && c.length !== 5;
  return !/transparent|color-mix|hsla|\/\s*0?\.\d/.test(c);
}

/** Aviso de que el fondo de la casa ha cambiado, para que las terminales ya
    abiertas se enteren sin tener que reiniciar la app. */
export const FONDO_EVENTO = "adeorq:fondo";

/**
 * Han soltado archivos sobre un panel.
 *
 * Lo dispara `App.tsx`, que es quien escucha el arrastre (el evento nativo de
 * Tauri llega a la ventana entera, no a cada panel). La ruta ya la escribe él;
 * esto existe solo para que el panel diga lo que solo él sabe: si el CLI que
 * tiene dentro va a entender esa ruta o no.
 */
export const SOLTADO_EVENTO = "adeorq:soltado";

// The CLI's TUI dialogs are cryptic for someone who doesn't live in a
// terminal. Detect them in the stream and surface real buttons instead:
// the number key is written back to the PTY exactly as a keypress would be.
interface AskOption {
  n: string;
  label: string;
  // Sin marcar: el rótulo salió de la PANTALLA de la terminal (lo que dijo el
  // CLI, que habla en su propio idioma y no se toca). Marcado: lo escribió
  // Adeorq mismo (el "[y/N]" sin texto no trae opciones que leer), así que sí
  // pasa por t().
  propio?: boolean;
}

interface Ask {
  hint: string;
  options: AskOption[];
  /** Menus footed "Enter to confirm" need the digit followed by Enter. */
  enter: boolean;
}

const ASK_TRIGGERS: Array<{ test: string; hint: string; enter?: boolean }> = [
  {
    test: "Do you want to proceed?",
    hint: "Claude te pide permiso antes de ejecutar esto. Elige:",
  },
  {
    test: "Do you trust",
    hint: "Pregunta si confías en esta carpeta. Es tuya, así que lo normal es la 1:",
  },
  {
    test: "Resume from summary",
    hint: "Cómo retomar la sesión: el resumen gasta menos cuota que la completa.",
  },
  {
    test: "Allow tool call?",
    hint: "Antigravity te pide permiso para ejecutar una herramienta:",
  },
  {
    test: "Do you want to run",
    hint: "Antigravity te pide confirmación para ejecutar el comando:",
  },
  {
    // Generic numbered menus (first-run prompts, /model, etc.). Kept LAST so
    // the specific hints above win when both match.
    test: "Enter to confirm",
    hint: "La terminal te pregunta algo: elige una opción (Esc en el teclado cancela).",
    enter: true,
  },
];

// Parses the VISIBLE screen text (from xterm's buffer): if the dialog shows
// on screen the bar arms; the moment the CLI erases it, the bar drops. No
// stream heuristics: the screen is the single source of truth.
function parseAsk(screen: string): Ask | null {
  for (const t of ASK_TRIGGERS) {
    const i = screen.lastIndexOf(t.test);
    if (i < 0) continue;
    const seg = screen.slice(i);
    // Ignore historical output where the trigger test occurred more than 12 lines ago:
    if (seg.split("\n").length > 12) continue;

    const opts: AskOption[] = [];
    // \s{1,2} (not 0): "Opus 4.7" must never parse as option 4.
    const re = /(?:❯\s*)?([1-9])\.\s{1,2}([^\n\r]{2,70})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(seg))) {
      const n = m[1];
      const label = m[2].split("│")[0].replace(/[─│┃└┘┌┐]+/g, " ").trim();
      if (label && !opts.some((o) => o.n === n)) opts.push({ n, label });
    }
    if (opts.length < 2 && /\[[yY]\/[nN]\]|\([yY]\/[nN]\)/i.test(seg)) {
      opts.push({ n: "y", label: "Permitir (y)", propio: true });
      opts.push({ n: "n", label: "Denegar (n)", propio: true });
    }
    if (opts.length >= 2) {
      return { hint: t.hint, options: opts.slice(0, 4), enter: t.enter ?? false };
    }
  }
  return null;
}

// El fondo de reserva, y solo eso. Los colores de las letras viven ahora en
// `lib/temasTerm.ts`, porque se eligen desde Ajustes y son una decisión aparte
// de la del tema de la casa: el tema de la app es el mueble, el de la terminal
// es la letra que se lee ocho horas.
//
// Translúcido y azul profundo (nunca negro plano) para que el panel se lea como
// cristal tintado aunque el renderer lo pinte sólido.
const FONDO_RESERVA = "rgba(13, 21, 36, 0.45)";

/** El tema completo para xterm: las letras del esquema elegido y el fondo de
    la casa, que es quien sabe si hay una foto detrás. */
function temaDeXterm() {
  return { ...coloresTerm(), background: fondoDeXterm() };
}

// Agent counter: Claude Code and agy both print a Task(...) line when they
// spawn a subagent and a "Done (" line when one finishes. Counting those in
// the stream is a heuristic, but it is free and needs no transcript access.
// The model name as each CLI prints it (Claude's welcome card, agy's footer).
//
// Con MAYÚSCULA inicial —sin la marca `i`— y con el número acotado a forma de
// versión. Antes llevaba `/…/i` y `[\d.]+`, y eso cazaba cualquier "opus"
// seguido de un número EN CUALQUIER PARTE de la pantalla: en una sesión que
// está escribiendo código sobre el códec de audio Opus, o sobre los propios
// modelos, el panel acababa anunciando un modelo que no existe (Munir vio
// «opus 6», 2026-07-29).
//
// Y aunque acierte, esto es una PISTA, no la verdad: la verdad está en el
// transcript, y desde hoy manda ella. Esto solo cubre el hueco de una sesión
// recién abierta que todavía no ha escrito su primer mensaje.
// Espacios y tabuladores, NUNCA `\s`, que es la diferencia entre leer el
// modelo y inventárselo. La pantalla llega como líneas unidas por "\n", y `\s`
// incluye el salto: bastaba con que un texto acabara una línea en la palabra
// "Opus" y la siguiente empezara por un número para que esto devolviera
// "Opus\n6", que al pintarse se lee "Opus 6". Munir lo vio anunciado en la
// cabecera de un panel el 2026-07-29, y ese modelo no existe ni ha existido.
// Un nombre de modelo no cruza de línea jamás, así que no se le deja.
const MODEL_RE =
  /\b(?:Opus|Sonnet|Haiku|Fable)[ \t]+\d+(?:\.\d+)?\b|\bGemini[ \t]+\d+(?:\.\d+)?[ \t]*(?:Pro|Flash)?/;
// Reasoning effort, shown in the footer of both.
const EFFORT_RE = /\b(low|medium|high|xhigh|max)\b/i;

// Only count the CLI's own tool line (bullet + Task(...)), never the word
// "Task(" written anywhere else: the loose version counted my own prose.
const SPAWN_RE = /^\s*[●•*]\s*(?:Task|Agent)\(/gm;
const DONE_RE = /⎿\s+Done \(/g;
const TAIL = 24;

// Nine panes on screen means each one is narrow, and the CLI's boxes wrap into
// mush below ~76 columns. So the Settings size is a ceiling: a cramped pane
// steps the type down until the line fits again.
const TARGET_COLS = 76;
const MIN_FONT = 9;
/** Cascadia Mono advance width as a fraction of the font size. */
const CELL_RATIO = 0.6;

function fontFor(width: number, ceiling: number, auto: boolean): number {
  if (!auto || width <= 0) return ceiling;
  const fits = Math.floor(width / (TARGET_COLS * CELL_RATIO));
  return Math.max(MIN_FONT, Math.min(ceiling, fits));
}

function countNew(re: RegExp, text: string, from: number): number {
  re.lastIndex = 0;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index + m[0].length > from) n++;
  }
  return n;
}

export default function TerminalPane({
  id,
  cwd,
  name,
  command,
  env,
  account,
  team,
  hidden,
  focused,
  pideTeclado,
  ram,
  maximized,
  fontSize,
  autoFont,
  onClose,
  onRename,
  onFocusPane,
  onSplit,
  onToggleMax,
  onMinimizar,
  onTurnEnd,
  onEscribir,
  onStatus,
  stream,
  onSecret,
  style,
  onRevivir,
  cuentas,
  onRelevar,
  onSwap,
  onHeaderDown,
  dropTarget,
  notifyMode,
  alone,
  shadow,
  onSacar,
  suelta,
  volcar,
  onVolcado,
}: Props) {
  const { t, lang } = useT();
  /** Las cuentas a las que tiene sentido saltar: todas menos en la que ya está.
   *  Un panel de la cuenta principal no lleva etiqueta, y su nombre es ese. */
  const otrasCuentas = (cuentas ?? []).filter((c) => c.label !== (account ?? "Principal"));
  const showMenu = useMenu();
  const holder = useRef<HTMLDivElement>(null);
  const [exited, setExited] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [done, setDone] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const dismissedAskRef = useRef(0);
  const [note, setNote] = useState<string | null>(null);
  /** La papelera pregunta antes de morder, con el mismo diálogo que la barra. */
  const [borrando, setBorrando] = useState(false);
  /** El nombre a medio teclear, cuando el doble clic lo puso en edición.
      `null` es «no se está editando»; el texto vive aquí y no en el DOM para
      que Escape pueda tirarlo sin tocar nada. */
  const [nombreEnEdicion, setNombreEnEdicion] = useState<string | null>(null);
  /** Ver `lib/velo.ts`: distingue pinchar el velo de soltar ahí un arrastre. */
  const bajoEnVelo = useRef(false);
  const [agents, setAgents] = useState({ live: 0, total: 0 });
  // Per-pane blur for streams: hide THIS terminal without hiding the rest.
  const [blurred, setBlurred] = useState(false);
  /** Por qué creemos que esta terminal está colgada, o `null` si no lo está.
   *
   *  `vigia`: el CLI de Claude se atascó en mitad de un turno (fallo suyo,
   *  conocido; en sesiones cargadas sobre todo). La firma medida: ni un byte
   *  de salida en minutos con el turno aún en pantalla. Es una SOSPECHA, y
   *  tarda tres minutos en formarse.
   *
   *  `mudo`: Rust nos lo ha dicho. Su lector dejó de poder vaciar esta
   *  terminal con el proceso todavía vivo, así que el agente se bloqueará en
   *  cuanto escriba. No es una sospecha ni hay nada que esperar.
   *
   *  En los dos casos se ofrece el Reanimar delante de la cara, no escondido
   *  en el menú. */
  const [colgado, setColgado] = useState<"vigia" | "mudo" | null>(null);
  const ultimoDatoRef = useRef(Date.now());
  const [brain, setBrain] = useState<{ model?: string; effort?: string }>({});
  
  // Shadow Mode (SVFS v1) States
  const [shadowActive, setShadowActive] = useState(false);
  const [shadowSession, setShadowSession] = useState<ShadowSession | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [shadowFiles, setShadowFiles] = useState<ShadowFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiffText, setFileDiffText] = useState<string>("");
  // El error del espejo se enseña por el aviso de la terminal (`setNote`), que
  // es donde el usuario está mirando; no hacía falta un segundo estado que
  // nadie leía.

  const shadowActiveRef = useRef(shadowActive);
  shadowActiveRef.current = shadowActive;
  const shadowSessionRef = useRef(shadowSession);
  shadowSessionRef.current = shadowSession;

  // Helper for SVFS: get project root path from cwd. The projects folder is a
  // setting now, so this cannot match a fixed C:\proyectos any more.
  const getProjectRoot = (cwdStr: string) => {
    const base = raiz().replace(/[\\/]+$/, "");
    if (!base) return cwdStr;
    const plano = (s: string) => s.replace(/\\/g, "/").toLowerCase();
    if (!plano(cwdStr).startsWith(`${plano(base)}/`)) return cwdStr;
    // Only separators and case change above, so the offset still lines up.
    const dentro = cwdStr.replace(/\//g, "\\").slice(base.length + 1).split("\\")[0];
    return dentro ? `${base}\\${dentro}` : cwdStr;
  };

  const refreshShadowStatus = () => {
    if (!shadowActiveRef.current || !shadowSessionRef.current) return;
    // Se pregunta al ÁRBOL DEL ESPEJO, no a la carpeta del proyecto: son
    // ficheros distintos, y preguntándole a la tuya salía tu propio trabajo
    // listado como si lo hubiera hecho el agente.
    shadowStatus(shadowSessionRef.current.worktreePath)
      .then((files) => {
        setShadowFiles(files);
        if (files.length > 0) {
          setSelectedFile((curr) => {
            if (!curr || !files.some(f => f.path === curr)) {
              return files[0].path;
            }
            return curr;
          });
        } else {
          setSelectedFile(null);
          setFileDiffText("");
        }
      })
      .catch((err) => {
        console.error("Error al leer status de sombra:", err);
      });
  };

  const handleToggleShadow = () => {
    if (shadowActive) {
      setShowDiff(true);
      refreshShadowStatus();
      return;
    }
    // A mitad NO se puede. El espejo es un DIRECTORIO aparte, y el CLI que ya
    // está corriendo nació dentro de esta carpeta: no hay forma de mudarlo sin
    // matarlo. Antes esto montaba el espejo igualmente y anunciaba «escrituras
    // aisladas» mientras el agente seguía escribiendo en tu proyecto, que es la
    // peor de las dos opciones: creerte protegido sin estarlo.
    setNote(
      "El Modo Espejo se elige al ABRIR la terminal, no después: esta ya está " +
        "corriendo dentro de tu carpeta. Ciérrala y ábrela en espejo, o pídeselo al Capataz.",
    );
    setTimeout(() => setNote(null), 9000);
  };

  const handleAcceptShadow = () => {
    if (!shadowSession) return;
    const projRoot = getProjectRoot(cwd);

    shadowAccept(projRoot, shadowSession.worktreePath, String(id))
      .then((resumen) => {
        setShadowActive(false);
        setShadowSession(null);
        setShowDiff(false);
        setShadowFiles([]);
        setSelectedFile(null);
        setFileDiffText("");
        // Lo que dice Rust, no una frase fija: antes ponía «integrados con
        // éxito» aunque el merge hubiera fallado, porque el error se ignoraba.
        setNote(resumen);
        setTimeout(() => setNote(null), 8000);
      })
      .catch((err) => {
        // El espejo NO se cierra si falla: el trabajo del agente sigue en su
        // árbol y en su rama, y se puede entrar a mirarlo.
        setNote(`${err}`);
      });
  };

  const handleDiscardShadow = () => {
    if (!shadowSession) return;
    const projRoot = getProjectRoot(cwd);

    shadowDiscard(projRoot, shadowSession.worktreePath, String(id))
      .then(() => {
        setShadowActive(false);
        setShadowSession(null);
        setShowDiff(false);
        setShadowFiles([]);
        setSelectedFile(null);
        setFileDiffText("");
        setNote("Cambios descartados y rama en la sombra eliminada.");
        setTimeout(() => setNote(null), 4000);
      })
      .catch((err) => {
        setNote(`Error al descartar cambios: ${err}`);
      });
  };

  const getFileDiff = (fullDiff: string, filename: string): string => {
    const lines = fullDiff.split("\n");
    const result: string[] = [];
    let capture = false;
    
    for (const line of lines) {
      if (line.startsWith("diff --git")) {
        const parts = line.split(" ");
        const bFile = parts[parts.length - 1]; // b/src/App.tsx
        if (bFile.endsWith("/" + filename) || bFile === filename || bFile.slice(2) === filename) {
          capture = true;
        } else {
          capture = false;
        }
      }
      if (capture) {
        result.push(line);
      }
    }
    return result.join("\n");
  };

  const renderDiffLines = (diffText: string) => {
    if (!diffText) return <div className="diff-empty">{t("Sin diferencias en este archivo")}</div>;
    const lines = diffText.split("\n");
    return (
      <pre className="diff-pre">
        {lines.map((line, idx) => {
          let className = "diff-line";
          if (line.startsWith("+")) className += " diff-add";
          else if (line.startsWith("-")) className += " diff-del";
          else if (line.startsWith("@@")) className += " diff-chunk";
          else if (line.startsWith("diff") || line.startsWith("index") || line.startsWith("---") || line.startsWith("+++")) className += " diff-header";
          
          return (
            <div key={idx} className={className}>
              <span className="diff-ln">{idx + 1}</span>
              <span className="diff-content">{line}</span>
            </div>
          );
        })}
      </pre>
    );
  };

  useEffect(() => {
    if (selectedFile && shadowActive && shadowSession) {
      shadowDiff(shadowSession.worktreePath, shadowSession.baseBranch)
        .then((fullDiff) => {
          const fileDiff = getFileDiff(fullDiff, selectedFile);
          setFileDiffText(fileDiff);
        })
        .catch((err) => {
          console.error("Error al leer diff del archivo:", err);
        });
    }
  }, [selectedFile, shadowActive, shadowSession, showDiff]);

  useEffect(() => {
    if (showDiff && shadowActive) {
      refreshShadowStatus();
    }
  }, [showDiff]);

  const [ctx, setCtx] = useState<ContextInfo | null>(null);
  /** Hasta qué escalón de contexto ya dijo «vale, lo he leído». Es un número y
      no un booleano para que ocultar el aviso del 60 % no te tape el del 80 %,
      que es el que de verdad cuesta dinero. */
  const [ctxVisto, setCtxVisto] = useState(0);
  // Lo leído del transcript, alcanzable desde el lector de pantalla, que se
  // construye una sola vez con la terminal y no se entera de los cambios.
  const ctxRef = useRef<ContextInfo | null>(null);
  ctxRef.current = ctx;
  const tailRef = useRef("");
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const pasteRef = useRef<(() => void) | null>(null);
  // Kept in a ref so the bell handler, created once with the terminal, always
  // calls the current callback instead of the one captured at mount.
  const turnEndRef = useRef(onTurnEnd);
  turnEndRef.current = onTurnEnd;
  // Por ref igual que el de arriba: el `onData` se engancha una sola vez, al
  // nacer la terminal, y se quedaría con la función de aquel primer render.
  const alEscribirRef = useRef(onEscribir);
  alEscribirRef.current = onEscribir;
  // Read by the data handler, which is built once with the terminal.
  const streamRef = useRef(stream);
  streamRef.current = stream;
  const onSecretRef = useRef(onSecret);
  onSecretRef.current = onSecret;
  // The PTY is spawned once, in an effect that must not re-run when props
  // change: its environment is read from here at that moment.
  /** En un ref y no leído directo: el efecto que monta el xterm corre una sola
      vez, y si mirara la prop se quedaría con la del primer render para
      siempre. Vaciarlo tras escribirlo es lo que impide volcar dos veces. */
  const volcarRef = useRef(volcar ?? "");
  const envRef = useRef(env);
  const notifyRef = useRef({ mode: notifyMode, name, focused, project: "" });
  notifyRef.current = { ...notifyRef.current, mode: notifyMode, name, focused };
  // Re-fits the terminal AND its type to the box it currently has. Lives in a
  // ref because the ResizeObserver is created once, with the terminal.
  const refitRef = useRef<() => void>(() => {});
  const lastSizeRef = useRef({ cols: 0, rows: 0 });
  // El PTY no existe hasta que Rust lo ha abierto, y abrirlo tarda más que los
  // primeros reajustes (el ResizeObserver dispara al montar, y xterm remide la
  // celda cuando la fuente termina de cargar). Un `pty_resize` que llega antes
  // responde "no such pty", se traga en el catch y el tamaño se da por enviado:
  // el CLI se queda creyendo que tiene otras filas que las que se ven, y como
  // repinta su pie con saltos de cursor relativos, cada tick del spinner cae
  // una línea más arriba o más abajo. Eso es el temblor. Por eso el tamaño se
  // encola detrás del arranque y se manda cuando hay a quién mandárselo.
  const ptyReadyRef = useRef<Promise<unknown>>(Promise.resolve());
  /** Lo último que el PTY ha CONFIRMADO, que no es lo mismo que lo último que
      se le pidió. Marcar un tamaño como puesto antes de saber si llegó es lo
      que dejaba al proceso escribiendo a un ancho y a la terminal pintando a
      otro, sin que nada lo volviera a intentar nunca (Munir, 2026-08-14: «el
      texto se bugea y aparece mal estructurado»). */
  const confirmadoRef = useRef({ cols: 0, rows: 0 });
  const enviarTamano = (cols: number, rows: number) => {
    // Ese pedido ya está en vuelo: repetirlo sería otro viaje para lo mismo.
    if (lastSizeRef.current.cols === cols && lastSizeRef.current.rows === rows) return;
    lastSizeRef.current = { cols, rows };
    void ptyReadyRef.current
      .then(() => {
        // Entre la cola y ahora el panel ha podido cambiar de tamaño otra vez:
        // solo se manda el último, nunca uno viejo que volvería a descuadrarlo.
        const now = lastSizeRef.current;
        if (now.cols !== cols || now.rows !== rows) return;
        return resizePty(id, cols, rows).then(() => {
          confirmadoRef.current = { cols, rows };
        });
      })
      .catch(() => {
        // No llegó. Se borra la marca del pedido para que el siguiente ajuste
        // lo vuelva a intentar: un fallo tragado en silencio dejaba al proceso
        // descuadrado hasta cerrar la terminal.
        lastSizeRef.current = { cols: -1, rows: -1 };
      });
  };
  /** Que el proceso sepa el tamaño que la terminal tiene AHORA.
   *
   * Va aparte y se llama SIEMPRE, incluso cuando no hay que tocar la rejilla.
   * Antes vivía al final de `aplicar()`, detrás del guardia que corta cuando el
   * dibujo ya está bien, así que un proceso que se hubiera quedado con un ancho
   * viejo no se enteraba jamás: la terminal se veía correcta y el agente seguía
   * escribiendo líneas más largas que el panel, que salen partidas por donde no
   * toca y con el resto colgando del margen. */
  const sincronizarPty = (t: { cols: number; rows: number }) => {
    if (t.cols !== confirmadoRef.current.cols || t.rows !== confirmadoRef.current.rows) {
      enviarTamano(t.cols, t.rows);
    }
  };
  refitRef.current = () => {
    const term = termRef.current;
    const fit = fitRef.current;
    const el = holder.current;
    if (!term || !fit || !el) return;
    // Un panel oculto (o aún sin medir) mide 0: ajustarlo a 0 lo deja en el
    // mínimo de columnas y al volver a mostrarlo arrastra esa medida.
    if (el.clientWidth === 0 || el.clientHeight === 0) return;

    const size = fontFor(el.clientWidth, fontSize, autoFont);
    const cambiaFuente = term.options.fontSize !== size;
    if (cambiaFuente) term.options.fontSize = size;

    // El hueco negro a la derecha al maximizar sale de aquí. Una terminal es
    // una rejilla: columnas = ancho / ancho de celda, redondeado hacia abajo.
    // Al maximizar cambian a la vez el ancho del panel Y la fuente (la
    // automática sube hasta el techo), pero xterm vuelve a medir la celda en
    // otro momento, no en esta línea. Si `fit()` corre antes de esa medida,
    // calcula las columnas con datos de dos estados distintos y salen de
    // menos: lo que sobra se queda en negro. Y no se corrige solo, porque el
    // panel ya no vuelve a cambiar de tamaño y el ResizeObserver no dispara.
    // Por eso, cuando la fuente cambia, se ajusta también en el frame
    // siguiente, ya con la celda remedida.
    const aplicar = () => {
      const t2 = termRef.current;
      const f2 = fitRef.current;
      const e2 = holder.current;
      if (!t2 || !f2 || !e2 || e2.clientWidth === 0) return;

      /* Ajustar SOLO si de verdad cambia la rejilla.
       *
       * `fit()` acaba llamando a `resize()`, y `resize()` rehace el texto para
       * el ancho nuevo y mueve el viewport a donde le toque. Aquí se llamaba en
       * cada aviso del ResizeObserver, y ese observador dispara por cualquier
       * cosa que mueva un píxel el alto del panel: una pregunta que aparece, el
       * aviso de contexto, la barra de agentes. O sea que estabas leyendo hacia
       * arriba, llegaba texto nuevo, y el scroll se te iba solo (Munir,
       * 2026-08-07: «un pequeño scroll y a veces se te teletransporta hacia muy
       * arriba»). Si las columnas y las filas van a ser las mismas, no hay nada
       * que ajustar y no se toca nada. */
      if (!hayQueAjustar(t2, f2.proposeDimensions())) {
        // El dibujo ya está bien, pero el PROCESO puede no saberlo. Este es el
        // caso que se escapaba: nada que reajustar en pantalla y un agente
        // escribiendo a un ancho que no existe.
        sincronizarPty(t2);
        return;
      }

      // Y cuando SÍ hay que ajustar, se vuelve a donde estabas mirando. Las dos
      // reglas y sus casos, en `lib/scrollTerm.ts`.
      const antes = { baseY: t2.buffer.active.baseY, viewportY: t2.buffer.active.viewportY };
      // Si el ancho no cambia, el texto no se re-envuelve, y entonces volver a
      // «la misma distancia del final» te mueve tantas líneas como haya crecido
      // el panel de alto. Ver `volverA`: es de donde salía el salto.
      const anchoAntes = t2.cols;

      f2.fit();

      const destino = volverA(antes, t2.buffer.active.baseY, t2.cols === anchoAntes);
      const colocar = () => {
        const t3 = termRef.current;
        if (!t3) return;
        if (destino === null) t3.scrollToBottom();
        else t3.scrollToLine(destino);
      };
      colocar();
      /* Y OTRA VEZ en el frame siguiente, que es lo que faltaba.
       *
       * Una terminal tiene dos scrolls: el del búfer, que es el que acabamos de
       * colocar, y el del div que xterm monta encima (`.xterm-viewport`, con
       * scroll de navegador). Ese div se resincroniza SOLO después de un cambio
       * de tamaño, en el frame siguiente, y pisaba lo que habíamos colocado: por
       * eso abrir una terminal nueva o desplegar la franja de Skills —las dos
       * cosas cambian el ancho de todos los paneles— te subían el historial y
       * había que bajar a mano cada vez (Munir, 2026-08-10).
       *
       * `hayQueRecolocar` evita el tirón cuando ya está bien, y de paso respeta
       * un scroll que hayas hecho tú entre medias. */
      requestAnimationFrame(() => {
        const t3 = termRef.current;
        if (!t3) return;
        const ahora = { baseY: t3.buffer.active.baseY, viewportY: t3.buffer.active.viewportY };
        if (hayQueRecolocar(destino, ahora)) colocar();
      });

      sincronizarPty(t2);
    };
    aplicar();
    if (cambiaFuente) requestAnimationFrame(aplicar);
  };
  const joined = command?.join(" ") ?? "";
  // The folder's own name, always visible: with nine panes open, "which one is
  // this?" has to be answerable without hovering or reading a path.
  // Windows separa con "\", así que partir solo por "/" no partía nada y el
  // chip acababa enseñando la ruta entera recortada ("C:\pro…") en vez del
  // proyecto. Se comía el sitio del nombre, que es lo único que dice de qué va
  // la terminal cuando hay siete abiertas.
  const project = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd;
  // El nombre suele venir como "Adeorq · Frontend" y el chip ya dice "Adeorq":
  // repetirlo gasta la mitad del ancho en decir dos veces lo mismo. Se quita el
  // prefijo y queda [Adeorq] Frontend, que es la misma información en la mitad.
  const label = name.startsWith(`${project} · `)
    ? name.slice(project.length + 3)
    : name;
  /* Confirmar lo tecleado tras el doble clic en el nombre. Se edita lo que se
     VE, o sea `label` sin el prefijo del proyecto; si el nombre lo llevaba, se
     conserva solo, para que renombrar no borre de paso a qué proyecto
     pertenecía. Vacío o igual: no se molesta a nadie. */
  const confirmarNombre = () => {
    const nuevo = (nombreEnEdicion ?? "").trim();
    setNombreEnEdicion(null);
    if (!nuevo || nuevo === label || !onRename) return;
    onRename(id, name.startsWith(`${project} · `) ? `${project} · ${nuevo}` : nuevo);
  };
  // Cuál de los CLIs corre aquí. Antes solo distinguía Claude, Antigravity y
  // «lo demás», y ese «lo demás» se anunciaba como PowerShell: una sesión de
  // Codex o de Cursor llevaba en la cabecera el nombre de otra herramienta.
  const kind = kindDeComando(joined);

  // Lo que este panel está haciendo, hacia arriba. El orden importa y es una
  // decisión, no un detalle:
  //   1. Si el proceso murió, murió.
  //   2. Si hay un menú en pantalla o pide login, te espera A TI. Esto va
  //      ANTES del transcript porque el menú es de ahora mismo y el transcript
  //      es de hace un momento.
  //   3. Si no, manda el transcript, que es quien sabe distinguir una pregunta
  //      en prosa ("ofrece") de un trabajo entregado ("lista"). La campana del
  //      terminal no sabe distinguirlas: suena igual en las dos.
  //   4. Si nada de eso se puede leer, se queda en "" = desconocido, y la reja
  //      del Capataz no tocará este panel.
  const statusRef = useRef("");
  useEffect(() => {
    if (!onStatus) return;
    const state: WorkState = exited
      ? ""
      : ask || needsLogin
        ? "pregunta"
        : ((ctx?.state ?? "") as WorkState);
    const next: PaneStatus = {
      id,
      name,
      cwd,
      agent: !!command,
      // El transcript PRIMERO. Ahí está el `model` con el que el CLI mandó cada
      // mensaje, que es lo que el modelo ES; lo de la pantalla es lo que se
      // leyó por ahí. Estaba al revés, así que una lectura equivocada de la
      // pantalla tapaba el dato bueno en lugar de ceder ante él.
      model: ctx?.model || brain.model || undefined,
      effort: brain.effort,
      percent: ctx?.percent,
      // El transcript va con retraso; los subagentes vivos que ha visto el
      // propio panel mandan sobre los que contó el fichero.
      agentsLive: Math.max(agents.live, ctx?.agentsLive ?? 0),
      state,
      sessionId: ctx?.sessionId || undefined,
    };
    // Un panel que no ha cambiado no vuelve a subir: si no, cada dato del PTY
    // haría re-renderizar App entera y con nueve terminales eso se nota.
    const key = JSON.stringify(next);
    if (key === statusRef.current) return;
    statusRef.current = key;
    onStatus(next);
  }, [onStatus, id, name, cwd, command, exited, ask, needsLogin, brain, ctx, agents.live]);

  const answerAsk = (n: string, enter: boolean) => {
    void writePty(id, enter ? `${n}\r` : n).catch(() => {});
    setAsk(null);
    dismissedAskRef.current = Date.now();
  };

  useEffect(() => {
    if (focused) setDone(false);
  }, [focused]);

  /** El foco de ahora mismo, para el montaje de xterm, que corre una sola vez
      y no puede depender de `focused` sin recrear la terminal entera. */
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  /* Solo parpadea el cursor de la terminal que tienes delante.
   *
   * Cada parpadeo repinta la terminal, y una terminal de Adeorq es cristal
   * sobre una foto: repintarla obliga a recalcular el desenfoque de todo lo que
   * tiene detrás. Con cuatro paneles abiertos eran ocho repintados por segundo
   * de media pantalla para dibujar tres cursores que no estás mirando. El de la
   * terminal activa sigue parpadeando, que es donde escribes y donde un cursor
   * quieto parece un guion (2026-08-07). */
  useEffect(() => {
    const term = termRef.current;
    if (term) term.options.cursorBlink = focused;
  }, [focused]);

  // El teclado, cuando lo piden desde fuera. No se hace en cada cambio de
  // `focused` a propósito: eso le robaría el cursor a quien esté escribiendo en
  // el buscador o en un cuadro cualquiera.
  useEffect(() => {
    if (pideTeclado) termRef.current?.focus();
  }, [pideTeclado]);

  // Escape cierra el diálogo de borrar. Va en window y no en el diálogo porque
  // el foco puede estar en la terminal de detrás cuando se abre.
  useEffect(() => {
    if (!borrando) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBorrando(false);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [borrando]);

  // El vigía del cuelgue. Tres minutos sin UN SOLO byte de salida no es un
  // modelo pensando: un CLI sano repinta su spinner sin parar aunque el modelo
  // calle (medido: el colgado da cero escrituras). Se comprueba además que en
  // pantalla siga el pie de turno («esc to interrupt»), para no acusar a una
  // terminal que simplemente está quieta esperándote a ti.
  useEffect(() => {
    if (kind !== "claude") return;
    const vigia = window.setInterval(() => {
      if (exited || Date.now() - ultimoDatoRef.current < 180_000) return;
      const term = termRef.current;
      if (!term) return;
      const buf = term.buffer.active;
      const end = buf.baseY + buf.cursorY;
      let cola = "";
      for (let i = Math.max(0, end - 6); i <= end; i++) {
        cola += (buf.getLine(i)?.translateToString(true) ?? "") + "\n";
      }
      if (cola.includes("to interrupt")) setColgado("vigia");
    }, 20_000);
    return () => window.clearInterval(vigia);
  }, [kind, exited]);

  // Context meter and agent count: only for agent panes, both read from the
  // session's own transcript. Polls faster while subagents are out, so the
  // counter tracks the work instead of lagging half a minute behind it.
  useEffect(() => {
    // Claude only: agy keeps no transcript here, and reading the folder's
    // newest one would show it another agent's context and crew as if its own.
    if (kind !== "claude") return;
    // Las dos formas de nombrar la sesión, no solo `--resume`: una terminal
    // recién abierta lleva `--session-id`, y sin él esto acababa leyendo el
    // transcript más reciente de la carpeta, que es justo lo que el comentario
    // de arriba dice que no hay que hacer.
    const sid = sessionIdOf(joined);
    let timer = 0;
    let stop = false;
    const look = () => {
      sessionContext(cwd, sid)
        .then((c) => {
          if (stop) return;
          setCtx(c);
          timer = window.setTimeout(look, c && c.agentsLive > 0 ? 6_000 : 20_000);
        })
        .catch(() => {
          if (!stop) timer = window.setTimeout(look, 20_000);
        });
    };
    look();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [cwd, joined, kind]);

  // El fondo de la casa se puede poner y quitar con las terminales abiertas, y
  // el color del lienzo de xterm no lo alcanza ninguna regla de CSS: hay que
  // decírselo. Sin esto habría que reiniciar Adeorq para ver la foto.
  // Y lo mismo con el esquema de colores: se elige en Ajustes y tiene que
  // verse en las terminales que ya están abiertas, sin reiniciar nada.
  useEffect(() => {
    const alCambiar = () => {
      const t = termRef.current;
      if (!t) return;
      t.options.theme = temaDeXterm();
      // Y si el fondo que le acaba de tocar es SÓLIDO, xterm deja de trabajar
      // como si fuera translúcido. Es su camino rápido, y es el gasto de fondo
      // debajo de todo el rendimiento de Adeorq: mantenerlo encendido cuando
      // ya no hay nada que dejar ver es pagar por nada (2026-08-07).
      t.options.allowTransparency = !esFondoSolido();
    };
    window.addEventListener(FONDO_EVENTO, alCambiar);
    window.addEventListener(TEMA_TERM_EVENTO, alCambiar);
    return () => {
      window.removeEventListener(FONDO_EVENTO, alCambiar);
      window.removeEventListener(TEMA_TERM_EVENTO, alCambiar);
    };
  }, []);

  // Han soltado un archivo aquí. La ruta ya la ha escrito App; lo que se dice
  // aquí es lo único que este panel sabe y App no: si el CLI de dentro va a
  // entender esa ruta.
  //
  //   · Claude Code y agy LEEN la ruta escrita en el prompt.
  //   · Codex NO la lee del texto. Lo dice su propio binario: «Paste an image
  //     with Ctrl+V to attach it to your next message». Le queda una cadena en
  //     el prompt y ninguna imagen, así que hay que avisar.
  useEffect(() => {
    const alSoltar = (e: Event) => {
      const d = (e as CustomEvent<{ id: number; paths: string[] }>).detail;
      if (!d || d.id !== id) return;
      const imagen = d.paths.some((p) => /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(p));
      if (!imagen) {
        setNote("Ruta escrita en el prompt. Escribe al lado qué quieres que haga con ella.");
        return;
      }
      setNote(
        sabe(kind, "leeRutaDeImagen")
          ? "Imagen puesta como ruta: el agente la lee de ahí. Escribe tu pregunta al lado y Enter."
          : "Ruta escrita, pero este cliente no lee imágenes de una ruta: cópiala y pégala aquí con Ctrl+V.",
      );
    };
    window.addEventListener(SOLTADO_EVENTO, alSoltar);
    return () => window.removeEventListener(SOLTADO_EVENTO, alSoltar);
  }, [id, kind]);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;

    const term = new Terminal({
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      fontSize,
      lineHeight: 1.2,
      letterSpacing: 0.2,
      // Nace parpadeando solo si es la terminal que tienes delante; el efecto
      // de abajo lo mantiene al día. Ver el porqué allí.
      cursorBlink: focusedRef.current,
      cursorStyle: "bar",
      /* Cuánto historial guarda cada terminal, en líneas.
       *
       * Ocho mil por terminal son un buen pico de la memoria del navegador (267
       * MB medidos con tres abiertas), y la mayoría no se mira jamás: para
       * volver a lo de hace rato está el transcript entero, que Adeorq lee
       * aparte. Pero recortarlo por las bravas es quitarle a Munir algo que
       * tiene, así que se pregunta: en el modo rendimiento baja a 2.500, que
       * siguen siendo cien pantallas, y en modo normal se queda como estaba. */
      scrollback: modoRendimiento() ? 2500 : 8000,
      // Solo cuando de verdad hay algo que dejar ver detrás. Ver `esFondoSolido`.
      allowTransparency: !esFondoSolido(),
      theme: temaDeXterm(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    termRef.current = term;
    fitRef.current = fit;
    term.open(el);
    try {
      const webgl = new WebglAddon();
      // El navegador solo aguanta unos cuantos lienzos WebGL a la vez, y cada
      // panel abre el suyo: al abrir uno de más, el sistema le quita el
      // contexto a otro. Sin esto, ese panel se queda con lo último pintado y
      // parpadea; soltando el addon vuelve al pintado normal, que va algo más
      // lento pero se ve.
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // WebGL unavailable: xterm falls back to the DOM renderer on its own
    }
    refitRef.current();

    // Clipboard like a normal Windows app: the WebView doesn't deliver the
    // native paste event to xterm's hidden textarea, so handle it ourselves.
    // Ctrl+V (and Ctrl+Shift+V) pastes; Ctrl+C copies when there IS a
    // selection (and still interrupts when there isn't); right-click pastes,
    // exactly like Windows Terminal.
    // Paste handles BOTH text and images: an image goes to disk and the pane
    // receives its path, which is what Claude Code and agy read to see it.
    const pasteClipboard = () => {
      void navigator.clipboard
        .read()
        .then(async (items) => {
          for (const item of items) {
            const imgType = item.types.find((t) => t.startsWith("image/"));
            if (imgType) {
              const blob = await item.getType(imgType);
              const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
              const path = await savePastedImage(bytes, imgType.split("/")[1] ?? "png");
              term.paste(`"${path}" `);
              setNote(
                "Imagen pegada como archivo: el agente la lee de esa ruta. Escribe tu pregunta al lado y Enter.",
              );
              return;
            }
          }
          const text = await navigator.clipboard.readText();
          if (text) term.paste(text);
        })
        .catch(() => {
          // Older clipboard API or permission denied: fall back to text.
          void navigator.clipboard
            .readText()
            .then((t) => {
              if (t) term.paste(t);
            })
            .catch(() => {});
        });
    };

    // El pegado nativo del WebView, CALLADO. El comentario de arriba dice que
    // el WebView no entrega el evento de pegado al textarea de xterm, y cuando
    // se escribió era verdad; el WebView2 se actualiza solo y ha dejado de
    // serlo. Resultado: pegaban DOS caminos —este evento y nuestro Ctrl+V— y
    // todo lo pegado salía doble, concatenado sin espacio. Munir pegó
    // `claude --strict-mcp-config` y la terminal recibió
    // `claude --strict-mcp-configclaude --strict-mcp-config` (2026-07-30).
    // En captura y con stopPropagation: el evento muere antes de llegar al
    // textarea de xterm, y pegar queda en manos de un único dueño,
    // `pasteClipboard`, que es el que sabe de imágenes.
    const pasteNativo = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener("paste", pasteNativo, true);

    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== "keydown" || !ev.ctrlKey || ev.altKey) return true;
      const key = ev.key.toLowerCase();
      if (key === "c" && !ev.shiftKey && term.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection()).catch(() => {});
        term.clearSelection();
        return false;
      }
      if (key === "v") {
        pasteClipboard();
        return false;
      }
      return true;
    });
    pasteRef.current = pasteClipboard;

    let disposed = false;
    const unsubs: Array<() => void> = [];

    // env decides which account this terminal belongs to, and it can only be
    // set at birth: the CLI reads it once, on start.
    let arranque: Promise<void>;
    if (shadow) {
      const projRoot = getProjectRoot(cwd);
      arranque = shadowInit(projRoot, String(id))
        .then((sess) => {
          setShadowActive(true);
          setShadowSession(sess);
          // AQUÍ está el aislamiento: la terminal nace DENTRO del árbol espejo,
          // no en la carpeta del proyecto. Arrancándola en `cwd`, como se hacía
          // antes, el agente escribía en tus ficheros y el «modo espejo» era
          // solo un cambio de rama que además le cambiaba la rama a los demás
          // paneles abiertos en ese proyecto.
          return spawnPty(id, sess.worktreePath, term.cols, term.rows, command, envRef.current);
        })
        .catch((e) => {
          // Sin espejo NO se abre la terminal igualmente. Antes se abría en tu
          // carpeta con el aviso perdido entre la salida del CLI: creías estar
          // en un sandbox y estabas escribiendo en tu proyecto.
          term.writeln(`[adeorq] No he podido montar el Modo Espejo: ${e}`);
          term.writeln(`[adeorq] La terminal NO se abre, para no escribir en tu carpeta creyendo que estás aislado.`);
          throw e;
        });
    } else {
      arranque = spawnPty(id, cwd, term.cols, term.rows, command, envRef.current).catch(
        (e) => {
          term.writeln(`[adeorq] error al abrir la terminal: ${e}`);
          // Se vuelve a lanzar para que la cola de tamaños sepa que no hay PTY al
          // que hablarle y no se quede esperando a uno que no va a existir.
          throw e;
        },
      );
    }
    // Lo que ya se había dicho en este panel, cuando la terminal renace en otra
    // ventana. Se escribe ANTES de que llegue nada nuevo del PTY, o el final de
    // la conversación aparecería por encima del principio. Es texto crudo con
    // sus colores y sus saltos: xterm lo interpreta igual que si acabara de
    // salir del proceso, porque es exactamente lo que salió de él.
    if (volcarRef.current) {
      term.write(volcarRef.current);
      volcarRef.current = "";
      onVolcado?.();
    }
    ptyReadyRef.current = arranque;
    void arranque
      .then(() => {
        // Ya hay PTY. Se olvida lo que se dio por enviado mientras no lo había
        // y se vuelve a medir: es la única pasada que garantiza que las filas
        // del proceso son las que se ven en pantalla.
        //
        // Y se olvida también lo CONFIRMADO, que es lo que hace que este ajuste
        // sirva de algo cuando la terminal renace sobre un PTY que ya existía
        // (una sacada a su propia ventana): allí el proceso lleva el ancho de la
        // ventana de la que viene, y sin esto nadie le diría el nuevo.
        lastSizeRef.current = { cols: 0, rows: 0 };
        confirmadoRef.current = { cols: 0, rows: 0 };
        refitRef.current();
      })
      .catch(() => {});

    const dataSub = term.onData((data) => {
      // Queda apuntado que AQUÍ se está escribiendo: es la única señal fiable
      // de eso, y de ella depende que otro pane que termine no te quite la
      // pantalla a mitad de frase. Ver lib/tecleando.
      apuntaTecla(id);
      // Y hacia arriba, que es lo que devuelve al mosaico una terminal puesta
      // a pantalla completa por el salto en cuanto le contestas.
      alEscribirRef.current?.(id, data);
      void writePty(id, data).catch(() => {});
    });
    unsubs.push(() => dataSub.dispose());

    // Screen-mirror hints: after xterm applies each write, read the visible
    // tail of its buffer (throttled) and derive the dialog bar + notes from
    // what is actually on screen right now.
    let hintTimer: number | undefined;
    const refreshHints = () => {
      hintTimer = undefined;
      const buf = term.buffer.active;
      const end = buf.baseY + buf.cursorY;
      const lines: string[] = [];
      for (let i = Math.max(0, end - 15); i <= end; i++) {
        lines.push(buf.getLine(i)?.translateToString(true) ?? "");
      }
      const screen = lines.join("\n");
      const recentDismiss = Date.now() - dismissedAskRef.current < 2500;
      const question = recentDismiss ? null : parseAsk(screen);
      setAsk((before) => {
        if (question && !before) {
          const n = notifyRef.current;
          const isFocused = n.focused && document.hasFocus();
          if (!isFocused) {
            chime("ask", n.mode, n.focused);
            void notify({
              mode: n.mode,
              tag: `${id}:ask`,
              title: `${n.project || "Adeorq"} · espera tu OK`,
              body: question.options.map((o) => `${o.n}. ${o.label}`).join("  ·  ").slice(0, 120),
              looking: n.focused,
            });
          }
        }
        return question;
      });
      // Which brain is in this pane: both CLIs print the model on their
      // welcome card and the effort in their footer, so read it off screen
      // (and keep the last one seen when it scrolls away).
      //
      // Pero en cuanto el transcript ha dicho cuál es, esto DEJA de mirar. Es
      // una conjetura leyendo texto de pantalla, y una conjetura que sigue
      // corriendo cuando ya tienes el dato solo puede empeorarlo: se guardaba
      // para siempre en `prev.model`, así que un acierto falso de un segundo
      // se quedaba puesto el resto de la sesión. La verdad calla a la pista.
      const model = ctxRef.current?.model ? undefined : screen.match(MODEL_RE)?.[0];
      const effort = lines
        .slice(-6)
        .join(" ")
        .match(EFFORT_RE)?.[1];
      if (model || effort) {
        setBrain((prev) => ({
          model: model ? model.replace(/\s+/g, " ") : prev.model,
          effort: effort ? effort.toLowerCase() : prev.effort,
        }));
      }
      if (screen.includes("Compacting conversation")) {
        setNote(
          "Claude está comprimiendo la memoria de la charla (normal en sesiones largas): unos segundos y sigue solo.",
        );
      } else if (screen.includes("queued messages")) {
        setNote(
          "Claude sigue ocupado: lo que escribas ahora queda en cola y se envía solo cuando termine.",
        );
      } else {
        setNote(null);
      }
    };
    const scheduleHints = () => {
      if (hintTimer === undefined) {
        hintTimer = window.setTimeout(refreshHints, 150);
      }
    };

    // The Claude CLI rings the terminal bell when its turn ends; that is the
    // "this pane finished and waits for you" signal (blue glow).
    const bellSub = term.onBell(() => {
      setDone(true);
      // Turn over: whatever was running has finished, keep only the total.
      setAgents((a) => ({ live: 0, total: a.total }));
      turnEndRef.current?.(id);
      if (shadowActiveRef.current) {
        refreshShadowStatus();
      }
      const n = notifyRef.current;
      const isFocused = n.focused && document.hasFocus();
      if (!isFocused) {
        chime("done", n.mode, n.focused);
        void notify({
          mode: n.mode,
          tag: `${id}:done`,
          title: `${n.project || "Adeorq"} · terminó`,
          body: n.name,
          looking: n.focused,
        });
      }
    });
    unsubs.push(() => bellSub.dispose());

    // The shield sits between the PTY and the screen: in streaming mode the
    // bytes are masked before they are painted, so a key that scrolls past is
    // never visible even to someone recording the stream.
    const shield = new RedactStream(
      (text) => term.write(text, scheduleHints),
      (hits, severe) => onSecretRef.current(hits, severe),
    );

    void onPtyData((p) => {
      if (p.id !== id) return;
      ultimoDatoRef.current = Date.now();
      setColgado(null);
      if (streamRef.current) {
        shield.push(p.data);
      } else {
        // Leaving streaming mode: whatever was held back goes out first.
        shield.flush();
        term.write(p.data, scheduleHints);
      }
      const text = tailRef.current + p.data;
      const spawned = countNew(SPAWN_RE, text, tailRef.current.length);
      const ended = countNew(DONE_RE, text, tailRef.current.length);
      tailRef.current = text.slice(-TAIL);
      if (spawned || ended) {
        setAgents((a) => ({
          live: Math.max(0, a.live + spawned - ended),
          total: a.total + spawned,
        }));
      }
      if (
        p.data.includes("Re-authenticate to continue") ||
        p.data.includes("OAuth access token has expired")
      ) {
        setNeedsLogin(true);
      } else if (p.data.includes("Login successful")) {
        setNeedsLogin(false);
      }
    }).then((un) => {
      if (disposed) un();
      else unsubs.push(un);
    });

    void onPtyExit((p) => {
      if (p.id !== id) return;
      setExited(true);
      term.write("\r\n\x1b[90m[proceso terminado]\x1b[0m\r\n");
    }).then((un) => {
      if (disposed) un();
      else unsubs.push(un);
    });

    // Rust ya no puede vaciar esta terminal: el agente se bloqueará en cuanto
    // escriba. No hay nada que esperar, así que el aviso sale AHORA y no
    // dentro de tres minutos, cuando el vigía lo sospeche por su cuenta.
    void onPtyMudo((mudo) => {
      if (mudo !== id) return;
      setColgado("mudo");
    }).then((un) => {
      if (disposed) un();
      else unsubs.push(un);
    });

    /* Un ajuste por frame como mucho, y durante un arrastre uno cada 80 ms.
     *
     * El ResizeObserver dispara por cada píxel, así que arrastrando un
     * separador (o el borde de la ventana) llegaban decenas de avisos por
     * segundo y cada uno costaba un reflow del búfer entero más un salto a
     * Rust para avisar del tamaño. Coalescer en un rAF funde todos los del
     * mismo frame en uno; la cadencia del arrastre baja de sesenta a doce por
     * segundo, que es donde el texto todavía se ve fluir pero ya no cuesta.
     *
     * Si toca esperar, se vuelve a pedir el frame en vez de descartar el
     * aviso: descartarlo dejaría la terminal con el ancho de hace un momento
     * si el ratón se para justo ahí. */
    let pedido = 0;
    let ultimo = 0;
    const pedirRefit = () => {
      if (pedido) return;
      pedido = requestAnimationFrame(() => {
        pedido = 0;
        if (!tocaAjustar(Date.now(), ultimo, redimensionando())) {
          pedirRefit();
          return;
        }
        ultimo = Date.now();
        refitRef.current();
      });
    };
    const ro = new ResizeObserver(pedirRefit);
    ro.observe(el);
    /* Y el ajuste bueno, el de después de soltar. */
    const alSoltar = () => refitRef.current();
    window.addEventListener(EVENTO_REFIT, alSoltar);
    term.focus();

    return () => {
      disposed = true;
      ro.disconnect();
      if (pedido) cancelAnimationFrame(pedido);
      window.removeEventListener(EVENTO_REFIT, alSoltar);
      el.removeEventListener("paste", pasteNativo, true);
      pasteRef.current = null;
      unsubs.forEach((un) => un());
      shield.flush();
      forgetPane(id);
      // Salvo que se esté MUDANDO a otra ventana. Esta terminal desaparece de
      // aquí, pero su agente sigue trabajando al otro lado; matarlo ahora sería
      // perder el trabajo por haberla sacado de sitio (ver lib/mudanza.ts).
      if (!seMuda(id)) void killPty(id);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      window.clearTimeout(hintTimer);
    };
  }, [id, cwd]);

  // Font size applies to the LIVE terminal: resize in place, never respawn.
  // `maximized` y `hidden` entran aquí a propósito: maximizar no cambiaba nada
  // por sí mismo y todo se confiaba al ResizeObserver, que dispara una vez y no
  // vuelve. Si ese disparo pilla la fuente a medio remedir, el hueco negro se
  // queda para siempre. Volver a ajustar al cambiar de estado lo cierra.
  useEffect(() => {
    refitRef.current();
    // Y otra pasada en el frame siguiente, cuando el layout ya está aplicado:
    // el primer ajuste puede correr con el tamaño de antes de maximizar.
    const f = requestAnimationFrame(() => refitRef.current());
    return () => cancelAnimationFrame(f);
  }, [fontSize, autoFont, id, maximized, hidden]);

  // Lo que cuesta una sesión cargada, dicho ANTES de que sea tarde.
  //
  // La cabecera ya pintaba el porcentaje en naranja, y eso no basta: un número
  // no dice que a partir de cierto punto CADA mensaje vuelve a pagar el
  // contexto entero, ni que compactar paga de golpe todo lo acumulado. Munir
  // llegó al 88 % de un millón sin saberlo, le dio a `/compact` tres veces
  // creyendo que arreglaba algo, y esos tres intentos gastaron más cuota que
  // un día completo de trabajo (2026-07-30). El aviso es para que esa decisión
  // se tome con el dato delante, que es lo único que faltaba.
  //
  // 0 = nada que decir · 1 = ya pesa · 2 = compactar sale peor que empezar.
  //
  // Se mide SOLO en porcentaje de la ventana, y eso corrige lo anterior.
  //
  // Antes había una doble vara: saltaba por tokens (150.000 y 400.000) o por
  // porcentaje, lo que ocurriera antes. La idea era que lo que cuesta dinero
  // son los tokens y no la fracción; el efecto real fue el contrario. Opus 5 y
  // Sonnet 5 declaran un MILLÓN de ventana, así que la vara de los tokens
  // disparaba siempre primero: el primer aviso al 15 % y el «compactar sale
  // peor que empezar de cero» al 40 %, con el 60 % de la ventana todavía libre.
  // Dicho de otra forma: cualquier sesión de trabajo de verdad nacía avisada, y
  // el aviso grave mentía (Munir, 2026-08-06: «son muy molestas y aunque el
  // contexto esté por debajo del 50 % siguen apareciendo»).
  //
  // Con una sola vara el aviso vuelve a querer decir algo en cualquier modelo:
  // con Haiku el 60 % son 120.000 tokens y con Opus 600.000, que es justo la
  // diferencia que la doble vara borraba. Y lo que cuesta la sesión sigue
  // estando a la vista sin que nadie avise: la píldora de la cabecera lleva el
  // número puesto todo el rato.
  const ctxNivel = !ctx ? 0 : ctx.percent >= 80 ? 2 : ctx.percent >= 60 ? 1 : 0;
  const avisoCtx = ctxNivel > ctxVisto ? ctxNivel : 0;

  // Reanimar una sesión PASADA DE TAMAÑO es volver a cargarle los mismos
  // tokens que la ahogaron: se cuelga otra vez en cuanto respira. A partir
  // del 80 % se reanima ABRIENDO LIMPIA, que es lo único que la salva, y la
  // etiqueta lo dice para que nadie espere recuperar la conversación. Munir
  // llegó a este panel con 885.023 tokens y el aviso rojo puesto, y aun así
  // el botón le habría devuelto el mismo cadáver (2026-07-31).
  const reanimarLimpio = ctxNivel >= 2;
  const reanimar = () =>
    onRevivir?.(id, reanimarLimpio ? undefined : ctx?.sessionId, cwd, name);
  const etiquetaReanimar = reanimarLimpio
    ? t("⚡ Reanimar EN LIMPIO (esta sesión pesa demasiado para recuperarla)")
    : t("⚡ Reanimar (si se ha quedado colgada)");

  // The transcript is the source of truth for subagents; the screen heuristic
  // only stands in for panes with no transcript to read (agy, plain shells).
  const crew = ctx
    ? { live: ctx.agentsLive, total: ctx.agentsTotal, exact: true }
    : { ...agents, exact: false };

  // El globo del título carga con lo que la cabecera no pudo enseñar.
  // La zona de estado suelta datos según se estrecha la terminal (el esfuerzo,
  // la memoria, el modelo, el medidor), y desde aquí no hay forma de saber cuál
  // quedó a la vista: el ancho lo decide arrastrar un separador. Así que se
  // arma entero siempre y no se pierde nada por estrechar un panel.
  const cerebro = ctx?.model || brain.model;
  const resumen =
    [
      name === label ? "" : name,
      cerebro ? `${cerebro}${brain.effort ? ` · ${brain.effort}` : ""}` : "",
      ctx && ctx.percent > 0 ? `${ctx.percent} % ${t("de contexto usado")}` : "",
      ram && ram.ramMb > 0 ? `${bonito(ram.ramMb, lang)} ${t("de memoria")}` : "",
      // La única pista de que el nombre se puede editar: sin ella, el doble
      // clic es un secreto que hay que adivinar.
      onRename ? t("Doble clic para cambiar el nombre") : "",
    ]
      .filter(Boolean)
      .join("\n") || undefined;

  return (
    <section
      className={`pane${hidden ? " pane-hidden" : ""}`}
      // El color del equipo entra como variable para que lo usen el borde y la
      // chapa: así los seis paneles de una cuadrilla se leen como un bloque.
      style={team ? { ...style, ["--team" as string]: team.color } : style}
      data-team={!!team}
      data-pane-id={id}
      data-drop={dropTarget}
      data-focused={focused}
      data-blurred={blurred}
      data-done={done && !focused && !alone}
      onMouseDownCapture={() => onFocusPane(id)}
      onContextMenu={(e) => {
        const term = termRef.current;
        const sel = term?.getSelection() ?? "";
        showMenu(e, [
          {
            label: t("Copiar"),
            hint: "Ctrl+C",
            onClick: () => {
              if (sel) void navigator.clipboard.writeText(sel).catch(() => {});
            },
          },
          { label: t("Pegar"), hint: "Ctrl+V", onClick: () => pasteRef.current?.() },
          { label: "", separator: true },
          {
            label: t("Partir a la derecha"),
            hint: "Ctrl+Mayús+→",
            onClick: () => onSplit(id, "right"),
          },
          {
            label: t("Partir abajo"),
            hint: "Ctrl+Mayús+↓",
            onClick: () => onSplit(id, "down"),
          },
          {
            label: maximized ? t("Restaurar") : t("Maximizar"),
            hint: "Ctrl+Mayús+F",
            onClick: () => onToggleMax(id),
          },
          {
            label: blurred ? t("Mostrar esta terminal") : t("Tapar esta terminal (para emitir)"),
            onClick: () => setBlurred((v) => !v),
          },
          // Revivir es volver a la MISMA conversación, así que solo cabe en un
          // CLI cuya sesión se puede retomar por su id. En los demás, «revivir»
          // abriría un hilo nuevo con cara de ser el de antes.
          ...(onRevivir && sabe(kind, "retomable")
            ? [
                { label: etiquetaReanimar, onClick: reanimar },
              ]
            : []),
          // Seguir en otra cuenta sin esperar a que salte el aviso. La terminal
          // nueva nace con un acta de dónde ibas, no vacía (ver lib/relevo.ts),
          // porque el valor de esto no es abrir otra cuenta (eso ya se podía)
          // sino no tener que contarle otra vez lo que llevabas media hora
          // explicando (Munir, 2026-08-01).
          ...(onRelevar && sabe(kind, "retomable") && otrasCuentas.length > 0
            ? [
                { label: "", separator: true },
                { label: t("Seguir en otra cuenta"), heading: true },
                ...otrasCuentas.map((c) => ({
                  label: c.label,
                  hint: t("con acta"),
                  onClick: () => onRelevar(c),
                })),
              ]
            : []),
          { label: "", separator: true },
          suelta
            ? { label: t("Devolver a Adeorq"), onClick: () => onClose(id) }
            : { label: t("Cerrar terminal"), danger: true, onClick: () => onClose(id) },
        ]);
      }}
      onDragOver={(e) => {
        if (
          e.dataTransfer.types.includes(PANE_MIME) ||
          e.dataTransfer.types.includes("text/plain") ||
          e.dataTransfer.types.includes("Files")
        ) {
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        // Another pane was dropped here: swap them and stop.
        const dragged = e.dataTransfer.getData(PANE_MIME);
        if (dragged) {
          onSwap?.(Number(dragged), id);
          return;
        }
        // Los ARCHIVOS no pasan por aquí y nunca pasaron: en Tauri 2 la ventana
        // se queda el arrastre del sistema y el WebView no ve el evento, así
        // que `e.dataTransfer.files` está siempre vacío. Ahora los escucha
        // `App.tsx` por el evento nativo, que además trae la ruta de verdad.
        // Lo que sí llega aquí es lo que se arrastra DENTRO de la ventana: un
        // panel (arriba) y texto (abajo).
        const text = e.dataTransfer.getData("text/plain");
        if (text) {
          void writePty(id, text).catch(() => {});
          onFocusPane(id);
        }
      }}
    >
      <header
        className="pane-head"
        data-movable={!!onHeaderDown}
        onPointerDown={(e) => {
          // Buttons keep their own behaviour; so does the rename box, or
          // selecting text inside it would start dragging the pane around.
          if (e.button !== 0 || (e.target as HTMLElement).closest("button, input")) return;
          onHeaderDown?.(id, e);
        }}
        /* La cabecera se desplaza con la rueda cuando no cabe.
         *
         * Antes, al estrechar una terminal, los BOTONES se iban escondiendo uno
         * a uno: el de partir, el de tapar, el del espejo... y a 250px la
         * cabecera se quedaba en dos. Eso es esconder acciones sin decirlo, y
         * con tres terminales en pantalla pasa siempre (Munir, 2026-08-07: «que
         * puedas hacer scroll o algo para que se vea bien el menú»). Ahora no se
         * esconde ni un botón: si no caben, se llega a ellos rodando la rueda
         * encima, como en la fila de un proyecto.
         *
         * Solo se queda el evento si de verdad lo usa: al llegar al final, la
         * rueda vuelve a ser de quien estuviera debajo. */
        onWheel={(e) => {
          const el = e.currentTarget;
          if (el.scrollWidth - el.clientWidth <= 1) return;
          if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
          const antes = el.scrollLeft;
          el.scrollLeft += e.deltaY;
          if (el.scrollLeft !== antes) e.preventDefault();
        }}
      >
        {/* TRES ZONAS, y el orden importa.
            Antes esto eran trece hijos sueltos con el mismo peso, y como TODOS
            llevaban `flex-shrink: 0` menos el nombre, el único que cedía sitio
            era justo el dato que distingue una terminal de otra: el título se
            quedaba en «Adeorq: se…» mientras «Opus 5 xhigh» mantenía sus 90px
            enteros (Munir, 2026-08-10). Ahora ceden ZONAS, no elementos:
              · identidad, que CRECE y manda;
              · estado, que se encoge y suelta datos por orden;
              · acciones, que no ceden nunca.
            La ✕ se queda FUERA de las tres a propósito: es hija directa de la
            cabecera para que su `position: sticky` siga anclándola al borde
            cuando no cabe todo, y para que cerrar no se confunda con el resto. */}
        <div className="ph-id">
          <KindIcon kind={kind} exited={exited} />
          {/* La chapa de la cuadrilla. Seis terminales iguales no dicen que estén
              trabajando en lo mismo: esto sí, y con el color del equipo, que es
              el mismo en las seis y distinto del de la cuadrilla de al lado. */}
          {team && (
            <span
              className="pane-team"
              data-tip={`${team.rol} · puesto ${team.n} de ${team.de}\n${team.objetivo}`}
            >
              <span className="pane-team-n">
                {team.n}/{team.de}
              </span>
              {team.rol}
            </span>
          )}
          {account && (
            <span
              className="pane-account"
              data-tip={`Esta terminal usa tu cuenta «${account}», no la principal`}
            >
              {account}
            </span>
          )}
          <span
            className="pane-proj"
            style={{ ["--c" as string]: hueOf(project) }}
            data-tip={cwd}
          >
            {project}
          </span>
          {/* El título es el ancla de la cabecera, así que su globo carga con
              lo que el ancho no dejó enseñar: al estrecharse, el estado va
              soltando el esfuerzo, la memoria, el modelo… y todo eso sigue
              aquí, a un puntero de distancia. Antes solo salía el nombre
              largo, y cuando el nombre cabía entero no salía nada. */}
          {nombreEnEdicion != null && onRename ? (
            <input
              /* `nodrag` es para el lienzo: sin ella, React Flow toma el
                 mousedown de la caja (vive dentro de `.pane-head`, que es su
                 asa de arrastre) y seleccionar el texto movería el nodo. En la
                 Cabina no hay React Flow y la clase no hace nada. */
              className="pane-rename nodrag"
              value={nombreEnEdicion}
              autoFocus
              /* Con todo seleccionado: lo normal al renombrar es teclear el
                 nombre entero nuevo, no añadirle letras al viejo. */
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setNombreEnEdicion(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmarNombre();
                else if (e.key === "Escape") setNombreEnEdicion(null);
              }}
              onBlur={confirmarNombre}
            />
          ) : (
            <span
              className="pane-name"
              data-tip={resumen}
              onDoubleClick={onRename ? () => setNombreEnEdicion(label) : undefined}
            >
              {label}
            </span>
          )}
        </div>
        <div className="ph-meta">
          {/* Counted in the transcript: then the total is a fact and it stays on
              screen, dimmed, once they are back. Guessed off the screen: only
              while they are out, because a wrong number that lingers is worse
              than none. It looked broken because it only ever showed live ones
              and a session with no subagents has nothing to show. */}
          {(crew.live > 0 || (crew.exact && crew.total > 0)) && (
            <span
              className="pane-agents"
              data-live={crew.live > 0}
              data-tip={
                crew.live > 0
                  ? `${crew.live} ${crew.live === 1 ? "agente trabajando" : "agentes trabajando"} ahora dentro de esta sesión · ${crew.total} desplegados en total\n${
                      crew.exact
                        ? "Contados en el historial de la sesión: es el dato exacto."
                        : "Estimado por lo que se lee en pantalla."
                    }`
                  : `${crew.total} ${crew.total === 1 ? "agente desplegado" : "agentes desplegados"} en esta sesión, ninguno trabajando ahora.\nContados en el historial de la sesión: es el dato exacto.`
              }
            >
              <RobotIcon size={13} /> {crew.live > 0 ? crew.live : crew.total}
            </span>
          )}
          {ctx && ctx.percent > 0 && (
            <span
              className="pane-ctx"
              data-hot={ctx.percent >= 80}
              data-tip={`${t("Contexto")}: ${ctx.used.toLocaleString()} / ${ctx.window.toLocaleString()} tokens (${ctx.percent}% ${t("de contexto usado")})\nCada mensaje en esta sesión vuelve a pagar esos ${ctx.used.toLocaleString()} tokens.${
                ctx.percent >= 80
                  ? "\nA este nivel, compactar cuesta más que abrir una terminal nueva."
                  : ""
              }`}
            >
              <span className="ctx-bar" style={{ ["--p" as string]: `${ctx.percent}%` }} />
              {ctx.percent}%
            </span>
          )}
          {(ctx?.model || brain.model || brain.effort) && (
            <span
              className="pane-brain"
              data-tip={`Modelo: ${ctx?.model || brain.model || "?"}${brain.effort ? ` · esfuerzo ${brain.effort}` : ""}\nSe cambia dentro del pane con /model y /effort`}
            >
              {ctx?.model || brain.model}
              {brain.effort && <span className="pane-effort">{brain.effort}</span>}
            </span>
          )}
          {/* Lo que ocupa esta terminal. El Pulso de la barra ya decía el total
              de la app; este número contesta a la otra pregunta, la de tener
              varios agentes abiertos: cuál de ellos pesa. Va sin etiqueta («RAM»
              no cabe y tampoco hace falta: 480 MB en una cabecera solo puede ser
              memoria) y solo cuando hay algo que medir. */}
          {ram && ram.ramMb > 0 && (
            <span
              className="pane-ram"
              data-hot={ram.ramMb >= 1024}
              /* Con el desglose, y no por gusto: la cifra a secas se lee como «lo
                 que me cuesta Adeorq» cuando casi toda es el agente que corre
                 dentro, que pesa lo mismo se abra desde donde se abra. */
              data-tip={[
                `${bonito(ram.ramMb, lang)} ${t("de memoria")} · ${ram.procesos} ${
                  ram.procesos === 1 ? t("proceso") : t("procesos")
                }`,
                ram.agenteMb > 0
                  ? `${bonito(ram.agenteMb, lang)} ${t("los pone el agente de dentro, no Adeorq")}`
                  : "",
                t("Es el árbol entero de esta terminal, no solo su primer proceso."),
              ]
                .filter(Boolean)
                .join("\n")}
            >
              {bonito(ram.ramMb, lang)}
            </span>
          )}
          {/* The path used to sit here too, and in C:\proyectos it was the same
              text twice. The pill on the left already carries the whole path in
              its tooltip, so this said nothing the header did not. */}
        </div>
        <div className="ph-acts">
          {/* Shadow Mode Button */}
          <button
            className={`pane-btn pane-shadow-toggle ${shadowActive ? "is-active" : ""}`}
            data-tip={
              shadowActive
                ? `Modo Espejo (SVFS) activo · Rama: ${shadowSession?.shadowBranch}\n${shadowFiles.length} archivos propuestos. Clic para ver diffs.`
                : "Activar Modo Espejo (Shadow Git): aísla escrituras de la IA en una rama espejo"
            }
            onClick={handleToggleShadow}
          >
            <GitBranchIcon />
            {shadowActive && shadowFiles.length > 0 && (
              <span className="shadow-badge">{shadowFiles.length}</span>
            )}
          </button>
          <button
            className="pane-btn"
            data-tip={t(blurred ? "Mostrar esta terminal" : "Tapar esta terminal (para emitir)")}
            onClick={() => setBlurred((v) => !v)}
          >
            {blurred ? <EyeOffIcon /> : <EyeIcon />}
          </button>
          {/* Partir a la derecha y partir abajo estaban aquí y se han ido: dos
              botones permanentes para algo que se hace una vez al montar el
              tablero, y que siguen en el clic derecho y en Ctrl+Mayús+→/↓
              (Munir, 2026-08-02). El sitio lo ocupa minimizar, que sí se usa a
              todas horas. */}
          {onMinimizar && (
            <button
              className="pane-btn"
              data-tip={t("Minimizar: baja a la tira de abajo y sigue trabajando")}
              onClick={() => onMinimizar(id)}
            >
              <MinimizeIcon />
            </button>
          )}
          {/* Sacarla fuera. Solo aparece dentro de Adeorq: en una terminal que
              YA está suelta no hay a dónde sacarla, y por eso va colgado de su
              función y no de un `if` con el modo dentro. */}
          {onSacar && (
            <button
              className="pane-btn"
              data-tip={t("Sacar a su propia ventana: el agente sigue trabajando, solo cambia dónde lo ves")}
              onClick={() => onSacar(id)}
            >
              <SacarIcon />
            </button>
          )}
          {!suelta && (
            <button
              className="pane-btn"
              data-tip={maximized ? "Restaurar" : "Maximizar (Ctrl+Mayús+F)"}
              onClick={() => onToggleMax(id)}
            >
              {maximized ? <RestoreIcon /> : <MaximizeIcon />}
            </button>
          )}
          {/* Solo cuando se sabe QUÉ sesión enseña este panel: uno sin transcript
              detrás no tiene nada que tirar.
              Esto eran dos clics con cuatro segundos de margen, con el argumento
              de que un diálogo encima de una terminal en la que estás trabajando
              molesta más que un botón que espera. Munir pidió el diálogo
              (2026-08-08), y tiene razón: borrar una conversación es la única
              acción de este encabezado que no se puede deshacer, y las otras dos
              papeleras de la app ya preguntan así. Un botón armado no dice QUÉ se
              va a borrar ni adónde va; el diálogo sí, con el nombre dentro. */}
          {ctx?.sessionId && (
            <button
              className="pane-btn pane-bin"
              data-tip={t(
                "Borrar esta sesión: cierra la terminal y su conversación se va a la papelera de Windows",
              )}
              onClick={() => setBorrando(true)}
            >
              <TrashIcon />
            </button>
          )}
        </div>
        <button
          className="pane-close"
          data-suelta={suelta || undefined}
          data-tip={
            suelta
              ? t("Devolver a Adeorq: la terminal vuelve al mosaico y el agente ni se entera")
              : t("Cerrar terminal")
          }
          onClick={() => onClose(id)}
        >
          {suelta ? <DevolverIcon size={15} /> : <CloseIcon />}
        </button>
      </header>
      {(needsLogin || ask || note || avisoCtx > 0 || colgado) && (
        <div className="pane-overlays">
          {colgado && (
            <div className="pane-alert">
              <span>
                {colgado === "mudo"
                  ? t(
                      "Adeorq ha perdido la salida de esta terminal: el agente sigue vivo, pero se bloqueará en cuanto escriba y ya no verás nada de lo que haga. Es un fallo nuestro y queda anotado en el rastro. El botón lo mata y vuelve a abrirla.",
                    )
                  : reanimarLimpio
                    ? t(
                        "Este agente lleva 3 minutos sin dar señales: está colgado, y esta sesión pesa demasiado para recuperarla — revivirla la volvería a colgar. El botón abre una terminal limpia en su lugar.",
                      )
                    : t(
                        "Este agente lleva 3 minutos sin dar señales en mitad de un turno: está colgado (fallo del CLI de Claude, no tuyo). Reanimar lo mata y retoma esta misma conversación sin perder nada.",
                      )}
              </span>
              {onRevivir && (
                <button className="alert-btn" onClick={reanimar}>
                  ⚡ {reanimarLimpio ? t("Empezar limpia") : t("Reanimar")}
                </button>
              )}
              <button className="pane-close" data-tip={t("Ocultar aviso")} onClick={() => setColgado(null)}>
                ×
              </button>
            </div>
          )}
          {avisoCtx > 0 && ctx && (
            <div className="pane-ctx-warn" data-grave={avisoCtx === 2}>
              {/* Dos renglones, no un párrafo. Esto es una franja que se come
                  el alto de la terminal mientras esté puesta, así que dice el
                  dato y qué hacer; el porqué largo vive en el globo de la
                  píldora del contexto, que está siempre a mano. Y pasa por
                  `t()`: estaba escrito en duro y salía en español con la app
                  puesta en inglés. */}
              <span>
                {avisoCtx === 2
                  ? t("{pct} % de contexto ({n} tokens). Compactar ahora sale peor que empezar: abre una terminal nueva.", {
                      pct: ctx.percent,
                      n: ctx.used.toLocaleString(lang === "en" ? "en-GB" : "es-ES"),
                    })
                  : t("{pct} % de contexto ({n} tokens). Cada mensaje vuelve a pagarlos enteros, así que irá más lenta y más cara.", {
                      pct: ctx.percent,
                      n: ctx.used.toLocaleString(lang === "en" ? "en-GB" : "es-ES"),
                    })}
              </span>
              <button
                className="pane-close"
                data-tip={t("Ocultar aviso (vuelve si la sesión sigue creciendo)")}
                onClick={() => setCtxVisto(avisoCtx)}
              >
                ×
              </button>
            </div>
          )}
          {needsLogin && (
            <div className="pane-alert">
              <span>{t("Claude necesita reconectar tu cuenta (el acceso caducó).")}</span>
              <button
                className="alert-btn"
                onClick={() => {
                  void writePty(id, "/login\r").catch(() => {});
                  setNeedsLogin(false);
                }}
              >
                {t("Reconectar (abre el navegador)")}
              </button>
              <button
                className="pane-close"
                data-tip={t("Ocultar aviso")}
                onClick={() => setNeedsLogin(false)}
              >
                ×
              </button>
            </div>
          )}
          {ask && (
            <div className="pane-ask">
              <span className="ask-hint">{t(ask.hint)}</span>
              <span className="ask-btns">
                {ask.options.map((o) => (
                  <button
                    key={o.n}
                    className="ask-btn"
                    data-tip={t("Responder {n} en la terminal", { n: o.n })}
                    onClick={() => answerAsk(o.n, ask.enter || o.n === "y" || o.n === "n")}
                  >
                    {o.n} · {o.propio ? t(o.label) : o.label}
                  </button>
                ))}
              </span>
              <button
                className="pane-close"
                data-tip={t("Ocultar (puedes responder con el teclado: 1, 2 o 3)")}
                onClick={() => setAsk(null)}
              >
                ×
              </button>
            </div>
          )}
          {note && <div className="pane-note">{t(note)}</div>}
        </div>
      )}
      <div className="pane-term" ref={holder} style={{ display: showDiff ? "none" : (blurred ? "none" : "block") }} />
      {showDiff && (
        <div className="pane-diff-panel">
          <div className="diff-panel-header">
            <div className="diff-panel-title">
              <GitBranchIcon size={16} />
              <span>Propuestas en la sombra (Shadow Branch)</span>
            </div>
            <div className="diff-panel-actions">
              <button
                className="diff-btn diff-btn-accept"
                data-tip="Confirmar y aplicar cambios en disco real (merge squash)"
                onClick={handleAcceptShadow}
              >
                <CheckIcon size={15} />
                <span>Aceptar</span>
              </button>
              <button
                className="diff-btn diff-btn-discard"
                data-tip="Descartar propuestas y limpiar rama temporal"
                onClick={handleDiscardShadow}
              >
                <TrashIcon size={15} />
                <span>Descartar</span>
              </button>
              <button
                className="diff-btn diff-btn-close"
                data-tip="Volver a la consola (mantiene los cambios)"
                onClick={() => setShowDiff(false)}
              >
                <CloseIcon size={15} />
              </button>
            </div>
          </div>
          
          <div className="diff-panel-body">
            {shadowFiles.length === 0 ? (
              <div className="diff-empty-state">
                <span>{t("No hay cambios propuestos en esta rama todavía.")}</span>
                <p>{t("Las modificaciones que haga la IA se verán aquí en tiempo real.")}</p>
              </div>
            ) : (
              <>
                <div className="diff-files-sidebar">
                  <div className="diff-sidebar-title">Archivos modificados ({shadowFiles.length})</div>
                  <div className="diff-files-list">
                    {shadowFiles.map((file) => (
                      <div
                        key={file.path}
                        className={`diff-file-item ${selectedFile === file.path ? "is-selected" : ""}`}
                        onClick={() => setSelectedFile(file.path)}
                      >
                        <span className={`file-status-badge status-${file.status.toLowerCase()}`}>
                          {file.status}
                        </span>
                        <span className="file-item-path" title={file.path}>
                          {file.path.split("/").pop()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="diff-viewer-content">
                  {renderDiffLines(fileDiffText)}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* El diálogo de borrar, con las mismas clases que el de la barra: es la
          misma pregunta y tiene que verse igual la haga quien la haga.
          A `document.body` y no aquí donde cae, como el del Capataz: esto tapa
          y desenfoca la app ENTERA, y un `position: fixed` deja de mirar a la
          ventana en cuanto un ancestro tiene un filtro o una transformación,
          que es exactamente lo que tiene el panel de una terminal. */}
      {borrando &&
        ctx?.sessionId &&
        createPortal(
          <div className="modal-overlay" {...propsDeVelo(bajoEnVelo, () => setBorrando(false))}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">{t("Borrar la sesión")}</h3>
              <p className="modal-text">
                {t(
                  "«{n}» se va a la papelera de Windows. Desaparece de Adeorq y también de Claude Code, así que ya no podrás retomarla. Si te arrepientes, está en la papelera.",
                  { n: name },
                )}
              </p>
              {/* El aviso que la barra solo enseña a veces aquí sale SIEMPRE: si
                  estás leyendo esto desde el encabezado de una terminal, esa
                  terminal está abierta por definición. */}
              <div className="modal-warn">
                <p className="modal-warn-title">⚠ {t("Esta sesión está abierta ahora mismo.")}</p>
                <p className="modal-warn-note">
                  {t("Se cierra esta terminal y su conversación deja de estar en disco.")}
                </p>
              </div>
              <div className="modal-actions">
                <button className="mini modal-cancel" onClick={() => setBorrando(false)}>
                  {t("Cancelar")}
                </button>
                <button
                  className="np-btn modal-danger"
                  onClick={() => {
                    setBorrando(false);
                    deleteSession(ctx.folder, ctx.sessionId)
                      .then(() => onClose(id))
                      .catch((e) => setNote(`No he podido borrarla: ${e}`));
                  }}
                >
                  {t("Borrar")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
