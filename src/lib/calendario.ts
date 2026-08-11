// La rejilla de un mes.
//
// Munir, 2026-08-11: «me gustaría que en el menú principal haya literalmente un
// calendario». Literalmente es la palabra: una rejilla de días, no una lista de
// fechas ordenada, que es lo que la Agenda tenía y por lo que no se entendía de
// un vistazo cuándo cae cada cosa.
//
// Un calendario parece trivial hasta que se escribe. Las trampas, todas
// resueltas y probadas aquí (`scripts/calendario-check.ts`):
//
//   · La semana empieza en LUNES, que es como se cuenta aquí. `getDay()` de
//     JavaScript cuenta desde el domingo, así que hay que rotar.
//   · Un mes ocupa cuatro, cinco o seis filas según en qué día caiga el 1. Si
//     la rejilla se fija a cinco, febrero baila y octubre pierde días.
//   · Las fechas se manejan como texto "AAAA-MM-DD" y no como `Date`. Un `Date`
//     lleva hora y zona dentro, y comparar dos con `===` no funciona nunca; el
//     texto se compara solo, que es justo lo que hace falta.
//   · El cambio de hora. Sumar 86.400.000 milisegundos para pasar al día
//     siguiente falla dos noches al año, cuando el día dura 23 o 25 horas.
//     Aquí se avanza por número de día, que es lo que sí es exacto.

/** Un día de la rejilla. `delMes` es falso en los que rellenan los bordes. */
export interface Dia {
  /** "AAAA-MM-DD". */
  fecha: string;
  /** El número que se pinta. */
  numero: number;
  /** Si pertenece al mes que se está mirando o es relleno de los bordes. */
  delMes: boolean;
}

const dosCifras = (n: number) => String(n).padStart(2, "0");

/** "AAAA-MM-DD" de un año, mes (1-12) y día. */
export function comoFecha(anio: number, mes: number, dia: number): string {
  return `${anio}-${dosCifras(mes)}-${dosCifras(dia)}`;
}

/** El mes ("AAAA-MM") al que pertenece una fecha. */
export function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

/** Cuántos días tiene ese mes, bisiestos incluidos (lo sabe `Date` solo). */
export function diasDelMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

/**
 * En qué columna cae el día 1, contando el lunes como cero.
 *
 * `getDay()` devuelve 0 para el domingo, y aquí la semana empieza en lunes:
 * sin esta rotación, todos los meses salen corridos un día.
 */
export function columnaDelUno(anio: number, mes: number): number {
  return (new Date(anio, mes - 1, 1).getDay() + 6) % 7;
}

/**
 * La rejilla entera, semanas completas de siete días.
 *
 * Se rellenan los bordes con los días del mes de al lado en vez de dejar
 * huecos: una casilla vacía al principio se lee como un día sin nada, y no lo
 * es, es otro mes. Van marcados con `delMes: false` para poder apagarlos.
 */
export function rejillaDelMes(anio: number, mes: number): Dia[] {
  const salida: Dia[] = [];
  const antes = columnaDelUno(anio, mes);
  const total = diasDelMes(anio, mes);

  // La cola del mes anterior.
  const mesAntes = mes === 1 ? 12 : mes - 1;
  const anioAntes = mes === 1 ? anio - 1 : anio;
  const totalAntes = diasDelMes(anioAntes, mesAntes);
  for (let i = antes - 1; i >= 0; i--) {
    const d = totalAntes - i;
    salida.push({ fecha: comoFecha(anioAntes, mesAntes, d), numero: d, delMes: false });
  }

  for (let d = 1; d <= total; d++) {
    salida.push({ fecha: comoFecha(anio, mes, d), numero: d, delMes: true });
  }

  // Y la cabeza del siguiente, hasta cerrar la última semana.
  const mesDespues = mes === 12 ? 1 : mes + 1;
  const anioDespues = mes === 12 ? anio + 1 : anio;
  let d = 1;
  while (salida.length % 7 !== 0) {
    salida.push({ fecha: comoFecha(anioDespues, mesDespues, d), numero: d, delMes: false });
    d++;
  }
  return salida;
}

/**
 * El mes de al lado, para las flechas.
 *
 * Con `paso` de 1 o -1. Se hace con números y no con `Date` para no arrastrar
 * la trampa de siempre: `new Date(2026, 0, 31)` más un mes da el 3 de marzo,
 * porque el 31 de febrero no existe y JavaScript lo desborda en silencio.
 */
export function mesVecino(anio: number, mes: number, paso: number): { anio: number; mes: number } {
  const total = anio * 12 + (mes - 1) + paso;
  return { anio: Math.floor(total / 12), mes: (total % 12) + 1 };
}
