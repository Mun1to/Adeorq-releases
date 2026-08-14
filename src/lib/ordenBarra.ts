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

/**
 * Las sesiones fijadas, en el orden en que las fijaste.
 *
 * Munir lo pidió tres veces («o fijarlas arriba»), y el motivo es el mismo que
 * el de `projectOrder`: la lista se ordena sola por actividad, así que la
 * conversación que usas cada día se va moviendo de sitio y hay que buscarla.
 * Fijarla es decir «esta se queda donde la he puesto».
 *
 * Van a una SECCIÓN propia en la cabeza de la barra, no arriba de su proyecto
 * (Munir, 2026-08-09, con una captura al lado: «cámbialo a algo parecido al
 * arrastrar de los proyectos»). Subirla dentro de su proyecto no servía de
 * nada: el proyecto puede estar plegado o el décimo de la lista, así que la
 * sesión seguía sin estar a la vista, que era justo lo que se pedía.
 *
 * Dos decisiones que hacen que esto no sorprenda:
 *
 *  1. **Mandan el orden de `fijadas`, no el de la lista.** Si mandara la lista,
 *     fijar dos las dejaría a merced de la misma actividad de la que las estás
 *     sacando, que es lo que se quiere evitar.
 *  2. **Un id fijado que ya no está en la lista no hace nada.** Una sesión
 *     borrada o archivada no puede dejar un hueco ni colar una fila que no
 *     debería verse: aquí solo se ELIGE de lo que ya venía.
 */
export function fijadasDe<T extends { id: string }>(sesiones: T[], fijadas: string[]): T[] {
  if (!fijadas.length) return [];
  const porId = new Map(sesiones.map((s) => [s.id, s]));
  return fijadas.map((id) => porId.get(id)).filter((s): s is T => !!s);
}

/** Lo que NO está fijado, en el orden en que venía. Es el complemento exacto de
    `fijadasDe`: una sesión fijada sale de su proyecto mientras lo está, para que
    no se vea en dos sitios a la vez. */
export function sinFijadas<T extends { id: string }>(sesiones: T[], fijadas: string[]): T[] {
  if (!fijadas.length) return sesiones;
  const clavadas = new Set(fijadas);
  return sesiones.filter((s) => !clavadas.has(s.id));
}

/** Mover una fijada a otro sitio de la sección, con la misma regla que los
    proyectos: arrastrada hacia abajo cae DEBAJO del destino, hacia arriba
    encima. Una sola regla para toda la barra. */
export function moverFijada(fijadas: string[], movida: string, destino: string): string[] {
  return moverProyecto(fijadas, movida, destino);
}

/**
 * Clavar una sesión o soltarla.
 *
 * Al clavar entra la ÚLTIMA de las clavadas, no la primera: si cada una nueva
 * se pusiera delante, clavar la tercera empujaría a las dos anteriores y el
 * sitio que les diste se movería solo. Estable gana a novedosa; arriba del todo
 * van igual, porque todas las clavadas están por encima del resto.
 */
export function alternarFijada(fijadas: string[], id: string): string[] {
  return fijadas.includes(id) ? fijadas.filter((x) => x !== id) : [...fijadas, id];
}

/**
 * En qué parte de una fila has soltado: en un borde o en el centro.
 *
 * Hace falta porque sobre una fila caben DOS gestos y hay que distinguirlos sin
 * pedirle a nadie que aprenda nada: soltar una sesión encima de otra siempre ha
 * creado un grupo con las dos, que es la forma más corta de hacer uno, y Munir
 * pidió además poder subirlas y bajarlas a mano (2026-08-09). Los bordes
 * reordenan y el centro agrupa, que es lo que hacen las apps que tienen las dos
 * cosas, y cada gesto se anuncia distinto: una raya en el borde, la fila
 * encendida en el centro.
 *
 * El borde es el 30 % de arriba y el 30 % de abajo. Menos se falla al apuntar;
 * más deja el centro tan estrecho que agrupar se vuelve casualidad.
 *
 * `alto` a cero devuelve "centro": una fila que todavía no se ha medido no
 * puede decidir nada, y agrupar es lo que esta barra hacía antes de esto.
 */
