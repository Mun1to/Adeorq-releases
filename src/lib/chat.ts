// El chat por API, visto desde el front. Todo pasa por Rust: ver chat.rs.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface Mensaje {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface Uso {
  entrada: number;
  salida: number;
  /** En dólares, tal como lo dice OpenRouter. */
  coste: number;
}

export interface Modelo {
  id: string;
  nombre: string;
  entrada_millon: number;
  salida_millon: number;
  contexto: number;
}

export interface Gasto {
  total: number;
  dias: Record<string, number>;
}

export function chatModelos(): Promise<Modelo[]> {
  return invoke("chat_modelos");
}

/**
 * Manda la conversación. El texto NO vuelve por aquí: llega por el evento
 * `chat:<canal>` según lo escribe el modelo, y `alTexto` lo recibe trozo a
 * trozo. Lo que devuelve la promesa es lo que ha costado.
 */
export async function chatEnviar(
  canal: string,
  modelo: string,
  mensajes: Mensaje[],
  alTexto: (trozo: string) => void,
): Promise<Uso> {
  // La escucha se monta ANTES de llamar: si se montara después, los primeros
  // trozos de una respuesta rápida llegarían antes que el oyente y se perderían.
  const off = await listen<string>(`chat:${canal}`, (e) => alTexto(e.payload));
  try {
    return await invoke<Uso>("chat_enviar", { canal, modelo, mensajes });
  } finally {
    off();
  }
}

export function gastoLeer(): Promise<Gasto> {
  return invoke("gasto_leer");
}

export function chatLeer(id: string): Promise<Mensaje[]> {
  return invoke("chat_leer", { id });
}

export function chatGuardar(id: string, mensajes: Mensaje[]): Promise<void> {
  return invoke("chat_guardar", { id, mensajes });
}

export function chatOlvidar(id: string): Promise<void> {
  return invoke("chat_olvidar", { id });
}

/** «0,0021 $». Los chats cuestan céntimos, así que dos decimales no bastan. */
export function comoDinero(d: number): string {
  if (d <= 0) return "0 $";
  if (d < 0.01) return `${d.toFixed(4).replace(".", ",")} $`;
  return `${d.toFixed(2).replace(".", ",")} $`;
}
