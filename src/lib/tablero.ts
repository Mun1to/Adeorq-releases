// El tablero de la Cabina, guardado en cada cambio y devuelto al abrir.
//
// Una terminal es un programa en marcha: cerrar Adeorq la mata, y ninguna
// actualización puede llevarse un proceso vivo a través de un reinicio. Lo que
// SÍ se puede llevar es el tablero: los mismos paneles, en sus carpetas, cada
// agente retomando SU conversación, y el mosaico con sus tamaños. Por eso cada
// Claude nace con un id de sesión propio.
//
// Vivía dentro de `App()`, como dos efectos seguidos. Para comprobarlo sin
// abrir la app de verdad: `scripts/laboratorio/tablero-guardado.js` recorre la
// ida y la vuelta y devuelve una huella de cada una.

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { addPane as layoutAdd, type Col } from "./layout";
import { loadEffort, resumeCommandFor } from "./lanzar";
import type { Pane, SavedLayout, SavedPane } from "../App";

/** Dónde vive el tablero guardado. */
export const LAYOUT_KEY = "adeorq-layout";
/** El respiro entre un panel y el siguiente al renacer, para que no arranquen
    doce CLIs a la vez. */
export const RESTORE_STAGGER_MS = 400;

interface Ref<T> {
  current: T;
}

export interface ManosDelTablero {
  /** Si el tablero ya se devolvió en este arranque. Antes de eso no se guarda:
      el estado vacío del arranque pisaría lo que hay que devolver. */
  restored: Ref<boolean>;
  nextId: Ref<number>;
  nextCol: Ref<number>;
  panes: Pane[];
  cols: Col[];
  minimizados: Set<number>;
  gruposOcultos: Set<string>;
  /** El ajuste «devolver el tablero al abrir». */
  restoreOnStart: boolean;
  setPanes: Dispatch<SetStateAction<Pane[]>>;
  setCols: Dispatch<SetStateAction<Col[]>>;
  setMinimizados: Dispatch<SetStateAction<Set<number>>>;
  setGruposOcultos: Dispatch<SetStateAction<Set<string>>>;
  /** Cuántos paneles quedan por renacer, para el aviso de la Cabina. */
  setRestoring: Dispatch<SetStateAction<number>>;
  setView: (v: "cabina") => void;
}

