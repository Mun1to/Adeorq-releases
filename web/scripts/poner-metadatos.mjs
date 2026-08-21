/**
 * Pone las metaetiquetas de descubrimiento en las paginas de la web.
 *
 * Por que un script y no editarlo a mano: son cuatro bloques largos que tienen
 * que decir lo MISMO en varias paginas (canonical, Open Graph, Twitter Card) y
 * que envejecen a la vez. Escritos a mano se separan en cuanto se toca uno.
 * Aqui se declaran una vez, se escriben entre marcas y se pueden volver a
 * lanzar tantas veces como haga falta sin duplicar nada.
 *
 * El JSON-LD de las preguntas frecuentes se SACA del propio HTML: marcar algo
 * que no esta visible en la pagina es motivo de penalizacion, asi que la unica
 * forma de que no mienta es que salga de lo que ya se ve.
 *
 * Se lanza con `pnpm metadatos` desde web/.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(AQUI, '..')

const SITIO = 'https://adeorq.com'

/**
 * La tarjeta social, con la huella de su contenido detras. Sin esto, cambiar el
 * dibujo no cambia la URL, y el borde de Cloudflare sirve el anterior durante un
 * ano entero: las respuestas de /assets/ se marcan `immutable`. Paso el
 * 2026-08-21 con la version equivocada de esta misma imagen.
 */
function tarjeta() {
  try {
    const huella = createHash('sha256').update(readFileSync(resolve(WEB, 'assets/og.png'))).digest('hex').slice(0, 8)
    return `${SITIO}/assets/og.png?v=${huella}`
  } catch {
    // Sin imagen no se anuncia ninguna: una og:image rota se ve peor que ninguna.
    return null
  }
}
const INICIO = '<!-- METADATOS:INICIO (los escribe scripts/poner-metadatos.mjs, no editar a mano) -->'
const FIN = '<!-- METADATOS:FIN -->'

/** Las paginas indexables, con lo suyo. El orden es el del sitemap. */
const PAGINAS = [
  {
    archivo: 'index.html',
    url: '/',
    tipo: 'website',
    titulo: 'Adeorq · todos tus agentes en una sola pantalla',
    descripcion:
      'Panel de escritorio para Windows y Linux: Claude Code, Codex, Gemini y 19 clientes mas ' +
      'trabajando a la vez en terminales de verdad, con tus proyectos a un clic. Gratis, sin cuenta y sin claves de API.',
    prioridad: '1.0',
    frecuencia: 'weekly',
  },
  {
    archivo: 'guia.html',
    url: '/guia',
    tipo: 'article',
    titulo: 'Guia de Adeorq · como se usa la cabina',
    descripcion:
      'Que hace cada pantalla de Adeorq, como se instala, los estados de una sesion, ' +
      'los objetivos del dia, los atajos y donde guarda tus cosas.',
    prioridad: '0.8',
    frecuencia: 'monthly',
  },
]

/** Quita las etiquetas y deja el texto plano, para el JSON-LD. */
const soloTexto = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Saca las preguntas frecuentes del HTML servido. Si la portada deja de tener
 * seccion de preguntas, esto devuelve una lista vacia y el JSON-LD de FAQ
 * simplemente no se escribe: nunca inventa una pregunta que no este en pantalla.
 */
function preguntasDe(html) {
  const seccion = html.match(/<section[^>]*id="faq"[\s\S]*?<\/section>/)
  if (!seccion) return []
  const pares = [...seccion[0].matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)]
  return pares
    .map(([, q, a]) => ({ pregunta: soloTexto(q), respuesta: soloTexto(a) }))
    .filter((p) => p.pregunta && p.respuesta)
}

const IMAGEN = tarjeta()

/** El bloque de cabecera de una pagina. */
function metadatos(pagina, extras) {
  const abs = SITIO + pagina.url
  return [
    INICIO,
    `<link rel="canonical" href="${abs}">`,
    '',
    '<!-- Verificacion de Bing Webmaster Tools. No es un secreto: esta etiqueta',
    '     existe justo para ser publica, y es lo que demuestra que el sitio es de',
    '     Munir. Si se borra, Bing deja de aceptar el sitemap. -->',
    '<meta name="msvalidate.01" content="CD7CA7AEA44C5A3B1F2A0850BFC21F57">',
    '',
    '<meta name="color-scheme" content="dark light">',
    '<meta name="theme-color" content="#05080e">',
    '',
    '<!-- Open Graph: esto es lo que se ve al pegar el enlace en WhatsApp,',
    '     LinkedIn o Slack. No posiciona, pero es lo primero que nota alguien. -->',
    `<meta property="og:type" content="${pagina.tipo}">`,
    '<meta property="og:site_name" content="Adeorq">',
    '<meta property="og:locale" content="es_ES">',
    `<meta property="og:url" content="${abs}">`,
    `<meta property="og:title" content="${pagina.titulo}">`,
    `<meta property="og:description" content="${pagina.descripcion}">`,
    ...(IMAGEN
      ? [
          `<meta property="og:image" content="${IMAGEN}">`,
          '<meta property="og:image:width" content="1200">',
          '<meta property="og:image:height" content="630">',
          '<meta property="og:image:alt" content="Adeorq: all your agents, one single screen">',
        ]
      : []),
    '',
    `<meta name="twitter:card" content="${IMAGEN ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${pagina.titulo}">`,
    `<meta name="twitter:description" content="${pagina.descripcion}">`,
    ...(IMAGEN ? [`<meta name="twitter:image" content="${IMAGEN}">`] : []),
    ...extras,
    FIN,
  ].join('\n')
}

