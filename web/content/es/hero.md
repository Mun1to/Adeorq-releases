# Hero · español

Claves `data-i18n`. Van en `index.html`.

## hero.pildora
Terminales reales, no una caja de chat

## hero.titulo1
Nueve agentes trabajando.

## hero.titulo2 **[línea de acento]**
Una sola pantalla.

## hero.entrada
Adeorq es un panel de escritorio para Windows. Abre tus proyectos en terminales de verdad, te
enseña tus sesiones de Claude Code con su estado real, recoge las ideas al vuelo en la Agenda
y se actualiza sola.

## cta.windows
Descargar para Windows

## cta.meta
gratis, sin cuenta

## cta.como
Ver cómo funciona

## hero.nota1 **[cambia: antes decía solo Windows 11]**
Windows 10 y 11

## hero.nota2 **[cambia: concordancia, la app es femenina]**
Se actualiza sola

## hero.nota3
Sin API keys

## hero.bajar
seguir

---

## AVISO: la maqueta se rehace (26 de julio, 23:45)

Munir la vio y dijo que **no se ve realista**. Lleva razón: enseñaba un semáforo de macOS en una
app que solo existe en Windows, una lista de sesiones sueltas en vez de proyectos con sus
sesiones dentro, cabeceras de pane sin la barra de contexto ni el modelo, que es justo la firma
de Adeorq, y una salida de terminal que Claude Code no imprime.

La anatomía correcta, sacada del código de la app, está en `DISENO.md` §8 bis. **Los textos de
abajo son los nuevos**, y sustituyen a los anteriores. Los que ya no se usan quedan marcados.

## La maqueta del panel

La escena: una sesión que acaba de terminar su turno y una consola compilando. Los textos se
leen a tamaño grande, así que tienen que ser coherentes entre sí y con la app real.

### Barra superior

## demo.panel
Panel

## demo.cabina
Cabina

## demo.lienzo **[nueva]**
Lienzo

## demo.cuentas **[nueva]**
Cuentas

## demo.cabina.n **[nueva, el número de terminales abiertas junto a Cabina]**
2

## demo.emision **[nueva]**
Emisión

## demo.capataz **[nueva]**
Capataz

## demo.guia **[ya no se usa: la Guía no cabe en la maqueta]**
Guía

### Columna izquierda

## demo.workspaces **[nueva, sustituye a `demo.sesiones`]**
Workspaces

## demo.proy1 **[nueva]**
Adeorq

## demo.proy1.badge **[nueva, pastilla azul: sesiones de la semana]**
4

## demo.proy1.wait **[nueva, pastilla roja: te esperan]**
1

## demo.s1
hero de la web

## demo.s1.ago **[nueva]**
ahora

## demo.s2 **[cambia: pasa a ser la sesión que te espera, dentro del mismo proyecto]**
textos de la web

## demo.s2.ago **[nueva]**
hace 1 h

## demo.proy2 **[nueva]**
VoCript

## demo.proy2.badge **[nueva]**
2

## demo.s3 **[cambia: ahora cuelga de VoCript]**
dictado por voz

## demo.s3.ago **[nueva]**
ayer

## demo.proy3 **[nueva, plegado, sin sesiones a la vista]**
froede

## demo.proy4 **[nueva, plegado]**
Layco

## demo.pie **[nueva, el pie de la columna, en mono]**
C:\proyectos · sesiones de ~/.claude

## demo.agenda **[ya no se usa aquí: la Agenda es su propia pestaña, no un bloque de la columna]**
Agenda

## demo.t1 · demo.t2 **[ya no se usan, por lo mismo]**
idea del buzón · firmar el instalador

### Cabecera del pane 1 (Claude, con el glow cian de turno terminado)

## demo.pane1.proy **[nueva, chip del proyecto]**
Adeorq

## demo.pane1
hero de la web

## demo.pane1.agents **[nueva, subagentes trabajando ahora]**
▣ 2

## demo.pane1.ctx **[nueva, barra de contexto y su porcentaje]**
43%

## demo.pane1.modelo **[nueva]**
Opus 5

## demo.pane1.esfuerzo **[nueva]**
high

### Cabecera del pane 2 (consola)

## demo.pane2.proy **[nueva]**
VoCript

## demo.pane2
pnpm tauri dev

Una consola no tiene contexto ni modelo, así que en este pane **no se dibujan** ni la barra ni
el «Opus 5 high». Que las dos cabeceras sean distintas es lo que pasa en la app y es medio
realismo gratis.

### Líneas de las terminales **[cambia entero]**

Pane 1, Claude Code trabajando. Esta es la forma que imprime de verdad, con su prompt y sus
líneas de herramienta, y es lo que reconoce de un vistazo justo el visitante que nos importa:

```
> monta el hero con los tokens de DISENO.md

⏺ Read(web/DISENO.md)
  ⎿  214 líneas

⏺ Update(web/styles/hero.css)
  ⎿  3 adiciones

⏺ Hecho: el hero ya usa los tokens nuevos.
```

Pane 2, una consola normal:

```
PS C:\proyectos\VoCript> pnpm tauri dev
   Compiling vocript v0.9.2
    Finished dev profile in 8.4s
    app abierta en 1,2 s
```

## demo.aviso **[se va del hero]**

«Este proyecto tiene cambios sin commitear» no flota sobre un pane: en la app es el diálogo de
archivar. Se lleva a la tarjeta 02 de Funciones con su forma real, que además es más
convincente porque enseña el número y los archivos:

```
⚠ Este proyecto tiene 3 archivos con cambios sin guardar en git:
   src/hero.tsx
   web/DISENO.md
   package.json
```

Y debajo, la frase que explica por qué importa (esta sí es de la app, resumida):
«Adeorq no los toca. La app oficial, al archivar, los borraría sin avisar.»

## Descripción de la maqueta (`aria-label`)

Maqueta del panel de Adeorq: la barra de pestañas, la columna de proyectos con sus sesiones y
su estado, y dos terminales abiertas, una con Claude Code que acaba de terminar su turno y otra
compilando
