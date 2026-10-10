// Claude Code session scanner (proven logic:
// titles live near the tail as custom-title/ai-title/last-prompt lines, state
// is derived from the last real user/assistant message, live sessions are the
// ~/.claude/sessions/*.json files whose PID is still running).
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;
use tauri::State;
#[cfg(windows)]
use windows_sys::Win32::Foundation::CloseHandle;
#[cfg(windows)]
use windows_sys::Win32::System::Threading::{
    GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
};

// Titles and state markers sit near the end of the transcript; reading the
// whole file would mean loading 24 MB transcripts on every scan.
const TAIL_BYTES: u64 = 1_500_000;
const SLEEP_H: f64 = 48.0;
const DEAD_H: f64 = 24.0 * 7.0;
#[cfg(windows)]
const STILL_ACTIVE: u32 = 259;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub title: String,
    pub state: String,
    pub fresh: String,
    pub hours: f64,
    /// Cuándo cambió por última vez, en segundos: `hours` va redondeado a
    /// décimas y para saber si ya MIRASTE lo último hace falta el instante.
    pub mtime: u64,
    pub ago: String,
    pub cwd: String,
    pub resume_cwd: String,
    pub project: String,
    /// ~/.claude/projects subfolder holding the transcript (for rename).
    pub folder: String,
    pub live: bool,
    pub size_kb: u64,
    /// Subagents this session dispatched and has not got back yet, and the
    /// total it ever dispatched. Counted from the transcript, so it is exact.
    /// It used to live only in an open pane's header, which meant you had to
    /// open a session to find out whether it had a crew working inside.
    pub agents_live: u32,
    pub agents_total: u32,
    /// Qué cliente escribió esta sesión: `claude`, `codex`, `pi`… El Sidebar
    /// pinta su marca con esto, y sin él todas las sesiones parecían de Claude
    /// aunque no lo fueran. De primera clase: es lo que
    /// permite que un proyecto enseñe junto lo que ha pasado en él, lo abriera
    /// quien lo abriera.
    pub fuente: String,
    /// En qué cuenta se escribió: su `CLAUDE_CONFIG_DIR`, o vacío si es la de
    /// siempre. La barra lo usa para marcar la fila, y `onResume` para volver a
    /// abrirla donde vive: un `--resume` lanzado con otra cuenta no encuentra
    /// la conversación, porque cada cuenta tiene sus propios transcripts.
    pub cuenta: String,
}

#[derive(Default)]
pub struct SessionCache(pub Mutex<HashMap<PathBuf, (u64, u64, Option<SessionInfo>)>>);

fn claude_dir() -> Option<PathBuf> {
    crate::dir_casa().map(|h| h.join(".claude"))
}

/// TODAS las carpetas de configuración de Claude Code que hay en esta máquina:
/// la de siempre (`~/.claude`) y una por cada cuenta extra de Adeorq.
///
/// Una cuenta ES una carpeta (ver `accounts.rs`): el CLI arranca con
/// `CLAUDE_CONFIG_DIR` apuntando ahí y guarda dentro su login, sus proyectos y
/// sus transcripts. Este lector solo miraba `~/.claude`, así que todo lo que se
/// trabajaba con una segunda cuenta no aparecía en la barra: ni la sesión, ni
/// el proyecto, ni el punto verde de «está viva». Munir entró con una cuenta
/// nueva y su sesión no salía por ningún sitio (2026-08-06).
///
/// El `String` es ese mismo `CLAUDE_CONFIG_DIR`, y viaja hasta la interfaz para
/// dos cosas: pintar de quién es cada fila, y retomarla en SU cuenta (un
/// `--resume` en la cuenta equivocada no encuentra la conversación).
/// Vacío = la principal.
pub fn raices_claude() -> Vec<(String, PathBuf)> {
    let mut out = Vec::new();
    if let Some(d) = claude_dir() {
        out.push((String::new(), d));
    }
    for dir in crate::accounts::list_account_dirs() {
        // La carpeta de una cuenta de Codex o de Gemini también sale de ahí;
        // no se filtra por el nombre, que es un slug que escribe Munir: si
        // dentro no hay `projects` con transcripts, no aporta nada y ya está.
        let p = PathBuf::from(&dir);
        if p.join("projects").is_dir() || p.join("sessions").is_dir() {
            out.push((dir, p));
        }
    }
    out
}

/// La cola de los transcripts leídos hace poco, mientras el archivo no cambie.
///
/// Medido en esta máquina el 2026-08-31: 472 transcripts, 1,5 GB en total, y el
/// mayor de 227 MB. De cada uno se lee el último mega y medio, y eso se hacía
/// entero en CADA vuelta: con el Chat abierto son dos comandos distintos
/// (`session_messages` y `session_context`) leyendo EL MISMO archivo cada tres
/// segundos, más `session_activity` cada cinco. Tres megas por vuelta para
/// volver a partir en líneas exactamente lo mismo que la vez anterior.
///
/// La llave es (tamaño, fecha), la misma que usa `analyze`, y vale porque un
/// transcript solo CRECE: si no ha cambiado de tamaño ni de fecha, su cola es
/// la de antes byte a byte. Mientras el agente escribe, el tamaño cambia y se
/// relee, que es justo lo que se quiere.
///
/// Se guardan pocas a propósito: cada entrada puede ocupar su mega y medio, y
/// quien mira una conversación mira una, no doce. Lo que hay que evitar es
/// releer la misma tres veces en el mismo segundo.
///
/// Lo que ahorra, medido sobre el transcript más gordo de esta máquina (227 MB,
/// 2026-08-31): la primera lectura tarda **672 ms** y la segunda **249 µs**.
/// Esos 672 ms son un comando de Tauri bloqueado, y se pagaban dos veces cada
/// tres segundos por tener el Chat abierto.
static COLAS: Mutex<Vec<(PathBuf, u64, u64, Arc<Vec<String>>)>> = Mutex::new(Vec::new());
const COLAS_MAX: usize = 6;

fn read_tail(path: &Path) -> std::io::Result<Arc<Vec<String>>> {
    let meta = std::fs::metadata(path)?;
    let size = meta.len();
    // En segundos, como la de `analyze`: es gruesa, pero no viaja sola. Lo que
    // de verdad delata un transcript que ha crecido es el tamaño.
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    if let Ok(colas) = COLAS.lock() {
        if let Some((_, s, m, lineas)) = colas.iter().find(|(p, ..)| p == path) {
            if *s == size && *m == mtime {
                return Ok(Arc::clone(lineas));
            }
        }
    }

    let lineas = Arc::new(leer_cola(path, size)?);

    if let Ok(mut colas) = COLAS.lock() {
        colas.retain(|(p, ..)| p != path);
        colas.insert(0, (path.to_owned(), size, mtime, Arc::clone(&lineas)));
        colas.truncate(COLAS_MAX);
    }
    Ok(lineas)
}

/// El trabajo de verdad: el último trozo del archivo, partido en líneas. La
/// primera se tira cuando el corte cae a mitad: media línea de JSON no se puede
/// leer y ensuciaría todo lo que viniera detrás.
fn leer_cola(path: &Path, size: u64) -> std::io::Result<Vec<String>> {
    let mut f = std::fs::File::open(path)?;
    let mut data = Vec::new();
    if size > TAIL_BYTES {
        f.seek(SeekFrom::Start(size - TAIL_BYTES))?;
        f.read_to_end(&mut data)?;
        if let Some(cut) = data.iter().position(|&b| b == b'\n') {
            data.drain(..=cut);
        }
    } else {
        f.read_to_end(&mut data)?;
    }
    Ok(String::from_utf8_lossy(&data)
        .lines()
        .map(|l| l.to_owned())
        .collect())
}

/// La ventana de contexto de un modelo, en tokens.
///
/// Se decide por el NOMBRE del modelo, que es lo que la determina de verdad.
/// Antes se adivinaba por el gasto: 200k por defecto, y solo se pasaba al
/// millón cuando YA se habían gastado más de 200k. Con Sonnet 5, que tiene un
/// millón, el panel enseñaba un 60 % con 120k cargados cuando lo real era un
/// 12 %, y al cruzar los 200k el número se desplomaba de golpe en vez de subir.
///
/// Que el millón es real está medido en los transcripts de esta máquina, no
/// supuesto: hay una compactación AUTOMÁTICA disparada a 937.268 tokens, cosa
/// imposible en una ventana de 200k (2026-07-31).
fn context_window(model: &str) -> u64 {
    // La marca explícita gana a cualquier tabla.
    if model.contains("[1m]") {
        return 1_000_000;
    }
    // Haiku es el único de la hornada actual que se queda en 200k.
    if model.contains("haiku") {
        return 200_000;
    }
    const GRANDES: [&str; 8] = [
        "opus-5", "opus-4-6", "opus-4-7", "opus-4-8", "sonnet-5", "sonnet-4-6", "fable-5",
        "mythos-5",
    ];
    if GRANDES.iter().any(|m| model.contains(m)) {
        return 1_000_000;
    }
    // Lo que no está en la tabla: el valor conservador. Enseñar de más asusta
    // menos que enseñar de menos, porque el aviso salta antes y no después.
    200_000
}

#[cfg(windows)]
fn pid_alive(pid: u32) -> bool {
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return false;
        }
        let mut code: u32 = 0;
        let ok = GetExitCodeProcess(h, &mut code);
        CloseHandle(h);
        ok != 0 && code == STILL_ACTIVE
    }
}

/// Lo mismo en Linux, y aquí es una pregunta al sistema de archivos: `/proc`
/// tiene una carpeta por proceso vivo y deja de tenerla en cuanto muere. No
/// hace falta abrir un handle ni pedir permiso para mirar.
#[cfg(not(windows))]
fn pid_alive(pid: u32) -> bool {
    std::path::Path::new(&format!("/proc/{pid}")).exists()
}

fn live_session_ids() -> HashSet<String> {
    let mut live = HashSet::new();
    // Cada cuenta lleva su propio registro de sesiones vivas, así que se miran
    // todas: si no, una conversación abierta con la segunda cuenta nunca se
    // marcaría como viva y Adeorq dejaría abrirla dos veces, que es justo lo
    // que la cuelga (ver `onResume` en App.tsx).
    for (_, raiz) in raices_claude() {
        let Ok(entries) = std::fs::read_dir(raiz.join("sessions")) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(text) = std::fs::read_to_string(entry.path()) else {
                continue;
            };
            let Ok(v) = serde_json::from_str::<Value>(&text) else {
                continue;
            };
            let sid = v["sessionId"].as_str().unwrap_or_default();
            let pid = v["pid"].as_u64().unwrap_or(0) as u32;
            if !sid.is_empty() && pid != 0 && pid_alive(pid) {
                live.insert(sid.to_owned());
            }
        }
    }
    live
}

/// Cuánto hace, DESNUDO: «19 min», «23 h», «1 día», «9 días».
///
/// Sin el «hace» delante, y no es un descuido. La barra pone treinta y tres de
/// estos en columna, uno debajo de otro, y esa palabra se repetía treinta y
/// tres veces sin distinguir ninguna fila de la de al lado: solo robaba el
/// ancho que necesita el título, que es lo único que sirve para elegir una
/// conversación (Munir, 2026-08-09, con la lista delante). Donde la frase sí
/// la necesita para leerse bien, la pone quien escribe la frase.
fn ago_text(hours: f64) -> String {
    if hours < 1.0 {
        return format!("{} min", (hours * 60.0).max(1.0) as u32);
    }
    if hours < 24.0 {
        return format!("{} h", hours as u32);
    }
    // «d», como «min» y «h»: se lee igual con la app en inglés, que es donde
    // «1 día» salía sin traducir en la barra, la Agenda y Abrir una sesión.
    format!("{} d", (hours / 24.0) as u32)
}

fn clean(text: &str, max: usize) -> String {
    let t = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if t.chars().count() > max {
        let cut: String = t.chars().take(max - 1).collect();
        format!("{}…", cut)
    } else {
        t
    }
}

// Claude Code stores each transcript under ~/.claude/projects/<encoded cwd>,
// where every non-alphanumeric character becomes "-" (C:\proyectos\Layco ->
// C--proyectos-Layco). `claude --resume <id>` only finds the session when run
// from that exact directory, so a session whose last message ran in a
// subfolder must be resumed from the directory matching its transcript folder.
fn encode_claude(path: &str) -> String {
    path.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

// Walk the disk to undo the encoding. "-" is ambiguous (it can be a path
// separator OR a literal dash, as in VoCript-Core), so try both and let the
// filesystem decide, backtracking when a branch is a dead end.
fn rebuild_from_disk(base: &Path, tokens: &[&str]) -> Option<PathBuf> {
    if tokens.is_empty() {
        return Some(base.to_path_buf());
    }
    for take in 1..=tokens.len() {
        let name = tokens[..take].join("-");
        if name.is_empty() {
            continue;
        }
        let candidate = base.join(&name);
        if candidate.is_dir() {
            if let Some(found) = rebuild_from_disk(&candidate, &tokens[take..]) {
                return Some(found);
            }
        }
    }
    None
}

/// El separador de rutas de ESTE sistema.
#[cfg(windows)]
const SEP: char = '\\';
#[cfg(not(windows))]
const SEP: char = '/';

/// Una ruta escrita como la escribe este sistema, sin barra final.
///
/// En Windows se convierten las barras normales, porque Claude Code escribe
/// algunos `cwd` con `/` y sin esto la subida por el árbol no encontraba
/// separador. En Linux NO se toca nada: allí una contrabarra es un carácter
/// válido dentro de un nombre de archivo, y "arreglarla" partiría el nombre.
fn normalizar(p: &str) -> String {
    let limpio = p.trim_end_matches(['\\', '/']);
    if cfg!(windows) {
        limpio.replace('/', "\\")
    } else {
        limpio.to_owned()
    }
}

fn decode_folder(folder: &str) -> Option<String> {
    // Dos formas, según de dónde venga el transcript:
    // · Windows, con la unidad delante: "C--proyectos-..." es C:\proyectos\...
    // · Linux, donde la ruta empieza por barra y la barra se codifica igual que
    //   todo lo demás, así que la carpeta empieza por un guion: "-home-munir-".
    let mut chars = folder.chars();
    let primero = chars.next()?;
    let (root, resto) = if primero == '-' {
        ("/".to_owned(), &folder[1..])
    } else if primero.is_ascii_alphabetic() && folder[1..].starts_with("--") {
        (format!("{primero}:\\"), &folder[3..])
    } else {
        return None;
    };
    // Una raíz a secas ("C--" o "-") es una sesión abierta en la raíz.
    let tokens: Vec<&str> = resto.split('-').filter(|t| !t.is_empty()).collect();
    if tokens.is_empty() {
        return (encode_claude(&root) == folder).then_some(root);
    }
    let found = rebuild_from_disk(Path::new(&root), &tokens)?;
    let path = found.to_string_lossy().trim_end_matches('\\').to_owned();
    // Only trust it if it re-encodes to exactly the folder we started from.
    (encode_claude(&path) == folder).then_some(path)
}

fn resume_dir(cwd: &str, folder: &str) -> String {
    // Fast path: the session's own cwd (or one of its parents) already matches.
    // Claude Code writes some cwds with forward slashes ("C:/proyectos/..."),
    // and without normalising them the walk up the tree found no separator and
    // resumed from a subfolder: that was the "No conversation found" bug.
    if !cwd.is_empty() {
        let mut probe = normalizar(cwd);
        loop {
            if encode_claude(&probe) == folder {
                return probe;
            }
            // El tope es la raíz: en Windows `C:\` ocupa tres, así que cortar
            // por debajo del índice 2 dejaría `C:` a secas; en Linux la raíz es
            // la barra del principio y cortar en cero dejaría la cadena vacía.
            let minimo = if cfg!(windows) { 2 } else { 0 };
            match probe.rfind(SEP) {
                Some(i) if i > minimo => probe.truncate(i),
                _ => break,
            }
        }
    }
    // The cwd was a PARENT of the transcript folder (a session that ran in a
    // subfolder), so truncating never reaches it: rebuild the folder instead.
    // This is what used to fail with "No conversation found".
    decode_folder(folder).unwrap_or_else(|| cwd.to_owned())
}

/// `raiz` is the projects folder the user chose in the onboarding, so a session
/// opened inside it lands in ITS project row and everything else drops into the
/// loose drawer. It used to be the constant `C:\proyectos`, which meant that on
/// any other computer every single session looked loose.
fn project_of(cwd: &str, folder: &str, raiz: &str) -> String {
    if !cwd.is_empty() {
        let c = normalizar(cwd);
        let low = c.to_lowercase();
        let base_real = normalizar(raiz);
        let base = base_real.to_lowercase();
        if !base.is_empty() {
            if low == base {
                return format!("{base_real} (raíz)");
            }
            if low.starts_with(&format!("{base}{SEP}")) {
                // Se corta `c` (capitalización original) con la longitud de la
                // MINÚSCULA solo si miden lo mismo: `to_lowercase` no conserva
                // los bytes para todos los caracteres (İ son 2 y su minúscula
                // 3), y con una raíz así el corte caía a mitad de carácter y
                // reventaba el escaneo entero de sesiones. Si difieren, se
                // corta con la longitud real, que para un prefijo que acaba de
                // casar insensible a mayúsculas es la del propio `raiz`.
                let corte = if base.len() == base_real.len() { base.len() } else { base_real.len() };
                let rest = c.get(corte + 1..).unwrap_or("");
                if !rest.is_empty() {
                    return rest.split(SEP).next().unwrap_or(rest).to_owned();
                }
            }
        }
        return c.rsplit(SEP).next().unwrap_or(&c).to_owned();
    }
    // Sin `cwd` no queda más que deshacer el nombre de la carpeta a ojo.
    if cfg!(windows) {
        folder.replacen("C--", "C:\\", 1).replace('-', "\\")
    } else {
        folder.replace('-', "/")
    }
}

fn analyze(path: &Path, folder: &str, cache: &SessionCache) -> Option<SessionInfo> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime = meta
        .modified()
        .ok()?
        .duration_since(SystemTime::UNIX_EPOCH)
        .ok()?
        .as_secs();
    let size = meta.len();

    if let Some((m, s, cached)) = cache.0.lock().unwrap().get(path) {
        if *m == mtime && *s == size {
            return cached.clone();
        }
    }

    let result = analyze_uncached(path, folder, mtime, size);
    cache
        .0
        .lock()
        .unwrap()
        .insert(path.to_owned(), (mtime, size, result.clone()));
    result
}

/// True for a transcript that is nothing but one of Adeorq's own `/usage`
/// probes. Those calls are how the usage panel reads the plan for free, but
/// each one filed a session, and one night of them buried Munir's real work
/// under 59 untitled rows. They are deleted at the source now; this keeps the
/// ones already on disk, and any that escape, out of the list.
fn is_own_usage_probe(lines: &[String]) -> bool {
    // Real work is long. A probe is a handful of metadata lines.
    if lines.len() > 12 {
        return false;
    }
    let mut saw_usage = false;
    for line in lines {
        if line.contains("<command-name>/usage</command-name>") {
            saw_usage = true;
        }
        // Anything the model actually said means it was a real session.
        if line.contains("\"type\":\"assistant\"") {
            return false;
        }
    }
    saw_usage
}

