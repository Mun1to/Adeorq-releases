// The next steps of a project, read from where they already live.
//
// Every project of his keeps docs/METAS.md in the same shape: one `## META n`
// per goal, a ✅ in the heading once it is closed, a `**Hecho cuando:**` line
// saying what closing it means, and a `🅿️ Aparcadero` section at the end for
// what is waiting with its unlocking condition. That file is the source of
// truth and it is in git, so Adeorq reads it rather than keeping a second list
// that would drift from it by Thursday.
//
// Writing is deliberately the smallest thing that is useful: one bullet at the
// end of the Aparcadero. Anything cleverer (editing a goal, closing one) is a
// conversation with Claude inside the project, not a button.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    /// Heading without the `## ` and without the closed/active marks.
    pub title: String,
    pub done: bool,
    /// What "finished" means for it, empty when the file does not say.
    pub when: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metas {
    pub exists: bool,
    pub path: String,
    pub metas: Vec<Meta>,
    /// The Aparcadero, one string per bullet, markdown untouched.
    pub parked: Vec<String>,
}

/// Written when the section has to be created. Recognising one is looser than
/// writing one, because his older files spell it without the sign.
const PARKED_HEADING: &str = "## 🅿️ Aparcadero";

fn metas_path(project: &Path) -> PathBuf {
    project.join("docs").join("METAS.md")
}

/// A heading that names a goal. Checked against his real files, which do not
/// agree with each other: Adeorq says "META 1 —", Vidorq "META A:", Expoal
/// "Nivel 2 — Pulido ✅". Anything else under ## is prose, not a goal.
fn is_goal(heading: &str) -> bool {
    let head = heading.trim_start_matches(['#', ' ']);
    let word = head.split([' ', ':', '—', '-']).next().unwrap_or("");
    word.eq_ignore_ascii_case("meta") || word.eq_ignore_ascii_case("nivel")
}

fn is_parked(heading: &str) -> bool {
    heading.to_lowercase().contains("aparcadero")
}

/// "**Hecho cuando:** x", "**Hecho cuando**: x" and "Hecho cuando: x" are the
/// same sentence, and all three exist in his projects.
fn done_when(line: &str) -> Option<String> {
    let plain = line.replace('*', "");
    let plain = plain.trim();
    let rest = plain.strip_prefix("Hecho cuando")?;
    let rest = rest.trim_start().strip_prefix(':')?;
    Some(rest.trim().to_string())
}

