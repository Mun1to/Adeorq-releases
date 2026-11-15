// Las cajas desde la ventana: qué se puede elegir y cómo se pide.
//
// Una terminal nace en una caja con una marca en su entorno, `ADEORQ_CAJA`, que
// Rust convierte en un `docker run` al abrirla (`src-tauri/src/caja.rs`). El
// plano, con lo que ve una caja y lo que no: `docs/contexto/cajas.md`.

import { invoke } from "@tauri-apps/api/core";

export const VARIABLE_CAJA = "ADEORQ_CAJA";

export type Caja = "docker:ubuntu" | "docker:fedora" | "docker:debian";

export const CAJAS: Array<{ id: Caja; nombre: string }> = [
  { id: "docker:ubuntu", nombre: "Ubuntu" },
  { id: "docker:fedora", nombre: "Fedora" },
  { id: "docker:debian", nombre: "Debian" },
];

/** Lo que corre dentro de una caja: un Linux no tiene los programas de Windows,
 *  y la imagen de las cajas trae estos tres CLI (`CLIS_DE_LA_IMAGEN` en Rust). */
const DENTRO = new Set(["shell", "claude", "codex", "gemini"]);

export function cabeEnCaja(provider: string): boolean {
  return DENTRO.has(provider);
}

/** Si hay Docker en este equipo (aunque esté parado: se enciende al pedirla). */
export function cajasDisponibles(): Promise<boolean> {
  return invoke<boolean>("cajas_disponibles").catch(() => false);
}

/** El entorno que pide la caja, para el `envOverride` de `addPane`. */
export function entornoDeCaja(caja: string | undefined): Record<string, string> | undefined {
  return caja ? { [VARIABLE_CAJA]: caja } : undefined;
}

export function nombreDeCaja(caja: string | undefined): string | undefined {
  return CAJAS.find((c) => c.id === caja)?.nombre;
}
