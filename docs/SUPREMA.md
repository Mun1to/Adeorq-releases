# La sesión suprema

> Una terminal que dirige a las demás. Munir la pidió el 2026-08-10 con un boceto
> del lienzo: «que una sesión suprema controle otras sesiones, un árbol de
> sesiones retroalimentándose, de momento primero en el canvas, y que tenga
> acceso a otros proveedores no solo Claude».

## Qué es y qué no es

**Es un agente de verdad**, no un despachador. Decidido por Munir el 2026-08-10
frente a las otras dos opciones (reparto determinista, o híbrido con vigía): una
terminal normal, con su CLI y su cuota, a la que le hablas tú. Ella decide a
quién abrir, les manda encargos, lee lo que devuelven y te contesta una sola vez.

**No es un harness propio.** Hablar con las APIs directamente rompería el
argumento de producto de Adeorq («funciona con TU cuenta»): pasaríamos de gastar
suscripciones a pagar tokens por API, que es otro bolsillo y otro negocio.

**No es un MCP nuevo.** El de Adeorq ya existe (`mcp.rs`, puerto 3012) y ya
expone las tres primitivas duras: `get_active_panes`, `read_pane_transcript` y
`send_command`. Una sesión con ese MCP puesto ya puede leer y escribir en las
demás; lo que le falta es **crear** sesiones y **conectarlas**. (Desde la
0.9.164 hay tres más, salidas de usarlo de verdad: `send_keys` para Escape y
Ctrl+C, `read_pane_screen` para leer lo que se VE en la pantalla alternativa, y
`send_command` pulsa el Intro aparte y avisa si el texto se quedó en la caja;
ver «Escribirle a una sesión desde fuera» en `AGENTS.md`.)

Y el MCP es lo que hace esto multi-proveedor sin esfuerzo: es el único idioma que
hablan todos los CLIs a la vez, así que la suprema puede ser Codex dirigiendo a
Claude y a Gemini sin que ninguno sepa nada del otro.

## Lo que ya estaba construido (2026-08-10)

Media pieza estaba hecha y no figuraba en `METAS.md`:

- **El árbol del lienzo son los relevos.** Dibujas una flecha entre dos
  terminales y, al terminar el turno el agente de origen, `onTurnEnd`
  (`CanvasView.tsx`) convierte cada flecha saliente en un relevo: el resultado
  del anterior entra en el prompt del siguiente (`runRelay`).
- **Con sus frenos ya puestos**: no entrega si el agente te estaba hablando a ti
  (`TE_HABLA_A_TI`), avisa si la flecha cierra un círculo (`alcanza`), y una
  flecha automática que se dispara 3 veces en 10 minutos se pasa a manual sola
  (`TOPE_AUTO`), porque cada vuelta es un turno de agente que se paga.
- **`createCanvasPane` ya acepta un comando propio y una cuenta**, así que el
  lienzo puede abrir cualquier CLI aunque su `SpawnKind` solo nombre tres.
- **El buzón** (`crew.rs`, `inbox.rs`) es el transporte de vuelta que ya usa la
  casa para que los agentes se hablen.
- **`encargos.rs`** guarda para qué se abrió cada sesión, que es lo que la
  suprema necesita para saber a quién mandó qué.

## Lo que falta

| pieza | dónde |
|---|---|
| Que la suprema **abra** sesiones | `open_pane` en el MCP |
| Que la suprema **conecte** dos sesiones | `link_panes` en el MCP |
| Que un agente sepa **quién es** | `ADEORQ_PANE_ID` en el entorno del PTY |
| Que el resultado **suba** al padre | la flecha de vuelta, sobre el buzón |

## El puente que no existía

El MCP vive en Rust y las terminales del lienzo las monta React. `send_command`
no lo necesitaba (escribe directo al PTY, que es estado de Rust), pero **crear**
un panel obliga a pedírselo al front.

Patrón: petición y respuesta sobre los eventos que ya usa el PTY.

```
  MCP (hilo del cliente)                    Front (App.tsx)
        │                                         │
        ├── emit("mcp:pedido", {id, ...}) ───────►│
        │                                         ├── abre el panel
        │◄──── comando mcp_reply(id, paneId) ─────┤
        │  (recv_timeout, 20 s)                   │
        ▼                                         │
   devuelve {paneId} al agente
```

Cada cliente MCP se atiende en su propio hilo (`thread::spawn` en `mcp.rs`), así
que bloquear ese hilo esperando la respuesta es correcto: no para nada más.

## Los dos frenos, que no son opcionales

Munir eligió el agente que decide, así que el control no puede ser «pregúntame
cada vez» (sería inusable). Es presupuesto duro, en Rust, donde el agente no
puede tocarlo:

1. **Seis sesiones vivas por MCP**, que es el mismo tope que la cuadrilla.
2. **Doce aperturas por hora**, para que un bucle no abra y cierre sin parar.

Al llegar al tope, `open_pane` no falla en silencio: devuelve el motivo, para que
la suprema lo cuente en su respuesta en vez de quedarse esperando.

