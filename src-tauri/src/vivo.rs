//! La web de un agente, en vivo en el móvil. Munir, 2026-11-14: «que se puedan
//! ver localhost etc desde el movil».
//!
//! Hasta hoy una web del PC compartida con `compartir_en_el_movil` llegaba solo
//! como captura (`compartidos.rs`), y era a propósito: servirla por el origen de
//! la página del móvil (el 3013; por Tailscale, el 8443) le daría a su
//! JavaScript la clave del emparejado, que vive en el `localStorage` de ese
//! origen. Así que va por OTRO puerto, que es otro origen: este proxy, en
//! `127.0.0.1:3014`, y por Tailscale en el 8444 (`tailscale serve`, como el 8443).
//!
//! Lo que no se negocia, y cómo se cumple:
//! - **Solo lo compartido a propósito, y mientras siga vivo.** El proxy no
//!   sabe de puertos: cada petición lleva una sesión, cada sesión es de UN
//!   compartido, y el puerto sale de él, comprobado otra vez en cada petición.
//!   Nunca un puerto que pida la URL, ni uno de Adeorq (`compartidos::puerto_valido`).
//! - **Se entra con un pase de un solo uso** y de tres minutos, que da el 3013
//!   con la clave del móvil (`/api/vivo/pase`) y que aquí se cambia por una
//!   cookie `HttpOnly` de este origen (`ENTRAR`). Las cookies no separan
//!   puertos, así que se llama `adeorq_vivo` y la API del 3013 no lee cookies:
//!   solo la cabecera `Authorization`.
//! - **Caducar o quitarlo corta el acceso al momento**: cada petición lo mira,
//!   y lo que sigue abierto (un WebSocket, una respuesta larga), cada segundo.
//! - **La web ve lo mismo que en este PC**: `Host` y `Origin` de
//!   `127.0.0.1:<puerto>` (es lo que Vite deja pasar), sin la cookie del
//!   proxy ni las cabeceras con las que Tailscale dice quién eres.
//! - El mismo `Host` que el 3013 (este PC o un `*.ts.net`) y, si el navegador
//!   dice de dónde viene, que sea de aquí: así no entra una web cualquiera
//!   abierta en el PC, ni un dominio ajeno apuntado a 127.0.0.1.
//!
//! HTTP y WebSocket (el recargado en caliente de Vite), una petición por
//! conexión como en `movil.rs`: el que habla con él es `tailscale serve`, que
//! ya junta las del móvil, y por debajo es una conexión local.

