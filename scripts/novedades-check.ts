// Lo nuevo de cada versión (`src/lib/novedades.ts` y `src/novedades.json`).
// Lógica pura y el fichero de datos, se corre con `pnpm bancos novedades`.
//
// Lo que no puede pasar: que al abrir una versión se enseñe lo de otra que no
// toca (una futura, una ya vista, toda la historia al estrenar el recorrido), que
// lo visto vuelva atrás, o que una entrada del fichero llegue a la ventana sin su
// inglés, sin un sitio al que señalar o con una pestaña que no existe.

const armario = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => armario.get(k) ?? null,
  setItem: (k: string, v: string) => void armario.set(k, v),
  removeItem: (k: string) => void armario.delete(k),
  clear: () => armario.clear(),
  key: () => null,
  length: 0,
} as Storage;

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import {
  ANTES_DEL_RECORRIDO,
  comparar,
  leerVista,
  marcarVista,
  pendientes,
  textoDe,
  ultimaConNovedades,
  VISTA_KEY,
  type Novedad,
  type Novedades,
} from "../src/lib/novedades";
import { VISTAS } from "../src/lib/vistas";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const j = (x: unknown) => JSON.stringify(x);

/** Si Chromium lo leería. La lista de caracteres sola dejaba pasar `[data-x` o
    `a:hovr`, y jsdom también los traga (medido): por eso, además de su parser, los
    corchetes y paréntesis tienen que cerrar en orden y cada seudoclase tiene que
    existir. Un `::` (un seudoelemento) no se encuentra nunca con querySelector. */
