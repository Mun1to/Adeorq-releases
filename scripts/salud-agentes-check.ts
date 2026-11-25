// Banco del aviso de la noche a los agentes (`src/lib/saludAgentes.ts`): a
// quién se le teclea que cierre, cuándo, y que sea una vez por noche.
//
//   pnpm bancos salud-agentes
//
// Cada guarda tiene aquí un caso que se pone rojo si se quita (medido quitándolas
// una a una el 2026-11-25): fuera del aviso, una vez por noche, la noche
// siguiente, la llave de teclear (`puedeTeclear`), las dos miradas de Gemini,
// una terminal que todavía no se sabe y el texto de pasada la hora.

import { makeT } from "../src/lib/i18n";
import type { WorkState } from "../src/lib/pty";
import { posponer, SALUD_DE_FABRICA, type Pospuesto, type Salud } from "../src/lib/salud";
import { crearSaludAgentes, lineaDeCierre, type TerminalSalud } from "../src/lib/saludAgentes";
import { PROCESO_TERMINADO } from "../src/lib/vueltaArriba";

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

// El lunes 23 y el martes 24 de noviembre de 2026, con la hora de la máquina.
const t = (dia: number, h: number, m = 0) => new Date(2026, 10, dia, h, m).getTime();
/** De fábrica pero encendido: cierra a la 1:00, avisa 15 minutos antes, destapa a las 7:00. */
const fija: Salud = { ...SALUD_DE_FABRICA, activo: true };

const estado = (state: WorkState, o: { agentsLive?: number; porque?: string } = {}) => ({ state, agentsLive: o.agentsLive ?? 0, porque: o.porque ?? "" });
/** Claude Code parado en su caja vacía, con el turno acabado. */
const parada = (o: Partial<TerminalSalud> = {}): TerminalSalud => ({
  estado: estado("lista"),
  deAgente: true,
  conCaja: true,
  enSuCaja: true,
  trabajando: false,
  turnoEnDisco: true,
  ...o,
});
/** Gemini, que no deja su turno en disco: su estado es «» siempre. */
const gemini = (o: Partial<TerminalSalud> = {}): TerminalSalud => parada({ estado: estado(""), turnoEnDisco: false, ...o });

function mundo(terms: Record<number, TerminalSalud | null>, o: { salud?: Salud; lang?: "es" | "en" } = {}) {
  const w = {
    ahora: t(23, 22),
    salud: o.salud ?? fija,
    pospuesto: null as Pospuesto | null,
    terms,
    tecleado: [] as [number, string][],
    /** Las que tienen la línea escrita en su caja, sin enviar. */
    atascadas: new Set<number>(),
    intros: [] as number[],
  };
  const aviso = crearSaludAgentes({
    ahora: () => w.ahora,
    salud: () => w.salud,
    pospuesto: () => w.pospuesto,
    paneles: () => Object.keys(w.terms).map(Number),
    terminal: (id) => w.terms[id] ?? null,
    teclear: (id, linea) => void w.tecleado.push([id, linea]),
    atascada: (id, linea) => w.atascadas.has(id) && w.tecleado.some(([i, l]) => i === id && l === linea),
    intro: (id) => void w.intros.push(id),
    t: () => makeT(o.lang ?? "es"),
  });
  /** Una mirada a esa hora: a quién le tecleó. */
  const a = (dia: number, h: number, m = 0) => {
    w.ahora = t(dia, h, m);
    return aviso.mirar();
  };
  return { w, a };
}

// --- cuándo -----------------------------------------------------------------------------
{
  const m = mundo({ 1: parada() });
  es("por la tarde, nada", m.a(23, 22), []);
  es("a las 0:44, todavía nada", m.a(24, 0, 44), []);
  es("a las 0:45 entra el aviso: se le teclea a la que está parada", m.a(24, 0, 45), [1]);
  es("una vez por noche: a las 0:50 ya no", m.a(24, 0, 50), []);
  es("ni pasada la hora", m.a(24, 1, 5), []);
  es("ni de madrugada", m.a(24, 3), []);
  es("a las 7, libre", m.a(24, 7), []);
  es("la noche siguiente, otra vez", m.a(25, 0, 45), [1]);
  es("en total, dos líneas en dos noches", m.w.tecleado.length, 2);
}
{
  const m = mundo({ 1: parada() }, { salud: SALUD_DE_FABRICA });
  es("apagado de fábrica: nada en toda la noche", [m.a(24, 0, 45), m.a(24, 1), m.a(24, 3)], [[], [], []]);
}
{
  const m = mundo({ 1: parada() }, { salud: { ...fija, porDia: true, dias: [null, null, "01:00", "01:00", "01:00", "01:00", "01:00"] } });
  es("una noche sin tope (la del lunes): nada", [m.a(24, 0, 45), m.a(24, 1, 5)], [[], []]);
}

