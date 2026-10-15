// El enlace del MCP (`adeorq.exe --mcp`), desde una copia que el instalador no cierra.
//
// Claude Code, Codex y Gemini lanzan el enlace con la ruta que tengan apuntada,
// y casi siempre es la de la instalación (`C:\Apps\…\Adeorq\adeorq.exe`). El
// instalador cierra a la fuerza todo proceso que use ese fichero (el Restart
// Manager de `CheckIfAppIsRunning`, en el guion de NSIS que genera Tauri), así
// que al actualizar, los agentes que sobreviven con las terminales en su
// propio proceso (`terminales.rs`) se quedaban sin las herramientas de Adeorq
// hasta que alguien escribiera `/mcp`.
//
// Con ese modo encendido, la app deja una copia en
// `%LOCALAPPDATA%\Adeorq\mcp\adeorq.exe` y cambia la ruta en los clientes que
// apuntaban a la instalación; las demás entradas no se tocan. La copia se
// renueva al cambiar de versión: si un enlace vivo la tiene cogida, Windows no
// deja escribirla pero sí renombrarla, así que la vieja se aparta y se borra
// cuando nadie la use. El enlace mismo aguanta el reinicio y se reengancha
// (`mcp::run_mcp_bridge`).

use serde_json::Value;
use std::path::{Path, PathBuf};

/// Lo deja todo listo. No para nada si falla: lo apunta en el rastro y sigue,
/// porque sin la copia el enlace funciona igual, solo que una actualización lo cierra.
pub fn preparar() {
    if cfg!(debug_assertions) || !cfg!(windows) {
        return;
    }
    let Ok(exe) = std::env::current_exe() else { return };
    let copia = match crate::dir_datos().and_then(|d| copia_estable(&exe, &d.join("mcp"), env!("CARGO_PKG_VERSION"))) {
        Ok(c) => c,
        Err(e) => {
            crate::anotar(&format!("mcp: no se pudo dejar el enlace fuera de la instalación ({e})"));
            return;
        }
    };
    let a = copia.to_string_lossy().to_string();
    for (cliente, r) in apuntar_clientes(&exe, &a) {
        match r {
            Ok(true) => crate::anotar(&format!("mcp: {cliente} lanza ya el enlace desde {a}")),
            Ok(false) => {}
            Err(e) => crate::anotar(&format!("mcp: no se pudo repuntar el enlace de {cliente} ({e})")),
        }
    }
}

/// Copia `exe` a `dir\adeorq.exe` si la versión apuntada al lado no es `version`.
fn copia_estable(exe: &Path, dir: &Path, version: &str) -> Result<PathBuf, String> {
    let copia = dir.join("adeorq.exe");
    let marca = dir.join("version");
    let ya = copia.is_file() && std::fs::read_to_string(&marca).map(|v| v.trim() == version).unwrap_or(false);
    if !ya {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        if copia.exists() {
            let ahora = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);
            std::fs::rename(&copia, dir.join(format!("adeorq-{ahora}.viejo"))).map_err(|e| format!("apartar la copia vieja: {e}"))?;
        }
        let temporal = dir.join("adeorq.exe.tmp");
        std::fs::copy(exe, &temporal).map_err(|e| e.to_string())?;
        std::fs::rename(&temporal, &copia).map_err(|e| e.to_string())?;
        std::fs::write(&marca, version).map_err(|e| e.to_string())?;
    }
    // Las apartadas que ya no usa ningún enlace se dejan borrar; las otras, a la próxima.
    for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        if e.path().extension().is_some_and(|x| x == "viejo") {
            let _ = std::fs::remove_file(e.path());
        }
    }
    Ok(copia)
}

/// La misma ruta escrita de dos formas (mayúsculas, barras, comillas sobrantes).
fn misma_ruta(escrita: &str, ruta: &Path) -> bool {
    let norma = |s: &str| s.trim().trim_matches('"').replace('/', "\\").to_lowercase();
    norma(escrita) == norma(&ruta.to_string_lossy())
}

/// En un `.claude.json` o un `settings.json` de Gemini: la entrada `adeorq` de
/// `mcpServers`, en la raíz y en cada proyecto, si apunta a `de`. Dice si cambió algo.
fn apuntar_json(raiz: &mut Value, de: &Path, a: &str) -> bool {
    let mut cambio = false;
    let mut apuntar = |servidores: Option<&mut Value>| {
        if let Some(cmd) = servidores.and_then(|s| s.get_mut("adeorq")).and_then(|e| e.get_mut("command")) {
            if cmd.as_str().is_some_and(|c| misma_ruta(c, de)) {
                *cmd = Value::String(a.to_string());
                cambio = true;
            }
        }
    };
    apuntar(raiz.get_mut("mcpServers"));
    if let Some(proyectos) = raiz.get_mut("projects").and_then(Value::as_object_mut) {
        for p in proyectos.values_mut() {
            apuntar(p.get_mut("mcpServers"));
        }
    }
    cambio
}

