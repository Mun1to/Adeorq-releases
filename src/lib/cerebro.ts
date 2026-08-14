// La geometría del Cerebro, aparte de quien la dibuja.
//
// Vive aquí y no dentro del componente por lo de siempre en esta casa: lo que
// se puede enumerar se puede probar de verdad (`scripts/cerebro-check.ts`) en
// vez de mirarlo en pantalla y opinar. Y aquí es donde se lee, en unas pocas
// funciones, por qué la bola se reparte como se reparte.
//
// ── DE DÓNDE VIENE (2026-08-12) ─────────────────────────────────────────────
//
// Esto sustituye al reparto plano en arcos de `lib/constelacion.ts`, que era un
// disco: cada proyecto un trozo de tarta y los hilos curvados por dentro. Munir
// lo pidió en 3D y con un color por proyecto, y de ahí salió el resto.
//
// La decisión que sostiene todo lo demás: EL REPARTO SE HACE SOBRE UNA ESFERA,
// en direcciones, y la forma solo decide a qué distancia del centro cae cada
// dirección. Estuvo siendo un cerebro anatómico un rato —fisura, pliegues,
// cerebelo, tronco— y se descartó por gusto; volver a la bola fue cambiar UNA
// función, porque el reparto nunca supo qué forma tenía debajo.

/* ═══════════════════════════════════════════════════════ LO QUE SE PUEDE TOCAR
 *
 * Munir vio los mandos del prototipo en el navegador y los quiere en la app:
 * «que sea customizable el glow, el tamaño, etc.». Son seis números y dos
 * interruptores, y cada uno es una decisión de gusto que yo no debería estar
 * tomando por él.
 *
 * Van de 0 a 1 (o su rango) y NO en píxeles: así el dibujo puede reinterpretar
 * lo que significa «resplandor 0,6» si algún día cambia cómo se pinta, sin que
 * el ajuste guardado de nadie quede apuntando a un número que ya no existe.
 */
export interface AjustesCerebro {
  /** El desenfoque del resplandor, en píxeles de pantalla. 0 lo apaga. */
  brillo: number;
  /** Cuánto sobresalen los nodos del cascarón. 1 es lo de fábrica. */
  alto: number;
  /** Cuánto se ven los enlaces de la bóveda. */
  enlaces: number;
  /** Cuánto se ve la malla que cose los nodos entre sí. */
  tejido: number;
  /** Cuánto se ve la rejilla de meridianos y paralelos. */
  rejilla: number;
  /** Cuánto se aparta lo que tienes delante al entrar en la bola. */
  corte: number;
  /** Si gira sola cuando no la estás tocando. */
  gira: boolean;
  /** Si se escriben los nombres encima. */
  nombres: boolean;
}

export const AJUSTES_FABRICA: AjustesCerebro = {
  brillo: 6,
  alto: 1,
  enlaces: 0.55,
  tejido: 1,
  rejilla: 1,
  corte: 1,
  gira: true,
  nombres: true,
};

/** Los topes de cada mando, en un solo sitio: los usan el que guarda (para no
    aceptar basura) y el que pinta los deslizadores (para su rango). */
export const TOPES: Record<keyof Omit<AjustesCerebro, "gira" | "nombres">, [number, number]> = {
  brillo: [0, 24],
  alto: [0, 2.2],
  enlaces: [0, 2.4],
  tejido: [0, 2.4],
  rejilla: [0, 2.6],
  corte: [0.2, 2.6],
};

const CLAVE = "adeorq-cerebro";

/**
 * Los ajustes guardados, aceptando cualquier cosa que haya en disco.
 *
 * Defensivo a propósito y no por costumbre: esto viene de `localStorage`, que
 * puede tener lo que escribió una versión anterior, algo a medio escribir, o un
 * `null` de un `JSON.stringify(undefined)`. Un solo número que llegue como texto
 * («0.6» en vez de 0,6) haría que una multiplicación diera `NaN`, y un `NaN` en
 * un alfa de canvas no avisa: deja de dibujarse esa capa y la pantalla sale a
 * medias sin un solo error en la consola.
 */
