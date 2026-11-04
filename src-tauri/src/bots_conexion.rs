// Quién es cada bot conectado, y qué ha hecho.
//
// Decisión B3 de Munir (2026-11-04, `docs/contexto/bots.md`): un bot nace con poco y
// se le sube a propósito, uno por uno, nunca subiendo la fila «Fuera de Adeorq».
//
// Cada bot tiene un secreto aleatorio en el `env` de su entrada MCP
// (`ADEORQ_BOT_CLAVE`, sin KEY ni TOKEN en el nombre, porque hay clientes que quitan
// esas de lo que pasan a sus servidores). Su puente lo presenta con la línea
// `{"adeorq":"bot","clave":"…"}` y el puerto lo convierte en el programa
// `bot:<nombre>`, con su fila de permisos en `mcp_clientes.json`. Aquí solo queda su
// huella: lo que hay en este disco no sirve para presentarse. Sin clave es «fuera», como
// cualquiera; con una mala o retirada no alcanza nada (`mcp::CLAVE_QUE_NO_VALE`).
//
// Quién es lo dice la clave y nada más: el nombre del `initialize` no cuenta. Lo que
// esto no para es a un programa que lea el archivo de configuración de un bot, que
// corre con tu mismo usuario (`docs/contexto/secretos.md`).

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// La variable por la que la clave llega al puente.
pub const VARIABLE_CLAVE: &str = "ADEORQ_BOT_CLAVE";

/// Los bots que se saben conectar, con el nombre que se enseña.
pub const BOTS: [(&str, &str); 3] = [("hermes", "Hermes"), ("openclaw", "OpenClaw"), ("grok", "Grok Bot")];

/// Cuántas cosas se recuerdan de cada bot.
const TOPE_HECHOS: usize = 40;

pub fn etiqueta(bot: &str) -> Option<&'static str> {
    BOTS.iter().find(|(b, _)| *b == bot).map(|(_, e)| *e)
}

/// Lo que se sabe de quien presentó una clave buena.
#[derive(Clone, PartialEq, Eq)]
pub struct Identidad {
    pub bot: String,
    huella: String,
}

