// Shared helpers for the data scripts: talk to the public GitHub API and shape
// releases into the JSON the website consumes.
//
// No credentials live in this repo. If a GITHUB_TOKEN is present in the
// environment it is used only to raise the rate limit, and it is never written
// to any generated file.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO = 'Mun1to/Adeorq-releases'
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`

const API = `https://api.github.com/repos/${REPO}`

export const WEB_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const DATA_DIR = resolve(WEB_ROOT, 'data')

/** GET a JSON document from the GitHub API with friendly error messages. */
export async function api(path) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'adeorq-web-data-script',
  }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  const response = await fetch(`${API}${path}`, { headers })

  if (!response.ok) {
    const remaining = response.headers.get('x-ratelimit-remaining')
    if (response.status === 403 && remaining === '0') {
      const reset = Number(response.headers.get('x-ratelimit-reset') || 0)
      const when = reset ? new Date(reset * 1000).toISOString() : 'later'
      throw new Error(
        `GitHub API rate limit reached. It resets at ${when}. ` +
          'Set GITHUB_TOKEN in your shell to raise the limit.',
      )
    }
    throw new Error(`GitHub API ${response.status} ${response.statusText} for ${path}`)
  }

  return response.json()
}

/** Every published release, newest first. Drafts and prereleases are dropped. */
export async function listReleases() {
  const all = []
  for (let page = 1; page <= 10; page += 1) {
    const batch = await api(`/releases?per_page=100&page=${page}`)
    all.push(...batch)
    if (batch.length < 100) break
  }
  return all
    .filter((release) => !release.draft && !release.prerelease)
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
}

/**
 * The Windows installer of a release.
 *
 * Only the .exe is exposed. The .sig asset and the updater manifest are
 * deliberately ignored: they belong to the auto update channel, not to the
 * public download button.
 */
export function windowsInstaller(release) {
  const asset = (release.assets || []).find(
    (candidate) =>
      candidate.name.toLowerCase().endsWith('.exe') &&
      !candidate.name.toLowerCase().endsWith('.sig'),
  )
  if (!asset) return null

  return {
    url: asset.browser_download_url,
    filename: asset.name,
    size: asset.size,
    sizeLabel: humanSize(asset.size),
    arch: asset.name.includes('x64') ? 'x64' : 'unknown',
    downloadCount: asset.download_count ?? 0,
  }
}