use std::io::{Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::compartidos::{Compartido, Tipo};

pub const PUERTO: u16 = 3014;
/// El puerto de Tailscale para la web en vivo: el del móvil más uno, y su propio origen.
pub const PUERTO_TAILSCALE: u16 = 8444;
/// Donde se cambia el pase por la cookie. Lo que cuelga de `/__adeorq/` no llega nunca a la web.
pub const ENTRAR: &str = "/__adeorq/entrar";
pub const COOKIE: &str = "adeorq_vivo";
const VIDA_PASE: Duration = Duration::from_secs(3 * 60);
const TOPE_PASES: usize = 32;
const TOPE_SESIONES: usize = 64;
/// Una página de Vite pide cientos de módulos a la vez, y por HTTP/2 Tailscale
/// los manda todos juntos: los que no caben esperan su turno, no se rechazan.
const TOPE_CONEXIONES: usize = 96;
const TOPE_CABEZA: usize = 32 * 1024;
const TOPE_CABEZA_RESPUESTA: usize = 64 * 1024;
const PLAZO_CABEZA: Duration = Duration::from_secs(10);
/// Lo que puede tardar una web en empezar a contestar: la primera página de un
/// servidor de desarrollo compila antes.
const PLAZO_RESPUESTA: Duration = Duration::from_secs(120);
const MIRAR_CADA: Duration = Duration::from_secs(1);

/// El puerto del proxy: el 3014, `ADEORQ_VIVO_PUERTO` si se dice otro, y si una
/// Adeorq aislada de pruebas mueve el móvil (`ADEORQ_MOVIL_PUERTO`), el suyo más
/// uno, para no pelear el 3014 con la de verdad.
pub fn puerto() -> Result<u16, String> {
    let movil_aparte = match std::env::var_os("ADEORQ_MOVIL_PUERTO") {
        Some(_) => Some(crate::movil::puerto()?),
        None => None,
    };
    puerto_de(std::env::var("ADEORQ_VIVO_PUERTO").ok().as_deref(), movil_aparte)
}

fn puerto_de(propio: Option<&str>, movil_aparte: Option<u16>) -> Result<u16, String> {
    if let Some(p) = propio {
        return p
            .trim()
            .parse::<u16>()
            .ok()
            .filter(|&n| n != 0)
            .ok_or_else(|| format!("ADEORQ_VIVO_PUERTO={p} no es un puerto, y no se usa el {PUERTO} en su lugar porque es el de la Adeorq de verdad"));
    }
    match movil_aparte {
        None => Ok(PUERTO),
        Some(m) => m.checked_add(1).ok_or_else(|| format!("con el móvil en el {m} no queda un puerto detrás para la web en vivo")),
    }
}

// ─── Pases y sesiones ───────────────────────────────────────────────────────

struct Pase {
    valor: String,
    compartido: String,
    /// De qué aparato (unos caracteres de la huella de su clave): un pase nuevo
    /// del mismo aparato para lo mismo sustituye al que no usó.
    quien: String,
    hasta: Instant,
}

struct Sesion {
    token: String,
    compartido: String,
    /// El aparato que la abrió: si se olvida o se le acaba el rato, se corta.
    quien: String,
}

/// Los pases sin usar y las sesiones abiertas. En memoria: al cerrar Adeorq se
/// van todos, y el móvil pide otro pase al volver a tocar «Abrir en vivo».
pub struct Llaves {
    pases: Vec<Pase>,
    sesiones: Vec<Sesion>,
}

static LLAVES: Mutex<Llaves> = Mutex::new(Llaves::nuevas());

/// Comparar sin cortar al primer byte distinto.
fn iguales(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

impl Llaves {
    pub const fn nuevas() -> Self {
        Llaves { pases: Vec::new(), sesiones: Vec::new() }
    }

    /// Un pase para entrar a ese compartido, de un solo uso y de tres minutos.
    pub fn pase(&mut self, compartido: &str, quien: &str, ahora: Instant) -> Result<String, String> {
        self.pases.retain(|p| p.hasta > ahora && !(p.compartido == compartido && p.quien == quien));
        if self.pases.len() >= TOPE_PASES {
            self.pases.remove(0);
        }
        let valor = crate::compartidos::id_nuevo()?;
        self.pases.push(Pase { valor: valor.clone(), compartido: compartido.into(), quien: quien.into(), hasta: ahora + VIDA_PASE });
        Ok(valor)
    }

    /// Lo cambia por el compartido al que abre y el aparato que lo pidió, una
    /// sola vez: usado o caducado, ya no está.
    pub fn canjear(&mut self, valor: &str, ahora: Instant) -> Option<(String, String)> {
        if valor.is_empty() {
            return None;
        }
        let i = self.pases.iter().position(|p| iguales(&p.valor, valor))?;
        let p = self.pases.remove(i);
        (p.hasta > ahora).then_some((p.compartido, p.quien))
    }

    /// Una sesión nueva para ese compartido. La que traía el navegador se va:
    /// en un mismo navegador, una web en vivo a la vez (comparten origen y cookie).
    pub fn abrir_sesion(&mut self, compartido: &str, quien: &str, la_de_antes: Option<&str>) -> Result<String, String> {
        if let Some(t) = la_de_antes.filter(|t| !t.is_empty()) {
            self.sesiones.retain(|s| !iguales(&s.token, t));
        }
        if self.sesiones.len() >= TOPE_SESIONES {
            self.sesiones.remove(0);
        }
        let token = crate::compartidos::id_nuevo()?;
        self.sesiones.push(Sesion { token: token.clone(), compartido: compartido.into(), quien: quien.into() });
        Ok(token)
    }

    /// De qué compartido es esa sesión, y de qué aparato.
    pub fn de_sesion(&self, token: &str) -> Option<(String, String)> {
        if token.is_empty() {
            return None;
        }
        self.sesiones.iter().find(|s| iguales(&s.token, token)).map(|s| (s.compartido.clone(), s.quien.clone()))
    }

    pub fn cerrar_sesion(&mut self, token: &str) {
        self.sesiones.retain(|s| !iguales(&s.token, token));
    }

    /// Todo fuera: al apagar «Adeo en el móvil», nada de antes vuelve a abrir.
    fn vaciar(&mut self) {
        self.pases.clear();
        self.sesiones.clear();
    }
}

/// Un pase nuevo y la dirección por la que entra el móvil con él. La pide el
/// 3013 (`/api/vivo/pase`) para un compartido que ya ha comprobado que es una web.
pub fn pase_de_verdad(c: &Compartido, quien: &str, host: &str) -> Result<String, String> {
    let puerto_web = puerto_de_web(c).ok_or("Eso no es una web de tu PC.")?;
    if !SIRVIENDO.load(Ordering::SeqCst) {
        return Err("La web en vivo no está en marcha en tu PC. Apaga y enciende «Adeo en el móvil» en Ajustes.".into());
    }
    if !crate::compartidos::alguien_escucha(puerto_web) {
        return Err(format!("No hay nada escuchando en 127.0.0.1:{puerto_web}: arranca la web antes de mirarla."));
    }
    let local = puerto()?;
    if es_de_tailscale(host) {
        asegurar_en_tailscale(local)?;
    }
    let pase = LLAVES.lock().unwrap_or_else(|e| e.into_inner()).pase(&c.id, quien, Instant::now())?;
    Ok(direccion_de_entrada(host, local, &pase))
}

fn sin_puerto(host: &str) -> String {
    let h = host.trim().to_ascii_lowercase();
    match h.rsplit_once(':') {
        Some((nombre, p)) if !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()) => nombre.to_string(),
        _ => h,
    }
}

fn es_de_tailscale(host: &str) -> bool {
    sin_puerto(host).ends_with(".ts.net")
}

/// Por donde entra el móvil, según por donde vino al 3013: por Tailscale, su
/// nombre en el 8444 con HTTPS; en este mismo PC, el proxy tal cual.
pub fn direccion_de_entrada(host: &str, local: u16, pase: &str) -> String {
    let nombre = sin_puerto(host);
    let origen = if nombre.ends_with(".ts.net") { format!("https://{nombre}:{PUERTO_TAILSCALE}") } else { format!("http://{nombre}:{local}") };
    format!("{origen}{ENTRAR}?pase={pase}")
}

/// Ya se miró en este arranque que el 8444 de Tailscale lleva aquí.
static EN_TAILSCALE: AtomicBool = AtomicBool::new(false);

/// Que el 8444 de Tailscale lleve a este proxy, como el 8443 lleva al 3013. Lo
/// que ya ocupe ese puerto no se pisa (`serve` lo reemplazaría sin preguntar).
/// La configuración queda en Tailscale, no en Adeorq: sobrevive a reinicios y
/// se quita con `tailscale serve --https=8444 off`.
fn asegurar_en_tailscale(local: u16) -> Result<(), String> {
    if EN_TAILSCALE.load(Ordering::SeqCst) {
        return Ok(());
    }
    // Sin Tailscale no se ha podido llegar por un `*.ts.net`: no hay nada que poner.
    let Some(exe) = crate::movil::tailscale_exe() else { return Ok(()) };
    let mirar = || {
        crate::movil::correr(&exe, &["serve", "status", "--json"], Duration::from_secs(8))
            .map(|d| crate::movil::en_el_puerto_de(&d.normal, PUERTO_TAILSCALE, local))
            .unwrap_or_default()
    };
    let puesto = mirar();
    if !puesto.nuestro {
        if let Some(ajeno) = puesto.ajeno {
            return Err(format!(
                "En tu Tailscale, el {PUERTO_TAILSCALE} ya lo usa otra cosa ({ajeno}) y Adeorq no lo pisa. Quítalo con «tailscale serve --https={PUERTO_TAILSCALE} off» y vuelve a probar."
            ));
        }
        let https = format!("--https={PUERTO_TAILSCALE}");
        let destino = format!("http://127.0.0.1:{local}");
        let dijo = crate::movil::correr(&exe, &["serve", "--bg", &https, &destino], Duration::from_secs(20))?;
        if !mirar().nuestro {
            return Err(format!("Tailscale no dejó abrir el {PUERTO_TAILSCALE} para la web en vivo: {}", dijo.todo()));
        }
        crate::anotar(&format!("Móvil: la web en vivo entra ya por Tailscale ({PUERTO_TAILSCALE} → 127.0.0.1:{local})"));
    }
    EN_TAILSCALE.store(true, Ordering::SeqCst);
    Ok(())
}

// ─── Lo que pide el navegador ───────────────────────────────────────────────

#[derive(Debug, Default)]
pub struct Cabeza {
    pub metodo: String,
    /// La ruta con su consulta, tal cual llegó.
    pub destino: String,
    /// Con el nombre como llegó.
    pub cabeceras: Vec<(String, String)>,
}

impl Cabeza {
    pub fn valor(&self, nombre: &str) -> Option<&str> {
        self.cabeceras.iter().find(|(k, _)| k.eq_ignore_ascii_case(nombre)).map(|(_, v)| v.as_str())
    }
}

fn buscar(pajar: &[u8], aguja: &[u8]) -> Option<usize> {
    pajar.windows(aguja.len()).position(|w| w == aguja)
}

fn es_token(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&b))
}

/// La cabeza de una petición, de unos bytes que ya la traen entera.
pub fn leer_cabeza(texto: &[u8]) -> Result<Cabeza, (u16, &'static str)> {
    let texto = std::str::from_utf8(texto).map_err(|_| (400, "cabeceras que no son texto"))?;
    let mut lineas = texto.split("\r\n");
    let primera = lineas.next().unwrap_or("");
    let mut partes = primera.split(' ');
    let (metodo, destino, version) = (partes.next().unwrap_or(""), partes.next().unwrap_or(""), partes.next().unwrap_or(""));
    if !es_token(metodo) || !destino.starts_with('/') || !version.starts_with("HTTP/1.") || partes.next().is_some() {
        return Err((400, "petición mal formada"));
    }
    if destino.bytes().any(|b| b.is_ascii_control() || b == b' ') {
        return Err((400, "petición mal formada"));
    }
    let mut cabeceras = Vec::new();
    for l in lineas {
        // Ni cabeceras partidas en dos líneas ni nombres con espacios: con dos
        // lecturas posibles, la web y el proxy podrían entender cosas distintas.
        let Some((k, v)) = l.split_once(':') else { return Err((400, "cabecera mal formada")) };
        if !es_token(k) || v.bytes().any(|b| (b < 0x20 && b != b'\t') || b == 0x7f) {
            return Err((400, "cabecera mal formada"));
        }
        cabeceras.push((k.to_string(), v.trim().to_string()));
    }
    let c = Cabeza { metodo: metodo.into(), destino: destino.into(), cabeceras };
    let largos: Vec<&str> = c.cabeceras.iter().filter(|(k, _)| k.eq_ignore_ascii_case("content-length")).map(|(_, v)| v.as_str()).collect();
    if (c.valor("transfer-encoding").is_some() && !largos.is_empty()) || largos.windows(2).any(|w| w[0] != w[1]) {
        return Err((400, "cuerpo con dos largos distintos"));
    }
    Ok(c)
}

