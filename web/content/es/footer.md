# Pie · español

Claves `data-content`. Van en `sections/footer.html`.

## footer.tag
El panel donde tus agentes trabajan en terminales de verdad. Hecho en Windows, para quien vive
en Windows.

## Columnas

**Producto:** Qué es (`#que-es`) · Funciones (`#features`) · Descargar (`#descargar`) ·
Lo que viene (`#roadmap`)

**Recursos:** Novedades (`#changelog`) · Preguntas (`#faq`) · Todas las versiones
(`https://github.com/Mun1to/Adeorq-releases/releases`)

**Ecosistema** (columna nueva, sustituye a Contacto): Orquio (`https://orquio.com`) ·
munito.dev (`https://munito.dev`)

## Sobre la columna de Contacto **[decisión]**

Los dos enlaces actuales apuntan a `#contacto`, que no existe. Hoy no hay buzón de soporte ni
formulario, y poner uno falso es peor que no ponerlo. Se sustituye la columna entera por
**Ecosistema**, y el contacto se resuelve con una línea en la parte de abajo del pie:

## footer.contacto **[nueva]**
¿Un fallo o una idea? Cuéntalo en <a href="https://github.com/Mun1to/Adeorq-releases/issues"
rel="noopener">las incidencias del repositorio</a>.

## footer.copyright **[cambia]**
© 2026 Adeorq · parte del ecosistema Orquio

Se quita «Todos los derechos reservados»: es una fórmula sin efecto legal en España desde hace
décadas y aquí solo suena a plantilla.

## footer.gratis **[nueva, la línea que ocupa el lugar de los precios]**
Gratis, en desarrollo abierto.

## Aviso legal y privacidad **[decisión]**

Los enlaces `#aviso-legal` y `#privacidad` no llevan a ninguna parte y hoy no hay páginas que
escribir: la web no tiene cuentas, ni formularios, ni cookies, ni analítica. Se sustituyen por
una frase, que es exactamente lo que esas páginas dirían:

## footer.privacidad **[nueva]**
Esta web no usa cookies ni te sigue.

Cuando haya dominio propio y algo que recoger, se escriben las dos páginas y vuelven los
enlaces. Mientras tanto, no se promete una política que no existe.

## Válvula de movimiento (pie)

- Estado encendido: `Movimiento activado`
- Estado apagado: `Movimiento reducido`
- `title`: `Baja la amplitud de las animaciones, no las apaga`

## Aviso técnico para quien monte el pie

El logo apunta a `../../brand/adeorq.png`, que está fuera de `web/`. En el `dist` publicado
ese archivo no va a existir. Hay que copiar el logo a `web/assets/` (o a `web/public/`) y
apuntar ahí. Hoy no se ve el fallo porque el `onerror` lo esconde.
