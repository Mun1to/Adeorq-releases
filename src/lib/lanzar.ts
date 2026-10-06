// Con qué comando nace cada terminal: el de un Claude, el de otro CLI, el de
// retomar una sesión y el de descargar un cliente.
//
// Vivía en App.tsx, encima del componente. Es la capa de encima de
// `lib/comandos.ts` (que solo sabe envolver una línea en la shell del sistema)
// y la de debajo de `lib/arranque.ts` (que decide el plan y es pura): aquí está
// la mitad que no se puede probar sin la app, porque necesita el modo guardado
// en `localStorage`, el esfuerzo leído de los ajustes del CLI y un id de sesión
// nuevo.

import { cliEffort, transcriptExists } from "./pty";
import { powershellCommand, sessionIdOf, shellCommand } from "./comandos";
import { kindDeComando } from "../components/KindIcon";
import { lineaDeArranque, lineaDeRetomar, type Provider } from "./providers";
import { planDeArranque, type Peticion, type Plan } from "./arranque";

/** Con qué modo nace cada Claude nuevo, hasta que se cambie a mano con Mayús+Tab. */
export const PERMISSION_MODE_KEY = "adeorq-permission-mode";

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
export function modoGuardado(): PermissionMode {
  const v = localStorage.getItem(PERMISSION_MODE_KEY);
  return PERMISSION_MODES.find((m) => m === v) ?? DEFAULT_PERMISSION_MODE;
}

// claudeCommand lives outside the App component, next to every other function
// that spawns a Claude, so a mode chosen from a single opener (the wizard's
// "modo plan", for instance) can override it without touching the rest. When
// nobody overrides it, it reads Ajustes' setting straight from localStorage:
// there is no React state to hand it here, and localStorage is the one store
// both sides can already see. Shift+Tab inside a pane still cycles the mode
// for that one session, same as always.
export function claudeCommand(args = "", mode?: PermissionMode, conTexto = false): string[] {
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
export async function loadEffort(): Promise<void> {
  if (defaultEffort !== null) return;
  defaultEffort = await cliEffort(null).catch(() => null);
}

/** Adds --effort unless the caller already chose one. */
export function withEffort(args: string): string {
  if (!defaultEffort || /--effort\b/.test(args)) return args;
  return `${args} --effort ${defaultEffort}`;
}

/** A fresh Claude, tagged with an id we choose so it can be resumed later. */
export function newClaudeCommand(extra = "", mode?: PermissionMode, conTexto = false): string[] {
  return claudeCommand(
    withEffort(`--session-id ${crypto.randomUUID()}${extra ? ` ${extra}` : ""}`),
    mode,
    conTexto,
  );
}

/** Turns a pane's command into the one that brings its conversation back. */
export async function resumeCommandFor<P extends { command?: string[]; cwd: string }>(
  pane: P,
): Promise<string[] | undefined> {
  const joined = pane.command?.join(" ") ?? "";
  const id = sessionIdOf(joined);
  if (!id) return pane.command;
  // Una sesión de Codex o de Gemini vuelve con su propia línea de retomar.
  const kind = kindDeComando(joined);
  if (kind !== "claude") {
    const ajena = lineaDeRetomar(kind, id);
    return ajena ? shellCommand(ajena) : pane.command;
  }
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
export const providerInner = lineaDeArranque;

/** Abrirlo sin nada dentro: ni encargo, ni modelo, ni modo. Es el caso de
 *  todos los días (el botón de la barra, un atajo de proyecto). */
export function providerCommand(provider: string): string[] {
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
export function comandoDe(p: Peticion): string[] | undefined {
  return comandoDelPlan(planDeArranque(p));
}

/** La misma traducción, cuando quien llama ya tiene el plan en la mano y
 *  necesita mirarlo (para copiar el encargo, o para saber en qué se abre). */
export function comandoDelPlan(plan: Plan): string[] | undefined {
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
export function installCommand(p: Provider, listo: string): string[] {
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
  // Sin encargo va por cmd, que es el envoltorio ligero, pero la ruta NO puede
  // ir entre comillas: `portable-pty` cita cada argumento al estilo MSVC y
  // convierte cada `"` interna en `\"` (`append_quoted`, en su `cmdbuilder.rs`).
  // cmd.exe no entiende esa barra, así que recibe literalmente
  // `"\"C:\...\agy.exe\""` y contesta «no se reconoce como un comando». Por eso
  // se mete su carpeta en el PATH de esa terminal y se le llama por su nombre:
  // `path` se traga el resto de la línea hasta el `&&`, así que aguanta rutas
  // con espacios sin necesitar ni una comilla.
  const dir = exe.replace(/[\\/][^\\/]*$/, "");
  return shellCommand(`path ${dir};%path% && agy --mode accept-edits`);
}
