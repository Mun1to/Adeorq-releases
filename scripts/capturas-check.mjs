// Las capturas de «Qué hace» en la portada llevan sus copias pequeñas: las suyas, y al día.
//
// Cada foto de la muestra se pinta como mucho a unos 714 px CSS, y el original
// mide 3840x2160: el navegador decodificaba el PNG entero cada vez que bajando
// se encendía otro rasgo, 36 a 60 ms por foto y dos veces, con la gráfica
// esperando para enseñar el fotograma (2026-11-22, web/scripts/fotogramas.mjs
// a 1920: el peor fotograma de cada vuelta, de 88-221 a 21-33 ms con el
// `srcset`). Las copias de 960 y 1440 las saca web/scripts/hacer-tamanos.mjs.
// Aquí se mide que:
//   - toda captura de web/index.html de más de 1440 de ancho esté en FOTOS de
//     hacer-tamanos y lleve `srcset` y `sizes`, y su versión inglesa
//     (`data-en-attr`, con portada/en.mjs) también, con la misma foto de /en/;
//   - cada `srcset` sea justo el de su `src`: sus copias y el original, de la
//     misma foto y del mismo idioma;
//   - cada candidato exista y mida de ancho lo que dice su `w`, con la proporción
//     del original;
//   - el `sizes` de las fotos de la muestra sea SIZES (abajo), lo que mide la
//     foto pintada, y que lo que decide ese ancho en portada.css (REJILLA) siga
//     como cuando se midió;
//   - ni las capturas de FOTOS ni sus copias hayan cambiado desde que salieron
//     de hacer-tamanos (la huella de assets/screens/tamanos.json): la copia de
//     otra foto o de la captura vieja mide lo mismo, y solo la huella la ve.
// Lo que no ve: cambiar SIZES y web/index.html juntos a un valor malo; eso solo
// lo mide un navegador.
//
//   node scripts/capturas-check.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(RAIZ, "web");
const { FOTOS, IDIOMAS, ANCHOS, pantallas, huella } = await import(pathToFileURL(path.join(WEB, "scripts/hacer-tamanos.mjs")).href);
const { default: TEXTOS } = await import(pathToFileURL(path.join(WEB, "portada/en.mjs")).href);
const fallos = [];
const REHACER = "lanza `node scripts/hacer-tamanos.mjs` desde web/";

// Lo que mide la foto pintada, en px CSS. Medido el 2026-11-22 en Brave con
// `getBoundingClientRect` de `.rasgo__foto img`, cada píxel de 600 a 1940 de
// ancho: de 901 a 1320 mide 0,876vw - 442 (la caja de 1320 con 4vw de relleno,
// la columna de 440, el hueco de 4,4vw y 2 px de borde), de 347 px a 901 a 714
// a 1320, y baja a 706 desde 1454, cuando el hueco llega a su tope. La fórmula
// va de 1 a 19 px por encima hasta 1299 y el tope de 720, de 6 a 23 desde 1300:
// por debajo, el navegador elegiría una copia que hay que ampliar. Por debajo
// de 901 la foto va a lo ancho.
const SIZES = "(min-width: 1300px) 720px, (min-width: 901px) calc(92vw - 480px), 100vw";

// Lo que decide el ancho de la foto en portada.css, tal como estaba cuando se
// midió SIZES. Si una de estas líneas cambia, SIZES puede quedarse corto (con la
// caja a 1440 la foto pasa a 826 px, y a 2x se amplía la copia de 1440 un 15 %):
// se mide otra vez, se cambia SIZES aquí y en web/index.html, y se copia aquí la
// línea nueva.
const REJILLA = [
  ".explica__caja {\n  max-width: 1320px;\n  margin: 0 auto;\n  padding: 0 clamp(18px, 4vw, 54px);\n}",
  "    grid-template-columns: minmax(300px, 440px) minmax(0, 1fr);\n    column-gap: clamp(32px, 4.4vw, 64px);",
  "  border: 1px solid var(--p-linea2);\n  border-radius: 12px;\n  overflow: hidden;\n  background: var(--p-panel);\n  aspect-ratio: 16 / 9;",
];

