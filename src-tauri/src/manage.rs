// Session management: rename (custom-title append), git dirty check for the
// safe-archive warning, and the Adeorq UI state file (groups + archived ids).
//
// Renaming writes the exact line format the official Claude Code app uses at
// the transcript tail ({"type":"custom-title",...}), so both apps see it.
// Archiving is LOGICAL: ids live in adeorq-state.json and nothing on disk is
// touched, unlike the official desktop app (which deletes uncommitted worktree
// changes without warning; that gotcha is the reason project_dirty exists).
use serde::Serialize;
use std::io::Write;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use tauri::Manager;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn transcript_path(folder: &str, session_id: &str) -> Result<PathBuf, String> {
    // Both names come from scan_sessions (directory + file stem), but they
    // cross the JS boundary, so refuse anything that could escape ~/.claude.
    if folder.contains(['\\', '/', '.']) || session_id.contains(['\\', '/', '.']) {
        return Err("nombre de sesión inválido".into());
    }
    let home = std::env::var("USERPROFILE").map_err(|e| e.to_string())?;
    Ok(PathBuf::from(home)
        .join(".claude")
        .join("projects")
        .join(folder)
        .join(format!("{session_id}.jsonl")))
}

/// Saves an image pasted into a pane and returns its path. Claude Code and agy
/// both read an image when you hand them its path, so pasting a screenshot
/// becomes: drop the bytes on disk, type the path. Files land in
/// %LOCALAPPDATA%\Adeorq\pastes and are named by timestamp.
// Los comandos con IO gorda van en async: sin él corren en el hilo de la
// ventana y una imagen de varios MB (guardarla, o leer las 185 de la galería)
// congela la app entera mientras el disco responde.
#[tauri::command]
pub async fn save_pasted_image(bytes: Vec<u8>, ext: String) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("portapapeles vacío".into());
    }
    let local = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    let dir = Path::new(&local).join("Adeorq").join("pastes");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let safe_ext = if ext.chars().all(|c| c.is_ascii_alphanumeric()) && !ext.is_empty() {
        ext
    } else {
        "png".to_owned()
    };
    let path = dir.join(format!("pegado-{stamp}.{safe_ext}"));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Una captura ya pegada alguna vez. La galería del lienzo las lista para
/// poder volver a sacar una sin ir a buscarla al Explorador.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Paste {
    pub name: String,
    pub path: String,
    pub bytes: u64,
    /// Cuándo se pegó, en milisegundos, para poder ordenarlas por lo reciente.
    pub stamp: u64,
}

fn pastes_dir() -> Result<PathBuf, String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    Ok(Path::new(&local).join("Adeorq").join("pastes"))
}

/// Lo que hay en la carpeta de capturas, de la más nueva a la más vieja.
///
/// Solo los metadatos: 185 capturas son 23 MB, y mandarlas todas por el puente
/// para pintar una rejilla sería cargar 23 MB en el navegador para enseñar
/// cuadrados de 90 px. Los bytes se piden luego, y solo los que se ven.
#[tauri::command]
pub async fn list_pastes() -> Result<Vec<Paste>, String> {
    let dir = pastes_dir()?;
    let leidos = match std::fs::read_dir(&dir) {
        Ok(r) => r,
        // Sin carpeta no hay error: es que todavía no ha pegado nada.
        Err(_) => return Ok(vec![]),
    };
    let mut fuera: Vec<Paste> = leidos
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            let ext = path
                .extension()
                .map(|x| x.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp") {
                return None;
            }
            let meta = e.metadata().ok()?;
            Some(Paste {
                name: path.file_name()?.to_string_lossy().into_owned(),
                path: path.to_string_lossy().into_owned(),
                bytes: meta.len(),
                stamp: meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0),
            })
        })
        .collect();
    fuera.sort_by(|a, b| b.stamp.cmp(&a.stamp));
    Ok(fuera)
}

