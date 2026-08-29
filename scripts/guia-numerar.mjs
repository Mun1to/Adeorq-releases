// Renumera los apartados de la guía y le regenera el índice.
//
//     node scripts/guia-numerar.mjs           (simulacro: dice qué haría)
//     node scripts/guia-numerar.mjs --aplicar
//
// ── POR QUÉ ─────────────────────────────────────────────────────────────────
//
// La guía se escribió de una vez y después se le fueron metiendo apartados en
// medio. Como renumerar a mano es un rato, cada uno entró con una letra pegada
// al número de al lado: 5b, 7b, 9b, 10b. Y el índice de arriba se quedó atrás:
// esos cuatro no salían en él (Munir, 2026-08-29: «sigue muy mal
// estructurada»).
//
// Que esto sea un script y no un rato de tijera es a propósito: la guía va a
// seguir creciendo por el medio, y a mano se vuelve a torcer a la tercera.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const APLICAR = process.argv.includes("--aplicar");

/** Los dos ficheros de la guía, con el título de su índice. */
const GUIAS = [
  { fichero: "docs/GUIA.md", indice: "Índice" },
  { fichero: "docs/GUIDE.en.md", indice: "Contents" },
];

/** `## 5b. Lienzo (la pestaña ⬡)` → número, letra y título. */
const TITULO = /^## (\d+)([a-z]?)\.\s+(.+)$/;

/**
 * El anclaje que GitHub le da a un título: minúsculas, fuera lo que no sea
 * letra o número, y los espacios a guiones. Se conservan las tildes y la ñ,
 * que es lo que hace GitHub y lo que ya había en el fichero.
 */
function anclaje(texto) {
  return texto
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

let cambios = 0;

for (const { fichero, indice } of GUIAS) {
  const ruta = path.join(RAIZ, fichero);
  if (!fs.existsSync(ruta)) {
    console.log(`· ${fichero}: no existe, se salta`);
    continue;
  }
  const crudo = fs.readFileSync(ruta, "utf8");
  /* Los saltos se normalizan y se reponen al escribir. GUIDE.en.md está en
     CRLF, y en JavaScript el punto de una expresión regular NO casa con el
     retorno de carro: sin esto, «## 0. Why use Adeorq» con su retorno detrás
     no encajaba con el patrón y el script decía tan tranquilo que ese fichero
     no tenía apartados numerados. */
  const salto = crudo.includes("\r\n") ? "\r\n" : "\n";
  const lineas = crudo.split(/\r?\n/);

  // 1. Renumerar los apartados, en el orden en que están.
  const apartados = [];
  let n = 0;
  const antes = [];
  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(TITULO);
    if (!m) continue;
    const [, num, letra, titulo] = m;
    antes.push(`${num}${letra}`);
    const nuevo = `## ${n}. ${titulo}`;
    if (lineas[i] !== nuevo) cambios++;
    lineas[i] = nuevo;
    apartados.push({ n, titulo, ancla: anclaje(`${n}. ${titulo}`) });
    n++;
  }
  if (apartados.length === 0) {
    console.log(`· ${fichero}: no tiene apartados numerados`);
    continue;
  }

  // 2. Regenerar el índice entero, que es donde se quedaban fuera.
  const ini = lineas.findIndex((l) => l.trim() === `## ${indice}`);
  let ini2 = ini;
  if (ini2 < 0) {
    /* Sin índice se le pone uno: `GUIDE.en.md` no tenía ninguno, así que la
       versión inglesa se leía a ciegas de arriba abajo. Va justo antes del
       primer apartado. */
    ini2 = lineas.findIndex((l) => TITULO.test(l));
    if (ini2 < 0) continue;
    lineas.splice(ini2, 0, `## ${indice}`, "");
  }
  let fin = ini2 + 1;
  while (fin < lineas.length && !lineas[fin].startsWith("## ")) fin++;
  // El índice va hasta el `---` que lo cierra, si lo hay.
  const raya = lineas.slice(ini2, fin).lastIndexOf("---");
  const hasta = raya >= 0 ? ini2 + raya : fin;

  const nuevo = [
    `## ${indice}`,
    "",
    ...apartados.map((a) => `${a.n}. [${a.titulo}](#${a.ancla})`),
    "",
  ];
  const viejo = lineas.slice(ini2, hasta);
  if (viejo.join("\n") !== nuevo.join("\n")) cambios++;
  lineas.splice(ini2, hasta - ini2, ...nuevo);

  console.log(`\n${fichero}`);
  console.log(`  apartados: ${apartados.length}`);
  const conLetra = antes.filter((x) => /[a-z]$/.test(x));
  if (conLetra.length) console.log(`  renumerados: ${conLetra.join(", ")}`);
  const faltaban = apartados.filter((a) => !viejo.some((l) => l.includes(`[${a.titulo}]`)));
  if (faltaban.length) {
    console.log(`  no estaban en el índice: ${faltaban.map((a) => a.titulo).join(" · ")}`);
  }

  if (APLICAR) fs.writeFileSync(ruta, lineas.join(salto), "utf8");
}

console.log(
  `\n${cambios === 0 ? "Nada que cambiar." : APLICAR ? `Escrito (${cambios} cambios).` : `Simulacro: ${cambios} cambios. Lánzalo con --aplicar.`}`,
);
