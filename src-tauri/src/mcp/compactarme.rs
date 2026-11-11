//! `compactarme`: una sesión de Claude Code se compacta a sí misma con su
//! mensaje y, al acabar, sigue sola.
//!
//! Munir, 2026-11-11, por «Orquio General» (BUZON): «que puedas tú coger el
//! mensaje de compactación y compactar por tu cuenta en Adeorq y retomar la
//! sesión». Un agente no puede escribir `/compact` en su propia entrada (los
//! comandos del CLI no son herramientas), y `compactar_terminal` solo vale para
//! las que abrió un agente y manda `/compact` a secas. Esto lo pide la propia
//! sesión desde su terminal: Adeorq espera a que acabe su turno, teclea
//! `/compact <mensaje>`, mira cuándo termina de compactar y le escribe que siga
//! (`pedirPropia` en `src/lib/contexto.ts`).
//!
//! Solo para la terminal de quien llama, y solo si su puente la presenta con la
//! contraseña de esa terminal: otro agente no puede compactar una sesión ajena.

/// Lo más largo que se pega detrás de `/compact`. El bloque de compactación de
/// un `/fin` largo ronda los 5.000 caracteres; más de esto ya no es un
/// mensaje de qué conservar, es la conversación otra vez.
pub const MAX_MENSAJE: usize = 20_000;

/// Ya compactada estas veces, otra sale peor que seguir en una terminal nueva
/// (`COMPACTADA_DE_MAS` en `contexto.ts`, D4). Aquí solo se avisa: lo pide la
/// propia sesión.
const COMPACTADA_DE_MAS: u32 = 2;

/// El texto tal cual se va a pegar, sin nada que la terminal lea como teclas.
/// Un ESC dentro cerraría el pegado entre corchetes (`ESC[201~`) antes de
/// tiempo y lo de detrás se teclearía suelto, Intro incluido. Quedan los
/// saltos de línea y los tabuladores; los `\r` pasan a salto de línea.
pub fn limpio(texto: &str) -> String {
    texto
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .chars()
        .filter(|c| matches!(c, '\n' | '\t') || !c.is_control())
        .collect::<String>()
        .trim()
        .to_string()
}

/// Lo que se sabe de quien llama y de su terminal.
pub struct Quien {
    /// La terminal que presentó su puente (`ADEORQ_PANE_ID`), ya creída.
    pub panel: Option<u32>,
    /// Si esa terminal sigue abierta.
    pub existe: bool,
    /// Si nació con contraseña: una de antes de que las hubiera se cree por
    /// su número a secas, y eso aquí no basta.
    pub con_clave: bool,
    /// Si corre Claude Code, el único que entiende `/compact` con mensaje.
    pub es_claude: bool,
}

/// Por qué no se compacta, o `None` si se puede.
pub fn por_que_no(q: &Quien, mensaje: &str) -> Option<String> {
    if q.panel.is_none() {
        return Some(
            "compactarme solo vale dentro de una terminal de Adeorq: tu conexión no dice cuál es la tuya (ADEORQ_PANE_ID). \
             Si estás en una, pídele a Munir que escriba /compact con tu bloque."
                .into(),
        );
    }
    if !q.existe {
        return Some("Tu terminal ya no está abierta en Adeorq.".into());
    }
    if !q.con_clave {
        return Some(
            "Tu terminal nació en una versión anterior de Adeorq, sin contraseña, y no puedo comprobar que la pides tú. \
             Cuando se abra de nuevo ya valdrá; hasta entonces, pídele a Munir que escriba /compact con tu bloque."
                .into(),
        );
    }
    if !q.es_claude {
        return Some("En tu terminal no corre Claude Code, y solo Claude Code entiende /compact con mensaje.".into());
    }
    let largo = mensaje.chars().count();
    if largo == 0 {
        return Some("Falta `mensaje`: el bloque de compactación, con lo que tiene que conservar el resumen.".into());
    }
    if largo > MAX_MENSAJE {
        return Some(format!(
            "El mensaje tiene {largo} caracteres y caben {MAX_MENSAJE}: deja solo lo que el resumen no puede perder (rutas, decisiones, estado de git, lo pendiente)."
        ));
    }
    None
}

