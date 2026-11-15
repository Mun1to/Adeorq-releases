// La valla del ratón (`src-tauri/src/valla.rs`): lo que la tarjeta de Ajustes le pide a Rust.
// Solo en Windows; fuera, `disponible` llega en falso y la tarjeta no sale.

import { invoke } from "@tauri-apps/api/core";

export interface Pantalla {
  /** De izquierda a derecha, desde 1. */
  n: number;
  ancho: number;
  alto: number;
  principal: boolean;
  /** El ratón está en ella ahora mismo. */
  raton: boolean;
}

export interface Ventana {
  id: number;
  titulo: string;
  app: string;
}

export interface Sitios {
  pantallas: Pantalla[];
  ventanas: Ventana[];
}

export interface Puesta {
  pantalla: number | null;
  ventana: number | null;
  nombre: string;
}

/** Por qué se quitó la última: tú, Ctrl+Alt+L, o la ventana se minimizó o se cerró. */
export type Motivo = "pedido" | "atajo" | "ventanaFuera";

export interface EstadoValla {
  disponible: boolean;
  puesta: Puesta | null;
  motivo: Motivo | null;
}

/** Lo manda Rust cuando la valla se quita sola (el atajo, o la ventana que se fue). */
export const EVENTO_VALLA = "valla";

export const vallaEstado = () => invoke<EstadoValla>("valla_estado");
export const vallaSitios = () => invoke<Sitios>("valla_sitios");
export const vallaPoner = (donde: { pantalla?: number; ventana?: number }) =>
  invoke<EstadoValla>("valla_poner", { pantalla: donde.pantalla ?? null, ventana: donde.ventana ?? null });
export const vallaQuitar = () => invoke<EstadoValla>("valla_quitar");
