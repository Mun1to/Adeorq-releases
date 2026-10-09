// A quién se le puede mandar una captura del lienzo («Mandar a…»).
//
// La lista se copiaba UNA vez, al crear la imagen, aunque el comentario de al
// lado decía que se leía al mandarla. Así que una captura pegada antes de abrir
// la terminal, o recuperada con el tablero al abrir Adeorq (las imágenes
// vuelven antes que las terminales), se quedaba con el botón apagado para
// siempre: «Abre una terminal en el lienzo para poder mandársela», con la
// terminal abierta al lado. Salió al montar `scripts/laboratorio/menu-imagen.js`.

import { useEffect, type Dispatch, type SetStateAction } from "react";

type Pane = { id: number; name: string; command?: string[] };

/** Las terminales con un CLI dentro, que son las que pueden recibirla. */
export function terminalesDe(panes: Pane[]): Array<{ id: number; name: string }> {
  return panes.filter((x) => !!x.command).map((x) => ({ id: x.id, name: x.name }));
}

/** Pone al día la lista de todas las capturas cada vez que cambian las
 *  terminales del lienzo (una más, una menos, o una renombrada). */
export function useTerminalesEnCapturas<N extends { type?: string; data: unknown }>(
  panes: Pane[],
  setNodes: Dispatch<SetStateAction<N[]>>,
): void {
  const firma = terminalesDe(panes)
    .map((x) => `${x.id}:${x.name}`)
    .join("|");
  useEffect(() => {
    const terminales = terminalesDe(panes);
    setNodes((prev) =>
      prev.some((n) => n.type === "img")
        ? prev.map((n) => (n.type === "img" ? ({ ...n, data: { ...(n.data as object), terminales } } as N) : n))
        : prev,
    );
    // Solo cuando cambia la firma: `panes` es un array nuevo en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, setNodes]);
}
