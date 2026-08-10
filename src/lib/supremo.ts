// Las decisiones de la sesión suprema, sin React ni Tauri delante.
//
// Una sesión con el MCP de Adeorq puesto puede pedir que se abran otras y que
// se unan con flechas (`open_pane` y `link_panes` en `mcp.rs`). Rust no sabe
// montar un panel del lienzo, así que emite el pedido y la ventana lo atiende;
// lo que decide QUÉ abrir y CÓMO contestarle está aquí, aparte, porque es la
// parte que se puede equivocar y la única que se puede comprobar sin abrir la
// app (ver `scripts/supremo-check.ts`).
//
// El plano entero está en `docs/SUPREMA.md`.

/** Lo que llega por el evento `mcp:pedido`. Todo opcional menos lo primero:
 *  viene de un modelo, así que se valida aquí y no se da nada por hecho. */
export interface PedidoMcp {
  peticion: number;
  clase: string;
  cli?: string;
  cwd?: string;
  project?: string;
  brief?: string;
  name?: string;
  /** De qué panel colgar el nuevo, cuando el agente quiere el árbol hecho. */
  from?: number | null;
  to?: number | null;
  auto?: boolean;
}

/** Lo que se le devuelve a Rust, que se lo devuelve al agente. */
export interface RespuestaMcp {
  pane_id?: number;
  donde?: "lienzo" | "cabina";
  error?: string;
  /** El parte para el agente. Lo redacta la ventana porque es la única que sabe
   *  con qué CLI acabó abriendo y si ese acepta encargo al arrancar. */
  parte?: string;
}

/**
 * Los CLIs que aceptan el encargo en la línea de arranque.
 *
 * El resto nacen vacíos y hay que hablarles después. No es un descuido nuestro:
 * cada CLI decide si su primer argumento es un prompt o un subcomando, y meterle
 * texto suelto a uno que no lo espera es abrirle una terminal con un error
 * dentro. Al agente se le DICE, para que mande el encargo él con `send_command`
 * en vez de suponer que llegó.
 */
export const ARRANCAN_CON_ENCARGO = new Set(["claude", "agy"]);

/** Los que Adeorq sabe abrir. `shell` no es un agente: es una consola pelada,
 *  y vale como pieza del árbol para tareas que no necesitan modelo. */
export const CLIS_CONOCIDOS = new Set([
  "claude",
  "codex",
  "gemini",
  "qwen",
  "copilot",
  "crush",
  "opencode",
  "amp",
  "agy",
  "cursor",
  "pi",
  "kiro",
  "shell",
]);

/** El CLI pedido, o el motivo por el que no vale. Un modelo escribe «Claude» y
 *  «claude-code» con la misma intención, así que se limpia antes de juzgar. */
export function cliPedido(bruto?: string): { cli: string } | { error: string } {
  const v = (bruto ?? "claude").trim().toLowerCase();
  if (!v) return { cli: "claude" };
  // «claude-code», «codex-cli»: el sufijo es cómo se llama el paquete, no el CLI.
  const limpio = v.replace(/[-_](code|cli)$/, "");
  if (CLIS_CONOCIDOS.has(limpio)) return { cli: limpio };
  return {
    error: `No conozco el CLI «${bruto}». Los que hay son: ${[...CLIS_CONOCIDOS].join(", ")}.`,
  };
}

/**
 * En qué carpeta nace.
 *
 * `cwd` gana sobre `project` porque es más concreto, pero solo si de verdad
 * parece una ruta: un modelo que confunde los dos campos escribe el NOMBRE del
 * proyecto en `cwd`, y abrir una terminal en una carpeta inventada es abrirla
 * en cualquier sitio. Si no cuadra, se busca por nombre antes de rendirse.
 */
export function carpetaDe(
  pedido: PedidoMcp,
  proyectos: Array<{ name: string; path: string }>,
): { cwd: string } | { error: string } {
  const cwd = (pedido.cwd ?? "").trim();
  const nombre = (pedido.project ?? "").trim();

  const esRuta = /[\\/]/.test(cwd) || /^[a-zA-Z]:/.test(cwd);
  if (cwd && esRuta) return { cwd };

  // Lo que venga suelto (en `project`, o en `cwd` mal puesto) se busca por
  // nombre, sin distinguir mayúsculas: los proyectos de la casa se escriben de
  // las dos formas según quién los nombre.
  const busca = (nombre || cwd).toLowerCase();
  if (busca) {
    const p = proyectos.find((x) => x.name.toLowerCase() === busca);
    if (p) return { cwd: p.path };
    return {
      error: `No hay ningún proyecto que se llame «${nombre || cwd}». Mira get_projects, o pasa una ruta entera en cwd.`,
    };
  }
  return { error: "Falta dónde abrirla: pasa `project` o `cwd`." };
}

/** Cómo se llamará el panel en su cabecera. Corto, porque ahí compite con el
 *  resto de la cabecera; y con el proyecto delante, como el resto de la app. */
export function nombreDe(pedido: PedidoMcp, cwd: string, cli: string): string {
  const propio = (pedido.name ?? "").trim();
  const proyecto = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cli;
  if (propio) return `${proyecto} · ${propio.slice(0, 40)}`;
  return `${proyecto} · ${cli}`;
}

/**
 * Lo que se le cuenta al agente cuando su terminal ya está abierta.
 *
 * Importa más de lo que parece: es lo único que sabrá de lo que acaba de pasar,
 * y de aquí sale si va a esperar en balde. Dice el número, dónde cayó, si las
 * flechas existen allí y si su encargo llegó o tiene que mandarlo él.
 */
export function parteDeApertura(a: {
  paneId: number;
  cli: string;
  donde: "lienzo" | "cabina";
  conEncargo: boolean;
  flecha?: "hecha" | "sin-lienzo";
}): string {
  const lineas = [
    `Terminal ${a.paneId} abierta con «${a.cli}» en ${a.donde === "lienzo" ? "el lienzo" : "la cabina"}.`,
  ];
  if (!a.conEncargo) {
    lineas.push(
      `«${a.cli}» no admite el encargo al arrancar, así que ha nacido vacía: mándaselo tú con send_command(${a.paneId}, "...") en cuanto veas por read_pane_transcript que ya está lista.`,
    );
  }
  if (a.donde === "cabina") {
    lineas.push(
      "En la cabina no hay flechas: para encadenarla con otras, el humano tiene que estar en el Lienzo cuando la abras.",
    );
  }
  if (a.flecha === "hecha") lineas.push("Y le he dibujado la flecha que pediste.");
  if (a.flecha === "sin-lienzo")
    lineas.push("La flecha NO se ha dibujado: esa terminal no está en el lienzo.");
  return lineas.join(" ");
}
