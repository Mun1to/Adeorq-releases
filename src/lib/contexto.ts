// Cuánto pesa el contexto de una sesión, y qué se le dice al agente para
// compactarla sin perder el hilo. Vivía en TerminalPane.tsx.

import { useEffect, useRef, useState } from "react";
import { sessionIdOf } from "./comandos";
import type { Translate } from "./i18n";
import { sabe } from "./providers";
import { codexContext, lastReply, listSkills, rastroDeRelevo, sendPty, sessionCompactions, sessionContext, type ContextInfo } from "./pty";

/** Cada cuánto se relee la sesión de un panel: deprisa mientras trabaja. */
const RELEER_MS = 20_000;
const RELEER_TRABAJANDO_MS = 6_000;
/** Y mientras te pregunta con un menú (AskUserQuestion): contestada, desde el
    PC o desde el móvil, lo que dice el transcript se quedaba hasta 20 s en «te
    pregunta», y el móvil seguía diciendo «Es tu turno» con la respuesta ya dada
    (medido el 2026-11-11 en `movil-elegir-de-verdad.mjs`: de 9 a 17 s). Releer
    con la conversación quieta sale barato: `read_tail` la guarda por tamaño y
    fecha. Solo con menú: una que acaba en una pregunta en prosa («ofrece») puede
    quedarse así horas, y para esa basta `releerSesion` cuando se le escribe. */
const RELEER_PREGUNTA_MS = 3_000;
/** Lo que se espera tras escribirle, para que el transcript ya lo tenga. */
const RELEER_TRAS_ESCRIBIR_MS = 1_200;
/** Un Claude recién abierto no tiene transcript hasta su primer mensaje, y
    hasta leerlo el panel no sabe su sesión: el móvil no le abría el chat (ni
    los botones de lo que pregunta) hasta 20 s después (medido el 2026-11-11).
    Mirar si ya existe es casi gratis: sin transcript no se lee nada más. */
const RELEER_SIN_TRANSCRIPT_MS = 3_000;
/** El evento con que se pide releer las sesiones de una carpeta. */
const EVENTO_RELEER_SESION = "adeorq:releer-sesion";

/** Que los paneles de `cwd` relean su sesión en seguida: se les acaba de
    escribir (desde el móvil), y lo que digan de ella ya no vale. */
export function releerSesion(cwd: string): void {
  window.dispatchEvent(new CustomEvent(EVENTO_RELEER_SESION, { detail: { cwd } }));
}

/**
 * Lo que el transcript dice de la sesión de un panel, releído cada poco: el
 * contexto gastado, los subagentes que hay fuera, el estado y el título. Más
 * deprisa mientras hay subagentes, para que el contador siga al trabajo en vez
 * de ir medio minuto por detrás.
 *
 * Y los CLI que dejan en disco cómo acaba cada turno (`estadoDelDisco`, hoy
 * Codex) desde el 2026-10-11, pero solo con su sesión SABIDA (`sidDelDisco`:
 * la de `codex resume`, o la que el panel aprende del disco), y solo el estado.
 * Sin eso un panel de Codex no avisaba nunca de que acabó.
 */
