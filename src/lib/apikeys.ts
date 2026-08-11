// Abrir un CLI con tu clave de API en vez de con tu login.
//
// Son dos formas de pagar lo mismo, y por eso se elige a mano y no se adivina:
// con tu suscripción no puedes pasarte, pagas igual hables mucho o poco; con
// clave se factura por tokens, y una tarde de pruebas es una factura.
//
// La clave NUNCA pasa por aquí. Ni al guardarla vuelve, ni al abrir la terminal
// se pide: lo que viaja es el MARCADOR `@secreto:api:<proveedor>`, y quien lo
// cambia por la clave de verdad es Rust, justo antes de crear el proceso (ver
// pty.rs y apikeys.rs). Así no aparece en el estado de React, ni en un log, ni
// en una captura de pantalla.

import { invoke } from "@tauri-apps/api/core";
import { providerOf } from "./providers";

export interface EstadoClave {
  proveedor: string;
  /** Los cuatro últimos caracteres: para saber CUÁL pusiste, no para usarla. */
  cola: string;
}

export function apiKeyPut(proveedor: string, clave: string): Promise<void> {
  return invoke("api_key_put", { proveedor, clave });
}

export function apiKeyForget(proveedor: string): Promise<void> {
  return invoke("api_key_forget", { proveedor });
}

export function apiKeysEstado(proveedores: string[]): Promise<EstadoClave[]> {
  return invoke("api_keys_estado", { proveedores });
}

/**
 * Dónde acaban las claves en ESTE sistema, para poder decirlo sin mentir.
 *
 * En Windows van al Gestor de Credenciales, cifradas con tu login. En Linux no
 * hay tal cosa: es un archivo con permisos `600`, que protege de otros usuarios
 * de la máquina pero no de otro programa tuyo. La pantalla prometía lo primero
 * en los dos sitios, y esa promesa hay que cumplirla o no hacerla.
 */
export type DondeSecretos = "credenciales" | "archivo";

export function secretosDonde(): Promise<DondeSecretos> {
  return invoke<DondeSecretos>("secretos_donde").catch(() => "archivo" as const);
}

/** Qué proveedores abren con clave en vez de con la suscripción. */
export const MODO_API_KEY = "adeorq-modo-api";

export const MODO_API_EVENTO = "adeorq:modo-api";

export function leerModoApi(): string[] {
  try {
    const raw = localStorage.getItem(MODO_API_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function guardarModoApi(ids: string[]): void {
  localStorage.setItem(MODO_API_KEY, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent(MODO_API_EVENTO));
}

/**
 * El entorno con el que nace una terminal de este proveedor, o undefined si va
 * con tu suscripción, que es lo normal.
 *
 * Devuelve el marcador y no la clave: ver la cabecera de este archivo.
 */
export function entornoDe(proveedor: string): Record<string, string> | undefined {
  if (!leerModoApi().includes(proveedor)) return undefined;
  const v = providerOf(proveedor).apiEnv;
  if (!v) return undefined;
  return { [v]: `@secreto:api:${proveedor}` };
}
