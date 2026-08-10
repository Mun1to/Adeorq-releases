// El modo rendimiento: la cara bonita de Adeorq cuesta dinero, y aquí se apaga.
//
// Medido el 2026-08-07 sobre la app en marcha con tres terminales: el motor en
// Rust al 4,4% de un núcleo, y su parte web al 66,6% pintando y al 72,1% en el
// renderizador, sin parar. Adeorq apila treinta superficies de cristal sobre
// una foto y las terminales son transparentes para que la foto se vea a través:
// eso es precioso y es exactamente lo que cuesta. Cada cosa que se mueve
// encima obliga a recalcular el desenfoque de todo lo que hay debajo.
//
// Este interruptor no cambia lo que Adeorq HACE, solo lo que gasta en dibujarlo:
//
//   · el desenfoque del cristal baja de 22 píxeles a 6, que es donde deja de
//     costar y todavía se distingue de un panel plano;
//   · las terminales dejan de ser transparentes (siguen con el color de su
//     tema, pero sólido), que es el gasto de fondo debajo de todo;
//   · lo que respira deja de respirar: el halo del panel que te espera y el
//     ecualizador de la música.
//
// ── Por qué ya NO nace apagado (2026-08-09) ─────────────────────────────────
//
// Aquí ponía que nacía apagado y no se encendía solo, porque «hay días de
// enseñar Adeorq y días de trabajar con ella». La intención era buena y el
// valor de fábrica estaba mal: el número de arriba es con TRES terminales, que
// es un día normal, no una demo. Munir preguntó por qué esto era una opción y
// no lo de fábrica (2026-08-09) y tenía razón.
//
// Ahora son tres modos y el de fábrica es AUTOMÁTICO: con pocas terminales se
// queda el cristal, que es cuando no cuesta y cuando la app se ve como se tiene
// que ver; al pasar del umbral se apaga solo. Así deja de ser una elección
// entre bonita y rápida: es bonita mientras puede permitírselo.

import { TEMA_TERM_EVENTO } from "./temasTerm";

const CLAVE = "adeorq-rendimiento";

/**
 * Cuántas terminales de agente hacen falta para que el cristal empiece a doler.
 *
 * Cuatro, y sale del número medido arriba: con tres ya iba al 66% de un núcleo
 * solo pintando, así que la cuarta es donde se cruza la línea de «se nota al
 * escribir». No es un número redondo elegido a ojo.
 */
export const UMBRAL_AHORRO = 4;

export type ModoRend = "nunca" | "auto" | "siempre";

/**
 * Lo que Munir ha elegido, no lo que está pasando ahora.
 *
 * Lee también el ajuste VIEJO, que era un sí/no: quien lo tuviera encendido se
 * queda con «siempre», que es exactamente lo que tenía. Al apagado NO se le
 * respeta el «nunca», y esto es deliberado: eso no era una elección suya, era
 * el valor de fábrica de antes, y el valor de fábrica es justo lo que este
 * cambio corrige.
 */
export function prefRendimiento(): ModoRend {
  const v = localStorage.getItem(CLAVE);
  if (v === "nunca" || v === "auto" || v === "siempre") return v;
  return v === "1" ? "siempre" : "auto";
}

/**
 * Si con esta preferencia y estas terminales toca ahorrar.
 *
 * Puro y sin tocar nada: es la única decisión de todo esto, así que vive sola y
 * se puede comprobar (`scripts/rendimiento-check.ts`).
 */
export function debeAhorrar(pref: ModoRend, terminales: number): boolean {
  if (pref === "siempre") return true;
  if (pref === "nunca") return false;
  return terminales >= UMBRAL_AHORRO;
}

/**
 * Si el ahorro está puesto AHORA MISMO.
 *
 * Se lee del `<html>` y no de la preferencia, y esa es la diferencia que
 * importa desde que existe el automático: en «auto» la preferencia no dice si
 * está puesto, solo cuándo debería estarlo. Quien pregunta esto (el fondo de
 * las terminales, el historial de xterm) quiere saber qué está pasando.
 */
export function modoRendimiento(): boolean {
  return document.documentElement.dataset.rendimiento === "1";
}

/** Se marca en `<html>`, como el apagón, para que lo vean a la vez el CSS y
    las terminales abiertas (que releen su fondo con ese mismo aviso). */
export function aplicarRendimiento(on: boolean): void {
  if (on === modoRendimiento()) return;
  if (on) document.documentElement.dataset.rendimiento = "1";
  else delete document.documentElement.dataset.rendimiento;
  window.dispatchEvent(new Event(TEMA_TERM_EVENTO));
}

/** Guarda la elección y la aplica con las terminales que haya ahora. */
export function guardarRendimiento(pref: ModoRend, terminales: number): void {
  localStorage.setItem(CLAVE, pref);
  aplicarRendimiento(debeAhorrar(pref, terminales));
}
