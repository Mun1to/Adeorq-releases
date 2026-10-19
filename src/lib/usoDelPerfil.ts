// Tu uso dentro del Perfil: la cifra, el porfolio, el año en casillas y el mes.
//
// Los datos salen de `uso_historia` (`src-tauri/src/uso_historia.rs`): cubos de
// una hora en UTC, con su CLI, su modelo y, desde que el panel 1 lo añadió, la
// raíz del proyecto donde se trabajó. Aquí se convierten en lo que se pinta, y
// vive aparte del componente porque casi todo son casos que se pueden
// enumerar y probar (`pnpm bancos usoDelPerfil`):
//
//   · El DÍA lo pone esta ventana con su zona horaria, la única que la conoce:
//     la hora llega en UTC y a las 23:00 de Madrid en verano ya es el día
//     siguiente en Londres. Las dos noches del cambio de hora salen solas,
//     porque se pregunta al reloj del sistema y no se suman horas a mano.
//   · Las fechas se manejan como texto «AAAA-MM-DD», como en
//     `lib/calendario.ts`, y se avanza de día en día con `Date.UTC`, que no
//     tiene cambio de hora: sumar 86.400.000 ms a una fecha local falla dos
//     noches al año.
//   · «Los tokens» son DOS cifras (Munir, 2026-10-17, opción D3): la grande
//     con la caché, que es la que enseñan ccusage y las capturas que circulan,
//     y «Nuevos» (entrada + salida + caché escrita) debajo. La caché es la
//     conversación que el modelo relee en cada respuesta: el 99 % del volumen.
//   · El color de una casilla es su cuartil entre los días con uso del año, no
//     una fracción del día más alto: con un día de 2.223 M y la mayoría entre
//     100 y 700, la fracción dejaba casi todo el año en el tono más flojo.

import { columnaDelUno, comoFecha, diasDelMes } from "./calendario";
import { proveedorDe } from "./providers";

/** Una hora con un modelo en una carpeta, tal y como la devuelve Rust. */
export interface Cubo {
  /** En UTC, «AAAA-MM-DDTHH». */
  hora: string;
  cli: string;
  modelo: string;
  /** La raíz del proyecto. Opcional: no llega hasta que Rust la devuelve. */
  carpeta?: string;
  entrada: number;
  salida: number;
  cacheLeida: number;
  cacheEscrita: number;
  respuestas: number;
}

export interface Historia {
  cubos: Cubo[];
  archivos: number;
  /** La carpeta madre de los proyectos con la que se leyó, para saber qué no
   *  es un proyecto (`fueraDeProyecto`). No la da Rust: la pone `leerHistoria`. */
  raiz?: string;
}

/** Todo lo que leyó el modelo, caché incluida: la cifra grande. */
export const conCache = (c: Cubo): number => c.entrada + c.salida + c.cacheLeida + c.cacheEscrita;

/** Lo que le entró nuevo y lo que escribió: la fila de «Nuevos». */
export const nuevos = (c: Cubo): number => c.entrada + c.salida + c.cacheEscrita;

/* ------------------------------------------------------------------ el día */

const dosCifras = (n: number) => String(n).padStart(2, "0");

/** «AAAA-MM-DD» de una fecha con la hora de esta ventana. */
export function fechaLocal(d: Date): string {
  return comoFecha(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** El día de esta ventana en que cae una hora UTC «AAAA-MM-DDTHH». */
export function diaLocal(hora: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})/.exec(hora);
  if (!m) return "";
  return fechaLocal(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4])));
}

/** El día que está a `paso` días de otro, sin cambio de hora de por medio. */
export function diaMas(fecha: string, paso: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + paso));
  return `${x.getUTCFullYear()}-${dosCifras(x.getUTCMonth() + 1)}-${dosCifras(x.getUTCDate())}`;
}

