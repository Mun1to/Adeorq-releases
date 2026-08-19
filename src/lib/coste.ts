// Lo que costaría de verdad UNA petición, y no un precio por millón.
//
// «3 dólares por millón de tokens» no le dice nada a nadie hasta que haces la
// cuenta, y la cuenta que casi todo el mundo hace está mal. Este archivo la
// hace bien, y lo que la hace bien es un dato medido y no una suposición.
//
// ── LO QUE SE MIDIÓ (57.168 peticiones reales de Munir, 2026-08-19) ────────
//
// Leyendo sus transcripts de `~/.claude`, una petición suya de tamaño mediano
// es así:
//
//     entrada total ....... 302.039 tokens
//        de caché leída ...  97,33 %
//        de caché escrita ..  2,66 %
//        nueva de verdad ...  0,01 %   (39 tokens de media, mediana 2)
//     salida .............. 1.243 tokens de media
//
// El 97 % de lo que «entra» ya estaba cacheado del turno anterior, y la caché
// se cobra diez veces más barata. Calcular el precio como
// `contexto × precio_de_entrada` da un número **37 veces más caro** que el real
// en cualquier modelo que cachee. Ese es el error que este archivo existe para
// no cometer.
//
// ── Y LO QUE ESO CAMBIA EN LA RECOMENDACIÓN ───────────────────────────────
//
// Con los precios de OpenRouter del mismo día, una petición suya sale:
//
//     Opus 5 ................. 0,2283 $
//     Sonnet 5 ............... 0,0913 $
//     Qwen3-Coder ............ 0,0331 $     ← 6,9 veces más barato que Opus
//     Gemini 3.7 Flash ....... 0,0135 $     (con su descuento del 75 %)
//     DeepSeek Chat .......... 0,0790 $     ← y este NO cachea
//
// Fíjate en el último: por precio de tarifa DeepSeek parece de la familia de
// Qwen, y sin embargo cuesta **más del doble**, porque no cachea y con un
// contexto de 300k paga la entrada entera en cada turno. Un recomendador que
// ordene por «dólares por millón» lo pondría por delante y se equivocaría. Ese
// es exactamente el consejo que este archivo impide dar.
//
// ── OJO CON ESOS NÚMEROS: SON DE LA VÍA DEL AGENTE ────────────────────────
//
// Todo lo de arriba vale para un CLI, que manda `cache_control` en cada turno.
// Por la vía de CLAVE DE API de Adeorq no se manda (`chat.rs` envía `model`,
// `messages`, `stream` y `usage`, y nada más), así que ahí la entrada se paga
// ENTERA cada vez y ese mismo Gemini cuesta 0,1148 $ en vez de 0,0135 $. De ahí
// el parámetro `via`: sin él, el copiloto recomendaba la API con un precio
// **8,5 veces** más barato del que ibas a pagar.
//
// Y de paso corrige una cifra que llevábamos repitiendo: entre el modelo más
// caro y el más barato NO hay 577 veces de diferencia. Eso salía de comparar
// tarifas por millón. Comparando peticiones de verdad, con sus cachés, la
// diferencia útil está entre 7 y 20 veces. Sigue mereciendo la pena elegir,
// pero es una decisión de céntimos y no de euros, y decirlo mal le quita
// credibilidad a todo lo demás.

/** Los precios de un modelo, en dólares por millón de tokens. */
export interface PrecioModelo {
  entradaMillon: number;
  salidaMillon: number;
  /**
   * Lo que cuesta releer lo que ya estaba cacheado.
   *
   * `undefined` o cero significa **que ese modelo no cachea**, no que la caché
   * sea gratis: 169 de los 415 modelos de OpenRouter no publican este precio,
   * y en esos la entrada se paga entera en cada turno. Tratar la ausencia como
   * gratis sería recomendarlos por ser baratísimos justo cuando son lo
   * contrario.
   */
  cacheLeidaMillon?: number;
  cacheEscritaMillon?: number;
}

/**
 * Cómo se reparte una petición de verdad, medido en sus sesiones.
 *
 * Son proporciones, no tokens: se aplican al contexto que tenga la sesión de
 * la que estemos hablando, que Adeorq ya sabe leer del transcript.
 */
export const PATRON = {
  cacheLeida: 0.9733,
  cacheEscrita: 0.0266,
  nueva: 0.0001,
  /** Percentiles reales de lo que escribe una respuesta, en tokens. */
  salida: { p25: 322, mediana: 684, p75: 1416, p90: 2662 },
  /** De cuándo son estos números y sobre cuántas peticiones. */
  medidoEn: "2026-08-19",
  muestras: 57168,
} as const;

/**
 * Por dónde va a ir la petición, que decide si la caché cuenta o no.
 *
 * Esto NO es un detalle de implementación: es la diferencia entre un precio
 * verdadero y uno ocho veces más barato de lo que vas a pagar.
 *
 * `"agente"` es como trabaja un CLI: manda `cache_control` en cada turno y
 * relee lo de antes a precio de caché. Es el patrón que se midió (97,33 % de
 * caché) y el que vale para comparar dos CLIs entre sí.
 *
 * `"api"` es como manda Adeorq por clave: `chat.rs` NO manda `cache_control`,
 * así que **la entrada se paga entera en cada turno**. Comprobado leyendo el
 * cuerpo que envía (2026-08-19): `model`, `messages`, `stream` y `usage`, y
 * nada de caché.
 *
 * La primera versión del copiloto calculaba la vía de API con el patrón del
 * agente, y decía «esto por API te costaría 0,0135 $» donde de verdad son
 * 0,1148 $. Un consejo que se equivoca por 8,5 veces en el número que lo
 * justifica es peor que no darlo.
 */
