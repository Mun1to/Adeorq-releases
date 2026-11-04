# Guía de Adeorq (sin jerga)

> Repasada el 3 de noviembre de 2026 sobre la versión 0.9.239.
> Va pantalla por pantalla: qué se ve, qué hace y qué no hace. Si solo quieres una
> parte, salta por el índice.

## Índice

0. [Por qué usar Adeorq](#0-por-qué-usar-adeorq)
1. [Qué es Adeorq](#1-qué-es-adeorq)
2. [Las dos barras de arriba](#2-las-dos-barras-de-arriba)
3. [Las siete pestañas](#3-las-siete-pestañas)
4. [Panel](#4-panel)
5. [Cabina](#5-cabina)
6. [Chat](#6-chat)
7. [Decisiones](#7-decisiones)
8. [Lienzo](#8-lienzo)
9. [La cabecera de cada terminal](#9-la-cabecera-de-cada-terminal)
10. [Lo que sale dentro de una terminal](#10-lo-que-sale-dentro-de-una-terminal)
11. [Perfil](#11-perfil)
12. [Cuentas](#12-cuentas)
13. [Agenda](#13-agenda)
14. [Memoria](#14-memoria)
15. [Comandos](#15-comandos)
16. [Ajustes](#16-ajustes)
17. [Lo que puede hacer un programa de fuera](#17-lo-que-puede-hacer-un-programa-de-fuera)
18. [El Capataz y el Reparto](#18-el-capataz-y-el-reparto)
19. [En el móvil](#19-en-el-móvil)
20. [Modo emisión](#20-modo-emisión)
21. [Actualizar sin perder las terminales](#21-actualizar-sin-perder-las-terminales)
22. [Windows, Linux y Mac](#22-windows-linux-y-mac)
23. [Clic derecho y globos de ayuda](#23-clic-derecho-y-globos-de-ayuda)
24. [Atajos de teclado](#24-atajos-de-teclado)
25. [Leyenda de colores](#25-leyenda-de-colores)
26. [Dónde guarda tus cosas](#26-dónde-guarda-tus-cosas)
27. [Glosario en cristiano](#27-glosario-en-cristiano)
28. [Dudas frecuentes](#28-dudas-frecuentes)
29. [Lo que aún no hace](#29-lo-que-aún-no-hace)

---

## 0. Por qué usar Adeorq

Adeorq es una ventana donde trabajas con los agentes de programación que ya usas
(Claude Code, Codex, Gemini y compañía) en terminales de verdad, con todos tus
proyectos a un clic. Estas son las razones, en orden de peso:

**1. Lo nuevo llega antes a la terminal.** Opus 5 se pudo usar en la terminal antes
que en la app de escritorio, y el millón de contexto tardó bastante más en llegar
a ella. Trabajando por terminales estrenas las cosas el día que salen.

**2. Ves todo tu trabajo de golpe.** Tus proyectos y todas sus sesiones, ordenadas
por proyecto, con cuáles están vivas y cuáles te están esperando.

**3. Varias a la vez, de verdad.** Puedes tener muchas conversaciones trabajando en
paralelo, cada una en su carpeta, y ver cuál ha terminado sin abrirlas una a una.

**4. Archivar no te borra el trabajo.** Antes de archivar una sesión, Adeorq mira si
el proyecto tiene cambios sin guardar en git y te los enseña. Archivar nunca
borra nada y se deshace.

**5. Reparte el trabajo y mira tu cuota.** El Capataz te monta el tablero a partir de
una frase, y elige el modelo y la cuenta según lo que te queda de cada
suscripción. Tú das el OK.

**6. Es tuyo.** Tu idioma, tus temas, tu fondo, tus skills, tus atajos del lienzo, tus
cuentas y las partes de Adeorq que quieres usar. Y todo lo que guarda vive en tu
equipo.

**7. Es ligero.** Está hecho en Rust con Tauri: el instalador pesa pocos megas, arranca
al instante y las terminales se dibujan con la tarjeta gráfica.

### El mapa de la ventana

<svg viewBox="0 0 720 330" width="100%" role="img" aria-label="Mapa de la ventana de Adeorq">
  <rect x="1" y="1" width="718" height="328" rx="12" fill="none" stroke="currentColor" stroke-opacity="0.35"/>
  <rect x="1" y="1" width="718" height="42" rx="12" fill="currentColor" fill-opacity="0.07"/>
  <text x="18" y="27" font-size="13" fill="currentColor" font-weight="700">Adeo</text>
  <text x="62" y="27" font-size="11" fill="currentColor" fill-opacity="0.85">Panel  Cabina  Chat  Decisiones  Lienzo  Perfil  Ajustes</text>
  <text x="452" y="27" font-size="12" fill="currentColor" fill-opacity="0.6">Pulso</text>
  <text x="510" y="27" font-size="12" fill="currentColor" fill-opacity="0.6">musica</text>
  <text x="580" y="27" font-size="12" fill="currentColor" fill-opacity="0.6">Emision</text>
  <text x="654" y="27" font-size="12" fill="currentColor" fill-opacity="0.6">orbe</text>
  <text x="6" y="58" font-size="11" fill="currentColor" fill-opacity="0.55">1</text>
  <rect x="14" y="62" width="160" height="252" rx="10" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-opacity="0.25"/>
  <text x="26" y="84" font-size="12" fill="currentColor" font-weight="600">Workspaces</text>
  <rect x="26" y="96" width="136" height="30" rx="7" fill="currentColor" fill-opacity="0.09"/>
  <text x="34" y="115" font-size="11" fill="currentColor" fill-opacity="0.8">Orquio</text>
  <rect x="130" y="103" width="24" height="16" rx="5" fill="currentColor" fill-opacity="0.2"/>
  <rect x="26" y="132" width="136" height="22" rx="6" fill="currentColor" fill-opacity="0.05"/>
  <text x="36" y="147" font-size="10" fill="currentColor" fill-opacity="0.7">sesion de ayer</text>
  <rect x="26" y="160" width="136" height="22" rx="6" fill="currentColor" fill-opacity="0.05"/>
  <text x="36" y="175" font-size="10" fill="currentColor" fill-opacity="0.7">sesion que espera</text>
  <text x="26" y="206" font-size="11" fill="currentColor" fill-opacity="0.55">2</text>
  <rect x="186" y="62" width="340" height="122" rx="10" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-opacity="0.25"/>
  <rect x="186" y="62" width="340" height="24" rx="10" fill="currentColor" fill-opacity="0.09"/>
  <text x="198" y="79" font-size="11" fill="currentColor" fill-opacity="0.85">sesion   79%   Opus 5 high   Orquio</text>
  <text x="198" y="118" font-size="11" fill="currentColor" fill-opacity="0.7">el agente trabajando aqui dentro</text>
  <rect x="186" y="192" width="340" height="122" rx="10" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-opacity="0.25"/>
  <rect x="186" y="192" width="340" height="24" rx="10" fill="currentColor" fill-opacity="0.09"/>
  <text x="198" y="209" font-size="11" fill="currentColor" fill-opacity="0.85">terminal</text>
  <text x="336" y="252" font-size="11" fill="currentColor" fill-opacity="0.55">3</text>
  <rect x="538" y="62" width="168" height="252" rx="10" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-opacity="0.25"/>
  <text x="550" y="84" font-size="12" fill="currentColor" font-weight="600">Uso · Skills · Archivos</text>
  <rect x="550" y="96" width="144" height="26" rx="7" fill="currentColor" fill-opacity="0.09"/>
  <text x="558" y="113" font-size="10" fill="currentColor" fill-opacity="0.75">/frontlaxweb</text>
  <rect x="550" y="128" width="144" height="26" rx="7" fill="currentColor" fill-opacity="0.09"/>
  <text x="558" y="145" font-size="10" fill="currentColor" fill-opacity="0.75">/fin</text>
  <text x="550" y="206" font-size="11" fill="currentColor" fill-opacity="0.55">4</text>
</svg>

1. **La barra de la app**: Adeo, las siete pestañas, tus objetivos, el Pulso, la música, el modo emisión y el orbe del Capataz.
2. **Workspaces**: tus proyectos y, dentro, sus sesiones.
3. **Las terminales**: cada recuadro es un agente o una consola trabajando.
4. **La franja de la derecha**: tu uso, tus skills, los archivos del proyecto y un navegador.

---

## 1. Qué es Adeorq

Tu taller de vibe coding: una ventana donde ves todos tus proyectos y todas tus
sesiones, y desde donde las abres, las retomas y les hablas, sin depender de la
app de escritorio de ningún proveedor. Adeorq no incluye ni revende ningún
modelo: usa las suscripciones y las claves que ya tienes.

**Cómo se instala.** En Windows es un programa normal (menú Inicio, anclable a la
barra de tareas). En Linux hay AppImage, `.deb` y `.rpm`; el Mac se cuenta en el
[punto 22](#22-windows-linux-y-mac). Cuando hay versión nueva avisa y se instala con
un clic: lo que pasa con tus terminales abiertas está en el
[punto 21](#21-actualizar-sin-perder-las-terminales).

### La primera vez que se abre

Sale una bienvenida de seis pantallas, y puedes **Saltar** cuando quieras:

1. **Bienvenido a Adeorq**: cómo te llamas (para el saludo) y el idioma.
2. **Dónde viven tus proyectos**: la carpeta que se lee para saber qué proyectos
   tienes. Cada subcarpeta suya es uno. Al elegirla te dice cuántos ve dentro. Si
   no los tienes en una sola carpeta, **No los tengo en una sola carpeta**.
3. **Tus agentes**: marcas los programas que usas, de los que encuentre instalados,
   y puedes **Recoger las sesiones que ya tienes**.
4. **¿Qué quieres usar?**: las partes de Adeorq que quieres encendidas (Cabina,
   Lienzo, Memoria y Chat). Se explica en el [punto 16](#16-ajustes).
5. **El aspecto**: el tema, que se aplica mientras lo eliges.
6. **Listo**: un resumen. **Entrar directamente** o **Enséñame las funciones**, que
   lanza un recorrido señalando cada parte de la ventana.

Todo se repite cuando quieras en **Ajustes › Ayuda**. Tu nombre y la carpeta de
proyectos se cambian en **Ajustes › Adeorq › Tú y tus proyectos**.

---

## 2. Las dos barras de arriba

Hay dos barras en la parte superior y son cosas distintas. Regla para no liarte:
si están Adeo y las pestañas, es la barra de la app; si pone el nombre de una
sesión, es la de una terminal.

### La barra de la app (arriba del todo, una sola)

De izquierda a derecha:

| Elemento | Qué es |
|---|---|
| **Adeo, la mascota** | Es la campana de avisos y va sola, sin el nombre de la app al lado. Su postura dice lo más urgente que pasa, por este orden: te llama si una terminal te espera, se queda con la duda si hay una decisión esperándote, celebra si alguien terminó sin que lo hayas visto, se apura si un encargo programado se ha parado, teclea si tus agentes trabajan, baila si suena música, se queda quieta si no pasa nada y duerme si no hay ninguna terminal abierta. Si la pulsas da un brinco, y a la tercera seguida le sale un corazón. El número que lleva encima son los avisos sin ver. Al pulsarla sale **Avisos**, con qué terminal es, si «terminó» o «te espera» y hace cuánto; una fila te lleva a esa terminal. **La lista se limpia sola**: lo que te esperaba se va cuando le contestas o cierras la terminal, y lo que terminó, cuando cierras la lista o entras en esa terminal. |
| **Las siete pestañas** | Panel, Cabina, Chat, Decisiones, Lienzo, Perfil y Ajustes. Si la ventana es estrecha se quedan en el icono y el nombre sale al pasar el ratón. Se explican en el [punto 3](#3-las-siete-pestañas). |
| **Un número en una pestaña** | En Cabina y Lienzo, cuántas terminales tienes abiertas ahí. En Decisiones, cuántas te esperan (en ámbar). |
| **Objetivos de hoy** | Un icono que abre un panel flotante con lo que quieres dejar cerrado hoy. Se arrastra donde quieras, se pliega a solo el contador (por ejemplo 2/3) y se cierra con Esc. Más en el [punto 13](#13-agenda). |
| **El Pulso** | Una píldora con tres cifras: lo que gasta Adeorq con sus agentes en CPU, en memoria (RAM) y cuántos agentes hay vivos (AG). Se pone ámbar cuando Adeorq usa un cuarto o más de la CPU o de la memoria del equipo, y roja cuando el equipo entero va al 90 % o Adeorq por sí solo pasa del 50 % de CPU. Un clic abre **Lo que gasta Adeorq**, con el detalle. Mide el árbol entero de procesos, no solo la ventana. |
| **La tira de música** | Solo aparece si algo suena en el PC: título, artista, anterior, pausa y siguiente. El volumen se queda en el mezclador del sistema. En Linux y Mac no está. |
| **Emisión** | El escudo para retransmitir, solo con icono. Ctrl+Mayús+E lo enciende. Detalle en el [punto 20](#20-modo-emisión). |
| **El orbe** | Llama al Capataz (en algunos textos de la app, «el Asistente»). Ctrl+Mayús+A abre y cierra; Ctrl+Mayús+M lo abre ya escuchándote. Más en el [punto 18](#18-el-capataz-y-el-reparto). |
| **Tres iconos más** | Solo en la Cabina y con más de una terminal: **Minimizar todas** (siguen vivas en la tira de abajo y pasa a **Traer todas**), **Disposición** (una rejilla de hasta 4 por 4, o «una grande y el resto al lado») y **Cerrar todas**, que pregunta antes porque mata a sus agentes y te dice cuáles están trabajando. |

La **actualización** ya no es una barra de arriba: es una tarjeta al final de la
barra lateral ([punto 21](#21-actualizar-sin-perder-las-terminales)).

### La barra de cada terminal (una por recuadro)

Cada terminal lleva su propia cabecera con el nombre de la sesión, el contexto, el
modelo y el proyecto. Está explicada campo por campo en el
[punto 9](#9-la-cabecera-de-cada-terminal).

---

## 3. Las siete pestañas

- **Panel**: el inicio. Adeo, una caja para pedirle cosas, tus proyectos y tu uso.
- **Cabina**: donde se trabaja. Proyectos a la izquierda, terminales en el centro,
  una franja de herramientas a la derecha.
- **Chat** (beta): las mismas conversaciones de la Cabina, leídas como un chat, y
  arriba un conserje que abre sesiones por ti.
- **Decisiones**: lo que tus agentes te preguntan con opciones, para contestar en
  el momento.
- **Lienzo**: un tablero libre donde las terminales se mueven, se conectan con
  flechas y conviven con notas, dibujo y herramientas.
- **Perfil**: tú (nombre, @ y foto), tu uso y cuatro secciones que viven dentro:
  **Cuentas**, **Agenda**, **Memoria** y **Comandos**.
- **Ajustes**: cómo se ve y cómo se comporta todo, y la ayuda.

Las terminales **no se cierran al cambiar de pestaña**: siguen vivas.

Dos cosas que puedes cambiar a tu gusto, en Ajustes › Aspecto:

- **La cabecera**: quitar, volver a poner y reordenar las pestañas. Quitar una solo
  la esconde: sigue disponible con Ctrl+K. Ajustes no se puede quitar.
- **Partes de Adeorq**: apagar enteras la Cabina, el Lienzo, la Memoria o el Chat
  ([punto 16](#16-ajustes)).

---

## 4. Panel

Lo primero que ves al abrir. A la izquierda, **Adeo** grande con un saludo según la
hora y tu nombre, y debajo una línea que dice qué está pasando:

- Si algo te espera: «“X” te pregunta algo» o «“X” y N más te esperan», con el botón
  **Contestar**, que te lleva a esa terminal.
- Si todo va bien: «N sesiones en marcha y nada pendiente de ti», o «Todo tranquilo.
  Nada corriendo ahora mismo.» Un clic te lleva a la Cabina.

Debajo está **la caja para pedirle algo a Adeo** con tus palabras («abre lo de
Orquio», «repasa el login», «sube lo de hoy»). Al enviarla con Intro o **Enviar**
se abre una conversación nueva en el [Chat](#6-chat) que ya lleva tu pedido;
**Dictar** suma lo que digas, si tienes la voz local instalada.

A la derecha:

- **Tus proyectos**: primero los que tienen sesión esta semana (los que te esperan,
  luego los que trabajan y luego por última actividad), cada uno con su logo y
  «te pregunta algo», «una trabajando», «N trabajando» o hace cuánto. Sin
  actividad se ven ocho, con **Ver los N** y **Ver menos**. Un clic te lleva a la
  Cabina con ese proyecto desplegado.
- **Nuevo proyecto**, al pie: pones el nombre y **Crear**. Adeorq crea la carpeta
  con `AGENTS.md` (tus reglas para los agentes), `docs/METAS.md`, `.gitignore` y
  git ya iniciado. Si ya tienes un modelo propio de `AGENTS.md`, déjalo en
  `plantilla-agents.md` dentro de la carpeta de datos de Adeorq
  ([punto 26](#26-dónde-guarda-tus-cosas)): se usa en lugar del de fábrica, y
  `{name}` pone el nombre del proyecto.
- **Tu uso**: los tokens del mes, «N hoy · N días seguidos · tu récord», y casillas
  de las últimas 26 semanas. **Ver tu uso** lleva al [Perfil](#11-perfil).

**Retomar sesiones que ya tienes** no está en el Panel sino en el **＋** de la barra
lateral de la Cabina ([punto 5](#5-cabina)).

---

## 5. Cabina

Tres zonas:

```
+----------------+--------------------------------------+-----------+
|  IZQUIERDA     |  CENTRO                              |  DERECHA  |
|  Workspaces    |  Las terminales                      |  Uso      |
|  (proyectos y  |  Cada recuadro = una conversación    |  Skills   |
|  sus sesiones) |  o una consola trabajando            |  Archivos |
+----------------+--------------------------------------+-----------+
```

### 5.1 Izquierda: la barra de proyectos

La misma barra se ve en el Lienzo. De arriba abajo:

- **Cabecera «Workspaces»**: el **＋** (*Abrir una sesión*: eliges carpeta, programa,
  modelo y cuenta), tres formas de ver la barra (logo y nombre, solo los logos en
  grande, o encogida del todo en una tira), el botón de archivadas con su número y
  **Releer proyectos y sesiones** (se relee sola cada 45 segundos).
- **Buscador** *Filtrar proyectos y sesiones*: perdona las tildes y admite las
  palabras en cualquier orden. Con texto escrito se despliega todo.
- **Cada proyecto** es una tarjeta con su logo (Adeorq lo busca solo en la carpeta,
  o dibuja sus iniciales), su nombre, una flecha con el número de sesiones, una
  insignia con las recientes y otra roja con las que te esperan. Un marco verde con
  brillo indica que un agente está escribiendo ahora. Clic: despliega o pliega.
- **Al pasar el ratón** salen botones para abrir una sesión nueva en ese proyecto:
  los programas que elijas en [Cuentas](#12-cuentas) (de fábrica Claude y
  Antigravity) y uno por cada cuenta extra.
- **Clic derecho en un proyecto**: sesión nueva de Claude Code, una terminal normal,
  Antigravity, cada otro programa que tengas instalado, una entrada por cuenta
  extra, **Abrir sus N sesiones a la vez** (con el tope de Ajustes › Terminales) y
  las opciones de nombre, logo y orden. **Quitar de Adeorq** no borra nada; **Borrar
  la carpeta del disco…** la manda a la papelera y te pide escribir su nombre.
- **El orden** puede ser «Por antigüedad» o «Primero el que te reclama», y los
  proyectos se arrastran a mano (**Volver al orden automático** lo deshace).
  Arriba van los **Fijados**; lo que quitas de la barra queda en **Ocultos**.
- **Lo antiguo se esconde**: lo que lleva más de un mes sin tocarse sale como «N más
  antiguas» en cada proyecto, y puedes verlas.
- **El borde derecho** se arrastra para ensancharla y se recuerda.

**El ＋ también retoma lo que ya tenías.** Además de abrir algo nuevo, te deja volver
a conversaciones que ya empezaste: lista entera con buscador, **Marcar las que no
tengo** y **Ponerlas en la barra (N)**. **Traer no abre nada**: lo que marques
aparece en la barra y se queda esperando, porque cada terminal abierta gasta
memoria. Salen también las viejas (las de más de una semana no aparecen en otras
pantallas), y las que ya tienes salen marcadas y sin casilla.

### 5.2 Cada sesión dentro de un proyecto

Una sesión es una conversación guardada. La barra lista las de Claude Code, Codex
y Pi, cada una con el logo de su programa. En su fila ves un punto de estado, el
título, la cuenta si no es la principal, el rol si es de una cuadrilla, y hace
cuánto fue.

- Punto **verde**: abierta ahora mismo.
- Punto **ámbar**: el agente dejó una oferta o una pregunta esperándote.
- Punto **apagado**: quedó a medias. Más apagado todavía: nada pendiente.
- El punto se **vacía** cuando ya miraste lo último que hizo.

Además, la fila entera se tiñe cuando espera por ti: **ámbar** si terminó
ofreciendo algo y **rosa o rojo** si te dejó una pregunta con opciones.

**▣ N** en la fila son los subagentes que esa sesión tiene trabajando ahora
mismo. Pasa el ratón y te dice cuántos hay y cuántos ha desplegado en total.

**Clic en una sesión = se retoma en una terminal**, con toda su memoria. El botón
**⋯** o el clic derecho ofrecen: *Retomar la sesión aquí*, *Fijar arriba*,
*Renombrar* (se guarda donde la app oficial guarda los títulos), *Mover a grupo…*,
*Sacarla de este proyecto*, *Hacer un proyecto de «X»*, *Archivar* y *Borrar la
sesión* (va a la papelera). Los grupos se crean arrastrando una sesión sobre otra;
tienen nombre y color, y disolverlos no toca las sesiones.

**Archivar** mira antes si el proyecto tiene archivos sin guardar en git y te los
enseña con su lista. Nunca borra nada y se deshace con el botón de archivadas.

### 5.3 Centro: el mosaico de terminales

Las terminales se reparten en columnas (hasta tres al partir) y se apilan. El borde
entre ellas se arrastra para repartir el ancho o el alto. Las que **apartas** bajan
a una tira, siguen trabajando, y cada ficha lleva el logo del programa, el nombre,
las tres letras de la cuenta, la memoria que ocupa y una ✕ (que pide un segundo
clic si el agente está trabajando). Sin terminales, la Cabina dice «La cabina está
lista».

Cada recuadro es una terminal de verdad con su programa dentro: Claude Code,
Codex, Gemini, Antigravity, una consola normal o cualquiera de los programas de
[Cuentas](#12-cuentas). Los Claude nuevos nacen con el modo de permisos que elijas
en Ajustes › Terminales (de fábrica, ediciones automáticas); Mayús+Tab cambia de
modo dentro.

**Copiar y pegar como en cualquier app.** Ctrl+V pega (también el clic derecho),
Ctrl+C copia si hay selección y, si no la hay, sigue siendo el «corta lo que está
pasando» de siempre. **Pegar una imagen** la guarda y escribe su ruta entre
comillas, que es lo que el agente sabe leer. **Arrastrar cualquier archivo** encima
de una terminal escribe su ruta real, sin Intro y sin copiarlo. **Ctrl+F** busca
dentro de la terminal.

Un **archivo abierto** desde el panel de Archivos es otra pieza del mosaico: un
editor con pestañas (Ctrl+S guarda; si el archivo cambió en el disco, te deja
elegir entre traer lo nuevo o guardar lo tuyo encima).

Una **cuadrilla** (varias terminales de un mismo reparto) sale marcada con su color
y con un «N/total», y tiene un tablero encima del mosaico.

### 5.4 Derecha: Uso, Skills, Archivos y Navegador

La franja de iconos está siempre. Cada icono abre una cara y, si pulsas el de la
cara abierta, se esconde.

- **Uso**: una batería por cada cuenta, la más gastada arriba, con las barras de las
  cinco horas, de la semana y de cada modelo, y cuándo se renueva cada una. Los
  programas que no publican su gasto salen con «Sin datos de gasto». **Volver a
  preguntar** no gasta cuota.
- **Skills**: tus comandos de `~/.claude/skills`, con buscador y agrupados en «Las
  que más usas», «Las demás», «Las tuyas» y «De claude.ai y plugins». Un clic la
  manda a la terminal que tienes delante; arrastrarla sobre otra la pega en esa.
- **Archivos**: el árbol del proyecto de la terminal que tienes delante, con el color
  de lo que git ve cambiado. Con el clic derecho abres, creas archivos y carpetas,
  copias la ruta, lo enseñas en el explorador, renombras o mandas a la papelera, y
  nunca pisa uno que ya existe. Para buscar un texto en el proyecto: **Ctrl+K ›
  Buscar en los archivos**.
- **Navegador** (separado por una raya): un Chromium de verdad con pestañas, que
  también sirve para ver tu web mientras la programas. Ctrl+T abre pestaña, Ctrl+W
  la cierra y Ctrl+L va a la barra de dirección. Tiene un modo para editar la
  página haciendo clic y guardarlo en el código. En Linux y Mac sale una versión
  más sencilla ([punto 22](#22-windows-linux-y-mac)). Si una terminal levanta un servidor,
  Adeorq pregunta **¿Abro {url} en la web?** (se apaga en Ajustes › Terminales).

**Qué hace el agente en tus archivos.** Encima del árbol, una tarjeta dice lo último
que importa: «Claude está editando» con su archivo, «Claude editó 2 archivos» con
lo que suman, o «Claude hizo commit de 2 archivos» con el hash, más la rama y lo
que llevas sin subir. Debajo, la lista de lo que ha tocado: **Leyendo** y **Abierto**
en morado, **Editando** y **Editado** en naranja con sus líneas, **En el commit** en
verde. Sale de lo que el propio programa deja escrito en su historial, sin gastar
un token, así que depende del programa: **Claude Code** apunta lo que lee y lo que
edita, **Codex** solo lo que edita (y el panel lo avisa), y con los demás solo ves lo
que dice git. Las ediciones de un subagente no salen.

---

## 6. Chat

El Chat (en beta) tiene dos partes:

- **Arriba, el conserje.** «Hablar con el conserje» abre un chat con Adeo: le dices lo
  que quieres, él lo parte en trabajos y abre una sesión por cada uno. Las sesiones
  salen como pestañas encima del hilo (punto verde: trabajando; ámbar: te pregunta;
  naranja: terminó) y un clic entra en ellas. Cada sesión que abre deja una
  tarjeta con su programa, su modelo, qué se le encargó y, si lo eligió el router,
  por qué.
- **Debajo, tus sesiones de siempre**, por días, con **Nueva conversación** y un
  buscador. Cada sesión se lee como una conversación (**Limpio**) o se abre en crudo
  (**Terminal**), y lo que escribes abajo baja a la misma terminal. La caja lleva
  pastillas de modelo («Automático» deja que lo elija el router), de esfuerzo y un
  anillo con el contexto.

Lo que conviene saber:

- El conserje solo abre sesiones en carpetas reales de tus proyectos, solo escribe en
  las terminales que abrió él y como mucho abre cuatro por mensaje.
- Cada mensaje al conserje es una llamada corta con tu suscripción (Claude, o el
  programa que elijas en sus pastillas), no con una clave de API. Las sesiones que
  abre gastan su propia cuota. Al conserje le puedes pulsar **Mejorar** para que
  reescriba tu mensaje sin añadir nada, y **Parar** mientras piensa.
- El router lee reglas que escribas en tus notas de la memoria de la casa, con la
  forma `router: palabras -> modelo / esfuerzo / cliente` ([punto 14](#14-memoria)).
- Apagar la parte «Chat» también quita la caja del Panel. No apaga el conserje del
  móvil, que tiene su propio interruptor ([punto 19](#19-en-el-móvil)).

---

## 7. Decisiones

Cuando un agente necesita que elijas algo, te lo pregunta aquí en lugar de por el
chat. La pestaña lista **Te esperan** y **Anteriores**. Cada pregunta trae de dos a
seis opciones numeradas (la recomendada lleva «Recomendada», y ninguna viene
marcada) y una caja **Otra cosa, con tus palabras**.

- **Enviar respuesta** espera cinco segundos con **Deshacer** y luego la teclea en
  la terminal que preguntó, si sigue siendo la misma. Si no, el agente la lee cuando
  vuelva a mirar.
- **Descartar** la aparta sin contestar y avisa a la terminal que esperaba.
- Las anteriores se borran solas a la semana.
- El aviso es una cuenta ámbar en la pestaña y Adeo con cara de duda. En el móvil
  emparejado llega un aviso y se contesta desde allí
  ([punto 19](#19-en-el-móvil)).

---

## 8. Lienzo

La Cabina te da un mosaico ordenado. El Lienzo te da un tablero libre: las
terminales se colocan donde quieras, se agrandan a mano y **se conectan con
flechas**. Conviven con notas, dibujo y herramientas pequeñas.

El tablero se **guarda solo** (un momento después de cada cambio) y vuelve al abrir
Adeorq. Las terminales vuelven según el ajuste **Recuperar las terminales al
abrir**; lo demás (piezas, flechas con su encargo, notas, dibujo) vuelve siempre.
El Lienzo tiene sus propias terminales: las de la Cabina no se mueven ni se cierran.

### La barra de arriba

- **Elige proyecto**: decide en qué carpeta nace lo que sueltes.
- **✦ Claude**, **>_ Terminal** y **◈ Antigravity**: abren una sesión en ese proyecto.
- **Tres modos**: **Terminales** (solo el trabajo), **Dibujo** (la pizarra) y **Todo**
  (los dos, de fábrica). Cambiar de modo no pierde el dibujo.
- **Herramientas de dibujo**, en la misma barra y solo en los modos Dibujo y Todo:
  mover, rodear varias, lápiz, flecha, línea, recuadro, rombo, elipse, texto y goma.
- **La rejilla**: hace que lo que muevas caiga en la casilla más cercana.
- **＋ Añadir**: el menú de piezas (el clic derecho en un hueco del tablero abre el
  mismo, con *Coger todo el lienzo*).
- **⌘ Contar el tablero**: le cuenta a la terminal que tienes enfocada qué más hay en
  el lienzo y qué flechas salen de dónde.
- **Lienzo ▾**: guardar el lienzo a un archivo, abrir uno (te pregunta si solo el
  dibujo y las piezas o también las terminales, y se suma a lo que ya hay), exportar
  el dibujo a PNG o SVG, encajar todo en la pantalla y borrar todo el dibujo.
- **El «?»** abre una ayuda corta de cómo va el lienzo.

### Las piezas que puedes poner

- **Tu trabajo**: **Nota**, **Carril**, **Enjambre**, **Galería**, **Ventana de
  localhost**, **Tablero del trabajo** y **Chat con un modelo**.
- **Cacharros**: Pomodoro (25 minutos de concentración y 5 de descanso), cronómetro,
  cuenta atrás, calculadora y un calendario con notas por día.
- **Utilidades** («nada sale de aquí»): JSON, expresión regular, comparar textos,
  codificador, hash, contraseñas, identificadores, color y contar texto.

Qué es cada una de las de tu trabajo:

- **Nota** (Alt+N): un post-it con casillas que por dentro es un archivo `.md` de
  verdad, así que un agente puede marcar la casilla cuando termina. Su botón de
  lanzar la manda a una terminal abierta, abre una sesión nueva en el proyecto que
  elijas o, si quedan dos tareas o más, se las pasa al Capataz para que las reparta.
  Una nota vacía te ofrece las **fichas** del proyecto: cada `.md` que guardes en
  `docs/fichas` es una receta de pasos que repites, y al elegirla la nota nace con
  esos pasos como casillas. Cualquier nota se puede **Guardar como ficha**.
- **Carril**: una franja de color con nombre que separa un espacio de trabajo. Va por
  debajo de las terminales; se renombra con doble clic y se quita con su ✕ sin cerrar
  nada.
- **Galería** (Alt+I): todo lo que has pegado alguna vez en Adeorq; sueltas una imagen
  en el lienzo. Con Ctrl+V sobre el lienzo pegas una captura como pieza y puedes
  anotarla encima.
- **Ventana de localhost** (Alt+L): una página web dentro del lienzo, con barra de
  dirección y atajos a los puertos de siempre. Hay que dar «Clic para usar la
  página» y luego soltarla para poder mover la pieza. Si una web prohíbe abrirse en
  un marco, lo dice.
- **Tablero del trabajo**: un kanban con cuatro columnas. **Por hacer** lo escribes
  tú; **Trabajando**, **Te espera** y **Hecho** se llenan solas con el estado de cada
  terminal. Soltar una tarjeta en «Trabajando» abre una terminal con ese encargo, y
  puedes marcar varias y repartirlas juntas.
- **Chat con un modelo**: una conversación con un modelo por tu clave de OpenRouter,
  que no gasta tu suscripción y enseña lo que cuesta.

### Mover, agrandar y navegar

- **Mover una terminal**: se agarra por su cabecera. Por dentro el ratón es de la
  terminal.
- **Agrandar**: se estira por cualquier borde o esquina, sin seleccionarla antes.
  El botón de **Maximizar** de su cabecera la pone a lo que se ve del lienzo y el
  mismo botón la devuelve exacta a su sitio.
- **Moverte por el tablero**: arrastra el fondo. La rueda hace zoom (del 30 al
  140 %); dentro de una terminal la rueda es para su scroll. Abajo tienes el mapa
  en miniatura y los botones de zoom. Con el zoom por debajo del 55 %, cada
  terminal enseña su «tapa» (logo, nombre y proyecto) y deja de pintar su
  contenido, aunque sigue trabajando.
- **Coger varias**: arrastrar con el **botón derecho** rodea piezas y dibujo a la
  vez; con Mayús suma. Sale una barra «N cogidas» con *Todo*, *Borrar* y *Soltar*.
- **Cada terminal lleva el color de su proyecto**: una franja, la cabecera teñida y
  el logo del proyecto de marca de agua. **Dónde nace** una terminal nueva: dentro
  del carril que se llame como su proyecto; si no hay, a la derecha de la última; y
  si no cabe, debajo de todas con la cámara yendo a buscarla.
- **La barra de sesiones** de la Cabina también está en el Lienzo; lo que abres desde
  ella nace en el tablero.

### Las flechas: el encadenado

Esto es lo que hace que el lienzo valga la pena.

1. Arrastra desde el punto del borde derecho de una tarjeta hasta el punto izquierdo
   de otra: nace una flecha. Una flecha también puede salir de una nota.
2. **Clic en la flecha** para escribir el encargo: qué tiene que hacer el segundo
   agente con lo que produzca el primero. Ahí está la casilla *Enviar solo, sin
   preguntarme*.
3. Cuando el primer agente **termina su turno**, abajo aparece «A terminó → B» con
   **Pasar el relevo**: Adeorq escribe en el segundo tu encargo MÁS la última
   respuesta del primero, y lo envía. El lápiz lo deja escrito sin enviar, por si
   quieres retocarlo.

Los frenos: un relevo automático se detiene si el agente de origen te preguntó algo,
y una flecha automática que pasa el relevo tres veces en diez minutos se vuelve a
manual. Si la flecha que dibujas cierra un círculo, Adeorq avisa, pero no lo
prohíbe. Sin marcar la casilla de automático, nada se manda sin que tú lo pulses.

### Los enjambres: varias sesiones y un solo chat

Un enjambre junta sesiones que **ya tienes abiertas** en una sola pieza: arriba su
nombre, debajo una fila por sesión y, al final, un chat con una caja para hablarles
a todas. Caben hasta doce.

- **Se crea de dos formas**: con **＋ Añadir › Enjambre**, marcando las sesiones que
  entran, o arrastrando una terminal **encima de otra** y aguantando un instante:
  cuando la de debajo se enciende con un marco, suéltala. La que arrastraste vuelve
  a su sitio. Una consola no entra: solo se juntan sesiones de un agente.
- **Cada enjambre tiene su Adeo, de un color** (azul, verde, violeta, rosa…), para
  distinguir uno de otro de un vistazo.
- **Lo que escribes va a Adeo**, no a las terminales. Adeo piensa con un modelo
  pequeño (Haiku), decide a qué sesión le toca, se lo reescribe para que se entienda
  y te dice a quién se lo ha mandado. Si nombras una (por su nombre o su proyecto)
  va a esa; si dices «a todas», a todas. No abre sesiones nuevas.
- **Lo que contesta cada sesión vuelve al chat** con su nombre.
- **El ojo** de la cabecera guarda las terminales del enjambre debajo de la tarjeta:
  siguen trabajando, solo dejan de ocupar sitio. **Sacar una** la deja viva a su
  lado, fuera del grupo. **Deshacer el enjambre** (su ✕, con doble toque) borra el
  chat del grupo y deja las terminales. Si lo acabas de juntar sin querer, la pieza
  ofrece **No juntarlas**.

Tres cosas que conviene saber: Adeo sabe si cada sesión trabaja o ha terminado y
cuánto contexto lleva, y con eso elige; **solo Claude Code y Codex** cuentan cómo van
y solo de ellos se trae la respuesta al chat (una sesión de otro programa entra,
pero su fila dice que no se sabe); y **a una sesión que te está preguntando algo no
le llega un reparto**, porque caería en su menú. Cada mensaje a Adeo gasta una
llamada corta de tu suscripción de Claude; juntar las sesiones no gasta nada.

### Dibujar encima

Todo se dibuja **encima** de las terminales sin molestarlas: con la mano puesta, el
ratón vuelve a ser de ellas.

- **Las flechas se pegan.** Si acabas una flecha sobre una terminal, se queda
  enganchada y la sigue cuando la mueves. La pieza a la que se va a pegar se
  contornea en verde.
- **Se alinea solo.** Al dibujar o estirar, todo se imanta a los bordes y centros de
  lo que ya hay. Mantén **Ctrl** para apagar el imán.
- **Relleno** hueco, translúcido o macizo; **a mano alzada** para el temblor de un
  boceto; texto de varias líneas (Mayús+Intro baja de línea).
- **Deshacer va en serio**: Ctrl+Z y Ctrl+Mayús+Z recorren hasta sesenta pasos con
  una herramienta puesta.
- **Traer al frente** y **enviar al fondo** salen al seleccionar un trazo.

### Ctrl+Z y las terminales cerradas

Fuera de una terminal y de un cuadro de texto, **Ctrl+Z reabre la última terminal que
cerraste** con su ✕: una sesión de Claude retoma su conversación y una consola vuelve
vacía. El aviso «Cerrada “X” · Deshacer» dura cinco segundos; en el Lienzo, Ctrl+Z
solo hace esto mientras el aviso está puesto, porque el resto del tiempo deshace el
dibujo.

---

## 9. La cabecera de cada terminal

De izquierda a derecha, tiene tres zonas.

**Quién es**

| Elemento | Qué significa |
|---|---|
| **El icono** | Qué hay dentro: Claude Code, Codex, Antigravity, una consola… Cuando el programa termina, el icono se apaga a gris. |
| **Las tres letras de la cuenta** | Solo si la terminal no usa tu cuenta principal: las tres primeras letras de su nombre, en mayúsculas y en el color de acento. El nombre entero sale al pasar el ratón. |
| **El proyecto** | En una pastilla de su color. La ruta entera, solo al pasar el ratón. |
| **El nombre** | El título de la sesión, el mismo de la barra lateral. Doble clic para renombrarlo. |
| **«de: X»** | Si otra sesión abrió esta terminal con el MCP ([punto 17](#17-lo-que-puede-hacer-un-programa-de-fuera)), dice cuál. |

**Los datos**

| Elemento | Qué significa |
|---|---|
| **▣ N** | Cuántos subagentes trabajan ahora dentro de esa sesión. Al pasar el ratón (o pulsarlo) sale la lista: quién es cada uno, qué se le mandó, en qué estado está y cuánto lleva. |
| **La barra y el %** | El contexto: cuánto lleva ocupado de su memoria de trabajo. El globo da los tokens exactos. Los avisos van por tokens, no por porcentaje: ver el [punto 10](#10-lo-que-sale-dentro-de-una-terminal). |
| **El modelo y el esfuerzo** | Se cambian dentro con `/model` y `/effort`. |
| **La memoria** | Lo que ocupa esa terminal; se pone en tono de aviso desde 1 GB. |

Los tres datos de contexto, modelo y memoria se pueden esconder para que la barra
solo lleve proyecto y nombre: **Ajustes › Terminales › Ver el modelo, el contexto y
la memoria en la barra de cada terminal**.

**Los botones**: el *Modo Espejo* (rama aparte, ver el punto 10), el ojo para tapar
solo esta terminal en un directo, minimizar, sacar a su propia ventana, maximizar o
restaurar, borrar la sesión (va a la papelera) y cerrar. Partir a la derecha o abajo
ya no son botones: están en el clic derecho y en Ctrl+Mayús+→ y Ctrl+Mayús+↓. La ✕
cierra la terminal; la conversación no se borra y sigue en la barra.

**Sacar a su ventana.** Si arrastras la barra de una terminal fuera de Adeorq, sale a
su propia ventana de Windows y el agente ni se entera. Su ✕ pasa a **Devolver a
Adeorq**.

**El resplandor.** El panel donde trabajas lleva un aro del color de acento. Cuando un
agente **termina su turno** y te espera, su panel se enciende con un resplandor
**naranja** que late hasta que lo abres.

---

## 10. Lo que sale dentro de una terminal

Adeorq vigila la pantalla de cada terminal y traduce lo críptico a botones.

1. **Barra de preguntas**: cuando el agente pregunta con un menú de números (permiso
   para un comando, confiar en la carpeta, cómo retomar), salen botones con las
   opciones. Clic y respondido; también puedes responder con el teclado.
2. **Aviso de reconexión**: si tu acceso caduca, sale «necesita reconectar tu cuenta»
   con el botón **Reconectar**, que es lo mismo que escribir `/login`.
3. **Notas en cristiano**: mientras el agente comprime su memoria (el `/compact`), o
   cuando está ocupado y lo que escribas queda en cola.
4. **Aviso de agente colgado**: si lleva tres minutos sin dar señales, sale **Reanimar**
   (cierra el programa y retoma la misma conversación) o **Empezar limpia** si la
   sesión pesa demasiado.
5. **Aviso de contexto.** Las sesiones largas se vuelven caras: cada mensaje paga el
   contexto entero otra vez. Adeorq avisa por tokens: a los **300.000** «buen momento
   para compactar», a los **400.000** (en rojo) compacta solo si lo tienes activado y
   a los **600.000** recomienda una terminal nueva con un traspaso. Los botones son
   *Compactar*, *Nueva con traspaso*, *Ahora no* y *Cerrar esta*. En una ventana de
   contexto pequeña manda el porcentaje (50, 60 y 80 %). Compactar manda primero el
   traspaso (el `/fin` si existe esa skill) y después `/compact`, solo cuando el
   agente acabó su turno. Qué hace a los 400.000 lo eliges en **Ajustes ›
   Terminales** (avisar y esperar al botón, compactar sin commits, o compactar con
   el `/fin` entero). Nunca compacta solo en Codex ni en Gemini. Si la sesión ya se
   compactó dos veces, ofrece una nueva en vez de una tercera.
6. **Modo Espejo**: una terminal nacida en espejo trabaja en una rama aparte, y su
   botón abre **Propuestas en la sombra** con *Aceptar* y *Descartar*. Se elige al
   abrir; no se puede activar a mitad.

Si usas un programa en **pantalla alternativa** (el modo «fullscreen» de Claude Code),
Adeorq se comporta como una terminal normal: la rueda va al programa.

---

## 11. Perfil

Una sola página que baja. Arriba, tú: tu **foto**, tu **nombre** y tu **@**. **Editar**
cambia el nombre y el @ (la arroba y los espacios se quitan solos) y pulsar la foto
la cambia. Todo se queda en tu equipo. A su lado, **Tus secciones**: cuatro
resúmenes que abren la sección entera, con «‹ Perfil» encima para volver. También
se llega a cada una con Ctrl+K.

- **Cuentas**: cuántas hay conectadas y lo gastado de cada una ([punto 12](#12-cuentas)).
- **Agenda**: tus pendientes de hoy ([punto 13](#13-agenda)).
- **Memoria**: cuántas notas hay y en qué bóveda ([punto 14](#14-memoria)); no sale
  con la parte Memoria apagada.
- **Comandos**: cuántas skills tuyas hay, con los nombres de las primeras
  ([punto 15](#15-comandos)).

### Tu uso

Debajo, **Tu uso**. La cifra grande son los **tokens del mes en curso**, contando la
caché; debajo, los *Nuevos* (sin caché), los días activos y tu récord (el día con
más tokens). Una lista con tres pestañas, **Proveedores**, **Modelos** y **Proyectos**,
reparte el mes con barras. Debajo está **El año** en casillas y el mes día a día, con
flechas para ir al anterior o al siguiente. Tocar un día con uso abre su tarjeta.

Los datos salen de las conversaciones que **Claude Code y Codex** ya guardan en tu
disco: no gasta cuota y no hace falta ninguna clave. La primera lectura tarda un
minuto largo; las siguientes, unos segundos.

### La tarjeta para compartir

Tocar un día, tu récord o el icono de compartir abre **Compartir tu uso**: una tarjeta
con tus cifras lista para publicar. Eliges:

- Qué muestra: **Mes**, **Día**, **Récord** o **Total**.
- El formato: 16:9 (1920×1080) o 9:16 (1080×1920), como **Imagen** o como **Vídeo**.
- El fondo: el de detrás de tus terminales, cuatro de serie, o los que subas tú
  (imagen o vídeo; se copian a la carpeta de datos de Adeorq y una X quita la copia,
  nunca tu original).
- El color de la cifra y si va **resaltada** sobre una caja.
- Un **proyecto**, si quieres. Sale en **Ninguno** cada vez que se abre: ningún
  proyecto aparece en la tarjeta si no lo eliges tú.

Siempre salen tu @ (o tu nombre), tu foto y, al pie, «adeorq.com · Hecho con Adeorq».

En el vídeo, la cifra sube de cero a la tuya; recortas el tramo del fondo con dos
tiradores y puedes ponerle sonido (un golpe, un contador o el del propio vídeo).

- **Descargar** guarda un PNG o un MP4 donde elijas.
- **Copiar**, en modo Imagen, copia la imagen al portapapeles para pegarla donde
  quieras. En modo Vídeo saca el MP4 entero y **copia el archivo**: en Windows se
  pega como archivo en un chat o una carpeta (y como su ruta en un sitio de solo
  texto, por ejemplo una terminal); en Mac, como referencia de archivo; en Linux, solo
  la ruta.
- En Linux la pestaña Vídeo está apagada: «Este equipo no puede sacar vídeo».

---

## 12. Cuentas

Dentro del Perfil. Todas tus cuentas de agentes en un sitio, agrupadas por programa.

**Qué es una cuenta aquí.** Cada programa de agente guarda todo lo suyo (tu inicio de
sesión, tu historial, sus ajustes) en una carpeta. Si le dices que use otra
carpeta, se comporta como una instalación limpia: otro inicio de sesión, otros
límites. Eso es lo que hace Adeorq. Tu cuenta de siempre no se toca nunca; las
demás viven en una carpeta propia dentro de Adeorq.

La pantalla tiene una línea de estado («N conectadas de N instalados», el límite más
apretado y cuál es la de siempre) y cuatro secciones: **Tus cuentas**, **Claves de
API**, **Atajos** y **No instalados**.

**Qué programas conoce.** El catálogo tiene 22: Claude Code, Codex, Gemini CLI, Qwen
Code, GitHub Copilot, Grok, Crush, opencode, Amp, Antigravity, Cursor, Pi, Kiro CLI,
Kimi Code, CodeWhale, Goose, Droid, Jules, Auggie, Codebuff, Cody y Aider. **Ocho
admiten varias cuentas**, porque se ha comprobado que su variable mueve de verdad la
carpeta:

| Programa | Variable que mueve su carpeta |
|---|---|
| Claude Code | `CLAUDE_CONFIG_DIR` |
| Codex | `CODEX_HOME` |
| Gemini CLI | `GEMINI_CLI_HOME` |
| Qwen Code | `QWEN_HOME` |
| Grok | `GROK_HOME` |
| Pi | `PI_CODING_AGENT_DIR` |
| Kimi Code | `KIMI_CODE_HOME` |
| CodeWhale | `CODEWHALE_HOME` |

Los demás salen con la nota «una sola cuenta»: no se ha encontrado una forma de mover
su carpeta, y es preferible decirlo a inventarse un nombre y que una cuenta acabe
escribiendo donde no toca. **Antigravity** guarda su estado dentro de `~/.gemini` y
solo puede tener una. Pi habla con varios proveedores, y por eso no se propone como
relevo automático cuando te quedas sin semana: si su inicio de sesión es el de tu
propia cuenta de Claude, mandarte ahí sería mandarte a la misma cuota agotada.

**Qué ves en cada tarjeta.** El nombre (el de siempre lleva el nombre del programa; a
las que añadas les pones el tuyo), el plan y si es la predeterminada. **Claude Code,
Codex y GitHub Copilot** enseñan además sus barras de sesión y de semana con su hora
de renovación, y sale gratis. Los demás programas no publican tu consumo en el equipo,
así que la tarjeta lo dice en vez de inventarse una barra. Los que no dejan huella
al iniciar sesión dicen «no se sabe».

**Qué puedes hacer.**

- **Añadir cuenta**: le pones un nombre (el que quieras, nunca tu correo, porque esta
  pantalla puede acabar en un directo), se le crea su carpeta y se abre una terminal
  donde el propio programa te pide el inicio de sesión.
- **Usar por defecto**: las terminales nuevas de ese programa nacerán con esa cuenta.
- **Terminal con esta**: una sesión con una cuenta concreta, sin cambiar la
  predeterminada.
- **Cerrar sesión** (borra solo el inicio de sesión), **Compartir mis skills** (la
  misma carpeta de skills que la principal), **Renombrar** y **Quitar**. Quitar borra
  solo la carpeta de esa cuenta, con su historial.
- **Cerrar todas**, arriba, con dos o más conectadas.
- Los programas que no instalaste salen en **No instalados**, con **Descargar** (abre
  una terminal con el comando de instalación) o **Abrir su web**.
- **Atajos** elige qué programas salen como botones al pasar el ratón por un proyecto.

**La cuenta se decide al abrir la terminal y ya no cambia**, porque el programa lee su
carpeta una sola vez, al arrancar. Cuando una terminal no usa la principal, lleva
las tres letras de su cuenta en la cabecera. Si recuperas el tablero al abrir
Adeorq, o pulsas **Reanimar**, cada terminal vuelve a nacer en su cuenta. Y desde el
clic derecho de una terminal, **Seguir en otra cuenta** abre una nueva con un acta de
dónde ibas.

⚠ Varias cuentas **tuyas**, sin problema. Turnarte cuentas de otras personas para
estirar los límites incumple los términos de los proveedores, y lo que te juegas es
que te cierren la cuenta.

### El reparto entre cuentas

Cuando un agente abre una terminal con el MCP de Adeorq y no dice con qué cuenta, **la
terminal va sola a la cuenta de ese programa que más cuota perdería si se quedara
sin usar**: la que más semana le sobra comparada con los días que faltan para que se
renueve. Así, una cuenta Pro al 17 % que se renueva en dos días gana a una principal
al 60 % que se renueva en cinco, y al revés si la principal se renueva mañana.

- Se salta la cuenta parada por su tope de cinco horas o la que va por el 92 % de su
  semana o más, salvo que no quede otra. Si el modelo que pide el agente no lo da el
  plan de esa cuenta, prefiere otra; si no hay, nace con el techo de su plan.
- Cada terminal que un agente acaba de abrir en una cuenta cuenta como un poco de
  gasto hasta que llega una lectura nueva, para que tres aperturas seguidas no
  caigan en la misma.
- Quien se entera de qué cuenta se eligió y por qué es el **agente** que la abrió (la
  respuesta se lo dice, y qué cosas no verá esa cuenta). En pantalla ves el
  resultado en la cabecera de la terminal. Si el agente pide una cuenta concreta,
  nace en esa o falla diciéndolo: nunca en otra en silencio. Un encargo programado
  sin cuenta no elige: va a la predeterminada.
- El mismo criterio elige cuenta en los planes del Capataz y del Reparto, y se
  explica en su «por qué».
- Hay un tope: seis terminales abiertas por agentes a la vez y doce por hora.

### Claves de API y Vibecoding con OpenRouter

**Claves de API** es la otra forma de pagar lo que consume un programa: por tokens en
lugar de con tu suscripción. Hay una tarjeta por programa que admite clave (Claude
Code, Codex, Gemini CLI, Grok, opencode, Pi y Aider): *Pegar una clave*, *Sacar una*
(el enlace de dónde se saca), *Olvidarla* y un interruptor entre **Abre con la clave
(por tokens)** y **Abre con tu suscripción**. La clave se guarda cifrada, se ven solo
sus cuatro últimas letras y nunca vuelve a la pantalla. Dónde se guarda, en el
[punto 17](#17-lo-que-puede-hacer-un-programa-de-fuera).

La tarjeta de **OpenRouter** es una sola clave que abre modelos de muchos
proveedores, incluidos los que no tienen programa propio (Kimi, DeepSeek, Grok…).
Pegada la clave, enseña lo que te queda, lo de hoy, la semana y el mes. Debajo
aparece **Vibecoding**: abre una terminal real de [Aider](https://aider.chat)
apuntando al modelo que escribas (por defecto, `moonshotai/kimi-k3`). La primera
vez dice **Instalar Aider primero**; después, **Abrir terminal**, con la clave puesta.

⚠ **Si abres Aider a mano**, dile siempre el modelo (`aider --model
openrouter/<modelo>`), o cogerá la primera clave que encuentre en tu entorno y
probará con otro proveedor. Y la clave tiene que estar en `OPENROUTER_API_KEY` en
esa terminal. La tarjeta hace las dos cosas sola.

---

## 13. Agenda

Dentro del Perfil. Lo que se te viene encima, lo que pensaste y lo que toca. La
portada trae la fecha de hoy, cinco cifras que abren su pantalla (sesiones que te
esperan, propuestas de tus agentes, metas activas, ideas vivas y encargos
programados) y un calendario del mes que marca en cada día cuántos objetivos has
hecho.

- **Objetivos de hoy**: qué dos o tres cosas quieres dejar cerradas hoy. No son de
  ningún proyecto: son tuyas y del día. Se marcan con un clic en la fila entera y se
  guardan como un archivo de texto por día, así que **un agente puede tacharlos**
  cuando termina lo que le pediste. Al cambiar el día nace una lista vacía y, si
  dejaste algo sin tachar, sale **Traer el que dejaste ayer**. El icono de la barra
  de arriba los abre como panel flotante desde cualquier pestaña, con un deslizador
  de cuánto tapa lo que hay detrás.
- **Tus sesiones**: todas ordenadas por quién te espera, con **Retomar esta sesión
  aquí**. Si has elegido un modelo local en Ajustes, cada una lleva una línea de
  qué necesita de ti.
- **De tus agentes** (la bandeja): mientras trabajan salen cabos sueltos que no son de
  ahora. En vez de interrumpirte, los agentes los apuntan ahí, de uno en uno, y tú
  eliges **Aceptar** (un paso se escribe en el `METAS.md` de su proyecto), **Descartar**
  o **Luego**. Un agente puede proponer ahí sin tocar ninguna credencial tuya.
- **Próximos pasos**: las metas de `docs/METAS.md` del proyecto que elijas y su
  aparcadero.
- **Ideas y fechas externas**: salen de la **brújula**, un servicio aparte que es
  del autor de Adeorq y al que se entra con un correo y una contraseña. Si no lo
  tienes, esas dos tarjetas dicen «Conecta tu brújula» y todo lo demás de la Agenda
  funciona igual.

### Encargos programados

Le dejas escrito qué hacer, en qué proyecto y cuándo, y Adeorq abre solo una sesión a
esa hora, también con la ventana en segundo plano. Eliges el agente (**Claude Code
o Codex**), la cuenta (si hay dos o más de ese agente), el modelo y un nombre.

- **Días y hora**: los días de la semana y una hora. Se lanza como mucho una vez al
  día; si el PC estaba apagado a su hora, se lanza al encenderlo ese mismo día y, si
  no, espera a la vez siguiente.
- **Cada N horas**: de una a ciento sesenta y ocho, y se repite.
- Cada encargo enseña cómo fueron sus tres últimas veces (terminó, falló, no se
  lanzó) y su próxima vez. **Probar ahora** lo lanza ya. **Pausar**, **Editar** y
  **Borrar** hacen lo que dicen.
- **El freno**: si falla tres veces seguidas se para y te avisa (también en el
  móvil) hasta que pulses **Rearmar**. Si la cuenta con la que nacería va por el
  85 % o más, esa vez se salta y no cuenta como fallo.
- Nace en modo auto; si pregunta algo, la pregunta llega al móvil. Hay un tope de
  veinte encargos.

El reloj funciona en Windows, Linux y macOS; en Linux y Mac no se ha probado todavía en
un escritorio real.

---

## 14. Memoria

Dentro del Perfil. Tus notas de Obsidian (o cualquier carpeta con markdown) dentro
de Adeorq. **No se copia ni se mueve nada**: se leen donde están. La primera vez
enseña las bóvedas de Obsidian que ya conoce, o te deja señalar otra carpeta.

- **Buscar en tus notas**: por lo que dicen, sin mayúsculas ni tildes, y el título
  pesa más.
- **La nota**: la lista por carpetas o por recientes, la nota leída a la derecha,
  **Editar** y **Guardar** (comprueba que nadie tocó el archivo entre medias) y
  **Abrir fuera**. Los enlaces `[[así]]` funcionan.
- **Cerebro**: el mapa de qué enlaza con qué, en 3D, con dos formas, **Esfera** (por
  proyectos) y **Galaxia**. El modo rendimiento, que se enciende solo con cuatro
  terminales, lo deja quieto y lo dice.
- **Esquema**: eliges un proyecto y **Leer el proyecto**. El Capataz (un Claude) lee el
  código y dibuja de qué está hecho; tarda unos minutos, gasta cuota, se guarda y se
  enseña como mapa o mapa mental.

**La memoria de la casa** es otra cosa, aunque se parece. Las notas que Claude Code
guarda por carpeta, en todas tus cuentas, se juntan en un índice que **los agentes**
consultan con las herramientas `buscar_memoria` y `leer_memoria`. Busca por palabras
y, si tienes Ollama con el modelo `bge-m3`, también por significado. Ahí puedes
escribir líneas `router: palabras -> modelo / esfuerzo / cliente` que el router usa
para decidir (la regla que exige más palabras gana). Con la parte Memoria apagada,
nada de esto funciona.

---

## 15. Comandos

Dentro del Perfil. La chuleta de la casa: **65 comandos** (52 de Claude Code y 13 de
Antigravity) más tus skills (las de `~/.claude/skills`, las de tu cuenta de claude.ai
y las de plugins).

- **Buscador**: busca por lo que quieres hacer, no por cómo se llama. Escribe
  «deshacer», «cuota», «contexto» o «seguridad».
- **Filtros**: Todos, Claude Code, Antigravity (agy) y Tus skills.
- **Un clic** y el comando se escribe en la terminal activa. El Intro lo das tú, así
  nunca se ejecuta nada por accidente. Sin terminal abierta, los botones están
  apagados.

---

## 16. Ajustes

Diez grupos a la izquierda, en este orden. Pulsar el grupo abierto pliega su índice, y
Adeorq recuerda el último que miraste. Si un grupo tiene varias tarjetas, debajo
salen sus nombres para saltar a una.

**Aspecto**

- **Partes de Adeorq**: interruptores para **Cabina**, **Lienzo**, **Memoria** y **Chat**.
  Apagar una la apaga **entera**: sin pestaña, sin entrada en Ctrl+K y sin arrancar nada
  suyo (se vuelve a encender en el mismo sitio). Panel, Perfil, Decisiones y Ajustes
  van siempre. La Cabina y el Lienzo **no se apagan a la vez**, porque son los dos
  sitios donde se abre una terminal. Con la Cabina apagada, las terminales nuevas
  nacen en el Lienzo; con la Memoria apagada, los agentes pierden `buscar_memoria` y
  `leer_memoria`. Una vista apagada que aún tiene terminales abiertas sigue a la vista
  hasta cerrarlas, y Ajustes dice cuántas quedan.
- **La cabecera**: quitar, volver a poner y reordenar las pestañas de arriba, con
  *Como venía de fábrica*.
- **Idioma**: español o inglés. Cambia la app entera, incluida esta guía. Las
  terminales siguen hablando lo que hable cada agente.
- **Tema**: 32 temas en cinco familias (De la casa, Conocidos, De los que se notan,
  Apagados y De fondo claro), con filtro y buscador. Cada tarjeta es una miniatura de
  la app con esa paleta. Puedes pedir que siga el **claro u oscuro del sistema**, con
  un tema para cada caso, y **A juego con tu foto** elige el tema cuyo acento se parece
  a tu imagen de fondo.
- **El color de las terminales**: 12 esquemas de color para los 16 colores de la
  terminal, y **Importar un tema…** trae uno de Warp (`.yaml`) o de Ghostty.
- **Apagón**: negro sólido detrás de las terminales, aunque haya fondo.
- **Suavidad del scroll**: *Seco*, *Suave* o *Muy suave*; cambia al momento.
- **Modo rendimiento**: *Automático* (apaga el cristal al abrir la cuarta terminal y lo
  devuelve al cerrarlas), *Siempre bonita* o *Siempre rápida*.
- **Forma de las terminales**: *Pegadas* (mosaico), *Esquinas suaves* o *Tarjetas sueltas*.
- **El fondo**: una imagen o un vídeo (en bucle y sin sonido) detrás de todo. Se copia a
  la carpeta de Adeorq; eliges el encuadre, cuánto se ve y el desenfoque. Con
  **Terminales transparentes** la foto se ve a través del texto.

**Terminales**

- **Ajustar la letra al tamaño de cada terminal** (activado): con muchas terminales
  estrechas, la letra encoge sola hasta que la línea cabe. El tamaño que eliges es
  entonces el máximo.
- **Tamaño de la letra** (11 a 32 px) y **cuántas sesiones abre de golpe un proyecto**
  (2 a 20; cada una son unos 200 MB, por eso hay tope).
- **Ver el modelo, el contexto y la memoria en la barra de cada terminal.**
- **Recuperar las terminales al abrir** (de fábrica sí): vuelven las mismas terminales
  en sus carpetas y cada Claude retoma su conversación.
- **Que las terminales aguanten si Adeorq se cae**: ver el
  [punto 21](#21-actualizar-sin-perder-las-terminales).
- **Saltar a la sesión que termina, a pantalla completa**, **Preguntar si abro la web
  cuando una terminal levanta un servidor** y el **buscador de la barra del navegador**
  (Google, Brave Search o DuckDuckGo).
- **A los 400.000 tokens de contexto**: avisar y esperar al botón, compactar solo sin
  commits, o compactar solo con el `/fin` entero ([punto 10](#10-lo-que-sale-dentro-de-una-terminal)).
- **Arrancar Adeorq al encender el ordenador.**
- **Al cerrar la ventana**: *Preguntar cada vez*, *Seguir en segundo plano* (la ventana se
  esconde, los agentes siguen y queda un icono junto al reloj) o *Cerrar todo*.
- **Modo de permisos**: con qué modo nace cada Claude nuevo (*Ediciones automáticas* de
  fábrica, *Modo plan*, *Manual*, *Automático*, *Solo lo aprobado* o *Sin
  comprobaciones*). Se cambia dentro con Mayús+Tab.
- **Qué puede hacer cada cliente por el MCP** y **Claves de los agentes**: se cuentan en el
  [punto 17](#17-lo-que-puede-hacer-un-programa-de-fuera).

**Avisos**

- **Avisos**: aviso del sistema cuando un agente termina o espera tu OK, con el icono
  parpadeando en la barra de tareas. *Solo en segundo plano* (de fábrica), *Siempre* o
  *Nunca*. Nunca avisa del panel que estás mirando.
- **Tu cerebro por defecto**: *Que decida Adeorq*, o fijar haiku, sonnet u opus para todo.
  La cuota manda, y una tarea de juicio no se abarata nunca.
- **Cuando el cerebro no cuadra**: el Capataz avisa si el modelo de la terminal que
  tienes delante es mucho más caro o más flojo de lo que pide la tarea. *Solo diferencias
  gordas* (de fábrica), *Cualquier diferencia* o *Nunca*.
- **El vigía de las cuadrillas**: con una cuadrilla abierta, mira cada minuto quién
  terminó, quién espera y si alguien toca archivos de otro, y deja una línea en la
  bandeja de la Agenda. Nunca escribe ni abre ni cierra terminales.
- **El copiloto de las sesiones**: mira las terminales abiertas y sugiere, por la
  bandeja, otro programa con cuota, un cerebro más barato o lo que costaría por API.
  Nunca cambia nada solo.

**Atajos**: **Atajos del lienzo**, la tabla editable de las 31 acciones del lienzo
([punto 24](#24-atajos-de-teclado)).

**Modelo local**: si Ollama responde en tu equipo, eliges un modelo pequeño que escribe
la línea de «qué te pregunta» de cada sesión en la Agenda. Sin Ollama, la Agenda
funciona igual sin esa línea.

**Discord**: **Mostrar Adeorq en mi Discord** (encendido de fábrica) habla con el Discord
abierto en tu equipo, sin cuenta ni servidor; **Decir en qué proyecto estoy** (apagado).
En modo emisión, Discord vuelve a lo genérico.

**Móvil**: ver el [punto 19](#19-en-el-móvil).

**Bots**: **Avisar a un bot** (todo apagado de fábrica). Cuando una terminal termina o te
espera, Adeorq escribe a tu **Grok Bot** (la dirección del webhook de una rutina y su clave,
que se guarda en el almacén de claves de tu equipo y no vuelve a la ventana), a tu
**Hermes** o a tu **OpenClaw**, si los tienes instalados. Manda solo el nombre de la
terminal, su proyecto y qué pasa, nunca lo que hay en la pantalla. Solo avisa si no estás
mirando Adeorq y sigue lo que elijas en **Avisos**; varias terminales que acaban a la vez
son un solo mensaje, y como mucho sale uno cada 30 segundos. **Probar** manda un mensaje de
prueba, y el de Grok Bot lanza una ejecución de verdad de tu Bot y gasta de su cuota (cada
aviso también). Si un aviso no llega, no te interrumpe: Ajustes lo dice.

**Mods**: un mod es un cambio tuyo en cómo se ve Adeorq (los iconos redondos, otro color,
una pieza escondida). Vive en tu carpeta de datos (`mods`), así que una actualización no
lo toca. **Pedir un mod a tu agente** le deja el encargo escrito en su terminal, sin
enviarlo. **De fábrica están apagados**. Cada uno dice cómo está: *Puesto*, *Apagado*,
*Ya no engancha* (una actualización cambió la pieza a la que se agarraba; **Pasárselo a
tu agente** se lo da para que lo rehaga) o *No se carga*, con el motivo. Solo cambian el
aspecto: Adeorq no carga código de un mod ni deja que su hoja de estilos pida nada a
internet. Si uno te deja la pantalla inservible, **Ctrl+Alt+Mayús+0** los apaga todos.

**Ayuda**: **Primeros pasos** (*Ver el recorrido* y *Repetir la bienvenida*), la
**Documentación** de la web (se abre en tu navegador y siempre está al día, sin esperar a
una versión nueva) y **Que me la explique mi agente**, que abre una sesión con esta guía
delante: te pregunta qué quieres hacer y te enseña solo eso. Debajo vive esta guía
entera.

**Adeorq**

- **Tú y tus proyectos**: tu nombre, la carpeta de proyectos (cambiarla vuelve a leer
  la lista entera) y los proyectos sueltos que añadas a mano.
- **Actualizaciones**: la versión instalada y **Buscar actualizaciones** (solo busca).
  Si hay una, un segundo clic la instala y **Reiniciar** la estrena. Mira sola al
  arrancar y cada seis horas, y no instala nada sin que se lo digas.
- **Tu cuota**: **Ver mi uso semanal** escribe `/usage` en la terminal de Claude que
  tengas activa y te lleva allí. Para ver todas tus cuentas a la vez usa la cara
  **Uso** de la Cabina ([punto 5](#5-cabina)) o el [Perfil](#11-perfil).

---

## 17. Lo que puede hacer un programa de fuera

Adeorq tiene una puerta local, el **MCP**, por la que un programa de IA puede mirar y
manejar tus terminales: listar proyectos y terminales, leer lo que se ve en una, abrir
una nueva, escribirle, preguntarte algo con opciones (que llega a
[Decisiones](#7-decisiones) y al móvil), consultar tu cuota y la memoria de la casa.
Son dieciocho herramientas, repartidas en tres escalones con nombres sencillos:

- **Solo mirar**: lee terminales, proyectos, la agenda, la cuota y la memoria. No
  cambia nada.
- **Abrir y mirar**: además abre terminales nuevas, dibuja flechas entre dos del
  lienzo, te hace preguntas y cierra **las que abrió ese mismo programa**. No escribe en
  las de otros.
- **Todo**: además escribe en cualquier terminal, la cierra y puede compactarla.

**Cómo conectas tu Claude Code a estas herramientas.** Adeorq no toca la configuración de
tu Claude Code: se la das tú, una vez, con
`claude mcp add adeorq --scope user -- "<ruta de adeorq.exe>" --mcp` (la ruta es la de la
carpeta donde instalaste Adeorq). Hace falta que Adeorq esté abierta: con ella abierta,
`claude mcp list` tiene que decir «Connected». Desde entonces, un Claude Code que abras en
una terminal de Adeorq tiene las herramientas con el escalón de esa terminal, y uno de otra
consola las tiene como programa de fuera (más abajo).

**Cada terminal nace con su propia contraseña**, y el escalón sale de la terminal desde
donde se conecta el programa, no del nombre que dice tener. Un programa que
se presenta como «claude» desde fuera no hereda el escalón de Claude Code. De fábrica,
**Claude Code tiene «Todo»** y los demás programas tienen «Abrir y mirar».

**Fuera de Adeorq** es todo lo que llega **sin** la contraseña de una terminal de Adeorq:
un Claude Code abierto en otra consola, cualquier programa que hable con el puerto.
De fábrica solo puede **abrir terminales y mirar**. Esas terminales nacen en el modo que
tengas en Ajustes, y si pide abrir una **con un encargo** sale una ventana con el texto,
quién lo pide y en qué carpeta: **No** o **Abrir**; si nadie contesta, no se abre. Para
que haga más, súbelo tú en
**Ajustes › Terminales › Qué puede hacer cada cliente por el MCP**, en su fila (vale
para cualquier programa de fuera, y en «Todo» ya no pregunta, así que súbelo con
cuidado). Cada fila dice el
programa, su versión, cuántas veces se conectó y cuándo fue la última. El Capataz y el
conserje entran por una línea propia y no cuentan como clientes.

Un agente con escalón bajo que pida algo que no le toca recibe un rechazo que le dice
qué escalón tiene y dónde se cambia.

Límites que conviene saber: un agente abre como mucho seis terminales vivas a la vez
y doce por hora; un mensaje nuevo a una terminal de Claude con más de 300.000 tokens
de contexto se le devuelve y solo sale si insiste; no puede compactar una que abrió una
persona; y las terminales que abre un agente las cierra él cuando acaba, dejando un
resumen en la carpeta de datos.

### Pedir una clave sin enseñarla

Cuando un agente necesita un token, **no se pide por el chat ni se deja en un archivo**.
Sale una ventana de Adeorq donde lo pegas, y el agente no lo lee ni queda en su
historial. El agente la usa con `adeorq secreto <nombre> -- <comando>`: el comando
recibe la clave en una variable de entorno y su salida sale con `***` donde habría
salido la clave.

- Una **terminal de Adeorq** que pide una clave ya guardada la recibe **sin preguntar**.
  Si no estaba guardada, sale la ventana **Un agente necesita una clave**
  (*Cancelar* o *Dársela*, con una casilla para guardarla la próxima vez).
- **Un programa de fuera de Adeorq** que pide una clave guardada hace salir otra
  ventana: **Un programa de fuera de Adeorq pide una clave. No viene de una terminal
  de Adeorq. Dásela solo si sabes qué programa es.** Eliges **No** o **Dársela esta vez**.
- **Las claves de los agentes** (Ajustes › Terminales) lista cada clave guardada con
  quién la usó y cuándo («la usó la terminal 4 hace 3 min»), con un botón *Olvidar*.
  Nunca enseña el valor, y la tarjeta no sale si no hay ninguna.
- **Dónde se guardan**: en el Gestor de Credenciales de Windows, en el Llavero de tu
  Mac, o, en Linux, en un archivo de tu carpeta de datos con permisos 600 **sin
  cifrar** (la pantalla lo avisa).

**Lo que esto no hace**, para que no te confíes: el filtro `***` solo reconoce la clave
tal cual, así que no para a un agente decidido a sacarla (por ejemplo, con un comando
que la codifique antes de imprimirla); y cualquier programa que corra con tu usuario
puede leer el Gestor de Credenciales directamente, sin pasar por Adeorq. Es una
barrera contra accidentes y lecturas casuales, no contra un agente en el que no
confías: a ese no se le da la clave.

---

## 18. El Capataz y el Reparto

El Capataz es tu agente orquestador. Le escribes lo que quieres y te propone un plan;
**nada se ejecuta sin tu OK**. Se abre con el orbe de la barra de arriba, con
**Ctrl+Mayús+A**, y desde cualquier pestaña. **Ctrl+Mayús+M** lo abre ya escuchándote, y
con la voz de OpenRouter puede contestarte en alto. En la ventana y en algunos textos
de la app se llama «el Asistente».

**Cuánto puede tocar.** Tiene los mismos tres escalones del
[punto 17](#17-lo-que-puede-hacer-un-programa-de-fuera): *Mirar* (solo lee), *Plan* (abre
terminales nuevas, pero no escribe en las de otros) y *Auto* (además escribe en cualquier
terminal). Se elige en la propia ventana.

**Qué botones tiene.**

- **Planear**: te propone qué sesiones abrir, con qué programa, qué cerebro y qué
  encargo. En la lista ves con qué cerebro abre cada cosa y, antes del botón, lo que
  pesa el plan entero («Abre 6 agentes · 2 opus + 4 sonnet · ×22»). No es una factura
  (con suscripción no hay factura): es la única cifra comparable que existe, con
  haiku como 1.
- **Preguntar**: solo mira Adeorq y te contesta, sin abrir nada.
- **Escribir el encargo**: le sueltas en una frase lo que quieres y te devuelve el
  encargo bien escrito, para quién y por qué ese. Hay tres botones: ponerlo en la
  terminal que tienes delante (le cambia el modelo y el esfuerzo y deja el encargo
  escrito, sin enviarlo), abrir una terminal nueva ya nacida así, o copiarlo.
- **Automático**: en vez de enseñarte la ficha, ajusta el cerebro y deja el encargo
  escrito en la terminal de delante. No lo envía: «sin pantalla intermedia» no
  quiere decir «sin tu dedo».
- **Voz**: que el Capataz diga sus respuestas en alto.

**Cómo elige el cerebro.** Pasa por el mismo router que el resto de Adeorq y mira tu
cuota de verdad, cuenta por cuenta:

- Primero mira qué pide el trabajo: un recado mecánico va a haiku, el día a día a
  sonnet y lo que exige juicio (seguridad, auditar, revisar, arquitectura) a opus.
- Después mira tu semana. Con la semana justa abarata lo que se puede abaratar, elige
  la cuenta con más margen (la misma regla del [reparto entre
  cuentas](#12-cuentas)) y, si no queda semana en ninguna cuenta de Claude, propone otro
  programa **de los que tengas conectados**. Codex y GitHub Copilot publican su cuota y
  el router la usa; de los demás, Adeorq sabe si están conectados, no cuánto tienen.
- Lo que **nunca** hace es abaratar una auditoría para ahorrar cuota: repetir ese
  trabajo cuesta más que la diferencia.
- Los relevos a otro programa solo entran por un motivo objetivo, que es que no te
  quede semana. Y siempre puedes cambiar el cerebro a mano.

### El Reparto: varias tareas de golpe

No tiene botón propio: es el mismo Capataz. Una frase se planea ahí mismo; **varias
líneas son varias tareas**, y el botón cambia solo a **Repartir las N tareas**
(hasta ocho por tanda) y te lleva a una pantalla con el texto puesto. Puedes pegar tus
tareas, una por línea, o marcar los **objetivos de hoy** y las **ideas que tus agentes
dejaron en la Agenda**.

1. **Una sola llamada** clasifica todas las tareas y les reparte los archivos, para que
   dos tareas no se pisen.
2. **El código decide el destino de cada una**: programa, cuenta, modelo y esfuerzo,
   mirando qué tienes instalado, qué cuentas están conectadas, cuánta semana te queda
   y qué plan tienes contratado. Eso no gasta un token.
3. **Se escribe el papel común** en el `BUZON.md` del proyecto: quién hace qué, qué
   archivos son de cada uno y dónde apuntar lo que termine. Ese archivo no se versiona
   nunca.
4. **Se abren todas**, escalonadas, cada una con su encargo escrito en el idioma de su
   programa. Las skills (como `/frontlaxweb`) solo se le ofrecen a Claude Code.

Antes del botón final ves lo que pesa el lote entero y los avisos: si dos tareas van
al mismo proyecto sin archivos repartidos, te lo dice, porque dos agentes sobre el
mismo archivo van más lento que uno detrás de otro.

---

## 19. En el móvil

Adeorq se viene contigo. Desde el móvil, una tablet u otro ordenador hablas con el
conserje, ves cómo va cada terminal y le escribes, contestas lo que te preguntan tus
agentes y abres sesiones del PC. La página la **sirve tu propio PC**, y el tráfico
va por **Tailscale**, su red privada: no pasa por ningún servidor de Adeorq. Solo
entran aparatos que hayas emparejado. El PC tiene que estar encendido con Adeorq
abierto (mientras sirve, le pide al sistema no dormirse).

**Emparejar un móvil.** En **Ajustes › Móvil**:

1. Enciende **Conserje en el móvil**. Salen tres filas con un punto verde o rojo —
   *Este PC*, *Tailscale* y *Tu móvil* — y el arreglo en la que falle.
2. Si falta, **Llevar el conserje a Tailscale** (y *Abrir el enlace de Tailscale* si
   pide activar HTTPS).
3. Aparece una dirección `https://….ts.net:8443` con su QR y **Copiar**.
4. **Emparejar un móvil** da un código de seis cifras que vale diez minutos. En el móvil
   lo escribes y pulsas **Emparejar**.

Los aparatos emparejados salen en la misma pantalla con «visto hace…», si tienen
avisos, **Probar aviso** y **Quitar**.

**Qué hay en el móvil.** Un cajón con **Conserje**, **Terminales**, **Decisiones**,
**Programados**, **Uso** y, abajo, **Ajustes**, más **Nuevo encargo**.

- **El inicio**: Adeo con el estado del PC, **Te esperan** (decisiones y terminales que
  preguntan), **En marcha**, tus conversaciones con el conserje y la caja para
  escribirle.
- **Terminales**: agrupadas en *Te preguntan*, *Trabajando*, *Terminaron* y *En
  reposo*. De cada una ves **Chat** (lo hablado, con **Copiar** en los bloques de
  código) y **Pantalla** (lo que se ve en el PC). Su caja admite texto, fotos y
  archivos adjuntos, y lleva **Parar**, una pastilla de modelo y esfuerzo y **Modo**
  (el Mayús+Tab de Claude Code).
- **Abrir sesiones del PC**: **Nueva sesión aquí** por proyecto, **Otro proyecto…** y
  seguir una sesión de antes. Solo en carpetas que son proyectos tuyos y con
  programas conocidos.
- **Decisiones**: contestas con una opción o con palabras, con cinco segundos para
  deshacer y **Descartar**. Las que ya no esperan pasan a *Anteriores* y a la semana se
  borran.
- **Los Ajustes del propio móvil** (se guardan en ese aparato): el fondo, los colores,
  la letra y cómo se mueve Adeo, qué secciones salen en el inicio y su orden, los
  avisos y **Instalar Adeorq como app en este aparato**.
- **Avisos**: llegan aunque la página esté cerrada, por el servicio de avisos del
  navegador del móvil (Google, Mozilla o Apple). En iPhone solo funcionan con la app
  añadida a la pantalla de inicio. El filtro de qué avisos se mandan se aplica en
  el PC.

Seguridad: la página solo escucha en tu PC, cada petición lleva la clave del aparato
emparejado (en el disco solo queda su huella) y se rechaza cualquier origen ajeno.

---

## 20. Modo emisión

Pensado para que puedas retransmitir sin regalar tus claves. Tiene cuatro piezas:

1. **Tapado, no desenfoque**: el pie de la barra lateral, el resumen del Capataz, los
   nombres de cuentas y los textos de la Agenda se cubren con una barra sólida. El
   desenfoque suave se puede deshacer desde una grabación, por eso no se usa. **Los
   títulos de tus sesiones y los objetivos del día no se tapan**: son el hilo de lo que
   estás haciendo, y sin ellos el directo no se entiende.
2. **Alt para mirar**: el ratón por encima no revela nada. Mantén **Alt** para ver lo
   tapado; al soltarlo, o al cambiar de ventana, se vuelve a tapar.
3. **El escudo en las terminales**: lo que escribe el agente se revisa antes de
   pintarse y se cambia por ●●● lo que tiene forma de clave: claves de Anthropic,
   OpenAI, AWS o Google, tokens de GitHub y Slack, JWT, claves privadas, contraseñas
   dentro de una cadena de conexión, variables tipo `API_KEY=…`, tu correo y tu usuario
   en las rutas. El agente sí recibe el texto real: solo se oculta a la vista.
4. **La cortina, Ctrl+Mayús+P**: tapa la ventana entera al instante; vuelve con un clic
   o con las mismas teclas. **Solo se pone a mano.**

Cuando el escudo tapa algo sale una tarjeta abajo a la derecha, «Tapé algo que parece…»,
con un consejo y el botón **Entendido**. Como el escudo actúa **antes** de que se pinte,
si sale la tarjeta es que **en el directo no se llegó a ver nada**. El consejo depende
de lo que fuese:

- **Borde rojizo** (clave, token, contraseña; dura nueve segundos): no se vio, pero esa
  clave sigue suelta donde estuviera guardada. Lo que hay que mirar es de dónde salió.
- **Borde azul** (tu correo o una ruta con tu usuario; dura cinco): tapado y ya está.

También puedes tapar **una sola terminal** con el ojo de su cabecera o con el clic
derecho (*Tapar esta terminal (para emitir)*).

Lo que **no** hace: no arregla lo que ya salió antes de activarlo, no tapa tu
navegador ni las notificaciones del sistema, y ninguna lista de patrones es completa.
Lo que más te protege sigue siendo un **retardo de 30 segundos en OBS**. El
razonamiento entero está en `docs/EMISION.md`.

---

## 21. Actualizar sin perder las terminales

**La tarjeta.** Adeorq mira si hay versión nueva al arrancar, cada seis horas y al volver
a la ventana, y te avisa de dos maneras: una notificación del sistema (una vez por
versión) y una tarjeta **Actualizar Adeorq** con la versión, al final de la barra
lateral. Si la barra está encogida a una tira, solo avisa la notificación. Un clic
descarga la versión (con su porcentaje) y la instala; después dice **Reinicia para
estrenar**. La ✕ (*Ahora no*) la esconde. Nunca instala sola.

**Si hay agentes trabajando.** La tarjeta dice **Espera a que terminen** y quién anda a
medias; cuando acaban, actualiza sola. Si pulsas otra vez, actualiza ya.

**«Las terminales siguen vivas» quiere decir** que tus consolas y tus agentes siguen
con lo que hacían: un `pnpm dev` sigue corriendo y Claude no vuelve a arrancar. Las
terminales viven en un proceso aparte que el instalador no cierra, y la ventana nueva
las recoge con su historial. Los límites, dichos claros:

- **Solo en Windows**, en la app instalada y con el ajuste **Que las terminales
  aguanten si Adeorq se cae** encendido (de fábrica sí). En desarrollo, Linux y Mac
  está apagado de fábrica.
- **Sin ese proceso aparte**, actualizar cierra las terminales: a los Claude se les
  despide con Ctrl+C y se retoman con `--resume`, y una consola pierde lo que
  tuviera en marcha.
- **Lo que cierras tú las mata**: la ✕ con *Cerrar todo*, *Cerrar Adeorq del todo* o
  *Cerrar todas*. Y si Adeorq muere de golpe, las terminales aguantan media hora; si
  nadie vuelve, se cierran solas.
- **El proceso aparte es de la versión en la que nació.** Tras actualizar, la ventana es
  nueva pero ese proceso sigue siendo el viejo, y las terminales que abras después en
  esa sesión nacen también en él hasta que salgas de Adeorq del todo. Lo nuevo de la
  versión que dependa de ese proceso no llega a ellas, así que tras actualizar conviene
  salir de Adeorq del todo en cuanto puedas. Esto está leído en el código y no probado
  con un instalador real.
- Una terminal viva que no estaba en el tablero guardado sale marcada como
  «recuperada»; nunca se mata en silencio.

El instalador de Windows corre en modo pasivo. No lleva firma de código de pago, así que
Windows puede avisar de que no reconoce al editor: el instalador va firmado con la clave
del actualizador de Adeorq, que es lo que garantiza que la actualización que te llega es
la nuestra.

---

## 22. Windows, Linux y Mac

Adeorq funciona igual en los tres, con estas diferencias.

**Windows** es donde más se usa y donde está todo: el motor de terminales en proceso
aparte, el navegador de verdad, la música, el segundo plano con icono, el reloj de los
encargos programados y el Gestor de Credenciales.

**Linux.** Se publican AppImage, `.deb` y `.rpm` (en Fedora conviene el `.rpm`; el AppImage
lleva su propio motor web). La ventana es translúcida y pide un escritorio con
compositor. Las diferencias que verás:

- Las claves van a un archivo con permisos 600, sin cifrar (la pantalla lo dice).
- No hay control de música.
- Al darle a la X con terminales abiertas ofrece **Seguir en segundo plano**: la ventana
  se esconde, sin icono, y vuelve al abrir Adeorq otra vez.
- El navegador del panel es una versión sencilla en un marco, no el Chromium de verdad.
- Las terminales no van de fábrica en un proceso aparte.
- La pestaña Vídeo de la tarjeta de uso está apagada.

**Mac.** Hay un instalador `.dmg` para Apple Silicon (macOS 12 o más) entre las
versiones publicadas. Está construido y arrancado en un Mac automático, pero
**todavía no se ha usado a diario en un Mac real**, así que si algo falla, cuéntalo.

- Las claves van al **Llavero** de inicio de sesión (servicio «Adeorq»); Adeorq mueve al
  Llavero las que estuvieran en un archivo y solo borra el archivo cuando ha comprobado
  que la clave leída de vuelta es idéntica.
- La **barra de título** sigue el tema de Adeorq (clara u oscura) en lugar del modo del
  sistema.
- Los datos viven en `~/Library/Application Support/Adeorq`. Las consolas usan zsh, y
  una app abierta desde el Finder hereda el PATH de tu shell de usuario, para encontrar
  tus programas.
- Los atajos usan la tecla **Control**, no ⌘ (pendiente de revisar con un Mac delante).
- Como en Linux: sin control de música, navegador sencillo y terminales sin proceso
  aparte de fábrica. Al cerrar la ventana se cierra Adeorq y se lleva sus terminales.

---

## 23. Clic derecho y globos de ayuda

Adeorq no usa los menús del navegador: son suyos, en tu idioma y con los atajos escritos.

- **Clic derecho en una terminal**: copiar, pegar, partir a la derecha, partir abajo,
  maximizar, tapar para emitir, *Reanimar*, *Seguir en otra cuenta* y cerrar. En una
  ventana suelta, *Devolver a Adeorq*.
- **Clic derecho en un proyecto**: sesión nueva de cada programa, una entrada por
  cuenta extra, abrir todas sus sesiones, quitarlo de Adeorq, cambiarle el nombre, el
  logo y el orden.
- **Clic derecho en una sesión**: retomar, fijar arriba, renombrar, mover a grupo,
  sacarla del proyecto, archivar, borrar.
- **Clic derecho en un hueco del Lienzo**: el menú de añadir piezas.
- **Ratón encima de casi cualquier cosa**: sale un globo explicando qué es y su atajo. Los
  números y pastillas dicen qué cuentan exactamente.

---

## 24. Atajos de teclado

| Atajo | Qué hace |
|---|---|
| Ctrl+K | La paleta: escribe y ve a cualquier pestaña (también a las que quitaste de la cabecera), terminal abierta o proyecto, o lanza cualquiera de los atajos de abajo. Busca sin tildes y con las palabras en cualquier orden. Funciona también dentro de una terminal |
| Ctrl+P | Abrir un archivo del proyecto que tienes delante escribiendo parte de su nombre. Dentro de una terminal esa tecla es del programa: ahí se llega por Ctrl+K, «Abrir un archivo por su nombre» |
| Ctrl+Mayús+T | Terminal nueva (en la carpeta de la activa) |
| Ctrl+Mayús+→ | Partir la terminal activa a la derecha |
| Ctrl+Mayús+↓ (o D) | Partirla abajo |
| Ctrl+Mayús+F | Maximizar o restaurar la terminal activa |
| Ctrl+Mayús+A | Llamar o cerrar al Capataz |
| Ctrl+Mayús+M | Llamar al Capataz y dictarle |
| Ctrl+Mayús+E | Modo emisión |
| Ctrl+Mayús+P | La cortina: tapa la ventana entera |
| Alt (mantenido) | Mirar lo que tapa el modo emisión |
| Ctrl+Z | Reabrir la última terminal cerrada (fuera de una terminal y de un cuadro de texto) |
| Ctrl+Alt+Mayús+0 | Apagar todos los mods |
| Esc | Cerrar lo que esté abierto encima (paleta, Pulso, Capataz, avisos) |

Estos **no se pueden cambiar**; los del lienzo, sí.

### En una terminal

| Atajo | Qué hace |
|---|---|
| Ctrl+V / Ctrl+C | Pegar / copiar. Ctrl+C copia si hay selección; si no, va al programa |
| Ctrl+F | Buscar dentro de la terminal (Intro siguiente, Mayús+Intro anterior, Esc cierra). No le llega al agente |
| Mayús+Tab | Cambiar el modo de permisos dentro de Claude |

### En el navegador del panel

Con el foco dentro del navegador: Ctrl+T pestaña nueva, Ctrl+W cerrar, Ctrl+L la barra
de dirección.

### En el editor de archivos

Con el teclado dentro de un archivo abierto. El código se pinta con los colores del
esquema de la terminal que tengas elegido.

| Atajo | Qué hace |
|---|---|
| Ctrl+S | Guardar |
| Ctrl+F | Buscar y reemplazar en el archivo |
| Ctrl+G | Ir a una línea |
| Alt+Z | Quitar o poner el ajuste de línea |
| Ctrl+Z / Ctrl+Y | Deshacer / rehacer |
| Ctrl+Mayús+[ / Ctrl+Mayús+] | Plegar / desplegar el bloque donde estás |

### En el lienzo

Estos **se pueden cambiar** en **Ajustes › Atajos**: son 31 acciones. Solo actúan con el
lienzo delante y con el foco fuera de una terminal y de un cuadro de texto: mientras
escribes, las teclas son de quien escribe.

| Atajo | Qué hace |
|---|---|
| Alt+C / Alt+T / Alt+G | Abrir un Claude / una terminal / un Antigravity |
| Alt+N / Alt+L / Alt+I | Poner una nota / una ventana de localhost / la galería |
| Ctrl+A | Coger todo el lienzo |
| Esc | Soltar lo cogido; si no hay nada cogido, dejar la herramienta |
| Supr (o Retroceso) | Borrar lo cogido (pregunta una vez) |
| Alt+0 | Encajar todo en la pantalla |
| V M P F L R D O T E | Mano, marco, lápiz, flecha, línea, recuadro, rombo, elipse, texto, goma |
| Ctrl+Z / Ctrl+Mayús+Z | Deshacer y rehacer el dibujo (con una herramienta puesta) |
| Ctrl+C / Ctrl+D | Copiar / duplicar lo dibujado |
| Ctrl+G / Ctrl+L | Agrupar / clavar al tablero |
| Ctrl+Mayús+↑ / Ctrl+Mayús+↓ | Traer al frente / enviar al fondo |
| Ctrl+Alt+C / Ctrl+Alt+V | Copiar / pegar el estilo |
| Ctrl+Mayús+E | Exportar el dibujo |
| Ctrl (mantenido) | Mientras dibujas, apaga el imán de las guías |

Van con Alt y no con Ctrl porque dentro de una terminal Ctrl+letra es del programa que
corre ahí: Ctrl+C corta a Claude y Ctrl+R busca en el historial. En el pulsador de
combinaciones, una combinación repetida le quita el atajo a la otra acción, y **Volver
a los de fábrica** lo deja todo como venía.

---

## 25. Leyenda de colores

- **Verde**: vivo ahora mismo (sesión abierta, proceso corriendo).
- **Ámbar**: te espera a ti (pregunta pendiente u oferta).
- **Rosa o rojo**: parado hasta que respondas (una pregunta con opciones), o aviso que
  conviene mirar. El contexto pasado de la raya, en rojo.
- **Naranja que late en una terminal**: ese agente terminó su turno y te espera.
- **Color de acento del tema**: lo que tienes seleccionado o la terminal con el foco.
- **Apagado**: sin nada pendiente, o quedó a medias.
- **Un hilo de luz** que recorre la tarjeta de una sesión en la barra lateral: el agente
  está trabajando.

---

## 26. Dónde guarda tus cosas

Todo en tu equipo, y en formatos que puedes abrir por tu cuenta. La carpeta de datos de
Adeorq es `%LOCALAPPDATA%\Adeorq` en Windows, `~/.local/share/adeorq` en Linux (o
donde diga `XDG_DATA_HOME`) y `~/Library/Application Support/Adeorq` en Mac.

| Qué | Dónde (dentro de esa carpeta) |
|---|---|
| Objetivos del día | `objetivos`, un Markdown por día |
| Notas del Lienzo | `notas`, en Markdown |
| El Lienzo | `lienzo.json` |
| Encargos programados | `programados.json` |
| Decisiones y conversaciones del conserje | `decisiones`, `conserje` y `chats` |
| Ideas y pasos que proponen los agentes | `bandeja.md` |
| Rastro de fallos | `rastro.log` |
| Resúmenes de las terminales que cerró un agente | `rastros` |
| Cuentas de cada programa | `accounts`, una carpeta por cuenta |
| Mods | `mods` |
| Aparatos emparejados del móvil | `movil.json` (solo su huella) |
| Capturas pegadas y adjuntos del móvil | `pastes` |
| Claves de API y de los agentes | Gestor de Credenciales de Windows, Llavero de Mac o, en Linux, la carpeta `secretos` |
| Sesiones e historiales | Donde los deja cada programa (`~/.claude` para Claude Code): Adeorq los lee, no los copia |
| Tus ajustes de ventana (tema, letra, cabecera, partes, disposición de la Cabina) | En el almacén de la propia ventana, no en un archivo de esa carpeta |

### Qué sale a internet

Adeorq no lleva telemetría ni analíticas. Sale de tu equipo, y solo en estos casos:

- **Para buscar actualizaciones**: pregunta a GitHub al arrancar, cada seis horas y al
  volver a la ventana.
- **OpenRouter**, solo si guardas tu clave: comprobar la clave y el saldo, listar
  modelos, hablar con uno y generar la voz del Capataz.
- **La brújula** de la Agenda, solo si entras con tu cuenta.
- **Los avisos al móvil**, cifrados, por el servicio de avisos de tu navegador.
- **Los avisos a un bot**, solo si los enciendes en **Ajustes › Bots**: el webhook de tu Grok
  Bot (la dirección que pegas tú) o el programa Hermes u OpenClaw de tu equipo, que sale
  por su cuenta.
- **El móvil** va por Tailscale; Adeorq ejecuta `tailscale` en tu equipo.
- **El navegador del panel y las ventanas de localhost del lienzo** cargan la página que
  abras tú.
- **Los agentes** (Claude Code, Codex…) y el conserje salen a internet por el programa de
  cada uno, no por Adeorq.

Ollama, Discord, la voz local y los servidores del móvil y del MCP se quedan dentro de tu
equipo.

---

## 27. Glosario en cristiano

- **Terminal**: una ventana de texto donde vive un programa. No es magia: es la forma
  original de hablar con el ordenador, sin botones.
- **Pane** (panel): cada recuadro de terminal.
- **Sesión**: una conversación con un agente, guardada en disco, que se puede retomar
  meses después.
- **Contexto**: la memoria de trabajo de esa conversación. Todo lo que el modelo tiene
  delante ahora mismo: tus mensajes, sus respuestas, los archivos que ha leído y los
  resultados de los comandos. Cuando se llena, comprime lo viejo y se pierde detalle.
- **Tokens**: los trocitos en los que se mide ese texto. Una palabra normal es uno o dos.
- **Ventana**: el tamaño máximo del contexto de ese modelo (200.000 tokens en el modo
  normal, un millón en los de contexto largo).
- **Esfuerzo** (low, medium, high, max): cuánto se piensa las cosas antes de responder.
  Más esfuerzo, mejores respuestas y más cuota gastada.
- **Cerebro**: el modelo que hace un trabajo (haiku, sonnet u opus). Pesan ×1, ×3 y ×5.
- **Modo auto**: el agente aplica sus ediciones sin pedirte permiso archivo a archivo,
  pero sigue preguntando lo arriesgado.
- **Subagente**: un ayudante que el agente lanza para una tarea suelta. Es lo que cuenta
  el ▣.
- **Cuota**: lo que llevas gastado de tu suscripción.
- **Cuenta**: un inicio de sesión de un programa, con su propia carpeta.
- **MCP**: la puerta local por la que un programa de IA puede mirar y manejar tus
  terminales.
- **Cuadrilla**: varias terminales abiertas de un mismo reparto.
- **Enjambre**: varias sesiones ya abiertas juntadas en una pieza del Lienzo con un solo
  chat.
- **Conserje**: el chat de Adeo que abre sesiones por ti, en el Chat y en el móvil.
- **Capataz**: el agente orquestador del orbe.

---

## 28. Dudas frecuentes

- **«¿Necesito una cuenta de Adeorq?»** No. Adeorq se usa sin crear nada. Los programas
  que ejecuta (Claude Code, Codex…) sí tienen sus propias cuentas.
- **«¿Sustituye a Claude Code o a Codex?»** No: los ejecuta. Adeorq pone la sala
  alrededor, y si mañana sacan una función nueva, la tienes el mismo día.
- **«¿Se lleva mis datos a algún sitio?»** No hay telemetría. Lo que sale de tu equipo y
  cuándo está en el [punto 26](#26-dónde-guarda-tus-cosas).
- **«¿Puedo usar dos cuentas del mismo programa?»** Sí, siempre que sean tuyas
  ([punto 12](#12-cuentas)).
- **«¿Qué pasa si cierro una terminal con un agente trabajando?»** Se cierra el programa
  y todo lo que colgara de él. Si estaba a mitad de un turno, ese trabajo se pierde: mira
  el estado antes de cerrarla. La conversación no se borra y se puede retomar.
- **«Windows dice que el instalador no es seguro.»** Es el aviso estándar para programas
  sin firma de código de pago. Pulsa *Más información › Ejecutar de todas formas*. El
  instalador va firmado con la clave del actualizador de Adeorq.
- **«He actualizado y mis terminales siguen ahí, pero con una versión vieja detrás.»**
  Es lo esperado: [punto 21](#21-actualizar-sin-perder-las-terminales).
- **«Una terminal mía no deja que otro programa escriba en ella.»** Es el escalón del MCP:
  [punto 17](#17-lo-que-puede-hacer-un-programa-de-fuera).
- **«Mi terminal se ve en blanco y negro.»** Un programa heredado le puso la variable
  `NO_COLOR`. Adeorq la limpia al abrir cada terminal; si la ves en una consola que
  abriste por otro lado, quítala.
- **«¿Por qué tengo dos Adeorq abiertos?»** La versión instalada solo permite una ventana;
  si ves dos, la otra es el modo desarrollo.
- **«No me sale la Cabina (o el Lienzo, la Memoria o el Chat).»** Está apagada en **Ajustes ›
  Aspecto › Partes de Adeorq**, o quitada de la cabecera en **La cabecera**. Ctrl+K la
  lleva igual.

---

## 29. Lo que aún no hace

- **Sesiones de Antigravity y de otros programas**: la barra lista las de Claude Code,
  Codex y Pi. Cada programa guarda sus datos a su manera y los demás no se leen todavía.
- **Mac a diario**: el instalador existe, pero no se ha usado en un Mac real.
- **Encargos programados en Linux y Mac**: el reloj está, pero no se ha probado en un
  escritorio real.
- **Música y Chromium de verdad fuera de Windows**: en Linux y Mac no hay control de
  música y el navegador del panel es una versión sencilla.
- **Que los permisos del MCP lleguen a una terminal de un proceso viejo**: tras
  actualizar, esas terminales se rigen por el nombre del programa hasta que se cierran.
