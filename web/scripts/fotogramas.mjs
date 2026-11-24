/* ============================================================================
   Adeorq · web/scripts/fotogramas.mjs
   LOS TIRONES DE LA WEB, FOTOGRAMA A FOTOGRAMA.

   Munir, 2026-11-22: «intenta bajar los tirones de la web al máximo». Abre la
   web en un Brave sin cabeza con la gráfica de verdad, la mueve como una
   persona (un gesto de rueda que se desliza, o el dedo en el móvil) y mide:

     rAF        los tiempos entre requestAnimationFrame de la página: lo que
                ve todo lo que se mueve desde JavaScript o desde el hilo
                principal. EL LISTÓN: p95 de 16,7 ms o menos y ninguno de más
                de 50 ms (a 1x).
     pantalla   los fotogramas que llegan a la pantalla (DrawFrame) contando
                solo los huecos en que el navegador tiró alguno (DroppedFrame):
                un parón del desplazamiento aunque el hilo principal esté libre.
     hilo       ms por segundo de trabajo del hilo principal
                (Performance.getMetrics) y cuántos recálculos de estilo y de
                maqueta hubo.
     LoAF/CLS   fotogramas largos (long-animation-frame) y saltos de maqueta.

   Dos formas de mirar, porque no se parecen:
     · caliente (por defecto): el mismo navegador ya ha bajado la página una
       vez, como quien vuelve. Aquí se comparan versiones (A/B alternados).
     · FRIO=1: un navegador nuevo por vuelta, como quien llega por primera vez:
       la gráfica compila sus programas al pintar cada cosa nueva.

   Uso, con la web construida y servida (README.md, «Scroll jank»):
     node scripts/fotogramas.mjs http://127.0.0.1:4173/ [perfil] [cpu] [accion]
       perfil  1920 (1920x1080) | 1536 (1536x864 al 125 %) | 390 (móvil con el dedo)
       cpu     1 | 4 (el procesador frenado cuatro veces)
       accion  bajar | enseguida (baja a los 300 ms de cargar) | quieto (5 s)
               | ancla (los enlaces de la barra) | menu (abre y cierra el del móvil)
   Variables:
     VARIANTES  JSON con las variantes a comparar, alternadas en el mismo navegador:
                [{"n":"base"},{"n":"sin-cinta","css":".cinta__pista{animation:none}"}]
                css (se añade a las hojas; cssEn = regex de las hojas que lo llevan),
                bloquea (regex de peticiones que se contestan vacías),
                init (JavaScript que corre antes que la página), url (otra web).
     REPES      vueltas de cada variante (3); se da la mediana.
     TRAZA=1    traza completa: en qué se va el hilo principal, la gráfica
                (rasterizar, componer, programas nuevos) y dónde fueron los parones.
     GUARDAR    carpeta donde se queda una copia de la traza de cada vuelta
                medida (<variante>-<hora>.json), para leerla después con calma.
     NAVEGADOR, PLAYWRIGHT  la ruta de Brave y de playwright-core/index.mjs (este
                repo no lo instala; por defecto, el de C:\proyectos\Orquio).
   Sale con código 1 si la variante primera queda en rojo con el listón.
   ========================================================================= */

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [urlBase, perfilArg = '1920', cpuArg = '1', accion = 'bajar'] = process.argv.slice(2)
if (!urlBase) {
  console.error('Falta la dirección: node scripts/fotogramas.mjs http://127.0.0.1:4173/ [1920|1536|390] [1|4] [bajar|enseguida|quieto|ancla|menu]')
  process.exit(2)
}
const CPU = Number(cpuArg)
const REPES = Number(process.env.REPES || 3)
const FRIO = process.env.FRIO === '1'
const TRAZA = process.env.TRAZA === '1'
const GUARDAR = process.env.GUARDAR || ''
if (GUARDAR) mkdirSync(GUARDAR, { recursive: true })
const TRAMO = Number(process.env.TRAMO || 800)
const VARIANTES = process.env.VARIANTES ? JSON.parse(process.env.VARIANTES) : [{ n: 'base' }]
const NAVEGADOR = process.env.NAVEGADOR || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'
const PLAYWRIGHT = process.env.PLAYWRIGHT || 'C:/proyectos/Orquio/web/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PLAYWRIGHT).href)

