// El scroll de las terminales, que se iba solo.
//
//   npx tsc scripts/scroll-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/scroll-check.js

import { hayQueAjustar, volverA } from "../src/lib/scrollTerm";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

// --- cuándo se ajusta --------------------------------------------------------
ok(
  "si la rejilla queda igual NO se toca nada (el fallo que movia el scroll)",
  hayQueAjustar({ cols: 120, rows: 30 }, { cols: 120, rows: 30 }) === false,
);
ok(
  "una fila mas si obliga a ajustar",
  hayQueAjustar({ cols: 120, rows: 30 }, { cols: 120, rows: 31 }) === true,
);
ok(
  "y una columna mas tambien",
  hayQueAjustar({ cols: 120, rows: 30 }, { cols: 121, rows: 30 }) === true,
);
ok(
  "sin medida propuesta no se ajusta, en vez de ajustar a cero",
  hayQueAjustar({ cols: 120, rows: 30 }, undefined) === false &&
    hayQueAjustar({ cols: 120, rows: 30 }, { cols: 0, rows: 0 }) === false,
);

// --- adonde se vuelve --------------------------------------------------------
ok(
  "viendo el final, se vuelve al final aunque hayan entrado lineas",
  volverA({ baseY: 500, viewportY: 500 }, 540) === null,
);
ok(
  "leyendo hacia arriba, se conserva la distancia al final",
  volverA({ baseY: 500, viewportY: 488 }, 540) === 528,
  "12 lineas por encima del final, antes y despues",
);
ok(
  "si el texto encoge al rehacerse, no se sale por arriba",
  volverA({ baseY: 500, viewportY: 100 }, 60) === 0,
  "400 por encima del final en un buffer que ahora tiene 60",
);
ok(
  "arriba del todo sigue estando arriba del todo cuando cabe",
  volverA({ baseY: 500, viewportY: 0 }, 500) === 0,
);
// Mientras llega texto, viewportY puede ir por delante de baseY un instante.
ok(
  "un viewport adelantado cuenta como estar al final, no como saltar",
  volverA({ baseY: 500, viewportY: 503 }, 540) === null,
);
ok(
  "una terminal recien abierta, sin historial, no se mueve",
  volverA({ baseY: 0, viewportY: 0 }, 0) === null,
);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