export function zonaDeFila(y: number, top: number, alto: number, borde = 0.3): Lado | "centro" {
  if (alto <= 0) return "centro";
  const p = (y - top) / alto;
  if (p < borde) return "antes";
  if (p > 1 - borde) return "despues";
  return "centro";
}

/**
 * Colocar una sesión suelta antes o después de otra.
 *
 * Las sueltas no tienen una lista de orden propia hasta que mueves una: hasta
 * entonces las ordena la actividad, como a los proyectos. Por eso esto recibe
 * el orden que se ESTÁ VIENDO y devuelve la lista entera, y no un `orden`
 * parcial: si guardara solo lo movido, el resto seguiría bailando con la
 * actividad y lo que colocaste a mano cambiaría de vecinos solo.
 */
export function colocarSuelta(
  visibles: string[],
  movida: string,
  destino: string,
  lado: Lado,
): string[] {
  if (movida === destino) return visibles;
  const sin = visibles.filter((x) => x !== movida);
  const i = sin.indexOf(destino);
  if (i < 0) return visibles;
  // Si la movida no estaba en esta lista, ENTRA. Es lo que hace falta para
  // arrastrar una sesión de la sección de fijadas a las sueltas y al revés:
  // antes se exigía que ya perteneciera, así que ese arrastre no hacía nada y
  // la sesión se quedaba fijada donde estaba (Munir, 2026-08-09). Colocar y
  // traer son el mismo gesto visto desde las dos listas.
  sin.splice(lado === "antes" ? i : i + 1, 0, movida);
  return sin;
}

/**
 * Una lista con el orden que le diste a mano, y detrás lo que no colocaste.
 *
 * Es `ordenarProyectos` un piso más abajo y sin criterios de desempate: aquí lo
 * de detrás ya viene ordenado por actividad de antes, así que solo hay que
 * respetarlo. Lo que colocaste va primero y en tu orden; lo que aparezca
 * después (una sesión nueva) se pone al final, a la vista, y no se cuela en
 * medio de lo que ya habías dejado puesto.
 */
export function conOrdenManual<T extends { id: string }>(lista: T[], manual: string[]): T[] {
  if (!manual.length) return lista;
  const puesto = new Map(manual.map((id, i) => [id, i]));
  const mios = lista.filter((x) => puesto.has(x.id));
  if (!mios.length) return lista;
  mios.sort((a, b) => (puesto.get(a.id) as number) - (puesto.get(b.id) as number));
  return [...mios, ...lista.filter((x) => !puesto.has(x.id))];
}

/**
 * Si una fila tiene que bajar un puesto para dejar el hueco abierto: 1 o 0.
 *
 * Es la mecánica de arrastre que pidió Munir el 2026-08-09, después de rechazar
 * dos veces la de la raya: «que cuando lo muevas se mueva lo que tiene cerca».
 * En vez de anunciar dónde va a caer con una línea, la lista se abre y deja el
 * hueco a la vista, que es lo que hacen Claude Desktop, Notion y Linear.
 *
 * Por qué esto y no la raya, dicho una vez: una raya es una PROMESA de lo que
 * va a pasar, y ya mintió una vez (iba siempre encima del destino mientras el
 * movimiento dejaba el arrastrado debajo). Un hueco no promete nada: es el
 * resultado, enseñado antes de soltar. No puede discrepar de sí mismo.
 *
 * `indice` va sobre la lista SIN la fila que llevas, que ya no está en el flujo:
 * la lleva el puntero. Ver `huecoEn`, que es donde se decide el puesto.
 */
export function desplazamiento(indice: number, hueco: number): 0 | 1 {
  return indice >= hueco ? 1 : 0;
}

