/* ============================================================================
   Adeorq · demo/lateral.js
   LA FRANJA DE LA DERECHA Y SU PANEL.

   En el programa la franja esta SIEMPRE, y cada uno de sus tres iconos abre una
   cara del panel de al lado: las skills con el gasto, la actividad de lo que
   pasa por detras de la terminal que tienes delante, y los archivos del
   proyecto. El cuarto, separado por una raya, no abre nada aqui: mete la web en
   un panel del mosaico.

   En la maqueta esto era un boton con «Skills · Uso» escrito de lado que no
   hacia nada al pulsarlo. Ahora abre, cierra y alterna igual que alli: se
   vuelve a pulsar el mismo icono y se cierra, que es por lo que la app no tiene
   boton de cerrar.

   Estructura y clases de src/components/PanelDerecho.tsx y SkillsPanel.tsx.
   ========================================================================= */

const $  = (s, d = document) => d.querySelector(s);
const $$ = (s, d = document) => [...d.querySelectorAll(s)];
const avisar = t => (window.adeAvisar ? window.adeAvisar(t) : undefined);
const ico = n => `<svg class="ade-i"><use href="iconos.svg#i-${n}"/></svg>`;

const franja = $('#ade-franja');
const panel = $('#ade-lateral');
const titulo = $('#ade-lateral-tit');
const cuerpo = $('#ade-lateral-cuerpo');

if (franja && panel) {

/* Las skills de Munir, con su invocacion y lo que hacen. Son las de verdad:
   estan en ~/.claude/skills y salen en su panel todos los dias. */
const SKILLS = [
  ['/fin', 'Cierra la sesión: resumen, memoria al día y commits antes de compactar.'],
  ['/loop', 'Repite una tarea a intervalos hasta que le digas basta.'],
  ['/frontlaxweb', 'Parallax y scroll premium, con el dial de movimiento de la casa.'],
  ['/webindex', 'Mira si una web se encuentra: HTML servido, Core Web Vitals y meta.'],
  ['/galsas', 'Audita las licencias antes de cobrar por nada.'],
  ['/audit-this-project', 'El prompt de auditoría de seguridad que lleva cada repo público.'],
  ['/animar-scroll', 'La versión pública y ligera de los efectos al scroll.'],
];

const ACTIVIDAD = [
  ['skill', '/fin', 'hace 2 min', 'Cerró la sesión y dejó sus commits'],
  ['mcp', 'playwright · browser_snapshot', 'hace 4 min', 'Leyó el árbol de la página'],
  ['tool', 'Edit', 'hace 4 min', 'web/demo/piezas.css · 14 líneas'],
  ['modelo', 'Opus 5 · xhigh', 'hace 5 min', '8.712 tokens · 786k de caché'],
  ['tool', 'Bash', 'hace 6 min', 'node scripts/extraer-marcas.mjs'],
  ['mcp', 'adeorq · get_active_panes', 'hace 9 min', '4 terminales, 1 esperando'],
];

const ARCHIVOS = [
  ['carpeta', 'src', ''],
  ['carpeta', 'src/components', ''],
  ['archivo', 'ProviderMark.tsx', '6,1 kB'],
  ['archivo', 'TerminalPane.tsx', '48,3 kB'],
  ['archivo', 'Sidebar.tsx', '112 kB'],
  ['archivo', 'App.tsx', '198 kB'],
  ['archivo', 'App.css', '412 kB'],
  ['carpeta', 'src-tauri', ''],
  ['archivo', 'pty.rs', '31,7 kB'],
  ['archivo', 'sessions.rs', '44,2 kB'],
];

const CARAS = {
  skills: {
    titulo: 'Skills · Uso',
    icono: 'chispa',
    html: () => `
      <p class="skills-hint">Arrástralo sobre una terminal para pegarlo, o púlsalo para mandarlo a la que tengas delante.</p>
      <input class="finder" id="lat-q" placeholder="Buscar skill">
      <div class="skills-list" id="lat-skills">
        ${SKILLS.map(([n, d]) => `
          <div class="skill" draggable="true" title="${n}">
            <span class="skill-name">${n}</span>
            <span class="skill-desc">${d}</span>
          </div>`).join('')}
      </div>
      <div class="ade-lat-uso">
        <b>Uso de la semana</b>
        <span class="ade-lat-barra"><i style="width:62%"></i></span>
        <span class="ade-lat-pie">62 % de la cuota · se renueva el lunes a las 9:00</span>
      </div>`,
  },
  actividad: {
    titulo: 'Actividad',
    icono: 'rayo',
    html: () => `
      <p class="skills-hint">Lo que pasa por detrás de la terminal que tienes delante.</p>
      <div class="ade-lat-lista">
        ${ACTIVIDAD.map(([tipo, qué, cuándo, detalle]) => `
          <div class="ade-lat-fila" data-tipo="${tipo}">
            <span class="ade-lat-tipo">${tipo}</span>
            <span class="ade-lat-txt"><b>${qué}</b><i>${detalle}</i></span>
            <span class="ade-lat-cuando">${cuándo}</span>
          </div>`).join('')}
      </div>`,
  },
  archivos: {
    titulo: 'Archivos',
    icono: 'carpeta',
    html: () => `
      <p class="skills-hint">La carpeta del proyecto que tienes delante. Púlsalo y se abre en un panel.</p>
      <div class="ade-lat-lista">
        ${ARCHIVOS.map(([tipo, nombre, peso]) => `
          <button type="button" class="ade-lat-arch" data-tipo="${tipo}">
            ${ico(tipo === 'carpeta' ? 'carpeta' : 'archivo')}
            <span>${nombre}</span>
            ${peso ? `<em>${peso}</em>` : ''}
          </button>`).join('')}
      </div>`,
  },
};

let abierta = '';

function abrir(cara) {
  // Volver a pulsar el mismo icono cierra: por eso la app no tiene botón de
  // cerrar, serían dos botones para lo mismo.
  abierta = abierta === cara ? '' : cara;
  $$('.franja-btn[data-cara]', franja).forEach(b => {
    if (b.dataset.cara === abierta) b.dataset.on = 'true';
    else delete b.dataset.on;
  });
  panel.hidden = !abierta;
  if (!abierta) return;
  const c = CARAS[abierta];
  titulo.innerHTML = `${ico(c.icono)} ${c.titulo}`;
  cuerpo.innerHTML = c.html();

  if (abierta === 'skills') {
    $('#lat-q', cuerpo).addEventListener('input', e => {
      const q = e.currentTarget.value.trim().toLowerCase();
      $$('.skill', cuerpo).forEach(s => { s.hidden = !!q && !s.textContent.toLowerCase().includes(q); });
    });
    $$('.skill', cuerpo).forEach(s => s.addEventListener('click', () => {
      avisar(`En el programa esto escribe ${s.querySelector('.skill-name').textContent} en la terminal que tengas delante.`);
    }));
  }
  if (abierta === 'archivos') {
    $$('.ade-lat-arch', cuerpo).forEach(a => a.addEventListener('click', () => {
      avisar('Se abriría en un panel del mosaico, al lado de las terminales.');
    }));
  }
}

franja.addEventListener('click', e => {
  const b = e.target.closest('.franja-btn[data-cara]');
  if (b) abrir(b.dataset.cara);
});

$('#ade-franja-web')?.addEventListener('click', () => {
  avisar('Mete la web de tu proyecto en un panel del mosaico, con su localhost de verdad.');
});

}

