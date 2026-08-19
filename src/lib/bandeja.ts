// La bandeja de la Agenda es UNA, y quien escribe en ella son varios.
//
// El vigía mira las cuadrillas, el copiloto mira las sesiones, y los agentes
// dejan lo suyo por la regla R. Los tres van al mismo sitio, y ese sitio solo
// sirve mientras se pueda mirar de un vistazo: una bandeja de treinta líneas
// deja de mirarse, que es exactamente el fallo que todos ellos intentan evitar.
//
// POR QUÉ EXISTE ESTE ARCHIVO. El vigía y el copiloto ya tenían cada uno su
// enfriamiento «global», y el comentario del copiloto decía con todas las
// letras que los dos comparten bandeja «así que si cada uno llevara su propio
// enfriamiento, entre los dos podrían soltar diez líneas seguidas». Pues eso es
// justo lo que hacían: cada uno guardaba su marca en SU clave de
// `localStorage`, así que el global de uno no veía nada del otro. Lo encontró
// la revisión del 2026-08-19 leyendo el código, no una prueba: las dos
// funciones son puras y cada una cumplía su contrato; el fallo estaba en que se
// les daba una foto distinta del mismo dato.
//
// Aquí vive esa marca, y solo esa. No es un registro de lo dicho —cada uno
// sigue llevando el suyo, porque «no repetir lo mismo» sí es cosa de cada uno—
// sino la respuesta a una sola pregunta: cuándo se escribió la última línea en
// la bandeja, la escribiera quien la escribiera.

const CLAVE = "adeorq-bandeja-ultima";

/** Cuándo se dejó la última línea, sea de quien sea. Cero si nunca. */
export function ultimoAviso(): number {
  const v = Number(localStorage.getItem(CLAVE) ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/**
 * Apunta que se acaba de escribir una.
 *
 * Se llama DESPUÉS de escribir de verdad, igual que las memorias de cada uno:
 * si la escritura falla, ese hueco no se ha gastado.
 */
export function apuntarAviso(cuando: number): void {
  try {
    // Nunca hacia atrás: dos sondeos pueden solaparse y el que termine el
    // segundo podría traer una marca más vieja que la que ya hay puesta.
    if (cuando > ultimoAviso()) localStorage.setItem(CLAVE, String(cuando));
  } catch {
    // Sin almacenamiento, los dos vigilantes vuelven a llevar su enfriamiento
    // por separado. Es su comportamiento de antes: molesta, no rompe.
  }
}
