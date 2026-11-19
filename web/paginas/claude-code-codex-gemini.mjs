/**
 * /claude-code-codex-gemini y /en/claude-code-codex-gemini.
 *
 * Lo de Adeorq sale de src/lib/providers.ts: `envVar` (varias cuentas), `usage` (uso a la
 * vista) y `retomable` (retomar sesiones). Lo de cada cliente, de su documentación
 * oficial, comprobada el 18 de noviembre de 2026. Caduca: se vuelve a leer antes de tocar.
 */
import { figura, parrafos, pasos, seccion, tablaFichas } from './armazon.mjs'

const F = {
  claude: 'https://code.claude.com/docs/en/setup',
  codex: 'https://learn.chatgpt.com/docs/codex/cli',
  codexAuth: 'https://learn.chatgpt.com/docs/auth',
  gemini: 'https://github.com/google-gemini/gemini-cli',
  opencode: 'https://opencode.ai/docs',
}

const enlace = (href, texto) => `<a href="${href}" rel="noopener">${texto}</a>`

/** [nombre, varias cuentas, uso a la vista, retomar sesiones], de src/lib/providers.ts. */
export const CLIENTES = [
  ['Claude Code', 1, 1, 1],
  ['Codex', 1, 1, 1],
  ['Gemini CLI', 1, 0, 1],
  ['GitHub Copilot', 0, 1, 1],
  ['Grok', 1, 0, 0],
  ['opencode', 0, 0, 0],
  ['Antigravity', 0, 0, 0],
  ['Cursor', 0, 0, 0],
  ['Pi', 1, 0, 1],
  ['Kiro CLI', 0, 0, 0],
  ['Kimi Code', 1, 0, 1],
]

const filasClientes = (si, no) => CLIENTES.map(([n, ...v]) => [n, ...v.map((x) => (x ? si : no))])