export function useTableroGuardado({
  restored,
  nextId,
  nextCol,
  panes,
  cols,
  minimizados,
  gruposOcultos,
  restoreOnStart,
  setPanes,
  setCols,
  setMinimizados,
  setGruposOcultos,
  setRestoring,
  setView,
}: ManosDelTablero): void {
  // Remember the board on every change, so a crash or an update loses nothing:
  // the same panes, in the same folders, with the same sizes.
  useEffect(() => {
    if (!restored.current) return;
    const order = new Map<number, number>();
    const saved: SavedPane[] = [];
    panes.forEach((pane) => {
      order.set(pane.id, saved.length);
      saved.push({
        name: pane.name,
        cwd: pane.cwd,
        command: pane.command,
        env: pane.env,
        account: pane.account,
        team: pane.team,
        grupo: pane.grupo,
        minimizado: minimizados.has(pane.id) || undefined,
        archivos: pane.archivos,
        activo: pane.activo,
        web: pane.web,
        webTabs: pane.webTabs,
        webActiva: pane.webActiva,
      });
    });
    const layout: SavedLayout = {
      panes: saved,
      cols: cols.map((c) => ({
        w: c.w,
        hs: c.hs,
        idx: c.panes.map((id) => order.get(id) ?? -1).filter((i) => i >= 0),
      })),
      ocultos: [...gruposOcultos],
    };
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  }, [panes, cols, minimizados, gruposOcultos]);

  // ...and bring it back when Adeorq opens, one pane at a time so twelve CLIs
  // do not start at once. Each Claude resumes ITS OWN conversation.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (!restoreOnStart) return;
    let layout: SavedLayout | null = null;
    try {
      layout = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null") as SavedLayout;
    } catch {
      layout = null;
    }
    if (!layout?.panes?.length) return;
    const saved = layout;
    let cancelled = false;
    setRestoring(saved.panes.length);
    // Antes de abrir nada: si los grupos apartados llegaran después de sus
    // terminales, se verían un instante todas encima, que es justo lo que se
    // había apartado.
    if (saved.ocultos?.length) setGruposOcultos(new Set(saved.ocultos));
    void (async () => {
      // Before rebuilding anything: the restored panes are precisely the ones
      // that were coming back without their effort, so the answer has to be in
      // hand before the first command line is written.
      await loadEffort();
      const ids: number[] = [];
      for (const pane of saved.panes) {
        if (cancelled) return;
        // Un archivo abierto vuelve tal cual: no hay conversación que retomar
        // ni proceso que arrancar, así que tampoco hace falta el respiro entre
        // uno y otro (eso es para que no arranquen doce CLIs a la vez).
        if (pane.web != null) {
          const id = nextId.current++;
          ids.push(id);
          setPanes((prev) => [
            ...prev,
            {
              id,
              cwd: pane.cwd,
              name: pane.name,
              web: pane.web,
              webTabs: pane.webTabs,
              webActiva: pane.webActiva,
            },
          ]);
          if (pane.minimizado) setMinimizados((prev) => new Set(prev).add(id));
          setCols((prev) => layoutAdd(prev, id, () => nextCol.current++));
          setRestoring((n) => n - 1);
          continue;
        }
        if (pane.archivos?.length) {
          const abiertos = pane.archivos;
          const id = nextId.current++;
          ids.push(id);
          setPanes((prev) => [
            ...prev,
            {
              id,
              cwd: pane.cwd,
              name: pane.name,
              archivos: abiertos,
              activo: pane.activo ?? abiertos[0],
            },
          ]);
          if (pane.minimizado) setMinimizados((prev) => new Set(prev).add(id));
          setCols((prev) => layoutAdd(prev, id, () => nextCol.current++));
          setRestoring((n) => n - 1);
          continue;
        }
        const command = await resumeCommandFor(pane);
        const id = nextId.current++;
        ids.push(id);
        // env comes back with the pane: a terminal that belonged to an account
        // must be reborn in that same account, or it would resume a
        // conversation the main account cannot see.
        setPanes((prev) => [
          ...prev,
          {
            id,
            cwd: pane.cwd,
            name: pane.name,
            command,
            env: pane.env,
            account: pane.account,
            team: pane.team,
            grupo: pane.grupo,
          },
        ]);
        // Lo apartado sigue apartado: el id es nuevo, así que se marca aquí,
        // con el panel en la mano, y no con la lista de ids del arranque
        // anterior, que ya no señala a estas terminales.
        if (pane.minimizado) setMinimizados((prev) => new Set(prev).add(id));
        setCols((prev) => layoutAdd(prev, id, () => nextCol.current++));
        setRestoring((n) => n - 1);
        await new Promise((r) => window.setTimeout(r, RESTORE_STAGGER_MS));
      }
      if (cancelled) return;
      // The mosaic goes back exactly as it was, sizes included.
      const cols: Col[] = (saved.cols ?? [])
        .map((c) => ({
          cid: nextCol.current++,
          w: c.w || 1,
          panes: c.idx.map((i) => ids[i]).filter((x) => x !== undefined),
          hs: c.idx.map((_, k) => c.hs?.[k] || 1),
        }))
        .filter((c) => c.panes.length > 0);
      setCols(
        cols.length
          ? cols
          : [{ cid: nextCol.current++, w: 1, panes: ids, hs: ids.map(() => 1) }],
      );
      setView("cabina");
    })();
    return () => {
      cancelled = true;
    };
  }, [restoreOnStart]);
}
