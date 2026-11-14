//! El relevo por cuota: una terminal que abrió un agente con `open_pane` y se
//! queda sin cuota en su cuenta sigue sola en otra cuenta que sí tenga.
//!
//! Munir, 2026-11-14: «si en una cuenta secundaria que la principal haya
//! abierto una sesion y se le acaba la cuota a la secundaria que se abra otra
//! terminal en la principal o la que tenga cuota para terminar la tarea en el
//! menor tiempo posible». Las que abrió él a mano NO se relevan solas (D8: nada
//! sin su clic); para esas sigue el relevo del menú de la terminal
//! (`lib/relevo.ts`).
//!
//! **Sigue la MISMA conversación, no un acta.** Medido el 2026-11-14 con Claude
//! Code 2.1.325 y una API de mentira: un `.jsonl` copiado a
//! `projects/<carpeta>/` de otro `CLAUDE_CONFIG_DIR` se retoma con `--resume
//! <id>`, escribe en el mismo archivo y manda la historia entera. Y la API lo
//! admite por escrito (platform.claude.com, «Preserved thinking», «Accounts and
//! cloud platforms»: «A move to another account […] works the same way: keep
//! sending the full history»); el razonamiento de Opus 5.5 vale en cualquier
//! cuenta, y el de Sonnet 5.5, Haiku 5.5 y Fable 5.2 se cae sin error. Así que
//! la conversación se MUEVE a la cuenta nueva (no se copia: dos copias del mismo
//! id salían dos veces en la barra y contaban dos veces en tu uso) y se abre
//! con `--resume`. Si no se puede mover, la nueva nace con el acta de
//! `lib/relevo.ts`.
//!
//! **Cómo se ve que se quedó sin cuota**, medido en sus transcripts (2.1.296 a
//! 2.1.323): Claude Code apunta una respuesta suya de mentira (`"model":
//! "<synthetic>"`) con `"error": "rate_limit"`, `"apiErrorStatus": 429` y
//! `quotaLimits` (`"status": "rejected"`, `rateLimitType` `five_hour` o
//! `seven_day`, `resetsAt` en segundos), y se queda esperando a la renovación
//! («continuing automatically at 3:40am»). Hasta la 2.1.318 avisa antes con una
//! nota (`"usageLimitNote": "wrap_up"`) para que el agente recoja y acabe su
//! turno; `"release"` la retira. Se lee del transcript y no de la pantalla: el
//! texto de la pantalla cambia con cada versión, esto no.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::Manager;

use super::{Madre, Puente};

/// Lo que se sabe de una conversación parada por cuota.
#[derive(Clone, Debug, PartialEq)]
pub struct SinCuota {
    /// `five_hour`, `seven_day`… tal cual lo apunta Claude Code. `None` tras la
    /// nota de recoger, que no lo dice.
    pub tipo: Option<String>,
    /// Cuándo se renueva, en segundos desde 1970, si lo dice.
    pub renueva_s: Option<u64>,
    /// Lo que pintó Claude Code, para el rastro.
    pub texto: String,
}

/// Hasta cuántas entradas hacia atrás se mira: de sobra para el último turno.
const ENTRADAS: usize = 800;

fn rechazada(e: &Value) -> bool {
    e["quotaLimits"]["status"] == "rejected"
        || e["apiError"] == "usage_limit_reached"
        || e["apiErrorParams"]["rate_limit_info"]["status"] == "rejected"
}

/// Lo que Claude Code apunta como mensaje y no lo es: un comando de barra
/// (`/compact`, que sin cuota falla con «Error during compaction: You've hit
/// your 5-hour limit»), su salida, o el aviso de una tarea de fondo. Medido en la
/// terminal 19 el 2026-11-14 (caso real de las 02:41, BUZON): tras el 429, la
/// raya de contexto le tecleó `/compact` y luego llegó un `<task-notification>`.
const NO_SON_MENSAJES: [&str; 5] = ["<command-name>", "<command-message>", "<local-command-", "<task-notification>", "<system-reminder>"];

/// Un mensaje que escribió alguien (no una nota de Claude Code, un comando de
/// barra ni el resultado de una herramienta): el principio de un turno.
fn es_un_mensaje(e: &Value) -> bool {
    if e["isMeta"] == true {
        return false;
    }
    let de_verdad = |t: &str| {
        let t = t.trim_start();
        !t.is_empty() && !NO_SON_MENSAJES.iter().any(|n| t.starts_with(n))
    };
    match &e["message"]["content"] {
        Value::String(s) => de_verdad(s),
        Value::Array(partes) => partes.iter().any(|p| p["type"] == "text" && p["text"].as_str().is_some_and(de_verdad)),
        _ => false,
    }
}

