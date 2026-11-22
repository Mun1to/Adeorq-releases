// El color de las terminales, aparte del color de la app.
//
// Hasta ahora las terminales tenían UN esquema, escrito a mano dentro de
// `TerminalPane.tsx`, y no cambiaba nunca: daba igual que la casa estuviera en
// Gruvbox o en Matrix, el rojo de un error siempre era el mismo rojo azulado.
// Son dos gustos distintos y de hecho la gente los elige por separado: el tema
// de la app es el mueble, y el de la terminal es la letra que lees ocho horas.
// Desde el 2026-11-21, de fábrica van juntos («A juego con el tema», `DEL_TEMA`):
// quien llega de Ghostty o de su editor con Drácula espera los dos de Drácula.
//
// **El fondo NO lo pone el esquema, a propósito.** Lo sigue decidiendo la casa
// (`--xterm-bg` en `App.css`, ver `fondoDeXterm`), porque es lo que hace que
// una terminal de Adeorq sea cristal sobre tu foto en vez de un rectángulo
// negro. Un esquema que trajera su propio fondo opaco taparía el fondo y
// rompería lo que distingue a esta app de cualquier otra terminal. Aquí se
// eligen las LETRAS: el texto, el cursor, la selección y los dieciséis colores
// que los programas piden por su número.
//
// Los esquemas claros (desde el 2026-11-21) van solo a juego con un tema claro,
// y no salen en la lista: sobre el fondo oscuro de un tema oscuro no se leerían.
// Quien quiere claro cambia el tema de la casa, que sí sabe aclararlo todo a la
// vez. Y en un tema claro, elegir uno de la lista, que son todos oscuros, deja
// la terminal oscura (`marcarTermOscura`).

import type { CSSProperties } from "react";

