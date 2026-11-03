//! The share card's backgrounds and its video, on disk (`PerfilTarjeta.tsx`).
//!
//! Two things live here:
//!
//! * **The backgrounds you import** (images and videos) are copied into
//!   `<datos>/tarjeta/fondos/` and served by the asset protocol, like the
//!   terminal background (`set_fondo`). They survive a restart, and a big video
//!   never goes through memory or the IPC bridge: Rust copies it file to file.
//! * **The MP4 goes to disk in pieces.** The muxer writes chunks at a byte
//!   offset (`fastStart: "reserve"` writes the `moov` at the start when it
//!   finishes), so a ten-minute card is never held whole in memory nor sent in
//!   one go. It is written to `<destino>.part`, renamed at the end and removed
//!   when cancelled.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

const EXT_IMAGEN: [&str; 6] = ["png", "jpg", "jpeg", "webp", "gif", "avif"];
const EXT_VIDEO: [&str; 4] = ["mp4", "m4v", "mov", "webm"];

#[derive(serde::Serialize, Debug, Clone, PartialEq)]
pub struct FondoGuardado {
    /// File name inside the folder: the id used to remove it.
    pub nombre: String,
    pub ruta: String,
    pub video: bool,
    pub bytes: u64,
}

fn extension(p: &Path) -> Option<String> {
    p.extension().and_then(|e| e.to_str()).map(str::to_lowercase)
}

fn es_video(ext: &str) -> bool {
    EXT_VIDEO.contains(&ext)
}

fn admitida(ext: &str) -> bool {
    EXT_IMAGEN.contains(&ext) || es_video(ext)
}

fn carpeta() -> Result<PathBuf, String> {
    let d = crate::dir_datos_creado()?.join("tarjeta").join("fondos");
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn describir(p: &Path) -> Option<FondoGuardado> {
    let ext = extension(p)?;
    if !admitida(&ext) || !p.is_file() {
        return None;
    }
    Some(FondoGuardado {
        nombre: p.file_name()?.to_str()?.to_owned(),
        ruta: p.to_string_lossy().into_owned(),
        video: es_video(&ext),
        bytes: fs::metadata(p).ok()?.len(),
    })
}

/// What is in the folder, newest first. A `.part` left by a copy that died
/// halfway is not a background and is skipped (its extension is `part`).
fn listar_en(dir: &Path) -> Vec<FondoGuardado> {
    let mut v: Vec<(std::time::SystemTime, FondoGuardado)> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            let f = describir(&p)?;
            let t = e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
            Some((t, f))
        })
        .collect();
    v.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.nombre.cmp(&b.1.nombre)));
    v.into_iter().map(|(_, f)| f).collect()
}

/// Same bytes, read in blocks: a 2 GB video is never loaded whole.
fn mismo_contenido(a: &Path, b: &Path) -> bool {
    let (Ok(ma), Ok(mb)) = (fs::metadata(a), fs::metadata(b)) else {
        return false;
    };
    if ma.len() != mb.len() {
        return false;
    }
    let (Ok(mut fa), Ok(mut fb)) = (File::open(a), File::open(b)) else {
        return false;
    };
    let mut ba = vec![0u8; 1 << 16];
    let mut bb = vec![0u8; 1 << 16];
    loop {
        let n = match fa.read(&mut ba) {
            Ok(n) => n,
            Err(_) => return false,
        };
        if n == 0 {
            return true;
        }
        if fb.read_exact(&mut bb[..n]).is_err() || ba[..n] != bb[..n] {
            return false;
        }
    }
}

/// A free name for `nombre`: itself, or «video (2).mp4», «video (3).mp4»…
fn nombre_libre(dir: &Path, nombre: &str) -> String {
    if !dir.join(nombre).exists() {
        return nombre.to_owned();
    }
    let p = Path::new(nombre);
    let base = p.file_stem().and_then(|s| s.to_str()).unwrap_or("fondo");
    let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("");
    (2..)
        .map(|n| format!("{base} ({n}).{ext}"))
        .find(|c| !dir.join(c).exists())
        .unwrap_or_else(|| nombre.to_owned())
}

fn importar_en(dir: &Path, origen: &Path) -> Result<FondoGuardado, String> {
    let ext = extension(origen).ok_or("ese archivo no tiene extensión")?;
    if !admitida(&ext) {
        return Err(format!("no sé usar un .{ext} de fondo"));
    }
    if !origen.is_file() {
        return Err("no encuentro ese archivo".into());
    }
    // The same file twice is not copied twice: the one already there is returned.
    for f in listar_en(dir) {
        if mismo_contenido(origen, Path::new(&f.ruta)) {
            return Ok(f);
        }
    }
    let nombre = origen
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("ese nombre de archivo no se puede leer")?;
    let nombre = nombre_libre(dir, nombre);
    let destino = dir.join(&nombre);
    let parte = dir.join(format!("{nombre}.part"));
    if let Err(e) = fs::copy(origen, &parte) {
        let _ = fs::remove_file(&parte);
        return Err(format!("no he podido copiarlo: {e}"));
    }
    fs::rename(&parte, &destino).map_err(|e| {
        let _ = fs::remove_file(&parte);
        format!("no he podido copiarlo: {e}")
    })?;
    describir(&destino).ok_or_else(|| "la copia no ha salido".into())
}

