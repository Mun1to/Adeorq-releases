// Cómo se reparte la Constelación, aparte de quien la dibuja.
//
// ── POR QUÉ ESTO Y NO UN GRAFO DE FUERZAS (2026-08-10) ──────────────────────
//
// Hasta hoy esto era una colocación por fuerzas: los enlazados se atraen, todos
// se repelen y el conjunto se recoge. Estaba endurecida contra sus dos fallos
// (puntos disparados a la otra punta, y puntos amontonados) y aun así el mapa no
// se leía. Munir lo dijo dos veces.
//
// Al medir su bóveda apareció el porqué, y no era el que yo pensaba: 599
// documentos, 56 proyectos, 606 enlaces y **el 64 % cruza de un proyecto a
// otro**. Agrupar los nodos por proyecto —lo que se hizo primero— ALARGÓ las
// líneas en vez de acortarlas: 554 trazos rectos atravesando el centro. El
// problema nunca fueron los nodos, eran las líneas, y eso una colocación por
// fuerzas no lo puede arreglar: los nodos caen donde caen y los hilos van en
// recta de uno a otro.
//
// Así que se cambió de técnica, con tres prototipos delante y sus datos de
// verdad. Aquí cada proyecto ocupa un ARCO del círculo, proporcional a cuántos
// documentos tiene, y esos documentos se reparten en filas concéntricas dentro
// de su arco. Nadie se mueve: el sitio de cada uno lo decide el reparto. Los
// hilos se dibujan curvados hacia el centro (eso vive en `MemoriaGrafo`), y así
// los viajes parecidos se recogen en haces en vez de cruzarse.
//
// Lo que se perdió: arrastrar un nodo, que con un sitio calculado sería mentir
// sobre dónde vive. Lo que se ganó: que se entienda.
//
// Se mide en `scripts/constelacion-check.ts`, que es lo que permite tocar el
// reparto sin abrir la app para ver si algo se solapa.

/** Un documento en el mapa. */
export interface Punto {
  id: string;
  x: number;
  y: number;
  /** Cuántos hilos salen o llegan. Decide el tamaño al dibujarlo. */
  grado: number;
  color: string;
  title: string;
  /** Su proyecto: la carpeta de primer nivel. Decide su arco y su color. */
  fam?: string;
  /** Su ángulo en la rueda. Lo usa el hilo para saber por dónde rodear el
      hueco del centro: entre dos puntos opuestos, la dirección del punto medio
      no existe (cae en el origen) y la del ángulo medio sí. */
  ang?: number;
}

/** Un hilo, por índice dentro del array de puntos. */
export type Hilo = [number, number];

/** Dónde cae un documento, y con qué inclinación (para pintar alineado). */
export interface Sitio {
  x: number;
  y: number;
  /** Su ángulo dentro del círculo y su distancia al centro. */
  a: number;
  r: number;
}

/** El trozo de círculo de un proyecto. */
export interface Arco {
  fam: string;
  /** El centro del arco y cuánto abre, en radianes. */
  a: number;
  abre: number;
  /** El radio de su última fila, para poner el nombre justo fuera. */
  rMax: number;
  n: number;
}

/** El primer anillo y lo que separa a los siguientes. Absolutos: el zoom se
    encarga de que quepa, y así el reparto no depende del tamaño de la ventana.
    Si dependiera, el mapa se recolocaría entero al cambiar el ancho del panel. */
export const R0 = 430;
export const DR = 44;

/** El respiro entre dos proyectos. Sin él, los arcos se tocan y se lee como un
    anillo continuo en vez de como 56 grupos. */
const HUECO = 0.014;

/**
 * Lo que se le garantiza a cada documento en su fila, en píxeles.
 *
 * Sin esto el arco de un proyecto es proporcional a cuántos documentos tiene,
 * y ahí hay una trampa que solo se ve midiendo: los proyectos GRANDES reparten
 * sus documentos en varias filas, así que en la primera solo ponen un puñado y
 * les sobra sitio; los de dos documentos meten los dos en una fila y quedan
 * pegados. Medido en la bóveda de Munir el 2026-08-11: 63 px entre vecinos en
 * el proyecto de 201 documentos y **7,9 px en el de dos**.
 *
 * Así que primero cada proyecto se lleva lo que necesita para que sus puntos
 * respiren, y lo que sobra se reparte por tamaño. Un proyecto grande cede un
 * poco de arco (de 63 px a 53 entre vecinos, que no se nota) y uno pequeño pasa
 * de 7,9 a 29 (que se nota mucho).
 */
