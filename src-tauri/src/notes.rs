// The notes he pins on the canvas, and the reason they are files.
//
// A note could have lived inside the board's own JSON, next to the terminals
// and the drawings. It does not, and the decision is the whole feature: he
// wants an agent to be able to TICK a checkbox when it finishes a task. An
// agent already knows how to edit a text file, and knows nothing about our
// board format. So a note is a markdown file in %LOCALAPPDATA%\Adeorq\notas,
// the board only remembers where it sits, and the arrow that connects a note
// to a terminal hands the agent a path it can already work with.
//
// Three things come free from that choice: the notes save themselves (his ask
// was "like the notes app on my phone"), they outlive the board, and he can
// open them outside Adeorq. The format is the one an agent writes without
// getting it wrong:
//
//     # Antes del lunes
//
//     - [ ] aviso de IA en la web
//     - [x] publicar la 0.8.5
//     llamar al gestor
//
// The first `# ` line is the title; everything else is the body, and a line
// that starts with `- [ ]` or `- [x]` paints as a checkbox.

use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NoteFile {
    pub id: String,
    pub text: String,
    /// Last write, in milliseconds. The canvas polls this to notice that an
    /// agent ticked something: cheap, and it does not need the contents.
    pub stamp: u64,
    pub path: String,
}

/// An id has to survive being a file name, and the front end makes it up. So
/// it is checked here and not there: this module is what actually touches the
/// disk, and `..\..\` in an id must never become a path.
fn safe_id(id: &str) -> Result<&str, String> {
    let ok = !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok {
        Ok(id)
    } else {
        Err("identificador de nota no válido".into())
    }
}

pub fn notes_dir() -> Result<PathBuf, String> {
    Ok(crate::dir_datos()?.join("notas"))
}

fn note_path(id: &str) -> Result<PathBuf, String> {
    Ok(notes_dir()?.join(format!("nota-{}.md", safe_id(id)?)))
}

fn stamp_of(path: &std::path::Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Si lo escrito no dice nada, una vez quitada la plantilla.
///
/// Una nota nace con `- [ ]` puesto, así que «vacía» no es `text.is_empty()`:
/// es lo que queda al retirar los andamios del formato. Medido en su carpeta el
/// 2026-08-14: de ocho notas guardadas, CINCO eran uno de 0 bytes, uno de 2, un
/// `- [ ]` pelado de 6, un `- [ ] r` de 7 y un `# yuujrehf` de 12. O sea que
/// quien luego repasa las notas se come cinco archivos de basura por cada tres
/// buenos, y todos los creó abrir el capturador y cerrarlo.
///
/// El `- [ ] r` de 7 bytes SÍ se guarda, y tiene que ser así: es una letra que
/// alguien tecleó. Esto quita andamios, no juzga si lo escrito vale la pena.
fn esta_vacia(texto: &str) -> bool {
    texto.lines().all(|linea| {
        let l = linea.trim();
        let l = l
            .strip_prefix("- [ ]")
            .or_else(|| l.strip_prefix("- [x]"))
            .or_else(|| l.strip_prefix("- [X]"))
            .or_else(|| l.strip_prefix('#'))
            .or_else(|| l.strip_prefix('-'))
            .or_else(|| l.strip_prefix('*'))
            .unwrap_or(l);
        l.trim().is_empty()
    })
}

/// Writes a note and answers with what it looks like on disk now. The stamp
/// comes back so the canvas does not immediately re-read what it just wrote.
///
/// Una nota que no dice nada NO se guarda, y si ya existía se borra: ver
/// `esta_vacia`. Se borra en vez de dejarla a cero bytes porque un archivo
/// vacío en esa carpeta es exactamente igual de molesto que uno con la
/// plantilla dentro, y el lienzo ya sabe leer una nota que no existe (devuelve
/// texto vacío, sin error).
#[tauri::command]
pub fn note_write(id: String, text: String) -> Result<NoteFile, String> {
    let path = note_path(&id)?;
    if esta_vacia(&text) {
        // `remove_file` de algo que no está no es un fallo: es el caso normal
        // de abrir el capturador y cerrarlo sin escribir.
        let _ = std::fs::remove_file(&path);
        return Ok(NoteFile {
            id,
            text,
            stamp: 0,
            path: path.to_string_lossy().into_owned(),
        });
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, &text).map_err(|e| e.to_string())?;
    Ok(NoteFile {
        id,
        text,
        stamp: stamp_of(&path),
        path: path.to_string_lossy().into_owned(),
    })
}

/// Reads one note. A missing file is not an error worth shouting about: a note
/// deleted from the folder should leave an empty card, not a red banner.
#[tauri::command]
pub fn note_read(id: String) -> Result<NoteFile, String> {
    let path = note_path(&id)?;
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    Ok(NoteFile {
        id,
        text,
        stamp: stamp_of(&path),
        path: path.to_string_lossy().into_owned(),
    })
}

/// Qué notas existen en disco. La usa el calendario para poner un punto en los
/// días que ya tienen algo escrito: preguntar archivo por archivo serían 31
/// viajes por mes para pintar una rejilla.
#[tauri::command]
pub fn note_list() -> Vec<String> {
    let Ok(dir) = notes_dir() else {
        return vec![];
    };
    let Ok(leidos) = std::fs::read_dir(dir) else {
        return vec![];
    };
    leidos
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let nombre = e.file_name().to_string_lossy().into_owned();
            let id = nombre.strip_prefix("nota-")?.strip_suffix(".md")?;
            // Una nota que se quedó vacía no cuenta como escrita: si no, un
            // día tocado sin querer llevaría su punto para siempre.
            let tiene = e.metadata().map(|m| m.len() > 0).unwrap_or(false);
            tiene.then(|| id.to_owned())
        })
        .collect()
}