Y un tercero, de dinero: **un Claude que abre un agente nace en Opus** si no pide otro
(`model`: haiku, sonnet u opus), sea cual sea el modelo de fábrica de la persona, y **Fable
se rechaza** (`modelo_para_agente` en `mcp.rs`, con su prueba). Munir, 2026-10-18: las
sesiones que le abría una suprema salían en Fable porque ese era su modelo de fábrica
(un `/model` en otra sesión lo cambia para todas), y «no abras Fable, gasta mucho; como
mucho Opus». Fable lo abre una persona, no un agente.

## Las terminales delegadas las limpia quien las abrió (2026-10-15)

Munir, 2026-10-12: *«que se limpien automáticamente, que luego todo se satura»*. Y el 15,
contestando cuándo y cómo: se dan por terminadas *«cuando el agente supremo principal lea la
sesión y considere que la tarea se ha terminado»*, y entonces *«se elimina por completo, para
mantener un espacio limpio, con su respectivo rastro de handoff o feedback»*. Eligió esto frente
a un reloj (cerrarla a la media hora), a una tira de «delegadas» y a un botón.

- **Adeorq apunta quién abrió cada una** (`Puente::delegadas` en `mcp.rs`, con el panel que
  presentó el puente del agente, y por su conversación en `delegadas.json`, que sobrevive a
  reiniciar: ver «Quién la abrió sobrevive a reiniciar» abajo). `get_active_panes` lo dice:
  «Abierta por: ti (cuando su tarea esté hecha, ciérrala con close_pane y su rastro)» a quien la
  abrió, y «Abierta por: el panel N» a los demás.
- **`close_pane` pide su `rastro`** para una que abrió un agente: qué hizo, dónde dejó su parte y
  qué falta, de 40 a 8.000 caracteres. Sin él, o si no se puede guardar, no la cierra. Se guarda
  en `%LOCALAPPDATA%\Adeorq\rastros\<fecha UTC>-<nombre>.md` con su carpeta, la conversación que
  corría (`claude --resume <id>`) y quién la abrió y la cerró (`rastros.rs`). La conversación NO se
  borra: es de Claude Code, y con ese id se retoma.
- **Se va entera**: el cierre por MCP no deja el aviso de «cerrada» ni el Ctrl+Z de la X
  (`quitarPane(id, false)` en `App.tsx`). La X de Munir sigue igual.
- **Lleva el color de su proyecto** (2026-10-21, Munir: *«que les cambie de color el header de la
  sesión al proyecto el cual se está trabajando para identificarlas más fácilmente»*): una terminal
  con `abiertaPor` lleva `data-delegada` y `--proy`, el tono del lienzo (`coloresDeProyectos`) del
  proyecto de su carpeta (`proyectoDeCarpeta`), en el borde y en la cabecera, como una cuadrilla; el
  foco sigue mandando en el borde. Lo mira `scripts/laboratorio/delegada-con-color.mjs`.
- **Y su conversación se archiva sola en la barra** (2026-10-21). Munir, con 36 sesiones en el
  proyecto Adeorq: *«hay demasiadas sesiones… ordenar y organizar todo… que esto no vuelva a
  pasar»*. De las 35 de los últimos treinta días, 22 eran delegadas ya cerradas con su rastro: el
  panel se iba, la conversación se quedaba un mes en la barra. Ahora `rastros::cerradas` dice qué
  conversaciones tienen rastro y cuándo, y `archivadasSolas` (`lib/enLaBarra.ts`) las pasa a
  «Archivadas» mientras nadie escriba en ellas después del rastro (diez minutos de margen), no
  estén abiertas en un panel y no las desarchives (desarchivar las pone en `traidas`). No se
  escribe nada en el estado de la barra ni se borra nada: retomarla la devuelve sola. Las doce
  viejas de antes de que existiera el rastro se cerraron ese día con uno escrito a mano («la cerró
  la sesión 572c3eb8 al ordenar la barra»). Casos en `scripts/barra-check.ts`, la lectura en
  `cargo test --lib rastros::` y la barra pintada en `scripts/laboratorio/barra-archiva-solas.mjs`.
  **Tu X también deja rastro:** una terminal con `abiertaPor` que cierras con la X (Cabina o
  lienzo) escribe uno «la cerró Munir con la X» (`rastro_de_la_x`) y la barra se relee al momento;
  «Reanimar» no, que la vuelve a abrir. Y el latido de la barra (45 s) relee los rastros además de
  las sesiones: antes solo los leía al montarse, así que la que cerraba un agente con la app abierta
  seguía en la barra hasta reiniciar. Los dos caminos, en vivo, en
  `scripts/laboratorio/x-archiva-la-delegada.mjs` (rojo sin el latido: 61 s y seguía).
  **La edad sale del reloj, no del caché** (2026-10-22): con su app abierta desde la tarde, la
  barra decía «5 h» de una conversación de hacía doce y no archivaba nada, porque el caché de
  `sessions.rs` devolvía la foto de la primera lectura con su edad, y `archivadasSolas` la usa
  para saber si se escribió después del rastro. `al_reloj` la pone en hora en cada vuelta
  (`cargo test --lib la_edad_no_se_congela`, rojo con «3 h»), y
  `scripts/laboratorio/barra-edad-con-la-app-abierta.mjs` deja la app aislada abierta nueve
  minutos antes de mirar, que es lo que ningún laboratorio de la barra hacía.
