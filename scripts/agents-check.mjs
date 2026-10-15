// AGENTS.md cabe entero en lo que lee cada agente.
//
//     node scripts/agents-check.mjs      (va en `pnpm comprobar`)
//
// Claude Code avisa a partir de 40.000 caracteres por fichero de memoria, y
// Codex lee como mucho 32 KiB (`project_doc_max_bytes`). Se pasó dos veces: el
// 2026-10-07 tenía más de 100 KB y se sacaron los capítulos a `docs/contexto`;
// el 2026-10-15 volvía a tener 43.104 caracteres, y a Codex no le llegaban ni el
// entorno de compilación, ni `pnpm`, ni el idioma. Dos reglas, por eso:
//
//  1. Menos de 40.000 caracteres: si no, Claude Code avisa al arrancar.
//  2. Lo imprescindible dentro de los primeros 32 KiB, que es lo que lee Codex:
//     el entorno de compilación, `pnpm` y el idioma.
//
// Si salta, lo técnico se saca a su capítulo de `docs/contexto` con su fila en
// el mapa, tal cual, como se hizo esas dos veces.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOPE_CLAUDE = 40_000;
const TOPE_CODEX = 32 * 1024;
const IMPRESCINDIBLE = ["CARGO_TARGET_DIR = C:\\ct", "`pnpm` siempre", "Idioma: código/README/commits en inglés"];

/** Lo que falla, o vacío si cabe. Suelto para poder probarlo. */
export function repasar(texto) {
  const fallos = [];
  const caracteres = [...texto].length;
  if (caracteres >= TOPE_CLAUDE) fallos.push(`tiene ${caracteres} caracteres y Claude Code avisa a partir de ${TOPE_CLAUDE}`);
  const loQueLeeCodex = Buffer.from(texto, "utf8").subarray(0, TOPE_CODEX).toString("utf8");
  for (const f of IMPRESCINDIBLE) if (!loQueLeeCodex.includes(f)) fallos.push(`«${f}» no cae dentro de los ${TOPE_CODEX} bytes que lee Codex`);
  return fallos;
}

// El vigilante, contra uno que se pasa y uno que cabe.
const control = repasar("x".repeat(TOPE_CLAUDE) + IMPRESCINDIBLE.join("\n"));
if (control.length !== IMPRESCINDIBLE.length + 1 || repasar(IMPRESCINDIBLE.join("\n")).length) {
  console.error("agents-check: el vigilante no caza su propio control");
  process.exit(1);
}

// Otra ruta, para probarlo contra una versión vieja: `node scripts/agents-check.mjs <ruta>`.
const texto = fs.readFileSync(process.argv[2] ?? path.join(RAIZ, "AGENTS.md"), "utf8");
const fallos = repasar(texto);
if (fallos.length) {
  for (const f of fallos) console.error(`agents-check: AGENTS.md ${f}.`);
  console.error("Saca lo técnico a su capítulo de docs/contexto, con su fila en el mapa (ver la cabecera de este script).");
  process.exit(1);
}
console.log(`agents-check: AGENTS.md tiene ${[...texto].length} caracteres y lo imprescindible cae dentro de lo que lee Codex`);
