/* ===========================================================================
   Adeorq · piezas · foco.js

   La linterna que descubre el plano de debajo, y de paso el diferido de un
   iframe pesado. Todo el dibujo vive en `foco.css`, que es donde se lee y se
   cambia sin entender este archivo.

   Medido en huly.io el 2026-08-20 con el navegador abierto sobre su página: su
   JavaScript escribe la posición del puntero como variables CSS
   (`--hero-mask-x` / `--hero-mask-y`) y no hace nada más. Sin inercia: al parar
   el ratón, el valor se queda clavado. El porqué de copiarlo así está en
   `foco.css` y el desglose completo en `docs/REFERENCIA-HULY.md`.

   Se monta solo si lo encuentra:
     · La linterna, siempre que haya puntero fino y sitio.
     · El diferido, solo si hay un `<iframe data-src="...">` en la página.
   ========================================================================= */

(function () {
  'use strict';

  /* ── 1. La linterna ──────────────────────────────────────────────────── */

  /* Solo con puntero fino. En una pantalla táctil no hay a quién seguir, y una
     capa a media luz clavada en una esquina es peor que no tener nada. */
  if (matchMedia('(pointer: fine)').matches && innerWidth > 900) {
    var capa = document.createElement('div');
    capa.className = 'foco';
    capa.setAttribute('aria-hidden', 'true');
    capa.innerHTML = '<span class="foco__luz"></span><span class="foco__halo"></span>';
    document.body.appendChild(capa);

    var raiz = document.documentElement;
    var pedido = 0;
    var x = 0;
    var y = 0;

    /* El evento se escucha siempre, pero el ESTILO se escribe una vez por
       frame: un `pointermove` llega hasta cien veces por segundo y cada
       escritura de estas variables repinta dos capas con máscara. */
    function pintar() {
      pedido = 0;
      raiz.style.setProperty('--foco-x', x + 'px');
      raiz.style.setProperty('--foco-y', y + 'px');
    }

    addEventListener('pointermove', function (e) {
      /* Coordenadas de VENTANA, no de página, porque la capa es `fixed`. Un
         `pageY` aquí dejaría el foco atrás en cuanto se hace scroll. */
      x = e.clientX;
      y = e.clientY;
      if (!document.body.hasAttribute('data-foco')) {
        document.body.setAttribute('data-foco', '');
      }
      if (!pedido) pedido = requestAnimationFrame(pintar);
    }, { passive: true });

    /* Al salir de la ventana se apaga: dejar el círculo clavado donde estuvo el
       ratón por última vez parece un fallo de pintado, no una decisión. */
    var apagar = function () { document.body.removeAttribute('data-foco'); };
    addEventListener('pointerleave', apagar);
    document.addEventListener('mouseleave', apagar);
  }

  /* ── 2. Lo pesado, cuando haga falta ─────────────────────────────────── */

  /* Un `<iframe>` con la maqueta dentro cuesta 845 KB en 21 peticiones
     (medido el 2026-08-20 sobre `/demo/`), y los pide OTRO documento: no salen
     en las métricas de la página que lo contiene, así que es coste invisible
     compitiendo con el primer pintado. */
  var marcos = [].slice.call(document.querySelectorAll('iframe[data-src]'));
  if (!marcos.length) return;

  var vigias = [];
  var rescate = 0;

  function traerTodos() {
    marcos.forEach(traer);
  }

  function traer(marco) {
    var destino = marco.getAttribute('data-src');
    if (!destino) return;
    marco.src = destino;
    marco.removeAttribute('data-src');
  }

  function soltar() {
    removeEventListener('pointerdown', traerTodos);
    removeEventListener('keydown', traerTodos);
    removeEventListener('wheel', traerTodos);
    vigias.forEach(function (v) { v.disconnect(); });
    clearTimeout(rescate);
  }

  /* Cualquier gesto significa que la persona está aquí y va a querer usarlo. */
  addEventListener('pointerdown', traerTodos, { once: true, passive: true });
  addEventListener('keydown', traerTodos, { once: true });
  addEventListener('wheel', traerTodos, { once: true, passive: true });

  if ('IntersectionObserver' in window) {
    marcos.forEach(function (marco) {
      var v = new IntersectionObserver(function (e) {
        if (e[0].isIntersecting) { traer(marco); v.disconnect(); }
      }, { rootMargin: '300px' });
      v.observe(marco);
      vigias.push(v);
    });
  }

  /* El cinturón de la casa: un observador puede quedarse mudo (una pestaña de
     fondo no dispara `requestAnimationFrame`, y en un contenedor sin dimensionar
     `innerHeight` es 0 y no hay intersección posible). Nunca se deja contenido a
     merced de un observer. */
  addEventListener('load', function () {
    rescate = setTimeout(function () { traerTodos(); soltar(); }, 1200);
  });
})();
