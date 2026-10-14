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
pnpm render           # 1920x1080 -> out/adeorq-es.mp4 y out/adeorq-en.mp4 (57,5 s sin voz)
pnpm guion            # la página para leer el guion en voz alta -> out/guion-voz.html
pnpm voz es           # corta y limpia la grabación de promo/voz/es.* (ver «La voz»)
pnpm muestra          # todos los pasos entre escenas, con su número -> out/transiciones.mp4
pnpm tipos            # tsc, sin emitir nada
```

`pnpm render` saca **los dos idiomas**; para uno solo, `node render.mjs Promo en`. Lo renderizado
(`out/`) no se versiona. Es **una sola pieza**: hubo cuatro (entera, media, vertical y de
bolsillo) mientras el guion eran diez pantallas que se podían quitar de una en una.

## El guion, por tiempos

Una sola pieza de **71,25 segundos**, de una tirada y sin capítulos, **contada por Adeo**. Sale de
las rondas 6.ª, 7.ª y 8.ª (2026-10-14, en «Pendiente»): la primera pasada era «muy lenta y difícil
para el usuario»; «pon a Adeo de protagonista, Adeo explica la plataforma»; «que el highlight de
las cosas sea mejor y que explique más funciones y que Adeo esté al lado de los highlights»; y
que salga el móvil y se explique bien el Lienzo.
Está escrito por TIEMPOS y no por pantallas: qué se ve y qué se lee en cada tramo. Cada tramo dura
pulsos enteros de la música (0,625 s), así que cada corte cae en un tiempo. La palabra en negrita
es la única que va en el azul de la marca.

| Tiempo | Tramo | Qué se ve | Qué se lee | Qué suena |
|---|---|---|---|---|
| 0:00 – 0:06,25 | **El problema y el giro** | Solo texto, en el centro, sobre el fondo de la marca. Cada frase entra palabra a palabra y releva a la anterior. En primera persona: es Munir | «Programo con **varios agentes**.» → «¿Cuál **terminó**? ¿Cuál me **espera**?» → «Así que los junté en **una ventana**.» | El colchón, bajo, y una tecla por palabra |
| 0:06,25 – 0:10 | **El nombre** | El logotipo solo; abre el ojo, es Adeo, saluda y se presenta. Desde aquí lo cuenta él | «Adeorq» → «¡Hola! Soy **Adeo**. Te lo enseño.» | La campana, entra el ritmo, y sus teclas |
| 0:10 – 0:15 | **Qué es** | La Cabina entera, con Adeo saludando al lado de la frase; después se levantan las dos terminales de arriba y Adeo, tecleando, se pone en su esquina | «Claude Code, Codex, Gemini… **lado a lado**» → «Cada uno en su **terminal**» | Un golpe por frase |
| 0:15 – 0:18,75 | **Panel** | Las dos primeras cifras, levantadas | «¿Quién te **espera**?» → «**3 trabajando**. Nadie espera.» | Ídem |
| 0:18,75 – 0:22,5 | **Capataz** | Lo que se le puede pedir al Capataz, levantado | «¿Montar **un equipo**?» → «Pídelo **en cristiano**» | Ídem |
| 0:22,5 – 0:28,75 | **Lienzo: el tablero** | El Lienzo entero; se levantan las terminales vivas en el tablero, y después el enlace entre dos de ellas, con una flecha que se traza sola de una a otra | «Y un **tablero infinito**» → «Terminales vivas, **en el tablero**» → «Flecha: **uno sigue al otro**» | Ídem |
| 0:28,75 – 0:32,5 | **Lienzo: las columnas** | El tablero de tarjetas, con sus columnas | «¿Quién hace **qué**?» → «Cada uno, **en su columna**» | Ídem |
| 0:32,5 – 0:36,25 | **Enjambre** | La ventana del enjambre, flotando: la petición y Adeo repartiéndola en dos | «¿Y si pides **algo grande**?» → «Lo **reparto** yo» | Ídem |
| 0:36,25 – 0:40 | **Archivos** | El árbol del proyecto, con «2 cambiados» | «¿Qué ha **tocado**?» → «**2 archivos**, a un clic» | Ídem |
| 0:40 – 0:43,75 | **Decisiones** | La pregunta de un agente con sus opciones; el puntero elige la recomendada | «¿Un agente **duda**?» → «Te da **opciones**, y eliges» | El golpe y el clic |
| 0:43,75 – 0:47,5 | **Cuentas** | Una cuenta con su cuota; el puntero pulsa «Terminal con esta» | «¿Te queda **cuota**?» → «La ves, y **eliges cuenta**» | El golpe y el clic |
| 0:47,5 – 0:51,25 | **Comandos** | El buscador y los primeros comandos; el puntero pulsa uno | «¿Cómo era **ese comando**?» → «Búscalo: **un clic lo teclea**» | El golpe y el clic |
| 0:51,25 – 0:55 | **Agenda** | La ficha de los encargos programados; Adeo, dormido | «¿Y cuando **no estás**?» → «Encargos que **van solos**» | Un golpe por frase |
| 0:55 – 0:58,75 | **Móvil: el conserje** | Un teléfono flotando: la petición, la respuesta del conserje y las dos sesiones que abre, levantadas | «¿Lejos del **ordenador**?» → «Pídelo, y **abro las sesiones**» | Un golpe por frase |
| 0:58,75 – 1:02,5 | **Móvil: una terminal** | La terminal de storefront-api en el teléfono; el puntero pulsa «Contestar» en su aviso de decisión | «¿Y si una **te espera**?» → «Contestas **desde el móvil**» | El golpe y el clic |
| 1:02,5 – 1:07,5 | **Adeo** | Adeo en grande, en el centro, hablando de sí mismo: saluda y salta | «Y yo **te aviso**…» → «…cuando uno **termina**» | La chispa |
| 1:07,5 – 1:11,25 | **El cierre** | Adeo celebrando, y una sola cosa que hacer | «Descárgalo gratis» · «**adeorq.com**» · «Windows y Linux» | El acorde del final |

Lo que cumple, y de dónde sale cada cosa:

- **Adeo es quien lo cuenta.** Despierta del logotipo y se presenta; dice cada pregunta en
  grande, a su lado, con su interrogación encima (el ánimo `duda` de la app), y cada respuesta
  **pegado a la pieza resaltada**, en su esquina de abajo a la izquierda (o de arriba, si abajo no
  cabe), llegando con el brinco de cuando lo tocas y con un ánimo distinto en cada una (`adeo` en
  el guion): baila, salta, escucha, teclea, y en la Agenda duerme mientras los encargos van solos.
  Sin voz: «habla» con el texto. El problema sigue siendo de Munir y en primera persona, que es lo
  que pidió del vídeo de referencia; desde el nombre, el que habla es Adeo.
- **El resaltado levanta la pieza de la pantalla:** es la misma captura recortada a su trozo, un
  5 % más grande, con su sombra, su marco encendido y un brillo que la cruza una vez; todo lo de
  alrededor se desenfoca y se apaga. Antes era solo un marco sobre la captura.
- **Cada función es una pregunta y su respuesta.** La pregunta es la que se haría quien mira
  (y las dos primeras son las del problema); la respuesta lleva lo que se ve en la pieza: una
  cifra, una columna, el reparto. Es lo que hacen Whop, FlyingPress y Shipper, sus tres
  preferidos: cada función rematada con su resultado.
- **La cámara entra directo a la pieza** (`directo` en el guion), sin enseñar antes la pantalla
  entera llena de código. La única que sale entera es la Cabina, porque ES lo que es Adeorq.
- **El enjambre es la única captura suelta** (`swarm.png`, 534 × 632): con `proporcion` en el
  guion sale como una ventana flotando sobre el fondo de la marca, a cuatro quintos del alto, en
  vez de estirada a pantalla completa. Es la que mejor cuenta a Adeo: en ella él reparte el
  trabajo.
- **Dice qué es Adeorq justo después del nombre**, como FlyingPress («the all in one speed
  optimization plugin for WordPress»).
- **Treinta y cinco ideas en 71,25 segundos**, una cada 2,04 s: 29 por minuto, el ritmo de Whop.
  Sus once preferidas van a 24,5 de mediana. Ninguna imagen se queda quieta: la cámara siempre
  empuja.
- **Once funciones, el Lienzo en tres tiempos y Adeo.** Sus referencias enseñan de cuatro a seis,
  pero Munir pidió «que explique más funciones» y el móvil, y eso manda: la pieza pasa del minuto
  por eso. **Cuáles son, y sus preguntas, lo eligió quien montó el corte, no Munir.**
- **El móvil es un teléfono flotando** (`marco: "movil"`, con su canto y sus esquinas) con las
  capturas de `public/movil/`. Su página no tiene inglés: en la pieza inglesa los textos de la
  conversación van en inglés y los botones, en español.
- **La flecha del Lienzo se dibuja encima** (`flecha` en el guion): en la captura, la etiqueta
  del enlace tapa la raya que encadena a los dos agentes, así que el vídeo traza una flecha justo
  debajo, de una terminal a la otra. Es lo único del vídeo pintado sobre la app que no es un
  resaltado.
- **Los pasos entre tramos:** del texto al nombre, la máscara con la forma del logotipo; del
  nombre a la app, por el ojo de Adeo; entre pantallas, el hueco y el cambio de tarjetas, uno
  cada vez; a Adeo, el zoom con giro; y al cierre se atraviesa.
- **Va sin voz,** y es lo que más lo separa de sus tres preferidos: los tres llevan una voz que
  explica desde el segundo cero. La voz es la suya y la decide él; lo que diría está en `voz`,
  dentro de `src/guion.ts`, y `pnpm guion` saca la página para leerla. Con ella cada tramo dura lo
  que su frase.

## Qué tocar

**`src/guion.ts` y nada más.** Ahí está todo lo que se lee en pantalla, lo que se dice y la
lista de tramos, en el orden de la tabla de arriba: qué captura sale, su frase grande, en qué
funciones entra la cámara y cuánto dura. La duración del vídeo sale de sumar esa lista. Si se
cambia el guion, se cambia también la tabla.

**Todo lo que se lee entra palabra a palabra y lleva una sola palabra en color**, la que va
entre asteriscos en el guion (`Palabras.tsx`). Un `\n` parte la frase en dos renglones.

**Una función del producto se cuenta en dos tiempos** (`escenas/3-Producto.tsx`):

1. La captura llena el cuadro y la frase grande sale **en el centro**, con la app a media luz
   debajo.
2. La frase se va, la app se enciende y la cámara **entra hasta cada función** (`focos`): apaga
   lo demás, la enmarca y le pone su frase al lado. Si el foco lleva `clic`, el puntero entra y
   pulsa ahí.

Con `directo: true` se salta el plano de la pantalla entera: la cámara ya está en su pieza desde
el primer fotograma, la frase grande es una PREGUNTA que se lee sobre ella a media luz, y la
respuesta sale cuando se enciende. Así van las cinco preguntas desde la segunda pasada: la app
entera, llena de código, era lo que Munir llamó «difícil para el usuario».

No hay ventana, ni Adeo al lado, ni título encima: el cuadro ES la app. El corte anterior la
metía en una ventana a tres cuartos de cuadro, y de su vídeo de referencia Munir se quedó con
«la app REAL a pantalla completa, con la cámara viajando por dentro» (2026-10-13).

**Ningún texto pequeño va dentro de un rectángulo.** Las frases de los focos iban en pastillas
con borde y Munir las llamó «cárceles» (2026-10-12): van sueltas, con la letra de los títulos en
negrita, y lo que las separa del fondo es una sombra sin cantos. **Tampoco hay números ni el
nombre de la pestaña en pantalla.**

Un foco es `{ en: [izquierda, arriba, ancho, alto], dato, clic? }`, en fracciones de la
captura (de 0 a 1), y vale para las dos lenguas porque el reparto de la app es el mismo.
Para medirlo: abrir la captura, mirar en píxeles dónde está la función y dividir por el
ancho y el alto. Cuanto más pequeño el trozo, más se acerca la cámara (de 1,15 a 2,6
aumentos). Cada foco pide dos segundos largos: en un tramo de 3,75 o de 5 cabe uno; si no
caben, se caen los últimos (`focosQueCaben`, en `tiempos.ts`).

- **Cada frase es un par `{ es, en }`.** No hay un vídeo por idioma que mantener: hay uno, y
  si a una frase le falta un idioma, `pnpm tipos` falla.
- **`voz`** es lo que se dice en ese tramo, frase a frase. En el texto solo y en Adeo va una
  frase de voz por cada frase que se lee, para que entren a la vez.
- **Las duraciones van en múltiplos de 2,5 segundos**, que es un compás de la música: así
  cada corte cae en el primer tiempo. Cuando hay voz grabada manda ella (ver «La voz»).
- **Una pantalla cuya captura no existe todavía** sale como un rayado con su nombre, en vez de
  tumbar el render: se puede escribir en el guion antes de tener la imagen.

Las capturas viven en `public/pantallas/` y se traen con `pnpm capturas`, que deja esa carpeta
**igual que la de la web** (lo que allí ya no está, aquí se borra). Son las de
`web/assets/screens/es` y `/en`: la app de verdad sobre un taller de demostración, a 3840 x
2160, y el vídeo de cada idioma usa las de su carpeta. Se pueden publicar. Para cambiarlas se
sustituye el archivo por otro con **el mismo nombre**; si la pantalla cambió de reparto, hay
que volver a medir sus `focos`. Una captura que no sea 16:9 sale como ventana flotante, con
`proporcion` en el guion.

**Las de SU fondo mandan sobre esas, y solo existen en su máquina.** Munir pidió «que el fondo
de Adeorq sea el que tenga yo y no uno genérico» (7.ª ronda): la app con su foto detrás del
cristal, como la ve él. Esas capturas van en `public/con-su-fondo/es` y `/en`, con los mismos
nombres; el vídeo coge de ahí cada pantalla que exista y las demás de `public/pantallas/`.
**No se versionan** (`.gitignore`): llevan su cara, y `promo/` viaja entero al repositorio
público. Tampoco van a la web, que sigue con el fondo de ejemplo. Las saca la sesión que tiene la
casa de pruebas y se copian a mano a esa carpeta; `pnpm capturas` no la toca.

**Las del móvil van en `public/movil/es` y `/en`** (`movil-conserje.png`, `movil-sesiones.png` y
`movil-terminal.png`, a 390 × 844 y escala 3: 1170 × 2532), tampoco versionadas. Se sacan sin la
app, con el doble del móvil (`scripts/laboratorio/doble-movil.mjs`), pero **NO con el doble tal
cual**: sus datos de ejemplo nombran proyectos reales de Munir, y eso no puede salir en un vídeo.
El 2026-10-14 se hizo así, y así se repite:
1. Una copia del doble fuera del repo con todos sus datos pasados al taller inventado de Sam
   (storefront-api, landing-web, invoice-cli, mobile-app, docs-site, design-tokens; rutas
   `P:\projects\…`) y un `IDIOMA=en` que pone en inglés los textos de ejemplo. Se arranca con
   `PAGINA=<repo>/src-tauri/src/movil.html`, una por idioma, en puertos libres.
2. Un Brave sin ventana con un perfil de usar y tirar (como `scripts/laboratorio/banco-sin-mcp.mjs`,
   con el `playwright-core` de la caché de npx), en modo móvil a 390 × 844, escala 3 y tema oscuro:
   se guarda la clave de emparejar (`adeorq-movil-clave` = `clave-de-mentira`), se manda al
   conserje «Antes del viernes: que el descuento redondee bien y que la portada tenga modo oscuro»
   por `/api/enviar`, y se fotografían `#conv=c1`, la portada y `#terminal=1`.