/// The file `nombre` inside `dir`, only if the name cannot step out of it.
fn dentro(dir: &Path, nombre: &str) -> Result<PathBuf, String> {
    let limpio = Path::new(nombre)
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| *n == nombre && !n.starts_with('.'));
    let Some(limpio) = limpio else {
        return Err("ese nombre se sale de la carpeta de fondos".into());
    };
    let ext = extension(Path::new(limpio)).unwrap_or_default();
    if !admitida(&ext) {
        return Err("eso no es un fondo de la tarjeta".into());
    }
    Ok(dir.join(limpio))
}

fn quitar_en(dir: &Path, nombre: &str) -> Result<(), String> {
    let p = dentro(dir, nombre)?;
    match fs::remove_file(&p) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// The backgrounds you imported, newest first.
#[tauri::command(async)]
pub fn tarjeta_fondos() -> Result<Vec<FondoGuardado>, String> {
    Ok(listar_en(&carpeta()?))
}

/// Copies the chosen file into Adeorq's folder (to a `.part`, then renamed).
#[tauri::command(async)]
pub fn tarjeta_fondo_importar(path: String) -> Result<FondoGuardado, String> {
    importar_en(&carpeta()?, Path::new(&path))
}

/// Removes Adeorq's copy, never the original.
#[tauri::command(async)]
pub fn tarjeta_fondo_quitar(nombre: String) -> Result<(), String> {
    quitar_en(&carpeta()?, &nombre)
}

// ── The MP4, in pieces ──

fn destino_mp4(ruta: &str) -> Result<PathBuf, String> {
    let p = Path::new(ruta);
    if !p.is_absolute() {
        return Err("ruta no absoluta".into());
    }
    if extension(p).as_deref() != Some("mp4") {
        return Err("el vídeo se guarda en un .mp4".into());
    }
    Ok(p.to_path_buf())
}

fn parte_de(destino: &Path) -> PathBuf {
    let mut s = destino.as_os_str().to_owned();
    s.push(".part");
    PathBuf::from(s)
}

/// `%XX` back to bytes: the path travels in a header, which only takes Latin-1.
fn desescapar(s: &str) -> Result<String, String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = s.get(i + 1..i + 3).ok_or("ruta mal escapada")?;
            out.push(u8::from_str_radix(hex, 16).map_err(|_| "ruta mal escapada")?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| "ruta mal escapada".into())
}

fn escribir_en(parte: &Path, posicion: u64, bytes: &[u8]) -> Result<(), String> {
    let mut f = OpenOptions::new()
        .write(true)
        .open(parte)
        .map_err(|e| format!("no puedo escribir el vídeo: {e}"))?;
    f.seek(SeekFrom::Start(posicion)).map_err(|e| e.to_string())?;
    f.write_all(bytes).map_err(|e| e.to_string())
}

/// Creates (or empties) `<ruta>.part`.
#[tauri::command(async)]
pub fn tarjeta_video_empezar(ruta: String) -> Result<(), String> {
    let destino = destino_mp4(&ruta)?;
    if let Some(dir) = destino.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    File::create(parte_de(&destino)).map_err(|e| format!("no puedo crear el vídeo: {e}"))?;
    Ok(())
}

/// One chunk: raw body, with `ruta` (escaped) and `posicion` in the headers.
#[tauri::command(async)]
pub fn tarjeta_video_escribir(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let cabecera = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok());
    let ruta = desescapar(cabecera("ruta").ok_or("falta la ruta del vídeo")?)?;
    let posicion: u64 = cabecera("posicion")
        .and_then(|p| p.parse().ok())
        .ok_or("falta la posición del trozo")?;
    let parte = parte_de(&destino_mp4(&ruta)?);
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => escribir_en(&parte, posicion, bytes),
        tauri::ipc::InvokeBody::Json(serde_json::Value::Array(lista)) => {
            let bytes: Option<Vec<u8>> = lista
                .iter()
                .map(|n| n.as_u64().and_then(|n| u8::try_from(n).ok()))
                .collect();
            escribir_en(&parte, posicion, &bytes.ok_or("el trozo no llegó en bytes")?)
        }
        _ => Err("el trozo no llegó en bytes".into()),
    }
}

