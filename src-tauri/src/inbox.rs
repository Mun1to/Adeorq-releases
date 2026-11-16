// The tray his agents write into.
//
// An agent in a session sees things that are not the job it was given: an idea
// worth having later, a loose end, something that should go on the calendar.
// Until now that died in the transcript, or interrupted him mid-work.
//
// So: a plain text file the agents append one line to, and a section in the
// Agenda where he accepts or discards each one. Deliberately NOT a direct
// write into his brújula. Two reasons, and both matter. An agent has no
// business holding his credentials, and a proposal he has not read yet is not
// a decision: the tray keeps the agent's reach at "suggest", and leaves
// "decide" where it belongs.
//
// The format is one bullet, because that is what an agent writes without
// getting it wrong:
//
//     - idea | Adeorq | Que el rail recuerde el último proyecto abierto
//     - paso | VidLife | Falta el guard del XP negativo
//
// Kind and project are optional; a bare line is an idea for the ecosystem.

use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    /// Position in the file, so accepting one can remove exactly that line.
    pub line: usize,
    /// "idea" or "paso": an idea goes to the brújula, a paso to METAS.md.
    pub kind: String,
    pub project: String,
    pub text: String,
}

const DEFAULT_PROJECT: &str = "ecosistema";

pub fn inbox_path() -> Option<PathBuf> {
    Some(crate::dir_datos().ok()?.join("bandeja.md"))
}

/// Everything an agent could reasonably write for "this is a next step".
fn kind_of(word: &str) -> Option<&'static str> {
    match word.trim().to_lowercase().as_str() {
        "idea" | "ideas" => Some("idea"),
        "paso" | "pasos" | "tarea" | "tareas" | "todo" => Some("paso"),
        _ => None,
    }
}

fn parse_line(line: &str, at: usize) -> Option<Note> {
    // The byte-order mark PowerShell puts at the head of a file it creates
    // with -Encoding utf8. Caught by writing a note the way the rule tells an
    // agent to: the very first note anyone files came back unparsed, its
    // "- idea |" hidden behind an invisible character.
    let body = line
        .trim_start_matches('\u{feff}')
        .trim()
        .trim_start_matches(['-', '*', '•'])
        .trim();
    if body.is_empty() {
        return None;
    }
    let parts: Vec<&str> = body.split('|').map(str::trim).collect();
    // "kind | project | text", "kind | text", or just "text".
    let (kind, project, text) = match parts.as_slice() {
        [k, p, rest @ ..] if kind_of(k).is_some() && !rest.is_empty() => {
            (kind_of(k).unwrap(), (*p).to_string(), rest.join(" | "))
        }
        [k, rest @ ..] if kind_of(k).is_some() && !rest.is_empty() => {
            (kind_of(k).unwrap(), DEFAULT_PROJECT.to_string(), rest.join(" | "))
        }
        _ => ("idea", DEFAULT_PROJECT.to_string(), body.to_string()),
    };
    let text = text.trim().to_string();
    if text.is_empty() {
        return None;
    }
    Some(Note {
        line: at,
        kind: kind.to_string(),
        project: if project.is_empty() {
            DEFAULT_PROJECT.to_string()
        } else {
            project
        },
        text,
    })
}

#[tauri::command(async)]
pub fn read_inbox() -> Vec<Note> {
    let Some(path) = inbox_path() else {
        return Vec::new();
    };
    let Ok(text) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };
    text.lines()
        .enumerate()
        .filter(|(_, l)| !l.trim_start().starts_with('#'))
        .filter_map(|(i, l)| parse_line(l, i))
        .collect()
}

