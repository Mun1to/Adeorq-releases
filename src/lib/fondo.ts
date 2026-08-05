import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

// El fondo de la casa: la imagen o el vídeo que se ve detrás de las terminales.
//
// Los paneles ya son cristal traslúcido, así que debajo había un color plano
// desaprovechado. Esto lo ocupa con lo que él quiera.
//
// El archivo NO se guarda aquí ni viaja por el puente: se copia una vez a la
// carpeta de Adeorq (lo hace Rust) y se sirve por el protocolo de assets del
// propio Tauri. Es lo que permite poner un vídeo de 200 MB sin que el navegador
// tenga que sostenerlo entero en memoria: lo va leyendo del disco como haría
// con cualquier archivo local, y además así el fondo aguanta un reinicio sin
// que haya que volver a cargarlo.

export const FONDO_OPACIDAD_KEY = "adeorq-fondo-opacidad";
export const FONDO_DESENFOQUE_KEY = "adeorq-fondo-desenfoque";

/** Copia el archivo elegido a la carpeta de la app y devuelve su ruta allí. */
export function ponerFondo(path: string): Promise<string> {
  return invoke("set_fondo", { path });
}

/** La ruta del que haya puesto, o "" si no hay ninguno. */
export function leerFondo(): Promise<string> {
  return invoke("get_fondo");
}

export function quitarFondo(): Promise<void> {
  return invoke("clear_fondo");
}

/** Los formatos que se pintan como vídeo; el resto van a un <img>. */
export function esVideo(path: string): boolean {
  return /\.(mp4|webm)$/i.test(path);
}

/**
 * La ruta de disco convertida en algo que el WebView puede cargar.
 *
 * Lleva un sufijo que cambia con el archivo para que, al cambiar de fondo, el
 * navegador no reutilice el que tenía cacheado: los dos se llaman `fondo.png`
 * y sin esto pondrías uno nuevo y seguirías viendo el viejo.
 */
export function comoFuente(path: string, sello: number): string {
  return `${convertFileSrc(path)}?v=${sello}`;
}
