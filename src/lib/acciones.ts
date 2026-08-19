// Lo que se puede HACER con un consejo, y no solo leer.
//
// El copiloto (`copiloto.ts`) decide qué merece decirse y lo escribe como una
// línea en la bandeja de la Agenda. Eso ya servía para enterarse, pero dejaba
// el trabajo a medias: leer «Codex está más fresco, ¿sigues ahí?» y tener que
// ir a abrir la terminal a mano es exactamente el paso que la frase te estaba
// ahorrando. Aquí vive la otra mitad: la acción concreta que ese consejo
// propone, para que la Agenda pueda ofrecer un botón.
//
// ── POR QUÉ NO VA DENTRO DE `bandeja.md` ──────────────────────────────────
//
// Ese fichero lo escriben también los agentes A MANO, con la regla R delante y
// un `Add-Content` de una línea. Su formato es «- paso | Proyecto | texto» y
// vale precisamente porque cualquiera puede escribirlo sin equivocarse. Meterle
// un cuarto campo con datos de máquina lo rompería para el caso principal, y
// una nota escrita por un agente que no supiera del campo nuevo se leería mal.
//
// Así que la acción se guarda APARTE, emparejada por el texto de la nota. Tiene
// dos consecuencias buenas: el fichero sigue siendo el mismo de siempre, y si
// esta memoria se pierde (otro ordenador, almacenamiento lleno, alguien limpia
// el navegador) la nota no se rompe: se queda sin botón y sigue diciendo lo
// mismo en cristiano. Degrada a lo que había, que es lo que tiene que hacer
// cualquier cosa que se pueda perder.

import type { ModelAlias } from "./models";

/** Lo que un consejo puede llegar a hacer si lo pulsas.
 *
 * Son tres y no más, y la que falta es a propósito: el consejo de contexto
 * («va por el 82 %, mejor parte la tarea») no lleva acción porque partir una
 * tarea en dos es trabajo de Munir, no algo que un botón pueda hacer bien. Un
 * botón que hiciera «algo parecido» ahí sería peor que no tenerlo. */
export type AccionConsejo =
  /** Abrir otra terminal, con otro cliente, en la misma carpeta. */
  | { hacer: "abrirCli"; cli: string; cwd: string; proyecto: string }
  /** Dejar escrito el `/model` en la sesión que ya está abierta. El Enter lo
      da Munir: escribir en la terminal de otro es lo único que el copiloto
      tiene prohibido, y que lo pulse él es lo que lo convierte en su decisión
      y no en la del panel. */
  | { hacer: "cambiarModelo"; sessionId: string; modelo: ModelAlias }
  /** Un chat de API en el lienzo, ya con el modelo que se propuso puesto. */
  | { hacer: "abrirChat"; modelo: string; nombre: string };

const CLAVE = "adeorq-acciones";
/** Un día. La bandeja se revisa a diario y una acción de anteayer apunta a una
    sesión que probablemente ya no está abierta. */
const VIDA = 24 * 60 * 60_000;

interface Guardada {
  a: AccionConsejo;
  t: number;
}

/**
 * Con qué se empareja una nota y su acción.
 *
 * El texto tal cual, pero sin lo que puede cambiar sin cambiar la nota: los
 * espacios de más y las mayúsculas. No se usa un id porque la nota viaja por un
 * fichero de texto donde no cabe ninguno, y el texto entero ES el identificador
 * natural: dos consejos distintos nunca dicen lo mismo (el copiloto ya se
 * encarga de eso con su llave anti-repetición).
 */
export function llaveTexto(texto: string): string {
  return texto.trim().replace(/\s+/g, " ").toLowerCase();
}

function leer(): Record<string, Guardada> {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as Record<string, Guardada> | null;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function escribir(todo: Record<string, Guardada>): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(todo));
  } catch {
    // Sin sitio para guardarla, la nota se queda sin botón. Es exactamente lo
    // que pasaba antes de que esto existiera: nunca motivo para reventar nada.
  }
}

export function guardarAccion(texto: string, a: AccionConsejo, ahora: number): void {
  const todo = leer();
  todo[llaveTexto(texto)] = { a, t: ahora };
  escribir(todo);
}

export function accionDe(texto: string): AccionConsejo | undefined {
  return leer()[llaveTexto(texto)]?.a;
}

/** Se olvida la de una nota que ya se ha resuelto. */
export function olvidarAccion(texto: string): void {
  const todo = leer();
  delete todo[llaveTexto(texto)];
  escribir(todo);
}

/** Y las viejas, para que esto no crezca para siempre. */
export function podarAcciones(ahora: number, vida = VIDA): void {
  const todo = leer();
  const vivas: Record<string, Guardada> = {};
  for (const [k, v] of Object.entries(todo)) {
    if (ahora - v.t < vida) vivas[k] = v;
  }
  if (Object.keys(vivas).length !== Object.keys(todo).length) escribir(vivas);
}
