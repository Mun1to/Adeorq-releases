// Hablarle a Adeorq.
//
// El patrón es el que ya han fijado Codex y Claude Code, y no hay motivo para
// inventar otro: mantienes una tecla, hablas, la sueltas y lo dicho aparece
// escrito. Ellos transcriben con Wispr, que es de pago y de nube; aquí se hace
// con whisper.cpp, que es libre, corre en esta máquina y no le cuenta a nadie
// lo que dices en tu propio despacho.
//
// El audio llega ya en WAV de 16 kHz mono desde el front, montado a mano con
// WebAudio. Podría haber llegado en webm y convertirlo aquí, pero convertir
// pide ffmpeg, y meter ffmpeg para no escribir cuarenta líneas de cabecera WAV
// es cambiar un problema pequeño por una dependencia grande.

use std::path::PathBuf;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Dónde se busca whisper.cpp, en orden.
///
/// Primero el PATH, que es donde acaba si lo instala con winget o si se lo
/// pone él. Después la carpeta de Adeorq, para quien prefiera dejar ahí el
/// binario suelto sin tocar el PATH. Los dos nombres porque el proyecto
/// renombró `main` a `whisper-cli` y por ahí circulan las dos versiones.
fn whisper_exe() -> Option<PathBuf> {
    let nombres = ["whisper-cli.exe", "whisper.exe", "main.exe"];
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            for n in nombres {
                let p = dir.join(n);
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    let local = std::env::var("LOCALAPPDATA").ok()?;
    let propia = PathBuf::from(local).join("Adeorq").join("whisper");
    for n in nombres {
        let p = propia.join(n);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

/// El modelo, junto al binario o en la carpeta de Adeorq. Se coge el primero
/// que aparezca: tener dos tamaños descargados es normal y elegir por nombre
/// obligaría a mantener aquí una lista de los nombres de otro proyecto.
fn whisper_model() -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(exe) = whisper_exe() {
        if let Some(d) = exe.parent() {
            dirs.push(d.to_path_buf());
            dirs.push(d.join("models"));
        }
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        dirs.push(PathBuf::from(local).join("Adeorq").join("whisper"));
    }
    for d in dirs {
        let Ok(entradas) = std::fs::read_dir(&d) else {
            continue;
        };
        for e in entradas.flatten() {
            let p = e.path();
            let nombre = p.file_name()?.to_string_lossy().to_lowercase();
            if nombre.starts_with("ggml-") && nombre.ends_with(".bin") {
                return Some(p);
            }
        }
    }
    None
}

/// Si se puede dictar ahora mismo, y si no, por qué no. El front lo usa para
/// decirlo en Ajustes en vez de dejar un botón que no hace nada.
#[tauri::command]
pub fn voz_lista() -> Result<String, String> {
    match (whisper_exe(), whisper_model()) {
        (Some(_), Some(m)) => Ok(m.file_name().unwrap_or_default().to_string_lossy().into()),
        (None, _) => Err("no encuentro whisper.cpp".into()),
        (Some(_), None) => Err("tengo whisper.cpp pero ningún modelo ggml-*.bin".into()),
    }
}

/// Lo que whisper se inventa cuando le das silencio.
///
/// No es un fallo de la instalación: los modelos de whisper se entrenaron con
/// subtítulos de vídeo, así que ante audio vacío devuelven las frases que más
/// veces aparecían al final de aquellos archivos. Sale entera, con puntuación y
/// sin corchetes, así que el filtro de [BLANK_AUDIO] no la ve pasar, y de ahí
/// iría derecha al prompt de una terminal.
///
/// Se compara la línea COMPLETA y no por trozos, salvo el dominio de los
/// subtítulos, que nadie va a dictar: si de verdad has dicho algo, tu frase no
/// va a ser exactamente una de estas.
fn es_alucinacion(linea: &str) -> bool {
    let l: String = linea
        .to_lowercase()
        .chars()
        .map(|c| match c {
            'á' => 'a',
            'é' => 'e',
            'í' => 'i',
            'ó' => 'o',
            'ú' | 'ü' => 'u',
            _ => c,
        })
        .filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '.')
        .collect();
    let l = l.trim();
    if l.contains("amara.org") {
        return true;
    }
    const INVENTADAS: [&str; 8] = [
        "gracias por ver el video",
        "gracias por ver el video.",
        "suscribete al canal",
        "suscribete a mi canal",
        "gracias por su atencion",
        "thanks for watching",
        "thank you for watching",
        "please subscribe to my channel",
    ];
    INVENTADAS.contains(&l)
}

/// Transcribe un WAV de 16 kHz mono. Devuelve el texto pelado.
#[tauri::command]
pub async fn transcribir(wav: Vec<u8>, idioma: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let exe = whisper_exe().ok_or("no encuentro whisper.cpp")?;
        let modelo = whisper_model().ok_or("no encuentro ningún modelo ggml-*.bin")?;

        // Un archivo por dictado. Llevaba solo el id del proceso, y eso separa
        // dos ventanas de Adeorq pero NO dos dictados de la misma ventana: los
        // dos escribían y borraban la misma ruta, así que el primero en
        // terminar le quitaba el audio al otro de debajo de los pies. Con el
        // contador cada dictado tiene el suyo, pase lo que pase arriba.
        static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let tmp = std::env::temp_dir().join(format!("adeorq-voz-{}-{n}.wav", std::process::id()));
        std::fs::write(&tmp, &wav).map_err(|e| e.to_string())?;

        let salida = Command::new(&exe)
            .args([
                "-m",
                &modelo.to_string_lossy(),
                "-f",
                &tmp.to_string_lossy(),
                "-l",
                if idioma.is_empty() { "auto" } else { &idioma },
                // Solo el texto: sin marcas de tiempo y sin la cabecera que
                // imprime, que sería lo primero que acabaría dentro del prompt.
                "--no-timestamps",
                "--no-prints",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("no pude lanzar whisper: {e}"))?;

        let _ = std::fs::remove_file(&tmp);

        if !salida.status.success() {
            let err = String::from_utf8_lossy(&salida.stderr);
            return Err(format!("whisper falló: {}", err.trim()));
        }
        let texto = String::from_utf8_lossy(&salida.stdout);
        // whisper marca los silencios con cosas como [BLANK_AUDIO] o (música);
        // eso no lo ha dicho nadie y no puede acabar en el prompt.
        let limpio: String = texto
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty() && !l.starts_with('[') && !l.starts_with('('))
            .filter(|l| !es_alucinacion(l))
            .collect::<Vec<_>>()
            .join(" ");
        Ok(limpio.trim().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
