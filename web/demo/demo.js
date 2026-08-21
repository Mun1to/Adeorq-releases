/* ============================================================================
   Adeorq · demo/demo.js
   LO QUE MUEVE LA MAQUETA.

   La maqueta no es una foto: se pulsa. Cambia de vista, cambia de tema, el riel
   filtra, los paneles se cierran y se maximizan, y el Capataz responde. Todo lo
   que se puede imitar sin mentir, funciona; lo que no (abrir una terminal de
   verdad), lo dice en vez de fingirlo.

   Los datos y los colores salen de la app: `hueOf` es la funcion literal de
   src/lib/colors.ts, y por eso los proyectos de la maqueta salen del mismo azul
   que en el programa en vez de los siete colores inventados que habia antes.
   ========================================================================= */

const $  = (s, d = document) => d.querySelector(s);
const $$ = (s, d = document) => [...d.querySelectorAll(s)];

const ade = $('#ade');
if (!ade) throw new Error('demo: falta la maqueta');

/* --------------------------------------------------------------------------
   1. LOS COLORES DE PROYECTO
   Copia literal de src/lib/colors.ts. El tono se queda entre 186 y 268 (de cian
   a violeta) a proposito: cada proyecto se reconoce por su matiz, pero el panel
   entero sigue leyendose como un sistema azul y no como un arcoiris.
   -------------------------------------------------------------------------- */

const HUE_MIN = 186, HUE_MAX = 268;
function hueOf(nombre) {
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) % 1000;
  const hue = HUE_MIN + (h / 1000) * (HUE_MAX - HUE_MIN);
  return `hsl(${hue.toFixed(0)} 82% 66%)`;
}

/* --------------------------------------------------------------------------
   2. LOS DATOS
   Los proyectos y las sesiones de la captura real del programa, para que lo que
   se ve sea lo que se ve al abrirlo.
   -------------------------------------------------------------------------- */

/* ⚠ SOLO ADEORQ (Munir, 2026-08-20).
   Aqui estaban sus catorce proyectos con su logo, sacados de una captura de su
   Cabina. Fuera: esta maqueta se publica en la web, y ahi no pintan nada ni sus
   proyectos privados ni el de un cliente. Un solo proyecto con varias sesiones
   dentro cuenta lo mismo —que se trabaja con varios agentes a la vez— sin
   enseñar en que anda metido.

   Las carpetas de dentro son las del propio repo, que es publico. */
const PROYECTOS = [
  { n: 'Adeorq',    s: 4, e: 1, vivo: true, logo: '../assets/adeorq.svg' },
  { n: 'src-tauri', s: 2, e: 0, vivo: true },
  { n: 'web',       s: 2, e: 0 },
  { n: 'docs',      s: 1, e: 0 },
];

