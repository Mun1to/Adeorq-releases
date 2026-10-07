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
// es el que más props ahorra.
//
// El segundo, lo apartado y los grupos (`minimizados`, `gruposOcultos`): las
// terminales que bajaron a la tira y los grupos de la barra que se apartaron.
// Los leen la Cabina, la barra lateral y el tablero guardado, y las cuatro
// operaciones que los cambian vivían en `App` como `useCallback`. Huella del
// banco `scripts/laboratorio/apartar-grupos.js` igual antes y después
// (`afd0a5a0`), y la de `tablero-guardado.js` también.
//
// Lo demás sigue en `App` hasta que le toque. Fuera de React se lee con
// `useCabina.getState()`.

import { create } from "zustand";
import type { PaneStatus } from "./pty";

/** Lo mismo que acepta un `setState` de React: el valor, o cómo sacarlo del
    de antes. Así quien lo llama no cambia al mudarse aquí. */
type Poner<T> = T | ((antes: T) => T);

export interface Cabina {
  /** Lo que hace cada panel AHORA, por su número. Un panel cerrado se borra:
      lo que no está, no cuenta. */
  estados: Record<number, PaneStatus>;
  apuntarEstado: (st: PaneStatus) => void;
  olvidarEstado: (id: number) => void;
  /** Las terminales minimizadas: fuera del mosaico, vivas y trabajando. */
  minimizados: Set<number>;
  /** Los grupos de la barra apartados: sus terminales bajan a la tira juntas. */
  gruposOcultos: Set<string>;
  ponerMinimizados: (v: Poner<Set<number>>) => void;
  ponerGruposOcultos: (v: Poner<Set<string>>) => void;
  alternarMinimizado: (id: number) => void;
  alternarGrupo: (id: string) => void;
  /** Todo de vuelta al mosaico: lo minimizado y los grupos apartados. */
  traerTodo: () => void;
}

/** Un conjunto nuevo con `x` metido o sacado. Nuevo siempre: si fuera el mismo
    objeto, quien lo lee no se enteraría del cambio. */
function alternar<T>(antes: Set<T>, x: T): Set<T> {
  const s = new Set(antes);
  if (!s.delete(x)) s.add(x);
  return s;
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
  minimizados: new Set(),
  gruposOcultos: new Set(),
  ponerMinimizados: (v) =>
    set((s) => ({ minimizados: typeof v === "function" ? v(s.minimizados) : v })),
  ponerGruposOcultos: (v) =>
    set((s) => ({ gruposOcultos: typeof v === "function" ? v(s.gruposOcultos) : v })),
  alternarMinimizado: (id) => set((s) => ({ minimizados: alternar(s.minimizados, id) })),
  alternarGrupo: (id) => set((s) => ({ gruposOcultos: alternar(s.gruposOcultos, id) })),
  traerTodo: () => set({ minimizados: new Set(), gruposOcultos: new Set() }),
}));
