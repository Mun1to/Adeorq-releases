// El ÚNICO sitio por donde se pregunta cuánta cuota le queda a una cuenta.
//
// Preguntarlo no gasta tokens (`/usage` es un comando local del CLI), pero
// cuesta un PROCESO: Adeorq lanza un `claude` entero, que arranca Node y tarda
// unos cinco segundos y medio, medido el 2026-08-07 sobre las cuentas de esta
// máquina. Y había tres sitios preguntando por su cuenta, cada uno con su
// reloj: el aviso de cuota (cada 20 min, todas las cuentas), el panel de uso
// (cada 10 min, la que estés mirando) y el router (al recomendar cerebro).
// Con dos cuentas eso son cuatro o cinco arranques cada veinte minutos, cada
// uno un tirón de disco y CPU de varios segundos.
//
// Aquí se juntan los tres. Dos reglas y ya:
//
//   1. Una lectura reciente vale para todos. Nadie vuelve a preguntar por una
//      cuenta que se leyó hace un momento.
//   2. Dos preguntas a la vez por la misma cuenta son UNA. La segunda se
//      engancha a la que ya está en vuelo en vez de lanzar otro proceso.
//
// Lo leído sobrevive al arranque en `localStorage`, así que el panel pinta
// números de verdad desde el primer instante en vez de tres huecos.

import { usageLimits, type Limits } from "./pty";

export interface Lectura {
  /** Cuándo se leyó, en milisegundos. */
  at: number;
  limits: Limits;
}

/** Cuánto vale una lectura antes de volver a preguntar. Nueve minutos: por
    debajo del reloj más corto que había (el panel de uso, diez), así que quien
    refresque encontrará algo fresco casi siempre sin que el dato envejezca. */
export const VIDA_MS = 9 * 60 * 1000;

const CLAVE = "adeorq-cuota";

/** La cuenta de siempre no tiene carpeta propia, así que su clave es "". */
const memoria = new Map<string, Lectura>();
const enVuelo = new Map<string, Promise<Limits>>();

function cargar(): void {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE) ?? "{}") as Record<string, Lectura>;
    for (const [dir, l] of Object.entries(crudo)) {
      if (l && typeof l.at === "number" && l.limits?.lines) memoria.set(dir, l);
    }
  } catch {
    // Un archivo de estado ilegible no puede impedir arrancar: se empieza de cero.
  }
}
cargar();

function guardar(): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(Object.fromEntries(memoria)));
  } catch {
    // Sin sitio para guardar se sigue igual: esto es una caché, no un dato.
  }
}

/** Lo último que se sabe de esa cuenta, sin preguntar nada ni esperar. */
export function enCache(dir: string): Lectura | null {
  return memoria.get(dir) ?? null;
}

/** Si lo que hay guardado sigue valiendo. */
export function esFresca(dir: string, vida = VIDA_MS): boolean {
  const l = memoria.get(dir);
  return !!l && Date.now() - l.at < vida;
}

/**
 * La cuota de una cuenta. `dir` es su carpeta de configuración, vacío para la
 * de siempre.
 *
 * - `vida`: cuánto se acepta una lectura guardada. Con `0` se pregunta seguro.
 * - Dos llamadas a la vez para la misma cuenta comparten un solo proceso.
 */
export function limitesDe(dir: string, vida = VIDA_MS): Promise<Limits> {
  const guardado = memoria.get(dir);
  if (guardado && Date.now() - guardado.at < vida) {
    return Promise.resolve(guardado.limits);
  }
  const yendo = enVuelo.get(dir);
  if (yendo) return yendo;

  const p = usageLimits(dir || undefined)
    .then((limits) => {
      memoria.set(dir, { at: Date.now(), limits });
      guardar();
      return limits;
    })
    .finally(() => {
      enVuelo.delete(dir);
    });
  enVuelo.set(dir, p);
  return p;
}

/** De todas sus líneas, el porcentaje que de verdad te para.
 *
 * Da igual que la semana vaya holgada si la sesión está al 97%. Vive aquí
 * porque el aviso y el router hacían esta misma cuenta cada uno por su lado y
 * tenían que dar lo mismo siempre. */
export function loQueTePara(l: Limits): { percent: number; resets: string } {
  return l.lines.reduce(
    (max, x) => (x.percent > max.percent ? { percent: x.percent, resets: x.resets } : max),
    { percent: 0, resets: "" },
  );
}
