use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub invocation: String,
    /// La CARPETA, que es su identificador de verdad: `name` sale del
    /// frontmatter y puede no parecerse a ella.
    pub folder: String,
    /// De dónde sale: `tuya` (`~/.claude/skills`), `claude.ai` (las que trae la
    /// cuenta, en `skills/synced`) o `plugin`.
    pub origen: String,
    /// Cuántas veces la has escrito en Claude Code, contadas de su historial.
    pub veces: u32,
}

/// El texto de una skill, para poder leerla dentro de la app.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillText {
    pub text: String,
    pub path: String,
}

/// Lee el `SKILL.md` de una skill.
///
/// Recibe la CARPETA y no una ruta, y por eso no hace falta más validación que
/// la de abajo: con un nombre a secas no se puede salir de `~/.claude/skills`.
/// Aun así se rechazan los separadores y los `..`, porque el día que alguien
/// llame a esto desde otro sitio la garantía tiene que estar aquí y no en quien
/// llama.
#[tauri::command(async)]
pub async fn skill_text(folder: String) -> Result<SkillText, String> {
    if folder.is_empty()
        || folder.contains(['/', '\\', ':'])
        || folder == ".."
        || folder == "."
    {
        return Err("nombre de skill no válido".into());
    }
    let home = std::env::var("USERPROFILE").map_err(|e| e.to_string())?;
    let path = Path::new(&home)
        .join(".claude")
        .join("skills")
        .join(&folder)
        .join("SKILL.md");
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(SkillText {
        text,
        path: path.to_string_lossy().into_owned(),
    })
}

/// El `name` y la `description` del frontmatter de un `SKILL.md`.
///
/// No es un lector de YAML entero, pero sí de las formas en que se escribe una
/// descripción: en una línea (con o sin comillas), partida en varias líneas
/// sangradas, y los bloques `>` y `|` (con o sin `-`). Hasta el 2026-10-30 solo
/// leía la primera, y las skills con `description: >-` salían en la lista con
/// «>-» por descripción.
fn leer_frontmatter(text: &str) -> (Option<String>, String) {
    let lineas: Vec<&str> = text
        .trim_start_matches('\u{feff}')
        .lines()
        .take(60)
        .skip_while(|l| l.trim() != "---")
        .skip(1)
        .take_while(|l| l.trim() != "---")
        .collect();

    let mut name = None;
    let mut description = String::new();
    let mut i = 0;
    while i < lineas.len() {
        let linea = lineas[i];
        i += 1;
        // Solo las claves de arriba: lo sangrado es de la clave anterior.
        if linea.starts_with([' ', '\t']) {
            continue;
        }
        let Some((clave, valor)) = linea.split_once(':') else {
            continue;
        };
        let valor = valor.trim();
        match clave.trim() {
            "name" => {
                let v = sin_comillas(valor);
                if !v.is_empty() {
                    name = Some(v);
                }
            }
            "description" => {
                let mut siguen = Vec::new();
                while i < lineas.len()
                    && (lineas[i].trim().is_empty() || lineas[i].starts_with([' ', '\t']))
                {
                    siguen.push(lineas[i].trim());
                    i += 1;
                }
                description = juntar_valor(valor, &siguen);
            }
            _ => {}
        }
    }
    (name, description)
}

/// Un valor de YAML con sus líneas de continuación ya sin sangría.
fn juntar_valor(cabeza: &str, siguen: &[&str]) -> String {
    if cabeza.starts_with('|') {
        return siguen.join("\n").trim().to_owned();
    }
    if cabeza.starts_with('>') {
        // Plegado: las líneas seguidas se juntan con un espacio, y una línea
        // vacía es un salto de párrafo.
        let mut out = String::new();
        for l in siguen {
            if l.is_empty() {
                out.push('\n');
            } else {
                if !out.is_empty() && !out.ends_with('\n') {
                    out.push(' ');
                }
                out.push_str(l);
            }
        }
        return out.trim().to_owned();
    }
    let mut partes = vec![cabeza];
    partes.extend(siguen.iter().filter(|l| !l.is_empty()));
    sin_comillas(&partes.join(" "))
}

