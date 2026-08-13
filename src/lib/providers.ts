// The agent CLIs Adeorq knows about (META 6).
//
// They all work the same way underneath: the CLI keeps its whole identity
// (login, history, settings) in one folder, and SOME of them let an
// environment variable move that folder. Point it elsewhere and the CLI
// behaves like a fresh install, which is exactly what a second account is.
//
// Everything below was checked on this machine on 2026-07-26, by reading each
// CLI's own code, its own bundled docs, or by moving the variable and watching
// where the files landed. Nothing here comes from a search result, because a
// wrong variable would silently point an account at the wrong folder.
//
//   claude  CLAUDE_CONFIG_DIR   in daily use since META 3
//   codex   CODEX_HOME          `codex doctor` prints it; set it elsewhere and
//                               config.toml and auth.json moved with it
//   gemini  GEMINI_CLI_HOME     its bundle: process.env["GEMINI_CLI_HOME"] ||
//                               join(os.homedir(), ".gemini")
//   qwen    QWEN_HOME           its own bundled docs: "QWEN_HOME env var, and
//                               finally ~/.qwen"
//   pi      PI_CODING_AGENT_DIR its own config.ts: getAgentDir() reads it and
//                               falls back to ~/.pi/agent (2026-08-01)
//
// The rest are listed with envVar empty ON PURPOSE: they are installed and can
// be launched, but no way to move their config folder turned up, so Adeorq
// says "one account only" instead of guessing a variable name. If one appears
// later, adding it here is the whole change.
//
// Kiro (2026-07-28) es el único que entra sin estar instalado aquí, y por eso
// entra a medias: su nombre de programa y su instalador salen de su propia
// documentación (kiro.dev/docs/cli/installation), que es un dato que se
// comprueba solo (si están mal, no aparece o falla el comando a la vista). Lo
// que NO se pone es lo que haría daño en silencio: sin variable de carpeta y
// sin archivo de sesión, así que sale como de una sola cuenta y diciendo que
// no sabemos leerle el login. Cuando esté instalado se comprueba y se rellena.

