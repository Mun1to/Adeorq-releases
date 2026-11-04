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
    'guia.nav.chat': 'The Chat',
    'guia.nav.decisiones': 'Decisions',
    'guia.nav.perfil': 'Your profile and usage',
    'guia.nav.agenda': 'The Agenda',
    'guia.nav.objetivos': 'Goals for today',
    'guia.nav.lienzo': 'The Canvas',
    'guia.nav.cuentas': 'Accounts',
    'guia.nav.ajustes': 'Settings',
    'guia.nav.fuera': 'What an outside program can do',
    'guia.nav.movil': 'On your phone',
    'guia.nav.emision': 'Streaming mode',
    'guia.nav.pulso': 'The pulse',
    'guia.nav.actualizar': 'Updating without losing your terminals',
    'guia.nav.sistemas': 'Windows, Linux and Mac',
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
                       'keys you already have, and it runs on your machine: there is no Adeorq server in ' +
                       'between and no account to create in order to use it.',
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
    'guia.instalar.p3': 'Open Adeorq. There is no account to create. The welcome screens ask for your name, ' +
                        'where your projects live and which programs you use, and you can skip them.',
    'guia.instalar.p4': 'From then on <b>it tells you about each new version</b>: it looks at startup and every ' +
                        'six hours, and an <b>Update Adeorq</b> card appears at the bottom left. One click downloads ' +
                        'and installs it; it never installs by itself. The details are in ' +
                        '<a href="#actualizar">Updating without losing your terminals</a>.',
    'guia.instalar.p5': '<b>Requirements:</b> 64-bit Windows 10 or 11, or a 64-bit Linux with glibc 2.35 or ' +
                        'newer (Ubuntu 22.04, Debian 12, Fedora 36 or later). The Windows installer is around ' +
                        '6 MB, because the app is native and does not ship a whole browser inside. On Mac there ' +
                        'is an installer still being tested: see <a href="#windows-linux-mac">Windows, Linux ' +
                        'and Mac</a>.',

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

    /* ----------------------------------- CHAT ---------------------------- */
    'guia.chat.h': 'The Chat',
    'guia.chat.p': 'A tab, in beta, for working by talking instead of moving between terminals. It has two parts.',
    'guia.chat.l1': '<b>On top, the concierge.</b> "Talk to the concierge" opens a chat with Adeo: you say what you ' +
                    'want, he splits it into jobs and opens one session for each. The sessions show as tabs above ' +
                    'the thread (green dot: working; amber: asking you; orange: finished) and one click takes you ' +
                    'into them. Each one leaves a card with its program, its model, what it was asked to do and, ' +
                    'if the router picked it, why.',
    'guia.chat.l2': '<b>Below, your usual sessions</b>, by day, with <b>New conversation</b> and a search box. Each ' +
                    'session reads as a conversation (<b>Clean</b>) or opens raw (<b>Terminal</b>), and whatever ' +
                    'you type underneath goes down to the same terminal. The box has pills for the model ' +
                    '("Automatic" lets the router pick it), for the effort, and a ring showing the context.',
    'guia.chat.p2': 'Worth knowing:',
    'guia.chat.l3': 'The concierge only opens sessions in real folders of your projects, only types into the ' +
                    'terminals it opened itself, and opens four at most per message.',
    'guia.chat.l4': 'Each message to the concierge is a short call made with your subscription (Claude, or the ' +
                    'program you pick in its pills), not with an API key. The sessions it opens spend their own ' +
                    'quota. <b>Improve</b> rewrites your message without adding anything, and <b>Stop</b> cuts it ' +
                    'off while it thinks.',
    'guia.chat.l5': 'Turning off the "Chat" part in Settings also removes the box from the Dashboard. It does not ' +
                    'turn off the concierge on your phone, which has its own switch (<a href="#movil">On your ' +
                    'phone</a>).',

    /* -------------------------------- DECISIONES ------------------------- */
    'guia.dec.h': 'Decisions',
    'guia.dec.p': 'When an agent needs you to choose something, it asks you here instead of in the chat. The tab ' +
                  'lists <b>Waiting for you</b> and <b>Earlier</b>. Each question comes with two to six numbered ' +
                  'options (the recommended one says "Recommended") and a box, <b>Something else, in your own ' +
                  'words</b>.',
    'guia.dec.l1': '<b>Send answer</b> waits five seconds, with <b>Undo</b>, and then types it into the terminal ' +
                   'that asked, if it is still the same one. If not, the agent reads it when it looks again.',
    'guia.dec.l2': '<b>Discard</b> sets it aside without answering and tells the terminal that was waiting.',
    'guia.dec.l3': 'The earlier ones delete themselves after a week.',
    'guia.dec.l4': 'The alert is an amber number on the tab and Adeo looking doubtful. On a paired phone you get a ' +
                   'notification and can answer from there (<a href="#movil">On your phone</a>).',

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
    'guia.perfil.p1': 'Touching a day, your record or the share icon opens <b>Share your usage</b>: a card with ' +
                      'your figures, ready to post. You pick what it shows (month, day, record or total), the ' +
                      'background, the colour and the format (16:9 or 9:16), and make it as an image or as a ' +
                      'video. No project shows on it unless you choose one.',
    'guia.perfil.p2': 'Your @ (or your name), your photo and, at the foot, “adeorq.com · Made with Adeorq” always ' +
                      'show. In the video, the figure counts up from zero to yours; you trim the stretch of ' +
                      'background with two handles and can add sound.',
    'guia.perfil.l1': '<b>Download</b> saves a PNG or an MP4 wherever you choose.',
    'guia.perfil.l2': '<b>Copy</b>, in Image mode, copies the image to the clipboard so you can paste it anywhere. ' +
                      'In Video mode it copies the MP4 <b>file</b>: on Windows it pastes as a file into a chat or ' +
                      'a folder (and as its path into a text-only place, such as a terminal); on Mac, as a file ' +
                      'reference; on Linux, just the path.',
    'guia.perfil.l3': 'On Linux the Video tab is switched off: “This computer can’t make videos.”',

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
    'guia.cuentas.l1': '<b>Your accounts</b>: one card per installed program, saying whether it is connected. ' +
                       'Claude Code, Codex and GitHub Copilot also show their session and week bars, with when ' +
                       'they renew, at no cost; the other programs do not publish your usage on your machine, ' +
                       'and the card says so instead of inventing a bar.',
    'guia.cuentas.l2': '<b>API keys</b>: the other way to pay for what a program consumes: by tokens instead ' +
                       'of with your subscription. The key is kept in your system’s key store (see ' +
                       '<a href="#donde-guarda">Where your things live</a>) and never comes back to the screen: ' +
                       'only its last four letters show.',
    'guia.cuentas.l3': '<b>Shortcuts</b>: which programs appear when you hover over a project in the sidebar.',
    'guia.cuentas.l4': '<b>Not installed</b>: what you are missing, with its download button.',
    'guia.cuentas.caja': '<span class="doc-caja__titulo">Several accounts of your own, no problem.</span> ' +
                         'Rotating other people’s accounts to stretch the limits breaks the providers’ ' +
                         'terms, and what you are risking is having the account closed.',
    'guia.cuentas.h3a': 'Which programs support several accounts',
    'guia.cuentas.pa': 'Adeorq knows around twenty programs, but only <b>eight support several accounts</b>: ' +
                       'Claude Code, Codex, Gemini CLI, Qwen Code, Grok, Pi, Kimi Code and CodeWhale. For those, it has ' +
                       'been checked that an environment variable really moves the program’s folder. The rest ' +
                       'carry the note “one account only”: better to say so than to invent a name and have an ' +
                       'account end up writing where it should not. Antigravity keeps its state inside ' +
                       '<code>~/.gemini</code> and can only have one.',
    'guia.cuentas.h3r': 'Sharing out between accounts',
    'guia.cuentas.pr': 'When an agent opens a terminal through Adeorq’s MCP (<a href="#programa-de-fuera">further ' +
                       'down</a>) and does not say which account, <b>the terminal goes by itself to the account of ' +
                       'that program that would lose the most quota if it sat unused</b>: the one with the most ' +
                       'week to spare compared with the days left until it renews. So an account at 17% that ' +
                       'renews in two days beats another at 60% that renews in five.',
    'guia.cuentas.r1': 'The account stopped by its five-hour cap, or the one at 92% of its week or more, is ' +
                       'skipped unless there is no other. If the model the agent asks for is not available on ' +
                       'that account’s plan, it prefers another.',
    'guia.cuentas.r2': 'If the agent asks for a specific account, the terminal is born in that one or fails ' +
                       'saying so: never silently in another. A scheduled job with no account does not choose: ' +
                       'it goes to the default one.',
    'guia.cuentas.r3': 'On screen you see it in the terminal’s header: one that is not using the main account ' +
                       'carries the three letters of its account.',
    'guia.cuentas.r4': 'There is a cap: six terminals open by agents at once, and twelve per hour.',
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
    'guia.ajustes.l1': '<b>Appearance</b>: language (Spanish or English), 32 themes with a filter and a search ' +
                       'box, the colour of the terminals (you can also bring in a Warp or Ghostty theme), scroll ' +
                       'smoothness, performance mode and the background: you can put an image or a video behind ' +
                       'everything, dial how much of it shows, and make the terminals transparent so the picture ' +
                       'comes through the text.',
    'guia.ajustes.l1b': '<b>Parts of Adeorq</b> and <b>The header</b>, also in Appearance: you switch off Cockpit, ' +
                        'Canvas, Memory or Chat entirely (no tab, no entry in Ctrl+K and nothing of theirs ' +
                        'starting up; Cockpit and Canvas cannot both be off, because they are the two places a ' +
                        'terminal opens), and you remove or reorder the tabs at the top.',
    'guia.ajustes.l2': '<b>Terminals</b>: font size (11 to 32 px), how many sessions a project opens at once, ' +
                       'bringing back what you had open, keeping the terminals alive if Adeorq crashes, what ' +
                       'happens when you close the window, which permission mode each new Claude starts in, and ' +
                       'the cards for the MCP and for the agents’ keys (both in ' +
                       '<a href="#programa-de-fuera">What an outside program can do</a>).',
    'guia.ajustes.l3': '<b>Notifications</b>: how it tells you when an agent finishes or asks you something, ' +
                       'which model it uses by default (or let Adeorq decide), and two helpers that only leave ' +
                       'suggestions in the Agenda tray and never change anything by themselves: the crew ' +
                       'lookout and the session copilot.',
    'guia.ajustes.l4': '<b>Shortcuts</b>: the editable table of the 31 canvas shortcuts. The other shortcuts ' +
                       'cannot be changed (see <a href="#atajos">Shortcuts</a>).',
    'guia.ajustes.l5': '<b>Local model</b>: if you have Ollama, Adeorq uses it for small tasks without ' +
                       'spending your quota.',
    'guia.ajustes.l6': '<b>Discord</b>: so your Discord status says what you are working on.',
    'guia.ajustes.l6b': '<b>Mods</b>: changes of your own to how Adeorq looks, off by default. They only change ' +
                        'the appearance; if one leaves your screen unusable, <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + ' +
                        '<kbd>Shift</kbd> + <kbd>0</kbd> switches them all off.',
    'guia.ajustes.l7': '<b>Help</b>: the tour and the welcome again, the full guide inside the app, the link to ' +
                       'this documentation and “Have my agent explain it”, which opens a session with the guide ' +
                       'in front of it.',
    'guia.ajustes.l8': '<b>Adeorq</b>: your name and your projects folder, the installed version and <b>Check ' +
                       'for updates</b> (it only checks; the rest is in <a href="#actualizar">Updating without ' +
                       'losing your terminals</a>), and <b>Show my weekly usage</b>, which types <code>/usage</code> ' +
                       'into the Claude terminal you have active and takes you there.',
    'guia.ajustes.l9': '<b>Mobile</b>: Adeorq on your phone or in another browser, wherever you are. The steps ' +
                       'are in <a href="#movil">On your phone</a>.',

    /* ------------------------------- PROGRAMA DE FUERA ------------------- */
    'guia.fuera.h': 'What an outside program can do',
    'guia.fuera.p1': 'Adeorq has a local door, the <b>MCP</b>, through which an AI program can look at and drive ' +
                     'your terminals: list projects and terminals, read what shows in one, open a new one, type ' +
                     'into it, ask you something with options (which reaches ' +
                     '<a href="#decisiones">Decisions</a> and your phone) and check your quota and your notes in ' +
                     'Memory. There are eighteen tools, split into three tiers:',
    'guia.fuera.th1': 'Tier',
    'guia.fuera.th2': 'What it can do',
    'guia.fuera.e1': 'Look only',
    'guia.fuera.e1d': 'Reads terminals, projects, the agenda, the quota and the memory. Changes nothing.',
    'guia.fuera.e2': 'Open and look',
    'guia.fuera.e2d': 'Also opens new terminals, draws arrows between two on the canvas, asks you questions and ' +
                      'closes the ones that same program opened. It does not type into anyone else’s.',
    'guia.fuera.e3': 'All',
    'guia.fuera.e3d': 'Also types into any terminal, closes it and can compact it.',
    'guia.fuera.conecta': '<b>How you connect your Claude Code to these tools.</b> Adeorq does not touch your ' +
                          'Claude Code’s settings: you give it the door yourself, once, with ' +
                          '<code>claude mcp add adeorq --scope user -- "&lt;path to adeorq.exe&gt;" --mcp</code> ' +
                          '(the path is the folder where you installed Adeorq). Adeorq has to be open: with it ' +
                          'open, <code>claude mcp list</code> should say “Connected”. From then on, a Claude Code ' +
                          'you open in an Adeorq terminal has the tools at that terminal’s tier, and one in ' +
                          'another console has them as an outside program (below).',
    'guia.fuera.p2': '<b>Every terminal is born with its own password</b>, and the tier comes from the terminal ' +
                     'the program connects from, not from the name it claims: a program that introduces itself ' +
                     'as “claude” from outside does not inherit Claude Code’s tier. By default, <b>Claude Code ' +
                     'has “All”</b> and the other programs have “Open and look”.',
    'guia.fuera.p3': '<b>Outside Adeorq</b> is everything that arrives <b>without</b> the password of an Adeorq ' +
                     'terminal: a Claude Code open in another console, any program that talks to the port. By ' +
                     'default it can only <b>open terminals and look</b>. Those terminals start in the mode you ' +
                     'have in Settings, and if it asks to open one <b>with a job</b>, a window appears with the ' +
                     'text, who is asking and in which folder: <b>No</b> or <b>Open</b>; if nobody answers, it ' +
                     'does not open. For it to do more, raise it yourself in ' +
                     '<b>Settings → Terminals → What each client may do through the MCP</b>, on its row; it ' +
                     'applies to any outside program, and on <b>All</b> it no longer asks, so raise it with care (<b>Back to factory</b> puts it ' +
                     'back). Each row shows the program, its version, how many times it connected and when it ' +
                     'last did. The Foreman and the concierge come in through a line of their own and do not ' +
                     'count as clients.',
    'guia.fuera.p4': 'A program on a low tier that asks for something it is not allowed gets a refusal that says ' +
                     'which tier it has and where that is changed.',
    'guia.fuera.lim': '<b>Limits:</b> an agent opens at most six live terminals at once and twelve per hour; a ' +
                      'new message to a Claude terminal holding more than 300,000 tokens of context comes back ' +
                      'to it and only goes out if it insists; it cannot compact one that a person opened; and ' +
                      'the terminals an agent opens, it closes itself when done, leaving a summary in the data ' +
                      'folder.',
    'guia.fuera.h3c': 'Asking for a key without showing it',
    'guia.fuera.pc': 'When an agent needs a token, <b>it is not asked for in the chat or left in a file</b>. A ' +
                     'window from Adeorq comes up where you paste it, and the agent neither reads it nor keeps ' +
                     'it in its history. The agent uses it with ' +
                     '<code>adeorq secreto &lt;name&gt; -- &lt;command&gt;</code>: the command receives the key in an ' +
                     'environment variable and its output shows <code>***</code> where the key would have been.',
    'guia.fuera.c1': 'An <b>Adeorq terminal</b> asking for a key that is already saved gets it <b>without ' +
                     'asking</b>. If it was not saved, the <b>An agent needs a key</b> window comes up, with a ' +
                     'box to keep it for next time.',
    'guia.fuera.c2': '<b>A program outside Adeorq</b> asking for a saved key brings up another window: “It does ' +
                     'not come from an Adeorq terminal. Give it only if you know which program it is.” You choose ' +
                     '<b>No</b> or <b>Give it this once</b>.',
    'guia.fuera.c3': '<b>Agents’ keys</b> (in Settings → Terminals) lists every saved key with who used it and ' +
                     'when, and a <b>Forget</b> button. It never shows the value, and the card does not appear ' +
                     'if none is saved.',
    'guia.fuera.c4': 'Where they are kept is in <a href="#donde-guarda">Where your things live</a>: in each ' +
                     'system’s key store and, on Linux, in an unencrypted file.',
    'guia.fuera.caja': '<span class="doc-caja__titulo">What this does not do.</span> ' +
                       'The <code>***</code> filter only recognises the key exactly as it is, so it does not stop ' +
                       'an agent determined to get it out (for example, with a command that encodes it before ' +
                       'printing it), and any program running as your user can read the Credential Manager (or ' +
                       'the Keychain) directly, without going through Adeorq. It is a barrier against accidents ' +
                       'and casual reads, not against an agent you do not trust: you do not hand that one the key.',

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
    'guia.movil.l5': '<b>The box of a terminal.</b> It takes text, photos and files, and carries just three ' +
                     'controls: <b>Stop</b> (what Esc does on the PC, while the agent is working), a model and ' +
                     'effort pill and <b>Mode</b> (what Shift+Tab does in Claude Code: it switches the permission ' +
                     'mode). Each one shows only if that program understands it.',
    'guia.movil.l13': '<b>Opening sessions on the PC.</b> In the menu, <b>New session here</b> under each project, ' +
                      '<b>Another project…</b> and picking up an earlier session. Only in folders that are your ' +
                      'own projects and with known programs.',
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
    /* Lo que el móvil y la app dicen EN INGLÉS (`movil.html`, `i18n.ts`), no el
       español de donde sale: quien lee esto en inglés ve estas palabras. */
    'guia.movil.f2': '<b>“The Adeorq window did not answer in time”:</b> Adeorq has to be open on the PC, and the ' +
                     'PC awake.',
    'guia.movil.f3': '<b>On Linux, “Tailscale won\'t let your user set it up”:</b> run ' +
                     '<code>sudo tailscale set --operator=$USER</code> once and press again.',

    /* --------------------------------- EMISION --------------------------- */
    'guia.emision.h': 'Streaming mode',
    'guia.emision.p': 'Made for recording or sharing your screen without giving your keys away. Turn it on with ' +
                      '<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>E</kbd> (or with its icon-only button in the top ' +
                      'bar) and it has four parts:',
    'guia.emision.l1': '<b>Covered, not blurred.</b> The foot of the sidebar, the Foreman’s summary, account names ' +
                       'and the Agenda’s texts are covered with a solid bar. <b>The titles of your sessions and ' +
                       'the goals for today are left uncovered, on purpose</b>: they are the thread of what you ' +
                       'are doing, and without them the stream makes no sense.',
    'guia.emision.l2': '<b>Alt to peek.</b> Hold <kbd>Alt</kbd> to see what is covered; when you let go, or switch ' +
                       'window, it is covered again. Hovering the mouse reveals nothing.',
    'guia.emision.l3': '<b>The shield in the terminals.</b> What the agent writes is checked before it is drawn, ' +
                       'and anything shaped like a key is replaced with ●●●: Anthropic, OpenAI, AWS or Google ' +
                       'keys, GitHub and Slack tokens, JWTs, private keys, passwords inside a connection string, ' +
                       'variables like <code>API_KEY=…</code>, your email and your username in paths. The agent ' +
                       'does get the real text: it is only hidden from view. When it covers something, a card ' +
                       'appears at the bottom right, “I masked something that looks like…”, with some advice and a ' +
                       '<b>Got it</b> button.',
    'guia.emision.l4': '<b>The curtain, <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>.</b> It covers the whole ' +
                       'window at once; it comes back with a click or with the same keys. <b>It only goes up by ' +
                       'hand</b>: the shield does not lower it by itself.',
    'guia.emision.p2': 'You can also cover a single terminal, with the eye in its header or with the right-click ' +
                       'menu (<b>Cover this terminal (for streaming)</b>).',
    'guia.emision.caja': '<span class="doc-caja__titulo">What it does not do.</span> ' +
                         'It does not fix what already came out before you turned it on, it does not cover your ' +
                         'browser or the system notifications, and no list of patterns is ever complete. What ' +
                         'protects you most is still a 30-second delay in OBS.',

    /* ---------------------------------- PULSO ---------------------------- */
    'guia.pulso.h': 'The pulse',
    'guia.pulso.p1': 'Up in the bar, a pill with three figures: how much CPU and how much memory (RAM) Adeorq and ' +
                     'its agents are using, and how many agents are alive (AG), which is the number that tells ' +
                     'you whether you left something open. A click opens <b>What Adeorq is using</b>, with the ' +
                     'detail.',
    'guia.pulso.p2': 'It measures the <b>whole tree</b> of processes, not just the window, because what really ' +
                     'weighs are the programs hanging off it. And it compares that with what your machine has: ' +
                     'it turns amber when Adeorq uses a quarter or more of your machine’s CPU or memory, and ' +
                     'red when the whole machine is at 90% or Adeorq alone goes past 50% of CPU.',

    /* ------------------------------- ACTUALIZAR -------------------------- */
    'guia.act.h': 'Updating without losing your terminals',
    'guia.act.p1': 'Adeorq looks for a new version at startup, every six hours and when you come back to the ' +
                   'window, and tells you in two ways: a system notification (once per version) and an ' +
                   '<b>Update Adeorq</b> card with the version, at the end of the sidebar, bottom left. If the ' +
                   'sidebar is folded down to a strip, only the notification shows. One click downloads the ' +
                   'version, with its percentage, and installs it; afterwards it says <b>Restart to get it</b>. ' +
                   'The ✕ (<b>Not now</b>) hides it. <b>It installs nothing until you press.</b>',
    'guia.act.p2': 'If agents are working when you go to install or restart, the card says <b>Waiting for them ' +
                   'to finish</b> and who is mid-task, and carries on by itself when they are done. If you press ' +
                   'again, it does not wait.',
    'guia.act.p3': '<b>“The terminals stay alive”</b> means your consoles and your agents carry on with what they ' +
                   'were doing: a <code>pnpm dev</code> keeps running and Claude does not start over. The ' +
                   'terminals live in a separate process that the installer does not close, and the new window ' +
                   'picks them up with their history. The limits, stated plainly:',
    'guia.act.l1': '<b>Only on Windows</b>, in the installed app and with the <b>Keep the terminals alive if ' +
                   'Adeorq crashes</b> setting on (it is, by default). On Linux and Mac it is off by default.',
    'guia.act.l2': '<b>Without that separate process</b>, updating closes the terminals: Claudes are sent off ' +
                   'with Ctrl+C and picked up again with <code>--resume</code>, and a console loses whatever ' +
                   'it had running.',
    'guia.act.l3': 'What you close yourself kills them: closing Adeorq completely, or closing the terminals. And ' +
                   'if Adeorq dies suddenly, the terminals hold on for half an hour; if nobody comes back, they ' +
                   'close on their own.',
    'guia.act.l4': '<b>The separate process belongs to the version it was born in.</b> After updating, the window ' +
                   'is new but that process is still the old one, and the terminals you open afterwards in that ' +
                   'session are born in it too, until you quit Adeorq completely. Whatever is new in the version ' +
                   'and depends on that process does not reach them, so after updating it is worth quitting ' +
                   'Adeorq completely as soon as you can.',
    'guia.act.caja': '<span class="doc-caja__titulo">Not tried with a real installer.</span> ' +
                     'That terminals survive the update is read from the code, but it has not yet been tried ' +
                     'with a real installer. If something different from what is described here happens when ' +
                     'you update, say so.',

    /* ---------------------------- WINDOWS, LINUX, MAC -------------------- */
    'guia.sis.h': 'Windows, Linux and Mac',
    'guia.sis.p': 'Adeorq is used the same way on all three, with these differences.',
    'guia.sis.h3w': 'Windows',
    'guia.sis.pw': 'This is where it is used most and where everything is: the terminal engine in a separate ' +
                   'process, the real browser, the music, the background mode with an icon, the scheduled jobs ' +
                   'clock and the Credential Manager.',
    'guia.sis.h3l': 'Linux',
    'guia.sis.pl': 'An AppImage, a <code>.deb</code> and an <code>.rpm</code> are published (on Fedora the ' +
                   '<code>.rpm</code> is the better choice; the AppImage carries its own web engine). The window ' +
                   'is translucent and needs a desktop with a compositor. The differences you will see:',
    'guia.sis.l1': 'Keys go to a file with 600 permissions, unencrypted (the screen says so).',
    'guia.sis.l2': 'There is no music control.',
    'guia.sis.l3': 'Closing with the X while terminals are open offers <b>Keep running in the background</b>: ' +
                   'the window hides, with no icon, and comes back when you open Adeorq again.',
    'guia.sis.l4': 'The panel browser is a simple version in a frame, not the real Chromium.',
    'guia.sis.l5': 'The terminals do not run in a separate process by default.',
    'guia.sis.l6': 'The Video tab on the usage card is switched off.',
    'guia.sis.h3m': 'Mac',
    'guia.sis.pm': 'There is a <code>.dmg</code> installer for Apple Silicon (macOS 12 or later) among the ' +
                   'published versions. It has been built and launched on an automated Mac, but <b>it has not yet ' +
                   'been used day to day on a real Mac</b>: if something fails, tell us.',
    'guia.sis.m1': 'Keys go to the login Keychain (service “Adeorq”). Adeorq moves any that were in a file into ' +
                   'the Keychain, and only deletes the file once it has checked that the key read back is ' +
                   'identical.',
    'guia.sis.m2': 'The title bar follows Adeorq’s theme (light or dark) instead of the system mode.',
    'guia.sis.m3': 'The data lives in <code>~/Library/Application Support/Adeorq</code>. Consoles use zsh, and an ' +
                   'app opened from the Finder inherits the PATH of your user shell, so it can find your ' +
                   'programs.',
    'guia.sis.m4': 'Shortcuts use the Control key, not ⌘ (still to be reviewed with a Mac in front of us).',
    'guia.sis.m5': 'As on Linux: no music control, a simple browser and terminals without a separate process by ' +
                   'default. Closing the window closes Adeorq and takes its terminals with it.',

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
    'guia.atajos.a7': 'The palette: type to jump to any tab, open terminal or project, or run any of these ' +
                      'shortcuts. It works inside a terminal too',
    'guia.atajos.a8': 'Open a file of the project by its name (inside a terminal that key belongs to the program: ' +
                      'get there with Ctrl+K)',
    'guia.atajos.a9': 'New terminal, in the active one’s folder',
    'guia.atajos.a10': 'Split the active terminal to the right',
    'guia.atajos.a11': 'Split the active terminal downwards',
    'guia.atajos.a12': 'Maximise or restore the active terminal',
    'guia.atajos.a13': 'Reopen the last closed terminal (outside a terminal and a text box)',
    'guia.atajos.a14': 'Switch off all mods',
    'guia.atajos.a15': 'In a terminal: copy (with nothing selected, Ctrl+C goes to the program) and paste',
    'guia.atajos.a16': 'In a terminal: search inside it. It does not reach the agent',
    'guia.atajos.mantener': '(hold)',
    'guia.atajos.p': 'These <b>cannot be changed</b>. The canvas ones can, in <b>Settings → Shortcuts</b>: there ' +
                     'are 31 actions (for example <kbd>Alt</kbd> + <kbd>C</kbd> opens a Claude, <kbd>Alt</kbd> + ' +
                     '<kbd>T</kbd> a terminal, and <kbd>V</kbd>, <kbd>P</kbd>, <kbd>F</kbd>… are the drawing ' +
                     'tools). They only act with the canvas in front of you and the focus outside a terminal and ' +
                     'a text box, and <b>Back to the factory ones</b> puts everything back as it came.',

    /* ------------------------------ DONDE GUARDA ------------------------- */
    'guia.donde.h': 'Where your things live',
    'guia.donde.p': 'All on your machine, and in formats you can open yourself. The Adeorq data folder is ' +
                    '<code>%LOCALAPPDATA%\\Adeorq</code> on Windows, <code>~/.local/share/adeorq</code> on Linux ' +
                    '(or wherever <code>XDG_DATA_HOME</code> says) and ' +
                    '<code>~/Library/Application Support/Adeorq</code> on Mac. Inside it:',
    'guia.donde.th1': 'What',
    'guia.donde.th2': 'Where (inside that folder)',
    'guia.donde.q1': 'Goals for the day',
    'guia.donde.d1': '<code>objetivos</code>, one Markdown file per day',
    'guia.donde.q2': 'Canvas notes',
    'guia.donde.d2': '<code>notas</code>, in Markdown',
    'guia.donde.q3': 'The Canvas',
    'guia.donde.d3': '<code>lienzo.json</code>',
    'guia.donde.q4': 'Scheduled jobs',
    'guia.donde.d4': '<code>programados.json</code>',
    'guia.donde.q5': 'Decisions and chats',
    'guia.donde.d5': '<code>decisiones</code>, <code>conserje</code> and <code>chats</code>',
    'guia.donde.q6': 'Agents’ ideas',
    'guia.donde.d6': '<code>bandeja.md</code>, the ideas and steps they suggest',
    'guia.donde.q7': 'Crash trail',
    'guia.donde.d7': '<code>rastro.log</code>',
    'guia.donde.q8': 'Closed terminals',
    'guia.donde.d8': '<code>rastros</code>, the summary of each terminal an agent closed',
    'guia.donde.q9': 'Each program’s accounts',
    'guia.donde.d9': '<code>accounts</code>, one folder per account',
    'guia.donde.q10': 'Mods',
    'guia.donde.d10': '<code>mods</code>',
    'guia.donde.q11': 'Paired phones',
    'guia.donde.d11': '<code>movil.json</code>, only each one’s fingerprint',
    'guia.donde.q12': 'Phone attachments',
    'guia.donde.d12': '<code>pastes</code>, pasted screenshots too',
    'guia.donde.q13': 'API and agent keys',
    'guia.donde.d13': 'Windows Credential Manager, Mac Keychain or, on Linux, the <code>secretos</code> folder ' +
                      '(600 permissions, <b>unencrypted</b>)',
    'guia.donde.q14': 'Sessions and histories',
    'guia.donde.d14': 'Wherever each program leaves them (<code>~/.claude</code> for Claude Code): Adeorq reads ' +
                      'them, it does not copy them',
    'guia.donde.q15': 'Your window settings',
    'guia.donde.d15': 'Theme, font, header, parts and the Cockpit layout live in the window’s own store, not in ' +
                      'a file in that folder',

    /* ---------------------------------- DUDAS ---------------------------- */
    'guia.dudas.h': 'Common questions',
    'guia.dudas.q1': 'Do I need an Adeorq account?',
    'guia.dudas.r1': 'No account is needed. Adeorq is used without creating anything, and it asks you for ' +
                     'nothing when you install it. The programs it runs (Claude Code, Codex…) do have their own.',
    'guia.dudas.q2': 'Does it replace Claude Code or Codex?',
    'guia.dudas.r2': 'No: it runs them. Adeorq does not touch what those programs do or how they do it; it ' +
                     'builds the room around them. If they ship a new feature tomorrow, you have it the same day.',
    'guia.dudas.q3': 'Does it send my data anywhere?',
    'guia.dudas.r3': 'There is no telemetry or analytics, and what you see is kept on your machine. Adeorq goes ' +
                     'online only in these cases:',
    'guia.dudas.r3a': '<b>To check for updates</b>: it asks GitHub at startup, every six hours and when you come ' +
                      'back to the window.',
    'guia.dudas.r3b': '<b>OpenRouter</b>, only if you save your key: checking the key and the balance, listing ' +
                      'models, talking to one and generating the Foreman’s voice.',
    'guia.dudas.r3c': '<b>The compass</b> in the Agenda (dates and ideas), only if you sign in to it with a ' +
                      'munito.dev account.',
    'guia.dudas.r3d': '<b>Phone notifications</b>, if you turn them on: they travel encrypted through your ' +
                      'browser’s notification service (Google, Apple or Mozilla).',
    'guia.dudas.r3bot': '<b>Notifications to a bot</b>, only if you turn them on in Settings → Bots: the webhook of ' +
                        'your Grok Bot (the address you paste yourself) or the Hermes or OpenClaw on your machine, ' +
                        'which goes out on its own.',
    'guia.dudas.r3conectado': '<b>A connected bot</b>, if you connect one in Settings → Bots: what its permission lets ' +
                              'it read reaches it, and from it, its provider.',
    'guia.dudas.r3e': '<b>The phone</b> goes through Tailscale, its private network, not through Adeorq servers.',
    'guia.dudas.r3f': '<b>What you open yourself</b>: the panel browser and the web windows on the canvas load ' +
                      'whatever page you give them, and the agents (Claude Code, Codex…) and the concierge reach ' +
                      'the internet through each one’s own program, not through Adeorq.',
    'guia.dudas.r3g': 'Ollama, Discord, local voice and the phone and MCP servers stay inside your machine.',
    'guia.dudas.q4': 'Can I use two accounts of the same program?',
    'guia.dudas.r4': 'Yes, as long as they are yours and the program supports it (seven do today: see ' +
                     '<a href="#cuentas">Accounts</a>). Each one lives in its own configuration folder and they ' +
                     'do not step on each other.',
    'guia.dudas.q5': 'What happens if I close a pane with an agent working?',
    'guia.dudas.r5': 'The program closes, and everything hanging off it with it. If it was halfway through a ' +
                     'turn, that work is lost: check the state of the pane before closing it. The conversation ' +
                     'is not deleted and can be picked up again.',
    'guia.dudas.q6': 'Windows says the installer is not safe',
    'guia.dudas.r6': 'That is the standard warning for programs without a paid commercial signature. The ' +
                     'installer is signed with the Adeorq updater key, which is what guarantees that the update ' +
                     'reaching you is ours.',
    'guia.dudas.q7': 'I cannot find the Cockpit (or the Canvas, Memory or Chat)',
    'guia.dudas.r7': 'It is switched off in <b>Settings → Appearance → Parts of Adeorq</b>, or removed from the ' +
                     'header in <b>The header</b>. Ctrl+K takes you there anyway.',
    'guia.dudas.q8': 'A terminal of mine will not let another program type into it',
    'guia.dudas.r8': 'That is the MCP tier: by default, whatever comes from outside Adeorq only opens terminals ' +
                     'and looks. It is explained in <a href="#programa-de-fuera">What an outside program can ' +
                     'do</a>.',
    'guia.cierre': 'Is something missing from this guide, or does something not work the way it is described ' +
                   'here? Say so and it gets fixed.',
    'guia.cierre.cta': 'Report a problem',

    /* ----------------------------------- PIE ----------------------------- */
    'guia.pie.lema': 'The panel where your agents work in real terminals. On Windows and Linux, and with ' +
                     'you on your phone.',
    'guia.pie.producto': 'Product',
    'guia.pie.recursos': 'Resources',
    'guia.pie.ecosistema': 'Ecosystem',
    'guia.pie.preguntas': 'Questions',
    'guia.pie.versiones': 'All versions',
    'guia.pie.licencia': 'Licence',
    'guia.pie.marcas': 'Not affiliated with Anthropic, OpenAI, Google or Microsoft. Their names and logos are ' +
                       'trademarks of their owners, and here they only identify which tool you are working with.',
    'guia.pie.copyright': '© 2026 Adeorq · part of the Orquio ecosystem',
    'guia.pie.privacidad': 'This site uses no cookies and does not track you.'
  }
};
