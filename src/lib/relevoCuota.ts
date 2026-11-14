// El relevo por cuota, del lado de la ventana.
//
// Una terminal que abrió un agente y se queda sin cuota en su cuenta sigue sola
// en otra (Munir, 2026-11-14: «que se abra otra terminal en la principal o la
// que tenga cuota para terminar la tarea en el menor tiempo posible»). Lo vigila
// y lo ordena Rust (`mcp/relevo_cuota.rs`): lee el 429 de cuota en su
// transcript, cierra la vieja, muda su conversación a la cuenta nueva y le pide
// aquí dos cosas, por el mismo puente que `open_pane`:
//
//   1. `relevo_cuenta`: a qué cuenta va, con la misma regla que `open_pane` sin
//      `account` (`elegirCuenta`), sin la agotada, y nunca a una sin sitio.
//   2. `relevo_abrir`: abrir la nueva con `--resume` de la misma conversación
//      (o con el acta de `lib/relevo.ts` si no se pudo mudar), y su «sigue».
//
// Las terminales que abrió Munir no pasan por aquí (D8): Rust solo mira las
// delegadas. La lista de las agotadas se queda además en esta página hasta que
// se renuevan: la lectura de cuota tarda (`get_usage` decía «81 %» del tope de
// 5 horas con la terminal 19 ya parada, 2026-11-14), y sin esto el siguiente
// `open_pane` volvía a elegir la cuenta sin cuota.

import { actaDeRelevo } from "./relevo";
import { claudeCommand, comandoDe, withEffort, type PermissionMode } from "./lanzar";
import { cuantoFalta, elegirCuenta, type CuentaViva } from "./router";
import { mainAccount, type Account } from "./pty";
import { sabe } from "./providers";
import { apuntarDelegada, delegadaDe } from "./delegadas";

const MODOS: PermissionMode[] = ["acceptEdits", "auto", "bypassPermissions", "manual", "dontAsk", "plan"];

/** Una cuenta agotada según su propio 429, hasta cuándo, y de qué tope. */
interface Agotada {
  hasta: number;
  tipo?: string;
}
const AGOTADAS = new Map<string, Agotada>();
/** Sin hora de renovación (la nota de recoger no la trae), una hora. */
const SIN_HORA_MS = 3_600_000;

const igual = (a?: string, b?: string) => (a ?? "").replace(/[\\/]+$/, "").toLowerCase() === (b ?? "").replace(/[\\/]+$/, "").toLowerCase();

/** Apunta la cuenta (por su carpeta; vacía, la principal) como agotada. */
export function apuntarAgotada(dir: string, renuevaS: number | null | undefined, tipo: string | null | undefined, ahora = Date.now()): void {
  const hasta = renuevaS ? renuevaS * 1000 : ahora + SIN_HORA_MS;
  if (hasta > ahora) AGOTADAS.set(dir.replace(/[\\/]+$/, "").toLowerCase(), { hasta, tipo: tipo ?? undefined });
}

/** Solo para los bancos. */
export function olvidarAgotadas(): void {
  AGOTADAS.clear();
}

/**
 * Las cuentas como las ve el router, con las agotadas paradas hasta su hora: la
 * del tope de 5 horas, con el tope al 100 %; la de la semana, con la semana al
 * 100 %. Así `elegirCuenta` las salta y su porqué lo dice («parada por su tope
 * de 5 horas»), en `open_pane`, en `get_usage` y en el relevo.
 */
export function conLasAgotadas(vivas: CuentaViva[], ahora = Date.now()): CuentaViva[] {
  if (!AGOTADAS.size) return vivas;
  return vivas.map((v) => {
    const a = AGOTADAS.get((v.cuenta.dir ?? "").replace(/[\\/]+$/, "").toLowerCase());
    if (!a || a.hasta <= ahora || v.cuenta.provider !== "claude") return v;
    return a.tipo?.startsWith("seven_day")
      ? { ...v, gastado: 100, renueva: a.hasta }
      : { ...v, sesion: 100, sesionRenueva: a.hasta };
  });
}

/**
 * La cuenta del relevo: la de `elegirCuenta` entre las de Claude con sesión, sin
 * la agotada, o por qué no hay ninguna. A una sin sitio NO se va: otra cuenta
 * también parada no adelanta nada, y Claude Code ya sigue solo al renovarse.
 */
