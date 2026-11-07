// Que una clave de agente avise antes de dejar de valer.
//
// Munir, 2026-11-06, entre lo que más le cansa: «un servicio como Cloudflare,
// Supabase o GitHub que deja de funcionar y hay que reconectarlo o crear una
// clave nueva». Hasta hoy eso se descubría a mitad de un encargo: un agente
// lanzaba `adeorq secreto cloudflare -- wrangler deploy`, salía un 401 y probaba
// otra vez, y otra, hasta que alguien se daba cuenta de que la clave había
// caducado.
//
// Ahora, al guardarla y una vez al día, Adeorq le pregunta al propio servicio si
// la clave vale y cuándo caduca, cuando el servicio lo dice:
//
// - Cloudflare: `GET /user/tokens/verify` da `status` y `expires_on`. Un token de
//   cuenta no pasa por ahí: se mira con `GET /accounts` y su `/tokens/verify`.
// - GitHub: cualquier llamada con el token trae la cabecera
//   `github-authentication-token-expiration` si caduca.
// - Vercel: `GET /v5/user/tokens/current` da `expiresAt` en milisegundos.
// - Supabase: la API de gestión NO dice cuándo caduca un token (leído en su
//   documentación el 2026-11-06): solo se sabe si vale. Se avisa el día que deja
//   de valer, no antes.
//
// Lo que se guarda (`secretos-de-agente-caducidad.json`) es el nombre, el
// servicio, la fecha y si vale. El valor no sale de Rust nunca, y solo viaja al
// servicio de esa misma clave, a una dirección fija escrita aquí.
//
// A Munir se le avisa una vez una semana antes y otra cuando deja de valer
// (`que_avisar`), con un aviso en la ventana y otro del escritorio (`PedirSecreto.tsx`).

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use tauri::Emitter;

const DIA: u64 = 86_400;
/// Cuánto antes se avisa de que una clave va a caducar.
const ANTES: u64 = 7 * DIA;
/// Cada cuánto se vuelve a preguntar al servicio por una clave ya mirada.
const CADA: u64 = 20 * 3_600;

/// Un servicio que sabe decir si una clave suya vale.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Servicio {
    Cloudflare,
    Github,
    Supabase,
    Vercel,
}

impl Servicio {
    pub fn nombre(self) -> &'static str {
        match self {
            Servicio::Cloudflare => "Cloudflare",
            Servicio::Github => "GitHub",
            Servicio::Supabase => "Supabase",
            Servicio::Vercel => "Vercel",
        }
    }
}

/// De qué servicio es una clave, por su forma y por su nombre. `None` si no es de
/// ninguno que sepa contestar: ElevenLabs, Gemini, Stripe y las de modelos no
/// caducan solas, y una clave que no se sabe de dónde es no se manda a nadie.
pub fn servicio_de(nombre: &str, valor: &str) -> Option<Servicio> {
    let n = nombre.to_ascii_lowercase();
    // La forma manda: es lo que pone el propio servicio al crearla.
    if valor.starts_with("sbp_") {
        return Some(Servicio::Supabase);
    }
    if ["ghp_", "github_pat_", "gho_", "ghu_"].iter().any(|p| valor.starts_with(p)) {
        return Some(Servicio::Github);
    }
    // La «Global API Key» de Cloudflare (37 caracteres hexadecimales) no es un
    // token: va con el correo y otra cabecera, y `verify` la daría por muerta.
    let llave_global = valor.len() == 37 && valor.bytes().all(|b| b.is_ascii_hexdigit());
    if (n.contains("cloudflare") || n.contains("wrangler") || n.starts_with("cf-") || n.starts_with("cf_")) && !llave_global {
        return Some(Servicio::Cloudflare);
    }
    if n.contains("vercel") {
        return Some(Servicio::Vercel);
    }
    if n.contains("github") || n.starts_with("gh-") || n.starts_with("gh_") {
        return Some(Servicio::Github);
    }
    // Una «supabase-algo» que no empieza por `sbp_` es la clave de un proyecto
    // (anon, service_role), no un token de la API de gestión: no se mira.
    None
}

/// Lo que dice el servicio de una clave.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Veredicto {
    /// Vale; `caduca` en segundos desde 1970, si el servicio lo dice.
    Vale { caduca: Option<u64> },
    /// El servicio la rechaza: caducó, la borraron o la desactivaron.
    NoVale { caduca: Option<u64> },
    /// No se pudo saber (sin red, el servicio caído, una respuesta rara).
    NoSe(String),
}

