import { createContext, useContext } from "react";

// Spanish IS the key: t("Nueva sesión") returns the English entry when the UI
// is in English and falls back to the Spanish text otherwise. That way the app
// can be translated piece by piece and nothing ever renders blank.
export type Lang = "es" | "en";

export const LANG_KEY = "adeorq-lang";
export const THEME_KEY = "adeorq-theme";

/**
 * Los temas de la casa, en el orden en que se enseñan.
 *
 * Estaban puestos por orden de llegada, así que la lista era una fila de
 * veinticuatro chips donde el azul de arriba y el azul de en medio no se
 * encontraban nunca y elegir era ir leyendo nombres uno a uno. Ahora van por
 * FAMILIA, y dentro de cada una del más frío al más cálido, que es como se
 * busca un color cuando no sabes cuál quieres: primero decides la temperatura.
 *
 * Las familias dicen algo verdadero, no son cajones de adorno:
 * · `casa` los dibujados aquí para Adeorq;
 * · `prestado` los que vienen de otro sitio y se llaman por su nombre real
 *   (Nord, Dracula, Gruvbox…), que es lo honesto y además lo que hace que se
 *   reconozcan;
 * · `fuerte` los que no pretenden ser discretos;
 * · `claro` los de fondo claro, aparte porque cambian la app entera de tono.
 */
