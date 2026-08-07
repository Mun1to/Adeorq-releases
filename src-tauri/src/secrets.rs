// Secrets, in the place Windows keeps secrets.
//
// Adeorq now holds a token that lets it read his ideas, his diary and his
// calendar. That cannot live in a JSON next to the settings, and it cannot
// live in the browser's localStorage either: both are plain files that any
// program running as him can read, and one of them ends up in a screen share.
//
// The Credential Manager encrypts each entry with the user's own login and
// hands it back only to processes running as that user. It is the same vault
// Windows uses for network passwords, it needs no administrator, and he can
// see and delete every entry from Control Panel without asking us.
//
// Only three operations, because that is all a token needs: put, read, forget.
//
// En Linux no existe el Credential Manager, y lo honesto es decir qué se pierde
// en vez de fingir que es lo mismo: allí el secreto va a un archivo de la
// carpeta de datos con permisos `600`, que lo protege de OTROS usuarios de la
// máquina pero no de otro programa tuyo. La alternativa era el Secret Service
// del escritorio (el crate `keyring`), que arrastra D-Bus y falla en cuanto no
// hay un llavero corriendo, que es la mitad de las sesiones. Se dice en el
// README, en la sección de Linux, para que nadie se entere por sorpresa.

#[cfg(windows)]
use windows::core::{PCWSTR, PWSTR};
#[cfg(windows)]
use windows::Win32::Foundation::FILETIME;
#[cfg(windows)]
use windows::Win32::Security::Credentials::{
    CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
    CRED_TYPE_GENERIC,
};

/// Windows' own ceiling for one credential blob. En Linux no hay tope del
/// sistema, pero se respeta el mismo: un secreto más largo que esto no es un
/// token, es otra cosa, y el aviso vale igual en los dos sitios.
const MAX_BLOB: usize = 2560;

#[cfg(windows)]
fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Every entry of ours is prefixed, so they are recognisable in Control Panel
/// and impossible to confuse with someone else's.
fn target_of(key: &str) -> String {
    format!("Adeorq/{key}")
}

#[cfg(windows)]
pub fn put(key: &str, value: &str) -> Result<(), String> {
    let blob = value.as_bytes();
    if blob.len() > MAX_BLOB {
        return Err("ese secreto es demasiado largo para el almacén de Windows".into());
    }
    let mut target = wide(&target_of(key));
    let mut user = wide("Adeorq");
    let cred = CREDENTIALW {
        Flags: Default::default(),
        Type: CRED_TYPE_GENERIC,
        TargetName: PWSTR(target.as_mut_ptr()),
        Comment: PWSTR::null(),
        LastWritten: FILETIME::default(),
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_ptr() as *mut u8,
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        AttributeCount: 0,
        Attributes: std::ptr::null_mut(),
        TargetAlias: PWSTR::null(),
        UserName: PWSTR(user.as_mut_ptr()),
    };
    // SAFETY: every pointer above outlives the call, and the blob length is
    // the real length of the slice.
    unsafe { CredWriteW(&cred, 0) }.map_err(|e| format!("no he podido guardarlo: {e}"))
}

#[cfg(windows)]
pub fn get(key: &str) -> Option<String> {
    let target = wide(&target_of(key));
    let mut out = std::ptr::null_mut::<CREDENTIALW>();
    // SAFETY: Windows fills `out` on success and we free it before returning.
    unsafe {
        CredReadW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, None, &mut out).ok()?;
        if out.is_null() {
            return None;
        }
        let cred = &*out;
        let bytes =
            std::slice::from_raw_parts(cred.CredentialBlob, cred.CredentialBlobSize as usize);
        let value = String::from_utf8(bytes.to_vec()).ok();
        CredFree(out as *const _);
        value
    }
}

#[cfg(windows)]
pub fn forget(key: &str) -> Result<(), String> {
    let target = wide(&target_of(key));
    // SAFETY: a plain call with a null-terminated string we own.
    match unsafe { CredDeleteW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, None) } {
        Ok(()) => Ok(()),
        // Deleting what is not there is what the caller wanted anyway.
        Err(_) if get(key).is_none() => Ok(()),
        Err(e) => Err(format!("no he podido borrarlo: {e}")),
    }
}

/* ------------------------------------------------------- lo mismo, en Linux */

/// El archivo de un secreto. Un nombre de clave llega del front, así que se
/// codifica en vez de meterlo tal cual en una ruta: `api:claude` lleva dos
/// puntos, que en algún sistema de archivos no vale, y `../algo` sería salirse
/// de la carpeta.
#[cfg(not(windows))]
fn ruta_secreto(key: &str) -> Result<std::path::PathBuf, String> {
    let limpio: String = key
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if limpio.is_empty() {
        return Err("nombre de secreto vacío".into());
    }
    let dir = crate::dir_datos()?.join("secretos");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // La carpeta también a 700: si solo se protegiera el archivo, los NOMBRES
    // de los secretos seguirían siendo legibles, y eso ya dice de más.
    permisos(&dir, 0o700)?;
    Ok(dir.join(format!("{limpio}.txt")))
}

#[cfg(not(windows))]
fn permisos(p: &std::path::Path, modo: u32) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(p, std::fs::Permissions::from_mode(modo)).map_err(|e| e.to_string())
}

