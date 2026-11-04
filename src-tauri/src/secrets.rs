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

/// DÓNDE acaban de verdad los secretos en ESTE sistema.
///
/// La pantalla de Cuentas prometía «se guarda cifrada en el Gestor de
/// Credenciales de Windows» en los dos sistemas, y en Linux eso no es verdad:
/// allí es un archivo con permisos `600`, que protege de otros usuarios de la
/// máquina pero no de otro programa tuyo. La diferencia está escrita arriba y en
/// el README desde el principio; lo que faltaba era decirla donde se lee, que es
/// justo antes de pegar una clave.
///
/// Devuelve una etiqueta y no una frase hecha: el texto se traduce en el front,
/// como todo lo demás.
#[tauri::command]
pub fn secretos_donde() -> &'static str {
    if cfg!(windows) {
        "credenciales"
    } else if cfg!(target_os = "macos") {
        "llavero"
    } else {
        "archivo"
    }
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

/* ------------------------------------------- el Llavero de macOS, sin perder nada */

/// Un sitio donde guardar secretos: el Llavero, el archivo, o un doble en las
/// pruebas. `leer` distingue «no está» (`Ok(None)`) de «no he podido mirar»
/// (`Err`): confundirlos es como se pierde una clave.
#[cfg(any(target_os = "macos", test))]
pub(crate) trait Almacen {
    fn poner(&self, key: &str, value: &str) -> Result<(), String>;
    fn leer(&self, key: &str) -> Result<Option<String>, String>;
    /// Borrar lo que no está no es un error.
    fn borrar(&self, key: &str) -> Result<(), String>;
}

/// Guardar con el Llavero delante y el archivo detrás.
///
/// El archivo viejo solo se borra cuando lo escrito se ha LEÍDO DE VUELTA del
/// Llavero y es lo mismo. Si el Llavero falla (bloqueado, sin sesión gráfica,
/// una máquina de pruebas) el secreto va al archivo como hasta ahora: sin
/// Llavero se sigue trabajando, lo que no se hace es quedarse sin la clave.
#[cfg(any(target_os = "macos", test))]
pub(crate) fn poner_en<L: Almacen, A: Almacen>(
    llavero: &L,
    archivo: &A,
    key: &str,
    value: &str,
) -> Result<(), String> {
    if llavero.poner(key, value).is_ok() && llavero.leer(key).ok().flatten().as_deref() == Some(value) {
        // `leer_en` hace caso al archivo: el que no se deje borrar tiene que
        // decir lo mismo, o la clave de antes volvería.
        if archivo.borrar(key).is_err() {
            archivo.poner(key, value)?;
        }
        return Ok(());
    }
    archivo.poner(key, value)
}

/// Si hay archivo, manda él: solo queda uno sin mudar o con lo último que el
/// Llavero no dejó guardar, y en el Llavero puede seguir la clave de antes. Se
/// muda en cuanto se deja (con la misma regla: el archivo se borra cuando ya se ha
/// leído de vuelta). Sin archivo, el Llavero.
#[cfg(any(target_os = "macos", test))]
pub(crate) fn leer_en<L: Almacen, A: Almacen>(llavero: &L, archivo: &A, key: &str) -> Option<String> {
    let Some(v) = archivo.leer(key).ok().flatten() else {
        return llavero.leer(key).ok().flatten();
    };
    if llavero.poner(key, &v).is_ok() && llavero.leer(key).ok().flatten().as_deref() == Some(v.as_str()) {
        let _ = archivo.borrar(key);
    }
    Some(v)
}

/// Olvidar de los dos sitios: un secreto «olvidado» que sigue en el archivo no
/// está olvidado. Si uno falla se intentan los dos igualmente y se dice el fallo.
#[cfg(any(target_os = "macos", test))]
pub(crate) fn olvidar_en<L: Almacen, A: Almacen>(llavero: &L, archivo: &A, key: &str) -> Result<(), String> {
    let a = llavero.borrar(key);
    let b = archivo.borrar(key);
    a.and(b)
}

