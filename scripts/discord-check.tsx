// Discord parte APAGADO dentro del paquete de la Microsoft Store, y en la
// instalación de siempre no cambia nada.
//
//   pnpm bancos discord
//
// ── QUÉ PERSIGUE ─────────────────────────────────────────────────────────────
//
// La política 10.5.2 de la Tienda pide el consentimiento ANTES de mandar nada a
// un tercero, y la línea «Programando con agentes» llega a Discord. De fábrica
// Adeorq la publica sin preguntar (es su decisión de siempre: un interruptor que
// nadie encuentra no existe), así que en el paquete el valor de fábrica cambia a
// apagado, y SOLO el de fábrica: quien ya eligió algo lo conserva, en los dos
// sitios.
//
// Lo que se mide es el comportamiento, con React de verdad sobre jsdom y un Tauri
// de mentira que apunta cada orden que llega a Rust: cuántas veces se manda
// `discord_set` en cada caso. NO se prueba con la app de verdad y Discord abierto
// (el de la máquina que prueba recibiría la línea): aquí ninguna orden sale.
//
//   · sin paquete y sin nada guardado: se publica (la instalación de siempre);
//   · con paquete y sin nada guardado: NO se publica ni una vez;
//   · con paquete y una elección guardada (encendido): se publica;
//   · sin paquete y una elección guardada (apagado): no se publica;
//   · mientras Rust no ha dicho si es el paquete: no se manda NADA, ni siquiera
//     una orden de limpiar (el primer render publicaría con el valor de siempre);
//   · en el paquete, encenderlo a mano empieza a publicar: el consentimiento
//     funciona.

import { JSDOM } from "jsdom";
import React, { act } from "react";

declare const process: { exit(codigo: number): never };
declare const require: ((id: string) => unknown) & { cache: Record<string, unknown>; resolve(id: string): string };

