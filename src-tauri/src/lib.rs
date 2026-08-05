mod accounts;
mod autostart;
mod crew;
mod discord;
mod encargos;
mod foreman;
mod goals;
mod icons;
mod pulso;
mod inbox;
mod manage;
mod media;
mod memoria;
mod metas;
mod notes;
mod ollama;
mod apikeys;
mod chat;
mod openrouter;
mod voz;
mod pty;
mod secrets;
mod sessions;
mod skills;
mod usage;
mod workspace;
mod mcp;
mod git_shadow;

pub use mcp::run_mcp_bridge;

use pty::PtyState;
use sessions::SessionCache;

/// La hora local, sin dependencias ni conversiones a mano. Un rastro fechado
/// con «1785000000» no le sirve a nadie a las tres de la mañana.
fn ahora() -> String {
    use windows_sys::Win32::System::SystemInformation::GetLocalTime;
    let mut t = unsafe { std::mem::zeroed() };
    unsafe { GetLocalTime(&mut t) };
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond
    )
}

/// Dónde queda escrito lo que va mal: `%LOCALAPPDATA%\Adeorq\rastro.log`.
fn ruta_rastro() -> Option<std::path::PathBuf> {
    let local = std::env::var("LOCALAPPDATA").ok()?;
    let dir = std::path::Path::new(&local).join("Adeorq");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("rastro.log"))
}

/// Deja constancia de algo que ha ido mal, con su hora.
///
/// Adeorq es una ventana SIN CONSOLA, así que todo lo que Rust imprimiría en la
/// salida de errores se lo traga el sistema y no queda en ningún sitio. Eso es
/// lo que convirtió un fallo de una línea en una noche entera de caza: el hilo
/// lector de un panel moría de un pánico, la terminal se quedaba muda para
/// siempre, y no había ni un indicio en ninguna parte (2026-07-31). Con esto,
/// la próxima vez el fallo está escrito con su hora y su sitio exacto.
///
/// Nunca falla hacia fuera: si no se puede escribir, no pasa nada. Un rastro
/// que tumbe a la app por no poder escribirse sería peor que no tenerlo.
pub fn anotar(mensaje: &str) {
    use std::io::Write;
    let Some(ruta) = ruta_rastro() else { return };
    // Sin dejarlo crecer sin fin: lo de hace meses no ayuda a nadie.
    if std::fs::metadata(&ruta)
        .map(|m| m.len() > 256 * 1024)
        .unwrap_or(false)
    {
        let _ = std::fs::remove_file(&ruta);
    }
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&ruta)
    {
        let _ = writeln!(f, "[{}] {mensaje}", ahora());
    }
}

/// Hace que TODO pánico quede escrito, venga del hilo que venga.
///
/// Se instala lo primero de todo, antes incluso de construir la ventana: un
/// pánico durante el arranque es justo el que menos rastro deja hoy.
fn registrar_panicos() {
    let anterior = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let hilo = std::thread::current();
        let nombre = hilo.name().unwrap_or("sin nombre").to_owned();
        let sitio = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "sitio desconocido".to_owned());
        anotar(&format!("PÁNICO en el hilo «{nombre}» ({sitio}): {info}"));
        anterior(info);
    }));
}
// Only the release build raises the existing window (single-instance).
#[cfg(not(debug_assertions))]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    registrar_panicos();
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());

    // One Adeorq, always: opening it again raises the window you already have.
    // Release only, so `pnpm tauri dev` can run alongside the installed app.
    #[cfg(not(debug_assertions))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            mcp::start_mcp_server(app.handle().clone());
            Ok(())
        })
        .manage(PtyState::default())
        .manage(SessionCache::default())
        .manage(discord::DiscordState::default())
        .manage(memoria::MemoriaCache::default())
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::list_projects,
            sessions::scan_sessions,
            sessions::open_in_antigravity,
            sessions::find_agy,
            sessions::session_context,
            sessions::last_reply,
            sessions::transcript_exists,
            skills::list_skills,
            icons::project_icons,
            icons::forget_project_icons,
            usage::usage_report,
            usage::plan_info,
            usage::usage_limits,
            accounts::account_dir,
            accounts::account_ready,
            accounts::detect_clis,
            accounts::cli_effort,
            accounts::list_account_dirs,
            accounts::forget_account,
            workspace::create_project,
            workspace::read_guide,
            workspace::default_projects_root,
            workspace::set_projects_root,
            workspace::set_extra_projects,
            workspace::escribir_buzon,
            manage::rename_session,
            manage::delete_session,
            manage::save_pasted_image,
            manage::list_pastes,
            manage::read_paste,
            manage::delete_paste,
            manage::save_canvas_file,
            manage::read_canvas_file,
            manage::delete_project,
            manage::set_fondo,
            manage::get_fondo,
            manage::clear_fondo,
            manage::save_board,
            manage::read_board,
            apikeys::api_key_put,
            apikeys::api_key_forget,
            apikeys::api_keys_estado,
            chat::chat_modelos,
            chat::chat_enviar,
            chat::gasto_leer,
            chat::chat_leer,
            chat::chat_guardar,
            chat::chat_olvidar,
            openrouter::openrouter_connect,
            openrouter::openrouter_info,
            openrouter::openrouter_forget,
            ollama::ollama_models,
            ollama::puede_empotrarse,
            ollama::ollama_line,
            encargos::save_encargo,
            encargos::read_encargos,
            crew::read_crew_inbox,
            manage::project_dirty,
            manage::load_ui_state,
            manage::save_ui_state,
            media::media_now,
            media::media_next,
            media::media_prev,
            media::media_playpause,
            media::media_set_volume,
            foreman::foreman_plan,
            foreman::foreman_prompt,
            foreman::foreman_lote,
            voz::voz_lista,
            voz::transcribir,
            foreman::write_mission,
            discord::discord_set,
            discord::discord_clear,
            notes::note_write,
            notes::note_read,
            notes::note_list,
            notes::note_delete,
            pulso::pulso,
            pulso::pulso_panes,
            memoria::memoria_scan,
            memoria::memoria_vaults,
            memoria::memoria_read,
            memoria::memoria_write,
            memoria::memoria_search,
            goals::goals_read,
            goals::goals_add,
            goals::goals_toggle,
            goals::goals_remove,
            inbox::read_inbox,
            inbox::drop_inbox,
            inbox::inbox_where,
            inbox::write_inbox,
            metas::read_metas,
            metas::add_parked,
            secrets::secret_put,
            secrets::secret_get,
            secrets::secret_forget,
            autostart::autostart_get,
            autostart::autostart_set,
            git_shadow::shadow_init,
            git_shadow::shadow_diff,
            git_shadow::shadow_status,
            git_shadow::shadow_accept,
            git_shadow::shadow_discard
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            // Cerrar Adeorq cierra sus terminales. Antes solo se iba la
            // ventana: los agentes seguían vivos por detrás, y al volver a
            // abrir aparecían «todavía activos» sin panel al que pertenecer.
            if matches!(event, tauri::RunEvent::Exit) {
                pty::kill_all(app);
            }
        });
}
