//! Lo que un agente le enseña a Munir en el móvil: una imagen, una página HTML
//! de un solo archivo o una web que corre en este PC (`127.0.0.1:<puerto>`).
//!
//! Munir, 2026-11-07, de madrugada: «que en adeorq movil se puedan ver
//! imagenes o webs temporales locales de lo que vas haciendo». Hasta hoy, lo
//! que un agente le enseñaba (una captura, el PNG de una tarjeta, la página de
//! opciones de la regla AC) se abría en el navegador del PC, y estando fuera
//! no le llegaba.
//!
//! Lo que no se negocia, y cómo se cumple:
//! - **Solo lo compartido a propósito.** El agente nombra UN archivo o UN
//!   puerto con `compartir_en_el_movil`; el móvil pide lo compartido por su id,
//!   nunca una ruta. No hay forma de listar una carpeta.
//! - **No cualquier ruta.** El archivo tiene que estar en la carpeta de
//!   proyectos o en la temporal (la de las sesiones de los agentes), ser una
//!   imagen o un HTML, y no pasar por ninguna carpeta de `PROHIBIDOS` (las
//!   bóvedas BUNKER y PERSONAL, `copias-mama`, las claves). Se vuelve a mirar
//!   cada vez que se sirve, ya resuelto por el sistema: un enlace que apunte
//!   fuera no cuela.
//! - **El mismo emparejado y Tailscale de siempre**: se sirve por `/api/`, con
//!   la clave del móvil (`movil.rs`).
//! - **Caduca solo**: a las `HORAS_DE_FABRICA`, o a las que diga el agente sin
//!   pasar de `HORAS_TOPE`.
//! - **Una web del PC viaja como captura**, no como página: solo salen sus
//!   píxeles, a ancho de móvil (`capturar_web`, con el Edge del sistema y un
//!   perfil de usar y tirar). Servirla entera por el mismo origen que la página
//!   del móvil le daría a su JavaScript la clave del emparejado.
//! - **Una página HTML** sí va entera, pero el móvil la pinta en un marco
//!   `sandbox` sin `allow-same-origin`: su JavaScript corre en un origen opaco
//!   y no llega a la clave ni a la API.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Los que se guardan a la vez; el más viejo se va primero.
pub const TOPE: usize = 30;
pub const HORAS_DE_FABRICA: u64 = 24;
pub const HORAS_TOPE: u64 = 72;
/// Lo que pesa como mucho un archivo compartido.
pub const TOPE_BYTES: u64 = 25 * 1024 * 1024;
const TOPE_TITULO: usize = 200;
/// Una captura se repite como mucho cada tanto: la lista y la vista la piden a la vez.
const CAPTURA_VALE_MS: u64 = 60_000;

/// Trozos de ruta que nunca se enseñan, se escriban como se escriban. Las dos
/// bóvedas de Obsidian de Munir (`BUNKER\BUNKER` y `BUNKER\PERSONAL`), las
/// copias de su madre en Moneorq, y lo que guarda claves.
pub const PROHIBIDOS: [&str; 12] = [
    "bunker",
    "personal",
    "copias-mama",
    ".ssh",
    ".gnupg",
    ".git",
    ".adeorq-apple",
    ".vocript-apple",
    "secretos",
    ".claude",
    ".codex",
    ".gemini",
];