`src/casa.ts` tiene los colores y las fuentes, copiados de donde viven de verdad
(`src/estilos/01-base.css` y `web/fonts`).

## Cómo está montado

| Archivo | Qué hace |
|---|---|
| `src/guion.ts` | Los textos en los dos idiomas y la lista de tramos, por tiempos. |
| `src/tiempos.ts` | Cuándo pasa cada cosa. Lo leen quien pinta y quien hace sonar, así que un rótulo y su clic no se pueden separar. |
| `src/Promo.tsx` | El montaje: cada tramo del guion con su escena y el paso que lo une al anterior. |
| `src/escenas/1-Problema.tsx` | 0:00. Solo texto, frase a frase, en el centro. |
| `src/escenas/2-Nombre.tsx` | 0:10. El logotipo, que abre el ojo y es Adeo, y el nombre. |
| `src/escenas/3-Producto.tsx` | 0:12. Una captura llenando el cuadro, con su frase grande, su cámara, sus frases y el puntero. La usan los cinco tramos del producto. |
| `src/escenas/4-Adeo.tsx` | 0:42. Adeo en grande, con una frase cada vez. |
| `src/escenas/5-Cierre.tsx` | 0:52. Qué hacer y dónde. |
| `src/Palabras.tsx` | Una frase que entra palabra a palabra, con su palabra en color. La usan todas las escenas. |
| `src/transiciones.tsx` | Los pasos entre tramos y cuál toca en cada salto. Los de `@remotion/transitions` que pintan con un sombreador (zoom desenfocado, tarjetas que se cambian) y los de máscara, hechos aquí: la cámara entra por un hueco (una ventana, el ojo de Adeo, la forma del logotipo) y al otro lado está la escena siguiente. |
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
público.

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

