/* ===========================================================================
   Adeorq · portada/pnl.js
   «Comparte tu PnL»: la tarjeta de uso del Perfil, pintada en la portada con
   las MISMAS funciones que la pintan en la app (src/lib/pintarTarjeta.ts, la
   cifra de src/lib/usoDelPerfil.ts y la subida de src/lib/sonidoTarjeta.ts).
   No es una captura ni una maqueta: si la tarjeta de la app cambia, esta
   cambia con ella en el siguiente build.

   Las cifras son las de Munir, las de verdad (él lo eligió el 2026-11-23: «Las
   mías», noviembre y @munito): sacadas el 23 de noviembre de 2026 de su
   historia de uso (%LOCALAPPDATA%\Adeorq\uso-historia-2.json, al día hasta las
   00 h UTC) con las MISMAS funciones del Perfil (conDia, entre, sumar, porDia,
   record y porfolio de usoDelPerfil.ts). Noviembre va hasta ese día: es una foto
   fija, y la nota de debajo de la tarjeta dice la fecha. El proyecto es Adeorq,
   el único de los suyos que es público. El fondo es la foto que Munir tiene de
   fondo en su Adeorq, que es lo que hace la app: la tarjeta sale con tu fondo
   de detrás de las terminales.

   Los mandos son los del editor de la app (src/components/PerfilTarjeta.tsx):
   Mes · Récord · Total, «Resaltar la cifra», el proyecto, el formato y los
   cinco colores. «Día» no está: en la app es el día que eliges en el
   calendario, y aquí no hay calendario.

   Se pinta cuando la sección se acerca a la pantalla, y la cifra sube de 0 a la
   suya en 1,2 s la primera vez que se ve (y al cambiar de Mes a Récord o a
   Total), como en el vídeo que saca la app. Nada se repinta mientras no se
   toca: ni un fotograma de más en el scroll.
   ========================================================================= */

import { pintarTarjeta, COLORES, muestraDe, imagenDeSerie, miniDeSerie } from '../../src/lib/pintarTarjeta.ts'
import { cifra, porcentaje } from '../../src/lib/usoDelPerfil.ts'
import { subida, LLEGADA } from '../../src/lib/sonidoTarjeta.ts'

const lienzo = document.querySelector('[data-pnl-lienzo]')
const seccion = document.querySelector('#pnl')

