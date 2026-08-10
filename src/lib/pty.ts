import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { leerPerfil, raiz } from "./perfil";
import type { PedidoMcp, RespuestaMcp } from "./supremo";

export interface PtyData {
  id: number;
  data: string;
}

export interface PtyExit {
  id: number;
  code: number | null;
}

export interface Project {
  name: string;
  path: string;
  hasGit: boolean;
}

export interface SessionInfo {
  id: string;
  title: string;
  /** Vacío cuando el transcript no lo dice, que en la interfaz es «no tocar».
      Las sesiones de Codex siempre van así: su historial no deja escrito si
      terminó el turno o te está esperando, e inventárselo sería peor. */
  state: "pregunta" | "ofrece" | "lista" | "a_medias" | "tuya" | "";
  fresh: "activa" | "dormida" | "muerta";
  hours: number;
  ago: string;
  cwd: string;
  resumeCwd: string;
  project: string;
  /** ~/.claude/projects subfolder holding the transcript (for rename). */
  folder: string;
  live: boolean;
  sizeKb: number;
  /** Subagents still out, and how many this session dispatched in total. */
  agentsLive: number;
  agentsTotal: number;
  /** Qué cliente la escribió. Rust lo manda siempre; el `?` es para que una
      versión vieja del binario no rompa la lista mientras se actualiza. */
  fuente?: FuenteSesion;
  /** En qué cuenta se escribió: su carpeta de configuración
      (`CLAUDE_CONFIG_DIR`), o vacío si es la de siempre. Casa con `Account.dir`.
      Sirve para dos cosas: marcar la fila, y retomarla en SU cuenta, porque un
      `--resume` lanzado desde otra no encuentra la conversación. */
  cuenta?: string;
}

export function spawnPty(
  id: number,
  cwd: string,
  cols: number,
  rows: number,
  command?: string[],
  /** Extra environment for this pane, e.g. which account it belongs to. */
  env?: Record<string, string>,
): Promise<void> {
  return invoke("pty_spawn", {
    id,
    cwd,
    cols,
    rows,
    command: command ?? null,
    env: env ?? null,
  });
}

export function writePty(id: number, data: string): Promise<void> {
  return invoke("pty_write", { id, data });
}

export function resizePty(id: number, cols: number, rows: number): Promise<void> {
  return invoke("pty_resize", { id, cols, rows });
}

export function killPty(id: number): Promise<void> {
  return invoke("pty_kill", { id });
}

// La carpeta de proyectos viaja en la llamada, no en un ajuste que Rust
// recuerde: así cambiarla en el onboarding se nota en el escaneo siguiente sin
// que haya dos copias que se puedan separar.
export function listProjects(): Promise<Project[]> {
  const p = leerPerfil();
  return invoke("list_projects", { raiz: p.raiz, sinRaiz: p.sinRaiz, extras: p.extras });
}

export interface Skill {
  name: string;
  description: string;
  invocation: string;
}

export function scanSessions(): Promise<SessionInfo[]> {
  // El permiso del onboarding se respeta AQUÍ, en el único sitio por donde
  // pasa la lectura del historial: si dijo que no, no se abre ni un transcript.
  const p = leerPerfil();
  if (!p.leerSesiones) return Promise.resolve([]);
  return invoke("scan_sessions", { raiz: p.raiz, sinRaiz: p.sinRaiz });
}

export function listSkills(): Promise<Skill[]> {
  return invoke("list_skills");
}

export interface CreatedProject {
  name: string;
  path: string;
  hasGit: boolean;
}

/** `dentroDe` es para quien no tiene carpeta madre: la carpeta padre se elige
    a mano en ese momento, en vez de dar por hecha una que no existe. */
export function createProject(name: string, dentroDe?: string): Promise<CreatedProject> {
  return invoke("create_project", { name, raiz: dentroDe || raiz() });
}

export function readGuide(lang?: string): Promise<string> {
  return invoke("read_guide", { lang: lang ?? null });
}

export function openInAntigravity(path: string): Promise<void> {
  return invoke("open_in_antigravity", { path });
}

/** Writes a pasted image to disk and returns its path (agents read paths). */
export function savePastedImage(bytes: number[], ext: string): Promise<string> {
  return invoke("save_pasted_image", { bytes, ext });
}

