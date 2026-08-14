// El mapa de cómo funciona un proyecto: sus piezas y quién llama a quién.
//
// ── QUÉ ES ESTO Y POR QUÉ NO ES EL ESQUEMA DE ANTES ─────────────────────────
//
// La primera versión del Esquema dibujaba el ÁRBOL DE CARPETAS del proyecto, y
// no valía: una carpeta no dice quién llama a quién. Munir pidió (2026-08-14)
// «un mapa de tu estructura e infraestructura» enseñando un diagrama de flujo,
// y un diagrama de flujo cuenta el CAMINO de una acción, no el contenido de un
// disco. Eso solo se saca leyendo el código, así que lo escribe el Capataz y
// aquí solo se valida y se coloca.
//
// ── POR QUÉ TODO ESTO ES CÓDIGO PURO ────────────────────────────────────────
//
// Lo que entra es JSON escrito por un modelo, o sea que puede traer una flecha
// hacia una pieza que no existe, dos piezas con el mismo id, una capa
// inventada o cuarenta cajas. Nada de eso puede llegar al dibujo: una flecha
// suelta se pinta como una raya que no lleva a ningún sitio. Se valida entero
// aquí, sin tocar el DOM ni el disco, para poder probarlo con
// `scripts/mapa-check.ts` sin arrancar la app.

/** Los cinco mundos en los que puede vivir una pieza, en el orden en que se
 *  recorren: lo que tocas, lo que se dibuja, lo que corre por dentro, lo que no
 *  es tuyo, y el cajón de lo que el modelo no supo colocar. */
export const CAPAS = ["gente", "interfaz", "nucleo", "fuera", "otros"] as const;
export type Capa = (typeof CAPAS)[number];

export const NOMBRE_CAPA: Record<Capa, { titulo: string; sub: string }> = {
  gente: { titulo: "Lo que tocas", sub: "ventanas y pantallas" },
  interfaz: { titulo: "La interfaz", sub: "lo que se dibuja" },
  nucleo: { titulo: "El núcleo", sub: "lo que corre por dentro, con permisos de verdad" },
  fuera: { titulo: "Fuera de casa", sub: "otros programas, el disco y la red" },
  otros: { titulo: "Lo demás", sub: "piezas sin sitio claro" },
};

export interface Pieza {
  /** Corto y sin espacios. Es la identidad: las flechas y los caminos apuntan
   *  aquí, así que un id repetido rompe el dibujo entero. */
  id: string;
  nombre: string;
  capa: Capa;
  /** Una frase de para qué está. Es lo que se lee dentro de la caja. */
  que: string;
  /** El archivo o la carpeta donde vive de verdad. Puede venir vacío. */
  donde: string;
}

export interface Flecha {
  de: string;
  a: string;
  /** Dos a cinco palabras de qué se le pide. Es la etiqueta de la flecha. */
  que: string;
}

export interface Paso {
  pieza: string;
  /** Qué le pide el paso anterior a este. El primer paso no lleva. */
  como?: string;
}

/** Un recorrido del mapa mental: qué pasa, paso a paso, cuando haces algo.
 *
 *  Contesta una pregunta DISTINTA de la del mapa. El mapa dice de qué está
 *  hecho el programa; un camino dice qué ocurre cuando aprietas una tecla, de
 *  principio a fin y sin ver nada más. Munir quiso las dos vistas y por eso
 *  vienen las dos en la misma lectura. */
export interface Camino {
  titulo: string;
  porque: string;
  pasos: Paso[];
}

export interface Mapa {
  resumen: string;
  piezas: Pieza[];
  flechas: Flecha[];
  caminos: Camino[];
}

/* ── Los topes ──────────────────────────────────────────────────────────────
 *
 * No son manías: son lo que separa un mapa de una maraña. Están medidos contra
 * el ancho real de la pantalla del Esquema, y el motivo de cada uno está en
 * `dibujar_todo_no_es_un_mapa`: lo que se dibuja se rotula, y lo que no cabe
 * rotulado no se dibuja. */

