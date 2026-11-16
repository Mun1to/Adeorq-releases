// La caja de entrada de cada CLI, leída de la pantalla: si está parado en ella
// y vacía, y si dice que trabaja. Es lo que deja teclearle sola una línea a una
// terminal (la vuelta hacia arriba, `vueltaArribaVivo.ts`) sin ir detrás de un
// borrador de Munir, dentro de un menú o en una consola.
//
// Puro, para probarlo sin ventana: `pnpm bancos caja-de-entrada`, con las filas
// tal como salieron en una Adeorq aislada el 2026-11-16 (Codex 0.165.0 y Gemini
// 0.52.0, con clave falsa y sin red; Gemini, además, contra una API de mentira
// que le pedía correr un comando). Qué CLI pinta qué caja lo dice la tabla
// (`cajaEnPantalla` en `providers.ts`), no su nombre.
//
// Lo que no se reconoce es «no»: si un CLI cambia su caja en otra versión, la
// madre deja de recibir la línea y le queda la campana, que es lo seguro.

import { esperaEnSuCaja, trabajaEnPantalla } from "./contexto";
import { proveedorDe, type CajaEnPantalla } from "./providers";

/** Lo que se mira de una pantalla: `linea(i)` da la fila i de lo que se ve,
    de 0 a `filas - 1` (`enPantalla`, en `contexto.ts`). */
export type Mirada = (linea: (i: number) => string, filas: number) => boolean;

export interface LectorDeCaja {
  /** Parado en su caja, y vacía. */
  enSuCaja: Mirada;
  /** Algo en pantalla dice que sigue con el turno. */
  trabaja: Mirada;
  /** Su caja tiene escrito, sin enviar, exactamente `texto`: lo que se le
      tecleó y se quedó sin su Intro. Solo en los CLI donde se ha visto. */
  tieneEscrito?: (linea: (i: number) => string, filas: number, texto: string) => boolean;
}

/**
 * Codex 0.165: la caja es una fila que empieza en la columna 0 por `›`, con el
 * ejemplo atenuado si está vacía («Ask Codex to do anything», que cambia: por
 * eso no se mira el texto sino lo atenuado, que `sinSugerencia` ya quita). Debajo
 * va una fila en blanco y el pie sangrado («  GPT-6.1-Sol default · …»). Lo que
 * escribiste antes sale arriba con el mismo `›`, pero nunca vacío; un menú de
 * permiso pone `› 1. Yes, proceed`, que tampoco. Con un borrador de varias
 * líneas, la de debajo de `›` no está en blanco: si la primera estaba vacía,
 * eso no es una caja vacía.
 */
export function esperaEnSuCajaCodex(linea: (i: number) => string, filas: number): boolean {
  const i = filaDeCajaCodex(linea, filas);
  if (i < 0 || linea(i).slice(1).trim() !== "") return false;
  if (i + 1 < filas && linea(i + 1).trim() !== "") return false;
  // Y su pie de caja vacía, «? for shortcuts». Con el mismo `›` y el ejemplo
  // atenuado pinta Codex el campo de las instrucciones de `/review`, de `/rename`
  // y del objetivo (`custom_prompt_view`), donde el Intro lanza eso; y al recorrer
  // lo anterior («Browsing · ↵ rewind») atenúa la caja entera, borrador incluido.
  // Esos llevan otro pie (revisión aparte del 2026-11-16).
  for (let j = i + 1; j < filas; j++) if (linea(j).includes("? for shortcuts")) return true;
  return false;
}

/** La fila de la caja de Codex (la primera en la columna 0 desde abajo, si
    empieza por `›`), o -1. */
function filaDeCajaCodex(linea: (i: number) => string, filas: number): number {
  let i = filas - 1;
  for (; i >= 0; i--) {
    const l = linea(i);
    if (l.trim() && !/^\s/.test(l)) break;
  }
  return i >= 0 && linea(i).startsWith("›") ? i : -1;
}

/** Solo sus letras y cifras: el CLI parte las líneas largas a su manera, y
    Codex 0.165 pinta la línea sin las «» de los nombres (medido el 2026-11-16).
    Lo que Munir añada detrás sigue sin casar, porque añade letras. */
const soloLetras = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * La caja de Codex con `texto` escrito, exactamente eso y nada más. Pasa de
 * verdad: tras un pegado, Codex toma por salto de línea el Intro que llega en
 * sus 120 ms (`PASTE_ENTER_SUPPRESS_WINDOW`, `tui/src/bottom_pane/paste_burst.rs`
 * de la 0.165), que son justo los que espera Adeorq entre pegar y pulsar Intro
 * (`ESPACIO_ENTRE_TECLAS`). Con el equipo cargado, la línea se quedaba escrita.
 * Exactamente: con algo de Munir añadido detrás, el Intro mandaría lo suyo.
 */
