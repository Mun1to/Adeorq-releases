/* ============================================================================
   Adeorq · web/portada/ligero.js
   ¿DIBUJA ESTE NAVEGADOR SIN LA TARJETA GRÁFICA?

   El 9-nov-2026, en el ordenador de clase de Munir, con la aceleración por
   hardware apagada, adeorq.com iba «súper lag» y cloudflare.com fluida. Les
   pasa también a ordenadores viejos o de empresa. Sin gráfica, lo que en un
   ordenador normal hace la tarjeta lo hace el procesador, y un desenfoque se
   vuelve a calcular en CADA fotograma, también al bajar.

   Medido en la portada con la CPU 6x y la aceleración apagada, quitando cosas
   una a una: lo que pesaba eran las dos nubes del cielo (`filter: blur(90px)`),
   el grano del hero (`mix-blend-mode: overlay`, que obliga a mezclar con lo de
   detrás en cada fotograma) y el cristal de la demo (`backdrop-filter`). Las
   tres se cambian solo en este caso (portada.css y demo/demo.css): de 30 a 41
   fotogramas por segundo, y el parón más largo de 263 a 76 ms (cloudflare.com,
   46 y 46). Las motas, la luz del haz y las animaciones no cambiaban nada y se
   quedan como están. (Desde el 2026-11-19 el grano ya no lleva mezcla para
   nadie, y el desenfoque de las nubes se pinta una sola vez: ver portada.css.)

   Cómo se sabe: se pide un contexto WebGL con `failIfMajorPerformanceCaveat`,
   que el navegador niega (null) si solo podría dárselo por software
   (SwiftShader). Con gráfica se suelta en el acto. `?ligero=1` lo fuerza y
   `?ligero=0` lo quita, para probarlo (la demo, dentro de su marco, mira
   también la dirección de la portada). La marca es `<html data-ligero>`, y el
   CSS hace el resto. Con gráfica no cambia nada.

   CUÁNDO se mira (2026-11-19): UNA vez, la página de fuera, y con la carga ya
   terminada y el navegador sin nada que hacer. Se miraba justo después del
   primer pintado, y dos veces (la portada y la demo de su marco): con el
   navegador recién abierto, crear el contexto dejaba a la gráfica sin sacar un
   fotograma entre 140 y 165 ms cada vez (medido en la traza), justo cuando
   quien llega empieza a bajar. En un momento tranquilo son de 5 a 10 ms. La
   demo, dentro de la portada, no vuelve a preguntar: copia lo que decidió la
   página, que se lo pasa en cuanto lo sabe.
   ========================================================================= */

export function dibujoPorSoftware() {
  try {
    const forzado = pedido()
    if (forzado === '1') return true
    if (forzado === '0') return false
    if (typeof WebGLRenderingContext === 'undefined') return false
    const lienzo = document.createElement('canvas')
    const op = { failIfMajorPerformanceCaveat: true }
    const gl = lienzo.getContext('webgl2', op) || lienzo.getContext('webgl', op)
    if (!gl) return true
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return false
  } catch {
    return false
  }
}

function pedido() {
  for (const w of [window, window.parent]) {
    try {
      const v = new URLSearchParams(w.location.search).get('ligero')
      if (v) return v
    } catch {
      /* un marco de otro origen: no se mira */
    }
  }
  return null
}

/** La página que lleva a esta dentro de un marco, si es de la casa. */
function paginaDeFuera() {
  try {
    return window.parent !== window ? window.parent.document.documentElement : null
  } catch {
    return null
  }
}

function decidir() {
  const raiz = document.documentElement
  if (dibujoPorSoftware()) {
    raiz.setAttribute('data-ligero', '')
    // Y a los marcos de la casa que ya estén cargados (la demo).
    for (const marco of document.querySelectorAll('iframe')) {
      try {
        marco.contentDocument?.documentElement.setAttribute('data-ligero', '')
      } catch {
        /* de otro origen */
      }
    }
  }
  raiz.setAttribute('data-ligero-visto', '')
}

export function ponerModoLigero() {
  const fuera = paginaDeFuera()
  if (fuera) {
    // Si la página ya lo miró, se copia; si aún no, ella lo pondrá aquí al saberlo.
    if (fuera.hasAttribute('data-ligero')) document.documentElement.setAttribute('data-ligero', '')
    return
  }
  const cuandoPueda = () =>
    'requestIdleCallback' in window ? requestIdleCallback(decidir, { timeout: 3000 }) : setTimeout(decidir, 600)
  if (document.readyState === 'complete') cuandoPueda()
  else addEventListener('load', cuandoPueda, { once: true })
}