## No hay GIF, y es por el formato

Hubo un `pnpm gif` que sacaba veinte segundos a 720 px y aun así **pesaba veinte megas**. No
era un ajuste mal puesto: un GIF son 256 colores sin compresión entre fotogramas, y las capturas
de pantalla no bajan de ahí por mucho que se recorte. Y no tiene sonido. Se quitó con la pieza
de bolsillo de la que salía.

**Para el README, usa el MP4.** GitHub reproduce vídeo en Markdown, pero solo desde sus
propios servidores: hay que **arrastrar `out/adeorq-en.mp4` a un comentario de un issue** (o
al editor del README en la web), copiar la URL de `user-attachments` que genera y pegar esa
URL en el README. Son veinte segundos y queda un reproductor de verdad, con su sonido.

## Pendiente

**El vídeo de LANZAMIENTO sigue parado hasta que Adeorq esté terminado** (Munir, 2026-10-12:
«todavía no hagas el vídeo hasta que finalicemos con adeorq»): se hace una vez, al final, con las
capturas rehechas, y sale junto a la V1.

**Lo que hay desde el 2026-10-13 es un corte de PRUEBA**, y la pausa se levantó solo para él
(Munir, 2026-10-13, 21:45: «que estructures bien lo del vídeo y hacer un vídeo de prueba de
Adeorq»). Es el guion de arriba con las capturas de la 0.9.195. Sirve para que juzgue la
estructura, el ritmo y el sonido antes del día del lanzamiento; no se publica en ningún sitio.
Lo que diga al verlo se apunta en esta lista.