/** Guarda un lienzo exportado en la ruta que el usuario eligió. */
export function saveCanvasFile(path: string, content: string): Promise<void> {
  return invoke("save_canvas_file", { path, content });
}

/** Guarda el dibujo del lienzo como imagen (.png o .svg). */
export function saveDrawing(path: string, bytes: number[]): Promise<void> {
  return invoke("save_drawing", { path, bytes });
}

/** Lee un lienzo exportado. */
export function readCanvasFile(path: string): Promise<string> {
  return invoke("read_canvas_file", { path });
}

/** Tira una carpeta de proyecto a la papelera de Windows. Se recupera desde el
    escritorio: esto no borra de verdad, mueve. Rust solo la acepta si está
    dentro de C:\proyectos. */
export function deleteProject(path: string): Promise<void> {
  return invoke("delete_project", { path });
}

/** El tablero de trabajo, el que vuelve solo al abrir. Ruta fija en Rust. */
export function saveBoard(content: string): Promise<void> {
  return invoke("save_board", { content });
}

/** "" si todavía no hay ninguno guardado. */
export function readBoard(): Promise<string> {
  return invoke("read_board");
}

/** Para qué se abrió una sesión. Lo que el CLI no guarda: él tiene la
    conversación, esto tiene la intención. */
export interface Encargo {
  encargo: string;
  rol?: string;
  objetivo?: string;
  cuando?: string;
}

export function saveEncargo(sessionId: string, encargo: Encargo): Promise<void> {
  return invoke("save_encargo", { sessionId, encargo });
}

export function readEncargos(): Promise<Record<string, Encargo>> {
  return invoke("read_encargos");
}

/** Tu cuenta de OpenRouter. La clave vive en el Gestor de Credenciales de
    Windows y NO vuelve aquí: se manda una vez al conectar y a partir de ahí se
    piden datos, no la llave. */
export interface OpenRouterInfo {
  label: string;
  limit: number | null;
  limit_remaining: number | null;
  usage: number;
  usage_daily: number;
  usage_weekly: number;
  usage_monthly: number;
  is_free_tier: boolean;
}

/** Comprueba la clave contra OpenRouter y, si vale, la guarda cifrada. */
export function openrouterConnect(key: string): Promise<OpenRouterInfo> {
  return invoke("openrouter_connect", { key });
}

/** null = todavía no hay clave guardada, que no es un error. */
export function openrouterInfo(): Promise<OpenRouterInfo | null> {
  return invoke("openrouter_info");
}

export function openrouterForget(): Promise<void> {
  return invoke("openrouter_forget");
}

/** Los modelos descargados en Ollama. Lista vacía = no está escuchando, que no
    es un error: es que ahora mismo no lo tienes abierto. */
export function ollamaModels(): Promise<string[]> {
  return invoke("ollama_models");
}

/** Si una página se deja meter en el lienzo. Rechaza con el motivo, para poder
    decirlo en vez de dejar un cuadro blanco sin explicación. */
export function puedeEmpotrarse(url: string): Promise<void> {
  return invoke("puede_empotrarse", { url });
}

/** Una línea del modelo local, sobre el texto que se le dé. */
export function ollamaLine(model: string, prompt: string): Promise<string> {
  return invoke("ollama_line", { model, prompt });
}

/** Qué cliente escribió una sesión. El Sidebar pinta su marca con esto. */
export type FuenteSesion = "claude" | "codex" | "pi";

export interface ContextInfo {
  model: string;
  used: number;
  window: number;
  percent: number;
  /** Subagents dispatched and not back yet, counted in the transcript. */
  agentsLive: number;
  agentsTotal: number;
  /** Which transcript this was read from, so a pane can act on its session
      and not just describe it. A fresh `claude` learns its own id this way. */
  sessionId: string;
  folder: string;
  /** What the session is doing, in the vocabulary of `last_message_state`
      (Rust). Empty when the transcript cannot say: treated as "do not touch". */
  state: WorkState;
}

/** What a session or a pane is doing. Empty = unknown, and never actionable. */
export type WorkState = "pregunta" | "ofrece" | "lista" | "a_medias" | "tuya" | "";

/** A live pane as the rest of the app sees it. Until this existed the Foreman
    knew the NAMES of the open panes and nothing else, so it could not tell a
    pane that is waiting for Munir from one that had already delivered — and
    that is exactly the difference between reaping a pane and losing a question. */
