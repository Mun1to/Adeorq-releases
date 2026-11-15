//! `entregar`: una terminal que abrió otra dice cómo acabó su encargo, y su
//! madre se entera sin mirar.
//!
//! Es la primera mitad de «la vuelta hacia arriba» (`docs/propuestas/orquestador.md`,
//! paso 5 de `docs/SUPREMA.md`). Hasta ahora la madre gastaba turnos en
//! `read_pane_screen` y `get_active_panes` para saber si sus hijas acabaron, y
//! lo deducía del fin del turno, que no es lo mismo que «ha terminado»
//! (`enjambres.md`). Con esto lo dice la hija: hecho, bloqueada, falla o que
//! necesita a Munir, con su resumen. Rust lo guarda en `delegadas.json` y la
//! ventana se lo teclea a la madre en UNA línea cuando para en su caja vacía
//! (`src/lib/vueltaArriba.ts`).
//!
//! Solo para una terminal que abrió un agente con `open_pane` (está en
//! `Puente::delegadas`), y solo si su puente la presenta con la contraseña de
//! esa terminal: otra no puede entregar en su nombre.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Un resumen más corto que esto no dice qué hizo ni dónde está; más largo ya
/// no es un resumen, y se teclea entero en la terminal de la madre.
pub const MIN_RESUMEN: usize = 40;
pub const MAX_RESUMEN: usize = 2000;
pub const MAX_ARCHIVOS: usize = 50;
/// Una ruta más larga que esto no es una ruta.
const MAX_RUTA: usize = 400;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Estado {
    Hecho,
    Bloqueada,
    Falla,
    NecesitoAMunir,
}

impl Estado {
    fn de(s: &str) -> Option<Self> {
        match s.trim().to_lowercase().as_str() {
            "hecho" => Some(Self::Hecho),
            "bloqueada" => Some(Self::Bloqueada),
            "falla" => Some(Self::Falla),
            "necesito_a_munir" => Some(Self::NecesitoAMunir),
            _ => None,
        }
    }

    /// Cómo viaja a la ventana (`vueltaArriba.ts`).
    pub fn clave(self) -> &'static str {
        match self {
            Self::Hecho => "hecho",
            Self::Bloqueada => "bloqueada",
            Self::Falla => "falla",
            Self::NecesitoAMunir => "necesito_a_munir",
        }
    }

    /// Cómo se lee en una lista.
    fn dicho(self) -> &'static str {
        match self {
            Self::Hecho => "hecho",
            Self::Bloqueada => "bloqueada",
            Self::Falla => "falla",
            Self::NecesitoAMunir => "necesita a Munir",
        }
    }
}

/// Lo que entregó una delegada, tal como se guarda en `delegadas.json`.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Entrega {
    pub estado: Estado,
    pub resumen: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub archivos: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commit: Option<String>,
    pub ms: u64,
}

/// Lo que se sabe de quien llama y de su terminal.
pub struct Quien {
    /// La terminal que presentó su puente (`ADEORQ_PANE_ID`), ya creída.
    pub panel: Option<u32>,
    /// Si esa terminal sigue abierta.
    pub existe: bool,
    /// Si nació con contraseña: una de antes de que las hubiera se cree por su
    /// número a secas, y eso aquí no basta.
    pub con_clave: bool,
    /// Si la abrió un agente con `open_pane`.
    pub delegada: bool,
}

/// Por qué no puede entregar, o `None` si puede.
pub fn por_que_no(q: &Quien) -> Option<String> {
    if q.panel.is_none() {
        return Some(
            "entregar solo vale dentro de una terminal de Adeorq que abrió otro agente con open_pane: \
             tu conexión no dice cuál es la tuya (ADEORQ_PANE_ID)."
                .into(),
        );
    }
    if !q.existe {
        return Some("Tu terminal ya no está abierta en Adeorq.".into());
    }
    if !q.con_clave {
        return Some(
            "Tu terminal nació en una versión anterior de Adeorq, sin contraseña, y no puedo comprobar que entregas tú. \
             Cuéntalo en tu respuesta: quien te abrió la leerá con read_pane_transcript."
                .into(),
        );
    }
    if !q.delegada {
        return Some(
            "A tu terminal no la abrió ningún agente con open_pane, así que no hay nadie a quien entregar: \
             cuéntaselo a Munir en tu respuesta."
                .into(),
        );
    }
    None
}

