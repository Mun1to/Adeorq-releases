// La física de la Constelación, aparte de quien la dibuja.
//
// Vivía dentro del componente, y eso significa que la única forma de saber si
// estaba bien era mirar el tablero y opinar. Munir vio lo que pasaba de verdad
// («hay nodos que se van a tomar por el culo», 2026-08-02) y eso NO se arregla
// a ojo: se arregla midiendo. Aquí está la parte que se puede medir, y
// `scripts/constelacion-check.ts` la corre con cuatrocientos puntos y comprueba
// que ninguno se escapa.
//
// Es una colocación por fuerzas de las de siempre: los enlazados se atraen,
// todos se repelen y el conjunto se recoge hacia el centro. Lo que la hacía
// explotar era la falta de topes, no la idea.

export interface Punto {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Cuántos hilos salen o llegan. Decide el tamaño al dibujar y cuánto sitio
      pide a su alrededor. */
  grado: number;
  color: string;
  title: string;
  /** A qué proyecto pertenece: su carpeta de primer nivel. Es lo que lo lleva a
      su cúmulo, y lo que lo pinta de un color u otro. */
  fam?: string;
  /** Lo estás arrastrando: manda tu mano, no las fuerzas. */
  agarrado?: boolean;
}

/**
 * EL CARRUSEL: dónde vive el cúmulo de cada proyecto.
 *
 * La constelación era una nube de puntos sueltos donde todo flotaba igual, y
 * con quinientos documentos eso no se lee: no se ve dónde acaba un proyecto y
 * empieza el otro (Munir, 2026-08-10: «que los nodos se diferencien mucho más
 * por proyectos, tipo un carrusel, algo más digerible»).
 *
 * Ahora cada proyecto tiene un sitio FIJO en una rueda, y sus documentos son
 * atraídos ahí. El resultado son islas reconocibles con los hilos entre ellas a
 * la vista, que es exactamente lo que se quiere mirar: quién habla con quién.
 *
 * El radio crece con el número de proyectos, no es fijo: con cinco caben cerca
 * y con treinta hay que abrir la rueda o los cúmulos se tocan.
 */
export function anclas(familias: string[]): Map<string, { x: number; y: number }> {
  const n = familias.length;
  const m = new Map<string, { x: number; y: number }>();
  if (n === 0) return m;
  // Uno solo manda al centro: una rueda de un elemento es un punto descentrado
  // sin ningún motivo.
  if (n === 1) return m.set(familias[0], { x: 0, y: 0 });
  // Perímetro suficiente para que cada cúmulo tenga su sitio, con tope: pasado
  // el valle de la gravedad los de fuera se pasarían la vida siendo recogidos.
  const radio = Math.min(VALLA * 0.62, Math.max(240, (n * 210) / (2 * Math.PI)));
  familias.forEach((f, i) => {
    // Arrancando arriba y no a la derecha: una rueda se lee desde las doce.
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
    m.set(f, { x: Math.cos(ang) * radio, y: Math.sin(ang) * radio });
  });
  return m;
}

/** Cuánto tira cada proyecto de los suyos. Suave a propósito: tiene que ganar
    al ruido y perder contra un hilo de verdad, porque un documento que enlaza
    con otro proyecto debe poder acercarse a él. Eso es lo que dibuja los
    puentes entre cúmulos en vez de dejar islas incomunicadas. */
export const IMAN_FAMILIA = 0.011;

/** Un hilo, por índice dentro del array de puntos. */
export type Hilo = [number, number];

/** Cuánto se enfría en cada paso. Con esto la colocación tarda unos tres
    segundos en asentarse y luego se queda quieta, como la de Obsidian: un
    tablero que nunca deja de temblar cansa la vista y gasta batería. */
export const ENFRIA = 0.972;
export const PARA_EN = 0.008;

/**
 * Los topes, que son el arreglo entero.
 *
 * Una repulsión de 1/d² sin límite manda un punto a la otra punta del tablero
 * en cuanto dos caen casi encima, y ningún rozamiento posterior lo frena. Con
 * `FUERZA_MAX` el empujón no puede pasar de ahí, y con `VEL_MAX` ningún punto
 * puede cruzar el tablero en un solo paso pase lo que pase antes.
 */
export const FUERZA_MAX = 40;
export const VEL_MAX = 14;

/** El alcance del empujón. Es también el lado de la casilla de la rejilla, así
    que mirar las ocho de alrededor basta para no perderse a nadie. Cuanto más
    largo, más aire entre notas: con ochenta el tablero salía apretado. */
export const CASILLA = 115;

/** Lo mínimo que vale alpha para la repulsión. La colocación se enfría, pero
    separar dos notas que se tocan no es colocar: es no mentir sobre cuántas
    hay. */
