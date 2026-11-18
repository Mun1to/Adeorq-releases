// La vuelta hacia arriba (`lib/vueltaArriba.ts`): lo que le pasa a una terminal
// que abrió un agente, contado a ese agente en una línea.
//
// Lo que no puede pasar: teclearle a una madre que trabaja, que tiene un
// borrador o que se quedó en una consola (el resumen lo escribió otro agente y
// ahí sería un comando); contar dos veces la misma parada; decir «paró sin
// entregar» de una que ya entregó; o pasar del tope por hora.
//
//   pnpm bancos vuelta-arriba

import type { PaneStatus, WorkState } from "../src/lib/pty";
import {
  alCambiarHijas,
  aunParadas,
  cabe,
  encolar,
  esEstadoEntrega,
  lineaPara,
  MAX_LINEA,
  PARADA_MS,
  paradasSinEntregar,
  plano,
  PROCESO_TERMINADO,
  puedeTeclear,
  rearmarFondoRetirado,
  TOPE_POR_HORA,
  trabajoDeFondoEnPantalla,
  trozoDe,
  type AvisoArriba,
  type Hija,
} from "../src/lib/vueltaArriba";

let fallos = 0;
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
  porque: `porque ${state}`,
  ...extra,
});
const mapa = (...p: PaneStatus[]) => Object.fromEntries(p.map((x) => [x.id, x]));
const hija = (madre = 3): Hija => ({ madre, nombre: "Web: hero", entrego: false, listaDesde: null, contadaParada: false });
const aviso = (h: number, que: AvisoArriba["que"], extra: Partial<AvisoArriba> = {}): AvisoArriba => ({
  hija: h,
  nombre: `p${h}`,
  que,
  cuando: 0,
  ...extra,
});

// --- lo que se cuenta ------------------------------------------------------------------
es("una entrega dice quién, en qué panel, cómo acabó y su resumen", trozoDe(aviso(7, "entrega", { nombre: "Web: hero", estado: "hecho", texto: "Hero nuevo en src/Hero.tsx." })), "«Web: hero» (panel 7) hecho: Hero nuevo en src/Hero.tsx");
es("necesito_a_munir se lee en castellano", trozoDe(aviso(7, "entrega", { estado: "necesito_a_munir", texto: "x" })), "«p7» (panel 7) necesita a Munir: x");
es("parada sin entregar", trozoDe(aviso(9, "sin_entregar", { nombre: "API" })), "«API» (panel 9) paró sin entregar");
es("una pregunta lleva su porqué", trozoDe(aviso(9, "pregunta", { texto: "un menú de permiso en pantalla" })), "«p9» (panel 9) se paró a preguntar (un menú de permiso en pantalla)");
es("y se cerró", trozoDe(aviso(9, "cerro")), "«p9» (panel 9) se cerró");
es("sin nombre, su número", trozoDe(aviso(4, "cerro", { nombre: "" })), "«terminal 4» (panel 4) se cerró");
es("el resumen va en una línea, sin teclas escondidas", plano("uno\r\ndos\x1b[201~\ttres  \u0007"), "uno dos [201~ tres");
ok("un resumen largo se corta en el trozo", trozoDe(aviso(1, "entrega", { estado: "hecho", texto: "a".repeat(2000) })).length < 560);
ok("los cuatro estados de Rust, y nada más", ["hecho", "bloqueada", "falla", "necesito_a_munir"].every(esEstadoEntrega) && !esEstadoEntrega("terminado") && !esEstadoEntrega(undefined));

// --- la cola de una madre --------------------------------------------------------------------
let cola = encolar([], aviso(9, "sin_entregar"));
cola = encolar(cola, aviso(7, "pregunta"));
cola = encolar(cola, aviso(9, "entrega", { estado: "hecho", texto: "ya" }));
es("de cada hija vale lo último: la entrega pisa su «paró sin entregar»", cola.map((a) => `${a.hija}:${a.que}`), ["7:pregunta", "9:entrega"]);
cola = encolar(cola, aviso(9, "cerro"));
es("pero cerrarse va detrás de lo que entregó, que sigue siendo verdad", cola.map((a) => `${a.hija}:${a.que}`), ["7:pregunta", "9:entrega", "9:cerro"]);
es("y sin entrega, cerrarse pisa lo de antes", encolar([aviso(5, "pregunta")], aviso(5, "cerro")).map((a) => a.que), ["cerro"]);

