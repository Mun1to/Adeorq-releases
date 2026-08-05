// El color de las terminales, aparte del color de la app.
//
// Hasta ahora las terminales tenían UN esquema, escrito a mano dentro de
// `TerminalPane.tsx`, y no cambiaba nunca: daba igual que la casa estuviera en
// Gruvbox o en Matrix, el rojo de un error siempre era el mismo rojo azulado.
// Son dos gustos distintos y de hecho la gente los elige por separado: el tema
// de la app es el mueble, y el de la terminal es la letra que lees ocho horas.
//
// **El fondo NO lo pone el esquema, a propósito.** Lo sigue decidiendo la casa
// (`--xterm-bg` en `App.css`, ver `fondoDeXterm`), porque es lo que hace que
// una terminal de Adeorq sea cristal sobre tu foto en vez de un rectángulo
// negro. Un esquema que trajera su propio fondo opaco taparía el fondo y
// rompería lo que distingue a esta app de cualquier otra terminal. Aquí se
// eligen las LETRAS: el texto, el cursor, la selección y los dieciséis colores
// que los programas piden por su número.
//
// Por eso tampoco hay esquemas claros: sobre el cristal oscuro de la ventana no
// se leerían. Quien quiere claro cambia el tema de la casa, que sí sabe
// aclararlo todo a la vez.

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
  /** De dónde viene, para poder agruparlos y no mentir sobre su origen. */
  familia: "casa" | "clasico" | "retro";
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
  {
    id: "dracula",
    es: "Drácula",
    en: "Dracula",
    familia: "clasico",
    colores: {
      foreground: "#f8f8f2",
      cursor: "#f8f8f0",
      cursorAccent: "#282a36",
      selectionBackground: "rgba(68, 71, 90, 0.65)",
      black: "#21222c",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#bd93f9",
      magenta: "#ff79c6",
      cyan: "#8be9fd",
      white: "#f8f8f2",
      brightBlack: "#6272a4",
      brightRed: "#ff6e6e",
      brightGreen: "#69ff94",
      brightYellow: "#ffffa5",
      brightBlue: "#d6acff",
      brightMagenta: "#ff92df",
      brightCyan: "#a4ffff",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "nord",
    es: "Ártico",
    en: "Nord",
    familia: "clasico",
    colores: {
      foreground: "#d8dee9",
      cursor: "#d8dee9",
      cursorAccent: "#2e3440",
      selectionBackground: "rgba(67, 76, 94, 0.7)",
      black: "#3b4252",
      red: "#bf616a",
      green: "#a3be8c",
      yellow: "#ebcb8b",
      blue: "#81a1c1",
      magenta: "#b48ead",
      cyan: "#88c0d0",
      white: "#e5e9f0",
      brightBlack: "#4c566a",
      brightRed: "#d08770",
      brightGreen: "#b9d4a3",
      brightYellow: "#f0d8a8",
      brightBlue: "#9bb8d4",
      brightMagenta: "#c6a4c0",
      brightCyan: "#8fbcbb",
      brightWhite: "#eceff4",
    },
  },
  {
    id: "gruvbox",
    es: "Gruvbox",
    en: "Gruvbox",
    familia: "clasico",
    colores: {
      foreground: "#ebdbb2",
      cursor: "#ebdbb2",
      cursorAccent: "#282828",
      selectionBackground: "rgba(80, 73, 69, 0.75)",
      black: "#3c3836",
      red: "#cc241d",
      green: "#98971a",
      yellow: "#d79921",
      blue: "#458588",
      magenta: "#b16286",
      cyan: "#689d6a",
      white: "#a89984",
      brightBlack: "#928374",
      brightRed: "#fb4934",
      brightGreen: "#b8bb26",
      brightYellow: "#fabd2f",
      brightBlue: "#83a598",
      brightMagenta: "#d3869b",
      brightCyan: "#8ec07c",
      brightWhite: "#ebdbb2",
    },
  },
  {
    id: "onedark",
    es: "One Dark",
    en: "One Dark",
    familia: "clasico",
    colores: {
      foreground: "#abb2bf",
      cursor: "#61afef",
      cursorAccent: "#282c34",
      selectionBackground: "rgba(62, 68, 81, 0.8)",
      black: "#3f4451",
      red: "#e06c75",
      green: "#98c379",
      yellow: "#e5c07b",
      blue: "#61afef",
      magenta: "#c678dd",
      cyan: "#56b6c2",
      white: "#abb2bf",
      brightBlack: "#5c6370",
      brightRed: "#ef8a92",
      brightGreen: "#b2d99a",
      brightYellow: "#f0d39b",
      brightBlue: "#8ac6f5",
      brightMagenta: "#d79ae7",
      brightCyan: "#7fcbd4",
      brightWhite: "#f5f8ff",
    },
  },
  {
    id: "tokyo",
    es: "Tokyo Night",
    en: "Tokyo Night",
    familia: "clasico",
    colores: {
      foreground: "#c0caf5",
      cursor: "#7aa2f7",
      cursorAccent: "#1a1b26",
      selectionBackground: "rgba(65, 72, 104, 0.8)",
      black: "#32344a",
      red: "#f7768e",
      green: "#9ece6a",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      magenta: "#bb9af7",
      cyan: "#7dcfff",
      white: "#a9b1d6",
      brightBlack: "#565f89",
      brightRed: "#ff9ab0",
      brightGreen: "#b9e58c",
      brightYellow: "#f0c68a",
      brightBlue: "#9ab8f9",
      brightMagenta: "#cfb6f9",
      brightCyan: "#a2ddff",
      brightWhite: "#e6ecff",
    },
  },
  {
    id: "catppuccin",
    es: "Catppuccin Mocha",
    en: "Catppuccin Mocha",
    familia: "clasico",
    colores: {
      foreground: "#cdd6f4",
      cursor: "#f5e0dc",
      cursorAccent: "#1e1e2e",
      selectionBackground: "rgba(88, 91, 112, 0.75)",
      black: "#45475a",
      red: "#f38ba8",
      green: "#a6e3a1",
      yellow: "#f9e2af",
      blue: "#89b4fa",
      magenta: "#f5c2e7",
      cyan: "#94e2d5",
      white: "#bac2de",
      brightBlack: "#585b70",
      brightRed: "#f7a8bf",
      brightGreen: "#bfebba",
      brightYellow: "#fbebc6",
      brightBlue: "#a5c7fb",
      brightMagenta: "#f8d5ee",
      brightCyan: "#aeeae0",
      brightWhite: "#a6adc8",
    },
  },
  {
    id: "solarized",
    es: "Solarizado",
    en: "Solarized Dark",
    familia: "clasico",
    colores: {
      foreground: "#93a1a1",
      cursor: "#2aa198",
      cursorAccent: "#002b36",
      selectionBackground: "rgba(7, 54, 66, 0.85)",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#586e75",
      brightRed: "#cb4b16",
      brightGreen: "#9aad1f",
      brightYellow: "#cfa019",
      brightBlue: "#4ba3e0",
      brightMagenta: "#6c71c4",
      brightCyan: "#4fbcb3",
      brightWhite: "#fdf6e3",
    },
  },
  {
    id: "monokai",
    es: "Monokai",
    en: "Monokai",
    familia: "clasico",
    colores: {
      foreground: "#f8f8f2",
      cursor: "#f8f8f0",
      cursorAccent: "#272822",
      selectionBackground: "rgba(73, 72, 62, 0.8)",
      black: "#272822",
      red: "#f92672",
      green: "#a6e22e",
      yellow: "#f4bf75",
      blue: "#66d9ef",
      magenta: "#ae81ff",
      cyan: "#a1efe4",
      white: "#f8f8f2",
      brightBlack: "#75715e",
      brightRed: "#fb5c8c",
      brightGreen: "#bcea5c",
      brightYellow: "#f7cf95",
      brightBlue: "#8ae3f5",
      brightMagenta: "#c39dff",
      brightCyan: "#b8f4eb",
      brightWhite: "#f9f8f5",
    },
  },
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
];

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

