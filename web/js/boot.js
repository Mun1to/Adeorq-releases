/* ============================================================================
   Adeorq · boot.js
   Arranque de la pagina: idioma, valvula de movimiento y estado del nav.
   El tema NO se toca desde aqui a proposito: lo resuelve CSS puro en base.css
   (SmartDefaults Tier A), asi sigue al sistema en vivo y sin parpadeo posible.
   ========================================================================= */

(function () {
  'use strict';

  var raiz = document.documentElement;
  raiz.classList.add('js');

  /* ------------------------------------------------------------------
     1. IDIOMA
     El <head> ya decidio y escribio raiz.lang. Aqui solo se intercambian
     los textos si toca. La eleccion explicita manda para siempre: nunca
     se vuelve a "adivinar" en cargas posteriores.
     ------------------------------------------------------------------ */

  var TEXTOS = {
    en: {
      'skip': 'Skip to content',
      'nav.queEs': 'Overview',
      'nav.funciones': 'Features',
      'nav.novedades': 'Changelog',
      'nav.guia': 'Guide',
      'nav.descargar': 'Downloads',
      'guia.home.eyebrow': 'Documentation',
      'guia.home.titulo': 'Everything it does, explained.',
      'guia.home.lead': 'What each screen does, in the order you meet them. With the states of a ' +
                        'session, the shortcuts and where it keeps your things, in case you would ' +
                        'rather check for yourself.',
      'guia.home.a1': 'The Cockpit',
      'guia.home.a1d': 'The terminals, the sidebar and what each state means.',
      'guia.home.a2': 'The Dashboard and the Foreman',
      'guia.home.a2d': 'The summary of the day, and who proposes how the work is split.',
      'guia.home.a3': 'Goals for today',
      'guia.home.a3d': 'The floating panel, and why an agent can tick them off.',
      'guia.home.a4': 'Where your things live',
      'guia.home.a4d': 'All on your machine, and in formats you can open yourself.',
      'guia.home.cta': 'Open the guide',
      /* --- El Panel de la maqueta (dash.js) --- */
      'dash.saludo': 'Good afternoon.',
      'dash.sub': '3 sessions running and nothing waiting on you.',
      'dash.refrescar': 'Refresh',
      'dash.c1': 'working now',
      'dash.c1b': 'no subagents out',
      'dash.c2': 'waiting for you',
      'dash.c2b': 'nothing pending on you',
      'dash.c3': 'sessions this week',
      'dash.c3b': 'across 17 projects',
      'dash.c4': 'projects',
      'dash.sec.ahora': 'Now',
      'dash.sec.proyectos': 'Projects',
      'dash.sec.mision': 'Mission',
      'dash.sec.pulso': 'Pulse',
      'dash.capataz': 'Foreman',
      'dash.capataz.d': 'Ask it for the board in plain language: it proposes the plan and runs nothing without your OK.',
      'dash.ej1': 'open the Orquio panel',
      'dash.ej2': 'frontend and backend at once',
      'dash.ej3': 'review the CSS',
      'dash.ph': 'Ask me for the board: "open the sessions of the Orquio panel"',
      'dash.planear': 'Plan it',
      'dash.dictar': 'Dictate',
      'dash.limpiar': 'Clear',
      'dash.plan.t': 'Proposal · 3 sessions',
      'dash.plan.espera': 'waiting for your OK',
      'dash.aprobar': 'Approve and open',
      'dash.descartar': 'Discard',
      'dash.calientes': 'Hot projects',
      'dash.calientes.d': 'this week',
      'dash.proy.t': 'Your projects',
      'dash.proy.nuevo': '+ New project',
      'dash.proy.d': 'When you create it the folder is born ready: AGENTS.md with your rules, docs/METAS.md and git initialised, so the first session starts with context instead of from scratch.',
      'dash.proy.abrir': 'Open all',
      'dash.proy.sesion': 'New session',
      'dash.proy.s3': '3 sessions',
      'dash.proy.s1': '1 waiting for you',
      'dash.proy.dormida': 'asleep',
      'dash.mision.t': 'Deploy a team',
      'dash.mision.d': 'One agent per role, each with its brief and its share of the files, coordinated through a shared file in the project. Tap a role to drop it from the team.',
      'dash.roles': 'roles',
      'dash.desplegar': 'Deploy the team',
      'dash.irCabina': 'Go to the Cockpit',
      'dash.pulso.t': 'What it is costing you',
      'dash.pulso.d': 'It measures the whole tree of processes, not just the window, because what really weighs are the programs hanging off it.',
      'dash.cerrar': 'Close',
      /* --- La replica de la app (maqueta del hero) --- */
      'demo.tab.panel2': 'Panel',
      'demo.tab.cabina2': 'Cockpit',
      'demo.tab.agenda2': 'Agenda',
      'demo.tab.lienzo2': 'Canvas',
      'demo.tab.cuentas2': 'Accounts',
      'demo.tab.comandos2': 'Commands',
      'demo.tab.ajustes2': 'Settings',
      'demo.emision': 'Streaming',
      'demo.capataz': 'Foreman',
      'demo.filtrar': 'Filter projects and sessions',
      'demo.proyectos': 'PROJECTS',
      'demo.escribe': 'Type a command or a prompt',
      'demo.escribe2': 'Type "cargo check", "git status" or a command',
      'demo.escribe3': 'Type a prompt for Codex',
      'demo.escribe4': 'Type for agy',
      'demo.turno': 'Turn finished',
      'demo.espera': 'Waiting for you',
      'demo.trabajando': 'Working',
      'demo.atajos': 'Ctrl+Shift+? = Shortcuts',
      'demo.footer.status': '4 ConPTY terminals active · 0 errors',
      'cta.descargar': 'Download',
      'command.open': 'Go to...',
      'command.eyebrow': 'Quick navigation',
      'command.title': 'Where do you want to go?',
      'command.group': 'Explore',
      'command.about': 'What is Adeorq?',
      'command.aboutHint': 'Real terminals for your agents',
      'command.features': 'Features',
      'command.featuresHint': 'Everything the cockpit can do',
      'command.changelog': 'Changelog',
      'command.changelogHint': 'The latest published improvements',
      'command.faq': 'Frequently asked questions',
      'command.faqHint': 'Quick answers before installing',
      'command.download': 'Download Adeorq',
      'command.downloadHint': 'Free for Windows 10 and 11',
      'command.empty': 'I cannot find that section.',
      'motion.reducir': 'Less motion',
      'motion.devolver': 'Full motion',
      'hero.pildora': 'Real terminals, not another chat box',
      'hero.titulo1': 'Nine agents working in parallel.',
      'hero.titulo2': 'One single screen.',
      'hero.entrada': 'Adeorq is the native Windows desktop panel built for agentic development. ' +
                      'Open projects in real ConPTY terminals, track Claude Code sessions live, ' +
                      'capture ideas instantly, and orchestrate agent squads with ease.',
      'cta.windows': 'Download for Windows',
      'cta.meta': 'free, no account required',
      'cta.como': 'See how it works',
      'descarga.linux': 'Download for Linux',
      'hero.nota1': 'Windows 10 & 11',
      'hero.nota2': 'Signed updates',
      'hero.nota3': 'No API keys required',
      'hero.bajar': 'more',
      'demo.panel': 'Panel',
      'demo.cabina': 'Cockpit',
      'demo.guia': 'Guide',
      'demo.sesiones': 'Sessions',
      'demo.agenda': 'Agenda',
      'demo.s1': 'web hero',
      'demo.s2': 'voice dictation',
      'demo.s3': 'click editor',
      'demo.s4': 'core',
      'demo.t1': 'idea from the inbox',
      'demo.t2': 'sign the installer',
      'demo.pane1': 'claude · hero',
      'demo.pane2': 'pnpm tauri dev',
      'demo.aviso': 'This project has uncommitted changes',
      'demo.tab.cabina': '▦ Cockpit',
      'demo.tab.lienzo': '⬡ Canvas',
      'demo.tab.cuentas': '◍ Accounts',
      'demo.tab.panel': '◱ Panel',
      'demo.tab.ajustes': '⚙ Settings',
      'demo.btn.add': '+ New session',
      'demo.search.ph': 'Filter projects...',
      'demo.section.ws': 'WORKSPACES',
      'demo.session.s1': 'web hero',
      'demo.session.s2': 'web infra & deploy',
      'demo.session.now': 'now',
      'demo.btn.turn': '🔔 Turn OK',
      'demo.input.ph1': 'Type a command or prompt and press Enter...',
      'demo.input.ph2': 'Type \'cargo check\', \'git status\' or a command...',
      'demo.input.ph3': 'Type a prompt for Codex...',
      'demo.input.ph4': 'Type for agy...',
      'demo.canvas.title': '⬡ Infinite Canvas (React Flow Engine)',
      'demo.canvas.draw': '✏️ Draw',
      'demo.canvas.clear': '🧽 Clear lines',
      'demo.canvas.addNote': '+ Note 📝',
      'demo.canvas.addPomo': '+ Pomodoro ⏱️',
      'demo.canvas.addAgent': '+ Subagent 🤖',
      'demo.canvas.n1.head': '🤖 Subagent Claude (Source)',
      'demo.canvas.n1.status': 'Status: Turn finished · 2 files edited',
      'demo.canvas.note.title': 'Sticky Note',
      'demo.canvas.note.text': '💡 Swarm Mission idea: connect frontend and backend subagents via BUZON.md to trigger concurrent builds.',
      'demo.canvas.pomo.title': 'Foreman Pomodoro',
      'demo.canvas.pomo.start': '▶ Start',
      'demo.canvas.pomo.reset': '↺ Reset',
      'demo.canvas.relay': '⚡ Simulate Relay',
      'demo.canvas.n2.head': '❯_ ConPTY Terminal (Target)',
      'demo.canvas.n2.status': 'Waiting for agent relay...',
      'demo.accounts.title': '◍ Account Manager & Usage Limits',
      'demo.accounts.add': '+ Add Account',
      'demo.accounts.c1.name': 'Claude Code (Main)',
      'demo.accounts.default': 'Default',
      'demo.accounts.session': 'Session (5h)',
      'demo.accounts.weekly': 'Weekly limit',
      'demo.accounts.consumed1': '65% consumed',
      'demo.accounts.consumed2': '24% consumed',
      'demo.accounts.consumed3': '10% consumed',
      'demo.accounts.consumed4': '5% consumed',
      'demo.swarm.title': '🚀 Mission Swarm (Agent Squad)',
      'demo.swarm.agents': '4 Agents',
      'demo.swarm.desc': 'Automatic agent coordination via BUZON.md with split roles:',
      'demo.swarm.role.fe': 'Frontend',
      'demo.swarm.role.be': 'Backend',
      'demo.swarm.role.sec': 'Security',
      'demo.swarm.role.des': 'Design',
      'demo.swarm.goCockpit': '▶ Go to Cockpit Terminals',
      'demo.presets.title': '⚡ Quick Presets',
      'demo.preset.claude': '✦ New Claude Code',
      'demo.settings.title': '⚙ Settings & Native Visual Theme Selector',
      'demo.settings.sub': 'Click any theme to change the demo skin in real time:',
      'demo.theme.azul': 'Blue (Default)',
      'demo.theme.grafito': 'Graphite',
      'demo.theme.violeta': 'Violet',
      'demo.theme.verde': 'Green',
      'demo.theme.carmin': 'Crimson',
      'demo.theme.ambar': 'Amber',
      'demo.theme.oceano': 'Ocean',
      'demo.theme.neon': 'Neon',
      'demo.tab.agenda': '🗓 Agenda',
      'demo.tab.guia': '? Guide',
      'demo.tab.comandos': '⌘ Commands',
      'demo.btn.capataz': '✦ Foreman',
      'demo.ask.codex': 'Codex requests folder trust confirmation:',
      'demo.ask.yes': '1 · Yes, trust',
      'demo.ask.no': '2 · No',
      'demo.agenda.title': '🗓 Agenda Tray (%LOCALAPPDATA%\\Adeorq\\bandeja.md)',
      'demo.agenda.sync': 'Synchronized',
      'demo.agenda.sub': 'Ideas and notes captured during voice dictation sessions (VoCript / Layco). Accept or discard them:',
      'demo.agenda.i1': 'Add support for 3-column split mode on ultra-wide screens.',
      'demo.agenda.i2': 'Clean Rust cache C:\\ct (CARGO_TARGET_DIR) after the next release build finishes.',
      'demo.agenda.i3': 'Sync DOM visual edits directly into Tauri source files with froede companion.',
      'demo.agenda.accept': '✓ Accept',
      'demo.agenda.discard': '✕ Discard',
      'demo.guia.title': '? Adeorq Agentic Development Environment Guide',
      'demo.guia.c1.title': '✦ Vibe Coding via Real CLIs',
      'demo.guia.c1.desc': 'Adeorq wraps real terminals (Claude Code, Agy, Codex) with the best UI, bringing instant 1M context & reasoning without API proxies.',
      'demo.guia.c2.title': '🗓 Tray & Inter-Session Mailbox',
      'demo.guia.c2.desc': 'Agents coordinate via ephemeral BUZON.md files and record ideas in bandeja.md to maintain dictation flow in VoCript.',
      'demo.guia.c3.title': '👁 Streaming Mode & Privacy',
      'demo.guia.c3.desc': 'With one click (or Ctrl+Shift+E), Adeorq diffuses file paths, emails, secrets, and tokens for worry-free screen sharing and recordings.',
      'demo.cmd.title': '⌘ Quick Command Palette & Presets',
      'demo.cmd.ph': 'Search commands...',
      'demo.cmd.d1': 'Start local development server with hot reload (Rust ConPTY engine)',
      'demo.cmd.d2': 'Verify syntax and check compiler lints without building the full binary',
      'demo.cmd.d3': 'Launch Claude agent with repository file modification permissions enabled',
      'demo.cmd.d4': 'Approve native binary builds after a clean installation in the workspace',
      'demo.cmd.launch': '▶ Launch',
      'demo.foreman.title': 'Foreman Orchestrator',
      'demo.foreman.msg': '<strong>Squad Status:</strong> 4 active terminals. Checked <code>BUZON.md</code> and integrated 2 pending tasks into the agenda.',
      'demo.foreman.t1': '<strong>Agent 1 (Claude):</strong> Waiting for your instructions after editing hero.',
      'demo.foreman.t2': '<strong>Agent 2 (ConPTY):</strong> Dev server running in 1.2s. 0 errors.',
      'demo.foreman.t3': '<strong>Agent 3 (Codex):</strong> Waiting for workspace folder trust confirmation.',
      'demo.foreman.t4': '<strong>Agent 4 (Agy):</strong> Sandbox in auto-edits mode, idle.',
      'demo.foreman.opt': '⚡ Optimize terminal resources',
      'demo.foreman.rep': '📋 Generate session report',
      /* Lineas de la maqueta: cuentan una escena de trabajo */
      'term.1': '· reading web/DISENO.md',
      'term.2': '✓ hero running at 60 fps',
      'term.3': 'done, turn finished',
      'term.4': 'app open in 1.2 s'
    }
  };

  /* Paginas que no son la portada (hoy la guia) traen su propio diccionario en
     window.ADEORQ_I18N_EXTRA, cargado antes que este archivo. Se funde aqui en
     vez de engordar el de arriba, que viaja en TODAS las paginas. */
  if (window.ADEORQ_I18N_EXTRA) {
    Object.keys(window.ADEORQ_I18N_EXTRA).forEach(function (lang) {
      if (!TEXTOS[lang]) TEXTOS[lang] = {};
      var extra = window.ADEORQ_I18N_EXTRA[lang];
      Object.keys(extra).forEach(function (k) { TEXTOS[lang][k] = extra[k]; });
    });
  }

  var TITULOS = {
    es: 'Adeorq · el taller de vibe coding con terminales de verdad',
    en: 'Adeorq · nine agents working, one single screen'
  };

  if (window.ADEORQ_TITULOS) {
    TITULOS.es = window.ADEORQ_TITULOS.es || TITULOS.es;
    TITULOS.en = window.ADEORQ_TITULOS.en || TITULOS.en;
  }

  var MAQUETA = {
    es: 'Maqueta del panel de Adeorq: la barra de pestañas, la lista de sesiones por ' +
        'proyecto con su estado y dos terminales abiertas, una de ellas con el turno terminado',
    en: 'Mockup of the Adeorq panel: the tab bar, the session list per project with its state ' +
        'and two open terminals, one of them done with its turn'
  };

  var ORIGINAL = {};          // Dicc en español
  var ORIGINAL_PH = {};
  var ORIGINAL_HTML = {};     // Parrafos que llevan <b>, <code> o un enlace dentro

  function registrarOriginales() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (n) {
      var k = n.getAttribute('data-i18n');
      if (!ORIGINAL[k]) ORIGINAL[k] = n.textContent.trim();
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-ph]'), function (n) {
      var k = n.getAttribute('data-i18n-ph');
      if (!ORIGINAL_PH[k]) ORIGINAL_PH[k] = n.placeholder;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-html]'), function (n) {
      var k = n.getAttribute('data-i18n-html');
      if (!ORIGINAL_HTML[k]) ORIGINAL_HTML[k] = n.innerHTML.trim();
    });
  }

  registrarOriginales();

  function pintarIdioma(lang) {
    var dic = lang === 'es' ? ORIGINAL : TEXTOS[lang];
    if (!dic) return;
    registrarOriginales();

    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (n) {
      var clave = n.getAttribute('data-i18n');
      var txt = dic[clave] != null ? dic[clave] : ORIGINAL[clave];
      if (txt != null && n.textContent !== txt) n.textContent = txt;
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-ph]'), function (n) {
      var clave = n.getAttribute('data-i18n-ph');
      var txt = (lang === 'es' ? ORIGINAL_PH[clave] : TEXTOS.en[clave]) || ORIGINAL_PH[clave];
      if (txt != null && n.placeholder !== txt) n.placeholder = txt;
    });

    /* innerHTML y no textContent: estos nodos llevan formato dentro. El origen
       es nuestro HTML y nuestro diccionario, nunca texto de un visitante. */
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-html]'), function (n) {
      var clave = n.getAttribute('data-i18n-html');
      var txt = dic[clave] != null ? dic[clave] : ORIGINAL_HTML[clave];
      if (txt != null && n.innerHTML !== txt) n.innerHTML = txt;
    });

    raiz.lang = lang;
    if (TITULOS[lang]) document.title = TITULOS[lang];
    window.dispatchEvent(new CustomEvent('adeorq:language', { detail: { lang: lang } }));
    var panel = document.getElementById('panel-demo');
    if (panel && MAQUETA[lang]) panel.setAttribute('aria-label', MAQUETA[lang]);

    var toggleTexto = document.getElementById('idioma-toggle-texto');
    if (toggleTexto) {
      toggleTexto.textContent = lang === 'es' ? 'English' : 'Español';
    }
    Array.prototype.forEach.call(document.querySelectorAll('.idioma__btn'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
    });
    sincronizarValvula();
  }

  pintarIdioma(raiz.lang === 'en' ? 'en' : 'es');

  var btnToggle = document.getElementById('idioma-toggle');
  if (btnToggle) {
    btnToggle.addEventListener('click', function () {
      var nuevoLang = raiz.lang === 'es' ? 'en' : 'es';
      try { localStorage.setItem('adeorq-lang', nuevoLang); } catch (e) {}
      pintarIdioma(nuevoLang);
    });
  }

  /* ------------------------------------------------------------------
     2. VALVULA DE MOVIMIENTO (visible, no solo en la URL)
     No apaga el diseno: pone el dial a 0, y con el dial a 0 la web se
     lee igual porque el recorrido cae pero los fundidos se quedan.
     ------------------------------------------------------------------ */

  var valvula = document.getElementById('valvula-motion');

  function ganancia() {
    return parseFloat(getComputedStyle(raiz).getPropertyValue('--motion-gain')) || 0;
  }

  function sincronizarValvula() {
    if (!valvula) return;
    var apagado = ganancia() === 0;
    valvula.setAttribute('aria-pressed', String(apagado));
    var t = valvula.querySelector('.valvula__texto');
    if (!t) return;
    var lang = raiz.lang === 'en' ? 'en' : 'es';
    var dic = lang === 'es' ? ORIGINAL : TEXTOS.en;
    t.textContent = apagado
      ? (dic['motion.devolver'] || 'Movimiento completo')
      : (dic['motion.reducir'] || 'Menos movimiento');
  }

  // El diccionario espanol de la valvula tiene dos estados y el HTML solo trae uno.
  ORIGINAL['motion.devolver'] = 'Movimiento completo';

  if (valvula) {
    valvula.addEventListener('click', function () {
      var apagar = ganancia() > 0;
      var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      var nueva = apagar ? 0 : (reduce ? 0.25 : 1);
      raiz.style.setProperty('--motion-gain', String(nueva));
      raiz.classList.toggle('motion', nueva > 0);
      try { localStorage.setItem('adeorq-motion', apagar ? 'off' : 'auto'); } catch (e) {}
      sincronizarValvula();
      // hero.js vive de este valor: se lo decimos en vez de que lo sondee.
      window.dispatchEvent(new CustomEvent('adeorq:motion', { detail: { gain: nueva } }));
    });
    sincronizarValvula();
  }

  /* ------------------------------------------------------------------
     3. NAV: se posa al separarse del borde superior
     ------------------------------------------------------------------ */

  var nav = document.getElementById('nav');
  var pendiente = false;

  function mirarScroll() {
    pendiente = false;
    if (nav) nav.classList.toggle('is-posado', window.scrollY > 8);
  }

  window.addEventListener('scroll', function () {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(mirarScroll);
  }, { passive: true });

  mirarScroll();
})();
