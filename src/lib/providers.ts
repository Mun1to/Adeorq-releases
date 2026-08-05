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
    envVar: "",
    homeDir: ".config/opencode",
    creds: [],
    usage: false,
    hue: "#f5c542",
    // Installing it through pnpm on Windows leaves a 0-byte opencode.exe that
    // will not run (tried on 2026-07-26), so point at the official installer.
    install: "el instalador de opencode.ai (por pnpm deja un .exe vacío)",
    web: "https://opencode.ai",
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
    // Official installer (antigravity.google/docs/cli/install). There is no
    // npm package: the ones using that name belong to other people.
    install: "irm https://antigravity.google/cli/install.ps1 | iex",
    cmd: "irm https://antigravity.google/cli/install.ps1 | iex",
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
  },
];

export const CLAUDE = PROVIDERS[0];

export function providerOf(id: string): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? CLAUDE;
}
