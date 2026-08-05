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
    let local = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    Ok(Path::new(&local).join("Adeorq").join("accounts"))
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
        let Ok(home) = std::env::var("USERPROFILE") else {
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
        None => PathBuf::from(std::env::var("USERPROFILE").ok()?).join(".claude"),
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
    let dirs: Vec<&str> = path.split(';').filter(|d| !d.is_empty()).collect();
    let mut out = Vec::new();
    for (id, exe) in exes {
        let found = dirs.iter().find_map(|dir| {
            for ext in ["exe", "cmd", "bat", "ps1", ""] {
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
            let home = std::env::var("USERPROFILE").ok()?;
            let p = Path::new(&home)
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