/// Si la conversación está parada por cuota, leída de las últimas líneas de su
/// transcript. `desde_ms`: lo de antes no cuenta (la que nace de un relevo
/// arrastra el 429 de la cuenta vieja hasta que manda su primer mensaje).
///
/// Se mira solo el último turno, hacia atrás:
/// - la respuesta de mentira con el 429 de cuota, si aún no se ha renovado;
/// - o la nota de recoger, si después el turno acabó (el agente cerró su parte
///   y se paró con trabajo por delante);
/// - cualquier otra cosa (una respuesta de verdad sin nota, un mensaje nuevo
///   esperando respuesta, la nota de que ya pasó) es que no.
pub fn sin_cuota<S: AsRef<str>>(lineas: &[S], ahora_ms: u64, desde_ms: u64) -> Option<SinCuota> {
    let mut turno_acabado = false;
    // Una respuesta de verdad después del 429 es que ya hay cuota otra vez.
    let mut respondio = false;
    for l in lineas.iter().rev().take(ENTRADAS) {
        let l = l.as_ref();
        if !(l.contains("\"type\":\"assistant\"") || l.contains("\"type\":\"user\"") || l.contains("turn_duration")) {
            continue;
        }
        let Ok(e) = serde_json::from_str::<Value>(l) else { continue };
        if e["isSidechain"] == true {
            continue;
        }
        let cuando = e["timestamp"].as_str().and_then(crate::escudo::iso_a_ms).map(|t| t.max(0) as u64);
        let de_antes = cuando.is_some_and(|t| t < desde_ms);
        match e["type"].as_str() {
            Some("system") if e["subtype"] == "turn_duration" => turno_acabado = true,
            Some("assistant") => {
                if e["error"] == "rate_limit" {
                    let texto = e["message"]["content"][0]["text"].as_str().unwrap_or_default().to_string();
                    if !(rechazada(&e) || texto.starts_with("You've hit your")) || de_antes || respondio {
                        return None;
                    }
                    let renueva_s = e["quotaLimits"]["resetsAt"]
                        .as_u64()
                        .or_else(|| e["apiErrorParams"]["rate_limit_info"]["resetsAt"].as_u64());
                    if renueva_s.is_some_and(|r| r.saturating_mul(1000) <= ahora_ms) {
                        return None;
                    }
                    let tipo = e["quotaLimits"]["rateLimitType"]
                        .as_str()
                        .or_else(|| e["apiErrorParams"]["rate_limit_info"]["rateLimitType"].as_str())
                        .map(str::to_string);
                    return Some(SinCuota { tipo, renueva_s, texto });
                }
                // Otro fallo de la API no es de cuota, y no se arregla con otra cuenta.
                if e["isApiErrorMessage"] == true {
                    return None;
                }
                respondio = true;
            }
            Some("user") => {
                match e["usageLimitNote"].as_str() {
                    Some("release") => return None,
                    Some("wrap_up") if !de_antes && turno_acabado => {
                        return Some(SinCuota {
                            tipo: None,
                            renueva_s: None,
                            texto: "Usage limit reached (Claude Code le pidió recoger y acabó su turno)".into(),
                        })
                    }
                    Some("wrap_up") => return None,
                    _ => {}
                }
                if es_un_mensaje(&e) {
                    return None;
                }
            }
            _ => {}
        }
    }
    None
}

/// El tope de 5 horas, la semana… en palabras.
pub fn que_tope(tipo: Option<&str>) -> &'static str {
    match tipo {
        Some("five_hour") => "su tope de 5 horas",
        Some("seven_day") => "su semana",
        Some(t) if t.starts_with("seven_day") => "su semana para ese modelo",
        _ => "su cuota",
    }
}

/// Lo que se renueva, «a las 03:40 UTC» (o con día si no es hoy).
fn cuando_renueva(renueva_s: Option<u64>, ahora_ms: u64) -> String {
    let Some(s) = renueva_s else { return String::new() };
    let (dia, hora) = crate::rastros::fecha_hora_utc(s.saturating_mul(1000));
    if dia == crate::rastros::fecha_hora_utc(ahora_ms).0 {
        format!(", que se renueva a las {hora} UTC")
    } else {
        format!(", que se renueva el {dia} a las {hora} UTC")
    }
}

/// Lo que se le dice a quien la abrió, pegado a la respuesta de su siguiente
/// llamada al MCP (como el aviso de la raya roja).
pub fn aviso_relevada(viejo: u32, nuevo: u32, nombre: &str, cwd: &str, sc: &SinCuota, agotada: &str, cuenta: &str, misma: bool, rastro: Option<&str>, ahora_ms: u64) -> String {
    let sigue = if misma {
        "sigue la MISMA conversación (se mudó a esa cuenta y se retomó con --resume): no hace falta contarle nada"
    } else {
        "no se pudo mudar la conversación, así que nació con un acta de dónde iba (para qué se abrió y lo último que dijo): mira que la haya entendido"
    };
    let rastro = rastro.map(|r| format!(" Su rastro: {r}.")).unwrap_or_default();
    format!(
        "Aviso de Adeorq: la terminal {viejo} que abriste («{nombre}», {cwd}) se quedó sin cuota en la cuenta «{agotada}» ({}{}). Adeorq la ha relevado sola: ahora es la terminal {nuevo}, con la cuenta «{cuenta}», y {sigue}. Usa la {nuevo} desde ahora; la {viejo} ya está cerrada.{rastro}",
        que_tope(sc.tipo.as_deref()),
        cuando_renueva(sc.renueva_s, ahora_ms),
    )
}

/// Y cuando no hay adónde ir: se queda donde está, y Claude Code sigue solo al renovarse.
pub fn aviso_sin_sitio(viejo: u32, nombre: &str, sc: &SinCuota, agotada: &str, porque: &str, ahora_ms: u64) -> String {
    format!(
        "Aviso de Adeorq: la terminal {viejo} que abriste («{nombre}») se quedó sin cuota en la cuenta «{agotada}» ({}{}), y no la he relevado: {porque} Claude Code seguirá solo en cuanto se renueve.",
        que_tope(sc.tipo.as_deref()),
        cuando_renueva(sc.renueva_s, ahora_ms),
    )
}

