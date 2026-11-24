/**
 * Genera las páginas que responden a una búsqueda, en español y en inglés, desde
 * los textos de web/paginas/.
 *
 * Por qué generadas: cada idioma necesita su URL y su texto entero en el HTML, y la
 * barra, el índice y el pie tienen que ser iguales en las ocho. Los metadatos
 * (canonical, hreflang, Open Graph, JSON-LD) los pone después
 * scripts/poner-metadatos.mjs; /novedades se rehace con cada build porque sale de
 * data/changelog.json.
 *
 * Se lanza con `node scripts/hacer-paginas.mjs` desde web/; `pnpm build` y `pnpm dev`
 * ya lo hacen. Los resultados no se versionan (web/.gitignore).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderizar } from '../paginas/armazon.mjs'
import { IDIOMAS, RUTAS } from '../paginas/rutas.mjs'
import { textosNovedades } from '../paginas/novedades.mjs'
import { textosClaudeWindows } from '../paginas/claude-code-windows.mjs'
import { CLIENTES, textosVariosClientes } from '../paginas/claude-code-codex-gemini.mjs'
import { textosComparativa } from '../paginas/comparativa.mjs'
import { FUERA_DE_LA_WEB } from './extraer-clientes.mjs'

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const changelog = JSON.parse(readFileSync(resolve(WEB, 'data/changelog.json'), 'utf8'))

/**
 * La tabla de clientes de /claude-code-codex-gemini dice lo que hace la app. Si el catálogo
 * cambia (src/lib/providers.ts), el build se para aquí antes que publicar una tabla falsa.
 * Sin los que la web no enseña (`FUERA_DE_LA_WEB` en extraer-clientes.mjs).
 */
function comprobarCatalogo() {
  const fuente = readFileSync(resolve(WEB, '../src/lib/providers.ts'), 'utf8')
  const fichas = fuente.slice(fuente.indexOf('export const PROVIDERS')).split(/\r?\n {2}\{\r?\n/).slice(1)
    .filter((f) => !FUERA_DE_LA_WEB.includes(f.match(/id:\s*"([^"]+)"/)?.[1]))
  const reales = fichas.map((f) => [
    f.match(/label:\s*"([^"]+)"/)?.[1],
    /envVar:\s*"[^"]+"/.test(f) ? 1 : 0,
    /usage:\s*true/.test(f) ? 1 : 0,
    /retomable:\s*true/.test(f) ? 1 : 0,
  ])
  const clave = (filas) => filas.map((f) => f.join('|')).sort().join('\n')
  if (clave(reales) !== clave(CLIENTES)) {
    throw new Error(`paginas/claude-code-codex-gemini.mjs no coincide con src/lib/providers.ts:\n${clave(reales)}`)
  }
}
comprobarCatalogo()

const TEXTOS = {
  'claude-code-windows': textosClaudeWindows,
  'claude-code-codex-gemini': textosVariosClientes,
  comparativa: textosComparativa,
  novedades: (lang) => textosNovedades(lang, changelog),
}

for (const ruta of RUTAS) {
  for (const lang of IDIOMAS) {
    const html = renderizar(ruta, lang, TEXTOS[ruta.id](lang))
    const destino = resolve(WEB, ruta[lang].archivo)
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, html, 'utf8')
    console.log(`${ruta[lang].archivo.padEnd(36)} -> ${Buffer.byteLength(html)} bytes`)
  }
}
