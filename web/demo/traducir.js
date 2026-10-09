/* ===========================================================================
   Adeorq · demo/traducir.js
   La maqueta en inglés, para la portada de adeorq.com/en/. Con `?lang=en`,
   cada texto que sea EXACTAMENTE una clave de DEMO_EN se cambia por su
   inglés, y lo mismo en title, placeholder y aria-label. También lo que la
   maqueta pinta después: cambiar de pantalla rehace el DOM, así que un
   observador traduce lo que entra.

   DEMO_EN sale de dos archivos que se cargan antes que este:
   - demo/en-app.js, generado desde el diccionario de la app (src/lib/i18n.ts);
   - demo/en.js, lo que es solo de la maqueta (conversaciones, notas, temas).

   Va como script clásico y ANTES que los módulos de la maqueta, porque deja
   puesta `window.adeTraducir`: las terminales escriben letra a letra, y un
   texto traducido al final saltaría de un idioma a otro delante de quien mira.
   terminal.js traduce la frase entera antes de empezar a teclearla.
   ========================================================================= */

(function () {
  'use strict';

  var ingles = new URLSearchParams(location.search).get('lang') === 'en';
  var D = window.DEMO_EN || {};
  var ATRS = ['title', 'placeholder', 'aria-label'];

  /* Lo que cambia con el día o con un número y no cabe en un diccionario: la
     fecha de la Agenda (vistas.js) y el contador del pie (demo.js). */
  var DIAS = { DOMINGO: 'SUNDAY', LUNES: 'MONDAY', MARTES: 'TUESDAY', 'MIÉRCOLES': 'WEDNESDAY',
    JUEVES: 'THURSDAY', VIERNES: 'FRIDAY', 'SÁBADO': 'SATURDAY' };
  var MESES = { ENERO: 'JANUARY', FEBRERO: 'FEBRUARY', MARZO: 'MARCH', ABRIL: 'APRIL', MAYO: 'MAY',
    JUNIO: 'JUNE', JULIO: 'JULY', AGOSTO: 'AUGUST', SEPTIEMBRE: 'SEPTEMBER', OCTUBRE: 'OCTOBER',
    NOVIEMBRE: 'NOVEMBER', DICIEMBRE: 'DECEMBER' };
  var PATRONES = [
    [/^(\S+) (\d{1,2}) DE (\S+)$/, function (m, d, n, mes) {
      return DIAS[d] && MESES[mes] ? DIAS[d] + ' ' + n + ' ' + MESES[mes] : m;
    }],
    [/^(\d+) terminal(?:es)? ConPTY activas? · (\d+) errores$/, function (m, n, e) {
      return n + ' ConPTY terminal' + (n === '1' ? '' : 's') + ' active · ' + e + ' error' + (e === '1' ? '' : 's');
    }],
    // El contador de la búsqueda de la Memoria (pantallas.js).
    [/^(\d+) resultados?$/, function (m, n) { return n + ' result' + (n === '1' ? '' : 's'); }],
  ];

  function enIngles(s) {
    if (!ingles || typeof s !== 'string') return s;
    var t = s.replace(/\s+/g, ' ').trim();
    if (Object.prototype.hasOwnProperty.call(D, t)) return s.replace(s.trim(), D[t]);
    for (var i = 0; i < PATRONES.length; i++) {
      if (PATRONES[i][0].test(t)) return s.replace(s.trim(), t.replace(PATRONES[i][0], PATRONES[i][1]));
    }
    return s;
  }
  window.adeTraducir = enIngles;
  if (!ingles) return;

  document.documentElement.lang = 'en';

  function texto(n) {
    var v = n.nodeValue;
    if (!v || !v.trim()) return;
    var nuevo = enIngles(v);
    if (nuevo !== v) n.nodeValue = nuevo;
  }

  function atributos(el) {
    for (var i = 0; i < ATRS.length; i++) {
      var a = el.getAttribute(ATRS[i]);
      if (!a) continue;
      var nuevo = enIngles(a);
      if (nuevo !== a) el.setAttribute(ATRS[i], nuevo);
    }
  }

  function recorrer(raiz) {
    if (raiz.nodeType === 3) return texto(raiz);
    if (raiz.nodeType !== 1 || raiz.tagName === 'SCRIPT' || raiz.tagName === 'STYLE') return;
    atributos(raiz);
    var w = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        return n.nodeType === 1 && (n.tagName === 'SCRIPT' || n.tagName === 'STYLE')
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    for (var n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 3) texto(n); else atributos(n);
    }
  }

  function arrancar() {
    recorrer(document.body);
    new MutationObserver(function (cambios) {
      for (var i = 0; i < cambios.length; i++) {
        var c = cambios[i];
        if (c.type === 'characterData') texto(c.target);
        else if (c.type === 'attributes') atributos(c.target);
        else for (var j = 0; j < c.addedNodes.length; j++) recorrer(c.addedNodes[j]);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRS });
  }

  if (document.body) arrancar();
  else document.addEventListener('DOMContentLoaded', arrancar);
})();
