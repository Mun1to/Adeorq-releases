// El conserje en el móvil, estés donde estés.
//
// Munir, 2026-09-30: «¿puedes hacer que el chat principal se pueda conectar
// desde el móvil si estoy, por ejemplo, en Italia?», y ante los cuatro caminos
// que se le enseñaron, «elige las mejores opciones». Se eligió Tailscale: una
// red privada entre su PC y su móvil, con `tailscale serve` llevando HTTPS
// hasta aquí. El 13 de agosto había decidido «solo por el mismo wifi»; este
// camino lo sustituye y, en casa, entra igual por Tailscale.
//
// Lo que hace que esto se pueda dejar encendido:
//
//   1. Solo escucha en 127.0.0.1. Desde la red de casa no se ve, y desde
//      internet menos: al móvil le llega por Tailscale, que solo deja entrar a
//      los aparatos de su cuenta.
//   2. Aun así, cada petición lleva la clave de un móvil emparejado. Hace falta
//      porque 127.0.0.1 no es solo Tailscale: cualquier web abierta en este PC
//      puede intentar hablarle, y el conserje hace que los agentes editen
//      código. La clave va en una cabecera, y una web de otro sitio no puede
//      ponerla sin que el navegador pregunte antes; aquí no se le contesta.
//   3. Se empareja con un código de seis cifras que enseña Ajustes, vale diez
//      minutos y aguanta cinco fallos. En disco no queda la clave: queda su
//      huella (sha256), que no sirve para entrar.
//   4. Un `Host` que no sea este PC ni un nombre de Tailscale se rechaza: es lo
//      que corta el truco de apuntar un dominio ajeno a 127.0.0.1.
//   5. Desde el móvil solo se habla con el CONSERJE, nunca con una terminal: su
//      reja de Rust sigue decidiendo qué se abre y dónde se escribe.
//
// Lo que NO está aquí, a propósito: abrir paneles. Eso lo monta la ventana, así
// que se le pide por un puente con la misma forma que el del MCP
// (`movil:pedido` / `movil_reply`), y el envío corre por el MISMO camino que el
// hilo del PC (`enviarAlConserje` en `lib/conserjeEnvio.ts`).
//
// El HTTP es de mano y mínimo, como el IPC de `discord.rs`: una petición por
// conexión, con `Content-Length` y topes duros. Quien habla con él es
// `tailscale serve` o el navegador del móvil, nada más.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, Instant};

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{Emitter, Manager};

use crate::SinVentana;

pub const PUERTO: u16 = 3013;
const TOPE_CABECERAS: usize = 16 * 1024;
const TOPE_CUERPO: usize = 64 * 1024;
/// En caracteres. Era 8.000 y el mensaje de compactación de un `/fin` largo,
/// con su `/compact` delante, no cabía; 16.000 siguen siendo 32 KB como mucho.
const TOPE_TEXTO: usize = 16_000;
/// Un adjunto llega a TROZOS, cada uno una petición normal con su clave, sus
/// 64 KB y sus diez segundos: así subir una foto no obliga a aflojar ningún
/// tope de arriba. 45.000 bytes son 60.000 en base64, y caben con su JSON.
const TROZO_ADJUNTO: usize = 45_000;
const TOPE_ADJUNTO: usize = 25 * 1024 * 1024;
const SUBIDAS_A_LA_VEZ: usize = 4;
/// Una subida a medias (el móvil se quedó sin cobertura) se tira a los diez minutos.
const VIDA_SUBIDA: Duration = Duration::from_secs(10 * 60);
const VIDA_CODIGO: Duration = Duration::from_secs(10 * 60);
const INTENTOS: u8 = 5;
/// Lo que se espera a la ventana. Contestar el estado es leer un fichero, y
/// empezar un envío es solo apuntarlo: si pasa de aquí, la ventana está mal.
const ESPERA_VENTANA: Duration = Duration::from_secs(20);
const LECTURA: Duration = Duration::from_secs(15);
/// Para leer la petición ENTERA, no cada trozo: con el plazo solo por lectura,
/// quien mandara un byte cada catorce segundos retenía un hilo durante días.
const PLAZO_PETICION: Duration = Duration::from_secs(10);
/// Conexiones a la vez. Un móvil pregunta de una en una; muchas más es alguien
/// abriendo hilos para tumbar la app que lleva tus terminales.
const TOPE_CONEXIONES: usize = 32;
/// Cada cuánto se apunta en disco que un móvil se ha visto: con el sondeo cada
/// pocos segundos, apuntarlo siempre sería escribir el fichero sin parar.
const APUNTAR_VISTO: u64 = 60;

static PAGINA: &str = include_str!("movil.html");

const ICONO: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="#0d1a33"/><path d="M48 18l7.5 17.5L73 43l-17.5 7.5L48 68l-7.5-17.5L23 43l17.5-7.5z" fill="#4d9fff"/><path d="M71 60l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#9cc7ff"/></svg>"##;

/// El service worker de la página: recibe el aviso cifrado (el navegador ya lo
/// descifró con su clave) y lo enseña aunque la página esté cerrada; un toque
/// abre el conserje. Solo `showNotification` y `openWindow`: nada más.
const SERVICE_WORKER: &str = r##"self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { cuerpo: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "Conserje", {
    body: d.cuerpo || "",
    icon: "/icono.svg",
    badge: "/icono.svg",
    tag: d.titulo || "conserje",
    data: { url: d.url || "/" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
    const abierta = lista.find((c) => "focus" in c);
    if (abierta) { abierta.navigate(url); return abierta.focus(); }
    return self.clients.openWindow(url);
  }));
});
"##;

/// Instalada en el móvil ya no es solo el conserje: también lleva las
/// terminales, así que se llama Adeorq y lleva su logo. El PNG es el de la web,
/// con su fondo oscuro: un iPhone pinta de negro lo transparente, y Chrome pide
/// un icono de 144 px o más para dejar instalarla.
const MANIFIESTO: &str =r##"{"name":"Adeorq","short_name":"Adeorq","start_url":"/","display":"standalone","background_color":"#0b1220","theme_color":"#0b1220","icons":[{"src":"/icono-180.png","sizes":"180x180","type":"image/png","purpose":"any"}]}"##;

static ICONO_APP: &[u8] = include_bytes!("../../web/assets/favicon-180.png");

