use std::collections::HashMap;
use std::io::{self, BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{Emitter, Manager};

/// ==========================================================================
/// EL PUENTE HACIA LA VENTANA
///
/// `send_command` no lo necesitaba: escribe directo al PTY, que es estado de
/// Rust. Pero ABRIR un panel del lienzo lo monta React (nodos, posición,
/// layout), así que hay que pedírselo al front y esperar a que conteste con el
/// número que le tocó.
///
/// Patrón petición/respuesta sobre los eventos que ya usa el PTY: aquí se emite
/// `mcp:pedido` y se bloquea en un canal; el front hace lo suyo y llama al
/// comando `mcp_reply`, que suelta el canal. Bloquear es correcto porque cada
/// cliente MCP se atiende en su propio hilo (ver `start_mcp_server`): no para
/// nada más de la app.
///
/// Ver `docs/SUPREMA.md`.
/// ==========================================================================

/// Lo que el front contesta a una petición.
#[derive(Clone, Debug, Deserialize, Serialize, Default)]
pub struct Respuesta {
    /// El panel que nació, cuando la petición era abrir uno.
    pub pane_id: Option<u32>,
    /// «lienzo» o «cabina»: la suprema tiene que saber dónde acabó su hijo,
    /// porque las flechas solo existen en el lienzo.
    pub donde: Option<String>,
    /// Por qué no se pudo. Si viene, lo demás no vale.
    pub error: Option<String>,
    /// Lo que se le cuenta al agente, cuando la ventana sabe más que nosotros.
    /// Ella conoce el CLI que abrió y si ese acepta encargo al arrancar, y de
    /// eso depende si el agente tiene que mandarlo él. Ver `lib/supremo.ts`.
    pub parte: Option<String>,
}

#[derive(Default)]
pub struct Puente {
    esperando: Mutex<HashMap<u64, mpsc::Sender<Respuesta>>>,
    siguiente: AtomicU64,
    /// Cuándo se abrió cada panel por MCP y cuál fue, para los dos topes.
    aperturas: Mutex<Vec<(Instant, u32)>>,
}

/// LOS DOS FRENOS, y no son opcionales.
///
/// La suprema es un agente que DECIDE (lo eligió Munir), así que el control no
/// puede ser «pregúntame cada vez»: sería inusable. Es presupuesto duro, aquí en
/// Rust, donde el agente no puede tocarlo. Cada sesión que abre es cuota de
/// verdad, y un árbol que se retroalimenta puede quemar la semana en veinte
/// minutos.
///
/// Seis vivas es el mismo tope que la cuadrilla. Doce por hora es para que un
/// bucle no abra y cierre sin parar sin llegar nunca a las seis.
const MAX_VIVOS: usize = 6;
const MAX_POR_HORA: usize = 12;
const VENTANA: Duration = Duration::from_secs(3600);
/// Lo que se espera a que la ventana conteste. Generoso porque abrir un panel
/// arranca un proceso, y corto comparado con lo que tarda un turno de agente.
const ESPERA: Duration = Duration::from_secs(25);

/// La ventana ya hizo lo que se le pidió (o no pudo): suelta al hilo que espera.
#[tauri::command]
pub fn mcp_reply(state: tauri::State<'_, Puente>, peticion: u64, respuesta: Respuesta) {
    if let Some(tx) = state.esperando.lock().unwrap().remove(&peticion) {
        let _ = tx.send(respuesta);
    }
}

/// Pide algo al front y espera su respuesta. Bloquea este hilo, con tope.
fn pedir_a_la_ventana(app: &tauri::AppHandle, clase: &str, datos: Value) -> Result<Respuesta, String> {
    let puente = app.state::<Puente>();
    let peticion = puente.siguiente.fetch_add(1, Ordering::Relaxed) + 1;
    let (tx, rx) = mpsc::channel::<Respuesta>();
    puente.esperando.lock().unwrap().insert(peticion, tx);

    let mut cuerpo = datos;
    cuerpo["peticion"] = json!(peticion);
    cuerpo["clase"] = json!(clase);
    if app.emit("mcp:pedido", &cuerpo).is_err() {
        puente.esperando.lock().unwrap().remove(&peticion);
        return Err("la ventana de Adeorq no responde".into());
    }

    match rx.recv_timeout(ESPERA) {
        Ok(r) => match r.error {
            Some(e) => Err(e),
            None => Ok(r),
        },
        Err(_) => {
            // Se limpia SIEMPRE, o el mapa crece con peticiones muertas cada vez
            // que la ventana tarde de más.
            puente.esperando.lock().unwrap().remove(&peticion);
            Err("la ventana de Adeorq no contestó a tiempo".into())
        }
    }
}

/// ==========================================================================
/// QUE LA TERMINAL ARRANQUE TRABAJANDO
///
/// Una terminal recién abierta por un agente no arranca: se queda parada en
/// «Quick safety check: is this a project you created or one you trust?», y ahí
/// sigue hasta que alguien contesta. Medido el 2026-08-27 abriendo tres.
///
/// Para una persona es un clic. Para el flujo que esto existe para hacer —un
/// agente monta su cuadrilla y se va a trabajar— es el final: la terminal nace
/// muerta y nadie se entera, porque desde fuera parece que está pensando.
///
/// El diálogo lo guarda Claude Code en `.claude.json`, una clave por carpeta.
/// Aquí se pone esa clave ANTES de abrir, y solo esa. Lo que NO se toca:
///
///   - `hasClaudeMdExternalIncludesApproved`, el segundo diálogo. Ese autoriza a
///     un `CLAUDE.md` a leer ficheros de FUERA de su carpeta, que es justo el
///     agujero por el que entraría un repositorio ajeno. Solo sale cuando el
///     proyecto tiene imports externos, así que bloquea mucho menos, y cuando
///     salga lo contesta el agente leyendo la pantalla.
///   - Cualquier carpeta que no exista. Marcar como de confianza un sitio que
///     todavía no está es firmar en blanco.
///
/// Se escribe de forma atómica (temporal al lado y renombrar) porque ese fichero
/// es la configuración ENTERA de Munir, con sus cincuenta proyectos y sus
/// servidores MCP dentro: una escritura a medias se la lleva toda. Y aun así hay
/// una carrera que no se puede cerrar desde aquí: Claude Code reescribe ese
/// mismo fichero al terminar cada sesión, con lo que tuviera en memoria, así que
/// puede pisar esto. Si pasa, el único síntoma es que el diálogo vuelve a salir
/// una vez, y el agente lo contesta. Por eso el fallo aquí nunca corta la
/// apertura: es una comodidad, no un requisito.
/// ==========================================================================
#[tauri::command]
pub fn confiar_carpeta(cwd: String, config_dir: Option<String>) -> Result<bool, String> {
    let carpeta = std::path::Path::new(cwd.trim());
    if cwd.trim().is_empty() || !carpeta.is_dir() {
        return Err(format!("«{}» no es una carpeta que exista.", cwd));
    }

    // Con cuenta propia (`CLAUDE_CONFIG_DIR`) el fichero vive DENTRO de esa
    // carpeta, no en la casa del usuario. Comprobado el 2026-08-27 en
    // `%LOCALAPPDATA%\Adeorq\accounts\claude-*\.claude.json`.
    let fichero = match config_dir.as_deref().map(str::trim).filter(|d| !d.is_empty()) {
        Some(dir) => std::path::PathBuf::from(dir).join(".claude.json"),
        None => crate::dir_casa()
            .ok_or("no sé cuál es la carpeta del usuario")?
            .join(".claude.json"),
    };
    if !fichero.is_file() {
        return Err("no hay ningún .claude.json que tocar".into());
    }

    let crudo = std::fs::read_to_string(&fichero).map_err(|e| e.to_string())?;
    let mut raiz: Value = serde_json::from_str(&crudo)
        .map_err(|e| format!("el .claude.json no se pudo leer, así que no lo toco: {}", e))?;

    // En ese fichero conviven las dos formas de escribir la misma carpeta
    // («C:\x» y «C:/x»): Munir tiene diecisiete entradas duplicadas por eso.
    //
    // La que hay que ESCRIBIR es la de barras normales, y esto no se dedujo, se
    // midió (2026-08-27): se abrió una terminal en `C:\proyectos\Skills\SiteIndex`
    // —con barras invertidas, que es como Adeorq se lo pasa al PTY— y Claude Code
    // 2.1.247 la guardó como `C:/proyectos/Skills/SiteIndex`. Normaliza. Las
    // diecisiete con barra invertida son de versiones viejas, y escribir así hoy
    // crearía una entrada duplicada que el CLI no mira: el diálogo saldría igual
    // y esto no serviría de nada, sin dar ningún error.
    //
    // Al COMPROBAR se miran las dos, porque una carpeta aceptada hace meses en el
    // formato antiguo sigue estando aceptada.
    let con_slash = cwd.trim().replace('\\', "/");
    let con_barra = cwd.trim().replace('/', "\\");

    let proyectos = raiz
        .get("projects")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let ya = [&con_slash, &con_barra].iter().any(|k| {
        proyectos
            .get(*k)
            .and_then(|p| p.get("hasTrustDialogAccepted"))
            .and_then(Value::as_bool)
            .unwrap_or(false)
    });
    if ya {
        return Ok(false);
    }

    // Solo esa clave, y respetando lo que ya hubiera de esa carpeta.
    let entrada = raiz
        .get_mut("projects")
        .and_then(Value::as_object_mut)
        .map(|m| m.entry(con_slash.clone()).or_insert_with(|| json!({})))
        .ok_or("el .claude.json no tiene la forma que esperaba, así que no lo toco")?;
    entrada["hasTrustDialogAccepted"] = json!(true);

    // Atómico: al lado (mismo volumen, si no `rename` falla) y encima.
    let temporal = fichero.with_extension("json.adeorq-tmp");
    std::fs::write(&temporal, serde_json::to_vec_pretty(&raiz).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(&temporal, &fichero).map_err(|e| {
        let _ = std::fs::remove_file(&temporal);
        e.to_string()
    })?;
    Ok(true)
}

/// ¿Queda presupuesto para abrir otra? Devuelve el motivo si no.
fn hay_sitio(app: &tauri::AppHandle) -> Result<(), String> {
    let puente = app.state::<Puente>();
    let mut aperturas = puente.aperturas.lock().unwrap();
    aperturas.retain(|(cuando, _)| cuando.elapsed() < VENTANA);

    if aperturas.len() >= MAX_POR_HORA {
        return Err(format!(
            "Tope alcanzado: {} terminales abiertas por MCP en la última hora. \
             Cada una cuesta cuota de verdad, así que Adeorq no abre más por ahora. \
             Cuéntaselo a quien te lo pidió en vez de reintentar.",
            MAX_POR_HORA
        ));
    }

    // Vivas de verdad: las que abrió el MCP y siguen en el mapa del PTY. Las que
    // el usuario haya cerrado a mano no cuentan, que para eso las cerró.
    let vivas = {
        let pty = app.state::<crate::pty::PtyState>();
        let map = pty.0.lock().unwrap();
        aperturas.iter().filter(|(_, id)| map.contains_key(id)).count()
    };
    if vivas >= MAX_VIVOS {
        return Err(format!(
            "Tope alcanzado: ya hay {} terminales vivas abiertas por MCP. \
             Cierra alguna (o pide que la cierren) antes de abrir otra.",
            MAX_VIVOS
        ));
    }
    Ok(())
}

/// Run the stdio-to-TCP bridge for MCP clients executing from console.
pub fn run_mcp_bridge() -> Result<(), Box<dyn std::error::Error>> {
    let stream = TcpStream::connect("127.0.0.1:3012")?;
    let mut stream_writer = stream.try_clone()?;
    let mut stream_reader = BufReader::new(stream);

    // Spawn a thread to read from TCP and write to stdout
    thread::spawn(move || {
        let stdout = io::stdout();
        let mut stdout_handle = stdout.lock();
        let mut line = String::new();
        loop {
            line.clear();
            match stream_reader.read_line(&mut line) {
                Ok(0) | Err(_) => break, // Connection closed
                Ok(_) => {
                    if stdout_handle.write_all(line.as_bytes()).is_err() || stdout_handle.flush().is_err() {
                        break;
                    }
                }
            }
        }
        std::process::exit(0);
    });

    // Main thread reads from stdin and writes to TCP
    let stdin = io::stdin();
    let mut stdin_reader = stdin.lock();
    let mut line = String::new();
    loop {
        line.clear();
        match stdin_reader.read_line(&mut line) {
            Ok(0) | Err(_) => break, // EOF or error
            Ok(_) => {
                if stream_writer.write_all(line.as_bytes()).is_err() || stream_writer.flush().is_err() {
                    break;
                }
            }
        }
    }

    Ok(())
}

/// Starts the TCP listener on port 3012 to handle MCP clients.
pub fn start_mcp_server(app: tauri::AppHandle) {
    thread::spawn(move || {
        // Se INSISTE en coger el puerto, no se abandona al primer intento.
        //
        // Antes bastaba con que el 3012 estuviera ocupado un segundo para que
        // el servidor MCP de Adeorq no existiera durante TODA la vida de la
        // app, en silencio. Y ocurre en el caso más normal que hay: instalar
        // una versión nueva. Al reinstalar, el Adeorq viejo aún está soltando
        // el puerto cuando el nuevo arranca, el bind falla, y a partir de ahí
        // cada sesión de Claude que naciera en la app tenía un servidor MCP
        // muerto: `claude mcp list` decía «Failed to connect» y nadie sabía
        // por qué. Munir se pasó una noche reinstalando versiones, así que lo
        // sufrió en cada una (2026-07-31).
        //
        // Medio minuto de reintentos cubre de sobra un relevo de instancias, y
        // si al cabo de ese rato sigue ocupado es que hay otro Adeorq vivo de
        // verdad: entonces el puerto es suyo y rendirse es lo correcto.
        let listener = {
            let mut intento = 0;
            loop {
                match TcpListener::bind("127.0.0.1:3012") {
                    Ok(l) => break Some(l),
                    Err(e) => {
                        intento += 1;
                        if intento >= 60 {
                            // Y rendirse no es una avería, que es lo que
                            // parecía: el mensaje soltaba el error de Windows
                            // en crudo («solo se permite un uso de cada
                            // dirección de socket») y mandaba a buscar un fallo
                            // que no existe. Pasa siempre que el dev arranca
                            // con la versión instalada abierta, que es el caso
                            // normal de un día de trabajo. Va al rastro además
                            // de a la consola, porque en una app de ventana la
                            // consola no la lee nadie.
                            crate::anotar(&format!(
                                "MCP: el 3012 ya lo sirve otro Adeorq, así que esta ventana \
                                 no lo sirve. Con una sola app abierta no pasa. ({e})"
                            ));
                            break None;
                        }
                        thread::sleep(std::time::Duration::from_millis(500));
                    }
                }
            }
        };
        let Some(listener) = listener else { return };

        for stream in listener.incoming() {
            if let Ok(stream) = stream {
                let app_clone = app.clone();
                thread::spawn(move || {
                    if let Err(e) = handle_mcp_client(stream, app_clone) {
                        eprintln!("Error handling MCP client: {}", e);
                    }
                });
            }
        }
    });
}

fn handle_mcp_client(stream: TcpStream, app: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let mut writer = stream.try_clone()?;
    let reader = BufReader::new(stream);

    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }

        let req: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                let err_res = json!({
                    "jsonrpc": "2.0",
                    "error": {
                        "code": -32700,
                        "message": format!("Parse error: {}", e)
                    }
                });
                writer.write_all(format!("{}\n", err_res).as_bytes())?;
                writer.flush()?;
                continue;
            }
        };

        let method = req["method"].as_str().unwrap_or_default();
        let id = req["id"].clone();
        let is_notification = id.is_null();

        let res = match method {
            "initialize" => {
                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {
                            "tools": {}
                        },
                        "serverInfo": {
                            "name": "adeorq-mcp",
                            "version": "0.9.21"
                        }
                    }
                })
            }
            "tools/list" => {
                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "tools": [
                            {
                                "name": "get_projects",
                                "description": "Lists all projects inside C:\\proyectos",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {}
                                }
                            },
                            {
                                "name": "get_active_panes",
                                "description": "Lists all active terminal panes in Adeorq",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {}
                                }
                            },
                            {
                                "name": "send_command",
                                "description": "Sends a command text to an active terminal pane by its ID",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "paneId": {
                                            "type": "number",
                                            "description": "The ID of the target pane"
                                        },
                                        "command": {
                                            "type": "string",
                                            "description": "The command string to execute (e.g. 'git status\\n')"
                                        }
                                    },
                                    "required": ["paneId", "command"]
                                }
                            },
                            {
                                "name": "read_pane_transcript",
                                "description": "Reads the transcript (last N characters of buffer) of an active terminal pane",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "paneId": {
                                            "type": "number",
                                            "description": "The ID of the target pane"
                                        },
                                        "limit": {
                                            "type": "number",
                                            "description": "Optional maximum characters to read (defaults to 10000)"
                                        }
                                    },
                                    "required": ["paneId"]
                                }
                            },
                            {
                                "name": "get_agenda",
                                "description": "Reads the ideas and next steps active in the Adeorq Agenda",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {}
                                }
                            },
                            {
                                "name": "get_usage",
                                "description": "How much of each AI subscription is left, which CLIs are installed but signed out (paid quota going to waste), and how to spread the work between them. Read this BEFORE deciding which model or account a job should run on: the units are not comparable across vendors, so the reading also explains what each number means. Costs nothing: it reads what Adeorq already knows.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {}
                                }
                            },
                            {
                                "name": "open_pane",
                                "description": "Opens a NEW terminal in Adeorq running the CLI you choose, and returns its pane ID so you can drive it with send_command and read_pane_transcript. This is how a supervising session builds a team: one pane per job. Every pane costs real quota, so open the fewest you need. Hard limits apply (6 alive, 12 per hour) and you are told when you hit them.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "cli": {
                                            "type": "string",
                                            "description": "Which agent to run: claude, codex, gemini, qwen, copilot, crush, opencode, amp, cursor, pi, kiro, kimi, codewhale, goose, droid, jules, auggie, codebuff, cody, aider, agy — or 'shell' for a plain terminal. Defaults to claude."
                                        },
                                        "project": {
                                            "type": "string",
                                            "description": "Project name as listed by get_projects. Either this or cwd."
                                        },
                                        "cwd": {
                                            "type": "string",
                                            "description": "Absolute folder to open it in. Wins over project."
                                        },
                                        "brief": {
                                            "type": "string",
                                            "description": "The job for this agent, typed into it as its first message. Say what to do and what NOT to touch: panes opened this way share the machine with the others."
                                        },
                                        "name": {
                                            "type": "string",
                                            "description": "Short label for the pane header, so a human can tell your team apart at a glance."
                                        },
                                        "from": {
                                            "type": "number",
                                            "description": "Draw an arrow from this pane ID to the new one (canvas only). Use your own ID, in ADEORQ_PANE_ID, to hang it off you."
                                        }
                                    },
                                    "required": []
                                }
                            },
                            {
                                "name": "link_panes",
                                "description": "Draws an arrow between two panes on the canvas. When the source agent finishes a turn, its reply is handed to the target as its next prompt. This is how work flows down a tree without you relaying it by hand. Canvas only.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "from": {
                                            "type": "number",
                                            "description": "Source pane ID. Yours is in the ADEORQ_PANE_ID environment variable."
                                        },
                                        "to": {
                                            "type": "number",
                                            "description": "Target pane ID."
                                        },
                                        "auto": {
                                            "type": "boolean",
                                            "description": "Hand over on its own instead of waiting for a human click. Defaults to false: automatic arrows spend quota with nobody watching, and Adeorq switches one back to manual if it fires 3 times in 10 minutes."
                                        }
                                    },
                                    "required": ["from", "to"]
                                }
                            },
                            {
                                "name": "close_pane",
                                "description": "Closes a terminal you opened and KILLS the agent inside it. Use it to tidy up after yourself: a pane you opened by mistake, or one whose job is done. It frees a slot against the 6-alive limit. It does not undo the quota that pane already spent, and there is no undo: read its transcript first if anything in there matters.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "paneId": {
                                            "type": "number",
                                            "description": "The ID of the pane to close, as listed by get_active_panes."
                                        }
                                    },
                                    "required": ["paneId"]
                                }
                            }
                        ]
                    }
                })
            }
            "tools/call" => {
                let name = req["params"]["name"].as_str().unwrap_or_default();
                let args = req["params"]["arguments"].clone();
                let result = handle_tool_call(name, args, &app);
                match result {
                    Ok(val) => {
                        json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "result": val
                        })
                    }
                    Err(e) => {
                        json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "error": {
                                "code": -32603,
                                "message": e
                            }
                        })
                    }
                }
            }
            _ => {
                if is_notification {
                    continue;
                }
                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": {
                        "code": -32601,
                        "message": format!("Method not found: {}", method)
                    }
                })
            }
        };

        if !is_notification {
            writer.write_all(format!("{}\n", res).as_bytes())?;
            writer.flush()?;
        }
    }

    Ok(())
}

