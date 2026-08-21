/* ============================================================================
   Adeorq · demo/vistas.js
   LAS OTRAS CUATRO PANTALLAS: Agenda, Lienzo, Cuentas y Comandos.

   Estan calcadas de las capturas del programa (web/docs-img/) y son de mentira
   por dentro: se pulsan, se marcan, se filtran y se tachan, pero no hay ni una
   sesion real detras. Lo que no se puede fingir sin engañar, lo dice.

   Se montan desde JavaScript y no a mano en el HTML porque son cuatro pantallas
   con listas: escritas a pelo serian mil lineas de etiquetas repetidas.
   ========================================================================= */

const $  = (s, d = document) => d.querySelector(s);
const $$ = (s, d = document) => [...d.querySelectorAll(s)];
const avisar = t => (window.adeAvisar ? window.adeAvisar(t) : undefined);
const ico = n => `<svg class="ade-i"><use href="iconos.svg#i-${n}"/></svg>`;

/* ---------------------------------------------------------------------------
   AGENDA
   --------------------------------------------------------------------------- */

function agenda(host) {
  host.innerHTML = `
    <div class="panel">
      <header class="panel-hero">
        <h1>Agenda</h1>
        <p>Lo que viene, lo que se te ocurrió y lo que toca después.</p>
      </header>

      <!-- El aviso con cuenta atrás: en la app sale arriba del todo cuando
           queda poco para algo con fecha. -->
      <section class="panel-card ade-aviso">
        <span class="ade-aviso-dias">faltan 2 días</span>
        <span class="ade-aviso-txt">
          <b>AI Act art. 50: el Chat debe identificarse como IA</b>
          <i>2026-08-22</i>
        </span>
        <button type="button" class="mini" data-hace="abrir-aviso">Abrir</button>
      </section>

      <div class="set-marco">
        <nav class="set-nav" id="ag-nav">
          <button type="button" class="set-tab" data-sec="hoy" data-on>
            ${ico('diana')}<span class="set-tab-nom">Hoy</span><span class="set-tab-badge">1</span>
          </button>
          <button type="button" class="set-tab" data-sec="calendario">
            ${ico('calendario')}<span class="set-tab-nom">Calendario</span><span class="set-tab-badge">8</span>
          </button>
          <button type="button" class="set-tab" data-sec="ideas">
            ${ico('bombilla')}<span class="set-tab-nom">Ideas</span><span class="set-tab-badge">14</span>
          </button>
          <button type="button" class="set-tab" data-sec="pasos">
            ${ico('bandera')}<span class="set-tab-nom">Pasos siguientes</span>
          </button>
        </nav>

        <div class="set-hoja">
          <div class="ade-sec" data-sec="hoy">
            <section class="panel-card">
              <h2>Objetivos de hoy</h2>
              <p class="card-hint" id="ag-fecha">—</p>
              <ul class="ade-metas" id="ag-metas"></ul>
              <input class="finder ade-ancho" id="ag-nueva" type="text"
                     placeholder="Lo que quieres tener hecho hoy">
              <p class="card-hint ade-nota">
                Viven en un archivo, así que un agente puede tacharlos cuando estén hechos.
                <button type="button" class="mini" data-hace="abrir-archivo">Abrir el archivo</button>
              </p>
            </section>
          </div>

          <div class="ade-sec" data-sec="calendario" hidden>
            <section class="panel-card">
              <h2>Lo que viene</h2>
              <p class="card-hint">Con su fecha, y lo que falta para cada cosa.</p>
              <ul class="ade-lista" id="ag-cal"></ul>
            </section>
          </div>

          <div class="ade-sec" data-sec="ideas" hidden>
            <section class="panel-card">
              <h2>La bandeja</h2>
              <p class="card-hint">Lo que se te ocurre al vuelo, y lo que proponen los agentes.
                 Se acepta o se descarta: nunca deciden ellos.</p>
              <ul class="ade-lista" id="ag-ideas"></ul>
            </section>
          </div>

          <div class="ade-sec" data-sec="pasos" hidden>
            <section class="panel-card">
              <h2>Pasos siguientes</h2>
              <p class="card-hint">Lo que dejó apuntado la última sesión de cada proyecto.</p>
              <ul class="ade-lista" id="ag-pasos"></ul>
            </section>
          </div>
        </div>
      </div>
    </div>`;

  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const h = new Date();
  $('#ag-fecha', host).textContent =
    `${dias[h.getDay()]} ${h.getDate()} de ${meses[h.getMonth()]}`.toUpperCase();

  const metas = [{ t: 'terminar la maqueta del panel', hecha: false }];
  const pintaMetas = () => {
    $('#ag-metas', host).innerHTML = metas.map((m, i) => `
      <li class="ade-meta" data-i="${i}"${m.hecha ? ' data-hecha="si"' : ''}>
        <button type="button" class="ade-check" aria-label="Marcar">${m.hecha ? '✓' : ''}</button>
        <span>${m.t}</span>
      </li>`).join('');
  };
  pintaMetas();

  $('#ag-metas', host).addEventListener('click', e => {
    const li = e.target.closest('.ade-meta');
    if (!li) return;
    const m = metas[+li.dataset.i];
    m.hecha = !m.hecha;
    pintaMetas();
    if (m.hecha) avisar('En la app esto vive en un archivo, así que un agente puede tacharlo solo.');
  });

  $('#ag-nueva', host).addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.value.trim()) return;
    metas.push({ t: e.target.value.trim(), hecha: false });
    e.target.value = '';
    pintaMetas();
  });

  const lista = (id, filas) => {
    $(id, host).innerHTML = filas.map(f => `
      <li class="ade-fila">
        <span class="ade-fila-marca" style="--c:${f.c || 'var(--accent)'}"></span>
        <span class="ade-fila-txt"><b>${f.t}</b>${f.s ? `<i>${f.s}</i>` : ''}</span>
        ${f.d ? `<span class="count">${f.d}</span>` : ''}
      </li>`).join('');
  };

  lista('#ag-cal', [
    { t: 'AI Act art. 50: avisar de que es una IA', s: 'Adeorq · 2026-08-22', d: '2 d' },
    { t: 'Renovar munito.dev', s: 'Dominios · 2026-09-04', d: '15 d' },
    { t: 'Revisar la caché de C:\\ct', s: 'Mantenimiento · 2026-08-27', d: '7 d' },
  ]);
  lista('#ag-ideas', [
    { t: 'Un navegador dentro del Lienzo', s: 'propuesta del Capataz · Adeorq' },
    { t: 'Que la Cabina recuerde el reparto por proyecto', s: 'idea al vuelo · Adeorq' },
    { t: 'Exportar la sesión a Markdown', s: 'idea al vuelo · Adeorq' },
  ]);
  lista('#ag-pasos', [
    { t: 'Llevar la maqueta a la landing', s: 'Adeorq · lo dejó la sesión de hoy' },
    { t: 'Medir el arranque en frío', s: 'src-tauri · lo dejó ayer' },
  ]);

  host.addEventListener('click', e => {
    const b = e.target.closest('[data-hace]');
    if (!b) return;
    if (b.dataset.hace === 'abrir-aviso')   avisar('Abriría la ficha del aviso, con lo que hay que hacer y por qué.');
    if (b.dataset.hace === 'abrir-archivo') avisar('En la app abre el archivo de objetivos en tu editor.');
  });
}

