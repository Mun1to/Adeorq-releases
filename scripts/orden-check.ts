// Casos del orden de la barra. Se corren de verdad, no se leen:
//
//   npx tsc scripts/orden-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/orden-check.js
//
// (El porqué de ese camino, en `docs/` y en la memoria: Adeorq no tiene runner
// de tests y la lógica pura se prueba compilando a CommonJS.)

import {
  ladoDeCaida,
  moverGrupo,
  moverProyecto,
  ordenarProyectos,
  type Colocable,
} from "../src/lib/ordenBarra";

let fallos = 0;
function caso(nombre: string, real: string[], esperado: string[]) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "ok  " : "FALLA"} ${nombre}`);
  if (!ok) console.log(`      esperado: ${esperado.join(", ")}\n      real:     ${real.join(", ")}`);
}

function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
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

// --- de que lado cae, que es lo que pinta la raya ----------------------------
//
// El caso que importa: la raya iba SIEMPRE arriba del destino, y bajando algo
// cae debajo. La raya mentia la mitad de las veces, y por eso se apoya en los
// mismos indices que `moverProyecto` en vez de en una regla escrita en el CSS.
ok("subiendolo, la raya va ARRIBA del destino", ladoDeCaida(["a", "b", "c"], "c", "a") === "antes");
ok(
  "bajandolo, la raya va DEBAJO: es donde acaba de verdad",
  ladoDeCaida(["a", "b", "c"], "a", "c") === "despues",
);
ok("un puesto arriba", ladoDeCaida(["a", "b", "c"], "b", "a") === "antes");
ok("un puesto abajo", ladoDeCaida(["a", "b", "c"], "b", "c") === "despues");
ok("sobre si mismo no se pinta nada", ladoDeCaida(["a", "b", "c"], "b", "b") === null);
ok(
  "ni con un destino que ya no esta en la lista",
  ladoDeCaida(["a", "b", "c"], "a", "zzz") === null && ladoDeCaida(["a", "b"], "zzz", "a") === null,
);
{
  // La raya y el resultado no pueden discrepar NUNCA: si dice "despues", el
  // movido tiene que quedar justo detras del destino en la lista de verdad.
  const visibles = ["a", "b", "c", "d"];
  let coinciden = true;
  for (const m of visibles)
    for (const d of visibles) {
      const lado = ladoDeCaida(visibles, m, d);
      if (!lado) continue;
      const fin = moverProyecto(visibles, m, d);
      const esperado = lado === "despues" ? fin.indexOf(d) + 1 : fin.indexOf(d) - 1;
      if (fin.indexOf(m) !== esperado) coinciden = false;
    }
  ok("la raya y el resultado dicen lo mismo en las 12 combinaciones", coinciden);
}

// --- los grupos de sesiones --------------------------------------------------
//
// Viven TODOS en un mismo array (`ui.groups`) y su orden en la barra es el de
// ese array. Las dos trampas: calcular el movimiento contando grupos de otros
// proyectos que ni se ven, y perder por el camino los de los demás.
const g = (id: string, project = "A") => ({ id, project });
const ids = (l: { id: string }[]) => l.map((o) => o.id);

caso(
  "un grupo se mueve igual que un proyecto",
  ids(moverGrupo([g("x"), g("y"), g("z")], "A", "z", "x")),
  ["z", "x", "y"],
);
caso(
  "y bajandolo cae debajo, como el resto de la barra",
  ids(moverGrupo([g("x"), g("y"), g("z")], "A", "x", "z")),
  ["y", "z", "x"],
);
caso(
  "los grupos de otro proyecto ni se mueven ni se pierden",
  ids(moverGrupo([g("a1"), g("b1", "B"), g("a2"), g("b2", "B"), g("a3")], "A", "a3", "a1")),
  ["a3", "b1", "a1", "b2", "a2"],
);
{
  // El de en medio pertenece a otro proyecto: si el movimiento se calculara
  // sobre la lista entera, contaria como un puesto y el arrastrado caeria mal.
  const todos = [g("a1"), g("otro", "B"), g("a2")];
  caso(
    "un grupo ajeno intercalado no descoloca la cuenta",
    ids(moverGrupo(todos, "A", "a1", "a2")),
    ["a2", "otro", "a1"],
  );
  ok(
    "y el de otro proyecto sigue en SU sitio del array",
    moverGrupo(todos, "A", "a1", "a2")[1].id === "otro",
  );
}
caso(
  "un proyecto sin grupos no rompe nada",
  ids(moverGrupo([g("b1", "B")], "A", "x", "y")),
  ["b1"],
);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