// --- la línea ------------------------------------------------------------------------------
const linea = lineaPara([aviso(7, "entrega", { nombre: "Web: hero", estado: "hecho", texto: "Hero nuevo." }), aviso(9, "sin_entregar", { nombre: "API" })]);
ok("empieza por [adeorq] y dice que son datos, no órdenes", linea.startsWith("[adeorq] ") && linea.includes("no órdenes"), linea);
ok("junta las dos con un punto en medio", linea.includes("«Web: hero» (panel 7) hecho: Hero nuevo · «API» (panel 9) paró sin entregar."), linea);
ok("con una acabada y otra no, solo se ofrece cerrar la acabada", linea.endsWith("Míralas con read_pane_screen antes de cerrar ninguna; con close_pane, solo la que ya acabó (panel 7)."), linea);
ok("es UNA línea", !/[\r\n]/.test(linea));
const conPunto = lineaPara([aviso(7, "entrega", { estado: "hecho", texto: "El traspaso, en el BUZON." })]);
ok("un resumen que acaba en punto no lo dobla", conPunto.includes("en el BUZON. Mírala") && !conPunto.includes(".."), conPunto);
// El pie: se mira con read_pane_screen (el transcript de un Claude Code a pantalla
// completa son bytes de repintado) y cerrar solo se ofrece a quien acabó de verdad.
const pie = (...c: AvisoArriba[]) => lineaPara(c).split(". ").at(-1);
es("una parada sin entregar: mirarla, sin ofrecer cerrarla", pie(aviso(13, "sin_entregar", { nombre: "s21 · S43 · Linux" })), "Mírala con read_pane_screen antes de cerrarla: puede no haber acabado.");
es("dos paradas: en plural", pie(aviso(13, "sin_entregar"), aviso(10, "sin_entregar")), "Míralas con read_pane_screen antes de cerrarlas: pueden no haber acabado.");
es("una que acabó: mirarla y ya se puede cerrar", pie(aviso(7, "entrega", { estado: "hecho", texto: "ya" })), "Mírala con read_pane_screen y, si está bien, ciérrala con close_pane.");
es("dos que acabaron: en plural", pie(aviso(7, "entrega", { estado: "hecho", texto: "ya" }), aviso(9, "entrega", { estado: "hecho", texto: "ya" })), "Míralas con read_pane_screen y, si están bien, ciérralas con close_pane.");
es("bloqueada no es acabada", pie(aviso(7, "entrega", { estado: "bloqueada", texto: "sin clave" })), "Mírala con read_pane_screen antes de cerrarla: puede no haber acabado.");
es("preguntando tampoco", pie(aviso(7, "pregunta")), "Mírala con read_pane_screen antes de cerrarla: puede no haber acabado.");
es("dos acabadas y una parada: dice cuáles", pie(aviso(7, "entrega", { estado: "hecho", texto: "ya" }), aviso(8, "entrega", { estado: "hecho", texto: "ya" }), aviso(9, "sin_entregar")), "Míralas con read_pane_screen antes de cerrar ninguna; con close_pane, solo las que ya acabaron (paneles 7 y 8).");
const soloCerrada = lineaPara([aviso(9, "cerro", { nombre: "API" })]);
ok("de una que ya se cerró no hay nada que mirar ni que cerrar", soloCerrada.endsWith("«API» (panel 9) se cerró.") && !soloCerrada.includes("read_pane_screen"), soloCerrada);
es("entregó y se cerró: tampoco", lineaPara([aviso(9, "entrega", { estado: "hecho", texto: "ya", nombre: "API" }), aviso(9, "cerro", { nombre: "API" })]).includes("close_pane"), false);
es("una cerrada no cuenta para el plural de las demás", pie(aviso(9, "cerro"), aviso(7, "sin_entregar")), "Mírala con read_pane_screen antes de cerrarla: puede no haber acabado.");
const muchas = Array.from({ length: 12 }, (_, i) => aviso(i + 1, "entrega", { estado: "hecho", texto: "x".repeat(400) }));
const larga = lineaPara(muchas);
ok("con mucho en cola no pasa del tope", larga.length <= MAX_LINEA, `${larga.length}`);
ok("y dice cuántas se quedaron fuera", /y \d+ más \(míralas en get_active_panes\)/.test(larga), larga.slice(-160));

// --- el tope por hora ----------------------------------------------------------------------
const hora = 3_600_000;
es("con 19 en la última hora, cabe otra", cabe(Array(TOPE_POR_HORA - 1).fill(1000), 2000), true);
es("con 20, ya no: solo la campana", cabe(Array(TOPE_POR_HORA).fill(1000), 2000), false);
es("las de hace más de una hora no cuentan", cabe(Array(TOPE_POR_HORA).fill(0), hora + 1), true);

