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

export function esPdf(ruta: string): boolean {
  return /\.pdf$/i.test(ruta);
}

/** Un PDF como dirección `blob:` para un marco, que lo enseña con el visor del
    propio WebView, o `null` si no lo es o pesa demasiado. Quien la pide la suelta
    con `URL.revokeObjectURL` al dejar de enseñarla. */
export async function urlDePdf(ruta: string): Promise<string | null> {
  const b64: string | null = await invoke("leer_pdf", { ruta });
  if (!b64) return null;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
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

/* Lo del clic derecho del árbol. Ninguna pisa nada: crear o renombrar encima de
   algo que existe es un error con su porqué, y borrar va a la papelera. */
export const crearArchivo = (carpeta: string, nombre: string) => invoke<string>("crear_archivo", { carpeta, nombre });
export const crearCarpeta = (carpeta: string, nombre: string) => invoke<string>("crear_carpeta", { carpeta, nombre });
export const renombrarRuta = (ruta: string, nombre: string) => invoke<string>("renombrar", { ruta, nombre });
export const aLaPapelera = (ruta: string) => invoke<void>("a_la_papelera", { ruta });
/** Una nota guardada como ficha en `<raiz>/docs/fichas/<nombre>`, sin pisar otra. */
export const guardarFicha = (raiz: string, nombre: string, texto: string) => invoke<string>("guardar_ficha", { raiz, nombre, texto });

/** Un sitio donde sale lo buscado (`buscar_en_archivos`): la ruta relativa a la
    carpeta y con barras normales, la línea, y lo que dice esa línea. */
export interface Hallazgo {
  ruta: string;
  linea: number;
  texto: string;
}

/** Busca un texto DENTRO de los archivos de una carpeta, sin distinguir
    mayúsculas. Con menos de dos letras no busca. */
export const buscarEnArchivos = (raiz: string, texto: string) => invoke<Hallazgo[]>("buscar_en_archivos", { raiz, texto });