const SEP_MIN = 26;

/**
 * Reparte los documentos en arcos concéntricos, un arco por proyecto.
 *
 * El orden de los proyectos es alfabético a propósito: es estable entre
 * arranques y entre filtros. Con un orden por tamaño, esconder los documentos
 * sueltos reordenaría el círculo entero y no reconocerías nada de un momento
 * a otro.
 */
export function anillar<T>(
  items: T[],
  familiaDe: (x: T) => string,
): { pos: Sitio[]; arcos: Arco[] } {
  const total = items.length;
  const pos: Sitio[] = new Array(total);
  const arcos: Arco[] = [];
  if (total === 0) return { pos, arcos };

  const familias = [...new Set(items.map(familiaDe))].sort();
  const suyos = new Map<string, number[]>(familias.map((f) => [f, []]));
  items.forEach((it, i) => suyos.get(familiaDe(it))!.push(i));

  // Lo que se reparte es el círculo MENOS los huecos, o con muchos proyectos
  // los arcos se solapan y el reparto deja de ser proporcional.
  const util = Math.PI * 2 - HUECO * familias.length;
  let ang = -Math.PI / 2;

  /* Cuántos caben por fila: la raíz reparte para que un proyecto de 150 no
     salga con veinte filas ni uno de 4 con una fila larguísima. */
  const cabenPorFila = (n: number) => Math.max(3, Math.ceil(Math.sqrt(n) * 1.7));

  /* EL REPARTO DEL ÁNGULO, EN DOS TIEMPOS (ver `SEP_MIN`).
     Primero cada proyecto se lleva lo justo para que los puntos de su fila más
     apretada no se toquen, y lo que sobra se reparte por tamaño.

     Y si ni así caben —con 26 proyectos en la vuelta no caben, medido—, lo que
     cede no es la separación: es el CÍRCULO, que se abre hasta que caben. Un
     mapa más grande no molesta a nadie porque la cámara nace enseñándolo
     entero; puntos pegados, sí. */
  const anguloMin = (n: number) => (Math.min(n, cabenPorFila(n)) * SEP_MIN) / R0;
  const sumaMin = familias.reduce((s, f) => s + anguloMin(suyos.get(f)!.length), 0);
  const crece = sumaMin > util ? sumaMin / util : 1;
  const r0 = R0 * crece;
  const sobra = util - sumaMin / crece;
  const abreDe = (n: number) => anguloMin(n) / crece + (sobra > 0 ? (n / total) * sobra : 0);

  for (const fam of familias) {
    const list = suyos.get(fam)!;
    const abre = abreDe(list.length);
    const porFila = cabenPorFila(list.length);
    const filas = Math.max(1, Math.ceil(list.length / porFila));
    list.forEach((idx, k) => {
      const fila = Math.floor(k / porFila);
      const enFila = k % porFila;
      // Los de la última fila se reparten entre los que SON, no entre los que
      // cabrían: si no, una fila a medias sale pegada a un borde del arco.
      const cuantos = fila === filas - 1 ? list.length - fila * porFila : porFila;
      const r = r0 + fila * DR;
      const a = ang + ((enFila + 0.5) / cuantos) * abre;
      pos[idx] = { x: Math.cos(a) * r, y: Math.sin(a) * r, a, r };
    });
    arcos.push({
      fam,
      a: ang + abre / 2,
      abre,
      rMax: r0 + (filas - 1) * DR,
      n: list.length,
    });
    ang += abre + HUECO;
  }
  return { pos, arcos };
}

/** Lo que ocupa el mapa entero, para que la cámara nazca enseñándolo todo. */
export function radioTotal(arcos: Arco[]): number {
  return arcos.reduce((m, a) => Math.max(m, a.rMax), R0) + DR;
}

/** El anillo del NÚCLEO, dentro del agujero que dejan los proyectos. */
export const R_NUCLEO = 150;

