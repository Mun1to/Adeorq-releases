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
// Y una tercera decisión, del 2026-08-21 («no funciona del todo bien»): DÓNDE
// se salta. Hasta hoy el salto daba por hecho que toda terminal vive en el
// mosaico de la Cabina, y hay dos que no. Ver `aDondeSaltar`.
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

/** Dónde vive la terminal que acaba de terminar, que es lo que decide el salto. */
export interface Sitio {
  /** Está en el mosaico de la Cabina. */
  enCabina: boolean;
  /** Está en el lienzo, que es otra vista y tiene su propia cámara. */
  enLienzo: boolean;
  /** Está apartada: minimizada, o dentro de un grupo escondido. */
  apartada: boolean;
}

/** Lo que hay que hacer para ponerla delante. */
export type Destino =
  /** Cambiar a la Cabina y maximizarla. Lo de siempre. */
  | "cabina"
  /** Traerla de vuelta al mosaico ANTES de maximizarla. */
  | "traer"
  /** Cambiar al lienzo y acercar la cámara. Allí no hay nada que maximizar. */
  | "lienzo"
  /** No hacer nada: no está en ninguna vista. */
  | "nadie";

/**
 * A dónde saltar, que hasta hoy no se preguntaba.
 *
 * El salto hacía SIEMPRE lo mismo: ir a la Cabina y maximizar. Eso es correcto
 * para una terminal del mosaico y está mal para las otras dos, y las dos fallan
 * en silencio, que es lo que hacía que el ajuste pareciera roto:
 *
 *   · **En el lienzo.** El lienzo reporta el estado de sus terminales por el
 *     mismo camino que la Cabina, así que una que termine allí disparaba el
 *     salto igual. Te sacaba de la vista en la que estabas trabajando, te
 *     plantaba en la Cabina, y allí no maximizaba nada porque ese panel no está
 *     en el mosaico. O sea: te cambiaba de vista para no enseñarte nada.
 *   · **Apartada.** Una minimizada, o de un grupo escondido, se maximizaba
 *     igual, y la red que suelta la pantalla completa de un panel que no se
 *     pinta (Munir, 2026-08-17) la desmaximizaba en el mismo suspiro. El
 *     ajuste estaba encendido, el agente terminaba, y no pasaba nada de nada.
 *     Aquí sí hay que ponerla delante: apartar es «ahora no me hace falta», y
 *     terminar es justo el momento en que vuelve a hacer falta.
 *
 * El cuarto caso es una terminal que ya no está en ninguna vista, y no es
 * hipotético: sacarla a su propia ventana la quita del mosaico, y entre que
 * termina y que le toca su turno en la cola puede haberse cerrado.
 */
export function aDondeSaltar(sitio: Sitio): Destino {
  // El lienzo primero: una terminal suya nunca está en el mosaico, y llevarla
  // allí sería justo el fallo que esto viene a arreglar.
  if (sitio.enLienzo) return "lienzo";
  if (!sitio.enCabina) return "nadie";
  return sitio.apartada ? "traer" : "cabina";
}