/// Los bytes de UNA captura, para pintarla.
///
/// Van como respuesta binaria y no como base64: base64 engorda un tercio y
/// además cruza el puente como texto. Y la ruta se comprueba contra la carpeta
/// de capturas, porque este comando lee un archivo del disco y algún día lo
/// llamará algo que no sea la galería.
#[tauri::command]
pub async fn read_paste(path: String) -> Result<tauri::ipc::Response, String> {
    let dir = pastes_dir()?;
    let p = Path::new(&path);
    let dentro = p
        .canonicalize()
        .map_err(|e| e.to_string())?
        .starts_with(dir.canonicalize().map_err(|e| e.to_string())?);
    if !dentro {
        return Err("esa imagen no es de la galería de Adeorq".into());
    }
    let bytes = std::fs::read(p).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Tira una captura a la papelera de Windows: la galería enseña todo lo que
/// has pegado, y ahí acaba habiendo pruebas y descartes.
#[tauri::command]
pub fn delete_paste(path: String) -> Result<(), String> {
    let dir = pastes_dir()?;
    let p = Path::new(&path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !p.starts_with(dir.canonicalize().map_err(|e| e.to_string())?) {
        return Err("esa imagen no es de la galería de Adeorq".into());
    }
    to_recycle_bin(&p)
}

/// Un lienzo exportado, escrito donde el usuario dijo en el diálogo del
/// sistema. La ruta llega del front, así que aquí se comprueba igual: absoluta
/// y `.json`. No es paranoia teórica, es que este comando escribe donde le
/// digan y un día lo llamará algo que no sea el botón de exportar.
#[tauri::command]
pub fn save_canvas_file(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.is_absolute() {
        return Err("ruta no absoluta".into());
    }
    if !path.to_lowercase().ends_with(".json") {
        return Err("el lienzo se guarda en un .json".into());
    }
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, content).map_err(|e| e.to_string())
}

/// Lee un lienzo exportado. El tope existe porque el archivo lleva dentro las
/// capturas pegadas en base64: un lienzo con fotos pesa, pero 64 MB ya no es
/// un lienzo, es otra cosa, y no se carga en memoria para averiguarlo.
#[tauri::command]
pub fn read_canvas_file(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.is_absolute() || !path.to_lowercase().ends_with(".json") {
        return Err("eso no es un lienzo de Adeorq".into());
    }
    let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if meta.len() > 64 * 1024 * 1024 {
        return Err("el archivo pesa más de 64 MB".into());
    }
    std::fs::read_to_string(p).map_err(|e| e.to_string())
}

/// El lienzo de trabajo, el que vuelve solo al abrir Adeorq.
///
/// Es el MISMO formato que un lienzo exportado, pero aquí la ruta no la elige
/// nadie: siempre `%LOCALAPPDATA%\Adeorq\lienzo.json`. Por eso son comandos
/// aparte de `save_canvas_file` en vez de un parámetro suyo: ese escribe donde
/// le digan y tiene que desconfiar de la ruta; este no acepta ninguna.
fn board_path() -> Result<std::path::PathBuf, String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    let dir = Path::new(&local).join("Adeorq");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("lienzo.json"))
}

#[tauri::command]
pub fn save_board(content: String) -> Result<(), String> {
    let p = board_path()?;
    // Se escribe al lado y se cambia el nombre de golpe. Sin esto, cerrar la
    // app a mitad de escritura (o quedarse sin disco) deja un JSON cortado, y
    // el tablero que vuelve al abrir sería justo el que no se puede leer.
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, content).map_err(|e| e.to_string())?;
    if p.exists() {
        let _ = std::fs::remove_file(&p);
    }
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

/// Devuelve "" cuando todavía no hay tablero guardado: no tenerlo es lo normal
/// la primera vez, no un error que haya que enseñarle a nadie.
#[tauri::command]
pub fn read_board() -> Result<String, String> {
    let p = board_path()?;
    if !p.exists() {
        return Ok(String::new());
    }
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    if meta.len() > 64 * 1024 * 1024 {
        return Err("el lienzo guardado pesa más de 64 MB".into());
    }
    std::fs::read_to_string(&p).map_err(|e| e.to_string())
}

