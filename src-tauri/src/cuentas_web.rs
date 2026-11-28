// Las cuentas del navegador de los agentes (Munir, 2026-11-27: «todos los inicios de sesión
// unificados en una sección, remove, add»).
//
// Todas las terminales comparten UN Brave con su perfil propio (`~/.playwright-brave`, la
// decisión H2 de `docs/contexto/escudo.md`): entras una vez en una web y la usan todos los
// agentes sin pedirte que inicies sesión. Esta pieza dice en qué webs de una lista corta hay
// una sesión abierta en ese perfil, abre ese Brave en la página de entrar de una («Añadir», y
// la contraseña y el código los teclea Munir) y cierra la sesión de una borrando sus cookies
// («Quitar»).
//
// Del perfil se lee el DOMINIO, el NOMBRE y la CADUCIDAD de cada cookie, nunca su valor:
// ninguna consulta pide `value` ni `encrypted_value`, y el trozo de Playwright del navegador
// abierto filtra dentro del navegador y devuelve solo esos tres campos. El nombre hace falta
// porque visitar una web ya deja cookies: lo que dice «dentro» es la cookie que solo existe
// con la sesión abierta (la `user_session` de GitHub, la `auth_token` de X).
//
// Dos caminos, porque Brave (Chromium desde la 114) abre su archivo de cookies en exclusiva
// mientras corre (medido el 2026-11-27: «está siendo utilizado en otro proceso»):
// - Cerrado: se lee `Default\Network\Cookies`, que es un SQLite, con el SQLite que trae Windows
//   (`winsqlite3.dll`), sin librerías nuevas en el árbol; «Quitar» borra sus filas.
// - Abierto: lo tiene el servidor compartido del puerto 3019 (`escudo/navegador.mjs`), y se le
//   pregunta a él por HTTP (`/mcp`) con un trozo de Playwright. Una sesión nueva en ese servidor
//   no abre pestaña ni la deja (medido: dos consultas seguidas, las mismas pestañas).
//
// «Añadir» lanza `brave.exe --user-data-dir=<perfil> <página>`. Con el navegador abierto, Brave
// le pasa la página al que ya corre y sale en una pestaña suya (medido con GitHub); cerrado, abre
// una ventana normal con ese perfil, sin el «controlado por software automatizado», que es lo que
// Google necesita para dejar entrar. Mientras esa ventana siga abierta, los agentes no pueden
// encender el suyo: la pantalla lo dice.
//
// Solo en Windows: el navegador compartido existe en la máquina de Munir (F1 del escudo), y sin
// el perfil la sección ni sale.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

/// En qué bloque de la pantalla va cada web.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Grupo {
    /// Las de todos los días.
    Cuentas,
    /// Las que mandan sobre una web en vivo: llevan el aviso.
    Vivo,
    /// LinkedIn y el dinero: sin «Añadir», y con «Quitar» si ya hay sesión.
    Bloqueado,
}

pub struct Sitio {
    pub id: &'static str,
    pub grupo: Grupo,
    /// La página de entrar. Vacía en las bloqueadas: Adeorq no la abre.
    pub entrar: &'static str,
    /// Los dominios cuyas cookies son la sesión. «Quitar» borra las suyas y las de sus
    /// subdominios.
    pub dominios: &'static [&'static str],
    /// Las cookies que solo existen con la sesión abierta, como (dominio, nombre); un nombre que
    /// acaba en `*` vale por su principio (las cookies troceadas). Visitar una web ya deja
    /// cookies, así que «hay cookies de esa web» no dice nada.
    pub marcas: &'static [(&'static str, &'static str)],
    /// Si las marcas están medidas y son las únicas: sin ninguna, la sesión está cerrada. Si no,
    /// sin marca solo se puede decir «fuera» cuando no queda ni una cookie de esa web.
    pub seguras: bool,
    /// Las webs que guardan la sesión fuera de las cookies, en su almacenamiento local (el
    /// panel de Supabase: `supabase.dashboard.auth.token`). Desde fuera del navegador no se ve,
    /// y «Quitar» necesita el navegador encendido para borrarlo.
    pub origenes: &'static [&'static str],
    /// Va con la sesión de otra (Search Console con la de Google): ni marcas ni «Quitar» suyos.
    pub con: Option<&'static str>,
}