const PANELES = [
  {
    proy: 'Adeorq', titulo: 'Adeorq: sesiones y terminales',
    cli: 'claude', modelo: 'Opus 5 xhigh', ctx: 34, estado: 'done', tocados: 2,
    lineas: [
      ['pregunta', 'échale un ojo a la barra de arriba, que algo no me cuadra'],
      ['dice', 'Cuenta nueve pestañas y el corte de la barra sigue puesto para ocho.'],
      ['sub', 'Escrita de corrida la fila entera necesita 1.968 px, medido.'],
      ['sub', 'El corte está en 1.700, así que entre esos dos «Cerrar todas» se sale sin recortarse.'],
      ['ruta', 'src/App.css · 1 línea'],
      ['meta', 'Worked for 2m 31s · ↓ 8.7k tokens'],
      ['pregunta', '¿puedes repasar el contraste de la landing?'],
      ['dice', 'He mirado las tres capas que se pisaban.'],
      ['sub', 'El texto sobre la foto no llegaba al mínimo legible: 3,1:1 medido.'],
      ['sub', 'Arreglado con una sombra, sin tocar el tono del tema.'],
      ['ruta', 'web/styles/hero.css · 4 líneas'],
      ['meta', 'Worked for 4m 14s'],
      ['pregunta', 'y el aviso de sesión cara, ¿por qué no saltaba?'],
      ['dice', 'Iba por porcentaje, y con la ventana de un millón de tokens no habría saltado hasta los 600.000.'],
      ['sub', 'Ahora avisa a los 150.000, que es donde empieza a doler.'],
      ['ruta', 'src/components/TerminalPane.tsx · 2 líneas'],
      ['meta', 'Worked for 1m 08s · ↓ 12.4k tokens'],
      ['modo', 'auto mode on (shift+tab to cycle) · ← for agents'],
    ],
  },
  {
    proy: 'src-tauri', titulo: 'pnpm tauri dev',
    cli: 'shell', modelo: 'PowerShell', ctx: 8, estado: 'vivo',
    lineas: [
      ['dim', 'PS C:\\proyectos\\Adeorq> git pull --ff-only'],
      ['dim', 'Updating 7e41e57..36e68f2'],
      ['dim', 'Fast-forward'],
      ['dim', ' web/demo/demo.js      | 214 ++++++++++++'],
      ['dim', ' web/demo/pantallas.js | 331 +++++++++++++++++'],
      ['dim', ' 2 files changed, 545 insertions(+)'],
      ['dim', 'PS C:\\proyectos\\Adeorq> pnpm install'],
      ['ok', 'Already up to date · done in 1.4s'],
      ['dim', 'PS C:\\proyectos\\Adeorq> pnpm tauri dev'],
      ['dim', '   Compiling adeorq v0.9.129 (C:\\proyectos\\Adeorq\\src-tauri)'],
      ['dim', '   Compiling portable-pty v0.9.0'],
      ['dim', '    Finished dev profile [unoptimized + debuginfo] in 41.62s'],
      ['ok', '     Running `C:\\ct\\debug\\adeorq.exe`'],
      ['dim', 'VITE v7.3.6  ready in 412 ms'],
      ['dim', '  ➜  Local:   http://localhost:1420/'],
      ['ok', 'app abierta en 1,2 s · motor ConPTY listo · 4 terminales'],
      ['dim', 'PS C:\\proyectos\\Adeorq> cargo check'],
      ['dim', '    Checking adeorq v0.9.129'],
      ['warn', 'warning: unused variable: `ancho`'],
      ['sub', '  --> src/pty.rs:412:9'],
      ['ok', '    Finished dev profile in 3.41s'],
      ['dim', 'PS C:\\proyectos\\Adeorq> git status --short'],
      ['dim', ' M web/demo/demo.js'],
      ['dim', ' M web/demo/piezas.css'],
    ],
  },
  {
    proy: 'web', titulo: 'La web · Codex',
    cli: 'codex', modelo: 'high', ctx: 52, estado: 'espera', tocados: 5,
    lineas: [
      ['dim', '>_ codex --cd C:\\proyectos\\Adeorq\\web'],
      ['dim', 'OpenAI Codex · gpt-5.6-terra · effort high'],
      ['dim', 'workdir: C:\\proyectos\\Adeorq\\web'],
      ['dim', "It asks whether you trust this folder. It's yours, so option 1 is the usual answer:"],
      ['opciones', ['1 · Yes, continue', '2 · No, quit']],
      ['dim', 'Do you trust the contents of this directory? Working with untrusted contents comes with higher risk of prompt injection. Trusting the directory allows project-local config, hooks, and exec policies to load.'],
      ['dim', '> You are in C:\\proyectos\\Adeorq\\web'],
      ['dim', '  1. Yes, continue'],
      ['dim', '  2. No, quit'],
      ['dim', 'Press enter to continue'],
      ['dice', 'Build verificado. Ábrela en http://localhost:5173/ para verlo.'],
      ['meta', 'Worked for 4m 14s'],
      ['pregunta', 'dale una vuelta al encuadre de la portada'],
      ['dice', 'Hecho: el logo respira y el titular ya no se parte en dos.'],
      ['ask', '¿Lo dejo así o pruebo con la foto a sangre?'],
    ],
  },
  {
    proy: 'src-tauri', titulo: 'cargo test · el motor',
    cli: 'claude', modelo: 'Sonnet 5', ctx: 21, estado: 'vivo',
    lineas: [
      ['pregunta', 'pásale las pruebas al motor antes de que lo toque nadie más'],
      ['dice', 'Voy. Lanzo la tanda entera y te digo qué se cae.'],
      ['dim', 'PS C:\\proyectos\\Adeorq\\src-tauri> cargo test'],
      ['dim', '   Compiling adeorq v0.9.129'],
      ['dim', '    Finished test profile in 12.08s'],
      ['dim', '     Running unittests src/lib.rs'],
      ['dim', 'running 34 tests'],
      ['ok', 'test pty::abre_y_cierra_limpio ... ok'],
      ['ok', 'test pty::sobrevive_al_redimensionar ... ok'],
      ['ok', 'test sessions::titulo_del_transcript ... ok'],
      ['ok', 'test sessions::agrupa_por_cwd ... ok'],
      ['err', 'test sessions::vivas_por_pid ... FAILED'],
      ['sub', 'assertion `left == right` failed'],
      ['sub', '  left: 4'],
      ['sub', ' right: 5'],
      ['dim', 'test pty::mata_a_los_hijos ... '],
      ['meta', '31 pasados · 1 fallando · 2 corriendo'],
      ['dice', 'El fallo es de la prueba, no del motor: cuenta cinco sesiones y una es un daemon de fondo.'],
    ],
  },
];
/* --------------------------------------------------------------------------
   3. EL RIEL
   -------------------------------------------------------------------------- */

