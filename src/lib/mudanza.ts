// Terminales que están CAMBIANDO DE VENTANA, no muriendo.
//
// ── EL PROBLEMA QUE RESUELVE, QUE ES DE LOS QUE CUESTAN UNA HORA DE TRABAJO ──
//
// Cuando `TerminalPane` se desmonta, su limpieza llama a `killPty`. Y hace bien:
// una terminal que desaparece de la pantalla sin llevarse su proceso deja un
// agente corriendo que nadie ve, nadie lee y nadie puede matar.
//
// Pero sacar una terminal a su propia ventana ES un desmontaje: el panel se va
// del tablero de Adeorq y renace en otra ventana. Sin esta marca, arrastrar una
// terminal fuera mataría al agente que llevaba media hora trabajando, y el
// síntoma sería «se me cierra sola al sacarla».
//
// ── POR QUÉ UN SET SUELTO Y NO UN ESTADO DE REACT ───────────────────────────
//
// Porque quien tiene que leerlo es una función de limpieza, que corre DESPUÉS
// de que el componente haya muerto. Un estado de React ya no existe en ese
// momento; una variable de módulo sí. Es el mismo motivo por el que la marca se
// pone ANTES de tocar la lista de paneles y no después.
//
// La marca es de UN SOLO USO: se gasta al leerla. Así una terminal que sale y
// vuelve queda otra vez con su X de matar de verdad, sin que nadie tenga que
// acordarse de limpiarla.

const enMudanza = new Set<number>();

/** Marca que este panel se va a otra ventana, no a la basura. Se llama ANTES
    de quitarlo de la lista, porque el desmontaje va detrás y ya no espera. */
export function empiezaMudanza(id: number): void {
  enMudanza.add(id);
}

/**
 * ¿Este panel se está mudando? Consumir la respuesta forma parte de preguntar.
 *
 * Si no se gastara, la terminal quedaría marcada para siempre y su X dejaría de
 * matar al agente: el fallo contrario al que esto arregla, y peor, porque los
 * huérfanos no se ven hasta que la máquina va lenta.
 */
export function seMuda(id: number): boolean {
  return enMudanza.delete(id);
}

/** Cancelar la mudanza si al final no pudo salir (la ventana no abrió). Sin
    esto, un fallo al sacarla dejaría la marca puesta y la X sin efecto. */
export function cancelaMudanza(id: number): void {
  enMudanza.delete(id);
}

// ── LO QUE TIENE QUE PINTAR AL VOLVER ────────────────────────────────────────
//
// La terminal que vuelve de su ventana al tablero renace igual que la que sale:
// es un `TerminalPane` nuevo sobre un proceso que ya existía. La que sale se
// pinta con su historial (`VentanaSuelta`); la que volvía no se pintaba con
// NADA, y un Claude Code en pantalla completa seguía dibujando su pantalla
// alternativa dentro de la normal de un xterm recién nacido, con el ratón sin
// pedir y la rueda para Adeorq (Munir, 2026-09-21: «no se puede hacer scroll
// bien»). Va en un mapa de módulo por lo mismo que la marca de arriba: quien lo
// deja es `App` al recibir la vuelta, y quien lo recoge es el efecto que monta
// la terminal, dos sitios sin nada en común por donde pasar una prop.
//
// De UN SOLO USO, como la marca: una terminal que volviera a montarse después
// no puede escribir dos veces el mismo historial.

const volcados = new Map<number, string>();

/** Apunta lo que la terminal de este panel tiene que escribir al renacer. */
export function dejarVolcado(id: number, texto: string): void {
  if (texto) volcados.set(id, texto);
}

/** Lo recoge y lo borra. Vacío si no había nada apuntado. */
export function tomarVolcado(id: number): string {
  const texto = volcados.get(id) ?? "";
  volcados.delete(id);
  return texto;
}