fn sin_comillas(v: &str) -> String {
    let v = v.trim();
    if v.len() >= 2 && v.starts_with('\'') && v.ends_with('\'') {
        return v[1..v.len() - 1].replace("''", "'");
    }
    if v.len() >= 2 && v.starts_with('"') && v.ends_with('"') {
        return v[1..v.len() - 1].replace("\\\"", "\"");
    }
    v.to_owned()
}

/// Una skill leída de su `SKILL.md`; `invocar` recibe el nombre y da la orden.
fn leer_skill(md: &Path, folder: &str, origen: &str, invocar: impl FnOnce(&str) -> String) -> Option<Skill> {
    let text = std::fs::read_to_string(md).ok()?;
    let (name, mut description) = leer_frontmatter(&text);
    let name = name.unwrap_or_else(|| folder.to_owned());
    if description.chars().count() > 160 {
        description = format!("{}…", description.chars().take(159).collect::<String>());
    }
    Some(Skill {
        invocation: invocar(&name),
        name,
        description,
        folder: folder.to_owned(),
        origen: origen.to_owned(),
        veces: 0,
    })
}

/// Las carpetas de dentro de `dir`, con su nombre.
fn carpetas(dir: &Path) -> Vec<(String, std::path::PathBuf)> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .map(|p| (p.file_name().unwrap_or_default().to_string_lossy().into_owned(), p))
        .collect()
}

/// Las skills que no son de tu carpeta (Munir, 2026-10-30: «B2», en un grupo
/// aparte al final de la lista): las que trae tu cuenta de claude.ai, que
/// Claude Code baja a `skills/synced/<cuenta>/<skill>` y nombra
/// `anthropic-skills:<skill>`, y las de los plugins encendidos en
/// `settings.json`, que se nombran `<plugin>:<skill>` y viven en su carpeta de
/// instalación, en `skills/<skill>` o en un `SKILL.md` suelto en la raíz.
fn skills_de_fuera(claude: &Path) -> Vec<Skill> {
    let mut out = Vec::new();
    for (_, cuenta) in carpetas(&claude.join("skills").join("synced")) {
        for (folder, dir) in carpetas(&cuenta) {
            out.extend(leer_skill(&dir.join("SKILL.md"), &folder, "claude.ai", |n| {
                format!("/anthropic-skills:{n}")
            }));
        }
    }

    let leer_json = |f: &str| -> serde_json::Value {
        std::fs::read_to_string(claude.join(f))
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default()
    };
    let encendidos = leer_json("settings.json");
    let instalados = leer_json("plugins/installed_plugins.json");
    let Some(plugins) = instalados["plugins"].as_object() else {
        return out;
    };
    for (clave, versiones) in plugins {
        if encendidos["enabledPlugins"][clave].as_bool() != Some(true) {
            continue;
        }
        let Some(raiz) = versiones[0]["installPath"].as_str().map(Path::new) else {
            continue;
        };
        let plugin = clave.split('@').next().unwrap_or(clave);
        out.extend(leer_skill(&raiz.join("SKILL.md"), plugin, "plugin", |n| format!("/{plugin}:{n}")));
        for (folder, dir) in carpetas(&raiz.join("skills")) {
            out.extend(leer_skill(&dir.join("SKILL.md"), &folder, "plugin", |n| format!("/{plugin}:{n}")));
        }
    }
    out
}

/// Cuántas veces se escribió cada orden de barra, del historial de Claude Code
/// (`history.jsonl`: una línea por mensaje tecleado, lo escrito en `display`).
/// La clave va sin la barra y en minúsculas. Lo que se manda desde la lista de
/// skills también se teclea en la terminal, así que también cuenta.
fn veces_por_orden(historia: &str) -> HashMap<String, u32> {
    let mut out = HashMap::new();
    for linea in historia.lines() {
        let Some(i) = linea.find("\"display\":\"/") else {
            continue;
        };
        let orden: String = linea[i + 12..]
            .chars()
            .take_while(|c| !c.is_whitespace() && *c != '"' && *c != '\\')
            .collect();
        if !orden.is_empty() {
            *out.entry(orden.to_lowercase()).or_insert(0) += 1;
        }
    }
    out
}

