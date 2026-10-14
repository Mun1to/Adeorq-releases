// El enjambre: varias sesiones que ya tenías abiertas, juntas en una pieza del
// lienzo, con una fila por sesión y UNA caja para hablarles a todas.
//
// Munir, 2026-10-12: «es como el modo chat de capataz pero para un grupo de
// sesiones, que puedas hacer merge de varias sesiones en solo un chat grupal y
// se puedan ir añadiendo más sesiones o quitarlas». Y al contestar la página de
// decisión, el 13: lo que escribes va a ADEO, que lo orquesta con un modelo
// pequeño «que mejora los prompts y los manda a cada sesión», con «agentes Adeo
// por colores, Adeo en azul, en verde…».
//
// EL COLOR ES DEL ENJAMBRE, NO DE SUS SESIONES. La primera vez se construyó al
// revés (un Adeo de color en cada fila) y él lo corrigió esa misma noche: «lo
// de que Adeo sea de diferentes colores me refiero del enjambre, no de las
// sesiones; las sesiones son sesiones, no Adeo». Cada enjambre tiene SU Adeo, de
// un color, y es el que reparte; una fila es una sesión, con el logo de su CLI.
//
// Lo único nuevo respecto al conserje es DE QUIÉN son las sesiones: el conserje
// solo manda sobre las que abre él, y el enjambre junta las que ya estaban. Por
// eso es la misma conversación con otro papel (`enjambre` en `conserje.rs`): la
// misma memoria por índice, la misma reja y el mismo `claude -p`.
//
// Esto es PURO: de qué color es cada enjambre, qué dice la fila de cada sesión,
// quién acaba de terminar y sobre quién se ha soltado una terminal. La pieza es
// `components/CanvasEnjambre.tsx`, y esto se prueba sin ventana con
// `pnpm bancos enjambre`.

import { estadoDe, hoja, PALABRA, type Estado, type Trabajo } from "./conserje";
import type { Tinte } from "./mascota";
import { proveedorDe, sabe } from "./providers";
import type { PaneStatus } from "./pty";

/** Cuántas sesiones caben. El mismo tope que `MAX_MIEMBROS` en `conserje.rs`,
 *  que es quien lo hace cumplir: aquí es para no ofrecer lo que Rust tiraría. */
export const MAX_MIEMBROS = 12;

/**
 * Los colores del Adeo de un enjambre, en el orden en que se reparten: el
 * primer enjambre del tablero es el azul, el segundo el verde… El nombre es
 * como se le llama («el enjambre verde») y lo que se guarda en el tablero, así
 * que son palabras de una sola lectura y ninguna es la de un estado: el
 * naranja, el ámbar y el rojo ya significan «terminó», «te pregunta» y «te
 * espera» en toda la casa (`TONOS_DE_ESTADO`, en `colorLienzo.ts`).
 */
export const COLORES: ReadonlyArray<readonly [string, Tinte]> = [
  ["azul", { cuerpo: "#39a9f6", brazo: "#2389e0" }],
  ["verde", { cuerpo: "#4fd08a", brazo: "#2fa866" }],
  ["violeta", { cuerpo: "#a98bf5", brazo: "#8566dc" }],
  ["rosa", { cuerpo: "#f27fc0", brazo: "#d85aa3" }],
  ["turquesa", { cuerpo: "#3fd3d0", brazo: "#22aeb0" }],
  ["lima", { cuerpo: "#b4d94a", brazo: "#8fb52a" }],
  ["índigo", { cuerpo: "#7d8cf8", brazo: "#5a69dd" }],
  ["gris", { cuerpo: "#aab6c8", brazo: "#8894a8" }],
];

/** El tinte de un color por su nombre. Uno que no se conoce (un tablero de una
 *  versión más nueva) sale sin tinte, o sea con el azul de Adeo. */
export function tinteDe(color: string | undefined): Tinte | undefined {
  return COLORES.find(([n]) => n === color)?.[1];
}

/** El color para el enjambre que nace: el primero que ningún otro lleva. Con
 *  más enjambres que colores se repite el que menos se usa, desde el azul. */
export function colorLibre(usados: readonly string[]): string {
  let mejor = COLORES[0][0];
  let menos = Infinity;
  for (const [nombre] of COLORES) {
    const veces = usados.filter((u) => u === nombre).length;
    if (veces < menos) {
      menos = veces;
      mejor = nombre;
    }
  }
  return mejor;
}

