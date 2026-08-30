// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 && args[1] == "--mcp" {
        if let Err(e) = adeorq_lib::run_mcp_bridge() {
            eprintln!("Error in MCP bridge: {}", e);
            std::process::exit(1);
        }
        std::process::exit(0);
    }
    // `adeorq secreto <nombre> [para qué]`: trae un token sin que pase por la
    // pantalla del agente. Ver `pedir_secreto.rs`.
    if args.len() > 2 && args[1] == "secreto" {
        let motivo = args.get(3..).map(|r| r.join(" ")).unwrap_or_default();
        if let Err(e) = adeorq_lib::pedir_secreto::puente(&args[2], &motivo) {
            eprintln!("{e}");
            std::process::exit(1);
        }
        std::process::exit(0);
    }
    adeorq_lib::run()
}
