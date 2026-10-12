// Abrir un archivo en una línea concreta: lo que hace «Buscar en los
// archivos» de la paleta al elegir un sitio.
//
// Quien elige (la paleta) y quien enseña (el editor, `EditorPane`) no tienen
// nada en común por donde pasar una prop, así que la línea se deja apuntada
// aquí, como el volcado de una terminal que renace (`lib/mudanza.ts`). Si el
// editor de ese archivo ya estaba abierto, se le avisa además con un evento,
// porque no va a volver a cargar nada.

export const EVENTO_IR_A_LINEA = "adeorq:ir-a-linea";

const pendientes = new Map<string, number>();
const clave = (ruta: string) => ruta.replace(/\//g, "\\").toLowerCase();

/** Apunta que ese archivo se abra en esa línea, y se lo dice al editor que ya lo tenga abierto. */
export function abrirEnLinea(ruta: string, linea: number): void {
  pendientes.set(clave(ruta), linea);
  window.dispatchEvent(new CustomEvent(EVENTO_IR_A_LINEA, { detail: { ruta, linea } }));
}

/** La recoge (de un solo uso), o `null` si no había ninguna apuntada. */
export function tomarLinea(ruta: string): number | null {
  const k = clave(ruta);
  const l = pendientes.get(k) ?? null;
  pendientes.delete(k);
  return l;
}

/** ¿Es el mismo archivo? Sin distinguir barras ni mayúsculas, como Windows. */
export const mismoArchivo = (a: string, b: string) => clave(a) === clave(b);
