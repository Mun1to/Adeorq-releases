// Comprueba que el arranque de Adeorq no carga lo que no se está mirando.
//
//     pnpm build && pnpm arranque
//
// Existe por un fallo real medido el 2026-08-31, y por lo invisible que era.
//
// Adeorq salía en UN archivo de JavaScript de 2.578 kB, y el WebView tiene que
// leerlo y compilarlo ENTERO antes de pintar la primera ventana. Dentro
// viajaban el editor de código con sus seis lenguajes (CodeMirror, 603 kB), el
// lienzo con su motor de nodos (React Flow) y sus dos librerías de dibujo,
// la Memoria, la Agenda, los Ajustes. Todo eso se pagaba en cada arranque
// aunque no abrieras ninguna de esas pestañas en todo el día.
//
// Repartirlo en trozos perezosos (`src/lib/perezoso.tsx`) lo dejó en 1.366 kB.
// Pero lo que de verdad justifica este script es CÓMO se colaba React Flow:
//
//     WebPane.tsx  ->  import { comoUrl } from "./CanvasWeb"
//
// `comoUrl` son cinco líneas de texto. `CanvasWeb` importa `@xyflow/react`.
// Y `WebPane` sí se carga al arrancar. Es decir: una función de cinco líneas
// arrastraba el motor de nodos entero al arranque, y eso no se ve leyendo el
// código, no lo dice el compilador y no rompe nada. Solo se ve mirando el
// bundle. La próxima vez que alguien importe un ayudante de un sitio pesado
// pasará lo mismo, así que la red se pone aquí y no en la memoria de nadie.
//
// No mide "que sea pequeño", que es una discusión sin final. Mide lo concreto:
// que estas librerías caras NO estén en el trozo de arranque.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(RAIZ, "dist");

/** Lo que NO puede viajar en el arranque, y por dónde se reconoce en el
    JavaScript ya minificado (el nombre del paquete no sobrevive; estas marcas
    sí, porque son cadenas de texto o clases CSS que el minificador respeta). */
const PROHIBIDAS = [
  { nombre: "React Flow (@xyflow/react)", marca: /react-flow__|xy-theme|useNodesState/, dueño: "del Lienzo y del mapa de la Memoria" },
  { nombre: "CodeMirror", marca: /cm-content|cm-editor|@codemirror/, dueño: "del editor de archivos" },
  { nombre: "roughjs", marca: /hachureAngle|roughness/, dueño: "del dibujo del Lienzo" },
  { nombre: "perfect-freehand", marca: /getStrokePoints|getStrokeOutline/, dueño: "del dibujo del Lienzo" },
];

/** Cuánto puede pesar el arranque antes de que haya que mirarlo. No es un
    ideal, es el techo de hoy con holgura: si se cruza, algo nuevo se ha
    colado. Medido el 2026-08-31 en 1.366 kB. */
const TECHO_KB = 1500;

let entrada;
try {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  const m = html.match(/<script[^>]+src="\/?([^"]+\.js)"/);
  if (!m) throw new Error("index.html no declara ningún script de módulo");
  entrada = m[1].replace(/^\//, "");
} catch (e) {
  console.error("No hay build que mirar. Lanza `pnpm build` antes.");
  console.error(" ", String(e.message ?? e));
  process.exit(2);
}

const ruta = join(DIST, entrada);
const codigo = readFileSync(ruta, "utf8");
const kb = Math.round(Buffer.byteLength(codigo) / 1024);

console.log(`Trozo de arranque: ${entrada}  (${kb} kB)`);

const otros = readdirSync(join(DIST, "assets"))
  .filter((f) => f.endsWith(".js") && !entrada.endsWith(f));
console.log(`Trozos que se piden al abrir su pestaña: ${otros.length}`);

const coladas = PROHIBIDAS.filter((p) => p.marca.test(codigo));

if (coladas.length) {
  console.error("\nSe ha colado en el arranque algo que es de otra pestaña:\n");
  for (const c of coladas) {
    console.error(`  · ${c.nombre} — es de ${c.dueño}, y ahí no se abre.`);
  }
  console.error(
    "\nCasi siempre es un ayudante pequeño importado de un archivo pesado.\n" +
    "Para encontrarlo: mira qué importa cada archivo que SÍ se carga al\n" +
    "arrancar (los que no pasan por `perezoso()` en App.tsx) y busca cuál\n" +
    "tira de un componente del Lienzo o del editor. La cura es mudar ese\n" +
    "ayudante a `src/lib/`, que no pinta nada y no arrastra a nadie.\n",
  );
  process.exit(1);
}

if (kb > TECHO_KB) {
  console.error(
    `\nEl arranque pasa de ${TECHO_KB} kB (va por ${kb}). No está prohibido,\n` +
    "pero algo nuevo ha entrado ahí: mira si se puede pedir más tarde.\n",
  );
  process.exit(1);
}

console.log("\nBien: el arranque no lleva nada del Lienzo ni del editor.");