impl Identidad {
    /// Su fila en `mcp_clientes.json`.
    pub fn programa(&self) -> String {
        crate::mcp_clientes::programa_de_bot(&self.bot)
    }
    pub fn etiqueta(&self) -> &'static str {
        etiqueta(&self.bot).unwrap_or("Bot")
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
struct Conectado {
    huella: String,
    desde_ms: u64,
}

/// Una cosa que ha hecho un bot. Sin el texto: ni lo que pidió ni lo que le contestó.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Hecho {
    pub cuando_ms: u64,
    pub herramienta: String,
    pub terminal: Option<u32>,
    /// Se le negó o falló.
    pub fallo: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
struct Libro {
    #[serde(default)]
    bots: BTreeMap<String, Conectado>,
    /// Sobrevive a desconectar: es lo primero que se mira si algo fue mal.
    #[serde(default)]
    hechos: BTreeMap<String, Vec<Hecho>>,
}

pub fn huella(clave: &str) -> String {
    Sha256::digest(clave.as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

/// 32 bytes del sistema, en hexadecimal.
pub fn clave_nueva() -> Result<String, String> {
    let mut b = [0u8; 32];
    getrandom::fill(&mut b).map_err(|e| format!("el sistema no da aleatoriedad: {e}"))?;
    Ok(b.iter().map(|x| format!("{x:02x}")).collect())
}

impl Libro {
    fn quien_es(&self, clave: &str) -> Option<Identidad> {
        let suya = huella(clave);
        // Se miran todas sin cortar en la primera, para que el tiempo no diga nada.
        self.bots
            .iter()
            .fold(None, |hallado, (bot, c)| if crate::mcp::iguales_sin_prisa(c.huella.as_bytes(), suya.as_bytes()) { Some(bot.clone()) } else { hallado })
            .map(|bot| Identidad { bot, huella: suya })
    }

    fn sigue(&self, id: &Identidad) -> bool {
        self.bots.get(&id.bot).is_some_and(|c| crate::mcp::iguales_sin_prisa(c.huella.as_bytes(), id.huella.as_bytes()))
    }

    fn apuntar(&mut self, bot: &str, hecho: Hecho) {
        let lista = self.hechos.entry(bot.to_string()).or_default();
        lista.push(hecho);
        if lista.len() > TOPE_HECHOS {
            let sobran = lista.len() - TOPE_HECHOS;
            lista.drain(..sobran);
        }
    }
}

static CERROJO: Mutex<()> = Mutex::new(());

fn ruta() -> Result<PathBuf, String> {
    crate::dir_datos_creado().map(|d| d.join("bots_conexion.json"))
}

/// Leerlo, con dos intentos más: en Windows, leer justo mientras otro hilo renombra encima
/// da de vez en cuando «Acceso denegado» (1 de cada 100.000 lecturas, medido), y eso no es
/// que el bot se haya desconectado.
fn leer_texto(ruta: &Path) -> std::io::Result<String> {
    let mut intentos = 0;
    loop {
        match std::fs::read_to_string(ruta) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound && intentos < 2 => {
                intentos += 1;
                std::thread::sleep(std::time::Duration::from_millis(30));
            }
            r => return r,
        }
    }
}

/// Un archivo roto se lee vacío: nadie es un bot, que es el lado prudente.
fn leer_de(ruta: &Path) -> Libro {
    leer_texto(ruta).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

fn leer() -> Libro {
    ruta().map(|r| leer_de(&r)).unwrap_or_default()
}

fn guardar_en(ruta: &Path, l: &Libro) -> Result<(), String> {
    let texto = serde_json::to_string_pretty(l).map_err(|e| e.to_string())?;
    let tmp = ruta.with_extension("json.tmp");
    std::fs::write(&tmp, texto).map_err(|e| format!("no pude escribir {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, ruta).map_err(|e| format!("no pude renombrar a {}: {e}", ruta.display()))
}

fn cambiar<T>(f: impl FnOnce(&mut Libro) -> T) -> Result<T, String> {
    let _g = CERROJO.lock().unwrap_or_else(|e| e.into_inner());
    cambiar_en(&ruta()?, f)
}

fn cambiar_en<T>(r: &Path, f: impl FnOnce(&mut Libro) -> T) -> Result<T, String> {
    // Uno que está ahí y no se deja leer no se pisa con uno vacío: perdería las claves.
    if let Err(e) = leer_texto(r) {
        if e.kind() != std::io::ErrorKind::NotFound {
            return Err(format!("no pude leer {}: {e}", r.display()));
        }
    }
    let mut l = leer_de(r);
    let t = f(&mut l);
    guardar_en(r, &l)?;
    Ok(t)
}

fn ahora_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

/// De quién es esta clave, si es de alguien.
pub fn quien_es(clave: &str) -> Option<Identidad> {
    leer().quien_es(clave)
}

/// Si sigue valiendo: una clave retirada deja de valer en el acto, también en una
/// conexión que ya estaba abierta.
pub fn sigue(id: &Identidad) -> bool {
    leer().sigue(id)
}

/// El nombre lo pone quien llama: uno que no existe no se guarda ni se enseña, o un bot
/// escribiría lo que quisiera, del tamaño que quisiera, en la lista de lo que hizo.
fn nombre_para_apuntar(herramienta: &str) -> &str {
    if crate::mcp_clientes::escalon_de(herramienta).is_some() {
        herramienta
    } else {
        "otra"
    }
}

/// Apuntar lo que acaba de hacer. Si no se puede guardar, no para nada.
pub fn apuntar(bot: &str, herramienta: &str, terminal: Option<u32>, fallo: bool) {
    let hecho = Hecho { cuando_ms: ahora_ms(), herramienta: nombre_para_apuntar(herramienta).to_string(), terminal, fallo };
    if let Err(e) = cambiar(|l| l.apuntar(bot, hecho)) {
        crate::anotar(&format!("Bots: no pude apuntar lo que hizo {bot} ({e})"));
    }
}

// ── Conectar, cambiar y desconectar, desde Ajustes › Bots ──────────────────

const NOMBRE_EN_EL_BOT: &str = "adeorq";

/// Lo que se enseña en lugar de la clave, que aún no existe y nunca se enseña.
const CLAVE_TAPADA: &str = "(una clave nueva, solo para este bot)";

/// Una fila de la sección: un bot, si se puede conectar, y lo que hizo.
#[derive(Clone, Debug, Serialize)]
pub struct FilaDeBot {
    pub bot: String,
    pub nombre: String,
    /// Grok Bot vive en la nube: no hay nada que buscar en este equipo.
    pub instalado: bool,
    pub conectado: bool,
    pub nivel: crate::mcp_clientes::Nivel,
    /// Cuántas veces se ha presentado, y la última en segundos Unix.
    pub veces: u64,
    pub ultima_vez: u64,
    /// De la más nueva a la más vieja.
    pub hechos: Vec<Hecho>,
}

/// Los que se están conectando ahora. Su huella se apunta antes de escribir su entrada
/// (por si el bot se presenta en cuanto la vea), y escribirla tarda segundos: en ese
/// rato la sección, que se refresca sola, no puede decir que ya está conectado.
static CONECTANDO: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// Mientras vive, ese bot se está conectando. Se suelta solo, salga como salga.
struct Conectando(String);

impl Conectando {
    fn empezar(bot: &str) -> Result<Conectando, String> {
        let mut c = CONECTANDO.lock().unwrap_or_else(|e| e.into_inner());
        if c.iter().any(|b| b == bot) {
            return Err("Ya se está conectando.".to_string());
        }
        c.push(bot.to_string());
        Ok(Conectando(bot.to_string()))
    }
}

impl Drop for Conectando {
    fn drop(&mut self) {
        CONECTANDO.lock().unwrap_or_else(|e| e.into_inner()).retain(|b| *b != self.0);
    }
}

fn se_esta_conectando(bot: &str) -> bool {
    CONECTANDO.lock().unwrap_or_else(|e| e.into_inner()).iter().any(|b| b == bot)
}

fn validar_bot(bot: &str) -> Result<&'static str, String> {
    etiqueta(bot).ok_or_else(|| format!("No conozco el bot «{bot}»."))
}

fn filas() -> Vec<FilaDeBot> {
    let libro = leer();
    let clientes = crate::mcp_clientes::leer();
    BOTS.iter()
        .map(|(bot, nombre)| {
            let programa = crate::mcp_clientes::programa_de_bot(bot);
            let visto = clientes.vistos.get(&programa).cloned().unwrap_or_default();
            FilaDeBot {
                bot: bot.to_string(),
                nombre: nombre.to_string(),
                instalado: *bot == "grok" || crate::bots::buscar_programa(bot).is_some(),
                conectado: libro.bots.contains_key(*bot) && !se_esta_conectando(bot),
                nivel: crate::mcp_clientes::nivel_de(&clientes, &programa),
                veces: visto.veces,
                ultima_vez: visto.ultima_vez,
                hechos: libro.hechos.get(*bot).map(|h| h.iter().rev().take(8).cloned().collect()).unwrap_or_default(),
            }
        })
        .collect()
}

/// Cómo se lanza el enlace con esa clave. El puerto va si esta Adeorq usa otro, como
/// una aislada de pruebas: sin él, su bot hablaría con la Adeorq de verdad.
fn entrada_con(clave: &str) -> Result<crate::bots_yaml::Entrada, String> {
    let comando = crate::mcp_estable::ruta_del_enlace()?.to_string_lossy().to_string();
    let mut env = vec![(VARIABLE_CLAVE.to_string(), clave.to_string())];
    if let Some(p) = std::env::var("ADEORQ_MCP_PUERTO").ok().filter(|p| !p.trim().is_empty()) {
        env.push(("ADEORQ_MCP_PUERTO".to_string(), p));
    }
    Ok(crate::bots_yaml::Entrada { comando, args: vec!["--mcp".to_string()], env })
}

/// Dónde guarda Hermes su configuración: se le pregunta, porque depende del sistema
/// (en Windows no es `~/.hermes`, medido) y de su perfil activo. Tarda unos segundos.
fn config_de_hermes(hermes: &Path) -> PathBuf {
    let dicho = crate::bots::correr_y_leer(hermes, &["config".to_string(), "path".to_string()], std::time::Duration::from_secs(30))
        .ok()
        .and_then(|s| s.lines().rev().map(str::trim).find(|l| !l.is_empty()).map(PathBuf::from))
        .filter(|r| r.file_name().is_some_and(|n| n == "config.yaml"));
    dicho.unwrap_or_else(|| {
        let casa = std::env::var_os("HERMES_HOME").map(PathBuf::from).or_else(|| {
            if cfg!(windows) {
                std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("hermes"))
            } else {
                crate::dir_casa().map(|c| c.join(".hermes"))
            }
        });
        casa.unwrap_or_default().join("config.yaml")
    })
}

fn programa_de(bot: &str) -> Result<PathBuf, String> {
    crate::bots::buscar_programa(bot).ok_or_else(|| format!("{} no está instalado en este equipo.", etiqueta(bot).unwrap_or(bot)))
}

/// El JSON de `openclaw mcp set` (`docs.openclaw.ai/cli/mcp/registry`, y su esquema
/// `zod-schema.mcp-server.ts` para `env`, comprobados el 2026-11-04).
fn json_de_openclaw(e: &crate::bots_yaml::Entrada) -> String {
    let env: serde_json::Map<String, serde_json::Value> = e.env.iter().map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone()))).collect();
    serde_json::json!({ "command": e.comando, "args": e.args, "env": env }).to_string()
}

