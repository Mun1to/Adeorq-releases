// The cockpit's tiling engine. Panes used to live inside a column element
// each, which meant moving one between columns changed its parent in the React
// tree: React would unmount it and the PTY would die with it. So the model
// stays "columns of panes", but the view renders every pane as a SIBLING,
// absolutely positioned from the rectangles computed here. Reordering then
// only changes styles, and the terminals keep running.

export interface Col {
  cid: number;
  /** Relative width of the column. */
  w: number;
  panes: number[];
  /** Relative height of each pane in this column, same order as `panes`. */
  hs: number[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Nothing may be dragged smaller than this: a terminal has to stay usable. */
export const MIN_FRAC = 0.12;

/**
 * How small a pane is allowed to get, in real pixels.
 *
 * A fraction alone was not enough: 12% of a wide window is a working terminal,
 * 12% of a narrow one is a sliver whose header runs out of room and drops the
 * buttons off its right edge, the close one first (Munir, 2026-07-26: "no
 * puedas extender tanto la terminal... los botones de arriba no se ven").
 * 356 is where the header still shows every button with the pane's name beside
 * them, and the terminal still has columns worth reading. It was 320 until the
 * bin joined the row: one more button is one more 28px and its gap, and the
 * floor has to know that or the fix stops holding.
 */
export const MIN_PANE_W = 356;
export const MIN_PANE_H = 150;

/**
 * That pixel floor turned into a fraction of the space actually available.
 *
 * Capped, because on a small window or with three columns open the honest
 * minimum would be more than everyone's fair share, and then no divider could
 * move at all. Room to arrange beats a rule kept to the letter.
 */
export function floorFor(px: number, total: number, count: number): number {
  if (total <= 0 || count < 2) return 0;
  return Math.min(px / total, 0.6 / count);
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Where each pane sits, in 0..1 of the grid area. */
export function rects(cols: Col[]): Map<number, Rect> {
  const out = new Map<number, Rect>();
  const total = sum(cols.map((c) => c.w)) || 1;
  let x = 0;
  for (const col of cols) {
    const w = col.w / total;
    const hTotal = sum(col.hs) || 1;
    let y = 0;
    col.panes.forEach((id, i) => {
      const h = (col.hs[i] ?? 1) / hTotal;
      out.set(id, { x, y, w, h });
      y += h;
    });
    x += w;
  }
  return out;
}

/** Inserts a pane: next to another one, or as a new column while there is room. */
export function addPane(
  cols: Col[],
  id: number,
  nextCid: () => number,
  at?: { relTo: number; dir: "right" | "down" },
  maxCols = 3,
): Col[] {
  const next = cols.map((c) => ({ ...c, panes: [...c.panes], hs: [...c.hs] }));
  if (at) {
    const ci = next.findIndex((c) => c.panes.includes(at.relTo));
    if (ci >= 0) {
      if (at.dir === "down") {
        const pi = next[ci].panes.indexOf(at.relTo);
        // The new pane takes half of the one it was split from.
        const half = next[ci].hs[pi] / 2;
        next[ci].hs[pi] = half;
        next[ci].panes.splice(pi + 1, 0, id);
        next[ci].hs.splice(pi + 1, 0, half);
      } else {
        const half = next[ci].w / 2;
        next[ci].w = half;
        next.splice(ci + 1, 0, { cid: nextCid(), w: half, panes: [id], hs: [1] });
      }
      return next;
    }
  }
  if (next.length < maxCols) {
    const w = next.length ? sum(next.map((c) => c.w)) / next.length : 1;
    next.push({ cid: nextCid(), w, panes: [id], hs: [1] });
    return next;
  }
  // Full: feed the shortest column.
  let si = 0;
  next.forEach((c, i) => {
    if (c.panes.length < next[si].panes.length) si = i;
  });
  next[si].panes.push(id);
  next[si].hs.push(sum(next[si].hs) / next[si].panes.length);
  return next;
}

export function removePane(cols: Col[], id: number): Col[] {
  return cols
    .map((c) => {
      const i = c.panes.indexOf(id);
      if (i < 0) return { ...c, panes: [...c.panes], hs: [...c.hs] };
      const panes = c.panes.filter((p) => p !== id);
      const hs = c.hs.filter((_, k) => k !== i);
      return { ...c, panes, hs };
    })
    .filter((c) => c.panes.length > 0);
}

/**
 * Devuelve el mosaico REAL con las medidas del mosaico que se está viendo.
 *
 * Hay dos mosaicos a la vez: el de verdad (`cols`, con todo dentro) y el que
 * se ve, que es ese menos lo apartado. Los paneles se colocan con el segundo y
 * las barras de arrastre se calculaban con el PRIMERO, así que con una sola
 * terminal apartada aparecía una barra azul flotando en mitad de otra terminal
 * y arrastrarla movía una columna que no era (Munir, 2026-08-07: «el drag de
 * estirar las terminales se buguea»).
 *
 * Ahora las barras salen del que se ve, y lo que el arrastre cambia se copia
 * aquí de vuelta al de verdad: por `cid` la columna y por id del panel el alto,
 * nunca por posición, porque en el que se ve faltan justo los que no están. Lo
 * apartado conserva su medida y la recupera al volver.
 */
export function aplicarVistas(cols: Col[], vistas: Col[]): Col[] {
  return cols.map((c) => {
    const v = vistas.find((x) => x.cid === c.cid);
    if (!v) return c;
    const hs = c.hs.map((h, i) => {
      const k = v.panes.indexOf(c.panes[i]);
      return k >= 0 ? v.hs[k] : h;
    });
    return { ...c, w: v.w, hs };
  });
}

/** Drag one pane onto another: they trade places, so no gaps are ever left. */
export function swapPanes(cols: Col[], a: number, b: number): Col[] {
  if (a === b) return cols;
  return cols.map((c) => ({
    ...c,
    hs: [...c.hs],
    panes: c.panes.map((id) => (id === a ? b : id === b ? a : id)),
  }));
}

/**
 * The two sides of a divider after a drag, kept inside their limits.
 *
 * Clamped rather than refused: the old version threw the whole drag away the
 * moment it would cross the line, so the divider snapped back under the
 * cursor and felt broken. Now it walks up to the edge and waits there.
 */
function held(a0: number, b0: number, delta: number, min: number): [number, number] | null {
  const pair = a0 + b0;
  // With less room than two minimums there is no legal answer, so the most
  // either side can take is half: still no vanishing pane.
  const floor = Math.min(min, pair / 2);
  const a = Math.min(Math.max(a0 + delta, floor), pair - floor);
  return Math.abs(a - a0) < 1e-6 ? null : [a, pair - a];
}

/** Drags the divider between column i and i+1. `delta` is a fraction of width. */
export function resizeCol(cols: Col[], i: number, delta: number, min = MIN_FRAC): Col[] {
  if (i < 0 || i + 1 >= cols.length) return cols;
  const total = sum(cols.map((c) => c.w)) || 1;
  const next = held(cols[i].w / total, cols[i + 1].w / total, delta, min);
  if (!next) return cols;
  const [a, b] = next;
  return cols.map((c, k) =>
    k === i ? { ...c, w: a * total } : k === i + 1 ? { ...c, w: b * total } : c,
  );
}

/** Same, for the divider between two panes stacked in one column. */
export function resizeRow(
  cols: Col[],
  ci: number,
  ri: number,
  delta: number,
  min = MIN_FRAC,
): Col[] {
  const col = cols[ci];
  if (!col || ri < 0 || ri + 1 >= col.panes.length) return cols;
  const total = sum(col.hs) || 1;
  const next = held(col.hs[ri] / total, col.hs[ri + 1] / total, delta, min);
  if (!next) return cols;
  const hs = [...col.hs];
  hs[ri] = next[0] * total;
  hs[ri + 1] = next[1] * total;
  return cols.map((c, k) => (k === ci ? { ...c, hs } : c));
}

/** Where a dragged pane will land, relative to the one under the cursor. */
export type Edge = "left" | "right" | "top" | "bottom" | "center";

/**
 * Windows-style snap: dropping on the middle of a pane swaps them, dropping
 * near an edge puts the pane THERE, splitting the target's space in two. That
 * is what "move it wherever I want" means in a mosaic: no gaps, no overlaps.
 */
export function movePane(
  cols: Col[],
  id: number,
  target: number,
  edge: Edge,
  nextCid: () => number,
): Col[] {
  if (id === target) return cols;
  if (edge === "center") return swapPanes(cols, id, target);
  const without = removePane(cols, id);
  const ci = without.findIndex((c) => c.panes.includes(target));
  if (ci < 0) return cols;
  const next = without.map((c) => ({ ...c, panes: [...c.panes], hs: [...c.hs] }));
  if (edge === "top" || edge === "bottom") {
    const pi = next[ci].panes.indexOf(target);
    const half = next[ci].hs[pi] / 2;
    next[ci].hs[pi] = half;
    const at = edge === "top" ? pi : pi + 1;
    next[ci].panes.splice(at, 0, id);
    next[ci].hs.splice(at, 0, half);
  } else {
    const half = next[ci].w / 2;
    next[ci].w = half;
    next.splice(edge === "left" ? ci : ci + 1, 0, {
      cid: nextCid(),
      w: half,
      panes: [id],
      hs: [1],
    });
  }
  return next;
}

/** Which zone of a pane the cursor is in, as a fraction of its box. */
export function edgeAt(fx: number, fy: number): Edge {
  const near = 0.28;
  const dl = fx;
  const dr = 1 - fx;
  const dt = fy;
  const db = 1 - fy;
  const min = Math.min(dl, dr, dt, db);
  if (min > near) return "center";
  if (min === dl) return "left";
  if (min === dr) return "right";
  if (min === dt) return "top";
  return "bottom";
}

/** A Windows-snap style template: how many rows per column, and their widths. */
export interface Preset {
  id: string;
  /** Rows in each column, left to right. */
  rows: number[];
  /** Relative width of each column (defaults to equal). */
  weights?: number[];
}

/**
 * Cuatro columnas es el techo: con la barra abierta, la Cabina mide unos 1.600
 * de ancho en una pantalla de 1920, y a cinco cada terminal bajaría de
 * `MIN_PANE_W` y perdería los botones de su cabecera. Más terminales que eso
 * crecen en filas, no en columnas. Es también el lado de la rejilla del menú.
 */
export const MAX_COLS = 4;
export const MAX_FILAS = 4;

/**
 * La plantilla de la rejilla del menú: `c` columnas de `r` filas, como al
 * insertar una tabla. Sustituye a la lista de doce dibujos sueltos, que se
 * acababa en nueve y tenía varios que se leían igual (Munir, 2026-10-30, eligió
 * «columnas y filas» entre tres caminos).
 */
export function rejilla(c: number, r: number): Preset {
  return { id: `${c}x${r}`, rows: Array.from({ length: c }, () => r) };
}

/**
 * Una grande a la izquierda y el resto al lado, para llevar una sesión
 * mientras las demás informan. El resto va en columnas de tres como mucho;
 * con tres columnas al lado la grande se estrecha un poco, porque a 1,6 las
 * de la derecha bajarían de `MIN_PANE_W`.
 */
export function unaGrande(n: number): Preset {
  const resto = Math.max(1, n - 1);
  const cols = Math.min(MAX_COLS - 1, Math.ceil(resto / 3));
  const rows = [1, ...equilibrada(resto, cols)];
  const grande = rows.length > 3 ? 1.3 : 1.6;
  return { id: `grande-${n}`, rows, weights: rows.map((_, i) => (i === 0 ? grande : 1)) };
}

/**
 * `n` terminales en `c` columnas, lo más iguales posible, con las columnas de
 * menos filas a la izquierda: las primeras terminales, que suelen ser las que
 * llevas, quedan más altas. Diez en cuatro son 2, 2, 3 y 3.
 */
export function equilibrada(n: number, c: number): number[] {
  const cols = Math.max(1, Math.min(c, n, MAX_COLS));
  const base = Math.floor(n / cols);
  const extra = n % cols;
  return Array.from({ length: cols }, (_, i) => base + (i >= cols - extra ? 1 : 0));
}

/**
 * Cuántas columnas le van a `n` terminales en una pantalla ancha. Hasta tres,
 * una columna cada una; con cuatro, dos arriba y dos abajo («los más comunes
 * son de cuatro, dos arriba y dos abajo», Munir, 2026-10-30); con ocho, cuatro
 * columnas de dos se leen mejor que tres de tres; y de diez en adelante, el
 * techo de cuatro.
 */
export function columnasPara(n: number): number {
  if (n <= 3) return Math.max(1, n);
  if (n === 4) return 2;
  if (n <= 7 || n === 9) return 3;
  return MAX_COLS;
}

/**
 * The tidiest template for a given number of panes, for when Adeorq opens a
 * squad and has to place it without asking. Built for exactly `n`, so none of
 * them piles up: before, anything past nine went into the last column of the
 * 3x3 and ten open terminals left four stacked in one strip.
 */
export function presetFor(n: number): Preset {
  const rows = equilibrada(Math.max(1, n), columnasPara(n));
  return { id: `auto-${rows.join("-")}`, rows };
}

/**
 * Re-deals the panes that exist into a template, keeping their order.
 *
 * Nothing is ever dropped, and nothing piles up either: if there are more
 * terminals than the template has room for, the spares go one by one to the
 * column that has fewest, instead of all into the last one (with twelve open
 * and the 3x3 picked, that column used to take six). And if there are fewer,
 * the empty slots come off the column that has most, so the columns you
 * picked are still there: filling in order, two columns of four with four
 * terminals came out as ONE column.
 *
 * `fuera` are the panes that are open but out of the mosaic (minimized, or in
 * a hidden group). The template is for what you SEE, so they are dealt after
 * the visible ones; otherwise a hidden pane took a slot and the grid came out
 * with a hole in it. They still get a place, the shortest column, for when
 * they come back.
 */
export function applyPreset(
  cols: Col[],
  preset: Preset,
  nextCid: () => number,
  fuera?: ReadonlySet<number>,
): Col[] {
  const ids = cols.flatMap((c) => c.panes);
  if (ids.length === 0) return cols;
  let vistas = fuera ? ids.filter((id) => !fuera.has(id)) : ids;
  // Con todo apartado no hay nada que se vea: se reparte todo, que al volver
  // es lo que va a verse.
  if (vistas.length === 0) vistas = ids;
  const apartadas = ids.filter((id) => !vistas.includes(id));

  const rows = preset.rows.length ? [...preset.rows] : [1];
  // Lo que se añade va a la derecha entre las empatadas y lo que se quita sale
  // de la izquierda: así las columnas de menos filas quedan a la izquierda,
  // como en `equilibrada`.
  const masCorta = (xs: number[]) => {
    let si = 0;
    xs.forEach((r, i) => {
      if (r <= xs[si]) si = i;
    });
    return si;
  };
  const masLarga = (xs: number[]) => {
    let si = 0;
    xs.forEach((r, i) => {
      if (r > xs[si]) si = i;
    });
    return si;
  };
  let sitio = rows.reduce((a, b) => a + b, 0);
  for (; sitio < vistas.length; sitio++) rows[masCorta(rows)]++;
  for (; sitio > vistas.length; sitio--) rows[masLarga(rows)]--;

  const out: Col[] = [];
  let k = 0;
  rows.forEach((n, i) => {
    const take = vistas.slice(k, k + n);
    k += n;
    if (take.length === 0) return;
    out.push({
      cid: nextCid(),
      w: preset.weights?.[i] ?? 1,
      panes: take,
      hs: take.map(() => 1),
    });
  });
  for (const id of apartadas) {
    const col = out[masCorta(out.map((c) => c.panes.length))];
    col.panes.push(id);
    col.hs.push(1);
  }
  return out;
}
