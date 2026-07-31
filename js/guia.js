/* ============================================================================
   Adeorq · guia.js
   Lo poco que necesita la pagina de documentacion: saber por que seccion vas
   para marcarla en el indice, y plegar ese indice al elegir en movil.

   Sin dependencias y sin tocar el scroll: la pagina se lee entera con este
   archivo desactivado.
   ========================================================================= */

(function () {
  'use strict';

  var indice = document.querySelector('.doc-indice');
  if (!indice) return;

  var enlaces = Array.prototype.slice.call(indice.querySelectorAll('a[href^="#"]'));
  if (!enlaces.length) return;

  var porId = {};
  var secciones = [];

  enlaces.forEach(function (a) {
    var id = a.getAttribute('href').slice(1);
    var seccion = document.getElementById(id);
    if (!seccion) return;
    porId[id] = a;
    secciones.push(seccion);
  });

  var actual = null;

  function marcar(id) {
    if (id === actual) return;
    if (actual && porId[actual]) porId[actual].removeAttribute('aria-current');
    actual = id;
    if (porId[id]) porId[id].setAttribute('aria-current', 'true');
  }

  /* ------------------------------------------------------------------
     Cual es la seccion "de ahora": la ultima cuyo comienzo ya ha pasado
     por debajo de la barra superior. Se mide con el observador, que solo
     despierta cuando algo entra o sale, y no en cada pixel de scroll.
     ------------------------------------------------------------------ */

  function recalcular() {
    var techo = (document.querySelector('.nav') || {}).offsetHeight || 68;
    var linea = techo + 24;
    var elegida = secciones[0];

    for (var i = 0; i < secciones.length; i++) {
      if (secciones[i].getBoundingClientRect().top <= linea) elegida = secciones[i];
      else break;
    }

    // Al final del documento manda la ultima, aunque no haya cruzado la linea:
    // si no, la ultima seccion nunca llega a marcarse.
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 4) {
      elegida = secciones[secciones.length - 1];
    }

    if (elegida) marcar(elegida.id);
  }

  var pendiente = false;
  function alScroll() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(function () {
      pendiente = false;
      recalcular();
    });
  }

  window.addEventListener('scroll', alScroll, { passive: true });
  window.addEventListener('resize', alScroll, { passive: true });
  recalcular();

  /* ------------------------------------------------------------------
     En movil el indice vive dentro de un <details>. Al elegir destino se
     pliega solo, que si no tapa justo lo que acabas de pedir.
     ------------------------------------------------------------------ */

  var caja = indice.querySelector('details');
  if (caja) {
    indice.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (a && window.matchMedia('(max-width: 940px)').matches) caja.open = false;
    });
  }
})();