/** En qué columna de la semana cae un día, con el lunes en la cero. */
export function columnaDe(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  return (new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7;
}

/**
 * Los días del mes en curso, del 1 a hoy: lo que cuentan la cifra y el
 * porfolio, SIEMPRE (Munir, 2026-10-17: «siempre va a estar en el mes», sin
 * elegir periodo; para otro día está la tarjeta).
 */
export function mesEnCurso(hoy: string): [string, string] {
  return [`${hoy.slice(0, 8)}01`, hoy];
}

/** «octubre de 2026» («October 2026»); la mayúscula la pone la hoja. */
export function nombreDelMes(anio: number, mes: number, lang: "es" | "en" = "es"): string {
  return new Date(anio, mes - 1, 1).toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", { month: "long", year: "numeric" });
}

/** «17 de octubre de 2026» de un «AAAA-MM-DD», sin pasar por `new Date(texto)`. */
export function fechaLarga(fecha: string, lang: "es" | "en" = "es"): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", { day: "numeric", month: "long", year: "numeric" });
}

/** L, M, X… desde el lunes («M, T, W…» en inglés). */
export function inicialesSemana(lang: "es" | "en" = "es"): string[] {
  const loc = lang === "en" ? "en-GB" : "es-ES";
  // El 1 de junio de 2026 es lunes.
  return Array.from({ length: 7 }, (_, i) => new Date(2026, 5, 1 + i).toLocaleDateString(loc, { weekday: "narrow" }));
}

/* ---------------------------------------------------------------- las sumas */

export interface Suma {
  todos: number;
  nuevos: number;
  respuestas: number;
  /** Los días distintos con algo dentro. */
  dias: number;
}

/** Los cubos con su día ya puesto, para no recalcularlo en cada cuenta. */
export interface CuboDelDia extends Cubo {
  dia: string;
}

export function conDia(cubos: readonly Cubo[]): CuboDelDia[] {
  return cubos.map((c) => ({ ...c, dia: diaLocal(c.hora) })).filter((c) => c.dia && conCache(c) > 0);
}

/** Los de un tramo de días, los dos bordes incluidos; «» es sin borde. */
export function entre(cubos: readonly CuboDelDia[], desde: string, hasta: string): CuboDelDia[] {
  return cubos.filter((c) => (!desde || c.dia >= desde) && (!hasta || c.dia <= hasta));
}

export function sumar(cubos: readonly CuboDelDia[]): Suma {
  const dias = new Set<string>();
  let todos = 0;
  let nuevo = 0;
  let respuestas = 0;
  for (const c of cubos) {
    todos += conCache(c);
    nuevo += nuevos(c);
    respuestas += c.respuestas;
    dias.add(c.dia);
  }
  return { todos, nuevos: nuevo, respuestas, dias: dias.size };
}

/** Los tokens de cada día (con la caché, que es lo que dice la casilla). */
export function porDia(cubos: readonly CuboDelDia[]): Map<string, number> {
  const salida = new Map<string, number>();
  for (const c of cubos) salida.set(c.dia, (salida.get(c.dia) ?? 0) + conCache(c));
  return salida;
}

/** Tu día de más tokens de toda la historia, o nada si no hay ninguno. Un
 *  empate se lo queda el más reciente: es el récord que acabas de igualar. */
export function record(dias: ReadonlyMap<string, number>): { fecha: string; tokens: number } | null {
  let mejor: { fecha: string; tokens: number } | null = null;
  for (const [fecha, tokens] of dias) {
    if (tokens > 0 && (!mejor || tokens > mejor.tokens || (tokens === mejor.tokens && fecha > mejor.fecha))) mejor = { fecha, tokens };
  }
  return mejor;
}

/* --------------------------------------------------------------- el porfolio */

export type Eje = "proveedor" | "modelo" | "proyecto";

export interface Parte {
  /** Lo que agrupa: el CLI, el nombre del modelo o la carpeta. «» = «Otros». */
  clave: string;
  nombre: string;
  tokens: number;
  /** De 0 a 1, sobre el total con la caché. */
  parte: number;
  /** El cajón de los que no caben. */
  otros?: boolean;
}