Medido el 2026-10-13 sobre la primera pasada (hoy `out/adeorq-57s-es.mp4`, con
`ffmpeg -af ebur128=peak=true`): 57,5 s, −16,2 LUFS de media y el pico en −1,7 dBFS. Los diez primeros segundos van a −24,5 (solo el
colchón y las teclas), el cuerpo a −15,9 y el cierre a −13,2: arranca bajo y la música entra con
el nombre. Sus referencias van a −14,2 de mediana; subirlo esos dos decibelios pasaría el pico
de −1, así que se queda ahí.

**6.ª ronda (Munir, al ver el corte de prueba de 57,5 s del 2026-10-13; la pasó literal la
sesión «Adeorq: sesiones y terminales»):** «el vídeo está mejor pero es muy lento y difícil para
el usuario y no lo explica bien del todo como otras referencias». Lectura de quien montó el
corte, no suya, después de leer las fichas de Whop, FlyingPress y Shipper en la guía: no decía
qué es Adeorq, enseñaba terminales llenas de código, las frases describían la pantalla en vez
de lo que ganas, se quedaba quieto más de tres segundos por función (sus referencias, unos 2,3) y
el problema ocupaba diez. Los tres llevan además una voz que explica; la voz es decisión suya, y
la segunda pasada va sin ella, con el texto haciendo de explicación.

