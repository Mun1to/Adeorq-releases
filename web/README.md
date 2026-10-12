# Adeorq website

The public site for Adeorq: hand written HTML, CSS and JS, with the download
and changelog data pulled from the public releases of
[`Mun1to/Adeorq-releases`](https://github.com/Mun1to/Adeorq-releases).

## Run it locally

From the repository root, once:

```powershell
pnpm install
pnpm approve-builds --all
```

Then, every time you want the site:

```powershell
cd web
pnpm dev
```

That is the whole thing. `pnpm dev` refreshes `data/` from the GitHub API and
starts Vite on <http://localhost:5173>, opening the browser for you. Edits to
any HTML, CSS or JS file reload instantly.

If GitHub cannot be reached (no network, rate limit) the dev server still
starts: it keeps the data files already on disk and prints a warning.

## Commands

| Command              | What it does                                             |
| -------------------- | -------------------------------------------------------- |
| `pnpm dev`           | Refresh data, then serve on `localhost:5173` with reload  |
| `pnpm build`         | Refresh data, then build the production site into `dist/` |
| `pnpm preview`       | Serve the built `dist/` on `localhost:4173`               |
| `pnpm data`          | Refresh `data/` only. Fails loudly if GitHub is down      |
| `pnpm data:latest`   | Rebuild `data/latest.json` and `data/release.json`        |
| `pnpm data:changelog`| Rebuild `data/changelog.json`                             |
| `pnpm ingles`        | Write the English front page `en/index.html`             |
| `pnpm demo`          | Pack the hero demo from a dump of the real app           |
| `pnpm clientes`      | Rebuild the client strip from the app's provider list    |

`GITHUB_TOKEN` is read from the environment if present, only to raise the API
rate limit. It is never written to a file. The site itself needs no token.

## Two languages

The front page lives at `/` in Spanish and at `/en/` in English, each at its own
URL so search engines and assistants that do not run JavaScript can read both.
`index.html` is the only source: every translatable element carries
`data-en="key"` (attributes: `data-en-attr="name:key|name:key"`), the English
text is in `portada/en.mjs`, and `pnpm ingles` (also run by `dev`, `build` and
`metadatos`) writes `en/index.html`, which is not committed. It stops if a key
is missing and warns about Spanish left in the English page.
`scripts/poner-metadatos.mjs` then gives both pages the same `hreflang` list,
each its own canonical. Nobody is redirected by language: `portada/idioma.js`
only suggests the other version and remembers the choice in `adeorq-lang`, the
same key the guide reads.

## The demo in the hero

`demo/` is not a mock-up of the app: it is the app's own DOM, frozen. The real
app is opened on a demo workshop (Sam and six projects, no real data), every
view is dumped from inside the window by
`scripts/laboratorio/capturas/volcar.mjs`, once in Spanish and once in English,
and `pnpm demo` (`scripts/hacer-demo.mjs`) packs the dump into three generated
files: `demo/app.css` (the app's stylesheets), `demo/datos-es.html` and
`demo/datos-en.html` (the window, plus every view, section and side panel as a
`<template>`). The build stops if a path or an address from the machine that
made the dump shows up in them.

Written by hand: `demo/index.html`, `demo/demo.css` (the frame and the notice)
and `demo/vivo.js`, which gives the frozen window its gestures back: switching
views and themes, closing and maximising terminals, dragging the Canvas,
answering a decision, Ctrl+K. What cannot be imitated without lying (opening a
real terminal, calling an agent) says so in a notice instead of pretending.
`scripts/censo-demo.js` clicks every button in both languages and lists the
ones that do nothing; it should list none. `scripts/rueda-demo.js` turns the
mouse wheel over the demo and checks the front page scrolls as far as it does
with the pointer outside it, and counts the frames lost on the way: the app's
stylesheet stops scroll chaining at its root, which inside a frame left the
page stuck under the pointer, and nothing in the demo pulses on its own because
those repaints were paid by the page's scroll (the numbers are in `demo.css`).

The page follows `?lang=en`, and `?vista=lienzo` opens it on a given view. When
the app changes, dump again and run `pnpm demo`; the steps are in the README
next to `volcar.mjs`.

## Layout

```
web/
  index.html        page                    <- hero agent
  styles/ js/       styles and behaviour    <- hero and sections agents
  sections/         section fragments       <- sections agent
  data/             generated JSON          <- this agent
  scripts/          data generators         <- this agent
  api/              Cloudflare worker       <- this agent
  vite.config.js    build config            <- this agent
```

## Data contract

Everything under `data/` is generated. Do not edit it by hand: the next
`pnpm dev` overwrites it. All of it comes from the public releases API, so it
contains nothing that is not already public on GitHub. The auto update
signature and the `.sig` asset are filtered out on purpose, and a guard in
`scripts/github.mjs` refuses to write any field that looks like a secret.

### `data/release.json`

The short version, for a download button:

```json
{
  "version": "0.7.16",
  "url": "https://github.com/.../Adeorq_0.7.16_x64-setup.exe",
  "pub_date": "2026-07-26T18:57:55Z",
  "size_bytes": 3646258,
  "notes": "..."
}
```

### `data/latest.json`

A superset of the above. It repeats those five keys, adds
`platforms["windows-x86_64"].url` so a reader written against the Tauri
updater shape also finds the installer, and adds the fields a section may want
to print:

| Field              | Example                                  |
| ------------------ | ---------------------------------------- |
| `version` / `tag`  | `"0.7.16"` / `"v0.7.16"`                 |
| `title`            | `"Adeorq 0.7.16"`                        |
| `date`             | `"2026-07-26"` (ready to print)          |
| `publishedAt`      | `"2026-07-26T18:57:55Z"` (ready to sort) |
| `notes`            | full release notes, Markdown             |
| `summary`          | first paragraph of prose                 |
| `windows`          | `{ url, filename, size, sizeLabel, arch, downloadCount }` |
| `releaseUrl`       | the release page                         |
| `allReleasesUrl`   | the releases index                       |

`sizeLabel` is already formatted for a Spanish reader, for example `"3,5 MB"`.

### `data/changelog.json`

```json
{
  "generatedAt": "...", "source": "...", "count": 27, "latest": "0.7.16",
  "entries": [
    {
      "version": "0.7.16", "tag": "v0.7.16",
      "date": "2026-07-26", "publishedAt": "2026-07-26T18:57:55Z",
      "title": null, "name": "Adeorq 0.7.16", "summary": "...",
      "tags": ["nuevo", "arreglo"],
      "items": ["...", "..."], "highlights": ["...", "..."],
      "headings": ["..."], "image": null,
      "notes": "...", "notesFormat": "markdown",
      "url": "https://github.com/.../tag/v0.7.16",
      "download": { "url": "...", "filename": "...", "size": 0, "sizeLabel": "3,5 MB" }
    }
  ]
}
```

Entries are newest first. Notes:

- `title` is the first `##` heading of the release notes, or `null` when the
  release has none (7 of the 27 releases have one today). It does not fall back
  to the release name, which is always "Adeorq x.y.z" and would print the
  version twice next to an entry that already shows it. Titles are never
  invented. `name` carries the release name if you want it anyway.
- `tags` is guessed from the wording of the notes. It is a hint for the design,
  not a promise, and a section can ignore it.
- `items` and `highlights` are the same array under two names, so either
  reader works. Bullet points when the notes have them, sentences otherwise.
- `notes` is Markdown. Render it or use `summary` plus `items` instead.
- `image` is always `null` today: no screenshots are published with the
  releases yet.

## Deployment

Nothing here publishes anything. The build is ready and the deploy is a manual
command that nobody has run.

**Recommendation: Cloudflare Pages.** It serves the static bundle from a global
edge network for free and, in the same project, runs `api/_worker.js` so the
download data can refresh itself between deploys, which GitHub Pages cannot do
without a second service.

The build is host agnostic: `dist/` is plain static files and works on GitHub
Pages too. `_worker.js` is simply ignored there, and the site falls back to the
static `data/latest.json`, which is the path it uses by default anyway.

When the time comes, and only then:

```powershell
cd web
pnpm build
pnpm dlx wrangler pages deploy dist --project-name adeorq-web
```

`wrangler.toml` already declares the project name, the compatibility date and
`dist` as the output directory. No DNS record is touched by any of this: the
domain `adeorq.com` is not bought yet, and pointing it at the project is a
manual step in the Cloudflare dashboard afterwards.

### The optional worker

`api/_worker.js` is copied to `dist/_worker.js` during the build. In
production it answers:

```
GET /api/latest      same shape as data/latest.json, cached one hour
```

Everything else falls through to the static files, with the cache headers set
there as well: a year for the hashed files under `assets/`, five minutes for
`data/`, ten minutes at the edge for HTML. Those headers live in the worker on
purpose, because Cloudflare ignores a `_headers` file when a project runs in
advanced mode.

The worker exists so a release published after the last deploy still shows up
on the site, without every visitor calling the GitHub API themselves. It uses
no credentials, and the site works fine without it: the sections read the
static `data/` files.
