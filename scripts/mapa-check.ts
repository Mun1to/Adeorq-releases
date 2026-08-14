// El mapa de «cómo funciona el proyecto». Se corre de verdad, no se lee:
//
//   npx tsc scripts/mapa-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/mapa-check.js
//
// Lo que entra aquí lo escribe un modelo leyendo código, así que la mitad de
// las pruebas son sobre BASURA: una flecha hacia una pieza que no existe, una
// capa inventada, cuarenta cajas. Eso no puede llegar al dibujo, y comprobarlo
// mirando una captura no vale, porque una flecha que muere en el aire se ve
// «casi bien».
//
// La otra mitad es el orden de las columnas. Que ordenar reduzca los cruces se
// AFIRMA con un número (`cruces`), no se cree mirando: fue exactamente el
// fallo que Munir llamó confuso el 2026-08-14.

import {
  CAPAS,
  HUECO_X,
  NOMBRE_CAPA,
  TOPE_PIEZAS,
  TOPE_FLECHAS,
  TOPE_CAMINOS,
  TOPE_PASOS,
  colocar,
  cruces,
  esqueletoParaElCapataz,
  leerMapa,
  posiciones,
  posicionesRadiales,
  grado,
  RADIO_BASE,
  RADIO_PASO,
  type Mapa,
} from "../src/lib/mapa";

declare const process: { exit(n: number): void };

let fallos = 0;
function ok(nombre: string, cond: boolean, extra = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok   " : "FALLO"} ${nombre}${extra ? "  " + extra : ""}`);
}

/* ── 1. Lo que devuelve el Capataz, bien escrito ─────────────────────────── */

const BUENO = JSON.stringify({
  resumen: "Una app de escritorio con interfaz web y núcleo nativo.",
  piezas: [
    { id: "app", nombre: "Escritorio", capa: "interfaz", que: "Organiza los paneles", donde: "src/App.tsx" },
    { id: "pty", nombre: "Terminales", capa: "nucleo", que: "Abre el proceso", donde: "src-tauri/src/pty.rs" },
    { id: "cli", nombre: "CLI de IA", capa: "fuera", que: "Hace el trabajo", donde: "claude.exe" },
  ],
  flechas: [
    { de: "app", a: "pty", que: "abre una terminal" },
    { de: "pty", a: "cli", que: "lanza el proceso" },
  ],
});

const m = leerMapa(BUENO)!;
ok("un mapa bien escrito se lee entero", !!m && m.piezas.length === 3 && m.flechas.length === 2);
ok("el resumen llega", m.resumen.startsWith("Una app"));
ok("la capa se respeta", m.piezas[1].capa === "nucleo");

ok("el vallado de markdown no estorba", leerMapa("```json\n" + BUENO + "\n```")!.piezas.length === 3);
ok("basura que no es JSON devuelve nada", leerMapa("no soy JSON, soy una disculpa") === null);
ok("JSON sin piezas devuelve nada", leerMapa('{"resumen":"vacío","piezas":[]}') === null);
ok("un JSON de otra cosa devuelve nada", leerMapa('{"tareas":[{"texto":"hola"}]}') === null);

/* ── 2. Lo que un modelo se inventa ──────────────────────────────────────── */

const sucio = leerMapa(
  JSON.stringify({
    piezas: [
      { id: "a", nombre: "A", capa: "interfaz", que: "", donde: "" },
      { id: "a", nombre: "A otra vez", capa: "nucleo", que: "", donde: "" },
      { id: "b", nombre: "B", capa: "sotano", que: "", donde: "" },
      { id: "", nombre: "Sin id", capa: "nucleo", que: "", donde: "" },
      { id: "c", nombre: "", capa: "nucleo", que: "", donde: "" },
    ],
    flechas: [
      { de: "a", a: "b", que: "pide" },
      { de: "a", a: "b", que: "pide otra vez" },
      { de: "a", a: "fantasma", que: "llama a nadie" },
      { de: "a", a: "a", que: "se llama sola" },
      { de: "fantasma", a: "b", que: "viene de nadie" },
    ],
  }),
)!;

ok("un id repetido no entra dos veces", sucio.piezas.filter((p) => p.id === "a").length === 1);
ok("gana la primera de las dos", sucio.piezas[0].nombre === "A");
ok("una pieza sin id se cae", !sucio.piezas.some((p) => p.nombre === "Sin id"));
ok("una pieza sin nombre se cae", !sucio.piezas.some((p) => p.id === "c"));
ok("una capa inventada va al cajón", sucio.piezas.find((p) => p.id === "b")!.capa === "otros");
ok("«otros» es una capa de verdad", (CAPAS as readonly string[]).includes("otros") && !!NOMBRE_CAPA.otros);
ok("la flecha repetida se pinta una vez", sucio.flechas.length === 1);
ok("la flecha a una pieza que no existe se cae", !sucio.flechas.some((f) => f.a === "fantasma"));
ok("la flecha desde una pieza que no existe se cae", !sucio.flechas.some((f) => f.de === "fantasma"));
ok("una pieza no se llama a sí misma", !sucio.flechas.some((f) => f.de === f.a));