const PERFILES = {
  1920: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  1536: { viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 },
  390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
}
const perfil = PERFILES[perfilArg]
if (!perfil) throw new Error(`perfil desconocido: ${perfilArg}`)
const MOVIL = !!perfil.isMobile
const LISTON = { p95: 16.7, max: 50 }
const r1 = (x) => Math.round(x * 10) / 10
const pct = (arr, p) => {
  if (!arr.length) return 0
  const s = [...arr].sort((x, y) => x - y)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
const mediana = (arr) => pct(arr, 50)

// Una página sencilla para que la gráfica arranque con lo de siempre (texto, cajas, una sombra).
const CALENTAR = `data:text/html,${encodeURIComponent(`<!doctype html><body style="background:#111;color:#eee;font:16px system-ui">
<h1>Hola</h1><p>${'Texto de prueba. '.repeat(80)}</p><div style="width:300px;height:120px;border-radius:12px;background:linear-gradient(#335,#113);box-shadow:0 4px 20px #0008"></div>
<button style="border-radius:8px;padding:8px 14px">Botón</button><svg width="40" height="40"><circle cx="20" cy="20" r="18" fill="#58f"/></svg></body>`)}`

/* ---------- lo que corre dentro de la página, en cada marco ---------- */
function sonda() {
  const top = window === window.top
  const S = (window.__sonda = { top, raf: [], loaf: [], cls: [], scroll: [], midiendo: false })
  const nombre = (n) => {
    if (!n || n.nodeType !== 1) return n?.nodeName || '?'
    let s = n.tagName.toLowerCase()
    if (n.id) s += '#' + n.id
    if (n.classList?.length) s += '.' + [...n.classList].slice(0, 2).join('.')
    return s
  }
  const mira = (type, fn) => {
    try {
      new PerformanceObserver((l) => { if (S.midiendo) for (const e of l.getEntries()) fn(e) }).observe({ type, buffered: false })
    } catch { /* este navegador no lo tiene */ }
  }
  mira('long-animation-frame', (e) => S.loaf.push({
    t: e.startTime, d: e.duration, b: e.blockingDuration, r: e.renderStart, e: e.styleAndLayoutStart,
    s: e.scripts.map((x) => ({ u: x.sourceURL, f: x.sourceFunctionName, i: x.invoker, d: x.duration, fl: x.forcedStyleAndLayoutDuration })),
  }))
  mira('layout-shift', (e) => S.cls.push({ v: e.value, src: (e.sources || []).map((x) => nombre(x.node)) }))
  if (top) {
    const bucle = (t) => { if (S.midiendo) S.raf.push(t); requestAnimationFrame(bucle) }
    requestAnimationFrame(bucle)
    addEventListener('scroll', () => { if (S.midiendo) S.scroll.push([performance.now(), scrollY]) }, { passive: true, capture: true })
  }
}

/* ---------- mover la página como una persona ---------- */
// Las horas de cada gesto, en el reloj de la página pero tomadas desde Node
// (`Date.now()` menos `performance.timeOrigin`), que no espera al hilo principal.
let origen = 0
let gestos = []
const ahora = () => Date.now() - origen
async function rueda(pagina, cdp, hasta) {
  // El gesto de rueda que se desliza (en Brave sin cabeza `mouse.wheel` salta los
  // 100 px de golpe): 1600 px/s en tramos de 800 px con un respiro entre ellos.
  const x = Math.round(perfil.viewport.width / 2)
  const y0 = Math.round(perfil.viewport.height / 2)
  let y = await pagina.evaluate(() => scrollY)
  let quieto = 0
  while (y < hasta - 5) {
    const ini = ahora()
    // El último tramo, solo lo que queda: un gesto de 800 px que sigue empujando
    // contra el pie con la página ya abajo tira fotogramas sin que nada se mueva,
    // y salía como un parón de 135 ms en el final de la página (a 1536, y=11215).
    const tramo = Math.max(50, Math.min(TRAMO, hasta - y))
    await cdp.send('Input.synthesizeScrollGesture', { x, y: y0, yDistance: -tramo, speed: 1600, gestureSourceType: 'mouse', preventFling: true })
    gestos.push([ini, ahora()])
    await pagina.waitForTimeout(120)
    const ny = await pagina.evaluate(() => scrollY)
    quieto = ny <= y + 1 ? quieto + 1 : 0
    if (quieto > 2) break
    y = ny
  }
}
async function dedo(pagina, cdp, hasta) {
  // El dedo de verdad: tocar, arrastrar 540 px hacia arriba y soltar.
  const x = 195
  let quieto = 0
  let y = await pagina.evaluate(() => scrollY)
  for (let k = 0; k < 200 && y < hasta - 5; k++) {
    const ini = ahora()
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: 700 }] })
    for (let d = 30; d <= 540; d += 30) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 700 - d }] })
      await pagina.waitForTimeout(16)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await pagina.waitForTimeout(300)
    gestos.push([ini, ahora()]) // con la inercia de después de soltar
    const ny = await pagina.evaluate(() => scrollY)
    quieto = ny <= y + 1 ? quieto + 1 : 0
    if (quieto > 3) break
    y = ny
  }
}
async function mover(pagina, cdp, hasta, errores) {
  if (accion === 'bajar' || accion === 'enseguida') {
    if (MOVIL) await dedo(pagina, cdp, hasta)
    else await rueda(pagina, cdp, hasta)
    await pagina.waitForTimeout(600)
  } else if (accion === 'quieto') {
    await pagina.waitForTimeout(5000)
  } else if (accion === 'ancla') {
    for (const href of ['#descargar', '#que-es', '#faq', '#top']) {
      const a = (await pagina.$(`.nav a[href="${href}"]`)) || (await pagina.$(`a[href="${href}"]`))
      if (!a) continue
      await a.click({ timeout: 3000 }).catch((e) => errores.push(`clic ${href}: ${e.message.slice(0, 60)}`))
      await pagina.waitForTimeout(1800)
    }
  } else if (accion === 'menu') {
    for (let n = 0; n < 3; n++) {
      await pagina.click('[data-menu-abrir]', { timeout: 3000 }).catch((e) => errores.push(`clic menú: ${e.message.slice(0, 80)}`))
      await pagina.waitForTimeout(900)
      await pagina.keyboard.press('Escape')
      await pagina.waitForTimeout(900)
    }
  }
}

