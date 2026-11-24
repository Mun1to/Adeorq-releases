/**
 * /comparativa y /en/comparison: Adeorq frente a Warp, Vibe Kanban y Claude Squad.
 *
 * Cada dato de las otras sale de su web, su documentación o su repositorio, comprobado el
 * 18 de noviembre de 2026. Lo que su fuente oficial no dice va como «Sin dato oficial»,
 * nunca como «No». Caduca: precios, licencias y estado cambian; se vuelve a leer antes de
 * tocar esta página.
 */
import { lista, parrafos, seccion, tablaFichas } from './armazon.mjs'

const enlace = (href, texto) => `<a href="${href}" rel="noopener">${texto}</a>`

const F = {
  warp: 'https://docs.warp.dev/getting-started/quickstart/installation-and-setup',
  warpPrecios: 'https://www.warp.dev/pricing',
  warpRepo: 'https://github.com/warpdotdev/warp',
  warpAgentes: 'https://docs.warp.dev/agents/cli-agents/overview',
  warpMovil: 'https://docs.warp.dev/agents/cli-agents/remote-control',
  vibeDocs: 'https://vibekanban.com/docs/getting-started',
  vibeRepo: 'https://github.com/BloopAI/vibe-kanban',
  vibeCierre: 'https://www.vibekanban.com/blog/shutdown',
  squad: 'https://github.com/smtg-ai/claude-squad',
  squadWeb: 'https://smtg-ai.github.io/claude-squad/',
}

