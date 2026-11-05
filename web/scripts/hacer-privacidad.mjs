/**
 * Genera las dos páginas de privacidad de la web:
 *
 *   /privacidad   ->  web/privacidad.html      (español)
 *   /en/privacy   ->  web/en/privacy.html      (inglés)
 *
 * Por qué generadas y no escritas a mano: un texto de privacidad en dos idiomas
 * que se edita en dos HTML enteros acaba diciendo cosas distintas en cada uno
 * (es lo que dice scripts/hacer-ingles.mjs de la portada, y aquí pesa más). El
 * texto vive en dos fragmentos, legal/privacidad.es.html y legal/privacy.en.html,
 * con la MISMA estructura (lo comprueba scripts/privacidad-web-check.mjs en
 * `pnpm comprobar`); la fecha y el correo, que no pueden repetirse, viven una
 * sola vez en legal/datos.mjs; y la cabecera, la barra y el pie salen de aquí.
 *
 * Los metadatos (canonical, hreflang, Open Graph) los pone después
 * scripts/poner-metadatos.mjs, igual que en la guía: aquí solo se deja su
 * bloque vacío. Los comentarios de taller que lleva el archivo generado no
 * viajan a la web construida: vite.config.js los quita de estas dos páginas.
 *
 * El correo va envuelto en `email_off`: sin eso, Cloudflare lo sustituye por
 * «[email protected]» y lo decodifica con un script, y estas páginas no
 * cargan ninguno.
 *
 * Se lanza con `node scripts/hacer-privacidad.mjs` desde web/; `pnpm build` y
 * `pnpm dev` ya lo hacen. Los resultados no se versionan (web/.gitignore).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACTUALIZADA, CORREO, IDIOMAS } from '../legal/datos.mjs'

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INICIO = '<!-- METADATOS:INICIO (los escribe scripts/poner-metadatos.mjs, no editar a mano) -->'
const FIN = '<!-- METADATOS:FIN -->'

/** Sin esto, un correo en claro sale como «[email protected]» servido por Cloudflare. */
export const correoEnlace = () =>
  `<!--email_off--><a href="mailto:${CORREO}">${CORREO}</a><!--/email_off-->`

/** Lo que una página puede cargar: lo suyo y nada más. No lleva scripts. */
export const POLITICA_DE_CONTENIDO =
  "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'"

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/** Rellena los dos huecos del fragmento y se niega a dejar ninguno sin rellenar. */
export function cuerpoDe(lang, { fecha = ACTUALIZADA } = {}) {
  const c = IDIOMAS[lang]
  if (!c) throw new Error(`idioma desconocido: ${lang}`)
  const crudo = readFileSync(resolve(WEB, 'legal', c.fragmento), 'utf8')
  const sinFecha = crudo.replaceAll('{{fecha}}', c.fechaEn(fecha))
  if (sinFecha === crudo) throw new Error(`${c.fragmento}: falta {{fecha}}`)
  const hecho = sinFecha.replaceAll('{{correo}}', correoEnlace())
  if (hecho === sinFecha) throw new Error(`${c.fragmento}: falta {{correo}}`)
  const resto = hecho.match(/\{\{[^}]*\}\}/)
  if (resto) throw new Error(`${c.fragmento}: queda ${resto[0]} sin rellenar`)
  return hecho.trim()
}

/** La página entera de un idioma, como texto. No escribe nada. */
export function renderizar(lang, opciones = {}) {
  const c = IDIOMAS[lang]
  // Las rutas locales son relativas al archivo: Vite las empaqueta, las renombra
  // con su huella y las reescribe en la web construida. /en/ está un nivel más abajo.
  const p = lang === 'en' ? '../' : './'
  const o = c.otra
  const pie = c.pie
  return `<!doctype html>
<!-- GENERADA por scripts/hacer-privacidad.mjs desde legal/: no se edita a mano. -->
<html lang="${c.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.titulo)}</title>
<meta name="description" content="${esc(c.descripcion)}">
${INICIO}
${FIN}
<meta http-equiv="Content-Security-Policy" content="${esc(POLITICA_DE_CONTENIDO)}">
<link rel="stylesheet" href="${p}fonts/fonts.css">
<link rel="icon" href="${p}assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${p}assets/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="${p}assets/favicon-180.png">
<link rel="stylesheet" href="${p}styles/base.css">
<link rel="stylesheet" href="${p}portada/barra.css">
<link rel="stylesheet" href="${p}styles/legal.css">
</head>
<body class="pagina-legal">
<a class="skip-link" href="#texto">${esc(c.saltar)}</a>

<header class="nav nav--fija" id="nav">
  <a class="nav__marca" href="${c.inicio}" aria-label="${esc(c.marcaAria)}">
    <img src="${p}assets/adeorq.svg" alt="" width="21" height="21">
    <b>Adeorq</b>
  </a>
  <nav class="nav__acciones" aria-label="${esc(c.barraAria)}">
    <a class="nav__enlace" href="/guia">${esc(c.guia)}</a>
    <a class="nav__idioma" href="${o.url}" hreflang="${o.lang}" lang="${o.lang}">${esc(o.texto)}</a>
  </nav>
</header>

<main class="legal" id="texto">
<article>
${cuerpoDe(lang, opciones)}
</article>
</main>

<footer class="legal-pie">
  <div class="legal-pie__caja">
    <a class="legal-pie__marca" href="${c.inicio}" aria-label="${esc(c.marcaAria)}">
      <img src="${p}assets/adeorq.svg" alt="" width="24" height="24">
      <b>Adeorq</b>
    </a>
    <nav class="legal-pie__enlaces" aria-label="${esc(pie.aria)}">
${pie.enlaces.map(([href, texto]) => `      <a href="${href}"${href.startsWith('http') ? ' rel="noopener"' : ''}>${esc(texto)}</a>`).join('\n')}
      <a href="${c.url}" aria-current="page">${esc(pie.actual)}</a>
    </nav>
    <p class="legal-pie__linea">${esc(pie.copyright)}</p>
  </div>
</footer>
</body>
</html>
`
}

export const ARCHIVOS = Object.fromEntries(Object.values(IDIOMAS).map((c) => [c.lang, c.archivo]))

/** Escribe las dos y devuelve lo que escribió. */
export function escribirTodas() {
  const hechas = []
  for (const c of Object.values(IDIOMAS)) {
    const ruta = resolve(WEB, c.archivo)
    const html = renderizar(c.lang)
    mkdirSync(dirname(ruta), { recursive: true })
    writeFileSync(ruta, html, 'utf8')
    hechas.push({ archivo: c.archivo, bytes: Buffer.byteLength(html) })
  }
  return hechas
}

// Al lanzarlo como script (no al importarlo desde la comprobación).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const { archivo, bytes } of escribirTodas()) console.log(`${archivo.padEnd(18)} -> ${bytes} bytes`)
}