const documento = new JSDOM("<!doctype html><body></body>").window.document;
const SEUDOCLASES = new Set(
  "hover focus focus-visible focus-within active checked disabled enabled empty root not is where has first-child last-child only-child nth-child nth-last-child first-of-type last-of-type nth-of-type".split(" "),
);
function esSelector(s: string): boolean {
  if (!/^[\w\s#.\-[\]="':>()*,^$~|+]+$/.test(s) || s.includes("::")) return false;
  const sinComillas = s.replace(/"[^"]*"|'[^']*'/g, '""');
  const pila: string[] = [];
  for (const ch of sinComillas) {
    if (ch === "[" || ch === "(") pila.push(ch === "[" ? "]" : ")");
    else if ((ch === "]" || ch === ")") && pila.pop() !== ch) return false;
  }
  if (pila.length > 0) return false;
  for (const m of sinComillas.matchAll(/:([\w-]+)/g)) if (!SEUDOCLASES.has(m[1])) return false;
  try {
    documento.querySelector(s);
    return true;
  } catch {
    return false;
  }
}
ok("el parser de selectores caza uno sin cerrar", !esSelector("[data-x"));
ok("y una seudoclase que no existe", !esSelector(".a:hovr"));
ok("y uno a medias", !esSelector("a::"));
ok("y deja pasar uno bueno", esSelector("[data-novedades]") && esSelector(".ajustes-grupo > h2"));

// --- comparar versiones ---------------------------------------------------------------
ok("0.9.100 va después de 0.9.99", comparar("0.9.100", "0.9.99") > 0);
ok("la misma versión es igual", comparar("0.9.264", "0.9.264") === 0);
ok("1.0.0 va después de 0.9.999", comparar("1.0.0", "0.9.999") > 0);
ok("y 0.9.263 antes que 0.9.264", comparar("0.9.263", "0.9.264") < 0);

// --- qué toca enseñar ---------------------------------------------------------------
const n = (t: string): Novedad => ({ donde: [`#${t}`], es: { titulo: t, texto: t }, en: { titulo: t, texto: t } });
const datos: Novedades = {
  "0.9.262": [n("vieja")],
  "0.9.264": [n("a")],
  "0.9.265": [],
  "0.9.266": [n("b"), n("c")],
  "0.9.270": [n("futura")],
};
const titulos = (actual: string, vista: string | null) =>
  pendientes(datos, actual, vista).map((p) => `${p.version}:${p.novedad.es.titulo}`);

ok("sin nada visto, solo lo de la versión que corre", j(titulos("0.9.264", null)) === j(["0.9.264:a"]), j(titulos("0.9.264", null)));
ok(
  "quien ya usaba Adeorq y salta de la 0.9.263 a la 0.9.266 ve también lo de la 0.9.264",
  j(titulos("0.9.266", ANTES_DEL_RECORRIDO)) === j(["0.9.264:a", "0.9.266:b", "0.9.266:c"]),
);
ok(
  "saltándose varias, todo lo que se perdió y en orden",
  j(titulos("0.9.266", "0.9.263")) === j(["0.9.264:a", "0.9.266:b", "0.9.266:c"]),
  j(titulos("0.9.266", "0.9.263")),
);
ok("lo ya visto no vuelve", j(titulos("0.9.266", "0.9.264")) === j(["0.9.266:b", "0.9.266:c"]));
ok("la misma versión otra vez, nada", j(titulos("0.9.266", "0.9.266")) === j([]));
ok("volver a una versión anterior, nada", j(titulos("0.9.264", "0.9.266")) === j([]));
ok("nunca lo de una versión que aún no tienes", !titulos("0.9.266", "0.9.200").some((t) => t.includes("futura")));
ok("una versión sin nada propio no enseña nada", j(titulos("0.9.265", "0.9.264")) === j([]));
ok("sin saber la versión, nada", j(titulos("", null)) === j([]));

// --- lo que se vuelve a ver desde Ajustes ---------------------------------------------
ok("la última que trajo algo, aunque las de después no", ultimaConNovedades(datos, "0.9.265") === "0.9.264");
ok("y la propia si trajo", ultimaConNovedades(datos, "0.9.266") === "0.9.266");
ok("ninguna antes de la primera", ultimaConNovedades(datos, "0.9.100") === null);

// --- lo visto no va hacia atrás -------------------------------------------------------
armario.clear();
ok("al estrenar no hay nada visto", leerVista() === null);
marcarVista("0.9.264");
ok("se apunta la vista", leerVista() === "0.9.264");
marcarVista("0.9.262");
ok("una anterior no la pisa", leerVista() === "0.9.264", String(armario.get(VISTA_KEY)));
marcarVista("0.9.266");
ok("una nueva sí", leerVista() === "0.9.266");

// --- el idioma ------------------------------------------------------------------------
const doble: Novedad = { donde: ["#x"], es: { titulo: "Hola", texto: "h" }, en: { titulo: "Hi", texto: "h" } };
ok("en español, el español", textoDe(doble, "es").titulo === "Hola");
ok("en inglés, el inglés", textoDe(doble, "en").titulo === "Hi");

// --- el fichero de verdad -------------------------------------------------------------
const crudo = readFileSync(join(process.cwd(), "src", "novedades.json"), "utf8");
const fichero = JSON.parse(crudo.charCodeAt(0) === 0xfeff ? crudo.slice(1) : crudo) as Novedades;
// Los títulos de las tarjetas de Ajustes (`<h2>{t("…")}</h2>`), leídos del código: una
// novedad que apunta a una tarjeta que no existe enseñaba su texto sin nada debajo.
const componentes = join(process.cwd(), "src", "components");
const tarjetas = new Set(
  readdirSync(componentes)
    .filter((f) => f.endsWith(".tsx"))
    .flatMap((f) => [...readFileSync(join(componentes, f), "utf8").matchAll(/<h2>\{t\("([^"]+)"\)\}<\/h2>/g)].map((m) => m[1])),
);
ok("los títulos de las tarjetas se leen", tarjetas.has("Avisos"), `${tarjetas.size} tarjetas`);
// Los grupos de Ajustes, leídos de donde viven (`SECCIONES` de `SettingsView`).
const ajustes = readFileSync(join(process.cwd(), "src", "components", "SettingsView.tsx"), "utf8");
const grupos = new Set([...ajustes.matchAll(/\{ id: "([a-z]+)", label: "/g)].map((m) => m[1]));
const vistas = new Set(VISTAS.map((v) => v.key as string));
ok("los grupos de Ajustes se leen", grupos.has("avisos") && grupos.has("ayuda"), j([...grupos]));
const RAYAS = /[–—]/;

for (const [version, lista] of Object.entries(fichero)) {
  ok(`${version} es un número de versión`, /^\d+\.\d+\.\d+$/.test(version));
  ok(`${version} es una lista`, Array.isArray(lista));
  for (const [i, x] of (Array.isArray(lista) ? lista : []).entries()) {
    const quien = `${version} #${i + 1}`;
    for (const lang of ["es", "en"] as const) {
      const t = x[lang];
      ok(`${quien} tiene su ${lang}`, Boolean(t?.titulo?.trim() && t?.texto?.trim()));
      if (!t) continue;
      ok(`${quien} (${lang}) sin rayas`, !RAYAS.test(t.titulo + t.texto));
      // El globo mide 360 px: más de esto ya no se lee de un vistazo.
      ok(`${quien} (${lang}) cabe en el globo`, t.texto.length <= 220, `${t.texto.length} caracteres`);
    }
    ok(`${quien} dice dónde está`, Boolean(x.bloque) || (Array.isArray(x.donde) && x.donde.length > 0));
    ok(`${quien}: un bloque vive en un grupo de Ajustes`, !x.bloque || Boolean(x.ajustes));
    ok(`${quien}: su tarjeta existe`, !x.bloque || tarjetas.has(x.bloque), String(x.bloque));
    // Un selector que no se puede leer no debe llegar a la ventana (allí se trata como «no está»).
    for (const s of x.donde ?? []) ok(`${quien}: «${s}» es un selector`, esSelector(s));
    ok(`${quien}: su pestaña existe`, !x.vista || vistas.has(x.vista), String(x.vista));
    ok(`${quien}: su grupo de Ajustes existe`, !x.ajustes || grupos.has(x.ajustes), String(x.ajustes));
    ok(`${quien}: un grupo de Ajustes va con su pestaña`, !x.ajustes || x.vista === "ajustes");
  }
}

if (fallos) process.exit(1);
