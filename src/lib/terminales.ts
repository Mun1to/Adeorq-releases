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
