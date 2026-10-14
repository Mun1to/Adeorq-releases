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

Una sola pieza de **57,5 segundos**, de una tirada y sin capítulos (Munir, 2026-10-13: «Solo la
corta, de 45 a 60 segundos»). Está escrito por TIEMPOS y no por pantallas: qué se ve y qué se lee
en cada tramo. Cada tramo dura compases enteros de la música (2,5 s), así que cada corte cae en
el primer tiempo. La palabra en negrita es la única que va en el azul de la marca.

| Tiempo | Tramo | Qué se ve | Qué se lee | Qué suena |
|---|---|---|---|---|
| 0:00 – 0:10 | **El problema y el giro** | Solo texto, en el centro, sobre el fondo de la marca. Cada frase entra palabra a palabra y releva a la anterior. En primera persona | «Trabajo con **varios agentes** a la vez.» → «Y siempre **pierdo el hilo**.» → «¿Cuál ha **terminado**? ¿Cuál me **espera**?» → «Así que los junté en **una sola pantalla**.» | El colchón, bajo, y una tecla por palabra |
| 0:10 – 0:12,5 | **El nombre** | El logotipo solo; abre el ojo y es Adeo, que saluda | «Adeorq» | La campana, y entra el ritmo |
| 0:12,5 – 0:20 | **Cabina** | La app de verdad a pantalla completa. La cámara entra en la terminal de Claude Code y pasa a la de Codex | «Todos tus agentes, **lado a lado**» → «Claude Code, en su **terminal de verdad**» → «Codex, **justo al lado**» | Un golpe por frase |
| 0:20 – 0:25 | **Panel** | La cámara entra en las dos primeras cifras del Panel | «Quién trabaja. **Quién te espera.**» → «Tres trabajando, **nadie esperando**» | Ídem |
| 0:25 – 0:32,5 | **Lienzo** | La cámara entra en una terminal viva con sus notas y pasa al tablero de tarjetas | «Un **tablero infinito**» → «Terminales vivas y notas, **juntas**» → «El trabajo de cada agente, **en tarjetas**» | Ídem |
| 0:32,5 – 0:37,5 | **Cuentas** | La cámara entra en una cuenta con su cuota y el puntero pulsa «Terminal con esta» | «Tus cuentas, **tu cuota**» → «Cada terminal, con **la cuenta que elijas**» | El golpe y el clic |
| 0:37,5 – 0:42,5 | **Agenda** | La cámara entra en la ficha de los encargos programados | «Encargos que **se lanzan solos**» → «Tres programados, **a su hora**» | Un golpe por frase |
| 0:42,5 – 0:52,5 | **Adeo** | Adeo en grande, en el centro: saluda, teclea, llama y salta | «Y este es **Adeo**» → «Teclea cuando **trabajan**» → «Te llama si **te esperan**» → «Y salta cuando **terminan**» | Sus teclas, sus toques y la chispa |
| 0:52,5 – 0:57,5 | **El cierre** | Adeo celebrando, y una sola cosa que hacer | «Descárgalo gratis» · «**adeorq.com**» · «Windows y Linux» | El acorde del final |

Lo que cumple, y de dónde sale cada cosa:

- **El molde es «primero el problema»** (apartado 2.1 de `C:\proyectos\_docs\Guia_Videos_SaaS.md`):
  problema hasta el 17 %, giro, y el nombre en el segundo 10, que es donde lo ponen sus referencias.
- **Veintidós ideas en 57,5 segundos**, una cada 2,6 s (la mediana de sus 21 referencias es una
  cada 2,7). Ninguna frase pasa de siete palabras.
- **Cinco funciones y Adeo**, no diez pantallas. Las cinco son cosas que una terminal sola no
  hace: varios programas juntos, saber quién te espera sin abrir nada, el tablero, elegir cuenta
  viendo la cuota y los encargos que se lanzan solos. **Cuáles son «las potentes» lo eligió quien
  montó el corte, no Munir:** es lo primero que tiene que decir si cambia.
- **Los pasos entre tramos:** del texto al nombre, la máscara con la forma del logotipo; del
  nombre a la app, por el ojo de Adeo; entre pantallas, el hueco y el cambio de tarjetas, uno
  cada vez; a Adeo, el zoom con giro; y al cierre se atraviesa.
- **Va sin voz.** Lo que diría la voz está en `voz`, dentro de `src/guion.ts`, para el día que
  Munir la grabe; con ella cada tramo dura lo que su frase.

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
aumentos). Cada foco pide tres segundos: uno en un tramo de 5 y dos en uno de 7,5; si no
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
que volver a medir sus `focos`. Una captura que no sea 16:9 se ve entera, con bandas.

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

Medido el 2026-10-13 sobre `out/adeorq-es.mp4` (`ffmpeg -af ebur128=peak=true`): 57,5 s,
−16,2 LUFS de media y el pico en −1,7 dBFS. Los diez primeros segundos van a −24,5 (solo el
colchón y las teclas), el cuerpo a −15,9 y el cierre a −13,2: arranca bajo y la música entra con
el nombre. Sus referencias van a −14,2 de mediana; subirlo esos dos decibelios pasaría el pico
de −1, así que se queda ahí.

**Lo que le falta a este corte para ser el del lanzamiento:**

- **Que Munir diga si las cinco funciones son las suyas.** Cabina, Panel, Lienzo, Cuentas y la
  Agenda con sus encargos programados las eligió quien montó el corte.
- **Las capturas.** Son las de la 0.9.195 y se les nota: en la de Cuentas la etiqueta
  «PREDETERMINADA» sale partida en dos (la app lo arregló en `e097fd1`, la foto es anterior), la
  del Panel saluda con «Aún en pie, Sam.» y sus cifras dicen «0 te esperan», y ninguna enseña un
  enjambre, que es lo más potente que hay hoy.
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

- **Falta la voz.** El guion está escrito (el del corte de prueba se lee en unos 46 segundos,
  y `pnpm guion` saca su página) y `voz.mjs` se probó de punta a punta con una voz sintética de
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
