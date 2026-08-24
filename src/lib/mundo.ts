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

import { accountReady, detectClis, planInfo, type Account } from "./pty";
import { limitesDe, loQueTePara } from "./cuota";
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
      // Por el portero, que puede tener la respuesta ya leída por el aviso de
      // cuota o por el panel de uso. Antes cada uno lanzaba su propio proceso
      // `claude` de cinco segundos para enterarse de lo mismo.
      const l = await limitesDe(cuenta).catch(() => null);
      if (l) {
        gastado = loQueTePara(l).percent;
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

/**
 * El parte del equipo, escrito para que lo lea el Capataz.
 *
 * ── POR QUÉ ESTO NO ES UN VOLCADO DE NÚMEROS (2026-08-13) ────────────────────
 *
 * Munir lo pidió así: «que el Capataz siempre sepa cuánto uso tienes en cada
 * cuenta y CÓMO OPTIMIZARLO». Lo segundo no sale de los números solos, porque
 * los números de aquí no se pueden ni sumar:
 *
 *   · Claude Code mide en HORAS de modelo activo (ventana de 5 h + tope semanal).
 *   · Codex mide en MENSAJES (15-80 por ventana de 5 h en Plus), y las tareas
 *     en la nube van por otro contador distinto.
 *   · Antigravity va por créditos con techo semanal, y hoy no publica el gasto.
 *
 * Así que un «te queda un 40 %» a secas mezclaría peras con manzanas. Aquí se
 * dice de cada una lo que de verdad se sabe, y se dice también lo que NO se
 * sabe, que es la mitad del mapa.
 *
 * Y va el consejo de reparto, porque el desperdicio que Munir quiere atacar no
 * es tener poca cuota: es gastar la buena en trabajo que no la necesita, y
 * dejar sin usar cuentas que ya están pagadas.
 */
export function parteDelEquipo(vivas: CuentaViva[]): string {
  const l: string[] = [];
  const listas = vivas.filter((v) => v.instalado && v.conectada);
  const dormidas = vivas.filter((v) => v.instalado && !v.conectada);

  l.push("## Con qué cuentas cuenta hoy");
  if (!listas.length) l.push("- Ninguna lista: o no hay CLI instalado o nadie ha iniciado sesión.");
  for (const v of listas) {
    const p = providerOf(v.cuenta.provider);
    const trozos = [`- ${p.label} · «${v.cuenta.label}»`];
    if (v.plan) trozos.push(`plan ${v.plan}`);
    if (v.gastado !== undefined) {
      trozos.push(`lleva gastado el ${Math.round(v.gastado)} % de su semana`);
      if (v.gastado >= 92) trozos.push("⚠ AGOTADA: no le mandes nada que pueda esperar");
      else if (v.gastado >= 78) trozos.push("⚠ apretada: gástala solo en lo que lo merezca");
    } else {
      // Y se dice, en vez de callarlo: un hueco leído como «cero» haría que el
      // Capataz recomendara vaciar una cuenta que a lo mejor está en las últimas.
      trozos.push("no publica cuánto lleva gastado, así que se trata como disponible SIN saberlo");
    }
    l.push(trozos.join(" · "));
  }
  if (dormidas.length) {
    l.push("");
    l.push("## Instaladas y sin usar (cuota pagada que se está tirando)");
    for (const v of dormidas) {
      l.push(`- ${providerOf(v.cuenta.provider).label} está instalado y sin sesión iniciada.`);
    }
  }

  l.push("");
  l.push("## Cómo se reparte bien");
  l.push("- Las unidades NO son comparables entre sí: Claude cuenta horas de modelo, Codex cuenta mensajes y Antigravity créditos. Compara el % de cada una consigo misma, nunca una contra otra.");
  l.push("- Reparto sano: el modelo pequeño hace los recados (renombrar, traducir, formatear, buscar dónde está algo), el mediano hace el grueso del trabajo, y el grande se guarda para lo que sale caro si se equivoca SIN QUE SE NOTE: auditorías, seguridad, arquitectura, revisar a otro.");
  l.push("- Que una tarea sea LARGA no la hace difícil. Lo que sube el cerebro es la consecuencia de equivocarse, no el tamaño.");
  l.push("- Si hay una cuenta lista y sin gastar, propón repartir hacia ella antes que apretar una que ya va por encima del 78 %.");
  return l.join("\n");
}
