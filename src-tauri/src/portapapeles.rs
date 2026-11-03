//! A file on the system clipboard, the way a file manager leaves it: pasted into
//! a chat or a folder it is the file, and pasted where only text fits it is its
//! path. `navigator.clipboard` only writes text and images, which is why the
//! share card used to copy a still of its video (`PerfilTarjeta.tsx`).

use std::path::Path;

pub fn copiar_archivo(app: &tauri::AppHandle, ruta: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        let _ = app;
        windows::poner(ruta)
    }
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        mac(ruta)
    }
    #[cfg(target_os = "linux")]
    {
        linux(app, ruta)
    }
}

/// `set the clipboard to POSIX file` leaves a file reference. The path goes as
/// an argument, so nothing in it can be read as AppleScript.
#[cfg(target_os = "macos")]
fn mac(ruta: &Path) -> Result<(), String> {
    let salida = std::process::Command::new("/usr/bin/osascript")
        .args(["-e", "on run argv", "-e", "set the clipboard to (POSIX file (item 1 of argv))", "-e", "end run"])
        .arg(ruta)
        .output()
        .map_err(|e| format!("no he podido copiar el vídeo: {e}"))?;
    if salida.status.success() {
        Ok(())
    } else {
        Err(format!("no he podido copiar el vídeo: {}", String::from_utf8_lossy(&salida.stderr).trim()))
    }
}

/// Only the path: WebKitGTK cannot encode video today (`videoDisponible`), so no
/// Linux build reaches this until it can. GTK's clipboard lives on the UI thread.
#[cfg(target_os = "linux")]
fn linux(app: &tauri::AppHandle, ruta: &Path) -> Result<(), String> {
    let texto = ruta.to_string_lossy().into_owned();
    app.run_on_main_thread(move || {
        gtk::Clipboard::get(&gtk::gdk::SELECTION_CLIPBOARD).set_text(&texto);
    })
    .map_err(|e| format!("no he podido copiar el vídeo: {e}"))
}

#[cfg(windows)]
mod windows {
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use std::time::Duration;
    use windows_sys::Win32::Foundation::GlobalFree;
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
    };
    use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows_sys::Win32::System::Ole::{CF_HDROP, CF_UNICODETEXT, DROPEFFECT_COPY};

    fn utf16(s: &std::ffi::OsStr) -> Vec<u16> {
        s.encode_wide().collect()
    }

    fn en_bytes(unidades: impl Iterator<Item = u16>) -> Vec<u8> {
        unidades.flat_map(u16::to_le_bytes).collect()
    }

    /// A `DROPFILES` header, then the path and the double NUL that ends the list.
    pub(super) fn lista_de_archivos(ruta: &[u16]) -> Vec<u8> {
        const CABECERA: u32 = 20;
        let mut b = Vec::with_capacity(CABECERA as usize + (ruta.len() + 2) * 2);
        b.extend_from_slice(&CABECERA.to_le_bytes()); // pFiles: where the list starts
        b.extend_from_slice(&[0; 12]); // pt and fNC: not dropped on any window
        b.extend_from_slice(&1u32.to_le_bytes()); // fWide: UTF-16
        b.extend(en_bytes(ruta.iter().copied().chain([0, 0])));
        b
    }

    struct Abierto;

    impl Drop for Abierto {
        fn drop(&mut self) {
            unsafe { CloseClipboard() };
        }
    }

    /// Clipboard managers and remote desktops hold it for a moment at a time.
    fn abrir() -> Result<Abierto, String> {
        for _ in 0..20 {
            if unsafe { OpenClipboard(std::ptr::null_mut()) } != 0 {
                return Ok(Abierto);
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        Err("otro programa tiene el portapapeles ocupado: vuelve a intentarlo".into())
    }

    fn poner_formato(formato: u32, bytes: &[u8]) -> Result<(), String> {
        let fallo = || "no he podido dejar el vídeo en el portapapeles".to_owned();
        unsafe {
            let h = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
            if h.is_null() {
                return Err(fallo());
            }
            let p = GlobalLock(h);
            if p.is_null() {
                GlobalFree(h);
                return Err(fallo());
            }
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), p.cast::<u8>(), bytes.len());
            GlobalUnlock(h);
            // Once accepted the memory belongs to the system; only a refusal is ours to free.
            if SetClipboardData(formato, h).is_null() {
                GlobalFree(h);
                return Err(fallo());
            }
        }
        Ok(())
    }

    pub(super) fn poner(ruta: &Path) -> Result<(), String> {
        let ruta = utf16(ruta.as_os_str());
        let _abierto = abrir()?;
        if unsafe { EmptyClipboard() } == 0 {
            return Err("no he podido vaciar el portapapeles".into());
        }
        poner_formato(u32::from(CF_HDROP), &lista_de_archivos(&ruta))?;
        poner_formato(u32::from(CF_UNICODETEXT), &en_bytes(ruta.iter().copied().chain([0])))?;
        // Pasted in a folder it is a copy, never a move of Adeorq's file.
        let nombre = utf16(std::ffi::OsStr::new("Preferred DropEffect"));
        let nombre: Vec<u16> = nombre.into_iter().chain([0]).collect();
        let efecto = unsafe { RegisterClipboardFormatW(nombre.as_ptr()) };
        if efecto != 0 {
            poner_formato(efecto, &DROPEFFECT_COPY.to_le_bytes())?;
        }
        Ok(())
    }
}

