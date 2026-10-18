/* ============================================================================
   Adeorq · guia-i18n.js
   Diccionario ingles de la pagina de documentacion. Va como script CLASICO y
   antes que boot.js, que lo recoge de window.ADEORQ_I18N_EXTRA y lo funde con
   el suyo. El HTML nace en espanol: sin este archivo la guia se lee entera.

   Las claves que acaban en texto plano viajan por textContent; las que llevan
   <b>, <code> o un enlace dentro son las de data-i18n-html.
   ========================================================================= */

window.ADEORQ_TITULOS = {
  es: 'Guía de Adeorq · cómo se usa la cabina',
  en: 'Adeorq guide · how the cockpit works'
};

window.ADEORQ_I18N_EXTRA = {
  en: {
    /* ------------------------------ NAV Y PORTADA ------------------------ */
    'nav.guia': 'Guide',
    /* La barra de la portada, que la guía comparte desde el 2026-10-09 */
    'guia.barra.aria': 'Sections',
    'guia.barra.trabajo': 'How it works',
    'guia.barra.queEs': 'What it does',
    'guia.barra.clientes': 'Clients',
    'guia.barra.movil': 'On your phone',
    'guia.barra.codigo': 'Code',
    'guia.barra.idioma': 'Change language',
    'guia.menu.abrir': 'Open the menu',
    'guia.menu.cerrar': 'Close the menu',
    'guia.menu.titulo': 'Menu',
    'guia.menu.codigo': 'Code on GitHub',
    'guia.menu.idioma': 'Español',
    'guia.eyebrow': 'Documentation',
    'guia.titulo': 'How the cockpit works.',
    'guia.entrada': 'Adeorq is a desktop panel for Windows and Linux where your agents work in real ' +
                    'terminals, and you can also use it from your phone. ' +
                    'This guide explains what each screen does, in the order you meet them. ' +
                    'You do not have to read it all: the index on the left goes straight to what you need.',
    'guia.meta1': 'Windows 10 and 11 · Linux',
    'guia.meta2': 'Free, no account',
    'guia.meta3': 'Works with your own subscriptions',
    'guia.indice': 'In this guide',

    'guia.nav.queEs': 'What it is, and what it is not',
    'guia.nav.instalar': 'Install',
    'guia.nav.primeros': 'First steps',
    'guia.nav.cabina': 'The Cockpit',
    'guia.nav.panel': 'The Dashboard',
    'guia.nav.perfil': 'Your profile and usage',
    'guia.nav.agenda': 'The Agenda',
    'guia.nav.objetivos': 'Goals for today',
    'guia.nav.lienzo': 'The Canvas',
    'guia.nav.cuentas': 'Accounts',
    'guia.nav.ajustes': 'Settings',
    'guia.nav.movil': 'On your phone',
    'guia.nav.emision': 'Streaming mode',
    'guia.nav.pulso': 'The pulse',
    'guia.nav.atajos': 'Shortcuts',
    'guia.nav.donde': 'Where your things live',
    'guia.nav.dudas': 'Common questions',

    /* --------------------------------- QUE ES ---------------------------- */
    'guia.queEs.h': 'What it is, and what it is not',
    'guia.queEs.p1': 'Adeorq is not a chat with an AI, and it is not another code editor. It is the ' +
                     '<b>room where the agent programs you already use fit together</b>: Claude Code, Codex, ' +
                     'Gemini CLI, Antigravity and company. They work very well and they share one practical ' +
                     'problem: each one is a loose black window, and once you have four open you lose track of ' +
                     'who is working, who has finished and who has been waiting on you for ten minutes.',
    'guia.queEs.p2': 'Adeorq runs them as they are, in real terminals, and adds what they are missing around ' +
                     'them: your projects one click away, the state of every session, an agenda for whatever ' +
                     'occurs to you along the way, and a screen where you see all of them at once.',
    'guia.queEs.caja': '<span class="doc-caja__titulo">It works with your accounts.</span> ' +
                       'Adeorq neither includes nor resells access to any model. It uses the subscriptions and ' +
                       'keys you already have, and everything it does happens on your machine: there is no ' +
                       'server in between and no account to create in order to use it.',
    'guia.queEs.h3': 'Why the command line and not an app',
    'guia.queEs.p3': 'Because new things land there first. Opus 5 could be used in the terminal before it ' +
                     'reached the desktop app, and the one-million-token context took considerably longer to ' +
                     'arrive. Adeorq builds the experience <em>on top of</em> those programs, so you get the ' +
                     'latest on day one, with the face of an app.',

    /* -------------------------------- INSTALAR --------------------------- */
    'guia.instalar.h': 'Install',
    'guia.instalar.p1': 'Download the installer from <a href="index.html#descargar">the downloads page</a>.',
    'guia.instalar.p2': 'Run it. Windows may warn that it does not recognise the publisher: that is normal ' +
                        'for programs without a commercial signature, and you get past it with ' +
                        '<em>More info → Run anyway</em>. On Linux the AppImage does not install: make it ' +
                        'executable (<code>chmod +x</code>) and open it; or install the <code>.deb</code> or ' +
                        'the <code>.rpm</code> for your distribution.',
    'guia.instalar.p3': 'Open Adeorq. There is no account to create and nothing to type in.',
    'guia.instalar.p4': 'From then on <b>it updates itself</b>: it checks for a new version at startup and ' +
                        'every six hours, and tells you with a bar at the top. No need to come back to the site.',
    'guia.instalar.p5': '<b>Requirements:</b> 64-bit Windows 10 or 11, or a 64-bit Linux with glibc 2.35 or ' +
                        'newer (Ubuntu 22.04, Debian 12, Fedora 36 or later). The Windows installer is around ' +
                        '6 MB, because the app is native and does not ship a whole browser inside.',

    /* ----------------------------- PRIMEROS PASOS ------------------------ */
    'guia.primeros.h': 'First steps',
    'guia.primeros.p': 'With Adeorq freshly installed, the shortest path to see what it is about:',
    'guia.primeros.p1': 'Go to <b>Accounts</b>, inside your <b>Profile</b>. Adeorq looks at which AI programs you ' +
                        'have installed and tells you. If one is missing, you can download it from there.',
    'guia.primeros.p2': 'Go to the <b>Cockpit</b> and open a terminal in one of your projects. It is a normal ' +
                        'terminal: whatever you would type into one, type it there.',
    'guia.primeros.p3': 'Go back to the <b>Dashboard</b>. Your project already shows its session working, and ' +
                        'it shows up in the <b>Agenda</b> with whatever it is doing.',

    /* --------------------------------- CABINA ---------------------------- */
    'guia.cabina.h': 'The Cockpit',
    'guia.cabina.p': 'This is where the work happens. Every pane is a real terminal with its program inside, ' +
                     'and you can have as many as you want at once, spread across columns and rows.',
    'guia.cabina.pie': 'The Cockpit with four terminals at once. On the left, projects and their sessions.',
    'guia.cabina.h3a': 'The sidebar',
    'guia.cabina.p2': 'Your projects are on the left, and inside each one its sessions. Every session carries ' +
                      'the mark of the program that wrote it, so you can see at a glance which are Claude and ' +
                      'which are Codex. The colour of the dot says which state it is in:',
    'guia.cabina.th1': 'State',
    'guia.cabina.th2': 'What it means',
    'guia.cabina.e1': 'Working',
    'guia.cabina.e1d': 'The agent is doing something right now.',
    'guia.cabina.e2': 'Waiting for you',
    'guia.cabina.e2d': 'It ended its turn with a question or a permission request. The ball is in your court.',
    'guia.cabina.e3': 'Done',
    'guia.cabina.e3d': 'It delivered what you asked for and is not waiting on anything.',
    'guia.cabina.e4': 'Asleep',
    'guia.cabina.e4d': 'No activity for a couple of days, but you can pick it up again.',
    'guia.cabina.p3': 'That distinction is not cosmetic: closing a pane that was asking you something loses ' +
                      'the question, so Adeorq reads the session history to know for sure, instead of guessing ' +
                      'from whether the terminal rang a bell.',
    'guia.cabina.h3b': 'The header of every pane',
    'guia.cabina.p4': 'Each terminal carries above it what you need to know without going in to look:',
    'guia.cabina.l1': '<b>The context</b>, as a percentage. How full that conversation is, measured against the ' +
                      'real window of the model you are using, not against a fixed number.',
    'guia.cabina.l2': '<b>The model</b> it is working with.',
    'guia.cabina.l3': '<b>Deployed agents</b>, if that session has handed work out to subagents.',
    'guia.cabina.l4': '<b>Mirror mode</b>, which isolates whatever the agent writes into a separate copy of the ' +
                      'project so you can review it before accepting it.',
    'guia.cabina.caja': '<span class="doc-caja__titulo">The expensive-session warning.</span> ' +
                        'Past a certain size, every message pays for the whole context again, and compacting ' +
                        'pays for everything accumulated in one go. Adeorq warns you when a conversation gets ' +
                        'there, so that carrying on or starting fresh is decided with the number in front of you.',
    'guia.cabina.h3c': 'The right-hand column',
    'guia.cabina.p5': 'To the right of the terminals there is a strip of icons. The first three each open a ' +
                      'face, and pressing the icon of the open face again hides it:',
    'guia.cabina.l5u': '<b>Usage</b>: how much each of your accounts has left, all at once with the most used ' +
                       'on top, and when each window renews.',
    'guia.cabina.l5': '<b>Skills</b>: your commands from <code>~/.claude/skills</code>, each with what it does. ' +
                      'Drag one onto a terminal and it is pasted into its box; one click sends it to the one in ' +
                      'front of you.',
    'guia.cabina.l7': '<b>Files</b>: the project tree, coloured by what git sees changed. From the right-click ' +
                      'menu you create files and folders, rename them or move them to the recycle bin, and it ' +
                      'never overwrites one that exists. Opening one shows it in the editor, where images and PDFs ' +
                      'appear as themselves. To find a text inside the project, <b>Ctrl+K → Search in the files</b>: ' +
                      'the hit opens at its line.',

    /* ---------------------------------- PANEL ---------------------------- */
    'guia.panel.h': 'The Dashboard',
    'guia.panel.p': 'The first thing you see when you open it. On the left, Adeo and a box to ask him for ' +
                    'anything in your own words ("open the Orquio stuff", "go over the login", "push today’s ' +
                    'work"): when you send it, a new conversation opens in <b>Chat</b>, Adeo splits it into ' +
                    'sessions and the router picks the model. Above it, a line saying what is going on; if a ' +
                    'terminal is asking you something it says so, and <b>Answer</b> takes you to it.',
    'guia.panel.p0': 'On the right, your projects of the week: the one waiting for you first, then the ones ' +
                     'working, then the rest by the last one you touched. One click takes you to its terminal. ' +
                     'Below, your usage this month in squares, which leads to your <b>Profile</b>.',
    'guia.panel.pie': 'The Dashboard. Adeo and his box on the left; your projects and your usage on the right.',
    'guia.panel.h3a': 'Projects',
    'guia.panel.p1': '<b>New project</b>, at the foot of the list. Adeorq leaves the folder ready with ' +
                     '<code>AGENTS.md</code> (your rules for the agents), <code>docs/METAS.md</code> and git ' +
                     'initialised, so the first session starts with context instead of from scratch.',
    'guia.panel.h3b': 'The Foreman',
    'guia.panel.p2': 'The orb in the top bar opens it (<b>Ctrl+Shift+A</b>). You ask it for the board in plain ' +
                     'language ("open the sessions for the Orquio panel", "one agent on the frontend and ' +
                     'another on the backend") and it proposes the plan: which sessions to open, with which ' +
                     'program and with which brief. <b>It runs nothing without your approval.</b>',
    'guia.panel.h3c': 'Mission',
    'guia.panel.p3': 'From the Foreman, deploy a team. You describe what you want, pick a project and roles ' +
                     '(Frontend, Backend, Security, Design) and one agent opens per role, each with its brief, ' +
                     'its share of the files and coordinated with the others through a shared file in the ' +
                     'project. Each one proposes its plan and waits for your approval before touching anything.',

    /* ---------------------------------- PERFIL --------------------------- */
    'guia.perfil.h': 'Your profile and usage',
    'guia.perfil.p': 'Your name, your @ and your photo, which you change right there with <b>Edit</b>, and four ' +
                     'sections with their summary: <b>Accounts</b>, <b>Agenda</b>, <b>Memory</b> and ' +
                     '<b>Commands</b>. Touching a summary opens the whole section, with "‹ Profile" above it to ' +
                     'go back. You also reach each one from Ctrl+K.',
    'guia.perfil.p0': 'Below, <b>your usage</b>: this month’s tokens, with the cache and only the new ones; how ' +
                      'much went to each provider, each model and each project; the year in squares and the ' +
                      'month day by day. It reads the conversations Claude Code and Codex already keep on your ' +
                      'computer, with no key at all.',
    'guia.perfil.pie': 'Your profile. You and your four sections up top; your usage below.',
    'guia.perfil.h3a': 'The card to share',
    'guia.perfil.p1': 'Touching a day, your record or the share icon opens a card with your figures, ready to ' +
                      'post: you pick the background, the colour and the format, and save it as an image or as ' +
                      'a video. No project shows on it unless you choose one.',

    /* --------------------------------- AGENDA ---------------------------- */
    'guia.agenda.h': 'The Agenda',
    'guia.agenda.p': 'It lives inside your Profile. What is coming, what you thought of and what is due. Every ' +
                     'block reads from wherever that thing already lives, without keeping a second copy of anything.',
    'guia.agenda.l1': '<b>Today</b>: your goals for the day and all your sessions, whatever is waiting on you first.',
    'guia.agenda.l2': '<b>Calendar</b>: things with a date because someone else set it. Each one warns you as ' +
                      'far ahead as you told it to, not on a fixed threshold.',
    'guia.agenda.l3': '<b>Ideas</b>: the live ones and the parked ones, each with the condition that would unblock it.',
    'guia.agenda.l4': '<b>Next steps</b>: the <code>METAS.md</code> of the project you are looking at, read ' +
                      'from its folder and extendable from here.',
    'guia.agenda.l5': '<b>Scheduled orders</b>: an order that launches by itself, on the days and at the hour ' +
                      'you set or every so many hours. After three failures in a row it stops and tells you, ' +
                      'and it does not run again until you re-arm it. For now, on Windows and with Claude.',
    'guia.agenda.caja': '<span class="doc-caja__titulo">The tray.</span> ' +
                        'Loose ends turn up while you work that are not for right now. Instead of interrupting ' +
                        'you, they drop into a tray you review whenever you like: you accept what is useful and ' +
                        'discard the rest. An agent can propose things there without touching any credential of yours.',

    /* -------------------------------- OBJETIVOS -------------------------- */
    'guia.obj.h': 'Goals for today',
    'guia.obj.p1': 'Which two or three things you want to close today. They belong to no project: they are ' +
                   'yours and they are today’s, and tomorrow you start on a blank page without anyone ' +
                   'cleaning anything up.',
    'guia.obj.p2': 'They live in the Agenda, and also in a <b>floating panel</b> that opens from the target ' +
                   'icon in the top bar and stays on top of whichever screen you are on. You can drag it by ' +
                   'its title bar wherever suits you, fold it down to a single line with the counter still ' +
                   'visible, or send it back to its corner.',
    'guia.obj.caja': '<span class="doc-caja__titulo">An agent can tick them off.</span> ' +
                     'Goals do not live in the settings, they live in one text file per day. An agent knows how ' +
                     'to edit a text file, so when a terminal finishes what you asked it can mark the goal as ' +
                     'done, and the panel picks it up on its own without reloading anything.',

    /* ---------------------------------- LIENZO --------------------------- */
    'guia.lienzo.h': 'The Canvas',
    'guia.lienzo.p': 'An infinite board where you place terminals, notes, drawings and widgets like pieces on ' +
                     'a table. It is for thinking through work with several moving parts, instead of a fixed grid.',
    'guia.lienzo.pie': 'The Canvas. Pieces are placed and connected like on a whiteboard.',
    'guia.lienzo.l1': '<b>Terminals</b> wired to each other: when one finishes, it can hand the baton to the ' +
                      'next one along with its answer.',
    'guia.lienzo.l2': '<b>Notes</b> in Markdown with checkboxes, which are also files and which an agent can tick. ' +
                      'An empty note offers the runbooks of the project (the <code>.md</code> files in ' +
                      '<code>docs/fichas</code>) so you start with the steps already written.',
    'guia.lienzo.l3': '<b>The kanban</b>: drag a card from "To do" to "Working" and a terminal opens with that ' +
                      'brief. The other columns fill themselves with whatever each agent reports.',
    'guia.lienzo.l4': '<b>Work widgets</b>: pomodoro, stopwatch, countdown, calculator and a calendar with notes by day.',

    /* --------------------------------- CUENTAS --------------------------- */
    'guia.cuentas.h': 'Accounts',
    'guia.cuentas.p': 'They live inside your Profile. An account is one login of the same program, with its own ' +
                      'configuration folder. You can have several of the same one and split the work between them.',
    'guia.cuentas.pie': 'Accounts. Up top, how much is left of the tightest limit and which one is the default.',
    'guia.cuentas.l1': '<b>Your accounts</b>: one card per installed program, saying whether it is connected ' +
                       'and how much of its limits you have used.',
    'guia.cuentas.l2': '<b>API keys</b>: the other way to pay for what a program consumes: by tokens instead ' +
                       'of with your subscription. They are stored encrypted in the Windows Credential Manager, ' +
                       'never in a configuration file, and they do not come back out.',
    'guia.cuentas.l3': '<b>Shortcuts</b>: which programs appear when you hover over a project in the sidebar.',
    'guia.cuentas.l4': '<b>Not installed</b>: what you are missing, with its download button.',
    'guia.cuentas.caja': '<span class="doc-caja__titulo">Several accounts of your own, no problem.</span> ' +
                         'Rotating other people’s accounts to stretch the limits breaks the providers’ ' +
                         'terms, and what you are risking is having the account closed.',
    'guia.cuentas.h3v': 'Vibecoding with OpenRouter (Aider)',
    'guia.cuentas.pv1': 'The OpenRouter card, inside <b>API keys</b>, is a single key that unlocks models from ' +
                        'many providers, including ones with no CLI of their own (Kimi, DeepSeek, Grok…). Once ' +
                        'the key is set, a second card appears below it, <b>Vibecoding</b>, which opens a real ' +
                        'terminal of <a href="https://aider.chat" target="_blank" rel="noopener">Aider</a> ' +
                        'pointed at whichever model you type in there (default: <code>moonshotai/kimi-k3</code>). ' +
                        'The first time, the button installs Aider on its own; every time after, it opens the ' +
                        'terminal directly with the key already set.',
    'guia.cuentas.pv2': '<span class="doc-caja__titulo">If you open Aider by hand instead of through the button:</span> ' +
                        'always tell it the model (<code>aider --model openrouter/&lt;model&gt;</code>), because without ' +
                        'that it grabs the first key it finds in your environment and tries a DIFFERENT provider, ' +
                        'and set the key in <code>OPENROUTER_API_KEY</code> in that terminal. The card does both on its own.',

    /* --------------------------------- AJUSTES --------------------------- */
    'guia.ajustes.h': 'Settings',
    'guia.ajustes.p': 'How your workshop looks and how it talks.',
    'guia.ajustes.l1': '<b>Appearance</b>: language (Spanish or English), twenty-four themes and the ' +
                       'background: you can put an image or a video behind everything, dial how much of it ' +
                       'shows, and make the terminals transparent so the picture comes through the text.',
    'guia.ajustes.l2': '<b>Terminals</b>: font size, how many sessions the open-all button opens, and ' +
                       'restoring what you had open.',
    'guia.ajustes.l3': '<b>Notifications</b>: how it tells you when an agent finishes or asks you something.',
    'guia.ajustes.l4': '<b>Shortcuts</b>: every key combination, editable.',
    'guia.ajustes.l5': '<b>Local model</b>: if you have Ollama, Adeorq uses it for small tasks without ' +
                       'spending your quota.',
    'guia.ajustes.l6': '<b>Discord</b>: so your Discord status says what you are working on.',
    'guia.ajustes.l7': '<b>Help</b>: the full guide inside the app and the link to this documentation.',
    'guia.ajustes.l8': '<b>Adeorq</b>: installed version, check for updates and your weekly usage.',
    'guia.ajustes.l9': '<b>Mobile</b>: Adeorq on your phone or in another browser, wherever you are. The steps ' +
                       'are in <a href="#movil">On your phone</a>.',

    /* ---------------------------------- MOVIL ---------------------------- */
    'guia.movil.h': 'On your phone',
    'guia.movil.p1': 'Adeorq comes with you. From your phone, a tablet or another computer you talk to the ' +
                     'concierge, see how each terminal is doing and type into it, answer what your agents ask ' +
                     'you, attach photos and files, and get a notification when an agent finishes or asks you ' +
                     'something. What you see is your PC, not a copy in the cloud: it has to be on, with Adeorq open.',
    'guia.movil.h3a': 'Set it up once',
    'guia.movil.p2': 'Install <a href="https://tailscale.com/download" rel="noopener">Tailscale</a> on the PC ' +
                     'and on your phone, and sign in with the same account on both. It is a private network ' +
                     'between your devices, free for personal use.',
    'guia.movil.p3': 'In Adeorq, open <b>Settings → Mobile</b> and turn on the switch next to <b>The concierge on your ' +
                     'phone</b>. Three rows appear, <b>This PC</b>, <b>Tailscale</b> and <b>Your phone</b>, each with ' +
                     'its dot: the one that fails tells you what to do.',
    'guia.movil.p4': 'If the Tailscale row says the concierge is not on your network yet, press <b>Bring the ' +
                     'concierge to Tailscale</b>; it stays set even after a restart. The first time, Tailscale may ' +
                     'ask you to enable HTTPS on your account: if <b>Open the Tailscale link</b> appears, press it, ' +
                     'enable it and press again.',
    'guia.movil.p5': 'Below it you get a QR code with your address, something like ' +
                     '<code>https://your-pc.your-net.ts.net:8443</code>, and the same address next to it to copy. ' +
                     'Press <b>Pair a phone</b>: you get a six-digit code that lasts ten minutes.',
    'guia.movil.p6': 'On your phone, with Tailscale on, scan the QR code or type the address, enter the code ' +
                     'and press <b>Pair</b>. Each browser is paired only once.',
    'guia.movil.h3d': 'What the phone shows',
    'guia.movil.l6': '<b>The menu.</b> Like in the Claude app: the button at the top left, or a swipe from the ' +
                     'left edge, opens a drawer with <b>Concierge</b>, <b>Terminals</b>, <b>Decisions</b>, ' +
                     '<b>Scheduled</b> and <b>Usage</b>. Below them, what is recent (terminals and conversations), ' +
                     'whether your PC is connected and <b>New task</b>; at the very bottom, <b>Settings</b>.',
    'guia.movil.l7': '<b>Home.</b> Adeo greets you and tells you at a glance how your PC is doing. Below, ' +
                     '<b>Waiting for you</b>: pending decisions and the terminals asking you something. Then ' +
                     '<b>Running</b>, only what is working right now, with a thread of blue light around it, and ' +
                     'your conversations with the concierge. At the bottom, the box to hand it a task. When a ' +
                     'decision is waiting for you, its number shows in a badge on the menu button.',
    'guia.movil.l8': '<b>Terminals.</b> The ones open on your PC, by how they are doing: <b>Asking you</b>, ' +
                     '<b>Working</b>, <b>Finished</b> and <b>Idle</b>. In each one you read what is going on and ' +
                     'type into it, with photos or files if needed; in an agent’s, <b>Chat</b> has everything ' +
                     'said and <b>Screen</b> what the PC shows right now.',
    'guia.movil.l5': '<b>Switching mode.</b> In a Claude Code terminal, the keys button in the box (Enter, Esc, ' +
                     'Ctrl+C and the arrows) holds <b>Switch mode</b>: it does what Shift+Tab does on the PC ' +
                     '(normal, accept edits, plan, auto) and shows which mode it is in.',
    'guia.movil.l4': '<b>Decisions.</b> When an agent needs you to choose something, it asks you with its ' +
                     'numbered options and a notification reaches you. You answer with an option or in your own ' +
                     'words, you get five seconds to undo it, and the answer goes back on its own to the terminal ' +
                     'that asked. If you will not answer, <b>Discard</b> clears it and tells its terminal not to ' +
                     'wait. The ones no longer waiting for you move to <b>Earlier</b> and delete themselves after ' +
                     'a week.',
    'guia.movil.l9': '<b>Scheduled and Usage.</b> To check at a glance: the jobs that launch on their own, ' +
                     'active and stopped, when they run and why one stopped; and what each account has used, ' +
                     'with its bar. You change them on the PC.',
    'guia.movil.l10': '<b>Deleting a conversation.</b> Long-press it, on the home screen or in the menu, and ' +
                      'choose <b>Delete conversation</b>.',
    'guia.movil.h3b': 'Settings, at the bottom of the menu',
    'guia.movil.l11': '<b>How it looks.</b> The background photo behind the glass: by default the same one you ' +
                      'have on the PC, or one from your phone’s gallery, and how much it is blurred and darkened. ' +
                      'Light, dark or like the phone, and the accent colour, which by default is the one from the ' +
                      'PC’s theme.',
    'guia.movil.l12': '<b>How it reads.</b> The text size, Adeo moving, still or hidden, and which sections show ' +
                      'on the home screen and in what order.',
    'guia.movil.l2': '<b>Notifications.</b> You turn them on for this phone and pick the ones you want: when a ' +
                     'session asks you something, when it finishes and the ones from scheduled jobs, with sound ' +
                     'or silent. They arrive even with the page closed, encrypted through your browser’s push ' +
                     'service (Google, Apple or Mozilla), which delivers them without being able to read them. On ' +
                     'iPhone they only work with the app added to the Home Screen. To test them, in Settings → ' +
                     'Mobile on the PC every phone with notifications has <b>Test notification</b>.',
    'guia.movil.l1': '<b>As an app.</b> On Android you install it from Settings and it stays there with its icon ' +
                     '(if the option does not show, the browser menu → Add to Home screen). On iPhone, from ' +
                     'Safari: Share → Add to Home Screen.',
    'guia.movil.l3': '<b>Several devices.</b> Each one is paired on its own and shows by name in Settings → ' +
                     'Mobile on the PC, with when it was last seen; you remove it from there. On the phone itself, ' +
                     'its Settings also let you forget it: getting back in then needs a new code.',
    'guia.movil.caja': '<span class="doc-caja__titulo">Why it is safe to leave it on.</span> Adeorq only listens ' +
                       'inside your PC, and Tailscale carries it to your devices through an encrypted tunnel: ' +
                       'it cannot be seen from the internet. Even so, every request carries the key of a paired ' +
                       'device, the code expires after ten minutes or five failed tries, and only a fingerprint ' +
                       'of each key is kept on disk. While it is on, the PC does not go to sleep by itself; on ' +
                       'battery, it does.',
    'guia.movil.h3c': 'If something does not work',
    'guia.movil.f1': '<b>The address does not load:</b> check that Tailscale is on on your phone. The ' +
                     '<b>Your phone</b> row in Settings → Mobile tells you whether it is on your network and ' +
                     'when it was last seen.',
    'guia.movil.f2': '<b>“La ventana de Adeorq no contestó a tiempo”</b> (the Adeorq window did not answer in ' +
                     'time): Adeorq has to be open on the PC, and the PC awake.',
    'guia.movil.f3': '<b>On Linux, “Tailscale no deja a tu usuario ponerlo”</b> (Tailscale will not let your user ' +
                     'set it up): run <code>sudo tailscale set --operator=$USER</code> once and press again.',

    /* --------------------------------- EMISION --------------------------- */
    'guia.emision.h': 'Streaming mode',
    'guia.emision.p': 'Made for recording or sharing your screen: it covers paths, emails, keys and personal ' +
                      'data in the terminals in one go. Turn it on with <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + ' +
                      '<kbd>E</kbd>, and holding <kbd>Alt</kbd> lets you peek underneath for a moment without ' +
                      'switching it off.',

    /* ---------------------------------- PULSO ---------------------------- */
    'guia.pulso.h': 'The pulse',
    'guia.pulso.p1': 'Up in the bar: how much memory Adeorq and its agents are using, and how many agents are ' +
                     'alive, which is the number that tells you whether you left something open.',
    'guia.pulso.p2': 'It measures the <b>whole tree</b> of processes, not just the window, because what really ' +
                     'weighs are the programs hanging off it. And it compares that with what your machine has: ' +
                     'it turns amber when the one squeezing is Adeorq, and red when the one running short is ' +
                     'the machine.',

    /* --------------------------------- ATAJOS ---------------------------- */
    'guia.atajos.h': 'Shortcuts',
    'guia.atajos.th1': 'Shortcut',
    'guia.atajos.th2': 'What it does',
    'guia.atajos.a1': 'Call the Foreman',
    'guia.atajos.a2': 'Call the Foreman and dictate to it',
    'guia.atajos.a3': 'Streaming mode',
    'guia.atajos.a4': 'Cover the whole screen',
    'guia.atajos.a5': 'Peek under streaming mode',
    'guia.atajos.a6': 'Close whatever is open on top',
    'guia.atajos.mantener': '(hold)',
    'guia.atajos.p': 'All of them are editable in <b>Settings → Shortcuts</b>.',

    /* ------------------------------ DONDE GUARDA ------------------------- */
    'guia.donde.h': 'Where your things live',
    'guia.donde.p': 'All on your machine, and in formats you can open yourself:',
    'guia.donde.th1': 'What',
    'guia.donde.th2': 'Where',
    'guia.donde.q1': 'Goals for the day',
    'guia.donde.d1': '<code>%LOCALAPPDATA%\\Adeorq\\objetivos\\</code>, one Markdown file per day',
    'guia.donde.q2': 'Canvas notes',
    'guia.donde.d2': '<code>%LOCALAPPDATA%\\Adeorq\\notas\\</code>, in Markdown',
    'guia.donde.q3': 'API keys',
    'guia.donde.d3': 'Windows Credential Manager, encrypted by the system',
    'guia.donde.q4': 'Crash trail',
    'guia.donde.d4': '<code>%LOCALAPPDATA%\\Adeorq\\rastro.log</code>',
    'guia.donde.q5': 'Sessions and histories',
    'guia.donde.d5': 'Wherever each program leaves them: Adeorq reads them, it does not copy them',

    /* ---------------------------------- DUDAS ---------------------------- */
    'guia.dudas.h': 'Common questions',
    'guia.dudas.q1': 'Do I need an Adeorq account?',
    'guia.dudas.r1': 'No. Adeorq has no accounts, no server, and asks you for nothing when you install it.',
    'guia.dudas.q2': 'Does it replace Claude Code or Codex?',
    'guia.dudas.r2': 'No: it runs them. Adeorq does not touch what those programs do or how they do it; it ' +
                     'builds the room around them. If they ship a new feature tomorrow, you have it the same day.',
    'guia.dudas.q3': 'Does it send my data anywhere?',
    'guia.dudas.r3': 'No. Everything you see happens on your machine. The app only goes online to check ' +
                     'whether there is a new version.',
    'guia.dudas.q4': 'Can I use two accounts of the same program?',
    'guia.dudas.r4': 'Yes, as long as they are yours. Each one lives in its own configuration folder and they ' +
                     'do not step on each other.',
    'guia.dudas.q5': 'What happens if I close a pane with an agent working?',
    'guia.dudas.r5': 'The program closes, and everything hanging off it with it. If it was halfway through a ' +
                     'turn, that work is lost: check the state of the pane before closing it.',
    'guia.dudas.q6': 'Windows says the installer is not safe',
    'guia.dudas.r6': 'That is the standard warning for programs without a paid commercial signature. The ' +
                     'installer is signed with the Adeorq updater key, which is what guarantees that the update ' +
                     'reaching you is ours.',
    'guia.cierre': 'Is something missing from this guide, or does something not work the way it is described ' +
                   'here? Say so and it gets fixed.',
    'guia.cierre.cta': 'Report a problem',

    /* ----------------------------------- PIE ----------------------------- */
    'guia.pie.lema': 'The panel where your agents work in real terminals. On Windows and Linux, and with ' +
                     'you on your phone.',
    'guia.pie.producto': 'Product',
    'guia.pie.recursos': 'Resources',
    'guia.pie.ecosistema': 'Ecosystem',
    'guia.pie.roadmap': 'What is coming',
    'guia.pie.preguntas': 'Questions',
    'guia.pie.versiones': 'All versions',
    'guia.pie.licencia': 'Licence',
    'guia.pie.marcas': 'Not affiliated with Anthropic, OpenAI, Google or Microsoft. Their names and logos are ' +
                       'trademarks of their owners, and here they only identify which tool you are working with.',
    'guia.pie.copyright': '© 2026 Adeorq · part of the Orquio ecosystem',
    'guia.pie.privacidad': 'This site uses no cookies and does not track you.'
  }
};
