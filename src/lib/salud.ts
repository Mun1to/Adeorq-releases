// El horario de salud: a qué hora te cierra Adeorq por la noche.
//
// Munir, 2026-11-24, a la 1:40: «una función de salud en Adeorq, en ajustes,
// de horario de ponerte topes, y que Adeorq se bloquee y tus agentes cierren
// antes, pero que puedas editar y posponer cuanto quieras». Lo decidió ese
// mismo día (decisión d1a20f78a7b9): a la hora, Adeorq tapa la ventana con un
// aviso que se pospone con un clic; avisa quince minutos antes; manda cerrar a
// todas las terminales; y el horario es fijo, con la opción de uno distinto
// por cada noche. El modelo de lo que se les dice a los agentes es su gancho
// `~/.claude/hooks/hora-de-dormir.mjs` (a la 1 se cierra, a las 2 como mucho).
//
// Aquí vive solo lo que se prueba sin ventana (`pnpm bancos salud`): el
// horario guardado, en qué fase está cada momento y qué hace posponer. Quien
// tapa la ventana, quien avisa a los agentes y la tarjeta de Ajustes leen esto
// y no calculan horas por su cuenta.
//
// Una noche se nombra por el día en que empieza: la del lunes cierra el martes
// a la 1. Así «cada noche la suya» se lee como lo dice una persona.

/** Lo que se guarda. Las horas van como «HH:MM», en la hora de la máquina. */
export interface Salud {
  activo: boolean;
  /** La hora de cierre de todas las noches, sin `porDia`. */
  cierre: string;
  /** Si cada noche tiene la suya (`dias`). */
  porDia: boolean;
  /** La de cada noche, por el día en que empieza (0 domingo, como `getDay`).
      `null` es esa noche sin tope. */
  dias: (string | null)[];
  /** Cuántos minutos antes avisa, a ti y a las terminales. */
  avisoMin: number;
  /** Desde qué hora de la mañana deja de tapar. */
  despierta: string;
}

/** Apagado: tapar la ventana de alguien a la 1 sin que lo haya pedido no es
    ayudar. Las horas son las de Munir. */
export const SALUD_DE_FABRICA: Salud = {
  activo: false,
  cierre: "01:00",
  porDia: false,
  dias: ["01:00", "01:00", "01:00", "01:00", "01:00", "01:00", "01:00"],
  avisoMin: 15,
  despierta: "07:00",
};

/** Lo que dura un clic de «posponer». */
export const POSPONER_MIN = 15;

/** Pospuesto: la noche que se pospuso (por su cierre de verdad) y a qué hora
    cierra ahora. Solo vale para esa noche: la siguiente vuelve a su hora. */
export interface Pospuesto {
  cierre: number;
  hasta: number;
}

export type Fase =
  | { fase: "libre" }
  /** Quedan `avisoMin` o menos: se avisa, a ti y a las terminales. */
  | { fase: "aviso"; cierre: number; original: number; despierta: number }
  /** Ya es la hora: la ventana se tapa hasta `despierta` o hasta que pospongas. */
  | { fase: "cerrado"; cierre: number; original: number; despierta: number };

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** «HH:MM» en minutos desde las 0:00, o null si no es una hora. */
export function minutosDe(hora: string): number | null {
  const m = HORA.exec(hora);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Lo guardado, ya leído (`JSON.parse`), con la forma de un `Salud`: lo que
    falte o venga roto se queda como de fábrica, campo a campo. */
export function saludDe(v: unknown): Salud {
  if (!v || typeof v !== "object" || Array.isArray(v)) return SALUD_DE_FABRICA;
  const o = v as Record<string, unknown>;
  const hora = (x: unknown, si: string) => (typeof x === "string" && minutosDe(x) !== null ? x : si);
  const dias = Array.isArray(o.dias) && o.dias.length === 7
    ? o.dias.map((x, i) => (x === null ? null : hora(x, SALUD_DE_FABRICA.dias[i]!)))
    : SALUD_DE_FABRICA.dias;
  const aviso = typeof o.avisoMin === "number" && Number.isInteger(o.avisoMin) && o.avisoMin >= 0 && o.avisoMin <= 120
    ? o.avisoMin
    : SALUD_DE_FABRICA.avisoMin;
  return {
    activo: o.activo === true,
    cierre: hora(o.cierre, SALUD_DE_FABRICA.cierre),
    porDia: o.porDia === true,
    dias,
    avisoMin: aviso,
    despierta: hora(o.despierta, SALUD_DE_FABRICA.despierta),
  };
}

export function pospuestoDe(v: unknown): Pospuesto | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const ok = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 8.64e15;
  return ok(o.cierre) && ok(o.hasta) ? { cierre: o.cierre, hasta: o.hasta } : null;
}

