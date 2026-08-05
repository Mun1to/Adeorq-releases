// The house cheat sheet: what you can type inside each agent's terminal.
// Claude's list comes from its official command reference and agy's from its
// own --help, so nothing here is invented; skills are read live from disk.

export type Tool = "claude" | "agy" | "skill";

export interface CommandDoc {
  cmd: string;
  tool: Tool;
  es: string;
  en: string;
  /** Extra words to match when searching (synonyms Munir would type). */
  tags?: string;
}

export const TOOL_LABEL: Record<Tool, { es: string; en: string }> = {
  claude: { es: "Claude Code", en: "Claude Code" },
  agy: { es: "Antigravity (agy)", en: "Antigravity (agy)" },
  skill: { es: "Tus skills", en: "Your skills" },
};

export const COMMANDS: CommandDoc[] = [
  // ── Claude Code · lo que más se usa
  { cmd: "/model", tool: "claude", es: "Cambiar de modelo (Opus, Sonnet, Fable…).", en: "Switch the AI model.", tags: "opus sonnet fable haiku cambiar" },
  { cmd: "/effort", tool: "claude", es: "Cuánto se piensa las cosas: low, medium, high, max.", en: "Set the model effort level.", tags: "esfuerzo pensar high" },
  { cmd: "/usage", tool: "claude", es: "Cuánto llevas gastado de tu suscripción esta semana.", en: "Show token usage and estimated costs.", tags: "cuota limite semanal gasto" },
  { cmd: "/context", tool: "claude", es: "Ver en qué se está yendo el contexto, como una cuadrícula.", en: "Visualize current context usage as a colored grid.", tags: "contexto memoria lleno" },
  { cmd: "/compact", tool: "claude", es: "Comprimir la conversación para liberar contexto.", en: "Free up context by summarizing the conversation.", tags: "comprimir resumir memoria" },
  { cmd: "/clear", tool: "claude", es: "Empezar de cero, sin memoria de lo anterior.", en: "Start a new conversation with empty context.", tags: "limpiar reiniciar" },
  { cmd: "/resume", tool: "claude", es: "Volver a una conversación anterior.", en: "Return to an earlier conversation.", tags: "retomar sesion" },
  { cmd: "/rewind", tool: "claude", es: "Deshacer: vuelve el código y la charla a un punto anterior.", en: "Roll code and conversation back to a checkpoint.", tags: "deshacer atras checkpoint" },
  { cmd: "/plan", tool: "claude", es: "Modo plan: que piense el plan antes de tocar nada.", en: "Switch into plan mode before a large change.", tags: "planificar antes" },
  { cmd: "/init", tool: "claude", es: "Crear el CLAUDE.md del proyecto (sus reglas).", en: "Initialize project with a CLAUDE.md guide.", tags: "reglas proyecto arranque" },
  { cmd: "/memory", tool: "claude", es: "Editar la memoria: CLAUDE.md y la memoria automática.", en: "Edit CLAUDE.md memory files and manage auto-memory.", tags: "recordar memoria" },
  { cmd: "/permissions", tool: "claude", es: "Qué puede hacer sin preguntarte.", en: "Set approval rules for commands and tool access.", tags: "permisos auto aprobar" },
  { cmd: "/config", tool: "claude", es: "Ajustes de Claude Code.", en: "Open Settings interface to adjust preferences.", tags: "ajustes settings" },
  { cmd: "/login", tool: "claude", es: "Entrar con tu cuenta (cuando caduca el acceso).", en: "Sign in to your Anthropic account.", tags: "cuenta sesion caducado 401" },
  { cmd: "/agents", tool: "claude", es: "Gestionar tus subagentes.", en: "Manage subagent configurations.", tags: "subagentes equipo" },
  { cmd: "/subtask", tool: "claude", es: "Pasarle una tarea lateral a un subagente.", en: "Hand a side task to a subagent.", tags: "delegar agente" },
  { cmd: "/skills", tool: "claude", es: "Ver y gestionar tus skills.", en: "View and manage custom skills.", tags: "skills comandos propios" },
  { cmd: "/publish-skill", tool: "claude", es: "Publicar una skill para compartirla.", en: "Publish a skill to share with other users.", tags: "compartir skill" },
  { cmd: "/mcp", tool: "claude", es: "Conexiones MCP (servidores de herramientas).", en: "Manage MCP server connections.", tags: "mcp servidores herramientas" },
  { cmd: "/code-review", tool: "claude", es: "Revisar tus cambios buscando fallos y limpieza.", en: "Review the current diff for bugs and cleanup.", tags: "revisar codigo diff" },
  { cmd: "/security-review", tool: "claude", es: "Revisar los cambios buscando agujeros de seguridad.", en: "Check the diff for security vulnerabilities.", tags: "seguridad vulnerabilidades" },
  { cmd: "/verify", tool: "claude", es: "Verificar que el código hace lo que dice, pensando a fondo.", en: "Verify code correctness with extended thinking.", tags: "verificar comprobar" },
  { cmd: "/simplify", tool: "claude", es: "Simplificar el código sin cambiar lo que hace.", en: "Refactor code for readability without changing behavior.", tags: "limpiar refactor" },
  { cmd: "/test", tool: "claude", es: "Lanzar las pruebas del proyecto.", en: "Run your project's test suite.", tags: "tests pruebas" },
  { cmd: "/diff", tool: "claude", es: "Ver los cambios sin guardar, en visor.", en: "Open an interactive diff viewer.", tags: "cambios git diff" },
  { cmd: "/review", tool: "claude", es: "Revisión rápida de un pull request de GitHub.", en: "Fast read-only review of a GitHub PR.", tags: "pr github revisar" },
  { cmd: "/pr-summary", tool: "claude", es: "Resumir los cambios de un pull request.", en: "Summarize changes in a GitHub pull request.", tags: "pr resumen" },
  { cmd: "/worktree", tool: "claude", es: "Manejar worktrees de git para trabajar en paralelo.", en: "Manage git worktrees for parallel work.", tags: "git ramas paralelo" },
  { cmd: "/branch", tool: "claude", es: "Bifurcar la conversación para probar otro camino.", en: "Branch the conversation to try another direction.", tags: "rama probar" },
  { cmd: "/fork", tool: "claude", es: "Copiar la conversación a una sesión de fondo.", en: "Copy the conversation into a background session.", tags: "duplicar fondo" },
  { cmd: "/background", tool: "claude", es: "Dejar la sesión trabajando en segundo plano.", en: "Detach the session to run in the background.", tags: "fondo desatender" },
  { cmd: "/tasks", tool: "claude", es: "Ver el trabajo que está corriendo en segundo plano.", en: "List the session's background work.", tags: "tareas fondo" },
  { cmd: "/loop", tool: "claude", es: "Repetir una orden cada cierto tiempo.", en: "Run a prompt repeatedly on an interval.", tags: "repetir bucle cada" },
  { cmd: "/goal", tool: "claude", es: "Fijar una meta que persiga durante varios turnos.", en: "Set a goal to work toward across turns.", tags: "meta objetivo" },
  { cmd: "/batch", tool: "claude", es: "Cambios a lo grande en paralelo por todo el código.", en: "Orchestrate large-scale changes in parallel.", tags: "masivo migracion" },
  { cmd: "/deep-research", tool: "claude", es: "Investigación a fondo en internet con fuentes cruzadas.", en: "Fan out web searches and synthesize a report.", tags: "investigar buscar internet" },
  { cmd: "/search", tool: "claude", es: "Buscar en el código por significado o por palabra.", en: "Search the codebase semantically or by keyword.", tags: "buscar codigo" },
  { cmd: "/btw", tool: "claude", es: "Preguntar algo suelto sin ensuciar la conversación.", en: "Ask a quick side question.", tags: "pregunta rapida aparte" },
  { cmd: "/thinking", tool: "claude", es: "Encender o apagar el pensamiento extendido.", en: "Enable or disable extended thinking.", tags: "pensar razonar" },
  { cmd: "/fast", tool: "claude", es: "Modo rápido (mismo modelo, respuesta más ágil).", en: "Toggle fast mode.", tags: "rapido velocidad" },
  { cmd: "/copy", tool: "claude", es: "Copiar al portapapeles la última respuesta.", en: "Copy the last response to clipboard.", tags: "copiar portapapeles" },
  { cmd: "/export", tool: "claude", es: "Exportar la conversación como texto.", en: "Export the conversation as plain text.", tags: "exportar guardar" },
  { cmd: "/insights", tool: "claude", es: "Informe sobre cómo usas Claude Code.", en: "Report analyzing your Claude Code sessions.", tags: "estadisticas informe" },
  { cmd: "/doctor", tool: "claude", es: "Revisión de la instalación: diagnostica y arregla.", en: "Setup checkup that diagnoses and can fix issues.", tags: "problemas diagnostico arreglar" },
  { cmd: "/upgrade", tool: "claude", es: "Actualizar Claude Code a la última versión.", en: "Upgrade Claude Code.", tags: "actualizar version" },
  { cmd: "/keybindings", tool: "claude", es: "Editar tus atajos de teclado.", en: "Open your keyboard shortcuts file.", tags: "atajos teclado" },
  { cmd: "/chrome", tool: "claude", es: "Conectar Claude con tu navegador Chrome.", en: "Configure Claude in Chrome.", tags: "navegador chrome web" },
  { cmd: "/ide", tool: "claude", es: "Integración con tu editor.", en: "Manage IDE integrations.", tags: "editor vscode" },
  { cmd: "/cd", tool: "claude", es: "Mover la sesión a otra carpeta.", en: "Move this session to a new working directory.", tags: "carpeta directorio cambiar" },
  { cmd: "/add-dir", tool: "claude", es: "Dar acceso a otra carpeta además de la actual.", en: "Add a working directory for file access.", tags: "carpeta acceso" },
  { cmd: "/exit", tool: "claude", es: "Salir de la sesión.", en: "Exit the CLI.", tags: "salir cerrar" },
  { cmd: "/help", tool: "claude", es: "La ayuda con todos los comandos.", en: "Show help and available commands.", tags: "ayuda comandos" },

  // ── Antigravity (agy) · de su propia ayuda
  { cmd: "agy", tool: "agy", es: "Abrir Antigravity en la carpeta actual.", en: "Open Antigravity in the current folder.", tags: "gemini abrir" },
  { cmd: 'agy "lo que quieras"', tool: "agy", es: "Arrancar ya con una orden escrita.", en: "Start with an initial instruction.", tags: "prompt orden" },
  { cmd: "agy -p", tool: "agy", es: "Una sola pregunta y su respuesta, sin abrir sesión.", en: "Run a single prompt non-interactively.", tags: "print rapido" },
  { cmd: "agy -c", tool: "agy", es: "Continuar la última conversación.", en: "Continue the most recent conversation.", tags: "continuar retomar" },
  { cmd: "agy --conversation <id>", tool: "agy", es: "Retomar una conversación concreta por su id.", en: "Resume a conversation by ID.", tags: "retomar id" },
  { cmd: "agy --model <modelo>", tool: "agy", es: "Elegir el modelo de Gemini.", en: "Pick the model for the session.", tags: "gemini modelo" },
  { cmd: "agy --effort <low|medium|high>", tool: "agy", es: "Cuánto se lo piensa.", en: "Reasoning effort for the session.", tags: "esfuerzo" },
  { cmd: "agy --mode accept-edits", tool: "agy", es: "Modo Auto: edita archivos sin preguntar (así lo abre Adeorq).", en: "Auto mode: file edits auto-approved.", tags: "auto permisos" },
  { cmd: "agy --mode plan", tool: "agy", es: "Modo plan: primero el plan, luego tocar.", en: "Plan mode.", tags: "plan" },
  { cmd: "agy --add-dir <carpeta>", tool: "agy", es: "Dar acceso a otra carpeta.", en: "Add a directory to the workspace.", tags: "carpeta acceso" },
  { cmd: "agy --sandbox", tool: "agy", es: "Correr con la terminal restringida.", en: "Run in a sandbox with terminal restrictions.", tags: "seguro aislado" },
  { cmd: "agy agents", tool: "agy", es: "Ver los agentes disponibles.", en: "List available agents.", tags: "agentes" },
  { cmd: "agy changelog", tool: "agy", es: "Novedades de la versión.", en: "Show changelog and release notes.", tags: "novedades cambios" },
];