/* ------------------------------------------------------------- las fechas */

fn dias_desde_1970(y: i64, m: i64, d: i64) -> i64 {
    // El algoritmo de Howard Hinnant («days_from_civil»), sin crates de fechas.
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// `2026-12-06T10:00:00Z`, `…T10:00:00.123+01:00`, `2026-12-06 10:00:00 UTC` o
/// `2026-12-06 10:00:00 +0100`, a segundos desde 1970.
pub fn leer_fecha(t: &str) -> Option<u64> {
    let t = t.trim();
    let b = t.as_bytes();
    if b.len() < 19 || b[4] != b'-' || b[7] != b'-' || !(b[10] == b'T' || b[10] == b' ') || b[13] != b':' || b[16] != b':' {
        return None;
    }
    let num = |a: usize, z: usize| t.get(a..z)?.parse::<i64>().ok();
    let (y, mo, d, h, mi, s) = (num(0, 4)?, num(5, 7)?, num(8, 10)?, num(11, 13)?, num(14, 16)?, num(17, 19)?);
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) || h > 23 || mi > 59 || s > 60 {
        return None;
    }
    let mut resto = t[19..].trim_start();
    if let Some(r) = resto.strip_prefix('.') {
        resto = r.trim_start_matches(|c: char| c.is_ascii_digit()).trim_start();
    }
    let desfase = match resto {
        "" | "Z" | "UTC" | "GMT" => 0,
        r if r.starts_with('+') || r.starts_with('-') => {
            let signo = if r.starts_with('-') { -1 } else { 1 };
            let cifras: String = r[1..].chars().filter(|c| *c != ':').collect();
            if cifras.len() != 4 || !cifras.bytes().all(|c| c.is_ascii_digit()) {
                return None;
            }
            signo * (cifras[..2].parse::<i64>().ok()? * 3600 + cifras[2..].parse::<i64>().ok()? * 60)
        }
        _ => return None,
    };
    let seg = dias_desde_1970(y, mo, d) * DIA as i64 + h * 3600 + mi * 60 + s - desfase;
    u64::try_from(seg).ok()
}

/* ------------------------------------------- lo que contesta cada servicio */

fn json(cuerpo: &str) -> serde_json::Value {
    serde_json::from_str(cuerpo).unwrap_or(serde_json::Value::Null)
}

/// `GET /user/tokens/verify` (o el de una cuenta). `status` es `active`,
/// `disabled` o `expired`; un token que no existe da 401 con el código 1000.
pub fn leer_cloudflare(estado: u16, cuerpo: &str) -> Veredicto {
    let v = json(cuerpo);
    let caduca = v["result"]["expires_on"].as_str().and_then(leer_fecha);
    if estado == 200 && v["success"] == true {
        return match v["result"]["status"].as_str() {
            Some("active") => Veredicto::Vale { caduca },
            Some("expired") | Some("disabled") => Veredicto::NoVale { caduca },
            otro => Veredicto::NoSe(format!("Cloudflare dice «{}»", otro.unwrap_or("?"))),
        };
    }
    let codigos: Vec<i64> = v["errors"].as_array().map(|e| e.iter().filter_map(|x| x["code"].as_i64()).collect()).unwrap_or_default();
    if matches!(estado, 400 | 401 | 403) && codigos.iter().any(|c| matches!(c, 1000 | 6003 | 9109 | 10000)) {
        return Veredicto::NoVale { caduca };
    }
    Veredicto::NoSe(format!("Cloudflare contestó {estado}"))
}

/// Cualquier llamada a la API de GitHub. La cabecera dice cuándo caduca un token
/// que caduca; uno sin fecha no la trae.
pub fn leer_github(estado: u16, cabecera: Option<&str>) -> Veredicto {
    let caduca = cabecera.and_then(leer_fecha);
    match estado {
        200 => Veredicto::Vale { caduca },
        401 => Veredicto::NoVale { caduca },
        otro => Veredicto::NoSe(format!("GitHub contestó {otro}")),
    }
}

/// `GET /v1/projects`. Un token con el permiso justo puede no ver los proyectos
/// (403): vale igual, solo que para otra cosa.
pub fn leer_supabase(estado: u16) -> Veredicto {
    match estado {
        200 | 403 => Veredicto::Vale { caduca: None },
        401 => Veredicto::NoVale { caduca: None },
        otro => Veredicto::NoSe(format!("Supabase contestó {otro}")),
    }
}

