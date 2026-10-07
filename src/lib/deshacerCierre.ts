// Deshacer el cierre de una terminal.
//
// Munir, 2026-10-07: «cuando cierres una terminal a la X y le des Control Z,
// que vuelva a abrir». La X mata el proceso, así que «volver» es abrirla otra
// vez con su misma línea: un Claude retoma SU conversación (`resumeCommandFor`,
// el mismo camino que el tablero guardado) y una consola vuelve vacía. Se
// apunta lo que hace falta para eso y dónde estaba, cabina o lienzo. Un archivo
// abierto o una vista web no son terminales: no hay proceso que resucitar.
//
// Ctrl+Z reabre lo último cerrado cuando no estás dentro de una terminal (ahí
// esa tecla es del programa) ni de una caja de texto (del navegador). En el
// Lienzo, Ctrl+Z deshace el dibujo: ahí solo manda mientras el aviso de
// «cerrada» sigue en pantalla, que es cuando el Ctrl+Z quiere decir esto.

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { addPane as layoutAdd, type Col } from "./layout";
import { resumeCommandFor } from "./lanzar";
import type { Pane } from "./tablero";
import type { CanvasPane } from "../components/CanvasView";

interface Ref<T> {
  current: T;
}

export interface ManosDelDeshacer {
  panesRef: Ref<Pane[]>;
  canvasPanesRef: Ref<CanvasPane[]>;
  /** Qué pantalla se está mirando; `"lienzo"` es la que tiene su propio Ctrl+Z. */
  viewRef: Ref<string>;
  nextId: Ref<number>;
  nextCol: Ref<number>;
  setPanes: Dispatch<SetStateAction<Pane[]>>;
  setCanvasPanes: Dispatch<SetStateAction<CanvasPane[]>>;
  setCols: Dispatch<SetStateAction<Col[]>>;
  setFocusedId: Dispatch<SetStateAction<number | null>>;
  setView: (v: "cabina" | "lienzo") => void;
}

/** Cuánto dura el aviso de «cerrada», y con él el Ctrl+Z dentro del Lienzo. */
export const AVISO_MS = 15_000;

export function useDeshacerCierre({
  panesRef,
  canvasPanesRef,
  viewRef,
  nextId,
  nextCol,
  setPanes,
  setCanvasPanes,
  setCols,
  setFocusedId,
  setView,
}: ManosDelDeshacer) {
  const cerradasRef = useRef<Array<{ donde: "cabina" | "lienzo"; pane: Pane | CanvasPane }>>([]);
  /** El nombre de la última cerrada mientras se enseña su aviso. */
  const [deshacer, setDeshacer] = useState<string | null>(null);
  const deshacerRef = useRef<string | null>(null);
  deshacerRef.current = deshacer;
  const deshacerTimer = useRef(0);

  /** Se llama ANTES de quitar el panel: lee las listas tal como están. */
  const apuntarCerrada = useCallback(
    (id: number) => {
      const enCabina = panesRef.current.find((p) => p.id === id);
      if (enCabina && (enCabina.web != null || enCabina.archivos?.length)) return;
      const pane = enCabina ?? canvasPanesRef.current.find((p) => p.id === id);
      if (!pane) return;
      cerradasRef.current.push({ donde: enCabina ? "cabina" : "lienzo", pane });
      if (cerradasRef.current.length > 10) cerradasRef.current.shift();
      setDeshacer(pane.name);
      window.clearTimeout(deshacerTimer.current);
      deshacerTimer.current = window.setTimeout(() => setDeshacer(null), AVISO_MS);
    },
    [panesRef, canvasPanesRef],
  );

  const reabrirCerrada = useCallback(async () => {
    const c = cerradasRef.current.pop();
    setDeshacer(null);
    if (!c) return;
    const command = await resumeCommandFor(c.pane);
    const id = nextId.current++;
    const { id: _viejo, ...resto } = c.pane;
    if (c.donde === "lienzo") {
      setCanvasPanes((prev) => [...prev, { ...resto, id, command } as CanvasPane]);
      setView("lienzo");
      return;
    }
    setPanes((prev) => [...prev, { ...resto, id, command } as Pane]);
    setCols((prev) => layoutAdd(prev, id, () => nextCol.current++));
    setFocusedId(id);
    setView("cabina");
  }, [nextId, nextCol, setPanes, setCanvasPanes, setCols, setFocusedId, setView]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey || e.key.toLowerCase() !== "z") return;
      if (!cerradasRef.current.length) return;
      const el = document.activeElement as HTMLElement | null;
      // `contenteditable` cubre también el área del editor de archivos; no se
      // nombra su clase, que `pnpm arranque` la tomaría por el editor entero.
      if (el?.closest(".xterm, input, textarea, [contenteditable='true']")) return;
      if (viewRef.current === "lienzo" && !deshacerRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      void reabrirCerrada();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [reabrirCerrada, viewRef]);

  return { deshacer, apuntarCerrada, reabrirCerrada };
}
