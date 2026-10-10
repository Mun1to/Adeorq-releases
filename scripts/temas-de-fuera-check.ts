// Leer temas de terminal de Warp y de Ghostty (`lib/temasDeFuera.ts`).
//
// Los textos de abajo tienen la forma EXACTA de los archivos de verdad: los de
// Warp, de github.com/warpdotdev/themes (`standard/dracula.yaml`,
// `standard/solarized_light.yaml` y `warp_bundled/dark_city.yaml`, que trae el
// fondo en degradado y una imagen); el de Ghostty, de la carpeta `ghostty` de
// iTerm2-Color-Schemes. Si un día cambian de formato, se cambia aquí con otro
// archivo real delante.
//
//   pnpm bancos temas-de-fuera

import { aHex, leerTema, luz, nombreDeArchivo } from "../src/lib/temasDeFuera";
import { idDeImportado } from "../src/lib/temasTerm";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const es = (nombre: string, obtenido: unknown, esperado: unknown) =>
  ok(nombre, JSON.stringify(obtenido) === JSON.stringify(esperado), `sale ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`);

const WARP_DRACULA = `accent: "#bd93f9"
background: "#282a36"
details: darker
foreground: "#f8f8f2"
terminal_colors:
  bright:
    black: "#555555"
    blue: "#caa9fa"
    cyan: "#8be9fd"
    green: "#50fa7b"
    magenta: "#ff79c6"
    red: "#ff5555"
    white: "#ffffff"
    yellow: "#f1fa8c"
  normal:
    black: "#000000"
    blue: "#bd93f9"
    cyan: "#8be9fd"
    green: "#50fa7b"
    magenta: "#ff79c6"
    red: "#ff5555"
    white: "#bbbbbb"
    yellow: "#f1fa8c"
`;

const WARP_CLARO = WARP_DRACULA.replace('background: "#282a36"', 'background: "#fdf6e3"').replace("details: darker", "details: lighter");

const WARP_DEGRADADO = `background:
  top: "#0c252d"
  bottom: "#0c2c35"
accent: "#e9072d"
foreground: "#ffffff"
background_image:
  # background image credit: https://unsplash.com/photos/0eKCOZ11gfk
  path: warp_bundled/dark_city_bg.jpg
  opacity: 20
details: darker
terminal_colors:
  normal:
    black: "#616161"
    red: "#ff8272"
    green: "#b4fa72"
    yellow: "#fefdc2"
    blue: "#a5d5fe"
    magenta: "#ff8ffd"
    cyan: "#d0d1fe"
    white: "#f1f1f1"
  bright:
    black: "#8e8e8e"
    red: "#ffc4bd"
    green: "#d6fcb9"
    yellow: "#fefdd5"
    blue: "#c1e3fe"
    magenta: "#ffb1fe"
    cyan: "#e5e6fe"
    white: "#feffff"
`;

const GHOSTTY_DRACULA = `palette = 0=#21222c
palette = 1=#ff5555
palette = 2=#50fa7b
palette = 3=#f1fa8c
palette = 4=#bd93f9
palette = 5=#ff79c6
palette = 6=#8be9fd
palette = 7=#f8f8f2
palette = 8=#6272a4
palette = 9=#ff6e6e
palette = 10=#69ff94
palette = 11=#ffffa5
palette = 12=#d6acff
palette = 13=#ff92df
palette = 14=#a4ffff
palette = 15=#ffffff
background = #282a36
foreground = #f8f8f2
cursor-color = #f8f8f2
cursor-text = #282a36
selection-background = #44475a
selection-foreground = #ffffff
`;