export interface PaneStatus {
  id: number;
  name: string;
  cwd: string;
  /** An agent CLI, as opposed to a plain PowerShell (which has no state). */
  agent: boolean;
  model?: string;
  effort?: string;
  /** Context used, 0-100: the number in the pane header. */
  percent?: number;
  /** Subagents still out. A pane with a crew working is never idle. */
  agentsLive: number;
  state: WorkState;
  /** Its transcript, so an action can point at the session, not just the pane. */
  sessionId?: string;
}

/** How full the context of a pane's session is (read from its transcript). */
export function sessionContext(
  cwd: string,
  sessionId?: string,
): Promise<ContextInfo | null> {
  return invoke("session_context", { cwd, sessionId: sessionId ?? null });
}

/** Did this session ever write a transcript? (restore uses it) */
export function transcriptExists(cwd: string, sessionId: string): Promise<boolean> {
  return invoke("transcript_exists", { cwd, sessionId });
}

/** The agent's last written answer, clean prose from the transcript. */
export function lastReply(
  cwd: string,
  sessionId?: string,
  maxChars?: number,
): Promise<string | null> {
  return invoke("last_reply", {
    cwd,
    sessionId: sessionId ?? null,
    maxChars: maxChars ?? null,
  });
}

export interface UsageReport {
  updated: string;
  week: Array<{ date: string; tokens: number; sessions: number }>;
  weekTokens: number;
  weekSessions: number;
  weekMessages: number;
  byModel: Array<{ model: string; tokens: number }>;
  totalSessions: number;
  totalMessages: number;
}

/** Work done, read from Claude Code's own stats cache (no quota spent).
 *  With a configDir it reads THAT account's cache instead of the main one. */
export function usageReport(configDir?: string): Promise<UsageReport | null> {
  return invoke("usage_report", { configDir: configDir ?? null });
}

export interface PlanInfo {
  subscription: string;
  tier: string;
}

/** Which plan is signed in (read without ever touching the tokens). */
export function planInfo(configDir?: string): Promise<PlanInfo | null> {
  return invoke("plan_info", { configDir: configDir ?? null });
}

/** One line of the /usage card. */
export interface UsageLimit {
  label: string;
  percent: number;
  resets: string;
}

export interface Limits {
  lines: UsageLimit[];
  note: string;
}

/** The plan's limits, asked in the background. Costs nothing: /usage is a
 *  local slash command, so no model turn ever happens. */
export function usageLimits(configDir?: string): Promise<Limits> {
  return invoke("usage_limits", { configDir: configDir ?? null });
}

/**
 * Accounts (META 6). One account = one config folder: CLAUDE_CONFIG_DIR makes
 * the CLI keep a separate login, projects and stats there. The main account is
 * `~/.claude` and carries an empty dir, so it is never touched.
 */
export interface Account {
  id: string;
  /** What Munir calls it. Never an email: this panel can be on a stream. */
  label: string;
  /** Config folder; empty means that CLI's own default folder. */
  dir: string;
  /** Which CLI it belongs to (see lib/providers.ts). */
  provider: string;
}

/** The account each CLI already had before Adeorq existed. */
export function mainAccount(provider: string): Account {
  return { id: `main:${provider}`, label: "Principal", dir: "", provider };
}

export const MAIN_ACCOUNT: Account = mainAccount("claude");

/** Creates (or reuses) the config folder for a new account. */
export function accountDir(label: string): Promise<string> {
  return invoke("account_dir", { label });
}

/**
 * True once that account has logged in, per its CLI's credential files.
 * An empty configDir means that CLI's default account, and homeDir (relative
 * to the user profile) tells Rust where to look for it.
 */
export function accountReady(
  configDir: string,
  files: string[],
  homeDir?: string,
): Promise<boolean> {
  return invoke("account_ready", { configDir, files, homeDir: homeDir ?? null });
}

/**
 * Deja constancia de un fallo de la parte web en `rastro.log`, que es donde
 * Rust ya escribe los suyos. No lanza nunca: si el rastro falla, se calla.
 *
 * Existe porque Adeorq es una ventana SIN CONSOLA: un `catch` vacío aquí no
 * deja NADA en ninguna parte, y eso convierte cualquier «no me ha aparecido»
 * en algo que no se puede ni empezar a mirar.
 */
