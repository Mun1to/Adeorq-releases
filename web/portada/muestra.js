/**
 * La muestra de «Qué hace»: seis rasgos, cada uno con su captura de la app.
 *
 * El HTML ya trae los seis con su frase y su foto, y así se lee sin esto. Aquí
 * solo se elige: el título de cada rasgo pasa a ser un botón, el rasgo elegido
 * enseña lo suyo y los demás se quedan en su título (el reparto lo hace
 * portada.css con `data-vivo` y `data-activa`). No hay carrusel: cambia cuando
 * la persona lo pide.
 *
 * Y tres cosas más: la captura se abre en grande, su descarga se adelanta al
 * acercar el puntero, y «Tocarlo en la demo» abre esa misma vista en la demo
 * del principio de la página.
 */

const EN = document.documentElement.lang === 'en'
const muestra = document.querySelector('[data-muestra]')

if (muestra) {
  const rasgos = [...muestra.querySelectorAll('.rasgo')]

  const botones = rasgos.map((rasgo) => {
    const titulo = rasgo.querySelector('.rasgo__tit')
    const boton = document.createElement('button')
    boton.type = 'button'
    boton.className = 'rasgo__boton'
    boton.append(...titulo.childNodes)
    titulo.append(boton)
    return boton
  })

  const elegir = (elegido) => {
    for (const [i, rasgo] of rasgos.entries()) {
      rasgo.toggleAttribute('data-activa', rasgo === elegido)
      botones[i].setAttribute('aria-expanded', String(rasgo === elegido))
    }
  }

  for (const rasgo of rasgos) {
    const texto = rasgo.querySelector('.rasgo__texto')
    const foto = rasgo.querySelector('.rasgo__foto')
    const img = foto.querySelector('img')

    // Toda la fila elige, no solo las letras del título; el enlace hace lo suyo.
    texto.addEventListener('click', (e) => {
      if (!e.target.closest('a')) elegir(rasgo)
    })

    // Una captura oculta y perezosa no se pide hasta que se enseña, y son
    // cientos de KB: con el puntero cerca ya se sabe que la van a querer.
    const adelantar = () => { img.loading = 'eager' }
    texto.addEventListener('pointerenter', adelantar, { once: true })
    texto.addEventListener('focusin', adelantar, { once: true })

    const ampliar = document.createElement('button')
    ampliar.type = 'button'
    ampliar.className = 'rasgo__ampliar'
    ampliar.textContent = EN ? 'Enlarge' : 'Ampliar'
    foto.append(ampliar)
    foto.addEventListener('click', () => abrirLupa(img))
  }

  elegir(rasgos[0])
  muestra.setAttribute('data-vivo', '')
}

/* La captura a toda pantalla. Se crea la primera vez que alguien la pide. */
let lupa = null

function abrirLupa(img) {
  if (!lupa) {
    lupa = document.createElement('dialog')
    lupa.className = 'lupa'
    const cerrar = document.createElement('button')
    cerrar.type = 'button'
    cerrar.className = 'lupa__cerrar'
    cerrar.setAttribute('aria-label', EN ? 'Close' : 'Cerrar')
    cerrar.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
    lupa.append(cerrar, new Image())
    lupa.addEventListener('click', () => lupa.close())
    document.body.append(lupa)
  }
  const grande = lupa.querySelector('img')
  grande.src = img.currentSrc || img.src
  grande.alt = img.alt
  lupa.showModal()
}

/* «Tocarlo en la demo»: sube a la ventana del principio y le pide a la demo que
   abra esa vista. La demo vive en un <iframe> del mismo origen y expone
   `adeDemo.irA`; si todavía está llegando (se trae al primer gesto, ver
   valvula.js), se insiste unos segundos. */
function abrirEnLaDemo(vista, intentos = 40) {
  const demo = document.getElementById('ventana-demo')?.contentWindow?.adeDemo
  if (demo) demo.irA(vista)
  else if (intentos > 0) setTimeout(() => abrirEnLaDemo(vista, intentos - 1), 150)
}

/* El ancla del enlace es la sección (#haz) y no la ventana, y el salto fino se
   hace aquí. Medido el 2026-10-13: `.haz` lleva `overflow: hidden`, que la hace
   desplazable por programa, así que un ancla a algo de DENTRO mueve también su
   interior y la ventana quedaba 280 px más abajo, cortada por el borde de la
   pantalla. Se mueve solo la página, hasta dejar la ventana centrada en el
   hueco que queda bajo la barra. Sin `behavior`: manda el `scroll-behavior` de
   portada.css, que ya se apaga con `prefers-reduced-motion`. */
function subirALaVentana() {
  const ventana = document.getElementById('ventana')
  if (!ventana) return false
  const caja = ventana.getBoundingClientRect()
  const barra = document.getElementById('nav')?.offsetHeight ?? 0
  const aire = Math.max(12, (innerHeight - barra - caja.height) / 2)
  scrollTo({ top: caja.top + scrollY - barra - aire })
  document.getElementById('ventana-demo')?.focus({ preventScroll: true })
  return true
}

for (const enlace of document.querySelectorAll('[data-demo-vista]')) {
  enlace.addEventListener('click', (e) => {
    if (subirALaVentana()) e.preventDefault()
    abrirEnLaDemo(enlace.dataset.demoVista)
  })
}
