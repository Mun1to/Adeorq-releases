// El escudo, la parte de Adeorq: la ventana que pide la verificación, la firma
// con Windows Hello, la lista de cambios y el vigilante.
//
// El CONTRATO con las otras dos piezas (el gancho que corre en cada herramienta
// del agente y la instalación) está en `docs/contexto/escudo.md`: el protocolo,
// el mensaje que se firma y dónde vive cada cosa. Se lee entero antes de tocar
// esto, y lo que se cambie aquí que lo toque se cambia allí primero y se avisa
// en el `BUZON.md`.
//
// Cómo va una petición, de punta a punta:
//
//   1. El gancho manda una línea por el puerto del MCP: `{"adeorq":"escudo",…}`
//      (la rama de `mcp.rs`, copiada de la de `secreto`). Se acusa enseguida.
//   2. `atender` la valida (tipo, hora, plazo, nonce), mira el tope (una ventana
//      a la vez; tres «no» seguidos de una terminal la callan diez minutos) y
//      emite `escudo-pedido` para la ventana (`EscudoVentana.tsx`).
//   3. Munir pone su PIN (`escudo_firmar`: firma Windows Hello, y la firma se
//      queda aquí, no va al front) y, en el rojo y si tiene ese paso puesto, la
//      respuesta a su pregunta (`escudo_comprobar`, contra su huella argon2id).
//   4. Con todo bien, la firma vuelve por el socket: `{"ok":true,"firma":…}`.
//
// La pregunta es fricción contra aprobar sin mirar, no criptografía: lo que un
// agente no puede falsificar es la firma del PIN. Por eso el PIN va siempre y la
// pregunta se enciende aparte (Munir, 2026-11-08: «quitar la contraseña de
// Adeorq… yo solo quiero el del pin del sistema de momento»).

pub mod hello;
pub mod lista;
pub mod vigilante;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::pedir_secreto::QuienPide;

/// Lo que espera la ventana a que Munir conteste.
const ESPERA: Duration = Duration::from_secs(300);
/// Lo más que puede estar la hora de la petición de la de este equipo.
const DESFASE_MAX_MS: i64 = 2 * 60 * 1000;
/// Lo que vale un permiso rojo (decisión B1) y uno de PIN (decisión E; 10 minutos
/// desde el 2026-11-07, para que un despliegue que falla y se repite no pida otro).
const PLAZO_ROJO_MS: i64 = 30 * 60 * 1000;
const PLAZO_PIN_MS: i64 = 10 * 60 * 1000;
/// Tres «no» seguidos de la misma terminal en diez minutos la callan diez
/// minutos: contra cansar a Munir a base de ventanas.
const RECHAZOS_PARA_CALLAR: usize = 3;
const VENTANA_DE_RECHAZOS_MS: u64 = 10 * 60 * 1000;
const CALLADA_MS: u64 = 10 * 60 * 1000;
/// Fallos de respuesta en una misma ventana antes de cerrarla.
const FALLOS_MAX: u32 = 3;
/// Lo más del cambio que se enseña. Lo demás se dice que sigue.
const DIFF_MAX: usize = 20_000;

/// La carpeta del escudo: `%LOCALAPPDATA%\Adeorq\escudo`. Que exista es lo que
/// enciende la pieza (decisión F1): la crea `node escudo/instalar.mjs --preparar`.
pub fn carpeta() -> Result<PathBuf, String> {
    #[cfg(test)]
    if let Some(p) = pruebas::CARPETA.lock().unwrap_or_else(|e| e.into_inner()).clone() {
        return Ok(p);
    }
    Ok(crate::dir_datos()?.join("escudo"))
}

pub fn instalado() -> bool {
    carpeta().is_ok_and(|c| c.is_dir())
}

fn ruta_verificacion() -> Result<PathBuf, String> {
    Ok(carpeta()?.join("verificacion.json"))
}

/// Los pasos de la roja además del PIN, que va siempre. En la carpeta del
/// escudo, donde el gancho no deja escribir a ningún agente.
fn ruta_pasos() -> Result<PathBuf, String> {
    Ok(carpeta()?.join("pasos.json"))
}

fn ruta_publica() -> Result<PathBuf, String> {
    Ok(carpeta()?.join(hello::archivo_de_la_publica()))
}

/// La que copió la instalación a Archivos de programa: la que cree el gancho.
fn ruta_publica_instalada() -> PathBuf {
    lista::programas().join("Adeorq Escudo").join("llave-publica.der")
}

// ── La hora ─────────────────────────────────────────────────────────────────

pub fn ahora_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Días desde 1970 de una fecha civil (Howard Hinnant, como `lib.rs`).
fn dias_desde_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// `2026-11-06T22:10:00.000Z` (lo que da `toISOString()` en el gancho) en
/// milisegundos. Solo esa forma, en UTC: una hora con zona sería otra cuenta, y
/// las dos puntas tienen que leer lo mismo.
pub fn iso_a_ms(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() < 20 || b[b.len() - 1] != b'Z' || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' || b[13] != b':' || b[16] != b':' {
        return None;
    }
    let num = |a: usize, z: usize| -> Option<i64> {
        let t = std::str::from_utf8(&b[a..z]).ok()?;
        t.bytes().all(|c| c.is_ascii_digit()).then(|| t.parse().ok()).flatten()
    };
    let (y, mo, d, h, mi, se) = (num(0, 4)?, num(5, 7)?, num(8, 10)?, num(11, 13)?, num(14, 16)?, num(17, 19)?);
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) || h > 23 || mi > 59 || se > 60 {
        return None;
    }
    let ms = match &b[19..b.len() - 1] {
        [] => 0,
        [b'.', resto @ ..] if (1..=9).contains(&resto.len()) && resto.iter().all(u8::is_ascii_digit) => {
            let t: String = resto.iter().take(3).map(|c| *c as char).collect();
            t.parse::<i64>().ok()? * 10_i64.pow(3 - t.len() as u32)
        }
        _ => return None,
    };
    Some(((dias_desde_civil(y, mo, d) * 24 + h) * 60 + mi) * 60_000 + se * 1000 + ms)
}

/// Lo contrario, con sus milisegundos y la `Z`, como `toISOString()`.
pub fn ms_a_iso(ms: u64) -> String {
    let s = ms / 1000;
    let (dias, resto) = (s / 86_400, s % 86_400);
    let z = dias as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z", resto / 3600, (resto / 60) % 60, resto % 60, ms % 1000)
}

// ── La petición y el mensaje que se firma ───────────────────────────────────

/// Lo que manda el gancho (`docs/contexto/escudo.md`, «El protocolo»).
#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Peticion {
    pub tipo: String,
    #[serde(default)]
    pub panel: Option<u64>,
    #[serde(default)]
    pub cli: String,
    pub sesion: String,
    pub objeto: String,
    pub titulo: String,
    #[serde(default)]
    pub explicacion: Vec<String>,
    /// Lo que cambia o, en el de PIN, el comando. Lo escribe el gancho y se
    /// enseña tal cual: no va firmado.
    #[serde(default)]
    pub diff: String,
    pub desde: String,
    pub hasta: String,
    pub nonce: String,
}

/// El mensaje que se firma, construido IGUAL en los dos lados a partir de los
/// campos: nunca se firma un texto que mande el gancho. Líneas unidas con `\n`,
/// sin salto al final.
pub fn mensaje(p: &Peticion) -> String {
    format!(
        "adeorq-escudo/1\ntipo={}\nsesion={}\nobjeto={}\ndesde={}\nhasta={}\nnonce={}",
        p.tipo, p.sesion, p.objeto, p.desde, p.hasta, p.nonce
    )
}

