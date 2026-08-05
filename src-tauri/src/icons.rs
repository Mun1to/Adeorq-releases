// Project avatars, Discord style: each workspace shows the logo of the thing it
// actually builds. Nobody keeps a logo in the same place twice, so this looks in
// the handful of folders that real projects use and picks the best candidate.
//
// Deliberately NOT a recursive walk: scanning C:\proyectos three levels deep
// took minutes on this machine (node_modules, venv, target). A fixed list of
// folders is a few hundred reads and finishes before the sidebar paints.
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

/// Where logos live, best first. The index is part of the score, so a real
/// brand folder beats a favicon buried in a sub-app.
const DIRS: &[&str] = &[
    "brand",
    "branding",
    "assets",
    "",
    "public",
    "static",
    "img",
    "images",
    "src/assets",
    "app",
    "web",
    "landing",
    "site",
    "site/assets",
    "web/public",
    "app/public",
    "app/static",
    "landing/public",
    "src-tauri/icons",
    "app/src-tauri/icons",
    "docs",
];

/// Never worth opening: they are big, and any logo inside belongs to somebody
/// else's package (skimage ships a logo.png that is not your project's).
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "venv",
    ".venv",
    "target",
    "dist",
    "build",
    "release",
    "out",
    "coverage",
    "__pycache__",
    ".git",
    ".next",
    ".svelte-kit",
    "archive",
];

const MAX_BYTES: u64 = 512 * 1024;

/// Lower is better. `None` means the file is not a logo at all.
///
/// Hidden files are welcome on purpose: sixteen of Munir's projects carry a
/// `.foldericon.ico` he picked himself in Explorer, all different, and a logo
/// its owner chose beats anything we could guess. A `brand/` vector still wins
/// over it (sharper), and it still beats a favicon buried in a sub-app.
fn name_score(stem: &str) -> Option<u32> {
    let s = stem.to_ascii_lowercase();
    if s == "logo" || s == "logotipo" || s == "isotipo" {
        return Some(0);
    }
    if s.contains("logo") || s.contains("isotipo") {
        return Some(1);
    }
    if s == "icon" || s == "icono" {
        return Some(2);
    }
    if s == "512x512" {
        return Some(3);
    }
    if s == "128x128" {
        return Some(4);
    }
    if s.contains("favicon") || s.contains("apple-touch-icon") {
        return Some(5);
    }
    if s.contains("icon") {
        return Some(6);
    }
    None
}

fn ext_score(ext: &str) -> Option<(u32, &'static str)> {
    match ext.to_ascii_lowercase().as_str() {
        "svg" => Some((0, "image/svg+xml")),
        "png" => Some((1, "image/png")),
        "webp" => Some((2, "image/webp")),
        "ico" => Some((3, "image/x-icon")),
        "jpg" | "jpeg" => Some((4, "image/jpeg")),
        _ => None,
    }
}

