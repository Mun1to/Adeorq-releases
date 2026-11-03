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
// escalón, «plan» de fábrica: un Claude Code abierto en otra consola, o
// cualquier programa que hable con el puerto. Munir lo sube en Ajustes si
// quiere, sabiendo que entonces vale para cualquier programa de fuera.
//
// Ajustes enseña una fila por programa que se ha conectado, más «fuera de
// Adeorq» siempre. Lo que estaba guardado por nombre de cliente («claude-code»,
// «codex-mcp-client») se muda solo a su programa al leerlo (`mudar`).
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

/// La fila de lo que llega sin la contraseña de una terminal de Adeorq.
pub const FUERA: &str = "fuera";

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
/// es Claude). Va primero porque el encargo, que puede nombrar otros, va
/// siempre detrás de su programa. `None` es una consola pelada.
pub fn programa_del_comando(argv: &[String]) -> Option<&'static str> {
    argv.iter()
        .flat_map(|a| a.split(|c: char| c.is_whitespace() || matches!(c, '&' | '|' | '"' | '\'' | ';' | '(' | ')')))
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
    if n == FUERA {
        return n;
    }
    PROGRAMAS
        .iter()
        .find(|(exe, id)| n == *exe || n == *id || (id.len() >= 4 && n.contains(id)))
        .map(|(_, id)| id.to_string())
        .unwrap_or(n)
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
        "open_pane" | "link_panes" | "ask_decision" => Some(Nivel::Plan),
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

/// El escalón de un programa que no está en la lista de Ajustes: Claude, auto;
/// los demás y lo de fuera de Adeorq, plan.
pub fn nivel_de_fabrica(programa: &str) -> Nivel {
    if programa == "claude" {
        Nivel::Auto
    } else {
        FABRICA
    }
}

/// El escalón de un programa (`programa_del_comando`, `programa_de_nombre` o `FUERA`).
pub fn nivel_de(c: &Clientes, programa: &str) -> Nivel {
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

/// Lo que se le contesta a quien pide una herramienta que su escalón no tiene.
/// Dice el escalón, qué sí puede y dónde se cambia: un «no» seco deja al agente
/// reintentando lo mismo.
pub fn mensaje_denegado(programa: &str, nivel: Nivel, herramienta: &str) -> String {
    let nombre = if programa == FUERA {
        "lo que se conecta desde fuera de una terminal de Adeorq".to_string()
    } else {
        programa.to_string()
    };
    let que = match nivel {
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
    let v = c.vistos.entry(programa.to_string()).or_default();
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
    let mut nombres: Vec<&String> = c.vistos.keys().chain(c.niveles.keys()).chain(std::iter::once(&fuera)).collect();
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
        assert_eq!(crate::mcp::lista_de_herramientas().len(), 18, "si cambió el número, revisa la tabla");
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
    fn plan_de_fabrica_salvo_claude_y_fuera_de_adeorq_en_plan() {
        let c = Clientes::default();
        assert_eq!(nivel_de(&c, "codex"), Nivel::Plan);
        assert_eq!(nivel_de(&c, "gemini"), Nivel::Plan);
        assert_eq!(nivel_de(&c, "claude"), Nivel::Auto);
        assert_eq!(nivel_de(&c, FUERA), Nivel::Plan, "B1: fuera de Adeorq solo abre y mira");
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
        assert_eq!(f[1].nivel, Nivel::Plan);
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

    #[test]
    fn el_nivel_viaja_en_minusculas() {
        assert_eq!(serde_json::to_string(&Nivel::Auto).unwrap(), "\"auto\"");
        assert_eq!(serde_json::from_str::<Nivel>("\"mirar\"").unwrap(), Nivel::Mirar);
    }
}
