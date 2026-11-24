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

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { IDIOMAS, RUTAS } from '../paginas/rutas.mjs'
import { clientesDeLaWeb } from './extraer-clientes.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(AQUI, '..')

const SITIO = 'https://adeorq.com'

/**
 * Cuántos clientes más, aparte de los tres que se nombran en la descripción. Se
 * cuenta de `src/lib/providers.ts`, la lista de verdad, como ya hacen la cinta
 * de logos y la tarjeta social: escrito a mano decía «19 más» con 11 en el
 * catálogo (2026-11-16, al quitar once). Sin los que la web no enseña
 * (`FUERA_DE_LA_WEB` en extraer-clientes.mjs).
 */
function otrosClientes() {
  const total = clientesDeLaWeb().length
  if (total < 5) throw new Error(`providers.ts solo da ${total} clientes: el patrón no encaja`)
  return total - 3
}
const OTROS = otrosClientes()

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

/**
 * La portada existe en dos idiomas, cada uno en su URL (la inglesa la genera
 * scripts/hacer-ingles.mjs). Las dos llevan EXACTAMENTE la misma lista de
 * hreflang, cada una se incluye a sí misma y su canonical apunta a sí misma:
 * con un canonical cruzado, el buscador borraría una de las dos. x-default es
 * la inglesa, la que mejor sirve a quien no lee ninguna de las dos.
 */
const PORTADAS = [
  { idioma: 'es', url: '/' },
  { idioma: 'en', url: '/en/' },
  { idioma: 'x-default', url: '/en/' },
]

/**
 * La privacidad también existe en dos idiomas, cada uno en su URL (las genera
 * scripts/hacer-privacidad.mjs). Mismo reparto que las portadas: cada una se
 * incluye a sí misma, su canonical apunta a sí misma y x-default es la inglesa.
 */
const PRIVACIDAD = [
  { idioma: 'es', url: '/privacidad' },
  { idioma: 'en', url: '/en/privacy' },
  { idioma: 'x-default', url: '/en/privacy' },
]

/** Las paginas indexables, con lo suyo. El orden es el del sitemap. */
const PAGINAS = [
  {
    archivo: 'index.html',
    url: '/',
    tipo: 'website',
    idioma: 'es',
    locale: 'es_ES',
    alternos: PORTADAS,
    titulo: 'Adeorq · todos tus agentes en una sola pantalla',
    descripcion:
      `Panel de escritorio para Windows, Linux y Mac: Claude Code, Codex, Gemini y ${OTROS} clientes más ` +
      'trabajando a la vez en terminales de verdad, con tus proyectos a un clic. Gratis, sin cuenta y sin claves de API.',
    prioridad: '1.0',
    frecuencia: 'weekly',
  },
  {
    archivo: 'en/index.html',
    url: '/en/',
    tipo: 'website',
    idioma: 'en',
    locale: 'en_US',
    alternos: PORTADAS,
    titulo: 'Adeorq · all your agents on one single screen',
    descripcion:
      `Desktop panel for Windows, Linux and Mac: Claude Code, Codex, Gemini and ${OTROS} more clients working ` +
      'at once in real terminals, with your projects one click away. Free, no account and no API keys.',
    prioridad: '0.9',
    frecuencia: 'weekly',
  },
  {
    archivo: 'guia.html',
    url: '/guia',
    tipo: 'article',
    titulo: 'Guía de Adeorq · cómo se usa la cabina',
    descripcion:
      'Qué hace cada pantalla de Adeorq, cómo se instala, los estados de una sesión, ' +
      'los objetivos del día, los atajos y dónde guarda tus cosas.',
    prioridad: '0.8',
    frecuencia: 'monthly',
  },
  {
    archivo: 'privacidad.html',
    url: '/privacidad',
    tipo: 'website',
    idioma: 'es',
    locale: 'es_ES',
    alternos: PRIVACIDAD,
    // Una política de privacidad no es una portada: sin datos estructurados.
    sinDatosEstructurados: true,
    titulo: 'Política de privacidad · Adeorq',
    descripcion:
      'Qué lee Adeorq de tu ordenador, qué guarda y a dónde sale algo de lo que haces. Quién es el responsable y cómo pedirle algo.',
    prioridad: '0.5',
    frecuencia: 'yearly',
  },
  {
    archivo: 'en/privacy.html',
    url: '/en/privacy',
    tipo: 'website',
    idioma: 'en',
    locale: 'en_US',
    alternos: PRIVACIDAD,
    sinDatosEstructurados: true,
    titulo: 'Privacy policy · Adeorq',
    descripcion:
      'What Adeorq reads on your computer, what it stores and where anything you do goes. Who is responsible and how to ask them for something.',
    prioridad: '0.4',
    frecuencia: 'yearly',
  },
  // Las páginas por búsqueda (paginas/rutas.mjs). Su título y su descripción se leen del
  // HTML que genera scripts/hacer-paginas.mjs: así no hay una segunda copia que se separe.
  ...RUTAS.flatMap((r) =>
    IDIOMAS.map((idioma) => ({
      archivo: r[idioma].archivo,
      url: r[idioma].url,
      tipo: 'article',
      idioma,
      locale: idioma === 'en' ? 'en_US' : 'es_ES',
      alternos: [
        { idioma: 'es', url: r.es.url },
        { idioma: 'en', url: r.en.url },
        { idioma: 'x-default', url: r.en.url },
      ],
      busqueda: r.id === 'novedades' ? 'CollectionPage' : 'TechArticle',
      titulo: '',
      descripcion: '',
      prioridad: r.prioridad[idioma],
      frecuencia: r.frecuencia,
    })),
  ),
]