export function ajustesGuardados(crudo: unknown): AjustesCerebro {
  const out: AjustesCerebro = { ...AJUSTES_FABRICA };
  if (!crudo || typeof crudo !== "object") return out;
  const o = crudo as Record<string, unknown>;
  for (const k of Object.keys(TOPES) as Array<keyof typeof TOPES>) {
    const v = o[k];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const [min, max] = TOPES[k];
    out[k] = Math.max(min, Math.min(max, v));
  }
  if (typeof o.gira === "boolean") out.gira = o.gira;
  if (typeof o.nombres === "boolean") out.nombres = o.nombres;
  return out;
}

/** Lee los ajustes del disco. Nunca lanza: si no se puede leer, los de fábrica. */
export function leerAjustes(): AjustesCerebro {
  try {
    const raw = localStorage.getItem(CLAVE);
    return raw ? ajustesGuardados(JSON.parse(raw)) : { ...AJUSTES_FABRICA };
  } catch {
    return { ...AJUSTES_FABRICA };
  }
}

export function guardarAjustes(a: AjustesCerebro): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(a));
  } catch {
    // El disco lleno o el almacenamiento bloqueado no puede tumbar la vista.
  }
}

/** Un documento en la bola. */
export interface Punto {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Cuántos hilos salen o llegan. Decide su tamaño y su altura. */
  grado: number;
  color: string;
  title: string;
  /** Su proyecto: la carpeta de primer nivel. Decide su región y su color. */
  fam?: string;
  /** El índice de su proyecto. Con él, agrupar al dibujar es comparar números
      en vez de fabricar cadenas mil veces por fotograma. */
  ci: number;
  /** La normal de la superficie aquí, que es de donde sale el contorno. */
  n: { x: number; y: number; z: number };
  /** Lo que sobresale del cascarón, en proporción al radio. */
  alto: number;
}

/** Un hilo, por índice dentro del array de puntos. */
export type Hilo = [number, number];

/** La región de un proyecto: su centro en la superficie y cuánto abarca. */
export interface Region {
  fam: string;
  x: number;
  y: number;
  z: number;
  n: number;
  /** Su radio en la esfera unidad, para pintar su resplandor del tamaño justo. */
  radio: number;
  color: string;
}

export const R = 1;
/** El anillo del núcleo, dentro del cascarón. Las skills viven ahí. */
export const R_NUCLEO = 0.3;
/** Lo que se le deja libre al centro: ningún hilo entra aquí, o el anillo de
    skills se vería a través de una madeja. */
export const R_LIBRE = R_NUCLEO + 0.14;
const AUREO = Math.PI * (3 - Math.sqrt(5));

/**
 * El i-ésimo de n puntos repartidos por una esfera, con la espiral de
 * Fibonacci.
 *
 * Es el reparto más parejo que hay sobre una esfera y no necesita relajar nada:
 * no quedan ni claros ni grumos. Que es justo lo que se le pide a un terreno
 * donde luego se van a plantar regiones.
 */