/// En el `config.toml` de Codex: la línea `command` de `[mcp_servers.adeorq]`,
/// si apunta a `de`. Lo demás queda byte a byte como estaba. `None` si no hay nada que cambiar.
fn apuntar_toml(texto: &str, de: &Path, a: &str) -> Option<String> {
    let mut dentro = false;
    let mut cambio = false;
    let mut salida = String::with_capacity(texto.len() + 64);
    for linea in texto.split_inclusive('\n') {
        let limpia = linea.trim();
        if limpia.starts_with('[') {
            dentro = limpia == "[mcp_servers.adeorq]";
        } else if dentro && !cambio {
            if let Some(valor) = limpia.strip_prefix("command").map(str::trim_start).and_then(|r| r.strip_prefix('=')) {
                let valor = valor.trim();
                let ruta = if let Some(v) = valor.strip_prefix('\'').and_then(|v| v.split('\'').next()) {
                    Some(v.to_string())
                } else {
                    valor.strip_prefix('"').and_then(|v| v.split('"').next()).map(|v| v.replace("\\\\", "\\"))
                };
                if ruta.is_some_and(|r| misma_ruta(&r, de)) {
                    let sangria = &linea[..linea.len() - linea.trim_start().len()];
                    let fin = if linea.ends_with("\r\n") { "\r\n" } else if linea.ends_with('\n') { "\n" } else { "" };
                    let nuevo = if a.contains('\'') { format!("\"{}\"", a.replace('\\', "\\\\")) } else { format!("'{a}'") };
                    salida.push_str(&format!("{sangria}command = {nuevo}{fin}"));
                    cambio = true;
                    continue;
                }
            }
        }
        salida.push_str(linea);
    }
    cambio.then_some(salida)
}

/// Escribe al lado y renombra encima: nadie lee nunca un fichero a medias.
fn escribir_atomico(fichero: &Path, contenido: &[u8]) -> Result<(), String> {
    let temporal = fichero.with_extension("adeorq-tmp");
    std::fs::write(&temporal, contenido).map_err(|e| e.to_string())?;
    std::fs::rename(&temporal, fichero).map_err(|e| {
        let _ = std::fs::remove_file(&temporal);
        e.to_string()
    })
}

fn apuntar_fichero_json(fichero: &Path, de: &Path, a: &str) -> Result<bool, String> {
    if !fichero.is_file() {
        return Ok(false);
    }
    let crudo = std::fs::read_to_string(fichero).map_err(|e| e.to_string())?;
    // Uno que no se puede leer (con comentarios, a medio escribir) no se toca.
    let Ok(mut raiz) = serde_json::from_str::<Value>(&crudo) else { return Ok(false) };
    if !apuntar_json(&mut raiz, de, a) {
        return Ok(false);
    }
    escribir_atomico(fichero, &serde_json::to_vec_pretty(&raiz).map_err(|e| e.to_string())?)?;
    Ok(true)
}