/// Tirar un proyecto entero a la papelera de Windows.
///
/// A la PAPELERA, no borrado: `to_recycle_bin` va con FOF_ALLOWUNDO, así que
/// se recupera desde el escritorio como cualquier otra cosa. Un botón que
/// borrase de verdad una carpeta de trabajo no debería existir.
///
/// Y solo dentro de `C:\proyectos`. La ruta llega del front, y esto acaba en
/// una llamada del sistema que borra lo que le digan: sin esta comprobación,
/// un día alguien le pasa otra cosa —una ruta compuesta, un `..`— y se lleva
/// por delante lo que no era. Se canonicaliza antes de comparar, que es lo
/// único que convierte `C:\proyectos\..\Windows` en lo que de verdad es.
#[tauri::command]
pub fn delete_project(path: String) -> Result<(), String> {
    let root = Path::new("C:\\proyectos")
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let p = Path::new(&path).canonicalize().map_err(|e| e.to_string())?;
    if !p.is_dir() {
        return Err("eso no es una carpeta".into());
    }
    if p == root {
        return Err("esa es la carpeta de todos los proyectos".into());
    }
    if !p.starts_with(&root) {
        return Err("solo se pueden tirar proyectos de C:\\proyectos".into());
    }
    to_recycle_bin(&p)
}

#[tauri::command]
pub fn rename_session(folder: String, session_id: String, title: String) -> Result<(), String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("El título está vacío".into());
    }
    let path = transcript_path(&folder, &session_id)?;
    if !path.is_file() {
        return Err("No encuentro el transcript de esa sesión".into());
    }
    let line = serde_json::json!({
        "type": "custom-title",
        "customTitle": title,
        "sessionId": session_id,
    });
    let mut f = std::fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    // One atomic append of a full line: safe even if the CLI holds the file.
    writeln!(f, "{line}").map_err(|e| e.to_string())?;
    Ok(())
}

/**
 * Throws a session away: its transcript goes to the Windows recycle bin.
 *
 * Deliberately NOT `remove_file`. Archiving already covers "get it out of my
 * list" without touching disk; this is the other thing, the one that also
 * removes it from Claude Code. But the button that does it is a small icon
 * sitting next to four others, so a slip has to cost a trip to the recycle
 * bin and not a day of work. Windows keeps the undo, and we do not have to.
 */
#[tauri::command]
pub fn delete_session(folder: String, session_id: String) -> Result<(), String> {
    let path = transcript_path(&folder, &session_id)?;
    if !path.is_file() {
        return Err("No encuentro el transcript de esa sesión".into());
    }
    to_recycle_bin(&path)
}

/// Quita el prefijo `\\?\` de una ruta de disco.
///
/// `canonicalize()` en Windows devuelve SIEMPRE la forma larga, `\\?\C:\algo`,
/// que es la que salta el límite de 260 caracteres. Y el shell de Windows, que
/// es quien mueve las cosas a la papelera, NO la acepta: devuelve 124
/// (DE_INVALIDFILES) sin más explicación. Tirar un proyecto fallaba siempre por
/// esto, porque `delete_project` canonicaliza antes —tiene que hacerlo, es lo
/// único que convierte un `..` en la ruta de verdad— y le pasaba el resultado
/// tal cual (Munir, 2026-07-29).
///
/// El UNC largo (`\\?\UNC\servidor\recurso`) se deja como está: convertirlo
/// tiene su propia forma y aquí no hay ninguno que convertir.
fn sin_verbatim(path: &Path) -> std::borrow::Cow<'_, Path> {
    use std::borrow::Cow;
    let Some(txt) = path.to_str() else {
        return Cow::Borrowed(path);
    };
    let Some(resto) = txt.strip_prefix(r"\\?\") else {
        return Cow::Borrowed(path);
    };
    // Solo la forma de disco, «C:\...»: una letra, dos puntos y separador.
    let b = resto.as_bytes();
    if b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && b[2] == b'\\' {
        return Cow::Owned(PathBuf::from(resto));
    }
    Cow::Borrowed(path)
}

