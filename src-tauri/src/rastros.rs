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

/// Una conversación que cerró un agente con su rastro, y cuándo (la hora del
/// archivo, en milisegundos desde 1970).
#[derive(serde::Serialize, Debug, PartialEq)]
pub struct Cerrada {
    pub sesion: String,
    pub cuando_ms: u64,
}

/// La conversación que nombra un rastro, si la nombra (la línea que escribe `escribir`).
fn sesion_del_rastro(md: &str) -> Option<String> {
    let id = md.lines().find_map(|l| l.strip_prefix("- Conversación: `"))?.split('`').next()?;
    (!id.is_empty() && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')).then(|| id.to_string())
}

/// Las conversaciones que tienen rastro en `dir`. Si una se cerró varias veces
/// (se retomó y la volvió a cerrar un agente), vale el último cierre.
///
/// Es lo que deja la barra limpia (Munir, 2026-10-21, con 36 sesiones en
/// Adeorq: «hay demasiadas… que esto no vuelva a pasar»): de las 35 de los
/// últimos treinta días, 22 eran terminales que un agente abrió, terminó y
/// cerró, y `close_pane` se lleva el panel pero no la conversación, que es de
/// Claude Code. La barra las archiva solas (`archivadasSolas` en
/// `lib/enLaBarra.ts`) mientras nadie las retome.
pub fn cerradas(dir: &Path) -> Vec<Cerrada> {
    let mut ultimas: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
    for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let ruta = e.path();
        if ruta.extension().and_then(|x| x.to_str()) != Some("md") {
            continue;
        }
        let Some(sesion) = std::fs::read_to_string(&ruta).ok().as_deref().and_then(sesion_del_rastro) else { continue };
        let cuando_ms = e
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_millis() as u64);
        let v = ultimas.entry(sesion).or_insert(0);
        *v = (*v).max(cuando_ms);
    }
    let mut todas: Vec<Cerrada> = ultimas.into_iter().map(|(sesion, cuando_ms)| Cerrada { sesion, cuando_ms }).collect();
    todas.sort_by(|a, b| a.sesion.cmp(&b.sesion));
    todas
}

/// El rastro de una terminal que abrió otra sesión y que Munir cerró con la X.
///
/// Sin él su conversación se quedaba en la barra un mes, que es justo lo que
/// `cerradas` vino a quitar (2026-10-21: «que esto no vuelva a pasar»). No hay
/// agente que cuente qué hizo, así que el texto lo dice así y apunta adónde
/// mirar. El id lo manda la ventana: solo vale si es un id.
pub fn escribir_de_la_x(dir: &Path, nombre: &str, carpeta: &str, sesion: &str, abierta_por: &str, ahora_ms: u64) -> Result<PathBuf, String> {
    let de = abierta_por.trim();
    guardar_de_la_ventana(dir, nombre, sesion, ahora_ms, |dia, hora| format!(
        "# Rastro de «{}»\n\n- Cerrada: {dia} {hora} UTC\n- Carpeta: `{carpeta}`\n- Conversación: `{sesion}` (se retoma con `claude --resume {sesion}` en esa carpeta)\n- La abrió la sesión «{de}» y la cerró Munir con la X\n\n## Qué hizo, dónde dejó su parte y qué falta\n\nLa cerró Munir con la X, sin rastro de su agente: lo que hizo está en su conversación y, si lo dejó, en el BUZON.md de su proyecto o en los commits de esa carpeta.\n",
        nombre.trim()
    ))
}

/// El rastro de una conversación que siguió en una terminal nueva («Nueva con
/// traspaso»): su `/fin` dejó el traspaso y la nueva nació con su bloque
/// «Retomar». Con él la barra la archiva en cuanto se cierra su panel, igual
/// que las que cierra un agente (Munir, 2026-10-22, D4).
pub fn escribir_de_relevo(dir: &Path, nombre: &str, carpeta: &str, sesion: &str, ahora_ms: u64) -> Result<PathBuf, String> {
    guardar_de_la_ventana(dir, nombre, sesion, ahora_ms, |dia, hora| format!(
        "# Rastro de «{}»\n\n- Relevada: {dia} {hora} UTC\n- Carpeta: `{carpeta}`\n- Conversación: `{sesion}` (se retoma con `claude --resume {sesion}` en esa carpeta)\n- Siguió en una terminal nueva («Nueva con traspaso»), con el bloque «Retomar la sesión» de su /fin como primer mensaje\n\n## Qué hizo, dónde dejó su parte y qué falta\n\nLo dejó su /fin al final de esta conversación: el resumen, los commits y el bloque «Retomar», y los traspasos en el BUZON.md de su proyecto.\n",
        nombre.trim()
    ))
}