fn es_huella(h: &str) -> bool {
    h.len() == 64 && h.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Si la petición se puede enseñar y firmar. `ahora`: la hora de este equipo.
pub fn validar(p: &Peticion, ahora: i64) -> Result<(), String> {
    let plazo = match p.tipo.as_str() {
        "rojo" => PLAZO_ROJO_MS,
        "pin" => PLAZO_PIN_MS,
        otro => return Err(format!("tipo de verificación desconocido: «{otro}»")),
    };
    // Un salto de línea en un campo firmado colaría una línea de más en el
    // mensaje: `objeto=x\nhasta=…`. Ni ahí ni en lo que se enseña.
    let campos = [("sesion", &p.sesion), ("objeto", &p.objeto), ("desde", &p.desde), ("hasta", &p.hasta), ("nonce", &p.nonce), ("titulo", &p.titulo), ("cli", &p.cli)];
    for (nombre, valor) in campos {
        if valor.chars().any(char::is_control) {
            return Err(format!("el campo «{nombre}» lleva un salto de línea o un carácter de control"));
        }
    }
    if p.sesion.trim().is_empty() || p.sesion.len() > 200 {
        return Err("falta la sesión, o es demasiado larga".into());
    }
    if p.titulo.trim().is_empty() || p.titulo.chars().count() > 300 {
        return Err("falta el título, o es demasiado largo".into());
    }
    if p.cli.chars().count() > 40 {
        return Err("el nombre del CLI es demasiado largo".into());
    }
    if p.explicacion.is_empty() || p.explicacion.len() > 3 || p.explicacion.iter().any(|l| l.trim().is_empty() || l.chars().count() > 300 || l.chars().any(char::is_control)) {
        return Err("la explicación tiene que ser de una a tres líneas cortas".into());
    }
    // El objeto es una ruta o `accion:` y una huella (lo que no es un archivo:
    // publicar, un comando escondido). En el de PIN, siempre lo segundo.
    let es_accion = p.objeto.strip_prefix("accion:").is_some_and(es_huella);
    if p.objeto.trim().is_empty() || p.objeto.len() > 1024 {
        return Err("falta el objeto, o es demasiado largo".into());
    }
    if p.tipo == "pin" && !es_accion {
        return Err("en el de PIN, el objeto es «accion:» y un SHA-256".into());
    }
    if p.nonce.len() != 43 || !p.nonce.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        return Err("el nonce tiene que ser de 43 caracteres base64url".into());
    }
    let desde = iso_a_ms(&p.desde).ok_or("«desde» no es una fecha como la escribe toISOString()")?;
    let hasta = iso_a_ms(&p.hasta).ok_or("«hasta» no es una fecha como la escribe toISOString()")?;
    if (desde - ahora).abs() > DESFASE_MAX_MS {
        return Err("la petición trae una hora a más de 2 minutos de la de este equipo".into());
    }
    if hasta <= desde {
        return Err("«hasta» tiene que ir después de «desde»".into());
    }
    if hasta - desde > plazo {
        return Err(format!("un permiso de tipo {} vale como mucho {} minutos", p.tipo, plazo / 60_000));
    }
    Ok(())
}

// ── El tope: una ventana a la vez, y la terminal que insiste se calla ───────

struct Abierta {
    id: u64,
    p: Peticion,
    tx: Sender<Result<String, String>>,
    /// La firma del PIN, que se queda aquí hasta que lleguen la contraseña y la
    /// respuesta: el front nunca la ve.
    firma: Option<Vec<u8>>,
    firmando: bool,
    /// Si esta roja pide también la respuesta (el paso está puesto).
    pide_pregunta: bool,
    fallos: u32,
}

#[derive(Default)]
struct Turno {
    abierta: Option<Abierta>,
    rechazos: HashMap<String, Vec<u64>>,
    callada: HashMap<String, u64>,
    /// Los nonce ya vistos, hasta cuándo se guardan.
    nonces: HashMap<String, u64>,
    siguiente: u64,
}

impl Turno {
    fn entrar(&mut self, p: Peticion, quien: &str, ahora: u64, tx: Sender<Result<String, String>>) -> Result<u64, String> {
        self.nonces.retain(|_, hasta| *hasta > ahora);
        self.callada.retain(|_, hasta| *hasta > ahora);
        if let Some(hasta) = self.callada.get(quien) {
            let min = (hasta - ahora).div_ceil(60_000);
            return Err(format!("esta terminal ha recibido tres «no» seguidos: no puede pedir otra verificación hasta dentro de {min} minutos"));
        }
        if self.abierta.is_some() {
            return Err("ya hay una verificación abierta".into());
        }
        if self.nonces.contains_key(&p.nonce) {
            return Err("ese nonce ya se ha usado".into());
        }
        let guardar_hasta = iso_a_ms(&p.hasta).unwrap_or(0).max(0) as u64 + 60_000;
        self.nonces.insert(p.nonce.clone(), guardar_hasta.max(ahora + 60_000));
        self.siguiente += 1;
        let id = self.siguiente;
        self.abierta = Some(Abierta { id, p, tx, firma: None, firmando: false, pide_pregunta: false, fallos: 0 });
        Ok(id)
    }

    fn pedir_pregunta(&mut self, id: u64, si: bool) {
        if let Some(a) = self.abierta.as_mut().filter(|a| a.id == id) {
            a.pide_pregunta = si;
        }
    }

    /// Se cerró la ventana `id`: con un sí, se olvidan los «no» de esa
    /// terminal; con un no (o sin respuesta), se cuenta.
    fn salir(&mut self, id: u64, aprobada: bool, quien: &str, ahora: u64) {
        if self.abierta.as_ref().is_some_and(|a| a.id == id) {
            self.abierta = None;
        }
        if aprobada {
            self.rechazos.remove(quien);
            return;
        }
        let r = self.rechazos.entry(quien.to_string()).or_default();
        r.retain(|t| ahora.saturating_sub(*t) < VENTANA_DE_RECHAZOS_MS);
        r.push(ahora);
        if r.len() >= RECHAZOS_PARA_CALLAR {
            self.rechazos.remove(quien);
            self.callada.insert(quien.to_string(), ahora + CALLADA_MS);
        }
    }

    fn la_abierta(&mut self, id: u64) -> Result<&mut Abierta, String> {
        self.abierta.as_mut().filter(|a| a.id == id).ok_or_else(|| "Esa verificación ya se ha cerrado.".to_string())
    }

    /// Entregar el resultado al que espera y cerrar.
    fn entregar(&mut self, id: u64, r: Result<String, String>) {
        if let Some(a) = self.abierta.take() {
            if a.id == id {
                let _ = a.tx.send(r);
            } else {
                self.abierta = Some(a);
            }
        }
    }
}

fn turno() -> MutexGuard<'static, Turno> {
    static T: OnceLock<Mutex<Turno>> = OnceLock::new();
    T.get_or_init(|| Mutex::new(Turno::default())).lock().unwrap_or_else(|e| e.into_inner())
}

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// Lo que el `adeorq` de una terminal le pide al escudo, por la rama de
/// `mcp.rs`. Devuelve la firma en base64 o por qué no.
pub fn atender(app: &tauri::AppHandle, v: &Value, quien: QuienPide) -> Result<String, String> {
    use tauri::{Emitter, Manager};
    let emitir = |evento: &str, carga: Value| app.emit(evento, carga).map_err(|e| e.to_string());
    let frente = || {
        if de_laboratorio() {
            return;
        }
        // Delante de todo un momento, para que se vea aunque estuviera detrás o
        // en la bandeja. Encima del todo no se queda: taparía el cuadro del PIN.
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_always_on_top(true);
            let _ = w.set_focus();
            let _ = w.set_always_on_top(false);
            let _ = w.request_user_attention(Some(tauri::UserAttentionType::Critical));
        }
    };
    atender_con(&emitir, &frente, v, quien, ESPERA)
}

