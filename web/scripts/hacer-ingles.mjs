/**
 * Genera la portada en inglés, web/en/index.html, desde web/index.html y el
 * diccionario portada/en.mjs.
 *
 * Por qué una página aparte y no cambiar el texto con JavaScript, como hace la
 * guía: cada idioma necesita su propia URL para que un buscador lo indexe y un
 * asistente que no ejecuta scripts lo lea (Google Search Central, «Localized
 * versions»). Y por qué generada: con dos HTML escritos a mano, el segundo se
 * queda atrás en la primera edición. Aquí el español es la única fuente; el
 * inglés solo pone el texto de cada elemento marcado con `data-en="clave"` y
 * los atributos de `data-en-attr="atributo:clave|otro:clave"`.
 *
 * Se para (y no escribe nada) si una clave de la página no está en el
 * diccionario, y avisa de las que sobran. Los metadatos (canonical, hreflang,
 * Open Graph, JSON-LD) los pone después scripts/poner-metadatos.mjs: aquí solo
 * se vacía su bloque.
 *
 * Se lanza con `node scripts/hacer-ingles.mjs` desde web/; `pnpm build` y
 * `pnpm dev` ya lo hacen. El resultado no se versiona (web/.gitignore).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import TEXTOS from '../portada/en.mjs'

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INICIO = '<!-- METADATOS:INICIO (los escribe scripts/poner-metadatos.mjs, no editar a mano) -->'
const FIN = '<!-- METADATOS:FIN -->'

/** Dónde acaba el elemento que abre en `desde`, contando los de su misma etiqueta. */
function finDe(html, etiqueta, desde) {
  const re = new RegExp(`<(/?)${etiqueta}\\b[^>]*>`, 'gi')
  re.lastIndex = desde
  let nivel = 1
  for (let m; (m = re.exec(html)); ) {
    nivel += m[1] ? -1 : 1
    if (nivel === 0) return m.index
  }
  throw new Error(`<${etiqueta}> sin cerrar a partir del carácter ${desde}`)
}

const atributo = (v) => String(v).replace(/&(?!(amp|quot|lt|gt|#\d+);)/g, '&amp;').replace(/"/g, '&quot;')

/** `{n}` es el primer número del texto español del mismo elemento. */
function rellenar(clave, espanol) {
  const texto = TEXTOS[clave]
  if (!texto.includes('{n}')) return texto
  const n = espanol.replace(/<[^>]+>/g, ' ').match(/\d+/)
  if (!n) throw new Error(`«${clave}» lleva {n} y el español no trae ningún número`)
  return texto.replaceAll('{n}', n[0])
}

/** Cambia los atributos de una etiqueta de apertura según su `data-en-attr`. */
function traducirAtributos(abre, usadas, faltan) {
  const lista = abre.match(/\sdata-en-attr="([^"]*)"/)
  if (!lista) return abre
  let fuera = abre.replace(lista[0], '')
  for (const par of lista[1].split('|')) {
    const [nombre, clave] = par.split(':').map((s) => s.trim())
    if (!(clave in TEXTOS)) { faltan.add(clave); continue }
    usadas.add(clave)
    const valor = atributo(TEXTOS[clave])
    const re = new RegExp(`\\s${nombre}="[^"]*"`)
    fuera = re.test(fuera) ? fuera.replace(re, ` ${nombre}="${valor}"`) : fuera.replace(/\s*\/?>$/, (c) => ` ${nombre}="${valor}"${c}`)
  }
  return fuera
}

export function enIngles(original) {
  const usadas = new Set()
  const faltan = new Set()
  let html = original
  let salida = ''
  const abre = /<([a-z][a-z0-9]*)\b[^>]*>/gi

  // Una pasada de izquierda a derecha: cada etiqueta de apertura se copia con
  // sus atributos traducidos, y si lleva data-en su contenido se sustituye.
  let cursor = 0
  for (let m; (m = abre.exec(html)); ) {
    const [etiquetaEntera, nombre] = m
    if (!/\sdata-en(-attr)?="/.test(etiquetaEntera)) continue
    let nueva = traducirAtributos(etiquetaEntera, usadas, faltan)
    const clave = nueva.match(/\sdata-en="([^"]*)"/)
    salida += html.slice(cursor, m.index)
    if (!clave) {
      salida += nueva
      cursor = m.index + etiquetaEntera.length
      continue
    }
    nueva = nueva.replace(clave[0], '')
    const dentro = m.index + etiquetaEntera.length
    const fin = finDe(html, nombre, dentro)
    if (!(clave[1] in TEXTOS)) faltan.add(clave[1])
    else usadas.add(clave[1])
    salida += nueva + (clave[1] in TEXTOS ? rellenar(clave[1], html.slice(dentro, fin)) : html.slice(dentro, fin))
    cursor = fin
    abre.lastIndex = fin
  }
  salida += html.slice(cursor)
  html = salida

  if (faltan.size) throw new Error(`faltan en portada/en.mjs: ${[...faltan].join(', ')}`)
  const sobran = Object.keys(TEXTOS).filter((k) => !usadas.has(k))

  // Lo que cambia por estar en /en/ y no en /.
  html = html
    .replace(/<html lang="es"/, '<html lang="en"')
    .replace(/(href|src)="\.\/portada\//g, '$1="../portada/')
  const ini = html.indexOf(INICIO)
  const fin = html.indexOf(FIN, ini)
  if (ini >= 0 && fin > ini) html = html.slice(0, ini + INICIO.length) + '\n' + html.slice(fin)
  // Los comentarios son notas de taller en español: en la versión inglesa
  // sobran. Se quedan las dos marcas que necesita poner-metadatos.
  html = html.replace(/<!--(?!\s*METADATOS:)[\s\S]*?-->\n?/g, '')
  html = html.replace(
    '<!doctype html>',
    '<!doctype html>\n<!-- GENERADA por scripts/hacer-ingles.mjs desde index.html y portada/en.mjs: no se edita a mano. -->',
  )
  return { html, sobran }
}

// Al lanzarlo como script (no al importarlo desde vite.config.js).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { html, sobran } = enIngles(readFileSync(resolve(WEB, 'index.html'), 'utf8'))
  mkdirSync(resolve(WEB, 'en'), { recursive: true })
  writeFileSync(resolve(WEB, 'en', 'index.html'), html, 'utf8')
  // Lo que quede con tilde o eñe fuera de scripts y estilos es español sin
  // traducir. Menos lo que va marcado como español a propósito (el enlace
  // «Español» de la barra, con su `lang="es"`).
  const visible = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
    .replace(/<a\b[^>]*\slang="es"[^>]*>[^<]*<\/a>/g, '')
    .replace(/<[^>]+>/g, ' ')
  const restos = visible.split('\n').map((l) => l.trim()).filter((l) => /[áéíóúñ¿¡]/i.test(l))
  console.log(`en/index.html -> ${html.length} bytes`)
  if (sobran.length) console.log(`claves sin usar en portada/en.mjs: ${sobran.join(', ')}`)
  if (restos.length) {
    console.log(`texto que parece español en la versión inglesa:\n  ${restos.slice(0, 12).join('\n  ')}`)
    process.exitCode = 1
  }
}