// --- cuándo se le teclea a la madre ----------------------------------------------------------
const lista = { state: "lista" as WorkState, agentsLive: 0, porque: "lo dice el transcript" };
const base = { estado: lista, deAgente: true, conCaja: true, enSuCaja: true, trabajando: false, turnoEnDisco: true, quietaAntes: false };
es("Claude en «lista» con su caja vacía: sí", puedeTeclear(base), true);
es("con un borrador o un menú en la caja: no", puedeTeclear({ ...base, enSuCaja: false }), false);
es("trabajando según la pantalla: no", puedeTeclear({ ...base, trabajando: true }), false);
es("con subagentes fuera: no", puedeTeclear({ ...base, estado: { ...lista, agentsLive: 1 } }), false);
for (const s of ["a_medias", "pregunta", "ofrece", "tuya", ""] as WorkState[]) {
  es(`en «${s || "no se sabe"}»: no`, puedeTeclear({ ...base, estado: { state: s, agentsLive: 0, porque: "" } }), false);
  es(`en «${s || "no se sabe"}» aunque la pantalla la vea quieta dos veces: no`, puedeTeclear({ ...base, estado: { state: s, agentsLive: 0, porque: "" }, quietaAntes: true }), false);
}
// Gemini no deja en disco cómo acaba un turno: su estado es «» siempre, y lo
// que decide es la pantalla, vista igual en dos miradas seguidas.
const sinTurno = { state: "" as WorkState, agentsLive: 0, porque: "ni la pantalla ni el transcript dicen nada" };
const gemini = { ...base, estado: sinTurno, turnoEnDisco: false, quietaAntes: true };
es("Gemini parado en su caja vacía, visto así dos veces: sí", puedeTeclear(gemini), true);
es("Gemini visto parado una sola vez: todavía no", puedeTeclear({ ...gemini, quietaAntes: false }), false);
es("Gemini con «esc to cancel» en pantalla: no", puedeTeclear({ ...gemini, trabajando: true }), false);
es("Gemini con un borrador, o preguntando permiso (sin caja): no", puedeTeclear({ ...gemini, enSuCaja: false }), false);
es("Gemini con un menú en pantalla («pregunta»): no", puedeTeclear({ ...gemini, estado: { ...sinTurno, state: "pregunta" } }), false);
es("Gemini cuyo proceso ya terminó: no", puedeTeclear({ ...gemini, estado: { ...sinTurno, porque: PROCESO_TERMINADO } }), false);
es("sin estado: no", puedeTeclear({ ...base, estado: undefined }), false);
es("una consola, o un CLI que no se sabe: nunca", puedeTeclear({ ...base, deAgente: false }), false);
// Sin una caja que se sepa leer no hay prueba de que esté parada y vacía: a
// ciegas, la línea iba detrás de un borrador o se ejecutaba en un cmd.exe.
es("otro CLI de agente, aunque parezca parado: no", puedeTeclear({ ...base, conCaja: false, enSuCaja: false }), false);
es("Claude sin pantalla que leer (sacada a su ventana): no", puedeTeclear({ ...base, enSuCaja: false }), false);

// --- una hija, paso a paso -----------------------------------------------------------------
function pelicula(h: Hija, ...momentos: Array<[number, Record<number, PaneStatus>]>) {
  let hijas = new Map([[7, h]]);
  const avisos: AvisoArriba[] = [];
  for (let i = 1; i < momentos.length; i++) {
    const r = alCambiarHijas(hijas, momentos[i - 1][1], momentos[i][1], momentos[i][0]);
    hijas = r.hijas;
    avisos.push(...r.avisos);
    const p = paradasSinEntregar(hijas, momentos[i][0]);
    hijas = p.hijas;
    avisos.push(...p.avisos);
  }
  return { hijas, avisos: avisos.map((a) => a.que) };
}
const t0 = 1_000_000;
const trabaja = mapa(panel(7, "a_medias"));
const parada = mapa(panel(7, "lista"));
let r = pelicula(hija(), [t0, trabaja], [t0 + 1000, parada], [t0 + 30_000, parada], [t0 + 1000 + PARADA_MS, parada], [t0 + 1000 + 2 * PARADA_MS, parada]);
es("parada un minuto sin entregar: un aviso, y solo uno", r.avisos, ["sin_entregar"]);
{
  // Entregó a mitad de turno y luego paró: no se cuenta que paró sin entregar.
  let hijas = new Map([[7, hija()]]);
  hijas = alCambiarHijas(hijas, mapa(panel(7, "lista")), trabaja, t0).hijas;
  hijas.set(7, { ...hijas.get(7)!, entrego: true });
  hijas = alCambiarHijas(hijas, trabaja, parada, t0 + 1000).hijas;
  es("la que entregó y paró: nada", paradasSinEntregar(hijas, t0 + 1000 + PARADA_MS).avisos, []);
  // Y vuelve a trabajar con otro encargo: su entrega de antes ya no vale.
  hijas = alCambiarHijas(hijas, parada, trabaja, t0 + 2 * PARADA_MS).hijas;
  es("al volver a trabajar, la entrega de antes deja de contar", hijas.get(7)!.entrego, false);
}
r = pelicula(hija(), [t0, trabaja], [t0 + 1000, mapa(panel(7, "pregunta", { porque: "un menú de permiso" }))], [t0 + 1000 + PARADA_MS, mapa(panel(7, "pregunta"))]);
es("un menú en pantalla se cuenta una vez, y no como parada", r.avisos, ["pregunta"]);
r = pelicula({ ...hija(), entrego: true }, [t0, trabaja], [t0 + 1000, mapa(panel(7, "ofrece"))]);
es("acabar preguntando en prosa tras entregar: nada", r.avisos, []);
r = pelicula(hija(), [t0, trabaja], [t0 + 1000, mapa(panel(7, "ofrece"))]);
es("acabar preguntando sin entregar: se cuenta", r.avisos, ["pregunta"]);
r = pelicula(hija(), [t0, trabaja], [t0 + 1000, {}]);
es("se cerró: un aviso y se deja de seguir", [r.avisos, r.hijas.has(7)], [["cerro"], false]);
r = pelicula(hija(), [t0, trabaja], [t0 + 1000, mapa(panel(7, "", { porque: PROCESO_TERMINADO }))], [t0 + 2000, mapa(panel(7, "", { porque: PROCESO_TERMINADO }))]);
es("su proceso terminó: un aviso, una vez", r.avisos, ["cerro"]);
r = pelicula(hija(), [t0, {}], [t0 + 1000, {}], [t0 + 2000, trabaja]);
es("recién abierta y aún sin estado, no se da por cerrada", [r.avisos, r.hijas.has(7)], [[], true]);

