# La cara de chat, el navegador y froede dentro

> Plano de trabajo abierto el 2026-08-06 a partir del encargo de Munir: «un agente detrás
> del prompt que lo mejore y elija modelo», la pestaña de chat con el diseño de Clodex, un
> navegador dentro, y fusionar froede con todo eso.
>
> Este documento es el plano de la regla K: primero el mapa, después el código. No es una
> lista de deseos; cada apartado dice qué hay ya construido, qué falta de verdad y qué
> cuesta. Lo que necesita una decisión de Munir está al final, junto.

---

## 1. Lo primero, porque cambia el encargo: el asistente ya existe

El «asistente de prompts inteligente que además elige el mejor modelo calidad-precio» **se
construyó el 2026-08-01** y está en la app desde entonces. No es un plan: es código que
corre hoy.

| Pieza | Dónde | Qué hace |
|---|---|---|
| Clasificación de la tarea | `src-tauri/src/foreman.rs` (`PROMPT_SYSTEM`) | La MISMA llamada que reescribe el encargo devuelve qué exige: clase, consecuencia, si es larga, de qué va |
| Router de decisión | `src/lib/router.ts` (536 líneas) | Elige CLI, cuenta, modelo y esfuerzo, con los porqués escritos uno a uno |
| Foto del equipo | `src/lib/mundo.ts` | Qué CLIs hay, qué cuentas están conectadas, cuánta semana le queda a cada una |
| Tabla por rol | `src/lib/models.ts` | opus = juicio · sonnet = oficio · haiku = recado |
| La cara | `src/components/Foreman.tsx` (`redactar`, la ficha) | Enseña el encargo reescrito y a quién iría, y espera tu OK |
| Comprobación | `scripts/router-check.ts` | 33 casos que se ejecutan de verdad |

El flujo de hoy: llamas al Asistente (el orbe, `Ctrl+Mayús+A`) → escribes → «Escribir el
encargo» → sale la ficha con el encargo mejorado y la receta → eliges → «Ponerlo en esta
terminal», que manda `/model` y `/effort` y deja el encargo escrito **sin enviarlo**.

Y el router **también manda en el plan del Capataz**, que es donde de verdad se gasta.

**Entonces, ¿qué falta de lo que pediste?** Una sola cosa, y es la que dijiste tú:

> «o que lo puedes tener automático, tipo que automáticamente te mejora el prompt y
> automáticamente te cambia el modelo».

Hoy el Asistente es un **destino** al que hay que ir a propósito. Tú lo quieres como un
**filtro en el camino**: escribes, das Enter, y pasa antes de salir. Ese es el hueco real, y
es pequeño comparado con lo que ya hay debajo.

---

## 2. Por qué el filtro no puede vivir dentro de una terminal

Es el dato técnico que decide toda la arquitectura de esto, así que va antes que el diseño.

Una terminal de Adeorq es un PTY real (`portable-pty` sobre ConPTY). Lo que escribes NO lo
tiene Adeorq: cada tecla viaja de xterm.js al proceso, y quien la dibuja, la corrige, la
autocompleta y decide qué es «una línea» es el CLI que corre dentro. Para interceptar tu
prompt antes del Enter, Adeorq tendría que:

- reconstruir el texto en curso leyendo la pantalla del emulador, sin saber dónde empieza;
- entender el editor de línea de CADA CLI (Claude Code, Codex, Gemini, Antigravity: distinto
  autocompletado, distinto pegado multilínea, distintos modos);
- y no romperse cuando el CLI repinta, que es la causa conocida de que haya que escalonar
  los `/model` (ver el comentario de `App.tsx:2082`).

Eso no es difícil: es **imposible de hacer fiable**, y fallaría comiéndose texto tuyo.

**Por eso Clodex no usa una terminal para escribir.** En tus capturas se ve un cuadro de
composición propio, con sus pastillas de modelo, permisos, proyecto y contexto, y un botón
«Terminal» aparte para ver la consola cruda. La terminal está debajo, no delante.

Conclusión: **el asistente automático y la cara de chat son la misma obra**. Tu intuición
(«para hacer todo esto tendríamos que hacer la pestaña de chat, ¿verdad?») es correcta, y
ahora sabemos exactamente por qué.

---

## 3. La decisión que estaba bloqueada, y tus capturas la resuelven

`docs/METAS.md` (§ «Adeorq Chat», 2026-08-01) dejó el modo chat parado con un aviso que no
era de diseño:

> El chat de hoy va por CLAVE DE API, o sea que cada mensaje se factura por tokens. Las
> terminales van por TU SUSCRIPCIÓN y no cuestan nada aparte. Un «modo chat» que parezca un
> chat normal y por detrás cobre por tokens es el camino corto a una factura sorpresa.

Y proponía la salida: que el chat sea **una cara sobre las terminales**, contra un CLI real.

**La captura de Providers de Clodex confirma esa decisión con sus propias palabras:**

