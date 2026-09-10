/* Lo que un panel sabe de sí mismo, para cuando se cae.
 *
 * El 2026-09-10 (y ya el 3 de septiembre) la interfaz entera se vino abajo
 * con `Cannot set properties of undefined (setting 'isWrapped')` en el
 * `lineFeed` de xterm: el búfer tenía menos líneas de las que su propia
 * cuenta prometía y una escritura pisó una que no existía. El rastro decía
 * DÓNDE (`TerminalPane`) pero no CÓMO estaba el búfer, y sin eso no hay por
 * dónde empezar a buscar el porqué.
 *
 * Aquí cada terminal deja una función que describe su estado en ese momento
 * (rejilla, búfer activo, base, cursor, cuántas líneas hay de verdad), y el
 * resguardo del panel la llama al caer para meterla en el rastro. Es un
 * registro sin React para que el resguardo, que es una clase, pueda leerlo
 * sin hooks, y para que un test lo pueda rellenar a mano. */

const fuentes = new Map<number, () => string>();

/** Deja apuntado cómo describir el panel `id`. Devuelve cómo borrarlo. */
export function apuntarDiagnostico(id: number, describir: () => string): () => void {
  fuentes.set(id, describir);
  return () => {
    if (fuentes.get(id) === describir) fuentes.delete(id);
  };
}

/** El estado del panel `id` ahora mismo, o por qué no se sabe. */
export function describirPanel(id: number): string {
  const f = fuentes.get(id);
  if (!f) return "sin diagnóstico";
  try {
    return f();
  } catch (e) {
    // Si el propio diagnóstico revienta es que el búfer está peor de lo que
    // parece, y eso también es un dato.
    return `el diagnóstico revienta: ${e instanceof Error ? e.message : String(e)}`;
  }
}
