// Una actualización espera a los agentes a medio trabajo (decisión C3), probado sin la app.
//
//   pnpm bancos actualizar
//
// Lo que se prueba es `src/lib/actualizar.ts`: a quién frena una actualización
// (agentes en `a_medias` o con subagentes fuera; nunca una consola, nunca uno
// que te pregunta o terminó) y cómo se nombran en la tarjeta.

import { QUIETO_MS, quienFrena, trabajando } from "../src/lib/actualizar";
import type { PaneStatus } from "../src/lib/pty";

let fallos = 0;
function caso(nombre: string, ok: boolean, detalle = ""): void {
  console.log(`${ok ? "ok " : "MAL"} ${nombre}${detalle ? `  (${detalle})` : ""}`);
  if (!ok) fallos++;
}

const panel = (id: number, parte: Partial<PaneStatus>): PaneStatus => ({
  id,
  name: `panel ${id}`,
  cwd: "C:\\proyectos\\Adeorq",
  agent: true,
  agentsLive: 0,
  state: "",
  ...parte,
});

const estados: Record<number, PaneStatus> = {
  1: panel(1, { name: "claude", state: "a_medias" }),
  2: panel(2, { name: "codex", state: "pregunta" }),
  3: panel(3, { name: "consola", agent: false, state: "a_medias" }),
  4: panel(4, { name: "gemini", state: "lista" }),
  5: panel(5, { name: "capataz", state: "", agentsLive: 2 }),
  6: panel(6, { name: "kimi", state: "tuya" }),
};

{
  const f = trabajando(estados);
  caso("frenan los que están a medias o con subagentes fuera", f.map((s) => s.id).join(",") === "1,5", f.map((s) => s.name).join(","));
  caso("una consola no frena aunque diga a_medias", !f.some((s) => s.id === 3));
  caso("uno que te pregunta, te toca o terminó no frena", !f.some((s) => [2, 4, 6].includes(s.id)));
}

caso("sin paneles no frena nadie", trabajando({}).length === 0);
caso("se nombran tal cual hasta tres", quienFrena([estados[1], estados[5]]) === "claude, capataz");
caso("de cuatro en adelante, «y N más»", quienFrena([estados[1], estados[2], estados[4], estados[5], estados[6]]) === "claude, codex, gemini y 2 más");
caso("el orden es el del número de panel", trabajando({ 9: panel(9, { state: "a_medias" }), 2: panel(2, { state: "a_medias" }) }).map((s) => s.id).join(",") === "2,9");

// Lo que se MUEVE (2026-10-08): el estado del transcript llega hasta 20 s tarde,
// así que un agente cuya terminal ha sacado algo hace menos de QUIETO_MS frena,
// aunque conste como «lista». Es lo que cortó al de munito.dev.
{
  const ahora = 1_000_000;
  const quietos: Record<number, PaneStatus> = {
    4: panel(4, { name: "munito.dev", state: "lista" }),
    7: panel(7, { name: "consola", agent: false, state: "" }),
  };
  const movidos = new Map<number, number>([
    [4, ahora - 2_000],
    [7, ahora - 1_000],
  ]);
  const f = trabajando(quietos, movidos, ahora);
  caso("un agente «lista» que se movió hace 2 s frena", f.map((s) => s.id).join(",") === "4", f.map((s) => s.name).join(","));
  caso("una consola que se mueve no frena", !f.some((s) => s.id === 7));
  caso(
    "a los QUIETO_MS sin moverse deja de frenar",
    trabajando(quietos, new Map([[4, ahora - QUIETO_MS]]), ahora).length === 0,
  );
  caso("uno que nunca se movió y está «lista» no frena", trabajando(quietos, new Map(), ahora).length === 0);
}

if (fallos) {
  console.error(`\n${fallos} caso(s) MAL`);
  process.exit(1);
}
console.log("\ntodo bien");