/* Las iniciales del avatar: la funcion literal de ProjectAvatar.tsx. Parte por
   guiones, puntos y mayusculas interiores, y por eso "src-tauri" sale como "ST"
   y no como "Sr". Escrita a ojo daba otra cosa. */
function initials(name) {
  const words = name
    .replace(/[_\-.·]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) {
    const w = words[0];
    return (w[0] + (w[1] ?? '')).replace(/^./, c => c.toUpperCase());
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

const riel = $('#ade-proys');
riel.className = 'projects';

for (const p of PROYECTOS) {
  const li = document.createElement('li');
  li.className = 'project';
  li.style.setProperty('--c', hueOf(p.n));
  if (p.vivo) li.dataset.live = 'true';
  li.dataset.proyecto = p.n;
  // La estructura es la de Sidebar.tsx: la fila lleva el boton, y el boton el
  // marco del logo con su `.pavatar` dentro. `data-plate="tint"` es lo que usa
  // la app cuando el proyecto no tiene logo propio: su color, apagado.
  li.innerHTML = `
    <button type="button" class="project-main">
      <span class="project-mark">
        <span class="pavatar" data-plate="${p.logo ? 'none' : 'tint'}"${
          p.logo && p.logo.endsWith('.png') ? ' data-foto="si"' : ''
        } style="--c:${hueOf(p.n)}">${
          p.logo ? `<img src="${p.logo}" alt="">` : initials(p.n)
        }</span>
        ${p.vivo ? '<span class="mark-live" title="Tiene una sesión abierta ahora mismo"></span>' : ''}
      </span>
      <span class="project-name">${p.n}</span>
      <span class="project-badges">
        ${p.s ? `<span class="badge badge-count">${p.s}</span>` : ''}
        ${p.e ? `<span class="badge badge-wait">${p.e}</span>` : ''}
      </span>
    </button>`;
  riel.appendChild(li);
}

// El buscador filtra de verdad: es lo que hace el de la app.
const buscador = $('.finder', $('#ade-rail'));
buscador?.addEventListener('input', () => {
  const q = buscador.value.trim().toLowerCase();
  $$('.project', riel).forEach(li => {
    li.hidden = !!q && !li.dataset.proyecto.toLowerCase().includes(q);
  });
});

// Pulsar un proyecto lo marca como abierto, como en el riel de verdad.
riel.addEventListener('click', e => {
  const li = e.target.closest('.project');
  if (!li) return;
  $$('.project', riel).forEach(x => delete x.dataset.open);
  li.dataset.open = 'true';
  avisar(`Abrirías ${li.dataset.proyecto} con sus sesiones. Aquí es una maqueta.`);
});

/* --------------------------------------------------------------------------
   4. LA REJILLA DE TERMINALES
   -------------------------------------------------------------------------- */

/* El color de cada CLI. La marca la pone marcas.svg (dibujada en la app); esto
   es solo el tono con el que se pinta, para que se distingan de lejos. */
const COLOR_CLI = {
  claude: '#d97757',
  codex:  '#b9c7e0',
  gemini: '#4d9fff',
  shell:  '#93a4c2',
};

const grid = $('#ade-grid');
grid.className = 'ade-grid';

function pintarPanel(p, i) {
  const el = document.createElement('article');
  el.className = 'pane';
  el.dataset.estado = p.estado;
  el.dataset.cli = p.cli;
  el.style.setProperty('--c', hueOf(p.proy));
  el.style.setProperty('--cli', COLOR_CLI[p.cli] || 'var(--muted)');
  if (p.estado === 'done') el.dataset.done = 'true';

  const cuerpo = p.lineas.map(([tipo, txt]) => {
    // Los botones de opcion que saca un CLI cuando te pregunta algo: son de lo
    // mas reconocible de trabajar asi, y en la maqueta se pueden pulsar.
    if (tipo === 'opciones') {
      return '<div class="t-ops">' + txt.map(o =>
        `<button type="button" class="t-op">${o}</button>`).join('') + '</div>';
    }
    const t = String(txt)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (tipo === 'pregunta') return `<div class="t-tu">› ${t}</div>`;
    if (tipo === 'dice')     return `<div class="t-di"><i class="t-punto"></i>${t}</div>`;
    if (tipo === 'cont')     return `<div class="t-di t-cont">${t}</div>`;
    if (tipo === 'sub')      return `<div class="t-sub">└ ${t}</div>`;
    if (tipo === 'ruta')     return `<div class="t-ruta">└ ${t}</div>`;
    if (tipo === 'meta')     return `<div class="t-meta">✳ ${t}</div>`;
    if (tipo === 'ok')       return `<div class="t-ok">${t}</div>`;
    if (tipo === 'ask')      return `<div class="t-ask">${t}</div>`;
    if (tipo === 'warn')     return `<div class="t-warn">${t}</div>`;
    if (tipo === 'err')      return `<div class="t-err">${t}</div>`;
    if (tipo === 'modo')     return `<div class="t-modo">&#9654;&#9654; <b>auto mode on</b> ${t.replace('auto mode on ', '')}</div>`;
    return `<div class="t-dim">${t}</div>`;
  }).join('');

  // La cabecera es la de TerminalPane.tsx: tres zonas (.ph-id con quien es,
  // .ph-meta con el contexto y el modelo, .ph-acts con los botones), y los SIETE
  // botones que tiene de verdad. Antes habia cuatro elegidos a ojo.
  el.innerHTML = `
    <header class="pane-head">
      <span class="ph-id">
        <svg class="prov-mark" aria-hidden="true"><use href="#m-${p.cli}"/></svg>
        <span class="pane-chip">${p.proy.replace(/ \(raíz\)$/, '')}</span>
        <span class="pane-name">${p.titulo}</span>
      </span>
      <span class="ph-meta">
        <span class="pane-ctx" title="Contexto usado">
          <span class="ade-ctx-barra"><i style="width:${p.ctx}%"></i></span>
          <span class="ade-ctx-n">${p.ctx}%</span>
        </span>
        <span class="pane-effort">${p.modelo}</span>
      </span>
      <span class="ph-acts">
        <button type="button" class="pane-btn" data-acc="git" title="Lo que ha tocado en git">
          <svg class="ade-i"><use href="iconos.svg#i-rama"/></svg>${p.tocados ? `<span class="shadow-badge">${p.tocados}</span>` : ''}
        </button>
        <button type="button" class="pane-btn" data-acc="ver" title="Tapar esta terminal (para emitir)"><svg class="ade-i"><use href="iconos.svg#i-ojo"/></svg></button>
        <button type="button" class="pane-btn" data-acc="min" title="Minimizar: baja a la tira de abajo y sigue trabajando"><svg class="ade-i"><use href="iconos.svg#i-minimizar"/></svg></button>
        <button type="button" class="pane-btn" data-acc="sacar" title="Sacar a su propia ventana"><svg class="ade-i"><use href="iconos.svg#i-sacar"/></svg></button>
        <button type="button" class="pane-btn" data-acc="max" title="Maximizar"><svg class="ade-i"><use href="iconos.svg#i-maximizar"/></svg></button>
        <button type="button" class="pane-btn pane-bin" data-acc="tirar" title="Cerrar la sesión"><svg class="ade-i"><use href="iconos.svg#i-papelera"/></svg></button>
        <button type="button" class="pane-close" data-acc="cerrar" title="Cerrar el panel"><svg class="ade-i"><use href="iconos.svg#i-cerrar"/></svg></button>
      </span>
    </header>
    <div class="ade-pane-cuerpo">${cuerpo}</div>
    <footer class="ade-pane-pie">
      <span class="ade-pane-prompt">&rsaquo;</span>
      <input class="ade-pane-input" type="text" aria-label="Escribe un comando o un prompt"
             placeholder="${p.cli === 'shell' ? 'Escribe un comando' : 'Escribe un comando o un prompt'}">
      ${p.estado === 'done' ? '<span class="ade-pane-done">✓ Turno terminado</span>' : ''}
      ${p.estado === 'espera' ? '<span class="ade-pane-espera">Te espera</span>' : ''}
    </footer>`;
  grid.appendChild(el);
  // Una terminal se mira por el final, no por el principio: en la app lo que
  // ves al llegar es lo ultimo que escribio el agente.
  //
  // Tres veces y no una: al pintar la altura es la de la fuente de reserva, y
  // cuando llega la de verdad el texto cambia de alto y el scroll se queda a
  // media linea. `fonts.ready` es quien lo sabe; el rAF es el cinturon para el
  // navegador que no lo implemente.
  const cuerpoEl = el.querySelector('.ade-pane-cuerpo');
  if (cuerpoEl) {
    const alFinal = () => { cuerpoEl.scrollTop = cuerpoEl.scrollHeight; };
    alFinal();
    requestAnimationFrame(alFinal);
    document.fonts?.ready.then(alFinal);
  }
}

PANELES.forEach(pintarPanel);

grid.addEventListener('click', e => {
  // Los botones de opcion que saca un CLI: al pulsarlos se quedan marcados,
  // que es lo que pasa en la terminal de verdad.
  const op = e.target.closest('.t-op');
  if (op) {
    [...op.parentElement.children].forEach(x => delete x.dataset.elegida);
    op.dataset.elegida = 'si';
    avisar('En la app esto se lo manda al CLI tal cual, sin traducir nada.');
    return;
  }

  const b = e.target.closest('.pane-btn, .pane-close');
  if (!b) return;
  const pane = b.closest('.pane');
  const acc = b.dataset.acc;
  if (acc === 'cerrar' || acc === 'tirar') {
    pane.dataset.yendose = 'true';
    setTimeout(() => { pane.remove(); contarPie(); }, 220);
    avisar(acc === 'tirar' ? 'La sesión se cerraría del todo.' : 'El panel se cierra; la sesión sigue viva.');
    return;
  }
  if (acc === 'max') {
    // Si ESTE panel ya estaba a solas, el boton lo devuelve a la rejilla; si no,
    // lo deja a solas. Se mira el propio elemento y no un indice guardado: antes
    // se comparaba `grid.dataset.solo` con un indice que aun no existia, los dos
    // salian `undefined`, y el primer clic se leia como «ya estaba maximizado».
    const yaSolo = grid.dataset.solo === 'si' && !pane.hidden &&
                   $$('.pane', grid).filter(x => !x.hidden).length === 1;
    if (yaSolo) {
      delete grid.dataset.solo;
      $$('.pane', grid).forEach(x => { x.hidden = false; });
    } else {
      grid.dataset.solo = 'si';
      $$('.pane', grid).forEach(x => { x.hidden = x !== pane; });
    }
    return;
  }
  if (acc === 'git')   { avisar('Enseñaría los archivos que ha tocado esta sesión.'); return; }
  if (acc === 'min')   { avisar('Bajaría a la tira de abajo, y el agente sigue trabajando.'); return; }
  if (acc === 'sacar') { avisar('Saldría a su propia ventana, sin cortar la sesión.'); return; }
  if (acc === 'ver') {
    pane.dataset.oculto = pane.dataset.oculto ? '' : 'true';
    if (!pane.dataset.oculto) delete pane.dataset.oculto;
  }
});

function contarPie() {
  const n = $$('.pane', grid).length;
  $('#ade-pie-txt').textContent = `${n} terminal${n === 1 ? '' : 'es'} ConPTY activa${n === 1 ? '' : 's'} · 0 errores`;
}

/* --------------------------------------------------------------------------
   5. LAS VISTAS
   -------------------------------------------------------------------------- */

function irA(vista) {
  ade.dataset.vista = vista;
  $$('#ade-tabs .tab').forEach(t => {
    if (t.dataset.vista === vista) t.dataset.active = 'true';
    else delete t.dataset.active;
  });
  $$('.ade-vista').forEach(s => { s.hidden = s.dataset.vista !== vista; });
  // El riel solo existe en la Cabina, igual que en la app.
  $('#ade-rail').hidden = vista !== 'cabina';
  const sel = $('#mando-vista');
  if (sel && sel.value !== vista) sel.value = vista;
}

$('#ade-tabs').addEventListener('click', e => {
  const t = e.target.closest('.tab');
  if (t) irA(t.dataset.vista);
});

$$('[data-va]').forEach(b => b.addEventListener('click', () => irA(b.dataset.va)));

/* --------------------------------------------------------------------------
   6. LAS SECCIONES DEL PANEL
   -------------------------------------------------------------------------- */

$('#ade-panel-nav')?.addEventListener('click', e => {
  const b = e.target.closest('.set-tab');
  if (!b) return;
  $$('#ade-panel-nav .set-tab').forEach(x => delete x.dataset.on);
  b.dataset.on = 'true';
  $$('.ade-sec').forEach(s => { s.hidden = s.dataset.sec !== b.dataset.sec; });
});

// Proyectos calientes, con los colores de la app.
const hot = $('#ade-hot');
if (hot) {
  [['Adeorq', 15], ['src-tauri', 10], ['web', 6], ['docs', 4]]
    .forEach(([n, c]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hot-item';
      b.innerHTML = `<span class="ws-dot" style="background:${hueOf(n)}"></span>
                     <span class="hot-name">${n}</span><span class="count">${c}</span>`;
      b.addEventListener('click', () => { irA('cabina'); avisar(`Irías a ${n}.`); });
      hot.appendChild(b);
    });
}

// El saludo sabe la hora, como el de la app.
const saludo = $('#ade-saludo');
if (saludo) {
  const h = new Date().getHours();
  const s = h < 6 ? 'Aún en pie' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  saludo.textContent = `${s}, Munito.`;
}

/* --------------------------------------------------------------------------
   7. LOS TEMAS
   Los 32 de la app. La miniatura de cada uno se pinta con SUS colores gracias a
   `data-tema-prev`, que es para lo que existe ese atributo en App.css.
   -------------------------------------------------------------------------- */

const TEMAS = [
  ['azul', 'Azul'], ['grafito', 'Grafito'], ['violeta', 'Violeta'], ['verde', 'Verde'],
  ['carmin', 'Carmín'], ['ambar', 'Ámbar'], ['oceano', 'Océano'], ['neon', 'Neón'],
  ['nord', 'Nord'], ['cyberpunk', 'Cyberpunk'], ['dracula', 'Drácula'], ['tokyo', 'Tokyo'],
  ['esmeralda', 'Esmeralda'], ['ocaso', 'Ocaso'], ['matrix', 'Matrix'], ['synthwave', 'Synthwave'],
  ['solarized', 'Solarized'], ['rose', 'Rosé'], ['gruvbox', 'Gruvbox'], ['onedark', 'One Dark'],
  ['catppuccin', 'Catppuccin'], ['volcano', 'Volcano'], ['turquesa', 'Turquesa'], ['negro', 'Negro'],
  ['tinta', 'Tinta'], ['ciruela', 'Ciruela'], ['arena', 'Arena'], ['kanagawa', 'Kanagawa'],
  ['everforest', 'Everforest'], ['monokai', 'Monokai'], ['papel', 'Papel'], ['claro', 'Claro'],
];

function ponTema(id) {
  ade.dataset.tema = id;
  $$('.ade-tema').forEach(b => {
    if (b.dataset.temaPrev === id) b.dataset.on = 'true';
    else delete b.dataset.on;
  });
  const sel = $('#mando-tema');
  if (sel && sel.value !== id) sel.value = id;
}

const cajaTemas = $('#ade-temas');
const mandoTema = $('#mando-tema');
for (const [id, nom] of TEMAS) {
  if (cajaTemas) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ade-tema';
    b.dataset.temaPrev = id;
    b.setAttribute('data-tema-prev', id);
    b.title = nom;
    b.innerHTML = `<span class="ade-tema-mini">
        <i class="ade-tema-fondo"></i><i class="ade-tema-panel"></i><i class="ade-tema-acento"></i>
      </span><span class="ade-tema-nom">${nom}</span>`;
    b.addEventListener('click', () => ponTema(id));
    cajaTemas.appendChild(b);
  }
  if (mandoTema) {
    const o = document.createElement('option');
    o.value = id; o.textContent = nom;
    mandoTema.appendChild(o);
  }
}
mandoTema?.addEventListener('change', () => ponTema(mandoTema.value));
$('#mando-vista')?.addEventListener('change', e => irA(e.target.value));
$('#mando-fondo')?.addEventListener('change', e => {
  $('#ade-fondo').hidden = !e.target.checked;
});

/* --------------------------------------------------------------------------
   8. LO QUE NO SE PUEDE IMITAR, LO DICE
   -------------------------------------------------------------------------- */

let reloj = null;
/* El avisador es de la maqueta entera, asi que se comparte: terminal.js lo usa
   para contar lo que pasaria en la app de verdad. */
window.adeAvisar = avisar;
function avisar(texto) {
  let t = $('#ade-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'ade-toast';
    t.className = 'ade-toast';
    ade.appendChild(t);
  }
  t.textContent = texto;
  t.dataset.on = 'true';
  clearTimeout(reloj);
  reloj = setTimeout(() => delete t.dataset.on, 2600);
}

$('#ade-planear')?.addEventListener('click', () => {
  const q = $('#ade-capataz').value.trim();
  avisar(q ? 'El Capataz propondría el tablero y esperaría tu OK.'
           : 'Escribe qué quieres montar y el Capataz propone el plan.');
});
$('#ade-encargo')?.addEventListener('click', () => avisar('Aquí se escribe el encargo para la cuadrilla.'));
$('#ade-emision')?.addEventListener('click', e => {
  const on = e.currentTarget.dataset.on === 'true';
  if (on) delete e.currentTarget.dataset.on; else e.currentTarget.dataset.on = 'true';
  avisar(on ? 'Emisión apagada: vuelven a verse las rutas.' : 'Emisión encendida: se tapan rutas y nombres.');
});
$('#ade-objetivos')?.addEventListener('click', () => avisar('Los objetivos de hoy, siempre a la vista.'));
$('#ade-layout')?.addEventListener('click', () => avisar('Aquí se elige cómo se reparten los paneles en la Cabina.'));
$('#ade-pulso')?.addEventListener('click', () => avisar('CPU, memoria y agentes de Adeorq, no de todo el equipo.'));
$('#ade-capataz-btn')?.addEventListener('click', () => { irA('panel'); avisar('El Capataz vive en el Panel. Ctrl+Mayús+A desde la Cabina.'); });

/* Los tres del final: en la app solo existen con la Cabina delante y mas de un
   panel abierto, y aqui igual. Una barra que cambia de forma cada vez que
   cierras algo mueve de sitio a todo lo que tiene a la derecha. */
$('#ade-min-todas')?.addEventListener('click', () => {
  const abiertos = $$('.pane', $('#ade-grid'));
  if (abiertos.length) { abiertos.forEach(p => window.adeApartadas?.apartar(p)); return; }
  const n = window.adeApartadas?.cuantas?.() || 0;
  for (let i = n - 1; i >= 0; i--) window.adeApartadas?.traer(i);
});
$('#ade-cerrar-todas')?.addEventListener('click', () => {
  avisar('En el programa pide confirmación: cerrar mata a los agentes que estén trabajando.');
});

/* --------------------------------------------------------------------------
   EL ORBE DEL ASISTENTE
   La geometria y el bucle son los de src/components/Orbe.tsx. Se anima a mano
   con requestAnimationFrame y no con CSS porque el satelite tiene que
   ESCONDERSE detras del planeta, y para eso hay que saber donde esta: con una
   animacion declarativa la posicion la conoce el navegador y no nosotros.
   -------------------------------------------------------------------------- */

(function orbe() {
  const punto = $('#ade-orbe-sat');
  const caja = $('#ade-orbe');
  if (!punto) return;

  const CX = 12, CY = 11.5, R_PLANETA = 5.4, RX = 10, RY = 4.1;
  const GIRO = (-22 * Math.PI) / 180;
  const VUELTA = { reposo: 7, escucha: 3.4, piensa: 1.1, listo: 2.2 };

  // Quien pide menos movimiento no lo pierde: se le va a la mitad de
  // velocidad. Este punto no es un adorno, es el estado del Asistente.
  const lento = matchMedia('(prefers-reduced-motion: reduce)').matches ? 2.5 : 1;
  let angulo = 0, antes = performance.now(), pedido = 0;

  const paso = ahora => {
    const dt = Math.min(ahora - antes, 250) / 1000;
    antes = ahora;
    const vuelta = VUELTA[caja?.dataset.estado] ?? VUELTA.reposo;
    angulo += (2 * Math.PI * dt) / (vuelta * lento);

    const c = Math.cos(angulo), s = Math.sin(angulo);
    const ex = RX * c, ey = RY * s;
    const x = CX + ex * Math.cos(GIRO) - ey * Math.sin(GIRO);
    const y = CY + ex * Math.sin(GIRO) + ey * Math.cos(GIRO);

    // Solo se esconde donde el planeta LO TAPA de verdad: pasar por detras
    // pero por fuera del disco se sigue viendo, que es lo que hace una luna.
    const detras = s < 0;
    const tapado = detras && Math.hypot(ex, ey) < R_PLANETA + 0.9;
    punto.setAttribute('cx', x.toFixed(2));
    punto.setAttribute('cy', y.toFixed(2));
    punto.style.opacity = tapado ? '0' : detras ? '0.45' : '1';
    pedido = requestAnimationFrame(paso);
  };
  pedido = requestAnimationFrame(paso);

  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(pedido);
    if (!document.hidden) { antes = performance.now(); pedido = requestAnimationFrame(paso); }
  });

  // Escribir en una terminal lo pone a escuchar, como en el programa.
  window.adeOrbe = e => { if (caja) caja.dataset.estado = e; };
})();
// La franja de la derecha y su panel viven en lateral.js.