/* ---------- la traza ---------- */
const CUBO = {
  script: /^(FunctionCall|EvaluateScript|v8\.|V8\.|TimerFire|FireAnimationFrame|EventDispatch|FireIdleCallback|RunMicrotasks|ParseScript|Compile)/,
  gc: /GC|Garbage/i,
  estilo: /^(UpdateLayoutTree|RecalculateStyles|ParseAuthorStyleSheet)/,
  maqueta: /^(Layout|IntersectionObserverController::computeIntersections|HitTest|UpdateLayerTree)$/,
  pintar: /^(Paint|PrePaint|PaintImage|Layerize|Commit|UpdateLayer|CompositeLayers|PaintSetup)$/,
  esperaGrafica: /^(CommandBufferProxyImpl::WaitFor|ImplementationBase::WaitForCmd|CommandBufferHelper::Finish)/,
}
const cubo = (n) => Object.entries(CUBO).find(([, re]) => re.test(n))?.[0] || 'otro'
function tiempoPropio(eventos, a, z) {
  eventos.sort((p, q) => p.ts - q.ts || q.dur - p.dur)
  const por = {}
  const pila = []
  const nodos = []
  const recorte = (s, e) => Math.max(0, Math.min(e, z) - Math.max(s, a))
  for (const ev of eventos) {
    const fin = ev.ts + (ev.dur || 0)
    while (pila.length && pila[pila.length - 1].fin <= ev.ts) pila.pop()
    const nodo = { ev, fin, hijos: [] }
    if (pila.length) pila[pila.length - 1].hijos.push(nodo)
    pila.push(nodo)
    nodos.push(nodo)
  }
  for (const n of nodos) {
    let propio = recorte(n.ev.ts, n.fin)
    for (const h of n.hijos) propio -= recorte(h.ev.ts, h.fin)
    if (propio > 0) por[n.ev.name] = (por[n.ev.name] || 0) + propio
  }
  return por
}
function leerTraza(sucesos, scroll, off, secciones, gestos) {
  const marca = (n) => sucesos.find((s) => s.name === n && (s.cat || '').includes('blink.user_timing'))
  const mIni = marca('medir-ini')
  const mFin = marca('medir-fin')
  if (!mIni || !mFin) return { error: 'sin marcas en la traza' }
  const a = mIni.ts
  const z = mFin.ts
  const pid = mIni.pid
  // fotogramas: DrawFrame / DroppedFrame del compositor de la página
  const dib = []
  const caidos = []
  for (const s of sucesos) {
    if (s.pid !== pid || s.ts < a || s.ts > z) continue
    if (s.name === 'DrawFrame') dib.push(s.ts)
    else if (s.name === 'DroppedFrame') caidos.push(s.ts)
  }
  dib.sort((x, y) => x - y)
  caidos.sort((x, y) => x - y)
  const vsync = pct(dib.slice(1).map((t, i) => t - dib[i]).filter((d) => d > 1000), 25) || 16667
  const yEn = (ts) => {
    let y = 0
    for (const [t, sy] of scroll) { if (t * 1000 + off > ts) break; y = sy }
    return y
  }
  const intervalos = []
  const parones = []
  // Entre dos gestos de rueda el medidor espera 120 ms, y donde no hay nada
  // animado en pantalla no hace falta pintar nada: ese hueco salía como «parón de
  // ~140 ms en #movil» (2026-11-22; con tramos de 800 px caía en y=7200 y con
  // 1100 en 7700). Así que un hueco cuenta solo si al menos la mitad cae DENTRO de
  // un gesto, con las horas que apunta el medidor desde fuera de la página. No
  // vale mirar los eventos `scroll` de la página: los despacha el hilo principal
  // y faltan justo cuando se atasca, y así se escondía un atasco de 200 ms (lo
  // cazó la revisión aparte). Los que se descartan se cuentan en `entreGestos`.
  const enGesto = gestos.map(([i, f]) => [i * 1000 + off, f * 1000 + off])
  const entreGestos = []
  let k = 0
  for (let i = 1; i < dib.length; i++) {
    const p = dib[i - 1]
    const q = dib[i]
    while (k < caidos.length && caidos[k] <= p) k++
    let n = 0
    for (let m = k; m < caidos.length && caidos[m] < q; m++) n++
    const d = (q - p) / 1000
    const dentro = enGesto.reduce((s, [gi, gf]) => s + Math.max(0, Math.min(q, gf) - Math.max(p, gi)), 0)
    if (n > 0 && enGesto.length && dentro < (q - p) / 2) { entreGestos.push(r1(d)); continue }
    if (n > 0) {
      intervalos.push(d)
      if (d > 50) {
        const y = yEn(p)
        parones.push({ en: Math.round((p - a) / 1000), ms: r1(d), y, secciones: secciones.filter((s) => s.b > y && s.t < y + perfil.viewport.height).map((s) => s.id) })
      }
    } else if (q - p <= vsync * 1.6) intervalos.push(d)
  }
  const out = {
    pantalla: { vsync: r1(vsync / 1000), fotogramas: dib.length, caidos: caidos.length, entreGestos: entreGestos.length, entreGestosMax: Math.max(0, ...entreGestos), p95: r1(pct(intervalos, 95)), max: r1(Math.max(0, ...intervalos)), mas50: intervalos.filter((h) => h > 50).length },
    parones: parones.sort((x, y) => y.ms - x.ms).slice(0, 8),
  }
  if (!TRAZA) return out
  const nombres = {}
  for (const s of sucesos) if (s.ph === 'M' && s.name === 'thread_name') nombres[`${s.pid}:${s.tid}`] = s.args.name
  const hilos = {}
  for (const s of sucesos) {
    if (s.ph !== 'X' || s.ts + (s.dur || 0) < a || s.ts > z) continue
    ;(hilos[`${s.pid}:${s.tid}`] ||= []).push(s)
  }
  const main = Object.keys(hilos).find((kk) => kk.startsWith(pid + ':') && nombres[kk] === 'CrRendererMain')
  const propio = main ? tiempoPropio(hilos[main], a, z) : {}
  const cubos = {}
  for (const [n, us] of Object.entries(propio)) {
    if (/^(ThreadControllerImpl::RunTask|RunTask|SequenceManager|ThreadPool|MessageLoop|ScheduledAction|TaskQueue)/.test(n)) continue
    const c = cubo(n)
    cubos[c] = (cubos[c] || 0) + us / 1000
  }
  let rasterizar = 0
  let componer = 0
  let nuevos = 0
  for (const s of sucesos) {
    if (s.ts < a || s.ts > z) continue
    if (s.ph === 'X' && s.name === 'RasterDecoderImpl::DoEndRasterCHROMIUM') rasterizar += s.dur / 1000
    else if (s.ph === 'X' && s.name === 'SkiaOutputSurfaceImplOnGpu::FinishPaintRenderPass') componer += s.dur / 1000
    else if (s.name === 'GpuPersistentCache::StoreImpl') nuevos++
  }
  out.hilo = Object.fromEntries(Object.entries(cubos).sort((p, q) => q[1] - p[1]).map(([kk, v]) => [kk, Math.round(v)]))
  out.hiloPorNombre = Object.entries(propio).sort((p, q) => q[1] - p[1]).slice(0, 12).map(([n, us]) => [n, Math.round(us / 1000)])
  out.grafica = { rasterizar: Math.round(rasterizar), componer: Math.round(componer), programasNuevos: nuevos }
  return out
}

