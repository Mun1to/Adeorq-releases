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
// Nace apagado y no se enciende solo. Es una decisión de Munir, no una que
// tome la app por él: hay días de enseñar Adeorq y días de trabajar con ella.

import { TEMA_TERM_EVENTO } from "./temasTerm";

const CLAVE = "adeorq-rendimiento";

export function modoRendimiento(): boolean {
  return localStorage.getItem(CLAVE) === "1";
}

/** Se marca en `<html>`, como el apagón, para que lo vean a la vez el CSS y
    las terminales abiertas (que releen su fondo con ese mismo aviso). */
export function aplicarRendimiento(on: boolean): void {
  if (on) document.documentElement.dataset.rendimiento = "1";
  else delete document.documentElement.dataset.rendimiento;
  window.dispatchEvent(new Event(TEMA_TERM_EVENTO));
}

export function guardarRendimiento(on: boolean): void {
  localStorage.setItem(CLAVE, on ? "1" : "0");
  aplicarRendimiento(on);
}
