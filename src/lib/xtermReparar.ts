/* Que un `resize` de xterm no deje el búfer con menos líneas de las que promete.
 *
 * ── EL FALLO, CAZADO EL 2026-09-10 ───────────────────────────────────────────
 *
 * Dos veces en una semana (3 y 10 de septiembre) la interfaz entera se cayó
 * con `Cannot set properties of undefined (setting 'isWrapped')` en el
 * `lineFeed` de xterm. Ese `lineFeed` hace `lines.get(ybase + y).isWrapped =
 * false` sin comprobar nada, así que revienta en cuanto el búfer tiene menos
 * líneas que `ybase + rows`, que es un invariante que xterm da por sentado.
 *
 * Buscándolo a ciegas con un fuzz (escribir, repintar, cambiar de búfer y
 * redimensionar al azar) salió en veinticinco segundos, y reducido queda en
 * tres pasos:
 *
 *     new Terminal({ cols: 2, rows: 46, scrollback: 0 })
 *     resize(135, 51)
 *     write("x".repeat(70) + "\n" + "x".repeat(36) + "\n")
 *     resize(3, 60)          →  length=60  baseY=1  rows=60
 *
 * Ese es el caso con scrollback 0. Con los 2.500 u 8.000 de Adeorq el búfer
 * normal no rompe (medido, ni lleno), pero el ALTERNATIVO sí, y en cuatro
 * pasos que pasan en un panel cualquiera:
 *
 *     new Terminal({ cols: 134, rows: 45, scrollback: 8000 })
 *     resize(82, 20)              el panel se estrecha (un panel lateral, un split)
 *     write("\x1b[?1049h")        un programa entra en la pantalla alternativa
 *     write("\n".repeat(20))      y hace scroll ahí dentro
 *     resize(194, 48)             el panel crece  →  length=48  baseY=1  rows=48
 *
 * La causa está en `Buffer.resize` de xterm: al estrechar, el alternativo
 * vacío no recorta su `maxLength` (todo el ajuste va dentro de un `if
 * (lines.length > 0)`), así que al activarse se comporta como si tuviera
 * scrollback, acumula un `ybase` que nunca debería tener, y al crecer la cuenta
 * sale corta. En el fuzz sin reducir el déficit llegó a dieciséis líneas.
 *
 * Lo que pasa después depende de si la lista está llena: si lo está, el índice
 * de más DA LA VUELTA (`% maxLength`) y la última fila enseña la primera línea
 * del búfer; si no, la casilla no existe y `lineFeed` revienta con el
 * `isWrapped` de undefined que tiró la app. Está fijado en
 * `scripts/xterm-check.mjs` (`pnpm xterm`) como fallo de la librería, para que
 * el día que una versión de xterm lo arregle este parche pueda irse.
 *
 * ── LA REPARACIÓN ────────────────────────────────────────────────────────────
 *
 * Desde fuera no se puede tocar `ybase`. Lo que sí se puede es volver a pasar
 * por el camino de `Buffer.resize` que SÍ lo recoloca: al CRECER una fila con
 * `ybase > 0` y el búfer corto, xterm baja `ybase` en vez de añadir una línea
 * (`this.ybase--; addToY++`), y al volver a la fila de antes ya no sobra nada
 * que recortar. O sea: `resize(cols, rows + 1)` y `resize(cols, rows)` dejan la
 * misma rejilla con el búfer cuadrado. El proceso no se entera: al PTY solo se
 * le manda el tamaño final, y eso lo hace `sincronizarPty` después.
 *
 * Se comprueba con la xterm de verdad en `scripts/reparar-check.ts`: el caso
 * mínimo, los de scrollback real con el búfer lleno, que el texto no se pierde,
 * y que sin la reparación el invariante se queda roto (el control). */

interface Bufer {
  readonly length: number;
  readonly baseY: number;
}

/** Lo poco que hace falta de una terminal. Así el banco pasa la de verdad. */
export interface TerminalReparable {
  readonly cols: number;
  readonly rows: number;
  readonly buffer: { readonly normal: Bufer; readonly alternate: Bufer };
  resize(cols: number, rows: number): void;
}

/**
 * Cuántas líneas le faltan al búfer para lo que promete: el mayor déficit de
 * los dos. Cero cuando está sano.
 *
 * Los DOS, no solo el activo: un `resize` los redimensiona a la vez, y el que
 * está escondido puede quedar corto y reventar al volver a él. Y el alternativo
 * es el candidato natural, porque no tiene scrollback: su lista mide justo
 * `rows`, que es la condición del fallo. Cazado con los scrollback de Adeorq
 * (2.500 y 8.000): `length=48 baseY=16 rows=48` en el alternativo, o sea
 * dieciséis líneas de déficit, no una.
 */
export function deficit(t: TerminalReparable): number {
  // Un búfer VACÍO no está corto: es el alternativo sin activar (o recién
  // abandonado, que xterm vacía al volver a la pantalla normal), y se rellena
  // entero en el momento de activarse. Contarlo daba sesenta líneas de déficit
  // en una terminal sana, y un rebote de sesenta filas por nada.
  const de = (b: Bufer) => (b.length === 0 ? 0 : Math.max(0, b.baseY + t.rows - b.length));
  return Math.max(de(t.buffer.normal), de(t.buffer.alternate));
}

/** Si alguno de los dos búferes promete más líneas de las que tiene. */
export function buferCorto(t: TerminalReparable): boolean {
  return deficit(t) > 0;
}

/** Más de esto es otro fallo, no este: se para para no rebotar sin fin. */
const REBOTES = 3;
/** Un déficit mayor no es este fallo: no se rebota a lo loco. */
const DEFICIT_MAXIMO = 500;

/**
 * Cuadra el búfer si un `resize` lo dejó corto. Devuelve cuántos rebotes hizo
 * (cero es lo normal), y `-1` si no lo consiguió, que es un dato para el rastro.
 *
 * El rebote es de TANTAS filas como líneas faltan, y por esto: al crecer `k`
 * filas, `Buffer.resize` hace `k` veces «o añade una línea o baja `ybase`», y
 * cada una acorta el déficit en uno; al volver a las filas de antes, sobran
 * exactamente `k` menos que antes, así que el déficit de partida queda a cero.
 * Con un rebote de UNA fila (la primera versión de esto) un déficit de
 * dieciséis se quedaba en quince.
 */
export function repararBufer(t: TerminalReparable): number {
  if (!buferCorto(t)) return 0;
  for (let i = 1; i <= REBOTES; i++) {
    const d = deficit(t);
    if (d > DEFICIT_MAXIMO) return -1;
    const { cols, rows } = t;
    t.resize(cols, rows + d);
    t.resize(cols, rows);
    if (!buferCorto(t)) return i;
  }
  return -1;
}