/** Una sesión del enjambre, tal como la guarda su pieza: el panel donde vive.
 *  Todo lo demás se lee en vivo de la terminal. */
export interface Miembro {
  panel: number;
}

/** Lo que el lienzo sabe de una terminal sin preguntarle a nadie. */
export interface SesionVista {
  panel: number;
  nombre: string;
  carpeta: string;
  /** El CLI que corre (`kindDeComando`), o `shell` si es una consola. */
  cli: string;
  cuenta?: string;
}

/** Si esa terminal puede entrar en un enjambre. Una consola no: lo que Adeo le
 *  escribiera no sería un encargo, sería una orden ejecutándose. */
export const puedeEntrar = (cli: string): boolean => cli !== "shell";

/**
 * Si de ese CLI se sabe cuándo trabaja y cuándo ha acabado. Son los que dejan
 * su sesión escrita en el disco donde Adeorq la lee: hoy Claude Code, por su
 * transcript, y Codex, por su rollout. De los demás solo se sabe si preguntan
 * algo, que eso sale de la pantalla (`lib/reglasPantalla.ts`).
 */
export const daEstado = (cli: string): boolean => sabe(cli, "archivosDelDisco");

/**
 * De dónde se lee lo que contesta ese CLI para traerlo al hilo del grupo: del
 * `transcript` de Claude Code (`last_reply`) o del `rollout` de Codex
 * (`codex_last_reply`). De los demás, de ningún sitio: su respuesta se queda
 * en su terminal. Es la misma marca que dice de dónde salen los archivos que
 * toca (`archivosDelDisco`), porque es el mismo fichero.
 */
export const lectorDeRespuesta = (cli: string): "transcript" | "rollout" | undefined => proveedorDe(cli)?.archivosDelDisco;

export type EstadoFila = Estado | "nosesabe";

export const PALABRA_FILA: Record<EstadoFila, string> = { ...PALABRA, nosesabe: "no se sabe" };

/** Cómo está una sesión del grupo. Como `estadoDe`, con una salida más: la de
 *  un CLI que no cuenta cómo va, que no se da ni por trabajando ni por libre. */
export function estadoDeFila(cli: string, s: PaneStatus | undefined): EstadoFila {
  const e = estadoDe(s);
  if (e === "cerrada" || e === "pregunta") return e;
  return daEstado(cli) ? e : "nosesabe";
}

/** Lo que enseña la fila de una sesión (Munir: «el nombre de la sesión y el
 *  proyecto y el modelo, si es posible las tres, y también el logo del
 *  proveedor»). */
export interface Fila {
  panel: number;
  nombre: string;
  proyecto: string;
  /** Vacío si el CLI no lo dice. */
  modelo: string;
  cli: string;
  estado: EstadoFila;
  /**
   * Si ese estado se ha LEÍDO o es el de relleno. Una terminal recién abierta
   * (o un tablero que acaba de volver) todavía no ha leído su sesión, y hasta
   * entonces cuenta como «trabajando», igual que en el conserje. Para pintarla
   * vale; para decidir que «acaba de terminar», no: lo primero que se lee de
   * una sesión que ya había acabado es «ha terminado», y eso no es una noticia.
   */
  sabido: boolean;
  /**
   * Si su turno ha ACABADO, que no es lo mismo que «ha terminado»: una sesión
   * que acaba preguntando («¿lo conecto a Supabase?») sale como «te pregunta
   * algo», y esa pregunta es justo lo que tiene que entrar en el chat del
   * grupo. Una que pide permiso a mitad de turno también «te pregunta», y esa
   * no ha acabado nada.
   */
  turnoAcabado: boolean;
  /** El contexto gastado, de 0 a 100, cuando se sabe. */
  porcentaje?: number;
}

/** Los estados con que una sesión deja su turno ACABADO: dijo lo suyo y calla
 *  (`lista`), o lo acabó con una pregunta o un ofrecimiento (`ofrece`). */
export const TURNO_ACABADO: ReadonlySet<string> = new Set(["lista", "ofrece"]);

