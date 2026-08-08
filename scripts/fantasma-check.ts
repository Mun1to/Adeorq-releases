// Dónde se coloca la copia que llevas al arrastrar. Cuenta pura, se corre:
//
//   npx tsc scripts/fantasma-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/fantasma-check.js

import { posicion } from "../src/lib/fantasma";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

// Una fila de 240x40 que empieza en (20, 100), agarrada por su centro.
const caja = { left: 20, top: 100, width: 240, height: 40 };
const agarre = { x: 140, y: 120 };
// La barra: 280 de ancho, alta como la ventana.
const barra = { left: 0, top: 0, right: 280, bottom: 800 };

// --- sin corral ---------------------------------------------------------------
{
  const p = posicion(caja, agarre, { x: 140, y: 120 });
  ok("sin mover el raton, la copia cae justo encima del original", p.x === 20 && p.y === 100);
}
{
  const p = posicion(caja, agarre, { x: 150, y: 130 });
  ok(
    "conserva el punto por el que la cogiste",
    p.x === 30 && p.y === 110,
    "diez a la derecha y diez abajo, ni un salto al centro",
  );
}

// --- con corral ---------------------------------------------------------------
{
  const p = posicion(caja, agarre, { x: 900, y: 400 }, barra);
  ok(
    "llevada a la derecha del todo, se queda dentro de la barra",
    p.x === 40,
    "280 de ancho menos los 240 de la fila",
  );
}
{
  const p = posicion(caja, agarre, { x: -500, y: 400 }, barra);
  ok("y por la izquierda tampoco se sale", p.x === 0);
}
{
  const p = posicion(caja, agarre, { x: 140, y: -300 }, barra);
  ok("ni por arriba", p.y === 0);
}
{
  const p = posicion(caja, agarre, { x: 140, y: 5000 }, barra);
  ok("ni por abajo, contando su propio alto", p.y === 760);
}
{
  const p = posicion(caja, agarre, { x: 150, y: 300 }, barra);
  ok("dentro del corral se mueve libremente", p.x === 30 && p.y === 280);
}
{
  // La barra se puede estrechar a mano, y un corral más angosto que la propia
  // fila no puede empujarla FUERA por el otro lado.
  const angosta = { left: 0, top: 0, right: 100, bottom: 800 };
  const p = posicion(caja, agarre, { x: 900, y: 400 }, angosta);
  ok("un corral más estrecho que la fila la pega al borde, no la expulsa", p.x === 0);
}
{
  // La barra no siempre empieza en cero: en el modo tira o con la ventana
  // movida, su borde izquierdo tiene un desplazamiento.
  const movida = { left: 60, top: 40, right: 340, bottom: 800 };
  const p = posicion(caja, agarre, { x: -100, y: -100 }, movida);
  ok("el corral respeta de dónde empieza la barra", p.x === 60 && p.y === 40);
}

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