- **Lo que no cubre:** una delegada cuyo agente se cerró antes que ella se queda sin dueño; esa la
  cierra Munir o la Suprema (con la X ya deja su rastro, ver abajo). Y el rastro no se ve todavía
  en la app: vive en esa carpeta.
- **Medido:** `cargo test --lib rastros::` y `node scripts/laboratorio/rastro-de-verdad.mjs` (el
  puente de verdad contra una Adeorq aislada: abre, lista, se niega sin rastro, cierra con él,
  escribe el archivo y no enseña el aviso). NO PROBADO con un agente de verdad decidiendo solo.

## Las delegadas no pasan de la raya roja de contexto (2026-10-30)

«Orquio General», 22-oct: las seis terminales que abrió ese día acabaron entre 587.778 y 831.704
tokens, y Munir: *«¿no tienes la habilidad de compactar las sesiones que controlas, o cerrarlas y
crear nuevas?»*. Condición suya: una terminal que trabaja NUNCA se compacta sola, y en las suyas,
sin su clic no (D8). Las rayas son las de la D7 (300k aviso, 400k compacta, 600k terminal nueva).

- **`get_active_panes`** dice los tokens de cada Claude Code («Contexto: 412.000 tokens de
  1.000.000») y, pasada una raya, qué hacer. **`send_command`** no manda trabajo nuevo desde el
  aviso sin `confirm: true` (ver `escribir-a-una-sesion.md`).
- **A quien la abrió se le avisa** en la respuesta de su siguiente llamada al MCP, una vez por raya
  desde los 400k (`aviso_de_tus_terminales`, `Puente::avisadas`), y se olvida al bajar.
- **La delegada se compacta sola** a la campana de un turno acabado, con `/fin sin commits` y
  luego `/compact`, aunque el ajuste de Munir diga «no» o «fin» (`esDelegada` en
  `lib/contexto.ts`, que apunta `lib/puenteMcp.ts` al abrirla). Con las mismas llaves que el
  automático de siempre: transcript en «lista», sin subagentes, sin menú, sin borrador y sin «esc
  to interrupt» en pantalla. Ya compactada dos veces no lo hace una tercera (D4): el aviso le dice
  a quien la abrió que la cierre con su rastro o la compacte él.
- **`compactar_terminal(paneId)`** (escalón «auto», como `send_command`): el mismo baile pedido
  por el agente, sin esperar a la raya. Solo en delegadas de Claude Code; en una de Munir contesta
  que sin su clic no. Si ya hay un traspaso en marcha no empieza otro; el pedido caduca a los 30
  minutos si no para.
- **`close_pane`** dice con cuánto contexto acabó, y **`open_pane`** cuánto llevan las otras que
  ya abrió quien llama.
- **Medido:** `cargo test --lib tope_contexto` (11, rojo antes con las funciones vacías),
  `pnpm bancos contexto` (rojo antes: no existían) y
  `node scripts/laboratorio/tope-de-contexto-de-verdad.mjs` (27 de 27, Adeorq aislada con Claudes
  de mentira). NO PROBADO: con un Claude Code de verdad cruzando los 400k, ni el laboratorio
  contra el código viejo. Las delegadas se olvidan si la ventana se recarga (`DELEGADAS` vive en
  la página; Rust sigue sabiéndolo y `compactar_terminal` funciona, pero el automático no).
- **Lo que vio la revisión (2026-10-30)**, seis caminos por los que tecleaba donde no debía:
  - **Solo la conversación del panel, y solo si corre.** `leerDelPanel` (`lib/contexto.ts`) no
    lee nada sin la conversación de su comando (antes caía en «la más reciente de la carpeta», la
    de quien la abrió), y `ContextInfo.viva` dice si su id está en `~/.claude/sessions/<pid>.json`
    de un proceso vivo. Medido con Claude Code 2.1.314: cada `/clear` pasa ese registro a un id
    nuevo y al salir se borra, así que tras un `/clear` o con el CLI cerrado la de antes no
    cuenta, ni en la ventana ni en Rust (`carga_de`: ni tokens en la lista ni retener).
  - **Claude Code por el `kind`**, que se mira sin el encargo: un Codex al que se le encarga algo
    de «claude» ya no recibe `/fin`.
  - **Tercera llave, la caja:** nada se teclea solo si la pantalla no es Claude Code parado en su
    caja vacía entre dos rayas (`esperaEnSuCaja`); un PowerShell, un menú o un borrador, no.
  - **Un candado** para la campana, el botón y `compactar_terminal`, y el `/compact` solo con una
    lectura de después del `/fin` (antes podía salir pegado detrás).
  - **El aviso a quien la abrió** se olvida al bajar de 300k y no de 400k: rondando la raya se
    repetía. **Un modelo que no está en la tabla** se lee de un millón (`context_window`): de
    200k, un Opus nuevo compactaba a 120k.
  - Medido: `cargo test --lib tope_contexto` y `sessions::` (rojos antes), `pnpm bancos contexto`
    (17 rojos antes) y el laboratorio (R1, R3, R4, R5; con el frente de `HEAD`, R1 y la campana
    de R3 en rojo).
  - **`send_command` no retiene la respuesta a una pregunta** (`ed9a7b1`): contestar a lo que
    pregunta (un permiso, el «Type something», un «no» en prosa) pasa sin `confirm`
    (`tope_contexto::retiene`). El paso R4 del laboratorio, rojo antes y verde después.

