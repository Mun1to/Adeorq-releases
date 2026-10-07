// Una pieza del lienzo a lo grande, o de vuelta a como estaba.
//
// Munir, 2026-10-07: «no se puede ampliar fácilmente la terminal». Grande es lo
// que se ve del lienzo menos un margen, con el zoom de ahora: no se toca la
// cámara, se agranda la pieza, y por encima de las demás. Lo de antes (sitio y
// tamaño) se guarda en el propio nodo para volver con el mismo botón.

import type { Node } from "@xyflow/react";

export const MARGEN_GRANDE = 20;

interface Datos extends Record<string, unknown> {
  grande?: boolean;
  previo?: { x: number; y: number; w: number; h: number };
}

/** Lo que mide la pieza: lo pintado, lo pedido o, si no hay nada, lo de casa. */
function medida(n: Node, wDef: number, hDef: number) {
  return {
    w: n.measured?.width ?? Number(n.style?.width) ?? wDef,
    h: n.measured?.height ?? Number(n.style?.height) ?? hDef,
  };
}

/**
 * El nodo ampliado o devuelto. `caja` es el rectángulo del lienzo en pantalla,
 * `esquina` su esquina de arriba a la izquierda ya pasada a coordenadas del
 * lienzo (con el margen puesto), y `zoom` el de ahora.
 */
export function alternarGrande<D extends Datos>(
  n: Node<D>,
  caja: { width: number; height: number },
  zoom: number,
  esquina: { x: number; y: number },
  casa = { w: 640, h: 420, minW: 360, minH: 220 },
): Node<D> {
  if (n.data.grande && n.data.previo) {
    const { x, y, w, h } = n.data.previo;
    return {
      ...n,
      position: { x, y },
      width: w,
      height: h,
      style: { ...n.style, width: w, height: h },
      zIndex: undefined,
      data: { ...n.data, grande: false, previo: undefined },
    };
  }
  const w = Math.max(casa.minW, (caja.width - MARGEN_GRANDE * 2) / zoom);
  const h = Math.max(casa.minH, (caja.height - MARGEN_GRANDE * 2) / zoom);
  const previo = { x: n.position.x, y: n.position.y, ...medida(n, casa.w, casa.h) };
  return {
    ...n,
    position: esquina,
    width: w,
    height: h,
    style: { ...n.style, width: w, height: h },
    zIndex: 50,
    data: { ...n.data, grande: true, previo },
  };
}