/// Lo que vale nuestra cookie en esa petición.
fn cookie_de(c: &Cabeza) -> Option<String> {
    c.cabeceras
        .iter()
        .filter(|(k, _)| k.eq_ignore_ascii_case("cookie"))
        .flat_map(|(_, v)| v.split(';'))
        .filter_map(|p| p.trim().split_once('='))
        .find(|(k, _)| *k == COOKIE)
        .map(|(_, v)| v.trim().to_string())
}

/// Las cookies de la web, sin la nuestra.
fn sin_nuestra(valor: &str) -> String {
    valor
        .split(';')
        .map(str::trim)
        .filter(|p| !p.is_empty() && p.split_once('=').map(|(k, _)| k.trim()) != Some(COOKIE))
        .collect::<Vec<_>>()
        .join("; ")
}

fn consulta(destino: &str, clave: &str) -> Option<String> {
    destino.split_once('?')?.1.split('&').filter_map(|p| p.split_once('=')).find(|(k, _)| *k == clave).map(|(_, v)| v.to_string())
}

/// El puerto al que lleva un compartido, si es una web y no es de Adeorq.
fn puerto_de_web(c: &Compartido) -> Option<u16> {
    (c.tipo == Tipo::Web).then_some(c.puerto?).filter(|p| crate::compartidos::puerto_valido(*p).is_ok())
}

/// El origen por el que llega el navegador, tal cual lo ve él.
fn origen_publico(host: &str) -> String {
    let h = host.trim().to_ascii_lowercase();
    if es_de_tailscale(&h) { format!("https://{h}") } else { format!("http://{h}") }
}

/// Lo que el proxy contesta él mismo, sin pasar a la web.
#[derive(Debug)]
pub struct Propia {
    pub estado: u16,
    pub cabeceras: Vec<(String, String)>,
    pub cuerpo: Vec<u8>,
}

/// Pasar a la web de `puerto` con esta cabeza ya reescrita.
#[derive(Debug)]
pub struct Destino {
    pub puerto: u16,
    pub cabeza: Vec<u8>,
    pub compartido: String,
    pub token: String,
    pub quien: String,
    pub publico: String,
}

#[derive(Debug)]
pub enum Paso {
    Responder(Propia),
    Pasar(Destino),
}

/// De dónde salen los compartidos: en la app, `compartidos.rs`; en las pruebas, uno de mentira.
pub trait Fuente {
    /// El compartido con ese id si sigue vivo, apuntando que se está mirando
    /// (lo abierto se va una hora después de la última vez: `compartidos::abrir`).
    fn compartido(&self, id: &str) -> Option<Compartido>;
    /// Que el aparato de esa huella (los caracteres del pase) sigue emparejado
    /// y en su hora (`movil::aparato_sigue`).
    fn aparato_sigue(&self, quien: &str) -> bool;
    fn ingles(&self) -> bool {
        false
    }
}

enum Aviso {
    PaseMalo,
    SinSesion,
    YaNo,
    NoContesta(u16),
    Prohibido,
    Raro(&'static str),
}

fn texto(a: &Aviso, ingles: bool) -> (String, String) {
    let (titulo, cuerpo): (&str, String) = match (a, ingles) {
        (Aviso::PaseMalo, false) => ("Ese enlace ya no vale", "Era de un solo uso, o pasaron más de tres minutos. Vuelve a Adeo, abre la web en «Para ver» y toca «Abrir en vivo» otra vez.".into()),
        (Aviso::PaseMalo, true) => ("That link no longer works", "It was single-use, or more than three minutes went by. Go back to Adeo, open the web in “To look at” and tap “Open live” again.".into()),
        (Aviso::SinSesion, false) => ("Ábrela desde Adeo", "Para ver una web de tu PC, en Adeo ve a «Para ver», abre la web y toca «Abrir en vivo».".into()),
        (Aviso::SinSesion, true) => ("Open it from Adeo", "To see a web on your PC, go to “To look at” in Adeo, open the web and tap “Open live”.".into()),
        (Aviso::YaNo, false) => ("Ya no está compartida", "Esta web caducó o se quitó de «Para ver». Si la necesitas, pídele al agente que la comparta otra vez.".into()),
        (Aviso::YaNo, true) => ("It is no longer shared", "This web expired or was removed from “To look at”. If you need it, ask the agent to share it again.".into()),
        (Aviso::NoContesta(p), false) => ("La web de tu PC no contesta", format!("No hay nada escuchando en 127.0.0.1:{p}. ¿Sigue arrancada?")),
        (Aviso::NoContesta(p), true) => ("The web on your PC does not answer", format!("Nothing is listening on 127.0.0.1:{p}. Is it still running?")),
        (Aviso::Prohibido, false) => ("Desde aquí no", "Esta petición no viene de la web que abriste.".into()),
        (Aviso::Prohibido, true) => ("Not from here", "This request does not come from the web you opened.".into()),
        (Aviso::Raro(por), false) => ("Adeorq", (*por).into()),
        (Aviso::Raro(por), true) => ("Adeorq", raro_en_ingles(por).into()),
    };
    (titulo.into(), cuerpo)
}

/// Los `Aviso::Raro`, que solo ve quien no entra por Adeo o un navegador que
/// manda algo que no es HTTP de verdad.
fn raro_en_ingles(por: &str) -> &'static str {
    match por {
        "Esta dirección no es de este PC." => "This address is not this PC.",
        "Así no." => "Not like that.",
        "Aquí no hay nada." => "There is nothing here.",
        "Aquí no se instalan service workers." => "Service workers are not installed here.",
        "cabeceras que no son texto" => "headers that are not text",
        "petición mal formada" => "malformed request",
        "cabecera mal formada" => "malformed header",
        "cuerpo con dos largos distintos" => "a body with two different lengths",
        "cabeceras demasiado largas" => "headers too long",
        "no ha llegado entera" => "it did not arrive whole",
        "cortada" => "cut off",
        _ => "This request cannot be served.",
    }
}

fn escapar(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// Una página corta con su título y su frase, en claro y en oscuro, sin nada de fuera.
fn pagina(estado: u16, a: Aviso, ingles: bool, cabeceras: Vec<(String, String)>) -> Propia {
    let (titulo, cuerpo) = texto(&a, ingles);
    let html = format!(
        "<!doctype html><html lang=\"{}\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{}</title>\
         <style>:root{{color-scheme:light dark}}body{{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0b1220;color:#e8edf6;font:17px/1.5 system-ui,sans-serif}}\
         @media (prefers-color-scheme:light){{body{{background:#f4f6fa;color:#141a26}}}}main{{max-width:30em;padding:24px}}h1{{font-size:24px;margin:0 0 8px}}p{{margin:0}}</style>\
         <main><h1>{}</h1><p>{}</p></main></html>",
        if ingles { "en" } else { "es" },
        escapar(&titulo),
        escapar(&titulo),
        escapar(&cuerpo)
    );
    let mut cabeceras = cabeceras;
    cabeceras.push(("Content-Type".into(), "text/html; charset=utf-8".into()));
    Propia { estado, cabeceras, cuerpo: html.into_bytes() }
}

fn borrar_cookie() -> (String, String) {
    ("Set-Cookie".into(), format!("{COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"))
}

/// Un `Host` que es solo un nombre y un puerto: con él se escriben la dirección
/// de entrada y los saltos de vuelta.
fn host_limpio(host: &str) -> bool {
    !host.is_empty() && host.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b':'))
}

