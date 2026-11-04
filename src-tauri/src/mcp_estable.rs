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
//
// Aparte de la ruta, a Codex se le deja pasar su terminal al enlace: Codex no
// pasa su entorno a los servidores MCP si su `config.toml` no lo pide con
// `env_vars` (`codex_con_su_entorno`). Eso sí vale en todas las plataformas.

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

/// Lo que Codex tiene que pasarle al enlace para que el puerto sepa de qué
/// terminal viene: el número del panel y su contraseña (`mcp_clientes.rs`).
/// Codex no pasa su entorno a sus servidores MCP salvo lo que diga `env_vars`
/// (medido en S2 con la 0.165): sin esto, un Codex dentro de una terminal de
/// Adeorq llega como «Fuera de Adeorq» y nunca sube de su escalón de fábrica.
const DEL_PANEL: [&str; 2] = ["ADEORQ_PANE_ID", "ADEORQ_PANE_CLAVE"];

/// Una matriz de TOML leída a mano: dónde acaba, qué cadenas lleva en su
/// primer nivel y dónde termina lo último que tiene escrito (sin contar
/// espacios ni comentarios), para poder añadirle sin tocar nada de lo suyo.
struct Matriz {
    cadenas: Vec<String>,
    /// Posición justo detrás de lo último que hay escrito, y qué era.
    ultimo: (usize, char),
}

/// Lee la matriz que empieza en `texto[inicio]` (un `[`). `None` si no se cierra.
fn leer_matriz(texto: &str, inicio: usize) -> Option<Matriz> {
    let mut profundidad = 0usize;
    let mut cadenas = Vec::new();
    let mut ultimo = (inicio, '[');
    let mut it = texto[inicio..].char_indices();
    while let Some((i, c)) = it.next() {
        let pos = inicio + i;
        match c {
            '#' => {
                // Un comentario llega hasta el final de la línea.
                for (_, d) in it.by_ref() {
                    if d == '\n' {
                        break;
                    }
                }
            }
            '"' | '\'' => {
                let mut valor = String::new();
                let cierre = loop {
                    let (j, d) = it.next()?;
                    if d == c {
                        break inicio + j + 1;
                    }
                    if c == '"' && d == '\\' {
                        valor.push(it.next()?.1);
                    } else {
                        valor.push(d);
                    }
                };
                if profundidad == 1 {
                    cadenas.push(valor);
                }
                ultimo = (cierre, c);
            }
            '[' => {
                profundidad += 1;
                ultimo = (pos + 1, '[');
            }
            ']' => {
                profundidad = profundidad.checked_sub(1)?;
                if profundidad == 0 {
                    return Some(Matriz { cadenas, ultimo });
                }
                ultimo = (pos + 1, ']');
            }
            c if c.is_whitespace() => {}
            c => ultimo = (pos + c.len_utf8(), c),
        }
    }
    None
}