#[cfg(all(test, windows))]
mod pruebas {
    use super::windows::{lista_de_archivos, poner};
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use std::path::Path;
    use windows_sys::Win32::System::DataExchange::{CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard};
    use windows_sys::Win32::System::Memory::{GlobalLock, GlobalUnlock};
    use windows_sys::Win32::System::Ole::{CF_HDROP, CF_UNICODETEXT};
    use windows_sys::Win32::System::StationsAndDesktops::{CreateWindowStationW, SetProcessWindowStation};
    use windows_sys::Win32::UI::Shell::DragQueryFileW;

    const RUTA: &str = "C:\\datos\\Adeorq\\tarjeta\\copias\\1\\adeorq-uso-ñ.mp4";
    /// `WINSTA_ALL_ACCESS` of winuser.h, which windows-sys does not declare.
    const TODO_EL_ACCESO: u32 = 0x37F;

    #[test]
    fn la_lista_de_archivos_es_un_dropfiles_valido() {
        let unidades: Vec<u16> = RUTA.encode_utf16().collect();
        let b = lista_de_archivos(&unidades);
        assert_eq!(&b[0..4], &20u32.to_le_bytes());
        assert_eq!(&b[16..20], &1u32.to_le_bytes());
        assert_eq!(b.len(), 20 + (unidades.len() + 2) * 2);
        assert_eq!(&b[b.len() - 4..], &[0, 0, 0, 0]);
    }

    /// The clipboard belongs to the window station, so the real round trip runs
    /// in a child process moved to a new one: it cannot touch the user's
    /// clipboard, nor move the other tests of this process out of theirs.
    #[test]
    fn deja_el_archivo_y_su_direccion() {
        let salida = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["portapapeles::pruebas::en_una_estacion_propia", "--exact", "--ignored", "--nocapture"])
            .output()
            .unwrap();
        let dijo = String::from_utf8_lossy(&salida.stdout);
        assert!(salida.status.success() && dijo.contains("1 passed"), "{dijo}\n{}", String::from_utf8_lossy(&salida.stderr));
    }

    #[test]
    #[ignore = "la lanza deja_el_archivo_y_su_direccion, en un proceso aparte"]
    fn en_una_estacion_propia() {
        unsafe {
            let estacion = CreateWindowStationW(std::ptr::null(), 0, TODO_EL_ACCESO, std::ptr::null());
            assert!(!estacion.is_null(), "sin estación propia esta prueba tocaría el portapapeles de verdad");
            assert_ne!(SetProcessWindowStation(estacion), 0, "sin estación propia esta prueba tocaría el portapapeles de verdad");
        }

        poner(Path::new(RUTA)).unwrap();

        unsafe {
            assert_ne!(OpenClipboard(std::ptr::null_mut()), 0);
            assert_ne!(IsClipboardFormatAvailable(u32::from(CF_HDROP)), 0, "no está el archivo");
            assert_ne!(IsClipboardFormatAvailable(u32::from(CF_UNICODETEXT)), 0, "no está el texto");

            let lista = GetClipboardData(u32::from(CF_HDROP));
            assert_eq!(DragQueryFileW(lista.cast(), u32::MAX, std::ptr::null_mut(), 0), 1, "tiene que ser un solo archivo");
            let mut nombre = [0u16; 260];
            let largo = DragQueryFileW(lista.cast(), 0, nombre.as_mut_ptr(), nombre.len() as u32) as usize;
            assert_eq!(std::ffi::OsString::from_wide(&nombre[..largo]), std::ffi::OsString::from(RUTA));

            let texto = GetClipboardData(u32::from(CF_UNICODETEXT));
            let p = GlobalLock(texto).cast::<u16>();
            let esperado: Vec<u16> = std::ffi::OsStr::new(RUTA).encode_wide().chain([0]).collect();
            assert_eq!(std::slice::from_raw_parts(p, esperado.len()), &esperado[..]);
            GlobalUnlock(texto);

            CloseClipboard();
        }
    }
}
