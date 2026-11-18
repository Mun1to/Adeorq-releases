/**
 * Tells the search engines the site changed, without waiting for them to come by.
 *
 *   node scripts/avisar-indexnow.mjs            (from web/)
 *
 * Uses IndexNow, the protocol shared by Bing, Yandex, Naver, Seznam and the rest of
 * indexnow.org/searchengines.json: it sends the URLs of the sitemap and the key published on
 * the site itself, and they check the key before taking notice. Google does NOT use IndexNow:
 * that one goes through Search Console.
 *
 * The key is public by design (it sits in a URL) and its file is web/<key>.txt, copied to
 * dist/ like robots.txt. If that file is deleted, IndexNow stops accepting the notices.
 *
 * It is the last step of .github/workflows/web.yml, after the deploy, and that step has
 * continue-on-error: a failure here never stops a release of the site.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SITE = 'https://adeorq.com'
const KEY = '24aa7251bc17d8a092abbea667029666'
const ENDPOINT = 'https://api.indexnow.org/indexnow'

const sitemap = readFileSync(resolve(import.meta.dirname, '..', 'sitemap.xml'), 'utf8')
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, u]) => u.trim())
if (!urls.length) {
  console.error('sitemap.xml has no URLs.')
  process.exit(1)
}
const foreign = urls.filter((u) => !u.startsWith(`${SITE}/`))
if (foreign.length) {
  console.error(`The sitemap has URLs from another domain: ${foreign.join(', ')}`)
  process.exit(1)
}

const body = { host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls }

// The content is compared, not just the status: Cloudflare Pages once answered 200 with the
// home page for files that did not exist (see probar-indexacion.mjs). A fresh deploy can also
// take a few seconds to reach the domain, so it retries for a while.
let published = ''
for (let attempt = 1; attempt <= 12; attempt++) {
  try {
    const r = await fetch(`${body.keyLocation}?t=${Date.now()}`, { signal: AbortSignal.timeout(15000) })
    if (r.ok) published = (await r.text()).trim()
  } catch {}
  if (published === KEY) break
  await new Promise((done) => setTimeout(done, 10000))
}
if (published !== KEY) {
  console.error(`The key is not published at ${body.keyLocation}. Deploy the site first and try again.`)
  process.exit(1)
}

const response = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(30000),
})

// 200 and 202 both mean "received"; 202 means the key is still being validated.
// Neither means "indexed".
if (response.status === 200 || response.status === 202) {
  console.log(`Notified ${urls.length} URLs (response ${response.status}).`)
  for (const u of urls) console.log(`  ${u}`)
} else {
  console.error(`IndexNow answered ${response.status}: ${await response.text()}`)
  process.exit(1)
}