/** Catorce cajas caben en tres columnas sin apilarse hasta el infinito. */
export const TOPE_PIEZAS = 14;
/** Veinte hilos ya es mucho; por encima el mapa se lee peor con MÁS datos. */
export const TOPE_FLECHAS = 20;
/** Seis caminos son seis historias: más de eso ya no se leen, se hojean. */
export const TOPE_CAMINOS = 6;
/** Un camino más largo que esto no es un camino, son dos. */
export const TOPE_PASOS = 6;

/** Quita el vallado de markdown que a veces se cuela alrededor del JSON. */
function desnudar(crudo: string): string {
  return crudo
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function texto(v: unknown, tope = 240): string {
  return typeof v === "string" ? v.trim().slice(0, tope) : "";
}

function esCapa(v: unknown): v is Capa {
  return typeof v === "string" && (CAPAS as readonly string[]).includes(v);
}

/**
 * El JSON del Capataz, convertido en un mapa del que uno se puede fiar.
 *
 * Devuelve `null` si no hay nada aprovechable (ni una pieza con nombre). Todo
 * lo demás se limpia en silencio: una flecha rota no es motivo para tirar un
 * mapa entero de once piezas, pero sí para no pintarla.
 */
export function leerMapa(crudo: string): Mapa | null {
  let j: {
    resumen?: unknown;
    piezas?: Array<Record<string, unknown>>;
    flechas?: Array<Record<string, unknown>>;
    caminos?: Array<Record<string, unknown>>;
    /** El mismo campo con el otro nombre. El prompt dice «caminos», pero al
     *  modelo se le pide un «recorrido» dos líneas antes y a veces lo escribe
     *  así: aceptar los dos cuesta una línea y evita perder la mitad buena de
     *  una lectura de tres minutos. */
    recorridos?: Array<Record<string, unknown>>;
  };
  try {
    j = JSON.parse(desnudar(crudo));
  } catch {
    return null;
  }
  if (!j || typeof j !== "object") return null;

  const piezas: Pieza[] = [];
  const vistos = new Set<string>();
  for (const p of Array.isArray(j.piezas) ? j.piezas : []) {
    if (piezas.length >= TOPE_PIEZAS) break;
    const id = texto(p?.id, 60);
    const nombre = texto(p?.nombre, 60);
    // Sin id no se le puede apuntar, y sin nombre la caja sale en blanco. Las
    // dos cosas son la pieza; lo demás se puede quedar vacío sin romper nada.
    if (!id || !nombre || vistos.has(id)) continue;
    vistos.add(id);
    piezas.push({
      id,
      nombre,
      // Una capa que el modelo se inventó no se corrige adivinando: se manda al
      // cajón de «lo demás», que es exactamente lo que pasó.
      capa: esCapa(p?.capa) ? p.capa : "otros",
      que: texto(p?.que),
      donde: texto(p?.donde, 120),
    });
  }
  if (!piezas.length) return null;

  const flechas: Flecha[] = [];
  const yaEsta = new Set<string>();
  for (const f of Array.isArray(j.flechas) ? j.flechas : []) {
    if (flechas.length >= TOPE_FLECHAS) break;
    const de = texto(f?.de, 60);
    const a = texto(f?.a, 60);
    // Una flecha a una pieza que no existe se pintaría como una raya que sale
    // de una caja y muere en el aire. Y una pieza que se llama a sí misma es
    // un bucle que no cuenta nada de cómo funciona el programa.
    if (!vistos.has(de) || !vistos.has(a) || de === a) continue;
    const clave = `${de}→${a}`;
    if (yaEsta.has(clave)) continue;
    yaEsta.add(clave);
    flechas.push({ de, a, que: texto(f?.que, 40) });
  }

  /* Los caminos, contra las piezas que de verdad existen. Un camino con un solo
     paso no es un camino, y un paso que apunta a una pieza inventada dejaría un
     hueco en mitad de la fila: los dos se tiran. */
  const caminos: Camino[] = [];
  for (const r of j.caminos ?? j.recorridos ?? []) {
    if (caminos.length >= TOPE_CAMINOS) break;
    const pasos: Paso[] = [];
    for (const s of Array.isArray(r?.pasos) ? (r.pasos as Array<Record<string, unknown>>) : []) {
      if (pasos.length >= TOPE_PASOS) break;
      const pieza = texto(s?.pieza, 60);
      if (!vistos.has(pieza)) continue;
      // Dos pasos seguidos a la misma pieza serían una flecha de una caja a sí
      // misma, que en una fila se ve como un error de pintado.
      if (pasos.length && pasos[pasos.length - 1].pieza === pieza) continue;
      pasos.push(pasos.length ? { pieza, como: texto(s?.como, 40) } : { pieza });
    }
    const titulo = texto(r?.titulo, 60);
    if (pasos.length < 2 || !titulo) continue;
    caminos.push({ titulo, porque: texto(r?.porque, 240), pasos });
  }

  return { resumen: texto(j.resumen, 600), piezas, flechas, caminos };
}

export interface Columna {
  capa: Capa;
  piezas: Pieza[];
}

/**
 * Las piezas repartidas en columnas por capa, y ORDENADAS dentro de cada una
 * para que las flechas se crucen lo menos posible.
 *
 * Sin este orden, la primera versión del mapa era la que Munir llamó confusa
 * (2026-08-14): las cajas salían en el orden en que las escribió el modelo, así
 * que una pieza de arriba hablaba con una de abajo del todo y su hilo cruzaba
 * la columna entera por delante de las demás.
 *
 * El método es el de toda la vida para esto: cada pieza se coloca a la altura
 * MEDIA de aquellas con las que habla en la columna de al lado (baricentro), y
 * se repite hacia delante y hacia atrás. No garantiza el mínimo de cruces (eso
 * es un problema caro), pero baja la mayoría con dos pasadas.
 */
export function colocar(mapa: Mapa): Columna[] {
  const columnas: Columna[] = CAPAS.map((capa) => ({
    capa,
    piezas: mapa.piezas.filter((p) => p.capa === capa),
  })).filter((c) => c.piezas.length > 0);

  if (columnas.length < 2) return columnas;

  /** Dónde está cada pieza ahora mismo dentro de su columna. */
  const altura = new Map<string, number>();
  const anotar = () => {
    for (const col of columnas) col.piezas.forEach((p, i) => altura.set(p.id, i));
  };
  anotar();

  /** La media de las alturas de las piezas con las que habla, mirando solo la
   *  columna `contra`. `null` = no habla con ninguna de ahí, y entonces no se
   *  mueve: sin dato, moverla sería inventarse un orden. */
  const centro = (p: Pieza, contra: Columna): number | null => {
    const ahi = new Set(contra.piezas.map((x) => x.id));
    const alturas: number[] = [];
    for (const f of mapa.flechas) {
      if (f.de === p.id && ahi.has(f.a)) alturas.push(altura.get(f.a) ?? 0);
      if (f.a === p.id && ahi.has(f.de)) alturas.push(altura.get(f.de) ?? 0);
    }
    if (!alturas.length) return null;
    return alturas.reduce((a, b) => a + b, 0) / alturas.length;
  };

  const pasada = (haciaDelante: boolean) => {
    const orden = haciaDelante
      ? columnas.map((_, i) => i).slice(1)
      : columnas.map((_, i) => i).slice(0, -1).reverse();
    for (const i of orden) {
      const contra = columnas[haciaDelante ? i - 1 : i + 1];
      const conPeso = columnas[i].piezas.map((p, i0) => ({
        p,
        i0,
        c: centro(p, contra),
      }));
      conPeso.sort((a, b) => {
        // Las que no hablan con la columna de al lado se quedan donde estaban,
        // por debajo de las colocadas: subirlas empujaría a las que sí tienen
        // motivo para estar en su sitio.
        if (a.c === null && b.c === null) return a.i0 - b.i0;
        if (a.c === null) return 1;
        if (b.c === null) return -1;
        return a.c - b.c || a.i0 - b.i0;
      });
      columnas[i].piezas = conPeso.map((x) => x.p);
      anotar();
    }
  };

  pasada(true);
  pasada(false);
  pasada(true);
  return columnas;
}

/* ── Dónde nace cada caja ───────────────────────────────────────────────────
 *
 * El mapa se maneja como el Cerebro: arrastras cada caja donde quieras, la
 * rueda acerca y el lienzo se mueve. Pero tiene que NACER ordenado, porque un
 * montón de cajas amontonadas en el centro no es un punto de partida, es un
 * trabajo que le acabas de dar al que abre la pestaña.
 *
 * Nacen en las columnas que decide `colocar`, y a partir de ahí mandan las
 * posiciones que él guarde. */

/** El ancho de una caja. Fijo, porque es lo que hace que una columna se lea
 *  como una columna; el alto lo pone su texto. */
export const ANCHO_CAJA = 230;
/** De columna a columna. El hueco es donde viven las etiquetas de las flechas,
 *  así que estrecharlo las parte en dos líneas. */
export const HUECO_X = 340;
export const HUECO_Y = 26;

export interface Sitio {
  x: number;
  y: number;
}

/**
 * La posición inicial de cada pieza, en columnas por capa.
 *
 * `altos` son los altos medidos de verdad cuando ya se pintaron; mientras no se
 * sepan, se usa uno de partida. Recolocar con el alto real después es lo que
 * evita que dos cajas de tres líneas se pisen.
 */
export function posiciones(
  columnas: Columna[],
  altos: Record<string, number> = {},
  alto = 104,
): Record<string, Sitio> {
  const out: Record<string, Sitio> = {};
  columnas.forEach((col, ci) => {
    let y = 0;
    for (const p of col.piezas) {
      out[p.id] = { x: ci * HUECO_X, y };
      y += (altos[p.id] || alto) + HUECO_Y;
    }
  });
  return out;
}

/* ── El otro dibujo: anillos, estilo constelación ───────────────────────────
 *
 * Munir lo pidió «estilo Obsidian, pero FIJO y bien ordenado» (2026-08-14). Las
 * dos palabras son el encargo entero: el grafo de Obsidian se ve bien y se lee
 * mal, porque lo coloca una simulación de fuerzas que nunca da dos veces el
 * mismo dibujo y deja los nodos donde caigan. Aquí la colocación se CALCULA:
 * anillos concéntricos, uno por capa, y dentro de cada anillo el ángulo se
 * reparte a partes iguales. El mismo mapa da siempre el mismo dibujo, y eso es
 * lo que permite acordarse de dónde estaba una pieza. */

/** Cuántas flechas toca una pieza. Es lo que decide su tamaño y qué capa va al
 *  centro: lo más llamado es lo más central, y eso no es una opinión. */
export function grado(mapa: Mapa, id: string): number {
  return mapa.flechas.filter((f) => f.de === id || f.a === id).length;
}

/** El radio del primer anillo cuando su capa lleva más de una pieza. */
export const RADIO_BASE = 190;
/** Cuánto se separa cada anillo del siguiente. */
export const RADIO_PASO = 230;

/**
 * Cada pieza en su anillo, alrededor del centro.
 *
 * El anillo de dentro es la capa cuyas piezas tienen MÁS conexiones: en un
 * programa eso es el motor, y ponerlo en el centro es lo que hace que los hilos
 * salgan hacia fuera en vez de cruzar el dibujo. Con una sola pieza, esa se
 * queda en el punto central y no hace anillo.
 *
 * Dentro de cada anillo el orden se afina una vez por baricentro angular: cada
 * pieza tira hacia el ángulo medio de aquellas con las que habla y que ya están
 * colocadas. Una pasada basta y es determinista; iterar más no cambia casi nada
 * y deja de ser predecible.
 */
export function posicionesRadiales(mapa: Mapa): Record<string, Sitio> {
  const porCapa = CAPAS.map((capa) => ({
    capa,
    piezas: mapa.piezas.filter((p) => p.capa === capa),
  })).filter((c) => c.piezas.length > 0);
  if (!porCapa.length) return {};

  // La capa más conectada, dentro. Con empate manda el orden de CAPAS, que ya
  // está escrito: así el dibujo no cambia entre dos lecturas iguales.
  const peso = (ps: Pieza[]) => ps.reduce((n, p) => n + grado(mapa, p.id), 0) / ps.length;
  const anillos = [...porCapa].sort((a, b) => peso(b.piezas) - peso(a.piezas));

  const out: Record<string, Sitio> = {};
  anillos.forEach((anillo, k) => {
    const n = anillo.piezas.length;
    // Una sola pieza en el anillo de dentro va al centro exacto.
    if (k === 0 && n === 1) {
      out[anillo.piezas[0].id] = { x: 0, y: 0 };
      return;
    }
    const radio = RADIO_BASE + k * RADIO_PASO;
    // El orden dentro del anillo: quien ya tiene vecinos colocados se pone
    // mirándolos; el resto rellena los huecos que quedan, en su orden.
    const conAngulo = anillo.piezas.map((p, i) => {
      const angulos: number[] = [];
      for (const f of mapa.flechas) {
        const otro = f.de === p.id ? f.a : f.a === p.id ? f.de : null;
        const s = otro ? out[otro] : undefined;
        if (s) angulos.push(Math.atan2(s.y, s.x));
      }
      // Media de ángulos POR VECTORES, no aritmética: la media de 350° y 10° es
      // 0°, y sumándolos y dividiendo saldría 180°, o sea el lado contrario.
      const c = angulos.reduce((a, t) => a + Math.cos(t), 0);
      const sn = angulos.reduce((a, t) => a + Math.sin(t), 0);
      return { p, i, tiene: angulos.length > 0, ang: Math.atan2(sn, c) };
    });
    conAngulo.sort((a, b) => {
      if (a.tiene !== b.tiene) return a.tiene ? -1 : 1;
      if (a.tiene && b.tiene) return a.ang - b.ang || a.i - b.i;
      return a.i - b.i;
    });
    conAngulo.forEach((x, i) => {
      // Empezando arriba y en el sentido de las agujas, que es como se lee.
      const t = (2 * Math.PI * i) / n - Math.PI / 2;
      out[x.p.id] = {
        x: Math.round(Math.cos(t) * radio),
        y: Math.round(Math.sin(t) * radio),
      };
    });
  });
  return out;
}

/**
 * Cuántas flechas se cruzan con la colocación dada.
 *
 * No se usa para pintar: existe para que `mapa-check.ts` pueda AFIRMAR que
 * ordenar mejora el dibujo, en vez de creérselo mirando una captura. Dos
 * flechas entre columnas vecinas se cruzan cuando una sale por encima de la
 * otra y llega por debajo.
 */
export function cruces(columnas: Columna[], flechas: Flecha[]): number {
  const col = new Map<string, number>();
  const alto = new Map<string, number>();
  columnas.forEach((c, ci) =>
    c.piezas.forEach((p, pi) => {
      col.set(p.id, ci);
      alto.set(p.id, pi);
    }),
  );
  // Solo las que van de una columna a la siguiente: las que se saltan columnas
  // pasan por encima de todo y contarlas taparía la señal que se busca.
  const rectas = flechas.filter((f) => (col.get(f.a) ?? -9) - (col.get(f.de) ?? 9) === 1);
  let n = 0;
  for (let i = 0; i < rectas.length; i++) {
    for (let j = i + 1; j < rectas.length; j++) {
      const a = rectas[i];
      const b = rectas[j];
      if (col.get(a.de) !== col.get(b.de)) continue;
      const a1 = alto.get(a.de) ?? 0;
      const a2 = alto.get(a.a) ?? 0;
      const b1 = alto.get(b.de) ?? 0;
      const b2 = alto.get(b.a) ?? 0;
      if ((a1 - b1) * (a2 - b2) < 0) n++;
    }
  }
  return n;
}

/**
 * El esqueleto de carpetas que se le manda al Capataz para que sepa DÓNDE
 * mirar sin gastar media conversación en `Glob`.
 *
 * Aquí es donde el escáner del disco encuentra su sitio de verdad: no es el
 * mapa, es la chuleta con la que se lee el proyecto.
 */
export function esqueletoParaElCapataz(
  nodos: Array<{ id: string; carpeta: boolean; peso: number; dentro: number }>,
  tope = 60,
): string {
  const carpetas = nodos
    .filter((n) => n.carpeta && n.id)
    .sort((a, b) => b.dentro - a.dentro)
    .slice(0, tope)
    .map((n) => `${n.id}/ (${n.dentro})`);
  const gordos = nodos
    .filter((n) => !n.carpeta)
    .sort((a, b) => b.peso - a.peso)
    .slice(0, 24)
    .map((n) => n.id);
  return [
    "## Carpetas (entre paréntesis, cuántas cosas tienen dentro)",
    ...carpetas,
    "",
    "## Los archivos más grandes",
    ...gordos,
  ].join("\n");
}
