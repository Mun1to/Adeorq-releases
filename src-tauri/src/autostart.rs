// Adeorq starting with Windows.
//
// One value under HKCU\...\CurrentVersion\Run, which is what auto-launch
// writes for us: no scheduled task, no service, no administrator, and he can
// undo it from the same switch or from the Task Manager's Startup tab like any
// other program.
//
// The one wrinkle is which executable gets registered. `current_exe()` in a
// dev build points at C:\ct\debug\adeorq.exe, a file that exists because a
// compiler put it there this morning and may well be gone tomorrow: a machine
// that boots into a missing program is a machine with a broken startup entry.
// So the switch always governs the INSTALLED app, and in a dev build it says
// so rather than registering the throwaway binary.

use auto_launch::AutoLaunchBuilder;
#[cfg(windows)]
use auto_launch::WindowsEnableMode;

const APP_NAME: &str = "Adeorq";

/// Where the installer puts it: %LOCALAPPDATA%\Adeorq\adeorq.exe.
fn installed_exe() -> Option<std::path::PathBuf> {
    let path = crate::dir_datos().ok()?.join("adeorq.exe");
    path.exists().then_some(path)
}

/// The executable the startup entry should point at, whatever build asks.
fn target_exe() -> Result<String, String> {
    // Release: itself, wherever it was installed. Debug: the installed copy,
    // never C:\ct.
    let exe = if cfg!(debug_assertions) {
        installed_exe().ok_or(
            "Adeorq no está instalado en este equipo: este interruptor gobierna la app \
             instalada, no la de desarrollo",
        )?
    } else if let Some(a) = appimage() {
        a
    } else {
        std::env::current_exe().map_err(|e| format!("no sé dónde estoy instalado: {e}"))?
    };
    Ok(exe.to_string_lossy().into_owned())
}

/// El AppImage de verdad, si la app corre desde uno. Dentro, `current_exe` es
/// la copia montada en `/tmp/.mount_*`, que desaparece al cerrar: el arranque
/// automático apuntaba a la nada. Es lo que hace `tauri-plugin-autostart`.
#[cfg(target_os = "linux")]
fn appimage() -> Option<std::path::PathBuf> {
    std::env::var_os("APPIMAGE").filter(|a| !a.is_empty()).map(std::path::PathBuf::from)
}

#[cfg(not(target_os = "linux"))]
fn appimage() -> Option<std::path::PathBuf> {
    None
}

fn launcher() -> Result<auto_launch::AutoLaunch, String> {
    let mut b = AutoLaunchBuilder::new();
    b.set_app_name(APP_NAME).set_app_path(&target_exe()?);
    // His user, not the machine. The default tries the machine-wide key
    // first and only falls back when Windows refuses: run Adeorq once as
    // administrator and it would quietly become everyone's startup entry.
    //
    // En Linux no hay tal disyuntiva: `auto-launch` escribe un `.desktop` en
    // `~/.config/autostart`, que ya es del usuario y de nadie más.
    #[cfg(windows)]
    b.set_windows_enable_mode(WindowsEnableMode::CurrentUser);
    b.build()
        .map_err(|e| format!("no he podido preparar el arranque automático: {e}"))
}

/// El arranque con Windows de la app EMPAQUETADA (la Tienda). Escribir en
/// `HKCU\...\Run` desde el paquete va al registro privado de la app, que Windows
/// no mira al iniciar sesión: el interruptor no haría nada y no lo diría. El
/// manifiesto declara una tarea de arranque (`AdeorqStartup`, apagada) y aquí se
/// enciende y apaga con `StartupTask`. Windows puede negarse: si el usuario la
/// apagó en Configuración › Aplicaciones › Inicio, solo él puede volver a
/// encenderla, y se le dice (política 10.2.8, `docs/contexto/tiendas.md`).
#[cfg(windows)]
mod tarea {
    use windows::core::HSTRING;
    use windows::ApplicationModel::{StartupTask, StartupTaskState};
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    /// El `TaskId` del manifiesto (`scripts/tiendas/AppxManifest.plantilla.xml`).
    pub const ID: &str = "AdeorqStartup";

