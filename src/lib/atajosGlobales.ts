// Los atajos de teclado de la app: Ctrl+Mayús+tecla, estés donde estés.
//
// Vivían dentro de `App()`. Salieron el 2026-10-10, tal cual y con su huella
// (`scripts/laboratorio/atajos-globales.js`: la misma antes y después), para
// hacer sitio en un fichero que estaba a una línea de su techo. Todos piden
// Mayús además de Ctrl a propósito: dentro de una terminal Ctrl+letra es del
// programa que corre en ella. La paleta (`lib/paleta.ts`) los ofrece también
// y los dispara pulsando esta misma tecla, así que un atajo nuevo se apunta
// en los dos sitios (su banco, `scripts/paleta-check.ts`, lo coteja).

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { raiz } from "./perfil";

/** Dónde se guarda si el modo emisión está puesto. */
export const STREAM_KEY = "adeorq-stream";

export function useAtajosGlobales(m: {
  focusedId: number | null;
  panes: Array<{ id: number; name: string; cwd: string }>;
  addPane: (name: string, cwd: string) => unknown;
  splitPane: (id: number, dir: "right" | "down") => void;
  onToggleMax: (id: number) => void;
  showForeman: boolean;
  setDictarAlAbrir: (v: boolean) => void;
  setShowForeman: Dispatch<SetStateAction<boolean>>;
  setPanic: Dispatch<SetStateAction<boolean>>;
  setStream: Dispatch<SetStateAction<boolean>>;
}): void {
  const { focusedId, panes, addPane, splitPane, onToggleMax, showForeman, setDictarAlAbrir, setShowForeman, setPanic, setStream } = m;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      const k = e.key.toLowerCase();
      if ((k === "d" || e.key === "ArrowDown") && focusedId != null) {
        e.preventDefault();
        splitPane(focusedId, "down");
      } else if (e.key === "ArrowRight" && focusedId != null) {
        e.preventDefault();
        splitPane(focusedId, "right");
      } else if (k === "f" && focusedId != null) {
        e.preventDefault();
        onToggleMax(focusedId);
      } else if (k === "a") {
        e.preventDefault();
        // Abierto a mano no graba: solo el atajo del micrófono pone esto.
        setDictarAlAbrir(false);
        setShowForeman((v) => !v);
      } else if (k === "m" && !showForeman) {
        // Dictar desde donde estés: se abre el Asistente ya grabando. Con el
        // Asistente abierto este atajo es suyo (enciende y apaga), y por eso
        // aquí solo se coge cuando está cerrado: si lo cogieran los dos, un
        // Ctrl+Mayús+M abriría dos micrófonos a la vez.
        e.preventDefault();
        setDictarAlAbrir(true);
        setShowForeman(true);
      } else if (k === "p") {
        e.preventDefault();
        setPanic((v) => !v);
      } else if (k === "e") {
        e.preventDefault();
        setStream((v) => {
          localStorage.setItem(STREAM_KEY, v ? "0" : "1");
          return !v;
        });
      } else if (k === "t") {
        e.preventDefault();
        const src = panes.find((p) => p.id === focusedId);
        addPane(
          src ? `${src.name} · shell` : "proyectos · terminal",
          src?.cwd ?? raiz(),
        );
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [focusedId, panes, addPane, splitPane, onToggleMax]);
}
