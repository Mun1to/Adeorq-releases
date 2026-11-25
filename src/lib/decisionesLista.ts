// La lista de la pestaña «Decisiones»: todo lo que necesita tu dedo, en un solo sitio.
//
// Munir eligió el 2026-11-15 (A1, `docs/propuestas/diseno-ade.md`, «La bandeja,
// una sola»): hasta entonces lo que te reclamaba vivía en cuatro sitios (la
// campana de Adeo, Decisiones, la bandeja de la Agenda y el «Te espera» del
// lienzo) y Decisiones solo enseñaba las preguntas con opciones. Ahora es UNA
// lista, como un programa de correo, en este orden:
//
//   1. Te toca: una terminal parada en una pregunta o un permiso («Contesta»),
//      una pregunta de `ask_decision` («Decide»), un plan de Adeo que cerraste
//      sin contestar («Aprueba») y un encargo programado que el freno paró
//      («Parado»). Es lo mismo que pone a Adeo en guardia
//      (`animoDe`, en `lib/campana.ts`) y en ese mismo orden.
//   2. Terminó: los turnos acabados que no has mirado («Mira»).
//   3. Ideas de tus agentes: la bandeja de la regla R (`bandeja.md`, «Idea»).
//   4. Ya pasó: las decisiones que ya no esperan a nadie, plegadas (`filasQueSeVen`).
//
// Y desde el 2026-11-16 (P2 de la A1), dos cosas que tú haces con cada fila:
// H la pospone (sale de «Te toca» a «Pospuesto» y vuelve a la hora que digas o
// cuando el agente diga algo nuevo, lo que llegue antes) y U la marca como vista
// o no vista. Se apuntan por el nombre de la fila (`Reposo`) y llevan el
// `cuando` que tenía la fila en ese momento: si el agente habla otra vez, ese
// `cuando` avanza y la fila vuelve a despertar y a ser nueva. Un mismo número de
// terminal que mañana sea otra no hereda lo de ayer por la misma razón.
//
// Aquí vive lo que se prueba sin ventana: qué entra, en qué parte y en qué
// orden, a cuál se pasa con J y K, qué duerme y qué es nuevo, y cómo se lee una
// hora escrita (`pnpm bancos decisiones-lista`). La pantalla es
// `components/DecisionesView.tsx` y lo apuntado se guarda en `lib/decisiones.ts`.
// Todo lo importado es de tipos: este archivo no habla con Rust ni con ningún
// almacén.

import type { Aviso } from "./campana";
import type { Decision } from "./decisiones";
import type { PlanPendiente } from "./planPendiente";
import type { Programado } from "./programados";
import type { Note } from "./pty";

export type Parte = "toca" | "hablaste" | "termino" | "ideas" | "pospuesto" | "pasado";

/** Las partes, en el orden en que se enseñan. */
export const PARTES: Parte[] = ["toca", "hablaste", "termino", "ideas", "pospuesto", "pasado"];

/** El título de cada parte. */
export const TITULO_DE: Record<Parte, string> = {
  toca: "Te toca",
  hablaste: "Le escribiste después",
  termino: "Terminó",
  ideas: "Ideas de tus agentes",
  pospuesto: "Pospuesto",
  pasado: "Ya pasó",
};

/** Lo que tiene toda fila. `parte` es dónde se ve: una pospuesta es de la parte
    «pospuesto» aunque por lo que es fuera de «Te toca». */
interface Comun {
  id: string;
  parte: Parte;
  cuando: number;
  /** Si la pospusiste: cuándo vuelve, en milisegundos. */
  hasta?: number;
  /** Si ya la has mirado. Solo lo dice una fila de lo que aún cuenta: lo que ya
      pasó y lo pospuesto no es ni visto ni nuevo. Sin `reposo`, tampoco. */
  vista?: boolean;
}

export type Cosa =
  | (Comun & { clase: "decide" | "pasada"; d: Decision })
  | (Comun & { clase: "contesta" | "mira"; a: Aviso })
  | (Comun & { clase: "parado"; p: Programado })
  | (Comun & { clase: "plan"; plan: PlanPendiente })
  | (Comun & { clase: "idea"; n: Note });

export type Clase = Cosa["clase"];

/** La primera palabra de la fila, que es su categoría. La de una decisión que
    ya pasó dice cómo acabó. */
export const PALABRA: Record<Exclude<Clase, "pasada">, string> = {
  contesta: "Contesta",
  decide: "Decide",
  plan: "Aprueba",
  parado: "Parado",
  mira: "Mira",
  idea: "Idea",
};

