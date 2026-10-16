// El historial de la «Pantalla» del móvil cuando el agente pinta a pantalla
// completa.
//
// Munir, 2026-10-16, desde el móvil: «el modo pantalla se sigue sin ver nada
// del historial, casi nada del historial de la terminal». Su Claude Code va con
// el renderizador de pantalla completa (`tui: fullscreen`), que dibuja en la
// pantalla alternativa: ahí xterm no guarda nada por encima de lo que se ve, y
// lo de antes solo existe dentro de Claude Code, que lo vuelve a pintar desde
// su transcript cuando subes con la rueda. Así que el historial se saca de ese
// mismo transcript, en el orden en que pasó: lo que escribiste, lo que dijo y
// cada herramienta que usó entre medias. El móvil lo pinta encima de la
// pantalla viva y lo corta donde esta empieza.
//
// Aparte del modo chat (`sessions::conversacion_de`) porque aquí importa el
// ORDEN, que allí se pierde al juntar un turno entero en una burbuja.

use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::sessions::{es_fontaneria, lineas_entre, texto_del_contenido, transcript_de};

/// Una pieza del historial, en el orden del transcript.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "t", rename_all = "lowercase")]
pub enum Pieza {
    /// Lo que escribiste tú.
    Tu { x: String },
    /// Lo que dijo el agente.
    Dice { x: String },
    /// Una herramienta: su nombre y lo que se le pasó, como lo pinta la
    /// terminal («Bash(git status)»). Sin el resultado: a pantalla completa
    /// Claude Code también los pliega, y es lo que más pesaría por datos.
    Uso { n: String, d: String },
}

/// Lo que se lee hacia atrás de entrada, y hasta dónde se insiste si en ese
/// trozo no cabían las piezas pedidas (casi todo un transcript son resultados).
const TROZO: u64 = 1_500_000;
const TOPE: u64 = 12_000_000;
/// Un mensaje muy largo del agente se corta: es la pantalla, no el archivo.
const TOPE_TEXTO: usize = 6_000;

/// Las piezas de unas líneas de transcript, sumadas a `out`.
pub fn sumar_piezas<'a>(out: &mut Vec<Pieza>, lineas: impl Iterator<Item = &'a str>) {
    for linea in lineas {
        let Ok(v) = serde_json::from_str::<Value>(linea) else { continue };
        let kind = v["type"].as_str().unwrap_or_default();
        if kind != "user" && kind != "assistant" {
            continue;
        }
        // Lo de los subagentes, el resumen de una compactación y el cuerpo de
        // una skill no los escribió nadie en esta terminal.
        if v["isSidechain"].as_bool().unwrap_or(false)
            || v["isCompactSummary"].as_bool().unwrap_or(false)
            || v["isMeta"].as_bool().unwrap_or(false)
        {
            continue;
        }
        let content = &v["message"]["content"];
        let Some(bloques) = content.as_array() else {
            // Una cadena pelada: lo que escribes tú.
            let texto = texto_del_contenido(content);
            if kind == "user" && !texto.is_empty() && !es_fontaneria(&texto) {
                out.push(Pieza::Tu { x: recortar(&texto) });
            }
            continue;
        };
        for b in bloques {
            match b["type"].as_str() {
                Some("text") => {
                    let texto = b["text"].as_str().unwrap_or_default().trim();
                    if texto.is_empty() || es_fontaneria(texto) {
                        continue;
                    }
                    let x = recortar(texto);
                    out.push(if kind == "assistant" { Pieza::Dice { x } } else { Pieza::Tu { x } });
                }
                Some("tool_use") if kind == "assistant" => {
                    let (n, d) = uso_en_terminal(b["name"].as_str().unwrap_or("?"), &b["input"]);
                    out.push(Pieza::Uso { n, d });
                }
                _ => {}
            }
        }
    }
}

fn recortar(s: &str) -> String {
    if s.chars().count() <= TOPE_TEXTO {
        return s.to_owned();
    }
    let corte: String = s.chars().take(TOPE_TEXTO).collect();
    format!("{corte}…")
}

/// En una línea y sin saltos, con su tope.
fn en_una_linea(s: &str, max: usize) -> String {
    let limpio = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if limpio.chars().count() <= max {
        return limpio;
    }
    let corte: String = limpio.chars().take(max).collect();
    format!("{corte}…")
}

/// Las tres últimas partes de una ruta: la carpeta da el contexto que el
/// nombre suelto no da, y la ruta entera de Windows no cabe en un móvil.
fn cola_de_ruta(p: &str) -> String {
    let partes: Vec<&str> = p.split(['/', '\\']).filter(|s| !s.is_empty()).collect();
    partes[partes.len().saturating_sub(3)..].join("/")
}

/// Cómo pinta la terminal una herramienta: el nombre y, entre paréntesis, lo
/// que la distingue de las demás llamadas a la misma.
pub fn uso_en_terminal(name: &str, input: &Value) -> (String, String) {
    let cadena = |k: &str| input[k].as_str().unwrap_or_default();
    if let Some(resto) = name.strip_prefix("mcp__") {
        let (srv, tool) = resto.split_once("__").unwrap_or((resto, ""));
        return (format!("{srv} · {tool}"), String::new());
    }
    let d = match name {
        // El comando, no su descripción: es lo que se ve en la terminal.
        "Bash" | "PowerShell" => en_una_linea(cadena("command").lines().next().unwrap_or_default(), 100),
        "Read" | "Edit" | "Write" | "NotebookEdit" => cola_de_ruta(cadena("file_path")),
        "Grep" | "Glob" => en_una_linea(cadena("pattern"), 80),
        "WebFetch" => en_una_linea(cadena("url"), 80),
        "WebSearch" => en_una_linea(cadena("query"), 80),
        "Task" | "Agent" => en_una_linea(cadena("description"), 80),
        "Skill" => en_una_linea(cadena("skill"), 60),
        _ => String::new(),
    };
    (name.to_owned(), d)
}

