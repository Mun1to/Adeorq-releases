// La página de las cuentas de adeorq.com: crear, entrar, recuperar, confirmar y borrar.
//
// Habla con Supabase Auth por su API con un `fetch` y sin librería, porque así no hay
// nada que guardar: la sesión vive en esta variable y se va al cerrar la pestaña. Ni
// cookies, ni localStorage, ni sessionStorage. Lo que queda por hacer, en
// docs/contexto/cuentas.md.
import { ponerAnimo } from '../portada/adeo.js'
import { errorClave, errorCorreo, errorNombre, leerVuelta, textoDeFallo } from './logica.js'
import { TEXTOS } from './textos.js'

const leerMeta = (nombre) => document.querySelector(`meta[name="${nombre}"]`)?.content ?? ''
const BASE = leerMeta('adeorq-supabase-url')
const CLAVE = leerMeta('adeorq-supabase-clave')

const $ = (selector, dentro = document) => dentro.querySelector(selector)
const $$ = (selector, dentro = document) => [...dentro.querySelectorAll(selector)]

/** Lo que dice Adeo y qué cara pone en cada pantalla. */
const ANIMO = { crear: 'quieta', entrar: 'quieta', recuperar: 'escucha', correo: 'lista', nueva: 'escucha', dentro: 'baila', borrada: 'quieta' }

let idioma = 'es'
let vista = 'crear'
/** El token de esta pestaña. Nunca sale de aquí. */
let sesion = null
let miNombre = ''
/** A qué correo se le puede reenviar la confirmación. */
let correoPendiente = ''
let tipoCorreo = 'alta'

const t = (clave) => TEXTOS[idioma][clave] ?? clave

let animoAhora = 'quieta'

/** Adeo nace después del primer pintado: el atributo es lo que lee entonces. */
function animo(nuevo) {
  animoAhora = nuevo
  $('svg.adeo').dataset.adeo = nuevo
  ponerAnimo(nuevo)
}

/** Pone un texto recordando su clave, para que cambiar de idioma lo traduzca también. */
function pon(el, clave) {
  if (clave) {
    el.dataset.t = clave
    el.textContent = t(clave)
  } else {
    delete el.dataset.t
    el.textContent = ''
  }
}

function aplicarIdioma() {
  document.documentElement.lang = idioma
  document.title = t('pagina.titulo')
  for (const el of $$('[data-t]')) el.textContent = t(el.dataset.t)
  for (const el of $$('[data-t-aria]')) el.setAttribute('aria-label', t(el.dataset.tAria))
  for (const el of $$('[data-enlace]')) el.href = t(el.dataset.enlace)
  $('[data-inicio]').href = t('pagina.inicio')
  const boton = $('[data-cambiar-idioma]')
  boton.textContent = t('pagina.idioma')
  boton.lang = idioma === 'es' ? 'en' : 'es'
  for (const ojo of $$('.campo__ojo')) rotularOjo(ojo)
  pintarArroba()
}

/** El idioma se elige con la dirección (`?lang=en`), sin guardar nada en el navegador. */
function idiomaInicial() {
  const pedido = new URLSearchParams(location.search).get('lang')
  if (pedido === 'en' || pedido === 'es') return pedido
  const lista = navigator.languages?.length ? navigator.languages : [navigator.language || '']
  return String(lista[0]).toLowerCase().startsWith('es') ? 'es' : 'en'
}

function direccion(lang) {
  return `${location.pathname}${lang === 'en' ? '?lang=en' : ''}`
}

/** A dónde vuelve el enlace del correo, en el idioma en que se pidió. */
const urlDeVuelta = () => `${location.origin}${direccion(idioma)}`

// ── La red ──────────────────────────────────────────────────────────────────