/// El valor de una clave en una línea JSON, sin parsearla entera.
///
/// Se mira línea a línea de todos los transcripts en cada barrido, así que
/// montar un `Value` por línea para leer un campo saldría caro: aquí basta con
/// buscar la clave y quedarse con lo que hay hasta la siguiente comilla.
fn valor_json<'a>(linea: &'a str, clave: &str) -> Option<&'a str> {
    let desde = linea.find(clave)? + clave.len();
    let resto = &linea[desde..];
    Some(&resto[..resto.find('"')?])
}

/// Cierto para un transcript que no abrió una persona, sino un programa.
///
/// Cada `claude -p` que lanza Adeorq (los planes del Capataz, los encargos, los
/// mapas del Esquema, las sondas de cuota) archiva su sesión en
/// `~/.claude/projects` igual que una de verdad, y el panel las enseñaba con el
/// prompt de título: «Eres el Capataz…», «Te doy las piezas…», «Te dan el
/// esqueleto…». El 2026-08-14 eran 57 de 113 transcripts en la máquina de
/// Munir, más de la mitad de su lista.
///
/// Desde ese día el Capataz les pone nombre propio y las borra al terminar
/// (`foreman.rs`, `SinRastro`), pero eso solo vale para las que vengan: esto
/// tapa las que ya están en disco, y de paso las de cualquier otra herramienta
/// que use el CLI por debajo.
///
/// La marca la pone el propio Claude Code y no hay que adivinarla: la sesión
/// dice por dónde nació en `entrypoint`, y solo las que empiezan por `sdk`
/// (`sdk-cli`) las abrió un programa. Se mira eso y no el título, porque un
/// título se puede parecer por casualidad y el origen no.
///
/// ⚠ `sdk` y no «lo que no sea `cli`», que fue el primer intento y estuvo a
/// punto de borrarle media lista: sus sesiones de la app de escritorio de
/// Claude se archivan en la MISMA carpeta y llevan `"claude-desktop"`. Medido
/// antes de darlo por bueno: con la regla ancha desaparecían 57 transcripts,
/// pero entre ellos «SESION SUPREMA», «ORQUIO REGISTRO DE MARCA» o «VoCript
/// General», que son trabajo suyo de verdad.
///
/// Y no basta con cómo nació: hace falta que nadie haya escrito dentro. Una de
/// estas sesiones (`51c25bc6…`) la abrió el Capataz para planificar y Munir
/// siguió trabajando en ella desde una terminal («go», «si dale, los pequeños
/// solo», «queda mucho?»), justamente porque el panel se la ofrecía para
/// retomar. Un solo mensaje tecleado la convierte en suya para siempre.
///
/// Si no hay marca (transcripts de versiones viejas), se enseña: ante la duda,
/// la sesión es de Munir.
fn es_de_programa(lines: &[String]) -> bool {
    let mut nacio_de_programa = None;
    for line in lines {
        // Nada de lo que venga después puede desmentir que esto es suyo.
        if line.contains("\"promptSource\":\"typed\"") {
            return false;
        }
        // La primera marca manda: es cómo NACIÓ la sesión.
        if nacio_de_programa.is_none() {
            if let Some(v) = valor_json(line, "\"entrypoint\":\"") {
                nacio_de_programa = Some(v.starts_with("sdk"));
            }
        }
    }
    nacio_de_programa.unwrap_or(false)
}

fn analyze_uncached(path: &Path, folder: &str, mtime: u64, size: u64) -> Option<SessionInfo> {
    let lines = read_tail(path).ok()?;
    if lines.is_empty() || is_own_usage_probe(&lines) || es_de_programa(&lines) {
        return None;
    }

    let mut custom_title = String::new();
    let mut ai_title = String::new();
    let mut last_prompt = String::new();
    for line in lines.iter().rev() {
        if custom_title.is_empty() && line.contains("\"type\":\"custom-title\"") {
            if let Ok(v) = serde_json::from_str::<Value>(line) {
                custom_title = v["customTitle"].as_str().unwrap_or_default().to_owned();
            }
        } else if ai_title.is_empty() && line.contains("\"type\":\"ai-title\"") {
            if let Ok(v) = serde_json::from_str::<Value>(line) {
                ai_title = v["aiTitle"].as_str().unwrap_or_default().to_owned();
            }
        } else if last_prompt.is_empty() && line.contains("\"type\":\"last-prompt\"") {
            if let Ok(v) = serde_json::from_str::<Value>(line) {
                last_prompt = v["lastPrompt"].as_str().unwrap_or_default().to_owned();
            }
        }
    }

    let Some((cwd, state)) = last_message_state(&lines) else {
        // metadata-only transcript: a subagent sidechain or an empty session
        return None;
    };

    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(mtime);
    let hours = (now.saturating_sub(mtime)) as f64 / 3600.0;
    let fresh = if hours < SLEEP_H {
        "activa"
    } else if hours < DEAD_H {
        "dormida"
    } else {
        "muerta"
    };

    let title_raw = if !custom_title.is_empty() {
        custom_title
    } else if !ai_title.is_empty() {
        ai_title
    } else if !last_prompt.is_empty() {
        last_prompt
    } else {
        "(sin título)".into()
    };

    // Same rule as an open pane: a transcript nobody has touched in five
    // minutes cannot have workers still out, or an abandoned session would
    // show ghosts for ever.
    let recent = now.saturating_sub(mtime) < AGENTS_STALE_S;
    let (agents_live, agents_total) = count_agents(&lines, recent);

    Some(SessionInfo {
        id: path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default(),
        title: clean(&title_raw, 90),
        state,
        fresh: fresh.into(),
        hours: (hours * 10.0).round() / 10.0,
        mtime,
        ago: ago_text(hours),
        project: project_of(&cwd, folder, ""),
        resume_cwd: resume_dir(&cwd, folder),
        folder: folder.to_owned(),
        cwd,
        live: false,
        size_kb: size / 1024,
        agents_live,
        agents_total,
        fuente: "claude".into(),
        // La pone `scan_sessions`, que es quien sabe de qué carpeta salió.
        cuenta: String::new(),
    })
}

// `async` no es adorno, en este archivo y en los demás comandos que leen
// disco: un comando de Tauri SIN async corre en el hilo principal de la
// ventana, así que cada lectura de transcript (hasta 1,5 MB + parseo) dejaba
// la app entera congelada mientras duraba. Y estos se llaman en bucle: el
// panel de sesiones cada 45–60 s y cada terminal Claude cada 6–20 s, que es
// exactamente el «se congela todo el rato» que se veía. Con async, Tauri los
// manda a un hilo aparte y la ventana ni se entera.
#[tauri::command]
pub async fn scan_sessions(
    cache: State<'_, SessionCache>,
    raiz: Option<String>,
    sin_raiz: Option<bool>,
) -> Result<Vec<SessionInfo>, String> {
    let raices = raices_claude();
    if raices.is_empty() {
        return Err("no sé cuál es tu carpeta de usuario".into());
    }
    let live = live_session_ids();
    let mut out = Vec::new();

    // Una vuelta por la cuenta de siempre y otra por cada cuenta extra. Las
    // sesiones van todas al mismo saco, como las de Codex: un proyecto enseña
    // su día entero, y de quién es cada una lo dice su marca en la fila.
    for (cuenta, raiz) in &raices {
        out.extend(escanear_raiz(raiz, cuenta, &cache, &live));
    }
    // Y las de los otros clientes, que van al mismo saco a propósito: el panel
    // ordena por proyecto y por antigüedad, no por quién las abrió, así que un
    // proyecto enseña su día entero de una vez.
    out.extend(scan_codex());
    out.extend(scan_pi());
    // Los títulos que Munir les puso desde Adeorq a las de Codex y Pi: sus
    // ficheros los escribe el otro CLI, así que el título va aparte (ver
    // `titulos_propios`). Las de Claude llevan el suyo dentro del transcript.
    let propios = titulos_propios();
    if !propios.is_empty() {
        for s in out.iter_mut() {
            if let Some(t) = propios.get(&s.id) {
                s.title = clean(t, 90);
            }
        }
    }

    // El proyecto se decide AQUÍ y no dentro de `analyze`, que va por caché:
    // si se cacheara, cambiar la carpeta de proyectos en Ajustes no movería de
    // sitio ni una sesión hasta que su transcript volviera a crecer.
    // Sin carpeta madre, la base va vacía a propósito: `project_of` nombra
    // entonces cada sesión por SU carpeta, que es justo lo que hace falta
    // cuando no hay una carpeta que contenga a las demás.
    let base = if sin_raiz == Some(true) {
        String::new()
    } else {
        crate::workspace::raiz_de(raiz).to_string_lossy().into_owned()
    };
    for info in &mut out {
        info.project = project_of(&info.cwd, &info.folder, &base);
    }

    out.sort_by(|a, b| {
        a.hours
            .partial_cmp(&b.hours)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(out)
}

/// Los transcripts de UNA carpeta de configuración: `<raiz>/projects/<cwd>/*.jsonl`.
///
/// Aparte del comando para poder probarla con una carpeta de mentira: lo que
/// hay que demostrar de este arreglo es justo esto, que una raíz que no sea
/// `~/.claude` se lee igual y que sus sesiones salen firmadas con su cuenta.
fn escanear_raiz(
    raiz: &Path,
    cuenta: &str,
    cache: &SessionCache,
    live: &HashSet<String>,
) -> Vec<SessionInfo> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(raiz.join("projects")) else {
        return out;
    };
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let folder = entry.file_name().to_string_lossy().into_owned();
        let Ok(files) = std::fs::read_dir(&dir) else {
            continue;
        };
        for file in files.flatten() {
            let path = file.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            if let Some(mut info) = analyze(&path, &folder, cache) {
                info.live = live.contains(&info.id);
                // Fuera de `analyze`, que va por caché de archivo: la cuenta la
                // decide DÓNDE está el transcript, no lo que ponga dentro.
                info.cuenta = cuenta.to_owned();
                out.push(info);
            }
        }
    }
    out
}

fn codex_dir() -> Option<PathBuf> {
    crate::dir_casa().map(|h| h.join(".codex").join("sessions"))
}

/// Las sesiones de Codex, que hasta ahora no salían en ningún sitio.
///
/// Un proyecto debería enseñar TODO lo que ha pasado en él, lo abriera quien lo
/// abriera; antes solo se miraba `~/.claude/projects`, así que abrir Codex
/// dentro de un proyecto y volver al panel era como si no hubiera pasado nada
/// (Munir, 2026-07-30).
///
/// Codex guarda un `.jsonl` por sesión en `~/.codex/sessions/AAAA/MM/DD/`, y su
/// PRIMERA línea es un `session_meta` con el `cwd` y el `session_id`, que es
/// justo lo que hace falta. De los demás CLIs no se puede hacer esto y no es un
/// olvido: se miró el disco el 2026-07-30 y Gemini solo guarda con `/chat save`
/// (su carpeta estaba vacía), y Qwen, Copilot y Crush no dejan historial
/// legible. Cuando alguno empiece a guardarlo, se añade aquí al lado.
/// Dónde se guardan los títulos puestos desde Adeorq a sesiones que no son de
/// Claude (`<dir_datos>/titulos.json`, id → título). A un transcript de Claude
/// se le añade una línea `custom-title` y su CLI la entiende; al de Codex o Pi
/// no se le puede escribir nada, que es de su programa. Antes renombrar una de
/// esas fallaba igual que fallaba borrarla (bandeja, 2026-08).
fn ruta_titulos() -> Option<PathBuf> {
    crate::dir_datos().ok().map(|d| d.join("titulos.json"))
}

pub fn titulos_propios() -> HashMap<String, String> {
    ruta_titulos()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn guardar_titulo_propio(session_id: &str, titulo: &str) -> Result<(), String> {
    let ruta = ruta_titulos().ok_or("no sé dónde guardar los títulos")?;
    let mut todos = titulos_propios();
    if titulo.trim().is_empty() {
        todos.remove(session_id);
    } else {
        todos.insert(session_id.to_string(), titulo.trim().to_string());
    }
    let texto = serde_json::to_string_pretty(&todos).map_err(|e| e.to_string())?;
    if let Some(dir) = ruta.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = ruta.with_extension("tmp");
    std::fs::write(&tmp, texto).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &ruta).map_err(|e| e.to_string())
}

fn scan_codex() -> Vec<SessionInfo> {
    let Some(raiz) = codex_dir() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    // AAAA/MM/DD: tres niveles, y se recorren a pelo en vez de con una
    // recursión general para no acabar paseando por un árbol ajeno entero.
    for anyo in leer_dirs(&raiz) {
        for mes in leer_dirs(&anyo) {
            for dia in leer_dirs(&mes) {
                let Ok(ficheros) = std::fs::read_dir(&dia) else {
                    continue;
                };
                for f in ficheros.flatten() {
                    let path = f.path();
                    if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                        continue;
                    }
                    if let Some(info) = analyze_codex(&path) {
                        out.push(info);
                    }
                }
            }
        }
    }
    out
}

fn leer_dirs(dir: &Path) -> Vec<PathBuf> {
    std::fs::read_dir(dir)
        .map(|e| e.flatten().map(|x| x.path()).filter(|p| p.is_dir()).collect())
        .unwrap_or_default()
}

/// El archivo de una sesión de Codex a partir de su id.
///
/// Hace falta porque Codex NO organiza por proyecto: guarda por fecha, en
/// `~/.codex/sessions/AAAA/MM/DD/`, y el nombre del archivo lo pone él (lleva la
/// hora dentro), así que no se puede componer la ruta como en Claude. El id solo
/// aparece DENTRO, en el `session_meta` de la primera línea.
///
/// Por eso borrar una sesión de Codex no hacía nada: `delete_session` armaba
/// `~/.claude/projects/<carpeta>/<id>.jsonl` con la carpeta vacía, no encontraba
/// el archivo, y la sesión seguía en la lista al siguiente repaso del disco
/// (Munir, 2026-08-08: «las sesiones de otros proveedores como codex no se
/// eliminan cuando le das»).
///
/// Se recorren los mismos tres niveles que `scan_codex` y se lee UNA línea por
/// archivo, que es lo que cuesta menos: la cabecera trae el id.
pub fn codex_transcript(session_id: &str) -> Option<PathBuf> {
    codex_transcript_en(&codex_dir()?, session_id)
}

/// La búsqueda de verdad, con la raíz por parámetro.
///
/// Separada solo para poder probarla: la de arriba saca la carpeta de
/// `USERPROFILE`, y un test que cambiara esa variable la cambiaría para TODOS
/// los que corren a la vez en el mismo proceso (le pasó a los de `secrets.rs`).
fn codex_transcript_en(raiz: &Path, session_id: &str) -> Option<PathBuf> {
    for anyo in leer_dirs(raiz) {
        for mes in leer_dirs(&anyo) {
            for dia in leer_dirs(&mes) {
                let Ok(ficheros) = std::fs::read_dir(&dia) else {
                    continue;
                };
                for f in ficheros.flatten() {
                    let path = f.path();
                    if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                        continue;
                    }
                    let Some(cabecera) = primera_linea(&path) else {
                        continue;
                    };
                    let Ok(v) = serde_json::from_str::<Value>(&cabecera) else {
                        continue;
                    };
                    if v["payload"]["session_id"].as_str() == Some(session_id) {
                        return Some(path);
                    }
                }
            }
        }
    }
    None
}

/// El hilo de Codex que nació en esa carpeta a partir de ese momento.
///
/// Codex no acepta un id al abrirse (se lo pone él en su rollout), así que un
/// panel recién abierto no sabe qué sesión es y no podía ni retomarla ni
/// guardarla para el día siguiente. Esto la aprende mirando el disco. Tres
/// cosas que no son opinables, leídas en los rollouts de verdad de esta
/// máquina el 2026-10-06:
///
///  · Solo hilos PRINCIPALES. Codex escribe un rollout por cada subagente y por
///    cada revisión «guardian», todos con el mismo `cwd` y con
///    `parent_thread_id` puesto; el que se retoma es el padre.
///  · Se compara la hora de NACER (`payload.timestamp`), no la del fichero: la
///    del fichero cambia con cada turno, y una sesión de ayer en esa carpeta
///    que siga escribiendo pasaría por nueva.
///  · Gana el MÁS VIEJO de los que nacieron después de `desde`, no el más
///    nuevo: dos paneles abiertos seguidos en la misma carpeta se llevan cada
///    uno el suyo, porque el de un panel es el primero que nace después de él.
pub fn codex_session_since_en(raiz: &Path, cwd: &str, desde: u64) -> Option<String> {
    let mut mejor: Option<(u64, String)> = None;
    for anyo in leer_dirs(raiz) {
        for mes in leer_dirs(&anyo) {
            for dia in leer_dirs(&mes) {
                let Ok(ficheros) = std::fs::read_dir(&dia) else {
                    continue;
                };
                for f in ficheros.flatten() {
                    let path = f.path();
                    if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                        continue;
                    }
                    // Un fichero que nadie ha tocado desde antes de `desde` no
                    // puede ser de este panel: se ahorra leerlo.
                    let tocado = f
                        .metadata()
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs());
                    if tocado.is_some_and(|t| t < desde) {
                        continue;
                    }
                    let Some(cabecera) = primera_linea(&path) else {
                        continue;
                    };
                    let Ok(v) = serde_json::from_str::<Value>(&cabecera) else {
                        continue;
                    };
                    if v["type"].as_str() != Some("session_meta") {
                        continue;
                    }
                    let p = &v["payload"];
                    if p["cwd"].as_str() != Some(cwd) || !p["parent_thread_id"].is_null() {
                        continue;
                    }
                    let Some(nacio) = p["timestamp"].as_str().and_then(iso_a_segundos) else {
                        continue;
                    };
                    if nacio < desde {
                        continue;
                    }
                    let Some(id) = p["id"].as_str().or(p["session_id"].as_str()) else {
                        continue;
                    };
                    if mejor.as_ref().is_none_or(|(n, _)| nacio < *n) {
                        mejor = Some((nacio, id.to_owned()));
                    }
                }
            }
        }
    }
    mejor.map(|(_, id)| id)
}

/// `2026-09-22T20:22:52.825Z` → segundos desde 1970. Solo lo que escribe Codex
/// (UTC con `Z`); cualquier otra cosa es `None`, y mejor no aprender nada que
/// aprender la sesión de otro. Sin `chrono`: son veinte líneas y un test.
fn iso_a_segundos(s: &str) -> Option<u64> {
    let s = s.strip_suffix('Z')?;
    let (fecha, hora) = s.split_once('T')?;
    let mut f = fecha.split('-').map(|x| x.parse::<i64>().ok());
    let (y, m, d) = (f.next()??, f.next()??, f.next()??);
    let hora = hora.split('.').next()?;
    let mut h = hora.split(':').map(|x| x.parse::<i64>().ok());
    let (hh, mm, ss) = (h.next()??, h.next()??, h.next()??);
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) || hh > 23 || mm > 59 || ss > 60 {
        return None;
    }
    // Días desde 1970 (Howard Hinnant, «days_from_civil»).
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let dias = era * 146097 + doe - 719468;
    u64::try_from(dias * 86400 + hh * 3600 + mm * 60 + ss).ok()
}

/// Para el panel: la sesión de Codex que nació en `cwd` desde `since`
/// (segundos de época), o nada todavía.
#[tauri::command(async)]
pub fn codex_session_since(cwd: String, since: u64) -> Option<String> {
    codex_session_since_en(&codex_dir()?, &cwd, since)
}