/// El Llavero de verdad (el de inicio de sesión de quien usa el Mac): cada
/// entrada es una contraseña genérica con servicio «Adeorq» y de cuenta el
/// nombre del secreto, la misma etiqueta que en el Gestor de Windows.
#[cfg(target_os = "macos")]
struct LlaveroMac;

#[cfg(target_os = "macos")]
const SERVICIO: &str = "Adeorq";
/// `errSecItemNotFound`: lo que dice el Llavero cuando no hay tal entrada.
#[cfg(target_os = "macos")]
const NO_ESTA: i32 = -25300;

#[cfg(target_os = "macos")]
impl Almacen for LlaveroMac {
    fn poner(&self, key: &str, value: &str) -> Result<(), String> {
        security_framework::passwords::set_generic_password(SERVICIO, key, value.as_bytes())
            .map_err(|e| format!("el Llavero no lo guarda: {e}"))
    }
    fn leer(&self, key: &str) -> Result<Option<String>, String> {
        match security_framework::passwords::get_generic_password(SERVICIO, key) {
            Ok(bytes) => Ok(String::from_utf8(bytes).ok()),
            Err(e) if e.code() == NO_ESTA => Ok(None),
            Err(e) => Err(format!("el Llavero no contesta: {e}")),
        }
    }
    fn borrar(&self, key: &str) -> Result<(), String> {
        match security_framework::passwords::delete_generic_password(SERVICIO, key) {
            Ok(()) => Ok(()),
            Err(e) if e.code() == NO_ESTA => Ok(()),
            Err(e) => Err(format!("el Llavero no lo borra: {e}")),
        }
    }
}

/* ----------------------------------------------- el archivo, en Linux y detrás en Mac */

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
fn put_archivo(key: &str, value: &str) -> Result<(), String> {
    if value.len() > MAX_BLOB {
        return Err("ese secreto es demasiado largo".into());
    }
    let p = ruta_secreto(key)?;
    std::fs::write(&p, value).map_err(|e| e.to_string())?;
    permisos(&p, 0o600)
}

/// `Ok(None)` es «no hay archivo»; un archivo que existe y no se deja leer es un `Err`.
#[cfg(not(windows))]
fn leer_archivo(key: &str) -> Result<Option<String>, String> {
    match std::fs::read_to_string(ruta_secreto(key)?) {
        Ok(v) => Ok(Some(v)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(not(windows))]
fn forget_archivo(key: &str) -> Result<(), String> {
    let p = ruta_secreto(key)?;
    match std::fs::remove_file(&p) {
        Ok(()) => Ok(()),
        // Borrar lo que no está es lo que quería quien lo pidió.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("no he podido borrarlo: {e}")),
    }
}

/// El archivo como un sitio más, para la mudanza al Llavero.
#[cfg(target_os = "macos")]
struct ArchivoSecretos;

#[cfg(target_os = "macos")]
impl Almacen for ArchivoSecretos {
    fn poner(&self, key: &str, value: &str) -> Result<(), String> {
        put_archivo(key, value)
    }
    fn leer(&self, key: &str) -> Result<Option<String>, String> {
        leer_archivo(key)
    }
    fn borrar(&self, key: &str) -> Result<(), String> {
        forget_archivo(key)
    }
}

/// En un Mac: el Llavero, con el archivo de antes como respaldo y como origen
/// de la mudanza. Un secreto demasiado largo se rechaza igual que en los demás.
#[cfg(target_os = "macos")]
pub fn put(key: &str, value: &str) -> Result<(), String> {
    if value.len() > MAX_BLOB {
        return Err("ese secreto es demasiado largo".into());
    }
    poner_en(&LlaveroMac, &ArchivoSecretos, key, value)
}

#[cfg(target_os = "macos")]
pub fn get(key: &str) -> Option<String> {
    leer_en(&LlaveroMac, &ArchivoSecretos, key)
}

#[cfg(target_os = "macos")]
pub fn forget(key: &str) -> Result<(), String> {
    olvidar_en(&LlaveroMac, &ArchivoSecretos, key)
}

#[cfg(all(not(windows), not(target_os = "macos")))]
pub fn put(key: &str, value: &str) -> Result<(), String> {
    put_archivo(key, value)
}

#[cfg(all(not(windows), not(target_os = "macos")))]
pub fn get(key: &str) -> Option<String> {
    leer_archivo(key).ok().flatten()
}

#[cfg(all(not(windows), not(target_os = "macos")))]
pub fn forget(key: &str) -> Result<(), String> {
    forget_archivo(key)
}

#[tauri::command(async)]
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
///
/// Se mira el nombre en la forma en que lo guarda el almacén, no tal cual: el
/// Gestor de Credenciales no distingue mayúsculas (`API:openai` le da la de
/// `api:openai`) y en Linux el archivo cambia `:` por `_` (`api_openai`).
fn es_privada(key: &str) -> bool {
    let k: String = key
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c.to_ascii_lowercase() } else { '_' })
        .collect();
    // `bot:` es la clave del webhook de un bot (`bots.rs`): Rust la usa para
    // llamar, y la ventana solo necesita saber que está, no cuál es.
    k == "openrouter" || k.starts_with("api_") || k.starts_with("bot_")
}

