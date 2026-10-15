// El rastro de una terminal que cierra un agente.
//
// Munir, 2026-10-15, contestando qué se hace con las terminales que abre un
// agente por `open_pane`: se dan por terminadas «cuando el agente supremo
// principal lea la sesión y considere que la tarea se ha terminado», y entonces
// «se elimina por completo, para mantener un espacio limpio, con su respectivo
// rastro de handoff o feedback». Quien la abrió la lee, la cierra con
// `close_pane` y le pasa ese rastro; aquí se guarda, un archivo por terminal en
// `%LOCALAPPDATA%\Adeorq\rastros`, para que lo hecho no se vaya con el panel.
//
// La conversación no se borra: es de Claude Code, no de Adeorq, y con su id
// apuntado aquí se retoma cuando haga falta.

use std::path::{Path, PathBuf};

/// Menos que esto no cuenta qué hizo, dónde dejó su parte y qué falta.
pub const MINIMO: usize = 40;
/// Un rastro es un resumen, no la conversación entera.
pub const MAXIMO: usize = 8_000;

/// Lo que se apunta de la terminal que se cierra.
pub struct Rastro<'a> {
    pub nombre: &'a str,
    pub carpeta: &'a str,
    /// La conversación que corría dentro, si su comando lo dice.
    pub sesion: Option<String>,
    /// Qué panel la abrió y cuál la cerró (números de ESE arranque de Adeorq).
    pub abierta_por: Option<u32>,
    pub cerrada_por: Option<u32>,
    pub texto: &'a str,
}

/// El texto que manda el agente, recortado, o por qué no vale.
pub fn validar(texto: &str) -> Result<String, String> {
    let t = texto.trim();
    let n = t.chars().count();
    if n < MINIMO {
        return Err(format!(
            "Falta `rastro`: antes de cerrar una terminal que abrió un agente, escribe en unas líneas qué hizo, dónde dejó su parte (el BUZON.md de su proyecto, un commit, un archivo) y qué queda pendiente. Como mínimo {MINIMO} caracteres; mandaste {n}."
        ));
    }
    if n > MAXIMO {
        return Err(format!("El `rastro` es un resumen: como mucho {MAXIMO} caracteres, y mandaste {n}."));
    }
    Ok(t.to_string())
}

/// La conversación de Claude Code que corre en un panel, leída de su comando
/// (`--resume <id>` o `--session-id <id>`). Sin eso, no se adivina.
pub fn sesion_del_comando(comando: &[String]) -> Option<String> {
    let junto = comando.join(" ");
    let mut palabras = junto.split_whitespace();
    while let Some(p) = palabras.next() {
        if p == "--resume" || p == "--session-id" {
            let id = palabras.next()?.trim_matches(|c| c == '"' || c == '\'');
            if !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
                return Some(id.to_string());
            }
        }
    }
    None
}

/// «2026-10-15 03:20» en UTC, a partir de milisegundos desde 1970. Sin crate de
/// fechas, con el algoritmo de Howard Hinnant (el mismo que `chat::hoy`).
fn fecha_hora_utc(ms: u64) -> (String, String) {
    let secs = (ms / 1000) as i64;
    let z = secs.div_euclid(86_400) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    let s = secs.rem_euclid(86_400);
    (format!("{y:04}-{m:02}-{d:02}"), format!("{:02}:{:02}", s / 3600, s % 3600 / 60))
}

/// Un nombre de archivo a partir del de la terminal: letras y números, guiones
/// entre medias, y nada que Windows no acepte.
fn trozo_de_nombre(nombre: &str) -> String {
    let mut s = String::new();
    for c in nombre.chars().flat_map(char::to_lowercase) {
        let c = match c {
            'á' | 'à' | 'ä' => 'a',
            'é' | 'è' | 'ë' => 'e',
            'í' | 'ì' | 'ï' => 'i',
            'ó' | 'ò' | 'ö' => 'o',
            'ú' | 'ù' | 'ü' => 'u',
            'ñ' => 'n',
            c => c,
        };
        if c.is_ascii_alphanumeric() {
            s.push(c);
        } else if !s.is_empty() && !s.ends_with('-') {
            s.push('-');
        }
        if s.len() >= 48 {
            break;
        }
    }
    let s = s.trim_end_matches('-').to_string();
    if s.is_empty() { "terminal".into() } else { s }
}

