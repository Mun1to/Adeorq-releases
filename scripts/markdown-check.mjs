// Que el markdown de fuera no traiga código dentro.  ·  pnpm markdown
//
// Tres pantallas pintan markdown que no ha escrito Adeorq: el modo chat pinta
// el transcript de tus sesiones, la Memoria pinta tus bóvedas de Obsidian y la
// Guía pinta los documentos del repo. Todo eso es un DATO (regla AL), y esta
// prueba es la que impide que vuelva a ser una orden.
//
// El fallo que fija es real y está medido (2026-08-19). Antes de `markdown.ts`,
// el chat pasaba el transcript por `marked` y lo metía con
// `dangerouslySetInnerHTML` sin filtrar. En Chromium, con esa combinación:
//
//     disparos: ["onerror","svg-onload"]
//
// Es decir: código corriendo dentro del WebView de Adeorq. Y en
// `tauri.conf.json` la política de seguridad de contenido está en `null`, así
// que debajo no había otra red.
//
// POR QUÉ SE COMPRUEBA EL ATRIBUTO Y NO SI EJECUTA. Aquí no hay navegador: hay
// un DOM de mentira (jsdom), que no carga imágenes y por tanto NUNCA dispararía
// un `onerror`. Una prueba que buscara el disparo saldría verde sin haber
// comprobado nada, que es exactamente cómo la prueba del scroll de xterm dio
// verde de mentira dos veces. Así que se comprueba lo único que aquí es cierto:
// que el atributo peligroso NO sobrevive al filtro. Si no está, no puede
// disparar en ningún navegador.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createDOMPurify from "dompurify";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/* La lista de lo permitido, leída del propio `markdown.ts` en vez de copiada.
   Dos listas que hay que mantener a la vez acaban siendo distintas, y entonces
   la prueba pasa a comprobar una versión que no es la que corre. */
const fuente = readFileSync(join(RAIZ, "src/lib/markdown.ts"), "utf8");