// --- la que espera trabajo de fondo no ha parado -------------------------------------------
// Pantallas de verdad: el panel 13 de Munir (2026-11-18, Claude Code 2.1.327) y un
// Claude Code 2.1.327 con casa propia y API de mentira, a 78 y a 44 columnas.
const raya = "─".repeat(78);
const vePantalla = (filas: string[]) => trabajoDeFondoEnPantalla((i) => filas[i] ?? "", filas.length);
const panel13 = [
  "● Vitest está en verde (1009 de 1009). Espero a que acabe cargo test --lib",
  "  antes de lanzar nada más pesado.",
  "",
  "✻ Baked for 8m 40s · done 7:32 · 1 shell still running",
  "",
  raya,
  "❯",
  raya,
  "  ⏵⏵ auto mode on · 1 shell · ← 5 agents · ↓ to manage",
];
es("el panel 13: un shell de fondo vivo", vePantalla(panel13), true);
es("estrecha, con la línea del turno partida y el pie cortado", vePantalla([
  "● Espero a que acabe el trabajo de fondo.",
  "✻ Baked for 3s · done 7:59 · 1 shell still",
  "  running",
  "                        ◐ medium · /effort",
  "─".repeat(44),
  "❯",
  "─".repeat(44),
  "  ⏵⏵ auto mode on · 1 shell · ← for agent…",
]), true);
es("sin la píldora en el pie, basta la línea del último turno", vePantalla(["✻ Baked for 3s · done 7:59 · 1 shell still", "  running", raya, "❯", raya, "  ⏵⏵ auto mode on · ↓ to manage"]), true);
es("varios shells y un monitor", vePantalla([raya, "❯", raya, "  ⏵⏵ auto mode on · 2 shells, 1 monitor · ↓ to manage"]), true);
const conAgente = [
  "● Agent(Sub de prueba)",
  "  ⎿  Backgrounded agent (↓ to manage · ctrl+o to expand)",
  "● Espero a que acabe el trabajo de fondo.",
  "✻ Waiting for 1 background agent to finish",
  raya,
  "❯",
  raya,
  "  ⏵⏵ accept edits on (shift+tab to cycle) · ↓ to manage",
  "  ● main",
  "  ◯ general-purpose  Sub de prueba                                        9s",
];
es("un subagente en segundo plano, que agentsLive no cuenta", vePantalla(conAgente), true);
es("ese «Waiting for» se queda en la historia: si hay un turno después, ya volvió", vePantalla([
  "✻ Waiting for 1 background agent to finish",
  '● Agent "Sub de prueba" finished · 30s',
  "● Ya acabó el trabajo de fondo.",
  "✻ Brewed for 33s · done 8:05",
  raya,
  "❯",
  raya,
  "  ⏵⏵ accept edits on (shift+tab to cycle) · /tasks to see subagents",
]), false);
es("acabado el shell, el pie vuelve a lo de siempre", vePantalla([
  "✻ Worked for 4s · done 7:58",
  '● Background command "Prueba de fondo" completed (exit code 0)',
  "● Ya acabó el trabajo de fondo.",
  "✻ Cooked for 0s · done 7:59",
  raya,
  "❯",
  raya,
  "  ⏵⏵ auto mode on (shift+tab to cycle)",
]), false);
es("«← 5 agents» sale en todas las terminales y no es señal", vePantalla(["✻ Crunched for 15s · done 7:34", raya, "❯", raya, "  ⏵⏵ auto mode on (shift+tab to cycle) · ← 5 agents"]), false);
es("una hija que cita esas frases en su mensaje, sin un `✻` suyo debajo, no tiene nada de fondo", vePantalla([
  "● El pie decía «✻ Baked for 8m 40s · done 7:32 · 1 shell still running».",
  "  1 shell still running",
  "  ✻ Waiting for 1 background agent to finish",
  "  ✻ Baked for 8m 40s · done 7:32 · 1 shell still running",
  raya,
  "❯",
  raya,
  "  ⏵⏵ auto mode on (shift+tab to cycle) · ← 5 agents",
]), false);
// La pantalla de verdad de la revisión: el agente volvió, la hija despertó y la API
// falló (429). Claude Code solo escribe otro `✻` si el turno acaba bien.
const agenteYError = [
  "● Agent(Sub de prueba)",
  "  ⎿  Backgrounded agent (↓ to manage · ctrl+o to expand)",
  "● Espero a que acabe el trabajo de fondo.",
  "✻ Waiting for 1 background agent to finish",
  '● Agent "Sub de prueba" finished · 10s',
  "● API Error: Request rejected (429) · Number of requests has exceeded your rate limit",
  raya,
  "❯",
  raya,
  "  ⏵⏵ accept edits on (shift+tab to cycle) · /tasks to see subagents",
];
es("«Waiting for» con el agente ya de vuelta y un error debajo: no espera nada", vePantalla(agenteYError), false);
es("en Mac sus mensajes empiezan por ⏺: la misma pantalla tampoco espera nada", vePantalla(agenteYError.map((l) => l.replace(/^●/, "⏺"))), false);
es("si tras el error queda otro subagente fuera, Claude Code pinta otro «Waiting for» y ese vale", vePantalla([
  "✻ Waiting for 2 background agents to finish",
  '● Agent "Sub" finished · 10s',
  "● API Error: Request rejected (429)",
  "✻ Waiting for 1 background agent to finish",
  raya,
  "❯",
  raya,
  "  ⏵⏵ accept edits on (shift+tab to cycle) · ↓ to manage",
]), true);
es("un `●` sangrado debajo del «Waiting for» es texto, no un mensaje nuevo", vePantalla(["✻ Waiting for 1 background agent to finish", "  ● cita de otra cosa", raya, "❯", raya, "  ⏵⏵ accept edits on"]), true);
es("y un `●` debajo de la caja, tampoco: ahí va su lista de agentes", vePantalla(["✻ Waiting for 1 background agent to finish", raya, "❯", raya, "  ⏵⏵ accept edits on · ↓ to manage", "● main"]), true);
es("«1 monitor» solo también es fondo", vePantalla([raya, "❯", raya, "  ⏵⏵ auto mode on · 1 monitor · ↓ to manage"]), true);
es("«1 team» sin línea del turno", vePantalla([raya, "❯", raya, "  ⏵⏵ auto mode on · 1 team · ↓ to manage"]), true);
es("«2 background tasks» sin línea del turno", vePantalla([raya, "❯", raya, "  ⏵⏵ auto mode on · 2 background tasks · ↓ to manage"]), true);
es("la línea del turno partida en tres filas, a 30 columnas", vePantalla(["✻ Baked for 8m 40s · done", "  7:32 · 1 shell still", "  running", "─".repeat(30), "❯", "─".repeat(30), "  ⏵⏵ auto mode on · …"]), true);
es("un «still running» de un turno anterior no cuenta: manda el último `✻`", vePantalla(["✻ Baked for 3s · done 7:59 · 1 shell still running", "● Ya acabó.", "✻ Worked for 1s · done 8:00", raya, "❯", raya, "  ⏵⏵ auto mode on (shift+tab to cycle)"]), false);
es("un mensaje debajo del turno no completa su frase", vePantalla(["✻ Baked for 3s · done 7:59", "● Quedó · 1 shell still running", raya, "❯", raya, "  ⏵⏵ auto mode on"]), false);
es("esa píldora encima de la caja es texto de la conversación", vePantalla(["  resumen · 1 shell · fin", raya, "❯", raya, "  ⏵⏵ auto mode on (shift+tab to cycle)"]), false);
es("en el pie solo vale la píldora entera", vePantalla([raya, "❯", raya, "  ⏵⏵ auto mode on · 1 shell command · ↓ to manage"]), false);
// Codex 0.165: leído en su código (`unified_exec_footer.rs`) y en su binario, sin
// haberlo visto en una pantalla de verdad.
const cajaCodex = ["› ", "", "  GPT-6.1-Sol default · ? for shortcuts"];
es("Codex con una terminal de fondo", vePantalla(["• Espero al build.", "", "  1 background terminal running · /ps to view · /stop to close", "", ...cajaCodex]), true);
es("Codex con varias", vePantalla(["  3 background terminals running · /ps to view · /stop to close", ...cajaCodex]), true);
es("Codex sin ninguna", vePantalla(["• Hecho.", "", ...cajaCodex]), false);
es("Codex citando esa frase lejos de su caja", vePantalla(["  1 background terminal running · /ps to view", "• a", "• b", "• c", "• d", "", ...cajaCodex]), false);
es("Codex con un mensaje que acaba en esa frase, justo encima de la caja", vePantalla(["• Resumen del cambio:", "  1 background terminal running", "", ...cajaCodex]), false);
es("Codex sin la sangría de su fila", vePantalla(["1 background terminal running · /ps to view · /stop to close", "", ...cajaCodex]), false);
es("una pantalla vacía", vePantalla([]), false);

