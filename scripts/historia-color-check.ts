// La pantalla de una terminal con sus colores, como la lee el móvil
// (`historiaConColor` en src/lib/terminales.ts). Con un xterm de verdad, sin
// navegador: el verde del tema, la negrita, lo tenue, un color de 24 bits y
// uno de los 256, una línea que xterm partió por el ancho vuelta a juntar, y
// sin espacio sobrante a la derecha ni líneas vacías al final.
//
//   pnpm bancos historia-color

import "./xterm-en-node";
import { Terminal } from "@xterm/xterm";
import { historiaConColor, registrarTerminal } from "../src/lib/terminales";

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
}

void probar().then(() => {
  console.log(fallos ? `\n${fallos} FALLOS: ${rojos.join("; ")}` : "\nTODO BIEN");
  process.exit(fallos ? 1 : 0);
});