// ─── Lo que se guarda ───────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, Default, PartialEq)]
pub struct Dispositivo {
    pub nombre: String,
    /// sha256 de su clave, en hexadecimal. La clave no se guarda nunca.
    pub huella: String,
    pub creado: u64,
    #[serde(default)]
    pub visto: u64,
    /// Si pidió avisos: lo que dio su navegador al suscribirse (ver `push.rs`).
    #[serde(default)]
    pub push: Option<crate::push::Suscripcion>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Ajustes {
    #[serde(default)]
    pub encendido: bool,
    #[serde(default)]
    pub dispositivos: Vec<Dispositivo>,
}

fn ruta_ajustes() -> Result<PathBuf, String> {
    Ok(crate::dir_datos_creado()?.join("movil.json"))
}

fn leer_ajustes() -> Ajustes {
    ruta_ajustes()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Al lado y encima: a medias, se perderían los móviles emparejados.
fn guardar_ajustes(a: &Ajustes) -> Result<(), String> {
    let ruta = ruta_ajustes()?;
    let temporal = ruta.with_extension("json.tmp");
    std::fs::write(&temporal, serde_json::to_vec_pretty(a).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(&temporal, &ruta).map_err(|e| {
        let _ = std::fs::remove_file(&temporal);
        e.to_string()
    })
}

// ─── El emparejamiento y las claves ─────────────────────────────────────────

struct Codigo {
    valor: String,
    hasta: Instant,
    fallos: u8,
}

/// Quién puede entrar. Sin disco dentro, para poder probarlo: quien la usa
/// guarda los ajustes cuando algo cambia.
#[derive(Default)]
pub struct Guardia {
    pub ajustes: Ajustes,
    codigo: Option<Codigo>,
}

impl Guardia {
    pub fn con(ajustes: Ajustes) -> Self {
        Guardia { ajustes, codigo: None }
    }

    pub fn nuevo_codigo(&mut self, ahora: Instant) -> Result<String, String> {
        let valor = seis_cifras()?;
        self.codigo = Some(Codigo { valor: valor.clone(), hasta: ahora + VIDA_CODIGO, fallos: 0 });
        Ok(valor)
    }

    fn codigo_visible(&self, ahora: Instant) -> Option<(String, u64)> {
        let c = self.codigo.as_ref()?;
        (ahora < c.hasta).then(|| (c.valor.clone(), (c.hasta - ahora).as_secs()))
    }

    /// La clave nueva si el código vale. Cada fallo cuenta, y al quinto el
    /// código deja de valer aunque después se acierte: seis cifras no aguantan
    /// que se prueben todas.
    pub fn emparejar(&mut self, codigo: &str, nombre: &str, ahora: Instant, cuando: u64) -> Result<String, String> {
        let Some(c) = self.codigo.as_mut() else {
            return Err("No hay ningún emparejamiento abierto: pídelo en Ajustes > Móvil.".into());
        };
        if ahora >= c.hasta {
            self.codigo = None;
            return Err("El código ha caducado: pide otro en Ajustes > Móvil.".into());
        }
        if !iguales(codigo.trim().as_bytes(), c.valor.as_bytes()) {
            c.fallos += 1;
            if c.fallos >= INTENTOS {
                self.codigo = None;
                return Err("Demasiados intentos: pide otro código en Ajustes > Móvil.".into());
            }
            return Err("Ese código no es.".into());
        }
        self.codigo = None;
        let clave = clave_nueva()?;
        self.ajustes.dispositivos.push(Dispositivo {
            nombre: limpiar_nombre(nombre),
            huella: huella(&clave),
            creado: cuando,
            visto: cuando,
            push: None,
        });
        Ok(clave)
    }

    /// De quién es esta clave, y si hay que guardar que se acaba de ver.
    pub fn quien(&mut self, clave: &str, cuando: u64) -> Option<(String, bool)> {
        let h = huella(clave);
        let d = self.ajustes.dispositivos.iter_mut().find(|d| iguales(d.huella.as_bytes(), h.as_bytes()))?;
        let apuntar = cuando.saturating_sub(d.visto) >= APUNTAR_VISTO;
        if apuntar {
            d.visto = cuando;
        }
        Some((d.nombre.clone(), apuntar))
    }

    /// Quita un móvil por el principio de su huella, que es lo que enseña Ajustes.
    pub fn olvidar(&mut self, id: &str) -> bool {
        let antes = self.ajustes.dispositivos.len();
        self.ajustes.dispositivos.retain(|d| id.is_empty() || !d.huella.starts_with(id));
        self.ajustes.dispositivos.len() != antes
    }

    /// Guarda (o quita, con `None`) la suscripción de avisos del móvil que
    /// lleva esa clave. Devuelve si cambió algo.
    pub fn poner_push(&mut self, clave: &str, sub: Option<crate::push::Suscripcion>) -> bool {
        let h = huella(clave);
        let Some(d) = self.ajustes.dispositivos.iter_mut().find(|d| iguales(d.huella.as_bytes(), h.as_bytes())) else {
            return false;
        };
        if d.push == sub {
            return false;
        }
        d.push = sub;
        true
    }

    /// Los móviles que pidieron avisos, con su suscripción.
    pub fn suscripciones(&self) -> Vec<(String, crate::push::Suscripcion)> {
        self.ajustes
            .dispositivos
            .iter()
            .filter_map(|d| d.push.clone().map(|s| (d.nombre.clone(), s)))
            .collect()
    }

    /// El servicio de push dijo que esa suscripción ya no existe.
    pub fn caduco_push(&mut self, endpoint: &str) -> bool {
        let mut cambio = false;
        for d in self.ajustes.dispositivos.iter_mut() {
            if d.push.as_ref().is_some_and(|s| s.endpoint == endpoint) {
                d.push = None;
                cambio = true;
            }
        }
        cambio
    }
}

fn aleatorio(buf: &mut [u8]) -> Result<(), String> {
    getrandom::fill(buf).map_err(|e| format!("sin aleatoriedad del sistema: {e}"))
}

fn seis_cifras() -> Result<String, String> {
    // Por debajo de un múltiplo exacto de un millón, o unos códigos saldrían
    // más que otros.
    loop {
        let mut b = [0u8; 4];
        aleatorio(&mut b)?;
        let n = u32::from_le_bytes(b);
        if n < 4_294_000_000 {
            return Ok(format!("{:06}", n % 1_000_000));
        }
    }
}

fn clave_nueva() -> Result<String, String> {
    let mut b = [0u8; 32];
    aleatorio(&mut b)?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(b))
}

fn huella(clave: &str) -> String {
    format!("{:x}", Sha256::digest(clave.as_bytes()))
}

/// Comparar sin cortar al primer byte distinto, para que el tiempo no cuente
/// cuánto se acertó.
fn iguales(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn limpiar_nombre(n: &str) -> String {
    let s: String = n.chars().filter(|c| !c.is_control()).take(40).collect();
    let s = s.trim();
    if s.is_empty() { "Móvil".into() } else { s.into() }
}

// ─── HTTP, lo justo ─────────────────────────────────────────────────────────

#[derive(Debug, Default)]
pub struct Peticion {
    pub metodo: String,
    pub ruta: String,
    pub consulta: HashMap<String, String>,
    /// Con el nombre en minúsculas.
    pub cabeceras: HashMap<String, String>,
    pub cuerpo: Vec<u8>,
}

fn buscar(pajar: &[u8], aguja: &[u8]) -> Option<usize> {
    pajar.windows(aguja.len()).position(|w| w == aguja)
}

/// `%20` y compañía; `+` es espacio solo en la consulta.
fn descodificar(s: &str, mas_es_espacio: bool) -> String {
    let b = s.as_bytes();
    let mut fuera = Vec::with_capacity(b.len());
    let mut i = 0;
    // Los dos dígitos se leen como bytes: cortar el texto por posición partiría
    // una letra con tilde que viniera detrás del `%`, y eso es un pánico.
    let hex = |c: u8| (c as char).to_digit(16).map(|d| d as u8);
    while i < b.len() {
        match b[i] {
            b'%' if i + 2 < b.len() => match (hex(b[i + 1]), hex(b[i + 2])) {
                (Some(a), Some(z)) => {
                    fuera.push(a * 16 + z);
                    i += 3;
                    continue;
                }
                _ => fuera.push(b'%'),
            },
            b'+' if mas_es_espacio => fuera.push(b' '),
            c => fuera.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&fuera).into_owned()
}

fn consulta_de(q: &str) -> HashMap<String, String> {
    q.split('&')
        .filter(|p| !p.is_empty())
        .map(|p| match p.split_once('=') {
            Some((k, v)) => (descodificar(k, true), descodificar(v, true)),
            None => (descodificar(p, true), String::new()),
        })
        .collect()
}

pub fn leer_peticion(r: &mut impl Read) -> Result<Peticion, (u16, &'static str)> {
    let mut buf = Vec::with_capacity(2048);
    let mut trozo = [0u8; 4096];
    let fin = loop {
        if let Some(p) = buscar(&buf, b"\r\n\r\n") {
            break p;
        }
        if buf.len() > TOPE_CABECERAS {
            return Err((431, "cabeceras demasiado largas"));
        }
        let n = r.read(&mut trozo).map_err(|_| (408, "no ha llegado la petición entera"))?;
        if n == 0 {
            return Err((400, "petición cortada"));
        }
        buf.extend_from_slice(&trozo[..n]);
    };
    let cabeza = std::str::from_utf8(&buf[..fin]).map_err(|_| (400, "cabeceras que no son texto"))?;
    let mut lineas = cabeza.split("\r\n");
    let mut primera = lineas.next().unwrap_or("").split(' ');
    let metodo = primera.next().unwrap_or("").to_string();
    let destino = primera.next().unwrap_or("");
    if metodo.is_empty() || !destino.starts_with('/') {
        return Err((400, "petición mal formada"));
    }
    let (ruta, consulta) = destino.split_once('?').unwrap_or((destino, ""));
    let mut cabeceras = HashMap::new();
    for l in lineas {
        if let Some((k, v)) = l.split_once(':') {
            cabeceras.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }
    if cabeceras.contains_key("transfer-encoding") {
        return Err((411, "hace falta Content-Length"));
    }
    let largo = match cabeceras.get("content-length") {
        Some(v) => v.parse::<usize>().map_err(|_| (400, "Content-Length raro"))?,
        None => 0,
    };
    if largo > TOPE_CUERPO {
        return Err((413, "demasiado grande"));
    }
    let mut cuerpo = buf[fin + 4..].to_vec();
    while cuerpo.len() < largo {
        let n = r.read(&mut trozo).map_err(|_| (408, "no ha llegado el cuerpo entero"))?;
        if n == 0 {
            return Err((400, "cuerpo cortado"));
        }
        cuerpo.extend_from_slice(&trozo[..n]);
    }
    cuerpo.truncate(largo);
    Ok(Peticion {
        metodo,
        ruta: descodificar(ruta, false),
        consulta: consulta_de(consulta),
        cabeceras,
        cuerpo,
    })
}

#[derive(Debug)]
pub struct Respuesta {
    pub estado: u16,
    pub tipo: &'static str,
    pub cuerpo: Vec<u8>,
}

impl Respuesta {
    fn json(estado: u16, v: Value) -> Self {
        Respuesta { estado, tipo: "application/json; charset=utf-8", cuerpo: v.to_string().into_bytes() }
    }
    fn error(estado: u16, mensaje: &str) -> Self {
        Self::json(estado, json!({ "error": mensaje }))
    }
    fn texto(tipo: &'static str, cuerpo: &str) -> Self {
        Respuesta { estado: 200, tipo, cuerpo: cuerpo.as_bytes().to_vec() }
    }
}

/// Una huella corta de un JSON (FNV-1a de 64 bits): no protege nada, solo dice
/// si dos respuestas son la misma sin mandar la segunda.
fn firma_de(v: &Value) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in v.to_string().bytes() {
        h ^= u64::from(b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}

fn razon(estado: u16) -> &'static str {
    match estado {
        200 => "OK",
        202 => "Accepted",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        408 => "Request Timeout",
        409 => "Conflict",
        411 => "Length Required",
        413 => "Payload Too Large",
        421 => "Misdirected Request",
        431 => "Request Header Fields Too Large",
        502 => "Bad Gateway",
        503 => "Service Unavailable",
        _ => "Error",
    }
}

/// La única página que puede llevar dentro la del móvil: el panel personal de
/// Munir, que desde el 2026-10-08 tiene un apartado «Conexión remota a Adeorq»
/// (lo eligió él frente a una tarjeta con un enlace). Una sola dirección, y
/// exacta: cualquier otra que la metiera en un marco podría tapar sus botones
/// con los de encima y hacerle pulsar lo que no ve.
pub const PANEL_DE_MUNIR: &str = "https://munito-panel.pages.dev";

fn escribir(w: &mut impl Write, r: &Respuesta) -> std::io::Result<()> {
    let mut cabeza = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\
         Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\n",
        r.estado,
        razon(r.estado),
        r.tipo,
        r.cuerpo.len()
    );
    if r.tipo.starts_with("text/html") {
        // Todo lo de la página va dentro de ella; fuera no se carga nada. Y en
        // un marco, solo dentro del panel (`X-Frame-Options` no sabe decir «solo
        // esta», así que la página va sin él y con `frame-ancestors`).
        cabeza.push_str(&format!(
            "Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; \
             style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; \
             frame-ancestors 'self' {PANEL_DE_MUNIR}; base-uri 'none'; form-action 'none'\r\n",
        ));
    } else {
        cabeza.push_str("X-Frame-Options: DENY\r\n");
    }
    cabeza.push_str("\r\n");
    w.write_all(cabeza.as_bytes())?;
    w.write_all(&r.cuerpo)?;
    w.flush()
}

/// Este PC o un nombre de Tailscale, con o sin puerto. Lo demás es alguien
/// apuntando un dominio suyo a 127.0.0.1.
pub fn host_valido(host: &str) -> bool {
    let h = host.trim().to_ascii_lowercase();
    let sin_puerto = h.rsplit_once(':').map(|(a, p)| if p.chars().all(|c| c.is_ascii_digit()) { a } else { h.as_str() }).unwrap_or(&h);
    sin_puerto == "127.0.0.1"
        || sin_puerto == "localhost"
        || (sin_puerto.ends_with(".ts.net") && sin_puerto.len() > ".ts.net".len() && !sin_puerto.contains('/'))
}

/// Si el navegador dice de dónde viene la petición, tiene que ser de aquí.
pub fn origen_valido(origen: &str, host: &str) -> bool {
    let sin_esquema = origen.split_once("://").map(|(_, r)| r).unwrap_or("");
    !sin_esquema.is_empty() && sin_esquema.eq_ignore_ascii_case(host.trim())
}

/// Lo mismo que acepta `conserje.rs` para el nombre de su fichero.
fn id_valido(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

// ─── Los adjuntos ───────────────────────────────────────────────────────────
// Munir, 2026-10-08: «haz que también se puedan adjuntar archivos, imágenes».
// Van a la carpeta de las capturas pegadas en el PC (`pastes`), así que las
// imágenes salen también en la galería del lienzo, y a la terminal o al
// conserje les llega la RUTA, que es lo que lee Claude Code.

struct Subida {
    id: String,
    nombre: String,
    siguiente: u32,
    total: u32,
    bytes: usize,
    desde: Instant,
}
static SUBIDAS: Mutex<Vec<Subida>> = Mutex::new(Vec::new());

/// El nombre que dio el móvil, sin nada que no sea letra, cifra, punto o raya:
/// nada de rutas, ni de nombres que empiecen por punto.
fn nombre_de_adjunto(nombre: &str) -> String {
    let limpio: String = nombre
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') { c } else { '_' })
        .collect();
    let limpio = limpio.trim_start_matches(['.', '_']);
    // Largo, se recorta por delante y se conserva la extensión.
    let (base, ext) = match limpio.rsplit_once('.') {
        Some((b, e)) if !b.is_empty() && e.len() <= 8 => (b, Some(e)),
        _ => (limpio, None),
    };
    let base: String = base.chars().take(48).collect();
    match (base.is_empty(), ext) {
        (true, _) => "adjunto".into(),
        (false, Some(e)) => format!("{base}.{e}"),
        (false, None) => base,
    }
}

/// Un trozo más de un adjunto. Con el último, el archivo pasa a su sitio y se
/// devuelve su ruta. Los trozos van en orden: uno fuera de sitio es un móvil
/// que reintenta mal, y se le dice en vez de coser un archivo roto.
pub fn guardar_trozo(
    dir: &std::path::Path,
    id: &str,
    nombre: &str,
    parte: u32,
    total: u32,
    datos: &[u8],
    ahora: Instant,
) -> Result<Option<PathBuf>, String> {
    if !id_valido(id) || total == 0 || parte >= total || datos.is_empty() || datos.len() > TROZO_ADJUNTO {
        return Err("Ese trozo no tiene forma.".into());
    }
    let subiendo = dir.join(".subiendo");
    std::fs::create_dir_all(&subiendo).map_err(|e| e.to_string())?;
    let temporal = subiendo.join(id);
    let mut subidas = SUBIDAS.lock().unwrap_or_else(|e| e.into_inner());
    subidas.retain(|s| {
        let viva = ahora.saturating_duration_since(s.desde) < VIDA_SUBIDA;
        if !viva {
            let _ = std::fs::remove_file(subiendo.join(&s.id));
        }
        viva
    });
    if parte == 0 {
        subidas.retain(|s| s.id != id);
        if subidas.len() >= SUBIDAS_A_LA_VEZ {
            return Err("Hay demasiadas subidas a la vez; espera a que acabe una.".into());
        }
        std::fs::write(&temporal, b"").map_err(|e| e.to_string())?;
        subidas.push(Subida { id: id.into(), nombre: nombre_de_adjunto(nombre), siguiente: 0, total, bytes: 0, desde: ahora });
    }
    let Some(i) = subidas.iter().position(|s| s.id == id) else {
        return Err("Esa subida ya no está: vuelve a adjuntarlo.".into());
    };
    if parte != subidas[i].siguiente || total != subidas[i].total {
        return Err("Ese trozo no toca ahora: vuelve a adjuntarlo.".into());
    }
    if subidas[i].bytes + datos.len() > TOPE_ADJUNTO {
        subidas.remove(i);
        let _ = std::fs::remove_file(&temporal);
        return Err("Pesa demasiado: como mucho 25 MB.".into());
    }
    let mut f = std::fs::OpenOptions::new().append(true).open(&temporal).map_err(|e| e.to_string())?;
    f.write_all(datos).map_err(|e| e.to_string())?;
    subidas[i].siguiente += 1;
    subidas[i].bytes += datos.len();
    if subidas[i].siguiente < subidas[i].total {
        return Ok(None);
    }
    let hecha = subidas.remove(i);
    drop(f);
    let sello = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let destino = dir.join(format!("movil-{sello}-{}", hecha.nombre));
    std::fs::rename(&temporal, &destino).map_err(|e| e.to_string())?;
    Ok(Some(destino))
}

// ─── Lo que se atiende ──────────────────────────────────────────────────────

/// Las teclas sueltas que se pueden mandar a una terminal desde el móvil
/// (decisión E3). Las mismas que `TECLAS` en `src/lib/movil.ts`, que es quien
/// pone los bytes.
pub const TECLAS_DEL_MOVIL: &[&str] = &["intro", "esc", "ctrl+c", "shift+tab", "arriba", "abajo"];

/// Lo que el servidor necesita de la casa. Con una casa de mentira se prueba
/// entero sin abrir la app.
pub trait Casa {
    fn lista(&self) -> Value;
    fn leer(&self, id: &str) -> Result<Value, String>;
    /// Pedirle algo a la ventana y esperar su respuesta.
    fn ventana(&self, clase: &str, datos: Value) -> Result<Value, String>;
    fn mejorar(&self, texto: &str) -> Result<String, String>;
    fn router(&self, id: &str, encendido: bool) -> Result<(), String>;
    /// Con qué modelo piensa el conserje en esa conversación.
    fn cerebro(&self, id: &str, cerebro: &str) -> Result<(), String>;
    /// El modelo de las sesiones con el router apagado.
    fn fijo(&self, id: &str, modelo: &str) -> Result<(), String>;
    fn parar(&self, id: &str);
    fn sesion(&self, cwd: &str, sesion: &str) -> Result<Value, String>;
    /// Dónde se guardan los adjuntos que llegan del móvil.
    fn adjuntos(&self) -> Result<PathBuf, String>;
    /// Dónde viven las decisiones que piden los agentes (`decisiones.rs`).
    fn decisiones(&self) -> Result<PathBuf, String>;
    /// El arranque de Adeorq: los números de panel solo valen dentro de uno.
    fn arranque(&self) -> u64;
    /// Los paneles con terminal ahora mismo: una decisión cuya terminal se
    /// cerró ya no la espera nadie (`decisiones::vigencia`).
    fn paneles_abiertos(&self) -> Vec<u32> {
        Vec::new()
    }
    /// Que la pestaña «Decisiones» de la app se entere de que una cambió.
    fn decisiones_cambian(&self) {}
}

pub fn atender(
    p: &Peticion,
    guardia: &Mutex<Guardia>,
    casa: &dyn Casa,
    persistir: &dyn Fn(&Ajustes),
    reloj: (Instant, u64),
) -> Respuesta {
    let host = p.cabeceras.get("host").map(String::as_str).unwrap_or("");
    if !host_valido(host) {
        return Respuesta::error(421, "Esta dirección no es de este PC.");
    }
    if let Some(o) = p.cabeceras.get("origin") {
        if !origen_valido(o, host) {
            return Respuesta::error(403, "Esa página no es la del conserje.");
        }
    }

    match (p.metodo.as_str(), p.ruta.as_str()) {
        ("GET", "/") | ("GET", "/index.html") => return Respuesta::texto("text/html; charset=utf-8", PAGINA),
        ("GET", "/manifest.webmanifest") => return Respuesta::texto("application/manifest+json", MANIFIESTO),
        ("GET", "/icono.svg") => return Respuesta::texto("image/svg+xml", ICONO),
        ("GET", "/icono-180.png") => return Respuesta { estado: 200, tipo: "image/png", cuerpo: ICONO_APP.to_vec() },
        ("GET", "/sw.js") => return Respuesta::texto("application/javascript; charset=utf-8", SERVICE_WORKER),
        ("POST", "/api/emparejar") => {
            let v: Value = serde_json::from_slice(&p.cuerpo).unwrap_or(Value::Null);
            let codigo = v["codigo"].as_str().unwrap_or("");
            let nombre = v["nombre"].as_str().unwrap_or("");
            let mut g = guardia.lock().unwrap();
            return match g.emparejar(codigo, nombre, reloj.0, reloj.1) {
                Ok(clave) => {
                    persistir(&g.ajustes);
                    Respuesta::json(200, json!({ "clave": clave, "nombre": limpiar_nombre(nombre) }))
                }
                Err(e) => Respuesta::error(403, &e),
            };
        }
        _ => {}
    }

    if !p.ruta.starts_with("/api/") {
        return Respuesta::error(404, "Aquí no hay nada.");
    }

    // A partir de aquí, solo un móvil emparejado.
    let clave = p
        .cabeceras
        .get("authorization")
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("")
        .trim();
    let nombre = {
        let mut g = guardia.lock().unwrap();
        match g.quien(clave, reloj.1) {
            Some((n, apuntar)) => {
                if apuntar {
                    persistir(&g.ajustes);
                }
                n
            }
            None => return Respuesta::error(401, "Este móvil no está emparejado."),
        }
    };

    let cuerpo: Value = serde_json::from_slice(&p.cuerpo).unwrap_or(Value::Null);
    let id_de = |v: Option<&str>| -> Result<String, Respuesta> {
        let id = v.unwrap_or("");
        if id_valido(id) { Ok(id.to_string()) } else { Err(Respuesta::error(400, "Esa conversación no existe.")) }
    };

    match (p.metodo.as_str(), p.ruta.as_str()) {
        ("GET", "/api/yo") => Respuesta::json(200, json!({ "nombre": nombre })),
        // Los avisos (`push.rs`): la clave con la que se suscribe el navegador,
        // y guardar o quitar lo que devuelve. Van atados a ESTE móvil (su clave).
        ("GET", "/api/push/clave") => match crate::push::claves_vapid() {
            Ok(c) => Respuesta::json(200, json!({ "clave": c.publica })),
            Err(e) => Respuesta::error(500, &e),
        },
        ("POST", "/api/push/suscribir") => {
            let sub = crate::push::Suscripcion {
                endpoint: cuerpo["endpoint"].as_str().unwrap_or("").trim().to_string(),
                p256dh: cuerpo["p256dh"].as_str().unwrap_or("").trim().to_string(),
                auth: cuerpo["auth"].as_str().unwrap_or("").trim().to_string(),
            };
            if !sub.endpoint.starts_with("https://") || sub.p256dh.is_empty() || sub.auth.is_empty() {
                return Respuesta::error(400, "La suscripción no está completa.");
            }
            let mut g = guardia.lock().unwrap();
            if g.poner_push(clave, Some(sub)) {
                persistir(&g.ajustes);
            }
            Respuesta::json(200, json!({ "ok": true }))
        }
        ("POST", "/api/push/olvidar") => {
            let mut g = guardia.lock().unwrap();
            if g.poner_push(clave, None) {
                persistir(&g.ajustes);
            }
            Respuesta::json(200, json!({ "ok": true }))
        }
        ("GET", "/api/lista") => Respuesta::json(200, casa.lista()),
        ("GET", "/api/conversacion") => {
            let id = match id_de(p.consulta.get("id").map(String::as_str)) {
                Ok(id) => id,
                Err(r) => return r,
            };
            match casa.leer(&id) {
                Ok(conv) => {
                    // Si la ventana no contesta, la conversación se enseña igual:
                    // sin estados es peor, pero no mentira.
                    let vivo = casa.ventana("estados", json!({ "id": id })).unwrap_or_else(|e| json!({ "error": e }));
                    Respuesta::json(200, json!({ "conversacion": conv, "vivo": vivo }))
                }
                Err(e) => Respuesta::error(404, &e),
            }
        }
        ("POST", "/api/enviar") => {
            let id = match id_de(cuerpo["id"].as_str()) {
                Ok(id) => id,
                Err(r) => return r,
            };
            let texto = cuerpo["texto"].as_str().unwrap_or("").trim();
            if texto.is_empty() {
                return Respuesta::error(400, "No hay nada que mandar.");
            }
            if texto.chars().count() > TOPE_TEXTO {
                return Respuesta::error(413, "Es demasiado largo para mandarlo de una vez.");
            }
            match casa.ventana("enviar", json!({ "id": id, "texto": texto })) {
                Ok(_) => Respuesta::json(202, json!({ "ok": true })),
                Err(e) => Respuesta::error(502, &e),
            }
        }
        ("POST", "/api/mejorar") => {
            let texto = cuerpo["texto"].as_str().unwrap_or("").trim();
            if texto.is_empty() || texto.chars().count() > TOPE_TEXTO {
                return Respuesta::error(400, "No hay nada que mejorar.");
            }
            match casa.mejorar(texto) {
                Ok(t) => Respuesta::json(200, json!({ "texto": t })),
                Err(e) => Respuesta::error(502, &e),
            }
        }
        ("POST", "/api/router") => {
            let id = match id_de(cuerpo["id"].as_str()) {
                Ok(id) => id,
                Err(r) => return r,
            };
            match casa.router(&id, cuerpo["encendido"].as_bool().unwrap_or(true)) {
                Ok(()) => Respuesta::json(200, json!({ "ok": true })),
                Err(e) => Respuesta::error(502, &e),
            }
        }
        ("POST", "/api/cerebro") => {
            let id = match id_de(cuerpo["id"].as_str()) {
                Ok(id) => id,
                Err(r) => return r,
            };
            match casa.cerebro(&id, cuerpo["cerebro"].as_str().unwrap_or("")) {
                Ok(()) => Respuesta::json(200, json!({ "ok": true })),
                Err(e) => Respuesta::error(400, &e),
            }
        }
        ("POST", "/api/fijo") => {
            let id = match id_de(cuerpo["id"].as_str()) {
                Ok(id) => id,
                Err(r) => return r,
            };
            match casa.fijo(&id, cuerpo["modelo"].as_str().unwrap_or("")) {
                Ok(()) => Respuesta::json(200, json!({ "ok": true })),
                Err(e) => Respuesta::error(400, &e),
            }
        }
        ("POST", "/api/parar") => {
            let id = match id_de(cuerpo["id"].as_str()) {
                Ok(id) => id,
                Err(r) => return r,
            };
            casa.parar(&id);
            Respuesta::json(200, json!({ "ok": true }))
        }
        // Las terminales, desde el móvil (decisión E3 de Munir, 2026-10-07):
        // la lista, la pantalla de una y escribirle texto o una tecla. Lo
        // contesta la ventana, que es quien tiene los paneles y el búfer de
        // xterm; aquí solo se mira que haya un móvil emparejado (arriba) y que
        // lo que llega tenga forma. Munir eligió texto libre a cualquier
        // terminal sabiendo que es lo más cómodo y lo más peligroso: la red que
        // queda es la de siempre (emparejado, por Tailscale) y ninguna más.
        ("GET", "/api/terminales") => match casa.ventana("terminales", json!({})) {
            Ok(v) => Respuesta::json(200, v),
            Err(e) => Respuesta::error(502, &e),
        },
        ("GET", "/api/terminal") => {
            let Some(panel) = p.consulta.get("panel").and_then(|s| s.parse::<u64>().ok()) else {
                return Respuesta::error(400, "Falta qué terminal.");
            };
            match casa.ventana("pantalla", json!({ "panel": panel })) {
                Ok(v) => Respuesta::json(200, v),
                Err(e) => Respuesta::error(502, &e),
            }
        }
        ("POST", "/api/terminal/escribir") => {
            let Some(panel) = cuerpo["panel"].as_u64() else {
                return Respuesta::error(400, "Falta qué terminal.");
            };
            let texto = cuerpo["texto"].as_str().unwrap_or("").trim();
            if texto.is_empty() {
                return Respuesta::error(400, "No hay nada que mandar.");
            }
            if texto.chars().count() > TOPE_TEXTO {
                return Respuesta::error(413, "Es demasiado largo para mandarlo de una vez.");
            }
            match casa.ventana("escribir", json!({ "panel": panel, "texto": texto })) {
                Ok(_) => Respuesta::json(202, json!({ "ok": true })),
                Err(e) => Respuesta::error(502, &e),
            }
        }
        ("POST", "/api/terminal/tecla") => {
            let Some(panel) = cuerpo["panel"].as_u64() else {
                return Respuesta::error(400, "Falta qué terminal.");
            };
            let tecla = cuerpo["tecla"].as_str().unwrap_or("");
            if !TECLAS_DEL_MOVIL.contains(&tecla) {
                return Respuesta::error(400, "Esa tecla no se manda desde el móvil.");
            }
            match casa.ventana("tecla", json!({ "panel": panel, "tecla": tecla })) {
                Ok(_) => Respuesta::json(202, json!({ "ok": true })),
                Err(e) => Respuesta::error(502, &e),
            }
        }
        ("GET", "/api/sesion") => {
            let cwd = p.consulta.get("cwd").map(String::as_str).unwrap_or("");
            let sesion = p.consulta.get("id").map(String::as_str).unwrap_or("");
            if cwd.is_empty() || sesion.is_empty() {
                return Respuesta::error(400, "Falta qué sesión.");
            }
            match casa.sesion(cwd, sesion) {
                // Con `si`, el chat del móvil pregunta si algo cambió desde esa
                // firma: lo vigila cada 3 s, a menudo con datos móviles, y una
                // conversación de verdad pesa 100 KB que casi nunca cambian.
                Ok(v) => match p.consulta.get("si") {
                    Some(si) => {
                        let firma = firma_de(&v);
                        if *si == firma {
                            Respuesta::json(200, json!({ "firma": firma, "igual": true }))
                        } else {
                            Respuesta::json(200, json!({ "firma": firma, "turnos": v }))
                        }
                    }
                    None => Respuesta::json(200, v),
                },
                Err(e) => Respuesta::error(404, &e),
            }
        }
        ("POST", "/api/adjuntar") => {
            let id = cuerpo["id"].as_str().unwrap_or("");
            let nombre = cuerpo["nombre"].as_str().unwrap_or("");
            let parte = cuerpo["parte"].as_u64().and_then(|n| u32::try_from(n).ok());
            let total = cuerpo["total"].as_u64().and_then(|n| u32::try_from(n).ok());
            let datos = base64::engine::general_purpose::STANDARD.decode(cuerpo["datos"].as_str().unwrap_or(""));
            let (Some(parte), Some(total), Ok(datos)) = (parte, total, datos) else {
                return Respuesta::error(400, "Ese trozo no tiene forma.");
            };
            let dir = match casa.adjuntos() {
                Ok(d) => d,
                Err(e) => return Respuesta::error(500, &e),
            };
            match guardar_trozo(&dir, id, nombre, parte, total, &datos, reloj.0) {
                Ok(Some(ruta)) => Respuesta::json(200, json!({ "ruta": ruta.to_string_lossy() })),
                Ok(None) => Respuesta::json(200, json!({ "ok": true })),
                Err(e) => Respuesta::error(400, &e),
            }
        }
        // Las decisiones que piden los agentes (`decisiones.rs`): la lista, una
        // entera, contestarla y descartarla. La respuesta se teclea en la
        // terminal que preguntó solo si es del mismo arranque de Adeorq: en
        // otro, ese número de panel puede ser ya otra terminal. Cada una lleva
        // su `vigencia`: si alguien la espera todavía o su terminal ya no está.
        ("GET", "/api/decisiones") => match casa.decisiones() {
            Ok(dir) => {
                let (arranque, abiertos) = (casa.arranque(), casa.paneles_abiertos());
                let lista: Vec<Value> = crate::decisiones::listar(&dir)
                    .iter()
                    .map(|d| {
                        json!({
                            "id": d.id, "titulo": d.titulo, "proyecto": d.proyecto, "panel": d.panel,
                            "creada": d.creada, "preguntas": d.preguntas.len(), "contestada": d.respuesta.is_some(),
                            "vigencia": crate::decisiones::vigencia(d, arranque, &abiertos),
                            "cerrada": d.respuesta.as_ref().map(|r| r.cuando).or(d.descartada),
                        })
                    })
                    .collect();
                Respuesta::json(200, json!({ "decisiones": lista }))
            }
            Err(e) => Respuesta::error(500, &e),
        },
        ("GET", "/api/decision") => {
            let id = p.consulta.get("id").map(String::as_str).unwrap_or("");
            match casa.decisiones().ok().and_then(|dir| crate::decisiones::leer(&dir, id)) {
                Some(d) => Respuesta::json(
                    200,
                    json!(crate::decisiones::con_vigencia(d, casa.arranque(), &casa.paneles_abiertos())),
                ),
                None => Respuesta::error(404, "Esa decisión ya no está."),
            }
        }
        ("POST", "/api/decision/descartar") => {
            let id = cuerpo["id"].as_str().unwrap_or("");
            let dir = match casa.decisiones() {
                Ok(d) => d,
                Err(e) => return Respuesta::error(500, &e),
            };
            let Some(antes) = crate::decisiones::leer(&dir, id)
                .map(|d| crate::decisiones::vigencia(&d, casa.arranque(), &casa.paneles_abiertos()))
            else {
                return Respuesta::error(404, "Esa decisión ya no está.");
            };
            match crate::decisiones::descartar(&dir, id, reloj.1.saturating_mul(1000)) {
                Ok(d) => {
                    // A una terminal que seguía esperándola se le dice, o el
                    // agente se queda esperando una respuesta que no va a llegar.
                    let mut avisada = false;
                    if let Some((panel, texto)) = crate::decisiones::aviso_de_descarte(&d, antes) {
                        avisada = casa.ventana("escribir", json!({ "panel": panel, "texto": texto })).is_ok_and(|v| v.get("error").is_none());
                    }
                    casa.decisiones_cambian();
                    Respuesta::json(200, json!({ "ok": true, "avisada": avisada, "panel": d.panel }))
                }
                Err(e) => Respuesta::error(409, &e),
            }
        }
        ("POST", "/api/decision/responder") => {
            let id = cuerpo["id"].as_str().unwrap_or("");
            let Ok(elecciones) = serde_json::from_value::<std::collections::BTreeMap<String, crate::decisiones::Eleccion>>(
                cuerpo["elecciones"].clone(),
            ) else {
                return Respuesta::error(400, "Las respuestas no tienen forma.");
            };
            let dir = match casa.decisiones() {
                Ok(d) => d,
                Err(e) => return Respuesta::error(500, &e),
            };
            // Contestada ya (desde otro aparato): 409, y la página enseña cómo
            // quedó sin perder lo que escribió esta (RFC 9110, 409 Conflict).
            if crate::decisiones::leer(&dir, id).is_some_and(|d| d.respuesta.is_some()) {
                return Respuesta::error(409, "Esa decisión ya está contestada.");
            }
            match crate::decisiones::responder(&dir, id, elecciones, &nombre, reloj.1.saturating_mul(1000)) {
                Ok(d) => {
                    let mut entregada = false;
                    if let Some((panel, texto)) = crate::decisiones::a_teclear(&d, casa.arranque()) {
                        entregada = casa.ventana("escribir", json!({ "panel": panel, "texto": texto })).is_ok_and(|v| v.get("error").is_none());
                        if entregada {
                            crate::decisiones::marcar_entregada(&dir, &d.id);
                        }
                    }
                    casa.decisiones_cambian();
                    Respuesta::json(200, json!({ "ok": true, "entregada": entregada, "panel": d.panel }))
                }
                Err(e) => Respuesta::error(400, &e),
            }
        }
        (_, "/api/yo" | "/api/lista" | "/api/conversacion" | "/api/enviar" | "/api/mejorar" | "/api/router"
            | "/api/cerebro" | "/api/fijo" | "/api/parar" | "/api/sesion" | "/api/push/clave" | "/api/push/suscribir"
            | "/api/push/olvidar" | "/api/terminales" | "/api/terminal" | "/api/terminal/escribir"
            | "/api/terminal/tecla" | "/api/adjuntar" | "/api/decisiones" | "/api/decision"
            | "/api/decision/responder" | "/api/decision/descartar") => Respuesta::error(405, "Así no."),
        _ => Respuesta::error(404, "Aquí no hay nada."),
    }
}

/// Un socket que, antes de cada lectura, se pone de plazo lo que queda hasta
/// `hasta`, y pasado eso no lee más.
struct ConPlazo<'a> {
    s: &'a TcpStream,
    hasta: Instant,
}

impl Read for ConPlazo<'_> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let queda = self.hasta.saturating_duration_since(Instant::now());
        if queda.is_zero() {
            return Err(std::io::ErrorKind::TimedOut.into());
        }
        self.s.set_read_timeout(Some(queda))?;
        let mut s = self.s;
        s.read(buf)
    }
}

/// Lleva la cuenta de las conexiones abiertas y la baja al acabar, pase lo que pase.
struct Abierta<'a>(&'a AtomicUsize);

impl Drop for Abierta<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

fn servir_conexion(
    mut s: TcpStream,
    guardia: &Mutex<Guardia>,
    casa: &dyn Casa,
    persistir: &dyn Fn(&Ajustes),
) {
    // Una conexión que viene de un escuchador sin bloqueo puede heredarlo.
    let _ = s.set_nonblocking(false);
    let _ = s.set_write_timeout(Some(LECTURA));
    let leida = leer_peticion(&mut ConPlazo { s: &s, hasta: Instant::now() + PLAZO_PETICION });
    let r = match leida {
        Ok(p) => atender(&p, guardia, casa, persistir, (Instant::now(), crate::conserje::ahora())),
        Err((estado, por)) => Respuesta::error(estado, por),
    };
    let _ = escribir(&mut s, &r);
}

// ─── La casa de verdad, el puente y el servidor ─────────────────────────────

#[derive(Default)]
pub struct Movil {
    guardia: Mutex<Guardia>,
    esperando: Mutex<HashMap<u64, mpsc::Sender<Value>>>,
    siguiente: AtomicU64,
    conexiones: AtomicUsize,
    sirviendo: AtomicBool,
    /// Que Windows aceptó la petición de no dormirse (ver `no_dormir`).
    despierto: AtomicBool,
    apagar: AtomicBool,
}

struct CasaDeVerdad {
    app: tauri::AppHandle,
}

impl Casa for CasaDeVerdad {
    fn lista(&self) -> Value {
        json!(crate::conserje::conserje_lista())
    }
    fn leer(&self, id: &str) -> Result<Value, String> {
        crate::conserje::leer(id).map(|c| json!(c))
    }
    fn ventana(&self, clase: &str, datos: Value) -> Result<Value, String> {
        pedir_a_la_ventana(&self.app, clase, datos)
    }
    fn mejorar(&self, texto: &str) -> Result<String, String> {
        tauri::async_runtime::block_on(crate::conserje::conserje_mejorar(texto.to_string()))
    }
    fn router(&self, id: &str, encendido: bool) -> Result<(), String> {
        crate::conserje::conserje_router(id.to_string(), encendido)
    }
    fn cerebro(&self, id: &str, cerebro: &str) -> Result<(), String> {
        crate::conserje::conserje_cerebro(id.to_string(), cerebro.to_string())
    }
    fn fijo(&self, id: &str, modelo: &str) -> Result<(), String> {
        crate::conserje::conserje_fijo(id.to_string(), modelo.to_string())
    }
    fn parar(&self, id: &str) {
        crate::conserje::conserje_parar(id.to_string());
    }
    fn sesion(&self, cwd: &str, sesion: &str) -> Result<Value, String> {
        crate::sessions::session_messages(cwd.to_string(), Some(sesion.to_string()), Some(80))
            .map(|t| json!(t))
    }
    fn adjuntos(&self) -> Result<PathBuf, String> {
        let dir = crate::dir_datos()?.join("pastes");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(dir)
    }
    fn decisiones(&self) -> Result<PathBuf, String> {
        crate::decisiones::dir_de_verdad()
    }
    fn arranque(&self) -> u64 {
        crate::conserje::arranque()
    }
    fn paneles_abiertos(&self) -> Vec<u32> {
        crate::pty::paneles_abiertos(&self.app)
    }
    fn decisiones_cambian(&self) {
        crate::decisiones::avisar_cambio(&self.app);
    }
}

fn pedir_a_la_ventana(app: &tauri::AppHandle, clase: &str, datos: Value) -> Result<Value, String> {
    let m = app.state::<Movil>();
    let peticion = m.siguiente.fetch_add(1, Ordering::Relaxed) + 1;
    let (tx, rx) = mpsc::channel::<Value>();
    m.esperando.lock().unwrap().insert(peticion, tx);
    let mut cuerpo = datos;
    cuerpo["peticion"] = json!(peticion);
    cuerpo["clase"] = json!(clase);
    if app.emit("movil:pedido", &cuerpo).is_err() {
        m.esperando.lock().unwrap().remove(&peticion);
        return Err("La ventana de Adeorq no responde.".into());
    }
    match rx.recv_timeout(ESPERA_VENTANA) {
        Ok(v) => match v.get("error").and_then(Value::as_str) {
            Some(e) => Err(e.to_string()),
            None => Ok(v),
        },
        Err(_) => {
            // Siempre, o el mapa crece con peticiones muertas.
            m.esperando.lock().unwrap().remove(&peticion);
            Err("La ventana de Adeorq no contestó a tiempo.".into())
        }
    }
}

/// La ventana ya hizo lo que se le pidió: suelta al hilo que espera.
#[tauri::command(async)]
pub fn movil_reply(state: tauri::State<'_, Movil>, peticion: u64, datos: Value) {
    if let Some(tx) = state.esperando.lock().unwrap().remove(&peticion) {
        let _ = tx.send(datos);
    }
}

fn persistir_de_verdad(a: &Ajustes) {
    if let Err(e) = guardar_ajustes(a) {
        crate::anotar(&format!("Móvil: no he podido guardar movil.json ({e})"));
    }
}

fn arrancar(app: &tauri::AppHandle) {
    let m = app.state::<Movil>();
    if m.sirviendo.swap(true, Ordering::SeqCst) {
        return;
    }
    m.apagar.store(false, Ordering::SeqCst);
    let app = app.clone();
    std::thread::spawn(move || {
        let m = app.state::<Movil>();
        // Se insiste un rato, como el MCP: al reinstalar, el Adeorq viejo aún
        // suelta el puerto cuando el nuevo arranca.
        let mut escucha = None;
        for _ in 0..40 {
            match TcpListener::bind(("127.0.0.1", PUERTO)) {
                Ok(l) => {
                    escucha = Some(l);
                    break;
                }
                Err(_) if !m.apagar.load(Ordering::SeqCst) => std::thread::sleep(Duration::from_millis(500)),
                Err(_) => break,
            }
        }
        let Some(escucha) = escucha else {
            crate::anotar(&format!(
                "Móvil: el {PUERTO} ya lo sirve otro programa (¿otro Adeorq abierto?), así que el conserje no está en el móvil."
            ));
            m.sirviendo.store(false, Ordering::SeqCst);
            return;
        };
        // Sin bloqueo, para poder apagarlo desde Ajustes sin cerrar la app.
        let _ = escucha.set_nonblocking(true);
        m.despierto.store(no_dormir(true), Ordering::SeqCst);
        while !m.apagar.load(Ordering::SeqCst) {
            match escucha.accept() {
                Ok((mut s, _)) => {
                    if m.conexiones.fetch_add(1, Ordering::SeqCst) >= TOPE_CONEXIONES {
                        m.conexiones.fetch_sub(1, Ordering::SeqCst);
                        let _ = s.set_nonblocking(false);
                        let _ = s.set_write_timeout(Some(Duration::from_secs(1)));
                        let _ = escribir(&mut s, &Respuesta::error(503, "Hay demasiadas conexiones abiertas."));
                        continue;
                    }
                    let app = app.clone();
                    std::thread::spawn(move || {
                        let m = app.state::<Movil>();
                        let _abierta = Abierta(&m.conexiones);
                        let casa = CasaDeVerdad { app: app.clone() };
                        servir_conexion(s, &m.guardia, &casa, &persistir_de_verdad);
                    });
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(120)),
                Err(_) => std::thread::sleep(Duration::from_millis(500)),
            }
        }
        no_dormir(false);
        m.despierto.store(false, Ordering::SeqCst);
        m.sirviendo.store(false, Ordering::SeqCst);
    });
}

/// Mientras el conserje está en el móvil, el PC no se duerme solo: dormido, el
/// móvil no tiene a quién preguntar, y el de Munir se dormía a las 3 h sin
/// tocarlo (`powercfg`, 2026-10-06). La pantalla sí se apaga.
///
/// Es una petición del HILO que llama, así que la hace el del servidor y la
/// suelta al apagarlo; si la app se cierra, Windows la quita con el hilo. Con
/// el reposo moderno (el de su portátil) aguanta lo que dure enchufado y cinco
/// minutos con batería, y no frena la tapa ni el botón de encendido: eso lo
/// decide Microsoft, no Adeorq (learn.microsoft.com, «Prepare software for
/// modern standby» y `SetThreadExecutionState`). En Linux todavía no hace nada.
#[cfg(windows)]
fn no_dormir(si: bool) -> bool {
    use windows_sys::Win32::System::Power::{SetThreadExecutionState, ES_CONTINUOUS, ES_SYSTEM_REQUIRED};
    let banderas = if si { ES_CONTINUOUS | ES_SYSTEM_REQUIRED } else { ES_CONTINUOUS };
    // Devuelve el estado de antes, o 0 si falla.
    let antes = unsafe { SetThreadExecutionState(banderas) };
    si && antes != 0
}

#[cfg(not(windows))]
fn no_dormir(_: bool) -> bool {
    false
}

/// Al abrir la app: lo que se guardó, y si estaba encendido, a servir.
pub fn cargar(app: &tauri::AppHandle) {
    let ajustes = leer_ajustes();
    let encendido = ajustes.encendido;
    *app.state::<Movil>().guardia.lock().unwrap() = Guardia::con(ajustes);
    if encendido {
        arrancar(app);
    }
}

// ─── Lo que ve Ajustes ──────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct DispositivoVisible {
    pub id: String,
    pub nombre: String,
    pub creado: u64,
    pub visto: u64,
}

