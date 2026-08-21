/**
 * El movimiento de la portada: scroll suave, apariciones al entrar en pantalla,
 * seccion activa en la barra, progreso de lectura y las micro-interacciones del
 * puntero.
 *
 * TRES REGLAS que no se negocian, y por las que este fichero esta escrito asi:
 *
 * 1. Solo se anima `transform` y `opacity`. Nada de `top`, `width` ni `margin`,
 *    que obligan al navegador a recalcular la maqueta en cada fotograma.
 * 2. Todo lo que se mueve SIN que nadie lo pida (parallax, apariciones, la
 *    inercia del scroll) se multiplica por `--motion-gain`, el dial que pone el
 *    interruptor del `<head>` segun `prefers-reduced-motion` y `?motion=off`. Lo
 *    que provoca la persona con su propia mano (el brillo del puntero, el tilt
 *    de una ficha) NO se multiplica: el oido interno no protesta por lo que uno
 *    mismo causa, y un boton que no responde al raton no es sobriedad, es un
 *    boton roto.
 * 3. La pagina se lee entera con esto apagado. Aqui no se crea contenido: solo
 *    se mueve lo que ya esta en el HTML. Es lo que permite que los asistentes de
 *    IA, que no ejecutan JavaScript, sigan leyendo las 958 palabras de la
 *    portada. Comprobado con `?motion=off`: mismas palabras, todo visible.
 */

const raiz = document.documentElement
const GANANCIA = parseFloat(getComputedStyle(raiz).getPropertyValue('--motion-gain')) || 0

/* ==========================================================================
   1. SCROLL SUAVE: NO, Y ESTA MEDIDO
   ========================================================================== */
/* Aqui hubo Lenis durante media hora del 2026-08-21, y se quito con los numeros
   delante. En ESTA pagina rompia el scroll de tres maneras distintas:
   
     - Se comia la mitad del recorrido: diez golpes de rueda de 400 px llegaban
       a 1.999 px en vez de a 4.000.
     - Se atascaba: cuatro golpes seguidos y no pasaba de 400 px (392, 398, 399,
       400). Eso es lo que se siente como «no funciona bien el scroll».
     - Con la tecla Fin no llegaba al final: 4.760 de 5.552.
   
   Y encima iba peor de fluidez que el scroll nativo: 5,9 % de fotogramas por
   encima de 20 ms contra 1,4 %, y el peor a 125 ms contra 69 ms.
   
   No se probaron otros parametros a proposito: cambiar el `lerp` es el MISMO
   intento con otro numero. El scroll de Chromium ya es suave, ya respeta la
   configuracion del sistema y no intercepta la rueda, que es lo que se mide
   como interaccion lenta. Las anclas van con `scroll-behavior: smooth`, que es
   nativo y esta en portada.css.
   
   Si algun dia se vuelve a intentar, que sea con esta medida delante:
   `scratchpad/medir-scroll.mjs` compara recorrido, fotogramas lentos y si se
   llega al final. */

/* ==========================================================================
   2. BRILLO E IMAN EN LOS BOTONES
   ========================================================================== */
/* El brillo: las coordenadas se guardan en dos variables de CSS y el degradado
   lo pinta la hoja de estilos. Asi el trabajo por cada movimiento del raton es
   fijar dos numeros, no redibujar nada desde JavaScript.

   El iman: el boton se acerca un poco hacia el puntero. Es movimiento pedido
   por la persona, asi que no lo encoge el dial; pero es CORTO a proposito, que
   un boton que huye del cursor es un chiste, no una interfaz. */
const IMAN = 5 // pixeles, como maximo

for (const boton of document.querySelectorAll('.btn')) {
  const conIman = boton.classList.contains('btn--grande')

  boton.addEventListener('pointermove', (e) => {
    const caja = boton.getBoundingClientRect()
    const x = e.clientX - caja.left
    const y = e.clientY - caja.top
    boton.style.setProperty('--raton-x', `${x}px`)
    boton.style.setProperty('--raton-y', `${y}px`)

    if (!conIman) return
    // -1 .. 1 desde el centro
    const dx = (x / caja.width - 0.5) * 2
    const dy = (y / caja.height - 0.5) * 2
    boton.style.setProperty('--iman-x', `${(dx * IMAN).toFixed(1)}px`)
    boton.style.setProperty('--iman-y', `${(dy * IMAN * 0.6).toFixed(1)}px`)
  })

  boton.addEventListener('pointerleave', () => {
    boton.style.removeProperty('--raton-x')
    boton.style.removeProperty('--raton-y')
    boton.style.removeProperty('--iman-x')
    boton.style.removeProperty('--iman-y')
  })
}

/* ==========================================================================
   3. TILT DE LAS FICHAS
   ========================================================================== */
