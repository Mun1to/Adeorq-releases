/**
 * Las capturas de «Qué hace» en pequeño: 960 y 1440 px de ancho al lado de cada
 * original de 3840, para el `srcset` de la portada (index.html y, en inglés,
 * portada/en.mjs).
 *
 * Por qué: la foto se pinta como mucho a unos 714 px CSS (1428 de pantalla a 2x),
 * y el navegador decodificaba el PNG entero de 3840x2160 cada vez que bajando
 * se encendía otro rasgo: 36 a 60 ms por foto, dos veces, con la gráfica
 * esperando para enseñar el fotograma. Medido el 2026-11-22 con
 * scripts/fotogramas.mjs a 1920: el peor fotograma de cada vuelta, de 88-221
 * a 21-33 ms con las copias. La lupa («Ampliar») sigue abriendo el original.
 *
 * Usa ffmpeg (el mismo de los recortes de scripts/laboratorio/capturas, con
 * `-vf scale=<ancho>:-1:flags=lanczos` y la compresión de las capturas de la
 * web; otra ruta con FFMPEG=...). Además
 * apunta la huella de cada original y de cada copia en
 * assets/screens/tamanos.json, y scripts/capturas-check.mjs (en
 * `pnpm comprobar`) se pone rojo si una captura cambia y sus tamaños no, o si
 * una copia ya no es la que salió de aquí (la de otra foto mide lo mismo): tras
 * repetir las fotos, se vuelve a lanzar esto.
 *
 *   node scripts/hacer-tamanos.mjs        desde web/
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FOTOS = ['cockpit', 'canvas', 'files', 'decisions', 'accounts']
export const IDIOMAS = ['es', 'en']
export const ANCHOS = [960, 1440]

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const pantallas = resolve(web, 'assets/screens')
export const huella = (ruta) => createHash('sha256').update(readFileSync(ruta)).digest('hex')

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ffmpeg = process.env.FFMPEG || 'ffmpeg'
  const manifiesto = {}
  for (const idioma of IDIOMAS) {
    for (const foto of FOTOS) {
      const original = resolve(pantallas, idioma, `${foto}.png`)
      if (!existsSync(original)) throw new Error(`falta ${original}`)
      manifiesto[`${idioma}/${foto}.png`] = huella(original)
      for (const ancho of ANCHOS) {
        const destino = resolve(pantallas, idioma, `${foto}-${ancho}.png`)
        execFileSync(ffmpeg, ['-loglevel', 'error', '-y', '-i', original, '-vf', `scale=${ancho}:-1:flags=lanczos`, '-compression_level', '9', '-pred', 'mixed', destino])
        manifiesto[`${idioma}/${foto}-${ancho}.png`] = huella(destino)
        console.log(`assets/screens/${idioma}/${foto}-${ancho}.png`)
      }
    }
  }
  writeFileSync(resolve(pantallas, 'tamanos.json'), `${JSON.stringify(manifiesto, null, 2)}\n`)
  console.log('assets/screens/tamanos.json')
}