function reloj(...momentos: Array<[number, boolean]>) {
  let hijas = new Map([[7, { ...hija(), listaDesde: t0 }]]);
  const avisos: string[] = [];
  for (const [t, fondo] of momentos) {
    const p = paradasSinEntregar(hijas, t, () => fondo);
    hijas = p.hijas;
    avisos.push(...p.avisos.map((a) => a.que));
  }
  return { hijas, avisos };
}
es("con trabajo de fondo, diecinueve minutos parada no es parar", reloj([t0 + PARADA_MS, true], [t0 + 600_000, true], [t0 + 1_140_000, true]).avisos, []);
const acaba = t0 + 1_140_000;
es("acabado el fondo, el minuto empieza entonces y no antes", reloj([acaba, true], [acaba + PARADA_MS - 1, false]).avisos, []);
es("y pasado ese minuto sí se cuenta, una vez", reloj([acaba, true], [acaba + PARADA_MS, false], [acaba + 2 * PARADA_MS, false]).avisos, ["sin_entregar"]);
es("sin trabajo de fondo se avisa igual que siempre", reloj([t0 + PARADA_MS, false]).avisos, ["sin_entregar"]);
{
  // Se contó con la madre ocupada y luego lanzó un proceso: la línea ya no es verdad.
  const contada = reloj([t0 + PARADA_MS, false]);
  const enCola = [aviso(7, "sin_entregar"), aviso(9, "entrega", { estado: "hecho", texto: "ya" })];
  es("mientras siga parada, su aviso sigue en la cola", aunParadas(enCola, contada.hijas).map((a) => a.hija), [7, 9]);
  const conFondo = paradasSinEntregar(contada.hijas, t0 + 2 * PARADA_MS, () => true).hijas;
  es("con trabajo de fondo se le retira, y lo demás se queda", aunParadas(enCola, conFondo).map((a) => a.hija), [9]);
  const volvio = alCambiarHijas(contada.hijas, parada, trabaja, t0 + 2 * PARADA_MS).hijas;
  es("y si ha vuelto a trabajar, también", aunParadas(enCola, volvio).map((a) => a.hija), [9]);
}
es("con la pantalla del error se avisa al minuto, aunque el «Waiting for» siga escrito", reloj([t0 + PARADA_MS, vePantalla(agenteYError)]).avisos, ["sin_entregar"]);

