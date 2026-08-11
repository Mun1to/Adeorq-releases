// La cola de propuestas de la Agenda, que se revisa de UNA EN UNA.
//
// Munir, 2026-08-11, viendo doce notas de doscientos caracteres apiladas: «me
// sigue pareciendo mucho texto, la Agenda debe aclarar las cosas, no hacerlas
// más difíciles». Cada nota es una decisión suya (va a su brújula o al
// METAS.md de un proyecto), y doce decisiones a la vez no se toman: se
// posponen todas. Así que se enseña una, con tres salidas.
//
// Eso convierte un problema de pintar en un problema de índice, y el índice
// tiene dos trampas que no se ven leyendo el JSX:
//
//   1. Aceptar o descartar QUITA la nota de la lista, así que la siguiente
//      ocupa ese mismo hueco y el índice no debe moverse. Si se moviera, cada
//      «Aceptar» se saltaría la de después.
//   2. Pero si la que se acepta era la última, el índice se queda fuera de
//      rango y la pantalla diría «no queda ninguna» con diez todavía sin
//      mirar. Por eso hay que rescatarlo.
//
// Aquí viven las dos reglas solas, sin React, para poder probarlas de verdad
// (`scripts/agenda-check.ts`).

/**
 * «Luego»: se pasa a la siguiente y al llegar al final se vuelve a empezar.
 *
 * Circular a propósito. Con un tope, posponer la última te echaría de la
 * revisión sin haber decidido nada, que es justo lo contrario de lo que hace
 * este botón; dando la vuelta, la cola sigue ahí hasta que se vacía o hasta
 * que él se va, y el contador «3 de 12» le dice dónde está.
 */
export function siguienteNota(indice: number, total: number): number {
  if (total <= 0) return 0;
  return (indice + 1) % total;
}

/**
 * Dónde queda el índice después de que la lista cambie sola (una nota
 * aceptada, una descartada, o una nueva que escribe un agente por detrás).
 *
 * Se queda quieto salvo que se haya salido del final. Con la lista vacía
 * vuelve a cero, que es cuando de verdad no queda ninguna.
 */
export function indiceValido(indice: number, total: number): number {
  if (total <= 0) return 0;
  if (indice >= total) return 0;
  if (indice < 0) return 0;
  return indice;
}
