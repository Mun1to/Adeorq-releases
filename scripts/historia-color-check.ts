// La pantalla de una terminal con sus colores, como la lee el móvil
// (`historiaConColor` en src/lib/terminales.ts). Con un xterm de verdad, sin
// navegador: el verde del tema, la negrita, lo tenue, un color de 24 bits y
// uno de los 256, una línea que xterm partió por el ancho vuelta a juntar, y
// sin espacio sobrante a la derecha ni líneas vacías al final.
//
//   pnpm bancos historia-color

import "./xterm-en-node";
import { Terminal } from "@xterm/xterm";
import { historiaConColor, pantallaDe, registrarTerminal } from "../src/lib/terminales";

let fallos = 0;
const rojos: string[] = [];
function es(nombre: string, obtenido: unknown, esperado: unknown) {
  const bien = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!bien) {
    fallos++;
    rojos.push(nombre);
  }
  console.log(`${bien ? "ok  " : "FALLA"} ${nombre}${bien ? "" : ` — sale ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`}`);
}

const escribir = (term: Terminal, texto: string) => new Promise<void>((r) => term.write(texto, () => r()));

async function probar() {
  const term = new Terminal({ cols: 30, rows: 12, allowProposedApi: true, theme: { green: "#4eba65", foreground: "#ffffff" } });
  registrarTerminal(1, term);
  await escribir(term, [
    "\x1b[32m●\x1b[0m \x1b[1mRead\x1b[0m(src)   ",
    "  \x1b[2m⎿  120 líneas\x1b[0m",
    "\x1b[38;2;255;193;7m· Gallivanting\x1b[0m",
    "\x1b[38;5;196mrojo\x1b[0m y normal",
    "una línea muy larga que no cabe en treinta columnas y sigue",
    "",
    "",
  ].join("\r\n"));

  const h = historiaConColor(1, 400);
  es("hay terminal", h !== null, true);
  const t = h?.trozos ?? [];
  es("cinco líneas: las vacías del final, fuera", t.length, 5);
  es("el ● en el verde del tema y el nombre en negrita", t[0], [["●", "#4eba65", 0], [" ", "", 0], ["Read", "", 1], ["(src)", "", 0]]);
  es("lo de debajo, tenue", t[1], [["  ", "", 0], ["⎿  120 líneas", "", 2]]);
  es("un color de 24 bits, tal cual", t[2], [["· Gallivanting", "#ffc107", 0]]);
  es("uno de los 256, a su #rrggbb", t[3]?.[0], ["rojo", "#ff0000", 0]);
  es("la línea que xterm partió, entera otra vez", t[4]?.map((x) => x[0]).join(""), "una línea muy larga que no cabe en treinta columnas y sigue");
  es("en la pantalla normal no es la alterna", h?.alterna, false);

  await escribir(term, "\x1b[?1049h\x1b[Hpantalla completa");
  const alt = historiaConColor(1, 400);
  es("en la pantalla alternativa lo dice", alt?.alterna, true);
  es("y solo trae lo que se ve", alt?.trozos.map((l) => l.map((x) => x[0]).join("")), ["pantalla completa"]);

  // Claude Code a pantalla completa pinta las rayas de su caja a todo el ancho
  // y sigue escribiendo sin salto: xterm marca la fila de después como
  // «continuación». Juntarlas pegaba raya + «❯» + la barra de estado en una
  // sola línea, y el móvil ni veía las rayas ni quitaba la barra (Munir,
  // 2026-10-16, con captura). En la alterna cada fila es la suya.
  await escribir(term, `\x1b[2J\x1b[H${"─".repeat(30)}❯ \x1b[3;1H${"─".repeat(30)}  ›› auto mode on`);
  const caja = historiaConColor(1, 400);
  es("en la alterna, la raya de todo el ancho no se pega a la fila de debajo", caja?.trozos.map((l) => l.map((x) => x[0]).join("")), ["─".repeat(30), "❯", "─".repeat(30), "  ›› auto mode on"]);

  // `pantallaDe` es lo que leen `read_pane_screen`, la comprobación de
  // `send_command` y el selector de modelo. La sugerencia gris de Claude Code no
  // la escribió nadie: con ella dentro, la caja parecía tener texto. El
  // 2026-11-19 la coordinadora de winshotx vio «/compact» en la caja del panel
  // 57, le dio un Intro y no pasó nada. Lo escrito de verdad sí se queda.
  await escribir(term, `\x1b[2J\x1b[H${"─".repeat(30)}\x1b[2;1H❯ \x1b[2m/compact\x1b[0m\x1b[3;1H${"─".repeat(30)}\x1b[4;1H  ›› auto mode on`);
  es("la sugerencia gris no sale como escrita", pantallaDe(1), ["─".repeat(30), "❯", "─".repeat(30), "  ›› auto mode on"]);
  await escribir(term, `\x1b[2;1H\x1b[2K❯ /compact`);
  es("lo tecleado de verdad, sí", pantallaDe(1)?.[1], "❯ /compact");
  await escribir(term, `\x1b[2;1H\x1b[2K❯ hola\x1b[2m que tal\x1b[0m`);
  es("de una fila con las dos, solo lo escrito", pantallaDe(1)?.[1], "❯ hola");
  await escribir(term, `\x1b[2;1H\x1b[2K  \x1b[2m❯ 2. Sonnet\x1b[0m`);
  es("lo tenue fuera de la caja (un menú sangrado) se queda", pantallaDe(1)?.[1], "  ❯ 2. Sonnet");
  // Con un turno en marcha, lo que se manda queda en su cola y Claude Code lo
  // dice en la caja, atenuado como la sugerencia. Es el letrero que busca
  // `quedo_en_cola` (src-tauri/src/mcp.rs) para que `send_command` conteste
  // «quedó en su cola, no lo mandes otra vez» (revisión de 34845a23, con la
  // pantalla de un Claude Code 2.1.328 de verdad).
  // Tras el glifo de la caja va un espacio duro (U+00A0), como en la pantalla real.
  term.resize(60, 12);
  await escribir(term, `\x1b[2;1H\x1b[2K❯ \x1b[2mPress up to edit queued messages\x1b[0m`);
  es("el letrero de la cola, aunque vaya tenue, se queda", pantallaDe(1)?.[1], "❯ Press up to edit queued messages");
}

void probar().then(() => {
  console.log(fallos ? `\n${fallos} FALLOS: ${rojos.join("; ")}` : "\nTODO BIEN");
  process.exit(fallos ? 1 : 0);
});