/// Los puertos de este PC que no se capturan: el MCP de Adeorq y la propia
/// página del móvil.
const PUERTOS_DE_ADEORQ: [u16; 2] = [3012, crate::movil::PUERTO];

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Tipo {
    Imagen,
    Pagina,
    Web,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Compartido {
    pub id: String,
    pub titulo: String,
    pub tipo: Tipo,
    /// El archivo, ya resuelto por el sistema (imagen o página).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ruta: Option<String>,
    /// La web de este PC (`Tipo::Web`): su puerto y la ruta dentro.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub puerto: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub camino: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proyecto: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub panel: Option<u32>,
    /// Milisegundos.
    pub creado: u64,
    pub caduca: u64,
}

/// Lo que pide el agente.
#[derive(Clone, Debug, Default)]
pub struct Pedido {
    pub titulo: String,
    pub ruta: Option<String>,
    pub puerto: Option<u16>,
    pub camino: Option<String>,
    pub horas: Option<u64>,
    pub proyecto: Option<String>,
    pub panel: Option<u32>,
}

/// Dónde puede estar lo que se comparte: la carpeta de proyectos y la temporal,
/// resueltas por el sistema.
pub fn raices_de_verdad() -> Vec<PathBuf> {
    [crate::workspace::raiz_por_defecto(), std::env::temp_dir()]
        .into_iter()
        .filter_map(|r| r.canonicalize().ok())
        .collect()
}

pub fn dir_de_verdad() -> Result<PathBuf, String> {
    Ok(crate::dir_datos_creado()?.join("compartidos"))
}

fn limpio(s: &str, tope: usize) -> String {
    s.chars().filter(|c| !c.is_control()).take(tope).collect::<String>().trim().to_string()
}

fn tipo_por_extension(p: &Path) -> Option<Tipo> {
    match p.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" => Some(Tipo::Imagen),
        "html" | "htm" => Some(Tipo::Pagina),
        _ => None,
    }
}

/// El tipo de contenido de una imagen compartida, por su extensión.
fn mime_de_imagen(p: &Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref() {
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        _ => "image/jpeg",
    }
}

/// La carpeta protegida por la que pasa esa ruta, si pasa por alguna.
fn prohibido_en(p: &Path) -> Option<String> {
    p.components().find_map(|c| {
        let trozo = c.as_os_str().to_string_lossy().to_lowercase();
        PROHIBIDOS.contains(&trozo.as_str()).then_some(trozo)
    })
}

