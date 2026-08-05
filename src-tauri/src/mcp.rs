use std::io::{self, BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;
use serde_json::{json, Value};
use tauri::Manager;

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
        _ => Err(format!("Unknown tool: {}", name))
    }
}
