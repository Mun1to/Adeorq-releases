// Qué se hace cuando se le da a la X de la ventana (`lib/alCerrar.ts`).
//
// La regla que no se puede romper: la X nunca se queda en nada y nunca cierra
// con agentes dentro si lo fijado era dejarlos trabajando.
//
//   pnpm bancos al-cerrar

import { fraseDeLoAbierto, queHacer, recuento, type Abierto } from "../src/lib/alCerrar";
import type { PaneStatus } from "../src/lib/pty";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const es = (nombre: string, obtenido: unknown, esperado: unknown) =>
  ok(nombre, JSON.stringify(obtenido) === JSON.stringify(esperado), `sale ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`);

const panel = (id: number, extra: Partial<PaneStatus>): PaneStatus => ({
  id,
  name: `p${id}`,
  cwd: "C:\\x",
  agent: true,
  agentsLive: 0,
  state: "",
  porque: "",
  ...extra,
});
const mapa = (...p: PaneStatus[]) => Object.fromEntries(p.map((x) => [x.id, x]));

// --- el recuento ------------------------------------------------------------------
es("sin terminales", recuento({}), { abiertas: 0, trabajando: 0 });
es(
  "trabajar es estar a medias de un turno",
  recuento(mapa(panel(1, { state: "a_medias" }), panel(2, { state: "pregunta" }), panel(3, { state: "lista" }))),
  { abiertas: 3, trabajando: 1 },
);
es("o tener subagentes fuera, diga lo que diga el estado", recuento(mapa(panel(1, { state: "lista", agentsLive: 2 }))), { abiertas: 1, trabajando: 1 });
es("una recién abierta no trabaja todavía", recuento(mapa(panel(1, { state: "" }))), { abiertas: 1, trabajando: 0 });
es("un PowerShell a secas no es un agente", recuento(mapa(panel(1, { agent: false, state: "a_medias" }))), { abiertas: 1, trabajando: 0 });

// --- la decisión -------------------------------------------------------------------
const nada: Abierto = { abiertas: 0, trabajando: 0 };
const dos: Abierto = { abiertas: 2, trabajando: 1 };
const quietas: Abierto = { abiertas: 2, trabajando: 0 };
for (const modo of ["preguntar", "fondo", "cerrar"] as const) {
  es(`sin terminales se cierra sin preguntar (ajuste «${modo}»)`, queHacer(modo, nada, true), "cerrar");
}
es("de fábrica, con terminales, pregunta", queHacer("preguntar", dos, true), "preguntar");
es("y pregunta también si ninguna trabaja", queHacer("preguntar", quietas, true), "preguntar");
es("fijado a segundo plano, se esconde", queHacer("fondo", dos, true), "fondo");
es("fijado a cerrar, cierra aunque haya agentes: es lo que se eligió", queHacer("cerrar", dos, true), "cerrar");
es("fijado a segundo plano donde no lo hay, pregunta en vez de cerrar", queHacer("fondo", dos, false), "preguntar");

// --- la frase ----------------------------------------------------------------------
const t = (s: string, v?: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? `{${k}}`));
es("un agente", fraseDeLoAbierto(t, { abiertas: 3, trabajando: 1 }), "Hay 1 agente trabajando.");
es("varios agentes", fraseDeLoAbierto(t, { abiertas: 3, trabajando: 3 }), "Hay 3 agentes trabajando.");
es("ninguno, una terminal", fraseDeLoAbierto(t, { abiertas: 1, trabajando: 0 }), "Tienes 1 terminal abierta y ningún agente trabajando.");
es("ninguno, varias", fraseDeLoAbierto(t, quietas), "Tienes 2 terminales abiertas y ningún agente trabajando.");

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
