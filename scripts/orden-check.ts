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
// Cae donde lo llevas: subiendo, encima del destino; bajando, debajo. Antes
// caia siempre delante y bajar algo al final de la lista era imposible.
caso(
  "subiendolo, se queda encima del destino",
  moverProyecto(["a", "b", "c", "d"], "d", "b"),
  ["a", "d", "b", "c"],
);
caso("subirlo del todo lo pone el primero", moverProyecto(["a", "b", "c"], "c", "a"), [
  "c",
  "a",
  "b",
]);
caso("bajandolo, se queda DEBAJO del destino", moverProyecto(["a", "b", "c"], "a", "c"), [
  "b",
  "c",
  "a",
]);
caso(
  "bajarlo al ultimo lo deja el ultimo de verdad",
  moverProyecto(["a", "b", "c", "d"], "b", "d"),
  ["a", "c", "d", "b"],
);
caso("bajarlo un puesto lo intercambia con el de abajo", moverProyecto(["a", "b", "c"], "a", "b"), [
  "b",
  "a",
  "c",
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
caso(
  "y uno movido que ya no existe, tampoco",
  moverProyecto(["a", "b", "c"], "zzz", "b"),
  ["a", "b", "c"],
);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