const ES = {
  titulo: 'Adeorq frente a Warp, Vibe Kanban y Claude Squad · comparativa',
  descripcion:
    'Adeorq, Warp, Vibe Kanban y Claude Squad comparados con datos de sus fuentes oficiales: sistemas, precio, licencia, cuenta y agentes, y dónde gana cada uno.',
  miga: 'Frente a Warp y otros',
  h1: 'Adeorq frente a Warp, Vibe Kanban y Claude Squad',
  entrada:
    'Las cuatro sirven para trabajar con varios agentes de IA, y cada una lo enfoca distinto. <b>Adeorq es un panel de escritorio</b> que abre tus CLI en terminales de verdad, sin cuenta. Aquí tienes los datos y también dónde gana cada una.',
  indice: [
    ['tabla', 'Las cuatro, frente a frente'],
    ['gana-cada-una', 'Dónde gana cada una'],
    ['cual', 'Cuál te conviene'],
    ['fuentes', 'De dónde salen los datos'],
  ],
  secciones: {
    tabla: [
      'Las cuatro, frente a frente',
      () =>
        tablaFichas(
          ['', 'Adeorq', 'Warp', 'Vibe Kanban', 'Claude Squad'],
          [
            ['Qué es', 'Panel de escritorio con terminales reales', 'Terminal con agente propio', 'Herramienta para planificar y revisar el trabajo de agentes', 'App de terminal que gestiona varios agentes'],
            ['Sistemas', 'Windows, Linux y Mac con Apple Silicon', 'Windows, Linux y macOS', 'Publica binarios para Windows, Linux y macOS', 'Publica binarios para los tres; en Windows pide instalar tmux por WSL u otro método'],
            ['Precio', 'Gratis', 'Plan gratis; de pago desde 18 $ al mes con pago anual', 'Gratis para uso individual', 'Sin dato oficial'],
            ['Licencia', 'AGPL v3: open source', 'Cliente AGPL v3; del servidor, sin dato oficial', 'Apache 2.0', 'AGPL v3'],
            ['Cuenta', 'No hace falta', 'Opcional, pero sin ella la IA queda en espera', 'Opcional; su documentación dice que sin ella no hay tablero', 'Sin dato oficial'],
            ['Agentes', '10 clientes','Su agente y 16 CLI de otros', '10 agentes', 'Claude Code, Codex, Gemini, Aider, OpenCode y Amp'],
            ['Aislar cada sesión', 'Modo Espejo: una rama aparte, si lo eliges al abrir', 'Sin dato oficial', 'Worktree automático', 'Worktree y rama por sesión'],
            ['Desde el móvil', 'Sí, por Tailscale: sesiones, terminales y avisos', 'Sí, por el navegador, en sesiones que publicas', 'Sin dato oficial', 'Sin dato oficial'],
          ],
        ),
    ],
    'gana-cada-una': [
      'Dónde gana cada una',
      () =>
        lista([
          '<b>Warp</b> trae su propio agente y agentes en la nube que arrancan por horario, CI o webhooks. Adeorq no trae agentes en la nube.',
          '<b>Vibe Kanban</b> crea un worktree para cada tarea y lanza tu agente dentro. <b>Ojo:</b> la empresa que lo hacía anunció su cierre el 10 de abril de 2026 y la retirada de sus servicios remotos, y el proyecto queda en manos de la comunidad.',
          '<b>Claude Squad</b> vive dentro de la terminal y aísla cada sesión en su rama. Si ya trabajas con tmux, encaja en lo que haces.',
          '<b>Adeorq</b> funciona nativo en Windows, sin WSL ni tmux y sin cuenta. Ves quién acabó y quién te espera, lo gastado por cuenta, y contestas desde el móvil. En Mac todavía no se ha usado a diario.',
        ]),
    ],
    cual: [
      'Cuál te conviene',
      () =>
        lista([
          '<b>Quieres una terminal nueva con agente y nube incluidos:</b> Warp.',
          '<b>Quieres que cada tarea nazca en su propio worktree:</b> Vibe Kanban, sabiendo que queda en manos de la comunidad.',
          '<b>Vives en tmux, en Linux o Mac:</b> Claude Squad.',
          '<b>Trabajas con varios CLI a la vez y quieres verlos todos en una ventana:</b> Adeorq.',
        ]),
    ],
    fuentes: [
      'De dónde salen los datos',
      () =>
        parrafos(
          `<span class="doc-fuentes">Comprobado el 18 de noviembre de 2026 en las fuentes oficiales de cada una. Warp: ${enlace(F.warp, 'instalación')}, ${enlace(F.warpPrecios, 'precios')}, ${enlace(F.warpRepo, 'repositorio')}, ${enlace(F.warpAgentes, 'agentes')} y ${enlace(F.warpMovil, 'control remoto')}. Vibe Kanban: ${enlace(F.vibeDocs, 'documentación')}, ${enlace(F.vibeRepo, 'repositorio')} y ${enlace(F.vibeCierre, 'anuncio de cierre')}. Claude Squad: ${enlace(F.squad, 'repositorio')} y ${enlace(F.squadWeb, 'web')}. «Sin dato oficial» quiere decir que su fuente oficial no lo dice. Si algo ha cambiado, ${enlace('https://github.com/Mun1to/Adeorq-releases/issues', 'avísanos')} y se corrige.</span>`,
        ),
    ],
  },
  preguntas: [
    {
      q: '¿Adeorq es open source?',
      a: 'Sí. El código está publicado entero con la licencia AGPL-3.0: puedes leerlo, usarlo en tu trabajo, modificarlo, compartirlo y hasta venderlo. La condición principal es que siga abierto: si repartes Adeorq o una versión cambiada, o dejas usar por red una versión que has cambiado, das también su código con la misma licencia.',
    },
    {
      q: '¿Vibe Kanban sigue funcionando?',
      a: 'Sí, con matices. La empresa anunció su cierre el 10 de abril de 2026 y la retirada de sus servicios remotos. Los espacios de trabajo locales siguen funcionando, el proyecto continúa como código abierto de la comunidad y su última versión es del 15 de noviembre de 2026.',
    },
    {
      q: '¿Puedo usar Claude Squad en Windows?',
      a: 'Publica binarios para Windows, pero necesita tmux, y su instalador dice que lo instales por WSL u otro método. Su documentación no declara qué sistemas admite.',
    },
    {
      q: '¿Warp y Adeorq abren los mismos agentes?',
      a: 'Coinciden en muchos, como Claude Code, Codex, Gemini CLI y opencode. Warp suma además su propio agente, y Adeorq te enseña tus cuentas y la cuota de los clientes que la publican.',
    },
  ],
  cierre: 'Gratis y sin cuenta: pruébalo con los agentes que ya usas y compara tú.',
  marcas:
    'No afiliado a Warp, Vibe Kanban, Claude Squad, Anthropic, OpenAI, Google ni Microsoft. Sus nombres y logotipos son marcas de sus titulares, y aquí solo identifican de qué herramienta se habla.',
}

