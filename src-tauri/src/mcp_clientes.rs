// Qué puede hacer cada cliente por el MCP, y con qué llave.
//
// Decisión D1 de Munir (2026-10-07): los tres escalones del Capataz (mirar ·
// plan · auto), elegidos POR CLIENTE en Ajustes, y «plan» de fábrica: mirar y
// abrir, nunca escribir en una terminal en marcha.
//
// Hasta ahora el único reparto de permisos era el del Capataz (`lib/manos.ts`),
// que recorta las herramientas DEL LADO DEL CLIENTE con `--allowedTools`. Eso
// vale para un proceso que lanza Adeorq; para un Codex o un Gemini que Munir
// abre en su terminal no hay nadie que recorte nada, y cualquiera con el MCP
// puesto podía teclear en una terminal donde está trabajando otro. Aquí la
// puerta está en el servidor: lo que un cliente no puede usar no sale en su
// `tools/list` y, si lo pide igual, `tools/call` lo rechaza con su porqué.
//
// ── CÓMO SE SABE QUIÉN LLAMA (desde el 2026-11-03, decisión B1) ─────────────
//
// Por la TERMINAL, no por el nombre. Cada terminal de Adeorq nace con una
// contraseña suya en su entorno (`ADEORQ_PANE_CLAVE`, junto a `ADEORQ_PANE_ID`),
// y su puente la presenta. Con ella, el servidor sabe qué terminal le habla y
// qué programa se abrió en ella (`programa_del_comando`), y el escalón es el de
// ESE programa. El nombre del `initialize` (`clientInfo.name`) ya no decide
// nada, salvo en una consola pelada, donde el programa lo teclea Munir y la
// terminal no lo sabe (`programa_de_nombre`).
//
// Lo que llega sin contraseña es «fuera de Adeorq» (`FUERA`), con su propio
// escalón, `Lista` de fábrica (decisión A1, 2026-11-04): un Claude Code abierto en
// otra consola, o cualquier programa que hable con el puerto. Ve la lista de
// terminales sin sus comandos y el uso, abre, y lee y cierra lo que abrió. Munir lo
// sube en Ajustes si quiere, sabiendo que entonces vale para cualquier programa de
// fuera. Lo que ya estaba guardado en esa fila sigue significando lo mismo.
//
// Lo que no presenta contraseña pero cuelga de una terminal (`SIN_CLAVE_EN_TERMINAL`,
// reconocido por `mcp/quien_conecta.rs`: un CLI que limpia el entorno de sus
// servidores MCP, el puente de otra versión) no es de fuera y no baja: sigue con lo
// que ya tenía.
//
// Ajustes enseña una fila por programa que se ha conectado, más «fuera de
// Adeorq» siempre. Lo que estaba guardado por nombre de cliente («claude-code»,
// «codex-mcp-client») se muda solo a su programa al leerlo (`mudar`).
//
// Un bot conectado (`bots_conexion.rs`) es el programa `bot:<nombre>`, con su propia
// tabla (`alcance_de_bot`) y su sitio en Ajustes › Bots. Decisión B3 de Munir.
//
// ── LO DE CASA NO PASA POR AQUÍ ─────────────────────────────────────────────
//
// El Capataz y el conserje hablan con el MCP por el puente `adeorq --mcp
// --de-casa`, que se presenta con la contraseña de casa de este arranque
// (`mcp::clave_de_casa`). Ya llevan su propio recorte (las manos de su modo), y
// si el servidor los tratara como un cliente más, un Capataz en «auto» no podría
// escribir en las terminales que él mismo abrió.
//
// ── Y CLAUDE CODE NACE EN «AUTO» ────────────────────────────────────────────
//
// «Plan de fábrica» para todos menos para el que YA lo hace todo hoy: las
// sesiones de Claude Code de Munir escriben en otros paneles desde hace meses
// (el radar, los relevos del lienzo), y dejarlas en «plan» al actualizar le
// rompería el trabajo de un día sin que nadie se lo hubiera pedido. Se puede
// bajar en Ajustes, como cualquier otro.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Nivel {
    /// Solo para la fila de fuera de Adeorq: la lista de terminales y el uso, abrir,
    /// y leer y cerrar lo suyo. No lee lo ajeno ni la memoria. Va la primera porque
    /// `permite` no le da nada: lo que alcanza está en `alcance_limitado`.
    Lista,
    /// Solo lee. Contesta preguntas y no cambia nada de nada.
    Mirar,
    /// Puede montar trabajo nuevo (abrir, enlazar); no toca lo que ya está en marcha.
    Plan,
    /// Todo, incluido escribir en una terminal viva, mandarle teclas o cerrarla.
    Auto,
}

impl Nivel {
    pub fn nombre(self) -> &'static str {
        match self {
            Nivel::Lista => "lista",
            Nivel::Mirar => "mirar",
            Nivel::Plan => "plan",
            Nivel::Auto => "auto",
        }
    }
}

pub const FABRICA: Nivel = Nivel::Plan;

/// La fila de lo que llega sin la contraseña de una terminal de Adeorq.
pub const FUERA: &str = "fuera";

/// Lo que llega sin contraseña pero cuelga de una terminal de Adeorq
/// (`mcp/quien_conecta.rs`). No tiene fila en Ajustes y se cuenta con lo de fuera.
pub const SIN_CLAVE_EN_TERMINAL: &str = "sin-clave-en-terminal";

