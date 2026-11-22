/**
 * El armazón de las páginas por búsqueda: la barra, el índice, las preguntas y el
 * pie de /guia, con sus mismas clases (styles/guia.css), escritos una vez por idioma.
 *
 * A diferencia de la guía, que cambia de idioma en el sitio, cada idioma tiene aquí su
 * URL: un buscador solo indexa lo que el servidor entrega, así que el texto va entero
 * en el HTML y el botón de idioma es un enlace a la otra página.
 */
import { RUTAS } from './rutas.mjs'

const INICIO = '<!-- METADATOS:INICIO (los escribe scripts/poner-metadatos.mjs, no editar a mano) -->'
const FIN = '<!-- METADATOS:FIN -->'

export const DESCARGA_WINDOWS = 'https://github.com/Mun1to/Adeorq-releases/releases/latest/download/Adeorq-setup.exe'
const REPO = 'https://github.com/Mun1to/Adeorq-releases'

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const rutaDe = (id) => RUTAS.find((r) => r.id === id)

/** Los textos que se repiten en todas: salen de la portada y de la guía, tal cual. */
export const COMUN = {
  es: {
    inicio: '/',
    saltar: 'Saltar al contenido',
    seccionesAria: 'Secciones',
    trabajo: 'Cómo trabaja',
    queEs: 'Qué hace',
    clientes: 'Clientes',
    movil: 'En el móvil',
    guia: 'Guía',
    codigo: 'Código',
    codigoGitHub: 'Código en GitHub',
    descargar: 'Descargar',
    menu: 'Menú',
    menuAbrir: 'Abrir el menú',
    menuCerrar: 'Cerrar el menú',
    otroIdioma: 'English',
    marcaAria: 'Adeorq, ir al inicio',
    migasAria: 'Estás en',
    indice: 'En esta página',
    indiceAria: 'Índice de la página',
    anclaAria: 'Enlace a esta sección',
    preguntas: 'Preguntas frecuentes',
    descargarWindows: 'Descargar para Windows',
    linuxMac: 'Linux y Mac',
    meta: ['Windows 10 y 11 · Linux · Mac con Apple Silicon', 'Gratis, sin cuenta', 'Funciona con tus suscripciones'],
    pie: {
      lema: 'El panel donde tus agentes trabajan en terminales de verdad. En Windows, Linux y Mac, y contigo en el móvil.',
      producto: 'Producto',
      recursos: 'Recursos',
      conLoQueUsas: 'Con lo que ya usas',
      novedades: 'Novedades',
      laGuia: 'La guía',
      versiones: 'Todas las versiones',
      privacidad: 'Privacidad',
      privacidadUrl: '/privacidad',
      licencia: 'Licencia',
      claudeWindows: 'Claude Code en Windows',
      variosClientes: 'Claude Code, Codex y Gemini',
      comparativa: 'Frente a Warp y otros',
      marcas:
        'No afiliado a Anthropic, OpenAI, Google ni Microsoft. Sus nombres y logotipos son marcas de sus titulares, y aquí sólo identifican con qué herramienta estás trabajando.',
      copyright: '© 2026 Adeorq · parte del ecosistema Orquio',
      cookies: 'Esta web no usa cookies ni te sigue.',
    },
  },
  en: {
    inicio: '/en/',
    saltar: 'Skip to content',
    seccionesAria: 'Sections',
    trabajo: 'How it works',
    queEs: 'What it does',
    clientes: 'Clients',
    movil: 'On your phone',
    guia: 'Guide',
    codigo: 'Code',
    codigoGitHub: 'Code on GitHub',
    descargar: 'Download',
    menu: 'Menu',
    menuAbrir: 'Open the menu',
    menuCerrar: 'Close the menu',
    otroIdioma: 'Español',
    marcaAria: 'Adeorq, go to the home page',
    migasAria: 'You are here',
    indice: 'On this page',
    indiceAria: 'Page index',
    anclaAria: 'Link to this section',
    preguntas: 'Frequent questions',
    descargarWindows: 'Download for Windows',
    linuxMac: 'Linux and Mac',
    meta: ['Windows 10 and 11 · Linux · Mac with Apple Silicon', 'Free, no account', 'Works with your own subscriptions'],
    pie: {
      lema: 'The panel where your agents work in real terminals. On Windows, Linux and Mac, and with you on your phone.',
      producto: 'Product',
      recursos: 'Resources',
      conLoQueUsas: 'With what you already use',
      novedades: 'What’s new',
      laGuia: 'The guide',
      versiones: 'All versions',
      privacidad: 'Privacy',
      privacidadUrl: '/en/privacy',
      licencia: 'Licence',
      claudeWindows: 'Claude Code on Windows',
      variosClientes: 'Claude Code, Codex and Gemini',
      comparativa: 'Against Warp and others',
      marcas:
        'Not affiliated with Anthropic, OpenAI, Google or Microsoft. Their names and logos are trademarks of their owners, and here they only identify which tool you are working with.',
      copyright: '© 2026 Adeorq · part of the Orquio ecosystem',
      cookies: 'This site uses no cookies and does not track you.',
    },
  },
}