/// Removes one note. Accepting and discarding both end here: once he has
/// decided, the note has done its job.
///
/// With `text` (and `project`), the line removed is the one that still says
/// that: the index alone was read earlier, and if the file changed since (two
/// discards in a row before the list was read again, another surface removing
/// one above) that index holds ANOTHER note, which was deleted instead.
#[tauri::command(async)]
pub fn drop_inbox(line: usize, text: Option<String>, project: Option<String>) -> Result<(), String> {
    let path = inbox_path().ok_or("no encuentro la carpeta de Adeorq")?;
    let actual = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let out = quitar_nota(&actual, line, text.as_deref(), project.as_deref())?;
    std::fs::write(&path, out).map_err(|e| e.to_string())
}

/// The file without that note: the one read at `line` if it still says
/// `texto`, otherwise the first one that does. Without `texto`, by index.
fn quitar_nota(actual: &str, line: usize, texto: Option<&str>, proyecto: Option<&str>) -> Result<String, String> {
    let lineas: Vec<&str> = actual.lines().collect();
    let dice = |i: usize| {
        let l = lineas[i];
        !l.trim_start().starts_with('#')
            && parse_line(l, i).is_some_and(|n| Some(n.text.as_str()) == texto && proyecto.is_none_or(|p| n.project == p))
    };
    let quitar = match texto {
        None => line,
        Some(_) if line < lineas.len() && dice(line) => line,
        Some(_) => (0..lineas.len())
            .find(|&i| dice(i))
            .ok_or("Esa nota ya no está en la bandeja: se quitó desde otro sitio.")?,
    };
    let kept: Vec<&str> = lineas
        .iter()
        .enumerate()
        .filter(|(i, _)| *i != quitar)
        .map(|(_, l)| *l)
        .collect();
    let mut out = kept.join("\n");
    if !out.is_empty() {
        out.push('\n');
    }
    Ok(out)
}