const SUELO = 0.3;

/** El radio dentro del cual la gravedad no hace nada. Fuera de él recoge, para
    que ninguna isla se pierda; dentro deja respirar. */
export const VALLA = 950;

/**
 * Un paso de la colocación. Devuelve el alpha siguiente.
 *
 * `alpha` es lo caliente que está: empieza en 1 y baja sola. Multiplica a las
 * fuerzas que colocan (repulsión y atracción) pero NO a la gravedad del centro,
 * y esa diferencia importa: si la gravedad se enfriara con todo lo demás, al
 * final no quedaría ninguna fuerza capaz de recoger a un punto que se alejó, y
 * ese se quedaría fuera para siempre. Es literalmente el punto perdido en la
 * esquina.
 */
export function paso(
  ps: Punto[],
  hilos: Hilo[],
  alpha: number,
  /** Dónde vive el cúmulo de cada proyecto. Sin esto se comporta como antes,
      que es lo que hace que el comprobador viejo siga valiendo. */
  casas?: Map<string, { x: number; y: number }>,
): number {
  if (ps.length === 0) return alpha;
  const a = alpha;

  // Repulsión por casillas y no contra todos: cuatrocientos puntos son ochenta
  // mil parejas en cada paso, y con eso se notaba.
  const rejilla = new Map<string, number[]>();
  for (let i = 0; i < ps.length; i++) {
    const k = `${Math.round(ps[i].x / CASILLA)},${Math.round(ps[i].y / CASILLA)}`;
    const c = rejilla.get(k);
    if (c) c.push(i);
    else rejilla.set(k, [i]);
  }
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const cx = Math.round(p.x / CASILLA);
    const cy = Math.round(p.y / CASILLA);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const vecinos = rejilla.get(`${cx + dx},${cy + dy}`);
        if (!vecinos) continue;
        for (const j of vecinos) {
          if (j <= i) continue;
          const q = ps[j];
          let ex = p.x - q.x;
          let ey = p.y - q.y;
          let d2 = ex * ex + ey * ey;
          if (d2 > CASILLA * CASILLA) continue;
          if (d2 < 0.01) {
            // Dos puntos exactamente encima. Se separan en una dirección
            // cualquiera pero SIEMPRE la misma para el mismo par: con un valor
            // al azar, dos fotogramas seguidos los mandan a sitios distintos y
            // el tablero tiembla sin llegar a asentarse nunca.
            ex = ((i % 7) - 3) || 1;
            ey = ((j % 5) - 2) || 1;
            d2 = 0.01;
          }
          const d = Math.sqrt(d2);
          // Acotada por arriba, y desvaneciéndose hasta el borde de la casilla:
          // sin lo segundo hay un escalón ahí (a 79 px hay empujón y a 81 no),
          // así que un punto que cruza esa línea pega un tirón cada vez.
          //
          // El `max(a, SUELO)` es la otra mitad del asunto: si la repulsión se
          // enfriara del todo, al final de la colocación no quedaría nada que
          // separase y sí algo que junta (los hilos), así que el tablero se
          // cerraba sobre sí mismo y los puntos acababan pegados unos a otros
          // (Munir, 2026-08-02: «ahora se ven muy juntos»). Con un suelo, dos
          // notas nunca se montan encima por mucho que se enfríe todo.
          const suave = 1 - d / CASILLA;
          const f = Math.min(FUERZA_MAX, (700 * Math.max(a, SUELO)) / d2) * suave;
          const ux = (ex / d) * f;
          const uy = (ey / d) * f;
          p.vx += ux;
          p.vy += uy;
          q.vx -= ux;
          q.vy -= uy;
        }
      }
    }
  }

  for (const [i, j] of hilos) {
    const p = ps[i];
    const q = ps[j];
    if (!p || !q) continue;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    // La distancia de reposo crece con lo conectados que estén los dos: un
    // punto con veinte hilos necesita sitio alrededor para que sus veinte
    // vecinos quepan, y con una distancia fija todos tiraban de él hacia el
    // mismo sitio y salía el amasijo del centro.
    const reposo = Math.min(210, 80 + (p.grado + q.grado) * 2.2);
    // El tirón también acotado: dos puntos muy separados por un hilo largo se
    // atraían con una fuerza proporcional a lo lejos que estaban.
    const f = Math.max(-6, Math.min(6, (d - reposo) * 0.012)) * a;
    const ux = (dx / d) * f;
    const uy = (dy / d) * f;
    p.vx += ux;
    p.vy += uy;
    q.vx -= ux;
    q.vy -= uy;
  }

  for (const p of ps) {
    // El que llevas agarrado no se mueve solo, y se le vacía la velocidad para
    // que al soltarlo no salga despedido con todo lo que acumuló.
    if (p.agarrado) {
      p.vx = 0;
      p.vy = 0;
      continue;
    }
    // La gravedad es una VALLA, no un imán: solo tira de lo que se ha salido
    // del tablero, y a lo de dentro lo deja en paz. Como imán —tirando de todo
    // hacia el centro a todas horas— cumplía su encargo (que nadie se pierda en
    // una esquina) pero comprimía el conjunto entero sin parar, y eso es la
    // otra mitad de por qué se veían amontonados.
    const lejos = Math.hypot(p.x, p.y);
    if (lejos > VALLA) {
      const tira = (lejos - VALLA) * 0.004;
      p.vx -= (p.x / lejos) * tira;
      p.vy -= (p.y / lejos) * tira;
    }

    /* Y cada uno hacia su proyecto. Es lo que convierte la nube en cúmulos.
       NO se enfría con `alpha`, por lo mismo que la valla: si se enfriara, un
       documento que otro empujó fuera de su isla se quedaría fuera para
       siempre. Lineal y suave: acerca sin arrancar, y un hilo hacia otro
       proyecto todavía puede ganarle y tender el puente. */
    const casa = p.fam ? casas?.get(p.fam) : undefined;
    if (casa) {
      p.vx += (casa.x - p.x) * IMAN_FAMILIA;
      p.vy += (casa.y - p.y) * IMAN_FAMILIA;
    }

    const v = Math.hypot(p.vx, p.vy);
    if (v > VEL_MAX) {
      p.vx = (p.vx / v) * VEL_MAX;
      p.vy = (p.vy / v) * VEL_MAX;
    }

    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.82;
    p.vy *= 0.82;
  }

  return a * ENFRIA;
}

