// Cuánto pesa el contexto de una sesión, y qué se le dice al agente para
// compactarla sin perder el hilo. Vivía en TerminalPane.tsx.

import { useEffect, useRef, useState } from "react";
import { sessionIdOf } from "./comandos";
import type { Translate } from "./i18n";
import { sabe } from "./providers";
import { codexContext, listSkills, sendPty, sessionContext, type ContextInfo } from "./pty";

/** Cada cuánto se relee la sesión de un panel: deprisa mientras trabaja. */
const RELEER_MS = 20_000;
const RELEER_TRABAJANDO_MS = 6_000;

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
    const look = () => {
      sessionContext(cwd, sid)
        .then((c) => {
          if (stop) return;
          setCtx(c);
          timer = window.setTimeout(look, c && c.agentsLive > 0 ? 6_000 : 20_000);
        })
        .catch(() => {
          if (!stop) timer = window.setTimeout(look, 20_000);
        });
    };
    look();
    return () => {
      stop = true;
      window.clearTimeout(timer);
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
 * 0 = nada que decir · 1 = ya pesa (50 %) · 2 = compacta ya (60 %, fijo, y
 * compacta solo si el ajuste lo dice) · 3 = compactar sale peor que empezar
 * (80 %). El 50 y el 60 son de Munir, 2026-10-22, tras gastar el 40 % de su
 * semana en un día: «que sea casi obligatorio compactar en ese rango». Antes
 * el primer aviso salía al 60, y para entonces ya se llevaba pagado de más.
 *
 * Se mide SOLO en porcentaje de la ventana, y eso corrige lo anterior.
 *
 * Antes había una doble vara: saltaba por tokens (150.000 y 400.000) o por
 * porcentaje, lo que ocurriera antes. La idea era que lo que cuesta dinero
 * son los tokens y no la fracción; el efecto real fue el contrario. Opus 5 y
 * Sonnet 5 declaran un MILLÓN de ventana, así que la vara de los tokens
 * disparaba siempre primero: el primer aviso al 15 % y el «compactar sale
 * peor que empezar de cero» al 40 %, con el 60 % de la ventana todavía libre.
 * Dicho de otra forma: cualquier sesión de trabajo de verdad nacía avisada, y
 * el aviso grave mentía (Munir, 2026-08-06: «son muy molestas y aunque el
 * contexto esté por debajo del 50 % siguen apareciendo»).
 *
 * Con una sola vara el aviso vuelve a querer decir algo en cualquier modelo:
 * con Haiku el 60 % son 120.000 tokens y con Opus 600.000, que es justo la
 * diferencia que la doble vara borraba. Y lo que cuesta la sesión sigue
 * estando a la vista sin que nadie avise: la píldora de la cabecera lleva el
 * número puesto todo el rato.
 */
export const AVISO_PCT = 50;
export const FIJO_PCT = 60;
export const NUEVA_PCT = 80;
export type NivelCtx = 0 | 1 | 2 | 3;
export function nivelDeContexto(percent: number | undefined): NivelCtx {
  if (percent == null) return 0;
  return percent >= NUEVA_PCT ? 3 : percent >= FIJO_PCT ? 2 : percent >= AVISO_PCT ? 1 : 0;
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

export function ordenDeCompactar(t: Translate): string {
  return t(
    "Conserva el estado real del repo, lo hecho con sus rutas exactas, lo pendiente y las trampas de hoy; lo demás, resumido.",
  );
}

/** Lo pendiente caduca: no se compacta a destiempo encima de otro trabajo. */
export const CADUCA_MS = 30 * 60_000;
/** Lo que se deja asentar el transcript tras la campana antes de leerlo: el
    CLI la toca al acabar un turno intermedio y arranca el siguiente al segundo. */
const ASIENTO_MS = 2500;
/** Una tarea es «grande» si subió el contexto estos puntos en un turno. */
export const SUBIDA_GRANDE = 10;
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
  leer: () => Promise<Pick<ContextInfo, "state" | "agentsLive" | "percent"> | null>;
  /** Un menú suyo en pantalla (permiso, pregunta). */
  hayPregunta: () => boolean;
  /** Algo tecleado y sin mandar: lo nuestro se pegaría detrás. */
  hayBorrador: () => boolean;
  /** El CLI dice en pantalla que sigue con el turno (`trabajaEnPantalla`). */
  trabajando: () => boolean;
  /** El nivel de aviso que ya se despachó con × o «Ahora no». */
  visto: () => number;
  modo: () => ModoSolo;
  sugerir: () => boolean;
  esClaude: () => boolean;
  tieneFin: () => Promise<boolean>;
  abrirNueva?: () => void;
  alSugerir?: (pct: number) => void;
  alCambiar?: (f: FaseTraspaso) => void;
  esperar?: (ms: number) => Promise<void>;
  ahora?: () => number;
}

/**
 * Los dos bailes en dos pasos de un panel (compactar y recuperar): primero el
 * traspaso (`/fin`), después el `/compact` o la terminal nueva. Cada paso se
 * teclea SOLO con el turno acabado (`turnoAcabado`), así que pulsar Compactar
 * con el agente trabajando ya no se le cuela a mitad: espera a su campana.
 *
 * Y el 60 % (Munir, 2026-10-22: «casi obligatorio»): si el ajuste lo dice
 * (`ModoSolo`), la campana de un turno acabado lo empieza sola, con
 * `/fin sin commits` salvo que el ajuste pida el entero. «Ahora no» lo para
 * hasta el aviso siguiente. Tras compactar no vuelve a empezar con el número
 * viejo del transcript: espera a verlo bajar del 50 %.
 *
 * Sin React a propósito, para que el banco lo pase entero
 * (`scripts/contexto-check.ts`).
 */
export function crearTraspaso(d: DepsTraspaso) {
  const ahora = d.ahora ?? Date.now;
  const esperar = d.esperar ?? ((ms: number) => new Promise<void>((r) => window.setTimeout(r, ms)));
  let pendiente: { que: "compactar" | "nueva"; paso: Exclude<FaseTraspaso, "nada">; solo: boolean; desde: number } | null = null;
  /** Ya compactó en esta subida: no repetir hasta verlo bajar. */
  let hecho = false;
  /** El porcentaje al acabar el último turno, para medir lo que subió este. */
  let base: number | null = null;
  let ocupado = false;

  const fase = (): FaseTraspaso => pendiente?.paso ?? "nada";
  const poner = (p: typeof pendiente) => {
    pendiente = p;
    d.alCambiar?.(fase());
  };

  /** `/fin` si es Claude Code y la skill existe; si no, el texto de la casa. */
  const traspaso = async (que: "compactar" | "nueva", solo: boolean) => {
    const fin = d.esClaude() && (await d.tieneFin().catch(() => false));
    if (que === "nueva") return traspasoAntesDeNueva(d.t, fin);
    return traspasoAntesDeCompactar(d.t, fin, solo && d.modo() !== "fin");
  };

  /** El paso siguiente, si el turno lo deja; si no, a la próxima campana. */
  const avanzar = async (c: Awaited<ReturnType<DepsTraspaso["leer"]>>) => {
    const p = pendiente;
    if (!p) return;
    if (ahora() - p.desde > CADUCA_MS) return poner(null);
    const puede = c ? turnoAcabado(c, d.hayPregunta()) && !d.hayBorrador() && !d.trabajando() : !p.solo;
    if (!puede) return;
    if (p.paso === "esperando") {
      const texto = await traspaso(p.que, p.solo);
      if (pendiente !== p) return; // «Ahora no» mientras se miraba la skill
      poner({ ...p, paso: "cerrando", desde: ahora() });
      await d.mandar(texto);
      return;
    }
    poner(null);
    if (p.que === "nueva") return d.abrirNueva?.();
    hecho = true;
    await d.mandar(`/compact ${ordenDeCompactar(d.t)}`);
  };

  const pedir = async (que: "compactar" | "nueva") => {
    poner({ que, paso: "esperando", solo: false, desde: ahora() });
    await avanzar(await d.leer().catch(() => null));
  };

  const alSonar = async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      await esperar(ASIENTO_MS);
      const c = await d.leer().catch(() => null);
      const nivel = nivelDeContexto(c?.percent);
      if (c && nivel === 0) hecho = false;
      if (c && turnoAcabado(c, d.hayPregunta())) {
        if (d.sugerir() && !pendiente && nivel === 0 && base != null && c.percent >= SUGERIR_PCT && c.percent - base >= SUBIDA_GRANDE) {
          d.alSugerir?.(c.percent);
        }
        base = c.percent;
      }
      if (c && !pendiente && !hecho && nivel >= 2 && nivel > d.visto() && d.modo() !== "no" && d.esClaude()) {
        poner({ que: "compactar", paso: "esperando", solo: true, desde: ahora() });
      }
      await avanzar(c);
    } finally {
      ocupado = false;
    }
  };

  return { pedir, alSonar, cancelar: () => poner(null), fase };
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
  onNueva?: (id: number) => void;
  /** Si en este panel corre Claude Code, que es el único que entiende `/fin`. */
  esClaude?: boolean;
  leer: DepsTraspaso["leer"];
  hayPregunta: () => boolean;
  hayBorrador: () => boolean;
  trabajando: () => boolean;
}) {
  const [fase, setFase] = useState<FaseTraspaso>("nada");
  const [sugerencia, setSugerencia] = useState<number | null>(null);
  const ultimo = useRef(m);
  ultimo.current = m;
  const tr = useRef<ReturnType<typeof crearTraspaso> | null>(null);
  tr.current ??= crearTraspaso({
    t: ((...a: Parameters<Translate>) => ultimo.current.t(...a)) as Translate,
    mandar: (texto) => sendPty(ultimo.current.id, texto),
    leer: () => ultimo.current.leer(),
    hayPregunta: () => ultimo.current.hayPregunta(),
    hayBorrador: () => ultimo.current.hayBorrador(),
    trabajando: () => ultimo.current.trabajando(),
    visto: () => ultimo.current.visto,
    modo: leerModoSolo,
    sugerir: leerSugerir,
    esClaude: () => !!ultimo.current.esClaude,
    tieneFin: tieneSkillFin,
    abrirNueva: () => ultimo.current.onNueva?.(ultimo.current.id),
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
    alSonarCampana: () => void traspaso.alSonar().catch(() => {}),
    /** Nada solo en este nivel, y fuera lo que estuviera esperando. */
    ahoraNo: () => {
      m.setCtxVisto(Math.max(m.nivel, m.visto));
      traspaso.cancelar();
    },
    fase,
    sugerencia,
    descartarSugerencia: () => setSugerencia(null),
  };
}

/**
 * Los mismos dos botones, pedidos desde el móvil (`traspaso` en lib/movil.ts):
 * lo hace el panel, con su traspaso y su campana, y avisa de que lo oyó
 * (`hecho`) para que el móvil sepa si había alguien detrás de ese número.
 */
export function useTraspasoDelMovil(id: number, traspaso: { compactar: () => void; nueva: () => void }): void {
  const ultimo = useRef(traspaso);
  ultimo.current = traspaso;
  useEffect(() => {
    const oir = (ev: Event) => {
      const d = (ev as CustomEvent<{ id: number; que: string; hecho: boolean }>).detail;
      if (d?.id !== id) return;
      d.hecho = true;
      if (d.que === "nueva") ultimo.current.nueva();
      else ultimo.current.compactar();
    };
    window.addEventListener("adeorq:traspaso", oir);
    return () => window.removeEventListener("adeorq:traspaso", oir);
  }, [id]);
}
