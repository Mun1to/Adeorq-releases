// Que cambiar de conversación en el Chat no arrastre lo que hacía la anterior.
//
//   pnpm bancos conserje-hilo
//
// ── QUÉ PERSIGUE ─────────────────────────────────────────────────────────────
//
// `HiloConserje` NO se vuelve a montar al elegir otra conversación de la
// lista: cambia su `id` y nada más. Medido el 2026-10-31, con el «pensando»
// guardado en un solo `useState` y el resultado del envío escrito al volver,
// sin mirar a qué conversación pertenecía:
//
//   1. mandas en A (el conserje tarda unos quince segundos) y pasas a B: B
//      enseña a Adeo pensando y no te deja mandar nada;
//   2. si A falla, la caja de error sale en B, y su «Reintentar» manda el
//      mensaje de A a la conversación B;
//   3. lo que pediste desde la caja del Panel para una conversación nueva se
//      pierde si llega mientras otra piensa: se toma del módulo (una sola vez)
//      y el envío se lo salta porque «ya está pensando».
//
// Aquí se monta el hilo de verdad con React sobre jsdom y un Tauri de mentira
// cuyo `conserje_enviar` se queda esperando hasta que el banco lo suelta.

import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

declare const process: { exit(codigo: number): never };

const dom = new JSDOM("<!doctype html><html><body><div id='raiz'></div></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});

/** Cada `conserje_enviar` que llega, con su promesa en manos del banco. */
const envios: { id: string; texto: string; soltar: (v: unknown) => void; fallar: (e: unknown) => void }[] = [];
const tauri = {
  invoke: (cmd: string, args: Record<string, unknown> = {}) => {
    if (cmd === "conserje_enviar") {
      return new Promise((soltar, fallar) => {
        envios.push({ id: String(args.id), texto: String(args.texto), soltar, fallar });
      });
    }
    if (cmd === "conserje_pensadores") return Promise.resolve([]);
    if (cmd === "conserje_leer") return Promise.resolve(null);
    return Promise.resolve(null);
  },
  transformCallback: () => 0,
};
(dom.window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = tauri;
(dom.window as unknown as Record<string, unknown>).__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };

const g = globalThis as unknown as Record<string, unknown>;
for (const [nombre, valor] of [
  ["window", dom.window],
  ["document", dom.window.document],
  ["navigator", dom.window.navigator],
  ["HTMLElement", dom.window.HTMLElement],
  ["Element", dom.window.Element],
  ["Node", dom.window.Node],
  ["CustomEvent", dom.window.CustomEvent],
  ["localStorage", dom.window.localStorage],
  ["IS_REACT_ACT_ENVIRONMENT", true],
] as const) {
  Object.defineProperty(g, nombre, { value: valor, writable: true, configurable: true });
}
// jsdom no trae estas, y el hilo las usa al pintar. La mascota se queda quieta
// (movimiento reducido): aquí no se mira cómo anima.
(dom.window.HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
(dom.window as unknown as { matchMedia: (q: string) => unknown }).matchMedia = (q: string) => ({
  matches: q.includes("reduce"),
  media: q,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
});
g.requestAnimationFrame = (f: (t: number) => void) => setTimeout(() => f(Date.now()), 0);
g.cancelAnimationFrame = (n: number) => clearTimeout(n);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HiloConserje } = require("../src/components/Conserje") as typeof import("../src/components/Conserje");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { dejarPedido, pedidoPendiente } = require("../src/lib/conserje") as typeof import("../src/lib/conserje");

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${cond || !detalle ? "" : ` — ${detalle}`}`);
}

const exec = {
  abrir: () => undefined,
  escribir: async () => false,
  panes: () => [],
  cuentas: () => [],
};

const raiz = createRoot(dom.window.document.getElementById("raiz")!);
const pinta = async (id: string) => {
  await act(async () => {
    raiz.render(<HiloConserje id={id} conv={null} exec={exec} onCambio={() => {}} onIr={() => {}} />);
  });
};
const pensandoEnPantalla = () => !!dom.window.document.querySelector(".cj-pensando");
const errorEnPantalla = () => dom.window.document.querySelector(".cj-nota[data-grave]")?.textContent ?? "";

async function main() {
  // 1. Lo que pides desde el Panel para A se manda al abrir A.
  dejarPedido("ordena las fotos de A");
  const a = pedidoPendiente()!.id;
  await pinta(a);
  ok("el pedido de A sale hacia A", envios.length === 1 && envios[0].id === a, `envíos: ${JSON.stringify(envios.map((e) => e.id))}`);
  ok("A enseña a Adeo pensando", pensandoEnPantalla());

  // 2. Mientras A piensa, llega un pedido para B y se abre B.
  dejarPedido("resume el correo de B");
  const b = pedidoPendiente()!.id;
  await pinta(b);
  const deB = envios.find((e) => e.id === b);
  ok(
    "el pedido de B sale aunque A siga pensando (no se pierde)",
    !!deB && deB.texto === "resume el correo de B",
    `envíos: ${JSON.stringify(envios.map((e) => [e.id === a ? "A" : e.id === b ? "B" : e.id, e.texto]))}`,
  );
  ok("el pedido de B ya no queda en el módulo", pedidoPendiente() === null);

  // 3. Una conversación C sin nada en marcha no hereda el «pensando» de A ni de B.
  await pinta("conversacion-c");
  ok("C no enseña a Adeo pensando", !pensandoEnPantalla());

  // 4. A falla mientras miras C: el error es de A, no de C.
  await act(async () => {
    envios[0].fallar("se cayó la red");
    await new Promise((r) => setTimeout(r, 10));
  });
  ok("el error de A no sale en C", !errorEnPantalla().includes("se cayó la red"), `C enseña «${errorEnPantalla()}»`);

  // 5. Al volver a B, sigue pensando en lo suyo.
  await pinta(b);
  ok("B sigue pensando en lo suyo", pensandoEnPantalla());

  await act(async () => {
    raiz.unmount();
  });
  console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
