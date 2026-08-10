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
demás; lo que le falta es **crear** sesiones y **conectarlas**.

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
  buffer con su ruido ANSI; el transcript limpio lo sabe leer `sessions.rs` por
  otro lado, y a la larga es de donde debería leer.
- **No todos los CLIs hablan MCP igual.** Que la suprema pueda SER Codex o Gemini
  depende de cómo registre cada uno sus servidores, y eso se verifica CLI a CLI
  antes de prometerlo (ver la regla de verificar un CLI nuevo).
