/* ===========================================================================
   Adeorq · portada/en.mjs
   El inglés de la portada, clave por clave. Cada clave es un `data-en` de
   index.html (o un `data-en-attr`), y scripts/hacer-ingles.mjs genera con esto
   /en/index.html en cada build: el español sigue siendo la única fuente del
   HTML, y si una clave falta aquí el build se para y dice cuál.

   Las que llevan HTML dentro lo llevan igual que en español (negritas,
   enlaces, el punto de la etiqueta). `{n}` es el primer número del texto
   español del mismo elemento: los 22 clientes o las versiones publicadas, que
   no se escriben a mano en ningún idioma.

   Los nombres de las pantallas son los de la app en inglés (src/lib/i18n.ts):
   Dashboard, Cockpit, Foreman, Canvas, Memory, Accounts, Commands, Settings.
   ========================================================================= */

const PUNTO = '<span class="etiqueta__punto" aria-hidden="true"></span>'

export default {
  /* ── Cabecera ──────────────────────────────────────────────────────────── */
  'meta.titulo': 'Adeorq · the panel where your agents work',
  'meta.desc':
    'Desktop panel for Windows and Linux: Claude Code, Codex, Gemini and the other CLIs at once, ' +
    'in real terminals, and from your phone too.',

  /* ── La barra ──────────────────────────────────────────────────────────── */
  saltar: 'Skip to content',
  'nav.aria': 'Sections',
  'nav.trabajo': 'How it works',
  'nav.queEs': 'What it does',
  'nav.clientes': 'Clients',
  'nav.movil': 'On your phone',
  'nav.idioma': 'Español',
  'nav.idioma.href': '/',
  'nav.idioma.lang': 'es',
  'nav.codigo': 'Code',
  'nav.descargar': 'Download',
  'nav.guia': 'Guide',

  /* ── El menú del móvil ─────────────────────────────────────────────────── */
  'menu.abrir': 'Open the menu',
  'menu.cerrar': 'Close the menu',
  'menu.titulo': 'Menu',
  'menu.codigo': 'Code on GitHub',

  /* ── El haz ────────────────────────────────────────────────────────────── */
  'hero.linea1': 'All your agents,',
  'hero.linea2': 'on one single screen',
  'hero.entrada':
    'Claude Code, Codex, Gemini and nineteen other clients, each in its own real terminal, with ' +
    'your projects one click away. You hand over the job and they get to work.',
  'descarga.windows': 'Download for Windows',
  'descarga.gratis': 'free, no account',
  'hero.verComo': 'See how it works',
  'hero.nota1': 'Windows and Linux · 64-bit',
  'hero.nota2': 'Signed updates',
  'hero.nota3': 'Uses the session you already have',
  'hero.demo': 'Adeorq running, you can use it',
  'hero.demo.corto': 'Adeorq running',
  'hero.demo.src': '/demo/?desnuda=1&lang=en',
  'hero.pie': 'This is not a screenshot: try it right here.',

  /* ── Los clientes ──────────────────────────────────────────────────────── */
  'cinta.rotulo': 'The <b>{n} clients</b><br>it can open',
  'cinta.legal':
    'All are trademarks of their owners. Adeorq is not affiliated with any of them and does not ' +
    'resell their access: it works with the session you already have on your machine.',

  /* ── El manifiesto ─────────────────────────────────────────────────────── */
  'manifiesto.b': 'Type the job, dictate it, or hand the whole mission to six agents at once.',
  'manifiesto.span':
    'Each one opens its terminal, works in your folder and leaves you the result. You review what ' +
    'comes out, not the syntax.',
  'manifiesto.em': 'Vibe coding through the terminal, with the face of an app.',
  'manifiesto.firma':
    'Adeorq is built by using it every day. Its code is ' +
    '<a href="https://github.com/Mun1to/Adeorq-releases" rel="noopener">published</a> and can be ' +
    'read in full.',

  /* ── Qué hace ──────────────────────────────────────────────────────────── */
  'queEs.etiqueta': PUNTO + 'What it does',
  'queEs.tit': '<b>Nine screens,</b> <span>one window</span>',
  'queEs.entrada':
    'Dashboard, Cockpit, Chat, Agenda, Canvas, Memory, Accounts, Commands and Settings. All inside a ' +
    'native app of about 6 MB, without a whole browser packed inside.',
  'ficha.cabina.tit': 'Cockpit',
  'ficha.cabina.p':
    'As many panes as fit, each with its own project, client and model. They split to the right or ' +
    'below, however you like.',
  'ficha.panel.tit': 'Dashboard',
  'ficha.panel.p':
    'The front page of your day: which sessions you have, in which project, which are still alive ' +
    'and which are waiting for you.',
  'ficha.capataz.tit': 'Foreman',
  'ficha.capataz.p':
    'Give it a big job: it splits the work by files and puts together a crew of up to six ' +
    'terminals. Before opening them it shows you what it will cost.',
  'ficha.chat.tit': 'Chat',
  'ficha.chat.p':
    'The same sessions without the console in front. Underneath it is still your CLI, so it spends ' +
    'your subscription, not a per-token bill. In testing.',
  'ficha.lienzo.tit': 'Canvas',
  'ficha.lienzo.p':
    'An infinite table with notes, kanban, images and loose terminals on top. Drag a card off the ' +
    'board and an agent goes off to do it.',
  'ficha.memoria.tit': 'Memory and Agenda',
  'ficha.memoria.p':
    'Your notes are searched by what they say, not by what they are called. And the ideas that come ' +
    'up on the fly land in an inbox: the agents propose, you accept or discard.',

  /* ── Cómo trabaja ──────────────────────────────────────────────────────── */
  'trabajo.etiqueta': PUNTO + 'How it works',
  'trabajo.tit': 'Three steps and they are already working',
  'trabajo.p1.tit': 'Pick the project',
  'trabajo.p1.p':
    'Your folders show up in the list. One click and a terminal opens inside, with your PATH and ' +
    'your profile.',
  'trabajo.p2.tit': 'Pick the client',
  'trabajo.p2.p':
    'Claude Code, Codex, Gemini or whichever you use. It signs in with the session that CLI already ' +
    'has on your machine: it neither asks for a key nor creates another account.',
  'trabajo.p3.tit': 'Hand over the job',
  'trabajo.p3.p':
    'Type it or dictate it. If it is big, the Foreman splits it by files and shares it among up to ' +
    'six terminals, each with its own part.',
  'trabajo.cierre':
    'When one finishes, its pane lights up. The crew board tells you who is working, who is done ' +
    'and who has been waiting for you for a while.',

  /* ── En el móvil ───────────────────────────────────────────────────────── */
  'movil.etiqueta': PUNTO + 'On your phone',
  'movil.tit': 'Your cockpit, in your pocket too',
  'movil.entrada':
    'From your phone, a tablet or another computer, wherever you are: talk to the concierge, read ' +
    'your sessions and answer any terminal.',
  'movil.p1.tit': 'Install Tailscale',
  'movil.p1.p':
    'On the PC and on your phone, with the same account. It is a private network between your ' +
    'devices, free for personal use.',
  'movil.p2.tit': 'Turn it on in Adeorq',
  'movil.p2.p':
    'In Settings › Mobile, flip the switch and press “Bring the concierge to Tailscale”. Only the ' +
    'first time.',
  'movil.p3.tit': 'Pair your phone',
  'movil.p3.p':
    'Scan the QR code, type the six-digit code and you are done. If you like, install it as an app ' +
    'and it tells you when an agent asks you something.',
  'movil.cierre':
    'It cannot be seen from the internet: only the devices you pair get in, and what you see comes ' +
    'straight from your PC, without going through any server of ours. ' +
    '<a href="/guia#movil">All the steps in the guide</a>.',

  /* ── Tu cuenta ─────────────────────────────────────────────────────────── */
  'cuenta.tit': 'Your code does not pass through here',
  'cuenta.c1.tit': 'No account, no keys',
  'cuenta.c1.p':
    'Adeorq signs in with the session your CLIs already have. What you spend goes against your ' +
    'account, just as if you typed in the terminal by hand.',
  'cuenta.c2.tit': 'And if you use keys, into the vault',
  'cuenta.c2.p':
    'On Windows, API keys are stored encrypted in the Credential Manager and never come back out, ' +
    'not even to the interface itself. On Linux, in a file only your user can read.',
  'cuenta.c3.tit': 'Streaming mode',
  'cuenta.c3.p':
    'One shortcut covers paths, emails and keys in every terminal at once, for when you share your ' +
    'screen or record.',

  /* ── Descarga ──────────────────────────────────────────────────────────── */
  'descarga.etiqueta': PUNTO + 'Download',
  'descarga.tit': 'Set up your cockpit in two minutes',
  'descarga.entrada':
    'For 64-bit Windows and Linux. You need the CLI you already use installed, because Adeorq works ' +
    'with it.',
  'descarga.btnWindows': 'Download for Windows <em>free, no account</em>',
  'descarga.btnLinux': 'Download for Linux <em>AppImage, .deb or .rpm</em>',
  'descarga.requisitos': 'Windows 10 and 11 · Linux with glibc 2.35 or newer',
  'descarga.precio': 'Free. No account, no 14-day trial, no card.',
  'descarga.nota':
    'Windows may warn you that the installer comes from an unknown publisher. It is SmartScreen’s ' +
    'usual warning for a young app with few downloads: further down we explain how to check the ' +
    'package is ours.',

  /* ── Novedades ─────────────────────────────────────────────────────────── */
  'novedades.etiqueta': PUNTO + 'What’s new',
  'novedades.tit': 'It moves almost every day',
  'novedades.entrada':
    '<b data-log-cuenta>{n}</b> releases published since it started. This is not a website with a ' +
    'product behind it: it is a product used while it is being built.',
  'novedades.todas': 'See all releases',

  /* ── Preguntas ─────────────────────────────────────────────────────────── */
  'faq.etiqueta': PUNTO + 'Questions',
  'faq.tit': 'What people usually ask',
  'faq.q1': 'Do I need an API key or to pay for anything extra?',
  'faq.r1':
    'No. Adeorq uses the CLI you already have installed and the session you are already signed ' +
    'into. It asks for no keys, stores no credentials and sends your code to no server of ours. ' +
    'Whatever quota you spend, you spend just as you would typing in the terminal by hand.',
  'faq.q2': 'Does it work with anything other than Claude Code?',
  'faq.r2':
    'It knows {n} clients, among them Codex, Gemini CLI, Copilot, Cursor, opencode, Antigravity, ' +
    'Kiro, Grok and Qwen, and it can install the ones you are missing. And since the terminals are ' +
    'real, you can run whatever you want inside them, your own scripts included.',
  'faq.q3': 'Is it open source?',
  'faq.r3':
    'No, and it is worth saying clearly. The code is published in full under the PolyForm Shield ' +
    'licence: you can read it, use it at work, modify it and share it. The one thing it does not ' +
    'allow is using it to offer a product that competes with Adeorq, and that includes selling it. ' +
    'Source-available, which is not the same as free software.',
  'faq.q4': 'Why does Windows warn me when I install it?',
  'faq.r4':
    'Because the installer does not have a publisher certificate yet, and SmartScreen distrusts by ' +
    'default anything that has been downloaded little. Updates are signed and the app verifies ' +
    'them. Before running anything, check that the file comes from our releases page on GitHub.',
  'faq.q5': 'Is there a version for macOS or Linux?',
  'faq.r5': 'Linux, yes: every release publishes an AppImage, a .deb and an .rpm. macOS, not yet.',
  'faq.q6': 'Can I use it from my phone?',
  'faq.r6':
    'Yes, from any browser and wherever you are, with Tailscale: a private network between your ' +
    'devices, free for personal use. You talk to the concierge, read your sessions, type into your ' +
    'terminals, attach photos and get notifications. The PC has to be on with Adeorq open, because ' +
    'what you see on the phone is your PC.',
  'faq.q7': 'How big is it and how much does it use?',
  'faq.r7':
    'The Windows installer is around 6 MB. It is a native app made with Tauri and does not ship a ' +
    'whole browser inside, so it starts instantly and at rest you barely notice it. The rest is ' +
    'whatever your agents use, which is what they already use.',
  'faq.q8': 'Does my data leave my computer?',
  'faq.r8':
    'Only what already went out through your CLI. Adeorq reads local files to show you your ' +
    'projects and sessions, and checks whether there is a new version. If you use it from your ' +
    'phone, it goes from your PC to your phone over your Tailscale network, encrypted and without ' +
    'passing through us. Phone notifications, if you ask for them, travel encrypted through your ' +
    'browser’s push service (Google, Apple or Mozilla), which delivers them without being able to ' +
    'read them. Nothing else.',

  /* ── El pie ────────────────────────────────────────────────────────────── */
  'pie.lema': 'The panel where all your agents work. On Windows and Linux, and with you on your phone.',
  'pie.estado': '<span class="pie__punto" aria-hidden="true"></span>Free, and running.',
  'pie.aria': 'Footer',
  'pie.producto': 'Product',
  'pie.recursos': 'Resources',
  'pie.novedades': 'What’s new',
  'pie.preguntas': 'Questions',
  'pie.guia': 'The guide',
  'pie.versiones': 'All releases',
  'pie.codigo': 'Code',
  'pie.repositorio': 'The repository',
  'pie.incidencias': 'Issues and ideas',
  'pie.licencia':
    'Code published on GitHub under the PolyForm Shield licence: you can read, use, modify and ' +
    'share it, not compete with it or sell it.\n      <b>It is not open source.</b>',
  'pie.cookies': '© 2026 Adeorq · This site uses no cookies and does not track you.',
  subir: 'Back to top',
}
