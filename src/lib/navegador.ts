// El puente con `src-tauri/src/navegador.rs`.
//
// Aquí vivían también los envoltorios del modo «tu navegador» (una ventana de
// Chromium metida en el panel). Desde el 2026-08-29 la web se pinta siempre
// dentro del panel y nadie los llamaba; los comandos de Rust siguen ahí.

import { invoke } from "@tauri-apps/api/core";

/**
 * ¿Hay alguien escuchando en ese puerto de esta máquina?
 *
 * La usa la apertura automática de la web: encontrar `http://localhost:3000` en
 * la salida de una terminal no significa que ahí haya un servidor, y sin esta
 * pregunta la app abriría una pestaña cada vez que un agente escribe esa
 * dirección en una frase. Rust prueba IPv4 e IPv6, con un plazo de 250 ms.
 */
export function puertoEscucha(puerto: number): Promise<boolean> {
  return invoke("puerto_escucha", { puerto });
}
