// Que la letra de la app se lea en todos los temas.  `node scripts/temas-check.mjs`
//
// Lee cada tema de `src/estilos/01-base.css` (`:root[data-theme="x"], [data-tema-prev="x"]`)
// y mide, contra su fondo (`--panel-solid`) y contra el de su terminal en los
// estilos lisos (`--tema-term`, o el fondo con una gota de la letra), que pasen
// de 4,5:1, lo que pide WCAG para la letra de tamaño normal:
//
//   - su letra (`--text`);
//   - el gris de los rótulos: la letra al `--letra-gris` (74 % si no lo dice)
//     sobre el fondo; en Terminal, ocho puntos menos; en Consola, cuatro más y
//     sobre su barra, que es donde van sus pestañas, y en Liso, diez más y sobre
//     su pared y su cabecera (`42-aspectos.css`). Los colores de estado no se
//     miden sobre esas barras: van sobre el fondo o sobre la terminal;
//   - el acento y cada color de estado que declare (`--done`, `--ok`, `--ask`,
//     `--warn`, `--mal`, `--wait`), que van de letra en muchos sitios: el nombre
//     de una terminal que terminó, en Terminal y Consola, va en `--done`;
//   - lo que va encima del acento (`--on-accent`), sobre el acento y sobre
//     `--done`, que es como pinta Consola la cabecera de lo terminado.
//
// Nació de la revisión de los claros (2026-11-21): en Catppuccin Latte el
// «terminó» daba 2,64:1 y su amarillo 2,31, y el gris de Solarizado claro, 3,02,
// mientras el comentario de los claros decía «legibles en su fondo». Antes, el
// verde de «bien» de Claro y Papel había estado en 1,6:1. Los de la casa que no
// declaran colores de estado heredan los del azul, hechos para fondo oscuro.
//
// La terminal no se mide aquí: sus colores son los del esquema, tal cual.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MINIMO = 4.5;

const hex = (h) => {
  h = h.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lin = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luz = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export const contraste = (a, b) => {
  const x = luz(a), y = luz(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** Como `color-mix(in srgb, a p, b)`. */
const mezcla = (a, b, p) => a.map((x, i) => x * p + b[i] * (1 - p));

/** Los fallos de los temas de una hoja, como frases. */
export function fallosDe(css) {
  const fallos = [];
  let temas = 0;
  for (const m of css.matchAll(/:root\[data-theme="([^"]+)"\],\s*\[data-tema-prev="\1"\]\s*\{([^}]*)\}/g)) {
    const [, tema, cuerpo] = m;
    const color = (k) => {
      const r = cuerpo.match(new RegExp(`${k}:\\s*(#[0-9a-fA-F]{3,6})\\b`));
      return r && hex(r[1]);
    };
    const fondo = color("--panel-solid");
    const letra = color("--text");
    // Contraste y los apagados ponen su letra con var(): no son de la receta.
    if (!fondo || !letra) continue;
    temas++;
    const r = cuerpo.match(/--letra-gris:\s*([\d.]+)%/);
    const gris = r ? Number(r[1]) / 100 : 0.74;
    // Los fondos de cada estilo, como los mezcla `42-aspectos.css`.
    const term = color("--tema-term") || mezcla(fondo, letra, 0.96);
    const consola = color("--tema-term") || mezcla(fondo, letra, 0.97);
    const barraConsola = mezcla(letra, consola, 0.09);
    const mal = (que, valor) => fallos.push(`${tema}: ${que} da ${valor.toFixed(2)}:1`);
    const medir = (que, c, fondos = [fondo, term]) => {
      const peor = Math.min(...fondos.map((f) => contraste(c, f)));
      if (peor < MINIMO) mal(que, peor);
    };
    medir("la letra", letra);
    medir("el gris de los rótulos", mezcla(letra, fondo, gris), [fondo]);
    medir("el gris de Terminal", mezcla(letra, term, gris - 0.08), [term]);
    // Las pestañas de Consola van sobre su barra, un 9 % de letra más honda, y
    // los rótulos de Liso sobre su pared y su cabecera (13 y 15,5 %).
    medir("el gris de Consola", mezcla(letra, consola, Math.min(1, gris + 0.04)), [consola, barraConsola]);
    const pared = mezcla(fondo, letra, 0.87);
    medir("el gris de Liso", mezcla(letra, pared, Math.min(1, gris + 0.1)), [pared, mezcla(fondo, letra, 0.845)]);
    for (const k of ["accent", "done", "ok", "ask", "warn", "mal", "wait"]) {
      const c = color(`--${k}`);
      if (c) medir(`--${k}`, c);
    }
    const sobre = color("--on-accent") || hex("#071019");
    for (const k of ["accent", "done"]) {
      const c = color(`--${k}`);
      if (c && contraste(sobre, c) < MINIMO) mal(`--on-accent sobre --${k}`, contraste(sobre, c));
    }
    // La cuenta de la pestaña activa va en `--on-accent` entero
    // (`--c3-sobre-blanco-2`), así que la mide la línea de arriba. La marca
    // «beta» va en `--ask`, y sobre la barra de Consola y la pared de Liso
    // mezclada con la letra (`42-aspectos.css`).
    const ask = color("--ask");
    if (ask) medir("la marca beta en Consola y Liso", mezcla(ask, letra, 0.55), [barraConsola, pared]);
  }
  return { fallos, temas };
}

// Que el propio vigilante vea un fallo: un tema de letra gris sobre gris.
const PRUEBA = ':root[data-theme="x"],\n[data-tema-prev="x"] {\n  --panel-solid: #eeeeee;\n  --text: #777777;\n  --done: #ffaa00;\n}';
if (fallosDe(PRUEBA).fallos.length < 3) {
  console.error("temas-check: no ve los fallos de un tema hecho a propósito para fallar");
  process.exit(1);
}

const { fallos, temas } = fallosDe(fs.readFileSync(path.join(RAIZ, "src", "estilos", "01-base.css"), "utf8"));
if (temas < 20) {
  console.error(`temas-check: solo encuentro ${temas} temas en 01-base.css; ¿cambió la forma de sus bloques?`);
  process.exit(1);
}
if (fallos.length) {
  console.error(`temas-check: ${fallos.length} colores de la app por debajo de ${MINIMO}:1`);
  for (const f of fallos) console.error(`  ${f}`);
  console.error("  Sube `--letra-gris` del tema, o aclara (en un oscuro) u oscurece (en un claro) el color lo justo, con el suyo al lado en un comentario.");
  process.exit(1);
}
console.log(`temas-check: la letra de los ${temas} temas pasa de ${MINIMO}:1`);
