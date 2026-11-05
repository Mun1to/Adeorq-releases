// Lo que comparten las dos páginas de privacidad: /privacidad y /en/privacy.
//
// El TEXTO vive en los dos fragmentos de esta carpeta (privacidad.es.html y
// privacy.en.html); aquí van solo los datos que no se pueden repetir en dos
// sitios sin que acaben diciendo cosas distintas: la fecha, el correo y lo que
// cada idioma pone en la cabecera. scripts/hacer-privacidad.mjs los junta.

/**
 * Cuándo se cambió el TEXTO por última vez, en ISO. No es la fecha de la
 * construcción: si fuera la del día del build, una política que no ha cambiado
 * diría que se actualizó en cada despliegue. Se toca a mano, en el mismo
 * commit que cambia el texto (la consultó `Get-Date` el 2026-11-05).
 */
export const ACTUALIZADA = '2026-11-05'

/** El correo público de contacto. Lo dio Munir para esto (2026-11-05). */
export const CORREO = 'munitodev@gmail.com'

export const IDIOMAS = {
  es: {
    lang: 'es',
    archivo: 'privacidad.html',
    fragmento: 'privacidad.es.html',
    url: '/privacidad',
    inicio: '/',
    otra: { lang: 'en', url: '/en/privacy', texto: 'English' },
    titulo: 'Política de privacidad · Adeorq',
    descripcion:
      'Qué lee Adeorq de tu ordenador, qué guarda y a dónde sale algo de lo que haces: no tiene servidores ' +
      'propios, ni cuenta, ni telemetría. Quién es el responsable y cómo pedirle algo.',
    fechaEn: (iso) => largaEs(iso),
    etiquetaIdioma: 'Idioma',
    saltar: 'Saltar al texto',
    guia: 'Guía',
    barraAria: 'Páginas',
    marcaAria: 'Adeorq, ir al inicio',
    pie: {
      aria: 'Pie',
      enlaces: [
        ['/', 'Inicio'],
        ['/guia', 'La guía'],
        ['https://github.com/Mun1to/Adeorq-releases/releases', 'Todas las versiones'],
        ['https://github.com/Mun1to/Adeorq-releases/blob/main/LICENSE', 'Licencia de uso'],
      ],
      actual: 'Privacidad',
      copyright: '© 2026 Adeorq · Esta web no usa cookies ni te sigue.',
    },
  },
  en: {
    lang: 'en',
    archivo: 'en/privacy.html',
    fragmento: 'privacy.en.html',
    url: '/en/privacy',
    inicio: '/en/',
    otra: { lang: 'es', url: '/privacidad', texto: 'Español' },
    titulo: 'Privacy policy · Adeorq',
    descripcion:
      'What Adeorq reads on your computer, what it stores and where anything you do goes: no servers of its ' +
      'own, no account, no telemetry. Who is responsible and how to ask them for something.',
    fechaEn: (iso) => largaEn(iso),
    etiquetaIdioma: 'Language',
    saltar: 'Skip to the text',
    guia: 'Guide',
    barraAria: 'Pages',
    marcaAria: 'Adeorq, go to the home page',
    pie: {
      aria: 'Footer',
      enlaces: [
        ['/en/', 'Home'],
        ['/guia', 'The guide'],
        ['https://github.com/Mun1to/Adeorq-releases/releases', 'All releases'],
        ['https://github.com/Mun1to/Adeorq-releases/blob/main/LICENSE', 'Licence'],
      ],
      actual: 'Privacy',
      copyright: '© 2026 Adeorq · This site uses no cookies and does not track you.',
    },
  },
}

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** «2026-11-05» -> «5 de noviembre de 2026», sin depender del idioma del equipo que construye. */
function partes(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`fecha no válida: ${iso}`)
  return { a: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}
export function largaEs(iso) {
  const { a, m, d } = partes(iso)
  return `${d} de ${MESES_ES[m - 1]} de ${a}`
}
export function largaEn(iso) {
  const { a, m, d } = partes(iso)
  return `${d} ${MESES_EN[m - 1]} ${a}`
}
