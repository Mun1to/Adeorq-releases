// Las plantillas del menú «Reparte lo que tienes abierto» (botón de la cabecera
// de la Cabina): ninguna terminal se pierde, ninguna se duplica y ninguna
// plantilla las amontona.
//
//   pnpm bancos plantillas
//
// El fallo que motivó esto (Munir, 2026-10-30, «más de 8 pestañas y que no se
// repitan órdenes»): la plantilla más grande era la de nueve, y lo que no cabía
// se apilaba en la última columna. Con doce abiertas y la 3x3, esa columna se
// llevaba seis. Y una terminal minimizada ocupaba su sitio en la plantilla, así
// que lo que se veía salía con un hueco.

import {
  applyPreset,
  columnasPara,
  equilibrada,
  MAX_COLS,
  MAX_FILAS,
  MIN_PANE_W,
  presetFor,
  rects,
  rejilla,
  removePane,
  unaGrande,
  type Col,
  type Preset,
} from "../src/lib/layout";

let fallos = 0;
function ok(nombre: string, condicion: boolean, detalle = "") {
  if (!condicion) fallos++;
  console.log(`${condicion ? "ok  " : "FALLA"} ${nombre}${detalle ? ` (${detalle})` : ""}`);
}

/** n terminales en una sola columna, con ids 1..n: el estado antes de repartir. */
const abiertas = (n: number): Col[] => [
  { cid: 0, w: 1, panes: Array.from({ length: n }, (_, i) => i + 1), hs: Array(n).fill(1) },
];
const cid = () => {
  let k = 100;
  return () => k++;
};
const filas = (cols: Col[]) => cols.map((c) => c.panes.length);
/** La Cabina en una pantalla de 1920 con la barra abierta. */
const CABINA_W = 1600;

/** Todas las casillas de la rejilla del menú: de 1x1 a 4x4. */
const REJILLA: Preset[] = [];
for (let c = 1; c <= MAX_COLS; c++) for (let r = 1; r <= MAX_FILAS; r++) REJILLA.push(rejilla(c, r));
const de = (c: number, r: number) => rejilla(c, r);

// --- ninguna se pierde ni se duplica, con cualquier plantilla y número ------
let perdidas = 0;
let peorCaso = "";
for (let n = 1; n <= 24; n++) {
  for (const p of [...REJILLA, presetFor(n), unaGrande(n)]) {
    const out = applyPreset(abiertas(n), p, cid());
    const ids = out.flatMap((c) => c.panes).sort((a, b) => a - b);
    const bien = ids.length === n && ids.every((id, i) => id === i + 1);
    if (!bien && !peorCaso) peorCaso = `${n} en ${p.id}: ${ids.join(",")}`;
    if (!bien) perdidas++;
  }
}
ok("de 1 a 24 terminales, en cada plantilla, salen todas y una sola vez", perdidas === 0, peorCaso);

// --- ninguna amontona -------------------------------------------------------
// Si hay más terminales que sitios, lo que sobra se reparte: ninguna columna
// pasa de la más alta de la plantilla más lo que toca a cada una.
let amontona = "";
for (let n = 1; n <= 24; n++) {
  for (const p of REJILLA) {
    const sitio = p.rows.reduce((a, b) => a + b, 0);
    if (n <= sitio) continue;
    const techo = Math.max(...p.rows) + Math.ceil((n - sitio) / p.rows.length);
    const out = applyPreset(abiertas(n), p, cid());
    if (Math.max(...filas(out)) > techo && !amontona) amontona = `${n} en ${p.id}: ${filas(out).join(",")}`;
  }
}
ok("con más terminales que sitios, ninguna columna se las lleva todas", !amontona, amontona);

const doce = filas(applyPreset(abiertas(12), de(3, 3), cid()));
ok("el caso de la queja: doce en la de nueve son cuatro por columna", doce.join() === "4,4,4", doce.join(","));

// --- con menos terminales que sitios, las columnas elegidas siguen ahí -------
// Llenando en orden, dos columnas de cuatro con cuatro terminales salían como
// UNA columna de cuatro: elegías dos columnas y te daba una.
let columnasPerdidas = "";
for (let n = 1; n <= 16; n++) {
  for (const p of REJILLA) {
    const out = filas(applyPreset(abiertas(n), p, cid()));
    const quiero = Math.min(p.rows.length, n);
    if ((out.length !== quiero || Math.max(...out) - Math.min(...out) > 1) && !columnasPerdidas) {
      columnasPerdidas = `${n} en ${p.id}: ${out.join(",")}`;
    }
  }
}
ok("cada casilla de la rejilla da sus columnas, igualadas, con cualquier número", !columnasPerdidas, columnasPerdidas);
const cuatroEnDos = filas(applyPreset(abiertas(4), de(2, 4), cid()));
ok("cuatro en dos columnas de cuatro: dos arriba y dos abajo", cuatroEnDos.join() === "2,2", cuatroEnDos.join(","));
const tresEnCuatro = filas(applyPreset(abiertas(3), de(2, 2), cid()));
ok("tres en la 2x2: la primera entera a la izquierda", tresEnCuatro.join() === "1,2", tresEnCuatro.join(","));