/// Por su orden y por su nombre suelto (`/finito` vale por `/finito:finito`),
/// sin contar dos veces cuando son lo mismo.
fn veces_de(s: &Skill, veces: &HashMap<String, u32>) -> u32 {
    let orden = s.invocation.trim_start_matches('/').to_lowercase();
    let nombre = s.name.to_lowercase();
    let de = |k: &str| veces.get(k).copied().unwrap_or(0);
    de(&orden) + if nombre != orden { de(&nombre) } else { 0 }
}

/// Las tuyas, por nombre; con `fuera`, detrás las de claude.ai y los plugins.
#[tauri::command(async)]
pub async fn list_skills(fuera: Option<bool>) -> Result<Vec<Skill>, String> {
    let claude = crate::dir_casa().ok_or("no encuentro la carpeta del usuario")?.join(".claude");
    let por_nombre = |a: &Skill, b: &Skill| a.name.to_lowercase().cmp(&b.name.to_lowercase());
    let mut out: Vec<Skill> = carpetas(&claude.join("skills"))
        .into_iter()
        .filter_map(|(folder, dir)| {
            leer_skill(&dir.join("SKILL.md"), &folder, "tuya", |_| format!("/{folder}"))
        })
        .collect();
    out.sort_by(por_nombre);
    if fuera == Some(true) {
        let mut de_fuera = skills_de_fuera(&claude);
        de_fuera.sort_by(por_nombre);
        out.extend(de_fuera);
    }
    let historia = std::fs::read_to_string(claude.join("history.jsonl")).unwrap_or_default();
    let veces = veces_por_orden(&historia);
    for s in &mut out {
        s.veces = veces_de(s, &veces);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn descripcion(text: &str) -> String {
        leer_frontmatter(text).1
    }
    #[test]
    fn una_sola_linea_sigue_igual() {
        let (name, desc) = leer_frontmatter("---\nname: fin\ndescription: Cierre de sesión.\n---\n# Fin\n");
        assert_eq!(name.as_deref(), Some("fin"));
        assert_eq!(desc, "Cierre de sesión.");
    }

    /// La forma de `diretto`, `galsas` o `siteindex`: la lista enseñaba «>-».
    #[test]
    fn lee_el_bloque_plegado_con_sus_lineas_sangradas() {
        let text = "---\nname: diretto\ndescription: >-\n  Formato de respuesta directo,\n  completo y enumerado.\n---\n";
        assert_eq!(descripcion(text), "Formato de respuesta directo, completo y enumerado.");
        let text = "---\ndescription: >\n  Una\n  dos.\nname: x\n---\n";
        assert_eq!(descripcion(text), "Una dos.");
    }

    #[test]
    fn el_bloque_literal_conserva_los_saltos() {
        let text = "---\ndescription: |-\n  Primera.\n  Segunda.\n---\n";
        assert_eq!(descripcion(text), "Primera.\nSegunda.");
        let text = "---\ndescription: |\n  Sola.\n---\n";
        assert_eq!(descripcion(text), "Sola.");
    }

    #[test]
    fn la_clave_de_despues_del_bloque_no_se_cuela() {
        let text = "---\nname: ateneo\ndescription: >-\n  Aprende.\n\ndisable-model-invocation: true\nargument-hint: \"¿Qué?\"\n---\n";
        let (name, desc) = leer_frontmatter(text);
        assert_eq!(name.as_deref(), Some("ateneo"));
        assert_eq!(desc, "Aprende.");
    }

    #[test]
    fn quita_las_comillas_simples_y_dobles() {
        assert_eq!(descripcion("---\ndescription: 'It''s here'\n---\n"), "It's here");
        assert_eq!(descripcion("---\ndescription: \"Say \\\"hi\\\"\"\n---\n"), "Say \"hi\"");
    }

    #[test]
    fn junta_un_texto_plano_partido_en_varias_lineas() {
        let text = "---\ndescription: Empieza aquí\n  y sigue aquí.\nname: x\n---\n";
        assert_eq!(descripcion(text), "Empieza aquí y sigue aquí.");
    }

    #[test]
    fn vale_con_saltos_de_windows() {
        let text = "---\r\nname: galsas\r\ndescription: >-\r\n  Auditoría\r\n  legal.\r\n---\r\n";
        assert_eq!(descripcion(text), "Auditoría legal.");
        // Y con la marca de orden que deja el `Set-Content -Encoding utf8` de PowerShell.
        assert_eq!(descripcion("\u{feff}---\ndescription: Hola.\n---\n"), "Hola.");
    }

    #[test]
    fn cuenta_las_ordenes_de_barra_del_historial() {
        let historia = concat!(
            "{\"display\":\"/fin\",\"project\":\"C:\\\\a\"}\n",
            "{\"display\":\"/fin sin commits\",\"project\":\"b\"}\n",
            "{\"display\":\"/Criteria\\nla segunda línea\"}\n",
            "{\"display\":\"arregla el /fin\"}\n",
            "{\"display\":\"/finito\"}\n",
            "no es json\n",
        );
        let veces = veces_por_orden(historia);
        assert_eq!(veces.get("fin"), Some(&2));
        assert_eq!(veces.get("criteria"), Some(&1));
        assert_eq!(veces.get("finito"), Some(&1));
        assert_eq!(veces.len(), 3);

        let skill = |inv: &str, name: &str| Skill {
            name: name.into(),
            description: String::new(),
            invocation: inv.into(),
            folder: String::new(),
            origen: String::new(),
            veces: 0,
        };
        assert_eq!(veces_de(&skill("/Criteria", "criteria"), &veces), 1);
        assert_eq!(veces_de(&skill("/finito:finito", "finito"), &veces), 1);
        assert_eq!(veces_de(&skill("/galsas", "galsas"), &veces), 0);
    }

    #[test]
    fn lee_las_de_claude_ai_y_las_de_los_plugins_encendidos() {
        let claude = std::env::temp_dir().join(format!("adeorq-skills-fuera-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&claude);
        let escribir = |ruta: std::path::PathBuf, texto: &str| {
            std::fs::create_dir_all(ruta.parent().unwrap()).unwrap();
            std::fs::write(ruta, texto).unwrap();
        };
        escribir(claude.join("skills/synced/cuenta/pdf/SKILL.md"), "---\nname: pdf\ndescription: PDFs.\n---\n");
        let encendido = claude.join("plugins/cache/finito");
        let apagado = claude.join("plugins/cache/otro");
        escribir(encendido.join("SKILL.md"), "---\nname: finito\ndescription: Cierra.\n---\n");
        escribir(encendido.join("skills/extra/SKILL.md"), "---\ndescription: >-\n  Otra.\n---\n");
        escribir(apagado.join("skills/nada/SKILL.md"), "---\ndescription: No.\n---\n");
        let ruta = |p: &std::path::Path| p.to_string_lossy().replace('\\', "\\\\");
        escribir(
            claude.join("plugins/installed_plugins.json"),
            &format!(
                "{{\"plugins\":{{\"finito@vibeset\":[{{\"installPath\":\"{}\"}}],\"otro@x\":[{{\"installPath\":\"{}\"}}]}}}}",
                ruta(&encendido),
                ruta(&apagado)
            ),
        );
        escribir(claude.join("settings.json"), "{\"enabledPlugins\":{\"finito@vibeset\":true,\"otro@x\":false}}");

        let mut fuera: Vec<(String, String, String)> = skills_de_fuera(&claude)
            .into_iter()
            .map(|s| (s.invocation, s.origen, s.description))
            .collect();
        fuera.sort();
        let _ = std::fs::remove_dir_all(&claude);
        assert_eq!(
            fuera,
            vec![
                ("/anthropic-skills:pdf".into(), "claude.ai".into(), "PDFs.".into()),
                ("/finito:extra".into(), "plugin".into(), "Otra.".into()),
                ("/finito:finito".into(), "plugin".into(), "Cierra.".into()),
            ]
        );
    }
}
