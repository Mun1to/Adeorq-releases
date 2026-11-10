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
   quedan como están.

   Cómo se sabe: se pide un contexto WebGL con `failIfMajorPerformanceCaveat`,
   que el navegador niega (null) si solo podría dárselo por software
   (SwiftShader). Con gráfica se suelta en el acto. `?ligero=1` lo fuerza y
   `?ligero=0` lo quita, para probarlo (la demo, dentro de su marco, mira
   también la dirección de la portada). Se mira UNA vez y después del primer
   pintado, nunca antes: crear el contexto cuesta unos milisegundos y no se le
   quitan a la carga. La marca es `<html data-ligero>`, y el CSS hace el resto.
   Con gráfica no cambia nada.
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

export function ponerModoLigero() {
  if (dibujoPorSoftware()) document.documentElement.setAttribute('data-ligero', '')
}
