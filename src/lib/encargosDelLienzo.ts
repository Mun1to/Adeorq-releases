import { useEffect } from "react";
import { create } from "zustand";
import type { Project } from "./pty";

// El cable por el que una pieza del lienzo pide una terminal nueva.
//
// El tablero de tarjetas lo recibe en sus datos de nodo, y cada vez que cambia
// hay que volcárselo a mano (el efecto de `CanvasView`). Una nota lo lee de
// aquí, que es como las piezas lejanas leen ya el estado de la Cabina
// (`lib/cabina.ts`): sin pasar por los datos de cada nodo, que se guardan con el
// tablero y se quedarían con la función de ayer.
//
// El lienzo es uno y está montado siempre, así que basta un almacén a secas.

/** De qué va el encargo, cuando su texto no sirve para decirlo: el de una nota
    trae la ruta del archivo y las reglas de marcar casillas, y ni el nombre de
    la terminal ni el modelo con que nace se eligen mirando eso. */
export interface Aparte {
  /** Para el rótulo de la terminal. */
  nombre: string;
  /** Lo que mira el router para elegir con qué nace. */
  juzgar: string;
}

export interface EncargosDelLienzo {
  proyectos: Project[];
  /** El proyecto elegido arriba en el lienzo, por su nombre. */
  proyecto: string;
  /** Abre una terminal nueva con el encargo dentro. Falso si no pudo. */
  lanzar: (texto: string, ruta?: string, aparte?: Aparte) => boolean;
  /** Lleva varias tareas al Reparto. `alAbrir` solo corre si se abrió la
      cuadrilla: cerrar el Reparto sin abrir nada no lo llama. */
  repartir: (textos: string[], ruta: string | undefined, alAbrir: () => void) => boolean;
}

export const useEncargosDelLienzo = create<EncargosDelLienzo>(() => ({
  proyectos: [],
  proyecto: "",
  lanzar: () => false,
  repartir: () => false,
}));

/** Lo llama el lienzo con lo suyo, y lo vuelve a dejar cada vez que cambia. */
export function useOfrecerEncargos(
  proyectos: Project[],
  proyecto: string,
  lanzar: EncargosDelLienzo["lanzar"],
  repartir: EncargosDelLienzo["repartir"],
) {
  useEffect(() => {
    useEncargosDelLienzo.setState({ proyectos, proyecto, lanzar, repartir });
  }, [proyectos, proyecto, lanzar, repartir]);
}
