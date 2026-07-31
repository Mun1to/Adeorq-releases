/* ============================================================================
   Adeorq · acciones.js
   Los botones de la maqueta.

   Regla de la casa para esta demo: NINGUN boton se queda mudo. Cada uno lleva
   `data-hace="clave"` y al pulsarlo pasa una de dos cosas:

     · si la accion se puede imitar aqui (cambiar de pantalla, maximizar una
       terminal, tapar lo que se ve, plegar el riel), se hace de verdad;
     · si es imposible en una pagina web (abrir un PTY, hablar con git, leer
       tu disco), sale un globo que explica que hace ese boton en la app.

   Asi el visitante puede tocarlo todo y sale sabiendo para que sirve cada
   cosa, que es justo lo que una captura no cuenta.
   ========================================================================= */

(function () {
  'use strict';

  var raiz = document.documentElement;
  var panel = document.getElementById('panel-demo');
  if (!panel) return;

  function en() { return raiz.lang === 'en'; }

  /* ------------------------------------------------------------------
     Lo que hace cada boton. [titulo, explicacion]
     ------------------------------------------------------------------ */

  var QUE_HACE = {
    /* --- Barra superior --- */
    objetivos: {
      es: ['Los objetivos de hoy', 'Abre un panel flotante con las dos o tres cosas que quieres dejar cerradas hoy. Se arrastra donde quieras y se pliega a una línea. Viven en un archivo de texto, así que un agente puede tacharlos al terminar.'],
      en: ['Goals for today', 'Opens a floating panel with the two or three things you want to close today. Drag it anywhere, fold it to a single line. They live in a text file, so an agent can tick them off when it finishes.']
    },
    now: {
      es: ['Lo que estás escuchando', 'Lee lo que suena en Windows y te deja pausar o cambiar de canción sin salir de Adeorq.'],
      en: ['What you are listening to', 'Reads what Windows is playing and lets you pause or skip without leaving Adeorq.']
    },
    pulso: {
      es: ['El pulso', 'Cuánta memoria gastan Adeorq y sus agentes, y cuántos agentes hay vivos. Mide el árbol entero de procesos, no sólo la ventana. Al pulsarlo se abre el desglose.'],
      en: ['The pulse', 'How much memory Adeorq and its agents use, and how many agents are alive. It measures the whole process tree, not just the window. Click it for the breakdown.']
    },
    capataz: {
      es: ['Llamar al Capataz', 'Le pides el tablero en castellano y propone el plan: qué sesiones abrir, con qué programa y con qué encargo. No ejecuta nada sin tu visto bueno. Atajo: Ctrl+Mayús+A.'],
      en: ['Call the Foreman', 'Ask it for the board in plain language and it proposes the plan: which sessions to open, with which program and which brief. It runs nothing without your approval. Shortcut: Ctrl+Shift+A.']
    },
    layout: {
      es: ['Repartir lo que tienes abierto', 'Nueve plantillas para colocar las terminales: una sola, dos o tres columnas, grande a un lado, cuadrícula de 2x2, 2x3 o la pared de nueve.'],
      en: ['Arrange what you have open', 'Nine templates to lay out the terminals: single, two or three columns, big on one side, 2x2, 2x3 or the wall of nine.']
    },

    /* --- Barra lateral --- */
    nueva: {
      es: ['Abrir una sesión', 'Eliges carpeta y herramienta, y nace la terminal ahí dentro con el programa ya arrancando.'],
      en: ['Open a session', 'Pick a folder and a tool, and the terminal is born in there with the program already starting.']
    },
    riel: {
      es: ['Cómo se ve la barra', 'Tres modos: logo y nombre, sólo los logos en grande, o encogida del todo a una tira de iconos. Ahora mismo está en tira.'],
      en: ['How the sidebar looks', 'Three modes: logo and name, just the logos big, or shrunk down to a strip of icons. Right now it is the strip.']
    },
    proyecto: {
      es: ['Un proyecto', 'Al pulsarlo despliega sus sesiones. Al pasar el ratón salen sus atajos: abrir todas de una vez, una Claude nueva, una terminal o Antigravity.'],
      en: ['A project', 'Click to unfold its sessions. Hovering reveals its shortcuts: open them all at once, a new Claude, a terminal or Antigravity.']
    },

    /* --- Cabecera de cada terminal --- */
    espejo: {
      es: ['El modo espejo', 'Aísla lo que el agente escriba en una copia aparte del proyecto. Puedes revisar los cambios uno a uno y aceptarlos o tirarlos, sin que toque tu carpeta de verdad hasta que tú digas.'],
      en: ['Mirror mode', 'Isolates whatever the agent writes into a separate copy of the project. You review the changes one by one and accept or drop them, without it touching your real folder until you say so.']
    },
    tapar: {
      es: ['Tapar esta terminal', 'Difumina sólo este panel, para enseñar la pantalla sin enseñar lo que hay dentro de esta sesión.'],
      en: ['Cover this terminal', 'Blurs this pane only, so you can show your screen without showing what is inside this session.']
    },
    partir: {
      es: ['Partir el panel', 'Abre otra terminal al lado o debajo, repartiendo el sitio. Atajos: Ctrl+Mayús+→ y Ctrl+Mayús+↓.'],
      en: ['Split the pane', 'Opens another terminal beside or below, sharing the space. Shortcuts: Ctrl+Shift+→ and Ctrl+Shift+↓.']
    },
    borrar: {
      es: ['Borrar la sesión', 'Se lleva la conversación del disco. Hay que pulsar dos veces: la primera arma el botón durante cuatro segundos.'],
      en: ['Delete the session', 'Removes the conversation from disk. You have to press twice: the first press arms the button for four seconds.']
    },
    contexto: {
      es: ['La barra de contexto', 'Cuánto lleva cargado esa conversación contra la ventana real del modelo. Al llegar al 80 % se pone ámbar: a partir de ahí, compactar cuesta más que abrir una terminal nueva.'],
      en: ['The context bar', 'How full that conversation is against the real window of the model. At 80% it turns amber: past that, compacting costs more than opening a fresh terminal.']
    },
    modelo: {
      es: ['El modelo y su esfuerzo', 'Con qué está pensando esa sesión. Se cambia dentro del propio panel con /model y /effort.'],
      en: ['The model and its effort', 'What that session is thinking with. Change it inside the pane itself with /model and /effort.']
    },
    proy: {
      es: ['De qué proyecto es', 'La carpeta en la que corre esta terminal. El color se calcula del nombre, así que cada proyecto tiene siempre el suyo.'],
      en: ['Which project it belongs to', 'The folder this terminal runs in. The colour comes from the name, so each project always keeps its own.']
    },
    cerrar: {
      es: ['Cerrar la terminal', 'Cierra el programa y todo lo que cuelgue de él. Si estaba a mitad de un turno, ese trabajo se pierde: por eso el panel avisa cuando ha terminado.'],
      en: ['Close the terminal', 'Closes the program and everything hanging off it. If it was halfway through a turn that work is lost, which is why the pane tells you when it has finished.']
    },
    escribir: {
      es: ['Aquí se escribe', 'Es una terminal de verdad: lo que escribirías en una consola, se escribe aquí. También puedes pegar una imagen para dársela al agente.'],
      en: ['This is where you type', 'It is a real terminal: whatever you would type into a console goes here. You can also paste an image to hand it to the agent.']
    },
    estado: {
      es: ['El estado de la sesión', 'Adeorq lee el historial para saber si ha terminado, si te está preguntando algo o si sigue trabajando. No lo adivina por la campana de la terminal.'],
      en: ['The session state', 'Adeorq reads the history to know whether it finished, is asking you something, or is still working. It does not guess from the terminal bell.']
    },
    skills: {
      es: ['Skills y uso', 'Una pestaña lateral con tus skills y en qué se te está yendo la cuota esta semana.'],
      en: ['Skills and usage', 'A side tab with your skills and where your quota is going this week.']
    },
    ventana: {
      es: ['Es una ventana de verdad', 'Adeorq es una aplicación nativa de Windows, no una pestaña del navegador: se minimiza, se maximiza y se cierra como cualquier otra.'],
      en: ['It is a real window', 'Adeorq is a native Windows application, not a browser tab: it minimises, maximises and closes like any other.']
    }
  };

  /* ------------------------------------------------------------------
     El globo que explica
     ------------------------------------------------------------------ */

  var globo = document.createElement('div');
  globo.className = 'gl';
  globo.hidden = true;
  globo.innerHTML = '<p class="gl__t"></p><p class="gl__d"></p>' +
                    '<span class="gl__pie"></span>';
  panel.appendChild(globo);

  var cerrarTimer = null;

  function esconder() {
    globo.hidden = true;
    if (cerrarTimer) { clearTimeout(cerrarTimer); cerrarTimer = null; }
  }

  function explicar(el, clave) {
    var q = QUE_HACE[clave];
    if (!q) return;
    var t = en() ? q.en : q.es;

    globo.querySelector('.gl__t').textContent = t[0];
    globo.querySelector('.gl__d').textContent = t[1];
    globo.querySelector('.gl__pie').textContent = en()
      ? 'This one only works in the app'
      : 'Este sólo funciona en la aplicación';
    globo.hidden = false;

    // Anclado al boton y SIEMPRE dentro de la ventana dibujada. El ancho se
    // mide despues de pintarlo: antes valia 0 y el globo se salia por la
    // izquierda, que es justo lo que se veia.
    var caja = panel.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    var ancho = globo.getBoundingClientRect().width;
    var margen = 10;

    var centro = (r.left - caja.left) + r.width / 2;
    var x = centro - ancho / 2;
    x = Math.max(margen, Math.min(x, caja.width - ancho - margen));

    var abajo = (r.top - caja.top) > caja.height / 2;
    globo.style.left = x + 'px';
    globo.style.top = abajo ? 'auto' : (r.bottom - caja.top + 10) + 'px';
    globo.style.bottom = abajo ? (caja.height - (r.top - caja.top) + 10) + 'px' : 'auto';

    // El pico apunta al boton, aunque el globo se haya tenido que correr.
    var pico = Math.max(14, Math.min(centro - x, ancho - 14));
    globo.style.setProperty('--pico', pico + 'px');
    globo.setAttribute('data-lado', abajo ? 'abajo' : 'arriba');

    if (cerrarTimer) clearTimeout(cerrarTimer);
    cerrarTimer = setTimeout(esconder, 7000);
  }

  /* ------------------------------------------------------------------
     Lo que SI se puede imitar aqui
     ------------------------------------------------------------------ */

  var REALES = {
    // Maximizar una terminal: la otra se esconde y esta ocupa el hueco.
    maximizar: function (el) {
      var pane = el.closest('.ap-pane');
      if (!pane) return false;
      var ya = panel.classList.contains('is-max');
      panel.classList.toggle('is-max', !ya);
      Array.prototype.forEach.call(panel.querySelectorAll('.ap-pane'), function (p) {
        p.classList.toggle('is-oculto', !ya && p !== pane);
      });
      return true;
    },
    // El modo emision: tapa rutas y nombres en toda la ventana.
    emision: function () {
      panel.classList.toggle('is-emision');
      return true;
    },
    // Plegar el riel de proyectos.
    riel: function () {
      panel.classList.toggle('is-riel-ancho');
      return true;
    }
  };

  /* ------------------------------------------------------------------
     Un solo oyente para todo
     ------------------------------------------------------------------ */

  panel.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-hace]');
    if (!el) {
      if (!globo.hidden && !ev.target.closest('.gl')) esconder();
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();

    var clave = el.getAttribute('data-hace');
    if (REALES[clave] && REALES[clave](el)) { esconder(); return; }
    explicar(el, clave);
  });

  window.addEventListener('adeorq:language', esconder);
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') esconder();
  });
})();
