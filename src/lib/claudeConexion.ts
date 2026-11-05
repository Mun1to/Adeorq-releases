// Conectar tu Claude Code a las herramientas de Adeorq, del lado de la ventana. Lo que se
// escribe y cómo se comprueba está en Rust (`claude_conexion.rs`); esto solo lo pide y
// dice, en palabras de quien acaba de instalar, cómo está cada cuenta.

import { invoke } from "@tauri-apps/api/core";

export type EstadoDeClaude = "libre" | "conectado" | "ajena" | "noentendido";

export interface CuentaDeClaude {
  /** `principal`, o el nombre de la carpeta de la cuenta. */
  id: string;
  /** La carpeta de la cuenta; vacía en la principal. */
  carpeta: string;
  /** El archivo que se toca. */
  archivo: string;
  existe: boolean;
  estado: EstadoDeClaude;
  /** Conectado: a dónde apunta, si no es al sitio de siempre. Ajena y noentendido: por qué. */
  detalle: string | null;
}

export interface PlanDeClaude {
  cuentas: CuentaDeClaude[];
  /** El comando que se apunta, tal como lo lanzará Claude Code. */
  comando: string;
  /** Claude Code está en este equipo. */
  instalado: boolean;
}

export interface ResultadoDeClaude {
  plan: PlanDeClaude;
  /** Dónde quedó el archivo de antes. */
  copia: string | null;
}

export const claudeConexiones = () => invoke<PlanDeClaude>("claude_conexiones");
export const claudeConectar = (cuenta: string) => invoke<ResultadoDeClaude>("claude_conectar", { cuenta });
export const claudeDesconectar = (cuenta: string) => invoke<ResultadoDeClaude>("claude_desconectar", { cuenta });
