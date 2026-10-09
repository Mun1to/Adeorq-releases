/* ===========================================================================
   Adeorq · portada/idioma.js
   La portada vive en dos URL, / en español y /en/ en inglés (la segunda la
   genera scripts/hacer-ingles.mjs). Aquí solo se hacen dos cosas:

   1. Recordar la elección del enlace de idioma de la barra, con la misma clave
      que lee la guía (`adeorq-lang`), para que la guía se abra en el idioma
      que la persona eligió en la portada.
   2. SUGERIR el otro idioma si el navegador lo habla y nadie ha elegido
      todavía. Sugerir, nunca redirigir: Google rastrea sin cabecera de idioma
      y casi siempre desde Estados Unidos, así que con una redirección solo
      vería una de las dos versiones (Search Central, «Localized versions»).
   ========================================================================= */

(function () {
  'use strict';

  var CLAVE = 'adeorq-lang';
  var esta = document.documentElement.lang === 'en' ? 'en' : 'es';
  var otra = esta === 'en' ? 'es' : 'en';

  function guardar(lang) {
    try { localStorage.setItem(CLAVE, lang); } catch (e) {}
  }

  // El de la barra y el de la hoja del menú del móvil.
  var enlaces = document.querySelectorAll('[data-idioma]');
  var enlace = enlaces[0];
  if (!enlace) return;
  Array.prototype.forEach.call(enlaces, function (a) {
    a.addEventListener('click', function () { guardar(a.getAttribute('data-idioma')); });
  });

  // Lo que la persona eligió a mano gana siempre a lo que diga el navegador.
  var elegido = null;
  try { elegido = localStorage.getItem(CLAVE); } catch (e) {}
  if (elegido === 'es' || elegido === 'en') return;

  var lista = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
  if (String(lista[0] || '').slice(0, 2).toLowerCase() !== otra) return;

  var TEXTOS = {
    en: { frase: 'This page is also in English.', ir: 'Read it in English', no: 'No, thanks' },
    es: { frase: 'Esta página también está en español.', ir: 'Leerla en español', no: 'No, gracias' },
  };
  var t = TEXTOS[otra];

  var aviso = document.createElement('div');
  aviso.className = 'aviso-idioma';
  aviso.lang = otra;
  aviso.setAttribute('role', 'region');
  aviso.setAttribute('aria-label', t.frase);

  var frase = document.createElement('span');
  frase.textContent = t.frase;

  var ir = document.createElement('a');
  ir.className = 'aviso-idioma__ir';
  ir.href = enlace.getAttribute('href');
  ir.hreflang = otra;
  ir.textContent = t.ir;
  ir.addEventListener('click', function () { guardar(otra); });

  var no = document.createElement('button');
  no.type = 'button';
  no.className = 'aviso-idioma__no';
  no.textContent = t.no;
  no.addEventListener('click', function () {
    guardar(esta);
    aviso.remove();
  });

  aviso.appendChild(frase);
  aviso.appendChild(ir);
  aviso.appendChild(no);
  document.body.appendChild(aviso);
})();
