//! Avisar a un bot (Grok Bot, Hermes, OpenClaw) cuando una terminal acaba o te espera.
//!
//! Adeorq solo avisa HACIA FUERA: no abre ninguna puerta ni escucha nada, y lo
//! que manda es el nombre de la terminal, su proyecto y qué pasa. Nunca lo que
//! hay en su pantalla (`docs/contexto/bots.md`, camino A).
//!
//! De dónde sale el aviso: de las mismas dos campanas que ya mandan el aviso del
//! escritorio y el del móvil (`src/lib/notify.ts`), más las decisiones que un
//! agente le pide a Munir (`ask_decision`). No hay otra detección.
//!
//! Tres destinos, cada uno apagado de fábrica:
//!
//! - **Grok Bot**: un POST a la dirección del webhook de una rutina, con la clave
//!   como `Authorization: Bearer`. La clave vive en el almacén de secretos
//!   (`secrets.rs`) y la ventana no puede leerla de vuelta. Cada llamada LANZA
//!   una ejecución de verdad de su Bot y gasta de su cuota.
//! - **Hermes**: `hermes send --to <destino> "<texto>"`.
//! - **OpenClaw**: `openclaw message send --target <destino> --message "<texto>"`.
//!
//! Dos cosas que importan más que el resto:
//!
//! 1. **Sin ráfagas.** Varias terminales que acaban a la vez no son una lluvia de
//!    mensajes: lo que llega en `VENTANA` sale junto en UNO, y entre un mensaje
//!    y el siguiente pasan al menos `ESPACIO`. Para Grok Bot cada mensaje es una
//!    ejecución que gasta, así que esto es también un freno de gasto.
//! 2. **Nada de lo que venga en un nombre llega a una shell.** El nombre de una
//!    terminal lo puede poner un agente, así que no es de fiar: el programa se
//!    lanza con sus argumentos por separado (nunca por una línea de shell) y el
//!    texto solo lleva letras, números, espacios y unos pocos signos
//!    (`limpio`). En Windows `openclaw` es un `.cmd`, que pasa por `cmd.exe`, y
//!    ahí `%`, `&`, `^` o `"` valen aunque vayan en un argumento suelto.
//!
//! Un aviso que falla NO saca nada en mitad del trabajo: se apunta en el rastro
//! y Ajustes dice cuál fue el último que no llegó.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::SinVentana;

/// Dónde vive la clave del webhook de Grok Bot, salvo que un laboratorio ponga
/// otro nombre en `ADEORQ_BOTS_CLAVE` para no tocar la del usuario.
const CLAVE_GROK: &str = "bot:grok";

/// Cuánto se espera, desde el primer aviso, a que lleguen más para mandarlos juntos.
const VENTANA: Duration = Duration::from_secs(5);
/// Lo mínimo que pasa entre un mensaje y el siguiente.
const ESPACIO: Duration = Duration::from_secs(30);
/// Cuántos avisos distintos se guardan mientras se espera; los demás solo se cuentan.
const TOPE_COLA: usize = 20;
/// Cuántas terminales se nombran en un mensaje; el resto, «y N más».
const TOPE_NOMBRADAS: usize = 5;
/// Cuánto se espera al webhook.
const PLAZO_WEB: Duration = Duration::from_secs(15);
/// Cuánto se espera a un programa (Hermes arranca Python y tarda).
const PLAZO_PROGRAMA: Duration = Duration::from_secs(40);
/// Lo que se deja de un nombre de terminal o de proyecto.
const MAX_NOMBRE: usize = 40;
/// Entre una prueba y la siguiente del mismo destino.
const ENTRE_PRUEBAS: Duration = Duration::from_secs(8);

// ─── Lo que se guarda ───────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Default, PartialEq, Debug)]
#[serde(default)]
pub struct Grok {
    pub activo: bool,
    /// La dirección del webhook de la rutina («POST to» en la app de Grok Bot).
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone, Default, PartialEq, Debug)]
#[serde(default)]
pub struct Hermes {
    pub activo: bool,
    /// A dónde, como lo entiende `hermes send --to`: `telegram`, `discord:#ops`…
    pub destino: String,
}

#[derive(Serialize, Deserialize, Clone, Default, PartialEq, Debug)]
#[serde(default)]
pub struct OpenClaw {
    pub activo: bool,
    /// Solo hace falta con más de un canal configurado.
    pub canal: String,
    pub destino: String,
}

#[derive(Serialize, Deserialize, Clone, Default, PartialEq, Debug)]
#[serde(default)]
pub struct Ajustes {
    pub grok: Grok,
    pub hermes: Hermes,
    pub openclaw: OpenClaw,
}

fn ruta() -> Result<PathBuf, String> {
    crate::dir_datos().map(|d| d.join("bots.json"))
}