async function api(ruta, { metodo = 'POST', cuerpo, token, vuelta } = {}) {
  const url = new URL(BASE + ruta)
  if (vuelta) url.searchParams.set('redirect_to', vuelta)
  const cabeceras = { apikey: CLAVE }
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json'
  if (token) cabeceras.Authorization = `Bearer ${token}`

  let r
  try {
    r = await fetch(url, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw { red: true }
  }
  const texto = await r.text()
  let datos = null
  try {
    datos = texto ? JSON.parse(texto) : null
  } catch {
    // Una respuesta que no es JSON se trata por su código.
  }
  if (!r.ok) throw { status: r.status, code: datos?.error_code ?? datos?.code }
  return datos
}

const nombreLibre = (usuario) => api('/rest/v1/rpc/usuario_disponible', { cuerpo: { p_usuario: usuario } })

// ── Pantallas ───────────────────────────────────────────────────────────────

function ir(nueva, { nota = null, tono = '', foco = true } = {}) {
  vista = nueva
  for (const el of $$('[data-vista]')) el.hidden = el.dataset.vista !== nueva
  const conPestanas = nueva === 'crear' || nueva === 'entrar'
  $('[data-pestanas]').hidden = !conPestanas
  for (const b of $$('[data-pestanas] button')) {
    if (b.dataset.ir === nueva) b.setAttribute('aria-current', 'page')
    else b.removeAttribute('aria-current')
  }
  const titulo = $('[data-titulo]')
  pon(titulo, `titulo.${nueva}`)
  // Con pestañas, el título ya lo dicen ellas: se queda solo para el lector de pantalla.
  titulo.classList.toggle('oculto', conPestanas)
  pon($('[data-dice]'), `dice.${nueva}`)
  anotar(nota, tono)
  animo(tono === 'mal' ? 'espera' : ANIMO[nueva])
  pintarArroba()
  scrollTo(0, 0)
  if (foco) titulo.focus({ preventScroll: true })
}

function anotar(clave, tono = '') {
  const nota = $('[data-nota]')
  pon(nota, clave)
  nota.dataset.tono = clave ? tono : ''
  if (tono === 'mal') animo('espera')
}

function pintarArroba() {
  const el = $('[data-arroba]')
  const escrito = $('#crear-usuario').value.trim()
  const texto = vista === 'dentro' && miNombre ? `@${miNombre}` : escrito ? `@${escrito}` : t('arroba.vacia')
  el.textContent = texto
  el.dataset.vacia = vista === 'dentro' || escrito ? '' : 'si'
  if (vista === 'dentro') el.dataset.estado = ''
  // La letra se reparte el ancho de la columna: veinte letras caben en una línea.
  el.style.setProperty('--largo', Math.max(texto.length, 9))
  // Fuera de crear y de tu cuenta, el nombre no pinta nada.
  el.hidden = vista !== 'crear' && vista !== 'dentro'
}

function mensaje(input, clave, tono = 'mal') {
  const campo = input.closest('[data-campo]')
  const msj = $('[data-msj]', campo)
  pon(msj, clave)
  msj.dataset.tono = clave ? tono : ''
  if (clave && tono === 'mal') {
    campo.dataset.mal = ''
    input.setAttribute('aria-invalid', 'true')
  } else {
    delete campo.dataset.mal
    input.removeAttribute('aria-invalid')
  }
}

/** Mientras dura una petición, el botón lo dice y no se puede pulsar otra vez. */
async function conBoton(boton, trabajo) {
  const clave = boton.dataset.t
  boton.disabled = true
  boton.textContent = t('cargando')
  animo('trabaja')
  try {
    return await trabajo()
  } finally {
    boton.disabled = false
    boton.textContent = t(clave)
    if (animoAhora === 'trabaja') animo(ANIMO[vista])
  }
}

/** Valida los campos que se le pasan, enseña sus errores y enfoca el primero. */
function revisar(pares) {
  let primero = null
  for (const [input, clave] of pares) {
    if (clave) mensaje(input, clave)
    else if (input.closest('[data-campo]').dataset.mal !== undefined) restaurarAyuda(input)
    if (clave && !primero) primero = input
  }
  primero?.focus()
  return !primero
}

// ── El nombre, mientras se escribe ──────────────────────────────────────────

let turnoNombre = 0
let relojNombre = 0
/** Lo último que se sabe del nombre escrito: true, false o null si no se sabe. */
let nombreEstaLibre = null

function alEscribirNombre() {
  const input = $('#crear-usuario')
  const v = input.value.trim()
  const arroba = $('[data-arroba]')
  const turno = ++turnoNombre
  clearTimeout(relojNombre)
  nombreEstaLibre = null
  arroba.dataset.estado = ''
  pintarArroba()
  if (!v) {
    mensaje(input, null)
    animo('quieta')
    return
  }
  const mal = errorNombre(v)
  if (mal) {
    mensaje(input, mal)
    arroba.dataset.estado = 'mal'
    animo('duda')
    return
  }
  mensaje(input, 'nombre.mirando', '')
  animo('escucha')
  relojNombre = setTimeout(async () => {
    try {
      const libre = await nombreLibre(v)
      if (turno !== turnoNombre) return
      nombreEstaLibre = libre === true
      mensaje(input, libre ? 'nombre.libre' : 'nombre.ocupado', libre ? 'bien' : 'mal')
      arroba.dataset.estado = libre ? 'bien' : 'mal'
      animo(libre ? 'lista' : 'duda')
    } catch {
      if (turno !== turnoNombre) return
      mensaje(input, 'nombre.sinRed')
      animo('espera')
    }
  }, 350)
}

// ── Crear ───────────────────────────────────────────────────────────────────

async function crear(form) {
  anotar(null)
  const usuario = form.usuario.value.trim()
  const correo = form.correo.value.trim()
  const clave = form.clave.value
  const bien = revisar([
    [form.usuario, errorNombre(usuario)],
    [form.correo, errorCorreo(correo)],
    [form.clave, errorClave(clave, true)],
  ])
  if (!bien) return
  await conBoton($('button[type=submit]', form), async () => {
    try {
      // Se vuelve a mirar aunque ya saliera libre: el alta falla con un error genérico
      // cuando el nombre lo rechaza la base de datos, así que se evita llegar ahí.
      turnoNombre++
      clearTimeout(relojNombre)
      if (!(await nombreLibre(usuario))) {
        nombreEstaLibre = false
        mensaje(form.usuario, 'nombre.ocupado')
        $('[data-arroba]').dataset.estado = 'mal'
        form.usuario.focus()
        animo('duda')
        return
      }
      nombreEstaLibre = true
      mensaje(form.usuario, 'nombre.libre', 'bien')
      $('[data-arroba]').dataset.estado = 'bien'
      // Si el correo ya tiene cuenta, el servidor contesta igual que si no la tuviera y
      // no manda nada que lo delate: nadie puede usar esto para saber quién está aquí.
      await api('/auth/v1/signup', { cuerpo: { email: correo, password: clave, data: { usuario } }, vuelta: urlDeVuelta() })
      form.clave.value = ''
      mostrarCorreo(correo, 'alta')
    } catch (fallo) {
      await falloDelAlta(form, usuario, fallo)
    }
  })
}

async function falloDelAlta(form, usuario, fallo) {
  const clave = textoDeFallo(fallo)
  if (clave === 'correo.mal') return revisar([[form.correo, clave]])
  if (clave === 'clave.floja') return revisar([[form.clave, clave]])
  if (clave === 'error.servidor') {
    // El error genérico de la base de datos suele ser que otra alta ganó la carrera.
    const libre = await nombreLibre(usuario).catch(() => true)
    if (!libre) {
      revisar([[form.usuario, 'nombre.ocupado']])
      animo('duda')
      return
    }
  }
  anotar(clave, 'mal')
}

function mostrarCorreo(correo, tipo) {
  correoPendiente = correo
  tipoCorreo = tipo
  $('[data-correo-a]').textContent = correo
  pon($('[data-correo-texto]'), tipo === 'alta' ? 'correo.alta' : 'correo.recuperar')
  // Reenviar solo tiene sentido en la confirmación del alta.
  $('[data-vista="correo"] [data-reenviar]').hidden = tipo !== 'alta'
  ir('correo')
}

async function reenviar(boton) {
  anotar(null)
  await conBoton(boton, async () => {
    try {
      await api('/auth/v1/resend', { cuerpo: { type: 'signup', email: correoPendiente }, vuelta: urlDeVuelta() })
      anotar('correo.reenviado', 'bien')
      animo('lista')
    } catch (fallo) {
      anotar(textoDeFallo(fallo), 'mal')
    }
  })
}

// ── Entrar ──────────────────────────────────────────────────────────────────

async function entrar(form) {
  anotar(null)
  const reenviarBoton = $('[data-reenviar]', form)
  reenviarBoton.hidden = true
  const correo = form.correo.value.trim()
  const clave = form.clave.value
  if (!revisar([[form.correo, errorCorreo(correo)], [form.clave, errorClave(clave, false)]])) return
  await conBoton($('button[type=submit]', form), async () => {
    try {
      const r = await api('/auth/v1/token?grant_type=password', { cuerpo: { email: correo, password: clave } })
      form.clave.value = ''
      await abrirSesion(r.access_token)
    } catch (fallo) {
      const texto = textoDeFallo(fallo)
      anotar(texto, 'mal')
      if (texto === 'error.sinConfirmar') {
        correoPendiente = correo
        reenviarBoton.hidden = false
      }
    }
  })
}

async function abrirSesion(token, nota = null) {
  sesion = token
  const [yo, perfiles] = await Promise.all([
    api('/auth/v1/user', { metodo: 'GET', token }),
    api('/rest/v1/perfiles?select=usuario', { metodo: 'GET', token }),
  ])
  miNombre = perfiles?.[0]?.usuario ?? ''
  $('[data-mi-correo]').textContent = yo?.email ?? ''
  cerrarBorrado()
  ir('dentro', { nota, tono: nota ? 'bien' : '' })
}

// ── Recuperar ───────────────────────────────────────────────────────────────

async function recuperar(form) {
  anotar(null)
  const correo = form.correo.value.trim()
  if (!revisar([[form.correo, errorCorreo(correo)]])) return
  await conBoton($('button[type=submit]', form), async () => {
    try {
      await api('/auth/v1/recover', { cuerpo: { email: correo }, vuelta: urlDeVuelta() })
      mostrarCorreo(correo, 'recuperar')
    } catch (fallo) {
      anotar(textoDeFallo(fallo), 'mal')
    }
  })
}

async function guardarNueva(form) {
  anotar(null)
  const clave = form.clave.value
  if (!revisar([[form.clave, errorClave(clave, true)]])) return
  await conBoton($('button[type=submit]', form), async () => {
    try {
      await api('/auth/v1/user', { metodo: 'PUT', cuerpo: { password: clave }, token: sesion })
      form.clave.value = ''
      await abrirSesion(sesion, 'nueva.hecho')
    } catch (fallo) {
      const texto = textoDeFallo(fallo)
      if (texto === 'clave.floja' || texto === 'clave.igual') revisar([[form.clave, texto]])
      else anotar(texto, 'mal')
    }
  })
}

// ── Tu cuenta ───────────────────────────────────────────────────────────────

function olvidarSesion() {
  sesion = null
  miNombre = ''
  $('[data-mi-correo]').textContent = ''
}

async function salir(boton) {
  await conBoton(boton, async () => {
    // Se intenta avisar al servidor, pero aquí se sale igual: la sesión ya no está.
    await api('/auth/v1/logout?scope=local', { token: sesion }).catch(() => {})
    olvidarSesion()
    ir('entrar')
  })
}

function cerrarBorrado() {
  const form = $('[data-borrar]')
  form.hidden = true
  form.clave.value = ''
  mensaje(form.clave, null)
  $('[data-pedir-borrar]').hidden = false
}

async function borrar(form) {
  anotar(null)
  const clave = form.clave.value
  if (!revisar([[form.clave, errorClave(clave, false)]])) return
  const correo = $('[data-mi-correo]').textContent
  await conBoton($('button[type=submit]', form), async () => {
    try {
      // Pide la contraseña aunque haya sesión: una pestaña abierta no basta para borrar.
      const r = await api('/auth/v1/token?grant_type=password', { cuerpo: { email: correo, password: clave } })
      await api('/rest/v1/rpc/borrar_mi_cuenta', { cuerpo: {}, token: r.access_token })
      form.clave.value = ''
      olvidarSesion()
      $('#crear-usuario').value = ''
      ir('borrada')
    } catch (fallo) {
      const texto = textoDeFallo(fallo)
      if (texto === 'error.credenciales') revisar([[form.clave, texto]])
      else anotar(texto, 'mal')
    }
  })
}

// ── La vuelta del enlace de un correo ───────────────────────────────────────

async function atenderVuelta() {
  const vuelta = leerVuelta(location.hash)
  // El token no se queda en la barra ni en el historial.
  if (location.hash) history.replaceState(null, '', location.pathname + location.search)
  if (!vuelta) return false
  if (vuelta.error) {
    ir('entrar', { nota: vuelta.error, tono: 'mal' })
    return true
  }
  if (vuelta.tipo === 'recovery') {
    sesion = vuelta.token
    ir('nueva')
    return true
  }
  try {
    await abrirSesion(vuelta.token, 'dentro.confirmado')
  } catch (fallo) {
    ir('entrar', { nota: textoDeFallo(fallo), tono: 'mal' })
  }
  return true
}

// ── Arranque ────────────────────────────────────────────────────────────────

function rotularOjo(ojo) {
  const visible = ojo.parentElement.querySelector('input').type === 'text'
  ojo.setAttribute('aria-label', t(visible ? 'clave.ocultar' : 'clave.ver'))
  ojo.setAttribute('aria-pressed', String(visible))
}

function ponerOjos() {
  const plantilla = $('#ojo')
  for (const input of $$('input[type=password]')) {
    const ojo = plantilla.content.firstElementChild.cloneNode(true)
    ojo.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password'
      rotularOjo(ojo)
    })
    input.parentElement.append(ojo)
  }
}

