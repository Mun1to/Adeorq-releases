// Qué sesiones has MIRADO ya desde la última vez que cambiaron.
//
// La idea es de herdr (MEJORAS, «Relleno o hueco según si ya lo has mirado»):
// el estado por dentro es el mismo, lo único que cambia es tu atención. El
// círculo de la barra va relleno si el agente terminó o te preguntó y no lo
// has visto, y hueco si ya pasaste por ahí. Con seis terminales resuelve
// gratis el «¿cuál me faltaba por mirar?».
//
// Se apunta cuándo miraste cada sesión (al retomarla desde la barra o al
// darle el foco a su panel) y se compara con `mtime`, el instante en que su
// transcript cambió por última vez. Vive en localStorage: es tu atención, no
// un dato de la sesión, y no tiene que viajar a ningún sitio.

const CLAVE = "adeorq-vistos";
const TOPE = 400;

function leer(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Acabas de mirar esta sesión. */
export function marcarVisto(id: string): void {
  if (!id) return;
  const todos = leer();
  todos[id] = Date.now();
  // Que no crezca sin techo: fuera lo más viejo.
  const claves = Object.keys(todos);
  if (claves.length > TOPE) {
    claves
      .sort((a, b) => todos[a] - todos[b])
      .slice(0, claves.length - TOPE)
      .forEach((k) => delete todos[k]);
  }
  try {
    localStorage.setItem(CLAVE, JSON.stringify(todos));
  } catch {
    /* sin sitio: se pierde la marca, no la sesión */
  }
  window.dispatchEvent(new Event(CAMBIO_VISTOS));
}

/** Si lo último de esta sesión (que cambió en `mtime`, en segundos) ya lo viste. */
export function yaVisto(id: string, mtime: number | undefined): boolean {
  if (!mtime) return false;
  const cuando = leer()[id];
  return typeof cuando === "number" && cuando >= mtime * 1000;
}

/** Salta cuando se apunta una mirada: la barra se repinta con el hueco. */
export const CAMBIO_VISTOS = "adeorq-vistos-cambio";
