/* ===========================================================================
   Adeorq · portada/en.mjs
   El inglés de la portada, clave por clave. Cada clave es un `data-en` de
   index.html (o un `data-en-attr`), y scripts/hacer-ingles.mjs genera con esto
   /en/index.html en cada build: el español sigue siendo la única fuente del
   HTML, y si una clave falta aquí el build se para y dice cuál.

   Las que llevan HTML dentro lo llevan igual que en español (negritas,
   enlaces). `{n}` es el primer número del texto español del mismo elemento:
   el número de clientes o las versiones publicadas, que no se escriben a mano en
   ningún idioma.

   Los nombres de las pantallas son los de la app en inglés (src/lib/i18n.ts):
   Dashboard, Cockpit, Foreman, Canvas, Memory, Accounts, Commands, Settings.
   ========================================================================= */

export default {
  /* ── Cabecera ──────────────────────────────────────────────────────────── */
  'meta.titulo': 'Adeorq · the panel where your agents work',
  'meta.desc':
    'Desktop panel for Windows, Linux and Mac: Claude Code, Codex, Gemini and the other CLIs at once, ' +
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
    'Claude Code, Codex, Gemini and <span data-cifra-otros>eight</span> other clients <b class="clave">working at once</b>, each in its own ' +
    '<b class="clave">real terminal</b>, with your projects one click away. You hand over the job and they get to work.',
  'descarga.windows': 'Download for Windows',
  'descarga.gratis': 'free, no account',
  'hero.verComo': 'See how it works',
  'hero.cifra1': '<i>supported </i>clients',
  // El mismo número que en index.html (30,5 MB, medido el 2026-11-17), con punto.
  'hero.instalada': '30.5 MB',
  'hero.cifra2': 'installed<i> size</i>',
  'hero.cifra3': 'systems<i>: Windows, Linux and Mac. <em>On Mac, signed and notarized by Apple</em></i>',
  'hero.demo': 'Adeorq running, you can use it',
  'hero.demo.corto': 'Adeorq running',
  'hero.demo.src': '/demo/?desnuda=1&lang=en',
  'hero.pestanas': 'Demo screens',
  'hero.p.cabina': 'Cockpit',
  'hero.p.lienzo': 'Canvas',
  'hero.p.chat': 'Chat',
  'hero.p.decisiones': 'Decisions',
  'hero.p.panel': 'Dashboard',
  'hero.grande': 'Open it full size',
  'hero.grande.href': '/demo/?lang=en',

  /* ── Adeo, lo que dice en cada sección ─────────────────────────────────── */
  'adeo.hola': 'Hi, I’m <b>Adeo</b>. I live in your Adeorq and tell you when an agent needs you.',
  'adeo.celebra': 'Off it goes! Install it and I’ll see you in your top bar.',
  'adeo.queEs': 'This is what’s inside. Pick a screen and I’ll open it up there, in the demo.',
  'adeo.trabajo': 'While your agents work, I type along with them. When one finishes, I let you know.',
  'adeo.movil': 'Heading out? I’ll come along on your phone.',
  'adeo.cuenta': 'I don’t send anything to any server of ours. Your work stays between you and your CLI.',
  'adeo.descarga': 'Two minutes and I’m in your top bar, waiting for your agents.',
  'adeo.novedades': 'They improve me almost every day. That’s why I&nbsp;dance.',
  'adeo.faq': 'Questions? These are the ones I get asked most.',

  /* ── Los clientes ──────────────────────────────────────────────────────── */
  'cinta.rotulo': 'Works with what you already use',
  'cinta.legal':
    'All are trademarks of their owners. Adeorq is not affiliated with any of them and does not ' +
    'resell their access: it works with the session you already have on your machine.',

  /* ── Sin Adeorq y con Adeorq ───────────────────────────────────────────── */
  'comparar.tit': 'From loose windows to one work app',
  'comparar.entrada': 'One agent per window works until you have four. With all of them in one, you see who finished, <b class="clave">who is waiting on you</b> and <b class="clave">how much you have spent</b>, without going to look.',
  'comparar.sin': 'Without Adeorq',
  'comparar.sin1': 'One loose window per agent',
  'comparar.sin2': "You don't know who finished",
  'comparar.sin3': 'An agent waiting for your yes',
  'comparar.sin4': 'Quota runs out with no warning',
  'comparar.sin5': 'Close it and lose the session',
  'comparar.sin6': 'A big job, one step at a time',
  'comparar.sin7': 'Away from the PC, blind',
  'comparar.sin8': 'Accounts switched by hand',
  'comparar.con': 'With Adeorq',
  'comparar.con1': 'All in one window',
  'comparar.con2': 'Its pane lights up when done',
  'comparar.con3': 'Adeo tells you when it asks',
  'comparar.con4': 'You see what each account used',
  'comparar.con5': 'Resume Claude, Codex and Gemini ones',
  'comparar.con6': 'Adeo splits it across up to six',
  'comparar.con7': 'You answer from your phone',
  'comparar.con8': 'Pick the account as it opens',

  /* ── Adeo lo reparte ───────────────────────────────────────────────────── */
  'reparte.tit': 'You say it once. Adeo splits it up.',
  'reparte.entrada': 'Type it or dictate it <b class="clave">however it comes out</b>. If it is two jobs, Adeo <b class="clave">opens two sessions</b>, each in its own project.',
  'reparte.cab': 'Before Friday: the discount has to round properly and the landing page needs a dark mode.',
  'reparte.marcha': '2 sessions running',
  'reparte.dicho': 'Before Friday: the discount has to round properly and the landing page needs a dark mode.',
  'reparte.r1': "Those are two separate jobs, so I'm opening two sessions:",
  'reparte.r2': 'one in <b>storefront-api</b> for the discount',
  'reparte.r3': 'another in <b>landing-web</b> for dark mode',
  'reparte.r4': "I'll let you know when either asks you something.",
  'reparte.trabajando': 'working',
  'reparte.t1': 'Make the discount round to whole cents',
  'reparte.t1porque': '<b>The router picked it.</b> It needs judgement: if it goes wrong, it may not show.',
  'reparte.t2': 'Dark mode on the landing page',
  'reparte.t2porque': '<b>The router picked it.</b> Everyday work.',
  'reparte.caja': 'Tell it what needs doing',
  'reparte.ia': 'Adeo is an AI and can make mistakes.',

  /* ── El código, a la vista ─────────────────────────────────────────────── */
  // Open source desde el 2026-11-21: la licencia es la AGPL-3.0, con su
  // condición dicha, lo mismo que dicen el pie y las preguntas.
  'codigo.sec': 'Read all of it, and make it yours',
  'codigo.tit': 'The full source code is on GitHub',
  'codigo.p': 'Read every line, build it yourself or make your own fork, and see for yourself what it does on your machine.',
  'codigo.licencia':
    'Open source under the ' +
    '<a href="https://github.com/Mun1to/Adeorq-releases/blob/main/LICENSE" rel="noopener">AGPL-3.0</a> ' +
    'licence: you can use, modify, share and sell it, as long as the code stays open.',
  'codigo.seguro':
    '<b>Don’t trust it: <a href="https://github.com/Mun1to/Adeorq-releases#dont-trust-it-check-it" rel="noopener">check it</a>.</b> ' +
    'The security tests ship with the code: they attack an isolated Adeorq the way a bad program ' +
    'already on your PC would, and check that what was closed stays closed. And the ' +
    '<span class="junto">AI-AUDIT.md</span> prompt asks your own AI to review it.',
  'codigo.btn': 'See the code on GitHub',

  /* ── Qué hace ──────────────────────────────────────────────────────────── */
  'queEs.tit': '<b>Seven screens,</b> <span>one window</span>',
  'queEs.entrada':
    'Dashboard, Cockpit, Chat, Decisions, Canvas, Profile and Settings, and in the Profile your accounts, ' +
    'agenda, memory, commands and usage. All inside a ' +
    '<b class="clave">native app</b>, without a whole browser packed inside.',
  // La muestra: cada rasgo con su captura en inglés (assets/screens/en) y su alt.
  'rasgo.demo': 'Try it in the demo',
  'rasgo.cabina.tit': 'Cockpit',
  'rasgo.cabina.p':
    'As many terminals as fit, each with its own project, client and model. Split them to the ' +
    'right or below.',
  'rasgo.cabina.src': '/assets/screens/en/cockpit.png',
  'rasgo.cabina.alt':
    'The Cockpit with four terminals in a grid: three Claude Code sessions and one Codex session, ' +
    'one of them asking for permission before running a command.',
  'rasgo.lienzo.tit': 'Canvas and swarms',
  'rasgo.lienzo.p':
    'An infinite table with terminals, notes and boards. Drag one session onto another and they ' +
    'form a swarm: a single chat, and Adeo hands out the work.',
  'rasgo.lienzo.src': '/assets/screens/en/canvas.png',
  'rasgo.lienzo.alt':
    'The Canvas with three terminals, the board with the work of the agents, a swarm of two ' +
    'sessions with its chat, and two notes.',
  'rasgo.archivos.tit': 'Files',
  'rasgo.archivos.p':
    'The project tree and an editor next to the terminal. Each file shows its git status and a ' +
    'mark for what the agent touched.',
  'rasgo.archivos.src': '/assets/screens/en/files.png',
  'rasgo.archivos.alt':
    'Two terminals on the left and, on the right, the file cart.js open next to the project tree ' +
    'with its git changes.',
  'rasgo.decisiones.tit': 'Decisions',
  'rasgo.decisiones.p':
    'When an agent needs you to choose, it asks with numbered options and its recommended one. ' +
    'You answer and it keeps working.',
  'rasgo.decisiones.src': '/assets/screens/en/decisions.png',
  'rasgo.decisiones.alt':
    'A pending decision with two questions, their numbered options and the recommended one marked.',
  'rasgo.cuentas.tit': 'Accounts',
  'rasgo.cuentas.p':
    'Several accounts of the same CLI, each with what it has used this session and this week. ' +
    'You pick which one each terminal starts with.',
  'rasgo.cuentas.src': '/assets/screens/en/accounts.png',
  'rasgo.cuentas.alt':
    'The Claude Code and Codex accounts, each with its usage bars for the session and the week.',

  /* ── Cómo trabaja ──────────────────────────────────────────────────────── */
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
    'Type it or dictate it. If it is big, Adeo splits it by files and shares it among up to ' +
    'six terminals, each with its own part.',
  'trabajo.cierre':
    'When one finishes, its pane lights up. The crew board tells you who is working, who is done ' +
    'and who has been waiting for you for a while.',
  'trabajo.foto.src': '/assets/screens/en/board.png',
  'trabajo.foto.alt':
    'The board with the work of the agents: three tasks to do, four sessions working, one waiting ' +
    'for you and two done.',

  /* ── En el móvil ───────────────────────────────────────────────────────── */
  'movil.tit': 'Your cockpit, in your pocket too',
  'movil.entrada':
    'From your phone, a tablet or another computer, <b class="clave">wherever you are</b>: see who is asking and who is ' +
    'working, <b class="clave">answer any terminal</b> and hand Adeo new work.',
  'movil.p1.tit': 'Install Tailscale',
  'movil.p1.p':
    'On the PC and on your phone, with the same account. It is a private network between your ' +
    'devices, free for personal use.',
  'movil.p2.tit': 'Turn it on in Adeorq',
  'movil.p2.p':
    'In Settings › Mobile, flip the switch. Three rows show how this PC, Tailscale and your phone ' +
    'are doing, and the one that fails tells you what to do.',
  'movil.p3.tit': 'Pair your phone',
  'movil.p3.p':
    'Scan the QR code and type the six-digit code. At the bottom of the menu, Settings lets you ' +
    'pick your notifications, make it your own and install it as an app.',
  'movil.cierre':
    'It cannot be seen from the internet: only the devices you pair get in, and what you see comes ' +
    'straight from your PC, without going through any server of ours. ' +
    '<a href="/guia#movil">All the steps in the guide</a>.',
  'movil.foto1.src': '/assets/screens/en/phone-home.png',
  'movil.foto1.alt':
    'The phone home screen: Adeo greets you, on top what is waiting for you (a decision and two ' +
    'terminals asking you something), below it the one working right now with its blue light, and ' +
    'the box to write to Adeo.',
  'movil.foto2.src': '/assets/screens/en/phone-concierge.png',
  'movil.foto2.alt':
    'Adeo on the phone: you ask for two jobs and it opens a session for each one, with the ' +
    'model the router picked.',

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
  'descarga.tit': 'Set up your cockpit in two minutes',
  'descarga.entrada':
    'For 64-bit Windows and Linux, and for Mac with Apple Silicon. You need <b class="clave">the CLI you already use</b> ' +
    'installed, because Adeorq works ' +
    'with it.',
  'descarga.btnWindows': 'Download for Windows <em>free, no account</em>',
  'descarga.btnLinux': 'Download for Linux <em>AppImage, .deb or .rpm</em>',
  'descarga.btnMac': 'Download for Mac <em>Apple Silicon, .dmg</em>',
  'descarga.requisitos': 'Windows 10 and 11 · Linux with glibc 2.35 or newer · macOS 12 or newer on Apple Silicon',
  'descarga.precio': 'Free. No account, no 14-day trial, no card.',
  'descarga.nota':
    'Windows may warn you that the installer comes from an unknown publisher. It is SmartScreen’s ' +
    'usual warning for a young app with few downloads: further down we explain how to check the ' +
    'package is ours.',

  /* ── Novedades ─────────────────────────────────────────────────────────── */
  'novedades.tit': 'It moves almost every day',
  'novedades.tira': '<b><span data-tira-cuenta>{n}</span> of the last 90 days</b> shipped a new release.',
  'novedades.hace90': '90 days ago',
  'novedades.hoy': 'today',
  'novedades.entrada':
    '<b data-log-cuenta>{n}</b> releases published since it started. This is not a website with a ' +
    'product behind it: it is a product <b class="clave">used while it is being built</b>.',
  'novedades.todas': 'See all releases',

  /* ── Preguntas ─────────────────────────────────────────────────────────── */
  'faq.tit': 'What people usually ask',
  'faq.entrada': 'If yours is not here, ask it on GitHub: it gets answered and added here.',
  'faq.preguntar': 'Ask on GitHub',
  'faq.q1': 'Do I need an API key or to pay for anything extra?',
  'faq.r1':
    'No. Adeorq uses the CLI you already have installed and the session you are already signed ' +
    'into. It asks for no keys, stores no credentials and sends your code to no server of ours. ' +
    'Whatever quota you spend, you spend just as you would typing in the terminal by hand.',
  'faq.q2': 'Does it work with anything other than Claude Code?',
  'faq.r2':
    'It knows {n} clients, among them Codex, Gemini CLI, Copilot, Cursor, opencode, Antigravity, ' +
    'Kiro, Grok and Pi, and it can install the ones you are missing. And since the terminals are ' +
    'real, you can run whatever you want inside them, your own scripts included.',
  'faq.q3': 'Is it open source?',
  'faq.r3':
    'Yes. The code is published in full under the AGPL-3.0, a free software licence from the ' +
    'Free Software Foundation: you can read it, use it at work, modify it, share it and even sell ' +
    'it. The main condition is that it stays open: if you distribute Adeorq or a modified version, ' +
    'or let people use a modified version over a network, you also share its source under the ' +
    'same licence.',
  'faq.q4': 'Why does Windows warn me when I install it?',
  'faq.r4':
    'Because the installer does not have a publisher certificate yet, and SmartScreen distrusts by ' +
    'default anything that has been downloaded little. Updates are signed and the app verifies ' +
    'them. Before running anything, check that the file comes from our releases page on GitHub.',
  'faq.q5': 'Is there a version for macOS or Linux?',
  'faq.r5':
    'Yes, both. Linux: every release publishes an AppImage, a .deb and an .rpm. Mac: a .dmg for Apple ' +
    'Silicon (M1 and newer) with macOS 12 or newer, signed and notarized by Apple; Intel Macs are not ' +
    'supported. It has not yet been used daily on a real Mac: if something fails, tell us.',
  'faq.q6': 'Can I use it from my phone?',
  'faq.r6':
    'Yes, from any browser and wherever you are, with Tailscale: a private network between your ' +
    'devices, free for personal use. You talk to Adeo, read your sessions, type into your ' +
    'terminals, attach photos and get notifications. The PC has to be on with Adeorq open, because ' +
    'what you see on the phone is your PC.',
  'faq.q7': 'How big is it and how much does it use?',
  'faq.r7':
    'Installed, it takes 30.5 MB on Windows, and its installer is around 8 MB. It is a native app ' +
    'made with Tauri: it does not ship a whole browser inside. The rest is whatever your agents ' +
    'use, which is what they already use.',
  'faq.q8': 'Does my data leave my computer?',
  'faq.r8':
    'Only what already went out through your CLI. Adeorq reads local files to show you your ' +
    'projects and sessions, and checks whether there is a new version. If you use it from your ' +
    'phone, it goes from your PC to your phone over your Tailscale network, encrypted and without ' +
    'passing through us. Phone notifications, if you ask for them, travel encrypted through your ' +
    'browser’s push service (Google, Apple or Mozilla), which delivers them without being able to ' +
    'read them. Nothing else.',

  /* ── El pie ────────────────────────────────────────────────────────────── */
  /* ── Mods ──────────────────────────────────────────────────────────────── */
  'mods.tit': 'And your own mods, in your folder, not in the app',
  'mods.p': 'Ask your agent for a change in how Adeorq looks, like round icons. It is saved in your mods folder, apart from the app, built so that an update leaves it&nbsp;alone.',
  'mods.donde': 'They come switched off: turn them on in Settings › Mods, and if one gets in your way, Ctrl + Alt + Shift + 0 switches them all off.',
  'mods.btn': 'How mods work',

  /* ── Docs y ayuda ──────────────────────────────────────────────────────── */
  'ayuda.tit': 'Docs and help',
  'ayuda.guia': 'The guide',
  'ayuda.guia.p': 'Every screen, in the order you come across them.',
  'ayuda.movil': 'On your phone',
  'ayuda.movil.p': 'How to pair your phone and answer your agents away from the PC.',
  'ayuda.privacidad': 'Privacy',
  'ayuda.privacidad.p': 'What it reads on your machine, what it keeps and what leaves it.',
  'ayuda.novedades': 'What’s new',
  'ayuda.novedades.p': 'What each release brings, with its date.',
  'ayuda.preguntar': 'Ask',
  'ayuda.preguntar.p': 'Can’t find it? Ask on GitHub: it gets answered and added to the guide.',

  /* ── Apoyar el proyecto ────────────────────────────────────────────────── */
  'apoyar.tit': 'If it saves you time, buy me a coffee',
  'apoyar.p': 'Adeorq is free. If it helps you and you feel like supporting it, a coffee helps keep the releases coming.',
  'apoyar.btn': 'Buy me a coffee',

  'pie.lema': 'The panel where all your agents work. On Windows, Linux and Mac, and with you on your phone.',
  'pie.estado': 'Free, and running.',
  'pie.aria': 'Footer',
  'pie.producto': 'Product',
  'pie.recursos': 'Resources',
  'pie.novedades': 'What’s new',
  'pie.novedades.href': '/en/changelog',
  'pie.conLoQueUsas': 'With what you already use',
  'pie.claudeWindows': 'Claude Code on Windows',
  'pie.claudeWindows.href': '/en/claude-code-windows',
  'pie.variosClientes': 'Claude Code, Codex and Gemini',
  'pie.variosClientes.href': '/en/claude-code-codex-gemini',
  'pie.comparativa': 'Against Warp and others',
  'pie.comparativa.href': '/en/comparison',
  'pie.preguntas': 'Questions',
  'pie.guia': 'The guide',
  'pie.privacidad': 'Privacy',
  'pie.privacidad.href': '/en/privacy',
  'pie.versiones': 'All releases',
  'pie.codigo': 'Code',
  'pie.repositorio': 'The repository',
  'pie.repositorio.aria': 'The repository on GitHub',
  'pie.incidencias': 'Issues and ideas',
  'pie.licencia':
    'Code published on GitHub under the AGPL-3.0 licence: you can read, use, modify, share and ' +
    'sell it, as long as the code stays open.\n      <b>It is open source.</b>',
  'pie.cookies': '© 2026 Adeorq · This site uses no cookies and does not track you.',
  subir: 'Back to top',
}
