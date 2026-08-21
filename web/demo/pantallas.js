/* ============================================================================
   Adeorq · demo/pantallas.js
   LAS DOS PANTALLAS QUE FALTABAN: el Chat y la Memoria.

   La barra de la maqueta tenia siete pestañas y el programa tiene nueve. Las
   dos que faltaban no son un rincon: el Chat es la misma sesion sin la consola
   delante (por eso va pegado a la Cabina) y la Memoria es la boveda de Obsidian
   de Munir leida desde aqui.

   La estructura es la de src/components/ChatView.tsx y MemoriaView.tsx, clase a
   clase, para que las reglas que ya trae ui.css desde App.css encajen sin
   inventarse nada. Lo de dentro es de mentira; lo que se pulsa, no.
   ========================================================================= */

const $  = (s, d = document) => d.querySelector(s);
const $$ = (s, d = document) => [...d.querySelectorAll(s)];
const avisar = t => (window.adeAvisar ? window.adeAvisar(t) : undefined);
const ico = n => `<svg class="ade-i"><use href="iconos.svg#i-${n}"/></svg>`;
const marca = id => `<svg class="prov-mark"><use href="#m-${id}"/></svg>`;

/* ---------------------------------------------------------------------------
   EL CHAT
   Las mismas sesiones de la Cabina, sin la terminal delante: a la izquierda las
   conversaciones por cajones de tiempo, en medio el hilo en burbujas, y abajo
   la caja de escribir, que es lo que permite que Adeorq LEA lo que escribes
   antes de que salga (dentro de una terminal el texto va directo al CLI).
   --------------------------------------------------------------------------- */

/* Solo Adeorq y sus carpetas: la maqueta se publica en la web y ahí no salen
   los proyectos de Munir (Munir, 2026-08-20). */
const CONVERSACIONES = [
  { cajon: 'Hoy', tit: 'Adeorq: sesiones y terminales', proy: 'Adeorq', vivo: true, on: true },
  { cajon: 'Hoy', tit: 'Repasar el contraste de la web', proy: 'web' },
  { cajon: 'Hoy', tit: 'cargo test · el motor de terminales', proy: 'src-tauri', vivo: true },
  { cajon: 'Ayer', tit: 'El encuadre de la portada', proy: 'web' },
  { cajon: 'Ayer', tit: 'El scroll se comía la última línea', proy: 'Adeorq' },
  { cajon: 'Esta semana', tit: 'Migrar el lector de sesiones', proy: 'src-tauri' },
  { cajon: 'Esta semana', tit: 'La guía de uso', proy: 'docs' },
];

const HILO = [
  ['tu', 'oye, ¿cuánto me está costando de verdad una sesión larga de estas?'],
  ['agente', 'Menos de lo que parece, y el motivo es la caché.\n\nDe los 812.000 tokens de entrada de esta conversación, **786.000 han salido de caché**. La tarifa por millón que anuncian es la del token nuevo, y aquí solo el 3% lo es.'],
  ['agente', 'La cuenta de hoy, por vía:\n\n· por el CLI, con tu suscripción: entra en la cuota, 0 €\n· la misma conversación por API: 4,12 €'],
  ['tu', 'entonces lo que encarece no es la longitud'],
  ['agente', 'Exacto: es CAMBIAR de tema. Cada vez que abres un archivo nuevo grande, esa parte entra sin caché y se paga entera. Por eso `/compact` a mitad de tarea sale más caro que seguir.'],
];

