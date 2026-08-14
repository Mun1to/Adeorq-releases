// The Foreman (Capataz): turns Munir's natural-language request into a strict
// JSON action plan via one non-interactive `claude -p` call (his Max
// subscription, no API keys). The model interprets; the UI then validates
// every action against known projects/sessions and executes with
// deterministic code. House principle: the model never runs anything itself.
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use crate::SinVentana;

const PLAN_TIMEOUT: Duration = Duration::from_secs(120);

const SYSTEM_PROMPT: &str = r#"Eres el Capataz de Adeorq, el panel de vibe coding de Munir. Convierte su pedido en un plan de acciones ESTRICTO en JSON. Munir te habla como a un jefe de obra: dice el objetivo del día ("hoy quiero arreglar errores de VoCript", "quiero hacer la web de Layco") y tú montas el tablero exacto para eso.

Acciones permitidas (campo "tipo"):
- "abrir_sesion": retomar una sesión existente. Campos: "sessionId" (exacto), "motivo" (por qué ESA sesión sirve para el objetivo).
- "claude_nuevo": abrir un Claude Code nuevo. Campos: "proyecto" (nombre exacto), "rol" (etiqueta corta: "Bugs", "Web", "Backend"...), "prompt" (el encargo COMPLETO), y "shadow" opcional (boolean: true si va a escribir/editar código y quieres que empiece aislado en Modo Espejo / SVFS).
- "terminal": consola PowerShell en un proyecto. Campos: "proyecto".
- "antigravity": el agente de Google (Gemini) en ese proyecto. Campos: "proyecto", "encargo" (cometido completo y autónomo).
- "comando": escribir un comando en la terminal que Munir tenga activa (NO lo ejecuta: él da al Enter). Campos: "comando" (exacto, de la lista de Comandos disponibles), "motivo".
- "a_todas": mandar la MISMA orden a TODAS las terminales de agente que tenga abiertas ahora. Campos: "comando" (lo que se escribe en cada una, tal cual) y "motivo". Es para cambios de ajuste en bloque, que es justo lo que pide cuando dice "cambia el esfuerzo de todas a high" o "ponlas todas en opus":
  · esfuerzo -> "/effort high" (valores: low, medium, high, xhigh, max)
  · modelo   -> "/model opus" (alias: fable, opus, sonnet, haiku)
  · cualquier otra orden que él diga literalmente para todas.
  ⚠ Una sola acción "a_todas" por plan, y solo si pide explícitamente que sea para TODAS (o "todas las abiertas", "en bloque", "a la vez"). Si quiere cambiarlo en una sola, usa "comando".
- "cerrar_panel": reciclar un panel que ya cumplió. Campos: "paneId" (el número que sale en el estado) y "motivo".
  ⚠ SOLO para paneles cuyo estado diga "terminó y entregó" o "libre". Un panel que "TE ESPERA" tiene una pregunta sin contestar y cerrarlo la pierde; uno que está "trabajando" pierde el trabajo. La aplicación rechaza esas dos por su cuenta, pero no las propongas: proponerlas gasta el turno de Munir en decir que no.
  ⚠ Tampoco cierres un panel con subagentes fuera, aunque el resto encaje.
- "revisar": abrir un panel NUEVO cuyo único trabajo es comprobar lo que hizo otro. Campos: "proyecto", "encargo" (QUÉ hay que comprobar, concreto) y "paneId" opcional, y "shadow" opcional (boolean: true para aislarlo en Modo Espejo).
  ⚠ El revisor nunca es el que hizo el trabajo: por eso siempre nace en un panel aparte. No uses "comando" para pedir una revisión dentro del mismo panel.
- "cuadrilla": UNA tarea repartida entre VARIOS agentes que trabajan a la vez. Campos: "proyecto", "objetivo", "porque", "partes", y "shadow" opcional (boolean: true si quieres que toda la cuadrilla se abra con Modo Espejo activado).
  Es para cuando Munir pide ir rápido con algo grande: "quiero esto hoy", "reparte esto", "ábreme las que hagan falta". Una sola acción "cuadrilla" por plan.

CÓMO SE REPARTE UNA CUADRILLA (esto decide si sirve de algo o es un lío):
- El número sale del TRABAJO, no de lo que impresione: cuenta cuántos trozos de verdad independientes hay y abre uno por trozo. Entre 2 y 6. Si la tarea no se puede partir en pedazos que no se toquen, NO uses "cuadrilla": di en el resumen que esto es de uno solo y por qué. Dos agentes editando el mismo archivo van más lento que uno, porque se pisan y hay que deshacer.
- Cada parte lleva su "frontera": los archivos o carpetas que son SUYOS, sin solaparse con ninguna otra. Escríbelas explícitas ("src/components/**", "src-tauri/src/pty.rs"). Si dos partes necesitan el mismo archivo, no son dos partes.
- Los buenos cortes suelen ser: por capas (interfaz / servidor / base de datos), por carpetas, por tipo de trabajo (código / pruebas / documentación) o por área (autenticación / pagos / correo). El mal corte es "la mitad de cada cosa".
- Los "encargo" se escriben como los de "claude_nuevo" (objetivo, contexto, qué entregar, qué NO tocar) y ADEMÁS dicen qué hace cada uno de los otros, para que nadie repita ni espere a nadie.
- Reserva un rol de "juntar" solo si el trabajo lo necesita de verdad (por ejemplo, alguien que integre al final). No lo pongas por costumbre.

MODELO POR ACCIÓN (campo opcional "modelo" en "claude_nuevo" y "revisar"):
- Alias válidos: opus, sonnet, haiku, fable. Si no pones ninguno, la aplicación elige por el rol con su tabla, así que omítelo cuando el rol ya lo dice.
- Elige por lo que el trabajo EXIGE, no por lo que suena mejor: gastar opus en un recado es tirar el dinero, y poner sonnet en una auditoría de seguridad sale mucho más caro que lo que ahorra.

