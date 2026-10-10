// Leer un tema de terminal hecho para otro programa: los de Warp (un `.yaml`)
// y los de Ghostty (líneas `clave = valor`). Hay miles hechos, y quien llega de
// uno de esos dos ya tiene el suyo.
//
// Lo que se importa son las LETRAS: el texto, el cursor, la selección y los
// dieciséis colores. El fondo del tema NO se usa, por lo mismo que en
// `temasTerm.ts`: en Adeorq el fondo de la terminal es el cristal de la casa.
// Y por eso un tema de fondo claro se rechaza diciéndolo: sus letras oscuras
// no se leerían sobre ese cristal.
//
// Los dos formatos están sacados de archivos de verdad (el repositorio de
// temas de Warp y la carpeta `ghostty` de iTerm2-Color-Schemes), y con esos
// mismos archivos se prueba: `pnpm bancos temas-de-fuera`.
//
// No hay un lector de YAML detrás: un tema de Warp son dos niveles de
// `clave: valor`, y traer una librería entera para eso sería más código que el
// propio lector.

import type { ColoresTerm } from "./temasTerm";

export type Formato = "warp" | "ghostty";

export type Leido =
  | { ok: true; formato: Formato; colores: ColoresTerm }
  /** `error` es la frase en español que pasa por `t()`; `detalle`, lo que no se traduce. */
  | { ok: false; error: string; detalle?: string };

const NOMBRES = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"] as const;

