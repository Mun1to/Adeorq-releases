// El cable de la vuelta hacia arriba (`lib/vueltaArribaVivo.ts`): lo puro lo mide
// `vuelta-arriba-check`; aquí se mide que `mirar` le pasa de verdad al reloj lo que
// dice la pantalla de cada hija y sus subagentes, y que la línea que se teclea sabe
// quién sigue trabajando.
//
// Corre el módulo de verdad, con su almacén y su registro de terminales. De mentira
// solo hay el reloj, las xterm (filas de texto) y Tauri, que apunta lo que se teclea.
//
//   pnpm bancos vuelta-arriba

declare const require: (m: string) => unknown;
declare const process: { exit(codigo: number): never };

import type { PaneStatus, WorkState } from "../src/lib/pty";

let fallos = 0;
const rojos: string[] = [];
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) {
    fallos++;
    rojos.push(nombre);
  }
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${cond || !detalle ? "" : ` — ${detalle}`}`);
}

let ahora = 1_800_000_000_000;
Date.now = () => ahora;

const tecleado: Array<{ id: number; texto: string }> = [];
const relojes: Array<{ fn: () => void; ms: number }> = [];
const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = { getItem: () => null, setItem: () => {} };
g.window = {
  setInterval: (fn: () => void, ms: number) => relojes.push({ fn, ms }),
  clearInterval: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  __TAURI_INTERNALS__: {
    invoke: async (cmd: string, a: { id?: number; texto?: string } = {}) => {
      if (cmd === "datos_panel") return { cwd: "C:\\x", command: ["claude"] };
      if (cmd === "madres_de_delegadas") return [];
      if (cmd === "pty_send" && a.texto) tecleado.push({ id: a.id ?? -1, texto: a.texto });
      return null;
    },
    transformCallback: () => 0,
  },
};

const { useCabina } = require("../src/lib/cabina") as typeof import("../src/lib/cabina");
const { registrarTerminal } = require("../src/lib/terminales") as typeof import("../src/lib/terminales");
const vivo = require("../src/lib/vueltaArribaVivo") as typeof import("../src/lib/vueltaArribaVivo");
const { MIRAR_MS, PARADA_MS } = require("../src/lib/vueltaArriba") as typeof import("../src/lib/vueltaArriba");

const MIN = 60_000;
const raya = "─".repeat(78);
const CAJA = [raya, "❯", raya];
const QUIETA = ["✻ Worked for 4s · done 7:58", ...CAJA, "  ⏵⏵ auto mode on (shift+tab to cycle) · ← 5 agents"];
const CON_SHELL = ["✻ Baked for 8m 40s · done 7:32 · 1 shell still running", ...CAJA, "  ⏵⏵ auto mode on · 1 shell · ← 5 agents · ↓ to manage"];

function pantalla(id: number, filas: string[]) {
  const term = {
    rows: filas.length,
    buffer: { active: { baseY: 0, getLine: (y: number) => ({ translateToString: () => filas[y] ?? "" }) } },
  };
  registrarTerminal(id, term as unknown as Parameters<typeof registrarTerminal>[1]);
}
function estado(id: number, state: WorkState, extra: Partial<PaneStatus> = {}) {
  useCabina.getState().apuntarEstado({ id, name: `p${id}`, cwd: "C:\\x", agent: true, agentsLive: 0, state, porque: "", ...extra });
}
const respira = () => new Promise<void>((r) => setTimeout(r, 0));
function pasar(ms: number) {
  const mirar = relojes.find((r) => r.ms === MIRAR_MS)?.fn;
  for (const fin = ahora + ms; ahora < fin; ) {
    ahora += MIRAR_MS;
    mirar?.();
  }
}
const lineasA = (madre: number) => tecleado.filter((t) => t.id === madre).map((t) => t.texto);

/** Una madre parada en su caja vacía (u ocupada) y una hija suya que acaba de parar. */
async function pareja(madre: number, hija: number, filas: string[] | null, ocupada = false) {
  pantalla(madre, QUIETA);
  estado(madre, ocupada ? "a_medias" : "lista");
  vivo.apuntarHija(hija, madre);
  await respira();
  if (filas) pantalla(hija, filas);
  estado(hija, "a_medias");
  estado(hija, "lista");
}

async function main() {
  vivo.conectarVueltaArriba();
  ok("se engancha al reloj de las miradas", relojes.some((r) => r.ms === MIRAR_MS));

  await pareja(101, 102, CON_SHELL);
  pasar(10 * MIN);
  ok("con un shell vivo en su pantalla, diez minutos sin avisar", lineasA(101).length === 0, lineasA(101).join(" | "));
  pantalla(102, QUIETA);
  pasar(PARADA_MS - MIRAR_MS);
  ok("acabado el shell, el minuto cuenta desde entonces", lineasA(101).length === 0, lineasA(101).join(" | "));
  pasar(MIRAR_MS);
  ok("y pasado ese minuto se teclea una línea", lineasA(101).length === 1 && lineasA(101)[0].includes("paró sin entregar"), lineasA(101).join(" | "));
  ok("que manda a read_pane_screen y no ofrece cerrarla", /read_pane_screen/.test(lineasA(101)[0] ?? "") && !/close_pane/.test(lineasA(101)[0] ?? ""), lineasA(101)[0]);

  await pareja(111, 112, QUIETA);
  estado(112, "lista", { agentsLive: 1 });
  pasar(5 * MIN);
  ok("con subagentes fuera (agentsLive) tampoco", lineasA(111).length === 0, lineasA(111).join(" | "));
  estado(112, "lista", { agentsLive: 0 });
  pasar(PARADA_MS);
  ok("y al volver, sí", lineasA(111).length === 1, lineasA(111).join(" | "));

  await pareja(121, 122, QUIETA, true);
  pasar(PARADA_MS + MIRAR_MS);
  pantalla(122, CON_SHELL);
  pasar(MIRAR_MS);
  estado(121, "lista");
  pasar(3 * MIRAR_MS);
  ok("el aviso que esperaba a la madre se retira si la hija lanza algo de fondo", lineasA(121).length === 0, lineasA(121).join(" | "));

  await pareja(131, 132, QUIETA, true);
  vivo.alEntregar({ hija: 132, madre: 131, estado: "hecho", resumen: "Hero nuevo, con su banco en verde." });
  estado(132, "a_medias");
  estado(131, "lista");
  pasar(2 * MIRAR_MS);
  ok("«hecho» que volvió a trabajar: no se ofrece cerrarla", lineasA(131).length === 1 && !lineasA(131)[0].includes("close_pane"), lineasA(131).join(" | "));

  await pareja(141, 142, CON_SHELL, true);
  vivo.alEntregar({ hija: 142, madre: 141, estado: "hecho", resumen: "Hero nuevo, con su banco en verde." });
  estado(141, "lista");
  pasar(2 * MIRAR_MS);
  ok("«hecho» con un shell vivo: tampoco", lineasA(141).length === 1 && !lineasA(141)[0].includes("close_pane"), lineasA(141).join(" | "));

  await pareja(151, 152, QUIETA, true);
  vivo.alEntregar({ hija: 152, madre: 151, estado: "hecho", resumen: "Hero nuevo, con su banco en verde." });
  estado(151, "lista");
  pasar(2 * MIRAR_MS);
  ok("«hecho» y parada de verdad: sí", lineasA(151).length === 1 && lineasA(151)[0].includes("ciérrala con close_pane"), lineasA(151).join(" | "));

  await pareja(161, 162, CON_SHELL);
  pasar(20 * MIN - MIRAR_MS);
  ok("un servidor que no acaba: a los veinte minutos aún no", lineasA(161).length === 0, lineasA(161).join(" | "));
  pasar(2 * MIRAR_MS);
  ok("y entonces una línea que lo dice", lineasA(161).length === 1 && lineasA(161)[0].includes("sigue con trabajo de fondo desde hace 20 min; no ha entregado"), lineasA(161).join(" | "));
  ok("sin ofrecer cerrarla", !(lineasA(161)[0] ?? "").includes("close_pane"), lineasA(161)[0]);
  pasar(120 * MIN);
  ok("y no se repite", lineasA(161).length === 1, `${lineasA(161).length}`);

  await pareja(181, 182, CON_SHELL, true);
  pasar(200 * MIN);
  estado(181, "lista");
  pasar(MIRAR_MS);
  ok("con la madre ocupada 200 minutos, la línea dice los minutos de ahora", lineasA(181).length === 1 && lineasA(181)[0].includes("desde hace 200 min"), lineasA(181).join(" | "));

  await pareja(191, 192, QUIETA, true);
  vivo.alEntregar({ hija: 192, madre: 191, estado: "hecho", resumen: "Hero nuevo, con su banco en verde." });
  pantalla(192, ["* Hatching… (12s)", ...CAJA, "  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt · ← 5 agents"]);
  estado(191, "lista");
  pasar(2 * MIRAR_MS);
  ok("«hecho» con «esc to interrupt» en pantalla, aunque el transcript vaya por detrás: no se ofrece cerrarla", lineasA(191).length === 1 && !lineasA(191)[0].includes("close_pane"), lineasA(191).join(" | "));

  await pareja(201, 202, CON_SHELL, true);
  pasar(20 * MIN + MIRAR_MS);
  for (let i = 0; i < 3; i++) {
    estado(202, "a_medias");
    pasar(MIRAR_MS);
    estado(202, "lista");
    pasar(15 * MIN);
  }
  estado(201, "lista");
  pasar(2 * MIRAR_MS);
  ok("el aviso que un turno breve retiró de la cola vuelve con el tope total", lineasA(201).length === 1 && lineasA(201)[0].includes("sigue con trabajo de fondo"), lineasA(201).join(" | "));

  await pareja(211, 212, CON_SHELL, true);
  await pareja(211, 213, CON_SHELL, true);
  pasar(20 * MIN + MIRAR_MS);
  estado(212, "a_medias");
  pasar(MIRAR_MS);
  estado(211, "lista");
  pasar(2 * MIRAR_MS);
  estado(213, "a_medias");
  pasar(MIRAR_MS);
  estado(213, "lista");
  pasar(90 * MIN);
  ok("de dos en la cola, retirar una no rearma a la otra", lineasA(211).length === 1 && lineasA(211)[0].includes("(panel 213)"), lineasA(211).join(" | "));

  await pareja(171, 172, null);
  pasar(PARADA_MS + MIRAR_MS);
  ok("sin pantalla que leer (sacada a su ventana) se avisa como siempre", lineasA(171).length === 1, lineasA(171).join(" | "));

  console.log(fallos ? `\n${fallos} FALLOS: ${rojos.join("; ")}` : "\nTODO BIEN");
  process.exit(fallos ? 1 : 0);
}
void main();
