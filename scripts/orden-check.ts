// Casos del orden de la barra. Se corren de verdad, no se leen:
//
//   npx tsc scripts/orden-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/orden-check.js
//
// (El porqué de ese camino, en `docs/` y en la memoria: Adeorq no tiene runner
// de tests y la lógica pura se prueba compilando a CommonJS.)

import {
  alternarFijada,
  colocarSuelta,
  conOrdenManual,
  desplazamiento,
  huecoEn,
  leerMarcaDeColocar,
  marcaDeColocar,
  fijadasDe,
  sinFijadas,
  zonaDeFila,
  ladoDeCaida,
  moverGrupo,
  moverProyecto,
  ordenGuardado,
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

// --- fijar sesiones arriba ----------------------------------------------------
// Munir lo pidió tres veces. Las sesiones se ordenan por actividad, así que la
// conversación que abres cada día se te mueve sola y hay que buscarla. Fijarla
// la saca de su proyecto y la sube a una sección propia en la cabeza.

const ses = (id: string) => ({ id });
const idsDe = (l: { id: string }[]) => l.map((x) => x.id).join(",");
const lista4 = [ses("a"), ses("b"), ses("c"), ses("d")];

ok("sin nada fijado, la sección está vacía", fijadasDe(lista4, []).length === 0);
ok("una fijada sale ella sola", idsDe(fijadasDe(lista4, ["c"])) === "c");
ok(
  "dos salen en el orden en que las fijaste, no en el de la lista",
  idsDe(fijadasDe(lista4, ["d", "b"])) === "d,b",
  "si mandara la lista saldrían b,d y fijar no serviría de nada",
);
ok(
  "un id fijado que ya no está en la lista no inventa una fila",
  idsDe(fijadasDe([ses("a"), ses("b")], ["fantasma", "b"])) === "b",
  "una sesión borrada sigue en `pinned` hasta que se toca la barra",
);

ok("sin nada fijado, el proyecto queda igual", idsDe(sinFijadas(lista4, [])) === "a,b,c,d");
ok(
  "lo fijado sale de la lista de su proyecto",
  idsDe(sinFijadas(lista4, ["b"])) === "a,c,d",
  "si no, la misma sesión se vería en dos sitios y parecerían dos",
);
ok(
  "fijarlas todas deja el proyecto sin lista, no lo rompe",
  sinFijadas(lista4, ["a", "b", "c", "d"]).length === 0,
);
{
  // Las dos funciones son complementarias: juntas tienen que dar exactamente
  // las mismas sesiones, sin perder ninguna ni contar una dos veces.
  const fij = ["c", "a"];
  const juntas = [...fijadasDe(lista4, fij), ...sinFijadas(lista4, fij)];
  ok(
    "entre la sección y los proyectos están todas, y una sola vez",
    juntas.length === 4 && new Set(juntas.map((x) => x.id)).size === 4,
  );
}

ok("fijar la primera vez la añade", alternarFijada([], "a").join() === "a");
ok(
  "la nueva entra la ÚLTIMA de las fijadas",
  alternarFijada(["a", "b"], "c").join() === "a,b,c",
  "si entrara primera, fijar una tercera movería de sitio a las dos de antes",
);
ok("volver a pulsarla la quita", alternarFijada(["a", "b"], "a").join() === "b");
ok("quitar la única deja la sección vacía", alternarFijada(["a"], "a").length === 0);
ok(
  "es un conmutador: una que no estaba se FIJA",
  alternarFijada(["a"], "z").join() === "a,z",
  "el menú enseña «Fijar» o «Quitar» según el estado, así que solo se llama en el sentido que toca",
);
ok(
  "fijar y quitar deja las cosas como estaban",
  alternarFijada(alternarFijada(["x"], "a"), "a").join() === "x",
);

// --- colocar sueltas a mano: las zonas de una fila ----------------------------
// Sobre una fila caben dos gestos (agrupar y colocar) y los separa DÓNDE
// sueltas. Munir eligió esta forma con las tres opciones delante.

ok("el 10 % de arriba coloca ANTES", zonaDeFila(102, 100, 40) === "antes");
ok("el 10 % de abajo coloca DESPUES", zonaDeFila(138, 100, 40) === "despues");
ok("el centro agrupa, como siempre", zonaDeFila(120, 100, 40) === "centro");
ok(
  "justo en el borde del 30 % ya es centro, no lado",
  zonaDeFila(112, 100, 40) === "centro" && zonaDeFila(128, 100, 40) === "centro",
  "40 px de alto: el 30 % son 12, así que 112 y 128 son las fronteras",
);
ok("un pelo antes de la frontera sí es lado", zonaDeFila(111, 100, 40) === "antes");
ok(
  "una fila sin medir agrupa, que es lo que la barra hacía antes de esto",
  zonaDeFila(50, 0, 0) === "centro",
);
ok(
  "el borde es configurable: al 50 % casi no queda centro",
  zonaDeFila(119, 100, 40, 0.5) === "antes" && zonaDeFila(121, 100, 40, 0.5) === "despues",
  "en el píxel central exacto sigue saliendo «centro», porque las dos comparaciones son estrictas",
);

ok(
  "colocar una suelta encima de otra",
  colocarSuelta(["a", "b", "c"], "c", "a", "antes").join() === "c,a,b",
);
ok(
  "y debajo",
  colocarSuelta(["a", "b", "c"], "a", "c", "despues").join() === "b,c,a",
);
ok(
  "bajar una al final del todo se puede",
  colocarSuelta(["a", "b", "c"], "a", "c", "despues").at(-1) === "a",
  "con la regla vieja de los proyectos esto era imposible: caía siempre delante",
);
ok("sobre sí misma no pasa nada", colocarSuelta(["a", "b"], "a", "a", "antes").join() === "a,b");
ok(
  "un destino que ya no está deja el orden como estaba",
  colocarSuelta(["a", "b"], "a", "zzz", "antes").join() === "a,b",
);
ok(
  "no pierde ni duplica ninguna",
  colocarSuelta(["a", "b", "c", "d"], "b", "d", "despues").join() === "a,c,d,b",
);

// El orden manual se guarda entero, y lo que llegue después va DETRÁS: una
// sesión nueva no puede colarse en medio de lo que ya colocaste.
ok(
  "sin orden manual, la lista se queda como venía",
  conOrdenManual([ses("a"), ses("b")], []).map((x) => x.id).join() === "a,b",
);
ok(
  "con orden manual manda el tuyo",
  conOrdenManual([ses("a"), ses("b"), ses("c")], ["c", "a"]).map((x) => x.id).join() === "c,a,b",
);
ok(
  "lo que aparezca después va detrás, a la vista, no intercalado",
  conOrdenManual([ses("nueva"), ses("a"), ses("b")], ["b", "a"]).map((x) => x.id).join() ===
    "b,a,nueva",
);
ok(
  "un orden guardado de sesiones que ya no existen no descoloca nada",
  conOrdenManual([ses("a"), ses("b")], ["zzz", "yyy"]).map((x) => x.id).join() === "a,b",
);

// Arrastrar dentro de la sección de fijadas usa `colocarSuelta`, el mismo
// mecanismo que las sueltas: una sola regla de colocar a mano para toda la
// barra, y la raya que se ve al arrastrar sale del mismo lado que se le pasa.
ok(
  "bajando una fijada, cae debajo del destino",
  colocarSuelta(["a", "b", "c"], "a", "c", "despues").join() === "b,c,a",
);
ok(
  "subiéndola, cae encima",
  colocarSuelta(["a", "b", "c"], "c", "a", "antes").join() === "c,a,b",
);

// --- el hueco que se abre al arrastrar ----------------------------------------
// Munir rechazó dos veces la raya y pidió esto: «que cuando lo muevas se mueva
// lo que tiene cerca». Y al probarlo encontró el fallo de la primera versión:
// «no tiene que ponerse encima de otra, sino ajustar bien los espacios que ha
// dejado la que arrastras». La clave está en ese «ha dejado»: la fila que
// llevas SALE del flujo, así que todo se cuenta sin ella.

{
  // Llevas "b" en la mano. La lista que queda en pantalla es a, c, d, e.
  const sin = ["a", "c", "d", "e"];
  ok("soltando en el borde de arriba de «d», el hueco se abre en su puesto", huecoEn(sin, "d", "antes") === 2);
  ok("y en el de abajo, justo después", huecoEn(sin, "d", "despues") === 3);
  ok("sobre la primera, el hueco va al principio", huecoEn(sin, "a", "antes") === 0);
  ok("bajo la última, al final del todo", huecoEn(sin, "e", "despues") === 4);
  ok("un destino que ya no está no abre nada", huecoEn(sin, "zzz", "antes") === -1);
}
{
  // Con el hueco en el puesto 2, bajan la 2 y las de después. Ni una más.
  const bajan = [0, 1, 2, 3].map((i) => desplazamiento(i, 2));
  ok("bajan solo las que están del hueco para abajo", bajan.join() === "0,0,1,1");
  ok("el hueco al principio baja a todas", [0, 1, 2].every((i) => desplazamiento(i, 0) === 1));
  ok("y al final no baja a ninguna", [0, 1, 2].every((i) => desplazamiento(i, 3) === 0));
}
{
  // EL QUE IMPORTA: el hueco que ves y el sitio que ocupa al soltar tienen que
  // ser el mismo puesto. La raya ya mintió una vez por no cumplir esto, y la
  // primera versión del hueco también, con otra cara.
  const lista = ["a", "b", "c", "d", "e"];
  let discrepan = 0;
  for (const m of lista)
    for (const d of lista) {
      if (m === d) continue;
      for (const lado of ["antes", "despues"] as const) {
        const sin = lista.filter((x) => x !== m);
        const donde = huecoEn(sin, d, lado);
        const fin = colocarSuelta(lista, m, d, lado).indexOf(m);
        if (donde !== fin) discrepan++;
      }
    }
  ok(
    "el hueco y el sitio final coinciden en las 40 combinaciones",
    discrepan === 0,
    "si esto falla, la barra vuelve a enseñar una cosa y hacer otra",
  );
}

// Colocar y TRAER son el mismo gesto visto desde las dos listas. Una sesión
// fijada arrastrada abajo, entre las sueltas, tiene que entrar en esa lista; si
// `colocarSuelta` exigiera que ya perteneciera, ese arrastre no haría nada y la
// sesión se quedaría clavada arriba, que es lo que pasaba (Munir, 2026-08-09).
ok(
  "una que no estaba en la lista ENTRA donde la sueltas",
  colocarSuelta(["a", "b", "c"], "nueva", "b", "antes").join() === "a,nueva,b,c",
);
ok(
  "y por el otro lado del destino, igual",
  colocarSuelta(["a", "b", "c"], "nueva", "b", "despues").join() === "a,b,nueva,c",
);
ok(
  "entrar al final de la lista se puede",
  colocarSuelta(["a", "b"], "nueva", "b", "despues").join() === "a,b,nueva",
);
ok(
  "entrar la primera, también",
  colocarSuelta(["a", "b"], "nueva", "a", "antes").join() === "nueva,a,b",
);
ok(
  "pero un destino que no existe sigue sin tocar nada",
  colocarSuelta(["a", "b"], "nueva", "zzz", "antes").join() === "a,b",
  "sin esto, una sesión entraría en una lista por un destino inventado",
);
ok(
  "y nunca se duplica: si ya estaba, se mueve",
  colocarSuelta(["a", "b", "c"], "a", "c", "despues").join() === "b,c,a",
);


// ── EL ORDEN GUARDADO, UNA LISTA POR SITIO ──────────────────────────────────
// Hasta la 0.9.99 solo se guardaba el del cajón del final (`sueltasOrder`), y
// por eso arrastrar una sesión dentro de un proyecto no colocaba nada: esa
// lista no tenía dónde escribir su orden (Munir, 2026-08-12).
ok(
  "lo viejo se sube a su clave en vez de perderse",
  JSON.stringify(ordenGuardado({ sueltasOrder: ["a", "b"] })) === '{"sueltas":["a","b"]}',
  "sin esto, quien tuviera sus sueltas colocadas a mano se las encuentra barajadas",
);
ok(
  "y si ya hay clave nueva, manda ella",
  JSON.stringify(ordenGuardado({ sueltasOrder: ["x"], ordenLista: { sueltas: ["a"] } }))
    === '{"sueltas":["a"]}',
);
ok(
  "cada lista guarda la suya",
  JSON.stringify(
    ordenGuardado({ ordenLista: { "p:Adeorq": ["a"], "g:7": ["b"], sueltas: ["c"] } }),
  ) === '{"p:Adeorq":["a"],"g:7":["b"],"sueltas":["c"]}',
);
ok("sin nada guardado, vacío", JSON.stringify(ordenGuardado({})) === "{}");
ok("y un fichero a medias no revienta", JSON.stringify(ordenGuardado(null)) === "{}");
ok(
  "una clave con basura dentro se descarta entera",
  JSON.stringify(ordenGuardado({ ordenLista: { "p:A": ["ok"], "p:B": [1, 2], "p:C": "no" } }))
    === '{"p:A":["ok"]}',
  "un id que no es texto acabaría comparándose con ids de verdad y no casaría nunca",
);
ok(
  "un ordenLista que llega como array se ignora",
  JSON.stringify(ordenGuardado({ ordenLista: ["a", "b"] })) === "{}",
);

// --- la marca de colocar, ida y vuelta -----------------------------------
//
// El bug que la trajo aquí: la lista de destino viajaba DENTRO de la marca y se
// leía con un `split(":")` de cuatro trozos, así que `p:Adeorq` se partía por su
// mitad y soltar dentro de un proyecto no hacía nada. El cajón del final se
// salvaba solo porque su clave, `sueltas`, es la única sin dos puntos.

const ID = "d721543f-c8f8-468a-87ac-863b6e536c31";

ok(
  "la marca se lee tal y como se escribió",
  JSON.stringify(leerMarcaDeColocar(marcaDeColocar("antes", ID)))
    === JSON.stringify({ lado: "antes", fila: ID }),
);
ok(
  "y por el otro lado igual",
  leerMarcaDeColocar(marcaDeColocar("despues", ID))?.lado === "despues",
);
ok(
  "un id con dos puntos dentro llega ENTERO",
  leerMarcaDeColocar(marcaDeColocar("antes", "raro:con:puntos"))?.fila === "raro:con:puntos",
  "el id de una sesión no es siempre un uuid: las de otros clientes salen de su propio JSON",
);
ok(
  "las otras marcas de la barra no son de colocar",
  ["s:abc", `p:${"Adeorq"}`, "sueltas", "fuera:Adeorq", "g:1", ""]
    .every((m) => leerMarcaDeColocar(m) === null),
  "si una de estas colara, soltar para agrupar acabaría reordenando",
);
ok(
  "una marca a medias no se inventa un lado",
  leerMarcaDeColocar("r:antes") === null && leerMarcaDeColocar("r:arriba:x") === null,
);

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