// --- el orden se respeta -----------------------------------------------------
const orden = applyPreset(abiertas(7), de(2, 2), cid()).flatMap((c) => c.panes);
ok("se reparten en el orden en que estaban", orden.join() === "1,2,3,4,5,6,7", orden.join(","));

// --- una grande y el resto al lado ------------------------------------------
let grandeMal = "";
for (let n = 2; n <= 16; n++) {
  const p = unaGrande(n);
  const total = (p.weights ?? []).reduce((a, b) => a + b, 0);
  const estrecha = Math.min(...(p.weights ?? []).map((w) => (w / total) * CABINA_W));
  const out = applyPreset(abiertas(n), p, cid());
  const ok1 = p.rows.reduce((a, b) => a + b, 0) === n && p.rows[0] === 1 && out[0].panes.length === 1;
  if ((!ok1 || estrecha < MIN_PANE_W || p.rows.length > MAX_COLS) && !grandeMal) {
    grandeMal = `${n}: ${p.rows.join(",")} con ${Math.round(estrecha)} px la más estrecha`;
  }
}
ok("una grande: sitio justo, la primera sola y ninguna estrecha, de 2 a 16", !grandeMal, grandeMal);
ok("una grande con cuatro es la grande y tres al lado", unaGrande(4).rows.join() === "1,3");
const grandeConDos = filas(applyPreset(abiertas(2), unaGrande(6), cid()));
ok("la de una grande con menos terminales no deja columnas vacías", grandeConDos.join() === "1,1", grandeConDos.join(","));

// --- la que elige sola: justa para cada número ------------------------------
const esperadas: Record<number, string> = {
  1: "1",
  2: "1,1",
  3: "1,1,1",
  4: "2,2",
  5: "1,2,2",
  6: "2,2,2",
  7: "2,2,3",
  8: "2,2,2,2",
  9: "3,3,3",
  10: "2,2,3,3",
  12: "3,3,3,3",
  16: "4,4,4,4",
};
for (const [n, rows] of Object.entries(esperadas)) {
  const p = presetFor(Number(n));
  ok(`la que elige sola para ${n}`, p.rows.join() === rows, p.rows.join(","));
}
let maloAuto = "";
for (let n = 1; n <= 30; n++) {
  const p = presetFor(n);
  const suma = p.rows.reduce((a, b) => a + b, 0);
  const ancho = CABINA_W / p.rows.length;
  if ((suma !== n || p.rows.length > MAX_COLS || ancho < MIN_PANE_W) && !maloAuto) {
    maloAuto = `${n}: ${p.rows.join(",")}, ${Math.round(ancho)} px de ancho`;
  }
  const out = filas(applyPreset(abiertas(n), p, cid()));
  if (Math.max(...out) - Math.min(...out) > 1 && !maloAuto) maloAuto = `${n}: columnas de ${out.join(",")}`;
}
ok("de 1 a 30, la que elige sola tiene sitio justo, cuatro columnas como mucho y ninguna estrecha", !maloAuto, maloAuto);
ok("diez en cuatro columnas: las de menos filas a la izquierda", equilibrada(10, 4).join() === "2,2,3,3");
ok("nunca más columnas que terminales", equilibrada(2, columnasPara(2)).length === 2 && equilibrada(1, 4).length === 1);

// --- lo apartado no deja huecos ---------------------------------------------
// Seis abiertas, dos minimizadas, y la 2x2: las cuatro que se ven llenan la
// 2x2 entera, y las dos apartadas siguen en el mosaico para cuando vuelvan.
const fuera = new Set([2, 5]);
const conApartadas = applyPreset(abiertas(6), de(2, 2), cid(), fuera);
const visto = [...fuera].reduce((c, id) => removePane(c, id), conApartadas);
ok(
  "con dos minimizadas, lo que se ve es la 2x2 sin huecos",
  filas(visto).join() === "2,2",
  filas(visto).join(","),
);
const r = rects(visto);
ok(
  "y las cuatro que se ven ocupan cada una un cuarto",
  [...r.values()].every((x) => Math.abs(x.w - 0.5) < 1e-9 && Math.abs(x.h - 0.5) < 1e-9),
);
ok(
  "las apartadas no se pierden",
  conApartadas.flatMap((c) => c.panes).sort().join() === "1,2,3,4,5,6",
);
const todas = applyPreset(abiertas(3), de(3, 1), cid(), new Set([1, 2, 3]));
ok("con todo apartado se reparte todo igual", filas(todas).join() === "1,1,1", filas(todas).join(","));

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
(globalThis as unknown as { process: { exitCode?: number } }).process.exitCode = fallos ? 1 : 0;
