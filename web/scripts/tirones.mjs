/* ============================================================================
   Adeorq · web/scripts/tirones.mjs
   LOS TIRONES AL BAJAR LA PORTADA DESDE ARRIBA, PASANDO LA DEMOSTRACIÓN.

   Munir, 2026-11-18: «que cuando deslices al principio para abajo de la demo no
   den tirones». Era la cuarta vez que el scroll de la portada iba a tirones
   (21-ago, 12-oct, 9-nov), cada una por una pieza distinta, así que la medida se
   queda aquí y se pone roja sola.

   Qué mide. Abre la web CONSTRUIDA en un navegador sin cabeza, la visita una vez
   (quien vuelve: la gráfica ya tiene compilado lo que pinta la página), la
   vuelve a cargar y baja con la rueda de verdad (a 390 px, con el dedo) desde
   arriba hasta que la demostración sale por arriba. De la traza del navegador
   saca, con la demostración a la vista:

     pases/fot   cuántos pases de dibujo hace la gráfica por fotograma. Cada
                 desenfoque o mezcla que hay que rehacer al moverse la página es
                 uno. NO depende de lo cargada que esté la máquina: es lo que se
                 compara entre versiones, y lo que pone el listón.
     ms gpu/fot  lo que gasta la gráfica en esos pases por fotograma.
     fot/s       los fotogramas que llegaron a la pantalla (va a los hercios de
                 la pantalla principal: 240 en la de Munir).
     >16,7 ms    huecos entre dos fotogramas de más de 16,7 ms, y el peor.

   El 2026-11-19, a 1440 px: 11,3 pases y 2,4 ms por fotograma antes; 3,5 pases
   y 0,6 ms después de quitar tres desenfoques que se rehacían en cada fotograma
   (el cristal de la demo que su propio fondo tapa, el de las nubes del cielo y
   la mezcla del grano; ver demo/demo.css y portada/portada.css).

   EL LISTÓN: más de 6 pases por fotograma con la demostración a la vista es
   rojo (sale con código 1). Si se pone rojo, alguien ha vuelto a poner un
   `backdrop-filter`, un `filter` o un `mix-blend-mode` en algo que se mueve o
   que tiene algo moviéndose debajo: `QUITA=` ayuda a encontrarlo.

   Cómo se lanza, con la web construida y servida (ver README.md, «Scroll jank»):

     node scripts/tirones.mjs http://127.0.0.1:4173/
     ANCHO=390 CPU=4 node scripts/tirones.mjs http://127.0.0.1:4173/

   Variables: ANCHO (1440), CPU (1; 4 frena el procesador cuatro veces), ESPERA
   (300 ms entre la carga y el primer golpe de rueda), VUELTAS (1),
   NAVEGADOR (la ruta de un Chromium; por defecto Brave), PLAYWRIGHT (la ruta
   de `playwright-core/index.mjs`; este repo no lo instala) y QUITA, CSS que se
   añade a la portada para ver cuánto cuesta una pieza, por ejemplo
   QUITA=".haz__cielo{display:none}".
   ========================================================================= */

import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const url = process.argv[2]
if (!url) {
  console.error('Falta la dirección de la web construida: node scripts/tirones.mjs http://127.0.0.1:4173/')
  process.exit(2)
}
const ANCHO = Number(process.env.ANCHO || 1440)
const CPU = Number(process.env.CPU || 1)
const ESPERA = Number(process.env.ESPERA || 300)
const VUELTAS = Number(process.env.VUELTAS || 1)
const QUITA = process.env.QUITA || ''
const LISTON = 6
const MOVIL = ANCHO < 700
const NAVEGADOR = process.env.NAVEGADOR || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'
const PLAYWRIGHT = process.env.PLAYWRIGHT || 'C:/proyectos/Orquio/web/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PLAYWRIGHT).href)

async function bajar(pagina, cdp, distancia) {
  if (MOVIL) {
    // El dedo de verdad: tocar, arrastrar 480 px hacia arriba y soltar, las veces
    // que haga falta. (`Input.synthesizeScrollGesture` aquí no movía la página.)
    const desde = await pagina.evaluate(() => scrollY)
    for (let k = 0; k < 8; k++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 640 }] })
      for (let d = 20; d <= 480; d += 20) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 640 - d }] })
        await pagina.waitForTimeout(16)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await pagina.waitForTimeout(220)
      if ((await pagina.evaluate(() => scrollY)) - desde >= distancia) break
    }
    return
  }
  // Con el puntero en medio de la pantalla: al bajar, queda encima de la demostración.
  await pagina.mouse.move(Math.round(ANCHO / 2), 450)
  for (let d = 0; d < distancia; d += 100) {
    await pagina.mouse.wheel(0, 100)
    await pagina.waitForTimeout(60)
  }
}

