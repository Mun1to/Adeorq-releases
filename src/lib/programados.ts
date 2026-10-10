// Los encargos programados, vistos desde la ventana.
//
// Quien decide cuándo se lanza uno y cuándo se le corta es Rust
// (`src-tauri/src/programados.rs`): el presupuesto no lo guarda quien lo gasta.
// Aquí solo está el puente y lo que hace falta para PINTAR una fila: decir en
// palabras cuándo toca y cuándo es la próxima vez. La próxima vez se calcula
// aquí y no se pide a Rust porque es solo para leerla: si este cálculo y el
// reloj discreparan un minuto, manda el reloj y nadie pierde nada.

import { invoke } from "@tauri-apps/api/core";

export type Cuando =
  | { tipo: "semanal"; /** 1 lunes … 7 domingo. */ dias: number[]; /** «HH:MM». */ hora: string }
  | { tipo: "cada"; horas: number };

export type Resultado = "hecho" | "fallo" | "saltado";

export interface Pasada {
  cuando: number;
  resultado: Resultado;
  detalle: string;
}

export interface Programado {
  id: string;
  nombre: string;
  encargo: string;
  cwd: string;
  cuando: Cuando;
  /** Tu interruptor. */
  activo: boolean;
  creado: number;
  ultima: number;
  /** El día local de la última vez («2026-10-12»). */
  ultimoDia: string;
  corrida: { inicio: number; panel: number; arranque: number; juzgada: boolean } | null;
  /** Las tres últimas veces, la más nueva primero. */
  ultimas: Pasada[];
  fallosSeguidos: number;
  /** El interruptor del freno: saltó tras tres fallos seguidos. */
  cortado: { cuando: number; motivo: string } | null;
}

export interface EstadoProgramados {
  /** En este sistema se lanzan solos (hoy, solo Windows). */
  puede: boolean;
  /** El reloj corre en esta ventana (en la de desarrollo, no). */
  reloj: boolean;
  encargos: Programado[];
}

export interface PedidoProgramado {
  id?: string;
  nombre: string;
  encargo: string;
  cwd: string;
  cuando: Cuando;
}

/** Lo que emite Rust cuando cambia algo: uno nuevo, uno que se lanzó, un corte. */
export const EVENTO_PROGRAMADOS = "programados:cambian";

export const listarProgramados = () => invoke<EstadoProgramados>("programados_listar");
export const guardarProgramado = (pedido: PedidoProgramado) =>
  invoke<EstadoProgramados>("programado_guardar", { pedido });
export const borrarProgramado = (id: string) => invoke<EstadoProgramados>("programado_borrar", { id });
export const activarProgramado = (id: string, activo: boolean) =>
  invoke<EstadoProgramados>("programado_activar", { id, activo });
export const rearmarProgramado = (id: string) => invoke<EstadoProgramados>("programado_rearmar", { id });
export const probarProgramado = (id: string) => invoke<EstadoProgramados>("programado_probar", { id });

/** Los días, en el orden en que se leen aquí: la semana empieza en lunes. */
export const DIAS = [1, 2, 3, 4, 5, 6, 7] as const;
/** La letra de cada día en español: L M X J V S D (la X es de miércoles, para
    no tener dos emes). */
const LETRA_DIA = ["", "L", "M", "X", "J", "V", "S", "D"];
/** El nombre entero, que pasa por `t()` al pintarlo. */
export const NOMBRE_DIA = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

type Traducir = (clave: string, datos?: Record<string, string | number>) => string;

/** La letra del botón de un día. En otro idioma es la inicial de su nombre
    traducido: una clave de una sola letra en el diccionario («M» → «T») le
    cambiaría el texto a cualquier otra «M» de la app. */
export function letraDia(d: number, t: Traducir): string {
  const nombre = t(NOMBRE_DIA[d]);
  return nombre === NOMBRE_DIA[d] ? LETRA_DIA[d] : nombre.charAt(0).toUpperCase();
}

const HORA_MS = 3_600_000;

/** «2026-10-12», en hora local: lo mismo que apunta Rust en `ultimoDia`. */
export function fechaLocal(d: Date): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** 1 lunes … 7 domingo, que no es como cuenta `Date` (0 domingo). */
export function diaDe(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}

function minutosDe(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2])];
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/**
 * Cuándo se lanzará la próxima vez, o `null` si no se va a lanzar (apagado,
 * cortado o con un horario que no se entiende).
 *
 * Una fecha ya pasada quiere decir «en cuanto el reloj dé la vuelta»: es el
 * caso de encender el PC el lunes a las 11 con un encargo de las 9.
 */
