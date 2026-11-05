// Qué puede hacer cada cliente por el MCP (decisiones D1 y B1 de Munir): lo que
// Ajustes enseña y cambia. La puerta de verdad y la tabla de escalones viven en
// `src-tauri/src/mcp_clientes.rs`; aquí solo se habla con ella.

import { invoke } from "@tauri-apps/api/core";
import type { ModoCapataz } from "./manos";

/** La fila de lo que llega sin la contraseña de una terminal de Adeorq. */
export const FUERA = "fuera";

/** Los escalones del MCP: los del Capataz, y `lista`, solo para la fila `FUERA`. */
export type NivelMcp = ModoCapataz | "lista";

export interface ClienteMcp {
  /** El programa, con el id de `lib/providers.ts` («claude», «codex»…), o
   *  `FUERA`. Uno que no está en la lista va con el nombre con que se presentó. */
  nombre: string;
  version: string;
  /** Epoch en segundos; 0 si Munir lo puso a mano y nunca se conectó. */
  ultima_vez: number;
  veces: number;
  nivel: NivelMcp;
  /** Si el escalón es el de fábrica (nadie lo eligió). */
  fabrica: boolean;
}

export const mcpClientesLeer = () => invoke<ClienteMcp[]>("mcp_clientes_leer");
/** Sin `nivel`, vuelve al de fábrica. */
export const mcpClientesPoner = (nombre: string, nivel: NivelMcp | null) =>
  invoke<ClienteMcp[]>("mcp_clientes_poner", { nombre, nivel });

/** Los pasos que ofrece una fila. La de fuera tiene los suyos, y «Solo mirar» solo sale
 *  ahí si es lo que esa persona tenía guardado. */
export function pasosDeLaFila(nombre: string, nivel: NivelMcp): NivelMcp[] {
  if (nombre !== FUERA) return ["mirar", "plan", "auto"];
  return nivel === "mirar" ? ["lista", "mirar", "plan", "auto"] : ["lista", "plan", "auto"];
}
