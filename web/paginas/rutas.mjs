/**
 * Las páginas que responden a una búsqueda: dónde vive cada una, en cada idioma.
 *
 * Es la única lista. De aquí leen scripts/hacer-paginas.mjs (las escribe),
 * scripts/poner-metadatos.mjs (canonical, hreflang, datos estructurados y sitemap)
 * y vite.config.js (las construye). Una página nueva es una línea más aquí y su
 * archivo de textos en esta misma carpeta.
 */
export const RUTAS = [
  {
    id: 'claude-code-windows',
    es: { archivo: 'claude-code-windows.html', url: '/claude-code-windows' },
    en: { archivo: 'en/claude-code-windows.html', url: '/en/claude-code-windows' },
    prioridad: { es: '0.8', en: '0.8' },
    frecuencia: 'monthly',
  },
  {
    id: 'claude-code-codex-gemini',
    es: { archivo: 'claude-code-codex-gemini.html', url: '/claude-code-codex-gemini' },
    en: { archivo: 'en/claude-code-codex-gemini.html', url: '/en/claude-code-codex-gemini' },
    prioridad: { es: '0.8', en: '0.8' },
    frecuencia: 'monthly',
  },
  {
    id: 'comparativa',
    es: { archivo: 'comparativa.html', url: '/comparativa' },
    en: { archivo: 'en/comparison.html', url: '/en/comparison' },
    prioridad: { es: '0.7', en: '0.7' },
    frecuencia: 'monthly',
  },
  {
    id: 'novedades',
    es: { archivo: 'novedades.html', url: '/novedades' },
    en: { archivo: 'en/changelog.html', url: '/en/changelog' },
    prioridad: { es: '0.6', en: '0.6' },
    frecuencia: 'weekly',
  },
]

export const IDIOMAS = ['es', 'en']

/** Los archivos generados en la raíz de web/: la copia de estáticos no los toca. */
export const ARCHIVOS_RAIZ = RUTAS.map((r) => r.es.archivo)

/** Las entradas de Vite: una por página e idioma. */
export function entradasDePaginas(raiz, resolver) {
  const entradas = {}
  for (const r of RUTAS) {
    for (const idioma of IDIOMAS) entradas[`${r.id}-${idioma}`] = resolver(raiz, r[idioma].archivo)
  }
  return entradas
}