#[derive(Serialize)]
pub struct CodigoVisible {
    pub valor: String,
    pub quedan: u64,
}

#[derive(Serialize)]
pub struct EstadoMovil {
    pub encendido: bool,
    pub sirviendo: bool,
    /// Mientras sirve, el PC no se duerme solo (solo en Windows, por ahora).
    pub despierto: bool,
    /// Cuántos móviles pidieron avisos (ver `push.rs`).
    pub avisos: usize,
    pub puerto: u16,
    pub dispositivos: Vec<DispositivoVisible>,
    pub codigo: Option<CodigoVisible>,
}

fn estado(m: &Movil) -> EstadoMovil {
    let g = m.guardia.lock().unwrap();
    EstadoMovil {
        encendido: g.ajustes.encendido,
        sirviendo: m.sirviendo.load(Ordering::SeqCst),
        despierto: m.despierto.load(Ordering::SeqCst),
        avisos: g.ajustes.dispositivos.iter().filter(|d| d.push.is_some()).count(),
        puerto: PUERTO,
        dispositivos: g
            .ajustes
            .dispositivos
            .iter()
            .map(|d| DispositivoVisible {
                id: d.huella.chars().take(12).collect(),
                nombre: d.nombre.clone(),
                creado: d.creado,
                visto: d.visto,
            })
            .collect(),
        codigo: g.codigo_visible(Instant::now()).map(|(valor, quedan)| CodigoVisible { valor, quedan }),
    }
}

