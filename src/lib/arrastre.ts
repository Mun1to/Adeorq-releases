import type { PointerEvent } from "react";

/**
 * Qué NO debe mover la pieza entera cuando la agarras.
 *
 * Las piezas del lienzo se arrastran desde cualquier parte de su cuerpo, no
 * solo por la cabecera: así se mueve todo lo demás en un lienzo y es lo que
 * uno intenta. Pero eso choca con los sitios donde arrastrar ya significa otra
 * cosa: seleccionar el texto de un cuadro de escribir, correr un deslizador,
 * marcar unas líneas para copiarlas. Sin esta regla, intentar seleccionar una
 * palabra dentro de una nota se llevaba la nota por delante.
 *
 * React Flow decide mirando si el elemento tocado (o alguno de sus padres)
 * lleva la clase `nodrag`. En vez de acordarse de ponérsela a cada campo nuevo
 * —y de olvidarla justo en uno—, se para aquí el evento antes de que suba.
 */
const CONTROLES = "input, textarea, select, [contenteditable='true']";

export function nodragEnControles(e: PointerEvent): void {
  const el = e.target as HTMLElement | null;
  if (el?.closest?.(CONTROLES)) e.stopPropagation();
}
