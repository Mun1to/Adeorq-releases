import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";

// Si esta Adeorq corre desde el paquete de la Microsoft Store (`packaged.rs`,
// `docs/contexto/tiendas.md`). Allí el actualizador propio no existe: baja un
// instalador de GitHub y lo ejecuta, cosa que la política de la Tienda prohíbe, y
// la Tienda ya actualiza sola. Se pregunta una vez; si la pregunta falla (el
// front suelto en un navegador, sin Tauri), la respuesta es la de siempre: no.
let respuesta: Promise<boolean> | null = null;

export function enLaTienda(): Promise<boolean> {
  respuesta ??= invoke<boolean>("esta_empaquetada").catch(() => false);
  return respuesta;
}

/** `check()` del actualizador, salvo en la Tienda, donde no hay nada que buscar. */
export async function buscarActualizacion(): Promise<Awaited<ReturnType<typeof check>>> {
  if (await enLaTienda()) return null;
  return check();
}
