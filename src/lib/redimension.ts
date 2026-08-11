// Mientras arrastras un separador, las terminales no se reajustan.
//
// El lag tenía una cadena entera detrás, y ninguno de sus eslabones era lento
// por sí solo (Munir, 2026-08-11: «hay mucho lag cuando haces el resizing y
// también automáticamente se te mueve el texto para arriba»):
//
//   arrastras 13 px  →  setCols  →  se re-renderiza el panel entero  →  el
//   ResizeObserver de CADA terminal dispara  →  fit()  →  xterm rehace el
//   reflow de todo su búfer (puede tener diez mil líneas)  →  y encima avisa
//   del tamaño nuevo al PTY, que es un salto a Rust.
//
// Con nueve terminales abiertas y el ratón moviéndose, eso son varios cientos
// de reflows y de saltos a Rust por segundo para enseñar un estado intermedio
// que nadie va a leer. Y como cada `fit()` recoloca el scroll, el historial se
// va hacia arriba: no es un fallo aparte, es el mismo.
//
// La regla, que es la de cualquier emulador de terminal decente: mientras el
// dedo está abajo se mueve solo el CSS, y el reflow se hace UNA vez al soltar.
//
// Vive fuera de React a propósito. Meterlo en un estado obligaría a re-pintar
// los nueve paneles justo en el frame que se quiere aligerar; aquí es una
// bandera en memoria y un evento, y ni App ni los paneles se enteran hasta que
// hay algo que hacer.

/** Lo que se dispara al soltar para que cada terminal se ajuste una vez. */
export const EVENTO_REFIT = "adeorq:refit";

/**
 * Cada cuánto se deja reajustar una terminal MIENTRAS se arrastra.
 *
 * El primer intento fue no reajustar en absoluto hasta soltar, y era pasarse
 * (Munir, 2026-08-11: «solo se mueve la parte de la derecha, las terminales de
 * la izquierda no se mueven»). Es exactamente lo que tenía que pasar: la
 * columna que encoge se quedaba con el texto del ancho de antes, así que se
 * veía cortado y la barra parecía mover solo un lado.
 *
 * Ochenta milisegundos son unos doce reflows por segundo en vez de sesenta y
 * pico. Se ve fluir el texto de las dos columnas mientras arrastras, y se paga
 * la quinta parte. El ajuste exacto sigue llegando al soltar.
 */
export const CADENCIA_ARRASTRE_MS = 80;

/**
 * Si toca reajustar ahora. Fuera de un arrastre, siempre; dentro, solo cuando
 * ha pasado la cadencia desde el anterior.
 */
export function tocaAjustar(ahora: number, ultimo: number, arrastrando: boolean): boolean {
  if (!arrastrando) return true;
  return ahora - ultimo >= CADENCIA_ARRASTRE_MS;
}

let arrastrando = false;

/** Si hay un separador (o el borde de la ventana) en movimiento ahora mismo. */
export function redimensionando(): boolean {
  return arrastrando;
}

export function empezarRedimension(): void {
  if (arrastrando) return;
  arrastrando = true;
  /* Marca en el DOM para que el CSS pueda apagar lo que cueste pintar (las
     sombras y el desenfoque del cristal) mientras dura el arrastre. */
  document.body.dataset.redim = "1";

  /* El seguro. `setPointerCapture` garantiza que el `pointerup` vuelve al
     separador, pero si el puntero se pierde de otra manera (la ventana pierde
     el foco, el navegador cancela el gesto) la bandera se quedaría puesta y
     las terminales no volverían a ajustarse NUNCA. Escuchar también en la
     ventana cuesta nada y cierra ese agujero. */
  window.addEventListener("pointerup", terminarRedimension, { once: true });
  window.addEventListener("pointercancel", terminarRedimension, { once: true });
  window.addEventListener("blur", terminarRedimension, { once: true });
}

export function terminarRedimension(): void {
  if (!arrastrando) return;
  arrastrando = false;
  delete document.body.dataset.redim;
  window.removeEventListener("pointerup", terminarRedimension);
  window.removeEventListener("pointercancel", terminarRedimension);
  window.removeEventListener("blur", terminarRedimension);
  /* Ahora sí: un solo ajuste, con el tamaño definitivo. En el frame siguiente
     porque el layout de la última posición puede no estar aplicado todavía. */
  requestAnimationFrame(() => window.dispatchEvent(new Event(EVENTO_REFIT)));
}