/** Un campo que estaba en rojo deja de estarlo al corregirlo, y se valida al salir de él. */
function vigilarCampos() {
  for (const input of $$('input')) {
    if (input.id === 'crear-usuario') continue
    const validar = () => {
      const v = input.type === 'password' || input.name === 'clave' ? input.value : input.value.trim()
      if (!v) return null
      return input.name === 'correo' ? errorCorreo(v) : errorClave(v, 'nueva' in input.dataset)
    }
    input.addEventListener('input', () => {
      if (input.closest('[data-campo]').dataset.mal === undefined) return
      const mal = validar()
      if (mal) mensaje(input, mal)
      else restaurarAyuda(input)
    })
    input.addEventListener('blur', () => {
      const mal = validar()
      if (mal) mensaje(input, mal)
    })
  }
}

/** La contraseña nueva lleva su ayuda puesta de serie; los demás campos, nada. */
function restaurarAyuda(input) {
  mensaje(input, 'nueva' in input.dataset ? 'clave.corta' : null, '')
}

function enlazar() {
  $('#crear-usuario').addEventListener('input', () => alEscribirNombre())
  for (const b of $$('[data-ir]')) {
    b.addEventListener('click', () => {
      anotar(null)
      ir(b.dataset.ir)
    })
  }
  const acciones = { crear, entrar, recuperar, nueva: guardarNueva }
  for (const [nombre, accion] of Object.entries(acciones)) {
    $(`form[data-vista="${nombre}"]`).addEventListener('submit', (e) => {
      e.preventDefault()
      accion(e.currentTarget)
    })
  }
  for (const b of $$('[data-reenviar]')) b.addEventListener('click', () => reenviar(b))
  $('[data-salir]').addEventListener('click', (e) => salir(e.currentTarget))
  $('[data-pedir-borrar]').addEventListener('click', (e) => {
    e.currentTarget.hidden = true
    $('[data-borrar]').hidden = false
    $('#borrar-clave').focus()
    animo('duda')
  })
  $('[data-no-borrar]').addEventListener('click', () => {
    cerrarBorrado()
    animo(ANIMO.dentro)
  })
  $('[data-borrar]').addEventListener('submit', (e) => {
    e.preventDefault()
    borrar(e.currentTarget)
  })
  $('[data-cambiar-idioma]').addEventListener('click', () => {
    idioma = idioma === 'es' ? 'en' : 'es'
    history.replaceState(null, '', direccion(idioma))
    aplicarIdioma()
  })
}

async function arrancar() {
  // El dial de movimiento de la casa: se ve para todos, con menos recorrido si se pide.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.style.setProperty('--motion-gain', '0.25')
  }
  idioma = idiomaInicial()
  ponerOjos()
  vigilarCampos()
  enlazar()
  aplicarIdioma()
  ir('crear', { foco: false })
  const hayVuelta = location.hash.length > 1
  $('main.alta').hidden = false
  $('.alta__pie').hidden = false
  if (hayVuelta) await atenderVuelta()
}

arrancar()