// --- trabajo de fondo que no acaba: la madre no puede esperar para siempre ------------------
const MIN = 60_000;
const TOPE = 20 * MIN;
/** Tres segundos a tres segundos, como `mirar`. `fondo` dice si lo hay en cada instante. */
function vigilar(desde: number, hasta: number, fondo: (t: number) => boolean, inicio = new Map([[7, { ...hija(), listaDesde: desde }]])) {
  let hijas: Map<number, Hija> = inicio;
  const avisos: Array<{ que: string; t: number; minutos?: number }> = [];
  for (let t = desde + 3000; t <= hasta; t += 3000) {
    const p = paradasSinEntregar(hijas, t, () => fondo(t));
    hijas = p.hijas;
    avisos.push(...p.avisos.map((a) => ({ que: a.que, t: t - desde, minutos: a.desde == null ? undefined : Math.round((t - a.desde) / MIN) })));
  }
  return { hijas, avisos };
}
const semana = vigilar(t0, t0 + 7 * 24 * 60 * MIN, () => true);
es("un servidor de fondo durante siete días: un aviso propio, y uno solo", semana.avisos.map((a) => a.que), ["con_fondo"]);
es("y llega a los veinte minutos, diciendo cuántos", [semana.avisos[0]?.t, semana.avisos[0]?.minutos], [TOPE, 20]);
es("a los diecinueve aún nada", vigilar(t0, t0 + 19 * MIN, () => true).avisos, []);
const avisoFondo = aviso(7, "con_fondo", { nombre: "API", desde: t0, cuando: t0 + TOPE });
es("dice lo que pasa", trozoDe(avisoFondo), "«API» (panel 7) sigue con trabajo de fondo desde hace 20 min; no ha entregado");
ok("y no ofrece cerrarla", !lineaPara([avisoFondo]).includes("close_pane"), lineaPara([avisoFondo]));
{
  const tresHoras = lineaPara([avisoFondo], () => true, t0 + 180 * MIN);
  ok("con la madre ocupada tres horas, los minutos se cuentan al teclear", tresHoras.includes("desde hace 180 min"), tresHoras);
}
es("un parpadeo de la pantalla no pone el contador a cero", vigilar(t0, t0 + TOPE, (t) => t !== t0 + 10 * MIN).avisos.map((a) => a.que), ["con_fondo"]);
{
  const acabo = vigilar(t0, t0 + 30 * MIN + PARADA_MS, (t) => t <= t0 + 30 * MIN);
  es("acabado ese trabajo, el minuto de siempre", acabo.avisos.map((a) => a.que), ["con_fondo", "sin_entregar"]);
  // Vuelve a trabajar: lo contado se olvida, y su aviso en cola ya no es verdad.
  const contado = vigilar(t0, t0 + TOPE, () => true).hijas;
  es("mientras siga así, su aviso sigue en la cola", aunParadas([avisoFondo], contado).length, 1);
  const otraVez = alCambiarHijas(contado, parada, trabaja, t0 + TOPE + MIN).hijas;
  es("si vuelve a trabajar se le retira", aunParadas([avisoFondo], otraVez).length, 0);
  const parada2 = alCambiarHijas(otraVez, trabaja, parada, t0 + TOPE + 2 * MIN).hijas;
  const segunda = vigilar(t0 + TOPE + 2 * MIN, t0 + 2 * TOPE + 2 * MIN, () => true, parada2);
  es("un turno breve después del aviso no lo repite", segunda.avisos, []);
  // Más de veinte minutos sin verle fondo es haber trabajado de verdad: lo de después es otro.
  const trabajo = alCambiarHijas(contado, parada, trabaja, t0 + TOPE + MIN).hijas;
  const alLimite = alCambiarHijas(trabajo, trabaja, parada, t0 + 2 * TOPE - 3000).hijas;
  es("justo a los veinte minutos sin verle fondo, sigue siendo el mismo", vigilar(t0 + 2 * TOPE - 3000, t0 + 3 * TOPE, () => true, alLimite).avisos, []);
  const pasado = alCambiarHijas(trabajo, trabaja, parada, t0 + 2 * TOPE).hijas;
  es("pasados, es otro y se avisa", vigilar(t0 + 2 * TOPE, t0 + 3 * TOPE, () => true, pasado).avisos.map((a) => [a.que, a.t]), [["con_fondo", TOPE]]);
  // Para de verdad y luego lanza otro: lo contado de antes ya no vale.
  const otroFondo = vigilar(t0, t0 + 50 * MIN, (t) => t <= t0 + 25 * MIN || t >= t0 + 27 * MIN);
  es("parar de verdad pone el contador a cero", otroFondo.avisos.map((a) => [a.que, a.t / MIN]), [["con_fondo", 20], ["sin_entregar", 26], ["con_fondo", 45]]);
}

