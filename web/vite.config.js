// Build configuration for the public Adeorq website.
//
// The site is plain HTML, CSS and JS written by hand. Vite is here for two
// reasons only: a dev server with hot reload, and a production bundle. It does
// not impose a framework, and it never rewrites the markup.

import { createHash } from 'node:crypto'
import { cp, copyFile, readdir, access, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { entradasDeCuentas, revisarSalida } from './scripts/cuentas-fuera.mjs'

const ROOT = resolve(import.meta.dirname)

// Infrastructure that must not end up in the published bundle, plus the
// folders Vite already handles.
const NEVER_COPY = new Set([
  'node_modules',
  'dist',
  '.wrangler',
  '.git',
  'scripts',
  'api',
  'package.json',
  'pnpm-lock.yaml',
  'vite.config.js',
  'wrangler.toml',
  '.gitignore',
  '.dev.vars',
  // Las paginas que Vite compila como entradas: copiarlas en crudo pisaria la
  // version procesada y dejaria sus rutas apuntando a archivos sin hashear.
  'index.html',
  'guia.html',
  // La privacidad en español, que también es una entrada (la genera
  // hacer-privacidad.mjs), y los fragmentos de texto de donde sale: son borradores
  // de taller, no páginas, y no se publican.
  'privacidad.html',
  'legal',
  // La portada inglesa, que también es una entrada (la genera hacer-ingles.mjs).
  'en',
  // Las cuentas: fuera siempre de esta copia. Con ADEORQ_CUENTAS=1 entran como
  // entradas de Vite, y sin ella no entran por ningún lado (scripts/cuentas-fuera.mjs).
  'cuenta',
])

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Reloads the page when a section fragment changes. The sections live inside
 * index.html, but sections/ is still where they are drafted, so an edit there
 * should show up without a manual refresh.
 */
function reloadOnPartials() {
  return {
    name: 'adeorq-reload-on-partials',
    handleHotUpdate({ file, server }) {
      if (file.replace(/\\/g, '/').includes('/sections/')) {
        server.ws.send({ type: 'full-reload' })
        return []
      }
    },
  }
}

/**
 * Copies anything Vite did not pick up from the HTML entry: data/, images,
 * fonts, extra pages, classic scripts. Existing files are never overwritten,
 * so the hashed assets Vite emitted always win.
 */
function copyStaticExtras() {
  let outDir
  return {
    name: 'adeorq-copy-static-extras',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(ROOT, config.build.outDir)
    },
    async closeBundle() {
      for (const entry of await readdir(ROOT, { withFileTypes: true })) {
        if (NEVER_COPY.has(entry.name) || entry.name.endsWith('.md')) continue
        await cp(resolve(ROOT, entry.name), resolve(outDir, entry.name), {
          recursive: true,
          force: false,
          errorOnExist: false,
        })
      }

      await stampDemo(outDir)

      // Cloudflare Pages advanced mode: a single worker at the root of the
      // output directory serves /api/* and hands everything else to the static
      // assets. Harmless on hosts that ignore it, such as GitHub Pages.
      const worker = resolve(ROOT, 'api', '_worker.js')
      if (await exists(worker)) {
        await copyFile(worker, resolve(outDir, '_worker.js'))
      }
    },
  }
}

/**
 * The account pages only exist in a build that asks for them. They get the project
 * URL and its public key here, because neither lives in this repository, and the
 * last thing any build does is make sure they did not slip into the output anyway.
 */
function accountPages() {
  let outDir
  return {
    name: 'adeorq-cuentas',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(ROOT, config.build.outDir)
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html
          .replaceAll('__ADEORQ_SUPABASE_URL__', process.env.ADEORQ_SUPABASE_URL ?? '')
          .replaceAll('__ADEORQ_SUPABASE_CLAVE__', process.env.ADEORQ_SUPABASE_CLAVE ?? '')
      },
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        revisarSalida(outDir)
      },
    },
  }
}

/**
 * The two privacy pages are generated (scripts/hacer-privacidad.mjs) and carry
 * workshop comments: the "generated, do not edit" mark and the markers of the
 * metadata block, which name files of this repository. None of that belongs in
 * what is served, so it goes. The two `email_off` marks stay: Cloudflare reads
 * them to leave the contact address alone instead of replacing it with
 * "[email protected]" and a script these pages do not load.
 */
