/* ============================================================================
   Adeorq · hero.js
   Movimiento del hero: scroll suave, reveals al entrar en viewport y la maqueta
   del panel reaccionando al raton y al scroll.

   Politica de movimiento de la casa:
     · el dial --motion-gain multiplica RECORRIDO, nunca opacidad;
     · el movimiento que dirige el usuario (tilt con el puntero, luz que lo
       sigue) NO se escala: el oido interno no protesta por lo que uno provoca;
     · el movimiento no solicitado (parallax de scroll, deriva del panel) SI.
   Todo se anima en transform/opacity. Una sola rAF para toda la seccion.
   ========================================================================= */

(function () {
  'use strict';

  var raiz = document.documentElement;

  var GAIN = leerGain();
  function leerGain() {
    return parseFloat(getComputedStyle(raiz).getPropertyValue('--motion-gain')) || 0;
  }

  /* ------------------------------------------------------------------
     1. SCROLL SUAVE (cimiento)
     Lenis si esta disponible. Si el CDN no llega, el fallback es
     scroll-behavior: smooth, ya puesto en base.css: la pagina nunca
     depende de una libreria remota para poder navegarse.
     Con el dial a 0 no se instala: quien pide quietud no espera inercia.
     ------------------------------------------------------------------ */

  var lenis = null;
  var ticVivo = false;

  var esperandoLenis = false;

  function montarLenis() {
    if (lenis || GAIN === 0) return;
    if (typeof window.Lenis !== 'function') {
      // Puede que su <script> aun no haya corrido (el orden lo puede cambiar el
      // empaquetador). Se reintenta una sola vez al terminar la carga; si sigue
      // sin estar, mandan el scroll nativo y scroll-behavior: smooth.
      if (!esperandoLenis) {
        esperandoLenis = true;
        window.addEventListener('load', function () { montarLenis(); }, { once: true });
      }
      return;
    }
    lenis = new window.Lenis({
      lerp: 0.1,
      wheelMultiplier: 1,
      smoothWheel: true,
      autoRaf: false
    });
    document.addEventListener('click', anclas, true);
    if (!ticVivo) { ticVivo = true; requestAnimationFrame(tic); }
  }

  // rAF propio de Lenis; solo existe mientras Lenis exista.
  function tic(t) {
    if (!lenis) { ticVivo = false; return; }
    lenis.raf(t);
    requestAnimationFrame(tic);
  }

  function anclas(ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="#"]');
    if (!a || !lenis) return;
    var id = a.getAttribute('href');
    if (id.length < 2) return;
    var destino = document.querySelector(id);
    if (!destino) return;                       // lo montara otro agente: no rompemos el enlace
    ev.preventDefault();
    lenis.scrollTo(destino, { offset: -84 });
    history.replaceState(null, '', id);
  }

  function tumbarLenis() {
    if (!lenis) return;
    lenis.destroy();
    lenis = null;
    document.removeEventListener('click', anclas, true);
  }

  montarLenis();

  /* ------------------------------------------------------------------
     2. REVEALS
     El recorrido lo pone el CSS multiplicado por el dial; aqui solo se
     reparte el retardo. Con cinturon de seguridad: ningun contenido
     puede quedarse invisible por culpa de un observer mudo.
     ------------------------------------------------------------------ */

  var porRevelar = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));

  document.querySelectorAll('[data-reveal-grupo]').forEach(function (grupo) {
    grupo.querySelectorAll('[data-reveal]').forEach(function (n, i) {
      n.style.setProperty('--retardo', (i * 90) + 'ms');
    });
  });

  function revelar(n) { n.classList.add('is-dentro'); }

  if ('IntersectionObserver' in window && window.innerHeight > 0) {
    var io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        revelar(e.target);
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    porRevelar.forEach(function (n) { io.observe(n); });
  } else {
    porRevelar.forEach(revelar);
  }

  // Watchdog: en pestanas en segundo plano o webviews sin dimensionar, un IO
  // puede no disparar nunca. A los 400 ms del load, lo que ya este a la vista
  // se revela a mano.
  window.addEventListener('load', function () {
    setTimeout(function () {
      porRevelar.forEach(function (n) {
        if (n.classList.contains('is-dentro')) return;
        var r = n.getBoundingClientRect();
        if (window.innerHeight === 0 || r.top < window.innerHeight + 80) revelar(n);
      });
    }, 400);
  });

  /* ------------------------------------------------------------------
     3. LA ESCENA: raton + scroll
     ------------------------------------------------------------------ */

  var hero    = document.getElementById('hero');
  var escena  = document.getElementById('escena');
  var panel   = document.getElementById('panel-demo');
  var capas   = hero ? Array.prototype.slice.call(hero.querySelectorAll('[data-speed]')) : [];
  var profund = panel ? Array.prototype.slice.call(panel.querySelectorAll('[data-z]')) : [];

  if (!hero || !panel) return;

  var punteroFino = matchMedia('(hover: hover) and (pointer: fine)').matches;

  var destino = { x: 0, y: 0 };   // -1..1, lo dirige el raton
  var actual  = { x: 0, y: 0 };
  var scrollY = window.scrollY;
  var altoHero = hero.offsetHeight || window.innerHeight;
  var vivo = true;
  var quieto = 0;

  function medir() { altoHero = hero.offsetHeight || window.innerHeight; }
  window.addEventListener('resize', medir, { passive: true });

  if (punteroFino) {
    hero.addEventListener('pointermove', function (ev) {
      var r = escena.getBoundingClientRect();
      destino.x = Math.max(-1, Math.min(1, (ev.clientX - (r.left + r.width / 2)) / (r.width / 2)));
      destino.y = Math.max(-1, Math.min(1, (ev.clientY - (r.top + r.height / 2)) / (r.height / 2)));
      quieto = 0;
    }, { passive: true });

    hero.addEventListener('pointerleave', function () {
      destino.x = 0; destino.y = 0;
    }, { passive: true });
  }

  window.addEventListener('scroll', function () { scrollY = window.scrollY; quieto = 0; }, { passive: true });

  var TILT = 4.6;        // grados, movimiento del usuario: NO se escala por el dial
  var FLOTE = 8;         // px de parallax interno entre capas del panel

  function pintar() {
    if (!vivo) return;

    // lerp hacia el objetivo del puntero: nunca un salto, siempre interrumpible
    actual.x += (destino.x - actual.x) * 0.085;
    actual.y += (destino.y - actual.y) * 0.085;

    var p = Math.max(0, Math.min(1, scrollY / Math.max(altoHero, 1)));

    // deriva por scroll: el panel llega inclinado y se endereza al bajar (dial SI)
    var rotScroll = (3.6 * (1 - p)) * GAIN;
    var subida    = (-44 * p) * GAIN;
    var escala    = 1 - 0.03 * p * GAIN;

    var rotX = rotScroll + (-actual.y * TILT);
    var rotY = actual.x * TILT;

    panel.style.transform =
      'translate3d(0,' + subida.toFixed(2) + 'px,0) ' +
      'scale(' + escala.toFixed(4) + ') ' +
      'rotateX(' + rotX.toFixed(3) + 'deg) rotateY(' + rotY.toFixed(3) + 'deg)';

    // el brillo de cristal sigue al puntero (movimiento del usuario, sin dial)
    panel.style.setProperty('--luz-x', (50 + actual.x * 34).toFixed(1) + '%');
    panel.style.setProperty('--luz-y', (12 + actual.y * 26).toFixed(1) + '%');

    // capas internas: parallax corto para que el panel tenga fondo y frente
    for (var i = 0; i < profund.length; i++) {
      var f = (parseFloat(profund[i].dataset.z) || 0) / 100;
      profund[i].style.transform =
        'translate3d(' + (-actual.x * FLOTE * f).toFixed(2) + 'px,' +
                         (-actual.y * FLOTE * f * 0.6).toFixed(2) + 'px,0)';
    }

    // telon: parallax de scroll puro, movimiento no solicitado (dial SI)
    for (var j = 0; j < capas.length; j++) {
      var v = parseFloat(capas[j].dataset.speed) || 0;
      capas[j].style.transform = 'translate3d(0,' + (scrollY * v * GAIN).toFixed(2) + 'px,0)';
    }

    // si nada se mueve, dormimos el bucle en vez de quemar frames
    quieto++;
    var enReposo = Math.abs(destino.x - actual.x) < 0.0015 &&
                   Math.abs(destino.y - actual.y) < 0.0015 && quieto > 90;
    if (enReposo) { vivo = false; return; }

    requestAnimationFrame(pintar);
  }

  function despertar() {
    if (vivo) return;
    vivo = true; quieto = 0;
    requestAnimationFrame(pintar);
  }
  window.addEventListener('pointermove', despertar, { passive: true });
  window.addEventListener('scroll', despertar, { passive: true });
  window.addEventListener('resize', despertar, { passive: true });

  requestAnimationFrame(pintar);

  /* ------------------------------------------------------------------
     4. La valvula del nav cambia el dial en caliente
     ------------------------------------------------------------------ */

  window.addEventListener('adeorq:motion', function (ev) {
    GAIN = (ev.detail && typeof ev.detail.gain === 'number') ? ev.detail.gain : leerGain();
    if (GAIN === 0) tumbarLenis(); else montarLenis();
    medir();
    despertar();
  });

  // El tema lo lleva CSS, pero un cambio de tema del sistema puede mover el
  // layout (tipografia de los controles nativos): remedimos y repintamos.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    medir(); despertar();
  });

  /* ------------------------------------------------------------------
     5. DEMO INTERACTIVA NATIVA 1:1 DE ADEORQ EN EL HERO
     ------------------------------------------------------------------ */
  var panelDemo = document.getElementById('panel-demo');

  // Pestañas principales de navegación TopBar
  var demoTabs = document.querySelectorAll('#hero-demo-tabs .demo-tab');
  demoTabs.forEach(function (btn) {
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      demoTabs.forEach(function (b) { b.classList.remove('is-activa'); });
      btn.classList.add('is-activa');

      var target = btn.dataset.tab;
      document.querySelectorAll('.demo-view').forEach(function (v) {
        v.classList.remove('is-activa');
      });
      var targetView = document.getElementById('demo-view-' + target);
      if (targetView) targetView.classList.add('is-activa');

      if (target === 'guia') {
        var docsSection = document.getElementById('guia-docs');
        if (docsSection) {
          docsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (typeof showToast === 'function') showToast('📖 Abriendo Guía & Documentación Oficial del ADE...', 'info');
        }
      }
    });
  });

  // Selector de Presets de Cuadrícula (1x1, 2x2, 1x2)
  var layoutBtns = document.querySelectorAll('.demo-layout-picker .demo-btn-layout');
  var mosaicGrid = document.getElementById('demo-mosaic');
  if (layoutBtns.length && mosaicGrid) {
    layoutBtns.forEach(function (b) {
      b.addEventListener('click', function (ev) {
        ev.preventDefault();
        layoutBtns.forEach(function (btn) { btn.classList.remove('is-activo'); });
        b.classList.add('is-activo');
        document.querySelectorAll('.demo-pane').forEach(function(p) { p.classList.remove('is-maximized'); });
        mosaicGrid.classList.remove('has-maximized');
        var g = b.dataset.grid;
        if (g === '1x1') {
          mosaicGrid.style.gridTemplateColumns = '1fr';
          mosaicGrid.style.gridTemplateRows = '1fr';
        } else if (g === '1x2') {
          mosaicGrid.style.gridTemplateColumns = '1fr 2fr';
          mosaicGrid.style.gridTemplateRows = '1fr';
        } else {
          mosaicGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
          mosaicGrid.style.gridTemplateRows = 'repeat(2, 1fr)';
        }
      });
    });
  }

  // Selección y filtro de Workspaces en Sidebar
  var activeWsName = 'Adeorq';
  document.querySelectorAll('.demo-ws-item').forEach(function (ws) {
    ws.addEventListener('click', function (ev) {
      if (ev.target.closest('.demo-ws-session') || ev.target.closest('.demo-ws-hover-btn')) return;
      ev.preventDefault();
      document.querySelectorAll('.demo-ws-item').forEach(function (w) { w.classList.remove('is-activo'); });
      ws.classList.add('is-activo');
      activeWsName = ws.dataset.ws || 'Adeorq';
    });
  });

  var inputSearch = document.getElementById('demo-search-input');
  if (inputSearch) {
    inputSearch.addEventListener('input', function () {
      var val = inputSearch.value.toLowerCase().trim();
      document.querySelectorAll('.demo-ws-item').forEach(function (w) {
        var name = (w.dataset.ws || '').toLowerCase();
        if (!val || name.indexOf(val) !== -1) {
          w.style.display = 'block';
        } else {
          w.style.display = 'none';
        }
      });
    });
  }

  // Interacción de Escritura y Comandos en las 4 Terminales
  function setupTerminalInput(inputId) {
    var input = document.querySelector('.demo-term-input[data-pane-id="' + inputId + '"]');
    var termOut = document.getElementById('demo-term-out-' + inputId);
    var pane = document.getElementById('demo-pane-' + inputId);
    if (!input || !termOut) return;

    // Enfoque visual al hacer clic en el pane
    if (pane) {
      pane.addEventListener('click', function () {
        document.querySelectorAll('.demo-pane').forEach(function (p) { p.classList.remove('is-focused'); });
        pane.classList.add('is-focused');
      });
    }

    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        var cmd = input.value.trim();
        if (!cmd) return;
        input.value = '';

        var cursor = termOut.querySelector('.l--cursor');
        var promptLine = document.createElement('span');
        promptLine.className = 'l l--prompt';
        promptLine.textContent = 'PS C:\\proyectos\\' + activeWsName + '> ' + cmd;
        if (cursor) termOut.insertBefore(promptLine, cursor); else termOut.appendChild(promptLine);

        // Respuestas de terminal realistas (multilingüe)
        setTimeout(function () {
          var isEn = document.documentElement.lang === 'en';
          var resLine = document.createElement('span');
          var lower = cmd.toLowerCase();

          if (lower.indexOf('cargo check') !== -1) {
            resLine.className = 'l l--ok';
            resLine.textContent = '✓ Finished dev profile [unoptimized + debuginfo] in 0.18s';
          } else if (lower.indexOf('git') !== -1) {
            resLine.className = 'l l--dim';
            resLine.textContent = isEn ? 'On branch main · Your branch is up to date with \'origin/main\'.' : 'En rama main · Tu rama está actualizada con \'origin/main\'.';
          } else if (lower.indexOf('pnpm') !== -1 || lower.indexOf('npm') !== -1) {
            resLine.className = 'l l--ok';
            resLine.textContent = isEn ? '✓ Built client environment in 240ms. Ready.' : '✓ Entorno cliente compilado en 240ms. Listo.';
          } else if (lower.indexOf('claude') !== -1) {
            resLine.className = 'l l--ok';
            resLine.textContent = isEn ? '⏺ [Claude Code] Connected to ' + activeWsName + ' (Opus 5 high). What do you want to build?' : '⏺ [Claude Code] Conectado a ' + activeWsName + ' (Opus 5 high). ¿Qué quieres construir?';
            if (pane) pane.classList.add('pane--listo');
          } else {
            resLine.className = 'l';
            resLine.textContent = isEn ? '⏺ [' + activeWsName + '] Running background agent task...' : '⏺ [' + activeWsName + '] Ejecutando tarea agéntica en segundo plano...';
            if (pane) pane.classList.add('pane--listo');
          }

          if (cursor) termOut.insertBefore(resLine, cursor); else termOut.appendChild(resLine);
          var termBody = termOut.closest('.demo-term-body');
          if (termBody) termBody.scrollTop = termBody.scrollHeight;
        }, 250);
      }
    });
  }

  [1, 2, 3, 4].forEach(setupTerminalInput);

  // Botón Turno OK y cargo check
  var btnTurn = document.getElementById('demo-btn-turn');
  var pane1 = document.getElementById('demo-pane-1');
  var termOut1 = document.getElementById('demo-term-out-1');
  if (btnTurn && pane1 && termOut1) {
    btnTurn.addEventListener('click', function (ev) {
      ev.preventDefault();
      var isEn = document.documentElement.lang === 'en';
      var esListo = pane1.classList.toggle('pane--listo');
      var cursor = termOut1.querySelector('.l--cursor');
      var n = document.createElement('span');
      if (esListo) {
        btnTurn.textContent = isEn ? '🔔 Turn OK' : '🔔 Turno OK';
        n.className = 'l l--ok';
        n.textContent = isEn ? '✓ [agent] ' + new Date().toLocaleTimeString() + ' · Changes verified (0 errors)' : '✓ [agente] ' + new Date().toLocaleTimeString() + ' · Cambios validados (0 errores)';
      } else {
        btnTurn.textContent = isEn ? '⏺ Working' : '⏺ Trabajando';
        n.className = 'l l--dim';
        n.textContent = isEn ? '⏺ Agent running security subagent...' : '⏺ Agente ejecutando subagente de seguridad...';
      }
      if (cursor) termOut1.insertBefore(n, cursor); else termOut1.appendChild(n);
    });
  }

  var btnCheck = document.getElementById('demo-btn-check');
  var termOut2 = document.getElementById('demo-term-out-2');
  if (btnCheck && termOut2) {
    btnCheck.addEventListener('click', function (ev) {
      ev.preventDefault();
      var cursor = termOut2.querySelector('.l--cursor');
      var c = document.createElement('span');
      c.className = 'l l--ok';
      c.textContent = '✓ cargo check --manifest-path src-tauri/Cargo.toml ok (0.18s)';
      if (cursor) termOut2.insertBefore(c, cursor); else termOut2.appendChild(c);
    });
  }

  // ------------------------------------------------------------------
  // 6. MOTOR DE LIENZO (DIBUJO MULTI-HERRAMIENTA, WIDGETS, DRAG)
  // ------------------------------------------------------------------
  var canvasBoard = document.getElementById('demo-canvas-board');
  var paintCanvas = document.getElementById('demo-paint-canvas');
  var btnDrawClear = document.getElementById('demo-btn-draw-clear');
  var ctx = paintCanvas ? paintCanvas.getContext('2d') : null;

  var drawTool = 'sel'; // sel | lapiz | flecha | linea | caja | elipse | goma
  var isPainting = false;
  var strokeColor = '#ff6b6b';
  var strokeWidth = 2;
  var paintStart = null;

  function initCanvasDimensions() {
    if (!paintCanvas || !canvasBoard) return;
    var r = canvasBoard.getBoundingClientRect();
    paintCanvas.width = r.width;
    paintCanvas.height = r.height;
  }

  function applyCtx() {
    if (!ctx) return;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  if (paintCanvas && canvasBoard && ctx) {
    initCanvasDimensions();
    applyCtx();
    window.addEventListener('resize', initCanvasDimensions, { passive: true });

    // Barra de herramientas de dibujo
    document.querySelectorAll('#demo-draw-toolbar .demo-draw-tool[data-draw]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        drawTool = btn.dataset.draw;
        document.querySelectorAll('#demo-draw-toolbar .demo-draw-tool[data-draw]').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        var isDrawing = drawTool !== 'sel';
        canvasBoard.classList.toggle('is-drawing', isDrawing);
        paintCanvas.style.pointerEvents = isDrawing ? 'auto' : 'none';
      });
    });

    // Selector de color
    document.querySelectorAll('#demo-draw-palette .demo-color-chip').forEach(function (chip) {
      chip.addEventListener('click', function (ev) {
        ev.preventDefault();
        document.querySelectorAll('#demo-draw-palette .demo-color-chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        strokeColor = chip.dataset.color || '#ff6b6b';
        applyCtx();
      });
    });

    // Selector de grosor
    document.querySelectorAll('.demo-draw-width').forEach(function (w) {
      w.addEventListener('click', function (ev) {
        ev.preventDefault();
        document.querySelectorAll('.demo-draw-width').forEach(function (x) { x.classList.remove('is-active'); });
        w.classList.add('is-active');
        strokeWidth = parseInt(w.dataset.w) || 2;
        applyCtx();
      });
    });

    if (btnDrawClear) {
      btnDrawClear.addEventListener('click', function (ev) {
        ev.preventDefault();
        ctx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
        showToast('🧽 Lienzo limpio', 'info');
      });
    }

    function getPos(e) {
      var r = paintCanvas.getBoundingClientRect();
      var x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      var y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
      return { x: x, y: y };
    }

    function startPaint(e) {
      if (drawTool === 'sel') return;
      isPainting = true;
      paintStart = getPos(e);
      applyCtx();
      if (drawTool === 'lapiz') {
        ctx.beginPath();
        ctx.moveTo(paintStart.x, paintStart.y);
      }
    }

    function movePaint(e) {
      if (!isPainting) return;
      e.preventDefault();
      var p = getPos(e);
      if (drawTool === 'lapiz') {
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else if (drawTool === 'goma') {
        ctx.clearRect(p.x - 12, p.y - 12, 24, 24);
      }
    }

    function stopPaint(e) {
      if (!isPainting || !paintStart) { isPainting = false; return; }
      isPainting = false;
      if (drawTool === 'lapiz') { ctx.closePath(); return; }
      var p = getPos(e || { clientX: 0, clientY: 0 });
      if (!e || !e.clientX) { return; }
      var r = paintCanvas.getBoundingClientRect();
      p = { x: (e.clientX || 0) - r.left, y: (e.clientY || 0) - r.top };
      applyCtx();
      ctx.beginPath();
      if (drawTool === 'linea') {
        ctx.moveTo(paintStart.x, paintStart.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else if (drawTool === 'flecha') {
        ctx.moveTo(paintStart.x, paintStart.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        // Punta de flecha
        var angle = Math.atan2(p.y - paintStart.y, p.x - paintStart.x);
        var hl = 12;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - hl * Math.cos(angle - 0.4), p.y - hl * Math.sin(angle - 0.4));
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - hl * Math.cos(angle + 0.4), p.y - hl * Math.sin(angle + 0.4));
        ctx.stroke();
      } else if (drawTool === 'caja') {
        ctx.strokeRect(paintStart.x, paintStart.y, p.x - paintStart.x, p.y - paintStart.y);
      } else if (drawTool === 'elipse') {
        var cx = (paintStart.x + p.x) / 2;
        var cy = (paintStart.y + p.y) / 2;
        var rx = Math.abs(p.x - paintStart.x) / 2;
        var ry = Math.abs(p.y - paintStart.y) / 2;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        ctx.stroke();
      }
      ctx.closePath();
    }

    paintCanvas.addEventListener('mousedown', startPaint);
    paintCanvas.addEventListener('mousemove', movePaint);
    paintCanvas.addEventListener('mouseup', stopPaint);
    paintCanvas.addEventListener('touchstart', startPaint, { passive: false });
    paintCanvas.addEventListener('touchmove', movePaint, { passive: false });
    window.addEventListener('touchend', stopPaint);
  }

  // ------------------------------------------------------------------
  // MOTOR DE PAN LIBRE INFINITO & ZOOM 2D (REACT FLOW ENGINE)
  // ------------------------------------------------------------------
  window.canvasZoomDemo = 1.0;
  window.canvasPanX = 0;
  window.canvasPanY = 0;

  function updateCanvasViewport() {
    var vp = document.getElementById('demo-canvas-viewport');
    var board = document.getElementById('demo-canvas-board');
    var lbl = document.getElementById('demo-flow-zoom-label');
    if (vp) {
      vp.style.transform = 'translate(' + window.canvasPanX + 'px, ' + window.canvasPanY + 'px) scale(' + window.canvasZoomDemo + ')';
    }
    if (board) {
      board.style.backgroundPosition = window.canvasPanX + 'px ' + window.canvasPanY + 'px';
      var bgSize = (22 * window.canvasZoomDemo);
      board.style.backgroundSize = bgSize + 'px ' + bgSize + 'px';
    }
    if (lbl) {
      lbl.textContent = Math.round(window.canvasZoomDemo * 100) + '%';
    }
  }

  window.zoomCanvasDemo = function(delta) {
    window.canvasZoomDemo = Math.max(0.4, Math.min(2.5, window.canvasZoomDemo + delta));
    updateCanvasViewport();
    if (typeof showToast === 'function') showToast('🔍 Zoom React Flow: ' + Math.round(window.canvasZoomDemo * 100) + '%', 'info');
  };

  window.resetZoomCanvasDemo = function() {
    window.canvasZoomDemo = 1.0;
    window.canvasPanX = 0;
    window.canvasPanY = 0;
    updateCanvasViewport();
    if (typeof showToast === 'function') showToast('⛶ Vista del Grafo ajustada 1:1 (Fit View)', 'ok');
  };

  var boardEl = document.getElementById('demo-canvas-board');
  if (boardEl) {
    boardEl.addEventListener('wheel', function(ev) {
      if (drawTool === 'sel') {
        ev.preventDefault();
        var dz = ev.deltaY < 0 ? 0.1 : -0.1;
        window.canvasZoomDemo = Math.max(0.4, Math.min(2.5, window.canvasZoomDemo + dz));
        updateCanvasViewport();
      }
    }, { passive: false });

    boardEl.addEventListener('mousedown', function(e) {
      if (drawTool !== 'sel') return;
      if (e.target.closest('.demo-cnode') || e.target.closest('.demo-flow-minimap') || e.target.closest('button') || e.target.closest('input')) return;
      e.preventDefault();
      boardEl.classList.add('is-panning');
      var startPX = e.clientX - window.canvasPanX;
      var startPY = e.clientY - window.canvasPanY;

      function panMove(ev) {
        window.canvasPanX = ev.clientX - startPX;
        window.canvasPanY = ev.clientY - startPY;
        updateCanvasViewport();
      }
      function panUp() {
        boardEl.classList.remove('is-panning');
        window.removeEventListener('mousemove', panMove);
        window.removeEventListener('mouseup', panUp);
      }
      window.addEventListener('mousemove', panMove);
      window.addEventListener('mouseup', panUp);
    });
  }

  // Nodos Arrastrables (Sin restricciones de borde para movimiento verdaderamente libre en lienzo infinito)
  function makeDraggable(nodeEl) {
    if (!nodeEl) return;
    var handle = nodeEl.querySelector('.demo-cnode-drag-handle') || nodeEl;
    handle.addEventListener('mousedown', function (e) {
      if (drawTool !== 'sel') return;
      e.preventDefault();
      e.stopPropagation();
      var sx = e.clientX, sy = e.clientY;
      var il = parseFloat(nodeEl.style.left) || nodeEl.offsetLeft;
      var it = parseFloat(nodeEl.style.top) || nodeEl.offsetTop;
      nodeEl.classList.add('is-dragging');
      function mv(ev) {
        var zoom = window.canvasZoomDemo || 1.0;
        nodeEl.style.left = (il + (ev.clientX - sx) / zoom) + 'px';
        nodeEl.style.top = (it + (ev.clientY - sy) / zoom) + 'px';
      }
      function up() {
        nodeEl.classList.remove('is-dragging');
        window.removeEventListener('mousemove', mv);
        window.removeEventListener('mouseup', up);
      }
      window.addEventListener('mousemove', mv);
      window.addEventListener('mouseup', up);
    });
  }

  document.querySelectorAll('.demo-draggable').forEach(makeDraggable);

  // Widget Pomodoro Interactivo
  var pomoTimer = document.getElementById('demo-pomo-display');
  var btnPomoStart = document.getElementById('demo-pomo-start');
  var btnPomoReset = document.getElementById('demo-pomo-reset');
  var pomoSeconds = 1500;
  var pomoInterval = null;

  function formatTime(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  if (btnPomoStart && pomoTimer) {
    btnPomoStart.addEventListener('click', function (ev) {
      ev.preventDefault();
      var isEn = document.documentElement.lang === 'en';
      if (pomoInterval) {
        clearInterval(pomoInterval); pomoInterval = null;
        btnPomoStart.textContent = isEn ? '▶ Start' : '▶ Iniciar';
      } else {
        btnPomoStart.textContent = isEn ? '⏸ Pause' : '⏸ Pausa';
        pomoInterval = setInterval(function () {
          if (pomoSeconds > 0) { pomoSeconds--; pomoTimer.textContent = formatTime(pomoSeconds); }
          else { clearInterval(pomoInterval); pomoInterval = null; btnPomoStart.textContent = isEn ? '▶ Start' : '▶ Iniciar'; showToast('🍅 ¡Pomodoro terminado!', 'ok'); }
        }, 1000);
      }
    });
  }
  if (btnPomoReset && pomoTimer) {
    btnPomoReset.addEventListener('click', function (ev) {
      ev.preventDefault();
      if (pomoInterval) { clearInterval(pomoInterval); pomoInterval = null; }
      pomoSeconds = 1500;
      pomoTimer.textContent = formatTime(pomoSeconds);
      if (btnPomoStart) btnPomoStart.textContent = document.documentElement.lang === 'en' ? '▶ Start' : '▶ Iniciar';
    });
  }

  // ------------------------------------------------------------------
  // 7. CALCULADORA FUNCIONAL (como CanvasWidgets calc real)
  // ------------------------------------------------------------------
  var calcExpr = document.getElementById('demo-calc-expr');
  var calcPreview = document.getElementById('demo-calc-preview');
  var calcPad = document.getElementById('demo-calc-pad');
  var calcState = '';

  function calcEval(s) {
    var tok = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').match(/(\d+\.?\d*|[+\-*/])/g);
    if (!tok || tok.length === 0) return '';
    var nums = [], ops = [];
    for (var i = 0; i < tok.length; i++) {
      if (/^[+\-*/]$/.test(tok[i])) ops.push(tok[i]); else nums.push(parseFloat(tok[i]));
    }
    if (nums.length !== ops.length + 1) return '';
    for (var j = 0; j < ops.length;) {
      if (ops[j] === '*' || ops[j] === '/') {
        var r = ops[j] === '*' ? nums[j] * nums[j + 1] : nums[j] / nums[j + 1];
        nums.splice(j, 2, r); ops.splice(j, 1);
      } else j++;
    }
    var out = nums[0];
    for (var k = 0; k < ops.length; k++) out = ops[k] === '+' ? out + nums[k + 1] : out - nums[k + 1];
    if (!isFinite(out)) return '∞';
    return String(Math.round(out * 1e10) / 1e10);
  }

  if (calcPad && calcExpr) {
    calcPad.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.demo-calc-key');
      if (!btn) return;
      ev.preventDefault();
      var k = btn.textContent.trim();
      if (k === '=') { var r = calcEval(calcState); calcState = r; }
      else if (k === 'C') { calcState = ''; }
      else if (k === '⌫') { calcState = calcState.slice(0, -1); }
      else { calcState += k; }
      calcExpr.textContent = calcState || '0';
      if (calcPreview) {
        var prev = calcState ? calcEval(calcState) : '';
        calcPreview.textContent = prev && prev !== calcState ? '= ' + prev : '';
      }
    });
  }

  // ------------------------------------------------------------------
  // 8. CRONÓMETRO FUNCIONAL (como CanvasWidgets crono real)
  // ------------------------------------------------------------------
  var cronoDisplay = document.getElementById('demo-crono-display');
  var btnCronoStart = document.getElementById('demo-crono-start');
  var btnCronoLap = document.getElementById('demo-crono-lap');
  var btnCronoReset = document.getElementById('demo-crono-reset');
  var cronoLapsEl = document.getElementById('demo-crono-laps');
  var cronoSince = null, cronoAccum = 0, cronoRaf = null, cronoLaps = [];

  function cronoMs() { return cronoAccum + (cronoSince !== null ? Date.now() - cronoSince : 0); }
  function cronoPaint() {
    if (!cronoDisplay) return;
    var ms = cronoMs();
    var sec = Math.floor(ms / 1000);
    var cent = Math.floor((ms % 1000) / 10);
    cronoDisplay.innerHTML = formatTime(sec) + '<em>' + (cent < 10 ? '0' : '') + cent + '</em>';
    if (cronoSince !== null) cronoRaf = requestAnimationFrame(cronoPaint);
  }

  if (btnCronoStart && cronoDisplay) {
    btnCronoStart.addEventListener('click', function (ev) {
      ev.preventDefault();
      var isEn = document.documentElement.lang === 'en';
      if (cronoSince !== null) {
        cronoAccum += Date.now() - cronoSince; cronoSince = null;
        if (cronoRaf) cancelAnimationFrame(cronoRaf);
        btnCronoStart.textContent = isEn ? '▶ Start' : '▶ Empezar';
      } else {
        cronoSince = Date.now();
        btnCronoStart.textContent = isEn ? '⏸ Pause' : '⏸ Pausa';
        cronoRaf = requestAnimationFrame(cronoPaint);
      }
    });
  }
  if (btnCronoLap && cronoLapsEl) {
    btnCronoLap.addEventListener('click', function (ev) {
      ev.preventDefault();
      if (cronoSince === null) return;
      var ms = cronoMs();
      cronoLaps.unshift(ms);
      if (cronoLaps.length > 8) cronoLaps.pop();
      var html = '';
      for (var i = 0; i < cronoLaps.length; i++) {
        html += '<li><span>' + (cronoLaps.length - i) + '</span><span>' + formatTime(Math.floor(cronoLaps[i] / 1000)) + '</span></li>';
      }
      cronoLapsEl.innerHTML = html;
    });
  }
  if (btnCronoReset && cronoDisplay) {
    btnCronoReset.addEventListener('click', function (ev) {
      ev.preventDefault();
      cronoSince = null; cronoAccum = 0; cronoLaps = [];
      if (cronoRaf) cancelAnimationFrame(cronoRaf);
      cronoDisplay.innerHTML = '00:00<em>00</em>';
      if (cronoLapsEl) cronoLapsEl.innerHTML = '';
      if (btnCronoStart) btnCronoStart.textContent = document.documentElement.lang === 'en' ? '▶ Start' : '▶ Empezar';
    });
  }

  // ------------------------------------------------------------------
  // 9. SIDEBAR: EXPANSIÓN, BÚSQUEDA, MENÚ CONTEXTUAL
  // ------------------------------------------------------------------
  document.querySelectorAll('.demo-ws-head').forEach(function (head) {
    head.addEventListener('click', function (ev) {
      if (ev.target.closest('.demo-ws-hover-btn')) return;
      var item = head.closest('.demo-ws-item');
      if (item) item.classList.toggle('is-expanded');
    });
  });

  // Menú contextual al clic derecho sobre proyectos
  var ctxMenu = document.getElementById('demo-ctx-menu');
  document.querySelectorAll('.demo-ws-item').forEach(function (item) {
    item.addEventListener('contextmenu', function (ev) {
      ev.preventDefault();
      if (!ctxMenu) return;
      var isEn = document.documentElement.lang === 'en';
      var name = (item.querySelector('.demo-ws-name') || {}).textContent || '';
      ctxMenu.innerHTML =
        '<button class="demo-ctx-item">✦ ' + (isEn ? 'New Claude session' : 'Nueva sesión Claude') + '</button>' +
        '<button class="demo-ctx-item">❯_ ' + (isEn ? 'New Shell' : 'Nueva Shell') + '</button>' +
        '<button class="demo-ctx-item">AG ' + (isEn ? 'New Antigravity' : 'Nuevo Antigravity') + '</button>' +
        '<div class="demo-ctx-sep"></div>' +
        '<button class="demo-ctx-item">📋 ' + (isEn ? 'Open all sessions' : 'Abrir todas las sesiones') + '</button>' +
        '<button class="demo-ctx-item">🏷 ' + (isEn ? 'Rename ' : 'Renombrar ') + name + '</button>' +
        '<button class="demo-ctx-item">🖼 ' + (isEn ? 'Change logo' : 'Cambiar logo') + '</button>' +
        '<div class="demo-ctx-sep"></div>' +
        '<button class="demo-ctx-item demo-ctx-item--danger">🗑 ' + (isEn ? 'Archive project' : 'Archivar proyecto') + '</button>';
      ctxMenu.style.display = 'block';
      ctxMenu.style.left = ev.clientX + 'px';
      ctxMenu.style.top = ev.clientY + 'px';
      // Cerrar al hacer clic en cualquier item del menú
      ctxMenu.querySelectorAll('.demo-ctx-item').forEach(function (it) {
        it.addEventListener('click', function () {
          ctxMenu.style.display = 'none';
          showToast('✓ Acción simulada', 'info');
        }, { once: true });
      });
    });
  });

  // Menú contextual sobre paneles de terminal
  document.querySelectorAll('.demo-pane').forEach(function (pane) {
    pane.addEventListener('contextmenu', function (ev) {
      ev.preventDefault();
      if (!ctxMenu) return;
      var isEn = document.documentElement.lang === 'en';
      ctxMenu.innerHTML =
        '<button class="demo-ctx-item" data-action="max">⤢ ' + (isEn ? 'Maximize pane' : 'Maximizar panel') + '</button>' +
        '<button class="demo-ctx-item">↔ ' + (isEn ? 'Split Right' : 'Dividir →') + '</button>' +
        '<button class="demo-ctx-item">↕ ' + (isEn ? 'Split Down' : 'Dividir ↓') + '</button>' +
        '<div class="demo-ctx-sep"></div>' +
        '<button class="demo-ctx-item">👁 ' + (isEn ? 'Toggle blur' : 'Alternar desenfoque') + '</button>' +
        '<button class="demo-ctx-item">📋 ' + (isEn ? 'Copy output' : 'Copiar salida') + '</button>' +
        '<div class="demo-ctx-sep"></div>' +
        '<button class="demo-ctx-item demo-ctx-item--danger">🗑 ' + (isEn ? 'Delete session' : 'Eliminar sesión') + '</button>';
      ctxMenu.style.display = 'block';
      ctxMenu.style.left = ev.clientX + 'px';
      ctxMenu.style.top = ev.clientY + 'px';
      ctxMenu.querySelectorAll('.demo-ctx-item').forEach(function (it) {
        it.addEventListener('click', function () {
          ctxMenu.style.display = 'none';
          // Maximize handler
          if (it.dataset.action === 'max') {
            var mosaic = document.getElementById('demo-mosaic');
            if (mosaic) {
              var wasMax = pane.classList.contains('is-maximized');
              document.querySelectorAll('.demo-pane.is-maximized').forEach(function (p) { p.classList.remove('is-maximized'); });
              mosaic.classList.remove('has-maximized');
              if (!wasMax) { pane.classList.add('is-maximized'); mosaic.classList.add('has-maximized'); }
            }
          }
          showToast('✓ Acción simulada', 'info');
        }, { once: true });
      });
    });
  });

  // Cerrar menú contextual al hacer clic fuera
  document.addEventListener('click', function () { if (ctxMenu) ctxMenu.style.display = 'none'; });

  // ------------------------------------------------------------------
  // 10. TOAST NOTIFICATIONS
  // ------------------------------------------------------------------
  function showToast(msg, tipo) {
    var container = document.getElementById('demo-toasts');
    if (!container) return;
    var t = document.createElement('div');
    t.className = 'demo-toast demo-toast--' + (tipo || 'info');
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3000);
  }
  window.showToastDemo = showToast;

  // Acciones en botones laterales y sesiones del Sidebar
  var btnAddSession = document.getElementById('demo-add-session');
  if (btnAddSession) {
    btnAddSession.addEventListener('click', function(ev) {
      ev.preventDefault();
      showToast('➕ Nueva sesión de terminal creada y anexada en Cockpit', 'ok');
    });
  }
  document.querySelectorAll('.demo-ws-hover-btn').forEach(function(btn) {
    btn.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      showToast('🚀 Lanzando agente especializado en proyecto (' + (btn.textContent || 'AG') + ')', 'info');
    });
  });
  document.querySelectorAll('.demo-ws-session').forEach(function(sess) {
    sess.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var paneId = sess.dataset.pane;
      if (paneId) {
        var cabinaBtn = document.querySelector('#hero-demo-tabs [data-tab="cabina"]');
        if (cabinaBtn) cabinaBtn.click();
        document.querySelectorAll('.demo-pane').forEach(function(p) { p.classList.remove('is-focused'); });
        var pane = document.getElementById('demo-pane-' + paneId);
        if (pane) {
          pane.classList.add('is-focused');
          showToast('🎯 Foco conmutado a Terminal ' + paneId + ' (' + (sess.textContent || '').trim() + ')', 'info');
        }
      }
    });
  });

  // ------------------------------------------------------------------
  // 11. TECLADO: ATAJOS Y PÁNICO (como la app real)
  // ------------------------------------------------------------------
  var kbdOverlay = document.getElementById('demo-kbd-overlay');

  document.addEventListener('keydown', function (ev) {
    // Solo procesar si el foco está dentro del panel demo o en el body
    if (!ev.ctrlKey || !ev.shiftKey) {
      if (ev.key === 'Escape' && kbdOverlay) kbdOverlay.style.display = 'none';
      return;
    }
    var key = ev.key.toLowerCase();
    // Ctrl+Shift+E = Stream toggle
    if (key === 'e') {
      ev.preventDefault();
      if (panelDemo) {
        panelDemo.classList.toggle('is-streaming');
        showToast(panelDemo.classList.contains('is-streaming') ? '👁 Modo Stream activado' : '👁 Stream desactivado', 'warn');
      }
    }
    // Ctrl+Shift+P = Panic overlay
    if (key === 'p') {
      ev.preventDefault();
      if (panelDemo) {
        var existing = panelDemo.querySelector('.demo-panic-overlay');
        if (existing) { existing.remove(); }
        else {
          var panic = document.createElement('div');
          panic.className = 'demo-panic-overlay';
          panic.textContent = '🔒 PANTALLA DE PÁNICO — Pulsa Ctrl+Shift+P para salir';
          panic.addEventListener('click', function () { panic.remove(); });
          panelDemo.appendChild(panic);
        }
      }
    }
    // Ctrl+Shift+? = Keyboard shortcuts overlay
    if (key === '/' || key === '?') {
      ev.preventDefault();
      if (kbdOverlay) {
        kbdOverlay.style.display = kbdOverlay.style.display === 'none' ? 'flex' : 'none';
      }
    }
    // Ctrl+Shift+F = Maximize focused pane
    if (key === 'f') {
      ev.preventDefault();
      var focused = document.querySelector('.demo-pane.is-focused');
      var mosaic = document.getElementById('demo-mosaic');
      if (focused && mosaic) {
        var wasMax = focused.classList.contains('is-maximized');
        document.querySelectorAll('.demo-pane.is-maximized').forEach(function (p) { p.classList.remove('is-maximized'); });
        mosaic.classList.remove('has-maximized');
        if (!wasMax) { focused.classList.add('is-maximized'); mosaic.classList.add('has-maximized'); }
      }
    }
    // Ctrl+Shift+A = Capataz AI Foreman toggle
    if (key === 'a') {
      ev.preventDefault();
      var cToggle = document.getElementById('demo-capataz-toggle');
      if (cToggle) cToggle.click();
    }
  });

  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape') {
      var drw = document.getElementById('demo-capataz-drawer');
      if (drw && drw.style.display !== 'none') drw.style.display = 'none';
      var kbd = document.getElementById('demo-kbd-overlay');
      if (kbd && kbd.style.display !== 'none') kbd.style.display = 'none';
    }
  });

  if (kbdOverlay) {
    kbdOverlay.addEventListener('click', function (ev) {
      if (ev.target === kbdOverlay) kbdOverlay.style.display = 'none';
    });
  }

  // ------------------------------------------------------------------
  // 12. CREADORES DINÁMICOS DE NODOS EN LIENZO
  // ------------------------------------------------------------------
  var btnAddNote = document.getElementById('demo-btn-add-note');
  if (btnAddNote && canvasBoard) {
    btnAddNote.addEventListener('click', function (ev) {
      ev.preventDefault();
      var isEn = document.documentElement.lang === 'en';
      var colors = ['#f2c14e', '#7ec9a8', '#7fb6f0', '#c9a5f0', '#f09a9a'];
      var color = colors[Math.floor(Math.random() * colors.length)];
      var note = document.createElement('div');
      note.className = 'demo-cnode demo-cnode--note demo-draggable';
      note.style.left = (60 + Math.random() * 300) + 'px';
      note.style.top = (60 + Math.random() * 150) + 'px';
      note.style.borderColor = color + '66';
      note.innerHTML = '<div class="demo-cnode-drag-handle"><span>📝</span><span class="demo-cnode-head" style="color:' + color + ';">' +
        (isEn ? 'Sticky Note' : 'Nota adhesiva') + '</span></div>' +
        '<div class="demo-note-body" contenteditable="true"><input type="checkbox"> ' +
        (isEn ? 'Task 1: Refactor API\n' : 'Tarea 1: Refactorizar API\n') +
        '<br><input type="checkbox"> ' + (isEn ? 'Task 2: Write tests' : 'Tarea 2: Escribir tests') + '</div>' +
        '<div class="demo-note-color-bar">' +
        colors.map(function (c) { return '<span class="demo-note-color-dot' + (c === color ? ' is-active' : '') + '" data-color="' + c + '" style="background:' + c + ';"></span>'; }).join('') +
        '</div>';
      canvasBoard.appendChild(note);
      makeDraggable(note);
      // Color picker en la nota
      note.querySelectorAll('.demo-note-color-dot').forEach(function (dot) {
        dot.addEventListener('click', function () {
          note.querySelectorAll('.demo-note-color-dot').forEach(function (d) { d.classList.remove('is-active'); });
          dot.classList.add('is-active');
          note.style.borderColor = dot.dataset.color + '66';
          note.querySelector('.demo-cnode-head').style.color = dot.dataset.color;
        });
      });
      showToast('📝 Nota añadida', 'ok');
    });
  }

  var btnAddPomo = document.getElementById('demo-btn-add-pomo');
  if (btnAddPomo && canvasBoard) {
    btnAddPomo.addEventListener('click', function (ev) {
      ev.preventDefault();
      var isEn = document.documentElement.lang === 'en';
      var pomo = document.createElement('div');
      pomo.className = 'demo-cnode demo-cnode--pomo demo-draggable';
      pomo.style.left = (100 + Math.random() * 250) + 'px';
      pomo.style.top = (80 + Math.random() * 120) + 'px';
      pomo.innerHTML = '<div class="demo-cnode-drag-handle"><span>⏱️</span><span class="demo-cnode-head">' +
        (isEn ? 'Foreman Pomodoro' : 'Pomodoro Capataz') + '</span></div>' +
        '<div class="demo-pomo-timer">25:00</div>' +
        '<div class="demo-pomo-controls"><button type="button" class="demo-btn-action demo-btn-action--primary">▶ ' +
        (isEn ? 'Start' : 'Iniciar') + '</button></div>';
      canvasBoard.appendChild(pomo);
      makeDraggable(pomo);
      showToast('🍅 Pomodoro añadido', 'ok');
    });
  }

  // Relay simulación
  var btnRelay = document.getElementById('demo-btn-relay');
  var arrowIcon = document.getElementById('demo-carrow-icon');
  var cnode1Status = document.getElementById('cnode-1-status');
  var cnode2Status = document.getElementById('cnode-2-status');
  if (btnRelay) {
    btnRelay.addEventListener('click', function (ev) {
      ev.preventDefault();
      var isEn = document.documentElement.lang === 'en';
      if (arrowIcon) arrowIcon.classList.add('is-relevando');
      if (cnode1Status) cnode1Status.textContent = isEn ? '✓ Relay sent to Target Terminal' : '✓ Relevo enviado a Terminal Destino';
      if (cnode2Status) cnode2Status.textContent = isEn ? '⏺ Transcript received · Running pnpm build...' : '⏺ Recibido transcript · Lanzando pnpm build...';
      showToast('⚡ Relevo enviado', 'ok');
      setTimeout(function () {
        if (arrowIcon) arrowIcon.classList.remove('is-relevando');
        if (cnode2Status) cnode2Status.textContent = isEn ? '✓ pnpm build completed (0.84s)' : '✓ pnpm build completado (0.84s)';
      }, 1200);
    });
  }

  // Añadir subagente
  var btnAddNode = document.getElementById('demo-btn-add-node');
  if (btnAddNode && canvasBoard) {
    var agentNames = ['Qwen (Seguridad)', 'Gemini (Tests)', 'DeepSeek (Optimización)', 'Mistral (Docs)'];
    var agentIdx = 0;
    btnAddNode.addEventListener('click', function (ev) {
      ev.preventDefault();
      var name = agentNames[agentIdx % agentNames.length]; agentIdx++;
      var n = document.createElement('div');
      n.className = 'demo-cnode demo-cnode--agent demo-draggable';
      n.style.left = (100 + Math.random() * 400) + 'px';
      n.style.top = (50 + Math.random() * 200) + 'px';
      n.innerHTML = '<div class="demo-cnode-drag-handle"><span class="demo-cnode-icon">🤖</span><span class="demo-cnode-head">' + name + '</span></div>' +
        '<p>Auditoría en vivo</p><span class="demo-cnode-tag">subagent</span>';
      canvasBoard.appendChild(n);
      makeDraggable(n);
      showToast('🤖 Subagente ' + name + ' añadido', 'ok');
    });
  }

  // ------------------------------------------------------------------
  // 13. STREAM TOGGLE (botón visual)
  // ------------------------------------------------------------------
  var btnStream = document.getElementById('demo-stream-toggle');
  if (btnStream && panelDemo) {
    btnStream.addEventListener('click', function (ev) {
      ev.preventDefault();
      var esStream = panelDemo.classList.toggle('is-streaming');
      btnStream.classList.toggle('is-activo', esStream);
      showToast(esStream ? '👁 Stream ON (Ocultando rutas y datos privados)' : '👁 Stream OFF (Modo Normal)', 'warn');
    });
  }

  // ------------------------------------------------------------------
  // 14. SELECTOR DE TEMAS VISUALES EN AJUSTES
  // ------------------------------------------------------------------
  var themeBtns = document.querySelectorAll('#demo-theme-chips .demo-theme-btn');
  if (themeBtns.length && panelDemo) {
    themeBtns.forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        themeBtns.forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        var themeId = btn.dataset.themeId;
        if (themeId === 'azul' || !themeId) { panelDemo.removeAttribute('data-demo-theme'); }
        else { panelDemo.setAttribute('data-demo-theme', themeId); }
        showToast('🎨 Tema: ' + (btn.textContent || themeId), 'info');
      });
    });
  }

  // ------------------------------------------------------------------
  // 15. PANE FOCUS & CLICK-TO-FOCUS
  // ------------------------------------------------------------------
  document.querySelectorAll('.demo-pane').forEach(function (pane) {
    pane.addEventListener('click', function () {
      document.querySelectorAll('.demo-pane.is-focused').forEach(function (p) { p.classList.remove('is-focused'); });
      pane.classList.add('is-focused');
    });
  });

  // Trash button armed (two-click delete like the real app)
  document.querySelectorAll('.demo-pane-header .demo-pane-close').forEach(function (btn) {
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (btn.classList.contains('is-armed')) {
        var pane = btn.closest('.demo-pane');
        if (pane) { pane.style.display = 'none'; showToast('🗑 Sesión eliminada', 'warn'); }
        btn.classList.remove('is-armed');
      } else {
        btn.classList.add('is-armed');
        btn.textContent = '⚠ Confirmar';
        setTimeout(function () {
          btn.classList.remove('is-armed');
          btn.textContent = '🗑';
        }, 2000);
      }
    });
  });

  // ------------------------------------------------------------------
  // 16. CAPATAZ AI ORQUESTADOR & ACCIONES DE PANELES / AGENDA / COMANDOS
  // ------------------------------------------------------------------
  var btnCapataz = document.getElementById('demo-capataz-toggle');
  var drawerCapataz = document.getElementById('demo-capataz-drawer');
  if (btnCapataz && drawerCapataz) {
    btnCapataz.addEventListener('click', function (ev) {
      ev.preventDefault();
      var isVisible = drawerCapataz.style.display !== 'none';
      drawerCapataz.style.display = isVisible ? 'none' : 'flex';
      showToast(isVisible ? '✦ Capataz Oculto' : '✦ Capataz Orquestador convocado (Ctrl+Mayús+A)', 'info');
    });
  }

  // Global methods for inline onclick events
  window.blurPaneDemo = function(id) {
    var pane = document.getElementById('demo-pane-' + id);
    if (pane) {
      pane.classList.toggle('is-blurred-pane');
      showToast('👁 Privacidad terminal ' + id + (pane.classList.contains('is-blurred-pane') ? ' (Activa)' : ' (Desactivada)'), 'info');
    }
  };

  window.splitPaneDemo = function(id, dir) {
    showToast('◫ Dividiendo terminal ' + id + (dir === 'r' ? ' a la derecha' : ' hacia abajo'), 'info');
    var out = document.getElementById('demo-term-out-' + id);
    if (out) {
      var l = document.createElement('span');
      l.className = 'l l--dim';
      l.textContent = '⎿ Nueva sub-terminal ConPTY vinculada en paralelo a este contexto.';
      out.appendChild(l);
      out.scrollTop = out.scrollHeight;
    }
  };

  window.maxPaneDemo = function(id) {
    var mosaic = document.getElementById('demo-mosaic');
    var pane = document.getElementById('demo-pane-' + id);
    if (mosaic && pane) {
      var isMax = pane.classList.contains('is-maximized');
      document.querySelectorAll('.demo-pane').forEach(function(p) { p.classList.remove('is-maximized'); });
      if (!isMax) {
        mosaic.classList.add('has-maximized');
        pane.classList.add('is-maximized');
        showToast('🗖 Terminal ' + id + ' maximizada en Cabina (Haz clic en restaurar o Esc para volver)', 'ok');
      } else {
        mosaic.classList.remove('has-maximized');
        showToast('🗗 Cuadrícula restaurada', 'info');
      }
    }
  };

  window.responderAskDemo = function(id, ans, btn) {
    var askDiv = document.getElementById('demo-ask-' + id);
    if (askDiv) askDiv.style.display = 'none';
    showToast('✓ Opción confirmada (' + (ans === 'y' ? 'Confianza aceptada en workspace' : 'Denegado') + ')', 'ok');
    var out = document.getElementById('demo-term-out-' + id);
    if (out) {
      var cursor = out.querySelector('.l--cursor');
      var l1 = document.createElement('span');
      l1.className = 'l l--prompt';
      l1.textContent = '> ' + (ans === 'y' ? '1' : '2');
      var l2 = document.createElement('span');
      l2.className = 'l l--ok';
      l2.textContent = ans === 'y' ? '✓ Permisos de workspace otorgados. Motor Codex analizando repo y AGENTS.md...' : '✕ Operación cancelada.';
      if (cursor) {
        out.insertBefore(l1, cursor);
        out.insertBefore(l2, cursor);
      } else {
        out.appendChild(l1);
        out.appendChild(l2);
      }
      out.scrollTop = out.scrollHeight;
    }
  };

  window.aceptarAgendaDemo = function(btn) {
    var item = btn.closest('.demo-agenda-item');
    if (item) {
      item.style.transition = 'all 0.25s ease';
      item.style.opacity = '0';
      item.style.transform = 'translateX(30px)';
      setTimeout(function() { item.style.display = 'none'; }, 250);
    }
    showToast('✓ Idea capturada por VoCript integrada automáticamente en el proyecto', 'ok');
  };

  window.descartarAgendaDemo = function(btn) {
    var item = btn.closest('.demo-agenda-item');
    if (item) {
      item.style.transition = 'all 0.25s ease';
      item.style.opacity = '0';
      item.style.transform = 'translateX(-30px)';
      setTimeout(function() { item.style.display = 'none'; }, 250);
    }
    showToast('✕ Elemento descartado de la bandeja de agenda', 'warn');
  };

  window.ejecutarCmdDemo = function(cmd, paneId) {
    var cabinaBtn = document.querySelector('#hero-demo-tabs [data-tab="cabina"]');
    if (cabinaBtn) cabinaBtn.click();
    showToast('🚀 Lanzando comando rápido: ' + cmd + ' (Terminal ' + paneId + ')', 'info');
    setTimeout(function() {
      var termOut = document.getElementById('demo-term-out-' + paneId);
      if (termOut) {
        var cursor = termOut.querySelector('.l--cursor');
        var promptLine = document.createElement('span');
        promptLine.className = 'l l--prompt';
        promptLine.textContent = 'PS C:\\proyectos\\Adeorq> ' + cmd;
        if (cursor) termOut.insertBefore(promptLine, cursor); else termOut.appendChild(promptLine);
        
        setTimeout(function() {
          var resLine = document.createElement('span');
          resLine.className = 'l l--ok';
          resLine.textContent = '✓ Comando "' + cmd + '" completado en 0.42s a través del motor ConPTY nativo.';
          if (cursor) termOut.insertBefore(resLine, cursor); else termOut.appendChild(resLine);
          termOut.scrollTop = termOut.scrollHeight;
        }, 550);
      }
    }, 400);
  };

  window.capatazOptimizarDemo = function() {
    showToast('⚡ Capataz Orquestador: 140MB liberados en memoria PTY y subagentes sincronizados.', 'ok');
    if (drawerCapataz) drawerCapataz.style.display = 'none';
  };

  window.capatazResumenDemo = function() {
    showToast('📋 Informe Swarm regenerado en %LOCALAPPDATA%\\Adeorq\\informes\\sesion.md', 'ok');
    if (drawerCapataz) drawerCapataz.style.display = 'none';
  };

  // ------------------------------------------------------------------
  // 17. CONTROLES DE VENTANA (MIN, MAX PANTALLA COMPLETA, CERRAR)
  // ------------------------------------------------------------------
  var winMin = document.getElementById('demo-win-min');
  var winMax = document.getElementById('demo-win-max');
  var winClose = document.getElementById('demo-win-close');

  if (winMax && panelDemo) {
    winMax.addEventListener('click', function (ev) {
      ev.preventDefault();
      panelDemo.classList.toggle('is-fullscreen-app');
      var isFs = panelDemo.classList.contains('is-fullscreen-app');
      winMax.textContent = isFs ? '🗗' : '□';
      winMax.title = isFs ? 'Restaurar tamaño de ventana' : 'Modo Pantalla Completa (Expandir aplicación)';
      showToast(isFs ? '🖥️ Modo Aplicación Pantalla Completa activado (Esc para volver)' : '🗗 Tamaño de ventana restaurado', 'ok');
    });

    // Permitir salir de Pantalla Completa con Escape
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && panelDemo.classList.contains('is-fullscreen-app')) {
        panelDemo.classList.remove('is-fullscreen-app');
        winMax.textContent = '□';
        showToast('🗗 Tamaño de ventana restaurado', 'info');
      }
    });
  }

  if (winMin) {
    winMin.addEventListener('click', function (ev) {
      ev.preventDefault();
      showToast('🗕 Sesión de Adeorq en segundo plano en bandeja de Windows', 'info');
    });
  }

  if (winClose) {
    winClose.addEventListener('click', function (ev) {
      ev.preventDefault();
      showToast('⚠️ Para salir del Taller de Adeorq, utiliza el comando /exit o cierra desde Tauri', 'warn');
    });
  }

  // ------------------------------------------------------------------
  // 18. MOTOR DE SIMULACIÓN DE PROCESOS VIBE CODING EN TIEMPO REAL
  // ------------------------------------------------------------------
  function iniciarSimulacionVibeCoding() {
    if (!panelDemo) return;

    var step = 0;
    var maxSteps = 16;
    var footerStatus = document.getElementById('demo-footer-status');

    var feedTerm1 = [
      { type: 'cmd', text: 'claude --permission-mode acceptEdits -p "Revisar token de color y layout en App.css"' },
      { type: 'dim', text: '⏺ Analizando dependencias en workspace Adeorq (42 ficheros rust + ts)...' },
      { type: 'norm', text: '⎿ Identificados tokens en App.css. Aplicando regla de diseño flush de paneles.' },
      { type: 'ok', text: '✓ Modificación quirúrgica completada sin advertencias en compilador.' },
      { type: 'dim', text: '🔔 Turno terminado · Tokens consumidos: 24.180 ($0.041)' }
    ];

    var feedTerm2 = [
      { type: 'dim', text: '[tauri::watcher] Fichero modificado: web/styles/hero.css' },
      { type: 'norm', text: 'vite v7.3.6: hot updated /styles/hero.css in 14ms (60fps intactos)' },
      { type: 'ok', text: '✓ Compilación ConPTY exitosa. 0 errores, 0 avisos en memoria.' },
      { type: 'dim', text: '[ConPTY Engine] Memoria PTY estable en 136MB · Latencia 0.3ms' }
    ];

    var feedTerm4 = [
      { type: 'cmd', text: 'agy --preset check-swarm-status' },
      { type: 'norm', text: 'AGY > Sincronizando buzon inter-sesión en %LOCALAPPDATA%\\Adeorq\\bandeja.md...' },
      { type: 'ok', text: 'AGY > ✓ Swarm v2 sincronizado. 4 agentes en paralelo trabajando sin bloqueos.' }
    ];

    function agregarLinea(paneId, item) {
      var out = document.getElementById('demo-term-out-' + paneId);
      if (!out) return;
      var cursor = out.querySelector('.l--cursor');
      var el = document.createElement('span');
      
      if (item.type === 'cmd') {
        el.className = 'l l--prompt';
        el.textContent = 'PS C:\\proyectos\\Adeorq> ' + item.text;
      } else if (item.type === 'ok') {
        el.className = 'l l--ok';
        el.textContent = item.text;
      } else if (item.type === 'dim') {
        el.className = 'l l--dim';
        el.textContent = item.text;
      } else {
        el.className = 'l';
        el.textContent = item.text;
      }

      if (cursor) {
        out.insertBefore(el, cursor);
      } else {
        out.appendChild(el);
      }

      var lineas = out.querySelectorAll('.l:not(.l--cursor)');
      if (lineas.length > 22) {
        for (var i = 0; i < lineas.length - 18; i++) {
          lineas[i].remove();
        }
      }

      out.scrollTop = out.scrollHeight;
    }

    // Bucle de vida automática del panel
    setInterval(function () {
      if (document.hidden) return;
      step = (step + 1) % maxSteps;

      if (step === 2) agregarLinea('1', feedTerm1[0]);
      if (step === 4) agregarLinea('1', feedTerm1[1]);
      if (step === 6) { agregarLinea('1', feedTerm1[2]); agregarLinea('2', feedTerm2[0]); }
      if (step === 7) agregarLinea('2', feedTerm2[1]);
      if (step === 8) { agregarLinea('1', feedTerm1[3]); agregarLinea('2', feedTerm2[2]); }
      if (step === 10) { agregarLinea('1', feedTerm1[4]); var bTurn = document.getElementById('demo-btn-turn'); if(bTurn){ bTurn.style.transform = 'scale(1.08)'; setTimeout(function(){bTurn.style.transform='';}, 300); } }
      if (step === 12) agregarLinea('4', feedTerm4[0]);
      if (step === 14) agregarLinea('4', feedTerm4[1]);
      if (step === 15) { agregarLinea('4', feedTerm4[2]); agregarLinea('2', feedTerm2[3]); }

      if (footerStatus) {
        var ram = (138 + Math.floor(Math.random() * 8)).toFixed(1);
        var cpu = (2 + (Math.random() * 4)).toFixed(1);
        var ahora = new Date();
        var horaStr = ahora.toTimeString().split(' ')[0];
        var isEn = document.documentElement.lang === 'en';
        footerStatus.textContent = isEn
          ? '4 ConPTY terminals active · CPU: ' + cpu + '% · RAM: ' + ram + ' MB · 0 errors · Adeorq v0.9.6 [' + horaStr + ']'
          : '4 terminales ConPTY activas · CPU: ' + cpu + '% · RAM: ' + ram + ' MB · 0 errores · Adeorq v0.9.6 [' + horaStr + ']';
      }
    }, 2400);
  }

  setTimeout(iniciarSimulacionVibeCoding, 1000);

  // ------------------------------------------------------------------
  // 19. SELECCIÓN DE TARJETAS DE CUENTA & FILTRO DE COMANDOS EN VIVO
  // ------------------------------------------------------------------
  document.querySelectorAll('.demo-acc-card').forEach(function (card) {
    card.addEventListener('click', function (ev) {
      if (ev.target.tagName.toLowerCase() === 'button') return;
      ev.preventDefault();
      document.querySelectorAll('.demo-acc-card').forEach(function (c) { c.classList.remove('is-active'); });
      card.classList.add('is-active');
      var nameEl = card.querySelector('.demo-acc-name');
      var nombre = nameEl ? nameEl.textContent.trim() : 'Proveedor AI';
      showToast('✓ Proveedor principal cambiado a: ' + nombre, 'ok');
    });
  });

  var cmdSearchInput = document.getElementById('demo-cmd-search-input');
  if (cmdSearchInput) {
    cmdSearchInput.addEventListener('input', function () {
      var q = cmdSearchInput.value.toLowerCase().trim();
      document.querySelectorAll('.demo-cmd-row').forEach(function (row) {
        var txt = (row.textContent || '').toLowerCase();
        if (!q || txt.indexOf(q) !== -1) {
          row.style.display = 'flex';
        } else {
          row.style.display = 'none';
        }
      });
    });
  }

  // ------------------------------------------------------------------
  // 20. INTERACTIVIDAD DEL PORTAL DE DOCUMENTACIÓN INMERSIVA (DOCS)
  // ------------------------------------------------------------------
  document.querySelectorAll('.docs-nav-btn').forEach(function (btn) {
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      document.querySelectorAll('.docs-nav-btn').forEach(function (b) { b.classList.remove('is-active'); });
      document.querySelectorAll('.docs-pane').forEach(function (p) { p.classList.remove('is-active'); });
      btn.classList.add('is-active');
      var targetId = btn.getAttribute('data-doc-target');
      var targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('is-active');
      if (typeof showToast === 'function') showToast('📖 Sección de guía cargada: ' + btn.textContent.trim(), 'info');
    });
  });
})();