/** Una sección del cuerpo, con su ancla como las de la guía. */
export function seccion(lang, id, titulo, html) {
  return `    <section id="${id}">
      <h2>${titulo}<a class="doc-ancla" href="#${id}" aria-label="${esc(COMUN[lang].anclaAria)}">#</a></h2>
${html}
    </section>`
}

export const parrafos = (...lista) => lista.map((p) => `      <p>${p}</p>`).join('\n')
export const lista = (items) =>
  `      <ul class="doc-lista">\n${items.map((i) => `        <li>${i}</li>`).join('\n')}\n      </ul>`
export const pasos = (items) =>
  `      <ol class="doc-pasos">\n${items.map((i) => `        <li>${i}</li>`).join('\n')}\n      </ol>`

/** Una captura de las que ya publica la web, en el idioma de la página. */
export function figura(lang, nombre, alt, pie) {
  const base = lang === 'en' ? '../' : ''
  return `      <figure class="doc-figura">
        <img src="${base}assets/screens/${lang}/${nombre}.png" width="1920" height="1080" loading="lazy" decoding="async" alt="${esc(alt)}">
        <figcaption>${pie}</figcaption>
      </figure>`
}

/**
 * Una tabla que en el móvil se lee en fichas: cada fila con su título arriba y cada dato
 * con el nombre de su columna, sin deslizar de lado (styles/paginas.css).
 */
export function tablaFichas(columnas, filas) {
  const cabecera = columnas.map((c) => `<th scope="col" role="columnheader">${c}</th>`).join('')
  const cuerpo = filas
    .map(
      ([titulo, ...datos]) =>
        `            <tr role="row"><th scope="row" role="rowheader">${titulo}</th>${datos
          .map((d, i) => `<td role="cell" data-etiqueta="${esc(columnas[i + 1])}">${d}</td>`)
          .join('')}</tr>`,
    )
    .join('\n')
  return `      <div class="doc-tabla doc-tabla--fichas">
        <table role="table">
          <thead role="rowgroup"><tr role="row">${cabecera}</tr></thead>
          <tbody role="rowgroup">
${cuerpo}
          </tbody>
        </table>
      </div>`
}

