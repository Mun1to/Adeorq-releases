/* ===========================================================================
   Adeorq · portada/menu.js
   El menú del móvil de la barra compartida (portada/barra.css), en la portada
   y en la guía. Por debajo de 860 px la barra esconde las secciones, «Código»
   y el idioma; el botón de tres rayas abre una hoja con todo eso.

   Es un <dialog> modal (APG de WAI, «Dialog (Modal)»), porque tapa la página:
   `showModal()` deja el resto inerte, mete el foco dentro (en el primer
   enlace, que lleva `autofocus`) y cierra con Esc. Lo que el navegador no hace
   y se hace aquí, medido contra Vercel y Linear el 2026-10-09:
   - cerrar con un toque fuera de la hoja (`closedby="any"` aún no está en Safari);
   - cerrar al tocar un enlace, también las anclas de la misma página;
   - devolver el foco al botón al cerrar, y llevar `aria-expanded` al día;
   - cerrar si la pantalla se ensancha con la hoja abierta (girar el móvil).
   El scroll del fondo lo bloquea barra.css mientras la hoja está abierta.
   ========================================================================= */

(function () {
  'use strict';

  var hoja = document.getElementById('menu-movil');
  var boton = document.querySelector('[data-menu-abrir]');
  if (!hoja || !boton || typeof hoja.showModal !== 'function') return;

  function cerrar() {
    if (hoja.open) hoja.close();
  }

  boton.addEventListener('click', function () {
    hoja.showModal();
    boton.setAttribute('aria-expanded', 'true');
  });

  hoja.addEventListener('close', function () {
    boton.setAttribute('aria-expanded', 'false');
    boton.focus({ preventScroll: true });
  });

  var x = hoja.querySelector('[data-menu-cerrar]');
  if (x) x.addEventListener('click', cerrar);

  // En la guía el idioma cambia en el sitio: el botón de la hoja pulsa el de la
  // barra, que es el que sabe hacerlo (js/boot.js).
  Array.prototype.forEach.call(hoja.querySelectorAll('[data-idioma-toggle]'), function (b) {
    b.addEventListener('click', function () {
      var t = document.getElementById('idioma-toggle');
      if (t) t.click();
      cerrar();
    });
  });

  hoja.addEventListener('click', function (e) {
    // Un enlace cierra la hoja y deja navegar.
    if (e.target.closest && e.target.closest('a')) { cerrar(); return; }
    // El clic en el fondo le llega al propio <dialog>, pero también el de su
    // relleno: se mira si cayó fuera de la caja.
    if (e.target !== hoja) return;
    var r = hoja.getBoundingClientRect();
    var fuera = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (fuera) cerrar();
  });

  if (window.matchMedia) {
    var ancho = window.matchMedia('(min-width: 861px)');
    var alCambiar = function (m) { if (m.matches) cerrar(); };
    if (ancho.addEventListener) ancho.addEventListener('change', alCambiar);
  }
})();