export interface Provider {
  id: string;
  label: string;
  /** Executable to look for, without extension. */
  exe: string;
  /** The variable that moves its config folder. Empty = cannot be separated. */
  envVar: string;
  /** Its default folder, relative to the user profile. */
  homeDir: string;
  /**
   * Files that prove this account is signed in. Empty when we could not
   * confirm which file means that: the screen then says so rather than
   * claiming the account is disconnected.
   */
  creds: string[];
  /** Whether Adeorq can read its usage without spending quota. */
  usage: boolean;
  /** Colour for its avatar and pills. */
  hue: string;
  /**
   * Cómo se llama en la chapa de una terminal, cuando ahí conviene decir además
   * su nombre de programa.
   *
   * Solo lo necesita Antigravity: su `label` es «Antigravity» pero el comando
   * que corre dentro se llama `agy`, y en la cabecera de un panel lo útil es
   * poder atar las dos cosas. Vacío = su `label` de siempre.
   */
  rotuloPane?: string;
  /** How to get it, for the ones that are not installed. */
  install: string;
  /**
   * El comando que lo instala, cuando existe uno de fiar. Es lo que ejecuta el
   * botón de instalar, así que aquí NO va prosa: o es una línea que se puede
   * ejecutar tal cual, o se deja fuera y manda `web`.
   */
  cmd?: string;
  /** Su página oficial. Para los que no tienen comando y hay que descargarlos
      a mano, que es lo único honesto que se les puede ofrecer. */
  web?: string;
  /**
   * La variable con la que arranca usando una CLAVE DE API en vez de tu login,
   * y por tanto facturando por tokens en vez de gastar tu suscripción.
   *
   * Vacía en los que no se ha podido confirmar, con el mismo criterio que
   * `envVar`: una variable equivocada aquí haría que el CLI ignore la clave y
   * siga gastando la suscripción sin decir nada, que es justo lo contrario de
   * lo que le pediste. Cuando se confirme una, se añade y ya (2026-07-30).
   */
  apiEnv?: string;
  /**
   * La línea con la que se le llama para que empiece PUDIENDO EDITAR, cuando no
   * es su nombre a secas. Vacío = se le llama por su `exe`.
   *
   * Vive aquí y no en un `switch` dentro de `App.tsx` (donde estuvo hasta el
   * 2026-08-13) por el motivo de siempre: cada dato que se guarda por el NOMBRE
   * del CLI en vez de por lo que ese CLI SABE HACER es un sitio más que hay que
   * visitar para añadir el siguiente. Comprobado contra el `--help` de cada uno
   * el 2026-07-26; donde no había equivalente del `acceptEdits` de Claude, el
   * hueco se queda vacío a propósito: una bandera inventada es peor que una
   * comodidad menos, y el `--allow-all-tools` de Copilot es permiso total, que
   * no es nuestro para darlo.
   */
  arranque?: string;
  /**
   * Acepta el encargo en su línea de arranque.
   *
   * Los demás nacen vacíos y hay que hablarles después, y no es un descuido:
   * cada CLI decide si su primer argumento es un prompt o un subcomando, y
   * meterle texto suelto a uno que espera un subcomando es abrirle una terminal
   * con un error dentro.
   */
  encargoEnLinea?: boolean;
  /**
   * Con qué bandera se le pasa ese encargo.
   *
   * Claude y Antigravity no la necesitan (lo toman como argumento suelto) y por
   * eso su arranque está escrito a mano. Los demás que acepten encargo entran
   * SOLO con esta columna, sin tocar una línea de código.
   */
  banderaEncargo?: string;
  /**
   * Se le puede elegir el cerebro desde Adeorq, con `--model` o equivalente.
   *
   * No es «tiene varios modelos»: casi todos los tienen. Es que Adeorq sepa
   * pedirle uno concreto en la línea de arranque y que eso se respete.
   */
  modelo?: boolean;
  /** Tiene un modo de solo planificar, sin tocar archivos, que se pide al
   *  arrancar. En Claude es `--permission-mode plan`. */
  modoPlan?: boolean;
  /** Una sesión suya se puede retomar por su id, así que Adeorq puede revivirla
   *  o pasarle el testigo a otra cuenta. Los que no lo tienen abren una
   *  conversación nueva y el hilo anterior se queda donde estaba. */
  retomable?: boolean;
  /**
   * Lee una imagen de una RUTA escrita en el prompt.
   *
   * Los que no, la quieren pegada con Ctrl+V desde el portapapeles. No es un
   * detalle: al soltar una imagen sobre una terminal hay que decirle a Munir
   * cuál de las dos cosas ha pasado, y decirle la equivocada le hace pelearse
   * con un agente que nunca vio la imagen.
   */
  leeRutaDeImagen?: boolean;
  /** Tiene habilidades invocables con barra (`/loquesea`), así que se le puede
   *  sugerir una en el encargo, y las carpetas de skills se pueden compartir
   *  entre sus cuentas. */
  skills?: boolean;
}