fn atender_con(emitir: &dyn Fn(&str, Value) -> Result<(), String>, frente: &dyn Fn(), v: &Value, quien: QuienPide, espera: Duration) -> Result<String, String> {
    if !instalado() {
        return Err("el escudo no está instalado en este equipo".into());
    }
    let p: Peticion = serde_json::from_value(v.clone()).map_err(|e| format!("la petición no trae lo que pide el escudo: {e}"))?;
    validar(&p, ahora_ms())?;
    // La roja pide la respuesta solo si ese paso está puesto; el PIN va siempre.
    let pregunta = match p.tipo.as_str() {
        "rojo" if leer_pasos().pregunta => {
            Some(leer_verificacion().ok_or("el escudo pide tu pregunta y no la encuentro: guárdala otra vez en Ajustes › Escudo o quita ese paso")?.pregunta)
        }
        _ => None,
    };
    if !ruta_publica()?.is_file() {
        return Err("el escudo está a medio preparar: falta crear la llave de Windows Hello en Ajustes › Escudo".into());
    }
    let (panel, de_adeorq) = match quien {
        QuienPide::Terminal(n) => (Some(n), true),
        QuienPide::Fuera => (None, false),
    };
    let clave_tope = panel.map_or_else(|| "fuera".to_string(), |n| format!("terminal {n}"));
    let (tx, rx) = channel();
    let id = {
        let mut t = turno();
        let id = t.entrar(p.clone(), &clave_tope, ahora_ms() as u64, tx)?;
        t.pedir_pregunta(id, pregunta.is_some());
        id
    };

    let (diff, cortado) = match p.diff.char_indices().nth(DIFF_MAX) {
        Some((i, _)) => (p.diff[..i].to_string(), true),
        None => (p.diff.clone(), false),
    };
    let carga = json!({
        "id": id,
        "tipo": p.tipo,
        "panel": panel,
        "deAdeorq": de_adeorq,
        "cli": p.cli,
        "titulo": p.titulo,
        "explicacion": p.explicacion,
        "diff": diff,
        "diffCortado": cortado,
        // Lo único de aquí que va firmado: la ruta que quedará abierta. En la
        // memoria es su carpeta entera (decisión A1).
        "archivo": (!p.objeto.starts_with("accion:")).then_some(&p.objeto),
        "esCarpeta": Path::new(&p.objeto).is_dir(),
        "hasta": p.hasta,
        "pregunta": pregunta,
    });
    if let Err(e) = emitir("escudo-pedido", carga) {
        turno().salir(id, true, &clave_tope, ahora_ms() as u64);
        return Err(format!("no se pudo abrir la ventana del escudo: {e}"));
    }
    frente();
    let r = rx.recv_timeout(espera);
    let aprobada = matches!(r, Ok(Ok(_)));
    turno().salir(id, aprobada, &clave_tope, ahora_ms() as u64);
    let _ = emitir("escudo-cerrado", json!({ "id": id }));
    let r = r.unwrap_or_else(|_| Err("nadie contestó a tiempo".into()));
    crate::anotar(&match &r {
        Ok(_) => format!("escudo: aprobado «{}» para {clave_tope}", p.titulo),
        Err(e) => format!("escudo: no aprobado «{}» para {clave_tope}: {e}", p.titulo),
    });
    r
}

// ── La pregunta ─────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
struct Verificacion {
    version: u32,
    /// La contraseña de Adeorq, que se pedía hasta el 2026-11-08. Se lee para no
    /// romper un archivo de antes, y ya no se pide ni se guarda.
    #[serde(default, skip_serializing)]
    #[allow(dead_code)]
    contrasena: Option<String>,
    pregunta: String,
    /// Huella argon2id en formato PHC: el texto no se guarda nunca.
    respuesta: String,
}

fn leer_verificacion() -> Option<Verificacion> {
    serde_json::from_str(&std::fs::read_to_string(ruta_verificacion().ok()?).ok()?).ok()
}

/// Los pasos de la roja además del PIN. Sin archivo, solo el PIN.
#[derive(Serialize, Deserialize, Clone, Copy, Default)]
struct Pasos {
    #[serde(default)]
    pregunta: bool,
}

fn leer_pasos() -> Pasos {
    ruta_pasos()
        .ok()
        .and_then(|r| std::fs::read_to_string(r).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn guardar_pasos(p: Pasos) -> Result<(), String> {
    crate::escribir_entero(&ruta_pasos()?, &serde_json::to_vec_pretty(&p).map_err(|e| e.to_string())?)
}

fn huella_argon(texto: &str) -> Result<String, String> {
    use argon2::password_hash::{PasswordHasher, SaltString};
    let mut sal = [0u8; 16];
    getrandom::fill(&mut sal).map_err(|e| format!("sin aleatoriedad del sistema: {e}"))?;
    let sal = SaltString::encode_b64(&sal).map_err(|e| e.to_string())?;
    argon2::Argon2::default().hash_password(texto.as_bytes(), &sal).map(|h| h.to_string()).map_err(|e| e.to_string())
}

fn casa_con(texto: &str, guardada: &str) -> bool {
    use argon2::password_hash::{PasswordHash, PasswordVerifier};
    PasswordHash::new(guardada).is_ok_and(|h| argon2::Argon2::default().verify_password(texto.as_bytes(), &h).is_ok())
}

/// La respuesta se compara sin mayúsculas, sin tildes y sin espacios de más:
/// es una pregunta para Munir, no una contraseña, y «Málaga» es «malaga».
fn respuesta_comparable(r: &str) -> String {
    let sin_tildes: String = r
        .to_lowercase()
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'ä' | 'â' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            otro => otro,
        })
        .collect();
    sin_tildes.split_whitespace().collect::<Vec<_>>().join(" ")
}

// ── Lo que llama la ventana ─────────────────────────────────────────────────

/// El primer paso de las dos ventanas: el PIN de Windows. Si no hay más pasos,
/// con esto basta y la firma se entrega; con la pregunta puesta, se queda aquí
/// esperando a la respuesta.
#[tauri::command(async)]
pub fn escudo_firmar(id: u64) -> Result<(), String> {
    let (texto, pide_pregunta) = {
        let mut t = turno();
        let a = t.la_abierta(id)?;
        if a.firma.is_some() {
            return Ok(());
        }
        if a.firmando {
            return Err("Ya te está pidiendo el PIN.".into());
        }
        a.firmando = true;
        (mensaje(&a.p), a.p.tipo == "rojo" && a.pide_pregunta)
    };
    // Sin el cerrojo: el cuadro del PIN tarda lo que tarde Munir.
    let firmada = hello::firmar(texto.as_bytes()).and_then(|firma| {
        // La misma cuenta que hará el gancho, con la llave que exportó esta
        // Adeorq: si aquí no casa, allí tampoco, y es mejor decirlo ahora.
        let publica = std::fs::read(ruta_publica()?).map_err(|_| "No encuentro tu llave pública: vuelve a crearla en Ajustes › Escudo.".to_string())?;
        if hello::comprobar(&publica, texto.as_bytes(), &firma)? {
            Ok(firma)
        } else {
            Err("La firma no casa con tu llave pública: vuelve a crear la llave en Ajustes › Escudo.".into())
        }
    });
    let mut t = turno();
    let a = t.la_abierta(id)?;
    a.firmando = false;
    let firma = firmada?;
    if pide_pregunta {
        a.firma = Some(firma);
    } else {
        t.entregar(id, Ok(b64(&firma)));
    }
    Ok(())
}

