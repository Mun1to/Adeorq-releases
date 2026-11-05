// A qué cuenta nace cada terminal de un plan del Capataz.
//
//   pnpm bancos capataz-cuentas
//
// ── QUÉ PERSIGUE ─────────────────────────────────────────────────────────────
//
//  El Capataz recetaba, se quedaba con el modelo y el esfuerzo y tiraba la
//  cuenta: un plan de seis agentes nacía entero en la predeterminada aunque
//  otra cuenta estuviera a punto de perder su cuota (encargo C1, 2026-11-03).
//
//  1. Cada acción que abre un Claude lleva la cuenta que dijo el router.
//  2. Las de un mismo plan se cuentan entre ellas: tres con la misma foto no
//     caen todas en la misma cuenta si estaban cerca (`conUnaAbierta`).
//  3. Una cuenta que pierde MUCHO sigue ganando todas: contar no es repartir a
//     partes iguales.
//  4. Una terminal pelada (sin encargo) no gasta: no elige ni pesa.
//  5. Si el router propone otro CLI, la cuenta es la de su `alternativa`.

import { JSDOM } from "jsdom";

declare const require: (m: string) => unknown;
declare const process: { exit(codigo: number): never };

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
(dom.window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
  invoke: () => Promise.resolve(null),
  transformCallback: () => 0,
};
const g = globalThis as unknown as Record<string, unknown>;
for (const [nombre, valor] of [
  ["window", dom.window],
  ["document", dom.window.document],
  ["navigator", dom.window.navigator],
  ["localStorage", dom.window.localStorage],
  ["HTMLElement", dom.window.HTMLElement],
] as const) {
  Object.defineProperty(g, nombre, { value: valor, writable: true, configurable: true });
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { checkActions } = require("../src/components/Foreman") as typeof import("../src/components/Foreman");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { cuentaDeLaReceta, conUnaAbierta } = require("../src/lib/cuentasDelPlan") as typeof import("../src/lib/cuentasDelPlan");
type CuentaViva = import("../src/lib/router").CuentaViva;

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle: unknown = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${cond ? "" : ` — ${JSON.stringify(detalle)}`}`);
}

const DIA = 86_400_000;
const AHORA = Date.now();
const viva = (label: string, o: Partial<CuentaViva> = {}, provider = "claude"): CuentaViva => ({
  cuenta: { id: label === "Principal" ? `main:${provider}` : `${provider}:${label}`, label, dir: label === "Principal" ? "" : `C:\\cuentas\\${label}`, provider },
  instalado: true,
  conectada: true,
  ...o,
});
const proyecto = { name: "demo", path: "C:\\proyectos\\demo" } as unknown as import("../src/lib/pty").Project;
const nuevo = (rol: string, prompt = "haz cosas") => ({ tipo: "claude_nuevo", proyecto: "demo", rol, prompt }) as never;
const plan = (acciones: unknown[]) => ({ resumen: "", acciones }) as never;
const cuentasDe = (mundo: CuentaViva[], acciones: unknown[]) =>
  checkActions(plan(acciones), [proyecto], [], [], mundo).map((c) => c.cuenta?.label);

// 1. Una acción lleva la cuenta del router.
{
  const pro = viva("2da MAIN", { gastado: 17, renueva: AHORA + 2 * DIA, plan: "pro" });
  const main = viva("Principal", { gastado: 60, renueva: AHORA + 5 * DIA, plan: "max" });
  ok("una acción nace en la Pro, que es la que más pierde", cuentasDe([main, pro], [nuevo("codificar")]).join() === "2da MAIN", cuentasDe([main, pro], [nuevo("codificar")]));
}

// 2. Cerca la una de la otra: tres seguidas no caen todas en la misma.
{
  const pro = viva("2da MAIN", { gastado: 17, renueva: AHORA + 2 * DIA, plan: "pro" });
  const main = viva("Principal", { gastado: 30, renueva: AHORA + 2 * DIA, plan: "max" });
  const vistas = cuentasDe([main, pro], [nuevo("a"), nuevo("b"), nuevo("c")]);
  ok("tres acciones con la misma foto no caen todas en la misma cuenta", new Set(vistas).size === 2, vistas);
  ok("y la que más perdía sigue siendo la primera", vistas[0] === "2da MAIN", vistas);
}

// 3. Una Pro que pierde mucho sigue ganando.
{
  const pro = viva("2da MAIN", { gastado: 17, renueva: AHORA + 2 * DIA, plan: "pro" });
  const main = viva("Principal", { gastado: 60, renueva: AHORA + 5 * DIA, plan: "max" });
  const vistas = cuentasDe([main, pro], [nuevo("a"), nuevo("b"), nuevo("c")]);
  ok("la Pro al 17 % en 2 días se lleva las tres frente a una principal que pierde 8 al día", vistas.every((l) => l === "2da MAIN"), vistas);
}

// 4. Una cuadrilla cuenta sus puestos entre sí, y la acción de antes también.
{
  const pro = viva("2da MAIN", { gastado: 17, renueva: AHORA + 2 * DIA, plan: "pro" });
  const main = viva("Principal", { gastado: 30, renueva: AHORA + 2 * DIA, plan: "max" });
  const cuadrilla = {
    tipo: "cuadrilla",
    proyecto: "demo",
    objetivo: "x",
    partes: ["a", "b", "c", "d"].map((r) => ({ rol: r, encargo: `haz ${r}`, frontera: `src/${r}` })),
  } as never;
  const c = checkActions(plan([cuadrilla]), [proyecto], [], [], [main, pro])[0];
  const etiquetas = (c.partes ?? []).map((p) => p.cuenta?.label);
  ok("los puestos de una cuadrilla llevan cuenta", etiquetas.length === 4 && etiquetas.every(Boolean), etiquetas);
  ok("y no caen todos en la misma", new Set(etiquetas).size === 2, etiquetas);
  const antes = cuentasDe([main, pro], [nuevo("a"), nuevo("b"), nuevo("c"), nuevo("d")]);
  ok("lo mismo que cuatro acciones sueltas: lo que se acepta es lo que se abre", etiquetas.join() === antes.join(), [etiquetas, antes]);
}

// 5. Una terminal pelada no gasta: ni elige ni pesa.
{
  const pro = viva("2da MAIN", { gastado: 17, renueva: AHORA + 2 * DIA, plan: "pro" });
  const main = viva("Principal", { gastado: 30, renueva: AHORA + 2 * DIA, plan: "max" });
  const sinEncargo = { tipo: "claude_nuevo", proyecto: "demo", rol: "x" } as never;
  const vistas = cuentasDe([main, pro], [sinEncargo, nuevo("a")]);
  ok("la pelada no lleva cuenta", vistas[0] === undefined, vistas);
  ok("y no pesa: la siguiente sigue siendo la Pro", vistas[1] === "2da MAIN", vistas);
}

// 6. Las piezas sueltas.
{
  const pro = viva("2da MAIN", {});
  const codex = viva("Codex", {}, "codex");
  ok("sin cuenta de Claude en la receta, ninguna", cuentaDeLaReceta({ cuenta: codex.cuenta }) === undefined);
  ok("si el router propone otro CLI, vale la de su alternativa", cuentaDeLaReceta({ cuenta: codex.cuenta, alternativa: { cli: "claude", cuenta: pro.cuenta, porque: "" } })?.label === "2da MAIN");
  const mundo = [pro, codex];
  const luego = conUnaAbierta(mundo, pro.cuenta);
  ok("conUnaAbierta suma uno y no toca el original", luego[0].abiertas === 1 && mundo[0].abiertas === undefined && luego[1] === mundo[1], luego.map((v) => v.abiertas));
}

// 6b. El resumen de debajo de la tarjeta: a qué cuentas van las terminales.
{
  const { repartoDelPlan } = require("../src/lib/cuentasDelPlan") as typeof import("../src/lib/cuentasDelPlan");
  const pro = viva("2da MAIN", {});
  const tercera = viva("3ra", {});
  const main = viva("Principal", {});
  const sale = (cs: Array<CuentaViva | undefined>) => repartoDelPlan(cs.map((c) => c?.cuenta)).map((e) => `${e.n} en ${e.cuenta.label}`).join(", ");
  ok("cuenta cada cuenta en el orden en que sale", sale([pro, tercera, pro]) === "2 en 2da MAIN, 1 en 3ra", sale([pro, tercera, pro]));
  ok("con la principal por medio, sale también", sale([main, pro, main]) === "2 en Principal, 1 en 2da MAIN", sale([main, pro, main]));
  ok("si todas nacen en la principal, no dice nada", sale([main, main, main]) === "", sale([main, main, main]));
  ok("las que no llevan cuenta no cuentan, y sin ninguna no dice nada", sale([undefined, pro, undefined]) === "1 en 2da MAIN" && sale([undefined, undefined]) === "" && repartoDelPlan([]).length === 0);
  const { makeT } = require("../src/lib/i18n") as typeof import("../src/lib/i18n");
  const en = makeT("en");
  ok("el peso y el reparto tienen su inglés", en("pesa como {n} haikus", { n: "11" }) === "weighs as much as 11 haikus" && en("{n} en {c}", { n: "2", c: "3ra" }) === "2 on 3ra" && en("Abre 1 agente") === "Opens 1 agent");
}

// 7. Lo que el Capataz marca como imposible, en el idioma de la app (el inglés del porqué
//    del router y de las razones de una acción que no se puede hacer: `scripts/router-ingles-check.ts`).
{
  const { makeT } = require("../src/lib/i18n") as typeof import("../src/lib/i18n");
  const roto = [
    { tipo: "claude_nuevo", proyecto: "no-existe", rol: "x", prompt: "hola" },
    { tipo: "revisar", proyecto: "demo", encargo: "" },
    { tipo: "cuadrilla", proyecto: "demo", objetivo: "x", partes: [{ rol: "a", encargo: "a" }] },
  ] as never[];
  const enEs = checkActions(plan(roto), [proyecto], [], [], [], makeT("es")).map((c) => c.why);
  const enEn = checkActions(plan(roto), [proyecto], [], [], [], makeT("en")).map((c) => c.why);
  const sin = checkActions(plan(roto), [proyecto], [], [], []).map((c) => c.why);
  ok("sin traductor, el porqué de lo imposible sale en español, como siempre", JSON.stringify(sin) === JSON.stringify(["proyecto desconocido", "sin qué revisar", "una cuadrilla es de dos o más"]), sin);
  ok("con el traductor español, igual", JSON.stringify(enEs) === JSON.stringify(sin), enEs);
  ok("con el inglés, ni una letra española", enEn.every((w) => w && !/[áéíóúüñ¿¡«»]/i.test(w)) && JSON.stringify(enEn) === JSON.stringify(["unknown project", "nothing to review", "a crew is two or more"]), enEn);
}

console.log(fallos ? `\n${fallos} fallos.` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