export const PROVIDERS: Provider[] = [
  {
    id: "claude",
    label: "Claude Code",
    exe: "claude",
    envVar: "CLAUDE_CONFIG_DIR",
    homeDir: ".claude",
    creds: [".credentials.json"],
    usage: true,
    hue: "#d97757",
    install: "claude.ai/code",
    apiEnv: "ANTHROPIC_API_KEY",
    cmd: "pnpm add -g @anthropic-ai/claude-code",
    web: "https://claude.ai/code",
    // Sin `arranque`: Claude no se lanza con una línea fija, sino con su modo,
    // su esfuerzo y un id de sesión para poder retomarla luego. Eso lo arma
    // `newClaudeCommand` en App.tsx y no cabe en una cadena.
    encargoEnLinea: true,
    modelo: true,
    modoPlan: true,
    // El `--session-id` que le pone Adeorq al nacer es justo lo que permite
    // volver con `--resume`. De ahí salen revivir un panel y el relevo.
    retomable: true,
    leeRutaDeImagen: true,
    skills: true,
  },
  {
    id: "codex",
    label: "Codex",
    exe: "codex",
    envVar: "CODEX_HOME",
    homeDir: ".codex",
    creds: ["auth.json"],
    usage: false,
    hue: "#9aa4b2",
    install: "pnpm add -g @openai/codex",
    apiEnv: "OPENAI_API_KEY",
    cmd: "pnpm add -g @openai/codex",
    arranque: "codex --sandbox workspace-write",
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    exe: "gemini",
    envVar: "GEMINI_CLI_HOME",
    homeDir: ".gemini",
    creds: ["oauth_creds.json", "google_accounts.json"],
    usage: false,
    hue: "#6ea8fe",
    install: "pnpm add -g @google/gemini-cli",
    apiEnv: "GEMINI_API_KEY",
    cmd: "pnpm add -g @google/gemini-cli",
    arranque: "gemini --approval-mode auto_edit",
  },
  {
    id: "qwen",
    label: "Qwen Code",
    exe: "qwen",
    envVar: "QWEN_HOME",
    homeDir: ".qwen",
    // Same OAuth files as the Gemini CLI it forked from, confirmed in its bundle.
    creds: ["oauth_creds.json"],
    usage: false,
    hue: "#a78bfa",
    install: "pnpm add -g @qwen-code/qwen-code",
    cmd: "pnpm add -g @qwen-code/qwen-code",
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    exe: "copilot",
    // Its README documents ~/.copilot and GH_TOKEN / GITHUB_TOKEN for auth,
    // but no variable that moves the folder, so accounts cannot be separated.
    envVar: "",
    homeDir: ".copilot",
    creds: [],
    usage: false,
    hue: "#8b949e",
    install: "pnpm add -g @github/copilot",
    cmd: "pnpm add -g @github/copilot",
  },
  {
    id: "crush",
    label: "Crush",
    exe: "crush",
    envVar: "",
    homeDir: ".config/crush",
    creds: [],
    usage: false,
    hue: "#ff7ac6",
    install: "pnpm add -g @charmland/crush",
    cmd: "pnpm add -g @charmland/crush",
  },
  {
    id: "opencode",
    label: "opencode",
    exe: "opencode",
    // Su `OPENCODE_CONFIG_DIR` mueve la CONFIGURACIÓN, no el login, así que dos
    // cuentas seguirían compartiendo sesión. Se queda vacío a propósito: es la
    // misma trampa que `PI_CODING_AGENT_SESSION_DIR`, que solo mueve las
    // sesiones. Lo que sí lo movería es `XDG_DATA_HOME`, pero no es suya (la
    // respetan todos los programas del proceso) y además apunta un nivel por
    // encima, así que Adeorq buscaría el login donde no está.
    envVar: "",
    // VERIFICADO EN DISCO el 2026-08-13, tras instalarlo: crea `.local/share`,
    // `.config`, `.cache` y `.local/state`. El login vive en la de DATOS, no en
    // la de config, que es lo que decía esta ficha desde julio y era falso:
    // `packages/opencode/src/auth/index.ts` hace `join(Global.Path.data,
    // "auth.json")`, y `Path.data` sale de `xdgData`, que en Windows no tiene
    // caso especial y cae en `~/.local/share`.
    homeDir: ".local/share/opencode",
    creds: ["auth.json"],
    usage: false,
    hue: "#f5c542",
    // Lo del «.exe de 0 bytes» de julio era un diagnóstico a medias: el paquete
    // trae un `postinstall.mjs` que copia el binario real desde su dependencia
    // opcional, y pnpm 10+ bloquea los postinstall salvo que se le permita.
    // Con `--allow-build` instala 170 MB que arrancan (probado el 2026-08-13).
    install: "pnpm add -g --allow-build=opencode-ai opencode-ai",
    cmd: "pnpm add -g --allow-build=opencode-ai opencode-ai",
    web: "https://opencode.ai",
    // Su propio `packages/llm/src/providers/anthropic.ts` la lee:
    //   .orElse(Auth.config("ANTHROPIC_API_KEY"))
    apiEnv: "ANTHROPIC_API_KEY",
    // Su `--help` en esta máquina (1.18.16): «--prompt  prompt to use». Es una
    // opción del comando por defecto, el que abre su TUI, así que el encargo
    // llega puesto en vez de tener que pegárselo a mano.
    encargoEnLinea: true,
    banderaEncargo: "--prompt",
    // Sin `arranque`: su única bandera de permisos es `--auto`, y su PROPIA
    // ayuda la marca «(dangerous!)» porque aprueba todo lo que no esté prohibido
    // explícitamente. Eso no es el `acceptEdits` de Claude (pasa las ediciones,
    // sigue preguntando lo arriesgado), es permiso total, y darlo no es nuestro.
    // Mismo criterio que con el `--allow-all-tools` de Copilot.
  },
  {
    id: "amp",
    label: "Amp",
    exe: "amp",
    envVar: "",
    homeDir: ".config/amp",
    creds: [],
    usage: false,
    hue: "#ff9f6e",
    install: "el instalador de ampcode.com (por pnpm no deja binario en Windows)",
    web: "https://ampcode.com",
  },
  {
    id: "agy",
    label: "Antigravity",
    exe: "agy",
    // Its state lives under ~/.gemini/antigravity-cli. Its binary names a pile
    // of ANTIGRAVITY_* variables, but none of them moved that folder when
    // tried, so this stays empty rather than guessing.
    envVar: "",
    homeDir: ".gemini/antigravity-cli",
    creds: ["settings.json"],
    usage: false,
    hue: "#7aa6ff",
    rotuloPane: "Antigravity (agy)",
    // Official installer (antigravity.google/docs/cli/install). There is no
    // npm package: the ones using that name belong to other people.
    install: "irm https://antigravity.google/cli/install.ps1 | iex",
    cmd: "irm https://antigravity.google/cli/install.ps1 | iex",
    // Su instalador solo añade su carpeta al PATH de las consolas NUEVAS, así
    // que cuando Rust encuentra su ruta se le llama por ella (`agyCommand`).
    // Esta línea es el respaldo para cuando no la ha encontrado.
    arranque: "agy --mode accept-edits",
    encargoEnLinea: true,
    leeRutaDeImagen: true,
  },
  {
    id: "cursor",
    label: "Cursor",
    exe: "cursor-agent",
    envVar: "",
    homeDir: ".cursor",
    creds: [],
    usage: false,
    hue: "#c9d1d9",
    // The `cursor-agent` on npm belongs to a third party, not to Cursor.
    install: "el instalador de cursor.com (el paquete de npm NO es suyo)",
    web: "https://cursor.com",
  },
  {
    id: "pi",
    label: "Pi",
    exe: "pi",
    // Confirmado LEYENDO SU CÓDIGO, no su web (packages/coding-agent/src/config.ts):
    //   export const ENV_AGENT_DIR = `${APP_NAME.toUpperCase()}_CODING_AGENT_DIR`;
    //   export function getAgentDir() {
    //     const envDir = process.env[ENV_AGENT_DIR];
    //     if (envDir) return expandTildePath(envDir);
    //     return join(homedir(), CONFIG_DIR_NAME, "agent");   // ~/.pi/agent
    //   }
    // Así que la variable existe de verdad y mueve la carpeta ENTERA, no solo
    // las sesiones (para eso tiene otra, PI_CODING_AGENT_SESSION_DIR). Por eso
    // Pi entra pudiendo tener varias cuentas, a diferencia de Kiro o Cursor.
    envVar: "PI_CODING_AGENT_DIR",
    // Ojo: su carpeta de verdad es `.pi/agent`, no `.pi`. Dentro de `.pi` a
    // secas no hay ningún login, y buscarlo ahí daría "desconectada" siempre.
    homeDir: ".pi/agent",
    // `getAuthPath()` es join(getAgentDir(), "auth.json"), y su quickstart lo
    // dice igual: «/login … store the key in ~/.pi/agent/auth.json».
    creds: ["auth.json"],
    usage: false,
    hue: "#2dd4bf",
    // Su propia web ofrece este comando con `--ignore-scripts`, y se respeta
    // tal cual: quitarlo cambiaría lo que se ejecuta al instalar.
    install: "pnpm add -g --ignore-scripts @earendil-works/pi-coding-agent",
    cmd: "pnpm add -g --ignore-scripts @earendil-works/pi-coding-agent",
    web: "https://pi.dev/",
    // Documentada en su quickstart: «set an API key such as ANTHROPIC_API_KEY
    // before starting pi». Pi habla con varios proveedores, así que esta es la
    // de Anthropic, que es la que Munir tiene; las demás se añadirían igual.
    apiEnv: "ANTHROPIC_API_KEY",
  },
  {
    id: "kiro",
    label: "Kiro CLI",
    // Se escribe `kiro-cli`, no `kiro`: lo dicen sus propios docs en todos sus
    // ejemplos (kiro-cli chat, kiro-cli uninstall).
    exe: "kiro-cli",
    envVar: "",
    // Sin confirmar, y da igual mientras no haya archivo de sesión que buscar:
    // con `creds` vacío no se mira esta carpeta. Se rellena al instalarlo.
    homeDir: ".kiro",
    creds: [],
    usage: false,
    hue: "#a855f7",
    install: "irm 'https://cli.kiro.dev/install.ps1' | iex",
    cmd: "irm 'https://cli.kiro.dev/install.ps1' | iex",
    web: "https://kiro.dev/docs/cli/installation/",
    // Su nombre a secas imprime la ayuda: la conversación es `kiro-cli chat`,
    // tal como sale en todos los ejemplos de su documentación.
    arranque: "kiro-cli chat",
  },
];