/** Los datos estructurados de la portada. Solo describen lo que se ve. */
function jsonLdPortada(preguntas) {
  const grafo = [
    {
      '@type': 'WebSite',
      '@id': `${SITIO}/#sitio`,
      url: `${SITIO}/`,
      name: 'Adeorq',
      inLanguage: 'es-ES',
      publisher: { '@id': `${SITIO}/#autor` },
    },
    {
      '@type': 'Person',
      '@id': `${SITIO}/#autor`,
      name: 'Munir Torres',
      alternateName: 'Munito',
      url: `${SITIO}/`,
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITIO}/#app`,
      name: 'Adeorq',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Windows, Linux',
      url: `${SITIO}/`,
      author: { '@id': `${SITIO}/#autor` },
      downloadUrl: 'https://github.com/Mun1to/Adeorq-releases/releases/latest',
      softwareHelp: `${SITIO}/guia`,
      screenshot: IMAGEN,
      description:
        'Panel de escritorio que ejecuta clientes de agente de IA en terminales reales: ' +
        'Claude Code, Codex, Gemini CLI, Copilot, Cursor y otros, en una sola ventana.',
      // Sin softwareVersion a proposito: un numero escrito aqui envejece solo, y
      // la version real ya la pinta datos.js desde data/latest.json.
      // Sin aggregateRating: no hay valoraciones reales que declarar.
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
      },
    },
  ]

  if (preguntas.length) {
    grafo.push({
      '@type': 'FAQPage',
      '@id': `${SITIO}/#preguntas`,
      mainEntity: preguntas.map((p) => ({
        '@type': 'Question',
        name: p.pregunta,
        acceptedAnswer: { '@type': 'Answer', text: p.respuesta },
      })),
    })
  }

  const doc = { '@context': 'https://schema.org', '@graph': grafo }
  return [
    '',
    '<!-- Datos estructurados. Describen SOLO lo que se ve en la pagina: las',
    '     preguntas salen de la propia seccion #faq, no de una lista aparte. -->',
    '<script type="application/ld+json">',
    JSON.stringify(doc, null, 2),
    '</script>',
  ]
}

function jsonLdGuia() {
  const doc = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: 'Guia de Adeorq',
    description: 'Como se usa Adeorq: cada pantalla, la instalacion, los atajos y donde guarda tus cosas.',
    inLanguage: 'es-ES',
    url: `${SITIO}/guia`,
    author: { '@type': 'Person', name: 'Munir Torres' },
    about: { '@type': 'SoftwareApplication', name: 'Adeorq' },
  }
  return ['', '<script type="application/ld+json">', JSON.stringify(doc, null, 2), '</script>']
}

/** El <title> que ya trae la pagina. Es la fuente del og:title. */
function tituloDe(html, porDefecto) {
  const m = html.match(/<title>([^<]*)<\/title>/)
  return m && m[1].trim() ? m[1].trim() : porDefecto
}

/** Mete el bloque en el head, o sustituye el que ya hubiera. */
function escribir(pagina, bloque) {
  const ruta = resolve(WEB, pagina.archivo)
  let html = readFileSync(ruta, 'utf8')

  const yaEsta = html.indexOf(INICIO)
  if (yaEsta >= 0) {
    const fin = html.indexOf(FIN, yaEsta)
    if (fin < 0) throw new Error(`${pagina.archivo}: hay marca de inicio y no de fin`)
    html = html.slice(0, yaEsta) + bloque + html.slice(fin + FIN.length)
  } else {
    // Detras de la descripcion, que es donde un humano lo buscaria.
    const desc = html.match(/<meta name="description"[^>]*>/)
    if (!desc) throw new Error(`${pagina.archivo}: no tiene <meta name="description"> donde anclar`)
    const corte = html.indexOf(desc[0]) + desc[0].length
    html = html.slice(0, corte) + '\n' + bloque + html.slice(corte)
  }

  writeFileSync(ruta, html, 'utf8')
  return html
}

// ---------------------------------------------------------------------------

const portada = readFileSync(resolve(WEB, 'index.html'), 'utf8')
const preguntas = preguntasDe(portada)

for (const pagina of PAGINAS) {
  const extras = pagina.archivo === 'index.html' ? jsonLdPortada(preguntas) : jsonLdGuia()
  const html = readFileSync(resolve(WEB, pagina.archivo), 'utf8')
  pagina.titulo = tituloDe(html, pagina.titulo)
  escribir(pagina, metadatos(pagina, extras))
  console.log(`${pagina.archivo.padEnd(12)} -> ${SITIO}${pagina.url}`)
}
console.log(`preguntas frecuentes marcadas: ${preguntas.length}`)

// --- sitemap ---------------------------------------------------------------
// Solo las paginas indexables. Nada que lleve noindex ni nada que redirija:
// meter una URL redirigida en el sitemap es mandarle dos senales contrarias.
const hoy = process.env.FECHA_SITEMAP || new Date().toISOString().slice(0, 10)
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">'.replace('www.sitemap.org', 'www.sitemaps.org'),
  ...PAGINAS.flatMap((p) => [
    '  <url>',
    `    <loc>${SITIO}${p.url}</loc>`,
    `    <lastmod>${hoy}</lastmod>`,
    `    <changefreq>${p.frecuencia}</changefreq>`,
    `    <priority>${p.prioridad}</priority>`,
    '  </url>',
  ]),
  '</urlset>',
  '',
].join('\n')
writeFileSync(resolve(WEB, 'sitemap.xml'), sitemap, 'utf8')
console.log(`sitemap.xml  -> ${PAGINAS.length} URLs, lastmod ${hoy}`)