/// En el `config.toml` de Codex: que `[mcp_servers.adeorq]` lleve en `env_vars`
/// los nombres de `DEL_PANEL`. Sin la línea, la pone justo debajo de la cabecera;
/// con ella, añade solo los que falten, al final de lo que ya tenga. Lo demás
/// queda byte a byte como estaba. `None` si no hay nada que cambiar o si la
/// forma del fichero no es una que sepamos tocar sin riesgo (no hay tabla
/// `[mcp_servers.adeorq]`, o su `env_vars` no es una matriz).
fn con_entorno_del_panel(texto: &str) -> Option<String> {
    let mut dentro = false;
    let mut visto = false;
    let mut cabecera: Option<(usize, bool)> = None; // dónde acaba la línea y si lleva salto
    let mut desde = 0usize;
    for linea in texto.split_inclusive('\n') {
        let inicio = desde;
        desde += linea.len();
        let limpia = linea.trim();
        if limpia.starts_with('[') {
            let titulo = limpia.split('#').next().unwrap_or("").trim();
            dentro = titulo == "[mcp_servers.adeorq]";
            if dentro && !visto {
                visto = true;
                cabecera = Some((desde, linea.ends_with('\n')));
            }
        } else if dentro {
            // `env_vars_otra` no es esta clave: tras el nombre tiene que venir el `=`.
            if !limpia.strip_prefix("env_vars").is_some_and(|r| r.trim_start().starts_with('=')) {
                continue;
            }
            // La `[` de la matriz, en bytes del texto entero. Si el valor no es
            // una matriz (otra forma que no conocemos), no se toca.
            let igual = linea.find('=')? + 1;
            let valor = &linea[igual..];
            if !valor.trim_start().starts_with('[') {
                return None;
            }
            let abre = inicio + igual + (valor.len() - valor.trim_start().len());
            let matriz = leer_matriz(texto, abre)?;
            let faltan: Vec<String> = DEL_PANEL.iter().filter(|n| !matriz.cadenas.iter().any(|c| c == *n)).map(|n| format!("\"{n}\"")).collect();
            if faltan.is_empty() {
                return None;
            }
            let (donde, que) = matriz.ultimo;
            let cola = faltan.join(", ");
            let nuevo = match que {
                '[' => cola,
                ',' => format!(" {cola},"),
                _ => format!(", {cola}"),
            };
            return Some(format!("{}{nuevo}{}", &texto[..donde], &texto[donde..]));
        }
    }
    // Sin la línea: debajo de la cabecera, con el mismo salto que tenga ESA
    // línea (un fichero puede mezclar los dos).
    let (fin, con_salto) = cabecera?;
    let linea = format!("env_vars = [{}]", DEL_PANEL.iter().map(|n| format!("\"{n}\"")).collect::<Vec<_>>().join(", "));
    Some(if con_salto {
        let salto = if texto[..fin].ends_with("\r\n") { "\r\n" } else { "\n" };
        format!("{}{linea}{salto}{}", &texto[..fin], &texto[fin..])
    } else {
        // La cabecera era la última línea y no acababa en salto.
        let salto = if texto.contains("\r\n") { "\r\n" } else { "\n" };
        format!("{}{salto}{linea}", &texto[..fin])
    })
}

/// Los `config.toml` de Codex que lleva esta máquina: el de la casa (o el de
/// `CODEX_HOME`) y el de cada cuenta de Adeorq (`accounts\codex-*`).
fn configs_de_codex() -> Vec<PathBuf> {
    let mut rutas = Vec::new();
    if let Some(casa) = std::env::var_os("CODEX_HOME").map(PathBuf::from).or_else(|| crate::dir_casa().map(|c| c.join(".codex"))) {
        rutas.push(casa.join("config.toml"));
    }
    if let Ok(cuentas) = crate::dir_datos().map(|d| d.join("accounts")) {
        for e in std::fs::read_dir(cuentas).into_iter().flatten().flatten() {
            if e.file_name().to_string_lossy().starts_with("codex-") {
                rutas.push(e.path().join("config.toml"));
            }
        }
    }
    rutas
}

/// `con_entorno_del_panel`, comprobado con un lector de TOML de verdad: lo de
/// arriba cambia el texto por líneas para no tocarle ni un byte, y lee mal lo que
/// no parece lo de siempre. Codex no arranca con un `config.toml` que no pueda
/// cargar, así que solo se escribe si antes se podía leer, el servidor se lanza por
/// `command` (con `url`, Codex rechaza `env_vars`: medido con la 0.165) y lo único
/// que cambia al leerlo es su `env_vars`, con los dos nombres dentro.
fn con_entorno_comprobado(texto: &str) -> Option<String> {
    fn servidor(t: &mut toml::Table) -> Option<&mut toml::Table> {
        t.get_mut("mcp_servers")?.as_table_mut()?.get_mut("adeorq")?.as_table_mut()
    }
    let mut antes: toml::Table = toml::from_str(texto).ok()?;
    servidor(&mut antes)?.get("command")?;
    let nuevo = con_entorno_del_panel(texto)?;
    let mut despues: toml::Table = toml::from_str(&nuevo).ok()?;
    let escritos = servidor(&mut despues)?.remove("env_vars")?;
    let escritos = escritos.as_array()?;
    let nombra = |n: &str| escritos.iter().any(|v| v.as_str() == Some(n) || v.get("name").and_then(toml::Value::as_str) == Some(n));
    servidor(&mut antes)?.remove("env_vars");
    (DEL_PANEL.iter().all(|n| nombra(n)) && antes == despues).then_some(nuevo)
}