// --- un monitor que la despierta cada poco: esos turnos no reinician el tope total ----------
/** Fondo vivo todo el rato y un turno de 30 s cada quince minutos. */
function conDespertares(horas: number, entregaEn: number | null = null, fondo: (m: number) => boolean = () => true) {
  let hijas: Map<number, Hija> = new Map([[7, { ...hija(), listaDesde: t0 }]]);
  const avisos: Array<[string, number]> = [];
  const crudos: AvisoArriba[] = [];
  for (let t = t0 + 3000; t <= t0 + horas * 60 * MIN; t += 3000) {
    if (entregaEn != null && t === t0 + entregaEn) hijas = new Map([[7, { ...hijas.get(7)!, entrego: true }]]);
    const fase = (t - t0) % (15 * MIN);
    if (fase === 0) hijas = alCambiarHijas(hijas, parada, trabaja, t).hijas;
    if (fase === 30_000) hijas = alCambiarHijas(hijas, trabaja, parada, t).hijas;
    const p = paradasSinEntregar(hijas, t, () => fondo(t - t0));
    hijas = p.hijas;
    avisos.push(...p.avisos.map((a): [string, number] => [a.que, t - t0]));
    crudos.push(...p.avisos);
  }
  return { hijas, avisos, crudos };
}
const HORA_Y_MEDIO_MIN = 60 * MIN + 30_000;
es("despertada cada quince minutos, un aviso en 24 horas, a la hora", conDespertares(24).avisos, [["con_fondo", HORA_Y_MEDIO_MIN]]);
{
  const [primero] = conDespertares(2).crudos;
  es("sale marcado como del tope total, y cuenta desde el principio", [primero?.total, primero?.desde], [true, t0]);
  es("parar de verdad también pone a cero el tope total", conDespertares(3, null, (m) => m <= 70 * MIN || m >= 72 * MIN).avisos, [["con_fondo", HORA_Y_MEDIO_MIN], ["sin_entregar", 71 * MIN], ["con_fondo", 130 * MIN]]);
}
{
  const contado = conDespertares(1.25).hijas;
  const total = aviso(7, "con_fondo", { desde: t0, total: true });
  es("ese aviso no se retira porque la despierte otro turno breve", aunParadas([total], contado).length, 1);
}
es("una entrega vuelve a empezar la cuenta", conDespertares(4, 95 * MIN).avisos, [["con_fondo", HORA_Y_MEDIO_MIN], ["con_fondo", 165 * MIN + 30_000]]);
es("también si se pone a trabajar justo al entregar", conDespertares(4, 105 * MIN).avisos, [["con_fondo", HORA_Y_MEDIO_MIN], ["con_fondo", 165 * MIN + 30_000]]);
{
  // Trabajó de verdad tres horas entre medias: eso no es llevar tres horas de fondo.
  let hijas: Map<number, Hija> = new Map([[7, { ...hija(), listaDesde: t0 }]]);
  hijas = paradasSinEntregar(hijas, t0 + 10 * MIN, () => true).hijas;
  hijas = alCambiarHijas(hijas, parada, trabaja, t0 + 11 * MIN).hijas;
  hijas = alCambiarHijas(hijas, trabaja, parada, t0 + 190 * MIN).hijas;
  es("tras horas trabajando de verdad, el tope total empieza de nuevo", paradasSinEntregar(hijas, t0 + 190 * MIN + 3000, () => true).avisos, []);
}
{
  // Ya avisada a los veinte minutos seguidos, el tope total no repite.
  let hijas: Map<number, Hija> = new Map([[7, { ...hija(), listaDesde: t0 }]]);
  const vistos: string[] = [];
  for (let t = t0 + 3000; t <= t0 + 3 * 60 * MIN; t += 3000) {
    const m = t - t0;
    if (m > 25 * MIN && m % (15 * MIN) === 0) hijas = alCambiarHijas(hijas, parada, trabaja, t).hijas;
    if (m > 25 * MIN && m % (15 * MIN) === 30_000) hijas = alCambiarHijas(hijas, trabaja, parada, t).hijas;
    const p = paradasSinEntregar(hijas, t, () => true);
    hijas = p.hijas;
    vistos.push(...p.avisos.map((a) => a.que));
  }
  es("avisada ya por los veinte minutos seguidos, el tope total no repite", vistos, ["con_fondo"]);
}
/** Cuántos avisos da un fondo vivo con un turno de 30 s en los minutos que diga `despierta`. */
function avisosConTurnos(horas: number, despierta: (m: number) => boolean) {
  let hijas: Map<number, Hija> = new Map([[7, { ...hija(), listaDesde: t0 }]]);
  const vistos: number[] = [];
  for (let t = t0 + 3000; t <= t0 + horas * 60 * MIN; t += 3000) {
    const m = t - t0;
    if (despierta(m)) hijas = alCambiarHijas(hijas, parada, trabaja, t).hijas;
    if (despierta(m - 30_000)) hijas = alCambiarHijas(hijas, trabaja, parada, t).hijas;
    const p = paradasSinEntregar(hijas, t, () => true);
    hijas = p.hijas;
    vistos.push(...p.avisos.map(() => m));
  }
  return vistos;
}
es("un turno breve cada veinticinco minutos: un aviso en 24 horas, no uno por turno", avisosConTurnos(24, (m) => m > 0 && m % (25 * MIN) === 0).length, 1);
es("despertada 75 minutos y luego tres horas quieta: un aviso, no dos", avisosConTurnos(4, (m) => m > 0 && m <= 75 * MIN && m % (15 * MIN) === 0).length, 1);
{
  // El de los veinte minutos espera a la madre y un turno breve lo retira: nadie lo ha leído.
  let hijas: Map<number, Hija> = new Map([[7, { ...hija(), listaDesde: t0 }]]);
  let cola: AvisoArriba[] = [];
  let retirados = 0;
  for (let t = t0 + 3000; t <= t0 + 24 * 60 * MIN; t += 3000) {
    const m = t - t0;
    if (m > 20 * MIN && m % (15 * MIN) === 0) hijas = alCambiarHijas(hijas, parada, trabaja, t).hijas;
    if (m > 20 * MIN && m % (15 * MIN) === 30_000) hijas = alCambiarHijas(hijas, trabaja, parada, t).hijas;
    const p = paradasSinEntregar(hijas, t, () => true);
    hijas = p.hijas;
    cola = [...cola, ...p.avisos];
    const siguen = aunParadas(cola, hijas);
    retirados += cola.length - siguen.length;
    hijas = rearmarFondoRetirado(hijas, cola.filter((a) => !siguen.includes(a)));
    cola = siguen;
  }
  es("retirado sin que nadie lo leyera, el tope total avisa a la hora, y una sola vez", [retirados, cola.map((a) => [a.que, a.total, a.cuando - t0])], [1, [["con_fondo", true, HORA_Y_MEDIO_MIN]]]);
}
{
  const sinContar: Map<number, Hija> = new Map([[7, { ...hija(), listaDesde: t0 }]]);
  ok("sin nada contado que rearmar, no cambia nada", rearmarFondoRetirado(sinContar, [aviso(7, "con_fondo", { desde: t0 })]) === sinContar);
  ok("ni con una hija ya cerrada", rearmarFondoRetirado(sinContar, [aviso(9, "con_fondo", { desde: t0 })]) === sinContar);
}