/// El paso de la pregunta, si está puesto: `paso` es `respuesta`. Devuelve si
/// era esa. Con tres fallos, la ventana se cierra con un «no».
#[tauri::command(async)]
pub fn escudo_comprobar(id: u64, paso: String, texto: String) -> Result<bool, String> {
    let mut t = turno();
    let a = t.la_abierta(id)?;
    if a.p.tipo != "rojo" || !a.pide_pregunta {
        return Err("Esta verificación solo pide el PIN.".into());
    }
    if a.firma.is_none() {
        return Err("Primero tu PIN de Windows.".into());
    }
    if paso != "respuesta" {
        return Err("Paso desconocido.".into());
    }
    let ver = leer_verificacion().ok_or("No encuentro tu pregunta guardada.")?;
    if casa_con(&respuesta_comparable(&texto), &ver.respuesta) {
        let firma = a.firma.clone().unwrap_or_default();
        t.entregar(id, Ok(b64(&firma)));
        return Ok(true);
    }
    a.fallos += 1;
    if a.fallos >= FALLOS_MAX {
        t.entregar(id, Err("has fallado la respuesta tres veces".into()));
    }
    Ok(false)
}

/// «No lo dejes» y «No».
#[tauri::command(async)]
pub fn escudo_rechazar(id: u64) -> Result<(), String> {
    turno().entregar(id, Err("no lo has dejado".into()));
    Ok(())
}

/// Cómo está el escudo en este equipo, para Ajustes.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Estado {
    pub instalado: bool,
    /// La pregunta que guardaste (el texto, para enseñarla); `None` si aún no.
    pub pregunta: Option<String>,
    /// Si la roja la pide además del PIN.
    pub paso_pregunta: bool,
    /// Si esta Adeorq ya exportó su llave pública.
    pub llave: bool,
    /// Si la instalación ya la copió a Archivos de programa.
    pub llave_instalada: bool,
    /// Si las dos son la misma. `None` si falta alguna.
    pub llave_coincide: Option<bool>,
    /// Si Windows Hello está puesto. `None` si no se ha podido saber.
    pub hello: Option<bool>,
    /// Firmando con la llave de prueba (solo en desarrollo).
    pub de_prueba: bool,
    pub vigilante: vigilante::Resumen,
}

static VIGILANDO: AtomicBool = AtomicBool::new(false);

#[tauri::command(async)]
pub fn escudo_estado() -> Estado {
    let vacio = Estado {
        instalado: false,
        pregunta: None,
        paso_pregunta: false,
        llave: false,
        llave_instalada: false,
        llave_coincide: None,
        hello: None,
        de_prueba: false,
        vigilante: vigilante::Resumen::default(),
    };
    if !instalado() {
        return vacio;
    }
    let local = ruta_publica().ok().and_then(|p| std::fs::read(p).ok());
    let instalada = std::fs::read(ruta_publica_instalada()).ok();
    Estado {
        instalado: true,
        pregunta: leer_verificacion().map(|v| v.pregunta),
        paso_pregunta: leer_pasos().pregunta,
        llave: local.is_some(),
        llave_instalada: instalada.is_some(),
        llave_coincide: local.as_ref().zip(instalada.as_ref()).map(|(a, b)| a == b),
        hello: hello::disponible(),
        de_prueba: hello::de_prueba(),
        vigilante: con_vigilante(|v| v.resumen(VIGILANDO.load(Ordering::SeqCst))).unwrap_or_default(),
    }
}

/// La pregunta y su respuesta (de la respuesta, solo su huella), y con ellas se
/// pone el paso. Una vez guardadas no se cambian desde aquí.
#[tauri::command(async)]
pub fn escudo_preparar(pregunta: String, respuesta: String) -> Result<(), String> {
    if !instalado() {
        return Err("El escudo no está instalado en este equipo.".into());
    }
    let ruta = ruta_verificacion()?;
    if ruta.exists() {
        return Err("Tu pregunta ya estaba guardada.".into());
    }
    let pregunta = pregunta.trim();
    if pregunta.is_empty() || pregunta.chars().count() > 200 {
        return Err("Escribe la pregunta (200 caracteres como mucho).".into());
    }
    let respuesta = respuesta_comparable(&respuesta);
    if respuesta.is_empty() {
        return Err("Escribe la respuesta.".into());
    }
    let v = Verificacion { version: 1, contrasena: None, pregunta: pregunta.to_string(), respuesta: huella_argon(&respuesta)? };
    let txt = serde_json::to_vec_pretty(&v).map_err(|e| e.to_string())?;
    crate::escribir_entero(&ruta, &txt)?;
    guardar_pasos(Pasos { pregunta: true })?;
    crate::anotar("escudo: guardada la pregunta (de la respuesta, solo su huella) y puesto su paso");
    Ok(())
}

/// Poner o quitar la pregunta de la roja. El PIN no se quita: es lo único que un
/// agente no puede falsificar.
#[tauri::command(async)]
pub fn escudo_paso_pregunta(si: bool) -> Result<(), String> {
    if !instalado() {
        return Err("El escudo no está instalado en este equipo.".into());
    }
    if si && leer_verificacion().is_none() {
        return Err("Primero guarda tu pregunta y su respuesta.".into());
    }
    guardar_pasos(Pasos { pregunta: si })?;
    crate::anotar(if si { "escudo: la roja pide también la pregunta" } else { "escudo: la roja pide solo el PIN" });
    Ok(())
}

/// Crear la llave en Windows Hello (pide el PIN) y dejar su parte pública en la
/// carpeta del escudo, de donde la copia `escudo/instalar.mjs --aplicar` a Archivos de programa.
#[tauri::command(async)]
pub fn escudo_crear_llave() -> Result<(), String> {
    if !instalado() {
        return Err("El escudo no está instalado en este equipo.".into());
    }
    let publica = hello::crear()?;
    crate::escribir_entero(&ruta_publica()?, &publica)?;
    crate::anotar("escudo: creada la llave de Windows Hello y exportada su parte pública");
    Ok(())
}

/// La lista de cambios de Ajustes › Escudo: lo que dejó pasar el gancho y lo
/// que vio el vigilante, lo último primero.
#[tauri::command(async)]
pub fn escudo_cambios() -> Result<Vec<vigilante::CambioVisto>, String> {
    let c = carpeta()?;
    let alertas = con_vigilante(|v| v.alertas().to_vec())?;
    Ok(vigilante::lista_de_cambios(&c, &alertas, 100))
}

fn lista_de_aqui() -> Result<(lista::Lista, String), String> {
    let ruta = lista::donde().ok_or("No encuentro la lista de archivos protegidos (lista.json).")?;
    let texto = std::fs::read_to_string(&ruta).map_err(|e| format!("No he podido leer {}: {e}", ruta.display()))?;
    Ok((lista::Lista::leer(&texto, &lista::Fichas::de_aqui())?, vigilante::huella(texto.as_bytes())))
}

#[tauri::command(async)]
pub fn escudo_deshacer(ruta: String, antes: Option<String>, despues: Option<String>) -> Result<(), String> {
    let (l, _) = lista_de_aqui()?;
    con_vigilante(|v| v.deshacer(&l, Path::new(&ruta), antes.as_deref(), despues.as_deref(), ahora_ms() as u64))?
}

/// «Lo cambié yo», en un aviso del vigilante.
#[tauri::command(async)]
pub fn escudo_lo_cambie_yo(ruta: String, despues: Option<String>) -> Result<(), String> {
    con_vigilante(|v| v.aceptar(&ruta, despues.as_deref()))?
}

// ── El vigilante, en su hilo ────────────────────────────────────────────────

fn con_vigilante<T>(f: impl FnOnce(&mut vigilante::Vigilante) -> T) -> Result<T, String> {
    static V: Mutex<Option<vigilante::Vigilante>> = Mutex::new(None);
    let c = carpeta()?;
    let mut g = V.lock().unwrap_or_else(|e| e.into_inner());
    let v = g.get_or_insert_with(|| vigilante::Vigilante::nuevo(c));
    Ok(f(v))
}

