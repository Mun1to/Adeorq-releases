// La caja de entrada de Claude Code, leída de la pantalla. Aparte de `contexto.ts`
// para que pueda usarla quien está por debajo de `pty.ts` (`selectorDeModelo.ts`).

/**
 * ¿Está Claude Code parado en su caja de entrada, vacía? Es la tercera llave
 * de lo que se teclea solo (revisión de `1954cf0`, 2026-10-30): con el CLI
 * cerrado, el panel se queda en el PowerShell de `-NoExit` (o en el cmd de
 * `/k`), su transcript sigue diciendo «lista», y un `/fin` ahí es un comando
 * de consola. La caja es una fila que empieza en la columna 0 por `❯` (`> ` en
 * el renderizador clásico) entre dos rayas `─`, la de arriba con el nombre de
 * la sesión a veces; vacía, o con la sugerencia atenuada («Try "…"»). Debajo
 * solo va su pie, sangrado («  ⏵⏵ auto mode on»): algo en la columna 0 es un
 * prompt de consola. Un menú, un borrador o un `❯` sin rayas (el prompt de
 * starship) no son la caja. Pantallas de la 2.1.302, la 2.1.314 y la 2.1.317.
 * Con un turno en marcha la caja está igual, y se puede escribir en ella.
 */
export function esperaEnSuCaja(linea: (i: number) => string, filas: number): boolean {
  const raya = (l: string) => /^\s*─{8,}/.test(l);
  let i = filas - 1;
  for (; i >= 0 && !raya(linea(i)); i--) {
    const l = linea(i);
    if (l.trim() && !/^\s/.test(l)) return false;
  }
  if (i < 2 || !raya(linea(i - 2))) return false;
  const caja = /^[❯>](.*)$/.exec(linea(i - 1));
  const dentro = caja?.[1].trim();
  return dentro !== undefined && (dentro === "" || dentro.startsWith('Try "'));
}