/// La línea para pegar en Grok Bot, que solo puede ejecutar comandos en este equipo.
/// `| Out-String`: el binario publicado no tiene consola propia, y sin una tubería su
/// respuesta no se vería en una consola de verdad. `OutputEncoding`: PowerShell 5.1 lee la
/// salida de un programa en la página de códigos de la consola, y las tildes salían rotas.
/// La clave va por el entorno y no como argumento, pero va en la línea: no hay otra forma
/// de dársela a quien vive en la nube sin guardarla en este equipo, y la sección lo dice.
fn linea_de_grok(e: &crate::bots_yaml::Entrada, clave: &str) -> String {
    if cfg!(windows) {
        format!("[Console]::OutputEncoding=[Text.Encoding]::UTF8; $env:{VARIABLE_CLAVE}='{clave}'; & '{}' preguntar get_active_panes | Out-String", e.comando.replace('\'', "''"))
    } else {
        format!("{VARIABLE_CLAVE}='{clave}' '{}' preguntar get_active_panes", e.comando.replace('\'', "'\\''"))
    }
}

/// Lo que se va a escribir y dónde, antes de escribirlo.
#[derive(Clone, Debug, Serialize)]
pub struct Vista {
    pub archivo: Option<String>,
    pub texto: String,
}

#[tauri::command(async)]
pub fn bots_conexiones() -> Vec<FilaDeBot> {
    filas()
}

