/* ===========================================================================
   Adeorq · portada/menu.js
   El menú del móvil de la barra compartida (portada/barra.css), en la portada,
   la guía y las páginas sueltas. Por debajo de 861 px la barra esconde las
   secciones, «Código» y el idioma; el botón de tres rayas hace que la barra
   MISMA crezca hacia abajo con todo eso dentro, como el de winshotx.com
   (Munir, 2026-11-21: «haz como winshot aquí el menú en móvil, míralo cómo lo
   tiene montado»). Hasta entonces era una hoja modal suelta debajo de la barra.

   Es un menú que se despliega (APG de WAI, «Disclosure Navigation Menu»), no
   un diálogo: no tapa la página ni la deja inerte. Aquí solo se cambia de
   estado (`data-menu-abierto` en la barra y `aria-expanded` en el botón); el
   movimiento es de barra.css. Y lo que el navegador no hace solo:
   - al abrir, el foco va a la primera página; Escape cierra y lo devuelve al
     botón;
   - cierra al elegir una página (también las anclas de la misma página), al
     tocar fuera de la barra y si la pantalla se ensancha (girar el móvil);
   - el nombre del botón dice lo que hará: «Abrir el menú» o «Cerrar el menú»
     (`data-etiqueta-cerrar`, que traduce la versión inglesa; en la guía,
     también `data-i18n-cerrar`).
   ========================================================================= */

(function () {
  'use strict';

  var panel = document.getElementById('menu-movil');
  var boton = document.querySelector('[data-menu-abrir]');
  var barra = boton && boton.closest('.nav');
  if (!panel || !boton || !barra) return;

  // Los dos nombres del botón. La portada y las páginas sueltas tienen una URL
  // por idioma y ya los traen traducidos. La guía cambia de idioma en el sitio
  // (js/boot.js), así que en inglés salen de su diccionario (js/guia-i18n.js),
  // por las claves del propio botón; en español, de sus atributos, porque
  // boot.js ya puede haber pasado el aria-label al inglés antes de llegar aquí.
  var nombreAbrir = boton.getAttribute('data-etiqueta-abrir') || boton.getAttribute('aria-label');
  var nombreCerrar = boton.getAttribute('data-etiqueta-cerrar');

  function nombre(abrir) {
    var extra = window.ADEORQ_I18N_EXTRA;
    var dic = document.documentElement.lang === 'en' && extra && extra.en;
    var clave = boton.getAttribute(abrir ? 'data-i18n-aria' : 'data-i18n-cerrar');
    return (dic && clave && dic[clave]) || (abrir ? nombreAbrir : nombreCerrar);
  }

  function abierto() {
    return barra.hasAttribute('data-menu-abierto');
  }

  // Mientras se recoge (0,3 s en barra.css), la barra sigue por encima de lo
  // que flota: si bajara de capa al pulsar, el aviso de idioma y «Parar el
  // movimiento» asomarían encima del menú que se está cerrando. El reloj solo
  // se cancela al abrir o al volver a cerrar: un toque en un enlace mientras se
  // recoge cierra otra vez un menú ya cerrado, y cancelarlo ahí dejaría la
  // marca puesta hasta la siguiente vez que se abriera.
  var relojCerrando = 0;

  function poner(abrir, foco) {
    if (abrir) {
      clearTimeout(relojCerrando);
      barra.removeAttribute('data-menu-cerrando');
      barra.setAttribute('data-menu-abierto', '');
    } else if (abierto()) {
      clearTimeout(relojCerrando);
      barra.removeAttribute('data-menu-abierto');
      barra.setAttribute('data-menu-cerrando', '');
      relojCerrando = setTimeout(function () { barra.removeAttribute('data-menu-cerrando'); }, 350);
    }
    boton.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    if (nombreCerrar) boton.setAttribute('aria-label', nombre(!abrir));
    if (!foco) return;
    if (abrir) {
      var primero = panel.querySelector('a, button');
      if (primero) primero.focus({ preventScroll: true });
    } else {
      boton.focus({ preventScroll: true });
    }
  }

  boton.addEventListener('click', function () {
    var abrir = !abierto();
    poner(abrir, abrir);
  });

  // En la guía el idioma cambia en el sitio: el botón del menú pulsa el de la
  // barra, que es el que sabe hacerlo (js/boot.js).
  Array.prototype.forEach.call(panel.querySelectorAll('[data-idioma-toggle]'), function (b) {
    b.addEventListener('click', function () {
      var t = document.getElementById('idioma-toggle');
      if (t) t.click();
      poner(false, false);
    });
  });

  // Una página cierra el menú y deja navegar.
  panel.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('a')) poner(false, false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && abierto()) poner(false, true);
  });

  document.addEventListener('click', function (e) {
    if (abierto() && !barra.contains(e.target)) poner(false, false);
  });

  // Un toque dentro de la demo (un <iframe>) no le llega a esta página: lo que
  // sí llega es que la ventana pierde el foco, que se va al marco.
  window.addEventListener('blur', function () {
    setTimeout(function () {
      var f = document.activeElement;
      if (abierto() && f && f.tagName === 'IFRAME') poner(false, false);
    }, 0);
  });

  if (window.matchMedia) {
    var ancho = window.matchMedia('(min-width: 861px)');
    var alCambiar = function (m) { if (m.matches && abierto()) poner(false, false); };
    if (ancho.addEventListener) ancho.addEventListener('change', alCambiar);
  }
})();