/** Cómo acabó una decisión que ya no espera a nadie, en una palabra. */
export const ACABO: Record<string, string> = {
  huerfana: "Sin nadie detrás",
  hablada: "Hablada",
  contestada: "Contestada",
  descartada: "Descartada",
  resuelta: "Resuelta",
};

/** Lo que sigue arriba una hablada de una terminal abierta, desde que le escribiste. */
export const HABLADA_A_LA_VISTA = 3_600_000;

/** Le escribiste a su terminal después de que preguntara, pero esa terminal
    sigue abierta: no tiene por qué haber sido la respuesta, así que se sigue
    viendo arriba, aparte y sin sumar (Munir, 2026-11-24, buscando lo que le
    quedaba por decidir: «no lo veo»). Pero solo una hora: si no la contestas
    ni la cierra el agente, era la respuesta y se va con las anteriores, sin
    pedirte que la descartes (Munir, 2026-11-25: «que se elimine
    automáticamente… y no haya que estar todo el rato eliminando a mano»). */
export const habladaAbierta = (d: Decision, ahora: number) =>
  d.vigencia === "hablada" && d.se_teclea === true && ahora < (d.hablada ?? 0) + HABLADA_A_LA_VISTA;

/** Cuándo deja de estar arriba la primera hablada que aún lo está: a esa hora
    hay que volver a mirar la lista. */
export function proximaHabladaQueSeVa(decisiones: Decision[], ahora: number): number | undefined {
  const horas = decisiones.filter((d) => habladaAbierta(d, ahora)).map((d) => (d.hablada ?? 0) + HABLADA_A_LA_VISTA);
  return horas.length ? Math.min(...horas) : undefined;
}

/** Lo último que le pasó a una decisión: contestarla, descartarla, hablarla o, si nada, pedirla. */
const ultimoMovimiento = (d: Decision) =>
  Math.max(d.creada, d.respuesta?.cuando ?? 0, d.descartada ?? 0, d.hablada ?? 0, d.resuelta?.cuando ?? 0);

const masNuevaPrimero = (x: Cosa, y: Cosa) => y.cuando - x.cuando;

export interface Fuentes {
  decisiones: Decision[];
  /** Los de la campana (`useAvisos`): «espera» y «hecho». */
  avisos: Aviso[];
  programados: Programado[];
  /** La bandeja de la Agenda (`read_inbox`), en el orden del archivo. */
  notas: Note[];
  /** El plan de Adeo que cerraste sin contestar (`lib/planPendiente.ts`). */
  plan?: PlanPendiente | null;
  /** Lo que has pospuesto y mirado. Sin él, nada duerme y nada sabe si es nuevo. */
  reposo?: Reposo;
  /** La hora de ahora, en milisegundos: lo pospuesto vuelve cuando llega la suya. */
  ahora?: number;
}

/**
 * La lista entera, ya ordenada: primero lo que te toca, luego lo que terminó,
 * luego las ideas y al final lo que ya pasó. Dentro de cada parte, lo más
 * nuevo arriba, como un correo.
 *
 * Un «terminó» de una terminal que te ha dejado una decisión viva no sale: la
 * decisión ya dice lo que hay que hacer, y dos filas para lo mismo es justo el
 * ruido que esta lista viene a quitar. Un «te espera» sí sale, porque una
 * terminal parada en un permiso necesita su tecla aunque haya preguntado algo
 * más.
 */