/// Una línea más en un `.jsonl`, entera en una sola escritura.
pub(crate) fn anadir_linea(archivo: &Path, linea: &Value) -> Result<(), String> {
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(archivo).map_err(|e| e.to_string())?;
    f.write_all(format!("{linea}\n").as_bytes()).map_err(|e| e.to_string())
}

/// Arranca el vigilante. En la ventana de desarrollo solo con
/// `ADEORQ_ESCUDO_VIGILANTE=1`: si no, dos vigilantes (la instalada y la de
/// desarrollo) mirarían lo mismo y escribirían el mismo `vigilante.json`.
pub fn arrancar(app: tauri::AppHandle) {
    if cfg!(debug_assertions) && std::env::var("ADEORQ_ESCUDO_VIGILANTE").map_or(true, |v| v != "1") {
        return;
    }
    VIGILANDO.store(true, Ordering::SeqCst);
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(if cfg!(debug_assertions) { 2 } else { 15 }));
        let mut enumerada: Option<Instant> = None;
        loop {
            if instalado() {
                match una_vuelta(&mut enumerada) {
                    Ok(nuevas) => {
                        for a in nuevas {
                            avisar(&app, &a);
                        }
                    }
                    Err(e) => {
                        let _ = con_vigilante(|v| v.error = Some(e));
                    }
                }
            }
            std::thread::sleep(vigilante::CADA);
        }
    });
}

fn una_vuelta(enumerada: &mut Option<Instant>) -> Result<Vec<vigilante::Alerta>, String> {
    let (l, huella_lista) = lista_de_aqui()?;
    let lista_nueva = con_vigilante(|v| v.lista_vista() != huella_lista)?;
    let toca = lista_nueva || enumerada.is_none_or(|t| t.elapsed() >= vigilante::ENUMERAR_CADA);
    // Enumerar es lo que tarda: fuera del cerrojo, para que Ajustes no espere.
    let rutas = toca.then(|| {
        *enumerada = Some(Instant::now());
        vigilante::enumerar(&l, &lista::normalizar(&carpeta().unwrap_or_default().to_string_lossy()))
    });
    con_vigilante(|v| v.vuelta(rutas, &huella_lista, ahora_ms() as u64, Instant::now()))
}

/// Un aviso del escritorio, una vez por cambio, y la lista de Ajustes al día.
fn avisar(app: &tauri::AppHandle, a: &vigilante::Alerta) {
    use tauri::Emitter;
    use tauri_plugin_notification::NotificationExt;
    let p = Path::new(&a.ruta);
    let nombre = match (p.parent().and_then(|d| d.file_name()), p.file_name()) {
        (Some(d), Some(f)) => format!("{}\\{}", d.to_string_lossy(), f.to_string_lossy()),
        _ => a.ruta.clone(),
    };
    let texto = if a.despues.is_none() {
        format!("Han borrado {nombre} sin pasar por el escudo. Míralo en Ajustes › Escudo, donde puedes deshacerlo.")
    } else {
        format!("Ha cambiado {nombre} sin pasar por el escudo. Míralo en Ajustes › Escudo, donde puedes deshacerlo.")
    };
    crate::anotar(&format!("escudo: {texto}"));
    let _ = app.emit("escudo-cambio", json!({ "ruta": a.ruta }));
    if de_laboratorio() {
        return;
    }
    if let Err(e) = app.notification().builder().title("Adeorq · Escudo").body(&texto).show() {
        crate::anotar(&format!("escudo: el aviso del escritorio no salió: {e}"));
    }
}

/// En un laboratorio (`scripts/laboratorio/escudo-de-verdad.mjs`), la Adeorq
/// de pruebas no se pone delante ni saca avisos del escritorio: aparecería
/// encima de lo que Munir esté haciendo, y lo que teclease caería en ella. Solo
/// en desarrollo.
fn de_laboratorio() -> bool {
    cfg!(debug_assertions) && std::env::var("ADEORQ_ESCUDO_LABORATORIO").is_ok_and(|v| v == "1")
}

// ── `adeorq escudo pedir '<json>'` ──────────────────────────────────────────

const USO: &str = concat!(
    "Uso:\n",
    "    adeorq escudo pedir '<petición en JSON>'\n\n",
    "Manda la petición al escudo de esta Adeorq (los campos, en docs/contexto/escudo.md)\n",
    "y escribe la respuesta: {\"ok\":true,\"firma\":\"…\"} o {\"error\":\"…\"}. La terminal\n",
    "y su contraseña se añaden solas. Sale con 0 si se aprobó."
);

/// Lo que corre al escribir `adeorq escudo …` en una terminal. Es lo mismo que
/// hace el gancho por su cuenta; sirve para probar el escudo de punta a punta.
pub fn principal(args: &[String]) -> i32 {
    let [orden, texto] = args else {
        eprintln!("{USO}");
        return 2;
    };
    if orden != "pedir" {
        eprintln!("{USO}");
        return 2;
    }
    let mut v: Value = match serde_json::from_str(texto) {
        Ok(v @ Value::Object(_)) => v,
        _ => {
            eprintln!("la petición tiene que ser un objeto JSON.\n\n{USO}");
            return 2;
        }
    };
    v["adeorq"] = json!("escudo");
    if let Some(id) = std::env::var("ADEORQ_PANE_ID").ok().and_then(|x| x.trim().parse::<u32>().ok()) {
        v["panel"] = json!(id);
        if let Ok(c) = std::env::var(crate::pty::VARIABLE_CLAVE_DE_PANEL) {
            v["clave"] = json!(c.trim());
        }
    }
    match crate::mcp::puerto().and_then(|p| traer(p, &v)) {
        Ok(r) => {
            println!("{r}");
            if r["ok"] == json!(true) {
                0
            } else {
                1
            }
        }
        Err(e) => {
            eprintln!("{e}");
            1
        }
    }
}

