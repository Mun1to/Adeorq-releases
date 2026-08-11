// El turno de los que terminan.
//
// El ajuste «saltar a la sesión que termina» pone delante al agente que acaba
// de reclamarte. Con una terminal es obvio; con nueve, hay dos cosas que
// decidir y las dos las pidió Munir el 2026-08-11:
//
//   1. «Cuando termine otra que también tenías abierta y estás escribiendo en
//      esa, que no se te salte a la otra que ha terminado, como que espere a
//      su turno». Antes el salto se DESCARTABA si estabas tecleando en otra:
//      no te robaba la pantalla, pero es que además no volvías a saber de esa
//      sesión hasta que la buscabas a mano. Ahora hace cola.
//   2. «Cuando se abra una sesión en pantalla completa y le des un input
//      nuevo, debería desmaximizarse». La pantalla completa es para atender
//      algo; en cuanto le contestas, ya está atendido y el mosaico vuelve.
//
// Todo lo que se puede decidir sin React vive aquí, para poder probarlo
// (`scripts/saltos-check.ts`).

/**
 * Mete a uno en la cola de los que esperan turno.
 *
 * Sin repetidos y por orden de llegada: si un agente termina, le escribes, y
 * vuelve a terminar antes de que le tocara, sigue siendo el mismo turno y no
 * se cuela dos veces.
 */
export function encolar(cola: number[], id: number): number[] {
  return cola.includes(id) ? cola : [...cola, id];
}

/** Sale de la cola: le ha tocado, o su terminal se ha cerrado. */
export function sacarDeCola(cola: number[], id: number): number[] {
  return cola.filter((x) => x !== id);
}

/**
 * A quién le toca ahora, o `null` si a nadie.
 *
 * Solo cuentan los que siguen vivos: una terminal cerrada mientras esperaba su
 * turno no puede ponerse delante, y saltar a un panel que ya no existe dejaba
 * la cabina en blanco. Se respeta el orden de llegada, que es lo que hace que
 * esto sea un turno y no un sorteo.
 */
export function aQuienLeToca(cola: number[], vivos: ReadonlySet<number>): number | null {
  return cola.find((id) => vivos.has(id)) ?? null;
}

/**
 * Si esto que se acaba de teclear cuenta como «darle un input nuevo».
 *
 * No todo lo que llega por el teclado lo es. Mirar el historial con las
 * flechas, o pulsar Escape, es seguir leyendo lo que el agente te acaba de
 * enseñar: desmaximizar ahí sería quitarte la pantalla grande justo mientras
 * la usas. Las flechas, las teclas de función y los movimientos del cursor
 * llegan como secuencias de escape (empiezan por ESC), así que se distinguen
 * solas.
 *
 * Sí cuentan: escribir texto, el Enter, el borrado y el tabulador (que es
 * autocompletar, o sea que estás componiendo algo), y Ctrl+C, que es
 * intervenir de la forma más clara que hay.
 */
export function esInputDeVerdad(data: string): boolean {
  if (!data) return false;
  // Una secuencia de escape sola: flechas, inicio/fin, teclas de función.
  if (data.startsWith("\x1b")) return false;
  for (const ch of data) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x20 && c !== 0x7f) return true; // texto normal
    if (ch === "\r" || ch === "\n") return true; // enviar
    if (ch === "\t") return true; // autocompletar
    if (ch === "\x7f" || ch === "\b") return true; // borrar
    if (ch === "\x03") return true; // Ctrl+C: parar es intervenir
  }
  return false;
}

/**
 * Si hay que salir de pantalla completa al recibir ese input.
 *
 * Solo deshace lo que hizo el salto automático: si la pusiste a pantalla
 * completa TÚ, con el botón o el atajo, escribir en ella no te la quita. Esa
 * distinción es la razón de que haga falta guardar quién la maximizó.
 */
export function tocaDesmaximizar(
  maximizado: number | null,
  porElSalto: number | null,
  paneQueRecibe: number,
  data: string,
): boolean {
  if (maximizado === null) return false;
  if (maximizado !== paneQueRecibe) return false;
  if (porElSalto !== paneQueRecibe) return false;
  return esInputDeVerdad(data);
}