export function anotarRastro(mensaje: string): Promise<void> {
  return invoke<void>("anotar_rastro", { mensaje }).catch(() => {});
}

/**
 * Cierra la sesión de una cuenta: borra sus archivos de credenciales y nada
 * más. Devuelve cuáles borró; vacío significa que ya no había sesión.
 *
 * NO es `forgetAccount`, que se lleva la carpeta entera con su historial. Aquí
 * la cuenta sigue existiendo: lo único que se va es la prueba de que estabas
 * dentro, así que el CLI vuelve a pedir login y todo lo demás sigue igual.
 */
export function logoutAccount(
  configDir: string,
  files: string[],
  homeDir?: string,
): Promise<string[]> {
  return invoke("logout_account", { configDir, files, homeDir: homeDir ?? null });
}

/** Which of the given CLIs are installed: [id, exe] in, id → path out. */
export function detectClis(exes: Array<[string, string]>): Promise<
  Array<{ id: string; path: string }>
> {
  return invoke("detect_clis", { exes });
}

export function listAccountDirs(): Promise<string[]> {
  return invoke("list_account_dirs");
}

/** Deletes that account's folder: signs it out and drops its history. */
export function forgetAccount(configDir: string): Promise<void> {
  return invoke("forget_account", { configDir });
}

/**
 * Secrets, kept by Windows itself (see secrets.rs). Used for the brújula's
 * refresh token: never a file, never localStorage.
 */
export function secretPut(key: string, value: string): Promise<void> {
  return invoke("secret_put", { key, value });
}

export function secretGet(key: string): Promise<string | null> {
  return invoke("secret_get", { key });
}

export function secretForget(key: string): Promise<void> {
  return invoke("secret_forget", { key });
}

/** One goal of a project, as written in its own docs/METAS.md. */
export interface Meta {
  title: string;
  done: boolean;
  when: string;
}

export interface Metas {
  exists: boolean;
  path: string;
  metas: Meta[];
  parked: string[];
}

export function readMetas(project: string): Promise<Metas> {
  return invoke("read_metas", { project });
}

/** Adds one bullet to that project's Aparcadero. */
export function addParked(project: string, text: string): Promise<void> {
  return invoke("add_parked", { project, text });
}

/** Whether Adeorq is set to start with Windows (governs the installed app). */
export function autostartGet(): Promise<boolean> {
  return invoke("autostart_get");
}

export function autostartSet(on: boolean): Promise<void> {
  return invoke("autostart_set", { on });
}

export interface NowPlayingInfo {
  title: string;
  artist: string;
  playing: boolean;
  app: string;
  volume: number | null;
}

/** What Windows says is playing right now (Spotify, browser, anything). */
export function mediaNow(): Promise<NowPlayingInfo | null> {
  return invoke("media_now");
}

export const mediaNext = (): Promise<void> => invoke("media_next");
export const mediaPrev = (): Promise<void> => invoke("media_prev");
export const mediaPlayPause = (): Promise<void> => invoke("media_playpause");
export const mediaSetVolume = (percent: number): Promise<void> =>
  invoke("media_set_volume", { percent });

/** Path to Antigravity CLI (`agy`) if installed, else null. */
export function findAgy(): Promise<string | null> {
  return invoke("find_agy");
}

export function renameSession(
  folder: string,
  sessionId: string,
  title: string,
): Promise<void> {
  return invoke("rename_session", { folder, sessionId, title });
}

/** Throws a session away: its transcript goes to the Windows recycle bin, so
    it is gone from Adeorq and from Claude Code, but still recoverable.

    `fuente` es qué CLI la escribió (`SessionInfo.fuente`). Importa porque cada
    uno guarda a su manera: Claude por carpeta de proyecto, Codex por fecha y con
    un nombre de archivo que se inventa él. Sin este dato, borrar una sesión de
    Codex buscaba en la carpeta de Claude y no borraba nada, y la sesión volvía a
    salir en cuanto Adeorq releía el disco. */
export function deleteSession(
  folder: string,
  sessionId: string,
  fuente?: string,
): Promise<void> {
  return invoke("delete_session", { folder, sessionId, fuente });
}

export interface DirtyReport {
  isRepo: boolean;
  files: string[];
  total: number;
}

