// Regla U: ningún cuadro de texto lleva el tirador de agrandar.
//
// «resize: none SIEMPRE en un <textarea>, y en la misma regla de CSS donde se le
// da el estilo, no en una limpieza posterior. Ese puñito de rayas lo pinta el
// navegador, no lo ha diseñado nadie, y dentro de una caja de cristal con
// esquinas redondeadas se ve como una pegatina.»
//
// Una regla en prosa no puede fallar, así que envejece sin que nadie se entere.
// Esta sí falla: se lanza con `pnpm textarea` y sale roja en cuanto alguien mete
// un textarea sin su freno.
//
// Cómo lo comprueba, y qué NO puede comprobar: saca las clases literales de cada
// `<textarea>` y busca un bloque de CSS que las mencione y lleve `resize: none`.
// Un `style={{ resize: "none" }}` inline también vale. Lo que no sabe resolver es
// una clase construida a mano en tiempo de ejecución (`"caja-" + tipo`): esos
// casos los declara SIN COMPROBAR en vez de darlos por buenos, porque un
// comprobador que aprueba lo que no ha mirado es peor que no tenerlo.

import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "src");

/** Todos los ficheros con una extensión de la lista, recursivo. */
function ficheros(dir, exts) {
  const salida = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) salida.push(...ficheros(p, exts));
    else if (exts.some((x) => e.name.endsWith(x))) salida.push(p);
  }
  return salida;
}

const css = ficheros(RAIZ, [".css"])
  .map((f) => fs.readFileSync(f, "utf8"))
  .join("\n");

/**
 * Los bloques de CSS que llevan `resize: none`, con su selector.
 * Se parte por `}` y se mira hacia atrás, que basta para este CSS plano.
 */
const conFreno = [];
for (const trozo of css.split("}")) {
  if (!/resize\s*:\s*none/.test(trozo)) continue;
  const llave = trozo.lastIndexOf("{");
  if (llave < 0) continue;
  conFreno.push(trozo.slice(0, llave));
}

/** ¿Hay algún bloque con `resize: none` cuyo selector nombre esta clase? */
const tieneFreno = (clase) =>
  conFreno.some((sel) => new RegExp(`\\.${clase}(?![\\w-])`).test(sel));

const fallos = [];
const sinComprobar = [];
let total = 0;

for (const fichero of ficheros(RAIZ, [".tsx", ".jsx"])) {
  const texto = fs.readFileSync(fichero, "utf8");
  let i = -1;
  while ((i = texto.indexOf("<textarea", i + 1)) !== -1) {
    total++;
    const linea = texto.slice(0, i).split("\n").length;
    const donde = `${path.relative(path.join(RAIZ, ".."), fichero).replace(/\\/g, "/")}:${linea}`;

    // La etiqueta de apertura: desde `<textarea` hasta el primer `>` que no esté
    // dentro de una llave de JSX (un `=>` de una función pasada por props).
    let j = i, hondo = 0, fin = -1;
    while (j < texto.length) {
      const c = texto[j];
      if (c === "{") hondo++;
      else if (c === "}") hondo--;
      else if (c === ">" && hondo === 0 && texto[j - 1] !== "=") { fin = j; break; }
      j++;
    }
    const etiqueta = texto.slice(i, fin < 0 ? i + 600 : fin);

    if (/style\s*=\s*\{\{[^}]*resize\s*:\s*["']none["']/.test(etiqueta)) continue;

    const cn = etiqueta.match(/className\s*=\s*(?:"([^"]*)"|\{([^]*?)\}(?=\s|$))/);
    if (!cn) {
      fallos.push(`${donde}  sin className y sin resize inline`);
      continue;
    }
    const crudo = cn[1] ?? cn[2] ?? "";
    const clases = [...crudo.matchAll(/["'`]([^"'`]+)["'`]/g)]
      .flatMap((m) => m[1].split(/\s+/))
      .concat(cn[1] ? crudo.split(/\s+/) : [])
      .filter((c) => /^[a-zA-Z][\w-]*$/.test(c));

    if (clases.length === 0) {
      sinComprobar.push(`${donde}  clase construida en ejecución: ${crudo.slice(0, 50)}`);
      continue;
    }
    if (!clases.some(tieneFreno)) {
      fallos.push(`${donde}  clases [${[...new Set(clases)].join(", ")}] sin resize:none`);
    }
  }
}

console.log(`Regla U: ${total} <textarea> mirados en src/`);
if (sinComprobar.length) {
  console.log(`\n${sinComprobar.length} SIN COMPROBAR (clase dinámica, míralos a mano):`);
  sinComprobar.forEach((f) => console.log("  " + f));
}
if (fallos.length) {
  console.error(`\n${fallos.length} SIN FRENO, y la regla U dice que siempre lo llevan:`);
  fallos.forEach((f) => console.error("  " + f));
  console.error("\n  Arreglo: `resize: none;` en la MISMA regla de CSS que le da el estilo.");
  process.exit(1);
}
console.log(sinComprobar.length ? "\nNinguno falla, pero mira los de arriba." : "\nTODO BIEN.");