/** Lo que xterm entiende, menos el fondo (ver arriba). */
export interface ColoresTerm {
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface TemaTerm {
  id: string;
  es: string;
  en: string;
  /** De dónde viene, para poder agruparlos y no mentir sobre su origen. Los
      «claro» no tienen familia en la lista: van solo a juego con su tema. */
  familia: "casa" | "clasico" | "retro" | "importado" | "claro";
  colores: ColoresTerm;
}

export const TEMAS_TERM: TemaTerm[] = [
  {
    id: "casa",
    es: "De la casa",
    en: "House",
    familia: "casa",
    colores: {
      foreground: "#dce7f8",
      cursor: "#5fb0ff",
      cursorAccent: "#0d1524",
      selectionBackground: "rgba(77, 159, 255, 0.30)",
      black: "#1a2336",
      red: "#ff8a92",
      green: "#8ad9a0",
      yellow: "#f3cf8a",
      blue: "#7ab8ff",
      magenta: "#bb96f7",
      cyan: "#6fd6ff",
      white: "#dce7f8",
      brightBlack: "#64769b",
      brightRed: "#ffa3ab",
      brightGreen: "#a5ecb8",
      brightYellow: "#ffdf9e",
      brightBlue: "#a4ceff",
      brightMagenta: "#d4b7ff",
      brightCyan: "#9fe6ff",
      brightWhite: "#f5f9ff",
    },
  },
  {
    // Los mismos colores de la casa, subidos de saturación. Para quien lee con
    // el brillo bajo o con una foto clara detrás.
    id: "casa-vivo",
    es: "De la casa, subido",
    en: "House, turned up",
    familia: "casa",
    colores: {
      foreground: "#eef4ff",
      cursor: "#63c8ff",
      cursorAccent: "#050b14",
      selectionBackground: "rgba(99, 200, 255, 0.34)",
      black: "#16203a",
      red: "#ff6b78",
      green: "#5fe08a",
      yellow: "#ffce5c",
      blue: "#4aa8ff",
      magenta: "#c07bff",
      cyan: "#3fd8ff",
      white: "#eef4ff",
      brightBlack: "#7488b3",
      brightRed: "#ff8f99",
      brightGreen: "#8bf7ac",
      brightYellow: "#ffe08a",
      brightBlue: "#7cc4ff",
      brightMagenta: "#dba6ff",
      brightCyan: "#84e9ff",
      brightWhite: "#ffffff",
    },
  },
  // Los conocidos, con su paleta oficial: los dieciséis colores, el cursor y el
  // fondo tal como los trae Ghostty (que los toma de iTerm2-Color-Schemes), para
  // que quien llega de Ghostty, Warp o su editor reconozca su terminal. Hasta el
  // 2026-11-21 varios llevaban los «brillantes» inventados (un tono más claro del
  // normal) y faltaban Rosé Pine, Kanagawa, Everforest y Synthwave '84. Donde
  // no son los de Ghostty, se dice en su línea. La selección va siempre con un
  // fondo que deja leer la letra: Ghostty la pinta a veces del color del texto
  // con la letra en el del fondo, y xterm no le cambia la letra.
  conocido("dracula", "Drácula", "Dracula", "#f8f8f2", "#f8f8f2", "#282a36", "#44475a", [
    "#21222c", "#ff5555", "#50fa7b", "#f1fa8c", "#bd93f9", "#ff79c6", "#8be9fd", "#f8f8f2",
    "#6272a4", "#ff6e6e", "#69ff94", "#ffffa5", "#d6acff", "#ff92df", "#a4ffff", "#ffffff",
  ]),
  conocido("nord", "Nord", "Nord", "#d8dee9", "#eceff4", "#2e3440", "#434c5e", [
    "#3b4252", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#88c0d0", "#e5e9f0",
    "#596377", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#8fbcbb", "#eceff4",
  ]),
  conocido("gruvbox", "Gruvbox", "Gruvbox", "#ebdbb2", "#ebdbb2", "#282828", "#665c54", [
    "#282828", "#cc241d", "#98971a", "#d79921", "#458588", "#b16286", "#689d6a", "#a89984",
    "#928374", "#fb4934", "#b8bb26", "#fabd2f", "#83a598", "#d3869b", "#8ec07c", "#ebdbb2",
  ]),
  // El fondo, el del editor de One Dark (#282c34); el de Ghostty es el de su
  // barra lateral, un punto más oscuro.
  conocido("onedark", "One Dark", "One Dark", "#abb2bf", "#abb2bf", "#282c34", "#3e4451", [
    "#21252b", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#abb2bf",
    "#767676", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#abb2bf",
  ]),
  conocido("tokyo", "Tokyo Night", "Tokyo Night", "#c0caf5", "#c0caf5", "#1a1b26", "#33467c", [
    "#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6",
    "#414868", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5",
  ]),
  conocido("catppuccin", "Catppuccin Mocha", "Catppuccin Mocha", "#cdd6f4", "#f5e0dc", "#1e1e2e", "rgba(147, 153, 178, 0.3)", [
    "#45475a", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de",
    "#585b70", "#f7aec2", "#c2ecbf", "#fcd682", "#aeccfc", "#f398da", "#b1eae1", "#a6adc8",
  ]),
  conocido("rose", "Rosé Pine", "Rosé Pine", "#e0def4", "#e0def4", "#191724", "#403d52", [
    "#26233a", "#eb6f92", "#31748f", "#f6c177", "#9ccfd8", "#c4a7e7", "#ebbcba", "#e0def4",
    "#6e6a86", "#eb6f92", "#31748f", "#f6c177", "#9ccfd8", "#c4a7e7", "#ebbcba", "#e0def4",
  ]),
  conocido("kanagawa", "Kanagawa", "Kanagawa", "#dcd7ba", "#c8c093", "#1f1f28", "#2d4f67", [
    "#090618", "#c34043", "#76946a", "#c0a36e", "#7e9cd8", "#957fb8", "#6a9589", "#c8c093",
    "#727169", "#e82424", "#98bb6c", "#e6c384", "#7fb4ca", "#938aa9", "#7aa89f", "#dcd7ba",
  ]),
  // El fondo, el bg0 de su variante media (#2d353b), y los brillantes, los
  // mismos que los normales: el archivo de Ghostty trae ahí los de Everforest
  // claro, hechos para un fondo blanco.
  conocido("everforest", "Everforest", "Everforest", "#d3c6aa", "#e69875", "#2d353b", "#543a48", [
    "#7a8478", "#e67e80", "#a7c080", "#dbbc7f", "#7fbbb3", "#d699b6", "#83c092", "#f2efdf",
    "#a6b0a0", "#e67e80", "#a7c080", "#dbbc7f", "#7fbbb3", "#d699b6", "#83c092", "#fffbef",
  ]),
  // Monokai Classic: así lo trae Ghostty, con el naranja en el lugar del azul.
  conocido("monokai", "Monokai", "Monokai", "#fdfff1", "#c0c1b5", "#272822", "#57584f", [
    "#272822", "#f92672", "#a6e22e", "#e6db74", "#fd971f", "#ae81ff", "#66d9ef", "#fdfff1",
    "#6e7066", "#f92672", "#a6e22e", "#e6db74", "#fd971f", "#ae81ff", "#66d9ef", "#fdfff1",
  ]),
  conocido("solarized", "Solarizado", "Solarized Dark", "#839496", "#839496", "#002b36", "#073642", [
    "#073642", "#dc322f", "#859900", "#b58900", "#268bd2", "#d33682", "#2aa198", "#eee8d5",
    "#335e69", "#cb4b16", "#586e75", "#657b83", "#839496", "#6c71c4", "#93a1a1", "#fdf6e3",
  ]),
  // Synthwave '84 no está en Ghostty con ese nombre: sus colores salen de la
  // terminal del tema de VS Code de Robb Owen (licencia MIT), y el negro, el
  // gris y el blanco, que ese tema no declara, de su barra y sus comentarios.
  conocido("synthwave", "Synthwave '84", "Synthwave '84", "#ffffff", "#f97e72", "#262335", "rgba(255, 255, 255, 0.13)", [
    "#171520", "#fe4450", "#72f1b8", "#f3e70f", "#03edf9", "#ff7edb", "#03edf9", "#ffffff",
    "#848bbd", "#fe4450", "#72f1b8", "#fede5d", "#03edf9", "#ff7edb", "#03edf9", "#ffffff",
  ]),
  {
    // Un monitor de fósforo. No es una broma nostálgica: leer una consola de
    // logs en un solo color cansa menos que en dieciséis.
    id: "fosforo",
    es: "Fósforo verde",
    en: "Green phosphor",
    familia: "retro",
    colores: {
      foreground: "#8bf78b",
      cursor: "#8bf78b",
      cursorAccent: "#001100",
      selectionBackground: "rgba(80, 220, 100, 0.28)",
      black: "#0a2a0a",
      red: "#4fd45f",
      green: "#5cf06f",
      yellow: "#7bf78b",
      blue: "#43c455",
      magenta: "#66e878",
      cyan: "#72f086",
      white: "#a8f7ae",
      brightBlack: "#3f7f45",
      brightRed: "#7bf78b",
      brightGreen: "#96ffa4",
      brightYellow: "#b4ffbe",
      brightBlue: "#6fe07f",
      brightMagenta: "#8cf59a",
      brightCyan: "#a0ffb0",
      brightWhite: "#d8ffdc",
    },
  },
  {
    id: "ambar",
    es: "Ámbar antiguo",
    en: "Amber CRT",
    familia: "retro",
    colores: {
      foreground: "#ffcc66",
      cursor: "#ffcc66",
      cursorAccent: "#1a1000",
      selectionBackground: "rgba(255, 180, 60, 0.26)",
      black: "#3a2600",
      red: "#ffa040",
      green: "#ffc255",
      yellow: "#ffd67a",
      blue: "#e0a044",
      magenta: "#ffb45c",
      cyan: "#ffcb70",
      white: "#ffdfa0",
      brightBlack: "#a07533",
      brightRed: "#ffbe6a",
      brightGreen: "#ffd889",
      brightYellow: "#ffe9ab",
      brightBlue: "#f0c072",
      brightMagenta: "#ffd08a",
      brightCyan: "#ffe0a2",
      brightWhite: "#fff2d0",
    },
  },
  // Los claros, para la terminal clara de un tema claro. Los dos de la casa
  // llevan su letra (el azul noche de Claro, el marrón de Papel) y sus ocho
  // colores normales pasan de 4,5:1 sobre su fondo; los ocho brillantes, como
  // en todo esquema claro, van más claros y se quedan entre 2,9 y 4,4. Los tres
  // conocidos, su paleta de Ghostty tal cual.
  claro("casa-claro", "De la casa, claro", "House, light", "#16213a", "#1f6fe0", "#fbfcfe", "rgba(31, 111, 224, 0.18)", [
    "#1d2840", "#c8323f", "#1a7f37", "#8a5a00", "#1f6fe0", "#8a4fd6", "#0b7a95", "#5a6a86",
    "#6b7a94", "#e0414f", "#23934a", "#a06c00", "#3a86f0", "#a06ae6", "#138fac", "#8593ab",
  ]),
  claro("papel", "Papel", "Paper", "#33291c", "#a3622a", "#f6f0e5", "rgba(163, 98, 42, 0.2)", [
    "#2b2217", "#b23f2f", "#46701a", "#8a6412", "#2f5f8a", "#8a4a7a", "#2f7468", "#6f6250",
    "#857661", "#c9533f", "#568522", "#a37a1a", "#3f74a3", "#a05e90", "#3a8a7c", "#9a8b74",
  ]),
  // GitHub Light Default. La selección, la de su editor: la de Ghostty es la
  // letra en negro lleno, y xterm no le cambia la letra.
  claro("github-claro", "GitHub claro", "GitHub Light", "#1f2328", "#0969da", "#ffffff", "rgba(9, 105, 218, 0.2)", [
    "#24292f", "#cf222e", "#116329", "#4d2d00", "#0969da", "#8250df", "#1b7c83", "#6e7781",
    "#57606a", "#a40e26", "#1a7f37", "#633c01", "#218bff", "#a475f9", "#3192aa", "#8c959f",
  ]),
  claro("solarized-claro", "Solarizado claro", "Solarized Light", "#657b83", "#657b83", "#fdf6e3", "#eee8d5", [
    "#073642", "#dc322f", "#859900", "#b58900", "#268bd2", "#d33682", "#2aa198", "#bbb5a2",
    "#002b36", "#cb4b16", "#586e75", "#657b83", "#839496", "#6c71c4", "#93a1a1", "#fdf6e3",
  ]),
  // La selección, su overlay2 a un 30 %, como la del Mocha.
  claro("latte", "Catppuccin Latte", "Catppuccin Latte", "#4c4f69", "#dc8a78", "#eff1f5", "rgba(124, 127, 147, 0.3)", [
    "#bcc0cc", "#d20f39", "#40a02b", "#df8e1d", "#1e66f5", "#ea76cb", "#179299", "#5c5f77",
    "#acb0be", "#e7103f", "#46b02f", "#e49931", "#3878f6", "#ef95d7", "#19a1a8", "#6c6f85",
  ]),
];

/** Un conocido a partir de su paleta, en el orden de siempre: los ocho
    normales (0 a 7) y los ocho brillantes (8 a 15). El cursor escribe encima
    con el color del fondo, que es lo que hacen todas las terminales. */
function conocido(
  id: string,
  es: string,
  en: string,
  foreground: string,
  cursor: string,
  fondo: string,
  selectionBackground: string,
  p: readonly string[],
): TemaTerm {
  return {
    id,
    es,
    en,
    familia: "clasico",
    colores: {
      foreground,
      cursor,
      cursorAccent: fondo,
      selectionBackground,
      black: p[0],
      red: p[1],
      green: p[2],
      yellow: p[3],
      blue: p[4],
      magenta: p[5],
      cyan: p[6],
      white: p[7],
      brightBlack: p[8],
      brightRed: p[9],
      brightGreen: p[10],
      brightYellow: p[11],
      brightBlue: p[12],
      brightMagenta: p[13],
      brightCyan: p[14],
      brightWhite: p[15],
    },
  };
}

/** Un esquema claro: como un conocido, pero fuera de la lista. */
function claro(...a: Parameters<typeof conocido>): TemaTerm {
  return { ...conocido(...a), familia: "claro" };
}

/** Las familias en su orden, con el nombre que encabeza cada grupo. */
export const FAMILIAS_TERM = [
  { id: "casa", es: "De la casa", en: "House" },
  { id: "clasico", es: "Conocidos", en: "Familiar" },
  { id: "retro", es: "De un solo color", en: "Single hue" },
] as const;

export const TEMA_TERM_KEY = "adeorq-tema-terminal";

/** Aviso de que hay que repintar las terminales abiertas. Es el mismo camino
    que usa el fondo de la casa: cambiar de esquema y tener que reiniciar la app
    para verlo no sería un ajuste, sería un trámite. */
export const TEMA_TERM_EVENTO = "adeorq:tema-terminal";

/** «A juego con el tema»: la terminal lleva los colores del tema de la casa.
    Es lo de fábrica desde el 2026-11-21. Quien elige Drácula en el tema espera
    la terminal de Drácula, como en Ghostty o en su editor, no la de la casa con
    el mueble pintado de morado; y quien había elegido un esquema a mano lo
    tiene guardado y lo conserva. */
export const DEL_TEMA = "tema";

/** El esquema de cada tema que trae el suyo. Los demás (los de la casa y los
    apagados) van con el de la casa. */
const ESQUEMA_DEL_TEMA: Readonly<Record<string, string>> = {
  claro: "casa-claro",
  papel: "papel",
  "github-claro": "github-claro",
  "solarized-claro": "solarized-claro",
  latte: "latte",
  dracula: "dracula",
  nord: "nord",
  gruvbox: "gruvbox",
  onedark: "onedark",
  tokyo: "tokyo",
  catppuccin: "catppuccin",
  rose: "rose",
  kanagawa: "kanagawa",
  everforest: "everforest",
  monokai: "monokai",
  solarized: "solarized",
  synthwave: "synthwave",
  matrix: "fosforo",
  cyberpunk: "casa-vivo",
};

/** El esquema que va a juego con un tema (por defecto, el puesto ahora). */
export function esquemaDelTema(tema = document.documentElement.dataset.theme ?? ""): string {
  return ESQUEMA_DEL_TEMA[tema] ?? "casa";
}

/** Los colores de terminal que pinta la miniatura de un tema en Ajustes (una
    orden y un fallo, `19-temas.css`): los de su esquema, para que Drácula se
    reconozca también por su verde y su rosa, no solo por el morado. Solo en
    los que traen el suyo: los de la casa comparten el de la casa, y veinte
    miniaturas con las mismas cuatro rayas de color serían colorines, no un
    dato. */
export function varsDeMiniatura(tema: string): CSSProperties | undefined {
  if (!(tema in ESQUEMA_DEL_TEMA)) return undefined;
  const c = coloresTerm(esquemaDelTema(tema));
  return {
    "--tm-verde": c.green,
    "--tm-azul": c.blue,
    "--tm-rojo": c.red,
    "--tm-morado": c.magenta,
    "--tm-letra": c.foreground,
  } as CSSProperties;
}

export function temaTermId(): string {
  return localStorage.getItem(TEMA_TERM_KEY) || DEL_TEMA;
}

/** El hermano oscuro de cada esquema claro, para el apagón. */
const OSCURO_DEL_CLARO: Readonly<Record<string, string>> = {
  "solarized-claro": "solarized",
  latte: "catppuccin",
};

/** El esquema que lleva la terminal ahora: el elegido, o el del tema si va «A
    juego». Con el apagón nunca es uno claro: el apagón es negro detrás del
    texto, y la letra oscura de un esquema claro sobre negro no se lee (1,31:1
    en Claro). Va su hermano oscuro, y si no tiene, el de la casa. */
export function esquemaPuesto(): string {
  return esquemaReal(temaTermId());
}

/** El esquema que pone de verdad un id: el suyo, o con «A juego» el del tema
    (por defecto, el puesto), y con el apagón nunca uno claro. Lo usa también
    la muestra de «A juego con el tema» en Ajustes, para enseñar lo que se pone. */
export function esquemaReal(id: string, tema?: string): string {
  const real = id === DEL_TEMA ? esquemaDelTema(tema) : id;
  if (document.documentElement.dataset.apagon !== "1" || !esquemaClaro(real)) return real;
  return OSCURO_DEL_CLARO[real] ?? "casa";
}

/** Los colores de un esquema (por defecto, el puesto). Si el guardado ya no
    existe (porque se quitó de la lista en una versión nueva), vuelve al de la
    casa en vez de dejar la terminal sin colores. */
export function coloresTerm(id = esquemaPuesto()): ColoresTerm {
  const real = id === DEL_TEMA ? esquemaDelTema() : id;
  return ([...TEMAS_TERM, ...temasImportados()].find((t) => t.id === real) ?? TEMAS_TERM[0]).colores;
}

/** Si un esquema es de los claros (por defecto, el puesto). */
export function esquemaClaro(id = esquemaPuesto()): boolean {
  const real = id === DEL_TEMA ? esquemaDelTema() : id;
  return TEMAS_TERM.some((t) => t.id === real && t.familia === "claro");
}

/** En un tema claro la terminal va clara, con su esquema claro; si se ha
    elegido uno de la lista, que son todos oscuros, o está el apagón, va
    oscura. Lo marca en
    `<html>` (`data-term-oscura`) para el CSS (`42-aspectos.css`), y hay que
    llamarlo ANTES de avisar a las terminales, que releen su fondo al oírlo.
    `data-claro`, que dice si el tema es claro, lo pone `App.tsx`. */
export function marcarTermOscura(): void {
  const raiz = document.documentElement;
  raiz.toggleAttribute("data-term-oscura", raiz.hasAttribute("data-claro") && !esquemaClaro());
}

export function guardarTemaTerm(id: string): void {
  localStorage.setItem(TEMA_TERM_KEY, id);
  marcarTermOscura();
  window.dispatchEvent(new Event(TEMA_TERM_EVENTO));
}

/* ----------------------------------------------------------- los importados
   Los esquemas que el usuario trae de Warp o de Ghostty (`lib/temasDeFuera.ts`
   los lee). Viven en este equipo, al lado del ajuste que los elige, y entran
   en la misma lista que los de la casa. */

export const IMPORTADOS_KEY = "adeorq-temas-importados";

const CAMPOS: ReadonlyArray<keyof ColoresTerm> = [
  "foreground", "cursor", "cursorAccent", "selectionBackground",
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite",
];

/** Los importados, descartando lo que no tenga la forma entera: un guardado a
    medias dejaría una terminal con colores sin definir. */
export function temasImportados(): TemaTerm[] {
  try {
    const crudo: unknown = JSON.parse(localStorage.getItem(IMPORTADOS_KEY) || "[]");
    if (!Array.isArray(crudo)) return [];
    return crudo.filter(
      (t): t is TemaTerm =>
        !!t && typeof t.id === "string" && typeof t.es === "string" && !!t.colores && CAMPOS.every((c) => typeof t.colores[c] === "string"),
    );
  } catch {
    return [];
  }
}

/** El id de un importado sale de su nombre: traer otra vez el mismo archivo lo
    actualiza en vez de apilar copias. */
export function idDeImportado(nombre: string): string {
  const limpio = nombre.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `imp-${limpio || "tema"}`;
}

export function guardarImportado(nombre: string, colores: ColoresTerm): TemaTerm {
  const tema: TemaTerm = { id: idDeImportado(nombre), es: nombre, en: nombre, familia: "importado", colores };
  const resto = temasImportados().filter((t) => t.id !== tema.id);
  localStorage.setItem(IMPORTADOS_KEY, JSON.stringify([...resto, tema]));
  // Si era el que estaba puesto, las terminales abiertas cogen los colores nuevos.
  if (temaTermId() === tema.id) window.dispatchEvent(new Event(TEMA_TERM_EVENTO));
  return tema;
}

/** Quita un importado. Si era el elegido, se vuelve a lo de fábrica, «A juego
    con el tema»: el de la casa dejaba oscura la terminal de un claro. */
export function quitarImportado(id: string): void {
  localStorage.setItem(IMPORTADOS_KEY, JSON.stringify(temasImportados().filter((t) => t.id !== id)));
  if (temaTermId() === id) guardarTemaTerm(DEL_TEMA);
}

/* --------------------------------------------------------------- el apagón
   Negro sólido detrás de la terminal, por encima de todo lo demás.

   Adeorq apuesta por el cristal: los paneles se abren y dejan ver tu foto, y
   eso es lo que hace que no parezca otra terminal más. Pero cuando lo que
   tienes delante es un agente escribiendo mil líneas y quieres LEERLAS, todo
   eso es ruido detrás del texto. El apagón lo cierra de golpe, sin obligarte a
   quitar el fondo ni a cambiar de tema.

   Solo toca las terminales. La barra, la lista de proyectos y los paneles
   siguen siendo lo que eran: apagar la app entera es lo que hace el tema
   «Negro absoluto», y esa es otra decisión distinta. */

export const APAGON_KEY = "adeorq-apagon";

export function apagon(): boolean {
  return localStorage.getItem(APAGON_KEY) === "1";
}

/** Se pone en `<html>` para que lo vea el CSS, y se avisa a las terminales
    abiertas, que leen su fondo con `getComputedStyle` una sola vez. En un tema
    claro cambia también el esquema puesto (`esquemaPuesto`). */
export function aplicarApagon(on: boolean): void {
  if (on) document.documentElement.dataset.apagon = "1";
  else delete document.documentElement.dataset.apagon;
  marcarTermOscura();
  window.dispatchEvent(new Event(TEMA_TERM_EVENTO));
}

export function guardarApagon(on: boolean): void {
  localStorage.setItem(APAGON_KEY, on ? "1" : "0");
  aplicarApagon(on);
}