export function projectDirty(path: string): Promise<DirtyReport> {
  return invoke("project_dirty", { path });
}

/** Adeorq's own UI state (manual groups + logically archived sessions). */
export interface SessionGroup {
  id: string;
  project: string;
  name: string;
  /** El color de la cuadrilla que lo creó, si nació de un reparto. Sin esto
      un grupo automático se ve igual que uno hecho a mano, y la gracia de la
      cuadrilla es precisamente que se distinga de un vistazo. */
  color?: string;
}

/**
 * How the workspace rail draws itself: whole cards, logos only, or the narrow
 * strip of logos in one column (Discord's), where the rail gives back almost
 * all its width and everything else waits under the mouse.
 */
export type RailMode = "full" | "logo" | "tira";

export interface UiState {
  groups: SessionGroup[];
  sessionGroup: Record<string, string>;
  /**
   * A qué proyecto la mandaste TÚ, sesión → nombre del proyecto. Una sesión
   * cae sola en el proyecto de su carpeta, que casi siempre es lo correcto;
   * esto es para cuando no lo es, y una suelta pertenece de verdad a algo que
   * está en otro sitio del disco. Manda sobre lo que diga la carpeta.
   */
  sessionProject: Record<string, string>;
  archived: string[];
  /**
   * Las que trajiste a mano desde el ＋, aunque sean viejas.
   *
   * La barra esconde las de más de una semana, y con razón: son cientos y casi
   * ninguna interesa. Pero si has ido a buscar una de hace un mes y has dicho
   * «esta», esa decisión pesa más que la regla. Solo se guardan los ids, así
   * que no cuesta nada y una que se borre de `~/.claude` desaparece sola.
   */
  traidas: string[];
  /**
   * Cuántas traídas ya habías reconocido, para no repetirte el aviso.
   *
   * El cartel de «{n} traídas a mano» salía SIEMPRE que hubiera alguna, y su
   * único botón las quitaba todas de la lista. O sea: un aviso permanente cuya
   * única acción deshace el trabajo que acabas de hacer, y ninguna forma de
   * decir «vale, ya lo sé» (Munir, 2026-08-10, con 110 traídas: «me está
   * incitando a que quite las sesiones»).
   *
   * Guardando el número y no un sí/no, si otro día traes más el aviso vuelve
   * con las nuevas, que sí es información. Lo que no vuelve es el recordatorio
   * de una decisión que ya tomaste.
   */
  traidasVisto?: number;
  /** Logos chosen by hand, project name → small data URI. Beats detection. */
  projectIcon: Record<string, string>;
  /**
   * What a project is CALLED here, folder name → shown name. The folder keeps
   * its own name: renaming it for real would break the link with its Claude
   * sessions, which are indexed by path, and with anything holding that path.
   */
  projectAlias: Record<string, string>;
  /**
   * Los proyectos que quitaste de la barra, por nombre de carpeta.
   *
   * Quitar un proyecto NO toca el disco: esto es una lista de lo que quieres
   * ver, no un inventario de lo que existe. Hasta la 0.9.54 la única forma de
   * sacar un proyecto de aquí era «tirarlo», que mandaba su carpeta entera a
   * la papelera de Windows; el 31-jul-2026 se fueron así diecisiete carpetas
   * de `C:\proyectos` sin que nadie recordara haberlas borrado.
   *
   * Por NOMBRE y no por ruta porque el nombre es la clave de todo lo demás en
   * la barra (alias, logo, grupos), así que un proyecto oculto sigue siendo el
   * mismo proyecto aunque su carpeta se mueva.
   */
  hiddenProjects: string[];
  /**
   * El orden que TÚ le has dado a la barra, por nombre de carpeta.
   *
   * Sin esto la barra se ordena sola por actividad (lo abierto arriba, luego
   * lo más reciente), y eso significa que un proyecto cambia de sitio mientras
   * trabajas: buscas el de siempre donde estaba y ya no está. En cuanto
   * arrastras uno, el orden pasa a ser tuyo ENTERO y deja de moverse; los que
   * aparezcan después se colocan detrás, por actividad, hasta que los muevas.
   */
  projectOrder: string[];
  /**
   * Las sesiones que has clavado arriba de su lista, en el orden en que las
   * clavaste.
   *
   * Mismo motivo que `projectOrder`, un piso más abajo: dentro de un proyecto
   * (y dentro de las sueltas) las sesiones se ordenan por actividad, así que la
   * conversación que abres cada día se te va moviendo y hay que buscarla. Solo
   * ids, como `traidas`: no cuesta nada y una sesión que desaparezca de
   * `~/.claude` se cae sola de aquí sin dejar hueco.
   */
  pinned: string[];
  /** El orden que le has dado a mano a las sesiones no agrupadas, por id.
      Vacío mientras no muevas ninguna: hasta entonces las coloca la actividad,
      igual que a los proyectos. Se guarda la lista ENTERA que estabas viendo,
      no solo la movida, o el resto seguiría bailando alrededor de la que
      colocaste. */
  sueltasOrder: string[];
  railMode: RailMode;
}