/// The path itself, to show it in the panel and in the rules.
#[tauri::command]
pub fn inbox_where() -> String {
    inbox_path()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Used by Adeorq itself when he writes a note from the panel, so both ends
/// speak the same format.
#[tauri::command(async)]
pub fn write_inbox(kind: String, project: String, text: String) -> Result<(), String> {
    let clean = text.trim().replace(['\n', '\r'], " ");
    if clean.is_empty() {
        return Err("no has escrito nada".into());
    }
    let path = inbox_path().ok_or("no encuentro la carpeta de Adeorq")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let kind = kind_of(&kind).unwrap_or("idea");
    let project = if project.trim().is_empty() {
        DEFAULT_PROJECT
    } else {
        project.trim()
    };
    let mut current = crate::leer_para_reescribir(&path)?;
    if !current.is_empty() && !current.ends_with('\n') {
        current.push('\n');
    }
    current.push_str(&format!("- {kind} | {project} | {clean}\n"));
    std::fs::write(&path, current).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_full_line_is_read_whole() {
        let n = parse_line("- idea | Adeorq | Que el rail recuerde el proyecto", 3).unwrap();
        assert_eq!(n.kind, "idea");
        assert_eq!(n.project, "Adeorq");
        assert_eq!(n.text, "Que el rail recuerde el proyecto");
        assert_eq!(n.line, 3);
    }

    #[test]
    fn the_words_an_agent_might_use_all_work() {
        for word in ["paso", "Pasos", "tarea", "TODO"] {
            let n = parse_line(&format!("- {word} | X | algo"), 0).unwrap();
            assert_eq!(n.kind, "paso", "{word}");
        }
        assert_eq!(parse_line("- ideas | X | algo", 0).unwrap().kind, "idea");
    }

    #[test]
    fn a_bare_line_is_an_idea_for_the_ecosystem() {
        let n = parse_line("Deberíamos cobrar por Layco ya", 0).unwrap();
        assert_eq!(n.kind, "idea");
        assert_eq!(n.project, "ecosistema");
        assert_eq!(n.text, "Deberíamos cobrar por Layco ya");
    }

    #[test]
    fn a_kind_with_no_project_still_lands_somewhere() {
        let n = parse_line("- paso | arreglar el guard del XP", 0).unwrap();
        assert_eq!(n.kind, "paso");
        assert_eq!(n.project, "ecosistema");
        assert_eq!(n.text, "arreglar el guard del XP");
    }

    /// A pipe inside the sentence must not eat half of it.
    #[test]
    fn text_keeps_its_own_pipes() {
        let n = parse_line("- idea | Vidorq | probar a | b | c", 0).unwrap();
        assert_eq!(n.text, "probar a | b | c");
        assert_eq!(n.project, "Vidorq");
    }

    /// What `Add-Content -Encoding utf8` actually writes the first time.
    #[test]
    fn a_byte_order_mark_does_not_hide_the_format() {
        let n = parse_line("\u{feff}- idea | Adeorq | con marca invisible", 0).unwrap();
        assert_eq!(n.kind, "idea");
        assert_eq!(n.project, "Adeorq");
        assert_eq!(n.text, "con marca invisible");
    }

    #[test]
    fn empty_and_heading_lines_are_not_notes() {
        assert!(parse_line("   ", 0).is_none());
        assert!(parse_line("-", 0).is_none());
        assert!(parse_line("- idea |  |  ", 0).is_none());
    }

    #[test]
    fn dropping_a_line_leaves_the_others_untouched() {
        let dir = std::env::temp_dir().join("adeorq-inbox-test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("bandeja.md");
        std::fs::write(&path, "- idea | A | uno\n- paso | B | dos\n- idea | C | tres\n").unwrap();

        // Same logic as drop_inbox, on a file we own (the command reads the
        // real path, which a test has no business rewriting).
        let text = std::fs::read_to_string(&path).unwrap();
        let kept: Vec<&str> = text
            .lines()
            .enumerate()
            .filter(|(i, _)| *i != 1)
            .map(|(_, l)| l)
            .collect();
        std::fs::write(&path, kept.join("\n") + "\n").unwrap();

        let out = std::fs::read_to_string(&path).unwrap();
        let notes: Vec<Note> = out
            .lines()
            .enumerate()
            .filter_map(|(i, l)| parse_line(l, i))
            .collect();
        assert_eq!(notes.len(), 2);
        assert_eq!(notes[0].text, "uno");
        assert_eq!(notes[1].text, "tres");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// «dos» was read at line 1; then «uno» went (another discard). By index,
    /// line 1 is now «tres», and that is the one that went.
    #[test]
    fn a_note_is_dropped_by_what_it_says_not_by_where_it_was() {
        let ahora = "- paso | B | dos\n- idea | C | tres\n";
        assert_eq!(quitar_nota(ahora, 1, None, None).unwrap(), "- paso | B | dos\n", "by index, the wrong one goes");
        assert_eq!(quitar_nota(ahora, 1, Some("dos"), Some("B")).unwrap(), "- idea | C | tres\n");
        // Still where it was read: that very line, even if another says the same.
        let doble = "- idea | A | igual\n- idea | A | igual\n";
        assert_eq!(quitar_nota(doble, 1, Some("igual"), Some("A")).unwrap(), "- idea | A | igual\n");
        // Gone from the file: an error, and nothing else is touched.
        assert!(quitar_nota(ahora, 0, Some("uno"), Some("A")).is_err());
        // Same text in another project is another note.
        assert!(quitar_nota(ahora, 0, Some("dos"), Some("Otro")).is_err());
        // A heading never counts as the note.
        assert_eq!(quitar_nota("# dos\n- paso | B | dos\n", 0, Some("dos"), Some("B")).unwrap(), "# dos\n");
    }
}

#[cfg(test)]
mod real_tray {
    use super::*;

    /// Not part of the suite: reads the tray on this machine, to prove the
    /// lines an agent writes with Add-Content come back parsed.
    /// `cargo test real_tray -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn what_is_in_the_tray_right_now() {
        for n in read_inbox() {
            println!("[{}] {} · {} · {}", n.line, n.kind, n.project, n.text);
        }
    }
}