/**
 * Dónde nace cada punto: cada familia en su sector, y dentro de él en espiral.
 *
 * Antes era un círculo por orden de lectura, o sea con las carpetas mezcladas:
 * la colocación empezaba teniendo que deshacer ese desorden, y deshacerlo es
 * justo lo que se ve como un tirón y lo que deja puntos lejos. Naciendo cada
 * familia junta, las fuerzas solo tienen que afinar.
 */
export function colocar<T>(
  items: T[],
  familiaDe: (x: T) => string,
): Array<{ x: number; y: number }> {
  const familias = [...new Set(items.map(familiaDe))].sort();
  const casas = anclas(familias);
  const cuenta = new Map<string, number>();
  return items.map((it) => {
    const fam = familiaDe(it);
    const n = cuenta.get(fam) ?? 0;
    cuenta.set(fam, n + 1);
    const casa = casas.get(fam) ?? { x: 0, y: 0 };
    // En espiral ALREDEDOR DE SU CASA, no en un sector del centro. Nacer ya
    // dentro de su cúmulo es lo que hace que la colocación solo tenga que
    // afinar: si nacen mezclados, los primeros segundos son un revoltijo
    // deshaciéndose, y eso es lo que se ve como un tirón.
    const ang = n * 2.399; // ángulo áureo: reparte sin repetir direcciones
    const r = 26 + Math.sqrt(n) * 26;
    return { x: casa.x + Math.cos(ang) * r, y: casa.y + Math.sin(ang) * r };
  });
}

/**
 * Dónde queda cada isla ya colocada, para poder dibujarla.
 *
 * Devuelve el centro y el radio de cada proyecto según DÓNDE ESTÁN sus puntos,
 * no según dónde deberían: un documento que se fue a hablar con otro proyecto
 * estira su isla, y eso es información, no un error que haya que esconder.
 */
export function cumulos(
  ps: Punto[],
): Array<{ fam: string; x: number; y: number; r: number; n: number; color: string }> {
  const por = new Map<string, Punto[]>();
  for (const p of ps) {
    if (!p.fam) continue;
    const l = por.get(p.fam);
    if (l) l.push(p);
    else por.set(p.fam, [p]);
  }
  const out = [];
  for (const [fam, list] of por) {
    let sx = 0;
    let sy = 0;
    for (const p of list) {
      sx += p.x;
      sy += p.y;
    }
    const x = sx / list.length;
    const y = sy / list.length;
    let r = 0;
    for (const p of list) r = Math.max(r, Math.hypot(p.x - x, p.y - y));
    out.push({ fam, x, y, r: r + 34, n: list.length, color: list[0].color });
  }
  // De mayor a menor, para que el disco de una isla grande no tape a una
  // pequeña que le haya quedado dentro.
  return out.sort((a, b) => b.r - a.r);
}