/// ==========================================================================
/// EL VIGÍA
/// ==========================================================================

/// Cada cuánto se miran las delegadas. Leer la cola de seis transcripts es nada,
/// y una que se queda sin cuota no pierde más de medio minuto.
const CADA: Duration = Duration::from_secs(30);
/// Sin otra cuenta con sitio se vuelve a preguntar al cabo de esto: la cuota de
/// las otras cambia, y se renuevan.
const REINTENTO: Duration = Duration::from_secs(15 * 60);
/// Como mucho tantos relevos de la misma conversación en `VENTANA_TOPE`: si la
/// lectura se equivocara, un bucle de relevos quemaría las cuentas una tras otra.
const TOPE_RELEVOS: usize = 3;
const VENTANA_TOPE: Duration = Duration::from_secs(6 * 3600);
/// Cuánto de la cola del transcript se lee: el último turno cabe de sobra.
const COLA_BYTES: u64 = 512 * 1024;

#[derive(Default)]
struct Estado {
    /// Panel → desde cuándo cuenta su transcript (los que nacen de un relevo).
    desde: HashMap<u32, u64>,
    /// Conversación → cuándo se relevó.
    relevos: HashMap<String, Vec<Instant>>,
    /// Panel → cuándo se intentó sin encontrar otra cuenta, y si ya se avisó.
    sin_sitio: HashMap<u32, Instant>,
    /// Panel → el tamaño y la hora del transcript que ya se leyó sin nada.
    leido: HashMap<u32, (u64, std::time::SystemTime)>,
}

static ESTADO: Mutex<Option<Estado>> = Mutex::new(None);
/// Los avisos que esperan a que su madre llame al MCP.
static AVISOS: Mutex<Vec<(Madre, String)>> = Mutex::new(Vec::new());

fn con_estado<T>(f: impl FnOnce(&mut Estado) -> T) -> T {
    let mut g = ESTADO.lock().unwrap_or_else(|e| e.into_inner());
    f(g.get_or_insert_with(Estado::default))
}

/// Los avisos de relevo para quien llama ahora, si es la madre de alguno.
pub(super) fn avisos_para(app: &tauri::AppHandle, quien: Option<u32>, conexion: u64) -> Option<String> {
    let mut avisos = AVISOS.lock().unwrap_or_else(|e| e.into_inner());
    if avisos.is_empty() {
        return None;
    }
    let mi_sesion = quien.and_then(|p| super::sesion_del_panel(app, p));
    let mut suyos = Vec::new();
    avisos.retain(|(m, t)| {
        let es = super::es_suya(Some(m), quien, mi_sesion.as_deref(), conexion);
        if es {
            suyos.push(t.clone());
        }
        !es
    });
    (!suyos.is_empty()).then(|| suyos.join("\n"))
}

fn avisar(madre: &Madre, texto: String) {
    crate::anotar(&format!("relevo por cuota: {texto}"));
    AVISOS.lock().unwrap_or_else(|e| e.into_inner()).push((madre.clone(), texto));
}

fn ahora_ms() -> u64 {
    super::ahora_ms()
}

/// La cola de un transcript, en líneas enteras, sin pasar por la caché de
/// `sessions.rs` (es de quien mira una conversación, y seis colas cada medio
/// minuto la vaciarían).
fn cola(ruta: &Path) -> Option<Vec<String>> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = std::fs::File::open(ruta).ok()?;
    let tam = f.metadata().ok()?.len();
    let desde = tam.saturating_sub(COLA_BYTES);
    f.seek(SeekFrom::Start(desde)).ok()?;
    let mut bytes = Vec::new();
    f.read_to_end(&mut bytes).ok()?;
    let texto = String::from_utf8_lossy(&bytes);
    let mut lineas: Vec<String> = texto.lines().map(str::to_string).collect();
    if desde > 0 && !lineas.is_empty() {
        lineas.remove(0);
    }
    Some(lineas)
}

/// La cuenta en que vive ese transcript: la cadena de `raices_claude` (vacía, la
/// principal) y su carpeta.
fn cuenta_del_transcript(ruta: &Path) -> Option<(String, PathBuf)> {
    crate::sessions::raices_claude().into_iter().find(|(_, r)| ruta.starts_with(r))
}

/// La carpeta de configuración de una cuenta, por la carpeta que guarda Cuentas
/// (vacía, la principal).
fn raiz_de_cuenta(dir: &str) -> Option<PathBuf> {
    if dir.trim().is_empty() {
        crate::dir_casa().map(|c| c.join(".claude"))
    } else {
        Some(PathBuf::from(dir))
    }
}

