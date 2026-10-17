import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import type { View } from "./vistas";

// Las partes grandes de Adeorq, que se pueden apagar enteras.
//
// Munir, 2026-10-17 (A2 B1 C2): se elige al abrir Adeorq la primera vez, igual
// en Windows y en Linux, y se cambia en Ajustes; apagar una parte es apagarla
// ENTERA, no esconder su pestaña (eso ya lo hace la cabecera, `cabecera.ts`):
// no sale en la cabecera ni en la paleta, y no arranca nada suyo por detrás
// (el Lienzo no se monta ni devuelve sus terminales, la Memoria no calcula
// significados ni da sus herramientas a los agentes); y solo las grandes:
// Cabina, Lienzo, Memoria y Chat. Panel, Agenda, Decisiones, Cuentas y
// Comandos van siempre.
//
// Dos reglas que no son de adorno:
//
//  1. La Cabina y el Lienzo no se apagan a la vez: son los dos sitios donde se
//     abre una terminal, y sin ninguno Adeorq no sirve para lo que es.
//  2. Una vista de terminales apagada que todavía tiene terminales abiertas se
//     sigue viendo hasta que se cierran: apagarla de golpe las mataría, y
//     matar en silencio el trabajo de un agente es lo único que no se hace
//     (misma regla que las recuperadas de `tablero.ts`).
//
// Lo elegido vive aquí, en el front, como la cabecera; Rust guarda una copia
// (`partes.rs`) porque lo que corre sin ventana (el hilo de la memoria, las
// herramientas del MCP, el conserje) no puede leer este `localStorage`.

export type Parte = "cabina" | "lienzo" | "memoria" | "chat";

/** En el orden en que se enseñan, con lo que es cada una en pocas palabras. */
export const PARTES: Array<{ id: Parte; nombre: string; que: string }> = [
  { id: "cabina", nombre: "Cabina", que: "las terminales en mosaico" },
  { id: "lienzo", nombre: "Lienzo", que: "las terminales en un tablero libre, con notas y flechas" },
  { id: "memoria", nombre: "Memoria", que: "tus notas y lo que recuerdan tus agentes" },
  { id: "chat", nombre: "Chat", que: "tus sesiones como conversaciones, y el conserje" },
];

export const PARTES_KEY = "adeorq-partes";

const esParte = (x: unknown): x is Parte => PARTES.some((p) => p.id === x);

/** Sin repetidos ni nombres de otra versión, y nunca las dos de terminales. */
export function limpiarPartes(x: unknown): Parte[] {
  const lista = [...new Set(Array.isArray(x) ? x.filter(esParte) : [])];
  return lista.includes("cabina") && lista.includes("lienzo") ? lista.filter((p) => p !== "cabina") : lista;
}

export function leerApagadas(): Parte[] {
  try {
    return limpiarPartes(JSON.parse(localStorage.getItem(PARTES_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

/** Guarda lo elegido y le pasa la copia a Rust. */
export function guardarApagadas(apagadas: Parte[]): Parte[] {
  const limpias = limpiarPartes(apagadas);
  try {
    localStorage.setItem(PARTES_KEY, JSON.stringify(limpias));
  } catch {
    /* Sin almacén se queda para esta vez: la copia de Rust sí se guarda. */
  }
  void invoke("fijar_partes", { apagadas: limpias }).catch(() => {});
  return limpias;
}

/** Lo apagado y cómo cambiarlo, para la ventana. Al abrir, la copia de Rust
    se pone al día con lo de aquí, que es quien manda. */
export function usePartes(): [Parte[], (a: Parte[]) => void] {
  const [apagadas, setApagadas] = useState<Parte[]>(leerApagadas);
  useEffect(() => {
    guardarApagadas(leerApagadas());
  }, []);
  const cambiar = useCallback((a: Parte[]) => setApagadas(guardarApagadas(a)), []);
  return [apagadas, cambiar];
}

/** Cuántas terminales tiene abiertas cada vista, para la regla 2. */
export interface TerminalesPorVista {
  cabina: number;
  lienzo: number;
}

/** Si una parte se ve: encendida, o apagada pero con terminales que cerrar. */
export function seVe(p: Parte, apagadas: Parte[], vivas: TerminalesPorVista): boolean {
  if (!apagadas.includes(p)) return true;
  return (p === "cabina" || p === "lienzo") && vivas[p] > 0;
}

/** La pestaña a la que se va de verdad: una apagada, a la que la sustituye. */
export function vistaPosible(v: View, apagadas: Parte[], vivas: TerminalesPorVista): View {
  if (!esParte(v) || seVe(v, apagadas, vivas)) return v;
  if (v === "cabina") return "lienzo";
  if (v === "lienzo") return "cabina";
  return "panel";
}

/** Las pestañas que existen ahora, sin las de las partes apagadas. */
export function pestanasEncendidas<T extends { key: string }>(todas: T[], apagadas: Parte[], vivas: TerminalesPorVista): T[] {
  return todas.filter((t) => !esParte(t.key) || seVe(t.key, apagadas, vivas));
}

/**
 * Encender o apagar una. No deja apagar la segunda de terminales: devuelve la
 * lista tal cual y el porqué, para decirlo al lado del interruptor.
 */
export function alternarParte(apagadas: Parte[], p: Parte): { apagadas: Parte[]; porque?: string } {
  if (apagadas.includes(p)) return { apagadas: apagadas.filter((x) => x !== p) };
  const otra = p === "cabina" ? "lienzo" : p === "lienzo" ? "cabina" : null;
  if (otra && apagadas.includes(otra)) {
    return { apagadas, porque: "La Cabina y el Lienzo no se pueden apagar a la vez: sin ninguno no hay dónde abrir una terminal." };
  }
  return { apagadas: [...apagadas, p] };
}
