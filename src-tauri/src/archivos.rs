// Leer y escribir los archivos del proyecto, para el panel de Archivos.
//
// ── POR QUÉ NO VALE `esquema.rs`, QUE YA RECORRE CARPETAS ────────────────────
//
// Porque recorre el proyecto ENTERO de una sentada para dibujar un mapa. Un
// explorador hace lo contrario: lee UNA carpeta, la que acabas de desplegar, y
// no toca las demás hasta que las abras. Con un mapa esperas; con un árbol, no.
// Es la misma decisión que toma Orca (`file-explorer-directory-listing.ts`), y
// está anotada en `docs/ARCHIVOS.md`.
//
// ── LA PARTE QUE NO TIENE UN EDITOR NORMAL ──────────────────────────────────
//
// En VS Code el archivo lo cambias tú. Aquí lo cambia un agente mientras lo
// miras, y eso convierte «guardar» en algo que puede borrar trabajo ajeno. Por
// eso `guardar_archivo` recibe CUÁNDO se leyó lo que hay en pantalla: si el
// disco es más nuevo que eso, no escribe y lo dice. La decisión de qué hacer
// (recargar, comparar, pisar) es de quien mira, no de esta función.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Lo que nunca se lista. Misma lista que `esquema.rs`, y por el mismo motivo:
/// `node_modules` tiene decenas de miles de archivos y ninguno es tuyo.
const FUERA: &[&str] = &[
    "node_modules", "target", ".git", "dist", "build", ".next", ".nuxt",
    "vendor", "__pycache__", ".venv", "venv", ".cache", "coverage", ".turbo",
    "out", ".svelte-kit", "Pods", ".gradle",
];

/// Tope de lectura. Un archivo más gordo que esto no se abre entero: se dice lo
/// que pesa y ya. Un editor que se cuelga con un log de 300 MB es peor que uno
/// que se niega.
const TOPE: u64 = 2 * 1024 * 1024;

/// Cuánto se mira para decidir si es texto. Un PNG tiene ceros en la cabecera,
/// así que con el principio basta y no hay que leer el archivo entero.
const OLFATO: usize = 8 * 1024;

#[derive(Serialize)]
pub struct Entrada {
    pub nombre: String,
    pub ruta: String,
    pub carpeta: bool,
    pub peso: u64,
    /// Cuándo se tocó por última vez, en milisegundos: es lo que pinta en
    /// amarillo un archivo que un agente está escribiendo ahora mismo.
    pub cuando: f64,
}

/// Un archivo que git ve distinto del último commit.
#[derive(Serialize, Debug, PartialEq)]
pub struct Cambio {
    pub ruta: String,
    /// "M" cambiado, "A" nuevo, "D" borrado, "R" renombrado, "U" en conflicto.
    pub estado: String,
    /// Cuándo se tocó, en milisegundos; 0 si ya no existe.
    pub cuando: f64,
}

#[derive(Serialize)]
pub struct EstadoArchivos {
    /// La carpeta está dentro de un repositorio de git.
    pub git: bool,
    pub cambios: Vec<Cambio>,
}

/// Cuántos cambios se devuelven como mucho: una carpeta con veinte mil archivos
/// sin ignorar no puede colgar la barra cada dos segundos y medio.
const TOPE_CAMBIOS: usize = 3000;

#[derive(Serialize)]
pub struct Carpeta {
    pub ruta: String,
    pub filas: Vec<Entrada>,
}

#[derive(Serialize)]
pub struct Archivo {
    pub ruta: String,
    /// El contenido, ya con saltos de línea normalizados a `\n`. `None` cuando
    /// no se puede enseñar, y entonces `pega` dice por qué.
    pub texto: Option<String>,
    /// "grande" o "binario". `None` si el texto vino bien.
    pub pega: Option<String>,
    pub peso: u64,
    /// Cuándo se tocó por última vez, en milisegundos. Es lo que hay que
    /// devolver al guardar para que se note si alguien lo cambió por debajo.
    pub cuando: f64,
    /// Venía con saltos de Windows. Se guarda para devolverlo como estaba: un
    /// archivo que entra con CRLF y sale con LF aparece en `git diff` entero
    /// aunque solo hayas tocado una línea.
    pub crlf: bool,
}

#[derive(Serialize)]
pub struct Guardado {
    /// La marca de tiempo nueva, para seguir vigilando desde ahí.
    pub cuando: f64,
    /// No se escribió NADA porque el disco es más nuevo que lo que se leyó.
    pub pisaria: bool,
}