/* La ficha se inclina hacia donde esta el puntero. Tres grados como mucho: mas
   que eso, en una retícula de seis, marea. Solo con raton: en una pantalla
   tactil no hay puntero que seguir y `pointermove` llega con el dedo encima,
   tapando justo lo que se inclina. */
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const GRADOS = 3
  for (const ficha of document.querySelectorAll('.ficha')) {
    ficha.addEventListener('pointermove', (e) => {
      const c = ficha.getBoundingClientRect()
      const dx = ((e.clientX - c.left) / c.width - 0.5) * 2
      const dy = ((e.clientY - c.top) / c.height - 0.5) * 2
      ficha.style.setProperty('--giro-y', `${(dx * GRADOS).toFixed(2)}deg`)
      ficha.style.setProperty('--giro-x', `${(-dy * GRADOS).toFixed(2)}deg`)
      ficha.style.setProperty('--raton-x', `${e.clientX - c.left}px`)
      ficha.style.setProperty('--raton-y', `${e.clientY - c.top}px`)
    })
    ficha.addEventListener('pointerleave', () => {
      ficha.style.removeProperty('--giro-x')
      ficha.style.removeProperty('--giro-y')
    })
  }
}

/* ==========================================================================
   4. APARECER AL ENTRAR EN PANTALLA
   ========================================================================== */
/* Se anuncian con `data-aparece` en el HTML. El elemento YA esta en el
   documento y con su texto dentro: esto solo le quita el desplazamiento. Si el
   observador no existiera, se verian todos, que es justo lo que tiene que pasar. */
const porAparecer = document.querySelectorAll('[data-aparece]')
if (porAparecer.length) {
  if (GANANCIA === 0 || !('IntersectionObserver' in window)) {
    for (const el of porAparecer) el.dataset.aparece = 'visto'
  } else {
    const vigia = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue
          e.target.dataset.aparece = 'visto'
          vigia.unobserve(e.target)
        }
      },
      // Un poco antes del borde: si aparece justo al ras, se ve el salto.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
    )
    for (const el of porAparecer) vigia.observe(el)
  }
}

/* ==========================================================================
   5. PARALLAX
   ========================================================================== */
/* NO va aqui. El parallax de `[data-parallax]` ya lo mueve `portada.js`, con su
   propio bucle de requestAnimationFrame y su propio dial. Repetirlo seria dos
   bucles peleandose por el mismo `style.transform` del mismo elemento. Para que
   una pieza nueva tenga parallax basta con ponerle `data-parallax` en el HTML.
   Ojo con a QUE se le pone: portada.js escribe el `transform` ENTERO, asi que
   pisa el que el elemento ya tuviera en el CSS. Por eso el resplandor del hero
   no lo lleva: tiene un `translateX(-50%)` que lo centra y una animacion propia. */

/* ==========================================================================
   6. PROGRESO DE LECTURA Y SECCION ACTIVA
   ========================================================================== */
const barraProgreso = document.querySelector('.progreso__linea')
const arriba = document.querySelector('.subir')
const enlaces = [...document.querySelectorAll('.nav__enlaces a[href^="#"]')]
const destinos = enlaces
  .map((a) => ({ a, seccion: document.querySelector(a.getAttribute('href')) }))
  .filter((d) => d.seccion)

/* El progreso se lee en un solo sitio y se pinta con `scaleX`, no con `width`:
   un `width` que cambia en cada fotograma vuelve a calcular la maqueta entera. */
if (barraProgreso) {
  let pedido = false
  const pintar = () => {
    pedido = false
    const alto = document.documentElement.scrollHeight - innerHeight
    const parte = alto > 0 ? Math.min(scrollY / alto, 1) : 0
    barraProgreso.style.transform = `scaleX(${parte.toFixed(4)})`
    arriba?.classList.toggle('subir--visible', scrollY > innerHeight * 0.9)
  }
  addEventListener(
    'scroll',
    () => {
      if (pedido) return
      pedido = true
      requestAnimationFrame(pintar)
    },
    { passive: true }
  )
  addEventListener('resize', pintar, { passive: true })
  requestAnimationFrame(pintar)
}

/* Marca en la barra el enlace de la seccion que se esta leyendo. Es
   `aria-current`, no una clase suelta, para que un lector de pantalla tambien
   lo anuncie. */
if (destinos.length && 'IntersectionObserver' in window) {
  const vigia = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        const d = destinos.find((x) => x.seccion === e.target)
        if (!d || !e.isIntersecting) continue
        for (const otro of destinos) otro.a.removeAttribute('aria-current')
        d.a.setAttribute('aria-current', 'true')
      }
    },
    // La franja de arriba de la pantalla: la seccion activa es la que se esta
    // mirando, no la que asoma por abajo.
    { rootMargin: '-15% 0px -70% 0px' }
  )
  for (const d of destinos) vigia.observe(d.seccion)
}

/* ==========================================================================
   7. VOLVER ARRIBA
   ========================================================================== */
/* Aparece pasada la primera pantalla. Es un `<button>` de verdad, no un div con
   un click: asi lo alcanza el tabulador y lo anuncia un lector de pantalla. */
arriba?.addEventListener('click', () => {
  scrollTo({ top: 0, behavior: 'smooth' })
})
