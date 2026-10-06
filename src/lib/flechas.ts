// Lo que viaja por una flecha del lienzo.
//
// Una flecha entre dos terminales lleva un encargo. Cuando el agente de origen
// acaba su turno, al de destino se le entrega ese encargo junto con la última
// respuesta del primero: a mano (sale un aviso con su botón) o sola, si la
// flecha está en automático. Una automática que se pasa el relevo tres veces
// seguidas se frena y vuelve a mano, porque casi siempre es un círculo y cada
// vuelta es un turno de agente que se paga.
//
// Vivía dentro de `Canvas()`. Para comprobarlo sin dos agentes de verdad:
// `scripts/laboratorio/relevo-lienzo.js` recorre los dos modos con la campana
// del doble y devuelve una huella de lo que se le escribió al destino.

import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { Edge } from "@xyflow/react";
import { sessionIdOf } from "./comandos";
import { lastReply, sendPty, sessionContext, type WorkState } from "./pty";
import type { Translate } from "./i18n";
import type { CanvasPane } from "../components/CanvasView";

/** What travels along an arrow when the upstream agent finishes. */
export interface Relay {
  edgeId: string;
  fromId: number;
  toId: number;
  fromName: string;
  toName: string;
  brief: string;
  /** Arrows marked auto skip the button and hand over on their own. */
  auto: boolean;
  /** Por qué este relevo sigue parado, cuando lo está. La entrega automática
   *  se frena sola si el agente de origen no terminó (te preguntó algo) o si
   *  la flecha se ha desbocado; el motivo se enseña en la barra en vez de
   *  dejar un relevo quieto sin explicación. */
  espera?: string;
}

/** Los estados en los que el agente NO ha terminado: te está hablando a ti.
 *  Entregar aquí le manda media respuesta al siguiente de la cadena. */
const TE_HABLA_A_TI = new Set<WorkState>(["pregunta", "ofrece", "tuya"]);

/** Cuántas entregas automáticas seguidas admite una flecha, y en cuánto rato.
 *  Dos flechas automáticas que se apuntan la una a la otra se pasan el relevo
 *  para siempre, y cada vuelta es un turno de agente que se paga. */
const TOPE_AUTO = 3;
const VENTANA_AUTO = 10 * 60_000;

/** Un texto a una terminal, como lo pegaría una persona. Va por `sendPty`: Rust
 *  lo mete entre corchetes de pegado si el programa los pidió (sin ellos cada
 *  salto de línea de un encargo pulsaría Intro y lo mandaría a trozos) y pulsa
 *  el Intro en OTRA escritura, un respiro después. Juntos en una sola, un
 *  relevo se quedaba escrito en la caja de Claude Code sin enviarse: trae la
 *  respuesta entera del agente anterior, y un trozo de más de 800 caracteres
 *  lo toma por un pegado con el Intro dentro (ver `mandar_texto` en pty.rs). */
export function pasteInto(id: number, text: string, send: boolean): void {
  void sendPty(id, text, send).catch(() => {});
}

function sidOf(pane: CanvasPane): string | undefined {
  return sessionIdOf(pane.command);
}

interface Ref<T> {
  current: T;
}

export interface ManosDeLasFlechas {
  panes: CanvasPane[];
  /** Los relevos que esperan en la barra. */
  relays: Relay[];
  setRelays: Dispatch<SetStateAction<Relay[]>>;
  /** La flecha cuya ficha está abierta, y lo que hay escrito en su caja. */
  editing: Edge | null;
  setEditing: Dispatch<SetStateAction<Edge | null>>;
  brief: string;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setNote: Dispatch<SetStateAction<string | null>>;
  setFocusedId: Dispatch<SetStateAction<number | null>>;
  zoomTo: (id: number) => void;
  /** Flechas que ya han intentado entregar con la campana de ahora. */
  firedRef: Ref<Set<string>>;
  /** Cuándo entregó sola cada flecha, para frenar a la que se desboca. */
  autoRef: Ref<Map<string, number[]>>;
  t: Translate;
}

