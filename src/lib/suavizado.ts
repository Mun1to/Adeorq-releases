// Cuánto se suaviza el scroll de las terminales.
//
// ── POR QUÉ ES UN AJUSTE Y NO UNA DECISIÓN MÍA ──────────────────────────────
//
// Munir, 2026-09-01: «no me gusta nada el scroll en las terminales con el panel
// táctil del portátil, me gustaría que fuese más fluido como una terminal
// cualquiera». Y lo dijo dos veces, porque la primera se arregló otra cosa.
//
// Lo que sí se puede medir, y está medido en un xterm de verdad: un salto de
// tres renglones, sin suavizar, pasa por UNA sola posición (de 1977 a 1974 de
// golpe, en un fotograma); con el suavizado puesto pasa por CUATRO (1977, 1976,
// 1975, 1974), repartidas en el tiempo. Esa es exactamente la diferencia entre
// saltar y deslizarse.
//
// Lo que NO se puede medir desde aquí es si a él le gusta más, y ahí está la
// trampa en la que ya se cayó: un panel táctil manda decenas de eventos por
// segundo, así que con suavizado cada uno reinicia la animación y puede sentirse
// arrastrado en vez de fluido. En este escritorio no hay forma de reproducir el
// gesto (ni `page.mouse.wheel` llega a la página ni xterm hace caso a un
// `WheelEvent` sintético), así que decidir por él sería adivinar otra vez.
//
// Por eso son tres opciones que cambian EN CALIENTE, sin reiniciar ni esperar
// otra versión: se prueba con el dedo en el panel y se elige. Es lo mismo que
// hace VS Code con `terminal.integrated.smoothScrolling`, y su valor es 125 ms.

const CLAVE = "adeorq-suavizado";

/** Milisegundos que tarda la vista en llegar. 0 es el salto seco de siempre. */
export type Suavizado = 0 | 125 | 220;

export const SUAVIZADOS: { valor: Suavizado; etiqueta: string }[] = [
  { valor: 0, etiqueta: "Seco" },
  { valor: 125, etiqueta: "Suave" },
  { valor: 220, etiqueta: "Muy suave" },
];

/** Avisa a las terminales abiertas de que hay que releerlo. */
export const SUAVIZADO_EVENTO = "adeorq-suavizado";

export function suavizado(): Suavizado {
  const n = Number(localStorage.getItem(CLAVE));
  return n === 0 || n === 125 || n === 220 ? n : 125;
}

export function ponerSuavizado(v: Suavizado): void {
  localStorage.setItem(CLAVE, String(v));
  window.dispatchEvent(new Event(SUAVIZADO_EVENTO));
}