/// Lo que va delante del nombre en la fila de un bot conectado (`bots_conexion.rs`).
/// Esa fila solo se gana con la clave del bot: nunca con el nombre del `initialize`.
const PREFIJO_BOT: &str = "bot:";

pub fn es_bot(programa: &str) -> bool {
    programa.starts_with(PREFIJO_BOT)
}

pub fn programa_de_bot(bot: &str) -> String {
    format!("{PREFIJO_BOT}{bot}")
}

pub fn bot_de(programa: &str) -> Option<&str> {
    programa.strip_prefix(PREFIJO_BOT)
}

/// Los programas que se abren en una terminal: su ejecutable (o como se
/// presenta) y el id con el que van en Ajustes, que es el de `lib/providers.ts`.
const PROGRAMAS: &[(&str, &str)] = &[
    ("claude", "claude"),
    ("claude-code", "claude"),
    ("codex", "codex"),
    ("gemini", "gemini"),
    ("gemini-cli", "gemini"),
    ("qwen", "qwen"),
    ("copilot", "copilot"),
    ("grok", "grok"),
    ("crush", "crush"),
    ("opencode", "opencode"),
    ("amp", "amp"),
    ("agy", "agy"),
    ("cursor-agent", "cursor"),
    ("pi", "pi"),
    ("kiro-cli", "kiro"),
    ("kimi", "kimi"),
    ("codewhale", "codewhale"),
    ("goose", "goose"),
    ("droid", "droid"),
    ("jules", "jules"),
    ("auggie", "auggie"),
    ("codebuff", "codebuff"),
    ("cody", "cody"),
    ("aider", "aider"),
];

/// Qué programa se abrió en una terminal, leído de su comando: el primer
/// ejecutable conocido (`cmd.exe /k chcp 65001 >nul && claude --session-id …`
/// es Claude), sin mirar el encargo: puede nombrar otros y en Windows va delante
/// del programa (`rastros::sin_encargo`). `None` es una consola pelada.
pub fn programa_del_comando(argv: &[String]) -> Option<&'static str> {
    crate::rastros::sin_encargo(argv)
        .split(|c: char| c.is_whitespace() || matches!(c, '&' | '|' | '"' | '\'' | ';' | '(' | ')'))
        .filter(|t| !t.is_empty())
        .find_map(|t| {
            let base = t.rsplit(['\\', '/']).next().unwrap_or(t).to_ascii_lowercase();
            let base = [".exe", ".cmd", ".ps1", ".bat"].iter().fold(base, |b, ext| b.strip_suffix(ext).map(str::to_string).unwrap_or(b));
            PROGRAMAS.iter().find(|(exe, _)| *exe == base).map(|(_, id)| *id)
        })
}

/// El programa de un cliente por su nombre: para lo guardado antes de que el
/// escalón fuera por programa, y para una consola pelada. «Claude Code»,
/// «claude-code» → claude; «codex-mcp-client» → codex. Los ids cortos (`pi`,
/// `amp`) solo si es el nombre entero: «example» no es Amp. Lo que no es de
/// ninguno queda con su nombre.
pub fn programa_de_nombre(nombre: &str) -> String {
    let n = nombre.trim().to_ascii_lowercase();
    if n == FUERA || es_bot(&n) {
        return n;
    }
    PROGRAMAS
        .iter()
        .find(|(exe, id)| n == *exe || n == *id || (id.len() >= 4 && n.contains(id)))
        .map(|(_, id)| id.to_string())
        .unwrap_or(n)
}

/// El programa de un cliente que se presenta por su nombre (una consola pelada, una
/// terminal de antes). Decir «bot:hermes» no lo hace Hermes: eso lo da su clave.
pub fn programa_de_cliente(nombre: &str) -> String {
    let p = programa_de_nombre(nombre);
    if es_bot(&p) || p == SIN_CLAVE_EN_TERMINAL {
        "desconocido".to_string()
    } else {
        p
    }
}

/// Cuándo se presentó un cliente por última vez, y con qué versión.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Visto {
    pub version: String,
    /// Epoch en segundos.
    pub ultima_vez: u64,
    pub veces: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Clientes {
    /// Lo que Munir eligió en Ajustes. Quien no está aquí va con el de fábrica.
    #[serde(default)]
    pub niveles: BTreeMap<String, Nivel>,
    /// Los que se han conectado alguna vez, tal como se presentaron.
    #[serde(default)]
    pub vistos: BTreeMap<String, Visto>,
}

/// El escalón MÍNIMO que necesita cada herramienta. Es la misma tabla que
/// `LECTURA` / `MONTAR` / `PISAR` de `src/lib/manos.ts`, y un test de abajo
/// comprueba que ninguna herramienta anunciada se queda sin escalón: una que
/// faltara aquí no la vería NADIE, que es el lado prudente, pero se notaría tarde.
pub fn escalon_de(herramienta: &str) -> Option<Nivel> {
    match herramienta {
        "get_projects" | "get_active_panes" | "read_pane_transcript" | "get_agenda" | "get_usage"
        | "read_pane_screen" | "buscar_memoria" | "leer_memoria" | "leer_turno" | "get_decision" | "get_mods" => Some(Nivel::Mirar),
        // Preguntarle algo a Munir no toca ninguna terminal que esté trabajando:
        // su respuesta vuelve a la del que pregunta.
        // Y darla por resuelta solo deja de esperar a Munir: tampoco toca terminales.
        // Enseñarle algo en el móvil tampoco: lo ve él, y solo lo que se nombra.
        // Y compactarse a sí misma solo teclea en la terminal de quien lo pide
        // (`mcp/compactarme.rs`), con su turno ya acabado.
        "open_pane" | "link_panes" | "ask_decision" | "close_decision" | "compartir_en_el_movil" | "compactarme" => Some(Nivel::Plan),
        // Compactar es teclear `/fin` y `/compact` en una terminal viva.
        "send_command" | "send_keys" | "close_pane" | "compactar_terminal" => Some(Nivel::Auto),
        _ => None,
    }
}

