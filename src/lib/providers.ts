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
  {
    id: "kimi",
    // Son DOS y hay que coger el bueno. `MoonshotAI/kimi-cli` es el de Python y
    // su propio README lo dice: «Kimi CLI is evolving into Kimi Code CLI (…)
    // This project will be gradually wound down». El vivo es
    // `MoonshotAI/kimi-code`, en TypeScript, y su programa se llama `kimi` a
    // secas. Comprobado el 2026-08-18 leyendo los dos repos, no una búsqueda.
    label: "Kimi Code",
    exe: "kimi",
    // Su propia documentación de variables de entorno, que además explica QUÉ
    // se lleva: «Overrides the data root directory; the default is
    // ~/.kimi-code. Once set, the config file, sessions, logs, OAuth
    // credentials, and all other data land under the new path». O sea que sí
    // mueve el login, que es lo que hace que dos cuentas sean dos cuentas y no
    // la misma con otra config (la trampa de opencode, tres fichas más arriba).
    envVar: "KIMI_CODE_HOME",
    homeDir: ".kimi-code",
    // Su login vive en `credentials/<name>.json`, y ese `<name>` lo pone quien
    // hace el login (su `packages/oauth/src/storage.ts` lo recibe como
    // parámetro). Sin tenerlo instalado no se puede saber cuál escribe el
    // `/login` de Kimi Code, así que se queda vacío y Adeorq dice que no sabe
    // leerle el login, en vez de buscar un archivo inventado y declarar
    // desconectada una cuenta que sí lo está. Mismo criterio que Kiro.
    creds: [],
    usage: false,
    // El azul de su marca, sacado de su propia web
    // (`docs/.vitepress/theme/styles/vars.css`: `--kimi-brand-1: #0a7aff`), no
    // de un color que me pareciera. Es más saturado que los dos azules pálidos
    // que ya hay (Gemini y Antigravity), así que se distingue a 15px.
    install: "pnpm add -g @moonshot-ai/kimi-code (pide Node 22.19+; también tiene script propio)",
    hue: "#0a7aff",
    // Se instala de dos maneras y aquí va la de la casa. La otra es
    // `irm https://code.kimi.com/kimi-code/install.ps1 | iex`, que descarga un
    // binario suelto y lo mete en el PATH: funciona, pero deja algo que luego
    // no se sabe quitar. Por pnpm se desinstala con la misma línea al revés.
    cmd: "pnpm add -g @moonshot-ai/kimi-code",
    web: "https://www.kimi.com/code/",
    // apiEnv VACÍO, y esta vez no es por falta de dato sino porque su
    // documentación lo dice al revés que todos los demás: «Credential variables
    // such as KIMI_API_KEY (…) are not read automatically from shell
    // environment variables (…) they must be written in config.toml». Poner
    // aquí `KIMI_API_KEY` haría que Adeorq creyera que arranca facturando por
    // tokens cuando en realidad seguiría con el login de siempre.
    apiEnv: "",
    // Lo que NO se declara, y el porqué de cada uno, que es lo que evita
    // botones que mienten:
    //
    //   · `encargoEnLinea`: tiene `-p`, pero su propia tabla de opciones dice
    //     «Run a single prompt non-interactively (…) This mode does not open
    //     the TUI». No es el `--prompt` de opencode, que abre la interfaz con
    //     el encargo puesto: aquí el panel se quedaría con la respuesta impresa
    //     y sin agente al que seguir hablando.
    //   · `arranque` con permisos: sus dos banderas son `--yolo` («skips human
    //     approval (…) including file writes and shell command execution») y
    //     `--auto`. Ninguna es el `acceptEdits` de Claude, que pasa las
    //     ediciones y sigue preguntando lo arriesgado: las dos son permiso
    //     total, y darlo no es nuestro. Mismo criterio que con Copilot y
    //     opencode.
    //   · `modelo`, `modoPlan` y `retomable`: los TIENE (`--model`, `--plan`,
    //     `--session`/`--continue`), pero Adeorq solo sabe pasarlos en la rama
    //     de Claude de `lib/arranque.ts`, y `revivirPane` reanima SIEMPRE con
    //     `claude --resume`. Marcarlos aquí sacaría el selector de cerebro sin
    //     pasar el modelo, y un «Reanimar» que abriría Claude sobre una sesión
    //     de Kimi. Se declaran el día que la tabla tenga su `banderaModelo`
    //     como ya tiene `banderaEncargo`, y ese día entran los cinco CLIs que
    //     están en el mismo caso, no solo este.
  },
  // ── Los ocho de la ronda del 2026-08-19 ──────────────────────────────────
  //
  // Todos entran con el criterio de Kiro y de Kimi: se declara lo VERIFICADO y
  // se deja vacío lo que no. Y aquí verificado significa una cosa muy concreta:
  // el nombre del ejecutable NO es el que parece por el nombre del producto, es
  // el que declara el campo `bin` de su paquete, y eso se lee del registro sin
  // instalar nada (`npm view <paquete> bin`). Ahí es donde se ve que Goose se
  // instala con `goose-cli` pero se llama `goose`, o que Codebuff trae además
  // un alias `cb`.
  //
  // Lo que queda vacío en casi todos es la variable de carpeta y el fichero de
  // login: eso solo sale leyendo su código o teniéndolos en disco, y ninguno
  // está instalado aquí. Con `creds` vacío Adeorq dice que no sabe leerles el
  // login en vez de declarar desconectada una cuenta que sí lo está, y sin
  // `envVar` salen como de una sola cuenta en vez de apuntar dos a la misma
  // carpeta sin que nadie se entere. Cuando se instale uno, se rellena su fila.
  {
    id: "codewhale",
    label: "CodeWhale",
    exe: "codewhale",
    // El ÚNICO de esta tanda con la ficha entera, porque es Rust y abierto y se
    // le puede leer: `crates/paths/src/lib.rs` declara `CODEWHALE_APP_DIR =
    // ".codewhale"` y dice literalmente que sin `CODEWHALE_HOME` la carpeta es
    // «<user home>/.codewhale».
    envVar: "CODEWHALE_HOME",
    homeDir: ".codewhale",
    // Su login vive en `$CODEWHALE_HOME/credentials` con un nombre por
    // proveedor, así que pasa lo mismo que con Kimi: sin instalarlo no se sabe
    // cuál escribe el suyo.
    creds: [],
    usage: false,
    hue: "#38b6d3",
    install: "pnpm add -g codewhale",
    cmd: "pnpm add -g codewhale",
    web: "https://github.com/Hmbown/CodeWhale",
  },
  {
    id: "goose",
    label: "Goose",
    // Se instala con `goose-cli` y se llama `goose`: su `bin` lo dice.
    exe: "goose",
    envVar: "",
    homeDir: ".config/goose",
    creds: [],
    usage: false,
    hue: "#9dc93c",
    install: "pnpm add -g goose-cli",
    cmd: "pnpm add -g goose-cli",
    web: "https://github.com/aaif-goose/goose",
  },
  {
    id: "droid",
    label: "Droid",
    exe: "droid",
    envVar: "",
    homeDir: ".factory",
    creds: [],
    usage: false,
    hue: "#c2410c",
    install: "pnpm add -g droid",
    cmd: "pnpm add -g droid",
    web: "https://factory.ai",
  },
  {
    id: "jules",
    label: "Jules",
    exe: "jules",
    envVar: "",
    homeDir: ".jules",
    creds: [],
    usage: false,
    hue: "#46bd7e",
    install: "pnpm add -g @google/jules",
    cmd: "pnpm add -g @google/jules",
    web: "https://jules.google",
  },
  {
    id: "auggie",
    label: "Auggie",
    exe: "auggie",
    envVar: "",
    homeDir: ".augment",
    creds: [],
    usage: false,
    hue: "#00bfa5",
    install: "pnpm add -g @augmentcode/auggie",
    cmd: "pnpm add -g @augmentcode/auggie",
    web: "https://www.augmentcode.com",
  },
  {
    id: "codebuff",
    label: "Codebuff",
    // Su paquete declara DOS: `codebuff` y el alias corto `cb`. Se busca el
    // largo, que es el que no se confunde con nada.
    exe: "codebuff",
    envVar: "",
    homeDir: ".codebuff",
    creds: [],
    usage: false,
    hue: "#f06292",
    install: "pnpm add -g codebuff",
    cmd: "pnpm add -g codebuff",
    web: "https://www.codebuff.com",
  },
  {
    id: "cody",
    label: "Cody",
    exe: "cody",
    envVar: "",
    homeDir: ".sourcegraph",
    creds: [],
    usage: false,
    hue: "#ff5543",
    install: "pnpm add -g @sourcegraph/cody",
    cmd: "pnpm add -g @sourcegraph/cody",
    web: "https://sourcegraph.com/cody",
  },
  {
    id: "aider",
    label: "Aider",
    exe: "aider",
    // El único de la tanda que NO es de npm: vive en PyPI. Se instala con `uv`,
    // que ya está en esta máquina (0.12.0), y no con pip suelto, que dejaría el
    // paquete dentro del Python que toque y no en el PATH.
    envVar: "",
    // Aider no tiene carpeta de identidad: su configuración son ficheros
    // `.aider.*` en el proyecto más `~/.aider.conf.yml`, y su login son las
    // claves de API del entorno. Por eso `homeDir` queda con el perfil a secas
    // y `creds` vacío: no hay carpeta que mover ni fichero de sesión que mirar.
    homeDir: "",
    creds: [],
    usage: false,
    hue: "#8d6e63",
    install: "uv tool install aider-chat",
    cmd: "uv tool install aider-chat",
    web: "https://aider.chat",
    // Su documentación arranca por ahí en todos sus ejemplos con Claude.
    apiEnv: "ANTHROPIC_API_KEY",
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
