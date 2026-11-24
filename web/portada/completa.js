/* ===========================================================================
   Adeorq · web/portada/completa.js
   LA DEMO A PANTALLA COMPLETA.

   Munir, 2026-11-23: «haz como orquio que puedan poner la demo en pantalla
   completa». Como en orquio.com, es una capa fija a toda la ventana y no la
   pantalla completa del navegador: esa, en el móvil, echa encima su aviso de
   «arrastra desde arriba para salir» (lo quitó en Orquio el 2026-11-10) y en
   iOS no existe para un <div>.

   La capa es la misma `.ventana` de la portada, que pasa a `position: fixed`
   con `data-demo-completa` en <html> (el dibujo, en portada.css). Así la demo
   no se recarga: sigue en la pantalla y con lo que se había tocado. Aquí solo:
     · el atributo, y el texto del botón de arriba («Cerrar» mientras dura);
     · el resto de la página, `inert` mientras tanto, para que el tabulador no
       se vaya detrás de la capa;
     · Escape y el «atrás» del móvil cierran (sin la entrada de historial, el
       atrás de Android sacaba de la web con la capa abierta);
     · avisar a la demo (`adeDemo.pantallaCompleta`), que sin página que bajar
       deja de ceder la rueda y el dedo;
     · y un `resize`, que es lo que ya escuchan la escala de la ventana
       (portada.js) y los bocadillos de Adeo dentro de la demo.
   ========================================================================= */

(function () {
  'use strict';

  var raiz = document.documentElement;
  var ventana = document.getElementById('ventana');
  var marco = document.getElementById('ventana-demo');
  var botones = Array.prototype.slice.call(document.querySelectorAll('[data-demo-completa]'));
  if (!ventana || !marco || !botones.length) return;

  var arriba = ventana.querySelector('.ventana__encima [data-demo-completa]');
  var texto = arriba && arriba.querySelector('[data-demo-completa-texto]');
  var EN = raiz.lang === 'en';
  var ABRIR = texto ? texto.textContent : (EN ? 'Full screen' : 'Pantalla completa');
  var CERRAR = EN ? 'Close' : 'Cerrar';

  var apagados = [];      // lo que se puso `inert` al abrir, para devolverlo
  var deDonde = null;     // el botón que la abrió: al cerrar vuelve ahí el foco
  var yAntes = 0;         // dónde estaba la página, por si algo la movió debajo
  var conHistoria = false;
  var saltarVuelta = false;   // el `popstate` que provoca nuestro propio `history.back()`

  function abierta() { return raiz.hasAttribute('data-demo-completa'); }

  function demo() {
    try { return marco.contentWindow && marco.contentWindow.adeDemo; } catch (e) { return null; }
  }

  /* La demo puede estar llegando (valvula.js la trae con el primer gesto, que
     es este mismo clic): se insiste unos segundos, como pestanas.js. */
  function avisarALaDemo(si, intentos) {
    if (abierta() !== si) return;
    var d = demo();
    if (d && d.pantallaCompleta) d.pantallaCompleta(si);
    else if (intentos > 0) setTimeout(function () { avisarALaDemo(si, intentos - 1); }, 150);
  }

  /* Todo lo que no es la capa, de ella hacia arriba hasta <body>. */
  function apagarElResto() {
    for (var el = ventana; el && el.parentElement && el !== document.body; el = el.parentElement) {
      var hermanos = el.parentElement.children;
      for (var i = 0; i < hermanos.length; i++) {
        var h = hermanos[i];
        if (h === el || h.inert || h.tagName === 'SCRIPT' || h.tagName === 'STYLE') continue;
        h.inert = true;
        apagados.push(h);
      }
    }
  }
  function encenderElResto() {
    apagados.forEach(function (h) { h.inert = false; });
    apagados = [];
  }

  function remedir() { dispatchEvent(new Event('resize')); }

  function abrir(boton) {
    if (abierta()) return;
    deDonde = boton;
    yAntes = scrollY;
    raiz.setAttribute('data-demo-completa', '');
    apagarElResto();
    if (texto) texto.textContent = CERRAR;
    if (arriba) arriba.title = EN ? 'Close full screen (Esc)' : 'Salir de la pantalla completa (Esc)';
    try {
      history.pushState({ demoCompleta: true }, '');
      conHistoria = true;
    } catch (e) { conHistoria = false; }
    remedir();
    avisarALaDemo(true, 40);
    if (arriba) arriba.focus({ preventScroll: true });
  }

  function cerrar(desdeLaHistoria) {
    if (!abierta()) return;
    // La ventana lleva la transición de su entrada (1 s): al volver del giro del
    // móvil, se deshacía girando y la escala se medía a medias (la demo se
    // quedaba a la mitad de su tamaño). Vuelve a su sitio de golpe.
    ventana.style.transition = 'none';
    raiz.removeAttribute('data-demo-completa');
    void ventana.offsetWidth;
    requestAnimationFrame(function () { ventana.style.transition = ''; });
    encenderElResto();
    if (texto) texto.textContent = ABRIR;
    if (arriba) arriba.removeAttribute('title');
    if (Math.abs(scrollY - yAntes) > 1) scrollTo(0, yAntes);
    remedir();
    avisarALaDemo(false, 0);
    if (deDonde) deDonde.focus({ preventScroll: true });
    deDonde = null;
    // Cerrada con el botón o con Escape: se quita también su entrada del
    // historial, o el siguiente «atrás» no haría nada visible.
    if (conHistoria && !desdeLaHistoria) {
      saltarVuelta = true;
      history.back();
    }
    conHistoria = false;
  }

  botones.forEach(function (b) {
    b.addEventListener('click', function () {
      if (abierta()) cerrar(false);
      else abrir(b);
    });
  });

  addEventListener('popstate', function () {
    if (saltarVuelta) { saltarVuelta = false; return; }
    if (abierta()) cerrar(true);
  });

  /* Escape, desde la portada. Si la demo está en su recorrido, Escape es para
     saltarlo (explica.js lo oye también aquí) y la capa se queda. Con el foco
     dentro de la demo, Escape es de la demo, como en la app; para salir está
     «Cerrar» arriba. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || e.defaultPrevented || !abierta()) return;
    var d = demo();
    if (d && d.enRecorrido && d.enRecorrido()) return;
    cerrar(false);
  });
})();
