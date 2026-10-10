// El panel se pone nombre solo, y solo cuando su nombre no decía nada.
//
// `lib/nombreSolo.ts` cambia «Adeorq · claude» por «Adeorq · <título de la
// sesión>» en cuanto la sesión tiene título. Lo delicado no es cambiarlo, es
// NO tocar un nombre que ya decía algo: el que escribió Munir, el de una sesión
// retomada, el que eligió un agente al abrirla, el puesto de una cuadrilla.
//
//   pnpm bancos nombre-solo

import { esNombreDeFabrica, nombreConTitulo } from "../src/lib/nombreSolo";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const es = (nombre: string, obtenido: unknown, esperado: unknown) =>
  ok(nombre, obtenido === esperado, `sale ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`);

// --- cuáles son de fábrica ----------------------------------------------------
ok("el de una terminal nueva de Claude", esNombreDeFabrica("Adeorq · claude"));
ok("con el nombre del CLI en vez del id", esNombreDeFabrica("Adeorq · Codex"));
ok("el de abrir varias a la vez", esNombreDeFabrica("Adeorq · claude 3"));
ok("el de una cuenta, con el nombre largo del CLI", esNombreDeFabrica("Trabajo · Claude Code"));
ok("uno escrito a mano NO", !esNombreDeFabrica("Adeorq · arreglar la barra"));
ok("el título de una sesión retomada NO", !esNombreDeFabrica("Fix top bar overflow"));
ok("una terminal sin agente NO", !esNombreDeFabrica("Adeorq · terminal"), "no tiene sesión que la titule");
ok("el que eligió un agente por el MCP NO", !esNombreDeFabrica("Adeorq · revisor de seguridad"));
ok("uno que solo menciona al CLI NO", !esNombreDeFabrica("Adeorq · claude revisa el diff"));

// --- y qué nombre le toca ------------------------------------------------------
es("coge el título y conserva el proyecto", nombreConTitulo("Adeorq · claude", "Arreglar la barra"), "Adeorq · Arreglar la barra");
es("sin proyecto delante, el título a secas", nombreConTitulo("claude", "Arreglar la barra"), "Arreglar la barra");
es("quita los espacios de alrededor", nombreConTitulo("Adeorq · claude 2", "  Subir Tauri  "), "Adeorq · Subir Tauri");
es("sin título todavía, se queda", nombreConTitulo("Adeorq · claude", ""), null);
es("sin título (no llegó), se queda", nombreConTitulo("Adeorq · claude", undefined), null);
es("un nombre puesto a mano no se toca", nombreConTitulo("Adeorq · arreglar la barra", "Otro título"), null);
es(
  "ya titulado, un título nuevo no lo vuelve a cambiar",
  nombreConTitulo(nombreConTitulo("Adeorq · claude", "Arreglar la barra")!, "Otra cosa"),
  null,
);

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
