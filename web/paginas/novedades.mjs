/**
 * /novedades y /en/changelog: el historial de versiones, sacado de data/changelog.json,
 * el mismo archivo del que sale «Se mueve casi todos los días» en la portada.
 *
 * Las últimas versiones van enteras y cada una tiene su ancla (/novedades#v0-9-261), para
 * poder enlazarla. Las anteriores van plegadas por mes y llevan a su publicación en GitHub:
 * con casi trescientas versiones, enteras harían una página que nadie abre.
 */
import { COMUN, esc } from './armazon.mjs'

const REPO = 'https://github.com/Mun1to/Adeorq-releases'
const ENTERAS = 30
const LARGO = 260

const TEXTOS = {
  es: {
    titulo: 'Novedades de Adeorq · qué trae cada versión',
    descripcion: 'El historial de versiones de Adeorq: qué trae cada una, con su fecha y un enlace propio.',
    miga: 'Novedades',
    h1: 'Novedades de Adeorq, versión a versión',
    indiceUltimas: 'Últimas versiones',
    anteriores: 'Versiones anteriores',
    anterioresP: 'Cada una lleva a sus notas completas en GitHub.',
    version: 'Versión',
    meses: (n) => (n === 1 ? '1 versión' : `${n} versiones`),
    entrada: (v, f) =>
      `Lo que trae cada versión de Adeorq, con su fecha. La última es la <b>v${esc(v)}</b>, del ${esc(f)}.`,
    ritmo: (total, dias) =>
      `<b>${total} versiones</b> publicadas desde que arrancó. En ${dias} de los últimos 90 días salió una versión nueva.`,
    cierre: '¿Falta algo o algo no funciona como se cuenta aquí? Dilo y se arregla.',
    preguntas: [
      {
        q: '¿Cómo me entero de que hay una versión nueva?',
        a: 'Adeorq la busca al arrancar y cada seis horas. Cuando hay una, sale la tarjeta <b>Actualizar Adeorq</b> abajo a la izquierda.',
      },
      {
        q: '¿Se instala sola?',
        a: 'No. Un clic en esa tarjeta la baja y la instala, y nunca instala sola.',
      },
      {
        q: '¿Dónde están todas las versiones?',
        a: `Las últimas, aquí. Todas, con sus instaladores y sus notas, en <a href="${REPO}/releases" rel="noopener">la página de versiones de GitHub</a>.`,
      },
    ],
  },
  en: {
    titulo: 'What’s new in Adeorq · what each release brings',
    descripcion: 'The Adeorq release history: what each version brings, with its date and its own link.',
    miga: 'What’s new',
    h1: 'What’s new in Adeorq, release by release',
    indiceUltimas: 'Latest releases',
    anteriores: 'Earlier releases',
    anterioresP: 'Each one links to its full notes on GitHub.',
    version: 'Version',
    meses: (n) => (n === 1 ? '1 release' : `${n} releases`),
    entrada: (v, f) => `What each Adeorq release brings, with its date. The latest is <b>v${esc(v)}</b>, from ${esc(f)}.`,
    ritmo: (total, dias) =>
      `<b>${total} releases</b> published since it started. A new one came out on ${dias} of the last 90 days.`,
    cierre: 'Is something missing, or not working the way it says here? Say so and it gets fixed.',
    preguntas: [
      {
        q: 'How do I find out there is a new version?',
        a: 'Adeorq looks for one when it starts and every six hours. When there is one, an <b>Update Adeorq</b> card appears at the bottom left.',
      },
      {
        q: 'Does it install by itself?',
        a: 'No. One click on that card downloads and installs it, and it never installs on its own.',
      },
      {
        q: 'Where are all the releases?',
        a: `The latest ones are here. All of them, with their installers and notes, are on <a href="${REPO}/releases" rel="noopener">the GitHub releases page</a>.`,
      },
    ],
  },
}

const anclaDe = (version) => `v${String(version).replace(/\./g, '-')}`

function fechaLarga(dia, lang) {
  const d = new Date(`${String(dia).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function mesLargo(dia, lang) {
  const d = new Date(`${String(dia).slice(0, 7)}-01T00:00:00Z`)
  const texto = d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** Un punto corto: corta en el último punto que quepa o, si no, en la última palabra. */
export function recortar(texto, largo = LARGO) {
  const limpio = String(texto).replace(/\s+/g, ' ').trim()
  if (limpio.length <= largo) return limpio
  const punto = limpio.slice(0, largo + 1).lastIndexOf('. ')
  let corto
  if (punto >= largo / 2) corto = limpio.slice(0, punto + 1)
  else {
    const espacio = limpio.slice(0, largo - 1).lastIndexOf(' ')
    corto = `${limpio.slice(0, espacio > 0 ? espacio : largo - 1).replace(/[\s,;:.]+$/, '')}…`
  }
  // Un corte no puede dejar una negrita o un código sin cerrar.
  if ((corto.match(/\*\*/g) || []).length % 2) corto = corto.endsWith('…') ? `${corto.slice(0, -1)}**…` : `${corto}**`
  if ((corto.replace(/\*\*/g, '').match(/`/g) || []).length % 2) corto = corto.endsWith('…') ? `${corto.slice(0, -1)}\`…` : `${corto}\``
  return corto
}