function chat(host) {
  const filas = [];
  let cajonPrevio = null;
  for (const c of CONVERSACIONES) {
    if (c.cajon !== cajonPrevio) {
      if (cajonPrevio !== null) filas.push('</section>');
      filas.push(`<section class="chat-cajon">
        <button type="button" class="chat-cajon-tit"><span>${c.cajon}</span></button>`);
      cajonPrevio = c.cajon;
    }
    filas.push(`
      <button type="button" class="chat-fila"${c.on ? ' data-on="true"' : ''} style="--c:${window.adeHue ? window.adeHue(c.proy) : '#7aa2ff'}">
        <span class="chat-fila-txt">
          <span class="chat-fila-tit">${c.tit}</span>
          <span class="chat-fila-sub">${c.proy}${c.vivo ? '<span class="live-dot"></span>' : ''}</span>
        </span>
      </button>`);
  }
  if (cajonPrevio !== null) filas.push('</section>');

  host.innerHTML = `
    <div class="chat-view">
      <!-- Izquierda: las conversaciones. Los clientes van solo con su marca, en
           fila: con nueve posibles, escribir el nombre se come la columna. -->
      <aside class="chat-lista">
        <div class="chat-clientes">
          <button type="button" class="chat-cliente" data-on="true" title="Claude Code">${marca('claude')}</button>
          <button type="button" class="chat-cliente" title="Codex">${marca('codex')}</button>
          <button type="button" class="chat-cliente" title="Gemini CLI">${marca('gemini')}</button>
          <button type="button" class="chat-cliente" title="opencode">${marca('opencode')}</button>
        </div>

        <button type="button" class="chat-nueva">${ico('lapiz')} Nueva conversación</button>

        <label class="chat-buscar">
          ${ico('buscar')}
          <input class="finder" id="chat-q" placeholder="Buscar conversaciones…">
        </label>

        <div class="chat-cajones" id="chat-cajones">${filas.join('')}</div>

        <div class="chat-git">
          ${ico('rama')}
          <span class="chat-git-txt"><strong>Adeorq</strong><em>3 archivos sin guardar</em></span>
        </div>
        <footer class="chat-yo">
          <span class="pavatar pavatar-mini" data-plate="none" data-foto="si" style="--c:#7aa2ff"><img src="../assets/adeorq.svg" alt=""></span>
          <span class="chat-yo-txt"><strong>Claude Code</strong><em>Max 20×</em></span>
        </footer>
      </aside>

      <!-- Centro: la conversación. -->
      <main class="chat-hilo">
        <header class="chat-cabecera">
          <span class="pavatar pavatar-mini" data-plate="none" data-foto="si" style="--c:#7aa2ff"><img src="../assets/adeorq.svg" alt=""></span>
          <span class="chat-cab-id">
            <strong>Adeorq: sesiones y terminales</strong>
            <em>C:\\proyectos\\Adeorq</em>
          </span>
          <!-- La consola no desaparece, se aparta: es la misma sesión. -->
          <div class="chat-modo">
            <button type="button" class="chat-modo-b" data-on>Limpio</button>
            <button type="button" class="chat-modo-b" id="chat-a-terminal">${ico('terminal')} Terminal</button>
          </div>
        </header>

        <div class="chat-turnos" id="chat-turnos"></div>

        <div class="chat-caja-zona">
          <span class="chat-haz" aria-hidden="true"></span>
          <div class="chat-caja">
            <div class="chat-caja-fila">
              <button type="button" class="chat-mas" title="Nueva conversación">${ico('mas')}</button>
              <textarea class="chat-input" id="chat-input" rows="2"
                placeholder="Escribe aquí. Enter envía, Mayús+Enter hace un párrafo."></textarea>
              <button type="button" class="chat-enviar" id="chat-enviar" title="Enviar">${ico('enviar')}</button>
            </div>
          </div>
        </div>
      </main>
    </div>`;

  const turnos = $('#chat-turnos', host);

  /* El markdown mínimo que usa el hilo: negritas, ticks y párrafos. La app pasa
     por `markdown.ts` porque lo que pinta lo escribió un modelo leyendo
     archivos ajenos; aquí el texto es nuestro, pero se escapa igual. */
  const aHtml = txt => txt
    .replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

  const burbuja = (rol, texto) => {
    const art = document.createElement('article');
    art.className = 'chat-turno';
    art.dataset.rol = rol;
    art.innerHTML = `<div class="chat-burbuja">${aHtml(texto)}</div>`;
    turnos.appendChild(art);
    turnos.scrollTop = turnos.scrollHeight;
    return art;
  };

  for (const [rol, texto] of HILO) burbuja(rol, texto);

  /* Escribir de verdad. La respuesta se teclea sola, como en la Cabina, y el
     orbe de la barra se pone a pensar mientras: es el mismo estado. */
  const caja = $('#chat-input', host);
  const RESPUESTAS = [
    'Voy. Te lo dejo medido, no a ojo: abro los dos archivos, comparo y te digo qué cambia en pantalla antes de tocar nada.',
    'Hecho. Eran tres capas pisándose y la de en medio no llegaba al mínimo legible. Lo he aplanado contra el tema, sin cambiar el tono.',
    'Eso ya está resuelto desde el arreglo del jueves, así que antes de repetirlo mira qué versión tienes corriendo: puede ser un binario viejo.',
  ];
  let cual = 0;

  function enviar() {
    const txt = caja.value.trim();
    if (!txt) return;
    caja.value = '';
    burbuja('tu', txt);
    window.adeOrbe?.('piensa');
    const art = burbuja('agente', '');
    const cuerpo = $('.chat-burbuja', art);
    const dice = RESPUESTAS[cual++ % RESPUESTAS.length];
    let i = 0;
    const teclear = () => {
      i += 2;
      cuerpo.innerHTML = aHtml(dice.slice(0, i));
      turnos.scrollTop = turnos.scrollHeight;
      if (i < dice.length) setTimeout(teclear, 16);
      else window.adeOrbe?.('reposo');
    };
    setTimeout(teclear, 380);
  }

  $('#chat-enviar', host).addEventListener('click', enviar);
  caja.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
    else window.adeOrbe?.('escucha');
  });

  $('#chat-a-terminal', host).addEventListener('click', () => {
    window.adeIrA?.('cabina');
    avisar('Es la misma sesión: el Chat la enseña limpia y la Cabina en crudo.');
  });

  // El buscador filtra de verdad, y esconde el cajón que se queda sin nada.
  $('#chat-q', host).addEventListener('input', e => {
    const q = e.currentTarget.value.trim().toLowerCase();
    $$('.chat-cajon', host).forEach(sec => {
      let vivos = 0;
      $$('.chat-fila', sec).forEach(f => {
        const cabe = !q || f.textContent.toLowerCase().includes(q);
        f.hidden = !cabe;
        if (cabe) vivos++;
      });
      sec.hidden = vivos === 0;
    });
  });

  $('#chat-cajones', host).addEventListener('click', e => {
    const f = e.target.closest('.chat-fila');
    if (!f) return;
    $$('.chat-fila', host).forEach(x => delete x.dataset.on);
    f.dataset.on = 'true';
    avisar('En el programa esto abre esa conversación entera desde su transcript.');
  });
}

