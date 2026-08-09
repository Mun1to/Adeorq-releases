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

#[tauri::command]
pub async fn foreman_lote(tareas: String, context: String) -> Result<String, String> {
    preguntar(format!(
        "{LOTE_SYSTEM}\n\n## Dónde trabaja\n{context}\n\n## Las tareas\n{tareas}"
    ))
    .await
}

async fn preguntar(prompt: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
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
                PLAN_MODEL,
                "--output-format",
                "json",
                "--strict-mcp-config",
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