/// Milisegundos desde el epoch, o 0 si el sistema no lo sabe.
fn cuando_de(meta: &std::fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

/// Una ruta utilizable, o el porqué de que no lo sea. Rechaza lo vacío y lo
/// relativo: todo lo que llega aquí sale de un listado nuestro, así que una
/// ruta a medias es un fallo de quien llama, no algo que apañar.
fn ruta_de(p: &str) -> Result<PathBuf, String> {
    let ruta = Path::new(p);
    if p.is_empty() || !ruta.is_absolute() {
        return Err("ruta no válida".into());
    }
    Ok(ruta.to_path_buf())
}

/// Lista UNA carpeta. Carpetas primero y por nombre, que es como lo espera
/// cualquiera que haya abierto un explorador en su vida.
#[tauri::command]
pub async fn listar_carpeta(ruta: String) -> Result<Carpeta, String> {
    let dir = ruta_de(&ruta)?;
    let leidas = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;

    let mut filas: Vec<Entrada> = Vec::new();
    for entrada in leidas.flatten() {
        let nombre = entrada.file_name().to_string_lossy().to_string();
        let Ok(meta) = entrada.metadata() else { continue };
        let carpeta = meta.is_dir();
        if carpeta && FUERA.contains(&nombre.as_str()) {
            continue;
        }
        filas.push(Entrada {
            ruta: entrada.path().to_string_lossy().to_string(),
            nombre,
            carpeta,
            peso: if carpeta { 0 } else { meta.len() },
            cuando: cuando_de(&meta),
        });
    }

    filas.sort_by(|a, b| match (a.carpeta, b.carpeta) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.nombre.to_lowercase().cmp(&b.nombre.to_lowercase()),
    });

    Ok(Carpeta {
        ruta: dir.to_string_lossy().to_string(),
        filas,
    })
}

/// Lee un archivo para verlo. Nunca devuelve un error por ser gordo o binario:
/// eso no es un fallo, es una respuesta, y el panel tiene que poder decirlo con
/// sus palabras en vez de enseñar un mensaje de excepción.
#[tauri::command]
pub async fn leer_archivo(ruta: String) -> Result<Archivo, String> {
    let f = ruta_de(&ruta)?;
    let meta = std::fs::metadata(&f).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        return Err("es una carpeta".into());
    }
    let peso = meta.len();
    let cuando = cuando_de(&meta);
    let salida = |texto, pega, crlf| Archivo {
        ruta: f.to_string_lossy().to_string(),
        texto,
        pega,
        peso,
        cuando,
        crlf,
    };

    if peso > TOPE {
        return Ok(salida(None, Some("grande".into()), false));
    }

    let bytes = std::fs::read(&f).map_err(|e| e.to_string())?;
    let hasta = bytes.len().min(OLFATO);
    if bytes[..hasta].contains(&0) {
        return Ok(salida(None, Some("binario".into()), false));
    }

    // Y si no es UTF-8 tampoco es texto para nosotros: enseñar caracteres de
    // reemplazo sería peor que decir la verdad, porque al guardar se
    // escribirían tal cual y el archivo quedaría destrozado.
    let Ok(bruto) = String::from_utf8(bytes) else {
        return Ok(salida(None, Some("binario".into()), false));
    };

    let crlf = bruto.contains("\r\n");
    let texto = if crlf { bruto.replace("\r\n", "\n") } else { bruto };
    Ok(salida(Some(texto), None, crlf))
}

/// Cuándo se tocó un archivo por última vez, y nada más. El editor lo pregunta
/// cada poco por el que tienes delante, para enterarse de que un agente lo ha
/// reescrito sin esperar a que intentes guardar. Cero si ya no está.
#[tauri::command]
pub async fn cuando_archivo(ruta: String) -> Result<f64, String> {
    let f = ruta_de(&ruta)?;
    Ok(std::fs::metadata(&f).map(|m| cuando_de(&m)).unwrap_or(0.0))
}

/// Tope de una imagen. Va entera a la ventana, en base64, así que más que esto
/// es mucha memoria para algo que se mira un momento.
const TOPE_IMAGEN: u64 = 12 * 1024 * 1024;

/// El tipo con el que se sirve una imagen, por su extensión. El SVG no está a
/// propósito: es texto y se abre en el editor, que es donde se puede cambiar.
fn tipo_de_imagen(ruta: &Path) -> Option<&'static str> {
    let ext = ruta.extension()?.to_string_lossy().to_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        _ => return None,
    })
}

/// Una imagen lista para un `<img>` (`data:<tipo>;base64,…`), o nada si no lo
/// es o pesa demasiado.
///
/// Va así y no por el protocolo de assets porque ese solo deja leer las
/// carpetas de datos de Adeorq (`tauri.conf.json`): abrirlo a las de los
/// proyectos sería dejar que cualquier página metida en la ventana lea el disco.
#[tauri::command]
pub async fn leer_imagen(ruta: String) -> Result<Option<String>, String> {
    use base64::Engine;
    let f = ruta_de(&ruta)?;
    let Some(tipo) = tipo_de_imagen(&f) else {
        return Ok(None);
    };
    let meta = std::fs::metadata(&f).map_err(|e| e.to_string())?;
    if meta.is_dir() || meta.len() > TOPE_IMAGEN {
        return Ok(None);
    }
    let bytes = std::fs::read(&f).map_err(|e| e.to_string())?;
    let datos = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(Some(format!("data:{tipo};base64,{datos}")))
}

/// Hasta cuánto pesa un PDF que se enseña entero.
const TOPE_PDF: u64 = 40 * 1024 * 1024;

