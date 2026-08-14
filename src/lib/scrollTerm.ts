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
 * ── LOS DOS CASOS, QUE NO SON EL MISMO (2026-08-14) ─────────────────────────
 *
 * Hasta hoy había una sola regla, «mantén la distancia al final», y **esa regla
 * ERA el salto**. Vale cuando cambia el ANCHO, porque entonces el texto se
 * re-envuelve, los números de línea dejan de significar lo mismo y «doce líneas
 * por encima del final» es lo más parecido que queda a lo que tenías delante.
 *
 * Pero cuando lo único que cambia es el ALTO, el texto NO se toca: las líneas
 * son exactamente las mismas y solo se ven más o menos a la vez. Mantener ahí la
 * distancia al final te mueve tantas líneas como haya cambiado el alto, porque
 * `baseY` es «total de líneas menos las que caben». Un panel que se hace más
 * alto baja su `baseY`, y con la regla vieja el destino salía por encima de
 * donde estabas: **el salto hacia arriba**. Y el alto de un panel cambia solo,
 * sin que nadie toque nada, cada vez que aparece el aviso de contexto o la barra
 * de agentes, que es por lo que pasaba «mientras hacía scroll» (Munir, tercera
 * vez que lo reporta: 7 y 10 de agosto, y hoy).
 *
 * Con el ancho igual, la línea de arriba se queda donde estaba y ya.
 */
export function volverA(antes: Vista, baseYDespues: number, mismoAncho = false): number | null {
  const desdeElFinal = antes.baseY - antes.viewportY;
  // Estabas al final (o más allá, que pasa mientras llega texto): al final.
  // Esto manda sobre lo demás: quien mira trabajar a un agente quiere el final.
  if (desdeElFinal <= 0) return null;
  if (mismoAncho) {
    // Nada se ha re-envuelto: la línea de arriba sigue siendo esa misma línea.
    // El tope es por si el panel creció tanto que ya no hay dónde bajar.
    return Math.max(0, Math.min(antes.viewportY, baseYDespues));
  }
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