/// Muda la conversación (y su carpeta de al lado: subagentes, salidas largas) a
/// otra cuenta. Lo ya contado en tu uso se muda con ella.
pub fn mudar(origen: &Path, raiz_destino: &Path, cwd: &str, sesion: &str) -> Result<PathBuf, String> {
    let dir = raiz_destino.join("projects").join(crate::sessions::encode_claude(cwd));
    let destino = dir.join(format!("{sesion}.jsonl"));
    if destino.exists() {
        return Err(format!("ya hay una conversación {sesion} en {}", dir.display()));
    }
    std::fs::create_dir_all(&dir).map_err(|e| format!("no pude crear {}: {e}", dir.display()))?;
    let viejo = std::fs::canonicalize(origen).unwrap_or_else(|_| origen.to_path_buf());
    let lado = origen.with_extension("");
    let lado_viejo = lado.is_dir().then(|| std::fs::canonicalize(&lado).unwrap_or_else(|_| lado.clone()));
    // El proceso viejo acaba de morir: Windows puede tardar un poco en soltar el archivo.
    let mut ultimo = String::new();
    let mut movido = false;
    for _ in 0..10 {
        match std::fs::rename(origen, &destino) {
            Ok(()) => {
                movido = true;
                break;
            }
            Err(e) => {
                ultimo = e.to_string();
                std::thread::sleep(Duration::from_millis(400));
            }
        }
    }
    if !movido {
        return Err(format!("no pude mudar {}: {ultimo}", origen.display()));
    }
    let nuevo = std::fs::canonicalize(&destino).unwrap_or_else(|_| destino.clone());
    crate::uso_historia::mudada(&viejo, &nuevo);
    if let Some(lado_viejo) = lado_viejo {
        let lado_nuevo = destino.with_extension("");
        if !lado_nuevo.exists() && std::fs::rename(&lado, &lado_nuevo).is_ok() {
            crate::uso_historia::mudada(&lado_viejo, &std::fs::canonicalize(&lado_nuevo).unwrap_or(lado_nuevo));
        }
    }
    Ok(destino)
}

/// Arranca el vigía, en su hilo. `ADEORQ_RELEVO=0` lo apaga; `ADEORQ_RELEVO_CADA_S`
/// cambia el ritmo (para los laboratorios).
pub fn arrancar(app: tauri::AppHandle) {
    if std::env::var("ADEORQ_RELEVO").is_ok_and(|v| v.trim() == "0") {
        return;
    }
    let cada = std::env::var("ADEORQ_RELEVO_CADA_S")
        .ok()
        .and_then(|s| s.trim().parse::<u64>().ok())
        .filter(|s| *s > 0)
        .map_or(CADA, Duration::from_secs);
    std::thread::spawn(move || loop {
        std::thread::sleep(cada);
        una_vuelta(&app);
    });
}

/// Si la abrió un encargo programado: ese lleva su propia cuenta y su freno, y
/// cierra su terminal al acabar por su número (`programados.rs`).
fn es_de_programado(m: &Madre) -> bool {
    m.panel.is_none() && m.nombre.as_deref().is_some_and(|n| n.starts_with("el encargo programado"))
}

/// La CLI que se releva: el vigía solo sabe leer el «sin cuota» de un transcript
/// de Claude Code (`es_claude`). Va en los pedidos a la ventana, que solo busca
/// cuentas de esa misma CLI (una conversación no sigue en una cuenta de otra).
const CLI: &str = "claude";

fn una_vuelta(app: &tauri::AppHandle) {
    let delegadas: Vec<(u32, Madre)> = app.state::<Puente>().delegadas.lock().unwrap().iter().map(|(p, m)| (*p, m.clone())).collect();
    let ahora = ahora_ms();
    for (id, madre) in delegadas {
        if crate::pty::cerrada_a_mano(id) || es_de_programado(&madre) {
            continue;
        }
        let Some(f) = crate::pty::ficha(app, id) else { continue };
        let Some(cmd) = f.command.clone() else { continue };
        if !crate::rastros::es_claude(&cmd) {
            continue;
        }
        let Some(sesion) = crate::rastros::sesion_del_comando(&cmd) else { continue };
        let Some(ruta) = crate::sessions::transcript_de(&f.cwd, Some(&sesion)) else { continue };
        // Un transcript que no ha cambiado desde que se leyó sin nada, sigue sin nada.
        let marca = std::fs::metadata(&ruta).ok().and_then(|m| Some((m.len(), m.modified().ok()?)));
        if marca.is_some() && con_estado(|e| e.leido.get(&id) == marca.as_ref()) {
            continue;
        }
        let Some(lineas) = cola(&ruta) else { continue };
        let desde = con_estado(|e| e.desde.get(&id).copied().unwrap_or(0));
        let Some(sc) = sin_cuota(&lineas, ahora, desde) else {
            if let Some(m) = marca {
                con_estado(|e| {
                    e.leido.insert(id, m);
                    e.sin_sitio.remove(&id);
                });
            }
            continue;
        };
        // Ya se intentó y no había adónde ir: se espera un rato.
        if con_estado(|e| e.sin_sitio.get(&id).is_some_and(|t| t.elapsed() < REINTENTO)) {
            continue;
        }
        let tope = con_estado(|e| {
            let v = e.relevos.entry(sesion.clone()).or_default();
            v.retain(|t| t.elapsed() < VENTANA_TOPE);
            v.len() >= TOPE_RELEVOS
        });
        if tope {
            continue;
        }
        if let Err(e) = relevar(app, id, &f.cwd, &cmd, &sesion, &ruta, &madre, &sc) {
            crate::anotar(&format!("relevo por cuota de la terminal {id}: {e}"));
            // Falle por lo que falle, no se reintenta cada medio minuto.
            con_estado(|e| {
                e.sin_sitio.entry(id).or_insert_with(Instant::now);
            });
        }
    }
}