/* ---------- una pasada ---------- */
const delMarco = () => [window, ...[...document.querySelectorAll('iframe')].map((f) => { try { return f.contentWindow } catch { return null } })]
async function pasada(navegador, v, { medir = true } = {}) {
  const traza = join(tmpdir(), `adeorq-fotogramas-${process.pid}-${Date.now()}.json`)
  const contexto = await navegador.newContext({ ...perfil, colorScheme: 'dark', locale: 'es-ES' })
  try {
    const pagina = await contexto.newPage()
    if (v.css) {
      const en = new RegExp(v.cssEn || '.')
      await pagina.route(/\.css(\?|$)/, async (ruta) => {
        const r = await ruta.fetch()
        const texto = await r.text()
        ruta.fulfill({ response: r, body: en.test(ruta.request().url()) ? `${texto}\n${v.css}` : texto })
      })
    }
    if (v.bloquea) {
      await pagina.route(new RegExp(v.bloquea), (ruta) =>
        ruta.fulfill({ status: 200, contentType: /\.m?js(\?|$)/.test(ruta.request().url()) ? 'text/javascript' : 'text/html', body: '' }))
    }
    // Con nombre: sin él, sus oyentes salen como «?» entre los scripts de un fotograma largo.
    await pagina.addInitScript({ content: `(${sonda})()\n//# sourceURL=fotogramas-sonda.js` })
    if (v.init) await pagina.addInitScript(v.init)
    const errores = []
    pagina.on('pageerror', (e) => errores.push(String(e.message).slice(0, 160)))
    const cdp = await contexto.newCDPSession(pagina)
    await cdp.send('Performance.enable')
    if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
    if (medir) {
      const cats = ['disabled-by-default-devtools.timeline.frame', 'blink.user_timing']
      if (TRAZA) cats.push('devtools.timeline', 'disabled-by-default-devtools.timeline', 'viz', 'gpu')
      await navegador.startTracing(pagina, { path: traza, categories: cats })
    }
    await pagina.goto(v.url || urlBase, { waitUntil: 'load' })
    await pagina.waitForTimeout(accion === 'enseguida' ? 300 : 2500)
    const info = await pagina.evaluate(() => {
      const raiz = document.documentElement
      const secciones = [...document.querySelectorAll('main > section, section[id], footer')]
        .map((s) => { const r = s.getBoundingClientRect(); return { id: s.id || s.className.split(' ')[0] || s.tagName, t: Math.round(r.top + scrollY), b: Math.round(r.bottom + scrollY) } })
      return { alto: raiz.scrollHeight, ligero: raiz.hasAttribute('data-ligero'), secciones }
    })
    const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
    const t0 = await pagina.evaluate((dm) => {
      for (const w of eval(dm)()) if (w?.__sonda) w.__sonda.midiendo = true
      performance.mark('medir-ini')
      return performance.now()
    }, `(${delMarco})`)
    gestos = []
    origen = await pagina.evaluate(() => performance.timeOrigin)
    await mover(pagina, cdp, info.alto - perfil.viewport.height, errores)
    const fin = await pagina.evaluate((dm) => {
      performance.mark('medir-fin')
      const out = []
      for (const w of eval(dm)()) {
        if (!w?.__sonda) continue
        w.__sonda.midiendo = false
        out.push({ marco: w === window ? 'portada' : w.location.pathname, ...w.__sonda })
      }
      return { y: Math.round(scrollY), ahora: performance.now(), marcos: out }
    }, `(${delMarco})`)
    const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
    if (!medir) return null
    await navegador.stopTracing()
    const top = fin.marcos.find((m) => m.marco === 'portada')
    const sucesos = JSON.parse(readFileSync(traza, 'utf8')).traceEvents
    const mIni = sucesos.find((s) => s.name === 'medir-ini' && (s.cat || '').includes('blink.user_timing'))
    const tr = leerTraza(sucesos, top.scroll, mIni ? mIni.ts - t0 * 1000 : 0, info.secciones, gestos)
    const raf = top.raf.slice(1).map((t, i) => t - top.raf[i])
    const loaf = fin.marcos.flatMap((m) => m.loaf)
    const porScript = {}
    for (const l of loaf) for (const s of l.s) {
      const kk = `${(s.u || '').replace(/^https?:\/\/[^/]+/, '').replace(/\?.*/, '') || '(sin url)'} ${s.f || ''} [${s.i}]`.trim()
      porScript[kk] = (porScript[kk] || 0) + s.d
    }
    const cls = fin.marcos.flatMap((m) => m.cls)
    const seg = (fin.ahora - t0) / 1000
    // Los fotogramas largos de la portada, con dónde caen y en qué se van: las
    // tareas de antes de pintar, los requestAnimationFrame y, desde
    // styleAndLayoutStart hasta el final, estilo, maqueta y pintar.
    const yA = (t) => { let y = 0; for (const [ts, sy] of top.scroll) { if (ts > t) break; y = sy } return Math.round(y) }
    const largos = top.loaf.filter((l) => l.d > 50).map((l) => {
      const fin_ = l.t + l.d
      const r = l.r > 0 ? l.r : fin_
      const e = l.e > 0 ? l.e : fin_
      return {
        ms: r1(l.d), y: yA(l.t), tareas: r1(r - l.t), raf: r1(e - r), pintar: r1(fin_ - e),
        scripts: l.s.filter((s) => s.d >= 5).map((s) => `${(s.u || '').replace(/^https?:\/\/[^/]+/, '') || '?'} ${s.f || ''} [${s.i}] ${r1(s.d)}${s.fl ? ` (forzado ${r1(s.fl)})` : ''}`),
      }
    })
    return {
      variante: v.n, y: fin.y, hasta: info.alto - perfil.viewport.height, ligero: info.ligero,
      raf: { p95: r1(pct(raf, 95)), max: r1(Math.max(0, ...raf)), mas16: raf.filter((x) => x > 16.7).length, mas50: raf.filter((x) => x > 50).length, n: raf.length },
      hilo: { msPorSeg: Math.round(((m1.TaskDuration - m0.TaskDuration) * 1000) / seg), estilo: m1.RecalcStyleCount - m0.RecalcStyleCount, maqueta: m1.LayoutCount - m0.LayoutCount },
      loaf: { n: loaf.length, max: r1(Math.max(0, ...loaf.map((l) => l.d))), scripts: Object.entries(porScript).sort((p, q) => q[1] - p[1]).slice(0, 5).map(([kk, x]) => [kk, r1(x)]) },
      largos,
      cls: Math.round(cls.reduce((s, c) => s + c.v, 0) * 1000) / 1000,
      ...tr,
      errores,
    }
  } finally {
    await contexto.close()
    if (GUARDAR && medir && existsSync(traza)) copyFileSync(traza, join(GUARDAR, `${v.n}-${Date.now()}.json`))
    rmSync(traza, { force: true })
  }
}