const muchas = leerMapa(
  JSON.stringify({
    piezas: Array.from({ length: 40 }, (_, i) => ({
      id: `p${i}`,
      nombre: `Pieza ${i}`,
      capa: "nucleo",
      que: "hace algo",
      donde: "x.rs",
    })),
    flechas: Array.from({ length: 60 }, (_, i) => ({
      de: `p${i % 39}`,
      a: `p${(i % 39) + 1}`,
      que: "llama",
    })),
  }),
)!;
ok("hay tope de cajas", muchas.piezas.length === TOPE_PIEZAS);
ok("hay tope de hilos", muchas.flechas.length <= TOPE_FLECHAS);
ok("las flechas que sobreviven apuntan a piezas que entraron",
  muchas.flechas.every((f) => muchas.piezas.some((p) => p.id === f.de) && muchas.piezas.some((p) => p.id === f.a)));

/* ── 3. Los caminos, que vienen en la misma lectura ──────────────────────── */

const conCaminos = leerMapa(
  JSON.stringify({
    piezas: [
      { id: "app", nombre: "App", capa: "interfaz", que: "", donde: "" },
      { id: "pty", nombre: "PTY", capa: "nucleo", que: "", donde: "" },
      { id: "cli", nombre: "CLI", capa: "fuera", que: "", donde: "" },
    ],
    flechas: [],
    caminos: [
      {
        titulo: "Abres una terminal",
        porque: "Para hablar con un CLI de verdad.",
        pasos: [{ pieza: "app" }, { pieza: "pty", como: "abre una terminal" }, { pieza: "cli", como: "lanza" }],
      },
      { titulo: "Con un paso inventado", porque: "", pasos: [{ pieza: "app" }, { pieza: "fantasma" }, { pieza: "cli", como: "sigue" }] },
      { titulo: "Se queda en uno", porque: "", pasos: [{ pieza: "app" }, { pieza: "fantasma" }] },
      { titulo: "", porque: "sin título", pasos: [{ pieza: "app" }, { pieza: "cli" }] },
      { titulo: "Repetida seguida", porque: "", pasos: [{ pieza: "app" }, { pieza: "app" }, { pieza: "cli" }] },
    ],
  }),
)!;

ok("el camino bueno entra", conCaminos.caminos[0]?.titulo === "Abres una terminal" && conCaminos.caminos[0].pasos.length === 3);
ok("el primer paso no lleva etiqueta", conCaminos.caminos[0].pasos[0].como === undefined);
ok("los demás sí", conCaminos.caminos[0].pasos[1].como === "abre una terminal");
ok("un paso inventado se salta y el camino sigue",
  conCaminos.caminos[1]?.titulo === "Con un paso inventado" && conCaminos.caminos[1].pasos.length === 2);
ok("un camino que se queda en un paso se cae", !conCaminos.caminos.some((c) => c.titulo === "Se queda en uno"));
ok("un camino sin título se cae", !conCaminos.caminos.some((c) => !c.titulo));
ok("dos pasos seguidos a la misma pieza son uno",
  conCaminos.caminos.find((c) => c.titulo === "Repetida seguida")!.pasos.length === 2);
ok("sin caminos, lista vacía y no explota", m.caminos.length === 0);

/** El modelo a veces escribe «recorridos» en vez de «caminos»: se aceptan los
 *  dos, porque perder la mitad de una lectura de tres minutos por una palabra
 *  sería tirar el trabajo bueno. */
const conOtroNombre = leerMapa(
  JSON.stringify({
    piezas: [
      { id: "a", nombre: "A", capa: "nucleo", que: "", donde: "" },
      { id: "b", nombre: "B", capa: "fuera", que: "", donde: "" },
    ],
    recorridos: [{ titulo: "Va", porque: "", pasos: [{ pieza: "a" }, { pieza: "b", como: "pide" }] }],
  }),
)!;
ok("«recorridos» vale igual que «caminos»", conOtroNombre.caminos.length === 1);