/// "META 1 — La cabina 🎯 (activa)" → ("META 1 — La cabina (activa)", false).
fn clean_title(heading: &str) -> (String, bool) {
    let done = heading.contains('✅');
    let title = heading
        .replace('✅', "")
        .replace('🎯', "")
        .replace("CERRADA", "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    (title, done)
}

fn parse(text: &str) -> (Vec<Meta>, Vec<String>) {
    let mut metas: Vec<Meta> = Vec::new();
    let mut parked: Vec<String> = Vec::new();
    let mut in_parked = false;

    for line in text.lines() {
        let trimmed = line.trim_end();
        if let Some(heading) = trimmed.strip_prefix("## ") {
            in_parked = is_parked(heading);
            if !in_parked && is_goal(heading) {
                let (title, done) = clean_title(heading);
                metas.push(Meta {
                    title,
                    done,
                    when: String::new(),
                });
            }
            continue;
        }
        if in_parked {
            if let Some(item) = trimmed.strip_prefix("- ") {
                if !item.trim().is_empty() {
                    parked.push(item.trim().to_string());
                }
            }
            continue;
        }
        // The "hecho cuando" belongs to the goal it sits under, and only the
        // first one: the rest of the paragraph is context.
        if let Some(rest) = done_when(trimmed) {
            if let Some(last) = metas.last_mut() {
                if last.when.is_empty() {
                    last.when = rest;
                }
            }
        }
    }
    (metas, parked)
}

/// Where the Aparcadero ends: at the next `## `, or at the end of the file.
/// None when there is no such section. Byte offset, so it can split the text.
fn parked_end(text: &str) -> Option<usize> {
    let mut start: Option<usize> = None;
    let mut at = 0;
    for line in text.split_inclusive('\n') {
        if let Some(heading) = line.trim_end().strip_prefix("## ") {
            if start.is_some() {
                return Some(at);
            }
            if is_parked(heading) {
                start = Some(at);
            }
        }
        at += line.len();
    }
    start.map(|_| text.len())
}

#[tauri::command]
pub fn read_metas(project: String) -> Metas {
    let path = metas_path(Path::new(&project));
    let shown = path.to_string_lossy().into_owned();
    match std::fs::read_to_string(&path) {
        Ok(text) => {
            let (metas, parked) = parse(&text);
            Metas {
                exists: true,
                path: shown,
                metas,
                parked,
            }
        }
        // A project with no METAS.md is normal, not an error: the panel offers
        // to start one instead of showing a red line.
        Err(_) => Metas {
            exists: false,
            path: shown,
            metas: Vec::new(),
            parked: Vec::new(),
        },
    }
}

/**
 * Adds one bullet to the Aparcadero, creating the file or the section when
 * they are missing. Never touches a line that was already there.
 */
#[tauri::command]
pub fn add_parked(project: String, text: String) -> Result<(), String> {
    let item = text.trim();
    if item.is_empty() {
        return Err("no has escrito nada".into());
    }
    if item.contains('\n') {
        return Err("una sola línea, que esto es una viñeta".into());
    }
    let path = metas_path(Path::new(&project));
    let parent = path.parent().ok_or("ruta rara")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;

    let current = std::fs::read_to_string(&path).unwrap_or_default();
    let name = Path::new(&project)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "este proyecto".into());

    let next = if current.trim().is_empty() {
        format!("# METAS de {name}\n\n> Metas, no fechas.\n\n{PARKED_HEADING}\n\n- {item}\n")
    } else if let Some(end) = parked_end(&current) {
        let (head, tail) = current.split_at(end);
        format!("{}\n- {item}\n{}", head.trim_end(), tail)
    } else {
        format!("{}\n\n{PARKED_HEADING}\n\n- {item}\n", current.trim_end())
    };

    std::fs::write(&path, next).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "# METAS de Prueba\n\n\
> Metas, no fechas.\n\n\
## META 1 — La cabina 🎯 (activa)\n\n\
Texto que da contexto.\n\n\
**Hecho cuando:** abres Adeorq y trabajas.\n\n\
## META 2 — Los ojos ✅ CERRADA (2026-07-24)\n\n\
**Hecho cuando:** ya está.\n\n\
## 🅿️ Aparcadero (con condición de desbloqueo)\n\n\
- **Una cosa**. 🔓 Desbloquea cuando: pase algo.\n\
- Otra cosa.\n";

    #[test]
    fn reads_goals_their_state_and_what_closes_them() {
        let (metas, parked) = parse(SAMPLE);
        assert_eq!(metas.len(), 2);
        assert!(!metas[0].done);
        assert!(metas[0].title.starts_with("META 1"));
        assert_eq!(metas[0].when, "abres Adeorq y trabajas.");
        assert!(metas[1].done, "la ✅ marca la cerrada");
        assert_eq!(parked.len(), 2);
        assert!(parked[0].contains("Desbloquea cuando"));
    }

    /// The three shapes his own projects use, none of which agree.
    #[test]
    fn every_way_he_writes_a_goal_is_understood() {
        let mixed = "## META A: el único que vive dentro de Resolve\n\n\
**Hecho cuando**: un prompt produce un timeline.\n\n\
## Nivel 2 — Pulido de producto ✅\n\n\
Hecho cuando: se pulió.\n\n\
## La decisión que ordena todo\n\n\
Esto es prosa, no una meta.\n\n\
## Aparcadero (sin el cartelito)\n\n\
- algo aparcado\n";
        let (metas, parked) = parse(mixed);
        assert_eq!(metas.len(), 2, "prosa contada como meta: {metas:?}");
        assert_eq!(metas[0].when, "un prompt produce un timeline.");
        assert!(metas[1].done);
        assert_eq!(metas[1].when, "se pulió.");
        assert_eq!(parked, vec!["algo aparcado".to_string()]);
    }

    #[test]
    fn a_bullet_finds_the_parked_section_without_its_sign() {
        let dir = temp_project("sin-cartel");
        std::fs::write(
            dir.join("docs").join("METAS.md"),
            "# Metas\n\n## Aparcadero\n\n- vieja\n",
        )
        .unwrap();
        add_parked(dir.to_string_lossy().into_owned(), "nueva".into()).unwrap();
        let out = std::fs::read_to_string(dir.join("docs").join("METAS.md")).unwrap();
        assert_eq!(out.matches("## ").count(), 1, "ha creado otra sección");
        assert_eq!(parse(&out).1, vec!["vieja".to_string(), "nueva".to_string()]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_parked_section_does_not_swallow_what_comes_after_it() {
        let text = format!("{SAMPLE}\n## META 3 — Otra 🎯\n\n- no soy del aparcadero\n");
        let (metas, parked) = parse(&text);
        assert_eq!(metas.len(), 3);
        assert_eq!(parked.len(), 2, "las viñetas de después no cuentan");
    }

    fn temp_project(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("adeorq-metas-{tag}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("docs")).unwrap();
        dir
    }

    #[test]
    fn a_new_bullet_lands_inside_the_parked_section() {
        let dir = temp_project("dentro");
        std::fs::write(dir.join("docs").join("METAS.md"), SAMPLE).unwrap();
        add_parked(dir.to_string_lossy().into_owned(), "  Idea nueva  ".into()).unwrap();

        let out = std::fs::read_to_string(dir.join("docs").join("METAS.md")).unwrap();
        let (metas, parked) = parse(&out);
        assert_eq!(metas.len(), 2, "no ha tocado las metas");
        assert_eq!(parked.last().unwrap(), "Idea nueva");
        assert!(out.contains("- Otra cosa."), "lo que había sigue ahí");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_bullet_goes_before_the_section_that_follows_the_parked_one() {
        let dir = temp_project("orden");
        let text = format!("{SAMPLE}\n## Notas sueltas\n\nalgo\n");
        std::fs::write(dir.join("docs").join("METAS.md"), &text).unwrap();
        add_parked(dir.to_string_lossy().into_owned(), "En su sitio".into()).unwrap();

        let out = std::fs::read_to_string(dir.join("docs").join("METAS.md")).unwrap();
        let bullet = out.find("- En su sitio").unwrap();
        let after = out.find("## Notas sueltas").unwrap();
        assert!(bullet < after, "la viñeta se ha colado en la otra sección");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_project_without_the_file_gets_one_started() {
        let dir = temp_project("vacio");
        add_parked(dir.to_string_lossy().into_owned(), "La primera".into()).unwrap();
        let read = read_metas(dir.to_string_lossy().into_owned());
        assert!(read.exists);
        assert_eq!(read.parked, vec!["La primera".to_string()]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Not part of the suite: it reads his real projects, to check the parser
    /// against the files he actually writes rather than against my sample.
    /// `cargo test real_metas -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_metas_across_his_projects() {
        let root = Path::new("C:\\proyectos");
        let mut with_file = 0;
        for entry in std::fs::read_dir(root).unwrap().flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let read = read_metas(path.to_string_lossy().into_owned());
            if !read.exists {
                continue;
            }
            with_file += 1;
            let open = read.metas.iter().filter(|m| !m.done).count();
            let with_when = read.metas.iter().filter(|m| !m.when.is_empty()).count();
            println!(
                "{:<22} metas {:>2} (abiertas {open}, con «hecho cuando» {with_when}) · aparcadero {}",
                path.file_name().unwrap().to_string_lossy(),
                read.metas.len(),
                read.parked.len()
            );
        }
        println!("proyectos con METAS.md: {with_file}");
    }

    #[test]
    fn an_empty_or_multiline_bullet_is_refused() {
        let dir = temp_project("malo");
        let p = dir.to_string_lossy().into_owned();
        assert!(add_parked(p.clone(), "   ".into()).is_err());
        assert!(add_parked(p, "una\notra".into()).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
