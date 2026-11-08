// Los fallos que Rust le devuelve al chat del conserje, en el idioma de la app.
//
// `conserje.rs` los escribe en español y la ventana los enseñaba tal cual: con
// la app en inglés, «el conserje se quedó pensando demasiado (3 min); reintenta»
// salía en medio de un chat en inglés. Llevan datos dentro (el modelo, el
// programa, lo que dijo su salida de errores), así que no se traducen por su
// texto entero sino por su forma, como hace `DEL_PC_CON_HUECO` en `movil.html`.
//
// Cada regla lleva su `t("…")` con la frase a la vista, para que `pnpm i18n`
// vea si le falta su inglés. Y `scripts/conserje-avisos-check.ts` saca de
// `conserje.rs` todos los `Err` con texto y exige que alguna regla los
// reconozca: un `Err` nuevo sin su regla deja el banco en rojo.

import type { Translate } from "./i18n";

type Regla = [RegExp, (t: Translate, m: RegExpMatchArray) => string];

/** El «desconocido» con que `claude` rellena un error sin texto. */
const pieza = (t: Translate, e: string) => (e === "desconocido" ? t("desconocido") : e);

export const REGLAS_DE_RUST: Regla[] = [
  [/^id de conversación no válido$/, (t) => t("id de conversación no válido")],
  [/^«(.*)» no es un modelo con el que pueda pensar Adeo$/, (t, m) => t("«{x}» no es un modelo con el que pueda pensar Adeo", { x: m[1] })],
  [/^«(.*)» no es un modelo que se pueda fijar$/, (t, m) => t("«{x}» no es un modelo que se pueda fijar", { x: m[1] })],
  [/^«(.*)» no es un programa con el que pueda pensar Adeo$/, (t, m) => t("«{x}» no es un programa con el que pueda pensar Adeo", { x: m[1] })],
  [/^«(.*)» no es un programa$/, (t, m) => t("«{x}» no es un programa", { x: m[1] })],
  [/^esa conversación no es un enjambre$/, (t) => t("esa conversación no es un enjambre")],
  [/^Adeo todavía está con lo anterior en esta conversación$/, (t) => t("Adeo todavía está con lo anterior en esta conversación")],
  [/^no hay nada que mandar$/, (t) => t("no hay nada que mandar")],
  [/^Adeo se quedó pensando demasiado \(3 min\); reintenta$/, (t) => t("Adeo se quedó pensando demasiado (3 min); reintenta")],
  [/^claude devolvió error: (.*)$/s, (t, m) => t("claude devolvió error: {e}", { e: pieza(t, m[1]) })],
  [/^claude no devolvió nada: (.*)$/s, (t, m) => t("claude no devolvió nada: {e}", { e: m[1] })],
  [/^(.+) devolvió error: (.*)$/s, (t, m) => t("{quien} devolvió error: {e}", { quien: m[1], e: m[2] })],
  [/^(.+) no devolvió texto$/, (t, m) => t("{quien} no devolvió texto", { quien: m[1] })],
  [/^(.+) no devolvió nada$/, (t, m) => t("{quien} no devolvió nada", { quien: m[1] })],
  [/^la ruta de Adeorq lleva una comilla y no cabe en la línea de órdenes$/, (t) => t("la ruta de Adeorq lleva una comilla y no cabe en la línea de órdenes")],
  [/^es demasiado corto para mejorarlo$/, (t) => t("es demasiado corto para mejorarlo")],
  [/^la mejora ha salido vacía: se queda lo tuyo$/, (t) => t("la mejora ha salido vacía: se queda lo tuyo")],
  [/^la mejora se ha alargado demasiado \(se estaría inventando cosas\): se queda lo tuyo$/, (t) => t("la mejora se ha alargado demasiado (se estaría inventando cosas): se queda lo tuyo")],
  [/^conversación ilegible: (.*)$/s, (t, m) => t("conversación ilegible: {e}", { e: m[1] })],
  [/^no pude lanzar claude: (.*)$/s, (t, m) => t("no pude lanzar claude: {e}", { e: m[1] })],
  [/^no pude lanzar (.+?): (.*)$/s, (t, m) => t("no pude lanzar {x}: {e}", { x: m[1], e: m[2] })],
  [/^no se abrió su entrada$/, (t) => t("no se abrió su entrada")],
  [/^claude no dio salida$/, (t) => t("claude no dio salida")],
  [/^la respuesta no trae texto$/, (t) => t("la respuesta no trae texto")],
  [/^no dio salida de errores$/, (t) => t("no dio salida de errores")],
  [/^no dio salida$/, (t) => t("no dio salida")],
  [/^(.+) no está instalado en este equipo$/, (t, m) => t("{x} no está instalado en este equipo", { x: m[1] })],
  [/^no sé dónde estoy: (.*)$/s, (t, m) => t("no sé dónde estoy: {e}", { e: m[1] })],
  [/^no pude escribir los ajustes de Gemini: (.*)$/s, (t, m) => t("no pude escribir los ajustes de Gemini: {e}", { e: m[1] })],
  [/^no sé dónde guardar la cuenta de Adeo$/, (t) => t("no sé dónde guardar la cuenta de Adeo")],
];

/** Un `Err` de Rust sin ninguna regla suya, que sale como llegó. */
function deUnaRegla(t: Translate, texto: string): string | null {
  for (const [re, en] of REGLAS_DE_RUST) {
    const m = texto.match(re);
    if (m) return en(t, m);
  }
  return null;
}

/**
 * El fallo, en el idioma de la app. Lo que no reconoce (el mensaje de un
 * sistema operativo, lo que dijo el propio CLI) sale tal cual. Rust pega detrás
 * lo último que el programa dijo por su salida de errores, separado por « · »:
 * si la frase entera no encaja, se traduce la cabeza y la cola se deja.
 */
export function avisoEnSuIdioma(t: Translate, texto: string): string {
  const entera = deUnaRegla(t, texto);
  if (entera != null) return entera;
  const i = texto.indexOf(" · ");
  if (i > 0) {
    const cabeza = deUnaRegla(t, texto.slice(0, i));
    if (cabeza != null) return `${cabeza}${texto.slice(i)}`;
  }
  return texto;
}
