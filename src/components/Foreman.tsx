import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  findAgy,
  foremanAgente,
  foremanPlan,
  foremanPrompt,
  listProjects,
  listSkills,
  openInAntigravity,
  scanSessions,
  writeMission,
  type ForemanPlan,
  type PartePlan,
  type PlanAction,
  type PaneStatus,
  type Project,
  type SessionInfo,
  type Skill,
} from "../lib/pty";
import type { Account } from "../lib/pty";
import {
  A_MANO,
  cerebroPorDefecto,
  isModelAlias,
  modelForRole,
  modelPolicyText,
  type ModelAlias,
} from "../lib/models";
import {
  comoPeso,
  interpretar,
  modoAviso,
  recetar,
  PESO,
  exigenciaDeRol,
  pesoDelPlan,
  type CuentaViva,
  type Esfuerzo,
  type Exigencia,
  type Receta,
} from "../lib/router";
import { mirarMundo, mundoEnCache } from "../lib/mundo";
import { leerPerfil } from "../lib/perfil";
import { providerOf, sabe } from "../lib/providers";
import {
  MODOS,
  ROTULO,
  aviso as avisoDelModo,
  guardarModo,
  leerModo,
  manosDe,
  type ModoCapataz,
} from "../lib/manos";
import { createPortal } from "react-dom";
import { useT } from "../lib/i18n";
import Orbe, { type EstadoOrbe } from "./Orbe";
import { BoltIcon, CheckIcon, CloseIcon, VozIcon } from "./Icons";
import { decir, parar, vozElegida, VOCES, VOZ_KEY } from "../lib/hablar";
import { propsDeVelo } from "../lib/velo";
import { dictar, transcribir, vozLista, type Dictado } from "../lib/voz";
import { COMMANDS } from "../lib/commands";

/** Executors provided by App: the deterministic side of the Foreman. */
export interface ForemanExec {
  onResume: (s: SessionInfo) => void;
  onOpenClaude: (name: string, cwd: string) => void;
  onOpenClaudePrompt: (
    label: string,
    cwd: string,
    prompt: string,
    model?: string,
    team?: any,
    shadow?: boolean,
    extras?: { esfuerzo?: string },
  ) => void;
  /** Abre una cuadrilla entera de golpe, marcada como equipo. */
  onOpenTeam: (
    objetivo: string,
    cwd: string,
    partes: Array<{
      label: string;
      prompt: string;
      model?: string;
      /** Con cuánto se lo piensa. Lo decide el router por el puesto: el que
       *  traduce cadenas no necesita el mismo esfuerzo que el que audita. */
      esfuerzo?: string;
      rol: string;
      /** Su carpeta, cuando no es la del grupo. Un despliegue puede repartirse
       *  entre varios proyectos; una cuadrilla no. */
      cwd?: string;
    }>,
    shadow?: boolean,
  ) => void;
  onOpenTerminal: (name: string, cwd: string) => void;
  onOpenAgy: (name: string, cwd: string, prompt?: string) => void;
  onCommand: (cmd: string) => void;
  /** The same order into every open agent terminal, sent for real. */
  onAll: (cmd: string) => void;
  /** Every open pane WITH what it is doing: what "todas" means, and the only
      thing that lets the Foreman propose closing one instead of guessing. */
  panes: () => PaneStatus[];
  /** Reap one pane. The gate decides whether this may ever be called. */
  onClosePane: (id: number) => void;
  /** Cuál tiene el teclado ahora: para quién se escribe el encargo. */
  focused: () => number | null;
  /** Deja el texto EN el panel activo. `send` falso lo escribe y espera: el
   *  encargo lo manda él, no nosotros. */
  onPasteFocused: (text: string, send: boolean) => void;
  /**
   * Ajusta el panel de delante al cerebro que diga la receta y deja el encargo
   * escrito debajo, SIN enviar. Los `/model` y `/effort` sí se envían, porque
   * son ajustes del propio CLI y dejarlos escritos a medias no ajusta nada; el
   * encargo, que es lo único que gasta, sigue esperando su Enter.
   */
  onDespachar: (encargo: string, modelo?: string, esfuerzo?: string) => void;
  /** Abre una terminal nueva ya nacida con ese CLI, esa cuenta y ese cerebro. */
  onAbrirReceta: (
    r: { cli: string; cuenta?: Account; modelo?: string; esfuerzo?: string },
    cwd: string,
    label: string,
    encargo: string,
  ) => void;
  /** Las cuentas configuradas, la principal de cada CLI incluida. */
  cuentas: () => Account[];
}

interface Props {
  mode: "card" | "overlay";
  exec: ForemanExec;
  onClose?: () => void;
  /**
   * Cierto cuando quien abre el Asistente es el atajo del micrófono: nace
   * grabando, sin tener que pulsar dos veces. Se mira UNA vez, al montar: con
   * el Asistente ya abierto el atajo es suyo y no pasa por aquí.
   */
  dictarAlAbrir?: boolean;
  /**
   * Varias tareas de golpe, con el texto ya escrito.
   *
   * El Reparto y el Asistente eran dos botones seguidos en la barra, y el
   * comentario que los juntaba ya decía lo que eran: «la misma pregunta con
   * una lista en vez de una frase» (Munir lo dijo igual el 2026-08-05). Ahora
   * hay UNA puerta: escribes, y el número de líneas decide. Sigue habiendo dos
   * pantallas porque un reparto enseña una tabla de destinos que en un cuadro
   * de chat no cabe, pero eso ya no es cosa de quien pregunta.
   */
  onRepartir?: (texto: string) => void;
}

type Phase = "idle" | "thinking" | "plan" | "done" | "error";

/** A dónde va el encargo. Lo que se aplica al pulsar, venga de donde venga. */
interface Destino {
  cli: string;
  cuenta?: Account;
  modelo?: ModelAlias;
  esfuerzo?: Esfuerzo;
}

/** El encargo escrito, lo que exige, y a quién se le daría. */
interface Ficha {
  encargo: string;
  ex: Exigencia;
  /** Media frase del propio modelo sobre por qué clasificó así. */
  porqueTarea?: string;
  /** La recomendación. No se toca cuando Munir cambia el destino a mano. */
  receta: Receta;
}

// La lista de los tres cerebros vive ahora en `lib/models.ts` (`A_MANO`): se
// elige a mano en tres sitios y una copia por sitio es como se acaba ofreciendo
// un modelo en una pantalla y en otra no.

/** Los cerebros que abre una acción: uno, seis si es cuadrilla, o ninguno. */
function cerebrosDe(c: Checked): ModelAlias[] {
  if (c.partes) return c.partes.map((p) => p.model);
  return isModelAlias(c.model) ? [c.model] : [];
}

/** «sonnet», o «2 opus + 4 sonnet» cuando es una cuadrilla. */
function resumeCerebros(ms: ModelAlias[]): string {
  if (ms.length === 1) return ms[0];
  const cuenta = new Map<ModelAlias, number>();
  for (const m of ms) cuenta.set(m, (cuenta.get(m) ?? 0) + 1);
  return [...cuenta].map(([m, n]) => (n > 1 ? `${n} ${m}` : m)).join(" + ");
}

/** Lo que estabas escribiendo en el Asistente cuando se cerró. */
const BORRADOR = "adeorq-asistente-borrador";

/**
 * El modo automático: en vez de enseñar la ficha y esperar, aplica la receta.
 *
 * Lo que NO hace, y no es un olvido: no envía. El `/model` y el `/effort` sí
 * salen, porque son ajustes del CLI y a medio escribir no ajustan nada; el
 * encargo se queda escrito esperando tu Enter, que es lo único que gasta.
 * «Automático» aquí significa «sin pantalla intermedia», no «sin tu dedo».
 */
const AUTO = "adeorq-asistente-auto";

/** Lo último que hizo el automático, para poder contarlo cuando ya ha pasado. */
const RECIBO = "adeorq-asistente-recibo";

export function autoPuesto(): boolean {
  return localStorage.getItem(AUTO) === "1";
}

/** Lo que se enseña la próxima vez que se abra: qué se aplicó y por qué. Una
    decisión que se toma sola y no se puede leer después no se puede corregir,
    y eso es justo lo que este router evita (ver la cabecera de router.ts). */
interface Recibo {
  modelo?: string;
  esfuerzo?: string;
  porque: string;
}

const MAX_ACTIONS = 8;
const MAX_CTX_SESSIONS = 40;

/** How a pane reads in the plan's state block: enough for the Foreman to tell
    "waiting for Munir" from "delivered" without seeing the screen. */