/**
 * En qué puesto se abre el hueco, contando ya SIN la fila que llevas en la mano.
 *
 * Ese «sin» es todo el arreglo del 2026-08-09: la primera versión apartaba a las
 * vecinas pero dejaba la fila arrastrada ocupando su sitio, así que en la lista
 * había una fila de más y se montaban unas encima de otras. Munir lo vio en
 * cuanto lo tocó: «no tiene que ponerse encima de otra, sino ajustar bien los
 * espacios que ha dejado la que arrastras».
 *
 * La que llevas sale del flujo (`display: none`), las de abajo suben solas a
 * tapar su hueco, y aquí se decide dónde se abre el nuevo. Así solo hay un
 * hueco en pantalla y siempre mide una fila.
 */
export function huecoEn(sinLaMano: string[], destino: string, lado: Lado): number {
  const i = sinLaMano.indexOf(destino);
  if (i < 0) return -1;
  return lado === "antes" ? i : i + 1;
}

/**
 * La marca de «vas a COLOCARLA aquí», que la barra apunta mientras arrastras.
 *
 * Es una cadena porque el mismo dato pinta la pantalla y resuelve el gesto, y
 * comparte hueco con las otras marcas (`s:<sesión>` para agrupar, `p:<proyecto>`
 * para mudarla). Vive aquí, con sus casos probados, porque ya se rompió por
 * escribirla y leerla a ojo en dos sitios distintos: la lista de destino iba
 * dentro y se leía con un `split(":")` de cuatro trozos, así que una clave como
 * `p:Adeorq`, que lleva dos puntos dentro, se partía por su mitad y soltar
 * dentro de un proyecto no hacía absolutamente nada.
 *
 * De ahí la regla: en la cadena solo van piezas de las que se sabe SEGURO que no
 * llevan dos puntos, y el id de la fila, que puede llevarlos, va el último y se
 * lee entero. Lo demás (la lista) viaja aparte.
 */
export function marcaDeColocar(lado: Lado, fila: string): string {
  return `r:${lado}:${fila}`;
}

/** Lo de arriba al revés. `null` si la marca no es de colocar. */
export function leerMarcaDeColocar(marca: string): { lado: Lado; fila: string } | null {
  if (!marca.startsWith("r:")) return null;
  const corte = marca.indexOf(":", 2);
  if (corte < 0) return null;
  const lado = marca.slice(2, corte);
  const fila = marca.slice(corte + 1);
  if ((lado !== "antes" && lado !== "despues") || !fila) return null;
  return { lado, fila };
}

/**
 * El orden manual de cada lista, leído de lo que hubiera guardado en disco.
 *
 * Hasta la 0.9.99 esto era UN array, `sueltasOrder`, y guardaba el orden del
 * cajón del final de la barra. Solo de ese: las sueltas de un proyecto y las de
 * un grupo son otras listas y no tenían dónde ir, así que arrastrar dentro de
 * un proyecto abría el hueco y al soltar no pasaba nada. Ahora hay una lista
 * por sitio, con su clave (`sueltas`, `p:<proyecto>`, `g:<grupo>`).
 *
 * Lo viejo se SUBE a su clave en vez de tirarlo: quien tuviera sus sueltas
 * colocadas a mano se las encontraría barajadas al actualizar. Y se comprueba
 * de verdad que lo que hay dentro son listas de textos, porque esto viene de un
 * fichero que puede estar a medio escribir o de una versión que no existía.
 */
export function ordenGuardado(guardado: unknown): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  if (!guardado || typeof guardado !== "object") return salida;
  const g = guardado as { ordenLista?: unknown; sueltasOrder?: unknown };
  const esLista = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string");
  if (g.ordenLista && typeof g.ordenLista === "object" && !Array.isArray(g.ordenLista)) {
    for (const [k, v] of Object.entries(g.ordenLista)) {
      if (k && esLista(v)) salida[k] = v;
    }
  }
  // Solo si la clave nueva no trae ya lo suyo: una vez migrado, manda la nueva.
  if (!salida.sueltas && esLista(g.sueltasOrder)) salida.sueltas = g.sueltasOrder;
  return salida;
}
