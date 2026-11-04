// Escribir en una terminal lo que ya dijo (su historia, al reengancharse tras
// actualizar o al volver de su ventana) sin que conteste a preguntas viejas.
//
// Lo volcado lleva las preguntas que el programa hizo en su día: el ConPTY
// pregunta dónde está el cursor al arrancar (`ESC[6n`), y xterm las contesta al
// leerlas, por `onData`, como si el programa acabara de preguntar. El programa
// ya tuvo su respuesta, y una de cursor en la fila 1 (`ESC[1;<col>R`) es la
// misma secuencia que F3 con un modificador: una consola cmd viva repetía su
// último comando, tecleado sin Intro, tras cada actualización. Medido con
// `scripts/laboratorio/motor-viejo-de-verdad.mjs` (2026-11-03): rojo sin esto,
// verde con esto. Es el riesgo 8 de `docs/contexto/terminales-fuera.md`.
import type { Terminal } from "@xterm/xterm";

const leyendo = new WeakSet<Terminal>();

/** Escribe `texto` en `term` y, hasta que xterm lo haya leído entero,
 *  `callaAlVolcar(term)` dice que lo que conteste es a preguntas viejas. */
export function escribirVolcado(term: Terminal, texto: string): void {
  leyendo.add(term);
  term.write(texto, () => leyendo.delete(term));
}

/** Si una respuesta del terminal sale de leer un volcado y no se manda. */
export function callaAlVolcar(term: Terminal): boolean {
  return leyendo.has(term);
}