function paneLine(p: PaneStatus): string {
  const what: Record<string, string> = {
    pregunta: "TE ESPERA (preguntó y no puede seguir)",
    ofrece: "TE ESPERA (terminó preguntando)",
    lista: "terminó y entregó",
    a_medias: "trabajando",
    tuya: "libre, sin nada en marcha",
    "": "desconocido",
  };
  const bits = [`#${p.id}`, p.name, p.agent ? "agente" : "consola", what[p.state] ?? "desconocido"];
  if (p.model) bits.push(p.model + (p.effort ? ` (${p.effort})` : ""));
  if (p.percent != null) bits.push(`contexto ${p.percent}%`);
  if (p.agentsLive > 0) bits.push(`${p.agentsLive} subagentes fuera`);
  return `- ${bits.join(" | ")}`;
}

function buildContext(
  projects: Project[],
  sessions: SessionInfo[],
  skills: Skill[],
  /** Agent terminals open right now, each with its live state. */
  openPanes: PaneStatus[],
): string {
  const proj = projects.map((p) => `- ${p.name}`).join("\n");
  const fresh = sessions
    .filter((s) => s.fresh !== "muerta")
    .slice(0, MAX_CTX_SESSIONS)
    .map((s) => {
      // A session started outside its project's folder resumes THERE, not in
      // the project: the Foreman must know before picking it.
      const home = s.resumeCwd || s.cwd;
      const stray =
        home && !home.toLowerCase().includes(s.project.toLowerCase())
          ? ` | ⚠ se retoma en ${home}, NO en la carpeta del proyecto`
          : "";
      // `hace` a mano: `ago` viene desnudo de Rust («1 día»), y aquí lo lee un
      // modelo que tiene que entender que es una antigüedad y no una duración.
      return `- ${s.id} | ${s.project} | ${s.title} | ${s.state}${s.live ? " (abierta ahora)" : ""} | hace ${s.ago}${stray}`;
    })
    .join("\n");
  const sk = skills
    .map((s) => `- ${s.invocation}: ${s.description}`)
    .join("\n");
  const cmds = COMMANDS.map((c) => `- ${c.cmd}: ${c.es}`).join("\n");
  // "Todas" has to mean something concrete, so the Foreman is told exactly
  // which terminals are open right now and would receive the order.
  const open = openPanes.length
    ? openPanes.map(paneLine).join("\n")
    : "- (ninguna abierta ahora)";
  return `Comandos disponibles dentro de las terminales:\n${cmds}\n\nProyectos (nombre exacto):\n${proj}\n\nSesiones frescas (sessionId | proyecto | título | estado | hace):\n${fresh}\n\nPaneles abiertos AHORA (id | nombre | tipo | qué hace | modelo | contexto), que son los que recibirían un "a_todas":\n${open}\n\nPolítica de modelos: ${modelPolicyText()}

Skills disponibles de Munir (ordénalas por su nombre dentro de los encargos cuando encajen):\n${sk || "- (ninguna)"}`;
}

function parsePlan(raw: string): ForemanPlan {
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("el Capataz no devolvió un plan legible");
  const p = JSON.parse(raw.slice(a, b + 1)) as Partial<ForemanPlan>;
  return {
    resumen: String(p.resumen ?? "").trim(),
    acciones: Array.isArray(p.acciones) ? (p.acciones.slice(0, MAX_ACTIONS) as PlanAction[]) : [],
  };
}

interface Checked {
  action: PlanAction;
  ok: boolean;
  why: string;
  session?: SessionInfo;
  project?: Project;
  pane?: PaneStatus;
  /** The brain this action will actually open with, after the gate. */
  model?: string;
  /** Y con cuánto se lo piensa. Nace en la línea de arranque, como el modelo:
   *  un recado con el esfuerzo al máximo es la otra forma de pagar de más. */
  esfuerzo?: Esfuerzo;
  /** Por qué ese cerebro, cuando lo decidió el router y no el plan. */
  porque?: string;
  /** Los cerebros de una cuadrilla, en el orden de sus puestos. Se calculan
   *  aquí y no al ejecutar para que el total de abajo cuente lo que se va a
   *  abrir de verdad, no una estimación distinta. */
  partes?: Array<{ model: ModelAlias; esfuerzo?: Esfuerzo }>;
  originalIndex: number;
}

/** The only two states a pane may be reaped in. Everything else — waiting for
    Munir, working, or unreadable — is off limits, and "unknown" counts as off
    limits ON PURPOSE: the cost of wrongly closing a pane (his question, or an
    hour of work) is not comparable to the cost of leaving one open. */
const CLOSABLE = new Set(["lista", "tuya"]);

/** Cuántas manos como mucho en una cuadrilla.
 *
 *  No es un número redondo por gusto: cada terminal es un Claude entero
 *  consumiendo de su cuota a la vez, y a partir de aquí el reparto deja de
 *  ganar tiempo y empieza a costarlo (más coordinación, más solapes, más
 *  contexto repetido). Si hace falta más, se hacen dos tandas. */
const MAX_CUADRILLA = 6;

const WHY_NOT: Record<string, string> = {
  pregunta: "te está esperando",
  ofrece: "terminó preguntándote algo",
  a_medias: "está trabajando",
  "": "no se sabe qué está haciendo",
};

/**
 * The model goes onto a PowerShell command line, so it is never taken on
 * trust: only our own aliases or a real `claude-...` id, and nothing that
 * could carry a quote, a space or a semicolon into the shell.
 */
function safeModel(raw: string | undefined): string | undefined {
  const m = raw?.trim().toLowerCase();
  if (!m) return undefined;
  if (!/^[a-z0-9.[\]-]+$/.test(m)) return undefined;
  return isModelAlias(m) || m.startsWith("claude-") ? m : undefined;
}

/**
 * El cerebro con el que abre una acción del plan, ya pasado por el router.
 *
 * Antes esto era `safeModel(plan) ?? modelForRole(rol)`: la tabla acertaba casi
 * siempre en QUÉ pide el trabajo, pero no sabía nada de tu semana. Un plan de
 * seis agentes es justo donde más se gasta de golpe y donde peor sienta
 * enterarse después, así que aquí entra lo que el router sabe: qué cuenta tiene
 * margen y cuándo conviene abaratar.
 *
 * El modelo que el plan haya escrito a conciencia se respeta como punto de
 * partida; lo único que puede moverlo es quedarse sin semana.
 */
function cerebroDe(
  rol: string,
  pedido: string | undefined,
  mundo: CuentaViva[],
): { model?: ModelAlias; esfuerzo?: Esfuerzo; porque?: string } {
  const base = isModelAlias(pedido) ? pedido : undefined;
  const deLaTabla = modelForRole(rol);
  const r = recetar(
    exigenciaDeRol(rol),
    { cuentas: mundo, avisos: "nunca", usa: leerPerfil().clis },
    base,
    cerebroPorDefecto(),
  );
  const esfuerzo = r.esfuerzo;
  // Ojo con el relevo: el router puede proponer otro CLI cuando no queda
  // semana, pero esta acción del plan ya decidió que abre un Claude, así que
  // aquí no se cambia de CLI. Lo que sí se hace es DECIRLO, que es la mitad
  // que sirve. Sin esta línea la acción se quedaría sin modelo y la terminal
  // nacería con el de tus ajustes, en silencio.
  const model = (sabe(r.cli, "modelo") ? r.modelo : r.alternativa?.modelo) ?? base ?? deLaTabla;
  if (!sabe(r.cli, "modelo")) {
    return { model, esfuerzo, porque: `sin semana; ${providerOf(r.cli).label} está libre` };
  }
  // Solo se cuenta como "explicación" lo que CAMBIA algo respecto a lo que se
  // habría hecho igualmente: repetir "es oficio del día a día" en ocho líneas
  // no informa de nada.
  const movido = model !== (base ?? deLaTabla);
  return { model, esfuerzo, porque: movido ? r.porque[r.porque.length - 1] : undefined };
}