export function juntar(f: Fuentes): Cosa[] {
  const vivas = f.decisiones.filter((d) => d.vigencia === "viva");
  const conDecision = new Set(vivas.flatMap((d) => (d.panel != null ? [d.panel] : [])));
  const contesta: Cosa[] = f.avisos
    .filter((a) => a.tipo === "espera")
    .map((a) => ({ id: idDeAviso(a.paneId), parte: "toca", clase: "contesta", cuando: a.cuando, a }));
  const decide: Cosa[] = vivas.map((d) => ({ id: `dec:${d.id}`, parte: "toca", clase: "decide", cuando: d.creada, d }));
  // Un plan de Adeo esperando tu sí es una decisión más, y va con ellas.
  if (f.plan) decide.push({ id: `plan:${f.plan.cuando}`, parte: "toca", clase: "plan", cuando: f.plan.cuando, plan: f.plan });
  const parado: Cosa[] = f.programados.flatMap((p) =>
    p.cortado ? [{ id: `prog:${p.id}`, parte: "toca" as const, clase: "parado" as const, cuando: p.cortado.cuando, p }] : [],
  );
  const mira: Cosa[] = f.avisos
    .filter((a) => a.tipo === "hecho" && !conDecision.has(a.paneId))
    .map((a) => ({ id: idDeAviso(a.paneId), parte: "termino", clase: "mira", cuando: a.cuando, a }));
  // La bandeja no lleva hora: las nuevas se añaden al final del archivo, así
  // que la línea hace de reloj. Pero no de nombre: al quitar una, las de debajo
  // suben un renglón, y con el número la vista se quedaba sobre otra nota.
  const ideas: Cosa[] = f.notas
    .slice()
    .sort((x, y) => y.line - x.line)
    .map((n) => ({ id: idDeNota(n), parte: "ideas", clase: "idea", cuando: 0, n }));
  // Dos notas que dicen lo mismo en el mismo proyecto: la segunda lleva su número.
  const vistas = new Map<string, number>();
  for (const c of ideas) {
    const k = (vistas.get(c.id) ?? 0) + 1;
    vistas.set(c.id, k);
    if (k > 1) c.id = `${c.id}#${k}`;
  }
  // Le escribiste a su terminal y sigue abierta: puede que no fuera la respuesta.
  // Se ve aparte una hora y no suma en lo que te toca (`habladaAbierta`).
  const ahora = f.ahora ?? Date.now();
  const hablaste: Cosa[] = f.decisiones
    .filter((d) => habladaAbierta(d, ahora))
    .map((d) => ({ id: `dec:${d.id}`, parte: "hablaste", clase: "pasada", cuando: d.creada, d }));
  const pasadas: Cosa[] = f.decisiones
    .filter((d) => d.vigencia !== "viva" && !habladaAbierta(d, ahora))
    .map((d) => ({ id: `dec:${d.id}`, parte: "pasado", clase: "pasada", cuando: ultimoMovimiento(d), d }));
  const todas: Cosa[] = [
    ...contesta.sort(masNuevaPrimero),
    ...decide.sort(masNuevaPrimero),
    ...parado.sort(masNuevaPrimero),
    ...hablaste.sort(masNuevaPrimero),
    ...mira.sort(masNuevaPrimero),
    ...ideas,
    ...pasadas.sort(masNuevaPrimero),
  ];
  return f.reposo ? conReposo(todas, f.reposo, ahora) : todas;
}

/**
 * Las filas que se ven en la lista. Lo que ya pasó va plegado al final en
 * cuanto queda decidido, y solo sale si abres «Ya pasó»: en la lista queda lo
 * que te espera (Munir, 2026-11-25, harto de borrarlas a mano: «que se elimine
 * automáticamente cuando ya esté decidido o dado por terminado»). Siguen
 * guardadas una semana, para que el agente lea tu respuesta y tú la repases.
 *
 * La que tienes abierta se queda aunque acabe de pasar (le contestaste y tienes
 * delante el «Enviada…»), hasta que vayas a otra.
 */
export function filasQueSeVen(lista: Cosa[], abiertaId: string | null, anteriores: boolean): Cosa[] {
  if (anteriores) return lista;
  return lista.filter((c) => c.parte !== "pasado" || c.id === abiertaId);
}

// --- lo que haces con cada fila: posponerla (H) y marcarla como vista (U) -----------------

/** Lo apuntado, por el nombre de la fila (`id`). */
export interface Reposo {
  /** Las que has mirado: el `cuando` que tenían entonces y cuándo las miraste.
      Si el agente dice algo nuevo, su `cuando` pasa de ese y vuelven a ser nuevas. */
  vistas: Record<string, { cuando: number; en: number }>;
  /** Las que pospusiste: a qué hora vuelven y el `cuando` que tenían al apartarlas. */
  pospuestas: Record<string, { hasta: number; desde: number }>;
}

export const SIN_REPOSO: Reposo = { vistas: {}, pospuestas: {} };

const objeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
/** Un número que cabe en una fecha (±8,64e15 ms): uno más grande tumbaba la pestaña al
    pintar «Vuelve a las…» (`RangeError` de `Intl.DateTimeFormat`). */
const numero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 8.64e15;

/** Lo guardado, ya leído (`JSON.parse`): solo las entradas con la forma de un
    `Reposo`. Una rota (escrita a mano, de otra versión o a medias) se tira y lo
    demás se queda: con un `null` dentro, el reloj de despertar lanzaba al cargar
    y la app arrancaba en blanco. */