export type Via = "agente" | "api";

export interface Coste {
  /** En dólares. */
  total: number;
  entrada: number;
  salida: number;
  /** Si este modelo cachea. Cambia el precio por diez, así que se dice. */
  cachea: boolean;
}

/** Si un modelo cachea de verdad, que no es lo mismo que declarar un campo. */
export function cachea(p: PrecioModelo): boolean {
  const c = p.cacheLeidaMillon ?? 0;
  return c > 0 && c < p.entradaMillon;
}

/**
 * Lo que cuesta una petición con ese contexto y esa salida.
 *
 * `contexto` son los tokens que ya lleva la conversación, que es lo que Adeorq
 * lee de verdad del transcript. Un modelo que no cachea paga eso entero cada
 * vez; uno que cachea paga casi todo a precio de caché.
 */
export function costeDe(
  p: PrecioModelo,
  contexto: number,
  salida: number,
  via: Via = "agente",
): Coste {
  const M = 1_000_000;
  // Que el modelo sepa cachear no basta: hay que MANDARLE que cachee, y por la
  // vía de API de Adeorq eso no pasa.
  const puedeCachear = via === "agente" && cachea(p);
  const leida = puedeCachear ? (p.cacheLeidaMillon ?? 0) : p.entradaMillon;
  // Escribir en caché suele costar un poco MÁS que la entrada normal (en
  // Anthropic, 1,25 veces), aunque no siempre: Gemini 3.7 Flash la cobra a
  // 0,0208 $/M, por debajo incluso de su propia lectura de caché.
  //
  // El cero se trata como «no publicado» y NO como gratis, y esa distinción
  // importa: Qwen3-Coder cachea de verdad (su lectura cuesta 0,1 $/M) pero
  // publica la escritura a cero, y darla por gratis abarataría su precio sin
  // ningún dato que lo respalde. Cuando no se sabe, se cobra como entrada
  // normal, que es la suposición prudente: quedarse corto en un precio hace
  // más daño que pasarse.
  const escrita = puedeCachear ? p.cacheEscritaMillon || p.entradaMillon : p.entradaMillon;

  const costeEntrada = puedeCachear
    ? (contexto * PATRON.cacheLeida * leida) / M +
      (contexto * PATRON.cacheEscrita * escrita) / M +
      (contexto * PATRON.nueva * p.entradaMillon) / M
    : (contexto * p.entradaMillon) / M;

  const costeSalida = (salida * p.salidaMillon) / M;
  return {
    total: costeEntrada + costeSalida,
    entrada: costeEntrada,
    salida: costeSalida,
    cachea: puedeCachear,
  };
}

export interface Rango {
  min: number;
  max: number;
  /** Los tokens de salida con los que se ha hecho cada extremo, para poder
      enseñarlos: un rango sin decir de dónde sale es un rango que hay que
      creerse. */
  salidaMin: number;
  salidaMax: number;
  cachea: boolean;
}

/**
 * El rango honesto de lo que va a costar esta petición.
 *
 * Nadie sabe cuántos tokens va a escribir un modelo antes de mandarle nada, así
 * que un número exacto sería inventado. Lo que sí se sabe es cuánto escribe de
 * verdad una respuesta suya: entre el percentil 25 y el 90 de 57.168 medidas.
 * Ese es el rango, y por eso se puede defender.
 *
 * `largo` sube el techo cuando la tarea ya se sabe que va a escribir mucho (un
 * refactor grande, una auditoría). No baja el suelo: una tarea larga también
 * puede resolverse en un párrafo, y prometer un mínimo alto sería inventar
 * hacia el otro lado.
 */
export function rangoDe(
  p: PrecioModelo,
  contexto: number,
  largo = false,
  via: Via = "agente",
): Rango {
  const min = PATRON.salida.p25;
  const max = largo ? PATRON.salida.p90 * 3 : PATRON.salida.p90;
  return {
    min: costeDe(p, contexto, min, via).total,
    max: costeDe(p, contexto, max, via).total,
    salidaMin: min,
    salidaMax: max,
    cachea: via === "agente" && cachea(p),
  };
}

/**
 * «0,03 $», «entre 0,01 $ y 0,04 $», o «gratis» cuando de verdad lo es.
 *
 * Cuatro decimales cuando es menos de un céntimo, porque casi todo lo es y con
 * dos saldría «0,00 $» en la mitad de los casos, que parece gratis y no lo es.
 */
export function comoRango(r: Rango): string {
  if (r.max <= 0) return "gratis";
  // Por debajo de esto, cuatro decimales ya solo saben decir cero, y un «0,0000 $»
  // se lee como gratis cuando no lo es.
  if (r.max < 0.00005) return "menos de 0,0001 $";
  const d = (v: number) => (v < 0.01 ? v.toFixed(4) : v.toFixed(2)).replace(".", ",");
  // Si los dos extremos se redondean igual, un rango sobra: «entre 0,01 $ y
  // 0,01 $» es una forma rara de decir «0,01 $».
  return d(r.min) === d(r.max) ? `${d(r.min)} $` : `entre ${d(r.min)} $ y ${d(r.max)} $`;
}

/**
 * Cuántas veces más barato es uno que otro, para la misma petición.
 *
 * Es la cifra que de verdad ayuda a decidir, porque compara peticiones y no
 * tarifas. Devuelve `0` cuando el de referencia sale gratis, y ahí la pantalla
 * tiene que decir «gratis», no «infinitas veces más barato».
 */
export function cuantasVecesMasBarato(caro: Coste, barato: Coste): number {
  if (barato.total <= 0) return 0;
  return caro.total / barato.total;
}