// --- qué se le dice -----------------------------------------------------------------------
{
  const m = mundo({ 1: parada() });
  m.a(24, 0, 45);
  const linea = m.w.tecleado[0]?.[1] ?? "";
  ok("empieza por [adeorq], como todo lo que Adeorq teclea", linea.startsWith("[adeorq] "), linea);
  ok("dice la hora entre paréntesis, sin «a las 1:00»", linea.includes("(1:00)") && !/las 1:/.test(linea), linea);
  ok("que guarde lo suyo y cierre", /guarda lo tuyo/.test(linea) && /cierra la sesión/.test(linea), linea);
  ok("que deje su bloque para retomar si se compacta", /bloque para retomar/.test(linea), linea);
  ok("sin nombrar ningún CLI", !/claude|codex|gemini|copilot|grok|kimi|cursor/i.test(linea), linea);
  ok("en una sola línea (un salto la mandaría a medias)", !/[\r\n]/.test(linea), linea);
  ok("sin «›», que Codex se come al pegarlo", !linea.includes("›"), linea);
}
{
  const m = mundo({ 1: parada() }, { lang: "en" });
  m.a(24, 0, 45);
  const linea = m.w.tecleado[0]?.[1] ?? "";
  ok("en inglés, si la app está en inglés", linea.startsWith("[adeorq] Health notice (Settings)") && /save your work/.test(linea) && !/Ajustes|guarda/.test(linea), linea);
}
es(
  "pasada la hora dice que ya pasó",
  lineaDeCierre(makeT("es"), t(24, 1), true).startsWith("[adeorq] Aviso de Salud (Ajustes): ya pasó la hora de cierre"),
  true,
);

// --- a quién, y cuándo no -------------------------------------------------------------------
{
  const m = mundo({ 1: parada({ trabajando: true, estado: estado("a_medias") }) });
  es("trabajando en el aviso: espera", m.a(24, 0, 45), []);
  es("sigue trabajando: espera", m.a(24, 0, 50), []);
  m.w.terms[1] = parada();
  es("en cuanto para en su caja, se le teclea", m.a(24, 0, 51), [1]);
}
{
  const m = mundo({ 1: parada({ trabajando: true }) });
  m.a(24, 0, 45);
  es("con «lista» en disco pero la pantalla diciendo que trabaja: espera", m.w.tecleado.length, 0);
}
{
  const m = mundo({ 1: parada({ estado: estado("lista", { agentsLive: 2 }) }) });
  es("con subagentes fuera: espera", m.a(24, 0, 45), []);
}
{
  const m = mundo({ 1: parada({ trabajando: true, estado: estado("a_medias") }) });
  for (const [h, mi] of [[0, 45], [0, 55], [1, 0]]) m.a(24, h, mi);
  m.w.terms[1] = parada();
  es("trabajó todo el aviso: se le teclea pasada la hora", m.a(24, 1, 5), [1]);
  ok("y le dice que ya pasó", /ya pasó la hora de cierre de esta noche que puso quien usa Adeorq \(1:00\)/.test(m.w.tecleado[0]?.[1] ?? ""), m.w.tecleado[0]?.[1]);
}
{
  // Un menú (un permiso, una pregunta) tapa su caja: teclear lo contestaría.
  const m = mundo({ 1: parada({ enSuCaja: false, estado: estado("pregunta") }) });
  es("con una pregunta en pantalla: nada en toda la noche", [m.a(24, 0, 45), m.a(24, 1), m.a(24, 4), m.a(24, 6, 59)], [[], [], [], []]);
}
{
  const m = mundo({ 1: parada({ estado: estado("ofrece") }) });
  es("acabó preguntándote en prosa (te espera a ti): nada", [m.a(24, 0, 45), m.a(24, 1, 5)], [[], []]);
}
{
  const m = mundo({ 1: parada({ enSuCaja: false }) });
  es("con un borrador tuyo en su caja: nada", [m.a(24, 0, 45), m.a(24, 1, 5)], [[], []]);
}
{
  const m = mundo({ 1: parada({ deAgente: false, estado: estado("") }) });
  es("una consola a secas: nunca", [m.a(24, 0, 45), m.a(24, 0, 46), m.a(24, 1, 5)], [[], [], []]);
}
{
  const m = mundo({ 1: parada({ conCaja: false }) });
  es("un CLI cuya caja no se sabe leer: nunca", [m.a(24, 0, 45), m.a(24, 1, 5)], [[], []]);
}
{
  const m = mundo({ 1: null });
  es("una terminal de la que aún no se sabe nada: espera", m.a(24, 0, 45), []);
  m.w.terms[1] = parada();
  es("y en cuanto se sabe, se le teclea", m.a(24, 0, 46), [1]);
}