/// Si un cliente en ese escalón puede usar esa herramienta. Lo desconocido, no.
pub fn permite(nivel: Nivel, herramienta: &str) -> bool {
    escalon_de(herramienta).is_some_and(|minimo| minimo <= nivel)
}

/// Lo que un escalón puede hacer SOLO sobre las terminales que abrió él.
/// Munir, 2026-10-17: «que cualquiera pueda cerrar las que abrió ÉL, con su
/// rastro, aunque esté en plan»; las de otros, no. Sin esto un Codex en «plan»
/// abría y dejaba la limpieza a Munir. Cuáles son suyas lo decide `mcp.rs`
/// (`es_suya`), que es quien sabe qué conexión abrió cada una.
pub fn solo_lo_suyo(nivel: Nivel, herramienta: &str) -> bool {
    nivel == Nivel::Plan && herramienta == "close_pane"
}

/// Si la herramienta sale en su `tools/list`: entera o solo para lo suyo.
pub fn la_ve(nivel: Nivel, herramienta: &str) -> bool {
    permite(nivel, herramienta) || solo_lo_suyo(nivel, herramienta)
}

/// Hasta dónde llega una tabla corta en una herramienta.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Alcance {
    Entera,
    SoloLoSuyo,
    Nada,
}

/// Lo que puede un bot en cada escalón. Es más corto que lo de los demás a propósito:
/// lo que lee se va a su proveedor, y quien lo engañe lo lee también. La memoria, la
/// agenda, las decisiones y los mods tampoco son «la lista de terminales y el uso», y
/// una flecha pasa la respuesta de una terminal a otra.
fn alcance_de_bot(nivel: Nivel, herramienta: &str) -> Alcance {
    use Alcance::*;
    match (nivel, herramienta) {
        (Nivel::Auto, h) if permite(Nivel::Auto, h) => Entera,
        (_, "get_active_panes" | "get_usage") => Entera,
        (Nivel::Plan, "get_projects" | "open_pane") => Entera,
        (Nivel::Plan, "close_pane") | (Nivel::Mirar | Nivel::Plan, "read_pane_screen" | "read_pane_transcript") => SoloLoSuyo,
        _ => Nada,
    }
}

/// La tabla corta que le toca, si no es la de los escalones de siempre. `Lista` alcanza
/// justo lo que un bot en «plan»: la decisión A1 es la misma frase que la de los bots.
fn alcance_limitado(programa: &str, nivel: Nivel, herramienta: &str) -> Option<Alcance> {
    if es_bot(programa) {
        Some(alcance_de_bot(nivel, herramienta))
    } else if nivel == Nivel::Lista {
        Some(alcance_de_bot(Nivel::Plan, herramienta))
    } else {
        None
    }
}

/// `la_ve` para un programa concreto: los bots y `Lista` tienen su propia tabla.
pub fn la_ve_programa(programa: &str, nivel: Nivel, herramienta: &str) -> bool {
    match alcance_limitado(programa, nivel, herramienta) {
        Some(a) => a != Alcance::Nada,
        None => la_ve(nivel, herramienta),
    }
}

/// `solo_lo_suyo` para un programa concreto.
pub fn solo_lo_suyo_programa(programa: &str, nivel: Nivel, herramienta: &str) -> bool {
    match alcance_limitado(programa, nivel, herramienta) {
        Some(a) => a == Alcance::SoloLoSuyo,
        None => solo_lo_suyo(nivel, herramienta),
    }
}

/// El escalón de un programa que no está en la lista de Ajustes: Claude, auto;
/// un bot, el de abajo; lo de fuera de Adeorq, la lista; los demás, plan.
pub fn nivel_de_fabrica(programa: &str) -> Nivel {
    if programa == "claude" {
        Nivel::Auto
    } else if es_bot(programa) {
        Nivel::Mirar
    } else if programa == FUERA {
        Nivel::Lista
    } else {
        FABRICA
    }
}

/// El escalón de un programa (`programa_del_comando`, `programa_de_nombre` o `FUERA`).
pub fn nivel_de(c: &Clientes, programa: &str) -> Nivel {
    // Va con lo de fuera, salvo que esa fila haya bajado de fábrica: lo que cuelga de
    // una terminal no pierde nada porque lo de fuera sí lo pierda.
    if programa == SIN_CLAVE_EN_TERMINAL {
        return c.niveles.get(FUERA).copied().unwrap_or(FABRICA);
    }
    c.niveles.get(programa).copied().unwrap_or_else(|| nivel_de_fabrica(programa))
}