function legalSinComentarios() {
  return {
    name: 'adeorq-legal-sin-comentarios',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!/[\\/](privacidad|privacy)\.html$/.test(ctx.filename)) return html
        return html.replace(/<!--(?!\/?email_off-->)[\s\S]*?-->\n?/g, '')
      },
    },
  }
}

/**
 * The demo in the hero (demo/) is copied as it is, so its files keep their
 * names from one deploy to the next and a browser that has them cached keeps
 * the old ones. Measured on 2026-10-12: a fix to demo.css was live on the
 * server and the page still ran the broken sheet, four hours of it. Here the
 * three files its page loads get `?v=` with a hash of the whole folder, and
 * vivo.js passes the same stamp on to the data it fetches.
 */
async function stampDemo(outDir) {
  const dir = resolve(outDir, 'demo')
  const page = resolve(dir, 'index.html')
  if (!(await exists(page))) return

  const hash = createHash('sha256')
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isFile()) hash.update(entry.name).update(await readFile(resolve(dir, entry.name)))
  }
  const stamp = hash.digest('hex').slice(0, 10)

  const html = await readFile(page, 'utf8')
  const stamped = html.replace(/(href|src)="(app\.css|demo\.css|vivo\.js)"/g, `$1="$2?v=${stamp}"`)
  if (stamped === html) throw new Error('stampDemo: demo/index.html no longer loads app.css, demo.css and vivo.js by those names')
  await writeFile(page, stamped)
}

