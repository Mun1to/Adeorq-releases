// El borde de una terminal en tres estados (`lib/aroDeEstado.ts`), la señal de
// «trabajando» que lo enciende (`crearTrabajando` y `engancharFinDeTurno` en
// `lib/finDeTurno.ts`) y que la hoja no vuelva a pintar los brillos de antes.
//
// Munir, 2026-11-21: «que no hayan tantos colorines de neón alrededor de las
// terminales que molesta a la vista, solo hayan tres claros, rojo porque te
// necesita sí o sí, amarillo porque ha terminado y verde de que está
// trabajando». Eligió la 3: el trabajando en azul, con su tramo que da vueltas.
//
// Lo que no puede pasar, que es lo que se mira aquí:
//   · que una terminal con un permiso en pantalla no salga en rojo;
//   · que el tramo se corte en un respiro entre dos pasos del mismo turno, o
//     que se quede encendido para siempre al acabar;
//   · que el amarillo tape al rojo o al azul;
//   · que vuelva el aro azul del foco, el naranja que respira o el color de
//     cuadrilla y de proyecto en el marco;
//   · que algo de esto se mueva por fotograma.
//
//   pnpm bancos aro

import { readFileSync } from "node:fs";
import { estadoDelAro } from "../src/lib/aroDeEstado";
import { lectorDeCaja } from "../src/lib/cajaDeEntrada";
import { esperaEnSuCaja, trabajaEnPantalla } from "../src/lib/contexto";
import { ASIENTO_FIN_MS, crearTrabajando, engancharFinDeTurno, MIRAR_CADA_MS, SUELTA_TRABAJO_MS } from "../src/lib/finDeTurno";

