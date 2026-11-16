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
  TOPE_POR_HORA,
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
ok("y acaba diciendo qué hacer con ellas", linea.endsWith("Léelas con read_pane_transcript o ciérralas con close_pane."), linea);
ok("es UNA línea", !/[\r\n]/.test(linea));
const conPunto = lineaPara([aviso(7, "entrega", { estado: "hecho", texto: "El traspaso, en el BUZON." })]);
ok("un resumen que acaba en punto no lo dobla", conPunto.includes("en el BUZON. Léelas") && !conPunto.includes(".."), conPunto);
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

console.log(fallos ? `\n${fallos} FALLOS: ${rojos.join("; ")}` : "\nTODO BIEN");
process.exit(fallos ? 1 : 0);