// --- cerrar solo se ofrece a la que acabó y sigue acabada -----------------------------------
const hecha = aviso(7, "entrega", { estado: "hecho", texto: "ya" });
ok("«hecho» y parada: se ofrece cerrarla", lineaPara([hecha], () => false).includes("ciérrala con close_pane"));
const sigue = lineaPara([hecha], (h) => h === 7);
ok("«hecho» pero ha vuelto a trabajar o tiene fondo vivo: no se ofrece", !sigue.includes("close_pane") && sigue.endsWith("Mírala con read_pane_screen antes de cerrarla: puede no haber acabado."), sigue);
const dosHechas = lineaPara([hecha, aviso(8, "entrega", { estado: "hecho", texto: "ya" })], (h) => h === 8);
ok("de dos «hecho», solo la que sigue parada", dosHechas.endsWith("con close_pane, solo la que ya acabó (panel 7)."), dosHechas);
// Lo que no cabe en la línea, en singular: cuatro resúmenes largos dejan fuera uno.
const unaFuera = lineaPara(Array.from({ length: 4 }, (_, i) => aviso(i + 1, "entrega", { estado: "hecho", texto: "x".repeat(480) })));
ok("si queda una fuera, en singular", unaFuera.includes("y 1 más (mírala en get_active_panes)"), unaFuera.slice(-180));

console.log(fallos ? `\n${fallos} FALLOS: ${rojos.join("; ")}` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
