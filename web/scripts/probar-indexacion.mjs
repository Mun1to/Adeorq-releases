/**
 * Comprueba que la web se puede indexar. No opina: pide las paginas de verdad y
 * mira lo que devuelve el servidor.
 *
 * Nace de un susto medido el 2026-08-21: `curl https://adeorq.com/robots.txt`
 * devolvia 200 y el fichero NO EXISTIA. Cloudflare Pages servia la portada
 * entera para cualquier ruta desconocida, asi que robots.txt, sitemap.xml y
 * llms.txt "existian" los tres, y ninguno era de verdad. Un 200 no prueba nada
 * si no se mira lo que viene dentro, y por eso esta prueba compara CONTENIDO.
 *
 *   node scripts/probar-indexacion.mjs                    (contra produccion)
 *   node scripts/probar-indexacion.mjs http://127.0.0.1:8788
 *
 * Sale con codigo 1 si algo falla, para poder colgarlo de un hook o de CI.
 */

const BASE = (process.argv[2] || 'https://adeorq.com').replace(/\/$/, '')
const PRODUCCION = BASE === 'https://adeorq.com'

let fallos = 0
let avisos = 0

const ok = (t) => console.log(`  ok    ${t}`)
const mal = (t) => { fallos++; console.log(`  FALLO ${t}`) }
const aviso = (t) => { avisos++; console.log(`  aviso ${t}`) }

/** Pide una URL sin seguir redirecciones, para poder mirarlas. */
async function pedir(ruta, seguir = false) {
  const r = await fetch(BASE + ruta, { redirect: seguir ? 'follow' : 'manual' })
  const cuerpo = await r.text()
  return { estado: r.status, destino: r.headers.get('location'), tipo: r.headers.get('content-type') || '', cuerpo }
}

const esHtml = (c) => /^\s*<!doctype html|^\s*<html/i.test(c)

