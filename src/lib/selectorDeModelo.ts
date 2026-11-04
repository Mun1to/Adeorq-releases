// Cambiar de modelo SOLO en esa sesión, por el selector de `/model` de Claude Code.
//
// Escribir `/model sonnet` hace dos cosas: cambia la sesión Y guarda «sonnet»
// como modelo de TODAS las sesiones nuevas (Claude Code 2.1.317 lo dice al
// terminar: «Set model to Sonnet 5.5 and saved as your default for new
// sessions»; antes ya se había medido con la 2.1.302). Un toque en «Sonnet» en
// el móvil, o el router repartiendo, le cambiaba a Munir el modelo de fábrica
// sin que nadie lo supiera. La única forma de que valga solo para esa sesión es
// el selector sin argumento: `/model`, mover el cursor al modelo y pulsar `s`
// (pie del selector: «Enter to set as default · s to use this session only»; en
// el binario, `modelPicker:thisSessionOnly`, enlazada a `s`). `/effort high` tampoco
// es solo de la sesión: «Set effort level to high (saved as your default for new
// sessions)», en `modelSettings` de los ajustes (2.1.317). El mismo selector lo
// cambia con ←/→: «Set model to Sonnet 5.5 for this session only with xhigh effort».
//
// Esto lo conduce leyendo la pantalla: el selector enseña sus filas numeradas, el
// cursor es `❯` y el modelo de ahora lleva `✔`. Se mueve con las flechas hasta la
// fila y se pulsa `s`. Cuidado con el Esc: solo se manda con el selector a la
// vista, porque en un Claude Code que está trabajando interrumpe el turno.
//
// Tarda segundos, así que lo que venga detrás tiene que esperar a que acabe
// (`enFila`): un `/effort high` a los 400 ms le daba su Intro al selector abierto,
// que es justo «guardar como el de siempre» (medido, 2026-11-03).
//
// El conductor no sabe de terminales: recibe `escribir` y `pantalla` (el
// búfer de xterm, `terminales.ts`) y `esperar`, para probarlo con un selector
// falso (`scripts/selector-modelo-check.ts`) y con el de verdad
// (`scripts/laboratorio/modelo-de-sesion-de-verdad.mjs`).

import { esperaEnSuCaja } from "./cajaClaude";

/** Una fila del selector. `n` es el número que lleva escrito. */
export interface FilaModelo {
  n: number;
  nombre: string;
  /** Dónde está el `❯` ahora. */
  cursor: boolean;
  /** El modelo de esta sesión (`✔`). */
  actual: boolean;
}

// «   ❯ 3.  Sonnet 5.5 ✔           Most efficient…», «     1.  Default (recommended)  …»
// o «   ↓ 10. Opus 4.8  …» (la flecha dice que hay más abajo, no es el cursor).
const FILA = /^\s*(?:(❯)|[↑↓])?\s*(\d+)\.\s+(.*?)(?:\s{2,}.*)?$/;

const TITULO = /^\s*Select model\s*$/;
const PIE = /^\s*Enter\b.*\bs to use this session only\b/;
/** Cuántas filas puede tener debajo el pie del selector. La caja y su pie son más. */
const BAJO_EL_PIE = 2;

