# promo — el vídeo de Adeorq

Pieza de promoción hecha con [Remotion](https://remotion.dev): un vídeo escrito en React,
así que se cambia editando un archivo y se vuelve a renderizar, sin abrir ningún editor de
vídeo ni volver a grabar nada. Sale **en español y en inglés del mismo guion**, con
transiciones, música, efectos y Adeo dentro.

```bash
cd promo
pnpm install          # tiene su propio pnpm-workspace.yaml, no cuelga del repo
pnpm capturas         # trae las pantallas de web/assets/screens
pnpm ver              # abre el estudio: se ve moverse y se puede recorrer con el ratón
pnpm render           # la entera, 1920x1080 -> out/adeorq-es.mp4 y out/adeorq-en.mp4 (1:35 sin voz)
pnpm media            # sin las escenas opcionales -> out/adeorq-media-es.mp4 y -en (1:20)
pnpm vertical         # 1080x1920, la media  -> out/adeorq-vertical-es.mp4 y -en (Instagram, TikTok)
pnpm corta            # la de bolsillo -> out/adeorq-corta-es.mp4 y -en (unos 22 segundos, sin voz)
pnpm gif              # GIF de la corta-> out/adeorq-es.gif y -en (ver el aviso de abajo)
pnpm guion            # la página para leer el guion en voz alta -> out/guion-voz.html
pnpm voz es           # corta y limpia la grabación de promo/voz/es.* (ver «La voz»)
pnpm muestra          # todos los pasos entre escenas, con su número -> out/transiciones.mp4
pnpm tipos            # tsc, sin emitir nada
```

Cada orden de render saca **los dos idiomas**; para uno solo, `node render.mjs Promo mp4 en`.
Lo renderizado (`out/`) no se versiona.

## Qué tocar

**`src/guion.ts` y nada más.** Ahí está todo lo que se lee en pantalla, lo que se dice y la
lista de escenas: qué captura sale, su título, a qué funciones se acerca la cámara, cuánto
dura y qué hace Adeo a su lado. La duración del vídeo sale de sumar esa lista.

**Una pantalla se cuenta en tres tiempos** (desde la tercera vuelta, 2026-10-12: la segunda
ponía el texto en una franja debajo de la ventana, enseñaba la captura entera y quieta, y
Munir la devolvió por lenta, por el texto «abajo del todo» y por no acercarse a nada):

1. El título sale **en el centro del cuadro**, encima de la captura apagada y desenfocada.
2. Sube a su sitio, encima de la ventana, y la captura se enciende.
3. La cámara va **de función en función** (`focos`): se acerca, apaga lo demás, la enmarca y
   le pone su frase al lado. Si el foco lleva `clic`, el puntero entra y pulsa ahí.

**Ningún texto pequeño va dentro de un rectángulo.** Las frases de los focos, los nombres de
cada capítulo y los de los programas iban en pastillas con borde y Munir las llamó «cárceles»
(2026-10-12): van sueltos, con la letra de los títulos en negrita, y lo que los separa del
fondo es una sombra sin cantos. La letra de terminal se queda para lo que se teclea.

Un foco es `{ en: [izquierda, arriba, ancho, alto], dato, clic? }`, en fracciones de la
captura (de 0 a 1), y vale para las dos lenguas porque el reparto de la app es el mismo.
Para medirlo: abrir la captura, mirar en píxeles dónde está la función y dividir por el
ancho y el alto. Cuanto más pequeño el trozo, más se acerca la cámara (de 1,15 a 2,6
aumentos). Cada foco pide cerca de dos segundos; en una escena más corta se caen los
últimos (`focosQueCaben`, en `tiempos.ts`).

La estructura es un problema, la respuesta y tres capítulos: el gancho (varias terminales
sueltas y nadie sabe en qué está cada una), la portada, «qué es», **1 · Trabaja** (Cabina,
Lienzo, Archivos), **2 · Entérate** (Panel, Adeo, Decisiones), **3 · Tú mandas** (Cuentas,
Agenda, Comandos, Ajustes) y el cierre. Cada capítulo lo abre un cartel que nombra sus
pantallas.

- **Cada frase es un par `{ es, en }`.** No hay un vídeo por idioma que mantener: hay uno, y
  si a una frase le falta un idioma, `pnpm tipos` falla.
- **`voz`** es lo que se dice en esa escena, frase a frase. La voz cuenta lo que no cambia;
  la frase de cada foco lleva el detalle, que se corrige sin volver a grabar.
- **Las duraciones van en múltiplos de 2,5 segundos**, que es un compás de la música: así
  cada corte cae en el primer tiempo. Cuando hay voz grabada manda ella (ver «La voz»).
- **`opcional: true`** saca la escena de la pieza media. **`corta: 5`** la mete en la de
  bolsillo, con esos segundos.
- **Una pantalla cuya captura no existe todavía** sale como una ventana vacía con su nombre,
  en vez de tumbar el render: se puede escribir en el guion antes de tener la imagen.

Las capturas viven en `public/pantallas/` y se traen con `pnpm capturas`, que deja esa carpeta
**igual que la de la web** (lo que allí ya no está, aquí se borra). Son las de
`web/assets/screens/es` y `/en`: la app de verdad sobre un taller de demostración, a 3840 x
2160, y el vídeo de cada idioma usa las de su carpeta. Se pueden publicar. Para cambiarlas se
sustituye el archivo por otro con **el mismo nombre**; si la pantalla cambió de reparto, hay
que volver a medir sus `focos`. Una captura que no sea 16:9 se ve entera, con bandas.

`src/casa.ts` tiene los colores y las fuentes, copiados de donde viven de verdad
(`src/estilos/01-base.css` y `web/fonts`).

## Cómo está montado

| Archivo | Qué hace |
|---|---|
| `src/guion.ts` | Los textos en los dos idiomas y la lista de escenas. |
| `src/tiempos.ts` | Cuándo pasa cada cosa. Lo leen quien pinta y quien hace sonar, así que un rótulo y su clic no se pueden separar. |
| `src/Pantalla.tsx` | Una captura con su título, su cámara, sus frases y el puntero. |
| `src/transiciones.tsx` | Los pasos entre escenas y cuál toca en cada salto. Los de `@remotion/transitions` que pintan con un sombreador (zoom desenfocado, tarjetas que se cambian, onda) y los tres de máscara, hechos aquí: la cámara entra por un hueco (una ventana, el ojo de Adeo, la forma del logotipo) y al otro lado está la escena siguiente. |
| `src/Gancho.tsx`, `src/Capitulo.tsx` | El problema del principio y el cartel de cada capítulo. No llevan capturas. |
| `src/Muestra.tsx` | El muestrario de pasos (`pnpm muestra`): no es una pieza, es para elegirlos mirando. |
| `guion-voz.mjs` | Saca del guion la página para leerlo en voz alta. |
| `voz.mjs` | Corta y limpia la grabación de la voz. |
| `src/Adeo.tsx` | La mascota. **No tiene ni una postura suya:** importa `src/lib/mascota.ts`, el archivo que mueve al Adeo de la app, y solo le cambia el reloj (un vídeo tiene que dar el mismo fotograma cada vez, así que el azar lleva semilla). |
| `src/Sonido.tsx` | Todo lo que se oye, colgado de los cortes del guion. |
| `sonido.mjs` | Escribe la música y los efectos propios en `public/sonido/hecho/`. |
| `render.mjs` | Lanza `sonido.mjs` y renderiza cada idioma. |

## La voz

La voz es la de Munir, grabada por él: no es sintética y por eso el vídeo no lleva aviso de
voz generada por IA. Si algún día se pone una sintética, ese aviso va en el vídeo y en su
descripción (artículo 50 del *EU AI Act*).

1. `pnpm guion` saca `out/guion-voz.html`: el guion por bloques, con letra grande, lo que se
   ve en cada uno y sus segundos.
2. Se graba **un archivo por idioma, de un tirón**, dejando un par de segundos de silencio
   entre bloques, y se deja en `promo/voz/` como `es.<lo que sea>` y `en.<lo que sea>`. Si se
   traba, repite la frase y sigue.
3. `pnpm voz es` (y `pnpm voz en`) la limpia, la parte por sus silencios, transcribe cada
   tramo con el whisper.cpp que instala Adeorq (`%LOCALAPPDATA%\Adeorq\whisper`) y busca en
   lo transcrito cada frase del guion; de una frase repetida se queda con la última. Deja un
   trozo por escena en `public/voz/<idioma>/` y un `voz.json` con lo que dura cada uno y
   dónde empieza cada frase. **Imprime lo que se oye en cada trozo: hay que leerlo.**
4. `pnpm render`. Con `voz.json` delante, cada escena dura lo que su frase (ajustada al pulso
   de la música), Adeo cambia de estado cuando se nombra cada uno y la música se agacha
   mientras se habla. Sin él, la pieza sale con música y rótulos y dura lo que dice el guion.

**Ni `voz/` ni `public/voz/` se versionan**: es su voz, y `promo/` viaja entero al repositorio
público. La pieza corta va siempre sin voz, porque recorta las escenas por debajo de su frase.

## El sonido, y de quién es

Adeorq se vende, así que cada sonido tiene que valer para uso comercial y poder demostrarse.

| Qué | De dónde sale | Licencia |
|---|---|---|
| La música (`cama`, `ritmo`, `final`), el paso entre escenas, la campana y las chispas | Los escribe `sonido.mjs`: osciladores, filtros y una reverberación hechos a mano, con semilla. **No hay ningún archivo de terceros.** | Propia. Nada que cumplir ni que atribuir. |
| Los clics (`tick_002`, `drop_002`, `click_002`, `click_003`, `click_004`) | [Interface Sounds 1.0](https://kenney.nl/assets/interface-sounds) de Kenney, copiados tal cual a `public/sonido/kenney/` | **CC0.** Su `License.txt` va al lado y dice: *«This content is free to use in personal, educational and commercial projects.»* La atribución es opcional. |

Comprobado el **2026-10-11** contra el `License.txt` que viene DENTRO del zip oficial
(`kenney_interface-sounds.zip`, bajado de kenney.nl, SHA-256
`f2193d072726d6758a5f7871b2dcc54dcce0d5c35c6f0a62f92549b327c81232`), no contra lo que dice
una página sobre él.

**La música no la ha oído nadie antes de Munir.** Está medida (sin recortes, costura del
bucle sin chasquido, reparto por bandas), pero un medidor no dice si gusta. Si no gusta, se
cambia en `sonido.mjs` o se sustituye por una pista ajena: entonces su licencia se comprueba
en su fichero y se apunta en esta tabla antes de publicar nada.

**Si algún día lleva voz sintética**, el vídeo y su descripción tienen que decir que es una
voz generada por IA (artículo 50 del *AI Act*, regla V de `AGENTS.md`). Hoy no lleva voz.

## Licencia de Remotion

**Gratis para un individuo, también para uso comercial**, y para organizaciones de hasta 3
empleados. Si algún día esto lo usa una empresa más grande (la Fundación, por ejemplo), hace
falta comprar una licencia de compañía. Comprobado contra su `LICENSE.md` el 2026-08-12, y
otra vez el 2026-10-11 al añadir `@remotion/transitions`: ese paquete no trae fichero de
licencia propio (su `package.json` dice `UNLICENSED`), y en el repositorio tampoco lo tiene,
así que lo cubre la `LICENSE.md` de la raíz, que en la etiqueta `v4.0.507` es idéntica byte a
byte a la de `node_modules/remotion`.

## Cosas que ya costaron un rato, para no repetirlas

1. **TypeScript se queda en la 5.x.** La 7 es el compilador nuevo y cambió la API de JS que
   usa el empaquetador de Remotion: `typescript.sys` sale `undefined` y el render se cae
   leyendo el `tsconfig`, con un error que no menciona la versión por ninguna parte.
2. **Las opciones de un códec concreto no van en `remotion.config.ts`.** El `setCrf` global
   se le aplicaba también al GIF, que no lo admite, y tiraba el render con un `TypeError`
   que tampoco señalaba al archivo culpable. El CRF va en `render.mjs`.
3. **`loadFont` va dentro de un `if (typeof window !== "undefined")`.** Remotion evalúa
   `Root.tsx` en Node para enterarse de qué composiciones hay, y allí no existe `FontFace`.
4. **La captura se ve entera.** El marco toma la proporción de la imagen; recortarla a 16:9
   se comía los bordes de la app.
5. **Todos los paquetes de Remotion van a la MISMA versión, sin `^`.** Al añadir uno nuevo
   con `^4.0.507`, pnpm trae el último 4.0.x y se queda desparejado del `remotion` que fija
   el lockfile.
6. **Los tamaños se miden con `u` (`useMedidas`), no en porcentaje de la altura.** En la
   vertical la altura es 1.920: un titular al 9 % salía de 182 px y no cabía en 1.080 de ancho.
7. **El GIF se reduce con `--scale`, no con `--width`.** `--width=720` cambiaba solo el ancho
   y el GIF salía de 720 × 1080, con la pieza recolocada como si fuera vertical.
8. **Los pasos con sombreador piden una escena de una sola raíz y opaca.** Dibujan en su
   lienzo solo el primer hijo (el rótulo, que era el segundo, desaparecía durante el paso) y
   por donde la escena es transparente se ve debajo la escena sin tocar (los rótulos salían
   dobles). Por eso cada escena va envuelta en un `AbsoluteFill` con su propio `Fondo`.
9. **La gráfica del render va por ANGLE** (`remotion.config.ts`). Con la de fábrica, a la
   quinta transición el navegador caía a WebGL por software y el render se colgaba.
10. **Los tiempos por palabra de whisper no valen para cortar audio.** El final de una palabra
    lo pone donde empieza la siguiente, con el silencio dentro. `voz.mjs` parte antes por
    silencios y le pregunta a whisper solo qué se dice en cada tramo.
11. **Un paso de máscara son dos escenas con UNA cámara.** Si la que llega solo se destapa
    (un círculo que crece sobre una escena quieta) se lee como una cortinilla; para que se
    lea como entrar por un hueco, la que llega va entera dentro del hueco, en pequeño, y
    crece al mismo paso al que la otra se viene encima. La cuenta está en `Portal`
    (`transiciones.tsx`). Y el hueco se ABRE: si está desde el primer fotograma, aparece
    de golpe una miniatura encima de la escena.
12. **Para mirar un cambio no hace falta el vídeo entero.** `remotion bundle` una vez, y
    después `remotion render <carpeta> Promo-es tramo.mp4 --frames=600-824 --scale=0.5
    --muted` y una hoja de contactos con `ffmpeg -vf "select='not(mod(n,16))',tile=4x4"`:
    una escena entera en una imagen, en medio minuto. **Ese `--muted` es para quien revisa
    fotogramas; lo que se le enseña a alguien va con sonido**: la primera prueba que vio
    Munir era muda, y lo primero que dijo fue que no se oía nada.
13. **Parar un render no para sus procesos.** Cortar la orden deja vivos a `node`, a una
    docena de `chrome-headless-shell` y a su `ffmpeg`, y el siguiente de la cola arranca
    igual. Se buscan por su ruta (`promo\node_modules`) y se paran esos.

## El GIF pesa, y es del formato

`pnpm gif` saca la versión corta a 720 px y aun así **pesa megas**. No es un ajuste mal
puesto: un GIF son 256 colores sin compresión entre fotogramas, y veinte segundos de capturas
de pantalla no bajan de ahí por mucho que se recorte. Y no tiene sonido.

**Para el README, usa el MP4.** GitHub reproduce vídeo en Markdown, pero solo desde sus
propios servidores: hay que **arrastrar `out/adeorq-en.mp4` a un comentario de un issue** (o
al editor del README en la web), copiar la URL de `user-attachments` que genera y pegar esa
URL en el README. Son veinte segundos y queda un reproductor de verdad, con su sonido.

## Pendiente

**PARADO hasta que Adeorq esté terminado** (Munir, 2026-10-12: «todavía no hagas el vídeo hasta
que finalicemos con adeorq»). El vídeo se hace una vez, al final, y sale junto a la V1. Hasta
entonces lo que él diga del vídeo se apunta en esta lista y no se toca ni `src/` ni `out/`.

Lo que ya ha pedido para ese día, sobre el corte que hay:

- **Sin números en pantalla**: ni «01 · CABINA» en cada pantalla ni «1 · Trabaja» en los
  carteles.
- **Claro y sencillo** para quien no conoce Adeorq.
- **Un poco más lento** que 1:35 (2:17 era demasiado lento).
- **Solo funciones potentes**: fuera «te pregunta, y contestas con un clic» de la Cabina, que
  eso ya lo hace la terminal sola. Cada cosa que se enseñe, algo que la terminal no hace.
- **Las capturas se rehacen al final**, sobre el Adeorq terminado, y con ellas los `focos`.
- Trajo un vídeo de referencia (el lanzamiento de otro lienzo de agentes: gancho en primera
  persona, la app a pantalla completa, etiquetas de dos palabras, una tirada de 50 segundos) y
  **no ha dicho qué quiere de él**: se le pregunta antes de montar nada.

- **Falta la voz.** El guion está escrito (más corto desde la tercera vuelta: se lee en un
  minuto y medio) y `voz.mjs` probado de punta a punta con una voz sintética de Windows,
  solo como ensayo (no está en ningún vídeo). Con la grabación de verdad hay que volver a
  medir la mezcla (`ffmpeg -af ebur128=peak=true`).
- **La función «trabajando» es una foto con cámara, marco y puntero, no una grabación.** Lo
  que se mueve dentro de una pantalla lo pone el vídeo; la app está quieta. Para enseñarla
  trabajando de verdad (una terminal escribiendo, una tarjeta cambiando de columna) hacen
  falta **clips**: el equipo de `scripts/laboratorio/capturas` ya abre la app en una casa de
  demostración y la maneja por el puerto de depuración, así que puede grabar además de
  fotografiar. Con un `cockpit.mp4` al lado de `cockpit.png`, a `Pantalla.tsx` le falta solo
  pintar un `OffthreadVideo` donde hoy pinta la imagen: los focos y lo demás valen igual.
- Los `focos` están medidos sobre las capturas en español. En las inglesas el reparto es el
  mismo, pero un botón puede medir distinto: si un clic cae fuera de su botón, es por eso.
