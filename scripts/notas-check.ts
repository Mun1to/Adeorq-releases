// Las notas del lienzo: su formato y a qué terminal se pueden lanzar
// (`lib/notas.ts`).
//
// Lo que no puede pasar: lanzarle una nota a una terminal que te está
// preguntando algo (lo escrito contestaría a su pregunta), o que el encargo
// que recibe el agente no diga qué archivo abrir.
//
//   pnpm bancos notas

import { conTitulo, cuerpoDe, destinosDeNota, encargoDeNota, leerLineas, tituloDe, voltear } from "../src/lib/notas";
import type { PaneStatus, WorkState } from "../src/lib/pty";

let fallos = 0;
// El lanzador solo enseña las últimas líneas: los rojos se repiten al final.
const rojos: string[] = [];
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) {
    fallos++;
    rojos.push(detalle ? `${nombre} (${detalle})` : nombre);
  }
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const es = (nombre: string, obtenido: unknown, esperado: unknown) =>
  ok(nombre, JSON.stringify(obtenido) === JSON.stringify(esperado), `sale ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`);

const panel = (id: number, state: WorkState, extra: Partial<PaneStatus> = {}): PaneStatus => ({
  id,
  name: `p${id}`,
  cwd: "C:\\x",
  agent: true,
  agentsLive: 0,
  state,
  porque: "",
  ...extra,
});
const mapa = (...p: PaneStatus[]) => Object.fromEntries(p.map((x) => [x.id, x]));

// --- a qué terminal se puede lanzar ---------------------------------------------------
es("sin terminales, ningún destino", destinosDeNota({}), []);
const d = destinosDeNota(
  mapa(panel(1, "", { agent: false, name: "PowerShell" }), panel(2, "lista", { name: "Adeorq" }), panel(3, "pregunta", { name: "Webs" }), panel(4, "a_medias", { name: "VoCript" })),
);
es("los agentes primero, y cada grupo por orden de apertura", d.map((x) => x.nombre), ["Adeorq", "Webs", "VoCript", "PowerShell"]);
es("a la que te pregunta algo no se le lanza", d.find((x) => x.nombre === "Webs")?.puede, false);
es("a la que trabaja sí: lo encola", d.find((x) => x.nombre === "VoCript")?.puede, true);
es("y a una terminal a secas también", d.find((x) => x.nombre === "PowerShell")?.puede, true);
es("cada destino lleva su estado, para pintarlo", d.map((x) => x.estado), ["lista", "pregunta", "a_medias", ""]);

// --- el encargo que recibe el agente ---------------------------------------------------
const NOTA = "# Antes del lunes\n\n- [ ] aviso de IA en la web\n- [x] publicar la 0.8.5\nllamar al gestor\n";
const encargo = encargoDeNota({ id: "n1", text: NOTA, stamp: 1, path: "C:\\notas\\n1.md" });
ok("el encargo nombra la nota y dice qué archivo abrir", encargo.includes("«Antes del lunes»") && encargo.includes("C:\\notas\\n1.md"), encargo.slice(0, 120));
ok("trae lo que queda por hacer y no lo ya hecho como pendiente", encargo.includes("aviso de IA en la web"));
ok("una nota sin título no rompe el encargo", encargoDeNota({ id: "n2", text: "solo texto", stamp: 1, path: "x.md" }).includes("sin título"));

// --- el formato -----------------------------------------------------------------------
es("el título es la primera línea con almohadilla", tituloDe(NOTA), "Antes del lunes");
es("las casillas se leen con su estado", leerLineas(cuerpoDe(NOTA)).filter((l) => l.hecha !== null).map((l) => l.hecha), [false, true]);
const tocada = voltear(NOTA, leerLineas(NOTA).findIndex((l) => l.hecha === false));
ok("marcar una casilla solo toca esa línea", tocada.includes("- [x] aviso de IA en la web") && tocada.includes("llamar al gestor"));
es("cambiar el título no toca el cuerpo", cuerpoDe(conTitulo(NOTA, "Otro")), cuerpoDe(NOTA));

console.log(fallos ? `\n${fallos} FALLOS: ${rojos.join("; ")}` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
