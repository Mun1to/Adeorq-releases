// Las reglas que leen la PANTALLA de una terminal: cuándo el programa de dentro
// te está preguntando algo y cuándo pide iniciar sesión. Y, con ellas, qué
// estado tiene un panel y POR QUÉ.
//
// Vivían dentro de `TerminalPane.tsx`, entre tres mil líneas, y lo que decidía
// el estado de un panel se tiraba nada más decidirlo: cuando la detección
// fallaba («dice que me espera y no me espera») no había forma de saber qué
// regla había saltado, y averiguarlo era una tarde leyendo el componente. Ahora
// son una tabla que se lee de un vistazo y cada estado viaja con su porqué
// (`PaneStatus.porque`), que lee cualquier agente con `get_active_panes`: se le
// pregunta «¿por qué dices que esa terminal me espera?» y lo sabe contestar. Va
// en español y sin pasar por `t()` porque ese es su único lector, y el MCP
// entero habla español; si un día se enseña en la interfaz, se traduce allí.
//
// Son frágiles por naturaleza: el día que Claude Code cambie el texto de su
// pantalla de permisos, la primera regla deja de casar. Tenerlas aquí, juntas y
// con su banco (`scripts/reglas-pantalla-check.ts`), es lo que hace que ese
// arreglo sea de una línea. Las de «terminó» o «trabajando» NO están aquí: esas
// no salen de la pantalla, salen del transcript (`last_message_state`, en Rust).

import type { WorkState } from "./pty";

// The CLI's TUI dialogs are cryptic for someone who doesn't live in a
// terminal. Detect them in the stream and surface real buttons instead:
// the number key is written back to the PTY exactly as a keypress would be.
export interface AskOption {
  n: string;
  label: string;
  // Sin marcar: el rótulo salió de la PANTALLA de la terminal (lo que dijo el
  // CLI, que habla en su propio idioma y no se toca). Marcado: lo escribió
  // Adeorq mismo (el "[y/N]" sin texto no trae opciones que leer), así que sí
  // pasa por t().
  propio?: boolean;
}

export interface Ask {
  hint: string;
  options: AskOption[];
  /** Menus footed "Enter to confirm" need the digit followed by Enter. */
  enter: boolean;
  /** El texto de la regla que saltó, para poder decir por qué. */
  regla: string;
}

export interface ReglaDePregunta {
  /** Lo que tiene que haber en pantalla, tal cual. */
  test: string;
  /** Lo que se le explica a quien mira, encima de las opciones. */
  hint: string;
  enter?: boolean;
}

export const PREGUNTAS: ReglaDePregunta[] = [
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

/** Lo que escribe un CLI cuando se ha quedado sin sesión, y cuando la recupera. */
export const PIDE_LOGIN = ["Re-authenticate to continue", "OAuth access token has expired"];
export const LOGIN_HECHO = "Login successful";

/** Hasta cuántas líneas por encima del final puede estar la pregunta. Más
    arriba es historia: una pregunta ya contestada que sigue en pantalla. */
const LINEAS_VIVAS = 12;

// Parses the VISIBLE screen text (from xterm's buffer): if the dialog shows
// on screen the bar arms; the moment the CLI erases it, the bar drops. No
// stream heuristics: the screen is the single source of truth.
export function parseAsk(screen: string, reglas: ReglaDePregunta[] = PREGUNTAS): Ask | null {
  for (const t of reglas) {
    const i = screen.lastIndexOf(t.test);
    if (i < 0) continue;
    const seg = screen.slice(i);
    // Ignore historical output where the trigger test occurred more than 12 lines ago:
    if (seg.split("\n").length > LINEAS_VIVAS) continue;

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
      return { hint: t.hint, options: opts.slice(0, 4), enter: t.enter ?? false, regla: t.test };
    }
  }
  return null;
}

/** Qué le pasa a la sesión según lo que acaba de salir por la terminal:
 *  `true` pide iniciar sesión, `false` ya la tiene, `null` no dice nada. */
export function loginSegun(datos: string): boolean | null {
  if (PIDE_LOGIN.some((p) => datos.includes(p))) return true;
  if (datos.includes(LOGIN_HECHO)) return false;
  return null;
}

/** De dónde sale cada estado que dice el transcript, en palabras. */
const DEL_TRANSCRIPT: Record<Exclude<WorkState, "">, string> = {
  pregunta: "su último mensaje es una pregunta con opciones (AskUserQuestion)",
  ofrece: "su último mensaje acaba en una pregunta",
  lista: "su último mensaje es texto y no acaba en pregunta",
  a_medias: "lo último es una herramienta o su resultado, o sea que sigue trabajando",
  tuya: "lo último es un mensaje tuyo sin contestar",
};

/**
 * El estado de un panel y por qué. El orden importa y es una decisión:
 *   1. Si el proceso murió, murió.
 *   2. Si hay un menú en pantalla o pide login, te espera A TI. Va ANTES del
 *      transcript porque el menú es de ahora mismo y el transcript es de hace un
 *      momento.
 *   3. Si no, manda el transcript, que es quien sabe distinguir una pregunta en
 *      prosa («ofrece») de un trabajo entregado («lista»). La campana del
 *      terminal no las distingue: suena igual en las dos.
 *   4. Si nada de eso se puede leer, se queda en «» = desconocido, que no
 *      avisa de nada y que la reja del Capataz no toca.
 */
export function estadoDelPanel(m: {
  exited: boolean;
  ask: Ask | null;
  needsLogin: boolean;
  transcript: WorkState | undefined;
}): { state: WorkState; porque: string } {
  if (m.exited) return { state: "", porque: "el proceso de la terminal terminó" };
  if (m.ask) return { state: "pregunta", porque: `hay un menú en pantalla: casa la regla «${m.ask.regla}»` };
  if (m.needsLogin) return { state: "pregunta", porque: `la terminal pide iniciar sesión («${PIDE_LOGIN.join("» o «")}»)` };
  const state = m.transcript ?? "";
  if (state === "") return { state, porque: "ni la pantalla ni el transcript dicen nada (una terminal sin agente, o recién abierta)" };
  return { state, porque: `lo dice el transcript: ${DEL_TRANSCRIPT[state]}` };
}
