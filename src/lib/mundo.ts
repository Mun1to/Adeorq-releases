// Qué hay disponible AHORA: qué CLIs están instalados, qué cuentas han
// iniciado sesión y cuánta semana le queda a cada una.
//
// Es lo que el router necesita saber y el modelo no puede: son datos del
// equipo de Munir, cambian cada hora y preguntarlos cuesta procesos, no
// tokens. Vive aparte de `router.ts` a propósito, para que la pieza que DECIDE
// siga siendo una función pura a la que se le puede pasar un mundo inventado y
// comprobar qué contesta.
//
// Nada de esto gasta cuota: `detect_clis` mira el PATH, `account_ready` mira
// si existen unos archivos, y `usage_limits` lanza `/usage`, que es un comando
// local del CLI y no llega a hacer un turno de modelo (ver el comentario de
// `usage_limits` en Rust). Lo que sí cuesta es un proceso por cuenta, y por eso
// hay caché y por eso la comparte con el aviso de cuota, que ya sondeaba solo
// cada veinte minutos: lo normal es que el dato ya esté cuando se pregunte.

import { accountReady, detectClis, planInfo, usageLimits, type Account } from "./pty";
import { PROVIDERS, providerOf } from "./providers";
import type { CuentaViva } from "./router";

/** Los CLIs del equipo cambian cuando instalas uno, o sea casi nunca. */
const VIDA_PROGRAMAS = 5 * 60 * 1000;
/** El login tampoco se va solo, pero caducar antes cuesta poco. */
const VIDA_CONECTADA = 5 * 60 * 1000;
/**
 * La cuota sí se mueve mientras trabajas, pero no tan deprisa como para pagar
 * un proceso por cuenta cada vez que se escribe un encargo. Diez minutos es
 * más fino que los veinte del aviso y sigue siendo casi siempre un acierto de
 * caché, porque el aviso la va refrescando por su cuenta.
 */
const VIDA_CUOTA = 10 * 60 * 1000;

interface Sello<T> {
  valor: T;
  cuando: number;
}

let programas: Sello<Set<string>> | null = null;
const conectadas = new Map<string, Sello<boolean>>();
const cuotas = new Map<string, Sello<number>>();
/** El plan contratado. Se lee del propio archivo de credenciales, así que
    cambia cuando cambias de plan y no antes: media hora es de sobra. */
const planes = new Map<string, Sello<string>>();
const VIDA_PLAN = 30 * 60 * 1000;

function fresco<T>(s: Sello<T> | null | undefined, vida: number): s is Sello<T> {
  return !!s && Date.now() - s.cuando < vida;
}

/**
 * Lo que el aviso de cuota ya sabe, regalado al router.
 *
 * `AvisoCuota` sondea las cuentas de Claude cada veinte minutos porque tiene
 * que hacerlo de todas formas. Sin esta línea, el router repetiría exactamente
 * el mismo trabajo un minuto después para enterarse de lo mismo.
 */
export function anotarCuota(cuentaId: string, gastado: number): void {
  cuotas.set(cuentaId, { valor: gastado, cuando: Date.now() });
}

/** Lo que se sepa ahora mismo, sin esperar a nada. Para pintar sin parpadeo. */
export function mundoEnCache(cuentas: Account[]): CuentaViva[] {
  return cuentas.map((cuenta) => ({
    cuenta,
    instalado: programas ? programas.valor.has(cuenta.provider) : true,
    conectada: conectadas.get(cuenta.id)?.valor ?? true,
    gastado: cuotas.get(cuenta.id)?.valor,
    plan: planes.get(cuenta.id)?.valor,
  }));
}

/**
 * Mira de verdad, refrescando solo lo que haya caducado.
 *
 * Se lanza EN PARALELO con la llamada que escribe el encargo, que tarda varios
 * segundos: cuando vuelve el texto, esto ya terminó y la recomendación sale
 * con datos de hace un momento sin que nadie haya esperado por ella.
 */
/**
 * La foto para quien no puede esperar.
 *
 * `mirarMundo` con la caché caliente contesta al instante, pero en frío lanza
 * un `/usage` por cuenta y eso son segundos. Arrastrar una tarjeta del tablero
 * a «Trabajando» tiene que responder YA: aquí se devuelve lo que haya a los
 * `msMax`, y la consulta de verdad sigue corriendo por detrás dejando la caché
 * lista para la siguiente. Peor decisión durante un segundo que una terminal
 * que tarda tres en aparecer.
 */
export function fotoRapida(cuentas: Account[], msMax = 1200): Promise<CuentaViva[]> {
  const real = mirarMundo(cuentas).catch(() => mundoEnCache(cuentas));
  const reloj = new Promise<CuentaViva[]>((listo) => {
    setTimeout(() => listo(mundoEnCache(cuentas)), msMax);
  });
  return Promise.race([real, reloj]);
}

export async function mirarMundo(cuentas: Account[]): Promise<CuentaViva[]> {
  if (!fresco(programas, VIDA_PROGRAMAS)) {
    const found = await detectClis(
      PROVIDERS.map((p) => [p.id, p.exe] as [string, string]),
    ).catch(() => null);
    // Si la detección falla se conserva lo anterior: dar por desinstalado todo
    // haría que el router dijera "no tienes nada conectado", que es peor
    // consejo que el que daba antes de preguntar.
    if (found) programas = { valor: new Set(found.map((f) => f.id)), cuando: Date.now() };
  }
  const hay = programas?.valor ?? new Set(cuentas.map((c) => c.provider));

  const vivas: CuentaViva[] = [];
  for (const cuenta of cuentas) {
    const p = providerOf(cuenta.provider);
    const instalado = hay.has(cuenta.provider);

    let conectada = conectadas.get(cuenta.id)?.valor ?? false;
    if (instalado && !fresco(conectadas.get(cuenta.id), VIDA_CONECTADA)) {
      // Sin archivos de credenciales conocidos no se puede comprobar, y ahí la
      // casa ya decidió (ver `providers.ts`) que se dice lo que se sabe en vez
      // de adivinar: se da por conectada, que es lo que el usuario ve.
      conectada = p.creds.length
        ? await accountReady(cuenta.dir, p.creds, p.homeDir).catch(() => false)
        : true;
      conectadas.set(cuenta.id, { valor: conectada, cuando: Date.now() });
    }

    let gastado = cuotas.get(cuenta.id)?.valor;
    if (instalado && conectada && p.usage && !fresco(cuotas.get(cuenta.id), VIDA_CUOTA)) {
      const l = await usageLimits(cuenta.dir || undefined).catch(() => null);
      if (l) {
        // Manda la línea más alta, igual que en el aviso: da igual que la
        // semana vaya holgada si la sesión está al 97 %, porque es la que para.
        gastado = l.lines.reduce((max, x) => (x.percent > max ? x.percent : max), 0);
        anotarCuota(cuenta.id, gastado);
      }
    }

    // Qué plan tiene contratado esa cuenta. Sale del mismo archivo que ya se
    // mira para saber si ha iniciado sesión, así que no cuesta ni un proceso
    // más; hasta ahora solo se pintaba en Cuentas y quien decidía no lo veía.
    let plan = planes.get(cuenta.id)?.valor;
    if (instalado && conectada && p.usage && !fresco(planes.get(cuenta.id), VIDA_PLAN)) {
      const info = await planInfo(cuenta.dir || undefined).catch(() => null);
      if (info) {
        plan = info.subscription || info.tier;
        planes.set(cuenta.id, { valor: plan, cuando: Date.now() });
      }
    }

    vivas.push({ cuenta, instalado, conectada, gastado, plan });
  }
  return vivas;
}
