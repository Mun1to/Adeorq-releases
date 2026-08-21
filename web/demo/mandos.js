/* ============================================================================
   Adeorq · demo/mandos.js
   LO QUE SE MANEJA CON LAS MANOS: la paleta de comandos, los modos del riel y
   abrir sesiones nuevas.

   Es la ultima capa de la maqueta y la que hace que se pueda TRASTEAR: Ctrl+K
   abre la paleta y lleva de una pantalla a otra, los tres botones del riel
   cambian como se ven los proyectos, y el + abre un panel mas en la Cabina.
   Todo de mentira por dentro; el gesto, el de la app.
   ========================================================================= */

const $  = (s, d = document) => d.querySelector(s);
const $$ = (s, d = document) => [...d.querySelectorAll(s)];
const avisar = t => (window.adeAvisar ? window.adeAvisar(t) : undefined);

const ade  = $('#ade');
const grid = $('#ade-grid');
const riel = $('#ade-proys');

/* ---------------------------------------------------------------------------
   1. LA PALETA DE COMANDOS (Ctrl+K)
   --------------------------------------------------------------------------- */

const ACCIONES = [
  { t: 'Ir al Panel',        k: 'Ctrl+1', hace: () => window.adeIrA('panel') },
  { t: 'Ir a la Cabina',     k: 'Ctrl+2', hace: () => window.adeIrA('cabina') },
  { t: 'Ir a la Agenda',     k: 'Ctrl+3', hace: () => window.adeIrA('agenda') },
  { t: 'Ir al Lienzo',       k: 'Ctrl+4', hace: () => window.adeIrA('lienzo') },
  { t: 'Ir a Cuentas',       k: 'Ctrl+5', hace: () => window.adeIrA('cuentas') },
  { t: 'Ir a Comandos',      k: 'Ctrl+6', hace: () => window.adeIrA('comandos') },
  { t: 'Ir a Ajustes',       k: 'Ctrl+7', hace: () => window.adeIrA('ajustes') },
  { t: 'Abrir una sesión nueva', k: 'Ctrl+N', hace: () => window.adeNuevoPanel() },
  { t: 'Cambiar el tema',    k: '',       hace: () => { window.adeIrA('ajustes'); avisar('Los 32 temas de la app, con sus colores de verdad.'); } },
  { t: 'Tapar rutas y nombres (emitir)', k: 'Ctrl+Mayús+E', hace: () => $('#ade-emision')?.click() },
];

const paleta = document.createElement('div');
paleta.className = 'ade-paleta';
paleta.hidden = true;
paleta.innerHTML = `
  <div class="ade-paleta-caja" role="dialog" aria-label="Comandos">
    <input class="ade-paleta-input" type="text" placeholder="Qué quieres hacer" aria-label="Buscar un comando">
    <ul class="ade-paleta-lista"></ul>
    <footer class="ade-paleta-pie">↑↓ para moverte · Enter para ir · Esc para cerrar</footer>
  </div>`;
ade.appendChild(paleta);

const pInput = $('.ade-paleta-input', paleta);
const pLista = $('.ade-paleta-lista', paleta);
let elegido = 0;

function pintaPaleta(q = '') {
  const filtradas = ACCIONES.filter(a => a.t.toLowerCase().includes(q.toLowerCase()));
  elegido = Math.min(elegido, Math.max(0, filtradas.length - 1));
  pLista.innerHTML = filtradas.length
    ? filtradas.map((a, i) => `
        <li class="ade-paleta-fila"${i === elegido ? ' data-on="si"' : ''} data-t="${a.t}">
          <span>${a.t}</span>${a.k ? `<kbd class="ade-kbd">${a.k}</kbd>` : ''}
        </li>`).join('')
    : '<li class="ade-paleta-vacio">No encuentro eso.</li>';
  pLista.dataset.filtro = q;
}

function abrePaleta() {
  paleta.hidden = false;
  pInput.value = '';
  elegido = 0;
  pintaPaleta();
  pInput.focus();
}
function cierraPaleta() { paleta.hidden = true; }

function lanza(nombre) {
  const a = ACCIONES.find(x => x.t === nombre);
  if (!a) return;
  cierraPaleta();
  a.hace();
}

pInput.addEventListener('input', () => { elegido = 0; pintaPaleta(pInput.value); });
pInput.addEventListener('keydown', e => {
  const filas = $$('.ade-paleta-fila', pLista);
  if (e.key === 'Escape') { cierraPaleta(); return; }
  if (e.key === 'ArrowDown') { elegido = Math.min(elegido + 1, filas.length - 1); pintaPaleta(pInput.value); e.preventDefault(); }
  if (e.key === 'ArrowUp')   { elegido = Math.max(elegido - 1, 0); pintaPaleta(pInput.value); e.preventDefault(); }
  if (e.key === 'Enter' && filas[elegido]) lanza(filas[elegido].dataset.t);
});
pLista.addEventListener('click', e => {
  const fila = e.target.closest('.ade-paleta-fila');
  if (fila) lanza(fila.dataset.t);
});
paleta.addEventListener('click', e => { if (e.target === paleta) cierraPaleta(); });

// El atajo solo funciona con el raton dentro de la maqueta: fuera, Ctrl+K es
// del navegador y no se le quita a nadie.
let dentro = false;
ade.addEventListener('pointerenter', () => { dentro = true; });
ade.addEventListener('pointerleave', () => { dentro = false; });
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && dentro) {
    e.preventDefault();
    paleta.hidden ? abrePaleta() : cierraPaleta();
  }
});
$('#ade-comandos-btn')?.addEventListener('click', abrePaleta);

/* ---------------------------------------------------------------------------
   2. LOS MODOS DEL RIEL
   Los tres botones ya estaban dibujados; ahora cambian de verdad como se ven
   los proyectos, que es lo que hacen en la app.
   --------------------------------------------------------------------------- */

$$('.rail-tab').forEach(b => {
  b.addEventListener('click', () => {
    $$('.rail-tab').forEach(x => delete x.dataset.active);
    b.dataset.active = 'true';
    $('#ade-rail').dataset.modo = b.dataset.modo;
  });
});

$('.rail-new')?.addEventListener('click', () => window.adeNuevoPanel());

/* ---------------------------------------------------------------------------
   3. ABRIR UNA SESION MAS
   --------------------------------------------------------------------------- */

const NUEVAS = [
  { proy: 'Adeorq',    titulo: 'Revisar la Agenda',   cli: 'claude', modelo: 'Sonnet 5', ctx: 4 },
  { proy: 'docs',      titulo: 'docs · guía de uso',  cli: 'shell',  modelo: 'PowerShell', ctx: 2 },
  { proy: 'web',       titulo: 'web · el changelog',  cli: 'codex',  modelo: 'medium', ctx: 7 },
];
let cuantas = 0;

window.adeNuevoPanel = function () {
  if ($$('.pane', grid).length >= 6) {
    avisar('En la app el tope es la RAM: cada sesión son unos 200 MB.');
    return;
  }
  const n = NUEVAS[cuantas++ % NUEVAS.length];
  window.adeIrA('cabina');
  window.adePintarPanel({
    ...n, estado: 'vivo',
    lineas: [
      ['dim', `Abriendo ${n.cli} en ${n.proy}…`],
      ['ok', 'terminal ConPTY lista'],
      ['dim', 'Escribe abajo para empezar.'],
    ],
  });
  avisar(`Sesión nueva en ${n.proy}. Escribe abajo y contesta.`);
};
