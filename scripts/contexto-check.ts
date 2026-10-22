// El aviso de contexto y el compactar casi obligatorio (`lib/contexto.ts`).
//
// Munir, 2026-10-22, después de gastar el 40 % de su semana de Claude en un día:
// «que sea casi obligatorio compactar en ese rango», del 50 al 60 %. Cada
// mensaje relee el contexto entero, así que una sesión cargada paga de más en
// cada turno, y dejarla llegar al compactado automático del CLI la corta a
// mitad de una tarea y sin el `/fin` que guarda los traspasos.
//
// D7, el mismo día, tras medir que el 85,8 % del gasto son respuestas con 200k
// o más de contexto: las rayas van por TOKENS, no por el % de la ventana (con
// un millón, el 50 % eran 500k y llegaba tarde). 300k avisa, 400k compacta y
// 600k ofrece una terminal nueva; en una ventana pequeña vale lo que llegue
// antes, los tokens o el % de antes, para que Haiku siga avisando.
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
  bloqueRetomar,
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
  /** Miles de tokens de contexto, sobre `ventana`. */
  k: number;
  ventana: number;
  vivos: number;
  pregunta: boolean;
  borrador: boolean;
  trabajando: boolean;
  visto: number;
  fin: boolean;
  claude: boolean;
  sinDato: boolean;
  sugerir: boolean;
  veces: number;
  respuesta: string | null;
}> = {}) {
  const s = {
    modo: "sin-commits" as ModoSolo,
    estado: "lista" as WorkState,
    k: 420,
    ventana: 1_000_000,
    vivos: 0,
    pregunta: false,
    borrador: false,
    trabajando: false,
    visto: 0,
    fin: true,
    claude: true,
    sinDato: false,
    sugerir: true,
    veces: 0,
    respuesta: null as string | null,
    reloj: 1_000_000,
    ...o,
  };
  const mandado: string[] = [];
  /** Con qué primer mensaje nació cada terminal nueva (null: el de la casa). */
  const nuevas: Array<string | null> = [];
  const archivadas: number[] = [];
  const sugerencias: Array<number | null> = [];
  const tr = crearTraspaso({
    t: (x) => x,
    mandar: async (x) => {
      mandado.push(x);
    },
    leer: async () => (s.sinDato ? null : { state: s.estado, agentsLive: s.vivos, used: s.k * 1000, window: s.ventana }),
    hayPregunta: () => s.pregunta,
    hayBorrador: () => s.borrador,
    trabajando: () => s.trabajando,
    visto: () => s.visto,
    modo: () => s.modo,
    sugerir: () => s.sugerir,
    esClaude: () => s.claude,
    tieneFin: async () => s.fin,
    compactaciones: async () => s.veces,
    ultimaRespuesta: async () => s.respuesta,
    archivar: async () => {
      archivadas.push(1);
    },
    abrirNueva: (encargo) => nuevas.push(encargo),
    alSugerir: (p) => sugerencias.push(p),
    esperar: async () => {},
    ahora: () => s.reloj,
  });
  return { s, tr, mandado, nuevas, archivadas, sugerencias };
}

/** Lo que contesta un /fin de verdad, recortado: sus dos bloques del final. */
const RESPUESTA_FIN = [
  "**Compactar a tiempo, hecho y commiteado.**",
  "",
  "## Mensaje de compactación",
  "```",
  "# COMPACTACIÓN, Sesión compactar (2026-10-22)",
  "## Pendiente",
  "- push con su OK",
  "```",
  "",
  "## Retomar la sesión",
  "```text",
  "# RETOMAR, Adeorq compactar a tiempo (guardado el 2026-10-22)",
  "",
  "Retomo esto. Antes de proponer nada:",
  "",
  "- Carpeta: C:\\proyectos\\Adeorq. Lee su AGENTS.md y su BUZON.md.",
  "```",
  "",
  "Quedan 2 commits por delante del remoto. ¿Los subo?",
].join("\n");

