// Refreshes every file under web/data/ before dev and before build.
//
//   pnpm data           strict: fails if GitHub cannot be reached
//   pnpm data --soft    keeps the files already on disk if GitHub fails
//
// The soft mode is what `pnpm dev` and `pnpm build` use, so an offline laptop
// or a rate limited API never leaves localhost without data.

import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DATA_DIR } from './github.mjs'
import { main as fetchLatest } from './fetch-latest.mjs'
import { main as buildChangelog } from './build-changelog.mjs'

const soft = process.argv.includes('--soft')

const jobs = [
  { file: 'latest.json', run: fetchLatest },
  { file: 'changelog.json', run: buildChangelog },
]

async function exists(file) {
  try {
    await access(resolve(DATA_DIR, file))
    return true
  } catch {
    return false
  }
}

let failed = false

for (const job of jobs) {
  try {
    await job.run()
  } catch (error) {
    failed = true
    if (!soft) {
      console.error(`data: ${job.file} failed: ${error.message}`)
      continue
    }
    if (await exists(job.file)) {
      console.warn(`data: ${job.file} not refreshed (${error.message}); keeping the file on disk.`)
    } else {
      console.error(`data: ${job.file} missing and could not be built: ${error.message}`)
      process.exit(1)
    }
  }
}

if (failed && !soft) process.exit(1)