async function abrir() {
  const navegador = await chromium.launch({ executablePath: NAVEGADOR, headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] })
  const c = await navegador.newContext({ ...perfil, colorScheme: 'dark' })
  const p = await c.newPage()
  await p.goto(CALENTAR)
  await p.waitForTimeout(800)
  const gpu = await p.evaluate(() => {
    try {
      const gl = document.createElement('canvas').getContext('webgl')
      const r = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      return r
    } catch { return '?' }
  })
  await c.close()
  if (!/NVIDIA|AMD|Intel|Radeon|Apple/i.test(gpu)) console.log(`OJO: la gráfica es «${gpu}», no una de verdad: la portada irá en modo ligero`)
  return navegador
}

/* ---------- las vueltas ---------- */
const porVariante = Object.fromEntries(VARIANTES.map((v) => [v.n, []]))
console.log(`${urlBase} · ${perfilArg} · CPU ${CPU}x · ${accion} · ${FRIO ? 'en frío (navegador nuevo cada vez)' : 'en caliente'} · ${REPES} vueltas de ${VARIANTES.map((v) => v.n).join(', ')}`)
if (FRIO) {
  for (let r = 0; r < REPES; r++) {
    for (const v of r % 2 ? [...VARIANTES].reverse() : VARIANTES) {
      const nav = await abrir()
      try { porVariante[v.n].push(await pasada(nav, v)) } finally { await nav.close() }
    }
  }
} else {
  const nav = await abrir()
  try {
    // La visita de antes, sin medir: la gráfica ya tiene compilado lo que pinta la página.
    await pasada(nav, VARIANTES[0], { medir: false })
    for (let r = 0; r < REPES; r++) {
      for (const v of r % 2 ? [...VARIANTES].reverse() : VARIANTES) porVariante[v.n].push(await pasada(nav, v))
    }
  } finally { await nav.close() }
}

