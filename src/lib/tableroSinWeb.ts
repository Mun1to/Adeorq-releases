// Sacar del tablero guardado los paneles web de antes del navegador de verdad.
//
// Hasta el 2026-10-18 la web era un panel del mosaico y se guardaba con el
// tablero (`pane.web`, `webTabs`). Ahora es el navegador de la derecha
// (`lib/panelNavegador.ts`), así que al arrancar se le quitan al tablero y sus
// pestañas pasan al navegador. Aparte y sin dependencias para que su banco
// (`pnpm bancos tablero-sin-web`) no arrastre Tauri ni React.

import type { SavedLayout } from "./tablero";

export interface Pestanas {
  tabs: string[];
  activa: number;
}

/**
 * Quita los paneles web de un tablero guardado y devuelve sus pestañas.
 *
 * Las columnas guardan sus paneles por POSICIÓN en la lista (`idx`), y cada
 * panel su alto en la misma posición (`hs`): al quitar uno hay que renumerar
 * los de detrás y quitar su alto, o el tablero renacería con los altos
 * cambiados de panel. Una columna que se queda vacía, fuera.
 */
export function sinPanelesWeb(layout: SavedLayout): { layout: SavedLayout; pestanas: Pestanas | null } {
  const fuera = new Set<number>();
  let pestanas: Pestanas | null = null;
  layout.panes.forEach((p, i) => {
    if (p.web == null) return;
    fuera.add(i);
    // Solo había uno (abrirlo otra vez enfocaba el que ya estaba): si hubiera
    // más, gana el primero.
    if (pestanas) return;
    const tabs = (p.webTabs?.length ? p.webTabs : [p.web]).filter((u) => typeof u === "string");
    pestanas = { tabs, activa: Math.max(0, Math.min(p.webActiva ?? 0, tabs.length - 1)) };
  });
  if (!fuera.size) return { layout, pestanas: null };
  const nuevo = new Map<number, number>();
  layout.panes.forEach((_, i) => {
    if (!fuera.has(i)) nuevo.set(i, nuevo.size);
  });
  const cols = (layout.cols ?? [])
    .map((c) => {
      const quedan = c.idx.map((i, k) => ({ i, h: c.hs?.[k] ?? 1 })).filter((x) => !fuera.has(x.i));
      return { ...c, idx: quedan.map((x) => nuevo.get(x.i) ?? -1), hs: quedan.map((x) => x.h) };
    })
    .filter((c) => c.idx.length > 0);
  return {
    layout: { ...layout, panes: layout.panes.filter((_, i) => !fuera.has(i)), cols },
    pestanas,
  };
}
