// Un enlace a una web dentro de un texto pintado (el chat, el conserje, la
// guía) se abre en TU navegador. Sin esto el WebView navegaba la ventana
// entera a esa dirección y te sacaba de Adeorq (bandeja, 2026-09).

import type React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

/** Para el `onClick` del contenedor que lleva el HTML. Solo toca los `http(s)`;
 *  el resto (anclas, rutas de notas) sigue su camino. */
export function abrirEnlacesFuera(e: React.MouseEvent): void {
  const a = (e.target as HTMLElement | null)?.closest?.("a[href]");
  if (!a) return;
  const href = a.getAttribute("href") ?? "";
  if (!esWeb(href)) return;
  e.preventDefault();
  abrirDireccionFuera(href);
}

/** Una dirección suelta, como la de un enlace de una terminal: solo `http(s)`,
 *  y en tu navegador. */
export function abrirDireccionFuera(href: string): void {
  if (esWeb(href)) void openUrl(href).catch(() => {});
}

const esWeb = (href: string) => /^https?:\/\//i.test(href);
