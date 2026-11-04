// La página de las cuentas (web/cuenta/) no sale en la construcción de fábrica.
//
// Un push a web/ despliega solo y el registro no está abierto: la página solo entra
// con ADEORQ_CUENTAS=1, y entonces pide además la URL y la clave pública del proyecto,
// que no viven en este repositorio. Lo usan vite.config.js (cada build) y
// scripts/cuentas-check.mjs (cada `pnpm comprobar`), para que sea la misma regla.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const PAGINAS = ['index', 'privacidad', 'aviso-legal', 'privacy', 'legal-notice']

/** Lo que falta por rellenar en los textos legales: datos que solo tiene Munir. */
export const MARCA_FALTA = '[[FALTA'

export const encendidas = (env = process.env) => env.ADEORQ_CUENTAS === '1'

/** Las páginas que aún llevan algún dato por poner. */
export function pendientes(raiz) {
  return PAGINAS.filter((p) => readFileSync(resolve(raiz, 'cuenta', `${p}.html`), 'utf8').includes(MARCA_FALTA))
}

/** Lo que el build añade a sus entradas: nada, salvo que se encienda a propósito. */
export function entradasDeCuentas(raiz, env = process.env) {
  if (!encendidas(env)) return {}
  for (const v of ['ADEORQ_SUPABASE_URL', 'ADEORQ_SUPABASE_CLAVE']) {
    if (!env[v]) throw new Error(`ADEORQ_CUENTAS=1 necesita ${v}`)
  }
  // ADEORQ_CUENTAS_BORRADOR=1 es para mirarla en local. Sin él, unos textos legales
  // sin el nombre o el NIF no se construyen.
  if (env.ADEORQ_CUENTAS_BORRADOR !== '1') {
    const faltan = pendientes(raiz)
    if (faltan.length) throw new Error(`faltan datos legales en web/cuenta/: ${faltan.join(', ')} (busca ${MARCA_FALTA})`)
  }
  return Object.fromEntries(PAGINAS.map((p) => [`cuenta-${p}`, resolve(raiz, 'cuenta', `${p}.html`)]))
}

/** Revienta el build si la salida trae las cuentas sin haberlas encendido. */
export function revisarSalida(salida, env = process.env) {
  if (!encendidas(env) && existsSync(join(salida, 'cuenta'))) {
    throw new Error(`${join(salida, 'cuenta')} no puede existir sin ADEORQ_CUENTAS=1: el registro no está abierto`)
  }
}
