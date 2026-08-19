// Markdown a HTML, pasado antes por un filtro.
//
// Tres pantallas de Adeorq pintan markdown que NO ha escrito Adeorq: el modo
// chat pinta el transcript de tus sesiones, la Memoria pinta los `.md` de tus
// bóvedas de Obsidian y la Guía pinta los documentos del repo. Es lo que la
// regla AL llama un DATO: se lee, se pinta, y no se obedece. Este archivo es
// esa frase escrita en código.
//
// El problema es que `marked` NO sanitiza. Su opción `sanitize` se retiró en la
// v5, así que el HTML que venga dentro del markdown sale tal cual al otro lado.
// Que eso se ejecuta no es una sospecha, está medido (2026-08-19): pintando
// `marked.parse()` con `innerHTML` en Chromium, esto es lo que quedó dicho:
//
//     disparos: ["onerror","svg-onload"]
//
// Un `<script>` insertado con `innerHTML` no corre —esa la para el navegador—
// pero un `<img src=x onerror=…>` y un `<svg onload=…>` sí, y en el WebView de
// Adeorq eso es código corriendo dentro de la app, con `__TAURI_INTERNALS__` a
// mano. La política de seguridad de contenido está en `null` en
// `tauri.conf.json`, así que tampoco hay una segunda red debajo.
//
// Por qué una lista de lo PERMITIDO y no de lo prohibido: la Memoria ya tenía
// su propia limpieza casera, con una lista negra escrita a mano, y aguanta las
// pruebas de hoy (también medido: con ella los disparos salen vacíos). Pero una
// lista negra solo para lo que alguien pensó en poner, y el siguiente truco no
// está en ella. Con una blanca, lo que no se reconoce no pasa.
//
// Se filtra DESPUÉS de convertir y no antes: escapando el markdown de entrada
// se perdería el formato entero, que es a lo que van estas pantallas. El orden
// correcto es markdown → HTML → filtro.

import DOMPurify from "dompurify";
import { marked } from "marked";

/**
 * Lo que se deja pasar: todo lo que el markdown produce (títulos, listas,
 * tablas, código, citas, imágenes, enlaces) y nada más. Fuera se quedan
 * `<script>`, `<iframe>`, `<object>`, `<form>`, `<style>` y **todos** los
 * atributos `on*`, que son los que de verdad ejecutan.
 */
const ETIQUETAS = [
  "p", "br", "hr", "span", "div",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "del", "s", "mark", "sub", "sup",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "a", "img",
];

/**
 * Solo lo que hace falta para que se vea. Ni `style`, ni `on*`, ni `srcset`.
 *
 * `id` está porque la Guía numera sus apartados para el índice de al lado. Y
 * NO se usa `SANITIZE_NAMED_PROPS`, que les pondría prefijo: los suyos los
 * escribe la propia Guía después de convertir, y prefijarlos dejaría el índice
 * apuntando a sitios que no existen.
 */
const ATRIBUTOS = ["href", "src", "alt", "title", "id", "class", "colspan", "rowspan", "start"];

/**
 * Limpia HTML ya generado.
 *
 * Aparte de `aHtml` porque la Guía necesita meterse en medio: convierte,
 * numera los títulos con `DOMParser` y solo entonces tiene el HTML definitivo.
 *
 * `href` y `src` los filtra DOMPurify con su propia expresión de protocolos,
 * que ya descarta `javascript:` y los `data:` ejecutables. No se reescribe
 * aquí: una lista de protocolos hecha a mano es justo lo que se queda corto.
 */
export function limpiar(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ETIQUETAS,
    ALLOWED_ATTR: ATRIBUTOS,
  });
}

/** Markdown a HTML seguro de pintar, que es el camino de casi todos. */
export function aHtml(texto: string): string {
  return limpiar(marked.parse(texto, { async: false }) as string);
}