if (lienzo && seccion) {
  const lang = document.documentElement.lang === 'en' ? 'en' : 'es'
  const QUIEN = '@munito'
  const PROYECTO = 'Adeorq'
  // Las cifras de cada tramo; `proyecto` es la parte de Adeorq en el tramo.
  const CIFRAS = {
    mes: { total: 26823163730, nuevos: 591287365, dias: 23, proyecto: 0.281 },
    record: { total: 3548530630, nuevos: 114368704, delMes: 26823163730, dias: 23, proyecto: 0.186 },
    total: { total: 79380764896, nuevos: 1411389649, dias: 149, proyecto: 0.266 },
  }
  // Las mismas frases que la app (src/lib/i18n.ts).
  const TEXTO = {
    es: {
      mes: 'Noviembre de 2026', record: 'Tu récord · 4 de noviembre', total: 'Desde el 6 de junio de 2026',
      unidad: 'Tokens', nuevos: 'Nuevos', dias: 'Días activos', delMes: 'Total del mes',
      frase: '{n} en {proyecto} · {pct}', hecho: 'Hecho con Adeorq', ia: 'Fondo hecho con IA',
    },
    en: {
      mes: 'November 2026', record: 'Your record · 4 November', total: 'Since 6 June 2026',
      unidad: 'Tokens', nuevos: 'New', dias: 'Active days', delMes: 'Month total',
      frase: '{n} in {proyecto} · {pct}', hecho: 'Made with Adeorq', ia: 'Background made with AI',
    },
  }[lang]

  let que = 'mes'
  let conProyecto = false
  let color = 'azul'
  let vertical = false
  let resaltar = false
  let fondo = null
  let k = 0
  let visto = false
  let urlGatos = ''

  const datos = () => {
    const c = CIFRAS[que]
    const filas = [{ etiqueta: TEXTO.nuevos, valor: cifra(c.nuevos, lang) }]
    if (c.delMes) filas.push({ etiqueta: TEXTO.delMes, valor: cifra(c.delMes, lang) })
    filas.push({ etiqueta: TEXTO.dias, valor: String(c.dias) })
    let frase = null
    if (conProyecto) {
      const [antes, despues = ''] = TEXTO.frase
        .replace('{n}', cifra(c.total * c.proyecto, lang))
        .replace('{pct}', porcentaje(c.proyecto, lang))
        .split('{proyecto}')
      frase = { antes, proyecto: PROYECTO, despues }
    }
    return {
      titulo: TEXTO[que],
      total: cifra(c.total * k, lang),
      unidad: TEXTO.unidad,
      frase,
      filas,
      quien: QUIEN,
      foto: null,
      pie: ['adeorq.com', TEXTO.hecho],
      resaltar,
      color,
    }
  }

  // Lo que dice la tarjeta, en una línea, para quien no ve el lienzo (como
  // `textoDe` en PerfilTarjeta.tsx). El `aria-label` del HTML ya trae el mes.
  const decir = () => {
    const d = { ...datos(), total: cifra(CIFRAS[que].total, lang) }
    const partes = [`${d.titulo}: ${d.total} ${d.unidad}`]
    if (d.frase) partes.push(`${d.frase.antes}${d.frase.proyecto}${d.frase.despues}`)
    partes.push(d.filas.map((f) => `${f.etiqueta} ${f.valor}`).join(', '), d.quien)
    lienzo.setAttribute('aria-label', partes.join('. '))
  }

  const pintar = () => {
    const caja = lienzo.getBoundingClientRect()
    if (!caja.width) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.round(caja.width * dpr)
    const h = Math.round(caja.height * dpr)
    if (lienzo.width !== w || lienzo.height !== h) {
      lienzo.width = w
      lienzo.height = h
    }
    const ctx = lienzo.getContext('2d')
    pintarTarjeta(ctx, w, h, fondo, datos())
  }

  const conMovimiento = () =>
    document.documentElement.dataset.motion !== 'off' && document.documentElement.classList.contains('motion')

  // Una subida a la vez: si se cambia de tramo a mitad, la de antes se para.
  let vuelta = 0
  const subir = () => {
    const mia = ++vuelta
    const t0 = performance.now()
    const paso = (ahora) => {
      if (mia !== vuelta) return
      const t = (ahora - t0) / 1000
      k = subida(t, LLEGADA)
      pintar()
      if (k < 1) requestAnimationFrame(paso)
    }
    requestAnimationFrame(paso)
  }

  // `decode()` y no `onload`: con `onload` la foto se decodificaba en el hilo
  // principal al pintarla la primera vez, y eso caía en pleno scroll (medido con
  // scripts/fotogramas.mjs: fotogramas de 55 a 120 ms justo al cargarla).
  // `createImageBitmap` la deja decodificada fuera del hilo y lista para pintar.
  // En un móvil la tarjeta mide unos 350 px: la copia de 960 basta y pesa la mitad.
  const cargar = async () => {
    const ancho = lienzo.getBoundingClientRect().width * Math.min(window.devicePixelRatio || 1, 2)
    const url = (urlGatos = ancho <= 960 && lienzo.dataset.fondoChico ? lienzo.dataset.fondoChico : lienzo.dataset.fondo)
    try {
      const r = await fetch(url)
      return await createImageBitmap(await r.blob())
    } catch {
      const img = new Image()
      img.src = url
      return img.decode().then(() => img, () => null)
    }
  }

  // Los mandos: los cinco colores del editor de la app, el formato y «Resaltar
  // la cifra». Cada uno repinta una vez, sin volver a subir la cifra.
  for (const b of seccion.querySelectorAll('[data-pnl-color]')) {
    b.style.setProperty('--muestra', muestraDe(b.dataset.pnlColor))
    b.title = COLORES[b.dataset.pnlColor].nombre
    b.addEventListener('click', () => {
      color = b.dataset.pnlColor
      for (const o of seccion.querySelectorAll('[data-pnl-color]')) o.setAttribute('aria-pressed', String(o === b))
      pintar()
    })
  }
  for (const b of seccion.querySelectorAll('[data-pnl-formato]')) {
    b.addEventListener('click', () => {
      vertical = b.dataset.pnlFormato === 'vertical'
      seccion.toggleAttribute('data-pnl-vertical', vertical)
      for (const o of seccion.querySelectorAll('[data-pnl-formato]')) o.setAttribute('aria-pressed', String(o === b))
      requestAnimationFrame(pintar)
      if (fondoId !== 'gatos' && fondoId !== 'tuyo') void ponerDeSerie(fondoId)
    })
  }
  const resalte = seccion.querySelector('[data-pnl-resaltar]')
  resalte?.addEventListener('click', () => {
    resaltar = !resaltar
    resalte.setAttribute('aria-pressed', String(resaltar))
    pintar()
  })
  const proy = seccion.querySelector('[data-pnl-proyecto]')
  proy?.addEventListener('click', () => {
    conProyecto = !conProyecto
    proy.setAttribute('aria-pressed', String(conProyecto))
    decir()
    pintar()
  })
  // Mes · Récord · Total: la cifra vuelve a subir desde 0, como al verla.
  for (const b of seccion.querySelectorAll('[data-pnl-que]')) {
    b.addEventListener('click', () => {
      if (que === b.dataset.pnlQue) return
      que = b.dataset.pnlQue
      for (const o of seccion.querySelectorAll('[data-pnl-que]')) o.setAttribute('aria-pressed', String(o === b))
      decir()
      if (conMovimiento()) subir()
      else pintar()
    })
  }

  // El fondo, como la tira del editor de la app: los gatos, los cuatro de serie
  // (dibujados en código por imagenDeSerie, sin bajar nada) o tu foto o tu
  // vídeo. Lo tuyo se lee del disco con un objectURL y nunca sale del navegador.
  // Un vídeo se pinta con cada fotograma suyo (requestVideoFrameCallback: a 30
  // por segundo, no a los 60 o 120 de la pantalla) y solo mientras la tarjeta se ve.
  let gatos = null
  let video = null
  let urlTuya = ''
  let fondoId = 'gatos'
  let seVe = false
  const tamDescarga = () => (vertical ? [1080, 1920] : [1920, 1080])
  const marcarFondo = (id) => {
    fondoId = id
    for (const o of seccion.querySelectorAll('[data-pnl-fondo]')) o.setAttribute('aria-pressed', String(o.dataset.pnlFondo === id))
    seccion.querySelector('[data-pnl-tuyo]')?.toggleAttribute('data-elegido', id === 'tuyo')
  }
  const soltarVideo = () => {
    video?.pause()
    video = null
  }
  const bucleVideo = () => {
    if (!video || fondo !== video || !seVe) return
    pintar()
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(bucleVideo)
    else requestAnimationFrame(bucleVideo)
  }
  const ponerDeSerie = async (id) => {
    const [w, h] = tamDescarga()
    const lienzoSerie = await imagenDeSerie(id, w, h)
    if (fondoId === id) {
      fondo = lienzoSerie
      pintar()
    }
  }
  for (const b of seccion.querySelectorAll('[data-pnl-fondo]')) {
    b.addEventListener('click', () => {
      const id = b.dataset.pnlFondo
      if (id === fondoId) return
      soltarVideo()
      marcarFondo(id)
      if (id === 'gatos') {
        fondo = gatos
        pintar()
      } else void ponerDeSerie(id)
    })
  }
  const archivo = seccion.querySelector('[data-pnl-archivo]')
  archivo?.addEventListener('change', async () => {
    const f = archivo.files?.[0]
    archivo.value = ''
    if (!f) return
    soltarVideo()
    if (urlTuya) URL.revokeObjectURL(urlTuya)
    urlTuya = URL.createObjectURL(f)
    marcarFondo('tuyo')
    if (f.type.startsWith('video/')) {
      const v = document.createElement('video')
      v.muted = true
      v.loop = true
      v.playsInline = true
      v.src = urlTuya
      video = v
      try {
        await v.play()
      } catch {
        /* sin permiso para reproducir: se queda en su primer fotograma */
      }
      if (video !== v) return
      fondo = v
      bucleVideo()
    } else {
      try {
        const bmp = await createImageBitmap(f)
        if (fondoId !== 'tuyo') return
        fondo = bmp
      } catch {
        marcarFondo('gatos')
        fondo = gatos
      }
      pintar()
    }
  })
  // La imagen, a 1920×1080 (o 1080×1920), con la cifra ya entera. Si lleva los
  // gatos, el pie dice que el fondo es una imagen hecha con IA (regla V): al
  // pasar por el lienzo pierde las credenciales C2PA del original.
  seccion.querySelector('[data-pnl-bajar]')?.addEventListener('click', () => {
    const [w, h] = tamDescarga()
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const d = { ...datos(), total: cifra(CIFRAS[que].total, lang) }
    if (fondoId === 'gatos') d.pie = [...d.pie, TEXTO.ia]
    pintarTarjeta(c.getContext('2d'), w, h, fondo, d)
    c.toBlob((png) => {
      if (!png) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(png)
      a.download = `adeorq-${que}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10000)
    }, 'image/png')
  })

  // Se carga el fondo cuando falta una pantalla para llegar, y la cifra sube
  // cuando la tarjeta ya está a la vista. Las miniaturas de la tira se dibujan
  // después, con la página quieta: cada una cuesta unos 43 ms de hilo principal
  // (medido con scripts/fotogramas.mjs: con requestIdleCallback a secas caía en
  // pleno scroll y daba un fotograma de 51 ms). Si se pulsa uno antes, ya está.
  let quietoDesde = 0
  addEventListener('scroll', () => (quietoDesde = performance.now()), { passive: true })
  const miniaturas = () => {
    const tira = [...seccion.querySelectorAll('[data-pnl-fondo]')].filter((b) => b.dataset.pnlFondo !== 'gatos')
    const una = () => {
      if (!tira.length) return
      if (performance.now() - quietoDesde < 600) return void setTimeout(una, 600)
      const b = tira.shift()
      b.style.backgroundImage = `url(${miniDeSerie(b.dataset.pnlFondo)})`
      setTimeout(una, 120)
    }
    setTimeout(una, 600)
  }
  const cerca = new IntersectionObserver(
    async (es) => {
      if (!es.some((e) => e.isIntersecting)) return
      cerca.disconnect()
      gatos = await cargar()
      if (fondoId === 'gatos') fondo = gatos
      const b = seccion.querySelector('[data-pnl-fondo="gatos"]')
      if (b) b.style.backgroundImage = `url(${urlGatos})`
      pintar()
      miniaturas()
    },
    { rootMargin: '100% 0px' },
  )
  cerca.observe(lienzo)
  new IntersectionObserver((es) => {
    seVe = es.some((e) => e.isIntersecting)
    if (!video) return
    if (seVe) {
      void video.play().catch(() => {})
      bucleVideo()
    } else video.pause()
  }).observe(lienzo)
  const vista = new IntersectionObserver(
    (es) => {
      if (visto || !es.some((e) => e.isIntersecting)) return
      visto = true
      vista.disconnect()
      if (!conMovimiento()) {
        k = 1
        pintar()
      } else subir()
    },
    { threshold: 0.5 },
  )
  vista.observe(lienzo)

  // Antes de verse, la cifra ya está puesta por si alguien no llega a bajar
  // (un lector de pantalla lee el `aria-label`, no el lienzo).
  k = 0
  let ancho = 0
  new ResizeObserver(([e]) => {
    const w = Math.round(e.contentRect.width)
    if (w === ancho) return
    ancho = w
    if (!visto) k = 0
    pintar()
  }).observe(lienzo)
}
