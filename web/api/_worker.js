// Cloudflare Pages worker for the Adeorq website (advanced mode).
//
// The site works perfectly without this file: the download section reads the
// static /data/latest.json produced at build time. This worker only adds a
// live endpoint so a visitor can see a release published after the last
// deploy, without every visitor hitting the GitHub API themselves.
//
//   GET /api/latest      same shape as /data/latest.json, cached one hour
//
// Anything else falls through to the static assets. There are no credentials
// here: the GitHub API is called unauthenticated, exactly as a browser would.
//
// Deployment: vite.config.js copies this file to dist/_worker.js during the
// build. Nothing is published until someone runs the deploy on purpose.

const REPO = 'Mun1to/Adeorq-releases'
const CACHE_SECONDS = 3600

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // One canonical hostname. Both adeorq.com and www.adeorq.com point at this
    // project, and both answering 200 splits every ranking signal in two, so
    // www is redirected here with a permanent 301. Cloudflare already upgrades
    // http to https, so this is the only case left.
    if (url.hostname === 'www.adeorq.com') {
      url.hostname = 'adeorq.com'
      // Forced, not inherited: one hop, never http -> https -> apex.
      url.protocol = 'https:'
      return Response.redirect(url.toString(), 301)
    }

    if (url.pathname === '/api/latest') {
      return latest(request)
    }

    return withCache(await env.ASSETS.fetch(request), url.pathname)
  },
}

/**
 * Cache rules for the static files. Vite hashes the file names under /assets/,
 * so those are immutable; the generated data has to stay fresh enough that a
 * release published today shows up today.
 */
function withCache(response, pathname) {
  // Only successful responses get cached. Measured on 2026-08-21: /assets/og.png
  // did not exist yet, the wildcard answered with the home page HTML, and this
  // function stamped it `immutable` for a year. The real file shipped later and
  // the edge kept serving the HTML, so every shared link showed a broken card.
  // A miss must never be cached as if it were the file.
  if (!response.ok) return response

  let value = null

  if (pathname.startsWith('/assets/')) {
    value = 'public, max-age=31536000, immutable'
  } else if (pathname.startsWith('/data/')) {
    value = 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400'
  } else if (pathname.endsWith('.html') || pathname === '/' || !pathname.includes('.')) {
    value = 'public, max-age=0, s-maxage=600, must-revalidate'
  }

  if (!value) return response

  const patched = new Response(response.body, response)
  patched.headers.set('Cache-Control', value)
  return patched
}

async function latest(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const upstream = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'adeorq-web',
      },
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    })

    if (!upstream.ok) {
      return json({ error: `GitHub API ${upstream.status}` }, 502)
    }

    return json(shape(await upstream.json()), 200)
  } catch (error) {
    return json({ error: 'Upstream unavailable' }, 502)
  }
}

/**
 * Same contract as scripts/fetch-latest.mjs. Kept in sync by hand on purpose:
 * a Pages worker in advanced mode has to be a single self contained file.
 */
function shape(release) {
  const asset = (release.assets || []).find(
    (candidate) =>
      candidate.name.toLowerCase().endsWith('.exe') &&
      !candidate.name.toLowerCase().endsWith('.sig'),
  )

  return {
    generatedAt: new Date().toISOString(),
    source: release.html_url,
    version: String(release.tag_name || '').replace(/^v/, ''),
    tag: release.tag_name,
    title: release.name || release.tag_name,
    date: String(release.published_at || '').slice(0, 10),
    publishedAt: release.published_at,
    notes: String(release.body || '').replace(/\r\n/g, '\n').trim(),
    windows: asset
      ? {
          url: asset.browser_download_url,
          filename: asset.name,
          size: asset.size,
          sizeLabel: humanSize(asset.size),
          arch: asset.name.includes('x64') ? 'x64' : 'unknown',
          downloadCount: asset.download_count ?? 0,
        }
      : null,
    releaseUrl: release.html_url,
    allReleasesUrl: `https://github.com/${REPO}/releases`,
  }
}

function humanSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1).replace('.', ',')} MB`
  return `${Math.round(bytes / 1024)} KB`
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=300, s-maxage=${CACHE_SECONDS}`,
      'Access-Control-Allow-Origin': '*',
    },
  })
}