export const EMPTY_UI_STATE: UiState = {
  groups: [],
  sessionGroup: {},
  sessionProject: {},
  archived: [],
  traidas: [],
  projectIcon: {},
  projectAlias: {},
  hiddenProjects: [],
  projectOrder: [],
  pinned: [],
  sueltasOrder: [],
  railMode: "full",
};

export async function loadUiState(): Promise<UiState> {
  const raw = await invoke<string>("load_ui_state");
  try {
    const parsed = JSON.parse(raw) as Partial<UiState>;
    return {
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      sessionGroup: parsed.sessionGroup ?? {},
      sessionProject: parsed.sessionProject ?? {},
      archived: Array.isArray(parsed.archived) ? parsed.archived : [],
      traidas: Array.isArray(parsed.traidas) ? parsed.traidas : [],
      traidasVisto:
        typeof parsed.traidasVisto === "number" ? parsed.traidasVisto : undefined,
      projectIcon: parsed.projectIcon ?? {},
      projectAlias: parsed.projectAlias ?? {},
      hiddenProjects: Array.isArray(parsed.hiddenProjects) ? parsed.hiddenProjects : [],
      projectOrder: Array.isArray(parsed.projectOrder) ? parsed.projectOrder : [],
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
      sueltasOrder: Array.isArray(parsed.sueltasOrder) ? parsed.sueltasOrder : [],
      railMode:
        parsed.railMode === "logo" || parsed.railMode === "tira" ? parsed.railMode : "full",
    };
  } catch {
    return EMPTY_UI_STATE;
  }
}

/**
 * Logos found inside each project folder, keyed by project path. Missing key
 * means "no logo, draw the initials". Cached in Rust for the whole run.
 */
export function projectIcons(paths: string[]): Promise<Record<string, string>> {
  return invoke("project_icons", { paths });
}

/** Re-reads the folders, for when a logo was just added. */
export function forgetProjectIcons(): Promise<void> {
  return invoke("forget_project_icons");
}

export function saveUiState(state: UiState): Promise<void> {
  return invoke("save_ui_state", { content: JSON.stringify(state, null, 2) });
}

/** The Foreman: one claude -p call that returns a strict JSON action plan. */
export interface PlanAction {
  tipo:
    | "abrir_sesion"
    | "claude_nuevo"
    | "terminal"
    | "antigravity"
    | "comando"
    /** One order into every open agent terminal at once. */
    | "a_todas"
    /** Reap a pane that has finished. The gate refuses anything else. */
    | "cerrar_panel"
    /** A FRESH pane whose only job is to check somebody else's work. */
    | "revisar"
    /** Una tarea repartida entre varios agentes que trabajan a la vez. */
    | "cuadrilla";
  comando?: string;
  sessionId?: string;
  motivo?: string;
  proyecto?: string;
  rol?: string;
  prompt?: string;
  encargo?: string;
  /** Which open pane the action is about (cerrar_panel; revisar uses it only
      to name whose work is being checked, never to reuse that pane). */
  paneId?: number;
  /** Model alias for the pane this action opens. Travels in the plan the
      Foreman already returns, so choosing it costs no extra call. */
  modelo?: string;
  /** cuadrilla: la tarea entera, en una frase, y por qué ese número de manos. */
  objetivo?: string;
  porque?: string;
  partes?: PartePlan[];
  shadow?: boolean;
}

