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
import { useCabina } from "./cabina";
/* Los tipos del tablero. Vivían en App.tsx.
   `Team` es el puesto de una cuadrilla, y va aquí porque `Pane` y `SavedPane`
   lo llevan dentro. */

export interface Pane {
  id: number;
  cwd: string;
  name: string;
  command?: string[];
  /** Which account it was born with: CLAUDE_CONFIG_DIR, set once at spawn. */
  env?: Record<string, string>;
  account?: string;
  /** La cuadrilla a la que pertenece, si nació dentro de un reparto. Sirve
      para que se VEA que esas terminales van juntas: seis paneles iguales no
      dicen que estén trabajando en lo mismo. */
  team?: Team;
  /** El grupo de la barra lateral del que salió, si vino de abrir uno entero.
      Es lo que permite tratar un grupo como un espacio de trabajo: enseñar el
      que estás usando y apartar los demás sin cerrarlos. */
  grupo?: string;
  shadow?: boolean;
  /** Si esto está puesto, el hueco no es una terminal: son ESOS archivos
      abiertos, con pestañas. Munir eligió esta colocación tocando un prototipo
      el 2026-08-15, y el motivo es su propio eje: el archivo se queda al lado
      del agente que lo está escribiendo. Todo lo que trata un pane como un
      proceso (matarlo, medir su RAM, leerle el estado) se lo encuentra vacío y
      no pasa nada: preguntar por un id que no tiene proceso ya devolvía nada. */
  archivos?: string[];
  /** Cuál de ellos se está viendo. */
  activo?: string;
  /** Y si esto está puesto, el hueco es una vista previa de esa dirección. */
  web?: string;
  /** Todas sus pestañas y cuál se ve. `web` sigue siendo la activa, para que
      todo lo que ya miraba «¿es un panel web?» siga mirando lo mismo. */
  webTabs?: string[];
  webActiva?: number;
}

/** Una cuadrilla: varias terminales repartiéndose una sola tarea. */
export interface Team {
  id: string;
  /** El objetivo común, para poder enseñarlo en cada panel. */
  objetivo: string;
  /** El color con el que se marcan todos sus paneles. */
  color: string;
  /** Qué puesto ocupa este panel dentro de la cuadrilla. */
  rol: string;
  /** Lo que se le mandó a ESTE puesto, no a la cuadrilla. El objetivo de
      arriba es común a todos y por eso no distingue: seis filas con el mismo
      objetivo y un rol de una palabra no dicen quién hace qué. */
  encargo: string;
  /** Los archivos que son SUYOS, cuando el reparto los calculó. Es la única
      respuesta a «¿y estos dos no se van a pisar?», y hasta ahora se calculaba
      para el prompt y se tiraba. */
  frontera?: string;
  /** Cuándo se abrió la cuadrilla entera. Lo comparten todos sus puestos, así
      que sirve para saber cuánto lleva viva sin preguntárselo a nadie. */
  desde?: number;
  /** Cuántos son en total, para el "2 de 5". */
  de: number;
  n: number;
}

// A terminal is a running program: closing Adeorq kills it, and no update can
// carry a live process across a restart. What CAN be carried is the board: the
// same panes, in the same folders, with each Claude resuming ITS OWN
// conversation. That is why every Claude is launched with its own session id.
export interface SavedPane {
  name: string;
  cwd: string;
  command?: string[];
  env?: Record<string, string>;
  account?: string;
  // Sin esto una cuadrilla se deshacía al reabrir Adeorq: los paneles volvían
  // pero ya no se veían como el mismo encargo. Opcional a propósito, porque un
  // tablero guardado antes de que este campo existiera no lo trae.
  team?: Team;
  /** El grupo de la barra al que pertenece, para poder volver a apartarlo. */
  grupo?: string;
  /** Estaba minimizada. Se guarda EN el panel y no como una lista de ids
      aparte, porque los ids se reparten de nuevo en cada arranque y una lista
      de números viejos apartaría terminales al azar. */
  minimizado?: boolean;
  /** No era una terminal, eran estos archivos. Vuelven abiertos donde estaban,
      que cuesta lo mismo que olvidarlos y evita tener que buscarlos otra vez. */
  archivos?: string[];
  activo?: string;
  /** Era una vista previa de esta dirección. */
  web?: string;
  /** Sus pestañas, si tenía más de una. Un tablero guardado antes de que
      existieran no las trae y vuelve con la de siempre. */
  webTabs?: string[];
  webActiva?: number;
}

/** The whole board: which panes, and the mosaic they were arranged in. */
export interface SavedLayout {
  panes: SavedPane[];
  cols: Array<{ w: number; hs: number[]; idx: number[] }>;
  /**
   * Los grupos que estaban apartados. Al reiniciar, Adeorq se olvidaba de en
   * qué estabas trabajando y te devolvía las doce terminales encima (Munir,
   * 2026-08-02): apartar es una decisión y sobrevive al cierre, como el resto
   * del tablero. Los ids son los del estado de la barra, que sí son estables.
   */
  ocultos?: string[];
}

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
  /** El ajuste «devolver el tablero al abrir». */
  restoreOnStart: boolean;
  setPanes: Dispatch<SetStateAction<Pane[]>>;
  setCols: Dispatch<SetStateAction<Col[]>>;
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
  restoreOnStart,
  setPanes,
  setCols,
  setRestoring,
  setView,
}: ManosDelTablero): void {
  // Lo apartado y los grupos viven en el almacén de la Cabina (segundo tramo de
  // la decisión B1): se guardan con el tablero y renacen con él.
  const minimizados = useCabina((s) => s.minimizados);
  const gruposOcultos = useCabina((s) => s.gruposOcultos);
  const setMinimizados = useCabina((s) => s.ponerMinimizados);
  const setGruposOcultos = useCabina((s) => s.ponerGruposOcultos);
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
