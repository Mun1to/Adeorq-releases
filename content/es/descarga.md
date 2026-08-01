# Descarga · español

Claves `data-content`. Van en `sections/descarga.html`. La versión, la fecha y el peso los
pinta el JS desde `data/release.json`: no se escriben a mano en ningún texto.

## descarga.eyebrow **[nueva]**
Descarga

## descarga.titulo
Móntate la cabina en dos minutos.

## descarga.lead
Instalador para Windows de 64 bits. Necesitas tener instalado el CLI que ya uses, porque
Adeorq trabaja con él: no te pide ninguna clave ni te crea otra cuenta.

## descarga.boton **[nueva, hoy escrito a pelo en el HTML]**
Descargar para Windows

## descarga.todas **[nueva, hoy escrito a pelo en el HTML]**
Ver todas las versiones

## descarga.meta.sistema **[nueva]**
Windows 10 y 11 · x64

## descarga.nota
Windows puede avisarte de que el instalador viene de un editor desconocido. Es el aviso normal
de SmartScreen con una aplicación joven y poco descargada: en <a href="#faq">las preguntas</a>
te contamos cómo comprobar que el paquete es el nuestro.

## descarga.gratis **[nueva, la línea que ocupa el sitio de los precios]**
Gratis, en desarrollo abierto. Ni cuenta, ni prueba de 14 días, ni tarjeta.

## Textos de estado que pinta el JS

- Mientras carga el dato: `buscando la última versión`
- Si no hay dato (sin red o fallo del build): `Ir a la página de descargas`
- Etiqueta de la versión: `v{version}` en mono
- Etiqueta de la fecha: `publicada el {fecha}`
- Etiqueta del peso: `{peso}`
