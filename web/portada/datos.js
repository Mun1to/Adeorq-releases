/* ===========================================================================
   Adeorq · portada/datos.js
   LOS NUMEROS DE LA PORTADA SALEN DEL JSON, NO DEL HTML.

   La version, la fecha, el peso del instalador y cuantas versiones se han
   publicado cambian cada pocos dias. Escritos a mano en el HTML envejecen en la
   siguiente publicacion y la portada se pone a mentir sola, que es peor que no
   decir nada.

   De donde salen: `/data/latest.json` y `/data/changelog.json`, los mismos dos
   ficheros que ya genera `scripts/update-data.mjs` con la API de GitHub.

   Regla que no se salta: el HTML servido YA trae un valor razonable en cada
   hueco. Esto solo lo ACTUALIZA. Quien lea la pagina sin ejecutar JavaScript
   (los buscadores la ejecutan, los asistentes que responden preguntas no) tiene
   que encontrar la version y el peso escritos, no huecos vacios.
   ========================================================================= */

(function () {
  'use strict';

  var DATOS = '/data/';
  /* La misma portada sirve en / y en /en/ (scripts/hacer-ingles.mjs): lo que se
     escribe desde aquí sigue el idioma de la página. */
  var EN = document.documentElement.lang === 'en';

  function traer(nombre) {
    return fetch(DATOS + nombre, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function poner(sel, texto) {
    var el = document.querySelector(sel);
    if (el && texto) el.textContent = texto;
  }

  /* Fecha larga en el idioma de la página. `toLocaleDateString` lo resuelve
     solo, y si el navegador no trae ese idioma cae en su formato por defecto,
     que sigue siendo una fecha legible. */
  function fecha(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    try {
      return d.toLocaleDateString(EN ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  }

  function peso(bytes) {
    if (!bytes) return '';
    var mb = (bytes / 1048576).toFixed(1);
    return (EN ? mb : mb.replace('.', ',')) + ' MB';
  }

  /* Hasta 190 letras, cortando en el último punto que quepa y, si no hay
     ninguno pasada la mitad, en la última palabra entera: a mitad de palabra
     («cuya rejilla na…») se leía como un fallo. vite.config.js hace lo mismo
     al dejarlas escritas en el HTML. */
  function corta(texto) {
    if (texto.length <= 190) return texto;
    var punto = texto.slice(0, 191).lastIndexOf('. ');
    if (punto >= 95) return texto.slice(0, punto + 1);
    var espacio = texto.slice(0, 188).lastIndexOf(' ');
    return texto.slice(0, espacio > 0 ? espacio : 187).replace(/[\s,;:.]+$/, '') + '…';
  }

  /* ── La descarga ──────────────────────────────────────────────────────── */

  /* Quien llega desde un Linux de escritorio ve arriba el botón de Linux, que
     lleva a la versión con sus tres paquetes. Android también dice «Linux» en
     su agente: a ese se le deja el de Windows, que es el del PC. */
  (function () {
    var ua = navigator.userAgent || '';
    if (!/Linux/i.test(ua) || /Android/i.test(ua)) return;
    var a = document.querySelector('[data-descarga-hero]');
    var t = document.querySelector('[data-descarga-hero-texto]');
    if (!a || !t) return;
    a.href = 'https://github.com/Mun1to/Adeorq-releases/releases/latest';
    t.textContent = EN ? 'Download for Linux' : 'Descargar para Linux';
  })();

  traer('latest.json').then(function (d) {
    if (!d) return;
    if (d.version) poner('[data-descarga-version]', 'v' + d.version);
    poner('[data-descarga-fecha]', fecha(d.pub_date));
    poner('[data-descarga-peso]', peso(d.size_bytes));

    /* El enlace NO se toca si ya apunta a `releases/latest/download`: esa forma
       entrega siempre la ultima y no caduca, mientras que la URL con el numero
       de version dentro se queda vieja en cuanto sale otra. */
    var a = document.querySelector('[data-descarga-enlace]');
    if (a && d.url && a.href.indexOf('/latest/download/') === -1) a.href = d.url;
  });

  /* ── Las novedades ────────────────────────────────────────────────────── */

  /* Un palito por día de los últimos 90, encendido el día que salió versión.
     La misma cuenta que hace el build (vite.config.js, bakeReleaseData). */
  function tira(entradas) {
    var caja = document.querySelector('[data-tira-dias]');
    if (!caja || !entradas.length) return;
    var dias = {};
    entradas.forEach(function (e) { dias[String(e.date || e.publishedAt || '').slice(0, 10)] = true; });
    var hoy = new Date();
    var html = '';
    var con = 0;
    for (var i = 89; i >= 0; i--) {
      var dia = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - i)).toISOString().slice(0, 10);
      if (dias[dia]) con++;
      html += dias[dia] ? '<i data-si></i>' : '<i></i>';
    }
    caja.innerHTML = html;
    poner('[data-tira-cuenta]', String(con));
  }

  traer('changelog.json').then(function (d) {
    if (!d) return;
    if (d.count) poner('[data-log-cuenta]', String(d.count));
    tira(d.entries || []);

    var lista = document.querySelector('[data-log]');
    if (!lista || !d.entries || !d.entries.length) return;

    /* Tres, y no todas: esto es una prueba de vida, no el changelog. Quien
       quiera el resto tiene el boton de debajo. El build ya las deja escritas
       en el HTML (vite.config.js, bakeReleaseData): se cambian, no se suman. */
    lista.textContent = '';
    d.entries.slice(0, 3).forEach(function (e) {
      var li = document.createElement('li');
      li.className = 'log__fila';

      var v = document.createElement('b');
      v.className = 'log__ver';
      v.textContent = e.version ? 'v' + e.version : (e.tag || '');

      var f = document.createElement('span');
      f.className = 'log__fecha';
      f.textContent = fecha(e.publishedAt || e.date);

      var t = document.createElement('p');
      t.className = 'log__texto';
      /* `summary` viene en Markdown: aqui solo se limpian los asteriscos de
         negrita y se corta. Meter un parser de Markdown por tres lineas seria
         cargar una libreria entera para nada. */
      /* En inglés, una versión de antes de que las notas trajeran inglés se
         queda con su resumen en español, marcado como tal. */
      var enIngles = EN && e.en ? (e.en.summary || e.en.title) : '';
      if (EN && !enIngles) t.lang = 'es';
      var texto = (enIngles || e.summary || e.title || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
      t.textContent = corta(texto);

      li.appendChild(v);
      li.appendChild(f);
      li.appendChild(t);
      lista.appendChild(li);
    });
  });
})();