SELECCIÓN DE SESIONES (lo más importante):
- Elige SOLO las sesiones cuyo título encaje con el objetivo del día. Si pide "errores de VoCript", van las de bugs/fixes de VoCript, NO todas las de VoCript.
- Prioriza las que esperan respuesta (estado pregunta/ofrece) y las recientes.
- Mejor 2 o 3 sesiones que valgan que 6 de relleno. Si ninguna encaja, abre un claude_nuevo con encargo en vez de retomar por retomar.
- ⚠ NUNCA retomes una sesión marcada con "se retoma en ... NO en la carpeta del proyecto" cuando Munir quiera TRABAJAR en ese proyecto: esa sesión arrancaría en otra carpeta y el agente no vería el código. En ese caso usa "claude_nuevo" en el proyecto (así nace en su sitio) y dilo en el motivo.

CÓMO ESCRIBIR LOS "prompt" Y "encargo" (encargos de calidad, no frases sueltas):
- Escribe el encargo como se lo darías a un buen freelance: objetivo, contexto del proyecto, qué entregar y dónde, y qué NO tocar.
- Si en el estado hay SKILLS que encajan, ordena usarlas por su nombre. Ejemplos: una web o landing con movimiento/scroll -> "invoca la skill /frontlaxweb antes de diseñar"; arranque de tema e idioma -> "/smart-defaults"; edición visual en localhost -> "/froede".
- Cuando el objetivo sea diseñar algo de cara al público (web, landing, marca), ordena INVESTIGAR PRIMERO: "busca en internet 3 o 4 webs de competidores del sector, apunta qué patrón usan (hero, prueba social, precios) y parte de ahí; enséñame las referencias antes de escribir código".
- Termina siempre pidiendo plan corto y OK antes de tocar archivos, y recuerda seguir AGENTS.md si existe.
- Idioma de los encargos: español.

SI MUNIR PREGUNTA POR UN COMANDO O UNA SKILL ("¿hay algo para deshacer?", "¿cómo veo mi cuota?", "¿existe un comando para X?"):
- Contesta en el "resumen" cuál es y para qué sirve, en cristiano y en una frase.
- Añade UNA acción "comando" con ese comando exacto para que lo tenga escrito y solo tenga que dar Enter.
- Si no existe ninguno, dilo claro en el resumen y no inventes comandos que no estén en la lista.

Reglas duras:
- SOLO proyectos, sessionIds y paneIds del Estado actual. No inventes ninguno.
- Cuando Munir pida "ordena esto", "limpia el tablero" o "libera contexto": mira los paneles del estado, propón cerrar los que ya entregaron, y DI EN EL RESUMEN cuáles no tocas porque le esperan. Si dos paneles están en el mismo proyecto haciendo lo mismo, dilo: el trabajo duplicado cuesta más que cualquier modelo.
- Máximo 8 acciones. Las mínimas que cumplan el objetivo. Una "cuadrilla" cuenta como UNA acción aunque abra seis agentes.
- "a_todas" NO abre nada: si además hay que abrir terminales, ponlas como acciones aparte.
- Equipos mixtos: reparte fronteras de archivos SIN solape y ordena coordinarse por el BUZON.md del proyecto.
- Si el pedido no encaja en estas acciones, devuelve "acciones": [] y explícalo en "resumen".
- Responde SOLO con JSON válido, sin markdown, sin texto antes ni después:
{"resumen": "una frase de qué montas", "acciones": [ ... ]}
- No uses herramientas ni leas archivos: responde inmediatamente con el plan."#;

fn claude_exe() -> PathBuf {
    if let Some(home) = crate::dir_casa() {
        let p = Path::new(&home)
            .join(".local")
            .join("bin")
            .join("claude.exe");
        if p.exists() {
            return p;
        }
    }
    PathBuf::from("claude")
}

/// Una sesión de usar y tirar, que se lleva su rastro al morir.
///
/// Cada `claude -p` del Capataz archiva un transcript en `~/.claude/projects`
/// exactamente igual que una sesión que abre Munir a mano, y el panel no tiene
/// forma de distinguirlos por el nombre: los títulos salían del prompt, así que
/// su lista se llenaba de «Eres el Capataz…», «Te doy las piezas…», «Te dan el
/// esqueleto…». El 2026-08-14 eran 57 de los 113 transcripts de la máquina, o
/// sea que más de la mitad de lo que se le enseñaba como trabajo suyo era el
/// Capataz hablando solo.
///
/// El arreglo ya estaba inventado en casa: es el mismo que sacó de la lista las
/// sondas de `/usage` (`usage.rs`). Se le da a la llamada un id nuestro con
/// `--session-id` y se borra su archivo al terminar. Va en un `Drop` y no en
/// una línea al final porque estos oficios salen por muchas puertas (parado por
/// Munir, timeout, error del CLI, éxito) y ninguna debe dejar rastro.
struct SinRastro(String);

impl SinRastro {
    fn nueva() -> Self {
        Self(crate::usage::throwaway_id())
    }
    fn id(&self) -> &str {
        &self.0
    }
}

impl Drop for SinRastro {
    fn drop(&mut self) {
        crate::usage::drop_transcript(None, &self.0);
    }
}

/// Con qué cerebro piensa el Capataz.
///
/// Se fija aquí y no se hereda del que Munir tenga por defecto. Sin este flag
/// el plan lo escribía Opus, porque ese es su ajuste, y eso es un martillo
/// pilón para lo que hace esta llamada: leer una lista de proyectos y sesiones
/// que ya se le da hecha y devolver ocho acciones como mucho, de tipos
/// cerrados, en JSON. Era el motivo de que el Capataz tardase tanto (Munir,
/// 2026-07-29), y encima gastaba del modelo caro para no decidir casi nada.
///
/// Sonnet y no Haiku a propósito: la tabla de la casa (`src/lib/models.ts`)
/// manda Haiku a los recados mecánicos, y esto no lo es del todo —de acertar
/// aquí depende QUÉ sesiones se despliegan, y un plan mal montado cuesta mucho
/// más que la diferencia—. Es el mismo criterio que ya aplica esa tabla al
/// resto del tablero; lo raro era que el propio Capataz no la siguiera.
const PLAN_MODEL: &str = "sonnet";

