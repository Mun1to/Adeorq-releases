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
    adeorq_lib::run()
}