/**
 * El nombre de un modelo como se dice: `claude-opus-5-5` es «Opus 5.5».
 *
 * Se agrupa por este nombre y no por el id, porque un mismo modelo llega con
 * fecha y sin ella (`claude-sonnet-4-5-20250929` y `claude-sonnet-4-5`), y con
 * la marca de la ventana de un millón (`[1m]`): son el mismo en el porfolio.
 */
export function nombreDeModelo(id: string): string {
  const limpio = id.replace(/\[[^\]]*\]$/, "").trim();
  const familia = (f: string) => f[0].toUpperCase() + f.slice(1);
  // Los de ahora: claude-opus-5-5, claude-haiku-4-5-20251001, claude-opus-4-20250514.
  let m = /^claude-(fable|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/i.exec(limpio);
  if (m) return `${familia(m[1].toLowerCase())} ${m[2]}${m[3] ? `.${m[3]}` : ""}`;
  // Los de antes: claude-3-5-sonnet-20241022, claude-3-opus-20240229.
  m = /^claude-(\d+)(?:-(\d{1,2}))?-(opus|sonnet|haiku)(?:-\d{8})?$/i.exec(limpio);
  if (m) return `${familia(m[3].toLowerCase())} ${m[1]}${m[2] ? `.${m[2]}` : ""}`;
  // Los de OpenAI: gpt-5.6-terra es «GPT-5.6 Terra».
  m = /^gpt-([\d.]+)(?:-(.+))?$/i.exec(limpio);
  if (m) {
    const resto = (m[2] ?? "").split("-").filter(Boolean).map(familia).join(" ");
    return `GPT-${m[1]}${resto ? ` ${resto}` : ""}`;
  }
  // Codex sin modelo apuntado (Rust lo llama «codex»).
  if (/^codex$/i.test(limpio)) return "Codex";
  return limpio || id;
}

/** El nombre de un proyecto: la última carpeta de su raíz. «» si no lo dice. */
export function nombreDeProyecto(carpeta: string): string {
  return carpeta.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
}

/** Una carpeta sin la barra del final, salvo la raíz de Unix, que es la barra. */
const sinBarra = (carpeta: string) => carpeta.replace(/[\\/]+$/, "") || carpeta.slice(0, 1);

/** Para comparar dos carpetas: barras normales y, en Windows, sin mayúsculas. */
const comparable = (carpeta: string) => {
  const c = sinBarra(carpeta.trim()).replace(/\\/g, "/");
  return /^[A-Za-z]:/.test(c) ? c.toLowerCase() : c;
};

/**
 * Lo que sale como carpeta de un cubo y no es un proyecto (Munir, 2026-10-18:
 * en su Perfil salían «C:», «memory», «.playwright-mcp» y «proyectos»): la
 * raíz de un disco, la carpeta madre de los proyectos (`raiz`, la de
 * `list_projects`), una carpeta que empieza por punto (como las que se salta
 * `list_projects`), los datos de Claude Code (`.claude\projects\<carpeta>` y
 * su `memory`) y los de cualquier programa (`AppData`, 2026-10-19). Es por regla
 * y no por nombre: un proyecto que se llame
 * «memory» o lleve un punto en medio sigue siendo un proyecto.
 *
 * Rust ya ha subido cada carpeta a su repositorio, así que lo que llega aquí
 * así es una sesión abierta fuera de cualquiera. Sin carpeta NO entra: esa
 * respuesta tiene su fila, «Sin carpeta».
 */