/// Cómo se escribe un buen encargo, dicho por quien lo va a recibir.
///
/// Lo que Munir dice en voz alta es cierto pero le faltan las tres cosas que
/// un agente necesita para no preguntar: dónde tocar, qué NO tocar y cómo se
/// sabe que quedó bien. Eso es lo que se añade aquí, y solo eso: NO se inventa
/// lo que quiere. Un "mejorador" que decide por su cuenta que además hay que
/// migrar a TypeScript no ha mejorado el encargo, ha escrito otro.
///
/// Y desde 2026-08-01 la MISMA respuesta trae la clasificación de la tarea,
/// que es lo que alimenta al router (`src/lib/router.ts`). Va aquí y no en una
/// segunda llamada por lo que ya dice `src/lib/models.ts`: gastar tokens para
/// decidir qué modelo gasta tokens solo sale a cuenta si acierta, y aquí sale
/// gratis porque esta llamada ya se estaba haciendo.
///
/// Lo que se le pide clasificar es DELIBERADAMENTE poco: qué exige el trabajo,
/// no qué modelo usar. El modelo no sabe qué CLIs hay instalados, qué cuentas
/// están conectadas ni cuánta semana queda, así que si eligiera él el destino
/// estaría adivinando con menos datos que el código que viene después.
const PROMPT_SYSTEM: &str = r#"Eres el Capataz de Adeorq. Munir te suelta en una frase lo que quiere que haga el agente que tiene delante en la terminal, normalmente hablando y de pasada. Tu trabajo es doble: convertir eso en el encargo que ese agente necesita leer, y decir qué EXIGE ese trabajo.

CÓMO SE ESCRIBE EL ENCARGO:
- En SEGUNDA PERSONA, dirigido al agente, como se lo diría Munir.
- Añade solo lo que falta para no tener que preguntar: en qué parte del proyecto mirar, qué NO hay que tocar, y cómo se comprueba que quedó bien.
- NO inventes requisitos que él no ha pedido. Si dice "más futurista", eso es lo que quiere; no decidas tú que además hay que cambiar la tipografía de la app.
- Si lo que ha dicho es ambiguo en algo que importa, díselo AL AGENTE dentro del encargo ("si hay más de un icono del Capataz, pregúntame cuál antes de tocar nada"), en vez de elegir tú.
- Español, tono directo, sin florituras. Entre 2 y 6 frases; si de verdad hace falta una lista corta, ponla.
- Sin saludo, sin "aquí tienes", sin comillas alrededor. Se pega tal cual en una terminal.

CÓMO SE CLASIFICA (esto decide con qué cerebro se abre, así que piénsalo):
- "clase": qué tipo de cabeza pide el trabajo.
  · "recado": mecánico. Renombrar, traducir, formatear, corregir un typo, aplicar un cambio ya decidido en muchos sitios. Se sabe de antemano cómo queda bien.
  · "oficio": el grueso del día. Escribir una función o una pantalla, un refactor, tests, estilos, montar una web. Hay decisiones, pero los errores se ven enseguida.
  · "juicio": donde equivocarse SIN QUE SE NOTE sale caro. Seguridad, auditoría, revisar el trabajo de otro, arquitectura, un bug que no se reproduce, tocar dinero o datos de gente.
- "consecuencia": "alta" si un fallo puede pasar desapercibido y hacer daño después (borra datos, rompe producción, se publica, toca credenciales o pagos). "baja" si al mirarlo se ve que está mal.
  ⚠ El TAMAÑO no es consecuencia. Un cambio enorme y mecánico sigue siendo de consecuencia baja.
- "largo": true si va a tener que leer o escribir mucho (media docena de archivos largos, un repo entero, una migración).
- "trabajo": "codigo", "texto", "lectura" (leer y resumir, investigar, buscar) o "diseno" (interfaz, marca, web de cara al público).

Responde SOLO con JSON válido, sin markdown, sin nada antes ni después:
{"encargo": "el encargo completo, tal cual se pega en la terminal", "clase": "recado|oficio|juicio", "consecuencia": "baja|alta", "largo": false, "trabajo": "codigo|texto|lectura|diseno", "porque": "media frase diciendo por qué es de esa clase"}"#;

/// Runs `claude -p` and returns the model's raw text (the plan JSON).
/// Blocking work happens on a worker thread via async_runtime::spawn_blocking.
#[tauri::command]
pub async fn foreman_plan(request: String, context: String) -> Result<String, String> {
    preguntar(format!(
        "{SYSTEM_PROMPT}\n\n## Estado actual\n{context}\n\n## Pedido de Munir\n{request}"
    ))
    .await
}

/// El otro oficio del Capataz: convertir lo que Munir suelta de pasada en el
/// encargo que de verdad hay que darle al agente que tiene delante.
///
/// Es lo contrario de planificar, y por eso no comparte ni el prompt ni la
/// verja: aquí no se decide NADA. No elige proyecto, no abre nada, no toca el
/// tablero. Solo escribe mejor lo que él ya quería decir, y lo que salga se le
/// enseña antes de que llegue a ninguna terminal. Un texto que va a un cuadro
/// para que él lo lea no necesita que un validador lo apruebe: necesita que lo
/// vea, que es una garantía más fuerte y más barata.
#[tauri::command]
pub async fn foreman_prompt(request: String, context: String) -> Result<String, String> {
    preguntar(format!(
        "{PROMPT_SYSTEM}\n\n## Dónde está trabajando\n{context}\n\n## Lo que ha dicho\n{request}"
    ))
    .await
}

/// El lote entero en UNA llamada.
///
/// Es la diferencia entre que el reparto salga a cuenta o no: seis tareas son
/// seis encargos que escribir, y hacerlo de una en una son seis llamadas, seis
/// esperas y seis veces el mismo contexto pagado. Con una sola, además, el
/// modelo ve todas las tareas juntas, que es lo que le permite repartir los
/// archivos sin que dos se pisen: eso no se puede decidir mirando una sola.
const LOTE_SYSTEM: &str = r#"Eres el Capataz de Adeorq. Te llega una LISTA de tareas que el usuario quiere repartir entre varios agentes que van a trabajar A LA VEZ. Para cada una: escribe el encargo que ese agente necesita leer, dile qué archivos son SUYOS, y clasifica qué exige el trabajo.

