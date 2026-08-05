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

use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::FILETIME;
use windows::Win32::Security::Credentials::{
    CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
    CRED_TYPE_GENERIC,
};

/// Windows' own ceiling for one credential blob.
const MAX_BLOB: usize = 2560;

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Every entry of ours is prefixed, so they are recognisable in Control Panel
/// and impossible to confuse with someone else's.
fn target_of(key: &str) -> String {
    format!("Adeorq/{key}")
}

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

    /// The whole round trip against the real vault, with a key of its own so a
    /// failure here can never touch a token he is using.
    #[test]
    fn a_secret_survives_a_round_trip_and_can_be_forgotten() {
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
        assert_eq!(get("test/nunca-escrita"), None);
    }

    #[test]
    fn an_oversized_secret_is_refused_rather_than_truncated() {
        let huge = "x".repeat(MAX_BLOB + 1);
        assert!(put("test/huge", &huge).is_err());
    }

    /// The promise that an API key never reaches the WebView rests entirely on
    /// `es_privada`, and until now nothing checked it. A new provider stored
    /// under a different prefix would hand its key to the front end, in
    /// silence, and the only way to notice would be reading this file again.
    #[test]
    fn the_front_end_cannot_ask_for_an_api_key() {
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
