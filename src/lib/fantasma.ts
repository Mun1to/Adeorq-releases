// Lo que llevas en la mano mientras arrastras.
//
// Hasta ahora arrastrar en la barra era un acto de fe: la fila se quedaba en su
// sitio atenuada al 40 % y una raya marcaba el destino. Funcionaba, pero no se
// parecía a coger algo (Munir, 2026-08-08: «no se puede hacer que básicamente
// lo arrastres literalmente»). Esto levanta una copia de la fila y la pega al
// puntero hasta que sueltas.
//
// Tres decisiones que son el motivo de que esto sea un archivo y no cuatro
// líneas dentro del componente:
//
//  1. **Una copia del DOM, no un componente de React.** `cloneNode(true)` se
//     lleva el logo, las insignias, los colores y el tema tal y como están en
//     pantalla, sin volver a pintar nada ni duplicar el JSX de la fila en otro
//     sitio donde se separaría del original al primer arreglo.
//  2. **Colgada del `body`, no de la lista.** La barra tiene scroll propio, así
//     que una fila levantada dentro de ella se recorta en cuanto asoma por el
//     borde, que es justo cuando estás llevándola a otro sitio.
//  3. **Se mueve con `transform`, nunca con `top`/`left`.** Adeorq apila treinta
//     superficies de cristal sobre una foto, y cambiar la posición recalcula la
//     maquetación y con ella el desenfoque de todo lo que hay debajo, sesenta
//     veces por segundo. `transform` va por el compositor y no toca nada de eso.

/** La clase la pone el CSS; aquí solo se nombra una vez. */
const CLASE = "fantasma";

export interface Fantasma {
  /** Llévalo a donde esté el puntero ahora. */
  mover(x: number, y: number): void;
  /** Quítalo. Se puede llamar dos veces sin que pase nada. */
  soltar(): void;
}

/**
 * Dónde tiene que ir la esquina de la copia para que el puntero caiga en el
 * mismo punto de la fila donde la agarraste.
 *
 * Aparte para poder comprobarla: sin esto, el elemento salta al empezar el
 * gesto (se centra en el puntero) y se siente como si se te hubiera escapado.
 */
export function posicion(
  caja: { left: number; top: number; width: number; height: number },
  agarre: { x: number; y: number },
  puntero: { x: number; y: number },
  /**
   * Hasta dónde puede llegar. Sin esto, arrastrar un proyecto lo sacaba de la
   * barra y lo dejaba flotando sobre las terminales (Munir, 2026-08-08: «que no
   * se pueda mover de donde la pestaña en sí de workspaces»), que además es
   * mentira: ahí no se puede soltar nada, así que enseñarlo ahí promete un sitio
   * que no existe.
   */
  limite?: { left: number; top: number; right: number; bottom: number },
): { x: number; y: number } {
  let x = puntero.x - (agarre.x - caja.left);
  let y = puntero.y - (agarre.y - caja.top);
  if (limite) {
    // Se acota la esquina de arriba a la izquierda contando el tamaño de la
    // copia, o el corral dejaría asomar por abajo y por la derecha justo lo que
    // mide la fila. Y con `Math.max` DESPUÉS del `min` para que un corral más
    // estrecho que la copia la pegue al borde en vez de sacarla por el otro.
    x = Math.max(limite.left, Math.min(x, limite.right - caja.width));
    y = Math.max(limite.top, Math.min(y, limite.bottom - caja.height));
  }
  return { x, y };
}

/**
 * Levanta una copia de `el` y la deja pegada al puntero.
 *
 * `x`/`y` son las coordenadas donde se agarró, para conservar el punto exacto
 * por el que la cogiste.
 */
export function levantar(
  el: HTMLElement,
  x: number,
  y: number,
  /**
   * Variables de CSS que hay que llevarse a mano porque las define un ANCESTRO
   * y la copia deja de tenerlo. Solo hace falta para la cabecera de un grupo:
   * su color (`--sg`) vive en el `li` de arriba, y sin esto una cuadrilla se
   * levantaría en gris, que es justo lo que la distingue de un grupo normal.
   */
  vars?: Record<string, string | undefined>,
  /**
   * El elemento que hace de corral. Se mide en CADA movimiento y no una sola
   * vez: la barra puede desplazarse sola mientras arrastras (el autoscroll de
   * los bordes), y con una medida congelada el corral se quedaría donde estaba.
   */
  corral?: HTMLElement | null,
): Fantasma {
  const caja = el.getBoundingClientRect();
  const agarre = { x, y };
  const clon = el.cloneNode(true) as HTMLElement;
  clon.classList.add(CLASE);
  for (const [k, v] of Object.entries(vars ?? {})) if (v) clon.style.setProperty(k, v);
  // El ancho y el alto se congelan: fuera de la lista el clon no tiene quien le
  // diga cuánto mide, y sin esto se encoge a lo que ocupe su texto.
  clon.style.width = `${caja.width}px`;
  clon.style.height = `${caja.height}px`;
  // Marcas del arrastre que NO se copian: el original se atenúa mientras lo
  // llevas, y la copia es justamente lo que tiene que verse entero.
  clon.removeAttribute("data-moviendo");
  clon.removeAttribute("data-encima");
  clon.removeAttribute("data-suelta");
  // Ni identidad ni foco: es un dibujo. Sin esto, un lector de pantalla leería
  // dos veces la misma fila y el tabulador pararía en un elemento fantasma.
  clon.setAttribute("aria-hidden", "true");
  clon.querySelectorAll("button, input, a").forEach((b) => b.setAttribute("tabindex", "-1"));
  document.body.appendChild(clon);

  const mover = (px: number, py: number) => {
    const r = corral?.getBoundingClientRect();
    const limite = r
      ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
      : undefined;
    const p = posicion(caja, agarre, { x: px, y: py }, limite);
    clon.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
  };
  mover(x, y);

  return {
    mover,
    soltar: () => clon.remove(),
  };
}