/// Solo un retoque a la vez: al arrancar van dos hilos a por el mismo `config.toml`
/// (`preparar` y `codex_con_su_entorno`), y sin esto lo que escribe uno se pierde
/// por lo que había leído el otro, y comparten el fichero temporal.
static UN_RETOQUE: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Lee, cambia y escribe un fichero de un cliente. `None` de `cambio`: no se toca.
fn retocar(fichero: &Path, cambio: impl Fn(&str) -> Option<String>) -> Result<bool, String> {
    let _turno = UN_RETOQUE.lock().unwrap_or_else(|e| e.into_inner());
    let Ok(texto) = std::fs::read_to_string(fichero) else { return Ok(false) };
    match cambio(&texto) {
        Some(nuevo) => escribir_atomico(fichero, nuevo.as_bytes()).map(|_| true),
        None => Ok(false),
    }
}

/// Deja a Codex pasarle su terminal al enlace del MCP. Al arrancar la app, en
/// todas las plataformas (la ruta del ejecutable es cosa de Windows, esto no).
/// Solo toca un `config.toml` que ya tenga `[mcp_servers.adeorq]`: no se la
/// pone a quien no la quiso. Lo apunta en el rastro si cambia algo.
pub fn codex_con_su_entorno() {
    for fichero in configs_de_codex() {
        let r = retocar(&fichero, con_entorno_comprobado);
        match r {
            Ok(true) => crate::anotar(&format!("mcp: Codex pasa ya su terminal al enlace ({})", fichero.display())),
            Ok(false) => {}
            Err(e) => crate::anotar(&format!("mcp: no se pudo dejar a Codex pasar su terminal al enlace ({}: {e})", fichero.display())),
        }
    }
}