let fallos = 0;
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) fallos++;
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle ? ` (${detalle})` : ""}`);
}
function es<T>(nombre: string, visto: T, esperado: T) {
  ok(nombre, JSON.stringify(visto) === JSON.stringify(esperado), `visto ${JSON.stringify(visto)}, esperado ${JSON.stringify(esperado)}`);
}

// --- El orden de los estados -------------------------------------------------
const BASE = {
  exited: false,
  ask: false,
  needsLogin: false,
  trabaja: false,
  seLee: true,
  transcript: undefined,
  agentesVivos: 0,
  termino: false,
} as const;
const de = (m: Partial<Parameters<typeof estadoDelAro>[0]>) => estadoDelAro({ ...BASE, ...m });

es("en reposo, sin color", de({}), "");
es("un permiso en pantalla: te necesita", de({ ask: true }), "necesita");
es("pide iniciar sesión: te necesita", de({ needsLogin: true }), "necesita");
es("trabajando: azul", de({ trabaja: true }), "trabaja");
es("terminó y no la has mirado: amarillo", de({ termino: true }), "termino");
es("el permiso manda sobre el pie que aún dice que trabaja", de({ ask: true, trabaja: true }), "necesita");
es("el permiso manda sobre un turno terminado", de({ ask: true, termino: true }), "necesita");
es("un turno terminado que vuelve a trabajar ya no es amarillo", de({ trabaja: true, termino: true }), "trabaja");
es("un AskUserQuestion que solo dice el transcript: te necesita", de({ transcript: "pregunta" }), "necesita");
es(
  "pero si su pie ya dice que trabaja, esa pregunta está contestada",
  de({ transcript: "pregunta", trabaja: true }),
  "trabaja",
);
es("acabar en una pregunta en prosa es terminar, no necesitarte", de({ transcript: "ofrece", termino: true }), "termino");
es("con la pantalla legible, el «a medias» del transcript no enciende nada", de({ transcript: "a_medias" }), "");
es("donde la pantalla no se sabe leer, el «a medias» del transcript es trabajar", de({ seLee: false, transcript: "a_medias" }), "trabaja");
es("y los subagentes vivos también", de({ seLee: false, agentesVivos: 2 }), "trabaja");
es("un proceso muerto no tiene estado, aunque quedara un menú", de({ exited: true, ask: true, trabaja: true, termino: true }), "");

// --- La señal de trabajando, con su margen para apagarse ---------------------
{
  let reloj = 0;
  const t = crearTrabajando(() => reloj);
  es("se enciende en cuanto lo ve trabajar", t.ver(true), { cambio: true });
  es("y verlo otra vez no cambia nada", t.ver(true), { cambio: false });
  reloj += 100;
  es("al dejar de verlo, espera", t.ver(false), { cambio: false, volverEn: SUELTA_TRABAJO_MS });
  reloj += 500;
  ok("encendido durante el margen", t.si);
  es("un respiro entre dos pasos no lo apaga", t.ver(true), { cambio: false });
  reloj += 10;
  t.ver(false);
  reloj += SUELTA_TRABAJO_MS;
  es("pasado el margen sin verlo, se apaga", t.ver(false), { cambio: true });
  ok("apagado", !t.si);
  es("apagado no vuelve a pedir que se mire", t.ver(false), { cambio: false });
  t.ver(true);
  ok("soltar lo apaga en el acto (un fin de turno dicho)", t.soltar() && !t.si);
  ok("y soltarlo apagado no dice que cambió", !t.soltar());
  ok("el margen es el del fin de turno: el azul y el amarillo se relevan en la misma mirada", SUELTA_TRABAJO_MS === ASIENTO_FIN_MS);
}

// --- Enganchado a un terminal de mentira -------------------------------------
const RAYA = "─".repeat(60);
const TRABAJANDO = ["✶ Drizzling…", RAYA, "❯ ", RAYA, "  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt"];
const PARADA = ["● Hola.", "✻ Brewed for 11s · done 18:44", RAYA, "❯ ", RAYA, "  ⏵⏵ auto mode on (shift+tab to cycle)"];
const MENU = [RAYA, " Bash command", " Do you want to proceed?", " ❯ 1. Yes", "   2. No", "", " Esc to cancel · Tab to amend"];
const GEMINI_TRABAJA = ["", " ⠼ Thinking... (esc to cancel, 5s)", "╭────╮", "│ >   Type your message │", "╰────╯"];
ok("(las pantallas de mentira dicen lo que deben)", trabajaEnPantalla((i) => TRABAJANDO[i] ?? "", TRABAJANDO.length) && esperaEnSuCaja((i) => PARADA[i] ?? "", PARADA.length));

function terminal() {
  let reloj = 0;
  let pantalla = PARADA;
  const relojes: Array<{ en: number; f: () => void; vivo: boolean }> = [];
  const oyentes = { campana: [] as Array<() => void>, escrito: [] as Array<() => void> };
  const term = {
    get rows() {
      return pantalla.length;
    },
    buffer: { active: { baseY: 0, getLine: (y: number) => (pantalla[y] === undefined ? undefined : { translateToString: () => pantalla[y] }) } },
    onBell: (cb: () => void) => (oyentes.campana.push(cb), { dispose: () => {} }),
    onWriteParsed: (cb: () => void) => (oyentes.escrito.push(cb), { dispose: () => {} }),
  };
  return {
    term,
    ahora: () => reloj,
    programar: (f: () => void, ms: number) => {
      const x = { en: reloj + ms, f, vivo: true };
      relojes.push(x);
      return () => (x.vivo = false);
    },
    pasar(ms: number) {
      const hasta = reloj + ms;
      for (;;) {
        const x = relojes.filter((r) => r.vivo && r.en <= hasta).sort((a, b) => a.en - b.en)[0];
        if (!x) break;
        x.vivo = false;
        reloj = x.en;
        x.f();
      }
      reloj = hasta;
    },
    escribe(l: string[]) {
      pantalla = l;
      oyentes.escrito.forEach((f) => f());
    },
  };
}

{
  const m = terminal();
  const dicho: Array<[string, number]> = [];
  const soltar = engancharFinDeTurno(m.term, {
    esClaude: () => true,
    alAcabar: () => dicho.push(["fin", m.ahora()]),
    alTrabajar: (si) => dicho.push([si ? "trabaja" : "para", m.ahora()]),
    ahora: m.ahora,
    programar: m.programar,
  });
  m.escribe(TRABAJANDO);
  es("Claude Code: al verlo trabajar, se enciende", dicho.map((d) => d[0]), ["trabaja"]);
  m.pasar(1000);
  m.escribe(PARADA);
  m.pasar(MIRAR_CADA_MS);
  m.escribe(TRABAJANDO);
  m.pasar(5000);
  es("un respiro entre dos pasos no corta el tramo", dicho.map((d) => d[0]), ["trabaja"]);
  m.escribe(PARADA);
  m.pasar(MIRAR_CADA_MS + ASIENTO_FIN_MS + 100);
  es("al acabar, se apaga y luego el fin, sin que el programa escriba nada más", dicho.map((d) => d[0]), ["trabaja", "para", "fin"]);
  const [, apaga] = dicho[1];
  const [, fin] = dicho[2];
  ok("en la misma mirada: el azul no se queda un rato sin nada antes del amarillo", apaga === fin, `apaga a los ${apaga} ms, fin a los ${fin} ms`);
  m.escribe(TRABAJANDO);
  m.pasar(300);
  m.escribe(MENU);
  m.pasar(MIRAR_CADA_MS + SUELTA_TRABAJO_MS + 100);
  es(
    "parado en un permiso: deja de trabajar (el rojo lo pone el menú) y no hay fin",
    dicho.slice(3).map((d) => d[0]),
    ["trabaja", "para"],
  );
  soltar();
}

{
  const m = terminal();
  const dicho: string[] = [];
  let cli = "codex";
  engancharFinDeTurno(m.term, {
    esClaude: () => false,
    trabajaCon: () => lectorDeCaja(cli)?.trabaja ?? null,
    alAcabar: () => dicho.push("fin"),
    alTrabajar: (si) => dicho.push(si ? "trabaja" : "para"),
    ahora: m.ahora,
    programar: m.programar,
  });
  m.escribe(TRABAJANDO);
  m.pasar(100);
  m.escribe(PARADA);
  m.pasar(MIRAR_CADA_MS + SUELTA_TRABAJO_MS + 100);
  es("Codex: su «esc to interrupt» enciende y apaga el tramo, y el fin sigue siendo de su campana", dicho, ["trabaja", "para"]);
  cli = "gemini";
  m.escribe(GEMINI_TRABAJA);
  m.pasar(MIRAR_CADA_MS);
  es("Gemini: su «esc to cancel» también", dicho.slice(2), ["trabaja"]);
  cli = "opencode";
  ok("(opencode no tiene lector de pantalla)", lectorDeCaja(cli) === null);
  m.escribe(GEMINI_TRABAJA);
  m.pasar(MIRAR_CADA_MS);
  es("un CLI cuya pantalla no se sabe leer: se apaga y lo dice el transcript", dicho.slice(3), ["para"]);
}

{
  const m = terminal();
  let veces = 0;
  engancharFinDeTurno(m.term, { esClaude: () => false, alAcabar: () => {}, alTrabajar: () => veces++, ahora: m.ahora, programar: m.programar });
  m.escribe(TRABAJANDO);
  m.pasar(1000);
  ok("sin decirle cómo leer, fuera de Claude Code no mira la pantalla (como antes)", veces === 0);
}

// --- La hoja ------------------------------------------------------------------
const hoja = (f: string) => readFileSync(`src/estilos/${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const todas = ["01-base.css", "03-barra-lateral.css", "05-cabina.css", "06-barra-derecha.css", "10-lienzo.css", "14-lienzo-piezas.css", "19-temas.css", "41-contraste.css", "42-aspectos.css"];
const juntas = todas.map(hoja).join("\n");

ok("los tres colores están definidos", ["--estado-necesita:", "--estado-termino:", "--estado-trabaja:"].every((v) => hoja("01-base.css").includes(v)));
{
  // En el bloque de todos los claros (`data-claro`), no en cada uno: así un
  // claro nuevo no sale con el amarillo de los oscuros.
  const claros = /:root\[data-claro\]\s*\{([^}]*)\}/.exec(hoja("01-base.css"))?.[1] ?? "";
  ok(
    "y los temas claros llevan los suyos",
    ["--estado-necesita:", "--estado-termino:", "--estado-trabaja:"].every((v) => claros.includes(v)),
    "en `:root[data-claro]`: el amarillo de los oscuros sobre blanco no llega a 1,5:1",
  );
}
ok("el «terminó» ya no respira", !/pane-waiting|c3-termino/.test(juntas));
ok("ni pinta el marco ni la cabecera por su cuenta", !/\.pane\[data-done="true"\][^{]*\{/.test(juntas));
ok("el foco no lleva el color de la casa", !/\.pane\[data-focused="true"\][^{]*\{[^}]*var\(--accent\)/.test(juntas));
ok("la cuadrilla no pinta el marco ni la cabecera", !/\.pane\[data-team="true"\][^{]*\{/.test(juntas));
ok("el proyecto de una delegada tampoco, solo su «de: …»", !/\.pane\[data-delegada="true"\](?![^{]*\.pane-de)[^{]*\{/.test(juntas));
ok("el lienzo sin la franja de color arriba", !/\.rf-term::before/.test(juntas));
const cabina = hoja("05-cabina.css");
ok("el tramo va a pasos, no por fotograma", /animation:\s*aro-vuelta\s+4s\s+steps\(100\)/.test(cabina));
ok("el parpadeo, a dos cambios por vuelta y solo con el ajuste", /html\[data-parpadeo\][^{]*\{\s*animation:\s*aro-parpadeo\s+1\.2s\s+steps\(1, end\)/.test(cabina));
ok("y el hilo de la barra, a pasos también", /animation:\s*hilo-vuelta\s+3\.2s\s+steps\(80\)/.test(hoja("03-barra-lateral.css")));
const paso = (ms: number, pasos: number) => ms / pasos;
ok("el tramo y el hilo dan el paso a la vez (40 ms)", paso(4000, 100) === paso(3200, 80));
const temas = hoja("19-temas.css");
ok(
  "el modo rendimiento les quita pasos, no los apaga, y siguen a la vez (80 ms)",
  /steps\(50\)/.test(temas) && /steps\(40\)/.test(temas) && paso(4000, 50) === paso(3200, 40) && !/data-estado="trabaja"\][^{]*\{[^}]*animation:\s*none/.test(temas),
);

console.log(fallos ? `\n${fallos} en rojo` : "\ntodo en verde");
process.exit(fallos ? 1 : 0);