fn analyze_codex(path: &Path) -> Option<SessionInfo> {
    let meta = std::fs::metadata(path).ok()?;
    let size = meta.len();
    let mtime = meta
        .modified()
        .ok()?
        .duration_since(SystemTime::UNIX_EPOCH)
        .ok()?
        .as_secs();

    let lines = read_tail(path).ok()?;
    // La cabecera está en la PRIMERA línea, y `read_tail` puede haber cortado
    // por arriba en una sesión larga. Se lee aparte, que son cuatro campos.
    let cabecera = primera_linea(path)?;
    let v: Value = serde_json::from_str(&cabecera).ok()?;
    if v["type"].as_str() != Some("session_meta") {
        return None;
    }
    let cwd = v["payload"]["cwd"].as_str().unwrap_or_default().to_owned();
    let id = v["payload"]["session_id"].as_str().unwrap_or_default().to_owned();
    if cwd.is_empty() || id.is_empty() {
        return None;
    }

    let titulo = codex_titulo(&lines);

    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(mtime);
    let hours = (now.saturating_sub(mtime)) as f64 / 3600.0;
    let fresh = if hours < SLEEP_H {
        "activa"
    } else if hours < DEAD_H {
        "dormida"
    } else {
        "muerta"
    };

    Some(SessionInfo {
        id,
        title: clean(if titulo.is_empty() { "(sin título)" } else { &titulo }, 90),
        // Codex no deja escrito si terminó su turno o te está esperando, así
        // que se declara vacío, que en la interfaz es «no tocar». Inventarse un
        // estado sería peor: el Capataz decide con esto.
        state: String::new(),
        fresh: fresh.into(),
        hours: (hours * 10.0).round() / 10.0,
        mtime,
        ago: ago_text(hours),
        project: project_of(&cwd, "", ""),
        resume_cwd: cwd.clone(),
        folder: String::new(),
        cwd,
        // Codex no publica en ningún sitio qué sesiones tiene vivas, así que
        // nunca se pinta en verde. Mejor callar que mentir.
        live: false,
        size_kb: size / 1024,
        agents_live: 0,
        agents_total: 0,
        fuente: "codex".into(),
        cuenta: String::new(),
    })
}

/// El título de una sesión de Codex: lo primero que le escribió el usuario.
///
/// Va por los `event_msg` de tipo `user_message`, que traen el texto limpio, y
/// NO por los `response_item` de rol `user`: el primero de esos es un
/// `<environment_context>` que mete el propio CLI con el cwd y el shell, y sería
/// lo que saldría en la lista de todas las sesiones.
fn codex_titulo(lines: &[String]) -> String {
    for line in lines {
        if !line.contains("\"user_message\"") {
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if v["payload"]["type"].as_str() != Some("user_message") {
            continue;
        }
        let m = v["payload"]["message"].as_str().unwrap_or_default().trim();
        // Los bloques que se mete el CLI a sí mismo empiezan por `<`.
        if m.is_empty() || m.starts_with('<') {
            continue;
        }
        // Un turno de solo imágenes pegadas llega como «[Image #1] [Image #2]…»
        // y como título no dice nada: se pasa al siguiente, que es donde suele
        // estar lo que pedía. Visto en el disco de Munir el 2026-07-31.
        if solo_imagenes(m) {
            continue;
        }
        return m.to_owned();
    }
    String::new()
}

/// ¿El mensaje es solo marcadores de imagen pegada, sin nada escrito?
fn solo_imagenes(m: &str) -> bool {
    let resto: String = m
        .split(']')
        .filter_map(|t| t.split_once('[').map(|(antes, _)| antes).or(Some(t)))
        .collect::<Vec<_>>()
        .join(" ");
    // Lo que quede fuera de los corchetes; si no hay nada, era solo imágenes.
    let limpio = resto.trim();
    m.contains("[Image") && limpio.is_empty()
}

fn primera_linea(path: &Path) -> Option<String> {
    use std::io::{BufRead, BufReader};
    let f = std::fs::File::open(path).ok()?;
    BufReader::new(f).lines().next()?.ok()
}

fn pi_agent_dir() -> Option<PathBuf> {
    // Calca `getAgentDir()` de Pi (`packages/coding-agent/src/config.ts`,
    // citado en el proveedor `pi` de `src/lib/providers.ts`): la variable
    // gana, y solo si no está puesta cae en `~/.pi/agent`.
    if let Ok(dir) = std::env::var("PI_CODING_AGENT_DIR") {
        if !dir.is_empty() {
            return Some(PathBuf::from(dir));
        }
    }
    crate::dir_casa().map(|h| h.join(".pi").join("agent"))
}

/// Las sesiones de Pi (pi.dev), organizadas por carpeta de trabajo dentro de
/// `~/.pi/agent/sessions/` (o donde apunte `PI_CODING_AGENT_DIR`).
///
/// VERIFICADO EN DISCO el 2026-08-12, que hasta hoy no lo estaba: esto se
/// escribió a ciegas, calcado de Claude Code y Codex, porque Pi no estaba
/// instalado en esta máquina. Ya lo está, y las tres preguntas que dejó
/// abiertas el comentario de entonces tienen respuesta:
///
///  1. la extensión es `.jsonl`, una línea por evento;
///  2. el cwd viene en la PRIMERA línea, con la clave `cwd` tal cual
///     (`{"type":"session","version":3,"id":"…","timestamp":"…","cwd":"C:\\proyectos"}`);
///  3. la subcarpeta es el cwd codificado a la manera de Pi
///     (`C:\proyectos` → `--C--proyectos--`), y el nombre del fichero es la
///     marca de tiempo, un guion bajo y el id.
///
/// O sea que las suposiciones eran buenas y el escaneo funciona. Se deja
/// igual de defensivo (sin cwd o sin id, la sesión se descarta) porque un
/// formato leído una vez en una versión no es un formato garantizado.
///
/// ⚠ Lo que NO se puede componer es la ruta de un fichero a partir de su id,
/// porque el nombre lleva delante la marca de tiempo: hay que BUSCARLA, igual
/// que en Codex. Eso vive en `pi_transcript`, y su ausencia es lo que hacía
/// que la papelera no borrara estas sesiones.
fn scan_pi() -> Vec<SessionInfo> {
    let Some(raiz) = pi_agent_dir().map(|d| d.join("sessions")) else {
        return Vec::new();
    };
    if !raiz.is_dir() {
        return Vec::new();
    }
    let mut out = Vec::new();
    // Ficheros sueltos directamente en `sessions/`, por si Pi no anida por
    // proyecto…
    if let Ok(ficheros) = std::fs::read_dir(&raiz) {
        for f in ficheros.flatten() {
            if let Some(info) = analyze_pi_candidato(&f.path()) {
                out.push(info);
            }
        }
    }
    // …y un nivel de subcarpetas, que es la lectura más probable de
    // "organizadas por carpeta de trabajo" (un proyecto = una subcarpeta,
    // como en `~/.claude/projects`). No se baja más hondo que esto: para un
    // formato que no se ha visto nunca, mejor no encontrar nada que pasear
    // por un árbol ajeno con una recursión general.
    for proyecto in leer_dirs(&raiz) {
        let Ok(ficheros) = std::fs::read_dir(&proyecto) else {
            continue;
        };
        for f in ficheros.flatten() {
            if let Some(info) = analyze_pi_candidato(&f.path()) {
                out.push(info);
            }
        }
    }
    out
}

fn analyze_pi_candidato(path: &Path) -> Option<SessionInfo> {
    let ext = path.extension().and_then(|e| e.to_str());
    if ext != Some("jsonl") && ext != Some("json") {
        return None;
    }
    analyze_pi(path)
}

/// Busca el primer campo de texto no vacío entre varios nombres posibles.
/// Sirve para adivinar claves de un formato que no se ha podido ver en
/// disco: si Pi usa `cwd` está en la lista, si usa otra también, y si no usa
/// ninguna de las que se prueban se devuelve `None` en vez de arriesgar con
/// un valor que podría no ser el que se busca.
fn campo_texto(v: &Value, claves: &[&str]) -> Option<String> {
    for k in claves {
        if let Some(s) = v.get(*k).and_then(|x| x.as_str()) {
            if !s.is_empty() {
                return Some(s.to_owned());
            }
        }
    }
    None
}

fn analyze_pi(path: &Path) -> Option<SessionInfo> {
    let meta = std::fs::metadata(path).ok()?;
    let size = meta.len();
    let mtime = meta
        .modified()
        .ok()?
        .duration_since(SystemTime::UNIX_EPOCH)
        .ok()?
        .as_secs();

    // Solo la primera línea, igual que `analyze_codex`: ni falta ni sobra
    // para lo que se necesita, y evita cargar sesiones largas enteras en
    // cada barrido (este escaneo corre cada 45 s).
    let cabecera = primera_linea(path)?;
    let v: Value = serde_json::from_str(&cabecera).ok()?;

    let cwd = campo_texto(&v, &["cwd", "workingDirectory", "working_dir"])
        .or_else(|| v.get("payload").and_then(|p| campo_texto(p, &["cwd"])))
        .or_else(|| v.get("meta").and_then(|p| campo_texto(p, &["cwd"])))
        .or_else(|| v.get("session").and_then(|p| campo_texto(p, &["cwd"])))
        .unwrap_or_default();
    let id = campo_texto(&v, &["id", "sessionId", "session_id"])
        .or_else(|| {
            v.get("payload")
                .and_then(|p| campo_texto(p, &["session_id", "sessionId"]))
        })
        .unwrap_or_default();
    // Sin cwd o sin id no hay nada fiable que enseñar: mejor callar (como ya
    // hace `analyze_codex` con su propia cabecera) que sacar una fila con la
    // carpeta en blanco o un id que no sirve para reanudar nada.
    if cwd.is_empty() || id.is_empty() {
        return None;
    }
    let titulo = campo_texto(&v, &["title", "name", "summary"]).unwrap_or_default();

    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(mtime);
    let hours = (now.saturating_sub(mtime)) as f64 / 3600.0;
    let fresh = if hours < SLEEP_H {
        "activa"
    } else if hours < DEAD_H {
        "dormida"
    } else {
        "muerta"
    };

    Some(SessionInfo {
        id,
        title: clean(if titulo.is_empty() { "(sin título)" } else { &titulo }, 90),
        // Igual que Codex: no se sabe si Pi deja escrito en algún sitio si
        // terminó su turno o está esperando, así que se declara vacío antes
        // que inventar un estado que el Capataz podría usar para decidir algo.
        state: String::new(),
        fresh: fresh.into(),
        hours: (hours * 10.0).round() / 10.0,
        mtime,
        ago: ago_text(hours),
        project: project_of(&cwd, "", ""),
        resume_cwd: cwd.clone(),
        folder: String::new(),
        cwd,
        // Tampoco se sabe si Pi publica en algún sitio qué sesiones están
        // vivas ahora mismo, así que nunca se pinta en verde.
        live: false,
        size_kb: size / 1024,
        agents_live: 0,
        agents_total: 0,
        fuente: "pi".into(),
        cuenta: String::new(),
    })
}

/// El fichero de una sesión de Pi, buscándolo por su id.
///
/// Existe por el mismo motivo que `codex_transcript`, y por el mismo fallo:
/// `delete_session` solo sabía componer la ruta de Claude Code
/// (`~/.claude/projects/<carpeta>/<id>.jsonl`), y una sesión de Pi llega con
/// la carpeta VACÍA —`analyze_pi` no rellena ese campo, que es de Claude— así
/// que armaba `~/.claude/projects//<id>.jsonl`, no encontraba nada y la
/// sesión seguía en la lista (Munir, 2026-08-12: «esta sesión en concreto no
/// me deja eliminarla, le doy a la papelera aceptar y no se elimina»). Es
/// literalmente el fallo que Codex tuvo el 8 de agosto, que se arregló solo
/// para Codex.
///
/// Aquí tampoco vale componer la ruta: el fichero se llama
/// `<marca-de-tiempo>_<id>.jsonl`, así que la parte de delante no se sabe. Se
/// busca por la CABECERA y no por el nombre porque el id de la cabecera es el
/// mismo que usa `analyze_pi` para identificar la sesión: mirando ahí, las dos
/// no se pueden desincronizar aunque Pi cambie cómo nombra sus ficheros.
pub fn pi_transcript(session_id: &str) -> Option<PathBuf> {
    pi_transcript_en(&pi_agent_dir()?.join("sessions"), session_id)
}

/// La búsqueda de verdad, con la raíz por parámetro. Separada para poder
/// probarla sin tocar `USERPROFILE`, que es una variable de todo el proceso y
/// la comparten los tests que corren a la vez (el mismo motivo que en
/// `codex_transcript_en`).
///
/// Recorre los mismos dos sitios que `scan_pi`: los ficheros sueltos de la
/// raíz y un nivel de subcarpetas. Ni uno más, para no pasear por un árbol
/// ajeno con una recursión general.
fn pi_transcript_en(raiz: &Path, session_id: &str) -> Option<PathBuf> {
    let mira = |path: PathBuf| -> Option<PathBuf> {
        let ext = path.extension().and_then(|e| e.to_str());
        if ext != Some("jsonl") && ext != Some("json") {
            return None;
        }
        let v: Value = serde_json::from_str(&primera_linea(&path)?).ok()?;
        let id = campo_texto(&v, &["id", "sessionId", "session_id"])?;
        (id == session_id).then_some(path)
    };
    if let Ok(ficheros) = std::fs::read_dir(raiz) {
        for f in ficheros.flatten() {
            if let Some(p) = mira(f.path()) {
                return Some(p);
            }
        }
    }
    for proyecto in leer_dirs(raiz) {
        let Ok(ficheros) = std::fs::read_dir(&proyecto) else {
            continue;
        };
        for f in ficheros.flatten() {
            if let Some(p) = mira(f.path()) {
                return Some(p);
            }
        }
    }
    None
}

/// Antigravity CLI (`agy`, Google's terminal agent, successor to Gemini CLI).
/// Its Windows installer drops the binary in %LOCALAPPDATA%\Antigravity\;
/// a PATH install counts too. Returns the command Adeorq should run in a pane.
#[tauri::command(async)]
pub fn find_agy() -> Option<String> {
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        // 1.1.7 installs to %LOCALAPPDATA%\agy\bin; older docs said \Antigravity.
        for rel in [
            "agy\\bin\\agy.exe",
            "Antigravity\\bin\\agy.exe",
            "Antigravity\\agy.exe",
        ] {
            let p = Path::new(&local).join(rel);
            if p.exists() {
                return Some(p.to_string_lossy().into_owned());
            }
        }
    }
    if let Some(home) = crate::dir_casa() {
        let p = home.join(".local").join("bin").join(if cfg!(windows) { "agy.exe" } else { "agy" });
        if p.exists() {
            return Some(p.to_string_lossy().into_owned());
        }
    }
    // Last resort: anything named agy on the PATH.
    std::env::var("PATH").ok().and_then(|path| {
        path.split(';')
            .map(|dir| Path::new(dir).join("agy.exe"))
            .find(|p| p.exists())
            .map(|p| p.to_string_lossy().into_owned())
    })
}