/// `GET /v5/user/tokens/current`. `expiresAt` va en milisegundos; un token que no
/// vale da 403 con `invalidToken`.
pub fn leer_vercel(estado: u16, cuerpo: &str) -> Veredicto {
    let v = json(cuerpo);
    let caduca = v["token"]["expiresAt"].as_u64().map(|ms| ms / 1000);
    match estado {
        200 => Veredicto::Vale { caduca },
        401 => Veredicto::NoVale { caduca },
        403 if v["error"]["invalidToken"] == true => Veredicto::NoVale { caduca },
        otro => Veredicto::NoSe(format!("Vercel contestó {otro}")),
    }
}

/* ---------------------------------------------------- preguntar de verdad */

/// Las direcciones de cada servicio. Son estas y no otras: la clave solo viaja a
/// su propio servicio. Las pruebas las cambian por un servidor de mentira.
#[derive(Clone, Debug)]
pub(crate) struct Bases {
    pub cloudflare: String,
    pub github: String,
    pub supabase: String,
    pub vercel: String,
}

impl Default for Bases {
    fn default() -> Self {
        Bases {
            cloudflare: "https://api.cloudflare.com/client/v4".into(),
            github: "https://api.github.com".into(),
            supabase: "https://api.supabase.com".into(),
            vercel: "https://api.vercel.com".into(),
        }
    }
}

async fn get(cliente: &reqwest::Client, url: &str, valor: &str) -> Result<(u16, reqwest::header::HeaderMap, String), String> {
    let r = cliente
        .get(url)
        .bearer_auth(valor)
        .header("User-Agent", "Adeorq")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("sin respuesta: {}", e.without_url()))?;
    let estado = r.status().as_u16();
    let cabeceras = r.headers().clone();
    // Con tope: lo que se lee es una línea de estado, no una descarga.
    let cuerpo = r.text().await.unwrap_or_default();
    Ok((estado, cabeceras, cuerpo.chars().take(64 * 1024).collect()))
}

pub(crate) async fn comprobar_con(bases: &Bases, servicio: Servicio, valor: &str) -> Veredicto {
    let cliente = match reqwest::Client::builder().timeout(Duration::from_secs(15)).build() {
        Ok(c) => c,
        Err(e) => return Veredicto::NoSe(e.to_string()),
    };
    let r = async {
        Ok::<_, String>(match servicio {
            Servicio::Cloudflare => {
                let (e, _, c) = get(&cliente, &format!("{}/user/tokens/verify", bases.cloudflare), valor).await?;
                let primero = leer_cloudflare(e, &c);
                if !matches!(primero, Veredicto::NoVale { .. }) {
                    return Ok(primero);
                }
                // Un token de CUENTA no se verifica en `/user`: allí sale como
                // inválido aunque valga. Si deja listar cuentas, vale.
                let (e, _, c) = get(&cliente, &format!("{}/accounts?per_page=5", bases.cloudflare), valor).await?;
                let v = json(&c);
                let cuenta = v["result"].as_array().and_then(|a| a.first()).and_then(|x| x["id"].as_str()).map(str::to_string);
                match cuenta {
                    Some(id) if e == 200 && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric()) => {
                        let (e, _, c) = get(&cliente, &format!("{}/accounts/{id}/tokens/verify", bases.cloudflare), valor).await?;
                        match leer_cloudflare(e, &c) {
                            Veredicto::NoSe(_) => Veredicto::Vale { caduca: None },
                            otro => otro,
                        }
                    }
                    _ if matches!(e, 401 | 403) => primero,
                    _ => Veredicto::NoSe(format!("Cloudflare contestó {e} al mirar las cuentas")),
                }
            }
            Servicio::Github => {
                let (e, h, _) = get(&cliente, &format!("{}/user", bases.github), valor).await?;
                leer_github(e, h.get("github-authentication-token-expiration").and_then(|v| v.to_str().ok()))
            }
            Servicio::Supabase => {
                let (e, _, _) = get(&cliente, &format!("{}/v1/projects", bases.supabase), valor).await?;
                leer_supabase(e)
            }
            Servicio::Vercel => {
                let (e, _, c) = get(&cliente, &format!("{}/v5/user/tokens/current", bases.vercel), valor).await?;
                leer_vercel(e, &c)
            }
        })
    };
    r.await.unwrap_or_else(Veredicto::NoSe)
}

