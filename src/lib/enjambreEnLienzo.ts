// El enjambre, visto desde el lienzo: crear la pieza, meter y sacar sesiones,
// minimizar sus terminales y el gesto de soltar una terminal encima de otra.
//
// Vive aquí y no en `CanvasView.tsx` porque ese fichero está en su techo
// (`pnpm gordos`): el lienzo solo llama a `useEnjambres` y cuelga sus cuatro
// asas. De qué color es cada enjambre, qué dice cada fila y sobre quién cae una
// terminal lo decide `lib/enjambre.ts`, que se prueba sin ventana; esto se
// prueba con el doble, en `scripts/laboratorio/enjambre.js`.
//
// TRES COSAS QUE NO SE DEDUCEN MIRANDO:
//
// 1. Una terminal minimizada NO se desmonta ni se encoge. Desmontarla mata su
//    proceso, y encogerla le cambia el tamaño al PTY y el CLI lo repinta todo
//    a tres columnas. Se queda entera, invisible (`visibility: hidden`, como
//    la tapa de lejos) y guardada debajo de la tarjeta, para que no ocupe
//    sitio en el tablero.
// 2. Soltar una terminal encima de otra hasta hoy solo la movía. Para que
//    ordenar el tablero no funda nada sin querer, juntar pide DOS cosas: tapar
//    más de la mitad (`SOLAPE_PARA_JUNTAR`) y quedarse ahí un instante, hasta
//    que la de debajo se enciende. Y la que arrastraste vuelve a su sitio: el
//    arrastre fue un gesto, no una mudanza.
// 3. Los miembros se guardan por el NODO de su terminal. Al reabrir el tablero
//    las terminales nacen con otro número de panel, y se traducen con el mismo
//    mapa que las flechas.

import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import type { Node } from "@xyflow/react";
import { create } from "zustand";
import { kindDeComando } from "../components/KindIcon";
import {
  alLado,
  colorLibre,
  dondeNace,
  ENJAMBRE_H,
  ENJAMBRE_W,
  MAX_MIEMBROS,
  nombreNuevo,
  porQueNoSeJuntan,
  puedeEntrar,
  sobreQuien,
  TURNO_ACABADO,
  tinteDe,
  type Caja,
  type Miembro,
  type SesionVista,
} from "./enjambre";
import { conserjeEnviar, nuevoId } from "./conserje";
import type { NodoEnjambre, NodoGuardado } from "./canvasFile";
import type { Translate } from "./i18n";
import { codexContext, codexLastReply, lastReply, sendPty, sessionContext, type PaneStatus } from "./pty";

/** Lo que guarda la pieza. Lo demás (cómo va cada sesión, cómo se llama) se
 *  lee en vivo de `useLienzoVivo`: guardado aquí sería la foto de ayer. */
export interface EnjambreData extends Record<string, unknown> {
  nodeId: string;
  /** El archivo de su conversación, que es un enjambre de `conserje.rs`. */
  conv: string;
  nombre: string;
  /** El color de SU Adeo (un nombre de `COLORES`): el enjambre azul, el verde… */
  color: string;
  miembros: Miembro[];
  /** Sus terminales están minimizadas (guardadas debajo de la tarjeta). */
  plegadas: boolean;
  /** Recién juntado: todavía pregunta qué hacer con sus terminales. */
  eligiendo?: boolean;
  onMiembros: (nodeId: string, miembros: Miembro[]) => void;
  onPlegar: (nodeId: string, plegadas: boolean) => void;
  onRename: (nodeId: string, nombre: string) => void;
  onClose: (nodeId: string) => void;
  onIr: (nodeId: string, panel: number) => void;
}

/** Lo que las piezas leen en vivo, que rellena el lienzo. */
interface Vivo {
  /** Las terminales del lienzo, con su CLI. */
  sesiones: SesionVista[];
  estados: Record<number, PaneStatus>;
  /** En qué enjambre está cada panel, para no ofrecer el que ya tiene dueño. */
  duenos: Record<number, string>;
}
export const useLienzoVivo = create<Vivo>(() => ({ sesiones: [], estados: {}, duenos: {} }));