/// Escribe al lado y renombra encima: nadie lee nunca un fichero a medias. Renombrar
/// no pregunta nada al fichero de destino, así que lo suyo se respeta a mano: un
/// enlace sigue siendo un enlace, uno de solo lectura no se reescribe, y el nuevo
/// lleva los permisos del viejo desde antes de tener dentro nada.
fn escribir_atomico(fichero: &Path, contenido: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let es_enlace = std::fs::symlink_metadata(fichero).is_ok_and(|m| m.file_type().is_symlink());
    let destino = if es_enlace { std::fs::canonicalize(fichero).map_err(|e| e.to_string())? } else { fichero.to_path_buf() };
    let permisos = std::fs::metadata(&destino).ok().map(|m| m.permissions());
    if permisos.as_ref().is_some_and(|p| p.readonly()) {
        return Err("es de solo lectura".into());
    }
    let temporal = destino.with_extension("adeorq-tmp");
    let escribir = || -> std::io::Result<()> {
        let mut f = std::fs::File::create(&temporal)?;
        if let Some(p) = permisos.clone() {
            std::fs::set_permissions(&temporal, p)?;
        }
        f.write_all(contenido)?;
        drop(f);
        std::fs::rename(&temporal, &destino)
    };
    escribir().map_err(|e| {
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
    hechos.push(("Codex".to_string(), retocar(&codex, |texto| apuntar_toml(texto, de, a))));
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

    const AMBAS: &str = r#""ADEORQ_PANE_ID", "ADEORQ_PANE_CLAVE""#;

    #[test]
    fn codex_sin_env_vars_recibe_la_linea_justo_debajo_de_la_cabecera() {
        // La forma real de `~/.codex/config.toml` de Munir el 2026-11-03, con
        // otro servidor que ya lleva su propio `env_vars` y no se toca.
        let texto = format!(
            "model = 'gpt'\n\n[mcp_servers.node_repl]\nargs = []\nenv_vars = [\"CODEX_WINDOWS_REGISTERED_CORE\"]\n\n[mcp_servers.adeorq]\ncommand = '{COPIA}'\nargs = [\"--mcp\"]\n\n[shell_environment_policy.set]\nX = \"1\"\n"
        );
        let nuevo = con_entorno_del_panel(&texto).expect("tenía que cambiar");
        assert_eq!(nuevo, texto.replacen("[mcp_servers.adeorq]\n", &format!("[mcp_servers.adeorq]\nenv_vars = [{AMBAS}]\n"), 1));
        assert!(nuevo.contains("env_vars = [\"CODEX_WINDOWS_REGISTERED_CORE\"]\n"), "el de otro servidor no se toca");
        assert_eq!(con_entorno_del_panel(&nuevo), None, "la segunda vez ya no hay nada que cambiar");
        // Con saltos de Windows, el fichero entero conserva los suyos.
        let crlf = texto.replace('\n', "\r\n");
        let nuevo = con_entorno_del_panel(&crlf).unwrap();
        assert_eq!(nuevo, crlf.replacen("[mcp_servers.adeorq]\r\n", &format!("[mcp_servers.adeorq]\r\nenv_vars = [{AMBAS}]\r\n"), 1));
        // La cabecera es lo último y no acaba en salto.
        assert_eq!(con_entorno_del_panel("[mcp_servers.adeorq]").unwrap(), format!("[mcp_servers.adeorq]\nenv_vars = [{AMBAS}]"));
        // Con la cabecera comentada al final.
        assert!(con_entorno_del_panel("[mcp_servers.adeorq] # el de Adeorq\ncommand = 'x'\n").unwrap().starts_with("[mcp_servers.adeorq] # el de Adeorq\nenv_vars = ["));
    }

    #[test]
    fn codex_con_algun_env_vars_suyo_solo_recibe_lo_que_falta() {
        let con = |dentro: &str| format!("[mcp_servers.adeorq]\ncommand = 'x'\nenv_vars = {dentro}\nargs = []\n");
        // Uno ya está, con las comillas de la otra clase: solo falta la contraseña.
        assert_eq!(
            con_entorno_del_panel(&con(r#"["MI_VAR", 'ADEORQ_PANE_ID']"#)).unwrap(),
            con(r#"["MI_VAR", 'ADEORQ_PANE_ID', "ADEORQ_PANE_CLAVE"]"#)
        );
        // Con otros suyos y ninguno de Adeorq: se añaden al final.
        assert_eq!(con_entorno_del_panel(&con(r#"["MI_VAR"]"#)).unwrap(), con(&format!(r#"["MI_VAR", {AMBAS}]"#)));
        // Vacía.
        assert_eq!(con_entorno_del_panel(&con("[]")).unwrap(), con(&format!("[{AMBAS}]")));
        // Los dos, y el que se parece pero no es: faltan los dos.
        assert_eq!(con_entorno_del_panel(&con(r#"["ADEORQ_PANE_ID_VIEJA"]"#)).unwrap(), con(&format!(r#"["ADEORQ_PANE_ID_VIEJA", {AMBAS}]"#)));
        assert_eq!(con_entorno_del_panel(&con(r#"['ADEORQ_PANE_CLAVE', "ADEORQ_PANE_ID"]"#)), None);
        // En varias líneas, con coma al final y comentarios: queda como está y se añade al final.
        let larga = "[mcp_servers.adeorq]\nenv_vars = [\n  \"MI_VAR\", # la mía\n]\ncommand = 'x'\n";
        let nuevo = con_entorno_del_panel(larga).unwrap();
        assert_eq!(nuevo, format!("[mcp_servers.adeorq]\nenv_vars = [\n  \"MI_VAR\", {AMBAS}, # la mía\n]\ncommand = 'x'\n"));
        // Sin coma al final: se la pone delante de lo nuevo.
        let sin = "[mcp_servers.adeorq]\nenv_vars = [\n  \"MI_VAR\"\n]\n";
        assert_eq!(con_entorno_del_panel(sin).unwrap(), format!("[mcp_servers.adeorq]\nenv_vars = [\n  \"MI_VAR\", {AMBAS}\n]\n"));
        // Una cadena con corchetes y almohadillas dentro no confunde.
        let rara = "[mcp_servers.adeorq]\nenv_vars = [\"A]#B\", 'C[']\n";
        assert_eq!(con_entorno_del_panel(rara).unwrap(), format!("[mcp_servers.adeorq]\nenv_vars = [\"A]#B\", 'C[', {AMBAS}]\n"));
    }

    #[test]
    fn codex_lo_que_no_sabe_tocar_se_queda_como_esta() {
        // Sin servidor de Adeorq (el de la cuenta `codex-3ra-codex`): no se le pone.
        assert_eq!(con_entorno_del_panel("model = 'x'\n[projects.'c:\\x']\ntrust_level = \"trusted\"\n"), None);
        assert_eq!(con_entorno_del_panel("[mcp_servers.otro]\nenv_vars = []\n"), None);
        // Su subtabla no es la tabla: el `env_vars` de otra no cuenta.
        assert_eq!(
            con_entorno_del_panel("[mcp_servers.adeorq.env]\nenv_vars = [\"A\"]\n[mcp_servers.otro]\nenv_vars = []\n"),
            None
        );
        // Un `env_vars` que no es una matriz, o una matriz que no se cierra: no se inventa nada.
        assert_eq!(con_entorno_del_panel("[mcp_servers.adeorq]\nenv_vars = \"A\"\n"), None);
        assert_eq!(con_entorno_del_panel("[mcp_servers.adeorq]\nenv_vars = [\"A\"\n"), None);
        // Y otra clave que empieza igual no es la suya.
        let con_otra = con_entorno_del_panel("[mcp_servers.adeorq]\nenv_vars_viejas = [\"A\"]\n").unwrap();
        assert!(con_otra.contains(&format!("env_vars = [{AMBAS}]")) && con_otra.contains("env_vars_viejas = [\"A\"]"));
    }

    /// Lo que se escribiría y Codex no podría cargar: con cualquiera de estos, Codex
    /// 0.165 no arranca ni para `codex mcp list` (medido, «failed to load bootstrap
    /// configuration»). Se queda el fichero como está.
    #[test]
    fn codex_lo_que_le_impediria_arrancar_no_se_escribe() {
        // Un servidor por URL: «env_vars is not supported for streamable_http».
        assert_eq!(con_entorno_comprobado("[mcp_servers.adeorq]\nurl = \"http://127.0.0.1:3012/mcp\"\n"), None);
        // La clave entre comillas: el lector de líneas no la ve y la pondría dos veces.
        assert_eq!(con_entorno_comprobado("[mcp_servers.adeorq]\ncommand = \"x\"\n\"env_vars\" = [\"A\"]\n"), None);
        // Una matriz con una fila que empieza por `[` parece otra tabla.
        assert_eq!(con_entorno_comprobado("[mcp_servers.adeorq]\ncommand = \"x\"\nraro = [\n  [\"a\"],\n]\nenv_vars = [\"A\"]\n"), None);
        // Un texto largo con la cabecera dentro: se escribiría dentro del texto.
        assert_eq!(con_entorno_comprobado("nota = \"\"\"\n[mcp_servers.adeorq]\n\"\"\"\n[mcp_servers.adeorq]\ncommand = \"x\"\n"), None);
        // Un fichero que ya no se puede leer no se toca.
        assert_eq!(con_entorno_comprobado("[mcp_servers.adeorq]\ncommand = \n"), None);
        // Y la forma de siempre sí, con los dos nombres y lo demás igual.
        let nuevo = con_entorno_comprobado("a = 1\n[mcp_servers.adeorq]\ncommand = \"x\"\nargs = [\"--mcp\"]\n").expect("la forma de siempre");
        assert_eq!(nuevo, format!("a = 1\n[mcp_servers.adeorq]\nenv_vars = [{AMBAS}]\ncommand = \"x\"\nargs = [\"--mcp\"]\n"));
    }

    /// Una carpeta de pruebas con un fichero dentro.
    fn con_un_fichero(nombre: &str, contenido: &str) -> (PathBuf, PathBuf) {
        let dir = std::env::temp_dir().join(format!("adeorq-mcp-estable-{nombre}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("config.toml");
        std::fs::write(&f, contenido).unwrap();
        (dir, f)
    }

    /// Solo lectura es una decisión de quien lo puso así: renombrar encima se la
    /// saltaría en Linux y en Mac, donde basta con poder escribir en la carpeta.
    #[test]
    fn un_fichero_de_solo_lectura_no_se_reescribe() {
        let (dir, f) = con_un_fichero("solo-lectura", "antes\n");
        let mut p = std::fs::metadata(&f).unwrap().permissions();
        p.set_readonly(true);
        std::fs::set_permissions(&f, p.clone()).unwrap();
        assert!(escribir_atomico(&f, b"despues\n").is_err());
        assert_eq!(std::fs::read_to_string(&f).unwrap(), "antes\n");
        #[allow(clippy::permissions_set_readonly_false)]
        p.set_readonly(false);
        std::fs::set_permissions(&f, p).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// Sus permisos se quedan: un `config.toml` en 600 puede llevar una clave y no
    /// puede salir de aquí en 644.
    #[cfg(unix)]
    #[test]
    fn reescribir_conserva_los_permisos() {
        use std::os::unix::fs::PermissionsExt;
        let (dir, f) = con_un_fichero("permisos", "antes\n");
        std::fs::set_permissions(&f, std::fs::Permissions::from_mode(0o600)).unwrap();
        escribir_atomico(&f, b"despues\n").unwrap();
        assert_eq!(std::fs::read_to_string(&f).unwrap(), "despues\n");
        assert_eq!(std::fs::metadata(&f).unwrap().permissions().mode() & 0o777, 0o600);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// Un enlace (los dotfiles de mucha gente) se queda enlace, y lo que cambia es
    /// su destino. Renombrar encima lo cambiaba por un fichero suelto.
    #[test]
    fn reescribir_un_enlace_cambia_su_destino_y_lo_deja_enlace() {
        let (dir, destino) = con_un_fichero("enlace", "antes\n");
        let enlace = dir.join("enlace.toml");
        #[cfg(unix)]
        let hecho = std::os::unix::fs::symlink(&destino, &enlace);
        #[cfg(windows)]
        let hecho = std::os::windows::fs::symlink_file(&destino, &enlace);
        if let Err(e) = hecho {
            // En Windows, crear enlaces pide el modo de desarrollador.
            eprintln!("ENLACE NO DISPONIBLE: la prueba se salta ({e})");
            std::fs::remove_dir_all(&dir).unwrap();
            return;
        }
        escribir_atomico(&enlace, b"despues\n").unwrap();
        assert!(std::fs::symlink_metadata(&enlace).unwrap().file_type().is_symlink(), "dejó de ser un enlace");
        assert_eq!(std::fs::read_to_string(&destino).unwrap(), "despues\n");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// Al arrancar, `preparar` y `codex_con_su_entorno` retocan el mismo `config.toml`
    /// en dos hilos a la vez. Lo que hace uno no puede perderse por lo que hace el otro.
    #[test]
    fn dos_retoques_a_la_vez_no_se_pisan() {
        let (dir, f) = con_un_fichero("a-la-vez", "");
        let hilos: Vec<_> = (0..4)
            .map(|h| {
                let f = f.clone();
                std::thread::spawn(move || {
                    for i in 0..25 {
                        retocar(&f, |t| Some(format!("{t}{h}-{i}\n"))).unwrap();
                    }
                })
            })
            .collect();
        for h in hilos {
            h.join().unwrap();
        }
        let final_ = std::fs::read_to_string(&f).unwrap();
        for h in 0..4 {
            for i in 0..25 {
                assert!(final_.lines().any(|l| l == format!("{h}-{i}")), "se perdió {h}-{i}");
            }
        }
        std::fs::remove_dir_all(&dir).unwrap();
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