#[cfg(not(windows))]
pub fn put(key: &str, value: &str) -> Result<(), String> {
    if value.len() > MAX_BLOB {
        return Err("ese secreto es demasiado largo".into());
    }
    let p = ruta_secreto(key)?;
    std::fs::write(&p, value).map_err(|e| e.to_string())?;
    permisos(&p, 0o600)
}

#[cfg(not(windows))]
pub fn get(key: &str) -> Option<String> {
    std::fs::read_to_string(ruta_secreto(key).ok()?).ok()
}

#[cfg(not(windows))]
pub fn forget(key: &str) -> Result<(), String> {
    let p = ruta_secreto(key)?;
    match std::fs::remove_file(&p) {
        Ok(()) => Ok(()),
        // Borrar lo que no está es lo que quería quien lo pidió.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("no he podido borrarlo: {e}")),
    }
}

#[tauri::command]
pub fn secret_put(key: String, value: String) -> Result<(), String> {
    put(&key, &value)
}

/// Las que el front NO puede pedir, por mucho que sepa su nombre.
///
/// Son las claves de API de los modelos. Su sitio es este proceso: Rust las usa
/// para llamar a OpenRouter y para arrancar un CLI con la variable puesta, y
/// ninguna de las dos cosas necesita que la clave cruce al WebView. Si cruzara,
/// acabaría en el estado de React, en un log o en una captura de pantalla.
///
/// `secret_get` era genérico y devolvía cualquier cosa que le pidieran, así que
/// eso que dice openrouter.rs de que la clave no vuelve al front dependía de
/// que nadie escribiera la línea que la pedía. Ahora no depende de eso.
fn es_privada(key: &str) -> bool {
    key == "openrouter" || key.starts_with("api:")
}

#[tauri::command]
pub fn secret_get(key: String) -> Option<String> {
    if es_privada(&key) {
        return None;
    }
    get(&key)
}

#[tauri::command]
pub fn secret_forget(key: String) -> Result<(), String> {
    forget(&key)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Estos tests hablan con el almacén DE VERDAD del sistema, y `cargo` los
    /// corre a la vez. Cada uno usa su propia clave, así que no se pisan datos,
    /// pero escribir y leer credenciales desde varios hilos a la vez falla de
    /// tanto en tanto: el 2026-08-07 saltó uno en una suite entera y pasó solo
    /// en la siguiente vuelta, que es la firma de una carrera y no de un fallo.
    ///
    /// Un test que falla al azar es peor que no tenerlo: se aprende a ignorarlo
    /// y el día que avise de algo real nadie lo mirará. Así que los que tocan
    /// el almacén pasan de uno en uno.
    static EN_FILA: std::sync::Mutex<()> = std::sync::Mutex::new(());

    /// El candado, recuperándose de un pánico ajeno: aquí no hay ningún dato
    /// que pueda quedar a medias, solo el turno.
    fn turno() -> std::sync::MutexGuard<'static, ()> {
        EN_FILA.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// The whole round trip against the real vault, with a key of its own so a
    /// failure here can never touch a token he is using.
    #[test]
    fn a_secret_survives_a_round_trip_and_can_be_forgotten() {
        let _turno = turno();
        let key = "test/round-trip";
        put(key, "hola, socio").expect("guardar");
        assert_eq!(get(key).as_deref(), Some("hola, socio"));
        // Writing again replaces, it does not duplicate.
        put(key, "otra cosa").expect("regrabar");
        assert_eq!(get(key).as_deref(), Some("otra cosa"));
        forget(key).expect("olvidar");
        assert_eq!(get(key), None);
        // And forgetting twice is not an error.
        forget(key).expect("olvidar de nuevo");
    }

    #[test]
    fn an_unknown_key_is_simply_absent() {
        let _turno = turno();
        assert_eq!(get("test/nunca-escrita"), None);
    }

    #[test]
    fn an_oversized_secret_is_refused_rather_than_truncated() {
        let _turno = turno();
        let huge = "x".repeat(MAX_BLOB + 1);
        assert!(put("test/huge", &huge).is_err());
    }

    /// The promise that an API key never reaches the WebView rests entirely on
    /// `es_privada`, and until now nothing checked it. A new provider stored
    /// under a different prefix would hand its key to the front end, in
    /// silence, and the only way to notice would be reading this file again.
    #[test]
    fn the_front_end_cannot_ask_for_an_api_key() {
        let _turno = turno();
        assert!(es_privada("openrouter"));
        assert!(es_privada("api:claude"));
        assert!(es_privada("api:codex"));
        // What is not a key stays readable: the compass' refresh token is
        // asked for by name from the front end and has to keep arriving.
        assert!(!es_privada("brujula/refresh"));

        let key = "api:test-privada";
        put(key, "sk-no-debería-salir").expect("guardar");
        // The command the WebView can call refuses it...
        assert_eq!(secret_get(key.to_string()), None);
        // ...while Rust, who actually spawns the CLI with it, still gets it.
        assert_eq!(get(key).as_deref(), Some("sk-no-debería-salir"));
        forget(key).expect("olvidar");
    }
}