## Quién la abrió sobrevive a reiniciar, y las que ya no están se dicen (2026-10-30)

La Suprema, ese día: tras reiniciar Adeorq, sus delegadas salían sin «Abierta por» y en
`acceptEdits` en vez de `auto`, y una desapareció sin rastro ni aviso («quien la abrió no puede
saber si la cerró Munir, si se murió el proceso o si se perdió al restaurar»). Las dos causas eran
la misma: quién abrió cada una vivía en memoria y por número de panel, y la ventana tampoco lo
guardaba, así que al reiniciar no había «de: …», el tablero la retomaba con el modo de Ajustes y
la X no escribía su rastro (lo escribe solo si el panel tiene `abiertaPor`).

- **Se guarda por conversación** en `%LOCALAPPDATA%\Adeorq\delegadas.json` (`mcp/delegadas.rs`):
  nombre, carpeta, la conversación y el «de: …» de quien la abrió, el modo con que nació, y cómo
  acabó. Lo escribe `open_pane` con lo que contesta la ventana (`datos` en `lib/puenteMcp.ts`).
  Una sin id de conversación (Codex, una consola) va por su número de ese arranque: no se puede
  retomar, pero sí decir cómo acabó. Las cerradas se olvidan a la semana; las que no vuelven, a
  las dos.
- **Al nacer un panel que retoma esa conversación vuelve a ser delegada**, venga del tablero,
  del lienzo, de «Reanimar» o de la barra. En Rust, `al_nacer` (llamado desde `pty_spawn`) la
  apunta otra vez en `Puente::delegadas`, y quien la abrió se reconoce por su conversación
  (`es_suya`), con su número de hoy. En la ventana, `lib/delegadas.ts` lee lo guardado una vez al
  arrancar (`delegadas_guardadas`), y `delegacionDe` le devuelve su «de: …» y la marca para que
  compacte sola (`addPane`, `createCanvasPane` y el tablero). `resumeCommandFor` y «Reanimar» la
  retoman en su modo (`modoAlRetomar`); las de Munir, en el de Ajustes como siempre. Cerrada con
  `close_pane` o con la X, se olvida: retomada otro día, ya es de Munir.
- **Las de los encargos programados también son delegadas** (`apuntar_de_programado` en
  `programados.rs`): nadie hace clic en ellas, así que `compactar_terminal` ya no contesta «es de
  Munir». `get_active_panes` dice «Abierta por: el encargo programado «…»», y al acabar su
  encargo queda dicho que la cerró él.
- **`get_active_panes` dice las que ya no están** (último día, como mucho ocho): con su nombre,
  su conversación, quién la abrió, cuándo (en UTC) y cómo. Con `close_pane` dice por qué panel y
  dónde está su rastro; con la X, que la cerró Munir y su rastro; si su proceso cayó, que salió
  solo y con qué código (`al_salir`, desde el fin del PTY; al cerrar la app no cuenta,
  `se_cierra_la_app`), y si no volvió al reiniciar, que nadie la cerró y cómo se retoma. Un
  «Pane N not found» de una que fue delegada en este arranque lleva lo mismo detrás
  (`por_que_no_esta`).
- **El encargo dentro del comando ya no engaña** (`3440646`): `rastros::sin_encargo` lo quita antes
  de buscar la conversación o si es Claude Code (`sesion_del_comando`, `es_claude`), igual que
  `sinEncargo` en la ventana. Un `--resume` escrito en el encargo ganaba al `--session-id` de
  verdad, y esa es la clave por la que se guarda todo esto.
- **Ojo al probarlo:** un panel corre `cmd /k` y el CLI dentro, así que si solo sale el CLI el PTY
  sigue vivo y no hay fin: «su proceso salió» es la terminal entera cayéndose. Y en Rust, un
  `if let x = m.lock()…` deja el candado cogido en todo el bloque: así se colgó `close_pane` en la
  primera versión.
- **Medido:** `cargo test --lib delegadas` y `rastros::` (el del encargo, rojo antes: cogía la
  conversación del encargo), `tras_reiniciar_la_reconoce_su_conversacion`, y
  `node scripts/laboratorio/quien-la-abrio-de-verdad.mjs` (21 de 21): una Adeorq aislada con
  Claudes de mentira que abre delegadas y una de encargo programado, se reinicia de verdad
  (`reiniciar` en `aislada.mjs`) y mira «Abierta por», el modo, el «de: …», que se compacte sola a
  los 400k y que `close_pane` pida rastro; luego la X, la caída del proceso, `close_pane` y la que
  no volvió. Con el binario de antes, 15 de esos en rojo. **NO PROBADO:** con Claude Code de
  verdad.