/// Un PDF en base64, para que la ventana lo enseñe con el visor del propio
/// WebView (`blob:` en un marco), o nada si no lo es o pesa demasiado. Por lo
/// mismo que `leer_imagen`: el protocolo de assets no ve las carpetas de los
/// proyectos, y abrírselo sería dejar que cualquier página lea el disco.
#[tauri::command]
pub async fn leer_pdf(ruta: String) -> Result<Option<String>, String> {
    use base64::Engine;
    let f = ruta_de(&ruta)?;
    if !f.extension().is_some_and(|e| e.eq_ignore_ascii_case("pdf")) {
        return Ok(None);
    }
    let meta = std::fs::metadata(&f).map_err(|e| e.to_string())?;
    if meta.is_dir() || meta.len() > TOPE_PDF {
        return Ok(None);
    }
    let bytes = std::fs::read(&f).map_err(|e| e.to_string())?;
    // Un PDF empieza por «%PDF-»: lo demás con esa extensión no se le da al visor.
    if !bytes.starts_with(b"%PDF-") {
        return Ok(None);
    }
    Ok(Some(base64::engine::general_purpose::STANDARD.encode(bytes)))
}

/// Guarda, salvo que eso fuera a pisar trabajo de otro.
///
/// `visto` es cuándo se leyó lo que hay en pantalla. Si el archivo del disco es
/// más nuevo, alguien (casi siempre un agente) lo reescribió mientras tanto:
/// aquí se para y se devuelve `pisaria: true`. Sin esto, el guardado se lleva
/// por delante lo que el agente acabara de escribir y nadie se entera hasta que
/// falla algo tres horas después.
#[tauri::command]
pub async fn guardar_archivo(
    ruta: String,
    texto: String,
    crlf: bool,
    visto: Option<f64>,
    forzar: Option<bool>,
) -> Result<Guardado, String> {
    let f = ruta_de(&ruta)?;

    if !forzar.unwrap_or(false) {
        if let (Some(visto), Ok(meta)) = (visto, std::fs::metadata(&f)) {
            // Un margen de un segundo: hay sistemas de archivos que redondean
            // la marca de tiempo, y un aviso falso cada vez que guardas enseña
            // a ignorar el aviso de verdad.
            if cuando_de(&meta) > visto + 1000.0 {
                return Ok(Guardado { cuando: cuando_de(&meta), pisaria: true });
            }
        }
    }

    let cuerpo = if crlf { texto.replace('\n', "\r\n") } else { texto };
    std::fs::write(&f, cuerpo).map_err(|e| e.to_string())?;
    let meta = std::fs::metadata(&f).map_err(|e| e.to_string())?;
    Ok(Guardado { cuando: cuando_de(&meta), pisaria: false })
}

// ─── CREAR, RENOMBRAR Y MANDAR A LA PAPELERA ───────────────────────────────
//
// El clic derecho del árbol (`ArchivosPanel.tsx`), lo primero de la lista de
// `docs/ARCHIVOS.md` que no ocupa sitio en pantalla. Ninguna pisa nada: crear o
// renombrar encima de algo que ya existe es un error, y borrar va a la
// PAPELERA (`manage::to_recycle_bin`, con su deshacer de Windows), nunca a la
// nada.

/// Por qué no vale un nombre, o `None` si vale. Un nombre, no una ruta: sin
/// barras, sin `..` y sin los caracteres que Windows no deja (los mismos en
/// Linux, para que un proyecto se pueda abrir en los dos).
pub fn nombre_no_valido(nombre: &str) -> Option<&'static str> {
    let n = nombre.trim();
    if n.is_empty() {
        return Some("Falta el nombre.");
    }
    if n == "." || n == ".." {
        return Some("Ese nombre no vale.");
    }
    if n.chars().any(|c| matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control()) {
        return Some("Un nombre no puede llevar / \\ : * ? \" < > |");
    }
    if n.ends_with('.') || nombre.ends_with(' ') {
        return Some("Windows no deja que un nombre acabe en punto o en espacio.");
    }
    let base = n.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reservados = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"];
    if reservados.contains(&base.as_str()) {
        return Some("Ese nombre lo tiene reservado Windows.");
    }
    None
}

fn destino(carpeta: &Path, nombre: &str) -> Result<PathBuf, String> {
    if let Some(por) = nombre_no_valido(nombre) {
        return Err(por.into());
    }
    let d = carpeta.join(nombre.trim());
    if d.exists() {
        return Err(format!("Ya hay algo que se llama «{}» ahí.", nombre.trim()));
    }
    Ok(d)
}

/// Un archivo vacío nuevo. Devuelve su ruta.
#[tauri::command(async)]
pub fn crear_archivo(carpeta: String, nombre: String) -> Result<String, String> {
    let d = destino(&ruta_de(&carpeta)?, &nombre)?;
    std::fs::OpenOptions::new().write(true).create_new(true).open(&d).map_err(|e| e.to_string())?;
    Ok(d.to_string_lossy().into_owned())
}

/// Una carpeta nueva. Devuelve su ruta.
#[tauri::command(async)]
pub fn crear_carpeta(carpeta: String, nombre: String) -> Result<String, String> {
    let d = destino(&ruta_de(&carpeta)?, &nombre)?;
    std::fs::create_dir(&d).map_err(|e| e.to_string())?;
    Ok(d.to_string_lossy().into_owned())
}

