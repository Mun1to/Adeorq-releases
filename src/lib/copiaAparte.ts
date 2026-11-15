// La copia aparte (el Modo Espejo) para lo que trabaja sin nadie mirando.
//
// Munir, 2026-11-15, sobre cuáles: «Solo las que trabajan solas sin nadie
// mirando, como las de la noche. Lo de día lo ves pasar y lo paras tú; lo de
// noche no lo ve nadie, y ahí una copia te ahorra el susto por la mañana.»
//
// Así que un encargo programado nace en una copia (`programados.rs` manda
// `espejo` en su `open_pane`), y lo que abra una terminal que vive en una copia
// nace DENTRO de esa misma copia, igual que de día nace en la carpeta de su
// madre: así su trabajo se acepta de una vez, con el botón de la que la tiene.
// Y nadie cierra por el MCP la terminal dueña con trabajo sin aceptar: ese botón
// vive en ella, y sin ella el trabajo se queda en una rama que no se ve.
//
// Lo de decidir es puro (banco: `scripts/copia-aparte-check.ts`). El registro
// de abajo lo llenan `TerminalPane` al montar su espejo y `puenteMcp.ts` al
// poner una hija en la copia de su madre.

export interface Copia {
  /** La carpeta de verdad del proyecto. */
  proyecto: string;
  /** El árbol del espejo, donde se trabaja (`<proyecto>\.adeorq\espejo\<nombre>`). */
  arbol: string;
  /** La rama de la que nació, para contar lo que lleva por delante. */
  base: string;
  /** La terminal que tiene el botón de aceptar o tirar. */
  duena: number;
}

/** Una ruta de Windows: con letra de unidad o con `\`. Ahí la mayúscula no cuenta. */
const deWindows = (s: string) => /^[A-Za-z]:|\\/.test(s);
/** Con qué barra se une lo que cuelga de esa ruta: la suya, no siempre `\`
    (en Linux y macOS `\` es un carácter más del nombre). */
const barraDe = (s: string) => (deWindows(s) ? "\\" : "/");
/** Con una sola clase de barra y sin la del final, para cortar y comparar. */
const tramos = (s: string) => s.replace(/[\\/]+/g, "/").replace(/\/+$/, "");
const comparable = (s: string) => (deWindows(s) ? tramos(s).toLowerCase() : tramos(s));
/** `a` y luego `resto`, con la barra de `a`. */
const unir = (a: string, resto: string) => {
  if (!resto) return a;
  const b = barraDe(a);
  return `${(b === "\\" ? a.replace(/\//g, "\\") : a).replace(/[\\/]+$/, "")}${b}${resto.split("/").join(b)}`;
};

/** Ya es el árbol de un espejo, o una carpeta de dentro (`git_shadow.rs`). */
const enUnEspejo = (cwd: string) => /[\\/]\.adeorq[\\/]espejo[\\/][^\\/]+/i.test(cwd);

/** Lo que queda de `ruta` dentro de `de` («» si es la misma), con `/`, o null si está fuera. */
export function dentroDe(ruta: string, de: string): string | null {
  const r = comparable(ruta);
  const d = comparable(de);
  if (!d) return null;
  if (r === d) return "";
  return r.startsWith(`${d}/`) ? tramos(ruta).slice(d.length + 1) : null;
}

/**
 * La raíz del proyecto en la que se monta el espejo de una carpeta: la de primer
 * nivel dentro de la carpeta de proyectos, o la propia carpeta si está fuera.
 * Vivía dentro de `TerminalPane`; aquí la usa también quien decide antes de
 * abrir si se puede montar.
 */
export function proyectoDe(cwd: string, base: string): string {
  const raiz = base.replace(/[\\/]+$/, "");
  if (!raiz) return cwd;
  const resto = dentroDe(cwd, raiz);
  if (!resto) return cwd;
  return unir(raiz, resto.split("/")[0]);
}

/** El árbol del espejo `nombre` de la carpeta `cwd`, donde corre su CLI y donde
    guarda su conversación (`ruta_espejo` en `git_shadow.rs`). */
export function arbolDe(cwd: string, nombre: string, base: string): string {
  return unir(proyectoDe(cwd, base), `.adeorq/espejo/${nombre}`);
}

export interface Nace {
  /** Dónde arranca. */
  cwd: string;
  /** La copia de su madre en la que trabaja, si trabaja en una. */
  copia: Copia | null;
  /** Necesita su propio espejo (si su carpeta es un repo de git). */
  espejo: boolean;
}

/**
 * Dónde nace una terminal que pide un agente o un encargo.
 *
 * - Hija de una que vive en una copia, en su mismo proyecto: dentro de la copia,
 *   en la misma subcarpeta que pidió. Pidiendo la carpeta de verdad caería en
 *   ella, y el trabajo de la noche se saldría de la copia por la puerta de atrás.
 * - Hija de una copia, en OTRO proyecto: su propio espejo allí.
 * - Un encargo de la noche (`pideEspejo`): su propio espejo.
 * - Una carpeta que ya es el árbol de un espejo: ahí mismo, sin otro encima.
 */