Y en la misma ronda, pedido para esta segunda pasada (pasado por la misma sesión el
2026-10-14): **«pon a Adeo de protagonista, Adeo explica la plataforma»**. Adeo guía el vídeo y
presenta cada función, vivo y con sus reacciones, y sin voz sintética: «habla» con el texto.

**7.ª ronda (Munir, 2026-10-14, al ver la pasada con Adeo de guía; la pasó literal «Adeorq:
sesiones y terminales»):** «el vídeo está mejor pero me gustaría que el fondo de Adeorq sea el que
tenga yo y no uno genérico y que el highlight de las cosas sea mejor y que explique más funciones
y que Adeo esté al lado de los highlights explicando las cosas». El fondo suyo es la foto de
`%LOCALAPPDATA%\Adeorq\fondo.png`; las capturas con ese fondo las saca esa sesión en la casa de
pruebas, no se rehacen desde aquí.

**8.ª ronda (Munir, 2026-10-14, al ver el corte con su fondo; la pasó literal «Adeorq: sesiones y
terminales»):** «en el vídeo no comenta lo del móvil y bien el canvas etc etc pero me gusta más que
antes gracias y lo de Adeo que explica las cosas está muy bien». Lo que pide: que salga el móvil
(el conserje, las sesiones y las terminales desde el teléfono) y que el Lienzo se explique bien
(terminales dentro del tablero, las flechas que encadenan agentes y el enjambre). **Lo que le
gusta y no se toca: Adeo explicando cada cosa.**

