/* ===========================================================================
   Adeorq · portada/adeo.js
   ADEO EN LA PORTADA: el mismo muñeco de la app, presentando cada parte.

   Munir, 2026-10-14: «pon a Adeo de protagonista en la web, Adeo explica la
   plataforma». De tres formas (uno que te sigue en una esquina, uno en cada
   sección, una sección donde sus caras explican la app) se aplicó la segunda:
   saluda en la primera pantalla y aparece encima del título de cada sección
   con una frase suya y la cara que le toca. No tapa nada, se ve igual en el
   móvil, y como el rótulo de las secciones de dos columnas es pegajoso, se
   queda a la vista mientras se lee esa sección.

   No se redibuja ni se copia: sus posturas, sus guiones y quién decide el
   fotograma se importan de `src/lib/mascota.ts`, que es de donde salen también
   el de la barra de la app y el del móvil. Vite pasa el `.ts` a JavaScript al
   construir; si alguien cambia a Adeo en la app, la web lo recoge en el
   siguiente build sin tocar nada aquí.

   En el HTML cada Adeo es un `<svg data-adeo="ánimo">` vacío al lado de su
   bocadillo, que es texto de la página (lo leen los buscadores y lo traduce
   `portada/en.mjs`). Esto solo pinta, lleva el reloj y reacciona: sigue el
   ratón con el ojo, saluda si le pasas por encima, brinca si lo pulsas, a la
   tercera le sale un corazón, y lo celebra al pulsar una descarga.

   La política de movimiento de la casa: se mueve para todos, y lo que cambia es
   la amplitud. Con el dial por debajo de 1 (el sistema pide menos movimiento)
   no salta, solo cambia de postura en el sitio. Se queda quieto en la postura
   de su ánimo con el dial a cero, con «Parar el movimiento», con la pestaña
   tapada o fuera de la pantalla, y entonces no gasta temporizadores de
   animación.
   ========================================================================= */

/* El dibujo y los guiones (`src/lib/mascota.ts`) llegan en un trozo aparte,
   después del primer pintado (ver `traer`, abajo): no hacen falta para pintar
   el texto del haz, así que no viajan con el JavaScript que va por delante. */
let ALTO, ANCHO, arrancar, avanzar, cuadrosDe, reaccionar, reposoDe

const SVG = 'http://www.w3.org/2000/svg'
const raiz = document.documentElement

/** Cada cuánto se vuelve a mirar si ya se puede animar, cuando no se puede. */
const REVISAR_MS = 1500
/** Cuánto sigue mirando hacia donde se fue el ratón. */
const MIRADA_MS = 2500
/** Tres toques en menos de esto son un mimo. */
const MIMO_MS = 1500
/** Cuánto dura la fiesta de una descarga antes de volver a lo suyo. */
const FIESTA_MS = 6500
/** Con estos ánimos ya te está diciendo algo: el saludo es para cuando no. */
const SIN_SALUDO = ['espera', 'duda', 'lista', 'apurada']

/* El dial se lee del estilo en línea de <html>, donde lo escriben el
   interruptor del <head> y la válvula, y no con getComputedStyle, que obliga
   al navegador a recalcular estilos en cada fotograma de cada Adeo. Con eso, y
   arrancando antes del primer pintado, el LCP de la portada en un móvil lento
   subía 600 ms (mediana de siete, alternando con la portada sin Adeo). */
const ganancia = () => {
  const v = raiz.style.getPropertyValue('--motion-gain')
  return v === '' ? 1 : parseFloat(v) || 0
}
const parado = () => document.hidden || raiz.hasAttribute('data-quieto') || ganancia() === 0

/** Los Adeo que hay en la página, para el ojo que sigue al ratón. */
const todos = new Set()

/** Pone a Adeo a vivir dentro de un `<svg>` vacío. */
function crearAdeo(svg, animo) {
  svg.setAttribute('viewBox', `0 0 ${ANCHO} ${ALTO}`)
  svg.setAttribute('shape-rendering', 'crispEdges')

  let ahora = animo
  let pose = reposoDe(ahora)
  let mirada = ''
  let marcha = arrancar(ahora, Date.now(), Math.random)
  let reloj = 0
  let vuelve = 0
  let visible = true
  let toques = []

  function pintar() {
    // Con el dial por debajo de 1 no hay salto: la misma postura, en el suelo.
    const p = pose.salta && ganancia() < 1 ? { ...pose, salta: false } : pose
    const rects = cuadrosDe(p, mirada).map((q) => {
      const r = document.createElementNS(SVG, 'rect')
      r.setAttribute('x', q.x)
      r.setAttribute('y', q.y)
      // Un pelo más ancho que la celda, para que no se vea la rejilla.
      r.setAttribute('width', '1.02')
      r.setAttribute('height', '1.02')
      r.setAttribute('fill', q.c)
      return r
    })
    svg.replaceChildren(...rects)
  }

  function paso() {
    clearTimeout(reloj)
    if (!visible) return
    if (parado()) {
      pose = reposoDe(ahora)
      pintar()
      reloj = setTimeout(paso, REVISAR_MS)
      return
    }
    const r = avanzar(marcha, Date.now(), Math.random)
    marcha = r.marcha
    pose = marcha.pose
    pintar()
    reloj = setTimeout(paso, r.espera)
  }

  const adeo = {
    svg,
    get animo() {
      return ahora
    },
    ponAnimo(nuevo) {
      ahora = nuevo
      marcha = arrancar(nuevo, Date.now(), Math.random)
      paso()
    },
    reaccion(cual) {
      if (parado()) return
      marcha = reaccionar(marcha, cual)
      paso()
    },
    mirar(m) {
      if (m === mirada) return
      mirada = m
      clearTimeout(vuelve)
      vuelve = setTimeout(() => {
        mirada = ''
        if (visible) pintar()
      }, MIRADA_MS)
      if (visible) pintar()
    },
    despertar: paso,
  }

  svg.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse' && !SIN_SALUDO.includes(ahora)) adeo.reaccion('hola')
  })
  svg.addEventListener('click', () => {
    const t = Date.now()
    toques = [...toques.filter((x) => t - x < MIMO_MS), t]
    if (toques.length >= 3) {
      toques = []
      adeo.reaccion('mimo')
    } else adeo.reaccion('toque')
  })

  // Fuera de la pantalla no se anima: nadie lo ve.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((e) => {
      const antes = visible
      visible = e[e.length - 1].isIntersecting
      if (visible && !antes) paso()
      if (!visible) clearTimeout(reloj)
    }).observe(svg)
  }

  todos.add(adeo)
  pintar()
  paso()
  return adeo
}