/* ---------------------------------------------------------------------------
   CUENTAS
   --------------------------------------------------------------------------- */

const CLIS = [
  { id: 'claude', nom: 'Claude Code', c: '#d97757', cuentas: [
      { nom: 'Claude Code', def: true, estado: 'Preguntando a Claude…' }] },
  { id: 'codex', nom: 'Codex', c: '#9aa4b8', cuentas: [
      { nom: 'Codex', estado: 'Este CLI no publica el gasto en la máquina, así que no hay barras que enseñar.' }] },
  { id: 'gemini', nom: 'Gemini CLI', c: '#4d9fff', cuentas: [] },
  { id: 'copilot', nom: 'GitHub Copilot', c: '#8fc6ff', solo: true, cuentas: [] },
  { id: 'crush', nom: 'Crush', c: '#ec4899', solo: true, cuentas: [] },
  { id: 'antigravity', nom: 'Antigravity', c: '#7ee0a8', solo: true, cuentas: [] },
];

function cuentas(host) {
  const tarjetas = CLIS.map(cli => `
    <section class="ade-cli">
      <h3 class="ade-cli-tit">
        <span class="ade-cli-punto" style="--c:${cli.c}"></span>${cli.nom}
        ${cli.solo ? '<span class="pane-chip">una cuenta</span>' : ''}
      </h3>
      <div class="ade-cli-caja">
        ${cli.cuentas.map(c => `
          <article class="panel-card ade-cuenta">
            <h4>
              <span class="ade-cli-punto" style="--c:${cli.c}"></span>${c.nom}
              ${c.def ? '<span class="pane-chip">POR DEFECTO</span>' : ''}
            </h4>
            <p class="card-hint">${c.estado}</p>
            <button type="button" class="mini" data-abre="${cli.nom}">Terminal con esta</button>
          </article>`).join('')}
        <button type="button" class="ade-mas" data-anade="${cli.nom}">
          <span>＋</span> Añadir cuenta
        </button>
      </div>
    </section>`).join('');

  host.innerHTML = `
    <div class="panel">
      <header class="panel-hero">
        <h1>Cuentas</h1>
        <p>Cada cuenta es un acceso distinto del mismo CLI, con su propia carpeta.
           Las terminales nuevas nacen con la que dejes por defecto.</p>
      </header>

      <div class="stats">
        <div class="stat-card">
          <span class="stat-num">2</span>
          <span class="stat-label">cuentas conectadas</span>
          <span class="stat-foot">de 9 programas instalados</span>
        </div>
        <div class="stat-card">
          <span class="stat-num">68%</span>
          <span class="stat-label">el límite más apretado</span>
          <span class="stat-foot">Claude Code · vuelve a las 9:00</span>
        </div>
        <div class="stat-card">
          <span class="stat-num">Claude</span>
          <span class="stat-label">la de por defecto</span>
          <span class="stat-foot">con ella nacen las terminales nuevas</span>
        </div>
      </div>

      <div class="set-marco">
        <nav class="set-nav" id="cu-nav">
          <button type="button" class="set-tab" data-sec="tuyas" data-on>
            ${ico('cuentas')}<span class="set-tab-nom">Tus cuentas</span>
          </button>
          <button type="button" class="set-tab" data-sec="claves">
            ${ico('ajustes')}<span class="set-tab-nom">Claves de API</span>
          </button>
          <button type="button" class="set-tab" data-sec="faltan">
            ${ico('descargar')}<span class="set-tab-nom">No instalados</span><span class="set-tab-badge">2</span>
          </button>
        </nav>
        <div class="set-hoja">
          <div class="ade-sec" data-sec="tuyas">${tarjetas}</div>
          <div class="ade-sec" data-sec="claves" hidden>
            <section class="panel-card">
              <h2>Claves de API</h2>
              <p class="card-hint">Se guardan cifradas en tu máquina y no vuelven nunca al panel.
                 Adeorq funciona sin ellas: usa la cuenta que ya tienes.</p>
            </section>
          </div>
          <div class="ade-sec" data-sec="faltan" hidden>
            <section class="panel-card">
              <h2>Los que no tienes</h2>
              <p class="card-hint">Cada uno con su botón, que abre una terminal y lanza la instalación.</p>
              <ul class="ade-lista">
                <li class="ade-fila"><span class="ade-fila-marca" style="--c:#7ee0a8"></span>
                  <span class="ade-fila-txt"><b>Antigravity</b><i>no está en el PATH</i></span>
                  <button type="button" class="mini" data-anade="Antigravity">Descargar</button></li>
                <li class="ade-fila"><span class="ade-fila-marca" style="--c:#ec4899"></span>
                  <span class="ade-fila-txt"><b>Crush</b><i>no está en el PATH</i></span>
                  <button type="button" class="mini" data-anade="Crush">Abrir su web</button></li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>`;

  host.addEventListener('click', e => {
    const abre = e.target.closest('[data-abre]');
    if (abre) { avisar(`Abriría una terminal nueva con ${abre.dataset.abre}.`); return; }
    const anade = e.target.closest('[data-anade]');
    if (anade) avisar(`En la app se abre el acceso de ${anade.dataset.anade} en su propia carpeta.`);
  });
}

