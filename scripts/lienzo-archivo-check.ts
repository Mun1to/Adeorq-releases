// El archivo del lienzo se lee campo a campo, y el carril también.
//
//   npx tsc scripts/lienzo-archivo-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/lienzo-archivo-check.js
//
// Un lienzo se puede compartir, así que `parsear` (`src/lib/canvasFile.ts`) no
// se fía de nada de lo que trae el archivo. Aquí se fija lo que entró con el
// carril (2026-10-06), que acaba en dos sitios delicados: su nombre se compara
// con los proyectos para decidir dónde nacen las terminales, y su color va a
// una variable de CSS. Y tres casos de los de siempre, para que el banco no
// pase solo porque `parsear` devuelva cualquier cosa.

import { parsear, CANVAS_FILE_KIND, type NodoCarril, type NodoTerm } from "../src/lib/canvasFile";

declare const process: { exit(code?: number): never };

let fallos = 0;
function caso(nombre: string, ok: boolean, detalle = ""): void {
  console.log(`${ok ? "ok " : "MAL"} ${nombre}${detalle ? `  (${detalle})` : ""}`);
  if (!ok) fallos++;
}

const archivo = (nodos: unknown[]): string =>
  JSON.stringify({ kind: CANVAS_FILE_KIND, v: 1, guardado: "2026-10-06T12:00:00.000Z", proyecto: "Adeorq", nodos, flechas: [], trazos: [] });

const carriles = (nodos: unknown[]): NodoCarril[] =>
  (parsear(archivo(nodos))?.nodos ?? []).filter((n): n is NodoCarril => n.tipo === "carril");

caso("lo que no es un lienzo no se abre", parsear('{"kind":"otra-cosa","nodos":[]}') === null && parsear("no es json") === null);

const bueno = carriles([{ tipo: "carril", id: "c1", x: 10, y: 20, w: 1800, h: 400, nombre: "Adeorq", color: "#7ec9a8" }]);
caso(
  "un carril vuelve con su nombre, su color y su tamaño",
  bueno.length === 1 && bueno[0].nombre === "Adeorq" && bueno[0].color === "#7ec9a8" && bueno[0].w === 1800 && bueno[0].h === 400 && bueno[0].x === 10,
);

const sinMedida = carriles([{ tipo: "carril", id: "c2", x: 0, y: 0, nombre: "Sueltas", color: "#4d9fff" }]);
caso("sin medidas nace con las de un carril, no con las de una nota", sinMedida[0]?.w === 2400 && sinMedida[0]?.h === 520);

const hsl = carriles([{ tipo: "carril", id: "c3", x: 0, y: 0, nombre: "VoCript", color: "hsl(242 78% 64%)" }]);
caso("un color de los de la rueda del lienzo se respeta", hsl[0]?.color === "hsl(242 78% 64%)");

// El color va a `style="--carril: …"`: nada que no sea un color entero.
for (const malo of ["red; background: url(https://ejemplo.invalid/x)", "var(--accent)", "#fff", "hsl(1 2% 3%); x: y", 7, null]) {
  const c = carriles([{ tipo: "carril", id: "c4", x: 0, y: 0, nombre: "X", color: malo }]);
  caso(`un color raro (${JSON.stringify(malo)}) cae al azul de la casa`, c[0]?.color === "#4d9fff");
}

caso("un carril sin nombre no entra", carriles([{ tipo: "carril", id: "c5", x: 0, y: 0, nombre: "   ", color: "#4d9fff" }]).length === 0);
caso("ni uno sin id", carriles([{ tipo: "carril", x: 0, y: 0, nombre: "Adeorq", color: "#4d9fff" }]).length === 0);
const largo = carriles([{ tipo: "carril", id: "c6", x: 0, y: 0, nombre: "a".repeat(300), color: "#4d9fff" }]);
caso("un nombre larguísimo se corta a ochenta", largo[0]?.nombre.length === 80);
caso("la posición rota no rompe: cae a cero", carriles([{ tipo: "carril", id: "c7", x: null, y: "20", nombre: "Adeorq", color: "#4d9fff" }])[0]?.x === 0);

// Los de siempre, para que el banco muerda.
const term = parsear(archivo([{ tipo: "term", id: "t1", x: 0, y: 0, kind: "claude", proyecto: "Adeorq", ruta: "C:\\proyectos\\Adeorq", cmd: ["claude", 7] }]))?.nodos[0] as NodoTerm | undefined;
caso("un comando que no es una lista de textos no llega a un proceso", term?.tipo === "term" && term.cmd === undefined);
caso(
  "una nota con un id que quiere salirse de su carpeta no entra",
  (parsear(archivo([{ tipo: "nota", id: "n1", x: 0, y: 0, nota: "..\\..\\bandeja", color: "#f2c14e" }]))?.nodos.length ?? -1) === 0,
);
caso(
  "un tipo que este Adeorq no conoce se salta sin tirar los demás",
  (parsear(archivo([{ tipo: "holograma", id: "h1", x: 0, y: 0 }, { tipo: "carril", id: "c8", x: 0, y: 0, nombre: "Adeorq", color: "#4d9fff" }]))?.nodos.length ?? -1) === 1,
);

if (fallos) {
  console.log(`\n${fallos} fallos`);
  process.exit(1);
}
console.log("\ntodo en orden");
