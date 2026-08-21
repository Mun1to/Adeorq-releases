/* ============================================================================
   Adeorq · demo/terminal.js
   ESCRIBIR EN LA TERMINAL.

   Lo que de verdad hace la app: escribes, el agente contesta. Aqui la respuesta
   es de mentira, pero el CAMINO es el de verdad: tu linea entra con su marca, el
   panel se pone a pensar, el texto sale escribiendose, y al acabar el turno el
   panel se marca en `--done`, que es como el programa te reclama desde lejos.

   No pretende ser un agente y lo dice cuando toca: es una maqueta.
   ========================================================================= */

const grid = document.getElementById('ade-grid');
if (grid) {

const avisar = (t) => (window.adeAvisar ? window.adeAvisar(t) : undefined);

/* Un puñado de respuestas segun lo que se pida. No son un modelo: son cuatro
   guiones escritos a mano, y por eso son cortos y no prometen nada. */
const RESPUESTAS = [
  {
    busca: /\b(test|prueba|pruebas)\b/i,
    guion: [
      ['dice', 'Lanzo la tanda y te cuento.'],
      ['ok',   'running 34 tests · 33 passed · 1 failed'],
      ['sub',  'motor::export::wav_16bit espera 48k y el fixture esta a 44,1.'],
      ['meta', 'Worked for 22s'],
    ],
  },
  {
    busca: /\b(git|commit|rama|branch|status)\b/i,
    guion: [
      ['dice', 'Miro el arbol antes de tocar nada.'],
      ['dim',  'On branch main · 2 files changed'],
      ['ruta', 'web/demo/demo.js · web/demo/piezas.css'],
      ['ask',  'Los meto en un commit, o prefieres verlos primero?'],
    ],
  },
  {
    busca: /\b(build|compila|compilar|cargo|pnpm|dev)\b/i,
    guion: [
      ['dim',  '   Compiling adeorq v0.9.129'],
      ['ok',   '    Finished dev profile in 3.41s'],
      ['dice', 'Compila. La app abre en 1,2 s.'],
      ['meta', 'Worked for 41s'],
    ],
  },
  {
    busca: /\b(color|colores|contraste|dise|css|landing|web)\w*/i,
    guion: [
      ['dice', 'He medido el contraste de las tres capas que se pisaban.'],
      ['sub',  'El texto sobre la foto se queda en 3,1:1 y el minimo es 4,5:1.'],
      ['ruta', 'web/styles/hero.css · 4 lineas'],
      ['meta', 'Worked for 1m 12s'],
    ],
  },
];

const GENERICAS = [
  [['dice', 'Voy con ello.'], ['sub', 'Miro primero que hay antes de cambiar nada.'], ['meta', 'Worked for 18s']],
  [['dice', 'Hecho.'], ['ruta', 'src/components/TerminalPane.tsx · 3 lineas'], ['meta', 'Worked for 34s']],
  [['dice', 'Eso toca dos sitios, asi que te lo cuento antes de hacerlo.'], ['ask', 'Sigo?']],
];

let vuelta = 0;

const CLASES = {
  pregunta: 't-tu', dice: 't-di', sub: 't-sub', ruta: 't-ruta', meta: 't-meta',
  ok: 't-ok', ask: 't-ask', dim: 't-dim', warn: 't-warn', err: 't-err',
};
const ADORNO = { pregunta: '› ', sub: '└ ', ruta: '└ ', meta: '✳ ' };

function fila(tipo) {
  const el = document.createElement('div');
  el.className = CLASES[tipo] || 't-dim';
  if (tipo === 'dice') {
    const punto = document.createElement('i');
    punto.className = 't-punto';
    el.appendChild(punto);
  }
  const texto = document.createElement('span');
  el.appendChild(texto);
  return { el, texto };
}

/* Escribe letra a letra. Con el dial a cero sale de golpe: es movimiento, y aqui
   no aporta nada que no diga ya el texto. */
function teclear(donde, texto, listo) {
  const gain = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue('--motion-gain'));
  if (!gain) { donde.textContent = texto; listo(); return; }
  let i = 0;
  (function paso() {
    donde.textContent = texto.slice(0, ++i);
    if (i < texto.length) setTimeout(paso, 11 + (i % 4) * 5);
    else listo();
  })();
}

function marcarTurno(pane, comoQueda) {
  pane.querySelector('.ade-pane-done')?.remove();
  pane.querySelector('.ade-pane-espera')?.remove();
  delete pane.dataset.done;
  pane.dataset.estado = comoQueda;
  if (comoQueda === 'done' || comoQueda === 'espera') {
    if (comoQueda === 'done') pane.dataset.done = 'true';
    const marca = document.createElement('span');
    marca.className = comoQueda === 'done' ? 'ade-pane-done' : 'ade-pane-espera';
    marca.textContent = comoQueda === 'done' ? '✓ Turno terminado' : 'Te espera';
    pane.querySelector('.ade-pane-pie').appendChild(marca);
  }
}

function responder(pane, dicho) {
  const cuerpo = pane.querySelector('.ade-pane-cuerpo');
  const encontrada = RESPUESTAS.find(r => r.busca.test(dicho));
  const guion = encontrada ? encontrada.guion : GENERICAS[(vuelta++) % GENERICAS.length];

  marcarTurno(pane, 'vivo');

  // Los tres puntos de «esta pensando», que es lo que se ve en la app mientras
  // el CLI no ha soltado la primera palabra.
  const pensando = document.createElement('div');
  pensando.className = 't-di t-pensando';
  pensando.innerHTML = '<i class="t-punto"></i><span>pensando<b>.</b><b>.</b><b>.</b></span>';
  cuerpo.appendChild(pensando);
  cuerpo.scrollTop = cuerpo.scrollHeight;

  let i = 0;
  setTimeout(function siguiente() {
    pensando.remove();
    if (i >= guion.length) {
      // Si la ultima linea era una pregunta, el turno queda esperandote; si no,
      // terminado. Es la misma regla que usa el panel de verdad.
      const ultimo = guion[guion.length - 1][0];
      marcarTurno(pane, ultimo === 'ask' ? 'espera' : 'done');
      avisar(ultimo === 'ask'
        ? 'Te ha preguntado algo: en la app el panel se queda marcado hasta que contestas.'
        : 'Turno terminado: en la app el panel se enciende para que lo veas de lejos.');
      return;
    }
    const [tipo, txt] = guion[i++];
    const f = fila(tipo);
    cuerpo.appendChild(f.el);
    teclear(f.texto, (ADORNO[tipo] || '') + txt, () => {
      cuerpo.scrollTop = cuerpo.scrollHeight;
      setTimeout(siguiente, 170);
    });
  }, 560);
}

grid.addEventListener('keydown', e => {
  const input = e.target.closest('.ade-pane-input');
  if (!input || e.key !== 'Enter') return;
  const dicho = input.value.trim();
  if (!dicho) return;

  const pane = input.closest('.pane');
  const cuerpo = pane.querySelector('.ade-pane-cuerpo');
  const f = fila('pregunta');
  f.texto.textContent = ADORNO.pregunta + dicho;
  cuerpo.appendChild(f.el);
  cuerpo.scrollTop = cuerpo.scrollHeight;
  input.value = '';
  responder(pane, dicho);
});

}
