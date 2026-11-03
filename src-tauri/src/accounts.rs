// META 6, step 1: several Claude Code accounts in one panel.
//
// The whole trick is CLAUDE_CONFIG_DIR (verified 2026-07-25): point the CLI at
// another folder and it keeps its own login, its own projects and its own
// stats there. So an account IS a folder, and a terminal belongs to an account
// because its PTY was born with that variable set.
//
// The main account is `~/.claude` and Adeorq never touches it: extra accounts
// live under %LOCALAPPDATA%\Adeorq\accounts\<slug>, which is also the only
// place `forget_account` is allowed to delete.
use std::path::{Path, PathBuf};

fn accounts_root() -> Result<PathBuf, String> {
    Ok(crate::dir_datos()?.join("accounts"))
}

/// Folder names come from a label Munir types, so keep them boring.
fn slugify(label: &str) -> String {
    let mut out = String::new();
    for ch in label.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if (ch == ' ' || ch == '-' || ch == '_') && !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches('-').to_owned();
    if trimmed.is_empty() {
        "cuenta".to_owned()
    } else {
        trimmed.chars().take(40).collect()
    }
}

/// Creates (or reuses) the config folder for an account and returns its path.
/// Nothing is written inside: the CLI fills it in on its first login.
#[tauri::command(async)]
pub fn account_dir(label: String) -> Result<String, String> {
    let root = accounts_root()?;
    let mut dir = root.join(slugify(&label));
    // Two accounts labelled the same still get folders of their own.
    let mut n = 2;
    while dir.exists()
        && std::fs::read_dir(&dir)
            .map(|d| d.count() > 0)
            .unwrap_or(false)
    {
        dir = root.join(format!("{}-{n}", slugify(&label)));
        n += 1;
        if n > 50 {
            return Err("demasiadas cuentas con ese nombre".into());
        }
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

/// True once that account has actually logged in. Which file proves it depends
/// on the CLI (Claude writes .credentials.json, Codex auth.json, Gemini
/// oauth_creds.json), so the caller passes the list from the provider table.
///
/// An empty config_dir means that CLI's own default account, which lives at
/// `%USERPROFILE%\<home_dir>`: the renderer cannot expand that, so it arrives
/// as the relative path and is resolved here.
///
/// `env_es_casa` viene de la tabla de proveedores (`envEsCasa`): ver
/// `carpeta_de`, que es donde cambia a qué carpeta se mira.
#[tauri::command(async)]
pub fn account_ready(
    config_dir: String,
    files: Vec<String>,
    home_dir: Option<String>,
    env_es_casa: Option<bool>,
) -> bool {
    let Some(dir) = carpeta_de(&config_dir, home_dir.as_deref(), env_es_casa.unwrap_or(false)) else {
        return false;
    };
    files.iter().any(|f| dir.join(f).is_file())
}

/// La carpeta donde el CLI deja el login de una cuenta, venga con ruta propia
/// o sea la de siempre del CLI.
///
/// Sale de `account_ready`, que hacía esta misma cuenta a mano: el renderer no
/// puede expandir `~`, así que la carpeta de fábrica llega como ruta relativa
/// (`.claude`, `.pi/agent`) y se resuelve aquí.
///
/// Con `env_es_casa`, la variable del CLI no es su carpeta sino la CASA donde la
/// busca, y debajo cuelga la misma ruta relativa que en la principal. Gemini CLI
/// es así: `Storage.getGlobalGeminiDir` hace `join(homedir(), ".gemini")` y su
/// `homedir()` devuelve `GEMINI_CLI_HOME` si está puesta
/// (`packages/core/src/config/storage.ts` y `utils/paths.ts`), así que el login
/// de una segunda cuenta queda en `<carpeta de la cuenta>/.gemini`, igual que el
/// de la principal en `~/.gemini`.
fn carpeta_de(config_dir: &str, home_dir: Option<&str>, env_es_casa: bool) -> Option<PathBuf> {
    carpeta_en(config_dir, home_dir, env_es_casa, crate::dir_casa())
}

/// `carpeta_de` con la carpeta del usuario por parámetro, para que los tests la
/// prueben con una casa falsa en vez de con la de verdad.
fn carpeta_en(
    config_dir: &str,
    home_dir: Option<&str>,
    env_es_casa: bool,
    casa: Option<PathBuf>,
) -> Option<PathBuf> {
    let propia = !config_dir.trim().is_empty();
    if propia && !env_es_casa {
        return Some(PathBuf::from(config_dir));
    }
    // Sin la ruta que cuelga de la casa no hay carpeta que adivinar.
    let rel = home_dir.filter(|h| !h.trim().is_empty())?;
    let base = if propia { PathBuf::from(config_dir) } else { casa? };
    // Los proveedores escriben `a/b` o `a\b`; se parte por las dos.
    Some(rel.split(['/', '\\']).fold(base, |acc, p| acc.join(p)))
}

/**
 * Cerrar sesión: borra SOLO los archivos de credenciales de esa cuenta.
 *
 * No es lo mismo que `forget_account`, que se lleva la carpeta entera. Aquí la
 * cuenta sigue existiendo con sus proyectos, su historial y sus ajustes: lo
 * único que se va es la prueba de que estabas dentro, así que el CLI vuelve a
 * pedir login la próxima vez y todo lo demás sigue donde estaba. Esa distinción
 * es la razón de que sean dos comandos y no uno con una bandera.
 *
 * Qué archivo es la credencial depende del CLI (Claude escribe
 * `.credentials.json`, Codex y Pi `auth.json`, Gemini `oauth_creds.json`), así
 * que la lista viene de la tabla de proveedores, igual que en `account_ready`.
 *
 * Dos cierres a lo que se puede tocar, porque esto BORRA:
 *
 * · el nombre del archivo tiene que ser un nombre, no una ruta: nada de barras
 *   ni de `..`, o una entrada de la tabla mal escrita (o cambiada) podría salir
 *   de la carpeta;
 * · la carpeta tiene que ser una cuenta de Adeorq o la de fábrica de un CLI,
 *   que son las dos únicas cosas que este panel gestiona.
 *
 * Devuelve los archivos que ha borrado de verdad. Vacío significa que ya no
 * había sesión, que no es un error: es la respuesta.
 */
#[tauri::command]
pub async fn logout_account(
    config_dir: String,
    files: Vec<String>,
    home_dir: Option<String>,
    env_es_casa: Option<bool>,
) -> Result<Vec<String>, String> {
    let dir = carpeta_de(&config_dir, home_dir.as_deref(), env_es_casa.unwrap_or(false))
        .ok_or("no sé cuál es la carpeta de esa cuenta")?;

    // La carpeta: o una cuenta de Adeorq, o la de fábrica del CLI dentro de la
    // carpeta del usuario. Cualquier otra cosa es un error de quien llama.
    let real = dir.canonicalize().map_err(|e| e.to_string())?;
    let bajo = |base: Option<PathBuf>| {
        base.and_then(|b| b.canonicalize().ok())
            .map(|b| real.starts_with(&b) && real != b)
            .unwrap_or(false)
    };
    if !bajo(accounts_root().ok()) && !bajo(crate::dir_casa().map(PathBuf::from)) {
        return Err("esa carpeta no es una cuenta que Adeorq gestione".into());
    }

    let mut fuera = Vec::new();
    for f in files {
        if f.contains(['/', '\\']) || f.contains("..") || f.trim().is_empty() {
            return Err(format!("nombre de credencial inválido: {f}"));
        }
        let p = real.join(&f);
        if p.is_file() {
            std::fs::remove_file(&p).map_err(|e| format!("{f}: {e}"))?;
            fuera.push(f);
        }
    }
    Ok(fuera)
}

#[derive(serde::Serialize)]
pub struct CliFound {
    pub id: String,
    pub path: String,
}

/**
 * The effort level Claude Code is set to, read from the settings.json of that
 * account (or of the main one). Adeorq used to learn this by reading the
 * footer off the screen, which works while the CLI is printing it and fails
 * the moment a resumed session does not repaint it: the pane then said nothing
 * and Munir read that as "the effort changed on its own". Now the pane is
 * launched with --effort, so the answer is known before the first line.
 */
#[tauri::command(async)]
pub fn cli_effort(config_dir: Option<String>) -> Option<String> {
    let base = match config_dir.as_deref().filter(|d| !d.is_empty()) {
        Some(dir) => PathBuf::from(dir),
        None => crate::dir_casa()?.join(".claude"),
    };
    let text = std::fs::read_to_string(base.join("settings.json")).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    let level = value.get("effortLevel")?.as_str()?.to_lowercase();
    // Only what the CLI's own --help lists, so a typo in his settings cannot
    // turn into an invalid flag that stops the session from starting.
    ["low", "medium", "high", "xhigh", "max"]
        .contains(&level.as_str())
        .then_some(level)
}

/// Which of these CLIs are actually installed. Walks PATH by hand instead of
/// shelling out to `where`: no process per lookup, no console flash, and it
/// answers in microseconds while the accounts screen paints.
#[tauri::command(async)]
pub fn detect_clis(exes: Vec<(String, String)>) -> Vec<CliFound> {
    let path = std::env::var("PATH").unwrap_or_default();
    // El separador del PATH no es el mismo en los dos sitios: `;` en Windows,
    // `:` en todo lo demás. Con el de Windows, en Linux el PATH entero sería UNA
    // carpeta con dos puntos dentro y no se encontraría ni un CLI.
    let sep = if cfg!(windows) { ';' } else { ':' };
    let dirs: Vec<&str> = path.split(sep).filter(|d| !d.is_empty()).collect();
    let mut out = Vec::new();
    for (id, exe) in exes {
        let found = dirs.iter().find_map(|dir| {
            // En Linux un ejecutable no lleva extensión; probar las de
            // Windows ahí es gastar cuatro `stat` por carpeta para nada.
            let exts: &[&str] = if cfg!(windows) {
                &["exe", "cmd", "bat", "ps1", ""]
            } else {
                &[""]
            };
            for ext in exts {
                let name = if ext.is_empty() {
                    exe.clone()
                } else {
                    format!("{exe}.{ext}")
                };
                let candidate = Path::new(dir).join(&name);
                if candidate.is_file() {
                    return Some(candidate.to_string_lossy().into_owned());
                }
            }
            None
        });
        // Claude installs itself outside PATH for the shell Adeorq spawns.
        // El `.exe` es de Windows: en Linux y en un Mac el ejecutable se llama
        // como el programa, y con `.exe` esta búsqueda no encontraba nada.
        let found = found.or_else(|| {
            let home = crate::dir_casa()?;
            let nombre = if cfg!(windows) { format!("{exe}.exe") } else { exe.clone() };
            let p = home
                .join(".local")
                .join("bin")
                .join(nombre);
            p.is_file().then(|| p.to_string_lossy().into_owned())
        });
        if let Some(path) = found {
            out.push(CliFound { id, path });
        }
    }
    out
}

/// Config folders that exist on disk, so an account cannot go missing just
/// because the UI state was lost.
#[tauri::command(async)]
pub fn list_account_dirs() -> Vec<String> {
    let Ok(root) = accounts_root() else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(root) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.path().to_string_lossy().into_owned())
        .collect()
}

/// Deletes an account's folder, which signs it out and drops its history.
/// Refuses anything that is not one of ours: this removes a directory tree,
/// and the string comes from the UI. `~/.claude` can never be reached here.
#[tauri::command(async)]
pub fn forget_account(config_dir: String) -> Result<(), String> {
    let root = accounts_root()?;
    let target = PathBuf::from(&config_dir);
    let (root, target) = (
        root.canonicalize().map_err(|e| e.to_string())?,
        target.canonicalize().map_err(|e| e.to_string())?,
    );
    if !target.starts_with(&root) || target == root {
        return Err("esa carpeta no es una cuenta de Adeorq".into());
    }
    std::fs::remove_dir_all(&target).map_err(|e| e.to_string())
}

/// Dónde apunta Adeorq lo que copió a una cuenta, para poder quitarlo cuando ya
/// no esté en la principal sin tocar lo que esa cuenta tenga de suyo.
const BARRERAS_COPIADAS: &str = "barreras-adeorq.json";

/// Las barreras de la cuenta principal, también en la cuenta con la que nace una
/// terminal.
///
/// Una cuenta es una carpeta, y sus ajustes son solo suyos. Desde que las
/// delegadas eligen cuenta solas (2026-11-02), un agente en modo auto nacía en
/// otra sin los hooks ni las reglas `deny` de la principal, sin que nadie lo
/// hubiera decidido (revisión de la 0.9.239: la «2da MAIN» no tenía ni el
/// guardián). Se copia solo lo que protege: `hooks`, `permissions.deny`,
/// `permissions.ask` y `attribution`. Ni el modelo, ni el tema, ni los plugins,
/// ni `permissions.allow`, que no protege y en otra cuenta no tiene por qué valer.
///
/// `Ok(true)` si escribió algo. Lo llama `pty_spawn`, que es por donde nacen todas
/// (la barra, un agente, el Capataz, el lienzo, Reanimar y al reiniciar).
pub fn sembrar_barreras(dir: &Path) -> Result<bool, String> {
    let principal = crate::dir_casa().ok_or("no sé cuál es la carpeta del usuario")?.join(".claude");
    sembrar_desde(&principal, dir)
}

fn sembrar_desde(principal: &Path, dir: &Path) -> Result<bool, String> {
    if !dir.is_dir() {
        return Ok(false);
    }
    // Una cuenta que apunta a la propia principal ya tiene sus barreras.
    if let (Ok(a), Ok(b)) = (principal.canonicalize(), dir.canonicalize()) {
        if a == b {
            return Ok(false);
        }
    }
    let ajustes = dir.join("settings.json");
    let copiadas = dir.join(BARRERAS_COPIADAS);
    let ahora = barreras_de(&leer_json(&principal.join("settings.json"))?);
    let suya = leer_json(&ajustes)?;
    // Sin archivo o ilegible, no se sabe qué se copió: nada que quitar.
    let antes = barreras_de_copia(&leer_json(&copiadas).unwrap_or_default());
    let (nueva, copiado) = con_barreras(suya.clone(), &ahora, &antes)?;

    let cambia = nueva != suya;
    if cambia {
        let texto = serde_json::to_string_pretty(&nueva).map_err(|e| e.to_string())?;
        crate::escribir_entero(&ajustes, format!("{texto}\n").as_bytes())?;
    }
    if copiado != antes {
        let texto = serde_json::to_string_pretty(&copiado).map_err(|e| e.to_string())?;
        crate::escribir_entero(&copiadas, format!("{texto}\n").as_bytes())?;
    }
    Ok(cambia)
}

/// Un JSON de ajustes. Que no exista es estar vacío; que no se entienda es un
/// error: un archivo que no se ha podido leer no se reescribe (se perdería).
fn leer_json(ruta: &Path) -> Result<serde_json::Value, String> {
    match std::fs::read_to_string(ruta) {
        Ok(t) => serde_json::from_str(t.trim_start_matches('\u{feff}'))
            .map_err(|e| format!("{} no se pudo leer, así que no lo toco: {e}", ruta.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(serde_json::json!({})),
        Err(e) => Err(format!("{}: {e}", ruta.display())),
    }
}

/// Lo que protege de unos ajustes, con todas sus piezas aunque estén vacías.
fn barreras_de(ajustes: &serde_json::Value) -> serde_json::Value {
    let pieza = |ruta: &str, vacia: serde_json::Value| ajustes.pointer(ruta).cloned().unwrap_or(vacia);
    serde_json::json!({
        "hooks": pieza("/hooks", serde_json::json!({})),
        "deny": pieza("/permissions/deny", serde_json::json!([])),
        "ask": pieza("/permissions/ask", serde_json::json!([])),
        "attribution": pieza("/attribution", serde_json::Value::Null),
    })
}

/// La copia guardada, con todas sus piezas aunque falte alguna o sea de otra versión.
fn barreras_de_copia(copia: &serde_json::Value) -> serde_json::Value {
    let pieza = |clave: &str, vacia: serde_json::Value| copia.get(clave).cloned().unwrap_or(vacia);
    serde_json::json!({
        "hooks": pieza("hooks", serde_json::json!({})),
        "deny": pieza("deny", serde_json::json!([])),
        "ask": pieza("ask", serde_json::json!([])),
        "attribution": pieza("attribution", serde_json::Value::Null),
    })
}

/// Quita de una lista lo que puso Adeorq la última vez y pone lo de ahora, sin
/// repetir. Lo que no vino de Adeorq no se toca. Devuelve lo que ha puesto: lo que
/// la cuenta ya tenía por su cuenta no se apunta como copiado, y así sigue siendo
/// suyo el día que la principal lo quite (revisión de la 0.9.239).
fn renovar(
    lista: &mut Vec<serde_json::Value>,
    antes: &serde_json::Value,
    ahora: &serde_json::Value,
) -> Vec<serde_json::Value> {
    let vacio = Vec::new();
    let antes = antes.as_array().unwrap_or(&vacio);
    lista.retain(|x| !antes.contains(x));
    let mut puesto = Vec::new();
    for x in ahora.as_array().unwrap_or(&vacio) {
        if !lista.contains(x) {
            lista.push(x.clone());
            puesto.push(x.clone());
        }
    }
    puesto
}

/// Los ajustes de una cuenta con las barreras de ahora puestas, y lo que hay que
/// apuntar como copiado. Sin escribir nada.
fn con_barreras(
    mut suya: serde_json::Value,
    ahora: &serde_json::Value,
    antes: &serde_json::Value,
) -> Result<(serde_json::Value, serde_json::Value), String> {
    let raiz = suya.as_object_mut().ok_or("los ajustes de esa cuenta no son un objeto, así que no los toco")?;
    // Lo que no tiene la forma que se espera tampoco se pisa.
    for clave in ["hooks", "permissions"] {
        if raiz.get(clave).is_some_and(|v| !v.is_object()) {
            return Err(format!("«{clave}» en los ajustes de esa cuenta no es un objeto, así que no los toco"));
        }
    }
    let mut copiado = barreras_de_copia(&serde_json::Value::Null);

    // Los hooks, evento a evento: cada uno es una lista de grupos.
    let mut hooks = raiz.get("hooks").and_then(|h| h.as_object()).cloned().unwrap_or_default();
    let mut eventos: Vec<String> = Vec::new();
    for lado in [antes, ahora] {
        if let Some(h) = lado["hooks"].as_object() {
            eventos.extend(h.keys().cloned());
        }
    }
    eventos.sort();
    eventos.dedup();
    for evento in eventos {
        let mut lista = hooks.get(&evento).and_then(|l| l.as_array()).cloned().unwrap_or_default();
        let puesto = renovar(&mut lista, &antes["hooks"][&evento], &ahora["hooks"][&evento]);
        if !puesto.is_empty() {
            copiado["hooks"][&evento] = puesto.into();
        }
        if lista.is_empty() {
            hooks.remove(&evento);
        } else {
            hooks.insert(evento, lista.into());
        }
    }
    if hooks.is_empty() {
        raiz.remove("hooks");
    } else {
        raiz.insert("hooks".into(), hooks.into());
    }

    // Las reglas que niegan o preguntan. `allow` y el modo son de cada cuenta.
    let mut permisos = raiz.get("permissions").and_then(|p| p.as_object()).cloned().unwrap_or_default();
    for clave in ["deny", "ask"] {
        let mut lista = permisos.get(clave).and_then(|l| l.as_array()).cloned().unwrap_or_default();
        copiado[clave] = renovar(&mut lista, &antes[clave], &ahora[clave]).into();
        if lista.is_empty() {
            permisos.remove(clave);
        } else {
            permisos.insert(clave.into(), lista.into());
        }
    }
    if permisos.is_empty() {
        raiz.remove("permissions");
    } else {
        raiz.insert("permissions".into(), permisos.into());
    }

    // La firma de los commits: la de la principal, salvo que esa cuenta tenga otra suya.
    let actual = raiz.get("attribution").cloned().unwrap_or(serde_json::Value::Null);
    if actual.is_null() || actual == antes["attribution"] {
        if ahora["attribution"].is_null() {
            raiz.remove("attribution");
        } else {
            raiz.insert("attribution".into(), ahora["attribution"].clone());
            copiado["attribution"] = ahora["attribution"].clone();
        }
    }
    Ok((suya, copiado))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn principal_de_prueba() -> serde_json::Value {
        serde_json::json!({
            "model": "opus",
            "theme": "dark",
            "enabledPlugins": { "algo@sitio": true },
            "hooks": { "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "guardian" }] }] },
            "permissions": { "allow": ["Bash(ls)"], "deny": ["Bash(rm -rf *)"], "defaultMode": "auto" },
            "attribution": { "commit": "" },
        })
    }

    #[test]
    fn las_barreras_llegan_y_solo_ellas() {
        let suya = serde_json::json!({ "model": "sonnet", "autoMode": { "x": 1 } });
        let (n, _) = con_barreras(suya, &barreras_de(&principal_de_prueba()), &barreras_de(&serde_json::json!({}))).unwrap();
        assert_eq!(n["hooks"]["PreToolUse"][0]["hooks"][0]["command"], "guardian");
        assert_eq!(n["permissions"]["deny"][0], "Bash(rm -rf *)");
        assert_eq!(n["attribution"]["commit"], "");
        // Lo suyo se queda, y lo demás de la principal no viaja.
        assert_eq!(n["model"], "sonnet");
        assert_eq!(n["autoMode"]["x"], 1);
        assert!(n.get("theme").is_none() && n.get("enabledPlugins").is_none());
        assert!(n["permissions"].get("allow").is_none() && n["permissions"].get("defaultMode").is_none());
    }

    #[test]
    fn lo_que_la_cuenta_tiene_de_suyo_se_queda() {
        let mio = serde_json::json!({ "matcher": "Write", "hooks": [{ "type": "command", "command": "mio" }] });
        let suya = serde_json::json!({
            "hooks": { "PreToolUse": [mio.clone()] },
            "permissions": { "allow": ["Bash(git *)"], "deny": ["Bash(mio)"] },
            "attribution": { "commit": "la mia" },
        });
        let (n, _) = con_barreras(suya, &barreras_de(&principal_de_prueba()), &barreras_de(&serde_json::json!({}))).unwrap();
        let grupos = n["hooks"]["PreToolUse"].as_array().unwrap();
        assert_eq!(grupos.len(), 2, "el suyo y el de la principal");
        assert!(grupos.contains(&mio));
        assert_eq!(n["permissions"]["deny"].as_array().unwrap().len(), 2);
        assert_eq!(n["permissions"]["allow"][0], "Bash(git *)");
        assert_eq!(n["attribution"]["commit"], "la mia");
    }

    #[test]
    fn lo_que_ya_no_esta_en_la_principal_se_quita_y_no_se_repite() {
        let ahora = barreras_de(&principal_de_prueba());
        let vacio = barreras_de(&serde_json::json!({}));
        let (primera, copiado) = con_barreras(serde_json::json!({ "model": "sonnet" }), &ahora, &vacio).unwrap();
        // Otra vez lo mismo: no cambia nada.
        let (segunda, copia2) = con_barreras(primera.clone(), &ahora, &copiado).unwrap();
        assert_eq!(segunda, primera);
        assert_eq!(copia2, copiado);
        // La principal se queda sin barreras: la cuenta vuelve a como estaba.
        let (tercera, copia3) = con_barreras(primera, &vacio, &copiado).unwrap();
        assert_eq!(tercera, serde_json::json!({ "model": "sonnet" }));
        assert_eq!(copia3, vacio);
    }

    /// Quien copió sus ajustes a mano tiene ya las mismas reglas: son suyas. El
    /// caso de la revisión: se apuntaban como copiadas, y el día que la principal
    /// las quitaba, se las quitaba también a la cuenta.
    #[test]
    fn lo_que_ya_era_de_la_cuenta_sigue_siendo_suyo() {
        let ahora = barreras_de(&principal_de_prueba());
        let suya = serde_json::json!({
            "hooks": principal_de_prueba()["hooks"].clone(),
            "permissions": { "deny": principal_de_prueba()["permissions"]["deny"].clone() },
            "attribution": principal_de_prueba()["attribution"].clone(),
        });
        let vacio = barreras_de(&serde_json::json!({}));
        let (primera, copiado) = con_barreras(suya.clone(), &ahora, &vacio).unwrap();
        assert_eq!(primera, suya, "ya las tiene: nada que poner");
        assert_eq!(copiado, vacio, "y nada apuntado como copiado");
        let (despues, _) = con_barreras(primera, &vacio, &copiado).unwrap();
        assert_eq!(despues, suya, "la principal las quita y en la cuenta se quedan");
    }

    #[test]
    fn lo_que_no_tiene_la_forma_esperada_no_se_pisa() {
        let ahora = barreras_de(&principal_de_prueba());
        let vacio = barreras_de(&serde_json::json!({}));
        assert!(con_barreras(serde_json::json!({ "hooks": "nada" }), &ahora, &vacio).is_err());
        assert!(con_barreras(serde_json::json!({ "permissions": ["x"] }), &ahora, &vacio).is_err());
        assert!(con_barreras(serde_json::json!(["x"]), &ahora, &vacio).is_err());
    }

    #[test]
    fn en_disco_y_sin_pisar_un_archivo_que_no_se_entiende() {
        let base = std::env::temp_dir().join(format!("adeorq-barreras-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let (principal, cuenta) = (base.join("principal"), base.join("cuenta"));
        std::fs::create_dir_all(&principal).unwrap();
        std::fs::create_dir_all(&cuenta).unwrap();
        std::fs::write(principal.join("settings.json"), format!("\u{feff}{}", principal_de_prueba())).unwrap();

        assert!(sembrar_desde(&principal, &cuenta).unwrap(), "la primera vez escribe");
        let puesto: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(cuenta.join("settings.json")).unwrap()).unwrap();
        assert_eq!(puesto["permissions"]["deny"][0], "Bash(rm -rf *)");
        assert!(!sembrar_desde(&principal, &cuenta).unwrap(), "la segunda, nada");

        // La propia principal, y una carpeta que no existe: nada.
        assert!(!sembrar_desde(&principal, &principal).unwrap());
        assert!(!sembrar_desde(&principal, &base.join("no-existe")).unwrap());
        assert!(!base.join("no-existe").exists());

        // Unos ajustes que no se entienden: error, y el archivo sigue igual.
        std::fs::write(cuenta.join("settings.json"), "{ esto no es json").unwrap();
        assert!(sembrar_desde(&principal, &cuenta).is_err());
        assert_eq!(std::fs::read_to_string(cuenta.join("settings.json")).unwrap(), "{ esto no es json");
        let _ = std::fs::remove_dir_all(&base);
    }

    /// Cerrar sesión BORRA archivos, así que lo que hay que fijar no es que
    /// funcione (eso se ve), sino lo que NO puede tocar. Un nombre de
    /// credencial que sea una ruta saldría de la carpeta de la cuenta, y la
    /// lista viene de una tabla que algún día editará alguien con prisa.
    #[test]
    fn a_credential_name_that_is_a_path_is_refused() {
        let malos = ["../.credentials.json", "..\\otra\\auth.json", "a/b.json", ""];
        for m in malos {
            assert!(
                m.contains(['/', '\\']) || m.contains("..") || m.trim().is_empty(),
                "«{m}» tendría que quedar fuera y la guarda no lo ve",
            );
        }
        // Y los buenos de verdad, los de la tabla de proveedores, pasan.
        for bueno in [".credentials.json", "auth.json", "oauth_creds.json"] {
            assert!(
                !bueno.contains(['/', '\\']) && !bueno.contains("..") && !bueno.trim().is_empty(),
                "«{bueno}» es un nombre legítimo y la guarda lo estaría tirando",
            );
        }
    }

    /// La carpeta de fábrica de un CLI llega como ruta relativa porque el
    /// renderer no puede expandir `~`. Pi es el caso que lo obliga: la suya no
    /// es `.pi` sino `.pi/agent`, con separador dentro.
    #[test]
    fn a_default_folder_arrives_relative_and_is_expanded() {
        let Some(casa) = crate::dir_casa() else { return };
        let d = carpeta_de("", Some(".pi/agent"), false).expect("tendría que resolverla");
        assert_eq!(d, casa.join(".pi").join("agent"));
        // Y con la barra al revés sale lo mismo: los proveedores escriben las
        // dos formas y no puede depender de cuál eligió quien la anotó.
        assert_eq!(carpeta_de("", Some(".pi\\agent"), false).unwrap(), d);
        // Una cuenta con carpeta propia se usa tal cual, sin tocar.
        assert_eq!(
            carpeta_de("C:/lo/que/sea", Some(".claude"), false).unwrap(),
            PathBuf::from("C:/lo/que/sea"),
        );
        // Y sin ninguna de las dos, no hay carpeta que adivinar.
        assert!(carpeta_de("", None, false).is_none());
        assert!(carpeta_de("", Some("  "), false).is_none());
    }

    /// Gemini CLI toma `GEMINI_CLI_HOME` como la carpeta de USUARIO y le cuelga
    /// `.gemini` detrás, así que el login de una segunda cuenta cae en
    /// `<cuenta>/.gemini/oauth_creds.json`. Leída como la carpeta misma, la
    /// cuenta salía «sin conectar» aunque hubiera entrado. Todo en una carpeta
    /// temporal y con una casa falsa: la de verdad no se lee.
    #[test]
    fn una_variable_que_es_la_casa_se_lee_un_nivel_mas_abajo() {
        let base = std::env::temp_dir().join(format!("adeorq-test-casa-{}", std::process::id()));
        let cuenta = base.join("gemini-segunda");
        let login = cuenta.join(".gemini");
        let dir = cuenta.to_string_lossy().into_owned();

        // La cuenta propia, un nivel más abajo; la principal, en la casa.
        assert_eq!(carpeta_en(&dir, Some(".gemini"), true, None), Some(login.clone()));
        assert_eq!(
            carpeta_en("", Some(".gemini"), true, Some(base.clone())),
            Some(base.join(".gemini")),
        );
        // Sin saber qué cuelga de la casa, no se adivina.
        assert_eq!(carpeta_en(&dir, None, true, None), None);
        // Y sin la marca, como siempre: la variable ES la carpeta.
        assert_eq!(carpeta_en(&dir, Some(".gemini"), false, None), Some(cuenta.clone()));

        // Lo que ve la pantalla de Cuentas, con el login donde lo deja el CLI.
        std::fs::create_dir_all(&login).unwrap();
        std::fs::write(login.join("oauth_creds.json"), "{}").unwrap();
        let creds = vec!["oauth_creds.json".to_string(), "google_accounts.json".to_string()];
        let ahora = account_ready(dir.clone(), creds.clone(), Some(".gemini".into()), Some(true));
        let sin_marca = account_ready(dir, creds, Some(".gemini".into()), None);
        let _ = std::fs::remove_dir_all(&base);
        assert!(ahora, "con el login en <cuenta>/.gemini tiene que salir conectada");
        assert!(!sin_marca, "sin la marca se mira <cuenta>/oauth_creds.json, que el CLI nunca escribe");
    }

    #[test]
    fn labels_become_boring_folder_names() {
        assert_eq!(slugify("Cuenta personal"), "cuenta-personal");
        assert_eq!(slugify("  Max #2  "), "max-2");
        assert_eq!(slugify("////"), "cuenta");
        assert_eq!(slugify("Trabajo/../.."), "trabajo");
        assert!(!slugify("a b c d").contains(' '));
    }

    #[test]
    fn detection_reports_only_what_exists() {
        // A name nobody could have installed must never come back...
        let made_up = detect_clis(vec![("x".into(), "no-such-agent-cli-9f2a".into())]);
        assert!(made_up.is_empty());
        // ...while the one Adeorq itself runs on is found on this machine,
        // even though it lives outside PATH, in ~/.local/bin.
        let claude = detect_clis(vec![("claude".into(), "claude".into())]);
        assert!(claude.iter().all(|c| Path::new(&c.path).is_file()));
    }

    #[test]
    fn a_signed_in_account_is_told_by_its_own_file() {
        let dir = std::env::temp_dir().join("adeorq-test-account");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.to_string_lossy().into_owned();
        let _ = std::fs::remove_file(dir.join("auth.json"));
        assert!(!account_ready(path.clone(), vec!["auth.json".into()], None, None));
        std::fs::write(dir.join("auth.json"), "{}").unwrap();
        assert!(account_ready(path.clone(), vec!["auth.json".into()], None, None));
        // A different CLI's file does not count as signed in.
        assert!(!account_ready(path, vec!["oauth_creds.json".into()], None, None));
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The guard that matters: only folders under our own accounts root.
    #[test]
    fn only_our_own_folders_can_be_deleted() {
        let root = Path::new("C:\\Users\\x\\AppData\\Local\\Adeorq\\accounts");
        let ours = root.join("trabajo");
        let home = Path::new("C:\\Users\\x\\.claude");
        assert!(ours.starts_with(root) && ours != root);
        assert!(!home.starts_with(root));
    }
}

#[cfg(test)]
mod effort_tests {
    use super::*;

    /// His real settings.json, because the point of this function is to agree
    /// with what the CLI itself will do.
    #[test]
    fn reads_the_effort_he_has_configured() {
        match cli_effort(None) {
            Some(level) => {
                assert!(["low", "medium", "high", "xhigh", "max"].contains(&level.as_str()));
                println!("effort configurado: {level}");
            }
            // Fine on a machine with no Claude settings: the pane then starts
            // without the flag, exactly as before.
            None => println!("sin effortLevel en settings.json"),
        }
    }

    #[test]
    fn a_missing_folder_is_not_a_crash() {
        assert_eq!(cli_effort(Some(r"C:\no\existe".into())), None);
    }
}

// ── Las skills, compartidas entre cuentas ───────────────────────────────────
//
// Una cuenta es una carpeta (`CLAUDE_CONFIG_DIR`), así que cada una tiene sus
// propias skills en `<cuenta>/skills` y lo que escribes en una no existe en las
// demás. Munir lo vio con la cuenta CCC delante, que no enseñaba ni una
// (2026-08-09).
//
// La respuesta la tenía él ya en su disco sin saberlo: tres de sus seis skills
// son JUNCTIONS, carpetas que en realidad apuntan a otro sitio. Compartirlas es
// exactamente eso, un enlace de `<cuenta>/skills` a `~/.claude/skills`.
//
// Un enlace y no una copia, y eso hay que decirlo en el botón: es la MISMA
// carpeta, así que escribes una skill una vez y la ven todas, pero borrarla
// desde una cuenta la borra para todas.
//
// En Windows va por junction (`mklink /J`) a propósito y no por `symlink_dir`:
// un enlace simbólico pide permisos de administrador o el modo desarrollador
// encendido, y un junction no pide nada. En Linux, un symlink normal.

#[derive(serde::Serialize)]
pub struct EstadoSkills {
    /// Cuántas skills ve esa cuenta ahora mismo.
    pub cuantas: u32,
    /// Si su carpeta es un enlace a la de la cuenta principal.
    pub compartida: bool,
    /// Cuántas hay en la principal, que es lo que ganaría al compartir.
    pub en_principal: u32,
}

fn carpeta_skills(config_dir: &str) -> Result<PathBuf, String> {
    let dir = PathBuf::from(config_dir);
    if config_dir.trim().is_empty() {
        return Err("esa cuenta no tiene carpeta propia".into());
    }
    // Nunca la principal: `~/.claude/skills` es el ORIGEN de todo esto y
    // enlazarla contra sí misma dejaría a Munir sin skills en ningún sitio.
    let real = dir.canonicalize().map_err(|e| e.to_string())?;
    let raiz = accounts_root()?;
    let dentro = raiz
        .canonicalize()
        .ok()
        .map(|b| real.starts_with(&b) && real != b)
        .unwrap_or(false);
    if !dentro {
        return Err("solo se pueden enlazar las cuentas que Adeorq gestiona".into());
    }
    Ok(real.join("skills"))
}

fn skills_principal() -> Result<PathBuf, String> {
    let casa = crate::dir_casa().ok_or("no sé cuál es tu carpeta de usuario")?;
    Ok(casa.join(".claude").join("skills"))
}

fn cuantas_en(p: &Path) -> u32 {
    std::fs::read_dir(p)
        .map(|d| d.filter_map(|e| e.ok()).filter(|e| e.path().is_dir()).count() as u32)
        .unwrap_or(0)
}

/// Es un enlace (symlink o junction). `symlink_metadata` no sigue el enlace,
/// que es justo lo que hace falta para poder distinguirlo de una carpeta.
fn es_enlace(p: &Path) -> bool {
    std::fs::symlink_metadata(p)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn skills_estado(config_dir: String) -> Result<EstadoSkills, String> {
    let principal = skills_principal()?;
    let suya = carpeta_skills(&config_dir)?;
    Ok(EstadoSkills {
        cuantas: cuantas_en(&suya),
        compartida: es_enlace(&suya),
        en_principal: cuantas_en(&principal),
    })
}

/// Enlaza las skills de una cuenta con las de la principal.
///
/// Se niega si esa cuenta ya tiene skills SUYAS: enlazar taparía su carpeta y
/// las perdería de vista sin decir nada. Ese caso se resuelve arriba, con
/// Munir delante, no aquí a la brava.
#[tauri::command]
pub async fn compartir_skills(config_dir: String) -> Result<u32, String> {
    let principal = skills_principal()?;
    if !principal.is_dir() {
        return Err("todavía no tienes ninguna skill en tu cuenta principal".into());
    }
    let suya = carpeta_skills(&config_dir)?;
    if es_enlace(&suya) {
        return Ok(cuantas_en(&principal)); // ya lo estaba: no es un error
    }
    if suya.exists() {
        let propias = cuantas_en(&suya);
        if propias > 0 {
            return Err(format!(
                "esa cuenta ya tiene {propias} skills suyas; muévelas o bórralas antes de compartir"
            ));
        }
        std::fs::remove_dir(&suya).map_err(|e| format!("no pude quitar la carpeta vacía: {e}"))?;
    }
    if let Some(padre) = suya.parent() {
        std::fs::create_dir_all(padre).map_err(|e| e.to_string())?;
    }
    enlazar(&principal, &suya)?;
    Ok(cuantas_en(&principal))
}

/// Deshace el enlace. NO borra ninguna skill: solo quita el enlace, y la cuenta
/// se queda sin skills propias hasta que le pongas alguna.
#[tauri::command]
pub async fn dejar_de_compartir_skills(config_dir: String) -> Result<(), String> {
    let suya = carpeta_skills(&config_dir)?;
    if !es_enlace(&suya) {
        return Err("esa cuenta no tiene las skills compartidas".into());
    }
    // Un enlace a un directorio se quita con `remove_dir`, no con `remove_file`,
    // y quitar el enlace NO toca lo que hay al otro lado.
    std::fs::remove_dir(&suya).map_err(|e| e.to_string())
}

#[cfg(windows)]
fn enlazar(origen: &Path, destino: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    // Sin ventana negra: esto corre desde una app sin consola.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let salida = std::process::Command::new("cmd")
        .args(["/c", "mklink", "/J"])
        .arg(destino)
        .arg(origen)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    if salida.status.success() {
        return Ok(());
    }
    let texto = String::from_utf8_lossy(&salida.stderr);
    Err(format!(
        "no pude crear el enlace: {}",
        texto.trim().lines().next().unwrap_or("error desconocido")
    ))
}

#[cfg(not(windows))]
fn enlazar(origen: &Path, destino: &Path) -> Result<(), String> {
    std::os::unix::fs::symlink(origen, destino).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests_skills {
    use super::*;

    #[test]
    fn the_main_account_can_never_be_linked() {
        // La principal no está bajo `accounts`, así que la guarda la rechaza.
        // Sin esto, enlazar `~/.claude/skills` contra sí misma dejaría a Munir
        // sin skills en ninguna cuenta.
        let casa = crate::dir_casa().unwrap_or_default();
        assert!(carpeta_skills(&casa.to_string_lossy()).is_err());
        assert!(carpeta_skills("").is_err());
    }

    #[test]
    fn a_folder_with_no_subfolders_counts_zero() {
        assert_eq!(cuantas_en(Path::new("no-existe-esta-carpeta-de-verdad")), 0);
    }
}
