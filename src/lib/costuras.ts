// Las costuras del mosaico de la Cabina: dónde van y cómo se arrastran.
//
// Vivía dentro de `App()`. No depende de nada de ese componente salvo de
// `setCols`: mientras arrastras, el reparto vive en un ref y los anchos se
// escriben a mano en el DOM, y React solo se entera al soltar. El porqué
// entero está junto a `enVueloRef`.

import { useRef, type Dispatch, type SetStateAction } from "react";
import {
  aplicarVistas,
  floorFor,
  MIN_PANE_H,
  MIN_PANE_W,
  rects as layoutRects,
  resizeCol,
  resizeRow,
  type Col,
} from "./layout";
import { empezarRedimension, terminarRedimension } from "./redimension";

/** Where the draggable seams go, derived from the same rectangles. */
export type Divider =
  | { kind: "col"; i: number; at: number }
  | { kind: "row"; ci: number; ri: number; at: number; x: number; w: number };

export function dividers(cols: Col[]): Divider[] {
  const out: Divider[] = [];
  const total = cols.reduce((a, c) => a + c.w, 0) || 1;
  let x = 0;
  cols.forEach((col, i) => {
    const w = col.w / total;
    if (i < cols.length - 1) out.push({ kind: "col", i, at: x + w });
    const hTotal = col.hs.reduce((a, b) => a + b, 0) || 1;
    let y = 0;
    col.panes.forEach((_, ri) => {
      y += (col.hs[ri] ?? 1) / hTotal;
      if (ri < col.panes.length - 1) out.push({ kind: "row", ci: i, ri, at: y, x, w });
    });
    x += w;
  });
  return out;
}

/**
 * El arrastre de las costuras. Se llama UNA vez, en la Cabina.
 *
 * `gridRef` va en el elemento del mosaico y `colsVisiblesRef` lo pone al día
 * quien pinta (el mosaico que se ve, sin las terminales apartadas). Los tres
 * manejadores van en cada costura.
 */