fn leer_de(ruta: &Path) -> Ajustes {
    std::fs::read_to_string(ruta)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn leer() -> Ajustes {
    ruta().map(|r| leer_de(&r)).unwrap_or_default()
}

fn guardar_en(ruta: &Path, a: &Ajustes) -> Result<(), String> {
    if let Some(dir) = ruta.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let texto = serde_json::to_string_pretty(a).map_err(|e| e.to_string())?;
    // Atómico: una caída a medias no deja un JSON roto que se leería como «todo apagado».
    let tmp = ruta.with_extension("json.tmp");
    std::fs::write(&tmp, texto).map_err(|e| format!("no pude escribir {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, ruta).map_err(|e| format!("no pude renombrar a {}: {e}", ruta.display()))
}

fn nombre_clave() -> String {
    match std::env::var("ADEORQ_BOTS_CLAVE") {
        Ok(n) if n.len() >= 4 && n.len() <= 64 && n.chars().all(|c| c.is_ascii_alphanumeric() || c == ':' || c == '-' || c == '_') => n,
        _ => CLAVE_GROK.to_string(),
    }
}

fn clave_guardada() -> bool {
    crate::secrets::get(&nombre_clave()).map(|c| !c.trim().is_empty()).unwrap_or(false)
}

// ─── Lo que se comprueba antes de guardar ───────────────────────────────────

/// Una dirección de webhook: `https://…`, o `http://` solo si es de este mismo
/// equipo (para las pruebas). Sin usuario ni contraseña dentro.
fn url_valida(url: &str) -> Result<(), String> {
    if url.len() > 2000 {
        return Err("La dirección es demasiado larga.".into());
    }
    let u = reqwest::Url::parse(url).map_err(|_| "Eso no parece una dirección.".to_string())?;
    if !u.username().is_empty() || u.password().is_some() {
        return Err("La dirección no puede llevar usuario ni contraseña.".into());
    }
    let host = u.host_str().unwrap_or("");
    let local = matches!(host, "localhost" | "127.0.0.1" | "[::1]" | "::1");
    match u.scheme() {
        "https" if !host.is_empty() => Ok(()),
        "http" if local => Ok(()),
        _ => Err("Tiene que empezar por https://.".into()),
    }
}

/// A dónde se manda, para `hermes send --to` y `openclaw message --target`:
/// letras, números y `_ - : # @ + .`, sin empezar por `-` (sería una opción).
fn destino_valido(d: &str) -> Result<(), String> {
    let ok = !d.is_empty()
        && d.len() <= 100
        && !d.starts_with('-')
        && d.chars().all(|c| c.is_ascii_alphanumeric() || "_-:#@+.".contains(c));
    if ok {
        Ok(())
    } else {
        Err("El destino solo puede llevar letras, números y _ - : # @ + .".into())
    }
}

fn canal_valido(c: &str) -> Result<(), String> {
    let ok = c.len() <= 40 && !c.starts_with('-') && c.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if ok {
        Ok(())
    } else {
        Err("El canal solo puede llevar letras, números, _ y -.".into())
    }
}

/// Lo que llega de la ventana, comprobado y limpio. Un destino apagado puede
/// estar a medias; uno encendido, no.
fn validar(mut a: Ajustes, hay_clave: bool) -> Result<Ajustes, String> {
    a.grok.url = a.grok.url.trim().to_string();
    a.hermes.destino = a.hermes.destino.trim().to_string();
    a.openclaw.canal = a.openclaw.canal.trim().to_string();
    a.openclaw.destino = a.openclaw.destino.trim().to_string();

    if !a.grok.url.is_empty() {
        url_valida(&a.grok.url).map_err(|e| format!("Grok Bot: {e}"))?;
    }
    if !a.hermes.destino.is_empty() {
        destino_valido(&a.hermes.destino).map_err(|e| format!("Hermes: {e}"))?;
    }
    if !a.openclaw.destino.is_empty() {
        destino_valido(&a.openclaw.destino).map_err(|e| format!("OpenClaw: {e}"))?;
    }
    canal_valido(&a.openclaw.canal).map_err(|e| format!("OpenClaw: {e}"))?;

    if a.grok.activo && a.grok.url.is_empty() {
        return Err("Grok Bot: falta la dirección del webhook.".into());
    }
    if a.grok.activo && !hay_clave {
        return Err("Grok Bot: falta la clave.".into());
    }
    if a.hermes.activo && a.hermes.destino.is_empty() {
        return Err("Hermes: falta el destino.".into());
    }
    if a.openclaw.activo && a.openclaw.destino.is_empty() {
        return Err("OpenClaw: falta el destino.".into());
    }
    Ok(a)
}

// ─── El texto ───────────────────────────────────────────────────────────────

/// Lo que se deja de un nombre: letras, números, espacios y `- _ . , : ( ) · +`.
/// Todo lo demás (comillas, `%`, `&`, `^`, `|`, saltos de línea, `$`, `\`) se
/// quita. Es la barrera contra una shell, no un gusto: ver el encabezado.
fn limpio(texto: &str, max: usize) -> String {
    let filtrado: String = texto
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace() || "-_.,:()·+".contains(*c))
        .map(|c| if c.is_whitespace() { ' ' } else { c })
        .collect();
    let mut compacto = String::new();
    for palabra in filtrado.split_whitespace() {
        if !compacto.is_empty() {
            compacto.push(' ');
        }
        compacto.push_str(palabra);
    }
    // Una opción disfrazada de nombre no sale por delante de un argumento.
    let sin_guion = compacto.trim_start_matches('-').trim().to_string();
    sin_guion.chars().take(max).collect::<String>().trim().to_string()
}

#[derive(Clone, Debug, PartialEq)]
pub struct Aviso {
    pub terminal: String,
    pub proyecto: String,
    /// `termino` (acabó su turno), `espera` (te espera) o `decision` (te pide una).
    pub estado: String,
}

fn estado_valido(e: &str) -> bool {
    matches!(e, "termino" | "espera" | "decision")
}

fn frase_de(a: &Aviso, ingles: bool) -> String {
    let (abre, cierra) = if ingles { ("\u{201c}", "\u{201d}") } else { ("«", "»") };
    // Quién: la terminal con su proyecto, o, si no se sabe cuál (una decisión
    // que llega sin panel), «una terminal» con el proyecto si lo hay.
    let quien = match (a.terminal.is_empty(), a.proyecto.is_empty()) {
        (false, false) => format!("{abre}{}{cierra} ({})", a.terminal, a.proyecto),
        (false, true) => format!("{abre}{}{cierra}", a.terminal),
        (true, false) if ingles => format!("a terminal in {}", a.proyecto),
        (true, false) => format!("una terminal de {}", a.proyecto),
        (true, true) if ingles => "a terminal".to_string(),
        (true, true) => "una terminal".to_string(),
    };
    let que = match (a.estado.as_str(), ingles) {
        ("termino", true) => "has finished",
        ("termino", false) => "terminó",
        ("espera", true) => "is waiting for your answer",
        ("espera", false) => "espera tu respuesta",
        (_, true) => "is asking you for a decision",
        (_, false) => "te pide una decisión",
    };
    format!("{quien} {que}")
}

/// El mensaje de un grupo de avisos. Sin rayas: comas, puntos y «·».
pub fn texto_de(avisos: &[Aviso], omitidos: usize, ingles: bool) -> String {
    let total = avisos.len() + omitidos;
    if total == 0 {
        return String::new();
    }
    if total == 1 {
        return format!("Adeorq: {}.", frase_de(&avisos[0], ingles));
    }
    let nombradas: Vec<String> = avisos.iter().take(TOPE_NOMBRADAS).map(|a| frase_de(a, ingles)).collect();
    let resto = total - nombradas.len();
    let cabeza = if ingles { format!("Adeorq: {total} terminals.") } else { format!("Adeorq: {total} terminales.") };
    let mut fuera = nombradas.join(" · ");
    if resto > 0 {
        fuera.push_str(&if ingles { format!(" · and {resto} more") } else { format!(" · y {resto} más") });
    }
    format!("{cabeza} {fuera}.")
}

fn texto_de_prueba(ingles: bool) -> String {
    if ingles {
        "Adeorq: this is a test. If you can read it, the notices reach you.".into()
    } else {
        "Adeorq: esto es una prueba. Si lo lees, los avisos te llegan.".into()
    }
}

// ─── La cola: sin ráfagas ───────────────────────────────────────────────────

#[derive(Default)]
struct Cola {
    avisos: Vec<(Aviso, Instant)>,
    omitidos: usize,
    ultimo_envio: Option<Instant>,
    hilo_vivo: bool,
    ingles: bool,
}

impl Cola {
    /// Apunta un aviso. Dos iguales seguidos son uno. Devuelve si hay que
    /// arrancar el hilo que la vacía.
    fn empujar(&mut self, a: Aviso, ahora: Instant, ingles: bool) -> bool {
        self.ingles = ingles;
        if !self.avisos.iter().any(|(x, _)| *x == a) {
            if self.avisos.len() >= TOPE_COLA {
                self.omitidos += 1;
            } else {
                self.avisos.push((a, ahora));
            }
        }
        let arrancar = !self.hilo_vivo;
        self.hilo_vivo = true;
        arrancar
    }

    /// Si toca mandar: el primero lleva esperando `ventana` y el último mensaje
    /// fue hace al menos `espacio`.
    fn listo(&self, ahora: Instant, ventana: Duration, espacio: Duration) -> bool {
        let Some((_, primero)) = self.avisos.first() else { return false };
        if ahora.duration_since(*primero) < ventana {
            return false;
        }
        match self.ultimo_envio {
            Some(u) => ahora.duration_since(u) >= espacio,
            None => true,
        }
    }

    fn sacar(&mut self, ahora: Instant) -> (Vec<Aviso>, usize, bool) {
        let avisos = self.avisos.drain(..).map(|(a, _)| a).collect();
        let omitidos = std::mem::take(&mut self.omitidos);
        self.ultimo_envio = Some(ahora);
        (avisos, omitidos, self.ingles)
    }
}

fn cola() -> &'static Mutex<Cola> {
    static C: std::sync::OnceLock<Mutex<Cola>> = std::sync::OnceLock::new();
    C.get_or_init(|| Mutex::new(Cola::default()))
}

/// Los tiempos, que un laboratorio puede acortar (`ADEORQ_BOTS_VENTANA_MS`,
/// `ADEORQ_BOTS_ESPACIO_MS`) para no esperar medio minuto por prueba.
fn tiempos() -> (Duration, Duration) {
    let leer = |nombre: &str, por_defecto: Duration| {
        std::env::var(nombre)
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .map(Duration::from_millis)
            .unwrap_or(por_defecto)
    };
    (leer("ADEORQ_BOTS_VENTANA_MS", VENTANA), leer("ADEORQ_BOTS_ESPACIO_MS", ESPACIO))
}

fn hay_destino_activo(a: &Ajustes) -> bool {
    a.grok.activo || a.hermes.activo || a.openclaw.activo
}

/// El título de una terminal lleva su proyecto delante («adeorq · claude») y la
/// ventana no pasa el proyecto aparte: se separan aquí, para que el mensaje diga
/// «claude» (adeorq) y no el título entero. Con el proyecto ya dicho, no se toca.
fn partir_nombre(terminal: &str, proyecto: &str) -> (String, String) {
    if proyecto.trim().is_empty() {
        if let Some((p, t)) = terminal.split_once(" · ") {
            if !p.trim().is_empty() && !t.trim().is_empty() {
                return (t.to_string(), p.to_string());
            }
        }
    }
    (terminal.to_string(), proyecto.to_string())
}

/// El idioma de la app, tal como lo dijo la última vez la ventana: lo que llega
/// por otro camino (una decisión del MCP) no lo trae y habla el mismo.
static INGLES: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Lo que llama la ventana cuando algo merece un aviso.
/// Vuelve enseguida: lo que tarda va en otro hilo. Devuelve si quedó apuntado.
pub fn avisar(terminal: &str, proyecto: &str, estado: &str, ingles: Option<bool>) -> bool {
    use std::sync::atomic::Ordering;
    if let Some(i) = ingles {
        INGLES.store(i, Ordering::Relaxed);
    }
    if !estado_valido(estado) || !hay_destino_activo(&leer()) {
        return false;
    }
    let (terminal, proyecto) = partir_nombre(terminal, proyecto);
    let aviso = Aviso { terminal: limpio(&terminal, MAX_NOMBRE), proyecto: limpio(&proyecto, MAX_NOMBRE), estado: estado.to_string() };
    let arrancar = cola().lock().unwrap_or_else(|e| e.into_inner()).empujar(aviso, Instant::now(), INGLES.load(Ordering::Relaxed));
    if arrancar {
        std::thread::spawn(vaciar_cuando_toque);
    }
    true
}

/// Una decisión que un agente le pide a Munir (`ask_decision`): es una pregunta,
/// así que también cuenta. Como las campanas de la ventana, solo si no está
/// mirando Adeorq. No dice la pregunta ni su título, solo el proyecto.
pub fn avisar_decision(app: &tauri::AppHandle, proyecto: Option<&str>) {
    use tauri::Manager;
    let mirando = app.webview_windows().values().any(|w| w.is_focused().unwrap_or(false));
    if !mirando {
        avisar("", proyecto.unwrap_or(""), "decision", None);
    }
}

/// El hilo de la cola: mira cada poco, manda cuando toca y se acaba cuando no
/// queda nada (el siguiente aviso lo vuelve a arrancar).
fn vaciar_cuando_toque() {
    let (ventana, espacio) = tiempos();
    loop {
        std::thread::sleep(Duration::from_millis(250));
        let tanda = {
            let mut c = cola().lock().unwrap_or_else(|e| e.into_inner());
            let ahora = Instant::now();
            if c.avisos.is_empty() && c.omitidos == 0 {
                c.hilo_vivo = false;
                return;
            }
            if c.listo(ahora, ventana, espacio) {
                Some(c.sacar(ahora))
            } else {
                None
            }
        };
        if let Some((avisos, omitidos, ingles)) = tanda {
            let texto = texto_de(&avisos, omitidos, ingles);
            mandar_a_los_activos(&texto, &avisos, false);
        }
    }
}

// ─── El envío ───────────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct Resultado {
    pub ok: bool,
    /// Milisegundos Unix.
    pub cuando: u64,
    pub error: Option<String>,
}