async function main() {
  // ── Las rayas ───────────────────────────────────────────────────────────
  const n = (k: number, ventana = 1_000_000) => nivelDeContexto({ used: k * 1000, window: ventana });
  es("sin dato no hay aviso", nivelDeContexto(undefined), 0);
  es("un millón: 299k todavía no", n(299), 0);
  es("un millón: 300k ya avisa (el 30 %, no el 50)", n(300), 1);
  es("un millón: 399k sigue en el aviso", n(399), 1);
  es("un millón: 400k compacta (el 40 %, no el 60)", n(400), 2);
  es("un millón: 599k sigue en compactar", n(599), 2);
  es("un millón: 600k, mejor una terminal nueva (no el 80 %)", n(600), 3);
  es("Haiku (200k): 99k todavía no", n(99, 200_000), 0);
  es("Haiku: el 50 % (100k) llega antes que los 300k y avisa", n(100, 200_000), 1);
  es("Haiku: el 60 % (120k) compacta", n(120, 200_000), 2);
  es("Haiku: el 80 % (160k), terminal nueva", n(160, 200_000), 3);
  es("sin ventana sabida, solo los tokens", n(400, 0), 2);
  es("sin tokens (Codex no los da), nada", nivelDeContexto({ used: 0, window: 0 }), 0);

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
    es("a 420k y con el turno acabado, la campana manda /fin sin commits", p.mandado, ["/fin sin commits"]);
    es("y queda cerrando", p.tr.fase(), "cerrando");
    await p.tr.alSonar();
    ok("la campana siguiente manda el /compact", p.mandado.length === 2 && p.mandado[1].startsWith("/compact "), JSON.stringify(p.mandado));
    es("y se acaba", p.tr.fase(), "nada");
    await p.tr.alSonar();
    es("una campana más, con el número viejo todavía en el transcript, no vuelve a empezar", p.mandado.length, 2);
    p.s.k = 30;
    await p.tr.alSonar();
    p.s.k = 430;
    await p.tr.alSonar();
    es("pero si bajó y vuelve a cruzar los 400k, vuelve a hacerlo", p.mandado.slice(2), ["/fin sin commits"]);
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
    const p = panel({ k: 350 });
    await p.tr.alSonar();
    es("a 350k solo se avisa: nada se manda solo", p.mandado, []);
  }
  {
    const p = panel({ k: 130, ventana: 200_000 });
    await p.tr.alSonar();
    es("en Haiku, a 130k (el 65 %) compacta solo como antes", p.mandado, ["/fin sin commits"]);
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
    es("«Ahora no» a 420k: la campana no manda nada", p.mandado, []);
    p.s.k = 610;
    await p.tr.alSonar();
    es("pero al cruzar los 600k es otro aviso y vuelve", p.mandado, ["/fin sin commits"]);
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
    const p = panel({ modo: "no", k: 650 });
    await p.tr.pedir("nueva");
    await p.tr.alSonar();
    es("Nueva con traspaso: /fin y, al acabar, la terminal nueva", [p.mandado, p.nuevas.length], [["/fin"], 1]);
    es("sin bloque «Retomar» en la respuesta, nace con el encargo de la casa", p.nuevas, [null]);
  }

  // ── Ya compactada dos veces (Munir, D4: «Sí, que me la ofrezca») ───────
  es("el bloque «Retomar la sesión» sale de la respuesta del /fin, sin las vallas", bloqueRetomar(RESPUESTA_FIN)?.split("\n")[0], "# RETOMAR, Adeorq compactar a tiempo (guardado el 2026-10-22)");
  ok("y entero hasta su valla", /Lee su AGENTS\.md y su BUZON\.md\.$/.test(bloqueRetomar(RESPUESTA_FIN) ?? ""), JSON.stringify(bloqueRetomar(RESPUESTA_FIN)));
  ok("no se lleva el de compactación", !/COMPACTACIÓN/.test(bloqueRetomar(RESPUESTA_FIN) ?? ""));
  es("una respuesta sin él no da nada", bloqueRetomar("Hecho. ¿Lo subo?"), null);
  es("sin el título, vale un bloque que empiece por # RETOMAR", bloqueRetomar("Toma:\n```\n# RETOMAR, x\nsigue\n```"), "# RETOMAR, x\nsigue");
  {
    const p = panel({ veces: 2 });
    await p.tr.alSonar();
    es("compactada dos veces, la campana de los 420k NO compacta una tercera", p.mandado, []);
    es("y no abre nada sin su clic", [p.nuevas.length, p.archivadas.length], [0, 0]);
  }
  {
    const p = panel({ veces: 1 });
    await p.tr.alSonar();
    es("compactada una vez, compacta como siempre", p.mandado, ["/fin sin commits"]);
  }
  {
    const p = panel({ veces: 2, respuesta: RESPUESTA_FIN });
    await p.tr.pedir("nueva");
    es("con su clic va el /fin", p.mandado, ["/fin"]);
    await p.tr.alSonar();
    es("y al acabar nace la nueva con el bloque «Retomar» como primer mensaje", p.nuevas.map((x) => x?.split("\n")[0]), ["# RETOMAR, Adeorq compactar a tiempo (guardado el 2026-10-22)"]);
    es("y la vieja deja su rastro para archivarse", p.archivadas.length, 1);
    es("sin /compact en la vieja", p.mandado, ["/fin"]);
    await p.tr.alSonar();
    es("y después la vieja no se compacta sola", p.mandado, ["/fin"]);
  }

  // ── Una tarea grande, por debajo del aviso ──────────────────────────────
  // Medido en sus transcripts (7 días, 1.981 turnos): un turno sube 12k de
  // mediana y 87k en el p90; 50k o más, uno de cada cinco y medio.
  {
    const p = panel({ k: 150 });
    await p.tr.alSonar();
    p.s.k = 220;
    await p.tr.alSonar();
    es("una tarea que sube 70k y acaba en 220k lo sugiere", p.sugerencias, [220_000]);
    es("sugerir no manda nada", p.mandado, []);
    p.s.k = 240;
    await p.tr.alSonar();
    es("la siguiente, que sube 20k, no", p.sugerencias, [220_000]);
  }
  {
    const p = panel({ k: 100 });
    await p.tr.alSonar();
    p.s.k = 190;
    await p.tr.alSonar();
    es("por debajo de 200k no se sugiere aunque suba mucho", p.sugerencias, []);
  }
  {
    const p = panel({ k: 250 });
    await p.tr.alSonar();
    p.s.k = 320;
    await p.tr.alSonar();
    es("pasados los 300k ya no es sugerencia: es el aviso", p.sugerencias, []);
  }
  {
    const p = panel({ k: 50, ventana: 200_000 });
    await p.tr.alSonar();
    p.s.k = 85;
    await p.tr.alSonar();
    es("en Haiku, como antes: sube 35k (más del 10 %) y acaba en 85k (más del 40 %)", p.sugerencias, [85_000]);
  }
  {
    const p = panel({ k: 150, sugerir: false });
    await p.tr.alSonar();
    p.s.k = 260;
    await p.tr.alSonar();
    es("con la sugerencia apagada, nada", p.sugerencias, []);
  }

  console.log(fallos ? `\n${fallos} FALLAN:\n  ${rojos.join("\n  ")}` : "\nTodo en verde.");
  process.exitCode = fallos ? 1 : 0;
}

void main();
