// Las barras de arrastre del mosaico, con una terminal apartada de por medio.
//
//   npx tsc scripts/mosaico-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/mosaico-check.js
//
// El fallo que motivó esto: los paneles se colocan con el mosaico VISIBLE y las
// barras se calculaban con el completo, así que con una sola terminal apartada
// salía una barra flotando en mitad de otra terminal y arrastrarla estiraba la
// columna equivocada (Munir, 2026-08-07).

import {
  aplicarVistas,
  rects,
  removePane,
  resizeCol,
  resizeRow,
  type Col,
} from "../src/lib/layout";

let fallos = 0;
function ok(nombre: string, condicion: boolean, detalle = "") {
  if (!condicion) fallos++;
  console.log(`${condicion ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Tres columnas de una terminal cada una. */
const tres = (): Col[] => [
  { cid: 1, w: 1, panes: [10], hs: [1] },
  { cid: 2, w: 1, panes: [20], hs: [1] },
  { cid: 3, w: 1, panes: [30], hs: [1] },
];

// --- lo que se ve cuando apartas una ---------------------------------------
const visto = removePane(tres(), 20); // apartada la del MEDIO, el caso malo
ok("apartar una del medio deja dos columnas a la vista", visto.length === 2);
ok(
  "y las dos que quedan se reparten la pantalla entera",
  r3(rects(visto).get(10)!.w) === 0.5 && r3(rects(visto).get(30)!.x) === 0.5,
  `10 ocupa ${r3(rects(visto).get(10)!.w)} y 30 empieza en ${r3(rects(visto).get(30)!.x)}`,
);

// La barra que se ve es la número 0 del mosaico VISIBLE, y esa separa la
// columna 1 de la 3. Aplicada al mosaico completo, la 0 separa la 1 de la 2,
// que es la apartada: ese era el bug, y aquí queda escrito.
const malo = resizeCol(tres(), 0, 0.1);
ok(
  "el bug de antes: sobre el mosaico completo, esa misma barra mueve la columna apartada",
  r3(malo[1].w) !== 1 && r3(malo[2].w) === 1,
  `columna apartada ${r3(malo[1].w)}, la de la derecha ${r3(malo[2].w)} (no se entera)`,
);

// --- el arreglo -------------------------------------------------------------
const tras = aplicarVistas(tres(), resizeCol(visto, 0, 0.1));
ok(
  "estirando la barra visible se mueven las DOS que se ven",
  r3(tras[0].w) > 1 && r3(tras[2].w) < 1,
  `izquierda ${r3(tras[0].w)}, derecha ${r3(tras[2].w)}`,
);
ok(
  "y la apartada conserva su medida, para recuperarla al volver",
  tras[1].w === 1,
);
ok(
  "el ancho total no se infla ni se encoge",
  r3(tras.reduce((a, c) => a + c.w, 0)) === 3,
  `suma ${r3(tras.reduce((a, c) => a + c.w, 0))}`,
);

// --- alturas: la columna con dos terminales, una de ellas apartada ----------
const conFilas = (): Col[] => [
  { cid: 1, w: 1, panes: [10, 11, 12], hs: [1, 1, 1] },
  { cid: 2, w: 1, panes: [20], hs: [1] },
];
const vistoF = removePane(conFilas(), 11); // la de en medio de la columna
const trasF = aplicarVistas(conFilas(), resizeRow(vistoF, 0, 0, 0.1));
ok(
  "el alto se copia por id de panel, no por posicion",
  r3(trasF[0].hs[0]) > 1 && r3(trasF[0].hs[2]) < 1,
  `arriba ${r3(trasF[0].hs[0])}, apartada ${r3(trasF[0].hs[1])}, abajo ${r3(trasF[0].hs[2])}`,
);
ok("la fila apartada mantiene su alto", trasF[0].hs[1] === 1);

// --- sin nada apartado, todo sigue exactamente igual que antes --------------
const igual = aplicarVistas(tres(), resizeCol(tres(), 0, 0.1));
const directo = resizeCol(tres(), 0, 0.1);
ok(
  "sin nada apartado, el camino nuevo da lo mismo que el de siempre",
  JSON.stringify(igual) === JSON.stringify(directo),
);

// --- casos de borde ---------------------------------------------------------
ok(
  "una vista vacia no toca nada",
  JSON.stringify(aplicarVistas(tres(), [])) === JSON.stringify(tres()),
);
ok(
  "una columna que ya no existe en el mosaico real se ignora",
  aplicarVistas(tres(), [{ cid: 99, w: 5, panes: [1], hs: [1] }])[0].w === 1,
);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