/// Lo escribe en `dir` y devuelve dónde. Nunca pisa uno anterior: si ya hay
/// uno con ese nombre en ese minuto, se numera.
pub fn escribir(dir: &Path, r: &Rastro, ahora_ms: u64) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("no pude crear {}: {e}", dir.display()))?;
    let (dia, hora) = fecha_hora_utc(ahora_ms);
    let base = format!("{dia}-{}-{}", hora.replace(':', ""), trozo_de_nombre(r.nombre));
    let mut ruta = dir.join(format!("{base}.md"));
    let mut n = 2;
    while ruta.exists() {
        ruta = dir.join(format!("{base}-{n}.md"));
        n += 1;
    }
    let panel = |p: Option<u32>| p.map(|n| format!("el panel {n}")).unwrap_or_else(|| "un agente sin panel".into());
    let mut md = format!("# Rastro de «{}»\n\n", r.nombre.trim());
    md.push_str(&format!("- Cerrada: {dia} {hora} UTC\n"));
    md.push_str(&format!("- Carpeta: `{}`\n", r.carpeta));
    match &r.sesion {
        Some(id) => md.push_str(&format!("- Conversación: `{id}` (se retoma con `claude --resume {id}` en esa carpeta)\n")),
        None => md.push_str("- Conversación: su comando no la nombraba\n"),
    }
    md.push_str(&format!(
        "- La abrió {} y la cerró {} (números de ese arranque de Adeorq)\n\n",
        panel(r.abierta_por),
        panel(r.cerrada_por)
    ));
    md.push_str("## Qué hizo, dónde dejó su parte y qué falta\n\n");
    md.push_str(r.texto.trim());
    md.push('\n');
    std::fs::write(&ruta, md).map_err(|e| format!("no pude guardar el rastro en {}: {e}", ruta.display()))?;
    Ok(ruta)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_rastro_corto_o_desmedido_no_vale() {
        assert!(validar("hecho").unwrap_err().contains("Falta `rastro`"));
        assert!(validar(&"a".repeat(MAXIMO + 1)).unwrap_err().contains("como mucho"));
        let bueno = "  Rehízo la portada; su parte está en BUZON.md y falta el móvil.  ";
        assert_eq!(validar(bueno).unwrap(), bueno.trim());
    }

    #[test]
    fn la_sesion_sale_del_comando_y_si_no_no_se_adivina() {
        let c = |s: &str| vec!["cmd.exe".to_string(), "/k".to_string(), s.to_string()];
        assert_eq!(
            sesion_del_comando(&c("chcp 65001 >nul && claude --permission-mode acceptEdits --resume 572c3eb8-4cba-4c56-8923-bddd346e5626 --effort xhigh")).as_deref(),
            Some("572c3eb8-4cba-4c56-8923-bddd346e5626")
        );
        assert_eq!(sesion_del_comando(&c("claude --session-id 0006490e-5bba --effort xhigh")).as_deref(), Some("0006490e-5bba"));
        assert_eq!(sesion_del_comando(&c("codex")), None);
        assert_eq!(sesion_del_comando(&c("claude --resume")), None);
        assert_eq!(sesion_del_comando(&c("claude --resume ../../malo")), None);
    }

    #[test]
    fn la_fecha_sale_en_utc() {
        // 2026-10-15 03:20:00 UTC
        assert_eq!(fecha_hora_utc(1_792_034_400_000), ("2026-10-15".into(), "03:20".into()));
        assert_eq!(fecha_hora_utc(0), ("1970-01-01".into(), "00:00".into()));
    }

    #[test]
    fn se_escribe_sin_pisar_y_con_lo_que_hace_falta_para_retomarla() {
        let dir = std::env::temp_dir().join(format!("adeorq-rastros-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let r = Rastro {
            nombre: "web · Orquio: web y competencia",
            carpeta: r"C:\proyectos\Orquio\web",
            sesion: Some("0006490e-5bba".into()),
            abierta_por: Some(7),
            cerrada_por: Some(7),
            texto: "Investigó ocho webs y dejó tres estructuras; su parte está en BUZON.md.",
        };
        let a = escribir(&dir, &r, 1_792_034_400_000).unwrap();
        let b = escribir(&dir, &r, 1_792_034_400_000).unwrap();
        assert_eq!(a.file_name().unwrap(), "2026-10-15-0320-web-orquio-web-y-competencia.md");
        assert_eq!(b.file_name().unwrap(), "2026-10-15-0320-web-orquio-web-y-competencia-2.md");
        let md = std::fs::read_to_string(&a).unwrap();
        assert!(md.contains("claude --resume 0006490e-5bba"));
        assert!(md.contains("La abrió el panel 7 y la cerró el panel 7"));
        assert!(md.contains("su parte está en BUZON.md"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