/* ---------------------------------------------- lo que se apunta y se avisa */

/// Lo que se sabe de una clave, sin su valor.
#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Estado {
    pub servicio: Option<Servicio>,
    /// Segundos desde 1970, si el servicio lo dice.
    pub caduca: Option<u64>,
    /// `None`: no se ha podido saber todavía.
    pub vale: Option<bool>,
    /// La última vez que se le preguntó al servicio.
    pub comprobado: u64,
    /// El último aviso que se le dio a Munir por esta clave, para no repetirlo.
    #[serde(default)]
    pub avisado: Option<Aviso>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Aviso {
    /// Caduca dentro de una semana.
    Semana,
    /// Ya no vale.
    NoVale,
}

impl Estado {
    /// Ya no vale: el servicio la rechazó o su fecha ya pasó.
    pub fn muerta(&self, ahora: u64) -> bool {
        self.vale == Some(false) || self.caduca.is_some_and(|c| c <= ahora)
    }

    fn con(&self, servicio: Servicio, v: &Veredicto, ahora: u64) -> Estado {
        let (vale, caduca) = match v {
            Veredicto::Vale { caduca } => (Some(true), *caduca),
            Veredicto::NoVale { caduca } => (Some(false), caduca.or(self.caduca)),
            // Sin red no se olvida lo que ya se sabía.
            Veredicto::NoSe(_) => (self.vale, self.caduca),
        };
        // Una fecha nueva (la renovó en el servicio) vuelve a dejar avisar.
        let avisado = if caduca != self.caduca && vale == Some(true) { None } else { self.avisado };
        Estado { servicio: Some(servicio), caduca, vale, comprobado: ahora, avisado }
    }
}

/// Qué aviso toca ahora, si toca alguno: uno cuando falta una semana o menos y
/// otro cuando ya no vale, cada uno una sola vez.
pub fn que_avisar(e: &Estado, ahora: u64) -> Option<Aviso> {
    if e.muerta(ahora) {
        return (e.avisado != Some(Aviso::NoVale)).then_some(Aviso::NoVale);
    }
    let pronto = e.caduca.is_some_and(|c| c > ahora && c - ahora <= ANTES);
    (pronto && e.avisado.is_none()).then_some(Aviso::Semana)
}

fn ahora() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn ruta() -> Result<std::path::PathBuf, String> {
    Ok(crate::dir_datos_creado()?.join("secretos-de-agente-caducidad.json"))
}

fn cerrojo() -> &'static Mutex<()> {
    static C: Mutex<()> = Mutex::new(());
    &C
}