/**
 * Las skills, en el centro.
 *
 * El centro del mapa era un agujero, y lo que va en el centro de un mapa es lo
 * que vale para todo lo demás. Las skills son exactamente eso: no pertenecen a
 * ningún proyecto y se usan en todos (Munir, 2026-08-11: «que en el centro
 * estén las skills, que son muy importantes de hecho»).
 *
 * Van en su propio anillo pequeño, holgado dentro del hueco: si se acercaran al
 * primer anillo de documentos se leerían como un proyecto más, y no lo son.
 */
export function nucleo(n: number): Sitio[] {
  if (n === 0) return [];
  // Una sola va al centro exacto; varias, repartidas por su anillo. Arrancando
  // arriba, como la rueda de fuera, para que las dos se lean igual.
  if (n === 1) return [{ x: 0, y: 0, a: 0, r: 0 }];
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(a) * R_NUCLEO, y: Math.sin(a) * R_NUCLEO, a, r: R_NUCLEO };
  });
}

/** Lo que se le deja libre al centro: el anillo de las skills y un respiro
    alrededor. Ningún hilo entra aquí. */
export const R_LIBRE = R_NUCLEO + 46;

/**
 * Por dónde tira un hilo, que es lo que decide si el centro se ve o no.
 *
 * Hasta el 2026-08-11 el punto de control era `(p + q) * 0.04`, y eso hace que
 * la curva pase por el 54 % de la distancia de su punto medio; dos documentos
 * OPUESTOS tienen su punto medio en el origen, así que cruzaban el centro
 * exacto. Con mil hilos, el medio del mapa era un ovillo y se comía el anillo
 * de las skills que vive justo ahí.
 *
 * Ahora la curva pasa por un punto elegido: en la dirección del ángulo MEDIO de
 * los dos —que existe siempre, también entre opuestos, donde la del punto medio
 * no— y nunca a menos de `R_LIBRE` del centro. Los hilos cortos se curvan igual
 * que antes; los largos bordean el hueco, y como todos rozan la misma
 * circunferencia se leen como un anillo de haces.
 *
 * Devuelve el punto de control de una cuadrática, despejado de que una
 * cuadrática pasa por `(M + C) / 2` en su mitad.
 */
export function tiroDelHilo(p: Sitio, q: Sitio): { x: number; y: number } {
  const mx = (p.x + q.x) / 2;
  const my = (p.y + q.y) / 2;
  let da = q.a - p.a;
  if (da > Math.PI) da -= Math.PI * 2;
  else if (da < -Math.PI) da += Math.PI * 2;
  const medio = p.a + da / 2;
  const r = Math.max(R_LIBRE, Math.hypot(mx, my) * 0.54);
  return { x: 2 * Math.cos(medio) * r - mx, y: 2 * Math.sin(medio) * r - my };
}

/**
 * El color de un proyecto AQUÍ, que no es el de la barra lateral.
 *
 * `hueOf` reparte los tonos entre el 186 y el 268 —del cian al violeta— para que
 * el panel entero se lea como un sistema azul, y para una píldora suelta está
 * bien. Aquí hay 56 proyectos a la vez: en ochenta grados les tocan grado y
 * medio a cada uno, o sea el mismo color (Munir, 2026-08-10: «solo hay dos
 * colores»).
 *
 * Así que el mapa usa la rueda entera, y el tono va con la POSICIÓN en el
 * círculo: los vecinos se parecen y los de enfrente contrastan, así que el color
 * también te dice por dónde vas. Es lo que se vio en el prototipo.
 *
 * La luminosidad sube un punto en los tonos a los que el ojo ve apagados (los
 * azules profundos, alrededor de 240) para que ninguno quede más flojo que sus
 * vecinos sobre un fondo oscuro.
 *
 * La saturación bajó del 78 % al 58 % el 2026-08-11 («se nota muy, pero que muy
 * saturado»): mil hilos de un cian al 78 % son mil trazos de neón, y donde se
 * cruzan el color se suma hasta el blanco. Con 58 los diez proyectos se siguen
 * distinguiendo de un vistazo, que es lo único que este color tiene que hacer.
 */
export function colorDeArco(i: number, n: number): string {
  const t = n <= 1 ? 0 : i / n;
  const tono = t * 360;
  const azulon = Math.cos(((tono - 245) * Math.PI) / 180);
  const luz = 64 + Math.max(0, azulon) * 9;
  return `hsl(${tono.toFixed(1)} 58% ${luz.toFixed(0)}%)`;
}