/** Deterministic gate: every action must point at a real session/project. */
function checkActions(
  plan: ForemanPlan,
  projects: Project[],
  sessions: SessionInfo[],
  panes: PaneStatus[],
  mundo: CuentaViva[],
): Checked[] {
  return plan.acciones.map((action) => {
    if (action.tipo === "abrir_sesion") {
      const session = sessions.find((s) => s.id === action.sessionId);
      return session
        ? { action, ok: true, why: "", session }
        : { action, ok: false, why: "sesión desconocida" };
    }
    // Closing a pane belongs to no project either, so it is settled before the
    // project lookup. This is the gate that makes the whole feature safe.
    if (action.tipo === "cerrar_panel") {
      const pane = panes.find((p) => p.id === action.paneId);
      if (!pane) return { action, ok: false, why: "panel desconocido" };
      if (pane.agentsLive > 0) {
        return { action, ok: false, why: `tiene ${pane.agentsLive} subagentes fuera` };
      }
      if (!CLOSABLE.has(pane.state)) {
        return { action, ok: false, why: WHY_NOT[pane.state] ?? "no se puede cerrar" };
      }
      return { action, ok: true, why: "", pane };
    }
    // Sending one order to every open terminal belongs to no project, so it
    // is checked before the project lookup that the rest need.
    if (action.tipo === "a_todas") {
      const cmd = action.comando?.trim() ?? "";
      if (!cmd) return { action, ok: false, why: "orden vacía" };
      // Only the CLI's own slash commands go out in bulk. Free text would let
      // one plan type anything into nine terminals at once, and the whole
      // house rule is that the model never runs anything by itself.
      if (!cmd.startsWith("/") || /\s*[\r\n]/.test(cmd)) {
        return { action, ok: false, why: "a todas solo admite comandos con /" };
      }
      return { action, ok: true, why: "" };
    }
    const project = projects.find((p) => p.name === action.proyecto);
    if (!project) return { action, ok: false, why: "proyecto desconocido" };
    if (action.tipo === "comando") {
      return action.comando?.trim()
        ? { action, ok: true, why: "" }
        : { action, ok: false, why: "comando vacío" };
    }
    if (action.tipo === "claude_nuevo") {
      // Un id completo de modelo («claude-opus-4-6») se respeta tal cual: si el
      // plan pidió uno concreto por su nombre largo, no es cosa nuestra
      // traducirlo a un alias para poder opinar.
      const crudo = safeModel(action.modelo);
      if (crudo && !isModelAlias(crudo)) {
        return { action, ok: true, why: "", project, model: crudo };
      }
      const { model, esfuerzo, porque } = cerebroDe(action.rol ?? action.prompt ?? "", crudo, mundo);
      return { action, ok: true, why: "", project, model, esfuerzo, porque };
    }
    // A reviewer ALWAYS gets a fresh pane, so it can never be the session that
    // did the work: self-review is ruled out by construction, not by a check.
    if (action.tipo === "revisar") {
      if (!action.encargo?.trim()) return { action, ok: false, why: "sin qué revisar" };
      // Revisar es juicio con consecuencia, así que arranca en el cerebro
      // fuerte aunque el plan no lo dijera. Y por eso mismo el router NO lo
      // abarata aunque la semana vaya justa: una revisión barata que no
      // encuentra nada es peor que no revisar, porque además te deja tranquilo.
      const crudo = safeModel(action.modelo);
      if (crudo && !isModelAlias(crudo)) {
        return { action, ok: true, why: "", project, model: crudo };
      }
      const { model, esfuerzo, porque } = cerebroDe("revisión", crudo ?? "opus", mundo);
      return { action, ok: true, why: "", project, model, esfuerzo, porque };
    }
    // Una cuadrilla: la reja mira lo único que puede arruinarla, que es que
    // dos puestos compartan archivos. Seis agentes editando lo mismo van más
    // lento que uno, porque se sobreescriben y hay que deshacer.
    if (action.tipo === "cuadrilla") {
      const partes = (action.partes ?? []).filter((p) => p?.encargo?.trim() && p?.rol?.trim());
      if (partes.length < 2) return { action, ok: false, why: "una cuadrilla es de dos o más" };
      if (partes.length > MAX_CUADRILLA) {
        return {
          action,
          ok: false,
          why: `son ${partes.length} manos y el tope es ${MAX_CUADRILLA}`,
        };
      }
      const fronteras = partes.map((p) => (p.frontera ?? "").trim().toLowerCase()).filter(Boolean);
      if (fronteras.length !== partes.length) {
        return { action, ok: false, why: "un puesto no dice qué archivos son suyos" };
      }
      if (new Set(fronteras).size !== fronteras.length) {
        return { action, ok: false, why: "dos puestos con los mismos archivos" };
      }
      // Los cerebros de la cuadrilla se deciden AQUÍ, no al ejecutar: es lo que
      // permite que el total de abajo cuente lo que se va a abrir de verdad.
      // Seis agentes es donde la cuenta se dispara, así que es justo donde hay
      // que verla antes de dar el OK.
      const cerebros = partes.map((p) => {
        const c = cerebroDe(p.rol, safeModel(p.modelo), mundo);
        return { model: c.model ?? ("sonnet" as ModelAlias), esfuerzo: c.esfuerzo };
      });
      return { action, ok: true, why: "", project, partes: cerebros };
    }
    if (action.tipo === "terminal") {
      return { action, ok: true, why: "", project };
    }
    if (action.tipo === "antigravity") {
      return action.encargo?.trim()
        ? { action, ok: true, why: "", project }
        : { action, ok: false, why: "encargo vacío" };
    }
    return { action, ok: false, why: `acción desconocida: ${action.tipo}` };
  }).map((c, idx) => ({ ...c, originalIndex: idx } as Checked));
}

/** The reviewer's brief. Written here and not left to the plan because the
    thing that makes a review worth anything is that it does NOT trust the
    work, and does not quietly fix it either: a reviewer that patches what it
    finds becomes a second author, and nobody checks the second author. */
function reviewPrompt(encargo: string, autor?: string): string {
  const quien = autor
    ? `Lo hizo otra sesión («${autor}»); no des por bueno lo que afirme.\n`
    : "";
  return [
    "Eres el revisor. NO escribas ni corrijas código: tu trabajo es comprobar.",
    "",
    `Qué hay que revisar: ${encargo}`,
    quien.trim(),
    "",
    "Cómo: lee el código de verdad antes de opinar, comprueba lo que puedas " +
      "ejecutando (build, tests, tipos) y distingue lo que has VERIFICADO de lo " +
      "que solo supones. Sigue el AGENTS.md del proyecto si existe.",
    "",
    "Entrega: lista corta de hallazgos ordenados por gravedad, cada uno con su " +
      "archivo y su línea y cómo reproducirlo. Si algo está bien, dilo en una " +
      "línea y sigue. Si no encuentras nada serio, dilo claro en vez de rellenar.",
  ]
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n");
}

/**
 * El encargo de un puesto de la cuadrilla.
 *
 * Lo que convierte seis terminales sueltas en un equipo es exactamente esto:
 * cada una sabe cuál es el objetivo común, qué archivos son suyos, qué están
 * haciendo las otras a la vez, y qué hacer cuando necesita algo que no le
 * toca. Sin esta parte, seis agentes en el mismo repo son seis formas de
 * pisarse, y el reparto sale más caro que hacerlo en una sola.
 */
function teamPrompt(objetivo: string, yo: PartePlan, todas: PartePlan[]): string {
  const otras = todas
    .filter((p) => p !== yo)
    .map((p) => `- «${p.rol}»: ${p.frontera ?? "sin frontera declarada"}`)
    .join("\n");
  return [
    `Trabajas en CUADRILLA: ${todas.length} agentes de Adeorq a la vez sobre el mismo objetivo.`,
    "",
    `OBJETIVO COMÚN: ${objetivo}`,
    `TU PUESTO: ${yo.rol}`,
    `TUS ARCHIVOS: ${yo.frontera ?? "los que diga tu encargo"}`,
    "",
    "TU ENCARGO:",
    yo.encargo.trim(),
    "",
    "LOS DEMÁS, trabajando ahora mismo:",
    otras,
    "",
    "CÓMO NO PISAROS (importante, esto no es un consejo):",
    "- Edita SOLO tus archivos. Ni siquiera 'de paso' ni para arreglar algo obvio.",
    "- Si necesitas un cambio en la zona de otro, NO lo hagas: apúntalo en el " +
      "BUZON.md del proyecto diciendo a qué puesto le toca, y sigue con lo tuyo.",
    "- Si al empezar ves que tu frontera se solapa con la de otro, para y dilo. " +
      "Es mejor perder dos minutos que deshacer una hora.",
    "- No esperes a nadie: tu parte tiene que poder terminarse sola.",
    "- Al acabar, deja en BUZON.md una línea con qué has tocado y qué falta.",
    "",
    "Antes de escribir código, plan corto y espera mi OK. Sigue el AGENTS.md si existe.",
  ]
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n");
}

function missionFile(project: string, encargo: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  return `# MISION.md · ${project}\n\n> Generado por el Capataz de Adeorq (${stamp}). Coordinación del equipo:\n> todos los agentes leen este archivo y avisan de sus avances en BUZON.md.\n\n## Encargo para Antigravity\n\n${encargo}\n`;
}

function actionIcon(a: PlanAction): string {
  if (a.tipo === "abrir_sesion") return "▶";
  if (a.tipo === "claude_nuevo") return "✦";
  if (a.tipo === "comando") return "⌘";
  if (a.tipo === "a_todas") return "⇉";
  if (a.tipo === "terminal") return ">_";
  if (a.tipo === "cerrar_panel") return "✕";
  if (a.tipo === "revisar") return "⌕";
  if (a.tipo === "cuadrilla") return "⚏";
  return "AG";
}