export function useFlechas({
  panes,
  relays,
  setRelays,
  editing,
  setEditing,
  brief,
  setEdges,
  setNote,
  setFocusedId,
  zoomTo,
  firedRef,
  autoRef,
  t,
}: ManosDeLasFlechas) {
  const saveBrief = () => {
    if (!editing) return;
    setEdges((prev) =>
      prev.map((e) =>
        e.id === editing.id
          ? { ...e, label: brief.trim() || "encargo…", data: { ...e.data, brief: brief.trim() } }
          : e,
      ),
    );
    setEditing(null);
  };

  const toggleAuto = () => {
    if (!editing) return;
    const next = !editing.data?.auto;
    setEditing({ ...editing, data: { ...editing.data, auto: next } });
    setEdges((prev) =>
      prev.map((e) => (e.id === editing.id ? { ...e, data: { ...e.data, auto: next } } : e)),
    );
  };

  /** Deja el relevo parado con su motivo, en vez de descartarlo. Vuelve a
   *  intentarse solo en la campana siguiente. */
  const frenar = (edgeId: string, motivo: string) =>
    setRelays((prev) =>
      prev.map((x) => (x.edgeId === edgeId && x.espera !== motivo ? { ...x, espera: motivo } : x)),
    );

  /** `auto` distingue quién manda el relevo: el reloj o tú. Solo el automático
   *  comprueba nada — si le das al botón, entregas y punto. */
  const runRelay = async (r: Relay, send: boolean, auto = false) => {
    const from = panes.find((p) => p.id === r.fromId);
    // La campana del CLI suena al acabar el turno Y cuando el agente se para a
    // preguntarte algo: desde fuera son la misma señal. El transcript sí las
    // distingue, así que en automático se le pregunta antes de entregar; si no,
    // el siguiente de la cadena recibe media respuesta y se pone a trabajar
    // sobre ella. Es el fallo que hacía que encadenar no saliese a cuenta.
    if (auto && from) {
      // La campana llega un pelo antes de que el transcript tenga escrita la
      // última línea. Sin esta pausa se lee el estado de la vuelta anterior.
      await new Promise((ok) => window.setTimeout(ok, 400));
      let estado: WorkState = "";
      try {
        estado = (await sessionContext(from.cwd, sidOf(from)))?.state ?? "";
      } catch {
        // Sin transcript no hay nada que comprobar (una PowerShell, por
        // ejemplo): se entrega, que es lo que se hacía siempre.
        estado = "";
      }
      if (TE_HABLA_A_TI.has(estado)) {
        frenar(r.edgeId, t("«{n}» te preguntó algo antes de terminar", { n: r.fromName }));
        return;
      }
    }
    setRelays((prev) => prev.filter((x) => x.edgeId !== r.edgeId));
    let result = "";
    if (from) {
      try {
        result = (await lastReply(from.cwd, sidOf(from))) ?? "";
      } catch {
        result = "";
      }
    }
    if (!result) {
      setNote(
        t("No pude leer la respuesta del agente anterior: se manda solo tu encargo."),
      );
      window.setTimeout(() => setNote(null), 6000);
    }
    const text = [
      r.brief,
      result && `Resultado de «${r.fromName}»:\n"""\n${result}\n"""`,
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!text.trim()) return;
    pasteInto(r.toId, text, send);
    setFocusedId(r.toId);
    zoomTo(r.toId);
    firedRef.current.delete(r.edgeId);
  };

  // Arrows set to automatic hand over on their own; the rest wait for the
  // button, because the house rule is that nothing runs without an OK.
  useEffect(() => {
    for (const r of relays) {
      if (!r.auto || firedRef.current.has(r.edgeId)) continue;
      const ahora = Date.now();
      const marcas = (autoRef.current.get(r.edgeId) ?? []).filter(
        (t0) => ahora - t0 < VENTANA_AUTO,
      );
      if (marcas.length >= TOPE_AUTO) {
        // Se ha desbocado: casi siempre es un círculo de flechas automáticas,
        // y cada vuelta cuesta un turno de agente de verdad. Se pasa a mano y
        // se deja el relevo en la barra para que decidas tú.
        autoRef.current.set(r.edgeId, []);
        firedRef.current.add(r.edgeId);
        setEdges((prev) =>
          prev.map((e) => (e.id === r.edgeId ? { ...e, data: { ...e.data, auto: false } } : e)),
        );
        frenar(
          r.edgeId,
          t("«{a}» → «{b}» se pasó el relevo {n} veces seguidas: la he puesto a mano", {
            a: r.fromName,
            b: r.toName,
            n: String(TOPE_AUTO),
          }),
        );
        continue;
      }
      autoRef.current.set(r.edgeId, [...marcas, ahora]);
      firedRef.current.add(r.edgeId);
      void runRelay(r, true, true);
    }
    // runRelay reads fresh state through refs and removes the relay itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relays]);

  return { saveBrief, toggleAuto, runRelay };
}