/** La hora de cierre de la noche que empieza el día `base` (a las 0:00), o null si esa noche no tiene. */
function horaDeLaNoche(s: Salud, base: Date): string | null {
  return s.porDia ? s.dias[base.getDay()] ?? null : s.cierre;
}

/** Una hora de un día, contada con el calendario y no sumando milisegundos:
    así un cambio de hora no la mueve. */
const a = (base: Date, masDias: number, min: number) =>
  new Date(base.getFullYear(), base.getMonth(), base.getDate() + masDias, Math.floor(min / 60), min % 60).getTime();

/**
 * La noche que empieza el día `base`: cuándo cierra y cuándo deja de tapar. Un
 * cierre antes de la hora de despertar es de la madrugada siguiente (la 1 del
 * martes, para la noche del lunes); uno después, de esa misma tarde (las 23:30).
 */
function noche(s: Salud, base: Date): { cierre: number; despierta: number } | null {
  const hora = horaDeLaNoche(s, base);
  const c = hora === null ? null : minutosDe(hora);
  const w = minutosDe(s.despierta);
  if (c === null || w === null || c === w) return null;
  return { cierre: a(base, c < w ? 1 : 0, c), despierta: a(base, 1, w) };
}

/**
 * En qué fase está `ahora`: libre, avisando o con la ventana tapada. Mira la
 * noche de ayer y la de hoy, que son las únicas que pueden estar en marcha.
 * Lo pospuesto mueve el cierre de su noche, y nada más.
 */
export function faseDeSalud(ahora: number, s: Salud, pospuesto: Pospuesto | null = null): Fase {
  if (!s.activo) return { fase: "libre" };
  const hoy = new Date(ahora);
  const base = (d: number) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + d);
  for (const n of [noche(s, base(-1)), noche(s, base(0))]) {
    if (!n) continue;
    const cierre = pospuesto && pospuesto.cierre === n.cierre ? pospuesto.hasta : n.cierre;
    const desde = cierre - s.avisoMin * 60_000;
    if (ahora < desde || ahora >= n.despierta) continue;
    const datos = { cierre, original: n.cierre, despierta: n.despierta };
    return ahora < cierre ? { fase: "aviso", ...datos } : { fase: "cerrado", ...datos };
  }
  return { fase: "libre" };
}

/**
 * Un clic de «posponer»: `min` minutos más desde lo que sea más tarde, ahora
 * o el cierre de ahora. Se pospone cuanto quieras, pero solo esta noche; fuera
 * de un aviso o de la ventana tapada no hay nada que posponer.
 */
export function posponer(ahora: number, s: Salud, pospuesto: Pospuesto | null, min = POSPONER_MIN): Pospuesto | null {
  const f = faseDeSalud(ahora, s, pospuesto);
  if (f.fase === "libre") return pospuesto;
  return { cierre: f.original, hasta: Math.max(ahora, f.cierre) + min * 60_000 };
}

const CLAVE = "adeorq-salud";
const CLAVE_POSPUESTO = "adeorq-salud-pospuesto";

function leerJson(clave: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(clave) ?? "null");
  } catch {
    return null;
  }
}

export const leerSalud = (): Salud => saludDe(leerJson(CLAVE));
export const leerPospuesto = (): Pospuesto | null => pospuestoDe(leerJson(CLAVE_POSPUESTO));

export function guardarSalud(s: Salud): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(s));
  } catch {
    /* sin almacén: vale para esta vez */
  }
}

export function guardarPospuesto(p: Pospuesto | null): void {
  try {
    if (p) localStorage.setItem(CLAVE_POSPUESTO, JSON.stringify(p));
    else localStorage.removeItem(CLAVE_POSPUESTO);
  } catch {
    /* sin almacén: vale para esta vez */
  }
}