// --- 1. Los porteros -------------------------------------------------------
console.log('\n1. robots.txt, sitemap y llms.txt')
{
  const r = await pedir('/robots.txt')
  if (r.estado !== 200) mal(`robots.txt devuelve ${r.estado}`)
  else if (esHtml(r.cuerpo)) mal('robots.txt devuelve HTML: el fichero NO existe, es el comodin del servidor')
  else {
    ok('robots.txt existe y es texto')
    if (!r.cuerpo.includes('Sitemap:')) mal('robots.txt no enlaza el sitemap')
    else ok('robots.txt enlaza el sitemap')
    if (/^\s*User-agent:\s*\*\s*\n\s*Disallow:\s*\/\s*$/m.test(r.cuerpo)) mal('robots.txt bloquea el sitio ENTERO')
    if (!/User-agent:\s*Googlebot/i.test(r.cuerpo)) aviso('robots.txt no nombra a Googlebot')
    for (const bot of ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot']) {
      const trozo = r.cuerpo.split(new RegExp(`User-agent:\\s*${bot}`, 'i'))[1] || ''
      if (/^\s*\n?\s*Disallow:\s*\//.test(trozo)) mal(`${bot} bloqueado: eso te borra de las respuestas de las IA`)
    }
    ok('los bots de busqueda y respuesta pueden entrar')
  }

  const l = await pedir('/llms.txt')
  if (l.estado !== 200 || esHtml(l.cuerpo)) aviso('llms.txt no existe (no es un estandar, no pasa nada)')
  else ok('llms.txt existe y es texto')
}

// --- 2. El sitemap y sus URLs ---------------------------------------------
console.log('\n2. sitemap.xml')
let urls = []
{
  const r = await pedir('/sitemap.xml')
  if (r.estado !== 200) mal(`sitemap.xml devuelve ${r.estado}`)
  else if (esHtml(r.cuerpo)) mal('sitemap.xml devuelve HTML: el fichero NO existe')
  else {
    urls = [...r.cuerpo.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    if (!urls.length) mal('el sitemap no lista ni una URL')
    else ok(`sitemap con ${urls.length} URLs`)
  }
}

// --- 3. Un 404 de verdad ---------------------------------------------------
console.log('\n3. rutas que no existen')
{
  const r = await pedir('/pagina-que-no-existe-9f3a2b')
  if (r.estado === 200) mal('una ruta inventada devuelve 200: el buscador puede indexar basura infinita')
  else if (r.estado === 404) ok('una ruta inventada devuelve 404')
  else aviso(`una ruta inventada devuelve ${r.estado}`)
}

// --- 4. Un solo dominio ----------------------------------------------------
if (PRODUCCION) {
  console.log('\n4. un solo dominio canonico')
  const r = await fetch('https://www.adeorq.com/', { redirect: 'manual' })
  if (r.status === 301 || r.status === 308) ok(`www redirige (${r.status}) a ${r.headers.get('location')}`)
  else mal(`www devuelve ${r.status} en vez de redirigir: las senales se parten en dos`)

  const h = await fetch('http://adeorq.com/', { redirect: 'manual' })
  if (h.status >= 300 && h.status < 400) ok(`http redirige (${h.status})`)
  else mal(`http devuelve ${h.status}`)
} else {
  console.log('\n4. un solo dominio canonico  (se salta: solo tiene sentido en produccion)')
}

// --- 5. Cada pagina --------------------------------------------------------
console.log('\n5. las paginas del sitemap')
for (const url of urls) {
  const ruta = new URL(url).pathname
  console.log(`\n  ${ruta}`)
  const r = await pedir(ruta, true)

  if (r.estado !== 200) { mal(`${ruta} devuelve ${r.estado}`); continue }

  const uno = (re) => (r.cuerpo.match(re) || []).length

  const titulo = r.cuerpo.match(/<title>([^<]*)<\/title>/)
  if (!titulo || !titulo[1].trim()) mal('sin <title>')
  else ok(`title: ${titulo[1].slice(0, 60)}`)

  const desc = r.cuerpo.match(/<meta name="description" content="([^"]*)"/)
  if (!desc || !desc[1].trim()) mal('sin meta description')
  else ok(`description de ${desc[1].length} caracteres`)

  const h1 = uno(/<h1[\s>]/g)
  if (h1 === 0) mal('sin <h1>')
  else if (h1 > 1) aviso(`${h1} etiquetas <h1>`)
  else ok('un solo <h1>')

  const can = r.cuerpo.match(/rel="canonical" href="([^"]+)"/)
  if (!can) mal('sin canonical')
  else if (!can[1].startsWith('http')) mal(`canonical relativo: ${can[1]}`)
  else if (can[1] !== url) mal(`canonical apunta a ${can[1]} y el sitemap dice ${url}`)
  else ok('canonical absoluto y coherente con el sitemap')

  if (/name="robots"[^>]*noindex/.test(r.cuerpo)) mal('la pagina lleva NOINDEX y esta en el sitemap')

  for (const et of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card']) {
    if (!r.cuerpo.includes(et)) mal(`falta ${et}`)
  }
  const img = r.cuerpo.match(/property="og:image" content="([^"]+)"/)
  if (img) {
    // Se pide contra ESTE servidor, no contra el dominio escrito en la etiqueta:
    // si no, probando en local se comprueba la imagen que ya hay publicada y la
    // nueva pasa sin mirarse. Y se mira el content-type, no solo el 200: un
    // servidor con comodin devuelve 200 y HTML para una imagen que no existe.
    const suya = BASE + new URL(img[1], BASE).pathname
    const i = await fetch(suya)
    const tipo = i.headers.get('content-type') || ''
    if (!i.ok) mal(`og:image devuelve ${i.status}: la tarjeta social sale sin imagen`)
    else if (!tipo.startsWith('image/')) mal(`og:image no es una imagen, devuelve ${tipo}`)
    else ok(`og:image es ${tipo} (${img[1].split('/').pop()})`)
  }

  for (const bloque of [...r.cuerpo.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]) {
    try {
      const d = JSON.parse(bloque[1])
      const tipos = d['@graph'] ? d['@graph'].map((n) => n['@type']) : [d['@type']]
      ok(`JSON-LD valido: ${tipos.join(', ')}`)
    } catch (e) {
      mal(`JSON-LD roto: ${e.message}`)
    }
  }

  // Lo que se lee sin ejecutar JavaScript. Los asistentes de IA no lo ejecutan,
  // asi que lo que solo existe tras montar el JS, para ellos no existe.
  const texto = r.cuerpo
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const palabras = texto.split(' ').filter((p) => p.length > 1).length
  if (palabras < 200) mal(`solo ${palabras} palabras sin JavaScript: el contenido lo pinta el navegador`)
  else ok(`${palabras} palabras legibles sin JavaScript`)
}

// --- Resumen ---------------------------------------------------------------
console.log(`\n${'-'.repeat(58)}`)
console.log(`${fallos} fallos, ${avisos} avisos   (${BASE})`)
process.exit(fallos ? 1 : 0)