/// "claude-opus-4-8" -> "Opus 4.8", "claude-sonnet-5[1m]" -> "Sonnet 5".
fn pretty_model(id: &str) -> String {
    let core = id.split('[').next().unwrap_or(id);
    let mut parts = core.split('-').skip(1); // drop the vendor prefix
    let Some(family) = parts.next() else {
        return String::new();
    };
    // Solo los trozos que parecen una VERSIÓN. Un id con fecha
    // ("claude-opus-4-5-20250929") traía tres grupos de dígitos y salía
    // "Opus 4.5.20250929": la fecha es dígitos, pero no es número de versión.
    // Dos cifras como mucho, que es lo que nunca ha pasado ningún modelo.
    let numbers: Vec<&str> = parts
        .filter(|p| !p.is_empty() && p.len() <= 2 && p.chars().all(|c| c.is_ascii_digit()))
        .collect();
    let mut name = family.to_owned();
    if let Some(first) = name.get_mut(0..1) {
        first.make_ascii_uppercase();
    }
    if numbers.is_empty() {
        name
    } else {
        format!("{name} {}", numbers.join("."))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextInfo {
    /// Readable model name ("Opus 5"), from the transcript rather than the
    /// welcome card: that scrolls away and is lost when Adeorq restarts.
    pub model: String,
    /// Tokens the model is currently carrying (input + both caches).
    pub used: u64,
    /// Window of the model in use: 200k normally, 1M for the [1m] variants.
    pub window: u64,
    pub percent: u8,
    /// Subagents dispatched in this session that have not reported back yet.
    pub agents_live: u32,
    /// Subagents dispatched in total (within the tail that was read).
    pub agents_total: u32,
    /// Which transcript this came from. A pane running a fresh `claude` does
    /// not know its own session id, so it is worked out here from the file
    /// that was actually read: without these two the pane can show what the
    /// session is doing but cannot act on it (delete it, for one).
    pub session_id: String,
    pub folder: String,
    /// What the session is doing right now, in the same vocabulary the session
    /// list uses (see `last_message_state`). Empty when it cannot be told: the
    /// Foreman's gate treats "unknown" as "do not touch", so a pane whose
    /// transcript says nothing is never a candidate for closing.
    pub state: String,
    /// El nombre de la sesión: el que se le puso a mano (`custom-title`) o,
    /// si no, el que le pone Claude (`ai-title`). Vacío mientras no tiene
    /// ninguno; el último mensaje no cuenta, que eso no es un nombre. Con él
    /// un panel deja de llamarse «proyecto · claude» (`lib/nombreSolo.ts`).
    pub title: String,
}

/// El nombre de una sesión, leído de la cola de su transcript. Manda el que se
/// puso a mano sobre el de Claude, como en la lista de sesiones.
fn titulo_de(lines: &[String]) -> String {
    let mut de_claude = String::new();
    for line in lines.iter().rev() {
        if line.contains("\"type\":\"custom-title\"") {
            if let Ok(v) = serde_json::from_str::<Value>(line) {
                let a_mano = v["customTitle"].as_str().unwrap_or_default();
                if !a_mano.is_empty() {
                    return a_mano.to_owned();
                }
            }
        } else if de_claude.is_empty() && line.contains("\"type\":\"ai-title\"") {
            if let Ok(v) = serde_json::from_str::<Value>(line) {
                de_claude = v["aiTitle"].as_str().unwrap_or_default().to_owned();
            }
        }
    }
    de_claude
}

/// A stale transcript cannot have live subagents: without this an abandoned
/// session (killed mid-task) would show a ghost worker for ever.
const AGENTS_STALE_S: u64 = 300;

/// What the last real message of a transcript says the session is doing, plus
/// the cwd that message recorded. Returns `None` for a transcript that holds no
/// real message (a subagent sidechain, or a session that never got going).
///
/// The vocabulary is the contract the Foreman's gate leans on, so it lives in
/// ONE place: the session list and a live pane must never disagree about
/// whether a session is waiting for Munir.
///   pregunta  the agent asked with AskUserQuestion: it cannot move without him
///   ofrece    it ended its turn on a question in prose: same, but softer
///   lista     it ended its turn with a statement: the work is delivered
///   a_medias  a tool round is in flight: it is working
///   tuya      the ball is his and nothing is running
fn last_message_state(lines: &[String]) -> Option<(String, String)> {
    for line in lines.iter().rev() {
        if !line.contains("\"message\"") {
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let kind = v["type"].as_str().unwrap_or_default();
        if (kind != "user" && kind != "assistant") || v["message"].is_null() {
            continue;
        }
        if v["isSidechain"].as_bool().unwrap_or(false) {
            continue;
        }
        let cwd = v["cwd"].as_str().unwrap_or_default().to_owned();
        let content = &v["message"]["content"];
        let state = if kind == "assistant" {
            match content.as_array().and_then(|a| a.last()) {
                Some(b) if b["type"] == "tool_use" && b["name"] == "AskUserQuestion" => "pregunta",
                Some(b) if b["type"] == "text" => {
                    let text = b["text"].as_str().unwrap_or_default();
                    let trimmed = text.trim_end().trim_end_matches(['*', '_', '`', ')', ' ']);
                    if trimmed.ends_with('?') {
                        "ofrece"
                    } else {
                        "lista"
                    }
                }
                _ => "a_medias",
            }
        } else {
            let has_tool_result = content
                .as_array()
                .map(|a| a.iter().any(|b| b["type"] == "tool_result"))
                .unwrap_or(false);
            if has_tool_result {
                "a_medias"
            } else {
                "tuya"
            }
        };
        return Some((cwd, state.to_owned()));
    }
    None
}

/// Counts subagents from the transcript itself: every dispatch is a `tool_use`
/// named Task/Agent and every finish is the `tool_result` carrying its id, so
/// dispatched-minus-returned is exact. The old counter guessed from the screen
/// text, which counted the words rather than the work.
fn count_agents(lines: &[String], fresh: bool) -> (u32, u32) {
    let mut open: HashSet<String> = HashSet::new();
    let mut total: u32 = 0;
    for line in lines {
        if !line.contains("tool_use") && !line.contains("tool_result") {
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let Some(blocks) = v["message"]["content"].as_array() else {
            continue;
        };
        for b in blocks {
            match b["type"].as_str() {
                Some("tool_use") if matches!(b["name"].as_str(), Some("Task") | Some("Agent")) => {
                    if let Some(id) = b["id"].as_str() {
                        open.insert(id.to_owned());
                        total += 1;
                    }
                }
                Some("tool_result") => {
                    if let Some(id) = b["tool_use_id"].as_str() {
                        open.remove(id);
                    }
                }
                _ => {}
            }
        }
    }
    (if fresh { open.len() as u32 } else { 0 }, total)
}

/// Un agente que la sesión mandó a trabajar, para la lista que sale al pasar
/// el ratón por el robot de la cabecera.
///
/// Munir, 2026-10-10: no quería que Adeorq cerrase agentes por su cuenta, pero
/// sí «un mayor control de los agentes»: el robot decía CUÁNTOS había fuera y
/// nada de quién era cada uno ni qué estaba haciendo.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgenteDeSesion {
    /// Qué clase de agente pidió la sesión: «Explore», «general-purpose»…
    pub tipo: String,
    /// La descripción corta con que lo mandó.
    pub que: String,
    /// Cuándo salió y cuándo volvió, en ISO, tal como lo escribió el CLI.
    pub desde: String,
    pub hasta: Option<String>,
    /// Sigue fuera, trabajando.
    pub vivo: bool,
    /// Volvió con error.
    pub fallo: bool,
    /// Se lanzó en segundo plano: su resultado inmediato es solo el acuse de
    /// que salió, así que del historial no se puede saber si ya terminó.
    pub fondo: bool,
}

/// Cuántos se enseñan: los que siguen fuera caben siempre; de los que ya
/// volvieron, los últimos.
const TOPE_AGENTES: usize = 16;

/// Los mismos despliegues que cuenta `count_agents`, con nombre: cada `tool_use`
/// Task/Agent es una salida y el `tool_result` con su id, la vuelta. Los que
/// siguen fuera van primero; después, los que volvieron, el más reciente arriba.
fn agentes_de(lines: &[String], fresh: bool) -> Vec<AgenteDeSesion> {
    let mut todos: Vec<(String, AgenteDeSesion)> = Vec::new();
    for line in lines {
        if !line.contains("tool_use") && !line.contains("tool_result") {
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let Some(blocks) = v["message"]["content"].as_array() else {
            continue;
        };
        let hora = v["timestamp"].as_str().unwrap_or_default();
        for b in blocks {
            match b["type"].as_str() {
                Some("tool_use") if matches!(b["name"].as_str(), Some("Task") | Some("Agent")) => {
                    let Some(id) = b["id"].as_str() else { continue };
                    let input = &b["input"];
                    todos.push((
                        id.to_owned(),
                        AgenteDeSesion {
                            tipo: input["subagent_type"].as_str().unwrap_or("agente").to_owned(),
                            que: recortado(input["description"].as_str().unwrap_or_default(), 80),
                            desde: hora.to_owned(),
                            hasta: None,
                            vivo: fresh,
                            fallo: false,
                            fondo: input["run_in_background"].as_bool().unwrap_or(false),
                        },
                    ));
                }
                Some("tool_result") => {
                    let Some(id) = b["tool_use_id"].as_str() else { continue };
                    if let Some((_, a)) = todos.iter_mut().find(|(i, _)| i == id) {
                        a.hasta = Some(hora.to_owned());
                        a.vivo = false;
                        a.fallo = b["is_error"].as_bool().unwrap_or(false);
                    }
                }
                _ => {}
            }
        }
    }
    let (fuera, mut vueltos): (Vec<_>, Vec<_>) = todos.into_iter().map(|(_, a)| a).partition(|a| a.vivo);
    vueltos.reverse();
    vueltos.truncate(TOPE_AGENTES.saturating_sub(fuera.len().min(TOPE_AGENTES)));
    fuera.into_iter().chain(vueltos).collect()
}

/// Los agentes de la sesión de un panel, con qué hace cada uno. Se lee de la
/// cola del transcript, como el contador de la cabecera: no cuesta una llamada.
#[tauri::command(async)]
pub fn session_agents(cwd: String, session_id: Option<String>) -> Vec<AgenteDeSesion> {
    let Some(path) = transcript_de(&cwd, session_id.as_deref()) else {
        return Vec::new();
    };
    let Ok(lines) = read_tail(&path) else {
        return Vec::new();
    };
    let fresh = std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .and_then(|t| t.elapsed().map_err(std::io::Error::other))
        .map(|age| age.as_secs() < AGENTS_STALE_S)
        .unwrap_or(false);
    agentes_de(&lines, fresh)
}

/// How full the context of a pane's session is. Reads the tail of the
/// transcript (the CLI records usage on every assistant message), so it costs
/// nothing and needs no API call. Falls back to the newest transcript of the
/// pane's folder when the session id is unknown (a fresh `claude`).
#[tauri::command]
pub async fn session_context(cwd: String, session_id: Option<String>) -> Option<ContextInfo> {
    context_de(&transcript_de(&cwd, session_id.as_deref())?)
}

/// El transcript de una conversación, la tenga la cuenta que la tenga.
///
/// Se busca por TODAS las carpetas de cuentas y no solo por `~/.claude` porque
/// un panel abierto con una segunda cuenta guarda ahí dentro: sin esto, ese
/// panel se quedaba sin contador de contexto, sin estado y sin última
/// respuesta, y no había forma de saber por qué.
///
/// Sin id (un `claude` recién abierto, cuya sesión todavía no tiene nombre) se
/// coge el transcript MÁS RECIENTE de esa carpeta de trabajo entre todas las
/// cuentas, que es lo que acaba de escribir el panel que pregunta.
fn transcript_de(cwd: &str, session_id: Option<&str>) -> Option<PathBuf> {
    let carpetas = raices_claude()
        .into_iter()
        .map(|(_, r)| r.join("projects").join(encode_claude(cwd)));
    match session_id.filter(|id| !id.is_empty()) {
        Some(id) => carpetas
            .map(|d| d.join(format!("{id}.jsonl")))
            .find(|p| p.exists()),
        None => carpetas
            .filter_map(|d| newest_transcript(&d))
            .max_by_key(|p| {
                std::fs::metadata(p)
                    .and_then(|m| m.modified())
                    .unwrap_or(SystemTime::UNIX_EPOCH)
            }),
    }
}

/// Most recent transcript of a folder: the stand-in for a pane running a fresh
/// `claude`, whose session id nobody knows yet.
fn newest_transcript(dir: &Path) -> Option<PathBuf> {
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("jsonl"))
        .max_by_key(|p| {
            std::fs::metadata(p)
                .and_then(|m| m.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH)
        })
}

/// The body of `session_context`, with the transcripts root passed in so tests
/// can point at a temp folder instead of racing over the USERPROFILE variable.
/// Solo para eso: en producción la carpeta la elige `transcript_de`, que sabe
/// de cuentas.
#[cfg(test)]
fn context_at(projects: &Path, cwd: &str, session_id: Option<String>) -> Option<ContextInfo> {
    let dir = projects.join(encode_claude(cwd));
    let path = match session_id {
        Some(id) if !id.is_empty() => {
            let p = dir.join(format!("{id}.jsonl"));
            p.exists().then_some(p)?
        }
        _ => newest_transcript(&dir)?,
    };
    context_de(&path)
}

/// Lo que se puede decir de un transcript ya localizado. Separado de la
/// búsqueda porque encontrarlo depende de la cuenta y leerlo no.
fn context_de(path: &Path) -> Option<ContextInfo> {
    // Who this transcript belongs to, named the way every other command names
    // it: the folder under ~/.claude/projects, and the file's own stem.
    let session_id = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let folder = path
        .parent()
        .and_then(|d| d.file_name())
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();

    let lines = read_tail(path).ok()?;
    let fresh = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .and_then(|t| t.elapsed().map_err(std::io::Error::other))
        .map(|age| age.as_secs() < AGENTS_STALE_S)
        .unwrap_or(false);
    let (agents_live, agents_total) = count_agents(&lines, fresh);
    // Same reading the session list uses, so a pane and its row never disagree.
    let state = last_message_state(&lines)
        .map(|(_, s)| s)
        .unwrap_or_default();
    let title = titulo_de(&lines);
    // Compacting throws the whole conversation away and leaves a summary, so
    // the `usage` further back describes tokens that are no longer loaded. The
    // panel kept showing that old figure until the next turn wrote a new one:
    // right after a /compact it claimed 131k when 11k were actually in memory,
    // which is the moment the number matters most.
    //
    // The mark itself carries the answer (`postTokens`), and it is only used
    // when it appears BEFORE any usage line walking backwards, i.e. when
    // nothing has been said since.
    let mut tras_compactar: Option<u64> = None;
    for line in lines.iter().rev() {
        if tras_compactar.is_none() && line.contains("\"compactMetadata\"") {
            if let Ok(v) = serde_json::from_str::<Value>(line) {
                tras_compactar = v["compactMetadata"]["postTokens"]
                    .as_u64()
                    .filter(|n| *n > 0);
            }
        }
        if !line.contains("\"usage\"") {
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let usage = &v["message"]["usage"];
        if usage.is_null() {
            continue;
        }
        // A turn can hold several model calls ("iterations"); the top-level
        // figures add them all up, which is not the context, it is the sum of
        // several. The context is what the LAST call carried.
        let iter = usage["iterations"].as_array().and_then(|a| a.last());
        let source = iter.unwrap_or(usage);
        let used = source["input_tokens"].as_u64().unwrap_or(0)
            + source["cache_read_input_tokens"].as_u64().unwrap_or(0)
            + source["cache_creation_input_tokens"].as_u64().unwrap_or(0);
        if used == 0 {
            continue;
        }
        // The 1M variants do not always carry the [1m] tag in `model`, so let
        // the number decide: over 200k it can only be the big window.
        let model = v["message"]["model"].as_str().unwrap_or_default();
        let mut window = context_window(model);
        // Y si el gasto REAL de esta línea ya pasó de la ventana que dice la
        // tabla, la ventana buena es la grande: es la salvaguarda de antes y se
        // queda puesta por si sale un modelo nuevo antes que su fila. Se mira
        // contra el gasto real y no contra el de después de compactar, que es
        // justo el que no dice nada del tamaño de la ventana.
        if used > window {
            window = 1_000_000;
        }
        let used = tras_compactar.unwrap_or(used);
        return Some(ContextInfo {
            model: pretty_model(model),
            used,
            window,
            percent: ((used as f64 / window as f64) * 100.0).min(100.0) as u8,
            agents_live,
            agents_total,
            session_id,
            folder,
            state,
            title,
        });
    }
    // Compacted so recently that the tail we read holds no usage line at all:
    // the mark alone still knows what is loaded, and a meter is better than
    // nothing exactly here, on the session that just lost its history.
    if let Some(used) = tras_compactar {
        return Some(ContextInfo {
            model: String::new(),
            used,
            window: 200_000,
            percent: ((used as f64 / 200_000.0) * 100.0).min(100.0) as u8,
            agents_live,
            agents_total,
            session_id,
            folder,
            state,
            title,
        });
    }
    // A session with no usage line yet (just started) can still have workers.
    (agents_total > 0).then(|| ContextInfo {
        model: String::new(),
        used: 0,
        window: 0,
        percent: 0,
        agents_live,
        agents_total,
        session_id,
        folder,
        state,
        title,
    })
}

/// Whether a session left a transcript on disk. Restoring panes after a
/// restart needs it: `--resume` on a session that never got a message fails
/// with "No conversation found", so those are reopened as fresh instead.
#[tauri::command]
pub async fn transcript_exists(cwd: String, session_id: String) -> bool {
    transcript_de(&cwd, Some(&session_id)).is_some()
}

/// The agent's last written answer, straight from the transcript. The canvas
/// uses it to hand one agent's result to the next: the terminal's own screen
/// text is full of escape codes and boxes, the transcript is clean prose.
#[tauri::command]
pub async fn last_reply(
    cwd: String,
    session_id: Option<String>,
    max_chars: Option<usize>,
) -> Option<String> {
    let path = transcript_de(&cwd, session_id.as_deref())?;
    let lines = read_tail(&path).ok()?;
    for line in lines.iter().rev() {
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if v["type"] != "assistant" || v["isSidechain"].as_bool().unwrap_or(false) {
            continue;
        }
        // Join every text block of that message: the CLI splits long answers.
        let text = v["message"]["content"]
            .as_array()?
            .iter()
            .filter(|b| b["type"] == "text")
            .filter_map(|b| b["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_owned();
        if text.is_empty() {
            continue;
        }
        let max = max_chars.unwrap_or(4000);
        return Some(if text.chars().count() > max {
            text.chars().take(max).collect::<String>() + "…"
        } else {
            text
        });
    }
    None
}

/// Un turno de la conversación, ya limpio para pintarlo como chat.
#[derive(Clone, Serialize)]
pub struct Turno {
    /// "tu" o "agente". No "user"/"assistant": esto se pinta, no se manda a
    /// ninguna API, y el que lee la pantalla no es un modelo.
    pub rol: String,
    pub texto: String,
    /// Tal como lo escribió el CLI (ISO). Se formatea en el front, que es quien
    /// sabe en qué idioma está la app.
    pub hora: String,
    /// Las herramientas que usó en ese turno, por su nombre. Un chat que
    /// esconde que el agente ha estado escribiendo archivos miente sobre lo que
    /// ha pasado; pero el volcado de cada llamada no es conversación, así que
    /// aquí solo van los nombres y el front decide cómo resumirlos.
    pub herramientas: Vec<String>,
    /// Los mismos usos con lo que hizo cada uno, solo los últimos `TOPE_PASOS`
    /// del turno. Munir, 2026-10-09, desde el móvil: el chat no decía qué
    /// estaba pasando, y «Bash ×11» no lo cuenta; «Publicar la versión» sí.
    pub pasos: Vec<Paso>,
}

/// Un uso de algo dentro de un turno, como lo clasifica `clasificar_uso`.
#[derive(Clone, Serialize)]
pub struct Paso {
    pub clase: String,
    pub nombre: String,
    pub detalle: String,
}

/// Cuántos pasos se guardan por turno. Un turno de una sesión de verdad lleva
/// cientos, y viajan al móvil en cada vuelta: con los últimos se ve por dónde va.
const TOPE_PASOS: usize = 30;

fn pasos_del_contenido(content: &Value) -> Vec<Paso> {
    content
        .as_array()
        .map(|bloques| {
            bloques
                .iter()
                .filter(|b| b["type"] == "tool_use")
                .filter_map(|b| {
                    let (clase, nombre, detalle) = clasificar_uso(b["name"].as_str()?, &b["input"]);
                    Some(Paso { clase, nombre, detalle })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Lo que el CLI se dice a sí mismo y no es conversación de nadie.
///
/// El transcript mezcla los turnos de verdad con la fontanería: los comandos
/// con barra, los recordatorios que el propio Claude Code inyecta y los avisos
/// del arnés. Pintarlos como si Munir los hubiera escrito sería enseñar una
/// conversación que nunca ocurrió.
fn es_fontaneria(t: &str) -> bool {
    let s = t.trim_start();
    s.starts_with("<command-name>")
        || s.starts_with("<local-command-")
        || s.starts_with("<system-reminder>")
        || s.starts_with("<command-message>")
        || s.starts_with("Caveat: The messages below were generated")
}

/// El texto de un `message.content`, que viene de dos formas según el turno:
/// una cadena pelada (lo que escribes tú) o una lista de bloques (lo que
/// escribe el agente, que parte las respuestas largas).
fn texto_del_contenido(content: &Value) -> String {
    if let Some(s) = content.as_str() {
        return s.trim().to_owned();
    }
    content
        .as_array()
        .map(|bloques| {
            bloques
                .iter()
                .filter(|b| b["type"] == "text")
                .filter_map(|b| b["text"].as_str())
                .collect::<Vec<_>>()
                .join("\n")
                .trim()
                .to_owned()
        })
        .unwrap_or_default()
}

fn herramientas_del_contenido(content: &Value) -> Vec<String> {
    content
        .as_array()
        .map(|bloques| {
            bloques
                .iter()
                .filter(|b| b["type"] == "tool_use")
                .filter_map(|b| b["name"].as_str())
                .map(|s| s.to_owned())
                .collect()
        })
        .unwrap_or_default()
}

/// Convierte las líneas de un transcript en turnos de conversación.
///
/// Aparte del comando para poder probarla: lo que decide qué se ve en el modo
/// chat es esto, y compilar no demuestra que reparta bien los turnos.
pub fn turnos_de(lineas: &[String], max: usize) -> Vec<Turno> {
    let mut out: Vec<Turno> = Vec::new();
    sumar_turnos(&mut out, lineas.iter().map(String::as_str));
    // Los últimos, que son los que interesan al abrir una conversación.
    if out.len() > max {
        out.drain(..out.len() - max);
    }
    out
}

/// Añade a `out` los turnos de unas líneas más del transcript. Aparte de
/// `turnos_de` para poder seguir una conversación por lo que CRECE: un turno
/// que el agente sigue escribiendo se junta con el que ya estaba.
fn sumar_turnos<'a>(out: &mut Vec<Turno>, lineas: impl Iterator<Item = &'a str>) {
    for linea in lineas {
        let Ok(v) = serde_json::from_str::<Value>(linea) else {
            continue;
        };
        let kind = v["type"].as_str().unwrap_or_default();
        if kind != "user" && kind != "assistant" {
            continue;
        }
        // Los subagentes tienen su propia conversación paralela. Mezclarla con
        // la principal es lo que convierte un chat en un revoltijo.
        if v["isSidechain"].as_bool().unwrap_or(false) {
            continue;
        }
        // El resumen que deja una compactación y el cuerpo de una skill van
        // como mensajes tuyos, y no los escribió nadie: los inyecta el CLI.
        let inyectado = v["isCompactSummary"].as_bool().unwrap_or(false)
            || v["isMeta"].as_bool().unwrap_or(false);
        if inyectado {
            continue;
        }
        let content = &v["message"]["content"];
        let texto = texto_del_contenido(content);
        let herramientas = herramientas_del_contenido(content);
        let mut pasos = pasos_del_contenido(content);
        if texto.is_empty() && herramientas.is_empty() {
            continue;
        }
        if !texto.is_empty() && es_fontaneria(&texto) {
            continue;
        }
        let rol = if kind == "assistant" { "agente" } else { "tu" };
        let hora = v["timestamp"].as_str().unwrap_or_default().to_owned();

        // El CLI parte una respuesta larga en varios mensajes seguidos, y cada
        // llamada a una herramienta abre otro. Pintados por separado saldrían
        // veinte burbujas de la misma frase, así que los seguidos del mismo rol
        // se juntan en uno.
        match out.last_mut() {
            Some(ult) if ult.rol == rol => {
                if !texto.is_empty() {
                    if !ult.texto.is_empty() {
                        ult.texto.push_str("\n\n");
                    }
                    ult.texto.push_str(&texto);
                }
                ult.herramientas.extend(herramientas);
                ult.pasos.append(&mut pasos);
                if ult.pasos.len() > TOPE_PASOS {
                    ult.pasos.drain(..ult.pasos.len() - TOPE_PASOS);
                }
            }
            _ => {
                if pasos.len() > TOPE_PASOS {
                    pasos.drain(..pasos.len() - TOPE_PASOS);
                }
                out.push(Turno {
                    rol: rol.to_owned(),
                    texto,
                    hora,
                    herramientas,
                    pasos,
                })
            }
        }
    }
}

/* ── La conversación entera, no la de la cola ─────────────────────────────
   Munir, 2026-10-08, desde el móvil: «no veo casi el historial del chat». La
   cola de mega y medio de `read_tail` vale para títulos y estado, pero en una
   sesión de verdad casi todo son resultados de herramientas: medido ese día en
   sus diez transcripts más recientes, en mega y medio cabían de 1 a 11 turnos
   (de 0 a 5 mensajes suyos), y el de esta sesión, de 404 MB, daba 9. Así que la
   conversación se lee hacia atrás, a trozos cada vez mayores, hasta tener los
   turnos pedidos o llegar a `TOPE_CONVERSACION`; y luego solo lo que crece. */

/// Hasta dónde se lee hacia atrás buscando turnos. Lo que se pague aquí se paga
/// UNA vez por conversación abierta: las vueltas siguientes leen solo lo nuevo.
const TOPE_CONVERSACION: u64 = 32_000_000;

/// Lo leído de la conversación de un transcript: los bytes `desde..hasta` y
/// sus turnos. `hasta` cae siempre justo detrás de un salto de línea.
struct Leida {
    path: PathBuf,
    max: usize,
    hasta: u64,
    turnos: Vec<Turno>,
}
static CONVERSACIONES: Mutex<Vec<Leida>> = Mutex::new(Vec::new());
const CONVERSACIONES_MAX: usize = 4;

/// Las líneas ENTERAS de `desde..hasta`, y dónde acaba la última. Una línea a
/// medio escribir al final no se cuenta: se lee entera la vuelta siguiente.
/// Con `partida`, la primera se tira porque el corte cae a mitad de ella.
fn lineas_entre(path: &Path, desde: u64, hasta: u64, partida: bool) -> std::io::Result<(Vec<String>, u64)> {
    let mut f = std::fs::File::open(path)?;
    f.seek(SeekFrom::Start(desde))?;
    let mut data = Vec::with_capacity((hasta - desde) as usize);
    f.take(hasta - desde).read_to_end(&mut data)?;
    let Some(ultimo) = data.iter().rposition(|&b| b == b'\n') else {
        return Ok((Vec::new(), desde));
    };
    data.truncate(ultimo + 1);
    let mut empieza = 0;
    if partida {
        empieza = data.iter().position(|&b| b == b'\n').map_or(data.len(), |c| c + 1);
    }
    let lineas = String::from_utf8_lossy(&data[empieza..]).lines().map(|l| l.to_owned()).collect();
    Ok((lineas, desde + ultimo as u64 + 1))
}

fn conversacion_de(path: &Path, max: usize) -> std::io::Result<Vec<Turno>> {
    let size = std::fs::metadata(path)?.len();
    let mut leidas = CONVERSACIONES.lock().unwrap_or_else(|e| e.into_inner());

    // Ya leída y solo ha crecido: se suma lo nuevo.
    if let Some(i) = leidas.iter().position(|l| l.path == path && l.max == max && l.hasta <= size) {
        let mut l = leidas.remove(i);
        if l.hasta < size {
            let (lineas, hasta) = lineas_entre(path, l.hasta, size, false)?;
            sumar_turnos(&mut l.turnos, lineas.iter().map(String::as_str));
            l.hasta = hasta;
            if l.turnos.len() > max {
                l.turnos.drain(..l.turnos.len() - max);
            }
        }
        let turnos = l.turnos.clone();
        leidas.insert(0, l);
        return Ok(turnos);
    }

    let mut trozo = TAIL_BYTES;
    let (turnos, hasta) = loop {
        let desde = size.saturating_sub(trozo);
        let (lineas, hasta) = lineas_entre(path, desde, size, desde > 0)?;
        let turnos = turnos_de(&lineas, max);
        if turnos.len() >= max || desde == 0 || trozo >= TOPE_CONVERSACION {
            break (turnos, hasta);
        }
        trozo = (trozo * 4).min(TOPE_CONVERSACION);
    };
    leidas.retain(|l| l.path != path || l.max != max);
    leidas.insert(0, Leida { path: path.to_owned(), max, hasta, turnos: turnos.clone() });
    leidas.truncate(CONVERSACIONES_MAX);
    Ok(turnos)
}

/// La conversación de una sesión, lista para pintarla sin pasar por la consola.
///
/// Es el motor del modo chat: la misma sesión que en la Cabina sale como una
/// terminal con sus códigos de escape, aquí sale como lo que de verdad es, una
/// conversación. No cuesta ni un token: ya está escrita en el disco.
///
/// Síncrono y `(async)`: la primera lectura de una conversación larga puede ir
/// a buscar decenas de megas hacia atrás, y eso no se hace en un hilo de Tokio.
#[tauri::command(async)]
pub fn session_messages(
    cwd: String,
    session_id: Option<String>,
    max: Option<usize>,
) -> Result<Vec<Turno>, String> {
    // El id viaja en una ruta, así que no se acepta a ojo: sin esto,
    // «../../algo» leería cualquier archivo del disco.
    if let Some(id) = session_id.as_deref().filter(|i| !i.is_empty()) {
        if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Err("id de sesión no válido".into());
        }
    }
    let path = transcript_de(&cwd, session_id.as_deref()).ok_or(if session_id.is_some() {
        "esa conversación no está en el disco"
    } else {
        "ese proyecto no tiene conversaciones"
    })?;
    conversacion_de(&path, max.unwrap_or(60)).map_err(|e| e.to_string())
}

/* ── La actividad de una sesión: lo que pasa por detrás de la terminal ────
   Munir lo pidió el 2026-08-17: «una pestaña a la derecha que te diga cuándo
   estás utilizando un skill o cuándo está un MCP activo, y una sección de
   monitoreo de cómo funcionan las requests al servidor». Todo esto YA está
   escrito en el transcript: cada uso de herramienta es un bloque `tool_use`
   y cada llamada al modelo deja su `usage`. Aquí solo se lee y se ordena. */

/// Un uso de algo: una skill, una herramienta MCP, una herramienta normal o
/// un subagente. Los usos SEGUIDOS de lo mismo se agrupan en uno con `veces`,
/// porque veinte filas de `Read` seguidas no dicen más que una con «×20».
#[derive(Clone, Serialize)]
pub struct EventoActividad {
    /// "skill" | "mcp" | "agente" | "herramienta". Decide el icono y el color.
    pub clase: String,
    pub nombre: String,
    /// El detalle corto que orienta (el comando, el archivo, el patrón).
    pub detalle: String,
    /// ISO, tal como lo escribió el CLI; el front lo vuelve «hace 2 min».
    pub hora: String,
    pub veces: u32,
}

/// Una llamada del CLI al servidor del modelo, con lo que costó en tokens.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlamadaModelo {
    pub hora: String,
    pub modelo: String,
    pub entrada: u64,
    pub salida: u64,
    pub cache_leida: u64,
    pub cache_escrita: u64,
}

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Actividad {
    /// De más viejo a más nuevo, ya agrupados.
    pub eventos: Vec<EventoActividad>,
    pub llamadas: Vec<LlamadaModelo>,
    /// Los totales van aparte porque las listas están recortadas a los últimos.
    pub total_llamadas: u32,
    pub entrada_total: u64,
    pub salida_total: u64,
}

/// El nombre suelto de una ruta, para que el detalle no ocupe media fila.
fn base_de_ruta(p: &str) -> String {
    p.rsplit(['/', '\\']).next().unwrap_or(p).to_owned()
}

fn recortado(s: &str, max: usize) -> String {
    let limpio = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if limpio.chars().count() <= max {
        return limpio;
    }
    let corte: String = limpio.chars().take(max).collect();
    format!("{corte}…")
}

/// Qué es cada `tool_use` para el que mira el panel: clase, nombre y detalle.
fn clasificar_uso(name: &str, input: &Value) -> (String, String, String) {
    if name == "Skill" {
        let skill = input["skill"].as_str().unwrap_or("?").to_owned();
        let args = recortado(input["args"].as_str().unwrap_or_default(), 48);
        return ("skill".into(), skill, args);
    }
    if let Some(resto) = name.strip_prefix("mcp__") {
        // mcp__servidor__herramienta. El servidor puede llevar guiones bajos
        // sueltos (claude_ai_Supabase), así que el corte es el PRIMER doble.
        let (srv, tool) = resto.split_once("__").unwrap_or((resto, ""));
        return ("mcp".into(), srv.to_owned(), tool.to_owned());
    }
    if name == "Task" || name == "Agent" {
        let quien = input["subagent_type"].as_str().unwrap_or("agente").to_owned();
        let que = recortado(input["description"].as_str().unwrap_or_default(), 48);
        return ("agente".into(), quien, que);
    }
    let detalle = match name {
        "Bash" | "PowerShell" => input["description"]
            .as_str()
            .map(|s| recortado(s, 48))
            .unwrap_or_else(|| recortado(input["command"].as_str().unwrap_or_default(), 48)),
        "Read" | "Edit" | "Write" | "NotebookEdit" => input["file_path"]
            .as_str()
            .map(base_de_ruta)
            .unwrap_or_default(),
        "Grep" | "Glob" => recortado(input["pattern"].as_str().unwrap_or_default(), 48),
        "WebFetch" | "WebSearch" => recortado(
            input["url"].as_str().or(input["query"].as_str()).unwrap_or_default(),
            48,
        ),
        _ => String::new(),
    };
    ("herramienta".into(), name.to_owned(), detalle)
}

/// Convierte las líneas de un transcript en la actividad que se enseña.
///
/// Aparte del comando por lo de siempre: esto decide qué se ve, y compilar no
/// demuestra que cuente bien las llamadas ni que agrupe bien los usos.
pub fn actividad_de(lineas: &[String], max: usize) -> Actividad {
    let mut eventos: Vec<EventoActividad> = Vec::new();
    let mut llamadas: Vec<LlamadaModelo> = Vec::new();
    let (mut entrada_total, mut salida_total) = (0u64, 0u64);
    // El CLI parte una respuesta en varios mensajes que comparten `requestId`
    // y repiten el mismo `usage`: contarlos todos sería inventarse llamadas.
    let mut ultima_request = String::new();
    for linea in lineas {
        // Barato antes de parsear: solo interesan los mensajes del agente.
        if !linea.contains("\"assistant\"") {
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(linea) else {
            continue;
        };
        if v["type"] != "assistant" {
            continue;
        }
        // Los subagentes tienen su propia conversación; aquí se cuenta la
        // principal (sus despachos ya salen como clase "agente").
        if v["isSidechain"].as_bool().unwrap_or(false) {
            continue;
        }
        let hora = v["timestamp"].as_str().unwrap_or_default().to_owned();
        if let Some(bloques) = v["message"]["content"].as_array() {
            for b in bloques {
                if b["type"] != "tool_use" {
                    continue;
                }
                let name = b["name"].as_str().unwrap_or_default();
                if name.is_empty() {
                    continue;
                }
                let (clase, nombre, detalle) = clasificar_uso(name, &b["input"]);
                match eventos.last_mut() {
                    Some(u) if u.clase == clase && u.nombre == nombre => {
                        u.veces += 1;
                        u.hora = hora.clone();
                        if !detalle.is_empty() {
                            u.detalle = detalle;
                        }
                    }
                    _ => eventos.push(EventoActividad {
                        clase,
                        nombre,
                        detalle,
                        hora: hora.clone(),
                        veces: 1,
                    }),
                }
            }
        }
        let usage = &v["message"]["usage"];
        if usage.is_null() {
            continue;
        }
        let req = v["requestId"].as_str().unwrap_or_default();
        if !req.is_empty() && req == ultima_request {
            continue;
        }
        ultima_request = req.to_owned();
        let ll = LlamadaModelo {
            hora,
            modelo: pretty_model(v["message"]["model"].as_str().unwrap_or_default()),
            entrada: usage["input_tokens"].as_u64().unwrap_or(0),
            salida: usage["output_tokens"].as_u64().unwrap_or(0),
            cache_leida: usage["cache_read_input_tokens"].as_u64().unwrap_or(0),
            cache_escrita: usage["cache_creation_input_tokens"].as_u64().unwrap_or(0),
        };
        entrada_total += ll.entrada + ll.cache_escrita;
        salida_total += ll.salida;
        llamadas.push(ll);
    }
    let total_llamadas = llamadas.len() as u32;
    if eventos.len() > max {
        eventos.drain(..eventos.len() - max);
    }
    if llamadas.len() > max {
        llamadas.drain(..llamadas.len() - max);
    }
    Actividad {
        eventos,
        llamadas,
        total_llamadas,
        entrada_total,
        salida_total,
    }
}

/// La actividad de la sesión de un panel: skills, MCP, herramientas y
/// llamadas al modelo, leídas del transcript que ya está en el disco.
#[tauri::command]
pub async fn session_activity(
    cwd: String,
    session_id: Option<String>,
) -> Result<Actividad, String> {
    // El id viaja en una ruta, así que no se acepta a ojo (igual que en
    // `session_messages`): sin esto, «../../algo» leería cualquier archivo.
    if let Some(id) = session_id.as_deref().filter(|i| !i.is_empty()) {
        if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Err("id de sesión no válido".into());
        }
    }
    let path = transcript_de(&cwd, session_id.as_deref())
        .ok_or("esa conversación no está en el disco")?;
    let lineas = read_tail(&path).map_err(|e| e.to_string())?;
    Ok(actividad_de(&lineas, 40))
}

#[tauri::command(async)]
pub fn open_in_antigravity(path: String) -> Result<(), String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    let exe = Path::new(&local).join("Programs\\Antigravity\\Antigravity.exe");
    if !exe.exists() {
        return Err(format!("Antigravity no encontrado en {}", exe.display()));
    }
    std::process::Command::new(exe)
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {


    /// El caché de la cola no puede servir lo de antes cuando el archivo ha
    /// crecido, que es lo único que lo haría peligroso: un transcript que crece
    /// es un agente escribiendo, y enseñar su mensaje anterior es peor que no
    /// tener caché. Se comprueban las dos mitades del trato, porque una sola no
    /// vale: que ahorre cuando puede, y que NO ahorre cuando no debe.
    #[test]
    fn la_cola_se_guarda_pero_no_se_queda_vieja() {
        let dir = std::env::temp_dir().join(format!("adeorq-cola-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("transcript.jsonl");
        std::fs::write(&f, "uno
dos
").unwrap();

        let a = read_tail(&f).unwrap();
        assert_eq!(a.as_slice(), ["uno", "dos"]);

        // Sin tocar el archivo, la segunda vez es LA MISMA memoria: no se ha
        // vuelto a leer el disco ni a partir nada.
        let b = read_tail(&f).unwrap();
        assert!(Arc::ptr_eq(&a, &b), "sin cambios tendría que salir del caché");

        // Y en cuanto crece, se relee. La fecha en disco tiene el grano de un
        // segundo, así que lo que delata el cambio aquí es el tamaño, que es
        // justo el caso real: un transcript solo crece.
        std::fs::write(&f, "uno
dos
tres
").unwrap();
        let c = read_tail(&f).unwrap();
        assert_eq!(c.as_slice(), ["uno", "dos", "tres"], "un archivo que ha crecido se relee");
        assert!(!Arc::ptr_eq(&a, &c));

        std::fs::remove_dir_all(&dir).ok();
    }

    /// El nombre de una sesión: manda el que se puso a mano, luego el de
    /// Claude (el más reciente), y lo que se escribió no es un nombre.
    #[test]
    fn el_titulo_de_la_sesion_prefiere_el_puesto_a_mano() {
        let l = |s: &str| s.to_owned();
        let claude_viejo = l(r#"{"type":"ai-title","aiTitle":"Primer intento"}"#);
        let claude = l(r#"{"type":"ai-title","aiTitle":"Arreglar la barra"}"#);
        let a_mano = l(r#"{"type":"custom-title","customTitle":"La barra"}"#);
        let escrito = l(r#"{"type":"last-prompt","lastPrompt":"se rompió esto"}"#);

        assert_eq!(super::titulo_de(&[escrito.clone()]), "");
        assert_eq!(super::titulo_de(&[claude_viejo.clone(), claude.clone(), escrito.clone()]), "Arreglar la barra");
        // El orden en el fichero no decide: uno a mano gana aunque Claude
        // haya vuelto a titular después.
        assert_eq!(super::titulo_de(&[a_mano.clone(), claude.clone()]), "La barra");
        assert_eq!(super::titulo_de(&[claude, a_mano, escrito]), "La barra");
    }

    /// Y ese título llega al panel por el mismo camino que el contexto: se lee
    /// de un transcript en disco, que es lo que hace `session_context`.
    #[test]
    fn el_contexto_de_un_panel_trae_el_titulo_de_su_sesion() {
        let dir = std::env::temp_dir().join(format!("adeorq-titulo-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("11111111-1111-4111-8111-111111111111.jsonl");
        let uso = r#"{"type":"assistant","message":{"model":"claude-opus-5","role":"assistant","content":[{"type":"text","text":"Hecho."}],"usage":{"input_tokens":1200,"cache_read_input_tokens":300,"cache_creation_input_tokens":0}}}"#;
        std::fs::write(&f, format!("{uso}\n")).unwrap();
        let sin = super::context_de(&f).expect("con una línea de uso hay contexto");
        assert_eq!(sin.title, "", "sin título todavía, vacío");
        assert_eq!(sin.session_id, "11111111-1111-4111-8111-111111111111");

        std::fs::write(&f, format!("{uso}\n{}\n", r#"{"type":"ai-title","aiTitle":"Arreglar la barra de arriba"}"#)).unwrap();
        let con = super::context_de(&f).expect("sigue habiendo contexto");
        assert_eq!(con.title, "Arreglar la barra de arriba");
        assert_eq!(con.used, 1500);

        std::fs::remove_dir_all(&dir).ok();
    }

    /// Un corte a mitad de línea tira esa línea y no la entrega a medias: media
    /// línea de JSON no se puede leer, y colada en la lista ensucia todo lo que
    /// venga detrás.
    #[test]
    fn el_corte_no_entrega_media_linea() {
        let dir = std::env::temp_dir().join(format!("adeorq-corte-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("largo.jsonl");
        // Una línea más larga que la ventana, y detrás dos enteras.
        let gorda = "x".repeat(TAIL_BYTES as usize + 10);
        std::fs::write(&f, format!("{gorda}
buena
otra
")).unwrap();

        let lineas = read_tail(&f).unwrap();
        assert_eq!(lineas.as_slice(), ["buena", "otra"], "la línea cortada no sale");

        std::fs::remove_dir_all(&dir).ok();
    }

    /// Los nombres de modelo que de verdad aparecen en los transcripts, y el
    /// que rompía: uno con fecha salía como "Opus 4.5.20250929".
    #[test]
    fn el_nombre_del_modelo_no_se_traga_la_fecha() {
        assert_eq!(pretty_model("claude-opus-5"), "Opus 5");
        assert_eq!(pretty_model("claude-opus-4-8"), "Opus 4.8");
        assert_eq!(pretty_model("claude-sonnet-5[1m]"), "Sonnet 5");
        assert_eq!(pretty_model("claude-opus-4-5-20250929"), "Opus 4.5");
        assert_eq!(pretty_model("claude-haiku-4-5-20251001"), "Haiku 4.5");
    }
    use super::*;

    /// Lo que hace legible el modo chat: el CLI parte una respuesta larga en
    /// varios mensajes seguidos y abre otro por cada herramienta, así que sin
    /// juntarlos salen veinte burbujas de la misma frase.
    #[test]
    fn los_mensajes_seguidos_del_mismo_lado_son_un_solo_turno() {
        let lineas: Vec<String> = vec![
            r#"{"type":"user","message":{"content":"arregla el hover"}}"#.into(),
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Voy."}]}}"#.into(),
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit"}]}}"#
                .into(),
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Hecho."}]}}"#
                .into(),
        ];
        let t = turnos_de(&lineas, 60);
        assert_eq!(t.len(), 2, "una pregunta y una respuesta, no cuatro burbujas");
        assert_eq!(t[0].rol, "tu");
        assert_eq!(t[1].texto, "Voy.\n\nHecho.");
        assert_eq!(t[1].herramientas, vec!["Edit".to_owned()]);
    }

    /// El chat del móvil dice QUÉ hizo cada paso, no solo cómo se llama la
    /// herramienta, y en un turno de cientos guarda solo los últimos.
    #[test]
    fn cada_paso_lleva_lo_que_hizo_y_solo_quedan_los_ultimos() {
        let mut lineas: Vec<String> = vec![
            r#"{"type":"user","message":{"content":"publica"}}"#.into(),
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"pnpm publicar-version notas.md","description":"Publicar la versión"}}]}}"#.into(),
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"C:\\proyectos\\Adeorq\\src-tauri\\src\\movil.html"}}]}}"#.into(),
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"mcp__adeorq__ask_decision","input":{}}]}}"#.into(),
        ];
        let t = turnos_de(&lineas, 60);
        let p: Vec<(&str, &str, &str)> =
            t[1].pasos.iter().map(|p| (p.clase.as_str(), p.nombre.as_str(), p.detalle.as_str())).collect();
        assert_eq!(
            p,
            vec![
                ("herramienta", "Bash", "Publicar la versión"),
                ("herramienta", "Read", "movil.html"),
                ("mcp", "adeorq", "ask_decision"),
            ]
        );

        for i in 0..TOPE_PASOS + 7 {
            lineas.push(format!(
                r#"{{"type":"assistant","message":{{"content":[{{"type":"tool_use","name":"Grep","input":{{"pattern":"p{i}"}}}}]}}}}"#
            ));
        }
        let t = turnos_de(&lineas, 60);
        assert_eq!(t[1].herramientas.len(), TOPE_PASOS + 10, "los nombres se cuentan todos");
        assert_eq!(t[1].pasos.len(), TOPE_PASOS);
        assert_eq!(t[1].pasos.last().unwrap().detalle, format!("p{}", TOPE_PASOS + 6));
    }

    /// La fontanería del CLI no es conversación de nadie: pintarla sería
    /// enseñar mensajes que Munir no escribió.
    #[test]
    fn lo_que_el_cli_se_dice_a_si_mismo_no_sale() {
        let lineas: Vec<String> = vec![
            r#"{"type":"user","message":{"content":"<command-name>/usage</command-name>"}}"#.into(),
            r#"{"type":"user","message":{"content":"<system-reminder>ojo</system-reminder>"}}"#
                .into(),
            r#"{"type":"assistant","isSidechain":true,"message":{"content":[{"type":"text","text":"soy un subagente"}]}}"#.into(),
            // Tras compactar (a mano o sola), el resumen va en el mismo
            // transcript como un mensaje TUYO de varios miles de palabras.
            r#"{"type":"user","isCompactSummary":true,"isVisibleInTranscriptOnly":true,"message":{"content":"This session is being continued from a previous conversation"}}"#.into(),
            // El cuerpo de una skill también entra como mensaje tuyo.
            r#"{"type":"user","isMeta":true,"message":{"content":[{"type":"text","text":"Base directory for this skill: C:\\skills\\fin"}]}}"#.into(),
            r#"{"type":"user","message":{"content":"esto si"}}"#.into(),
        ];
        let t = turnos_de(&lineas, 60);
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].texto, "esto si");
    }

    /// Las banderas de arriba son formato de Claude Code, no nuestro: si un
    /// día las renombra, esto se pone rojo contra sus transcripts de verdad.
    #[test]
    fn ningun_resumen_de_compactacion_sale_como_tuyo_de_verdad() {
        let Some(dir) = claude_dir().map(|d| d.join("projects")) else {
            return;
        };
        for p in leer_dirs(&dir).into_iter().filter_map(|d| newest_transcript(&d)) {
            let Ok(lineas) = read_tail(&p) else { continue };
            for t in turnos_de(&lineas, usize::MAX) {
                assert!(
                    !t.texto.starts_with("This session is being continued")
                        && !t.texto.starts_with("Base directory for this skill"),
                    "fontanería pintada como turno en {p:?}",
                );
            }
        }
    }

    /// Lo que Munir veía desde el móvil: en una sesión de verdad casi todo son
    /// resultados de herramientas, y en la cola de mega y medio no quedaban
    /// más que un par de turnos. Aquí hay seis megas de herramientas entre las
    /// preguntas viejas y las nuevas, y se tienen que ver las de antes también.
    #[test]
    fn la_conversacion_se_busca_detras_de_las_herramientas_y_sigue_lo_que_crece() {
        use std::io::Write;
        let dir = std::env::temp_dir().join("adeorq-conversacion-larga");
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("s.jsonl");
        let tu = |t: &str| format!(r#"{{"type":"user","message":{{"content":"{t}"}}}}"#);
        let agente = |t: &str| {
            format!(r#"{{"type":"assistant","message":{{"content":[{{"type":"text","text":"{t}"}}]}}}}"#)
        };
        let herramienta = format!(
            r#"{{"type":"user","message":{{"content":[{{"type":"tool_result","content":"{}"}}]}}}}"#,
            "x".repeat(100_000)
        );
        let mut f = std::fs::File::create(&p).unwrap();
        for i in 0..5 {
            writeln!(f, "{}\n{}", tu(&format!("vieja {i}")), agente(&format!("respuesta vieja {i}"))).unwrap();
        }
        for _ in 0..60 {
            writeln!(f, "{herramienta}").unwrap();
        }
        writeln!(f, "{}\n{}", tu("nueva"), agente("respuesta nueva")).unwrap();
        drop(f);

        assert_eq!(turnos_de(&read_tail(&p).unwrap(), 80).len(), 2, "la cola sola: el fallo");
        let t = conversacion_de(&p, 80).unwrap();
        assert_eq!(t.len(), 12, "las cinco viejas también");
        assert_eq!(t[0].texto, "vieja 0");

        // El agente sigue escribiendo: media línea no cuenta, entera se junta
        // con su turno.
        let mut f = std::fs::OpenOptions::new().append(true).open(&p).unwrap();
        let mas = agente("y sigue");
        write!(f, "{}", &mas[..20]).unwrap();
        f.flush().unwrap();
        assert_eq!(conversacion_de(&p, 80).unwrap().last().unwrap().texto, "respuesta nueva");
        writeln!(f, "{}", &mas[20..]).unwrap();
        drop(f);
        let t = conversacion_de(&p, 80).unwrap();
        assert_eq!(t.len(), 12);
        assert_eq!(t.last().unwrap().texto, "respuesta nueva\n\ny sigue");

        // Y con un tope, los últimos.
        let t = conversacion_de(&p, 3).unwrap();
        assert_eq!(t.len(), 3);
        assert_eq!(t[0].texto, "respuesta vieja 4");
        std::fs::remove_dir_all(&dir).ok();
    }

    /// Contra sus transcripts de verdad: nunca menos turnos que la cola sola,
    /// y lo que cuesta. `cargo test --lib conversacion_de_verdad -- --nocapture`
    #[test]
    fn la_conversacion_de_verdad() {
        let Some(dir) = claude_dir().map(|d| d.join("projects")) else {
            return;
        };
        for p in leer_dirs(&dir).into_iter().filter_map(|d| newest_transcript(&d)) {
            let Ok(lineas) = read_tail(&p) else { continue };
            let cola = turnos_de(&lineas, 80).len();
            let t0 = std::time::Instant::now();
            let n = conversacion_de(&p, 80).unwrap().len();
            let primera = t0.elapsed();
            let t1 = std::time::Instant::now();
            assert_eq!(conversacion_de(&p, 80).unwrap().len(), n);
            let segunda = t1.elapsed();
            let mb = std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0) as f64 / 1e6;
            eprintln!("{mb:>6.1} MB: cola {cola:>2} -> {n:>2} turnos, {primera:?} y luego {segunda:?}");
            assert!(n >= cola, "menos turnos que la cola sola en {p:?}");
        }
    }

    /// Lo que decide qué enseña la pestaña de actividad: una skill se llama
    /// por su nombre, un MCP por su servidor y herramienta, los usos seguidos
    /// se agrupan, y los mensajes que comparten `requestId` son UNA llamada.
    #[test]
    fn la_actividad_reconoce_skills_mcp_y_agrupa() {
        let lineas: Vec<String> = vec![
            r#"{"type":"assistant","requestId":"r1","timestamp":"2026-08-17T10:00:00Z","message":{"model":"claude-opus-5","usage":{"input_tokens":10,"output_tokens":5,"cache_read_input_tokens":100,"cache_creation_input_tokens":20},"content":[{"type":"tool_use","name":"Skill","input":{"skill":"fin"}}]}}"#.into(),
            // Mismo requestId: es la misma llamada partida en dos mensajes.
            r#"{"type":"assistant","requestId":"r1","timestamp":"2026-08-17T10:00:01Z","message":{"model":"claude-opus-5","usage":{"input_tokens":10,"output_tokens":5,"cache_read_input_tokens":100,"cache_creation_input_tokens":20},"content":[{"type":"tool_use","name":"mcp__playwright__browser_click","input":{}}]}}"#.into(),
            // Tres Read seguidos: una fila con veces=3, no tres filas.
            r#"{"type":"assistant","requestId":"r2","timestamp":"2026-08-17T10:01:00Z","message":{"model":"claude-opus-5","usage":{"input_tokens":7,"output_tokens":3},"content":[{"type":"tool_use","name":"Read","input":{"file_path":"C:\\p\\a.ts"}},{"type":"tool_use","name":"Read","input":{"file_path":"C:\\p\\b.ts"}},{"type":"tool_use","name":"Read","input":{"file_path":"C:\\p\\c.ts"}}]}}"#.into(),
            // Un subagente no es actividad de esta conversación.
            r#"{"type":"assistant","isSidechain":true,"requestId":"r9","timestamp":"2026-08-17T10:02:00Z","message":{"usage":{"input_tokens":1,"output_tokens":1},"content":[{"type":"tool_use","name":"Bash","input":{"command":"ls"}}]}}"#.into(),
        ];
        let a = actividad_de(&lineas, 40);
        assert_eq!(
            a.eventos.iter().map(|e| e.clase.as_str()).collect::<Vec<_>>(),
            vec!["skill", "mcp", "herramienta"],
        );
        assert_eq!(a.eventos[0].nombre, "fin");
        assert_eq!(a.eventos[1].nombre, "playwright");
        assert_eq!(a.eventos[1].detalle, "browser_click");
        assert_eq!(a.eventos[2].veces, 3, "los Read seguidos van agrupados");
        assert_eq!(a.eventos[2].detalle, "c.ts", "el detalle es el último");
        assert_eq!(a.total_llamadas, 2, "r1 partida en dos mensajes es UNA");
        assert_eq!(a.entrada_total, 10 + 20 + 7, "entrada + caché escrita");
        assert_eq!(a.salida_total, 5 + 3);
        assert_eq!(a.llamadas[0].modelo, "Opus 5");
        assert_eq!(a.llamadas[0].cache_leida, 100);
    }

    /// Contra un transcript REAL de esta máquina, que es donde se ve si el
    /// formato que asume el parser es el que Claude Code escribe de verdad.
    /// Si no hay ninguno (una máquina limpia), no afirma nada.
    #[test]
    fn la_actividad_de_verdad() {
        let Some(dir) = claude_dir().map(|d| d.join("projects")) else {
            return;
        };
        let mut mejores: Vec<PathBuf> = leer_dirs(&dir)
            .into_iter()
            .filter_map(|d| newest_transcript(&d))
            .collect();
        mejores.sort_by_key(|p| {
            std::cmp::Reverse(
                std::fs::metadata(p)
                    .and_then(|m| m.modified())
                    .unwrap_or(SystemTime::UNIX_EPOCH),
            )
        });
        let mut con_eventos = 0;
        for p in mejores.iter().take(5) {
            let Ok(lineas) = read_tail(p) else { continue };
            let a = actividad_de(&lineas, 40);
            for e in &a.eventos {
                assert!(!e.nombre.is_empty(), "un evento sin nombre en {p:?}");
                assert!(e.veces >= 1);
            }
            if !a.eventos.is_empty() && a.total_llamadas > 0 {
                con_eventos += 1;
            }
        }
        if !mejores.is_empty() {
            assert!(
                con_eventos > 0,
                "ningún transcript reciente dio actividad: o esta máquina no ha trabajado o el parser no lee el formato real",
            );
        }
    }

    /// Un transcript de meses no cabe en una pantalla: se abre por el final,
    /// que es donde estabas.
    #[test]
    fn una_conversacion_larga_se_abre_por_el_final() {
        let lineas: Vec<String> = (0..10)
            .flat_map(|i| {
                vec![
                    format!(r#"{{"type":"user","message":{{"content":"pregunta {i}"}}}}"#),
                    format!(
                        r#"{{"type":"assistant","message":{{"content":[{{"type":"text","text":"respuesta {i}"}}]}}}}"#
                    ),
                ]
            })
            .collect();
        let t = turnos_de(&lineas, 4);
        assert_eq!(t.len(), 4);
        assert_eq!(t[3].texto, "respuesta 9");
    }

    /// The bug Munir hit: 59 untitled rows that were Adeorq watching its own
    /// quota. A probe must be hidden, and a real session must never be.
    #[test]
    fn our_own_usage_probes_are_not_sessions() {
        let probe: Vec<String> = vec![
            r#"{"type":"queue-operation"}"#.into(),
            r#"{"type":"user","message":{"content":"<command-name>/usage</command-name>"}}"#.into(),
            r#"{"type":"system"}"#.into(),
            r#"{"type":"last-prompt","lastPrompt":""}"#.into(),
        ];
        assert!(is_own_usage_probe(&probe));

        // Someone asking about /usage in a real conversation is real work.
        let real: Vec<String> = vec![
            r#"{"type":"user","message":{"content":"<command-name>/usage</command-name>"}}"#.into(),
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"vas al 42%"}]}}"#
                .into(),
        ];
        assert!(!is_own_usage_probe(&real));

        // And a long session that merely mentions it stays too.
        let mut long: Vec<String> = (0..20)
            .map(|i| format!(r#"{{"type":"user","message":{{"content":"linea {i}"}}}}"#))
            .collect();
        long.push(
            r#"{"type":"user","message":{"content":"<command-name>/usage</command-name>"}}"#.into(),
        );
        assert!(!is_own_usage_probe(&long));

        assert!(!is_own_usage_probe(&[]));
    }

    /// Las líneas son las de verdad, recortadas de los transcripts de la
    /// máquina de Munir el 2026-08-14: la del Capataz venía de un mapa del
    /// Esquema y la suya de esta misma sesión.
    #[test]
    fn las_llamadas_del_capataz_no_son_sesiones_suyas() {
        let capataz: Vec<String> = vec![
            r#"{"type":"queue-operation","operation":"enqueue","content":"Eres el Capataz de Adeorq. Te dan un proyecto"}"#.into(),
            r#"{"parentUuid":null,"type":"user","userType":"external","entrypoint":"sdk-cli","promptSource":"sdk","cwd":"C:\\proyectos\\Adeorq"}"#.into(),
            r#"{"type":"assistant","entrypoint":"sdk-cli","cwd":"C:\\proyectos\\Adeorq"}"#.into(),
        ];
        assert!(es_de_programa(&capataz));

        // La suya, abierta a mano en una terminal, se queda.
        let suya: Vec<String> = vec![
            r#"{"type":"custom-title","customTitle":"Adeorq: sesiones y terminales"}"#.into(),
            r#"{"type":"user","userType":"external","entrypoint":"cli","promptSource":"typed","cwd":"C:\\proyectos\\Adeorq"}"#.into(),
        ];
        assert!(!es_de_programa(&suya));

        // Y la de la app de escritorio TAMBIÉN se queda, que se archiva en la
        // misma carpeta: «SESION SUPREMA» y «ORQUIO REGISTRO DE MARCA» son de
        // ahí, y la primera versión de este filtro se las llevaba por delante.
        let escritorio: Vec<String> = vec![
            r#"{"type":"custom-title","customTitle":"SESION SUPREMA"}"#.into(),
            r#"{"type":"user","entrypoint":"claude-desktop","cwd":"C:\\proyectos"}"#.into(),
            r#"{"type":"assistant","entrypoint":"claude-desktop"}"#.into(),
        ];
        assert!(!es_de_programa(&escritorio));

        // Un transcript viejo, de cuando el CLI no ponía la marca: ante la duda
        // se enseña, que perder una sesión suya es mucho peor que ver una fila
        // de más.
        let viejo: Vec<String> = vec![
            r#"{"type":"user","message":{"content":"arregla el pty"}}"#.into(),
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"hecho"}]}}"#.into(),
        ];
        assert!(!es_de_programa(&viejo));
        assert!(!es_de_programa(&[]));

        // Y manda la marca, no el título: un encargo suyo que EMPIECE igual que
        // un prompt del Capataz sigue siendo suyo.
        let disfrazada: Vec<String> = vec![
            r#"{"type":"user","entrypoint":"cli","message":{"content":"Eres el Capataz de Adeorq, dime que ves"}}"#.into(),
        ];
        assert!(!es_de_programa(&disfrazada));
    }

    /// El caso que casi se cuela: una sesión que abrió el Capataz para hacer un
    /// plan y que Munir retomó desde una terminal. Nació de un programa, pero
    /// dentro hay conversación suya, así que es suya.
    #[test]
    fn una_sesion_del_capataz_que_el_retomo_sigue_siendo_suya() {
        let retomada: Vec<String> = vec![
            r#"{"type":"user","entrypoint":"sdk-cli","promptSource":"sdk","message":{"content":"Eres el Capataz de Adeorq"}}"#.into(),
            r#"{"type":"assistant","entrypoint":"sdk-cli"}"#.into(),
            r#"{"type":"user","entrypoint":"cli","promptSource":"typed","message":{"content":"si dale, los pequeños solo"}}"#.into(),
        ];
        assert!(!es_de_programa(&retomada));

        // Con la marca de tecleado en cualquier sitio basta, aunque llegue
        // antes de saber cómo nació.
        let al_reves: Vec<String> = vec![
            r#"{"type":"user","promptSource":"typed","message":{"content":"go"}}"#.into(),
            r#"{"type":"user","entrypoint":"sdk-cli","promptSource":"sdk"}"#.into(),
        ];
        assert!(!es_de_programa(&al_reves));
    }

    #[test]
    fn el_valor_json_se_saca_sin_parsear_la_linea() {
        let l = r#"{"a":1,"entrypoint":"sdk-cli","cwd":"C:\\x"}"#;
        assert_eq!(valor_json(l, "\"entrypoint\":\""), Some("sdk-cli"));
        assert_eq!(valor_json(l, "\"noestá\":\""), None);
        // Una línea cortada por la mitad no puede reventar la lista entera.
        assert_eq!(valor_json(r#"{"entrypoint":"sdk-c"#, "\"entrypoint\":\""), None);
    }

    #[test]
    #[cfg(windows)]
    fn walks_up_to_the_transcript_folder() {
        assert_eq!(
            resume_dir(r"C:\proyectos\Orquio\docs", "C--proyectos-Orquio"),
            r"C:\proyectos\Orquio"
        );
    }

    /// Lo mismo donde las rutas se escriben con barras. Es el mismo camino de
    /// código, y merece su prueba en vez de darlo por hecho: el fallo de esta
    /// tarde fue justo ese, que la versión de Windows «pasaba» en Linux
    /// devolviendo una ruta con contrabarras que allí no abre nada.
    #[test]
    #[cfg(not(windows))]
    fn walks_up_to_the_transcript_folder() {
        assert_eq!(
            resume_dir("/home/munir/proyectos/Orquio/docs", "-home-munir-proyectos-Orquio"),
            "/home/munir/proyectos/Orquio"
        );
    }

    /// Claude Code escribe algunos `cwd` con barras normales aunque sea
    /// Windows, y sin normalizarlas la subida por el árbol no encontraba
    /// separador: ese era el «No conversation found».
    #[test]
    #[cfg(windows)]
    fn normalises_forward_slashes() {
        assert_eq!(
            resume_dir("C:/proyectos/Orquio/docs", "C--proyectos-Orquio"),
            r"C:\proyectos\Orquio"
        );
    }

    #[test]
    #[cfg(windows)]
    fn drive_root_sessions_resume_from_the_root() {
        // The "No conversation found" case: the transcript folder was "C--".
        assert_eq!(resume_dir(r"C:\proyectos\Orquio\docs\marca", "C--"), r"C:\");
    }

    /// VoCript-Core must not be read as VoCript\Core.
    ///
    /// Only on Windows, and not because of the drive letter: `decode_folder`
    /// WALKS THE DISK to resolve the ambiguity of the dash, so the test needs
    /// `C:\proyectos\VoCript-Core` to actually exist. It does on this machine
    /// and it never will on a CI runner.
    #[test]
    #[cfg(windows)]
    fn dashed_project_names_survive_the_rebuild() {
        assert_eq!(
            decode_folder("C--proyectos-VoCript-Core").as_deref(),
            Some(r"C:\proyectos\VoCript-Core")
        );
    }

    /// La otra forma de la misma codificación: en Linux la ruta empieza por
    /// barra, así que la carpeta del transcript empieza por guion. Sin esto,
    /// `decode_folder` devolvía `None` para TODAS las sesiones de un Linux y
    /// ninguna sabía de qué carpeta venía.
    #[test]
    fn a_linux_transcript_folder_starts_with_a_dash() {
        // La raíz sola, que no toca el disco y por eso se puede comprobar en
        // cualquier máquina: "/" se codifica como un guion suelto.
        assert_eq!(encode_claude("/"), "-");
        assert_eq!(decode_folder("-").as_deref(), Some("/"));
        // Y una carpeta que no existe sigue sin colarse.
        assert_eq!(decode_folder("-no-existe-esta-carpeta-de-aqui"), None);
    }

    /// Cómo se llama la fila de la barra en la que cae una sesión: dentro de la
    /// carpeta madre manda el primer tramo, y fuera de ella, la carpeta donde
    /// estés. Una raíz de unidad (`C:\`) se queda en `C:`, que no es bonito
    /// pero tampoco está vacío: cae en «sin proyecto» y se ve.
    #[test]
    fn a_project_is_named_after_its_first_folder_under_the_root() {
        let (base, dentro, fuera) = if cfg!(windows) {
            ("C:\\proyectos", "C:\\proyectos\\Adeorq\\src", "C:\\otra\\cosa")
        } else {
            ("/home/m/proyectos", "/home/m/proyectos/Adeorq/src", "/otra/cosa")
        };
        assert_eq!(project_of(dentro, "", base), "Adeorq");
        assert_eq!(project_of(fuera, "", base), "cosa");
    }

    /// Lo que faltaba: una conversación escrita con una SEGUNDA cuenta se lee
    /// igual y sale firmada con la suya.
    ///
    /// Cada cuenta es una carpeta de configuración con sus propios
    /// transcripts dentro (ver `accounts.rs`), y este lector solo miraba
    /// `~/.claude`. Munir entró con una cuenta nueva, trabajó con ella y su
    /// sesión no aparecía por ningún lado en la barra (2026-08-06). La firma
    /// no es un adorno: es lo que hace que `onResume` la vuelva a abrir en su
    /// cuenta, porque un `--resume` lanzado desde otra no la encuentra.
    #[test]
    fn a_session_written_on_a_second_account_is_found_and_signed() {
        let dir = std::env::temp_dir().join("adeorq-cuentas-test");
        let _ = std::fs::remove_dir_all(&dir);
        let cwd = dir.join("proj");
        let cuenta = dir.join("accounts").join("la-nueva");
        let carpeta = cuenta
            .join("projects")
            .join(encode_claude(&cwd.to_string_lossy()));
        std::fs::create_dir_all(&carpeta).unwrap();
        std::fs::write(
            carpeta.join("d721543f-c8f8-468a-87ac-863b6e536c31.jsonl"),
            concat!(
                r#"{"type":"user","cwd":"#,
                "\"",
                "PLACEHOLDER",
                "\"",
                r#","message":{"role":"user","content":"arregla el panel"}}"#,
                "\n",
                r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Hecho."}]}}"#,
                "\n",
            )
            .replace("PLACEHOLDER", &cwd.to_string_lossy().replace('\\', "\\\\")),
        )
        .unwrap();

        let ruta = cuenta.to_string_lossy().into_owned();
        let encontradas = escanear_raiz(
            &cuenta,
            &ruta,
            &SessionCache::default(),
            &HashSet::new(),
        );
        assert_eq!(encontradas.len(), 1, "el transcript de la otra cuenta se lee");
        assert_eq!(encontradas[0].cuenta, ruta, "y viene firmado con su cuenta");
        assert_eq!(encontradas[0].id, "d721543f-c8f8-468a-87ac-863b6e536c31");

        // Y la cuenta de siempre sigue firmando en blanco, que es lo que
        // distingue una fila marcada de una normal en la barra.
        let principal = escanear_raiz(&cuenta, "", &SessionCache::default(), &HashSet::new());
        assert_eq!(principal[0].cuenta, "");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// La barra de la izquierda TAL Y COMO le queda a Munir, contra su disco.
    ///
    /// No afirma nada: imprime a qué proyecto va a parar cada sesión y cuáles
    /// caen en el cajón de las sueltas, que es lo único que contesta a «la
    /// vinculación de las sesiones está mal». Se corre a mano:
    /// `cargo test --lib la_barra_de_verdad -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn la_barra_de_verdad() {
        let base = "C:\\proyectos";
        // Los proyectos son las carpetas de la raíz, como hace `list_projects`.
        let proyectos: std::collections::HashSet<String> = std::fs::read_dir(base)
            .map(|d| {
                d.flatten()
                    .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                    .map(|e| e.file_name().to_string_lossy().into_owned())
                    .collect()
            })
            .unwrap_or_default();

        let mut sesiones = Vec::new();
        for (cuenta, raiz) in raices_claude() {
            sesiones.extend(escanear_raiz(
                &raiz,
                &cuenta,
                &SessionCache::default(),
                &HashSet::new(),
            ));
        }
        for s in &mut sesiones {
            s.project = project_of(&s.cwd, &s.folder, base);
        }
        // Igual que la barra: solo lo que no está muerto de más de una semana.
        sesiones.retain(|s| s.fresh != "muerta");
        sesiones.sort_by(|a, b| a.hours.partial_cmp(&b.hours).unwrap());

        let mut por_grupo: std::collections::BTreeMap<String, Vec<&SessionInfo>> =
            Default::default();
        for s in &sesiones {
            let clave = if proyectos.contains(&s.project) {
                s.project.clone()
            } else {
                format!("SUELTA · {}", s.project)
            };
            por_grupo.entry(clave).or_default().push(s);
        }
        println!("\n{} sesiones vivas de menos de una semana\n", sesiones.len());
        for (grupo, lista) in &por_grupo {
            println!("{}  ({})", grupo, lista.len());
            for s in lista.iter().take(4) {
                println!(
                    "    {:>10}  [{}]  {:<42}  {}",
                    s.ago,
                    if s.cuenta.is_empty() {
                        "principal".to_owned()
                    } else {
                        s.cuenta.rsplit(['\\', '/']).next().unwrap_or("?").to_owned()
                    },
                    s.title.chars().take(42).collect::<String>(),
                    s.cwd
                );
            }
            if lista.len() > 4 {
                println!("    … y {} más", lista.len() - 4);
            }
        }
    }

    /// La lista de carpetas contra el disco de verdad de esta máquina: si
    /// Munir tiene una cuenta extra, tiene que estar aquí.
    #[test]
    fn the_real_accounts_of_this_machine_are_listed() {
        let raices = raices_claude();
        assert!(!raices.is_empty(), "siempre está al menos ~/.claude");
        assert_eq!(raices[0].0, "", "la primera es la de siempre");
        for (cuenta, raiz) in &raices {
            let n = std::fs::read_dir(raiz.join("projects"))
                .map(|d| d.flatten().count())
                .unwrap_or(0);
            println!(
                "{} · {} carpetas de proyecto",
                if cuenta.is_empty() { "~/.claude" } else { cuenta },
                n
            );
        }
    }

    #[test]
    fn context_reads_the_last_usage_of_a_transcript() {
        // A transcript ends with tool traffic; the meter must still find the
        // last assistant usage and size it against the model's window.
        let dir = std::env::temp_dir().join("adeorq-ctx-test");
        let _ = std::fs::remove_dir_all(&dir);
        let cwd = dir.join("proj");
        std::fs::create_dir_all(&cwd).unwrap();
        let claude = dir
            .join(".claude")
            .join("projects")
            .join(encode_claude(&cwd.to_string_lossy()));
        std::fs::create_dir_all(&claude).unwrap();
        let lines = concat!(
            r#"{"type":"assistant","message":{"model":"claude-opus-5[1m]","usage":{"input_tokens":10,"cache_read_input_tokens":150000,"cache_creation_input_tokens":50000}}}"#,
            "
",
            r#"{"type":"user","message":{"content":[{"type":"tool_result"}]}}"#,
            "
",
        );
        std::fs::write(claude.join("abc.jsonl"), lines).unwrap();

        let info = context_at(
            &dir.join(".claude").join("projects"),
            &cwd.to_string_lossy(),
            None,
        )
        .unwrap();
        assert_eq!(info.used, 200_010);
        assert_eq!(
            info.window, 1_000_000,
            "the [1m] variant must use the big window"
        );
        assert_eq!(info.percent, 20);
        // The pane inherits the session's state, which is what stops the
        // Foreman from reaping a terminal that is mid tool round.
        assert_eq!(info.state, "a_medias");
    }

    #[test]
    fn a_pane_waiting_for_munir_is_never_read_as_finished() {
        // The whole safety of "cerrar_panel" rests on this line: an agent that
        // ended its turn ASKING must not read the same as one that delivered.
        // Both ring the terminal bell, so only the transcript can tell them
        // apart — and getting it wrong means closing the pane holding his
        // unanswered question.
        let asked: Vec<String> = vec![
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"¿Lo mando ya o lo junto con el rediseño?"}]}}"#.into(),
        ];
        assert_eq!(last_message_state(&asked).unwrap().1, "ofrece");

        let menu: Vec<String> = vec![
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"AskUserQuestion"}]}}"#.into(),
        ];
        assert_eq!(last_message_state(&menu).unwrap().1, "pregunta");

        // Delivered: a statement, not a question. The only shape that may be
        // closed, together with "tuya".
        let done: Vec<String> = vec![
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Hecho: 24 archivos y el build en verde."}]}}"#.into(),
        ];
        assert_eq!(last_message_state(&done).unwrap().1, "lista");

        // Markdown closers must not hide the question mark.
        let bold: Vec<String> = vec![
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"**¿Sigo con el resto?**"}]}}"#.into(),
        ];
        assert_eq!(last_message_state(&bold).unwrap().1, "ofrece");

        // A subagent's own chatter is not the session talking to Munir.
        let sidechain: Vec<String> = vec![
            r#"{"type":"assistant","isSidechain":true,"message":{"content":[{"type":"text","text":"listo"}]}}"#.into(),
        ];
        assert!(last_message_state(&sidechain).is_none());
    }

    #[test]
    fn agents_are_counted_by_dispatch_minus_return() {
        // Two Tasks dispatched, one already reported back: one still working.
        let lines: Vec<String> = vec![
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Task"},{"type":"tool_use","id":"t2","name":"Task"}]}}"#.into(),
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1"}]}}"#.into(),
            // Prose mentioning Task( must not count: only real tool blocks do.
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"lancé un Task( de prueba"}]}}"#.into(),
        ];
        assert_eq!(count_agents(&lines, true), (1, 2));
        // Same transcript gone stale: nothing can still be running.
        assert_eq!(count_agents(&lines, false), (0, 2));
    }

    /// La lista del robot de la cabecera: quién es cada agente, qué hace y si
    /// sigue fuera. Tiene que cuadrar con el número que cuenta `count_agents`.
    #[test]
    fn cada_agente_sale_con_su_nombre_y_si_sigue_fuera() {
        let lines: Vec<String> = vec![
            r#"{"type":"assistant","timestamp":"2026-10-10T18:00:00Z","message":{"content":[{"type":"tool_use","id":"t1","name":"Agent","input":{"subagent_type":"Explore","description":"Mapa del editor"}},{"type":"tool_use","id":"t2","name":"Task","input":{"subagent_type":"Plan","description":"Plan de las terminales"}}]}}"#.into(),
            r#"{"type":"user","timestamp":"2026-10-10T18:04:00Z","message":{"content":[{"type":"tool_result","tool_use_id":"t1"}]}}"#.into(),
            r#"{"type":"assistant","timestamp":"2026-10-10T18:05:00Z","message":{"content":[{"type":"tool_use","id":"t3","name":"Agent","input":{"description":"Inventario","run_in_background":true}},{"type":"tool_use","id":"t4","name":"Bash","input":{"command":"ls"}}]}}"#.into(),
            r#"{"type":"user","timestamp":"2026-10-10T18:05:01Z","message":{"content":[{"type":"tool_result","tool_use_id":"t3"},{"type":"tool_result","tool_use_id":"t4","is_error":true}]}}"#.into(),
        ];
        let a = agentes_de(&lines, true);
        // El que sigue fuera, primero; luego los que volvieron, el último arriba.
        assert_eq!(a.iter().map(|x| x.que.as_str()).collect::<Vec<_>>(), ["Plan de las terminales", "Inventario", "Mapa del editor"]);
        assert_eq!((a[0].tipo.as_str(), a[0].vivo, a[0].hasta.clone()), ("Plan", true, None));
        // En segundo plano: su resultado es solo el acuse de que salió.
        assert_eq!((a[1].tipo.as_str(), a[1].fondo, a[1].vivo), ("agente", true, false));
        assert_eq!((a[2].vivo, a[2].hasta.as_deref(), a[2].fallo), (false, Some("2026-10-10T18:04:00Z"), false));
        // El error de OTRA herramienta (t4, un Bash) no es de ningún agente.
        assert!(a.iter().all(|x| !x.fallo));
        // Los vivos de la lista son los que cuenta la cabecera.
        assert_eq!(a.iter().filter(|x| x.vivo).count() as u32, count_agents(&lines, true).0);
        // Un transcript parado no tiene a nadie fuera, aunque no conste la vuelta.
        assert!(agentes_de(&lines, false).iter().all(|x| !x.vivo));
        // Y con muchos, los que siguen fuera caben siempre.
        let muchos: Vec<String> = (0..40)
            .map(|i| format!(r#"{{"type":"assistant","timestamp":"t","message":{{"content":[{{"type":"tool_use","id":"m{i}","name":"Agent","input":{{"description":"n{i}"}}}}]}}}}"#))
            .chain((0..30).map(|i| format!(r#"{{"type":"user","timestamp":"t","message":{{"content":[{{"type":"tool_result","tool_use_id":"m{i}"}}]}}}}"#)))
            .collect();
        let lista = agentes_de(&muchos, true);
        assert_eq!(lista.iter().filter(|x| x.vivo).count(), 10);
        assert_eq!(lista.len(), TOPE_AGENTES);
    }

    #[test]
    fn context_uses_the_last_iteration_and_infers_the_big_window() {
        // Munir saw 100%: the old maths added every call of the turn (255% of
        // 200k) and the [1m] tag is missing from `model` on 1M sessions.
        let dir = std::env::temp_dir().join("adeorq-ctx-iter");
        let _ = std::fs::remove_dir_all(&dir);
        let cwd = dir.join("proj");
        std::fs::create_dir_all(&cwd).unwrap();
        let claude = dir
            .join(".claude")
            .join("projects")
            .join(encode_claude(&cwd.to_string_lossy()));
        std::fs::create_dir_all(&claude).unwrap();
        let line = concat!(
            r#"{"type":"assistant","message":{"model":"claude-opus-4-8","usage":"#,
            r#"{"input_tokens":9,"cache_read_input_tokens":400000,"cache_creation_input_tokens":111503,"#,
            r#""iterations":[{"input_tokens":4,"cache_read_input_tokens":200000,"cache_creation_input_tokens":55000},"#,
            r#"{"input_tokens":5,"cache_read_input_tokens":300000,"cache_creation_input_tokens":11503}]}}}"#,
            "
"
        );
        std::fs::write(claude.join("s.jsonl"), line).unwrap();

        let info = context_at(
            &dir.join(".claude").join("projects"),
            &cwd.to_string_lossy(),
            None,
        )
        .unwrap();
        assert_eq!(
            info.used, 311_508,
            "must read the LAST call, not the sum of all"
        );
        assert_eq!(
            info.window, 1_000_000,
            "over 200k it can only be the 1M window"
        );
        assert_eq!(info.percent, 31);
    }

    #[test]
    fn the_window_comes_from_the_model_not_from_what_it_has_spent() {
        // Munir's pane read 120.566 / 200.000 on Sonnet 5 — 60 % of a window
        // that is actually a million, so really 12 %. The old rule only reached
        // for the big window once the spend had already passed 200k, which is
        // both late and backwards: the number fell as the session grew.
        assert_eq!(context_window("claude-sonnet-5"), 1_000_000);
        assert_eq!(context_window("claude-opus-5"), 1_000_000);
        assert_eq!(context_window("claude-opus-4-8"), 1_000_000);
        assert_eq!(context_window("claude-fable-5"), 1_000_000);
        // Haiku is the one current model that really is 200k.
        assert_eq!(context_window("claude-haiku-4-5"), 200_000);
        // The explicit tag still wins, and an unknown model stays conservative.
        assert_eq!(context_window("claude-haiku-4-5[1m]"), 1_000_000);
        assert_eq!(context_window("algo-que-no-existe-aun"), 200_000);
    }

    #[test]
    fn context_after_compacting_reads_the_mark_and_not_the_discarded_turn() {
        // Munir saw 131k right after compacting, with 11k actually loaded: the
        // last usage line belongs to the conversation that was just thrown
        // away, and nothing overwrites it until he says something.
        let dir = std::env::temp_dir().join("adeorq-ctx-compact");
        let _ = std::fs::remove_dir_all(&dir);
        let cwd = dir.join("proj");
        std::fs::create_dir_all(&cwd).unwrap();
        let claude = dir
            .join(".claude")
            .join("projects")
            .join(encode_claude(&cwd.to_string_lossy()));
        std::fs::create_dir_all(&claude).unwrap();
        let viejo = concat!(
            r#"{"type":"assistant","message":{"model":"claude-opus-5","usage":"#,
            r#"{"input_tokens":9,"cache_read_input_tokens":131859,"cache_creation_input_tokens":0}}}"#,
            "\n",
            r#"{"type":"user","isCompactSummary":true,"compactMetadata":{"trigger":"manual","#,
            r#""preTokens":200660,"postTokens":11237},"message":{"role":"user","#,
            r#""content":"This session is being continued from a previous conversation."}}"#,
            "\n",
        );
        std::fs::write(claude.join("s.jsonl"), viejo).unwrap();

        let projects = dir.join(".claude").join("projects");
        let info = context_at(&projects, &cwd.to_string_lossy(), None).unwrap();
        assert_eq!(info.used, 11_237, "what the summary left loaded, not what it dropped");
        assert_eq!(info.window, 1_000_000, "Opus 5 is a million-token window");
        assert_eq!(info.percent, 1);
        assert_eq!(
            info.model,
            pretty_model("claude-opus-5"),
            "the model still comes from the turn before: same session"
        );

        // And the moment a real turn happens, that turn is the truth again.
        let nuevo = concat!(
            r#"{"type":"assistant","message":{"model":"claude-opus-5","usage":"#,
            r#"{"input_tokens":9,"cache_read_input_tokens":20000,"cache_creation_input_tokens":0}}}"#,
            "\n",
        );
        std::fs::write(claude.join("s.jsonl"), format!("{viejo}{nuevo}")).unwrap();
        let info = context_at(&projects, &cwd.to_string_lossy(), None).unwrap();
        assert_eq!(info.used, 20_009, "a turn after the mark wins over the mark");
    }

    /// El primer `user` de un rollout de Codex lo escribe el propio CLI, no
    /// Munir: es un `<environment_context>` con el cwd y el shell. Si colara,
    /// TODAS las sesiones de Codex se llamarían igual en la lista.
    #[test]
    fn a_codex_title_is_what_munir_typed_not_what_the_cli_injected() {
        let lines: Vec<String> = vec![
            r#"{"type":"response_item","payload":{"role":"user","content":[{"text":"<environment_context><cwd>C:\\proyectos</cwd></environment_context>"}]}}"#.into(),
            r#"{"type":"event_msg","payload":{"type":"user_message","message":"<environment_context>\n  <cwd>C:\\proyectos</cwd>\n</environment_context>"}}"#.into(),
            r#"{"type":"event_msg","payload":{"type":"agent_message","message":"claro que sí"}}"#.into(),
            r#"{"type":"event_msg","payload":{"type":"user_message","message":"arréglame el buscador"}}"#.into(),
            r#"{"type":"event_msg","payload":{"type":"user_message","message":"y luego el login"}}"#.into(),
        ];
        assert_eq!(codex_titulo(&lines), "arréglame el buscador");
    }

    /// Borrar una sesión de Codex no borraba nada, y la sesión volvía a la
    /// lista al siguiente repaso del disco (Munir, 2026-08-08). El motivo es
    /// este: Codex guarda por FECHA y con un nombre de archivo que se inventa
    /// él, así que su ruta no se puede componer a partir del id como la de
    /// Claude; hay que buscarla leyendo la cabecera de cada rollout.
    ///
    /// El test escribe un árbol como el suyo y comprueba las dos mitades: que
    /// encuentra el archivo del id pedido aunque no se llame como él, y que no
    /// devuelve otro por equivocación (que sería borrar la conversación de
    /// alguien que no habías tocado).
    #[test]
    fn a_codex_session_is_found_by_its_id_and_not_by_its_file_name() {
        let raiz = std::env::temp_dir().join(format!("adeorq-codex-{}", std::process::id()));
        let dia = raiz.join("2026").join("08").join("07");
        let _ = std::fs::remove_dir_all(&raiz);
        std::fs::create_dir_all(&dia).unwrap();

        let cabecera = |id: &str| {
            format!(
                r#"{{"type":"session_meta","payload":{{"cwd":"C:\\proyectos\\Adeorq","session_id":"{id}"}}}}"#
            )
        };
        // Nombres como los que pone Codex: la hora dentro y el id al final, o
        // sea nada que se pueda componer desde fuera.
        std::fs::write(dia.join("rollout-2026-08-07T10-11-12-aaa.jsonl"), cabecera("aaa")).unwrap();
        std::fs::write(dia.join("rollout-2026-08-07T18-19-20-bbb.jsonl"), cabecera("bbb")).unwrap();
        // Un archivo que no es un rollout: no puede confundir la búsqueda.
        std::fs::write(dia.join("notas.txt"), "nada").unwrap();

        let hallado = codex_transcript_en(&raiz, "bbb").expect("tendría que encontrarla");
        assert_eq!(
            hallado.file_name().unwrap().to_string_lossy(),
            "rollout-2026-08-07T18-19-20-bbb.jsonl",
            "el id vive DENTRO del archivo, no en su nombre",
        );
        assert!(
            codex_transcript_en(&raiz, "no-existe").is_none(),
            "un id desconocido devuelve nada, en vez de el primero que pille",
        );

        let _ = std::fs::remove_dir_all(&raiz);
    }

    /// Un panel de Codex aprende su sesión del disco, y tiene que ser LA SUYA.
    /// El árbol calca los rollouts de verdad de esta máquina (2026-10-06): un
    /// hilo principal viejo en la carpeta, sus subagentes y su «guardian» (con
    /// `parent_thread_id`), uno principal de otra carpeta, y dos principales
    /// nuevos en la carpeta, uno por panel abierto.
    #[test]
    fn a_codex_pane_learns_the_first_main_thread_born_after_it_in_its_folder() {
        let raiz = std::env::temp_dir().join(format!("adeorq-codex-nace-{}", std::process::id()));
        let dia = raiz.join("2026").join("10").join("06");
        let _ = std::fs::remove_dir_all(&raiz);
        std::fs::create_dir_all(&dia).unwrap();
        let meta = |id: &str, cwd: &str, cuando: &str, padre: Option<&str>| {
            let padre = padre.map_or("null".to_string(), |p| format!("\"{p}\""));
            format!(
                r#"{{"timestamp":"{cuando}","type":"session_meta","payload":{{"session_id":"{id}","id":"{id}","parent_thread_id":{padre},"timestamp":"{cuando}","cwd":"{cwd}","originator":"codex_cli_rs"}}}}"#
            )
        };
        let aq = r"C:\\proyectos\\Adeorq";
        let escribe = |nombre: &str, texto: String| std::fs::write(dia.join(nombre), texto).unwrap();
        escribe("rollout-A-viejo.jsonl", meta("viejo", aq, "2026-10-06T09:00:00.000Z", None));
        escribe("rollout-B-sub.jsonl", meta("sub", aq, "2026-10-06T10:00:30.000Z", Some("viejo")));
        escribe("rollout-C-guardian.jsonl", meta("guardian", aq, "2026-10-06T10:00:40.000Z", Some("viejo")));
        escribe("rollout-D-otra.jsonl", meta("otra", r"C:\\proyectos\\VoCript", "2026-10-06T10:00:50.000Z", None));
        escribe("rollout-E-panel1.jsonl", meta("panel1", aq, "2026-10-06T10:01:00.000Z", None));
        escribe("rollout-F-panel2.jsonl", meta("panel2", aq, "2026-10-06T10:02:00.000Z", None));

        // 10:00:00Z del 6 de octubre de 2026.
        let diez = iso_a_segundos("2026-10-06T10:00:00.000Z").unwrap();
        let cwd = "C:\\proyectos\\Adeorq";
        assert_eq!(
            codex_session_since_en(&raiz, cwd, diez).as_deref(),
            Some("panel1"),
            "el primer hilo principal que nace después del panel, no un subagente ni el más nuevo",
        );
        assert_eq!(
            codex_session_since_en(&raiz, cwd, diez + 90).as_deref(),
            Some("panel2"),
            "el segundo panel, abierto minuto y medio después, se lleva el suyo",
        );
        assert!(
            codex_session_since_en(&raiz, cwd, diez + 200).is_none(),
            "antes del primer turno no hay rollout, y entonces no se aprende nada",
        );
        assert!(
            codex_session_since_en(&raiz, "C:\\proyectos\\Otro", diez).is_none(),
            "otra carpeta no se lleva el hilo de esta",
        );
        let _ = std::fs::remove_dir_all(&raiz);
    }

    #[test]
    fn codex_timestamps_turn_into_seconds() {
        assert_eq!(iso_a_segundos("1970-01-01T00:00:00.000Z"), Some(0));
        // 2026-01-01 son 1 767 225 600; el 22 de septiembre es el día 265.
        assert_eq!(iso_a_segundos("2026-09-22T20:22:52.825Z"), Some(1_790_108_572));
        assert_eq!(iso_a_segundos("2026-03-01T00:00:00Z"), Some(1_772_323_200), "año bisiesto por en medio");
        assert_eq!(iso_a_segundos("2026-09-22T20:22:52"), None, "sin la Z no se sabe la zona");
        assert_eq!(iso_a_segundos("ayer"), None);
    }

    /// Y lo MISMO con Pi, que volvió a caer en el agujero cuatro días después
    /// (Munir, 2026-08-12: «esta sesión en concreto no me deja eliminarla, le
    /// doy a la papelera aceptar y no se elimina»). Su fichero se llama
    /// `<marca-de-tiempo>_<id>.jsonl`, así que la ruta tampoco se puede
    /// componer desde el id, y `analyze_pi` deja la carpeta de Claude vacía:
    /// sin esta búsqueda, borrar armaba `~/.claude/projects//<id>.jsonl`.
    ///
    /// El árbol del test es el de su disco de verdad, leído el mismo día: una
    /// subcarpeta con el cwd codificado a la manera de Pi.
    #[test]
    fn a_pi_session_is_found_by_its_id_and_not_by_its_file_name() {
        let raiz = std::env::temp_dir().join(format!("adeorq-pi-{}", std::process::id()));
        let proyecto = raiz.join("--C--proyectos--");
        let _ = std::fs::remove_dir_all(&raiz);
        std::fs::create_dir_all(&proyecto).unwrap();

        let cabecera = |id: &str| {
            format!(
                r#"{{"type":"session","version":3,"id":"{id}","timestamp":"2026-08-08T09:46:21.411Z","cwd":"C:\\proyectos"}}"#
            )
        };
        std::fs::write(
            proyecto.join("2026-08-08T09-46-21-411Z_aaa.jsonl"),
            cabecera("aaa"),
        )
        .unwrap();
        std::fs::write(
            proyecto.join("2026-08-08T11-22-33-444Z_bbb.jsonl"),
            cabecera("bbb"),
        )
        .unwrap();
        // Suelto en la raíz, que `scan_pi` también mira: si Pi dejara de anidar
        // por proyecto, la búsqueda tiene que seguir encontrándolo.
        std::fs::write(raiz.join("2026-08-09T00-00-00-000Z_ccc.jsonl"), cabecera("ccc")).unwrap();
        std::fs::write(proyecto.join("notas.txt"), "nada").unwrap();

        let hallado = pi_transcript_en(&raiz, "bbb").expect("tendría que encontrarla");
        assert_eq!(
            hallado.file_name().unwrap().to_string_lossy(),
            "2026-08-08T11-22-33-444Z_bbb.jsonl",
            "el id vive DENTRO del archivo; delante lleva la marca de tiempo",
        );
        assert_eq!(
            pi_transcript_en(&raiz, "ccc")
                .expect("la de la raíz también cuenta")
                .file_name()
                .unwrap()
                .to_string_lossy(),
            "2026-08-09T00-00-00-000Z_ccc.jsonl",
        );
        assert!(
            pi_transcript_en(&raiz, "no-existe").is_none(),
            "un id desconocido devuelve nada, en vez de el primero que pille",
        );

        let _ = std::fs::remove_dir_all(&raiz);
    }

    /// Munir pega capturas a menudo, y ese turno llega sin una palabra: solo
    /// «[Image #1] [Image #2]…». Como título no dice nada, así que el bueno es
    /// el siguiente. Salió en su disco de verdad el 2026-07-31.
    #[test]
    fn a_turn_of_only_pasted_images_is_not_a_title() {
        assert!(solo_imagenes("[Image #1] [Image #2] [Image #3]"));
        assert!(solo_imagenes("[Image #1]"));
        assert!(!solo_imagenes("[Image #1] mira esto"));
        assert!(!solo_imagenes("arréglame el buscador"));

        let lines: Vec<String> = vec![
            r#"{"type":"event_msg","payload":{"type":"user_message","message":"[Image #1] [Image #2]"}}"#.into(),
            r#"{"type":"event_msg","payload":{"type":"user_message","message":"esto de la captura no va"}}"#.into(),
        ];
        assert_eq!(codex_titulo(&lines), "esto de la captura no va");
    }

    /// Contra el disco de verdad, para comprobar de un vistazo que el lector
    /// encuentra lo que hay. Va `ignore` porque depende de que la máquina tenga
    /// Codex usado: `cargo test -- --ignored codex_de_verdad --nocapture`.
    #[test]
    #[ignore]
    fn codex_de_verdad() {
        let s = scan_codex();
        println!("sesiones de Codex encontradas: {}", s.len());
        for x in &s {
            println!("  [{}] {} · {} · {}", x.fuente, x.project, x.ago, x.title);
        }
    }

    #[test]
    fn a_codex_session_with_nothing_typed_has_no_title() {
        let solo_ruido: Vec<String> = vec![
            r#"{"type":"event_msg","payload":{"type":"token_count","total":10}}"#.into(),
            r#"{"type":"event_msg","payload":{"type":"user_message","message":""}}"#.into(),
        ];
        assert_eq!(codex_titulo(&solo_ruido), "");
        assert_eq!(codex_titulo(&[]), "");
    }
}

#[cfg(test)]
mod coste_tests {
    use super::*;

    /// Cuánto cuesta barrer cada cuenta, contra el disco de verdad.
    ///
    /// La pregunta de Munir (2026-08-07): «¿el lag tendrá que ver con tener dos
    /// cuentas trabajando a la vez?». Esto contesta la parte que le toca al
    /// lector de sesiones, que es lo único que crece con el número de cuentas.
    /// `cargo test --lib lo_que_cuesta_cada_cuenta -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn lo_que_cuesta_cada_cuenta() {
        use std::time::Instant;
        let live = HashSet::new();
        // Dos vueltas: la primera con la caché fría, la segunda como el panel
        // la encuentra de verdad cada 45 segundos.
        for vuelta in 1..=2 {
            let cache = SessionCache::default();
            if vuelta == 2 {
                for (cuenta, raiz) in raices_claude() {
                    let _ = escanear_raiz(&raiz, &cuenta, &cache, &live);
                }
            }
            let mut total = 0u128;
            for (cuenta, raiz) in raices_claude() {
                let t = Instant::now();
                let n = escanear_raiz(&raiz, &cuenta, &cache, &live).len();
                let ms = t.elapsed().as_millis();
                total += ms;
                println!(
                    "vuelta {vuelta} · {:<48} {n:>4} sesiones en {ms:>5} ms",
                    if cuenta.is_empty() { "~/.claude (la de siempre)" } else { &cuenta }
                );
            }
            println!("vuelta {vuelta} · TOTAL {total} ms\n");
        }
    }
}

/// Pasar UN transcript de verdad por el escáner y ver qué saca, o por qué lo
/// descarta. Para «¿por qué no sale la sesión de tal proyecto?»:
///   TRANSCRIPT="C:\Users\...\x.jsonl" cargo test --lib mira_un_transcript -- --ignored --nocapture
#[cfg(test)]
mod mira_transcript {
    use super::*;

    #[test]
    #[ignore]
    fn mira_un_transcript() {
        let ruta = std::env::var("TRANSCRIPT").expect("TRANSCRIPT=<ruta del .jsonl>");
        let path = Path::new(&ruta);
        let folder = path.parent().and_then(|p| p.file_name()).map(|f| f.to_string_lossy().into_owned()).unwrap_or_default();
        let meta = std::fs::metadata(path).expect("no existe");
        let lines = read_tail(path).expect("no se lee");
        println!("líneas en la cola: {}", lines.len());
        println!("vacío: {} · sonda propia: {} · de programa: {}", lines.is_empty(), is_own_usage_probe(&lines), es_de_programa(&lines));
        println!("último mensaje: {:?}", last_message_state(&lines));
        match analyze_uncached(path, &folder, 0, meta.len()) {
            Some(info) => println!("SALE: {}", serde_json::to_string_pretty(&info).unwrap()),
            None => println!("NO SALE"),
        }
    }
}