**Lo que le falta a este corte para ser el del lanzamiento:**

- **Que Munir diga si las funciones son las suyas.** Cabina, Panel, Capataz, Lienzo, enjambre,
  Archivos, Decisiones, Cuentas, Comandos y Agenda las eligió quien montó el corte, y también las
  nueve preguntas.
- **Su fondo, a medias.** Las nueve pantallas ya salen con su foto (`public/con-su-fondo/`, ver
  «Qué tocar», 2026-10-14, sacadas con la 0.9.197); el enjambre, que es una pieza suelta, sigue
  con el de ejemplo. Sin decidir: si el fondo propio del vídeo (el azul de los tramos de solo
  texto, de Adeo y del cierre) también pasa a ser su foto. **Y si el vídeo se publica, lleva su
  cara**: es su decisión.
- **El móvil en inglés.** La página del teléfono (`src-tauri/src/movil.html`) solo existe en
  español, así que en la pieza inglesa sus botones salen en español. Se arregla en la app, no aquí.
- **Las capturas.** Desde la segunda pasada son las rehechas de `c82fc96`: «PREDETERMINADA» en
  una línea, la Agenda bien escrita y el Lienzo con un enjambre, más `swarm.png` y `board.png`
  sueltas. Lo que queda: la del Panel saluda «Buenas noches, Sam.» porque se sacó de noche, y
  sus cifras dicen «0 te esperan». Se rehacen otra vez antes del lanzamiento, sobre el Adeorq
  terminado.
- **La vertical.** Una captura a pantalla completa no cabe de pie: pide su propio encuadre, y se
  hace cuando la horizontal esté aprobada.
- **La voz** y **la app trabajando de verdad** (los dos puntos del final de esta lista).

Lo que había pedido sobre el corte anterior (1:35, tres capítulos y diez pantallas), que es de
donde sale el guion de arriba:

- **Sin números en pantalla**: ni «01 · CABINA» en cada pantalla ni «1 · Trabaja» en los
  carteles.
- **Claro y sencillo** para quien no conoce Adeorq.
- **Dura de 45 a 60 segundos, y es una sola pieza** (Munir, 2026-10-13, con sus referencias ya
  medidas: «Solo la corta, de 45 a 60 segundos»). Deshace lo que había aquí: antes pidió ir «un
  poco más lento» que 1:35, y 2:17 le pareció demasiado lento. El corte que hay (un problema, la
  respuesta y tres capítulos con diez pantallas) no cabe en ese tiempo: hay que rehacer el guion
  entero, no recortarlo.
- **Solo funciones potentes**: fuera «te pregunta, y contestas con un clic» de la Cabina, que
  eso ya lo hace la terminal sola. Cada cosa que se enseñe, algo que la terminal no hace.
- **Las capturas se rehacen al final**, sobre el Adeorq terminado, y con ellas los `focos`.
- **Del vídeo de referencia que trajo** (el lanzamiento de otro lienzo de agentes, de 50 segundos)
  **quiere tres cosas** (Munir, 2026-10-13): el arranque solo con texto y en primera persona; la
  app REAL a pantalla completa, con la cámara viajando por dentro; y que sea una sola tirada, sin
  capítulos. Lo que NO marcó: las etiquetas de dos palabras con un punto delante, el cierre
  hablándole al que mira, que la música entre con el producto y sus 50 segundos.