/** `#abc`, `#aabbcc`, `aabbcc`, con o sin comillas → `#aabbcc`. Lo demás, nada. */
export function aHex(valor: string): string | null {
  const v = valor.trim().replace(/^["']|["']$/g, "").trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(v)) return `#${[...v].map((c) => c + c).join("")}`;
  if (/^[0-9a-f]{6}$/.test(v)) return `#${v}`;
  // Con transparencia (`#rrggbbaa`): se queda el color, que es lo que xterm pide.
  if (/^[0-9a-f]{8}$/.test(v)) return `#${v.slice(0, 6)}`;
  return null;
}

/** La luz de un color, de 0 (negro) a 1 (blanco), como la percibe el ojo. */
export function luz(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

function conAlfa(hex: string, alfa: string): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgba(${n(1)}, ${n(3)}, ${n(5)}, ${alfa})`;
}

/** Lo que se saca de cualquiera de los dos formatos, antes de comprobarlo. */
interface Crudo {
  fondo?: string;
  texto?: string;
  cursor?: string;
  cursorTexto?: string;
  seleccion?: string;
  acento?: string;
  /** Los dieciséis, por su número: 0-7 normales, 8-15 vivos. */
  paleta: Array<string | undefined>;
  /** Valores que parecían un color y no lo eran. */
  raros: string[];
}

function leerGhostty(texto: string): Crudo {
  const c: Crudo = { paleta: [], raros: [] };
  for (const linea of texto.split(/\r?\n/)) {
    const m = linea.match(/^\s*([a-z-]+)\s*=\s*(.+?)\s*$/);
    if (!m || linea.trimStart().startsWith("#")) continue;
    const [, clave, valor] = m;
    if (clave === "palette") {
      const p = valor.match(/^(\d{1,2})\s*=\s*(.+)$/);
      const n = p ? Number(p[1]) : -1;
      const hex = p ? aHex(p[2]) : null;
      if (n >= 0 && n < 16 && hex) c.paleta[n] = hex;
      else if (n >= 0 && n < 16) c.raros.push(valor);
      continue;
    }
    const campo = (
      {
        background: "fondo",
        foreground: "texto",
        "cursor-color": "cursor",
        "cursor-text": "cursorTexto",
        "selection-background": "seleccion",
      } as const
    )[clave];
    if (!campo) continue;
    const hex = aHex(valor);
    if (hex) c[campo] = hex;
    else c.raros.push(`${clave} = ${valor}`);
  }
  return c;
}

function leerWarp(texto: string): Crudo {
  const c: Crudo = { paleta: [], raros: [] };
  // Dónde estamos, por la sangría: `terminal_colors` > `bright` | `normal`, o
  // un `accent`/`background` en degradado (`top`, `bottom`…), del que se coge
  // el primer color.
  let seccion = "";
  let grupo = "";
  for (const linea of texto.split(/\r?\n/)) {
    const m = linea.match(/^(\s*)([A-Za-z_]+)\s*:\s*(.*?)\s*$/);
    if (!m || linea.trimStart().startsWith("#")) continue;
    const sangria = m[1].length;
    const clave = m[2];
    const valor = m[3].replace(/\s+#.*$/, "");
    if (sangria === 0) {
      seccion = valor ? "" : clave;
      grupo = "";
      const hex = valor ? aHex(valor) : null;
      if (clave === "background" && hex) c.fondo = hex;
      else if (clave === "foreground" && hex) c.texto = hex;
      else if (clave === "accent" && hex) c.acento = hex;
      else if (["background", "foreground", "accent"].includes(clave) && valor) c.raros.push(`${clave}: ${valor}`);
      continue;
    }
    if (seccion === "terminal_colors") {
      if (!valor) {
        grupo = clave;
        continue;
      }
      const i = NOMBRES.indexOf(clave as (typeof NOMBRES)[number]);
      if (i < 0 || (grupo !== "normal" && grupo !== "bright")) continue;
      const hex = aHex(valor);
      if (hex) c.paleta[i + (grupo === "bright" ? 8 : 0)] = hex;
      else c.raros.push(`${grupo}.${clave}: ${valor}`);
      continue;
    }
    // Degradado: el primer color que aparezca vale.
    const hex = valor ? aHex(valor) : null;
    if (seccion === "accent" && hex) c.acento ??= hex;
    if (seccion === "background" && hex) c.fondo ??= hex;
  }
  return c;
}

/**
 * Lee el texto de un tema y devuelve sus colores, o por qué no se puede.
 *
 * El formato se reconoce por lo que trae dentro y no por la extensión: los de
 * Ghostty no tienen ninguna.
 */
export function leerTema(texto: string): Leido {
  const formato: Formato | null = /^\s*terminal_colors\s*:/m.test(texto)
    ? "warp"
    : /^\s*palette\s*=/m.test(texto)
      ? "ghostty"
      : null;
  if (!formato) return { ok: false, error: "No es un tema de Warp ni de Ghostty." };
  const c = formato === "warp" ? leerWarp(texto) : leerGhostty(texto);

  if (c.raros.length) return { ok: false, error: "Tiene un color que no entiendo:", detalle: c.raros[0] };
  const faltan = [
    ...(c.texto ? [] : ["foreground"]),
    ...Array.from({ length: 16 }, (_, i) => i)
      .filter((i) => !c.paleta[i])
      .map((i) => (formato === "ghostty" ? `palette ${i}` : `${i < 8 ? "normal" : "bright"}.${NOMBRES[i % 8]}`)),
  ];
  if (faltan.length) return { ok: false, error: "Le faltan colores:", detalle: faltan.slice(0, 4).join(", ") + (faltan.length > 4 ? "…" : "") };
  // Con fondo se mira el fondo; sin él, el texto: letras oscuras son de tema claro.
  const claro = c.fondo ? luz(c.fondo) > 0.4 : luz(c.texto!) < 0.2;
  if (claro) return { ok: false, error: "Es un tema de fondo claro, y sus letras no se leerían sobre el cristal oscuro de Adeorq." };

  const p = c.paleta as string[];
  const texto_ = c.texto!;
  return {
    ok: true,
    formato,
    colores: {
      foreground: texto_,
      cursor: c.cursor ?? c.acento ?? texto_,
      cursorAccent: c.cursorTexto ?? c.fondo ?? "#0d1524",
      // Ghostty trae su color de selección; Warp no, y se hace con su acento
      // (o con el texto) a un tercio, como los esquemas de la casa.
      selectionBackground: c.seleccion ?? conAlfa(c.acento ?? texto_, "0.30"),
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

/** `tokyo_night.yaml` → «Tokyo night»; `TokyoNight` se queda como está. */
export function nombreDeArchivo(archivo: string): string {
  const base = archivo.replace(/^.*[\\/]/, "").replace(/\.(ya?ml|txt|conf|theme)$/i, "").replace(/[_-]+/g, " ").trim();
  return base ? base[0].toUpperCase() + base.slice(1) : "Tema";
}