export function cuentaDelRelevo(vivas: CuentaViva[], agotadaDir: string, ahora = Date.now()): { viva: CuentaViva; porque: string } | { error: string } {
  const otras = conLasAgotadas(vivas, ahora).filter((v) => !igual(v.cuenta.dir, agotadaDir));
  if (!otras.length) return { error: "no hay otra cuenta de Claude con la sesión iniciada." };
  const e = elegirCuenta(otras, ahora);
  if (!e) return { error: "no hay otra cuenta de Claude con la sesión iniciada." };
  if (e.sinSitio) return { error: `ninguna otra cuenta tiene sitio (${e.porque})` };
  return { viva: e.viva, porque: e.porque };
}

/** «a las 3:50», o con el día si no es hoy, en la hora de este equipo. */
function horaLocal(renuevaS: number | null | undefined, ahora: number): string {
  if (!renuevaS) return "";
  const d = new Date(renuevaS * 1000);
  const hm = d.toLocaleTimeString("es-ES", { hour: "numeric", minute: "2-digit" });
  return new Date(ahora).toDateString() === d.toDateString()
    ? `, se renueva a las ${hm}`
    : `, se renueva ${d.toLocaleDateString("es-ES", { weekday: "long" })} a las ${hm} (${cuantoFalta(d.getTime(), ahora)})`;
}

const TOPES: Record<string, string> = { five_hour: "su tope de 5 horas", seven_day: "su semana" };

/** El primer mensaje de la nueva, cuando sigue la MISMA conversación. Hace lo que
    hace Claude Code al renovarse («Continue the task you were working on when the
    limit was reached; do not repeat work that is already complete»), y dice por qué. */
export function textoDeSeguir(p: { agotada: string; cuenta: string; tipo?: string | null; renueva?: number | null }, ahora = Date.now()): string {
  const tope = (p.tipo && TOPES[p.tipo]) || "su cuota";
  return (
    `[Adeorq] La cuenta «${p.agotada}» se quedó sin cuota (${tope}${horaLocal(p.renueva, ahora)}) y Adeorq ha pasado ESTA misma conversación a la cuenta «${p.cuenta}», que sí tiene. ` +
    "Sigue la tarea por donde la dejaste, sin repetir lo que ya está hecho. Si el último comando o la última herramienta falló por la cuota, repítelo."
  );
}

/** Lo que el comando viejo decía de sí mismo y la nueva tiene que heredar. */
export function deSuComando(comando: string[] | undefined): { modelo?: string; esfuerzo?: string; modo?: PermissionMode } {
  const junto = (comando ?? []).join(" ");
  const de = (flag: string) => new RegExp(`--${flag}[\\s=]+([A-Za-z0-9.\\-\\[\\]]+)`).exec(junto)?.[1];
  const modo = MODOS.find((m) => m === de("permission-mode"));
  return { modelo: de("model"), esfuerzo: de("effort"), modo };
}

/** El comando de la nueva con la misma conversación: `--resume`, su modelo, su
    esfuerzo y su modo (una delegada nace en `auto`), y el «sigue». */
export function comandoDeRelevo(sesion: string, comandoViejo: string[] | undefined, sigue: string): string[] {
  const { modelo, esfuerzo, modo } = deSuComando(comandoViejo);
  const extra = [`--resume ${sesion}`, modelo && `--model ${modelo}`, esfuerzo && `--effort ${esfuerzo}`].filter(Boolean).join(" ");
  return claudeCommand(withEffort(extra), modo ?? "auto", sigue);
}

/** Que la nueva no se pare en «Resume from summary»: Claude Code 2.1.325 lo
    pregunta al retomar una conversación de más de 100.000 tokens cuyo último
    mensaje tiene más de 70 minutos (`CLAUDE_CODE_RESUME_THRESHOLD_MINUTES`,
    leído en su binario), y en una delegada no hay nadie para contestarlo. */
export const ENTORNO_DEL_RELEVO: Record<string, string> = { CLAUDE_CODE_RESUME_THRESHOLD_MINUTES: "525600" };

/** Lo que necesita de la ventana. */
export interface ManosDelRelevo {
  addPane: (
    name: string,
    cwd: string,
    command?: string[],
    at?: undefined,
    account?: Account,
    team?: undefined,
    shadow?: undefined,
    grupo?: undefined,
    envOverride?: Record<string, string>,
    opciones?: { abiertaPor?: string },
  ) => { id: number; donde: "lienzo" | "cabina" } | null | undefined;
  /** Las cuentas de esa CLI con su cuota (`fotoRapida` con las suyas abiertas). */
  vivas: (cli: string) => Promise<CuentaViva[]>;
  lista: () => Account[];
  nombreDe: (id: number) => string | undefined;
  confiar: (cwd: string, dir: string | undefined) => Promise<unknown>;
  marcar: (id: number) => void;
}

