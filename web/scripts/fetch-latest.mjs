// Reads the latest public release of Mun1to/Adeorq-releases and writes the
// download data the site consumes.
//
//   pnpm data:latest
//
// Two files are written, on purpose:
//
//   data/release.json   the small contract the sections agent asks for first:
//                       { version, url, pub_date, size_bytes, notes }
//   data/latest.json    a superset: the same fields, plus the Tauri updater
//                       shape (platforms["windows-x86_64"].url) so either
//                       reader works, plus the richer fields a section may
//                       want (title, date, sizeLabel, releaseUrl).
//
// What is never copied here: the auto update signature and the .sig asset.
// They belong to the updater channel, and this directory is published.

import { relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  RELEASES_PAGE,
  WEB_ROOT,
  api,
  cleanNotes,
  dayOf,
  summaryFrom,
  versionOf,
  windowsInstaller,
  writeData,
} from './github.mjs'

export async function buildLatest() {
  const release = await api('/releases/latest')

  const windows = windowsInstaller(release)
  if (!windows) {
    throw new Error(`Release ${release.tag_name} has no Windows installer asset.`)
  }

  const version = versionOf(release)
  const notes = cleanNotes(release.body)

  const compact = {
    version,
    url: windows.url,
    pub_date: release.published_at,
    size_bytes: windows.size,
    notes,
  }

  const full = {
    ...compact,
    generatedAt: new Date().toISOString(),
    source: release.html_url,
    tag: release.tag_name,
    title: release.name || release.tag_name,
    date: dayOf(release.published_at),
    publishedAt: release.published_at,
    notesFormat: 'markdown',
    summary: summaryFrom(release.body),
    windows,
    // Same key the Tauri updater manifest uses, so a reader written against
    // that shape finds the installer too. No signature: this file is public.
    platforms: {
      'windows-x86_64': {
        url: windows.url,
        filename: windows.filename,
        size: windows.size,
      },
    },
    releaseUrl: release.html_url,
    allReleasesUrl: RELEASES_PAGE,
  }

  return { compact, full }
}

export async function main() {
  const { compact, full } = await buildLatest()
  const target = await writeData('latest.json', full)
  await writeData('release.json', compact)
  console.log(
    `latest.json -> ${full.tag} (${full.date}), ${full.windows.filename} ` +
      `${full.windows.sizeLabel} [${relative(WEB_ROOT, target)}, release.json]`,
  )
  return full
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`fetch-latest failed: ${error.message}`)
    process.exit(1)
  })
}
