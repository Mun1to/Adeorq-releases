/* ===========================================================================
   Adeorq · valvula.js

   Dos cosas que la portada necesitaba y no tenía, medidas el 2026-08-20 con
   el navegador sobre `localhost:5174/portada/`:

   1. UN CONTROL DE PAUSA VISIBLE. Hay dos animaciones en bucle infinito
      (`glow-late` 9 s y `cinta-rodar` 42 s). WCAG 2.2.2 es nivel A y
      pide control de pausa a partir de cinco segundos; WCAG 2.3.3 pide poder
      desactivar el movimiento, no solo reducirlo. El dial `--motion-gain` del
      `<head>` no cubre ninguna de las dos: gradúa amplitud, no detiene bucles,
      y su única válvula vivía en la URL, donde no la encuentra nadie.

   2. LA DEMO NO SE CARGA DE ENTRADA. El `<iframe>` de `/demo/` pesa
      845 KB en 21 peticiones (`demo.js` 182 KB, `vistas.js` 126 KB, `ui.css`
      110 KB, `pantallas.js` 94 KB), y esos bytes no aparecen en las métricas
      de la portada porque los pide otro documento: son un coste invisible que
      casi duplica los 484 KB que la portada creía costar. Aquí se carga
      cuando la ventana se acerca a la pantalla, o al primer gesto de la
      persona, lo que llegue antes.

   Escribe solo dos cosas: el atributo `data-quieto` en `<html>` y el `src`
   del iframe. Todo el dibujo está en `valvula.css`.
   ========================================================================= */

(function () {
  'use strict';

  var raiz = document.documentElement;

  /* ── 1. La válvula ────────────────────────────────────────────────────── */

  /* Arranca SIEMPRE en marcha, y el «parado» dura lo que dura la visita.
     Antes se recordaba entre recargas y la portada se abria congelada, que
     parece rota: nadie ata eso a un boton que pulso una vez hace media hora.
     Lo que si persiste, porque debe, es la preferencia del sistema y la de la
     URL, que se leen abajo en gainDeCasa(). */
  var parado = false;

  var boton = document.createElement('button');
  boton.className = 'valvula';
  boton.type = 'button';

  var ico = document.createElement('span');
  ico.className = 'valvula__ico';
  ico.setAttribute('aria-hidden', 'true');
  var texto = document.createElement('span');
  boton.appendChild(ico);
  boton.appendChild(texto);

  function pintar() {
    if (parado) {
      raiz.setAttribute('data-quieto', '');
      /* El dial a cero además de la pausa: los bucles se congelan con
         `animation-play-state`, pero lo que se mueve por JavaScript (las motas
         del canvas) lee el dial y se para sola. Una sola pulsación tiene que
         parar las dos familias o el control miente. */
      raiz.style.setProperty('--motion-gain', '0');
      raiz.classList.remove('motion');
      texto.textContent = 'Reanudar el movimiento';
    } else {
      raiz.removeAttribute('data-quieto');
      raiz.style.setProperty('--motion-gain', gainDeCasa());
      raiz.classList.add('motion');
      texto.textContent = 'Parar el movimiento';
    }
    boton.setAttribute('aria-pressed', parado ? 'true' : 'false');
  }

  /* El valor que le tocaría a este visitante según la política de la casa: la
     URL manda, luego la preferencia del sistema, y si no, la experiencia
     completa. Se recalcula en vez de guardarse porque el visitante puede
     cambiar la preferencia del sistema con la pestaña abierta. */
  function gainDeCasa() {
    var q = new URLSearchParams(location.search).get('motion');
    if (q === 'off') return '0';
    if (q === 'full') return '1';
    return matchMedia('(prefers-reduced-motion: reduce)').matches ? '0.25' : '1';
  }

  boton.addEventListener('click', function () {
    parado = !parado;
    pintar();
    /* Al reanudar, las motas necesitan que alguien las despierte: su bucle se
       apagó solo al leer el dial en cero y no vuelve por su cuenta. Un evento
       de tamaño es lo que su propio código ya escucha. */
    if (!parado) dispatchEvent(new Event('resize'));
  });

  pintar();
  document.body.appendChild(boton);

  /* Si la URL ya pedía `motion=off`, el botón nace diciendo «reanudar»: sería
     mentira ofrecer parar algo que ya está parado. */
  if (new URLSearchParams(location.search).get('motion') === 'off' && !parado) {
    parado = true;
    pintar();
  }

  /* ── 2. La demo, cuando haga falta ────────────────────────────────────── */

  var marco = document.getElementById('ventana-demo');
  if (!marco) return;

  var destino = marco.getAttribute('data-src');
  if (!destino) return;   // ya trae src: alguien lo cambió, no se toca

  var pedido = false;
  function traer() {
    if (pedido) return;
    pedido = true;
    marco.src = destino;
    marco.removeAttribute('data-src');
    quitarOyentes();
  }

  function quitarOyentes() {
    removeEventListener('pointerdown', traer);
    removeEventListener('keydown', traer);
    removeEventListener('wheel', traer);
    if (vigia) vigia.disconnect();
    clearTimeout(rescate);
  }

  /* Cualquier gesto significa que la persona está aquí y va a querer tocarla. */
  addEventListener('pointerdown', traer, { once: true, passive: true });
  addEventListener('keydown', traer, { once: true });
  addEventListener('wheel', traer, { once: true, passive: true });

  var vigia = null;
  if ('IntersectionObserver' in window) {
    vigia = new IntersectionObserver(function (e) {
      if (e[0].isIntersecting) traer();
    }, { rootMargin: '300px' });
    vigia.observe(marco);
  }

  /* El cinturón de seguridad de la casa: un observador puede quedarse mudo (en
     una pestaña de fondo `requestAnimationFrame` no dispara y con el panel sin
     dimensionar `innerHeight` es 0, así que no hay intersección posible). Si
     eso pasa, la demo se carga igual poco después de que la página termine.
     Nunca dejar contenido a merced de un observer. */
  var rescate = 0;
  addEventListener('load', function () {
    rescate = setTimeout(traer, 1200);
  });
})();
