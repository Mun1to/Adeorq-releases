/**
 * Dibuja `assets/og.png`, la tarjeta que se ve al pegar el enlace de adeorq.com
 * en WhatsApp, LinkedIn, Slack o X.
 *
 * Por que dibujada y no una captura de la app: las capturas de `assets/screens/`
 * ensenan la barra lateral con los proyectos privados de Munir, y esta imagen se
 * ve cada vez que alguien comparte el enlace. Una captura ahi es publicar su
 * mapa de trabajo sin querer.
 *
 * En INGLES a proposito (Munir, 2026-08-21): la web es en castellano, pero el
 * enlace de una herramienta de desarrollo se comparte fuera.
 *
 * El logo sale de `assets/adeorq.svg`, que es la marca de verdad. Ojo con
 * copiarse otro: `assets/favicon.svg` lleva la marca sobre una placa, y el
 * circulo azul y morado que anda por los HTML es un favicon PROVISIONAL, no
 * la marca.
 *
 * Necesita playwright-core, que NO es dependencia de este repo. Si no lo
 * encuentra, se le dice donde esta con la variable PLAYWRIGHT_CORE:
 *
 *   PLAYWRIGHT_CORE=C:/proyectos/Orquio/web/node_modules/playwright-core \
 *     node scripts/hacer-tarjeta-social.mjs
 *
 * Se carga con import() dinamico y no con `import ... from`, porque un import
 * estatico de un modulo que puede faltar revienta el fichero entero antes de
 * ejecutar una linea, y entonces ni el mensaje de ayuda de arriba se imprime.
 *
 * Y OJO con enlazar node_modules a mano: `ln -s` en Git Bash sobre Windows no
 * crea un enlace, hace una COPIA. Probado el 2026-08-21: dejo 511 MB y 36.901
 * ficheros dentro de `web/`. Si hace falta un enlace de verdad, `mklink /D`.
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { tmpdir } from 'node:os'

/** Carga playwright-core de donde este. */
async function cargarChromium() {
  const intentos = ['playwright-core']
  if (process.env.PLAYWRIGHT_CORE) {
    // Un import() de una carpeta NO funciona: ESM no lee el package.json de un
    // directorio pasado como file://, asi que hay que nombrar el fichero de
    // entrada. El de playwright-core es index.mjs (su campo `exports.import`).
    const raiz = process.env.PLAYWRIGHT_CORE.replace(/[\\/]+$/, '')
    intentos.unshift(pathToFileURL(resolve(raiz, 'index.mjs')).href)
  }
  for (const via of intentos) {
    try {
      return (await import(via)).chromium
    } catch { /* se prueba el siguiente */ }
  }
  console.error('No encuentro playwright-core. No es dependencia de este repo.')
  console.error('Dime donde esta:  PLAYWRIGHT_CORE=C:/proyectos/Orquio/web/node_modules/playwright-core')
  process.exit(2)
}

const AQUI = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(AQUI, '..')

const BRAVE = process.env.BRAVE || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'
const GRANO_OP = process.env.GRANO_OP || '.30'
const GRANO_MEZCLA = process.env.GRANO_MEZCLA || 'soft-light'
const SALIDA = process.env.SALIDA || 'assets/og.png'

const ANCHO = 1200
const ALTO = 630

/**
 * Los clientes que se nombran en la tarjeta, y cuantos quedan detras.
 *
 * Los nombres son los mas reconocibles fuera de casa (Munir, 2026-08-21: «pon
 * los mas famosos»), pero el NUMERO no se escribe a mano: sale de contar
 * `src/lib/providers.ts`, que es la lista de verdad. Asi el dia que entre un
 * cliente nuevo, la tarjeta no se queda mintiendo.
 */
function clientes() {
  const src = readFileSync(resolve(WEB, '../src/lib/providers.ts'), 'utf8')
  const etiquetas = [...src.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1])
  if (etiquetas.length < 5) throw new Error(`providers.ts solo da ${etiquetas.length} clientes: el patron no encaja`)

  // Los que se nombran. Munir decide cuales: son los que quiere ensenar fuera,
  // no los que mas se usan en casa. Fuera Copilot y Aider por decision suya
  // (2026-08-21), aunque los dos SI esten soportados en providers.ts.
  const nombrados = ['Claude Code', 'Codex', 'Cursor', 'Grok', 'Antigravity', 'opencode', 'Kiro']

  // Cada nombre tiene que existir de verdad. Anunciar en la tarjeta un cliente
  // que la app no trae es la peor errata posible: se ve en cada enlace que se
  // comparte y nadie la revisa dos veces. Antes esto no se comprobaba.
  const inventados = nombrados.filter(
    (n) => !etiquetas.some((e) => e.toLowerCase().startsWith(n.toLowerCase()))
  )
  if (inventados.length) {
    throw new Error(`estos no estan en providers.ts: ${inventados.join(', ')}`)
  }

  const resto = etiquetas.length - nombrados.length
  return `${nombrados.join(', ')} and ${resto} more, in real terminals.`
}

