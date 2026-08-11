// La cola de propuestas de la Agenda, que se revisa de una en una.
//
// El bug que esto persigue no se ve leyendo el JSX: al aceptar una nota, la
// lista se encoge por debajo y el índice se queda apuntando a otra cosa. Si se
// mueve, se salta la siguiente; si no se rescata al final, la pantalla dice
// «no queda ninguna» con diez todavía sin mirar.
//
//   npx tsc scripts/agenda-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/agenda-check.js

import { indiceValido, siguienteNota } from "../src/lib/agenda";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

// --- «Luego»: pasar a la siguiente -------------------------------------------
ok("de la primera a la segunda", siguienteNota(0, 12) === 1);
ok("por el medio", siguienteNota(5, 12) === 6);
ok(
  "la ultima vuelve a la primera",
  siguienteNota(11, 12) === 0,
  "posponer la ultima no puede echarte de la revision sin decidir nada",
);
ok("con una sola nota se queda donde esta", siguienteNota(0, 1) === 0);
ok("sin ninguna nota no se va a un indice imposible", siguienteNota(0, 0) === 0);
ok("lista vacia desde un indice alto", siguienteNota(7, 0) === 0);

// --- lo que pasa cuando la lista cambia sola ---------------------------------
ok(
  "aceptar por el medio NO mueve el indice",
  indiceValido(5, 11) === 5,
  "la siguiente ocupa ese hueco: moverlo se la saltaria",
);
ok(
  "aceptar la ULTIMA rescata el indice",
  indiceValido(11, 11) === 0,
  "es el bug: diria «no queda ninguna» con once sin mirar",
);
ok(
  "aceptar la unica que quedaba deja el indice a cero",
  indiceValido(0, 0) === 0,
  "y ahi si es verdad que no queda ninguna",
);
ok(
  "una nota nueva por detras no descoloca",
  indiceValido(3, 13) === 3,
  "un agente puede escribir en la bandeja mientras el mira esta pantalla",
);
ok("un indice negativo no se cuela", indiceValido(-1, 12) === 0);
ok("un indice muy pasado vuelve al principio", indiceValido(99, 12) === 0);
ok(
  "descartar varias seguidas desde el final converge",
  [3, 2, 1, 0].every((total, i) => indiceValido(3 - i >= total ? 0 : 3 - i, total) < Math.max(total, 1)),
  "nunca deja el indice fuera de rango",
);

// «Esta semana» ya no existe como cifra: el calendario enseña el mes entero y
// dice CUÁNDO, que es más de lo que decía el número. Sus casos viven ahora en
// scripts/calendario-check.ts.

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