#[tauri::command(async)]
pub fn bots_conectar_vista(bot: String) -> Result<Vista, String> {
    validar_bot(&bot)?;
    let e = entrada_con(CLAVE_TAPADA)?;
    match bot.as_str() {
        "hermes" => {
            let archivo = config_de_hermes(&programa_de("hermes")?);
            Ok(Vista { archivo: Some(archivo.to_string_lossy().to_string()), texto: crate::bots_yaml::vista(&e) })
        }
        "openclaw" => {
            programa_de("openclaw")?;
            Ok(Vista { archivo: None, texto: format!("openclaw mcp set {NOMBRE_EN_EL_BOT} '{}'", json_de_openclaw(&e)) })
        }
        _ => Ok(Vista { archivo: None, texto: linea_de_grok(&e, CLAVE_TAPADA) }),
    }
}

/// Lo que pasó al conectar. `linea` solo para Grok Bot, y solo esta vez: la clave no
/// se guarda en ningún sitio de este lado.
#[derive(Clone, Debug, Serialize)]
pub struct Conexion {
    pub filas: Vec<FilaDeBot>,
    pub copia: Option<String>,
    pub linea: Option<String>,
}

/// Escribe donde toca para ese bot. Devuelve la copia del archivo, si la hay, y la línea.
fn escribir_entrada(bot: &str, clave: &str) -> Result<(Option<PathBuf>, Option<String>), String> {
    let e = entrada_con(clave)?;
    match bot {
        "hermes" => {
            let archivo = config_de_hermes(&programa_de("hermes")?);
            let copia = crate::mcp_estable::retocar_con_copia(&archivo, true, |t| crate::bots_yaml::con_entrada(t, &e))?;
            Ok((copia, None))
        }
        "openclaw" => {
            let args = ["mcp".to_string(), "set".to_string(), NOMBRE_EN_EL_BOT.to_string(), json_de_openclaw(&e)];
            crate::bots::correr(&programa_de("openclaw")?, &args, std::time::Duration::from_secs(40)).map_err(|m| motivo_de_openclaw(&m.replace(clave, "***")))?;
            Ok((None, None))
        }
        _ => Ok((None, Some(linea_de_grok(&e, clave)))),
    }
}

