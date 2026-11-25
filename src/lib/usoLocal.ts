// Qué pantallas usas, apuntado solo en tu disco y solo si existe `uso-local.on`
// en la carpeta de datos (`src-tauri/src/uso_local.rs`, decisión d1a213fec659).
// Se pregunta una vez al abrir Adeorq: sin el archivo, esto no vuelve a llamar a
// Rust. Se lee con `node scripts/uso-local.mjs`.
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";

let encendido: Promise<boolean> | null = null;

function estaEncendido(): Promise<boolean> {
  encendido ??= invoke<boolean>("uso_local_encendido").catch(() => false);
  return encendido;
}

/** Apunta un evento si está encendido; si no, nada. Nunca falla hacia fuera. */
export function anotarUso(evento: Record<string, string | number>): void {
  void estaEncendido().then((si) => {
    if (si) void invoke("uso_local_anotar", { evento }).catch(() => {});
  });
}

/** Lo que se apunta al cambiar de `de` a `a`: la primera vez, que se abrió en
 *  `a`; después, el paso y el rato que estuvo en la anterior. Repetir la misma
 *  no cuenta (React monta dos veces en desarrollo). */
export function eventoDeVista(antes: { vista: string; desde: number } | null, vista: string, ahora: number): Record<string, string | number> | null {
  if (!antes) return { ev: "abre", a: vista };
  if (antes.vista === vista) return null;
  return { ev: "vista", de: antes.vista, a: vista, ms: Math.max(0, ahora - antes.desde) };
}

/** Apunta cada cambio de pantalla con el rato que pasaste en la anterior. */
export function useUsoLocal(vista: string): void {
  const antes = useRef<{ vista: string; desde: number } | null>(null);
  useEffect(() => {
    const ahora = Date.now();
    const ev = eventoDeVista(antes.current, vista, ahora);
    if (!ev) return;
    antes.current = { vista, desde: ahora };
    anotarUso(ev);
  }, [vista]);
}