#[tauri::command(async)]
pub fn movil_estado(state: tauri::State<'_, Movil>) -> EstadoMovil {
    estado(&state)
}

#[tauri::command(async)]
pub fn movil_encender(app: tauri::AppHandle, encendido: bool) -> Result<EstadoMovil, String> {
    let m = app.state::<Movil>();
    {
        let mut g = m.guardia.lock().unwrap();
        g.ajustes.encendido = encendido;
        if !encendido {
            // Apagado, un código a medias no puede seguir valiendo.
            g.codigo = None;
        }
        guardar_ajustes(&g.ajustes)?;
    }
    if encendido {
        arrancar(&app);
    } else {
        m.apagar.store(true, Ordering::SeqCst);
    }
    // Un momento para que el hilo coja (o suelte) el puerto antes de contarlo.
    std::thread::sleep(Duration::from_millis(300));
    Ok(estado(&m))
}

#[tauri::command(async)]
pub fn movil_emparejar(state: tauri::State<'_, Movil>) -> Result<CodigoVisible, String> {
    let mut g = state.guardia.lock().unwrap();
    if !g.ajustes.encendido {
        return Err("Enciende primero el conserje en el móvil.".into());
    }
    let valor = g.nuevo_codigo(Instant::now())?;
    Ok(CodigoVisible { valor, quedan: VIDA_CODIGO.as_secs() })
}