/// Lo que dice OpenClaw, y en claro lo que se le va a pedir a Munir: con su Gateway en
/// marcha, OpenClaw no deja cambiar esto (lo dice su documentación, y lo que hace es negarse).
fn motivo_de_openclaw(motivo: &str) -> String {
    if motivo.to_ascii_lowercase().contains("gateway") {
        "OpenClaw no deja cambiar esto con su Gateway en marcha. Páralo y vuelve a pulsar.".to_string()
    } else {
        motivo.to_string()
    }
}

#[tauri::command(async)]
pub fn bots_conectar(bot: String) -> Result<Conexion, String> {
    let nombre = validar_bot(&bot)?;
    let conectando = Conectando::empezar(&bot)?;
    let clave = clave_nueva()?;
    // La huella va primero, por si el bot se conecta en cuanto vea la entrada; si no
    // se puede escribir, todo vuelve a como estaba.
    let nueva = Conectado { huella: huella(&clave), desde_ms: ahora_ms() };
    let antes = cambiar(|l| l.bots.insert(bot.clone(), nueva))?;
    let hecho = escribir_entrada(&bot, &clave);
    let (copia, linea) = match hecho {
        Ok(h) => h,
        Err(e) => {
            cambiar(|l| match antes {
                Some(a) => {
                    l.bots.insert(bot.clone(), a);
                }
                None => {
                    l.bots.remove(&bot);
                }
            })?;
            return Err(e);
        }
    };
    // Nace con el de abajo, aunque quedara algo escrito de otra vez.
    crate::mcp_clientes::poner_de_bot(&bot, None)?;
    crate::mcp::avisar_lista_cambiada(&bot);
    crate::anotar(&format!("Bots: {nombre} conectado."));
    drop(conectando);
    Ok(Conexion { filas: filas(), copia: copia.map(|c| c.to_string_lossy().to_string()), linea })
}

#[tauri::command(async)]
pub fn bots_nivel(bot: String, nivel: crate::mcp_clientes::Nivel) -> Result<Vec<FilaDeBot>, String> {
    let nombre = validar_bot(&bot)?;
    if !leer().bots.contains_key(&bot) {
        return Err(format!("{nombre} no está conectado."));
    }
    crate::mcp_clientes::poner_de_bot(&bot, Some(nivel))?;
    crate::mcp::avisar_lista_cambiada(&bot);
    // Subirlo es de las cosas que hay que poder mirar después.
    crate::anotar(&format!("Bots: {nombre} pasa a «{}».", nivel.nombre()));
    Ok(filas())
}

/// Lo que pasó al desconectar. `aviso`: la clave ya no vale, pero algo quedó por quitar.
#[derive(Clone, Debug, Serialize)]
pub struct Desconexion {
    pub filas: Vec<FilaDeBot>,
    pub aviso: Option<String>,
}