/// La lista corta del encargo, en el orden en que se enseña. Los nombres, los logos y el
/// porqué de cada bloqueada viven en el front (`lib/cuentasWeb.ts`), que los traduce; aquí va
/// lo que decide qué se lee, qué se abre y qué se borra.
pub const SITIOS: &[Sitio] = &[
    Sitio {
        id: "google",
        grupo: Grupo::Cuentas,
        entrar: "https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmyaccount.google.com%2F",
        dominios: &["google.com"],
        marcas: &[("google.com", "SID"), ("google.com", "__Secure-1PSID"), ("google.com", "__Secure-3PSID")],
        seguras: true,
        origenes: &[],
        con: None,
    },
    Sitio {
        id: "search-console",
        grupo: Grupo::Cuentas,
        entrar: "https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fsearch.google.com%2Fsearch-console",
        dominios: &[],
        marcas: &[],
        seguras: true,
        origenes: &[],
        con: Some("google"),
    },
    Sitio {
        id: "youtube",
        grupo: Grupo::Cuentas,
        entrar: "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F",
        dominios: &["youtube.com"],
        marcas: &[
            ("youtube.com", "SID"),
            ("youtube.com", "__Secure-1PSID"),
            ("youtube.com", "__Secure-3PSID"),
            ("youtube.com", "LOGIN_INFO"),
        ],
        seguras: true,
        origenes: &[],
        con: None,
    },
    Sitio {
        id: "x",
        grupo: Grupo::Cuentas,
        entrar: "https://x.com/i/flow/login",
        dominios: &["x.com", "twitter.com"],
        marcas: &[("x.com", "auth_token"), ("twitter.com", "auth_token")],
        seguras: true,
        origenes: &[],
        con: None,
    },
    Sitio {
        id: "canva",
        grupo: Grupo::Cuentas,
        entrar: "https://www.canva.com/login",
        dominios: &["canva.com"],
        // Sin medir: hasta el 2026-11-27 el perfil no tenía ni una cookie de Canva.
        marcas: &[],
        seguras: false,
        origenes: &[],
        con: None,
    },
    Sitio {
        id: "helpbnk",
        grupo: Grupo::Cuentas,
        entrar: "https://accelerator.helpbnk.com/",
        dominios: &["helpbnk.com"],
        // Es Laravel: `helpbnk_session` y `XSRF-TOKEN` se los pone a cualquier visita (medido
        // el 2026-11-27, de un día). Con «recordarme» deja `remember_web_…`, que sí es sesión;
        // sin ella, desde las cookies no se sabe.
        marcas: &[("helpbnk.com", "remember_web_*")],
        seguras: false,
        origenes: &[],
        con: None,
    },
    Sitio {
        id: "github",
        grupo: Grupo::Vivo,
        entrar: "https://github.com/login",
        dominios: &["github.com"],
        marcas: &[("github.com", "user_session"), ("github.com", "__Host-user_session_same_site")],
        seguras: true,
        origenes: &[],
        con: None,
    },
    Sitio {
        id: "cloudflare",
        grupo: Grupo::Vivo,
        entrar: "https://dash.cloudflare.com/login",
        dominios: &["cloudflare.com"],
        marcas: &[("dash.cloudflare.com", "vses2"), ("cloudflare.com", "__cf_logged_in")],
        seguras: true,
        origenes: &[],
        con: None,
    },
    Sitio {
        id: "supabase",
        grupo: Grupo::Vivo,
        entrar: "https://supabase.com/dashboard/sign-in",
        dominios: &["supabase.com"],
        marcas: &[],
        seguras: false,
        origenes: &["https://supabase.com"],
        con: None,
    },
    Sitio {
        id: "resend",
        grupo: Grupo::Vivo,
        entrar: "https://resend.com/login",
        dominios: &["resend.com"],
        // Su panel entra con Supabase y guarda la sesión en cookies troceadas (medido el
        // 2026-11-27: `sb-sb-auth-token.0` y `.1`). `RESEND_LAST_AUTH_PROVIDER` no vale: se queda
        // al salir.
        marcas: &[("resend.com", "sb-sb-auth-token*")],
        seguras: true,
        origenes: &[],
        con: None,
    },
    Sitio {
        id: "linkedin",
        grupo: Grupo::Bloqueado,
        entrar: "",
        dominios: &["linkedin.com"],
        marcas: &[("linkedin.com", "li_at")],
        seguras: true,
        origenes: &[],
        con: None,
    },
    Sitio {
        id: "stripe",
        grupo: Grupo::Bloqueado,
        entrar: "",
        dominios: &["stripe.com"],
        marcas: &[("stripe.com", "__Host-session"), ("stripe.com", "__Host-auth_token")],
        seguras: true,
        origenes: &[],
        con: None,
    },
    Sitio {
        id: "bancos",
        grupo: Grupo::Bloqueado,
        entrar: "",
        dominios: &[
            "paypal.com",
            "bbva.es",
            "bancosantander.es",
            "santander.com",
            "caixabank.es",
            "imaginbank.com",
            "ing.es",
            "bankinter.com",
            "bancsabadell.com",
            "openbank.es",
            "unicajabanco.es",
            "kutxabank.es",
            "abanca.com",
            "ibercaja.es",
            "evobanco.com",
            "myinvestor.es",
            "revolut.com",
            "n26.com",
            "wise.com",
        ],
        marcas: &[],
        seguras: false,
        origenes: &[],
        con: None,
    },
];

pub fn sitio(id: &str) -> Option<&'static Sitio> {
    SITIOS.iter().find(|s| s.id == id)
}

/// Una cookie tal como sale del perfil: dónde, cómo se llama y hasta cuándo. Sin valor.
#[derive(Clone, Debug, PartialEq)]
pub struct Galleta {
    pub dominio: String,
    pub nombre: String,
    /// Segundos Unix; 0 = de sesión (vale mientras el navegador siga abierto).
    pub caduca: i64,
}

/// Si una cookie de `host` (con o sin el punto de delante) es de `dominio` o de un subdominio.
pub fn es_de(host: &str, dominio: &str) -> bool {
    let h = host.trim_start_matches('.').to_ascii_lowercase();
    h == dominio || h.ends_with(&format!(".{dominio}"))
}

/// Las de todos los sitios: lo único que hace falta guardar de una lectura.
#[cfg_attr(not(windows), allow(dead_code))]
fn de_la_lista(g: &Galleta) -> bool {
    SITIOS.iter().any(|s| s.dominios.iter().any(|d| es_de(&g.dominio, d)))
}

/// Si el nombre de una cookie es el de una marca (`*` al final: vale por su principio).
fn es_la_marca(nombre: &str, marca: &str) -> bool {
    match marca.strip_suffix('*') {
        Some(principio) => nombre.starts_with(principio),
        None => nombre == marca,
    }
}

/// Si hay sesión en `s` según las cookies, y hasta cuándo dura la más larga de las que la dicen.
///
/// `Some(true)` solo con una cookie de sesión medida; `Some(false)` sin ella si las marcas son
/// seguras, o si no queda ni una cookie de esa web; y `None` cuando desde las cookies no se
/// puede saber (una web que la guarda en otro sitio, o de la que no se ha medido la cookie).
/// Nunca se adivina por la forma del nombre: el 2026-11-27 eso daba «dentro» a HelpBnk con la
/// cookie que Laravel le pone a cualquier visita.
pub fn estado_de(s: &Sitio, galletas: &[Galleta], ahora: i64) -> (Option<bool>, Option<i64>) {
    let base = match s.con {
        Some(otra) => match sitio(otra) {
            Some(o) => o,
            None => return (None, None),
        },
        None => s,
    };
    let vale = |g: &Galleta| g.caduca == 0 || g.caduca > ahora;
    let suyas: Vec<&Galleta> = galletas
        .iter()
        .filter(|g| vale(g) && base.dominios.iter().any(|d| es_de(&g.dominio, d)))
        .collect();
    let mut caduca: Option<i64> = None;
    let mut dentro = false;
    for g in &suyas {
        if base.marcas.iter().any(|(d, n)| es_la_marca(&g.nombre, n) && es_de(&g.dominio, d)) {
            dentro = true;
            if g.caduca > 0 {
                caduca = Some(caduca.map_or(g.caduca, |c| c.max(g.caduca)));
            }
        }
    }
    if dentro {
        return (Some(true), caduca);
    }
    if base.seguras || (suyas.is_empty() && base.origenes.is_empty()) {
        return (Some(false), None);
    }
    (None, None)
}