/// El relevo de una: elegir la cuenta, cerrar la vieja, mudar su conversación,
/// abrir la nueva con `--resume` y decírselo a quien la abrió.
#[allow(clippy::too_many_arguments)]
fn relevar(app: &tauri::AppHandle, id: u32, cwd: &str, cmd: &[String], sesion: &str, ruta: &Path, madre: &Madre, sc: &SinCuota) -> Result<(), String> {
    let (agotada_dir, raiz_vieja) = cuenta_del_transcript(ruta).ok_or("no sé de qué cuenta es su transcript")?;
    // 1. La ventana elige la cuenta, como open_pane sin `account`, sin la agotada.
    let r = super::pedir_a_la_ventana_con(
        app,
        "relevo_cuenta",
        json!({ "paneId": id, "cli": CLI, "cwd": cwd, "agotada": agotada_dir }),
        Duration::from_secs(15),
    );
    let datos = match r {
        Ok(r) => r.datos.unwrap_or_default(),
        Err(porque) => {
            // Sin adónde ir (o la ventana sin contestar): se reintenta más tarde, y a
            // la madre se le dice una vez por cada vez que se queda sin cuota.
            let primera = con_estado(|e| e.sin_sitio.insert(id, Instant::now()).is_none());
            if primera {
                let nombre = nombre_del_panel(app, id);
                avisar(madre, aviso_sin_sitio(id, &nombre, sc, &etiqueta_de(&agotada_dir), &porque, ahora_ms()));
            }
            return Err(porque);
        }
    };
    let texto = |k: &str| datos[k].as_str().unwrap_or_default().to_string();
    let cuenta = datos["cuenta"].clone();
    let dir_nueva = cuenta["dir"].as_str().unwrap_or_default().to_string();
    let etiqueta_nueva = cuenta["label"].as_str().unwrap_or("otra cuenta").to_string();
    let agotada = Some(texto("agotada")).filter(|s| !s.is_empty()).unwrap_or_else(|| etiqueta_de(&agotada_dir));
    let nombre = Some(texto("nombre")).filter(|s| !s.is_empty()).unwrap_or_else(|| format!("terminal {id}"));
    let raiz_nueva = raiz_de_cuenta(&dir_nueva).ok_or("no sé cuál es la carpeta de esa cuenta")?;
    let igual = |a: &Path, b: &Path| std::fs::canonicalize(a).ok().zip(std::fs::canonicalize(b).ok()).is_some_and(|(x, y)| x == y);
    if igual(&raiz_nueva, &raiz_vieja) {
        return Err("la ventana eligió la misma cuenta".into());
    }

    // 2. Se cierra la vieja: sin olvidar que es delegada, que la nueva sigue su
    // misma conversación y tiene que volver con su «de: …».
    crate::pty::apuntar_cerrada(id);
    super::pedir_a_la_ventana(app, "close_pane", json!({ "paneId": id, "relevo": true }))?;
    let hasta = Instant::now() + Duration::from_secs(10);
    while crate::pty::existe(app, id) && Instant::now() < hasta {
        std::thread::sleep(Duration::from_millis(100));
    }
    std::thread::sleep(Duration::from_millis(600));

    // 3. Su conversación se muda a la cuenta nueva. Si no se puede, la nueva nace
    // con el acta.
    let mudada = mudar(ruta, &raiz_nueva, cwd, sesion);
    if let Err(e) = &mudada {
        crate::anotar(&format!("relevo por cuota de la terminal {id}: {e}; la nueva nace con el acta"));
    }
    let misma = mudada.is_ok();

    // 4. La nueva, en la cuenta elegida.
    let abierta = super::pedir_a_la_ventana(
        app,
        "relevo_abrir",
        json!({
            "cli": CLI,
            "cuenta": cuenta,
            "cwd": cwd,
            "nombre": nombre,
            "sesion": if misma { Value::String(sesion.to_string()) } else { Value::Null },
            "sesionVieja": sesion,
            "comando": cmd,
            "agotada": agotada,
            "tipo": sc.tipo,
            "renueva": sc.renueva_s,
        }),
    );
    let abierta = match abierta {
        Ok(a) => a,
        Err(e) => {
            avisar(
                madre,
                format!(
                    "Aviso de Adeorq: la terminal {id} que abriste («{nombre}», {cwd}) se quedó sin cuota en «{agotada}». La cerré para relevarla en «{etiqueta_nueva}» y no pude abrir la nueva ({e}). Su conversación es la {sesion}{}: ábrela tú con open_pane y account «{etiqueta_nueva}».",
                    if misma { ", ya mudada a esa cuenta" } else { "" }
                ),
            );
            return Err(e);
        }
    };
    let nuevo = abierta.pane_id.ok_or("la ventana no devolvió el número de la nueva")?;
    let hasta = Instant::now() + Duration::from_secs(6);
    while !crate::pty::existe(app, nuevo) && Instant::now() < hasta {
        std::thread::sleep(Duration::from_millis(50));
    }
    con_estado(|e| {
        e.desde.insert(nuevo, ahora_ms());
        e.relevos.entry(sesion.to_string()).or_default().push(Instant::now());
        e.sin_sitio.remove(&id);
        e.leido.remove(&id);
    });

    // 5. La nueva es de la misma madre. Con la misma conversación ya lo hizo
    // `al_nacer` al arrancar su PTY (la vieja seguía apuntada); con el acta, es
    // otra conversación y se apunta aquí, y la vieja queda dicha.
    let puente = app.state::<Puente>();
    let ya = puente.delegadas.lock().unwrap().contains_key(&nuevo);
    if !ya {
        super::apuntar_delegada(app, nuevo, madre.clone(), None, abierta.datos.as_ref());
    }
    if !misma {
        let cierre = super::delegadas::Cierre { ms: ahora_ms(), como: super::delegadas::Como::Cuota, por: Some(nuevo), rastro: None };
        super::apuntar_cierre(app, sesion, cierre);
    }
    puente.delegadas.lock().unwrap().remove(&id);
    puente.avisadas.lock().unwrap().remove(&id);
    // En el presupuesto, la nueva ocupa el sitio de la vieja: un relevo no es una
    // apertura más ni cuenta para las doce por hora.
    for a in puente.aperturas.lock().unwrap().iter_mut() {
        if a.1 == id {
            a.1 = nuevo;
        }
    }

    // 6. Su rastro y el aviso.
    let cuerpo = format!(
        "Se quedó sin cuota en la cuenta «{agotada}» ({}{}): «{}». Adeorq la relevó sola con la terminal {nuevo} en la cuenta «{etiqueta_nueva}»{}. Lo que hizo y lo que falta está en esa conversación.",
        que_tope(sc.tipo.as_deref()),
        cuando_renueva(sc.renueva_s, ahora_ms()),
        sc.texto.trim(),
        if misma { ", que sigue la MISMA conversación (`--resume`)" } else { ", que nació con un acta porque la conversación no se pudo mudar" },
    );
    let rastro = crate::dir_datos()
        .and_then(|d| crate::rastros::escribir_de_cuota(&d.join("rastros"), &nombre, cwd, sesion, &format!("Siguió en la terminal {nuevo} con la cuenta «{etiqueta_nueva}»"), &cuerpo, ahora_ms()))
        .map_err(|e| crate::anotar(&format!("relevo por cuota: no pude escribir el rastro: {e}")))
        .ok();
    let mut aviso = aviso_relevada(id, nuevo, &nombre, cwd, sc, &agotada, &etiqueta_nueva, misma, rastro.as_ref().map(|r| r.display().to_string()).as_deref(), ahora_ms());
    if let Some(parte) = abierta.parte.filter(|p| !p.trim().is_empty()) {
        aviso.push(' ');
        aviso.push_str(parte.trim());
    }
    avisar(madre, aviso);
    Ok(())
}

