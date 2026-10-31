// Que el mapa que lee el Capataz no se pinte bajo otro proyecto.
//
//   pnpm bancos memoria-mapa
//
// ── QUÉ PERSIGUE ─────────────────────────────────────────────────────────────
//
// «Leer el proyecto» tarda minutos. `leerProyecto` fijaba `ruta` al empezar,
// pero al volver escribía el mapa con `setMapa` sin mirar qué proyecto había
// elegido ya el selector:
//
//   1. lees A (el Capataz tarda) y cambias a B;
//   2. el Capataz termina y el mapa de A se pinta bajo B, con la fecha de A;
//   3. al mover un nodo, las posiciones se guardan con la clave de B.
//
// Aquí se monta `MemoriaView` de verdad con React sobre jsdom y un Tauri de
// mentira cuyo `foreman_mapa` espera a que el banco lo suelte. Los dos dibujos
// pesados (el Cerebro y el mapa de React Flow) se cambian por una caja que dice
// qué recibe: lo que se mira es el estado de la pantalla, no el dibujo.

import { JSDOM } from "jsdom";
import React, { act } from "react";

declare const process: { exit(codigo: number): never };
declare const require: ((id: string) => unknown) & { cache: Record<string, unknown> };

const dom = new JSDOM("<!doctype html><html><body><div id='raiz'></div></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
dom.window.localStorage.setItem("adeorq-boveda", "C:\\boveda");

const MAPA_A = JSON.stringify({
  resumen: "Mapa de A",
  piezas: [{ id: "a1", nombre: "Pieza de A", capa: "otros", que: "x", donde: "src" }],
});
const MAPA_B = JSON.stringify({
  resumen: "Mapa de B",
  piezas: [{ id: "b1", nombre: "Pieza de B", capa: "otros", que: "x", donde: "src" }],
});

/** Cada lectura del Capataz que llega, con su promesa en manos del banco. */
const lecturas: { ruta: string; soltar: (v: unknown) => void; fallar: (e: unknown) => void }[] = [];
const guardados: { ruta: string; contenido: string }[] = [];
const tauri = {
  invoke: (cmd: string, args: Record<string, unknown> = {}) => {
    if (cmd === "foreman_mapa") {
      return new Promise((soltar, fallar) => {
        lecturas.push({ ruta: String(args.ruta), soltar, fallar });
      });
    }
    if (cmd === "memoria_scan") return Promise.resolve({ root: "C:\\boveda", docs: [], links: [] });
    if (cmd === "list_projects") {
      return Promise.resolve([
        { name: "A", path: "C:\\p\\A" },
        { name: "B", path: "C:\\p\\B" },
      ]);
    }
    if (cmd === "escanear_arbol") return Promise.resolve({ nodos: [] });
    if (cmd === "guardar_mapa") {
      guardados.push({ ruta: String(args.ruta), contenido: String(args.contenido) });
      return Promise.resolve(null);
    }
    if (cmd === "mapa_guardado") return Promise.resolve(null);
    if (cmd === "memoria_vaults" || cmd === "list_skills") return Promise.resolve([]);
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
(dom.window as unknown as { matchMedia: (q: string) => unknown }).matchMedia = (q: string) => ({
  matches: false,
  media: q,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
});
g.requestAnimationFrame = (f: (t: number) => void) => setTimeout(() => f(Date.now()), 0);
g.cancelAnimationFrame = (n: number) => clearTimeout(n);

/* Los dibujos pesados y los plugins de Tauri que no hacen falta, por cajas. Se
   cambia `Module._load` porque `tsc` deja los `require` tal cual. */
/* React DOM mira si hay `document` al CARGARSE; si se carga antes de poner el
   jsdom (los `import` suben arriba), da por no soportado el evento `input` y
   revienta al enfocar una caja de texto. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module") as { _load: (id: string, ...r: unknown[]) => unknown };
const cargaOriginal = Module._load;
Module._load = function (id: string, ...resto: unknown[]) {
  if (id === "./MemoriaGrafo") return { __esModule: true, default: () => null };
  if (id === "./MemoriaMapa") {
    return {
      __esModule: true,
      default: (p: { mapa: unknown; ruta: string; cuando: string; error: string; onLeer: () => void }) =>
        React.createElement(
          "div",
          { id: "mapa-stub" },
          React.createElement("span", { id: "mapa-ruta" }, p.ruta),
          React.createElement(
            "span",
            { id: "mapa-resumen" },
            p.mapa ? (p.mapa as { resumen: string }).resumen : "",
          ),
          React.createElement("span", { id: "mapa-cuando" }, p.cuando),
          React.createElement("span", { id: "mapa-error" }, p.error),
          React.createElement("button", { id: "leer", onClick: () => p.onLeer() }, "leer"),
        ),
    };
  }
  if (id === "@tauri-apps/plugin-dialog") return { open: async () => null };
  if (id === "@tauri-apps/plugin-opener") return { openPath: async () => {} };
  return cargaOriginal.call(this, id, ...resto);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MemoriaView = (require("../src/components/MemoriaView") as typeof import("../src/components/MemoriaView")).default;

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${cond || !detalle ? "" : ` — ${detalle}`}`);
}

const doc = dom.window.document;
const texto = (sel: string) => doc.querySelector(sel)?.textContent ?? "";
const tick = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

async function elegir(ruta: string) {
  const sel = doc.querySelector<HTMLSelectElement>("select.esq-elige")!;
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value")!.set!;
    set.call(sel, ruta);
    sel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

async function main() {
  const raiz = createRoot(doc.getElementById("raiz")!);
  await act(async () => {
    raiz.render(<MemoriaView />);
  });
  await tick(20);
  const esquema = [...doc.querySelectorAll<HTMLButtonElement>(".mem-modos button")].find((b) => b.textContent === "Esquema");
  ok("la pantalla tiene la pestaña Esquema", !!esquema);
  await act(async () => { esquema!.click(); });
  await tick(20);

  // 1. Lees A y, mientras el Capataz trabaja, cambias a B.
  await elegir("C:\\p\\A");
  await tick(20);
  await act(async () => { doc.querySelector<HTMLButtonElement>("#leer")!.click(); });
  await tick(20);
  ok("el Capataz recibió la lectura de A", lecturas.length === 1 && lecturas[0].ruta === "C:\\p\\A", JSON.stringify(lecturas.map((l) => l.ruta)));
  await elegir("C:\\p\\B");
  await tick(20);
  ok("el selector está en B", texto("#mapa-ruta") === "C:\\p\\B", texto("#mapa-ruta"));

  // 2. El Capataz termina A estando en B.
  await act(async () => { lecturas[0].soltar(MAPA_A); });
  await tick(20);
  ok("el mapa de A no se pinta bajo B", texto("#mapa-resumen") === "", `se ve «${texto("#mapa-resumen")}» bajo B`);
  ok("la fecha de A no se pone bajo B", texto("#mapa-cuando") === "", texto("#mapa-cuando"));
  ok("el mapa de A sí se guardó, con la clave de A", guardados.length === 1 && guardados[0].ruta === "C:\\p\\A", JSON.stringify(guardados.map((x) => x.ruta)));

  // 3. Lees B, sin cambiar de proyecto, y sí se pinta.
  await act(async () => { doc.querySelector<HTMLButtonElement>("#leer")!.click(); });
  await tick(20);
  ok("el Capataz recibió la lectura de B", lecturas.length === 2 && lecturas[1].ruta === "C:\\p\\B");
  await act(async () => { lecturas[1].soltar(MAPA_B); });
  await tick(20);
  ok("leer el proyecto abierto sigue pintando su mapa", texto("#mapa-resumen") === "Mapa de B", texto("#mapa-resumen"));

  // 4. Un fallo del Capataz de A estando en B tampoco se pinta bajo B.
  await elegir("C:\\p\\A");
  await tick(20);
  await act(async () => { doc.querySelector<HTMLButtonElement>("#leer")!.click(); });
  await tick(20);
  await elegir("C:\\p\\B");
  await tick(20);
  await act(async () => { lecturas[2].fallar("el Capataz se rindió con A"); });
  await tick(20);
  ok("el fallo de la lectura de A no sale bajo B", texto("#mapa-error") === "", texto("#mapa-error"));

  await act(async () => { raiz.unmount(); });
  console.log(fallos ? `\n${fallos} fallo(s)` : "\ntodo en verde");
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