const hoy = process.env.FECHA_SITEMAP || new Date().toISOString().slice(0, 10)

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
  const locale = pagina.locale || 'es_ES'
  const otros = (pagina.alternos || []).filter((a) => a.idioma !== 'x-default' && a.idioma !== pagina.idioma)
  return [
    INICIO,
    `<link rel="canonical" href="${abs}">`,
    ...(pagina.alternos || []).map((a) => `<link rel="alternate" hreflang="${a.idioma}" href="${SITIO}${a.url}">`),
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
    `<meta property="og:locale" content="${locale}">`,
    ...otros.map((a) => `<meta property="og:locale:alternate" content="${a.idioma === 'en' ? 'en_US' : 'es_ES'}">`),
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
function jsonLdPortada(preguntas, pagina) {
  const ingles = pagina.idioma === 'en'
  const grafo = [
    {
      '@type': 'WebSite',
      '@id': `${SITIO}/#sitio`,
      url: `${SITIO}/`,
      name: 'Adeorq',
      inLanguage: ['es-ES', 'en'],
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
      operatingSystem: 'Windows, Linux, macOS',
      url: `${SITIO}/`,
      author: { '@id': `${SITIO}/#autor` },
      downloadUrl: 'https://github.com/Mun1to/Adeorq-releases/releases/latest',
      softwareHelp: `${SITIO}/guia`,
      screenshot: IMAGEN,
      description: ingles
        ? 'Desktop panel that runs AI agent clients in real terminals: Claude Code, Codex, ' +
          'Gemini CLI, Copilot, Cursor and others, in one single window.'
        : 'Panel de escritorio que ejecuta clientes de agente de IA en terminales reales: ' +
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
      '@id': `${SITIO}${pagina.url}#preguntas`,
      inLanguage: ingles ? 'en' : 'es-ES',
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
    headline: 'Guía de Adeorq',
    description: 'Cómo se usa Adeorq: cada pantalla, la instalación, los atajos y dónde guarda tus cosas.',
    inLanguage: 'es-ES',
    url: `${SITIO}/guia`,
    author: { '@type': 'Person', name: 'Munir Torres' },
    about: { '@type': 'SoftwareApplication', name: 'Adeorq' },
  }
  return ['', '<script type="application/ld+json">', JSON.stringify(doc, null, 2), '</script>']
}

/**
 * Los datos estructurados de una página por búsqueda: el artículo, sus migas y sus
 * preguntas. Las migas y las preguntas se leen del HTML, igual que en la portada: nada
 * que no se vea en la página.
 */
function jsonLdBusqueda(html, pagina, preguntas) {
  const ingles = pagina.idioma === 'en'
  const abs = SITIO + pagina.url
  const idioma = ingles ? 'en' : 'es-ES'
  const h1 = soloTexto(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || pagina.titulo)
  const miga = soloTexto(html.match(/data-miga>([\s\S]*?)<\//)?.[1] || h1)
  const grafo = [
    {
      '@type': pagina.busqueda,
      '@id': `${abs}#pagina`,
      headline: h1,
      description: soloTexto(pagina.descripcion),
      url: abs,
      inLanguage: idioma,
      dateModified: hoy,
      ...(IMAGEN ? { image: IMAGEN } : {}),
      author: { '@type': 'Person', name: 'Munir Torres', url: `${SITIO}/` },
      about: {
        '@type': 'SoftwareApplication',
        name: 'Adeorq',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Windows, Linux, macOS',
        url: `${SITIO}/`,
      },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${abs}#migas`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Adeorq', item: `${SITIO}${ingles ? '/en/' : '/'}` },
        { '@type': 'ListItem', position: 2, name: miga, item: abs },
      ],
    },
  ]
  if (preguntas.length) {
    grafo.push({
      '@type': 'FAQPage',
      '@id': `${abs}#preguntas`,
      inLanguage: idioma,
      mainEntity: preguntas.map((p) => ({
        '@type': 'Question',
        name: p.pregunta,
        acceptedAnswer: { '@type': 'Answer', text: p.respuesta },
      })),
    })
  }
  const doc = { '@context': 'https://schema.org', '@graph': grafo }
  return ['', '<script type="application/ld+json">', JSON.stringify(doc, null, 2).replace(/</g, '\\u003c'), '</script>']
}

/** La descripción que ya trae la página generada. */
const descripcionDe = (html) => html.match(/<meta name="description" content="([^"]*)"/)?.[1] || ''

/** El <title> que ya trae la pagina. Es la fuente del og:title. */
function tituloDe(html, porDefecto) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/)
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

for (const pagina of PAGINAS) {
  if (!existsSync(resolve(WEB, pagina.archivo))) {
    throw new Error(`${pagina.archivo} no existe: la portada inglesa sale de \`node scripts/hacer-ingles.mjs\` y las páginas por búsqueda de \`node scripts/hacer-paginas.mjs\`, que van antes`)
  }
  const html = readFileSync(resolve(WEB, pagina.archivo), 'utf8')
  // Las preguntas de cada portada salen de SU HTML, en su idioma.
  const preguntas = pagina.alternos && !pagina.sinDatosEstructurados ? preguntasDe(html) : []
  pagina.titulo = tituloDe(html, pagina.titulo)
  if (pagina.busqueda) pagina.descripcion = descripcionDe(html)
  const extras = pagina.sinDatosEstructurados
    ? []
    : pagina.busqueda
      ? jsonLdBusqueda(html, pagina, preguntas)
      : pagina.alternos
        ? jsonLdPortada(preguntas, pagina)
        : jsonLdGuia()
  escribir(pagina, metadatos(pagina, extras))
  console.log(`${pagina.archivo.padEnd(14)} -> ${SITIO}${pagina.url}${pagina.alternos && !pagina.sinDatosEstructurados ? `  (${preguntas.length} preguntas)` : ''}`)
}

// --- sitemap ---------------------------------------------------------------
// Solo las paginas indexables. Nada que lleve noindex ni nada que redirija:
// meter una URL redirigida en el sitemap es mandarle dos senales contrarias.
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
