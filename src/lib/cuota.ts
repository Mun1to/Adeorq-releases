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

import { usageLimits, usageOf, type Limits } from "./pty";
import { sabe } from "./providers";

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

/**
 * La clave de una cuenta: su cliente y su carpeta.
 *
 * Era solo la carpeta, y con un solo cliente eso bastaba. Con dos ya no: la
 * cuenta de siempre de Claude y la de siempre de Codex tienen las DOS la
 * carpeta vacía, así que compartían casilla y la cuota de una se pintaba bajo
 * el nombre de la otra (2026-08-24, al encender Codex).
 */
export function claveDe(cuenta: Cuenta): string {
  return `${cuenta.provider}|${cuenta.dir}`;
}

/** Lo que hace falta saber de una cuenta para preguntarle su cuota. */
export interface Cuenta {
  provider: string;
  /** Su carpeta de configuración; vacía es la de siempre de ese cliente. */
  dir: string;
}

const memoria = new Map<string, Lectura>();
const enVuelo = new Map<string, Promise<Limits>>();

function cargar(): void {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE) ?? "{}") as Record<string, Lectura>;
    for (const [clave, l] of Object.entries(crudo)) {
      // Las de antes del 2026-08-24 eran solo la carpeta, sin cliente delante.
      // No se pueden atribuir a nadie, así que se tiran: preguntar otra vez
      // cuesta unos segundos y darle a una cuenta la cuota de otra no tiene
      // arreglo una vez pintado.
      if (!clave.includes("|")) continue;
      if (l && typeof l.at === "number" && l.limits?.lines) memoria.set(clave, l);
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
export function enCache(cuenta: Cuenta): Lectura | null {
  return memoria.get(claveDe(cuenta)) ?? null;
}

/**
 * La cuota de una cuenta.
 *
 * - `vida`: cuánto se acepta una lectura guardada. Con `0` se pregunta seguro.
 * - Dos llamadas a la vez para la misma cuenta comparten un solo proceso.
 *
 * Cada cliente la publica a su manera y eso se decide AQUÍ, no en quien
 * pregunta: Claude hay que preguntársela (un proceso de cinco segundos que no
 * gasta cuota) y Codex ya la tiene escrita en su rastro (gratis del todo). Un
 * cliente que no la publique falla con esas palabras, que es información y no
 * un error a esconder.
 */
export function limitesDe(cuenta: Cuenta, vida = VIDA_MS): Promise<Limits> {
  const clave = claveDe(cuenta);
  const guardado = memoria.get(clave);
  if (guardado && Date.now() - guardado.at < vida) {
    return Promise.resolve(guardado.limits);
  }
  const yendo = enVuelo.get(clave);
  if (yendo) return yendo;

  if (!sabe(cuenta.provider, "usage")) {
    return Promise.reject(new Error(`${cuenta.provider} no publica su cuota`));
  }
  const pedir =
    cuenta.provider === "claude"
      ? usageLimits(cuenta.dir || undefined)
      : usageOf(cuenta.provider, cuenta.dir || undefined);

  const p = pedir
    .then((limits) => {
      memoria.set(clave, { at: Date.now(), limits });
      guardar();
      return limits;
    })
    .finally(() => {
      enVuelo.delete(clave);
    });
  enVuelo.set(clave, p);
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