function arrayDe(nombre) {
  const m = fuente.match(new RegExp(`const ${nombre} = \\[([\\s\\S]*?)\\];`));
  if (!m) {
    console.error(`no encuentro ${nombre} en src/lib/markdown.ts`);
    process.exit(1);
  }
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

const ETIQUETAS = arrayDe("ETIQUETAS");
const ATRIBUTOS = arrayDe("ATRIBUTOS");

const purify = createDOMPurify(new JSDOM("").window);
const aHtml = (md) =>
  purify.sanitize(marked.parse(md, { async: false }), {
    ALLOWED_TAGS: ETIQUETAS,
    ALLOWED_ATTR: ATRIBUTOS,
  });

let fallos = 0;
const ok = (que, bien) => {
  console.log(`${bien ? "  ok  " : "FALLA "} ${que}`);
  if (!bien) fallos++;
};

/* ── Lo que NO puede pasar ──────────────────────────────────────────────
   Cada caso es una forma de llegar hasta aquí que no es hipotética: un agente
   citando el README de un repo clonado, una nota de Obsidian bajada de fuera,
   un mensaje que Munir pegó de una web. */

const VENENOS = [
  ["imagen con onerror", '<img src=x onerror="alert(1)">', /onerror/i],
  ["svg con onload", "<svg onload=alert(1)></svg>", /onload/i],
  ["cuerpo con onload", '<body onload="alert(1)">', /onload/i],
  ["script suelto", "<script>alert(1)</script>", /<script/i],
  ["script tras un parrafo", "Hola\n\n<script>alert(1)</script>", /<script/i],
  ["iframe", '<iframe src="http://ajeno.tld"></iframe>', /<iframe/i],
  ["object", '<object data="x.swf"></object>', /<object/i],
  ["embed", '<embed src="x">', /<embed/i],
  ["formulario", '<form action="http://ajeno.tld"><input name=p></form>', /<form|<input/i],
  ["estilos propios", "<style>body{display:none}</style>", /<style/i],
  ["atributo style", '<p style="position:fixed;inset:0">tapa la app</p>', /style=/i],
  ["enlace javascript:", "[pincha](javascript:alert(1))", /javascript:/i],
  ["enlace JaVaScRiPt: torcido", '<a href="JaVaScRiPt:alert(1)">x</a>', /javascript:/i],
  ["imagen con data: ejecutable", '<img src="data:text/html,<script>alert(1)</script>">', /<script/i],
  ["onclick", '<div onclick="alert(1)">pulsa</div>', /onclick/i],
  ["onmouseover", '<span onmouseover="alert(1)">pasa</span>', /onmouseover/i],
  ["marca de plantilla", "<template><img src=x onerror=alert(1)></template>", /onerror/i],
  ["math con href", '<math><maction actiontype="statusline#javascript:alert(1)">x</maction></math>', /javascript:/i],
];

console.log("── lo que tiene que quedarse fuera ──");
for (const [nombre, veneno, prohibido] of VENENOS) {
  const salida = aHtml(veneno);
  ok(`${nombre.padEnd(34)} ${salida.replace(/\n/g, " ").slice(0, 46)}`, !prohibido.test(salida));
}

/* ── Lo que SÍ tiene que seguir pasando ─────────────────────────────────
   Una prueba de seguridad que solo mira lo que se bloquea acaba con un filtro
   que bloquea todo. El markdown normal tiene que llegar entero, porque es lo
   que estas tres pantallas van a leer. */

const BUENOS = [
  ["negrita", "esto va en **negrita**", /<strong>negrita<\/strong>/],
  ["cursiva", "y esto en *cursiva*", /<em>cursiva<\/em>/],
  ["titulo", "## Un apartado", /<h2>Un apartado<\/h2>/],
  ["lista", "- uno\n- dos", /<li>uno<\/li>/],
  ["lista numerada", "1. uno\n2. dos", /<ol>/],
  ["codigo suelto", "usa `cargo check` ahi", /<code>cargo check<\/code>/],
  ["bloque de codigo", "```js\nconst a = 1;\n```", /<pre>/],
  ["cita", "> lo dijo el", /<blockquote>/],
  ["tabla", "| a | b |\n|---|---|\n| 1 | 2 |", /<table>/],
  ["enlace normal", "[la guia](https://ejemplo.tld/x)", /href="https:\/\/ejemplo\.tld\/x"/],
  ["enlace relativo", "[otra nota](otra.md)", /href="otra\.md"/],
  ["imagen normal", "![un gato](gato.png)", /<img[^>]+src="gato\.png"/],
  ["raya", "---", /<hr>/],
  ["id de la Guia", '<h2 id="guia-3">Titulo</h2>', /id="guia-3"/],
];

console.log("\n── lo que tiene que seguir llegando ──");
for (const [nombre, bueno, esperado] of BUENOS) {
  const salida = aHtml(bueno);
  ok(`${nombre.padEnd(34)} ${salida.replace(/\n/g, " ").slice(0, 46)}`, esperado.test(salida));
}

/* ── Y que el código de dentro de un bloque se vea, no se ejecute ──────
   Es el caso más común de todos: un agente enseñando HTML como ejemplo. Tiene
   que salir escrito en pantalla, con sus signos de menor escapados. */

console.log("\n── el HTML citado se lee, no corre ──");
const citado = aHtml("Mira este ejemplo:\n\n```html\n<img src=x onerror=alert(1)>\n```");
ok("dentro de un bloque queda escapado", citado.includes("&lt;img") && !/onerror=alert/.test(citado.replace(/&lt;[\s\S]*?&gt;/g, "")));

console.log(fallos === 0 ? "\nTodo en su sitio." : `\n${fallos} cosa(s) mal.`);
process.exit(fallos === 0 ? 0 : 1);