/// Removing a note from the board also removes its file. It goes to the
/// recycle bin for the same reason a session does: the button is small.
#[tauri::command]
pub fn note_delete(id: String) -> Result<(), String> {
    let path = note_path(&id)?;
    if !path.is_file() {
        return Ok(());
    }
    crate::manage::to_recycle_bin(&path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn an_id_cannot_climb_out_of_the_notes_folder() {
        assert!(safe_id("..\\..\\bandeja").is_err());
        assert!(safe_id("nota/1").is_err());
        assert!(safe_id("").is_err());
        assert!(safe_id("d1x-abc_9").is_ok());
    }

    #[test]
    fn a_note_lives_in_its_own_file_named_after_its_id() {
        let path = note_path("d1x").unwrap();
        assert!(path.ends_with("nota-d1x.md"));
        assert!(path.parent().unwrap().ends_with("notas"));
    }

    /// La ida y la vuelta DE VERDAD: se escribe en disco, se lee, se lista y
    /// se limpia. Los otros tests comprueban las reglas; este comprueba que la
    /// nota existe como archivo, que es de lo que depende que un agente pueda
    /// abrirla y marcar una casilla.
    #[test]
    fn a_note_really_lands_on_disk_and_comes_back() {
        let id = "pruebadeadeorqtemporal";
        let texto = "# Prueba\n\n- [ ] una\n- [x] otra\n";

        let escrita = note_write(id.into(), texto.into()).expect("se escribe");
        assert_eq!(escrita.text, texto);
        assert!(escrita.stamp > 0, "una nota escrita tiene fecha");
        assert!(Path::new(&escrita.path).is_file(), "el archivo existe de verdad");

        let leida = note_read(id.into()).expect("se lee");
        assert_eq!(leida.text, texto, "vuelve tal cual, sin normalizar nada");

        assert!(note_list().contains(&id.to_owned()), "sale en la lista");

        // Lo que hace un agente: reescribir el archivo por fuera marcando una
        // casilla. La nota tiene que ver el cambio, que es la feature entera.
        std::fs::write(&escrita.path, texto.replace("- [ ] una", "- [x] una")).unwrap();
        let tras_el_agente = note_read(id.into()).unwrap();
        assert!(tras_el_agente.text.contains("- [x] una"), "se ve lo que tocó el agente");

        // Sin rastro: esto corre en la carpeta de notas real.
        std::fs::remove_file(&escrita.path).unwrap();
        assert!(!note_list().contains(&id.to_owned()));
    }

    /// Una nota vacía no cuenta como escrita: es lo que decide si un día del
    /// calendario lleva su punto o no.
    ///
    /// Desde el 2026-08-21 además NO LLEGA AL DISCO. Antes se escribía el
    /// archivo igual y solo se le negaba el punto, y por eso su carpeta acabó
    /// con cinco archivos de basura de ocho.
    #[test]
    fn an_empty_note_does_not_count_as_written() {
        let id = "pruebavaciadeadeorq";
        let f = note_write(id.into(), String::new()).expect("se escribe");
        assert!(!note_list().contains(&id.to_owned()), "vacía no lleva punto");
        assert!(
            !std::path::Path::new(&f.path).exists(),
            "y tampoco deja el archivo puesto"
        );
    }

    /// Lo que de verdad crea la basura: abrir el capturador, que nace con su
    /// plantilla dentro, y cerrarlo sin escribir nada.
    #[test]
    fn the_template_on_its_own_is_not_a_note() {
        for plantilla in ["- [ ]", "#", "- [ ]\n- [ ]\n", "  \n\n  ", "# \n- [x]  ", "-", "*"] {
            assert!(
                esta_vacia(plantilla),
                "esto es andamio, no una nota: {plantilla:?}"
            );
        }
    }

    /// Y la otra mitad, que es la que se puede estropear al afinar la de
    /// arriba: en cuanto hay UNA letra tecleada, eso es de él y se guarda.
    #[test]
    fn one_typed_letter_is_already_a_note() {
        for escrita in ["- [ ] r", "# yuujrehf", "llamar al gestor", "- [x] publicar", "0"] {
            assert!(
                !esta_vacia(escrita),
                "alguien tecleó esto y hay que guardarlo: {escrita:?}"
            );
        }
    }

    /// Vaciar una nota que ya existía la borra, en vez de dejarla a cero bytes.
    /// Un archivo vacío en esa carpeta molesta exactamente igual que uno con la
    /// plantilla dentro.
    #[test]
    fn emptying_an_existing_note_removes_it() {
        let id = "pruebavaciadadeadeorq";
        let escrita = note_write(id.into(), "# algo\n- [ ] una cosa".into()).unwrap();
        assert!(std::path::Path::new(&escrita.path).exists(), "primero existe");

        let vaciada = note_write(id.into(), "- [ ]".into()).unwrap();
        assert!(
            !std::path::Path::new(&vaciada.path).exists(),
            "y al quedarse en la plantilla, se va"
        );
        assert!(!note_list().contains(&id.to_owned()));
    }

    #[test]
    fn a_note_that_was_never_written_reads_as_empty_and_not_as_a_failure() {
        // El agente puede borrar el archivo, o el usuario vaciar la carpeta.
        // Eso deja una tarjeta en blanco, no una pantalla de error.
        let leida = note_read("noexistecomonota".into()).unwrap();
        assert_eq!(leida.text, "");
        assert_eq!(leida.stamp, 0);
    }
}