export function useContextoDeSesion(
  kind: string,
  cwd: string,
  joined: string,
  sidDelDisco?: string,
): ContextInfo | null {
  const [ctx, setCtx] = useState<ContextInfo | null>(null);
  useEffect(() => {
    if (!sabe(kind, "estadoDelDisco") || !sidDelDisco) return;
    let timer = 0;
    let stop = false;
    const look = () => {
      codexContext(sidDelDisco)
        .then((c) => {
          if (stop) return;
          setCtx(c);
          timer = window.setTimeout(look, c?.state === "a_medias" ? RELEER_TRABAJANDO_MS : RELEER_MS);
        })
        .catch(() => {
          if (!stop) timer = window.setTimeout(look, RELEER_MS);
        });
    };
    look();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [kind, sidDelDisco]);
  useEffect(() => {
    // Claude only: agy keeps no transcript here, and reading the folder's
    // newest one would show it another agent's context and crew as if its own.
    if (kind !== "claude") return;
    // Las dos formas de nombrar la sesión, no solo `--resume`: una terminal
    // recién abierta lleva `--session-id`, y sin él esto acababa leyendo el
    // transcript más reciente de la carpeta, que es justo lo que el comentario
    // de arriba dice que no hay que hacer.
    const sid = sessionIdOf(joined);
    let timer = 0;
    let stop = false;
    let enVuelo = false;
    let prisa = false;
    const look = () => {
      enVuelo = true;
      sessionContext(cwd, sid)
        .then((c) => {
          enVuelo = false;
          if (stop) return;
          setCtx(c);
          const luego = prisa ? RELEER_TRAS_ESCRIBIR_MS : !c ? RELEER_SIN_TRANSCRIPT_MS : c.state === "pregunta" ? RELEER_PREGUNTA_MS : c.agentsLive > 0 ? 6_000 : 20_000;
          prisa = false;
          timer = window.setTimeout(look, luego);
        })
        .catch(() => {
          enVuelo = false;
          if (!stop) timer = window.setTimeout(look, 20_000);
        });
    };
    // Lo que le escribe el móvil la cambia: se relee en seguida, sin esperar a
    // la vuelta siguiente. Si hay una lectura en marcha, puede ser de antes de
    // escribir: la siguiente va deprisa. Siempre una sola cadena de lecturas.
    const alEscribir = (ev: Event) => {
      const d = (ev as CustomEvent<{ cwd?: string }>).detail;
      if (stop || !d?.cwd || d.cwd.toLowerCase() !== cwd.toLowerCase()) return;
      if (enVuelo) {
        prisa = true;
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(look, RELEER_TRAS_ESCRIBIR_MS);
    };
    window.addEventListener(EVENTO_RELEER_SESION, alEscribir);
    look();
    return () => {
      stop = true;
      window.clearTimeout(timer);
      window.removeEventListener(EVENTO_RELEER_SESION, alEscribir);
    };
  }, [cwd, joined, kind]);
  return ctx;
}

/**
 * Lo que cuesta una sesión cargada, dicho ANTES de que sea tarde.
 *
 * La cabecera ya pintaba el porcentaje en naranja, y eso no basta: un número
 * no dice que a partir de cierto punto CADA mensaje vuelve a pagar el
 * contexto entero, ni que compactar paga de golpe todo lo acumulado. Munir
 * llegó al 88 % de un millón sin saberlo, le dio a `/compact` tres veces
 * creyendo que arreglaba algo, y esos tres intentos gastaron más cuota que
 * un día completo de trabajo (2026-07-30). El aviso es para que esa decisión
 * se tome con el dato delante, que es lo único que faltaba.
 *
 * 0 = nada que decir · 1 = ya pesa (350k) · 2 = compacta ya (450k, fijo, y
 * compacta solo si el ajuste lo dice) · 3 = mejor una terminal nueva (600k).
 *
 * Las dos primeras subieron de 300k y 400k el 2026-11-14 (Munir: «agrandarlo
 * a 450k de contexto y aviso al 350k», con «solo haz el /fin siempre y
 * compactas y retomas»). Lo medido en `docs/contexto/cuando-compactar.md`
 * dice que por calidad 400k ya llegaba tarde: es su decisión, con ese dato.
 *
 * Por TOKENS desde la D7 (Munir, 2026-10-22). El mismo día, tras gastar el
 * 40 % de su semana en uno, había pedido el 50 y el 60 % («que sea casi
 * obligatorio compactar en ese rango»); con un millón de ventana eso eran 500k
 * y 600k, y la medición (`scripts/cuota-por-terminal.mjs`) dijo que el 85,8 %
 * del gasto eran respuestas con 200k o más de contexto: el aviso llegaba con
 * todo pagado. Los 300k y 400k son suyos; los 600k, de los datos: es donde
 * compactaba de verdad (644k de media en su semana), y con «Ahora no» a 400k
 * el panel calla hasta la raya siguiente, así que a 800k callaba justo donde
 * se va más de la mitad del gasto.
 *
 * En cada raya vale lo que llegue ANTES, los tokens o el % de siempre (50, 60
 * y 80), para que una ventana pequeña siga avisando: Haiku (200k) a 100k, 120k
 * y 160k, como antes. No es la doble vara que se quitó el 2026-08-06 (150k y
 * 400k, «son muy molestas y aunque el contexto esté por debajo del 50 % siguen
 * apareciendo»): aquella elegía tokens a ciegas; estas rayas las puso él con
 * su gasto delante, y el % solo manda donde la ventana entera es más pequeña.
 * La píldora de la cabecera sigue con el %, y los tokens exactos en su globo.
 */
export const AVISO_TOKENS = 350_000;
export const FIJO_TOKENS = 450_000;
export const NUEVA_TOKENS = 600_000;
export const AVISO_PCT = 50;
export const FIJO_PCT = 60;
export const NUEVA_PCT = 80;
export type NivelCtx = 0 | 1 | 2 | 3;
/** Dónde cae una raya en esta ventana: sus tokens, o su % si llega antes. Sin
    ventana sabida, los tokens. */
export function raya(tokens: number, pct: number, ventana: number): number {
  return ventana > 0 ? Math.min(tokens, (ventana * pct) / 100) : tokens;
}
export function nivelDeContexto(c: Pick<ContextInfo, "used" | "window"> | null | undefined): NivelCtx {
  // Sin tokens no hay aviso: Codex los deja a 0.
  const u = c?.used ?? 0;
  if (!c || u <= 0) return 0;
  const w = c.window;
  return u >= raya(NUEVA_TOKENS, NUEVA_PCT, w) ? 3 : u >= raya(FIJO_TOKENS, FIJO_PCT, w) ? 2 : u >= raya(AVISO_TOKENS, AVISO_PCT, w) ? 1 : 0;
}
/** «350k»: los tokens como los dice el aviso. */
export function enMiles(tokens: number): string {
  return `${Math.round(tokens / 1000)}k`;
}

/**
 * ¿Se le puede teclear algo ya? Solo con el turno acabado de verdad: la última
 * palabra es del agente y es texto («lista», u «ofrece» si acaba preguntando
 * en prosa), sin subagentes fuera y sin un menú suyo en pantalla. La campana
 * sola no basta: el CLI la toca también al pedir un permiso y al acabar un
 * turno intermedio, y teclear ahí es contestarle el menú o colarse a mitad.
 */
export function turnoAcabado(c: Pick<ContextInfo, "state" | "agentsLive"> | null, preguntaEnPantalla: boolean): boolean {
  return !!c && (c.state === "lista" || c.state === "ofrece") && c.agentsLive === 0 && !preguntaEnPantalla;
}

/**
 * Qué hace un panel de Claude Code al llegar al 60 % sin que nadie pulse nada.
 * «no»: el aviso se queda fijo y espera al botón. «sin-commits»: a la campana
 * manda `/fin sin commits` (los traspasos, sin tocar git) y luego `/compact`.
 * «fin»: lo mismo con el `/fin` entero, que COMMITEA solo en sus repos.
 * De fábrica «sin commits»: lo eligió Munir el 2026-10-22 (A1 de su página),
 * con la condición de que nunca lo haga con el agente trabajando. El `/fin`
 * entero no va de fábrica porque escribiría en sus repos sin su mano.
 */
export type ModoSolo = "no" | "sin-commits" | "fin";
const MODO_DE_FABRICA: ModoSolo = "sin-commits";
const CLAVE_MODO = "adeorq-compactar-solo";
const CLAVE_SUGERIR = "adeorq-compactar-sugerir";
export function leerModoSolo(): ModoSolo {
  try {
    const v = localStorage.getItem(CLAVE_MODO);
    return v === "no" || v === "sin-commits" || v === "fin" ? v : MODO_DE_FABRICA;
  } catch {
    return MODO_DE_FABRICA;
  }
}

/**
 * ¿Está el CLI trabajando, según su pantalla? Claude Code pinta «esc to
 * interrupt» en el pie mientras dura un turno (lo usa también el vigía del
 * cuelgue). Es la segunda llave del automático, por si el transcript va por
 * detrás: Munir, 2026-10-22, «que cuando todavía esté trabajando no compactar
 * auto». `linea(i)` da la fila i de lo que se ve, de 0 a `filas - 1`.
 */
export function trabajaEnPantalla(linea: (i: number) => string, filas: number): boolean {
  for (let i = 0; i < filas; i++) if (linea(i).includes("to interrupt")) return true;
  return false;
}
/** Lo que se VE de un terminal (de xterm), fila a fila, pasado a una de las
    dos llaves de pantalla (`trabajaEnPantalla`, `esperaEnSuCaja`). Sin
    terminal, no. */
export function enPantalla(
  term: { rows: number; buffer: { active: { baseY: number; getLine(y: number): FilaXterm | undefined } } } | null,
  mirar: (linea: (i: number) => string, filas: number) => boolean,
): boolean {
  const buf = term?.buffer.active;
  return !!term && !!buf && mirar((i) => sinSugerencia(buf.getLine(buf.baseY + i)), term.rows);
}

/** Lo que hace falta de una fila de xterm (`IBufferLine`); las celdas, si las da. */
export interface FilaXterm {
  translateToString(trim?: boolean): string;
  length?: number;
  getCell?(x: number): { getChars(): string; getWidth(): number; isDim(): number } | undefined;
}

/**
 * La fila como texto, y en la caja de Claude Code (la que empieza por `❯`) sin
 * lo atenuado: su sugerencia gris («sigue con el laboratorio») no la escribió
 * nadie. Leída como texto, la caja parecía tener un borrador, y nada se
 * tecleaba solo: el 2026-11-14 dos terminales pasaron los 450.000 tokens con el
 * turno acabado y no se compactaron, y Munir: «¿por qué las sesiones tuyas no
 * las compactas tú?». Solo tras `❯`: las rayas y el pie pueden ir atenuados y
 * son los que dicen dónde está la caja.
 */
export function sinSugerencia(fila: FilaXterm | undefined): string {
  if (!fila) return "";
  const texto = fila.translateToString(true);
  if (!/^[❯>]/.test(texto) || !fila.getCell || fila.length == null) return texto;
  let s = "";
  for (let x = 0; x < fila.length; x++) {
    const c = fila.getCell(x);
    if (!c || c.getWidth() === 0) continue;
    const ch = c.getChars() || " ";
    s += x > 0 && c.isDim() ? " ".repeat(ch.length) : ch;
  }
  return s.trimEnd();
}

export { esperaEnSuCaja } from "./cajaClaude";

/**
 * Claude Code dice en pantalla que no conoce `/fin`. Pasó el 2026-11-09 con
 * `compactar_terminal` sobre una terminal de otra cuenta: su `CLAUDE_CONFIG_DIR`
 * no tiene la skill (la lista de skills se mira en la de Munir), contestó
 * «Unknown command: /fin» y «Args from unknown skill: sin commits», no hubo
 * turno, no sonó la campana y el `/compact` no llegó nunca.
 */
export function finDesconocidoEnPantalla(linea: (i: number) => string, filas: number): boolean {
  for (let i = 0; i < filas; i++) {
    const l = linea(i);
    if (/Unknown (command|skill):?\s*\/?fin\b/i.test(l) || l.includes("Args from unknown skill")) return true;
  }
  return false;
}

/**
 * Lo que dice el transcript de la conversación de un panel, para decidir si
 * se le teclea algo: solo la SUYA (revisión de `1954cf0`). Sin conversación
 * sabida no se pregunta por «la más reciente de la carpeta» (lo que hace
 * `session_context` sin id), que suele ser la de quien abrió la terminal. Y
 * una que ya no corre en ningún Claude Code (`viva`) no cuenta: tras un
 * `/clear` o un `/resume` dentro del panel, o con el CLI cerrado, ese
 * transcript se queda en «lista» y 450k para siempre.
 */
export function leerDelPanel(
  u: { esClaude?: boolean; cwd: string; sesion?: string },
  leer: (cwd: string, sesion?: string) => Promise<ContextInfo | null> = sessionContext,
): Promise<ContextInfo | null> {
  if (!u.esClaude || !u.sesion) return Promise.resolve(null);
  return leer(u.cwd, u.sesion).then((c) => (c?.viva === false ? null : c));
}

/**
 * Las terminales que abrió un agente con `open_pane` en este arranque (las
 * apunta `lib/puenteMcp.ts`). En ellas no hay nadie que pulse Compactar, así
 * que a la raya roja compactan solas con `/fin sin commits` aunque el ajuste
 * de Munir diga «no» o «fin»; en las suyas manda su ajuste (D8: sin su clic,
 * nada que él no haya pedido). Pedido de «Orquio General», 2026-10-22: sus
 * seis delegadas de ese día acabaron entre 588k y 832k tokens. Rust lleva su
 * propia lista (`Puente::delegadas`) para el MCP; las dos nacen en el mismo
 * `open_pane`, y al recrear su panel tras reiniciar vuelven por su
 * conversación (`delegacionDe` en `lib/delegadas.ts`, `al_nacer` en `mcp.rs`).
 */
const DELEGADAS = new Set<number>();
export function marcarDelegada(id: number): void {
  DELEGADAS.add(id);
}
export function esDelegada(id: number): boolean {
  return DELEGADAS.has(id);
}
export function guardarModoSolo(m: ModoSolo): void {
  try {
    localStorage.setItem(CLAVE_MODO, m);
  } catch {
    /* sin almacenamiento se queda en «no» */
  }
}
/** Sugerir compactar al acabar una tarea grande aunque vaya por el 40 %. */
export function leerSugerir(): boolean {
  try {
    return localStorage.getItem(CLAVE_SUGERIR) !== "0";
  } catch {
    return true;
  }
}
export function guardarSugerir(si: boolean): void {
  try {
    localStorage.setItem(CLAVE_SUGERIR, si ? "1" : "0");
  } catch {
    /* sin almacenamiento sigue encendido */
  }
}

/**
 * Compactar con traspaso, en dos pasos (Munir, 2026-10-07: «un botón que si le
 * das automáticamente se compacta con un mensaje de compactación y
 * actualizando los handoffs»). Primero se le pide al agente que deje el
 * traspaso escrito (el BUZON.md y los docs vivos, como un /fin sin commits);
 * cuando acaba ese turno suena la campana, y ahí va el `/compact` con qué
 * conservar. Los dos textos pasan por `t()` para que un agente de una app en
 * inglés los reciba en inglés.
 */
export function traspasoAntesDeCompactar(t: Translate, conFin = false, sinCommits = false): string {
  // `/fin sin commits` lo entiende la propia skill: escribe los traspasos y
  // lista lo suelto en vez de commitearlo. Es lo que va cuando nadie ha pulsado.
  if (conFin) return sinCommits ? "/fin sin commits" : "/fin";
  return t(
    "Antes de compactar, deja al día el traspaso: el BUZON.md del proyecto y sus docs vivos, con lo hecho (rutas exactas), lo pendiente y las trampas de hoy. Sin commits. Cuando acabes, te compacto yo.",
  );
}

/**
 * Si hay una skill `/fin` en `~/.claude/skills`, el traspaso ES ese cierre y no
 * un texto nuestro. Munir, 2026-10-07, al ver el texto escrito en su terminal:
 * «¿por qué no es un fin? es un mensaje raro». Se mira una vez por ventana.
 * Solo vale en un panel de Claude Code: en Codex o Gemini «/fin» no es nada.
 */
let finPrometido: Promise<boolean> | null = null;
export function tieneSkillFin(): Promise<boolean> {
  finPrometido ??= listSkills()
    .then((lista) => lista.some((s) => s.folder === "fin"))
    .catch(() => false);
  return finPrometido;
}

/**
 * Recuperar (decisión E2): al 80 % compactar sale peor que empezar, así que la
 * salida buena es una terminal NUEVA que arranque con el traspaso ya escrito.
 * Mismo baile que compactar: el agente deja el traspaso, suena su campana, y
 * la nueva nace con el encargo de seguir desde ahí.
 */
export function traspasoAntesDeNueva(t: Translate, conFin = false): string {
  if (conFin) return "/fin";
  return t(
    "Esta sesión ya pesa demasiado: deja al día el traspaso, el BUZON.md del proyecto y sus docs vivos, con lo hecho (rutas exactas), lo pendiente y las trampas de hoy. Sin commits. Cuando acabes, abro una terminal nueva que sigue desde ahí.",
  );
}

export function encargoDeRecuperar(t: Translate): string {
  return t(
    "Retomas el trabajo de la sesión anterior, que se quedó sin contexto: lee el BUZON.md del proyecto y sus docs vivos, y sigue desde lo pendiente.",
  );
}

/**
 * Ya compactada estas veces, compactar otra sale peor que seguir en una
 * terminal nueva: cada resumen se hace sobre el anterior y se va perdiendo
 * detalle (Orquio General llegó a la tercera y le pidió a Munir datos que ya le
 * había dado). Munir, 2026-10-22 (D4): «Sí, que me la ofrezca». Se cuentan las
 * marcas del transcript (`session_compactions`, en compactaciones.rs).
 */
export const COMPACTADA_DE_MAS = 2;

/**
 * El bloque «Retomar la sesión» que deja el `/fin` al final de su respuesta,
 * sin las vallas: es lo que se pega en frío en una sesión nueva, y por eso es
 * el primer mensaje de la terminal que sigue. Si falta el título, vale un
 * bloque que empiece por «# RETOMAR». `null` si no hay ninguno.
 */
export function bloqueRetomar(texto: string): string | null {
  const bloques = (desde: string) => [...desde.matchAll(/^```[^\n]*\n([\s\S]*?)\n```/gm)].map((m) => m[1].trim());
  const titulo = /^#{1,6}\s*Retomar la sesi[oó]n\b.*$/im.exec(texto);
  const tras = titulo ? bloques(texto.slice(titulo.index))[0] : undefined;
  return tras || bloques(texto).find((b) => /^#\s*RETOMAR\b/i.test(b)) || null;
}
const bloqueDe = (texto: string | null): string | null => (texto ? bloqueRetomar(texto) : null);

export function ordenDeCompactar(t: Translate): string {
  return t(
    "Conserva el estado real del repo, lo hecho con sus rutas exactas, lo pendiente y las trampas de hoy; lo demás, resumido.",
  );
}

/**
 * Lo que se le escribe a una sesión que se compactó a sí misma
 * (`compactarme`) cuando acaba de compactar, si no pidió otra cosa: Munir,
 * 2026-11-11, «compactar por tu cuenta en Adeorq y retomar la sesión».
 *
 * Con el bloque «Retomar» de su `/fin` (`bloqueRetomar` de su última
 * respuesta), ese bloque y una línea para que no se pare: Munir, 2026-11-14,
 * al ver la frase de la casa en su terminal, «¿qué es esto?, ¿por qué no se
 * coge el mensaje de retomar del historial de la terminal?». Sin bloque, la
 * frase de la casa.
 */
export function seguirTrasCompactar(t: Translate, retomar?: string | null): string {
  if (retomar?.trim()) {
    return `${retomar.trim()}\n\n${t("Ya estás compactada: sigue con «Lo siguiente» sin esperar; lo que solo puede decidir Munir, déjalo dicho y espera.")}`;
  }
  return t(
    "Ya estás compactada. Sigue con lo pendiente del resumen, sin repetir lo hecho; lo que solo puede decidir Munir, déjalo dicho y espera.",
  );
}

/** Cada cuánto se relee un traspaso en marcha sin esperar a la campana, y si ya
    acabó de compactar quien se compactó a sí misma. Claude Code no toca la
    campana al acabar un `/compact`, y la 2.1.322 tampoco al acabar un turno. */
export const VIGILA_COMPACTAR_MS = 3000;
/** Compactada y sin quedarse parada en este rato: otro siguió con ella, y el
    «sigue» ya no toca. */
export const SEGUIR_HASTA_MS = 60_000;

/** Lo que contesta el panel a `compactarme`: lo acepta, ya iba a seguir en
    una terminal nueva, o no sabe qué conversación es la suya y no vería
    cuándo acaba de compactar. */
export type RespuestaPropia = "aceptado" | "nueva" | "sin-conversacion";

/** Lo pendiente caduca: no se compacta a destiempo encima de otro trabajo. */
export const CADUCA_MS = 30 * 60_000;
/** Lo que se deja asentar el transcript tras la campana antes de leerlo: el
    CLI la toca al acabar un turno intermedio y arranca el siguiente al segundo. */
const ASIENTO_MS = 2500;
/** Una tarea es «grande» si subió el contexto esto en un turno, y se sugiere
    compactar desde aquí hasta el aviso: 50k y 200k, o el 10 y el 40 % de una
    ventana pequeña (`raya`). Medido en sus transcripts de siete días (1.981
    turnos): un turno sube 12k de mediana y 87k en el p90; 50k o más, uno de
    cada cinco y medio. El 85,8 % del gasto vive de los 200k para arriba. */
export const SUBIDA_TOKENS = 50_000;
export const SUBIDA_PCT = 10;
export const SUGERIR_TOKENS = 200_000;
export const SUGERIR_PCT = 40;

/** nada · esperando (pedido, a que acabe el turno) · cerrando (el traspaso
    ya va, el `/compact` o la terminal nueva cuando acabe). */
export type FaseTraspaso = "nada" | "esperando" | "cerrando";

export interface DepsTraspaso {
  t: Translate;
  mandar: (texto: string) => Promise<void>;
  /** El transcript releído AHORA, no el de hace veinte segundos. `null` si
      este CLI no deja uno: entonces el botón va a ciegas, como siempre, y
      solo no se hace nada. */
  leer: () => Promise<(Pick<ContextInfo, "state" | "agentsLive" | "used" | "window"> & Pick<Partial<ContextInfo>, "sinCuota">) | null>;
  /** Un menú suyo en pantalla (permiso, pregunta). */
  hayPregunta: () => boolean;
  /** Algo tecleado y sin mandar: lo nuestro se pegaría detrás. */
  hayBorrador: () => boolean;
  /** El CLI dice en pantalla que sigue con el turno (`trabajaEnPantalla`). */
  trabajando: () => boolean;
  /** Claude Code parado en su caja vacía (`esperaEnSuCaja`). Solo se mira en
      un panel de Claude Code; sin ella, como si estuviera. */
  enSuCaja?: () => boolean;
  /** Claude Code contestó que no conoce `/fin` (`finDesconocidoEnPantalla`). */
  finDesconocido?: () => boolean;
  /** El nivel de aviso que ya se despachó con × o «Ahora no». */
  visto: () => number;
  modo: () => ModoSolo;
  /** La abrió un agente (`esDelegada`): compacta sola y sin commits. */
  delegada?: () => boolean;
  sugerir: () => boolean;
  esClaude: () => boolean;
  tieneFin: () => Promise<boolean>;
  /** Cuántas veces se compactó ya esta conversación (`COMPACTADA_DE_MAS`). */
  compactaciones: () => Promise<number>;
  /** Lo último que contestó el agente: la respuesta del `/fin`. */
  ultimaRespuesta: () => Promise<string | null>;
  /** El rastro de la vieja, para que la barra la archive al cerrarla. */
  archivar: () => Promise<void>;
  /** La terminal nueva, con el bloque «Retomar» de primer mensaje (o, sin
      él, el encargo de la casa). */
  abrirNueva?: (encargo: string | null) => void;
  /** Con los tokens que lleva. */
  alSugerir?: (tokens: number) => void;
  alCambiar?: (f: FaseTraspaso) => void;
  esperar?: (ms: number) => Promise<void>;
  ahora?: () => number;
}

/**
 * Los dos bailes en dos pasos de un panel (compactar y recuperar): primero el
 * traspaso (`/fin`), después el `/compact` o la terminal nueva. Cada paso se
 * teclea SOLO con el turno acabado (`turnoAcabado`), así que pulsar Compactar
 * con el agente trabajando ya no se le cuela a mitad: espera a que acabe, por
 * su campana (la de verdad o la del detector de `lib/finDeTurno.ts`) o
 * releyendo cada poco (`mirarSinCampana`).
 *
 * Y la raya roja (Munir, 2026-10-22: «casi obligatorio»): si el ajuste lo dice
 * (`ModoSolo`), la campana de un turno acabado lo empieza sola, con
 * `/fin sin commits` salvo que el ajuste pida el entero. «Ahora no» lo para
 * hasta el aviso siguiente. Tras compactar no vuelve a empezar con el número
 * viejo del transcript: espera a verlo bajar del aviso.
 *
 * Sin React a propósito, para que el banco lo pase entero
 * (`scripts/contexto-check.ts`).
 */
export function crearTraspaso(d: DepsTraspaso) {
  const ahora = d.ahora ?? Date.now;
  const esperar = d.esperar ?? ((ms: number) => new Promise<void>((r) => window.setTimeout(r, ms)));
  /** `solo`: no lo pulsó nadie, así que sin transcript no se va a ciegas.
      `sinCommits`: el traspaso es `/fin sin commits` y no el entero. */
  /** `propia`: la pidió la sesión para sí misma (`compactarme`), con su
      `mensaje` para el `/compact` y lo que se le escribe después (`seguir`,
      `null` para nada). `antes`: sus compactaciones al mandar el `/compact`.
      `usado`: los tokens que decía el transcript al mandar el `/fin`. */
  let pendiente: {
    que: "compactar" | "nueva" | "propia";
    paso: Exclude<FaseTraspaso, "nada">;
    solo: boolean;
    sinCommits: boolean;
    desde: number;
    mensaje?: string;
    seguir?: string | null;
    antes?: number;
    usado?: number;
  } | null = null;
  /** Ya compactó en esta subida: no repetir hasta verlo bajar. */
  let hecho = false;
  /** El porcentaje al acabar el último turno, para medir lo que subió este. */
  let base: number | null = null;
  /**
   * Un solo candado para la campana, el botón y `compactar_terminal`
   * (revisión de `1954cf0`). El pedido del agente no pasaba por él: mandaba el
   * `/fin` mientras una campana leía el transcript, y esa campana llegaba
   * después con su lectura de ANTES y pegaba el `/compact` detrás del `/fin`.
   * Una campana que llega con el candado cogido se suelta, como siempre; los
   * pedidos esperan su turno, que no se pierda ninguno.
   */
  let candado: Promise<void> | null = null;
  const conCandado = async (f: () => Promise<void>, siOcupado: "esperar" | "soltar") => {
    while (candado) {
      if (siOcupado === "soltar") return;
      await candado;
    }
    let abrir = () => {};
    candado = new Promise<void>((r) => (abrir = r));
    try {
      await f();
    } finally {
      candado = null;
      abrir();
    }
  };
  /** El transcript releído ahora, con cuándo se pidió. */
  const leerAhora = async () => {
    const en = ahora();
    return { c: await d.leer().catch(() => null), en };
  };

  const fase = (): FaseTraspaso => pendiente?.paso ?? "nada";
  const poner = (p: typeof pendiente) => {
    pendiente = p;
    d.alCambiar?.(fase());
    if (p) void mirarSinCampana().catch(() => {});
  };

  /** `/fin` si es Claude Code y la skill existe; si no, el texto de la casa. */
  const traspaso = async (que: "compactar" | "nueva", sinCommits: boolean) => {
    const fin = d.esClaude() && (await d.tieneFin().catch(() => false));
    if (que === "nueva") return traspasoAntesDeNueva(d.t, fin);
    return traspasoAntesDeCompactar(d.t, fin, sinCommits);
  };

  /** El paso siguiente, si el turno lo deja; si no, a la próxima campana.
      `en` es cuándo se pidió la lectura `c`. `porVuelta`: la pide
      `mirarSinCampana` y no una campana, que es lo que dice que un turno acabó. */
  const avanzar = async (c: Awaited<ReturnType<DepsTraspaso["leer"]>>, en: number, porVuelta = false) => {
    const p = pendiente;
    if (!p) return;
    if (ahora() - p.desde > CADUCA_MS) return poner(null);
    const puede = c ? turnoAcabado(c, d.hayPregunta()) && !d.hayBorrador() && !d.trabajando() : !p.solo;
    if (!puede) return;
    // Parada por cuota, `/fin` y `/compact` fallan, y el `/compact` fallido tapa
    // el 429 (la terminal 19, 2026-11-14): se espera a que se renueve o la releve
    // otra cuenta (`mcp/relevo_cuota.rs`), y lo pendiente caduca como siempre.
    if (c?.sinCuota) return;
    // Y en Claude Code, con su caja a la vista: si no, el CLI se cerró (o
    // tiene un menú abierto) y lo tecleado iría a otro sitio.
    if (d.esClaude() && !(d.enSuCaja?.() ?? true)) return;
    if (p.que === "propia") {
      // El traspaso ya lo hizo ella (es su mensaje): solo el `/compact`, y
      // lo que viene después lo mira `vigilar`, no la campana.
      if (p.paso !== "esperando") return;
      // Lo pide a mitad de su propio turno: solo con una lectura asentada de
      // DESPUÉS de pedirlo (la de su campana), nunca con la del momento.
      if (en - p.desde < ASIENTO_MS) return;
      const antes = await d.compactaciones().catch(() => 0);
      // Sin `seguir` dado, el «Retomar» de su `/fin`: se lee ahora, con su
      // turno ya acabado, porque llama a `compactarme` ANTES de escribirlo.
      const seguir = p.seguir === undefined ? seguirTrasCompactar(d.t, bloqueDe(await d.ultimaRespuesta().catch(() => null))) : p.seguir;
      if (pendiente !== p) return;
      const cerrando = { ...p, paso: "cerrando" as const, desde: ahora(), antes, seguir };
      poner(cerrando);
      await d.mandar(`/compact ${p.mensaje ?? ""}`.trimEnd());
      void vigilar(cerrando);
      return;
    }
    if (p.paso === "esperando") {
      const texto = await traspaso(p.que, p.sinCommits);
      if (pendiente !== p) return; // «Ahora no» mientras se miraba la skill
      const cerrando = { ...p, paso: "cerrando" as const, desde: ahora(), usado: c?.used };
      poner(cerrando);
      await d.mandar(texto);
      // Un `/fin` que esa terminal no conoce no abre turno ni toca la campana,
      // así que el `/compact` esperaría para siempre: va el texto de la casa,
      // que sí abre turno, y a su campana sigue el baile de siempre.
      if (texto.startsWith("/fin")) {
        await esperar(ASIENTO_MS);
        if (pendiente === cerrando && d.finDesconocido?.()) {
          const casa = p.que === "nueva" ? traspasoAntesDeNueva(d.t) : traspasoAntesDeCompactar(d.t);
          poner({ ...cerrando, desde: ahora() });
          await d.mandar(casa);
        }
      }
      return;
    }
    // El `/compact` (o la nueva) solo con una lectura de DESPUÉS del `/fin`, y
    // asentada: una de antes dice «lista» del turno anterior, no del `/fin`.
    if (en - p.desde < ASIENTO_MS) return;
    // Y sin campana, solo si el transcript se movió desde el `/fin`: el turno
    // del `/fin` deja otro número de tokens. Si no se movió, es la lectura de
    // antes y no la del `/fin` acabado (el Claude de mentira de
    // `tope-de-contexto-de-verdad.mjs` no apunta nada tras el `/fin`).
    if (porVuelta && p.usado != null && c?.used === p.usado) return;
    poner(null);
    // Hecho en los dos casos: la vieja no se compacta sola después.
    hecho = true;
    if (p.que === "nueva") {
      const respuesta = await d.ultimaRespuesta().catch(() => null);
      d.abrirNueva?.(respuesta ? bloqueRetomar(respuesta) : null);
      await d.archivar().catch(() => {});
      return;
    }
    await d.mandar(`/compact ${ordenDeCompactar(d.t)}`);
  };

  const pedir = (que: "compactar" | "nueva") =>
    conCandado(async () => {
      poner({ que, paso: "esperando", solo: false, sinCommits: false, desde: ahora() });
      const { c, en } = await leerAhora();
      await avanzar(c, en);
    }, "esperar");

  /** Lo pide un agente por el MCP (`compactar_terminal`): como el botón,
      pero sin commits y nunca a ciegas, y si ya hay un traspaso en marcha
      (lo pulsó Munir, o lo empezó la campana) no se empieza otro. */
  const pedirDeAgente = () =>
    conCandado(async () => {
      if (pendiente) return;
      poner({ que: "compactar", paso: "esperando", solo: true, sinCommits: true, desde: ahora() });
      const { c, en } = await leerAhora();
      await avanzar(c, en);
    }, "esperar");

  /**
   * Tras el `/compact` de una sesión que se compactó a sí misma: mira cada
   * poco si ya hay una compactación más en su transcript y vuelve a estar
   * parada en su caja, y entonces le escribe que siga. Fuera del candado, para
   * que el botón no espere minutos a que acabe un resumen; el último paso sí
   * lo coge. «Ahora no» o caducar lo paran.
   */
  const vigilar = async (p: NonNullable<typeof pendiente>) => {
    /** Cuándo se vio la compactación hecha. Si para entonces ya no está
        parada, alguien (Munir) siguió con ella: no se le escribe encima. */
    let compactada: number | null = null;
    while (pendiente === p) {
      await esperar(VIGILA_COMPACTAR_MS);
      if (pendiente !== p) return;
      if (ahora() - p.desde > CADUCA_MS) return poner(null);
      if (compactada == null) {
        if ((await d.compactaciones().catch(() => 0)) <= (p.antes ?? 0)) continue;
        compactada = ahora();
      }
      const { c } = await leerAhora();
      const parada = !!c && turnoAcabado(c, d.hayPregunta()) && !d.hayBorrador() && !d.trabajando();
      if (!parada || (d.esClaude() && !(d.enSuCaja?.() ?? true))) {
        if (ahora() - compactada > SEGUIR_HASTA_MS) return poner(null);
        continue;
      }
      await conCandado(async () => {
        if (pendiente !== p) return;
        poner(null);
        // Recién compactada: que la raya no la vuelva a compactar con el
        // número viejo hasta verla bajar.
        hecho = true;
        if (p.seguir) await d.mandar(p.seguir);
      }, "esperar");
      return;
    }
  };

  /** Lo pide la sesión para sí misma por el MCP (`compactarme`). Si ya iba a
      seguir en una terminal nueva no se compacta; si había otro traspaso en
      marcha (el `/fin sin commits` de la raya o de `compactar_terminal`, que
      ahora acaba llamando aquí) lo sustituye, para no compactar dos veces. */
  const pedirPropia = (mensaje: string, seguir: string | null | undefined): RespuestaPropia => {
    if (pendiente?.que === "nueva") return "nueva";
    void conCandado(async () => {
      if (pendiente?.que === "nueva") return;
      poner({ que: "propia", paso: "esperando", solo: true, sinCommits: true, desde: ahora(), mensaje, seguir });
      const { c, en } = await leerAhora();
      await avanzar(c, en);
    }, "esperar").catch(() => {});
    return "aceptado";
  };

  /**
   * Lo pendiente avanza aunque no suene la campana. Claude Code 2.1.322 no la
   * toca al acabar un turno: con el canal de fábrica, nunca, y con
   * `terminal_bell`, al minuto de quedarse parado (medido el 2026-11-11 con
   * `scripts/laboratorio/campana-de-verdad.mjs`). Sin esto, tras el `/fin` del
   * botón, de la raya o de `compactar_terminal` el `/compact` no llegaba nunca.
   * Mientras haya un traspaso en marcha se relee cada poco y se avanza con las
   * llaves de siempre (`avanzar`), y tras el `/fin` solo con una lectura
   * asentada (`ASIENTO_MS`) y con el transcript movido desde el `/fin`: una
   * «lista» de antes no vale. Sin transcript (un panel que no es de Claude
   * Code) no se mira: a ciegas, solo la campana. Lo de `compactarme` ya
   * compactando lo mira `vigilar`. Uno solo a la vez.
   */
  let mirando = false;
  const porMirar = () => !!pendiente && d.esClaude() && !(pendiente.que === "propia" && pendiente.paso === "cerrando");
  const mirarSinCampana = async () => {
    if (mirando) return;
    mirando = true;
    try {
      while (porMirar()) {
        await esperar(VIGILA_COMPACTAR_MS);
        await conCandado(async () => {
          if (!porMirar()) return;
          const { c, en } = await leerAhora();
          if (c) await avanzar(c, en, true);
          else if (pendiente && ahora() - pendiente.desde > CADUCA_MS) poner(null);
        }, "soltar");
      }
    } finally {
      mirando = false;
    }
  };

  const alSonar = () =>
    conCandado(async () => {
      await esperar(ASIENTO_MS);
      const { c, en } = await leerAhora();
      const nivel = nivelDeContexto(c);
      if (c && nivel === 0) hecho = false;
      if (c && turnoAcabado(c, d.hayPregunta())) {
        const grande =
          base != null && c.used >= raya(SUGERIR_TOKENS, SUGERIR_PCT, c.window) && c.used - base >= raya(SUBIDA_TOKENS, SUBIDA_PCT, c.window);
        if (d.sugerir() && !pendiente && nivel === 0 && grande) d.alSugerir?.(c.used);
        base = c.used;
      }
      // Ya compactada dos veces no se compacta una tercera sola: el aviso
      // ofrece seguir en una terminal nueva, y sin su clic se queda ahí. En
      // una delegada se le avisa a quien la abrió (`mcp.rs`).
      const modo: ModoSolo = d.delegada?.() ? "sin-commits" : d.modo();
      if (c && !c.sinCuota && !pendiente && !hecho && nivel >= 2 && nivel > d.visto() && modo !== "no" && d.esClaude()) {
        if ((await d.compactaciones().catch(() => 0)) < COMPACTADA_DE_MAS) {
          poner({ que: "compactar", paso: "esperando", solo: true, sinCommits: modo !== "fin", desde: ahora() });
        }
      }
      await avanzar(c, en);
    }, "soltar");

  return { pedir, pedirDeAgente, pedirPropia, alSonar, cancelar: () => poner(null), fase };
}

/**
 * `crearTraspaso` colgado de un panel. Se llama una vez por panel;
 * `alSonarCampana` va en la campana del terminal, por ref.
 */
export function useTraspaso(m: {
  id: number;
  t: Translate;
  /** El nivel del aviso que se está enseñando, para apagarlo al pulsar. */
  avisoCtx: number;
  /** El nivel del contexto, se enseñe o no: «Ahora no» lo da por visto. */
  nivel: number;
  visto: number;
  setCtxVisto: (n: number) => void;
  onNueva?: (id: number, encargo?: string) => void;
  /** Si en este panel corre Claude Code, que es el único que entiende `/fin`. */
  esClaude?: boolean;
  /** Dónde y qué conversación: para releerla, contar sus compactaciones y
      dejarle el rastro. Sin Claude Code no se lee nada (va a ciegas), y sin
      la conversación SABIDA (la de su comando) tampoco (`leerDelPanel`). */
  cwd: string;
  sesion?: string;
  nombre: string;
  hayPregunta: () => boolean;
  hayBorrador: () => boolean;
  trabajando: () => boolean;
  enSuCaja: () => boolean;
  finDesconocido: () => boolean;
}) {
  const [fase, setFase] = useState<FaseTraspaso>("nada");
  const [sugerencia, setSugerencia] = useState<number | null>(null);
  /** Las veces que se compactó, sabidas desde la raya roja: el aviso ofrece la nueva. */
  const [veces, setVeces] = useState(0);
  /** Ya sigue en una terminal nueva: esta solo ofrece cerrarse. */
  const [relevada, setRelevada] = useState(false);
  const ultimo = useRef(m);
  ultimo.current = m;
  const contar = () => {
    const u = ultimo.current;
    if (!u.esClaude || !u.sesion) return Promise.resolve(0);
    return sessionCompactions(u.cwd, u.sesion).then((n) => {
      setVeces(n);
      return n;
    });
  };
  useEffect(() => {
    if (m.nivel >= 2) void contar().catch(() => {});
  }, [m.nivel >= 2, m.sesion]);
  const tr = useRef<ReturnType<typeof crearTraspaso> | null>(null);
  tr.current ??= crearTraspaso({
    t: ((...a: Parameters<Translate>) => ultimo.current.t(...a)) as Translate,
    mandar: (texto) => sendPty(ultimo.current.id, texto),
    leer: () => leerDelPanel(ultimo.current),
    hayPregunta: () => ultimo.current.hayPregunta(),
    hayBorrador: () => ultimo.current.hayBorrador(),
    trabajando: () => ultimo.current.trabajando(),
    enSuCaja: () => ultimo.current.enSuCaja(),
    finDesconocido: () => ultimo.current.finDesconocido(),
    visto: () => ultimo.current.visto,
    modo: leerModoSolo,
    delegada: () => esDelegada(ultimo.current.id),
    sugerir: leerSugerir,
    esClaude: () => !!ultimo.current.esClaude,
    tieneFin: tieneSkillFin,
    compactaciones: contar,
    // Entera: `last_reply` corta a 4.000 caracteres desde el principio, y el
    // bloque «Retomar» es lo ÚLTIMO de la respuesta del /fin.
    // Sin su conversación sabida, ninguna: la más reciente de la carpeta es de otro.
    ultimaRespuesta: () => (ultimo.current.sesion ? lastReply(ultimo.current.cwd, ultimo.current.sesion, 100_000) : Promise.resolve(null)),
    archivar: async () => {
      const u = ultimo.current;
      if (u.sesion) await rastroDeRelevo(u.nombre, u.cwd, u.sesion);
      setRelevada(true);
    },
    abrirNueva: (encargo) => ultimo.current.onNueva?.(ultimo.current.id, encargo ?? undefined),
    alSugerir: setSugerencia,
    alCambiar: setFase,
  });
  const traspaso = tr.current;

  const pedir = (que: "compactar" | "nueva") => {
    setSugerencia(null);
    m.setCtxVisto(Math.max(m.avisoCtx, m.visto));
    void traspaso.pedir(que).catch(() => {});
  };
  return {
    compactar: () => pedir("compactar"),
    nueva: () => pedir("nueva"),
    /** `compactar_terminal`: devuelve la fase en que lo encontró, al momento. */
    deAgente: (): FaseTraspaso => {
      const antes = traspaso.fase();
      setSugerencia(null);
      void traspaso.pedirDeAgente().catch(() => {});
      return antes;
    },
    /** `compactarme`: la sesión se compacta a sí misma. Sin su conversación
        sabida no se vería cuándo acaba, y no se acepta. `seguir` sin dar es
        el de la casa; vacío, nada. */
    propia: (mensaje: string, seguir: string | null | undefined): RespuestaPropia => {
      const u = ultimo.current;
      if (!u.esClaude || !u.sesion) return "sin-conversacion";
      setSugerencia(null);
      // Sin dar, `undefined`: el de la casa se arma al mandar el `/compact`, con su «Retomar».
      return traspaso.pedirPropia(mensaje, seguir == null ? undefined : seguir || null);
    },
    alSonarCampana: () => void traspaso.alSonar().catch(() => {}),
    /** Nada solo en este nivel, y fuera lo que estuviera esperando. */
    ahoraNo: () => {
      m.setCtxVisto(Math.max(m.nivel, m.visto));
      traspaso.cancelar();
    },
    fase,
    sugerencia,
    descartarSugerencia: () => setSugerencia(null),
    veces,
    relevada,
    descartarRelevo: () => setRelevada(false),
  };
}

/** El evento `adeorq:traspaso`: quien lo lanza mira `hecho` (y `fase` o
    `parte`) al volver, porque el panel contesta en el mismo momento. */
export interface DetalleTraspaso {
  id: number;
  que: string;
  hecho: boolean;
  deAgente?: boolean;
  fase?: FaseTraspaso;
  /** `compactarme`: su mensaje y lo que se le escribe al acabar. */
  propia?: { mensaje: string; seguir?: string | null };
  parte?: RespuestaPropia;
}

/**
 * Los mismos dos botones, pedidos desde el móvil (`traspaso` en lib/movil.ts),
 * y el compactar de un agente por el MCP (`compactar_terminal`, con `deAgente`
 * en `lib/puenteMcp.ts`): lo hace el panel, con su traspaso y su campana, y
 * avisa de que lo oyó (`hecho`) para que quien pide sepa si había alguien
 * detrás de ese número. Al agente se le dice además en qué fase lo encontró.
 */
export function useTraspasoDelMovil(
  id: number,
  traspaso: {
    compactar: () => void;
    nueva: () => void;
    deAgente: () => FaseTraspaso;
    propia: (mensaje: string, seguir: string | null | undefined) => RespuestaPropia;
  },
): void {
  const ultimo = useRef(traspaso);
  ultimo.current = traspaso;
  useEffect(() => {
    const oir = (ev: Event) => {
      const d = (ev as CustomEvent<DetalleTraspaso>).detail;
      if (d?.id !== id) return;
      d.hecho = true;
      if (d.propia) d.parte = ultimo.current.propia(d.propia.mensaje, d.propia.seguir);
      else if (d.deAgente) d.fase = ultimo.current.deAgente();
      else if (d.que === "nueva") ultimo.current.nueva();
      else ultimo.current.compactar();
    };
    window.addEventListener("adeorq:traspaso", oir);
    return () => window.removeEventListener("adeorq:traspaso", oir);
  }, [id]);
}