/// Lo que el navegador dice de dónde sale la petición (`Sec-Fetch-*`): de la
/// propia web, o una navegación de página entera. Una imagen, un script o un
/// marco que otra web del mismo sitio (otro puerto de 127.0.0.1) cuela con
/// nuestra cookie, no. Un navegador que no lo dice, pasa.
fn de_la_propia_web(c: &Cabeza) -> bool {
    match c.valor("sec-fetch-site").map(str::to_ascii_lowercase).as_deref() {
        None | Some("same-origin" | "none") => true,
        Some(_) => {
            c.valor("sec-fetch-mode").is_some_and(|m| m.eq_ignore_ascii_case("navigate"))
                && c.valor("sec-fetch-dest").is_none_or(|d| d.eq_ignore_ascii_case("document"))
        }
    }
}

/// Qué se hace con una petición: contestarla aquí (entrar con un pase, o no
/// dejarla pasar) o pasarla a la web de su compartido, ya reescrita.
pub fn decidir(c: &Cabeza, llaves: &Mutex<Llaves>, fuente: &dyn Fuente, ahora: Instant) -> Paso {
    let ingles = fuente.ingles();
    let host = c.valor("host").unwrap_or("");
    if !host_limpio(host) || !crate::movil::host_valido(host) {
        return Paso::Responder(pagina(421, Aviso::Raro("Esta dirección no es de este PC."), ingles, vec![]));
    }
    if let Some(o) = c.valor("origin") {
        if !crate::movil::origen_valido(o, host) {
            return Paso::Responder(pagina(403, Aviso::Prohibido, ingles, vec![]));
        }
    }
    if !de_la_propia_web(c) {
        return Paso::Responder(pagina(403, Aviso::Prohibido, ingles, vec![]));
    }
    // Todas las webs en vivo comparten este origen: un service worker de una se
    // quedaría para siempre delante de las demás, y vería sus pases.
    if c.valor("service-worker").is_some() {
        return Paso::Responder(pagina(403, Aviso::Raro("Aquí no se instalan service workers."), ingles, vec![]));
    }
    let ruta = c.destino.split_once('?').map_or(c.destino.as_str(), |(r, _)| r);
    let la_de_antes = cookie_de(c);
    // El candado, solo para mirar o cambiar las llaves: leer el compartido va al disco.
    let llaves = || llaves.lock().unwrap_or_else(|e| e.into_inner());

    if ruta == ENTRAR {
        if c.metodo != "GET" {
            return Paso::Responder(pagina(405, Aviso::Raro("Así no."), ingles, vec![]));
        }
        let canjeado = llaves().canjear(&consulta(&c.destino, "pase").unwrap_or_default(), ahora);
        let Some((id, quien)) = canjeado.filter(|(_, quien)| fuente.aparato_sigue(quien)) else {
            return Paso::Responder(pagina(403, Aviso::PaseMalo, ingles, vec![]));
        };
        let Some(comp) = fuente.compartido(&id).filter(|x| puerto_de_web(x).is_some()) else {
            return Paso::Responder(pagina(410, Aviso::YaNo, ingles, vec![borrar_cookie()]));
        };
        let antes = la_de_antes.as_deref().and_then(|t| llaves().de_sesion(t)).map(|(c, _)| c);
        let abierta = llaves().abrir_sesion(&id, &quien, la_de_antes.as_deref());
        let token = match abierta {
            Ok(t) => t,
            Err(e) => return Paso::Responder(Propia { estado: 500, cabeceras: vec![], cuerpo: e.into_bytes() }),
        };
        let seguro = if es_de_tailscale(host) { "; Secure" } else { "" };
        let mut cabeceras = vec![
            ("Location".into(), comp.camino.clone().unwrap_or_else(|| "/".into())),
            ("Set-Cookie".into(), format!("{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict{seguro}")),
        ];
        // Lo que dejó en este origen otra web (su `localStorage`, su IndexedDB)
        // no se le queda a esta. Volver a la misma lo conserva.
        if antes.as_deref() != Some(id.as_str()) {
            cabeceras.push(("Clear-Site-Data".into(), "\"storage\"".into()));
        }
        return Paso::Responder(Propia { estado: 303, cabeceras, cuerpo: Vec::new() });
    }
    if ruta.starts_with("/__adeorq/") {
        return Paso::Responder(pagina(404, Aviso::Raro("Aquí no hay nada."), ingles, vec![]));
    }
    let token = la_de_antes.unwrap_or_default();
    let suya = llaves().de_sesion(&token);
    let Some((id, quien)) = suya else {
        return Paso::Responder(pagina(401, Aviso::SinSesion, ingles, vec![borrar_cookie()]));
    };
    // El aparato que la abrió se olvidó en Ajustes o se le acabó el rato.
    if !fuente.aparato_sigue(&quien) {
        llaves().cerrar_sesion(&token);
        return Paso::Responder(pagina(401, Aviso::SinSesion, ingles, vec![borrar_cookie()]));
    }
    let Some(puerto) = fuente.compartido(&id).as_ref().and_then(puerto_de_web) else {
        llaves().cerrar_sesion(&token);
        return Paso::Responder(pagina(410, Aviso::YaNo, ingles, vec![borrar_cookie()]));
    };
    let publico = origen_publico(host);
    Paso::Pasar(Destino { puerto, cabeza: reescribir(c, puerto, &publico), compartido: id, token, quien, publico })
}

/// Si la petición pide pasar a WebSocket. Otro protocolo (`h2c`) no: va como
/// una petición normal.
fn pide_cambiar(c: &Cabeza) -> Option<&str> {
    let conexion = c.valor("connection")?;
    let pide = conexion.split(',').any(|t| t.trim().eq_ignore_ascii_case("upgrade"));
    pide.then(|| c.valor("upgrade")).flatten().filter(|p| p.eq_ignore_ascii_case("websocket"))
}

/// La cabeza que le llega a la web: como si se abriera en este PC.
fn reescribir(c: &Cabeza, puerto: u16, publico: &str) -> Vec<u8> {
    let local = format!("http://127.0.0.1:{puerto}");
    let mut s = format!("{} {} HTTP/1.1\r\nHost: 127.0.0.1:{puerto}\r\n", c.metodo, c.destino);
    for (k, v) in &c.cabeceras {
        let kl = k.to_ascii_lowercase();
        if matches!(kl.as_str(), "host" | "connection" | "keep-alive" | "proxy-connection" | "proxy-authorization" | "upgrade" | "expect" | "te" | "forwarded")
            || kl.starts_with("x-forwarded-")
            || kl.starts_with("tailscale-")
        {
            continue;
        }
        match kl.as_str() {
            // Ya se miró que es la de este origen (`decidir`).
            "origin" => s.push_str(&format!("Origin: {local}\r\n")),
            "referer" => match v.strip_prefix(publico) {
                Some(resto) => s.push_str(&format!("Referer: {local}{resto}\r\n")),
                None => s.push_str(&format!("{k}: {v}\r\n")),
            },
            "cookie" => {
                let suyas = sin_nuestra(v);
                if !suyas.is_empty() {
                    s.push_str(&format!("Cookie: {suyas}\r\n"));
                }
            }
            _ => s.push_str(&format!("{k}: {v}\r\n")),
        }
    }
    match pide_cambiar(c) {
        Some(protocolo) => s.push_str(&format!("Connection: Upgrade\r\nUpgrade: {protocolo}\r\n")),
        None => s.push_str("Connection: close\r\n"),
    }
    s.push_str("\r\n");
    s.into_bytes()
}

