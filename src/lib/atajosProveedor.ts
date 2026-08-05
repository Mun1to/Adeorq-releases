// Qué botones de "abrir sesión aquí" aparecen en cada proyecto.
//
// La fila de un proyecto tenía cuatro botones fijos escritos a mano: abrir
// todas, Claude, PowerShell y Antigravity. Y esa lista no era la de nadie: la
// terminal pelada casi nunca es lo que quieres abrir sobre un proyecto —para
// eso está el clic derecho, que la sigue teniendo— y en cambio los CLIs que
// Munir sí usa (Codex, Cursor, Gemini) no estaban. Ahora la lista la eliges tú
// en Cuentas, que es donde ya vive todo lo que tiene que ver con con qué
// trabajas (Munir, 2026-07-29).
//
// Va en localStorage y NO en el archivo de estado de la barra lateral a
// propósito: ese archivo lo escribe la barra entera cada vez que cambia algo
// suyo, y meter aquí un segundo escritor desde Cuentas es exactamente cómo se
// pierden ajustes, uno pisando al otro. Es la misma razón por la que las
// cuentas tampoco viven allí.

export const ATAJOS_PROV_KEY = "adeorq-atajos-proveedor";

/** Cuando nadie ha elegido: los dos que Munir usa a diario. */
const DE_FABRICA = ["claude", "agy"];

/** Se avisa por aquí para que la barra lateral se entere en el momento, sin
    tener que reiniciar ni volver a entrar en la pestaña. */
export const ATAJOS_PROV_EVENTO = "adeorq:atajos-proveedor";

export function leerAtajosProv(): string[] {
  try {
    const raw = localStorage.getItem(ATAJOS_PROV_KEY);
    if (raw === null) return DE_FABRICA;
    const v = JSON.parse(raw) as unknown;
    // Una lista vacía es una elección válida —no querer ningún botón— y por
    // eso se distingue de "todavía no ha elegido", que es el null de arriba.
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : DE_FABRICA;
  } catch {
    return DE_FABRICA;
  }
}

export function guardarAtajosProv(ids: string[]): void {
  localStorage.setItem(ATAJOS_PROV_KEY, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent(ATAJOS_PROV_EVENTO));
}