/// El texto sin nada que una terminal lea como teclas (un ESC, un Intro suelto):
/// se le va a teclear a la madre. Los saltos de línea se quedan aquí, y los
/// aplana la ventana al juntar la línea.
fn limpio(texto: &str) -> String {
    texto
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .chars()
        .filter(|c| *c == '\n' || !c.is_control())
        .collect::<String>()
        .trim()
        .to_string()
}

/// Lo que pide el agente, comprobado. `ms` es cuándo se entrega.
pub fn leer(args: &Value, ms: u64) -> Result<Entrega, String> {
    let estado = match &args["estado"] {
        Value::String(s) => Estado::de(s).ok_or_else(|| {
            format!("`estado` «{}» no vale: tiene que ser hecho, bloqueada, falla o necesito_a_munir.", s.trim())
        })?,
        _ => return Err("Falta `estado`: hecho, bloqueada, falla o necesito_a_munir.".into()),
    };
    let resumen = limpio(args["resumen"].as_str().unwrap_or_default());
    let largo = resumen.chars().count();
    if largo < MIN_RESUMEN {
        return Err(format!(
            "El resumen tiene {largo} caracteres y hacen falta {MIN_RESUMEN} como mínimo: qué hiciste, dónde quedó y qué falta, si falta algo."
        ));
    }
    if largo > MAX_RESUMEN {
        return Err(format!(
            "El resumen tiene {largo} caracteres y caben {MAX_RESUMEN}: lo largo, en su traspaso (su BUZON.md o un commit), y aquí dónde está."
        ));
    }
    let archivos = match &args["archivos"] {
        Value::Null => Vec::new(),
        Value::Array(a) => {
            if a.len() > MAX_ARCHIVOS {
                return Err(format!("`archivos` trae {} rutas y caben {MAX_ARCHIVOS}: deja las que importan.", a.len()));
            }
            let mut rutas = Vec::with_capacity(a.len());
            for x in a {
                let r = x.as_str().map(limpio).unwrap_or_default();
                if r.is_empty() || r.contains('\n') || r.chars().count() > MAX_RUTA {
                    return Err("Cada elemento de `archivos` tiene que ser una ruta, en una línea.".into());
                }
                rutas.push(r);
            }
            rutas
        }
        _ => return Err("`archivos` tiene que ser una lista de rutas.".into()),
    };
    let commit = match &args["commit"] {
        Value::Null => None,
        Value::String(s) if s.trim().is_empty() => None,
        Value::String(s) => {
            let c = s.trim();
            if !(4..=40).contains(&c.len()) || !c.chars().all(|ch| ch.is_ascii_hexdigit()) {
                return Err(format!("`commit` «{c}» no es un hash de git (de 4 a 40 cifras hexadecimales)."));
            }
            Some(c.to_lowercase())
        }
        _ => return Err("`commit` tiene que ser el hash de un commit, como texto.".into()),
    };
    Ok(Entrega { estado, resumen, archivos, commit, ms })
}

