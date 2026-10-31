//! Quién abrió cada terminal delegada y cómo acabó, guardado por conversación.
//!
//! La Suprema, 2026-10-30 (BUZON): tras reiniciar Adeorq sus delegadas salían
//! sin «Abierta por» y en `acceptEdits` en vez de `auto`, porque quién abrió
//! cada una vivía en memoria y por número de panel, y los números vuelven a
//! empezar en cada arranque. Y una que se cerró a mano desapareció sin rastro
//! ni aviso: «quien la abrió no puede saber si la cerró Munir, si se murió el
//! proceso o si se perdió al restaurar». Aquí se apunta cada delegada por su
//! conversación (`--session-id`), que es lo que sobrevive al reinicio porque el
//! tablero la retoma con `--resume`, y cómo acabó.
//!
//! Vive en `%LOCALAPPDATA%\Adeorq\delegadas.json`. Lo escriben `open_pane` y
//! `close_pane`, `rastro_de_la_x` cuando la cierra Munir y el fin de su PTY
//! cuando su proceso sale solo. Lo leen el MCP al nacer un panel con esa
//! conversación (`al_nacer` en `mcp.rs`) y la ventana al recrearlo
//! (`delegadas_guardadas`), para su «de: …» y su modo.

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// Lo que sale en la lista de cerradas: el último día.
const RECIENTE_MS: u64 = 24 * 3600 * 1000;
/// Una cerrada se olvida a la semana; una que no vuelve, a las dos.
const OLVIDO_CERRADA_MS: u64 = 7 * 24 * 3600 * 1000;
const OLVIDO_ABIERTA_MS: u64 = 14 * 24 * 3600 * 1000;
/// Las que se enseñan como mucho, para que la lista no se coma la respuesta.
const MAX_EN_LISTA: usize = 8;

