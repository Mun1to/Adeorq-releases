# Guía de Adeorq (sin jerga)

> Reescrita el 1 de agosto de 2026 sobre la versión 0.9.42.
> Va elemento por elemento: cada cosa que se ve en pantalla, qué es y para qué
> sirve. Si solo quieres una parte, salta por el índice.

## Índice

0. [Por qué usar Adeorq](#0-por-qué-usar-adeorq)
1. [Qué es Adeorq](#1-qué-es-adeorq)
2. [Las DOS barras de arriba](#2-las-dos-barras-de-arriba-la-duda-de-la-captura)
3. [Las siete pestañas](#3-las-siete-pestañas)
4. [Panel (la pestaña ◱)](#4-panel-la-pestaña-)
5. [Cabina (la pestaña ▦)](#5-cabina-la-pestaña-)
5b. [Lienzo (la pestaña ⬡)](#5b-lienzo-la-pestaña-)
6. [La cabecera de cada terminal, campo por campo](#6-la-cabecera-de-cada-terminal-campo-por-campo)
7. [Las barras que salen dentro de una terminal](#7-las-barras-que-salen-dentro-de-una-terminal)
8. [Comandos (la pestaña ⌘)](#8-comandos-la-pestaña-)
9. [Ajustes (la pestaña ⚙)](#9-ajustes-la-pestaña-)
10. [El Capataz](#10-el-capataz)
11. [Clic derecho y globos de ayuda](#11-clic-derecho-y-globos-de-ayuda)
12. [Atajos de teclado](#12-atajos-de-teclado)
13. [Leyenda de colores](#13-leyenda-de-colores)
14. [Glosario en cristiano](#14-glosario-en-cristiano)
15. [Dudas que ya has tenido](#15-dudas-que-ya-has-tenido)
16. [Lo que aún no hace](#16-lo-que-aún-no-hace)

---

## 0. Por qué usar Adeorq

Si ya tienes la app de escritorio de Claude, la pregunta es justa. Estas son las
razones por las que existe Adeorq, en orden de peso:

**1. Lo nuevo llega antes a la terminal.** Opus 5 se pudo usar en el CLI antes
que en la app, y el millón de contexto tardó bastante más en llegar. Trabajando
por terminales estrenas las cosas el día que salen.

**2. Ves TODO tu trabajo de golpe.** Todos tus proyectos de C:\proyectos y todas
sus sesiones, ordenadas por proyecto, con cuáles están vivas y cuáles te están
esperando. Sin abrir nada, de un vistazo.

**3. Varias a la vez, de verdad.** Puedes tener nueve conversaciones trabajando
en paralelo y verlas todas, cada una en su carpeta. Un agente arregla VoCript
mientras otro monta la web de Layco y una consola compila.

**4. Archivar no te borra el trabajo.** El archivar de la app oficial puede
llevarse cambios sin guardar y sin avisar. Adeorq mira antes si el proyecto
tiene trabajo sin commitear, te enseña los archivos y nunca borra nada.

**5. El Capataz te monta el tablero.** Dices «hoy quiero arreglar errores de
VoCript» y te propone qué sesiones abrir y con qué encargo. Tú das el OK.

**6. Es tuyo.** Tus reglas, tu idioma, tus temas, tus skills y tu modo emisión
para los directos. Está hecha para cómo trabajas tú, no para el término medio.

**7. Va rápido.** Rust con Tauri: pesa unos 3 MB, arranca al instante y las
terminales se dibujan por GPU.

### El mapa de la ventana

<svg viewBox="0 0 720 330" width="100%" role="img" aria-label="Mapa de la ventana de Adeorq">
  <rect x="1" y="1" width="718" height="328" rx="12" fill="none" stroke="currentColor" stroke-opacity="0.35"/>
  <rect x="1" y="1" width="718" height="42" rx="12" fill="currentColor" fill-opacity="0.07"/>
  <text x="18" y="27" font-size="13" fill="currentColor" font-weight="700">Adeorq</text>
  <text x="88" y="27" font-size="11" fill="currentColor" fill-opacity="0.85">Panel  Cabina  Agenda  Lienzo  Cuentas  Comandos  Ajustes</text>
  <text x="452" y="27" font-size="12" fill="currentColor" fill-opacity="0.6">musica</text>
  <text x="524" y="27" font-size="12" fill="currentColor" fill-opacity="0.6">Emision</text>
  <text x="606" y="27" font-size="12" fill="currentColor" fill-opacity="0.6">Capataz</text>
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
  <text x="198" y="79" font-size="11" fill="currentColor" fill-opacity="0.85">sesion   79%   Opus 5 high   C:\proyectos\Orquio</text>
  <text x="198" y="118" font-size="11" fill="currentColor" fill-opacity="0.7">el agente trabajando aqui dentro</text>
  <rect x="186" y="192" width="340" height="122" rx="10" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-opacity="0.25"/>
  <rect x="186" y="192" width="340" height="24" rx="10" fill="currentColor" fill-opacity="0.09"/>
  <text x="198" y="209" font-size="11" fill="currentColor" fill-opacity="0.85">terminal</text>
  <text x="336" y="252" font-size="11" fill="currentColor" fill-opacity="0.55">3</text>
  <rect x="538" y="62" width="168" height="252" rx="10" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-opacity="0.25"/>
  <text x="550" y="84" font-size="12" fill="currentColor" font-weight="600">Skills</text>
  <rect x="550" y="96" width="144" height="26" rx="7" fill="currentColor" fill-opacity="0.09"/>
  <text x="558" y="113" font-size="10" fill="currentColor" fill-opacity="0.75">/frontlaxweb</text>
  <rect x="550" y="128" width="144" height="26" rx="7" fill="currentColor" fill-opacity="0.09"/>
  <text x="558" y="145" font-size="10" fill="currentColor" fill-opacity="0.75">/fin</text>
  <text x="550" y="206" font-size="11" fill="currentColor" fill-opacity="0.55">4</text>
</svg>

1. **La barra de la app**: las siete vistas, los objetivos de hoy, el Pulso, la música, el modo emisión y el Capataz.
2. **Workspaces**: tus proyectos y, dentro, sus sesiones.
3. **Las terminales**: cada recuadro, un agente o una consola trabajando.
4. **Skills**: tus comandos, para arrastrarlos sobre una terminal.

---

## 1. Qué es Adeorq

Tu taller de vibe coding: una ventana donde ves TODOS tus proyectos y TODAS tus
sesiones de Claude Code, y desde donde las abres, las retomas y les hablas, sin
depender de la app de escritorio de Claude.

Ventaja de trabajar por terminales (argumento tuyo, del 24 de julio): las
novedades llegan ANTES al CLI que a la app de escritorio. Opus 5 salió primero
en la terminal, y el millón de contexto tardó mucho más en llegar a la app.

**Cómo se abre**: Adeorq está instalado como un programa normal de Windows
(menú Inicio, anclable a la barra de tareas) y se actualiza solo. El modo
desarrollo (`pnpm tauri dev`) es otra ventana distinta, solo para cuando yo
estoy construyendo la app: las dos pueden convivir abiertas.

### La primera vez que se abre

Sale una bienvenida de cuatro preguntas, y ninguna es de adorno:

1. **Cómo te llamas**, para el saludo del Panel.
2. **Dónde viven tus proyectos**: la carpeta que se lee para saber qué proyectos
   tienes. Cada subcarpeta suya es uno, y lo que abras fuera de ella cae en el
   cajón de **Sueltas**. Al elegirla te dice cuántos proyectos ve dentro, así
   que se sabe en el momento si es la correcta.
3. **Qué clientes usas**, de los que encuentre instalados. Los que no marques no
   se te propondrán como relevo cuando te quedes sin semana.
4. **El aspecto**: el tema, que se aplica mientras lo eliges.

Al terminar ofrece un **recorrido** que señala cada parte de la ventana. Los dos
se pueden repetir cuando quieras en **Ajustes › Ayuda**, y la carpeta y el
nombre se cambian en **Ajustes › Adeorq › Tú y tus proyectos**.

---

## 2. Las DOS barras de arriba (la duda de la captura)

Esto es lo que preguntaste. En Adeorq hay **dos barras** en la parte superior y
son cosas distintas:

### 2.1 La barra de la app (arriba del todo, una sola)

De izquierda a derecha:

| Elemento | Qué es |
|---|---|
| **Logo + «Adeorq»** | La marca, nada que pulsar. |
| **◱ Panel · ▦ Cabina · ▤ Agenda · ⬡ Lienzo · ◍ Cuentas · ⌘ Comandos · ⚙ Ajustes** | Las siete vistas de la app. Cambian lo que ves debajo. |
| **Número junto a «Cabina» o «Lienzo»** | Cuántas terminales tienes abiertas ahí. Si estás en el Panel y ves un 4, es que hay 4 vivas en la Cabina. |
| **El botón de Objetivos** | Abre un panel flotante con lo que quieres dejar cerrado hoy. Lo escribes, lo marcas con un clic en la fila entera (no hace falta apuntar a una casilla diminuta) y se guarda en un archivo del día, no en localStorage, para que un agente también pueda tacharlo cuando termine lo que le pediste. Se arrastra donde quieras y se puede plegar a solo el contador (por ejemplo 2/3). |
| **El Pulso** | La píldora con lo que Adeorq y sus agentes están gastando en RAM ahora mismo, y cuántos procesos de agente hay corriendo. Clic para abrir el detalle: memoria de Adeorq frente a memoria de todo el equipo. Se pone ámbar si el que aprieta es Adeorq y roja si el equipo entero va apretado, así sabes de quién es la culpa antes de abrir el Administrador de tareas. |
| **La tira de música** | Solo aparece si algo suena en el PC. Título, artista, ⏮ anterior, ❚❚/▶ pausa y ⏭ siguiente. El volumen se queda en el mezclador de Windows, para no llenar la barra. |
| **○ Emisión / ◉ En emisión** | El escudo para retransmitir: tapa rutas y datos personales, y enmascara las claves que escupan las terminales. Atajo Ctrl+Mayús+E, detalle en el [punto 9b](#9b-modo-emisión-para-directos). |
| **✦ Capataz** | Llama al agente orquestador flotante. Atajo Ctrl+Mayús+A. |

Encima de todo eso puede aparecer una **barra de actualización** azul cuando hay
una versión nueva de Adeorq: «Actualizar ahora» la descarga y «Reiniciar» la
estrena. Además te llega un aviso de Windows aunque tengas la app minimizada.

### 2.2 La barra de CADA terminal (una por recuadro)

**Tu captura es esta**, no la de la app. Cada terminal (pane) lleva su propia
cabecera con el nombre de la sesión, el contexto, el modelo y la carpeta. Está
explicada campo por campo en el [punto 6](#6-la-cabecera-de-cada-terminal-campo-por-campo).

Regla para no liarte: si pone «Adeorq» y las pestañas, es la barra de la app.
Si pone el nombre de una sesión y una carpeta, es la barra de una terminal.

---

## 3. Las siete pestañas

- **◱ Panel**: el inicio. Tus números, el Capataz, proyectos calientes, crear
  proyecto, desplegar equipos y el foco.
- **▦ Cabina**: donde se trabaja. Proyectos a la izquierda, terminales en el
  centro, skills a la derecha.
- **▤ Agenda**: el día completo en un sitio: tu calendario, las ideas
  guardadas, los objetivos de hoy y los próximos pasos de `docs/METAS.md`.
- **⬡ Lienzo**: el tablero libre, con terminales que se mueven y se conectan
  con flechas.
- **◍ Cuentas**: todas tus cuentas de agentes en un sitio, agrupadas por
  programa, con cuál está conectada y cuánto te queda.
- **⌘ Comandos**: la chuleta buscable de todo lo que se puede escribir dentro
  de Claude, Antigravity y tus skills.
- **⚙ Ajustes**: idioma, tema, tamaño de letra, actualizaciones, tu cuota y,
  en Ayuda, esta misma guía (ya no es una pestaña de arriba).

Las terminales NO se cierran al cambiar de pestaña: siguen vivas en la Cabina.

---

## 4. Panel (la pestaña ◱)

### Los tres números de arriba

1. **Sesiones en vivo ahora**: cuántas conversaciones de Claude están abiertas
   en este momento en tu ordenador (aquí o en cualquier otra app).
2. **Sesiones esta semana**: cuántas has tenido en los últimos días, contando
   todos los proyectos.
3. **Proyectos en C:\proyectos**: cuántas carpetas de trabajo tienes.

### ✦ Capataz (tarjeta fija)

La versión de sobremesa del orquestador: le escribes el objetivo del día, te
propone el plan y no ejecuta nada sin tu OK. Detalle en el [punto 10](#10-el-capataz).

### Proyectos calientes

Los 6 proyectos con más sesiones esta semana. Clic en uno y te lleva a la
Cabina con ese proyecto ya desplegado.

### ＋ Nuevo proyecto

Escribes el nombre y Crear: se crea la carpeta en `C:\proyectos` con
`AGENTS.md`, `docs/METAS.md`, `.gitignore` y el repo git inicializado. Listo
para su primera sesión.

**Con TUS reglas, si quieres.** El `AGENTS.md` que nace de fábrica es un punto
de partida corto y neutro. Si tienes tus propias normas y quieres que todos tus
proyectos nuevos vengan ya con ellas, déjalas en
`%LOCALAPPDATA%\Adeorq\plantilla-agents.md` y Adeorq usará esa en lugar de la
suya. Dentro puedes escribir `{name}` donde quieras que vaya el nombre del
proyecto. Si el archivo no está, no pasa nada: se usa la de fábrica.

### ⚑ Misión: despliega un equipo

Escribe qué quieres («una landing con formulario que guarde en SQLite»), elige
el proyecto y marca roles (Frontend, Backend, Seguridad, Diseño). Adeorq abre
UN Claude por rol, cada uno con su cometido, la orden de tocar solo los
archivos de su área y de coordinarse con los demás por el `BUZON.md` del
proyecto. Cada agente propone su plan en 3 líneas y espera tu OK.

### El foco

Tu única fecha real del sistema, escrita a la vista para que no se pierda entre
proyectos: el distintivo de IA en orquio.com antes del 2 de agosto.

---

## 5. Cabina (la pestaña ▦)

Tres zonas:

```
+----------------+--------------------------------------+-----------+
|  IZQUIERDA     |  CENTRO                              |  DERECHA  |
|  Workspaces    |  Las terminales                      |  Skills   |
|  (proyectos y  |  Cada recuadro = una conversación    |  (tus     |
|  sus sesiones) |  o una consola trabajando            |  comandos)|
+----------------+--------------------------------------+-----------+
```

### 5.1 Columna izquierda: workspaces

De arriba abajo:

- **Buscador**: filtra por nombre de proyecto o por título de sesión. Mientras
  escribes, todos los proyectos se despliegan solos.
- **Fila «Workspaces»** con dos botones a la derecha:
  - **⊟ n.º**: ver u ocultar las sesiones archivadas (solo sale si hay alguna).
  - **↻**: releer proyectos y sesiones ahora mismo (se refresca solo cada 45 s).
- **La lista de proyectos**. Cada proyecto es una tarjeta con:
  - **Su logo** en un recuadro a la izquierda, como los servidores de Discord.
    Adeorq lo busca solo dentro de la carpeta del proyecto (`brand/`,
    `assets/`, `public/`, `web/public/`, `src-tauri/icons/`… y también el
    icono que le hayas puesto tú a la carpeta en el explorador de Windows).
    Si no encuentra ninguno, dibuja sus iniciales con el color de ese proyecto.
    Clic derecho en la tarjeta para **ponerle un logo a mano**, quitarlo, o
    volver a buscar si acabas de añadir uno.
  - **Nombre** del proyecto. Clic = desplegar o plegar sus sesiones. Nada más:
    no se abre nada pesado sin que lo pidas.
  - **Punto verde** junto al nombre: tiene una sesión abierta AHORA MISMO.
  - **Pastilla azul**: cuántas sesiones ha tenido esta semana.
  - **Pastilla roja**: cuántas de esas están esperando algo tuyo (si no hay,
    no aparece).
  - Al pasar el ratón, cuatro botones:
    - **⧉** abre de golpe sus sesiones (hasta el tope que pongas en Ajustes,
      12 por defecto). Esto es lo pesado: cada sesión son unos 200 MB.
    - **✦** abre una sesión NUEVA de Claude en ese proyecto.
    - **>_** abre una consola PowerShell normal en esa carpeta.
    - **AG** abre Antigravity (`agy`) en una terminal de esa carpeta.
- **Separador «sin sesiones recientes»**: debajo van los proyectos que llevan
  tiempo parados, para que no hagan ruido arriba.
- **El borde derecho de la columna** se arrastra para ensancharla y se recuerda.
- **Pie**: `C:\proyectos · sesiones de ~/.claude`, que es de dónde saca todo.

El orden de la lista no es alfabético: primero los que tienen algo abierto,
luego los de actividad más reciente.

### 5.2 Cada sesión dentro de un proyecto

Una sesión es una conversación tuya con Claude Code que quedó guardada. En su
fila ves el punto de estado, el título y hace cuánto fue.

- 🟢 verde: abierta ahora mismo.
- 🟡 ámbar: Claude te dejó una pregunta o una oferta esperando.
- 🔵 media: quedó a medias.
- ⚪ gris: sin nada pendiente.

Además, la fila entera se tiñe cuando espera por ti: **fondo ámbar** si Claude
terminó preguntándote algo y **fondo rojizo** si te dejó una pregunta con
opciones y está parado hasta que respondas (como en la app de escritorio).

**▣ n.º en la fila**: esa sesión tiene AHORA MISMO ese número de subagentes
trabajando dentro. Antes esto solo se veía abriendo la terminal; ahora se ve
desde la lista, que es donde sirve para decidir cuál mirar. El número sale de
contar en el historial cada ayudante lanzado menos cada uno que ya ha vuelto,
así que es exacto, no una estimación, y desaparece cuando terminan. Pasa el
ratón y te dice cuántos hay ahora y cuántos ha desplegado en total.

**¿Por qué salían decenas de sesiones «(sin título)»?** Era un fallo de Adeorq,
arreglado el 26 de julio de 2026. El panel de uso pregunta tu cuota con
`claude -p /usage`, y aunque eso no gasta nada, **cada consulta dejaba una
sesión guardada**: en una noche llenó la lista con 59 filas vacías. Es decir, la
parte que vigila tu plan estaba ensuciando la parte que enseña tu trabajo.
Ahora cada consulta lleva su propio identificador y Adeorq borra ese archivo en
cuanto lee la respuesta, y por si acaso, esas sesiones ya no se listan aunque
queden en el disco.

**Clic en una sesión = se retoma en una terminal del centro**, con toda su
memoria, exactamente donde la dejaste.

El botón **⋯** (o el clic derecho) da sus tres acciones:

- **✎ Renombrar**: nombre nuevo y Enter. Se guarda donde la app oficial guarda
  los títulos, así que el cambio se ve en Adeorq y en la app oficial.
- **▣ Mover a grupo…**: crea grupos manuales dentro del proyecto (por ejemplo
  «web nueva») y cuelga la sesión de ahí. La × del grupo lo disuelve sin tocar
  las sesiones.
- **⊟ Archivar**: la esconde de la lista. Antes de hacerlo, Adeorq mira si el
  proyecto tiene **trabajo sin guardar en git** y te lo dice CON la lista de
  archivos. Esto es lo que la app oficial no hace (su archivar puede borrar
  cambios sin avisar). Aquí archivar NUNCA borra nada y es reversible: botón
  **⊟** arriba y luego ↩ en la sesión.

### 5.3 Centro: la rejilla de terminales

Las terminales se colocan en columnas (hasta 3) y dentro de cada columna se
apilan. Cuando partes un pane a la derecha nace una columna nueva; cuando lo
partes abajo, se apila en la suya.

Cada recuadro es una terminal de verdad, con su programa dentro:

- **✦ Claude**: Claude Code corriendo de verdad, el mismo que en la app de
  escritorio pero en su forma original de texto. Todos los que abre Adeorq
  arrancan en modo auto (acepta ediciones y sigue preguntando lo arriesgado);
  Mayús+Tab dentro cambia de modo.
- **◈ Antigravity**: el agente de Google (`agy`), también en modo auto.
- **>_ shell**: una consola PowerShell normal, para `pnpm dev`, `git status` o
  lo que quieras.

**Copiar y pegar como en cualquier app**: Ctrl+V pega (también el clic derecho),
Ctrl+C copia si hay selección y, si no la hay, sigue siendo el «corta lo que
está pasando» de toda la vida. **Pegar una imagen** funciona: se guarda en
disco y el agente recibe su ruta, que es lo que él sabe leer. Arrastrar un
archivo de imagen encima hace lo mismo.

### 5.4 Columna derecha: tus Skills

Son tus comandos personales de `~/.claude/skills`. **Arrastra uno encima de una
terminal** y se pega en su cajita; el clic normal lo manda al pane activo. El
botón ▸ pliega el panel a una pestaña fina para ganar sitio. Cuando crees un
skill nuevo, aparece solo.

---

## 5b. Lienzo (la pestaña ⬡)

La Cabina te da una rejilla ordenada. El Lienzo te da un tablero infinito: las
terminales se colocan donde quieras, se agrandan a mano y, sobre todo, **se
conectan con flechas**.

Importante: el Lienzo tiene SUS PROPIAS terminales. Las de la Cabina siguen
donde estaban, no se mueven ni se cierran.

### La barra de arriba del lienzo

Eliges el proyecto y sueltas lo que quieras en el tablero: **✦ Claude**,
**>_ Terminal** o **◈ Antigravity**. Cada uno nace como una tarjeta.

### Mover, agrandar y navegar

- **Arrastrar una tarjeta**: se agarra por su cabecera (la barra del nombre).
  Por dentro el ratón es de la terminal, así puedes seleccionar texto normal.
- **Agrandar**: selecciona la tarjeta y tira de sus esquinas.
- **Moverte por el tablero**: arrastra el fondo. La rueda hace zoom (dentro de
  una terminal la rueda es para su scroll, no para el zoom).
- Abajo a la derecha tienes el mapa en miniatura y los botones de zoom.
- El botón **⛶** de una tarjeta la centra y hace zoom sobre ella.
- El botón **◫** abre una consola hermana en la misma carpeta, ya conectada.

### Las flechas: el encadenado

Esto es lo que hace que el lienzo valga la pena.

1. Arrastra desde el punto del borde derecho de una tarjeta hasta el punto
   izquierdo de otra: nace una flecha.
2. **Clic en la flecha** para escribir el encargo: qué tiene que hacer el
   segundo agente con lo que produzca el primero. Ahí también está la casilla
   «Enviar solo, sin preguntarme».
3. Cuando el primer agente **termina su turno**, abajo aparece el relevo:
   «Frontend terminó → Backend», con el botón **Pasar el relevo**. Al pulsarlo,
   Adeorq escribe en el segundo agente tu encargo MÁS la última respuesta del
   primero, y la envía. El botón **✎** la deja escrita sin enviar, por si
   quieres retocarla.

Detalle honesto: la respuesta del primero se lee de su historial, que es texto
limpio, no de lo que se ve en pantalla (que va lleno de colores y cajas). Si
abres dos terminales NUEVAS en la misma carpeta, el relevo puede leer la
equivocada: para encadenar, mejor una por proyecto o sesiones retomadas.

Y lo de siempre: sin marcar la casilla de automático, nada se manda sin que tú
lo pulses.

### Utilidades y Widgets en el Lienzo

Además de terminales y agentes, en el Lienzo puedes añadir utilidades que viven al lado de tu flujo de trabajo:
- **🍅 Pomodoro**: Temporizador de concentración de 25 min y descansos de 5 min con aviso del sistema y sonido.
- **⏱️ Cronómetro**: Cronómetro con precisión de centésimas y registro de vueltas.
- **⌛ Cuenta atrás**: Temporizador personalizable (1, 5, 10, 25 min o a medida).
- **🧮 Calculadora**: Calculadora integrada con historial y evaluación segura.
- **🗓️ Calendario**: Calendario mensual con bloc de notas diario guardado automáticamente en Markdown.

---

## 6. La cabecera de cada terminal, campo por campo

Esta es la barra de tu captura. De izquierda a derecha:

<svg viewBox="0 0 720 78" width="100%" role="img" aria-label="Cabecera de una terminal">
  <rect x="1" y="20" width="718" height="34" rx="9" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-opacity="0.3"/>
  <rect x="20" y="27" width="20" height="20" rx="6" fill="currentColor" fill-opacity="0.2"/>
  <g transform="translate(30 37) scale(0.55) translate(-12 -12)">
    <path d="M12 10.8V2.8M12.65 10.99 16.97 4.26M13.09 11.5 20.37 8.18M13.19 12.17 21.11 13.31M12.91 12.79 18.95 18.02M12.34 13.15 14.59 20.83M11.66 13.15 9.41 20.83M11.09 12.79 5.05 18.02M10.81 12.17 2.89 13.31M10.91 11.5 3.63 8.18M11.35 10.99 7.03 4.26" fill="none" stroke="currentColor" stroke-opacity="0.85" stroke-width="2.5" stroke-linecap="round"/>
  </g>
  <text x="52" y="42" font-size="12" fill="currentColor" fill-opacity="0.9">Adeorq: sesiones y terminales</text>
  <rect x="266" y="30" width="34" height="6" rx="3" fill="currentColor" fill-opacity="0.4"/>
  <text x="266" y="48" font-size="10" fill="currentColor" fill-opacity="0.7">79%</text>
  <rect x="314" y="28" width="88" height="18" rx="6" fill="currentColor" fill-opacity="0.14"/>
  <text x="322" y="41" font-size="10" fill="currentColor" fill-opacity="0.85">Opus 5   high</text>
  <text x="416" y="42" font-size="11" fill="currentColor" fill-opacity="0.55">C:\proyectos</text>
  <text x="566" y="42" font-size="12" fill="currentColor" fill-opacity="0.7">tapar  partir  pantalla  cerrar</text>
  <text x="24" y="14" font-size="10" fill="currentColor" fill-opacity="0.6">1</text>
  <text x="52" y="14" font-size="10" fill="currentColor" fill-opacity="0.6">2</text>
  <text x="270" y="14" font-size="10" fill="currentColor" fill-opacity="0.6">3</text>
  <text x="320" y="14" font-size="10" fill="currentColor" fill-opacity="0.6">4</text>
  <text x="418" y="14" font-size="10" fill="currentColor" fill-opacity="0.6">5</text>
  <text x="568" y="14" font-size="10" fill="currentColor" fill-opacity="0.6">6</text>
  <text x="10" y="70" font-size="10" fill="currentColor" fill-opacity="0.55">quien y si vive</text>
  <text x="88" y="70" font-size="10" fill="currentColor" fill-opacity="0.55">sesion</text>
  <text x="262" y="70" font-size="10" fill="currentColor" fill-opacity="0.55">contexto</text>
  <text x="320" y="70" font-size="10" fill="currentColor" fill-opacity="0.55">modelo</text>
  <text x="418" y="70" font-size="10" fill="currentColor" fill-opacity="0.55">carpeta</text>
  <text x="566" y="70" font-size="10" fill="currentColor" fill-opacity="0.55">botones</text>
</svg>


| Elemento | Qué significa |
|---|---|
| **El icono** (el destello de Claude, la flecha en órbita o el símbolo de consola) | Qué hay dentro: Claude Code, Antigravity o una consola. Y también si sigue vivo: cuando el programa termina, el icono se apaga a gris. Antes esto último era un cuadradito verde aparte; ahora lo dice la propia marca y la barra respira. El nombre sale al pasar el ratón. |
| **El nombre** (tu «Adeorq: sesiones y terminales») | El título de la sesión, el mismo que ves en la lista de la izquierda. Si lo renombras allí, cambia aquí. |
| **▣ n.º** | Cuántos subagentes están trabajando AHORA dentro de esa sesión. Se cuentan en el historial (cada ayudante lanzado menos cada uno que ya ha vuelto), así que es el dato exacto, no una estimación. Solo aparece mientras los hay. |
| **La barra + %** (tu 79%) | El contexto: cuánto lleva ocupado de su memoria de trabajo. Pasa el ratón y te dice los tokens exactos y el total. Se pone ámbar a partir del 80%. |
| **«Opus 5» + «high»** | El modelo que está pensando y su esfuerzo. Se cambian dentro del pane con `/model` y `/effort`. |
| **La carpeta** (tu `C:\proyectos`) | Dónde está trabajando ese agente. Importante: si aquí no sale la carpeta del proyecto, ese agente no ve el código del proyecto. |
| **○ / ◉** | Tapa solo ESTA terminal (desenfoque), para emitir sin cerrar nada. |
| **◫** | Partir: abre una consola AL LADO, en la misma carpeta. |
| **⬓** | Partir: abre una consola DEBAJO. |
| **⛶ / ❐** | Pantalla completa para ese pane, y volver. |
| **×** | Cerrar la terminal (la conversación no se borra, sigue en la lista). |

**Los glows** (idea del panel de BridgeMind): el pane donde estás trabajando
lleva un halo del color del tema; cuando un agente TERMINA su turno y te
espera, su pane se enciende con un **glow azul** hasta que lo abres. Así ves de
un vistazo quién ha acabado sin leer nada.

---

## 7. Las barras que salen dentro de una terminal

Adeorq vigila lo que aparece en pantalla y traduce lo críptico a botones:

1. **Barra azul de preguntas**: cuando el agente pregunta con un menú de
   números (permiso para un comando, confiar en la carpeta, cómo retomar la
   sesión), salen BOTONES con las opciones. Clic y respondido. Desaparece sola
   cuando la pregunta se va, y también puedes responder con el teclado.
2. **Aviso amarillo de reconexión**: si tu acceso caduca («OAuth access token
   has expired»), sale el botón **Reconectar**, que es lo mismo que escribir
   `/login`. Se abre el navegador, confirmas y sigues.
3. **Notas en cristiano**: cuando el agente está comprimiendo la memoria de la
   charla (el `/compact`, tarda unos segundos) o cuando está ocupado y lo que
   escribas queda en cola.

---

## 7b. Cuentas (la pestaña ◍)

Todas tus cuentas de agentes en un sitio, agrupadas por programa.

**Qué es una cuenta aquí.** Cada CLI de agente guarda TODO lo suyo (tu login,
tu historial, sus ajustes) en una carpeta. Si le dices que use otra carpeta, se
comporta como una instalación limpia: otro login, otros límites. Eso es lo que
hace Adeorq. Tu cuenta de siempre no se toca nunca; las demás viven en una
carpeta propia dentro de Adeorq.

**Qué programas conoce**, con la variable que mueve su carpeta, comprobada una
por una en tu equipo el 26 de julio de 2026:

| Programa | ¿Varias cuentas? | Cómo | ¿Enseña cuánto gastas? |
|---|---|---|---|
| Claude Code | Sí | `CLAUDE_CONFIG_DIR` | Sí, y gratis |
| Codex | Sí | `CODEX_HOME` | No |
| Gemini CLI | Sí | `GEMINI_CLI_HOME` | No |
| Qwen Code | Sí | `QWEN_HOME` | No |
| Pi | Sí | `PI_CODING_AGENT_DIR` | No |
| GitHub Copilot | No | usa `~/.copilot` y no deja moverlo | No |
| Crush | No | no encontré variable | No |
| opencode | No | no encontré variable | No |
| Amp | No | no encontré variable | No |
| Antigravity (`agy`) | No | guarda su estado en `~/.gemini` | No |
| Cursor | No | no encontré variable | No |

Las cinco primeras se pueden multiplicar porque **comprobé una a una** que su
variable mueve de verdad la carpeta: en Codex moví la variable y vi migrar su
`auth.json`; en Gemini y Qwen está escrito en su propio código. Donde pone «no
encontré variable» es exactamente eso, ni más ni menos: si aparece, se añaden
en una línea. Prefiero decirte «no lo sé» a inventarme un nombre de variable y
que una cuenta acabe escribiendo en la carpeta equivocada.

**Pi** (pi.dev) entró el 1 de agosto de 2026 con el mismo listón: su
`config.ts` dice que `getAgentDir()` lee `PI_CODING_AGENT_DIR` y, si no está,
usa `~/.pi/agent`; y su login guarda en `auth.json` dentro de esa misma
carpeta. Ojo con un detalle que se cuela fácil: su carpeta es `.pi/agent`, no
`.pi` a secas, así que buscar el login en `.pi` diría «desconectada» siempre.
Es un agente que habla con varios proveedores (Claude Pro/Max, ChatGPT,
Copilot), y por eso **no aparece como relevo automático** cuando te quedas sin
semana: si su login es el de tu propia cuenta de Claude, mandarte ahí sería
mandarte a la misma cuota agotada.

Los que no tengas instalados salen abajo, en «No instalados», con el comando
para instalarlos; en cuanto aparezcan se colocan solos arriba.

⚠ Dos avisos de instalación que costaron una comprobación: los paquetes de npm
llamados `agy`, `antigravity-cli` y `cursor-agent` **no son de sus empresas**
(uno se describe a sí mismo como «placeholder» y otro es de un tercero), así
que esos dos van por su instalador oficial. Y `opencode` por pnpm deja en
Windows un `.exe` de 0 bytes que no arranca; también por su instalador.

**Antigravity, el caso de `agy`**: se instala con `irm
https://antigravity.google/cli/install.ps1 | iex` y deja el programa en
`%LOCALAPPDATA%\agy\bin`. Si un día «desaparece», mira ahí antes que en ningún
sitio: pasó el 26 de julio de 2026 y lo que había ocurrido es que la carpeta se
había borrado pero su entrada seguía en el PATH, así que Windows buscaba en un
sitio que ya no existía.

**Qué ves en cada tarjeta**: el nombre que tú le pongas y si está conectada.
En las de Claude, además, su plan y las barras de sesión y semana con su hora
de renovación. Eso sale gratis porque `/usage` es un comando local. **Los demás
programas no publican tu consumo en el equipo**, así que ahí la tarjeta lo dice
en vez de inventarse una barra: es un límite de ellos, no de Adeorq.

⚠ Antigravity es un caso aparte: guarda su estado dentro de `~/.gemini` y no le
he encontrado ninguna variable para moverlo, así que solo puede tener una
cuenta. Se dice en su propia sección para que no lo busques.

**Qué puedes hacer**:
- **Añadir cuenta**: le pones un nombre (el que tú quieras, nunca tu correo, que
  esta pantalla puede acabar en un directo), se le crea su carpeta y se abre una
  terminal donde el propio programa te pide el login.
- **Usar por defecto**: las terminales nuevas de Claude nacerán con esa cuenta.
- **Terminal con esta**: una sesión con una cuenta concreta, sin cambiar la
  predeterminada.
- **Renombrar** y **Quitar**. Quitar borra SOLO la carpeta de esa cuenta, con su
  historial; tu cuenta principal y tus proyectos no se tocan.

**La cuenta se decide al abrir la terminal y ya no cambia**, porque el CLI lee
esa carpeta una sola vez, al arrancar. Cuando una terminal no usa la principal,
lleva su nombre en una pastilla azul en la cabecera. Y si Adeorq recupera tu
tablero al abrirse, cada terminal vuelve a nacer en su cuenta.

**Y en cada proyecto**: al hacer clic derecho sobre un proyecto de la izquierda
te salen también los programas que tengas instalados (Codex, Gemini…), para
abrirlos en esa carpeta sin pasar por aquí. Cada uno arranca en su modo
equivalente al de Claude: aplica los cambios de archivos solo, pero sigue
pidiéndote permiso para lo arriesgado.

⚠ Varias cuentas TUYAS, sin problema. Turnarte cuentas de otras personas para
estirar los límites incumple los términos de Anthropic, y lo que te juegas es
que te cierren la cuenta.

---

## 8. Comandos (la pestaña ⌘)

La chuleta de la casa: 66 comandos de Claude Code y Antigravity más tus skills,
leídas del disco.

- **Buscador**: busca por lo que quieres hacer, no por cómo se llama. Escribe
  «deshacer», «cuota», «contexto» o «seguridad» y salen los que valen.
- **Filtros**: Todos · Claude Code · Antigravity (agy) · Tus skills.
- **Clic en un comando** y se escribe en la terminal activa. El Enter lo das tú,
  así nunca se ejecuta nada por accidente.

El Capataz tiene esta misma lista, así que puedes preguntarle «¿hay algún
comando para X?» y te lo deja escrito.

---

## 9. Ajustes (la pestaña ⚙)

- **Idioma**: español o inglés. Cambia la app entera, incluida esta guía. Las
  terminales siguen hablando lo que hable cada agente.
- **Tema**: Azul noche, Grafito, Violeta, Bosque, Carmín, Ámbar, Océano, Neón, Ártico, Cyberpunk, Drácula, Tokyo Night, Esmeralda, Ocaso, Matrix, Synthwave '84, Solarizado, Rosé Pine, Gruvbox, One Dark, Catppuccin Mocha, Volcán, Turquesa y Claro. El cristal y el
  desenfoque se mantienen en todos.
- **Terminales**:
  - *Ajustar la letra al tamaño de cada terminal* (activado): cuando tienes
    muchas terminales abiertas y cada una es estrecha, la letra encoge sola
    hasta que la línea vuelve a caber, en vez de quedarse enorme y partir las
    cajas del agente. Con esto activado, el tamaño que eliges abajo es el
    MÁXIMO, no un valor fijo.
  - *Tamaño de la letra* (11 a 22 px). Se aplica en caliente: las terminales
    abiertas cambian de tamaño sin reiniciarse.
  - *Cuántas sesiones abre el botón ⧉* (2 a 20). Cada una son unos 200 MB, por
    eso hay tope.
- **Tú y tus proyectos** (en la sección Adeorq): tu nombre y la carpeta de
  proyectos. Cambiarla vuelve a leer la lista entera, así que es la forma de
  mover Adeorq a otro sitio de trabajo sin reinstalar nada.
- **Ayuda**: «Primeros pasos» repite la bienvenida o solo el recorrido por las
  funciones; debajo vive esta misma guía completa (dejó de ser una pestaña de
  arriba) y, al lado, el enlace a la documentación de la web, que se actualiza
  sin esperar a una versión nueva de la app.
- **Actualizaciones**: la versión que tienes instalada y un botón para buscar
  ahora. De todas formas mira sola al arrancar y cada 6 horas.
- **Tu cuota**: el botón escribe `/usage` en la terminal que tengas activa y te
  lleva allí. Ese dato solo lo sabe Claude por dentro, por eso hace falta una
  sesión abierta.

---

## 9b. Modo emisión (para directos)

Pensado para que puedas emitir sin regalar tus claves. Tiene cuatro piezas:

1. **Tapado, no desenfoque**: rutas, el pie de la barra y el contenido de la
   Agenda se cubren con una barra sólida. El desenfoque suave se puede deshacer
   desde una grabación, por eso ya no se usa. **Los títulos de tus sesiones y
   los objetivos del día NO se tapan**: son el hilo de lo que estás haciendo, y
   sin ellos el directo no se entiende.
2. **Alt para mirar**: el ratón por encima ya NO revela nada (antes bastaba con
   pasar por una fila en directo). Mantén **Alt** para ver lo tapado y suelta
   para volver a ocultarlo. Si cambias de ventana, se tapa solo.
3. **Escudo en las terminales**: lo que escribe el agente se revisa ANTES de
   pintarse y se sustituye por ●●● lo que tenga forma de clave: tokens de
   GitHub, claves de Anthropic, OpenAI, AWS o Google, JWT de Supabase,
   contraseñas dentro de una cadena de conexión, variables tipo `API_KEY=...`,
   tu correo y tu usuario en las rutas. El agente sí recibe el texto real: solo
   se oculta a la vista.
4. **Ctrl+Mayús+P, la cortina**: tapa la ventana entera al instante. Y si el
   escudo pilla una clave, la cortina se levanta sola por si viene más.
5. **La barra que avisa de lo que tapó**, y lo importante es entender qué te
   dice. El escudo actúa ANTES de que se pinte, así que si sale la barra es
   que **en el directo no se llegó a ver nada**. Por eso el consejo depende de
   lo que fuese:
   - **Barra roja** (clave, token, contraseña): no se vio, pero esa clave sigue
     suelta donde estuviera guardada. Lo que hay que mirar es de dónde salió.
   - **Barra azul** (tu correo, una ruta con tu usuario): tapado y ya está. Una
     carpeta no se puede «rotar», así que no hay nada que hacer, y el aviso se
     va solo a los nueve segundos.

   Antes las dos decían lo mismo, «dala por quemada y rótala», que para una
   ruta no significa nada y solo mete miedo. Corregido el 26 de julio de 2026.

Lo que NO hace, para que no te confíes: no arregla lo que ya salió antes de
activarlo, no tapa tu navegador ni las notificaciones de Windows, y ninguna
lista de patrones es completa. Lo que más te protege sigue siendo un **retardo
de 30 segundos en OBS**. El razonamiento entero está en `docs/EMISION.md`.

---

## 10. El Capataz

Tu agente orquestador. Le escribes lo que quieres y te propone un plan; NADA se
ejecuta sin tu OK. Vive en dos sitios: la tarjeta fija del Panel y el flotante
de la Cabina (Ctrl+Mayús+A o el botón ✦ Capataz).

Ejemplos de pedidos reales:

- «hoy quiero arreglar errores de VoCript»
- «quiero hacer la web de Layco»
- «en Layco: Antigravity al frontend y un Claude al backend para el formulario»

Qué sabe hacer: retomar sesiones concretas, abrir Claudes nuevos con un encargo
escrito, abrir terminales, lanzar Antigravity y escribirte un comando.

**Cómo funciona por dentro** (para que no sea magia): tu pedido va a UN Claude
en modo pregunta y respuesta (gasta tu cuota Max, sin API keys) junto con la
lista real de tus proyectos, sesiones, skills y comandos. Devuelve un plan en
formato fijo. Adeorq comprueba cada acción contra lo que existe de verdad: si
menciona algo que no existe, esa acción sale **tachada** y no se ejecuta. Solo
con tu OK se abren los panes.

**En la lista del plan ves con qué cerebro abre cada cosa**, y debajo, antes del
botón, lo que pesa el plan entero: «Abre 6 agentes · 2 opus + 4 sonnet · ×22».
No es una factura (con suscripción no hay factura): es la única cifra
comparable que existe, tomando haiku como 1. Si tu semana va por debajo del
40 % restante, también sale cuánto queda.

Ese cerebro ya no sale de una tabla fija: pasa por el mismo router que la ficha
de encargos, así que **mira tu cuota de verdad**. Con la semana agotada, un plan
de seis agentes se abarata solo donde se puede abaratar, y te lo dice en el
globo de cada línea. Lo único que nunca se abarata es lo de juicio (seguridad,
revisiones, auditorías): ahí ahorrar cerebro cuesta repetir el trabajo entero.
Si el plan pidió un modelo concreto, se respeta, salvo que no quede semana.

Dos cosas que aprendió con tu feedback:

- Elige solo las sesiones que encajan con el objetivo del día, no todas las del
  proyecto, y prefiere 2 o 3 buenas antes que 6 de relleno.
- Nunca retoma una sesión que se abriría FUERA de la carpeta del proyecto (esas
  no ven el código): en su lugar abre una nueva ahí y te lo dice.

**Antigravity en equipos mixtos**: si su CLI `agy` está instalado, va en un pane
como uno más. Si no lo estuviera, Adeorq escribe el encargo en `MISION.md`
dentro del proyecto, te lo copia al portapapeles y abre el IDE para que pegues.

### Escribir el encargo: el otro botón

El de al lado no monta ningún tablero. Le sueltas en una frase lo que quieres
(«que me arregle el hover del botón ese») y te devuelve **el encargo bien
escrito** y **a quién dárselo**, y espera.

Lo que sale es una ficha con tres cosas:

1. **El encargo**, editable. Lleva lo que tu frase no decía y el agente necesita
   para no preguntar: dónde mirar, qué NO tocar y cómo se comprueba que quedó
   bien. Lo que no hace es inventarse requisitos que no pediste.
2. **Para quién**: el CLI, la cuenta, el modelo y el esfuerzo.
3. **Por qué ese**, en una lista. Es lo que separa una recomendación de una
   orden: si no estás de acuerdo, ahí ves exactamente con qué.

Y tres botones: **ponerlo en la terminal que tienes delante** (le cambia el
modelo y el esfuerzo y deja el encargo escrito, sin enviarlo: el Enter lo das
tú), **abrir una terminal nueva ya nacida así**, o **copiarlo**.

**Cómo elige el cerebro** (esto es lo que te ahorra cuota):

- Lo primero es qué pide el trabajo. Un recado mecánico va a **haiku**; el
  oficio del día a día a **sonnet**; lo que exige juicio (seguridad, auditar,
  revisar, arquitectura, un bug que no se reproduce) a **opus**. El tamaño no
  sube de modelo: una tarea enorme y mecánica sigue siendo mecánica.
- Lo que sí sube es la **consecuencia**: si un fallo puede pasar desapercibido y
  hacer daño después, sube un escalón.
- Después mira **tu semana de verdad**, cuenta por cuenta. Con la semana justa
  abarata lo que se puede abaratar, elige la cuenta con más margen y, si no
  queda semana en ninguna de Claude, propone otro CLI **de los que tengas
  conectados**, con el plan B a la vista.
- Lo que **nunca** hace es abaratar una auditoría para ahorrar cuota: repetir
  ese trabajo cuesta más que la diferencia. Cuando eso pasa, te lo dice.

Y siempre puedes cambiarlo a mano: los tres cerebros salen con su peso al lado
(`haiku ×1`, `sonnet ×3`, `opus ×5`, las proporciones del precio de lista).

**Los relevos a otro CLI son opinión, y está dicho así en el código**: solo
entran cuando hay un motivo objetivo, que es que no te quede semana. Recomendar
Codex «porque es mejor en esto» sin nada que lo respalde sería justo lo que esta
pieza evita. Y ojo: **solo Claude publica cuánto le queda**, así que de los
demás CLIs Adeorq sabe si están conectados, no cuánto tienen.

En Ajustes → Avisos eliges cuánto opina sobre el modelo que ya tienes puesto:
solo las diferencias gordas (de fábrica), cualquiera, o nunca.

---

## 10b. El Reparto (varias tareas de golpe)

El botón de las tres ramas, al lado del Asistente. El Asistente resuelve UNA
cosa; esto resuelve un día entero.

Pegas tus tareas, una por línea, o marcas las que ya tienes apuntadas: los
**objetivos de hoy** y las **ideas que tus agentes te dejaron en la Agenda**
salen ahí mismo con una casilla, para no copiarlas a mano.

Al darle a Repartir pasa esto, en orden:

1. **Una sola llamada** clasifica TODAS las tareas y les reparte los archivos.
   Es una llamada, no una por tarea, y además así el modelo ve la lista entera,
   que es lo único que le permite decidir que dos tareas no se pisen.
2. **El código decide el destino de cada una**: cliente, cuenta, modelo y
   esfuerzo, mirando qué tienes instalado, qué cuentas están conectadas, cuánta
   semana te queda y **qué plan tienes contratado**. Eso no gasta ni un token.
3. **Se escribe el papel común** en el `BUZON.md` del proyecto: quién hace qué,
   qué archivos son de cada uno y dónde apuntar lo que termine. Si el
   `.gitignore` no lo tapaba, se añade solo, porque ese archivo no se versiona
   jamás (regla Q).
4. **Se abren todas**, escalonadas, cada una con su encargo ya escrito en el
   idioma de su cliente: las skills (`/frontlaxweb`) solo se le ofrecen a Claude
   Code, porque en los demás esa barra no hace nada.

Antes del botón final ves lo que pesa el lote entero («Abre 4 agentes · 1 opus +
3 sonnet · ×14»), y los avisos: si dos tareas van al mismo proyecto sin
archivos repartidos, te lo dice, porque dos agentes sobre el mismo archivo van
más lento que uno detrás de otro.

**El plan de pago manda como manda la cuota**: solo hacia abajo, y nunca en lo
de juicio. Sin suscripción no se propone opus para un recado, pero una auditoría
sigue saliendo en opus, porque repetirla cuesta más que el turno.

---

## 11. Clic derecho y globos de ayuda

Adeorq no usa los menús del navegador: son suyos, en español y con los atajos
escritos.

- **Clic derecho en una terminal**: copiar, pegar, partir a la derecha, partir
  abajo, maximizar, tapar para emitir y cerrar.
- **Clic derecho en un proyecto**: Claude nuevo, terminal, Antigravity y abrir
  todas sus sesiones.
- **Clic derecho en una sesión**: retomar, renombrar, mover a grupo, archivar.
- **Ratón encima de casi cualquier cosa**: sale un globo explicando qué es y su
  atajo. Los números y pastillas dicen qué cuentan exactamente.

---

## 12. Atajos de teclado

| Atajo | Qué hace |
|---|---|
| Ctrl+Mayús+T | Terminal nueva (en la carpeta del pane activo) |
| Ctrl+Mayús+→ | Partir el pane activo a la derecha |
| Ctrl+Mayús+↓ (o D) | Partir el pane activo abajo |
| Ctrl+Mayús+F | Maximizar o restaurar el pane activo |
| Ctrl+Mayús+A | Llamar o cerrar al Capataz |
| Ctrl+Mayús+E | Modo emisión |
| Ctrl+V / Ctrl+C | Pegar / copiar dentro de la terminal |
| Mayús+Tab | Cambiar el modo de permisos DENTRO de Claude |

### En el lienzo

Estos **se pueden cambiar** en Ajustes → Atajos del lienzo. Solo actúan con el
lienzo delante y con el foco fuera de una terminal: mientras escribes, las
teclas son de quien escribe.

| Atajo | Qué hace |
|---|---|
| Alt+C / Alt+T / Alt+G | Abrir un Claude / una terminal / un Antigravity |
| Alt+N / Alt+L / Alt+I | Poner una nota / una ventana de localhost / la galería |
| Ctrl+A | Coger todo el lienzo |
| Esc | Soltar lo cogido; si no hay nada cogido, dejar la herramienta |
| Supr | Borrar lo cogido (pregunta una vez) |
| Alt+0 | Encajar todo en la pantalla |
| V M P F L R O T E | Mano, marco, lápiz, flecha, línea, recuadro, elipse, texto, goma |
| Ctrl+Z | Deshacer el último trazo (solo con una herramienta puesta) |

Van con Alt y no con Ctrl porque dentro de una terminal Ctrl+letra es del
programa que corre ahí: Ctrl+C corta a Claude y Ctrl+R busca en el historial.

**Con el ratón:** arrastrar con el **botón derecho** rodea piezas y dibujo a la
vez, sin tener que ir a por el marco de la barra. Con Mayús, suma a lo que ya
tenías cogido. El clic derecho suelto sigue abriendo el menú de añadir.

---

## 13. Leyenda de colores

- **Verde**: vivo ahora mismo (sesión abierta, proceso corriendo).
- **Ámbar**: te espera a ti (pregunta pendiente, o contexto por encima del 80%).
- **Rojo**: parado hasta que respondas, o aviso que conviene mirar.
- **Azul del tema**: lo que tienes seleccionado o el pane con el foco.
- **Glow azul en un pane**: ese agente terminó su turno.
- **Gris**: sin nada pendiente, o inactivo.

---

## 14. Glosario en cristiano

- **Terminal**: una ventana de texto donde vive un programa. No es magia: es la
  forma original de hablar con el ordenador, sin botones.
- **Pane**: cada recuadro de terminal dentro de la Cabina.
- **Sesión**: una conversación con Claude Code, guardada en disco, que se puede
  retomar meses después.
- **Contexto**: la memoria de trabajo de esa conversación. Todo lo que el
  modelo tiene delante ahora mismo: tus mensajes, sus respuestas, los archivos
  que ha leído y los resultados de los comandos. Cuando se llena, comprime lo
  viejo y se pierde detalle, por eso conviene vigilarlo.
- **Tokens**: los trocitos en los que se mide ese texto. Una palabra normal es
  uno o dos.
- **Ventana**: el tamaño máximo del contexto de ese modelo (200.000 tokens en
  el modo normal, 1.000.000 en los modelos de contexto largo).
- **Esfuerzo** (low, medium, high, max): cuánto se piensa las cosas antes de
  responder. Más esfuerzo, mejores respuestas y más cuota gastada.
- **Modo auto**: el agente aplica sus ediciones sin pedirte permiso archivo a
  archivo, pero sigue preguntando lo arriesgado.
- **Subagente**: un ayudante que el agente lanza para una tarea suelta. Eso es
  lo que cuenta el ▣.
- **Cuota**: lo que llevas gastado de tu suscripción. Se ve con `/usage`.

---

## 15. Dudas que ya has tenido

- **«¿Qué es ese 100%?»**: era un fallo del medidor, ya arreglado. Sumaba todas
  las llamadas del turno en vez de leer la última, y no detectaba los modelos
  de un millón. Lo que marcaba 100% era en realidad un 51%.
- **«Ya no aparece el modelo arriba»**: se leía de la tarjeta de bienvenida,
  que se pierde al hacer scroll. Ahora también se saca del historial de la
  sesión, así que se mantiene.
- **«Mi terminal se ve en blanco y negro»**: lo causaba una variable de entorno
  (`NO_COLOR`) heredada de quien lanzaba Adeorq. Ahora se limpia al abrir cada
  terminal y los agentes pintan a todo color.
- **«No conversation found» al retomar**: pasaba cuando la sesión se había
  guardado con la ruta en otro formato. Arreglado y con tests para que no
  vuelva.
- **«La sesión que me abrió el Capataz no está en la carpeta correcta»**:
  ahora el Capataz sabe qué sesiones nacieron fuera de su proyecto y no las
  propone para trabajar en él.
- **«¿Por qué tengo dos Adeorq abiertos?»**: la versión instalada ya solo
  permite una ventana; si ves dos, la otra es el modo desarrollo.

---

## 16. Lo que aún no hace

- **Guardar la disposición del lienzo**: al cerrar Adeorq se pierden las
  posiciones y las flechas (las terminales tampoco sobreviven al cierre).
- **Las sesiones internas de Antigravity y otros CLIs** (Codex, Gemini) no se
  listan: cada uno guarda sus datos a su manera y es investigación aparte.
- **Kanban que despacha agentes, misiones swarm y router de CLIs**: en el
  aparcadero de `docs/METAS.md`, cada uno con su condición de desbloqueo.