async function readJson(name) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, 'data', name), 'utf8'))
  } catch {
    return null
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

function longDate(iso, lang = 'es') {
  const d = new Date(iso || '')
  if (isNaN(d)) return ''
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Up to 190 characters, cut at the last full stop that fits or, when there is
// none past the middle, at the last whole word: cut mid-word ("cuya rejilla
// na…") it read like a bug. Same rule as `corta` in portada/datos.js.
function cutSummary(text) {
  if (text.length <= 190) return text
  const stop = text.slice(0, 191).lastIndexOf('. ')
  if (stop >= 95) return text.slice(0, stop + 1)
  const space = text.slice(0, 188).lastIndexOf(' ')
  return `${text.slice(0, space > 0 ? space : 187).replace(/[\s,;:.]+$/, '')}…`
}

// A small count in words, as the hero sentence reads; digits past twenty.
const WORDS = {
  es: ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte'],
  en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'],
}
function inWords(n, lang) {
  return WORDS[lang][n] ?? String(n)
}

/**
 * Writes the version, the release count and the last three releases INTO the
 * served front page. portada/datos.js still refreshes them in the browser, but
 * whoever reads the page without running JavaScript (the assistants that answer
 * questions do not run it) was reading the values typed by hand months ago:
 * v0.9.129 and 155 releases, with an empty list, on 2026-10-09. The build runs
 * `update-data.mjs` first, so data/ is the fresh copy from the API.
 */
function bakeReleaseData() {
  return {
    name: 'adeorq-bake-release-data',
    apply: 'build',
    async transformIndexHtml(html, ctx) {
      // The front page in both languages: /index.html and /en/index.html.
      if (!ctx.filename.replace(/\\/g, '/').endsWith('index.html')) return html
      const lang = /<html lang="en"/.test(html) ? 'en' : 'es'
      const latest = await readJson('latest.json')
      const log = await readJson('changelog.json')
      let out = html
      if (latest?.version) {
        out = out.replace(/(<b data-descarga-version>)[^<]*(<\/b>)/, `$1v${escapeHtml(latest.version)}$2`)
        out = out.replace(/(<span data-descarga-fecha>)[^<]*(<\/span>)/, `$1${escapeHtml(longDate(latest.pub_date, lang))}$2`)
        if (latest.size_bytes) {
          const mb = (latest.size_bytes / 1048576).toFixed(1)
          out = out.replace(/(<span data-descarga-peso>)[^<]*(<\/span>)/, `$1${lang === 'en' ? mb : mb.replace('.', ',')} MB$2`)
        }
      }
      if (log?.count) out = out.replace(/(<b data-log-cuenta>)[^<]*(<\/b>)/, `$1${log.count}$2`)
      // The figure under the hero buttons that the build knows: how many clients
      // the logo strip shows (scripts/extraer-clientes.mjs writes that strip from
      // the app's catalogue); it is filled in further down. The installed size
      // next to it is measured by hand and written in index.html.
      // One bar per day of the last 90, lit on the days a release shipped. The
      // same count as `tira` in portada/datos.js, which redraws it in the browser.
      if (log?.entries?.length) {
        const days = new Set(log.entries.map((e) => String(e.date || e.publishedAt || '').slice(0, 10)))
        const now = new Date()
        const bars = []
        for (let i = 89; i >= 0; i--) {
          const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)).toISOString().slice(0, 10)
          bars.push(days.has(day))
        }
        out = out.replace(/(<div class="tira__dias"[^>]*data-tira-dias>)\s*(<\/div>)/, `$1${bars.map((b) => (b ? '<i data-si></i>' : '<i></i>')).join('')}$2`)
        out = out.replace(/(<span data-tira-cuenta>)[^<]*(<\/span>)/, `$1${bars.filter(Boolean).length}$2`)
      }
      if (out.includes('data-cifra-clientes')) {
        const strip = out.match(/<ul class="cinta__grupo">([\s\S]*?)<\/ul>/)
        const clients = strip ? (strip[1].match(/class="cli"/g) || []).length : 0
        // Stop rather than ship the figures typed by hand: the strip changed shape,
        // like poner-metadatos.mjs and the social card stop under five.
        if (clients < 5) throw new Error(`the logo strip of ${ctx.filename} gives ${clients} clients: the pattern no longer matches`)
        out = out.replace(/(<b data-cifra-clientes>)[^<]*(<\/b>)/, `$1${clients}$2`)
        // The hero names three of them and says how many more, in words. Typed by
        // hand it would drift from the figure above the next time the catalogue changes.
        out = out.replace(/(<span data-cifra-otros>)[^<]*(<\/span>)/, `$1${inWords(clients - 3, lang)}$2`)
      }
      if (log?.entries?.length) {
        // The same three rows, and the same trimming, as portada/datos.js. In
        // English, a release written before the notes carried English keeps
        // its Spanish summary, marked as such for screen readers.
        const rows = log.entries.slice(0, 3).map((e) => {
          const enSummary = lang === 'en' && e.en ? e.en.summary || e.en.title : ''
          const text = (enSummary || e.summary || e.title || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
          const short = cutSummary(text)
          const marca = lang === 'en' && !enSummary ? ' lang="es"' : ''
          return `<li class="log__fila"><b class="log__ver">${escapeHtml(e.version ? `v${e.version}` : e.tag || '')}</b>` +
            `<span class="log__fecha">${escapeHtml(longDate(e.publishedAt || e.date, lang))}</span>` +
            `<p class="log__texto"${marca}>${escapeHtml(short)}</p></li>`
        })
        out = out.replace(/(<ol class="log" data-log>)\s*(<\/ol>)/, `$1${rows.join('')}$2`)
      }
      return out
    },
  }
}

export default defineConfig({
  root: ROOT,
  // Relative URLs so the bundle works at a domain root, in a subpath and from
  // a plain file:// preview.
  base: './',
  // Multi page: an unknown path returns a real 404 instead of the home page.
  appType: 'mpa',
  publicDir: false,
  plugins: [reloadOnPartials(), bakeReleaseData(), legalSinComentarios(), copyStaticExtras(), accountPages()],
  // 127.0.0.1 y no «localhost»: en esta máquina localhost resuelve solo a ::1,
  // el servidor escuchaba solo en IPv6 y el Edge de Munir no llegaba (2026-10-14,
  // «me estáis abriendo localhost que no funcionan en mi navegador»).
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    open: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    open: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      input: {
        index: resolve(ROOT, 'index.html'),
        guia: resolve(ROOT, 'guia.html'),
        en: resolve(ROOT, 'en/index.html'),
        // Las dos de privacidad: /privacidad y /en/privacy.
        privacidad: resolve(ROOT, 'privacidad.html'),
        privacy: resolve(ROOT, 'en/privacy.html'),
        // La web anterior, hasta que sus secciones (descarga, changelog, FAQ
        // y pie) esten portadas a la portada nueva de `index.html`.
        ...entradasDeCuentas(ROOT),
      },
    },
  },
})
