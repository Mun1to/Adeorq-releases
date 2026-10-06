// El color de cada proyecto EN EL LIENZO.
//
// El color de la casa (`hueOf`, en `colors.ts`) vive a propósito dentro de la
// familia del azul, para que la barra y los chips se lean como un solo sistema
// y no como un arcoíris. En el lienzo eso no sirve: ahí el color es para
// distinguir de lejos las terminales de un proyecto de las de otro, y medido
// con los 31 proyectos de Munir (2026-10-06) el tono iba de 189° a 264° y 22
// de cada 30 vecinos quedaban a tres grados o menos (Vidorq 195, Adeorq 196,
// MarcaPersonal, Vibeset y hotkeyconfig 197): cinco proyectos, un solo azul.
//
// Aquí cada proyecto tiene un sitio preferido entre diez tonos bien separados,
// y entre los proyectos que hay en el lienzo NUNCA se repite uno mientras
// quepan: si dos prefieren el mismo, el segundo por orden alfabético se corre
// al siguiente libre. Casi siempre cada proyecto lleva su tono preferido, así
// que el color es estable de un lienzo a otro; solo cambia si entra otro
// proyecto que choca con él y va antes en el alfabeto.

/** Los tonos que en la casa ya significan algo: «turno terminado» (`--done`,
 *  29°), «te pregunta» (`--ask`, 39°), aviso (`--warn`, 42°) y «te espera»
 *  (`--wait`, 356°). Un proyecto no puede ir de ninguno de ellos: una terminal
 *  con el marco naranja se leería como una que reclama. */
export const TONOS_DE_ESTADO: readonly number[] = [29, 39, 42, 356];

/** Diez tonos de 75° a 325°, a unos 28° unos de otros: toda la rueda menos el
 *  tramo del rojo al amarillo, que es el de los estados de arriba. El orden da
 *  igual, cada proyecto cae en uno por su nombre; el primero es el azul de la
 *  casa. */
export const TONOS: readonly number[] = [214, 75, 158, 297, 103, 325, 186, 242, 131, 269];

const sitioDe = (nombre: string): number => {
  let h = 0;
  for (const ch of nombre.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return h % TONOS.length;
};

const color = (tono: number): string => `hsl(${tono} 78% 64%)`;

/**
 * El color de cada proyecto, dados los que hay en el lienzo. Sin repetidos
 * mientras sean diez o menos; con más, se vuelve a empezar la rueda.
 */
export function coloresDeProyectos(proyectos: readonly string[]): Record<string, string> {
  const unicos = [...new Set(proyectos.filter(Boolean))].sort((a, b) =>
    a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : a < b ? -1 : 1,
  );
  const ocupados = new Set<number>();
  const salida: Record<string, string> = {};
  for (const p of unicos) {
    if (ocupados.size === TONOS.length) ocupados.clear();
    let i = sitioDe(p);
    while (ocupados.has(i)) i = (i + 1) % TONOS.length;
    ocupados.add(i);
    salida[p] = color(TONOS[i]);
  }
  return salida;
}

/** El tono (en grados) de un color de los de arriba, para el banco. */
export function tonoDe(c: string): number {
  return Number(/hsl\((\d+)/.exec(c)?.[1] ?? NaN);
}