export function fib(i: number, n: number): { x: number; y: number; z: number } {
  const y = 1 - ((i + 0.5) / n) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * AUREO;
  return { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
}

/**
 * El color de un proyecto AQUÍ, que no es el de la barra lateral.
 *
 * `hueOf` reparte los tonos entre el 186 y el 268 —del cian al violeta— para
 * que el panel entero se lea como un sistema azul, y para una píldora suelta
 * está bien. Aquí hay diez proyectos a la vez y en ochenta grados salen todos
 * del mismo color.
 *
 * Y no solo cambia el tono: la saturación y la luz VARÍAN entre vecinos. Con el
 * tono repartido a secas, dos proyectos consecutivos se llevan 36 grados, y en
 * la zona de los verdes o de los azules eso es prácticamente el mismo color.
 * Con tres escalones de saturación y cuatro de luz, dos vecinos nunca coinciden
 * en las tres cosas a la vez; y como 3 y 4 no comparten divisor, el patrón
 * tarda doce proyectos en repetirse.
 */
export function colorDeProyecto(i: number, n: number): string {
  const tono = (n <= 1 ? 0 : i / n) * 360;
  // Los azules profundos (alrededor de 245) el ojo los ve más apagados: se les
  // sube un punto para que ninguno quede más flojo que sus vecinos.
  const azulon = Math.max(0, Math.cos(((tono - 245) * Math.PI) / 180));
  const sat = Math.min(96, 58 + (i % 3) * 15 + azulon * 6);
  const luz = Math.min(78, 52 + (i % 4) * 6 + azulon * 10);
  return `hsl(${tono.toFixed(1)} ${sat.toFixed(0)}% ${luz.toFixed(0)}%)`;
}

/** La normal de un punto de la superficie: su propia dirección desde el centro.
    En una esfera es exacta, y de ella sale el contorno encendido del filo. */
export function normalDe(p: { x: number; y: number; z: number }) {
  const l = Math.hypot(p.x, p.y, p.z) || 1;
  return { x: p.x / l, y: p.y / l, z: p.z / l };
}

/** Lo que sobresale un documento del cascarón: cuanto más enlaza, más alto. */
export function altoDe(grado: number): number {
  return 0.022 + Math.min(0.125, Math.sqrt(grado) * 0.0165);
}

/**
 * Reparte los documentos por la bola, UNA REGIÓN POR PROYECTO.
 *
 * El terreno se hace primero: `total` solares reparejos por toda la esfera. Los
 * proyectos ponen su centro con la misma espiral (así quedan lejos unos de
 * otros) y luego se van quedando solares POR RONDAS, cada uno el más cercano al
 * suyo que siga libre. Es una mancha de tinta por proyecto creciendo a la vez
 * que las demás hasta que chocan: salen regiones compactas y pegadas, sin
 * solaparse y sin dejar hueco. Un mapa político, no franjas.
 *
 * Los proyectos pequeños se llenan pronto y quedan como islas nítidas; el
 * grande sigue creciendo y se queda el continente. Eso es lo honesto: en la
 * bóveda de Munir `04-archivo` es 201 de 335 documentos, y tiene que verse.
 *
 * Y DENTRO de cada región no es al azar: los solares se ordenan por distancia al
 * centro y los documentos por cuánto enlazan, así que lo más conectado cae en el
 * medio y lo suelto en las afueras.
 *
 * El orden de los proyectos es alfabético a propósito: es estable entre
 * arranques y entre filtros. Con un orden por tamaño, esconder los documentos
 * sueltos recolocaría la bola entera y no reconocerías nada de un momento a
 * otro.
 */
export function repartir<T>(
  items: T[],
  familiaDe: (x: T) => string,
  gradoDe: (x: T) => number,
): { pos: Array<{ x: number; y: number; z: number }>; regiones: Region[] } {
  const total = items.length;
  const pos: Array<{ x: number; y: number; z: number }> = new Array(total);
  const regiones: Region[] = [];
  if (total === 0) return { pos, regiones };

  const familias = [...new Set(items.map(familiaDe))].sort();
  const N = familias.length;
  const solares = Array.from({ length: total }, (_, i) => fib(i, total));
  const suyos = new Map<string, number[]>(familias.map((f) => [f, []]));
  items.forEach((it, i) => suyos.get(familiaDe(it))!.push(i));

  // Los centros, con la misma espiral para que ninguno nazca pegado a otro.
  // Girada un poco, o el primero cae siempre encima del primer solar y la
  // región más grande sale clavada al polo.
  const cs = Math.cos(0.7), sn = Math.sin(0.7);
  const centros = familias.map((_, i) => {
    const p = fib(i, N);
    return { x: p.x * cs - p.z * sn, y: p.y, z: p.x * sn + p.z * cs };
  });

  const libre = new Array(total).fill(true);
  const cogidos: number[][] = familias.map(() => []);
  const faltan = familias.map((f) => suyos.get(f)!.length);
  let quedan = total;
  // Por rondas: todas las regiones crecen a la vez. Si fueran de una en una, la
  // primera se llevaría una mancha bonita y la última los restos.
  while (quedan > 0) {
    let algo = false;
    for (let fi = 0; fi < N; fi++) {
      if (cogidos[fi].length >= faltan[fi]) continue;
      algo = true;
      const c = centros[fi];
      let mejor = -1;
      let dist = Infinity;
      for (let s = 0; s < total; s++) {
        if (!libre[s]) continue;
        const p = solares[s];
        // Al cuadrado: para comparar sobra la raíz.
        const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2 + (p.z - c.z) ** 2;
        if (d < dist) {
          dist = d;
          mejor = s;
        }
      }
      if (mejor < 0) break;
      libre[mejor] = false;
      cogidos[fi].push(mejor);
      quedan--;
    }
    if (!algo) break;
  }

  familias.forEach((f, fi) => {
    const c = centros[fi];
    const solar = cogidos[fi];
    const d2 = (s: number) =>
      (solares[s].x - c.x) ** 2 + (solares[s].y - c.y) ** 2 + (solares[s].z - c.z) ** 2;
    solar.sort((a, b) => d2(a) - d2(b));
    const gente = [...suyos.get(f)!].sort((a, b) => gradoDe(items[b]) - gradoDe(items[a]));
    let radio = 0;
    gente.forEach((idx, k) => {
      const p = solares[solar[k]];
      pos[idx] = { x: p.x * R, y: p.y * R, z: p.z * R };
      radio = Math.max(radio, Math.sqrt(d2(solar[k])));
    });
    regiones.push({
      fam: f,
      x: c.x * R,
      y: c.y * R,
      z: c.z * R,
      n: gente.length,
      radio,
      color: colorDeProyecto(fi, N),
    });
  });
  return { pos, regiones };
}

/**
 * El otro reparto: una GALAXIA, con un cúmulo por proyecto flotando en el
 * espacio.
 *
 * La esfera de arriba pone todas las notas sobre un cascarón, y eso es lo que
 * la hace legible: no hay nada delante de nada. La galaxia renuncia a eso a
 * cambio de otra cosa: los proyectos se ven como islas separadas y a distinta
 * distancia, que es lo que Munir pidió con «una galaxia con sus planetas en 3D,
 * estilo Obsidian» (2026-08-14).
 *
 * Cada cúmulo tiene su centro repartido con la misma espiral (así ninguno nace
 * pegado a otro) y dentro las notas se colocan por grado: las más enlazadas
 * cerca del núcleo del cúmulo y las sueltas por fuera. Todo CALCULADO y sin
 * simulación: dos visitas dan el mismo cielo.
 */
export function repartirGalaxia<T>(
  items: T[],
  familiaDe: (x: T) => string,
  gradoDe: (x: T) => number,
): { pos: Array<{ x: number; y: number; z: number }>; regiones: Region[] } {
  const total = items.length;
  const pos: Array<{ x: number; y: number; z: number }> = new Array(total);
  const regiones: Region[] = [];
  if (total === 0) return { pos, regiones };

  const familias = [...new Set(items.map(familiaDe))].sort();
  const N = familias.length;
  const suyos = new Map<string, number[]>(familias.map((f) => [f, []]));
  items.forEach((it, i) => suyos.get(familiaDe(it))!.push(i));

  /* CUÁNTO CABE ENTRE DOS CÚMULOS VECINOS.
     Es el número que decide si esto se ve como una galaxia o como una bola.
     Con N centros repartidos por una esfera, dos vecinos quedan a más o menos
     2/√N de distancia; el cúmulo se queda en poco más de un tercio de eso y así
     JAMÁS se tocan, tenga el proyecto tres notas o doscientas.
     Sin este tope, veinte proyectos con muchas notas daban cúmulos que se
     solapaban entre sí y el cielo entero se veía como una sola mancha (Munir,
     2026-08-14, con su bóveda de verdad). */
  const hueco = 2 / Math.sqrt(Math.max(1, N));

  familias.forEach((f, fi) => {
    const gente = [...suyos.get(f)!].sort((a, b) => gradoDe(items[b]) - gradoDe(items[a]));
    // El centro del cúmulo, repartido con la espiral y a una distancia que
    // varía un poco: todo a la misma da una cáscara, no una galaxia. La
    // variación sale del índice, así que es la misma cada vez.
    const c = fib(fi, Math.max(1, N));
    const lejos = 0.92 + 0.16 * (((fi * 3) % 5) / 4);
    const cx = c.x * lejos, cy = c.y * lejos, cz = c.z * lejos;
    // El cúmulo crece con lo que tiene dentro, pero nunca invade al vecino.
    const radio = Math.min(hueco * 0.36, 0.045 + 0.03 * Math.sqrt(gente.length));
    gente.forEach((idx, k) => {
      if (gente.length === 1) {
        pos[idx] = { x: cx, y: cy, z: cz };
        return;
      }
      // Espiral otra vez, pero hacia DENTRO: la distancia al centro del cúmulo
      // crece con el puesto, así que lo más enlazado queda en su corazón.
      const d = fib(k, gente.length);
      const r = radio * Math.cbrt((k + 0.6) / gente.length);
      pos[idx] = { x: cx + d.x * r, y: cy + d.y * r, z: cz + d.z * r };
    });
    regiones.push({
      fam: f,
      x: cx,
      y: cy,
      z: cz,
      n: gente.length,
      radio,
      color: colorDeProyecto(fi, N),
    });
  });
  return { pos, regiones };
}

/** Las skills, en un anillo dentro del cascarón. Se ven a través de él. */
export function nucleo(n: number): Array<{ x: number; y: number; z: number }> {
  if (n === 0) return [];
  if (n === 1) return [{ x: 0, y: 0, z: 0 }];
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    // Inclinado, para que no se lea como un aro plano visto de frente.
    return {
      x: Math.cos(a) * R_NUCLEO,
      y: Math.sin(a) * R_NUCLEO * 0.38,
      z: Math.sin(a) * R_NUCLEO * 0.92,
    };
  });
}