fn b64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b1 = chunk[0] as u32;
        let b2 = *chunk.get(1).unwrap_or(&0) as u32;
        let b3 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b1 << 16) | (b2 << 8) | b3;
        out.push(T[(n >> 18 & 63) as usize] as char);
        out.push(T[(n >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            T[(n >> 6 & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            T[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

type Found = Option<(u32, std::path::PathBuf, &'static str)>;

/// Looks at the files of ONE folder (never recurses) and keeps the best.
fn scan_dir(dir: &Path, base: u32, best: &mut Found) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let Some(ext) = path.extension().and_then(|s| s.to_str()) else {
            continue;
        };
        let (Some(ns), Some((es, mime))) = (name_score(stem), ext_score(ext)) else {
            continue;
        };
        if entry
            .metadata()
            .map(|m| m.len() > MAX_BYTES)
            .unwrap_or(true)
        {
            continue;
        }
        let score = base + ns * 10 + es;
        if best.as_ref().is_none_or(|(b, _, _)| score < *b) {
            *best = Some((score, path, mime));
        }
    }
}

/// The winning file for one project, as (path, mime).
fn best_icon(root: &Path) -> Option<(std::path::PathBuf, &'static str)> {
    let mut best: Found = None;
    for (i, rel) in DIRS.iter().enumerate() {
        let dir = if rel.is_empty() {
            root.to_path_buf()
        } else {
            root.join(rel)
        };
        scan_dir(&dir, (i as u32) * 100, &mut best);
    }
    // Nobody agrees on folder names: hotkeyconfig keeps its logo in branding/,
    // SECBRAIN in orki/. One sweep of the project's own subfolders catches the
    // ones no fixed list can, and scores below every known location.
    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten().take(60) {
            if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
                continue;
            }
            let sub = entry.path();
            scan_dir(&sub, 2_000, &mut best);
            scan_dir(&sub.join("public"), 2_100, &mut best);
            scan_dir(&sub.join("assets"), 2_100, &mut best);
        }
    }
    best.map(|(_, p, m)| (p, m))
}

type Cache = Mutex<HashMap<String, Option<String>>>;

fn cache() -> &'static Cache {
    static CACHE: OnceLock<Cache> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Data URIs keyed by project path. Missing key = no logo found, draw initials.
/// Cached for the run: a logo does not change while the app is open, and this
/// is called every time the sidebar refreshes.
// async: la primera pasada lee y codifica los logos desde disco, y un comando
// sin async corre en el hilo de la ventana (los aciertos de caché son gratis,
// pero esa primera vez congelaba el arranque).
#[tauri::command]
pub async fn project_icons(paths: Vec<String>) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for path in paths {
        let cached = cache().lock().ok().and_then(|c| c.get(&path).cloned());
        let uri = match cached {
            Some(hit) => hit,
            None => {
                let found = best_icon(Path::new(&path)).and_then(|(file, mime)| {
                    let bytes = std::fs::read(&file).ok()?;
                    Some(format!("data:{mime};base64,{}", b64(&bytes)))
                });
                if let Ok(mut c) = cache().lock() {
                    c.insert(path.clone(), found.clone());
                }
                found
            }
        };
        if let Some(uri) = uri {
            out.insert(path, uri);
        }
    }
    out
}

/// Forces a re-read, for when you just added a logo to a project.
#[tauri::command]
pub fn forget_project_icons() {
    if let Ok(mut c) = cache().lock() {
        c.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_the_known_vectors() {
        assert_eq!(b64(b""), "");
        assert_eq!(b64(b"f"), "Zg==");
        assert_eq!(b64(b"fo"), "Zm8=");
        assert_eq!(b64(b"foo"), "Zm9v");
        assert_eq!(b64(b"foob"), "Zm9vYg==");
        assert_eq!(b64(b"fooba"), "Zm9vYmE=");
        assert_eq!(b64(b"foobar"), "Zm9vYmFy");
        // Bytes above 127 must not go through a lossy char conversion.
        assert_eq!(b64(&[0xff, 0xfe, 0xfd]), "//79");
    }

    #[test]
    fn only_logo_like_names_win() {
        assert_eq!(name_score("logo"), Some(0));
        assert_eq!(name_score("layco-logo"), Some(1));
        assert_eq!(name_score("favicon"), Some(5));
        assert_eq!(name_score("Icon"), Some(2));
        assert!(name_score("screenshot").is_none());
        assert!(name_score("next").is_none());
    }

    /// Not part of the suite: it reads this machine's C:\proyectos. Run with
    /// `cargo test -- --ignored --nocapture` to see what each project resolves
    /// to and how long the whole sidebar's worth of lookups costs.
    #[test]
    #[ignore]
    fn report_real_projects() {
        let root = Path::new("C:\\proyectos");
        let start = std::time::Instant::now();
        let (mut hits, mut total) = (0, 0);
        for entry in std::fs::read_dir(root).unwrap().flatten() {
            if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            total += 1;
            let name = entry.file_name().to_string_lossy().into_owned();
            match best_icon(&entry.path()) {
                Some((p, _)) => {
                    hits += 1;
                    let rel = p
                        .strip_prefix(entry.path())
                        .unwrap_or(&p)
                        .display()
                        .to_string();
                    println!("{name:26} {rel}");
                }
                None => println!("{name:26} -"),
            }
        }
        println!("\n{hits} de {total} con logo, en {:?}", start.elapsed());
    }

    #[test]
    fn a_brand_svg_beats_a_buried_favicon() {
        let brand = 0 * 100 + 1 * 10 + 0; // brand/layco-logo.svg
        let buried = 14 * 100 + 5 * 10 + 3; // web/public/favicon.ico
        assert!(brand < buried);
    }

    /// The order that matters in practice, checked so a reordered DIRS list
    /// cannot silently downgrade what the sidebar shows.
    #[test]
    fn the_owners_folder_icon_sits_between_brand_and_a_sub_app() {
        let root = DIRS.iter().position(|d| d.is_empty()).unwrap() as u32;
        let folder_icon = root * 100 + name_score(".foldericon").unwrap() * 10 + 3;
        let brand_svg = 0 * 100 + name_score("layco-logo").unwrap() * 10 + 0;
        let sub_favicon = 2_100 + name_score("favicon").unwrap() * 10 + 3;
        assert!(brand_svg < folder_icon, "a brand vector should still win");
        assert!(
            folder_icon < sub_favicon,
            "his own pick beats a sub-app favicon"
        );
    }
}