/** "3646258" becomes "3,5 MB" (Spanish decimal comma, the site speaks Spanish). */
export function humanSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1).replace('.', ',')} MB`
  return `${Math.round(bytes / 1024)} KB`
}

/** Release notes as written by the author, with CRLF and stray spacing removed. */
export function cleanNotes(body) {
  return String(body || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Marker that splits bilingual release notes. Everything above it is Spanish,
 * everything below is English.
 *
 * An HTML comment on purpose: GitHub hides it, so the release page reads as one
 * document with a rule between the two versions, and the website still gets an
 * unambiguous machine marker. A heading like "## English" would have been read
 * as the entry title by `titleFrom`.
 */
export const LANG_MARK = /^<!--\s*lang:en\s*-->$/im

/**
 * Release notes split by language: `{ es, en }`, with `en` null when the author
 * wrote only one version.
 *
 * The site is bilingual but the releases are the single source of truth, so the
 * translation travels inside the notes instead of living in a parallel file
 * that nobody remembers to update.
 */
export function splitLanguages(body) {
  const text = cleanNotes(body)
  const lines = text.split('\n')
  const at = lines.findIndex((line) => LANG_MARK.test(line.trim()))
  if (at === -1) return { es: text, en: null }

  const es = lines.slice(0, at).join('\n').replace(/\n*-{3,}\n*$/, '').trim()
  const en = lines.slice(at + 1).join('\n').trim()
  return { es, en: en || null }
}

/**
 * Bullet points for the changelog. Markdown lists win; otherwise the prose is
 * split into sentences so a section can render short lines either way.
 */
export function highlightsFrom(notes, max = 4) {
  const text = cleanNotes(notes)
  if (!text) return []

  // A bullet is not a line: notes are hard-wrapped at 90 columns, so a three
  // line bullet used to reach the website as its first line alone, cut mid
  // sentence ("...on every turn it"). The continuation lines are folded back in
  // until a blank line or the next bullet closes it.
  const bullets = []
  let open = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (/^[-*]\s+/.test(line)) {
      if (open) bullets.push(open)
      open = line.replace(/^[-*]\s+/, '').trim()
      continue
    }
    if (!open) continue
    if (!line || /^#{1,6}\s/.test(line) || line.startsWith('|') || /^-{3,}$/.test(line)) {
      bullets.push(open)
      open = null
      continue
    }
    open = `${open} ${line}`
  }
  if (open) bullets.push(open)

  if (bullets.length) return bullets.filter(Boolean).slice(0, max)

  // Headings out before splitting into sentences. They are not prose: the "## "
  // line is already printed as the entry title, and joining every line into one
  // string glued it to the first sentence, so the website showed a bullet that
  // began "## Lo que cambia La pestaña contaba..." (Munir, 2026-08-20).
  // Markdown tables go out too: a release that lists nine clients in a table was
  // rendering a bullet that read "| Client | Installs with | |---|---|".
  return text
    .split('\n')
    .filter((line) => {
      const l = line.trim()
      return (
        l &&
        !/^#{1,6}\s/.test(l) &&
        !LANG_MARK.test(l) &&
        !l.startsWith('|') &&
        !/^-{3,}$/.test(l)
      )
    })
    .join(' ')
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, max)
}

/**
 * A headline for a changelog entry: the first "## " heading of the notes.
 *
 * Returns null when the release has no heading. The release name is not used
 * as a fallback on purpose: it is always "Adeorq 0.7.16", and a section that
 * already prints the version next to the entry would show it twice. An empty
 * title lets the summary carry the entry.
 */
export function titleFrom(release) {
  const body = typeof release === 'string' ? release : release?.body
  const heading = cleanNotes(body)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#{2,3}\s+/.test(line))

  return heading ? heading.replace(/^#{2,3}\s+/, '').trim() : null
}

/** Every "## " heading of the notes, in order. Useful to group an entry. */
export function headingsFrom(notes) {
  return cleanNotes(notes)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^#{2,3}\s+/.test(line))
    .map((line) => line.replace(/^#{2,3}\s+/, '').trim())
}

/** The first paragraph of prose, headings and bullets removed. */
export function summaryFrom(notes, maxLength = 220) {
  const paragraph = cleanNotes(notes)
    .split('\n\n')
    .map((block) => block.trim())
    .find((block) => block && !/^#{1,6}\s/.test(block) && !/^[-*]\s/.test(block))

  if (!paragraph) return ''

  const text = paragraph.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text

  const sentences = text.split(/(?<=\.)\s+/)
  let out = ''
  for (const sentence of sentences) {
    if (out && `${out} ${sentence}`.length > maxLength) break
    out = out ? `${out} ${sentence}` : sentence
  }
  return out || `${text.slice(0, maxLength).trim()}...`
}

/**
 * Labels for the changelog badges, guessed from the wording of the notes.
 * A hint for the design, never a promise: a section is free to ignore them.
 */
export function tagsFrom(notes) {
  const text = cleanNotes(notes).toLowerCase()
  const tags = []
  if (/\b(nuevo|nueva|ahora|añad|anad|trae|estrena|llega|primera)/.test(text)) tags.push('nuevo')
  if (/\b(mejor|más rápid|mas rapid|reordenad|afinad|pulid|rediseñ|redisen)/.test(text)) {
    tags.push('mejora')
  }
  if (/\b(arreglad|corregid|soluciona|ya no |deja de fallar|fix)/.test(text)) tags.push('arreglo')
  return tags.length ? tags : ['nuevo']
}

/** "v0.7.16" becomes "0.7.16". */
export function versionOf(release) {
  return String(release.tag_name || '').replace(/^v/, '')
}

/** YYYY-MM-DD, the shape a section wants to print. */
export function dayOf(isoDate) {
  return String(isoDate || '').slice(0, 10)
}

/**
 * Write a data file. The payload is checked first: nothing that smells like a
 * signing key or a token is allowed to reach a public directory.
 */
export async function writeData(filename, payload) {
  const serialised = JSON.stringify(payload, null, 2)
  const forbidden = /"(signature|signatures|token|secret|private_key|password)"\s*:/i
  if (forbidden.test(serialised)) {
    throw new Error(`Refusing to write ${filename}: it contains a secret-looking field.`)
  }

  const target = resolve(DATA_DIR, filename)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, `${serialised}\n`, 'utf8')
  return target
}