/// Una terminal que abrió un agente con `open_pane`.
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
pub struct Delegada {
    pub nombre: String,
    pub carpeta: String,
    /// La conversación de quien la abrió: lo que la reconoce tras reiniciar.
    #[serde(default)]
    pub madre_sesion: Option<String>,
    /// El título de la cabecera de quien la abrió: lo que dice su «de: …».
    #[serde(default)]
    pub madre_nombre: Option<String>,
    /// El encargo programado que la abrió (`programados.rs`), si fue uno.
    #[serde(default)]
    pub programado: Option<String>,
    /// El modo de permisos con el que nació (`--permission-mode`).
    #[serde(default)]
    pub modo: Option<String>,
    /// Su panel y el arranque de Adeorq en que se abrió.
    pub panel: u32,
    pub arranque: u64,
    pub abierta_ms: u64,
    /// Su proceso terminó sin que nadie la cerrara. Se borra si vuelve.
    #[serde(default)]
    pub salida: Option<Salida>,
    /// La cerraron: con `close_pane` o a mano.
    #[serde(default)]
    pub cierre: Option<Cierre>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Salida {
    pub ms: u64,
    pub panel: u32,
    #[serde(default)]
    pub codigo: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Cierre {
    pub ms: u64,
    pub como: Como,
    /// El panel que pidió el `close_pane`, si lo pidió uno.
    #[serde(default)]
    pub por: Option<u32>,
    #[serde(default)]
    pub rastro: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Como {
    ClosePane,
    /// La X de Munir (`rastro_de_la_x`).
    AMano,
    /// Su encargo programado, al acabar.
    Programado,
}

/// Todas, por clave (`clave`).
pub type Libro = HashMap<String, Delegada>;

/// Su conversación, o su número en ese arranque si su comando no la nombra
/// (Codex, una consola): esa no se puede retomar, pero sí decir cómo acabó.
pub fn clave(sesion: Option<&str>, arranque: u64, panel: u32) -> String {
    match sesion {
        Some(s) => s.to_string(),
        None => format!("panel-{arranque}-{panel}"),
    }
}

/// Si la clave es una conversación, que es lo único que la ventana puede retomar.
pub fn es_conversacion(clave: &str) -> bool {
    !clave.starts_with("panel-")
}

/// El modo de permisos de un comando de Claude Code, si lo dice.
pub fn modo_del_comando(comando: &[String]) -> Option<String> {
    let junto = comando.join(" ");
    let mut palabras = junto.split_whitespace();
    while let Some(p) = palabras.next() {
        if p == "--permission-mode" {
            let m = palabras.next()?;
            return (!m.is_empty() && m.len() <= 24 && m.chars().all(|c| c.is_ascii_alphabetic())).then(|| m.to_string());
        }
    }
    None
}

/// Lo guardado, o nada si no hay o no se entiende: perderlo es volver a como
/// estaba antes de que existiera, no un error que pare nada.
pub fn leer(ruta: &Path) -> Libro {
    std::fs::read_to_string(ruta).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

/// Lo leen y escriben a la vez los hilos del MCP, los comandos de la ventana y
/// el fin de cada PTY: un cambio entero de cada vez.
static CANDADO: Mutex<()> = Mutex::new(());

/// Lee, cambia con `f`, olvida lo viejo y lo deja en disco.
pub fn cambiar<T>(ruta: &Path, ahora_ms: u64, f: impl FnOnce(&mut Libro) -> T) -> Result<T, String> {
    let _uno = CANDADO.lock().unwrap_or_else(|e| e.into_inner());
    let mut libro = leer(ruta);
    let r = f(&mut libro);
    podar(&mut libro, ahora_ms);
    if let Some(dir) = ruta.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("no pude crear {}: {e}", dir.display()))?;
    }
    let texto = serde_json::to_string_pretty(&libro).map_err(|e| e.to_string())?;
    let tmp = ruta.with_extension("json.tmp");
    std::fs::write(&tmp, texto).map_err(|e| format!("no pude escribir {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, ruta).map_err(|e| format!("no pude guardar {}: {e}", ruta.display()))?;
    Ok(r)
}

/// Lo que ya no sirve: las cerradas de hace más de una semana, y las que nunca
/// volvieron de hace más de dos.
fn podar(libro: &mut Libro, ahora_ms: u64) {
    libro.retain(|_, d| match &d.cierre {
        Some(c) => ahora_ms.saturating_sub(c.ms) < OLVIDO_CERRADA_MS,
        None => ahora_ms.saturating_sub(d.salida.as_ref().map_or(d.abierta_ms, |s| s.ms.max(d.abierta_ms))) < OLVIDO_ABIERTA_MS,
    });
}

/// Lo que sabe este arranque de una delegada que ya no está en ningún panel.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Visto {
    /// Estuvo en un panel de este arranque.
    pub estuvo: bool,
    /// Y ese panel se cerró desde la ventana (`pty::cerrada_a_mano`).
    pub a_mano: bool,
}

/// «10:31 UTC», o «2026-10-29 10:31 UTC» si no es de hoy.
fn hora(ms: u64, ahora_ms: u64) -> String {
    let (dia, h) = crate::rastros::fecha_hora_utc(ms);
    if dia == crate::rastros::fecha_hora_utc(ahora_ms).0 {
        format!("{h} UTC")
    } else {
        format!("{dia} {h} UTC")
    }
}

/// Cómo acabó una que no está en ningún panel, y cuándo (para ordenar y para
/// la ventana de un día). `None` si no hay nada que contar todavía.
fn como_acabo(clave: &str, d: &Delegada, visto: Visto, ahora_ms: u64) -> Option<(u64, String)> {
    let retomar = if es_conversacion(clave) {
        format!(" Se retoma con `claude --resume {clave}` en su carpeta.")
    } else {
        String::new()
    };
    if let Some(c) = &d.cierre {
        let rastro = c.rastro.as_ref().map(|r| format!(" Su rastro: {r}")).unwrap_or_default();
        let que = match (c.como, c.por) {
            (Como::ClosePane, Some(p)) => format!("cerrada con close_pane por el panel {p}"),
            (Como::ClosePane, None) => "cerrada con close_pane por un agente sin panel".to_string(),
            (Como::AMano, _) => "la cerró Munir a mano, con la X".to_string(),
            (Como::Programado, _) => "la cerró su encargo programado al acabar".to_string(),
        };
        return Some((c.ms, format!("{que}, a las {}.{rastro}", hora(c.ms, ahora_ms))));
    }
    if let Some(s) = &d.salida {
        let codigo = s.codigo.map(|c| format!(" con código {c}")).unwrap_or_default();
        return Some((
            s.ms,
            format!(
                "su proceso salió solo{codigo} a las {}, sin que nadie la cerrara (era el panel {}); no deja rastro.{retomar}",
                hora(s.ms, ahora_ms),
                s.panel
            ),
        ));
    }
    if visto.estuvo && visto.a_mano {
        return Some((ahora_ms, format!("se cerró a mano desde la ventana sin dejar rastro.{retomar}")));
    }
    if visto.estuvo {
        return Some((ahora_ms, format!("ya no está en ningún panel y no se sabe cómo se fue.{retomar}")));
    }
    Some((
        d.abierta_ms,
        format!(
            "no está abierta en este arranque de Adeorq y nadie la cerró (se abrió a las {} en el arranque {}, como panel {}).{retomar}",
            hora(d.abierta_ms, ahora_ms),
            d.arranque,
            d.panel
        ),
    ))
}

/// «Delegada uno» (conversación …, la abrió «…»): sin el «cómo».
fn quien_es(clave: &str, d: &Delegada) -> String {
    let conv = if es_conversacion(clave) {
        format!("conversación {clave}")
    } else {
        "sin conversación que retomar".to_string()
    };
    let de = match (&d.programado, &d.madre_nombre) {
        (Some(p), _) => format!(", la abrió el encargo programado «{p}»"),
        (None, Some(m)) => format!(", la abrió «{m}»"),
        (None, None) => String::new(),
    };
    format!("«{}» ({conv}{de})", d.nombre)
}

/// La lista de `get_active_panes` de las que ya no están: cerradas con
/// `close_pane` o a mano, las que salieron solas y las que no han vuelto, del
/// último día y como mucho `MAX_EN_LISTA`. Vacío si no hay ninguna.
/// `vivas` son las claves que están ahora en un panel.
pub fn cerradas_hace_poco(libro: &Libro, vivas: &HashSet<String>, visto: impl Fn(&str) -> Visto, ahora_ms: u64) -> String {
    let mut lineas: Vec<(u64, String)> = libro
        .iter()
        .filter(|(k, _)| !vivas.contains(*k))
        .filter_map(|(k, d)| {
            let (cuando, como) = como_acabo(k, d, visto(k), ahora_ms)?;
            (ahora_ms.saturating_sub(cuando) < RECIENTE_MS).then(|| (cuando, format!("- {}: {como}", quien_es(k, d))))
        })
        .collect();
    if lineas.is_empty() {
        return String::new();
    }
    lineas.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    let total = lineas.len();
    let mut texto = String::from("\nTerminales que abrió un agente y ya no están (último día, horas en UTC):\n");
    for (_, l) in lineas.into_iter().take(MAX_EN_LISTA) {
        texto.push_str(&l);
        texto.push('\n');
    }
    if total > MAX_EN_LISTA {
        texto.push_str(&format!("- y {} más.\n", total - MAX_EN_LISTA));
    }
    texto
}

/// Lo que se añade a «Pane N not found» cuando ese número era una delegada de
/// este arranque: qué era y cómo acabó.
pub fn por_que_no_esta(panel: u32, clave: &str, d: &Delegada, visto: Visto, ahora_ms: u64) -> String {
    match como_acabo(clave, d, visto, ahora_ms) {
        Some((_, como)) => format!(" La terminal {panel} era {}: {como}", quien_es(clave, d)),
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOY: u64 = 1_793_355_000_000; // 2026-10-30 10:10 UTC
    const SID: &str = "c5fe36bb-fc57-42d2-a007-c4d74aa901b1";

    fn una(nombre: &str, abierta_ms: u64) -> Delegada {
        Delegada {
            nombre: nombre.into(),
            carpeta: r"C:\proyectos\Adeorq".into(),
            madre_sesion: Some("5e55a1d2-6c0a-4b1e-9a77-0c0ffee00040".into()),
            madre_nombre: Some("Suprema".into()),
            programado: None,
            modo: Some("auto".into()),
            panel: 3,
            arranque: 1_793_351_083_330,
            abierta_ms,
            salida: None,
            cierre: None,
        }
    }

    fn dir(nombre: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("adeorq-delegadas-{nombre}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn la_clave_es_la_conversacion_y_si_no_la_hay_el_numero_de_ese_arranque() {
        assert_eq!(clave(Some(SID), 7, 3), SID);
        assert_eq!(clave(None, 7, 3), "panel-7-3");
        assert!(es_conversacion(SID));
        assert!(!es_conversacion("panel-7-3"));
    }

    #[test]
    fn el_modo_sale_del_comando_y_lo_raro_no_se_cuela() {
        let c = |s: &str| vec!["cmd.exe".to_string(), "/k".to_string(), s.to_string()];
        assert_eq!(modo_del_comando(&c("chcp 65001 >nul && claude --permission-mode auto --session-id x")).as_deref(), Some("auto"));
        assert_eq!(modo_del_comando(&c("claude --permission-mode acceptEdits --resume x")).as_deref(), Some("acceptEdits"));
        assert_eq!(modo_del_comando(&c("codex")), None);
        assert_eq!(modo_del_comando(&c("claude --permission-mode")), None);
        assert_eq!(modo_del_comando(&c("claude --permission-mode a&calc")), None);
    }

    #[test]
    fn se_guarda_por_conversacion_y_sobrevive_a_leerlo_otro_proceso() {
        let d = dir("guarda");
        let ruta = d.join("delegadas.json");
        assert!(leer(&ruta).is_empty(), "sin archivo, nada");
        cambiar(&ruta, HOY, |l| l.insert(SID.into(), una("Delegada uno", HOY))).unwrap();
        // Lo que lee el arranque siguiente: lo mismo, con su madre y su modo.
        let l = leer(&ruta);
        assert_eq!(l.get(SID), Some(&una("Delegada uno", HOY)));
        // Un archivo roto no tumba nada: vuelve a estar vacío.
        std::fs::write(&ruta, "{ roto").unwrap();
        assert!(leer(&ruta).is_empty());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn lo_viejo_se_olvida_solo() {
        let d = dir("poda");
        let ruta = d.join("delegadas.json");
        let dia = 24 * 3600 * 1000;
        cambiar(&ruta, HOY, |l| {
            let mut vieja = una("cerrada hace ocho días", HOY - 9 * dia);
            vieja.cierre = Some(Cierre { ms: HOY - 8 * dia, como: Como::AMano, por: None, rastro: None });
            l.insert("a".into(), vieja);
            let mut reciente = una("cerrada ayer", HOY - 2 * dia);
            reciente.cierre = Some(Cierre { ms: HOY - dia, como: Como::ClosePane, por: Some(4), rastro: None });
            l.insert("b".into(), reciente);
            l.insert("c".into(), una("perdida hace quince días", HOY - 15 * dia));
            l.insert("d".into(), una("perdida hace tres días", HOY - 3 * dia));
        })
        .unwrap();
        let mut quedan: Vec<_> = leer(&ruta).into_keys().collect();
        quedan.sort();
        assert_eq!(quedan, vec!["b", "d"]);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn la_lista_dice_como_y_cuando_acabo_cada_una() {
        let min = 60_000;
        let mut libro = Libro::new();
        let mut x = una("Delegada uno", HOY - 30 * min);
        x.cierre = Some(Cierre { ms: HOY - 5 * min, como: Como::AMano, por: None, rastro: Some(r"C:\rastros\uno.md".into()) });
        libro.insert(SID.into(), x);
        let mut cp = una("Delegada cuatro", HOY - 20 * min);
        cp.cierre = Some(Cierre { ms: HOY - 2 * min, como: Como::ClosePane, por: Some(1), rastro: Some(r"C:\rastros\cuatro.md".into()) });
        libro.insert("4444".into(), cp);
        let mut sal = una("Delegada dos", HOY - 30 * min);
        sal.salida = Some(Salida { ms: HOY - 4 * min, panel: 3, codigo: Some(3) });
        libro.insert("2222".into(), sal);
        libro.insert("3333".into(), una("Delegada tres", HOY - 40 * min));
        libro.insert("panel-1-9".into(), una("Codex suelto", HOY - 10 * min));
        libro.insert("viva".into(), una("Sigue abierta", HOY - 10 * min));
        libro.insert("vieja".into(), una("De anteayer", HOY - 50 * 3600 * 1000));
        let mut prog = una("Informe del lunes", HOY - 90 * min);
        prog.madre_sesion = None;
        prog.madre_nombre = None;
        prog.programado = Some("Informe del lunes".into());
        prog.cierre = Some(Cierre { ms: HOY - 60 * min, como: Como::Programado, por: None, rastro: None });
        libro.insert("5555".into(), prog);
        let vivas: HashSet<String> = ["viva".to_string()].into();
        let texto = cerradas_hace_poco(
            &libro,
            &vivas,
            |k| if k == "panel-1-9" { Visto { estuvo: true, a_mano: true } } else { Visto::default() },
            HOY,
        );
        let linea = |quien: &str| texto.lines().find(|l| l.contains(quien)).unwrap_or_default().to_string();
        assert!(linea("Delegada uno").contains(&format!("conversación {SID}, la abrió «Suprema»")), "{texto}");
        assert!(linea("Delegada uno").contains("la cerró Munir a mano, con la X, a las 10:05 UTC. Su rastro: C:\\rastros\\uno.md"), "{texto}");
        assert!(linea("Delegada cuatro").contains("cerrada con close_pane por el panel 1, a las 10:08 UTC"), "{texto}");
        assert!(linea("Delegada dos").contains("su proceso salió solo con código 3 a las 10:06 UTC"), "{texto}");
        assert!(linea("Delegada tres").contains("no está abierta en este arranque de Adeorq y nadie la cerró"), "{texto}");
        assert!(linea("Delegada tres").contains("claude --resume 3333"), "{texto}");
        assert!(linea("Codex suelto").contains("se cerró a mano desde la ventana sin dejar rastro") && !linea("Codex suelto").contains("--resume"), "{texto}");
        assert!(linea("Informe del lunes").contains("la abrió el encargo programado «Informe del lunes»): la cerró su encargo programado al acabar, a las 09:10 UTC"), "{texto}");
        assert!(!texto.contains("Sigue abierta"), "la que está en un panel no sale: {texto}");
        assert!(!texto.contains("De anteayer"), "lo de hace más de un día no sale: {texto}");
        // Lo último primero.
        let orden: Vec<_> = ["Codex suelto", "Delegada cuatro", "Delegada dos", "Delegada uno", "Delegada tres"]
            .iter()
            .map(|q| texto.find(q).unwrap())
            .collect();
        assert!(orden.windows(2).all(|w| w[0] < w[1]), "{texto}");
        assert_eq!(cerradas_hace_poco(&Libro::new(), &vivas, |_| Visto::default(), HOY), "");
    }

    #[test]
    fn el_not_found_de_una_delegada_dice_que_le_paso() {
        let mut d = una("Delegada uno", HOY - 600_000);
        d.cierre = Some(Cierre { ms: HOY - 300_000, como: Como::AMano, por: None, rastro: None });
        let t = por_que_no_esta(2, SID, &d, Visto::default(), HOY);
        assert!(t.starts_with(" La terminal 2 era «Delegada uno»"), "{t}");
        assert!(t.contains("la cerró Munir a mano, con la X, a las 10:05 UTC"), "{t}");
    }
}
