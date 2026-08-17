// Comprueba que los SVG sueltos del repo son XML que un navegador acepta.
//
//     pnpm svg
//
// Existe por un fallo real que costó nueve días y dos diagnósticos malos: el
// botón «Descargar Adeorq para Windows» del README estuvo ROTO en GitHub del 8
// al 17 de agosto de 2026 por un «--azul» dentro de un comentario del SVG. Un
// guion doble dentro de un comentario XML es ilegal (la especificación lo
// prohíbe), y un SVG servido como `image/svg+xml` se parsea en ESTRICTO: el
// archivo entero deja de renderizar y el navegador enseña el alt. Ningún
// editor lo avisa, el servidor lo sirve con 200, y a simple vista el archivo
// parece sano; el error solo lo dice DOMParser: «Comment must not contain
// '--' (double-hyphen)». La primera vez (2026-08-08) se diagnosticó mal y se
// «arregló» cambiando el markdown del README; segunda vez, prueba automática.
//
// Tres minas, todas de la misma familia (válido a ojo, muerto en el parser):
//
//  1. `--` dentro de un comentario XML.
//  2. Un BOM delante del `<svg` (Set-Content de PowerShell los regala).
//  3. Un archivo que no empieza por `<svg` ni `<?xml`.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const FUERA = new Set(["node_modules", "dist", ".git", "src-tauri", ".playwright-mcp"]);

function svgsDe(dir) {
  const out = [];
  for (const nombre of readdirSync(dir)) {
    if (FUERA.has(nombre)) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) out.push(...svgsDe(ruta));
    else if (nombre.endsWith(".svg")) out.push(ruta);
  }
  return out;
}

const fallos = [];
const svgs = svgsDe(RAIZ);

for (const ruta of svgs) {
  const bytes = readFileSync(ruta);
  const donde = relative(RAIZ, ruta);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fallos.push(`${donde}: lleva BOM delante del <svg`);
  }
  const texto = bytes.toString("utf8").replace(/^﻿/, "");
  if (!/^\s*(<\?xml|<svg)/.test(texto)) {
    fallos.push(`${donde}: no empieza por <svg ni <?xml`);
  }
  for (const m of texto.matchAll(/<!--([\s\S]*?)-->/g)) {
    if (m[1].includes("--")) {
      const linea = texto.slice(0, m.index).split("\n").length;
      fallos.push(`${donde}:${linea}: guion doble dentro de un comentario XML (rompe el SVG entero)`);
      break;
    }
  }
}

if (fallos.length) {
  console.error(`SVG ROTOS (${fallos.length}):`);
  for (const f of fallos) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`SVG: ${svgs.length} archivos y todos parsean como XML.`);
