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

/**
 * ¿Hay que volver a colocar el scroll, o ya está donde debía?
 *
 * Existe porque colocarlo UNA vez no bastaba. La terminal tiene dos scrolls: el
 * del búfer (`viewportY`, que es lo que `volverA` calcula) y el del div que xterm
 * pone por encima (`.xterm-viewport`, con scroll de navegador). Al cambiar el
 * tamaño, ese div se resincroniza SOLO, en el frame siguiente, y ahí pisaba lo
 * que acabábamos de colocar: por eso abrir una terminal nueva o abrir la franja
 * de Skills, que cambian el ancho de todos los paneles, te subían el historial
 * y había que bajar a mano cada vez (Munir, 2026-08-10).
 *
 * Así que se coloca dos veces, y esta función es la que decide si la segunda
 * tiene algo que hacer: si el búfer ya está donde queríamos, no se toca nada, y
 * un scroll que hayas hecho tú entre medias no se pisa.
 */
export function hayQueRecolocar(destino: number | null, ahora: Vista): boolean {
  // Queríamos el final: solo si de verdad no estamos al final.
  if (destino === null) return ahora.viewportY < ahora.baseY;
  // Queríamos una línea concreta: un renglón de margen, porque el reflow puede
  // dejarlo a uno de distancia y recolocar por eso da un tirón peor que el fallo.
  return Math.abs(ahora.viewportY - destino) > 1;
}