pub fn leer() -> HashMap<String, Estado> {
    ruta().ok().and_then(|p| std::fs::read_to_string(p).ok()).and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

fn guardar(nombre: &str, e: Option<Estado>) {
    let _g = cerrojo().lock().unwrap_or_else(|x| x.into_inner());
    let mut todo = leer();
    match e {
        Some(e) => todo.insert(nombre.to_string(), e),
        None => todo.remove(nombre),
    };
    if let (Ok(p), Ok(t)) = (ruta(), serde_json::to_string(&todo)) {
        let _ = std::fs::write(p, t);
    }
}

/// Lo que se sabe de una clave, para quien la pide y para Ajustes.
pub fn estado(nombre: &str) -> Option<Estado> {
    leer().remove(nombre)
}

/// Olvidar lo que se sabía (se olvidó la clave, o se pegó una nueva).
pub fn olvidar(nombre: &str) {
    guardar(nombre, None);
}

/// Preguntarle al servicio por una clave guardada y apuntar la respuesta. `None`
/// si no es de un servicio que sepa contestar.
pub fn comprobar(nombre: &str) -> Option<(Servicio, Veredicto)> {
    let valor = crate::secrets::get(&format!("{}{nombre}", crate::pedir_secreto::ESPACIO))?;
    let servicio = servicio_de(nombre, &valor)?;
    let v = tauri::async_runtime::block_on(comprobar_con(&Bases::default(), servicio, &valor));
    drop(valor);
    let antes = estado(nombre).unwrap_or_default();
    let nuevo = antes.con(servicio, &v, ahora());
    guardar(nombre, Some(nuevo));
    crate::anotar(&format!(
        "Clave de agente «{nombre}»: {} dice {}.",
        servicio.nombre(),
        match &v {
            Veredicto::Vale { caduca: Some(_) } => "que vale y tiene fecha de caducidad",
            Veredicto::Vale { caduca: None } => "que vale",
            Veredicto::NoVale { .. } => "que ya no vale",
            Veredicto::NoSe(_) => "nada (no se pudo preguntar)",
        }
    ));
    Some((servicio, v))
}

/// Avisar a Munir si toca, y apuntarlo para no repetirlo.
fn avisar_si_toca(app: &tauri::AppHandle, nombre: &str) {
    let Some(mut e) = estado(nombre) else { return };
    let Some(aviso) = que_avisar(&e, ahora()) else { return };
    let ok = app
        .emit(
            "secreto-caduca",
            serde_json::json!({
                "nombre": nombre,
                "servicio": e.servicio.map(Servicio::nombre),
                "aviso": aviso,
                "caduca": e.caduca,
            }),
        )
        .is_ok();
    if ok {
        e.avisado = Some(aviso);
        guardar(nombre, Some(e));
    }
}

/// Comprobar una clave recién guardada, sin hacer esperar a quien la pegó.
pub fn recien_guardada(app: &tauri::AppHandle, nombre: &str) {
    olvidar(nombre);
    let (app, nombre) = (app.clone(), nombre.to_string());
    std::thread::spawn(move || {
        if comprobar(&nombre).is_some() {
            avisar_si_toca(&app, &nombre);
        }
    });
}

/// Un comando lanzado con la clave falló con un «no autorizado»: se le pregunta
/// al servicio ahora mismo, en vez de dejar que el agente pruebe otra vez. Con
/// tope de una pregunta por minuto y clave: un programa que lo pida en bucle no
/// convierte a Adeorq en un martillo contra el servicio.
pub fn tras_un_fallo(app: &tauri::AppHandle, nombre: &str) -> serde_json::Value {
    static ULTIMA: Mutex<Option<HashMap<String, u64>>> = Mutex::new(None);
    let ya = {
        let mut m = ULTIMA.lock().unwrap_or_else(|x| x.into_inner());
        let m = m.get_or_insert_with(HashMap::new);
        let reciente = m.get(nombre).is_some_and(|t| ahora().saturating_sub(*t) < 60);
        if !reciente {
            m.insert(nombre.to_string(), ahora());
        }
        reciente
    };
    let respuesta = |e: &Estado, s: Servicio| {
        serde_json::json!({
            "veredicto": match e.vale { Some(true) if !e.muerta(ahora()) => "vale", Some(_) => "no_vale", None => "no_se" },
            "servicio": s.nombre(),
            "caduca": e.caduca,
        })
    };
    if ya {
        return match estado(nombre) {
            Some(e) if e.servicio.is_some() => respuesta(&e, e.servicio.unwrap_or(Servicio::Cloudflare)),
            _ => serde_json::json!({ "veredicto": "no_se" }),
        };
    }
    match comprobar(nombre) {
        Some((s, Veredicto::NoSe(_))) => serde_json::json!({ "veredicto": "no_se", "servicio": s.nombre() }),
        Some((s, _)) => {
            avisar_si_toca(app, nombre);
            estado(nombre).map(|e| respuesta(&e, s)).unwrap_or_else(|| serde_json::json!({ "veredicto": "no_se" }))
        }
        None => serde_json::json!({ "veredicto": "no_se" }),
    }
}

/// Una vez al día, todas las claves de los servicios que saben contestar.
///
/// En la ventana de desarrollo NO arranca: compartiría el almacén con la Adeorq
/// de verdad y mandaría sus claves a los servicios desde una build a medias.
/// Para probarlo ahí, `ADEORQ_COMPROBAR_CLAVES=1`.
pub fn arrancar(app: tauri::AppHandle) {
    if cfg!(debug_assertions) && std::env::var_os("ADEORQ_COMPROBAR_CLAVES").is_none() {
        return;
    }
    std::thread::spawn(move || {
        // Un respiro al arrancar: la red y la ventana primero.
        std::thread::sleep(Duration::from_secs(90));
        loop {
            for nombre in crate::pedir_secreto::nombres_guardados() {
                let toca = estado(&nombre).is_none_or(|e| ahora().saturating_sub(e.comprobado) >= CADA);
                if toca {
                    let _ = comprobar(&nombre);
                }
                avisar_si_toca(&app, &nombre);
            }
            std::thread::sleep(Duration::from_secs(3_600));
        }
    });
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn cada_clave_va_a_su_servicio_y_las_demas_a_ninguno() {
        assert_eq!(servicio_de("supabase-orquio", "sbp_0123"), Some(Servicio::Supabase));
        assert_eq!(servicio_de("cualquiera", "sbp_fc0123"), Some(Servicio::Supabase));
        assert_eq!(servicio_de("token", "github_pat_11ABC"), Some(Servicio::Github));
        assert_eq!(servicio_de("gh-adeorq", "x"), Some(Servicio::Github));
        assert_eq!(servicio_de("cloudflare-orquio", "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-ab"), Some(Servicio::Cloudflare));
        assert_eq!(servicio_de("vercel-web", "x"), Some(Servicio::Vercel));
        // La llave global de Cloudflare no se verifica como token.
        assert_eq!(servicio_de("cloudflare-global", "0123456789abcdef0123456789abcdef01234"), None);
        // La clave de un proyecto de Supabase no es un token de gestión.
        assert_eq!(servicio_de("supabase-service-role", "eyJhbGciOi"), None);
        // Las que no caducan solas no se mandan a nadie.
        for (n, v) in [("elevenlabs-orquio", "sk_1"), ("gemini-orquio", "AIza"), ("stripe-prueba", "sk_test_1"), ("claude-api", "sk-ant-1")] {
            assert_eq!(servicio_de(n, v), None, "{n}");
        }
    }

    #[test]
    fn las_fechas_de_los_servicios_se_leen_en_todas_sus_formas() {
        let base = 1_796_551_200; // 2026-12-06T10:00:00Z
        assert_eq!(leer_fecha("2026-12-06T10:00:00Z"), Some(base));
        assert_eq!(leer_fecha("2026-12-06T10:00:00.123Z"), Some(base));
        assert_eq!(leer_fecha("2026-12-06T11:00:00+01:00"), Some(base));
        assert_eq!(leer_fecha("2026-12-06 10:00:00 UTC"), Some(base));
        assert_eq!(leer_fecha("2026-12-06 11:00:00 +0100"), Some(base));
        assert_eq!(leer_fecha("2026-12-06 05:00:00 -0500"), Some(base));
        assert_eq!(leer_fecha("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(leer_fecha("2000-02-29T00:00:00Z"), Some(951_782_400));
        for mala in ["", "mañana", "2026-13-01T00:00:00Z", "2026-12-06T10:00:00 hora", "2026-12-06"] {
            assert_eq!(leer_fecha(mala), None, "{mala}");
        }
    }

    #[test]
    fn lo_que_contesta_cloudflare() {
        let activo = r#"{"success":true,"errors":[],"result":{"id":"ab","status":"active","expires_on":"2026-12-06T10:00:00Z"}}"#;
        assert_eq!(leer_cloudflare(200, activo), Veredicto::Vale { caduca: Some(1_796_551_200) });
        let sin_fecha = r#"{"success":true,"result":{"id":"ab","status":"active"}}"#;
        assert_eq!(leer_cloudflare(200, sin_fecha), Veredicto::Vale { caduca: None });
        let caducado = r#"{"success":true,"result":{"id":"ab","status":"expired","expires_on":"2026-11-01T00:00:00Z"}}"#;
        assert!(matches!(leer_cloudflare(200, caducado), Veredicto::NoVale { caduca: Some(_) }));
        // Lo que contesta de verdad a un token que no existe (medido con uno inventado).
        let invalido = r#"{"success":false,"errors":[{"code":1000,"message":"Invalid API Token"}],"messages":[],"result":null}"#;
        assert_eq!(leer_cloudflare(401, invalido), Veredicto::NoVale { caduca: None });
        // Un 500 o una red rota no dicen nada de la clave.
        assert!(matches!(leer_cloudflare(500, "oops"), Veredicto::NoSe(_)));
        assert!(matches!(leer_cloudflare(403, r#"{"success":false,"errors":[{"code":9999}]}"#), Veredicto::NoSe(_)));
    }

    #[test]
    fn lo_que_contestan_github_supabase_y_vercel() {
        assert_eq!(leer_github(200, Some("2026-12-06 10:00:00 UTC")), Veredicto::Vale { caduca: Some(1_796_551_200) });
        assert_eq!(leer_github(200, None), Veredicto::Vale { caduca: None });
        assert_eq!(leer_github(401, None), Veredicto::NoVale { caduca: None });
        assert!(matches!(leer_github(403, None), Veredicto::NoSe(_)));
        assert_eq!(leer_supabase(200), Veredicto::Vale { caduca: None });
        assert_eq!(leer_supabase(403), Veredicto::Vale { caduca: None }, "un token con el permiso justo vale");
        assert_eq!(leer_supabase(401), Veredicto::NoVale { caduca: None });
        assert_eq!(leer_vercel(200, r#"{"token":{"id":"x","expiresAt":1796551200000}}"#), Veredicto::Vale { caduca: Some(1_796_551_200) });
        assert_eq!(leer_vercel(403, r#"{"error":{"code":"forbidden","invalidToken":true}}"#), Veredicto::NoVale { caduca: None });
        assert!(matches!(leer_vercel(403, r#"{"error":{"code":"forbidden"}}"#), Veredicto::NoSe(_)));
    }

    #[test]
    fn se_avisa_una_vez_una_semana_antes_y_otra_al_dejar_de_valer() {
        let hoy = 1_800_000_000;
        let lejos = Estado { vale: Some(true), caduca: Some(hoy + 30 * DIA), ..Default::default() };
        assert_eq!(que_avisar(&lejos, hoy), None);
        let pronto = Estado { caduca: Some(hoy + 6 * DIA), ..lejos.clone() };
        assert_eq!(que_avisar(&pronto, hoy), Some(Aviso::Semana));
        // Dicho una vez, no se repite cada día.
        let dicho = Estado { avisado: Some(Aviso::Semana), ..pronto.clone() };
        assert_eq!(que_avisar(&dicho, hoy + DIA), None);
        // Pero cuando pasa la fecha, se dice que ya no vale, también una vez.
        assert_eq!(que_avisar(&dicho, hoy + 7 * DIA), Some(Aviso::NoVale));
        let rechazada = Estado { vale: Some(false), caduca: None, avisado: Some(Aviso::NoVale), ..Default::default() };
        assert_eq!(que_avisar(&rechazada, hoy), None);
        // Sin fecha y valiendo, nunca hay nada que decir.
        assert_eq!(que_avisar(&Estado { vale: Some(true), ..Default::default() }, hoy), None);
        // Y sin saber nada todavía, tampoco.
        assert_eq!(que_avisar(&Estado::default(), hoy), None);
    }

    #[test]
    fn una_respuesta_sin_red_no_olvida_lo_que_ya_se_sabia_y_una_renovada_vuelve_a_avisar() {
        let hoy = 1_800_000_000;
        let antes = Estado { servicio: Some(Servicio::Cloudflare), vale: Some(true), caduca: Some(hoy + 5 * DIA), comprobado: 1, avisado: Some(Aviso::Semana) };
        let sin_red = antes.con(Servicio::Cloudflare, &Veredicto::NoSe("sin red".into()), hoy);
        assert_eq!((sin_red.vale, sin_red.caduca, sin_red.avisado), (Some(true), Some(hoy + 5 * DIA), Some(Aviso::Semana)));
        assert_eq!(sin_red.comprobado, hoy);
        let renovada = antes.con(Servicio::Cloudflare, &Veredicto::Vale { caduca: Some(hoy + 365 * DIA) }, hoy);
        assert_eq!(renovada.avisado, None, "con fecha nueva se puede volver a avisar el año que viene");
        let muerta = antes.con(Servicio::Cloudflare, &Veredicto::NoVale { caduca: None }, hoy);
        assert!(muerta.muerta(hoy));
        assert_eq!(muerta.caduca, Some(hoy + 5 * DIA), "la fecha que se sabía se queda");
    }

    /// Un servidor HTTP de mentira que contesta lo que se le diga por ruta, para
    /// probar las llamadas de verdad sin mandar ninguna clave a ningún sitio.
    fn servidor(rutas: Vec<(&'static str, u16, &'static str, &'static str)>) -> String {
        use std::io::{Read, Write};
        let oreja = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", oreja.local_addr().unwrap());
        std::thread::spawn(move || {
            for flujo in oreja.incoming().take(8) {
                let Ok(mut f) = flujo else { continue };
                let mut buf = vec![0u8; 8192];
                let n = f.read(&mut buf).unwrap_or(0);
                let pedido = String::from_utf8_lossy(&buf[..n]).to_string();
                let linea = pedido.lines().next().unwrap_or_default().to_string();
                let auth_ok = pedido.to_ascii_lowercase().contains("authorization: bearer clave-de-prueba");
                let (estado, cabecera, cuerpo) = rutas
                    .iter()
                    .find(|(r, ..)| linea.contains(&format!(" {r} ")))
                    .map(|(_, e, h, c)| (*e, *h, *c))
                    .unwrap_or((404, "", "{}"));
                let estado = if auth_ok { estado } else { 400 };
                let extra = if cabecera.is_empty() { String::new() } else { format!("{cabecera}\r\n") };
                let _ = write!(
                    f,
                    "HTTP/1.1 {estado} X\r\nContent-Type: application/json\r\n{extra}Content-Length: {}\r\nConnection: close\r\n\r\n{cuerpo}",
                    cuerpo.len()
                );
            }
        });
        base
    }

    #[test]
    fn las_llamadas_de_verdad_contra_un_servidor_de_mentira() {
        let base = servidor(vec![
            ("/user/tokens/verify", 401, "", r#"{"success":false,"errors":[{"code":1000,"message":"Invalid API Token"}]}"#),
            ("/accounts?per_page=5", 200, "", r#"{"success":true,"result":[{"id":"0123abcd"}]}"#),
            ("/accounts/0123abcd/tokens/verify", 200, "", r#"{"success":true,"result":{"status":"active","expires_on":"2026-12-06T10:00:00Z"}}"#),
            ("/user", 200, "github-authentication-token-expiration: 2026-12-06 10:00:00 UTC", "{}"),
            ("/v1/projects", 401, "", "{}"),
            ("/v5/user/tokens/current", 200, "", r#"{"token":{"expiresAt":1796551200000}}"#),
        ]);
        let bases = Bases { cloudflare: base.clone(), github: base.clone(), supabase: base.clone(), vercel: base };
        let mirar = |s| tauri::async_runtime::block_on(comprobar_con(&bases, s, "clave-de-prueba"));
        // Un token de cuenta: `/user` lo da por inválido, pero la cuenta dice que vale.
        assert_eq!(mirar(Servicio::Cloudflare), Veredicto::Vale { caduca: Some(1_796_551_200) });
        assert_eq!(mirar(Servicio::Github), Veredicto::Vale { caduca: Some(1_796_551_200) });
        assert_eq!(mirar(Servicio::Supabase), Veredicto::NoVale { caduca: None });
        assert_eq!(mirar(Servicio::Vercel), Veredicto::Vale { caduca: Some(1_796_551_200) });
    }

    #[test]
    fn sin_servidor_es_un_no_se_y_no_un_no_vale() {
        let cerrado = {
            let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            format!("http://{}", l.local_addr().unwrap())
        };
        let bases = Bases { cloudflare: cerrado.clone(), github: cerrado.clone(), supabase: cerrado.clone(), vercel: cerrado };
        for s in [Servicio::Cloudflare, Servicio::Github, Servicio::Supabase, Servicio::Vercel] {
            let v = tauri::async_runtime::block_on(comprobar_con(&bases, s, "x"));
            assert!(matches!(v, Veredicto::NoSe(_)), "{s:?}: {v:?}");
        }
    }

    /// Contra los servicios de verdad, con claves inventadas: que lo que contestan
    /// a una clave que no existe se lee como «no vale». No manda ninguna clave
    /// real. Necesita red: `cargo test --lib claves_caducan -- --ignored`.
    #[test]
    #[ignore]
    fn los_servicios_de_verdad_rechazan_una_clave_inventada() {
        let bases = Bases::default();
        for (s, valor) in [
            (Servicio::Cloudflare, "inventadaAdeorq0000000000000000000000000"),
            (Servicio::Github, "github_pat_inventadaAdeorq000000000000"),
            (Servicio::Supabase, "sbp_inventadaadeorq0000000000000000000000"),
            (Servicio::Vercel, "inventadaAdeorq000000000"),
        ] {
            let v = tauri::async_runtime::block_on(comprobar_con(&bases, s, valor));
            eprintln!("{s:?}: {v:?}");
            assert!(matches!(v, Veredicto::NoVale { .. }), "{s:?} contestó {v:?}");
        }
    }
}