/// Quitar la entrada de ese bot, si se puede y si es la que puso Adeorq.
fn quitar_entrada(bot: &str, huella_suya: &str) -> Option<String> {
    match bot {
        "hermes" => {
            let hermes = crate::bots::buscar_programa("hermes")?;
            let archivo = config_de_hermes(&hermes);
            let texto = match std::fs::read_to_string(&archivo) {
                Ok(t) => t,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => return None,
                Err(e) => return Some(format!("Quítala a mano de {}: {e}.", archivo.display())),
            };
            let puesta = crate::bots_yaml::variable_de_la_entrada(&texto, VARIABLE_CLAVE);
            if puesta.as_deref().map(huella).as_deref() != Some(huella_suya) {
                return crate::bots_yaml::sin_entrada(&texto).ok().flatten().map(|_| format!("La entrada de Adeorq en {} no es la que puse yo: no la he tocado.", archivo.display()));
            }
            crate::mcp_estable::retocar_con_copia(&archivo, false, |t| crate::bots_yaml::sin_entrada(t).and_then(|n| n.ok_or_else(|| "ya no estaba".to_string())))
                .err()
                .map(|e| format!("Quítala a mano de {}: {e}.", archivo.display()))
        }
        "openclaw" => {
            let programa = crate::bots::buscar_programa("openclaw")?;
            let args = ["mcp".to_string(), "unset".to_string(), NOMBRE_EN_EL_BOT.to_string()];
            crate::bots::correr(&programa, &args, std::time::Duration::from_secs(40)).err().map(|m| motivo_de_openclaw(&m))
        }
        _ => None,
    }
}

