// Cuántas sesiones abre de golpe un proyecto (el botón de abrir todas, y
// «Cuántas a la vez» al crear una sesión nueva).
//
// Cada sesión es un agente entero (unos 500 MB con su envoltorio, medido el
// 2026-11-25), así que el tope es de memoria, no de corrección. Era un número
// fijo, 12, subido de 6 en el equipo de 32 GB de Munir. Desde el 2026-11-25
// (decisión d1a213cb2ce0, «Los dos») va de fábrica por la memoria libre del
// equipo, con la misma cuenta que el tope de las que abren los agentes
// (`src-tauri/src/cabida.rs`): abre las que quepan, y el número de Ajustes pasa
// a ser «como mucho». Lo pediste tú, así que una se abre siempre.

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState, useSyncExternalStore } from "react";

export const MAX_OPEN_ALL = 12;
export const MIN_ABRIR = 2;
export const MAX_ABRIR = 20;

const CLAVE = "adeorq-open-all";
const CLAVE_MEMORIA = "adeorq-open-all-memoria";
const EVENTO = "adeorq-open-all-memoria";

/** El número de Ajustes: el tope fijo, o el «como mucho» si va por la memoria. */
export function leerTopeAbrir(): number {
  try {
    return Number(localStorage.getItem(CLAVE)) || MAX_OPEN_ALL;
  } catch {
    return MAX_OPEN_ALL;
  }
}

export function guardarTopeAbrir(n: number): void {
  try {
    localStorage.setItem(CLAVE, String(n));
  } catch {
    // Sin almacén vale para esta sesión: el número ya está en el estado.
  }
}

/** Si abre según la memoria libre. De fábrica, sí. */
export function abrirPorMemoria(): boolean {
  try {
    return localStorage.getItem(CLAVE_MEMORIA) !== "0";
  } catch {
    return true;
  }
}

export function ponerAbrirPorMemoria(v: boolean): void {
  try {
    if (v) localStorage.removeItem(CLAVE_MEMORIA);
    else localStorage.setItem(CLAVE_MEMORIA, "0");
  } catch {
    // Sin almacén vale para esta sesión, por el evento.
  }
  window.dispatchEvent(new Event(EVENTO));
}

function suscribir(avisar: () => void): () => void {
  const deOtraVentana = (e: StorageEvent) => {
    if (e.key === CLAVE_MEMORIA || e.key === null) avisar();
  };
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", deOtraVentana);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", deOtraVentana);
  };
}

export function useAbrirPorMemoria(): boolean {
  return useSyncExternalStore(suscribir, abrirPorMemoria, () => true);
}

/** La cuenta de Rust (`cabida.rs`), en megas. */
export interface Cabida {
  totalMb: number;
  libreMb: number;
  reservaMb: number;
  porTerminalMb: number;
  /** Cuántas terminales más caben sin bajar de la reserva. */
  caben: number;
}

/** La cuenta de ahora, o `null` si el sistema no dijo cuánta memoria tiene. */
export async function pedirCabida(): Promise<Cabida | null> {
  try {
    return (await invoke<Cabida | null>("cabida")) ?? null;
  } catch {
    return null;
  }
}

/** Cuántas de `pedidas` se abren: nunca más de `tope`, y por la memoria solo
 *  las que caben, pero al menos una. Sin dato de la memoria, el número. */
export function cuantasAbrir(pedidas: number, tope: number, porMemoria: boolean, c: Cabida | null): number {
  const n = Math.max(1, Math.min(pedidas, tope));
  if (!porMemoria || !c) return n;
  return Math.max(1, Math.min(n, c.caben));
}

/** Lo mismo, preguntando la memoria en el momento de abrir. */
export async function cuantasAbrirAhora(pedidas: number, tope: number): Promise<number> {
  const porMemoria = abrirPorMemoria();
  return cuantasAbrir(pedidas, tope, porMemoria, porMemoria ? await pedirCabida() : null);
}

/** El máximo para elegir «Cuántas a la vez» en una sesión nueva: el número, o
 *  por la memoria las que caben ahora, medido al abrir la ventana. */
export function useTopeAbrir(tope: number): number {
  const porMemoria = useAbrirPorMemoria();
  const [c, setC] = useState<Cabida | null>(null);
  useEffect(() => {
    if (!porMemoria) return;
    let vivo = true;
    void pedirCabida().then((r) => {
      if (vivo) setC(r);
    });
    return () => {
      vivo = false;
    };
  }, [porMemoria]);
  return cuantasAbrir(tope, tope, porMemoria, c);
}
