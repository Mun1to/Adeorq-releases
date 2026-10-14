// La página del móvil habla el idioma de la app, y esto vigila que lo siga haciendo.
//
//     node scripts/movil-idioma-check.mjs      (va en `pnpm comprobar`)
//
// Nació el 2026-10-14: `src-tauri/src/movil.html` solo existía en español, y
// con la app en inglés sus botones, avisos y rótulos salían en español (se vio
// al poner el móvil en el corte inglés del vídeo). La página trae su propio
// diccionario (`EN`), porque va dentro del binario y no puede importar el de
// la app, y traduce también lo que le contesta el PC (`DEL_PC`), que llega en
// español desde `movil.rs`, la ventana y `decisiones.rs`.
//
// Lo que mira, porque cada cosa se rompe por su lado:
//
//  1. FALTA: un tr("…") sin su línea en EN. Saldría en español siempre.
//  2. SOBRA: una línea de EN que ya no pide nadie, o que no lleva los mismos
//     huecos ({n}, {e}…) que su frase en español.
//  3. DEL PC: cada mensaje de DEL_PC tiene que seguir existiendo, letra a
//     letra, en el código que lo manda: si alguien lo retoca allí, la
//     traducción se queda huérfana y el móvil lo enseña en español. Y al revés:
//     lo que `movil.rs` o la ventana le pueden contestar al móvil lleva la suya.
//  4. EN DURO: texto con letras que solo tiene el español (tildes, ñ, ¿, ¡, «»)
//     fuera de un tr(), de los diccionarios, de los comentarios y de la mascota
//     generada. Un texto sin tildes se escapa: para eso está el banco del
//     navegador, `scripts/laboratorio/movil-ingles.js`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGINA = path.join(RAIZ, "src-tauri", "src", "movil.html");

/** Quien le contesta al móvil, sin sus tests (que llevan sus propios mensajes). */
const FUENTES = [
  "src-tauri/src/movil.rs",
  "src-tauri/src/decisiones.rs",
  "src-tauri/src/sessions.rs",
  "src-tauri/src/conserje.rs",
  "src/lib/movil.ts",
];

/** Mensajes de `movil.rs` que no llegan nunca a la página, y por qué. */
export const SOLO_EN_EL_PC = {
  "Enciende primero el conserje en el móvil.": "lo enseña Ajustes > Móvil en el PC (movil_emparejar)",
  "Ese móvil no se reconoce.": "lo enseña Ajustes > Móvil en el PC (movil_olvidar)",
};

/** Lo que se queda en duro a propósito. */
export const EN_DURO_A_PROPOSITO = [
  // Reconoce el bloque de compactación de un /fin, que viene así de la skill.
  "COMPACTACI[ÓO]N",
];

const ESPANOL = /[áéíóúüñ¿¡«»]/i;
// Hasta el primer módulo de tests: `sessions.rs` tiene otros `#[cfg(test)]` sueltos antes.
const sinTests = (src) => src.split(/^#\[cfg\(test\)\]\s*\nmod \w+ \{/m)[0];
const desescapar = (s) => s.replace(/\\"/g, '"').replace(/\\n/g, "\n");
const huecos = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

/** El objeto `const NOMBRE = { … };` de la página: sus claves y valores, y dónde está. */
export function diccionario(pagina, nombre) {
  const ini = pagina.indexOf(`const ${nombre} = {`);
  if (ini < 0) return null;
  const fin = pagina.indexOf("\n};", ini);
  const bloque = pagina.slice(ini, fin + 3);
  const pares = new Map();
  for (const m of bloque.matchAll(/^\s*"((?:[^"\\]|\\.)+)":\s*\n?\s*"((?:[^"\\]|\\.)*)",?$/gm)) {
    pares.set(desescapar(m[1]), desescapar(m[2]));
  }
  return { pares, ini, fin: fin + 3 };
}

/** Las regex de `DEL_PC_CON_HUECO`, partidas en los trozos fijos que tiene que seguir mandando el PC. */
export function trozosConHueco(pagina) {
  const ini = pagina.indexOf("const DEL_PC_CON_HUECO = [");
  if (ini < 0) return [];
  const bloque = pagina.slice(ini, pagina.indexOf("\n];", ini));
  return [...bloque.matchAll(/^\s*\[\/(.+)\/,\s*"/gm)].map((m) => ({
    regex: m[1],
    trozos: m[1]
      .replace(/^\^/, "")
      .replace(/\$$/, "")
      .split(/\([^)]*\)/)
      .map((t) => t.replace(/\\(.)/g, "$1"))
      .filter((t) => t.length >= 3),
  }));
}

/** Los mensajes que el PC le puede contestar al móvil, por fichero. */
export function mensajesDelPc(movilRs, movilTs) {
  const rs = sinTests(movilRs);
  const deRs = [
    ...rs.matchAll(/Respuesta::error\(\d+,\s*"((?:[^"\\]|\\.)+)"\)/g),
    ...rs.matchAll(/Err\("((?:[^"\\]|\\.)+)"\.into\(\)\)/g),
  ].map((m) => desescapar(m[1]));
  const deTs = [...movilTs.matchAll(/error:\s*"((?:[^"\\]|\\.)+)"/g)].map((m) => desescapar(m[1]));
  return [...new Set([...deRs, ...deTs])];
}

