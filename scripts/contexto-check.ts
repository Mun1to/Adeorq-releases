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

import { kindDeComando } from "../src/components/KindIcon";
import { lineaConEncargo } from "../src/lib/arranque";
import { sabe } from "../src/lib/providers";
import {
  bloqueRetomar,
  CADUCA_MS,
  crearTraspaso,
  esDelegada,
  esperaEnSuCaja,
  finDesconocidoEnPantalla,
  leerDelPanel,
  leerModoSolo,
  marcarDelegada,
  nivelDeContexto,
  trabajaEnPantalla,
  turnoAcabado,
  SEGUIR_HASTA_MS,
  VIGILA_COMPACTAR_MS,
  type ModoSolo,
} from "../src/lib/contexto";
import { apuntarFin, ASIENTO_FIN_MS, crearFinDeTurno, engancharFinDeTurno, FIN_RECIENTE_MS, finReciente, MIRAR_CADA_MS } from "../src/lib/finDeTurno";
import type { ContextInfo, WorkState } from "../src/lib/pty";

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
  delegada: boolean;
  /** Claude Code esperando en su caja vacía (`esperaEnSuCaja`). */
  caja: boolean;
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
    delegada: false,
    caja: true,
    /** La pantalla dice «Unknown command: /fin» (una terminal de otra cuenta). */
    finNo: false,
    reloj: 1_000_000,
    /** Si está, la PRÓXIMA lectura del transcript se queda esperando a que se
        resuelva, con lo que decía el transcript al pedirla: una campana que
        lee y tarda en volver. */
    retener: null as Promise<void> | null,
    /** Las vueltas de mirar sin campana y de `vigilar` (las esperas de
        VIGILA_COMPACTAR_MS) no corren solas: cada una espera a que el banco la
        suelte con `vuelta()`. Sin soltarlas, solo cuenta la campana. */
    manual: true,
    ...o,
  };
  const vueltas: Array<() => void> = [];
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
    leer: async () => {
      const foto = s.sinDato ? null : { state: s.estado, agentsLive: s.vivos, used: s.k * 1000, window: s.ventana };
      const espera = s.retener;
      s.retener = null;
      if (espera) await espera;
      return foto;
    },
    hayPregunta: () => s.pregunta,
    hayBorrador: () => s.borrador,
    trabajando: () => s.trabajando,
    enSuCaja: () => s.caja,
    finDesconocido: () => s.finNo,
    visto: () => s.visto,
    modo: () => s.modo,
    delegada: () => s.delegada,
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
    // El reloj corre lo que se espera: el asiento tras la campana pasa de verdad.
    esperar: async (ms) => {
      if (s.manual && ms === VIGILA_COMPACTAR_MS) await new Promise<void>((r) => vueltas.push(r));
      s.reloj += ms;
    },
    ahora: () => s.reloj,
  });
  /** Que corra todo lo que está en marcha hasta la próxima espera. */
  const asentar = () => new Promise<void>((r) => setTimeout(r, 0));
  /** Suelta una vuelta de `vigilar` y deja que llegue a la siguiente. */
  const vuelta = async () => {
    await asentar();
    vueltas.shift()?.();
    await asentar();
  };
  return { s, tr, mandado, nuevas, archivadas, sugerencias, asentar, vuelta };
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

  // ── Las que abrió un agente con open_pane (2026-10-30) ─────────────────
  // «Orquio General», 22-oct: sus seis delegadas acabaron entre 588k y 832k.
  // En ellas no hay nadie que pulse, así que a la raya roja compactan solas
  // aunque el ajuste de Munir diga «no» o «fin», y siempre sin commits. En
  // las de Munir manda su ajuste, como antes.
  marcarDelegada(7);
  ok("la ventana sabe qué terminales abrió un agente", esDelegada(7) && !esDelegada(8));
  {
    const p = panel({ modo: "no", delegada: true });
    await p.tr.alSonar();
    es("una delegada a 420k compacta sola aunque el ajuste diga «no»", p.mandado, ["/fin sin commits"]);
    await p.tr.alSonar();
    ok("y al acabar el /fin, su /compact", p.mandado.length === 2 && p.mandado[1].startsWith("/compact "), JSON.stringify(p.mandado));
  }
  {
    const p = panel({ modo: "fin", delegada: true });
    await p.tr.alSonar();
    es("con el ajuste en «fin», una delegada sigue sin commits", p.mandado, ["/fin sin commits"]);
  }
  for (const [nombre, o] of [
    ["trabajando en pantalla", { trabajando: true }],
    ["con herramientas en marcha", { estado: "a_medias" as WorkState }],
    ["sin saber qué hace", { sinDato: true }],
  ] as const) {
    const p = panel({ modo: "no", delegada: true, ...o });
    await p.tr.alSonar();
    es(`una delegada ${nombre} no se toca`, p.mandado, []);
  }
  {
    const p = panel({ modo: "no", delegada: true, veces: 2 });
    await p.tr.alSonar();
    es("una delegada ya compactada dos veces no se compacta sola una tercera", p.mandado, []);
  }
  {
    const p = panel({ modo: "no", delegada: true, k: 350 });
    await p.tr.alSonar();
    es("una delegada a 350k solo avisa", p.mandado, []);
  }

  // ── compactar_terminal: lo pide un agente por el MCP ────────────────────
  {
    const p = panel({ modo: "fin", estado: "a_medias" });
    await p.tr.pedirDeAgente();
    es("con el agente trabajando, el pedido de un agente no teclea nada", p.mandado, []);
    es("y espera a que acabe el turno", p.tr.fase(), "esperando");
    p.s.estado = "lista";
    p.s.trabajando = true;
    await p.tr.alSonar();
    es("con la pantalla diciendo que trabaja, tampoco", p.mandado, []);
    p.s.trabajando = false;
    await p.tr.alSonar();
    es("al parar de verdad, /fin SIN commits aunque el ajuste diga «fin»", p.mandado, ["/fin sin commits"]);
    await p.tr.alSonar();
    ok("y cuando acaba el /fin, el /compact", p.mandado.length === 2 && p.mandado[1].startsWith("/compact "), JSON.stringify(p.mandado));
  }
  {
    const p = panel({ k: 120 });
    await p.tr.pedirDeAgente();
    es("parada, lo empieza en el acto aunque vaya por 120k: lo pidió el agente", p.mandado, ["/fin sin commits"]);
  }
  {
    const p = panel({ sinDato: true });
    await p.tr.pedirDeAgente();
    await p.tr.alSonar();
    es("sin saber qué hace, el pedido de un agente no va a ciegas", p.mandado, []);
  }
  {
    const p = panel({ modo: "no", estado: "a_medias" });
    await p.tr.pedir("compactar");
    await p.tr.pedirDeAgente();
    p.s.estado = "lista";
    await p.tr.alSonar();
    es("si Munir ya había pulsado Compactar, el agente no empieza otro: va el /fin de Munir", p.mandado, ["/fin"]);
  }
  {
    const p = panel();
    await p.tr.alSonar();
    await p.tr.pedirDeAgente();
    await p.tr.alSonar();
    ok("pedido a mitad de un traspaso, no repite el /fin: sigue al /compact", p.mandado.length === 2 && p.mandado[1].startsWith("/compact "), JSON.stringify(p.mandado));
  }
  {
    const p = panel({ claude: false, sinDato: true, fin: false });
    await p.tr.pedirDeAgente();
    await p.tr.alSonar();
    es("en un panel que no es de Claude Code no teclea nada", p.mandado, []);
  }

  // ── compactarme: la sesión se compacta a sí misma y sigue (2026-11-11) ───
  // Munir, por «Orquio General»: «que puedas tú coger el mensaje de
  // compactación y compactar por tu cuenta en Adeorq y retomar la sesión».
  const BLOQUE = "# COMPACTACIÓN, Sesión prueba\n## Pendiente\n- la tienda";
  {
    const p = panel({ estado: "a_medias", manual: true });
    const r = p.tr.pedirPropia(BLOQUE, "Sigue.");
    await p.asentar();
    es("compactarme a mitad de su turno: lo acepta", r, "aceptado");
    es("y no teclea nada mientras trabaja", p.mandado, []);
    es("espera a que acabe su turno", p.tr.fase(), "esperando");
    p.s.estado = "lista";
    await p.tr.alSonar();
    es("al acabar su turno, /compact con su mensaje entero y sin /fin delante", p.mandado, [`/compact ${BLOQUE}`]);
    es("mientras compacta, cerrando", p.tr.fase(), "cerrando");
    await p.vuelta();
    await p.vuelta();
    es("mientras no acaba de compactar no le escribe nada más", p.mandado.length, 1);
    p.s.veces = 1;
    await p.vuelta();
    es("compactada y parada en su caja: le escribe que siga", p.mandado, [`/compact ${BLOQUE}`, "Sigue."]);
    es("y el traspaso se acaba", p.tr.fase(), "nada");
    await p.tr.alSonar();
    es("la raya no la vuelve a compactar con el número viejo del transcript", p.mandado.length, 2);
  }
  {
    const p = panel({ manual: true });
    p.tr.pedirPropia(BLOQUE, "Sigue.");
    await p.asentar();
    es("con la lectura del momento en «lista», no teclea: espera a una lectura asentada", p.mandado, []);
  }
  {
    // Un Claude Code que no toca la campana al acabar (medido con la 2.1.322).
    const p = panel({ estado: "a_medias", manual: true });
    p.tr.pedirPropia(BLOQUE, "Sigue.");
    await p.asentar();
    await p.vuelta();
    es("sin campana y trabajando, mirar cada poco no teclea nada", p.mandado, []);
    p.s.estado = "lista";
    await p.vuelta();
    es("sin campana, al verla parada manda el /compact igual", p.mandado, [`/compact ${BLOQUE}`]);
    p.s.veces = 1;
    await p.vuelta();
    es("y al acabar de compactar, el «sigue»", p.mandado, [`/compact ${BLOQUE}`, "Sigue."]);
  }
  {
    // La raya roja manda `/fin sin commits`, y la skill acaba llamando a compactarme.
    const p = panel({ manual: true });
    await p.tr.alSonar();
    es("la raya empieza con /fin sin commits", p.mandado, ["/fin sin commits"]);
    p.s.estado = "a_medias";
    p.tr.pedirPropia(BLOQUE, null);
    await p.asentar();
    p.s.estado = "lista";
    await p.tr.alSonar();
    es("el /fin que acaba en compactarme: un solo /compact, el suyo, y no el de la casa", p.mandado, ["/fin sin commits", `/compact ${BLOQUE}`]);
    p.s.veces = 1;
    p.s.k = 30;
    // La primera vuelta es la de mirar su turno, que ya no tiene nada que hacer.
    await p.vuelta();
    await p.vuelta();
    es("con seguir a null, compactada y sin escribirle nada", p.mandado.length, 2);
    es("y se acaba igual", p.tr.fase(), "nada");
  }
  {
    const p = panel({ estado: "a_medias", manual: true });
    await p.tr.pedir("nueva");
    es("si ya va a seguir en una terminal nueva, compactarme no la compacta", p.tr.pedirPropia(BLOQUE, "Sigue."), "nueva");
    await p.asentar();
    p.s.estado = "lista";
    await p.tr.alSonar();
    es("y el baile de la nueva sigue con su /fin", p.mandado, ["/fin"]);
  }
  {
    const p = panel({ estado: "a_medias", manual: true });
    p.tr.pedirPropia(BLOQUE, "Sigue.");
    await p.asentar();
    p.s.estado = "lista";
    await p.tr.alSonar();
    p.s.veces = 1;
    p.s.estado = "a_medias"; // Munir ya le escribió algo detrás
    for (let i = 0; i <= SEGUIR_HASTA_MS / VIGILA_COMPACTAR_MS + 2; i++) await p.vuelta();
    p.s.estado = "lista";
    await p.vuelta();
    es("si tras compactar otro siguió con ella, el «sigue» no le cae encima después", p.mandado, [`/compact ${BLOQUE}`]);
    es("y se olvida", p.tr.fase(), "nada");
  }
  {
    const p = panel({ estado: "a_medias", manual: true });
    p.tr.pedirPropia(BLOQUE, "Sigue.");
    await p.asentar();
    p.s.estado = "lista";
    await p.tr.alSonar();
    p.tr.cancelar();
    p.s.veces = 1;
    await p.vuelta();
    es("«Ahora no» mientras compacta: no le escribe que siga", p.mandado, [`/compact ${BLOQUE}`]);
  }
  {
    const p = panel({ estado: "a_medias", manual: true });
    p.tr.pedirPropia(BLOQUE, "Sigue.");
    await p.asentar();
    p.s.estado = "lista";
    await p.tr.alSonar();
    p.s.reloj += CADUCA_MS + 1;
    await p.vuelta();
    await p.vuelta();
    es("si el /compact no acaba nunca, caduca y suelta el panel", p.tr.fase(), "nada");
  }
  {
    const p = panel({ estado: "a_medias", manual: true });
    p.tr.pedirPropia(BLOQUE, "Sigue.");
    await p.asentar();
    p.s.estado = "lista";
    p.s.caja = false; // un menú suyo, o el CLI cerrado
    await p.tr.alSonar();
    es("sin su caja a la vista no teclea el /compact", p.mandado, []);
  }

  // ── Un /fin que la terminal no conoce (SESIÓN SUPREMA, 2026-11-09) ───────
  // `compactar_terminal` sobre una terminal de otra cuenta: «Unknown command:
  // /fin», sin turno ni campana, y el /compact no llegaba nunca.
  {
    const p = panel({ finNo: true });
    await p.tr.pedirDeAgente();
    ok(
      "si contesta que no conoce /fin, va el texto de traspaso de la casa",
      p.mandado.length === 2 && p.mandado[0] === "/fin sin commits" && p.mandado[1].startsWith("Antes de compactar"),
      JSON.stringify(p.mandado),
    );
    es("y sigue esperando para el /compact", p.tr.fase(), "cerrando");
    await p.tr.alSonar();
    ok("y a la campana de ese turno, el /compact", p.mandado.length === 3 && p.mandado[2].startsWith("/compact "), JSON.stringify(p.mandado));
  }
  {
    const p = panel({ modo: "no", finNo: true });
    await p.tr.pedir("compactar");
    ok("lo mismo con el botón de Munir", p.mandado.length === 2 && p.mandado[1].startsWith("Antes de compactar"), JSON.stringify(p.mandado));
  }
  {
    const p = panel();
    await p.tr.pedirDeAgente();
    es("con /fin conocido no se manda nada más", p.mandado, ["/fin sin commits"]);
  }
  ok("la pantalla de 2026-11-09 se reconoce", finDesconocidoEnPantalla((i) => ["❯ /fin sin commits", "  ⎿  Unknown command: /fin. Did you mean /run?"][i] ?? "", 2));
  ok("y una pantalla normal no", !finDesconocidoEnPantalla((i) => ["❯ ", "  ? for shortcuts"][i] ?? "", 2));

  // ── Lo que vio la revisión de 1954cf0 (2026-10-30) ──────────────────────
  // Caminos por los que Adeorq tecleaba donde no debía.

  // 1. Una terminal que no es de Claude Code se tomaba por Claude si su
  // encargo decía «claude» (`esClaude` buscaba la palabra en el comando
  // entero, con el encargo dentro). Ahora se le pregunta a la tabla por su
  // `kind` (`compactaConTraspaso`), y `kind` sale de `kindDeComando`, que
  // quita el encargo antes de mirar.
  {
    const encargo = "Revisa lo que dejó la sesión de claude y no toques su Claude Code";
    const linea = (cli: string) => ["powershell.exe", "-NoLogo", "-NoExit", "-Command", lineaConEncargo(cli, encargo, "powershell")].join(" ");
    ok("(lo que miraba el panel, el comando entero, decía «claude» en un Codex)", /\bclaude\b/i.test(linea("codex")));
    es("un Codex con «claude» en su encargo es Codex", kindDeComando(linea("codex")), "codex");
    ok("y no compacta con traspaso", !sabe(kindDeComando(linea("codex")), "compactaConTraspaso"));
    ok("un Claude con el mismo encargo, sí", sabe(kindDeComando(linea("claude --session-id 5e55a1d2-6c0a-4b1e-9a77-0c0ffee00030")), "compactaConTraspaso"));
    ok("una consola, no", !sabe(kindDeComando("powershell.exe -NoLogo"), "compactaConTraspaso"));
  }
  // Y sin su conversación sabida no se lee «la más reciente de la carpeta»,
  // que suele ser la de quien la abrió; ni cuenta una que ya no corre en
  // ningún Claude Code (tras un /clear, o con el CLI cerrado y su PowerShell
  // debajo), que se queda en «lista» y 450k para siempre.
  {
    const base: ContextInfo = { model: "Opus 5.5", used: 450_000, window: 1_000_000, percent: 45, agentsLive: 0, agentsTotal: 0, sessionId: "s", folder: "f", state: "lista", title: "", viva: true };
    const pedidas: Array<string | undefined> = [];
    const leer = async (_cwd: string, sid?: string): Promise<ContextInfo | null> => {
      pedidas.push(sid);
      return { ...base, sessionId: sid ?? "la-de-quien-la-abrio" };
    };
    es("sin conversación sabida, nada", await leerDelPanel({ esClaude: true, cwd: "C:\\x" }, leer), null);
    es("y ni se le pregunta a Rust por la más reciente", pedidas, []);
    es("en un panel que no es de Claude Code, nada", await leerDelPanel({ esClaude: false, cwd: "C:\\x", sesion: "s" }, leer), null);
    es("con su conversación, la suya", (await leerDelPanel({ esClaude: true, cwd: "C:\\x", sesion: "s" }, leer))?.sessionId, "s");
    es(
      "una conversación que ya no corre en ningún Claude Code no cuenta",
      await leerDelPanel({ esClaude: true, cwd: "C:\\x", sesion: "s" }, async () => ({ ...base, viva: false })),
      null,
    );
  }

  // 2. La carrera: la campana leía el transcript, `compactar_terminal`
  // mandaba el /fin mientras tanto, y la campana llegaba después con su
  // lectura de ANTES del /fin y lo daba por acabado: /compact pegado detrás.
  {
    const p = panel();
    let soltar = () => {};
    p.s.retener = new Promise<void>((r) => (soltar = r));
    const campana = p.tr.alSonar();
    const vuelta = () => new Promise((r) => setTimeout(r, 0));
    await vuelta();
    const agente = p.tr.pedirDeAgente();
    await vuelta();
    await vuelta();
    soltar();
    await Promise.all([campana, agente]);
    es("compactar_terminal a mitad de una campana: un /fin y ningún /compact pegado detrás", p.mandado, ["/fin sin commits"]);
    es("y espera a que acabe el /fin", p.tr.fase(), "cerrando");
    await p.tr.alSonar();
    ok("el /compact, en la campana del /fin", p.mandado.length === 2 && p.mandado[1].startsWith("/compact "), JSON.stringify(p.mandado));
  }
  {
    const p = panel({ k: 120 });
    let soltar = () => {};
    p.s.retener = new Promise<void>((r) => (soltar = r));
    const campana = p.tr.alSonar();
    await new Promise((r) => setTimeout(r, 0));
    const agente = p.tr.pedirDeAgente();
    await new Promise((r) => setTimeout(r, 0));
    soltar();
    await Promise.all([campana, agente]);
    es("a 120k la campana no empieza nada y el pedido del agente manda su /fin, sin /compact", p.mandado, ["/fin sin commits"]);
  }

  // 3. Nada se teclea si la pantalla no es la de Claude Code esperando en su
  // caja: con el CLI cerrado queda un PowerShell (`-NoExit`), y ahí un /fin
  // es un comando de consola.
  const enPantalla = (...l: string[]) => esperaEnSuCaja((i) => l[i] ?? "", l.length + 2);
  const RAYA = "─".repeat(60);
  ok("Claude Code parado en su caja vacía (pantalla de la 2.1.302)", enPantalla("● Hecho.", "", `${"─".repeat(46)} Web ─`, "❯ ", RAYA, "  ⏵⏵ auto mode on (shift+tab to cycle)"));
  ok("con la sugerencia atenuada, también (2.1.314)", enPantalla("◉ xhigh · /effort", RAYA, '❯ Try "edit <filepath> to..."', RAYA, "  ⏵⏵ auto mode on (shift+tab to cycle)"));
  ok("el renderizador clásico («> »)", enPantalla(RAYA, "> ", RAYA));
  ok("Claude Code cerrado y su PowerShell debajo, no", !enPantalla("● Hecho.", "", RAYA, "❯ ", RAYA, "", "PS C:\\proyectos\\Web> "));
  ok("con cmd debajo, tampoco", !enPantalla(RAYA, "❯ ", RAYA, "C:\\proyectos\\Web>"));
  ok("una consola con su prompt «❯» (starship), no", !enPantalla("~/web on main", "❯ "));
  ok("con un borrador en la caja, no", !enPantalla(RAYA, "❯ arregla el scroll", RAYA));
  ok("con un borrador de dos líneas, no", !enPantalla(RAYA, "❯ arregla el scroll", "  y el menú", RAYA));
  ok("con un permiso abierto, no", !enPantalla(RAYA, " Bash command", " Do you want to proceed?", " ❯ 1. Yes", "   2. No", "", " Esc to cancel · Tab to amend"));
  ok("con una pregunta abierta, no", !enPantalla(RAYA, "❯ 1. Instalador", "  2. En los dos sitios", RAYA, "  5. Chat about this", "", "Enter to select · Tab/Arrow keys to navigate · Esc to cancel"));
  {
    const p = panel({ caja: false });
    await p.tr.alSonar();
    es("a 420k, con la pantalla sin su caja (un PowerShell), la campana no teclea nada", p.mandado, []);
    await p.tr.pedir("compactar");
    es("ni el botón", p.mandado, []);
    await p.tr.pedirDeAgente();
    es("ni compactar_terminal", p.mandado, []);
  }
  {
    const p = panel();
    await p.tr.alSonar();
    p.s.caja = false;
    await p.tr.alSonar();
    es("tras el /fin, si Claude Code se cerró, el /compact no va al PowerShell", p.mandado, ["/fin sin commits"]);
  }
  {
    const p = panel({ claude: false, sinDato: true, fin: false, caja: false });
    await p.tr.pedir("compactar");
    es("en Gemini, que no tiene la caja de Claude, el botón va a ciegas como siempre", p.mandado.length, 1);
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

  // ── Sin campana (Claude Code 2.1.322, medido el 2026-11-11) ──────────────
  // `scripts/laboratorio/campana-de-verdad.mjs`: con el canal de fábrica no la
  // toca nunca, y con `terminal_bell` a los 60 s de quedarse parado. De ella
  // colgaban el brillo de «terminó», su aviso, la raya roja y el /compact de
  // después del /fin. Las pantallas son de la 2.1.322 (las dos, iguales en el
  // renderizador clásico y en el de pantalla completa).
  const TRABAJANDO = ["✶ Drizzling…", RAYA, "❯ ", RAYA, "  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt"];
  const PARADA = ["● Hola.", "✻ Brewed for 11s · done 18:44", RAYA, "❯ ", RAYA, "  ⏵⏵ auto mode on (shift+tab to cycle)"];
  const MENU = [RAYA, " Bash command", " Do you want to proceed?", " ❯ 1. Yes", "   2. No", "", " Esc to cancel · Tab to amend"];
  const vista = (l: string[]) => ({ trabajando: trabajaEnPantalla((i) => l[i] ?? "", l.length), parada: esperaEnSuCaja((i) => l[i] ?? "", l.length) });
  ok("(la pantalla de trabajar de la 2.1.322 dice que trabaja, con la caja a la vista)", vista(TRABAJANDO).trabajando && vista(TRABAJANDO).parada);
  ok("(la de parada, en su caja y sin trabajar)", !vista(PARADA).trabajando && vista(PARADA).parada);
  {
    let reloj = 0;
    const f = crearFinDeTurno(() => reloj);
    es("recién abierta y en su caja no es un fin: no la ha visto trabajar", f.mirar(vista(PARADA)).fin, false);
    f.mirar(vista(TRABAJANDO));
    const r = f.mirar(vista(PARADA));
    ok("al parar tras trabajar, todavía no: pide volver a mirar cuando se asiente", !r.fin && r.volverEn === ASIENTO_FIN_MS, JSON.stringify(r));
    reloj += ASIENTO_FIN_MS - 1;
    es("parada menos del asiento, todavía no", f.mirar(vista(PARADA)).fin, false);
    reloj += 1;
    es("asentada, es el fin del turno", f.mirar(vista(PARADA)).fin, true);
    reloj += 10_000;
    es("y se dice una sola vez", f.mirar(vista(PARADA)).fin, false);
    reloj += 50_000;
    es("la campana del aviso del minuto (terminal_bell) es del mismo turno: no se repite", f.campana(), false);
    f.mirar(vista(TRABAJANDO));
    reloj += 1000;
    f.mirar(vista(PARADA));
    reloj += 1000;
    f.mirar(vista(TRABAJANDO));
    reloj += 5000;
    es("un respiro entre dos pasos del mismo turno no es el fin", f.mirar(vista(TRABAJANDO)).fin, false);
    f.mirar(vista(PARADA));
    reloj += ASIENTO_FIN_MS;
    es("el turno siguiente se dice cuando acaba", f.mirar(vista(PARADA)).fin, true);
  }
  {
    let reloj = 0;
    const f = crearFinDeTurno(() => reloj);
    f.mirar(vista(TRABAJANDO));
    reloj += 5000;
    es("con un menú suyo delante no es el fin, por mucho que dure", f.mirar(vista(MENU)).fin, false);
    reloj += 60_000;
    es("(ni al minuto)", f.mirar(vista(MENU)).fin, false);
    es("pero su campana (el aviso de un permiso) se oye, como siempre", f.campana(), true);
    f.mirar(vista(TRABAJANDO));
    f.mirar(vista(PARADA));
    reloj += ASIENTO_FIN_MS;
    es("y al contestarle y acabar el turno, su fin", f.mirar(vista(PARADA)).fin, true);
  }
  {
    let reloj = 0;
    const f = crearFinDeTurno(() => reloj);
    f.mirar(vista(TRABAJANDO));
    f.mirar(vista(PARADA));
    es("un CLI que sí toca la campana al acabar: suena y se dice", f.campana(), true);
    reloj += ASIENTO_FIN_MS + 1000;
    es("y el detector, después, no lo vuelve a decir", f.mirar(vista(PARADA)).fin, false);
    es("dos campanas sin verlo trabajar entre medias son del mismo turno", f.campana(), false);
  }
  {
    // Enganchado a un terminal de mentira, con relojes de mentira.
    let reloj = 0;
    let pantalla = PARADA;
    let claude = true;
    let fines = 0;
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
    const soltar = engancharFinDeTurno(term, {
      esClaude: () => claude,
      alAcabar: () => fines++,
      ahora: () => reloj,
      programar: (f, ms) => {
        const t = { en: reloj + ms, f, vivo: true };
        relojes.push(t);
        return () => (t.vivo = false);
      },
    });
    const pasar = (ms: number) => {
      const hasta = reloj + ms;
      for (;;) {
        const t = relojes.filter((x) => x.vivo && x.en <= hasta).sort((a, b) => a.en - b.en)[0];
        if (!t) break;
        t.vivo = false;
        reloj = t.en;
        t.f();
      }
      reloj = hasta;
    };
    const escribe = (l: string[]) => {
      pantalla = l;
      oyentes.escrito.forEach((f) => f());
    };
    const campana = () => oyentes.campana.forEach((f) => f());
    escribe(TRABAJANDO);
    pasar(100);
    escribe(PARADA);
    pasar(MIRAR_CADA_MS);
    es("enganchado: al parar, nada todavía", fines, 0);
    pasar(ASIENTO_FIN_MS);
    es("asentada sin que el programa escriba nada más, el fin llega solo (sin campana)", fines, 1);
    campana();
    pasar(60_000);
    campana();
    es("y la campana del mismo turno no lo repite", fines, 1);
    escribe(TRABAJANDO);
    pasar(300);
    escribe(PARADA);
    pasar(MIRAR_CADA_MS + ASIENTO_FIN_MS);
    es("el turno siguiente, otro fin", fines, 2);
    escribe(TRABAJANDO);
    pasar(10);
    escribe(PARADA);
    pasar(10);
    escribe(TRABAJANDO);
    pasar(10);
    escribe(PARADA);
    pasar(MIRAR_CADA_MS + ASIENTO_FIN_MS);
    es("muchos trozos seguidos: se mira como mucho cada tanto, y un solo fin", fines, 3);
    claude = false;
    campana();
    campana();
    es("donde no corre Claude Code, la campana dispara siempre, como antes", fines, 5);
    escribe(TRABAJANDO);
    pasar(100);
    escribe(PARADA);
    pasar(MIRAR_CADA_MS + ASIENTO_FIN_MS);
    es("y no se mira su pantalla", fines, 5);
    soltar();
  }
  {
    apuntarFin(41, 1_000);
    ok("App: un turno que el panel acaba de anunciar no vuelve a saltar por el transcript", finReciente(41, 1_000 + FIN_RECIENTE_MS - 1));
    ok("pasado el rato, sí", !finReciente(41, 1_000 + FIN_RECIENTE_MS));
    ok("y otro panel no tiene nada que ver", !finReciente(42, 1_000));
  }

  // El traspaso, sin ninguna campana: se relee cada VIGILA_COMPACTAR_MS. Al
  // acabar, el turno del /fin deja otro número de tokens en el transcript.
  {
    const p = panel({ modo: "no", estado: "a_medias" });
    await p.tr.pedir("compactar");
    await p.vuelta();
    es("botón con el agente trabajando y sin campana: mirar cada poco no teclea nada", p.mandado, []);
    p.s.estado = "lista";
    await p.vuelta();
    es("sin campana, al verlo parado, el /fin", p.mandado, ["/fin"]);
    p.s.estado = "a_medias";
    await p.vuelta();
    es("mientras corre el /fin, nada más", p.mandado.length, 1);
    p.s.estado = "lista";
    p.s.k = 431;
    await p.vuelta();
    ok("y al acabar el /fin, el /compact sin campana", p.mandado.length === 2 && p.mandado[1].startsWith("/compact "), JSON.stringify(p.mandado));
    es("y se acaba", p.tr.fase(), "nada");
    await p.tr.alSonar();
    es("una campana que llega tarde no repite el /compact", p.mandado.length, 2);
  }
  {
    const p = panel({ modo: "fin", estado: "a_medias" });
    await p.tr.pedirDeAgente();
    await p.vuelta();
    es("compactar_terminal sin campana, trabajando: nada", p.mandado, []);
    p.s.estado = "lista";
    await p.vuelta();
    es("al pararse, su /fin sin commits", p.mandado, ["/fin sin commits"]);
    p.s.estado = "a_medias";
    await p.vuelta();
    p.s.estado = "lista";
    p.s.k = 431;
    await p.vuelta();
    ok("y su /compact, sin campana", p.mandado.length === 2 && p.mandado[1].startsWith("/compact "), JSON.stringify(p.mandado));
  }
  {
    // Una lectura que dice «lista» con el mismo número que al mandar el /fin
    // es la de antes del /fin (un CLI que aún no lo apuntó), no la de su final.
    const p = panel({ estado: "a_medias" });
    await p.tr.pedirDeAgente();
    p.s.estado = "lista";
    await p.vuelta();
    es("(el /fin, al verla parada)", p.mandado, ["/fin sin commits"]);
    await p.vuelta();
    await p.vuelta();
    es("una «lista» que no se movió desde el /fin no vale para mandar el /compact", p.mandado.length, 1);
    p.s.k = 431;
    await p.vuelta();
    ok("en cuanto el transcript se mueve, sí", p.mandado.length === 2 && p.mandado[1].startsWith("/compact "), JSON.stringify(p.mandado));
  }
  {
    const p = panel({ estado: "a_medias" });
    await p.tr.pedirDeAgente();
    p.s.estado = "lista";
    await p.tr.alSonar();
    es("con campana Y mirando a la vez: un solo /fin", p.mandado, ["/fin sin commits"]);
    p.s.estado = "a_medias";
    await p.vuelta();
    p.s.estado = "lista";
    p.s.k = 431;
    await p.vuelta();
    await p.tr.alSonar();
    await p.vuelta();
    ok("y un solo /compact", p.mandado.length === 2 && p.mandado[1].startsWith("/compact "), JSON.stringify(p.mandado));
  }
  {
    const p = panel({ modo: "no", k: 650, respuesta: RESPUESTA_FIN });
    await p.tr.pedir("nueva");
    es("Nueva sin campana: su /fin", p.mandado, ["/fin"]);
    p.s.estado = "a_medias";
    await p.vuelta();
    p.s.estado = "lista";
    p.s.k = 661;
    await p.vuelta();
    es("y al acabarlo, la terminal nueva con su bloque «Retomar»", p.nuevas.map((x) => x?.split("\n")[0]), ["# RETOMAR, Adeorq compactar a tiempo (guardado el 2026-10-22)"]);
  }
  {
    const p = panel({ claude: false, sinDato: true, fin: false });
    await p.tr.pedir("compactar");
    await p.vuelta();
    await p.vuelta();
    es("en un panel que no es de Claude Code, sin transcript, no se mira cada poco: solo su campana", p.mandado.length, 1);
  }
  {
    // La raya roja de una delegada, sin campana: la empieza el detector.
    const p = panel({ modo: "no", delegada: true, estado: "a_medias" });
    const f = crearFinDeTurno(() => p.s.reloj);
    const acaba = async () => {
      f.mirar(vista(TRABAJANDO));
      p.s.estado = "lista";
      f.mirar(vista(PARADA));
      p.s.reloj += ASIENTO_FIN_MS;
      if (f.mirar(vista(PARADA)).fin) await p.tr.alSonar();
    };
    await acaba();
    es("raya roja sin campana: el detector ve acabar el turno y empieza el /fin sin commits", p.mandado, ["/fin sin commits"]);
    p.s.estado = "a_medias";
    await acaba();
    ok("y al acabar el /fin, su /compact", p.mandado.length === 2 && p.mandado[1].startsWith("/compact "), JSON.stringify(p.mandado));
    if (f.campana()) await p.tr.alSonar();
    await p.vuelta();
    es("la campana del minuto y la vuelta siguiente no compactan otra vez", p.mandado.length, 2);
  }

  console.log(fallos ?`\n${fallos} FALLAN:\n  ${rojos.join("\n  ")}` : "\nTodo en verde.");
  process.exitCode = fallos ? 1 : 0;
}

void main();