function barra(lang, ruta) {
  const c = COMUN[lang]
  const i = c.inicio
  const otro = lang === 'es' ? 'en' : 'es'
  const enlaces = `<a href="${i}#trabajo">${c.trabajo}</a>
    <a href="${i}#que-es">${c.queEs}</a>
    <a href="${i}#cinta">${c.clientes}</a>
    <a href="${i}#movil">${c.movil}</a>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">
  <symbol id="m-github" viewBox="0 0 24 24">
    <path fill="currentColor" d="M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943"/>
  </symbol>
</svg>
<header class="nav nav--fija" id="nav">
  <a class="nav__marca" href="${i}" aria-label="${esc(c.marcaAria)}">
    <img src="${lang === 'en' ? '../' : ''}assets/adeorq.svg" alt="" width="21" height="21">
    <b>Adeorq</b>
  </a>
  <nav class="nav__enlaces" aria-label="${esc(c.seccionesAria)}">
    ${enlaces}
    <a href="/guia">${c.guia}</a>
  </nav>
  <div class="nav__acciones">
    <a class="nav__idioma" href="${ruta[otro].url}" hreflang="${otro}" lang="${otro}">${c.otroIdioma}</a>
    <a class="nav__gh" href="${REPO}" rel="noopener" aria-label="${esc(c.codigoGitHub)}">
      <svg class="gh-marca" viewBox="0 0 24 24" aria-hidden="true"><use href="#m-github"/></svg>
      <span>${c.codigo}</span>
    </a>
    <a class="btn btn--claro btn--chico" href="${i}#descargar">${c.descargar}</a>
    <button class="nav__menu" type="button" aria-label="${esc(c.menuAbrir)}" data-etiqueta-cerrar="${esc(c.menuCerrar)}" aria-controls="menu-movil" aria-expanded="false" data-menu-abrir>
      <svg class="nav__menu-abre" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      <svg class="nav__menu-cierra" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
  </div>
  <div class="nav__panel" id="menu-movil">
    <nav aria-label="${esc(c.menu)}">
      <a href="${i}#trabajo">${c.trabajo}</a>
      <a href="${i}#que-es">${c.queEs}</a>
      <a href="${i}#cinta">${c.clientes}</a>
      <a href="${i}#movil">${c.movil}</a>
      <a href="${i}#descargar">${c.descargar}</a>
      <a href="/guia">${c.guia}</a>
      <hr>
      <a href="${REPO}" rel="noopener"><svg class="gh-marca" viewBox="0 0 24 24" aria-hidden="true"><use href="#m-github"/></svg><span>${c.codigoGitHub}</span></a>
      <a href="${ruta[otro].url}" hreflang="${otro}" lang="${otro}">${c.otroIdioma}</a>
    </nav>
  </div>
</header>`
}

function pie(lang, ruta, marcasExtra) {
  const c = COMUN[lang]
  const p = c.pie
  const i = c.inicio
  const enlace = (id, texto) => {
    const r = rutaDe(id)
    const actual = r.id === ruta.id ? ' aria-current="page"' : ''
    return `<li><a href="${r[lang].url}"${actual}>${texto}</a></li>`
  }
  return `<footer class="pie" id="pie">
  <div class="pie__inner">
    <div class="pie__rejilla">
      <div class="pie__marca">
        <a class="marca" href="${i}" aria-label="${esc(c.marcaAria)}">
          <img class="marca__logo" src="${lang === 'en' ? '../' : ''}assets/adeorq.svg" width="32" height="32" alt="" decoding="async">
          <span class="marca__texto">Adeorq</span>
        </a>
        <p class="pie__lema">${p.lema}</p>
      </div>

      <nav class="pie__col" aria-label="${esc(p.producto)}">
        <h2 class="pie__titulo">${p.producto}</h2>
        <ul>
          <li><a href="${i}#que-es">${c.queEs}</a></li>
          <li><a href="${i}#trabajo">${c.trabajo}</a></li>
          <li><a href="${i}#descargar">${c.descargar}</a></li>
          <li><a href="${i}#movil">${c.movil}</a></li>
        </ul>
      </nav>

      <nav class="pie__col" aria-label="${esc(p.recursos)}">
        <h2 class="pie__titulo">${p.recursos}</h2>
        <ul>
          ${enlace('novedades', p.novedades)}
          <li><a href="/guia">${p.laGuia}</a></li>
          <li><a href="${REPO}/releases" rel="noopener">${p.versiones}</a></li>
          <li><a href="${p.privacidadUrl}">${p.privacidad}</a></li>
          <li><a href="${REPO}/blob/main/LICENSE" rel="noopener">${p.licencia}</a></li>
        </ul>
      </nav>

      <nav class="pie__col" aria-label="${esc(p.conLoQueUsas)}">
        <h2 class="pie__titulo">${p.conLoQueUsas}</h2>
        <ul>
          ${enlace('claude-code-windows', p.claudeWindows)}
          ${enlace('claude-code-codex-gemini', p.variosClientes)}
          ${enlace('comparativa', p.comparativa)}
        </ul>
      </nav>
    </div>

    <p class="pie__contacto">${marcasExtra || p.marcas}</p>

    <div class="pie__bajo">
      <p>${p.copyright}</p>
      <p class="pie__privacidad">${p.cookies}</p>
    </div>
  </div>
</footer>`
}