- **Con las terminales en su propio proceso** (`terminales.rs`, encendido en la app publicada de
  Windows), medido el mismo día: `LAB_TERMINALES_APARTE=1` delante de los dos laboratorios
  (`aislada.mjs` enciende el ajuste y comprueba que las consolas cuelgan del proceso y no de la
  app). `quien-la-abrio-de-verdad.mjs` 28 de 28, con una parte que solo corre así: reiniciar como
  la tarjeta de actualizar (`reiniciar({ actualizando: true })`), y las delegadas siguen en el
  mismo proceso, con su número, sin `--resume`, «Abierta por: ti» y su «de: …»; la X, la que sale
  sola y la compactación van después sobre las recogidas. `tope-de-contexto-de-verdad.mjs` 38 de
  38. Sin el ajuste, los dos como antes. No hubo nada que arreglar.

## Lo que se le dice a un agente al conectarse (2026-10-17)

Munir, ese día: *«muchos agentes no lo están haciendo muy bien, y ADEORQ también no lo prioriza
que los terminales y los agentes abran terminales nuevas o agentes nuevos para terminar de hacer
un trabajo en el menor tiempo posible»*. Tenía razón por dos lados: el `initialize` no llevaba
`instructions`, y Claude Code carga las herramientas de un MCP **diferidas** (solo el nombre hasta
que las busca), así que un agente ni leía la descripción de `open_pane`, que encima frenaba
(«open the fewest you need»).

- **`instrucciones` en `mcp.rs`** va en la respuesta a `initialize` y Claude Code la mete en su
  prompt de sistema («MCP Server Instructions»): repartir desde el principio lo que se parte en
  piezas que no tocan los mismos archivos ni esperan la respuesta de otra, una terminal por pieza;
  no partir un solo hilo (un bug, un archivo); una búsqueda va a un subagente; cada encargo
  completo (y en el `BUZON.md` si el proyecto lo usa); mirar la pantalla, cerrar con rastro, y
  `get_usage` para elegir cuenta. Unos 1.500 caracteres: el tope de Claude Code era 2.048 hasta
  la 2.1.302, que lo subió a 4.096.
- **Se arma con lo que VE ese cliente** (`herramientas_visibles`): en «plan» (Codex, Gemini de
  fábrica) abre y cierra las que abrió él, pero no escribe (ver abajo); en «mirar», nada.
  Los puentes de casa (conserje, Capataz) no reciben ninguna: llevan su prompt y sus manos.
- **La descripción de `open_pane`** dice lo mismo en corto, y el conserje (`SISTEMA` en
  `conserje.rs`) ganó una línea: un trabajo grande que se parte son varias sesiones a la vez.
- **Medido:** `cargo test --lib mcp::` (`al_conectarse_se_le_dice_que_reparta_lo_que_se_parte`) y
  `node scripts/laboratorio/instrucciones-mcp-de-verdad.mjs`: una Adeorq aislada con el binario
  de la rama, cada escalón, y un `claude -p` de Haiku que las copia de su prompt palabra por
  palabra. NO PROBADO: si Codex, Gemini y los demás clientes muestran `instructions` a su modelo
  (el protocolo lo admite; cada CLI decide).

## Quién la abrió se ve en su cabecera, y en «plan» se cierra lo suyo (2026-10-17)

Munir, ese día: «Una etiqueta pequeña en la cabecera de la terminal: «de: nombre de quien la
abrió». Lo mínimo», y «que cualquiera pueda cerrar las que abrió ÉL, con su rastro, aunque esté en
«plan»». Las de otros, no.

- **«de: …»**: Rust manda en el pedido de `open_pane` el panel que presentó el puente del agente
  (`quien`), y la ventana (`lib/puenteMcp.ts`) apunta en la nueva el título que se ve en la
  cabecera de ese panel (`tituloDeCabecera` en `lib/supremo.ts`: el nombre sin el prefijo de su
  proyecto, la misma cuenta que usa la cabecera). Sale tenue a la derecha del título, en la Cabina
  y en el Lienzo; por debajo de 545 px se va y queda en el globo del título. El tablero guardado no
  lo lleva: al recrear el panel sale de su conversación (`lib/delegadas.ts`, desde el 2026-10-30).
  Una que abre un agente sin panel (Capataz, un
  encargo programado) no lleva «de:». **No sale en la ventana suelta**, que arma su cabecera con el
  nombre que viaja en la dirección de la ventana; si hiciera falta, viajaría igual.
- **El cierre en «plan»**: `close_pane` sale en el `tools/list` de un cliente en «plan»
  (`mcp_clientes::solo_lo_suyo`), y el servidor la deja pasar solo si esa terminal la abrió la
  misma conexión o su panel (`es_suya` en `mcp.rs`; `Puente::delegadas` guarda `Madre { panel,
  conexion }`, y el panel cuenta para cuando el puente se reengancha con otra conexión). Si no, dice
  quién la abrió. El rastro se pide igual que en «auto». Se lo dicen las `instrucciones` de
  `initialize` y el texto de Ajustes.
