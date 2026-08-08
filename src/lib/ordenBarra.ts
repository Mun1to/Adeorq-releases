// En qué orden salen los proyectos en la barra de la izquierda.
//
// Vive aparte del componente por lo de siempre: la regla se puede enumerar, así
// que se puede probar de verdad (`scripts/orden-check.ts`) en vez de mirarla en
// pantalla y opinar. Y aquí es donde se lee, en diez líneas, por qué la barra
// se coloca como se coloca.
//
// Munir, 2026-08-06: «los proyectos saltan de sitio» y «quiero fijar yo el
// orden». Las dos cosas son la misma: mientras el orden lo decida la actividad,
// la barra se recoloca sola cada vez que trabajas, y buscar el de siempre donde
// estaba deja de funcionar.

/** Lo que hace falta saber de un proyecto para colocarlo. */
export interface Colocable {
  name: string;
  /** Tiene algo abierto AHORA (una sesión viva o una terminal recién abierta). */
  hasLive: boolean;
  /** Horas desde su sesión más reciente. `Infinity` si no tiene ninguna. */
  minHours: number;
  /** Es un repo de git, que en igualdad de condiciones pesa más. */
  hasGit: boolean;
}

/**
 * Ordena la barra. `manual` es la lista que Munir dejó arrastrando, en su
 * orden; vacía mientras no haya movido nada.
 *
 * Las reglas, en este orden:
 *
 * 1. Lo que TÚ has colocado va primero, en tu orden, y no se mueve nunca más.
 * 2. Lo que no has colocado va detrás: primero lo que tiene algo abierto,
 *    luego lo más reciente, luego los repos de git, y a igualdad, por nombre.
 *
 * Que lo nuevo vaya DETRÁS y no al final del todo por orden alfabético es a
 * propósito: un proyecto recién creado tiene que verse, no esconderse debajo de
 * treinta que ya estaban.
 */
export function ordenarProyectos<T extends Colocable>(lista: T[], manual: string[]): T[] {
  const mio = new Map(manual.map((n, i) => [n, i]));
  return [...lista].sort((a, b) => {
    const ia = mio.get(a.name);
    const ib = mio.get(b.name);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    if (a.hasLive !== b.hasLive) return a.hasLive ? -1 : 1;
    if (a.minHours !== b.minHours) return a.minHours - b.minHours;
    if (a.hasGit !== b.hasGit) return a.hasGit ? -1 : 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

/**
 * El orden nuevo tras soltar `movido` sobre `destino`.
 *
 * Cae **donde lo llevas**: subiéndolo se queda encima del destino, y bajándolo
 * se queda debajo. Al principio caía siempre delante, y bajar un proyecto al
 * final de la lista era imposible: lo soltabas sobre el último y se colocaba
 * antes que él (Munir, 2026-08-07). Es la misma regla que cualquier lista que
 * se arrastra, y la dirección la dice de dónde venía.
 *
 * Se guarda la barra ENTERA tal y como se está viendo, no solo el que se ha
 * movido: así el primer arrastre congela lo que ya tenías delante, que es lo
 * que hace que a partir de ahí nada se recoloque solo.
 */
export function moverProyecto(visibles: string[], movido: string, destino: string): string[] {
  if (movido === destino) return visibles;
  const desde = visibles.indexOf(movido);
  const hasta = visibles.indexOf(destino);
  // Uno de los dos ya no está en la lista (se ocultó mientras arrastrabas):
  // mejor no tocar el orden que colocarlo en un sitio inventado.
  if (desde < 0 || hasta < 0) return visibles;
  const orden = visibles.filter((n) => n !== movido);
  const i = orden.indexOf(destino);
  orden.splice(desde < hasta ? i + 1 : i, 0, movido);
  return orden;
}

/**
 * De qué lado del destino va a caer, para pintar la raya DONDE va a caer.
 *
 * Existe porque la raya mentía la mitad de las veces: estaba escrita en el CSS
 * como una línea fija arriba del destino («encima de este»), mientras que
 * `moverProyecto` deja el arrastrado DEBAJO cuando lo bajas. Bajabas un
 * proyecto, veías la raya sobre el destino y acababa después. Una sola regla
 * decide las dos cosas, así que ya no pueden discrepar.
 *
 * `null` cuando no hay nada que marcar (soltar sobre sí mismo, o un destino que
 * ya no está en la lista).
 */
export type Lado = "antes" | "despues";

export function ladoDeCaida(visibles: string[], movido: string, destino: string): Lado | null {
  if (movido === destino) return null;
  const desde = visibles.indexOf(movido);
  const hasta = visibles.indexOf(destino);
  if (desde < 0 || hasta < 0) return null;
  return desde < hasta ? "despues" : "antes";
}

/**
 * Mover un grupo de sesiones dentro de SU proyecto.
 *
 * Los grupos de todos los proyectos viven en un solo array (`ui.groups`) y su
 * orden en la barra ES el orden de ese array, sin lista de orden aparte. Así
 * que aquí hay dos cuidados que no tiene el de proyectos:
 *
 *  1. El movimiento se calcula SOLO entre los del proyecto que se está tocando.
 *     Con la lista entera, los índices contarían grupos de otros proyectos que
 *     ni siquiera se ven, y el arrastrado caería en un sitio que no es.
 *  2. Los reordenados vuelven a las MISMAS ranuras que ocupaban en el array
 *     grande, así que ningún otro proyecto ve moverse los suyos.
 */
export function moverGrupo<T extends { id: string; project: string }>(
  todos: T[],
  proyecto: string,
  movido: string,
  destino: string,
): T[] {
  const mios = todos.filter((x) => x.project === proyecto);
  const orden = moverProyecto(mios.map((x) => x.id), movido, destino);
  const porId = new Map(mios.map((x) => [x.id, x]));
  const cola = orden.map((id) => porId.get(id)).filter((x): x is T => !!x);
  if (cola.length !== mios.length) return todos;
  let i = 0;
  return todos.map((x) => (x.project === proyecto ? cola[i++] : x));
}