fn ultimos() -> &'static Mutex<HashMap<&'static str, Resultado>> {
    static U: std::sync::OnceLock<Mutex<HashMap<&'static str, Resultado>>> = std::sync::OnceLock::new();
    U.get_or_init(|| Mutex::new(HashMap::new()))
}

fn anotar_resultado(destino: &'static str, r: &Result<(), String>) {
    let cuando = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    if let Err(e) = r {
        crate::anotar(&format!("Bots: el aviso a {destino} no llegó: {e}"));
    }
    ultimos().lock().unwrap_or_else(|e| e.into_inner()).insert(
        destino,
        Resultado { ok: r.is_ok(), cuando, error: r.as_ref().err().cloned() },
    );
}

/// Un trozo de salida de error, para decir por qué falló un programa: la última
/// línea con texto, sin caracteres de control y corta.
fn ultima_linea(bytes: &[u8]) -> String {
    let texto = String::from_utf8_lossy(bytes);
    let linea = texto.lines().rev().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
    let limpia: String = linea.chars().filter(|c| !c.is_control()).take(140).collect();
    limpia
}

/// Mata un programa con lo que cuelga de él. El `.cmd` de npm es un `cmd.exe` con
/// `node` debajo: matar solo el primero deja al otro colgado, uno por cada aviso.
fn matar_rama(hijo: &mut std::process::Child) {
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/T", "/F", "/PID", &hijo.id().to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .sin_ventana()
            .status();
    }
    let _ = hijo.kill();
    let _ = hijo.wait();
}

