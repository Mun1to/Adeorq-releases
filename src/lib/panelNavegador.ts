// El estado del navegador de la derecha: si está abierto, sus pestañas y lo que
// le piden desde fuera. Vive aquí y no en `App.tsx`, que está en su techo de
// líneas (`pnpm gordos`).
//
// Hasta el 2026-10-18 el navegador era un panel del mosaico y sus pestañas se
// guardaban con el tablero (`pane.web`, `webTabs`). Ahora es un panel aparte
// (decisión B1 de Munir), así que el tablero guardado se migra UNA vez al
// arrancar: sus paneles web salen de él y sus pestañas pasan aquí. Se hace antes
// de que `lib/tablero.ts` lo devuelva (al primer pintado, no en un efecto), y
// así nunca renace en el mosaico un panel web que ya no tiene quien lo pinte.

import { useCallback, useRef, useState } from "react";
import { anclarColumnas } from "./redimension";
import { LAYOUT_KEY, type SavedLayout } from "./tablero";
import { sinPanelesWeb, type Pestanas } from "./tableroSinWeb";

export const NAVEGADOR_KEY = "adeorq-navegador";
const ABIERTO_KEY = "adeorq-navegador-abierto";

function leerJson<T>(clave: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(clave) ?? "null") as T | null;
  } catch {
    return null;
  }
}

/** Las pestañas guardadas, migrando antes el tablero viejo si hace falta. */
function pestanasAlArrancar(): Pestanas {
  const tablero = leerJson<SavedLayout>(LAYOUT_KEY);
  let migradas: Pestanas | null = null;
  if (tablero?.panes?.length) {
    const r = sinPanelesWeb(tablero);
    if (r.pestanas) {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(r.layout));
      migradas = r.pestanas;
    }
  }
  const propias = leerJson<Pestanas>(NAVEGADOR_KEY);
  if (propias?.tabs?.length) return propias;
  if (migradas) {
    localStorage.setItem(NAVEGADOR_KEY, JSON.stringify(migradas));
    localStorage.setItem(ABIERTO_KEY, "1");
    return migradas;
  }
  return { tabs: [""], activa: 0 };
}

export function usePanelNavegador(setView: (v: "cabina") => void) {
  const [inicio] = useState(pestanasAlArrancar);
  const [abierto, setAbierto] = useState(() => localStorage.getItem(ABIERTO_KEY) === "1");
  const [pedida, setPedida] = useState<{ url: string; sello: number } | undefined>();
  const abiertoRef = useRef(abierto);

  const poner = useCallback((v: boolean) => {
    if (v === abiertoRef.current) return;
    // El navegador se lleva ancho de las terminales: que conserven sus columnas
    // y ajusten la letra, como con los demás paneles de la derecha.
    anclarColumnas();
    abiertoRef.current = v;
    localStorage.setItem(ABIERTO_KEY, v ? "1" : "0");
    setAbierto(v);
  }, []);

  /**
   * Abrirlo, y llevar a `url` si viene una.
   *
   * La dirección, solo si de verdad es una dirección: un `onClick={onWeb}`
   * mete aquí el evento del ratón (el error #31 de `arquitectura.md`).
   * `traer` es la diferencia entre pulsar el botón (te lleva a la Cabina) y que
   * lo pida una terminal al levantar un servidor (se abre y te espera allí, sin
   * sacarte de donde estabas).
   */
  const abrir = useCallback(
    (url?: unknown, traer = true) => {
      if (traer) setView("cabina");
      poner(true);
      if (typeof url === "string" && url) setPedida({ url, sello: Date.now() });
    },
    [poner, setView],
  );

  const cerrar = useCallback(() => poner(false), [poner]);

  /** El botón de la franja: abre, o cierra si ya lo estás viendo. */
  const alternar = useCallback(
    (enCabina: boolean) => (abiertoRef.current && enCabina ? poner(false) : abrir()),
    [abrir, poner],
  );

  /** Estable a propósito: el panel lo llama desde un efecto. */
  const guardar = useCallback((tabs: string[], activa: number) => {
    localStorage.setItem(NAVEGADOR_KEY, JSON.stringify({ tabs, activa }));
  }, []);

  return { abierto, inicio, pedida, abrir, cerrar, alternar, guardar };
}