export function proximaVez(e: Programado, ahora: Date): Date | null {
  if (!e.activo || e.cortado) return null;
  if (e.cuando.tipo === "cada") {
    return new Date(Math.max(e.ultima, e.creado) + Math.max(1, e.cuando.horas) * HORA_MS);
  }
  const minutos = minutosDe(e.cuando.hora);
  if (minutos === null || !e.cuando.dias.length) return null;
  for (let salto = 0; salto <= 7; salto++) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + salto, Math.floor(minutos / 60), minutos % 60);
    if (!e.cuando.dias.includes(diaDe(d))) continue;
    // Hoy solo vale si hoy todavía no se ha lanzado.
    if (salto === 0 && e.ultimoDia === fechaLocal(ahora)) continue;
    return d;
  }
  return null;
}

/** «Los lunes a las 09:00», «L, X y V a las 09:00», «Cada 6 horas». */
export function cuandoEnTexto(c: Cuando, t: Traducir): string {
  if (c.tipo === "cada") return c.horas === 1 ? t("Cada hora") : t("Cada {n} horas", { n: c.horas });
  const dias = [...new Set(c.dias)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (dias.length === 7) return t("Cada día a las {h}", { h: c.hora });
  if (dias.join() === "1,2,3,4,5") return t("De lunes a viernes a las {h}", { h: c.hora });
  if (dias.length === 1) return t("Los {d} a las {h}", { d: t(NOMBRE_DIA[dias[0]]), h: c.hora });
  const letras = dias.map((d) => letraDia(d, t));
  const lista = `${letras.slice(0, -1).join(", ")} ${t("y")} ${letras[letras.length - 1]}`;
  return t("{d} a las {h}", { d: lista, h: c.hora });
}

/** «ahora», «hoy a las 09:00», «mañana a las 09:00», «el lunes a las 09:00». */
export function cuandoFalta(d: Date, ahora: Date, t: Traducir): string {
  if (d.getTime() <= ahora.getTime()) return t("ahora");
  const dos = (n: number) => String(n).padStart(2, "0");
  const h = `${dos(d.getHours())}:${dos(d.getMinutes())}`;
  const dias = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime()) /
      86_400_000,
  );
  if (dias === 0) return t("hoy a las {h}", { h });
  if (dias === 1) return t("mañana a las {h}", { h });
  return t("el {d} a las {h}", { d: t(NOMBRE_DIA[diaDe(d)]), h });
}

/** Lo que se está escribiendo en el formulario. */
export interface Borrador {
  id?: string;
  nombre: string;
  encargo: string;
  cwd: string;
  tipo: "semanal" | "cada";
  dias: number[];
  hora: string;
  horas: number;
}

export function borradorDe(e: Programado | null, cwd: string): Borrador {
  if (!e) return { nombre: "", encargo: "", cwd, tipo: "semanal", dias: [1], hora: "09:00", horas: 24 };
  const semanal = e.cuando.tipo === "semanal" ? e.cuando : null;
  return {
    id: e.id,
    nombre: e.nombre,
    encargo: e.encargo,
    cwd: e.cwd,
    tipo: e.cuando.tipo,
    dias: semanal ? [...semanal.dias] : [1],
    hora: semanal ? semanal.hora : "09:00",
    horas: e.cuando.tipo === "cada" ? e.cuando.horas : 24,
  };
}

/** Qué le falta al borrador para poder guardarse, o `null` si está bien. Rust
    lo vuelve a comprobar: esto es para no dejar pulsar el botón en balde. */
export function faltaEn(b: Borrador): string | null {
  if (!b.encargo.trim()) return "Escribe qué tiene que hacer.";
  if (!b.cwd.trim()) return "Elige el proyecto donde se abre.";
  if (b.tipo === "semanal") {
    if (!b.dias.length) return "Elige al menos un día.";
    if (minutosDe(b.hora) === null) return "Pon una hora.";
  } else if (!Number.isInteger(b.horas) || b.horas < 1 || b.horas > 168) {
    return "Las horas van de 1 a 168.";
  }
  return null;
}

export function pedidoDe(b: Borrador): PedidoProgramado {
  return {
    id: b.id,
    nombre: b.nombre.trim(),
    encargo: b.encargo.trim(),
    cwd: b.cwd,
    cuando:
      b.tipo === "semanal"
        ? { tipo: "semanal", dias: [...b.dias].sort((a, c) => a - c), hora: b.hora }
        : { tipo: "cada", horas: b.horas },
  };
}

/** Cuántos están parados por el freno: lo que la portada de la Agenda avisa. */
export function cortados(es: Programado[]): number {
  return es.filter((e) => e.cortado).length;
}

/** El que se lanza antes, para el pie de la cifra de la portada. */
export function elSiguiente(es: Programado[], ahora: Date): { e: Programado; cuando: Date } | null {
  let mejor: { e: Programado; cuando: Date } | null = null;
  for (const e of es) {
    const cuando = proximaVez(e, ahora);
    if (cuando && (!mejor || cuando.getTime() < mejor.cuando.getTime())) mejor = { e, cuando };
  }
  return mejor;
}