/* ---------------------------------------------------------------------------
   LIENZO
   --------------------------------------------------------------------------- */

function lienzo(host) {
  host.innerHTML = `
    <div class="ade-lienzo" id="li-tablero">
      <div class="ade-lienzo-barra">
        <span class="rail-tabs">
          <button type="button" class="mini" data-on title="Mover">${ico('esquina')}</button>
          <button type="button" class="mini" data-pieza="nota" title="Nota">${ico('nota')}</button>
          <button type="button" class="mini" data-pieza="imagen" title="Imagen">${ico('imagen')}</button>
          <button type="button" class="mini" data-pieza="lista" title="Kanban">${ico('filas')}</button>
          <button type="button" class="mini" data-pieza="chat" title="Chat">${ico('terminal')}</button>
        </span>
        <span class="ade-lienzo-pista">Arrastra las piezas. Doble clic en una nota para escribir.</span>
      </div>
      <div class="ade-lienzo-suelo" id="li-suelo"></div>
    </div>`;

  const suelo = $('#li-suelo', host);
  const PIEZAS = [
    { t: 'nota', x: 40,  y: 40,  w: 210, h: 130, txt: 'La maqueta va a la landing cuando Munir la apruebe.' },
    { t: 'nota', x: 285, y: 96,  w: 190, h: 110, txt: 'Los temas salen de App.css, no copiados a mano.' },
    { t: 'lista', x: 520, y: 40, w: 230, h: 210, txt: 'Por hacer' },
    { t: 'chat', x: 790, y: 120, w: 250, h: 150, txt: 'Claude · Adeorq' },
  ];

  const pinta = () => {
    suelo.innerHTML = PIEZAS.map((p, i) => `
      <article class="ade-pieza" data-i="${i}" data-t="${p.t}"
               style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px">
        <header>${p.t === 'lista' ? 'Kanban' : p.t === 'chat' ? 'Chat' : 'Nota'}</header>
        <div class="ade-pieza-cuerpo">${
          p.t === 'lista'
            ? '<span class="ade-tarea">Llevar la maqueta a la landing</span>' +
              '<span class="ade-tarea">Medir el arranque en frío</span>' +
              '<span class="ade-tarea">Barrer el scratchpad</span>'
            : p.t === 'chat'
              ? '<span class="t-tu">› ¿qué falta?</span><span class="t-di">Las cuatro vistas y el Ctrl+K.</span>'
              : `<span contenteditable="true" spellcheck="false">${p.txt}</span>`
        }</div>
      </article>`).join('');
  };
  pinta();

  // Arrastrar de verdad: se agarra por la cabecera y se suelta donde quieras.
  let llevando = null, dx = 0, dy = 0;
  suelo.addEventListener('pointerdown', e => {
    const cab = e.target.closest('.ade-pieza > header');
    if (!cab) return;
    const pieza = cab.parentElement;
    llevando = pieza;
    const r = pieza.getBoundingClientRect();
    const s = suelo.getBoundingClientRect();
    const k = r.width / pieza.offsetWidth || 1;
    dx = (e.clientX - r.left) / k;
    dy = (e.clientY - r.top) / k;
    pieza.dataset.llevando = 'si';
    suelo.setPointerCapture(e.pointerId);
  });
  suelo.addEventListener('pointermove', e => {
    if (!llevando) return;
    const s = suelo.getBoundingClientRect();
    const k = s.width / suelo.offsetWidth || 1;
    const x = (e.clientX - s.left) / k - dx;
    const y = (e.clientY - s.top) / k - dy;
    llevando.style.left = Math.max(0, x) + 'px';
    llevando.style.top = Math.max(0, y) + 'px';
    const i = +llevando.dataset.i;
    PIEZAS[i].x = Math.max(0, x); PIEZAS[i].y = Math.max(0, y);
  });
  const soltar = () => {
    if (!llevando) return;
    delete llevando.dataset.llevando;
    llevando = null;
  };
  suelo.addEventListener('pointerup', soltar);
  suelo.addEventListener('pointercancel', soltar);

  $$('.ade-lienzo-barra [data-pieza]', host).forEach(b => {
    b.addEventListener('click', () => {
      PIEZAS.push({ t: b.dataset.pieza === 'imagen' ? 'nota' : b.dataset.pieza,
                    x: 60 + PIEZAS.length * 26, y: 220 + (PIEZAS.length % 3) * 20,
                    w: 200, h: 120, txt: 'Escribe aquí.' });
      pinta();
      avisar('En la app la pieza se guarda en el archivo del lienzo, y sigue ahí mañana.');
    });
  });
}