- **Sus tres preferidos de las 21 referencias son Whop, FlyingPress y Shipper** (fichas 12, 02 y
  06 de la guía; los tres llevan una voz que explica). De Shipper hay dos vídeos en la carpeta y
  no dijo cuál: se entiende que el preferido es «Meet your AI employees» (06) y que el que
  descartó por «no es profesional» es el de memes (19). **Es una lectura, falta que la confirme.**
  Lo que dice que mira en ellos, con sus palabras: «las animaciones y la estructura y lo bien
  explicado que está el vídeo», los efectos, y «que el usuario entienda bien de qué trata el
  producto». **El color no se copia de ninguna referencia:** «tiene que tener una identidad de
  marca», la de Adeorq. El humor le vale porque «retiene audiencia».

**Lo que sale de sus 21 vídeos de referencia** (medidos el 2026-10-13; las fichas, los números y
la receta están en `C:\proyectos\_docs\Guia_Videos_SaaS.md`). El corte de prueba ya lo aplica,
menos lo último (los clips): es la primera vez que lo ve puesto, así que cada punto sigue
abierto a lo que diga.

- **La duración ya está decidida** (arriba: de 45 a 60 segundos). Sus referencias duran 34
  segundos de mediana y la más larga, 81.
- **De cuatro a seis funciones, no diez pantallas.** Ninguna referencia enseña más de seis, y
  ninguna va por capítulos. Encaja con «solo funciones potentes».
- **El orden que se repite:** el problema ocupa la primera quinta parte, después una frase que le
  da la vuelta, y el nombre llega cuando ha pasado un cuarto del vídeo (unos diez segundos). Este
  corte ya abre con el problema: lo que hay que medir ese día es en qué segundo llega la portada.
- **Cada función acaba en algo que se ve:** una cifra o lo que el agente ha hecho. Hoy acaban en
  una frase.
- **El texto entra palabra a palabra**, de dos a cinco por pantalla, con una sola en color. Lo de
  centrado, sin caja y sin numerar ya lo pidió, y en las 21 es así.
- **Una idea cada dos o tres segundos, y la imagen casi nunca se para más de dos y medio.** Su
  vídeo de WinshotX se queda quieto el 89 % del tiempo; las referencias, el 54 %.
- **La cámara es la transición** (entrar hasta el botón, salir a un plano general, entrar en lo
  siguiente). Es lo que ya le gustó de la tercera vuelta: se mantiene.
- **El sonido arranca bajo y la música entra con el nombre.** Las referencias van a −14 LUFS de
  mediana; diez de ellas se pasan de pico, y eso no se copia.
- **El cierre es una sola cosa:** logotipo, una línea y qué hacer. Es lo contrario de lo que él
  llamó «confuso».
- **Para los clips, la documentación de Remotion recomienda hoy `<Video>` de `@remotion/media`**
  en código nuevo, no el `OffthreadVideo` que nombra el punto de más abajo (que sigue existiendo).
  Hay quien lo probó y lo descartó porque los fotogramas no le salían iguales: ese día se prueban
  los dos con un clip y se mira un fotograma. Remotion va además por la 4.0.535 y aquí está la
  4.0.507.

- **Falta la voz.** El guion está escrito (el de la segunda pasada se lee en unos 35 segundos,
  y `pnpm guion` saca su página en `out/guion-voz.html`) y `voz.mjs` se probó de punta a punta con una voz sintética de
  Windows sobre el corte anterior, solo como ensayo (no está en ningún vídeo). **Con el guion
  nuevo `pnpm voz` está NO PROBADO.** Con la grabación de verdad hay que volver a
  medir la mezcla (`ffmpeg -af ebur128=peak=true`).
- **La función «trabajando» es una foto con cámara, marco y puntero, no una grabación.** Lo
  que se mueve dentro de una pantalla lo pone el vídeo; la app está quieta. Para enseñarla
  trabajando de verdad (una terminal escribiendo, una tarjeta cambiando de columna) hacen
  falta **clips**: el equipo de `scripts/laboratorio/capturas` ya abre la app en una casa de
  demostración y la maneja por el puerto de depuración, así que puede grabar además de
  fotografiar. Con un `cockpit.mp4` al lado de `cockpit.png`, a `escenas/3-Producto.tsx` le
  falta solo pintar un vídeo donde hoy pinta la imagen: los focos y lo demás valen igual.
- Los `focos` están medidos sobre las capturas en español. En las inglesas el reparto es el
  mismo, pero un botón puede medir distinto: si un clic cae fuera de su botón, es por eso.
