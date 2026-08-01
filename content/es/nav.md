# Nav · español

Claves `data-i18n`. Van en `index.html`.

## Aviso importante: tres enlaces del nav apuntan hoy a secciones que no existen

`#panel`, `#sesiones` y `#agenda` no son ids de ninguna sección montada, así que esos tres
enlaces no llevan a ningún sitio. Las secciones reales son `#que-es`, `#features`,
`#changelog`, `#faq` y `#descargar`. Abajo va el nav corregido: mismos cuatro enlaces, mismo
diseño, claves nuevas y `href` que sí existen.

## skip
Saltar al contenido

## nav.queEs **[nueva, sustituye a `nav.panel`, href `#que-es`]**
Qué es

## nav.funciones **[nueva, sustituye a `nav.sesiones`, href `#features`]**
Funciones

## nav.novedades **[nueva, sustituye a `nav.agenda`, href `#changelog`]**
Novedades

## nav.descargar **[href `#descargar`]**
Descargas

## cta.descargar
Descargar

## motion.reducir
Menos movimiento

## motion.devolver
Movimiento completo

## Textos de accesibilidad (atributos, no nodos)

- `aria-label` de la marca: `Adeorq, ir al inicio`
- `aria-label` del nav: `Secciones`
- `aria-label` del grupo de idioma: `Idioma`
- `title` de la válvula de movimiento: `Baja la amplitud de las animaciones, no las apaga`