const muchosCaminos = leerMapa(
  JSON.stringify({
    piezas: [
      { id: "a", nombre: "A", capa: "nucleo", que: "", donde: "" },
      { id: "b", nombre: "B", capa: "fuera", que: "", donde: "" },
    ],
    caminos: Array.from({ length: 12 }, (_, i) => ({
      titulo: `Camino ${i}`,
      porque: "",
      pasos: Array.from({ length: 10 }, (_, j) => ({ pieza: j % 2 ? "b" : "a", como: "x" })),
    })),
  }),
)!;
ok("hay tope de caminos", muchosCaminos.caminos.length === TOPE_CAMINOS);
ok("hay tope de pasos", muchosCaminos.caminos.every((c) => c.pasos.length <= TOPE_PASOS));

/* ── 4. La colocación: columnas por capa y el orden que quita cruces ─────── */

const columnas = colocar(m);
ok("una capa vacía no saca columna", columnas.length === 3 && !columnas.some((c) => c.capa === "gente"));
ok("las columnas van en el orden del recorrido",
  columnas.map((c) => c.capa).join(",") === "interfaz,nucleo,fuera");

/** Un mapa hecho para cruzarse: en el orden en que lo escribe el modelo, el
 *  primero de la izquierda habla con el último de la derecha y al revés. */
const CRUZADO: Mapa = {
  resumen: "",
  caminos: [],
  piezas: [
    { id: "i1", nombre: "I1", capa: "interfaz", que: "", donde: "" },
    { id: "i2", nombre: "I2", capa: "interfaz", que: "", donde: "" },
    { id: "i3", nombre: "I3", capa: "interfaz", que: "", donde: "" },
    { id: "n1", nombre: "N1", capa: "nucleo", que: "", donde: "" },
    { id: "n2", nombre: "N2", capa: "nucleo", que: "", donde: "" },
    { id: "n3", nombre: "N3", capa: "nucleo", que: "", donde: "" },
  ],
  flechas: [
    { de: "i1", a: "n3", que: "" },
    { de: "i2", a: "n2", que: "" },
    { de: "i3", a: "n1", que: "" },
  ],
};

const sinOrdenar = [
  { capa: "interfaz" as const, piezas: CRUZADO.piezas.filter((p) => p.capa === "interfaz") },
  { capa: "nucleo" as const, piezas: CRUZADO.piezas.filter((p) => p.capa === "nucleo") },
];
const antes = cruces(sinOrdenar, CRUZADO.flechas);
const despues = cruces(colocar(CRUZADO), CRUZADO.flechas);
ok("el orden del modelo cruza de verdad", antes === 3, `cruces=${antes}`);
ok("colocar deja el dibujo sin cruces", despues === 0, `cruces=${despues}`);

/** Una pieza que no habla con la columna de al lado no se sube por delante de
 *  las que sí tienen motivo para estar donde están. */
const CON_HUERFANA: Mapa = {
  resumen: "",
  caminos: [],
  piezas: [
    { id: "i1", nombre: "I1", capa: "interfaz", que: "", donde: "" },
    { id: "n0", nombre: "Sola", capa: "nucleo", que: "", donde: "" },
    { id: "n1", nombre: "N1", capa: "nucleo", que: "", donde: "" },
  ],
  flechas: [{ de: "i1", a: "n1", que: "" }],
};
const conH = colocar(CON_HUERFANA);
ok("la pieza sin flechas se queda debajo",
  conH[1].piezas.map((p) => p.id).join(",") === "n1,n0");

const unaSola = colocar({
  resumen: "",
  caminos: [],
  piezas: [{ id: "x", nombre: "X", capa: "nucleo", que: "", donde: "" }],
  flechas: [],
});
ok("con una sola columna no se rompe", unaSola.length === 1 && unaSola[0].piezas.length === 1);
ok("un mapa sin flechas se coloca igual", colocar({ ...CRUZADO, flechas: [] }).length === 2);

const a1 = colocar(CRUZADO).map((c) => c.piezas.map((p) => p.id).join()).join("|");
const a2 = colocar(CRUZADO).map((c) => c.piezas.map((p) => p.id).join()).join("|");
ok("dos veces el mismo mapa da el mismo dibujo", a1 === a2);

/* ── 5. Dónde nace cada caja ─────────────────────────────────────────────── */

const sitios = posiciones(colocar(m));
ok("cada pieza tiene su sitio", Object.keys(sitios).length === 3);
ok("cada capa es una columna", sitios.app.x === 0 && sitios.pty.x === HUECO_X && sitios.cli.x === HUECO_X * 2);
ok("la primera de cada columna nace arriba", sitios.app.y === 0 && sitios.pty.y === 0);

const dosEnUna = posiciones(colocar(CRUZADO));
const enColumna = ["i1", "i2", "i3"].map((id) => dosEnUna[id].y).sort((a, b) => a - b);
ok("dos cajas de la misma columna no se pisan",
  enColumna[1] - enColumna[0] >= 104 && enColumna[2] - enColumna[1] >= 104);

