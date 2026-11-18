// Cuántos clientes dice la web, contra cuántos hay en `src/lib/providers.ts`.
//
// La cifra grande y la frase del haz las pone el build contando la cinta de logos
// (`bakeReleaseData` en web/vite.config.js), y las metas las cuenta
// `poner-metadatos.mjs` del catálogo. Pero la cinta la escribe `pnpm clientes`
// (en web/), que el build no lanza, y quedan copias escritas a mano: la respuesta
// de la pregunta frecuente («Conoce 11 clientes», con su copia en los datos para
// buscadores, que se sacan del HTML de origen) y `llms.txt` («y 6 clientes más»).
// Con un cliente nuevo, cada una se quedaba con su número (lo cazó la revisión
// aparte del 2026-11-17). Aquí se mide que todas digan lo mismo que el catálogo.
//
//   node scripts/cifras-web-check.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");

// Dos lectores del catálogo: el de la cinta (`extraer-clientes.mjs`, un `    id:` por
// ficha tras `export const PROVIDERS`) y el de las metas (`poner-metadatos.mjs`, cada
// `label:`). Si no dan lo mismo, la culpa no es de la web sino del catálogo o del patrón.
const fuente = leer("src/lib/providers.ts");
const total = [...fuente.slice(fuente.indexOf("export const PROVIDERS")).matchAll(/^ {4}id: "([a-z0-9]+)",$/gm)].length;
const etiquetas = [...fuente.matchAll(/label:\s*"[^"]+"/g)].length;
const fallos = [];
if (total < 5) fallos.push(`src/lib/providers.ts solo da ${total} clientes: el patrón no encaja`);
if (etiquetas !== total) fallos.push(`providers.ts: ${total} fichas pero ${etiquetas} \`label:\`, y las metas (poner-metadatos.mjs) cuentan las etiquetas`);

// La frase del haz la rellena el build: sin su hueco, se quedaría el número escrito a mano.
// Se busca con la misma regex que `bakeReleaseData` (web/vite.config.js): un span con otro
// atributo delante, o un comentario que solo nombre el atributo, el build no lo rellena.
const hueco = (texto) => (texto.match(/<span data-cifra-otros>[^<]*<\/span>/g) || []).length;
if (hueco(leer("web/index.html")) !== 1) fallos.push("web/index.html: la frase del haz tiene que llevar UN `<span data-cifra-otros>`");
if (hueco(leer("web/portada/en.mjs")) !== 1) fallos.push("web/portada/en.mjs: la frase del haz tiene que llevar UN `<span data-cifra-otros>`");

const portada = leer("web/index.html");
const cinta = portada.match(/<ul class="cinta__grupo">([\s\S]*?)<\/ul>/);
const enCinta = cinta ? (cinta[1].match(/class="cli"/g) || []).length : 0;
if (enCinta !== total) fallos.push(`la cinta de logos de web/index.html lleva ${enCinta} y el catálogo ${total}: lanza \`pnpm clientes\` en web/`);

const faq = [...portada.matchAll(/Conoce (\d+) clientes/g)].map((m) => Number(m[1]));
if (faq.length < 2) fallos.push(`web/index.html: esperaba «Conoce N clientes» en la pregunta frecuente y en sus datos para buscadores, y sale ${faq.length} vez`);
for (const n of faq) if (n !== total) fallos.push(`web/index.html dice «Conoce ${n} clientes» y el catálogo tiene ${total}`);

// llms.txt nombra cinco y dice cuántos más, en los dos idiomas.
// Sin el `> ` de cita de Markdown al principio de cada línea, que un salto entre
// «y» y el número metería en medio.
const llms = leer("web/llms.txt").replace(/^> ?/gm, "").replace(/\s+/g, " ");
for (const [re, idioma] of [[/Cursor y (\d+) clientes/, "es"], [/Cursor and (\d+) more/, "en"]]) {
  const m = llms.match(re);
  if (!m) fallos.push(`web/llms.txt (${idioma}): no encuentro cuántos más tras «Cursor»`);
  else if (Number(m[1]) !== total - 5) fallos.push(`web/llms.txt (${idioma}) dice ${m[1]} más tras cinco nombrados, y el catálogo tiene ${total}`);
}

if (fallos.length) {
  for (const f of fallos) console.log(`FALLA ${f}`);
  process.exit(1);
}
console.log(`ok   ${total} clientes en el catálogo, en la cinta, en la pregunta frecuente y en llms.txt`);