export function reposoDe(v: unknown): Reposo {
  if (!objeto(v)) return SIN_REPOSO;
  const vistas: Reposo["vistas"] = {};
  const pospuestas: Reposo["pospuestas"] = {};
  if (objeto(v.vistas))
    for (const [id, x] of Object.entries(v.vistas)) if (objeto(x) && numero(x.cuando) && numero(x.en)) vistas[id] = { cuando: x.cuando, en: x.en };
  if (objeto(v.pospuestas))
    for (const [id, x] of Object.entries(v.pospuestas))
      if (objeto(x) && numero(x.hasta) && numero(x.desde)) pospuestas[id] = { hasta: x.hasta, desde: x.desde };
  return { vistas, pospuestas };
}

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
/** Lo visto se olvida a los treinta días, y una pospuesta un día después de volver:
    así lo guardado no crece sin fin. */
const MES = 30 * DIA;

/** La hora a la que vuelve, si la fila duerme ahora; si no, nada. Duerme hasta su
    hora o hasta que el agente diga algo nuevo (su `cuando` pasa de lo que era al
    apartarla), lo que llegue antes. Lo que ya pasó no se pospone. */
function duerme(c: Nombre & { clase?: Clase }, r: Reposo, ahora: number): number | undefined {
  if (c.clase === "pasada") return undefined;
  const p = r.pospuestas[c.id];
  return p && ahora < p.hasta && c.cuando <= p.desde ? p.hasta : undefined;
}

const esVista = (c: Pick<Cosa, "id" | "cuando">, r: Reposo) => {
  const v = r.vistas[c.id];
  return !!v && v.cuando >= c.cuando;
};

/** La lista con lo apuntado puesto: las que duermen pasan a «Pospuesto» (la que
    vuelve antes, arriba, y justo antes de lo que ya pasó) y las demás dicen si
    ya las has visto. */
function conReposo(todas: Cosa[], r: Reposo, ahora: number): Cosa[] {
  const despiertas: Cosa[] = [];
  const dormidas: Cosa[] = [];
  for (const c of todas) {
    const hasta = duerme(c, r, ahora);
    if (hasta !== undefined) dormidas.push({ ...c, parte: "pospuesto", hasta });
    else despiertas.push(c.clase === "pasada" ? c : { ...c, vista: esVista(c, r) });
  }
  dormidas.sort((x, y) => (x.hasta ?? 0) - (y.hasta ?? 0));
  const alFinal = despiertas.findIndex((c) => c.parte === "pasado");
  return alFinal < 0 ? [...despiertas, ...dormidas] : [...despiertas.slice(0, alFinal), ...dormidas, ...despiertas.slice(alFinal)];
}

type Nombre = Pick<Cosa, "id" | "cuando">;

/** La has mirado. Lo que ya pasó no apunta nada: no hay nada que mirar. Mirarla
    otra vez pone al día cuándo: lo visto se olvida a los treinta días de la última
    vez, no de la primera. */
export function verla(r: Reposo, c: Nombre & { clase?: Cosa["clase"] }, ahora: number): Reposo {
  // Abrirla mientras duerme no cuenta: vuelve sin ver, como un correo pospuesto.
  if (c.clase === "pasada" || duerme(c, r, ahora) !== undefined) return r;
  const antes = r.vistas[c.id];
  if (antes?.cuando === c.cuando && antes.en === ahora) return r;
  return { ...r, vistas: { ...r.vistas, [c.id]: { cuando: c.cuando, en: ahora } } };
}

/** La marcas como no vista. */
export function sinVerla(r: Reposo, id: string): Reposo {
  if (!(id in r.vistas)) return r;
  const { [id]: _quitada, ...vistas } = r.vistas;
  return { ...r, vistas };
}

/** La pospones hasta `hasta` (milisegundos). Vuelve sin ver: para pulsar H la
    tenías abierta, y abrirla la marcó vista. */
export function posponer(r: Reposo, c: Nombre, hasta: number): Reposo {
  const { [c.id]: _vista, ...vistas } = r.vistas;
  return { vistas, pospuestas: { ...r.pospuestas, [c.id]: { hasta, desde: c.cuando } } };
}

/** La traes de vuelta ya. */
export function despertar(r: Reposo, id: string): Reposo {
  if (!(id in r.pospuestas)) return r;
  const { [id]: _quitada, ...pospuestas } = r.pospuestas;
  return { ...r, pospuestas };
}

