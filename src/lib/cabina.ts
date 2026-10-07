// El almacén de la Cabina: dónde vive su estado (decisión B1 de Munir,
// 2026-10-07).
//
// `App()` tenía 63 `useState` sueltos y cada pieza que necesitaba uno lo
// recibía a mano, por props, a través de quien hubiera en medio. Munir eligió
// UN almacén para la Cabina (los paneles, el mosaico, lo apartado, los grupos)
// que se muda poco a poco, cada mudanza probada. Esto es el almacén, y este
// archivo crece tramo a tramo: cada estado que se muda llega aquí con su
// banco, y `App` deja de pasarlo por props a quien ya puede leerlo de aquí.
//
// El primer tramo es el estado de cada panel (`estados`): lo que hace ahora
// cada terminal, reportado por ella misma. Es el que más piezas leen lejos de
// `App` (el Capataz, el vigía, la barra, la tarjeta de actualizar), así que
// es el que más props ahorra. Lo demás sigue en `App` hasta que le toque.
//
// Fuera de React se lee con `useCabina.getState()`.

import { create } from "zustand";
import type { PaneStatus } from "./pty";

export interface Cabina {
  /** Lo que hace cada panel AHORA, por su número. Un panel cerrado se borra:
      lo que no está, no cuenta. */
  estados: Record<number, PaneStatus>;
  apuntarEstado: (st: PaneStatus) => void;
  olvidarEstado: (id: number) => void;
}

export const useCabina = create<Cabina>((set) => ({
  estados: {},
  apuntarEstado: (st) => set((s) => ({ estados: { ...s.estados, [st.id]: st } })),
  olvidarEstado: (id) =>
    set((s) => {
      if (!(id in s.estados)) return s;
      const { [id]: _fuera, ...resto } = s.estados;
      return { estados: resto };
    }),
}));