    fn la_tarea() -> Result<StartupTask, String> {
        // El hilo de un comando no trae COM puesto; si ya lo tenía de otra forma, da igual.
        // SAFETY: inicializar COM en el hilo actual no toca memoria de nadie.
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        StartupTask::GetAsync(&HSTRING::from(ID))
            .and_then(|a| a.join())
            .map_err(|e| format!("no he podido leer la tarea de arranque de Adeorq: {e}"))
    }

    pub fn encendida() -> Result<bool, String> {
        let estado = la_tarea()?.State().map_err(|e| e.to_string())?;
        Ok(estado == StartupTaskState::Enabled || estado == StartupTaskState::EnabledByPolicy)
    }

    pub fn poner(encender: bool) -> Result<(), String> {
        let tarea = la_tarea()?;
        if !encender {
            return tarea.Disable().map_err(|e| format!("no he podido desactivarlo: {e}"));
        }
        let estado = tarea
            .RequestEnableAsync()
            .and_then(|a| a.join())
            .map_err(|e| format!("no he podido activarlo: {e}"))?;
        match estado {
            StartupTaskState::Enabled | StartupTaskState::EnabledByPolicy => Ok(()),
            StartupTaskState::DisabledByUser => Err("Windows lo tiene apagado por ti: enciéndelo en Configuración › Aplicaciones › Inicio".into()),
            StartupTaskState::DisabledByPolicy => Err("Una directiva de tu equipo no deja que Adeorq arranque con Windows".into()),
            _ => Err("Windows no ha dejado activar el arranque automático".into()),
        }
    }
}

#[tauri::command(async)]
pub fn autostart_get() -> Result<bool, String> {
    #[cfg(windows)]
    if crate::packaged::is_packaged() {
        return tarea::encendida();
    }
    launcher()?
        .is_enabled()
        .map_err(|e| format!("no he podido leer el arranque automático: {e}"))
}

#[tauri::command(async)]
pub fn autostart_set(on: bool) -> Result<(), String> {
    #[cfg(windows)]
    if crate::packaged::is_packaged() {
        return tarea::poner(on);
    }
    let app = launcher()?;
    if on {
        app.enable()
            .map_err(|e| format!("no he podido activarlo: {e}"))
    } else {
        app.disable()
            .map_err(|e| format!("no he podido desactivarlo: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Desde un AppImage, el arranque automático apunta al AppImage y no a su
    /// copia montada en `/tmp`, que ya no está al volver a entrar.
    #[cfg(target_os = "linux")]
    #[test]
    fn desde_un_appimage_apunta_al_appimage() {
        std::env::set_var("APPIMAGE", "/home/x/Adeorq.AppImage");
        let a = appimage();
        std::env::remove_var("APPIMAGE");
        assert_eq!(a, Some(std::path::PathBuf::from("/home/x/Adeorq.AppImage")));
    }

    /// Not part of the suite: this one TOUCHES the machine. It exists so the
    /// switch can be turned on for real without shipping a release first, and
    /// it runs the very code the switch runs, which is the point:
    /// `cargo test switch_it_on -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn switch_it_on_for_real() {
        autostart_set(true).expect("no he podido activarlo");
        println!("apunta a: {}", target_exe().unwrap());
        println!("activado: {:?}", autostart_get());
    }

    /// The point of the whole module: never the build directory.
    #[test]
    fn the_registered_path_is_never_the_dev_binary() {
        match target_exe() {
            Ok(path) => {
                let lower = path.to_lowercase();
                assert!(lower.ends_with("adeorq.exe"), "apunta a {path}");
                if cfg!(debug_assertions) {
                    assert!(
                        !lower.contains("\\ct\\"),
                        "apunta al binario de dev: {path}"
                    );
                    assert!(!lower.contains("target"), "apunta a un build: {path}");
                }
            }
            // Fine on a machine without Adeorq installed: that is the message
            // the switch is supposed to show.
            Err(msg) => assert!(msg.contains("no está instalado"), "{msg}"),
        }
    }
}