const ES = {
  titulo: 'Claude Code, Codex y Gemini CLI en el mismo panel · Adeorq',
  descripcion:
    'Abre Claude Code, Codex, Gemini CLI, opencode y otros clientes a la vez en una sola ventana, cada uno en su terminal de verdad y con tu propia cuenta.',
  miga: 'Claude Code, Codex y Gemini',
  h1: 'Claude Code, Codex y Gemini CLI en el mismo panel',
  entrada:
    'Adeorq abre <b>Claude Code, Codex, Gemini CLI y otros ocho clientes</b> a la vez, cada uno en su terminal de verdad y dentro de la misma ventana. Entra con la sesión que ya tienes en cada uno: no pide claves ni revende acceso.',
  indice: [
    ['como', 'Cómo se abren juntos'],
    ['instalar', 'Instalar cada cliente'],
    ['clientes', 'Qué hace Adeorq con cada uno'],
    ['comparar', 'Claude Code o Codex'],
  ],
  secciones: {
    como: [
      'Cómo se abren juntos',
      (lang) =>
        [
          pasos([
            '<b>Elige el proyecto.</b> Tus carpetas salen en la lista. Un clic y se abre una terminal dentro, con tu PATH y tu perfil.',
            '<b>Elige el cliente.</b> Claude Code, Codex, Gemini o el que uses. Entra con la sesión que ese CLI ya tiene en tu equipo.',
            '<b>Suelta el encargo.</b> Escríbelo o díctalo. Y abre el siguiente cliente al lado, en el mismo proyecto o en otro.',
          ]),
          figura(
            lang,
            'accounts',
            'La pantalla Cuentas de Adeorq con Claude Code, Codex y Gemini CLI conectados y lo gastado de cada cuenta',
            'Tus cuentas de cada cliente en una pantalla, con lo gastado de la sesión y de la semana.',
          ),
        ].join('\n'),
    ],
    instalar: [
      'Instalar cada cliente',
      () =>
        [
          parrafos('Adeorq trabaja con el CLI que tengas instalado. Estos son los comandos oficiales de cuatro de ellos:'),
          tablaFichas(
            ['Cliente', 'Comando', 'Con qué cuenta entras'],
            [
              ['Claude Code', '<code>irm https://claude.ai/install.ps1 | iex</code>', 'Plan Pro, Max, Ultra, Team o Enterprise, o cuenta de Console'],
              ['Codex', '<code>npm install -g @openai/codex</code>', 'Tu plan de ChatGPT o una clave de API'],
              ['Gemini CLI', '<code>npm install -g @google/gemini-cli</code>', 'Licencia de Gemini Code Assist, clave de API de pago o Vertex AI'],
              ['opencode', '<code>npm install -g @opencode/cli</code>', 'Tus proveedores, tu plan de ChatGPT o de GitHub Copilot, o sus modelos gratis'],
            ],
          ),
          parrafos(
            '<b>Ojo con Gemini CLI:</b> desde el 18 de junio de 2026, el acceso gratuito y los planes Google AI Pro y Ultra pasaron a Antigravity CLI, que Adeorq también abre.',
            `<span class="doc-fuentes">Comprobado el 18 de noviembre de 2026 en ${enlace(F.claude, 'Claude Code')}, ${enlace(F.codex, 'Codex')}, ${enlace(F.gemini, 'Gemini CLI')} y ${enlace(F.opencode, 'opencode')}.</span>`,
          ),
        ].join('\n'),
    ],
    clientes: [
      'Qué hace Adeorq con cada uno',
      () =>
        [
          parrafos('Todos corren en una terminal real. Esto es lo que Adeorq añade según el cliente:'),
          tablaFichas(['Cliente', 'Varias cuentas', 'Uso a la vista', 'Retomar sesiones'], filasClientes('Sí', 'No')),
        ].join('\n'),
    ],
    comparar: [
      '¿Claude Code o Codex?',
      () =>
        parrafos(
          'Dales el mismo encargo y mira cuál te convence. <b>Abre los dos en el mismo proyecto, uno al lado del otro</b>, y compara lo que hace cada uno con tu código. Si van a tocar los mismos archivos, ponlos en ramas distintas.',
        ),
    ],
  },
  preguntas: [
    {
      q: '¿Necesito una clave de API o pagar algo aparte?',
      a: 'No. Adeorq usa el CLI que ya tienes instalado y la sesión que ya tienes iniciada en él. No pide claves y no manda tu código a ningún servidor nuestro. Lo que gastes de cuota lo gastas igual que escribiendo en la terminal a mano.',
    },
    {
      q: '¿Adeorq abre opencode?',
      a: 'Sí. opencode es uno de los once clientes del catálogo, y se abre en su terminal como los demás.',
    },
    {
      q: '¿Puedo usar dos cuentas del mismo cliente?',
      a: 'Sí en seis de ellos: Claude Code, Codex, Gemini CLI, Grok, Pi y Kimi Code. Tú eliges con qué cuenta nace cada terminal.',
    },
    {
      q: '¿Puedo ejecutar un CLI que no esté en la lista?',
      a: 'Sí. Las terminales son reales, así que dentro puedes ejecutar lo que quieras, incluidos tus propios scripts.',
    },
  ],
  cierre: 'Gratis y sin cuenta. Funciona con los clientes que ya tienes instalados.',
  marcas:
    'No afiliado a Anthropic, OpenAI, Google, Microsoft ni a ningún otro fabricante de estos clientes. Sus nombres y logotipos son marcas de sus titulares, y aquí sólo identifican con qué herramienta estás trabajando.',
}