const resumen = {}
for (const [n, vs] of Object.entries(porVariante)) {
  const m = (f) => r1(mediana(vs.map(f)))
  resumen[n] = {
    rafP95: m((x) => x.raf.p95), rafMax: m((x) => x.raf.max), raf50: m((x) => x.raf.mas50), raf16: m((x) => x.raf.mas16),
    pantP95: m((x) => x.pantalla?.p95 ?? 0), pantMax: m((x) => x.pantalla?.max ?? 0), pant50: m((x) => x.pantalla?.mas50 ?? 0),
    hilo: m((x) => x.hilo.msPorSeg), estilo: m((x) => x.hilo.estilo), loafMax: m((x) => x.loaf.max), cls: mediana(vs.map((x) => x.cls)),
    llego: vs.every((x) => x.y >= x.hasta - 150 || !['bajar', 'enseguida'].includes(accion)),
    ligero: vs.some((x) => x.ligero), errores: [...new Set(vs.flatMap((x) => x.errores))],
  }
  const s = resumen[n]
  console.log(`${n.padEnd(16)} rAF p95 ${String(s.rafP95).padStart(5)} max ${String(s.rafMax).padStart(6)} >16 ${String(s.raf16).padStart(4)} >50 ${String(s.raf50).padStart(3)} | pantalla p95 ${String(s.pantP95).padStart(5)} max ${String(s.pantMax).padStart(6)} >50 ${String(s.pant50).padStart(3)} | hilo ${String(s.hilo).padStart(4)} ms/s, ${s.estilo} estilos | LoAF max ${s.loafMax} | CLS ${s.cls}${s.llego ? '' : ' | NO LLEGÓ ABAJO'}${s.ligero ? ' | LIGERO' : ''}${s.errores.length ? ' | errores: ' + s.errores.join(' / ') : ''}`)
  console.log(`${''.padEnd(16)} vueltas: rAF p95 ${vs.map((x) => x.raf.p95).join(' ')} · max ${vs.map((x) => x.raf.max).join(' ')} · pantalla max ${vs.map((x) => x.pantalla?.max).join(' ')}`)
  if (TRAZA) for (const x of vs) console.log(`${''.padEnd(16)} hilo ${JSON.stringify(x.hilo_ ?? x.hilo)} ${JSON.stringify(x.grafica)} ${JSON.stringify(x.hiloPorNombre?.slice(0, 6))}`)
  const parones = vs.flatMap((x) => x.parones || []).sort((p, q) => q.ms - p.ms).slice(0, 4)
  for (const p of parones) console.log(`${''.padEnd(16)} parón de ${p.ms} ms en y=${p.y} [${p.secciones.join(',')}]`)
  const eg = vs.map((x) => x.pantalla?.entreGestos ?? 0)
  if (eg.some(Boolean)) console.log(`${''.padEnd(16)} huecos entre gestos, sin contar: ${eg.join(' ')} por vuelta (el mayor de ${Math.max(...vs.map((x) => x.pantalla?.entreGestosMax ?? 0))} ms)`)
  const largos = vs.flatMap((x) => x.largos || []).sort((p, q) => q.ms - p.ms).slice(0, Number(process.env.LARGOS || 4))
  for (const l of largos) console.log(`${''.padEnd(16)} fotograma de ${l.ms} ms en y=${l.y}: tareas ${l.tareas}, rAF y eventos ${l.raf}, estilo/maqueta/pintar ${l.pintar}${l.scripts.length ? ' · ' + l.scripts.join(' · ') : ''}`)
}
if (process.env.SALIDA) writeFileSync(process.env.SALIDA, JSON.stringify({ resumen, vueltas: porVariante }, null, 1))
const primera = resumen[VARIANTES[0].n]
const rojo = CPU === 1 && (primera.rafP95 > LISTON.p95 || primera.rafMax > LISTON.max)
console.log(rojo ? `ROJO: con ${VARIANTES[0].n}, rAF p95 ${primera.rafP95} (listón ${LISTON.p95}) y máximo ${primera.rafMax} (listón ${LISTON.max})` : CPU === 1 ? 'VERDE' : 'con la CPU frenada no hay listón: comparar contra la versión de antes')
process.exit(rojo ? 1 : 0)
