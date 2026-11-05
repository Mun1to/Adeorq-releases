import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";

// Si esta Adeorq corre desde el paquete de la Microsoft Store (`packaged.rs`,
// `docs/contexto/tiendas.md`). Allí el actualizador propio no existe: baja un
// instalador de GitHub y lo ejecuta, cosa que la política de la Tienda prohíbe, y
// la Tienda ya actualiza sola. Se pregunta una vez; si la pregunta falla (el
// front suelto en un navegador, sin Tauri), la respuesta es la de siempre: no.
let respuesta: Promise<boolean> | null = null;
/** Lo que ya contestó Rust, para quien pinta y no puede esperar un instante:
 *  una pantalla que nace con «Descargar» y se corrige a los pocos milisegundos
 *  deja el botón de un instalador al alcance de un clic. `false` hasta saberlo. */
let sabida = false;

export function enLaTienda(): Promise<boolean> {
  respuesta ??= invoke<boolean>("esta_empaquetada").then(
    (v) => (sabida = v),
    () => false,
  );
  return respuesta;
}

/** Lo que ya se sabe de `enLaTienda()`, sin esperar. */
export const yaEnLaTienda = (): boolean => sabida;

// Se pregunta nada más cargar el módulo, que es al arrancar la app: cuando alguien
// llega a una pantalla que lo necesita (Cuentas), la respuesta ya está.
void enLaTienda();

/** `check()` del actualizador, salvo en la Tienda, donde no hay nada que buscar. */
export async function buscarActualizacion(): Promise<Awaited<ReturnType<typeof check>>> {
  if (await enLaTienda()) return null;
  return check();
}
