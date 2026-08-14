// Qué puede tocar el Capataz, y con qué llave.
//
// ── POR QUÉ ESTO NO ES UN AJUSTE MÁS ────────────────────────────────────────
//
// El conmutador que pidió Munir (2026-08-13) no puede ser una frase metida en
// el prompt del estilo «no escribas en las terminales sin permiso». Eso es una
// petición educada: el día que el modelo decida que la ocasión lo merece, lo
// hace, y nadie se entera hasta que ha pisado el trabajo de alguien.
//
// Aquí el modo ES la lista de herramientas que recibe. Lo que no está en la
// lista NO EXISTE en su sesión: no es que no deba usarlo, es que no puede
// nombrarlo. Una puerta cerrada en vez de un cartel de «no pasar».
//
// ── LO QUE DECIDE CADA ESCALÓN ──────────────────────────────────────────────
//
// La frontera de verdad la marca UNA herramienta: `send_command`, que teclea
// dentro de una terminal donde puede estar trabajando alguien. Todo lo demás o
// es mirar, o es AÑADIR (abrir una terminal nueva, enlazar dos), y añadir no
// pisa a nadie. Por eso el escalón de en medio existe y es el que vale para el
// día a día: puede montarte trabajo nuevo, no puede interrumpir el que hay.
//
// Los nombres llevan el prefijo `mcp__adeorq__` porque así es como los ve el
// cliente: el servidor se llama «adeorq» en el fichero que le escribe
// `config_mcp()` (src-tauri/src/foreman.rs).

/** Las manos que Adeorq expone por MCP, en un solo sitio. */
export const MANOS = {
  /** Los proyectos de C:\proyectos, con su ruta. */
  proyectos: "mcp__adeorq__get_projects",
  /** Las terminales abiertas ahora mismo y en qué anda cada una. */
  panes: "mcp__adeorq__get_active_panes",
  /** Lo que se ha dicho dentro de una terminal. */
  transcripcion: "mcp__adeorq__read_pane_transcript",
  /** La bandeja y los objetivos. */
  agenda: "mcp__adeorq__get_agenda",
  /** Cuánto queda en cada suscripción, y cómo repartir el trabajo entre ellas.
      Va en TODOS los escalones, hasta en el de solo mirar: sin este dato el
      Capataz recomienda cerebro a ciegas, que es justo lo que se quería
      arreglar (Munir, 2026-08-13). */
  uso: "mcp__adeorq__get_usage",
  /** Abrir una terminal nueva con su encargo. */
  abrir: "mcp__adeorq__open_pane",
  /** Enlazar dos terminales para que se hablen. */
  enlazar: "mcp__adeorq__link_panes",
  /** ⚠ Teclear DENTRO de una terminal viva. La única que puede pisar trabajo. */
  teclear: "mcp__adeorq__send_command",
} as const;

/**
 * Los tres escalones del conmutador.
 *
 * `mirar`  — solo lee. Contesta preguntas y no cambia nada de nada.
 * `plan`   — puede montar trabajo nuevo, y pregunta lo que le falte antes de
 *            hacerlo. No puede meterse en una terminal que ya está en marcha.
 * `auto`   — todo, incluido interrumpir a un agente a medio trabajo.
 */
export type ModoCapataz = "mirar" | "plan" | "auto";

export const MODOS: ModoCapataz[] = ["mirar", "plan", "auto"];

const LECTURA = [MANOS.proyectos, MANOS.panes, MANOS.transcripcion, MANOS.agenda, MANOS.uso];
const MONTAR = [MANOS.abrir, MANOS.enlazar];

/** Las manos de un modo. El orden es estable a propósito: se comparan en el
    comprobador y una lista que baila haría fallar casos por nada. */
export function manosDe(modo: ModoCapataz): string[] {
  switch (modo) {
    case "mirar":
      return [...LECTURA];
    case "plan":
      return [...LECTURA, ...MONTAR];
    case "auto":
      return [...LECTURA, ...MONTAR, MANOS.teclear];
  }
}

/** Si en este modo puede cambiar algo, o solo mirar. Lo usa la cara para
    avisar antes, no para decidir: quien decide es `manosDe`. */
export function puedeTocar(modo: ModoCapataz): boolean {
  return modo !== "mirar";
}

/** El modo por defecto. El de en medio, y no por prudencia genérica: es el
    único que hace algo útil sin poder pisar trabajo que ya está en marcha. */
export const MODO_FABRICA: ModoCapataz = "plan";

const CLAVE = "adeorq-capataz-modo";

export function leerModo(): ModoCapataz {
  try {
    const v = localStorage.getItem(CLAVE);
    return MODOS.includes(v as ModoCapataz) ? (v as ModoCapataz) : MODO_FABRICA;
  } catch {
    return MODO_FABRICA;
  }
}

export function guardarModo(m: ModoCapataz): void {
  try {
    localStorage.setItem(CLAVE, m);
  } catch {
    // Sin almacenamiento se trabaja igual, solo que sin recordar el modo.
  }
}

/** El nombre que se enseña, y la frase de debajo. En español porque es UI. */
export const ROTULO: Record<ModoCapataz, { nombre: string; que: string }> = {
  mirar: { nombre: "Mirar", que: "Responde y no toca nada" },
  plan: { nombre: "Plan", que: "Monta trabajo nuevo, y pregunta antes" },
  auto: { nombre: "Auto", que: "También interrumpe terminales en marcha" },
};

/**
 * Lo que se le añade al encargo según el modo.
 *
 * Esto NO es lo que impide nada: eso lo hace `manosDe`. Es para que el Capataz
 * sepa en qué escalón está y no prometa lo que hoy no puede, ni pregunte por
 * algo que tiene permiso de hacer.
 */
export function aviso(modo: ModoCapataz): string {
  switch (modo) {
    case "mirar":
      return "MODO MIRAR: hoy solo puedes consultar. Si lo que te piden exige abrir, enlazar o escribir en una terminal, dilo en una frase y para: no tienes esas herramientas.";
    case "plan":
      return "MODO PLAN: puedes abrir terminales y enlazarlas, pero NO escribir dentro de una que ya está trabajando. Y antes de hacer nada que cambie algo, pregunta lo que te falte por saber: un objetivo sin día, un encargo sin proyecto o una tarea sin archivos son preguntas, no suposiciones. Pregunta una vez y espera respuesta.";
    case "auto":
      return "MODO AUTO: puedes hacerlo tú y contarlo después, incluido escribir dentro de una terminal en marcha. Aun así, si vas a interrumpir a un agente a mitad de un trabajo, dilo en la respuesta con el nombre del panel.";
  }
}
