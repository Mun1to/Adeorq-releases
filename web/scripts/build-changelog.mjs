// Builds web/data/changelog.json from the public releases of
// Mun1to/Adeorq-releases. The repository has no CHANGELOG file, so the
// releases are the source of truth.
//
//   pnpm data:changelog
//
// Output contract (a superset of what the sections agent asked for, so both
// readers work):
//
//   {
//     "generatedAt": ISO string,
//     "source": releases page URL,
//     "count": number of entries,
//     "latest": version of the newest entry,
//     "entries": [
//       {
//         "version": "0.7.16",
//         "tag": "v0.7.16",
//         "date": "2026-07-26",         // ready to print
//         "publishedAt": ISO string,    // ready to sort
//         "title": "..." | null,        // first "## " heading, null if none
//         "name": "Adeorq 0.7.16",      // the release name, always present
//         "summary": "...",             // first paragraph of prose
//         "tags": ["nuevo"],            // guessed from the wording, a hint
//         "items": ["...", "..."],      // bullet points, may be empty
//         "highlights": [...],          // same array, kept as an alias
//         "headings": ["..."],          // every "## " heading, in order
//         "en": { title, summary, items, headings, notes } | null,
//                                       // the English half of bilingual notes
//         "image": null,                // no screenshots published yet
//         "notes": "full text as written",
//         "notesFormat": "markdown",
//         "url": release page URL,
//         "download": { url, filename, size, sizeLabel } | null
//       }
//     ]
//   }

import { relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  RELEASES_PAGE,
  WEB_ROOT,
  cleanNotes,
  dayOf,
  headingsFrom,
  highlightsFrom,
  listReleases,
  splitLanguages,
  summaryFrom,
  tagsFrom,
  titleFrom,
  versionOf,
  windowsInstaller,
  writeData,
} from './github.mjs'

export async function buildChangelog() {
  const releases = await listReleases()
  if (!releases.length) {
    throw new Error('No published releases found.')
  }

  const entries = releases.map((release) => {
    const windows = windowsInstaller(release)
    // The notes may carry both languages; the Spanish half is the one that is
    // always there, so the entry keeps its shape and English rides along in
    // `en`. An older release without a translation simply has `en: null`, and
    // the site falls back to Spanish rather than printing nothing.
    const { es, en } = splitLanguages(release.body)
    const items = highlightsFrom(es)

    return {
      version: versionOf(release),
      tag: release.tag_name,
      date: dayOf(release.published_at),
      publishedAt: release.published_at,
      title: titleFrom(es),
      name: release.name || release.tag_name,
      summary: summaryFrom(es),
      // Read off the Spanish text on purpose, in both languages: the wording
      // rules are Spanish, and what changes between languages is the word the
      // badge prints, which is the website's job.
      tags: tagsFrom(es),
      items,
      highlights: items,
      headings: headingsFrom(es),
      en: en
        ? {
            title: titleFrom(en),
            summary: summaryFrom(en),
            items: highlightsFrom(en),
            headings: headingsFrom(en),
            notes: en,
          }
        : null,
      image: null,
      notes: es,
      notesFormat: 'markdown',
      url: release.html_url,
      download: windows
        ? {
            url: windows.url,
            filename: windows.filename,
            size: windows.size,
            sizeLabel: windows.sizeLabel,
          }
        : null,
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    source: RELEASES_PAGE,
    count: entries.length,
    latest: entries[0].version,
    entries,
  }
}

export async function main() {
  const data = await buildChangelog()
  const target = await writeData('changelog.json', data)
  console.log(
    `changelog.json -> ${data.count} releases, newest ${data.latest} ` +
      `[${relative(WEB_ROOT, target)}]`,
  )
  return data
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`build-changelog failed: ${error.message}`)
    process.exit(1)
  })
}