/// La cabeza de la respuesta de la web, para el navegador: se cierra al
/// acabar, y un salto a `http://127.0.0.1:<puerto>/…` va al origen público.
fn reescribir_respuesta(cabeza: &str, puerto: u16, publico: &str) -> String {
    let mut lineas = cabeza.split("\r\n");
    let primera = lineas.next().unwrap_or("");
    if primera.split(' ').nth(1) == Some("101") {
        return format!("{cabeza}\r\n\r\n");
    }
    let locales = [format!("http://127.0.0.1:{puerto}"), format!("http://localhost:{puerto}"), format!("http://[::1]:{puerto}")];
    let mut s = format!("{primera}\r\n");
    for l in lineas {
        let Some((k, v)) = l.split_once(':') else { continue };
        let kl = k.trim().to_ascii_lowercase();
        // Sin caché: en este origen la misma ruta es de una web hoy y de otra
        // mañana. Ni un permiso para que un service worker crezca de alcance.
        if matches!(kl.as_str(), "connection" | "keep-alive" | "proxy-connection" | "cache-control" | "expires" | "pragma" | "service-worker-allowed") {
            continue;
        }
        if kl == "location" {
            let v = v.trim();
            if let Some(resto) = locales.iter().find_map(|p| v.strip_prefix(p.as_str())) {
                s.push_str(&format!("{k}: {publico}{resto}\r\n"));
                continue;
            }
        }
        s.push_str(l);
        s.push_str("\r\n");
    }
    s.push_str("Cache-Control: no-store\r\nConnection: close\r\n\r\n");
    s
}

// ─── El servidor ────────────────────────────────────────────────────────────

static SIRVIENDO: AtomicBool = AtomicBool::new(false);
static CONEXIONES: AtomicUsize = AtomicUsize::new(0);

struct Abierta;
impl Drop for Abierta {
    fn drop(&mut self) {
        CONEXIONES.fetch_sub(1, Ordering::SeqCst);
    }
}

fn razon(estado: u16) -> &'static str {
    match estado {
        303 => "See Other",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        408 => "Request Timeout",
        410 => "Gone",
        421 => "Misdirected Request",
        431 => "Request Header Fields Too Large",
        502 => "Bad Gateway",
        _ => "Error",
    }
}

fn escribir(w: &mut impl Write, r: &Propia) -> std::io::Result<()> {
    let mut cabeza = format!(
        "HTTP/1.1 {} {}\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\
         Referrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'\r\n",
        r.estado,
        razon(r.estado),
        r.cuerpo.len()
    );
    for (k, v) in &r.cabeceras {
        cabeza.push_str(&format!("{k}: {v}\r\n"));
    }
    cabeza.push_str("\r\n");
    w.write_all(cabeza.as_bytes())?;
    w.write_all(&r.cuerpo)?;
    w.flush()
}

/// Lee hasta el final de la cabeza (`\r\n\r\n`) con un plazo para TODA ella.
/// Devuelve la cabeza sin el final y lo que ya llegó detrás.
fn leer_hasta_cabeza(s: &TcpStream, tope: usize, plazo: Duration, seguir: &dyn Fn() -> bool) -> Result<(Vec<u8>, Vec<u8>), (u16, &'static str)> {
    let hasta = Instant::now() + plazo;
    let mut buf = Vec::with_capacity(4096);
    let mut trozo = [0u8; 8192];
    let mut s = s;
    // Hasta dónde ya se buscó el final, y cuándo se miró si sigue valiendo
    // (`seguir` puede leer del disco: una vez por segundo basta).
    let mut buscado = 0;
    let mut mirado = Instant::now();
    loop {
        if let Some(p) = buscar(&buf[buscado..], b"\r\n\r\n").map(|p| p + buscado) {
            let resto = buf.split_off(p + 4);
            buf.truncate(p);
            return Ok((buf, resto));
        }
        buscado = buf.len().saturating_sub(3);
        if buf.len() > tope {
            return Err((431, "cabeceras demasiado largas"));
        }
        let queda = hasta.saturating_duration_since(Instant::now());
        if queda.is_zero() {
            return Err((408, "no ha llegado entera"));
        }
        if mirado.elapsed() >= MIRAR_CADA {
            if !seguir() {
                return Err((408, "no ha llegado entera"));
            }
            mirado = Instant::now();
        }
        let _ = s.set_read_timeout(Some(queda.min(MIRAR_CADA)));
        match s.read(&mut trozo) {
            Ok(0) => return Err((400, "cortada")),
            Ok(n) => buf.extend_from_slice(&trozo[..n]),
            Err(e) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {}
            Err(_) => return Err((400, "cortada")),
        }
    }
}

/// Atiende una conexión del navegador (o de `tailscale serve`) de principio a fin.
pub fn atender_conexion(cliente: TcpStream, llaves: &'static Mutex<Llaves>, fuente: &(dyn Fuente + Sync), seguir: &(dyn Fn() -> bool + Sync)) {
    let _ = cliente.set_nonblocking(false);
    let _ = cliente.set_write_timeout(Some(Duration::from_secs(15)));
    let mut cliente = cliente;
    let (cabeza, resto) = match leer_hasta_cabeza(&cliente, TOPE_CABEZA, PLAZO_CABEZA, seguir) {
        Ok(x) => x,
        Err((estado, por)) => {
            let _ = escribir(&mut cliente, &pagina(estado, Aviso::Raro(por), fuente.ingles(), vec![]));
            return;
        }
    };
    let paso = match leer_cabeza(&cabeza) {
        Ok(c) => decidir(&c, llaves, fuente, Instant::now()),
        Err((estado, por)) => Paso::Responder(pagina(estado, Aviso::Raro(por), fuente.ingles(), vec![])),
    };
    match paso {
        Paso::Responder(r) => {
            let _ = escribir(&mut cliente, &r);
        }
        Paso::Pasar(d) => pasar(cliente, d, resto, llaves, fuente, seguir),
    }
}

/// Copia del navegador a la web hasta que uno de los dos cierre, o hasta que
/// la otra mitad diga que se acabó.
fn subir(mut desde: TcpStream, mut hacia: TcpStream, fin: &AtomicBool) {
    let _ = desde.set_read_timeout(Some(MIRAR_CADA));
    let mut trozo = [0u8; 16 * 1024];
    while !fin.load(Ordering::SeqCst) {
        match desde.read(&mut trozo) {
            Ok(0) => break,
            Ok(n) => {
                if hacia.write_all(&trozo[..n]).is_err() {
                    break;
                }
            }
            Err(e) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {}
            Err(_) => break,
        }
    }
}

