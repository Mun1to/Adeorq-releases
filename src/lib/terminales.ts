// Las xterm vivas, por número de panel, para quien tiene que LEER una pantalla
// desde fuera de su componente: el MCP (`read_pane_screen`) y el propio
// `send_command`, que mira si el texto se quedó en la caja de Claude Code.
//
// En la pantalla alternativa el historial de bytes no sirve (es el título
// girando y repintados), y lo único que dice qué hay escrito es el búfer que
// xterm tiene pintado. Vive aquí, aparte, para que `App.tsx` no tenga que
// atravesar un árbol de componentes para llegar a una terminal.

import type { Terminal } from "@xterm/xterm";

const vivas = new Map<number, Terminal>();

export function registrarTerminal(id: number, term: Terminal): void {
  vivas.set(id, term);
}

export function olvidarTerminal(id: number, term?: Terminal): void {
  // Solo si sigue siendo la misma: un panel que renace registra la nueva antes
  // de que la vieja termine de limpiarse.
  if (!term || vivas.get(id) === term) vivas.delete(id);
}

/** Las filas de la pantalla tal como se ven, de arriba abajo, sin el espacio
 *  sobrante a la derecha ni las filas vacías del final. */
export function pantallaDe(id: number): string[] | null {
  const term = vivas.get(id);
  if (!term) return null;
  const buf = term.buffer.active;
  const filas: string[] = [];
  for (let y = 0; y < term.rows; y++) {
    const linea = buf.getLine(buf.baseY + y);
    filas.push(linea ? linea.translateToString(true).trimEnd() : "");
  }
  while (filas.length && !filas[filas.length - 1]) filas.pop();
  return filas;
}

/** Un trozo de línea con su aspecto: el texto, el color de la letra
 *  («#rrggbb», o "" para el de siempre) y si va en negrita (1) o tenue (2). */
export type Trozo = [string, string, number];

const ANSI = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite"] as const;
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
/** Los 240 colores de después de los 16 del tema: el cubo de 6×6×6 y los grises. */
function color256(n: number): string {
  if (n >= 232) return hex(((8 + (n - 232) * 10) * 0x010101) & 0xffffff);
  const i = n - 16;
  const v = (c: number) => (c ? c * 40 + 55 : 0);
  return hex((v(Math.floor(i / 36)) << 16) | (v(Math.floor(i / 6) % 6) << 8) | v(i % 6));
}

/**
 * Lo mismo que `historiaDe`, con el color de cada trozo: el móvil enseña la
 * terminal con los colores que tiene en el PC (Munir, 2026-10-16: «se ve muy
 * encogida y no se ve claro y estructurado»). Los 16 primeros salen del tema
 * de la terminal, que es el que pinta el PC. `alterna`: está en la pantalla
 * alternativa (Claude Code a pantalla completa), donde no hay más historial
 * que lo que se ve.
 */
export function historiaConColor(id: number, max: number): { trozos: Trozo[][]; alterna: boolean } | null {
  const term = vivas.get(id);
  if (!term) return null;
  const tema = (term.options.theme ?? {}) as Record<string, string | undefined>;
  const paleta = (n: number) => (n < 16 ? tema[ANSI[n]] ?? "" : color256(n));
  const buf = term.buffer.active;
  const celda = buf.getNullCell();
  const lineas: Trozo[][] = [];
  for (let y = Math.max(0, buf.length - max); y < buf.length; y++) {
    const linea = buf.getLine(y);
    if (!linea) continue;
    // Las que xterm partió por el ancho, vueltas a juntar (el móvil las envuelve al suyo).
    const sigue = linea.isWrapped && lineas.length > 0;
    const trozos: Trozo[] = sigue ? lineas[lineas.length - 1] : [];
    for (let x = 0; x < linea.length; x++) {
      const c = linea.getCell(x, celda);
      if (!c || c.getWidth() === 0) continue;
      const letra = c.getChars() || " ";
      const color = c.isFgRGB() ? hex(c.getFgColor()) : c.isFgPalette() ? paleta(c.getFgColor()) : "";
      const marca = (c.isBold() ? 1 : 0) | (c.isDim() ? 2 : 0);
      const ultimo = trozos[trozos.length - 1];
      if (ultimo && ultimo[1] === color && ultimo[2] === marca) ultimo[0] += letra;
      else trozos.push([letra, color, marca]);
    }
    if (!sigue) lineas.push(trozos);
  }
  // Sin el espacio sobrante a la derecha de cada línea ni las vacías del final.
  for (const t of lineas) {
    while (t.length && !t[t.length - 1][0].trimEnd()) t.pop();
    if (t.length) t[t.length - 1][0] = t[t.length - 1][0].trimEnd();
  }
  while (lineas.length && !lineas[lineas.length - 1].some((t) => t[0].trim())) lineas.pop();
  return { trozos: lineas, alterna: buf.type === "alternate" };
}

/** Las últimas `max` líneas del búfer, el historial incluido, con las que
 *  xterm partió por el ancho vueltas a juntar (el móvil las envuelve al suyo).
 *  En la pantalla alternativa no hay historial y sale la pantalla. */
export function historiaDe(id: number, max: number): string[] | null {
  const term = vivas.get(id);
  if (!term) return null;
  const buf = term.buffer.active;
  const filas: string[] = [];
  for (let y = Math.max(0, buf.length - max); y < buf.length; y++) {
    const linea = buf.getLine(y);
    if (!linea) continue;
    const sigue = buf.getLine(y + 1)?.isWrapped ?? false;
    const texto = linea.translateToString(!sigue);
    if (linea.isWrapped && filas.length) filas[filas.length - 1] += texto;
    else filas.push(texto);
  }
  while (filas.length && !filas[filas.length - 1].trim()) filas.pop();
  return filas;
}