#[tauri::command(async)]
pub fn secret_get(key: String) -> Option<String> {
    if es_privada(&key) {
        return None;
    }
    get(&key)
}

#[tauri::command(async)]
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

    /// Un sitio de mentira para probar la mudanza al Llavero en cualquier sistema.
    #[derive(Default)]
    struct Doble {
        datos: std::cell::RefCell<std::collections::HashMap<String, String>>,
        /// No deja escribir (un Llavero bloqueado).
        no_escribe: std::cell::Cell<bool>,
        /// Escribe pero devuelve otra cosa al leer (un Llavero que miente).
        lee_otra: std::cell::Cell<bool>,
        /// No deja borrar.
        no_borra: std::cell::Cell<bool>,
    }

    impl Doble {
        fn con(k: &str, v: &str) -> Self {
            let d = Doble::default();
            d.datos.borrow_mut().insert(k.into(), v.into());
            d
        }
        fn tiene(&self, k: &str) -> Option<String> {
            self.datos.borrow().get(k).cloned()
        }
    }

    impl Almacen for Doble {
        fn poner(&self, k: &str, v: &str) -> Result<(), String> {
            if self.no_escribe.get() {
                return Err("bloqueado".into());
            }
            self.datos.borrow_mut().insert(k.into(), v.into());
            Ok(())
        }
        fn leer(&self, k: &str) -> Result<Option<String>, String> {
            if self.lee_otra.get() {
                return Ok(Some("otra cosa".into()));
            }
            Ok(self.datos.borrow().get(k).cloned())
        }
        fn borrar(&self, k: &str) -> Result<(), String> {
            if self.no_borra.get() {
                return Err("no se deja".into());
            }
            self.datos.borrow_mut().remove(k);
            Ok(())
        }
    }

    #[test]
    fn llavero_una_clave_nueva_va_al_llavero_y_no_deja_archivo() {
        let (ll, ar) = (Doble::default(), Doble::default());
        poner_en(&ll, &ar, "api:x", "sk-1").unwrap();
        assert_eq!(ll.tiene("api:x").as_deref(), Some("sk-1"));
        assert_eq!(ar.tiene("api:x"), None);
    }

    #[test]
    fn llavero_la_clave_del_archivo_se_muda_sola_y_el_archivo_se_borra_al_leerla_de_vuelta() {
        let (ll, ar) = (Doble::default(), Doble::con("api:x", "sk-viejo"));
        assert_eq!(leer_en(&ll, &ar, "api:x").as_deref(), Some("sk-viejo"));
        assert_eq!(ll.tiene("api:x").as_deref(), Some("sk-viejo"), "se mudó al Llavero");
        assert_eq!(ar.tiene("api:x"), None, "y el archivo sobra");
        // Y la segunda vez sale del Llavero.
        assert_eq!(leer_en(&ll, &ar, "api:x").as_deref(), Some("sk-viejo"));
    }

    #[test]
    fn llavero_si_el_llavero_no_deja_escribir_la_clave_se_queda_en_el_archivo() {
        let (ll, ar) = (Doble::default(), Doble::con("api:x", "sk-viejo"));
        ll.no_escribe.set(true);
        assert_eq!(leer_en(&ll, &ar, "api:x").as_deref(), Some("sk-viejo"));
        assert_eq!(ar.tiene("api:x").as_deref(), Some("sk-viejo"), "NO se borra si no se guardó");
        // Guardar una nueva con el Llavero roto también acaba en el archivo.
        poner_en(&ll, &ar, "api:y", "sk-2").unwrap();
        assert_eq!(ar.tiene("api:y").as_deref(), Some("sk-2"));
        assert_eq!(leer_en(&ll, &ar, "api:y").as_deref(), Some("sk-2"));
    }

    /// El Llavero tenía la vieja y no dejó guardar la nueva (bloqueado, o una firma
    /// que aún no tiene permiso): la nueva va al archivo. Al volver a dejar, leía la
    /// vieja para siempre y la clave que acababas de poner no se usaba nunca.
    #[test]
    fn llavero_una_clave_cambiada_con_el_llavero_bloqueado_no_vuelve_a_la_vieja() {
        let (ll, ar) = (Doble::con("api:x", "sk-viejo"), Doble::default());
        ll.no_escribe.set(true);
        poner_en(&ll, &ar, "api:x", "sk-nuevo").unwrap();
        assert_eq!(leer_en(&ll, &ar, "api:x").as_deref(), Some("sk-nuevo"), "con el Llavero aún bloqueado");
        ll.no_escribe.set(false);
        assert_eq!(leer_en(&ll, &ar, "api:x").as_deref(), Some("sk-nuevo"), "al desbloquearse no vuelve la vieja");
        assert_eq!(ll.tiene("api:x").as_deref(), Some("sk-nuevo"), "y se muda sola");
        assert_eq!(ar.tiene("api:x"), None);
    }

    /// Como el archivo manda al leer, uno que no se deja borrar no puede quedarse
    /// con el valor de antes.
    #[test]
    fn llavero_un_archivo_que_no_se_deja_borrar_no_devuelve_la_clave_de_antes() {
        let (ll, ar) = (Doble::default(), Doble::con("api:x", "sk-viejo"));
        ar.no_borra.set(true);
        poner_en(&ll, &ar, "api:x", "sk-nuevo").unwrap();
        assert_eq!(leer_en(&ll, &ar, "api:x").as_deref(), Some("sk-nuevo"));
        // Y si tampoco se deja escribir, se dice: no se calla una clave que no se usará.
        ar.no_escribe.set(true);
        assert!(poner_en(&ll, &ar, "api:x", "sk-otra").is_err());
    }

    #[test]
    fn llavero_si_lo_que_se_lee_de_vuelta_no_es_lo_guardado_el_archivo_no_se_borra() {
        let (ll, ar) = (Doble::default(), Doble::con("api:x", "sk-viejo"));
        ll.lee_otra.set(true);
        assert_eq!(leer_en(&ll, &ar, "api:x").as_deref(), Some("sk-viejo"), "lo que hay en el archivo manda");
        assert_eq!(ar.tiene("api:x").as_deref(), Some("sk-viejo"), "y el archivo sigue ahí");
        // Al guardar con un Llavero que miente, el valor nuevo queda en el archivo.
        poner_en(&ll, &ar, "api:x", "sk-nuevo").unwrap();
        assert_eq!(ar.tiene("api:x").as_deref(), Some("sk-nuevo"));
    }

    #[test]
    fn llavero_sobrescribir_borra_el_archivo_viejo_y_olvidar_borra_los_dos() {
        let (ll, ar) = (Doble::default(), Doble::con("api:x", "sk-viejo"));
        poner_en(&ll, &ar, "api:x", "sk-nuevo").unwrap();
        assert_eq!(ll.tiene("api:x").as_deref(), Some("sk-nuevo"));
        assert_eq!(ar.tiene("api:x"), None, "no queda el viejo para resucitar");
        // Un olvidar con restos en los dos sitios los quita de los dos.
        ar.datos.borrow_mut().insert("api:x".into(), "resto".into());
        olvidar_en(&ll, &ar, "api:x").unwrap();
        assert_eq!((ll.tiene("api:x"), ar.tiene("api:x")), (None, None));
        olvidar_en(&ll, &ar, "api:x").unwrap();
    }

    #[test]
    fn llavero_olvidar_dice_el_fallo_pero_intenta_los_dos() {
        let (ll, ar) = (Doble::con("api:x", "a"), Doble::con("api:x", "b"));
        ll.no_borra.set(true);
        assert!(olvidar_en(&ll, &ar, "api:x").is_err());
        assert_eq!(ar.tiene("api:x"), None, "el archivo se borró aunque el Llavero no");
    }

    /// El Llavero de verdad y el archivo de verdad, en un Mac: la mudanza entera.
    /// Un Mac sin sesión gráfica (el runner) puede no tener Llavero que abrir; con
    /// `ADEORQ_EXIGIR_LLAVERO=1` eso es un fallo, y sin la variable se avisa y se sigue.
    #[cfg(target_os = "macos")]
    #[test]
    fn llavero_de_verdad_muda_el_archivo_y_lo_borra() {
        let _turno = turno();
        let key = "test/llavero-de-verdad";
        let _ = forget(key);
        if LlaveroMac.poner(key, "sonda").is_err() {
            assert!(
                std::env::var_os("ADEORQ_EXIGIR_LLAVERO").is_none(),
                "el Llavero de este Mac no deja guardar"
            );
            eprintln!("LLAVERO NO DISPONIBLE: la prueba se salta");
            return;
        }
        LlaveroMac.borrar(key).unwrap();
        put_archivo(key, "secreto-viejo").unwrap();
        assert_eq!(get(key).as_deref(), Some("secreto-viejo"));
        assert_eq!(LlaveroMac.leer(key).unwrap().as_deref(), Some("secreto-viejo"), "ya está en el Llavero");
        assert_eq!(leer_archivo(key).unwrap(), None, "y el archivo se borró");
        put(key, "secreto-nuevo").unwrap();
        assert_eq!(get(key).as_deref(), Some("secreto-nuevo"));
        forget(key).unwrap();
        assert_eq!(get(key), None);
        assert_eq!(LlaveroMac.leer(key).unwrap(), None);
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

    /// Otro nombre para el MISMO sitio del almacén también es la clave: en
    /// Linux el archivo cambia `:` por `_` (`api_openai` es `api:openai`), y el
    /// Gestor de Credenciales de Windows no distingue mayúsculas.
    #[test]
    fn el_front_no_saca_una_clave_escribiendola_de_otra_forma() {
        let _turno = turno();
        let key = "api:test-otra-forma";
        put(key, "sk-tampoco").expect("guardar");
        let sale: Vec<&str> = ["API:test-otra-forma", "Api:Test-Otra-Forma", "api_test-otra-forma", "api.test-otra-forma"]
            .into_iter()
            .filter(|k| secret_get(k.to_string()).is_some())
            .collect();
        forget(key).expect("olvidar");
        assert!(sale.is_empty(), "el front la saca como {sale:?}");
        assert!(es_privada("OpenRouter") && es_privada("API:claude") && es_privada("api_claude"));
        assert!(!es_privada("brujula/refresh"));
    }

    /// La clave del webhook de un bot (`bots.rs`) tampoco vuelve a la ventana.
    #[test]
    fn el_front_no_lee_la_clave_de_un_bot() {
        let _turno = turno();
        assert!(es_privada("bot:grok") && es_privada("BOT:grok") && es_privada("bot_grok"));
        let key = "bot:test-privada";
        put(key, "clave-de-bot").expect("guardar");
        assert_eq!(secret_get(key.to_string()), None);
        assert_eq!(get(key).as_deref(), Some("clave-de-bot"));
        forget(key).expect("olvidar");
    }
}
