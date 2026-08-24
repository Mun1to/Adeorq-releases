// Cómo se dicen en cristiano las tres líneas de la tarjeta de uso.
//
// La tarjeta la escribe el CLI, y la escribe SIEMPRE en inglés: sus etiquetas
// son «Current week (all models)» y sus fechas «Aug 26, 9am». El panel las
// pegaba tal cual detrás de un «se renueva» traducido, así que en español se
// leía «se renueva Aug 26, 9am»: media frase en cada idioma (Munir, 2026-08-24:
// «la traducción de la parte del uso está mal»).
//
// Vive aparte del componente por lo de siempre: son reglas que se pueden
// enumerar, así que se pueden ejecutar de verdad (`scripts/uso-check.ts`) en
// vez de mirarlas en pantalla y opinar. Y ninguna de las tres es tan obvia como
// parece: el mes viene abreviado en inglés, el año no viene, y la hora puede
// venir sin minutos.
//
// Lo que se traduce y lo que NO:
//
//   · La ETIQUETA se traduce, menos el nombre del modelo. «Current week
//     (Fable)» es «semana · Fable»: Fable se llama Fable en todos los idiomas.
//   · La FECHA se reescribe entera, y de paso se dice mejor. «Aug 26, 9am» es
//     una fecha que hay que comparar con el calendario para entenderla; «mañana
//     a las 9:00» se entiende sin pensar, que es de lo que va este panel.

/** El texto de una etiqueta de la tarjeta, ya partido en sus dos piezas. */
export interface Etiqueta {
  /** La clave en español, que es la clave del diccionario (ver `i18n.ts`). */
  clave: string;
  /** El modelo, cuando la línea es de uno solo. Nunca se traduce. */
  modelo?: string;
}

/**
 * «Current week (all models)» → semana. «Current week (Fable)» → semana · Fable.
 *
 * El nombre entero no cabe en una columna de 270 px, y recortarlo con puntos
 * suspensivos deja «Current week (all m…», que no dice nada más que el ancho.
 */
export function etiquetaCorta(label: string): Etiqueta {
  const dentro = label.match(/\(([^)]+)\)/)?.[1]?.trim();
  if (/session/i.test(label)) return { clave: "sesión" };
  if (/week/i.test(label)) {
    if (!dentro || /all models/i.test(dentro)) return { clave: "semana" };
    return { clave: "semana", modelo: dentro };
  }
  // El mes no sale en la tarjeta de Claude, sale en Codex: su plan gratuito
  // cuenta por ventanas de treinta días (43.200 minutos, medido en esta
  // máquina) y `uso_clientes.rs` las nombra con este mismo vocabulario.
  if (/month/i.test(label)) return { clave: "mes" };
  // Una línea que no reconocemos se dice tal cual: inventarle un nombre corto
  // sería tapar con una etiqueta bonita que el CLI ha cambiado su tarjeta.
  return { clave: label.replace(/^current\s+/i, "") };
}

const MESES = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/**
 * «Aug 26, 9am» → la fecha de verdad, o `null` si no se reconoce.
 *
 * El año NO viene en la tarjeta, así que se deduce: se prueba con el de ahora y,
 * si eso deja la renovación más de un mes en el pasado, es del año que viene.
 * Sin esa corrección, cada 31 de diciembre el panel diría que tu cuota se
 * renovó hace once meses.
 */
export function leerRenovacion(texto: string, ahora: Date = new Date()): Date | null {
  // "Aug 26, 9am"  ·  "Aug 24, 7:10am"  ·  "Aug 24, 12:05pm"
  const m = texto
    .trim()
    .match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  const mes = MESES.indexOf(m[1].slice(0, 3).toLowerCase());
  if (mes < 0) return null;
  const dia = Number(m[2]);
  let hora = Number(m[3]);
  const min = m[4] ? Number(m[4]) : 0;
  const sufijo = m[5]?.toLowerCase();
  if (sufijo === "pm" && hora < 12) hora += 12;
  if (sufijo === "am" && hora === 12) hora = 0;
  const fecha = new Date(ahora.getFullYear(), mes, dia, hora, min, 0, 0);
  // Un mes de margen hacia atrás: la ventana más larga del plan es la semana,
  // así que una renovación que quede más atrás que eso es del año siguiente.
  const MES_MS = 31 * 24 * 60 * 60 * 1000;
  if (fecha.getTime() < ahora.getTime() - MES_MS) {
    fecha.setFullYear(ahora.getFullYear() + 1);
  }
  return fecha;
}