/** Un puesto de una cuadrilla: qué hace y qué archivos son suyos.
 *
 *  La `frontera` no es decoración: es lo único que evita que dos agentes
 *  editen el mismo archivo a la vez, que es la forma de que seis terminales
 *  vayan MÁS LENTAS que una. */
export interface PartePlan {
  rol: string;
  encargo: string;
  frontera?: string;
  modelo?: string;
}

export interface ForemanPlan {
  resumen: string;
  acciones: PlanAction[];
}

export function foremanPlan(request: string, context: string): Promise<string> {
  return invoke("foreman_plan", { request, context });
}

/** El otro oficio: reescribe lo que dijiste como el encargo que necesita el
    agente que tienes delante. No decide nada ni abre nada. */
export function foremanPrompt(request: string, context: string): Promise<string> {
  return invoke("foreman_prompt", { request, context });
}

export function writeMission(projectPath: string, content: string): Promise<string> {
  return invoke("write_mission", { projectPath, content });
}

export function onPtyData(cb: (p: PtyData) => void): Promise<UnlistenFn> {
  return listen<PtyData>("pty-data", (e) => cb(e.payload));
}

export function onPtyExit(cb: (p: PtyExit) => void): Promise<UnlistenFn> {
  return listen<PtyExit>("pty-exit", (e) => cb(e.payload));
}

/**
 * El panel se ha quedado MUDO: Rust dejó de poder vaciar su terminal con el
 * proceso todavía vivo, así que el agente se bloqueará en cuanto escriba. No se
 * nota desde fuera —es exactamente el congelón mudo que costó una noche
 * entera—, y por eso Rust lo cuenta en vez de callárselo.
 */
export function onPtyMudo(cb: (id: number) => void): Promise<UnlistenFn> {
  return listen<{ id: number }>("pty-mudo", (e) => cb(e.payload.id));
}

/**
 * The effort level Claude Code is configured with, for that account's folder
 * (or the main one when null). Adeorq puts it on the command line instead of
 * hoping to read it off the screen.
 */
export function cliEffort(configDir: string | null): Promise<string | null> {
  return invoke("cli_effort", { configDir });
}

/**
 * The tray his agents write into (inbox.rs). A note is a proposal, never a
 * decision: he accepts it into the brújula or into METAS.md, or he drops it.
 */
export interface Note {
  line: number;
  kind: "idea" | "paso";
  project: string;
  text: string;
}

export function readInbox(): Promise<Note[]> {
  return invoke("read_inbox");
}

/** Una línea del BUZON.md de una cuadrilla: lo que un puesto le deja dicho a
    los demás mientras trabajan. */
export interface CrewNote {
  /** El puesto que la dejó, vacío si la línea no lo decía. */
  who: string;
  text: string;
}

export function readCrewInbox(cwd: string): Promise<CrewNote[]> {
  return invoke("read_crew_inbox", { cwd });
}

export function dropInbox(line: number): Promise<void> {
  return invoke("drop_inbox", { line });
}

export function inboxWhere(): Promise<string> {
  return invoke("inbox_where");
}

export function writeInbox(kind: string, project: string, text: string): Promise<void> {
  return invoke("write_inbox", { kind, project, text });
}

/**
 * Las notas del lienzo. Cada una es un `.md` suyo en disco y NO un trozo del
 * tablero, porque un agente conectado tiene que poder marcar una casilla y un
 * agente sabe editar un archivo de texto, no nuestro formato de lienzo.
 */
export interface NoteFile {
  id: string;
  text: string;
  /** Última escritura en milisegundos: así se nota que la tocó un agente. */
  stamp: number;
  path: string;
}

export function noteWrite(id: string, text: string): Promise<NoteFile> {
  return invoke("note_write", { id, text });
}

export function noteRead(id: string): Promise<NoteFile> {
  return invoke("note_read", { id });
}

export function noteDelete(id: string): Promise<void> {
  return invoke("note_delete", { id });
}

/** Qué notas hay escritas, por su id. El calendario marca con esto los días
    que ya tienen algo. */
export function noteList(): Promise<string[]> {
  return invoke("note_list");
}

/** Una captura ya pegada, tal como la ve la galería del lienzo. */
export interface Paste {
  name: string;
  path: string;
  bytes: number;
  stamp: number;
}

export function listPastes(): Promise<Paste[]> {
  return invoke("list_pastes");
}