- **Medido:** `cargo test --lib mcp` (`plan_cierra_lo_que_abrio_y_nada_mas`,
  `plan_cierra_solo_lo_suyo` y las instrucciones), `pnpm bancos supremo` y
  `node scripts/laboratorio/de-quien-de-verdad.mjs <carpeta>`: una Adeorq aislada, una madre que
  abre una hija en la Cabina y otra en el Lienzo con su «de:», el logo y el proyecto sin borde ni
  fondo, y un Codex en «plan» que cierra la suya y no puede con la de la madre; deja dos fotos de
  las cabeceras en esa carpeta. NO PROBADO: un Codex o un Gemini de verdad decidiendo solo cerrar
  las suyas.

## Las delegadas se reparten entre cuentas solas (2026-11-02)

Munir, ese día: *«tengo una cuenta pro de claude que no le han delegado casi ninguna tarea, va por
el 17 % de la semana y se resetea en 2 días, hay que aprovechar bien eso»*. Medido: `open_pane` no
reenviaba `account` ni lo ofrecía, así que todas las delegadas nacían en la cuenta predeterminada
de Cuentas; `get_usage` no listaba la principal (la lista de cuentas no la lleva) ni decía cuándo
se renovaba nada; y el router ordenaba solo por el % que más para, con el tope de 5 horas y el
semanal mezclados.

- **Una sola regla**, `elegirCuenta` en `lib/router.ts`, para `recetar`, el `open_pane` sin
  `account` y la última línea de `get_usage`: gana la que más cuota **perdería** sin usar,
  `(100 − % semanal) / días hasta renovarse` (mínimo 0,25 días; sin dato de gasto, 50 %; sin fecha,
  7 días; una lectura de antes de su renovación que no se pudo refrescar, dato desconocido: 50 %,
  no 0 %, que puede ir ya por el 98 %). Cada terminal abierta por `open_pane` en esa cuenta y aún
  viva suma 10 puntos (`PESO_TERMINAL`) hasta una lectura de más de 10 minutos después de abrirla
  (`cuantasPesan`): con la misma foto, tres aperturas caían en la misma. Se apunta al elegir, antes
  de que nazca, para que dos a la vez se vean, y `get_usage` la cuenta igual que `open_pane`. Fuera
  la parada por su tope de 5 horas y la que va por el 92 % o más,
  salvo que no quede otra, y entonces se dice. Con un modelo pedido, fuera la de un plan que no lo
  da (`techoDelPlan`), salvo que no quede otra; y si no queda otra, `open_pane` la abre con el techo
  de su plan y lo dice (`modeloParaSuPlan`). El Lienzo guarda la carpeta de la cuenta de cada
  terminal de agente, Codex incluido (su pieza es «shell»: el CLI sale del comando), y vuelve a ella
  si sigue en Cuentas. Pro al 17 % en 2 días contra
  principal al 60 % en 5: la Pro (41,5 contra 8 al día). Pro al 17 % en 6 días contra principal al
  30 % en 1: la principal (70 contra 13,8).
- **La tarjeta partida** (`partesDe` en `lib/cuota.ts`): la semana es la línea «all models» (la de
  un modelo suelto solo para a ese modelo), el mes donde no hay semana, y la fecha sale del texto de
  Claude o del número de Codex. `anotarCuota` y la caché del router guardan las cuatro piezas.
  `loQueTePara` sigue igual para el freno de los programados, que pregunta «¿puede arrancar ya?».
- **`open_pane`**: con `account` (la etiqueta de `get_usage`, el id de un programado, o
  `principal`), esa o un error con las que hay; sin él, Rust pide `elegir` y la ventana elige
  (`lib/puenteMcp.ts`) y lo dice en la respuesta. Un encargo programado sin cuenta NO elige: sigue
  en la predeterminada, que es la que mide su freno (`cuentaDeArranque`). La principal viaja como
  cuenta y no como `undefined`, que en `entornoDePane` significaría la predeterminada. La confianza
  en la carpeta se escribe en el `.claude.json` de ESA cuenta. Se ve en la Cabina por las tres
  letras de la cuenta en la cabecera, como cualquier terminal de otra cuenta.
- **`get_usage`** lista la principal de cada CLI (`conLasPrincipales` en `lib/mundo.ts`), cada una
  con su % de semana, cuándo se renueva en palabras («en 2 días, el miércoles a las 8:00») y, aparte,
  si el tope de 5 horas la tiene parada; y al final, a qué cuenta va la siguiente terminal de cada
  CLI y por qué. Sigue sin comparar unidades entre proveedores.
- **Las instrucciones** de `initialize` y la descripción de `open_pane` dicen que se deje `account`
  fuera: un agente reparte sin pensarlo.
- **Medido:** `pnpm bancos reparto-cuentas` (los dos casos de Munir y los bordes), `cargo test --lib
  mcp::` (`open_pane_ofrece_la_cuenta_y_get_usage_la_principal` y las instrucciones), y
  `node scripts/laboratorio/reparto-cuentas-de-verdad.mjs [exe]`: una Adeorq aislada con cuatro
  cuentas de mentira, su cuota sembrada en la caché de la ventana y un `claude` doble en el PATH que
  solo escribe su `CLAUDE_CONFIG_DIR` y sus argumentos; sin `account` nace en la Pro, en modo auto,
  con la carpeta de confianza en la Pro y «2DA» en la cabecera; Reanimar y reiniciar Adeorq la
  retoman en la Pro.
