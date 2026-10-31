// Quién escribe `adeorq-state.json` cuando lo que cambia no nace en la barra.
//
// La barra (`Sidebar`) guarda el ESTADO ENTERO desde su copia en memoria cada
// vez que tocas algo. Si otro sitio (una cuadrilla que anota su grupo) lee el
// archivo, le añade lo suyo y lo guarda por su cuenta, hay dos escritores con
// copias distintas y gana el último: un arrastre hecho en medio de una
// cuadrilla escalonada perdía los grupos, o los perdía el grupo nuevo.
//
// Mientras la barra está montada (en la Cabina y en el Lienzo es la misma), el
// cambio se le pide a ELLA y lo aplica con su `mutate`, que es el único
// camino que guarda. Si no está montada nadie más escribe, y entonces se lee,
// se cambia y se guarda en fila para que dos cambios seguidos no se pisen.

import { loadUiState, saveUiState, type UiState } from "./pty";

export type CambioDeBarra = (previo: UiState) => UiState;

let dueña: ((cambio: CambioDeBarra) => void) | null = null;
let fila: Promise<unknown> = Promise.resolve();

/** La barra se declara dueña del estado mientras está montada. Devuelve cómo
 *  dejar de serlo. */
export function registrarBarra(aplicar: (cambio: CambioDeBarra) => void): () => void {
  dueña = aplicar;
  return () => {
    if (dueña === aplicar) dueña = null;
  };
}

/** Cambia el estado de la barra sin pisar a nadie. */
export function cambiarBarra(cambio: CambioDeBarra): Promise<void> {
  if (dueña) {
    dueña(cambio);
    return Promise.resolve();
  }
  const paso = fila.then(async () => saveUiState(cambio(await loadUiState())));
  fila = paso.catch(() => {});
  return paso;
}