/* ── Los de la portada ────────────────────────────────────────────────────── */

/* Se ponen en marcha DESPUÉS del primer pintado, cuando el navegador ya no
   tiene nada mejor que hacer: el texto del haz es lo primero que tiene que
   salir (es el LCP del móvil), y el Adeo de arriba no se ve hasta medio segundo
   después de que entre el titular. */
let montados = []

function montar() {
  montados = [...document.querySelectorAll('svg[data-adeo]')].map((svg) => {
    const animo = svg.dataset.adeo
    // Nace tranquilo y se pone en su ánimo al asomar su sección: así la
    // entrada de ese ánimo (el susto de «espera», la interrogación de «duda») se ve.
    const adeo = crearAdeo(svg, 'quieta')
    return { adeo, animo, dice: svg.parentElement?.querySelector('.adeo-dice') }
  })

  for (const m of montados) {
    if (m.adeo.svg.closest('.haz')) {
      // El de la primera pantalla saluda al llegar, cuando ya ha entrado el
      // titular: Adeo nunca va por delante de él.
      setTimeout(() => {
        m.adeo.reaccion('hola')
        m.adeo.reaccion('hola')
      }, 900)
      continue
    }
    if (!('IntersectionObserver' in window)) {
      m.adeo.ponAnimo(m.animo)
      continue
    }
    new IntersectionObserver(
      (e, vigia) => {
        if (!e[0].isIntersecting) return
        vigia.disconnect()
        m.adeo.ponAnimo(m.animo)
        if (m.animo === 'quieta') m.adeo.reaccion('hola')
      },
      { rootMargin: '0px 0px -15% 0px' }
    ).observe(m.adeo.svg)
  }
}

async function traer() {
  ;({ ALTO, ANCHO, arrancar, avanzar, cuadrosDe, reaccionar, reposoDe } = await import('../../src/lib/mascota.ts'))
  montar()
}

requestAnimationFrame(() =>
  requestAnimationFrame(() => ('requestIdleCallback' in window ? requestIdleCallback(traer, { timeout: 1500 }) : setTimeout(traer, 300)))
)

/* Pulsar una descarga es lo que más le alegra: los que están a la vista lo
   celebran, y el que lleva frase de fiesta (`data-celebra`) la dice. La
   descarga sigue su curso; esto no la para. */
let fiesta = 0
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-descarga-hero], [data-descarga-enlace], .descarga__acciones a')) return
  clearTimeout(fiesta)
  for (const m of montados) {
    m.adeo.ponAnimo('lista')
    const frase = m.dice?.dataset.celebra
    if (frase) {
      if (!m.dice.dataset.antes) m.dice.dataset.antes = m.dice.innerHTML
      m.dice.textContent = frase
    }
  }
  fiesta = setTimeout(() => {
    for (const m of montados) {
      m.adeo.ponAnimo(m.adeo.svg.closest('.haz') ? 'quieta' : m.animo)
      if (m.dice?.dataset.antes) {
        m.dice.innerHTML = m.dice.dataset.antes
        delete m.dice.dataset.antes
      }
    }
  }, FIESTA_MS)
})

/* El ojo sigue al ratón, unas quince veces por segundo como mucho: el ratón
   avisa cientos y el ojo solo tiene tres sitios a donde ir. Un solo oyente
   para todos los Adeo de la página. */
let ultima = 0
addEventListener(
  'pointermove',
  (e) => {
    if (e.pointerType !== 'mouse' || e.timeStamp - ultima < 66) return
    ultima = e.timeStamp
    for (const a of todos) {
      const caja = a.svg.getBoundingClientRect()
      if (!caja.width || caja.bottom < 0 || caja.top > innerHeight) continue
      const dx = e.clientX - (caja.left + caja.width / 2)
      const dy = e.clientY - (caja.top + caja.height / 2)
      // Debajo mira abajo; a los lados, al lado; encima o pegado, de frente.
      const debajo = dy > caja.height * 0.6 && Math.abs(dx) <= caja.width * 2
      a.mirar(debajo ? 'bajo' : dx < -caja.width * 0.6 ? 'izq' : dx > caja.width * 0.6 ? 'der' : '')
    }
  },
  { passive: true }
)

/* «Reanudar el movimiento» no avisa a nadie: la válvula solo cambia un atributo
   de <html>. Se mira ese atributo y, al quitarse, todos vuelven a moverse. Lo
   mismo al volver a la pestaña. */
const despertar = () => {
  if (!parado()) for (const a of todos) a.despertar()
}
new MutationObserver(despertar).observe(raiz, { attributes: true, attributeFilter: ['data-quieto'] })
document.addEventListener('visibilitychange', despertar)