/// Lanza un programa con sus argumentos por separado, sin ventana, y espera a que
/// acabe hasta `plazo`. Pasado el plazo lo mata, con lo que cuelgue de él.
fn correr(programa: &Path, args: &[String], plazo: Duration) -> Result<(), String> {
    let mut c = Command::new(programa);
    c.args(args).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped()).sin_ventana();
    let mut hijo = c.spawn().map_err(|e| format!("no se pudo lanzar: {e}"))?;
    let mut errores = hijo.stderr.take();
    let (lo_leido, salida) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut cola: Vec<u8> = Vec::new();
        if let Some(e) = errores.as_mut() {
            let mut trozo = [0u8; 2048];
            while let Ok(n) = e.read(&mut trozo) {
                if n == 0 {
                    break;
                }
                cola.extend_from_slice(&trozo[..n]);
                if cola.len() > 4096 {
                    let sobra = cola.len() - 4096;
                    cola.drain(..sobra);
                }
            }
        }
        let _ = lo_leido.send(cola);
    });
    let fin = Instant::now() + plazo;
    let estado = loop {
        match hijo.try_wait() {
            Ok(Some(e)) => break e,
            Ok(None) if Instant::now() >= fin => {
                matar_rama(&mut hijo);
                return Err(format!("no contestó en {} segundos", plazo.as_secs()));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => return Err(e.to_string()),
        }
    };
    // El programa ya ha acabado. Lo que haya dejado vivo (una pasarela, un demonio)
    // hereda su salida de errores y no la cierra: esperar a eso colgaba el hilo de
    // los avisos para siempre, y no salía ninguno más.
    let salida = salida.recv_timeout(Duration::from_millis(500)).unwrap_or_default();
    if estado.success() {
        Ok(())
    } else {
        let por_que = ultima_linea(&salida);
        let codigo = estado.code().map(|c| c.to_string()).unwrap_or_else(|| "?".into());
        Err(if por_que.is_empty() { format!("salió con el código {codigo}") } else { format!("salió con el código {codigo}: {por_que}") })
    }
}

/// Dónde está un programa. En Windows `Command` no resuelve `.cmd` por su cuenta y
/// lo que instala npm (OpenClaw) es uno: se busca como la consola, solo entre lo
/// que Windows sabe lanzar. Además de `PATH`, los sitios donde sus instaladores
/// lo dejan aunque Adeorq se haya abierto con otro `PATH`.
pub fn buscar_programa(nombre: &str) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()).collect();
    #[cfg(windows)]
    {
        if let Ok(l) = std::env::var("LOCALAPPDATA") {
            let l = PathBuf::from(l);
            dirs.push(l.join("hermes").join("bin"));
            dirs.push(l.join("hermes").join("hermes-agent").join("venv").join("Scripts"));
        }
        if let Ok(a) = std::env::var("APPDATA") {
            dirs.push(PathBuf::from(a).join("npm"));
        }
    }
    #[cfg(not(windows))]
    {
        if let Some(casa) = crate::dir_casa() {
            dirs.push(casa.join(".local").join("bin"));
        }
        dirs.push(PathBuf::from("/usr/local/bin"));
        dirs.push(PathBuf::from("/opt/homebrew/bin"));
    }
    #[cfg(windows)]
    let extensiones: &[&str] = &[".exe", ".cmd", ".bat", ".com"];
    #[cfg(not(windows))]
    let extensiones: &[&str] = &[""];
    for dir in dirs {
        for ext in extensiones {
            let candidato = dir.join(format!("{nombre}{ext}"));
            if !candidato.is_file() {
                continue;
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if candidato.metadata().map(|m| m.permissions().mode() & 0o111 == 0).unwrap_or(true) {
                    continue;
                }
            }
            return Some(candidato);
        }
    }
    None
}

fn cuerpo_grok(texto: &str, avisos: &[Aviso], prueba: bool) -> serde_json::Value {
    let estado_en = |e: &str| match e {
        "termino" => "finished",
        "espera" => "waiting",
        _ => "decision",
    };
    serde_json::json!({
        "source": "adeorq",
        "test": prueba,
        "text": texto,
        "terminals": avisos
            .iter()
            .map(|a| serde_json::json!({ "name": a.terminal, "project": a.proyecto, "state": estado_en(&a.estado) }))
            .collect::<Vec<_>>(),
    })
}

async fn enviar_grok(url: &str, clave: &str, cuerpo: &serde_json::Value) -> Result<(), String> {
    let cliente = reqwest::Client::builder()
        .timeout(PLAZO_WEB)
        // La clave no sigue a una redirección a otro sitio.
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Adeorq")
        .build()
        .map_err(|e| e.without_url().to_string())?;
    let r = cliente
        .post(url)
        .bearer_auth(clave)
        .json(cuerpo)
        .send()
        .await
        // Sin la dirección: el webhook es medio secreto y no va al rastro.
        .map_err(|e| format!("no se pudo llamar al webhook: {}", e.without_url()))?;
    let codigo = r.status();
    if codigo.is_success() {
        Ok(())
    } else if codigo.as_u16() == 401 || codigo.as_u16() == 403 {
        Err(format!("el webhook no aceptó la clave ({})", codigo.as_u16()))
    } else {
        Err(format!("el webhook contestó {}", codigo.as_u16()))
    }
}

