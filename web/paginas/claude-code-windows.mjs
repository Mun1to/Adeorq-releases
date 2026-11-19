/**
 * /claude-code-windows y /en/claude-code-windows.
 *
 * Los datos de Claude Code salen de su documentación oficial, comprobada el 18 de
 * noviembre de 2026 (code.claude.com/docs: setup, desktop-quickstart, worktrees, agents).
 * Caducan: antes de tocar esta página, se vuelven a leer.
 */
import { figura, lista, parrafos, pasos, seccion } from './armazon.mjs'

const DOCS = 'https://code.claude.com/docs/en'

const ES = {
  titulo: 'Claude Code en Windows con varias sesiones a la vez · Adeorq',
  descripcion:
    'Cómo instalar Claude Code en Windows sin WSL y tener varias sesiones a la vez en una sola ventana, cada una en su terminal de verdad.',
  miga: 'Claude Code en Windows',
  h1: 'Claude Code en Windows, con varias sesiones a la vez',
  entrada:
    'Claude Code funciona nativo en Windows 10 y 11, <b>sin WSL</b>. Se instala con una línea de PowerShell. Para tener varias sesiones a la vez, Adeorq las abre en una sola ventana, cada una en su terminal de verdad.',
  indice: [
    ['instalar', 'Instalar Claude Code'],
    ['varias-sesiones', 'Varias sesiones a la vez'],
    ['que-ves', 'Qué ves en Adeorq'],
    ['app-escritorio', 'La app de escritorio de Claude'],
  ],
  secciones: {
    instalar: [
      'Instalar Claude Code en Windows',
      () =>
        [
          pasos([
            'Abre PowerShell y ejecuta <code>irm https://claude.ai/install.ps1 | iex</code>. <b>No hace falta ser administrador.</b>',
            'Escribe <code>claude</code> en la carpeta de tu proyecto e inicia sesión. Necesitas un plan Pro, Max, Ultra, Team o Enterprise, o una cuenta de Console: el plan gratuito de Claude no incluye Claude Code.',
          ]),
          parrafos(
            'Pide Windows 10 1809 o posterior. Git for Windows es opcional, pero Anthropic lo recomienda para que Claude Code pueda usar Bash; sin él, usa PowerShell.',
          ),
        ].join('\n'),
    ],
    'varias-sesiones': [
      'Varias sesiones a la vez, en una ventana',
      (lang) =>
        [
          pasos([
            '<a href="https://github.com/Mun1to/Adeorq-releases/releases/latest/download/Adeorq-setup.exe" rel="noopener">Descarga Adeorq</a> y ábrelo. No pide cuenta. Windows puede avisarte de que el instalador viene de un editor desconocido: es el aviso normal de SmartScreen con una aplicación joven y poco descargada.',
            '<b>Elige el proyecto.</b> Tus carpetas salen en la lista. Un clic y se abre una terminal dentro, con tu PATH y tu perfil.',
            '<b>Elige Claude Code.</b> Entra con la sesión que ya tienes en tu equipo: ni te pide una clave ni te crea otra cuenta.',
            '<b>Abre la siguiente.</b> En el mismo proyecto o en otro. <kbd>Ctrl</kbd> + <kbd>Mayús</kbd> + <kbd>→</kbd> parte el panel a la derecha y <kbd>Ctrl</kbd> + <kbd>Mayús</kbd> + <kbd>↓</kbd>, abajo.',
          ]),
          figura(
            lang,
            'cockpit',
            'La Cabina de Adeorq con cuatro terminales abiertas y la barra lateral de proyectos a la izquierda',
            'La Cabina con cuatro terminales a la vez. A la izquierda, los proyectos y sus sesiones.',
          ),
          parrafos(
            `Si dos sesiones van a tocar los mismos archivos, dale a cada una su copia: <code>claude --worktree nombre</code> la abre en un <a href="${DOCS}/worktrees" rel="noopener">worktree de git</a> aparte. Y ten en cuenta que varias sesiones a la vez gastan tu cuota más deprisa.`,
          ),
        ].join('\n'),
    ],
    'que-ves': [
      'Qué ves con todas abiertas',
      () =>
        lista([
          '<b>Quién acabó:</b> el panel se enciende cuando un agente termina su turno.',
          '<b>Quién te espera:</b> si Claude Code te pide permiso, la pregunta sale con botones encima de su terminal.',
          '<b>Cuánto llevas:</b> lo gastado de la sesión y de la semana, por cuenta.',
          '<b>Lo de ayer:</b> un clic en una sesión de la barra la retoma con toda su memoria.',
          '<b>Lejos del PC:</b> contestas desde el móvil.',
        ]),
    ],
    'app-escritorio': [
      '¿Y la app de escritorio de Claude?',
      () =>
        parrafos(
          `Anthropic tiene <a href="${DOCS}/desktop-quickstart" rel="noopener">su propia app de escritorio</a> para Windows, con Claude Code dentro y sesiones en paralelo. <b>Si solo usas Claude Code y te gusta su interfaz, es la opción oficial.</b>`,
          'Adeorq es otra cosa: el CLI de siempre en terminales reales, con Codex, Gemini CLI y otros clientes al lado, en la misma ventana.',
        ),
    ],
  },
  preguntas: [
    {
      q: '¿Hace falta WSL para usar Claude Code en Windows?',
      a: 'No. Claude Code funciona nativo en Windows, y también dentro de WSL si ya trabajas ahí.',
    },
    {
      q: '¿Adeorq incluye Claude Code?',
      a: 'No. Adeorq usa el Claude Code que ya tienes instalado y la sesión que ya tienes iniciada. Lo que gastes va contra tu cuenta, igual que si escribieras en la terminal a mano. Adeorq no está afiliado a Anthropic.',
    },
    {
      q: '¿Cuántas sesiones puedo abrir a la vez?',
      a: 'Tantas terminales como te quepan, cada una con su proyecto, su cliente y su modelo. El límite real es tu cuota y la memoria de tu equipo.',
    },
    {
      q: '¿Por qué Windows me avisa al instalar Adeorq?',
      a: 'Porque el instalador todavía no tiene certificado de editor, y SmartScreen desconfía por defecto de lo que se ha descargado poco. Las actualizaciones sí van firmadas y las verifica la app. Antes de ejecutar nada, comprueba que el archivo viene de nuestra página de versiones en GitHub.',
    },
  ],
  cierre: 'Gratis y sin cuenta. Si ya tienes Claude Code, en dos minutos lo tienes trabajando en varias terminales.',
}

