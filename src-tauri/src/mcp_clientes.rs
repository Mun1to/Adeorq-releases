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
// ── CÓMO SE SABE QUIÉN LLAMA ────────────────────────────────────────────────
//
// Por el `initialize` del protocolo: cada cliente se presenta con
// `clientInfo.name` y `clientInfo.version`. No es una credencial (cualquiera
// puede decir que se llama como otro), pero no hace falta que lo sea: el MCP
// solo escucha en 127.0.0.1 y lo que se reparte aquí es cuidado, no secreto.
// Los nombres NO se adivinan: se apuntan tal como llegan, y Ajustes enseña
// los que se han conectado alguna vez, con su escalón.
//
// ── LO DE CASA NO PASA POR AQUÍ ─────────────────────────────────────────────
//
// El Capataz y el conserje hablan con el MCP por el puente `adeorq --mcp
// --de-casa`, que se presenta con una línea `{"adeorq":"de-casa"}` antes del
// protocolo. Ya llevan su propio recorte (las manos de su modo), y si el
// servidor los tratara como un cliente más, un Capataz en «auto» no podría
// escribir en las terminales que él mismo abrió.
//
// ── Y CLAUDE CODE NACE EN «AUTO» ────────────────────────────────────────────
//
// «Plan de fábrica» para todos menos para el que YA lo hace todo hoy: las
// sesiones de Claude Code de Munir escriben en otros paneles desde hace meses
// (el radar, los relevos del lienzo), y dejarlas en «plan» al actualizar le
// rompería el trabajo de un día sin que nadie se lo hubiera pedido. Se puede
// bajar en Ajustes, como cualquier otro. Lo que decide es el nombre con que se
// presenta: si contiene «claude», auto; si no, plan.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Nivel {
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
            Nivel::Mirar => "mirar",
            Nivel::Plan => "plan",
            Nivel::Auto => "auto",
        }
    }
}

pub const FABRICA: Nivel = Nivel::Plan;

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
        | "read_pane_screen" | "buscar_memoria" | "leer_memoria" | "leer_turno" | "get_decision" => Some(Nivel::Mirar),
        // Preguntarle algo a Munir no toca ninguna terminal que esté trabajando:
        // su respuesta vuelve a la del que pregunta.
        "open_pane" | "link_panes" | "ask_decision" => Some(Nivel::Plan),
        "send_command" | "send_keys" | "close_pane" => Some(Nivel::Auto),
        _ => None,
    }
}

/// Si un cliente en ese escalón puede usar esa herramienta. Lo desconocido, no.
pub fn permite(nivel: Nivel, herramienta: &str) -> bool {
    escalon_de(herramienta).is_some_and(|minimo| minimo <= nivel)
}

/// El escalón de un cliente que no está en la lista de Ajustes.
pub fn nivel_de_fabrica(nombre: &str) -> Nivel {
    if nombre.to_ascii_lowercase().contains("claude") {
        Nivel::Auto
    } else {
        FABRICA
    }
}

pub fn nivel_de(c: &Clientes, nombre: &str) -> Nivel {
    c.niveles.get(nombre).copied().unwrap_or_else(|| nivel_de_fabrica(nombre))
}

/// Lo que se le contesta a quien pide una herramienta que su escalón no tiene.
/// Dice el escalón, qué sí puede y dónde se cambia: un «no» seco deja al agente
/// reintentando lo mismo.
pub fn mensaje_denegado(nombre: &str, nivel: Nivel, herramienta: &str) -> String {
    let que = match nivel {
        Nivel::Mirar => "solo puede mirar (proyectos, paneles, transcripts, memoria)",
        Nivel::Plan => "puede mirar y abrir o enlazar terminales, pero no escribir en una que ya está trabajando, ni mandarle teclas, ni cerrarla",
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
    ruta()
        .ok()
        .and_then(|r| std::fs::read_to_string(r).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
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

/// Un cliente acaba de presentarse: se apunta y se devuelve su escalón.
pub fn apuntar_visto(nombre: &str, version: &str) -> Nivel {
    let _g = CERROJO.lock().unwrap_or_else(|e| e.into_inner());
    let mut c = leer();
    let v = c.vistos.entry(nombre.to_string()).or_default();
    v.version = version.to_string();
    v.ultima_vez = ahora();
    v.veces += 1;
    let nivel = nivel_de(&c, nombre);
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

fn filas(c: &Clientes) -> Vec<ClienteVisto> {
    let mut nombres: Vec<&String> = c.vistos.keys().chain(c.niveles.keys()).collect();
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
    let nombre = nombre.trim().to_string();
    if nombre.is_empty() || nombre.len() > 120 {
        return Err("Ese cliente no tiene nombre.".into());
    }
    let _g = CERROJO.lock().unwrap_or_else(|e| e.into_inner());
    let mut c = leer();
    match nivel {
        Some(n) => {
            c.niveles.insert(nombre, n);
        }
        None => {
            c.niveles.remove(&nombre);
        }
    }
    guardar(&c)?;
    Ok(filas(&c))
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
        assert_eq!(crate::mcp::lista_de_herramientas().len(), 16, "si cambió el número, revisa la tabla");
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

    #[test]
    fn plan_de_fabrica_salvo_claude_code() {
        let c = Clientes::default();
        assert_eq!(nivel_de(&c, "codex-cli"), Nivel::Plan);
        assert_eq!(nivel_de(&c, "gemini-cli"), Nivel::Plan);
        assert_eq!(nivel_de(&c, "claude-code"), Nivel::Auto);
        assert_eq!(nivel_de(&c, "Claude Code"), Nivel::Auto);
        let mut bajado = Clientes::default();
        bajado.niveles.insert("claude-code".into(), Nivel::Mirar);
        assert_eq!(nivel_de(&bajado, "claude-code"), Nivel::Mirar, "lo que eligió Munir manda sobre la fábrica");
    }

    #[test]
    fn las_filas_juntan_vistos_y_elegidos() {
        let mut c = Clientes::default();
        c.vistos.insert("codex-cli".into(), Visto { version: "0.5".into(), ultima_vez: 1, veces: 3 });
        c.niveles.insert("gemini-cli".into(), Nivel::Auto);
        let f = filas(&c);
        assert_eq!(f.len(), 2);
        assert_eq!(f[0].nombre, "codex-cli");
        assert!(f[0].fabrica);
        assert_eq!(f[1].nombre, "gemini-cli");
        assert_eq!(f[1].nivel, Nivel::Auto);
        assert!(!f[1].fabrica);
    }

    #[test]
    fn el_mensaje_dice_el_escalon_y_donde_se_cambia() {
        let m = mensaje_denegado("codex-cli", Nivel::Plan, "send_command");
        assert!(m.contains("«plan»") && m.contains("codex-cli") && m.contains("Ajustes"), "{m}");
    }

    #[test]
    fn el_nivel_viaja_en_minusculas() {
        assert_eq!(serde_json::to_string(&Nivel::Auto).unwrap(), "\"auto\"");
        assert_eq!(serde_json::from_str::<Nivel>("\"mirar\"").unwrap(), Nivel::Mirar);
    }
}