/** La clase de una terminal minimizada, y la de la pieza sobre la que vas a
 *  soltar otra. Las pinta `src/estilos/28-enjambre.css`. */
export const CLASE_MIN = "enj-min";
export const CLASE_DIANA = "enj-diana";

/** Cuánto hay que aguantar una terminal encima de otra para que soltarla las
 *  junte. Lo justo para que pasar por encima camino de otro sitio no cuente. */
export const ESPERA_PARA_JUNTAR_MS = 450;

const TERM_W = 640;
const TERM_H = 420;

const cajaDe = (n: Node, w = TERM_W, h = TERM_H): Caja => ({
  x: n.position.x,
  y: n.position.y,
  w: n.measured?.width ?? (Number(n.style?.width) || w),
  h: n.measured?.height ?? (Number(n.style?.height) || h),
});

interface Puntero {
  x: number;
  y: number;
}

/** Dónde está el ratón (o el dedo) en un evento de arrastre de React Flow. */
function punteroDe(ev: unknown): Puntero | undefined {
  const e = ev as { clientX?: number; clientY?: number; changedTouches?: ArrayLike<{ clientX: number; clientY: number }> } | undefined;
  if (typeof e?.clientX === "number" && typeof e.clientY === "number") return { x: e.clientX, y: e.clientY };
  const dedo = e?.changedTouches?.[0];
  return dedo ? { x: dedo.clientX, y: dedo.clientY } : undefined;
}

const datosDe = (n: Node): EnjambreData => n.data as EnjambreData;
const esEnjambre = (n: Node): boolean => n.type === "enjambre";

/**
 * Deja cada terminal de un enjambre donde le toca: guardada debajo de la
 * tarjeta si están minimizadas, y a la vista si no. Las que estaban guardadas
 * y ya no lo están (porque salieron del grupo o porque se han vuelto a
 * enseñar) aparecen en fila a su derecha; las que ya se veían no se mueven.
 */
export function colocar<N extends Node>(nodos: N[], enjId: string): N[] {
  const enj = nodos.find((n) => n.id === enjId);
  if (!enj) return nodos;
  const d = datosDe(enj);
  const caja = cajaDe(enj, ENJAMBRE_W, ENJAMBRE_H);
  const suyas = new Set(d.miembros.map((m) => String(m.panel)));
  // De quién es cada terminal, en cualquier enjambre: una guardada que ya no
  // es de ninguno (acaba de salir del suyo) también tiene que aparecer.
  const deAlguien = new Set<string>();
  for (const n of nodos) if (esEnjambre(n)) for (const m of datosDe(n).miembros) deAlguien.add(String(m.panel));
  const debajo = { x: caja.x + 12, y: caja.y + 12 };
  // Las suyas que ya se ven ocupan sitio a su lado: las que aparecen van detrás.
  let hueco = nodos.filter((n) => n.type === "term" && suyas.has(n.id) && n.className !== CLASE_MIN).length;
  return nodos.map((n) => {
    if (n.type !== "term") return n;
    const guardada = n.className === CLASE_MIN;
    if (suyas.has(n.id) && d.plegadas) {
      const enSuSitio = guardada && n.position.x === debajo.x && n.position.y === debajo.y;
      return enSuSitio ? n : { ...n, className: CLASE_MIN, position: debajo, selected: false };
    }
    if (!guardada || (!suyas.has(n.id) && deAlguien.has(n.id))) return n;
    const c = cajaDe(n);
    return { ...n, className: undefined, position: alLado(caja, hueco++, c.w, c.h) };
  });
}

/** Lo que se guarda de un enjambre en el archivo del lienzo. La posición y el
 *  id los pone quien guarda, igual que en las demás piezas. */
export function guardarEnjambre(n: Node): Omit<NodoEnjambre, "id" | "x" | "y"> {
  const d = datosDe(n);
  const c = cajaDe(n, ENJAMBRE_W, ENJAMBRE_H);
  return {
    w: Math.round(c.w),
    h: Math.round(c.h),
    tipo: "enjambre",
    conv: d.conv,
    nombre: d.nombre,
    color: d.color,
    miembros: d.miembros.map((m) => ({ nodo: String(m.panel) })),
    plegadas: d.plegadas,
  };
}