> *«Sessions — The CLI that runs your chats. Clodex signs in with your own plan — it never
> bills a key.»* · Claude Code v2.1.223 · Claude Max 5× · OpenAI Codex v0.146.0

Es exactamente la arquitectura aparcada: el chat es la cara, el CLI es el motor, la
suscripción es la que paga. Y separan explícitamente lo que SÍ cobra por clave (generación
de imágenes: OpenAI o Gemini, «Pay as you go»).

**Queda desbloqueada**: el modo chat de Adeorq va contra un CLI real, no por API.
`CanvasChat` + `chat.rs` (OpenRouter) se quedan donde están, para lo que son buenos: una
duda suelta y hablar con modelos que no tienen CLI.

---

## 4. Las fases

Ordenadas por lo que vale dividido por lo que cuesta, no por lo vistoso.

### Fase 1 — El modo automático del Asistente *(pequeña, el motor ya está)*

Un interruptor en el Asistente: en vez de enseñar la ficha y esperar, aplica la receta y
deja el encargo puesto. Reglas de la casa que NO se tocan:

- **Sigue sin enviarse solo.** El encargo se deja escrito y espera tu Enter, como hoy: es lo
  único que gasta, y esa decisión sigue siendo tuya. «Automático» aquí quiere decir «sin
  pantalla intermedia», no «sin tu dedo».
- **El porqué no desaparece**, se encoge a una línea: «sonnet · es oficio del día a día».
  Una recomendación que no se puede leer no se puede corregir, y eso es el punto entero del
  router (`router.ts:16-20`).
- Se guarda como el resto de las preferencias del Asistente.

### Fase 2 — La caja: el cuadro de composición *(el cimiento de todo lo demás)*

Un compositor propio encima de la terminal enfocada, con lo que se ve en tus capturas:
proyecto, modelo con su peso, esfuerzo, modo de permisos, porcentaje de contexto, micrófono
y el botón de enviar. Lo que se escriba pasa por el Asistente si el automático está puesto, y
luego baja al PTY por el camino que ya existe (`onDespachar`).

Esta caja es lo que convierte «terminal» en «chat» sin tener dos apps: **la conversación que
se ve arriba puede seguir siendo la terminal**, y el que quiera la consola cruda la tiene con
un botón, igual que el «Terminal / Clean» de Clodex.

### Fase 3 — La vista Chat *(la cara)*

Lista de conversaciones a la izquierda agrupada por día (Hoy / Ayer / Esta semana), la
conversación en medio renderizada como markdown en vez de como pantalla de consola, y la
caja de la fase 2 abajo. Es lo que ya está descrito en `METAS.md`, ahora con motor.

⚠ **Antes de escribir una línea de esta fase hay que partir `App.tsx`** (2.989 líneas) y
`App.css` (13.789). Añadir una vista entera ahí dentro es como se llega a un archivo que
nadie puede tocar; `AGENTS.md` ya lo tiene señalado como el límite real de escala.

### Fase 4 — El navegador *(ver el apartado 5)*

### Fase 5 — froede dentro *(ver el apartado 6)*

---

## 5. El navegador: hay dos, y no cuestan lo mismo

Hoy existe `src/components/CanvasWeb.tsx`: una ventana de localhost en el lienzo, con barra
de dirección, botones de puerto (1420, 5173, 3000…), recarga y «abrir fuera». Funciona, y
sabe avisar cuando una web se niega a entrar en vez de quedarse en blanco.

Es un **`<iframe>`**, y de ahí salen sus dos techos:

1. Muchas webs de fuera lo prohíben (`X-Frame-Options`, CSP). Localhost casi nunca, que es
   para lo que existe.
2. **Adeorq no puede tocar lo que hay dentro.** `localhost:5173` y `tauri://localhost` son
   orígenes distintos, así que no hay forma de leer el DOM ni de dibujar encima. Sin eso, las
   herramientas de tus capturas (seleccionar, mover, redimensionar, radio, espaciado, texto)
   **no se pueden hacer**.

### Vía A — webview hijo de Tauri

Verificado hoy en esta máquina, no de memoria:

- `@tauri-apps/api` 2.11.1 **sí** trae la clase `Webview` con posición y tamaño
  (`node_modules/@tauri-apps/api/webview.d.ts:106`).
- Pero en el crate `tauri` 2.11.5 esa parte está detrás de **`feature = "unstable"`**
  (`Cargo.toml:130`, y los `#[cfg(feature = "unstable")]` de `webview/mod.rs` y
  `window/mod.rs`). Adeorq compila hoy con `features = ["protocol-asset"]`.

Un webview de verdad da navegación completa y **scripts de inicialización**, que es lo que
rompe la barrera del origen y hace posible dibujar herramientas encima. El precio: poner
Adeorq en el canal inestable de Tauri, y que un webview hijo es una capa nativa **por encima
del DOM**, así que no se le pone nada delante (ni un menú, ni el velo de un diálogo) sin
colocarlo a mano.

### Vía B — seguir con el iframe y un puente

