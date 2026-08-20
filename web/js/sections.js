/* ============================================================================
   Adeorq · web/js/sections.js
   Cuerpo de la landing: datos del release, changelog, micro interacciones y
   apertura animada de la FAQ.

   Lo que este archivo NO hace, a proposito:
     · Reveals: los monta la casa. base.css define [data-reveal] y hero.js lleva
       el observador, el reparto del retardo en [data-reveal-grupo] y el
       cinturon de seguridad. Aqui solo se revelan los nodos que este archivo
       inyecta despues, que el observador de hero.js no llego a ver.
     · Valvula de movimiento: es la del nav (boot.js), con memoria propia.

   Politica de movimiento de la casa:
     · --motion-gain multiplica RECORRIDO, nunca la opacidad.
     · Lo que dirige el usuario con el puntero (tilt, magnetismo) no se escala:
       el oido interno no protesta por lo que uno mismo provoca.
     · Solo se animan transform y opacity.
   ============================================================================ */

(function () {
  'use strict';

  var raiz = document.documentElement;

  /* Base de los datos publicos, resuelta desde la URL de ESTE script
     (js/sections.js -> data/). Da igual desde que pagina se incluya. */
  var DATOS = (function () {
    var s = document.currentScript;
    if (!s || !s.src) return 'data/';
    return s.src.replace(/[^/]*$/, '').replace(/js\/$/, '') + 'data/';
  })();

  var GAIN = (function () {
    var n = parseFloat(getComputedStyle(raiz).getPropertyValue('--motion-gain'));
    return isNaN(n) ? 1 : n;
  })();

  var FINO = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  var MAX_ENTRADAS = 6;   /* DISENO.md §10: seis en portada, el resto en el historial */

  /* --------------------------------------------------------- utilidades ---- */

  function pedirJson(ruta) {
    return fetch(ruta, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function fecha(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    try {
      return new Date(t).toLocaleDateString(raiz.lang === 'en' ? 'en-GB' : 'es-ES',
        { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return ''; }
  }

  function peso(bytes) {
    var mb = Number(bytes) / (1024 * 1024);
    if (!isFinite(mb) || mb <= 0) return '';
    var txt = mb.toFixed(1);
    return (raiz.lang === 'en' ? txt : txt.replace('.', ',')) + ' MB';
  }

  /* Texto que viene de fuera: se escapa SIEMPRE, y solo despues se permiten las
     dos marcas que trae el changelog, negrita y codigo. */
  function enLinea(txt) {
    var caja = document.createElement('div');
    caja.textContent = String(txt == null ? '' : txt);
    return caja.innerHTML
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  /* Los nodos que inyectamos nacen con opacity 0 (regla de base.css) y el
     observador de hero.js ya pasó de largo. Se revelan aqui, con retardo en
     cascada y sin dejar nunca contenido invisible. */
  function revelar(nodos) {
    nodos.forEach(function (n, i) {
      n.style.setProperty('--retardo', (i * 90) + 'ms');
      requestAnimationFrame(function () { n.classList.add('is-dentro'); });
      setTimeout(function () { n.classList.add('is-dentro'); }, 300 + i * 90);
    });
  }

  /* --------------------------------------------------------------- 1 · IDIOMA
     El cuerpo usa claves [data-content], que boot.js no recorre (el suyo es
     [data-i18n], del nav y el hero). Asi que el cambio de idioma de estas
     secciones se resuelve aqui, sin tocar boot.js: se escucha el atributo lang
     de <html>, que es quien lo cambia, y se repintan las claves.

     El espanol vive en el HTML, como manda content/README.md, asi que no hace
     falta pedir nada para leerlo. El diccionario ingles (content/en.json) solo
     se descarga si de verdad se pide ingles. */

  var BASE = DATOS.replace(/data\/$/, '');
  var ORIGINAL = null;      /* el HTML tal cual nacio: ese es el diccionario es */
  var INGLES = null;        /* cache del JSON, una sola descarga */

  /* Solo estas etiquetas se pintan como HTML. El resto va como texto plano, que
     es lo que salva a faq.2.r: lleva dentro Adeorq_<version>_x64-setup.exe y con
     innerHTML el navegador se comeria <version> como si fuera una etiqueta. */
  var ETIQUETAS = /<\/?(a|span|code|strong|em|br)\b/i;

  function nodosContenido() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-content]'));
  }

  function guardarOriginal() {
    if (ORIGINAL) return;
    ORIGINAL = Object.create(null);
    nodosContenido().forEach(function (n) {
      ORIGINAL[n.getAttribute('data-content')] = n.innerHTML;
    });
  }

  function pintar(dic) {
    nodosContenido().forEach(function (n) {
      var clave = n.getAttribute('data-content');
      var txt = dic[clave];
      if (txt == null) return;
      if (ETIQUETAS.test(txt)) n.innerHTML = txt;
      else n.textContent = txt;
    });
  }

  /* Cuantas versiones hay publicadas. Lo averigua changelog() leyendo el dato,
     y se guarda aqui porque pintar el idioma reescribe los nodos que lo
     muestran: sin esto, cambiar a ingles borraria el numero. */
  var CUANTAS = 0;
  var LOG = null;   /* changelog.json, guardado para repintar al cambiar de idioma */
  /* release.json, por lo mismo. Sin valor mientras no ha contestado el fetch,
     y null si contesto sin dato: son dos estados distintos, y confundirlos
     pintaria «ve a la pagina de descargas» antes de haber preguntado. */
  var REL;

  function pintarCuantas() {
    if (!CUANTAS) return;
    var en = raiz.lang === 'en';
    document.querySelectorAll('[data-log-cuantas]').forEach(function (n) {
      n.textContent = en ? CUANTAS + ' versions' : CUANTAS + ' versiones';
    });
    var todas = document.querySelector('[data-log-todas]');
    if (todas) {
      todas.textContent = en ? 'See all ' + CUANTAS + ' versions'
                             : 'Ver las ' + CUANTAS + ' versiones';
    }
  }

  function idioma() {
    guardarOriginal();
    pintarLog();
    pintarDescarga();

    if (raiz.lang !== 'en') { pintar(ORIGINAL); pintarCuantas(); return; }
    if (INGLES) { pintar(INGLES); pintarCuantas(); return; }
    if (!window.fetch) return;

    pedirJson(BASE + 'content/en.json').then(function (d) {
      if (!d) return;                     /* sin diccionario, se queda en espanol */
      INGLES = d;
      if (raiz.lang === 'en') { pintar(INGLES); pintarCuantas(); }
    });
  }

  function vigilarIdioma() {
    if (!window.MutationObserver) return;
    new MutationObserver(function (cambios) {
      for (var i = 0; i < cambios.length; i++) {
        if (cambios[i].attributeName === 'lang') { idioma(); return; }
      }
    }).observe(raiz, { attributes: true, attributeFilter: ['lang'] });
  }

  /* ------------------------------------------------- 2 · DATOS DEL RELEASE
     El dato lo genera el agente de datos en data/. Aqui solo se lee: si no hay
     nada, el HTML ya trae un enlace valido a la pagina de releases. */

  function descarga() {
    var caja = document.querySelector('[data-descarga]');
    if (!caja) return;
    if (!window.fetch) { caja.classList.remove('cargando'); return; }

    pedirJson(DATOS + 'release.json')
      .then(function (d) { return d || pedirJson(DATOS + 'latest.json'); })
      .then(function (d) {
        REL = d || null;
        pintarDescarga();
      })
      .catch(function () { caja.classList.remove('cargando'); });
  }

  /* Los tres textos de la caja de descarga se arman en JS con el dato del
     release, asi que tampoco los alcanza el intercambio de [data-content]: la
     fecha se quedaba en «publicada el 20 de agosto de 2026» con la web en
     ingles. Repintar entero es mas barato que traducir a mano cada trozo. */
  function pintarDescarga() {
    var caja = document.querySelector('[data-descarga]');
    if (!caja || REL === undefined) return;
    var d = REL;
    caja.classList.remove('cargando');

    var v = caja.querySelector('[data-descarga-version]');

    /* Sin dato no se promete ninguna version: el enlace del HTML ya lleva a
       la pagina de descargas, y el texto lo dice. */
    if (!d) {
      if (v) v.textContent = raiz.lang === 'en' ? 'Go to the downloads page'
                                                : 'Ir a la página de descargas';
      return;
    }

    var url = d.url ||
      (d.platforms && d.platforms['windows-x86_64'] && d.platforms['windows-x86_64'].url) || '';
    var version = d.version ? String(d.version).replace(/^v/, '') : '';

    var enlace = caja.querySelector('[data-descarga-enlace]');
    if (enlace && url) enlace.href = url;

    if (v) v.textContent = version ? 'v' + version
                                   : (raiz.lang === 'en' ? 'Latest version' : 'Última versión');

    var f = caja.querySelector('[data-descarga-fecha]');
    if (f && (d.pub_date || d.date)) {
      var cuando = fecha(d.pub_date || d.date);
      if (cuando) f.textContent = (raiz.lang === 'en' ? 'published on ' : 'publicada el ') + cuando;
    }

    var p = caja.querySelector('[data-descarga-peso]');
    if (p) {
      /* latest.json ya trae la etiqueta formateada; release.json trae bytes */
      var etiqueta = (d.windows && d.windows.sizeLabel) || peso(d.size_bytes);
      if (etiqueta) p.textContent = etiqueta;
    }

    /* La maqueta del hero lleva la version escrita en su barra: que sea la
       que de verdad se descarga, no la del dia en que se dibujo. */
    if (version) {
      document.querySelectorAll('[data-app-version]').forEach(function (n) {
        n.textContent = 'v' + version;
      });
    }
  }

  /* ---------------------------------------------------------- 3 · CHANGELOG */

  function changelog() {
    var host = document.querySelector('[data-log-entradas]');
    if (!host || !window.fetch) return;

    pedirJson(DATOS + 'changelog.json').then(function (d) {
      if (!d || !d.entries || !d.entries.length) return;
      LOG = d;
      pintarLog(host);

      /* El enlace del historial y la entradilla dicen cuantas hay de verdad, no
         un numero escrito a mano que envejece a la siguiente publicacion. */
      CUANTAS = d.count || d.entries.length;
      pintarCuantas();
    });
  }

  /* Esta lista es lo unico de la seccion que NO vive en el HTML, asi que el
     intercambio de claves [data-content] no la toca: sin repintarla a mano, la
     web en ingles enseñaba las novedades en español, que es justo lo que se veia
     (Munir, 2026-08-20). Cuelga de idioma(), que es el unico camino del cambio. */
  function pintarLog(host) {
    host = host || document.querySelector('[data-log-entradas]');
    if (!LOG || !host) return;
    var nuevas = LOG.entries.slice(0, MAX_ENTRADAS).map(nodoEntrada);
    host.innerHTML = '';
    nuevas.forEach(function (n) { host.appendChild(n); });
    revelar(nuevas);
  }

  /* Que texto de una entrada toca pintar.
     El generador guarda el español siempre y el ingles solo si el autor escribio
     las notas en los dos idiomas (marca `<!-- lang:en -->` en la release). Una
     version antigua sin traducir cae al español entera: media entrada en cada
     idioma se lee peor que una entrada coherente en el idioma equivocado. */
  function textoDe(e) {
    if (raiz.lang !== 'en' || !e.en) return e;
    return {
      title: e.en.title || e.title,
      summary: e.en.summary || '',
      items: (e.en.items && e.en.items.length) ? e.en.items : [],
      image: e.image,
    };
  }

  /* La marca de la izquierda: el generador la deduce de las palabras del texto
     español, que es el que siempre esta, y aqui solo se dice en el idioma de
     quien mira. */
  var MARCAS_EN = { nuevo: 'new', mejora: 'improved', arreglo: 'fix' };

  /* El generador arma a veces el resumen juntando los propios puntos. Si el
     resumen no aporta nada sobre la lista, se cae: repetir aburre. */
  function resumenRedundante(resumen, puntos) {
    if (!resumen || !puntos || !puntos.length) return false;
    var palabras = function (s) {
      return String(s).toLowerCase().replace(/[^\wáéíóúüñ\s]/g, ' ').split(/\s+/).filter(Boolean);
    };
    var enPuntos = Object.create(null);
    palabras(puntos.join(' ')).forEach(function (p) { enPuntos[p] = true; });
    var ps = palabras(resumen);
    if (!ps.length) return false;
    var dentro = 0;
    ps.forEach(function (p) { if (enPuntos[p]) dentro++; });
    return dentro / ps.length >= 0.85;
  }

  function nodoEntrada(e) {
    var art = document.createElement('article');
    art.className = 'entrada';
    art.setAttribute('data-reveal', '');

    var aside = document.createElement('aside');
    aside.className = 'entrada__aside';

    var t = document.createElement('time');
    t.className = 'entrada__fecha';
    if (e.date) { t.dateTime = e.date; t.textContent = fecha(e.date) || e.date; }
    aside.appendChild(t);

    if (e.version) {
      var v = document.createElement('span');
      v.className = 'entrada__version';
      v.textContent = 'v' + String(e.version).replace(/^v/, '');
      aside.appendChild(v);
    }

    if (e.tags && e.tags.length) {
      var marcas = document.createElement('span');
      marcas.className = 'entrada__marcas';
      e.tags.forEach(function (tag) {
        var k = String(tag).toLowerCase();
        var m = document.createElement('span');
        var clase = /nuev|new/.test(k) ? 'nuevo' : /mejor|improv/.test(k) ? 'mejora' : 'arreglo';
        m.className = 'marca-cambio marca-cambio--' + clase;
        m.textContent = raiz.lang === 'en' ? (MARCAS_EN[clase] || tag) : tag;
        marcas.appendChild(m);
      });
      aside.appendChild(marcas);
    }

    var cuerpo = document.createElement('div');
    cuerpo.className = 'entrada__cuerpo';

    e = textoDe(e);

    if (e.title) {
      var h = document.createElement('h3');
      h.className = 'titulo-3';
      h.innerHTML = enLinea(e.title);
      cuerpo.appendChild(h);
    }

    if (e.summary && !resumenRedundante(e.summary, e.items)) {
      var p = document.createElement('p');
      p.className = 'parrafo';
      p.innerHTML = enLinea(e.summary);
      cuerpo.appendChild(p);
    }

    if (e.items && e.items.length) {
      var ul = document.createElement('ul');
      ul.className = 'entrada__lista';
      e.items.forEach(function (it) {
        var li = document.createElement('li');
        li.innerHTML = enLinea(it);
        ul.appendChild(li);
      });
      cuerpo.appendChild(ul);
    }

    if (e.image) {
      var caja = document.createElement('div');
      caja.className = 'entrada__captura';
      var img = document.createElement('img');
      img.src = e.image;
      img.alt = e.title || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      caja.appendChild(img);
      cuerpo.appendChild(caja);
    }

    art.appendChild(aside);
    art.appendChild(cuerpo);
    return art;
  }

  /* ------------------------------------------------------ 4 · TILT DE MEDIA
     Movimiento dirigido por el puntero: no se multiplica por el dial. Se apaga
     sin puntero fino y con el dial a 0, donde se ha pedido quietud. */

  function tilt() {
    if (!FINO || GAIN === 0) return;
    var MAX = 3;   /* grados: acento corto, no atraccion de feria */

    document.querySelectorAll('[data-tilt]').forEach(function (tarjeta) {
      var media = tarjeta.querySelector('.tarjeta-f__media');
      if (!media) return;
      var pedido = 0;

      tarjeta.addEventListener('pointermove', function (e) {
        if (pedido) return;
        pedido = requestAnimationFrame(function () {
          pedido = 0;
          var r = media.getBoundingClientRect();
          if (!r.width || !r.height) return;
          var px = (e.clientX - r.left) / r.width - 0.5;
          var py = (e.clientY - r.top) / r.height - 0.5;
          media.style.setProperty('--tilt-y', (px * MAX * 2).toFixed(2) + 'deg');
          media.style.setProperty('--tilt-x', (-py * MAX * 2).toFixed(2) + 'deg');
        });
      });

      tarjeta.addEventListener('pointerleave', function () {
        media.style.setProperty('--tilt-x', '0deg');
        media.style.setProperty('--tilt-y', '0deg');
      });
    });
  }

  /* ---------------------------------------------------- 5 · BOTON MAGNETICO
     Tambien dirigido por el puntero. Usa la propiedad individual translate para
     no pisar el transform del :active que define base.css. */

  function magnetico() {
    if (!FINO || GAIN === 0) return;
    var TIRON = 0.2, TOPE = 8;

    document.querySelectorAll('[data-magnetico]').forEach(function (el) {
      var pedido = 0;

      el.addEventListener('pointermove', function (e) {
        if (pedido) return;
        pedido = requestAnimationFrame(function () {
          pedido = 0;
          var r = el.getBoundingClientRect();
          var dx = Math.max(-TOPE, Math.min(TOPE, (e.clientX - (r.left + r.width / 2)) * TIRON));
          var dy = Math.max(-TOPE, Math.min(TOPE, (e.clientY - (r.top + r.height / 2)) * TIRON));
          el.style.translate = dx.toFixed(1) + 'px ' + dy.toFixed(1) + 'px';
        });
      });

      el.addEventListener('pointerleave', function () { el.style.translate = '0px 0px'; });
    });
  }

  /* ---------------------------------------------------------------- 6 · FAQ
     <details> nativo, que funciona sin JS. Aqui solo se anima la altura real.
     Con el dial a 0 no se toca nada: abre y cierra a la manera del navegador. */

  function faq() {
    var lista = document.querySelector('[data-faq]');
    if (!lista || GAIN === 0 || !Element.prototype.animate) return;

    var items = Array.prototype.slice.call(lista.querySelectorAll('details'));
    var DUR = 320;

    items.forEach(function (d) {
      var panel = d.querySelector('.respuesta');
      var titular = d.querySelector('summary');
      if (!panel || !titular) return;
      var anim = null, cerrando = false;

      titular.addEventListener('click', function (e) {
        e.preventDefault();
        if (anim) anim.cancel();

        if (!d.open) {
          /* Solo una abierta a la vez: la lista se lee mejor */
          items.forEach(function (otro) { if (otro !== d) otro.open = false; });
          d.open = true;
          cerrando = false;
          anim = panel.animate(
            [{ height: '0px', opacity: 0 }, { height: panel.scrollHeight + 'px', opacity: 1 }],
            { duration: DUR, easing: 'cubic-bezier(.22,1,.36,1)' }
          );
        } else {
          cerrando = true;
          anim = panel.animate(
            [{ height: panel.scrollHeight + 'px', opacity: 1 }, { height: '0px', opacity: 0 }],
            { duration: DUR - 60, easing: 'cubic-bezier(.22,1,.36,1)' }
          );
        }

        anim.onfinish = function () {
          if (cerrando) d.open = false;
          panel.style.height = '';
          anim = null;
        };
      });
    });
  }

  /* --------------------------------------------------------------- ARRANQUE */

  function arrancar() {
    idioma();
    vigilarIdioma();
    descarga();
    changelog();
    tilt();
    magnetico();
    faq();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})();