export function temaTermId(): string {
  return localStorage.getItem(TEMA_TERM_KEY) || "casa";
}

/** Los colores del esquema elegido. Si el guardado ya no existe (porque se
    quitó de la lista en una versión nueva), vuelve al de la casa en vez de
    dejar la terminal sin colores. */
export function coloresTerm(id = temaTermId()): ColoresTerm {
  return (TEMAS_TERM.find((t) => t.id === id) ?? TEMAS_TERM[0]).colores;
}

export function guardarTemaTerm(id: string): void {
  localStorage.setItem(TEMA_TERM_KEY, id);
  window.dispatchEvent(new Event(TEMA_TERM_EVENTO));
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

const APAGON_KEY = "adeorq-apagon";

export function apagon(): boolean {
  return localStorage.getItem(APAGON_KEY) === "1";
}

/** Se pone en `<html>` para que lo vea el CSS, y se avisa a las terminales
    abiertas, que leen su fondo con `getComputedStyle` una sola vez. */
export function aplicarApagon(on: boolean): void {
  if (on) document.documentElement.dataset.apagon = "1";
  else delete document.documentElement.dataset.apagon;
  window.dispatchEvent(new Event(TEMA_TERM_EVENTO));
}

export function guardarApagon(on: boolean): void {
  localStorage.setItem(APAGON_KEY, on ? "1" : "0");
  aplicarApagon(on);
}