/// Windows' own "send to the recycle bin", which is a shell operation rather
/// than a file one: `FOF_ALLOWUNDO` is the flag that makes it recoverable.
///
/// Verified against a real recycle bin by `a_file_really_goes_to_the_bin`.
pub(crate) fn to_recycle_bin(path: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::{
        FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT, FO_DELETE, SHFILEOPSTRUCTW,
        SHFileOperationW,
    };
    let corta = sin_verbatim(path);
    // The call takes a LIST of paths, and a list ends with a second NUL.
    let mut wide: Vec<u16> = corta.as_os_str().encode_wide().collect();
    wide.push(0);
    wide.push(0);
    let mut op: SHFILEOPSTRUCTW = unsafe { std::mem::zeroed() };
    op.wFunc = FO_DELETE as _;
    op.pFrom = wide.as_ptr();
    op.fFlags = (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI) as _;
    // SAFETY: `op` is zeroed, and `wide` is a double-NUL terminated buffer
    // that outlives the call, which is all this API asks for.
    let code = unsafe { SHFileOperationW(&mut op) };
    if code != 0 {
        // Con el nombre dentro: esto lo usan las sesiones, los proyectos y las
        // capturas, y el mensaje decía «la sesión» en los tres casos.
        let quien = corta
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| corta.display().to_string());
        return Err(format!(
            "Windows no ha podido mover «{quien}» a la papelera (código {code})"
        ));
    }
    if op.fAnyOperationsAborted != 0 {
        return Err("Windows canceló el borrado".into());
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirtyReport {
    pub is_repo: bool,
    pub files: Vec<String>,
    pub total: usize,
}

// async porque esto lanza `git status` y espera su salida: en el hilo de la
// ventana, cada apertura del flyout congelaba la app lo que tardara git.
#[tauri::command]
pub async fn project_dirty(path: String) -> Result<DirtyReport, String> {
    let out = std::process::Command::new("git")
        .args(["-C", &path, "status", "--porcelain"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Ok(DirtyReport {
            is_repo: false,
            files: Vec::new(),
            total: 0,
        });
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let all: Vec<String> = text
        .lines()
        .filter_map(crate::git_shadow::partir_estado)
        .map(|(estado, ruta)| format!("{estado} {ruta}"))
        .collect();
    let total = all.len();
    Ok(DirtyReport {
        is_repo: true,
        files: all.into_iter().take(8).collect(),
        total,
    })
}

fn state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("adeorq-state.json"))
}

#[tauri::command]
pub fn load_ui_state(app: tauri::AppHandle) -> Result<String, String> {
    let path = state_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(text),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok("{}".into()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn save_ui_state(app: tauri::AppHandle, content: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&content).map_err(|e| e.to_string())?;
    std::fs::write(state_path(&app)?, content).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_path_cannot_climb_out_of_the_claude_folder() {
        assert!(transcript_path("..", "x").is_err());
        assert!(transcript_path("ok", "../../etc/passwd").is_err());
        assert!(transcript_path("with.dot", "x").is_err());
        // What the real folders look like: dots become dashes upstream.
        assert!(transcript_path("C--proyectos-Adeorq", "abc-123").is_ok());
    }

    /// La galería, contra la carpeta de capturas de verdad.
    ///
    /// Lo que se comprueba no es la lista (eso lo diría cualquier `read_dir`),
    /// sino que los bytes que se devuelven son los del archivo y que la ruta
    /// se valida: este comando lee del disco lo que le digan, y lo único que
    /// lo separa de leer cualquier cosa es esa comprobación.
    #[test]
    fn the_gallery_only_reads_from_its_own_folder() {
        // Los comandos de la galería son async (ver arriba: sin async correrían
        // en el hilo de la ventana); en el test se esperan con block_on.
        use tauri::async_runtime::block_on;
        // Fuera de la carpeta: se niega, exista o no.
        assert!(block_on(read_paste("C:\\Windows\\win.ini".into())).is_err());
        assert!(block_on(read_paste("no-absoluta.png".into())).is_err());
        assert!(delete_paste("C:\\Windows\\win.ini".into()).is_err());

        let dir = pastes_dir().expect("hay carpeta de capturas");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("prueba-adeorq-temporal.png");
        // Un PNG de un píxel: pesa nada y es un archivo de imagen de verdad.
        let bytes: Vec<u8> = vec![
            0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, b'I', b'H', b'D', b'R',
        ];
        std::fs::write(&path, &bytes).unwrap();

        let listadas = block_on(list_pastes()).expect("se listan");
        let mia = listadas
            .iter()
            .find(|p| p.name == "prueba-adeorq-temporal.png")
            .expect("la capturada nueva sale en la galería");
        assert_eq!(mia.bytes, bytes.len() as u64);
        assert!(mia.stamp > 0);
        // Y la lista viene de la más nueva a la más vieja: la galería enseña
        // primero lo último que pegaste, que es lo que se busca.
        assert!(
            listadas.windows(2).all(|par| par[0].stamp >= par[1].stamp),
            "ordenadas por fecha, de nueva a vieja"
        );

        // Y viajan EN CRUDO, no como texto: con 185 capturas en la carpeta,
        // pasarlas a base64 sería un tercio más de peso en cada apertura.
        let leidos = block_on(read_paste(mia.path.clone())).expect("se leen sus bytes");
        match tauri::ipc::IpcResponse::body(leidos).expect("tiene cuerpo") {
            tauri::ipc::InvokeResponseBody::Raw(v) => assert_eq!(v, bytes),
            _ => panic!("los bytes de una captura no pueden ir como texto"),
        }

        std::fs::remove_file(&path).unwrap();
    }

    /// La ruta larga de `canonicalize()` es la que hacía fallar la papelera con
    /// el código 124, y este es el caso que el test de abajo NO cubría: usaba
    /// una ruta de temp_dir sin canonicalizar, así que nunca vio el prefijo.
    #[test]
    fn la_ruta_larga_de_windows_se_acorta() {
        assert_eq!(
            sin_verbatim(Path::new(r"\\?\C:\proyectos\caca")).as_ref(),
            Path::new(r"C:\proyectos\caca"),
        );
        // Una ruta normal se queda igual, y sin copiarla.
        let normal = Path::new(r"C:\proyectos\caca");
        assert!(matches!(sin_verbatim(normal), std::borrow::Cow::Borrowed(_)));
        // El UNC largo tiene su propia forma y no se toca.
        let unc = Path::new(r"\\?\UNC\servidor\recurso\x");
        assert!(matches!(sin_verbatim(unc), std::borrow::Cow::Borrowed(_)));
    }

    /// La prueba de que el prefijo ERA la causa, para que el arreglo no parezca
    /// una precaución que se puede quitar: la misma llamada, con la misma ruta,
    /// sin acortarla. Windows contesta 124 (DE_INVALIDFILES).
    ///
    /// Fuera de la suite porque toca el shell del sistema. Se corre con
    /// `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn la_ruta_larga_no_le_vale_al_shell() {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::UI::Shell::{
            FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT, FO_DELETE,
            SHFILEOPSTRUCTW, SHFileOperationW,
        };
        let path = std::env::temp_dir().join("adeorq-prueba-124.txt");
        std::fs::write(&path, b"no deberia irse a ningun sitio").unwrap();
        let larga = path.canonicalize().unwrap();
        let mut wide: Vec<u16> = larga.as_os_str().encode_wide().collect();
        wide.push(0);
        wide.push(0);
        let mut op: SHFILEOPSTRUCTW = unsafe { std::mem::zeroed() };
        op.wFunc = FO_DELETE as _;
        op.pFrom = wide.as_ptr();
        op.fFlags = (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI) as _;
        let code = unsafe { SHFileOperationW(&mut op) };
        assert_eq!(code, 124, "la ruta larga deberia dar DE_INVALIDFILES");
        assert!(path.exists(), "y el archivo deberia seguir donde estaba");
        std::fs::remove_file(&path).unwrap();
    }

    /// Not part of the suite: it puts a file in the real recycle bin. Run it
    /// with `cargo test -- --ignored --nocapture` to check the shell call
    /// still works, which no amount of unit testing can tell you.
    #[test]
    #[ignore]
    fn a_file_really_goes_to_the_bin() {
        let path = std::env::temp_dir().join("adeorq-prueba-papelera.txt");
        std::fs::write(&path, b"si lees esto, borrame de la papelera").unwrap();
        assert!(path.exists(), "el archivo de prueba deberia existir");
        // Canonicalizada A PROPÓSITO: así es como llega desde delete_project, y
        // así es como fallaba. Sin esto el test pasa y la app no funciona.
        let larga = path.canonicalize().unwrap();
        assert!(
            larga.to_string_lossy().starts_with(r"\\?\"),
            "canonicalize deberia dar la forma larga: {}",
            larga.display(),
        );
        match to_recycle_bin(&larga) {
            Ok(()) => println!("a la papelera: {}", larga.display()),
            Err(e) => panic!("no ha ido a la papelera: {e}"),
        }
        assert!(!path.exists(), "deberia haber desaparecido del disco");
    }
}

// ---------------------------------------------------------------------------
// El fondo de la casa: la imagen o el vídeo que se ve DETRÁS de las terminales.
//
// El archivo se COPIA a la carpeta de Adeorq en vez de guardarse la ruta que él
// eligió, y son dos motivos:
//
//   1. Un fondo que desaparece porque moviste la foto de sitio, o porque estaba
//      en un pendrive, es un fondo roto sin explicación.
//   2. El WebView solo puede leer archivos de una lista blanca (el scope del
//      protocolo de assets en tauri.conf). Teniéndolo todo dentro de la carpeta
//      de la app, esa lista es una sola carpeta y no "cualquier sitio del
//      disco", que es lo que habría hecho falta para servir la ruta original.
// ---------------------------------------------------------------------------

/// Lo que se admite. Cerrado a propósito: esto acaba en un <img> o un <video>,
/// y una lista abierta sería dejar que cualquier cosa entre por ahí.
const FONDO_EXT: [&str; 8] = ["png", "jpg", "jpeg", "webp", "gif", "avif", "mp4", "webm"];

fn fondo_dir() -> Result<std::path::PathBuf, String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    let dir = Path::new(&local).join("Adeorq");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// El que haya puesto, si hay alguno. Se busca por extensión porque solo puede
/// existir uno: poner un fondo nuevo borra el anterior.
fn fondo_actual() -> Option<std::path::PathBuf> {
    let dir = fondo_dir().ok()?;
    FONDO_EXT
        .iter()
        .map(|e| dir.join(format!("fondo.{e}")))
        .find(|p| p.is_file())
}

/// Copia el archivo elegido y devuelve su ruta ya dentro de la carpeta.
#[tauri::command]
pub fn set_fondo(path: String) -> Result<String, String> {
    let src = Path::new(&path);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_lowercase)
        .ok_or("ese archivo no tiene extensión")?;
    if !FONDO_EXT.contains(&ext.as_str()) {
        return Err(format!("no sé usar un .{ext} de fondo"));
    }
    let meta = std::fs::metadata(src).map_err(|e| e.to_string())?;
    // 400 MB. Un fondo más grande que eso no es un fondo, es una película, y
    // el WebView tendría que sostenerla mientras trabajas.
    if meta.len() > 400 * 1024 * 1024 {
        return Err("ese archivo pesa más de 400 MB".into());
    }
    // Fuera el anterior ANTES de copiar: si no, poner un .mp4 sobre un .png
    // dejaría los dos y `fondo_actual` devolvería el viejo por orden de lista.
    if let Some(viejo) = fondo_actual() {
        let _ = std::fs::remove_file(viejo);
    }
    let destino = fondo_dir()?.join(format!("fondo.{ext}"));
    std::fs::copy(src, &destino).map_err(|e| format!("no he podido copiarlo: {e}"))?;
    Ok(destino.to_string_lossy().into_owned())
}

/// La ruta del fondo puesto, o "" si no hay ninguno.
#[tauri::command]
pub fn get_fondo() -> String {
    fondo_actual()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default()
}

#[tauri::command]
pub fn clear_fondo() -> Result<(), String> {
    if let Some(p) = fondo_actual() {
        std::fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}