export function filaDe(m: Miembro, sesion: SesionVista | undefined, s: PaneStatus | undefined): Fila {
  const cli = sesion?.cli ?? "shell";
  return {
    panel: m.panel,
    // El nombre en vivo manda: una sesión se titula sola al rato de abrirse.
    nombre: s?.name || sesion?.nombre || "",
    proyecto: hoja(s?.cwd || sesion?.carpeta || ""),
    modelo: s?.model ?? "",
    cli,
    // Sin terminal en el lienzo no hay sesión, diga lo que diga un estado viejo.
    estado: sesion ? estadoDeFila(cli, s) : "cerrada",
    sabido: !!sesion && !!s && s.state !== "",
    turnoAcabado: !!sesion && daEstado(cli) && TURNO_ACABADO.has(s?.state ?? ""),
    porcentaje: s?.percent,
  };
}

/**
 * El recuento de la cabecera, lo más urgente primero, sin los que valen cero:
 * «1 te espera · 2 trabajando · 1 terminó». Va como clave con su número para
 * que la traducción la haga quien pinta.
 */
export function recuento(estados: readonly EstadoFila[]): Array<{ clave: string; n: number }> {
  const cuantos = (e: EstadoFila) => estados.filter((x) => x === e).length;
  const partes: Array<{ clave: string; n: number }> = [
    { clave: cuantos("pregunta") === 1 ? "{n} te espera" : "{n} te esperan", n: cuantos("pregunta") },
    { clave: "{n} trabajando", n: cuantos("trabajando") },
    { clave: cuantos("termino") === 1 ? "{n} ha terminado" : "{n} han terminado", n: cuantos("termino") },
    { clave: "{n} sin estado", n: cuantos("nosesabe") },
    { clave: cuantos("cerrada") === 1 ? "{n} cerrada" : "{n} cerradas", n: cuantos("cerrada") },
  ];
  return partes.filter((p) => p.n > 0);
}

/**
 * Lo que se le dice a Adeo de cada sesión, por su panel. Lleva las DOS mitades
 * de «libre»: lo que la app sabe (trabaja o ha terminado) y lo que ayuda a
 * decidir si le cabe otro encargo (cuánto contexto lleva gastado). La app no
 * sabe más que eso, y Adeo elige con eso.
 *
 * Una que pregunta empieza por la palabra de `PALABRA.pregunta`: es lo que
 * busca la reja de Rust (`PREGUNTA`, en `conserje.rs`) para no repartirle.
 */
export function estadosParaAdeo(filas: readonly Fila[]): Record<string, string> {
  const fuera: Record<string, string> = {};
  for (const f of filas) {
    const lleva = f.porcentaje !== undefined && f.estado !== "cerrada" ? `, contexto al ${Math.round(f.porcentaje)} %` : "";
    fuera[String(f.panel)] = `${PALABRA_FILA[f.estado]}${lleva}`;
  }
  return fuera;
}

/** La sesión de una fila, como la apunta Rust para que Adeo pueda escribirle. */
export function trabajoDe(f: Fila, sesion: SesionVista, sid: string | undefined, ahora: number): Trabajo {
  return {
    panel: f.panel,
    cli: f.cli,
    modelo: f.modelo,
    cuenta: sesion.cuenta ?? "",
    carpeta: sesion.carpeta,
    encargo: "",
    abierto: ahora,
    eligio: "tu",
    porque: "",
    sesion: sid ?? "",
    nombre: f.nombre,
  };
}

/**
 * Las que acaban de terminar su turno: las que antes no estaban en «ha
 * terminado» y ahora sí. Su respuesta es la que entra en el hilo del grupo.
 *
 * Una que se ve por PRIMERA vez ya terminada no cuenta: es una sesión que
 * entró al grupo con su trabajo hecho, y lo que dijo entonces no era para este
 * chat. Tampoco una de un CLI sin estado, que nunca llega a «ha terminado».
 *
 * Por eso aquí solo entran los estados LEÍDOS (`Fila.sabido`, ver
 * `estadosLeidos`): con el de relleno dentro, al reabrir un tablero todas sus
 * sesiones pasaban de «trabajando» (sin leer) a «ha terminado» (leído), y lo
 * último que cada una había dicho días atrás entraba en el hilo como nuevo.
 * Lo cazó el banco del programa de verdad; con el doble no se veía.
 */
export function acabanDeTerminar(
  antes: Readonly<Record<number, EstadoFila>>,
  ahora: Readonly<Record<number, EstadoFila>>,
): number[] {
  return Object.keys(ahora)
    .map(Number)
    .filter((p) => ahora[p] === "termino" && antes[p] !== undefined && antes[p] !== "termino");
}