fn pasar(mut cliente: TcpStream, d: Destino, resto: Vec<u8>, llaves: &'static Mutex<Llaves>, fuente: &(dyn Fuente + Sync), seguir: &(dyn Fn() -> bool + Sync)) {
    let ingles = fuente.ingles();
    let direccion = std::net::SocketAddr::from(([127, 0, 0, 1], d.puerto));
    let Ok(mut web) = TcpStream::connect_timeout(&direccion, Duration::from_secs(3)) else {
        let _ = escribir(&mut cliente, &pagina(502, Aviso::NoContesta(d.puerto), ingles, vec![]));
        return;
    };
    let _ = web.set_nodelay(true);
    let _ = cliente.set_nodelay(true);
    let _ = web.set_write_timeout(Some(Duration::from_secs(15)));
    if web.write_all(&d.cabeza).and_then(|_| web.write_all(&resto)).is_err() {
        let _ = escribir(&mut cliente, &pagina(502, Aviso::NoContesta(d.puerto), ingles, vec![]));
        return;
    }
    // Sigue valiendo mientras la sesión exista, su aparato siga emparejado, el
    // compartido viva y lleve al mismo puerto, y el móvil siga encendido en Ajustes.
    let vale = || {
        seguir()
            && llaves.lock().unwrap_or_else(|e| e.into_inner()).de_sesion(&d.token).is_some_and(|(c, _)| c == d.compartido)
            && fuente.aparato_sigue(&d.quien)
            && fuente.compartido(&d.compartido).as_ref().and_then(puerto_de_web) == Some(d.puerto)
    };
    let fin = AtomicBool::new(false);
    std::thread::scope(|hilos| {
        if let (Ok(desde), Ok(hacia)) = (cliente.try_clone(), web.try_clone()) {
            let fin = &fin;
            hilos.spawn(move || subir(desde, hacia, fin));
        }
        bajar(&cliente, &web, &d, &vale);
        fin.store(true, Ordering::SeqCst);
        let _ = web.shutdown(Shutdown::Both);
        let _ = cliente.shutdown(Shutdown::Both);
    });
}

/// Copia de la web al navegador: primero su cabeza reescrita, luego lo demás
/// tal cual, mirando cada segundo que todo siga valiendo.
fn bajar(cliente: &TcpStream, web: &TcpStream, d: &Destino, vale: &dyn Fn() -> bool) {
    let mut cliente = cliente;
    let mut web = web;
    // Las respuestas de espera (`100 Continue`, `103`) pasan tal cual y se lee la siguiente.
    loop {
        let Ok((cabeza, resto)) = leer_hasta_cabeza(web, TOPE_CABEZA_RESPUESTA, PLAZO_RESPUESTA, vale) else { return };
        let Ok(texto) = String::from_utf8(cabeza) else { return };
        let estado = texto.split(' ').nth(1).unwrap_or("");
        let intermedia = estado.starts_with('1') && estado != "101";
        let nueva = if intermedia { format!("{texto}\r\n\r\n") } else { reescribir_respuesta(&texto, d.puerto, &d.publico) };
        if cliente.write_all(nueva.as_bytes()).and_then(|_| cliente.write_all(&resto)).is_err() {
            return;
        }
        if !intermedia {
            break;
        }
    }
    let _ = web.set_read_timeout(Some(MIRAR_CADA));
    let mut trozo = [0u8; 32 * 1024];
    let mut mirado = Instant::now();
    loop {
        if mirado.elapsed() >= MIRAR_CADA {
            if !vale() {
                return;
            }
            mirado = Instant::now();
        }
        match web.read(&mut trozo) {
            Ok(0) => return,
            Ok(n) => {
                if cliente.write_all(&trozo[..n]).is_err() {
                    return;
                }
            }
            Err(e) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {}
            Err(_) => return,
        }
    }
}

struct FuenteDeVerdad {
    app: tauri::AppHandle,
}

impl Fuente for FuenteDeVerdad {
    fn compartido(&self, id: &str) -> Option<Compartido> {
        let dir = crate::compartidos::dir_de_verdad().ok()?;
        crate::compartidos::abrir(&dir, id, crate::conserje::ahora().saturating_mul(1000))
    }
    fn aparato_sigue(&self, quien: &str) -> bool {
        crate::movil::aparato_sigue(&self.app, quien, crate::conserje::ahora())
    }
    fn ingles(&self) -> bool {
        crate::movil::en_ingles(&self.app)
    }
}

