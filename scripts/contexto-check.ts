// El aviso de contexto y el compactar casi obligatorio (`lib/contexto.ts`).
//
// Munir, 2026-10-22, después de gastar el 40 % de su semana de Claude en un día:
// «que sea casi obligatorio compactar en ese rango», del 50 al 60 %. Cada
// mensaje relee el contexto entero, así que una sesión cargada paga de más en
// cada turno, y dejarla llegar al compactado automático del CLI la corta a
// mitad de una tarea y sin el `/fin` que guarda los traspasos.
//
// Lo que no puede pasar, que es lo que se mira aquí:
//   · que se le teclee algo a un agente a MITAD de un turno: con herramientas
//     en marcha, con subagentes fuera, con una pregunta suya en pantalla, o
//     con un borrador tuyo a medio escribir;
//   · que compacte solo sin que el ajuste lo diga, o sin el `/fin` delante;
//   · que «Ahora no» no lo pare;
//   · que tras compactar una vez ya no vuelva a avisar (pasaba: el «visto» no
//     se olvidaba nunca y el panel se quedaba mudo hasta el 80 %);
//   · que toque a Codex o a Gemini, que compactan a su manera.
//
//   pnpm bancos contexto

import {
  CADUCA_MS,
  crearTraspaso,
  leerModoSolo,
  nivelDeContexto,
  trabajaEnPantalla,
  turnoAcabado,
  type ModoSolo,
} from "../src/lib/contexto";
import type { WorkState } from "../src/lib/pty";

let fallos = 0;
const rojos: string[] = [];
function ok(nombre: string, cond: boolean, detalle = "") {
  if (!cond) {
    fallos++;
    rojos.push(detalle ? `${nombre} (${detalle})` : nombre);
  }
  console.log(`${cond ? "ok  " : "FALLA"} ${nombre}${detalle && !cond ? ` — ${detalle}` : ""}`);
}
const es = (nombre: string, obtenido: unknown, esperado: unknown) =>
  ok(nombre, JSON.stringify(obtenido) === JSON.stringify(esperado), `sale ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`);

/** Un panel de mentira: lo que diría su transcript, lo que hay en su pantalla
 *  y lo que le llega tecleado. */
function panel(o: Partial<{
  modo: ModoSolo;
  estado: WorkState;
  pct: number;
  vivos: number;
  pregunta: boolean;
  borrador: boolean;
  trabajando: boolean;
  visto: number;
  fin: boolean;
  claude: boolean;
  sinDato: boolean;
  sugerir: boolean;
}> = {}) {
  const s = {
    modo: "sin-commits" as ModoSolo,
    estado: "lista" as WorkState,
    pct: 62,
    vivos: 0,
    pregunta: false,
    borrador: false,
    trabajando: false,
    visto: 0,
    fin: true,
    claude: true,
    sinDato: false,
    sugerir: true,
    reloj: 1_000_000,
    ...o,
  };
  const mandado: string[] = [];
  const nuevas: number[] = [];
  const sugerencias: Array<number | null> = [];
  const tr = crearTraspaso({
    t: (x) => x,
    mandar: async (x) => {
      mandado.push(x);
    },
    leer: async () => (s.sinDato ? null : { state: s.estado, agentsLive: s.vivos, percent: s.pct }),
    hayPregunta: () => s.pregunta,
    hayBorrador: () => s.borrador,
    trabajando: () => s.trabajando,
    visto: () => s.visto,
    modo: () => s.modo,
    sugerir: () => s.sugerir,
    esClaude: () => s.claude,
    tieneFin: async () => s.fin,
    abrirNueva: () => nuevas.push(1),
    alSugerir: (p) => sugerencias.push(p),
    esperar: async () => {},
    ahora: () => s.reloj,
  });
  return { s, tr, mandado, nuevas, sugerencias };
}

