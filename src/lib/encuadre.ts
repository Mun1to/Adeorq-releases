// El encuadre del fondo: qué trozo de la foto se ve y a qué tamaño.
//
// Hasta ahora esto no existía y no era una carencia disimulada, era una regla
// fija escrita en el CSS: `object-fit: cover` más `transform: scale(1.06)`.
// O sea, Adeorq agrandaba la foto hasta tapar la ventana entera, recortaba lo
// que sobraba y la centraba, siempre, sin preguntar. Con una foto más vertical
// que la ventana eso se come el cielo y el suelo; con una más apaisada, los
// lados. Munir lo describió como «la escala se pone automática o se rellena
// como tú no quieres», y tenía razón en las dos mitades: era automática y no
// había forma de decirle otra cosa.
//
// Aquí vive el modelo, que es de tres números y un modo:
//
//   · `modo`  rellenar (recorta hasta tapar) o entera (cabe toda, con marco).
//   · `x`,`y` qué punto de la foto queda en el centro de la ventana, en tanto
//             por ciento. 50/50 es el centro, 0/0 la esquina de arriba a la
//             izquierda. Es exactamente lo que entiende `object-position`.
//   · `zoom`  de 100 a 300. Acercarse más allá de lo que ya rellena.
//
// Por qué hacen falta object-position Y un translate, que parece repetido:
// `object-position` solo manda sobre lo que desborda por culpa del encaje, o
// sea sobre UN eje (el que no cuadra con la proporción de la ventana). El zoom
// desborda por los cuatro lados, y de eso `object-position` no sabe nada: hay
// que moverlo con un `translate`. Los dos empujan en la misma dirección, así
// que arrastrar mueve la foto igual tenga zoom o no. La fórmula está abajo.

export type ModoEncuadre = "rellenar" | "entera";

export interface Encuadre {
  modo: ModoEncuadre;
  /** 0-100. Qué columna de la foto queda centrada. */
  x: number;
  /** 0-100. Qué fila de la foto queda centrada. */
  y: number;
  /** 100-300. 100 = lo justo para cumplir el modo. */
  zoom: number;
}

export const ENCUADRE_KEY = "adeorq-fondo-encuadre";

export const ENCUADRE_DEFECTO: Encuadre = { modo: "rellenar", x: 50, y: 50, zoom: 100 };

export const ZOOM_MIN = 100;
export const ZOOM_MAX = 300;

/**
 * El 6 % que llevaba clavado el CSS, y que no era decorativo: el desenfoque
 * encoge el borde de la imagen y deja una orla del color de debajo, así que
 * había que agrandarla para echar ese borde fuera de la ventana.
 *
 * Ahora se aplica solo cuando hace falta (hay desenfoque) y donde tiene
 * sentido (rellenando; en «entera» la foto ya no llega a los bordes a
 * propósito, y agrandarla sería desobedecer el modo que se ha pedido).
 */
export const ORLA = 6;