/** Lo que ya no sirve: lo visto hace más de un mes y lo que volvió hace más de un día. */
export function podar(r: Reposo, ahora: number): Reposo {
  const vistas = Object.fromEntries(Object.entries(r.vistas).filter(([, v]) => v.en >= ahora - MES));
  const pospuestas = Object.fromEntries(Object.entries(r.pospuestas).filter(([, p]) => p.hasta >= ahora - DIA));
  return { vistas, pospuestas };
}

/** Cuándo hay que volver a mirar la lista: la hora de la primera que aún duerme. */
export function proximoDespertar(r: Reposo, ahora: number): number | undefined {
  const futuras = Object.values(r.pospuestas)
    .map((p) => p.hasta)
    .filter((h) => h > ahora);
  return futuras.length ? Math.min(...futuras) : undefined;
}

/** Hoy, mañana u otro día: para decir cuándo vuelve. */
export function diaDe(hasta: number, ahora: number): "hoy" | "manana" | "otro" {
  const dia = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const dif = Math.round((dia(hasta) - dia(ahora)) / DIA);
  return dif <= 0 ? "hoy" : dif === 1 ? "manana" : "otro";
}

const aLasNueve = (ahora: number, dias: number) => {
  const d = new Date(ahora);
  d.setDate(d.getDate() + dias);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
};

/** Los plazos del menú de H, con su tecla. «Mañana» es mañana aunque sean las
    tres de la madrugada: para otra hora está la «otra hora». */
export function plazos(ahora: number): Array<{ tecla: string; clave: string; hasta: number }> {
  return [
    { tecla: "1", clave: "En una hora", hasta: ahora + HORA },
    { tecla: "2", clave: "En tres horas", hasta: ahora + 3 * HORA },
    { tecla: "3", clave: "Mañana a las 9:00", hasta: aLasNueve(ahora, 1) },
    { tecla: "4", clave: "Dentro de una semana, a las 9:00", hasta: aLasNueve(ahora, 7) },
  ];
}

/**
 * Una hora escrita, a milisegundos; `null` si no se entiende. Dos formas, en
 * español y en inglés (la caja y la guía en inglés enseñan «in 2 h»):
 *  - la del reloj, la próxima vez que dé esa hora (hoy si aún no pasó, si no
 *    mañana): «16:30», «16.30», «16h30», «16», «16h», «a las 9», «a la 1»,
 *    «a las 16h», «at 9», «4pm», «4:30 p.m.» o «4 p. m.».
 *  - lo que falta, con un más, con «en» o con «in»: «+45» (minutos), «+2h»,
 *    «en 30 min», «en 2 horas», «in 2 h», «in 45 minutes», «+1h30». Sin unidad son
 *    minutos. Y sin nada delante, un número con su unidad: «2 h», «2h», «3 horas»,
 *    «30 min». «2 h» suelto no son las dos de la madrugada; pero «16h» suelto, de 13
 *    a 23, sí es la hora del reloj: así se escribe en España, y nadie pospone
 *    dieciséis horas escribiéndolo así.
 * Hasta treinta días; más allá o cero no tiene sentido.
 */