/** Las filas del selector si la pantalla ES el selector; `null` si no lo es. */
export function leerSelector(pantalla: string[] | null): FilaModelo[] | null {
  if (!pantalla) return null;
  // Las dos marcas: sin el pie «s to use this session only» (otra versión) esto
  // no sabría cómo seguir, y mejor decir que no lo reconoce. Tienen que ser una
  // fila entera, con el pie abajo del todo: una conversación que cite estas
  // palabras (la de quien trabaja en este archivo) no es el selector, y creérselo
  // acababa en un Esc que le cortaba el turno.
  const pie = pantalla.findIndex((l) => PIE.test(l));
  if (pie < 0 || pantalla.length - 1 - pie > BAJO_EL_PIE) return null;
  let titulo = pie - 1;
  while (titulo >= 0 && !TITULO.test(pantalla[titulo])) titulo--;
  const filas: FilaModelo[] = [];
  // Solo las de dentro: encima puede haber una lista numerada de la conversación. En
  // una terminal muy baja el título se ha ido por arriba, y lo de la conversación con él.
  for (const linea of pantalla.slice(titulo + 1, pie)) {
    const m = FILA.exec(linea);
    if (!m) continue;
    const crudo = m[3].trim();
    filas.push({ n: Number(m[2]), nombre: crudo.replace(/\s*✔\s*$/, ""), cursor: m[1] === "❯", actual: /✔/.test(crudo) });
  }
  return filas.length ? filas : null;
}

/** La fila del alias que usa Adeorq («opus», «sonnet», «haiku», «default»): la
 *  primera cuyo nombre empieza por él, que es la más nueva («Opus 5.5» antes que
 *  «Opus 5» y «Opus 4.8»). */
