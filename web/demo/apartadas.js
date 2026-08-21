/* ============================================================================
   Adeorq · demo/apartadas.js
   LA TIRA DE SESIONES APARTADAS.

   Es la franja de abajo de la Cabina: las terminales que has minimizado salen
   del mosaico pero SIGUEN VIVAS y trabajando, cada una con la marca de su CLI y
   la memoria que gasta. Es lo que hace que se puedan tener nueve sesiones sin
   nueve paneles a la vista, y faltaba entera en la maqueta.

   El boton de minimizar de cada panel manda aqui su sesion; pulsando la pestaña,
   vuelve al mosaico. Si una apartada «te pregunta algo», su pestaña se marca:
   en la app eso es lo que evita perder de vista a un agente parado.
   ========================================================================= */

const $  = (s, d = document) => d.querySelector(s);
const $$ = (s, d = document) => [...d.querySelectorAll(s)];
const avisar = t => (window.adeAvisar ? window.adeAvisar(t) : undefined);

const grid = $('#ade-grid');
const vistaCabina = $('.ade-vista[data-vista="cabina"]');
if (grid && vistaCabina) {

const tira = document.createElement('div');
tira.className = 'minim';
tira.hidden = true;
vistaCabina.appendChild(tira);

/* Lo que hay apartado. Se guarda el panel entero (el nodo), no una copia: al
   traerlo de vuelta tiene que seguir con su conversacion donde estaba. */
const apartadas = [];

const RAM = [359, 328, 412, 286, 505];

function pinta() {
  tira.hidden = apartadas.length === 0;
  tira.innerHTML = apartadas.length ? `
    <span class="minim-eti">Apartadas<b>${apartadas.length}</b></span>
    ${apartadas.map((a, i) => `
      <button type="button" class="minim-chip" data-i="${i}"${a.urge ? ' data-urge="si"' : ''}
              title="Traerla de vuelta al mosaico">
        <span class="minim-ico" style="--cli:${a.color}">
          <svg class="prov-mark"><use href="#m-${a.cli}"/></svg>
        </span>
        <span class="minim-nom">${a.proy} · ${a.cli}</span>
        <span class="minim-ram">${a.ram} MB</span>
      </button>`).join('')}` : '';
}

function apartar(pane) {
  const cab = pane.querySelector('.pane-name')?.textContent || 'sesión';
  const proy = pane.querySelector('.pane-chip')?.textContent || '';
  apartadas.push({
    nodo: pane,
    proy: proy || cab,
    cli: pane.dataset.cli || 'shell',
    color: getComputedStyle(pane).getPropertyValue('--cli').trim() || 'var(--muted)',
    ram: RAM[apartadas.length % RAM.length],
    // Una sesion que te habia preguntado algo se lleva su marca al irse: la app
    // no deja que eso se pierda de vista solo por minimizarla.
    urge: pane.dataset.estado === 'espera',
  });
  pane.remove();
  pinta();
  window.adeContarPie && window.adeContarPie();
  avisar('Apartada: sale del mosaico pero sigue viva y trabajando.');
}

function traer(i) {
  const a = apartadas.splice(i, 1)[0];
  if (!a) return;
  grid.appendChild(a.nodo);
  pinta();
  window.adeContarPie && window.adeContarPie();
}

tira.addEventListener('click', e => {
  const chip = e.target.closest('.minim-chip');
  if (chip) traer(+chip.dataset.i);
});

/* El boton de minimizar del panel. Se engancha en captura para adelantarse al
   que ya hay en demo.js, que solo contaba lo que haria. */
grid.addEventListener('click', e => {
  const b = e.target.closest('.pane-btn[data-acc="min"]');
  if (!b) return;
  e.stopPropagation();
  apartar(b.closest('.pane'));
}, true);

window.adeApartadas = { apartar, traer, cuantas: () => apartadas.length };

}