type Respuesta = { error?: string; datos?: unknown; pane_id?: number; donde?: "lienzo" | "cabina"; parte?: string };

/** `relevo_cuenta`: adónde va. Apunta la agotada antes de elegir. */
export async function elegirParaRelevo(p: { paneId?: number; cli?: string; agotada?: string; tipo?: string | null; renueva?: number | null }, m: ManosDelRelevo): Promise<Respuesta> {
  const cli = String(p.cli ?? "");
  if (!sabe(cli, "relevo")) return { error: `«${cli || "?"}» no sabe seguir en otra cuenta` };
  const agotadaDir = typeof p.agotada === "string" ? p.agotada : "";
  apuntarAgotada(agotadaDir, p.renueva, p.tipo);
  // Solo cuentas de la MISMA CLI: la conversación no sigue en la de otra.
  const vivas = (await m.vivas(cli)).filter((v) => v.cuenta.provider === cli && v.instalado && v.conectada);
  const deLaAgotada = [mainAccount(cli), ...m.lista()].find((a) => a.provider === cli && igual(a.dir, agotadaDir));
  const r = cuentaDelRelevo(vivas, agotadaDir);
  if ("error" in r) return { error: r.error };
  const c = r.viva.cuenta;
  return {
    datos: {
      cuenta: { id: c.id, label: c.label, dir: c.dir ?? "", provider: c.provider },
      agotada: deLaAgotada?.label ?? (agotadaDir ? agotadaDir.split(/[\\/]/).filter(Boolean).pop() : "Principal"),
      nombre: typeof p.paneId === "number" ? m.nombreDe(p.paneId) ?? "" : "",
      porque: r.porque,
    },
  };
}

/** `relevo_abrir`: la nueva, con la misma conversación o con el acta. */
export async function abrirElRelevo(
  p: { cli?: string; cuenta?: { id?: string; label?: string; dir?: string }; cwd?: string; nombre?: string; sesion?: string | null; sesionVieja?: string; comando?: string[]; agotada?: string; tipo?: string | null; renueva?: number | null },
  m: ManosDelRelevo,
): Promise<Respuesta> {
  const cli = String(p.cli ?? "");
  if (!sabe(cli, "relevo")) return { error: `«${cli || "?"}» no sabe seguir en otra cuenta` };
  const cwd = String(p.cwd ?? "");
  if (!cwd) return { error: "falta la carpeta" };
  const cuenta = [mainAccount(cli), ...m.lista()].find((a) => a.provider === cli && (a.id === p.cuenta?.id || (!!p.cuenta?.dir && igual(a.dir, p.cuenta.dir))));
  if (!cuenta) return { error: `la cuenta «${p.cuenta?.label ?? "?"}» ya no está en Adeorq` };
  const nombre = String(p.nombre || "relevo");
  const agotada = String(p.agotada || "la anterior");
  let command: string[] | undefined;
  if (p.sesion) {
    command = comandoDeRelevo(p.sesion, p.comando, textoDeSeguir({ agotada, cuenta: cuenta.label, tipo: p.tipo, renueva: p.renueva }));
  } else {
    // No se pudo mudar: nace con el acta de dónde iba, leída de la conversación vieja.
    const acta = await actaDeRelevo({ cwd, sessionId: p.sesionVieja, name: nombre, cuenta: agotada });
    const { modelo, esfuerzo } = deSuComando(p.comando);
    command = comandoDe({ cli, encargo: acta, modelo, esfuerzo, desatendida: true });
  }
  // Su carpeta, de confianza en la cuenta nueva: cada `CLAUDE_CONFIG_DIR` lleva
  // su lista, y sin esto nace parada en «¿confías en esta carpeta?».
  await m.confiar(cwd, cuenta.dir).catch(() => false);
  // El «de: …» de la vieja. Con la misma conversación lo pone solo `delegacionDe`
  // al verla; con el acta es otra conversación, y se apunta como delegada nueva.
  const abiertaPor = delegadaDe(p.comando)?.abiertaPor;
  if (!p.sesion) apuntarDelegada(command, abiertaPor);
  const abierto = m.addPane(nombre, cwd, command, undefined, cuenta, undefined, undefined, undefined, ENTORNO_DEL_RELEVO, { abiertaPor });
  if (!abierto) return { error: "no pude abrir la terminal" };
  m.marcar(abierto.id);
  return {
    pane_id: abierto.id,
    donde: abierto.donde,
    datos: { name: nombre, cwd, command: command ?? [], abiertaPor: abiertaPor ?? null },
  };
}
