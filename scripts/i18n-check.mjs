// Comprueba que la interfaz habla inglés cuando se le pide inglés.
//
//     pnpm i18n
//
// Existe por un fallo real: Munir tenía Adeorq en inglés y le salían en
// español el menú entero del lienzo, los ajustes de Discord y el panel de la
// derecha. No lo detecta el compilador (son cadenas válidas), no lo detecta
// ningún test (no fallan), y leyendo el código no se ve. Solo se ve mirando la
// pantalla con el idioma cambiado, y eso no se hace en cada cambio.
//
// Mira dos cosas distintas, porque los dos fallos que hubo eran distintos:
//
//  1. FALTA: alguien escribió t("algo") y ese "algo" no está en el diccionario.
//     Se queda en español para siempre y nadie se entera.
//  2. EN DURO: alguien escribió el texto directamente en el JSX, sin t(). No
//     hay nada que traducir, así que el punto 1 ni se entera. Es lo que le
//     pasaba al panel de skills.
//
// Lo segundo es una heurística: se buscan literales con letras que solo
// existen en español (tildes, ñ, ¿, ¡, «»). Un texto inglés sin tildes se
// escapa, y aun así caza la inmensa mayoría.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const ESPANOL = /[áéíóúüñ¿¡«»]/i;

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

const corto = (s) => (s.length > 64 ? `${s.slice(0, 64)}…` : s);

// Las claves del diccionario inglés: `Algo: "..."` o `"Algo": "..."`.
const dicc = readFileSync(join(SRC, "lib", "i18n.ts"), "utf8");
const claves = new Set(
  [...dicc.matchAll(/^ {2}(?:"((?:[^"\\]|\\.)+)"|([A-Za-zÁÉÍÓÚÑáéíóúñ][\wÁÉÍÓÚÑáéíóúñ]*)) *:/gm)].map(
    (m) => (m[1] ?? m[2]).replace(/\\"/g, '"').replace(/\\n/g, "\n"),
  ),
);

const faltan = new Map();
const enDuro = new Map();

for (const f of archivos(SRC)) {
  if (f.endsWith("i18n.ts")) continue;
  const src = readFileSync(f, "utf8");
  const donde = f.slice(SRC.length + 1).replace(/\\/g, "/");

  // 1. Lo que pide traducción y no la tiene.
  const traducidas = new Set();
  for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)+)"/g)) {
    const clave = m[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
    traducidas.add(m[1]);
    if (!claves.has(clave) && !faltan.has(clave)) faltan.set(clave, donde);
  }

  // 2. Lo que se quedó en duro, mirando SOLO lo que se pinta en pantalla.
  //
  //    Buscar cualquier literal en español daba 85 avisos y casi todos eran
  //    correctos: los encargos que Adeorq le escribe a un agente van en
  //    español A PROPÓSITO, y una herramienta que grita en lo que está bien
  //    se acaba ignorando. Así que solo se miran dos sitios: los atributos
  //    que el usuario lee y el texto suelto entre etiquetas.
  const sinComentarios = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  const sospechosos = [
    // placeholder="…", data-tip="…", title="…". Los ya envueltos van como
    // `={t("…")}` y no casan, que es justo lo que se quiere.
    ...[...sinComentarios.matchAll(/(?:placeholder|data-tip|title|aria-label|alt)=\{?\s*"([^"\n]{4,})"/g)],
    // Texto suelto entre etiquetas: <p>Arrastra uno sobre…</p>
    ...[...sinComentarios.matchAll(/>\s*([^<>{}\n]{6,}?)\s*</g)],
  ];

  for (const m of sospechosos) {
    const txt = m[1].trim();
    if (!ESPANOL.test(txt)) continue;
    if (traducidas.has(txt) || claves.has(txt)) continue;
    const clave = `${donde}|${txt}`;
    if (!enDuro.has(clave)) enDuro.set(clave, [donde, txt]);
  }
}

let mal = 0;

if (faltan.size) {
  mal += faltan.size;
  console.log(`\nSIN TRADUCIR (${faltan.size}): pasan por t() y no están en el diccionario`);
  for (const [k, donde] of [...faltan].sort()) {
    console.log(`  ${donde.padEnd(28)} ${corto(k)}`);
  }
}

if (enDuro.size) {
  mal += enDuro.size;
  console.log(`\nEN DURO (${enDuro.size}): texto en español que nunca pasa por el traductor`);
  for (const [donde, txt] of [...enDuro.values()].sort()) {
    console.log(`  ${donde.padEnd(28)} ${corto(txt)}`);
  }
}

if (!mal) {
  console.log(`Idioma: ${claves.size} textos traducidos y ninguno suelto.`);
}
process.exit(mal ? 1 : 0);