/// Comprueba un archivo para compartirlo, o para servirlo otra vez: el que se
/// resuelve AHORA, no el de cuando se compartió.
pub fn archivo_valido(ruta: &str, raices: &[PathBuf]) -> Result<(PathBuf, Tipo), String> {
    let pedida = Path::new(ruta.trim());
    if !pedida.is_absolute() {
        return Err(format!("«{ruta}» no es una ruta entera: pásala desde la unidad (C:\\…)."));
    }
    if let Some(c) = prohibido_en(pedida) {
        return Err(format!("Eso no se enseña nunca en el móvil: pasa por «{c}», que es una carpeta protegida."));
    }
    let real = pedida.canonicalize().map_err(|_| format!("No encuentro «{ruta}»."))?;
    if let Some(c) = prohibido_en(&real) {
        return Err(format!("Eso no se enseña nunca en el móvil: pasa por «{c}», que es una carpeta protegida."));
    }
    let meta = std::fs::metadata(&real).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Solo se comparte un archivo, nunca una carpeta.".into());
    }
    // Por trozos de ruta, no por texto (`C:\proyectos-copia` no está dentro).
    if !raices.iter().any(|r| real.starts_with(r)) {
        // Sin el `\\?\` que pone Windows al resolverla: el agente no lo escribió.
        let donde = raices.iter().map(|r| r.display().to_string().trim_start_matches(r"\\?\").to_string()).collect::<Vec<_>>().join(" o ");
        return Err(format!("Solo se comparte lo que está en {donde}."));
    }
    let tipo = tipo_por_extension(&real)
        .ok_or("Solo se comparte una imagen (png, jpg, gif, webp) o una página HTML de un solo archivo.")?;
    if meta.len() > TOPE_BYTES {
        return Err(format!("Pesa demasiado: como mucho {} MB.", TOPE_BYTES / 1024 / 1024));
    }
    Ok((real, tipo))
}

/// La ruta dentro de la web: empieza por `/` y no lleva nada que cambie de
/// sitio (`\`, espacios, `@`).
fn camino_valido(camino: Option<&str>) -> Result<String, String> {
    let c = camino.map(str::trim).filter(|c| !c.is_empty()).unwrap_or("/");
    if !c.starts_with('/') || c.starts_with("//") || c.len() > 500 || c.chars().any(|x| x.is_whitespace() || x.is_control() || x == '\\' || x == '@') {
        return Err(format!("`urlPath` tiene que ser una ruta como «/» o «/guia.html», y «{c}» no lo es."));
    }
    Ok(c.to_string())
}

fn puerto_valido(puerto: u16) -> Result<(), String> {
    if puerto < 1024 {
        return Err("Solo se capturan webs de puertos de 1024 para arriba.".into());
    }
    if PUERTOS_DE_ADEORQ.contains(&puerto) {
        return Err(format!("El {puerto} es de Adeorq: ese no se enseña."));
    }
    Ok(())
}

/// Lo comprueba y lo deja listo, sin guardarlo todavía.
pub fn preparar(p: &Pedido, ahora: u64, raices: &[PathBuf], id: String) -> Result<Compartido, String> {
    let titulo = limpio(&p.titulo, TOPE_TITULO);
    if titulo.is_empty() {
        return Err("Ponle un título (title): es lo que lee Munir en la lista.".into());
    }
    let horas = p.horas.unwrap_or(HORAS_DE_FABRICA).clamp(1, HORAS_TOPE);
    let (tipo, ruta, puerto, camino) = match (&p.ruta, p.puerto) {
        (Some(_), Some(_)) => return Err("O un archivo (path) o una web (port), las dos cosas a la vez no.".into()),
        (None, None) => return Err("Falta qué enseñar: un archivo (path) o el puerto de una web de este PC (port).".into()),
        (Some(r), None) => {
            let (real, tipo) = archivo_valido(r, raices)?;
            (tipo, Some(real.to_string_lossy().into_owned()), None, None)
        }
        (None, Some(n)) => {
            puerto_valido(n)?;
            (Tipo::Web, None, Some(n), Some(camino_valido(p.camino.as_deref())?))
        }
    };
    Ok(Compartido {
        id,
        titulo,
        tipo,
        ruta,
        puerto,
        camino,
        proyecto: p.proyecto.as_deref().map(|t| limpio(t, TOPE_TITULO)).filter(|t| !t.is_empty()),
        panel: p.panel,
        creado: ahora,
        caduca: ahora + horas * 3_600_000,
    })
}

fn archivo_lista(dir: &Path) -> PathBuf {
    dir.join("compartidos.json")
}

fn leer_lista(dir: &Path) -> Vec<Compartido> {
    std::fs::read(archivo_lista(dir)).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn guardar_lista(dir: &Path, lista: &[Compartido]) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let destino = archivo_lista(dir);
    let temporal = destino.with_extension("json.tmp");
    std::fs::write(&temporal, serde_json::to_vec_pretty(lista).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&temporal, &destino).map_err(|e| {
        let _ = std::fs::remove_file(&temporal);
        e.to_string()
    })
}

/// Un id que no es de este almacén no lleva a ningún archivo.
pub fn id_valido(id: &str) -> bool {
    id.len() == 32 && id.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

fn captura_de(dir: &Path, id: &str) -> Option<PathBuf> {
    id_valido(id).then(|| dir.join(format!("{id}.png")))
}

/// Lo que sigue vivo, el más nuevo primero. Lo caducado se borra al pasar.
pub fn vigentes(dir: &Path, ahora: u64) -> Vec<Compartido> {
    let todos = leer_lista(dir);
    let (vivos, idos): (Vec<_>, Vec<_>) = todos.into_iter().partition(|c| c.caduca > ahora);
    if !idos.is_empty() {
        for c in &idos {
            if let Some(f) = captura_de(dir, &c.id) {
                let _ = std::fs::remove_file(f);
            }
        }
        let _ = guardar_lista(dir, &vivos);
    }
    let mut vivos = vivos;
    vivos.sort_by(|a, b| b.creado.cmp(&a.creado));
    vivos
}

/// Lo guarda. Si ya había `TOPE`, se va el más viejo.
pub fn guardar(dir: &Path, c: Compartido, ahora: u64) -> Result<Compartido, String> {
    let mut lista = vigentes(dir, ahora);
    lista.insert(0, c.clone());
    for viejo in lista.split_off(TOPE.min(lista.len())) {
        if let Some(f) = captura_de(dir, &viejo.id) {
            let _ = std::fs::remove_file(f);
        }
    }
    guardar_lista(dir, &lista)?;
    Ok(c)
}

pub fn buscar(dir: &Path, id: &str, ahora: u64) -> Option<Compartido> {
    if !id_valido(id) {
        return None;
    }
    vigentes(dir, ahora).into_iter().find(|c| c.id == id)
}

/// Un id nuevo: 16 bytes del sistema, en hexadecimal.
pub fn id_nuevo() -> Result<String, String> {
    let mut b = [0u8; 16];
    getrandom::fill(&mut b).map_err(|e| format!("sin aleatoriedad del sistema: {e}"))?;
    Ok(b.iter().map(|x| format!("{x:02x}")).collect())
}

/// Lo que se le manda al móvil de uno compartido: su tipo de contenido y sus
/// bytes. El archivo se vuelve a comprobar ahora; una web se captura (o se
/// reutiliza la captura de hace menos de un minuto, salvo `nueva`).
pub fn contenido(
    dir: &Path,
    c: &Compartido,
    raices: &[PathBuf],
    nueva: bool,
    ahora: u64,
    capturar: &dyn Fn(u16, &str) -> Result<Vec<u8>, String>,
) -> Result<(&'static str, Vec<u8>), String> {
    match c.tipo {
        Tipo::Imagen | Tipo::Pagina => {
            let (real, tipo) = archivo_valido(c.ruta.as_deref().unwrap_or(""), raices)?;
            if tipo != c.tipo {
                return Err("Ese archivo ya no es lo que se compartió.".into());
            }
            let bytes = std::fs::read(&real).map_err(|e| e.to_string())?;
            // La página viaja como texto: el móvil la pinta en un marco cerrado,
            // y abierta sola en el navegador no se ejecutaría como página.
            Ok((if tipo == Tipo::Imagen { mime_de_imagen(&real) } else { "text/plain; charset=utf-8" }, bytes))
        }
        Tipo::Web => {
            let destino = captura_de(dir, &c.id).ok_or("Ese id no es de este almacén.")?;
            let reciente = std::fs::metadata(&destino)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .is_some_and(|t| ahora.saturating_sub(t.as_millis() as u64) < CAPTURA_VALE_MS);
            if reciente && !nueva {
                if let Ok(b) = std::fs::read(&destino) {
                    return Ok(("image/png", b));
                }
            }
            let png = capturar(c.puerto.unwrap_or(0), c.camino.as_deref().unwrap_or("/"))?;
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            let _ = std::fs::write(&destino, &png);
            Ok(("image/png", png))
        }
    }
}

/// Si hay algo escuchando en ese puerto de este PC. Con tope de tiempo: en
/// Windows, conectar a un puerto cerrado tarda dos segundos en decir que no.
pub fn alguien_escucha(puerto: u16) -> bool {
    let a = std::net::SocketAddr::from(([127, 0, 0, 1], puerto));
    std::net::TcpStream::connect_timeout(&a, std::time::Duration::from_millis(2500)).is_ok()
}

#[cfg(windows)]
fn edge() -> Option<PathBuf> {
    let mut sitios = Vec::new();
    for var in ["ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"] {
        if let Some(base) = std::env::var_os(var) {
            sitios.push(PathBuf::from(base).join("Microsoft").join("Edge").join("Application").join("msedge.exe"));
        }
    }
    sitios.into_iter().find(|p| p.is_file())
}

#[cfg(not(windows))]
fn edge() -> Option<PathBuf> {
    None
}

/// Lo que mide de ancho la captura, en píxeles CSS: el de un móvil normal.
pub const ANCHO_CAPTURA: u32 = 412;
const ALTO_CAPTURA: u32 = 1800;

/// Una captura de `http://127.0.0.1:<puerto><camino>` a ancho de móvil, con el
/// Edge del sistema sin ventana y un perfil de usar y tirar (no toca el suyo).
/// Al doble de densidad, para que la letra se lea en la pantalla del móvil.
pub fn capturar_web(puerto: u16, camino: &str) -> Result<Vec<u8>, String> {
    use crate::SinVentana;
    puerto_valido(puerto)?;
    let camino = camino_valido(Some(camino))?;
    if !alguien_escucha(puerto) {
        return Err(format!("No hay nada escuchando en 127.0.0.1:{puerto}: arranca la web antes de mirarla."));
    }
    let navegador = edge().ok_or("En este equipo no encuentro el Edge con el que se capturan las webs: comparte una captura (path) en su lugar.")?;
    let mut sitio = [0u8; 8];
    getrandom::fill(&mut sitio).map_err(|e| e.to_string())?;
    let tmp = std::env::temp_dir().join(format!("adeorq-captura-{}", sitio.iter().map(|x| format!("{x:02x}")).collect::<String>()));
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let salida = tmp.join("captura.png");
    let resultado = (|| {
        let mut hijo = std::process::Command::new(&navegador)
            .args([
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-extensions",
                "--mute-audio",
                "--force-device-scale-factor=2",
                "--virtual-time-budget=4000",
            ])
            .arg(format!("--user-data-dir={}", tmp.join("perfil").display()))
            .arg(format!("--window-size={ANCHO_CAPTURA},{ALTO_CAPTURA}"))
            .arg(format!("--screenshot={}", salida.display()))
            .arg(format!("http://127.0.0.1:{puerto}{camino}"))
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .sin_ventana()
            .spawn()
            .map_err(|e| format!("No se pudo abrir el Edge para la captura: {e}"))?;
        let limite = std::time::Instant::now() + std::time::Duration::from_secs(40);
        loop {
            match hijo.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if std::time::Instant::now() < limite => std::thread::sleep(std::time::Duration::from_millis(150)),
                _ => {
                    let _ = hijo.kill();
                    let _ = hijo.wait();
                    return Err("La captura tardó demasiado: la web no terminó de cargar.".to_string());
                }
            }
        }
        let png = std::fs::read(&salida).map_err(|_| "El Edge no dejó la captura.".to_string())?;
        if !png.starts_with(b"\x89PNG") {
            return Err("La captura no salió bien.".into());
        }
        Ok(png)
    })();
    // El perfil de usar y tirar se borra siempre; el Edge tarda un poco en soltarlo.
    for _ in 0..20 {
        if std::fs::remove_dir_all(&tmp).is_ok() || !tmp.exists() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
    resultado
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sitio(nombre: &str) -> PathBuf {
        let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let d = std::env::temp_dir().join(format!("adeorq-compartidos-{nombre}-{}-{n}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        d.canonicalize().unwrap()
    }

    fn pedido_de(ruta: &Path) -> Pedido {
        Pedido { titulo: "La tarjeta".into(), ruta: Some(ruta.display().to_string()), ..Default::default() }
    }

    /// Lo que Munir dejó escrito como «no opinable»: solo lo de las carpetas de
    /// trabajo, nunca una carpeta, nunca sus bóvedas ni las copias de su madre.
    #[test]
    fn solo_se_comparte_un_archivo_de_trabajo_y_nunca_lo_protegido() {
        let raiz = sitio("raiz");
        let fuera = sitio("fuera");
        let raices = vec![raiz.clone()];
        std::fs::write(raiz.join("tarjeta.png"), b"\x89PNG\r\n\x1a\nimagen").unwrap();
        std::fs::write(raiz.join("plano.html"), "<p>hola</p>").unwrap();
        std::fs::write(raiz.join("notas.md"), "# no").unwrap();
        std::fs::write(fuera.join("otra.png"), b"\x89PNG").unwrap();
        for prohibida in ["BUNKER", "PERSONAL", "copias-mama", ".ssh", "secretos"] {
            std::fs::create_dir_all(raiz.join(prohibida)).unwrap();
            std::fs::write(raiz.join(prohibida).join("foto.png"), b"\x89PNG").unwrap();
        }

        let c = preparar(&pedido_de(&raiz.join("tarjeta.png")), 1000, &raices, "a".repeat(32)).unwrap();
        assert_eq!((c.tipo, c.caduca), (Tipo::Imagen, 1000 + 24 * 3_600_000));
        assert_eq!(preparar(&pedido_de(&raiz.join("plano.html")), 1, &raices, "b".repeat(32)).unwrap().tipo, Tipo::Pagina);

        let error = |p: &Path| preparar(&pedido_de(p), 1, &raices, "c".repeat(32)).unwrap_err();
        assert!(error(&raiz).contains("nunca una carpeta"), "{}", error(&raiz));
        assert!(error(&raiz.join("notas.md")).contains("Solo se comparte una imagen"));
        assert!(error(&fuera.join("otra.png")).contains("Solo se comparte lo que está en"));
        assert!(error(&raiz.join("no-existe.png")).contains("No encuentro"));
        for prohibida in ["BUNKER", "PERSONAL", "copias-mama", ".ssh", "secretos"] {
            let e = error(&raiz.join(prohibida).join("foto.png"));
            assert!(e.contains("carpeta protegida"), "{prohibida}: {e}");
        }
        // Las de Munir, escritas como en su disco, aunque no existan aquí. Fuera
        // de Windows `C:\…` no es una ruta entera, y allí se escriben con `/`.
        #[cfg(windows)]
        let suyas = [r"C:\Apps\Random APPS\obsidian\BUNKER\PERSONAL\foto.png", r"C:\proyectos\Moneorq\copias-mama\recibo.png"];
        #[cfg(not(windows))]
        let suyas = ["/home/munir/obsidian/BUNKER/PERSONAL/foto.png", "/home/munir/proyectos/Moneorq/copias-mama/recibo.png"];
        for suya in suyas {
            assert!(archivo_valido(suya, &raices).unwrap_err().contains("carpeta protegida"), "{suya}");
        }
        assert!(archivo_valido("tarjeta.png", &raices).unwrap_err().contains("ruta entera"));
        let _ = std::fs::remove_dir_all(&raiz);
        let _ = std::fs::remove_dir_all(&fuera);
    }

    #[test]
    fn una_web_es_un_puerto_de_este_pc_y_una_ruta_limpia() {
        let raices: Vec<PathBuf> = vec![];
        let web = |puerto: u16, camino: Option<&str>| {
            preparar(&Pedido { titulo: "La web".into(), puerto: Some(puerto), camino: camino.map(str::to_string), ..Default::default() }, 1, &raices, "d".repeat(32))
        };
        assert_eq!(web(8080, None).unwrap().camino.as_deref(), Some("/"));
        assert_eq!(web(5173, Some("/guia.html?x=1")).unwrap().camino.as_deref(), Some("/guia.html?x=1"));
        assert!(web(80, None).unwrap_err().contains("1024"));
        assert!(web(3012, None).unwrap_err().contains("es de Adeorq"));
        assert!(web(crate::movil::PUERTO, None).unwrap_err().contains("es de Adeorq"));
        for malo in ["guia.html", "//otro.sitio/x", "/a b", "/x@otro", "/a\\b"] {
            assert!(web(8080, Some(malo)).unwrap_err().contains("urlPath"), "{malo}");
        }
        assert!(preparar(&Pedido { titulo: "x".into(), ..Default::default() }, 1, &raices, "e".repeat(32)).unwrap_err().contains("Falta qué enseñar"));
        let mut las_dos = Pedido { titulo: "x".into(), puerto: Some(8080), ..Default::default() };
        las_dos.ruta = Some("C:\\x.png".into());
        assert!(preparar(&las_dos, 1, &raices, "f".repeat(32)).unwrap_err().contains("a la vez no"));
        assert!(preparar(&Pedido { titulo: "  ".into(), puerto: Some(8080), ..Default::default() }, 1, &raices, "f".repeat(32)).unwrap_err().contains("título"));
        // Las horas, entre 1 y el tope.
        let mut largo = Pedido { titulo: "x".into(), puerto: Some(8080), horas: Some(999), ..Default::default() };
        assert_eq!(preparar(&largo, 0, &raices, "f".repeat(32)).unwrap().caduca, HORAS_TOPE * 3_600_000);
        largo.horas = Some(0);
        assert_eq!(preparar(&largo, 0, &raices, "f".repeat(32)).unwrap().caduca, 3_600_000);
    }

    #[test]
    fn caduca_solo_se_sirve_otra_vez_comprobado_y_el_id_no_sale_del_almacen() {
        let raiz = sitio("vivos");
        let dir = raiz.join("almacen");
        let raices = vec![raiz.clone()];
        std::fs::write(raiz.join("uno.png"), b"\x89PNG uno").unwrap();
        let uno = guardar(&dir, preparar(&pedido_de(&raiz.join("uno.png")), 1000, &raices, id_nuevo().unwrap()).unwrap(), 1000).unwrap();
        let mut web = Pedido { titulo: "La web".into(), puerto: Some(8080), horas: Some(1), ..Default::default() };
        web.proyecto = Some("Adeorq".into());
        let dos = guardar(&dir, preparar(&web, 2000, &raices, id_nuevo().unwrap()).unwrap(), 2000).unwrap();
        assert_eq!(vigentes(&dir, 3000).iter().map(|c| c.id.clone()).collect::<Vec<_>>(), [dos.id.clone(), uno.id.clone()]);

        let nada = |_: u16, _: &str| -> Result<Vec<u8>, String> { Err("no se captura en este banco".into()) };
        let (tipo, bytes) = contenido(&dir, &uno, &raices, false, 3000, &nada).unwrap();
        assert_eq!((tipo, bytes.as_slice()), ("image/png", b"\x89PNG uno".as_slice()));
        // La captura de una web se guarda y se reutiliza un minuto, salvo «nueva».
        let veces = std::cell::Cell::new(0);
        let foto = |puerto: u16, camino: &str| -> Result<Vec<u8>, String> {
            veces.set(veces.get() + 1);
            Ok(format!("\u{89}PNG {puerto}{camino}").into_bytes())
        };
        let ahora = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64;
        contenido(&dir, &dos, &raices, false, ahora, &foto).unwrap();
        contenido(&dir, &dos, &raices, false, ahora, &foto).unwrap();
        assert_eq!(veces.get(), 1, "la segunda, de la guardada");
        contenido(&dir, &dos, &raices, true, ahora, &foto).unwrap();
        assert_eq!(veces.get(), 2, "con «nueva», otra");

        // Si el archivo se cambia por otra cosa, ya no se sirve.
        std::fs::remove_file(raiz.join("uno.png")).unwrap();
        assert!(contenido(&dir, &uno, &raices, false, 3000, &nada).unwrap_err().contains("No encuentro"));

        // La de una hora caduca, y con ella su captura.
        assert!(buscar(&dir, &dos.id, 2000 + 3_600_000).is_none());
        assert!(!dir.join(format!("{}.png", dos.id)).exists());
        assert!(buscar(&dir, &uno.id, 2000 + 3_600_000).is_some());
        for raro in ["../compartidos", "ABC", &"g".repeat(32)] {
            assert!(buscar(&dir, raro, 0).is_none(), "{raro}");
        }
        // El tope: el más viejo se va.
        for i in 0..TOPE as u64 {
            guardar(&dir, preparar(&web, 4000 + i, &raices, id_nuevo().unwrap()).unwrap(), 4000 + i).unwrap();
        }
        assert_eq!(vigentes(&dir, 5000).len(), TOPE);
        assert!(buscar(&dir, &uno.id, 5000).is_none());
        let _ = std::fs::remove_dir_all(&raiz);
    }

    /// De verdad: una web que corre en este PC se captura con el Edge del
    /// sistema, a ancho de móvil. Lanza un navegador sin ventana unos segundos:
    /// `cargo test --lib compartidos -- --ignored`.
    #[test]
    #[ignore]
    fn una_web_de_este_pc_se_captura_de_verdad() {
        use std::io::{Read, Write};
        let escucha = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let puerto = escucha.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for s in escucha.incoming().flatten() {
                let mut s = s;
                let mut b = [0u8; 2048];
                let _ = s.read(&mut b);
                let html = "<!doctype html><html><body style=\"margin:0;background:#0b5\"><h1 style=\"font:48px sans-serif;color:#fff\">Hola desde el PC</h1></body></html>";
                let _ = write!(s, "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}", html.len());
            }
        });
        let png = capturar_web(puerto, "/").unwrap();
        assert!(png.starts_with(b"\x89PNG"));
        let ancho = u32::from_be_bytes([png[16], png[17], png[18], png[19]]);
        assert_eq!(ancho, ANCHO_CAPTURA * 2, "a ancho de móvil y al doble de densidad");
        // Un puerto donde no hay nada lo dice, sin abrir el Edge.
        let libre = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        assert!(capturar_web(libre, "/").unwrap_err().contains("No hay nada escuchando"));
    }
}
