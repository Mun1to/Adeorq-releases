// El árbol de carpetas que devuelve Rust (`escanear_arbol`).
//
// Aquí vivían además tres colocadores que dibujaban ese árbol como esquema del
// proyecto. Se fueron enteros el 2026-08-14 y conviene saber por qué, para que
// a nadie se le ocurra volver a escribirlos: un árbol de carpetas NO dice cómo
// funciona un proyecto. `src/` no sabe que la llama nadie. Lo que se pedía era
// un diagrama de quién llama a quién, y eso solo sale de leer el código, así
// que lo escribe el Capataz y se dibuja en `lib/mapa.ts`.
//
// El escaneo del disco sigue vivo y es útil: es la chuleta de DÓNDE mirar que
// se le manda al Capataz para que no gaste media conversación buscando los
// archivos antes de abrir el primero (`esqueletoParaElCapataz`).

/** Un nodo tal como llega de Rust. */
export interface NodoCrudo {
  id: string;
  nombre: string;
  padre: string | null;
  carpeta: boolean;
  peso: number;
  /** Cuántos descendientes tiene. */
  dentro: number;
  /** De qué familia es: "rust", "front", "docs"… Lo decide Rust por la
   *  extensión y por dónde vive el archivo. */
  clase: string;
}

export interface ArbolCrudo {
  raiz: string;
  nombre: string;
  nodos: NodoCrudo[];
  /** Si se llegó al tope y hay más cosas de las que se enseñan. */
  recortado: boolean;
  /** Cuántas carpetas no se abrieron (node_modules, target, .git…). */
  saltadas: number;
}