// El reproductor: la pausa para las barritas, como en la app.
$('#ade-np-play')?.addEventListener('click', e => {
  const fila = $('#ade-np');
  const parado = fila.dataset.parado;
  if (parado) { delete fila.dataset.parado; e.currentTarget.textContent = '॥'; }
  else { fila.dataset.parado = 'true'; e.currentTarget.textContent = '▶'; }
});

/* --------------------------------------------------------------------------
   9. LA LUPA
   La maqueta mide 1920x1080 por dentro y se dibuja a la escala que quepa. Ver el
   porque en piezas.css: es lo que hace que enseñe lo mismo que la app en un
   monitor de verdad y no su version apretada.
   -------------------------------------------------------------------------- */

const marco = $('#ade-marco');
const ANCHO = 1920, ALTO = 1080;

function ajustarLupa() {
  if (!marco) return;
  // En modo desnudo (?desnuda=1) la maqueta se queda a 1920x1080 sin encoger:
  // de eso se encarga quien la mete en un iframe, que es comparar.html.
  if (document.documentElement.dataset.desnuda) { marco.style.height = ALTO + 'px'; return; }
  const disponible = marco.clientWidth;
  if (!disponible) return;
  const k = disponible / ANCHO;
  marco.style.setProperty('--lupa', k.toFixed(4));
  // El marco se queda con el alto que ocupa la maqueta ya encogida: si no, deja
  // un hueco de mil pixeles debajo.
  marco.style.height = Math.round(ALTO * k) + 'px';
}

if (marco) {
  ajustarLupa();
  new ResizeObserver(ajustarLupa).observe(marco);
  window.addEventListener('resize', ajustarLupa, { passive: true });
}

/* Lo que los demas modulos necesitan de aqui. Se comparte por `window` a
   proposito y no con imports: asi cada archivo se puede quitar sin romper al
   resto, que en una maqueta que crece es lo que interesa. */
window.adeIrA = irA;
window.adeHue = hueOf;
window.adePintarPanel = p => { pintarPanel(p); contarPie(); };
window.adeContarPie = contarPie;

irA('cabina');
ponTema('azul');
contarPie();
