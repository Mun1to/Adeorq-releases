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

import { accountReady, detectClis, mainAccount, memoriaReglasRouter, planInfo, type Account, type Limits } from "./pty";
import { reglasDe, type ReglaRouter } from "./reglasRouter";

/* Las reglas del router que hay en la memoria de la casa, leídas de Rust y
   entendidas aquí (`reglasRouter.ts`). Un minuto de caché: el router se llama
   varias veces seguidas al repartir, y las notas no cambian a ese ritmo. Sin
   Rust (el banco, un fallo del índice) no hay reglas, y el router sigue igual.

   Y CON RELOJ. Una orden de Rust que se cae a medias no contesta ni bien ni
   mal: la promesa se queda abierta para siempre, y un `catch` no la ve. Esto
   lo esperan el Capataz, el Reparto y el chat antes de decidir nada, así que
   el día que el lector se cayó con una tilde (2026-10-13) los tres se quedaron
   en «Escribiendo…» sin fin. Las reglas afinan la decisión, no la sostienen:
   si no llegan a tiempo se sigue sin ellas, y no se guarda ese vacío para que
   la próxima vez se vuelva a preguntar. */
const ESPERA_REGLAS_MS = 3000;
let reglasCache: { cuando: number; reglas: ReglaRouter[] } | null = null;
export async function reglasDeLaMemoria(): Promise<ReglaRouter[]> {
  if (reglasCache && Date.now() - reglasCache.cuando < 60_000) return reglasCache.reglas;
  const crudas = await conReloj(memoriaReglasRouter().catch(() => null), ESPERA_REGLAS_MS);
  if (!crudas) return reglasCache?.reglas ?? [];
  const reglas = crudas.flatMap((r) => reglasDe(r.linea, r.nota));
  reglasCache = { cuando: Date.now(), reglas };
  return reglas;
}

/** Lo que devuelva la promesa, o `null` si tarda más de `ms`. */
export function conReloj<T>(promesa: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((ok) => {
    const reloj = setTimeout(() => ok(null), ms);
    void promesa.then((v) => {
      clearTimeout(reloj);
      ok(v);
    });
  });
}
import { enCache, limitesDe, partesDe, type Partes } from "./cuota";
import { PROVIDERS, providerOf, sabe } from "./providers";
import { elegirCuenta, enCuanto, parada, type CuentaViva } from "./router";

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
const cuotas = new Map<string, Sello<Partes>>();
/** El plan contratado. Se lee del propio archivo de credenciales, así que
    cambia cuando cambias de plan y no antes: media hora es de sobra. */
const planes = new Map<string, Sello<string>>();
const VIDA_PLAN = 30 * 60 * 1000;

function fresco<T>(s: Sello<T> | null | undefined, vida: number): s is Sello<T> {
  return !!s && Date.now() - s.cuando < vida;
}

/**
 * Lo que sabe el sondeo de cuota, para el router.
 *
 * `AvisoCuota` sondea las cuentas de Claude cada veinte minutos mientras hay
 * agentes trabajando; desde el 2026-10-19 ya no avisa de nada y existe solo
 * para esto. Así el router tiene el número a mano en vez de preguntarlo él al
 * decidir, que es un proceso `claude` de cinco segundos por cuenta.
 */
export function anotarCuota(cuentaId: string, l: Limits): void {
  cuotas.set(cuentaId, { valor: partesDe(l), cuando: Date.now() });
}

/** La semana, cuándo se renueva y el tope de 5 horas, como los pide `CuentaViva`. */
function deCuota(p: Partes | undefined): Pick<CuentaViva, "gastado" | "renueva" | "periodo" | "sesion" | "sesionRenueva"> {
  return { gastado: p?.semanal, renueva: p?.renueva, periodo: p?.periodo, sesion: p?.sesion, sesionRenueva: p?.sesionRenueva };
}

/**
 * Las cuentas que Munir añadió MÁS la principal de cada CLI, que no está en
 * su lista porque no se añade: es la carpeta de siempre. Sin esto `get_usage`
 * no la enseñaba y `open_pane` no podía elegirla (2026-11-02). Igual que hace
 * `lanzarEnLienzo` al arrastrar una tarjeta.
 */
export function conLasPrincipales(lista: Account[]): Account[] {
  const mains = PROVIDERS.map((p) => mainAccount(p.id));
  return [...mains, ...lista.filter((a) => !mains.some((m) => m.id === a.id))];
}