/** La página sin lo que no se ve: comentarios, diccionarios, mascota y lo que ya pasa por tr()
    (o por delPc(), con un mensaje del PC que está en su lista). */
export function loQueQueda(pagina) {
  let s = pagina;
  const delPc = diccionario(pagina, "DEL_PC")?.pares ?? new Map();
  s = s
    .split("\n")
    .map((l) => (l.includes("delPc(") ? l.replace(/"((?:[^"\\]|\\.)*)"/g, (m, k) => (delPc.has(desescapar(k)) ? '""' : m)) : l))
    .join("\n");
  for (const nombre of ["EN", "DEL_PC"]) {
    const d = diccionario(s, nombre);
    if (d) s = s.slice(0, d.ini) + s.slice(d.fin);
  }
  const huecosIni = s.indexOf("const DEL_PC_CON_HUECO = [");
  if (huecosIni >= 0) s = s.slice(0, huecosIni) + s.slice(s.indexOf("\n];", huecosIni) + 3);
  const mIni = s.indexOf("// <mascota-generada>");
  const mFin = s.indexOf("// </mascota-generada>");
  if (mIni >= 0 && mFin > mIni) s = s.slice(0, mIni) + s.slice(mFin);
  return s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1")
    .replace(/\btr\(\s*"(?:[^"\\]|\\.)*"/g, "tr(");
}

export function revisar(pagina, fuentes) {
  const fallos = [];
  const en = diccionario(pagina, "EN");
  const delPc = diccionario(pagina, "DEL_PC");
  if (!en || !delPc) return ["la página no trae `const EN = {…};` o `const DEL_PC = {…};`"];

  // 1 y 2. Lo que se pide y lo que hay.
  const pedidas = new Set();
  const resto = pagina.slice(0, en.ini) + pagina.slice(en.fin);
  for (const m of resto.matchAll(/\btr\(\s*"((?:[^"\\]|\\.)+)"/g)) pedidas.add(desescapar(m[1]));
  for (const k of pedidas) if (!en.pares.has(k)) fallos.push(`FALTA en EN: tr("${k}")`);
  for (const [k, v] of en.pares) {
    if (!pedidas.has(k)) fallos.push(`SOBRA en EN (nadie la pide): "${k}"`);
    if (!v.trim()) fallos.push(`EN vacía: "${k}"`);
    else if (huecos(k) !== huecos(v)) fallos.push(`EN con otros huecos: "${k}" → "${v}"`);
  }

  // 3. Lo que manda el PC, en los dos sentidos.
  const todo = Object.values(fuentes).map(sinTests).join("\n");
  for (const k of delPc.pares.keys()) {
    if (!todo.includes(`"${k.replace(/"/g, '\\"')}"`)) fallos.push(`DEL_PC se quedó vieja: "${k}" ya no está en ${FUENTES.join(", ")}`);
  }
  for (const { regex, trozos } of trozosConHueco(pagina)) {
    for (const t of trozos) if (!todo.includes(t)) fallos.push(`DEL_PC_CON_HUECO se quedó vieja: /${regex}/ (no encuentro «${t}»)`);
  }
  for (const msg of mensajesDelPc(fuentes["src-tauri/src/movil.rs"], fuentes["src/lib/movil.ts"])) {
    if (!delPc.pares.has(msg) && !(msg in SOLO_EN_EL_PC)) fallos.push(`le puede llegar al móvil sin traducir: "${msg}" (añádelo a DEL_PC)`);
  }

  // 4. Lo que se quedó en duro.
  loQueQueda(pagina).split("\n").forEach((l) => {
    if (!ESPANOL.test(l) || EN_DURO_A_PROPOSITO.some((a) => l.includes(a))) return;
    fallos.push(`EN DURO, sin tr(): ${l.trim().slice(0, 110)}`);
  });
  return fallos;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pagina = fs.readFileSync(PAGINA, "utf8");
  const fuentes = Object.fromEntries(FUENTES.map((f) => [f, fs.readFileSync(path.join(RAIZ, f), "utf8")]));
  const fallos = revisar(pagina, fuentes);
  if (fallos.length) {
    console.log(`movil.html no habla bien inglés (${fallos.length}):`);
    for (const f of fallos) console.log(`  · ${f}`);
    process.exit(1);
  }
  const en = diccionario(pagina, "EN").pares.size;
  const pc = diccionario(pagina, "DEL_PC").pares.size;
  console.log(`movil.html: ${en} frases suyas y ${pc} del PC, todas con su inglés.`);
}
