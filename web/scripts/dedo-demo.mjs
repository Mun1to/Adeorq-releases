/* ============================================================================
   Adeorq · web/scripts/dedo-demo.mjs
   EL DEDO SOBRE LA DEMOSTRACIÓN DE LA PORTADA.

   La hermana táctil de `rueda-demo.js`. En el móvil, quien baja la portada
   apoya el dedo donde le cae, y media pantalla es la demostración. Lo que en la
   app se arrastra (la cabecera de una terminal, una sesión de la barra, el
   tablero entero del Lienzo) lleva `touch-action: none` en su hoja, y dentro de
   un <iframe> eso deja al dedo sin página: el 2026-11-19, a 390 px, la portada
   no bajaba en 5 de 60 puntos de la Cabina y en 39 de 60 del Lienzo.

   Qué hace: abre la web CONSTRUIDA a tamaño de teléfono y, con un gesto táctil
   de verdad (tocar, arrastrar 300 px hacia arriba, soltar), prueba una rejilla
   de 10 x 6 puntos sobre la demostración, en la Cabina y en el Lienzo. Rojo si
   en alguno la página baja menos de 150 px. Después toca dentro (eso la suelta,
   para poder arrastrar como en la app), baja la página con el dedo fuera y
   comprueba que vuelve a dejar pasar el dedo.

     node scripts/dedo-demo.mjs http://127.0.0.1:4173/

   Variables: ANCHO (390), ALTO (844), NAVEGADOR y PLAYWRIGHT, como en
   `tirones.mjs`. Tarda unos tres minutos: son 120 gestos.
   ========================================================================= */

import { pathToFileURL } from 'node:url'

const url = process.argv[2]
if (!url) {
  console.error('Falta la dirección de la web construida: node scripts/dedo-demo.mjs http://127.0.0.1:4173/')
  process.exit(2)
}
const ANCHO = Number(process.env.ANCHO || 390)
const ALTO = Number(process.env.ALTO || 844)
const NAVEGADOR = process.env.NAVEGADOR || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'
const PLAYWRIGHT = process.env.PLAYWRIGHT || 'C:/proyectos/Orquio/web/node_modules/playwright-core/index.mjs'
const { chromium } = await import(pathToFileURL(PLAYWRIGHT).href)

const navegador = await chromium.launch({ executablePath: NAVEGADOR, headless: true })
let atrapados = 0
try {
  const contexto = await navegador.newContext({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const pagina = await contexto.newPage()
  const cdp = await contexto.newCDPSession(pagina)
  await pagina.goto(url, { waitUntil: 'load' })
  await pagina.waitForFunction(() => !!document.querySelector('#ventana-demo')?.contentDocument?.querySelector('.app'), null, { timeout: 20000 })
  await pagina.waitForTimeout(2500)
  const demo = pagina.frames().find((f) => f.url().includes('/demo/'))

  const dedo = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let d = 20; d <= 300; d += 20) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - d }] })
      await pagina.waitForTimeout(16)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await pagina.waitForTimeout(700)
  }
  // La demostración con su borde de arriba al 55 % de la pantalla: el dedo tiene sitio para subir.
  const colocar = async () => {
    await pagina.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto'
      const r = document.querySelector('.ventana__caja').getBoundingClientRect()
      scrollTo(0, Math.max(0, r.top + scrollY - innerHeight * 0.55))
    })
    await pagina.waitForTimeout(250)
    return pagina.evaluate(() => {
      const r = document.querySelector('.ventana__caja').getBoundingClientRect()
      return { x: r.left, y: r.top, w: r.width, h: r.height, sy: scrollY }
    })
  }

  for (const vista of ['cabina', 'lienzo']) {
    await demo.evaluate((v) => window.adeDemo.irA(v), vista)
    await pagina.waitForTimeout(500)
    const filas = []
    let malos = 0
    for (let fy = 0; fy < 6; fy++) {
      let fila = ''
      for (let fx = 0; fx < 10; fx++) {
        const c = await colocar()
        await dedo(Math.round(c.x + (c.w * (fx + 0.5)) / 10), Math.round(c.y + (c.h * (fy + 0.5)) / 6))
        const baja = (await pagina.evaluate(() => scrollY)) - c.sy
        if (baja < 150) { malos++; fila += ' ██' } else fila += ' ··'
      }
      filas.push(fila)
    }
    atrapados += malos
    console.log(`${vista}: en ${malos} de 60 puntos la página no baja (██)`)
    console.log(filas.join('\n'))
  }

  // Un toque dentro la suelta; al bajar la página con el dedo fuera, vuelve a dejarlo pasar.
  await demo.evaluate(() => window.adeDemo.irA('lienzo'))
  let c = await colocar()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(c.x + c.w * 0.5), y: Math.round(c.y + c.h * 0.6) }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await pagina.waitForTimeout(400)
  const suelta = !(await demo.evaluate(() => document.documentElement.hasAttribute('data-quieta')))
  await dedo(Math.round(c.x + c.w * 0.5), Math.round(c.y - 60))
  c = await colocar()
  await dedo(Math.round(c.x + c.w * 0.5), Math.round(c.y + c.h * 0.5))
  const baja = Math.round((await pagina.evaluate(() => scrollY)) - c.sy)
  console.log(`un toque dentro la deja ${suelta ? 'suelta' : 'quieta'}; tras bajar la página con el dedo fuera, deslizar sobre el Lienzo baja ${baja} px`)
  if (!suelta || baja < 150) atrapados++
  await contexto.close()
} finally {
  await navegador.close()
}
console.log(atrapados ? 'ROJO' : 'VERDE')
process.exit(atrapados ? 1 : 0)