/// Le cambia el nombre, en su misma carpeta. Cambiar solo mayúsculas vale
/// (en Windows, el nombre viejo y el nuevo son «el mismo» para `exists`).
#[tauri::command(async)]
pub fn renombrar(ruta: String, nombre: String) -> Result<String, String> {
    let origen = ruta_de(&ruta)?;
    let carpeta = origen.parent().ok_or("No se puede renombrar la raíz.")?;
    if let Some(por) = nombre_no_valido(&nombre) {
        return Err(por.into());
    }
    let d = carpeta.join(nombre.trim());
    let solo_mayusculas = d.to_string_lossy().to_lowercase() == origen.to_string_lossy().to_lowercase();
    if d.exists() && !solo_mayusculas {
        return Err(format!("Ya hay algo que se llama «{}» ahí.", nombre.trim()));
    }
    std::fs::rename(&origen, &d).map_err(|e| e.to_string())?;
    Ok(d.to_string_lossy().into_owned())
}

/// Guarda una nota del lienzo como ficha: `<raiz>/docs/fichas/<nombre>`, creando
/// la carpeta si no está. Nunca encima de una que ya exista: una ficha es de
/// quien la escribió. Devuelve su ruta.
#[tauri::command(async)]
pub fn guardar_ficha(raiz: String, nombre: String, texto: String) -> Result<String, String> {
    let dir = ruta_de(&raiz)?.join("docs").join("fichas");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let d = destino(&dir, &nombre)?;
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&d)
        .and_then(|mut f| std::io::Write::write_all(&mut f, texto.as_bytes()))
        .map_err(|e| e.to_string())?;
    Ok(d.to_string_lossy().into_owned())
}

/// A la papelera del sistema, con su deshacer: nunca se borra a la nada.
#[tauri::command(async)]
pub fn a_la_papelera(ruta: String) -> Result<(), String> {
    let r = ruta_de(&ruta)?;
    if !r.exists() {
        return Err("Ya no está.".into());
    }
    crate::manage::to_recycle_bin(&r)
}

/// Lo que git dice de cada archivo cambiado, sacado de
/// `git status --porcelain=v1 -z`. Las rutas llegan relativas a la raíz del
/// repositorio y salen absolutas con las barras del sistema, para casar con las
/// del listado. Con `-z` no van entrecomilladas aunque lleven tildes.
fn leer_porcelana(salida: &str, raiz_repo: &Path) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut partes = salida.split('\0');
    while let Some(p) = partes.next() {
        if p.len() < 4 || !p.is_char_boundary(3) {
            continue;
        }
        let (xy, ruta) = p.split_at(3);
        let b = xy.as_bytes();
        let (x, y) = (b[0] as char, b[1] as char);
        // En un renombrado o una copia viene detrás la ruta de antes, que no se pinta.
        if x == 'R' || x == 'C' {
            partes.next();
        }
        let estado = match (x, y) {
            ('U', _) | (_, 'U') | ('A', 'A') | ('D', 'D') => "U",
            ('?', '?') | ('A', _) => "A",
            ('D', _) | (_, 'D') => "D",
            ('R', _) | ('C', _) => "R",
            _ => "M",
        };
        let abs = raiz_repo.join(ruta.trim_end_matches('/'));
        let abs = abs.to_string_lossy().replace('/', std::path::MAIN_SEPARATOR_STR);
        out.push((abs, estado.to_string()));
    }
    out
}

/// Cuántos nombres se devuelven como mucho al buscador de Ctrl+P.
const TOPE_NOMBRES: usize = 20_000;
/// Hasta dónde baja el recorrido a mano, fuera de git.
const HONDO_NOMBRES: usize = 8;

/// Lo que devuelve `git ls-files -z`: una ruta por trozo, separadas por NUL.
fn nombres_de_git(salida: &str) -> Vec<String> {
    salida.split('\0').filter(|s| !s.is_empty()).map(str::to_owned).collect()
}

