// La voz del Asistente: decir en alto lo que contesta.
//
// El módulo hermano de `voz.ts`, y separado a propósito: aquel ESCUCHA (el
// dictado con whisper.cpp), este HABLA. La dice Grok TTS a través de
// OpenRouter, con TU clave (la frase de la casa: funciona con tu cuenta,
// nadie revende acceso). El audio lo genera Rust (`openrouter.rs`), que es
// quien guarda la clave, y llega aquí como data URL para un `<audio>` sin
// archivos temporales.
//
// Solo hay UNA voz sonando: pedir otra corta la anterior, porque dos
// respuestas habladas a la vez no son dos respuestas, son ruido.

import { invoke } from "@tauri-apps/api/core";

/** Qué voz está puesta. Vacío = el Asistente no habla. */
export const VOZ_KEY = "adeorq-voz-asistente";

/** Las de Grok, en el orden de OpenRouter. La primera es la de la casa. */
export const VOCES = ["Eve", "Ara", "Rex", "Sal", "Leo"] as const;

export function vozElegida(): string {
  return localStorage.getItem(VOZ_KEY) ?? "";
}

let sonando: HTMLAudioElement | null = null;

export async function decir(texto: string, voz: string): Promise<void> {
  const url = await invoke<string>("tts_hablar", { texto, voz });
  parar();
  const audio = new Audio(url);
  sonando = audio;
  await audio.play();
}

export function parar(): void {
  if (!sonando) return;
  sonando.pause();
  sonando = null;
}