/** Las piezas de la frase de renovación, para que el componente las traduzca. */
export interface Renovacion {
  /** Qué frase usar. Cada una es una clave del diccionario. */
  clave: "en {n} min" | "en {n} h" | "hoy a las {hora}" | "mañana a las {hora}" | "el {fecha}";
  /** Lo que va dentro de la frase, cuando es un número o una hora. */
  valor: string;
  /**
   * La fecha entera, solo en el caso lejano («el {fecha}»).
   *
   * Sale de aquí sin formatear a propósito: «26 ago» y «Aug 26» no se
   * diferencian en la palabra, se diferencian en el ORDEN, así que una tabla de
   * meses traducida no bastaría. Quien la pinta la pasa por `Intl` con el
   * idioma de la ventana y sale bien en los dos sin que aquí se sepa cuál es.
   */
  fecha?: Date;
}

/**
 * Cuándo se renueva, dicho como lo diría una persona.
 *
 * Devuelve las piezas y no la frase montada porque la frase se traduce fuera:
 * aquí no se sabe en qué idioma está la ventana, y pasarle el idioma a esta
 * función la haría depender del diccionario entero para escribir dos palabras.
 *
 * `null` cuando la tarjeta trae algo que no sabemos leer. El panel entonces
 * enseña el texto crudo del CLI, que es feo pero verdadero.
 */
export function renovacion(
  cuando: string | Date,
  ahora: Date = new Date(),
): Renovacion | null {
  // Un cliente que da la fecha como NÚMERO (Codex la guarda como epoch) no
  // pasa por el lector de texto: ahí no hay nada que adivinar, y adivinarlo de
  // todas formas es por donde se cuelan los fallos de un mes de diferencia.
  const fecha = cuando instanceof Date ? cuando : leerRenovacion(cuando, ahora);
  if (!fecha || Number.isNaN(fecha.getTime())) return null;
  const faltan = fecha.getTime() - ahora.getTime();
  if (faltan <= 0) return null;

  const hora = `${fecha.getHours()}:${String(fecha.getMinutes()).padStart(2, "0")}`;
  const min = Math.round(faltan / 60000);
  if (min < 60) return { clave: "en {n} min", valor: String(Math.max(1, min)) };
  if (min < 6 * 60) return { clave: "en {n} h", valor: String(Math.round(min / 60)) };

  const dia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const suyo = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const dias = Math.round((suyo.getTime() - dia.getTime()) / 86_400_000);
  if (dias === 0) return { clave: "hoy a las {hora}", valor: hora };
  if (dias === 1) return { clave: "mañana a las {hora}", valor: hora };
  return { clave: "el {fecha}", valor: "", fecha };
}


/** Las piezas de «hace un rato», para que las traduzca quien las pinta. */
export interface Antiguedad {
  clave: "ahora mismo" | "hace {n} min" | "hace {n} h" | "hace {n} d";
  valor: string;
}

/** Cuánto hace que se leyó algo. En español fijo estaba, y era lo único de
    este panel que se veía en español con la ventana en inglés. */
export function hace(desde: number, ahora: number = Date.now()): Antiguedad {
  const min = Math.round((ahora - desde) / 60000);
  if (min < 1) return { clave: "ahora mismo", valor: "" };
  if (min < 60) return { clave: "hace {n} min", valor: String(min) };
  const h = Math.round(min / 60);
  if (h < 24) return { clave: "hace {n} h", valor: String(h) };
  return { clave: "hace {n} d", valor: String(Math.round(h / 24)) };
}