/// Lo guardado por nombre de cliente, a su programa: «claude-code» pasa a
/// «claude» con el escalón que tuviera. Si dos nombres caen en el mismo
/// programa con escalones distintos, se queda el MENOR: subir permisos sin que
/// Munir lo haya dicho no es una mudanza, es un regalo. Lo visto se suma.
fn mudar(c: Clientes) -> Clientes {
    let mut niveles: BTreeMap<String, Nivel> = BTreeMap::new();
    for (nombre, nivel) in c.niveles {
        let p = programa_de_nombre(&nombre);
        let n = niveles.get(&p).map_or(nivel, |ya| (*ya).min(nivel));
        niveles.insert(p, n);
    }
    let mut vistos: BTreeMap<String, Visto> = BTreeMap::new();
    for (nombre, v) in c.vistos {
        let s = vistos.entry(programa_de_nombre(&nombre)).or_default();
        if v.ultima_vez >= s.ultima_vez {
            s.version = v.version;
            s.ultima_vez = v.ultima_vez;
        }
        s.veces += v.veces;
    }
    Clientes { niveles, vistos }
}

const LISTA_ALCANZA: &str = "ve la lista de terminales y el uso, abre terminales, y solo lee y cierra las que abrió";

/// Dónde se sube lo de fuera. Lo lee un agente, que se lo cuenta a quien usa Adeorq.
pub const LISTA_SE_SUBE: &str = "Quien usa Adeorq lo sube en Ajustes > Terminales > «Qué puede hacer cada cliente por el MCP», en la fila «Fuera de Adeorq», con «Leer y abrir» o «Todo».";

/// Lo que se le contesta a quien pide una herramienta que su escalón no tiene.
/// Dice el escalón, qué sí puede y dónde se cambia: un «no» seco deja al agente
/// reintentando lo mismo.
pub fn mensaje_denegado(programa: &str, nivel: Nivel, herramienta: &str) -> String {
    if es_bot(programa) {
        let que = match nivel {
            Nivel::Lista | Nivel::Mirar => "ve la lista de terminales y el uso, y lee solo las terminales que abrió él",
            Nivel::Plan => "además ve los proyectos y abre terminales, y solo lee y cierra las que abrió él",
            Nivel::Auto => "puede hacerlo todo",
        };
        return format!("«{herramienta}» no está al alcance de este bot: {que}. Se cambia en Ajustes > Bots de Adeorq.");
    }
    if nivel == Nivel::Lista {
        return format!(
            "«{herramienta}» no está al alcance de lo que se conecta desde fuera de una terminal de Adeorq: {LISTA_ALCANZA}. {LISTA_SE_SUBE}"
        );
    }
    let nombre = if programa == FUERA {
        "lo que se conecta desde fuera de una terminal de Adeorq".to_string()
    } else if programa == SIN_CLAVE_EN_TERMINAL {
        "lo que se conecta sin la contraseña de su terminal".to_string()
    } else {
        programa.to_string()
    };
    let que = match nivel {
        Nivel::Lista => LISTA_ALCANZA,
        Nivel::Mirar => "solo puede mirar (proyectos, paneles, transcripts, memoria)",
        Nivel::Plan => "puede mirar, abrir o enlazar terminales y cerrar las que abrió él, pero no escribir en una que ya está trabajando, ni mandarle teclas, ni cerrar las de otros",
        Nivel::Auto => "puede hacerlo todo",
    };
    format!(
        "«{herramienta}» no está al alcance de {nombre}: en Adeorq está en el escalón «{}», que {que}. \
         Se cambia en Ajustes > Terminales > «Qué puede hacer cada cliente por el MCP».",
        nivel.nombre()
    )
}

static CERROJO: Mutex<()> = Mutex::new(());

fn ruta() -> Result<PathBuf, String> {
    crate::dir_datos_creado().map(|d| d.join("mcp_clientes.json"))
}

pub fn leer() -> Clientes {
    mudar(
        ruta()
            .ok()
            .and_then(|r| std::fs::read_to_string(r).ok())
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default(),
    )
}