export function useCosturas(setCols: Dispatch<SetStateAction<Col[]>>) {
  // Dragging a divider: the grid's own size turns pixels into fractions.
  const gridRef = useRef<HTMLElement>(null);
  const dragDiv = useRef<
    | { kind: "col"; i: number; from: number }
    | { kind: "row"; ci: number; ri: number; from: number }
    | null
  >(null);
  /** El mosaico que se está viendo, para el arrastre de las barras. */
  const colsVisiblesRef = useRef<Col[]>([]);
  /**
   * El reparto MIENTRAS se arrastra, que no pasa por React.
   *
   * Aquí estaba el lag de verdad, y las dos primeras vueltas lo buscaron en el
   * sitio equivocado (Munir, 2026-08-11, después de dos intentos: «sigue yendo
   * lag, tiene que ser más directo y fluido»). Cada movimiento llamaba a
   * `setCols`, y eso vuelve a renderizar la cabina ENTERA con sus nueve
   * `TerminalPane` dentro, que no están memoizados y son mil quinientas líneas
   * de JSX cada uno. Bajar la cadencia del reflow de xterm no lo tocaba
   * siquiera: el trabajo caro era el de React, y ocurría igual.
   *
   * Así que durante el arrastre React no se entera: el reparto vive en este
   * ref y los anchos se escriben directamente en el DOM, que es lo que hacen
   * los separadores que van finos (split.js, Allotment, react-resizable-panels
   * hacen exactamente esto). Al soltar se hace UN `setCols` con el resultado y
   * el estado vuelve a mandar.
   */
  const enVueloRef = useRef<Col[] | null>(null);

  const onDividerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    spec: { kind: "col"; i: number } | { kind: "row"; ci: number; ri: number },
  ) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    // Las terminales bajan la cadencia de su reflow: ver `lib/redimension.ts`.
    empezarRedimension();
    // Y el reparto sale de React hasta que sueltes.
    enVueloRef.current = colsVisiblesRef.current;
    dragDiv.current =
      spec.kind === "col"
        ? { kind: "col", i: spec.i, from: e.clientX }
        : { kind: "row", ci: spec.ci, ri: spec.ri, from: e.clientY };
  };

  /* Un cambio de reparto por frame, no uno por aviso del ratón.
   *
   * Un ratón moderno manda entre 125 y 1000 posiciones por segundo, y cada una
   * que pasara el umbral llamaba a `setCols`, que vuelve a renderizar el panel
   * con sus nueve terminales dentro (`TerminalPane` no está memoizado, así que
   * se re-renderizan todas). Pintar más de una vez por frame no se ve: lo
   * único que hace es competir con el propio arrastre. Se guarda la última
   * posición y se aplica en el frame siguiente. */
  const arrastrePedido = useRef(0);
  const ultimoPuntero = useRef({ x: 0, y: 0 });

  const onDividerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragDiv.current) return;
    ultimoPuntero.current = { x: e.clientX, y: e.clientY };
    if (arrastrePedido.current) return;
    arrastrePedido.current = requestAnimationFrame(() => {
      arrastrePedido.current = 0;
      aplicarArrastre();
    });
  };

  const aplicarArrastre = () => {
    const d = dragDiv.current;
    const box = gridRef.current?.getBoundingClientRect();
    if (!d || !box) return;
    const p = ultimoPuntero.current;
    // Se estira lo que SE VE, y el resultado se copia al mosaico de verdad
    // (ver `aplicarVistas`): los índices de una barra son los del mosaico
    // visible, y aplicarlos al completo movía la columna equivocada en cuanto
    // había una terminal apartada.
    const vistas = enVueloRef.current ?? colsVisiblesRef.current;
    // The floor is worked out here and not in the model, because only the
    // cockpit knows how many pixels a fraction is worth right now.
    // El umbral es el mínimo que mueve un píxel de verdad, y no medio por
    // ciento: ahora que esto no cuesta un render, pedirle al arrastre que
    // avance a saltos de trece píxeles era lo que lo hacía sentir pastoso.
    const minimo = 0.0005;
    let tras: Col[] | null = null;
    if (d.kind === "col") {
      // El delta se ACUMULA entre frames: `from` solo avanza cuando el
      // movimiento supera el umbral, así que arrastrar despacio sigue moviendo
      // la barra en vez de quedarse muerto por debajo del mínimo.
      const delta = (p.x - d.from) / box.width;
      if (Math.abs(delta) < minimo) return;
      dragDiv.current = { ...d, from: p.x };
      tras = resizeCol(vistas, d.i, delta, floorFor(MIN_PANE_W, box.width, vistas.length));
    } else {
      const delta = (p.y - d.from) / box.height;
      if (Math.abs(delta) < minimo) return;
      dragDiv.current = { ...d, from: p.y };
      tras = resizeRow(
        vistas,
        d.ci,
        d.ri,
        delta,
        floorFor(MIN_PANE_H, box.height, vistas[d.ci]?.panes.length ?? 1),
      );
    }
    enVueloRef.current = tras;
    pintarEnCrudo(tras);
  };

  /**
   * Escribe el reparto en el DOM, sin pasar por React.
   *
   * Son las mismas cuentas que hace el render (`rects` y `dividers`, los
   * mismos del modelo), puestas a mano en los elementos que ya existen. No se
   * crea ni se destruye nada: solo cambian cuatro propiedades por panel, que
   * es lo único que de verdad cambia al mover una barra.
   */
  const pintarEnCrudo = (vistas: Col[]) => {
    const grid = gridRef.current;
    if (!grid) return;
    for (const [id, caja] of layoutRects(vistas)) {
      const el = grid.querySelector<HTMLElement>(`[data-pane-id="${id}"]`);
      if (!el) continue;
      el.style.left = `${caja.x * 100}%`;
      el.style.top = `${caja.y * 100}%`;
      el.style.width = `${caja.w * 100}%`;
      el.style.height = `${caja.h * 100}%`;
    }
    // Y las barras, que si no se quedan quietas mientras arrastras justo la
    // que tienes cogida.
    for (const d of dividers(vistas)) {
      const clave = d.kind === "col" ? `c${d.i}` : `r${d.ci}-${d.ri}`;
      const el = grid.querySelector<HTMLElement>(`[data-div="${clave}"]`);
      if (!el) continue;
      if (d.kind === "col") {
        el.style.left = `${d.at * 100}%`;
      } else {
        el.style.top = `${d.at * 100}%`;
        el.style.left = `${d.x * 100}%`;
        el.style.width = `${d.w * 100}%`;
      }
    }
  };

  const onDividerUp = () => {
    // El último movimiento se aplica ANTES de soltar el arrastre, que si no se
    // perdería: soltar justo después de mover dejaba la barra un frame por
    // detrás de donde apuntabas. Y `aplicarArrastre` necesita `dragDiv`, así
    // que anularlo va al final.
    if (arrastrePedido.current) {
      cancelAnimationFrame(arrastrePedido.current);
      arrastrePedido.current = 0;
      aplicarArrastre();
    }
    dragDiv.current = null;
    // Y AHORA se entera React, una sola vez, del reparto definitivo. Hasta
    // esta línea el estado seguía siendo el de antes de empezar a arrastrar:
    // sin esto, el primer re-render por cualquier otro motivo devolvería las
    // barras a su sitio de partida.
    const tras = enVueloRef.current;
    enVueloRef.current = null;
    if (tras) setCols((prev) => aplicarVistas(prev, tras));
    terminarRedimension();
  };

  return { gridRef, colsVisiblesRef, onDividerDown, onDividerMove, onDividerUp };
}