fn handle_tool_call(name: &str, args: Value, app: &tauri::AppHandle) -> Result<Value, String> {
    match name {
        "get_projects" => {
            // La ventana es la dueña del ajuste; aquí se lee su copia en disco
            // para que el panel y el MCP no enseñen dos listas distintas.
            let aparte = crate::workspace::proyectos_aparte();
            let projects =
                crate::pty::list_projects(None, Some(aparte.sin_raiz), Some(aparte.extras))?;
            let mut text = String::new();
            for p in projects {
                text.push_str(&format!("Name: {}, Path: {}, Git: {}\n", p.name, p.path, p.has_git));
            }
            Ok(json!({
                "content": [
                    {
                        "type": "text",
                        "text": text
                    }
                ]
            }))
        }
        "get_active_panes" => {
            let pty_state = app.state::<crate::pty::PtyState>();
            let map = pty_state.0.lock().unwrap();
            let mut text = String::new();
            for (id, session) in map.iter() {
                let cmd_str = session.command.as_ref()
                    .map(|v| v.join(" "))
                    .unwrap_or_else(|| "default shell".to_string());
                text.push_str(&format!("ID: {}, CWD: {}, Command: {}\n", id, session.cwd, cmd_str));
            }
            if text.is_empty() {
                text = "No active panes.".to_string();
            }
            Ok(json!({
                "content": [
                    {
                        "type": "text",
                        "text": text
                    }
                ]
            }))
        }
        "send_command" => {
            let pane_id = args["paneId"].as_u64().ok_or("Missing paneId parameter")? as u32;
            let mut cmd = args["command"].as_str().ok_or("Missing command parameter")?.to_string();

            // `\r`, no `\n`: el Enter de una consola es el retorno de carro.
            // Con `\n` PowerShell dejaba la orden ESCRITA en el panel sin
            // ejecutarla jamás — todo lo que el Capataz «mandaba» por aquí se
            // quedaba esperando un Enter que nadie pulsaba (2026-07-30). Y si
            // ya venía con `\n` de quien llama, se cambia por `\r`.
            if cmd.ends_with('\n') {
                cmd.pop();
            }
            if !cmd.ends_with('\r') {
                cmd.push('\r');
            }

            let pty_state = app.state::<crate::pty::PtyState>();
            let map = pty_state.0.lock().unwrap();
            let session = map.get(&pane_id).ok_or(format!("Pane {} not found", pane_id))?;
            // Por el canal del panel, como toda la entrada: escribir directo
            // aquí podía dejar este hilo (y el candado) clavados en un panel
            // colgado. Ver `tx_entrada` en pty.rs.
            session
                .tx_entrada
                .send(cmd.into_bytes())
                .map_err(|_| "pty cerrado".to_string())?;

            Ok(json!({
                "content": [
                    {
                        "type": "text",
                        "text": format!("Command successfully sent to pane {}.", pane_id)
                    }
                ]
            }))
        }
        "read_pane_transcript" => {
            let pane_id = args["paneId"].as_u64().ok_or("Missing paneId parameter")? as u32;
            let limit = args["limit"].as_u64().unwrap_or(10000) as usize;

            let pty_state = app.state::<crate::pty::PtyState>();
            let map = pty_state.0.lock().unwrap();
            let session = map.get(&pane_id).ok_or(format!("Pane {} not found", pane_id))?;
            // Tolerante al veneno, como TODO lo que toca este candado (la ley
            // vive en `pty::tomar`): un pánico previo en cualquier lector no
            // puede dejar al cliente MCP sin transcripts para siempre.
            let history = session.history.lock().unwrap_or_else(|e| e.into_inner());

            // El corte va por BYTES sobre un String UTF-8, así que hay que
            // caminar hasta la frontera de un caracter. La primera versión
            // hacía `history[len - limit..]` a pelo: con el volcado del ConPTY
            // lleno de `│ ─ ●` y acentos, ese indice cae dentro de un caracter
            // multi-byte con frecuencia, y el pánico además se llevaba el
            // candado del mapa entero puesto: TODAS las terminales muertas por
            // leer un transcript. Es el mismo cálculo de `pty_historial`
            // (pty.rs), que ya lo hacia bien.
            let len = history.len();
            let text = if len > limit {
                let mut corte = len - limit;
                while corte < len && !history.is_char_boundary(corte) {
                    corte += 1;
                }
                history[corte..].to_string()
            } else {
                history.clone()
            };

            Ok(json!({
                "content": [
                    {
                        "type": "text",
                        "text": text
                    }
                ]
            }))
        }
        // Se la pide a la VENTANA y no se lee aquí, aunque el dato salga de un
        // comando de Rust. Motivo: preguntarle la cuota a un CLI cuesta unos
        // cinco segundos y medio de arrancar un proceso, POR CUENTA, y el front
        // ya tiene la respuesta guardada de hace un rato (`lib/cuota.ts`, nueve
        // minutos de vida). Leerlo desde aquí sería pagar otra vez, más lento,
        // por un número que ya está en la casa.
        "get_usage" => {
            let r = pedir_a_la_ventana(app, "uso", json!({}))?;
            let texto = r
                .parte
                .unwrap_or_else(|| "La ventana no supo decir cómo va el uso.".to_string());
            Ok(json!({ "content": [ { "type": "text", "text": texto } ] }))
        }
        "get_agenda" => {
            let project_name = args["project"].as_str().unwrap_or("Adeorq");
            let project_path = format!("C:\\proyectos\\{}", project_name);
            let metas = crate::metas::read_metas(project_path);
            
            let mut metas_text = format!("Path: {}\nExists: {}\n", metas.path, metas.exists);
            if metas.exists {
                metas_text.push_str("\nActive Metas:\n");
                for m in metas.metas {
                    let status = if m.done { "✅" } else { "🎯" };
                    metas_text.push_str(&format!("- {} {} (Hecho cuando: {})\n", status, m.title, m.when));
                }
                metas_text.push_str("\nParked / Aparcadero:\n");
                for p in metas.parked {
                    metas_text.push_str(&format!("- {}\n", p));
                }
            }

            let inbox_notes = crate::inbox::read_inbox();
            let mut inbox_text = String::new();
            for note in inbox_notes {
                inbox_text.push_str(&format!("- [{} | {}] {}\n", note.kind, note.project, note.text));
            }
            if inbox_text.is_empty() {
                inbox_text = "No inbox suggestions.".to_string();
            }

            let combined = format!(
                "=== METAS FOR PROJECT: {} ===\n{}\n\n=== INBOX SUGGESTIONS ===\n{}",
                project_name, metas_text, inbox_text
            );

            Ok(json!({
                "content": [
                    {
                        "type": "text",
                        "text": combined
                    }
                ]
            }))
        }
        // Las dos que necesitan a la ventana: un panel del lienzo lo monta React,
        // no Rust. Ver el bloque «EL PUENTE HACIA LA VENTANA», arriba.
        "open_pane" => {
            hay_sitio(app)?;

            let cli = args["cli"].as_str().unwrap_or("claude").trim().to_lowercase();
            let brief = args["brief"].as_str().unwrap_or_default().trim().to_string();
            let cwd = args["cwd"].as_str().unwrap_or_default().trim().to_string();
            let project = args["project"].as_str().unwrap_or_default().trim().to_string();
            if cwd.is_empty() && project.is_empty() {
                return Err(
                    "Falta dónde abrirla: pasa `project` (uno de los de get_projects) o `cwd`."
                        .into(),
                );
            }

            let r = pedir_a_la_ventana(
                app,
                "open_pane",
                json!({
                    "cli": cli,
                    "cwd": cwd,
                    "project": project,
                    "brief": brief,
                    "name": args["name"].as_str().unwrap_or_default(),
                    "from": args["from"],
                }),
            )?;

            let pane_id = r.pane_id.ok_or("la ventana no devolvió el número del panel")?;
            // Se apunta DESPUÉS de que naciera de verdad: un intento fallido no
            // debe gastar presupuesto.
            app.state::<Puente>()
                .aperturas
                .lock()
                .unwrap()
                .push((Instant::now(), pane_id));

            // El parte entero lo redacta la ventana, que es la única que sabe con
            // qué CLI acabó, si ese acepta encargo al arrancar y dónde cayó. Aquí
            // ya no se le añade nada: hasta el 2026-08-27 esto pegaba un «lee lo
            // que va haciendo…» fijo, y cuando la ventana empezó a decir eso
            // mismo mejor, el agente recibía la instrucción dos veces.
            let parte = r.parte.unwrap_or_else(|| {
                format!(
                    "Terminal {} abierta con «{}». Míralo con read_pane_transcript({}) antes de darla por trabajando, y háblale con send_command({}, \"...\").",
                    pane_id, cli, pane_id, pane_id
                )
            });
            Ok(json!({
                "content": [{
                    "type": "text",
                    "text": parte
                }]
            }))
        }
        "link_panes" => {
            let from = args["from"].as_u64().ok_or("Falta `from` (el panel de origen)")?;
            let to = args["to"].as_u64().ok_or("Falta `to` (el panel de destino)")?;
            if from == to {
                return Err("Una flecha de un panel a sí mismo se relevaría en bucle.".into());
            }
            let auto = args["auto"].as_bool().unwrap_or(false);
            pedir_a_la_ventana(
                app,
                "link_panes",
                json!({ "from": from, "to": to, "auto": auto }),
            )?;
            Ok(json!({
                "content": [{
                    "type": "text",
                    "text": format!(
                        "Flecha dibujada de {} a {}{}. Cuando {} termine un turno, su respuesta pasa a {}.",
                        from,
                        to,
                        if auto { " (automática)" } else { " (a la espera de un clic)" },
                        from,
                        to
                    )
                }]
            }))
        }
        // Quien abre, recoge. Hasta el 2026-08-27 un agente podía abrir seis
        // terminales y no cerrar ninguna: el tope le decía «cierra alguna» y no
        // tenía con qué, así que la única salida era que un humano las cerrara a
        // mano. Un presupuesto que solo se puede gastar y nunca devolver no es un
        // presupuesto, es una cuenta atrás.
        "close_pane" => {
            let pane_id = args["paneId"].as_u64().ok_or("Falta `paneId`: el número de la terminal que quieres cerrar.")? as u32;

            // Que exista se comprueba AQUÍ y no en la ventana, porque el mapa del
            // PTY es la verdad sobre qué corre de verdad. Un id inventado tiene
            // que sonar a error, no a «hecho».
            {
                let pty = app.state::<crate::pty::PtyState>();
                let map = pty.0.lock().unwrap();
                if !map.contains_key(&pane_id) {
                    return Err(format!(
                        "No hay ninguna terminal {}. Mira get_active_panes: puede que ya esté cerrada.",
                        pane_id
                    ));
                }
            }

            // La ventana es la dueña del panel (cabina, lienzo, layout), así que
            // el cierre se le pide a ella por el mismo puente que la apertura.
            // Ella llama a `closePane`, que mata el proceso y retira el panel.
            pedir_a_la_ventana(app, "close_pane", json!({ "paneId": pane_id }))?;

            // Cuántas quedan de las tuyas. El tope de vivas se calcula mirando el
            // mapa del PTY, así que cerrar una libera su sitio sola; lo que NO se
            // devuelve es el tope por hora, que existe justo para que abrir y
            // cerrar en bucle no salga gratis.
            let vivas = {
                let puente = app.state::<Puente>();
                let aperturas = puente.aperturas.lock().unwrap();
                let pty = app.state::<crate::pty::PtyState>();
                let map = pty.0.lock().unwrap();
                aperturas.iter().filter(|(_, id)| map.contains_key(id)).count()
            };

            Ok(json!({
                "content": [{
                    "type": "text",
                    "text": format!(
                        "Terminal {} cerrada y su agente parado. Te quedan {} de las {} vivas que puedes tener abiertas por MCP.",
                        pane_id, vivas, MAX_VIVOS
                    )
                }]
            }))
        }
        _ => Err(format!("Unknown tool: {}", name))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    /// Un `.claude.json` de mentira en su propia carpeta, que es justo lo que
    /// `config_dir` permite. Así esto se prueba de verdad sin acercarse al
    /// fichero real, que es la configuración entera de Munir.
    fn banco(nombre: &str, contenido: &str) -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!("adeorq-confiar-{}", nombre));
        let _ = fs::remove_dir_all(&base);
        let cuenta = base.join("cuenta");
        let proyecto = base.join("proyecto");
        fs::create_dir_all(&cuenta).unwrap();
        fs::create_dir_all(&proyecto).unwrap();
        fs::write(cuenta.join(".claude.json"), contenido).unwrap();
        (cuenta, proyecto)
    }

    fn leer(cuenta: &PathBuf) -> Value {
        serde_json::from_str(&fs::read_to_string(cuenta.join(".claude.json")).unwrap()).unwrap()
    }

    #[test]
    fn marca_una_carpeta_nueva_y_no_toca_nada_mas() {
        let (cuenta, proyecto) = banco(
            "nueva",
            r#"{"numStartups":9,"projects":{"C:\\otro":{"allowedTools":["Read"]}}}"#,
        );
        let hizo_falta = confiar_carpeta(
            proyecto.to_string_lossy().into(),
            Some(cuenta.to_string_lossy().into()),
        )
        .unwrap();
        assert!(hizo_falta, "una carpeta nunca vista necesita que se marque");

        let j = leer(&cuenta);
        // Lo de al lado sigue entero: esto escribe el fichero completo, así que
        // perder una clave ajena sería perder configuración de verdad.
        assert_eq!(j["numStartups"], 9);
        assert_eq!(j["projects"]["C:\\otro"]["allowedTools"][0], "Read");
        let clave = proyecto.to_string_lossy().replace('\\', "/");
        assert_eq!(j["projects"][&clave]["hasTrustDialogAccepted"], true);
    }

    /// El que de verdad decide si esto sirve para algo, y el que se falló
    /// primero. Claude Code normaliza la ruta a barras normales aunque se la
    /// pasen con barras invertidas (medido el 2026-08-27 con la 2.1.247), así
    /// que escribir la forma con barra invertida crea una entrada que el CLI no
    /// mira nunca: el diálogo saldría igual, sin un solo error por ningún lado.
    ///
    /// Solo en Windows, y no por comodidad: le pasa a propósito una ruta con
    /// barras invertidas, y en Linux eso no es una carpeta, es un nombre de
    /// fichero con barras dentro. La que reventó el trabajo de Linux la primera
    /// vez que se lanzó, que es justo para lo que sirve lanzarlo antes.
    #[test]
    #[cfg(windows)]
    fn escribe_la_ruta_con_barras_normales_que_es_la_que_el_cli_lee() {
        let (cuenta, proyecto) = banco("formato", r#"{"projects":{}}"#);
        confiar_carpeta(
            // Se la pasamos con barras invertidas a propósito: así es como
            // Adeorq se la da al PTY.
            proyecto.to_string_lossy().replace('/', "\\"),
            Some(cuenta.to_string_lossy().into()),
        )
        .unwrap();

        let j = leer(&cuenta);
        let claves: Vec<String> = j["projects"].as_object().unwrap().keys().cloned().collect();
        assert_eq!(claves.len(), 1, "una sola entrada, no una por cada forma de escribirla");
        assert!(
            claves[0].contains('/') && !claves[0].contains('\\'),
            "escrita como «{}», y el CLI busca la de barras normales",
            claves[0]
        );
    }

    #[test]
    fn una_carpeta_aceptada_en_el_formato_antiguo_sigue_valiendo() {
        // Diecisiete de las cincuenta entradas de Munir están con barra
        // invertida, de versiones viejas. Volver a escribirlas sería duplicar.
        let (cuenta, proyecto) = banco("antiguo", r#"{"projects":{}}"#);
        let antigua = proyecto.to_string_lossy().replace('/', "\\");
        fs::write(
            cuenta.join(".claude.json"),
            json!({ "projects": { antigua: { "hasTrustDialogAccepted": true } } }).to_string(),
        )
        .unwrap();

        let hizo_falta = confiar_carpeta(
            proyecto.to_string_lossy().into(),
            Some(cuenta.to_string_lossy().into()),
        )
        .unwrap();
        assert!(!hizo_falta, "ya estaba aceptada, aunque sea con la otra barra");
    }

    #[test]
    fn no_toca_lo_que_ya_estaba_aceptado() {
        let (cuenta, proyecto) = banco("ya", r#"{"projects":{}}"#);
        let clave = proyecto.to_string_lossy().replace('\\', "/");
        fs::write(
            cuenta.join(".claude.json"),
            json!({ "projects": { clave.clone(): { "hasTrustDialogAccepted": true } } }).to_string(),
        )
        .unwrap();

        let hizo_falta = confiar_carpeta(
            proyecto.to_string_lossy().into(),
            Some(cuenta.to_string_lossy().into()),
        )
        .unwrap();
        assert!(!hizo_falta, "si ya estaba, no hay nada que escribir");
    }

    #[test]
    #[cfg(windows)] // Le pasa una ruta con barras invertidas: en Linux eso no existe.
    fn la_misma_ruta_con_barras_al_reves_cuenta_igual() {
        // En el fichero real de Munir conviven «C:\x» y «C:/x» para la misma
        // carpeta. Si solo se mirara una forma, se escribiría una entrada
        // duplicada y el diálogo saldría igual.
        let (cuenta, proyecto) = banco("barras", r#"{"projects":{}}"#);
        let con_slash = proyecto.to_string_lossy().replace('\\', "/");
        fs::write(
            cuenta.join(".claude.json"),
            json!({ "projects": { con_slash: { "hasTrustDialogAccepted": true } } }).to_string(),
        )
        .unwrap();

        let hizo_falta = confiar_carpeta(
            proyecto.to_string_lossy().replace('/', "\\"),
            Some(cuenta.to_string_lossy().into()),
        )
        .unwrap();
        assert!(!hizo_falta, "es la misma carpeta escrita de la otra forma");
    }

    #[test]
    fn conserva_lo_que_ya_hubiera_de_esa_misma_carpeta() {
        let (cuenta, proyecto) = banco("conserva", r#"{"projects":{}}"#);
        let clave = proyecto.to_string_lossy().replace('\\', "/");
        fs::write(
            cuenta.join(".claude.json"),
            json!({ "projects": { clave.clone(): { "lastCost": 1.5, "hasTrustDialogAccepted": false } } })
                .to_string(),
        )
        .unwrap();

        confiar_carpeta(
            proyecto.to_string_lossy().into(),
            Some(cuenta.to_string_lossy().into()),
        )
        .unwrap();

        let j = leer(&cuenta);
        assert_eq!(j["projects"][&clave]["hasTrustDialogAccepted"], true);
        assert_eq!(j["projects"][&clave]["lastCost"], 1.5, "lo demás de esa carpeta se queda");
    }

    #[test]
    fn un_json_roto_se_deja_en_paz() {
        let (cuenta, proyecto) = banco("roto", "{esto no es json");
        let r = confiar_carpeta(
            proyecto.to_string_lossy().into(),
            Some(cuenta.to_string_lossy().into()),
        );
        assert!(r.is_err(), "no se puede reescribir lo que no se sabe leer");
        // Y sobre todo: sigue siendo el mismo fichero, no uno vacío.
        assert_eq!(
            fs::read_to_string(cuenta.join(".claude.json")).unwrap(),
            "{esto no es json"
        );
    }

    #[test]
    fn una_carpeta_que_no_existe_no_se_marca() {
        let (cuenta, proyecto) = banco("fantasma", r#"{"projects":{}}"#);
        let inventada = proyecto.join("no-existe");
        let r = confiar_carpeta(
            inventada.to_string_lossy().into(),
            Some(cuenta.to_string_lossy().into()),
        );
        assert!(r.is_err(), "marcar como de confianza un sitio que no está es firmar en blanco");
    }

    #[test]
    fn sin_fichero_de_configuracion_falla_sin_crear_uno() {
        let (cuenta, proyecto) = banco("sinfichero", r#"{}"#);
        fs::remove_file(cuenta.join(".claude.json")).unwrap();
        let r = confiar_carpeta(
            proyecto.to_string_lossy().into(),
            Some(cuenta.to_string_lossy().into()),
        );
        assert!(r.is_err());
        assert!(
            !cuenta.join(".claude.json").exists(),
            "inventarle un .claude.json a una cuenta que no lo tiene es peor que no hacer nada"
        );
    }
}