/**
 * Por dónde tira un hilo: por DENTRO de la bola, rodeando el núcleo.
 *
 * Sin esto los hilos irían por la superficie y taparían las regiones; con esto
 * cruzan el interior y se leen como el cableado de debajo. Nunca más adentro
 * que `R_LIBRE`, o se comerían el anillo de las skills que vive justo ahí.
 *
 * Devuelve el punto de control de una cuadrática, despejado de que una
 * cuadrática pasa por `(M + C) / 2` en su mitad.
 */
export function tiroDelHilo(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  let mx = a.x + b.x;
  let my = a.y + b.y;
  let mz = a.z + b.z;
  const len = Math.hypot(mx, my, mz);
  if (len < 1e-4) {
    /* ANTÍPODAS: el punto medio cae en el centro exacto y no da dirección
       ninguna, así que hay que inventarse una perpendicular.
       Y no vale cualquiera escrita a mano: esto era `(-a.y, a.x, 0)`, que es
       perpendicular a `a`… salvo cuando `a` está en el eje Z, donde sale el
       vector CERO y el hilo se iba derecho por el medio del anillo de skills.
       Lo cazó `cerebro-check` con dos documentos en los polos.
       Lo que sí vale siempre: el producto vectorial con el eje del que `a` esté
       MENOS cerca, que por construcción no puede ser paralelo a él. */
    const ax = Math.abs(a.x), ay = Math.abs(a.y), az = Math.abs(a.z);
    const ex = ax <= ay && ax <= az ? 1 : 0;
    const ey = ex === 0 && ay <= az ? 1 : 0;
    const ez = ex === 0 && ey === 0 ? 1 : 0;
    mx = a.y * ez - a.z * ey;
    my = a.z * ex - a.x * ez;
    mz = a.x * ey - a.y * ex;
    const l = Math.hypot(mx, my, mz) || 1;
    mx /= l;
    my /= l;
    mz /= l;
  } else {
    mx /= len;
    my /= len;
    mz /= len;
  }
  return {
    x: 2 * mx * R_LIBRE - (a.x + b.x) / 2,
    y: 2 * my * R_LIBRE - (a.y + b.y) / 2,
    z: 2 * mz * R_LIBRE - (a.z + b.z) / 2,
  };
}

