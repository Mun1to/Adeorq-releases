// El puente con `src-tauri/src/navegador.rs`: tu navegador metido dentro de la
// ventana de Adeorq.
//
// Todas las medidas van en píxeles FÍSICOS, que es lo que entiende Windows.
// Quien llame multiplica por `devicePixelRatio`, y para eso está `enFisicos`.

import { invoke } from "@tauri-apps/api/core";

export interface Empotrada {
  /** Qué navegador se abrió ("brave", "chrome"…), para poder decirlo. */
  programa: string;
}

/** Un rectángulo del DOM, en píxeles de la pantalla y ya redondeado. */
export function enFisicos(r: DOMRect): { x: number; y: number; ancho: number; alto: number } {
  const p = window.devicePixelRatio || 1;
  return {
    x: Math.round(r.left * p),
    y: Math.round(r.top * p),
    ancho: Math.round(r.width * p),
    alto: Math.round(r.height * p),
  };
}

export function empotrarNavegador(
  id: number,
  url: string,
  caja: { x: number; y: number; ancho: number; alto: number },
): Promise<Empotrada> {
  return invoke("empotrar_navegador", { id, url, ...caja });
}

export function moverNavegador(
  id: number,
  caja: { x: number; y: number; ancho: number; alto: number },
): Promise<void> {
  return invoke("mover_navegador", { id, ...caja });
}

/** Taparla sin cerrarla. Una ventana de verdad no entiende de CSS, así que
    esconderla con el resto del panel es cosa de Windows. */
export function verNavegador(id: number, visible: boolean): Promise<void> {
  return invoke("ver_navegador", { id, visible });
}

/** Devolverle su marco y dejarla en el escritorio. La página no se pierde. */
export function soltarNavegador(id: number): Promise<void> {
  return invoke("soltar_navegador", { id });
}
