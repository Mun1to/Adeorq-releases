// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 && args[1] == "--mcp" {
        // `--de-casa`: lo lanza Adeorq mismo (Capataz, conserje), ver `mcp_clientes.rs`.
        let de_casa = args.iter().skip(2).any(|a| a == "--de-casa");
        if let Err(e) = adeorq_lib::run_mcp_bridge(de_casa) {
            eprintln!("Error in MCP bridge: {}", e);
            std::process::exit(1);
        }
        std::process::exit(0);
    }
    // El proceso de terminales: abre las terminales lejos de la ventana, para
    // que sobrevivan a una caída de la app. Ver `terminales.rs`.
    if args.len() > 1 && args[1] == "--terminales" {
        if let Err(e) = adeorq_lib::terminales::principal() {
            eprintln!("Error en el proceso de terminales: {e}");
            std::process::exit(1);
        }
        std::process::exit(0);
    }
    // `adeorq secreto <nombre> [para qué] [-- comando]`: pide y guarda un token,
    // o lanza un comando con él, sin escribirlo nunca. Ver `pedir_secreto.rs`.
    if args.len() > 1 && args[1] == "secreto" {
        std::process::exit(adeorq_lib::pedir_secreto::principal(&args[2..]));
    }
    // `adeorq escudo pedir '<json>'`: una petición al escudo, como la del gancho.
    if args.len() > 1 && args[1] == "escudo" {
        std::process::exit(adeorq_lib::escudo::principal(&args[2..]));
    }
    // `adeorq preguntar <herramienta> '<json>'`: una llamada al MCP de una sola vez, la
    // única vía de un bot que vive en la nube. Ver `mcp/preguntar.rs`.
    if args.len() > 1 && args[1] == "preguntar" {
        std::process::exit(adeorq_lib::preguntar_principal(&args[2..]));
    }
    adeorq_lib::run()
}