/// El proxy, mientras «Adeo en el móvil» esté encendido. Lo arranca el hilo
/// del 3013 (`movil.rs`), y se para cuando se apaga.
pub fn servir(app: tauri::AppHandle) {
    if SIRVIENDO.swap(true, Ordering::SeqCst) {
        return;
    }
    let seguir = {
        let app = app.clone();
        move || crate::movil::sirve(&app)
    };
    let puerto = match puerto() {
        Ok(p) => p,
        Err(e) => {
            crate::anotar(&format!("Móvil: {e}"));
            SIRVIENDO.store(false, Ordering::SeqCst);
            return;
        }
    };
    let mut escucha = None;
    for _ in 0..40 {
        match TcpListener::bind(("127.0.0.1", puerto)) {
            Ok(l) => {
                escucha = Some(l);
                break;
            }
            Err(_) if seguir() => std::thread::sleep(Duration::from_millis(500)),
            Err(_) => break,
        }
    }
    let Some(escucha) = escucha else {
        crate::anotar(&format!("Móvil: el {puerto} ya lo sirve otro programa, así que no hay webs en vivo en el móvil."));
        SIRVIENDO.store(false, Ordering::SeqCst);
        return;
    };
    let _ = escucha.set_nonblocking(true);
    let fuente: &'static FuenteDeVerdad = Box::leak(Box::new(FuenteDeVerdad { app: app.clone() }));
    let seguir: &'static (dyn Fn() -> bool + Sync + Send) = Box::leak(Box::new(seguir));
    while seguir() {
        // Las que no caben esperan en la cola del sistema hasta que se libre una.
        if CONEXIONES.load(Ordering::SeqCst) >= TOPE_CONEXIONES {
            std::thread::sleep(Duration::from_millis(10));
            continue;
        }
        match escucha.accept() {
            Ok((s, _)) => {
                CONEXIONES.fetch_add(1, Ordering::SeqCst);
                std::thread::spawn(move || {
                    let _abierta = Abierta;
                    atender_conexion(s, &LLAVES, fuente, seguir);
                });
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(15)),
            Err(_) => std::thread::sleep(Duration::from_millis(200)),
        }
    }
    LLAVES.lock().unwrap_or_else(|e| e.into_inner()).vaciar();
    SIRVIENDO.store(false, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    struct DeMentira(Mutex<Vec<Compartido>>);
    impl Fuente for DeMentira {
        fn compartido(&self, id: &str) -> Option<Compartido> {
            self.0.lock().unwrap().iter().find(|c| c.id == id).cloned()
        }
        /// «olvidado» es un aparato que se quitó en Ajustes.
        fn aparato_sigue(&self, quien: &str) -> bool {
            quien != "olvidado"
        }
    }

    fn web(id: &str, puerto: u16) -> Compartido {
        Compartido { id: id.repeat(32), titulo: "La web".into(), tipo: Tipo::Web, ruta: None, puerto: Some(puerto), camino: Some("/guia?x=1".into()), proyecto: None, panel: None, creado: 0, caduca: u64::MAX, abierto: None }
    }

    fn cabeza(texto: &str) -> Cabeza {
        leer_cabeza(texto.replace('\n', "\r\n").trim_end().as_bytes()).unwrap()
    }

    fn propia(p: Paso) -> Propia {
        match p {
            Paso::Responder(r) => r,
            Paso::Pasar(d) => panic!("tenía que contestar el proxy y pasa al {}", d.puerto),
        }
    }

    fn cabecera<'a>(r: &'a Propia, nombre: &str) -> &'a str {
        r.cabeceras.iter().find(|(k, _)| k == nombre).map(|(_, v)| v.as_str()).unwrap_or("")
    }

    /// Lo que pidió el encargo: el proxy no sirve un puerto que no se compartió
    /// (ni el 3012 ni el 3013 ni el suyo), ni sin pase, ni con un pase usado o
    /// caducado; y lo que deja pasar llega como si se abriera en este PC.
    #[test]
    fn solo_entra_con_un_pase_de_un_uso_y_solo_a_lo_compartido() {
        let llaves = Mutex::new(Llaves::nuevas());
        let fuente = DeMentira(Mutex::new(vec![web("a", 5173), web("b", 3012), web("c", 3013), web("d", PUERTO)]));
        let t = Instant::now();
        let host = "Host: equipo.tail1.ts.net:8444";
        let pide = |texto: &str, cuando: Instant| decidir(&cabeza(texto), &llaves, &fuente, cuando);

        // Sin nada, nada: ni una ruta, ni el puerto en la URL.
        for ruta in ["/", "/guia", "/127.0.0.1:3013/api/yo", "/__adeorq/otra"] {
            let r = propia(pide(&format!("GET {ruta} HTTP/1.1\n{host}\n"), t));
            assert!(r.estado == 401 || r.estado == 404, "{ruta}: {}", r.estado);
        }
        assert_eq!(propia(pide(&format!("GET {ENTRAR}?pase={} HTTP/1.1\n{host}\n", "0".repeat(32)), t)).estado, 403, "un pase inventado");

        // Con el suyo, una vez: cookie HttpOnly de este origen y a la ruta compartida.
        let pase = llaves.lock().unwrap().pase(&"a".repeat(32), "movil", t).unwrap();
        let entra = format!("GET {ENTRAR}?pase={pase} HTTP/1.1\n{host}\n");
        let r = propia(pide(&entra, t));
        assert_eq!((r.estado, cabecera(&r, "Location")), (303, "/guia?x=1"));
        let galleta = cabecera(&r, "Set-Cookie").to_string();
        assert!(galleta.starts_with(&format!("{COOKIE}=")) && galleta.contains("HttpOnly") && galleta.contains("SameSite=Strict") && galleta.contains("Secure"), "{galleta}");
        let token = galleta.split(';').next().unwrap().split_once('=').unwrap().1.to_string();
        assert_eq!(propia(pide(&entra, t)).estado, 403, "el mismo pase dos veces, no");
        let viejo = llaves.lock().unwrap().pase(&"a".repeat(32), "movil", t).unwrap();
        assert_eq!(propia(pide(&format!("GET {ENTRAR}?pase={viejo} HTTP/1.1\n{host}\n"), t + VIDA_PASE)).estado, 403, "caducado, no");

        // Con la cookie pasa a la web compartida, y la web lo ve como en este PC.
        let pasa = pide(
            &format!("GET /src/main.ts HTTP/1.1\n{host}\nOrigin: https://equipo.tail1.ts.net:8444\nReferer: https://equipo.tail1.ts.net:8444/guia\nCookie: tema=oscuro; {COOKIE}={token}\nTailscale-User-Login: munir@ejemplo\nX-Forwarded-For: 100.1.2.3\nConnection: keep-alive\n"),
            t,
        );
        let Paso::Pasar(d) = pasa else { panic!("con su cookie tenía que pasar") };
        let llega = String::from_utf8(d.cabeza.clone()).unwrap();
        assert_eq!(d.puerto, 5173);
        for debe in ["GET /src/main.ts HTTP/1.1\r\n", "Host: 127.0.0.1:5173\r\n", "Origin: http://127.0.0.1:5173\r\n", "Referer: http://127.0.0.1:5173/guia\r\n", "Cookie: tema=oscuro\r\n", "Connection: close\r\n"] {
            assert!(llega.contains(debe), "falta {debe:?} en {llega}");
        }
        for no in [COOKIE, "Tailscale-User", "munir@", "X-Forwarded", "keep-alive", "ts.net"] {
            assert!(!llega.contains(no), "no tenía que llegar {no:?}: {llega}");
        }
        // El recargado de Vite: un WebSocket pasa como tal.
        let Paso::Pasar(ws) = pide(&format!("GET /?token=x HTTP/1.1\n{host}\nConnection: Upgrade\nUpgrade: websocket\nCookie: {COOKIE}={token}\n"), t) else { panic!("el WebSocket tenía que pasar") };
        assert!(String::from_utf8(ws.cabeza).unwrap().contains("Connection: Upgrade\r\nUpgrade: websocket\r\n"));

        // Otra web abierta en el PC, u otro dominio apuntado a 127.0.0.1: no.
        assert_eq!(propia(pide(&format!("GET / HTTP/1.1\n{host}\nOrigin: https://otra.web\nCookie: {COOKIE}={token}\n"), t)).estado, 403);
        assert_eq!(propia(pide(&format!("GET / HTTP/1.1\nHost: malo.ejemplo:3014\nCookie: {COOKIE}={token}\n"), t)).estado, 421);
        assert!(leer_cabeza(b"GET http://127.0.0.1:3013/api/yo HTTP/1.1\r\nHost: 127.0.0.1:3014").is_err(), "ni una URL entera");

        // Un compartido que apunta a un puerto de Adeorq no se sirve nunca, aunque lleve pase.
        for id in ["b", "c", "d"] {
            let pase = llaves.lock().unwrap().pase(&id.repeat(32), "movil", t).unwrap();
            assert_eq!(propia(pide(&format!("GET {ENTRAR}?pase={pase} HTTP/1.1\n{host}\n"), t)).estado, 410, "{id}");
        }
        // De la revisión de Securo. Un service worker se quedaría delante de
        // todas las webs de este origen: no se instala ninguno.
        assert_eq!(propia(pide(&format!("GET /sw.js HTTP/1.1\n{host}\nService-Worker: script\nCookie: {COOKIE}={token}\n"), t)).estado, 403);
        // Otra web del mismo sitio (otro puerto de 127.0.0.1) no cuela un script
        // ni un marco con nuestra cookie; navegar a la página entera, sí.
        let colada = format!("GET / HTTP/1.1\n{host}\nSec-Fetch-Site: same-site\nSec-Fetch-Mode: no-cors\nSec-Fetch-Dest: script\nCookie: {COOKIE}={token}\n");
        assert_eq!(propia(pide(&colada, t)).estado, 403);
        let marco = format!("GET / HTTP/1.1\n{host}\nSec-Fetch-Site: same-site\nSec-Fetch-Mode: navigate\nSec-Fetch-Dest: iframe\nCookie: {COOKIE}={token}\n");
        assert_eq!(propia(pide(&marco, t)).estado, 403);
        let navega = format!("GET / HTTP/1.1\n{host}\nSec-Fetch-Site: same-site\nSec-Fetch-Mode: navigate\nSec-Fetch-Dest: document\nCookie: {COOKIE}={token}\n");
        assert!(matches!(pide(&navega, t), Paso::Pasar(_)));
        // Solo WebSocket cambia de protocolo; `h2c` va como una petición normal.
        let Paso::Pasar(h2c) = pide(&format!("GET / HTTP/1.1\n{host}\nConnection: Upgrade\nUpgrade: h2c\nCookie: {COOKIE}={token}\n"), t) else { panic!("tenía que pasar") };
        let h2c = String::from_utf8(h2c.cabeza).unwrap();
        assert!(!h2c.contains("h2c") && h2c.contains("Connection: close\r\n"), "{h2c}");
        // Cabeceras con caracteres de control, o un Host con algo más que nombre y puerto: no.
        assert!(leer_cabeza(b"GET / HTTP/1.1\r\nHost: 127.0.0.1:3014\r\nX-A: uno\x01dos").is_err());
        assert_eq!(propia(pide(&format!("GET / HTTP/1.1\nHost: x@equipo.tail1.ts.net:8444\nCookie: {COOKIE}={token}\n"), t)).estado, 421);
        // Entrar a otra web borra lo que dejó la de antes en este origen; volver a la misma, no.
        let otra = llaves.lock().unwrap().pase(&"a".repeat(32), "movil", t).unwrap();
        let r = propia(pide(&format!("GET {ENTRAR}?pase={otra} HTTP/1.1\n{host}\nCookie: {COOKIE}={token}\n"), t));
        assert_eq!((r.estado, cabecera(&r, "Clear-Site-Data")), (303, ""), "la misma web conserva lo suyo");
        let token = cabecera(&r, "Set-Cookie").split(';').next().unwrap().split_once('=').unwrap().1.to_string();
        let nueva = llaves.lock().unwrap().pase(&"a".repeat(32), "movil", t).unwrap();
        let r = propia(pide(&format!("GET {ENTRAR}?pase={nueva} HTTP/1.1\n{host}\n"), t));
        assert_eq!(cabecera(&r, "Clear-Site-Data"), "\"storage\"", "sin saber de dónde viene, se borra");
        // Un aparato que se olvida en Ajustes: su pase no entra y su sesión se corta.
        let suyo = llaves.lock().unwrap().pase(&"a".repeat(32), "olvidado", t).unwrap();
        assert_eq!(propia(pide(&format!("GET {ENTRAR}?pase={suyo} HTTP/1.1\n{host}\n"), t)).estado, 403);
        let suya = llaves.lock().unwrap().abrir_sesion(&"a".repeat(32), "olvidado", None).unwrap();
        assert_eq!(propia(pide(&format!("GET / HTTP/1.1\n{host}\nCookie: {COOKIE}={suya}\n"), t)).estado, 401);
        assert!(llaves.lock().unwrap().de_sesion(&suya).is_none());

        // Quitado de «Para ver»: la sesión deja de valer al momento.
        fuente.0.lock().unwrap().retain(|c| c.id != "a".repeat(32));
        let r = propia(pide(&format!("GET / HTTP/1.1\n{host}\nCookie: {COOKIE}={token}\n"), t));
        assert_eq!((r.estado, cabecera(&r, "Set-Cookie").contains("Max-Age=0")), (410, true));
        assert!(llaves.lock().unwrap().de_sesion(&token).is_none());
    }

    #[test]
    fn por_donde_entra_y_que_le_vuelve_al_navegador() {
        assert_eq!(direccion_de_entrada("equipo.tail1.ts.net:8443", 3014, "p"), format!("https://equipo.tail1.ts.net:8444{ENTRAR}?pase=p"));
        assert_eq!(direccion_de_entrada("127.0.0.1:3013", 3014, "p"), format!("http://127.0.0.1:3014{ENTRAR}?pase=p"));
        assert_eq!(puerto_de(None, None), Ok(PUERTO));
        assert_eq!(puerto_de(None, Some(4396)), Ok(4397), "una aislada no pelea el 3014");
        assert_eq!(puerto_de(Some("5000"), Some(4396)), Ok(5000));
        assert!(puerto_de(Some("x"), None).is_err());
        let r = reescribir_respuesta(
            "HTTP/1.1 302 Found\r\nLocation: http://localhost:5173/entrar\r\nConnection: keep-alive\r\nKeep-Alive: timeout=5\r\nCache-Control: max-age=31536000, immutable\r\nService-Worker-Allowed: /",
            5173,
            "https://e.ts.net:8444",
        );
        assert!(r.contains("Location: https://e.ts.net:8444/entrar\r\n") && r.ends_with("Cache-Control: no-store\r\nConnection: close\r\n\r\n") && !r.contains("keep-alive"), "{r}");
        assert!(!r.contains("max-age") && !r.contains("Service-Worker-Allowed"), "ni caché ni service worker: {r}");
        let ws = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade";
        assert_eq!(reescribir_respuesta(ws, 5173, "x"), format!("{ws}\r\n\r\n"));
    }

    /// De punta a punta por sockets: una petición llega a la web con su cuerpo y
    /// vuelve; un WebSocket va y viene; y al quitarlo, la conexión abierta se corta.
    #[test]
    fn de_verdad_pasa_http_y_websocket_y_se_corta_al_quitarlo() {
        use std::io::BufRead;
        let web_l = TcpListener::bind("127.0.0.1:0").unwrap();
        let puerto_web = web_l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for s in web_l.incoming().flatten() {
                std::thread::spawn(move || {
                    let mut r = std::io::BufReader::new(s.try_clone().unwrap());
                    let mut cabeza = String::new();
                    loop {
                        let mut l = String::new();
                        if r.read_line(&mut l).unwrap_or(0) == 0 || l == "\r\n" {
                            break;
                        }
                        cabeza.push_str(&l);
                    }
                    let mut s = s;
                    if cabeza.contains("Upgrade: websocket") {
                        let _ = s.write_all(b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
                        let mut b = [0u8; 64];
                        while let Ok(n) = r.read(&mut b) {
                            if n == 0 || s.write_all(&b[..n]).is_err() {
                                break;
                            }
                        }
                    } else {
                        let mut cuerpo = vec![0u8; 5];
                        let _ = r.read_exact(&mut cuerpo);
                        let texto = format!("{}|{}", cabeza.lines().next().unwrap_or(""), String::from_utf8_lossy(&cuerpo));
                        let _ = write!(s, "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: keep-alive\r\n\r\n{texto}", texto.len());
                    }
                });
            }
        });
        let llaves: &'static Mutex<Llaves> = Box::leak(Box::new(Mutex::new(Llaves::nuevas())));
        let fuente: &'static DeMentira = Box::leak(Box::new(DeMentira(Mutex::new(vec![web("e", puerto_web)]))));
        let proxy = TcpListener::bind("127.0.0.1:0").unwrap();
        let puerto_proxy = proxy.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for s in proxy.incoming().flatten() {
                std::thread::spawn(move || atender_conexion(s, llaves, fuente, &|| true));
            }
        });
        let token = llaves.lock().unwrap().abrir_sesion(&"e".repeat(32), "movil", None).unwrap();
        let hablar = |texto: &str| {
            let mut s = TcpStream::connect(("127.0.0.1", puerto_proxy)).unwrap();
            s.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
            s.write_all(texto.as_bytes()).unwrap();
            s
        };
        let mut todo = String::new();
        hablar(&format!("POST /api HTTP/1.1\r\nHost: 127.0.0.1:{puerto_proxy}\r\nCookie: {COOKIE}={token}\r\nContent-Length: 5\r\n\r\nhola!")).read_to_string(&mut todo).unwrap();
        assert!(todo.starts_with("HTTP/1.1 200 OK\r\n") && todo.contains("Connection: close\r\n") && todo.ends_with("POST /api HTTP/1.1|hola!"), "{todo}");
        let mut todo = String::new();
        hablar(&format!("GET / HTTP/1.1\r\nHost: 127.0.0.1:{puerto_proxy}\r\n\r\n")).read_to_string(&mut todo).unwrap();
        assert!(todo.starts_with("HTTP/1.1 401"), "sin cookie, sin web: {todo}");

        let mut ws = hablar(&format!("GET /?token=t HTTP/1.1\r\nHost: 127.0.0.1:{puerto_proxy}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nCookie: {COOKIE}={token}\r\n\r\n"));
        let mut b = [0u8; 256];
        let n = ws.read(&mut b).unwrap();
        assert!(String::from_utf8_lossy(&b[..n]).starts_with("HTTP/1.1 101"));
        ws.write_all(b"eco").unwrap();
        let n = ws.read(&mut b).unwrap();
        assert_eq!(&b[..n], b"eco");
        // Lo quitan de «Para ver»: el WebSocket abierto se cierra en un par de segundos.
        fuente.0.lock().unwrap().clear();
        let desde = Instant::now();
        ws.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        assert!(matches!(ws.read(&mut b), Ok(0) | Err(_)), "tenía que cortarse");
        assert!(desde.elapsed() < Duration::from_secs(4), "{:?}", desde.elapsed());
    }
}