fn guardar(c: &Clientes) -> Result<(), String> {
    let destino = ruta()?;
    let texto = serde_json::to_string_pretty(c).map_err(|e| e.to_string())?;
    // Atómico: se escribe al lado y se renombra, para que una caída a medias
    // no deje un JSON a medio escribir que luego se lea como «ningún cliente».
    let tmp = destino.with_extension("json.tmp");
    std::fs::write(&tmp, texto).map_err(|e| format!("no pude escribir {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &destino).map_err(|e| format!("no pude renombrar a {}: {e}", destino.display()))
}

fn ahora() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Un programa acaba de presentarse: se apunta y se devuelve su escalón.
pub fn apuntar_visto(programa: &str, version: &str) -> Nivel {
    let _g = CERROJO.lock().unwrap_or_else(|e| e.into_inner());
    let mut c = leer();
    let fila = if programa == SIN_CLAVE_EN_TERMINAL { FUERA } else { programa };
    let v = c.vistos.entry(fila.to_string()).or_default();
    v.version = version.to_string();
    v.ultima_vez = ahora();
    v.veces += 1;
    let nivel = nivel_de(&c, programa);
    // Si no se puede guardar, se sirve igual: el escalón sale de lo leído.
    let _ = guardar(&c);
    nivel
}

/// Lo que Ajustes enseña: una fila por cliente visto, con su escalón y si es
/// el de fábrica o lo eligió Munir.
#[derive(Clone, Debug, Serialize)]
pub struct ClienteVisto {
    pub nombre: String,
    pub version: String,
    pub ultima_vez: u64,
    pub veces: u64,
    pub nivel: Nivel,
    pub fabrica: bool,
}

/// Una fila por programa visto o elegido, y siempre la de fuera de Adeorq: es la
/// que Munir tiene que poder subir aunque todavía no haya llamado nadie de fuera.
fn filas(c: &Clientes) -> Vec<ClienteVisto> {
    let fuera = FUERA.to_string();
    // Un bot tiene su sitio en Ajustes › Bots, con lo que implica cada escalón al lado.
    let mut nombres: Vec<&String> = c.vistos.keys().chain(c.niveles.keys()).chain(std::iter::once(&fuera)).filter(|n| !es_bot(n)).collect();
    nombres.sort();
    nombres.dedup();
    nombres
        .into_iter()
        .map(|n| {
            let v = c.vistos.get(n).cloned().unwrap_or_default();
            ClienteVisto {
                nombre: n.clone(),
                version: v.version,
                ultima_vez: v.ultima_vez,
                veces: v.veces,
                nivel: nivel_de(c, n),
                fabrica: !c.niveles.contains_key(n),
            }
        })
        .collect()
}

#[tauri::command(async)]
pub fn mcp_clientes_leer() -> Vec<ClienteVisto> {
    filas(&leer())
}

/// Poner el escalón de un cliente; sin `nivel`, volver al de fábrica.
#[tauri::command(async)]
pub fn mcp_clientes_poner(nombre: String, nivel: Option<Nivel>) -> Result<Vec<ClienteVisto>, String> {
    let nombre = programa_de_nombre(&nombre);
    if nombre.is_empty() || nombre.len() > 120 {
        return Err("Ese cliente no tiene nombre.".into());
    }
    if es_bot(&nombre) {
        return Err("Un bot se cambia en Ajustes > Bots.".into());
    }
    if nombre == SIN_CLAVE_EN_TERMINAL {
        return Err("Ese cliente no tiene fila propia.".into());
    }
    poner(&nombre, nivel).map(|c| filas(&c))
}

/// Poner el escalón de un bot; sin `nivel`, olvidarlo: al volver a conectarlo nace abajo.
pub fn poner_de_bot(bot: &str, nivel: Option<Nivel>) -> Result<(), String> {
    poner(&programa_de_bot(bot), nivel).map(|_| ())
}

fn poner(programa: &str, nivel: Option<Nivel>) -> Result<Clientes, String> {
    if nivel == Some(Nivel::Lista) && programa != FUERA {
        return Err("Ese paso es solo de la fila «Fuera de Adeorq».".into());
    }
    let _g = CERROJO.lock().unwrap_or_else(|e| e.into_inner());
    let mut c = leer();
    match nivel {
        // Elegir `Lista` es volver a lo de fábrica, y así no se escribe en el archivo:
        // una versión anterior que lo leyera con ese nombre lo perdería entero.
        Some(Nivel::Lista) | None => {
            c.niveles.remove(programa);
        }
        Some(n) => {
            c.niveles.insert(programa.to_string(), n);
        }
    }
    guardar(&c)?;
    Ok(c)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Cada herramienta que el servidor anuncia tiene su escalón. Si entra una
    /// nueva en `mcp.rs` y nadie la reparte, este test la señala por su nombre.
    #[test]
    fn toda_herramienta_anunciada_tiene_escalon() {
        let sin: Vec<String> = crate::mcp::lista_de_herramientas()
            .iter()
            .filter_map(|h| h["name"].as_str().map(str::to_string))
            .filter(|n| escalon_de(n).is_none())
            .collect();
        assert!(sin.is_empty(), "sin escalón: {sin:?}");
        assert_eq!(crate::mcp::lista_de_herramientas().len(), 21, "si cambió el número, revisa la tabla");
    }

    #[test]
    fn los_escalones_van_de_menos_a_mas() {
        assert!(permite(Nivel::Mirar, "get_active_panes"));
        assert!(!permite(Nivel::Mirar, "open_pane"));
        assert!(permite(Nivel::Plan, "open_pane"));
        assert!(!permite(Nivel::Plan, "send_command"));
        assert!(!permite(Nivel::Plan, "close_pane"));
        assert!(permite(Nivel::Auto, "send_command"));
        assert!(!permite(Nivel::Auto, "inventada"), "lo desconocido no pasa ni en auto");
    }

    /// En «plan» se ve `close_pane`, pero solo para lo suyo; en «mirar» no hay
    /// nada suyo que cerrar, y nada más se cuela por esta puerta.
    #[test]
    fn plan_cierra_solo_lo_suyo() {
        assert!(solo_lo_suyo(Nivel::Plan, "close_pane"));
        assert!(la_ve(Nivel::Plan, "close_pane"));
        assert!(!la_ve(Nivel::Mirar, "close_pane"));
        assert!(!solo_lo_suyo(Nivel::Auto, "close_pane"), "en auto cierra cualquiera, no hace falta mirar de quién es");
        for otra in ["send_command", "send_keys", "inventada"] {
            assert!(!la_ve(Nivel::Plan, otra), "{otra}");
        }
    }

    #[test]
    fn plan_de_fabrica_salvo_claude_y_fuera_de_adeorq() {
        let c = Clientes::default();
        assert_eq!(nivel_de(&c, "codex"), Nivel::Plan);
        assert_eq!(nivel_de(&c, "gemini"), Nivel::Plan);
        assert_eq!(nivel_de(&c, "claude"), Nivel::Auto);
        assert_eq!(nivel_de(&c, FUERA), Nivel::Lista, "A1: lo de fuera solo ve la lista y el uso");
        // El nombre ya no decide: «claude-code-2» no es un programa.
        assert_eq!(nivel_de(&c, "claude-code-2"), Nivel::Plan);
        let mut bajado = Clientes::default();
        bajado.niveles.insert("claude".into(), Nivel::Mirar);
        assert_eq!(nivel_de(&bajado, "claude"), Nivel::Mirar, "lo que eligió Munir manda sobre la fábrica");
    }

    /// El programa sale del comando de la terminal, como lo arma el front.
    #[test]
    fn el_programa_sale_del_comando_de_la_terminal() {
        let v = |s: &[&str]| s.iter().map(|x| x.to_string()).collect::<Vec<_>>();
        assert_eq!(programa_del_comando(&v(&["cmd.exe", "/k", "chcp 65001 >nul && claude --session-id 1 --permission-mode auto"])), Some("claude"));
        assert_eq!(programa_del_comando(&v(&["cmd.exe", "/k", "chcp 65001 >nul && codex --model gpt"])), Some("codex"));
        assert_eq!(programa_del_comando(&v(&["C:\\Users\\x\\.local\\bin\\claude.exe", "--resume", "abc"])), Some("claude"));
        assert_eq!(programa_del_comando(&v(&["/bin/zsh", "-lc", "cursor-agent; exec /bin/zsh -i"])), Some("cursor"));
        // El encargo va detrás del programa y puede nombrar otros.
        assert_eq!(
            programa_del_comando(&v(&["powershell.exe", "-NoExit", "-Command", "gemini -i 'que lo revise claude y codex'"])),
            Some("gemini")
        );
        // Como nace de verdad con encargo (`lineaConEncargo`): el texto va DELANTE
        // del programa, en una variable, y no decide qué programa es la terminal.
        let con_encargo = |encargo: &str, programa: &str| {
            v(&["powershell.exe", "-NoLogo", "-NoExit", "-Command", &format!("$env:ADEORQ_ENCARGO = '{encargo}'; $adeorqExe = '{programa}'; $adeorqPre = @(); & $adeorqExe @adeorqPre --% \"%ADEORQ_ENCARGO%\"")])
        };
        assert_eq!(programa_del_comando(&con_encargo("revisa lo de codex ahora", "claude")), Some("claude"));
        assert_eq!(programa_del_comando(&con_encargo("que lo mire claude ahora", "codex")), Some("codex"));
        assert_eq!(programa_del_comando(&con_encargo("it''s claude y pi ‘’ & codex", "gemini")), Some("gemini"));
        assert_eq!(programa_del_comando(&v(&["powershell.exe", "-NoLogo"])), None, "una consola pelada no tiene programa");
        assert_eq!(programa_del_comando(&[]), None);
    }

    #[test]
    fn el_programa_de_un_nombre_viejo() {
        assert_eq!(programa_de_nombre("claude-code"), "claude");
        assert_eq!(programa_de_nombre("Claude Code"), "claude");
        assert_eq!(programa_de_nombre("codex-mcp-client"), "codex");
        assert_eq!(programa_de_nombre("gemini-cli"), "gemini");
        assert_eq!(programa_de_nombre("example-amp-thing"), "example-amp-thing", "los ids cortos, solo enteros");
        assert_eq!(programa_de_nombre("orquio-34"), "orquio-34");
        assert_eq!(programa_de_nombre("fuera"), FUERA);
    }

    /// Lo guardado por nombre se muda a su programa sin regalar permisos.
    #[test]
    fn lo_guardado_por_nombre_se_muda_a_su_programa() {
        let mut c = Clientes::default();
        c.niveles.insert("claude-code".into(), Nivel::Auto);
        c.niveles.insert("Claude Code".into(), Nivel::Mirar);
        c.niveles.insert("codex-mcp-client".into(), Nivel::Auto);
        c.vistos.insert("claude-code".into(), Visto { version: "2.1".into(), ultima_vez: 10, veces: 5 });
        c.vistos.insert("Claude Code".into(), Visto { version: "2.0".into(), ultima_vez: 5, veces: 2 });
        let m = mudar(c);
        assert_eq!(m.niveles.get("claude"), Some(&Nivel::Mirar), "de dos, el menor");
        assert_eq!(m.niveles.get("codex"), Some(&Nivel::Auto), "lo que Munir subió sigue subido");
        assert_eq!(m.niveles.len(), 2);
        let v = &m.vistos["claude"];
        assert_eq!((v.veces, v.ultima_vez, v.version.as_str()), (7, 10, "2.1"));
    }

    #[test]
    fn las_filas_juntan_vistos_y_elegidos_y_siempre_fuera() {
        let mut c = Clientes::default();
        c.vistos.insert("codex".into(), Visto { version: "0.5".into(), ultima_vez: 1, veces: 3 });
        c.niveles.insert("gemini".into(), Nivel::Auto);
        let f = filas(&c);
        let nombres: Vec<&str> = f.iter().map(|x| x.nombre.as_str()).collect();
        assert_eq!(nombres, ["codex", "fuera", "gemini"]);
        assert!(f[0].fabrica);
        assert_eq!(f[1].nivel, Nivel::Lista);
        assert_eq!(f[1].veces, 0, "fuera sale aunque no haya llamado nadie");
        assert_eq!(f[2].nivel, Nivel::Auto);
        assert!(!f[2].fabrica);
    }

    #[test]
    fn el_mensaje_dice_el_escalon_y_donde_se_cambia() {
        let m = mensaje_denegado("codex", Nivel::Plan, "send_command");
        assert!(m.contains("«plan»") && m.contains("codex") && m.contains("Ajustes"), "{m}");
        let f = mensaje_denegado(FUERA, Nivel::Plan, "send_command");
        assert!(f.contains("fuera de una terminal de Adeorq"), "{f}");
    }

    /// Lo que dice A1, herramienta por herramienta. Lo que no se nombra aquí no le llega.
    #[test]
    fn lo_de_fuera_de_fabrica_solo_ve_la_lista_y_el_uso() {
        let ve = |h: &str| la_ve_programa(FUERA, Nivel::Lista, h);
        let suyo = |h: &str| solo_lo_suyo_programa(FUERA, Nivel::Lista, h);
        for h in ["get_active_panes", "get_usage", "get_projects", "open_pane"] {
            assert!(ve(h) && !suyo(h), "{h} entera");
        }
        for h in ["read_pane_screen", "read_pane_transcript", "close_pane"] {
            assert!(ve(h) && suyo(h), "{h} solo de lo suyo");
        }
        for h in ["leer_memoria", "buscar_memoria", "leer_turno", "get_agenda", "get_decision", "ask_decision", "get_mods", "link_panes", "send_command", "send_keys", "compactar_terminal", "compactarme", "inventada"] {
            assert!(!ve(h), "{h} no le llega");
        }
    }

    /// Una herramienta nueva no le llega a lo de fuera hasta que alguien lo decida.
    #[test]
    fn de_fabrica_lo_de_fuera_solo_ve_lo_que_se_nombra() {
        let mut vistas: Vec<String> = crate::mcp::lista_de_herramientas()
            .iter()
            .filter_map(|h| h["name"].as_str().map(str::to_string))
            .filter(|n| la_ve_programa(FUERA, Nivel::Lista, n))
            .collect();
        vistas.sort_unstable();
        assert_eq!(vistas, ["close_pane", "get_active_panes", "get_projects", "get_usage", "open_pane", "read_pane_screen", "read_pane_transcript"]);
    }

    /// `permite` no le da nada a `Lista`: sale todo de su tabla, y `Lista` queda por
    /// debajo de los demás al comparar.
    #[test]
    fn lista_queda_por_debajo_de_mirar() {
        assert!(Nivel::Lista < Nivel::Mirar);
        assert!(!permite(Nivel::Lista, "get_active_panes"));
        assert_eq!(serde_json::to_string(&Nivel::Lista).unwrap(), "\"lista\"");
    }

    /// Lo ya guardado sigue siendo lo de hoy, y de abajo no se sube a nadie.
    #[test]
    fn lo_guardado_en_la_fila_de_fuera_conserva_su_significado() {
        let con = |n: Nivel| {
            let mut c = Clientes::default();
            c.niveles.insert(FUERA.into(), n);
            c
        };
        for n in [Nivel::Mirar, Nivel::Plan, Nivel::Auto] {
            assert_eq!(nivel_de(&con(n), FUERA), n);
            assert_eq!(mudar(con(n)).niveles.get(FUERA), Some(&n), "pasa por la mudanza tal cual");
        }
        assert!(la_ve_programa(FUERA, Nivel::Mirar, "read_pane_screen") && !solo_lo_suyo_programa(FUERA, Nivel::Mirar, "read_pane_screen"));
        assert!(la_ve_programa(FUERA, Nivel::Mirar, "leer_memoria") && !la_ve_programa(FUERA, Nivel::Mirar, "open_pane"));
        assert!(la_ve_programa(FUERA, Nivel::Plan, "get_agenda") && !solo_lo_suyo_programa(FUERA, Nivel::Plan, "read_pane_transcript"));
        assert!(la_ve_programa(FUERA, Nivel::Auto, "send_command"));
    }

    /// Lo que cuelga de una terminal sin presentar contraseña no baja con lo de fuera:
    /// sigue en lo de siempre, y en lo que esa fila tuviera guardado.
    #[test]
    fn lo_que_cuelga_de_una_terminal_sigue_como_estaba() {
        let p = SIN_CLAVE_EN_TERMINAL;
        assert_eq!(nivel_de(&Clientes::default(), p), Nivel::Plan);
        assert!(la_ve_programa(p, nivel_de(&Clientes::default(), p), "read_pane_screen"));
        assert!(!solo_lo_suyo_programa(p, nivel_de(&Clientes::default(), p), "read_pane_screen"));
        let mut c = Clientes::default();
        c.niveles.insert(FUERA.into(), Nivel::Mirar);
        assert_eq!(nivel_de(&c, p), Nivel::Mirar, "lo que había guardado");
        c.niveles.insert(FUERA.into(), Nivel::Auto);
        assert_eq!(nivel_de(&c, p), Nivel::Auto);
        // Ni un nombre lo da, ni tiene fila propia.
        assert_eq!(programa_de_cliente(p), "desconocido");
        assert!(filas(&Clientes::default()).iter().all(|f| f.nombre != p));
        assert!(mcp_clientes_poner(p.into(), Some(Nivel::Auto)).is_err());
    }

    /// `lista` solo vale en su fila: ni en un programa, ni en un bot.
    #[test]
    fn lista_solo_se_pone_en_la_fila_de_fuera() {
        assert!(mcp_clientes_poner("codex".into(), Some(Nivel::Lista)).is_err());
        assert!(mcp_clientes_poner("claude".into(), Some(Nivel::Lista)).is_err());
        assert!(poner_de_bot("hermes", Some(Nivel::Lista)).is_err());
    }

    #[test]
    fn el_mensaje_de_fuera_dice_que_si_puede_y_donde_se_sube() {
        let m = mensaje_denegado(FUERA, Nivel::Lista, "leer_memoria");
        assert!(m.contains("leer_memoria") && m.contains("lista de terminales") && m.contains("abre terminales"), "{m}");
        assert!(m.contains("Ajustes > Terminales") && m.contains("«Fuera de Adeorq»") && m.contains("«Leer y abrir»"), "{m}");
    }

    /// Lo que dice el encargo de cada escalón de un bot, herramienta por herramienta.
    /// Lo que no se nombra aquí no le llega en ninguno salvo en «auto».
    #[test]
    fn los_tres_escalones_de_un_bot() {
        let b = "bot:hermes";
        let ve = |n: Nivel, h: &str| la_ve_programa(b, n, h);
        let suyo = |n: Nivel, h: &str| solo_lo_suyo_programa(b, n, h);
        assert_eq!(nivel_de(&Clientes::default(), b), Nivel::Mirar, "nace con el de abajo");

        for h in ["get_active_panes", "get_usage"] {
            assert!(ve(Nivel::Mirar, h) && !suyo(Nivel::Mirar, h), "{h}");
        }
        for h in ["read_pane_screen", "read_pane_transcript"] {
            assert!(suyo(Nivel::Mirar, h) && suyo(Nivel::Plan, h), "{h} solo de lo suyo");
            assert!(ve(Nivel::Auto, h) && !suyo(Nivel::Auto, h), "{h} entera en auto");
        }
        let ajenas = ["leer_memoria", "buscar_memoria", "leer_turno", "get_agenda", "get_decision", "ask_decision", "get_mods", "link_panes", "send_command", "send_keys", "compactar_terminal"];
        for h in ajenas {
            assert!(!ve(Nivel::Mirar, h) && !ve(Nivel::Plan, h), "{h} no le llega por debajo de auto");
            assert!(ve(Nivel::Auto, h), "{h} sí en auto");
        }
        assert!(!ve(Nivel::Mirar, "open_pane") && !ve(Nivel::Mirar, "get_projects") && !ve(Nivel::Mirar, "close_pane"));
        assert!(ve(Nivel::Plan, "open_pane") && ve(Nivel::Plan, "get_projects") && suyo(Nivel::Plan, "close_pane"));
        assert!(ve(Nivel::Auto, "close_pane") && !suyo(Nivel::Auto, "close_pane"));
        assert!(!ve(Nivel::Auto, "inventada"), "lo desconocido no pasa ni en auto");
    }

    /// Una herramienta nueva no le llega a un bot hasta que alguien lo decida.
    #[test]
    fn por_debajo_de_auto_un_bot_solo_ve_lo_que_se_nombra() {
        let vistas: Vec<String> = crate::mcp::lista_de_herramientas()
            .iter()
            .filter_map(|h| h["name"].as_str().map(str::to_string))
            .filter(|n| la_ve_programa("bot:x", Nivel::Plan, n))
            .collect();
        let mut esperadas = ["close_pane", "get_active_panes", "get_projects", "get_usage", "open_pane", "read_pane_screen", "read_pane_transcript"];
        esperadas.sort_unstable();
        let mut vistas: Vec<&str> = vistas.iter().map(String::as_str).collect();
        vistas.sort_unstable();
        assert_eq!(vistas, esperadas);
    }

    /// Solo la clave da la fila de un bot: ni el nombre del `initialize` en una
    /// consola pelada, ni uno que se parezca a un programa («bot:grok» no es Grok).
    #[test]
    fn decir_que_eres_un_bot_no_te_hace_serlo() {
        for n in ["bot:hermes", "BOT:hermes", "  bot:openclaw ", "bot:grok"] {
            assert!(!es_bot(&programa_de_cliente(n)), "{n}");
        }
        assert_eq!(programa_de_nombre("bot:grok"), "bot:grok", "lo guardado no se muda a otro programa");
        assert_eq!(programa_de_cliente("claude-code"), "claude");
        let mut c = Clientes::default();
        c.niveles.insert("bot:grok".into(), Nivel::Auto);
        assert_eq!(mudar(c).niveles.get("bot:grok"), Some(&Nivel::Auto));
    }

    #[test]
    fn un_bot_no_sale_en_la_fila_de_los_clientes() {
        let mut c = Clientes::default();
        c.vistos.insert("bot:hermes".into(), Visto::default());
        c.niveles.insert("bot:hermes".into(), Nivel::Auto);
        assert_eq!(filas(&c).iter().map(|f| f.nombre.as_str()).collect::<Vec<_>>(), ["fuera"]);
        assert!(mcp_clientes_poner("bot:hermes".into(), Some(Nivel::Auto)).is_err());
    }

    #[test]
    fn el_mensaje_a_un_bot_dice_donde_se_cambia() {
        let m = mensaje_denegado("bot:hermes", Nivel::Mirar, "open_pane");
        assert!(m.contains("Ajustes > Bots") && m.contains("open_pane"), "{m}");
    }

    #[test]
    fn el_nivel_viaja_en_minusculas() {
        assert_eq!(serde_json::to_string(&Nivel::Auto).unwrap(), "\"auto\"");
        assert_eq!(serde_json::from_str::<Nivel>("\"mirar\"").unwrap(), Nivel::Mirar);
    }
}