/**
 * La malla del tejido: cada nodo cosido a sus vecinos de la superficie.
 *
 * Es una red de triángulos finos tendida SOBRE la bola, y no tiene nada que ver
 * con los enlaces de la bóveda: esos van por dentro, del color de su proyecto, y
 * dicen qué documento cita a cuál; esto dice dónde está la superficie. Los dos
 * juntos son la lectura buena: la corteza se ve como una piel cosida y las
 * conexiones de verdad la cruzan por debajo.
 */
export function coser(ps: Array<{ x: number; y: number; z: number }>, k = 3): Hilo[] {
  const aristas = new Set<number>();
  const n = ps.length;
  for (let i = 0; i < n; i++) {
    const cerca: Array<[number, number]> = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = (ps[i].x - ps[j].x) ** 2 + (ps[i].y - ps[j].y) ** 2 + (ps[i].z - ps[j].z) ** 2;
      cerca.push([d, j]);
    }
    cerca.sort((a, b) => a[0] - b[0]);
    for (let m = 0; m < Math.min(k, cerca.length); m++) {
      const j = cerca[m][1];
      // Una arista es la misma vista desde sus dos puntas: se guarda una vez, o
      // cada línea se pintaría dos veces y saldría el doble de fuerte.
      aristas.add(i < j ? i * n + j : j * n + i);
    }
  }
  return [...aristas].map((v) => [Math.floor(v / n), v % n] as Hilo);
}