/* ---------------------------------------------------------------------------
   LOS TRES BOTONES DE LA VENTANA
   Estaban dibujados y no hacian nada. Minimizar y cerrar no se pueden imitar en
   una pagina sin mentir, asi que lo dicen; maximizar SI se puede: quita el
   margen y las esquinas, que es lo que se ve al maximizar de verdad.
   --------------------------------------------------------------------------- */

const ventana = $('#ade');
const botonesVentana = $$('.ade__barra-botones button');
if (ventana && botonesVentana.length === 3) {
  const [min, max, cerrar] = botonesVentana;
  min.title = 'Minimizar';
  max.title = 'Maximizar';
  cerrar.title = 'Cerrar';

  min.addEventListener('click', () => {
    ventana.dataset.encogida = 'si';
    setTimeout(() => delete ventana.dataset.encogida, 420);
    avisar('En el programa se va a la bandeja: las terminales siguen vivas.');
  });
  max.addEventListener('click', () => {
    if (ventana.dataset.maximizada) delete ventana.dataset.maximizada;
    else ventana.dataset.maximizada = 'si';
  });
  cerrar.addEventListener('click', () => {
    avisar('Cerrar la ventana mata a los agentes que estén trabajando: el programa lo pregunta antes.');
  });
}

/* ---------------------------------------------------------------------------
   EL REPRODUCTOR
   La pausa ya funcionaba; anterior y siguiente no hacian nada.
   --------------------------------------------------------------------------- */

const SUENA = [
  ['Bumpy Ride', 'Mohombi'],
  ['Ojos así', 'Shakira'],
  ['Suavemente', 'Elvis Crespo'],
  ['La Rebelión', 'Joe Arroyo'],
];
let canción = 0;

function pinta() {
  const t = $('.ade-np-title');
  const fila = $('#ade-np .ade-np-text');
  if (!t || !fila) return;
  const [nombre, artista] = SUENA[canción];
  fila.innerHTML = `<span class="ade-np-title">${nombre}</span> · ${artista}`;
}

$$('#ade-np .ade-np-btn').forEach(b => {
  const q = b.getAttribute('title');
  if (q !== 'Anterior' && q !== 'Siguiente') return;
  b.addEventListener('click', () => {
    canción = (canción + (q === 'Siguiente' ? 1 : SUENA.length - 1)) % SUENA.length;
    pinta();
    // Al cambiar de canción vuelve a sonar, aunque estuviera en pausa.
    const fila = $('#ade-np');
    delete fila.dataset.parado;
    const play = $('#ade-np-play');
    if (play) play.textContent = '॥';
  });
});
