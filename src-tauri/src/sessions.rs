// Claude Code session scanner, ported from Sionorq's sionorq.py (proven logic:
// titles live near the tail as custom-title/ai-title/last-prompt lines, state
// is derived from the last real user/assistant message, live sessions are the
// ~/.claude/sessions/*.json files whose PID is still running).
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
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
    /// aunque no lo fueran. De primera clase, como en Sionorq: es lo que
    /// permite que un proyecto enseñe junto lo que ha pasado en él, lo abriera
    /// quien lo abriera.
    pub fuente: String,
}

#[derive(Default)]
pub struct SessionCache(pub Mutex<HashMap<PathBuf, (u64, u64, Option<SessionInfo>)>>);

fn claude_dir() -> Option<PathBuf> {
    crate::dir_casa().map(|h| h.join(".claude"))
}

fn read_tail(path: &Path) -> std::io::Result<Vec<String>> {
    let mut f = std::fs::File::open(path)?;
    let size = f.metadata()?.len();
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
    let Some(dir) = claude_dir().map(|d| d.join("sessions")) else {
        return live;
    };
    let Ok(entries) = std::fs::read_dir(dir) else {
        return live;
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
    live
}

fn ago_text(hours: f64) -> String {
    if hours < 1.0 {
        return format!("hace {} min", (hours * 60.0).max(1.0) as u32);
    }
    if hours < 24.0 {
        return format!("hace {} h", hours as u32);
    }
    let days = (hours / 24.0) as u32;
    if days == 1 {
        "hace 1 día".into()
    } else {
        format!("hace {} días", days)
    }
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
                let rest = &c[base.len() + 1..];
                return rest.split(SEP).next().unwrap_or(rest).to_owned();
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

fn analyze_uncached(path: &Path, folder: &str, mtime: u64, size: u64) -> Option<SessionInfo> {
    let lines = read_tail(path).ok()?;
    if lines.is_empty() || is_own_usage_probe(&lines) {
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
    let projects_dir = claude_dir()
        .map(|d| d.join("projects"))
        .ok_or("no sé cuál es tu carpeta de usuario")?;
    let live = live_session_ids();
    let mut out = Vec::new();

    let entries = std::fs::read_dir(&projects_dir).map_err(|e| e.to_string())?;
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
            if let Some(mut info) = analyze(&path, &folder, &cache) {
                info.live = live.contains(&info.id);
                out.push(info);
            }
        }
    }
    // Y las de los otros clientes, que van al mismo saco a propósito: el panel
    // ordena por proyecto y por antigüedad, no por quién las abrió, así que un
    // proyecto enseña su día entero de una vez.
    out.extend(scan_codex());
    out.extend(scan_pi());

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
/// SIN VERIFICAR EN ESTA MÁQUINA: Pi no está instalado aquí — no existe ni
/// `~/.pi` (comprobado en disco el 2026-08-01) — así que no hay ningún
/// fichero real que mirar para confirmar el formato. Lo único que se sabe de
/// verdad, por haber leído el código fuente de Pi (no su web), es la carpeta
/// y que agrupa por cwd en vez de por fecha como Codex; el resto (si cada
/// sesión es un `.json` o un `.jsonl`, si hay un nivel de subcarpetas por
/// proyecto o más, cómo se llama el campo del cwd y el del id) es una
/// suposición calcada de Claude Code y Codex, que es la única referencia que
/// hay. Por eso `analyze_pi` es defensivo: si el fichero que encuentra no
/// tiene un cwd y un id reconocibles, se descarta esa sesión sin inventar
/// nada, y si la carpeta no existe (como en esta máquina) se devuelve vacío.
///
/// Cuando Pi esté instalado en algún sitio, comprobar en su disco: (1) la
/// extensión real de cada fichero de sesión, (2) si el cwd viene en la
/// primera línea como aquí se prueba o hay que leerlo de otra parte, (3) si
/// el nombre de la subcarpeta ya ES el cwd (crudo o codificado tipo Claude)
/// en vez de tener que abrir el fichero para saberlo.
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
    })
}

/// Antigravity CLI (`agy`, Google's terminal agent, successor to Gemini CLI).
/// Its Windows installer drops the binary in %LOCALAPPDATA%\Antigravity\;
/// a PATH install counts too. Returns the command Adeorq should run in a pane.
#[tauri::command]
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

/// How full the context of a pane's session is. Reads the tail of the
/// transcript (the CLI records usage on every assistant message), so it costs
/// nothing and needs no API call. Falls back to the newest transcript of the
/// pane's folder when the session id is unknown (a fresh `claude`).
#[tauri::command]
pub async fn session_context(cwd: String, session_id: Option<String>) -> Option<ContextInfo> {
    context_at(&claude_dir()?.join("projects"), &cwd, session_id)
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
fn context_at(projects: &Path, cwd: &str, session_id: Option<String>) -> Option<ContextInfo> {
    let dir = projects.join(encode_claude(cwd));
    let path = match session_id {
        Some(id) if !id.is_empty() => {
            let p = dir.join(format!("{id}.jsonl"));
            p.exists().then_some(p)?
        }
        _ => newest_transcript(&dir)?,
    };
    // Who this transcript belongs to, named the way every other command names
    // it: the folder under ~/.claude/projects, and the file's own stem.
    let session_id = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let folder = dir
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();

    let lines = read_tail(&path).ok()?;
    let fresh = std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .and_then(|t| t.elapsed().map_err(std::io::Error::other))
        .map(|age| age.as_secs() < AGENTS_STALE_S)
        .unwrap_or(false);
    let (agents_live, agents_total) = count_agents(&lines, fresh);
    // Same reading the session list uses, so a pane and its row never disagree.
    let state = last_message_state(&lines)
        .map(|(_, s)| s)
        .unwrap_or_default();
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
    })
}

/// Whether a session left a transcript on disk. Restoring panes after a
/// restart needs it: `--resume` on a session that never got a message fails
/// with "No conversation found", so those are reopened as fresh instead.
#[tauri::command]
pub async fn transcript_exists(cwd: String, session_id: String) -> bool {
    claude_dir()
        .map(|d| {
            d.join("projects")
                .join(encode_claude(&cwd))
                .join(format!("{session_id}.jsonl"))
                .exists()
        })
        .unwrap_or(false)
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
    let dir = claude_dir()?.join("projects").join(encode_claude(&cwd));
    let path = match session_id {
        Some(id) if !id.is_empty() => {
            let p = dir.join(format!("{id}.jsonl"));
            p.exists().then_some(p)?
        }
        _ => newest_transcript(&dir)?,
    };
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

#[tauri::command]
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