/* ---------------------------------------------------------------------------
   LA MEMORIA
   La boveda de Obsidian leida desde Adeorq: arbol de carpetas a la izquierda y
   el documento a la derecha. Los tres modos (lista, mapa y grafo) son los de la
   app; aqui solo el primero pinta algo, y los otros dos lo dicen en vez de
   enseñar un dibujo que no es el suyo.
   --------------------------------------------------------------------------- */

const BOVEDA = [
  { carpeta: 'Proyectos', n: 34, docs: [
    { t: 'Adeorq · rumbo del de pago', s: 'Proyectos/Adeorq' },
    { t: 'Qué se queda gratis', s: 'Proyectos/Adeorq' },
    { t: 'Adeorq · el rumbo de la web', s: 'Proyectos/Adeorq' },
  ]},
  { carpeta: 'Reglas', n: 29, docs: [
    { t: 'Regla X · a la tercera no se insiste', s: 'Reglas' },
    { t: 'Regla AD · nada está hecho hasta ejecutarlo', s: 'Reglas' },
  ]},
  { carpeta: 'Diario', n: 218, docs: [
    { t: '2026-08-20', s: 'Diario/2026-08' },
    { t: '2026-08-19', s: 'Diario/2026-08' },
  ]},
];

const DOC = {
  t: 'Regla X · a la tercera no se insiste',
  ruta: 'Reglas/Regla X · a la tercera no se insiste.md',
  cuerpo: `<p>Si algo se resiste tras <strong>dos intentos</strong>, o si digo <strong>dos veces</strong> que eso no es lo que quiero, la culpa deja de ser del código y pasa a ser de la herramienta, la librería o el stack.</p>
<p>Cambiar un parámetro o repetir el mismo enfoque con otra sintaxis es el MISMO intento, no uno nuevo.</p>
<h3>Qué hacer al llegar a dos</h3>
<ul>
  <li>Parar y nombrar la pared en voz alta.</li>
  <li>Mirar qué se usa hoy para ese problema concreto.</li>
  <li>Proponer 2 o 3 caminos amplios, no micro-ajustes.</li>
</ul>
<p>Aparcar con su condición de desbloqueo también vale. Y lo mismo aplica cuando el problema es de gusto y no de error.</p>
<p>Enlaza con <a href="#">Regla AA · empezar por lo que está mal</a> y <a href="#">Regla O · ambición por defecto</a>.</p>`,
};