const conAltos = posiciones(colocar(CRUZADO), { i1: 300 });
const bajo = Object.entries(conAltos)
  .filter(([id]) => id.startsWith("i"))
  .sort((a, b) => a[1].y - b[1].y);
ok("una caja alta empuja a la de debajo", bajo[1][1].y >= 300);

/* ── 6. Los anillos, estilo constelación ────────────────────────────────── */

const ANILLOS: Mapa = {
  resumen: "",
  caminos: [],
  piezas: [
    { id: "n1", nombre: "N1", capa: "nucleo", que: "", donde: "" },
    { id: "n2", nombre: "N2", capa: "nucleo", que: "", donde: "" },
    { id: "i1", nombre: "I1", capa: "interfaz", que: "", donde: "" },
    { id: "i2", nombre: "I2", capa: "interfaz", que: "", donde: "" },
    { id: "f1", nombre: "F1", capa: "fuera", que: "", donde: "" },
  ],
  flechas: [
    { de: "i1", a: "n1", que: "" },
    { de: "i2", a: "n1", que: "" },
    { de: "n1", a: "n2", que: "" },
    { de: "n1", a: "f1", que: "" },
    { de: "n2", a: "f1", que: "" },
  ],
};

const r = posicionesRadiales(ANILLOS);
const radio = (id: string) => Math.round(Math.hypot(r[id].x, r[id].y));
ok("cada pieza tiene su sitio en el anillo", Object.keys(r).length === 5);
ok("la capa más conectada va dentro", radio("n1") === RADIO_BASE && radio("n2") === RADIO_BASE,
  `nucleo=${radio("n1")}`);
ok("las otras capas van fuera", radio("i1") > radio("n1") && radio("f1") > radio("n1"));
ok("cada capa comparte anillo", radio("i1") === radio("i2"));
/* El orden de los anillos lo decide el grado medio, no el orden de las capas:
   aquí «fuera» está más conectada que «interfaz» y por eso va antes. Lo que se
   afirma es que los anillos que salgan estén separados por su paso. */
const radios = [...new Set(Object.keys(r).map(radio))].sort((a, b) => a - b);
ok("los anillos guardan la distancia",
  radios.every((v, i) => i === 0 || v - radios[i - 1] === RADIO_PASO), radios.join(","));
ok("dos piezas del mismo anillo no caen encima",
  r.n1.x !== r.n2.x || r.n1.y !== r.n2.y);
ok("dos veces el mismo mapa da el mismo dibujo",
  JSON.stringify(posicionesRadiales(ANILLOS)) === JSON.stringify(r));
ok("el grado cuenta las dos direcciones", grado(ANILLOS, "n1") === 4 && grado(ANILLOS, "f1") === 2);

/** Con UNA sola pieza en el anillo de dentro, esa va al centro exacto: un
 *  anillo de uno es un nodo dando vueltas alrededor de nada. */
const UNO_DENTRO: Mapa = {
  resumen: "",
  caminos: [],
  piezas: [
    { id: "c", nombre: "C", capa: "nucleo", que: "", donde: "" },
    { id: "a", nombre: "A", capa: "interfaz", que: "", donde: "" },
    { id: "b", nombre: "B", capa: "interfaz", que: "", donde: "" },
  ],
  flechas: [
    { de: "a", a: "c", que: "" },
    { de: "b", a: "c", que: "" },
  ],
};
const r2 = posicionesRadiales(UNO_DENTRO);
ok("una pieza sola se queda en el centro", r2.c.x === 0 && r2.c.y === 0);

ok("un mapa sin flechas también se coloca",
  Object.keys(posicionesRadiales({ ...ANILLOS, flechas: [] })).length === 5);

/* ── 7. La chuleta que se le manda al Capataz ────────────────────────────── */

const esqueleto = esqueletoParaElCapataz([
  { id: "", carpeta: true, peso: 900, dentro: 99 },
  { id: "src", carpeta: true, peso: 500, dentro: 40 },
  { id: "src-tauri", carpeta: true, peso: 400, dentro: 20 },
  { id: "src/App.tsx", carpeta: false, peso: 300, dentro: 0 },
  { id: "src/x.ts", carpeta: false, peso: 10, dentro: 0 },
]);
ok("la chuleta lleva las carpetas con su cuenta", esqueleto.includes("src/ (40)"));
ok("la raíz sin nombre no sale como carpeta", !esqueleto.includes("/ (99)"));
ok("los archivos gordos van primero", esqueleto.indexOf("src/App.tsx") < esqueleto.indexOf("src/x.ts"));

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo en orden.");
process.exit(fallos ? 1 : 0);
