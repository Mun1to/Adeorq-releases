//! Disección del ConPTY: tres pruebas mínimas con volcado de bytes.
//!
//! La sonda grande murió con 4 bytes y sin decir qué eran. Esta separa las
//! causas posibles: si el `echo` de cmd no produce bytes, el ConPTY no
//! funciona en este contexto; si cmd sí y PowerShell no, es PowerShell; si
//! los dos sí y `claude --version` no, es Claude quien no arranca aquí.
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::Read;
use std::time::{Duration, Instant};

fn probar(nombre: &str, exe: &str, args: &[&str], secs: u64) {
    println!("--- {nombre} ---");
    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize {
            rows: 40,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("openpty");
    let mut cmd = CommandBuilder::new(exe);
    cmd.args(args);
    cmd.cwd("C:\\proyectos\\Adeorq");
    let child = match pair.slave.spawn_command(cmd) {
        Ok(c) => c,
        Err(e) => {
            println!("{nombre}: spawn ERROR: {e}");
            return;
        }
    };
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().expect("reader");
    let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let _ = tx.send(buf[..n].to_vec());
                }
            }
        }
    });
    let t0 = Instant::now();
    let mut total = 0usize;
    let mut primeros: Vec<u8> = Vec::new();
    while t0.elapsed() < Duration::from_secs(secs) {
        if let Ok(chunk) = rx.recv_timeout(Duration::from_millis(300)) {
            total += chunk.len();
            if primeros.len() < 200 {
                primeros.extend_from_slice(&chunk);
            }
        }
    }
    println!("{nombre}: {total} bytes en {secs}s");
    let hex: Vec<String> = primeros.iter().take(48).map(|b| format!("{b:02x}")).collect();
    println!("{nombre} hex: {}", hex.join(" "));
    println!("{nombre} txt: {}", String::from_utf8_lossy(&primeros).escape_debug());
    let mut killer = child.clone_killer();
    let _ = killer.kill();
}

fn main() {
    probar("cmd-echo", "cmd.exe", &["/c", "echo", "PRUEBA-CONPTY"], 8);
    probar("ps-echo", "powershell.exe", &["-NoLogo", "-Command", "echo hola-ps"], 25);
    probar(
        "claude-version",
        "powershell.exe",
        &["-NoLogo", "-Command", "claude --version"],
        45,
    );
}