/** Ancho y alto de un PNG, de su cabecera IHDR. */
function medidas(ruta) {
  if (!fs.existsSync(ruta)) return null;
  const b = Buffer.alloc(24);
  const fd = fs.openSync(ruta, "r");
  fs.readSync(fd, b, 0, 24, 0);
  fs.closeSync(fd);
  if (b.toString("latin1", 12, 16) !== "IHDR") return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const junto = (juego) => juego.split(",").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean).join(", ");

/** Una captura de la portada con su `srcset` y su `sizes`, en el idioma de su página. */
function revisar(donde, src, srcset, sizes, idioma, enMuestra) {
  const o = medidas(path.join(WEB, src));
  if (!o) { fallos.push(`${donde}: ${src} no existe o no es un PNG`); return; }
  const nombre = path.basename(src, ".png");
  if (!FOTOS.includes(nombre)) fallos.push(`${donde}: ${nombre} no está en FOTOS de web/scripts/hacer-tamanos.mjs, y sus copias no las saca ni las vigila nadie (súmala y ${REHACER})`);
  if (!srcset || !sizes) { fallos.push(`${donde}: ${src} mide ${o.w} y no lleva \`srcset\` y \`sizes\` (si no está en FOTOS de web/scripts/hacer-tamanos.mjs, súmala; ${REHACER} y ponlos)`); return; }
  const carpeta = src.match(/^\/assets\/screens\/([^/]+)\//)?.[1];
  if (carpeta !== idioma) fallos.push(`${donde}: ${src} es de assets/screens/${carpeta}/ y esta página va en ${idioma}`);
  if (enMuestra && sizes.replace(/\s+/g, " ").trim() !== SIZES) fallos.push(`${donde}: sizes="${sizes}" y la foto se pinta a «${SIZES}» (lo mide SIZES en scripts/capturas-check.mjs)`);
  const base = src.replace(/\.png$/, "");
  const candidatos = [...ANCHOS.map((a) => [`${base}-${a}.png`, a]), [src, o.w]];
  const debe = candidatos.map(([url, w]) => `${url} ${w}w`).join(", ");
  if (junto(srcset) !== debe) fallos.push(`${donde}: srcset="${srcset}" y el de ${src} es «${debe}»`);
  for (const [url, w] of candidatos.slice(0, -1)) {
    const m = medidas(path.join(WEB, url));
    if (!m) { fallos.push(`${donde}: falta ${url} (si la foto es nueva, súmala a FOTOS de web/scripts/hacer-tamanos.mjs y ${REHACER})`); continue; }
    if (m.w !== w) fallos.push(`${donde}: ${url} mide ${m.w} de ancho y el srcset dice ${w}w (${REHACER})`);
    if (Math.abs(m.h - Math.round((m.w * o.h) / o.w)) > 1) fallos.push(`${donde}: ${url} es de ${m.w}x${m.h} y su original de ${o.w}x${o.h}, otra proporción (${REHACER})`);
  }
}

const portada = fs.readFileSync(path.join(WEB, "index.html"), "utf8");
const tope = Math.max(...ANCHOS);
let grandes = 0;
for (const m of portada.matchAll(/<img\b[^>]*>/g)) {
  const etiqueta = m[0];
  const attr = (n) => etiqueta.match(new RegExp(`\\s${n}="([^"]*)"`))?.[1];
  const src = attr("src") || "";
  if (!/(^|\/)assets\/screens\//.test(src)) continue;
  // Una captura que no se puede medir (una errata, una ruta relativa) no se salta: la lupa abre ese src.
  const o = medidas(path.join(WEB, src));
  if (!o) { fallos.push(`web/index.html: ${src} no existe o no es un PNG (la lupa abre ese src)`); continue; }
  if (o.w <= tope) continue;
  grandes++;
  // SIZES es el ancho de la foto de la muestra; una captura de otra sección tendrá el suyo.
  const enMuestra = /<figure class="rasgo__foto">\s*$/.test(portada.slice(0, m.index));
  revisar(`web/index.html (${src})`, src, attr("srcset"), attr("sizes"), "es", enMuestra);
  // La portada inglesa es esta misma etiqueta con lo que diga su data-en-attr.
  const en = Object.fromEntries((attr("data-en-attr") || "").split("|").map((par) => par.split(":").map((s) => s.trim())));
  if (!en.src || !en.srcset) { fallos.push(`web/index.html: ${src} no lleva src y srcset en su data-en-attr (o un «>» dentro de un atributo de delante corta la etiqueta), y la portada inglesa pintaría las fotos españolas`); continue; }
  const faltan = [en.src, en.srcset, en.sizes].filter((k) => k && !(k in TEXTOS));
  if (faltan.length) { fallos.push(`web/portada/en.mjs: falta ${faltan.map((k) => `«${k}»`).join(" y ")}, la de ${src}`); continue; }
  // La inglesa es la misma foto, y con el sizes que de verdad lleva su página.
  const srcEn = TEXTOS[en.src];
  const debeEn = src.replace("/assets/screens/es/", "/assets/screens/en/");
  if (srcEn !== debeEn) fallos.push(`web/index.html: la foto de ${src} es ${srcEn} en la portada inglesa (data-en-attr apunta a «${en.src}»), y debería ser ${debeEn}`);
  revisar(`web/portada/en.mjs (${en.srcset})`, srcEn, TEXTOS[en.srcset], en.sizes ? TEXTOS[en.sizes] : attr("sizes"), "en", enMuestra);
}

const css = fs.readFileSync(path.join(WEB, "portada/portada.css"), "utf8").replace(/\r\n/g, "\n");
for (const trozo of REJILLA) if (!css.includes(trozo)) fallos.push(`web/portada/portada.css ya no dice «${trozo.trim().split("\n")[0]}…» como cuando se midió SIZES: mide otra vez el ancho de \`.rasgo__foto img\` de 901 a 1920, cambia SIZES aquí y en web/index.html, y pon la línea nueva en REJILLA`);

const rutaManifiesto = path.join(pantallas, "tamanos.json");
if (!fs.existsSync(rutaManifiesto)) fallos.push(`falta web/assets/screens/tamanos.json, con la huella de cada captura y sus copias (${REHACER})`);
const manifiesto = fs.existsSync(rutaManifiesto) ? JSON.parse(fs.readFileSync(rutaManifiesto, "utf8")) : null;
for (const idioma of manifiesto ? IDIOMAS : []) {
  for (const foto of FOTOS) {
    const original = `${idioma}/${foto}.png`;
    if (!fs.existsSync(path.join(pantallas, original))) { fallos.push(`falta web/assets/screens/${original}`); continue; }
    if (manifiesto[original] !== huella(path.join(pantallas, original))) { fallos.push(`web/assets/screens/${original} cambió y sus copias de ${ANCHOS.join(" y ")} son de la anterior (${REHACER})`); continue; }
    for (const ancho of ANCHOS) {
      const copia = `${idioma}/${foto}-${ancho}.png`;
      if (!fs.existsSync(path.join(pantallas, copia))) continue; // ya lo dice el srcset que la pide
      if (manifiesto[copia] !== huella(path.join(pantallas, copia))) fallos.push(`web/assets/screens/${copia} no es la que salió de ${original} (${REHACER})`);
    }
  }
}

if (fallos.length) {
  for (const f of fallos) console.log(`FALLA ${f}`);
  process.exit(1);
}
console.log(`ok   ${grandes} capturas grandes con srcset en español y en inglés, cada una con sus copias de ${ANCHOS.join(" y ")}, medidas y al día`);
