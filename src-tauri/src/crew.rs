//! El buzón de una cuadrilla.
//!
//! Cuando el Capataz reparte un encargo entre varios agentes, a cada uno se le
//! dice lo mismo: edita solo tus archivos, y si necesitas algo de la zona de
//! otro NO lo toques, apúntalo en BUZON.md. Ese archivo es lo único que los
//! puestos se dicen entre ellos mientras trabajan.
//!
//! El problema es que hasta ahora nadie lo leía. Quedaba escrito en el disco y
//! Munir se enteraba al final, cuando ya había que deshacer cosas. Esto lo
//! trae al panel para que se vea mientras pasa, que es cuando sirve de algo.

use std::path::Path;

/// Una línea del buzón, ya limpia de viñetas y almohadillas.
#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct CrewNote {
    /// Quién lo dejó, si la línea lo dice: "captura: falta traducir el tip".
    pub who: String,
    pub text: String,
}

/// Lo último de todo, no lo primero: un buzón crece por abajo y lo que importa
/// es lo que se acaba de escribir.
const MAX_NOTES: usize = 12;

/// Parte una línea en «quién» y «qué», cuando se puede.
///
/// Los agentes escriben `- captura: toqué CanvasImage.tsx`, pero también
/// `- falta traducir el tip` a secas. Lo segundo vale igual: mejor una nota sin
/// dueño que perderla por no venir con el formato bonito.
fn parse_note(raw: &str) -> Option<CrewNote> {
    let body = raw.trim().trim_start_matches(['-', '*', '•', '+']).trim();
    if body.is_empty() || body.starts_with('#') {
        return None;
    }
    // Solo se parte por el primer ":" y solo si lo de delante parece un nombre
    // de puesto, no una frase entera ni una hora ni una ruta de Windows.
    if let Some((who, rest)) = body.split_once(':') {
        let who = who.trim();
        let rest = rest.trim();
        let plausible = !who.is_empty()
            && who.len() <= 24
            && !rest.is_empty()
            && !who.contains(' ')
            && !who.contains('\\')
            && !who.contains('/');
        if plausible {
            return Some(CrewNote {
                who: who.to_string(),
                text: rest.to_string(),
            });
        }
    }
    Some(CrewNote {
        who: String::new(),
        text: body.to_string(),
    })
}

/// Saca las notas de un buzón ya leído. Separada del disco para poder probarla.
pub fn parse_inbox(text: &str) -> Vec<CrewNote> {
    let all: Vec<CrewNote> = text.lines().filter_map(parse_note).collect();
    // Las últimas, conservando el orden en que se escribieron.
    let from = all.len().saturating_sub(MAX_NOTES);
    all[from..].to_vec()
}

/// Lee el BUZON.md de un proyecto. Un buzón que no existe todavía no es un
/// error: es una cuadrilla que aún no ha tenido nada que decirse.
#[tauri::command]
pub fn read_crew_inbox(cwd: String) -> Vec<CrewNote> {
    let dir = Path::new(&cwd);
    if !dir.is_absolute() {
        return Vec::new();
    }
    let path = dir.join("BUZON.md");
    let Ok(meta) = std::fs::metadata(&path) else {
        return Vec::new();
    };
    // Un buzón son unas líneas. Si alguien deja ahí un volcado de un mega, no
    // se carga en memoria para descubrirlo.
    if meta.len() > 512 * 1024 {
        return Vec::new();
    }
    let Ok(text) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };
    parse_inbox(&text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn separates_who_wrote_it_from_what_they_said() {
        let n = parse_note("- captura: toqué CanvasImage.tsx").unwrap();
        assert_eq!(n.who, "captura");
        assert_eq!(n.text, "toqué CanvasImage.tsx");
    }

    #[test]
    fn a_note_without_an_owner_is_still_a_note() {
        let n = parse_note("falta traducir el tip nuevo").unwrap();
        assert_eq!(n.who, "");
        assert_eq!(n.text, "falta traducir el tip nuevo");
    }

    /// Lo que NO puede pasar: que una frase con dos puntos se parta y la mitad
    /// de la frase acabe mostrándose como si fuera el nombre de un puesto.
    #[test]
    fn a_sentence_with_a_colon_is_not_an_owner() {
        let n = parse_note("- ojo con esto: el pomodoro no avisa").unwrap();
        assert_eq!(n.who, "");
        assert_eq!(n.text, "ojo con esto: el pomodoro no avisa");

        let ruta = parse_note("- mira C:\\proyectos\\Adeorq\\src").unwrap();
        assert_eq!(ruta.who, "");
    }

    #[test]
    fn headings_and_blank_lines_are_not_notes() {
        assert!(parse_note("# BUZON").is_none());
        assert!(parse_note("   ").is_none());
        assert!(parse_note("-").is_none());
    }

    #[test]
    fn keeps_the_last_ones_in_the_order_they_were_written() {
        let muchas: String = (1..=20).map(|i| format!("- p{i}: nota {i}\n")).collect();
        let notas = parse_inbox(&muchas);
        assert_eq!(notas.len(), MAX_NOTES);
        assert_eq!(notas[0].text, "nota 9", "se queda con la cola, no la cabeza");
        assert_eq!(notas[MAX_NOTES - 1].text, "nota 20", "y la última es la última");
    }

    #[test]
    fn a_missing_inbox_is_silence_not_a_crash() {
        let notas = read_crew_inbox("C:\\no\\existe\\seguro\\jamas".into());
        assert!(notas.is_empty());
        // Una ruta relativa tampoco: el cwd de un pane siempre es absoluto.
        assert!(read_crew_inbox("relativa".into()).is_empty());
    }
}
