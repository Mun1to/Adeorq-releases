//! La sonda que reproduce un panel de Adeorq sin abrir Adeorq.
//!
//! Mismo ConPTY, mismo `powershell -NoLogo -NoExit -Command claude ...`, mismo
//! lector que vacía sin parar (el de pty.rs desde 0.9.26). Lanza el mismo
//! encargo que congelaba los paneles de Munir («haz un diagnóstico del
//! proyecto») y mide el caudal de bytes: si la salida calla más de 150 s con el
//! proceso vivo, eso ES el congelón, reproducido en frío y sin interfaz.
//!
//! Con `--strict` añade `--strict-mcp-config` al CLI: la variante sin
//! servidores MCP. Comparar las dos variantes es lo que separa el fallo
//! conocido del CLI de los tres servidores MCP frágiles de la máquina.
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
// (el Mutex del writer se nombra con ruta completa para no ensuciar imports)

fn main() {
    let strict = std::env::args().any(|a| a == "--strict");
    // La variante que imita lo que la app hace y la sonda no hacía: cambiar el
    // tamaño del terminal EN PLENA SALIDA. ConPTY tiene un vicio conocido de
    // atascarse si se le cambia el tamaño mientras escupe; los paneles de
    // Claude reciben retoques de tamaño a mitad de turno (chips que aparecen
    // en la cabecera, bordes de foco, clics) y los de Antigravity no — que es
    // exactamente el reparto de congelones que ve Munir.
    let con_resizes = std::env::args().any(|a| a == "--resize");
    let etiqueta = match (strict, con_resizes) {
        (true, _) => "SIN-MCP",
        (false, true) => "CON-RESIZES",
        (false, false) => "CON-MCP",
    };
    println!("[sonda:{etiqueta}] arrancando");

    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize {
            rows: 40,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("openpty");

    let mut cmd = CommandBuilder::new("powershell.exe");
    let claude = format!(
        "claude --permission-mode acceptEdits --effort xhigh{}",
        if strict { " --strict-mcp-config" } else { "" }
    );
    cmd.args(["-NoLogo", "-NoExit", "-Command", &claude]);
    cmd.cwd("C:\\proyectos\\Adeorq");
    // Lo mismo que pone pty.rs al abrir un panel.
    cmd.env_remove("CLAUDE_CODE_CHILD_SESSION");
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env_remove("NO_COLOR");
    cmd.env("FORCE_COLOR", "3");

    let mut child = pair.slave.spawn_command(cmd).expect("spawn");
    drop(pair.slave);
    let pid = child.process_id().unwrap_or(0);
    println!("[sonda:{etiqueta}] powershell pid={pid}");

    let mut reader = pair.master.try_clone_reader().expect("reader");
    // Compartido entre el hilo lector (que contesta a las preguntas de la
    // terminal) y el principal (que manda el encargo).
    let writer = Arc::new(std::sync::Mutex::new(pair.master.take_writer().expect("writer")));

    let total = Arc::new(AtomicU64::new(0));
    let ultimo_ms = Arc::new(AtomicU64::new(0)); // ms desde t0 del último byte
    let campanas = Arc::new(AtomicU32::new(0));
    let contando_campanas = Arc::new(AtomicBool::new(false));
    // Los últimos bytes recibidos, para poder ENSEÑARLOS si esto aborta: la
    // segunda ronda murió con 3.443 bytes y sin este volcado no hay forma de
    // saber qué pregunta del protocolo quedó sin contestar.
    let ring = Arc::new(std::sync::Mutex::new(Vec::<u8>::new()));
    let t0 = Instant::now();

    {
        let total = total.clone();
        let ultimo = ultimo_ms.clone();
        let campanas = campanas.clone();
        let contando = contando_campanas.clone();
        let writer = writer.clone();
        let ring = ring.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            // Cola de los últimos bytes, para preguntas partidas entre trozos.
            let mut cola: Vec<u8> = Vec::new();
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        total.fetch_add(n as u64, Ordering::Relaxed);
                        ultimo.store(t0.elapsed().as_millis() as u64, Ordering::Relaxed);
                        if let Ok(mut r) = ring.lock() {
                            r.extend_from_slice(&buf[..n]);
                            if r.len() > 900 {
                                let corte = r.len() - 900;
                                r.drain(..corte);
                            }
                        }
                        if contando.load(Ordering::Relaxed) {
                            let c = buf[..n].iter().filter(|&&b| b == 0x07).count();
                            if c > 0 {
                                campanas.fetch_add(c as u32, Ordering::Relaxed);
                            }
                        }
                        // LA SONDA TIENE QUE HACER DE TERMINAL, no solo de
                        // tubería. ConPTY pregunta «¿dónde está el cursor?»
                        // (ESC[6n) nada más nacer y NO SUELTA NI UN BYTE MÁS
                        // hasta que alguien conteste; en Adeorq contesta xterm
                        // y aquí no contestaba nadie: por eso las primeras
                        // sondas morían con 4 bytes, que eran exactamente esa
                        // pregunta. Se contesta también la identificación DA1
                        // y el color de fondo OSC 10/11, que el CLI pregunta.
                        cola.extend_from_slice(&buf[..n]);
                        if cola.len() > 64 {
                            let corte = cola.len() - 64;
                            cola.drain(..corte);
                        }
                        let s = String::from_utf8_lossy(&cola).into_owned();
                        let mut resp: Vec<u8> = Vec::new();
                        if s.contains("\x1b[6n") {
                            resp.extend_from_slice(b"\x1b[1;1R");
                        }
                        if s.contains("\x1b[c") || s.contains("\x1b[0c") {
                            resp.extend_from_slice(b"\x1b[?61c");
                        }
                        if s.contains("\x1b[>c") || s.contains("\x1b[>0c") {
                            resp.extend_from_slice(b"\x1b[>0;10;1c");
                        }
                        if s.contains("\x1b[?u") {
                            resp.extend_from_slice(b"\x1b[?0u");
                        }
                        if s.contains("\x1b]10;?") {
                            resp.extend_from_slice(b"\x1b]10;rgb:dcdc/e7e7/f8f8\x07");
                        }
                        if s.contains("\x1b]11;?") {
                            resp.extend_from_slice(b"\x1b]11;rgb:0d0d/1515/2424\x07");
                        }
                        if !resp.is_empty() {
                            cola.clear();
                            if let Ok(mut w) = writer.lock() {
                                let _ = w.write_all(&resp).and_then(|_| w.flush());
                            }
                        }
                    }
                }
            }
        });
    }

    // Fase 1: esperar a que el CLI pinte la bienvenida y se calle 6 segundos.
    let mut enviado = false;
    loop {
        std::thread::sleep(Duration::from_secs(1));
        let t = t0.elapsed().as_secs();
        let tot = total.load(Ordering::Relaxed);
        let silencio = t0.elapsed().as_millis() as u64 - ultimo_ms.load(Ordering::Relaxed);
        // 2.000 y no 4.096: la bienvenida real del CLI mide ~3.4 KB, y con el
        // umbral alto la sonda se quedaba esperando una bienvenida «más
        // grande» mientras el CLI esperaba, vivo y de brazos cruzados, un
        // encargo que nunca llegaba.
        if !enviado && tot > 2_000 && silencio > 6_000 {
            println!("[sonda:{etiqueta}] t={t}s bienvenida lista ({tot} bytes), mando el encargo");
            contando_campanas.store(true, Ordering::Relaxed);
            {
                let mut w = writer.lock().expect("writer");
                w.write_all(b"haz un diagnostico del proyecto\r")
                    .and_then(|_| w.flush())
                    .expect("escribir encargo");
            }
            enviado = true;
        }
        if enviado {
            break;
        }
        if t > 180 {
            println!("[sonda:{etiqueta}] t={t}s el CLI no llego a arrancar ({tot} bytes). ABORTO");
            if let Ok(r) = ring.lock() {
                println!(
                    "[sonda:{etiqueta}] ultimos bytes: {}",
                    String::from_utf8_lossy(&r).escape_debug()
                );
            }
            matar(pid);
            std::process::exit(4);
        }
    }

    // Fase 2: vigilar el turno. Tick cada 10 s; 150 s de silencio = congelado.
    // Con --resize, además, un vaivén de tamaño cada 3 s mientras el turno
    // corre: 120x40 ↔ 119x40, el mismo empujón de un píxel que da un borde de
    // foco o un chip nuevo en la cabecera de un panel real.
    let mut ancho: u16 = 120;
    let mut ticks: u64 = 0;
    loop {
        std::thread::sleep(Duration::from_secs(1));
        ticks += 1;
        if con_resizes && ticks % 3 == 0 {
            ancho = if ancho == 120 { 119 } else { 120 };
            let _ = pair.master.resize(PtySize {
                rows: 40,
                cols: ancho,
                pixel_width: 0,
                pixel_height: 0,
            });
        }
        if ticks % 10 != 0 {
            continue;
        }
        let t = t0.elapsed().as_secs();
        let tot = total.load(Ordering::Relaxed);
        let silencio =
            (t0.elapsed().as_millis() as u64 - ultimo_ms.load(Ordering::Relaxed)) / 1000;
        let bells = campanas.load(Ordering::Relaxed);
        println!("[sonda:{etiqueta}] t={t}s bytes={tot} silencio={silencio}s campanas={bells}");
        if silencio > 150 {
            println!("[sonda:{etiqueta}] === CONGELADO: {silencio}s sin un byte, proceso vivo ===");
            matar(pid);
            std::process::exit(2);
        }
        // Campana + medio minuto de calma = turno terminado de verdad (una
        // campana con la salida aún corriendo sería un aviso intermedio).
        if bells > 0 && silencio > 30 {
            println!("[sonda:{etiqueta}] === COMPLETADO: campana y salida en calma ===");
            matar(pid);
            std::process::exit(0);
        }
        if t > 780 {
            println!("[sonda:{etiqueta}] === TOPE DE TIEMPO: sigue emitiendo a los 13 min ===");
            matar(pid);
            std::process::exit(3);
        }
    }
}

fn matar(pid: u32) {
    if pid == 0 {
        return;
    }
    let _ = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .output();
}
