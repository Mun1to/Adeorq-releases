/**
 * El movimiento de la portada: parallax, apariciones al entrar en pantalla,
 * seccion activa en la barra y el brillo que sigue al puntero.
 *
 * TRES REGLAS que no se negocian, y por las que este fichero esta escrito asi:
 *
 * 1. Solo se anima `transform` y `opacity`. Nada de `top`, `width` ni `margin`,
 *    que obligan al navegador a recalcular la maqueta en cada fotograma.
 * 2. Todo lo que se mueve SIN que nadie lo pida (parallax, apariciones) se
 *    multiplica por `--motion-gain`, el dial que pone el interruptor del `<head>`
 *    segun `prefers-reduced-motion` y `?motion=off`. Lo que provoca la persona
 *    con su propia mano (el brillo del puntero) NO se multiplica: un boton que
 *    no responde al raton no es sobriedad, es un boton roto.
 * 3. La pagina se lee entera con esto apagado. Aqui no se crea contenido: solo
 *    se mueve lo que ya esta en el HTML. Es lo que permite que los asistentes de
 *    IA, que no ejecutan JavaScript, sigan leyendo las 1.100 palabras de la
 *    portada.
 */

const raiz = document.documentElement
const GANANCIA = parseFloat(getComputedStyle(raiz).getPropertyValue('--motion-gain')) || 0

/* -------------------------------------------------- brillo del puntero ---- */
/* Las coordenadas se guardan en dos variables de CSS y el degradado lo pinta la
   hoja de estilos. Asi el trabajo por movimiento es fijar dos numeros, no
   redibujar nada desde JavaScript. */
for (const boton of document.querySelectorAll('.btn')) {
  boton.addEventListener('pointermove', (e) => {
    const caja = boton.getBoundingClientRect()
    boton.style.setProperty('--raton-x', `${e.clientX - caja.left}px`)
    boton.style.setProperty('--raton-y', `${e.clientY - caja.top}px`)
  })
  boton.addEventListener('pointerleave', () => {
    boton.style.removeProperty('--raton-x')
    boton.style.removeProperty('--raton-y')
  })
}

/* ------------------------------------------------ aparecer al entrar ------ */
/* Se anuncian con `data-aparece` en el HTML. El elemento YA esta en el
   documento y con su texto dentro: esto solo le quita la clase que lo tenia
   desplazado. Si el observador no existiera, se verian todos, que es justo lo
   que tiene que pasar. */
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

/* ------------------------------------------------------------ parallax ---- */
/* NO va aqui. El parallax de `[data-parallax]` ya lo mueve `portada.js`, con su
   propio bucle de requestAnimationFrame y su propio dial. Repetirlo aqui seria
   dos bucles peleandose por el mismo `style.transform` del mismo elemento.
   Para que una pieza nueva tenga parallax basta con ponerle `data-parallax` en
   el HTML: el motor de portada.js la recoge sola.

   Ojo con a QUE se le pone: portada.js escribe el `transform` entero, asi que
   pisa cualquier transform que el elemento ya tuviera en el CSS. Por eso el
   resplandor del hero (`.haz__glow`) NO lleva parallax: tiene un
   `translateX(-50%)` que lo centra y una animacion propia, y las dos se
   perderian. */

/* -------------------------------------------- seccion activa en la barra -- */
/* Marca en la barra el enlace de la seccion que se esta leyendo. Es
   `aria-current`, no una clase suelta, para que un lector de pantalla tambien
   lo anuncie. */
const enlaces = [...document.querySelectorAll('.nav__enlaces a[href^="#"]')]
const destinos = enlaces
  .map((a) => ({ a, seccion: document.querySelector(a.getAttribute('href')) }))
  .filter((d) => d.seccion)

if (destinos.length && 'IntersectionObserver' in window) {
  const vigia = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        const d = destinos.find((x) => x.seccion === e.target)
        if (!d) continue
        if (e.isIntersecting) {
          for (const otro of destinos) otro.a.removeAttribute('aria-current')
          d.a.setAttribute('aria-current', 'true')
        }
      }
    },
    // La franja de arriba de la pantalla: la seccion activa es la que se esta
    // mirando, no la que asoma por abajo.
    { rootMargin: '-15% 0px -70% 0px' }
  )
  for (const d of destinos) vigia.observe(d.seccion)
}