/// Lo que contesta la ventana: el panel acepta, o ya iba a seguir en una
/// terminal nueva (recuperar, con el bloque «Retomar»), o no sabe qué
/// conversación es la suya y no vería cuándo acaba de compactar.
pub fn respuesta(parte: &str, mensaje: &str, seguir: Option<&str>, veces: u32) -> Result<String, String> {
    match parte {
        "nueva" => Ok("No hace falta: Adeorq ya va a seguir en una terminal NUEVA con tu bloque «Retomar» en cuanto acabe este turno, \
                       así que esta no se compacta. Termina tu respuesta con ese bloque."
            .into()),
        "sin-conversacion" => Err("Adeorq no sabe qué conversación es la de tu terminal y no podría ver cuándo acaba de compactar. \
                                   Pídele a Munir que escriba /compact con tu bloque."
            .into()),
        "aceptado" => {
            let despues = match seguir {
                Some(s) if s.is_empty() => "se queda parada esperando a Munir".to_string(),
                Some(s) => format!("te escribe: «{}»", corto(s)),
                None => "te escribe que sigas con lo pendiente del resumen".to_string(),
            };
            let mut t = format!(
                "Hecho. En cuanto acabe este turno, Adeorq te escribe /compact con tu mensaje ({} caracteres); cuando termine de compactar, {despues}. \
                 Acaba tu respuesta ya, sin abrir trabajo nuevo: lo que no esté en el mensaje se queda solo en el historial.",
                mensaje.chars().count()
            );
            if veces >= COMPACTADA_DE_MAS {
                t.push_str(&format!(
                    " Ojo: esta conversación ya se compactó {veces} veces, y cada resumen se hace sobre el anterior y pierde detalle. \
                     Si la siguiente compactación se queda corta, mejor que siga en una terminal nueva con tu bloque «Retomar»."
                ));
            }
            Ok(t)
        }
        otra => Err(format!("La ventana de Adeorq contestó algo que no entiendo: «{otra}».")),
    }
}

/// Las primeras palabras de un texto largo, para repetírselo al agente sin
/// devolverle el párrafo entero.
fn corto(s: &str) -> String {
    let linea = s.lines().next().unwrap_or_default();
    if linea.chars().count() > 80 || s.lines().count() > 1 {
        format!("{}…", linea.chars().take(80).collect::<String>().trim_end())
    } else {
        linea.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn quien() -> Quien {
        Quien { panel: Some(3), existe: true, con_clave: true, es_claude: true }
    }

    #[test]
    fn el_mensaje_se_pega_sin_teclas_escondidas() {
        // Un ESC[201~ dentro cerraría el pegado y lo de detrás iría tecleado, con su Intro.
        assert_eq!(limpio("# BLOQUE\x1b[201~\r\nrm -rf x\r"), "# BLOQUE[201~\nrm -rf x");
        assert_eq!(limpio("  a\tb\n\nc  "), "a\tb\n\nc");
        assert_eq!(limpio("con\u{0007}campana y\u{009b}c1 y\u{007f}del"), "concampana yc1 ydel");
        assert_eq!(limpio("tildes: compactación, ñ, «comillas»"), "tildes: compactación, ñ, «comillas»");
    }

    #[test]
    fn solo_la_propia_terminal_de_claude_y_con_su_contrasena() {
        assert!(por_que_no(&quien(), "# COMPACTACIÓN").is_none());
        assert!(por_que_no(&Quien { panel: None, ..quien() }, "x").unwrap().contains("ADEORQ_PANE_ID"));
        assert!(por_que_no(&Quien { existe: false, ..quien() }, "x").unwrap().contains("ya no está"));
        assert!(por_que_no(&Quien { con_clave: false, ..quien() }, "x").unwrap().contains("sin contraseña"));
        assert!(por_que_no(&Quien { es_claude: false, ..quien() }, "x").unwrap().contains("Claude Code"));
    }

    #[test]
    fn el_mensaje_ni_vacio_ni_la_conversacion_entera() {
        assert!(por_que_no(&quien(), "").unwrap().contains("Falta `mensaje`"));
        let justo = "a".repeat(MAX_MENSAJE);
        assert!(por_que_no(&quien(), &justo).is_none());
        let largo = "é".repeat(MAX_MENSAJE + 1);
        assert!(por_que_no(&quien(), &largo).unwrap().contains("20000"), "se cuentan caracteres, no bytes");
    }

    #[test]
    fn lo_que_se_le_dice_al_agente() {
        let t = respuesta("aceptado", "# BLOQUE", None, 0).unwrap();
        assert!(t.contains("8 caracteres") && t.contains("sigas con lo pendiente") && !t.contains("Ojo"), "{t}");
        let t = respuesta("aceptado", "x", Some(""), 0).unwrap();
        assert!(t.contains("parada esperando a Munir"), "{t}");
        let t = respuesta("aceptado", "x", Some("Sigue con la tienda.\nY luego más."), 0).unwrap();
        assert!(t.contains("«Sigue con la tienda.…»"), "{t}");
        let t = respuesta("aceptado", "x", None, COMPACTADA_DE_MAS).unwrap();
        assert!(t.contains("ya se compactó 2 veces"), "{t}");
        assert!(respuesta("nueva", "x", None, 0).unwrap().contains("terminal NUEVA"));
        assert!(respuesta("sin-conversacion", "x", None, 0).unwrap_err().contains("/compact"));
        assert!(respuesta("rara", "x", None, 0).is_err());
    }
}
