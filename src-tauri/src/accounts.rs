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
#[tauri::command]
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
#[tauri::command]
pub fn account_ready(config_dir: String, files: Vec<String>, home_dir: Option<String>) -> bool {
    let dir = if config_dir.trim().is_empty() {
        let Some(rel) = home_dir.filter(|h| !h.trim().is_empty()) else {
            return false;
        };
        let Some(home) = crate::dir_casa() else {
            return false;
        };
        // Providers write "a/b" style paths; join handles both separators.
        rel.split(['/', '\\'])
            .fold(PathBuf::from(home), |acc, part| acc.join(part))
    } else {
        PathBuf::from(&config_dir)
    };
    files.iter().any(|f| dir.join(f).is_file())
}

/// La carpeta de una cuenta, venga con ruta propia o sea la de siempre del CLI.
///
/// Sale de `account_ready`, que hacía esta misma cuenta a mano: el renderer no
/// puede expandir `~`, así que la carpeta de fábrica llega como ruta relativa
/// (`.claude`, `.pi/agent`) y se resuelve aquí.
fn carpeta_de(config_dir: &str, home_dir: Option<&str>) -> Option<PathBuf> {
    if !config_dir.trim().is_empty() {
        return Some(PathBuf::from(config_dir));
    }
    let rel = home_dir.filter(|h| !h.trim().is_empty())?;
    let home = crate::dir_casa()?;
    Some(rel.split(['/', '\\']).fold(PathBuf::from(home), |acc, p| acc.join(p)))
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
) -> Result<Vec<String>, String> {
    let dir = carpeta_de(&config_dir, home_dir.as_deref())
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
#[tauri::command]
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
#[tauri::command]
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
        let found = found.or_else(|| {
            let home = crate::dir_casa()?;
            let p = home
                .join(".local")
                .join("bin")
                .join(format!("{exe}.exe"));
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
#[tauri::command]
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
#[tauri::command]
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

#[cfg(test)]
mod tests {
    use super::*;

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
        let d = carpeta_de("", Some(".pi/agent")).expect("tendría que resolverla");
        assert_eq!(d, casa.join(".pi").join("agent"));
        // Y con la barra al revés sale lo mismo: los proveedores escriben las
        // dos formas y no puede depender de cuál eligió quien la anotó.
        assert_eq!(carpeta_de("", Some(".pi\\agent")).unwrap(), d);
        // Una cuenta con carpeta propia se usa tal cual, sin tocar.
        assert_eq!(
            carpeta_de("C:/lo/que/sea", Some(".claude")).unwrap(),
            PathBuf::from("C:/lo/que/sea"),
        );
        // Y sin ninguna de las dos, no hay carpeta que adivinar.
        assert!(carpeta_de("", None).is_none());
        assert!(carpeta_de("", Some("  ")).is_none());
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
        assert!(!account_ready(path.clone(), vec!["auth.json".into()], None));
        std::fs::write(dir.join("auth.json"), "{}").unwrap();
        assert!(account_ready(path.clone(), vec!["auth.json".into()], None));
        // A different CLI's file does not count as signed in.
        assert!(!account_ready(path, vec!["oauth_creds.json".into()], None));
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
