// La barra de título de la ventana en un Mac sigue el tema de Adeorq.
//
// macOS pinta esa barra con el modo claro u oscuro del SISTEMA, no con el de
// dentro de la app: con el Mac en claro y Adeorq en un tema oscuro salía una
// barra blanca sobre un cristal negro. Se le dice a la ventana qué modo es el
// suyo. Solo en un Mac: en Windows y en Linux la barra se queda como siempre.
import { ES_MAC } from "./comandos";
import { THEMES, type ThemeId } from "./i18n";

/** Si el tema es de fondo claro: los de la familia «claro» y nada más (los
    temas de fuera claros se rechazan al importarlos, `temasDeFuera.ts`). */
export function temaEsClaro(tema: string): boolean {
  return THEMES.some((t) => t.id === tema && t.familia === "claro");
}

/** El modo que se le pide a la ventana nativa para un tema. */
export const modoDeLaBarra = (tema: ThemeId | string): "light" | "dark" =>
  temaEsClaro(tema) ? "light" : "dark";

/** Pone la barra de la ventana en el modo del tema. No hace nada fuera de un Mac. */
export async function ponerBarraDelTema(tema: ThemeId | string): Promise<void> {
  if (!ES_MAC) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setTheme(modoDeLaBarra(tema));
  } catch {
    // Sin ventana de Tauri (el navegador de las capturas) o sin permiso: la barra se queda como estaba.
  }
}
