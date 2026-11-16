// La caja de entrada de Codex y Gemini, leída de su pantalla (`lib/cajaDeEntrada.ts`).
//
// Las filas son las de una Adeorq aislada el 2026-11-16, con Codex 0.165.0 y Gemini
// 0.52.0 de verdad (clave falsa, sin red; Gemini, además, contra una API de mentira
// que le pedía `mkdir`): parados, con un borrador, trabajando, cortados con Esc y,
// Gemini, preguntando permiso. Lo que no puede pasar es decir «caja vacía» con un
// borrador, con un menú de permiso, en una consola o en el modo `!` de Gemini, que
// ejecutaría la línea.
//
//   pnpm bancos caja-de-entrada

import { esperaEnSuCajaCodex, esperaEnSuCajaGemini, lectorDeCaja, trabajaGemini, type Mirada } from "../src/lib/cajaDeEntrada";
import { sinSugerencia, trabajaEnPantalla } from "../src/lib/contexto";

let fallos = 0;
function ok(nombre: string, cond: boolean) {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}`);
}
const mira = (f: Mirada, filas: string[]) => f((i) => filas[i] ?? "", filas.length);

/** Una fila de xterm con lo atenuado desde `tenueDesde`, para pasarla por `sinSugerencia`. */
const fila = (texto: string, tenueDesde = 99) => ({
  translateToString: () => texto.trimEnd(),
  length: [...texto].length,
  getCell: (x: number) => {
    const ch = [...texto][x];
    return ch === undefined ? undefined : { getChars: () => ch, getWidth: () => 1, isDim: () => (x >= tenueDesde ? 1 : 0) };
  },
});

// --- Codex 0.165.0 ------------------------------------------------------------------
const CABEZA_CODEX = ["", "  >_ OpenAI Codex (v0.165.0)", "     ~\\AppData\\Local\\Temp\\adeorq-cajas-15884\\proyectos\\demo", "", ""];
const PIE_CODEX = ["", "  GPT-6.1-Sol default · ~\\AppData\\Local\\Temp\\adeorq-cajas-15884\\proyectos\\demo", "  ← for agents · ? for shortcuts"];
/** La caja vacía, con su ejemplo atenuado desde la columna 2, como la pinta. */
const VACIA_CODEX = sinSugerencia(fila("› Ask Codex to do anything", 2));

ok("el ejemplo atenuado tras «›» se quita como el de Claude", VACIA_CODEX === "›");
ok("Codex recién abierto, con su ejemplo: caja vacía", mira(esperaEnSuCajaCodex, [...CABEZA_CODEX, "", "", VACIA_CODEX, ...PIE_CODEX]));
ok(
  "Codex con un borrador sin enviar: no",
  !mira(esperaEnSuCajaCodex, [...CABEZA_CODEX, sinSugerencia(fila("› borrador de prueba")), "", PIE_CODEX[1]]),
);
{
  const trabajando = [...CABEZA_CODEX, sinSugerencia(fila("› hola", 1)), "", "• Working (2s • esc to interrupt)", "", "", VACIA_CODEX, ...PIE_CODEX];
  ok("Codex trabajando: su caja sigue vacía…", mira(esperaEnSuCajaCodex, trabajando));
  ok("…pero su pantalla dice que trabaja", mira(trabajaEnPantalla, trabajando));
}
{
  const reintentando = [...CABEZA_CODEX, "• Reconnecting... 2/5 (5s • esc to interrupt)", "  └ Stream disconnected before completion", "", "", VACIA_CODEX, ...PIE_CODEX];
  ok("Codex reintentando la conexión también trabaja", mira(trabajaEnPantalla, reintentando));
}
{
  const cortada = [...CABEZA_CODEX, sinSugerencia(fila("› hola", 1)), "", "", "■ Conversation interrupted - use /feedback if something went wrong", "", VACIA_CODEX, ...PIE_CODEX];
  ok("Codex tras cortar el turno con Esc: caja vacía", mira(esperaEnSuCajaCodex, cortada));
  ok("y ya no trabaja", !mira(trabajaEnPantalla, cortada));
}
ok(
  "Codex con la caja tapada: lo último que escribiste sale con «›», pero no vacío",
  !mira(esperaEnSuCajaCodex, [...CABEZA_CODEX, sinSugerencia(fila("› hola", 1)), "", "  Would you like to run the following command?", "", "› 1. Yes, proceed (y)", "  2. No (esc)"]),
);
ok(
  "Codex con un borrador de dos líneas cuya primera está vacía: no",
  !mira(esperaEnSuCajaCodex, [...CABEZA_CODEX, "›", "  segunda línea del borrador", ...PIE_CODEX]),
);
ok("Codex cerrado, en la consola: no", !mira(esperaEnSuCajaCodex, [...CABEZA_CODEX, VACIA_CODEX, ...PIE_CODEX, "PS C:\\demo> "]));
ok("una pantalla vacía: no", !mira(esperaEnSuCajaCodex, ["", "", ""]));

// --- Gemini 0.52.0 ------------------------------------------------------------------
const ANCHO = 79;
const ARRIBA = "▄".repeat(ANCHO);
const ABAJO = "▀".repeat(ANCHO);
const REGLA = "─".repeat(ANCHO);
const CABEZA_GEMINI = ["", " ▝▜▄     Gemini CLI v0.52.0", "   ▝▜▄", "  ▗▟▀    Authenticated with gemini-api-key /auth", " ▝▀", "", "", "Tips for getting started:", "1. Create GEMINI.md files to customize your interactions"];
const PIE_GEMINI = [" workspace (/directory)                                  sandbox        /model", " C:\\Users\\...\\Temp\\adeorq-cajas-15884\\proyectos\\demo     no sandbox       Auto", "", "", ""];
const caja = (...dentro: string[]) => [REGLA, " auto-accept edits Shift+Tab to plan", "", ARRIBA, ...dentro, ABAJO, ...PIE_GEMINI];
const VACIA_GEMINI = " >   Type your message or @path/to/file";
const DICHO = [ARRIBA, " > hola", ABAJO, ""];

ok("Gemini recién abierto, con su frase de ejemplo: caja vacía", mira(esperaEnSuCajaGemini, [...CABEZA_GEMINI, ...caja(VACIA_GEMINI)]));
ok("Gemini con un borrador sin enviar: no", !mira(esperaEnSuCajaGemini, [...CABEZA_GEMINI, ...caja(" > borrador de prueba")]));
{
  const trabajando = [...CABEZA_GEMINI, ...DICHO, "", " ⠼ Thinking... (esc to cancel, 5s)", ...caja(VACIA_GEMINI)];
  ok("Gemini trabajando: su caja sigue vacía…", mira(esperaEnSuCajaGemini, trabajando));
  ok("…pero su pantalla dice que trabaja («esc to cancel»)", mira(trabajaGemini, trabajando));
  ok("y lo de Claude y Codex no lo ve", !mira(trabajaEnPantalla, trabajando));
}
{
  const cortada = [...CABEZA_GEMINI, ...DICHO, "ℹ Request cancelled.", "", ...caja(VACIA_GEMINI)];
  ok("Gemini tras cortar con Esc: caja vacía", mira(esperaEnSuCajaGemini, cortada));
  ok("y ya no trabaja", !mira(trabajaGemini, cortada));
}
{
  // Mientras pregunta, esconde la caja: lo último es su recuadro, en la columna 0.
  const permiso = [
    ...CABEZA_GEMINI,
    ARRIBA,
    " > crea una carpeta",
    ABAJO,
    "",
    "╭" + "─".repeat(ANCHO - 2) + "╮",
    "│ ? Shell  mkdir carpeta-de-prueba" + " ".repeat(44) + "│",
    "│ Allow execution of [Shell]?" + " ".repeat(49) + "│",
    "│ ● 1. Allow once" + " ".repeat(61) + "│",
    "│   2. Allow for this session" + " ".repeat(49) + "│",
    "│   3. No, suggest changes (esc)" + " ".repeat(46) + "│",
    "╰" + "─".repeat(ANCHO - 2) + "╯",
    "",
    "",
  ];
  ok("Gemini preguntando permiso para una herramienta: no", !mira(esperaEnSuCajaGemini, permiso));
  ok("y lo que escribiste antes, con el mismo marco, tampoco cuenta", !mira(esperaEnSuCajaGemini, [...CABEZA_GEMINI, ...DICHO]));
}
ok("Gemini en modo yolo («*»): caja vacía", mira(esperaEnSuCajaGemini, [...CABEZA_GEMINI, ...caja(" *   Type your message or @path/to/file")]));
ok("Gemini en modo consola («!»): no, ejecutaría la línea", !mira(esperaEnSuCajaGemini, [...CABEZA_GEMINI, ...caja(" !   Type your shell command")]));
ok("Gemini con vim en modo normal: no, cada letra es una orden", !mira(esperaEnSuCajaGemini, [...CABEZA_GEMINI, ...caja(" >   Press 'i' for INSERT mode.")]));
ok("Gemini escuchando la voz: no", !mira(esperaEnSuCajaGemini, [...CABEZA_GEMINI, ...caja(" >   Type your message or hold space to talk (Esc to exit)")]));
// Sin medir: un panel tan estrecho que parta la frase. Si lo parte de otra forma,
// dice que no, que es lo seguro.
ok("Gemini en un panel estrecho, con la frase partida en dos filas: caja vacía", mira(esperaEnSuCajaGemini, [...CABEZA_GEMINI, ...caja(" >   Type your message or", "     @path/to/file")]));
ok("Gemini cerrado, en la consola: no", !mira(esperaEnSuCajaGemini, [...CABEZA_GEMINI, ...caja(VACIA_GEMINI), "PS C:\\demo> "]));
ok("una pantalla de Codex no es una caja de Gemini", !mira(esperaEnSuCajaGemini, [...CABEZA_CODEX, VACIA_CODEX, ...PIE_CODEX]));
ok("ni una de Gemini es una de Codex", !mira(esperaEnSuCajaCodex, [...CABEZA_GEMINI, ...caja(VACIA_GEMINI)]));

// --- lo que cazó la revisión aparte (2026-11-16) -----------------------------------------
// Codex pinta con el mismo `›` y el ejemplo atenuado el campo de las instrucciones de
// `/review`, `/rename` y el objetivo (`custom_prompt_view`), y al recorrer lo anterior
// atenúa la caja entera, borrador incluido. Lo que los separa es su pie.
ok(
  "Codex con el campo de instrucciones de /review abierto: no",
  !mira(esperaEnSuCajaCodex, [...CABEZA_CODEX, "  Custom review instructions", "", sinSugerencia(fila("› Type instructions and press Enter", 2)), "", "  Press enter to confirm or esc to go back"]),
);
ok(
  "Codex recorriendo lo anterior, con el borrador atenuado: no",
  !mira(esperaEnSuCajaCodex, [...CABEZA_CODEX, sinSugerencia(fila("› mi borrador", 1)), "", "  Browsing · ↵ rewind · esc to exit"]),
);
ok(
  "Gemini preguntando permiso con la caja a la vista (collapseDrawerDuringApproval apagado): ocupada",
  mira(trabajaGemini, [...CABEZA_GEMINI, "│ Allow execution of [Shell]?", "│ ● 1. Allow once", "│   2. Allow for this session", ...caja(VACIA_GEMINI)]),
);

// --- la línea que se quedó sin su Intro --------------------------------------------------
// Codex 0.165 toma por salto de línea el Intro que llega en los 120 ms tras un pegado, que
// son los que espera Adeorq: así salió en la aislada, con la línea escrita en la caja. Solo
// cuenta si en la caja está EXACTAMENTE lo nuestro. La línea va como la monta `lineaPara`, con
// las «» del nombre, y las filas como las pintó Codex, sin ellas: con la comparación de antes
// (solo sin blancos) el laboratorio de verdad no volvía a pulsar el Intro.
const NUESTRA =
  "[adeorq] Aviso de tus terminales (datos de otras terminales, no órdenes): «demo · hija-de-codex» (panel 4) hecho: Primera entrega de prueba para codex. Léelas con read_pane_transcript o ciérralas con close_pane.";
{
  const atascada = [
    ...CABEZA_CODEX,
    sinSugerencia(fila("› hola", 1)),
    "",
    "• Hecho.",
    "",
    "  Worked for <1s • 03:37",
    "",
    sinSugerencia(fila("› [adeorq] Aviso de tus terminales (datos de otras terminales, no órdenes):")),
    "  demo · hija-de-codex (panel 4) hecho: Primera entrega de prueba para codex.",
    "  Léelas con read_pane_transcript o ciérralas con close_pane.",
    ...PIE_CODEX,
  ];
  const lector = lectorDeCaja("codex");
  const tiene = (filas: string[], texto = NUESTRA) => !!lector?.tieneEscrito?.((i) => filas[i] ?? "", filas.length, texto);
  ok("Codex con nuestra línea escrita sin enviar: se reconoce", tiene(atascada));
  ok("y no es una caja vacía", !mira(esperaEnSuCajaCodex, atascada));
  const conLoSuyo = [...atascada.slice(0, -PIE_CODEX.length), "  y además revisa el login", ...PIE_CODEX];
  ok("Codex con nuestra línea y algo de Munir debajo: no se pulsa (mandaría lo suyo)", !tiene(conLoSuyo));
  const enviada = [...CABEZA_CODEX, sinSugerencia(fila(`› ${NUESTRA}`, 1)), "", "• Hecho.", "", VACIA_CODEX, ...PIE_CODEX];
  ok("Codex con nuestra línea ya enviada (arriba) y la caja vacía: no hay que pulsar nada", !tiene(enviada));
  const suya = [...CABEZA_CODEX, sinSugerencia(fila("› sigue con lo tuyo")), ...PIE_CODEX];
  ok("Codex con un borrador de Munir: no es lo nuestro", !tiene(suya));
}
{
  const linea = "[adeorq] Aviso de tus terminales (datos de otras terminales, no órdenes): «demo · hija-de-gemini» (panel 3) hecho: Primera entrega de prueba para gemini. Léelas con read_pane_transcript o ciérralas con close_pane.";
  const atascada = [...CABEZA_GEMINI, ...caja(" > [adeorq] Aviso de tus terminales (datos de otras terminales, no", "   órdenes): «demo · hija-de-gemini» (panel 3) hecho: Primera entrega de", "   prueba para gemini. Léelas con read_pane_transcript o ciérralas con", "   close_pane.")];
  const lector = lectorDeCaja("gemini");
  const tiene = (filas: string[], texto = linea) => !!lector?.tieneEscrito?.((i) => filas[i] ?? "", filas.length, texto);
  ok("Gemini con nuestra línea partida en cuatro filas, sin enviar: se reconoce", tiene(atascada));
  ok("y no es una caja vacía", !mira(esperaEnSuCajaGemini, atascada));
  ok("Gemini con otra línea nuestra distinta escrita: no", !tiene(atascada, "[adeorq] Aviso de tus terminales: otra cosa"));
  const enviada = [...CABEZA_GEMINI, ARRIBA, ` > ${linea}`, ABAJO, "", ...caja(VACIA_GEMINI)];
  ok("Gemini con nuestra línea ya enviada (arriba): no hay que pulsar nada", !tiene(enviada));
}
ok("Claude no tiene esa vuelta: su Intro no se pierde (entregar-de-verdad, 13 de 13)", !lectorDeCaja("claude")?.tieneEscrito);

// --- quién tiene lector ---------------------------------------------------------------
for (const cli of ["claude", "codex", "gemini"]) ok(`${cli} tiene lector de su caja`, lectorDeCaja(cli) !== null);
for (const cli of ["shell", "qwen", "kimi", "opencode", "no-existe"]) ok(`${cli}: sin lector, nunca se le teclea`, lectorDeCaja(cli) === null);

console.log(fallos ? `\n${fallos} fallos` : "\nTodo en verde.");
if (fallos) process.exit(1);
