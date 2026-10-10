// La mascota del móvil sale de la del escritorio, y esto vigila que no se separen.
//
//     node scripts/mascota-movil-check.mjs              comprueba (va en `pnpm comprobar`)
//     node scripts/mascota-movil-check.mjs --escribir   vuelve a generar el bloque
//
// La página del móvil (`src-tauri/src/movil.html`) es un archivo suelto dentro
// del binario: no puede importar `src/lib/mascota.ts`. La primera vez se copió
// el dibujo a mano, en pequeño y con dos fotogramas por ánimo, con una nota:
// «son dos copias, si cambia en una se cambia en la otra». Una nota así dura
// hasta el primer despiste. Munir pidió el 2026-10-10 que en el móvil la
// mascota tuviera las mismas animaciones, y en vez de copiar más, se genera:
// el `.ts` se pasa a JavaScript tal cual (posturas, guiones y el que decide el
// fotograma) y se mete entre dos marcas de la página. Si alguien toca el `.ts`
// y no regenera, esto se pone en rojo y dice cómo arreglarlo.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FUENTE = path.join(RAIZ, "src", "lib", "mascota.ts");
const PAGINA = path.join(RAIZ, "src-tauri", "src", "movil.html");

export const ABRE = "// <mascota-generada>";
export const CIERRA = "// </mascota-generada>";
/** Lo que la página usa del módulo. Si falta uno en el `.ts`, se dice aquí y no en el móvil. */
export const SALE = ["ANCHO", "ALTO", "GUIONES", "REACCIONES", "cuadrosDe", "reposoDe", "arrancar", "avanzar", "reaccionar"];

/** El bloque entero, con sus marcas, a partir del texto de `mascota.ts`. */
export function generar(fuente) {
  const js = ts.transpileModule(fuente, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, removeComments: true, newLine: ts.NewLineKind.LineFeed },
  }).outputText;
  const cuerpo = js
    .split("\n")
    .map((l) => l.replace(/^export /, "").trimEnd())
    .filter((l) => l && !/^import /.test(l))
    .join("\n");
  for (const nombre of SALE) {
    if (!new RegExp(`^(const|function) ${nombre}\\b`, "m").test(cuerpo)) {
      throw new Error(`src/lib/mascota.ts ya no declara «${nombre}», y la página del móvil lo usa`);
    }
  }
  return [
    ABRE,
    "// No se toca a mano: sale de `src/lib/mascota.ts` con",
    "//   node scripts/mascota-movil-check.mjs --escribir",
    "const MASCOTA = (() => {",
    cuerpo,
    `return { ${SALE.join(", ")} };`,
    "})();",
    CIERRA,
  ].join("\n");
}

/** El bloque que lleva hoy la página, o `null` si no tiene las dos marcas. */
export function bloqueDe(pagina) {
  const a = pagina.indexOf(ABRE);
  const b = pagina.indexOf(CIERRA);
  return a >= 0 && b > a ? pagina.slice(a, b + CIERRA.length) : null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pagina = fs.readFileSync(PAGINA, "utf8");
  const nuevo = generar(fs.readFileSync(FUENTE, "utf8"));
  const viejo = bloqueDe(pagina);
  if (viejo === null) {
    console.error(`FALLA: src-tauri/src/movil.html no tiene las marcas «${ABRE}» y «${CIERRA}».`);
    process.exit(1);
  }
  if (process.argv.includes("--escribir")) {
    if (viejo.replace(/\r\n/g, "\n") === nuevo) console.log("La mascota del móvil ya estaba al día.");
    else {
      fs.writeFileSync(PAGINA, pagina.replace(viejo, () => nuevo));
      console.log(`Mascota del móvil regenerada: ${nuevo.split("\n").length} líneas.`);
    }
    process.exit(0);
  }
  if (viejo.replace(/\r\n/g, "\n") !== nuevo) {
    console.error("FALLA: la mascota de la página del móvil no es la de src/lib/mascota.ts.");
    console.error("       Regenérala con: node scripts/mascota-movil-check.mjs --escribir");
    process.exit(1);
  }
  console.log("TODO BIEN: la mascota del móvil es la del escritorio.");
}