/// The `.part` becomes the file the user chose.
#[tauri::command(async)]
pub fn tarjeta_video_acabar(ruta: String) -> Result<(), String> {
    let destino = destino_mp4(&ruta)?;
    fs::rename(parte_de(&destino), &destino).map_err(|e| format!("no he podido cerrar el vídeo: {e}"))
}

/// Cancelled or failed: the `.part` goes away.
#[tauri::command(async)]
pub fn tarjeta_video_cancelar(ruta: String) -> Result<(), String> {
    let parte = parte_de(&destino_mp4(&ruta)?);
    match fs::remove_file(parte) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

fn carpeta_de_copias() -> Result<PathBuf, String> {
    let d = crate::dir_datos_creado()?.join("tarjeta").join("copias");
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// Each copy gets its own folder: the file keeps a clean name for whoever
/// receives it, and an earlier one still open in a player or an upload is no
/// obstacle.
fn ruta_de_copia(dir: &Path, nombre: &str, sello: u128) -> Result<PathBuf, String> {
    // Las dos barras, en todos los sistemas: en Linux y en Mac la invertida es una
    // letra más, y `..\fuera.mp4` pasaba por un nombre suelto.
    let es_nombre_suelto = !nombre.contains(['/', '\\']) && Path::new(nombre).file_name().and_then(|n| n.to_str()) == Some(nombre);
    if !es_nombre_suelto || extension(Path::new(nombre)).as_deref() != Some("mp4") {
        return Err("nombre de vídeo no válido".into());
    }
    Ok(dir.join(sello.to_string()).join(nombre))
}

/// Where Copy leaves the MP4: it has to stay on disk until it is pasted.
#[tauri::command(async)]
pub fn tarjeta_copia_ruta(nombre: String) -> Result<String, String> {
    let sello = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis());
    let ruta = ruta_de_copia(&carpeta_de_copias()?, &nombre, sello)?;
    Ok(ruta.to_string_lossy().into_owned())
}

fn es_una_copia(dir: &Path, ruta: &Path) -> bool {
    let sin_saltos = ruta.components().all(|c| !matches!(c, std::path::Component::ParentDir));
    sin_saltos && ruta.starts_with(dir) && extension(ruta).as_deref() == Some("mp4") && ruta.is_file()
}

/// Only the last copy stays: a video can weigh hundreds of MB, and the clipboard
/// no longer points at the earlier ones. What is in use stays until the next time.
fn barrer_copias(dir: &Path, ruta: &Path) {
    let Ok(entradas) = fs::read_dir(dir) else { return };
    for e in entradas.flatten() {
        if ruta.parent() != Some(e.path().as_path()) {
            let _ = fs::remove_dir_all(e.path());
        }
    }
}

/// The MP4 Copy just made, on the system clipboard.
#[tauri::command(async)]
pub fn tarjeta_copiar_archivo(app: tauri::AppHandle, ruta: String) -> Result<(), String> {
    let dir = carpeta_de_copias()?;
    let ruta = PathBuf::from(ruta);
    if !es_una_copia(&dir, &ruta) {
        return Err("ese archivo no es una copia de la tarjeta".into());
    }
    crate::portapapeles::copiar_archivo(&app, &ruta)?;
    barrer_copias(&dir, &ruta);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn carpeta_de_prueba(nombre: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("adeorq-fondos-{nombre}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn importa_una_vez_y_sin_dejar_part() {
        let raiz = carpeta_de_prueba("importa");
        let dir = raiz.join("fondos");
        fs::create_dir_all(&dir).unwrap();
        let origen = raiz.join("clip.mp4");
        fs::write(&origen, b"video de prueba").unwrap();

        let a = importar_en(&dir, &origen).unwrap();
        assert_eq!(a.nombre, "clip.mp4");
        assert!(a.video);
        // The same file again returns the copy already there.
        let b = importar_en(&dir, &origen).unwrap();
        assert_eq!(a, b);
        assert_eq!(listar_en(&dir).len(), 1);
        // A different file with the same name gets another name.
        let otro = raiz.join("otra").join("clip.mp4");
        fs::create_dir_all(otro.parent().unwrap()).unwrap();
        fs::write(&otro, b"otro video").unwrap();
        assert_eq!(importar_en(&dir, &otro).unwrap().nombre, "clip (2).mp4");
        assert!(fs::read_dir(&dir).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().ends_with(".part")));
        let _ = fs::remove_dir_all(&raiz);
    }

    #[test]
    fn rechaza_lo_que_no_es_un_fondo() {
        let raiz = carpeta_de_prueba("rechaza");
        let origen = raiz.join("nota.txt");
        fs::write(&origen, b"x").unwrap();
        assert!(importar_en(&raiz, &origen).is_err());
        let _ = fs::remove_dir_all(&raiz);
    }

    #[test]
    fn quitar_no_se_sale_de_la_carpeta() {
        let raiz = carpeta_de_prueba("quitar");
        let dir = raiz.join("fondos");
        fs::create_dir_all(&dir).unwrap();
        let fuera = raiz.join("fuera.mp4");
        fs::write(&fuera, b"no tocar").unwrap();
        for malo in ["../fuera.mp4", "..\\fuera.mp4", "sub/fuera.mp4", ".oculto.mp4", "fuera.exe", ""] {
            assert!(quitar_en(&dir, malo).is_err(), "{malo} debía fallar");
        }
        assert!(fuera.exists());
        fs::write(dir.join("bien.png"), b"x").unwrap();
        quitar_en(&dir, "bien.png").unwrap();
        assert!(!dir.join("bien.png").exists());
        let _ = fs::remove_dir_all(&raiz);
    }

    #[test]
    fn el_mp4_se_escribe_a_trozos_y_se_renombra() {
        let raiz = carpeta_de_prueba("mp4");
        let destino = raiz.join("tarjeta.mp4");
        let ruta = destino.to_string_lossy().into_owned();
        tarjeta_video_empezar(ruta.clone()).unwrap();
        let parte = parte_de(&destino);
        escribir_en(&parte, 4, b"mdat").unwrap();
        // The header goes at the start at the end, like `fastStart: "reserve"`.
        escribir_en(&parte, 0, b"moov").unwrap();
        tarjeta_video_acabar(ruta.clone()).unwrap();
        assert_eq!(fs::read(&destino).unwrap(), b"moovmdat");
        assert!(!parte.exists());
        tarjeta_video_empezar(ruta.clone()).unwrap();
        tarjeta_video_cancelar(ruta.clone()).unwrap();
        assert!(!parte.exists());
        assert!(destino_mp4("relativa.mp4").is_err());
        assert!(destino_mp4(&raiz.join("x.exe").to_string_lossy()).is_err());
        let _ = fs::remove_dir_all(&raiz);
    }

    #[test]
    fn la_copia_se_queda_en_su_carpeta_y_con_su_nombre() {
        let dir = Path::new("C:\\datos\\tarjeta\\copias");
        assert_eq!(
            ruta_de_copia(dir, "adeorq-uso-2026-11-02.mp4", 7).unwrap(),
            dir.join("7").join("adeorq-uso-2026-11-02.mp4"),
        );
        for malo in ["..\\fuera.mp4", "../fuera.mp4", "sub\\x.mp4", "C:\\x.mp4", "x.exe", "x", ""] {
            assert!(ruta_de_copia(dir, malo, 7).is_err(), "{malo}");
        }
    }

    #[test]
    fn solo_se_copia_un_mp4_de_la_carpeta_de_copias() {
        let raiz = carpeta_de_prueba("copias-si");
        let dir = raiz.join("copias");
        let copia = dir.join("1").join("a.mp4");
        fs::create_dir_all(copia.parent().unwrap()).unwrap();
        fs::write(&copia, b"x").unwrap();
        fs::write(dir.join("1").join("a.exe"), b"x").unwrap();
        let fuera = raiz.join("b.mp4");
        fs::write(&fuera, b"x").unwrap();
        assert!(es_una_copia(&dir, &copia));
        assert!(!es_una_copia(&dir, &dir.join("1").join("a.exe")), "otra extensión");
        assert!(!es_una_copia(&dir, &fuera), "fuera de la carpeta");
        assert!(!es_una_copia(&dir, &dir.join("..").join("b.mp4")), "saliendo con ..");
        assert!(!es_una_copia(&dir, &dir.join("1").join("no-existe.mp4")), "no existe");
        let _ = fs::remove_dir_all(&raiz);
    }

    #[test]
    fn al_copiar_solo_queda_la_ultima() {
        let raiz = carpeta_de_prueba("copias-barrer");
        let vieja = raiz.join("1").join("a.mp4");
        let cancelada = raiz.join("2");
        let nueva = raiz.join("3").join("a.mp4");
        fs::create_dir_all(vieja.parent().unwrap()).unwrap();
        fs::create_dir_all(&cancelada).unwrap();
        fs::create_dir_all(nueva.parent().unwrap()).unwrap();
        fs::write(&vieja, b"x").unwrap();
        fs::write(&nueva, b"x").unwrap();
        barrer_copias(&raiz, &nueva);
        assert!(!vieja.exists() && !cancelada.exists());
        assert!(nueva.exists());
        let _ = fs::remove_dir_all(&raiz);
    }
}
