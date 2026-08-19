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

/**
 * Dónde volver cuando el CLI ha borrado el scrollback y lo ha repintado.
 *
 * ── EL CASO, MEDIDO EL 2026-08-19 ──────────────────────────────────────────
 *
 * Claude Code no escribe al final como un programa de terminal normal: borra la
 * pantalla Y el scrollback entero (`ESC[2J` + `ESC[3J`) y repinta la
 * conversación completa en cada turno. No es un descuido suyo, es deliberado, y
 * los mantenedores de xterm lo confirman en el issue #5620: lo hacen para
 * quedarse con la barra de scroll bonita y el ratón nativo sin gestionar el
 * buffer alternativo.
 *
 * La consecuencia es que estabas leyendo hacia arriba, el agente termina su
 * turno, y **lo que mirabas deja de existir un instante**. Reproducido en
 * `scripts/scroll-check.ts` sin navegador: mirando la línea 569, a 8 del final,
 * tras el ciclo la vista acaba en la 617, pegada al final. Y por eso el arreglo
 * de la beta.302 (que sí curó otro fallo, el del `ESC[3J` suelto) no tapa este:
 * aquí el búfer no miente, es que se ha reconstruido entero.
 *
 * Se conserva la DISTANCIA AL FINAL y no la línea, al revés que en un cambio de
 * alto: aunque el texto repintado sea el mismo, sus números de línea no lo son
 * (`baseY` pasó de 577 a 617 en la medición), así que la línea 569 de antes ya
 * no es la línea 569 de ahora. Lo único que sobrevive al repintado es «estaba a
 * ocho renglones del final».
 *
 * Devuelve `null` cuando estabas al final, que es el caso de siempre: quien
 * mira trabajar a un agente quiere el final, y ahí no hay nada que restaurar.
 */
export function trasBorrarScrollback(
  desdeElFinal: number,
  baseYDespues: number,
): number | null {
  if (desdeElFinal <= 0) return null;
  return Math.max(0, baseYDespues - desdeElFinal);
}

/**
 * Y qué pasa si mueves la rueda MIENTRAS el repintado está llegando.
 *
 * ── EL NOVENO REPORTE, MEDIDO EL 2026-08-19 ────────────────────────────────
 *
 * «Sigue el salto cuando haces solo un pequeño scroll para arriba.» Y era
 * verdad, con un número detrás. Reproducido en `pnpm xterm` contra el búfer de
 * verdad: estás al final; llega el `ESC[3J` y el primer trozo del repintado, de
 * forma que el búfer entero mide 87 renglones; subes TRES con la rueda y te
 * quedas en el 84; siguen llegando trozos hasta que el búfer mide 617. Tu
 * vista sigue clavada en el 84, que ahora está a **533 renglones del final**.
 * Subiste tres y acabaste medio historial arriba.
 *
 * La causa no es la de las tres veces anteriores. Aquí xterm hace lo correcto:
 * has scrolleado, así que respeta tu sitio y no te arrastra. Lo que pasa es que
 * tu sitio se mide en número de línea, y ese número se refería a un búfer que
 * en medio segundo pasa de 87 líneas a 617. La posición no se movió; el suelo
 * sí.
 *
 * Y por eso el arreglo anterior no lo tapaba: aquel apunta la distancia en el
 * momento del borrado, y en el momento del borrado estabas al final (distancia
 * cero, nada que restaurar). El gesto llega DESPUÉS, cuando ya no lo mira
 * nadie.
 *
 * La regla nueva, entonces: mientras el repintado está en vuelo, la rueda no
 * mueve la vista a una línea, **mueve la distancia al final**. Tres líneas
 * arriba significa tres líneas arriba del final, y da igual cuánto crezca el
 * búfer después.
 *
 * Se suma el movimiento del gesto en vez de volver a medir la distancia contra
 * `baseY`, y eso no es un rodeo: durante la entrega `baseY` crece entre un
 * gesto y el siguiente, así que medirla otra vez daría la distancia al final
 * NUEVO y cada ruedazo se llevaría por delante el anterior.
 *
 * @param pendiente A cuánto del final querías estar, o `null` si no hay ningún
 *                  repintado en vuelo y entonces esto no pinta nada.
 * @param movido    Renglones que ha movido el gesto: positivo hacia arriba.
 */
export function trasRueda(pendiente: number | null, movido: number): number | null {
  if (pendiente === null) return null;
  return Math.max(0, pendiente + movido);
}

/**
 * Cuántos renglones pide un gesto de rueda, leído del EVENTO y no del búfer.
 *
 * ── EL DÉCIMO REPORTE, Y POR QUÉ ESTA FUNCIÓN EXISTE (2026-08-19, noche) ───
 *
 * La 0.9.124 medía el gesto comparando `viewportY` antes y después del frame.
 * Sonaba exacto y era una bomba de relojería: entre esas dos lecturas puede
 * caer el BORRADO del repintado, y entonces la diferencia no es tu gesto, es
 * el colapso del búfer entero. Medido: búfer de 617, rueda de 3, borrado en
 * medio → «movido» sale 550 → la vista se coloca a 550 renglones del final.
 * Ese es el «scrolleo una vez para arriba y me lleva súper arriba» de Munir,
 * el décimo del mismo síntoma. Y el caso simétrico también existía y se vio
 * con el ratón de verdad: la rueda que llega justo DESPUÉS del borrado no
 * mueve nada (xterm aún no tiene scrollback que mover), la diferencia da
 * cero, el gesto no se apunta y el colocado te devuelve al final: subes y la
 * terminal te baja.
 *
 * La salida de raíz: el gesto se lee del `deltaY` del evento, que no depende
 * de en qué estado esté el búfer. La conversión no replica a xterm al
 * decimal, y no hace falta: equivocarse en un renglón te deja a un renglón de
 * donde querías; leer el búfer en mal momento te dejaba a quinientos.
 *
 * Positivo = hacia arriba (alejarse del final), como en `trasRueda`.
 *
 * @param deltaY    El del evento: negativo al subir, en la unidad de deltaMode.
 * @param deltaMode 0 píxeles, 1 líneas, 2 páginas (el estándar DOM).
 * @param celda     Alto de una fila en píxeles CSS.
 * @param filas     Filas visibles, para el modo página.
 */
export function gestoDeRueda(
  deltaY: number,
  deltaMode: number,
  celda: number,
  filas: number,
): number {
  const lineas =
    deltaMode === 1 ? deltaY : deltaMode === 2 ? deltaY * filas : celda > 0 ? deltaY / celda : 0;
  // El redondeo aleja de cero a propósito: un tic suave de rueda táctil (media
  // celda) tiene que contar como UN renglón, no como ninguno, porque xterm sí
  // lo mueve. Perder tics pequeños es la versión lenta del gesto perdido.
  return lineas < 0 ? Math.ceil(-lineas) : -Math.floor(lineas);
}
