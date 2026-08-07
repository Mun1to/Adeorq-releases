// Dónde te deja el scroll de una terminal cuando hay que rehacer su texto.
//
// Una terminal se ajusta a su caja con `fit()`, y `fit()` rehace el texto para
// el ancho nuevo: una línea larga que ocupaba una fila pasa a ocupar dos, o al
// revés. Eso mueve el viewport, y el ResizeObserver dispara por cualquier cosa
// que cambie un píxel el alto del panel (una pregunta que aparece, el aviso de
// contexto, la barra de agentes). Resultado: estabas leyendo hacia arriba,
// llegaba texto nuevo, y el scroll se iba solo a otro sitio (Munir, 2026-08-07:
// «un pequeño scroll y a veces se te teletransporta hacia muy arriba»).
//
// Aquí viven las dos decisiones, sueltas y sin xterm delante para poder
// probarlas de verdad (`scripts/scroll-check.ts`).

/** Lo que hace falta saber del búfer de una terminal. `baseY` es la última
    línea a la que se puede bajar; `viewportY`, por dónde vas ahora. */
export interface Vista {
  baseY: number;
  viewportY: number;
}

export interface Rejilla {
  cols: number;
  rows: number;
}

/**
 * Si de verdad hay que rehacer el texto.
 *
 * La regla que faltaba: si la rejilla va a quedar igual, ajustar no cambia
 * nada de lo que se ve y en cambio sí mueve el scroll. Así que no se ajusta.
 */
export function hayQueAjustar(actual: Rejilla, propuesta: Rejilla | undefined | null): boolean {
  if (!propuesta || !propuesta.cols || !propuesta.rows) return false;
  return propuesta.cols !== actual.cols || propuesta.rows !== actual.rows;
}

/**
 * A qué línea volver después de rehacer el texto, o `null` para «al final del
 * todo».
 *
 * Se guarda la distancia AL FINAL y no el número de línea: tras el reflow ese
 * número ya no significa lo mismo, mientras que «doce líneas por encima del
 * final» sigue pareciéndose a lo que tenías delante. Y si estabas abajo del
 * todo, se vuelve abajo del todo, que es lo que espera cualquiera que esté
 * viendo trabajar a un agente.
 */
export function volverA(antes: Vista, baseYDespues: number): number | null {
  const desdeElFinal = antes.baseY - antes.viewportY;
  // Estabas al final (o más allá, que pasa mientras llega texto): al final.
  if (desdeElFinal <= 0) return null;
  return Math.max(0, baseYDespues - desdeElFinal);
}
