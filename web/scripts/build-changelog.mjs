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
    const items = highlightsFrom(release.body)

    return {
      version: versionOf(release),
      tag: release.tag_name,
      date: dayOf(release.published_at),
      publishedAt: release.published_at,
      title: titleFrom(release),
      name: release.name || release.tag_name,
      summary: summaryFrom(release.body),
      tags: tagsFrom(release.body),
      items,
      highlights: items,
      headings: headingsFrom(release.body),
      image: null,
      notes: cleanNotes(release.body),
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