export function dondeNace(cwd: string, pideEspejo: boolean, madre: Copia | undefined): Nace {
  if (madre) {
    if (dentroDe(cwd, madre.arbol) !== null) return { cwd, copia: madre, espejo: false };
    if (enUnEspejo(cwd)) return { cwd, copia: null, espejo: false };
    const resto = dentroDe(cwd, madre.proyecto);
    if (resto !== null) return { cwd: unir(madre.arbol, resto), copia: madre, espejo: false };
    return { cwd, copia: null, espejo: true };
  }
  if (enUnEspejo(cwd)) return { cwd, copia: null, espejo: false };
  return { cwd, copia: null, espejo: pideEspejo };
}

/**
 * La copia en la que corre una carpeta, leída de su ruta, para la terminal que
 * el registro no conoce (una hija recogida tras una caída). Sin rama base: solo
 * la dueña la necesita, y a esa la apunta su `TerminalPane`.
 */
export function copiaPorCarpeta(cwd: string | undefined): Copia | undefined {
  const m = cwd ? /^(.+?)[\\/]\.adeorq[\\/]espejo[\\/]([^\\/]+)/i.exec(cwd) : null;
  if (!cwd || !m) return undefined;
  return { proyecto: m[1], arbol: m[0], base: "", duena: Number(m[2].split("-")[0]) || 0 };
}

export interface Pendiente {
  sueltos: number;
  commits: number;
}

/**
 * Por qué no se cierra por el MCP (o por el reloj) la terminal `id`, o null si
 * se puede. Solo la dueña de la copia tiene botón; una hija que trabaja dentro
 * se cierra como siempre. Sin poder contar (`pendiente` null) no se cierra:
 * mejor una terminal de más por la mañana que un trabajo sin botón.
 */
export function porQueNoSeCierra(id: number, copia: Copia | undefined, pendiente: Pendiente | null): string | null {
  if (!copia || copia.duena !== id) return null;
  if (pendiente && pendiente.sueltos + pendiente.commits === 0) return null;
  const partes = pendiente
    ? [
        pendiente.sueltos > 0 ? `${pendiente.sueltos} ${pendiente.sueltos === 1 ? "archivo" : "archivos"} sin guardar` : "",
        pendiente.commits > 0 ? `${pendiente.commits} ${pendiente.commits === 1 ? "commit" : "commits"}` : "",
      ].filter(Boolean)
    : [];
  const tiene = pendiente ? `tiene trabajo sin aceptar: ${partes.join(" y ")}` : "no he podido mirar si tiene trabajo sin aceptar";
  return (
    `La terminal ${id} trabaja en una copia aparte del proyecto (el Modo Espejo) y ${tiene}. ` +
    "No la cierro: el botón para aceptarlos o tirarlos vive en ella, y sin ella se quedarían en una rama que no se ve. " +
    "Déjala abierta; se aceptan desde Adeorq."
  );
}

/** Lo que se le dice al agente al final de su encargo cuando trabaja en una copia. */
export function notaDeCopia(proyecto: string): string {
  return (
    `\n\n[adeorq] Trabajas en una copia aparte de ${proyecto} (el Modo Espejo de Adeorq), en una rama propia: ` +
    "lo que cambies se queda en ella hasta que se acepte desde Adeorq. No cambies de rama ni hagas push. " +
    `Lo que no está en git (como el BUZON.md) solo está en ${proyecto}.`
  );
}

/** Lo que se dice en la respuesta de `open_pane`. */
export function parteDeCopia(copia: "propia" | "de su madre" | { sin: string }): string {
  if (typeof copia === "object") return `Sin copia aparte: ${copia.sin}, así que trabaja en la carpeta de verdad.`;
  if (copia === "propia") {
    return "Trabaja en una copia aparte (Modo Espejo): sus cambios se aceptan o se tiran desde su terminal, y no se cierra por el MCP con cambios sin aceptar.";
  }
  return "Trabaja dentro de la copia aparte (Modo Espejo) de quien la abrió: sus cambios se aceptan con los de ella.";
}

// ─── El registro: qué terminal vive en qué copia ────────────────────────────

const copias = new Map<number, Copia>();

export function apuntarCopia(id: number, c: Copia): void {
  copias.set(id, c);
}

export function copiaDe(id: number): Copia | undefined {
  return copias.get(id);
}

/** La terminal se fue: deja de estar en su copia (la copia sigue en el disco). */
export function soltarCopia(id: number): void {
  copias.delete(id);
}

/** Se aceptó o se tiró: esa copia ya no existe, ni para sus hijas. */
export function copiaCerrada(arbol: string): void {
  for (const [id, c] of copias) if (dentroDe(c.arbol, arbol) === "") copias.delete(id);
}