export const THEMES = [
  // De la casa, de frío a cálido.
  { id: "azul", es: "Azul noche", en: "Midnight blue", familia: "casa" },
  { id: "oceano", es: "Océano", en: "Ocean", familia: "casa" },
  { id: "turquesa", es: "Turquesa", en: "Turquoise", familia: "casa" },
  { id: "esmeralda", es: "Esmeralda", en: "Emerald", familia: "casa" },
  { id: "verde", es: "Bosque", en: "Forest", familia: "casa" },
  { id: "grafito", es: "Grafito", en: "Graphite", familia: "casa" },
  { id: "violeta", es: "Violeta", en: "Violet", familia: "casa" },
  { id: "ciruela", es: "Ciruela", en: "Plum", familia: "casa" },
  { id: "carmin", es: "Carmín", en: "Crimson", familia: "casa" },
  { id: "volcano", es: "Volcán", en: "Volcano", familia: "casa" },
  { id: "ocaso", es: "Ocaso", en: "Sunset", familia: "casa" },
  { id: "ambar", es: "Ámbar", en: "Amber", familia: "casa" },
  { id: "arena", es: "Arena", en: "Sand", familia: "casa" },
  // Prestados, con su nombre de siempre.
  { id: "nord", es: "Ártico", en: "Nord", familia: "prestado" },
  { id: "tokyo", es: "Tokyo Night", en: "Tokyo Night", familia: "prestado" },
  { id: "onedark", es: "One Dark", en: "One Dark", familia: "prestado" },
  { id: "catppuccin", es: "Catppuccin Mocha", en: "Catppuccin Mocha", familia: "prestado" },
  { id: "dracula", es: "Drácula", en: "Dracula", familia: "prestado" },
  { id: "rose", es: "Rosé Pine", en: "Rosé Pine", familia: "prestado" },
  { id: "kanagawa", es: "Kanagawa", en: "Kanagawa", familia: "prestado" },
  { id: "everforest", es: "Everforest", en: "Everforest", familia: "prestado" },
  { id: "gruvbox", es: "Gruvbox", en: "Gruvbox", familia: "prestado" },
  { id: "monokai", es: "Monokai", en: "Monokai", familia: "prestado" },
  { id: "solarized", es: "Solarizado", en: "Solarized Dark", familia: "prestado" },
  // De los que se notan.
  { id: "neon", es: "Neón", en: "Neon", familia: "fuerte" },
  { id: "cyberpunk", es: "Cyberpunk", en: "Cyberpunk", familia: "fuerte" },
  { id: "synthwave", es: "Synthwave '84", en: "Synthwave '84", familia: "fuerte" },
  { id: "matrix", es: "Matrix", en: "Matrix", familia: "fuerte" },
  // Apagados del todo.
  { id: "negro", es: "Negro absoluto", en: "Pure black", familia: "apagon" },
  { id: "tinta", es: "Tinta", en: "Ink", familia: "apagon" },
  // De fondo claro.
  { id: "claro", es: "Claro", en: "Light", familia: "claro" },
  { id: "papel", es: "Papel", en: "Paper", familia: "claro" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

/** Las familias en su orden, con el nombre que se lee encima de cada grupo. */
export const FAMILIAS_TEMA = [
  { id: "casa", es: "De la casa", en: "House" },
  { id: "prestado", es: "Conocidos", en: "Familiar" },
  { id: "fuerte", es: "De los que se notan", en: "Loud" },
  { id: "apagon", es: "Apagados", en: "Blacked out" },
  { id: "claro", es: "De fondo claro", en: "Light background" },
] as const;

const EN: Record<string, string> = {
  // Topbar and views
  Panel: "Dashboard",
  Cabina: "Cockpit",
  Guía: "Guide",
  // Se pasa a t() por variable (t(tab.label)) igual que sus vecinas de arriba,
  // así que el comprobador automático no la ve: se quedó fuera de esta lista
  // desde que nació la pestaña y el inglés enseñaba "Memoria" (Munir,
  // 2026-08-02).
  Memoria: "Memory",
  Ajustes: "Settings",
  Emisión: "Streaming",
  "En emisión": "Streaming on",
  Capataz: "Foreman",
  // El Asistente: el mismo Capataz, con el nombre que Munir prefiere ver
  // (2026-07-29). El de dentro sigue llamándose Capataz en el código y en los
  // docs, que es donde ese nombre significa algo; esto es lo que se lee.
  Asistente: "Assistant",
  "Llamar al Asistente (Ctrl+Mayús+A · Ctrl+Mayús+M para dictarle)":
    "Call the Assistant (Ctrl+Shift+A · Ctrl+Shift+M to dictate)",
  "Invocar al Capataz (Ctrl+Mayús+A)": "Summon the Foreman (Ctrl+Shift+A)",
  "Modo emisión: oculta rutas y datos personales para streamear (Ctrl+Mayús+E)":
    "Streaming mode: hides paths and personal data (Ctrl+Shift+E)",
  "Modo emisión ACTIVO: rutas y correos ocultos (Ctrl+Mayús+E)":
    "Streaming mode ON: paths and emails hidden (Ctrl+Shift+E)",

  // Dashboard
  "Hola, Munito.": "Hey, Munito.",
  "Tu taller, a vista de pájaro.": "Your workshop, from above.",
  "sesiones en vivo ahora": "sessions live right now",
  "sesiones esta semana": "sessions this week",
  "proyectos en C:\\proyectos": "projects in C:\\proyectos",
  // El saludo según la hora, y el resumen de estado de debajo.
  "Buenos días": "Good morning",
  "Buenas tardes": "Good afternoon",
  "Buenas noches": "Good evening",
  "Aún en pie": "Still up",
  // Con singular propio: «1 sesiones esperan» es lo que delata que una frase
  // se ha montado con una plantilla y a nadie le importó cómo quedaba.
  "Una sesión espera respuesta tuya.": "One session is waiting on you.",
  "{n} sesiones esperan respuesta tuya.": "{n} sessions are waiting on you.",
  "Una sesión en marcha y nada pendiente de ti.":
    "One session running, nothing waiting on you.",
  "{n} sesiones en marcha y nada pendiente de ti.":
    "{n} sessions running, nothing waiting on you.",
  "un agente desplegado": "one agent out",
  "Todo tranquilo. Nada corriendo ahora mismo.": "All quiet. Nothing running right now.",
  "trabajando ahora": "working now",
  proyectos: "projects",
  "{n} agentes desplegados": "{n} agents out",
  "sin subagentes fuera": "no subagents out",
  "nadie en marcha": "nobody running",
  "han preguntado algo": "they asked you something",
  "nada pendiente de ti": "nothing on your plate",
  "en {n} proyectos": "across {n} projects",
  "Proyectos calientes": "Hot projects",
  // Las barras de secciones del Panel, Cuentas y la Agenda.
  Ahora: "Now",
  Proyectos: "Projects",
  Misión: "Mission",
  "Todos tus proyectos": "All your projects",
  "Los {n} que hay en {d}. Clic para ir a sus sesiones.":
    "The {n} in {d}. Click to jump to its sessions.",
  "Los {n} que has añadido tú. Clic para ir a sus sesiones.":
    "The {n} you added yourself. Click to jump to its sessions.",
  "añadidos por ti": "added by you",
  "Eliges dónde crearla y nace con AGENTS.md (tus reglas), METAS.md y git, ya puesta en el panel.":
    "You pick where it goes and it is born with AGENTS.md (your rules), METAS.md and git, already in the sidebar.",
  "Dónde crear la carpeta del proyecto": "Where to create the project folder",
  "Todavía no hay proyectos. Abre una carpeta del disco o una suelta.":
    "No projects yet. Open a folder from disk, or a loose one.",
  "Tus cuentas": "Your accounts",
  // Abrir un chat con el modelo de casa, desde el asistente de sesión nueva.
  "Corre en tu equipo y no gasta cuota de nadie. Es un chat: no lee ni toca tus archivos.":
    "It runs on your machine and spends nobody's quota. It is a chat: it does not read or touch your files.",
  "Tienes Ollama pero ningún modelo descargado. Bájate uno con este comando y vuelve aquí:":
    "You have Ollama but no model downloaded. Get one with this command and come back here:",
  // Los tres estados de una tarjeta de cuenta, cortos a propósito: la chapa de
  // la esquina ya dice cómo está, así que el texto solo dice qué hacer. Antes
  // repetían el estado y se comían dos renglones en cada tarjeta.
  "Ábrelo y te lo dirá él.": "Open it and it will tell you.",
  "Abre una terminal aquí y haz el login.": "Open a terminal here and log in.",
  "No publica su consumo en el equipo, así que no hay barras que enseñar.":
    "It publishes no usage on the machine, so there are no bars to show.",
  "Este programa no deja ninguna huella en el equipo al iniciar sesión, así que Adeorq no puede saberlo sin abrirlo.":
    "This program leaves no trace on the machine when you log in, so Adeorq cannot know without opening it.",
  // El renglón de resumen de Cuentas, que hasta el 2026-08-09 eran tres
  // tarjetas grandes, y el contador del final de cada CLI plegado.
  // `conectada` a secas ya vive más abajo, con las cuentas: no se repite aquí.
  conectadas: "connected",
  "de {n} instalados": "of {n} installed",
  "es la de siempre": "is the usual one",
  "con ella nacen las terminales nuevas": "new terminals are born with it",
  "{n} cuentas": "{n} accounts",
  "Los tienes todos. No queda ningún programa de la lista por instalar.":
    "You have them all. No program on the list is left to install.",
  Ideas: "Ideas",
  "Próximos pasos": "Next steps",
  "Donde más se ha trabajado esta semana. Clic para ir.":
    "Where most of the work happened this week. Click to jump.",
  "Sin actividad reciente.": "No recent activity.",
  "＋ Nuevo proyecto": "＋ New project",
  "Nombre del proyecto": "Project name",
  Crear: "Create",
  "El foco": "The focus",
  "La única fecha real del sistema:": "The only real deadline in the system:",
  "distintivo de IA en orquio.com antes del 2 de agosto":
    "AI disclosure badge on orquio.com before 2 August",
  "Regla de la casa: terminar antes que abrir. Este panel existe para acelerar lo que ya está en marcha.":
    "House rule: finish before you start something new. This dashboard exists to speed up what is already moving.",
  "Crea la carpeta en {d} con AGENTS.md (tus reglas), METAS.md y git, listo para la primera sesión.":
    "Creates the folder in {d} with AGENTS.md (your rules), METAS.md and git, ready for its first session.",
  "sesiones de ~/.claude": "sessions from ~/.claude",
  "Describe qué quieres, elige proyecto y roles: pasa por el Reparto, que decide el cliente y el cerebro de cada puesto, les separa los archivos para que no se pisen y deja el papel común en el BUZON.md. Antes de abrir nada verás lo que va a costar.":
    "Describe what you want, pick a project and roles: it goes through the Split, which picks each seat's client and brain, separates their files so they do not step on each other, and leaves the shared notes in BUZON.md. You see what it will cost before anything opens.",
  "Ej.: una landing con formulario de contacto que guarde en SQLite":
    "e.g. a landing page with a contact form that saves to SQLite",
  "Preparar el reparto de {n} puestos": "Prepare the split for {n} seats",
  "Cómo se ve y cómo habla tu taller.": "How your workshop looks and speaks.",
  "⚑ Misión: despliega un equipo": "⚑ Mission: deploy a team",
  "Elige el proyecto…": "Pick the project…",
  Frontend: "Frontend",
  Backend: "Backend",
  Seguridad: "Security",
  Diseño: "Design",

  // Sidebar
  Workspaces: "Workspaces",
  "Filtrar proyectos y sesiones": "Filter projects and sessions",
  "Releer proyectos y sesiones": "Rescan projects and sessions",
  "Arrancar Adeorq al encender el ordenador": "Start Adeorq when the computer boots",
  // Agenda, tray and the two-step opener (2026-07-26)
  "Agenda":
    "Agenda",
  "Lo que viene, lo que pensaste y lo que toca.":
    "What is coming, what you thought of, and what is next.",
  // Los objetivos del día.
  "Objetivos de hoy": "Today's goals",
  "Tus objetivos de hoy": "Your goals for today",
  // El pulso: lo que Adeorq le cuesta al equipo.
  "Lo que Adeorq está gastando en tu equipo": "What Adeorq is costing your machine",
  "Lo que gasta Adeorq": "What Adeorq is using",
  "Memoria de Adeorq y sus agentes": "Memory for Adeorq and its agents",
  "Memoria de todo el equipo": "Memory across the whole machine",
  "{n} procesos en marcha": "{n} processes running",
  "uno es un agente": "one of them is an agent",
  "{n} son agentes": "{n} of them are agents",
  "Cada agente es un programa aparte, así que la cuenta incluye lo que gastan tus terminales y no solo la ventana.":
    "Each agent is a separate program, so the figure covers what your terminals use and not just the window.",
  "Devolverlo a su esquina": "Send it back to its corner",
  "Qué quieres dejar hecho hoy": "What you want done today",
  "Nada apuntado para hoy. Escribe abajo lo que quieras dejar cerrado.":
    "Nothing down for today. Write below whatever you want closed.",
  "Quitar este objetivo": "Remove this goal",
  "Están en un archivo, así que un agente puede tacharlos al terminar.":
    "They live in a file, so an agent can tick them off when it is done.",
  "Abrir el archivo": "Open the file",
  "Todo el ecosistema":
    "The whole ecosystem",
  /* La portada de la Agenda: seis cifras y una frase corta cada una. */
  "sesiones te esperan":
    "sessions are waiting for you",
  "te preguntan algo o esperan tu OK":
    "they asked you something or want your OK",
  "ninguna te espera":
    "none waiting on you",
  "propuestas de tus agentes":
    "proposals from your agents",
  "{p} pasos · {i} ideas":
    "{p} steps · {i} ideas",
  "nada apuntado":
    "nothing jotted down",
  "objetivos para hoy":
    "goals for today",
  "{n} de {t} hechos":
    "{n} of {t} done",
  "no has puesto ninguno":
    "you have not set any",
  "con fecha esta semana":
    "dated this week",
  "nada en el calendario":
    "nothing on the calendar",
  "metas activas":
    "open goals",
  "elige un proyecto":
    "pick a project",
  "ideas vivas":
    "live ideas",
  "en tu brújula":
    "in your compass",
  "Volver":
    "Back",
  /* El calendario del mes. */
  "El mes anterior":
    "The month before",
  "El mes siguiente":
    "The month after",
  "Ese día no apuntaste nada.":
    "You did not write anything down that day.",
  "Apuntar algo para este día…":
    "Write something down for this day…",
  "Salir de la brújula":
    "Sign out of the compass",
  /* Las propuestas, de una en una. */
  "{i} de {n}":
    "{i} of {n}",
  "Aceptar":
    "Accept",
  "Luego":
    "Later",
  "Dejarla para otro rato y ver la siguiente":
    "Leave it for later and see the next one",
  "No queda ninguna propuesta. Tus agentes escribirán más mientras trabajan.":
    "No proposals left. Your agents will write more while they work.",
  "Ir a sus sesiones":
    "Go to its sessions",
  "brújula conectada":
    "compass connected",
  "brújula sin conectar":
    "compass not connected",
  "brújula con problemas":
    "compass having trouble",
  "comprobando…":
    "checking…",
  "Salir":
    "Sign out",
  "Conecta tu brújula":
    "Connect your compass",
  "Con tu cuenta de munito.dev, para traer aquí tus fechas y tus ideas. La contraseña no se guarda en ningún sitio: solo el permiso de vuelta, y va al almacén cifrado de Windows.":
    "With your munito.dev account, to bring your dates and your ideas in here. The password is stored nowhere: only the token that gets you back in, and it goes into the encrypted Windows vault.",
  "Tu correo":
    "Your email",
  "Tu contraseña":
    "Your password",
  "Entrar":
    "Sign in",
  "Entrando…":
    "Signing in…",
  Calendario: "Calendar",
  "Tus ventanas externas: lo que tiene fecha porque la pone otro. Cada una avisa con la antelación que le pusiste.":
    "Your external windows: the things with a date because someone else set it. Each one warns you as early as you told it to.",
  "Nada a la vista.":
    "Nothing on the horizon.",
  "Conecta la brújula para verlo.":
    "Connect the compass to see this.",
  "Ver también las pasadas":
    "Show the past ones too",
  "Ocultar las pasadas":
    "Hide the past ones",
  "Las de {p} y las del ecosistema, con su condición de desbloqueo.":
    "The ones from {p} and from the ecosystem, with what unlocks them.",
  "Todas las que tienes vivas o aparcadas, con su condición de desbloqueo.":
    "Everything you have alive or parked, with what unlocks it.",
  "Ninguna por aquí.":
    "None around here.",
  "Se me ocurre que…":
    "It occurs to me that…",
  "Apuntar":
    "Note it down",
  "Idea guardada en tu brújula.":
    "Idea saved to your compass.",
  "Elige un proyecto arriba para ver sus metas.":
    "Pick a project above to see its goals.",
  "{p} todavía no tiene docs/METAS.md. Lo que apuntes abajo lo crea.":
    "{p} has no docs/METAS.md yet. Whatever you write below creates it.",
  "Hecho cuando":
    "Done when",
  "Todas sus metas están cerradas.":
    "All of its goals are closed.",
  "Aparcadero":
    "Parked",
  "y {n} más en el archivo":
    "and {n} more in the file",
  "Añadir al aparcadero de este proyecto":
    "Add to this project's parked list",
  "Apuntado en su METAS.md. Lo verás en el diff antes de commitear.":
    "Written into its METAS.md. You will see it in the diff before committing.",
  "De tus agentes": "From your agents",
  "Lo que tus sesiones han ido apuntando mientras trabajaban. Aceptar una idea la manda a tu brújula; aceptar un paso lo escribe en el METAS.md de ese proyecto.":
    "What your sessions noted down while they worked. Accepting an idea sends it to your compass; accepting a step writes it into that project's METAS.md.",
  "idea":
    "idea",
  "paso":
    "step",
  "Escribirlo en el METAS.md de {p}":
    "Write it into the METAS.md of {p}",
  "Guardarlo como idea en tu brújula":
    "Save it as an idea in your compass",
  "Descartar: se borra de la bandeja y ya está":
    "Discard: it leaves the tray and that is that",
  "Apuntado en el METAS.md de {p}.":
    "Written into the METAS.md of {p}.",
  "No encuentro la carpeta de {p}, así que no sé dónde apuntarlo.":
    "I cannot find the folder for {p}, so I do not know where to write it.",
  "Abrir una sesión":
    "Open a session",
  "Dónde":
    "Where",
  "Con qué":
    "With what",
  "La carpeta donde va a trabajar. Puede ser una que ya tengas, una del disco o una nueva.":
    "The folder it will work in. One you already have, one from disk, or a new one.",
  "Filtrar proyectos":
    "Filter projects",
  "Ningún proyecto con ese nombre.":
    "No project by that name.",
  "Nombre del proyecto nuevo":
    "Name of the new project",
  "Creando…":
    "Creating…",
  "📁 Otra carpeta del disco…":
    "📁 Another folder from disk…",
  "＋ Proyecto nuevo…":
    "＋ New project…",
  "↯ Suelta, sin proyecto":
    "↯ Loose, no project",
  // La terminal viva en el cajón de las sueltas. Las dos frases largas van
  // dentro de un ternario, así que el comprobador no las ve: si faltan, la app
  // en inglés las enseña en español sin decir nada.
  ABIERTA: "OPEN",
  "Abierta ahora. Clic: ir a ella.": "Open right now. Click: go to it.",
  "Abierta ahora. Una terminal no deja historial: al cerrarla no queda nada suyo.":
    "Open right now. A terminal leaves no history: closing it leaves nothing behind.",
  suelta:
    "loose",
  "Elige la carpeta":
    "Pick the folder",
  "Qué se abre en":
    "What opens in",
  "Qué se abre, suelto y sin proyecto, en":
    "What opens, loose and with no project, in",
  "El de siempre":
    "The usual one",
  "«El de siempre» respeta el que tengas puesto con /model. Dentro de la sesión se cambia igual, cuando quieras.":
    "“The usual one” keeps whatever you set with /model. Inside the session you can still change it whenever.",
  "Cómo empieza":
    "How it starts",
  Normal:
    "Normal",
  "En modo plan, Claude no toca nada: enseña un plan y espera tu OK antes de tocar el código. «Normal» abre con el modo que tengas puesto en Ajustes › Terminales.":
    "In plan mode, Claude touches nothing: it shows a plan and waits for your OK before touching the code. “Normal” opens with whatever mode you have set in Settings › Terminals.",
  "modo plan":
    "plan mode",
  "Cuenta":
    "Account",
  "Se abrirá {tool} en {path}":
    "{tool} will open in {path}",
  "Atrás":
    "Back",
  "Siguiente":
    "Next",
  "Abrir":
    "Open",
  "＋ Abrir una sesión…":
    "＋ Open a session…",
  "Abrir una sesión: eliges carpeta y herramienta":
    "Open a session: you pick the folder and the tool",
  "Usa solo letras, números, espacios, guiones o puntos":
    "Use only letters, numbers, spaces, hyphens or dots",
  "Cuántas a la vez": "How many at once",
  "a todas solo admite comandos con /": "to all only takes / commands",
  "orden vacía": "empty order",
  "hasta {n}": "up to {n}",
  "Más de una abre ese número de terminales en la misma carpeta, cada una con su propia conversación, y las coloca en rejilla. Si ya tenías terminales abiertas, estas se suman sin recolocar las tuyas.":
    "More than one opens that many terminals in the same folder, each with its own conversation, and lays them out in a grid. If you already had terminals open, these are added without re-dealing yours.",
  "Se abrirán {n} {tool} en {path}": "{n} {tool} will open in {path}",
  "Abrir las {n}": "Open all {n}",
  "Tiene una sesión abierta ahora mismo": "It has a session open right now",
  "✎ Cambiar el nombre que se ve…": "✎ Change the name shown here…",
  "Volver a llamarlo «{n}»": "Call it “{n}” again",
  "Cómo se llama aquí": "What it is called here",
  "Cambia solo lo que ves en Adeorq. La carpeta se queda como está, y por eso tus sesiones de Claude siguen encontrándola: van por su ruta, no por su nombre.":
    "Changes only what you see in Adeorq. The folder stays as it is, which is why your Claude sessions keep finding it: they go by its path, not by its name.",
  Carpeta: "Folder",
  "sin sesiones recientes": "no recent sessions",
  "Aquí queda fuera de su grupo": "Drop here to take it out of its group",
  "Aquí deja de ser de ningún proyecto": "Drop here and it belongs to no project",
  "sesiones no agrupadas": "ungrouped sessions",

  // Lo que llevas trabajado, en la pantalla vacía de la Cabina. «Sesiones» ya
  // está traducida más arriba, así que aquí solo van las que faltaban.
  // Cerrar sesión en Cuentas, desde la 0.9.76. No confundir con «Quitar», que
  // se lleva la carpeta entera: esto solo borra el login.
  "Cerrar sesión": "Sign out",
  "Cerrar todas ({n})": "Sign out of all ({n})",
  "Cerrar sesión en todas: cada CLI volverá a pedir login":
    "Sign out everywhere: each CLI will ask for a login again",
  "Se cierra la sesión en las {n} cuentas conectadas, de todos los CLIs. No se borra nada más: los proyectos, el historial y los ajustes de cada una siguen donde están, y para volver a entrar hay que hacer el login otra vez en cada una.":
    "Signs out of the {n} connected accounts, across every CLI. Nothing else is deleted: each one keeps its projects, its history and its settings, and getting back in means logging into each one again.",
  "«{a}» ({p}) deja de estar conectada. No se borra nada más: sus proyectos, su historial y sus ajustes siguen donde están, y para volver a entrar hay que hacer el login otra vez.":
    "«{a}» ({p}) stops being connected. Nothing else is deleted: its projects, its history and its settings stay where they are, and getting back in means logging in again.",

  // El botón de Ajustes, que desde la 0.9.74 instala además de comprobar.
  "Buscar e instalar": "Check and install",
  "Bajando la {v}…": "Downloading {v}…",

  // La cabecera a su gusto, desde la 0.9.73.
  "La cabecera": "The header",
  "Qué pestañas salen arriba y en qué orden. Apagar una la quita de la vista, no de Adeorq: su atajo de teclado la sigue abriendo, y los botones de otras pantallas que llevan a ella también. Ajustes no se puede apagar, porque es donde se vuelven a encender las demás.":
    "Which tabs show up top, and in what order. Turning one off takes it out of sight, not out of Adeorq: its keyboard shortcut still opens it, and so do the buttons in other screens that lead there. Settings cannot be turned off, because it is where you turn the rest back on.",
  "Ajustes no se puede apagar": "Settings cannot be turned off",
  Subir: "Move up",
  Bajar: "Move down",
  "Como venía de fábrica": "Back to how it came",

  // La CPU en el Pulso, desde la 0.9.71.
  "CPU de Adeorq y sus agentes": "CPU of Adeorq and its agents",
  "La CPU es del equipo entero, como en el Administrador de tareas: tu máquina tiene {n} hilos, así que el 100 % son todos a la vez.":
    "The CPU figure is of the whole machine, like in Task Manager: yours has {n} threads, so 100% means all of them at once.",

  // La tarjeta de actualizar, que desde la 0.9.70 es una tarjeta abajo a la
  // izquierda en vez de una franja que empujaba la app entera hacia abajo.
  "Actualizar Adeorq": "Update Adeorq",
  "Reinicia para estrenar": "Restart to get it",
  "Reiniciar Adeorq": "Restart Adeorq",
  "Descargar e instalar la versión {v}": "Download and install version {v}",

  Mensajes: "Messages",
  Tokens: "Tokens",
  "Días activos": "Active days",
  "Racha actual": "Current streak",
  "Racha más larga": "Longest streak",
  "Hora punta": "Peak hour",
  "Modelo favorito": "Favourite model",
  "Sumando tus {n} cuentas. ": "Across your {n} accounts. ",
  "Lo lleva Claude Code por su cuenta: mirar esto no gasta nada.":
    "Claude Code keeps this on its own: looking at it costs nothing.",
  "Claude Code calculó esto el {d}; lo de después todavía no está dentro.":
    "Claude Code worked this out on {d}; anything since is not in yet.",
  "Cargar {n} sesiones más antiguas": "Load {n} older sessions",
  "sesión": "session",
  esperando: "waiting",

  "Sin sesiones recientes": "No recent sessions",
  "Solo los logos, en grande": "Logos only, big",
  "Logo y nombre": "Logo and name",
  "Encogerla del todo: solo los logos, en una tira": "Shrink it right down: logos only, in a strip",
  "Volver a la barra ancha": "Back to the wide rail",
  "Nueva sesión de {cli} con la cuenta «{acc}» aquí":
    "New {cli} session here, signed in as “{acc}”",
  "Escrita con la cuenta «{acc}», y ahí se retoma":
    "Written on the “{acc}” account, and that is where it resumes",
  "Cuenta: {acc}": "Account: {acc}",
  "Quitar el filtro": "Clear the filter",
  "{n} proyectos escondidos por el filtro. Pulsa para verlos.":
    "{n} projects hidden by the filter. Click to see them.",
  "{n} traídas a mano. Pulsa para quitarlas de la lista.":
    "{n} brought over by hand. Click to take them off the list.",
  "Entendido: dejar de avisar. Las sesiones se quedan donde están.":
    "Got it: stop reminding me. The sessions stay where they are.",
  "Dejan de verse las que trajiste a mano. No se borra ninguna.":
    "The ones you brought over stop showing. Nothing is deleted.",
  "Modo rendimiento": "Performance mode",
  "Tu cerebro por defecto": "Your default brain",
  "Que decida Adeorq": "Let Adeorq decide",
  "De fábrica decide Adeorq, mirando lo que exige cada tarea: un renombrado va en haiku y una auditoría en opus. Aquí puedes fijar uno para todo, si prefieres gastar de otra manera. Dos cosas que sigue haciendo igual: la cuota manda (con la semana agotada se abarata lo que se pueda), y una tarea de juicio NO se abarata nunca, porque un ajuste que se pone una vez no puede decidir meses después que una auditoría de seguridad se haga con el modelo barato.":
    "Out of the box Adeorq decides, looking at what each job demands: a rename goes to haiku, an audit to opus. Here you can pin one for everything, if you would rather spend differently. Two things stay the same: quota rules (with the week spent, whatever can be made cheaper is), and a judgement job is NEVER made cheaper, because a setting you pin once cannot decide months later that a security audit runs on the cheap model.",
  "Menos cristal y terminales sólidas, para cuando tengas varios agentes trabajando a la vez. Adeorq apila treinta capas de cristal sobre tu foto y las terminales son transparentes para dejarla ver: eso es lo bonito y es lo que cuesta. Medido con TRES terminales: dibujarlo se lleva dos tercios de un núcleo, sin parar. No cambia nada de lo que Adeorq hace, solo lo que gasta en pintarlo.":
    "Less glass and solid terminals, for when you have several agents working at once. Adeorq stacks thirty glass surfaces over your photo and the terminals are transparent so you can see it: that is the pretty part and that is the expensive part. Measured with THREE terminals: drawing it eats two thirds of a core, non-stop. It changes nothing about what Adeorq does, only what it spends painting it.",
  // Los tres modos del rendimiento, desde que dejó de ser un sí/no (2026-08-09).
  // «Automático» a secas ya vive con los modos de permisos, así que no se repite.
  "Siempre bonita": "Always pretty",
  "Siempre rápida": "Always fast",
  "El cristal se queda mientras va fino y se apaga solo al abrir la cuarta terminal. Al cerrarlas vuelve.":
    "The glass stays while things run smoothly and switches itself off when you open the fourth terminal. Close them and it comes back.",
  "El cristal no se apaga nunca, tengas las terminales que tengas.":
    "The glass never switches off, however many terminals you have.",
  "Sin cristal desde el primer momento, aunque no haga falta.":
    "No glass from the start, even when it is not needed.",
  "Ver el gasto de la cuenta «{acc}»": "See what the “{acc}” account has spent",
  "Todavía no hay trabajo apuntado en esta cuenta.":
    "No work recorded on this account yet.",
  "Volver al orden automático": "Back to automatic order",
  "lo abierto y lo reciente arriba": "open and recent on top",
  "Nueva sesión de Claude Code aquí": "New Claude Code session here",
  "Terminal PowerShell aquí": "PowerShell terminal here",
  "Antigravity (agy) en una terminal aquí": "Antigravity (agy) in a terminal here",
  "Abrir el IDE de Antigravity aquí (su CLI agy no está instalado)":
    "Open the Antigravity IDE here (its agy CLI is not installed)",
  "Renombrar, agrupar o archivar": "Rename, group or archive",
  "Restaurar: vuelve a la lista normal": "Restore: back to the normal list",
  "✎ Renombrar": "✎ Rename",
  "▣ Mover a grupo…": "▣ Move to group…",
  "⊟ Archivar": "⊟ Archive",
  "Grupo nuevo": "New group",
  "Quitar del grupo": "Remove from group",
  "Disolver el grupo (las sesiones no se tocan)":
    "Dissolve the group (sessions are untouched)",
  "Nombre nuevo de la sesión": "New name for the session",
  "Archivar sesión": "Archive session",
  Cancelar: "Cancel",
  Archivar: "Archive",
  "sesión abierta ahora": "session open right now",
  "Abrir sus {n} sesiones a la vez": "Open all {n} sessions at once",
  "Ocultar las sesiones archivadas": "Hide archived sessions",
  "Ver las {n} sesiones archivadas": "Show the {n} archived sessions",
  "Grupos de {p}": "Groups in {p}",
  "C:\\proyectos · sesiones de ~/.claude": "C:\\proyectos · sessions from ~/.claude",

  // Cockpit
  "La cabina está lista.": "The cockpit is ready.",
  "Elige una conversación en la barra de la izquierda para retomarla, o abre una nueva aquí.":
    "Pick a conversation from the left-hand rail to resume it, or start a new one here.",
  "Cada proyecto enseña sus botones al pasar el ratón. Y si algo no cuadra, está la pestaña Guía.":
    "Each project shows its buttons on hover. And if something looks off, there is the Guide tab.",
  "Abrir una sesión…": "Open a session…",
  "Imagen pegada como archivo: el agente la lee de esa ruta. Escribe tu pregunta al lado y Enter.":
    "Image pasted as a file: the agent reads it from that path. Type your question next to it and press Enter.",
  "Claude está comprimiendo la memoria de la charla (normal en sesiones largas): unos segundos y sigue solo.":
    "Claude is compressing the conversation's memory (normal in long sessions): a few seconds and it carries on.",
  "Claude sigue ocupado: lo que escribas ahora queda en cola y se envía solo cuando termine.":
    "Claude is still busy: whatever you type now queues up and is sent when it finishes.",
  "Claude te pide permiso antes de ejecutar esto. Elige:":
    "Claude is asking permission before running this. Choose:",
  "Pregunta si confías en esta carpeta. Es tuya, así que lo normal es la 1:":
    "It asks whether you trust this folder. It's yours, so option 1 is the usual answer:",
  "Cómo retomar la sesión: el resumen gasta menos cuota que la completa.":
    "How to resume the session: the summary uses less quota than the full one.",
  "La terminal te pregunta algo: elige una opción (Esc en el teclado cancela).":
    "The terminal is asking something: pick an option (Esc on the keyboard cancels).",
  "✦ Claude": "✦ Claude",
  "◈ Antigravity": "◈ Antigravity",
  ">_ shell": ">_ shell",
  "Cerrar terminal": "Close terminal",
  "Tapar esta terminal (para emitir)": "Cover this terminal (for streaming)",
  "Mostrar esta terminal": "Show this terminal",
  "terminal tapada": "terminal covered",
  "Reconectar (abre el navegador)": "Reconnect (opens the browser)",
  "Claude necesita reconectar tu cuenta (el acceso caducó).":
    "Claude needs to reconnect your account (access expired).",
  "Ocultar aviso": "Hide notice",
  "Ocultar aviso (vuelve si la sesión sigue creciendo)":
    "Hide notice (it comes back if the session keeps growing)",
  "[proceso terminado]": "[process finished]",

  // El espejo de cambios de una rama.
  "No hay cambios propuestos en esta rama todavía.":
    "No changes proposed on this branch yet.",
  "Las modificaciones que haga la IA se verán aquí en tiempo real.":
    "Whatever the AI edits will show up here as it happens.",
  "Sin diferencias en este archivo": "No differences in this file",

  // Skills
  Skills: "Skills",
  "Buscar skill": "Search skill",
  "Arrastra uno sobre una terminal para pegarlo, o clic para mandarlo al pane activo.":
    "Drag one onto a terminal to paste it, or click to send it to the active pane.",

  // Foreman
  "✦ Capataz": "✦ Foreman",
  Planear: "Plan it",
  "Pensando el plan…": "Thinking the plan…",
  Descartar: "Discard",
  "Otro pedido": "Another request",
  Cerrar: "Close",
  "Enter planea · Esc cierra · nada se ejecuta sin tu OK":
    "Enter plans · Esc closes · nothing runs without your OK",
  "Hecho: mira la Cabina.": "Done: check the Cockpit.",
  "El Capataz no propuso acciones para ese pedido.":
    "The Foreman proposed no actions for that request.",

  // Qué hace cada uno de los dos oficios del Asistente. Los botones se llaman
  // «Planear» y «Escribir el encargo», que dicen QUÉ hacen pero no en qué se
  // diferencian; eso se cuenta aquí, al pasar el ratón (Munir, 2026-08-09:
  // «hacerlo más claro qué puede hacer el asistente»).
  "Monta el tablero: mira tus proyectos y tus sesiones y te propone qué abrir y con qué cerebro. Nada se ejecuta hasta que lo apruebes.":
    "Builds the board: it looks at your projects and sessions and proposes what to open and with which brain. Nothing runs until you approve it.",
  "No abre nada: convierte lo que has dicho en el encargo que necesita leer el agente de la terminal que tienes delante, y te lo deja escrito ahí. No lo envía.":
    "Opens nothing: it turns what you said into the brief the agent in the terminal in front of you needs to read, and leaves it typed there. It does not send it.",

  // Updates
  "Actualizar ahora": "Update now",
  "Ahora no": "Not now",
  Reiniciar: "Restart",
  "Listo. Reinicia para estrenar la versión nueva.":
    "Ready. Restart to get the new version.",
  "No pude actualizar": "Could not update",
  "Descargando la actualización…": "Downloading the update…",
  "Hay una versión nueva de Adeorq": "There is a new version of Adeorq",

  // Settings
  Idioma: "Language",
  "El idioma de la app. Las terminales siguen hablando lo que hable cada agente.":
    "The app's language. Terminals still speak whatever each agent speaks.",
  Español: "Spanish",
  Inglés: "English",
  "Como el sistema": "Match system",
  Tema: "Theme",
  "El color de la casa. El cristal y el desenfoque se mantienen.":
    "The house colour. Glass and blur stay put.",
  Terminales: "Terminals",
  "Tamaño de la letra": "Font size",
  "Cuántas sesiones abre de golpe un proyecto":
    "How many sessions a project opens at once",
  "Cada sesión es un programa aparte: unos 200 MB cada una.":
    "Each session is a separate program: about 200 MB each.",
  "Modo de permisos": "Permission mode",
  "Con qué modo nace cada terminal de Claude nueva. Se puede pasar a otro dentro de la sesión con Mayús+Tab; esto solo decide cómo empieza.":
    "Which mode each new Claude terminal is born in. You can switch to another one mid-session with Shift+Tab; this only decides how it starts.",
  "Ediciones automáticas": "Auto-accept edits",
  "Modo plan": "Plan mode",
  Manual: "Manual",
  Automático: "Automatic",
  "Solo lo aprobado": "Only what is approved",
  "Sin comprobaciones": "No checks",
  "Lee, edita archivos y usa comandos de carpeta corrientes (mkdir, mover, copiar…) sin preguntar; lo demás sigue pidiendo tu OK. Es el modo de hoy.":
    "Reads, edits files and runs everyday folder commands (mkdir, move, copy…) without asking; everything else still asks for your OK. It is today's mode.",
  "Solo lee: enseña un plan antes de tocar nada. Para mirar un proyecto antes de meterle mano.":
    "Reads only: shows a plan before touching anything. For looking a project over before changing it.",
  "Pregunta antes de cada lectura, edición o comando. El más lento y el más vigilado.":
    "Asks before every read, edit or command. The slowest and most watched one.",
  "Todo, con un vigilante en segundo plano que frena lo que no encaje con la tarea. Para tareas largas sin estar pendiente.":
    "Everything, with a background watcher that stops whatever does not fit the task. For long jobs without babysitting them.",
  "Solo las herramientas que ya tengas aprobadas; cualquier otra falla en vez de preguntar. Pensado para scripts y automatizaciones.":
    "Only the tools you already approved; anything else fails instead of asking. Meant for scripts and automation.",
  "Todo sin ninguna comprobación. Solo para un contenedor o una máquina virtual aislada, nunca en tu equipo normal.":
    "Everything with no checks at all. Only for an isolated container or virtual machine, never on your normal machine.",
  Actualizaciones: "Updates",
  // Ajustes › Ayuda, que es donde vive ahora la guía (ya no es una pestaña).
  Ayuda: "Help",
  Documentación: "Documentation",
  "Abrir la documentación": "Open the documentation",
  "Descargas y versiones": "Downloads and versions",
  "La documentación de Adeorq en la web: se abre en tu navegador, se lee desde cualquier sitio y siempre está al día, sin esperar a una actualización de la app.":
    "Adeorq's documentation on the web: it opens in your browser, reads anywhere, and is always current without waiting for an app update.",
  "Versión instalada": "Installed version",
  "Buscar actualizaciones": "Check for updates",
  "Buscando…": "Checking…",
  "Ya tienes la última versión.": "You already have the latest version.",
  "Comprueba sola al arrancar y cada 6 horas.":
    "It checks on start and every 6 hours by itself.",
  "Sobre Adeorq": "About Adeorq",
  "Cargando la guía…": "Loading the guide…",
  "No pude leer la guía": "Could not read the guide",
  "Contexto": "Context",
  "Cuánto tapa lo que hay detrás": "How much it covers what is behind",
  "El color de las terminales": "The colour of the terminals",
  "Buscar un tema": "Search themes",
  // Elegir el cerebro a mano, en el Reparto.
  "Qué cerebro le pones": "Which brain it gets",
  "lo que decida el router": "whatever the router decides",
  "Lo eligió el router. Pulsa para llevarle la contraria.":
    "The router picked this. Click to overrule it.",
  "Lo elegiste tú. Pulsa para cambiarlo o volver al automático.":
    "You picked this. Click to change it or go back to automatic.",
  "Apagón": "Blackout",
  "Negro sólido detrás de las terminales, aunque tengas fondo puesto. Para cuando lo que hay debajo estorba a lo que estás leyendo. No toca el resto de la app: para eso está el tema «Negro absoluto».":
    "Solid black behind the terminals, even with a backdrop set. For when what is underneath gets in the way of what you are reading. It leaves the rest of the app alone: that is what the \"Pure black\" theme is for.",
  "Los dieciséis colores con los que los programas pintan dentro de la terminal, aparte del tema de la casa: el tema es el mueble y esto es la letra que lees ocho horas. El fondo no lo toca, para que las terminales sigan siendo cristal sobre tu fondo.":
    "The sixteen colours programs paint with inside the terminal, kept apart from the app's theme: the theme is the furniture, this is the type you read for eight hours. It leaves the background alone, so terminals stay glass over your own backdrop.",
  // La Memoria: el segundo cerebro.
  "Tu memoria": "Your memory",
  "Buscar en tus notas": "Search your notes",
  "Dónde vive tu memoria": "Where your memory lives",
  "Elegir la carpeta": "Choose the folder",
  "Cambiar carpeta": "Change folder",
  "Cambiar bóveda": "Change vault",
  "Buscar otra carpeta…": "Find another folder…",
  "documento": "document",
  "Volver a leer la carpeta": "Read the folder again",
  "Documento": "Document",
  "Constelación": "Constellation",
  "Volver al mapa de la bóveda": "Back to the vault map",
  "Solo los que tienen enlaces": "Only the linked ones",
  "Abrir fuera": "Open outside",
  "Editar": "Edit",
  "Ver": "View",
  "Guardando…": "Saving…",
  "Leyendo…": "Reading…",
  "Limpiar": "Clear",
  "Lleva a": "Leads to",
  "Llegan desde": "Arrive from",
  "Nada con esas palabras.": "Nothing with those words.",
  "Ningún markdown en esa carpeta.": "No markdown in that folder.",
  "Elige una nota de la izquierda, o busca lo que quieras recordar.":
    "Pick a note on the left, or search for whatever you want to remember.",
  "Es una bóveda de Obsidian: se lee tal cual, sin tocar nada.":
    "It is an Obsidian vault: read as it is, nothing touched.",
  "Carpeta de markdown corriente: se lee igual.":
    "A plain markdown folder: read just the same.",
  "Tus notas, dentro de Adeorq. Se leen donde están: no se copia nada, no se mueve nada, y tu bóveda se sigue abriendo con Obsidian igual que siempre.":
    "Your notes, inside Adeorq. They are read where they live: nothing is copied, nothing is moved, and your vault still opens in Obsidian exactly as before.",
  "Carpetas": "Folders",
  "Recientes": "Recent",
  "Esta es tu bóveda de Obsidian": "This is your Obsidian vault",
  "Estas son tus bóvedas de Obsidian": "These are your Obsidian vaults",
  "la que tienes abierta": "currently open",
  "Señalar otra carpeta": "Point to another folder",
  "Vale cualquier carpeta con markdown dentro, sea de Obsidian o no.":
    "Any folder with markdown inside will do, Obsidian or not.",
  "Rueda para acercar · arrastra para mover · con Shift, gira · clic en un punto para abrirlo":
    "Wheel to zoom · drag to pan · hold Shift to spin it · click a dot to open it",
  "documentos": "documents",
  "con enlaces": "with links",
  "en la raíz": "at the root",
  "resultado": "result",
  "resultados": "results",
  "enlace": "link",
  "enlaces": "links",
  "de memoria": "of memory",
  "proceso": "process",
  "procesos": "processes",
  "Es el árbol entero de esta terminal, no solo su primer proceso.":
    "That is this terminal's whole process tree, not just its first process.",
  "los pone el agente de dentro, no Adeorq": "come from the agent inside, not from Adeorq",
  "Fijar arriba": "Pin to the top",
  "Quitar de arriba": "Unpin",
  "Fijadas": "Pinned",
  "Compartir mis skills": "Share my skills",
  "Skills: compartidas ({n})": "Skills: shared ({n})",
  "Deja de ver las skills de tu cuenta principal. No se borra ninguna.":
    "Stops showing your main account's skills. None of them are deleted.",
  "Es la MISMA carpeta, no una copia: lo que escribas lo verán todas tus cuentas, y lo que borres se borrará para todas.":
    "It is the SAME folder, not a copy: whatever you write shows up in every account, and whatever you delete is gone from all of them.",
  "de contexto usado": "of context used",
  "Uso semanal": "Weekly usage",
  "Tu cuota": "Your quota",
  "Cuánto uso de tu suscripción llevas esta semana. Solo lo sabe Claude por dentro, así que el botón escribe /usage en la terminal que tengas activa y te lleva allí.":
    "How much of your subscription you have used this week. Only Claude knows it internally, so this button types /usage into your active terminal and takes you there.",
  "Ver mi uso semanal": "Show my weekly usage",
  "Abre antes una sesión de Claude en la Cabina.":
    "Open a Claude session in the Cockpit first.",
  Copiar: "Copy",
  Comandos: "Commands",
  Todos: "All",
  "Todo lo que puedes escribir dentro de cada agente. Busca por lo que quieres hacer, no por cómo se llama.":
    "Everything you can type inside each agent. Search by what you want to do, not by its name.",
  "Buscar: contexto, cuota, deshacer, seguridad…":
    "Search: context, quota, undo, security…",
  "Clic en un comando y se escribe en la terminal activa (tú le das Enter).":
    "Click a command and it is typed into the active terminal (you press Enter).",
  "Abre una terminal en la Cabina y podrás mandarlos con un clic.":
    "Open a terminal in the Cockpit to send them with one click.",
  "Nada con ese nombre. Prueba con otra palabra.":
    "Nothing by that name. Try another word.",
  Pausar: "Pause",
  Reanudar: "Resume",
  "Canción anterior": "Previous track",
  "Siguiente canción": "Next track",
  Modelo: "Model",
  Pegar: "Paste",
  "Partir a la derecha": "Split right",
  "Partir abajo": "Split down",
  Maximizar: "Maximise",
  Restaurar: "Restore",
  "Retomar la sesión aquí": "Resume the session here",
  "Abrir en Antigravity": "Open in Antigravity",

  "Soltar aquí para intercambiar": "Drop here to swap",
  "Soltar para colocarla a este lado": "Drop to place it on this side",

  // Usage
  "Tu uso": "Your usage",
  "esta semana": "this week",
  sesiones: "sessions",
  "Tokens de cada uno de los últimos 7 días": "Tokens for each of the last 7 days",
  "Trabajo hecho, leído de tus propias estadísticas. El porcentaje de tu suscripción solo lo sabe Claude por dentro:":
    "Work done, read from your own stats. Only Claude knows your subscription percentage:",
  "Abre una terminal de Claude para pedirlo.": "Open a Claude terminal to ask for it.",

  "Límites del plan": "Plan limits",
  "Trabajo de la semana": "This week's work",
  "Volver a preguntar (no gasta cuota)": "Ask again (costs no quota)",
  "Preguntando a Claude…": "Asking Claude…",
  "No pude leerlos": "I could not read them",
  "Ver la tarjeta entera en la terminal": "See the full card in the terminal",
  "se renueva": "renews",
  "Actualizar límites": "Refresh limits",
  "Los límites llegan de Claude: pulsa para pedirlos de nuevo.":
    "The limits come from Claude: press to ask again.",
  "Trabajo hecho, leído de tus propias estadísticas. Los límites de tu plan solo los sabe Claude: pídelos aquí.":
    "Work done, read from your own stats. Only Claude knows your plan's limits: ask for them here.",

  // Notifications
  Avisos: "Notifications",
  "Solo en segundo plano": "Only in the background",
  Siempre: "Always",
  Nunca: "Never",
  "Aviso de Windows cuando un agente termina su turno o cuando espera tu OK, con el icono parpadeando en la barra de tareas. Nunca avisa del panel que estás mirando.":
    "A Windows notification when an agent finishes its turn or waits for your OK, with the taskbar icon flashing. Never for the pane you are already looking at.",

  // Layout
  Disposición: "Layout",
  "Repartir las terminales en una plantilla": "Deal the terminals into a template",
  "Reparte lo que tienes abierto": "Re-deal what you have open",
  "Arrastra la barra de una terminal sobre otra para intercambiarlas, y los bordes entre ellas para repartir el espacio.":
    "Drag a terminal's bar onto another to swap them, and the seams between them to share out the space.",
  "Arrastra para repartir el ancho": "Drag to share out the width",
  "Arrastra para repartir el alto": "Drag to share out the height",
  "Una sola": "Just one",
  "Dos columnas": "Two columns",
  "Tres columnas": "Three columns",
  "Grande a la izquierda": "Big on the left",
  "Grande a la derecha": "Big on the right",
  "Cuadrícula 2x2": "2x2 grid",
  "Cuadrícula 2x3": "2x3 grid",
  "Dos y una partida": "Two, and one split",
  "La pared de nueve": "The wall of nine",
  "Cuadrícula 4x2": "4x2 grid",
  "Cuatro columnas": "Four columns",
  "Una grande y tres al lado": "One big, three beside it",

  // Restore
  "Recuperar las terminales al abrir": "Bring the terminals back on start",
  "Saltar a la sesión que termina, a pantalla completa":
    "Jump to the session that finishes, full screen",

  // Los atajos del lienzo. Las etiquetas de las acciones llegan a t() desde
  // `lib/atajos`, así que el revisor no las ve pasar: van a mano.
  "Atajos del lienzo": "Canvas shortcuts",
  // Los títulos de cada grupo del panel de dibujo, que desde el 2026-08-09 va
  // de pie y con etiquetas en vez de ser una tira de iconos mudos.
  Relleno: "Fill",
  Forma: "Shape",
  Transparencia: "Opacity",
  Efecto: "Effect",
  "Al dibujar": "While drawing",
  Orden: "Order",
  Acciones: "Actions",
  // Los tres controles de dibujo que llegaron con lo de Excalidraw (2026-08-09).
  "Relleno: macizo, rayado o cruzado": "Fill: solid, hachure or cross-hatch",
  "Esquinas: redondeadas o vivas": "Corners: rounded or sharp",
  "Línea recta o curva": "Straight or curved line",
  // Los tres lienzos (2026-08-09). «Terminales» ya está traducido más arriba.
  Dibujo: "Drawing",
  // «Todo» a secas ya vive más abajo, con los filtros de Comandos: no se repite.
  "Solo el trabajo: terminales y piezas, sin nada de dibujo. Tus trazos no se borran, vuelven al cambiar de modo.":
    "Work only: terminals and pieces, no drawing at all. Your strokes are not deleted, they come back when you switch mode.",
  "La pizarra: todas las herramientas y tus trazos. Las piezas se ven para poder anotarlas, pero no se arrastran.":
    "The whiteboard: every tool and all your strokes. Pieces stay visible so you can annotate them, but they cannot be dragged.",
  "Las dos cosas a la vez, como siempre.": "Both at once, as always.",
  // La rejilla del lienzo (2026-08-09). Los puntos del fondo llevaban ahí desde
  // el principio sin sujetar nada; ahora se pueden encender.
  "Rejilla puesta: todo cae en una casilla. Púlsalo para moverlo libre otra vez.":
    "Grid on: everything lands on a cell. Click to move things freely again.",
  "Poner la rejilla: lo que muevas cae en la casilla más cercana, terminales y dibujo. Los puntos del fondo son las casillas.":
    "Turn the grid on: whatever you move lands on the nearest cell, terminals and drawings alike. The dots in the background are the cells.",

  // El fondo de detrás de las terminales
  "El fondo": "The background",
  "Lo que se ve detrás de las terminales. Los paneles ya son cristal, así que debajo había un color plano desaprovechado. Vale una imagen o un vídeo, que se pone en bucle y sin sonido. El archivo se copia a la carpeta de Adeorq, así que el fondo no se rompe si luego mueves el original.":
    "What you see behind the terminals. The panes are already glass, so underneath there was a flat colour going to waste. An image or a video will do, looping and muted. The file is copied into Adeorq's folder, so the background does not break if you move the original later.",
  "Elegir un fondo…": "Pick a background…",
  "Cambiar el fondo…": "Change the background…",
  Quitarlo: "Remove it",
  "Cuánto se ve": "How much shows",
  Desenfoque: "Blur",
  "Si cuesta leer las terminales, baja «cuánto se ve» o sube el desenfoque: el texto manda sobre la foto.":
    "If the terminals get hard to read, lower «how much shows» or raise the blur: the text outranks the picture.",

  // Cuando una página se niega a abrirse dentro del lienzo
  "Esta página no se deja abrir aquí dentro": "This page refuses to open in here",
  "No es cosa de Adeorq: lo decide la propia web con una cabecera, y ningún navegador se la salta. Ábrela fuera y sigue aquí con lo demás.":
    "It is not Adeorq's doing: the site decides it with a header, and no browser gets around it. Open it outside and carry on here with the rest.",
  "Abrirla en tu navegador": "Open it in your browser",

  // El dictado, ahora por atajo y con su REC
  "REC · grabando, Ctrl+Mayús+M para parar": "REC · recording, Ctrl+Shift+M to stop",
  "Transcribiendo…": "Transcribing…",
  "Enter planea · Ctrl+Mayús+M dicta · Esc cierra · nada se ejecuta sin tu OK":
    "Enter plans · Ctrl+Shift+M dictates · Esc closes · nothing runs without your OK",

  // El Capataz que escribe encargos, y el micrófono
  "Escribir el encargo": "Write the brief",
  "Escribir y ponerlo": "Write it and put it in",
  "Escribiendo…": "Writing…",

  // El modo automático: aplica la receta en vez de enseñarla. Nunca envía.
  // («Automático» a secas ya está arriba, en la pastilla del Reparto.)
  "Automático: en vez de enseñarte la ficha, ajusta el cerebro y deja el encargo escrito en la terminal de delante. No lo envía.":
    "Automatic: instead of showing you the card, it sets the brain and leaves the brief typed in the terminal in front of you. It does not send it.",
  "Automático puesto: aplica el cerebro que toque y deja el encargo escrito, sin enseñarte la ficha. No lo envía.":
    "Automatic is on: it applies whichever brain fits and leaves the brief typed, without showing you the card. It does not send it.",
  "sin cambiar el cerebro": "brain left as it was",
  "Quitar este aviso": "Dismiss this note",
  "Para la terminal que tienes delante": "For the terminal in front of you",
  Copiarlo: "Copy it",

  // La ficha del encargo: a quién se le da y con qué cerebro (lib/router.ts).
  // Los PORQUÉS que salen debajo se generan en español y no pasan por aquí,
  // igual que los encargos del Capataz: la casa ya decidió que lo que se le
  // dice a un agente va siempre en español.
  "El encargo": "The brief",
  "Para quién": "Who gets it",
  Cambiarlo: "Change it",
  "Ponerlo en esta terminal": "Put it in this terminal",
  "Abrir una nueva así": "Open a new one like this",
  "Lo recomendado para esta tarea": "What this task calls for",
  "{n} veces el peso de haiku": "{n} times haiku's weight",
  "Cuánto se lo piensa antes de responder": "How long it thinks before answering",
  "Esa terminal es de otro CLI: ábrela nueva": "That terminal is another CLI: open a new one",
  "Ajusta el panel de delante y deja el encargo escrito, sin enviarlo":
    "Sets up the pane in front of you and types the brief, without sending it",
  "Abre una terminal nueva ya nacida con ese cerebro":
    "Opens a new terminal born on that brain",
  "Seguir en otra cuenta": "Continue on another account",
  "con acta": "with a handover",
  "Abre una terminal con esa cuenta y le deja escrito dónde ibas, para que no empieces de cero":
    "Opens a terminal on that account and types where you were, so you do not start over",
  "Abre {n} agentes": "Opens {n} agents",
  "Peso relativo, tomando haiku como 1": "Relative weight, with haiku as 1",
  "te queda un {p} % de semana": "you have {p}% of the week left",
  "Cuando el cerebro no cuadra": "When the brain does not fit",
  "El vigía de las cuadrillas": "The crew lookout",
  "Con una cuadrilla abierta, mira cada minuto quién ha terminado, quién lleva rato esperándote y si alguien anda tocando los archivos de otro. Cuando algo lo merece deja una línea en la bandeja de la Agenda, para que la aceptes o la descartes. Nunca escribe en una terminal ni abre ni cierra nada.":
    "With a crew open, it checks every minute who has finished, who has been waiting on you for a while, and whether anyone is touching someone else's files. When something is worth it, it leaves a line in the Agenda tray for you to accept or discard. It never types into a terminal and never opens or closes anything.",
  "Solo lo gordo": "Only the big stuff",
  "Todo lo que vea": "Everything it sees",
  "Al preparar un encargo, el Asistente mira con qué modelo está la terminal que tienes delante. Si es mucho más caro de lo que la tarea necesita (o mucho más flojo), te lo dice.":
    "When preparing a brief, the Assistant looks at which model the terminal in front of you is running. If it is far pricier than the task needs (or far weaker), it says so.",
  "Mantén pulsado y habla. Al soltar, lo escribe aquí.":
    "Hold and speak. Let go and it writes it here.",

  // Qué se abre de un clic desde cada proyecto
  "Atajos en tus proyectos": "Shortcuts on your projects",
  "Los botones que salen al pasar el ratón por un proyecto en la barra lateral. Elige los que uses de verdad: los demás siguen estando en el clic derecho, que los lista todos.":
    "The buttons that appear when you hover a project in the sidebar. Pick the ones you actually use: the rest stay in the right-click menu, which lists them all.",

  // La cuenta de OpenRouter, en el centro de cuentas
  "Por clave": "By key",
  Conectar: "Connect",
  "Comprobando…": "Checking…",
  "Olvidar la clave": "Forget the key",
  "Te queda": "You have left",
  "Tope de la clave": "Key limit",
  "sin tope": "no limit",
  Hoy: "Today",
  "Esta semana": "This week",
  "Este mes": "This month",
  gratis: "free",
  "de pago": "paid",
  "Una sola clave y hablas con todos los modelos que tenga OpenRouter. Se guarda cifrada en el Gestor de Credenciales de Windows, nunca en un archivo de ajustes, y no vuelve a salir de ahí: aquí solo se piden los datos de consumo.":
    "One key and you can talk to every model OpenRouter carries. It is stored encrypted in the Windows Credential Manager, never in a settings file, and it never comes back out: this screen only asks for the usage figures.",

  // Todas tus sesiones en la Agenda, y el modelo local que las resume
  "🗂 Todas tus sesiones": "🗂 All your sessions",
  "Lo que tienes vivo ahora mismo, lo que te espera primero. El estado sale del disco y es exacto; la línea de debajo la escribe tu modelo local, solo para las que te esperan.":
    "What you have alive right now, whatever is waiting on you first. The state comes from disk and is exact; the line underneath is written by your local model, only for the ones waiting on you.",
  "Retomar esta sesión aquí": "Resume this session here",
  "mirando…": "reading…",
  "te pregunta": "is asking you",
  "espera tu OK": "waiting for your OK",
  "a medias": "half done",
  "sin saber": "unknown",
  "Tu modelo local": "Your local model",
  "En la Agenda, quién te espera sale del disco y es exacto: eso funciona siempre. Lo que no se puede saber sin leer es QUÉ te está preguntando cada sesión, y esa línea la escribe un modelo que corre en tu propio ordenador (Ollama), sin gastar cuota de nadie. Elige uno pequeño: es una frase, no un ensayo.":
    "In the Agenda, who is waiting on you comes from disk and is exact: that always works. What cannot be known without reading is WHAT each session is asking you, and that line is written by a model running on your own machine (Ollama), spending nobody's quota. Pick a small one: it is a sentence, not an essay.",
  "Mirando si Ollama está abierto…": "Checking whether Ollama is open…",
  "⚠ Ollama no responde en 127.0.0.1:11434. Ábrelo y vuelve a esta pantalla; hasta entonces la Agenda funciona igual, solo que sin esa línea.":
    "⚠ Ollama is not answering on 127.0.0.1:11434. Open it and come back to this screen; until then the Agenda works the same, just without that line.",
  Ninguno: "None",

  // El panel del proyecto, al pasar el ratón
  "Cambiar el nombre que se ve": "Change the shown name",
  "Cambiar su logo": "Change its logo",
  "Ponerle un logo": "Give it a logo",
  "Ver las archivadas": "Show the archived ones",
  "Quitar de Adeorq: sale de la barra, la carpeta no se toca":
    "Remove from Adeorq: it leaves the rail, the folder is not touched",
  "Borrar su carpeta del disco: se va a la papelera de Windows":
    "Delete its folder from disk: it goes to the Windows recycle bin",

  // Quitar un proyecto de la barra. Nada de esto toca el disco.
  "Quitar de Adeorq": "Remove from Adeorq",
  "no borra nada": "deletes nothing",
  Ocultos: "Hidden",
  "Devolverlo a la barra": "Put it back in the rail",
  "Sus carpetas siguen en el disco, intactas.":
    "Their folders are still on disk, untouched.",

  // Borrar la CARPETA de un proyecto. Se llamaba «tirar el proyecto», y por ese
  // nombre se fueron diecisiete carpetas de C:\proyectos el 31-jul-2026 sin que
  // nadie recordara haberlas borrado: aquí nada dice «proyecto» a secas.
  "Borrar la carpeta del disco…": "Delete the folder from disk…",
  "Borrar la carpeta del disco": "Delete the folder from disk",
  "Esto borra del disco la CARPETA de «{n}», con todo lo que tenga dentro. Va a la papelera de Windows, así que se recupera desde el escritorio, pero deja de estar en su sitio y lo que la use dejará de encontrarla.":
    "This deletes «{n}»'s FOLDER from disk, with everything inside it. It goes to the Windows recycle bin, so you can get it back from the desktop, but it stops being where it was and anything using it will no longer find it.",
  "⚠ Tiene {n} sesiones de Claude. Sus conversaciones NO se borran: viven en tu carpeta de Claude, no en esta. Pero se quedarán apuntando a una carpeta que ya no está.":
    "⚠ It has {n} Claude sessions. Their conversations are NOT deleted: they live in your Claude folder, not this one. But they will be left pointing at a folder that is gone.",
  "Si lo que quieres es dejar de verlo en la barra, no hace falta borrar nada:":
    "If all you want is to stop seeing it in the rail, nothing needs deleting:",
  "Quitar de Adeorq, sin tocar la carpeta": "Remove from Adeorq, leaving the folder alone",
  "Escribe «{n}» para confirmar:": "Type «{n}» to confirm:",
  "Borrar la carpeta": "Delete the folder",

  // El modo chat: las mismas sesiones, leídas como conversación.
  "Nueva conversación": "New conversation",
  "Buscar conversaciones…": "Search conversations…",
  "Ninguna conversación con esas palabras.": "No conversation matches those words.",
  "Todavía no hay conversaciones. Empieza una con el botón de arriba.":
    "No conversations yet. Start one with the button above.",
  Limpio: "Clean",
  // El selector del cerebro. Cada uno con PARA QUÉ es, que es lo único que
  // ayuda a elegir; pasan por `t(c.para)`, así que el revisor no los ve.
  "lo elige el router según la tarea y tu semana":
    "the router picks it from the task and how much week you have left",
  "recados: renombrar, traducir, formatear": "errands: renaming, translating, formatting",
  "el día a día: escribir, refactorizar, probar":
    "the daily craft: writing, refactoring, testing",
  "juicio: seguridad, revisión, bugs difíciles":
    "judgement: security, review, hard bugs",
  "lo más caro que hay; solo si sabes por qué":
    "the most expensive there is; only if you know why",
  "{u} de {w} tokens usados": "{u} of {w} tokens used",
  "{n} archivos sin guardar": "{n} unsaved files",
  "todo guardado": "all committed",
  "sin plan detectado": "no plan detected",
  // Lo que la referencia llama «Live Ask». Lo que dice de verdad es que lo que
  // escribas ahora entra en cuanto termine lo que está haciendo.
  "Se lo digo ahora: entra en cuanto termine lo de ahora":
    "Queued: it goes in as soon as the current one finishes",
  "Añade algo más: se lo paso a continuación…": "Add something else: it goes in next…",
  "Releer la conversación": "Re-read the conversation",
  "Esta conversación todavía no tiene nada escrito.":
    "Nothing has been written in this conversation yet.",
  "Escribe aquí. Enter envía, Mayús+Enter hace un párrafo.":
    "Type here. Enter sends, Shift+Enter starts a paragraph.",
  "Lo que pesa: {p}": "What it weighs: {p}",
  "Elige una conversación a la izquierda.": "Pick a conversation on the left.",
  "Son tus sesiones de siempre, las mismas de la Cabina: aquí se leen como una conversación en vez de como una consola, y lo que escribas va a la misma terminal.":
    "These are your usual sessions, the same ones as in the Cockpit: here they read as a conversation instead of a console, and whatever you type goes to that same terminal.",
  "sin título": "untitled",
  // «Hoy», «Esta semana» y «Este mes» ya están arriba, con los cajones de la
  // Agenda: los mismos cajones de tiempo, el mismo texto.
  Ayer: "Yesterday",
  "Más atrás": "Further back",

  // El cajón de las sesiones que no son de ningún proyecto
  Sueltas: "Loose ones",

  // El despliegue del Capataz, visto como un grupo
  "revisión": "review",
  "un despliegue": "a deployment",
  "Las teclas del lienzo, y puedes cambiarlas: pulsa el atajo de una acción y luego la combinación que quieras. Solo actúan con el lienzo delante y con el foco fuera de una terminal, así que nunca le quitan una tecla a lo que estés escribiendo. Los de abrir cosas van con Alt porque dentro de una terminal Ctrl+letra es del programa que corre ahí.":
    "The canvas keys, and you can change them: click an action's shortcut and then press whatever combination you want. They only fire with the canvas in front and the focus outside a terminal, so they never take a key away from what you are typing. The ones that open things use Alt because inside a terminal Ctrl+letter belongs to the program running there.",
  "pulsa la tecla…": "press the key…",
  "sin atajo": "no shortcut",
  "Dejarlo sin atajo": "Leave it with no shortcut",
  "Volver a los de fábrica": "Back to the factory ones",
  "Esc para dejarlo como estaba": "Esc to leave it as it was",
  "Abrir cosas": "Opening things",
  "Poner piezas": "Placing pieces",
  "Coger y soltar": "Picking and dropping",
  Dibujar: "Drawing",
  "Abrir un Claude": "Open a Claude",
  "Abrir una terminal": "Open a terminal",
  "Abrir un Antigravity": "Open an Antigravity",
  "Poner una nota": "Place a note",
  "Poner una ventana de localhost": "Place a localhost window",
  "Abrir la galería": "Open the gallery",
  "Soltar lo cogido": "Drop what is picked",
  "Borrar lo cogido": "Delete what is picked",
  "Herramienta: la mano": "Tool: the hand",
  "Herramienta: el marco": "Tool: the lasso",
  "Herramienta: el lápiz": "Tool: the pencil",
  "Herramienta: la flecha": "Tool: the arrow",
  "Herramienta: la línea": "Tool: the line",
  "Herramienta: el recuadro": "Tool: the box",
  "Herramienta: la elipse": "Tool: the ellipse",
  "Herramienta: el texto": "Tool: the text",
  "Herramienta: la goma": "Tool: the eraser",
  Deshacer: "Undo",
  Rehacer: "Redo",
  "Relleno: hueca, translúcida o maciza": "Fill: hollow, see-through or solid",
  "Dibujar a mano alzada": "Draw it freehand",
  "Traer al frente": "Bring to front",
  "Enviar al fondo": "Send to back",

  // Editar el dibujo: el estilo que faltaba y lo que se hace con lo cogido.
  "Línea: entera, a guiones o a puntos": "Line: solid, dashed or dotted",
  "Transparencia: opaco, medio o fantasma": "Transparency: solid, half or ghost",
  "Las puntas de la línea": "The ends of the line",
  "Sin punta": "No head",
  "Punta abierta": "Open head",
  "Punta maciza": "Solid head",
  "al final": "at the end",
  "al principio": "at the start",
  Duplicar: "Duplicate",
  "Clavar al tablero": "Pin to the board",
  "Agrupar o desagrupar": "Group or ungroup",
  "Alinear y repartir": "Align and spread",
  "A la izquierda": "To the left",
  "Centrados a lo ancho": "Centred across",
  "A la derecha": "To the right",
  Arriba: "Top",
  "Centrados a lo alto": "Centred down",
  Abajo: "Bottom",
  "Repartir a lo ancho": "Spread across",
  "Repartir a lo alto": "Spread down",
  "Dibujo guardado en {r}": "Drawing saved to {r}",
  "No hay nada dibujado que exportar": "There is nothing drawn to export",
  "Copiar lo cogido": "Copy what you picked",
  "Duplicar lo cogido": "Duplicate what you picked",
  "Copiar el estilo": "Copy the style",
  "Pegar el estilo": "Paste the style",
  "Exportar el dibujo": "Export the drawing",
  "Editar el dibujo": "Edit the drawing",
  "Exportar el dibujo a PNG": "Export the drawing to PNG",
  "Exportar el dibujo a SVG": "Export the drawing to SVG",

  // Retomar sesiones desde el asistente del ＋.
  "↻ Retomar las que ya tienes…": "↻ Resume the ones you already have…",
  "Tus conversaciones, las de esta semana y las de antes. Las que marques aparecen en la barra de la izquierda, listas para abrirlas cuando quieras.":
    "Your conversations, this week's and the older ones. Whatever you tick shows up in the left-hand rail, ready to open whenever you want.",
  "Buscar por título, proyecto o carpeta": "Search by title, project or folder",
  "Leyendo tus sesiones…": "Reading your sessions…",
  "{n} elegidas de {total}": "{n} of {total} picked",
  "{n} sesiones": "{n} sessions",
  Todas: "All",
  "Las {n} primeras": "The first {n}",
  // La mini guía del Asistente: qué se le puede pedir, con ejemplos que se
  // pulsan. Las etiquetas pasan por t() a través de una variable, así que el
  // comprobador no las ve: van aquí a mano y hay que acordarse al tocarlas.
  "Repartir las {n} tareas": "Split up the {n} tasks",
  // El texto de dentro del cuadro del Asistente. Se quedó sin traducir hasta
  // que Munir abrió la app en inglés y vio media pantalla en español.
  'Pídeme el tablero: "ábreme las sesiones del panel de Orquio" o "en Layco: Antigravity al frontend y un Claude al backend para el formulario de pago"':
    'Ask me for the board: "open the sessions of the Orquio dashboard" or "in Layco: Antigravity on the frontend and a Claude on the backend for the payment form"',
  "Háblame normal. Puedo, por ejemplo:": "Talk to me normally. I can, for instance:",
  "Una línea es un encargo. Varias líneas, una terminal para cada una.":
    "One line is one errand. Several lines, one terminal each.",
  "Abrir lo que ya tienes": "Open what you already have",
  "ábreme las sesiones del panel de Orquio": "open the sessions of the Orquio dashboard",
  "Montar un equipo": "Put a team together",
  "en Layco: Antigravity al frontend y un Claude al backend":
    "in Layco: Antigravity on the frontend and a Claude on the backend",
  "Mandar una orden a todas": "Send one order to all of them",
  "diles a todas que hagan commit de lo que llevan":
    "tell them all to commit what they have so far",
  "Revisar cómo va algo": "Check how something is going",
  "mírame qué está haciendo el agente del login":
    "show me what the login agent is doing",
  "Repartir el día": "Split up the day",
  "arreglar el hover\nescribir los tests del router\nauditar el login":
    "fix the hover\nwrite the router tests\naudit the login",


  // Las etiquetas que perdieron su emoji al pasar a icono dibujado.
  "Cambiar el nombre que se ve…": "Change the name shown here…",
  Renombrar: "Rename",
  "Mover a grupo…": "Move to group…",
  "Sacarla de este proyecto": "Take it out of this project",
  // Ascender la carpeta de una suelta a proyecto de la barra. Vivía en una
  // pastilla dentro de la fila y se mudó al menú el 2026-08-09.
  "Hacer un proyecto de «{c}»": "Make «{c}» a project",
  "Borrar la sesión": "Delete the session",
  "Otra carpeta del disco…": "Another folder from disk…",
  "Suelta, sin proyecto": "Loose, no project",
  "Retomar las que ya tienes…": "Resume the ones you already have…",
  "Todas tus sesiones": "All your sessions",
  "Marcar las que no tengo": "Tick the ones I lack",
  "Quitar las marcas": "Clear the ticks",
  "ya la tienes": "already open here",
  "· {n} ya en Adeorq": "· {n} already in Adeorq",
  "Ponerlas en la barra ({n})": "Put them in the rail ({n})",
  "Ponerla en la barra": "Put it in the rail",
  "Van a la barra de la izquierda, no se abre ninguna terminal. Las abres tú desde ahí, una a una.":
    "They go to the left-hand rail; no terminal is opened. You open them from there, one at a time.",
  "abierta ahora": "open right now",
  "Ninguna sesión con eso.": "No session matches that.",
  "Todavía no hay sesiones que retomar.": "No sessions to resume yet.",
  Rombo: "Diamond",
  "Herramienta: el rombo": "Tool: the diamond",
  "Recuperando tus terminales…": "Bringing your terminals back…",
  "Al abrir Adeorq vuelven las mismas terminales que tenías, en sus carpetas, y cada Claude retoma SU conversación. Con el ajuste automático, una terminal estrecha encoge la letra hasta que la línea vuelve a caber. Cada sesión es un programa aparte: unos 200 MB cada una.":
    "When Adeorq opens, the same terminals come back in their folders and each Claude resumes ITS OWN conversation. With auto-fit on, a narrow terminal shrinks the type until the line fits again. Each session is its own program: about 200 MB each.",

  // Accounts (META 6)
  Cuentas: "Accounts",
  "Cada cuenta es un login aparte del mismo CLI, con su propia carpeta. Las terminales nuevas de Claude nacen con la que marques como predeterminada.":
    "Each account is a separate login of the same CLI, with a folder of its own. New Claude terminals are born with whichever one you set as default.",
  "Sin conectar todavía. Abre una terminal aquí y haz el login.":
    "Not signed in yet. Open a terminal here and log in.",
  "Conectada.": "Signed in.",
  "Este CLI no publica su consumo en el equipo, así que no hay barras que enseñar.":
    "This CLI publishes no usage on the machine, so there are no bars to show.",
  "una sola cuenta": "one account only",
  "Instalado. De este programa no sé leer si has iniciado sesión, así que ábrelo y te lo dirá él.":
    "Installed. I cannot read whether you are signed in to this one, so open it and it will tell you.",
  "No he encontrado forma de moverle la carpeta de configuración, así que solo puede tener una cuenta.":
    "I found no way to move its config folder, so it can only have one account.",
  "No instalados": "Not installed",
  "No está en este equipo. El botón abre una terminal y lo descarga con":
    "Not on this machine. The button opens a terminal and downloads it with",
  "No te pide ninguna cuenta: solo lo deja instalado, y ya decidirás si lo usas.":
    "It asks for no account: it just leaves it installed, and using it is up to you later.",
  Descargar: "Download",
  "Ya está descargado. Cuando quieras usarlo, escribe aquí: {c}":
    "Downloaded. When you want to use it, type this here: {c}",
  "No está en este equipo y no tiene un comando de instalación de fiar, así que hay que bajarlo de su web:":
    "Not on this machine, and it has no install command worth trusting, so it has to come from its own site:",
  "Abrir su web": "Open its site",
  instalar: "install",
  "Cuando termine la instalación, vuelve aquí y dale a ↻: el que acabe de aparecer se coloca solo con los demás.":
    "When the install finishes, come back here and hit ↻: whatever just showed up joins the others on its own.",
  "Buscar otra vez qué hay instalado y releer los límites (no gasta cuota)":
    "Look again for what is installed and re-read the limits (spends no quota)",
  "Se crea una carpeta suya y se abre una terminal para que hagas el login. Tu cuenta de siempre no se toca.":
    "It gets a folder of its own and a terminal opens so you can log in. Your usual account is left alone.",
  "Volver a preguntar los límites (no gasta cuota)":
    "Ask for the limits again (costs no quota)",
  "Las terminales nuevas usan esta": "New terminals use this one",
  predeterminada: "default",
  // El resumen de cabecera de Cuentas y el estado de cada tarjeta.
  "cuentas conectadas": "accounts connected",
  "de {n} programas instalados": "across {n} installed programs",
  "el límite más apretado": "tightest limit",
  "todavía preguntando…": "still asking…",
  "la predeterminada": "the default one",
  "con la que nacen las terminales nuevas": "new terminals are born with this one",
  conectada: "connected",
  "sin conectar": "not connected",
  "en una terminal aquí": "in a terminal here",
  "Terminal con esta": "Terminal with this one",
  "Usar por defecto": "Make it the default",
  Quitar: "Remove",
  "Añadir cuenta": "Add account",
  "Cómo la llamas (p. ej. Trabajo). Nunca tu correo.":
    "What you call it (e.g. Work). Never your email.",
  "Quitar cuenta": "Remove account",
  "Varias cuentas TUYAS, sin problema. Turnarte cuentas de otras personas para estirar los límites incumple los términos de Anthropic y lo que te juegas es el cierre de la cuenta.":
    "Several accounts of YOUR OWN, no problem. Rotating other people's accounts to stretch limits breaks Anthropic's terms, and what you risk is losing the account.",

  // Streaming shield. The advice is per rule: masking happens before the pane
  // paints, so nothing reached the stream, and a Windows path is not a
  // credential you could rotate even if you wanted to.
  "Tapé algo que parece": "I masked something that looks like",
  "No ha llegado a verse: la tapé antes de pintarse. Lo que conviene mirar es de dónde salió, porque ahí sí sigue suelta.":
    "It never showed: I masked it before it painted. What is worth checking is where it came from, because it is still loose there.",
  "Tapado y listo. Eso no es una credencial, no hay nada que rotar.":
    "Masked, and that is that. It is not a credential, there is nothing to rotate.",
  "No ha llegado a verse. Estos caducan solos, así que casi nunca es urgente: mira si era el de servicio, que ese sí manda.":
    "It never showed. These expire on their own, so it is rarely urgent: check whether it was the service one, which does have power.",
  "No ha llegado a verse. Una clave privada en pantalla sí merece que compruebes qué la imprimió.":
    "It never showed. A private key on screen does deserve a look at whatever printed it.",
  "No ha llegado a verse: tapé el valor y dejé el nombre. Puede ser una clave de verdad o una variable que solo se llama así.":
    "It never showed: I masked the value and kept the name. It may be a real key, or just a variable named like one.",
  "Solo dejaba ver el nombre de tu cuenta de Windows, y ya está tapado. Una carpeta no se rota: no hay nada que hacer.":
    "It only showed your Windows account name, and it is masked now. A folder cannot be rotated: nothing to do.",
  "clave de Anthropic": "an Anthropic key",
  "clave de OpenAI": "an OpenAI key",
  "token de GitHub": "a GitHub token",
  "clave de AWS": "an AWS key",
  "token de Slack": "a Slack token",
  "clave de Google": "a Google key",
  "token JWT": "a JWT token",
  "clave privada": "a private key",
  "cadena de conexión con contraseña": "a connection string with a password",
  "variable con secreto": "a variable holding a secret",
  correo: "an email address",
  "ruta con tu usuario": "a path with your username",
  Entendido: "Got it",
  "Pantalla tapada": "Screen covered",
  "Clic o Ctrl+Mayús+P para volver. Nadie ve lo que hay debajo.":
    "Click or Ctrl+Shift+P to go back. Nobody can see what is underneath.",
  "Modo emisión: tapa rutas, claves y datos personales (Ctrl+Mayús+E) · Alt para mirar · Ctrl+Mayús+P tapa la pantalla":
    "Streaming mode: masks paths, keys and personal data (Ctrl+Shift+E) · hold Alt to peek · Ctrl+Shift+P covers the screen",
  "Modo emisión ACTIVO: se tapan rutas, correos y claves en las terminales (Ctrl+Mayús+E) · Alt para mirar":
    "Streaming mode ON: paths, emails and keys are masked in the terminals (Ctrl+Shift+E) · hold Alt to peek",

  // Terminal type
  "Ajustar la letra al tamaño de cada terminal":
    "Fit the type to each terminal's size",
  "Tamaño máximo de la letra": "Maximum type size",
  sí: "yes",
  no: "no",
  "Con el ajuste automático, una terminal estrecha encoge la letra hasta que la línea vuelve a caber. Cada sesión es un programa aparte: unos 200 MB cada una.":
    "With auto-fit on, a narrow terminal shrinks the type until the line fits again. Each session is its own program: about 200 MB each.",

  // Canvas (META 5)
  Lienzo: "Canvas",
  Terminal: "Terminal",
  "El lienzo está vacío.": "The canvas is empty.",
  "Elige un proyecto arriba y suelta una terminal. Muévelas donde quieras, únelas con una flecha y escribe en la flecha qué debe pasarle el primero al segundo.":
    "Pick a project above and drop a terminal in. Move them around, join them with an arrow and write on the arrow what the first one should hand to the second.",
  "Arrastra de un borde a otro para encadenar: cuando el primero termina, su resultado pasa al siguiente.":
    "Drag from one edge to another to chain them: when the first finishes, its result goes to the next.",
  "Qué pasa por esta flecha": "What travels along this arrow",
  "Cuando el agente de origen termine su turno, Adeorq le entrega al de destino este encargo junto con su última respuesta.":
    "When the source agent finishes its turn, Adeorq hands the target this brief along with its last answer.",
  "Ej.: revisa este resultado y escribe los tests que falten":
    "e.g. review this result and write the missing tests",
  "Enviar solo, sin preguntarme": "Send on its own, without asking me",
  "Quitar la flecha": "Remove the arrow",
  Guardar: "Save",
  terminó: "finished",
  "Pasar el relevo": "Hand it over",
  "Escribirlo sin enviar": "Type it without sending",
  "No pude leer la respuesta del agente anterior: se manda solo tu encargo.":
    "I could not read the previous agent's answer: only your brief is sent.",

  // Las piezas del lienzo. Faltaban ENTERAS: con la app en inglés, el menú de
  // añadir salía en español de arriba abajo. Se vio en una captura de su
  // ventana, no en el código, que es donde estas cosas no se ven.
  Añadir: "Add",
  "Contar el tablero": "Describe the board",
  "Encima puedes dibujar, pegar una captura con Ctrl+V y guardarlo todo en un archivo para volver mañana.":
    "On top of it you can draw, paste a screenshot with Ctrl+V, and save the whole board to a file for tomorrow.",
  "Tu trabajo": "Your work",
  Cacharros: "Gadgets",
  Utilidades: "Tools",
  "nada sale de aquí": "nothing leaves this app",
  Pomodoro: "Pomodoro",
  Cronómetro: "Stopwatch",
  "Cuenta atrás": "Countdown",
  Calculadora: "Calculator",
  Minutos: "Minutes",
  "Se acabó el tiempo": "Time is up",
  "La cuenta atrás de {n} minutos ha llegado a cero.":
    "The {n} minute countdown has reached zero.",
  "Se acabó la concentración": "Focus time is over",
  "Se acabó el descanso": "Break is over",
  "Descanso de {n} minutos.": "A {n} minute break.",
  "Otra vuelta de {n} minutos.": "Another {n} minute round.",

  "Mover y conectar": "Move and connect",
  Copiada: "Copied",
  "Copiar la captura con lo que le has pintado":
    "Copy the screenshot with everything you drew on it",

  // El tablero de cuadrilla
  puesto: "post",
  puestos: "posts",
  "te espera": "waiting for you",
  "te esperan": "waiting for you",
  "Se han dicho": "What they told each other",
  "Cerrar las {n} terminales de esta cuadrilla": "Close this crew's {n} terminals",
  "¿Cerrar {n}?": "Close {n}?",
  "Apartar sus terminales (siguen trabajando)": "Set its terminals aside (they keep working)",
  Minimizadas: "Minimised",
  "Minimizar: baja a la tira de abajo y sigue trabajando":
    "Minimise: drops to the strip below and keeps working",
  "Traerla de vuelta al mosaico": "Bring it back to the mosaic",
  Apartadas: "Set aside",
  "Traer todas": "Bring them all back",
  "Minimizar todas": "Minimise all",
  "Apartar todas las terminales: siguen vivas en la tira de abajo":
    "Set every terminal aside: they stay alive in the strip below",
  "Cerrar todas": "Close all",
  "Cerrar las {n} terminales: mata a sus agentes":
    "Close all {n} terminals: kills their agents",
  "Cerrar todas las terminales": "Close every terminal",
  "Se cierran las {n} terminales de la Cabina y se mata a sus agentes. Las conversaciones NO se borran: siguen en la lista de la izquierda y se retoman cuando quieras.":
    "This closes the cockpit's {n} terminals and kills their agents. The conversations are NOT deleted: they stay in the list on the left and can be resumed whenever you want.",
  "⚠ {n} están trabajando ahora mismo:": "⚠ {n} of them are working right now:",
  "… y {n} más": "… and {n} more",
  "Mejor apartarlas": "Set them aside instead",
  "Devolver al mosaico todo lo que está apartado":
    "Bring everything that is set aside back to the mosaic",
  "Está apartada con su grupo. Pulsa para traer el grupo entero.":
    "It is set aside with its group. Click to bring the whole group back.",
  "Traer de vuelta sus terminales": "Bring its terminals back",
  "{n} de {total} han terminado": "{n} of {total} have finished",
  trabajando: "working",
  "TE ESPERA": "WAITING FOR YOU",
  "te toca": "your turn",
  "no se sabe": "unknown",
  "Ir a esta terminal": "Go to this terminal",
  Plegar: "Collapse",
  Desplegar: "Expand",
  "Arrastra para ensanchar la lista": "Drag to widen the list",

  // Las utilidades por dentro. También estaban en duro: la comprobación de
  // idioma solo veía las que llevan tilde, y por eso parecían media docena.
  "Pega aquí el JSON": "Paste the JSON here",
  Ordenar: "Tidy up",
  Comprimir: "Compress",
  patrón: "pattern",
  "Texto donde buscar": "Text to search in",
  coincidencia: "match",
  coincidencias: "matches",
  Antes: "Before",
  Después: "After",
  "líneas distintas": "lines differ",
  Iguales: "Identical",
  Texto: "Text",
  "Texto del que sacar el hash": "Text to hash",
  largo: "length",
  signos: "symbols",
  Otras: "Others",
  Otros: "Others",
  "Clic para copiar. No salen de este equipo.":
    "Click to copy. They never leave this machine.",
  "Pega el texto": "Paste the text",
  caracteres: "characters",
  "sin espacios": "without spaces",
  palabras: "words",
  líneas: "lines",
  "tokens (aprox.)": "tokens (approx.)",
  "Partir a la derecha: terminal al lado (Ctrl+Mayús+→)":
    "Split right: a terminal beside this one (Ctrl+Shift+→)",
  "Partir abajo: terminal debajo (Ctrl+Mayús+↓ o D)":
    "Split down: a terminal below this one (Ctrl+Shift+↓ or D)",

  // El panel de la derecha. Estaba escrito en duro, sin pasar por aquí: por
  // eso «Skills · Uso» seguía en español con la app en inglés.
  "Skills · Uso": "Skills · Usage",
  "Mostrar skills y uso": "Show skills and usage",
  "Ocultar panel": "Hide panel",
  "Sin skills en ~/.claude/skills": "No skills in ~/.claude/skills",
  "Qué pasa este día…": "What happens on this day…",

  // El aviso de contexto de una terminal. Estaba escrito en duro dentro del
  // JSX, así que salía en español con la app puesta en inglés.
  "{pct} % de contexto ({n} tokens). Compactar ahora sale peor que empezar: abre una terminal nueva.":
    "{pct}% of context ({n} tokens). Compacting now costs more than starting over: open a new terminal.",
  "{pct} % de contexto ({n} tokens). Cada mensaje vuelve a pagarlos enteros, así que irá más lenta y más cara.":
    "{pct}% of context ({n} tokens). Every message pays for all of them again, so it gets slower and dearer.",

  // Los objetivos que quedaron sin tachar el día anterior. Nada se borra nunca,
  // pero la lista de hoy nace vacía y eso se lee como una pérdida.
  ayer: "yesterday",
  "Traer el que dejaste el {dia}": "Bring over the one you left on {dia}",
  "Traer los {n} que dejaste el {dia}": "Bring over the {n} you left on {dia}",

  // Las notas
  Nota: "Note",
  "se guarda sola": "saves itself",
  "Toca para escribir": "Tap to write",
  "Escribe. Para una tarea, empieza la línea con - [ ]":
    "Write. For a task, start the line with - [ ]",
  tarea: "task",
  "Doble clic para ponerle nombre": "Double-click to name it",
  "Cualquier otro color": "Any other colour",
  "Tu nota está escrita en esa terminal. El Enter lo das tú.":
    "Your note is typed into that terminal. The Enter is yours to press.",
  "Esta flecha sale de una nota. Al conectarla ya le escribió sus tareas al agente; púlsalo de nuevo cuando añadas más.":
    "This arrow comes from a note. Connecting it already typed its tasks to the agent; press again when you add more.",
  "Pasarle la nota otra vez": "Hand the note over again",
  notas: "notes",
  "un trabajo repartido": "a job shared out",

  // La galería
  Galería: "Gallery",
  "lo que has pegado": "what you have pasted",
  "Volver a mirar": "Look again",
  "Mirando…": "Looking…",
  "Aquí aparecerán las capturas que pegues en el lienzo con Ctrl+V.":
    "Screenshots you paste on the canvas with Ctrl+V will show up here.",
  "Clic: al lienzo": "Click: onto the canvas",
  "A la papelera de Windows": "To the Windows recycle bin",
  "Ver más": "See more",

  // Las utilidades
  JSON: "JSON",
  "Expresión regular": "Regular expression",
  "Comparar textos": "Compare texts",
  Codificador: "Encoder",
  Hash: "Hash",
  Contraseñas: "Passwords",
  Identificadores: "Identifiers",
  Color: "Colour",
  "Contar texto": "Count text",

  // El dibujo
  Tipografía: "Typeface",
  "Dibujar con brillo": "Draw with glow",
  "De la app": "The app's",
  "De terminal": "Terminal",
  "Con remates": "Serif",
  "A mano": "Handwritten",
  "De titular": "Headline",
  Grosor: "Thickness",
  "Escribe y Enter · Mayús+Enter para otra línea":
    "Type and press Enter · Shift+Enter for another line",
  "Lo seleccionado": "What you picked",
  "Borrar lo seleccionado": "Delete what you picked",
  "Soltar la selección": "Drop the selection",
  "Volver a mover": "Back to moving",
  "Mantener la herramienta puesta para dibujar varias seguidas":
    "Keep the tool on to draw several in a row",
  "Borrar todo el dibujo": "Erase the whole drawing",

  // Las herramientas de la barra. Llegan a t() por variable (t(h.label)), así
  // que el revisor de idioma no las ve: se escriben aquí a mano.
  "Mover y seleccionar": "Move and select",
  "Rodear varias a la vez": "Lasso several at once",
  Lápiz: "Pencil",
  Flecha: "Arrow",
  Línea: "Line",
  Recuadro: "Box",
  Elipse: "Ellipse",
  "Borrar trazos": "Erase strokes",

  // Lo cogido, con la barra de abajo
  cogida: "picked",
  cogidas: "picked",
  Todo: "All",
  "Coger todo el lienzo": "Pick the whole canvas",
  "Quitar del lienzo todo lo cogido": "Remove everything picked from the canvas",
  "Dejar de tenerlo cogido": "Drop it",
  "¿Seguro?": "Sure?",
  "Se cierran {n} terminales. ¿Seguro?": "{n} terminals will be closed. Sure?",
  "Sí, borrar": "Yes, delete",

  // Los grupos de Ajustes. Pasan por variable (t(s.label)), así que el
  // comprobador no los ve: si faltan, el inglés los enseña en español.
  Aspecto: "Look",
  Atajos: "Shortcuts",
  "Modelo local": "Local model",
  Discord: "Discord",
  Adeorq: "Adeorq",

  // El diálogo de "la terminal te pregunta algo" (TerminalPane): el globo
  // (t(ask.hint)) y las dos opciones que Adeorq SINTETIZA cuando el CLI solo
  // dejó un "[y/N]" sin texto que leer (t(o.label) cuando o.propio). Las
  // demás opciones son la pantalla del propio CLI, tal cual, y no se tocan:
  // "las terminales siguen hablando lo que hable cada agente".
  "Antigravity te pide permiso para ejecutar una herramienta:":
    "Antigravity is asking permission to run a tool:",
  "Antigravity te pide confirmación para ejecutar el comando:":
    "Antigravity is asking to confirm running the command:",
  "Permitir (y)": "Allow (y)",
  "Denegar (n)": "Deny (n)",
  "Responder {n} en la terminal": "Answer {n} in the terminal",
  "Ocultar (puedes responder con el teclado: 1, 2 o 3)":
    "Hide (you can answer with the keyboard: 1, 2 or 3)",

  // Los avisos flotantes de una terminal (setNote), que llegan a t() por
  // variable (t(note)): mismo motivo que arriba, a mano.
  "El Modo Espejo se elige al ABRIR la terminal, no después: esta ya está corriendo dentro de tu carpeta. Ciérrala y ábrela en espejo, o pídeselo al Capataz.":
    "Mirror Mode is chosen when you OPEN the terminal, not after: this one is already running inside your folder. Close it and reopen it in mirror, or ask the Foreman.",
  "Cambios descartados y rama en la sombra eliminada.":
    "Changes discarded and the shadow branch deleted.",
  "Ruta escrita en el prompt. Escribe al lado qué quieres que haga con ella.":
    "Path written into the prompt. Write next to it what you want done with it.",
  "Imagen puesta como ruta: el agente la lee de ahí. Escribe tu pregunta al lado y Enter.":
    "Image set as a path: the agent reads it from there. Write your question next to it and press Enter.",
  "Ruta escrita, pero este cliente no lee imágenes de una ruta: cópiala y pégala aquí con Ctrl+V.":
    "Path written, but this client doesn't read images from a path: copy it and paste it here with Ctrl+V.",

  // El estado de una idea en la Agenda (STATUS_LABEL), por t(STATUS_LABEL[...]).
  viva: "live",
  aparcada: "parked",
  hecha: "done",
  descartada: "discarded",

  // Los chips del vigía del router, en Ajustes (t(label) sobre un array local).
  "Solo diferencias gordas": "Only big differences",
  "Cualquier diferencia": "Any difference",

  // Las claves de API, en Cuentas
  "Claves de API": "API keys",
  "La otra forma de pagar lo que consume un CLI: por tokens en vez de con tu suscripción. Sirve para gastar menos plan en cosas pequeñas, o para seguir trabajando cuando el plan se agota.":
    "The other way to pay for what a CLI consumes: by tokens instead of out of your subscription. Useful to spend less plan on small things, or to keep working when the plan runs out.",
  "Se guarda en el Gestor de Credenciales de Windows, cifrada con tu sesión, y no vuelve a salir: al abrir una terminal la pone Rust justo antes de arrancar el proceso, así que no pasa por la pantalla ni aparece en una captura.":
    "Stored in the Windows Credential Manager, encrypted with your login, and it never comes back out: when a terminal opens, Rust puts it in right before starting the process, so it never goes through the screen or shows up in a screenshot.",
  "En Linux no hay Gestor de Credenciales: se guarda en un archivo tuyo con permisos 600. Eso la protege de otros usuarios del equipo, pero NO de otro programa tuyo. Sí es igual que en Windows lo otro: no vuelve a salir, la pone Rust justo antes de arrancar el proceso.":
    "Linux has no Credential Manager: it goes into a file of yours with 600 permissions. That protects it from other users of the machine, but NOT from another program of yours. The other half is the same as on Windows: it never comes back out, Rust puts it in right before starting the process.",
  "Pega aquí la clave": "Paste the key here",
  "Sacar una": "Get one",
  Olvidarla: "Forget it",
  "Cambiar la clave": "Change the key",
  "Pegar una clave": "Paste a key",
  "Abre con la clave (por tokens)": "Opens on the key (by tokens)",
  "Abre con tu suscripción": "Opens on your subscription",
  "Sin clave. Con una, este CLI puede abrirse facturando por tokens en vez de gastar tu plan.":
    "No key. With one, this CLI can open billing by tokens instead of spending your plan.",
  "Nace con": "Born with",
  "Solo lo gastado por los chats de Adeorq. Lo que gaste un CLI con tu clave lo cuenta su proveedor, no esto.":
    "Only what Adeorq's own chats have spent. What a CLI spends on your key is counted by its provider, not here.",
  hoy: "today",
  "en total": "in total",

  // El chat por API, en el lienzo
  "Chat con un modelo": "Chat with a model",
  "por tu clave, sin gastar suscripción": "on your key, no subscription spent",
  "Cambiar de modelo": "Change model",
  "Buscar modelo…": "Search a model…",
  "Pidiendo el catálogo…": "Asking for the catalogue…",
  "por millón": "per million",
  // «gratis» ya estaba más arriba: lo comparte con la pantalla de cuentas.
  "Lo que llevas gastado en esta conversación": "What this conversation has cost so far",
  "Quitar el chat del lienzo": "Take the chat off the canvas",
  "Pregunta lo que sea. Esto no es un agente: no ve tus archivos ni toca nada.":
    "Ask anything. This is not an agent: it cannot see your files or touch anything.",
  "Escribe… (Enter envía, Mayús+Enter salta de línea)":
    "Type… (Enter sends, Shift+Enter adds a line)",
  Enviar: "Send",
  "…": "…",

  // El tablero del trabajo, en el lienzo
  "Tablero del trabajo": "The work board",
  "quién trabaja y quién te espera": "who is working and who is waiting on you",
  "Trabajo de los agentes": "What the agents are doing",
  "Quitar el tablero del lienzo": "Take the board off the canvas",
  "Qué hay que hacer…": "What needs doing…",
  "Quitar esta tarjeta": "Remove this card",
  "Arrastra una a Trabajando y se abre con ese encargo. Marca varias para repartirlas entre agentes que no se pisen.":
    "Drag one to Working and it opens with that brief. Tick several to split them across agents that will not step on each other.",
  "Repartir las {n} juntas": "Split the {n} together",
  "Marcarla para repartirla con otras": "Tick it to split it along with others",
  // «Ir a esta terminal» y «no se sabe» ya estaban más arriba: los comparte con
  // el tablero de la cuadrilla, que dice lo mismo con las mismas palabras.
  "Está en la cabina, no en el lienzo: cambia de vista para verla":
    "It is in the cockpit, not on the canvas: switch views to see it",
  "Elige antes un proyecto arriba: la terminal tiene que nacer en algún sitio.":
    "Pick a project above first: the terminal has to be born somewhere.",
  "Nadie trabajando.": "Nobody working.",
  "Nadie te espera.": "Nobody waiting on you.",
  "Nada terminado.": "Nothing finished.",
  ayudante: "helper",
  ayudantes: "helpers",
  agente: "agent",
  agentes: "agents",
  // Los nombres de las columnas y de los estados (lib/estados.ts). Pasan por
  // variable, así que el comprobador no los ve: si faltan, la app en inglés los
  // enseña en español sin avisar de nada.
  "Por hacer": "To do",
  Trabajando: "Working",
  "Te espera": "Waiting on you",
  Hecho: "Done",

  // La ventana de localhost
  "Ventana de localhost": "A localhost window",
  "ventanas de localhost": "localhost windows",
  "ver la web mientras se hace": "watch the site while it is being built",
  Recargar: "Reload",
  "Abrirla en tu navegador de verdad": "Open it in your real browser",
  "Escribe arriba un puerto o una dirección, o toca uno de los de abajo.":
    "Type a port or an address above, or tap one of the ones below.",
  "Clic para usar la página": "Click to use the page",
  "Soltar la página (para poder mover la pieza)": "Let the page go (so the piece can be moved)",
  "Editar con froede": "Edit with froede",
  "Arranca froede en la carpeta del proyecto y abre esta página en tu navegador, que es donde vive su extensión. Aquí dentro no puede editar.":
    "Starts froede in the project folder and opens this page in your browser, which is where its extension lives. It cannot edit in here.",
  "Elige arriba de qué proyecto es esa página: froede escribe en su carpeta.":
    "Pick above which project that page belongs to: froede writes into its folder.",
  "froede arrancando en {p}. Copia de esa terminal el puerto y el token, pégalos en el botón de froede del navegador y dale a Edit.":
    "froede starting in {p}. Copy the port and the token from that terminal, paste them into froede's button in the browser and hit Edit.",

  // El resto del lienzo, que también estaba a medias
  "Guardar el lienzo…": "Save the canvas…",
  "Abrir un lienzo…": "Open a canvas…",
  "a un .json": "to a .json",
  "Guardar este tablero en un archivo o abrir otro":
    "Save this board to a file, or open another",
  "Encajar todo en la pantalla": "Fit everything on screen",
  "Abrir este lienzo": "Open this canvas",
  "Ese archivo no es un lienzo de Adeorq.": "That file is not an Adeorq canvas.",
  "Se suma a lo que ya tienes en el lienzo, no lo reemplaza. Las terminales guardadas son sesiones NUEVAS en la misma carpeta: lo que hablaste con ellas no vuelve.":
    "It adds to what you already have on the canvas, it does not replace it. Saved terminals come back as NEW sessions in the same folder: what you talked about with them does not come back.",
  "Solo el dibujo y las piezas": "Only the drawing and the pieces",
  "Todo, abre las terminales": "Everything, open the terminals",
  "Lienzo guardado en {r}": "Canvas saved to {r}",
  "«{n}» te preguntó algo antes de terminar": "«{n}» asked you something before finishing",
  "«{a}» → «{b}» se pasó el relevo {n} veces seguidas: la he puesto a mano":
    "«{a}» → «{b}» handed over {n} times in a row: switched to manual",
  "Ojo: esta flecha cierra un círculo. En automático giraría sin parar.":
    "Careful: this arrow closes a loop. On automatic it would go round forever.",
  "Un agente ha pedido una flecha que cierra un círculo.":
    "An agent asked for an arrow that closes a loop.",
  "Lienzo importado sin abrir terminales.": "Canvas imported without opening terminals.",
  "Lienzo importado: {n} terminales abriéndose.": "Canvas imported: {n} terminals opening.",
  terminales: "terminals",
  cacharros: "gadgets",
  capturas: "screenshots",
  "trazos de dibujo": "drawing strokes",
  "Elige proyecto": "Pick a project",
  "Buscar proyecto": "Search for a project",
  "Nada con ese nombre.": "Nothing by that name.",
  "En qué proyecto se abre lo que sueltes aquí":
    "Which project anything you drop here opens in",
  "Pomodoro, cronómetro, calculadora o calendario":
    "Pomodoro, stopwatch, calculator or calendar",
  "Contarle a la terminal enfocada qué más hay en el lienzo y qué flechas salen de dónde":
    "Tell the focused terminal what else is on the canvas and which arrows go where",
  "Enfoca una terminal del lienzo para poder contarle el tablero":
    "Focus a terminal on the canvas to describe the board to it",
  "Tablero escrito en esa terminal. El Enter lo das tú.":
    "Board typed into that terminal. The Enter is yours to press.",
  "Captura entregada. Dale al Enter en esa terminal.":
    "Screenshot handed over. Press Enter in that terminal.",
  "Arrastra de un borde a otro para encadenar: cuando el primero termina, su resultado pasa al siguiente.\nCtrl+V pega una captura. Ctrl+A coge todo el lienzo y Supr se lo lleva. Esc suelta.":
    "Drag from one edge to another to chain them: when the first finishes, its result goes to the next.\nCtrl+V pastes a screenshot. Ctrl+A picks the whole canvas and Del takes it away. Esc drops.",
  Soltar: "Drop",
  Listo: "Done",

  // La captura pegada en el lienzo
  Captura: "Screenshot",
  "Mandar a…": "Send to…",
  "Qué quieres que mire (opcional)": "What you want it to look at (optional)",
  "Deshacer lo último": "Undo the last one",
  "Guardar el PNG con las anotaciones y darle la ruta a un agente":
    "Save the PNG with your marks and hand an agent its path",
  "Abre una terminal en el lienzo para poder mandársela":
    "Open a terminal on the canvas to be able to send it there",

  // Los cacharros
  Concentración: "Focus",
  Descanso: "Break",
  Empezar: "Start",
  Parar: "Stop",
  "Poner a cero": "Reset",
  "Volver a empezar": "Start over",
  "Marcar una vuelta": "Mark a lap",
  vuelta: "lap",
  vueltas: "laps",

  // La lista de sesiones
  Borrar: "Delete",
  "🗑 Borrar la sesión": "🗑 Delete the session",
  "Borrar la sesión: va a la papelera de Windows":
    "Delete the session: it goes to the Windows recycle bin",
  "Esta sesión está abierta ahora mismo.": "This session is open right now.",
  "Ponerle un logo…": "Give it a logo…",
  "Cambiar su logo…": "Change its logo…",
  "Quitar el logo que le puse": "Remove the logo I gave it",
  "Volver a buscar logos en las carpetas": "Look for logos in the folders again",

  // Discord
  "Tu actividad de Discord": "Your Discord activity",
  "Mostrar Adeorq en mi Discord": "Show Adeorq on my Discord",
  "Que en tu perfil de Discord se vea que estás en Adeorq, como cuando alguien juega a algo. Habla con el Discord que ya tienes abierto en este equipo: no hay cuenta, ni servidor, ni contraseña de por medio.":
    "So your Discord profile shows you are in Adeorq, the way it shows someone playing a game. It talks to the Discord already running on this machine: no account, no server, no password involved.",
  "Decir en qué proyecto estoy": "Say which project I am in",
  "Apagado, pone «Programando con agentes» y cuántas terminales tienes abiertas, y nada más. Encendido, dice el nombre del proyecto que estás mirando: no lo dejes puesto con proyectos que aún no has publicado. En modo emisión vuelve solo a lo genérico, mande lo que mande este interruptor.":
    "Off, it says \"Coding with agents\" and how many terminals you have open, and nothing else. On, it names the project you are looking at: do not leave it on with projects you have not published yet. In streaming mode it falls back to the generic line on its own, whatever this switch says.",
  "No tienes que registrar nada: Adeorq ya es una aplicación de Discord, y es la suya la que sale con su nombre y su logo. El identificador de abajo solo se toca si quieres publicar la tuya propia, con otro nombre; vacío, vuelve a la de Adeorq.":
    "You do not have to register anything: Adeorq is already a Discord application, and it is the one that shows up with its name and logo. The ID below is only for publishing your own, under another name; leave it empty and it goes back to Adeorq's.",
  "Publicar con otra aplicación (avanzado)": "Publish with another application (advanced)",
  "Identificador de la aplicación": "Application ID",
  "Volver a la de Adeorq": "Back to Adeorq's",
  "Abrir el portal de Discord": "Open the Discord portal",
  "Con una aplicación propia, sube el logo en Rich Presence › Art Assets con el nombre exacto «adeorq» o saldrá sin imagen.":
    "With your own application, upload the logo under Rich Presence › Art Assets with the exact name \"adeorq\" or it will show up with no image.",
  "Publicado en tu Discord.": "Published to your Discord.",
  "Con las dos cosas puestas, enciendes el ordenador y tu taller ya está montado. El arranque automático es una entrada normal de Windows: también puedes quitarla desde el Administrador de tareas, pestaña Inicio. Y siempre apunta a la Adeorq instalada, nunca a la de desarrollo.":
    "With both switched on, you turn the computer on and your workshop is already set up. Auto-start is a normal Windows entry: you can also remove it from Task Manager, Startup tab. And it always points at the installed Adeorq, never at the development one.",

  // El Capataz
  "Ya no procede: los paneles han cambiado desde que se hizo el plan.":
    "Not valid any more: the panes have changed since the plan was made.",

  // Sueltas que se habían quedado en español dentro del JSX. («Quitar» ya
  // estaba arriba en el diccionario, así que aquí solo van las que faltaban.)
  "Ver los de la izquierda": "See the ones on the left",
  "Ver los de la derecha": "See the ones on the right",
  "Abrir esta terminal aislada en Modo Espejo": "Open this terminal isolated, in Shadow Mode",
  "«{n}» se va a la papelera de Windows. Desaparece de Adeorq y también de Claude Code, así que ya no podrás retomarla. Si te arrepientes, está en la papelera.":
    "«{n}» goes to the Windows Recycle Bin. It disappears from Adeorq and from Claude Code too, so you will not be able to resume it. If you change your mind, it is in the bin.",

  // Reanimar: el vigía del cuelgue. Las cadenas están en TerminalPane.tsx, que
  // otra sesión tiene abierto (ver BUZON.md); esto no lo toca, solo les da su
  // traducción, que es lo que faltaba para que la app en inglés no las enseñe
  // en español.
  // La papelera del encabezado de una terminal, que desde la 0.9.69 pregunta
  // con el mismo diálogo que la de la barra en vez de armarse con dos clics.
  "Se cierra esta terminal y su conversación deja de estar en disco.":
    "This terminal closes and its conversation stops being on disk.",
  "Borrar esta sesión: cierra la terminal y su conversación se va a la papelera de Windows":
    "Delete this session: it closes the terminal and its conversation goes to the Windows Recycle Bin",
  Reanimar: "Revive",
  "Empezar limpia": "Start fresh",
  "⚡ Reanimar (si se ha quedado colgada)": "⚡ Revive (if it has wedged)",
  "⚡ Reanimar EN LIMPIO (esta sesión pesa demasiado para recuperarla)":
    "⚡ Revive FRESH (this session is too heavy to recover)",
  "Adeorq ha perdido la salida de esta terminal: el agente sigue vivo, pero se bloqueará en cuanto escriba y ya no verás nada de lo que haga. Es un fallo nuestro y queda anotado en el rastro. El botón lo mata y vuelve a abrirla.":
    "Adeorq has lost this terminal's output: the agent is still alive, but it will block the moment it writes and you will not see anything it does. This one is our bug and it is recorded in the trace. The button kills it and opens the terminal again.",
  "Este agente lleva 3 minutos sin dar señales: está colgado, y esta sesión pesa demasiado para recuperarla — revivirla la volvería a colgar. El botón abre una terminal limpia en su lugar.":
    "This agent has been silent for 3 minutes: it is wedged, and this session is too heavy to recover, so reviving it would wedge it again. The button opens a fresh terminal instead.",
  "Este agente lleva 3 minutos sin dar señales en mitad de un turno: está colgado (fallo del CLI de Claude, no tuyo). Reanimar lo mata y retoma esta misma conversación sin perder nada.":
    "This agent has been silent for 3 minutes mid-turn: it is wedged (a bug in Claude's CLI, not yours). Reviving kills it and resumes this very conversation without losing anything.",

  // La transparencia de las terminales.
  "Terminales transparentes": "See-through terminals",
  "Cuánto se ve a través de las terminales": "How much shows through the terminals",
  "Sube esto para que la foto, o el escritorio, se vean a través del texto de las terminales. Al 100% la terminal es un cristal.":
    "Turn this up to see the photo, or the desktop, behind the terminal text. At 100% the terminal is glass.",
  "Ojo: «cuánto se ve», aquí arriba, manda sobre esto. Si está bajo, la foto llega apagada a todas partes y subir este mando no la trae de vuelta.":
    "Note: «how much shows», above, overrides this. If it is low the photo arrives dimmed everywhere, and turning this up will not bring it back.",
  "Volver al automático": "Back to automatic",
  auto: "auto",

  // El encuadre del fondo: qué trozo de la foto se ve.
  Rellenar: "Fill",
  Entera: "Whole",
  Centrar: "Centre",
  "Como estaba": "As it was",
  Acercar: "Zoom in",
  Alejar: "Zoom out",
  "Arrastra para mover la foto. La rueda acerca y aleja.":
    "Drag to move the photo. The wheel zooms in and out.",
  "Así se va a ver. Arrastra la foto y usa la rueda para acercarla.":
    "This is how it will look. Drag the photo and use the wheel to zoom in.",

  // El aviso de cuota.
  "«{c}» va por el {p}% de su límite.": "«{c}» is at {p}% of its limit.",
  "Se renueva {r}.": "Renews {r}.",
  "Se renueva {r}. Ábrelo para seguir en otra cuenta.":
    "Renews {r}. Open it to carry on with another account.",
  "Seguir en": "Carry on with",
  "Abre una terminal nueva en este proyecto con esa cuenta":
    "Opens a new terminal in this project with that account",
  "No tienes otra cuenta con margen. Se añaden en la pestaña Cuentas.":
    "No other account has room to spare. You add them in the Accounts tab.",

  // La bienvenida de la primera vez.
  "Bienvenido a Adeorq": "Welcome to Adeorq",
  "Un panel para trabajar con agentes de IA por terminales de verdad, con tus proyectos a un clic. Cuatro preguntas y entras.":
    "A cockpit for working with AI agents through real terminals, with your projects one click away. Four questions and you are in.",
  "¿Cómo te llamas?": "What is your name?",
  "Tu nombre": "Your name",
  "Dónde viven tus proyectos": "Where your projects live",
  "La carpeta donde tienes tus repositorios. Cada subcarpeta suya será un proyecto del panel, y lo que abras fuera de ella irá al cajón de sueltas.":
    "The folder holding your repositories. Every subfolder of it becomes a project in the sidebar, and anything you open outside it lands in the loose drawer.",
  "Si tienes tus repositorios juntos en una carpeta, señálala y cada subcarpeta suya será un proyecto del panel. Si no los tienes así, entra sin carpeta y añade luego los que quieras, estén donde estén.":
    "If your repositories all sit inside one folder, point at it and every subfolder becomes a project here. If they do not, come in with no folder and add the ones you want later, wherever they are.",
  "Entras a una barra vacía y cada terminal que abras vive suelta, con su carpeta a la vista. Cuando una te importe, un botón la convierte en proyecto del panel.":
    "You come in to an empty sidebar and every terminal you open lives loose, showing its folder. When one starts to matter, a button turns it into a project.",
  "No los tengo en una sola carpeta": "They are not all in one folder",
  "sin carpeta de proyectos": "no projects folder",
  "sueltos, los vas añadiendo tú": "loose, you add them yourself",
  "Elegir una carpeta": "Choose a folder",
  "Elegir carpeta": "Choose folder",
  "Veo 1 proyecto ahí dentro.": "I can see 1 project in there.",
  "Veo {n} proyectos ahí dentro.": "I can see {n} projects in there.",
  "Sin proyectos todavía. Puedes crear el primero desde el Panel, o elegir otra carpeta.":
    "No projects yet. You can create the first one from the Dashboard, or pick another folder.",
  "Tus agentes": "Your agents",
  "Estos son los que he encontrado instalados en tu ordenador. Marca los que uses: el Asistente no te mandará a uno que no usas.":
    "These are the ones I found installed on your computer. Tick the ones you use: the Assistant will not send you to one you do not.",
  instalado: "installed",
  "no está": "not here",
  "Recoger las sesiones que ya tienes": "Pick up the sessions you already have",
  "Lee el historial que Claude Code y Codex dejan en tu carpeta de usuario para enseñártelo agrupado por proyecto. Se lee de tu disco y no sale de aquí.":
    "Reads the history Claude Code and Codex leave in your user folder and shows it grouped by project. It is read from your disk and never leaves it.",
  "El aspecto": "The look",
  "Elige el color de la casa. Se cambia cuando quieras en Ajustes.":
    "Pick the colour of the house. You can change it any time in Settings.",
  "Todo listo, {n}.": "All set, {n}.",
  "Ahora te enseño lo que hay dentro en un minuto: es la parte que a nadie le apetece leer en la guía.":
    "Now let me show you what is inside in a minute: it is the part nobody feels like reading in the guide.",
  Clientes: "Clients",
  Sesiones: "Sessions",
  "ninguno marcado": "none ticked",
  "se recogen las que ya tienes": "the ones you already have are picked up",
  "no se leen": "not read",
  Saltar: "Skip",
  Seguir: "Next",
  "Entrar directamente": "Just go in",
  "Enséñame las funciones": "Show me around",
  "Primeros pasos": "First steps",
  "La bienvenida pregunta tu nombre, dónde tienes los proyectos y qué clientes usas. El recorrido enseña para qué es cada parte de la ventana.":
    "The welcome asks your name, where your projects live and which clients you use. The tour shows what each part of the window is for.",
  "Ver el recorrido": "Take the tour",
  "Repetir la bienvenida": "Run the welcome again",
  "Tú y tus proyectos": "You and your projects",
  "Tu nombre es para el saludo del Panel. La carpeta es la que se lee para saber qué proyectos tienes: cada subcarpeta suya es uno.":
    "Your name is for the Dashboard greeting. The folder is the one read to know which projects you have: every subfolder of it is one.",
  "Tu nombre es para el saludo del Panel. La carpeta es la que se lee para saber qué proyectos tienes: cada subcarpeta suya es uno. Puedes no tener ninguna y añadir tus proyectos uno a uno, de donde estén.":
    "Your name is for the Dashboard greeting. The folder is the one read to know which projects you have: every subfolder of it is one. You can have none at all and add your projects one by one, from wherever they are.",
  "Sin carpeta": "No folder",
  "Tus proyectos dejan de salir solos: los añades tú, de donde estén":
    "Your projects stop appearing on their own: you add them, from wherever they are",
  "Proyectos que añadiste tú, de fuera de esa carpeta:":
    "Projects you added yourself, from outside that folder:",
  "Puedes añadir proyectos sueltos de cualquier sitio del disco.":
    "You can add loose projects from anywhere on disk.",
  "Quitarlo del panel. La carpeta no se toca.":
    "Take it out of the sidebar. The folder itself is left alone.",
  "＋ Añadir un proyecto": "＋ Add a project",
  "Elige la carpeta del proyecto": "Choose the project folder",
  "Ese proyecto ya estaba en el panel.": "That project was already in the sidebar.",

  // El recorrido por las funciones.
  "Tus proyectos, a la izquierda": "Your projects, on the left",
  "Cada carpeta con sus sesiones dentro, y al final las que no son de ningún proyecto, con su carpeta escrita. Arrastra una a un proyecto para meterla ahí, o pulsa ⊞ para que su carpeta sea un proyecto más. El punto verde es una sesión viva ahora mismo.":
    "Every folder with its sessions inside, and at the end the ones that belong to no project, each showing its folder. Drag one onto a project to file it there, or press ⊞ to turn its folder into a project of its own. The green dot is a session running right now.",
  "Cada carpeta con sus sesiones dentro, y las que abras fuera de un proyecto caen en el cajón de sueltas del final. El punto verde es una sesión viva ahora mismo.":
    "Every folder with its sessions inside, and whatever you open outside a project drops into the loose drawer at the bottom. A green dot is a session running right now.",
  "La Cabina: las terminales": "The Cockpit: the terminals",
  "Aquí trabajan los agentes, en terminales de verdad repartidas por la pantalla. Puedes abrir varias y verlas a la vez, que es la gracia de todo esto.":
    "This is where the agents work, in real terminals laid out across the screen. You can open several and watch them at once, which is the whole point.",
  "El Asistente": "The Assistant",
  "Le sueltas una frase de lo que quieres y te escribe el encargo entero, elige con qué cliente y qué modelo sale más a cuenta, y te lo deja escrito en la terminal. También sabe repartir el trabajo entre varios agentes.":
    "Tell it in one line what you want and it writes the whole brief, picks which client and model is the best value, and leaves it typed in the terminal. It can also split the work across several agents.",
  "La Agenda": "The Agenda",
  "Lo que tienes pendiente y las ideas que van saliendo mientras trabajas. Los agentes pueden dejarte propuestas aquí: tú las aceptas o las descartas.":
    "What you have pending and the ideas that come up while you work. Agents can leave suggestions here: you accept them or throw them away.",
  "Los objetivos del día": "Today's goals",
  "Tres cosas que quieres terminar hoy, siempre a la vista. Un agente puede tachar el suyo al acabar, así que la lista se mueve sola mientras trabajas.":
    "Three things you want to finish today, always in sight. An agent can tick off its own when it is done, so the list moves on its own while you work.",
  "El Lienzo": "The Canvas",
  "Una pizarra donde caben terminales, notas, imágenes y ventanas de tu web en localhost. Para pensar un proyecto entero sin cambiar de ventana.":
    "A board that holds terminals, notes, images and windows onto your site on localhost. For thinking through a whole project without leaving the window.",
  "Los clientes que tienes instalados y cuánta semana te queda en cada uno. Adeorq usa TU cuenta: no da acceso a ningún modelo ni guarda ninguna clave.":
    "The clients you have installed and how much of the week is left on each. Adeorq uses YOUR account: it gives access to no model and stores no key.",
  "Ajustes, y la guía entera": "Settings, and the whole guide",
  "El aspecto, los atajos, las notificaciones y la carpeta de proyectos. Y dentro, en Ayuda, la guía completa de todo lo que hay: esto de aquí era solo el paseo rápido.":
    "The look, the shortcuts, the notifications and the projects folder. And inside, under Help, the full guide to everything there is: this was just the quick walk.",
  "Ya está": "Done",

  // El Reparto: varias tareas de golpe.
  "Repartir varias tareas": "Split several tasks",
  "Repartir varias tareas entre agentes": "Split several tasks across agents",
  Repartir: "Split them",
  "Repartiendo…": "Splitting…",
  "Cambiar las tareas": "Change the tasks",
  "O monta un equipo": "Or build a team",
  "Doble clic para reescribirla": "Double-click to rewrite it",
  "Doble clic para cambiarle el nombre": "Double-click to rename it",
  Disolver: "Dissolve",
  "Marcar el grupo con este color": "Mark the group with this colour",
  "Nombre del grupo": "Group name",
  "Nombre y color del grupo": "Group name and colour",
  "Plegar el grupo": "Collapse the group",
  "Sin color": "No colour",
  "Ver sus {n} sesiones": "See its {n} sessions",
  "Clic: retomar la sesión aquí. Arrástrala sobre otra para agruparlas.":
    "Click: resume the session here. Drag it onto another one to group them.",
  "Clic: retomar la sesión aquí. Arrástrala sobre otra para agruparlas, o sobre un proyecto para meterla en él.":
    "Click: resume the session here. Drag it onto another one to group them, or onto a project to file it there.",
  "↯ Sacarla de este proyecto": "↯ Take it out of this project",
  "Convertir {d} en un proyecto del panel": "Turn {d} into a project of its own",
  "Pulsa para convertirla en un proyecto del panel":
    "Click to turn it into a project of its own",
  "Esa carpeta ya está en el panel.": "That folder is already in the sidebar.",
  "sin proyecto": "no project",
  "tus proyectos, uno a uno · sesiones de ~/.claude":
    "your projects, one by one · sessions from ~/.claude",
  "varias tareas a la vez": "several tasks at once",
  "{n} tareas": "{n} tasks",
  "ninguna todavía": "none yet",
  "Una tarea por línea. Se clasifican todas de una vez, cada una se abre con el cliente y el modelo que pide, y se atan por el BUZON.md del proyecto para que no se pisen.":
    "One task per line. They are all classified in one go, each opens with the client and the model it asks for, and they are tied together through the project's BUZON.md so they do not step on each other.",
  "arreglar el hover del botón\nescribir los tests del router\nauditar el login":
    "fix the button hover\nwrite the router tests\naudit the login",
  "En el proyecto": "In project",
  "O coge lo que ya tienes apuntado": "Or take what you already wrote down",
  objetivo: "goal",
  suyo: "theirs",
  "Entran {n} de golpe; el resto se queda para la próxima tanda.":
    "{n} go in at once; the rest waits for the next batch.",
  "No pude escribir el BUZON.md": "I could not write BUZON.md",
};

export function detectLang(): Lang {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === "es" || saved === "en") return saved;
  // No choice yet: follow the system, like the smart-defaults skill preaches.
  return navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

export type Translate = (
  text: string,
  vars?: Record<string, string | number>,
) => string;

export function makeT(lang: Lang): Translate {
  return (text, vars) => {
    let out = lang === "en" ? (EN[text] ?? text) : text;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        out = out.split(`{${k}}`).join(String(v));
      }
    }
    return out;
  };
}

export const LangContext = createContext<{ lang: Lang; t: Translate }>({
  lang: "es",
  t: makeT("es"),
});

export const useT = () => useContext(LangContext);
