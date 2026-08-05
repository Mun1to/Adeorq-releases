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
    } else {
        std::env::current_exe().map_err(|e| format!("no sé dónde estoy instalado: {e}"))?
    };
    Ok(exe.to_string_lossy().into_owned())
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

#[tauri::command]
pub fn autostart_get() -> Result<bool, String> {
    launcher()?
        .is_enabled()
        .map_err(|e| format!("no he podido leer el arranque automático: {e}"))
}

#[tauri::command]
pub fn autostart_set(on: bool) -> Result<(), String> {
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
