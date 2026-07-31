/* ============================================================================
   Adeorq · dash.js
   El Panel de la maqueta del hero: lo que se puede tocar.

   Es una demostracion, no la aplicacion: aqui no se abre ningun proceso ni se
   habla con nadie. Lo que hace es contar la MECANICA real, que es lo unico que
   importa de este bloque: el Capataz propone y no ejecuta nada sin tu OK, las
   cifras cambian cuando cambia el trabajo, y el Pulso mide el arbol entero.

   Sin este archivo el Panel se sigue leyendo entero: sale la seccion Ahora y
   los botones simplemente no responden.
   ========================================================================= */

(function () {
  'use strict';

  var raiz = document.documentElement;
  var dash = document.querySelector('.dash');
  if (!dash) return;

  function en() { return raiz.lang === 'en'; }

  function aviso(es, ingles, tipo) {
    if (typeof window.showToastDemo === 'function') {
      window.showToastDemo(en() ? ingles : es, tipo || 'info');
    }
  }

  function q(sel, ctx) { return (ctx || dash).querySelector(sel); }
  function todos(sel, ctx) {
    return Array.prototype.slice.call((ctx || dash).querySelectorAll(sel));
  }

  /* ------------------------------------------------------------------
     1. SECCIONES · el rail de la izquierda, igual que en la app
     ------------------------------------------------------------------ */

  function abrirSeccion(nombre) {
    todos('.dash-sec').forEach(function (b) {
      b.classList.toggle('is-activa', b.getAttribute('data-dash-sec') === nombre);
    });
    todos('.dash-hoja').forEach(function (h) {
      h.classList.toggle('is-activa', h.getAttribute('data-dash-hoja') === nombre);
    });
  }

  dash.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-dash-sec]');
    if (!btn) return;
    ev.preventDefault();
    abrirSeccion(btn.getAttribute('data-dash-sec'));
  });

  /* Las cifras y los proyectos calientes llevan a la Cabina, que es a donde
     llevan de verdad en la aplicacion. */
  dash.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-dash-goto]');
    if (!btn) return;
    ev.preventDefault();
    var destino = document.querySelector('[data-tab="' + btn.getAttribute('data-dash-goto') + '"]');
    if (destino) destino.click();
  });

  /* ------------------------------------------------------------------
     2. LAS CIFRAS
     ------------------------------------------------------------------ */

  var elVivas = q('[data-dash-vivas]');
  var elEsperan = q('[data-dash-esperan]');

  function pintarCifra(el, valor) {
    if (!el) return;
    el.textContent = String(valor);
    el.classList.remove('is-nuevo');
    void el.offsetWidth;              // reinicia la animacion
    el.classList.add('is-nuevo');
  }

  function vivas() { return parseInt(elVivas && elVivas.textContent, 10) || 0; }

  /* ------------------------------------------------------------------
     3. EL CAPATAZ · propone, y espera
     ------------------------------------------------------------------ */

  var campo = q('#dash-encargo');
  var plan = q('[data-dash-plan]');
  var filas = q('[data-dash-filas]');

  // Cada fila del plan: a que proyecto, con que programa y con que encargo.
  var PLANES = {
    frontend: [
      ['Adeorq', 'claude --role frontend', 'el formulario de pago', 'the payment form'],
      ['Adeorq', 'claude --role backend', 'la API de cobros', 'the billing API'],
      ['Adeorq', 'codex --sandbox', 'repasar lo que toquen los dos', 'review what both touch']
    ],
    css: [
      ['froede', 'claude', 'contraste y jerarquia de la landing', 'contrast and hierarchy of the landing'],
      ['froede', 'agy --mode design', 'revisar el resultado en pantalla', 'check the result on screen'],
      ['froede', 'codex --sandbox', 'que no se rompa en movil', 'make sure mobile does not break']
    ],
    defecto: [
      ['Orquio', 'claude', 'el panel de sesiones', 'the sessions panel'],
      ['Orquio', 'claude', 'los avisos del panel', 'the panel notifications'],
      ['Orquio', 'codex --sandbox', 'pruebas de lo anterior', 'tests for the above']
    ]
  };

  function elegirPlan(texto) {
    var t = (texto || '').toLowerCase();
    if (t.indexOf('front') > -1 || t.indexOf('back') > -1) return PLANES.frontend;
    if (t.indexOf('css') > -1 || t.indexOf('contrast') > -1 || t.indexOf('dise') > -1) return PLANES.css;
    return PLANES.defecto;
  }

  function pintarPlan(lista) {
    if (!filas) return;
    filas.innerHTML = '';
    lista.forEach(function (f) {
      var fila = document.createElement('div');
      fila.className = 'dash-plan__fila';
      var izq = document.createElement('code');
      izq.textContent = f[1];
      var der = document.createElement('em');
      der.textContent = f[0] + ' · ' + (en() ? f[3] : f[2]);
      fila.appendChild(izq);
      fila.appendChild(der);
      filas.appendChild(fila);
    });
  }

  todos('[data-dash-ejemplo]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      if (!campo) return;
      campo.value = chip.getAttribute('data-dash-ejemplo');
      campo.focus();
    });
  });

  var btnPlanear = q('[data-dash-planear]');
  if (btnPlanear) {
    btnPlanear.addEventListener('click', function () {
      var texto = campo && campo.value.trim();
      if (!texto) {
        aviso('Escribe qué quieres, o toca uno de los ejemplos.',
              'Type what you want, or tap one of the examples.', 'info');
        if (campo) campo.focus();
        return;
      }
      pintarPlan(elegirPlan(texto));
      if (plan) plan.hidden = false;
      aviso('El Capataz propone 3 sesiones. No abre ninguna sin tu OK.',
            'The Foreman proposes 3 sessions. It opens none without your OK.', 'info');
    });
  }

  var btnDictar = q('[data-dash-dictar]');
  if (btnDictar) {
    btnDictar.addEventListener('click', function () {
      aviso('Dictado por voz: se transcribe y se corrige antes de enviarlo.',
            'Voice dictation: transcribed and cleaned up before it is sent.', 'info');
    });
  }

  var btnLimpiar = q('[data-dash-limpiar]');
  if (btnLimpiar) {
    btnLimpiar.addEventListener('click', function () {
      if (campo) campo.value = '';
      if (plan) plan.hidden = true;
    });
  }

  var btnAprobar = q('[data-dash-aprobar]');
  if (btnAprobar) {
    btnAprobar.addEventListener('click', function () {
      pintarCifra(elVivas, vivas() + 3);
      if (plan) plan.hidden = true;
      if (campo) campo.value = '';
      aviso('Tres sesiones abiertas, cada una con su encargo dentro.',
            'Three sessions opened, each with its own brief inside.', 'ok');
      var cabina = document.querySelector('[data-tab="cabina"]');
      if (cabina) setTimeout(function () { cabina.click(); }, 700);
    });
  }

  var btnDescartar = q('[data-dash-descartar]');
  if (btnDescartar) {
    btnDescartar.addEventListener('click', function () {
      if (plan) plan.hidden = true;
      aviso('Plan descartado. No se ha abierto nada.',
            'Plan discarded. Nothing was opened.', 'info');
    });
  }

  /* ------------------------------------------------------------------
     4. PROYECTOS
     ------------------------------------------------------------------ */

  todos('[data-dash-abrir]').forEach(function (b) {
    b.addEventListener('click', function () {
      var proy = b.getAttribute('data-dash-abrir');
      pintarCifra(elVivas, vivas() + 2);
      aviso('Abriendo las sesiones de ' + proy + ', cada una donde la dejaste.',
            'Opening the sessions of ' + proy + ', each where you left it.', 'ok');
    });
  });

  todos('[data-dash-sesion]').forEach(function (b) {
    b.addEventListener('click', function () {
      var proy = b.getAttribute('data-dash-sesion');
      pintarCifra(elVivas, vivas() + 1);
      aviso('Terminal nueva en ' + proy + '.', 'New terminal in ' + proy + '.', 'ok');
    });
  });

  var btnNuevo = q('[data-dash-nuevo]');
  if (btnNuevo) {
    btnNuevo.addEventListener('click', function () {
      aviso('La carpeta nace con AGENTS.md, docs/METAS.md y git iniciado.',
            'The folder is born with AGENTS.md, docs/METAS.md and git initialised.', 'ok');
    });
  }

  /* ------------------------------------------------------------------
     5. MISION · los roles se quitan y se ponen
     ------------------------------------------------------------------ */

  var elNRoles = q('[data-dash-nroles]');

  function contarRoles() {
    var n = todos('.dash-rol.is-on').length;
    if (elNRoles) elNRoles.textContent = String(n);
    return n;
  }

  todos('[data-dash-rol]').forEach(function (rol) {
    rol.addEventListener('click', function () {
      rol.classList.toggle('is-on');
      contarRoles();
    });
  });

  var btnDesplegar = q('[data-dash-desplegar]');
  if (btnDesplegar) {
    btnDesplegar.addEventListener('click', function () {
      var n = contarRoles();
      if (!n) {
        aviso('Elige al menos un rol.', 'Pick at least one role.', 'info');
        return;
      }
      pintarCifra(elVivas, vivas() + n);
      aviso(n + ' agentes desplegados. Cada uno propone su plan y espera tu OK.',
            n + ' agents deployed. Each proposes its plan and waits for your OK.', 'ok');
      var cabina = document.querySelector('[data-tab="cabina"]');
      if (cabina) setTimeout(function () { cabina.click(); }, 700);
    });
  }

  /* ------------------------------------------------------------------
     6. PULSO · cerrar un proceso baja el total, que es la gracia
     ------------------------------------------------------------------ */

  var elTotal = q('[data-dash-total]');
  var elAgentes = q('[data-dash-agentes]');
  var caja = q('[data-dash-procs]');

  function recalcular() {
    var vivos = todos('.dash-proc', caja);
    var total = 0;
    var mayor = 1;
    vivos.forEach(function (p) {
      var mb = parseInt(p.getAttribute('data-mb'), 10) || 0;
      total += mb;
      if (mb > mayor) mayor = mb;
    });
    vivos.forEach(function (p) {
      var mb = parseInt(p.getAttribute('data-mb'), 10) || 0;
      var barra = q('.dash-proc__barra i', p);
      if (barra) barra.style.width = Math.round((mb / mayor) * 92) + '%';
      var etiqueta = q('.dash-proc__mb', p);
      if (etiqueta) etiqueta.textContent = mb + ' MB';
    });
    if (elTotal) elTotal.textContent = String(total);
    // Los agentes son los procesos que NO son la propia ventana.
    if (elAgentes) elAgentes.textContent = String(Math.max(0, vivos.length - 1));
    return total;
  }

  todos('[data-dash-matar]').forEach(function (b) {
    b.addEventListener('click', function () {
      var fila = b.closest('.dash-proc');
      if (!fila) return;
      var nombre = (q('.dash-proc__n', fila) || {}).textContent || '';
      var liberado = parseInt(fila.getAttribute('data-mb'), 10) || 0;
      fila.parentNode.removeChild(fila);
      recalcular();
      if (elVivas && vivas() > 0) pintarCifra(elVivas, vivas() - 1);
      aviso('Cerrado ' + nombre.split(' ')[0] + ': ' + liberado + ' MB libres.',
            'Closed ' + nombre.split(' ')[0] + ': ' + liberado + ' MB freed.', 'ok');
    });
  });

  /* ------------------------------------------------------------------
     7. ACTUALIZAR · el dato se relee, y se nota
     ------------------------------------------------------------------ */

  var btnRefresh = q('[data-dash-refresh]');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', function () {
      todos('.dash-proc').forEach(function (p) {
        var mb = parseInt(p.getAttribute('data-mb'), 10) || 0;
        // Un vaiven pequeno: la memoria de un agente respira, no salta.
        var nuevo = Math.max(40, Math.round(mb * (0.92 + (mb % 7) / 50)));
        p.setAttribute('data-mb', String(nuevo));
      });
      recalcular();
      pintarCifra(elVivas, vivas());
      pintarCifra(elEsperan, parseInt(elEsperan && elEsperan.textContent, 10) || 0);
      aviso('Datos releídos del equipo.', 'Data read again from the machine.', 'info');
    });
  }

  /* Estado inicial coherente: el total y las barras salen de los datos, no de
     numeros escritos a mano que se despistan al tocar una fila. */
  recalcular();
  contarRoles();
})();
