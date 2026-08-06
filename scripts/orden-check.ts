// Casos del orden de la barra. Se corren de verdad, no se leen:
//
//   npx tsc scripts/orden-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/orden-check.js
//
// (El porqué de ese camino, en `docs/` y en la memoria: Adeorq no tiene runner
// de tests y la lógica pura se prueba compilando a CommonJS.)

import { moverProyecto, ordenarProyectos, type Colocable } from "../src/lib/ordenBarra";

let fallos = 0;
function caso(nombre: string, real: string[], esperado: string[]) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "ok  " : "FALLA"} ${nombre}`);
  if (!ok) console.log(`      esperado: ${esperado.join(", ")}\n      real:     ${real.join(", ")}`);
}

const p = (name: string, hasLive = false, minHours = 100, hasGit = true): Colocable => ({
  name,
  hasLive,
  minHours,
  hasGit,
});

const nombres = (l: Colocable[]) => l.map((x) => x.name);

// --- sin tocar nada: manda la actividad -------------------------------------
const barra = [
  p("Adeorq", false, 50),
  p("Orquio", true, 90),
  p("froede", false, 3),
  p("zeta", false, 3, false),
];
caso(
  "sin orden manual, lo abierto va primero y luego lo mas reciente",
  nombres(ordenarProyectos(barra, [])),
  ["Orquio", "froede", "zeta", "Adeorq"],
);
caso(
  "a igualdad de horas, el repo de git pesa mas que el que no lo es",
  nombres(ordenarProyectos([p("zeta", false, 3, false), p("froede", false, 3)], [])),
  ["froede", "zeta"],
);

// --- con orden manual: manda el suyo, y ya no se mueve nada -----------------
caso(
  "lo colocado a mano va primero y en TU orden, aunque otro tenga algo abierto",
  nombres(ordenarProyectos(barra, ["Adeorq", "froede"])),
  ["Adeorq", "froede", "Orquio", "zeta"],
);
caso(
  "lo que no has colocado va detras, y entre ellos sigue mandando la actividad",
  nombres(ordenarProyectos(barra, ["zeta"])),
  ["zeta", "Orquio", "froede", "Adeorq"],
);

// El que de verdad importa: la barra NO se mueve porque cambie la actividad.
const despues = [
  p("Adeorq", true, 0), // ahora Adeorq tiene algo abierto...
  p("Orquio", false, 90),
  p("froede", false, 3),
  p("zeta", false, 3, false),
];
caso(
  "con orden manual, abrir algo NO recoloca la barra",
  nombres(ordenarProyectos(despues, ["Orquio", "zeta", "Adeorq", "froede"])),
  ["Orquio", "zeta", "Adeorq", "froede"],
);

// --- mover ------------------------------------------------------------------
caso(
  "soltarlo encima de otro lo pone justo delante de ese",
  moverProyecto(["a", "b", "c", "d"], "d", "b"),
  ["a", "d", "b", "c"],
);
caso("soltarlo el primero lo pone el primero", moverProyecto(["a", "b", "c"], "c", "a"), [
  "c",
  "a",
  "b",
]);
caso("soltarlo sobre si mismo no cambia nada", moverProyecto(["a", "b", "c"], "b", "b"), [
  "a",
  "b",
  "c",
]);
caso(
  "un destino que ya no existe deja el orden como estaba",
  moverProyecto(["a", "b", "c"], "a", "zzz"),
  ["a", "b", "c"],
);
// Mover hacia abajo: lo mueve DEBAJO del destino no, delante; es la misma regla
// en las dos direcciones y hay que dejarla escrita para no "arreglarla" luego.
caso("moverlo hacia abajo lo deja delante del destino", moverProyecto(["a", "b", "c"], "a", "c"), [
  "b",
  "a",
  "c",
]);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
