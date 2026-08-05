# Metadatos y compartir · español

Van en el `<head>` de `index.html`. Hoy hay `title` y `description`; falta todo lo de
compartir, que es justo lo que se ve cuando alguien pega el enlace en Discord, en X o en un
mensaje.

## title
Adeorq · el taller de vibe coding con terminales de verdad

## description
Adeorq es el panel de escritorio para Windows donde tus agentes trabajan en terminales reales:
tus proyectos a un clic, las sesiones de Claude Code con su estado, Agenda para las ideas al
vuelo y actualizaciones que llegan solas.

## og.title
Adeorq · nueve agentes trabajando, una sola pantalla

## og.description
El panel de escritorio para Windows donde tus agentes trabajan en terminales de verdad. Gratis,
sin cuenta y sin API keys.

## og.imagen (encargo)

Falta la imagen de compartir: **1200 × 630 px**, fondo `#090D16`, la maqueta del panel algo
girada, el logo y una sola línea de texto, «nueve agentes trabajando, una sola pantalla». Sin
párrafos: a tamaño de miniatura no se leen. Va a `web/assets/og.png` y se declara con
`og:image` y `twitter:card = summary_large_image`.

## Etiquetas que faltan en el head

```html
<meta property="og:type" content="website">
<meta property="og:site_name" content="Adeorq">
<meta property="og:locale" content="es_ES">
<meta property="og:locale:alternate" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
```

**Sin dominio todavía.** `adeorq.com` no está comprado, así que no se escribe `og:url` ni
`canonical` con una URL inventada: se añaden el día que exista el dominio. Poner una URL que no
resuelve es peor que no poner ninguna.
