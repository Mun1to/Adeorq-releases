// Los relevos automáticos del lienzo: el que se frena se reintenta con la
// campana siguiente, y el que se pasó de vueltas deja de ser automático.
//
//   pnpm bancos flechas
//
// ── QUÉ PERSIGUE ─────────────────────────────────────────────────────────────
//
//  1. Un relevo automático en pausa porque el agente preguntó algo ("te
//     preguntó antes de terminar") se reintenta solo cuando le contestas y
//     vuelve a sonar la campana. `onTurnEnd` borraba la marca de "ya intentado"
//     pero dejaba el relevo en la lista tal cual, y `useFlechas` solo mira la
//     lista cuando CAMBIA: la lista no cambiaba, así que no se reintentaba
//     nunca.
//  2. Un relevo que se pasó de vueltas (`TOPE_AUTO` seguidas) se pasa a mano en
//     la flecha, pero el relevo en la barra seguía marcado como automático: en
//     cuanto la lista cambiaba por otra flecha, se entregaba solo sin tu OK.

import { JSDOM } from "jsdom";
import React, { act, useRef, useState } from "react";

declare const require: (m: string) => unknown;
declare const process: { exit(codigo: number): never };

const dom = new JSDOM("<!doctype html><html><body><div id='raiz'></div></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
(dom.window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
  invoke: () => Promise.resolve(null),
  transformCallback: () => 0,
};
const g = globalThis as unknown as Record<string, unknown>;
for (const [nombre, valor] of [
  ["window", dom.window],
  ["document", dom.window.document],
  ["navigator", dom.window.navigator],
  ["HTMLElement", dom.window.HTMLElement],
  ["IS_REACT_ACT_ENVIRONMENT", true],
] as const) {
  Object.defineProperty(g, nombre, { value: valor, writable: true, configurable: true });
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
const flechas = require("../src/lib/flechas") as typeof import("../src/lib/flechas");
type Relay = import("../src/lib/flechas").Relay;
type Edge = import("@xyflow/react").Edge;
type CanvasPane = import("../src/components/CanvasView").CanvasPane;

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${cond || !detalle ? "" : ` — ${detalle}`}`);
}

const relevo = (extra: Partial<Relay> = {}): Relay => ({
  edgeId: "e1",
  fromId: 1,
  toId: 2,
  fromName: "A",
  toName: "B",
  brief: "sigue",
  auto: true,
  ...extra,
});

/** Monta `useFlechas` con una lista de relevos y las flechas, y deja ver su estado. */
let estado: { relays: Relay[]; edges: Edge[] } = { relays: [], edges: [] };
function Arnes({ inicial, marcas }: { inicial: Relay[]; marcas: number[] }) {
  const [relays, setRelays] = useState<Relay[]>(inicial);
  const [edges, setEdges] = useState<Edge[]>([{ id: "e1", source: "1", target: "2", data: { auto: true } } as Edge]);
  const [editing, setEditing] = useState<Edge | null>(null);
  const firedRef = useRef<Set<string>>(new Set());
  const autoRef = useRef<Map<string, number[]>>(new Map([["e1", marcas]]));
  estado = { relays, edges };
  flechas.useFlechas({
    panes: [] as CanvasPane[],
    relays,
    setRelays,
    editing,
    setEditing,
    brief: "",
    setEdges,
    setNote: () => {},
    setFocusedId: () => {},
    zoomTo: () => {},
    firedRef,
    autoRef,
    t: (s: string, v?: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? "")),
  });
  return null;
}

async function main() {
  // 1. La campana vuelve a mirar un relevo frenado.
  {
    const frenado = relevo({ espera: "«A» te preguntó algo antes de terminar" });
    const salientes = [{ id: "e1", source: "1", target: "2", data: { auto: true } }] as Edge[];
    const paneles = [{ id: 1, name: "A" }, { id: 2, name: "B" }] as CanvasPane[];
    const tras = flechas.relevosTrasLaCampana([frenado], salientes, paneles, paneles[0], 1);
    ok("tras la campana el relevo frenado vuelve a estar libre", tras.length === 1 && !tras[0].espera, JSON.stringify(tras));
    ok("y la lista es otra, para que el efecto la vuelva a mirar", tras !== [frenado] && tras[0] !== frenado);

    const sinCambio = [relevo()];
    const igual = flechas.relevosTrasLaCampana(sinCambio, salientes, paneles, paneles[0], 1);
    ok("un relevo que no estaba frenado queda como estaba", igual === sinCambio, "no hay nada que reintentar");

    const aMano = [relevo({ auto: false, espera: "la he puesto a mano" })];
    const mano = flechas.relevosTrasLaCampana(aMano, salientes, paneles, paneles[0], 1);
    ok("el que se pasó a mano conserva su motivo", mano[0].espera === "la he puesto a mano", JSON.stringify(mano));

    const nuevo = flechas.relevosTrasLaCampana([], salientes, paneles, paneles[0], 1);
    ok("sin relevos, la campana crea el de la flecha", nuevo.length === 1 && nuevo[0].auto === true && nuevo[0].toId === 2, JSON.stringify(nuevo));
  }

  // 2. El freno por vueltas pasa el relevo a mano.
  {
    const raiz = createRoot(dom.window.document.getElementById("raiz")!);
    const ahora = Date.now();
    await act(async () => {
      raiz.render(<Arnes inicial={[relevo()]} marcas={[ahora - 3000, ahora - 2000, ahora - 1000]} />);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const r = estado.relays[0];
    ok("el relevo desbocado queda con su motivo", !!r?.espera && /a mano/.test(r.espera), JSON.stringify(r));
    ok("y deja de ser automático en la barra", r?.auto === false, JSON.stringify(r));
    ok("la flecha también queda a mano", estado.edges[0].data?.auto === false);
    await act(async () => { raiz.unmount(); });
  }

  console.log(fallos ? `\n${fallos} fallo(s)` : "\ntodo en verde");
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