CÓMO SE ESCRIBE CADA ENCARGO:
- En SEGUNDA PERSONA, dirigido al agente. Español, directo, entre 2 y 5 frases.
- Añade solo lo que falta para no preguntar: dónde mirar, qué NO tocar, cómo se comprueba que quedó bien.
- NO inventes requisitos que no ha pedido, y si algo importante es ambiguo, que el encargo diga al agente que pregunte antes de tocarlo.
- Sin saludo y sin comillas: se pega tal cual en una terminal.

CÓMO SE REPARTEN LOS ARCHIVOS (esto decide si el reparto sirve o es un lío):
- "frontera": los archivos o carpetas que son SUYOS, explícitos ("src/components/**", "src-tauri/src/pty.rs"). Que NO se solapen con los de otra tarea.
- Si dos tareas de la lista necesitan el mismo archivo, NO son dos tareas: dilo poniéndoles la misma frontera y avisando en su "porque" de que van seguidas, no a la vez.
- Si una tarea no se puede acotar a unos archivos, deja "frontera" vacía.

CÓMO SE CLASIFICA (esto decide con qué cerebro se abre):
- "clase": "recado" (mecánico, se sabe de antemano cómo queda bien), "oficio" (el grueso: una pantalla, un refactor, tests, estilos) o "juicio" (donde equivocarse SIN QUE SE NOTE sale caro: seguridad, auditorías, revisar a otro, arquitectura, dinero o datos de gente).
- "consecuencia": "alta" si un fallo puede pasar desapercibido y hacer daño después. "baja" si al mirarlo se ve que está mal. ⚠ El TAMAÑO no es consecuencia.
- "largo": true si va a leer o escribir mucho.
- "trabajo": "codigo", "texto", "lectura" o "diseno".

Responde SOLO con JSON válido, sin markdown, sin nada antes ni después:
{"objetivo": "una frase de qué se consigue con todo el lote", "tareas": [{"texto": "la tarea tal como te la dieron", "encargo": "el encargo completo", "frontera": "src/... o vacío", "clase": "recado|oficio|juicio", "consecuencia": "baja|alta", "largo": false, "trabajo": "codigo|texto|lectura|diseno", "porque": "media frase de por qué es de esa clase"}]}

Devuelve UNA entrada por tarea recibida, en el mismo orden, sin juntarlas ni partirlas."#;

/* ── El mapa de cómo funciona un proyecto ───────────────────────────────────
 *
 * Esto SUSTITUYE al esquema de carpetas de arriba, y el motivo es de fondo:
 * Munir pidió un mapa de la infraestructura enseñando un diagrama de flujo, y
 * un diagrama de flujo dice quién llama a quién. Eso NO ESTÁ EN EL DISCO: una
 * carpeta `src/` no sabe que la llama nadie. Hay que leer el código.
 *
 * Por eso este oficio del Capataz es el único que tiene manos de LECTURA, y por
 * eso cuesta minutos en vez de segundos. El escáner de carpetas no se tira: se
 * le manda ya masticado como chuleta de dónde mirar, que es lo que evita que se
 * gaste media conversación en `Glob` antes de abrir el primer archivo.
 *
 * Y como tarda minutos, NO se espera en silencio: la salida viene en streaming
 * y cada archivo que el Capataz abre se emite como evento para que la pantalla
 * diga en qué anda. Dos minutos con una frase quieta se leen como un cuelgue
 * (Munir, 2026-08-14: «tarda mucho, no funciona bien»); los mismos dos minutos
 * diciendo «leyendo src/App.tsx» se leen como trabajo. */

/// Leer código y entender quién llama a quién es criterio, no recado: aquí sí
/// se paga el cerebro mediano. Medido el 2026-08-14 sobre Adeorq entero
/// (438 archivos): 125 s para el mapa y 87 s para los caminos.
const MAPA_MODEL: &str = "sonnet";

/// Seis minutos. No es un número de miedo: leer diez archivos de verdad con el
/// antivirus de por medio no entra en los 120 s del resto de oficios, y morir a
/// mitad después de dos minutos de espera es peor que tardar.
const MAPA_TIMEOUT: Duration = Duration::from_secs(360);

const MAPA_SYSTEM: &str = r#"Eres el Capataz de Adeorq. Te dan un proyecto y tienes que explicar CÓMO FUNCIONA POR DENTRO, no qué carpetas tiene.

El resultado es un diagrama de flujo: cajas con una explicación dentro, unidas por flechas que dicen quién le pide qué a quién. Alguien que no conoce el proyecto tiene que entender, mirándolo, por dónde entra una acción suya y qué pasa después.

CÓMO TRABAJAS:
- Tienes el esqueleto del proyecto abajo. Úsalo para saber DÓNDE mirar, no para describirlo.
- LEE el código: los puntos de entrada primero (main, index, App, lib/, mod.rs, el manifiesto), y después lo que ellos llaman. Con leer entre 8 y 15 archivos bien elegidos basta; no hace falta abrirlo todo.
- Lo que digas tiene que salir de algo que has leído. Si no lo has comprobado, no lo pongas.

LAS PIEZAS:
- Entre 6 y 12. Una pieza es algo que HACE algo (guardar sesiones, hablar con la terminal, pintar el lienzo), no una carpeta.
- "nombre": en español, tal como lo llamaría quien usa el programa. Nada de nombres de archivo como nombre.
- "que": UNA frase de OCHO A DIECIOCHO palabras diciendo para qué está esa pieza. Empieza por el verbo.
- "donde": el archivo o la carpeta donde vive de verdad, tal como aparece en el esqueleto.
- "capa": una de estas cuatro, y solo estas:
  - "gente": lo que la persona toca (ventanas, pantallas, botones).
  - "interfaz": lo que dibuja y decide en el navegador o en la vista.
  - "nucleo": lo que corre nativo o en el servidor (Rust, Node, Python), lo que tiene permisos de verdad.
  - "fuera": lo que NO es del proyecto y este usa: el disco, otros programas, la red, una base de datos.

LAS FLECHAS:
- Entre 6 y 14. Una flecha es una llamada real que has visto en el código, no un parecido.
- "de" y "a" son "id" de piezas de tu propia lista, nunca inventados.
- "que": DE DOS A CINCO palabras, en presente, diciendo qué se le pide: "abre una terminal", "pide el listado", "avisa de que llegó texto".
- No dibujes la flecha obvia de "todo llama a todo": elige las que cuentan el camino principal.

