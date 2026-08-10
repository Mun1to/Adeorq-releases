// Cuándo un agente deja de trabajar y te toca a ti.
//
// Es lo que dispara el salto a pantalla completa del ajuste «saltar a la sesión
// que termina». Antes colgaba solo de la campana del terminal, que es un pitido
// que no distingue nada y que a veces no llega; ahora cuelga del estado que
// Adeorq ya lee del transcript, y eso sí se puede probar.
//
//   npx tsc scripts/estados-check.ts --module commonjs --target es2022 \
//     --lib es2022,dom --esModuleInterop --skipLibCheck --outDir <tmp>
//   node <tmp>/scripts/estados-check.js

import { acabaDeReclamar, columnaDe, reclamaTuAtencion } from "../src/lib/estados";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

// --- quién reclama tu atención ----------------------------------------------
ok("terminar cuenta", reclamaTuAtencion("lista"));
ok("preguntarte cuenta", reclamaTuAtencion("pregunta"), "es el «o necesita mi feedback»");
ok("ofrecerte algo cuenta", reclamaTuAtencion("ofrece"));
ok("«te toca» cuenta", reclamaTuAtencion("tuya"));
ok("trabajando NO cuenta", !reclamaTuAtencion("a_medias"));
ok(
  "desconocido NO cuenta",
  !reclamaTuAtencion(""),
  "son los primeros segundos de una terminal recien abierta",
);
ok(
  "va de la mano de la columna del kanban",
  ["lista", "pregunta", "ofrece", "tuya"].every((s) => columnaDe(s as never) !== "trabajando"),
  "un solo vocabulario, no dos",
);

// --- y cuándo dispara, que es lo delicado ------------------------------------
ok("de trabajar a terminar: salta", acabaDeReclamar("a_medias", "lista"));
ok("de trabajar a preguntar: salta", acabaDeReclamar("a_medias", "pregunta"));
ok(
  "seguir esperando NO vuelve a saltar",
  !acabaDeReclamar("pregunta", "pregunta"),
  "el estado se recalcula cada pocos segundos: saltaria en bucle",
);
ok(
  "de esperar a esperar de otra forma tampoco",
  !acabaDeReclamar("pregunta", "lista"),
  "ya lo tenias delante",
);
ok("volver a trabajar no salta", !acabaDeReclamar("lista", "a_medias"));
ok(
  "el primer estado que se conoce NUNCA salta",
  !acabaDeReclamar(undefined, "lista"),
  "abrir Adeorq no puede maximizar lo ultimo que hiciste ayer",
);
ok(
  "ni siquiera si nace preguntando",
  !acabaDeReclamar(undefined, "pregunta"),
);
ok(
  "de desconocido a terminado SI salta",
  acabaDeReclamar("", "lista"),
  "una terminal que arranco y acabo enseguida",
);
ok("de trabajar a desconocido no salta", !acabaDeReclamar("a_medias", ""));

console.log(fallos === 0 ? "\nTODO BIEN" : `\n${fallos} FALLOS`);