/// Chromium cuenta en microsegundos desde 1601; Unix, en segundos desde 1970.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn de_chromium(us: i64) -> i64 {
    if us <= 0 {
        return 0;
    }
    us / 1_000_000 - 11_644_473_600
}

// ───────── dónde está todo ─────────

fn perfil() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("ADEORQ_PERFIL_AGENTES") {
        return Some(PathBuf::from(p));
    }
    crate::dir_casa().map(|c| c.join(".playwright-brave"))
}

fn brave() -> Option<PathBuf> {
    let mut sitios: Vec<PathBuf> = Vec::new();
    for var in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Some(base) = std::env::var_os(var) {
            sitios.push(PathBuf::from(base).join("BraveSoftware\\Brave-Browser\\Application\\brave.exe"));
        }
    }
    sitios.into_iter().find(|p| p.is_file())
}

fn archivo_de_cookies(perfil: &Path) -> PathBuf {
    perfil.join("Default").join("Network").join("Cookies")
}

/// La dirección del servidor compartido (`escudo/navegador.mjs`, puerto 3019 de fábrica).
fn servidor() -> String {
    let puerto = std::env::var("ADEORQ_PUERTO_NAVEGADOR").unwrap_or_else(|_| "3019".into());
    format!("http://127.0.0.1:{puerto}/mcp")
}

/// Lo que se recuerda de cada web y no se lee del perfil: con qué cuenta se entra. Vive en
/// `%LOCALAPPDATA%\Adeorq\cuentas-web.json` (`{"pistas":{"google":"…"}}`), fuera del repo,
/// porque es un dato suyo y el código de Adeorq es público.
fn pistas() -> serde_json::Map<String, serde_json::Value> {
    let Ok(dir) = crate::dir_datos() else { return Default::default() };
    let Ok(texto) = std::fs::read_to_string(dir.join("cuentas-web.json")) else { return Default::default() };
    serde_json::from_str::<serde_json::Value>(&texto)
        .ok()
        .and_then(|v| v.get("pistas").and_then(|p| p.as_object().cloned()))
        .unwrap_or_default()
}

fn pista_de(s: &Sitio, p: &serde_json::Map<String, serde_json::Value>) -> Option<String> {
    let id = s.con.unwrap_or(s.id);
    p.get(id).and_then(|v| v.as_str()).map(str::trim).filter(|v| !v.is_empty()).map(String::from)
}