export function filaDe(filas: FilaModelo[], alias: string): FilaModelo | null {
  const a = alias.trim().toLowerCase();
  if (!a) return null;
  return filas.find((f) => f.nombre.toLowerCase().split(/[\s(]/)[0] === a) ?? null;
}

/** El alias de una línea `/model opus` de Claude, o `null` si no lo es: la de
 *  Gemini (`/model set flash`) lleva dos palabras y no cuenta. */
export function aliasDeLaLinea(linea: string): string | null {
  return /^\/model\s+([A-Za-z][\w.-]*)\s*$/.exec(linea.trim())?.[1] ?? null;
}

export interface EntradaSelector {
  escribir(texto: string): Promise<void>;
  /** La pantalla tal como se ve (`pantallaDe`), o `null` si no se puede leer. */
  pantalla(): string[] | null;
  esperar(ms: number): Promise<void>;
}

export interface Tiempos {
  /** Entre el texto de la orden y su Intro. */
  antesDelIntro: number;
  /** Lo que se espera a que se abra el selector tras cada Intro. */
  abrir: number;
  /** Entre una flecha y la siguiente, y lo que se espera a ver el cursor donde toca. */
  entreFlechas: number;
  cursor: number;
  /** Lo que se espera a que el selector se cierre tras la `s`. */
  cerrar: number;
  cada: number;
}
export const TIEMPOS: Tiempos = { antesDelIntro: 150, abrir: 1800, entreFlechas: 90, cursor: 2000, cerrar: 3500, cada: 120 };

async function hasta<T>(io: EntradaSelector, ms: number, cada: number, mira: () => T | null | false): Promise<T | null> {
  for (let t = 0; ; t += cada) {
    const v = mira();
    if (v) return v;
    if (t >= ms) return null;
    await io.esperar(cada);
  }
}

/** ¿Se puede leer la pantalla de ese panel? Si no, no hay forma de conducir
 *  nada: quien llama escribe la línea de siempre. */
export const sePuedeLeer = (io: EntradaSelector): boolean => io.pantalla() !== null;

/** Lo que Claude Code tiene escrito en su caja como `/model` sin enviar. */
const cajaConLaOrden = (p: string[] | null) => !!p?.some((l) => /^\s*❯\s*\/model\s*$/.test(l));
/** Claude Code en su caja, sin nada escrito y sin ninguna pregunta delante. */
const cajaVacia = (p: string[] | null) => !!p && esperaEnSuCaja((i) => p[i] ?? "", p.length);

/** Elegido el modelo, Claude Code no volvió a su caja: pregunta algo (hay modelos
 *  que piden confirmar, «Switch to Fable 5.1?», por los créditos). La respuesta es
 *  de la persona, y lo que se teclee detrás se la contestaría. */
export class PreguntaTrasElegir extends Error {}

const ARRIBA = "\x1b[A";
const ABAJO = "\x1b[B";
/** Lo más que se pulsa buscando algo en el selector: tiene unos trece modelos. */
const MAX_PULSACIONES = 30;

/** Abre el selector y devuelve con qué seguir. Si no se puede, lanza el porqué sin
 *  dejar nada a medias. */
async function abrirSelector(io: EntradaSelector, t: Tiempos) {
  const abierto = () => leerSelector(io.pantalla());
  // Antes de la primera tecla: con un borrador en la caja, «/model» se le pega
  // detrás y el Intro le manda al modelo un mensaje a medias (medido: «mi borrador a
  // medias/model»), y con una pregunta en pantalla se la contestaría.
  if (!cajaVacia(io.pantalla())) {
    throw new Error("Claude Code tiene algo escrito o una pregunta en pantalla, así que no se ha cambiado nada.");
  }
  await io.escribir("/model");
  await io.esperar(t.antesDelIntro);
  await io.escribir("\r");
  let filas = await hasta(io, t.abrir, t.cada, abierto);
  if (!filas && cajaConLaOrden(io.pantalla())) {
    // A veces el primer Intro solo acepta la sugerencia del comando.
    await io.escribir("\r");
    filas = await hasta(io, t.abrir, t.cada, abierto);
  }
  if (!filas) {
    // Sin el selector a la vista, ningún Esc: en un Claude trabajando, lo interrumpe.
    if (cajaConLaOrden(io.pantalla())) await io.escribir("\x15");
    throw new Error("El selector de modelos no se abrió, así que no se ha cambiado nada.");
  }
  const cerrar = () => io.escribir("\x1b");
  /** Lanza el porqué dejándolo cerrado. */
  const rendirse = async (porque: string): Promise<never> => {
    if (abierto()) await cerrar();
    throw new Error(porque);
  };
  const elegir = async () => {
    await io.escribir("s");
    const cerrado = await hasta(io, t.cerrar, t.cada, () => abierto() === null);
    if (!cerrado) {
      await cerrar();
      throw new Error("El selector de modelos no se cerró tras elegir; se ha cancelado.");
    }
    if (!(await hasta(io, t.cerrar, t.cada, () => cajaVacia(io.pantalla())))) {
      throw new PreguntaTrasElegir("Claude Code pregunta algo tras elegir el modelo: la respuesta es tuya.");
    }
  };
  return { abierto, rendirse, elegir };
}

/**
 * `/model`, el cursor en la fila de `alias` y `s`. Lanza un `Error` con el
 * porqué si no pudo, dejando el selector cerrado y la caja vacía.
 */
export async function modeloSoloEnLaSesion(io: EntradaSelector, alias: string, t: Tiempos = TIEMPOS): Promise<void> {
  const { abierto, rendirse, elegir } = await abrirSelector(io, t);
  // Por su número: en una terminal baja el selector enseña solo unas filas y se va
  // desplazando, así que su sitio en la pantalla cambia.
  const cursorEn = () => abierto()?.find((f) => f.cursor)?.n ?? -1;
  // Una flecha cada vez, mirando que el cursor se mueva: las primeras, mandadas
  // mientras el selector aún se pinta, se pueden perder (visto una vez de dos).
  const pulsar = async (tecla: string) => {
    const desde = cursorEn();
    await io.escribir(tecla);
    await hasta(io, t.cursor, t.cada, () => cursorEn() !== desde);
    await io.esperar(t.entreFlechas);
  };
  // Primero hasta ver la fila 1: `filaDe` se queda con la primera que encaja, que es
  // la más nueva, y con el selector desplazado puede estar por encima de lo que se ve.
  for (let i = 0; !abierto()?.some((f) => f.n === 1); i++) {
    if (i > MAX_PULSACIONES || cursorEn() < 0) return rendirse("No encuentro la primera fila del selector de modelos.");
    await pulsar(ARRIBA);
  }
  const vistos: string[] = [];
  let meta: FilaModelo | null = null;
  for (let i = 0; !meta; i++) {
    const filas = abierto() ?? [];
    for (const f of filas) if (!vistos.includes(f.nombre)) vistos.push(f.nombre);
    meta = filaDe(filas, alias);
    if (meta) break;
    // La última fila que se ve es la última de verdad si no hay nada debajo: al pulsar
    // volvería a la primera, y ya se ha mirado todo.
    const hayMas = (io.pantalla() ?? []).some((l) => /^\s*(↓\s*\d+\.|…\s*\+\d+)/.test(l));
    if (!hayMas || i > MAX_PULSACIONES) return rendirse(`El selector no ofrece «${alias}» (ofrece: ${vistos.join(", ")}).`);
    await pulsar(ABAJO);
  }
  for (let intentos = 0; ; intentos++) {
    const desde = cursorEn();
    if (desde < 0) return rendirse("No encuentro dónde está el cursor del selector de modelos.");
    if (desde === meta.n) break;
    if (intentos > MAX_PULSACIONES) return rendirse(`El cursor del selector no llegó a «${meta.nombre}».`);
    await pulsar(meta.n > desde ? ABAJO : ARRIBA);
  }
  await elegir();
}

/** El esfuerzo que enseña el selector: «◐ Medium effort (default) ←/→ to adjust». */
export function esfuerzoDelSelector(pantalla: string[] | null): string | null {
  for (const l of pantalla ?? []) {
    const m = /(\w+) effort\b.*to adjust/i.exec(l);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

/** El nivel de una línea `/effort high`, o `null` si no lo es. */
export function nivelDeLaLinea(linea: string): string | null {
  return /^\/effort\s+([A-Za-z]+)\s*$/.exec(linea.trim())?.[1].toLowerCase() ?? null;
}

const NIVELES = ["low", "medium", "high", "xhigh", "max"];

/**
 * `/model`, ←/→ hasta el nivel y `s`, sin mover el cursor del modelo. Lanza un
 * `Error` con el porqué si no pudo: un modelo sin esfuerzo no enseña esa línea, y
 * no todos llegan a todos los niveles.
 */
export async function esfuerzoSoloEnLaSesion(io: EntradaSelector, nivel: string, t: Tiempos = TIEMPOS): Promise<void> {
  const { rendirse, elegir } = await abrirSelector(io, t);
  const meta = nivel.toLowerCase();
  const ahora = () => esfuerzoDelSelector(io.pantalla());
  for (let i = 0; ; i++) {
    const desde = ahora();
    if (!desde) return rendirse(`Este modelo no deja elegir el esfuerzo, así que se queda como está y no en «${nivel}».`);
    if (desde === meta) break;
    if (i > NIVELES.length * 2) return rendirse(`El selector no llega al esfuerzo «${nivel}» con este modelo.`);
    await io.escribir(NIVELES.indexOf(meta) > NIVELES.indexOf(desde) ? "\x1b[C" : "\x1b[D");
    await hasta(io, t.cursor, t.cada, () => ahora() !== desde);
    await io.esperar(t.entreFlechas);
  }
  await elegir();
}

export const ENTRE_ORDENES_MS = 400;

/**
 * Las órdenes de barra de un panel, cada una cuando ha acabado la anterior: el
 * selector de `/model` tarda segundos. Que falle una es una preferencia que se
 * pierde y se sigue, salvo que Claude Code se haya quedado preguntando. Devuelve si
 * se puede teclear detrás.
 */
export async function enFila(lineas: string[], teclear: (linea: string) => Promise<void>, esperar: (ms: number) => Promise<void>): Promise<boolean> {
  for (const [i, linea] of lineas.entries()) {
    if (i) await esperar(ENTRE_ORDENES_MS);
    try {
      await teclear(linea);
    } catch (e) {
      if (e instanceof PreguntaTrasElegir) return false;
    }
  }
  return true;
}
