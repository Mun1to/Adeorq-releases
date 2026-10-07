// Las reglas del router que escribe Munir en la memoria de la casa.
//
// Decisión del 2026-10-07 (D1): el router aprende del pasado SOLO por lo
// explícito. Nada de deducir de correcciones casuales; una nota suya, y punto.
// La forma es una línea dentro de cualquier nota de la memoria:
//
//     router: radar -> opus xhigh
//     router: web de Adeorq -> codex
//     router: Vidorq -> sonnet
//
// A la izquierda, CUÁNDO: palabras que tienen que aparecer todas en el
// proyecto o en el encargo (sin distinguir mayúsculas ni tildes). A la
// derecha, QUÉ: un modelo de la casa (haiku, sonnet, opus), un esfuerzo (low,
// medium, high, xhigh, max) o un cliente (claude, codex, gemini…), en el orden
// que sea. Si varias reglas encajan, manda la que más palabras exige, que es
// la más concreta; a igual concreción, la primera.
//
// Lo que entra por aquí es texto de una nota: datos, no órdenes (regla AL).
// Por eso solo se reconocen palabras de listas cerradas, y lo que no esté en
// ellas se ignora en vez de llegar a una línea de comandos.

import { MODEL_ALIASES, type ModelAlias } from "./models";
import { PROVIDERS } from "./providers";
import { ESFUERZOS, type Esfuerzo } from "./router";

export interface ReglaRouter {
  /** Las palabras que tienen que estar, ya normalizadas. */
  cuando: string[];
  modelo?: ModelAlias;
  esfuerzo?: Esfuerzo;
  cli?: string;
  /** La línea tal como la escribió, para decir de dónde sale la decisión. */
  texto: string;
  /** De qué nota, para poder abrirla. */
  nota?: string;
}

/** Sin tildes, en minúscula, y partido en palabras. */
export function palabras(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Las reglas que hay en el texto de una nota (las líneas `router:`). */
export function reglasDe(textoNota: string, nota?: string): ReglaRouter[] {
  const salida: ReglaRouter[] = [];
  const clis = new Set(PROVIDERS.map((p) => p.id));
  for (const cruda of textoNota.split(/\r?\n/)) {
    const m = cruda.trim().match(/^(?:[-*]\s*)?router\s*:\s*(.+?)\s*(?:->|=>|→|:)\s*(.+?)\s*$/i);
    if (!m) continue;
    const cuando = palabras(m[1]);
    if (!cuando.length) continue;
    const regla: ReglaRouter = { cuando, texto: cruda.trim(), nota };
    for (const p of palabras(m[2])) {
      if ((MODEL_ALIASES as readonly string[]).includes(p)) regla.modelo = p as ModelAlias;
      else if ((ESFUERZOS as readonly string[]).includes(p)) regla.esfuerzo = p as Esfuerzo;
      else if (clis.has(p)) regla.cli = p;
    }
    if (regla.modelo || regla.esfuerzo || regla.cli) salida.push(regla);
  }
  return salida;
}

/** La regla que manda para este encargo en este proyecto, o nada. */
export function reglaQueManda(
  reglas: ReglaRouter[],
  de: { proyecto?: string; encargo?: string },
): ReglaRouter | null {
  const bolsa = new Set(palabras(`${de.proyecto ?? ""} ${de.encargo ?? ""}`));
  let mejor: ReglaRouter | null = null;
  for (const r of reglas) {
    if (!r.cuando.every((p) => bolsa.has(p))) continue;
    if (!mejor || r.cuando.length > mejor.cuando.length) mejor = r;
  }
  return mejor;
}