/* ---------------------------------------------------------------------------
   COMANDOS
   --------------------------------------------------------------------------- */

const COMANDOS = [
  { g: 'Sesiones', t: 'Abrir una sesión nueva', k: 'Ctrl+N' },
  { g: 'Sesiones', t: 'Abrir todo el proyecto', k: 'Ctrl+Mayús+O' },
  { g: 'Sesiones', t: 'Cerrar la sesión activa', k: 'Ctrl+W' },
  { g: 'Cabina',   t: 'Dividir el panel a la derecha', k: 'Ctrl+Mayús+→' },
  { g: 'Cabina',   t: 'Dividir el panel abajo', k: 'Ctrl+Mayús+↓' },
  { g: 'Cabina',   t: 'Maximizar el panel activo', k: 'Ctrl+Mayús+F' },
  { g: 'Cabina',   t: 'Sacar el panel a su ventana', k: 'Ctrl+Mayús+V' },
  { g: 'Capataz',  t: 'Pedirle el tablero al Capataz', k: 'Ctrl+Mayús+A' },
  { g: 'Emisión',  t: 'Tapar rutas y nombres (emitir)', k: 'Ctrl+Mayús+E' },
  { g: 'Emisión',  t: 'Pantalla de pánico', k: 'Ctrl+Mayús+P' },
  { g: 'Ir a',     t: 'Ir al Panel', k: 'Ctrl+1' },
  { g: 'Ir a',     t: 'Ir a la Cabina', k: 'Ctrl+2' },
  { g: 'Ir a',     t: 'Ir a la Agenda', k: 'Ctrl+3' },
  { g: 'Ayuda',    t: 'Ver todos los atajos', k: 'Ctrl+Mayús+?' },
];