export function cajaCodexTiene(linea: (i: number) => string, filas: number, texto: string): boolean {
  const i = filaDeCajaCodex(linea, filas);
  if (i < 0) return false;
  let escrito = linea(i).slice(1);
  for (let j = i + 1; j < filas && /^\s+\S/.test(linea(j)) && linea(j - 1).trim(); j++) escrito += linea(j);
  return soloLetras(escrito) === soloLetras(texto);
}

/** Lo que Gemini pinta en su caja vacía. Solo la frase de los mensajes: la de
    `vim` en modo normal haría de cada letra una orden, la de la voz con la
    barra espaciadora se pondría a escuchar, y la de la consola (`!`) ejecutaría
    la línea. */
const VACIA_GEMINI = "Type your message or @path/to/file";

const rayaDe = (bloque: string) => (l: string) => new RegExp(`^${bloque}{8,}\\s*$`).test(l);
const abajoGemini = rayaDe("▀");
const arribaGemini = rayaDe("▄");

/**
 * Gemini 0.52: la caja va entre una fila de `▄` y otra de `▀` (medio bloque con
 * su fondo), con ` > ` delante (` * ` en modo yolo) y la frase de ejemplo si está
 * vacía, que puede partirse en dos filas si el panel es estrecho. Debajo solo va
 * el pie, sangrado una columna (« workspace (/directory) …»). Lo que escribiste
 * antes sale arriba con el mismo marco, pero con su texto; y mientras pregunta
 * permiso para una herramienta esconde la caja, y lo último de la pantalla es su
 * recuadro (`╰──`), en la columna 0.
 *
 * Su cursor no sirve de prueba: sin el foco no lo pinta, y una madre casi nunca
 * lo tiene. Y con `ui.useBackgroundColor` apagado el marco es otro, sin medir:
 * ahí dice que no.
 */
export function esperaEnSuCajaGemini(linea: (i: number) => string, filas: number): boolean {
  return textoDeCajaGemini(linea, filas, 3) === VACIA_GEMINI;
}

/** Lo escrito en la caja de Gemini, en una línea, si la caja ocupa como mucho
    `max` filas; `null` si lo de abajo no es su caja o no empieza por ` > ` (` * `). */
function textoDeCajaGemini(linea: (i: number) => string, filas: number, max: number): string | null {
  let i = filas - 1;
  for (; i >= 0 && !abajoGemini(linea(i)); i--) {
    const l = linea(i);
    if (l.trim() && !/^\s/.test(l)) return null;
  }
  const dentro: string[] = [];
  let j = i - 1;
  for (; j >= 0 && !arribaGemini(linea(j)); j--) {
    dentro.unshift(linea(j));
    if (dentro.length > max) return null;
  }
  if (i < 0 || j < 0 || !dentro.length) return null;
  const primera = /^ [>*] (.*)$/.exec(dentro[0]);
  if (!primera) return null;
  return [primera[1], ...dentro.slice(1)].map((s) => s.trim()).join(" ").trim();
}

/** La caja de Gemini con `texto` escrito, exactamente (la línea de una entrega,
    que en un panel estrecho ocupa varias filas). */
export function cajaGeminiTiene(linea: (i: number) => string, filas: number, texto: string): boolean {
  const escrito = textoDeCajaGemini(linea, filas, 12);
  return escrito !== null && soloLetras(escrito) === soloLetras(texto);
}

/** Gemini dice que trabaja con «(esc to cancel, 5s)» junto a su ruedita. Y si
    pregunta permiso con la caja a la vista (`ui.collapseDrawerDuringApproval`
    apagado, no de fábrica), su «● 1. Allow once» lo para igual. */
export function trabajaGemini(linea: (i: number) => string, filas: number): boolean {
  for (let i = 0; i < filas; i++) {
    const l = linea(i);
    if (l.includes("esc to cancel") || /\b1\. Allow once\b/.test(l)) return true;
  }
  return false;
}

const LECTORES: Record<CajaEnPantalla, LectorDeCaja> = {
  claude: { enSuCaja: esperaEnSuCaja, trabaja: trabajaEnPantalla },
  codex: { enSuCaja: esperaEnSuCajaCodex, trabaja: trabajaEnPantalla, tieneEscrito: cajaCodexTiene },
  gemini: { enSuCaja: esperaEnSuCajaGemini, trabaja: trabajaGemini, tieneEscrito: cajaGeminiTiene },
};

/** El lector de la caja del CLI que corre en una terminal, o `null` si no se
    sabe leer (una consola, o un CLI sin `cajaEnPantalla`). */
export function lectorDeCaja(cli: string): LectorDeCaja | null {
  const caja = proveedorDe(cli)?.cajaEnPantalla;
  return caja ? LECTORES[caja] : null;
}