const dom = new JSDOM("<!doctype html><html><body><div id='raiz'></div></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});

type Orden = { cmd: string; args: Record<string, unknown> };
let ordenes: Orden[] = [];
/** Lo que contesta `esta_empaquetada`: true, false, o «no contesta» (null). */
let tienda: boolean | null = false;
const tauri = {
  invoke: (cmd: string, args: Record<string, unknown> = {}) => {
    ordenes.push({ cmd, args });
    if (cmd === "esta_empaquetada") {
      // Contesta de verdad tarde: lo que importa es lo que pasa MIENTRAS tanto.
      if (tienda === null) return new Promise(() => {});
      return new Promise((r) => setTimeout(() => r(tienda), 40));
    }
    return Promise.resolve(null);
  },
  transformCallback: () => 0,
};
(dom.window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = tauri;

const g = globalThis as unknown as Record<string, unknown>;
for (const [nombre, valor] of [
  ["window", dom.window],
  ["document", dom.window.document],
  ["navigator", dom.window.navigator],
  ["HTMLElement", dom.window.HTMLElement],
  ["Element", dom.window.Element],
  ["Node", dom.window.Node],
  ["localStorage", dom.window.localStorage],
  ["IS_REACT_ACT_ENVIRONMENT", true],
] as const) {
  Object.defineProperty(g, nombre, { value: valor, writable: true, configurable: true });
}

// React DOM mira si hay `document` al cargarse: va después de poner el jsdom.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module") as { _load: (id: string, ...r: unknown[]) => unknown };
const cargaOriginal = Module._load;
Module._load = function (id: string, ...resto: unknown[]) {
  // `empaquetada.ts` trae el actualizador, que aquí no pinta nada.
  if (id === "@tauri-apps/plugin-updater") return { check: async () => null };
  return cargaOriginal.call(this, id, ...resto);
};

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${cond || !detalle ? "" : ` — ${detalle}`}`);
}

/** Un módulo recién cargado: `empaquetada.ts` recuerda la respuesta de Rust para siempre. */
function cargar<T>(ruta: string): T {
  for (const k of Object.keys(require.cache)) {
    if (/[\\/]src[\\/]lib[\\/](empaquetada|discord|discordConfig)\.js$/.test(k)) delete require.cache[k];
  }
  return require(ruta) as T;
}

const PRESENCIA = { panes: 0, project: null, stream: false };
const KEY = "adeorq-discord";

interface Caso {
  /** Lo que contesta Rust a «¿eres el paquete?». */
  tienda: boolean | null;
  /** Lo que hay guardado de antes (la elección de la persona), o nada. */
  guardado?: Record<string, unknown>;
}

/** Monta la pieza como la monta App.tsx y deja pasar el tiempo que haga falta. */
async function correr({ tienda: t, guardado }: Caso, despues?: (raiz: Document) => Promise<void>) {
  ordenes = [];
  tienda = t;
  dom.window.localStorage.clear();
  if (guardado) dom.window.localStorage.setItem(KEY, JSON.stringify(guardado));
  const { useDiscordConfig } = cargar<typeof import("../src/lib/discordConfig")>("../src/lib/discordConfig");
  const { useDiscordPresence } = cargar<typeof import("../src/lib/discord")>("../src/lib/discord");
  function Sonda() {
    // Igual que en App.tsx.
    const { discord, setDiscord, listo } = useDiscordConfig();
    useDiscordPresence(listo ? discord : null, PRESENCIA, () => {}, "es");
    return React.createElement("button", {
      id: "sw",
      "data-on": String(discord.on),
      "data-listo": String(listo),
      onClick: () => setDiscord({ ...discord, on: !discord.on }),
    });
  }
  const sitio = dom.window.document.getElementById("raiz")!;
  const raiz = createRoot(sitio);
  await act(async () => raiz.render(React.createElement(Sonda)));
  await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
  if (despues) await despues(dom.window.document);
  const visto = {
    set: ordenes.filter((o) => o.cmd === "discord_set").length,
    limpiar: ordenes.filter((o) => o.cmd === "discord_clear").length,
    interruptor: dom.window.document.getElementById("sw")?.getAttribute("data-on"),
    listo: dom.window.document.getElementById("sw")?.getAttribute("data-listo"),
  };
  await act(async () => raiz.unmount());
  return visto;
}

(async () => {
  // ── La instalación de siempre ─────────────────────────────────────────────
  let r = await correr({ tienda: false });
  ok("sin paquete y sin nada guardado: el interruptor sale encendido, como siempre", r.interruptor === "true", JSON.stringify(r));
  ok("y se publica (`discord_set` una vez)", r.set === 1, JSON.stringify(r));

  r = await correr({ tienda: false, guardado: { on: false, clientId: "", showProject: false } });
  ok("sin paquete y apagado a mano: sigue apagado y no publica", r.interruptor === "false" && r.set === 0, JSON.stringify(r));

  r = await correr({ tienda: false, guardado: { on: true, clientId: "123", showProject: true } });
  ok("sin paquete y encendido a mano: sigue encendido y publica", r.interruptor === "true" && r.set === 1, JSON.stringify(r));

  r = await correr({ tienda: false, guardado: { showProject: true } });
  ok("sin paquete y una configuración vieja sin `on`: encendido (el valor de siempre)", r.interruptor === "true" && r.set === 1, JSON.stringify(r));

  // ── La Tienda ─────────────────────────────────────────────────────────────
  r = await correr({ tienda: true });
  ok("en el paquete y sin nada guardado: el interruptor sale APAGADO", r.interruptor === "false", JSON.stringify(r));
  ok("y no se publica NI UNA VEZ", r.set === 0, JSON.stringify(r));

  r = await correr({ tienda: true, guardado: { showProject: true } });
  ok("en el paquete y una configuración sin `on`: también apagado, sin publicar", r.interruptor === "false" && r.set === 0, JSON.stringify(r));

  r = await correr({ tienda: true, guardado: { on: true, clientId: "", showProject: false } });
  ok("en el paquete y encendido a mano (ya había consentido): se conserva y publica", r.interruptor === "true" && r.set === 1, JSON.stringify(r));

  r = await correr({ tienda: true, guardado: { on: false, clientId: "", showProject: false } });
  ok("en el paquete y apagado a mano: apagado, sin publicar", r.interruptor === "false" && r.set === 0, JSON.stringify(r));

  r = await correr({ tienda: true }, async (doc) => {
    await act(async () => { (doc.getElementById("sw") as HTMLButtonElement).click(); });
    await act(async () => { await new Promise((x) => setTimeout(x, 100)); });
  });
  ok("en el paquete, encenderlo a mano empieza a publicar (el consentimiento funciona)", r.interruptor === "true" && r.set === 1, JSON.stringify(r));

  // ── Mientras Rust no ha contestado ────────────────────────────────────────
  r = await correr({ tienda: null });
  ok("sin saber aún si es el paquete: no se manda NADA a Discord (ni publicar ni limpiar)", r.set === 0 && r.limpiar === 0 && r.listo === "false", JSON.stringify(r));

  // ── Que App.tsx lo lleve puesto igual que la sonda ────────────────────────
  // La sonda de arriba copia dos líneas de App.tsx; si App.tsx dejara de
  // esperar a Rust, esta prueba seguiría en verde sin decir nada. Se lee.
  const { readFileSync } = require("node:fs") as { readFileSync(ruta: string, codificacion: string): string };
  const app = readFileSync("src/App.tsx", "utf8").replace(/\/\/.*$/gm, "");
  ok("App.tsx trae la configuración de `useDiscordConfig` (no de `loadDiscord` a pelo)", /useDiscordConfig\(\)/.test(app) && !/useState<DiscordConfig>\(loadDiscord/.test(app));
  ok("y solo publica cuando se sabe si es el paquete (`discordListo ? discord : null`)", /useDiscordPresence\(discordListo \? discord : null,/.test(app));

  console.log(fallos ? `\n${fallos} FALLAN` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