/** Una sesión de la que se puede traer la respuesta: dónde está y quién sabe
 *  leerla (`lectorDeRespuesta`). */
export interface SesionLeible {
  lector: "transcript" | "rollout";
  cwd: string;
  sid: string;
}

/** Lo último que contestó, leído de donde lo deja su CLI. */
export const respuestaDe = (s: SesionLeible, largo: number): Promise<string | null> =>
  s.lector === "rollout" ? codexLastReply(s.sid, largo) : lastReply(s.cwd, s.sid, largo);

/** Si su turno está acabado AHORA, preguntado a su fichero y no a su panel,
 *  que se relee cada veinte segundos. */
export const turnoAcabadoEn = (s: SesionLeible): Promise<boolean> =>
  (s.lector === "rollout" ? codexContext(s.sid) : sessionContext(s.cwd, s.sid)).then((c) => TURNO_ACABADO.has(c?.state ?? ""));

export interface EnvioAlEnjambre {
  /** Lo que la reja tiró o no llegó a una terminal, en una frase. */
  aviso: string | null;
  /** Por qué Adeo no contestó. Nulo también si lo paraste tú. */
  error: string | null;
  /** Los paneles a los que les ha llegado algo. */
  escritos: number[];
}

/**
 * Lo que escribes en la caja del grupo: va a Adeo, que decide a quién toca y
 * se lo reescribe (`SISTEMA_ENJAMBRE`, en `conserje.rs`), y aquí se le escribe
 * a cada terminal lo que haya pasado la reja. Como en las flechas, el texto va
 * pegado y el Intro aparte (`sendPty`).
 */
export async function enviarAlEnjambre(conv: string, texto: string, estados: Record<string, string>): Promise<EnvioAlEnjambre> {
  try {
    const r = await conserjeEnviar(conv, texto, estados);
    const fuera = [...r.descartes];
    const escritos: number[] = [];
    for (const a of r.acciones) {
      if (a.tipo !== "escribir") continue;
      try {
        await sendPty(a.panel, a.texto);
        escritos.push(a.panel);
      } catch {
        fuera.push(`no le llegó el mensaje al panel ${a.panel}`);
      }
    }
    return { aviso: fuera.length ? fuera.join(" · ") : null, error: null, escritos };
  } catch (e) {
    const s = String(e);
    // Lo tuyo ya está guardado (Rust lo apunta antes de llamar al modelo): se
    // ofrece reintentarlo en vez de devolverlo a la caja.
    return { aviso: null, error: s === "parado" ? null : s, escritos: [] };
  }
}

interface Manos<N extends Node> {
  /** Las terminales del lienzo, tal como las tiene él. */
  panes: Array<{ id: number; cwd: string; name: string; command?: string[]; account?: string }>;
  estados: Record<number, PaneStatus>;
  nodes: N[];
  setNodes: Dispatch<SetStateAction<N[]>>;
  /** Dónde cae una pieza nueva que no nace de un gesto. */
  dondeCae: (w: number, h: number, ya: N[]) => { x: number; y: number };
  /** La cámara a una pieza, por su id de nodo. */
  zoomANodo: (nodeId: string) => void;
  avisar: (texto: string) => void;
  t: Translate;
}