function comandos(host) {
  host.innerHTML = `
    <div class="panel">
      <header class="panel-hero">
        <h1>Comandos</h1>
        <p>Todo lo que hace la app, a un Ctrl+K. Escribe y filtra.</p>
      </header>
      <section class="panel-card">
        <input class="finder ade-ancho" id="cm-buscar" type="search" placeholder="Buscar un comando">
        <ul class="ade-lista ade-comandos" id="cm-lista"></ul>
      </section>
    </div>`;

  const pinta = (q = '') => {
    const filtrados = COMANDOS.filter(c =>
      (c.t + ' ' + c.g).toLowerCase().includes(q.toLowerCase()));
    $('#cm-lista', host).innerHTML = filtrados.length
      ? filtrados.map(c => `
        <li class="ade-fila" data-cmd="${c.t}">
          <span class="pane-chip">${c.g}</span>
          <span class="ade-fila-txt"><b>${c.t}</b></span>
          <kbd class="ade-kbd">${c.k}</kbd>
        </li>`).join('')
      : '<li class="card-hint">No encuentro ese comando.</li>';
  };
  pinta();

  $('#cm-buscar', host).addEventListener('input', e => pinta(e.target.value));
  $('#cm-lista', host).addEventListener('click', e => {
    const li = e.target.closest('[data-cmd]');
    if (li) avisar(`«${li.dataset.cmd}» — en la app se ejecuta al momento.`);
  });
}

/* ---------------------------------------------------------------------------
   MONTAJE
   --------------------------------------------------------------------------- */

const MONTADORES = { agenda, cuentas, lienzo, comandos };

for (const [vista, montar] of Object.entries(MONTADORES)) {
  const sec = $(`.ade-vista[data-vista="${vista}"]`);
  if (!sec) continue;
  sec.classList.remove('ade-vista--pronto');
  montar(sec);
}

// Las pestañas de dentro de cada pantalla (Hoy/Calendario/Ideas..., y las de
// Cuentas) van todas por el mismo sitio: es el componente `Secciones` de la app.
document.addEventListener('click', e => {
  const b = e.target.closest('.set-nav .set-tab');
  if (!b) return;
  const nav = b.closest('.set-nav');
  const hoja = nav.parentElement.querySelector('.set-hoja');
  if (!hoja) return;
  $$('.set-tab', nav).forEach(x => delete x.dataset.on);
  b.dataset.on = 'true';
  $$('.ade-sec', hoja).forEach(s => { s.hidden = s.dataset.sec !== b.dataset.sec; });
});