const EN = {
  titulo: 'Claude Code, Codex and Gemini CLI in the same panel · Adeorq',
  descripcion:
    'Open Claude Code, Codex, Gemini CLI, opencode and other clients at once in a single window, each in its own real terminal and with your own account.',
  miga: 'Claude Code, Codex and Gemini',
  h1: 'Claude Code, Codex and Gemini CLI in the same panel',
  entrada:
    'Adeorq opens <b>Claude Code, Codex, Gemini CLI and eight other clients</b> at once, each in its own real terminal and inside the same window. It signs in with the session you already have in each one: it asks for no keys and resells no access.',
  indice: [
    ['como', 'How they open together'],
    ['instalar', 'Install each client'],
    ['clientes', 'What Adeorq does with each one'],
    ['comparar', 'Claude Code or Codex'],
  ],
  secciones: {
    como: [
      'How they open together',
      (lang) =>
        [
          pasos([
            '<b>Pick the project.</b> Your folders are in the list. One click opens a terminal inside, with your PATH and your profile.',
            '<b>Pick the client.</b> Claude Code, Codex, Gemini or whichever you use. It signs in with the session that CLI already has on your machine.',
            '<b>Hand over the task.</b> Type it or dictate it. Then open the next client beside it, in the same project or another.',
          ]),
          figura(
            lang,
            'accounts',
            'The Adeorq Accounts screen with Claude Code, Codex and Gemini CLI connected and the usage of each account',
            'Your accounts for each client on one screen, with session and weekly usage.',
          ),
        ].join('\n'),
    ],
    instalar: [
      'Install each client',
      () =>
        [
          parrafos('Adeorq works with the CLI you have installed. These are the official commands for four of them:'),
          tablaFichas(
            ['Client', 'Command', 'Which account you sign in with'],
            [
              ['Claude Code', '<code>irm https://claude.ai/install.ps1 | iex</code>', 'Pro, Max, Ultra, Team or Enterprise plan, or a Console account'],
              ['Codex', '<code>npm install -g @openai/codex</code>', 'Your ChatGPT plan or an API key'],
              ['Gemini CLI', '<code>npm install -g @google/gemini-cli</code>', 'Gemini Code Assist licence, paid API key or Vertex AI'],
              ['opencode', '<code>npm install -g @opencode/cli</code>', 'Your providers, your ChatGPT or GitHub Copilot plan, or its free models'],
            ],
          ),
          parrafos(
            '<b>A note on Gemini CLI:</b> since 18 June 2026, free access and the Google AI Pro and Ultra plans have moved to Antigravity CLI, which Adeorq also opens.',
            `<span class="doc-fuentes">Checked on 18 November 2026 at ${enlace(F.claude, 'Claude Code')}, ${enlace(F.codex, 'Codex')}, ${enlace(F.gemini, 'Gemini CLI')} and ${enlace(F.opencode, 'opencode')}.</span>`,
          ),
        ].join('\n'),
    ],
    clientes: [
      'What Adeorq does with each one',
      () =>
        [
          parrafos('They all run in a real terminal. This is what Adeorq adds depending on the client:'),
          tablaFichas(['Client', 'Several accounts', 'Usage in view', 'Resume sessions'], filasClientes('Yes', 'No')),
        ].join('\n'),
    ],
    comparar: [
      'Claude Code or Codex?',
      () =>
        parrafos(
          'Give them the same task and see which one convinces you. <b>Open both in the same project, side by side</b>, and compare what each one does with your code. If they are going to touch the same files, put them on different branches.',
        ),
    ],
  },
  preguntas: [
    {
      q: 'Do I need an API key or to pay for anything extra?',
      a: 'No. Adeorq uses the CLI you already have installed and the session you are already signed in to. It asks for no keys and sends your code to no server of ours. The quota you use is the same as typing in the terminal by hand.',
    },
    {
      q: 'Does Adeorq open opencode?',
      a: 'Yes. opencode is one of the eleven clients in the catalogue, and it opens in its own terminal like the others.',
    },
    {
      q: 'Can I use two accounts of the same client?',
      a: 'Yes, on six of them: Claude Code, Codex, Gemini CLI, Grok, Pi and Kimi Code. You choose which account each terminal starts with.',
    },
    {
      q: 'Can I run a CLI that is not on the list?',
      a: 'Yes. The terminals are real, so you can run whatever you want inside them, including your own scripts.',
    },
  ],
  cierre: 'Free, no account. It works with the clients you already have installed.',
  marcas:
    'Not affiliated with Anthropic, OpenAI, Google, Microsoft or any other maker of these clients. Their names and logos are trademarks of their owners, and here they only identify which tool you are working with.',
}

export function textosVariosClientes(lang) {
  const t = lang === 'en' ? EN : ES
  return {
    ...t,
    cuerpo: Object.entries(t.secciones)
      .map(([id, [titulo, html]]) => seccion(lang, id, titulo, html(lang)))
      .join('\n\n'),
  }
}
