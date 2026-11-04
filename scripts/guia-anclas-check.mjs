// Que cambiar el idioma de la guía de la web no se lleve el enlace «#» de los títulos.
//   `node scripts/guia-anclas-check.mjs`   ·   va dentro de `pnpm comprobar`
//
// Bandeja de la Agenda (2026-10-17): «La guía en inglés: los h2 pierden su ancla
// "#" (data-i18n cambia el texto entero)». Cada título de `guia.html` lleva dentro
// su enlace (`<h2 data-i18n="guia.cabina.h">La Cabina<a class="doc-ancla" …>#</a></h2>`)
// y `boot.js` ponía el texto con `n.textContent = …`, que borra TAMBIÉN los hijos:
// en inglés el título salía sin su enlace, y al volver al español, con un «#» suelto
// pegado al texto y sin enlace. Esto carga la página de verdad (jsdom), ejecuta sus
// dos guiones, cambia a inglés y vuelve, y mira que cada nodo con texto traducible
// y algo dentro siga teniendo lo suyo, que su texto cambie y que, de vuelta, sea
// el mismo de antes.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "web");
let fallos = 0;
const ok = (nombre, cond, detalle = "") => {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? " — " + detalle : ""}`);
};

const dom = new JSDOM(readFileSync(join(WEB, "guia.html"), "utf8"), {
  url: "https://adeorq.com/guia",
  runScripts: "outside-only",
  pretendToBeVisual: true,
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.CSS = { supports: () => false };
  },
});
const { window: w } = dom;
const { document: d } = w;
// Español para empezar, que es lo que decide el <head>.
d.documentElement.lang = "es";
// Sus dos guiones, en el orden de la página: el diccionario inglés y el arranque.
w.eval(readFileSync(join(WEB, "js", "guia-i18n.js"), "utf8"));
w.eval(readFileSync(join(WEB, "js", "boot.js"), "utf8"));

// Los nodos traducibles que llevan algo dentro (un enlace, una marca…).
const conHijos = [...d.querySelectorAll("[data-i18n]")].filter((n) => n.children.length > 0);
ok("la guía tiene títulos con su ancla dentro", conHijos.length >= 10, `${conHijos.length} nodos`);
const antes = conHijos.map((n) => ({ n, clave: n.getAttribute("data-i18n"), html: n.innerHTML, texto: n.textContent, hijos: [...n.children].map((c) => c.outerHTML).join("") }));

const boton = d.getElementById("idioma-toggle");
ok("hay botón de idioma", !!boton);
boton?.dispatchEvent(new w.Event("click", { bubbles: true }));
ok("al pulsarlo la página pasa a inglés", d.documentElement.lang === "en", d.documentElement.lang);

const rotosEn = antes.filter((a) => [...a.n.children].map((c) => c.outerHTML).join("") !== a.hijos);
ok("en inglés ningún título pierde su enlace", rotosEn.length === 0, rotosEn.slice(0, 3).map((a) => a.clave).join(", "));
const sinTraducir = antes.filter((a) => a.n.textContent === a.texto);
ok("y se traducen (su texto cambia)", sinTraducir.length <= 2, sinTraducir.slice(0, 4).map((a) => a.clave).join(", "));
const conAlmohadilla = antes.filter((a) => /#$/.test(a.n.firstChild?.nodeValue ?? ""));
ok("sin un «#» suelto pegado al título", conAlmohadilla.length === 0, conAlmohadilla.slice(0, 3).map((a) => a.clave).join(", "));

// En inglés no queda español: la guía citaba los errores del móvil en el español
// de donde salen («La ventana de Adeorq no contestó a tiempo»), y el móvil y la
// app los dicen en inglés. Solo el rótulo del propio botón, «Español», es de verdad.
const enEspañol = [...d.querySelectorAll("[data-i18n],[data-i18n-html]")]
  .filter((n) => /[áéíóúñ¿¡«»]/.test(n.textContent) && n.getAttribute("data-i18n") !== "guia.menu.idioma")
  .map((n) => n.getAttribute("data-i18n") || n.getAttribute("data-i18n-html"));
ok("en inglés no queda ningún texto con letras del español", enEspañol.length === 0, enEspañol.slice(0, 4).join(", "));

boton?.dispatchEvent(new w.Event("click", { bubbles: true }));
ok("al volver a pulsarlo, la página vuelve al español", d.documentElement.lang === "es", d.documentElement.lang);
const distintos = antes.filter((a) => a.n.innerHTML !== a.html);
ok("de vuelta en español, cada título queda EXACTAMENTE como estaba", distintos.length === 0, distintos.slice(0, 3).map((a) => `${a.clave}: ${a.n.innerHTML.slice(0, 80)}`).join(" | "));

console.log(fallos ? `\n${fallos} FALLAN` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
