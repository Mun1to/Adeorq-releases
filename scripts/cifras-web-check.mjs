// Cuántos clientes dice la web, contra cuántos hay en `src/lib/providers.ts`.
//
// La frase del haz («y otros ocho») la pone el build contando la cinta de logos
// (`bakeReleaseData` en web/vite.config.js), y las metas las cuenta
// `poner-metadatos.mjs` del catálogo. Pero la cinta la escribe `pnpm clientes`
// (en web/), que el build no lanza, y quedan copias escritas a mano: la respuesta
// de la pregunta frecuente («Conoce 11 clientes», con su copia en los datos para
// buscadores, que se sacan del HTML de origen) y `llms.txt` («y 6 clientes más»).
// Con un cliente nuevo, cada una se quedaba con su número (lo cazó la revisión
// aparte del 2026-11-17). Aquí se mide que todas digan lo mismo que el catálogo,
// sin los que la web no enseña (`FUERA_DE_LA_WEB` en web/scripts/extraer-clientes.mjs:
// Pi, desde el 2026-11-23).
//
//   node scripts/cifras-web-check.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FUERA_DE_LA_WEB } from "../web/scripts/extraer-clientes.mjs";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");

// Dos lectores del catálogo: el de la cinta (`extraer-clientes.mjs`, un `    id:` por
// ficha tras `export const PROVIDERS`) y el de las metas (`poner-metadatos.mjs`, cada
// `label:`). Si no dan lo mismo, la culpa no es de la web sino del catálogo o del patrón.
const fuente = leer("src/lib/providers.ts");
const ids = [...fuente.slice(fuente.indexOf("export const PROVIDERS")).matchAll(/^ {4}id: "([a-z0-9]+)",$/gm)].map((m) => m[1]);
const etiquetas = [...fuente.matchAll(/label:\s*"[^"]+"/g)].length;
const fallos = [];
if (ids.length < 5) fallos.push(`src/lib/providers.ts solo da ${ids.length} clientes: el patrón no encaja`);
if (etiquetas !== ids.length) fallos.push(`providers.ts: ${ids.length} fichas pero ${etiquetas} \`label:\`, y las metas (poner-metadatos.mjs) cuentan las etiquetas`);
for (const id of FUERA_DE_LA_WEB) if (!ids.includes(id)) fallos.push(`FUERA_DE_LA_WEB nombra «${id}», que ya no está en providers.ts`);
const total = ids.filter((id) => !FUERA_DE_LA_WEB.includes(id)).length;

// La frase del haz la rellena el build: sin su hueco, se quedaría el número escrito a mano.
// Se busca con la misma regex que `bakeReleaseData` (web/vite.config.js): un span con otro
// atributo delante, o un comentario que solo nombre el atributo, el build no lo rellena.
const hueco = (texto) => (texto.match(/<span data-cifra-otros>[^<]*<\/span>/g) || []).length;
if (hueco(leer("web/index.html")) !== 1) fallos.push("web/index.html: la frase del haz tiene que llevar UN `<span data-cifra-otros>`");
if (hueco(leer("web/portada/en.mjs")) !== 1) fallos.push("web/portada/en.mjs: la frase del haz tiene que llevar UN `<span data-cifra-otros>`");

const portada = leer("web/index.html");
const cinta = portada.match(/<ul class="cinta__grupo">([\s\S]*?)<\/ul>/);
const enCinta = cinta ? (cinta[1].match(/class="cli"/g) || []).length : 0;
if (enCinta !== total) fallos.push(`la cinta de logos de web/index.html lleva ${enCinta} y el catálogo ${total} para la web: lanza \`pnpm clientes\` en web/`);

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

// Y lo que la web no enseña no se nombra en lo que la web publica: ni en la cinta, ni
// en la portada en los dos idiomas, ni en llms.txt, ni en las páginas por búsqueda,
// ni en la guía. Las páginas de privacidad quedan fuera a propósito: la app sigue
// leyendo su historial, y lo que dicen tiene que seguir siendo verdad.
const etiquetaDe = (id) => fuente.slice(fuente.indexOf(`    id: "${id}",`)).match(/^ {4}label: "([^"]+)",$/m)?.[1];
const publicado = ["web/index.html", "web/portada/en.mjs", "web/llms.txt", "web/guia.html", "web/js/guia-i18n.js",
  ...fs.readdirSync(path.join(RAIZ, "web/paginas")).filter((f) => f.endsWith(".mjs")).map((f) => `web/paginas/${f}`)];
for (const id of FUERA_DE_LA_WEB) {
  const nombre = etiquetaDe(id);
  if (!nombre) continue;
  const re = new RegExp(`(?<![\\w-])${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`);
  for (const r of publicado) {
    // Los comentarios del taller no se publican: se miran solo el texto y los datos.
    const texto = leer(r).replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    if (re.test(texto)) fallos.push(`${r} nombra «${nombre}», que está en FUERA_DE_LA_WEB (web/scripts/extraer-clientes.mjs)`);
  }
}

if (fallos.length) {
  for (const f of fallos) console.log(`FALLA ${f}`);
  process.exit(1);
}
console.log(`ok   ${total} clientes para la web (catálogo sin ${FUERA_DE_LA_WEB.join(", ") || "nada"}), en la cinta, en la pregunta frecuente y en llms.txt`);