fn enviar_hermes(a: &Hermes, texto: &str) -> Result<(), String> {
    let programa = buscar_programa("hermes").ok_or("Hermes no está instalado en este equipo")?;
    let args = vec!["send".into(), "--to".into(), a.destino.clone(), "--quiet".into(), texto.to_string()];
    correr(&programa, &args, PLAZO_PROGRAMA)
}

fn enviar_openclaw(a: &OpenClaw, texto: &str) -> Result<(), String> {
    let programa = buscar_programa("openclaw").ok_or("OpenClaw no está instalado en este equipo")?;
    let mut args: Vec<String> = vec!["message".into(), "send".into()];
    if !a.canal.is_empty() {
        args.push("--channel".into());
        args.push(a.canal.clone());
    }
    args.extend(["--target".into(), a.destino.clone(), "--message".into(), texto.to_string()]);
    correr(&programa, &args, PLAZO_PROGRAMA)
}

fn enviar_grok_ahora(a: &Grok, texto: &str, avisos: &[Aviso], prueba: bool) -> Result<(), String> {
    let clave = crate::secrets::get(&nombre_clave()).filter(|c| !c.trim().is_empty()).ok_or("falta la clave del webhook")?;
    url_valida(&a.url)?;
    let cuerpo = cuerpo_grok(texto, avisos, prueba);
    let (url, clave) = (a.url.clone(), clave.trim().to_string());
    // Desde un hilo propio: un comando de Tauri ya corre dentro del runtime, y
    // `block_on` ahí dentro entra en pánico (la ventana no recibe respuesta y
    // reintenta por otro camino, que es como se descubrió).
    std::thread::spawn(move || tauri::async_runtime::block_on(enviar_grok(&url, &clave, &cuerpo)))
        .join()
        .unwrap_or_else(|_| Err("el aviso se rompió por dentro".to_string()))
}

/// Manda a los destinos encendidos, cada uno en su hilo: que Hermes tarde no
/// retrasa al webhook.
fn mandar_a_los_activos(texto: &str, avisos: &[Aviso], prueba: bool) {
    let a = leer();
    let mut hilos = Vec::new();
    if a.grok.activo {
        let (g, t, av) = (a.grok.clone(), texto.to_string(), avisos.to_vec());
        hilos.push(std::thread::spawn(move || anotar_resultado("Grok Bot", &enviar_grok_ahora(&g, &t, &av, prueba))));
    }
    if a.hermes.activo {
        let (h, t) = (a.hermes.clone(), texto.to_string());
        hilos.push(std::thread::spawn(move || anotar_resultado("Hermes", &enviar_hermes(&h, &t))));
    }
    if a.openclaw.activo {
        let (o, t) = (a.openclaw.clone(), texto.to_string());
        hilos.push(std::thread::spawn(move || anotar_resultado("OpenClaw", &enviar_openclaw(&o, &t))));
    }
    for h in hilos {
        let _ = h.join();
    }
}

// ─── Lo que ve y toca la ventana ────────────────────────────────────────────

#[derive(Serialize)]
pub struct Estado {
    pub ajustes: Ajustes,
    /// Hay una clave guardada. La clave en sí no sale nunca.
    pub clave_grok: bool,
    pub hermes_instalado: bool,
    pub openclaw_instalado: bool,
    /// El último intento de cada destino, por su nombre, si falló o si fue una prueba.
    pub ultimos: HashMap<String, Resultado>,
}

fn estado() -> Estado {
    let ultimos = ultimos()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .iter()
        .map(|(k, v)| (k.to_string(), v.clone()))
        .collect();
    Estado {
        ajustes: leer(),
        clave_grok: clave_guardada(),
        hermes_instalado: buscar_programa("hermes").is_some(),
        openclaw_instalado: buscar_programa("openclaw").is_some(),
        ultimos,
    }
}

#[tauri::command(async)]
pub fn bots_estado() -> Estado {
    estado()
}

#[tauri::command(async)]
pub fn bots_guardar(ajustes: Ajustes) -> Result<Estado, String> {
    let limpios = validar(ajustes, clave_guardada())?;
    guardar_en(&ruta()?, &limpios)?;
    Ok(estado())
}

#[tauri::command(async)]
pub fn bots_clave_poner(clave: String) -> Result<Estado, String> {
    let c = clave.trim();
    if c.is_empty() {
        return Err("La clave está vacía.".into());
    }
    if c.len() > 2000 || c.chars().any(|ch| ch.is_control()) {
        return Err("Eso no parece una clave.".into());
    }
    crate::secrets::put(&nombre_clave(), c)?;
    Ok(estado())
}

/// Quitar la clave apaga Grok Bot: sin ella no hay nada que mandar.
#[tauri::command(async)]
pub fn bots_clave_quitar() -> Result<Estado, String> {
    crate::secrets::forget(&nombre_clave())?;
    let mut a = leer();
    if a.grok.activo {
        a.grok.activo = false;
        guardar_en(&ruta()?, &a)?;
    }
    Ok(estado())
}

fn ultima_prueba() -> &'static Mutex<HashMap<String, Instant>> {
    static P: std::sync::OnceLock<Mutex<HashMap<String, Instant>>> = std::sync::OnceLock::new();
    P.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Una prueba a UN destino, con lo que hay guardado, esté encendido o no. La de
/// Grok Bot lanza una ejecución de verdad de su Bot.
#[tauri::command(async)]
pub fn bots_probar(destino: String, ingles: bool) -> Result<Estado, String> {
    let (nombre, quien): (&'static str, &str) = match destino.as_str() {
        "grok" => ("Grok Bot", "grok"),
        "hermes" => ("Hermes", "hermes"),
        "openclaw" => ("OpenClaw", "openclaw"),
        _ => return Err("Ese destino no existe.".into()),
    };
    {
        let mut p = ultima_prueba().lock().unwrap_or_else(|e| e.into_inner());
        let ahora = Instant::now();
        if p.get(quien).map(|u| ahora.duration_since(*u) < ENTRE_PRUEBAS).unwrap_or(false) {
            return Err("Espera unos segundos antes de probar otra vez.".into());
        }
        p.insert(quien.to_string(), ahora);
    }
    let a = leer();
    let texto = texto_de_prueba(ingles);
    let r = match quien {
        "grok" => {
            if a.grok.url.is_empty() {
                Err("falta la dirección del webhook".to_string())
            } else {
                enviar_grok_ahora(&a.grok, &texto, &[], true)
            }
        }
        "hermes" => {
            if a.hermes.destino.is_empty() {
                Err("falta el destino".to_string())
            } else {
                enviar_hermes(&a.hermes, &texto)
            }
        }
        _ => {
            if a.openclaw.destino.is_empty() {
                Err("falta el destino".to_string())
            } else {
                enviar_openclaw(&a.openclaw, &texto)
            }
        }
    };
    anotar_resultado(nombre, &r);
    Ok(estado())
}