function actionLabel(c: Checked): string {
  const a = c.action;
  if (a.tipo === "abrir_sesion") {
    return c.session ? `Retomar «${c.session.title}»` : `Retomar ${a.sessionId ?? "?"}`;
  }
  if (a.tipo === "claude_nuevo") {
    return `Claude ${a.rol ? `«${a.rol}» ` : ""}en ${a.proyecto}${a.prompt?.trim() ? " con cometido" : ""}`;
  }
  if (a.tipo === "comando") return `Escribir ${a.comando} en la terminal activa`;
  if (a.tipo === "a_todas") return `${a.comando} en TODAS las terminales abiertas`;
  if (a.tipo === "terminal") return `Terminal en ${a.proyecto}`;
  if (a.tipo === "cerrar_panel") {
    return `Cerrar «${c.pane?.name ?? a.paneId}»`;
  }
  // El modelo ya no se escribe aquí: lo dice la pastilla de la derecha, igual
  // que en todas las demás acciones que abren un agente.
  if (a.tipo === "revisar") return `Revisar lo hecho en ${a.proyecto}`;
  if (a.tipo === "cuadrilla") {
    const n = (a.partes ?? []).length;
    return `Cuadrilla de ${n} en ${a.proyecto}: ${a.objetivo ?? "reparto"}`;
  }
  return `Antigravity en ${a.proyecto} con encargo`;
}