async function unaVuelta(n) {
  const traza = join(tmpdir(), `adeorq-tirones-${process.pid}-${n}.json`)
  const navegador = await chromium.launch({ executablePath: NAVEGADOR, headless: true })
  try {
    const contexto = await navegador.newContext(
      MOVIL
        ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' }
        : { viewport: { width: ANCHO, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' }
    )
    const pagina = await contexto.newPage()
    if (QUITA) {
      await pagina.route(/\/assets\/[^/]*\.css/, async (ruta) => {
        const r = await ruta.fetch()
        ruta.fulfill({ response: r, body: `${await r.text()}\n${QUITA}` })
      })
    }
    // Deja en la traza el momento en que la demostración sale de la pantalla.
    await pagina.addInitScript(() => {
      if (window !== top) return
      const mira = () => {
        const v = document.querySelector('#ventana')
        if (v && performance.getEntriesByName('baja-ini').length && v.getBoundingClientRect().bottom < 0) return void performance.mark('demo-fuera')
        requestAnimationFrame(mira)
      }
      requestAnimationFrame(mira)
    })
    const cdp = await contexto.newCDPSession(pagina)

    // La visita de antes.
    await pagina.goto(url, { waitUntil: 'load' })
    await pagina.waitForTimeout(2500)
    await bajar(pagina, cdp, 2200)
    await pagina.waitForTimeout(700)
    await pagina.goto('about:blank')

    // La que se mide.
    if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
    await navegador.startTracing(pagina, { path: traza, categories: ['viz', 'gpu', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing'] })
    await pagina.goto(url, { waitUntil: 'load' })
    await pagina.waitForTimeout(ESPERA)
    const hasta = await pagina.evaluate(() => {
      const r = document.querySelector('#ventana').getBoundingClientRect()
      return Math.round(r.bottom + scrollY + innerHeight * 0.35)
    })
    await pagina.evaluate(() => performance.mark('baja-ini'))
    await bajar(pagina, cdp, hasta)
    await pagina.waitForTimeout(700)
    const llego = await pagina.evaluate(() => { performance.mark('baja-fin'); return Math.round(scrollY) })
    await navegador.stopTracing()
    await contexto.close()

    const sucesos = JSON.parse(readFileSync(traza, 'utf8')).traceEvents
    const marca = (nombre) => sucesos.find((s) => s.name === nombre && s.cat?.includes('blink.user_timing'))?.ts
    const ini = marca('baja-ini')
    const fin = marca('baja-fin')
    const sale = marca('demo-fuera') || fin
    const tramo = (a, z) => {
      let pases = 0
      let gpu = 0
      const pintados = []
      for (const s of sucesos) {
        if (s.ts < a || s.ts > z) continue
        if (s.name === 'DrawFrame') pintados.push(s.ts)
        else if (s.ph === 'X' && s.name === 'DirectRenderer::DrawRenderPass') pases++
        else if (s.ph === 'X' && s.name === 'SkiaOutputSurfaceImplOnGpu::FinishPaintRenderPass') gpu += s.dur / 1000
      }
      pintados.sort((x, y) => x - y)
      const huecos = pintados.slice(1).map((t, i) => (t - pintados[i]) / 1000)
      const fot = pintados.length || 1
      return {
        pases: +(pases / fot).toFixed(1),
        gpu: +(gpu / fot).toFixed(2),
        fps: Math.round(pintados.length / ((z - a) / 1e6)),
        lentos: huecos.filter((h) => h > 16.7).length,
        peor: +Math.max(0, ...huecos).toFixed(1),
      }
    }
    return { llego, hasta, conDemo: tramo(ini, sale), sinDemo: tramo(sale, fin - 700000) }
  } finally {
    await navegador.close()
    rmSync(traza, { force: true })
  }
}

console.log(`Bajando ${url} · ${MOVIL ? 390 : ANCHO} px · CPU ${CPU}x · ${ESPERA} ms tras cargar${QUITA ? ' · quitando: ' + QUITA : ''}`)
let rojo = false
for (let n = 0; n < VUELTAS; n++) {
  const r = await unaVuelta(n)
  const linea = (t) => `${String(t.pases).padStart(5)} pases/fot · ${String(t.gpu).padStart(5)} ms gpu/fot · ${String(t.fps).padStart(3)} fot/s · huecos de más de 16,7 ms: ${t.lentos} · el peor, ${t.peor} ms`
  console.log(`  con la demostración a la vista  ${linea(r.conDemo)}`)
  console.log(`  cuando ya ha salido             ${linea(r.sinDemo)}`)
  if (r.llego < r.hasta - 150) { console.log(`  ROJO: la página bajó ${r.llego} px de ${r.hasta}: algo se ha quedado con la rueda`); rojo = true }
  if (r.conDemo.pases > LISTON) { console.log(`  ROJO: ${r.conDemo.pases} pases por fotograma con la demostración a la vista (el listón es ${LISTON})`); rojo = true }
}
console.log(rojo ? 'ROJO' : 'VERDE')
process.exit(rojo ? 1 : 0)
