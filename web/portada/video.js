/* ===========================================================================
   Adeorq · portada/video.js
   «Adeo te la enseña»: el vídeo del recorrido de la demo.

   No baja nada hasta que la sección está a una pantalla de distancia (el
   <video> nace sin `src` y con `preload="none"`: solo su foto), y entonces pone
   el MP4 de su idioma (`data-src`). Corre mudo y en bucle SOLO mientras se ve:
   fuera de pantalla se para, para no gastar un decodificador en pleno scroll.

   Se para con su botón (un vídeo que se mueve solo más de 5 s tiene que poder
   pararse: WCAG 2.2.2) y no arranca solo con la válvula del movimiento
   (`?motion=off`, `data-motion="off"` o sin la clase `motion`): ahí sale la
   foto y el botón dice «Ver el vídeo».
   ========================================================================= */

const video = document.querySelector('[data-video]')
const boton = document.querySelector('[data-video-boton]')
const texto = document.querySelector('[data-video-texto]')

if (video && boton) {
  const en = document.documentElement.lang === 'en'
  const T = en ? { parar: 'Pause the video', ver: 'Play the video' } : { parar: 'Parar el vídeo', ver: 'Ver el vídeo' }
  const conMovimiento = () =>
    document.documentElement.dataset.motion !== 'off' && document.documentElement.classList.contains('motion')

  // `parado` es lo que ha decidido quien mira: si lo paró, no vuelve a correr
  // solo al volver a la sección.
  let parado = !conMovimiento()
  let seVe = false
  const pintarBoton = () => {
    boton.setAttribute('aria-pressed', String(parado))
    if (texto) texto.textContent = parado ? T.ver : T.parar
  }
  const cargar = () => {
    if (video.getAttribute('src') || !video.dataset.src) return
    // Parado (la válvula, o quien lo paró), no se baja hasta que lo pidan.
    video.preload = parado ? 'none' : 'auto'
    video.src = video.dataset.src
  }
  const mover = () => {
    if (seVe && !parado) {
      cargar()
      void video.play().catch(() => {})
    } else if (!video.paused) video.pause()
  }

  boton.addEventListener('click', () => {
    parado = !parado
    pintarBoton()
    mover()
  })
  pintarBoton()

  new IntersectionObserver(
    (es) => {
      if (es.some((e) => e.isIntersecting)) cargar()
    },
    { rootMargin: '100% 0px' },
  ).observe(video)
  new IntersectionObserver(
    (es) => {
      seVe = es.some((e) => e.isIntersecting)
      mover()
    },
    { threshold: 0.35 },
  ).observe(video)
}
