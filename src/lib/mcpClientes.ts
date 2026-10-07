// Qué puede hacer cada cliente por el MCP (decisión D1 de Munir, 2026-10-07):
// lo que Ajustes enseña y cambia. La puerta de verdad y la tabla de escalones
// viven en `src-tauri/src/mcp_clientes.rs`; aquí solo se habla con ella.

import { invoke } from "@tauri-apps/api/core";
import type { ModoCapataz } from "./manos";

export interface ClienteMcp {
  /** Tal como se presentó en su `initialize` («codex-cli», «gemini-cli»…). */
  nombre: string;
  version: string;
  /** Epoch en segundos; 0 si Munir lo puso a mano y nunca se conectó. */
  ultima_vez: number;
  veces: number;
  nivel: ModoCapataz;
  /** Si el escalón es el de fábrica (nadie lo eligió). */
  fabrica: boolean;
}

export const mcpClientesLeer = () => invoke<ClienteMcp[]>("mcp_clientes_leer");
/** Sin `nivel`, vuelve al de fábrica. */
export const mcpClientesPoner = (nombre: string, nivel: ModoCapataz | null) =>
  invoke<ClienteMcp[]>("mcp_clientes_poner", { nombre, nivel });