const EN = {
  titulo: 'Adeorq vs Warp, Vibe Kanban and Claude Squad · comparison',
  descripcion:
    'Adeorq, Warp, Vibe Kanban and Claude Squad compared with data from their official sources: systems, price, licence, account and agents, and where each one wins.',
  miga: 'Against Warp and others',
  h1: 'Adeorq vs Warp, Vibe Kanban and Claude Squad',
  entrada:
    'All four help you work with several AI agents, and each one goes about it differently. <b>Adeorq is a desktop panel</b> that opens your CLIs in real terminals, with no account. Here are the facts, and where each one wins.',
  indice: [
    ['tabla', 'The four, head to head'],
    ['gana-cada-una', 'Where each one wins'],
    ['cual', 'Which one suits you'],
    ['fuentes', 'Where the data comes from'],
  ],
  secciones: {
    tabla: [
      'The four, head to head',
      () =>
        tablaFichas(
          ['', 'Adeorq', 'Warp', 'Vibe Kanban', 'Claude Squad'],
          [
            ['What it is', 'Desktop panel with real terminals', 'Terminal with its own agent', 'Tool to plan and review the work of agents', 'Terminal app that manages several agents'],
            ['Systems', 'Windows, Linux and Mac with Apple Silicon', 'Windows, Linux and macOS', 'Publishes binaries for Windows, Linux and macOS', 'Publishes binaries for all three; on Windows it asks you to install tmux via WSL or another method'],
            ['Price', 'Free', 'Free plan; paid from $18 a month billed yearly', 'Free for individual use', 'No official info'],
            ['Licence', 'AGPL v3: open source', 'Client AGPL v3; server, no official info', 'Apache 2.0', 'AGPL v3'],
            ['Account', 'Not needed', 'Optional, but without one AI stays on hold', 'Optional; its docs say there is no board without one', 'No official info'],
            ['Agents', '10 clients','Its own agent and 16 third-party CLIs', '10 agents', 'Claude Code, Codex, Gemini, Aider, OpenCode and Amp'],
            ['Isolating each session', 'Mirror Mode: a separate branch, if you choose it on opening', 'No official info', 'Automatic worktree', 'Worktree and branch per session'],
            ['From your phone', 'Yes, over Tailscale: sessions, terminals and notifications', 'Yes, in the browser, for sessions you publish', 'No official info', 'No official info'],
          ],
        ),
    ],
    'gana-cada-una': [
      'Where each one wins',
      () =>
        lista([
          '<b>Warp</b> brings its own agent and cloud agents that start from schedules, CI or webhooks. Adeorq does not bring cloud agents.',
          '<b>Vibe Kanban</b> creates a worktree for each task and launches your agent inside it. <b>Note:</b> the company behind it announced its shutdown on 10 April 2026 and the removal of its remote services, and the project is left in the hands of the community.',
          '<b>Claude Squad</b> lives inside the terminal and isolates each session on its own branch. If you already work with tmux, it fits right in.',
          '<b>Adeorq</b> runs natively on Windows, with no WSL, no tmux and no account. You see who finished and who is waiting for you, the usage per account, and you answer from your phone. It has not been used daily on a Mac yet.',
        ]),
    ],
    cual: [
      'Which one suits you',
      () =>
        lista([
          '<b>You want a new terminal with an agent and cloud included:</b> Warp.',
          '<b>You want each task to start in its own worktree:</b> Vibe Kanban, knowing it is in the hands of the community.',
          '<b>You live in tmux, on Linux or Mac:</b> Claude Squad.',
          '<b>You work with several CLIs at once and want to see them all in one window:</b> Adeorq.',
        ]),
    ],
    fuentes: [
      'Where the data comes from',
      () =>
        parrafos(
          `<span class="doc-fuentes">Checked on 18 November 2026 in each tool’s official sources. Warp: ${enlace(F.warp, 'installation')}, ${enlace(F.warpPrecios, 'pricing')}, ${enlace(F.warpRepo, 'repository')}, ${enlace(F.warpAgentes, 'agents')} and ${enlace(F.warpMovil, 'remote control')}. Vibe Kanban: ${enlace(F.vibeDocs, 'documentation')}, ${enlace(F.vibeRepo, 'repository')} and ${enlace(F.vibeCierre, 'shutdown notice')}. Claude Squad: ${enlace(F.squad, 'repository')} and ${enlace(F.squadWeb, 'website')}. “No official info” means its official source does not say. If something has changed, ${enlace('https://github.com/Mun1to/Adeorq-releases/issues', 'tell us')} and it gets fixed.</span>`,
        ),
    ],
  },
  preguntas: [
    {
      q: 'Is Adeorq open source?',
      a: 'Yes. The code is published in full under the AGPL-3.0: you can read it, use it at work, modify it, share it and even sell it. The main condition is that it stays open: if you distribute Adeorq or a modified version, or let people use a modified version over a network, you also share its source under the same licence.',
    },
    {
      q: 'Does Vibe Kanban still work?',
      a: 'Yes, with caveats. The company announced its shutdown on 10 April 2026 and the removal of its remote services. Local workspaces keep working, the project continues as community open source, and its latest release is from 15 November 2026.',
    },
    {
      q: 'Can I use Claude Squad on Windows?',
      a: 'It publishes Windows binaries, but it needs tmux, and its installer tells you to install that via WSL or another method. Its documentation does not state which systems it supports.',
    },
    {
      q: 'Do Warp and Adeorq open the same agents?',
      a: 'Many of them, such as Claude Code, Codex, Gemini CLI and opencode. Warp adds its own agent, and Adeorq shows your accounts and the quota of the clients that publish it.',
    },
  ],
  cierre: 'Free, no account: try it with the agents you already use and compare for yourself.',
  marcas:
    'Not affiliated with Warp, Vibe Kanban, Claude Squad, Anthropic, OpenAI, Google or Microsoft. Their names and logos are trademarks of their owners, and here they only identify the tool being discussed.',
}

export function textosComparativa(lang) {
  const t = lang === 'en' ? EN : ES
  return {
    ...t,
    cuerpo: Object.entries(t.secciones)
      .map(([id, [titulo, html]]) => seccion(lang, id, titulo, html(lang)))
      .join('\n\n'),
  }
}
