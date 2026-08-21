// Build configuration for the public Adeorq website.
//
// The site is plain HTML, CSS and JS written by hand. Vite is here for two
// reasons only: a dev server with hot reload, and a production bundle. It does
// not impose a framework, and it never rewrites the markup.

import { cp, copyFile, readdir, access } from 'node:fs/promises'
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

export default defineConfig({
  root: ROOT,
  // Relative URLs so the bundle works at a domain root, in a subpath and from
  // a plain file:// preview.
  base: './',
  // Multi page: an unknown path returns a real 404 instead of the home page.
  appType: 'mpa',
  publicDir: false,
  plugins: [reloadOnPartials(), copyStaticExtras()],
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
        // La web anterior, hasta que sus secciones (descarga, changelog, FAQ
        // y pie) esten portadas a la portada nueva de `index.html`.
      },
    },
  },
})