function memoria(host) {
  const arbol = BOVEDA.map(c => `
    <button type="button" class="mem-carpeta" style="padding-left:8px">
      ${ico('carpeta')}
      <span class="mem-carpeta-nombre">${c.carpeta}</span>
      <span class="mem-carpeta-n">${c.n}</span>
    </button>
    ${c.docs.map((d, i) => `
      <button type="button" class="mem-hoja"${c.carpeta === 'Reglas' && i === 0 ? ' data-on="true"' : ''} style="padding-left:21px">
        <span class="mem-fila-txt">
          <span class="mem-fila-tit">${d.t}</span>
          <span class="mem-fila-sub">${d.s}</span>
        </span>
      </button>`).join('')}`).join('');

  host.innerHTML = `
    <div class="mem">
      <header class="mem-head">
        <div class="mem-buscar">
          ${ico('buscar')}
          <input class="mem-buscar-input" id="mem-q" placeholder="Buscar en tus notas">
        </div>
        <div class="mem-modos">
          <button type="button" data-modo="lista" data-on="true" title="La lista de siempre">${ico('filas')}</button>
          <button type="button" data-modo="mapa" title="El mapa de la bóveda">${ico('kanban')}</button>
          <button type="button" data-modo="grafo" title="El grafo de enlaces">${ico('marca')}</button>
        </div>
        <button type="button" class="mem-accion" id="mem-releer">${ico('refrescar')} Volver a leer</button>
        <div class="mem-cambiar">
          <button type="button" class="mem-accion">Cambiar bóveda</button>
        </div>
      </header>

      <div class="mem-cuerpo">
        <aside class="mem-lista">
          <div class="mem-lista-tabs">
            <button type="button" data-on="true">Carpetas</button>
            <button type="button">Recientes</button>
          </div>
          <div class="mem-lista-eti" id="mem-eti">281 documentos</div>
          ${arbol}
        </aside>

        <section class="mem-doc">
          <div class="mem-doc-head">
            <h2 class="mem-doc-titulo">${DOC.t}</h2>
            <span class="mem-doc-ruta">${DOC.ruta}</span>
          </div>
          <div class="mem-doc-cuerpo mem-md">${DOC.cuerpo}</div>
        </section>
      </div>
    </div>`;

  $('#mem-q', host).addEventListener('input', e => {
    const q = e.currentTarget.value.trim().toLowerCase();
    let vistos = 0;
    $$('.mem-hoja', host).forEach(h => {
      const cabe = !q || h.textContent.toLowerCase().includes(q);
      h.hidden = !cabe;
      if (cabe) vistos++;
    });
    // Buscando manda la busqueda: el arbol al lado de sus resultados serian dos
    // listas que no dicen lo mismo.
    $$('.mem-carpeta', host).forEach(c => { c.hidden = !!q; });
    $('#mem-eti', host).textContent = q
      ? `${vistos} ${vistos === 1 ? 'resultado' : 'resultados'}`
      : '281 documentos';
  });

  $('.mem-modos', host).addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $$('.mem-modos button', host).forEach(x => delete x.dataset.on);
    b.dataset.on = 'true';
    if (b.dataset.modo !== 'lista') {
      avisar('El mapa y el grafo dibujan los enlaces entre tus notas: eso necesita tu bóveda de verdad.');
    }
  });

  $('#mem-releer', host).addEventListener('click', () => avisar('Vuelve a leer la carpeta entera: 281 documentos en 0,4 s.'));

  host.addEventListener('click', e => {
    const h = e.target.closest('.mem-hoja');
    if (!h) return;
    $$('.mem-hoja', host).forEach(x => delete x.dataset.on);
    h.dataset.on = 'true';
  });
}

/* ---------------------------------------------------------------------------
   MONTAJE
   --------------------------------------------------------------------------- */

for (const [vista, montar] of Object.entries({ chat, memoria })) {
  const sec = $(`.ade-vista[data-vista="${vista}"]`);
  if (sec) montar(sec);
}