/** Los bytes de una captura. Vienen en crudo y no en base64: con 185 capturas
    en la carpeta, la diferencia se nota al abrir la galería. */
export function readPaste(path: string): Promise<ArrayBuffer> {
  return invoke("read_paste", { path });
}

export function deletePaste(path: string): Promise<void> {
  return invoke("delete_paste", { path });
}

/** Dónde vive una nota, para poder decírselo a un agente sin abrirla. */
export function notePath(id: string): Promise<string> {
  return noteRead(id).then((f) => f.path);
}

/**
 * Un espejo montado. `worktreePath` es el dato que hace que esto funcione: la
 * terminal tiene que NACER ahí dentro. Arrancándola en la carpeta del proyecto,
 * como se hacía antes, el espejo no aísla absolutamente nada.
 */
export interface ShadowSession {
  baseBranch: string;
  shadowBranch: string;
  worktreePath: string;
  /** "true" si se reenganchó a un espejo que quedó colgado de otra sesión. */
  reutilizado: string;
}

export interface ShadowFile {
  path: string;
  status: string;
}

export function shadowInit(projectPath: string, paneId: string): Promise<ShadowSession> {
  return invoke("shadow_init", { projectPath, paneId });
}

// Leer va contra el ÁRBOL del espejo, no contra tu carpeta: son ficheros
// distintos, y preguntarle a la tuya devolvía el estado de tu trabajo.
export function shadowDiff(worktreePath: string, baseBranch: string): Promise<string> {
  return invoke("shadow_diff", { worktreePath, baseBranch });
}

export function shadowStatus(worktreePath: string): Promise<ShadowFile[]> {
  return invoke("shadow_status", { worktreePath });
}

/** Devuelve qué ha pasado, en una frase, para poder enseñárselo a Munir. */
export function shadowAccept(
  projectPath: string,
  worktreePath: string,
  paneId: string,
): Promise<string> {
  return invoke("shadow_accept", { projectPath, worktreePath, paneId });
}

export function shadowDiscard(
  projectPath: string,
  worktreePath: string,
  paneId: string,
): Promise<void> {
  return invoke("shadow_discard", { projectPath, worktreePath, paneId });
}


/** El lote entero clasificado en UNA llamada (ver `foreman.rs`). */
export function foremanLote(tareas: string, context: string): Promise<string> {
  return invoke("foreman_lote", { tareas, context });
}

/** Escribe el papel común del reparto en el BUZON.md de un proyecto. */
export function escribirBuzon(proyecto: string, texto: string): Promise<string> {
  return invoke("escribir_buzon", { proyecto, texto });
}

/** Qué skills ve una cuenta, y si su carpeta es un enlace a la principal. */
export interface EstadoSkills {
  cuantas: number;
  compartida: boolean;
  en_principal: number;
}

export function skillsEstado(configDir: string): Promise<EstadoSkills> {
  return invoke("skills_estado", { configDir });
}

/** Enlaza las skills de esa cuenta con las de tu cuenta principal. Devuelve
    cuántas pasa a ver. Es la MISMA carpeta, no una copia: escribir una skill
    la pone en todas, y borrarla la quita de todas. */
export function compartirSkills(configDir: string): Promise<number> {
  return invoke("compartir_skills", { configDir });
}

/** Quita el enlace. No borra ninguna skill: la cuenta se queda sin skills
    propias hasta que le pongas alguna. */
export function dejarDeCompartirSkills(configDir: string): Promise<void> {
  return invoke("dejar_de_compartir_skills", { configDir });
}

/* ── El puente de la sesión suprema ──────────────────────────────────────────
   Un agente pide por MCP que se abra una terminal o que se unan dos. Eso lo
   monta React, así que Rust emite el pedido y espera a que la ventana conteste
   con `mcp_reply`. Si nadie contesta en 25 segundos, el agente recibe un «no
   contestó a tiempo» en vez de quedarse colgado. Ver `docs/SUPREMA.md`. */

export function onPedidoMcp(cb: (p: PedidoMcp) => void): Promise<UnlistenFn> {
  return listen<PedidoMcp>("mcp:pedido", (e) => cb(e.payload));
}

export function mcpReply(peticion: number, respuesta: RespuestaMcp): Promise<void> {
  return invoke("mcp_reply", { peticion, respuesta });
}
