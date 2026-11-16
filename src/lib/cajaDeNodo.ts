import type { Node } from "@xyflow/react";
import type { Caja } from "./trazos";

/** El tamaño de casa de una pieza del lienzo, cuando nadie ha dicho otro. */
export const NODE_W = 640;
export const NODE_H = 420;

/** Lo que mide una pieza. React Flow lo sabe una vez pintada (`measured`); si
    aún no lo está, manda lo que se le pidió, y si tampoco, el tamaño de casa. */
export const medida = (n: Node, wDef: number, hDef: number) => ({
  w: n.measured?.width ?? Number(n.style?.width) ?? wDef,
  h: n.measured?.height ?? Number(n.style?.height) ?? hDef,
});

/** Lo que ocupa una pieza en el lienzo, en el mismo idioma que los trazos. */
export const cajaNodo = (n: Node): Caja => ({
  x: n.position.x,
  y: n.position.y,
  ...medida(n, NODE_W, NODE_H),
});