fn codificar(texto: &str) -> String {
    texto
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// La página que se abre: la de entrar, y en las de Google con la cuenta ya escrita.
pub fn pagina_de_entrar(s: &Sitio, pista: Option<&str>) -> String {
    match pista {
        Some(p) if s.entrar.starts_with("https://accounts.google.com/") => {
            format!("{}&Email={}", s.entrar, codificar(p))
        }
        _ => s.entrar.to_string(),
    }
}

// ───────── lo que ve la pantalla ─────────

#[derive(Serialize, Clone, Debug)]
pub struct SitioEstado {
    pub id: &'static str,
    pub grupo: Grupo,
    /// `None`: no se puede saber desde las cookies.
    pub dentro: Option<bool>,
    /// Hasta cuándo dura la sesión, en segundos Unix, si lo dice su cookie.
    pub caduca: Option<i64>,
    pub pista: Option<String>,
    pub con: Option<&'static str>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Estado {
    /// Si este equipo tiene el navegador de los agentes. Sin él la sección no sale.
    pub disponible: bool,
    /// Si el navegador está encendido ahora (tiene el archivo de cookies cogido).
    pub abierto: bool,
    /// La web en la que se está entrando, mientras siga abierta la ventana que abrió «Añadir».
    pub entrando: Option<String>,
    /// Si la lista es de una lectura anterior (no se ha podido leer ahora), de cuándo.
    pub de_antes: Option<i64>,
    pub error: Option<String>,
    pub sitios: Vec<SitioEstado>,
}

/// La última lectura buena y su hora: con el perfil cogido por la ventana de «Añadir» no se
/// puede leer, y la lista se queda con lo último sabido en vez de vaciarse.
static ULTIMA: Mutex<Option<(Vec<Galleta>, i64)>> = Mutex::new(None);

/// La ventana normal que abrió «Añadir» con el navegador cerrado, y de qué web.
static VENTANA: Mutex<Option<(String, std::process::Child)>> = Mutex::new(None);

fn ahora() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn entrando() -> Option<String> {
    let mut v = VENTANA.lock().ok()?;
    let sigue = match v.as_mut() {
        Some((_, hijo)) => matches!(hijo.try_wait(), Ok(None)),
        None => false,
    };
    if !sigue {
        *v = None;
        return None;
    }
    v.as_ref().map(|(id, _)| id.clone())
}

/// Si el archivo está cogido por un Brave en marcha. `Err` si ni existe.
fn cogido(cookies: &Path) -> Result<bool, String> {
    match std::fs::File::open(cookies) {
        Ok(_) => Ok(false),
        // ERROR_SHARING_VIOLATION: lo tiene abierto en exclusiva otro proceso.
        Err(e) if e.raw_os_error() == Some(32) => Ok(true),
        Err(e) => Err(e.to_string()),
    }
}

fn armar(galletas: &[Galleta]) -> Vec<SitioEstado> {
    let p = pistas();
    let t = ahora();
    SITIOS
        .iter()
        .map(|s| {
            let (dentro, caduca) = estado_de(s, galletas, t);
            SitioEstado { id: s.id, grupo: s.grupo, dentro, caduca, pista: pista_de(s, &p), con: s.con }
        })
        .collect()
}

#[tauri::command]
pub async fn cuentas_web_estado() -> Result<Estado, String> {
    let (Some(perfil), true) = (perfil(), cfg!(windows)) else {
        return Ok(Estado::vacio());
    };
    let cookies = archivo_de_cookies(&perfil);
    if brave().is_none() || !cookies.is_file() {
        return Ok(Estado::vacio());
    }
    let entrando = entrando();
    let ruta = cookies.clone();
    let abierto = tauri::async_runtime::spawn_blocking(move || cogido(&ruta))
        .await
        .map_err(|e| e.to_string())??;

    let leido: Result<Vec<Galleta>, String> = if !abierto {
        let ruta = cookies.clone();
        tauri::async_runtime::spawn_blocking(move || leer_del_archivo(&ruta))
            .await
            .map_err(|e| e.to_string())?
    } else if entrando.is_some() {
        // La tiene la ventana de «Añadir», que no es del servidor: preguntarle a él la abriría
        // otra vez y daría «already in use».
        Err(String::new())
    } else {
        leer_del_navegador().await
    };

    let mut estado = Estado {
        disponible: true,
        abierto,
        entrando,
        de_antes: None,
        error: None,
        sitios: Vec::new(),
    };
    match leido {
        Ok(g) => {
            estado.sitios = armar(&g);
            if let Ok(mut u) = ULTIMA.lock() {
                *u = Some((g, ahora()));
            }
        }
        Err(e) => {
            if !e.is_empty() {
                estado.error = Some(e);
            }
            let antes = ULTIMA.lock().ok().and_then(|u| u.clone());
            match antes {
                Some((g, cuando)) => {
                    estado.sitios = armar(&g);
                    estado.de_antes = Some(cuando);
                }
                None => estado.sitios = armar(&[]).into_iter().map(|mut s| {
                    s.dentro = None;
                    s
                }).collect(),
            }
        }
    }
    Ok(estado)
}

impl Estado {
    fn vacio() -> Estado {
        Estado { disponible: false, abierto: false, entrando: None, de_antes: None, error: None, sitios: Vec::new() }
    }
}

#[derive(Serialize)]
pub struct Anadido {
    /// true: la página salió en una pestaña del navegador que ya estaba abierto.
    pub en_el_abierto: bool,
}

#[tauri::command(async)]
pub fn cuentas_web_anadir(id: String) -> Result<Anadido, String> {
    let s = sitio(&id).ok_or("esa web no está en la lista")?;
    if s.grupo == Grupo::Bloqueado || s.entrar.is_empty() {
        return Err("esa web no se abre en el navegador de los agentes".into());
    }
    let perfil = perfil().ok_or("no encuentro el perfil del navegador de los agentes")?;
    let exe = brave().ok_or("no encuentro Brave en este equipo")?;
    let abierto = cogido(&archivo_de_cookies(&perfil)).unwrap_or(false);
    if entrando().is_some() {
        return Err("ya hay una ventana abierta para entrar: ciérrala antes".into());
    }
    let pagina = pagina_de_entrar(s, pista_de(s, &pistas()).as_deref());
    let hijo = std::process::Command::new(exe)
        .arg(format!("--user-data-dir={}", perfil.display()))
        .arg(&pagina)
        .spawn()
        .map_err(|e| format!("no pude abrir Brave: {e}"))?;
    if !abierto {
        if let Ok(mut v) = VENTANA.lock() {
            *v = Some((id, hijo));
        }
    }
    Ok(Anadido { en_el_abierto: abierto })
}

#[tauri::command]
pub async fn cuentas_web_quitar(id: String) -> Result<(), String> {
    let s = sitio(&id).ok_or("esa web no está en la lista")?;
    if s.con.is_some() || s.dominios.is_empty() {
        return Err("esta va con la sesión de otra: quítala desde esa".into());
    }
    let perfil = perfil().ok_or("no encuentro el perfil del navegador de los agentes")?;
    if entrando().is_some() {
        return Err("cierra antes la ventana donde estás entrando".into());
    }
    let cookies = archivo_de_cookies(&perfil);
    let abierto = cogido(&cookies)?;
    if !abierto && s.origenes.is_empty() {
        let dominios: Vec<String> = s.dominios.iter().map(|d| d.to_string()).collect();
        tauri::async_runtime::spawn_blocking(move || borrar_del_archivo(&cookies, &dominios))
            .await
            .map_err(|e| e.to_string())??;
    } else {
        // Abierto, o una web que guarda la sesión fuera de las cookies: lo hace el navegador.
        // Si estaba cerrado, el servidor lo enciende para esto y lo apaga al irse la última
        // sesión.
        let quedan = quitar_en_el_navegador(s).await?;
        if quedan > 0 {
            return Err(format!("quedan {quedan} cookies de esa web"));
        }
    }
    if let Ok(mut u) = ULTIMA.lock() {
        if let Some((g, _)) = u.as_mut() {
            g.retain(|x| !s.dominios.iter().any(|d| es_de(&x.dominio, d)));
        }
    }
    Ok(())
}

// ───────── el archivo, con el navegador cerrado ─────────

fn leer_del_archivo(cookies: &Path) -> Result<Vec<Galleta>, String> {
    #[cfg(windows)]
    {
        let db = winsqlite::Db::leer(cookies)?;
        let mut out = Vec::new();
        db.filas("SELECT host_key, name, expires_utc, has_expires FROM cookies", |f| {
            let g = Galleta {
                dominio: f.texto(0),
                nombre: f.texto(1),
                caduca: if f.entero(3) == 0 { 0 } else { de_chromium(f.entero(2)) },
            };
            if de_la_lista(&g) {
                out.push(g);
            }
        })?;
        Ok(out)
    }
    #[cfg(not(windows))]
    {
        let _ = cookies;
        Err("solo en Windows".into())
    }
}

/// La orden que borra las cookies de esos dominios y de sus subdominios. Los dominios salen de
/// `SITIOS`, nunca de fuera, y aun así se comprueba que no traen nada que no sea de un dominio.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn orden_de_borrar(dominios: &[String]) -> Result<String, String> {
    let mut partes = Vec::new();
    for d in dominios {
        if d.is_empty() || !d.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
            return Err(format!("dominio raro: {d}"));
        }
        partes.push(format!("host_key = '{d}' OR host_key = '.{d}' OR host_key LIKE '%.{d}'"));
    }
    Ok(format!("DELETE FROM cookies WHERE {}", partes.join(" OR ")))
}

fn borrar_del_archivo(cookies: &Path, dominios: &[String]) -> Result<usize, String> {
    #[cfg(windows)]
    {
        let orden = orden_de_borrar(dominios)?;
        let db = winsqlite::Db::escribir(cookies)?;
        db.ejecutar("BEGIN IMMEDIATE")?;
        let borradas = match db.ejecutar(&orden) {
            Ok(n) => n,
            Err(e) => {
                let _ = db.ejecutar("ROLLBACK");
                return Err(e);
            }
        };
        db.ejecutar("COMMIT")?;
        Ok(borradas)
    }
    #[cfg(not(windows))]
    {
        let _ = (cookies, dominios);
        Err("solo en Windows".into())
    }
}

// ───────── el navegador abierto, por el servidor compartido ─────────