// --- Warp ---------------------------------------------------------------------------
const w = leerTema(WARP_DRACULA);
ok("un tema de Warp se lee", w.ok && w.formato === "warp");
if (w.ok) {
  es("el texto", w.colores.foreground, "#f8f8f2");
  es("los normales, por su nombre", [w.colores.black, w.colores.red, w.colores.blue, w.colores.white], ["#000000", "#ff5555", "#bd93f9", "#bbbbbb"]);
  es("los vivos, aunque vengan antes que los normales", [w.colores.brightBlack, w.colores.brightBlue, w.colores.brightWhite], ["#555555", "#caa9fa", "#ffffff"]);
  es("el cursor es su acento", w.colores.cursor, "#bd93f9");
  es("la selección, su acento a un tercio", w.colores.selectionBackground, "rgba(189, 147, 249, 0.30)");
  es("el contraste del cursor, su fondo", w.colores.cursorAccent, "#282a36");
}
const d = leerTema(WARP_DEGRADADO);
ok("un fondo en degradado y una imagen no lo rompen", d.ok, d.ok ? "" : `${d.error} ${d.detalle ?? ""}`);
if (d.ok) es("y los colores salen bien", [d.colores.foreground, d.colores.cursor, d.colores.red, d.colores.brightCyan], ["#ffffff", "#e9072d", "#ff8272", "#e5e6fe"]);
const claro = leerTema(WARP_CLARO);
ok("un tema de fondo claro se rechaza diciendo por qué", !claro.ok && /fondo claro/.test(claro.error), JSON.stringify(claro));
ok("con finales de línea de Windows, igual", leerTema(WARP_DRACULA.replace(/\n/g, "\r\n")).ok);
ok("y sin comillas en los colores", leerTema(WARP_DRACULA.replace(/"/g, "")).ok);

// --- Ghostty ------------------------------------------------------------------------
const g = leerTema(GHOSTTY_DRACULA);
ok("un tema de Ghostty se lee", g.ok && g.formato === "ghostty");
if (g.ok) {
  es("la paleta, por su número", [g.colores.black, g.colores.red, g.colores.white, g.colores.brightBlack, g.colores.brightWhite], ["#21222c", "#ff5555", "#f8f8f2", "#6272a4", "#ffffff"]);
  es("su cursor, su contraste y su selección", [g.colores.cursor, g.colores.cursorAccent, g.colores.selectionBackground], ["#f8f8f2", "#282a36", "#44475a"]);
}
ok("los colores sin almohadilla también valen", leerTema(GHOSTTY_DRACULA.replace(/#/g, "")).ok);
ok("un comentario no estorba", leerTema(`# Dracula para Ghostty\n${GHOSTTY_DRACULA}`).ok);
const sinUno = leerTema(GHOSTTY_DRACULA.replace("palette = 12=#d6acff\n", ""));
ok("si falta un color, lo dice con su número", !sinUno.ok && sinUno.detalle === "palette 12", JSON.stringify(sinUno));
const raro = leerTema(GHOSTTY_DRACULA.replace("foreground = #f8f8f2", "foreground = blanco roto"));
ok("un color que no es un color, lo dice", !raro.ok && /foreground = blanco roto/.test(raro.detalle ?? ""), JSON.stringify(raro));

// --- lo que no es un tema ----------------------------------------------------------
ok("un texto cualquiera no es un tema", !leerTema("hola, esto es una nota").ok);
ok("un JSON tampoco", !leerTema('{"name":"x","colors":{}}').ok);
ok("nada, tampoco", !leerTema("").ok);

// --- piezas ------------------------------------------------------------------------
es("#abc se alarga", aHex("#abc"), "#aabbcc");
es("mayúsculas y comillas", aHex('"#BD93F9"'), "#bd93f9");
es("con transparencia se queda el color", aHex("#bd93f9cc"), "#bd93f9");
es("un nombre no es un color", aHex("red"), null);
ok("el blanco da luz y el negro no", luz("#ffffff") > 0.99 && luz("#000000") < 0.01);
es("el nombre sale del archivo", nombreDeArchivo("C:\\temas\\tokyo_night.yaml"), "Tokyo night");
es("uno de Ghostty, sin extensión, se queda como está", nombreDeArchivo("TokyoNight"), "TokyoNight");
es("el mismo nombre da el mismo id, para no apilar copias", idDeImportado("Tokyo night"), "imp-tokyo-night");
es("y un nombre raro no deja un id vacío", idDeImportado("¡¡!!"), "imp-tema");

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
