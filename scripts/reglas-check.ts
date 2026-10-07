// Las reglas del router que Munir escribe en la memoria, probadas sin abrir la app.
//
//   pnpm bancos reglas
//
// Lo que se prueba es `src/lib/reglasRouter.ts` (entender la línea y elegir la
// que manda) y `recetarConMemoria` de `src/lib/router.ts` (que la regla pase
// por el router como si Munir hubiera pedido ese modelo a mano, y que el
// porqué diga de qué nota sale).

import { palabras, reglaQueManda, reglasDe } from "../src/lib/reglasRouter";
import { recetarConMemoria, type Exigencia, type Mundo } from "../src/lib/router";

let fallos = 0;
function caso(nombre: string, ok: boolean, detalle = ""): void {
  console.log(`${ok ? "ok " : "MAL"} ${nombre}${detalle ? `  (${detalle})` : ""}`);
  if (!ok) fallos++;
}

/* ── Entender la línea ─────────────────────────────────────────────────── */

caso("las palabras salen sin tildes ni mayúsculas", palabras("Vidorq, el RADAR de cripto").join(" ") === "vidorq el radar de cripto");

{
  const r = reglasDe("router: radar -> opus xhigh");
  caso("una regla con modelo y esfuerzo", r.length === 1 && r[0].modelo === "opus" && r[0].esfuerzo === "xhigh" && !r[0].cli, JSON.stringify(r));
  caso("y recuerda sus palabras y su línea", r[0]?.cuando.join() === "radar" && r[0]?.texto === "router: radar -> opus xhigh");
}
{
  const r = reglasDe("- router: web de Adeorq => codex");
  caso("con viñeta, flecha gorda y cliente", r.length === 1 && r[0].cli === "codex" && r[0].cuando.join(" ") === "web de adeorq", JSON.stringify(r));
}
{
  const r = reglasDe("ROUTER: Vidorq → sonnet", "La nota");
  caso("sin mirar mayúsculas, con la flecha de verdad, y con su nota", r.length === 1 && r[0].modelo === "sonnet" && r[0].nota === "La nota");
}
caso("una línea que habla del router sin ser regla no cuenta", reglasDe("El router: lo que decide y por qué.").length === 0);
caso("una regla sin nada reconocible a la derecha no cuenta", reglasDe("router: radar -> el mejor que haya").length === 0);
caso("un cliente inventado no llega a ninguna línea de comandos", reglasDe("router: radar -> rm-rf").length === 0);
{
  const r = reglasDe("texto\nrouter: a -> haiku\nmás texto\nrouter: b c -> max\n");
  caso("varias en una nota, cada una con lo suyo", r.length === 2 && r[0].modelo === "haiku" && r[1].esfuerzo === "max" && r[1].cuando.length === 2);
}

/* ── Elegir la que manda ───────────────────────────────────────────────── */

const reglas = reglasDe(["router: adeorq -> sonnet", "router: adeorq web -> codex", "router: radar -> opus xhigh"].join("\n"));
caso("encaja por el nombre del proyecto", reglaQueManda(reglas, { proyecto: "Adeorq", encargo: "arregla el menú" })?.modelo === "sonnet");
caso("encaja por una palabra del encargo", reglaQueManda(reglas, { proyecto: "crypto", encargo: "mira el radar de hoy" })?.modelo === "opus");
caso("la más concreta gana", reglaQueManda(reglas, { proyecto: "Adeorq", encargo: "la web de descargas" })?.cli === "codex");
caso("todas las palabras tienen que estar", reglaQueManda(reglas, { proyecto: "VoCript", encargo: "la web" }) === null);
caso("sin reglas no hay regla", reglaQueManda([], { proyecto: "Adeorq", encargo: "x" }) === null);

/* ── Por el router ─────────────────────────────────────────────────────── */

const ex: Exigencia = { clase: "oficio", consecuencia: "baja", largo: false, trabajo: "codigo" };
const mundo: Mundo = { cuentas: [], avisos: "nunca", reglas };
{
  const r = recetarConMemoria(ex, mundo, undefined, undefined, { proyecto: "Adeorq", encargo: "arregla el menú" });
  caso("el modelo de la nota entra como pedido", r.modelo === "sonnet", JSON.stringify(r));
  caso("y el porqué dice de dónde sale", r.porque.some((l) => l.includes("router: adeorq -> sonnet")), r.porque.join(" | "));
}
{
  const r = recetarConMemoria(ex, mundo, undefined, undefined, { proyecto: "Adeorq", encargo: "la web de descargas" });
  caso("un cliente de la nota se impone", r.cli === "codex" && r.cuenta === undefined, JSON.stringify(r));
}
{
  const r = recetarConMemoria(ex, mundo, undefined, undefined, { proyecto: "crypto", encargo: "el radar" });
  caso("y el esfuerzo también", r.modelo === "opus" && r.esfuerzo === "xhigh", JSON.stringify(r));
}
{
  const sin = recetarConMemoria(ex, { cuentas: [], avisos: "nunca" }, undefined, undefined, { proyecto: "Adeorq", encargo: "x" });
  const plano = recetarConMemoria(ex, mundo, undefined, undefined, { proyecto: "VoCript", encargo: "nada que ver" });
  caso("sin regla que encaje, es el router de siempre", JSON.stringify(sin) === JSON.stringify(plano), JSON.stringify(plano));
}

console.log(fallos ? `\n${fallos} FALLAN.` : "\nTODO BIEN.");
process.exit(fallos ? 1 : 0);
