// Build configuration for the public Adeorq website.
//
// The site is plain HTML, CSS and JS written by hand. Vite is here for two
// reasons only: a dev server with hot reload, and a production bundle. It does
// not impose a framework, and it never rewrites the markup.

import { cp, copyFile, readdir, access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

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
  // La portada inglesa, que también es una entrada (la genera hacer-ingles.mjs).
  'en',
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
  return {
    name: 'adeorq-copy-static-extras',
    apply: 'build',
    async closeBundle() {
      const outDir = resolve(ROOT, 'dist')

      for (const entry of await readdir(ROOT, { withFileTypes: true })) {
        if (NEVER_COPY.has(entry.name) || entry.name.endsWith('.md')) continue
        await cp(resolve(ROOT, entry.name), resolve(outDir, entry.name), {
          recursive: true,
          force: false,
          errorOnExist: false,
        })
      }

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
      if (log?.entries?.length) {
        // The same three rows, and the same trimming, as portada/datos.js. In
        // English, a release written before the notes carried English keeps
        // its Spanish summary, marked as such for screen readers.
        const rows = log.entries.slice(0, 3).map((e) => {
          const enSummary = lang === 'en' && e.en ? e.en.summary || e.en.title : ''
          const text = (enSummary || e.summary || e.title || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
          const short = text.length > 190 ? `${text.slice(0, 187).trimEnd()}…` : text
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
  plugins: [reloadOnPartials(), bakeReleaseData(), copyStaticExtras()],
  server: {
    port: 5173,
    strictPort: false,
    open: true,
  },
  preview: {
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
        // La web anterior, hasta que sus secciones (descarga, changelog, FAQ
        // y pie) esten portadas a la portada nueva de `index.html`.
      },
    },
  },
})