export function cuandoVuelve(texto: string, ahora: number): number | null {
  // «p. m.» y «a. m.», como se escriben en español, son «pm» y «am».
  const s = texto.trim().toLowerCase().replace(/\s+/g, " ").replace(/([ap])\.\s?m\.?$/, "$1m");
  const hm = /^(?:\+|en |in )\s*(\d{1,3})\s*h\s*(\d{1,2})(?:\s*min|\s*m)?$/.exec(s);
  if (hm) {
    const ms = Number(hm[1]) * HORA + Number(hm[2]) * MIN;
    return Number(hm[2]) < 60 && ms > 0 && ms <= MES ? ahora + ms : null;
  }
  const falta = /^(\+|en |in )?\s*(\d{1,4})\s*(h|hrs?|horas?|hours?|m|mins?|minutos?|minutes?)?$/.exec(s);
  const delReloj = !!falta && !falta[1] && falta[3] === "h" && Number(falta[2]) >= 13 && Number(falta[2]) <= 23;
  if (falta && (falta[1] || falta[3]) && !delReloj) {
    const n = Number(falta[2]);
    const ms = n * (falta[3]?.startsWith("h") ? HORA : MIN);
    return n > 0 && ms <= MES ? ahora + ms : null;
  }
  const reloj = /^(?:a las? |at )?(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?\s*(h|am|pm)?$/.exec(s);
  if (!reloj) return null;
  let h = Number(reloj[1]);
  const m = reloj[2] ? Number(reloj[2]) : 0;
  // Con am o pm, de 1 a 12: «12am» es medianoche y «12pm», mediodía.
  const medio = reloj[3];
  if (medio === "am" || medio === "pm") {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (medio === "pm" ? 12 : 0);
  }
  if (h > 23 || m > 59) return null;
  const d = new Date(ahora);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= ahora) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** A cuál se pasa tras posponer la abierta: la siguiente de abajo que aún pide
    algo (te toca, terminó o es una idea), y si no hay, la de encima. Nunca una
    que ya pasó ni otra pospuesta. Sin ninguna, nada. */
export function siguienteTrasApartar(lista: Cosa[], id: string): Cosa | undefined {
  const i = lista.findIndex((c) => c.id === id);
  const pide = (c: Cosa) => c.id !== id && (c.parte === "toca" || c.parte === "termino" || c.parte === "ideas");
  return lista.slice(i + 1).find(pide) ?? lista.slice(0, Math.max(i, 0)).reverse().find(pide);
}

/** El nombre en la lista de lo que te dice una terminal: uno por panel. */
export const idDeAviso = (paneId: number) => `aviso:${paneId}`;

/** Lo que duerme ahora, por su nombre: la campana y la cara de Adeo no lo cuentan,
    igual que el número de la pestaña. */
export const dormidas = (lista: Cosa[]) => new Set(lista.filter((c) => c.parte === "pospuesto").map((c) => c.id));

/** Si un aviso de la campana duerme: con su propia fila pospuesta, o, si es el «terminó»
    de una terminal con decisión viva (que no es fila: la representa la decisión), con
    todas las decisiones de esa terminal pospuestas. Un «te espera» pide su tecla y no. */
export function avisoDormido(lista: Cosa[]): (a: Pick<Aviso, "paneId" | "tipo">) => boolean {
  const duermen = dormidas(lista);
  const dormido = new Set<number>();
  const despierto = new Set<number>();
  for (const c of lista) if (c.clase === "decide" && c.d.panel != null) (c.parte === "pospuesto" ? dormido : despierto).add(c.d.panel);
  return (a) => duermen.has(idDeAviso(a.paneId)) || (a.tipo === "hecho" && dormido.has(a.paneId) && !despierto.has(a.paneId));
}

/** El nombre de una idea en la lista: por lo que dice, no por su renglón. */
export const idDeNota = (n: Pick<Note, "kind" | "project" | "text">) => `nota:${n.kind}|${n.project}|${n.text}`;

/** Lo que cuenta la pestaña: lo que te toca a ti. Lo que terminó ya lo cuenta
    la campana, y las ideas no te esperan. */
export const cuantasTeTocan = (lista: Cosa[]) => lista.filter((c) => c.parte === "toca").length;

/**
 * La que se abre al entrar o cuando la abierta se va de la lista (le
 * contestaste, la aceptaste, se cerró su terminal).
 *
 * Al entrar, solo una que te toca: con nada pendiente la pestaña lo dice y no
 * te planta delante una de ayer. Si se va la que tenías delante, la que ocupa
 * ahora su sitio, para seguir con J sin volver arriba.
 */
export function laAbierta(lista: Cosa[], id: string | null, dondeEstaba: number): Cosa | undefined {
  if (id != null) {
    const sigue = lista.find((c) => c.id === id);
    if (sigue) return sigue;
    if (dondeEstaba >= 0 && lista.length) return lista[Math.min(dondeEstaba, lista.length - 1)];
  }
  return lista.find((c) => c.parte === "toca");
}

/** La vecina para J y K (o ↓ y ↑): sin dar la vuelta, que en una lista de
    correo pasar del último al primero te pierde. Sin ninguna abierta, J abre
    la primera y K la última. */
export function vecina(lista: Cosa[], id: string | null, paso: 1 | -1): Cosa | undefined {
  if (!lista.length) return undefined;
  const i = id == null ? -1 : lista.findIndex((c) => c.id === id);
  if (i < 0) return paso > 0 ? lista[0] : lista[lista.length - 1];
  return lista[Math.max(0, Math.min(lista.length - 1, i + paso))];
}

/** «Adeorq», de `C:\proyectos\Adeorq`. */
export const carpeta = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd;
