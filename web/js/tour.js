/* ============================================================================
   Adeorq · tour.js
   El recorrido por dentro de la maqueta.

   La maqueta enseña la app; esto explica QUE es cada cosa. Cada zona que
   merece una explicacion lleva `data-explica="clave"` en el HTML, y aqui vive
   el texto de cada clave en los dos idiomas. Al entrar en el recorrido salen
   los numeros; al elegir uno, esa zona se queda iluminada y el resto se apaga.

   Sin JavaScript no pasa nada: el boton no aparece y la maqueta se ve igual.
   ========================================================================= */

(function () {
  'use strict';

  var raiz = document.documentElement;
  var panel = document.getElementById('panel-demo');
  if (!panel) return;

  var zonas = Array.prototype.slice.call(panel.querySelectorAll('[data-explica]'));
  if (!zonas.length) return;

  /* --------------------------------------------------------------------
     Los textos. Uno por zona, en el orden en que se recorren.
     -------------------------------------------------------------------- */

  var GUION = {
    tabs: {
      es: ['Siete pantallas, una ventana',
           'Panel para ver el día, Cabina para trabajar, Agenda para lo que se te ocurre, ' +
           'Lienzo para pensar, Cuentas para tus suscripciones, Comandos para ir rápido y Ajustes. ' +
           'Todas leen del mismo sitio, así que nada se cuenta dos veces.'],
      en: ['Seven screens, one window',
           'Panel for the day, Cockpit to work, Agenda for whatever occurs to you, Canvas to think, ' +
           'Accounts for your subscriptions, Commands to move fast and Settings. They all read from ' +
           'the same place, so nothing is counted twice.']
    },
    pulso: {
      es: ['Lo que te está costando',
           'La memoria que gastan Adeorq y sus agentes, y cuántos agentes hay vivos. Mide el árbol ' +
           'entero de procesos, no sólo la ventana, porque lo que pesa son los programas que cuelgan ' +
           'de ella. Se pone ámbar cuando aprieta Adeorq y rojo cuando la que va justa es la máquina.'],
      en: ['What it is costing you',
           'The memory Adeorq and its agents are using, and how many agents are alive. It measures ' +
           'the whole process tree, not just the window, because what weighs are the programs hanging ' +
           'off it. Amber when Adeorq is the one squeezing, red when it is the machine.']
    },
    emision: {
      es: ['El modo emisión',
           'Un botón, y las rutas, los correos y las claves de todas las terminales se tapan de ' +
           'golpe. Para grabar o compartir pantalla sin repasar antes lo que se ve. Con Alt puedes ' +
           'mirar debajo un momento sin desactivarlo.'],
      en: ['Streaming mode',
           'One button, and the paths, emails and keys in every terminal are covered at once. For ' +
           'recording or sharing your screen without auditing it first. Hold Alt to peek underneath ' +
           'for a moment without switching it off.']
    },
    capataz: {
      es: ['El Capataz',
           'Le pides el tablero en castellano («un agente al frontend y otro al backend») y propone ' +
           'el plan: qué sesiones abrir, con qué programa y con qué encargo. No ejecuta nada sin tu ' +
           'visto bueno, y esa es toda la gracia.'],
      en: ['The Foreman',
           'You ask it for the board in plain language ("one agent on the frontend, another on the ' +
           'backend") and it proposes the plan: which sessions to open, with which program and with ' +
           'which brief. It runs nothing without your approval, and that is the whole point.']
    },
    riel: {
      es: ['Tus proyectos, y lo que tienen vivo',
           'Cada proyecto con su icono y dos contadores: cuántas sesiones están trabajando y cuántas ' +
           'te esperan. El punto verde dice que hay algo en marcha ahí dentro. Se abren todas de un ' +
           'clic, cada una donde la dejaste.'],
      en: ['Your projects, and what is alive in them',
           'Each project with its icon and two counters: how many sessions are working and how many ' +
           'are waiting on you. The green dot means something is running in there. One click opens ' +
           'them all, each where you left it.']
    },
    contexto: {
      es: ['La barra de contexto, la firma de la casa',
           'Cuánto lleva cargado esa conversación, medido contra la ventana real del modelo que ' +
           'estás usando, no contra un número fijo. Cuando una sesión se pone cara, Adeorq avisa: ' +
           'a partir de cierto tamaño cada mensaje vuelve a pagar el contexto entero.'],
      en: ['The context bar, the house signature',
           'How full that conversation is, measured against the real window of the model you are ' +
           'using, not a fixed number. When a session gets expensive, Adeorq says so: past a certain ' +
           'size every message pays for the whole context again.']
    },
    estado: {
      es: ['Quién ha terminado y quién te espera',
           'Adeorq lee el historial de la sesión para saberlo de verdad, en vez de adivinarlo por si ' +
           'suena la campana de la terminal. La diferencia importa: cerrar un panel que te estaba ' +
           'preguntando algo pierde la pregunta.'],
      en: ['Who has finished and who is waiting on you',
           'Adeorq reads the session history to know for sure, instead of guessing from whether the ' +
           'terminal rang a bell. The difference matters: closing a pane that was asking you ' +
           'something loses the question.']
    },
    terminal: {
      es: ['Terminales de verdad, no una imitación',
           'Dentro de cada panel corre el mismo motor de consola que usa Windows. Los colores, ' +
           'Ctrl+C, el historial y cualquier herramienta que espere una terminal funcionan tal cual. ' +
           'El dibujado va por GPU, así que miles de líneas no atragantan la ventana.'],
      en: ['Real terminals, not an imitation',
           'Inside every pane runs the same console engine Windows uses. Colours, Ctrl+C, history and ' +
           'any tool that expects a terminal work as they are. Drawing goes through the GPU, so ' +
           'thousands of lines do not choke the window.']
    },
    estado_barra: {
      es: ['Todo ocurre en tu equipo',
           'Cuántas terminales hay abiertas y si algo ha fallado. No hay servidor por medio: Adeorq ' +
           'lee lo que los programas ya guardan en tu disco y sólo sale a internet para comprobar si ' +
           'hay versión nueva.'],
      en: ['Everything happens on your machine',
           'How many terminals are open and whether anything failed. There is no server in between: ' +
           'Adeorq reads what the programs already keep on your disk, and only goes online to check ' +
           'for a new version.']
    }
  };

  function en() { return raiz.lang === 'en'; }
  function texto(clave, i) {
    var g = GUION[clave];
    if (!g) return '';
    return (en() ? g.en : g.es)[i] || '';
  }

  /* --------------------------------------------------------------------
     Montaje: un boton, una capa de numeros y una tarjeta.
     -------------------------------------------------------------------- */

  var capa = document.createElement('div');
  capa.className = 'tour';
  capa.hidden = true;

  var tarjeta = document.createElement('div');
  tarjeta.className = 'tour__tarjeta';
  tarjeta.setAttribute('role', 'dialog');
  tarjeta.setAttribute('aria-live', 'polite');
  tarjeta.innerHTML =
    '<p class="tour__paso"></p>' +
    '<h4 class="tour__t"></h4>' +
    '<p class="tour__d"></p>' +
    '<div class="tour__pies">' +
      '<button type="button" class="tour__btn" data-tour-prev></button>' +
      '<button type="button" class="tour__btn tour__btn--solido" data-tour-next></button>' +
    '</div>';

  var boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'tour__abrir';

  var cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'tour__cerrar';
  cerrar.setAttribute('aria-label', 'Cerrar el recorrido');
  cerrar.textContent = '✕';

  panel.appendChild(capa);
  capa.appendChild(tarjeta);
  capa.appendChild(cerrar);

  var contenedor = panel.parentNode;         // .escena
  if (contenedor) contenedor.appendChild(boton);

  var puntos = [];
  var actual = -1;

  zonas.forEach(function (zona, i) {
    var p = document.createElement('button');
    p.type = 'button';
    p.className = 'tour__punto';
    p.textContent = String(i + 1);
    p.addEventListener('click', function (ev) {
      ev.stopPropagation();
      ir(i);
    });
    capa.appendChild(p);
    puntos.push(p);
  });

  /* Los numeros se colocan sobre su zona. Se recalcula al abrir y al cambiar
     el tamano, que es cuando la maqueta se recoloca. */
  function colocar() {
    var caja = panel.getBoundingClientRect();
    zonas.forEach(function (zona, i) {
      var r = zona.getBoundingClientRect();
      if (!r.width) { puntos[i].style.display = 'none'; return; }
      puntos[i].style.display = '';
      /* En la esquina de arriba a la derecha de su zona, no en el centro: en el
         centro el numero tapaba justo lo que estaba senalando. */
      var x = r.right - caja.left;
      var y = r.top - caja.top;
      // Y sin salirse de la maqueta, que las zonas del borde se irian fuera.
      x = Math.min(Math.max(x, 14), caja.width - 14);
      y = Math.min(Math.max(y, 14), caja.height - 14);
      puntos[i].style.left = x + 'px';
      puntos[i].style.top = y + 'px';
    });
  }

  /* La tarjeta se aparta de la zona que explica: si la zona esta arriba, la
     tarjeta baja; si esta abajo, sube. */
  function colocarTarjeta(zona) {
    var caja = panel.getBoundingClientRect();
    var r = zona.getBoundingClientRect();
    var centro = (r.top - caja.top) + r.height / 2;
    var arriba = centro < caja.height / 2;
    tarjeta.style.top = arriba ? 'auto' : '14px';
    tarjeta.style.bottom = arriba ? '14px' : 'auto';
  }

  function ir(i) {
    if (i < 0) i = zonas.length - 1;
    if (i >= zonas.length) i = 0;
    actual = i;

    zonas.forEach(function (z, n) { z.classList.toggle('is-explicada', n === i); });
    puntos.forEach(function (p, n) { p.classList.toggle('is-on', n === i); });
    colocar();
    colocarTarjeta(zonas[i]);

    var clave = zonas[i].getAttribute('data-explica');
    tarjeta.querySelector('.tour__paso').textContent =
      (en() ? 'Step ' : 'Paso ') + (i + 1) + ' / ' + zonas.length;
    tarjeta.querySelector('.tour__t').textContent = texto(clave, 0);
    tarjeta.querySelector('.tour__d').textContent = texto(clave, 1);
    tarjeta.querySelector('[data-tour-prev]').textContent = en() ? 'Back' : 'Atrás';
    tarjeta.querySelector('[data-tour-next]').textContent =
      i === zonas.length - 1 ? (en() ? 'Finish' : 'Terminar') : (en() ? 'Next' : 'Siguiente');
    tarjeta.hidden = false;
  }

  function abrir() {
    capa.hidden = false;
    panel.classList.add('is-tour');
    colocar();
    ir(0);
    pintarBoton();
  }

  function cerrarTour() {
    capa.hidden = true;
    tarjeta.hidden = true;
    panel.classList.remove('is-tour');
    zonas.forEach(function (z) { z.classList.remove('is-explicada'); });
    puntos.forEach(function (p) { p.classList.remove('is-on'); });
    actual = -1;
    pintarBoton();
  }

  function pintarBoton() {
    var abierto = !capa.hidden;
    boton.textContent = abierto
      ? (en() ? 'Close the tour' : 'Cerrar el recorrido')
      : (en() ? 'See how it works inside' : 'Ver cómo es por dentro');
    boton.setAttribute('aria-pressed', String(abierto));
  }

  boton.addEventListener('click', function () {
    if (capa.hidden) abrir(); else cerrarTour();
  });
  cerrar.addEventListener('click', cerrarTour);
  tarjeta.querySelector('[data-tour-prev]').addEventListener('click', function () { ir(actual - 1); });
  tarjeta.querySelector('[data-tour-next]').addEventListener('click', function () {
    if (actual === zonas.length - 1) cerrarTour(); else ir(actual + 1);
  });

  document.addEventListener('keydown', function (ev) {
    if (capa.hidden) return;
    if (ev.key === 'Escape') cerrarTour();
    if (ev.key === 'ArrowRight') ir(actual + 1);
    if (ev.key === 'ArrowLeft') ir(actual - 1);
  });

  window.addEventListener('resize', function () { if (!capa.hidden) colocar(); }, { passive: true });
  window.addEventListener('adeorq:language', function () {
    pintarBoton();
    if (actual >= 0) ir(actual);
  });

  pintarBoton();
})();
