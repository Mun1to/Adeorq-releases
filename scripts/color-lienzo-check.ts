// El color de cada proyecto en el lienzo, probado con los nombres de verdad.
//
//   npx tsc scripts/color-lienzo-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/color-lienzo-check.js
//
// Existe por un número: con `hueOf` (el color de la casa, todo en la familia
// del azul) 22 de cada 30 proyectos vecinos de Munir quedaban a tres grados o
// menos. Aquí se comprueba que entre los proyectos que comparten lienzo no hay
// dos iguales, que el color no depende del orden en que llegan, y que casi
// todos conservan su tono preferido cuando entra uno más.

import { coloresDeProyectos, tonoDe, TONOS, TONOS_DE_ESTADO } from "../src/lib/colorLienzo";

declare const process: { exit(code?: number): never };

let fallos = 0;
function caso(nombre: string, ok: boolean, detalle = ""): void {
  console.log(`${ok ? "ok " : "MAL"} ${nombre}${detalle ? `  (${detalle})` : ""}`);
  if (!ok) fallos++;
}

/** Los proyectos de C:\proyectos el 2026-10-06. */
const SUYOS = [
  "Adeorq", "CCC Alex Web", "Chain Web SIte", "Expoal", "Klipse", "Layco", "MarcaPersonal", "Moneorq",
  "MunitoBot", "MusiCopy", "Orquio", "ProductSea", "Rolyal", "SECBRAIN", "SSScraping", "Skills", "Stashai",
  "Vibeset", "VidLife", "Vidorq-Core", "Vidorq", "VoCript-Core", "VoCript", "Webs", "crypto",
  "davinci-resolve-mcp", "froede", "hotkeyconfig", "layco-core", "winshotx", "zonepto",
];

const lejos = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** La menor distancia de tono entre dos proyectos cualesquiera del grupo. */
function separacion(grupo: readonly string[]): number {
  const m = coloresDeProyectos(grupo);
  const tonos = grupo.map((p) => tonoDe(m[p]));
  let min = 360;
  for (let i = 0; i < tonos.length; i++) for (let j = i + 1; j < tonos.length; j++) min = Math.min(min, lejos(tonos[i], tonos[j]));
  return min;
}

/** Lo mínimo que tienen que separarse dos tonos para leerse como dos colores. */
const MINIMO = 25;

caso("los tonos de la rueda están bien separados entre sí", (() => {
  const o = [...TONOS].sort((a, b) => a - b);
  return o.every((t, i) => lejos(t, o[(i + 1) % o.length]) >= MINIMO);
})());
caso(
  "ninguno se confunde con un color de estado (terminado, te pregunta, aviso, te espera)",
  TONOS.every((t) => TONOS_DE_ESTADO.every((e) => lejos(t, e) >= 30)),
  `${Math.min(...TONOS.flatMap((t) => TONOS_DE_ESTADO.map((e) => lejos(t, e))))}° el más cercano`,
);

// El caso que lo motivó: los cinco que con el color de la casa eran un solo azul.
const cinco = ["Vidorq", "Adeorq", "MarcaPersonal", "Vibeset", "hotkeyconfig"];
caso("los cinco que antes eran un solo azul ya no se parecen", separacion(cinco) >= MINIMO, `${separacion(cinco)}° el par más cercano`);

// Cualquier lienzo razonable: todas las ventanas de 2 a 10 proyectos seguidos
// de su lista, y cien grupos al azar con semilla fija.
let peor = 360;
for (let n = 2; n <= TONOS.length; n++) for (let i = 0; i + n <= SUYOS.length; i++) peor = Math.min(peor, separacion(SUYOS.slice(i, i + n)));
let semilla = 11;
const azar = () => (semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let k = 0; k < 100; k++) {
  const n = 2 + Math.floor(azar() * (TONOS.length - 1));
  const grupo = [...SUYOS].sort(() => azar() - 0.5).slice(0, n);
  peor = Math.min(peor, separacion(grupo));
}
caso("hasta diez proyectos en un lienzo, ninguno repite tono", peor >= MINIMO, `${peor}° el peor par`);

const todos = coloresDeProyectos(SUYOS);
caso("con los 31 a la vez cada uno tiene color, aunque la rueda dé la vuelta", SUYOS.every((p) => /^hsl\(\d+ 78% 64%\)$/.test(todos[p])));

const a = coloresDeProyectos(["VoCript", "Adeorq", "Layco"]);
const b = coloresDeProyectos(["Layco", "VoCript", "Adeorq", "Adeorq"]);
caso("no depende del orden ni de los repetidos", JSON.stringify(a) === JSON.stringify(b));

// Estabilidad: al meter un proyecto más, ¿cuántos de los que ya estaban cambian?
let cambios = 0;
let pruebas = 0;
for (const nuevo of SUYOS) {
  const base = ["Adeorq", "VoCript", "Layco", "Orquio"].filter((p) => p !== nuevo);
  const antes = coloresDeProyectos(base);
  const despues = coloresDeProyectos([...base, nuevo]);
  for (const p of base) {
    pruebas++;
    if (antes[p] !== despues[p]) cambios++;
  }
}
caso("meter un proyecto más casi nunca le cambia el color a otro", cambios / pruebas < 0.1, `${cambios} de ${pruebas}`);
caso("un nombre vacío no cuenta", Object.keys(coloresDeProyectos(["", "Adeorq"])).join() === "Adeorq");

if (fallos) {
  console.log(`\n${fallos} fallos`);
  process.exit(1);
}
console.log("\ntodo en orden");