/// El recorrido de respaldo, para una carpeta que no es de git: salta lo de
/// `FUERA` y las carpetas ocultas, y para al llegar al tope.
fn recorrer_nombres(raiz: &Path, dir: &Path, hondo: usize, fuera: &mut Vec<String>) {
    let Ok(leidas) = std::fs::read_dir(dir) else { return };
    for entrada in leidas.flatten() {
        if fuera.len() >= TOPE_NOMBRES {
            return;
        }
        let nombre = entrada.file_name().to_string_lossy().to_string();
        let Ok(tipo) = entrada.file_type() else { continue };
        if tipo.is_dir() {
            if hondo < HONDO_NOMBRES && !nombre.starts_with('.') && !FUERA.contains(&nombre.as_str()) {
                recorrer_nombres(raiz, &entrada.path(), hondo + 1, fuera);
            }
        } else if let Ok(rel) = entrada.path().strip_prefix(raiz) {
            fuera.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
}

/// Los archivos de una carpeta, todos y en hondo, para abrir uno escribiendo
/// parte de su nombre (Ctrl+P). Rutas relativas a `raiz`, con barras normales.
///
/// Dentro de un repositorio lo dice git (los seguidos y los nuevos sin ignorar,
/// menos los borrados): respeta `.gitignore` sin traer una dependencia para
/// leerlo. Fuera de git se recorre la carpeta a mano.
#[tauri::command(async)]
pub fn listar_nombres(raiz: String) -> Result<Vec<String>, String> {
    use crate::SinVentana;
    let dir = ruta_de(&raiz)?;
    let git = |args: &[&str]| {
        std::process::Command::new("git").arg("-C").arg(&dir).args(args).sin_ventana().output()
    };
    if let Ok(o) = git(&["ls-files", "-z", "--cached", "--others", "--exclude-standard"]) {
        if o.status.success() {
            // Lo borrado sigue en el índice hasta el commit, y ya no se puede abrir.
            let borrados: std::collections::HashSet<String> = git(&["ls-files", "-z", "--deleted"])
                .map(|d| nombres_de_git(&String::from_utf8_lossy(&d.stdout)).into_iter().collect())
                .unwrap_or_default();
            return Ok(nombres_de_git(&String::from_utf8_lossy(&o.stdout))
                .into_iter()
                .filter(|n| !borrados.contains(n))
                .take(TOPE_NOMBRES)
                .collect());
        }
    }
    let mut fuera = Vec::new();
    recorrer_nombres(&dir, &dir, 0, &mut fuera);
    fuera.sort_by_key(|n| n.to_lowercase());
    Ok(fuera)
}

/// Un sitio donde sale lo buscado: el archivo (relativo, con barras normales),
/// la línea y lo que dice esa línea.
#[derive(Serialize, Debug, PartialEq)]
pub struct Hallazgo {
    pub ruta: String,
    pub linea: u32,
    pub texto: String,
}

/// Cuántos sitios se devuelven como mucho, y cuántos por archivo: con eso ya se
/// ve dónde está; para más, se afina lo buscado.
const TOPE_HALLAZGOS: usize = 300;
const POR_ARCHIVO: usize = 5;
/// Lo que se lee de cada archivo en el recorrido a mano, fuera de git.
const TOPE_LEER: u64 = 1024 * 1024;

/// Lo que dice una línea, recortado para una fila: sin la sangría y como mucho
/// 160 caracteres (por carácter, no por byte: cortar UTF-8 a ciegas es un pánico).
fn recortar_linea(l: &str) -> String {
    let l = l.trim();
    match l.char_indices().nth(160) {
        Some((i, _)) => format!("{}…", &l[..i]),
        None => l.to_string(),
    }
}

/// Lo que devuelve `git grep -z -n`: `ruta\0línea\0texto` por renglón.
fn hallazgos_de_git(salida: &str) -> Vec<Hallazgo> {
    salida
        .lines()
        .filter_map(|l| {
            let mut p = l.splitn(3, '\0');
            let ruta = p.next()?.to_string();
            let linea = p.next()?.parse().ok()?;
            Some(Hallazgo { ruta, linea, texto: recortar_linea(p.next().unwrap_or("")) })
        })
        .take(TOPE_HALLAZGOS)
        .collect()
}

/// Busca un texto DENTRO de los archivos de una carpeta, sin distinguir
/// mayúsculas: lo de la paleta, «Buscar en los archivos». Dentro de un
/// repositorio lo hace git (`git grep`, que respeta `.gitignore`, salta los
/// binarios y es lo que usa Orca); fuera de git, un recorrido a mano con lo de
/// `FUERA` y un tope por archivo.
#[tauri::command(async)]
pub fn buscar_en_archivos(raiz: String, texto: String) -> Result<Vec<Hallazgo>, String> {
    use crate::SinVentana;
    let dir = ruta_de(&raiz)?;
    let q: String = texto.trim().chars().take(200).collect();
    if q.chars().count() < 2 {
        return Ok(Vec::new());
    }
    let o = std::process::Command::new("git")
        .arg("-C")
        .arg(&dir)
        .args(["grep", "-z", "-n", "-I", "-F", "-i", "--no-color", "--untracked", "--max-count", &POR_ARCHIVO.to_string(), "-e", &q, "--", "."])
        .sin_ventana()
        .output();
    if let Ok(o) = o {
        // 1 es «no hay ninguno»; lo demás que no sea 0, que no es un repositorio.
        match o.status.code() {
            Some(0) => return Ok(hallazgos_de_git(&String::from_utf8_lossy(&o.stdout))),
            Some(1) => return Ok(Vec::new()),
            _ => {}
        }
    }
    let mut nombres = Vec::new();
    recorrer_nombres(&dir, &dir, 0, &mut nombres);
    nombres.sort_by_key(|n| n.to_lowercase());
    let aguja = q.to_lowercase();
    let mut out = Vec::new();
    for n in nombres {
        let f = dir.join(&n);
        if std::fs::metadata(&f).map(|m| m.len() > TOPE_LEER).unwrap_or(true) {
            continue;
        }
        let Ok(bytes) = std::fs::read(&f) else { continue };
        if bytes.contains(&0) {
            continue;
        }
        let texto = String::from_utf8_lossy(&bytes);
        for (i, l) in texto.lines().enumerate().filter(|(_, l)| l.to_lowercase().contains(&aguja)).take(POR_ARCHIVO) {
            out.push(Hallazgo { ruta: n.clone(), linea: i as u32 + 1, texto: recortar_linea(l) });
            if out.len() >= TOPE_HALLAZGOS {
                return Ok(out);
            }
        }
    }
    Ok(out)
}

/// Qué archivos de la carpeta están distintos del último commit, y cuándo se
/// tocó cada uno. Lo pide el panel de Archivos cada pocos segundos mientras está
/// a la vista, que es lo que lo pone al día solo y lo pinta de colores
/// (`lib/estadoArchivos.ts`). Fuera de un repositorio de git no es un error: se
/// contesta que no hay git y el panel se queda con las horas del listado.
#[tauri::command(async)]
pub fn estado_archivos(raiz: String) -> Result<EstadoArchivos, String> {
    use crate::SinVentana;
    let dir = ruta_de(&raiz)?;
    let git = |args: &[&str]| {
        std::process::Command::new("git").arg("-C").arg(&dir).args(args).sin_ventana().output()
    };
    let sin_git = || Ok(EstadoArchivos { git: false, cambios: Vec::new() });
    let Ok(top) = git(&["rev-parse", "--show-toplevel"]) else { return sin_git() };
    if !top.status.success() {
        return sin_git();
    }
    let raiz_repo = PathBuf::from(String::from_utf8_lossy(&top.stdout).trim());
    let st = git(&["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "."])
        .map_err(|e| e.to_string())?;
    if !st.status.success() {
        return Err(String::from_utf8_lossy(&st.stderr).trim().to_string());
    }
    let cambios = leer_porcelana(&String::from_utf8_lossy(&st.stdout), &raiz_repo)
        .into_iter()
        .take(TOPE_CAMBIOS)
        .map(|(ruta, estado)| {
            let cuando = std::fs::metadata(&ruta).map(|m| cuando_de(&m)).unwrap_or(0.0);
            Cambio { ruta, estado, cuando }
        })
        .collect();
    Ok(EstadoArchivos { git: true, cambios })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Un PDF sale entero para el visor; lo que solo se llama .pdf, no.
    #[test]
    fn un_pdf_sale_para_su_visor() {
        let dir = std::env::temp_dir().join(format!("adeorq-pdf-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let bueno = dir.join("Informe.PDF");
        let falso = dir.join("falso.pdf");
        std::fs::write(&bueno, b"%PDF-1.7\nhola").unwrap();
        std::fs::write(&falso, b"no soy un pdf").unwrap();
        let pedir = |f: &Path| tauri::async_runtime::block_on(leer_pdf(f.to_string_lossy().to_string()));
        assert_eq!(pedir(&bueno).unwrap().as_deref(), Some("JVBERi0xLjcKaG9sYQ=="));
        assert_eq!(pedir(&falso).unwrap(), None, "con la extensión no basta");
        assert_eq!(pedir(&dir.join("nota.txt")).unwrap(), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Buscar dentro de los archivos: con git y sin él, sin mayúsculas, con su
    /// línea, y lo que dice la línea recortado sin partir un carácter.
    #[test]
    fn buscar_dentro_con_git_y_sin_el() {
        let h = hallazgos_de_git("src/lib.rs\x00136\x00pub fn clon_sin_herencia(s)\ndocs/a.md\x002\x00  ña clon\n");
        assert_eq!(h, [
            Hallazgo { ruta: "src/lib.rs".into(), linea: 136, texto: "pub fn clon_sin_herencia(s)".into() },
            Hallazgo { ruta: "docs/a.md".into(), linea: 2, texto: "ña clon".into() },
        ]);
        let largo = "é".repeat(400);
        assert_eq!(recortar_linea(&largo).chars().count(), 161, "160 caracteres y los puntos, sin partir ninguno");

        // Fuera de git: el recorrido a mano.
        let dir = std::env::temp_dir().join(format!("adeorq-buscar-{}-{:?}", std::process::id(), std::thread::current().id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::create_dir_all(dir.join("node_modules")).unwrap();
        std::fs::write(dir.join("uno.txt"), "nada\nAquí está el TESORO\nfin").unwrap();
        std::fs::write(dir.join("sub").join("dos.md"), "otro tesoro").unwrap();
        std::fs::write(dir.join("node_modules").join("tres.js"), "tesoro escondido").unwrap();
        std::fs::write(dir.join("bin.dat"), b"tesoro\x00binario").unwrap();
        let r = buscar_en_archivos(dir.to_string_lossy().to_string(), "tesoro".into()).unwrap();
        let vistos: Vec<String> = r.iter().map(|h| format!("{}:{}", h.ruta, h.linea)).collect();
        assert_eq!(vistos, ["sub/dos.md:1", "uno.txt:2"], "sin mayúsculas, sin node_modules ni binarios");
        assert_eq!(r[1].texto, "Aquí está el TESORO");
        assert!(buscar_en_archivos(dir.to_string_lossy().to_string(), "t".into()).unwrap().is_empty(), "una letra sola no busca");
        let _ = std::fs::remove_dir_all(&dir);

        // Dentro de git: este mismo repositorio, buscando algo que solo está aquí.
        let repo = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_string_lossy().to_string();
        let aqui = buscar_en_archivos(repo, "FN BUSCAR_DENTRO_CON_GIT_Y_SIN_EL".into()).unwrap();
        assert!(aqui.iter().any(|h| h.ruta == "src-tauri/src/archivos.rs" && h.texto.starts_with("fn buscar_dentro")), "{aqui:?}");
    }

    /// Crear y renombrar desde el árbol: nunca encima de algo que ya está, solo
    /// nombres (no rutas) que Windows acepte, y cambiar solo mayúsculas vale.
    #[test]
    fn crear_y_renombrar_sin_pisar_nada() {
        let dir = std::env::temp_dir().join(format!("adeorq-crear-{}-{:?}", std::process::id(), std::thread::current().id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let d = dir.to_string_lossy().to_string();

        for malo in ["", "  ", "..", "a/b", "a\\b", "c:", "dos?", "fin.", "con", "NUL.txt", "uno<dos"] {
            assert!(nombre_no_valido(malo).is_some(), "«{malo}» no debería valer");
        }
        for bueno in ["nota.md", ".env", "Léeme 2.txt", "con-guion", "consola.rs"] {
            assert_eq!(nombre_no_valido(bueno), None, "«{bueno}» debería valer");
        }

        let f = crear_archivo(d.clone(), "nota.md".into()).unwrap();
        assert!(Path::new(&f).is_file() && std::fs::read(&f).unwrap().is_empty());
        assert!(crear_archivo(d.clone(), "nota.md".into()).unwrap_err().contains("Ya hay"), "no pisa un archivo");
        std::fs::write(&f, "lo escrito").unwrap();
        let c = crear_carpeta(d.clone(), "docs".into()).unwrap();
        assert!(Path::new(&c).is_dir());
        assert!(crear_carpeta(d.clone(), "docs".into()).is_err());
        assert!(crear_archivo(d.clone(), "../fuera.txt".into()).is_err(), "un nombre no sale de su carpeta");

        assert!(renombrar(f.clone(), "docs".into()).unwrap_err().contains("Ya hay"), "no renombra encima de otro");
        let r = renombrar(f.clone(), "Nota.md".into()).unwrap();
        assert_eq!(std::fs::read_to_string(&r).unwrap(), "lo escrito", "cambiar solo mayúsculas vale y no pierde nada");
        let r2 = renombrar(r, "final.md".into()).unwrap();
        assert!(Path::new(&r2).is_file() && !dir.join("Nota.md").exists());
        assert!(a_la_papelera(dir.join("no-esta").to_string_lossy().to_string()).is_err());

        // Una ficha nueva crea su carpeta y no pisa otra del mismo nombre.
        let f = guardar_ficha(d.clone(), "publicar.md".into(), "# Publicar\n\n- [ ] subir\n".into()).unwrap();
        assert!(f.ends_with("publicar.md") && Path::new(&f).parent().unwrap().ends_with("docs/fichas"));
        assert_eq!(std::fs::read_to_string(&f).unwrap(), "# Publicar\n\n- [ ] subir\n");
        assert!(guardar_ficha(d.clone(), "publicar.md".into(), "otra".into()).unwrap_err().contains("Ya hay"));
        assert_eq!(std::fs::read_to_string(&f).unwrap(), "# Publicar\n\n- [ ] subir\n", "la de antes sigue intacta");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Lo que el editor necesita para enseñar una imagen y para notar que un
    /// archivo cambió: una imagen sale como `data:`, lo que no lo es no sale, y
    /// la hora de un archivo que ya no está es cero, no un error.
    #[test]
    fn una_imagen_sale_lista_y_un_archivo_dice_cuando_se_toco() {
        let dir = std::env::temp_dir().join(format!("adeorq-imagen-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let png = dir.join("Foto.PNG");
        let txt = dir.join("nota.txt");
        std::fs::write(&png, [0x89, b'P', b'N', b'G', 0, 1, 2, 3]).unwrap();
        std::fs::write(&txt, "hola").unwrap();
        let pedir = |f: &Path| tauri::async_runtime::block_on(leer_imagen(f.to_string_lossy().to_string()));
        let cuando = |f: &Path| tauri::async_runtime::block_on(cuando_archivo(f.to_string_lossy().to_string()));

        assert_eq!(pedir(&png).unwrap().as_deref(), Some("data:image/png;base64,iVBORwABAgM="));
        assert_eq!(pedir(&txt).unwrap(), None, "un .txt no es una imagen");
        assert_eq!(tipo_de_imagen(Path::new("logo.svg")), None, "el SVG se abre como texto");
        assert_eq!(tipo_de_imagen(Path::new("a.JPeG")), Some("image/jpeg"));

        assert!(cuando(&txt).unwrap() > 0.0);
        assert_eq!(cuando(&dir.join("no-esta.txt")).unwrap(), 0.0);
        assert!(cuando(Path::new("relativa.txt")).is_err(), "una ruta a medias es un fallo de quien llama");

        std::fs::remove_dir_all(&dir).ok();
    }

    /// El buscador de Ctrl+P fuera de git: todo lo de dentro en hondo, con
    /// barras normales, sin lo de `FUERA` ni las carpetas ocultas. Y la salida
    /// de `git ls-files -z`, partida por sus NUL.
    #[test]
    fn los_nombres_de_una_carpeta_sin_git_salen_en_hondo_y_sin_lo_que_sobra() {
        let dir = std::env::temp_dir().join(format!("adeorq-nombres-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        for sub in ["src/lib", "node_modules/react", ".oculta", "docs"] {
            std::fs::create_dir_all(dir.join(sub)).unwrap();
        }
        for f in ["README.md", "src/App.tsx", "src/lib/pty.ts", "node_modules/react/index.js", ".oculta/x.txt", "docs/guia.md", ".env"] {
            std::fs::write(dir.join(f), "x").unwrap();
        }
        let mut salen = Vec::new();
        recorrer_nombres(&dir, &dir, 0, &mut salen);
        salen.sort();
        assert_eq!(salen, [".env", "README.md", "docs/guia.md", "src/App.tsx", "src/lib/pty.ts"]);

        assert_eq!(nombres_de_git("src/App.tsx\0docs/con espacio.md\0\0"), ["src/App.tsx", "docs/con espacio.md"]);
        assert!(nombres_de_git("").is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn la_porcelana_de_git_se_lee_entera() {
        let raiz = Path::new("C:/repo");
        let salida = " M src/App.tsx\0?? nuevo.txt\0R  b.rs\0a.rs\0UU choque.ts\0D  ido.md\0A  añadido.ts\0MM doble.ts\0";
        let sep = std::path::MAIN_SEPARATOR_STR;
        let r = |p: &str| format!("C:{sep}repo{sep}{}", p.replace('/', sep));
        assert_eq!(
            leer_porcelana(salida, raiz),
            vec![
                (r("src/App.tsx"), "M".to_string()),
                (r("nuevo.txt"), "A".to_string()),
                (r("b.rs"), "R".to_string()),
                (r("choque.ts"), "U".to_string()),
                (r("ido.md"), "D".to_string()),
                (r("añadido.ts"), "A".to_string()),
                (r("doble.ts"), "M".to_string()),
            ]
        );
        assert!(leer_porcelana("", raiz).is_empty());
    }

    /// Con el git de verdad, sobre este mismo repositorio:
    /// `cargo test --lib estado_de_este_repo -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn estado_de_este_repo() {
        let raiz = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_string_lossy().to_string();
        let e = estado_archivos(raiz.clone()).expect("git status");
        println!("git: {} · {} cambios en {raiz}", e.git, e.cambios.len());
        for c in e.cambios.iter().take(12) {
            println!("  {} {} ({})", c.estado, c.ruta, c.cuando);
        }
        assert!(e.git);
        assert!(estado_archivos(std::env::temp_dir().to_string_lossy().to_string()).map(|e| !e.git).unwrap_or(true));
    }

    #[test]
    fn una_ruta_relativa_no_se_acepta() {
        assert!(ruta_de("src/App.tsx").is_err());
        assert!(ruta_de("").is_err());
        #[cfg(windows)]
        assert!(ruta_de("C:\\proyectos").is_ok());
        #[cfg(unix)]
        assert!(ruta_de("/home/munir").is_ok());
    }

    #[test]
    fn las_carpetas_de_dependencias_no_se_listan() {
        assert!(FUERA.contains(&"node_modules"));
        assert!(FUERA.contains(&"target"));
        assert!(FUERA.contains(&".git"));
        // Pero un archivo con ese nombre sí: la lista es de CARPETAS, y el
        // filtro pregunta antes si lo es.
        assert!(!FUERA.contains(&"App.tsx"));
    }

    /// El orden es el del explorador de toda la vida, no el del disco.
    #[test]
    fn las_carpetas_van_antes_y_luego_por_nombre() {
        let mut filas = vec![
            Entrada { nombre: "zeta.ts".into(), ruta: "z".into(), carpeta: false, peso: 1, cuando: 0.0 },
            Entrada { nombre: "src".into(), ruta: "s".into(), carpeta: true, peso: 0, cuando: 0.0 },
            Entrada { nombre: "App.tsx".into(), ruta: "a".into(), carpeta: false, peso: 1, cuando: 0.0 },
            Entrada { nombre: "docs".into(), ruta: "d".into(), carpeta: true, peso: 0, cuando: 0.0 },
        ];
        filas.sort_by(|a, b| match (a.carpeta, b.carpeta) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.nombre.to_lowercase().cmp(&b.nombre.to_lowercase()),
        });
        let nombres: Vec<&str> = filas.iter().map(|f| f.nombre.as_str()).collect();
        assert_eq!(nombres, ["docs", "src", "App.tsx", "zeta.ts"]);
    }

    /// Lo importante del guardado: leer y escribir tienen que devolver el
    /// archivo tal y como estaba, saltos de línea incluidos.
    #[test]
    fn los_saltos_de_windows_vuelven_como_estaban() {
        let bruto = "uno\r\ndos\r\ntres";
        let crlf = bruto.contains("\r\n");
        let texto = bruto.replace("\r\n", "\n");
        assert_eq!(texto, "uno\ndos\ntres");
        let devuelto = if crlf { texto.replace('\n', "\r\n") } else { texto };
        assert_eq!(devuelto, bruto);
    }

    #[test]
    fn un_archivo_de_linux_no_gana_retornos_de_carro() {
        let bruto = "uno\ndos";
        let crlf = bruto.contains("\r\n");
        assert!(!crlf);
        let devuelto = if crlf { bruto.replace('\n', "\r\n") } else { bruto.to_string() };
        assert_eq!(devuelto, bruto);
    }
}
