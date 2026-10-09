/**
 * Saca del diccionario inglés de la app (src/lib/i18n.ts) las parejas que usa
 * la maqueta de la web (web/demo/), y las deja en web/demo/en-app.js.
 *
 * Por qué así: la maqueta copia los textos de la app, y la app ya los tiene
 * traducidos. Con esto, cuando cambia una etiqueta en la app y se vuelve a
 * lanzar, la maqueta inglesa cambia con ella; lo que es solo de la maqueta
 * (las conversaciones de ejemplo, las notas) vive aparte, en web/demo/en.js.
 *
 * Solo entran las claves que aparecen tal cual en algún archivo de web/demo/:
 * el diccionario entero son más de 1.600 parejas y la maqueta usa unas cien.
 *
 * Se lanza con `node scripts/extraer-ingles-app.mjs` desde web/ (va dentro de
 * `pnpm maqueta`).
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEMO = resolve(WEB, 'demo')
const fuente = readFileSync(resolve(WEB, '..', 'src', 'lib', 'i18n.ts'), 'utf8')

// "clave": "valor", clave: "valor", y la clave en una línea con el valor en la siguiente.
const RE = /^\s*(?:"((?:[^"\\]|\\.)+)"|([A-Za-zÁÉÍÓÚáéíóúñÑ_][\wÁÉÍÓÚáéíóúñÑ]*)):\s*(?:\n\s*)?"((?:[^"\\]|\\.)*)"/gm
const parejas = new Map()
for (const m of fuente.matchAll(RE)) {
  const es = JSON.parse(`"${m[1] ?? m[2]}"`)
  const en = JSON.parse(`"${m[3]}"`)
  // Las que llevan huecos ({n}, {p}…) se rellenan en la app; en la maqueta el
  // texto ya viene con su número, así que no casarían nunca.
  if (es !== en && !/\{\w+\}/.test(es)) parejas.set(es, en)
}

const maqueta = readdirSync(DEMO)
  .filter((f) => /\.(html|js)$/.test(f) && !/^en(-app)?\.js$/.test(f))
  .map((f) => readFileSync(resolve(DEMO, f), 'utf8'))
  .join('\n')
const usadas = [...parejas].filter(([es]) => maqueta.includes(es)).sort(([a], [b]) => a.localeCompare(b, 'es'))

const salida = [
  '/* GENERADO por web/scripts/extraer-ingles-app.mjs desde src/lib/i18n.ts: no se edita a mano.',
  '   Las parejas del diccionario de la app que usa la maqueta. Lo aplica demo/traducir.js. */',
  'window.DEMO_EN = Object.assign(window.DEMO_EN || {}, {',
  ...usadas.map(([es, en]) => `  ${JSON.stringify(es)}: ${JSON.stringify(en)},`),
  '});',
  '',
].join('\n')
writeFileSync(resolve(DEMO, 'en-app.js'), salida, 'utf8')
console.log(`demo/en-app.js -> ${usadas.length} de ${parejas.size} parejas de la app`)
