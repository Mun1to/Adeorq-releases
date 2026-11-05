//! Whether this copy runs from an installed MSIX package (the Microsoft Store).
//!
//! The Store build is the same executable as the one in the plain installer, but
//! it lives under other rules (`docs/contexto/tiendas.md`): its folder in
//! `C:\Program Files\WindowsApps` is read-only, whatever it creates in
//! `%LOCALAPPDATA%` or `HKCU` is kept in a private copy that nobody outside can
//! see, and the Store forbids an app that downloads and runs an executable. Every
//! place that assumes otherwise asks `is_packaged()` first, and the answer for the
//! installer that has always existed is `false`, so those places keep doing
//! exactly what they did.
//!
//! `GetCurrentPackageFullName` is the supported way to ask: it answers
//! `APPMODEL_ERROR_NO_PACKAGE` for a process with no package identity, which is
//! every install that does not come from a package. Looking for `WindowsApps` in
//! the executable's path would be a guess; this is the question itself. It is the
//! same call VoCript makes (`packaged.rs` there).

use std::path::{Path, PathBuf};

/// True when the process runs with package identity. Computed once: it cannot
/// change while the process lives.
///
/// In a debug build, `ADEORQ_FINGIR_EMPAQUETADA` makes it true, so the packaged
/// paths can be exercised from the isolated binary without installing anything.
/// A release build never reads that variable, so nobody can flip it on a copy
/// somebody installed.
pub fn is_packaged() -> bool {
    #[cfg(all(windows, debug_assertions))]
    if std::env::var_os("ADEORQ_FINGIR_EMPAQUETADA").is_some() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::sync::OnceLock;
        static PACKAGED: OnceLock<bool> = OnceLock::new();
        *PACKAGED.get_or_init(detect)
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[cfg(windows)]
fn detect() -> bool {
    use windows_sys::Win32::Foundation::{APPMODEL_ERROR_NO_PACKAGE, ERROR_INSUFFICIENT_BUFFER, ERROR_SUCCESS};
    use windows_sys::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;

    // PACKAGE_FULL_NAME_MAX_LENGTH is 127 wide chars plus the terminator, so a
    // real name always fits and the only expected answers are "no package" or
    // success. A buffer complaint is treated as packaged: it can only happen
    // when there is a name to report.
    let mut length: u32 = 128;
    let mut buffer = [0u16; 128];
    // SAFETY: `length` and `buffer` are alive for the whole call, and `length`
    // is the size of `buffer` in wide characters.
    let result = unsafe { GetCurrentPackageFullName(&mut length, buffer.as_mut_ptr()) };
    if result == APPMODEL_ERROR_NO_PACKAGE {
        return false;
    }
    if result == ERROR_SUCCESS || result == ERROR_INSUFFICIENT_BUFFER {
        return true;
    }
    // Anything else is a surprise. The safe answer is "not packaged", which keeps
    // the plain installer behaving as it always has.
    crate::anotar(&format!("GetCurrentPackageFullName answered {result}; assuming not packaged"));
    false
}

/// Where the data of the packaged app lives: `%USERPROFILE%\.adeorq`.
///
/// Not `%LOCALAPPDATA%\Adeorq`: inside a package, what the app creates there is
/// private to it. Claude Code runs OUTSIDE the package with `CLAUDE_CONFIG_DIR`
/// pointing into `accounts\claude-*`, and the screenshots pasted into a pane are
/// read by the agent by their path, so both would look for files that, for them,
/// do not exist. Under `%USERPROFILE%` nothing is redirected. It also survives
/// uninstalling the package, which deletes whatever was redirected.
pub fn datos_de_la_tienda(casa: &Path) -> PathBuf {
    casa.join(".adeorq")
}

/// The command-line alias the package declares (`adeorq.exe`), as a stable path
/// the Store keeps between versions: `%LOCALAPPDATA%\Microsoft\WindowsApps`.
pub fn ruta_del_alias(local: &Path) -> PathBuf {
    local.join("Microsoft").join("WindowsApps").join("adeorq.exe")
}

/// The alias, only when this copy is packaged. It is not checked for existence:
/// Rust's `metadata` fails on an app execution alias (os error 1920) even when it
/// works, and the manifest is what puts it there.
pub fn alias() -> Option<PathBuf> {
    if !is_packaged() {
        return None;
    }
    std::env::var_os("LOCALAPPDATA").map(|l| ruta_del_alias(Path::new(&l)))
}

/// The path through which OTHER programs can start this executable.
///
/// Installed the usual way that is `current_exe()`, exactly as before. Inside a
/// package, `current_exe()` is in `C:\Program Files\WindowsApps\…`, a folder
/// nobody else can read or run from, and only the alias starts the executable
/// WITH its package identity (without it, a second copy would look for its data
/// in another folder). Whoever hands the executable to a program that is not
/// Adeorq (an agent's MCP config, a `PATH` entry) asks here.
pub fn exe_visible() -> std::io::Result<PathBuf> {
    match alias() {
        Some(a) => Ok(a),
        None => std::env::current_exe(),
    }
}

/// The Store policy (10.2.2) forbids downloading code to run it, and the Store
/// updates the app by itself. The question the update paths ask.
#[tauri::command(async)]
pub fn esta_empaquetada() -> bool {
    is_packaged()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_instalacion_de_siempre_no_es_empaquetada() {
        // Un proceso de pruebas no tiene identidad de paquete, y eso es lo que
        // deja intacto todo lo demás. (Sin la variable de desarrollo.)
        if std::env::var_os("ADEORQ_FINGIR_EMPAQUETADA").is_none() {
            assert!(!is_packaged());
            assert_eq!(alias(), None);
            assert_eq!(exe_visible().unwrap(), std::env::current_exe().unwrap());
        }
    }

    #[test]
    fn la_carpeta_de_la_tienda_y_el_alias() {
        assert_eq!(datos_de_la_tienda(Path::new(r"C:\Users\x")), Path::new(r"C:\Users\x").join(".adeorq"));
        assert_eq!(
            ruta_del_alias(Path::new(r"C:\Users\x\AppData\Local")),
            Path::new(r"C:\Users\x\AppData\Local").join("Microsoft").join("WindowsApps").join("adeorq.exe")
        );
    }

    /// `GetCurrentPackageFullName` contesta lo que debe en un proceso sin paquete:
    /// el 15700 que `detect` toma por «no empaquetada».
    #[cfg(windows)]
    #[test]
    fn sin_paquete_windows_contesta_que_no_hay_paquete() {
        use windows_sys::Win32::Foundation::APPMODEL_ERROR_NO_PACKAGE;
        use windows_sys::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;
        let mut n: u32 = 128;
        let mut b = [0u16; 128];
        let r = unsafe { GetCurrentPackageFullName(&mut n, b.as_mut_ptr()) };
        assert_eq!(r, APPMODEL_ERROR_NO_PACKAGE);
        assert!(!detect());
    }
}