LOS CAMINOS (el mapa mental):
- Además del mapa, cuenta entre 4 y 6 RECORRIDOS: qué pasa, paso a paso, cuando la persona hace algo.
- Un recorrido es una línea recta de piezas: empieza donde empieza la acción y termina donde termina. Sirve para entender una cosa entera sin ver las demás.
- Cada uno, de 3 a 5 pasos. Si necesita más, es que son dos recorridos.
- Entre todos tienen que salir CASI TODAS las piezas. Una pieza que no sale en ningún recorrido es una pieza que el lector no sabrá que existe.
- Un recorrido termina donde la persona VE el resultado, cuando lo ve. Un camino que acaba en el disco y nunca vuelve a la pantalla cuenta media historia.
- Una pieza puede salir en varios: eso es bueno, es lo que enseña cuál es el centro.
- "titulo": lo que pasa, en 2 a 5 palabras, empezando por un verbo en presente y en segunda persona cuando lo hace la persona ("Abres una terminal", "Un agente te pide algo").
- "porque": UNA frase de DIEZ A VEINTE palabras de qué se consigue con ese recorrido.
- "pasos": la lista de piezas en orden. El primero no lleva "como"; los demás llevan "como": DE DOS A CINCO palabras de qué le pide el paso anterior a este.

EL RESUMEN:
- DOS frases: qué es el programa y por dónde empieza a entenderse.
- Si es un patrón conocido (app de escritorio con front web y núcleo nativo, web estática, librería, servicio), dilo con esas palabras.

Responde SOLO con JSON válido, sin markdown, sin nada antes ni después:
{"resumen": "dos frases", "piezas": [{"id": "corto-sin-espacios", "nombre": "…", "capa": "gente|interfaz|nucleo|fuera", "que": "…", "donde": "ruta/del/esqueleto"}], "flechas": [{"de": "id", "a": "id", "que": "…"}], "caminos": [{"titulo": "…", "porque": "…", "pasos": [{"pieza": "id"}, {"pieza": "id", "como": "…"}]}]}"#;


/// Si Munir ha pulsado «Parar». Global y no por llamada porque solo puede haber
/// un mapa leyéndose a la vez: la pantalla no deja pedir otro mientras.
static PARAR_MAPA: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Parar la lectura a medias. Sin esto, equivocarse de proyecto costaba seis
/// minutos de espera obligatoria mirando una pantalla vacía.
#[tauri::command]
pub async fn parar_mapa() {
    PARAR_MAPA.store(true, std::sync::atomic::Ordering::Relaxed);
}

/// Qué está haciendo el Capataz ahora mismo, en cristiano.
///
/// Sale del `tool_use` que emite el CLI: se traduce a una frase corta y nada
/// más. Enseñar el nombre de la herramienta («Grep») sería enseñar la tubería;
/// lo que dice algo es QUÉ archivo está abriendo.
fn frase_de_paso(bloque: &serde_json::Value) -> Option<String> {
    let nombre = bloque["name"].as_str()?;
    let entrada = &bloque["input"];
    let hoja = |v: &serde_json::Value| -> String {
        v.as_str()
            .unwrap_or("")
            .replace('\\', "/")
            .rsplit('/')
            .next()
            .unwrap_or("")
            .to_owned()
    };
    Some(match nombre {
        "Read" => format!("Leyendo {}", hoja(&entrada["file_path"])),
        "Glob" => format!("Buscando {}", entrada["pattern"].as_str().unwrap_or("archivos")),
        "Grep" => format!("Rastreando «{}»", entrada["pattern"].as_str().unwrap_or("")),
        _ => return None,
    })
}

/// Y el mismo oficio, pero para la carpeta que tiene DENTRO todos los
/// proyectos.
///
/// Es otro encargo, no el mismo con más archivos: veintiocho proyectos no
/// tienen un «cómo funciona» común, y pedírselo con el prompt de arriba mandaba
/// al Capataz a buscar puntos de entrada donde solo hay carpetas hermanas. Aquí
/// cada pieza es UN PROYECTO, y las flechas son lo que un proyecto usa de otro.
/// Munir lo pidió de vuelta el mismo día que se quitó: es la vista de «qué
/// tengo montado» (2026-08-14).
const TALLER_SYSTEM: &str = r#"Eres el Capataz de Adeorq. Te dan una carpeta que contiene VARIOS proyectos distintos, uno por subcarpeta. Explica QUÉ TIENE MONTADO su dueño y cómo se apoyan unos en otros.

Cada pieza es UN PROYECTO, no un archivo ni un módulo. Esto no es el mapa de un programa: es el mapa de un taller.

CÓMO TRABAJAS:
- Abajo tienes la lista de proyectos, cada uno con lo que dice de sí mismo en su README o su AGENTS.md y con qué tecnología está hecho. Con eso basta: NO abras ningún archivo, ya está todo leído.
- Si un proyecto no trae descripción, ponlo igual y di en su "que" que no se puede saber sin abrirlo. Es mejor que inventárselo.

LAS PIEZAS:
- Entre 8 y 14, las que de verdad tengan algo dentro. Deja fuera lo archivado, las pruebas y las carpetas de apoyo, y dilo en el resumen si dejas algo fuera.
- "id": el nombre de la carpeta, tal cual.
- "nombre": cómo se llama el proyecto de cara a una persona.
- "que": UNA frase de OCHO A DIECIOCHO palabras de para qué sirve ese proyecto. Empieza por el verbo.
- "donde": el nombre de su carpeta.
- "capa": una de estas cuatro, y solo estas:
  - "gente": lo que una persona abre y usa (aplicaciones de escritorio o de móvil).
  - "interfaz": webs, páginas y landings.
  - "nucleo": librerías, motores y núcleos que usan los demás proyectos.
  - "fuera": servicios y programas de terceros de los que dependen.

LAS FLECHAS:
- Entre 5 y 12. Una flecha es que un proyecto USA a otro, comparte su código o publica en él, y tiene que estar dicho en algún sitio que hayas leído.
- "que": DE DOS A CINCO palabras: "usa su núcleo", "comparte la caché", "publica sus binarios".
- Si dos proyectos no se tocan, no los unas. Un taller donde todo apunta a todo no dice nada.

