// Las reglas que leen la pantalla de una terminal, y el estado de un panel con
// su porqué (`lib/reglasPantalla.ts`).
//
// Las pantallas de abajo imitan lo que pintan los CLI. Si un día Claude Code
// cambia el texto de su pantalla de permisos, el arreglo es cambiar la regla Y
// la pantalla de aquí, las dos a la vez: este banco no caza ese cambio (no ve
// al CLI de verdad), lo que fija es que las reglas sigan leyendo lo que leen.
//
//   pnpm bancos reglas-pantalla

import { estadoDelPanel, loginSegun, parseAsk, PREGUNTAS } from "../src/lib/reglasPantalla";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const es = (nombre: string, obtenido: unknown, esperado: unknown) =>
  ok(nombre, JSON.stringify(obtenido) === JSON.stringify(esperado), `sale ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`);

// --- las preguntas ------------------------------------------------------------------
const permiso = [
  "│ Bash command                                   │",
  "│   rm -rf dist                                  │",
  "│ Do you want to proceed?                        │",
  "│ ❯ 1. Yes                                       │",
  "│   2. Yes, and don't ask again for rm commands  │",
  "│   3. No, and tell Claude what to do differently │",
  "╰────────────────────────────────────────────────╯",
].join("\n");
const p = parseAsk(permiso);
es("el permiso de Claude: sus tres opciones", p?.options.map((o) => `${o.n}:${o.label}`), [
  "1:Yes",
  "2:Yes, and don't ask again for rm commands",
  "3:No, and tell Claude what to do differently",
]);
es("y dice qué regla saltó", p?.regla, "Do you want to proceed?");
es("sin Enter: basta el número", p?.enter, false);

const generico = ["Select model", "Enter to confirm · Esc to exit", "❯ 1. Opus 4.7", "  2. Sonnet 5"].join("\n");
const g = parseAsk(generico);
es("un menú con «Enter to confirm» encima de sus opciones pide número y Enter", [g?.enter, g?.regla, g?.options.length], [true, "Enter to confirm", 2]);
ok("«Opus 4.7» no se lee como la opción 4", !g?.options.some((o) => o.n === "4"));
// OJO, y es lo que hace hoy, no lo que debería: las opciones se buscan de la
// regla HACIA ABAJO. Con el pie «Enter to confirm» DEBAJO de las opciones no se
// lee ninguna. Está fijado aquí para que cambiarlo sea una decisión con una
// pantalla de verdad delante, no un efecto de mover código (2026-10-10).
const conPieAbajo = ["Select model", "❯ 1. Opus 4.7", "  2. Sonnet 5", "  3. Haiku 4.5", "Enter to confirm · Esc to exit"].join("\n");
es("con el pie debajo de las opciones, hoy no lee nada", parseAsk(conPieAbajo), null);

const sino = "Allow tool call? [y/N]";
es("un sí o no sin opciones escritas", parseAsk(sino)?.options.map((o) => [o.n, o.propio]), [["y", true], ["n", true]]);

const vieja = `${permiso}\n${Array.from({ length: 14 }, (_, i) => `línea ${i}`).join("\n")}`;
es("una pregunta que quedó doce líneas arriba ya es historia", parseAsk(vieja), null);
es("una pantalla sin pregunta, nada", parseAsk("> escribiendo código…\n  esc to interrupt"), null);
es("un texto que casa pero sin dos opciones, nada", parseAsk("Do you want to proceed?\n  1. Yes"), null);
ok(
  "la regla genérica va la última, para que ganen las que explican más",
  PREGUNTAS[PREGUNTAS.length - 1].test === "Enter to confirm",
);
es(
  "con las dos en pantalla gana la específica",
  parseAsk(`${permiso}\nEnter to confirm`)?.regla,
  "Do you want to proceed?",
);
es("con otra tabla de reglas, lee con esa", parseAsk("¿Sigo?\n 1. Sí\n 2. No", [{ test: "¿Sigo?", hint: "x" }])?.regla, "¿Sigo?");

// --- el login -----------------------------------------------------------------------
es("pide iniciar sesión", loginSegun("…OAuth access token has expired…"), true);
es("ya la tiene", loginSegun("Login successful. Welcome back"), false);
es("no dice nada", loginSegun("compilando"), null);
es("si dice las dos cosas, manda la que pide", loginSegun("Login successful\nRe-authenticate to continue"), true);

// --- el estado y su porqué ------------------------------------------------------------
const base = { exited: false, ask: null, needsLogin: false, transcript: "a_medias" as const };
es("muerto, aunque el transcript diga que trabaja", estadoDelPanel({ ...base, exited: true }).state, "");
const conMenu = estadoDelPanel({ ...base, ask: p });
es("un menú en pantalla manda sobre el transcript", conMenu.state, "pregunta");
ok("y el porqué nombra la regla", conMenu.porque.includes("«Do you want to proceed?»"), conMenu.porque);
const sinSesion = estadoDelPanel({ ...base, needsLogin: true });
ok("pedir login también es esperarte", sinSesion.state === "pregunta" && sinSesion.porque.includes("iniciar sesión"));
const delTranscript = estadoDelPanel({ ...base, transcript: "ofrece" });
ok("sin nada en pantalla, lo que diga el transcript", delTranscript.state === "ofrece" && delTranscript.porque.startsWith("lo dice el transcript"));
const nada = estadoDelPanel({ ...base, transcript: undefined });
ok("y sin transcript, desconocido y dicho así", nada.state === "" && nada.porque.startsWith("ni la pantalla ni el transcript"), nada.porque);
ok(
  "ningún estado se queda sin porqué",
  (["pregunta", "ofrece", "lista", "a_medias", "tuya", ""] as const).every((s) => estadoDelPanel({ ...base, transcript: s }).porque.length > 20),
);

console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
