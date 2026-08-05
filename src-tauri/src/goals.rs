// Los objetivos del día, y la razón de que sean un archivo.
//
// Podrían haber vivido en `localStorage` como el resto de la configuración, y
// entonces serían una lista que solo Munir puede tocar y que se pierde al
// cambiar de equipo. Son un markdown en `%LOCALAPPDATA%\Adeorq\objetivos`, uno
// por día, por el mismo motivo que las notas del lienzo (ver `notes.rs`): un
// agente sabe editar un archivo de texto y no sabe nada de nuestros formatos.
// Así, cuando una terminal termina lo que le pediste, puede TACHAR el objetivo
// sola, y el día siguiente empieza con su hoja en blanco sin que nadie limpie.
//
// El formato es el que un agente escribe sin equivocarse, el mismo de las
// notas:
//
//     # Objetivos · 2026-07-31
//
//     - [ ] probar la voz de Grok en el agente puente
//     - [x] publicar la 0.9.40
//
// Una línea que no empiece por `- [ ]` o `- [x]` se ignora al leer y se
// conserva al escribir, para que se pueda anotar lo que sea entre medias sin
// que Adeorq lo borre.

use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Goal {
    /// La posición dentro del día. No es un identificador estable a propósito:
    /// el archivo se edita a mano y a un número de línea no hay que darle
    /// mantenimiento. Las operaciones mandan el texto además del índice y solo
    /// actúan si coinciden, que es lo que evita tachar el objetivo equivocado
    /// cuando el archivo cambió por detrás.
    pub idx: usize,
    pub text: String,
    pub done: bool,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GoalDay {
    pub date: String,
    pub goals: Vec<Goal>,
    pub path: String,
}

/// Un día es un nombre de archivo, así que se comprueba aquí y no en el front:
/// este módulo es el que toca el disco, y un `..\..` en la fecha no puede
/// convertirse nunca en una ruta.
fn safe_date(date: &str) -> Result<&str, String> {
    let ok = date.len() == 10
        && date.as_bytes()[4] == b'-'
        && date.as_bytes()[7] == b'-'
        && date
            .chars()
            .all(|c| c.is_ascii_digit() || c == '-');
    if ok {
        Ok(date)
    } else {
        Err("fecha no válida (se espera AAAA-MM-DD)".into())
    }
}

pub fn goals_dir() -> Result<PathBuf, String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    Ok(PathBuf::from(local).join("Adeorq").join("objetivos"))
}

fn goals_path(date: &str) -> Result<PathBuf, String> {
    Ok(goals_dir()?.join(format!("{}.md", safe_date(date)?)))
}

/// Saca los objetivos de un texto markdown. Público para que lo usen los tests
/// sin tocar el disco.
fn parse(texto: &str) -> Vec<Goal> {
    texto
        .lines()
        .filter_map(|l| {
            let t = l.trim_start();
            let done = if t.starts_with("- [x]") || t.starts_with("- [X]") {
                true
            } else if t.starts_with("- [ ]") {
                false
            } else {
                return None;
            };
            let text = t[5..].trim().to_owned();
            if text.is_empty() {
                return None;
            }
            Some(Goal { idx: 0, text, done })
        })
        .enumerate()
        .map(|(i, g)| Goal { idx: i, ..g })
        .collect()
}