export default function Foreman({ mode, exec, onClose, dictarAlAbrir, onRepartir }: Props) {
  const { t } = useT();
  // El borrador sobrevive al cierre. El Asistente se cierra con Esc, pinchando
  // fuera y con el aspa, y hasta ahora cerrarlo tiraba lo que estuvieras
  // escribiendo sin preguntar: media frase pensada perdida por una tecla
  // (Munir, 2026-07-30). Se guarda en el disco del navegador, así que aguanta
  // también un reinicio de la app. Solo el Asistente flotante: la tarjeta de la
  // vista Panel no se cierra nunca, así que no tiene nada que recuperar.
  const [text, setText] = useState(() =>
    mode === "overlay" ? (localStorage.getItem(BORRADOR) ?? "") : "",
  );
  /**
   * El encargo reescrito y a quién se le daría, esperando tu OK antes de tocar
   * ninguna terminal.
   */
  const [ficha, setFicha] = useState<Ficha | null>(null);
  /**
   * El destino que se va a usar de verdad. Nace igual que la recomendación y
   * Munir puede moverlo: la receta se queda intacta al lado para poder decir
   * «lo recomendado era sonnet» sin haberlo perdido.
   */
  const [elegido, setElegido] = useState<Destino | null>(null);
  /** El automático puesto. Se guarda como el resto de preferencias del panel. */
  const [auto, setAuto] = useState(autoPuesto);
  /** La voz puesta, o vacío si el Asistente no habla. Vive en localStorage
      porque es una preferencia, no una decisión por pregunta. */
  const [voz, setVoz] = useState(vozElegida);
  /** Lo que hizo el automático la última vez, hasta que lo leas. */
  const [recibo, setRecibo] = useState<Recibo | null>(() => {
    try {
      const raw = localStorage.getItem(RECIBO);
      return raw ? (JSON.parse(raw) as Recibo) : null;
    } catch {
      return null;
    }
  });
  const [escribiendo, setEscribiendo] = useState(false);
  /** El cuarto oficio: preguntar con las manos puestas. Va aparte de `phase`
      porque no monta ningún tablero que aprobar; devuelve texto y ya. */
  const [modo, setModo] = useState<ModoCapataz>(leerModo);
  const [preguntando, setPreguntando] = useState(false);
  const [respuesta, setRespuesta] = useState<string | null>(null);
  /** El dictado en marcha, si lo hay. Null = el micrófono está en reposo. */
  const dictadoRef = useRef<Dictado | null>(null);
  const [oyendo, setOyendo] = useState(false);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [vozError, setVozError] = useState<string | null>(null);
  /** Si el ratón bajó sobre el velo mismo: es lo que distingue pinchar fuera de
      soltar fuera un arrastre que empezó dentro (ver lib/velo.ts). */
  const bajoEnVelo = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<ForemanPlan | null>(null);
  const [shadowEnabled, setShadowEnabled] = useState<Record<number, boolean>>({});
  /** Cuentas, sesión iniciada y semana restante: lo que el router necesita
   *  para que el plan no se coma la cuota sin avisar. Se pide con el plan. */
  const [mundo, setMundo] = useState<CuentaViva[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [agy, setAgy] = useState<string | null>(null);
  const [doneNote, setDoneNote] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listProjects().then(setProjects).catch(() => {});
    scanSessions().then(setSessions).catch(() => {});
    listSkills().then(setSkills).catch(() => {});
    findAgy().then(setAgy).catch(() => {});
    if (mode === "overlay") inputRef.current?.focus();
  }, [mode]);

  // The panes are read when the plan is checked, not when it was asked: a pane
  // that finished in between must be closeable, and one that started working
  // must stop being closeable.
  const checked = useMemo(
    () => (plan ? checkActions(plan, projects, sessions, exec.panes(), mundo) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, projects, sessions, mundo],
  );
  const valid = checked.filter((c) => c.ok);
  /** Todos los cerebros que este plan va a encender, la cuadrilla desplegada. */
  const agentesDelPlan = valid.flatMap(cerebrosDe);
  /**
   * Lo gastado de la cuenta con MÁS margen, y solo cuando ya va apretada.
   *
   * Enseñar «te queda un 91 %» al lado de un plan de dos agentes es ruido; el
   * dato solo informa cuando puede cambiar tu decisión, que es cuando queda
   * poco. Null también cuando no se pudo leer, porque inventar un número aquí
   * sería peor que no decir nada.
   */
  const semanaJusta = (() => {
    const gastos = mundo
      // `usage` es «Adeorq puede leer su cuota sin gastarla», y hasta el
      // 2026-08-13 eso estaba en la tabla y aquí se preguntaba «¿eres Claude?».
      .filter((x) => sabe(x.cuenta.provider, "usage") && x.conectada && x.gastado != null)
      .map((x) => x.gastado!);
    if (!gastos.length) return null;
    const mejor = Math.min(...gastos);
    return mejor >= 60 ? mejor : null;
  })();

  /**
   * El segundo oficio: que te escriba el encargo en vez de montarte el tablero,
   * y que además te diga a quién dárselo.
   *
   * No decide nada ni abre nada. Lo que devuelve se enseña y espera: pegarlo
   * en una terminal sin que lo hayas leído sería exactamente lo que la casa no
   * hace, que es mandar en tu nombre.
   *
   * Las dos cosas salen de UNA llamada. El modelo devuelve el encargo y qué
   * exige el trabajo; el destino (CLI, cuenta, cerebro, esfuerzo) lo calcula
   * `lib/router.ts` con datos que el modelo no tiene. Y la foto del equipo se
   * pide a la vez que la llamada, no después: la llamada tarda segundos y
   * mirar qué hay conectado tarda mucho menos, así que cuando vuelve el texto
   * la foto ya está hecha y nadie ha esperado por ella.
   */
  /**
   * PREGUNTARLE, que es el oficio nuevo (2026-08-13).
   *
   * Los otros tres le dan a `claude -p` todo el estado ya masticado dentro del
   * prompt y le piden un JSON. Aquí no se puede: «¿en qué proyectos estoy?»
   * necesita mirar las terminales, y «resúmeme lo de la 3» necesita leer una
   * transcripción que no cabe en ningún contexto pre-cocinado. Así que en vez
   * de contárselo, se le dan las llaves de Adeorq y mira él.
   *
   * El contexto que se le pasa es CORTO a propósito: es un punto de partida
   * para que sepa dónde está, no la foto entera. Si necesita más, la pide con
   * una herramienta, que es justo lo que lo diferencia de los otros tres.
   */
  const preguntar = () => {
    const pedido = text.trim();
    if (!pedido || preguntando) return;
    setPreguntando(true);
    setError("");
    setRespuesta(null);
    const p = exec.panes().find((x) => x.id === exec.focused());
    const donde = [
      avisoDelModo(modo),
      p ? `Tiene delante la terminal «${p.name}», en ${p.cwd}.` : "No tiene ninguna terminal delante.",
      `Hoy es ${new Date().toISOString().slice(0, 10)}.`,
    ].join("\n");
    foremanAgente(pedido, donde, manosDe(modo))
      .then((r) => setRespuesta(r.trim()))
      .catch((e) => setError(String(e)))
      .finally(() => setPreguntando(false));
  };

  /* La voz: si está puesta, la respuesta se dice en alto además de escribirse
     (Munir dicta y escucha, no lee). La limpieza corta el audio cuando llega
     otra respuesta, se descarta con «Vale» o se apaga la voz: una respuesta
     vieja sonando sobre una nueva no es hablar, es ruido. */
  useEffect(() => {
    if (!respuesta || !voz) return;
    decir(respuesta, voz).catch((e) => setError(String(e)));
    return parar;
  }, [respuesta, voz]);

  const redactar = () => {
    const pedido = text.trim();
    if (!pedido || escribiendo) return;
    setEscribiendo(true);
    setError("");
    const p = exec.panes().find((x) => x.id === exec.focused());
    const donde = p
      ? `Terminal «${p.name}», en ${p.cwd}${p.model ? `, con ${p.model}` : ""}.`
      : "No tiene ninguna terminal delante ahora mismo.";
    const cuentas = exec.cuentas();
    Promise.all([
      foremanPrompt(pedido, donde),
      // Si mirar el equipo falla (un CLI que no responde, un permiso), se usa
      // lo último que se supo: una recomendación con datos de hace un rato es
      // muchísimo mejor que ninguna.
      mirarMundo(cuentas).catch(() => mundoEnCache(cuentas)),
    ])
      .then(([raw, vivas]) => {
        const { encargo, ex, porque } = interpretar(raw);
        const receta = recetar(
          ex,
          { cuentas: vivas, panel: p, avisos: modoAviso(), usa: leerPerfil().clis },
          undefined,
          cerebroPorDefecto(),
        );

        // El camino automático: se aplica y ya. Solo cuando de verdad hay dónde
        // aplicarlo. Si el router manda a otro CLI, o no tienes ninguna terminal
        // delante, NO se fuerza nada: sale la ficha de siempre, que es lo que
        // permite abrir una nueva. Un automático que hace algo distinto de lo
        // que decidió el router sería peor que no tenerlo.
        if (auto && sabe(receta.cli, "modelo") && exec.focused() != null) {
          const r: Recibo = {
            modelo: receta.modelo,
            esfuerzo: receta.esfuerzo,
            // La última razón es la que MOVIÓ la decisión: las de antes
            // explican de dónde partía, y en una línea sola solo cabe la que
            // manda.
            porque: receta.aviso ?? receta.porque[receta.porque.length - 1] ?? "",
          };
          setRecibo(r);
          try {
            localStorage.setItem(RECIBO, JSON.stringify(r));
          } catch {
            /* sin sitio en localStorage: el recibo es un extra, no el trabajo */
          }
          exec.onDespachar(encargo, receta.modelo, receta.esfuerzo);
          if (mode === "overlay") onClose?.();
          return;
        }

        setFicha({ encargo, ex, porqueTarea: porque, receta });
        setElegido({
          cli: receta.cli,
          cuenta: receta.cuenta,
          modelo: receta.modelo,
          esfuerzo: receta.esfuerzo,
        });
      })
      .catch((e) => setError(String(e)))
      .finally(() => setEscribiendo(false));
  };

  /** Dónde nacería una terminal nueva: donde estás, o donde esté lo demás. */
  const dondeAbrir = (): string => {
    const abiertos = exec.panes();
    return abiertos.find((x) => x.id === exec.focused())?.cwd ?? abiertos[0]?.cwd ?? "";
  };

  /** Cerrar la ficha sin aplicarla. */
  const descartarFicha = () => {
    setFicha(null);
    setElegido(null);
  };

  /**
   * El atajo del dictado: Ctrl+Mayús+M enciende y apaga.
   *
   * Antes era un botón que se mantenía pulsado, como en Codex y en Claude
   * Code, y ahí el gesto tiene sentido porque estás en una terminal. Aquí no:
   * el cuadro donde escribes está justo encima, así que sujetar el ratón sobre
   * un botón mientras hablas es incómodo y encima ocupa sitio en la fila
   * (Munir, 2026-07-29). Con un atajo hablas con las manos libres, y lo que
   * dice que está grabando es un REC en rojo, no un icono apagado.
   */
  const empezarAHablar = useCallback(() => {
    if (oyendo || transcribiendo) return;
    setVozError(null);
    // Se pregunta ANTES de abrir el micrófono. Al revés, y era lo que hacía,
    // hablabas diez segundos para que al soltar te dijera que whisper no está
    // instalado: el aviso llegaba cuando ya no servía de nada.
    vozLista()
      .then(() => dictar())
      .then((d) => {
        dictadoRef.current = d;
        setOyendo(true);
      })
      .catch((e) => setVozError(String(e)));
  }, [oyendo, transcribiendo]);

  const dejarDeHablar = () => {
    const d = dictadoRef.current;
    if (!d) return;
    dictadoRef.current = null;
    setOyendo(false);
    setTranscribiendo(true);
    d.parar()
      .then((wav) => transcribir(wav))
      .then((dicho) => {
        // Se SUMA a lo que ya hubiera escrito, no lo pisa: puedes teclear la
        // mitad, dictar el resto, y al revés.
        if (dicho) setText((prev) => (prev.trim() ? `${prev.trim()} ${dicho}` : dicho));
      })
      .catch((e) => setVozError(String(e)))
      .finally(() => setTranscribiendo(false));
  };

  // Ctrl+Mayús+M, y funciona aunque el cursor esté dentro del cuadro de texto:
  // lo normal es escribir media frase, quedarte sin ganas y dictar el resto.
  //
  // SOLO en el Asistente abierto. La tarjeta de la vista Panel es otro Foreman
  // montado a la vez, y con las dos escuchando, un único Ctrl+Mayús+M abría dos
  // micrófonos y lanzaba dos whisper que se peleaban por el mismo archivo
  // temporal, con lo que uno de los dos fallaba. Cuando el Asistente está
  // cerrado el atajo lo lleva App, que lo abre pidiendo dictado (dictarYa).
  useEffect(() => {
    if (mode !== "overlay") return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.key.toLowerCase() !== "m") return;
      e.preventDefault();
      if (oyendo) dejarDeHablar();
      else empezarAHablar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, oyendo, transcribiendo]);

  // Guardar lo escrito, a cada tecla. Barato y sin rebote a propósito: son unos
  // cientos de bytes en localStorage, y un rebote es exactamente lo que hace
  // que se pierda lo último que escribiste antes de cerrar, que es el caso que
  // esto viene a arreglar.
  useEffect(() => {
    if (mode !== "overlay") return;
    if (text) localStorage.setItem(BORRADOR, text);
    else localStorage.removeItem(BORRADOR);
  }, [text, mode]);

  // Cerrar con Esc en mitad de un dictado desmonta esto con el micrófono
  // abierto, y nadie lo soltaba: la luz del micro se quedaba encendida hasta
  // cerrar Adeorq. `cancelar` para el grabador y suelta la pista, y lo dicho se
  // tira, que es lo que quiere decir cerrar sin terminar.
  useEffect(
    () => () => {
      dictadoRef.current?.cancelar();
      dictadoRef.current = null;
    },
    [],
  );

  // Abierto por el atajo del micrófono: se pone a grabar al aparecer. Sin
  // dependencias a propósito, es una orden de arranque y no un estado: con
  // `dictarAlAbrir` en las dependencias, apagarlo desde fuera volvería a entrar
  // aquí, y con `empezarAHablar` entraría en cada cambio del micrófono.
  useEffect(() => {
    if (dictarAlAbrir) empezarAHablar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = () => {
    const request = text.trim();
    if (!request || phase === "thinking") return;
    setPhase("thinking");
    setError("");
    setPlan(null);
    const cuentas = exec.cuentas();
    // La foto del equipo va EN PARALELO con el plan, igual que al escribir un
    // encargo: la llamada tarda segundos y mirar qué hay conectado tarda mucho
    // menos, así que cuando llega el plan ya se sabe con qué cuenta abrirlo.
    Promise.all([
      foremanPlan(request, buildContext(projects, sessions, skills, exec.panes())),
      mirarMundo(cuentas).catch(() => mundoEnCache(cuentas)),
    ])
      .then(([raw, vivas]) => {
        setMundo(vivas);
        const parsed = parsePlan(raw);
        setPlan(parsed);
        const initialShadow: Record<number, boolean> = {};
        parsed.acciones.forEach((act, idx) => {
          if (act.shadow) {
            initialShadow[idx] = true;
          }
        });
        setShadowEnabled(initialShadow);
        setPhase("plan");
      })
      .catch((e) => {
        setError(String(e));
        setPhase("error");
      });
  };

  const run = async () => {
    if (!plan || valid.length === 0) return;
    // La reja se vuelve a pasar AQUÍ, contra el estado de este instante. La
    // lista que Munir ve se calculó cuando llegó el plan, y entre leerla y
    // aceptarla un panel puede haber empezado a trabajar o haberle hecho una
    // pregunta. Lo que se ejecuta tiene que validarse contra el ahora, no
    // contra el rato en el que se dibujó la lista.
    const ahora = checkActions(plan, projects, sessions, exec.panes(), mundo).filter((c) => c.ok);
    if (ahora.length === 0) {
      setDoneNote(t("Ya no procede: los paneles han cambiado desde que se hizo el plan."));
      setPhase("done");
      return;
    }
    let agNote = "";
    // Todo lo que abra ESTE plan y lleve un encargo se recoge aquí en vez de
    // abrirse suelto. Si son dos o más, salen agrupados bajo tu pedido y el
    // tablero de cuadrilla los enseña juntos: quién es cada uno, qué le
    // tocó y quién te espera.
    //
    // Antes cada sesión se abría por su cuenta y el tablero no las veía
    // (solo mira los paneles con equipo), así que un despliegue de siete
    // quedaba como siete nombres sueltos en la lista y ninguna forma de
    // saber cuál era cuál media hora después (Munir, 2026-07-29).
    const despliegue: Array<{
      label: string;
      prompt: string;
      model?: string;
      esfuerzo?: string;
      rol: string;
      cwd: string;
      shadow?: boolean;
    }> = [];

    for (const c of ahora) {
      const a = c.action;
      if (a.tipo === "abrir_sesion" && c.session) {
        exec.onResume(c.session);
      } else if (a.tipo === "claude_nuevo" && c.project) {
        const label = `${c.project.name}${a.rol ? ` · ${a.rol}` : " · claude"}`;
        if (a.prompt?.trim()) {
          despliegue.push({
            label,
            prompt: a.prompt.trim(),
            model: c.model,
            esfuerzo: c.esfuerzo,
            rol: a.rol?.trim() || c.project.name,
            cwd: c.project.path,
            shadow: !!shadowEnabled[c.originalIndex],
          });
        } else {
          exec.onOpenClaude(c.project.name, c.project.path);
        }
      } else if (a.tipo === "cuadrilla" && c.project && a.partes) {
        const partes = a.partes.filter((p) => p?.encargo?.trim() && p?.rol?.trim());
        exec.onOpenTeam(
          a.objetivo?.trim() || t("un trabajo repartido"),
          c.project.path,
          partes.map((p, i) => ({
            rol: p.rol,
            label: `${c.project!.name} · ${p.rol}`,
            prompt: teamPrompt(a.objetivo?.trim() ?? "", p, partes),
            // El que se enseñó en la lista, no uno recalculado: lo que aceptas
            // y lo que se abre tienen que ser la misma cosa.
            model: c.partes?.[i]?.model ?? safeModel(p.modelo) ?? modelForRole(p.rol),
            esfuerzo: c.partes?.[i]?.esfuerzo,
          })),
          !!shadowEnabled[c.originalIndex],
        );
      } else if (a.tipo === "cerrar_panel" && c.pane) {
        exec.onClosePane(c.pane.id);
      } else if (a.tipo === "revisar" && c.project && a.encargo) {
        despliegue.push({
          label: `${c.project.name} · revisión`,
          prompt: reviewPrompt(a.encargo.trim(), c.pane?.name),
          model: c.model,
          esfuerzo: c.esfuerzo,
          rol: t("revisión"),
          cwd: c.project.path,
          shadow: !!shadowEnabled[c.originalIndex],
        });
      } else if (a.tipo === "a_todas" && a.comando) {
        exec.onAll(a.comando);
      } else if (a.tipo === "comando" && a.comando) {
        exec.onCommand(a.comando);
      } else if (a.tipo === "terminal" && c.project) {
        exec.onOpenTerminal(c.project.name, c.project.path);
      } else if (a.tipo === "antigravity" && c.project && a.encargo) {
        try {
          await writeMission(c.project.path, missionFile(c.project.name, a.encargo));
          if (agy) {
            // Antigravity CLI installed: it runs in a pane, like Claude.
            exec.onOpenAgy(c.project.name, c.project.path, a.encargo);
          } else {
            await navigator.clipboard.writeText(a.encargo);
            await openInAntigravity(c.project.path);
            agNote =
              "Encargo copiado y MISION.md escrito. En Antigravity: abre el chat de Gemini, Ctrl+V y Enter. (Instala su CLI agy y esto pasará a ser una terminal más.)";
          }
        } catch (e) {
          agNote = `Antigravity: ${String(e)}`;
        }
      }
    }

    // Y ahora se abre lo recogido. Dos o más van como un despliegue con nombre
    // —tu pedido— para que el tablero los enseñe juntos; uno solo se abre sin
    // ceremonia, que un grupo de uno no agrupa nada.
    if (despliegue.length === 1) {
      const d = despliegue[0];
      exec.onOpenClaudePrompt(d.label, d.cwd, d.prompt, d.model, undefined, d.shadow, {
        esfuerzo: d.esfuerzo,
      });
    } else if (despliegue.length > 1) {
      exec.onOpenTeam(
        text.trim() || t("un despliegue"),
        despliegue[0].cwd,
        despliegue,
        despliegue.some((d) => d.shadow),
      );
    }

    if (agNote) {
      setDoneNote(agNote);
      setPhase("done");
    } else if (mode === "overlay") {
      onClose?.();
    } else {
      setDoneNote(t("Hecho: mira la Cabina."));
      setPhase("done");
    }
  };

  const reset = () => {
    setPhase("idle");
    setPlan(null);
    setShadowEnabled({});
    setError("");
    setDoneNote("");
  };

  /**
   * En qué estado va el orbe.
   *
   * Sale de la fase que ya existía, no de un estado nuevo: el orbe no sabe
   * nada del Asistente, solo enseña lo que el Asistente ya sabía y contaba con
   * la palabra «Pensando». Escribir es lo que lo pone a escuchar, que es la
   * parte que hace que parezca que te sigue.
   */
  /** Cuántas tareas hay escritas: una por línea con algo dentro. Es lo único
      que separa «planear esto» de «repartir estas». */
  const tareas = text.split("\n").filter((l) => l.trim()).length;

  const estadoOrbe: EstadoOrbe =
    phase === "thinking"
      ? "piensa"
      : phase === "plan" || phase === "done"
        ? "listo"
        : text.trim()
          ? "escucha"
          : "reposo";

  /**
   * Lo que le puedes pedir, dicho con ejemplos que se pulsan.
   *
   * Un cuadro de texto vacío no dice qué acepta, y este acepta lenguaje
   * normal: sin esto hay que adivinar si entiende «ábreme tres claudes» o hay
   * que hablarle como a una consola. Los ejemplos NO son adorno: cada uno es
   * una de las cosas que el plan sabe montar de verdad (`PlanAction`), así que
   * esta lista y lo que la máquina puede hacer no se pueden separar.
   */
  const EJEMPLOS: Array<{ que: string; ejemplo: string }> = [
    { que: "Abrir lo que ya tienes", ejemplo: "ábreme las sesiones del panel de Orquio" },
    { que: "Montar un equipo", ejemplo: "en Layco: Antigravity al frontend y un Claude al backend" },
    { que: "Mandar una orden a todas", ejemplo: "diles a todas que hagan commit de lo que llevan" },
    { que: "Revisar cómo va algo", ejemplo: "mírame qué está haciendo el agente del login" },
    // Varias líneas: ese es el gesto que lo convierte en un reparto, una
    // tarea por terminal. Por eso el ejemplo las lleva.
    {
      que: "Repartir el día",
      ejemplo: "arreglar el hover\nescribir los tests del router\nauditar el login",
    },
  ];

  const body = (
    <>
      {phase === "idle" || phase === "thinking" || phase === "error" ? (
        <>
          <textarea
            ref={inputRef}
            className="mission-text foreman-input"
            placeholder={t(
              'Pídeme el tablero: "ábreme las sesiones del panel de Orquio" o "en Layco: Antigravity al frontend y un Claude al backend para el formulario de pago"',
            )}
            rows={mode === "overlay" ? 3 : 5}
            value={text}
            disabled={phase === "thinking"}
            onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask();
              } else if (e.key === "Escape" && mode === "overlay") {
                onClose?.();
              }
            }}
          />
          <div className="foreman-row">
            {/* El botón principal cambia de oficio según lo que hayas escrito.
                Una frase se planea aquí; varias líneas son varias tareas y
                eso es un reparto, que tiene su propia tabla de destinos. El
                usuario no elige entre dos botones: escribe, y el número de
                líneas decide. */}
            {tareas > 1 && onRepartir ? (
              <button className="np-btn" onClick={() => onRepartir(text)}>
                {t("Repartir las {n} tareas", { n: tareas })}
              </button>
            ) : (
              <button
                className="np-btn"
                disabled={!text.trim() || phase === "thinking"}
                data-tip={t(
                  "Monta el tablero: mira tus proyectos y tus sesiones y te propone qué abrir y con qué cerebro. Nada se ejecuta hasta que lo apruebes.",
                )}
                onClick={ask}
              >
                {t(phase === "thinking" ? "Pensando el plan…" : "Planear")}
              </button>
            )}
            {/* El oficio nuevo: no monta tablero ni escribe encargos, MIRA
                Adeorq y te contesta. Va aquí, pegado al principal, porque es
                lo que más veces vas a querer: preguntar es más barato que
                montar, y hasta hoy no se podía. */}
            <button
              className="np-btn ghost"
              disabled={!text.trim() || preguntando || phase === "thinking"}
              data-tip={t(
                "Mira Adeorq por dentro (tus terminales, tus proyectos, la agenda) y te responde. Lo que puede tocar mientras tanto lo decide el escalón de aquí abajo.",
              )}
              onClick={preguntar}
            >
              {t(preguntando ? "Mirando…" : "Preguntar")}
            </button>
            {/* El segundo oficio, al lado y con el mismo peso: no monta nada,
                escribe el encargo para la terminal que tienes delante. */}
            <button
              className="np-btn ghost"
              disabled={!text.trim() || escribiendo || phase === "thinking"}
              data-tip={t(
                "No abre nada: convierte lo que has dicho en el encargo que necesita leer el agente de la terminal que tienes delante, y te lo deja escrito ahí. No lo envía.",
              )}
              onClick={redactar}
            >
              {t(escribiendo ? "Escribiendo…" : auto ? "Escribir y ponerlo" : "Escribir el encargo")}
            </button>
            {/* El automático. Se queda pegado a su botón porque es lo que
                cambia: sin él sale la ficha y eliges, con él se aplica y ya.
                Nunca envía; el Enter del encargo sigue siendo tuyo. */}
            <button
              className="fm-auto"
              data-on={auto}
              data-tip={
                auto
                  ? t("Automático puesto: aplica el cerebro que toque y deja el encargo escrito, sin enseñarte la ficha. No lo envía.")
                  : t("Automático: en vez de enseñarte la ficha, ajusta el cerebro y deja el encargo escrito en la terminal de delante. No lo envía.")
              }
              onClick={() => {
                const v = !auto;
                setAuto(v);
                localStorage.setItem(AUTO, v ? "1" : "0");
              }}
            >
              <BoltIcon size={13} />
              {t("Automático")}
            </button>
            {/* La voz. Un clic la pone con la voz de la casa; otro la quita.
                Elegir entre las cinco voces de Grok se hace con clic derecho,
                que rota, porque cinco botones para una preferencia serían
                más mueble que mando. */}
            <button
              className="fm-auto"
              data-on={!!voz}
              data-tip={
                voz
                  ? t("El Asistente habla con la voz {voz} (Grok, con tu clave de OpenRouter). Clic para callarlo; clic derecho para cambiar de voz.", { voz })
                  : t("Que el Asistente diga sus respuestas en alto (Grok TTS por OpenRouter, con tu clave de Cuentas › OpenRouter).")
              }
              onClick={() => {
                const v = voz ? "" : VOCES[0];
                if (!v) parar();
                setVoz(v);
                localStorage.setItem(VOZ_KEY, v);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!voz) return;
                const v = VOCES[(VOCES.indexOf(voz as (typeof VOCES)[number]) + 1) % VOCES.length];
                setVoz(v);
                localStorage.setItem(VOZ_KEY, v);
              }}
            >
              <VozIcon size={13} />
              {voz ? `${t("Voz")} · ${voz}` : t("Voz")}
            </button>
          </div>
          {/* Los atajos, DEBAJO y en su propio renglón. Iban dentro de la fila
              de botones, y como un flex encoge a sus hijos antes que
              desbordar, esta frase de cuatro datos les robaba el ancho hasta
              partirles las palabras: «Plan / it», «Write the / brief» (Munir,
              2026-08-09, con la captura). Los botones ya no ceden (`flex:
              none`) y esto no tiene por qué competir con ellos: es una nota al
              pie, y una nota al pie va al pie. */}
          {/* EL CONMUTADOR. Tres escalones y no un interruptor de dos, porque
              la frontera de verdad no está entre «propone» y «actúa»: está
              entre montar trabajo NUEVO (que no molesta a nadie) y meterse en
              una terminal que ya está trabajando (que sí).
              Y no es un cartel: cada escalón ES la lista de herramientas que
              recibe (lib/manos.ts). Lo que no está en su escalón no puede
              hacerlo, aunque el modelo lo intente. */}
          <div className="fm-modo" role="group" aria-label={t("Qué puede hacer")}>
            {MODOS.map((m) => (
              <button
                key={m}
                data-on={modo === m}
                data-tip={t(ROTULO[m].que)}
                onClick={() => {
                  setModo(m);
                  guardarModo(m);
                }}
              >
                {t(ROTULO[m].nombre)}
              </button>
            ))}
            <span className="fm-modo-que">{t(ROTULO[modo].que)}</span>
          </div>
          {/* Lo que ha contestado. Va en su propio bloque y no en el cuadro de
              texto: el cuadro es tuyo y lo que escribes ahí sigue ahí, que es
              lo que permite repreguntar sin volver a escribirlo todo. */}
          {respuesta && (
            <div className="fm-respuesta">
              <p>{respuesta}</p>
              <button className="fm-respuesta-x" onClick={() => setRespuesta(null)}>
                {t("Vale")}
              </button>
            </div>
          )}
          {mode === "overlay" && (
            <span className="foreman-hint">{t("Enter planea · Ctrl+Mayús+M dicta · Esc cierra · nada se ejecuta sin tu OK")}</span>
          )}
          {/* La mini guía. Solo con el cuadro vacío y antes de la primera
              pregunta: en cuanto escribes algo estorba, y quien ya sabe lo que
              quiere no la ve nunca. Cada fila se pulsa y se escribe sola, que
              es la única forma de que un ejemplo enseñe de verdad: leerlo no
              te dice si al pulsar Enter va a pasar lo que crees. */}
          {phase === "idle" && !text.trim() && (
            <div className="fm-guia">
              <p className="fm-guia-tit">{t("Háblame normal. Puedo, por ejemplo:")}</p>
              <ul>
                {EJEMPLOS.map((e) => (
                  <li key={e.que}>
                    <button
                      className="fm-guia-fila"
                      onClick={() => {
                        // El ejemplo entra TRADUCIDO: es lo que se va a leer
                        // en el cuadro y lo que va a acabar leyendo el modelo.
                        setText(t(e.ejemplo));
                        inputRef.current?.focus();
                      }}
                    >
                      <span className="fm-guia-que">{t(e.que)}</span>
                      <span className="fm-guia-ej">{t(e.ejemplo).replace(/\n/g, " · ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="fm-guia-pie">
                {t("Una línea es un encargo. Varias líneas, una terminal para cada una.")}
              </p>
            </div>
          )}

          {/* Grabando. Un punto rojo latiendo y la palabra: es la señal que
              todo el mundo reconoce sin que nadie se la explique, y hace falta
              precisamente porque ya no hay un botón que mirar. */}
          {(oyendo || transcribiendo) && (
            <div className="fm-rec" data-on={oyendo}>
              <span className="fm-rec-punto" />
              {oyendo ? t("REC · grabando, Ctrl+Mayús+M para parar") : t("Transcribiendo…")}
            </div>
          )}
          {vozError && <p className="np-err">{vozError}</p>}
          {phase === "error" && <p className="np-err">{error}</p>}

          {/* Lo que hizo el automático la última vez. Está aquí porque una
              decisión que se toma sola y no se puede leer después no se puede
              corregir, que es justo lo que este router evita: el modo
              automático se ahorra la ficha, no el porqué. Se va al leerlo. */}
          {recibo && !ficha && (
            <div className="fm-recibo">
              <CheckIcon size={13} />
              <span className="fm-recibo-txt">
                <strong>
                  {[recibo.modelo, recibo.esfuerzo].filter(Boolean).join(" · ") ||
                    t("sin cambiar el cerebro")}
                </strong>
                {recibo.porque && <em>{recibo.porque}</em>}
              </span>
              <button
                className="mini"
                data-tip={t("Quitar este aviso")}
                onClick={() => {
                  setRecibo(null);
                  localStorage.removeItem(RECIBO);
                }}
              >
                <CloseIcon size={12} />
              </button>
            </div>
          )}

          {/* El encargo escrito Y a quién va. Se lee y se decide: no llega a
              ninguna terminal hasta que tú digas por dónde. El texto es
              editable porque esto es un ayudante, no un oráculo: la última
              palabra sobre lo que se pide la tienes tú. */}
          {ficha && elegido && (
            <div className="fm-ficha">
              <span className="fm-ficha-tit">{t("El encargo")}</span>
              <textarea
                className="fm-ficha-txt"
                rows={mode === "overlay" ? 5 : 6}
                value={ficha.encargo}
                onChange={(e) => setFicha({ ...ficha, encargo: e.currentTarget.value })}
              />

              <span className="fm-ficha-tit">{t("Para quién")}</span>
              <div className="fm-destino">
                <span className="fm-pastilla fm-cli">{providerOf(elegido.cli).label}</span>
                {elegido.cuenta && <span className="fm-pastilla">{elegido.cuenta.label}</span>}
                {elegido.modelo && (
                  <span className="fm-pastilla fm-cerebro">
                    {elegido.modelo} <em>{comoPeso(elegido.modelo)}</em>
                  </span>
                )}
                {elegido.esfuerzo && (
                  <span className="fm-pastilla" data-tip={t("Cuánto se lo piensa antes de responder")}>
                    {elegido.esfuerzo}
                  </span>
                )}
              </div>

              {/* Los porqués. Es lo que separa una recomendación de una orden:
                  si no estás de acuerdo, aquí ves exactamente con qué. */}
              <ul className="fm-porque">
                {ficha.porqueTarea && <li>{ficha.porqueTarea}</li>}
                {ficha.receta.porque.map((linea, i) => (
                  <li key={i}>{linea}</li>
                ))}
              </ul>

              {ficha.receta.aviso && <p className="fm-aviso">{ficha.receta.aviso}</p>}

              <div className="fm-cambiar">
                <span className="fm-cambiar-tit">{t("Cambiarlo")}</span>
                {A_MANO.map((m) => (
                  <button
                    key={m}
                    className="mini fm-op"
                    data-on={sabe(elegido.cli, "modelo") && elegido.modelo === m}
                    data-tip={
                      m === ficha.receta.modelo
                        ? t("Lo recomendado para esta tarea")
                        : t("{n} veces el peso de haiku", { n: String(PESO[m]) })
                    }
                    onClick={() => setElegido({ ...elegido, cli: "claude", modelo: m })}
                  >
                    {m} {comoPeso(m)}
                  </button>
                ))}
                {ficha.receta.alternativa && (
                  <button
                    className="mini fm-op"
                    data-on={elegido.cli === ficha.receta.alternativa.cli}
                    data-tip={ficha.receta.alternativa.porque}
                    onClick={() =>
                      setElegido({
                        cli: ficha.receta.alternativa!.cli,
                        cuenta: ficha.receta.alternativa!.cuenta,
                        modelo: ficha.receta.alternativa!.modelo,
                        esfuerzo: elegido.esfuerzo,
                      })
                    }
                  >
                    {providerOf(ficha.receta.alternativa.cli).label}
                  </button>
                )}
              </div>

              <div className="foreman-row">
                <button
                  className="np-btn"
                  disabled={exec.focused() == null || elegido.cli !== "claude"}
                  data-tip={
                    elegido.cli !== "claude"
                      ? t("Esa terminal es de otro CLI: ábrela nueva")
                      : t("Ajusta el panel de delante y deja el encargo escrito, sin enviarlo")
                  }
                  onClick={() => {
                    exec.onDespachar(ficha.encargo, elegido.modelo, elegido.esfuerzo);
                    descartarFicha();
                    if (mode === "overlay") onClose?.();
                  }}
                >
                  {t("Ponerlo en esta terminal")}
                </button>
                <button
                  className="np-btn ghost"
                  disabled={!dondeAbrir()}
                  data-tip={t("Abre una terminal nueva ya nacida con ese cerebro")}
                  onClick={() => {
                    const cwd = dondeAbrir();
                    const proj = cwd.split(/[\\/]/).filter(Boolean).pop() ?? "claude";
                    exec.onAbrirReceta(elegido, cwd, `${proj} · ${elegido.cli}`, ficha.encargo);
                    descartarFicha();
                    if (mode === "overlay") onClose?.();
                  }}
                >
                  {t("Abrir una nueva así")}
                </button>
                <button
                  className="np-btn ghost"
                  onClick={() => {
                    void navigator.clipboard.writeText(ficha.encargo).catch(() => {});
                    descartarFicha();
                  }}
                >
                  {t("Copiarlo")}
                </button>
                <button className="mini" onClick={descartarFicha}>
                  {t("Descartar")}
                </button>
              </div>
            </div>
          )}
        </>
      ) : phase === "plan" && plan ? (
        <>
          {plan.resumen && <p className="foreman-summary">{plan.resumen}</p>}
          {checked.length === 0 && (
            <p className="card-hint">{t("El Capataz no propuso acciones para ese pedido.")}</p>
          )}
          <ul className="plan-list">
            {checked.map((c, i) => (
              <li key={i} className="plan-item" data-ok={c.ok} data-tip={c.action.prompt || c.action.encargo || ""}>
                <span className="plan-icon">{actionIcon(c.action)}</span>
                <span className="plan-label">
                  {actionLabel(c)}
                  {c.action.motivo ? ` · ${c.action.motivo}` : ""}
                {!c.ok && ` · ⚠ ${c.why}`}
                </span>
                {/* Con qué cerebro abre. Antes solo se veía en la revisión y
                    escrito dentro del texto; ahora va en todas las que abren un
                    agente, porque es la diferencia entre aceptar un plan y
                    aceptarlo sabiendo lo que cuesta. */}
                {c.ok && cerebrosDe(c).length > 0 && (
                  <span
                    className="plan-cerebro"
                    data-tip={
                      [
                        c.porque,
                        c.esfuerzo && `Esfuerzo ${c.esfuerzo}.`,
                        "Se cambia dentro del pane con /model y /effort.",
                      ]
                        .filter(Boolean)
                        .join("\n")
                    }
                  >
                    {resumeCerebros(cerebrosDe(c))}
                    {c.porque && " ⓘ"}
                  </span>
                )}
                {c.ok && (c.action.tipo === "claude_nuevo" || c.action.tipo === "revisar" || c.action.tipo === "cuadrilla") && (
                  <label
                    className="plan-shadow-chk"
                    data-tip={t("Abrir esta terminal aislada en Modo Espejo")}
                  >
                    <input
                      type="checkbox"
                      checked={!!shadowEnabled[c.originalIndex]}
                      onChange={(e) => {
                        setShadowEnabled((prev) => ({
                          ...prev,
                          [c.originalIndex]: e.target.checked,
                        }));
                      }}
                    />
                    <span>Espejo</span>
                  </label>
                )}
              </li>
            ))}
          </ul>
          {/* Lo que va a costar, antes de darle al botón.
              Un plan que abre seis agentes con tres opus dentro pesa lo mismo
              que quince haikus, y hasta ahora eso solo se descubría después,
              mirando la cuota. No es una factura: con suscripción no hay
              factura. Es la única cifra comparable que existe. */}
          {agentesDelPlan.length > 0 && (
            <p className="plan-total">
              {t("Abre {n} agentes", { n: String(agentesDelPlan.length) })} ·{" "}
              <strong>{resumeCerebros(agentesDelPlan)}</strong> ·{" "}
              <span data-tip={t("Peso relativo, tomando haiku como 1")}>
                ×{pesoDelPlan(agentesDelPlan)}
              </span>
              {semanaJusta != null && (
                <span className="plan-total-cuota">
                  {" "}
                  · {t("te queda un {p} % de semana", { p: String(100 - semanaJusta) })}
                </span>
              )}
            </p>
          )}
          <div className="foreman-row">
            <button className="np-btn" disabled={valid.length === 0} onClick={() => void run()}>
              Ejecutar {valid.length} acci{valid.length === 1 ? "ón" : "ones"}
            </button>
            <button className="mini modal-cancel" onClick={reset}>
              {t("Descartar")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="np-ok">{doneNote}</p>
          <div className="foreman-row">
            <button className="mini modal-cancel" onClick={mode === "overlay" ? onClose : reset}>
              {t(mode === "overlay" ? "Cerrar" : "Otro pedido")}
            </button>
          </div>
        </>
      )}
    </>
  );

  if (mode === "card") {
    return (
      <section className="panel-card foreman-card">
        <h2>{t("✦ Capataz")}</h2>
        <p className="card-hint">
          Pídele el tablero en cristiano: él propone el plan (sesiones, Claudes,
          terminales, Antigravity) y no ejecuta nada sin tu OK. En la Cabina:
          Ctrl+Mayús+A.
        </p>
        {body}
      </section>
    );
  }

  // A `document.body` y no donde cae en el árbol: esto es una ventana flotante
  // sobre TODA la app, y `position: fixed` deja de mirar a la ventana en cuanto
  // cualquier ancestro tiene un filtro, una transformación o un `contain`. Hoy
  // no lo tienen; el día que alguien le ponga un efecto al fondo, esto seguiría
  // centrado en vez de irse a una esquina sin que nadie sepa por qué.
  return createPortal(
    <div
      className="foreman-overlay"
      {...propsDeVelo(bajoEnVelo, () => onClose?.())}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose?.();
      }}
    >
      <div className="foreman-box">
        <div className="foreman-title">
          <Orbe estado={estadoOrbe} size={22} />
          {/* «Capataz» y no «Asistente»: el panel se llamaba de las dos formas
              a la vez (la tarjeta del Panel ya decía Capataz) y Munir cerró el
              nombre el 2026-08-13. Un nombre a medias es dos piezas para quien
              lo lee. */}
          {t("Capataz")}
        </div>
        {body}
      </div>
    </div>,
    document.body,
  );
}