function acotar(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Deja un encuadre dentro de sus límites. Todo lo que entra de fuera pasa por aquí. */
export function limitar(e: Partial<Encuadre> | null | undefined): Encuadre {
  if (!e) return { ...ENCUADRE_DEFECTO };
  return {
    modo: e.modo === "entera" ? "entera" : "rellenar",
    x: acotar(Number(e.x ?? 50), 0, 100),
    y: acotar(Number(e.y ?? 50), 0, 100),
    zoom: acotar(Number(e.zoom ?? 100), ZOOM_MIN, ZOOM_MAX),
  };
}

export function leerEncuadre(): Encuadre {
  try {
    const crudo = localStorage.getItem(ENCUADRE_KEY);
    if (!crudo) return { ...ENCUADRE_DEFECTO };
    return limitar(JSON.parse(crudo) as Partial<Encuadre>);
  } catch {
    // Un JSON roto no puede dejar la app sin fondo: se vuelve al de fábrica.
    return { ...ENCUADRE_DEFECTO };
  }
}

export function guardarEncuadre(e: Encuadre): void {
  localStorage.setItem(ENCUADRE_KEY, JSON.stringify(limitar(e)));
}

/** Si está en lo de fábrica, para saber si enseñar el botón de deshacer. */
export function esDefecto(e: Encuadre): boolean {
  return (
    e.modo === ENCUADRE_DEFECTO.modo &&
    e.x === ENCUADRE_DEFECTO.x &&
    e.y === ENCUADRE_DEFECTO.y &&
    e.zoom === ENCUADRE_DEFECTO.zoom
  );
}

export interface EstiloEncuadre {
  objectFit: "cover" | "contain";
  objectPosition: string;
  transform: string;
}

/**
 * El encuadre convertido en las tres propiedades que lo pintan. Lo usan la capa
 * del fondo de verdad y la miniatura del editor, con los mismos números, que es
 * lo único que hace que la vista previa no mienta.
 *
 * El translate, que es la única cuenta de todo el archivo: con `scale(z)` desde
 * el centro, la imagen sobresale `(z-1)/2` del ancho por cada lado. Para llevar
 * el encuadre del centro (x = 50) hasta un extremo hace falta mover justo esa
 * mitad, así que `tx = (50 - x) * (z - 1)` en tanto por ciento del ancho. Con
 * z = 1 da 0, que es lo correcto: sin zoom no hay nada que mover por aquí.
 */
export function estiloDe(e: Encuadre, desenfoque = 0): EstiloEncuadre {
  const { modo, x, y } = limitar(e);
  const minimo = modo === "rellenar" && desenfoque > 0 ? ZOOM_MIN + ORLA : ZOOM_MIN;
  const z = Math.max(limitar(e).zoom, minimo) / 100;
  const tx = (50 - x) * (z - 1);
  const ty = (50 - y) * (z - 1);
  return {
    objectFit: modo === "entera" ? "contain" : "cover",
    objectPosition: `${x}% ${y}%`,
    // Redondeado a dos decimales: son píxeles de pantalla, no una medida, y
    // así el `style` no cambia de texto en cada repintado por un 0,0001.
    transform: `translate(${tx.toFixed(2)}%, ${ty.toFixed(2)}%) scale(${z.toFixed(3)})`,
  };
}

/**
 * Arrastrar. Entran los píxeles recorridos por el ratón y el tamaño de la caja
 * sobre la que se arrastra (la miniatura), y sale el encuadre movido.
 *
 * El signo está invertido a propósito y es lo que hace que se sienta bien:
 * llevar la foto hacia la derecha es querer ver lo que hay a su IZQUIERDA, o
 * sea bajar la x. Se agarra la foto, no la ventana.
 */
export function arrastrar(
  e: Encuadre,
  dxPx: number,
  dyPx: number,
  anchoCaja: number,
  altoCaja: number,
): Encuadre {
  if (anchoCaja <= 0 || altoCaja <= 0) return e;
  return limitar({
    ...e,
    x: e.x - (dxPx / anchoCaja) * 100,
    y: e.y - (dyPx / altoCaja) * 100,
  });
}

/**
 * Acercar o alejar a pasos contados. Positivo acerca, negativo aleja. Lo usan
 * los dos botones de la fila del zoom y, por debajo, la rueda: así el clic y la
 * rueda mueven exactamente lo mismo y no hay dos velocidades de zoom.
 */
export function acercar(e: Encuadre, pasos: number, paso = 8): Encuadre {
  return limitar({ ...e, zoom: e.zoom + pasos * paso });
}

/**
 * La rueda. Un paso fijo por muesca en vez de proporcional a `deltaY`, porque
 * el ratón de Munir y el trackpad mandan números muy distintos por el mismo
 * gesto y con lo proporcional uno de los dos se vuelve inservible.
 */
export function rueda(e: Encuadre, deltaY: number, paso = 8): Encuadre {
  if (deltaY === 0) return e;
  return acercar(e, deltaY < 0 ? 1 : -1, paso);
}

/** Si ya no se puede acercar (o alejar) más, para apagar su botón. */
export function alTope(e: Encuadre, pasos: number): boolean {
  return acercar(e, pasos).zoom === limitar(e).zoom;
}
