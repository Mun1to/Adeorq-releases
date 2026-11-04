// Lo que decide sin tocar la página ni la red, para poder probarlo solo
// (scripts/cuentas-check.mjs). El formato del nombre es el de la base de datos:
// supabase/migrations/20261101212100_perfiles_y_nombres_reservados.sql.

export const CLAVE_MINIMA = 8

export function errorNombre(v) {
  if (!v) return 'nombre.vacio'
  return /^[A-Za-z0-9_]{3,20}$/.test(v) ? null : 'nombre.formato'
}

export function errorCorreo(v) {
  if (!v) return 'correo.vacio'
  return /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(v) && !v.includes('..') ? null : 'correo.mal'
}

export function errorClave(v, nueva) {
  if (!v) return 'clave.vacia'
  return nueva && v.length < CLAVE_MINIMA ? 'clave.corta' : null
}

/**
 * Lo que trae la dirección al volver del enlace de un correo. El servidor de Auth
 * manda de vuelta aquí con el resultado detrás de la almohadilla, que no viaja a
 * ningún servidor: `#access_token=…&type=signup`, o `#error_code=otp_expired…`.
 */
export function leerVuelta(hash) {
  const datos = new URLSearchParams(String(hash || '').replace(/^#/, ''))
  if (datos.get('error') || datos.get('error_code')) {
    return { error: datos.get('error_code') === 'otp_expired' ? 'vuelta.caducada' : 'vuelta.fallida' }
  }
  const token = datos.get('access_token')
  if (!token) return null
  return { token, tipo: datos.get('type') === 'recovery' ? 'recovery' : 'signup' }
}

/** El texto que le toca a un fallo de `api()` en cuenta.js. */
export function textoDeFallo(fallo) {
  if (fallo?.red) return 'error.red'
  const code = fallo?.code
  if (fallo?.status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'error.limite'
  if (code === 'invalid_credentials') return 'error.credenciales'
  if (code === 'email_not_confirmed') return 'error.sinConfirmar'
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'correo.mal'
  if (code === 'weak_password') return 'clave.floja'
  if (code === 'same_password') return 'clave.igual'
  if (code === 'signup_disabled' || code === 'email_provider_disabled') return 'error.cerrado'
  if (fallo?.status === 401 || code === 'bad_jwt' || code === 'session_not_found') return 'error.sesion'
  return 'error.servidor'
}