function preguntas(lang, lista) {
  const c = COMUN[lang]
  const filas = lista
    .map(
      ({ q, a }) => `      <details class="doc-pregunta" name="faq">
        <summary>${q}</summary>
        <div class="doc-pregunta__cuerpo"><p>${a}</p></div>
      </details>`,
    )
    .join('\n')
  return `    <section id="faq">
      <h2>${c.preguntas}<a class="doc-ancla" href="#faq" aria-label="${esc(c.anclaAria)}">#</a></h2>
${filas}
    </section>`
}

/**
 * La página entera de un idioma, como texto. `t` trae lo suyo: titulo, descripcion,
 * miga, h1, entrada, indice ([id, texto]), cuerpo (HTML), preguntas, cierre y, si hace
 * falta, acciones, meta, marcas y clase.
 */
export function renderizar(ruta, lang, t) {
  const c = COMUN[lang]
  const base = lang === 'en' ? '../' : ''
  const acciones = t.acciones || [
    { href: DESCARGA_WINDOWS, texto: c.descargarWindows, principal: true },
    { href: `${c.inicio}#descargar`, texto: c.linuxMac },
  ]
  const boton = (a) =>
    `<a class="boton boton--grande ${a.principal ? 'boton--solido' : 'boton--fantasma'}" href="${a.href}"${a.href.startsWith('http') ? ' rel="noopener"' : ''}>${a.texto}</a>`
  const indice = [...t.indice, ['faq', c.preguntas]]
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.titulo)}</title>
<meta name="description" content="${esc(t.descripcion)}">
${INICIO}
${FIN}
<script>
(function () {
  var h = document.documentElement;
  var q = new URLSearchParams(location.search).get('motion');
  var saved = null;
  try { saved = localStorage.getItem('adeorq-motion'); } catch (e) {}
  var pref = q || saved;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var gain = pref === 'off' ? 0 : pref === 'full' ? 1 : reduce ? 0.25 : 1;
  h.style.setProperty('--motion-gain', String(gain));
  h.classList.toggle('motion', gain > 0);
})();
</script>
<link rel="stylesheet" href="${base}fonts/fonts.css">
<link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${base}assets/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="${base}assets/favicon-180.png">
<link rel="stylesheet" href="${base}styles/base.css">
<link rel="stylesheet" href="${base}styles/footer.css">
<link rel="stylesheet" href="${base}styles/guia.css">
<link rel="stylesheet" href="${base}portada/barra.css">
<link rel="stylesheet" href="${base}styles/paginas.css">
<script src="${base}js/guia.js" type="module"></script>
<script src="${base}portada/menu.js" defer></script>
</head>

<body>
<a class="skip-link" href="#doc-inicio">${c.saltar}</a>

${barra(lang, ruta)}

<main class="doc doc--busqueda${t.clase ? ` ${t.clase}` : ''}" id="doc-inicio">

  <div class="doc-portada">
    <nav class="doc-migas" aria-label="${esc(c.migasAria)}">
      <a href="${c.inicio}">Adeorq</a>
      <span aria-hidden="true">›</span>
      <span aria-current="page" data-miga>${t.miga}</span>
    </nav>
    <h1>${t.h1}</h1>
    <p>${t.entrada}</p>
    <div class="doc-portada__acciones">
      ${acciones.map(boton).join('\n      ')}
    </div>
    <div class="doc-portada__meta">
      ${(t.meta || c.meta).map((m) => `<span>${m}</span>`).join('\n      ')}
    </div>
  </div>

  <aside class="doc-indice" aria-label="${esc(c.indiceAria)}">
    <details open>
      <summary>${c.indice}</summary>
      <p class="doc-indice__titulo">${c.indice}</p>
      <ol>
        ${indice.map(([id, texto]) => `<li><a href="#${id}">${texto}</a></li>`).join('\n        ')}
      </ol>
    </details>
  </aside>

  <div class="doc-cuerpo">
${t.cuerpo}

${preguntas(lang, t.preguntas)}

    <div class="doc-cierre">
      <p>${t.cierre}</p>
      ${boton(acciones[0])}
    </div>
  </div>
</main>

${pie(lang, ruta, t.marcas)}
</body>
</html>
`
}