async function main() {
  // ── Las rayas ───────────────────────────────────────────────────────────
  es("sin dato no hay aviso", nivelDeContexto(undefined), 0);
  es("49 % todavía no", nivelDeContexto(49), 0);
  es("50 % ya avisa", nivelDeContexto(50), 1);
  es("59 % sigue en el aviso", nivelDeContexto(59), 1);
  es("60 % es el fijo", nivelDeContexto(60), 2);
  es("79 % sigue en el fijo", nivelDeContexto(79), 2);
  es("80 % es el de una terminal nueva", nivelDeContexto(80), 3);

  // ── Cuándo un turno ha acabado de verdad ───────────────────────────────
  const fin = (state: WorkState, extra: Partial<{ agentsLive: number }> = {}, pregunta = false) =>
    turnoAcabado({ state, agentsLive: 0, ...extra }, pregunta);
  ok("«lista» es turno acabado", fin("lista"));
  ok("«ofrece» también (acaba en pregunta suya, pero no espera menú)", fin("ofrece"));
  ok("«a_medias» NO: hay herramientas en marcha", !fin("a_medias"));
  ok("«pregunta» NO: hay un menú esperando", !fin("pregunta"));
  ok("«tuya» NO: acaba de llegarle un mensaje", !fin("tuya"));
  ok("sin estado NO", !fin(""));
  ok("con un subagente fuera NO", !fin("lista", { agentsLive: 1 }));
  ok("con una pregunta en pantalla NO", !fin("lista", {}, true));
  ok("sin transcript NO", !turnoAcabado(null, false));

  // ── Lo que Munir eligió el 2026-10-22 (A1, B1) ──────────────────────────
  // «y que cuando todavía esté trabajando no compactar auto»: además del
  // transcript, el pie de turno del CLI en pantalla.
  es("de fábrica, el 60 % compacta solo y sin commits", leerModoSolo(), "sin-commits");
  const pantalla = (...l: string[]) => (i: number) => l[i] ?? "";
  ok("el pie de turno de Claude en pantalla es trabajar", trabajaEnPantalla(pantalla("", "✻ Pensando… (12s · esc to interrupt)", "> "), 3));
  ok("una pantalla quieta, no", !trabajaEnPantalla(pantalla("Hecho.", "", "> "), 3));

  // ── El 60 %, solo, a la campana ────────────────────────────────────────
  {
    const p = panel();
    await p.tr.alSonar();
    es("al 62 % y con el turno acabado, la campana manda /fin sin commits", p.mandado, ["/fin sin commits"]);
    es("y queda cerrando", p.tr.fase(), "cerrando");
    await p.tr.alSonar();
    ok("la campana siguiente manda el /compact", p.mandado.length === 2 && p.mandado[1].startsWith("/compact "), JSON.stringify(p.mandado));
    es("y se acaba", p.tr.fase(), "nada");
    await p.tr.alSonar();
    es("una campana más, con el número viejo todavía en el transcript, no vuelve a empezar", p.mandado.length, 2);
    p.s.pct = 9;
    await p.tr.alSonar();
    p.s.pct = 63;
    await p.tr.alSonar();
    es("pero si bajó y vuelve a cruzar el 60 %, vuelve a hacerlo", p.mandado.slice(2), ["/fin sin commits"]);
  }
  {
    const p = panel({ modo: "fin" });
    await p.tr.alSonar();
    es("con el modo «fin» va el /fin entero", p.mandado, ["/fin"]);
  }
  {
    const p = panel({ modo: "no" });
    await p.tr.alSonar();
    es("con el modo «no» la campana no manda nada", p.mandado, []);
  }
  {
    const p = panel({ pct: 55 });
    await p.tr.alSonar();
    es("al 55 % solo se avisa: nada se manda solo", p.mandado, []);
  }
  for (const [nombre, o] of [
    ["herramientas en marcha", { estado: "a_medias" as WorkState }],
    ["un subagente fuera", { vivos: 1 }],
    ["un menú suyo esperando", { estado: "pregunta" as WorkState }],
    ["una pregunta en pantalla", { pregunta: true }],
    ["un borrador tuyo a medio escribir", { borrador: true }],
    ["un mensaje recién llegado", { estado: "tuya" as WorkState }],
    ["el CLI trabajando en pantalla, aunque el transcript diga «lista»", { trabajando: true }],
    ["sin saber qué hace", { sinDato: true }],
  ] as const) {
    const p = panel(o);
    await p.tr.alSonar();
    es(`con ${nombre}, nada`, p.mandado, []);
  }
  {
    const p = panel({ estado: "a_medias" });
    await p.tr.alSonar();
    p.s.estado = "lista";
    await p.tr.alSonar();
    es("una campana intermedia no lo gasta: en la siguiente, acabada, sí", p.mandado, ["/fin sin commits"]);
  }
  {
    const p = panel({ visto: 2 });
    await p.tr.alSonar();
    es("«Ahora no» al 62 %: la campana no manda nada", p.mandado, []);
    p.s.pct = 81;
    await p.tr.alSonar();
    es("pero al cruzar el 80 % es otro aviso y vuelve", p.mandado, ["/fin sin commits"]);
  }
  {
    const p = panel({ claude: false });
    await p.tr.alSonar();
    es("en un panel que no es de Claude Code no hace nada solo", p.mandado, []);
  }
  {
    const p = panel({ fin: false });
    await p.tr.alSonar();
    ok("sin la skill /fin va el texto de la casa, sin commits", p.mandado.length === 1 && /Sin commits/.test(p.mandado[0]), JSON.stringify(p.mandado));
  }

  // ── Entre el /fin y el /compact ────────────────────────────────────────
  {
    const p = panel();
    await p.tr.alSonar();
    p.s.estado = "a_medias";
    await p.tr.alSonar();
    p.s.estado = "pregunta";
    await p.tr.alSonar();
    es("con el /fin pidiendo un permiso o preguntando, el /compact espera", p.mandado.length, 1);
    p.s.estado = "lista";
    await p.tr.alSonar();
    es("y sale cuando el /fin acaba", p.mandado.length, 2);
  }
  {
    const p = panel();
    await p.tr.alSonar();
    // Como el botón: cancela lo pendiente y da el nivel por visto.
    p.tr.cancelar();
    p.s.visto = 2;
    await p.tr.alSonar();
    es("«Ahora no» después del /fin: no hay /compact", p.mandado, ["/fin sin commits"]);
  }
  {
    const p = panel();
    await p.tr.alSonar();
    p.s.reloj += CADUCA_MS + 1;
    await p.tr.alSonar();
    es("pasado el plazo, no se compacta a destiempo", p.mandado.length, 1);
  }

  // ── El botón, a mano ───────────────────────────────────────────────────
  {
    const p = panel({ modo: "no", estado: "a_medias" });
    await p.tr.pedir("compactar");
    es("Compactar con el agente trabajando no teclea nada todavía", p.mandado, []);
    es("se queda esperando al turno", p.tr.fase(), "esperando");
    await p.tr.alSonar();
    es("una campana intermedia tampoco", p.mandado, []);
    p.s.estado = "lista";
    await p.tr.alSonar();
    es("al acabar el turno, el /fin (el entero: lo has pulsado tú)", p.mandado, ["/fin"]);
    await p.tr.alSonar();
    es("y luego el /compact", p.mandado.length, 2);
  }
  {
    const p = panel({ modo: "no" });
    await p.tr.pedir("compactar");
    es("Compactar con el turno acabado manda el /fin en el acto", p.mandado, ["/fin"]);
  }
  {
    const p = panel({ sinDato: true, claude: false, fin: false });
    await p.tr.pedir("compactar");
    ok("sin saber el estado (Gemini) el botón hace lo de siempre: el traspaso ya", p.mandado.length === 1 && /Sin commits/.test(p.mandado[0]));
    await p.tr.alSonar();
    ok("y el /compact a la campana siguiente", p.mandado.length === 2 && p.mandado[1].startsWith("/compact "));
  }
  {
    const p = panel({ modo: "no", pct: 85 });
    await p.tr.pedir("nueva");
    await p.tr.alSonar();
    es("Nueva con traspaso: /fin y, al acabar, la terminal nueva", [p.mandado, p.nuevas.length], [["/fin"], 1]);
  }

  // ── Una tarea grande, aunque vaya por el 40 % ──────────────────────────
  {
    const p = panel({ pct: 30 });
    await p.tr.alSonar();
    p.s.pct = 44;
    await p.tr.alSonar();
    es("una tarea que sube 14 puntos y acaba en el 44 % lo sugiere", p.sugerencias, [44]);
    es("sugerir no manda nada", p.mandado, []);
    p.s.pct = 47;
    await p.tr.alSonar();
    es("la siguiente, que sube 3, no", p.sugerencias, [44]);
  }
  {
    const p = panel({ pct: 20 });
    await p.tr.alSonar();
    p.s.pct = 38;
    await p.tr.alSonar();
    es("por debajo del 40 % no se sugiere aunque suba mucho", p.sugerencias, []);
  }
  {
    const p = panel({ pct: 30, sugerir: false });
    await p.tr.alSonar();
    p.s.pct = 45;
    await p.tr.alSonar();
    es("con la sugerencia apagada, nada", p.sugerencias, []);
  }

  console.log(fallos ? `\n${fallos} FALLAN:\n  ${rojos.join("\n  ")}` : "\nTodo en verde.");
  process.exitCode = fallos ? 1 : 0;
}

void main();