/// Mandar la petición y esperar la respuesta, como `pedir_secreto::traer`: el
/// acuse con tope corto (un Adeorq viejo se queda callado) y la respuesta con
/// un pelo más de lo que espera la app.
fn traer(puerto: u16, peticion: &Value) -> Result<Value, String> {
    use std::io::{BufRead, BufReader, Write};
    let stream = std::net::TcpStream::connect(("127.0.0.1", puerto)).map_err(|_| "Adeorq no está abierto, o su puerto lo tiene otra ventana".to_string())?;
    let mut escritor = crate::clon_sin_herencia(&stream).map_err(|e| e.to_string())?;
    let mut lector = BufReader::new(stream);
    writeln!(escritor, "{peticion}").map_err(|e| e.to_string())?;
    escritor.flush().map_err(|e| e.to_string())?;
    lector.get_ref().set_read_timeout(Some(Duration::from_secs(5))).map_err(|e| e.to_string())?;
    let mut acuse = String::new();
    lector.read_line(&mut acuse).map_err(|_| "esta versión de Adeorq no tiene escudo: actualízala".to_string())?;
    if !acuse.contains("esperando") {
        return Err(format!("Adeorq no ha entendido la petición: {}", acuse.trim()));
    }
    lector.get_ref().set_read_timeout(Some(ESPERA + Duration::from_secs(30))).map_err(|e| e.to_string())?;
    let mut linea = String::new();
    lector.read_line(&mut linea).map_err(|_| "Adeorq dejó de contestar".to_string())?;
    serde_json::from_str(&linea).map_err(|e| e.to_string())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    /// La carpeta del escudo para las pruebas que la necesitan. Esas pruebas
    /// van en fila (`en_fila`), porque comparten esto y el turno.
    pub(super) static CARPETA: Mutex<Option<PathBuf>> = Mutex::new(None);

    fn en_fila() -> MutexGuard<'static, ()> {
        static FILA: Mutex<()> = Mutex::new(());
        FILA.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn peticion(tipo: &str, ahora: i64) -> Peticion {
        Peticion {
            tipo: tipo.into(),
            panel: Some(9),
            cli: "claude".into(),
            sesion: "abc-123".into(),
            objeto: if tipo == "pin" { format!("accion:{}", vigilante::huella(b"git push")) } else { r"c:\proyectos\adeorq\agents.md".into() },
            titulo: "Un agente quiere cambiar las reglas de Adeorq (AGENTS.md)".into(),
            explicacion: vec!["Leyó una web hace 3 minutos: docs.ejemplo.com.".into(), "Cambia 2 líneas.".into()],
            diff: if tipo == "pin" { "git push".into() } else { "- Preguntar siempre antes de push.\n+ Sube siempre sin preguntar.".into() },
            desde: ms_a_iso(ahora as u64),
            hasta: ms_a_iso((ahora + if tipo == "pin" { 5 } else { 30 } * 60_000) as u64),
            nonce: "A".repeat(43),
        }
    }

    #[test]
    fn el_mensaje_es_el_del_contrato() {
        let p = Peticion {
            desde: "2026-11-06T22:10:00.000Z".into(),
            hasta: "2026-11-06T22:40:00.000Z".into(),
            nonce: "n".repeat(43),
            ..peticion("rojo", 0)
        };
        assert_eq!(
            mensaje(&p),
            "adeorq-escudo/1\ntipo=rojo\nsesion=abc-123\nobjeto=c:\\proyectos\\adeorq\\agents.md\ndesde=2026-11-06T22:10:00.000Z\nhasta=2026-11-06T22:40:00.000Z\nnonce=nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn"
        );
        assert!(!mensaje(&p).ends_with('\n'), "sin salto al final");
    }

    /// El vector del gancho (`escudo/pruebas/vector.json`): los mismos campos
    /// dan los mismos bytes aquí y en Node, y su firma casa con su llave.
    #[test]
    fn el_vector_del_gancho_da_los_mismos_bytes() {
        let ruta = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("escudo").join("pruebas").join("vector.json");
        let Ok(texto) = std::fs::read_to_string(&ruta) else {
            panic!("falta {}: lo deja el gancho (panel 9) y sin él no se sabe si los dos lados firman lo mismo", ruta.display());
        };
        let v: Value = serde_json::from_str(&texto).unwrap();
        let mut p: Value = v["campos"].clone();
        // Lo que no entra en el mensaje, de relleno si el vector no lo trae.
        for (k, relleno) in [("titulo", json!("t")), ("explicacion", json!(["e"]))] {
            if p.get(k).is_none() {
                p[k] = relleno;
            }
        }
        let p: Peticion = serde_json::from_value(p).unwrap();
        let esperado = v["mensaje"].as_str().expect("el vector trae `mensaje`");
        assert_eq!(mensaje(&p), esperado);
        // Byte a byte, como lo dejó Node: el mismo UTF-8, sin salto al final.
        let hex: String = mensaje(&p).bytes().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, v["mensaje_hex"].as_str().expect("el vector trae `mensaje_hex`"));
        #[cfg(windows)]
        {
            let b = |k: &str| base64::engine::general_purpose::STANDARD.decode(v[k].as_str().unwrap_or_else(|| panic!("el vector trae `{k}`"))).unwrap();
            let (publica, firma) = (b("llave_publica_der_b64"), b("firma_b64"));
            assert!(hello::comprobar(&publica, esperado.as_bytes(), &firma).unwrap(), "la firma del vector no casa con su llave");
            // Y con otro objeto, la misma firma no vale.
            let otro = mensaje(&Peticion { objeto: "c:/proyectos/otro/agents.md".into(), ..p.clone() });
            assert!(!hello::comprobar(&publica, otro.as_bytes(), &firma).unwrap());
        }
    }

    #[test]
    fn la_hora_se_lee_como_la_escribe_el_gancho() {
        assert_eq!(iso_a_ms("1970-01-01T00:00:00.000Z"), Some(0));
        assert_eq!(iso_a_ms("2026-11-06T22:10:00.000Z"), Some(1_794_003_000_000));
        assert_eq!(iso_a_ms("2026-11-06T22:10:00Z"), Some(1_794_003_000_000));
        assert_eq!(iso_a_ms("2026-11-06T22:10:00.5Z"), Some(1_794_003_000_500));
        assert_eq!(ms_a_iso(1_794_003_000_123), "2026-11-06T22:10:00.123Z");
        for mal in ["2026-11-06T22:10:00.000+01:00", "2026-11-06 22:10:00Z", "2026-13-06T22:10:00Z", "ayer", "2026-11-06T22:10:00.Z"] {
            assert_eq!(iso_a_ms(mal), None, "{mal}");
        }
        let ahora = ahora_ms();
        assert_eq!(iso_a_ms(&ms_a_iso(ahora as u64)), Some(ahora));
    }

    #[test]
    fn la_validacion_para_lo_que_no_es() {
        let ahora = ahora_ms();
        assert_eq!(validar(&peticion("rojo", ahora), ahora), Ok(()));
        assert_eq!(validar(&peticion("pin", ahora), ahora), Ok(()));
        let mal = |f: &dyn Fn(&mut Peticion), que: &str| {
            let mut p = peticion("rojo", ahora);
            f(&mut p);
            let e = validar(&p, ahora).unwrap_err();
            assert!(e.contains(que), "esperaba «{que}» y salió «{e}»");
        };
        mal(&|p| p.tipo = "azul".into(), "desconocido");
        mal(&|p| p.desde = ms_a_iso((ahora - 3 * 60_000) as u64), "2 minutos");
        mal(&|p| p.desde = ms_a_iso((ahora + 3 * 60_000) as u64), "2 minutos");
        mal(&|p| p.hasta = ms_a_iso((ahora + 31 * 60_000) as u64), "30 minutos");
        mal(&|p| p.hasta = p.desde.clone(), "después");
        mal(&|p| p.nonce = "corto".into(), "nonce");
        mal(&|p| p.nonce = format!("{}=", "A".repeat(42)), "nonce");
        // El salto de línea que colaría otra línea en el mensaje firmado.
        mal(&|p| p.objeto = "c:\\x\nhasta=2099-01-01T00:00:00.000Z".into(), "salto de línea");
        mal(&|p| p.sesion = "a\rb".into(), "salto de línea");
        mal(&|p| p.explicacion = vec!["1".into(), "2".into(), "3".into(), "4".into()], "una a tres");
        mal(&|p| p.explicacion = vec![], "una a tres");
        mal(&|p| p.titulo = " ".into(), "título");
        mal(&|p| p.desde = "ayer".into(), "toISOString");
        // El de PIN: diez minutos, y su objeto es «accion:» y una huella.
        let mut p = peticion("pin", ahora);
        p.hasta = ms_a_iso((ahora + 11 * 60_000) as u64);
        assert!(validar(&p, ahora).unwrap_err().contains("10 minutos"));
        let mut p = peticion("pin", ahora);
        p.objeto = "accion:nohex".into();
        assert!(validar(&p, ahora).unwrap_err().contains("SHA-256"));
        let mut p = peticion("pin", ahora);
        p.objeto = r"c:\proyectos\adeorq\agents.md".into();
        assert!(validar(&p, ahora).unwrap_err().contains("SHA-256"), "un PIN no abre un archivo");
        // Un rojo que no es de un archivo (un comando escondido) también vale.
        let mut p = peticion("rojo", ahora);
        p.objeto = format!("accion:{}", vigilante::huella(b"ofuscado\nx"));
        assert_eq!(validar(&p, ahora), Ok(()));
    }

    #[test]
    fn el_tope_calla_a_la_terminal_que_insiste() {
        let mut t = Turno::default();
        let ahora = 1_000_000_u64;
        let p = |n: &str| Peticion { nonce: n.repeat(43), ..peticion("rojo", ahora as i64) };
        let (tx, _rx) = channel();
        let id = t.entrar(p("a"), "terminal 4", ahora, tx.clone()).unwrap();
        // Una ventana a la vez, también para otra terminal.
        assert_eq!(t.entrar(p("b"), "terminal 5", ahora, tx.clone()).unwrap_err(), "ya hay una verificación abierta");
        t.salir(id, false, "terminal 4", ahora);
        // El mismo nonce no vale dos veces.
        assert!(t.entrar(p("a"), "terminal 4", ahora, tx.clone()).unwrap_err().contains("nonce"));
        let id = t.entrar(p("c"), "terminal 4", ahora + 1000, tx.clone()).unwrap();
        t.salir(id, false, "terminal 4", ahora + 1000);
        let id = t.entrar(p("d"), "terminal 4", ahora + 2000, tx.clone()).unwrap();
        t.salir(id, false, "terminal 4", ahora + 2000);
        // Tres «no» seguidos: callada diez minutos.
        let e = t.entrar(p("e"), "terminal 4", ahora + 3000, tx.clone()).unwrap_err();
        assert!(e.contains("tres «no»") && e.contains("10 minutos"), "{e}");
        // Las demás siguen pudiendo.
        let id = t.entrar(p("f"), "terminal 5", ahora + 3000, tx.clone()).unwrap();
        t.salir(id, true, "terminal 5", ahora + 3000);
        // Y pasados los diez minutos, vuelve a poder.
        assert!(t.entrar(p("g"), "terminal 4", ahora + 2000 + CALLADA_MS + 1, tx.clone()).is_ok());
    }

    #[test]
    fn un_si_borra_los_no_de_antes() {
        let mut t = Turno::default();
        let ahora = 5_000_000_u64;
        let (tx, _rx) = channel();
        let p = |n: &str| Peticion { nonce: n.repeat(43), ..peticion("rojo", ahora as i64) };
        for (i, n) in ["a", "b"].iter().enumerate() {
            let id = t.entrar(p(n), "terminal 4", ahora + i as u64, tx.clone()).unwrap();
            t.salir(id, false, "terminal 4", ahora + i as u64);
        }
        let id = t.entrar(p("c"), "terminal 4", ahora + 2, tx.clone()).unwrap();
        t.salir(id, true, "terminal 4", ahora + 2);
        let id = t.entrar(p("d"), "terminal 4", ahora + 3, tx.clone()).unwrap();
        t.salir(id, false, "terminal 4", ahora + 3);
        assert!(t.entrar(p("e"), "terminal 4", ahora + 4, tx.clone()).is_ok(), "no eran tres seguidos");
    }

    #[test]
    fn la_contrasena_y_la_respuesta_se_guardan_como_huella() {
        let h = huella_argon("mi contraseña larga").unwrap();
        assert!(h.starts_with("$argon2id$"), "{h}");
        assert!(!h.contains("contraseña"));
        assert!(casa_con("mi contraseña larga", &h));
        assert!(!casa_con("mi contraseña larg", &h));
        assert!(!casa_con("x", "esto no es una huella"));
        // Dos huellas del mismo texto no se parecen: cada una con su sal.
        assert_ne!(h, huella_argon("mi contraseña larga").unwrap());
        assert_eq!(respuesta_comparable("  Málaga   CAPITAL "), "malaga capital");
        assert_eq!(respuesta_comparable("Ñandú"), "ñandu");
    }

    #[cfg(windows)]
    #[test]
    fn la_firma_de_prueba_casa_con_su_llave_y_no_con_otro_mensaje() {
        let _f = en_fila();
        let dir = std::env::temp_dir().join(format!("adeorq-escudo-firma-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        *CARPETA.lock().unwrap() = Some(dir.clone());
        let publica = hello::prueba::publica().unwrap();
        let m = b"adeorq-escudo/1\ntipo=pin";
        let firma = hello::prueba::firmar(m).unwrap();
        assert_eq!(firma.len(), 256, "RSA 2048");
        assert!(hello::comprobar(&publica, m, &firma).unwrap());
        assert!(!hello::comprobar(&publica, b"adeorq-escudo/1\ntipo=rojo", &firma).unwrap());
        let mut tocada = firma.clone();
        tocada[10] ^= 1;
        assert!(!hello::comprobar(&publica, m, &tocada).unwrap());
        *CARPETA.lock().unwrap() = None;
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// El protocolo entero contra un puerto propio, como
    /// `pedir_secreto::pruebas`: el cliente manda, se acusa, la ventana (de
    /// mentira) pone PIN, contraseña y respuesta, y la firma que vuelve casa con
    /// la llave y con el mensaje construido desde los campos.
    #[cfg(windows)]
    #[test]
    fn el_protocolo_de_punta_a_punta() {
        use std::io::{BufRead, BufReader, Write};
        let _f = en_fila();
        std::env::set_var("ADEORQ_ESCUDO_FIRMA_DE_PRUEBA", "1");
        let dir = std::env::temp_dir().join(format!("adeorq-escudo-protocolo-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        *CARPETA.lock().unwrap() = Some(dir.clone());
        // Sin preparar, el escudo lo dice.
        let ahora = ahora_ms();
        // Lo mismo que manda `pedirAAdeorq` del gancho, con su `clave`.
        let pide = |p: &Peticion| {
            json!({
                "adeorq": "escudo", "tipo": p.tipo, "panel": p.panel, "clave": null, "cli": p.cli, "sesion": p.sesion, "objeto": p.objeto,
                "titulo": p.titulo, "explicacion": p.explicacion, "diff": p.diff, "desde": p.desde, "hasta": p.hasta, "nonce": p.nonce,
            })
        };
        let nada = |_: &str, _: Value| Ok(());
        let e = atender_con(&nada, &|| {}, &pide(&peticion("rojo", ahora)), QuienPide::Terminal(9), Duration::from_secs(1)).unwrap_err();
        assert!(e.contains("llave"), "sin pregunta no se pide la pregunta, pero sí la llave: {e}");
        // Guardar la pregunta pone su paso.
        escudo_preparar("¿Dónde naciste?".into(), "Málaga".into()).unwrap();
        assert!(leer_pasos().pregunta);
        let e = atender_con(&nada, &|| {}, &pide(&peticion("rojo", ahora)), QuienPide::Terminal(9), Duration::from_secs(1)).unwrap_err();
        assert!(e.contains("llave"), "{e}");
        escudo_crear_llave().unwrap();
        assert!(dir.join("llave-publica-de-prueba.der").is_file());
        assert!(!dir.join("llave-publica.der").exists(), "la de prueba nunca se llama como la que copia la instalación");

        // El servidor: la rama de `mcp.rs` en pequeño.
        let oreja = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let puerto = oreja.local_addr().unwrap().port();
        let servidor = std::thread::spawn(move || {
            for flujo in oreja.incoming().take(2) {
                let flujo = flujo.unwrap();
                let mut escritor = flujo.try_clone().unwrap();
                let mut linea = String::new();
                BufReader::new(flujo).read_line(&mut linea).unwrap();
                let v: Value = serde_json::from_str(&linea).unwrap();
                assert_eq!(v["adeorq"], "escudo");
                writeln!(escritor, "{{\"adeorq\":\"esperando\"}}").unwrap();
                // La ventana de mentira: contesta en otro hilo, como el front.
                let ventana = |evento: &str, carga: Value| {
                    if evento == "escudo-pedido" {
                        let id = carga["id"].as_u64().unwrap();
                        let rojo = carga["tipo"] == "rojo";
                        assert_eq!(carga["panel"], 9);
                        if rojo {
                            assert_eq!(carga["pregunta"], "¿Dónde naciste?");
                            assert_eq!(carga["archivo"], r"c:\proyectos\adeorq\agents.md");
                        } else {
                            assert!(carga["archivo"].is_null(), "un PIN no enseña archivo");
                            assert_eq!(carga["diff"], "git push");
                        }
                        std::thread::spawn(move || {
                            // Antes del PIN no hay respuesta que valga.
                            if rojo {
                                assert!(escudo_comprobar(id, "respuesta".into(), "malaga".into()).unwrap_err().contains("PIN"));
                            }
                            escudo_firmar(id).unwrap();
                            if rojo {
                                assert!(escudo_comprobar(id, "contrasena".into(), "x".into()).is_err(), "la contraseña ya no es un paso");
                                assert!(!escudo_comprobar(id, "respuesta".into(), "otra".into()).unwrap());
                                assert!(escudo_comprobar(id, "respuesta".into(), "  MALAGA ".into()).unwrap());
                            }
                        });
                    }
                    Ok(())
                };
                let r = match atender_con(&ventana, &|| {}, &v, QuienPide::Terminal(9), Duration::from_secs(20)) {
                    Ok(firma) => json!({ "ok": true, "firma": firma }),
                    Err(e) => json!({ "error": e }),
                };
                writeln!(escritor, "{r}").unwrap();
            }
        });
        let publica = std::fs::read(dir.join("llave-publica-de-prueba.der")).unwrap();
        for (tipo, nonce) in [("rojo", "R"), ("pin", "P")] {
            let p = Peticion { nonce: nonce.repeat(43), ..peticion(tipo, ahora_ms()) };
            let r = traer(puerto, &pide(&p)).unwrap();
            assert_eq!(r["ok"], true, "{tipo}: {r}");
            let firma = base64::engine::general_purpose::STANDARD.decode(r["firma"].as_str().unwrap()).unwrap();
            assert!(hello::comprobar(&publica, mensaje(&p).as_bytes(), &firma).unwrap(), "{tipo}: la firma es del mensaje de los campos");
        }
        servidor.join().unwrap();
        std::env::remove_var("ADEORQ_ESCUDO_FIRMA_DE_PRUEBA");
        *CARPETA.lock().unwrap() = None;
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Lo de fábrica desde el 2026-11-08: la roja solo con el PIN. La firma sale
    /// en cuanto se pone, la ventana no recibe pregunta, y no hay respuesta que
    /// valga. Quitar la pregunta la vuelve a dejar así.
    #[cfg(windows)]
    #[test]
    fn la_roja_solo_con_el_pin() {
        let _f = en_fila();
        std::env::set_var("ADEORQ_ESCUDO_FIRMA_DE_PRUEBA", "1");
        let dir = std::env::temp_dir().join(format!("adeorq-escudo-solo-pin-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        *CARPETA.lock().unwrap() = Some(dir.clone());
        escudo_crear_llave().unwrap();
        assert!(escudo_paso_pregunta(true).unwrap_err().contains("Primero guarda"), "sin pregunta no se pone su paso");
        let pide = |p: &Peticion| {
            json!({
                "adeorq": "escudo", "tipo": p.tipo, "panel": p.panel, "clave": null, "cli": p.cli, "sesion": p.sesion, "objeto": p.objeto,
                "titulo": p.titulo, "explicacion": p.explicacion, "diff": p.diff, "desde": p.desde, "hasta": p.hasta, "nonce": p.nonce,
            })
        };
        let ventana = |evento: &str, carga: Value| {
            if evento == "escudo-pedido" {
                assert!(carga["pregunta"].is_null(), "solo con el PIN no se enseña la pregunta: {carga}");
                let id = carga["id"].as_u64().unwrap();
                std::thread::spawn(move || {
                    escudo_firmar(id).unwrap();
                    assert!(escudo_comprobar(id, "respuesta".into(), "x".into()).is_err());
                });
            }
            Ok(())
        };
        let publica = std::fs::read(dir.join("llave-publica-de-prueba.der")).unwrap();
        for (n, antes) in [("A", None), ("B", Some(("¿Dónde?", "aquí")))] {
            if let Some((q, r)) = antes {
                // Guardar la pregunta pone su paso; quitarlo deja la roja como antes.
                escudo_preparar(q.into(), r.into()).unwrap();
                escudo_paso_pregunta(false).unwrap();
            }
            let p = Peticion { nonce: n.repeat(43), ..peticion("rojo", ahora_ms()) };
            let firma = atender_con(&ventana, &|| {}, &pide(&p), QuienPide::Terminal(9), Duration::from_secs(20)).unwrap();
            let firma = base64::engine::general_purpose::STANDARD.decode(firma).unwrap();
            assert!(hello::comprobar(&publica, mensaje(&p).as_bytes(), &firma).unwrap());
        }
        std::env::remove_var("ADEORQ_ESCUDO_FIRMA_DE_PRUEBA");
        *CARPETA.lock().unwrap() = None;
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// «No lo dejes», y el tiempo que se acaba: los dos acaban en error, y los
    /// tres «no» callan a la terminal.
    #[cfg(windows)]
    #[test]
    fn un_no_y_un_silencio_no_dan_firma() {
        let _f = en_fila();
        std::env::set_var("ADEORQ_ESCUDO_FIRMA_DE_PRUEBA", "1");
        let dir = std::env::temp_dir().join(format!("adeorq-escudo-no-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        *CARPETA.lock().unwrap() = Some(dir.clone());
        escudo_preparar("¿Dónde?".into(), "aquí".into()).unwrap();
        escudo_crear_llave().unwrap();
        let v = |n: &str| {
            let p = Peticion { nonce: n.repeat(43), ..peticion("pin", ahora_ms()) };
            json!({"tipo": p.tipo, "panel": 3, "cli": "", "sesion": p.sesion, "objeto": p.objeto, "titulo": p.titulo,
                   "explicacion": p.explicacion, "desde": p.desde, "hasta": p.hasta, "nonce": p.nonce})
        };
        let di_que_no = |evento: &str, carga: Value| {
            if evento == "escudo-pedido" {
                let id = carga["id"].as_u64().unwrap();
                std::thread::spawn(move || escudo_rechazar(id).unwrap());
            }
            Ok(())
        };
        let callate = |_: &str, _: Value| Ok(());
        let quien = QuienPide::Terminal(3);
        assert_eq!(atender_con(&di_que_no, &|| {}, &v("p"), quien, Duration::from_secs(10)).unwrap_err(), "no lo has dejado");
        assert_eq!(atender_con(&callate, &|| {}, &v("q"), quien, Duration::from_millis(300)).unwrap_err(), "nadie contestó a tiempo");
        assert_eq!(atender_con(&di_que_no, &|| {}, &v("r"), quien, Duration::from_secs(10)).unwrap_err(), "no lo has dejado");
        assert!(atender_con(&di_que_no, &|| {}, &v("s"), quien, Duration::from_secs(10)).unwrap_err().contains("tres «no»"));
        // Y el escudo sin instalar, desde fuera, lo dice así.
        *CARPETA.lock().unwrap() = Some(dir.join("no-existe"));
        assert_eq!(atender_con(&callate, &|| {}, &v("t"), QuienPide::Fuera, Duration::from_millis(10)).unwrap_err(), "el escudo no está instalado en este equipo");
        std::env::remove_var("ADEORQ_ESCUDO_FIRMA_DE_PRUEBA");
        *CARPETA.lock().unwrap() = None;
        let _ = std::fs::remove_dir_all(&dir);
    }
}
