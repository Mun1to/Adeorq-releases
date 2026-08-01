/* ============================================================================
   Adeorq · web/sections/_sincronizar.mjs
   Pega los parciales de esta carpeta dentro de index.html, entre los dos
   marcadores de secciones, y no toca ni una linea fuera de ellos.

   Por que existe: la pagina tiene que leerse entera sin JavaScript
   (DISENO.md §11), asi que el HTML de las secciones debe estar DENTRO de
   index.html, no traido por fetch. Y como el HTML no puede vivir en dos sitios
   a la vez sin acabar divergiendo, la fuente son los parciales y esto los
   vuelca. Se edita el parcial, se corre esto, se mira el resultado.

   Uso, desde web/:   node sections/_sincronizar.mjs
   Si algun dia vite.config.js monta un include de verdad en el build, este
   archivo sobra y se borra: el orden de abajo es justo lo que necesitaria.
   ============================================================================ */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const INDEX = resolve(AQUI, '..', 'index.html')

/* Orden de DISENO.md §10. El roadmap va dentro de changelog.html. */
const CUERPO = ['que-es', 'features', 'descarga', 'changelog', 'faq']
const PIE = 'footer'

const ABRE = '<!-- secciones:inicio · generado por sections/_sincronizar.mjs, no editar a mano -->'
const CIERRA = '<!-- secciones:fin -->'

async function parcial(nombre) {
  const bruto = await readFile(resolve(AQUI, `${nombre}.html`), 'utf8')
  return `\n<!-- ${nombre}.html -->\n${bruto.trim()}\n`
}

const html = await readFile(INDEX, 'utf8')

const partes = await Promise.all(CUERPO.map(parcial))
const pie = await parcial(PIE)

/* El pie va fuera de <main>, que es donde termina el contenido principal. */
const bloque = `${ABRE}\n${partes.join('')}\n</main>\n${pie}\n${CIERRA}`

let salida
if (html.includes(ABRE) && html.includes(CIERRA)) {
  const desde = html.indexOf(ABRE)
  const hasta = html.indexOf(CIERRA) + CIERRA.length
  salida = html.slice(0, desde) + bloque + html.slice(hasta)
} else {
  /* Primera vez: se entra por el </main> que cierra el hero y se sustituye por
     el bloque, que ya trae su propio </main> despues de las secciones. */
  const cierreMain = html.lastIndexOf('</main>')
  if (cierreMain === -1) {
    console.error('No encuentro </main> en index.html: no toco nada.')
    process.exit(1)
  }
  salida = html.slice(0, cierreMain) + bloque + html.slice(cierreMain + '</main>'.length)
}

await writeFile(INDEX, salida, 'utf8')
console.log(`Secciones volcadas en index.html: ${CUERPO.join(', ')} y ${PIE}.`)