export function useEnjambres<N extends Node>({ panes, estados, nodes, setNodes, dondeCae, zoomANodo, avisar, t }: Manos<N>) {
  const sesiones = useMemo<SesionVista[]>(
    () =>
      panes.map((p) => ({
        panel: p.id,
        nombre: p.name,
        carpeta: p.cwd,
        cli: kindDeComando(p.command?.join(" ") ?? ""),
        cuenta: p.account,
      })),
    [panes],
  );
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const sesionesRef = useRef(sesiones);
  sesionesRef.current = sesiones;

  // Lo que las piezas leen en vivo. `duenos` sale de los nodos: es de quién es
  // cada panel AHORA, no de quién fue.
  useEffect(() => {
    const duenos: Record<number, string> = {};
    const guardables = new Set<string>();
    for (const n of nodes) {
      if (!esEnjambre(n)) continue;
      for (const m of datosDe(n).miembros) {
        duenos[m.panel] = n.id;
        if (datosDe(n).plegadas) guardables.add(String(m.panel));
      }
    }
    useLienzoVivo.setState({ sesiones, estados, duenos });
    // LA RED: una terminal invisible que no es de un enjambre minimizado no
    // tiene quien la enseñe. No debería pasar; si pasa, aparece donde esté.
    if (nodes.some((n) => n.className === CLASE_MIN && !guardables.has(n.id))) {
      setNodes((prev) => prev.map((n) => (n.className === CLASE_MIN && !guardables.has(n.id) ? { ...n, className: undefined } : n)));
    }
  }, [sesiones, estados, nodes, setNodes]);

  /** Cambia los datos de un enjambre y recoloca sus terminales. */
  const retocar = useCallback(
    (nodeId: string, cambio: (d: EnjambreData) => Partial<EnjambreData>) => {
      setNodes((prev) =>
        colocar(
          prev.map((n) => (n.id === nodeId && esEnjambre(n) ? ({ ...n, data: { ...n.data, ...cambio(datosDe(n)) } } as N) : n)),
          nodeId,
        ),
      );
    },
    [setNodes],
  );

  const onMiembros = useCallback(
    (nodeId: string, miembros: Miembro[]) => retocar(nodeId, () => ({ miembros: miembros.slice(0, MAX_MIEMBROS) })),
    [retocar],
  );
  const onPlegar = useCallback(
    (nodeId: string, plegadas: boolean) => retocar(nodeId, () => ({ plegadas, eligiendo: false })),
    [retocar],
  );
  const onRename = useCallback((nodeId: string, nombre: string) => retocar(nodeId, () => ({ nombre })), [retocar]);

  /** Deshacer el enjambre: la pieza se va y sus terminales se quedan, a la
   *  vista. La conversación la borra la pieza, que es quien sabe si hay algo. */
  const onClose = useCallback(
    (nodeId: string) => {
      setNodes((prev) =>
        colocar(
          prev.map((n) => (n.id === nodeId ? ({ ...n, data: { ...n.data, miembros: [], plegadas: false } } as N) : n)),
          nodeId,
        ).filter((n) => n.id !== nodeId),
      );
    },
    [setNodes],
  );

  /** Ir a la terminal de una fila. Si estaba minimizada se enseña esa sola: se
   *  saca de debajo de la tarjeta y se queda a su lado. */
  const onIr = useCallback(
    (nodeId: string, panel: number) => {
      setNodes((prev) => {
        const enj = prev.find((n) => n.id === nodeId);
        const term = prev.find((n) => n.id === String(panel));
        if (!enj || !term || term.className !== CLASE_MIN) return prev;
        const c = cajaDe(term);
        const alDescubierto = prev.filter((n) => n.type === "term" && n.className !== CLASE_MIN && datosDe(enj).miembros.some((m) => String(m.panel) === n.id)).length;
        return prev.map((n) =>
          n.id === term.id ? { ...n, className: undefined, position: alLado(cajaDe(enj, ENJAMBRE_W, ENJAMBRE_H), alDescubierto, c.w, c.h) } : n,
        );
      });
      window.setTimeout(() => zoomANodo(String(panel)), 60);
    },
    [setNodes, zoomANodo],
  );

  const nodoDe = useCallback(
    (d: Pick<EnjambreData, "conv" | "nombre" | "color" | "miembros" | "plegadas" | "eligiendo">, en: { x: number; y: number; w?: number; h?: number }): N => {
      const nodeId = `j${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
      return {
        id: nodeId,
        type: "enjambre",
        position: { x: en.x, y: en.y },
        style: { width: en.w ?? ENJAMBRE_W, height: en.h ?? ENJAMBRE_H },
        dragHandle: ".enj-head",
        // Por encima de las terminales: las suyas se guardan debajo.
        zIndex: 2,
        data: { ...d, nodeId, onMiembros, onPlegar, onRename, onClose, onIr },
      } as unknown as N;
    },
    [onMiembros, onPlegar, onRename, onClose, onIr],
  );

  const nombres = (lista: N[]) => lista.filter(esEnjambre).map((n) => datosDe(n).nombre);
  const colores = (lista: N[]) => lista.filter(esEnjambre).map((n) => datosDe(n).color);

  /** Un enjambre nuevo desde «Añadir»: nace vacío donde miras y con la lista
   *  de sesiones abierta, que es donde se marcan las que entran. */
  const crear = useCallback(() => {
    setNodes((prev) => [
      ...prev,
      nodoDe(
        { conv: nuevoId(), nombre: nombreNuevo(t("Enjambre"), nombres(prev)), color: colorLibre(colores(prev)), miembros: [], plegadas: false },
        dondeCae(ENJAMBRE_W, ENJAMBRE_H, prev),
      ),
    ]);
  }, [setNodes, nodoDe, dondeCae, t]);

  /* ── el gesto: una terminal encima de otra ──────────────────────────────── */

  /** De dónde salió la terminal que se arrastra, para devolverla. */
  const origen = useRef<{ id: string; x: number; y: number } | null>(null);
  /** Sobre qué pieza está ahora, con el reloj de su espera; `lista` cuando ya
   *  lleva el rato que hace falta y la de debajo está encendida. */
  const diana = useRef<{ id: string | null; reloj: number; lista: boolean }>({ id: null, reloj: 0, lista: false });

  const encender = useCallback(
    (id: string | null) => {
      setNodes((prev) =>
        prev.map((n) => {
          const es = n.id === id;
          if (es === (n.className === CLASE_DIANA)) return n;
          return es ? { ...n, className: CLASE_DIANA } : n.className === CLASE_DIANA ? { ...n, className: undefined } : n;
        }),
      );
    },
    [setNodes],
  );

  /** Sobre qué pieza está una terminal: otra terminal de agente a la vista o
   *  un enjambre. Una consola ni entra ni recibe. */
  const debajoDe = useCallback((n: Node, puntero?: Puntero): string | null => {
    if (n.type !== "term") return null;
    const cli = (panel: string) => sesionesRef.current.find((s) => String(s.panel) === panel)?.cli ?? "shell";
    if (!puedeEntrar(cli(n.id))) return null;
    // Sobre un ENJAMBRE manda el puntero: quien lleva una terminal a una
    // tarjeta apunta con el ratón, no con la caja, y la tarjeta es más
    // estrecha que la terminal (cogida por una punta de la cabecera apenas la
    // tapaba y no entraba). Sobre otra terminal sigue mandando cuánto la tapa,
    // que es lo que evita juntarlas al ordenar el tablero.
    if (puntero) {
      const tarjeta = document.elementsFromPoint(puntero.x, puntero.y).find((e) => e.classList.contains("react-flow__node-enjambre"));
      const id = tarjeta?.getAttribute("data-id");
      if (id && nodesRef.current.some((o) => o.id === id)) return id;
    }
    const otras = nodesRef.current
      .filter((o) => o.id !== n.id && (esEnjambre(o) || (o.type === "term" && o.className !== CLASE_MIN && puedeEntrar(cli(o.id)))))
      .map((o) => ({ id: o.id, caja: esEnjambre(o) ? cajaDe(o, ENJAMBRE_W, ENJAMBRE_H) : cajaDe(o) }));
    return sobreQuien(cajaDe(n), otras);
  }, []);

  /** Lo mismo sin mirar quién puede entrar: sobre qué pieza se ha soltado una
   *  terminal, sea consola o sesión, para poder decir por qué no se juntan. */
  const encimaDe = useCallback((n: Node): { sueltaEntra: boolean; debajo: { entra: boolean } | null } => {
    const entra = (o: Node) =>
      esEnjambre(o) || puedeEntrar(sesionesRef.current.find((s) => String(s.panel) === o.id)?.cli ?? "shell");
    const otras = nodesRef.current
      .filter((o) => o.id !== n.id && (esEnjambre(o) || (o.type === "term" && o.className !== CLASE_MIN)))
      .map((o) => ({ id: o.id, caja: esEnjambre(o) ? cajaDe(o, ENJAMBRE_W, ENJAMBRE_H) : cajaDe(o) }));
    const id = sobreQuien(cajaDe(n), otras);
    const pieza = id ? nodesRef.current.find((o) => o.id === id) : undefined;
    return { sueltaEntra: entra(n), debajo: pieza ? { entra: entra(pieza) } : null };
  }, []);

  const alCoger = useCallback((n: Node) => {
    origen.current = n.type === "term" ? { id: n.id, x: n.position.x, y: n.position.y } : null;
    window.clearTimeout(diana.current.reloj);
    diana.current = { id: null, reloj: 0, lista: false };
  }, []);

  const alArrastrar = useCallback(
    (n: Node, ev?: unknown) => {
      if (n.type !== "term") return;
      const sobre = debajoDe(n, punteroDe(ev));
      const d = diana.current;
      if (sobre === d.id) return;
      // Ha cambiado de pieza (o ha salido de todas): la espera empieza de
      // nuevo. Va con reloj y no contando en cada movimiento, porque quien
      // aguanta la terminal quieta encima de otra no mueve el ratón.
      window.clearTimeout(d.reloj);
      if (d.lista) encender(null);
      const nueva = { id: sobre, reloj: 0, lista: false };
      if (sobre) {
        nueva.reloj = window.setTimeout(() => {
          if (diana.current !== nueva) return;
          nueva.lista = true;
          encender(sobre);
        }, ESPERA_PARA_JUNTAR_MS);
      }
      diana.current = nueva;
    },
    [debajoDe, encender],
  );

  const alSoltar = useCallback(
    (n: Node, ev?: unknown) => {
      const d = diana.current;
      window.clearTimeout(d.reloj);
      diana.current = { id: null, reloj: 0, lista: false };
      // El enjambre se ha movido: sus terminales guardadas van con él.
      if (esEnjambre(n)) {
        if (datosDe(n).plegadas) {
          const debajo = { x: n.position.x + 12, y: n.position.y + 12 };
          const suyas = new Set(datosDe(n).miembros.map((m) => String(m.panel)));
          setNodes((prev) => prev.map((x) => (x.className === CLASE_MIN && suyas.has(x.id) ? { ...x, position: debajo } : x)));
        }
        return;
      }
      if (n.type !== "term" || !d.lista || !d.id || debajoDe(n, punteroDe(ev)) !== d.id) {
        if (d.lista) encender(null);
        // No se han juntado: si estaba encima de otra, se dice por qué.
        if (n.type === "term") {
          const { sueltaEntra, debajo } = encimaDe(n);
          const motivo = porQueNoSeJuntan(sueltaEntra, debajo, d.lista);
          if (motivo === "consola") avisar(t("Una consola no entra en un enjambre: solo se juntan sesiones de un agente."));
          else if (motivo === "pronto") avisar(t("Para juntarlas, aguanta la terminal encima hasta que la de debajo se encienda, y suelta."));
        }
        return;
      }
      const vuelve = origen.current?.id === n.id ? origen.current : null;
      const suelta = Number(n.id);
      const sobre = d.id;
      setNodes((prev) => {
        const destino = prev.find((x) => x.id === sobre);
        if (!destino) return prev;
        const enjDe = (panel: string) => prev.find((x) => esEnjambre(x) && datosDe(x).miembros.some((m) => String(m.panel) === panel));
        // A qué enjambre va: al que es el destino, al que ya tiene a una de las
        // dos, o a uno nuevo con las dos.
        const grupo = esEnjambre(destino) ? destino : (enjDe(destino.id) ?? enjDe(n.id));
        const entran = [suelta, ...(esEnjambre(destino) ? [] : [Number(destino.id)])];
        const limpio = prev.map((x) => {
          let y = x.className === CLASE_DIANA ? { ...x, className: undefined } : x;
          // La que arrastraste vuelve a donde estaba.
          if (y.id === n.id && vuelve) y = { ...y, position: { x: vuelve.x, y: vuelve.y } };
          return y;
        });
        if (!grupo) {
          const cajas = limpio.filter((x) => entran.includes(Number(x.id)) && x.type === "term").map((x) => cajaDe(x));
          const miembros: Miembro[] = [{ panel: Number(destino.id) }, { panel: suelta }];
          const nuevo = nodoDe(
            { conv: nuevoId(), nombre: nombreNuevo(t("Enjambre"), nombres(prev)), color: colorLibre(colores(prev)), miembros, plegadas: false, eligiendo: true },
            dondeNace(cajas),
          );
          return [...limpio, nuevo];
        }
        const dg = datosDe(grupo);
        const miembros = [...dg.miembros];
        for (const p of entran) {
          if (miembros.some((m) => m.panel === p) || miembros.length >= MAX_MIEMBROS) continue;
          miembros.push({ panel: p });
        }
        // Una terminal está en un solo enjambre: si venía de otro, sale de él.
        const sinLaQueEntra = limpio.map((x) =>
          esEnjambre(x) && x.id !== grupo.id && datosDe(x).miembros.some((m) => entran.includes(m.panel))
            ? ({ ...x, data: { ...x.data, miembros: datosDe(x).miembros.filter((m) => !entran.includes(m.panel)) } } as N)
            : x,
        );
        return colocar(
          sinLaQueEntra.map((x) => (x.id === grupo.id ? ({ ...x, data: { ...x.data, miembros } } as N) : x)),
          grupo.id,
        );
      });
      avisar(t("Juntadas en un enjambre. Su ✕ lo deshace y las terminales se quedan."));
    },
    [setNodes, debajoDe, encimaDe, encender, nodoDe, avisar, t],
  );

  // Una terminal que se cierra deja de ser de su enjambre.
  useEffect(() => {
    const vivas = new Set(sesiones.map((s) => s.panel));
    const cojos = nodesRef.current.filter((n) => esEnjambre(n) && datosDe(n).miembros.some((m) => !vivas.has(m.panel)));
    if (!cojos.length) return;
    setNodes((prev) =>
      prev.map((n) =>
        esEnjambre(n) && datosDe(n).miembros.some((m) => !vivas.has(m.panel))
          ? ({ ...n, data: { ...n.data, miembros: datosDe(n).miembros.filter((m) => vivas.has(m.panel)) } } as N)
          : n,
      ),
    );
  }, [sesiones, setNodes]);

  /** Los enjambres de un tablero que se abre. Va DESPUÉS de sus terminales:
   *  `mapa` dice con qué panel ha renacido cada una. Una que no se ha abierto
   *  (un tablero importado sin terminales) simplemente no está. */
  const cargar = useCallback(
    (guardados: NodoGuardado[], mapa: Map<string, string>) => {
      for (const g of guardados) {
        if (g.tipo !== "enjambre") continue;
        const miembros: Miembro[] = [];
        for (const m of g.miembros) {
          const panel = Number(mapa.get(m.nodo));
          if (Number.isFinite(panel) && panel > 0 && !miembros.some((x) => x.panel === panel)) miembros.push({ panel });
        }
        const nodo = nodoDe({ conv: g.conv, nombre: g.nombre, color: g.color, miembros, plegadas: g.plegadas }, g);
        mapa.set(g.id, nodo.id);
        // El color es el que tenía. Uno que este Adeorq no conoce coge el
        // primero libre entre los enjambres que ya hay en el tablero.
        setNodes((prev) => {
          const color = tinteDe(g.color) ? g.color : colorLibre(colores(prev));
          return colocar([...prev, { ...nodo, data: { ...nodo.data, color } } as N], nodo.id);
        });
      }
    },
    [setNodes, nodoDe],
  );

  return { crear, cargar, alCoger, alArrastrar, alSoltar };
}