Se queda en localhost, pero no necesita `unstable` ni tocar Tauri: la página colabora por
`postMessage` porque nosotros controlamos lo que se sirve en dev. Es justo lo que ya hace el
plugin de froede (apartado 6), así que sale casi gratis si se hace a la vez.

**Recomendación:** empezar por la B. Da el 100 % de lo que hace falta para editar TU web en
localhost, que es el caso real, y deja la A para cuando el navegador tenga que ser un
navegador de verdad.

---

## 6. froede dentro de Adeorq: se puede, y el trabajo cae en froede

Cómo está montado froede hoy (`C:\proyectos\froede`, leído hoy):

```
extensión (Chrome MV3)  ──WebSocket 127.0.0.1 + token──►  companion (Node)
  selecciona y edita                                       encuentra el sitio exacto
  manda el cambio                                          y lo escribe en el fuente
```

- Estático: la extensión manda el camino del DOM y el companion lo mapea con parse5.
- React + Vite: **`vite-plugin-froede` estampa `data-froede-loc="src/App.tsx:4:6"`** en cada
  elemento, y el companion reparsea ese archivo y empalma el JSX exacto.

**Lo que de verdad hace el trabajo (encontrar el sitio y escribir) está en el companion, no
en la extensión.** La extensión solo es la mano. Por eso la fusión es viable: Adeorq puede
ser otra mano.

Los dos obstáculos concretos, los dos en el lado de froede:

1. **El companion tiene el `Origin` bloqueado al ID de la extensión** — a propósito, es lo
   que impide que una web cualquiera se conecte y te escriba en el disco. Hay que añadirle un
   segundo origen de confianza para Adeorq. **Es tocar la seguridad de froede, así que se
   hace en froede, con su `SECURITY.md` delante, y no a escondidas desde aquí.**
2. **El puente con la página**: el plugin de Vite, que ya inyecta un atributo en cada
   elemento, inyecta además un script que hable por `postMessage` con quien la tenga
   embebida. Eso resuelve a la vez el apartado 5 vía B.

Con esas dos, el botón «Editar con froede» deja de abrir Brave y de pedirte que copies un
token, y pasa a ser lo que tenía que ser: seleccionas en la ventana de Adeorq y el cambio cae
en el archivo.

⚠ Lo que **no** cambia: fuera de dev no hay `data-froede-loc`, así que esto sirve para tus
proyectos en localhost, no para editar una web ajena.

---

## 7. Lo visual que mandaste

- **Iconoir** (MIT): sirve como referencia de trazo, pero Adeorq ya tiene su set dibujado a
  mano en `Icons.tsx` (los ~260 glifos de fuente se convirtieron a SVG por una razón: un
  glifo no sigue al tema y cada sistema lo pinta de un tamaño). Si entra Iconoir, entra como
  fuente para dibujar los que faltan, no como segunda familia conviviendo con la nuestra.
- **Los botones con profundidad** (el CSS de las seis técnicas): encaja con la firma de la
  casa, que es cristal sobre foto. Cuidado con `depth-inset`, que está calibrado para fondo
  claro. Candidatos: el botón de enviar de la caja y las pastillas de modelo.
- **El componente `Laser`**: el efecto de revelado usa `drawElementImage` + `layoutsubtree`,
  que es **experimental de Chromium y no está en el WebView2 que embarca Adeorq**. El propio
  componente lo detecta (`supportsHtmlInCanvas`) y cae a renderizar los hijos tal cual, así
  que se puede usar: saldría el haz de luz, no el revelado. Conviene saberlo antes de
  presupuestar el efecto de tu captura.
- El **selector de modelo con la barra de color** (Lite / Frontier, 1-4) y el de **permisos**
  (5 niveles, de «Ask» a «Bypass») son dos piezas que Adeorq puede copiar tal cual, porque
  los datos ya los tiene: `PESO` de `router.ts` da el orden y el color, y los modos de
  permisos son los del propio Claude Code.

---

## 8. Lo que necesita tu OK

1. **El modo chat va contra un CLI real, no por API.** Está razonado en `METAS.md` y tus
   capturas de Clodex lo confirman. Si dices que sí, deja de estar bloqueado.
2. **¿Se parte `App.tsx` y `App.css` antes de la fase 3?** Mi recomendación es sí, y que sea
   su propio encargo. Meter una vista entera en un archivo de 3.000 líneas es cómo se
   consigue que dentro de un mes nadie pueda tocarlo.
3. **¿Navegador por webview hijo (`unstable`) o por iframe con puente?** Recomiendo el
   puente, y dejar el webview para cuando haga falta navegar de verdad.
4. **froede: ¿se toca su companion para añadir el origen de Adeorq?** Es su fichero de
   seguridad. Se hace en su repo o no se hace.
5. **El automático, ¿hasta dónde llega?** Mi propuesta: mejora el prompt y ajusta el modelo,
   pero **el Enter final sigue siendo tuyo**. Si lo quieres enviando solo, dilo explícitamente,
   porque rompe la regla de la casa de que nada se ejecuta sin tu OK.