- **Vuelve a su cuenta.** Al reiniciar ya volvía: el tablero guarda el `env` de cada panel. Reanimar
  no: reabría sin cuenta, en la predeterminada, donde su `--resume` no encuentra la conversación.
  Ahora la lee de su entorno (`cuentaDeSuEntorno` en `lib/frenoCuota.ts`).
- **Lo que no ve en otra cuenta.** Cada `CLAUDE_CONFIG_DIR` es una casa aparte. Medido en la «2da
  MAIN» contra la principal: ni el MCP de Adeorq (ni playwright ni vibeset), 1 skill de 25, sin
  plugins activos, y memoria en 5 carpetas contra 48. La respuesta de `open_pane` lo dice en una
  frase con la ruta de la memoria (`loQueNoVe`).
- **Sus barreras sí van con ella.** `pty_spawn` copia a la cuenta con la que nace una terminal los
  `hooks`, las reglas `deny` y `ask` y la `attribution` de la principal (`sembrar_barreras` en
  `accounts.rs`): sin esto, una delegada en modo auto nacía sin `guardian.mjs` y nadie lo había
  decidido (revisión de la 0.9.239). Nada más viaja, ni el modelo ni `allow`. Lo que una cuenta
  tenga de suyo se queda: `barreras-adeorq.json`, en su carpeta, recuerda lo que copió Adeorq para
  poder quitarlo cuando ya no esté en la principal.
- **De verdad:** `node scripts/laboratorio/claude-en-otra-cuenta-de-verdad.mjs <carpeta de la
  cuenta> [exe]` abre un Claude Code real con Haiku por `open_pane` (gasta un mensaje): nace en esa
  cuenta, sin preguntar por la carpeta, con «auto mode on», contesta y su transcript queda en esa
  cuenta, que el laboratorio borra al acabar.

## La línea de casa lleva contraseña (2026-11-03)

Hasta ese día bastaba con mandar `{"adeorq":"de-casa"}` al 3012 (o lanzar `adeorq --mcp
--de-casa`) para saltarse el escalón por cliente entero, aunque Munir los hubiera bajado todos a
«mirar»: lo podía hacer cualquier programa, o cualquier agente en «plan» desde su terminal, con
una línea (medido; encargo S1, `docs/contexto/propuesta-seguridad-local.md`).

- **La contraseña** (`clave_de_casa` en `mcp.rs`): 32 bytes del sistema en hex, inventada en
  cada arranque y solo en la memoria de la app. **No entra en el entorno de la app**: de ahí la
  heredaría cada terminal. Se le pone a mano al proceso que lanza un puente de casa
  (`con_llave_de_casa`: el `claude -p` del Capataz y del conserje, y Codex y Gemini del conserje),
  en la variable `ADEORQ_CASA`, que el puente con `--de-casa` presenta como `{"adeorq":"de-casa",
  "clave":"…"}`. Ni en una línea de órdenes ni en un archivo: cualquier programa tuyo los lee.
- **Sin ella, o con otra**, la línea no hace nada: es un cliente más, con su escalón y apuntado en
  Ajustes, sin error ni pista. La comparación no corta al primer byte distinto (`es_de_casa`).
- **Tras reiniciar Adeorq**, un puente de casa que estaba vivo se reengancha con la contraseña
  vieja (`escuchar_adeorq`), y la nueva Adeorq tiene otra: termina su turno como lo de fuera de
  Adeorq (ver la sección siguiente), que de fábrica solo ve la lista y el uso. Un conserje o un
  Capataz a media respuesta pierde leer y escribir en terminales, y la memoria, hasta su
  siguiente llamada, que ya nace con la contraseña nueva. No se queda sin
  permisos para siempre: dura lo que dure ese turno. Guardarla para que sobreviviera sería dejarla
  en un archivo.
- **Lo que NO para:** un programa que lea la memoria o el entorno de esos procesos. Quita la línea
  fácil, no a un programa malo decidido.
- **Medido:** `cargo test --lib mcp::` (`solo_es_de_casa_quien_trae_la_clave_de_este_arranque`,
  `la_clave_va_al_lanzado_y_no_al_entorno_de_la_app`,
  `el_puente_de_casa_lleva_su_clave_y_la_repite_al_reengancharse`), las líneas de órdenes del
  Capataz y del conserje (`foreman`, `conserje`), y `LAB_CLAUDE_CUENTA=<cuenta> node
  scripts/laboratorio/seguridad-local-de-verdad.mjs`: la línea sin contraseña, con una mala y
  `--de-casa` se niegan; una terminal no la hereda (`CASA=[]` desde dentro); el conserje con Codex
  y con Gemini sin sesión (no gastan) y un Capataz y un conserje de Claude de verdad (Haiku)
  entran como de casa sin quedar apuntados como cliente, y el Capataz escribe con «claude-code» en
  «mirar»; ninguna línea de órdenes ni archivo lleva la contraseña.

