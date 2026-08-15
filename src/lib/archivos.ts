// El puente con `src-tauri/src/archivos.rs`. Solo llamadas: la lógica del árbol
// vive en `arbol.ts`, que es pura y se puede probar sin abrir la app.

import { invoke } from "@tauri-apps/api/core";

export interface Entrada {
  nombre: string;
  ruta: string;
  carpeta: boolean;
  peso: number;
}

export interface Carpeta {
  ruta: string;
  filas: Entrada[];
}

export interface Archivo {
  ruta: string;
  /** El contenido, con los saltos ya normalizados a `\n`. */
  texto: string | null;
  /** Por qué no hay texto: "grande" o "binario". */
  pega: "grande" | "binario" | null;
  peso: number;
  /** Cuándo se tocó por última vez, en milisegundos. Hay que devolverlo al
      guardar: es lo que permite notar que un agente lo cambió por debajo. */
  cuando: number;
  /** Venía con saltos de Windows y hay que devolverlo así. */
  crlf: boolean;
}

export interface Guardado {
  cuando: number;
  /** No se escribió nada porque el disco es más nuevo que lo que se leyó. */
  pisaria: boolean;
}

/** Lista UNA carpeta, la que se acaba de desplegar. */
export function listarCarpeta(ruta: string): Promise<Carpeta> {
  return invoke("listar_carpeta", { ruta });
}

export function leerArchivo(ruta: string): Promise<Archivo> {
  return invoke("leer_archivo", { ruta });
}

/** Guarda, salvo que fuera a pisar lo que otro escribió mientras tanto. Con
    `forzar` se escribe igualmente, que es la salida cuando ya has mirado el
    aviso y sabes lo que haces. */
export function guardarArchivo(
  ruta: string,
  texto: string,
  crlf: boolean,
  visto: number | null,
  forzar = false,
): Promise<Guardado> {
  return invoke("guardar_archivo", { ruta, texto, crlf, visto, forzar });
}