/// Un rastro que escribe la ventana y no un agente: el id lo manda ella, así
/// que solo vale si es un id, y el fichero no pisa a otro del mismo minuto.
fn guardar_de_la_ventana(dir: &Path, nombre: &str, sesion: &str, ahora_ms: u64, md: impl FnOnce(&str, &str) -> String) -> Result<PathBuf, String> {
    if sesion.is_empty() || !sesion.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err(format!("«{sesion}» no es el id de una conversación"));
    }
    std::fs::create_dir_all(dir).map_err(|e| format!("no pude crear {}: {e}", dir.display()))?;
    let (dia, hora) = fecha_hora_utc(ahora_ms);
    let base = format!("{dia}-{}-{}", hora.replace(':', ""), trozo_de_nombre(nombre));
    let mut ruta = dir.join(format!("{base}.md"));
    let mut n = 2;
    while ruta.exists() {
        ruta = dir.join(format!("{base}-{n}.md"));
        n += 1;
    }
    std::fs::write(&ruta, md(&dia, &hora)).map_err(|e| format!("no pude guardar el rastro en {}: {e}", ruta.display()))?;
    Ok(ruta)
}

/// Para la ventana: «Nueva con traspaso» sobre una conversación de Claude Code.
#[tauri::command(async)]
pub fn rastro_de_relevo(nombre: String, carpeta: String, sesion: String) -> Result<(), String> {
    let ahora = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64);
    escribir_de_relevo(&crate::dir_datos()?.join("rastros"), &nombre, &carpeta, &sesion, ahora).map(|_| ())
}

/// Para la ventana: la X de Munir sobre una terminal que abrió otra sesión.
#[tauri::command(async)]
pub fn rastro_de_la_x(nombre: String, carpeta: String, sesion: String, abierta_por: String) -> Result<(), String> {
    let ahora = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64);
    escribir_de_la_x(&crate::dir_datos()?.join("rastros"), &nombre, &carpeta, &sesion, &abierta_por, ahora).map(|_| ())
}

/// Para la barra: qué conversaciones cerró un agente. Sin carpeta de rastros,
/// ninguna.
#[tauri::command(async)]
pub fn rastros_cerradas() -> Result<Vec<Cerrada>, String> {
    Ok(cerradas(&crate::dir_datos()?.join("rastros")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_barra_sabe_que_conversaciones_cerro_un_agente() {
        let dir = std::env::temp_dir().join(format!("adeorq-rastros-cerradas-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let r = |nombre, sesion: Option<&str>| Rastro {
            nombre,
            carpeta: r"C:\proyectos\Adeorq",
            sesion: sesion.map(str::to_string),
            abierta_por: Some(3),
            cerrada_por: Some(3),
            texto: "Hizo los ajustes a lo ancho; su parte está en BUZON.md y d0edb65.",
        };
        escribir(&dir, &r("Ajustes a lo ancho", Some("f8f85dcc-b7a9-4ca4-bfd1-49ddcc79bc02")), 1_792_034_400_000).unwrap();
        escribir(&dir, &r("Ajustes otra vez", Some("f8f85dcc-b7a9-4ca4-bfd1-49ddcc79bc02")), 1_792_034_460_000).unwrap();
        escribir(&dir, &r("Codex sin id", None), 1_792_034_400_000).unwrap();
        // Lo que no sea un rastro no cuenta, y un id raro tampoco.
        std::fs::write(dir.join("nota.txt"), "- Conversación: `aaaa`").unwrap();
        std::fs::write(dir.join("malo.md"), "- Conversación: `../../malo`").unwrap();
        let c = cerradas(&dir);
        assert_eq!(c.len(), 1, "{c:?}");
        assert_eq!(c[0].sesion, "f8f85dcc-b7a9-4ca4-bfd1-49ddcc79bc02");
        assert!(c[0].cuando_ms > 0);
        assert!(cerradas(&dir.join("no-existe")).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn la_x_de_munir_deja_un_rastro_que_la_barra_lee() {
        let dir = std::env::temp_dir().join(format!("adeorq-rastros-x-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let id = "0a889401-ed11-48d6-a572-534f603b7c01";
        let ruta = escribir_de_la_x(&dir, "Orquio · Novedades por correo", r"C:\proyectos\Orquio", id, "Orquio General", 1_792_034_400_000).unwrap();
        let md = std::fs::read_to_string(&ruta).unwrap();
        assert!(md.contains("la cerró Munir con la X") && md.contains("«Orquio General»"), "{md}");
        assert_eq!(cerradas(&dir).iter().map(|c| c.sesion.as_str()).collect::<Vec<_>>(), vec![id]);
        // Lo que manda la ventana no puede salirse de la carpeta ni colar otra cosa.
        assert!(escribir_de_la_x(&dir, "x", "c", "../../malo", "y", 0).is_err());
        assert!(escribir_de_la_x(&dir, "x", "c", "", "y", 0).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn la_relevada_deja_un_rastro_que_la_barra_lee() {
        let dir = std::env::temp_dir().join(format!("adeorq-rastros-relevo-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let id = "5e55a1d2-6c0a-4b1e-9a77-0c0ffee00022";
        let ruta = escribir_de_relevo(&dir, "Adeorq · compactar", r"C:\proyectos\Adeorq", id, 1_792_034_400_000).unwrap();
        let md = std::fs::read_to_string(&ruta).unwrap();
        assert!(md.contains("Siguió en una terminal nueva"), "{md}");
        assert_eq!(cerradas(&dir).iter().map(|c| c.sesion.as_str()).collect::<Vec<_>>(), vec![id]);
        assert!(escribir_de_relevo(&dir, "x", "c", "../../malo", 0).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

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