## Cada terminal tiene su contraseña, y los permisos van por terminal (2026-11-03)

Munir, ese día: «Las terminales de Adeorq sin preguntar, y cualquier otro programa con un clic
tuyo» y «Que fuera de Adeorq solo pueda abrir terminales y mirar, hasta que lo subas tú en
Ajustes».

- **La contraseña de cada terminal** (`pty::ClaveDePanel`): la inventa `pty_spawn`, nueva en cada
  terminal, y va en su entorno como `ADEORQ_PANE_CLAVE`, junto a `ADEORQ_PANE_ID`. Viaja en el alta
  y en la ficha de la terminal, así que con las terminales en su proceso aparte la app que vuelve
  tras una actualización la conoce (`FichaRemota.clave`). Su `Debug` pinta `***`, nunca va al front
  (`Viva` no la lleva) y no se escribe en ningún registro.
- **El puente la presenta** con su número (`{"adeorq":"panel","id":N,"clave":"…"}`), y el servidor
  solo cree el número con la contraseña de esa terminal (`panel_creible`).
- **Los permisos van por el programa que se abrió en la terminal**, leído de su comando
  (`mcp_clientes::programa_del_comando`): Claude Code puede escribir en otras terminales, los demás
  abren y miran. El nombre con que se presenta el cliente ya no decide.
- **Lo que llega sin una terminal creíble es «Fuera de Adeorq»**: su fila en Ajustes › Terminales,
  que de fábrica ve la lista y el uso, abre, y lee y cierra lo que abrió (decisión A1, 2026-11-04:
  `docs/contexto/bots.md`), y que Munir sube si quiere. Lo que no presenta contraseña pero cuelga de
  una terminal no baja con ella. Lo guardado por nombre se muda solo a su programa, quedándose con
  el menor si dos nombres caen en el mismo.
- **Abrir desde fuera nace en el modo de Ajustes, y con encargo pide un clic** (`pedir_abrir.rs`,
  `PedirAbrir.tsx`): una ventana con el texto, quién lo pide y en qué carpeta, **No / Abrir**. Con
  «No», `open_pane` contesta un error; si nadie contesta en dos minutos, otro. La carpeta no se marca
  de confianza. Las terminales de Adeorq, los puentes de casa y los encargos programados no pasan por
  ella, ni lo de fuera si se sube a «Todo».
- **Un Codex dentro de una terminal también dice quién es**: Codex no pasa su entorno a sus
  servidores MCP, y la app deja en su `config.toml` (el de `CODEX_HOME` y el de cada cuenta que tenga
  la entrada `[mcp_servers.adeorq]`) un `env_vars` con `ADEORQ_PANE_ID` y `ADEORQ_PANE_CLAVE`
  (`mcp_estable::codex_con_su_entorno`; `decisiones-2026-10-07.md`). Sin esa línea, caería en «Fuera
  de Adeorq».
- **Las claves de los agentes** (`adeorq secreto`, `docs/contexto/secretos.md`): desde una terminal
  de Adeorq, como siempre; desde fuera, la ventana pregunta antes de dar una guardada. Cada entrega
  se apunta (rastro y Ajustes › «Claves de los agentes»), sin el valor.
- **Medido:** `cargo test --lib` (`una_terminal_solo_se_cree_con_su_contrasena`, las de
  `mcp_clientes`, y `al_actualizar_no_se_despide`, que exige que la terminal que sobrevive a una
  actualización vuelva con su misma contraseña) y `node scripts/laboratorio/seguridad-local-de-verdad.mjs`
  (también con `LAB_TERMINALES_APARTE=1`), con un `claude` y un `codex` de mentira en las terminales.

## Orden de construcción

1. **`ADEORQ_PANE_ID`** en el entorno del PTY. Sin esto la suprema no puede
   dibujar una flecha desde sí misma, porque no sabe cuál es.
2. **El puente petición/respuesta** en `mcp.rs` + el comando `mcp_reply`.
3. **`open_pane`**, con el CLI como parámetro: por aquí entra el multi-proveedor.
4. **`link_panes`**, que apoya el árbol en las flechas que ya funcionan.
5. **La vuelta hacia arriba**: al terminar un hijo, una nota en el buzón del
   padre. Es lo único conceptualmente nuevo y va al final a propósito.

## Riesgos anotados

- **Cuesta cuota de verdad.** Un árbol de seis retroalimentándose puede quemar la
  semana en veinte minutos. De ahí los topes.
- **La suprema lee el terminal, no la mente.** `read_pane_transcript` devuelve el
  buffer con su ruido ANSI (y en la pantalla alternativa, solo repintados: ahí
  va `read_pane_screen`); el transcript limpio lo sabe leer `sessions.rs` por
  otro lado, y a la larga es de donde debería leer.
- **No todos los CLIs hablan MCP igual.** Que la suprema pueda SER Codex o Gemini
  depende de cómo registre cada uno sus servidores, y eso se verifica CLI a CLI
  antes de prometerlo (ver la regla de verificar un CLI nuevo).