/** La marca, lista para incrustar. */
function marca() {
  const bruto = readFileSync(resolve(WEB, 'assets/adeorq.svg'), 'utf8')
  // Fuera el comentario de cabecera: incrustado tal cual acaba escrito en la pagina.
  const limpio = bruto.replace(/<!--[\s\S]*?-->/g, '')
  const i = limpio.indexOf('<svg')
  if (i < 0) throw new Error('assets/adeorq.svg no tiene un <svg>')
  return limpio
    .slice(i)
    .trim()
    // El id del degradado se renombra porque en la tarjeta conviven varios SVG.
    .replace(/id="a"/, 'id="marca"')
    .replace(/url\(#a\)/g, 'url(#marca)')
    .replace('<svg ', '<svg class="logo" ')
}

const pagina = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url('${pathToFileURL(resolve(WEB, 'fonts/inter-latin-wght-normal.woff2')).href}') format('woff2');font-weight:100 900}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${ANCHO}px;height:${ALTO}px;overflow:hidden;background:#05080e;
  font-family:Inter,"Segoe UI",system-ui,sans-serif;color:#e6edfa;position:relative}
/* El mismo resplandor del hero de la portada, para que la tarjeta y la web
   se reconozcan como la misma cosa. */
.glow{position:absolute;left:50%;bottom:-38%;width:150%;height:135%;transform:translateX(-50%);
  background:
    radial-gradient(44% 47% at 50% 80%, rgba(255,255,255,.55) 0%, rgba(214,235,255,.34) 22%, rgba(110,175,255,.17) 48%, transparent 76%),
    radial-gradient(92% 37% at 50% 80%, rgba(160,200,255,.15) 0%, rgba(118,172,255,.08) 46%, transparent 82%);
  filter:blur(8px)}
.rejilla{position:absolute;inset:0;opacity:.5;
  background-image:linear-gradient(rgba(140,170,220,.07) 1px,transparent 1px),
                   linear-gradient(90deg,rgba(140,170,220,.07) 1px,transparent 1px);
  background-size:64px 64px;
  mask-image:radial-gradient(70% 60% at 50% 40%,#000,transparent)}
/* Grano. Un degradado liso de 1200x630 sale con bandas visibles, sobre todo en
   los azules oscuros del resplandor: el ruido las rompe y de paso le da textura
   de papel en vez de plastico. Es un feTurbulence incrustado, sin peticiones de
   red, y se mezcla en modo overlay para que oscurezca las zonas oscuras y
   aclare las claras, en vez de velar la imagen entera de gris.
   (Sin acentos graves aqui dentro: todo este CSS vive en una plantilla de
   JavaScript y un acento grave la cerraria a media frase.) */
.grano{position:absolute;inset:0;z-index:1;pointer-events:none;
  opacity:${GRANO_OP};mix-blend-mode:${GRANO_MEZCLA};
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size:240px 240px}
.caja{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;
  justify-content:center;padding:0 92px}
.marca{display:flex;align-items:center;gap:20px;margin-bottom:38px}
.marca .logo{width:56px;height:56px;display:block}
.marca b{font-size:34px;font-weight:600;letter-spacing:-.01em}
h1{font-size:74px;line-height:1.1;font-weight:600;letter-spacing:-.028em;max-width:22ch}
/* Cada frase en su renglon: es el patron de su propio copy ingles y evita que
   la ultima palabra se quede colgando sola. */
h1 em{font-style:normal;color:#8fb8ff;display:block}
p{margin-top:26px;font-size:26px;line-height:1.45;color:#b7c7e0;max-width:36ch}
.pie{position:absolute;left:92px;bottom:56px;z-index:2;display:flex;gap:14px;align-items:center;
  font-size:21px;color:#8fa3c4}
.pip{width:9px;height:9px;border-radius:50%;background:#48c2ff;box-shadow:0 0 14px 3px rgba(72,194,255,.55)}
</style></head><body>
<div class="glow"></div><div class="rejilla"></div><div class="grano"></div>
<div class="caja">
  <div class="marca">${marca()}<b>Adeorq</b></div>
  <h1>All your agents. <em>One single screen.</em></h1>
  <p>${clientes()}</p>
</div>
<div class="pie"><span class="pip"></span> adeorq.com &#183; Windows and Linux</div>
</body></html>`

const carpeta = mkdtempSync(join(tmpdir(), 'adeorq-og-'))
const fuente = join(carpeta, 'tarjeta.html')
writeFileSync(fuente, pagina, 'utf8')

const chromium = await cargarChromium()
const navegador = await chromium.launch({ executablePath: BRAVE })
try {
  const hoja = await navegador.newPage({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 1 })
  await hoja.goto(pathToFileURL(fuente).href)
  // Sin esta espera la tipografia entra a medias y el texto sale con la de respaldo.
  await hoja.evaluate(() => document.fonts.ready)
  await hoja.waitForTimeout(300)
  const destino = resolve(WEB, SALIDA)
  await hoja.screenshot({ path: destino })
  console.log(`${SALIDA} -> ${ANCHO}x${ALTO}  (grano ${GRANO_OP} ${GRANO_MEZCLA})`)
} finally {
  await navegador.close()
  rmSync(carpeta, { recursive: true, force: true })
}