/// El mismo aviso no se manda dos veces en un minuto, aunque la ventana lo pida.
static AVISADOS: Mutex<Vec<(String, Instant)>> = Mutex::new(Vec::new());

/// Un aviso a todos los móviles que los pidieron. Lo llama la ventana con las
/// mismas campanas que el escritorio (`lib/notify.ts`), y el botón de prueba
/// de Ajustes. Devuelve a cuántos se intentó mandar; el envío va aparte, que
/// el servicio de push puede tardar segundos.
#[tauri::command(async)]
pub fn movil_avisar(app: tauri::AppHandle, titulo: String, cuerpo: String, url: Option<String>) -> usize {
    let subs = {
        let m = app.state::<Movil>();
        let g = m.guardia.lock().unwrap();
        g.suscripciones()
    };
    if subs.is_empty() {
        return 0;
    }
    {
        let mut avisados = AVISADOS.lock().unwrap_or_else(|e| e.into_inner());
        let ahora = Instant::now();
        avisados.retain(|(_, cuando)| ahora.duration_since(*cuando) < Duration::from_secs(60));
        let marca = format!("{titulo}\n{cuerpo}");
        if avisados.iter().any(|(m, _)| *m == marca) {
            return 0;
        }
        avisados.push((marca, ahora));
    }
    let url = url.unwrap_or_else(|| "/".into());
    let n = subs.len();
    for (nombre, sub) in subs {
        let app = app.clone();
        let (titulo, cuerpo, url) = (titulo.clone(), cuerpo.clone(), url.clone());
        tauri::async_runtime::spawn(async move {
            match crate::push::enviar(&sub, &titulo, &cuerpo, &url).await {
                Ok(crate::push::Entregado::Si) => {}
                Ok(crate::push::Entregado::Caducada) => {
                    // Ese móvil ya no escucha: se le quita el aviso y lo dirá Ajustes.
                    let m = app.state::<Movil>();
                    let mut g = m.guardia.lock().unwrap();
                    if g.caduco_push(&sub.endpoint) {
                        persistir_de_verdad(&g.ajustes);
                    }
                    crate::anotar(&format!("Móvil: la suscripción de avisos de «{nombre}» caducó; que la vuelva a pedir"));
                }
                Ok(crate::push::Entregado::No(codigo)) => {
                    crate::anotar(&format!("Móvil: el servicio de push de «{nombre}» contestó {codigo}"));
                }
                Err(e) => crate::anotar(&format!("Móvil: no se pudo mandar el aviso a «{nombre}»: {e}")),
            }
        });
    }
    n
}

#[tauri::command(async)]
pub fn movil_olvidar(state: tauri::State<'_, Movil>, id: String) -> Result<EstadoMovil, String> {
    if id.trim().len() < 8 {
        return Err("Ese móvil no se reconoce.".into());
    }
    {
        let mut g = state.guardia.lock().unwrap();
        if g.olvidar(id.trim()) {
            guardar_ajustes(&g.ajustes)?;
        }
    }
    Ok(estado(&state))
}

// ─── Tailscale ──────────────────────────────────────────────────────────────

/// El puerto de Tailscale por el que entra el móvil. No el 443: ahí pudo poner
/// Munir (o un agente) otra cosa con `tailscale serve`, y lo que cuelga del
/// mismo host y puerto comparte origen con esta página, o sea que su JS podría
/// leer la clave del móvil del `localStorage`. Un puerto propio es un origen propio.
pub const PUERTO_TAILSCALE: u16 = 8443;

#[derive(Serialize, Default)]
pub struct Tailscale {
    pub instalado: bool,
    pub conectado: bool,
    /// Que `tailscale serve` de verdad lleva `PUERTO_TAILSCALE` hasta el conserje,
    /// leído de su configuración y no de lo que contestó al pedirlo: sin HTTPS
    /// activado en la cuenta, sale bien y no pone nada.
    pub llevado: bool,
    /// `https://tu-pc.xxxx.ts.net:8443`, si Tailscale dice su nombre.
    pub direccion: Option<String>,
    /// Lo que ya ocupa ese puerto de Tailscale, si no es el conserje: no se pisa.
    pub ajeno: Option<String>,
    /// En Linux, tu usuario no puede tocar `serve` sin ser el operador.
    pub denegado: bool,
    /// Lo que contestó `tailscale serve`, tal cual: si pide activar HTTPS en tu
    /// cuenta, trae el enlace.
    pub salida: String,
}