/// A quién se le entrega, según lo que se sabe de su madre.
pub enum Destino<'a> {
    /// Su terminal está abierta y la ventana se lo va a teclear.
    Avisada { panel: u32, nombre: Option<&'a str> },
    /// Su terminal está abierta, pero la ventana no lo aceptó (los avisos están
    /// apagados en Ajustes, o no contestó).
    SinAviso { panel: u32, porque: String },
    /// Tiene panel apuntado y ya no está abierto.
    Cerrada { panel: u32 },
    /// Un agente sin terminal (el Capataz, un encargo programado, un bot) o una
    /// de otro arranque.
    SinPanel { nombre: Option<&'a str> },
}

/// Lo que se le contesta a la hija.
pub fn respuesta(e: &Entrega, destino: &Destino) -> String {
    let a_quien = |nombre: Option<&str>, panel: u32| match nombre.map(|n| n.trim().trim_matches(['«', '»'])).filter(|n| !n.is_empty()) {
        Some(n) => format!("a «{n}» (panel {panel})"),
        None => format!("al panel {panel}"),
    };
    let mut t = match destino {
        Destino::Avisada { panel, nombre } => format!(
            "Entregado {}: se lo escribo en cuanto pare con su caja vacía.",
            a_quien(*nombre, *panel)
        ),
        Destino::SinAviso { panel, porque } => format!(
            "Guardado, pero no se lo escribo al panel {panel} ({porque}): lo verá en get_active_panes."
        ),
        Destino::Cerrada { panel } => {
            format!("Guardado. El panel {panel}, que te abrió, ya no está abierto: tu entrega queda en el libro de delegadas.")
        }
        Destino::SinPanel { nombre } => format!(
            "Guardado. Quien te abrió{} no tiene terminal en Adeorq ahora: lo verá en get_active_panes.",
            nombre.map(|n| format!(" ({n})")).unwrap_or_default()
        ),
    };
    if e.estado == Estado::NecesitoAMunir {
        t.push_str(" Si es algo que solo decide Munir, pregúntaselo también con ask_decision, que le llega al móvil.");
    }
    t.push_str(" Sigue si te queda algo; si no, para.");
    t
}

/// Lo que se añade a la línea de la delegada en `get_active_panes`.
pub fn en_la_lista(e: &Entrega, ahora_ms: u64) -> String {
    let min = ahora_ms.saturating_sub(e.ms) / 60_000;
    let hace = match min {
        0 => "hace menos de un minuto".to_string(),
        1 => "hace 1 min".to_string(),
        m if m < 120 => format!("hace {m} min"),
        m => format!("hace {} h", m / 60),
    };
    let linea = e.resumen.split_whitespace().collect::<Vec<_>>().join(" ");
    let corto = if linea.chars().count() > 120 {
        format!("{}…", linea.chars().take(120).collect::<String>().trim_end())
    } else {
        linea
    };
    format!(", Entregó: {} {hace} («{corto}»)", e.estado.dicho())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const RESUMEN: &str = "Hero nuevo en src/Hero.tsx, con su banco en verde y el commit hecho.";

    fn quien() -> Quien {
        Quien { panel: Some(7), existe: true, con_clave: true, delegada: true }
    }

    #[test]
    fn solo_una_delegada_con_su_contrasena() {
        assert!(por_que_no(&quien()).is_none());
        assert!(por_que_no(&Quien { panel: None, ..quien() }).unwrap().contains("ADEORQ_PANE_ID"));
        assert!(por_que_no(&Quien { existe: false, ..quien() }).unwrap().contains("ya no está"));
        assert!(por_que_no(&Quien { con_clave: false, ..quien() }).unwrap().contains("sin contraseña"));
        assert!(por_que_no(&Quien { delegada: false, ..quien() }).unwrap().contains("Munir"));
    }

    #[test]
    fn el_estado_es_uno_de_los_cuatro() {
        for (dado, esperado) in [
            ("hecho", Estado::Hecho),
            (" Bloqueada ", Estado::Bloqueada),
            ("falla", Estado::Falla),
            ("necesito_a_munir", Estado::NecesitoAMunir),
        ] {
            assert_eq!(leer(&json!({ "estado": dado, "resumen": RESUMEN }), 1).unwrap().estado, esperado);
        }
        assert!(leer(&json!({ "estado": "terminado", "resumen": RESUMEN }), 1).unwrap_err().contains("«terminado»"));
        assert!(leer(&json!({ "resumen": RESUMEN }), 1).unwrap_err().contains("Falta `estado`"));
        assert!(leer(&json!({ "estado": 1, "resumen": RESUMEN }), 1).is_err());
    }

    #[test]
    fn el_resumen_ni_corto_ni_largo_ni_con_teclas() {
        let e = leer(&json!({ "estado": "hecho", "resumen": format!("  {RESUMEN}\x1b[201~\r\nY\u{0007} más.  ") }), 5).unwrap();
        assert_eq!(e.resumen, format!("{RESUMEN}[201~\nY más."), "sin ESC, sin campana y con los \\r pasados a salto");
        assert_eq!(e.ms, 5);
        assert!(leer(&json!({ "estado": "hecho", "resumen": "Hecho." }), 1).unwrap_err().contains("40"));
        assert!(leer(&json!({ "estado": "hecho" }), 1).unwrap_err().contains("0 caracteres"));
        let justo = "é".repeat(MAX_RESUMEN);
        assert!(leer(&json!({ "estado": "hecho", "resumen": justo }), 1).is_ok(), "se cuentan caracteres, no bytes");
        let largo = "a".repeat(MAX_RESUMEN + 1);
        assert!(leer(&json!({ "estado": "hecho", "resumen": largo }), 1).unwrap_err().contains("2000"));
    }

    #[test]
    fn los_archivos_y_el_commit() {
        let e = leer(
            &json!({ "estado": "hecho", "resumen": RESUMEN, "archivos": [" src/Hero.tsx ", "docs/a.md"], "commit": " ABC1234 " }),
            1,
        )
        .unwrap();
        assert_eq!(e.archivos, vec!["src/Hero.tsx", "docs/a.md"]);
        assert_eq!(e.commit.as_deref(), Some("abc1234"));
        let sin = leer(&json!({ "estado": "hecho", "resumen": RESUMEN, "commit": "" }), 1).unwrap();
        assert!(sin.archivos.is_empty() && sin.commit.is_none());
        let muchos: Vec<String> = (0..=MAX_ARCHIVOS).map(|i| format!("a{i}.ts")).collect();
        assert!(leer(&json!({ "estado": "hecho", "resumen": RESUMEN, "archivos": muchos }), 1).unwrap_err().contains("51"));
        assert!(leer(&json!({ "estado": "hecho", "resumen": RESUMEN, "archivos": "src/a.ts" }), 1).is_err());
        assert!(leer(&json!({ "estado": "hecho", "resumen": RESUMEN, "archivos": ["a\nb"] }), 1).is_err());
        assert!(leer(&json!({ "estado": "hecho", "resumen": RESUMEN, "archivos": [""] }), 1).is_err());
        assert!(leer(&json!({ "estado": "hecho", "resumen": RESUMEN, "commit": "main" }), 1).unwrap_err().contains("hash"));
        assert!(leer(&json!({ "estado": "hecho", "resumen": RESUMEN, "commit": "abc" }), 1).is_err());
    }

    #[test]
    fn se_guarda_y_se_lee_igual() {
        let e = leer(&json!({ "estado": "necesito_a_munir", "resumen": RESUMEN, "commit": "abc1234" }), 9).unwrap();
        let texto = serde_json::to_string(&e).unwrap();
        assert!(texto.contains("\"necesito_a_munir\"") && !texto.contains("archivos"), "{texto}");
        assert_eq!(serde_json::from_str::<Entrega>(&texto).unwrap(), e);
    }

    #[test]
    fn lo_que_se_le_dice_a_la_hija() {
        let e = leer(&json!({ "estado": "hecho", "resumen": RESUMEN }), 1).unwrap();
        let t = respuesta(&e, &Destino::Avisada { panel: 3, nombre: Some("«Suprema»") });
        assert!(t.starts_with("Entregado a «Suprema» (panel 3)") && t.ends_with("si no, para."), "{t}");
        assert!(!t.contains("ask_decision"));
        let t = respuesta(&e, &Destino::Avisada { panel: 3, nombre: None });
        assert!(t.starts_with("Entregado al panel 3:"), "{t}");
        let t = respuesta(&e, &Destino::SinAviso { panel: 3, porque: "los avisos están apagados".into() });
        assert!(t.contains("no se lo escribo al panel 3 (los avisos están apagados)"), "{t}");
        assert!(respuesta(&e, &Destino::Cerrada { panel: 3 }).contains("ya no está abierto"));
        let t = respuesta(&e, &Destino::SinPanel { nombre: Some("el encargo programado «Informe»") });
        assert!(t.contains("(el encargo programado «Informe») no tiene terminal"), "{t}");
        let m = leer(&json!({ "estado": "necesito_a_munir", "resumen": RESUMEN }), 1).unwrap();
        assert!(respuesta(&m, &Destino::SinPanel { nombre: None }).contains("ask_decision"));
    }

    #[test]
    fn su_linea_en_la_lista() {
        let e = leer(&json!({ "estado": "bloqueada", "resumen": format!("{RESUMEN}\n{}", "x".repeat(200)) }), 0).unwrap();
        let l = en_la_lista(&e, 4 * 60_000);
        assert!(l.starts_with(", Entregó: bloqueada hace 4 min («Hero nuevo"), "{l}");
        assert!(l.ends_with("…»)") && !l.contains('\n'), "{l}");
        assert!(en_la_lista(&e, 30_000).contains("hace menos de un minuto"));
        assert!(en_la_lista(&e, 3 * 3600_000).contains("hace 3 h"));
    }
}