/** Todos los ids de la tabla. Se deriva para que nadie tenga que mantener una
 *  segunda lista con los mismos nombres escritos a mano. */
export const IDS = PROVIDERS.map((p) => p.id);

/** La línea con la que se arranca ese CLI. Su `arranque` si lo declara, y si no
 *  su propio nombre de programa, que es el caso de la mayoría. */
export function lineaDeArranque(id: string): string {
  const p = PROVIDERS.find((x) => x.id === id);
  return p ? (p.arranque ?? p.exe) : id;
}

/** Con qué bandera acepta el encargo, si lo acepta así. */
export function banderaDeEncargo(id: string): string | undefined {
  return PROVIDERS.find((x) => x.id === id)?.banderaEncargo;
}

export const CLAUDE = PROVIDERS[0];

export function providerOf(id: string): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? CLAUDE;
}

/** Las capacidades que se preguntan por ahí, y que antes se preguntaban por el
 *  nombre del CLI: `provider === "claude"` repetido en nueve sitios. */
export type Capacidad =
  | "modelo"
  | "modoPlan"
  | "retomable"
  | "encargoEnLinea"
  | "usage"
  | "leeRutaDeImagen"
  | "skills"
  /** Su carpeta de identidad se puede mover, así que admite varias cuentas.
   *  No es un booleano en la tabla sino el nombre de la variable, y por eso se
   *  pregunta aquí en vez de comparar contra `""` por ahí suelto. */
  | "variasCuentas";

/**
 * Si ese CLI sabe hacer eso.
 *
 * ⚠ Aquí NO se puede usar `providerOf`, y es la razón de que esta función
 * exista: `providerOf` devuelve Claude cuando no encuentra el id, así que
 * `providerOf("shell").modelo` diría que sí y a una consola pelada le saldría
 * el selector de cerebro. `shell` y `ollama` pasan por estos mismos sitios y no
 * están en la tabla, así que lo desconocido tiene que responder «no sé hacer
 * eso», nunca «lo que haga Claude».
 */
export function sabe(id: string, que: Capacidad): boolean {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) return false;
  if (que === "variasCuentas") return !!p.envVar;
  return !!p[que];
}