/// Lo leído de un transcript, para no volver a leerlo entero cada 3 s.
struct Leida {
    path: PathBuf,
    hasta: u64,
    piezas: Vec<Pieza>,
}
static LEIDAS: Mutex<Vec<Leida>> = Mutex::new(Vec::new());
const LEIDAS_MAX: usize = 3;

fn piezas_de(path: &Path, max: usize) -> std::io::Result<Vec<Pieza>> {
    let size = std::fs::metadata(path)?.len();
    let mut leidas = LEIDAS.lock().unwrap_or_else(|e| e.into_inner());
    // Ya leído y solo ha crecido: se suma lo nuevo.
    if let Some(i) = leidas.iter().position(|l| l.path == path && l.hasta <= size) {
        let mut l = leidas.remove(i);
        if l.hasta < size {
            let (lineas, hasta) = lineas_entre(path, l.hasta, size, false)?;
            sumar_piezas(&mut l.piezas, lineas.iter().map(String::as_str));
            l.hasta = hasta;
            if l.piezas.len() > max {
                l.piezas.drain(..l.piezas.len() - max);
            }
        }
        let piezas = l.piezas.clone();
        leidas.insert(0, l);
        return Ok(piezas);
    }
    let mut trozo = TROZO;
    let (mut piezas, hasta) = loop {
        let desde = size.saturating_sub(trozo);
        let (lineas, hasta) = lineas_entre(path, desde, size, desde > 0)?;
        let mut piezas = Vec::new();
        sumar_piezas(&mut piezas, lineas.iter().map(String::as_str));
        if piezas.len() >= max || desde == 0 || trozo >= TOPE {
            break (piezas, hasta);
        }
        trozo = (trozo * 4).min(TOPE);
    };
    if piezas.len() > max {
        piezas.drain(..piezas.len() - max);
    }
    leidas.retain(|l| l.path != path);
    leidas.insert(0, Leida { path: path.to_owned(), hasta, piezas: piezas.clone() });
    leidas.truncate(LEIDAS_MAX);
    Ok(piezas)
}

/// El historial de una sesión de Claude Code: sus últimas `max` piezas.
pub fn de_sesion(cwd: &str, sesion: &str, max: usize) -> Result<Vec<Pieza>, String> {
    // El id viaja en una ruta: sin esto, «../../algo» leería cualquier archivo.
    if sesion.is_empty() || !sesion.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("id de sesión no válido".into());
    }
    let path = transcript_de(cwd, Some(sesion)).ok_or("esa conversación no está en el disco")?;
    piezas_de(&path, max).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn piezas(lineas: &[&str]) -> Vec<Pieza> {
        let mut out = Vec::new();
        sumar_piezas(&mut out, lineas.iter().copied());
        out
    }

    #[test]
    fn guarda_el_orden_de_texto_y_herramientas() {
        let p = piezas(&[
            r#"{"type":"user","message":{"content":"arregla el menú"}}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Miro el código."}]}}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"git status\ngit log","description":"Ver el estado"}}]}}"#,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","content":"M a.ts"}]}}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"C:\\proyectos\\Adeorq\\src\\lib\\movil.ts"}}]}}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Ya está."}]}}"#,
        ]);
        assert_eq!(
            p,
            vec![
                Pieza::Tu { x: "arregla el menú".into() },
                Pieza::Dice { x: "Miro el código.".into() },
                Pieza::Uso { n: "Bash".into(), d: "git status".into() },
                Pieza::Uso { n: "Read".into(), d: "src/lib/movil.ts".into() },
                Pieza::Dice { x: "Ya está.".into() },
            ]
        );
    }

    #[test]
    fn deja_fuera_lo_que_no_escribio_nadie() {
        let p = piezas(&[
            r#"{"type":"user","message":{"content":"<system-reminder>x</system-reminder>"}}"#,
            r#"{"type":"user","isMeta":true,"message":{"content":"cuerpo de una skill"}}"#,
            r#"{"type":"user","isCompactSummary":true,"message":{"content":"resumen"}}"#,
            r#"{"type":"assistant","isSidechain":true,"message":{"content":[{"type":"text","text":"de un subagente"}]}}"#,
            r#"{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"pienso"}]}}"#,
            r#"no es json"#,
        ]);
        assert!(p.is_empty(), "{p:?}");
    }

    #[test]
    fn una_herramienta_mcp_se_lee_por_servidor() {
        let (n, d) = uso_en_terminal("mcp__adeorq__ask_decision", &serde_json::json!({}));
        assert_eq!((n.as_str(), d.as_str()), ("adeorq · ask_decision", ""));
    }

    #[test]
    fn un_id_raro_no_lee_nada() {
        assert!(de_sesion("C:\\proyectos", "../../secreto", 10).is_err());
    }
}