/**
 * La rejilla de la bola: meridianos y paralelos, con su normal.
 *
 * Es lo que dice «esto es una esfera» y no una nube de puntos redondeada. Va un
 * pelo por dentro (`HUNDIR`), para que las luces se lean encima de ella y no
 * atravesadas por sus líneas.
 */
const HUNDIR = 0.985;
export function rejilla(): Array<Array<{ x: number; y: number; z: number; n: { x: number; y: number; z: number } }>> {
  const lineas = [];
  const PASO = 46;
  const punto = (d: { x: number; y: number; z: number }) => ({
    x: d.x * R * HUNDIR,
    y: d.y * R * HUNDIR,
    z: d.z * R * HUNDIR,
    n: d,
  });
  for (let m = 0; m < 18; m++) {
    const a = (m / 18) * Math.PI * 2;
    const l = [];
    for (let k = 0; k <= PASO; k++) {
      const t = -Math.PI / 2 + (k / PASO) * Math.PI;
      l.push(punto({ x: Math.cos(t) * Math.cos(a), y: Math.sin(t), z: Math.cos(t) * Math.sin(a) }));
    }
    lineas.push(l);
  }
  for (let p = 1; p < 12; p++) {
    const t = -Math.PI / 2 + (p / 12) * Math.PI;
    const r = Math.cos(t);
    const y = Math.sin(t);
    const l = [];
    for (let k = 0; k <= PASO * 2; k++) {
      const a = (k / (PASO * 2)) * Math.PI * 2;
      l.push(punto({ x: Math.cos(a) * r, y, z: Math.sin(a) * r }));
    }
    lineas.push(l);
  }
  return lineas;
}
