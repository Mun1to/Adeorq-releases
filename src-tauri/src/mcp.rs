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
                                            "description": "Which agent to run: claude, codex, gemini, qwen, copilot, crush, opencode, amp, cursor, pi, kiro, agy — or 'shell' for a plain terminal. Defaults to claude."
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
            let history = session.history.lock().unwrap();
            
            let len = history.len();
            let text = if len > limit {
                history[len - limit..].to_string()
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

            // El parte lo redacta la ventana, que es la que sabe con qué CLI
            // acabó y si ese acepta encargo al arrancar. Aquí solo se le añade
            // el recordatorio de cómo hablarle, que es igual para todos.
            let parte = r
                .parte
                .unwrap_or_else(|| format!("Terminal {} abierta con «{}».", pane_id, cli));
            Ok(json!({
                "content": [{
                    "type": "text",
                    "text": format!(
                        "{}\nLee lo que va haciendo con read_pane_transcript({}), y háblale con send_command({}, \"...\").",
                        parte, pane_id, pane_id
                    )
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
        _ => Err(format!("Unknown tool: {}", name))
    }
}
