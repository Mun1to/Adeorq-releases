// El puente con `src-tauri/src/archivos.rs`. Solo llamadas: la lógica del árbol
// vive en `arbol.ts`, que es pura y se puede probar sin abrir la app.

import { invoke } from "@tauri-apps/api/core";

export interface Entrada {
  nombre: string;
  ruta: string;
  carpeta: boolean;
  peso: number;
  /** Cuándo se tocó por última vez, en milisegundos. */
  cuando: number;
}

/** Un archivo distinto del último commit, según git. */
export interface Cambio {
  ruta: string;
  /** "M" cambiado, "A" nuevo, "D" borrado, "R" renombrado, "U" en conflicto. */
  estado: "M" | "A" | "D" | "R" | "U";
  /** Cuándo se tocó, en milisegundos; 0 si ya no existe. */
  cuando: number;
}

export interface EstadoArchivos {
  /** La carpeta está dentro de un repositorio de git. */
  git: boolean;
  cambios: Cambio[];
}

/** Qué está distinto del último commit en esa carpeta (`estado_archivos`). */
export function estadoArchivos(raiz: string): Promise<EstadoArchivos> {
  return invoke("estado_archivos", { raiz });
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

/** Todos los archivos de una carpeta, en hondo y relativos a ella, con barras
    normales: lo que alimenta el buscador de Ctrl+P (`listar_nombres`). */
export function listarNombres(raiz: string): Promise<string[]> {
  return invoke("listar_nombres", { raiz });
}

/** Lista UNA carpeta, la que se acaba de desplegar. */
export function listarCarpeta(ruta: string): Promise<Carpeta> {
  return invoke("listar_carpeta", { ruta });
}

export function leerArchivo(ruta: string): Promise<Archivo> {
  return invoke("leer_archivo", { ruta });
}

/** Cuándo se tocó por última vez, en milisegundos; 0 si ya no está. Es lo que
    el editor pregunta cada poco por el archivo que tienes delante. */
export function cuandoArchivo(ruta: string): Promise<number> {
  return invoke("cuando_archivo", { ruta });
}

/** Una imagen lista para un `<img>` (`data:…`), o `null` si no lo es o pesa
    demasiado para traerla entera. */
export function leerImagen(ruta: string): Promise<string | null> {
  return invoke("leer_imagen", { ruta });
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