// --- Gemini: dos miradas seguidas -------------------------------------------------------------
{
  const m = mundo({ 2: gemini() });
  es("Gemini vista parada una vez: todavía no", m.a(24, 0, 45), []);
  es("y otra vez en la mirada siguiente: sí", m.a(24, 0, 46), [2]);
}
{
  const m = mundo({ 2: gemini() });
  m.a(24, 0, 45);
  m.w.terms[2] = gemini({ trabajando: true });
  es("Gemini parada y luego trabajando: no", m.a(24, 0, 46), []);
  m.w.terms[2] = gemini();
  es("parada otra vez, una sola mirada: todavía no", m.a(24, 0, 47), []);
  es("dos seguidas: sí", m.a(24, 0, 48), [2]);
}
{
  const m = mundo({ 2: gemini() });
  m.a(24, 0, 44);
  es("las miradas de antes del aviso no cuentan", m.a(24, 0, 45), []);
}
{
  // Vista parada a las 0:45 y pospuesto en ese momento: el aviso vuelve a la
  // 1:00, y una mirada de hace quince minutos no es «la mirada anterior».
  const m = mundo({ 2: gemini() });
  m.a(24, 0, 45);
  m.w.pospuesto = posponer(t(24, 0, 45), fija, null);
  m.a(24, 0, 46);
  es("Gemini tras el hueco de posponer: la mirada de antes no cuenta", m.a(24, 1, 0), []);
  es("la siguiente sí", m.a(24, 1, 1), [2]);
}
{
  const m = mundo({ 2: gemini({ estado: estado("", { porque: PROCESO_TERMINADO }) }) });
  es("Gemini cuyo proceso ya terminó: nunca", [m.a(24, 0, 45), m.a(24, 0, 46), m.a(24, 0, 47)], [[], [], []]);
}

// --- la línea que se queda escrita sin enviar ------------------------------------------------
// Medido con un Codex y un Gemini de verdad: el Intro caía dentro del pegado.
{
  const m = mundo({ 1: parada() });
  m.a(24, 0, 45);
  m.w.atascadas.add(1);
  m.w.terms[1] = parada({ enSuCaja: false });
  m.a(24, 0, 46);
  es("se quedó escrita en su caja: se pulsa Intro otra vez", m.w.intros, [1]);
  m.a(24, 0, 47);
  m.a(24, 0, 48);
  m.a(24, 0, 49);
  m.a(24, 0, 50);
  es("como mucho tres veces", m.w.intros, [1, 1, 1]);
  es("y no se teclea la línea otra vez", m.w.tecleado.length, 1);
}
{
  const m = mundo({ 1: parada() });
  m.a(24, 0, 45);
  m.a(24, 0, 46);
  m.w.atascadas.add(1);
  m.a(24, 0, 47);
  es("si se envió, no se pulsa nada, ni aunque luego la recuperes con ↑", m.w.intros, []);
}
{
  const m = mundo({ 1: parada() });
  m.a(24, 0, 45);
  m.w.atascadas.add(1);
  m.w.pospuesto = posponer(t(24, 0, 45), fija, null);
  m.a(24, 0, 46);
  es("se reintenta aunque la mirada siguiente caiga fuera del aviso", m.w.intros, [1]);
}

// --- posponer y cambiar la hora ----------------------------------------------------------------
{
  const m = mundo({ 1: parada() });
  m.a(24, 0, 45);
  m.w.pospuesto = posponer(t(24, 0, 50), fija, null);
  es("pospuesto en el aviso (cierre a la 1:15), fuera del margen: nada", m.a(24, 0, 51), []);
  m.w.terms[2] = parada();
  es("vuelve el aviso: la ya avisada no se repite, la nueva sí", m.a(24, 1, 0), [2]);
  ok("y a la nueva le dice el cierre pospuesto", (m.w.tecleado[1]?.[1] ?? "").includes("(1:15)"), m.w.tecleado[1]?.[1]);
}
{
  const m = mundo({ 1: parada() });
  m.a(24, 0, 45);
  m.w.salud = { ...fija, cierre: "01:30" };
  es("cambiar la hora en Ajustes es otra noche: con la nueva, se le vuelve a decir", m.a(24, 1, 15), [1]);
}

console.log(fallos ? `\n${fallos} en rojo:\n  ${rojos.join("\n  ")}` : "\ntodo en verde");
process.exit(fallos ? 1 : 0);
