// Mover un panel de la Cabina cogiéndolo por su cabecera.
//
// Se pulsa la cabecera, se arrastra sobre otro panel y se suelta: cae en la
// mitad o el borde que marque el puntero, como el acople de ventanas de
// Windows, y mientras lo llevas se ve dónde va a caer. Soltarlo FUERA de la
// ventana lo saca a su propia ventana, ahí mismo. Un clic sin arrastre no
// mueve nada.
//
// Vivía dentro de `App()`. Para comprobarlo: `scripts/laboratorio/mover-panel.js`
// hace tres gestos con el ratón y devuelve una huella de cómo queda el mosaico.

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { edgeAt, movePane, type Col, type Edge } from "./layout";

export interface ManosDeMover {
  panes: ReadonlyArray<{ id: number; name: string }>;
  setFocusedId: Dispatch<SetStateAction<number | null>>;
  setCols: Dispatch<SetStateAction<Col[]>>;
  nextCol: { current: number };
  /** Sacar un panel a su propia ventana, en esas coordenadas de pantalla. */
  sacarFuera: (id: number, x?: number, y?: number) => void;
}

export function useMoverPanel({ panes, setFocusedId, setCols, nextCol, sacarFuera }: ManosDeMover) {
  // Moving a pane: pointer-driven, because HTML5 drag never reaches the page
  // here. Press the header, drag over another pane, release: they swap.
  const [drag, setDrag] = useState<{
    id: number;
    name: string;
    x: number;
    y: number;
    over: number | null;
    /** Which half or edge of the target it would land on. */
    edge: Edge;
    /** The preview rectangle, in screen pixels. */
    box: { left: number; top: number; width: number; height: number } | null;
    moved: boolean;
  } | null>(null);

  const onHeaderDown = useCallback(
    (id: number, e: React.PointerEvent) => {
      const pane = panes.find((p) => p.id === id);
      setFocusedId(id);
      setDrag({
        id,
        name: pane?.name ?? "",
        x: e.clientX,
        y: e.clientY,
        over: null,
        edge: "center",
        box: null,
        moved: false,
      });
    },
    [panes],
  );

  useEffect(() => {
    if (!drag) return;
    // Windows-style snap: what is under the cursor, and which zone of it. The
    // preview box is the target's own rectangle, halved when landing on a side.
    const aim = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const host = el?.closest?.("[data-pane-id]") as HTMLElement | null;
      const id = host ? Number(host.dataset.paneId) : null;
      if (id == null || id === drag.id || !host) {
        return { over: null, edge: "center" as Edge, box: null };
      }
      const r = host.getBoundingClientRect();
      const edge = edgeAt((x - r.left) / r.width, (y - r.top) / r.height);
      const box =
        edge === "left"
          ? { left: r.left, top: r.top, width: r.width / 2, height: r.height }
          : edge === "right"
            ? { left: r.left + r.width / 2, top: r.top, width: r.width / 2, height: r.height }
            : edge === "top"
              ? { left: r.left, top: r.top, width: r.width, height: r.height / 2 }
              : edge === "bottom"
                ? { left: r.left, top: r.top + r.height / 2, width: r.width, height: r.height / 2 }
                : { left: r.left, top: r.top, width: r.width, height: r.height };
      return { over: id, edge, box };
    };
    const move = (e: PointerEvent) => {
      setDrag((d) => {
        if (!d) return d;
        // A few pixels of slack, so a plain click on the header is not a move.
        const moved = d.moved || Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6;
        const hit = moved ? aim(e.clientX, e.clientY) : { over: null, edge: "center" as Edge, box: null };
        return { ...d, x: e.clientX, y: e.clientY, moved, ...hit };
      });
    };
    // Soltar la cabecera FUERA de la ventana la saca a su propia ventana, ahí
    // mismo (METAS, «arrastrar una terminal fuera», 2026-08-14). Chromium sigue
    // mandando los eventos del arrastre aunque el puntero salga de la ventana,
    // con coordenadas fuera del área: eso es lo que se mira.
    const fuera = (e: PointerEvent) =>
      e.clientX < 0 || e.clientY < 0 || e.clientX > window.innerWidth || e.clientY > window.innerHeight;
    const up = (e: PointerEvent) => {
      const hit = aim(e.clientX, e.clientY);
      setDrag((d) => {
        if (d?.moved && fuera(e)) {
          // Donde la soltaste, en píxeles físicos (la ventana suelta se coloca así).
          const k = window.devicePixelRatio || 1;
          sacarFuera(d.id, Math.round(e.screenX * k), Math.round(e.screenY * k));
        } else if (d?.moved && hit.over != null) {
          setCols((prev) => movePane(prev, d.id, hit.over as number, hit.edge, () => nextCol.current++));
          setFocusedId(d.id);
        }
        return null;
      });
    };
    const cancel = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id]);

  return { drag, onHeaderDown };
}
