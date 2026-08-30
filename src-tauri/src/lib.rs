mod accounts;
mod archivos;
mod autostart;
mod crew;
mod discord;
mod editor;
mod encargos;
mod esquema;
mod foreman;
mod goals;
mod icons;
mod pulso;
mod inbox;
mod manage;
mod media;
mod navegador;
pub mod pedir_secreto;
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
mod suelta;
mod skills;
mod usage;
mod uso_clientes;
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
    // Los tests NO escriben en el rastro de verdad. El simulacro del lector
    // («un descuido cualquiera dentro del lector», id 7) llevaba DÍAS
    // apareciendo en el rastro de Munir cada vez que una sesión pasaba la
    // suite, y se persiguió como si fuera una terminal suya rota (cazado el
    // 2026-08-15 por la hora exacta: las líneas salían clavadas al minuto de
    // cada `cargo test`). Un rastro con fallos de mentira es peor que ninguno.
    if cfg!(test) {
        return;
    }
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
        // La línea ENTERA en una sola escritura. `writeln!` escribe por trozos,
        // y aquí escriben a la vez varios hilos Y varios procesos (la app y la
        // ventana de desarrollo comparten este archivo): el rastro de agosto
        // tenía líneas partidas por la mitad y pegadas unas dentro de otras,
        // que es justo lo que hace ilegible un rastro el día que hace falta.
        // En modo añadir, una escritura única no se mezcla.
        let _ = f.write_all(format!("[{}] {mensaje}\n", ahora()).as_bytes());
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