const EN = {
  titulo: 'Claude Code on Windows with several sessions at once · Adeorq',
  descripcion:
    'How to install Claude Code on Windows without WSL and keep several sessions open at once in one window, each in its own real terminal.',
  miga: 'Claude Code on Windows',
  h1: 'Claude Code on Windows, with several sessions at once',
  entrada:
    'Claude Code runs natively on Windows 10 and 11, <b>without WSL</b>. It installs with one line of PowerShell. To keep several sessions going at once, Adeorq opens them in a single window, each in its own real terminal.',
  indice: [
    ['instalar', 'Install Claude Code'],
    ['varias-sesiones', 'Several sessions at once'],
    ['que-ves', 'What you see in Adeorq'],
    ['app-escritorio', 'The Claude desktop app'],
  ],
  secciones: {
    instalar: [
      'Install Claude Code on Windows',
      () =>
        [
          pasos([
            'Open PowerShell and run <code>irm https://claude.ai/install.ps1 | iex</code>. <b>You do not need to be an administrator.</b>',
            'Type <code>claude</code> in your project folder and sign in. You need a Pro, Max, Ultra, Team or Enterprise plan, or a Console account: the free Claude plan does not include Claude Code.',
          ]),
          parrafos(
            'It needs Windows 10 1809 or later. Git for Windows is optional, but Anthropic recommends it so Claude Code can use Bash; without it, Claude Code uses PowerShell.',
          ),
        ].join('\n'),
    ],
    'varias-sesiones': [
      'Several sessions at once, in one window',
      (lang) =>
        [
          pasos([
            '<a href="https://github.com/Mun1to/Adeorq-releases/releases/latest/download/Adeorq-setup.exe" rel="noopener">Download Adeorq</a> and open it. There is no account to create. Windows may warn you that the installer comes from an unknown publisher: it is SmartScreen’s usual warning for a young app with few downloads.',
            '<b>Pick the project.</b> Your folders are in the list. One click opens a terminal inside, with your PATH and your profile.',
            '<b>Pick Claude Code.</b> It signs in with the session you already have on your machine: it neither asks for a key nor creates another account.',
            '<b>Open the next one.</b> In the same project or another. <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>→</kbd> splits the pane to the right and <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>↓</kbd> splits it down.',
          ]),
          figura(
            lang,
            'cockpit',
            'The Adeorq Cockpit with four open terminals and the project sidebar on the left',
            'The Cockpit with four terminals at once. On the left, projects and their sessions.',
          ),
          parrafos(
            `If two sessions are going to touch the same files, give each one its own copy: <code>claude --worktree name</code> opens it in a separate <a href="${DOCS}/worktrees" rel="noopener">git worktree</a>. And keep in mind that several sessions at once use up your quota faster.`,
          ),
        ].join('\n'),
    ],
    'que-ves': [
      'What you see with all of them open',
      () =>
        lista([
          '<b>Who finished:</b> the pane lights up when an agent ends its turn.',
          '<b>Who is waiting for you:</b> when Claude Code asks for permission, the question appears with buttons above its terminal.',
          '<b>How much you have used:</b> session and weekly usage, per account.',
          '<b>Yesterday’s work:</b> one click on a session in the sidebar resumes it with its whole memory.',
          '<b>Away from the PC:</b> you answer from your phone.',
        ]),
    ],
    'app-escritorio': [
      'What about the Claude desktop app?',
      () =>
        parrafos(
          `Anthropic has <a href="${DOCS}/desktop-quickstart" rel="noopener">its own desktop app</a> for Windows, with Claude Code inside and parallel sessions. <b>If you only use Claude Code and like its interface, that is the official option.</b>`,
          'Adeorq is something else: the same CLI in real terminals, with Codex, Gemini CLI and other clients next to it, in the same window.',
        ),
    ],
  },
  preguntas: [
    {
      q: 'Do I need WSL to use Claude Code on Windows?',
      a: 'No. Claude Code runs natively on Windows, and also inside WSL if you already work there.',
    },
    {
      q: 'Does Adeorq include Claude Code?',
      a: 'No. Adeorq uses the Claude Code you already have installed and the session you are already signed in to. What you spend goes against your account, just as if you typed in the terminal by hand. Adeorq is not affiliated with Anthropic.',
    },
    {
      q: 'How many sessions can I open at once?',
      a: 'As many terminals as fit, each with its own project, client and model. The real limit is your quota and your machine’s memory.',
    },
    {
      q: 'Why does Windows warn me when I install Adeorq?',
      a: 'Because the installer does not have a publisher certificate yet, and SmartScreen distrusts by default anything that has been downloaded little. Updates are signed and the app verifies them. Before running anything, check that the file comes from our releases page on GitHub.',
    },
  ],
  cierre: 'Free, no account. If you already have Claude Code, you can have it working in several terminals in two minutes.',
}

export function textosClaudeWindows(lang) {
  const t = lang === 'en' ? EN : ES
  return {
    ...t,
    cuerpo: Object.entries(t.secciones)
      .map(([id, [titulo, html]]) => seccion(lang, id, titulo, html(lang)))
      .join('\n\n'),
  }
}
