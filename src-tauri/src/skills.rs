use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub invocation: String,
}

#[tauri::command]
pub fn list_skills() -> Result<Vec<Skill>, String> {
    let home = std::env::var("USERPROFILE").map_err(|e| e.to_string())?;
    let dir = Path::new(&home).join(".claude").join("skills");
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Ok(out);
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let folder = entry.file_name().to_string_lossy().into_owned();
        let Ok(text) = std::fs::read_to_string(path.join("SKILL.md")) else {
            continue;
        };
        let mut name = folder.clone();
        let mut description = String::new();
        let mut in_frontmatter = false;
        for line in text.lines().take(60) {
            let t = line.trim();
            if t == "---" {
                if in_frontmatter {
                    break;
                }
                in_frontmatter = true;
                continue;
            }
            if !in_frontmatter {
                continue;
            }
            if let Some(v) = t.strip_prefix("name:") {
                let v = v.trim().trim_matches('"');
                if !v.is_empty() {
                    name = v.to_owned();
                }
            } else if let Some(v) = t.strip_prefix("description:") {
                description = v.trim().trim_matches('"').to_owned();
            }
        }
        if description.chars().count() > 160 {
            description = format!("{}…", description.chars().take(159).collect::<String>());
        }
        out.push(Skill {
            name,
            description,
            invocation: format!("/{}", folder),
        });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}