fn nombre_del_panel(app: &tauri::AppHandle, id: u32) -> String {
    super::pedir_a_la_ventana_con(app, "paneles", json!({}), Duration::from_secs(4))
        .ok()
        .and_then(|r| r.datos)
        .and_then(|d| d.as_array().cloned())
        .and_then(|ps| ps.iter().find(|p| p["id"].as_u64() == Some(id as u64)).and_then(|p| p["name"].as_str().map(str::to_string)))
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| format!("terminal {id}"))
}

/// El nombre de una cuenta por su carpeta, cuando la ventana no lo dijo.
fn etiqueta_de(dir: &str) -> String {
    if dir.trim().is_empty() {
        "principal".into()
    } else {
        Path::new(dir).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| dir.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 2026-11-13 00:30 UTC, justo después del 429 de la terminal de la papelera.
    const AHORA: u64 = 1_794_530_000_000;

    fn linea(v: Value) -> String {
        v.to_string()
    }
    fn usuario(texto: &str, ts: &str) -> String {
        linea(json!({ "type": "user", "timestamp": ts, "message": { "role": "user", "content": texto } }))
    }
    fn respuesta(texto: &str, ts: &str) -> String {
        linea(json!({ "type": "assistant", "timestamp": ts, "message": { "model": "claude-opus-5-5", "role": "assistant", "content": [{ "type": "text", "text": texto }] } }))
    }
    fn herramienta(ts: &str) -> String {
        linea(json!({ "type": "user", "timestamp": ts, "message": { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "t", "content": "ok" }] } }))
    }
    fn fin(ts: &str) -> String {
        linea(json!({ "type": "system", "subtype": "turn_duration", "timestamp": ts }))
    }
    /// La línea de verdad de la 2.1.323 (papelera, 2026-11-13), recortada.
    fn el_429(ts: &str, renueva: u64, tipo: &str) -> String {
        linea(json!({
            "type": "assistant", "timestamp": ts,
            "message": { "model": "<synthetic>", "role": "assistant", "content": [{ "type": "text", "text": "You've hit your 5-hour limit · resets 3:40am (Europe/Madrid)" }] },
            "apiError": "usage_limit_reached",
            "quotaLimits": { "status": "rejected", "resetsAt": renueva, "rateLimitType": tipo },
            "error": "rate_limit", "isApiErrorMessage": true, "apiErrorStatus": 429
        }))
    }
    fn nota(cual: &str, ts: &str) -> String {
        linea(json!({ "type": "user", "timestamp": ts, "isMeta": true, "usageLimitNote": cual, "message": { "role": "user", "content": "[Usage limit reached; …]" } }))
    }

    #[test]
    fn el_429_de_cuota_es_sin_cuota_hasta_que_se_renueva() {
        let l = vec![usuario("haz esto", "2026-11-13T00:20:00.000Z"), herramienta("2026-11-13T00:25:00.000Z"), el_429("2026-11-13T00:29:34.725Z", 1_794_537_600, "five_hour"), fin("2026-11-13T00:29:34.750Z")];
        let sc = sin_cuota(&l, AHORA, 0).expect("sin cuota");
        assert_eq!(sc.tipo.as_deref(), Some("five_hour"));
        assert_eq!(sc.renueva_s, Some(1_794_537_600));
        assert!(sc.texto.contains("5-hour limit"));
        // Ya renovada, Claude Code sigue solo: no hay nada que relevar.
        assert_eq!(sin_cuota(&l, 1_794_537_600_000, 0), None);
        // Y la que nace de un relevo no cuenta el 429 de la cuenta vieja.
        assert_eq!(sin_cuota(&l, AHORA, 1_794_529_990_000), None);
    }

    #[test]
    fn tras_el_429_un_mensaje_o_una_respuesta_dicen_que_ya_no() {
        let base = vec![el_429("2026-11-13T00:29:34.725Z", 1_794_537_600, "seven_day"), fin("2026-11-13T00:29:34.750Z")];
        // Al renovarse, Claude Code se escribe «Continue…» y vuelve a trabajar.
        let mut l = base.clone();
        l.push(usuario("Your claude.ai usage limit has reset. Continue the task…", "2026-11-13T02:41:11.090Z"));
        assert_eq!(sin_cuota(&l, AHORA, 0), None);
        l.push(respuesta("Sigo.", "2026-11-13T02:41:20.000Z"));
        assert_eq!(sin_cuota(&l, AHORA, 0), None);
        // Y si le escriben y vuelve a dar 429, sigue sin cuota.
        let mut l = base;
        l.push(usuario("¿sigues?", "2026-11-13T00:31:00.000Z"));
        l.push(el_429("2026-11-13T00:31:01.000Z", 1_794_537_600, "seven_day"));
        assert!(sin_cuota(&l, AHORA, 0).is_some());
    }

    #[test]
    fn el_compact_fallido_y_los_avisos_de_tareas_no_tapan_el_429() {
        // La terminal 19, 2026-11-14 01:41 UTC (BUZON, «CASO REAL, 02:41»), en su orden.
        let compact = linea(json!({ "type": "user", "timestamp": "2026-11-14T01:41:51.933Z", "message": { "role": "user", "content": "<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args>Keep the real state…</command-args>" } }));
        let salida = linea(json!({ "type": "system", "subtype": "local_command", "timestamp": "2026-11-14T01:41:52.670Z", "content": "<local-command-stderr>Error during compaction: You've hit your 5-hour limit · resets 3:50am (Europe/Madrid)</local-command-stderr>" }));
        let tarea = usuario("<task-notification> <task-id>bbm469fqg</task-id> …", "2026-11-14T01:45:00.539Z");
        let l = vec![usuario("Before compacting, bring the handoff up to date…", "2026-11-14T01:41:45.778Z"), el_429("2026-11-14T01:41:47.092Z", 1_794_627_000, "five_hour"), fin("2026-11-14T01:41:47.120Z"), compact, salida, tarea.clone()];
        let ahora = 1_794_620_000_000;
        assert!(sin_cuota(&l, ahora, 0).is_some());
        // Si después del aviso de la tarea contesta de verdad, ya hay cuota.
        let mut l = l;
        l.push(respuesta("La tarea acabó.", "2026-11-14T01:45:05.000Z"));
        assert_eq!(sin_cuota(&l, ahora, 0), None);
    }

    /// Contra un transcript de verdad: `ADEORQ_TRANSCRIPT=<ruta> cargo test --lib
    /// relevo_cuota::tests::un_transcript_de_verdad -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn un_transcript_de_verdad() {
        let ruta = std::env::var("ADEORQ_TRANSCRIPT").expect("ADEORQ_TRANSCRIPT=<ruta del .jsonl>");
        let lineas = cola(Path::new(&ruta)).expect("se lee");
        let ahora = std::env::var("ADEORQ_AHORA_MS").ok().and_then(|s| s.parse().ok()).unwrap_or_else(ahora_ms);
        println!("{} líneas; sin_cuota = {:?}", lineas.len(), sin_cuota(&lineas, ahora, 0));
    }

    #[test]
    fn la_nota_de_recoger_cuenta_solo_al_acabar_su_turno() {
        let mut l = vec![usuario("haz esto", "2026-11-13T00:20:00.000Z"), nota("wrap_up", "2026-11-13T00:25:00.000Z"), respuesta("Hecho A; falta B.", "2026-11-13T00:26:00.000Z")];
        // Recogiendo todavía: no se le corta.
        assert_eq!(sin_cuota(&l, AHORA, 0), None);
        l.push(fin("2026-11-13T00:26:01.000Z"));
        let sc = sin_cuota(&l, AHORA, 0).expect("recogió y se paró");
        assert_eq!(sc.tipo, None);
        // La nota que la retira, o un turno nuevo sin nota, dicen que no.
        let mut con_release = l.clone();
        con_release.push(nota("release", "2026-11-13T05:00:00.000Z"));
        assert_eq!(sin_cuota(&con_release, AHORA, 0), None);
        let mut otro_turno = l;
        otro_turno.push(usuario("otra cosa", "2026-11-13T06:00:00.000Z"));
        otro_turno.push(respuesta("Vale.", "2026-11-13T06:00:10.000Z"));
        otro_turno.push(fin("2026-11-13T06:00:11.000Z"));
        assert_eq!(sin_cuota(&otro_turno, AHORA, 0), None);
    }

    #[test]
    fn otros_fallos_y_las_conversaciones_normales_no_son_cuota() {
        let normal = vec![usuario("hola", "2026-11-13T00:20:00.000Z"), respuesta("hola", "2026-11-13T00:20:05.000Z"), fin("2026-11-13T00:20:06.000Z")];
        assert_eq!(sin_cuota(&normal, AHORA, 0), None);
        let caida = linea(json!({ "type": "assistant", "timestamp": "2026-11-13T00:21:00.000Z", "message": { "model": "<synthetic>", "content": [{ "type": "text", "text": "API Error: 500" }] }, "error": "server_error", "isApiErrorMessage": true }));
        assert_eq!(sin_cuota(&[caida], AHORA, 0), None);
        // Un 429 de la API que no es de la cuota de la suscripción.
        let limite_api = linea(json!({ "type": "assistant", "timestamp": "2026-11-13T00:21:00.000Z", "message": { "model": "<synthetic>", "content": [{ "type": "text", "text": "API Error: Rate limited" }] }, "error": "rate_limit", "isApiErrorMessage": true, "apiErrorStatus": 429 }));
        assert_eq!(sin_cuota(&[limite_api], AHORA, 0), None);
        // Lo de un subagente no es de la conversación.
        let sub = linea(json!({ "type": "assistant", "isSidechain": true, "timestamp": "2026-11-13T00:29:00.000Z", "message": { "model": "<synthetic>", "content": [{ "type": "text", "text": "You've hit your 5-hour limit" }] }, "error": "rate_limit", "quotaLimits": { "status": "rejected", "resetsAt": 1_794_537_600u64 } }));
        assert_eq!(sin_cuota(&[sub], AHORA, 0), None);
    }

    #[test]
    fn los_transcripts_viejos_sin_quota_limits_tambien_se_leen() {
        // 2.1.265 (septiembre): sin `quotaLimits` ni `apiError`, solo el texto.
        let viejo = linea(json!({ "type": "assistant", "timestamp": "2026-11-13T00:29:00.000Z", "message": { "model": "<synthetic>", "content": [{ "type": "text", "text": "You've hit your session limit · resets 3pm (Europe/Madrid)" }] }, "error": "rate_limit", "isApiErrorMessage": true }));
        assert!(sin_cuota(&[viejo], AHORA, 0).is_some());
    }

    #[test]
    fn el_aviso_dice_la_nueva_la_cuenta_y_la_hora_en_utc() {
        let sc = SinCuota { tipo: Some("five_hour".into()), renueva_s: Some(1_794_537_600), texto: "x".into() };
        let a = aviso_relevada(4, 9, "Mac", "C:\\proyectos\\Adeorq", &sc, "2da MAIN", "Principal", true, Some("C:\\r.md"), AHORA);
        assert!(a.contains("terminal 4") && a.contains("terminal 9") && a.contains("«2da MAIN»") && a.contains("«Principal»"), "{a}");
        assert!(a.contains("tope de 5 horas") && a.contains("02:40 UTC") && a.contains("MISMA conversación") && a.contains("C:\\r.md"), "{a}");
        let b = aviso_sin_sitio(4, "Mac", &sc, "2da MAIN", "todas las demás están paradas.", AHORA);
        assert!(b.contains("no la he relevado") && b.contains("todas las demás"), "{b}");
    }

    #[test]
    fn mudar_lleva_la_conversacion_y_su_carpeta_y_no_pisa_otra() {
        let base = std::env::temp_dir().join(format!("adeorq-relevo-cuota-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let cwd = "C:\\proyectos\\demo";
        let enc = crate::sessions::encode_claude(cwd);
        let a = base.join("a");
        let b = base.join("b");
        let vieja = a.join("projects").join(&enc).join("s1.jsonl");
        std::fs::create_dir_all(vieja.with_extension("").join("subagents")).unwrap();
        std::fs::write(&vieja, "{}\n").unwrap();
        std::fs::write(vieja.with_extension("").join("subagents").join("agent-1.jsonl"), "{}\n").unwrap();
        let nueva = mudar(&vieja, &b, cwd, "s1").unwrap();
        assert_eq!(nueva, b.join("projects").join(&enc).join("s1.jsonl"));
        assert!(nueva.is_file() && !vieja.exists());
        assert!(nueva.with_extension("").join("subagents").join("agent-1.jsonl").is_file());
        // Otra vez, con la nueva ya ahí: no se pisa.
        std::fs::create_dir_all(vieja.parent().unwrap()).unwrap();
        std::fs::write(&vieja, "{}\n").unwrap();
        assert!(mudar(&vieja, &b, cwd, "s1").unwrap_err().contains("ya hay"));
        let _ = std::fs::remove_dir_all(&base);
    }
}