/** Las notas vienen en Markdown: negrita, código y enlaces, y nada más. */
export function enlinea(texto) {
  return esc(texto)
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

function diasConVersion(entradas, hoy) {
  const dias = new Set(entradas.map((e) => String(e.date || e.publishedAt || '').slice(0, 10)))
  let cuenta = 0
  for (let i = 0; i < 90; i++) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - i)).toISOString().slice(0, 10)
    if (dias.has(d)) cuenta++
  }
  return cuenta
}

function bloqueVersion(e, lang) {
  const t = TEXTOS[lang]
  const c = COMUN[lang]
  const traducida = lang === 'en' && e.en?.items?.length
  const items = traducida ? e.en.items : e.items?.length ? e.items : [e.summary || e.title || '']
  const marca = lang === 'en' && !traducida ? ' lang="es"' : ''
  const id = anclaDe(e.version)
  const dia = String(e.date || e.publishedAt || '').slice(0, 10)
  return `    <section id="${id}" class="version">
      <h2>${t.version} ${esc(e.version)}<a class="doc-ancla" href="#${id}" aria-label="${esc(c.anclaAria)}">#</a></h2>
      <p class="version__fecha"><time datetime="${dia}">${esc(fechaLarga(dia, lang))}</time></p>
      <ul class="doc-lista"${marca}>
${items.map((i) => `        <li>${enlinea(recortar(i))}</li>`).join('\n')}
      </ul>
    </section>`
}

function bloqueAnteriores(entradas, lang) {
  const t = TEXTOS[lang]
  const c = COMUN[lang]
  const porMes = new Map()
  for (const e of entradas) {
    const mes = String(e.date || e.publishedAt || '').slice(0, 7)
    if (!porMes.has(mes)) porMes.set(mes, [])
    porMes.get(mes).push(e)
  }
  const meses = [...porMes.entries()]
    .map(
      ([mes, lista]) => `      <details class="doc-pregunta">
        <summary>${esc(mesLargo(mes, lang))} · ${t.meses(lista.length)}</summary>
        <div class="doc-pregunta__cuerpo">
          <ul class="versiones-mes">
${lista
  .map((e) => {
    const dia = String(e.date || e.publishedAt || '').slice(0, 10)
    return `            <li id="${anclaDe(e.version)}"><a href="${REPO}/releases/tag/${encodeURIComponent(e.tag || `v${e.version}`)}" rel="noopener">v${esc(e.version)}</a> <time datetime="${dia}">${esc(fechaLarga(dia, lang))}</time></li>`
  })
  .join('\n')}
          </ul>
        </div>
      </details>`,
    )
    .join('\n')
  return `    <section id="anteriores">
      <h2>${t.anteriores}<a class="doc-ancla" href="#anteriores" aria-label="${esc(c.anclaAria)}">#</a></h2>
      <p>${t.anterioresP}</p>
${meses}
    </section>`
}

/** Los textos de la página a partir del historial. Sin versiones, para: mejor un build roto que una página vacía. */
export function textosNovedades(lang, changelog, hoy = new Date()) {
  const entradas = (changelog?.entries || []).filter((e) => e.version)
  if (!entradas.length) throw new Error('data/changelog.json no trae versiones: lanza scripts/update-data.mjs')
  const t = TEXTOS[lang]
  const enteras = entradas.slice(0, ENTERAS)
  const resto = entradas.slice(ENTERAS)
  const ultima = entradas[0]
  const dia = String(ultima.date || ultima.publishedAt || '').slice(0, 10)
  return {
    titulo: t.titulo,
    descripcion: t.descripcion,
    miga: t.miga,
    h1: t.h1,
    entrada: t.entrada(ultima.version, fechaLarga(dia, lang)),
    clase: 'doc--novedades',
    indice: [
      ...enteras.slice(0, 8).map((e) => [anclaDe(e.version), `v${esc(e.version)}`]),
      ...(resto.length ? [['anteriores', t.anteriores]] : []),
    ],
    cuerpo: [
      `    <p class="versiones-ritmo">${t.ritmo(entradas.length, diasConVersion(entradas, hoy))}</p>`,
      ...enteras.map((e) => bloqueVersion(e, lang)),
      ...(resto.length ? [bloqueAnteriores(resto, lang)] : []),
    ].join('\n\n'),
    preguntas: t.preguntas,
    cierre: t.cierre,
  }
}
