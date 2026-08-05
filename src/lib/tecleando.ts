// Si estabas escribiendo, y dónde.
//
// Existe por una cosa concreta: cuando un agente termina y el ajuste dice que
// hay que ponerlo delante, eso no puede pasar mientras tecleas en OTRA
// terminal. Robarte la pantalla a mitad de frase deja lo que escribías en un
// sitio que ya no ves.
//
// Lo obvio era mirar `document.activeElement`, y es justo lo que NO funciona:
// xterm tiene un <textarea> escondido que mantiene el foco siempre que miras
// una terminal, escribas o no. Con eso, "estoy tecleando" era verdad casi
// siempre y el salto no ocurría nunca (visto en la 0.9.2, 2026-07-28).
//
// Así que la señal es la de verdad: el `onData` de xterm, que solo salta
// cuando alguien pulsa una tecla, y sabe en qué pane fue.

let ultima: { at: number; pane: number } | null = null;

/** Alguien acaba de escribir en ese pane. */
export function apuntaTecla(pane: number): void {
  ultima = { at: Date.now(), pane };
}

/**
 * ¿Está escribiendo ahora mismo en otro sitio que no sea `id`?
 *
 * Cuatro segundos: lo bastante para cubrir una frase escrita a ratos, y lo
 * bastante poco para que dejar el teclado y esperar a que acabe el agente sí
 * te lleve a él, que es lo que uno pidió al encender el ajuste.
 */
export function tecleandoEnOtro(id: number, ms = 4000): boolean {
  return !!ultima && ultima.pane !== id && Date.now() - ultima.at < ms;
}
