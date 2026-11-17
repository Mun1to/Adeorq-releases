/* ===========================================================================
   Adeorq · web/portada/pestanas.js
   LAS PESTAÑAS DE ENCIMA DE LA DEMO.

   Cada una lleva la demo a esa pantalla con `adeDemo.irA` (demo/vivo.js), y la
   pestaña marcada sigue a la demo si se cambia de pantalla tocándola por
   dentro. La demo no se carga hasta el primer gesto (valvula.js), así que el
   clic insiste unos segundos hasta que está.
   ========================================================================= */

(function () {
  'use strict';

  var fila = document.querySelector('[data-pestanas-demo]');
  var marco = document.getElementById('ventana-demo');
  if (!fila || !marco) return;
  var botones = Array.prototype.slice.call(fila.querySelectorAll('button[data-vista]'));

  function marcar(vista) {
    botones.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.vista === vista)); });
  }

  function demo() {
    try { return marco.contentWindow && marco.contentWindow.adeDemo; } catch (e) { return null; }
  }

  function ir(vista, intentos) {
    var d = demo();
    if (d) d.irA(vista);
    else if (intentos > 0) setTimeout(function () { ir(vista, intentos - 1); }, 150);
  }

  botones.forEach(function (b) {
    b.addEventListener('click', function () {
      marcar(b.dataset.vista);
      ir(b.dataset.vista, 40);
    });
  });

  marco.addEventListener('load', function () {
    var doc;
    try { doc = marco.contentDocument; } catch (e) { return; }
    if (!doc) return;
    doc.addEventListener('click', function () {
      setTimeout(function () {
        var d = demo();
        if (d && d.estado) marcar(d.estado.vista);
      }, 0);
    });
  });
})();
