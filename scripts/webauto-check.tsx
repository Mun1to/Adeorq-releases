// Cuándo pregunta Adeorq si abre la web que levanta una terminal (`components/WebAuto.tsx`).
//
//   pnpm bancos webauto
//
// El fallo que fija (2026-10-18, con `scripts/laboratorio/navegador-desde-terminal.mjs`): la
// terminal apuntaba el puerto como visto la PRIMERA vez que salía su dirección, y la primera suele
// ser antes de que haya servidor (el comando escrito, o un agente diciendo «arranco en
// http://localhost:5173»). El puerto no contestaba, no se preguntaba nada, y cuando el servidor
// escribía su `Local:` ya no se avisaba. Ahora la terminal avisa siempre y aquí se decide: se
// pregunta una vez por puerto, solo cuando contesta, y se vuelve a mirar si al principio no.
//
// Lo que no puede pasar: que no pregunte cuando el servidor llega después de su dirección, que
// pregunte dos veces por el mismo puerto, o que una terminal que repite la dirección sin servidor
// detrás le pregunte al sistema sin parar.

import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

declare const process: { exit(codigo: number): never };

const dom = new JSDOM("<!doctype html><html><body><div id='raiz'></div></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
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

// Después de poner el DOM: `WebAuto` y sus importaciones lo miran al cargar.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { default: WebAuto, OTRA_VEZ_MS } = require("../src/components/WebAuto") as typeof import("../src/components/WebAuto");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WEB_EVENTO } = require("../src/lib/puertos") as typeof import("../src/lib/puertos");

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Un sistema de mentira: qué puertos contestan, y cuántas veces se le ha preguntado. */
const vivos = new Set<number>();
let preguntas = 0;
const comprobar = async (puerto: number) => {
  preguntas++;
  return vivos.has(puerto);
};

async function main() {
  const raiz = document.getElementById("raiz")!;
  const root = createRoot(raiz);
  const abiertas: string[] = [];
  await act(async () => {
    root.render(<WebAuto activo={true} onAbrir={(u) => abiertas.push(u)} comprobar={comprobar} />);
  });

  const avisar = async (puerto: number) => {
    await act(async () => {
      window.dispatchEvent(new CustomEvent(WEB_EVENTO, { detail: { url: `http://localhost:${puerto}/`, puerto, paneId: 1 } }));
      await dormir(5);
    });
  };
  const pregunta = () => raiz.querySelector(".web-pregunta")?.textContent ?? null;
  const contestar = async (texto: RegExp) => {
    await act(async () => {
      [...raiz.querySelectorAll<HTMLButtonElement>(".web-pregunta button")].find((b) => texto.test(b.textContent ?? ""))?.click();
    });
  };

  // 1. La dirección sale antes que el servidor (el comando escrito) y luego el servidor la repite.
  await avisar(5173);
  ok("sin servidor todavía, no pregunta", pregunta() === null);
  vivos.add(5173);
  await avisar(5173);
  await act(async () => {
    await dormir(OTRA_VEZ_MS + 150);
  });
  ok("cuando el servidor escribe su dirección, pregunta", /localhost:5173/.test(pregunta() ?? ""), String(pregunta()));
  await contestar(/Ahora no|Not now/);
  ok("«Ahora no» la quita", pregunta() === null);

  // 2. El mismo puerto otra vez (el servidor recarga y repite su dirección): no vuelve a preguntar.
  await avisar(5173);
  await act(async () => {
    await dormir(OTRA_VEZ_MS + 150);
  });
  ok("por un puerto ya preguntado no se vuelve a preguntar", pregunta() === null);

  // 3. Uno que contesta a la primera: pregunta enseguida, y «Abrir» lo abre.
  vivos.add(3000);
  await avisar(3000);
  ok("un servidor que ya contesta se pregunta a la primera", /localhost:3000/.test(pregunta() ?? ""), String(pregunta()));
  await contestar(/Abrir|Open/);
  ok("«Abrir» abre esa dirección", abiertas.join() === "http://localhost:3000/", abiertas.join());

  // 4. Una terminal que nombra un puerto sin servidor detrás veinte veces en un segundo (un agente
  // redibujando su respuesta): al sistema se le pregunta poco, no veinte veces.
  preguntas = 0;
  for (let i = 0; i < 20; i++) {
    await avisar(4321);
    await act(async () => {
      await dormir(50);
    });
  }
  await act(async () => {
    await dormir(OTRA_VEZ_MS + 150);
  });
  ok("veinte avisos sin servidor no son veinte preguntas al sistema", preguntas <= 3, `${preguntas} preguntas`);
  ok("y no pregunta nada", pregunta() === null);

  // 5. Con el ajuste apagado, ni se mira.
  await act(async () => {
    root.render(<WebAuto activo={false} onAbrir={(u) => abiertas.push(u)} comprobar={comprobar} />);
  });
  preguntas = 0;
  vivos.add(8080);
  await avisar(8080);
  ok("con el ajuste apagado no se le pregunta nada al sistema", preguntas === 0 && pregunta() === null);

  await act(async () => root.unmount());
}

void main().then(() => {
  console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
});
