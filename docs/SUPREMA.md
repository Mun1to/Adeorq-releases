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

## Las terminales delegadas las limpia quien las abrió (2026-10-15)

Munir, 2026-10-12: *«que se limpien automáticamente, que luego todo se satura»*. Y el 15,
contestando cuándo y cómo: se dan por terminadas *«cuando el agente supremo principal lea la
sesión y considere que la tarea se ha terminado»*, y entonces *«se elimina por completo, para
mantener un espacio limpio, con su respectivo rastro de handoff o feedback»*. Eligió esto frente
a un reloj (cerrarla a la media hora), a una tira de «delegadas» y a un botón.

- **Adeorq apunta quién abrió cada una** (`Puente::delegadas` en `mcp.rs`, con el panel que
  presentó el puente del agente; solo vale en ese arranque, como los números). `get_active_panes`
  lo dice: «Abierta por: ti (cuando su tarea esté hecha, ciérrala con close_pane y su rastro)» a
  quien la abrió, y «Abierta por: el panel N» a los demás.
- **`close_pane` pide su `rastro`** para una que abrió un agente: qué hizo, dónde dejó su parte y
  qué falta, de 40 a 8.000 caracteres. Sin él, o si no se puede guardar, no la cierra. Se guarda
  en `%LOCALAPPDATA%\Adeorq\rastros\<fecha UTC>-<nombre>.md` con su carpeta, la conversación que
  corría (`claude --resume <id>`) y quién la abrió y la cerró (`rastros.rs`). La conversación NO se
  borra: es de Claude Code, y con ese id se retoma.
- **Se va entera**: el cierre por MCP no deja el aviso de «cerrada» ni el Ctrl+Z de la X
  (`quitarPane(id, false)` en `App.tsx`). La X de Munir sigue igual.
- **Lo que no cubre:** una delegada cuyo agente se cerró antes que ella se queda sin dueño; esa la
  cierra Munir o la Suprema. Y el rastro no se ve todavía en la app: vive en esa carpeta.
- **Medido:** `cargo test --lib rastros::` y `node scripts/laboratorio/rastro-de-verdad.mjs` (el
  puente de verdad contra una Adeorq aislada: abre, lista, se niega sin rastro, cierra con él,
  escribe el archivo y no enseña el aviso). NO PROBADO con un agente de verdad decidiendo solo.

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