#[tauri::command]
pub async fn goals_read(date: String) -> Result<GoalDay, String> {
    let path = goals_path(&date)?;
    let texto = std::fs::read_to_string(&path).unwrap_or_default();
    Ok(GoalDay {
        date,
        goals: parse(&texto),
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub async fn goals_add(date: String, text: String) -> Result<GoalDay, String> {
    let limpio = text.trim();
    if limpio.is_empty() {
        return Err("un objetivo sin texto no es un objetivo".into());
    }
    // Una sola línea: un salto dentro partiría el objetivo en dos al releerlo.
    let limpio = limpio.replace(['\n', '\r'], " ");
    let path = goals_path(&date)?;
    std::fs::create_dir_all(goals_dir()?).map_err(|e| e.to_string())?;
    let mut texto = std::fs::read_to_string(&path).unwrap_or_default();
    if texto.is_empty() {
        texto.push_str(&format!("# Objetivos · {date}\n\n"));
    } else if !texto.ends_with('\n') {
        texto.push('\n');
    }
    texto.push_str(&format!("- [ ] {limpio}\n"));
    std::fs::write(&path, &texto).map_err(|e| e.to_string())?;
    goals_read(date).await
}

/// Marca o desmarca. `text` es la red de seguridad: si el archivo cambió por
/// detrás (lo editó un agente, o Munir a mano) y en ese índice hay otra cosa,
/// no se toca nada en vez de tachar el objetivo equivocado.
#[tauri::command]
pub async fn goals_toggle(date: String, idx: usize, text: String) -> Result<GoalDay, String> {
    reescribir(&date, idx, &text, |linea, done| {
        let marca = if done { "- [ ] " } else { "- [x] " };
        Some(format!("{marca}{}", &linea[5..].trim()))
    })
    .await
}

#[tauri::command]
pub async fn goals_remove(date: String, idx: usize, text: String) -> Result<GoalDay, String> {
    reescribir(&date, idx, &text, |_, _| None).await
}

/// El motor de las dos de arriba: encuentra la línea del objetivo número `idx`
/// y la cambia por lo que diga `f`, o la borra si devuelve `None`.
async fn reescribir(
    date: &str,
    idx: usize,
    text: &str,
    f: impl Fn(&str, bool) -> Option<String>,
) -> Result<GoalDay, String> {
    let path = goals_path(date)?;
    let texto = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut salida: Vec<String> = Vec::new();
    let mut visto = 0usize;
    let mut tocado = false;
    for linea in texto.lines() {
        let t = linea.trim_start();
        let es_objetivo =
            t.starts_with("- [ ]") || t.starts_with("- [x]") || t.starts_with("- [X]");
        if !es_objetivo || t[5..].trim().is_empty() {
            salida.push(linea.to_owned());
            continue;
        }
        if visto == idx && t[5..].trim() == text.trim() {
            let done = t.starts_with("- [x]") || t.starts_with("- [X]");
            if let Some(nueva) = f(t, done) {
                salida.push(nueva);
            }
            tocado = true;
        } else {
            salida.push(linea.to_owned());
        }
        visto += 1;
    }
    if tocado {
        let mut fin = salida.join("\n");
        fin.push('\n');
        std::fs::write(&path, fin).map_err(|e| e.to_string())?;
    }
    goals_read(date.to_owned()).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_ticked_and_the_pending() {
        let g = parse("# Objetivos · 2026-07-31\n\n- [ ] probar la voz\n- [x] publicar\ntexto suelto\n");
        assert_eq!(g.len(), 2, "el texto suelto no es un objetivo");
        assert_eq!(g[0].text, "probar la voz");
        assert!(!g[0].done);
        assert_eq!(g[1].text, "publicar");
        assert!(g[1].done);
        assert_eq!(g[1].idx, 1);
    }

    /// Un agente puede escribir la mayúscula, y sería absurdo que eso contara
    /// como «sin hacer» justo después de que lo diera por hecho.
    #[test]
    fn an_uppercase_tick_still_counts_as_done() {
        let g = parse("- [X] hecho por un agente\n");
        assert!(g[0].done);
    }

    #[test]
    fn an_empty_checkbox_line_is_not_a_goal() {
        assert!(parse("- [ ]   \n- [x]\n").is_empty());
    }

    /// La fecha acaba siendo un nombre de archivo, así que nada que se parezca
    /// a una ruta puede pasar de aquí.
    #[test]
    fn a_date_can_never_be_a_path() {
        assert!(safe_date("2026-07-31").is_ok());
        assert!(safe_date("../../etc").is_err());
        assert!(safe_date("2026-07-31.md").is_err());
        assert!(safe_date("").is_err());
    }
}