fn tailscale_exe() -> Option<PathBuf> {
    let nombre = if cfg!(windows) { "tailscale.exe" } else { "tailscale" };
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            let p = dir.join(nombre);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    // Donde lo deja su instalador en Windows: el PATH de una app que ya estaba
    // abierta al instalarlo no se entera.
    if !cfg!(windows) {
        return None;
    }
    let programas = std::env::var_os("ProgramW6432")
        .or_else(|| std::env::var_os("ProgramFiles"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Program Files"));
    Some(programas.join("Tailscale").join("tailscale.exe")).filter(|p| p.is_file())
}

/// Lo que dijo un programa por cada salida, por separado: un aviso en la de
/// errores no tiene que estropear el JSON de la normal.
struct Dijo {
    bien: bool,
    normal: String,
    errores: String,
}

impl Dijo {
    fn todo(&self) -> String {
        format!("{}\n{}", self.normal, self.errores).trim().to_string()
    }
}

/// Lanza, espera con tope y devuelve lo que dijo.
fn correr(exe: &PathBuf, args: &[&str], tope: Duration) -> Result<Dijo, String> {
    let mut hijo = std::process::Command::new(exe)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .sin_ventana()
        .spawn()
        .map_err(|e| format!("no he podido lanzar Tailscale: {e}"))?;
    let mut out = hijo.stdout.take();
    let mut err = hijo.stderr.take();
    let lector_out = std::thread::spawn(move || {
        let mut s = String::new();
        if let Some(o) = out.as_mut() {
            let _ = o.read_to_string(&mut s);
        }
        s
    });
    let lector_err = std::thread::spawn(move || {
        let mut s = String::new();
        if let Some(e) = err.as_mut() {
            let _ = e.read_to_string(&mut s);
        }
        s
    });
    let inicio = Instant::now();
    let bien = loop {
        match hijo.try_wait() {
            Ok(Some(st)) => break st.success(),
            Ok(None) if inicio.elapsed() < tope => std::thread::sleep(Duration::from_millis(100)),
            _ => {
                let _ = hijo.kill();
                let _ = hijo.wait();
                break false;
            }
        }
    };
    Ok(Dijo { bien, normal: lector_out.join().unwrap_or_default(), errores: lector_err.join().unwrap_or_default() })
}

/// Si está conectado y el nombre de este PC en Tailscale, de `tailscale status --json`.
pub fn direccion_de_estado(json_estado: &str) -> (bool, Option<String>) {
    let v: Value = serde_json::from_str(json_estado).unwrap_or(Value::Null);
    let conectado = v["BackendState"].as_str() == Some("Running");
    let dns = v["Self"]["DNSName"].as_str().unwrap_or("").trim_end_matches('.').to_string();
    (conectado, (!dns.is_empty()).then_some(dns))
}

/// Lo que hay puesto en `PUERTO_TAILSCALE`.
#[derive(Debug, Default, PartialEq)]
pub struct Puesto {
    /// La raíz va al conserje.
    pub nuestro: bool,
    /// Lo primero que hay ahí y no es el conserje, como «/ruta → destino».
    pub ajeno: Option<String>,
}

fn es_el_conserje(proxy: &str) -> bool {
    let p = proxy.trim().trim_end_matches('/');
    let p = p.strip_prefix("http://").unwrap_or(p);
    p == format!("127.0.0.1:{PUERTO}") || p == format!("localhost:{PUERTO}") || p == PUERTO.to_string()
}

/// De `tailscale serve status --json`, que es su `ipn.ServeConfig` tal cual:
/// `TCP` va de puerto a qué se hace con él, y `Web` de «nombre:puerto» a sus
/// rutas, cada una con su `Proxy`, `Path` o `Text`.
pub fn en_el_puerto(json_serve: &str) -> Puesto {
    let v: Value = serde_json::from_str(json_serve).unwrap_or(Value::Null);
    let puerto = PUERTO_TAILSCALE.to_string();
    let mut puesto = Puesto::default();
    if let Some(destino) = v["TCP"][&puerto]["TCPForward"].as_str().filter(|d| !d.is_empty()) {
        puesto.ajeno = Some(format!("tcp → {destino}"));
    }
    let sufijo = format!(":{puerto}");
    for (host, web) in v["Web"].as_object().into_iter().flatten() {
        if !host.ends_with(&sufijo) {
            continue;
        }
        for (ruta, h) in web["Handlers"].as_object().into_iter().flatten() {
            let proxy = h["Proxy"].as_str().unwrap_or("");
            if ruta == "/" && es_el_conserje(proxy) {
                puesto.nuestro = true;
            } else if puesto.ajeno.is_none() {
                let que = [proxy, h["Path"].as_str().unwrap_or("")].into_iter().find(|s| !s.is_empty()).unwrap_or("un texto");
                puesto.ajeno = Some(format!("{ruta} → {que}"));
            }
        }
    }
    puesto
}

/// Mira Tailscale y, si se pide, lleva el conserje a tu red con
/// `tailscale serve --bg`. Deja la configuración puesta en Tailscale, no en
/// Adeorq: sobrevive a reinicios y se quita con `tailscale serve --https=8443 off`.
#[tauri::command(async)]
pub fn movil_tailscale(conectar: bool) -> Tailscale {
    let Some(exe) = tailscale_exe() else { return Tailscale::default() };
    let mut t = Tailscale { instalado: true, ..Default::default() };
    let Ok(estado) = correr(&exe, &["status", "--json"], Duration::from_secs(8)) else { return t };
    let (conectado, nombre) = direccion_de_estado(&estado.normal);
    t.conectado = conectado;
    t.direccion = nombre.map(|n| format!("https://{n}:{PUERTO_TAILSCALE}"));
    if !conectado {
        return t;
    }
    let mirar = || {
        correr(&exe, &["serve", "status", "--json"], Duration::from_secs(8))
            .map(|d| en_el_puerto(&d.normal))
            .unwrap_or_default()
    };
    let mut puesto = mirar();
    // Lo que ya ocupa el puerto no se pisa: `serve` lo reemplazaría sin preguntar.
    if conectar && !puesto.nuestro && puesto.ajeno.is_none() {
        let https = format!("--https={PUERTO_TAILSCALE}");
        let destino = format!("http://127.0.0.1:{PUERTO}");
        match correr(&exe, &["serve", "--bg", &https, &destino], Duration::from_secs(20)) {
            Ok(d) => {
                t.salida = d.todo();
                t.denegado = t.salida.to_ascii_lowercase().contains("denied");
                // Sin HTTPS en la cuenta, `serve` se puede quedar esperando a que
                // lo actives, y a los 20 s se le corta sin que haya puesto nada.
                if !d.bien && t.salida.is_empty() {
                    t.salida = "Tailscale no contestó en 20 s.".into();
                }
            }
            Err(e) => t.salida = e,
        }
        puesto = mirar();
    }
    t.llevado = puesto.nuestro;
    t.ajeno = puesto.ajeno;
    t
}

// ─── Pruebas ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[test]
    fn solo_este_pc_o_un_nombre_de_tailscale() {
        for bien in ["127.0.0.1:3013", "localhost:3013", "localhost", "mi-pc.tail1234.ts.net", "Mi-PC.tail1234.TS.NET:443"] {
            assert!(host_valido(bien), "{bien} tenía que valer");
        }
        for mal in ["", "evil.com", "127.0.0.1.evil.com", "ts.net", ".ts.net", "evil.com:3013", "10.0.0.5:3013"] {
            assert!(!host_valido(mal), "{mal} no tenía que valer");
        }
    }

    #[test]
    fn el_origen_tiene_que_ser_el_mismo_sitio() {
        assert!(origen_valido("https://mi-pc.tail1234.ts.net", "mi-pc.tail1234.ts.net"));
        assert!(origen_valido("http://127.0.0.1:3013", "127.0.0.1:3013"));
        assert!(!origen_valido("https://evil.com", "127.0.0.1:3013"));
        assert!(!origen_valido("null", "127.0.0.1:3013"));
    }

    #[test]
    fn un_codigo_bueno_da_una_clave_y_la_clave_abre() {
        let mut g = Guardia::default();
        let t = Instant::now();
        let codigo = g.nuevo_codigo(t).unwrap();
        assert_eq!(codigo.len(), 6);
        let clave = g.emparejar(&codigo, "Mi Android", t, 100).unwrap();
        assert!(clave.len() >= 40, "32 bytes en base64 son 43 letras");
        assert_eq!(g.quien(&clave, 101).map(|(n, _)| n), Some("Mi Android".to_string()));
        assert_eq!(g.quien("otra-clave", 101), None);
        assert!(!g.ajustes.dispositivos[0].huella.contains(&clave), "en disco solo va la huella");
        assert!(g.emparejar(&codigo, "Otro", t, 100).is_err(), "un código sirve una vez");
    }

    #[test]
    fn cinco_fallos_queman_el_codigo_aunque_luego_se_acierte() {
        let mut g = Guardia::default();
        let t = Instant::now();
        let codigo = g.nuevo_codigo(t).unwrap();
        let malo = if codigo == "000000" { "111111" } else { "000000" };
        for _ in 0..INTENTOS {
            assert!(g.emparejar(malo, "x", t, 0).is_err());
        }
        assert!(g.emparejar(&codigo, "x", t, 0).is_err(), "seis cifras no aguantan que se prueben todas");
        assert!(g.ajustes.dispositivos.is_empty());
    }

    #[test]
    fn un_codigo_caducado_no_vale() {
        let mut g = Guardia::default();
        let t = Instant::now();
        let codigo = g.nuevo_codigo(t).unwrap();
        assert!(g.emparejar(&codigo, "x", t + VIDA_CODIGO, 0).is_err());
    }

    #[test]
    fn visto_se_apunta_cada_minuto_y_no_en_cada_peticion() {
        let mut g = Guardia::default();
        let t = Instant::now();
        let codigo = g.nuevo_codigo(t).unwrap();
        let clave = g.emparejar(&codigo, "x", t, 1000).unwrap();
        assert_eq!(g.quien(&clave, 1010).map(|(_, a)| a), Some(false));
        assert_eq!(g.quien(&clave, 1000 + APUNTAR_VISTO).map(|(_, a)| a), Some(true));
    }

    /// Una lectura que suelta los bytes de a poco, como un socket de verdad.
    struct AGotas(Vec<u8>, usize);
    impl Read for AGotas {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            let n = (self.0.len() - self.1).min(7).min(buf.len());
            buf[..n].copy_from_slice(&self.0[self.1..self.1 + n]);
            self.1 += n;
            Ok(n)
        }
    }

    #[test]
    fn la_peticion_se_lee_aunque_llegue_a_trozos() {
        let crudo = b"POST /api/enviar?x=a%20b&y=c+d HTTP/1.1\r\nHost: 127.0.0.1:3013\r\nContent-Length: 11\r\n\r\n{\"id\":\"ab\"}";
        let p = leer_peticion(&mut AGotas(crudo.to_vec(), 0)).unwrap();
        assert_eq!(p.metodo, "POST");
        assert_eq!(p.ruta, "/api/enviar");
        assert_eq!(p.consulta.get("x").map(String::as_str), Some("a b"));
        assert_eq!(p.consulta.get("y").map(String::as_str), Some("c d"));
        assert_eq!(p.cabeceras.get("host").map(String::as_str), Some("127.0.0.1:3013"));
        assert_eq!(p.cuerpo, b"{\"id\":\"ab\"}");
    }

    #[test]
    fn un_por_ciento_raro_no_tumba_el_hilo() {
        assert_eq!(descodificar("a%C3%B1o", false), "año");
        assert_eq!(descodificar("%é", false), "%é");
        assert_eq!(descodificar("100%", false), "100%");
        assert_eq!(descodificar("%zz", false), "%zz");
    }

    #[test]
    fn lo_desmedido_se_corta_antes_de_leerlo() {
        let grande = format!("POST / HTTP/1.1\r\nHost: x\r\nContent-Length: {}\r\n\r\n", TOPE_CUERPO + 1);
        assert_eq!(leer_peticion(&mut AGotas(grande.into_bytes(), 0)).unwrap_err().0, 413);
        let cabecera_eterna = format!("GET / HTTP/1.1\r\nX: {}", "a".repeat(TOPE_CABECERAS + 10));
        assert_eq!(leer_peticion(&mut AGotas(cabecera_eterna.into_bytes(), 0)).unwrap_err().0, 431);
        let troceado = b"POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n";
        assert_eq!(leer_peticion(&mut AGotas(troceado.to_vec(), 0)).unwrap_err().0, 411);
    }

    #[derive(Default)]
    struct CasaDeMentira {
        enviados: RefCell<Vec<Value>>,
        /// Los paneles que tienen terminal.
        abiertos: RefCell<Vec<u32>>,
        /// Para que dos pruebas de decisiones no compartan carpeta: corren a la vez.
        sitio: &'static str,
    }
    impl Casa for CasaDeMentira {
        fn lista(&self) -> Value {
            json!([{ "id": "abc", "titulo": "Una" }])
        }
        fn leer(&self, id: &str) -> Result<Value, String> {
            if id == "abc" { Ok(json!({ "id": "abc", "turnos": [] })) } else { Err("no existe".into()) }
        }
        fn ventana(&self, clase: &str, datos: Value) -> Result<Value, String> {
            if clase == "enviar" || clase == "escribir" {
                self.enviados.borrow_mut().push(datos);
            }
            Ok(json!({ "estados": {} }))
        }
        fn mejorar(&self, texto: &str) -> Result<String, String> {
            Ok(format!("{texto}, mejorado"))
        }
        fn router(&self, _: &str, _: bool) -> Result<(), String> {
            Ok(())
        }
        fn cerebro(&self, _: &str, cerebro: &str) -> Result<(), String> {
            if cerebro == "opus" { Ok(()) } else { Err("no es de la lista".into()) }
        }
        fn fijo(&self, _: &str, modelo: &str) -> Result<(), String> {
            if modelo == "haiku" { Ok(()) } else { Err("no es de la lista".into()) }
        }
        fn parar(&self, _: &str) {}
        fn sesion(&self, _: &str, _: &str) -> Result<Value, String> {
            Ok(json!([{ "rol": "tu", "texto": "hola", "hora": "", "herramientas": [], "pasos": [] }]))
        }
        fn adjuntos(&self) -> Result<PathBuf, String> {
            let dir = std::env::temp_dir().join("adeorq-movil-adjuntos");
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            Ok(dir)
        }
        fn decisiones(&self) -> Result<PathBuf, String> {
            Ok(std::env::temp_dir().join(format!("adeorq-movil-decisiones-{}{}", std::process::id(), self.sitio)))
        }
        fn arranque(&self) -> u64 {
            77
        }
        fn paneles_abiertos(&self) -> Vec<u32> {
            self.abiertos.borrow().clone()
        }
    }

    /// Una decisión de un agente se lista, se lee, se contesta una vez desde un
    /// móvil emparejado y su respuesta se teclea en la terminal que preguntó;
    /// de otro arranque, no se teclea en ninguna.
    #[test]
    fn el_chat_que_no_cambia_no_se_vuelve_a_mandar() {
        let (g, clave) = emparejada();
        let casa = CasaDeMentira::default();
        let nada = |_: &Ajustes| {};
        let reloj = (Instant::now(), 10);
        let c = Some(clave.as_str());
        let leer = |ruta: &str| {
            let r = atender(&pedir("GET", ruta, c, ""), &g, &casa, &nada, reloj);
            assert_eq!(r.estado, 200);
            serde_json::from_slice::<Value>(&r.cuerpo).unwrap()
        };
        // Sin `si`, como siempre: la lista de turnos (la vista de solo leer).
        assert_eq!(leer("/api/sesion?cwd=C:%5Cp&id=s1")[0]["texto"], "hola");
        // Con `si` vacío, los turnos con su firma; con esa firma, solo «igual».
        let primera = leer("/api/sesion?cwd=C:%5Cp&id=s1&si=");
        let firma = primera["firma"].as_str().unwrap().to_owned();
        assert_eq!(primera["turnos"][0]["texto"], "hola");
        let segunda = leer(&format!("/api/sesion?cwd=C:%5Cp&id=s1&si={firma}"));
        assert_eq!(segunda, json!({ "firma": firma, "igual": true }));
        assert!(serde_json::to_vec(&segunda).unwrap().len() < 64, "lo que viaja cuando nada cambia");
        // Una firma vieja trae los turnos otra vez.
        assert!(leer("/api/sesion?cwd=C:%5Cp&id=s1&si=0000000000000000")["turnos"].is_array());
    }

    #[test]
    fn una_decision_se_contesta_desde_el_movil_y_vuelve_a_su_terminal() {
        let (g, clave) = emparejada();
        let casa = CasaDeMentira::default();
        let nada = |_: &Ajustes| {};
        let reloj = (Instant::now(), 10);
        let c = Some(clave.as_str());
        let dir = casa.decisiones().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        let pedido: crate::decisiones::Pedido = serde_json::from_value(json!({
            "titulo": "Diseño", "panel": 4,
            "preguntas": [{ "titulo": "La barra", "opciones": [{ "texto": "Como está" }, { "texto": "La de la portada", "recomendada": true }] }]
        }))
        .unwrap();
        let d = crate::decisiones::crear(&dir, crate::decisiones::validar(&pedido, 5000, 77).unwrap()).unwrap();
        let mut viejo = pedido.clone();
        viejo.titulo = "De ayer".into();
        let ayer = crate::decisiones::crear(&dir, crate::decisiones::validar(&viejo, 4000, 12).unwrap()).unwrap();

        assert_eq!(atender(&pedir("GET", "/api/decisiones", None, ""), &g, &casa, &nada, reloj).estado, 401);
        let lista = cuerpo_de(&atender(&pedir("GET", "/api/decisiones", c, ""), &g, &casa, &nada, reloj));
        assert_eq!(lista["decisiones"].as_array().unwrap().len(), 2);
        let una = atender(&pedir("GET", &format!("/api/decision?id={}", d.id), c, ""), &g, &casa, &nada, reloj);
        assert_eq!(cuerpo_de(&una)["preguntas"][0]["opciones"][1]["recomendada"], true);
        assert_eq!(atender(&pedir("GET", "/api/decision?id=../movil", c, ""), &g, &casa, &nada, reloj).estado, 404);

        let responde = |id: &str, n: u64| {
            let cuerpo = json!({ "id": id, "elecciones": { "A": { "opcion": n } } }).to_string();
            atender(&pedir("POST", "/api/decision/responder", c, &cuerpo), &g, &casa, &nada, reloj)
        };
        assert_eq!(responde(&d.id, 9).estado, 400, "una opción que no existe");
        let r = responde(&d.id, 2);
        assert_eq!((r.estado, cuerpo_de(&r)["entregada"].clone()), (200, json!(true)));
        let escrito = casa.enviados.borrow().last().cloned().unwrap();
        assert_eq!(escrito["panel"], 4);
        assert!(escrito["texto"].as_str().unwrap().contains("opción 2, «La de la portada»"));
        assert_eq!(responde(&d.id, 1).estado, 409, "contestada no se vuelve a contestar");
        // La de otro arranque se guarda, pero no se teclea en el panel 4 de hoy.
        let antes = casa.enviados.borrow().len();
        let r = responde(&ayer.id, 1);
        assert_eq!((r.estado, cuerpo_de(&r)["entregada"].clone()), (200, json!(false)));
        assert_eq!(casa.enviados.borrow().len(), antes);
        assert_eq!(atender(&pedir("GET", "/api/decision/responder", c, ""), &g, &casa, &nada, reloj).estado, 405);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Cada decisión dice si alguien la espera todavía: la de una terminal
    /// abierta sí, la de una cerrada o de otro arranque no. Descartarla la
    /// quita de en medio, y solo a la que seguía esperando se le avisa.
    #[test]
    fn una_decision_dice_si_sigue_viva_y_se_puede_descartar() {
        let (g, clave) = emparejada();
        let casa = CasaDeMentira { sitio: "-vigencia", ..Default::default() };
        casa.abiertos.borrow_mut().push(4);
        let nada = |_: &Ajustes| {};
        let reloj = (Instant::now(), 10);
        let c = Some(clave.as_str());
        let dir = casa.decisiones().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        let pedir_una = |titulo: &str, panel: u32, ahora: u64, arranque: u64| {
            let pedido: crate::decisiones::Pedido = serde_json::from_value(json!({
                "titulo": titulo, "panel": panel,
                "preguntas": [{ "titulo": "¿Cuál?", "opciones": [{ "texto": "Una" }, { "texto": "Otra" }] }]
            }))
            .unwrap();
            crate::decisiones::crear(&dir, crate::decisiones::validar(&pedido, ahora, arranque).unwrap()).unwrap()
        };
        let viva = pedir_una("Me espera", 4, 5000, 77);
        let cerrada = pedir_una("Su terminal se cerró", 9, 4000, 77);
        let de_ayer = pedir_una("De otro arranque", 4, 3000, 12);

        let vigencias = || {
            let lista = cuerpo_de(&atender(&pedir("GET", "/api/decisiones", c, ""), &g, &casa, &nada, reloj));
            lista["decisiones"]
                .as_array()
                .unwrap()
                .iter()
                .map(|d| format!("{}={}", d["titulo"].as_str().unwrap(), d["vigencia"].as_str().unwrap()))
                .collect::<Vec<_>>()
        };
        assert_eq!(vigencias(), ["Me espera=viva", "Su terminal se cerró=huerfana", "De otro arranque=huerfana"]);
        let una = cuerpo_de(&atender(&pedir("GET", &format!("/api/decision?id={}", cerrada.id), c, ""), &g, &casa, &nada, reloj));
        assert_eq!((una["vigencia"].clone(), una["titulo"].clone()), (json!("huerfana"), json!("Su terminal se cerró")));

        let descarta = |id: &str| {
            atender(&pedir("POST", "/api/decision/descartar", c, &json!({ "id": id }).to_string()), &g, &casa, &nada, reloj)
        };
        assert_eq!(atender(&pedir("POST", "/api/decision/descartar", None, "{}"), &g, &casa, &nada, reloj).estado, 401);
        assert_eq!(descarta("d999").estado, 404);
        // La huérfana se va sin escribir en ninguna terminal: el panel 4 de hoy es otra.
        let r = descarta(&de_ayer.id);
        assert_eq!((r.estado, cuerpo_de(&r)["avisada"].clone()), (200, json!(false)));
        assert!(casa.enviados.borrow().is_empty());
        // A la que seguía esperando se le dice, para que el agente no se quede colgado.
        let r = descarta(&viva.id);
        assert_eq!((r.estado, cuerpo_de(&r)["avisada"].clone()), (200, json!(true)));
        let escrito = casa.enviados.borrow().last().cloned().unwrap();
        assert_eq!(escrito["panel"], 4);
        assert!(escrito["texto"].as_str().unwrap().contains("ha descartado la decisión «Me espera»"));
        assert_eq!(descarta(&viva.id).estado, 200, "descartar dos veces no es un error");
        assert_eq!(casa.enviados.borrow().len(), 1, "y no se le avisa otra vez");
        assert_eq!(vigencias(), ["Su terminal se cerró=huerfana", "Me espera=descartada", "De otro arranque=descartada"]);
        // Una descartada ya no se contesta, y una contestada ya no se descarta.
        let responde = |id: &str| {
            let cuerpo = json!({ "id": id, "elecciones": { "A": { "opcion": 1 } } }).to_string();
            atender(&pedir("POST", "/api/decision/responder", c, &cuerpo), &g, &casa, &nada, reloj)
        };
        assert_eq!(responde(&viva.id).estado, 400);
        assert_eq!(responde(&cerrada.id).estado, 200);
        assert_eq!(descarta(&cerrada.id).estado, 409);
        assert_eq!(atender(&pedir("GET", "/api/decision/descartar", c, ""), &g, &casa, &nada, reloj).estado, 405);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Una foto en tres trozos llega entera y con su nombre limpio; un trozo
    /// fuera de orden, sin clave o desmedido no cose nada.
    #[test]
    fn un_adjunto_llega_a_trozos_y_solo_emparejado() {
        use base64::Engine;
        let (g, clave) = emparejada();
        let casa = CasaDeMentira::default();
        let nada = |_: &Ajustes| {};
        let reloj = (Instant::now(), 10);
        let c = Some(clave.as_str());
        let foto: Vec<u8> = (0..100_000u32).map(|i| (i % 251) as u8).collect();
        let trozos: Vec<&[u8]> = foto.chunks(TROZO_ADJUNTO).collect();
        let trozo = |i: usize, id: &str| {
            json!({
                "id": id, "nombre": "../Foto del móvil.JPG", "parte": i, "total": trozos.len(),
                "datos": base64::engine::general_purpose::STANDARD.encode(trozos[i]),
            })
            .to_string()
        };
        assert_eq!(atender(&pedir("POST", "/api/adjuntar", None, &trozo(0, "f1")), &g, &casa, &nada, reloj).estado, 401);
        assert_eq!(atender(&pedir("POST", "/api/adjuntar", c, &trozo(1, "f1")), &g, &casa, &nada, reloj).estado, 400, "sin empezar");
        let mut ruta = Value::Null;
        for i in 0..trozos.len() {
            let r = atender(&pedir("POST", "/api/adjuntar", c, &trozo(i, "f1")), &g, &casa, &nada, reloj);
            assert_eq!(r.estado, 200);
            ruta = cuerpo_de(&r)["ruta"].clone();
            assert_eq!(ruta.is_string(), i == trozos.len() - 1, "la ruta solo con el último");
        }
        let ruta = PathBuf::from(ruta.as_str().unwrap());
        assert_eq!(std::fs::read(&ruta).unwrap(), foto);
        let nombre = ruta.file_name().unwrap().to_string_lossy().into_owned();
        assert!(nombre.starts_with("movil-") && nombre.ends_with("-Foto_del_m_vil.JPG"), "{nombre}");
        assert_eq!(ruta.parent().unwrap(), casa.adjuntos().unwrap());
        std::fs::remove_file(&ruta).unwrap();

        // Fuera de orden: el 2 sin el 1.
        assert_eq!(atender(&pedir("POST", "/api/adjuntar", c, &trozo(0, "f2")), &g, &casa, &nada, reloj).estado, 200);
        assert_eq!(atender(&pedir("POST", "/api/adjuntar", c, &trozo(2, "f2")), &g, &casa, &nada, reloj).estado, 400);
        // Un trozo mayor que el tope no se acepta, ni un id con ruta dentro.
        let gordo = json!({ "id": "f3", "nombre": "x", "parte": 0, "total": 1,
            "datos": base64::engine::general_purpose::STANDARD.encode(vec![1u8; TROZO_ADJUNTO + 1]) }).to_string();
        assert_eq!(atender(&pedir("POST", "/api/adjuntar", c, &gordo), &g, &casa, &nada, reloj).estado, 400);
        assert_eq!(atender(&pedir("POST", "/api/adjuntar", c, &trozo(0, "../f4")), &g, &casa, &nada, reloj).estado, 400);
        assert_eq!(atender(&pedir("GET", "/api/adjuntar", c, ""), &g, &casa, &nada, reloj).estado, 405);
        // Y el JSON de un trozo cabe en el tope del cuerpo.
        assert!(trozo(0, "f5").len() < TOPE_CUERPO);
    }

    /// La página y el servidor dicen lo mismo: el tamaño del trozo, y la única
    /// dirección con la que la página habla cuando va dentro del panel.
    #[test]
    fn la_pagina_y_el_servidor_dicen_lo_mismo() {
        assert!(PAGINA.contains(&format!("const TROZO = {TROZO_ADJUNTO};")));
        assert!(PAGINA.contains(&format!("const PANEL = \"{PANEL_DE_MUNIR}\";")));
    }

    /// Las tres listas de teclas dicen lo mismo: lo que deja pasar el servidor,
    /// lo que pone los bytes en la ventana (src/lib/movil.ts) y los botones de
    /// la página. Una tecla en una sola de ellas es un botón que da error.
    #[test]
    fn las_teclas_del_movil_estan_en_los_tres_sitios() {
        let ventana = include_str!("../../src/lib/movil.ts");
        for t in TECLAS_DEL_MOVIL {
            assert!(ventana.contains(&format!("\"{t}\":")) || ventana.contains(&format!(" {t}:")), "{t} en movil.ts");
            assert!(PAGINA.contains(&format!("data-tecla=\"{t}\"")), "{t} en la página");
        }
    }

    /// Instalada como app: el manifiesto apunta a un PNG que existe, sin clave,
    /// y la página lo enlaza también para el iPhone.
    #[test]
    fn se_instala_con_el_icono_de_adeorq() {
        let g = Mutex::new(Guardia::default());
        let casa = CasaDeMentira::default();
        let nada = |_: &Ajustes| {};
        let reloj = (Instant::now(), 10);
        let m: Value = serde_json::from_str(MANIFIESTO).unwrap();
        assert_eq!(m["name"], "Adeorq");
        let ruta = m["icons"][0]["src"].as_str().unwrap();
        let r = atender(&pedir("GET", ruta, None, ""), &g, &casa, &nada, reloj);
        assert_eq!((r.estado, r.tipo), (200, "image/png"));
        assert!(r.cuerpo.starts_with(b"\x89PNG"));
        assert!(PAGINA.contains(&format!("rel=\"apple-touch-icon\" href=\"{ruta}\"")));
    }

    #[test]
    fn el_nombre_de_un_adjunto_no_lleva_rutas() {
        assert_eq!(nombre_de_adjunto("..\\..\\Windows\\win.ini"), "Windows_win.ini");
        assert_eq!(nombre_de_adjunto(".bashrc"), "bashrc");
        assert_eq!(nombre_de_adjunto(""), "adjunto");
        assert_eq!(nombre_de_adjunto("captura 2026-10-08.png"), "captura_2026-10-08.png");
        assert_eq!(nombre_de_adjunto(&format!("{}.pdf", "a".repeat(200))).len(), 48 + 4);
    }

    fn pedir(metodo: &str, ruta: &str, clave: Option<&str>, cuerpo: &str) -> Peticion {
        let (ruta, consulta) = ruta.split_once('?').unwrap_or((ruta, ""));
        let mut cabeceras = HashMap::new();
        cabeceras.insert("host".into(), "127.0.0.1:3013".into());
        if let Some(c) = clave {
            cabeceras.insert("authorization".into(), format!("Bearer {c}"));
        }
        Peticion {
            metodo: metodo.into(),
            ruta: ruta.into(),
            consulta: consulta_de(consulta),
            cabeceras,
            cuerpo: cuerpo.as_bytes().to_vec(),
        }
    }

    /// Una guardia con un móvil ya emparejado, y su clave.
    fn emparejada() -> (Mutex<Guardia>, String) {
        let mut g = Guardia::default();
        let t = Instant::now();
        let c = g.nuevo_codigo(t).unwrap();
        let clave = g.emparejar(&c, "Pixel", t, 0).unwrap();
        (Mutex::new(g), clave)
    }

    fn cuerpo_de(r: &Respuesta) -> Value {
        serde_json::from_slice(&r.cuerpo).unwrap_or(Value::Null)
    }

    /// Las terminales desde el móvil (decisión E3): la lista y la pantalla van
    /// a la ventana; escribir exige texto y un panel; las teclas, solo las de
    /// la lista; y todo, solo con un móvil emparejado.
    #[test]
    fn las_terminales_se_escriben_solo_emparejado_y_con_forma() {
        let (g, clave) = emparejada();
        let casa = CasaDeMentira::default();
        let nada = |_: &Ajustes| {};
        let reloj = (Instant::now(), 10);
        let c = Some(clave.as_str());
        assert_eq!(atender(&pedir("GET", "/api/terminales", None, ""), &g, &casa, &nada, reloj).estado, 401);
        assert_eq!(atender(&pedir("POST", "/api/terminal/escribir", None, r#"{"panel":1,"texto":"hola"}"#), &g, &casa, &nada, reloj).estado, 401);
        assert_eq!(atender(&pedir("GET", "/api/terminales", c, ""), &g, &casa, &nada, reloj).estado, 200);
        assert_eq!(atender(&pedir("GET", "/api/terminal?panel=3", c, ""), &g, &casa, &nada, reloj).estado, 200);
        assert_eq!(atender(&pedir("GET", "/api/terminal?panel=x", c, ""), &g, &casa, &nada, reloj).estado, 400);
        assert_eq!(atender(&pedir("GET", "/api/terminal", c, ""), &g, &casa, &nada, reloj).estado, 400);
        assert_eq!(atender(&pedir("POST", "/api/terminal/escribir", c, r#"{"panel":1,"texto":"  "}"#), &g, &casa, &nada, reloj).estado, 400);
        assert_eq!(atender(&pedir("POST", "/api/terminal/escribir", c, r#"{"texto":"hola"}"#), &g, &casa, &nada, reloj).estado, 400);
        let largo = format!(r#"{{"panel":1,"texto":"{}"}}"#, "a".repeat(TOPE_TEXTO + 1));
        assert_eq!(atender(&pedir("POST", "/api/terminal/escribir", c, &largo), &g, &casa, &nada, reloj).estado, 413);
        assert_eq!(atender(&pedir("POST", "/api/terminal/escribir", c, r#"{"panel":1,"texto":"sí, adelante"}"#), &g, &casa, &nada, reloj).estado, 202);
        assert_eq!(atender(&pedir("POST", "/api/terminal/tecla", c, r#"{"panel":1,"tecla":"ctrl+c"}"#), &g, &casa, &nada, reloj).estado, 202);
        assert_eq!(atender(&pedir("POST", "/api/terminal/tecla", c, r#"{"panel":1,"tecla":"ctrl+z"}"#), &g, &casa, &nada, reloj).estado, 400);
        // El cambio de modo de Claude Code y las flechas de los menús, sí.
        for t in ["shift+tab", "arriba", "abajo"] {
            let cuerpo = format!(r#"{{"panel":1,"tecla":"{t}"}}"#);
            assert_eq!(atender(&pedir("POST", "/api/terminal/tecla", c, &cuerpo), &g, &casa, &nada, reloj).estado, 202, "{t}");
        }
        assert_eq!(atender(&pedir("GET", "/api/terminal/escribir", c, ""), &g, &casa, &nada, reloj).estado, 405, "con el método que no es, 405 y no 404");
    }

    #[test]
    fn sin_clave_no_hay_conserje() {
        let (g, clave) = emparejada();
        let casa = CasaDeMentira::default();
        let nada = |_: &Ajustes| {};
        let reloj = (Instant::now(), 10);
        assert_eq!(atender(&pedir("GET", "/", None, ""), &g, &casa, &nada, reloj).estado, 200, "la página sí");
        assert_eq!(atender(&pedir("GET", "/api/lista", None, ""), &g, &casa, &nada, reloj).estado, 401);
        assert_eq!(atender(&pedir("GET", "/api/lista", Some("inventada"), ""), &g, &casa, &nada, reloj).estado, 401);
        let r = atender(&pedir("GET", "/api/lista", Some(&clave), ""), &g, &casa, &nada, reloj);
        assert_eq!(r.estado, 200);
        assert_eq!(cuerpo_de(&r)[0]["id"], "abc");
    }

    #[test]
    fn un_host_o_un_origen_ajeno_se_rechaza_antes_de_nada() {
        let (g, clave) = emparejada();
        let casa = CasaDeMentira::default();
        let nada = |_: &Ajustes| {};
        let mut p = pedir("POST", "/api/enviar", Some(&clave), r#"{"id":"abc","texto":"hola"}"#);
        p.cabeceras.insert("host".into(), "atacante.com".into());
        assert_eq!(atender(&p, &g, &casa, &nada, (Instant::now(), 0)).estado, 421);
        let mut p = pedir("POST", "/api/enviar", Some(&clave), r#"{"id":"abc","texto":"hola"}"#);
        p.cabeceras.insert("origin".into(), "https://atacante.com".into());
        assert_eq!(atender(&p, &g, &casa, &nada, (Instant::now(), 0)).estado, 403);
        assert!(casa.enviados.borrow().is_empty(), "no llegó nada a la ventana");
    }

    #[test]
    fn enviar_llega_a_la_ventana_con_lo_escrito() {
        let (g, clave) = emparejada();
        let casa = CasaDeMentira::default();
        let nada = |_: &Ajustes| {};
        let reloj = (Instant::now(), 0);
        let r = atender(&pedir("POST", "/api/enviar", Some(&clave), r#"{"id":"abc","texto":"  abre el radar  "}"#), &g, &casa, &nada, reloj);
        assert_eq!(r.estado, 202);
        assert_eq!(casa.enviados.borrow()[0]["texto"], "abre el radar");
        assert_eq!(atender(&pedir("POST", "/api/enviar", Some(&clave), r#"{"id":"abc","texto":"  "}"#), &g, &casa, &nada, reloj).estado, 400);
        assert_eq!(atender(&pedir("POST", "/api/enviar", Some(&clave), r#"{"id":"../x","texto":"hola"}"#), &g, &casa, &nada, reloj).estado, 400);
        assert_eq!(atender(&pedir("GET", "/api/enviar", Some(&clave), ""), &g, &casa, &nada, reloj).estado, 405);
        assert_eq!(atender(&pedir("GET", "/api/otra", Some(&clave), ""), &g, &casa, &nada, reloj).estado, 404);
    }

    #[test]
    fn el_modelo_del_conserje_se_elige_tambien_desde_el_movil() {
        let (g, clave) = emparejada();
        let casa = CasaDeMentira::default();
        let nada = |_: &Ajustes| {};
        let reloj = (Instant::now(), 0);
        let bien = atender(&pedir("POST", "/api/cerebro", Some(&clave), r#"{"id":"abc","cerebro":"opus"}"#), &g, &casa, &nada, reloj);
        assert_eq!(bien.estado, 200);
        let mal = atender(&pedir("POST", "/api/cerebro", Some(&clave), r#"{"id":"abc","cerebro":"gpt"}"#), &g, &casa, &nada, reloj);
        assert_eq!(mal.estado, 400, "lo que no es de la lista se dice, no se calla");
        assert_eq!(atender(&pedir("POST", "/api/cerebro", None, r#"{"id":"abc","cerebro":"opus"}"#), &g, &casa, &nada, reloj).estado, 401);
    }

    #[test]
    fn emparejar_por_la_red_guarda_el_movil() {
        let g = Mutex::new(Guardia::default());
        let codigo = g.lock().unwrap().nuevo_codigo(Instant::now()).unwrap();
        let casa = CasaDeMentira::default();
        let guardados = RefCell::new(0);
        let contar = |_: &Ajustes| *guardados.borrow_mut() += 1;
        let r = atender(
            &pedir("POST", "/api/emparejar", None, &format!(r#"{{"codigo":"{codigo}","nombre":"Pixel"}}"#)),
            &g,
            &casa,
            &contar,
            (Instant::now(), 0),
        );
        assert_eq!(r.estado, 200);
        let clave = cuerpo_de(&r)["clave"].as_str().unwrap().to_string();
        assert_eq!(*guardados.borrow(), 1, "se guarda al emparejar");
        let yo = atender(&pedir("GET", "/api/yo", Some(&clave), ""), &g, &casa, &contar, (Instant::now(), 0));
        assert_eq!(cuerpo_de(&yo)["nombre"], "Pixel");
    }

    /// Con un socket de verdad: lo que ve `tailscale serve`.
    #[test]
    fn por_un_socket_de_verdad() {
        let escucha = TcpListener::bind("127.0.0.1:0").unwrap();
        let puerto = escucha.local_addr().unwrap().port();
        let (g, clave) = emparejada();
        let hilo = std::thread::spawn(move || {
            let casa = CasaDeMentira::default();
            for _ in 0..2 {
                let (s, _) = escucha.accept().unwrap();
                servir_conexion(s, &g, &casa, &|_| {});
            }
        });
        let pide = |crudo: String| {
            let mut s = TcpStream::connect(("127.0.0.1", puerto)).unwrap();
            s.write_all(crudo.as_bytes()).unwrap();
            let mut fuera = String::new();
            s.read_to_string(&mut fuera).unwrap();
            fuera
        };
        let pagina = pide(format!("GET / HTTP/1.1\r\nHost: 127.0.0.1:{puerto}\r\n\r\n"));
        assert!(pagina.starts_with("HTTP/1.1 200"), "{pagina:.80}");
        assert!(pagina.contains("Content-Security-Policy"));
        assert!(pagina.contains("<title>Adeorq</title>"), "sale la página del móvil");
        // En un marco, solo dentro del panel de Munir, y nada de X-Frame-Options,
        // que con DENY lo bloquearía también ahí.
        assert!(pagina.contains(&format!("frame-ancestors 'self' {PANEL_DE_MUNIR};")));
        assert!(!pagina.contains("X-Frame-Options"));
        let lista = pide(format!(
            "GET /api/lista HTTP/1.1\r\nHost: 127.0.0.1:{puerto}\r\nAuthorization: Bearer {clave}\r\n\r\n"
        ));
        assert!(lista.starts_with("HTTP/1.1 200"), "{lista:.80}");
        assert!(lista.contains("X-Frame-Options: DENY"));
        assert!(lista.ends_with(r#"[{"id":"abc","titulo":"Una"}]"#));
        hilo.join().unwrap();
    }

    /// Quien manda la petición de byte en byte, sin acabarla nunca. Con el plazo
    /// solo por lectura (lo de antes) cada byte lo renueva y el hilo no se
    /// suelta; con el plazo de la petición entera se suelta a su hora.
    #[test]
    fn una_peticion_a_cuentagotas_suelta_el_hilo_a_su_hora() {
        let escucha = TcpListener::bind("127.0.0.1:0").unwrap();
        let puerto = escucha.local_addr().unwrap().port();
        let gotero = |dura: Duration| {
            std::thread::spawn(move || {
                let mut s = TcpStream::connect(("127.0.0.1", puerto)).unwrap();
                let inicio = Instant::now();
                while inicio.elapsed() < dura && s.write_all(b"G").is_ok() {
                    std::thread::sleep(Duration::from_millis(100));
                }
            })
        };

        // Lo de antes: plazo de 500 ms por lectura, y a los dos segundos sigue leyendo.
        let g = gotero(Duration::from_millis(2500));
        let (s, _) = escucha.accept().unwrap();
        s.set_read_timeout(Some(Duration::from_millis(500))).unwrap();
        let inicio = Instant::now();
        let _ = leer_peticion(&mut &s);
        assert!(inicio.elapsed() >= Duration::from_secs(2), "el plazo por lectura no lo corta");
        g.join().unwrap();

        // Lo de ahora: 500 ms para la petición entera.
        let g = gotero(Duration::from_millis(2500));
        let (s, _) = escucha.accept().unwrap();
        let inicio = Instant::now();
        let r = leer_peticion(&mut ConPlazo { s: &s, hasta: Instant::now() + Duration::from_millis(500) });
        assert!(inicio.elapsed() < Duration::from_millis(1200), "tardó {:?}", inicio.elapsed());
        assert_eq!(r.err().map(|(estado, _)| estado), Some(408));
        drop(s);
        g.join().unwrap();
    }

    #[test]
    fn la_direccion_sale_del_estado_de_tailscale() {
        let estado = r#"{"BackendState":"Running","Self":{"DNSName":"mi-pc.tail1234.ts.net.","HostName":"mi-pc"}}"#;
        assert_eq!(direccion_de_estado(estado), (true, Some("mi-pc.tail1234.ts.net".into())));
        assert_eq!(direccion_de_estado(r#"{"BackendState":"NeedsLogin","Self":{"DNSName":""}}"#), (false, None));
        assert_eq!(direccion_de_estado("no es json"), (false, None));
    }

    /// Que Windows de verdad apunta la petición: se le pregunta su estado con
    /// `CallNtPowerInformation`, que es lo que mira para decidir si se duerme.
    #[cfg(windows)]
    #[test]
    fn con_el_movil_encendido_windows_sabe_que_no_debe_dormirse() {
        use windows_sys::Win32::System::Power::{CallNtPowerInformation, SystemExecutionState, ES_SYSTEM_REQUIRED};
        let estado = || {
            let mut e: u32 = 0;
            let r = unsafe {
                CallNtPowerInformation(SystemExecutionState, std::ptr::null(), 0, (&mut e as *mut u32).cast(), 4)
            };
            assert_eq!(r, 0, "CallNtPowerInformation falló");
            e
        };
        std::thread::spawn(move || {
            assert!(no_dormir(true), "Windows rechazó la petición");
            assert_ne!(estado() & ES_SYSTEM_REQUIRED, 0, "con la petición puesta, el sistema tiene que estar requerido");
            assert!(!no_dormir(false));
        })
        .join()
        .unwrap();
    }

    /// Con la forma de `ipn.ServeConfig` (tailscale/ipn/serve.go): lo que vale
    /// es lo que está PUESTO, no lo que contestó `serve` al pedírselo.
    #[test]
    fn se_sabe_si_el_conserje_esta_puesto_y_si_hay_otra_cosa_en_su_puerto() {
        let puesto = |web: &str| en_el_puerto(&format!(r#"{{"TCP":{{"8443":{{"HTTPS":true}}}},"Web":{web}}}"#));
        // Sin HTTPS activado en la cuenta, `serve` contesta y no pone nada.
        assert_eq!(en_el_puerto("null"), Puesto::default());
        assert_eq!(en_el_puerto("{}"), Puesto::default());
        assert_eq!(
            puesto(r#"{"mi-pc.tail1234.ts.net:8443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:3013"}}}}"#),
            Puesto { nuestro: true, ajeno: None }
        );
        // Lo que Munir tuviera en el 443 no es asunto del conserje.
        assert_eq!(
            puesto(r#"{"mi-pc.tail1234.ts.net:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:5173"}}},
                      "mi-pc.tail1234.ts.net:8443":{"Handlers":{"/":{"Proxy":"http://localhost:3013/"}}}}"#),
            Puesto { nuestro: true, ajeno: None }
        );
        // Otra cosa en su puerto: no se pisa, y si comparte origen se avisa.
        assert_eq!(
            puesto(r#"{"mi-pc.tail1234.ts.net:8443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:5173"}}}}"#),
            Puesto { nuestro: false, ajeno: Some("/ → http://127.0.0.1:5173".into()) }
        );
        assert_eq!(
            puesto(r#"{"mi-pc.tail1234.ts.net:8443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:3013"},"/docs":{"Path":"C:\\web"}}}}"#),
            Puesto { nuestro: true, ajeno: Some("/docs → C:\\web".into()) }
        );
        assert_eq!(
            en_el_puerto(r#"{"TCP":{"8443":{"TCPForward":"127.0.0.1:22"}}}"#),
            Puesto { nuestro: false, ajeno: Some("tcp → 127.0.0.1:22".into()) }
        );
    }
}
