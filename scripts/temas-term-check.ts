// El esquema que lleva la terminal (`lib/temasTerm.ts`): «A juego con el tema»,
// el apagón y la terminal oscura de un claro.
//
// Nació de la revisión de los claros (2026-11-21): con el apagón, un claro
// dejaba su esquema claro sobre negro (letra oscura a 1,31:1), y quitar un
// esquema importado que estaba puesto guardaba el de la casa en vez de volver a
// «A juego con el tema», con lo que un claro se quedaba con la terminal oscura.
//
//   pnpm bancos temas-term

import { JSDOM } from "jsdom";

declare const require: (m: string) => unknown;
declare const process: { exit(codigo: number): never };

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
const g = globalThis as unknown as Record<string, unknown>;
for (const [nombre, valor] of [
  ["window", dom.window],
  ["document", dom.window.document],
  ["localStorage", dom.window.localStorage],
  // El `Event` de Node no lo admite el `dispatchEvent` de jsdom.
  ["Event", dom.window.Event],
] as const) {
  Object.defineProperty(g, nombre, { value: valor, writable: true, configurable: true });
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const t = require("../src/lib/temasTerm") as typeof import("../src/lib/temasTerm");

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const es = (nombre: string, obtenido: unknown, esperado: unknown) =>
  ok(nombre, JSON.stringify(obtenido) === JSON.stringify(esperado), `sale ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`);

const raiz = document.documentElement;
/** Como lo dejan `App.tsx` y Ajustes: el tema, si es claro, el esquema y el apagón. */
function poner(tema: string, claro: boolean, esquema: string | null, apagon: boolean) {
  localStorage.clear();
  if (esquema) localStorage.setItem(t.TEMA_TERM_KEY, esquema);
  raiz.dataset.theme = tema;
  raiz.toggleAttribute("data-claro", claro);
  t.aplicarApagon(apagon);
}
const oscura = () => raiz.hasAttribute("data-term-oscura");

// --- «A juego con el tema» ----------------------------------------------------------
poner("claro", true, null, false);
es("un claro lleva su esquema claro", t.esquemaPuesto(), "casa-claro");
ok("y su terminal no va oscura", !oscura());
poner("dracula", false, null, false);
es("un conocido lleva el suyo", t.esquemaPuesto(), "dracula");
ok("y la marca de oscura es solo de los claros", !oscura());

// --- el apagón --------------------------------------------------------------------
poner("claro", true, null, true);
es("con el apagón, un claro de la casa va con el de la casa", t.esquemaPuesto(), "casa");
ok("y su terminal va oscura, que es la que el apagón pone negra", oscura());
es("sus colores son los de un esquema oscuro", t.coloresTerm().foreground, t.coloresTerm("casa").foreground);
poner("solarized-claro", true, null, true);
es("Solarizado claro, con el apagón, va con Solarized", t.esquemaPuesto(), "solarized");
poner("latte", true, null, true);
es("y Latte con el Mocha", t.esquemaPuesto(), "catppuccin");
poner("dracula", false, null, true);
es("un oscuro con el apagón no cambia de esquema", t.esquemaPuesto(), "dracula");
poner("claro", true, null, true);
t.aplicarApagon(false);
es("al apagarlo, el claro vuelve a su esquema claro", t.esquemaPuesto(), "casa-claro");
ok("y a su terminal clara", !oscura());

// --- la muestra de «A juego con el tema» en Ajustes ---------------------------------
poner("latte", true, "dracula", true);
es("con el apagón, la muestra de un claro enseña su esquema oscuro", t.esquemaReal(t.DEL_TEMA, "latte"), "catppuccin");
poner("latte", true, "dracula", false);
es("y sin él, el claro", t.esquemaReal(t.DEL_TEMA, "latte"), "latte");

// --- un esquema elegido a mano ------------------------------------------------------
poner("papel", true, "dracula", false);
es("en un claro se queda el elegido", t.esquemaPuesto(), "dracula");
ok("y la terminal va oscura", oscura());
poner("papel", true, "dracula", true);
es("también con el apagón", t.esquemaPuesto(), "dracula");

// --- un importado -----------------------------------------------------------------
poner("claro", true, null, false);
const imp = t.guardarImportado("Mi tema", t.coloresTerm("nord"));
t.guardarTemaTerm(imp.id);
ok("un importado elegido deja la terminal oscura en un claro", oscura());
t.quitarImportado(imp.id);
es("al quitarlo, vuelve a «A juego con el tema»", t.temaTermId(), t.DEL_TEMA);
ok("y la terminal del claro, a clara", !oscura());

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