/// Lo que devuelve una llamada a `browser_run_code_unsafe`: su texto trae el resultado entre
/// «### Result» y la siguiente cabecera, como JSON (y si el código devolvió una cadena, otra
/// vez dentro).
pub fn resultado_de(texto: &str) -> Result<serde_json::Value, String> {
    let desde = texto.find("### Result\n").ok_or("el navegador no ha devuelto resultado")? + "### Result\n".len();
    let resto = &texto[desde..];
    let hasta = resto.find("\n### ").unwrap_or(resto.len());
    let v: serde_json::Value = serde_json::from_str(resto[..hasta].trim()).map_err(|e| e.to_string())?;
    match v {
        serde_json::Value::String(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        otro => Ok(otro),
    }
}

/// Las líneas `data:` de una respuesta del transporte HTTP de MCP, ya leídas como JSON.
fn mensajes(cuerpo: &str) -> Vec<serde_json::Value> {
    let mut out: Vec<serde_json::Value> = cuerpo
        .lines()
        .filter_map(|l| l.strip_prefix("data: "))
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();
    if out.is_empty() {
        if let Ok(v) = serde_json::from_str(cuerpo.trim()) {
            out.push(v);
        }
    }
    out
}

async fn correr(codigo: &str) -> Result<serde_json::Value, String> {
    let url = servidor();
    let cliente = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let acepta = "application/json, text/event-stream";
    let ini = serde_json::json!({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": { "protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": { "name": "adeorq-cuentas", "version": "1" } }
    });
    let r = cliente
        .post(&url)
        .header("Accept", acepta)
        .json(&ini)
        .send()
        .await
        .map_err(|_| "el servidor del navegador de los agentes no contesta".to_string())?;
    let sesion = r
        .headers()
        .get("mcp-session-id")
        .and_then(|v| v.to_str().ok())
        .map(String::from)
        .ok_or("el servidor del navegador no ha dado sesión")?;
    let _ = r.text().await;
    let hecho = async {
        let aviso = serde_json::json!({ "jsonrpc": "2.0", "method": "notifications/initialized" });
        cliente
            .post(&url)
            .header("Accept", acepta)
            .header("mcp-session-id", &sesion)
            .json(&aviso)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let llamada = serde_json::json!({
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": { "name": "browser_run_code_unsafe", "arguments": { "code": codigo } }
        });
        let cuerpo = cliente
            .post(&url)
            .header("Accept", acepta)
            .header("mcp-session-id", &sesion)
            .json(&llamada)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())?;
        let m = mensajes(&cuerpo)
            .into_iter()
            .find(|m| m.get("id").and_then(|i| i.as_i64()) == Some(2))
            .ok_or("el navegador no ha contestado")?;
        if let Some(e) = m.get("error") {
            return Err(e.get("message").and_then(|x| x.as_str()).unwrap_or("error del navegador").to_string());
        }
        let texto = m["result"]["content"][0]["text"].as_str().unwrap_or("").to_string();
        if m["result"]["isError"].as_bool() == Some(true) {
            return Err(texto.lines().find(|l| !l.trim().is_empty() && !l.starts_with('#')).unwrap_or("error").to_string());
        }
        resultado_de(&texto)
    }
    .await;
    // La sesión se suelta siempre: es la que le dice al servidor que ya no la usa nadie.
    let _ = cliente.delete(&url).header("mcp-session-id", &sesion).send().await;
    hecho
}

fn lista_js(cosas: &[&str]) -> String {
    serde_json::to_string(cosas).unwrap_or_else(|_| "[]".into())
}

fn todos_los_dominios() -> Vec<&'static str> {
    SITIOS.iter().flat_map(|s| s.dominios.iter().copied()).collect()
}

/// El trozo que lee: filtra DENTRO del navegador y solo saca dominio, nombre y caducidad.
pub fn codigo_de_leer() -> String {
    format!(
        "async (page) => {{ const D = {}; const de = (h) => {{ h = h.replace(/^\\./, '').toLowerCase(); return D.some((d) => h === d || h.endsWith('.' + d)); }}; const c = await page.context().cookies(); return c.filter((x) => de(x.domain)).map((x) => [x.domain, x.name, x.expires > 0 ? Math.floor(x.expires) : 0]); }}",
        lista_js(&todos_los_dominios())
    )
}

/// El trozo que quita: las cookies de sus dominios y, si la guarda ahí, lo que tenga en el
/// almacenamiento del sitio. Devuelve cuántas cookies de esos dominios quedan.
pub fn codigo_de_quitar(s: &Sitio) -> String {
    format!(
        "async (page) => {{ const D = {}; const O = {}; const ctx = page.context(); const re = (d) => new RegExp('(^|\\\\.)' + d.replace(/\\./g, '\\\\.') + '$', 'i'); for (const d of D) await ctx.clearCookies({{ domain: re(d) }}); if (O.length) {{ const s = await ctx.newCDPSession(page); for (const o of O) await s.send('Storage.clearDataForOrigin', {{ origin: o, storageTypes: 'local_storage,indexeddb,cache_storage,service_workers' }}); await s.detach(); }} const quedan = (await ctx.cookies()).filter((c) => D.some((d) => re(d).test(c.domain))).length; return {{ quedan }}; }}",
        lista_js(s.dominios),
        lista_js(s.origenes)
    )
}

async fn leer_del_navegador() -> Result<Vec<Galleta>, String> {
    let v = correr(&codigo_de_leer()).await?;
    let filas = v.as_array().ok_or("el navegador no ha devuelto la lista")?;
    Ok(filas
        .iter()
        .filter_map(|f| {
            Some(Galleta {
                dominio: f.get(0)?.as_str()?.to_string(),
                nombre: f.get(1)?.as_str()?.to_string(),
                caduca: f.get(2)?.as_i64().unwrap_or(0),
            })
        })
        .collect())
}

async fn quitar_en_el_navegador(s: &Sitio) -> Result<i64, String> {
    let v = correr(&codigo_de_quitar(s)).await?;
    Ok(v.get("quedan").and_then(|q| q.as_i64()).unwrap_or(0))
}

// ───────── el SQLite de Windows ─────────