/// El AppImage de Linux trae su propio WebKitGTK dentro, y en Fedora eso se
/// cae.
///
/// Reportado por Izan (`Mun1to/Adeorq-releases`, issue 2, 2026-08-23) sobre
/// Fedora 44: la ventana sale TRANSPARENTE y sin nada, y al rato
/// `WebKitWebProcess` aborta. El rastro lo explica entero: el proceso que muere
/// vive en `/tmp/.mount_Adeorq.../usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/`,
/// que es la ruta multiarch de DEBIAN (Fedora usa `/usr/lib64`), mientras que
/// TODOS los modulos que carga a su lado son de Fedora: mesa 26.1.6, libglvnd,
/// libX11, harfbuzz 14. Un WebKit compilado contra Ubuntu 22.04 hablando con
/// los drivers graficos de Fedora 44.
///
/// Donde se rompe esa mezcla es en el renderizador DMA-BUF de WebKitGTK, que
/// es el que negocia buffers con el driver: si el ABI no coincide, el proceso
/// del render aborta y la ventana se queda transparente, que es literalmente
/// el sintoma descrito. Apagarlo hace que WebKit pinte por el camino de
/// siempre.
///
/// Tres decisiones, y las tres importan:
///
///  1. SOLO dentro del AppImage (`APPIMAGE` la pone su propio arrancador). Un
///     `.deb` o un `.rpm` usan el WebKit del sistema, que si coincide consigo
///     mismo, y ahi apagar la aceleracion seria pagar un precio por un
///     problema que no tienen.
///  2. SOLO si el usuario no ha dicho nada. Quien pone la variable a mano
///     manda, en el sentido que sea.
///  3. El arreglo de verdad es no empaquetar WebKit: por eso desde esta misma
///     version el CI publica tambien un `.rpm` (`.github/workflows/linux.yml`),
///     que instala Adeorq contra el WebKit de Fedora. Esto es la red para quien
///     use el AppImage.
///
/// ⚠ NO PROBADO en Fedora: aqui no hay ninguna. Lo que se sabe es el rastro y
/// que la mezcla de ABI es real; lo que falta es que alguien con Fedora abra el
/// AppImage y diga si la ventana pinta.
#[cfg(target_os = "linux")]
fn apanar_webkit_del_appimage() {
    if std::env::var_os("APPIMAGE").is_none() {
        return;
    }
    // UNA variable, no dos. La pareja de siempre en los foros es esta y
    // `WEBKIT_DISABLE_COMPOSITING_MODE`, y la segunda NO entra: apaga el
    // compositor acelerado, y con el se lleva por delante el WebGL. Adeorq
    // dibuja SUS TERMINALES con WebGL (xterm.js, `TerminalPane.tsx`), asi que
    // eso seria arreglarle la ventana a alguien dejandole la aplicacion lenta
    // en lo unico que hace todo el rato. La de DMA-BUF solo cambia como se
    // transportan los buffers hasta el compositor; la aceleracion sigue ahi.
    for var in ["WEBKIT_DISABLE_DMABUF_RENDERER"] {
        if std::env::var_os(var).is_none() {
            // Sin `unsafe`: este crate es edicion 2021, donde `set_var` todavia
            // es una funcion segura (en la 2024 pasa a ser insegura y habra que
            // envolverla). Lo que la 2024 exige de verdad se cumple igual: se
            // llama ANTES de que Tauri levante nada, asi que aqui no hay mas
            // hilos que este.
            std::env::set_var(var, "1");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    registrar_panicos();
    #[cfg(target_os = "linux")]
    apanar_webkit_del_appimage();
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
            // ── AUTOPRUEBA de la ventana suelta (solo builds de desarrollo) ──
            //
            // La ventana suelta se rompió TRES veces sin que ningún test la
            // cubriera, porque nace de un clic y los agentes no pueden dar
            // clics en este escritorio. Con la variable ADEORQ_PRUEBA_SUELTA
            // puesta, la app abre una sola al arrancar y el agente comprueba
            // desde fuera (enumerando ventanas y leyendo el rastro) que sigue
            // viva. En release este bloque no existe.
            #[cfg(debug_assertions)]
            if std::env::var("ADEORQ_PRUEBA_SUELTA").is_ok() {
                let app_h = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(3));
                    let r = crate::suelta::abrir_ventana(
                        &app_h,
                        9999,
                        Some("AUTOPRUEBA".into()),
                        None,
                        None,
                        None,
                        None,
                    );
                    crate::anotar(&format!("autoprueba de la ventana suelta: {r:?}"));
                });
            }

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
            mcp::confiar_carpeta,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::pty_historial,
            suelta::sacar_panel,
            suelta::raton_en_pantalla,
            suelta::devolver_panel,
            suelta::datos_panel,
            navegador::empotrar_navegador,
            navegador::mover_navegador,
            navegador::ver_navegador,
            navegador::soltar_navegador,
            navegador::cerrar_navegador,
            navegador::puerto_escucha,
            editor::editor_escribir_estilo,
            editor::editor_escribir_texto,
            archivos::listar_carpeta,
            archivos::leer_archivo,
            archivos::guardar_archivo,
            esquema::escanear_arbol,
            esquema::resumen_taller,
            esquema::mapa_guardado,
            esquema::guardar_mapa,
            pty::list_projects,
            sessions::scan_sessions,
            sessions::open_in_antigravity,
            sessions::find_agy,
            sessions::session_context,
            sessions::last_reply,
            sessions::transcript_exists,
            sessions::session_messages,
            sessions::session_activity,
            skills::list_skills,
            skills::skill_text,
            icons::project_icons,
            icons::forget_project_icons,
            usage::usage_report,
            usage::plan_info,
            usage::usage_limits,
            usage::stats_historia,
            uso_clientes::usage_of,
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
            chat::chat_promos,
            chat::chat_enviar,
            chat::gasto_leer,
            chat::chat_leer,
            chat::chat_guardar,
            chat::chat_olvidar,
            openrouter::openrouter_connect,
            openrouter::openrouter_info,
            openrouter::openrouter_forget,
            openrouter::tts_hablar,
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
            foreman::foreman_agente,
            foreman::foreman_mapa,
            foreman::parar_mapa,
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
            goals::goals_month,
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
            pedir_secreto::secreto_responder,
            pedir_secreto::secretos_de_agente,
            pedir_secreto::secreto_de_agente_olvidar,
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
                // Y las ventanas de navegador que estuvieran metidas dentro se
                // devuelven al escritorio con su marco. Si no, se quedarían
                // colgando de una ventana que está a punto de no existir.
                navegador::soltar_todas();
            }
        });
}
