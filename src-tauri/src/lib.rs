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
#[cfg(windows)]
fn ahora() -> String {
    use windows_sys::Win32::System::SystemInformation::GetLocalTime;
    let mut t = unsafe { std::mem::zeroed() };
    unsafe { GetLocalTime(&mut t) };
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond
    )
}

/// Lo mismo donde no hay `GetLocalTime`. Los segundos desde 1970, convertidos a
/// mano: son cuatro divisiones y evitan arrastrar una librería de fechas entera
/// para escribir seis números, que es exactamente lo que se decidió en Windows.
#[cfg(not(windows))]
fn ahora() -> String {
    let s = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (dias, hora, min, seg) = (s / 86_400, (s / 3600) % 24, (s / 60) % 60, s % 60);
    // De días desde 1970 a fecha civil, con el algoritmo de Howard Hinnant:
    // cabe en diez líneas y acierta con los bisiestos, incluido el año 2100.
    let z = dias as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02} {hora:02}:{min:02}:{seg:02}")
}

/// La carpeta de datos de Adeorq: la ÚNICA fuente de esa ruta.
///
/// Era `std::env::var("LOCALAPPDATA")` repetido en veinte sitios de doce
/// archivos, así que la carpeta de la app estaba escrita veinte veces y nadie
/// podía cambiarla sin cazarlas todas. Y sobre todo: en Linux esa variable no
/// existe, así que cada uno de esos veinte sitios era un fallo distinto con el
/// mismo mensaje.
///
/// En Windows es `%LOCALAPPDATA%\Adeorq`, que es donde está lo de siempre. En
/// Linux, `$XDG_DATA_HOME/adeorq` o `~/.local/share/adeorq`, que es donde una
/// aplicación guarda SUS datos según la convención del escritorio.
pub fn dir_datos() -> Result<std::path::PathBuf, String> {
    #[cfg(windows)]
    {
        let local = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
        Ok(std::path::Path::new(&local).join("Adeorq"))
    }
    #[cfg(not(windows))]
    {
        if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
            if !xdg.is_empty() {
                return Ok(std::path::Path::new(&xdg).join("adeorq"));
            }
        }
        let casa = std::env::var("HOME").map_err(|e| e.to_string())?;
        Ok(std::path::Path::new(&casa)
            .join(".local")
            .join("share")
            .join("adeorq"))
    }
}

/// La misma carpeta, ya creada. La mayoría de los sitios que la piden es para
/// escribir dentro, y ese `create_dir_all` estaba también repetido.
pub fn dir_datos_creado() -> Result<std::path::PathBuf, String> {
    let d = dir_datos()?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// La carpeta del usuario, donde vive `~/.claude`.
///
/// Windows la llama `USERPROFILE` y el resto del mundo `HOME`. Estaba escrito
/// `USERPROFILE` en doce sitios, así que en Linux Adeorq no habría encontrado
/// NI UNA sesión: el lector de `~/.claude` es media aplicación.
pub fn dir_casa() -> Option<std::path::PathBuf> {
    let v = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    std::env::var(v).ok().map(std::path::PathBuf::from)
}

/// Lanzar un programa SIN que parpadee una consola negra.
///
/// Adeorq llama a `git`, a `where`, a los CLI y al propio Windows unas cuantas
/// veces por minuto, y cada uno de esos lanzamientos abría una ventana de
/// consola durante una fracción de segundo si no se le decía que no. La bandera
/// estaba escrita en SEIS archivos, con su constante propia en cada uno y el
/// mismo `use std::os::windows::process::CommandExt` al lado; seis copias de un
/// número mágico que además no existe fuera de Windows.
///
/// Fuera de Windows no hay ventana que evitar, así que no hace nada y la cadena
/// de llamadas se queda igual de legible en los dos sitios.
pub trait SinVentana {
    fn sin_ventana(&mut self) -> &mut Self;
}

impl SinVentana for std::process::Command {
    #[cfg(windows)]
    fn sin_ventana(&mut self) -> &mut Self {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW, tal cual lo llama Windows.
        self.creation_flags(0x0800_0000)
    }

    #[cfg(not(windows))]
    fn sin_ventana(&mut self) -> &mut Self {
        self
    }
}

/// Dónde queda escrito lo que va mal: `rastro.log` en la carpeta de datos.
fn ruta_rastro() -> Option<std::path::PathBuf> {
    Some(dir_datos_creado().ok()?.join("rastro.log"))
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
// La release lo usa para levantar la ventana que ya existe (instancia única) y
// el desarrollo para ponerle a la suya el nombre que la distingue.
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
            // La ventana de desarrollo dice que lo es.
            //
            // `pnpm tauri dev` abre una Adeorq al lado de la instalada, y las
            // dos se llaman igual, tienen el mismo icono y enseñan lo mismo:
            // no hay forma de saber cuál estás mirando. Munir cerró una de las
            // dos creyendo que era un duplicado y se quedó probando la de
            // siempre, sin ver ni uno de los cambios (2026-08-05). Con esto,
            // la barra de tareas y el propio marco lo dicen.
            #[cfg(debug_assertions)]
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_title("Adeorq · DESARROLLO");
            }
            Ok(())
        })
        .manage(PtyState::default())
        .manage(SessionCache::default())
        .manage(discord::DiscordState::default())
        .manage(memoria::MemoriaCache::default())
        // El puente del MCP con la ventana: lo que un agente pide (abrir un
        // panel, unir dos) lo hace React, no Rust. Ver `docs/SUPREMA.md`.
        .manage(mcp::Puente::default())
        .invoke_handler(tauri::generate_handler![
            mcp::mcp_reply,
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
            sessions::session_messages,
            skills::list_skills,
            icons::project_icons,
            icons::forget_project_icons,
            usage::usage_report,
            usage::plan_info,
            usage::usage_limits,
            usage::stats_historia,
            accounts::account_dir,
            accounts::account_ready,
            accounts::detect_clis,
            accounts::cli_effort,
            accounts::list_account_dirs,
            accounts::forget_account,
            accounts::logout_account,
            accounts::skills_estado,
            accounts::compartir_skills,
            accounts::dejar_de_compartir_skills,
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
            manage::save_drawing,
            manage::read_canvas_file,
            manage::delete_project,
            manage::set_fondo,
            manage::get_fondo,
            manage::clear_fondo,
            manage::save_board,
            manage::read_board,
            manage::anotar_rastro,
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
            goals::goals_pending_before,
            goals::goals_carry,
            inbox::read_inbox,
            inbox::drop_inbox,
            inbox::inbox_where,
            inbox::write_inbox,
            metas::read_metas,
            metas::add_parked,
            secrets::secret_put,
            secrets::secret_get,
            secrets::secret_forget,
            secrets::secretos_donde,
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