/// `winsqlite3.dll` viene con Windows 10 y 11 (en `System32`), con la API de C de SQLite de
/// siempre. Se carga solo de `System32`, al primer uso: si un día faltara, falla esta sección y
/// no la app entera.
#[cfg(windows)]
mod winsqlite {
    use std::ffi::{c_char, c_int, c_void, CStr, CString};
    use std::path::Path;
    use std::sync::OnceLock;
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_SYSTEM32};

    type Open = unsafe extern "system" fn(*const c_char, *mut *mut c_void, c_int, *const c_char) -> c_int;
    type Prepare =
        unsafe extern "system" fn(*mut c_void, *const c_char, c_int, *mut *mut c_void, *mut *const c_char) -> c_int;
    type Paso = unsafe extern "system" fn(*mut c_void) -> c_int;
    type Texto = unsafe extern "system" fn(*mut c_void, c_int) -> *const u8;
    type Entero = unsafe extern "system" fn(*mut c_void, c_int) -> i64;
    type Exec =
        unsafe extern "system" fn(*mut c_void, *const c_char, *const c_void, *mut c_void, *mut *mut c_char) -> c_int;
    type Mensaje = unsafe extern "system" fn(*mut c_void) -> *const c_char;
    type Libera = unsafe extern "system" fn(*mut c_void);

    struct Api {
        open: Open,
        prepare: Prepare,
        step: Paso,
        texto: Texto,
        entero: Entero,
        finalize: Paso,
        close: Paso,
        exec: Exec,
        errmsg: Mensaje,
        changes: Paso,
        free: Libera,
        busy: unsafe extern "system" fn(*mut c_void, c_int) -> c_int,
    }

    const OK: c_int = 0;
    const FILA: c_int = 100;
    const HECHO: c_int = 101;
    const SOLO_LEER: c_int = 0x1;
    const LEER_Y_ESCRIBIR: c_int = 0x2;
    #[cfg(test)]
    const CREAR: c_int = 0x4;
    const URI: c_int = 0x40;

    fn api() -> Result<&'static Api, String> {
        static API: OnceLock<Result<Api, String>> = OnceLock::new();
        API.get_or_init(cargar).as_ref().map_err(|e| e.clone())
    }

    fn cargar() -> Result<Api, String> {
        let nombre: Vec<u16> = "winsqlite3.dll".encode_utf16().chain(Some(0)).collect();
        // SAFETY: nombre acaba en 0 y solo se busca en System32.
        let m = unsafe { LoadLibraryExW(nombre.as_ptr(), std::ptr::null_mut(), LOAD_LIBRARY_SEARCH_SYSTEM32) };
        if m.is_null() {
            return Err("este Windows no trae winsqlite3.dll".into());
        }
        macro_rules! f {
            ($n:literal) => {{
                // SAFETY: el nombre es un literal acabado en 0 y la firma es la de la API de C
                // de SQLite, que winsqlite3 exporta tal cual.
                let p = unsafe { GetProcAddress(m, concat!($n, "\0").as_ptr()) }
                    .ok_or(concat!("winsqlite3 no tiene ", $n))?;
                unsafe { std::mem::transmute(p) }
            }};
        }
        Ok(Api {
            open: f!("sqlite3_open_v2"),
            prepare: f!("sqlite3_prepare_v2"),
            step: f!("sqlite3_step"),
            texto: f!("sqlite3_column_text"),
            entero: f!("sqlite3_column_int64"),
            finalize: f!("sqlite3_finalize"),
            close: f!("sqlite3_close"),
            exec: f!("sqlite3_exec"),
            errmsg: f!("sqlite3_errmsg"),
            changes: f!("sqlite3_changes"),
            free: f!("sqlite3_free"),
            busy: f!("sqlite3_busy_timeout"),
        })
    }

    pub struct Db {
        api: &'static Api,
        db: *mut c_void,
    }

    pub struct Fila<'a> {
        api: &'static Api,
        st: *mut c_void,
        _d: std::marker::PhantomData<&'a ()>,
    }

    impl Fila<'_> {
        pub fn texto(&self, i: i32) -> String {
            // SAFETY: `st` está en una fila (SQLITE_ROW) mientras dura `Fila`.
            let p = unsafe { (self.api.texto)(self.st, i) };
            if p.is_null() {
                return String::new();
            }
            unsafe { CStr::from_ptr(p as *const c_char) }.to_string_lossy().into_owned()
        }
        pub fn entero(&self, i: i32) -> i64 {
            unsafe { (self.api.entero)(self.st, i) }
        }
    }

    /// `file:///C:/…` con lo que una URI no deja pasar tal cual.
    fn uri(ruta: &Path) -> String {
        let mut s = String::from("file:///");
        for c in ruta.to_string_lossy().replace('\\', "/").chars() {
            match c {
                '%' => s.push_str("%25"),
                '?' => s.push_str("%3F"),
                '#' => s.push_str("%23"),
                ' ' => s.push_str("%20"),
                otro => s.push(otro),
            }
        }
        s
    }

    impl Db {
        fn abrir(nombre: &str, banderas: c_int) -> Result<Db, String> {
            let api = api()?;
            let c = CString::new(nombre).map_err(|e| e.to_string())?;
            let mut db: *mut c_void = std::ptr::null_mut();
            // SAFETY: `c` vive durante la llamada y `db` es la salida.
            let r = unsafe { (api.open)(c.as_ptr(), &mut db, banderas, std::ptr::null()) };
            let d = Db { api, db };
            if r != OK {
                return Err(format!("no pude abrir las cookies: {}", d.error()));
            }
            unsafe { (api.busy)(db, 2000) };
            Ok(d)
        }

        /// Sin tocar nada: `immutable` no toma cerrojos ni crea el diario.
        pub fn leer(ruta: &Path) -> Result<Db, String> {
            Db::abrir(&format!("{}?mode=ro&immutable=1", uri(ruta)), SOLO_LEER | URI)
        }

        pub fn escribir(ruta: &Path) -> Result<Db, String> {
            Db::abrir(&ruta.to_string_lossy(), LEER_Y_ESCRIBIR)
        }

        #[cfg(test)]
        pub fn crear(ruta: &Path) -> Result<Db, String> {
            Db::abrir(&ruta.to_string_lossy(), LEER_Y_ESCRIBIR | CREAR)
        }

        fn error(&self) -> String {
            if self.db.is_null() {
                return "sin memoria".into();
            }
            let p = unsafe { (self.api.errmsg)(self.db) };
            if p.is_null() {
                return "error".into();
            }
            unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned()
        }

        pub fn filas(&self, sql: &str, mut cada: impl FnMut(&Fila)) -> Result<(), String> {
            let c = CString::new(sql).map_err(|e| e.to_string())?;
            let mut st: *mut c_void = std::ptr::null_mut();
            let r = unsafe { (self.api.prepare)(self.db, c.as_ptr(), -1, &mut st, std::ptr::null_mut()) };
            if r != OK {
                return Err(self.error());
            }
            let fin = loop {
                match unsafe { (self.api.step)(st) } {
                    FILA => cada(&Fila { api: self.api, st, _d: std::marker::PhantomData }),
                    HECHO => break Ok(()),
                    _ => break Err(self.error()),
                }
            };
            unsafe { (self.api.finalize)(st) };
            fin
        }

        /// Ejecuta una orden y dice cuántas filas cambió.
        pub fn ejecutar(&self, sql: &str) -> Result<usize, String> {
            let c = CString::new(sql).map_err(|e| e.to_string())?;
            let mut msg: *mut c_char = std::ptr::null_mut();
            let r = unsafe { (self.api.exec)(self.db, c.as_ptr(), std::ptr::null(), std::ptr::null_mut(), &mut msg) };
            if r != OK {
                let texto = if msg.is_null() {
                    self.error()
                } else {
                    let t = unsafe { CStr::from_ptr(msg) }.to_string_lossy().into_owned();
                    unsafe { (self.api.free)(msg as *mut c_void) };
                    t
                };
                return Err(texto);
            }
            Ok(unsafe { (self.api.changes)(self.db) }.max(0) as usize)
        }
    }

    impl Drop for Db {
        fn drop(&mut self) {
            if !self.db.is_null() {
                unsafe { (self.api.close)(self.db) };
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn g(d: &str, n: &str, c: i64) -> Galleta {
        Galleta { dominio: d.into(), nombre: n.into(), caduca: c }
    }

    #[test]
    fn la_lista_no_repite_ni_abre_las_bloqueadas() {
        let mut ids: Vec<&str> = SITIOS.iter().map(|s| s.id).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), SITIOS.len(), "un id repetido");
        for s in SITIOS {
            if s.grupo == Grupo::Bloqueado {
                assert!(s.entrar.is_empty(), "{} está bloqueada y lleva página de entrar", s.id);
            } else {
                assert!(s.entrar.starts_with("https://"), "{} sin página de entrar", s.id);
            }
            if let Some(o) = s.con {
                assert!(sitio(o).is_some(), "{} va con {o}, que no existe", s.id);
            }
        }
        for id in ["github", "cloudflare", "supabase", "resend"] {
            assert_eq!(sitio(id).map(|s| s.grupo), Some(Grupo::Vivo), "{id} manda sobre una web en vivo");
        }
        for id in ["linkedin", "stripe", "bancos"] {
            assert_eq!(sitio(id).map(|s| s.grupo), Some(Grupo::Bloqueado));
        }
    }

    #[test]
    fn un_dominio_es_el_suyo_y_sus_subdominios() {
        assert!(es_de(".github.com", "github.com"));
        assert!(es_de("github.com", "github.com"));
        assert!(es_de("gist.github.com", "github.com"));
        assert!(!es_de("notgithub.com", "github.com"));
        assert!(!es_de("google.com.au", "google.com"));
        assert!(es_de(".DASH.cloudflare.com", "cloudflare.com"));
    }

    #[test]
    fn dentro_es_su_cookie_de_sesion_y_sin_caducar() {
        let gh = sitio("github").unwrap();
        let ahora = 1_800_000_000;
        // Solo de visita: fuera, aunque haya cookies de GitHub.
        let visita = [g(".github.com", "_octo", ahora + 99), g(".github.com", "logged_in", ahora + 99)];
        assert_eq!(estado_de(gh, &visita, ahora), (Some(false), None));
        let dentro = [g("github.com", "user_session", ahora + 500), g(".github.com", "_octo", ahora + 99)];
        assert_eq!(estado_de(gh, &dentro, ahora), (Some(true), Some(ahora + 500)));
        let caducada = [g("github.com", "user_session", ahora - 1)];
        assert_eq!(estado_de(gh, &caducada, ahora), (Some(false), None));
        // De sesión (sin caducidad): vale, y no dice hasta cuándo.
        let de_sesion = [g("github.com", "user_session", 0)];
        assert_eq!(estado_de(gh, &de_sesion, ahora), (Some(true), None));
        // La cookie con el nombre bueno pero de otro dominio no cuenta.
        let otro = [g("evil.com", "user_session", ahora + 500)];
        assert_eq!(estado_de(gh, &otro, ahora), (Some(false), None));
    }

    #[test]
    fn search_console_va_con_google() {
        let sc = sitio("search-console").unwrap();
        let ahora = 1_800_000_000;
        assert_eq!(estado_de(sc, &[g(".google.com", "SID", ahora + 10)], ahora), (Some(true), Some(ahora + 10)));
        assert_eq!(estado_de(sc, &[g(".google.com", "NID", ahora + 10)], ahora).0, Some(false));
    }

    #[test]
    fn sin_marca_medida_no_se_adivina() {
        let ahora = 1_800_000_000;
        // HelpBnk, lo que había en su perfil el 2026-11-27: las cookies de cualquier visita.
        let hb = sitio("helpbnk").unwrap();
        let visita = [g("helpbnk.com", "helpbnk_session", ahora + 9), g("helpbnk.com", "XSRF-TOKEN", ahora + 9)];
        assert_eq!(estado_de(hb, &visita, ahora), (None, None));
        let recordada = [g("helpbnk.com", "remember_web_59ba36addc2b", ahora + 99)];
        assert_eq!(estado_de(hb, &recordada, ahora), (Some(true), Some(ahora + 99)));
        // Canva sin ni una cookie: fuera seguro. Con alguna sin medir: no se sabe.
        let canva = sitio("canva").unwrap();
        assert_eq!(estado_de(canva, &[], ahora), (Some(false), None));
        assert_eq!(estado_de(canva, &[g(".canva.com", "CDI", ahora + 9)], ahora), (None, None));
        // Resend, medido: las troceadas dicen dentro, las de visita y la del proveedor no.
        let resend = sitio("resend").unwrap();
        let de_visita = [g(".resend.com", "_iidt", ahora + 9), g("resend.com", "RESEND_LAST_AUTH_PROVIDER", ahora + 9)];
        assert_eq!(estado_de(resend, &de_visita, ahora), (Some(false), None));
        let dentro = [g("resend.com", "sb-sb-auth-token.0", ahora + 7), g("resend.com", "sb-sb-auth-token.1", ahora + 8)];
        assert_eq!(estado_de(resend, &dentro, ahora), (Some(true), Some(ahora + 8)));
    }

    #[test]
    fn supabase_no_se_sabe_desde_las_cookies() {
        let s = sitio("supabase").unwrap();
        assert_eq!(estado_de(s, &[g(".supabase.com", "__stripe_mid", 9)], 0), (None, None));
        // Ni sin ninguna: la sesión vive en su almacenamiento, no en una cookie.
        assert_eq!(estado_de(s, &[], 0), (None, None));
    }

    #[test]
    fn la_hora_de_chromium() {
        // 13455039528535821 es la caducidad de una cookie de Google de su perfil.
        assert_eq!(de_chromium(13_455_039_528_535_821), 1_810_565_928);
        assert_eq!(de_chromium(0), 0);
    }

    #[test]
    fn la_pagina_de_google_lleva_la_cuenta() {
        let gl = sitio("google").unwrap();
        let u = pagina_de_entrar(gl, Some("ana+prueba@ejemplo.com"));
        assert!(u.ends_with("&Email=ana%2Bprueba%40ejemplo.com"), "{u}");
        let gh = sitio("github").unwrap();
        assert_eq!(pagina_de_entrar(gh, Some("x@y.z")), "https://github.com/login");
        let sc = sitio("search-console").unwrap();
        let mut p = serde_json::Map::new();
        p.insert("google".into(), serde_json::Value::String("a@b.c".into()));
        assert_eq!(pista_de(sc, &p).as_deref(), Some("a@b.c"));
    }

    #[test]
    fn la_orden_de_borrar_solo_acepta_dominios() {
        let o = orden_de_borrar(&["x.com".into(), "twitter.com".into()]).unwrap();
        assert!(o.starts_with("DELETE FROM cookies WHERE host_key = 'x.com'"));
        assert!(o.contains("LIKE '%.twitter.com'"));
        assert!(orden_de_borrar(&["x.com' OR 1=1 --".into()]).is_err());
        assert!(orden_de_borrar(&["".into()]).is_err());
    }

    #[test]
    fn el_resultado_del_navegador() {
        // Tal como lo devolvió el servidor de verdad el 2026-11-27.
        let texto = "### Result\n\"{\\\"paginas\\\":2}\"\n### Ran Playwright code\n```js\nawait (x)(page);\n```";
        assert_eq!(resultado_de(texto).unwrap()["paginas"], 2);
        let lista = "### Result\n[\n  [\n    \".github.com\",\n    \"_octo\",\n    1810000000\n  ]\n]\n### Ran Playwright code";
        assert_eq!(resultado_de(lista).unwrap()[0][1], "_octo");
        assert!(resultado_de("### Error\nnada").is_err());
        let sse = "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{}}\n\n";
        assert_eq!(mensajes(sse)[0]["id"], 2);
    }

    #[test]
    fn el_codigo_de_leer_no_pide_valores() {
        let c = codigo_de_leer();
        assert!(!c.contains(".value"), "el trozo de leer no puede tocar el valor: {c}");
        assert!(c.contains("\"github.com\""));
        let q = codigo_de_quitar(sitio("supabase").unwrap());
        assert!(q.contains("Storage.clearDataForOrigin") && q.contains("\"https://supabase.com\""));
    }

    /// El SQLite de Windows de verdad, sobre un archivo de prueba con la forma del de Chromium.
    #[cfg(windows)]
    #[test]
    fn lee_y_borra_un_archivo_de_cookies() {
        let dir = std::env::temp_dir().join(format!("adeorq-cuentas-web-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let ruta = dir.join("Cookies");
        {
            let db = winsqlite::Db::crear(&ruta).unwrap();
            db.ejecutar("CREATE TABLE cookies(host_key TEXT, name TEXT, value TEXT, encrypted_value BLOB, expires_utc INTEGER, has_expires INTEGER)").unwrap();
            db.ejecutar("INSERT INTO cookies VALUES ('github.com','user_session','secreto',x'00',13455039528535821,1), ('.github.com','_octo','',x'',13455039528535821,1), ('.x.com','guest_id','',x'',0,0), ('.ejemplo.org','sid','',x'',0,0)").unwrap();
        }
        let leidas = leer_del_archivo(&ruta).unwrap();
        assert_eq!(leidas.len(), 3, "la de ejemplo.org no es de la lista: {leidas:?}");
        assert!(leidas.contains(&g("github.com", "user_session", 1_810_565_928)));
        assert!(leidas.contains(&g(".x.com", "guest_id", 0)));
        assert_eq!(estado_de(sitio("github").unwrap(), &leidas, 1_800_000_000).0, Some(true));

        assert!(!cogido(&ruta).unwrap());
        let n = borrar_del_archivo(&ruta, &["github.com".into()]).unwrap();
        assert_eq!(n, 2);
        let quedan = leer_del_archivo(&ruta).unwrap();
        assert_eq!(quedan, vec![g(".x.com", "guest_id", 0)]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Contra el perfil de verdad, sin tocarlo: cuántas cookies y qué dice de cada web. No
    /// enseña nombres ni valores. `cargo test --lib mide_el_perfil_de_los_agentes -- --ignored --nocapture`
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn mide_el_perfil_de_los_agentes() {
        let perfil = perfil().unwrap();
        let cookies = archivo_de_cookies(&perfil);
        if cogido(&cookies).unwrap() {
            println!("el navegador está abierto: el archivo está cogido");
            return;
        }
        let t0 = std::time::Instant::now();
        let g = leer_del_archivo(&cookies).unwrap();
        println!("{} cookies de la lista en {:?}", g.len(), t0.elapsed());
        for s in armar(&g) {
            println!("{:>15} {:?} {:?}", s.id, s.dentro, s.caduca);
        }
    }

    /// Lo mismo con el navegador abierto, por el servidor compartido (solo dominio, nombre y
    /// caducidad salen del navegador). `cargo test --lib mide_el_navegador_abierto -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn mide_el_navegador_abierto() {
        let t0 = std::time::Instant::now();
        let g = tauri::async_runtime::block_on(leer_del_navegador()).unwrap();
        println!("{} cookies de la lista en {:?}", g.len(), t0.elapsed());
        for s in armar(&g) {
            println!("{:>15} {:?} {:?}", s.id, s.dentro, s.caduca);
        }
    }
}