/// Claude Code (la casa y cada cuenta de Adeorq), Codex y Gemini.
fn apuntar_clientes(de: &Path, a: &str) -> Vec<(String, Result<bool, String>)> {
    let mut hechos = Vec::new();
    let Some(casa) = crate::dir_casa() else { return hechos };
    let mut jsons = vec![("Claude Code".to_string(), casa.join(".claude.json")), ("Gemini".to_string(), casa.join(".gemini").join("settings.json"))];
    if let Ok(cuentas) = crate::dir_datos().map(|d| d.join("accounts")) {
        for e in std::fs::read_dir(cuentas).into_iter().flatten().flatten() {
            let nombre = e.file_name().to_string_lossy().to_string();
            if nombre.starts_with("claude-") {
                jsons.push((format!("Claude Code ({nombre})"), e.path().join(".claude.json")));
            }
        }
    }
    for (cliente, fichero) in jsons {
        hechos.push((cliente, apuntar_fichero_json(&fichero, de, a)));
    }
    let codex = std::env::var_os("CODEX_HOME").map(PathBuf::from).unwrap_or_else(|| casa.join(".codex")).join("config.toml");
    let r = (|| {
        let Ok(texto) = std::fs::read_to_string(&codex) else { return Ok(false) };
        match apuntar_toml(&texto, de, a) {
            Some(nuevo) => escribir_atomico(&codex, nuevo.as_bytes()).map(|_| true),
            None => Ok(false),
        }
    })();
    hechos.push(("Codex".to_string(), r));
    hechos
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const INSTALADA: &str = r"C:\Apps\Random APPS\Adeorq\adeorq.exe";
    const COPIA: &str = r"C:\Users\x\AppData\Local\Adeorq\mcp\adeorq.exe";

    #[test]
    fn claude_y_gemini_cambian_solo_la_entrada_de_adeorq_que_apunta_a_la_instalacion() {
        // La forma de su `.claude.json` y su `settings.json` de Gemini el 2026-10-15.
        let mut raiz = json!({
            "mcpServers": {
                "adeorq": { "type": "stdio", "command": "c:/apps/random apps/adeorq/ADEORQ.exe", "args": ["--mcp"], "env": {} },
                "otro": { "command": INSTALADA }
            },
            "projects": {
                "C:/x": { "mcpServers": { "adeorq": { "command": INSTALADA } } },
                "C:/y": { "mcpServers": { "adeorq": { "command": r"C:\ct\debug\adeorq.exe" } } }
            }
        });
        assert!(apuntar_json(&mut raiz, Path::new(INSTALADA), COPIA));
        assert_eq!(raiz["mcpServers"]["adeorq"]["command"], COPIA);
        assert_eq!(raiz["mcpServers"]["adeorq"]["args"], json!(["--mcp"]));
        assert_eq!(raiz["mcpServers"]["otro"]["command"], INSTALADA, "otro servidor no se toca");
        assert_eq!(raiz["projects"]["C:/x"]["mcpServers"]["adeorq"]["command"], COPIA);
        assert_eq!(raiz["projects"]["C:/y"]["mcpServers"]["adeorq"]["command"], r"C:\ct\debug\adeorq.exe", "una de desarrollo no se toca");
        assert!(!apuntar_json(&mut raiz, Path::new(INSTALADA), COPIA), "la segunda vez ya no hay nada que cambiar");
        assert!(!apuntar_json(&mut json!({}), Path::new(INSTALADA), COPIA));
    }

    #[test]
    fn codex_cambia_su_linea_y_lo_demas_queda_igual() {
        let texto = "model = 'gpt'\r\n\r\n[mcp_servers.adeorq]\r\ncommand = 'C:\\Apps\\Random APPS\\Adeorq\\adeorq.exe'\r\nargs = [\"--mcp\"]\r\n\r\n[mcp_servers.otro]\r\ncommand = 'C:\\Apps\\Random APPS\\Adeorq\\adeorq.exe'\r\n";
        let nuevo = apuntar_toml(texto, Path::new(INSTALADA), COPIA).expect("tenía que cambiar");
        assert_eq!(nuevo, texto.replacen(&format!("command = '{INSTALADA}'"), &format!("command = '{COPIA}'"), 1));
        assert!(nuevo.contains("[mcp_servers.otro]\r\ncommand = 'C:\\Apps\\Random APPS\\Adeorq\\adeorq.exe'"), "otro servidor no se toca");
        assert_eq!(apuntar_toml(&nuevo, Path::new(INSTALADA), COPIA), None);
        // Con comillas dobles y las barras escapadas, como lo escribe `codex mcp add`.
        let doble = "[mcp_servers.adeorq]\ncommand = \"C:\\\\Apps\\\\Random APPS\\\\Adeorq\\\\adeorq.exe\"\n";
        assert_eq!(apuntar_toml(doble, Path::new(INSTALADA), COPIA).unwrap(), format!("[mcp_servers.adeorq]\ncommand = '{COPIA}'\n"));
        assert_eq!(apuntar_toml("[otra]\ncommand = 'x'\n", Path::new(INSTALADA), COPIA), None);
    }

    #[test]
    fn la_copia_se_renueva_aunque_la_vieja_este_en_uso() {
        let dir = std::env::temp_dir().join(format!("adeorq-mcp-estable-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let origen = dir.join("origen.exe");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(&origen, b"version uno").unwrap();
        let destino = dir.join("mcp");
        let copia = copia_estable(&origen, &destino, "0.9.1").unwrap();
        assert_eq!(std::fs::read(&copia).unwrap(), b"version uno");
        // Cogida como la tiene un enlace vivo: se deja leer y renombrar, pero no
        // escribir encima (es lo que hace Windows con un ejecutable en marcha).
        #[cfg(windows)]
        let cogida = {
            use std::os::windows::fs::OpenOptionsExt;
            const FILE_SHARE_READ: u32 = 0x1;
            const FILE_SHARE_DELETE: u32 = 0x4;
            let f = std::fs::OpenOptions::new().read(true).share_mode(FILE_SHARE_READ | FILE_SHARE_DELETE).open(&copia).unwrap();
            assert!(std::fs::write(&copia, b"encima").is_err(), "con la copia cogida no se puede escribir encima");
            f
        };
        #[cfg(not(windows))]
        let cogida = std::fs::File::open(&copia).unwrap();
        std::fs::write(&origen, b"version dos").unwrap();
        let copia = copia_estable(&origen, &destino, "0.9.2").unwrap();
        assert_eq!(std::fs::read(&copia).unwrap(), b"version dos");
        assert_eq!(std::fs::read_to_string(destino.join("version")).unwrap(), "0.9.2");
        drop(cogida);
        // Con la misma versión no se copia otra vez, y la apartada ya se deja borrar.
        copia_estable(&origen, &destino, "0.9.2").unwrap();
        let viejas = std::fs::read_dir(&destino).unwrap().flatten().filter(|e| e.path().extension().is_some_and(|x| x == "viejo")).count();
        assert_eq!(viejas, 0);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