#[tauri::command(async)]
pub fn bots_desconectar(bot: String) -> Result<Desconexion, String> {
    let nombre = validar_bot(&bot)?;
    if se_esta_conectando(&bot) {
        return Err("Ya se está conectando.".to_string());
    }
    // Primero la clave: deja de valer en el acto, pase lo que pase con su archivo.
    let suya = cambiar(|l| l.bots.remove(&bot))?;
    crate::mcp_clientes::poner_de_bot(&bot, None)?;
    crate::mcp::avisar_lista_cambiada(&bot);
    crate::anotar(&format!("Bots: {nombre} desconectado."));
    let aviso = suya.and_then(|c| quitar_entrada(&bot, &c.huella));
    Ok(Desconexion { filas: filas(), aviso })
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn la_orden_de_openclaw_lleva_su_json() {
        let e = crate::bots_yaml::Entrada { comando: r"C:\A B\adeorq.exe".into(), args: vec!["--mcp".into()], env: vec![(VARIABLE_CLAVE.into(), "k".into())] };
        let v: serde_json::Value = serde_json::from_str(&json_de_openclaw(&e)).unwrap();
        assert_eq!(v["command"], r"C:\A B\adeorq.exe");
        assert_eq!(v["args"][0], "--mcp");
        assert_eq!(v["env"][VARIABLE_CLAVE], "k");
    }

    #[test]
    fn lo_que_dice_openclaw_del_gateway_se_entiende() {
        assert_eq!(motivo_de_openclaw("salió con el código 1: otra cosa"), "salió con el código 1: otra cosa");
        assert!(motivo_de_openclaw("salió con el código 1: stop the Gateway and retry").contains("Gateway en marcha"));
    }

    #[test]
    fn la_linea_de_grok_lleva_la_clave_y_lo_que_se_le_pide() {
        let e = crate::bots_yaml::Entrada { comando: "/opt/o'k/adeorq".into(), args: vec![], env: vec![] };
        let l = linea_de_grok(&e, "k1");
        assert!(l.contains(VARIABLE_CLAVE) && l.contains("k1") && l.contains("preguntar get_active_panes"), "{l}");
    }

    #[test]
    fn mientras_se_conecta_no_cuenta_como_conectado_ni_se_conecta_otra_vez() {
        let bot = "hermes-de-prueba-conectando";
        assert!(!se_esta_conectando(bot));
        let c = Conectando::empezar(bot).unwrap();
        assert!(se_esta_conectando(bot));
        assert!(Conectando::empezar(bot).is_err());
        drop(c);
        assert!(!se_esta_conectando(bot), "se suelta solo, salga como salga");
        assert!(Conectando::empezar(bot).is_ok());
    }

    #[test]
    fn un_bot_que_no_existe_no_se_conecta() {
        assert!(validar_bot("inventado").is_err());
        assert!(bots_conectar("inventado".into()).is_err());
        assert!(bots_nivel("inventado".into(), crate::mcp_clientes::Nivel::Auto).is_err());
    }

    fn con(bot: &str, clave: &str) -> Libro {
        let mut l = Libro::default();
        l.bots.insert(bot.into(), Conectado { huella: huella(clave), desde_ms: 1 });
        l
    }

    #[test]
    fn la_clave_dice_quien_es_y_el_disco_no_la_guarda() {
        let l = con("hermes", "la-buena");
        assert_eq!(l.quien_es("la-buena").map(|i| i.programa()), Some("bot:hermes".to_string()));
        assert!(l.quien_es("la-mala").is_none());
        assert!(l.quien_es("").is_none());
        let texto = serde_json::to_string(&l).unwrap();
        assert!(!texto.contains("la-buena"), "{texto}");
    }

    #[test]
    fn dos_bots_no_se_confunden() {
        let mut l = con("hermes", "de-hermes");
        l.bots.insert("openclaw".into(), Conectado { huella: huella("de-openclaw"), desde_ms: 1 });
        assert_eq!(l.quien_es("de-hermes").unwrap().bot, "hermes");
        assert_eq!(l.quien_es("de-openclaw").unwrap().bot, "openclaw");
    }

    #[test]
    fn retirada_deja_de_valer_en_una_conexion_ya_abierta() {
        let mut l = con("hermes", "la-buena");
        let id = l.quien_es("la-buena").unwrap();
        assert!(l.sigue(&id));
        l.bots.remove("hermes");
        assert!(!l.sigue(&id));
        // Volver a conectarlo da otra clave, y la de antes no vuelve a valer.
        l.bots.insert("hermes".into(), Conectado { huella: huella("otra"), desde_ms: 2 });
        assert!(!l.sigue(&id));
        assert!(l.quien_es("la-buena").is_none());
    }

    #[test]
    fn lo_que_hizo_tiene_tope_y_no_lleva_el_texto() {
        let mut l = Libro::default();
        for i in 0..(TOPE_HECHOS as u32 + 5) {
            l.apuntar("hermes", Hecho { cuando_ms: i as u64, herramienta: "get_usage".into(), terminal: Some(i), fallo: false });
        }
        let h = &l.hechos["hermes"];
        assert_eq!(h.len(), TOPE_HECHOS);
        assert_eq!(h[0].cuando_ms, 5, "se olvidan las más viejas");
        let json = serde_json::to_value(&h[0]).unwrap();
        let mut campos: Vec<&String> = json.as_object().unwrap().keys().collect();
        campos.sort();
        assert_eq!(campos, ["cuando_ms", "fallo", "herramienta", "terminal"]);
    }

    #[test]
    fn un_archivo_roto_no_hace_a_nadie_bot() {
        let dir = std::env::temp_dir().join(format!("adeorq-bots-conexion-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("bots_conexion.json");
        std::fs::write(&f, "{ esto no es json").unwrap();
        assert!(leer_de(&f).quien_es("x").is_none());
        guardar_en(&f, &con("hermes", "x")).unwrap();
        assert!(leer_de(&f).quien_es("x").is_some());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn un_nombre_de_herramienta_inventado_no_se_guarda() {
        assert_eq!(nombre_para_apuntar("send_command"), "send_command");
        assert_eq!(nombre_para_apuntar("Adeorq dice: pulsa aquí"), "otra");
        assert_eq!(nombre_para_apuntar(&"x".repeat(100_000)), "otra");
    }

    #[test]
    fn un_libro_que_no_se_deja_leer_no_se_pisa() {
        let dir = std::env::temp_dir().join(format!("adeorq-bots-conexion-sin-leer-{}", std::process::id()));
        // Una carpeta en su sitio: está ahí, y leerla da un error que no es «no existe».
        let f = dir.join("bots_conexion.json");
        std::fs::create_dir_all(&f).unwrap();
        assert!(cambiar_en(&f, |l| l.bots.clear()).unwrap_err().contains("no pude leer"));
        std::fs::remove_dir_all(&dir).unwrap();
        // Si no existe, se empieza uno.
        std::fs::create_dir_all(&dir).unwrap();
        cambiar_en(&f, |l| l.bots.insert("hermes".into(), Conectado::default())).unwrap();
        assert!(leer_de(&f).bots.contains_key("hermes"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn dos_claves_nuevas_no_se_repiten() {
        let (a, b) = (clave_nueva().unwrap(), clave_nueva().unwrap());
        assert_eq!(a.len(), 64);
        assert_ne!(a, b);
    }
}