LOS CAMINOS:
- Entre 3 y 5. Aquí un camino es cómo se encadena un trabajo entre proyectos ("dictas por voz y acaba en código"), con las mismas reglas de formato de siempre.

EL RESUMEN:
- DOS frases: qué clase de taller es esto y qué lo une. Di también qué has dejado fuera.

Responde SOLO con JSON válido, sin markdown, sin nada antes ni después:
{"resumen": "dos frases", "piezas": [{"id": "carpeta", "nombre": "…", "capa": "gente|interfaz|nucleo|fuera", "que": "…", "donde": "carpeta"}], "flechas": [{"de": "id", "a": "id", "que": "…"}], "caminos": [{"titulo": "…", "porque": "…", "pasos": [{"pieza": "id"}, {"pieza": "id", "como": "…"}]}]}"#;

/// Las piezas de un proyecto y quién llama a quién, leyendo su código.
///
/// Las manos son la política entera: `--allowedTools` dice lo que puede, y
/// `--disallowedTools` cierra la puerta de atrás, porque las de solo lectura de
/// Claude Code no piden permiso y sin esto podría escribir. Aquí LEER es el
/// oficio, así que Read/Glob/Grep sí; tocar nada, jamás.
///
/// `--output-format stream-json` (con `--verbose`, que el CLI exige para ese
/// formato en modo `-p`) da una línea JSON por cada cosa que hace. Se leen en un
/// hilo aparte y se emiten como `mapa-paso`; el último, el de tipo `result`,
/// trae la respuesta entera.
#[tauri::command]
pub async fn foreman_mapa(
    app: tauri::AppHandle,
    ruta: String,
    esqueleto: String,
    // `todos` en true = la carpeta que contiene TODOS los proyectos. Cambia el
    // encargo entero, no un detalle: ahí cada pieza es un proyecto y no hay
    // código que leer, porque la lista viene ya masticada desde Rust.
    todos: Option<bool>,
) -> Result<String, String> {
    if !Path::new(&ruta).is_dir() {
        return Err(format!("«{ruta}» no es una carpeta"));
    }
    let taller = todos.unwrap_or(false);
    let prompt = if taller {
        format!("{TALLER_SYSTEM}\n\n## Los proyectos que hay dentro\n{esqueleto}")
    } else {
        format!("{MAPA_SYSTEM}\n\n## El esqueleto del proyecto\n{esqueleto}")
    };
    PARAR_MAPA.store(false, std::sync::atomic::Ordering::Relaxed);

    tauri::async_runtime::spawn_blocking(move || {
        use std::io::BufRead;
        use std::sync::atomic::Ordering;
        use tauri::Emitter;

        let sesion = SinRastro::nueva();
        let mut cmd = std::process::Command::new(claude_exe());
        cmd.args([
            "-p",
            &prompt,
            "--model",
            MAPA_MODEL,
            "--output-format",
            "stream-json",
            "--verbose",
            "--strict-mcp-config",
            // Con nombre nuestro para poder borrarle el transcript: ver `SinRastro`.
            "--session-id",
            sesion.id(),
        ]);
        // Manos SOLO cuando hay que leer código. Para el taller la lista viene
        // ya masticada desde Rust (`resumen_taller`), así que darle herramientas
        // sería invitarle a recorrer veintiocho proyectos para averiguar lo que
        // ya se le ha dicho: la primera prueba pasó de los seis minutos y no
        // llegó a terminar (2026-08-14).
        if !taller {
            cmd.args(["--allowedTools", "Read", "Glob", "Grep"]);
        }
        let mut child = cmd
            .args([
                "--disallowedTools",
                "Bash",
                "Write",
                "Edit",
                "NotebookEdit",
                "WebFetch",
                "WebSearch",
                "Task",
            ])
            // Desde el proyecto que se mira: es lo que hace que un `Read` con
            // una ruta relativa del esqueleto encuentre el archivo.
            .current_dir(&ruta)
            .sin_ventana()
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .stdin(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("no pude lanzar claude: {e}"))?;

        let salida = child.stdout.take().ok_or("claude no dio salida")?;
        let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
        let app2 = app.clone();
        // El lector va en su propio hilo y NUNCA bloquea al que vigila: si el
        // proceso se cuelga sin cerrar su salida, el de abajo lo mata igual.
        std::thread::spawn(move || {
            let mut leidos = 0usize;
            for linea in std::io::BufReader::new(salida).lines().map_while(Result::ok) {
                let Ok(v) = serde_json::from_str::<serde_json::Value>(&linea) else {
                    continue;
                };
                match v["type"].as_str() {
                    Some("assistant") => {
                        for b in v["message"]["content"].as_array().unwrap_or(&vec![]) {
                            if b["type"] == "tool_use" {
                                if let Some(f) = frase_de_paso(b) {
                                    leidos += 1;
                                    let _ = app2.emit("mapa-paso", format!("{f} ({leidos})"));
                                }
                            }
                        }
                    }
                    Some("result") => {
                        let _ = tx.send(if v["is_error"].as_bool().unwrap_or(false) {
                            Err(format!(
                                "claude devolvió error: {}",
                                v["result"].as_str().unwrap_or("desconocido")
                            ))
                        } else {
                            v["result"]
                                .as_str()
                                .map(|s| s.to_owned())
                                .ok_or_else(|| "la respuesta no trae texto".to_owned())
                        });
                    }
                    _ => {}
                }
            }
        });

        let start = Instant::now();
        loop {
            if PARAR_MAPA.swap(false, Ordering::Relaxed) {
                let _ = child.kill();
                let _ = child.wait();
                return Err("parado".into());
            }
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if start.elapsed() > MAPA_TIMEOUT => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("leer el proyecto tardó más de seis minutos; reintenta".into());
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(200)),
                Err(e) => return Err(e.to_string()),
            }
        }
        // Al terminar el proceso, el resultado ya viajó por el canal o está a
        // punto: se espera un momento y no para siempre, para que un CLI que
        // muera a media línea no deje esto colgado.
        match rx.recv_timeout(Duration::from_secs(5)) {
            Ok(r) => r,
            Err(_) => {
                let mut err = String::new();
                if let Some(mut e) = child.stderr.take() {
                    use std::io::Read;
                    let _ = e.read_to_string(&mut err);
                }
                Err(format!("claude no devolvió nada: {}", err.trim()))
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn foreman_lote(tareas: String, context: String) -> Result<String, String> {
    preguntar(format!(
        "{LOTE_SYSTEM}\n\n## Dónde trabaja\n{context}\n\n## Las tareas\n{tareas}"
    ))
    .await
}

/* ─────────────────────────── EL CUARTO OFICIO ─────────────────────────────
 *
 * Los tres de arriba (planificar, escribir un encargo, repartir un lote) son de
 * UN SOLO TIRO: se les da el estado ya masticado dentro del prompt y devuelven
 * un JSON. Sirve porque la pregunta se sabe de antemano.
 *
 * Conversar no se puede hacer así. «¿En qué proyectos estoy trabajando?»
 * necesita mirar las terminales, y «resúmeme lo de la 3» necesita leer una
 * transcripción de mil líneas que no cabe en ningún contexto pre-cocinado. Hace
 * falta que MIRE, decida y vuelva a mirar.
 *
 * Y ese bucle NO se escribe aquí: se le pide prestado a Claude Code, que ya lo
 * tiene hecho y probado, y se le enchufan SOLO las herramientas de Adeorq. Es
 * el harness encima del harness del cliente, y por eso esto son sesenta líneas
 * y no un módulo entero de tool-use.
 *
 * ⚑ LO QUE HACE QUE EL CONMUTADOR SEA DE VERDAD: los permisos no son una
 * promesa que alguien tiene que cumplir después, son la lista `manos`. Lo que
 * no está ahí, el Capataz NO PUEDE hacerlo aunque el modelo se empeñe, porque
 * la herramienta no existe en su sesión. Un AUTO/MANUAL escrito en un prompt
 * sería una petición educada; esto es una puerta cerrada.
 *
 * Medido el 2026-08-13 con `haiku` y la pregunta de los proyectos: 3 turnos,
 * 10,4 s. El doble que una llamada de un tiro, y ese es el precio de mirar.
 */

/// El fichero de MCP que se le pasa al Capataz, con Adeorq y nada más.
///
/// Apunta a `current_exe()` y no a una ruta escrita: así el Capataz habla con
/// ESTA ventana y no con la que hubiera instalada en otro sitio. Se reescribe
/// en cada llamada porque una actualización cambia el binario de sitio.
fn config_mcp() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("no sé dónde estoy: {e}"))?;
    // Barras normales: en un JSON, `C:\Apps\...` son escapes inválidos y el CLI
    // lo rechaza con «MCP config is not a valid JSON», que no dice nada de
    // barras. Windows acepta las de dividir igual de bien.
    let ruta = exe.to_string_lossy().replace('\\', "/");
    let json = serde_json::json!({
        "mcpServers": { "adeorq": { "type": "stdio", "command": ruta, "args": ["--mcp"], "env": {} } }
    });
    let destino = std::env::temp_dir().join("adeorq-capataz-mcp.json");
    std::fs::write(&destino, json.to_string()).map_err(|e| format!("no pude escribirlo: {e}"))?;
    Ok(destino)
}

/// Conversar con las manos puestas. `manos` son los nombres completos de las
/// herramientas (`mcp__adeorq__get_active_panes`), que es lo que decide el
/// front: la política vive en TypeScript, junto al router, donde se puede
/// probar sin arrancar la app.
#[tauri::command]
pub async fn foreman_agente(
    request: String,
    context: String,
    manos: Vec<String>,
    modelo: Option<String>,
) -> Result<String, String> {
    if manos.is_empty() {
        return Err("sin manos no hay agente: usa foreman_prompt".into());
    }
    let cfg = config_mcp()?;
    let modelo = modelo.unwrap_or_else(|| PLAN_MODEL.to_string());
    let prompt = format!("{AGENTE_SYSTEM}\n\n## Lo que ya se sabe\n{context}\n\n## Lo que te pide Munir\n{request}");

    tauri::async_runtime::spawn_blocking(move || {
        let sesion = SinRastro::nueva();
        let mut cmd = std::process::Command::new(claude_exe());
        cmd.args(["-p", &prompt, "--model", &modelo, "--output-format", "json"])
            // Con nombre nuestro para poder borrarle el transcript: ver `SinRastro`.
            .args(["--session-id", sesion.id()])
            // Solo el de Adeorq: los servidores que Munir tenga en su config
            // global no pintan nada aquí y cada uno suma arranque.
            .arg("--strict-mcp-config")
            .arg("--mcp-config")
            .arg(&cfg)
            .arg("--allowedTools");
        for m in &manos {
            cmd.arg(m);
        }
        // Y la puerta de atrás, cerrada. `--allowedTools` dice qué SÍ, pero las
        // de solo lectura de Claude Code no necesitan permiso, así que sin esto
        // el Capataz podría leerse el disco entero para responder «¿en qué
        // proyectos estoy?». Que solo pueda tocar Adeorq es media promesa si la
        // otra media se la salta por un camino que nadie miró.
        cmd.arg("--disallowedTools")
            .args(["Bash", "Write", "Edit", "NotebookEdit", "WebFetch", "WebSearch", "Task"]);
        let mut child = cmd
            .current_dir(crate::workspace::raiz_por_defecto())
            .sin_ventana()
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .stdin(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("no pude lanzar claude: {e}"))?;

        // Más margen que los otros tres oficios, y no por capricho: este da
        // varias vueltas de mirar y pensar, así que el reloj de una llamada
        // suelta se le queda corto.
        let start = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if start.elapsed() > AGENTE_TIMEOUT => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("el Capataz se quedó pensando demasiado (3 min); reintenta".into());
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(200)),
                Err(e) => return Err(e.to_string()),
            }
        }
        let out = child.wait_with_output().map_err(|e| e.to_string())?;
        let stdout = String::from_utf8_lossy(&out.stdout);
        if stdout.trim().is_empty() {
            let err = String::from_utf8_lossy(&out.stderr);
            return Err(format!("claude no devolvió nada: {}", err.trim()));
        }
        let wrapper: serde_json::Value =
            serde_json::from_str(stdout.trim()).map_err(|e| format!("envoltorio ilegible: {e}"))?;
        if wrapper["is_error"].as_bool().unwrap_or(false) {
            return Err(format!(
                "claude devolvió error: {}",
                wrapper["result"].as_str().unwrap_or("desconocido")
            ));
        }
        wrapper["result"]
            .as_str()
            .map(|s| s.to_owned())
            .ok_or_else(|| "la respuesta no trae texto".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

const AGENTE_TIMEOUT: Duration = Duration::from_secs(180);

const AGENTE_SYSTEM: &str = r#"Eres el Capataz de Adeorq, el panel desde el que Munir dirige a sus agentes. Estás DENTRO de Adeorq y tienes herramientas para mirarlo y para moverlo.

CÓMO CONTESTAS:
- En español, a Munir, de tú. Directo y corto: dos o tres frases, y si son datos, una lista de líneas cortas.
- Nada de preámbulos ni de "he usado la herramienta X". Él quiere la respuesta, no el procedimiento.
- Si te falta un dato para hacer algo bien, PREGÚNTALO en vez de adivinarlo. Un objetivo sin día, un encargo sin proyecto o una tarea sin archivos son preguntas, no suposiciones.

CÓMO TRABAJAS:
- MIRA antes de hablar. Tienes las herramientas para saber qué hay abierto de verdad; no respondas de memoria ni des por hecho lo que no has consultado.
- Si te piden algo que no puedes hacer porque no tienes esa herramienta, dilo en una frase y ofrece lo más cercano que sí puedas. No lo intentes por otro camino.
- No inventes nombres de proyecto, de sesión ni de panel: usa los que te devuelvan las herramientas, tal cual.
- Al terminar, di en una frase qué has hecho si has cambiado algo. Si solo has mirado, no hace falta."#;

/// El de siempre, con el cerebro del plan.
async fn preguntar(prompt: String) -> Result<String, String> {
    preguntar_con(prompt, PLAN_MODEL).await
}

/// Y el mismo, eligiendo cerebro. Existe porque no todos los oficios del
/// Capataz piden lo mismo: montar un tablero es criterio y ponerle nombre a
/// unas carpetas es un recado, y pagar el mismo modelo para los dos es pagar de
/// más Y esperar de más.
async fn preguntar_con(prompt: String, modelo: &'static str) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let sesion = SinRastro::nueva();
        let mut child = std::process::Command::new(claude_exe())
            // `--strict-mcp-config` sin ningún `--mcp-config` = CERO servidores
            // MCP. Munir tiene el de Adeorq puesto en global, así que cada
            // llamada del Capataz lo levantaba entero para no llamarlo jamás:
            // esto pide un JSON, no usa una sola herramienta. Medido el
            // 2026-08-09 con el mismo prompt: 6,75 s → 5,19 s, y el tiempo de
            // API idéntico (~2 s), o sea que el segundo y medio era todo
            // arranque. Sube solo si él conecta más servidores.
            //
            // ⚠ Y NO se usa `--bare`, que promete justo esto y más: su ayuda
            // dice que con él «OAuth y el llavero nunca se leen», y aquí se
            // entra con la suscripción de Munir, sin API key en ninguna parte
            // (regla de la casa). Con `--bare` el Capataz no se autenticaría.
            .args([
                "-p",
                &prompt,
                "--model",
                modelo,
                "--output-format",
                "json",
                "--strict-mcp-config",
                // Con nombre nuestro para poder borrarle el transcript después:
                // ver `SinRastro`.
                "--session-id",
                sesion.id(),
            ])
            // Desde la carpeta de proyectos del usuario, no desde una fija: en
            // un equipo sin `C:\proyectos` esto no llegaba ni a lanzarse.
            .current_dir(crate::workspace::raiz_por_defecto())
            .sin_ventana()
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .stdin(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("no pude lanzar claude: {e}"))?;

        let start = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if start.elapsed() > PLAN_TIMEOUT => {
                    let _ = child.kill();
                    // Esperarlo aunque ya esté muerto: `SinRastro` borra su
                    // transcript al salir de aquí y el CLI sigue escribiéndolo
                    // hasta que el sistema lo da por terminado.
                    let _ = child.wait();
                    return Err("el Capataz tardó demasiado (120 s); reintenta".into());
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(200)),
                Err(e) => return Err(e.to_string()),
            }
        }
        let out = child.wait_with_output().map_err(|e| e.to_string())?;
        let stdout = String::from_utf8_lossy(&out.stdout);
        if stdout.trim().is_empty() {
            let err = String::from_utf8_lossy(&out.stderr);
            return Err(format!("claude no devolvió nada: {}", err.trim()));
        }
        // -p --output-format json wraps the answer: {"type":"result","result":"..."}
        let wrapper: serde_json::Value =
            serde_json::from_str(stdout.trim()).map_err(|e| format!("envoltorio ilegible: {e}"))?;
        if wrapper["is_error"].as_bool().unwrap_or(false) {
            return Err(format!(
                "claude devolvió error: {}",
                wrapper["result"].as_str().unwrap_or("desconocido")
            ));
        }
        wrapper["result"]
            .as_str()
            .map(|s| s.to_owned())
            .ok_or_else(|| "la respuesta no trae texto".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Writes the MISION.md brief inside a project (Antigravity + Claude teams
/// coordinate through it). Path must stay under C:\proyectos.
#[tauri::command]
pub fn write_mission(project_path: String, content: String) -> Result<String, String> {
    let base = Path::new(&project_path);
    let canon = base
        .canonicalize()
        .map_err(|e| format!("ruta inválida: {e}"))?;
    let ok = canon
        .to_string_lossy()
        .to_lowercase()
        .trim_start_matches("\\\\?\\")
        .starts_with("c:\\proyectos");
    if !ok {
        return Err("la ruta queda fuera de C:\\proyectos".into());
    }
    let target = canon.join("MISION.md");
    std::fs::write(&target, content).map_err(|e| e.to_string())?;
    Ok(target
        .to_string_lossy()
        .trim_start_matches("\\\\?\\")
        .to_owned())
}