/// Lo que llama la ventana desde `notify.ts`.
#[tauri::command(async)]
pub fn bot_avisar(terminal: String, proyecto: String, estado: String, ingles: bool) -> bool {
    avisar(&terminal, &proyecto, &estado, Some(ingles))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn aviso(t: &str, e: &str) -> Aviso {
        Aviso { terminal: t.into(), proyecto: "adeorq".into(), estado: e.into() }
    }

    #[test]
    fn un_nombre_no_lleva_nada_que_una_shell_entienda() {
        let sucio = "x\" & calc.exe | echo %PATH% ^ $(whoami) `id` ; rm -rf \\ \n 'a' <b> !";
        let l = limpio(sucio, 200);
        for malo in ['"', '&', '|', '%', '^', '$', '`', ';', '\\', '\n', '\'', '<', '>', '!'] {
            assert!(!l.contains(malo), "se coló {malo:?} en {l:?}");
        }
    }

    #[test]
    fn un_nombre_no_empieza_por_guion_ni_pasa_de_su_tope() {
        assert_eq!(limpio("--to evil", 40), "to evil");
        assert_eq!(limpio("-x", 40), "x");
        assert_eq!(limpio(&"a".repeat(100), 40).chars().count(), 40);
        assert_eq!(limpio("  muchos    espacios \t y\ttabs ", 40), "muchos espacios y tabs");
    }

    #[test]
    fn el_titulo_de_una_terminal_se_parte_en_proyecto_y_nombre() {
        assert_eq!(partir_nombre("adeorq · claude", ""), ("claude".to_string(), "adeorq".to_string()));
        assert_eq!(partir_nombre("api · v2 · beta", ""), ("v2 · beta".to_string(), "api".to_string()), "solo por el primero");
        assert_eq!(partir_nombre("claude", ""), ("claude".to_string(), String::new()));
        assert_eq!(partir_nombre("adeorq · claude", "otro"), ("adeorq · claude".to_string(), "otro".to_string()), "con proyecto dicho no se toca");
        assert_eq!(partir_nombre(" · x", ""), (" · x".to_string(), String::new()), "sin proyecto delante no hay nada que partir");
        assert_eq!(partir_nombre("x · ", ""), ("x · ".to_string(), String::new()));
    }

    #[test]
    fn los_nombres_con_tildes_y_ene_se_conservan() {
        assert_eq!(limpio("Diseño · web (cañón)", 40), "Diseño · web (cañón)");
    }

    #[test]
    fn el_mensaje_de_uno_dice_quien_y_que() {
        assert_eq!(texto_de(&[aviso("api", "termino")], 0, false), "Adeorq: «api» (adeorq) terminó.");
        assert_eq!(texto_de(&[aviso("api", "espera")], 0, false), "Adeorq: «api» (adeorq) espera tu respuesta.");
        assert_eq!(texto_de(&[aviso("api", "termino")], 0, true), "Adeorq: \u{201c}api\u{201d} (adeorq) has finished.");
    }

    #[test]
    fn una_decision_sin_terminal_sigue_diciendo_algo() {
        let a = Aviso { terminal: String::new(), proyecto: "web".into(), estado: "decision".into() };
        assert_eq!(texto_de(&[a.clone()], 0, false), "Adeorq: una terminal de web te pide una decisión.");
        assert_eq!(texto_de(&[a], 0, true), "Adeorq: a terminal in web is asking you for a decision.");
        let b = Aviso { terminal: String::new(), proyecto: String::new(), estado: "decision".into() };
        assert_eq!(texto_de(&[b], 0, false), "Adeorq: una terminal te pide una decisión.");
    }

    #[test]
    fn varios_avisos_son_un_solo_mensaje_con_tope() {
        let seis: Vec<Aviso> = (1..=6).map(|i| aviso(&format!("t{i}"), "termino")).collect();
        let t = texto_de(&seis, 0, false);
        assert!(t.starts_with("Adeorq: 6 terminales."), "{t}");
        assert!(t.contains("«t5»") && !t.contains("«t6»"), "{t}");
        assert!(t.ends_with("y 1 más."), "{t}");
        assert!(!t.contains('\n') && !t.contains('—') && !t.contains('–'), "{t}");
        let con_omitidos = texto_de(&seis, 4, false);
        assert!(con_omitidos.starts_with("Adeorq: 10 terminales."), "{con_omitidos}");
        assert!(con_omitidos.ends_with("y 5 más."), "{con_omitidos}");
    }

    #[test]
    fn la_cola_junta_lo_que_llega_a_la_vez_y_deja_espacio_entre_mensajes() {
        let v = Duration::from_secs(5);
        let e = Duration::from_secs(30);
        let t0 = Instant::now();
        let mut c = Cola::default();
        assert!(c.empujar(aviso("a", "termino"), t0, false), "el primero arranca el hilo");
        assert!(!c.empujar(aviso("b", "espera"), t0 + Duration::from_secs(1), false), "el segundo no");
        assert!(!c.listo(t0 + Duration::from_secs(4), v, e), "dentro de la ventana todavía se espera");
        assert!(c.listo(t0 + Duration::from_secs(5), v, e));
        let (sacados, omitidos, _) = c.sacar(t0 + Duration::from_secs(5));
        assert_eq!(sacados.len(), 2);
        assert_eq!(omitidos, 0);
        // Otro aviso justo después: espera la ventana Y el espacio desde el último mensaje.
        c.empujar(aviso("c", "termino"), t0 + Duration::from_secs(6), false);
        assert!(!c.listo(t0 + Duration::from_secs(12), v, e), "pasó la ventana pero no el espacio");
        assert!(c.listo(t0 + Duration::from_secs(35), v, e));
    }

    #[test]
    fn el_mismo_aviso_dos_veces_es_uno_y_el_exceso_solo_se_cuenta() {
        let t0 = Instant::now();
        let mut c = Cola::default();
        c.empujar(aviso("a", "termino"), t0, false);
        c.empujar(aviso("a", "termino"), t0, false);
        assert_eq!(c.avisos.len(), 1);
        for i in 0..40 {
            c.empujar(aviso(&format!("t{i}"), "termino"), t0, false);
        }
        assert_eq!(c.avisos.len(), TOPE_COLA);
        assert!(c.omitidos > 0);
        let (sacados, omitidos, _) = c.sacar(t0);
        assert_eq!(sacados.len() + omitidos, 41);
    }

    #[test]
    fn solo_se_acepta_un_webhook_por_https_o_de_este_equipo() {
        assert!(url_valida("https://api.example.com/hook/abc").is_ok());
        assert!(url_valida("http://127.0.0.1:4567/hook").is_ok());
        assert!(url_valida("http://localhost:4567/hook").is_ok());
        assert!(url_valida("http://example.com/hook").is_err());
        assert!(url_valida("ftp://example.com/hook").is_err());
        assert!(url_valida("https://usuario:clave@example.com/hook").is_err());
        assert!(url_valida("no es una dirección").is_err());
        assert!(url_valida("file:///c:/windows/win.ini").is_err());
    }

    #[test]
    fn un_destino_no_puede_ser_una_opcion_ni_llevar_una_shell() {
        for bueno in ["telegram", "telegram:-1001234567890:17585", "discord:#ops", "slack:C0123ABCD", "signal:+15551234567", "@mychat", "123456789"] {
            assert!(destino_valido(bueno).is_ok(), "{bueno}");
        }
        for malo in ["", "-t evil", "--help", "a b", "a;b", "a&b", "a|b", "a\"b", "a%b", "a^b", "a$b", "a`b", "a\nb", &"x".repeat(101)] {
            assert!(destino_valido(malo).is_err(), "{malo:?}");
        }
        assert!(canal_valido("").is_ok());
        assert!(canal_valido("telegram").is_ok());
        assert!(canal_valido("--x").is_err());
        assert!(canal_valido("a b").is_err());
    }

    #[test]
    fn encendido_exige_lo_que_hace_falta_y_apagado_puede_estar_a_medias() {
        let mut a = Ajustes::default();
        a.grok.url = "https://x.example/h".into();
        assert!(validar(a.clone(), false).is_ok(), "apagado y sin clave vale");
        a.grok.activo = true;
        assert_eq!(validar(a.clone(), false).unwrap_err(), "Grok Bot: falta la clave.");
        assert!(validar(a.clone(), true).is_ok());
        a.grok.url.clear();
        assert_eq!(validar(a, true).unwrap_err(), "Grok Bot: falta la dirección del webhook.");
        let mut h = Ajustes::default();
        h.hermes.activo = true;
        assert_eq!(validar(h, false).unwrap_err(), "Hermes: falta el destino.");
        let mut o = Ajustes::default();
        o.openclaw.activo = true;
        o.openclaw.destino = "@yo".into();
        o.openclaw.canal = "--evil".into();
        assert!(validar(o, false).is_err());
    }

    #[test]
    fn lo_guardado_se_lee_igual_y_sin_archivo_todo_esta_apagado() {
        let dir = std::env::temp_dir().join(format!("adeorq-bots-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let f = dir.join("bots.json");
        assert_eq!(leer_de(&f), Ajustes::default());
        assert!(!hay_destino_activo(&leer_de(&f)));
        let mut a = Ajustes::default();
        a.hermes.activo = true;
        a.hermes.destino = "telegram".into();
        guardar_en(&f, &a).unwrap();
        assert_eq!(leer_de(&f), a);
        assert!(hay_destino_activo(&leer_de(&f)));
        std::fs::write(&f, "{ esto no es json").unwrap();
        assert_eq!(leer_de(&f), Ajustes::default(), "un archivo roto es «todo apagado», no un fallo");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn el_cuerpo_del_webhook_lleva_metadatos_y_nada_mas() {
        let c = cuerpo_grok("Adeorq: «a» terminó.", &[aviso("a", "termino"), aviso("b", "decision")], false);
        let texto = c.to_string();
        assert_eq!(c["source"], "adeorq");
        assert_eq!(c["terminals"][0]["state"], "finished");
        assert_eq!(c["terminals"][1]["state"], "decision");
        let claves: Vec<&str> = c.as_object().unwrap().keys().map(String::as_str).collect();
        assert_eq!(claves.len(), 4, "source, test, text y terminals: {claves:?} {texto}");
    }

    /// Un programa de verdad, lanzado con un argumento que parece una orden de
    /// shell: tiene que llegarle tal cual, como un único argumento.
    #[cfg(windows)]
    #[test]
    fn un_programa_recibe_los_argumentos_por_separado() {
        let cmd = PathBuf::from(std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into()));
        let r = correr(&cmd, &["/c".into(), "exit".into(), "0".into()], Duration::from_secs(10));
        assert!(r.is_ok(), "{r:?}");
        let mal = correr(&cmd, &["/c".into(), "exit".into(), "3".into()], Duration::from_secs(10)).unwrap_err();
        assert!(mal.contains("código 3"), "{mal}");
    }

    #[cfg(windows)]
    #[test]
    fn un_programa_que_no_acaba_se_mata_al_pasar_el_plazo() {
        let cmd = PathBuf::from(std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into()));
        let antes = Instant::now();
        let r = correr(&cmd, &["/c".into(), "ping".into(), "-n".into(), "30".into(), "127.0.0.1".into()], Duration::from_millis(600));
        assert!(r.unwrap_err().contains("no contestó"), "tiene que decir que no contestó");
        assert!(antes.elapsed() < Duration::from_secs(8), "no esperó al ping entero");
    }

    /// Al pasar el plazo se va también lo que cuelga de él: el `.cmd` de npm es un
    /// `cmd.exe` con `node` debajo, y matar solo el primero dejaba al otro colgado.
    #[cfg(windows)]
    #[test]
    fn al_pasar_el_plazo_no_queda_nada_colgado_debajo() {
        let dir = std::env::temp_dir().join(format!("adeorq-bots-rama-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let bat = dir.join("hijo.bat");
        let salida = dir.join("salida.txt");
        std::fs::write(&bat, format!(":a\r\necho x>>\"{}\"\r\nping -n 2 127.0.0.1 >nul\r\ngoto a\r\n", salida.display())).unwrap();
        let cmd = PathBuf::from(std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into()));
        let args: Vec<String> = vec!["/c".into(), "cmd".into(), "/c".into(), bat.display().to_string()];
        assert!(correr(&cmd, &args, Duration::from_millis(1500)).unwrap_err().contains("no contestó"));
        let cuanto = || std::fs::metadata(&salida).map(|m| m.len()).unwrap_or(0);
        std::thread::sleep(Duration::from_millis(500));
        let antes = cuanto();
        std::thread::sleep(Duration::from_millis(2500));
        assert_eq!(cuanto(), antes, "lo de debajo sigue escribiendo");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Un programa que deja algo vivo detrás (una pasarela, un demonio) con su
    /// salida de errores heredada ya ha acabado: no se espera a que el otro cierre.
    #[cfg(windows)]
    #[test]
    fn lo_que_deja_vivo_un_programa_no_cuelga_el_aviso() {
        let cmd = PathBuf::from(std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into()));
        let antes = Instant::now();
        let args: Vec<String> = ["/c", "start", "/b", "ping", "-n", "12", "127.0.0.1"].iter().map(|s| s.to_string()).collect();
        let r = correr(&cmd, &args, Duration::from_secs(9));
        assert!(r.is_ok(), "{r:?}");
        assert!(antes.elapsed() < Duration::from_secs(6), "esperó a lo que dejó vivo: {:?}", antes.elapsed());
    }

    #[cfg(unix)]
    #[test]
    fn lo_que_deja_vivo_un_programa_no_cuelga_el_aviso() {
        let sh = PathBuf::from("/bin/sh");
        let antes = Instant::now();
        let r = correr(&sh, &["-c".into(), "sleep 12 &".into()], Duration::from_secs(9));
        assert!(r.is_ok(), "{r:?}");
        assert!(antes.elapsed() < Duration::from_secs(6), "esperó a lo que dejó vivo: {:?}", antes.elapsed());
    }

    #[cfg(unix)]
    #[test]
    fn un_programa_recibe_los_argumentos_por_separado() {
        let sh = PathBuf::from("/bin/sh");
        assert!(correr(&sh, &["-c".into(), "exit 0".into()], Duration::from_secs(10)).is_ok());
        let mal = correr(&sh, &["-c".into(), "echo roto >&2; exit 3".into()], Duration::from_secs(10)).unwrap_err();
        assert!(mal.contains("código 3") && mal.contains("roto"), "{mal}");
    }

    #[cfg(unix)]
    #[test]
    fn un_programa_que_no_acaba_se_mata_al_pasar_el_plazo() {
        let sh = PathBuf::from("/bin/sh");
        let antes = Instant::now();
        let r = correr(&sh, &["-c".into(), "sleep 30".into()], Duration::from_millis(600));
        assert!(r.unwrap_err().contains("no contestó"));
        assert!(antes.elapsed() < Duration::from_secs(8));
    }

    /// Un servidor de mentira que atiende UNA petición y la devuelve entera.
    fn servidor_de_mentira(respuesta: &'static str) -> (String, std::thread::JoinHandle<String>) {
        use std::io::Write;
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/hook/abc", l.local_addr().unwrap());
        let h = std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            let mut buf = vec![0u8; 16384];
            let mut total = 0;
            loop {
                let n = s.read(&mut buf[total..]).unwrap_or(0);
                total += n;
                let visto = String::from_utf8_lossy(&buf[..total]).to_string();
                let completa = visto.find("\r\n\r\n").map(|i| {
                    let largo = visto[..i]
                        .lines()
                        .find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").and_then(|v| v.trim().parse::<usize>().ok()))
                        .unwrap_or(0);
                    total >= i + 4 + largo
                });
                if n == 0 || completa == Some(true) {
                    break;
                }
            }
            s.write_all(respuesta.as_bytes()).unwrap();
            String::from_utf8_lossy(&buf[..total]).to_string()
        });
        (url, h)
    }

    #[test]
    fn el_webhook_recibe_un_post_con_la_clave_y_el_cuerpo() {
        let (url, h) = servidor_de_mentira("HTTP/1.1 200 OK\r\ncontent-length: 2\r\n\r\n{}");
        let cuerpo = cuerpo_grok("Adeorq: «a» terminó.", &[aviso("a", "termino")], false);
        // Desde un hilo propio, como en `enviar_grok_ahora`.
        let r = std::thread::spawn(move || tauri::async_runtime::block_on(enviar_grok(&url, "clave-123", &cuerpo))).join().unwrap();
        assert!(r.is_ok(), "{r:?}");
        let visto = h.join().unwrap();
        assert!(visto.starts_with("POST /hook/abc HTTP/1.1"), "{visto}");
        assert!(visto.to_ascii_lowercase().contains("authorization: bearer clave-123"), "{visto}");
        assert!(visto.contains("\"source\":\"adeorq\"") && visto.contains("\"name\":\"a\""), "{visto}");
    }

    #[test]
    fn el_webhook_que_no_acepta_se_cuenta_con_su_codigo() {
        for (respuesta, esperado) in [
            ("HTTP/1.1 500 Internal Server Error\r\ncontent-length: 0\r\n\r\n", "contestó 500"),
            ("HTTP/1.1 401 Unauthorized\r\ncontent-length: 0\r\n\r\n", "no aceptó la clave (401)"),
        ] {
            let (url, h) = servidor_de_mentira(respuesta);
            let cuerpo = cuerpo_grok("x", &[], true);
            let r = std::thread::spawn(move || tauri::async_runtime::block_on(enviar_grok(&url, "k", &cuerpo))).join().unwrap();
            let e = r.unwrap_err();
            assert!(e.contains(esperado), "{e}");
            assert!(!e.contains("127.0.0.1"), "el error no enseña la dirección del webhook: {e}");
            let _ = h.join();
        }
    }

    #[test]
    fn el_webhook_no_sigue_una_redireccion_con_la_clave() {
        let (url, h) = servidor_de_mentira("HTTP/1.1 302 Found\r\nlocation: http://127.0.0.1:1/otro\r\ncontent-length: 0\r\n\r\n");
        let cuerpo = cuerpo_grok("x", &[], true);
        let r = std::thread::spawn(move || tauri::async_runtime::block_on(enviar_grok(&url, "k", &cuerpo))).join().unwrap();
        assert!(r.unwrap_err().contains("contestó 302"));
        let _ = h.join();
    }

    #[test]
    fn la_ultima_linea_de_un_error_es_corta_y_sin_control() {
        assert_eq!(ultima_linea(b"uno\ndos\n\n"), "dos");
        assert_eq!(ultima_linea(b""), "");
        let larga = vec![b'x'; 400];
        assert_eq!(ultima_linea(&larga).chars().count(), 140);
        assert_eq!(ultima_linea("a\u{1b}[31mb".as_bytes()), "a[31mb");
    }
}