/** Lo que se sepa ahora mismo, sin esperar a nada. Para pintar sin parpadeo. */
export function mundoEnCache(cuentas: Account[]): CuentaViva[] {
  return cuentas.map((cuenta) => ({
    cuenta,
    instalado: programas ? programas.valor.has(cuenta.provider) : true,
    conectada: conectadas.get(cuenta.id)?.valor ?? true,
    // Si el router aún no la anotó, la última lectura guardada (`cuota.ts`, que
    // sobrevive al arranque): sin esto, un `get_usage` que no esperaba a la
    // consulta entera decía «sin dato» de cuentas que sí lo tenían (2026-11-02).
    ...deCuota(cuotas.get(cuenta.id)?.valor ?? guardada(cuenta)),
    plan: planes.get(cuenta.id)?.valor,
  }));
}

function guardada(cuenta: Account): Partes | undefined {
  const l = enCache({ provider: cuenta.provider, dir: cuenta.dir });
  return l ? partesDe(l.limits) : undefined;
}

/** Cuándo se leyó por última vez la cuota de esa cuenta, la anote quien la
    anote: lo que se abrió en ella después aún no sale en el número. */
export function leidaEn(cuenta: Account): number | undefined {
  const a = cuotas.get(cuenta.id)?.cuando;
  const b = enCache({ provider: cuenta.provider, dir: cuenta.dir })?.at;
  return a == null ? b : b == null ? a : Math.max(a, b);
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
  // Primero, si tienen la sesión iniciada, TODAS a la vez: es mirar unos
  // archivos, milisegundos, y la cuota de una sola cuenta son cinco segundos.
  // Yendo cuenta a cuenta, quien no espera (`fotoRapida`) veía «conectada» una
  // que aún nadie había mirado, y una sin sesión ganaba por no tener gasto
  // (revisión de la 0.9.239, `mundo-frio-check`).
  await Promise.all(
    cuentas.map(async (cuenta) => {
      if (fresco(conectadas.get(cuenta.id), VIDA_CONECTADA)) return;
      const p = providerOf(cuenta.provider);
      // Sin archivos de credenciales conocidos no se puede comprobar, y ahí la
      // casa ya decidió (ver `providers.ts`) que se dice lo que se sabe en vez
      // de adivinar: se da por conectada, que es lo que el usuario ve.
      const conectada = p.creds.length
        ? await accountReady(cuenta.dir, p.creds, p.homeDir, p.envEsCasa).catch(() => false)
        : true;
      conectadas.set(cuenta.id, { valor: conectada, cuando: Date.now() });
    }),
  );

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
    const conectada = conectadas.get(cuenta.id)?.valor ?? false;

    let cuota = cuotas.get(cuenta.id)?.valor;
    if (instalado && conectada && p.usage && !fresco(cuotas.get(cuenta.id), VIDA_CUOTA)) {
      // Por el portero, que puede tener la respuesta ya leída por el aviso de
      // cuota o por el panel de uso. Antes cada uno lanzaba su propio proceso
      // `claude` de cinco segundos para enterarse de lo mismo.
      const l = await limitesDe(cuenta).catch(() => null);
      if (l) {
        anotarCuota(cuenta.id, l);
        cuota = cuotas.get(cuenta.id)?.valor;
      }
    }

    // Qué plan tiene contratado esa cuenta. Sale del mismo archivo que ya se
    // mira para saber si ha iniciado sesión, así que no cuesta ni un proceso
    // más; hasta ahora solo se pintaba en Cuentas y quien decidía no lo veía.
    // Solo para quien deja su plan en disco (Claude): `planInfo` lee el
    // `.credentials.json` de Claude, y con la principal de Copilot (carpeta
    // vacía) leía la de Claude y le ponía «plan max» (2026-11-02).
    let plan = planes.get(cuenta.id)?.valor;
    if (instalado && conectada && sabe(cuenta.provider, "estadisticas") && !fresco(planes.get(cuenta.id), VIDA_PLAN)) {
      const info = await planInfo(cuenta.dir || undefined).catch(() => null);
      if (info) {
        plan = info.subscription || info.tier;
        planes.set(cuenta.id, { valor: plan, cuando: Date.now() });
      }
    }

    vivas.push({ cuenta, instalado, conectada, ...deCuota(cuota), plan });
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
export function parteDelEquipo(vivas: CuentaViva[], ahora = Date.now()): string {
  const l: string[] = [];
  const listas = vivas.filter((v) => v.instalado && v.conectada);
  const dormidas = vivas.filter((v) => v.instalado && !v.conectada);

  l.push("## Con qué cuentas cuenta hoy");
  if (!listas.length) l.push("- Ninguna lista: o no hay CLI instalado o nadie ha iniciado sesión.");
  for (const v of listas) {
    const p = providerOf(v.cuenta.provider);
    const trozos = [`- ${p.label} · «${v.cuenta.label}»`];
    if (v.plan) trozos.push(`plan ${v.plan}`);
    const periodo = v.periodo ?? "semana";
    const renovada = !!v.renueva && v.renueva <= ahora;
    if (renovada) {
      // No «a cero»: si no se pudo volver a leer, puede ir ya por el 98 %.
      trozos.push(`su última lectura es de antes de que se renovara su ${periodo}: no se sabe cuánto lleva (se cuenta como 50 %)`);
    } else if (v.gastado !== undefined) {
      trozos.push(`lleva gastado el ${Math.round(v.gastado)} % de su ${periodo}`);
      if (v.gastado >= 92) trozos.push("⚠ AGOTADA: no le mandes nada que pueda esperar");
      else if (v.gastado >= 78) trozos.push("⚠ apretada: gástala solo en lo que lo merezca");
    } else {
      // Y se dice, en vez de callarlo: un hueco leído como «cero» haría que el
      // Capataz recomendara vaciar una cuenta que a lo mejor está en las últimas.
      trozos.push("no publica cuánto lleva gastado, así que se trata como disponible SIN saberlo");
    }
    if (!renovada) {
      trozos.push(
        v.renueva
          ? `se renueva ${cuandoEnPalabras(v.renueva, ahora)}`
          : "no dice cuándo se renueva (se cuenta como 7 días)",
      );
    }
    // El tope de 5 horas va APARTE: no se pierde nada por no usarlo, solo dice
    // si ahora mismo la cuenta puede trabajar.
    if (parada(v, ahora)) {
      trozos.push(
        `⛔ PARADA ahora por su tope de 5 horas${v.sesionRenueva ? `, vuelve ${cuandoEnPalabras(v.sesionRenueva, ahora)}` : ""}`,
      );
    } else if (v.sesion != null && v.sesion >= 80) {
      trozos.push(`su tope de 5 horas va por el ${Math.round(v.sesion)} %`);
    }
    l.push(trozos.join(" · "));
  }
  if (dormidas.length) {
    l.push("");
    l.push("## Instaladas y sin usar (cuota pagada que se está tirando)");
    for (const v of dormidas) {
      l.push(`- ${providerOf(v.cuenta.provider).label} · «${v.cuenta.label}» está instalado y sin sesión iniciada.`);
    }
  }

  // A qué cuenta va la siguiente terminal de cada CLI, con la MISMA regla que
  // usa `open_pane` sin `account` (`elegirCuenta`): así lo que lee el agente y
  // lo que pasa al abrir no se contradicen.
  const clis = [...new Set(listas.map((v) => v.cuenta.provider))];
  if (clis.length) {
    l.push("");
    l.push("## A qué cuenta va la siguiente terminal (open_pane sin `account`)");
    for (const cli of clis) {
      const e = elegirCuenta(listas.filter((v) => v.cuenta.provider === cli), ahora);
      if (e) l.push(`- ${providerOf(cli).label} → «${e.viva.cuenta.label}». ${e.porque}`);
    }
  }

  l.push("");
  l.push("## Cómo se reparte bien");
  l.push("- Las unidades NO son comparables entre sí: Claude cuenta horas de modelo, Codex cuenta mensajes y Antigravity créditos. Compara el % de cada una consigo misma, nunca una contra otra.");
  l.push("- Reparto sano: el modelo pequeño hace los recados (renombrar, traducir, formatear, buscar dónde está algo), el mediano hace el grueso del trabajo, y el grande se guarda para lo que sale caro si se equivoca SIN QUE SE NOTE: auditorías, seguridad, arquitectura, revisar a otro.");
  l.push("- Que una tarea sea LARGA no la hace difícil. Lo que sube el cerebro es la consecuencia de equivocarse, no el tamaño.");
  l.push("- Lo que una cuenta no gasta antes de renovarse se pierde: manda la que más perdería, (100 − % gastado) / días hasta renovarse. open_pane sin `account` ya la elige sola; pasa `account` solo si tienes un motivo.");
  return l.join("\n");
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/**
 * «en 2 días, el miércoles a las 8:00», «en 5 h, hoy a las 14:30»: cuándo
 * vuelve a cero, dicho para quien no tiene el calendario delante. Con la hora
 * de esta máquina, que es la de Munir.
 */
export function cuandoEnPalabras(ms: number, ahora = Date.now()): string {
  const f = new Date(ms);
  const hoy = new Date(ahora);
  const dias = Math.round(
    (new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime() -
      new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()) /
      86_400_000,
  );
  const hora = `${f.getHours()}:${String(f.getMinutes()).padStart(2, "0")}`;
  const dia =
    dias === 0 ? "hoy" : dias === 1 ? "mañana" : dias < 7 ? `el ${DIAS_SEMANA[f.getDay()]}` : `el ${f.getDate()}/${f.getMonth() + 1}`;
  return `${enCuanto(ms, ahora)}, ${dia} a las ${hora}`;
}