/** El estado de cada sesión por su panel, solo de las que ya se ha leído, y
 *  para saber quién acaba de terminar: una que acabó su turno preguntando
 *  cuenta aquí como terminada, que es lo que ha hecho. */
export function estadosLeidos(filas: readonly Fila[]): Record<number, EstadoFila> {
  const fuera: Record<number, EstadoFila> = {};
  for (const f of filas) if (f.sabido) fuera[f.panel] = f.turnoAcabado ? "termino" : f.estado;
  return fuera;
}

/* ── dónde cae cada cosa ──────────────────────────────────────────────────── */

export interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cuánto de la menor de las dos cajas queda tapado por la otra, de 0 a 1. */
export function solape(a: Caja, b: Caja): number {
  const ancho = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const alto = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ancho <= 0 || alto <= 0) return 0;
  const menor = Math.min(a.w * a.h, b.w * b.h);
  return menor > 0 ? (ancho * alto) / menor : 0;
}

/**
 * Cuánto hay que tapar a otra pieza para que soltar encima sea «júntalas».
 * Más de la mitad: dos terminales que se rozan al ordenarlas no se funden, y
 * eso era justo el riesgo de este gesto (hasta hoy, soltar una encima de otra
 * solo la movía).
 */
export const SOLAPE_PARA_JUNTAR = 0.55;

/** Sobre cuál de las otras se ha soltado una pieza, si es sobre alguna: la que
 *  más tapa, y solo si pasa del umbral. */
export function sobreQuien(suelta: Caja, otras: ReadonlyArray<{ id: string; caja: Caja }>): string | null {
  let mejor: string | null = null;
  let cuanto = SOLAPE_PARA_JUNTAR;
  for (const o of otras) {
    const s = solape(suelta, o.caja);
    if (s >= cuanto) {
      cuanto = s;
      mejor = o.id;
    }
  }
  return mejor;
}

/** Por qué soltar una terminal encima de otra pieza no las ha juntado. */
export type MotivoDeNoJuntar = "consola" | "pronto";

/**
 * El motivo, para decirlo en vez de callar: quien suelta una terminal encima
 * de otra y no ve nada cree que el gesto no existe (Munir, 2026-10-13, con dos
 * consolas y una sola sesión de agente en el tablero: «no pasa absolutamente
 * nada»). `debajo` es la pieza sobre la que se soltó, entre o no entre en un
 * enjambre; sin ella fue un movimiento normal y no hay nada que decir.
 */
export function porQueNoSeJuntan(sueltaEntra: boolean, debajo: { entra: boolean } | null, aguanto: boolean): MotivoDeNoJuntar | null {
  if (!debajo) return null;
  if (!sueltaEntra || !debajo.entra) return "consola";
  return aguanto ? null : "pronto";
}

/** Lo que mide un enjambre al nacer. */
export const ENJAMBRE_W = 440;
export const ENJAMBRE_H = 520;
const HUECO = 24;

/**
 * Dónde queda la terminal número `n` (desde 0) de las que se enseñan junto a
 * un enjambre: en columnas de dos a su derecha, la primera pegada a él. Vale
 * para la que sale del grupo («sigue viva, justo al lado») y para todas cuando
 * dejan de estar minimizadas.
 */
export function alLado(enjambre: Caja, n: number, w: number, h: number): { x: number; y: number } {
  return {
    x: enjambre.x + enjambre.w + HUECO + Math.floor(n / 2) * (w + HUECO),
    y: enjambre.y + (n % 2) * (h + HUECO),
  };
}

/** Dónde nace el enjambre de unas terminales: a la izquierda de la que más a
 *  la izquierda está, a su altura, para no tapar ninguna. */
export function dondeNace(cajas: readonly Caja[]): { x: number; y: number } {
  if (!cajas.length) return { x: 0, y: 0 };
  const izq = cajas.reduce((a, b) => (b.x < a.x ? b : a));
  return { x: izq.x - ENJAMBRE_W - HUECO, y: izq.y };
}

/** «Enjambre 1», «Enjambre 2»…: el primer número que no esté cogido. */
export function nombreNuevo(base: string, existentes: readonly string[]): string {
  for (let n = 1; ; n++) {
    const nombre = `${base} ${n}`;
    if (!existentes.includes(nombre)) return nombre;
  }
}