export function fueraDeProyecto(carpeta: string, raiz = ""): boolean {
  const c = comparable(carpeta);
  if (!c) return false;
  if (/^([a-z]:)?\/?$/.test(c)) return true;
  if (raiz.trim() && c === comparable(raiz)) return true;
  if (nombreDeProyecto(c).startsWith(".")) return true;
  // Los datos de un programa: `AppData\Roaming` y `AppData\Local` en Windows, y
  // `~/.config` y `~/.local/share` en Linux (2026-10-19: «config» y
  // «munito-contenido»). Lo que Rust ya llevó a su proyecto (el scratchpad de una
  // sesión) no llega aquí con esta forma.
  if (/\/appdata\/(roaming|local|locallow)\//i.test(c) || /\/\.(config|local\/share)\//.test(c)) return true;
  return /\/\.claude\/projects(\/|$)/i.test(c);
}

/** Lo que distingue una fila: el CLI, el nombre del modelo o la carpeta. */
function propioDe(eje: Eje, c: Cubo): string {
  if (eje === "proveedor") return c.cli;
  if (eje === "modelo") return nombreDeModelo(c.modelo);
  return sinBarra(c.carpeta ?? "");
}

/**
 * Por qué se agrupa: lo de arriba, salvo que en Windows `C:\proyectos\adeorq`
 * y `C:\proyectos\Adeorq` son la misma carpeta. Rust las junta dentro de cada
 * hora, pero de una hora a otra puede llegar escrita de las dos maneras.
 */
function claveDe(eje: Eje, propio: string): string {
  return eje === "proyecto" && /^[A-Za-z]:[\\/]/.test(propio) ? propio.toLowerCase() : propio;
}

function nombreDe(eje: Eje, propio: string): string {
  if (eje === "proveedor") return proveedorDe(propio)?.label ?? propio;
  if (eje === "modelo") return propio;
  return nombreDeProyecto(propio);
}

/**
 * Cuánto de cada proveedor, modelo o proyecto, de más a menos.
 *
 * Con más de `max` se quedan los `max - 1` primeros y el resto va junto a
 * «Otros», al final: cinco filas se leen de un vistazo, sesenta proyectos no
 * (Munir tiene 67). Un empate se ordena por nombre, para que dos lecturas
 * iguales pinten lo mismo. Una carpeta escrita de dos maneras se dice como
 * la que más tokens lleva. Por proyecto, lo que no es un proyecto
 * (`fueraDeProyecto`, con la carpeta madre `raiz`) va siempre a «Otros» y no
 * ocupa sitio, aunque quepa.
 */
export function porfolio(cubos: readonly Cubo[], eje: Eje, max = 5, raiz = ""): Parte[] {
  const sumas = new Map<string, { tokens: number; formas: Map<string, number> }>();
  let total = 0;
  for (const c of cubos) {
    const t = conCache(c);
    if (t <= 0) continue;
    const propio = propioDe(eje, c);
    const k = claveDe(eje, propio);
    const s = sumas.get(k) ?? { tokens: 0, formas: new Map<string, number>() };
    s.tokens += t;
    s.formas.set(propio, (s.formas.get(propio) ?? 0) + t);
    sumas.set(k, s);
    total += t;
  }
  if (!total) return [];
  const filas: Parte[] = [...sumas.values()]
    .map(({ tokens, formas }) => {
      const clave = [...formas].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      return { clave, nombre: nombreDe(eje, clave), tokens, parte: tokens / total };
    })
    .sort((a, b) => b.tokens - a.tokens || (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0));
  const proyectos = eje === "proyecto" ? filas.filter((f) => !fueraDeProyecto(f.clave, raiz)) : filas;
  if (proyectos.length === filas.length && filas.length <= max) return filas;
  const quedan = proyectos.slice(0, max - 1);
  const resto = total - quedan.reduce((s, f) => s + f.tokens, 0);
  return [...quedan, { clave: "", nombre: "", tokens: resto, parte: resto / total, otros: true }];
}

/* ------------------------------------------------------------ las casillas */

/** El tono de una casilla: 0 es sin uso, de 1 a 4 de menos a más. */
export type Nivel = 0 | 1 | 2 | 3 | 4;

/** Los tres cortes entre los cuatro tonos: los cuartiles de los días con uso. */
export function cortes(valores: Iterable<number>): [number, number, number] {
  const con = [...valores].filter((v) => v > 0).sort((a, b) => a - b);
  if (!con.length) return [0, 0, 0];
  const en = (q: number) => con[Math.min(con.length - 1, Math.floor(q * con.length))];
  return [en(0.25), en(0.5), en(0.75)];
}

export function nivelDe(v: number, [a, b, c]: readonly [number, number, number]): Nivel {
  if (v <= 0) return 0;
  if (v < a) return 1;
  if (v < b) return 2;
  if (v < c) return 3;
  return 4;
}

export interface Casilla {
  fecha: string;
  tokens: number;
  nivel: Nivel;
}

/** Las semanas del año que se pintan: 52 enteras antes de la de hoy. */
export const SEMANAS = 53;

/**
 * El año en casillas, como el de GitHub: una columna por semana, del lunes al
 * domingo, y la última termina HOY (los días que faltan de esta semana no se
 * pintan: aún no han pasado). En orden de columna, que es como las coloca
 * `grid-auto-flow: column` con siete filas.
 */
export function casillasDelAnio(hoy: string, tokens: ReadonlyMap<string, number>): Casilla[] {
  const primero = diaMas(hoy, -columnaDe(hoy) - (SEMANAS - 1) * 7);
  const dias: string[] = [];
  for (let f = primero; f <= hoy; f = diaMas(f, 1)) dias.push(f);
  const corte = cortes(dias.map((f) => tokens.get(f) ?? 0));
  return dias.map((fecha) => {
    const t = tokens.get(fecha) ?? 0;
    return { fecha, tokens: t, nivel: nivelDe(t, corte) };
  });
}

export interface MesConTokens {
  /** Cuántas casillas vacías van delante del día 1 (la semana empieza en lunes). */
  antes: number;
  dias: (Casilla & { numero: number })[];
}

/**
 * El mes, con los tokens de cada día y los MISMOS cortes que el año, para que
 * un tono diga lo mismo en los dos calendarios.
 */
export function mesConTokens(
  anio: number,
  mes: number,
  tokens: ReadonlyMap<string, number>,
  corte: readonly [number, number, number],
): MesConTokens {
  const dias = [];
  for (let d = 1; d <= diasDelMes(anio, mes); d++) {
    const fecha = comoFecha(anio, mes, d);
    const t = tokens.get(fecha) ?? 0;
    dias.push({ fecha, numero: d, tokens: t, nivel: nivelDe(t, corte) });
  }
  return { antes: columnaDelUno(anio, mes), dias };
}

/* ------------------------------------------------------------ cómo se dice */

/**
 * Una cifra de tokens en pocas letras: «850K», «141M», «9,8B».
 *
 * K, M y B en los dos idiomas, a petición de Munir (2026-10-17: «pon B de
 * billones», o sea los mil millones del inglés, no el billón español de doce
 * ceros): «9,8B» se lee mejor que «9787 M» y cabe en una casilla del mes. Y
 * la letra PEGADA a la cifra («la B está espaciada del 10, que esté junto»).
 * La tarjeta para compartir usa esta misma función. Un decimal por debajo de
 * diez («2,5M»), ninguno por encima («141M»); con la coma o el punto de cada
 * idioma y sin separador de miles.
 */
export function cifra(n: number, lang: "es" | "en" = "es"): string {
  const f = (x: number, decimales: number) =>
    new Intl.NumberFormat(lang, { maximumFractionDigits: decimales, useGrouping: false }).format(x);
  const con = (x: number, letra: string) => `${x < 9.95 ? f(x, 1) : f(Math.round(x), 0)}${letra}`;
  if (n < 1000) return f(Math.round(n), 0);
  if (Math.round(n / 1e3) < 1000) return `${f(Math.round(n / 1e3), 0)}K`;
  if (Math.round(n / 1e6) < 1000) return con(n / 1e6, "M");
  return con(n / 1e9, "B");
}

/** Un porcentaje de una parte: «63 %», «<1 %», «100 %» (sin espacio en inglés). */
export function porcentaje(parte: number, lang: "es" | "en" = "es"): string {
  const sp = lang === "en" ? "" : " ";
  if (parte <= 0) return `0${sp}%`;
  if (parte < 0.005) return `<1${sp}%`;
  return `${Math.round(parte * 100)}${sp}%`;
}
