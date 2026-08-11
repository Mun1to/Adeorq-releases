import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// Los objetivos del día. Viven en un markdown por día dentro de la carpeta de
// Adeorq (ver `goals.rs`), no en localStorage, para que un agente pueda tachar
// uno cuando termina lo que le pediste.

export interface Goal {
  /** Posición dentro del día. Se manda de vuelta junto al texto: si el archivo
      cambió por detrás y ahí hay otra cosa, Rust no toca nada. */
  idx: number;
  text: string;
  done: boolean;
}

export interface GoalDay {
  date: string;
  goals: Goal[];
  /** La ruta del archivo, para poder enseñarla y abrirla por fuera. */
  path: string;
}

/** AAAA-MM-DD en la hora LOCAL. `toISOString()` da UTC, y a partir de las dos
    de la madrugada en España eso es el día de ayer: los objetivos de hoy
    saldrían vacíos justo cuando Munir está trabajando de noche. */
export function hoy(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function goalsRead(date: string): Promise<GoalDay> {
  return invoke("goals_read", { date });
}

/** Un día del mes visto desde el calendario: sin el texto, solo el recuento. */
export interface GoalCount {
  date: string;
  total: number;
  done: number;
}

/** Los días de un mes ("AAAA-MM") que tuvieron objetivos. Una sola llamada. */
export function goalsMonth(month: string): Promise<GoalCount[]> {
  return invoke("goals_month", { month });
}

export function goalsAdd(date: string, text: string): Promise<GoalDay> {
  return invoke("goals_add", { date, text });
}

export function goalsToggle(date: string, g: Goal): Promise<GoalDay> {
  return invoke("goals_toggle", { date, idx: g.idx, text: g.text });
}

export function goalsRemove(date: string, g: Goal): Promise<GoalDay> {
  return invoke("goals_remove", { date, idx: g.idx, text: g.text });
}

/** Lo que quedó sin tachar el último día que hubo objetivos antes de este, o
    `null` si no hay nada pendiente detrás. Ver `goals_pending_before`. */
export function goalsPendingBefore(date: string): Promise<GoalDay | null> {
  return invoke("goals_pending_before", { date });
}

/** Trae a `to` los pendientes de `from`, sin repetir los que ya estén. */
export function goalsCarry(from: string, to: string): Promise<GoalDay> {
  return invoke("goals_carry", { from, to });
}

/** «miércoles», «ayer»: cómo se nombra un día que ya pasó. Se dice con
    palabras porque «2026-08-05» no le dice a nadie cuánto hace de eso. */
export function diaCorto(date: string, lang: string, ayerTxt: string): string {
  const [a, m, d] = date.split("-").map(Number);
  const cuando = new Date(a, m - 1, d);
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  if (hoy(cuando) === hoy(ayer)) return ayerTxt;
  return cuando.toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/* --------------------------------------------------------------------------
   El día de hoy, leído UNA vez para toda la ventana.

   La lista y el contador del panel flotante son dos sitios que enseñan lo
   mismo, y cada uno se leía el archivo por su cuenta con su propio reloj: dos
   lecturas cada veinte segundos, y un contador que podía ir un rato por detrás
   de la lista que tiene justo encima. Ahora hay un solo lector y todos los que
   miran reciben lo mismo a la vez.

   El reloj sigue haciendo falta porque el que escribe puede no ser Munir: si
   un agente tacha un objetivo al terminar, tiene que verse sin recargar nada.
   -------------------------------------------------------------------------- */

let cache: GoalDay | null = null;
const oyentes = new Set<(d: GoalDay) => void>();
let reloj: number | undefined;

/** Cada cuánto se relee el archivo. */
const MIRAR_CADA_MS = 20_000;

/** Reparte un día recién leído (o el que devuelve una escritura) a todos. */
export function aplicarDia(d: GoalDay): void {
  cache = d;
  for (const f of oyentes) f(d);
}

export function releerDia(): void {
  void goalsRead(hoy()).then(aplicarDia).catch(() => {});
}

/** El día de hoy, ya leído. `null` solo antes de la primera respuesta. */
export function useDiaDeHoy(): GoalDay | null {
  const [dia, setDia] = useState<GoalDay | null>(cache);
  useEffect(() => {
    oyentes.add(setDia);
    // Siempre se relee al montar: el panel puede llevar horas cerrado.
    releerDia();
    if (reloj === undefined) reloj = window.setInterval(releerDia, MIRAR_CADA_MS);
    return () => {
      oyentes.delete(setDia);
      // El último que se va apaga el reloj: sin nadie mirando, releer un
      // archivo cada veinte segundos es trabajo que no ve ninguna persona.
      if (oyentes.size === 0 && reloj !== undefined) {
        clearInterval(reloj);
        reloj = undefined;
      }
    };
  }, []);
  return dia;
}
