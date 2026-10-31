use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::path::BaseDirectory;
use tauri::Manager;

/// Munir's own folder, kept as the default so his machine behaves exactly as
/// before. It is only used when the front sends nothing AND the folder is
/// really there: on anybody else's computer it is not, and falling back to it
/// is what made a fresh install show an empty panel.
const PROJECTS_ROOT: &str = "C:\\proyectos";

/// Where projects live. The front owns the setting (the onboarding asks for it
/// and keeps it in localStorage) and sends it with every call, so there is no
/// second copy here that could drift or be read before it is set.
pub fn raiz_de(raiz: Option<String>) -> PathBuf {
    match raiz {
        Some(r) if !r.trim().is_empty() => PathBuf::from(r.trim()),
        _ => raiz_por_defecto(),
    }
}

/// La copia de respaldo de la raíz, para quien no puede preguntarle al front:
/// el puente MCP corre dentro del mismo binario pero sin ventana, así que
/// `get_projects` no tiene de dónde sacar el ajuste. El front la escribe cuando
/// el usuario la elige; el localStorage sigue siendo el dueño.
fn archivo_raiz() -> Option<PathBuf> {
    Some(crate::dir_datos().ok()?.join("raiz.txt"))
}

pub fn raiz_por_defecto() -> PathBuf {
    if let Some(guardada) = archivo_raiz()
        .and_then(|f| std::fs::read_to_string(f).ok())
        .map(|t| t.trim().to_owned())
        .filter(|t| !t.is_empty())
    {
        let p = PathBuf::from(guardada);
        if p.is_dir() {
            return p;
        }
    }
    let casa = Path::new(PROJECTS_ROOT);
    if casa.is_dir() {
        return casa.to_path_buf();
    }
    // `dir_casa` y no `USERPROFILE`: en Linux no existe, y sin `raiz.txt` esto
    // devolvía `C:\proyectos`, donde el Capataz no se podía ni lanzar.
    crate::dir_casa().unwrap_or_else(|| casa.to_path_buf())
}

/// La carpeta de proyectos y `ruta`, las dos resueltas, si `ruta` está dentro
/// (o es ella). Para lo que escribe o tira algo con una ruta que llega del
/// front: estaba `C:\proyectos` escrito a mano, que en Linux o con otra raíz
/// no existe.
pub fn en_proyectos(ruta: &str) -> Result<(PathBuf, PathBuf), String> {
    en_la_raiz(&raiz_por_defecto(), ruta)
}

fn en_la_raiz(raiz: &Path, ruta: &str) -> Result<(PathBuf, PathBuf), String> {
    let raiz = raiz.canonicalize().map_err(|e| e.to_string())?;
    let p = Path::new(ruta).canonicalize().map_err(|e| e.to_string())?;
    // Por trozos de ruta, no por texto: `C:\proyectos-copia` empieza igual que
    // `C:\proyectos` y no está dentro. Las dos están resueltas por el sistema,
    // así que las mayúsculas ya coinciden.
    if !p.starts_with(&raiz) {
        return Err(format!("«{ruta}» queda fuera de la carpeta de proyectos"));
    }
    Ok((raiz, p))
}

#[tauri::command]
pub async fn default_projects_root() -> String {
    raiz_por_defecto().to_string_lossy().into_owned()
}

/// Lo mismo que `raiz.txt` pero para lo que la carpeta madre no cuenta: los
/// proyectos añadidos a mano desde cualquier sitio del disco, y si el usuario
/// dijo que no tiene carpeta madre. Sin esto el puente MCP enseñaría una lista
/// distinta de la de la ventana, y la peor de las dos: en modo «sin carpeta»
/// acabaría listando las subcarpetas de la de usuario.
#[derive(Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProyectosAparte {
    pub sin_raiz: bool,
    pub extras: Vec<String>,
}

fn archivo_aparte() -> Option<PathBuf> {
    Some(crate::dir_datos().ok()?.join("proyectos.json"))
}

pub fn proyectos_aparte() -> ProyectosAparte {
    archivo_aparte()
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn set_extra_projects(sin_raiz: bool, extras: Vec<String>) -> Result<(), String> {
    let f = archivo_aparte().ok_or("LOCALAPPDATA no disponible")?;
    if let Some(dir) = f.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string(&ProyectosAparte { sin_raiz, extras })
        .map_err(|e| e.to_string())?;
    std::fs::write(&f, json).map_err(|e| e.to_string())
}

/// Guarda la raíz elegida. Devuelve la carpeta tal cual quedó, que es lo que el
/// front pinta: si la que mandó no existe, el error se ve al elegirla y no tres
/// pantallas después con el panel vacío.
#[tauri::command]
pub async fn set_projects_root(path: String) -> Result<String, String> {
    let limpia = path.trim().trim_end_matches(['\\', '/']).to_owned();
    if limpia.is_empty() {
        return Err("La carpeta está vacía".into());
    }
    if !Path::new(&limpia).is_dir() {
        return Err(format!("No existe {limpia}"));
    }
    let f = archivo_raiz().ok_or("LOCALAPPDATA no disponible")?;
    if let Some(dir) = f.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&f, &limpia).map_err(|e| e.to_string())?;
    Ok(limpia)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedProject {
    pub name: String,
    pub path: String,
    pub has_git: bool,
}

/// Tu propia plantilla de `AGENTS.md`, si la has puesto.
///
/// Vive en `%LOCALAPPDATA%\Adeorq\plantilla-agents.md` y no en el repositorio a
/// propósito: las reglas con las que trabajas son tuyas y de tu equipo, no del
/// programa. Antes iban escritas aquí dentro —con nombre propio y con la ruta
/// de un disco concreto—, así que cualquiera que creara un proyecto heredaba
/// las normas de otra casa sin haberlas pedido.
///
/// `{name}` se sustituye por el nombre del proyecto. Si el archivo no está, o
/// no se puede leer, se usa la de fábrica y no pasa nada.
fn plantilla_propia(name: &str) -> Option<String> {
    let f = crate::dir_datos().ok()?.join("plantilla-agents.md");
    let txt = std::fs::read_to_string(f).ok()?;
    let txt = txt.trim();
    if txt.is_empty() {
        return None;
    }
    Some(format!("{}\n", txt.replace("{name}", name)))
}

/// La de fábrica: lo que vale para cualquier proyecto, sin nombres ni rutas de
/// nadie. Es un punto de partida corto a propósito — quien tenga sus normas se
/// pone las suyas con `plantilla_propia`, y quien no las tenga agradece cuatro
/// líneas antes que veinte de otro.
fn agents_template(name: &str) -> String {
    if let Some(tuya) = plantilla_propia(name) {
        return tuya;
    }
    format!(
        "# AGENTS.md — {name}\n\n\
> Cómo se trabaja en este proyecto. Lo leen los agentes al empezar, así que lo\n\
> que pongas aquí les vale de instrucciones. Creado desde Adeorq: cámbialo a tu\n\
> gusto, y si quieres que TODOS tus proyectos nuevos nazcan con tus normas,\n\
> déjalas en `%LOCALAPPDATA%\\Adeorq\\plantilla-agents.md`.\n\n\
## Reglas\n\n\
- Confirmar qué se ha entendido antes de ponerse: si hay dos lecturas, preguntar.\n\
- Lo mínimo que resuelve el problema, y tocar solo lo que se ha pedido.\n\
- Ni una clave ni un token en el repositorio; el `.env` fuera de git.\n\
- Commits en inglés y preguntar antes de subir nada.\n\
- Al terminar: qué se ha hecho en una frase, y debajo lo que viene después.\n\n\
## Qué hay aquí\n\n\
- (para qué es este proyecto, y con qué está hecho)\n\n\
## Cómo se arranca\n\n\
- (los comandos del día a día)\n"
    )
}

fn metas_template(name: &str) -> String {
    format!(
        "# METAS de {name}\n\n\
> Metas, no fechas. Una meta se cierra cuando su \"hecho cuando\" se cumple de verdad.\n\n\
## META 1 — (por definir) 🎯\n\n\
**Hecho cuando:** defínelo en la primera sesión, antes de escribir código.\n\n\
## 🅿️ Aparcadero\n\n\
- (lo que espera, cada cosa con su condición de desbloqueo)\n"
    )
}

const GITIGNORE_TEMPLATE: &str = "\
# El buzon entre sesiones: recados de una sesion a la siguiente. Es efimero y\n\
# local, asi que no tiene por que quedar en el historial de nadie.\n\
BUZON.md\n\n\
node_modules/\n\
dist/\n\
.env\n\
.env.*\n";

#[tauri::command(async)]
pub fn create_project(name: String, raiz: Option<String>) -> Result<CreatedProject, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("El nombre está vacío".into());
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == ' ' || c == '.')
    {
        return Err("Usa solo letras, números, espacios, guiones o puntos".into());
    }
    let base = raiz_de(raiz);
    let path = base.join(trimmed);
    if path.exists() {
        return Err(format!("Ya existe {}", path.display()));
    }

    std::fs::create_dir_all(path.join("docs")).map_err(|e| e.to_string())?;
    std::fs::write(path.join("AGENTS.md"), agents_template(trimmed)).map_err(|e| e.to_string())?;
    std::fs::write(path.join("docs").join("METAS.md"), metas_template(trimmed))
        .map_err(|e| e.to_string())?;
    std::fs::write(path.join(".gitignore"), GITIGNORE_TEMPLATE).map_err(|e| e.to_string())?;

    let has_git = std::process::Command::new("git")
        .args(["init", "-b", "main"])
        .current_dir(&path)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    Ok(CreatedProject {
        name: trimmed.to_owned(),
        path: path.to_string_lossy().into_owned(),
        has_git,
    })
}

/// El papel común de un reparto, en el `BUZON.md` del proyecto.
///
/// Ese archivo es el sitio que la casa ya usa para que las sesiones se hablen
/// entre ellas (regla Q). Es EFÍMERO Y LOCAL: no se versiona jamás, así que
/// antes de escribirlo se comprueba que el `.gitignore` lo tapa y, si no, se
/// añade. Sin eso, el primer `git add` del día se llevaría al repositorio el
/// reparto entero, con las rutas de la máquina de quien lo abrió.
///
/// Lo que hubiera antes se conserva debajo, bajo una raya: el buzón puede tener
/// recados de otra sesión sin leer, y pisarlos sería justo lo contrario de para
/// lo que existe.
#[tauri::command]
pub async fn escribir_buzon(proyecto: String, texto: String) -> Result<String, String> {
    let dir = Path::new(&proyecto);
    if !dir.is_dir() {
        return Err(format!("No existe {proyecto}"));
    }
    asegurar_ignorado(dir)?;

    let buzon = dir.join("BUZON.md");
    let anterior = crate::leer_para_reescribir(&buzon)?;
    let mut nuevo = texto;
    if !anterior.trim().is_empty() {
        nuevo.push_str("\n---\n\n## Lo que había antes en el buzón\n\n");
        nuevo.push_str(anterior.trim());
        nuevo.push('\n');
    }
    std::fs::write(&buzon, nuevo).map_err(|e| e.to_string())?;
    Ok(buzon.to_string_lossy().into_owned())
}

/// Que `BUZON.md` esté en el `.gitignore`, creándolo si hace falta.
fn asegurar_ignorado(dir: &Path) -> Result<(), String> {
    let gi = dir.join(".gitignore");
    let actual = crate::leer_para_reescribir(&gi)?;
    if actual.lines().any(|l| l.trim() == "BUZON.md") {
        return Ok(());
    }
    let mut texto = actual;
    if !texto.is_empty() && !texto.ends_with('\n') {
        texto.push('\n');
    }
    texto.push_str("\n# Buzon entre sesiones: efimero y local, nunca historial\nBUZON.md\n");
    std::fs::write(&gi, texto).map_err(|e| e.to_string())
}

/// The guide ships INSIDE the installer (`bundle.resources`). It used to be
/// read from `C:\proyectos\Adeorq\docs\GUIA.md`, an absolute path on Munir's
/// disk: on anybody else's computer that file is not there, so the Guide tab
/// opened with an error on every fresh install. The repo copy stays as the
/// fallback so `tauri dev` keeps showing edits without rebuilding.
fn guide_file(app: &tauri::AppHandle, name: &str) -> Option<PathBuf> {
    if let Ok(p) = app
        .path()
        .resolve(format!("docs/{name}"), BaseDirectory::Resource)
    {
        if p.is_file() {
            return Some(p);
        }
    }
    let repo = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()?
        .join("docs")
        .join(name);
    repo.is_file().then_some(repo)
}

#[tauri::command]
pub async fn read_guide(app: tauri::AppHandle, lang: Option<String>) -> Result<String, String> {
    // English readers get GUIDE.en.md; if it is missing, Spanish still shows.
    if lang.as_deref() == Some("en") {
        if let Some(en) = guide_file(&app, "GUIDE.en.md") {
            if let Ok(text) = std::fs::read_to_string(&en) {
                return Ok(text);
            }
        }
    }
    let es = guide_file(&app, "GUIA.md").ok_or("No encuentro la guía")?;
    std::fs::read_to_string(&es).map_err(|e| e.to_string())
}

/// Dónde está la guía en ESTE equipo, para dársela a leer a un agente (el
/// botón «Que me la explique mi agente» de Ajustes › Ayuda). La misma regla
/// que `read_guide`: la inglesa si se pide y está, y si no la española.
#[tauri::command]
pub async fn guide_path(app: tauri::AppHandle, lang: Option<String>) -> Result<String, String> {
    let pedida = if lang.as_deref() == Some("en") { "GUIDE.en.md" } else { "GUIA.md" };
    guide_file(&app, pedida)
        .or_else(|| guide_file(&app, "GUIA.md"))
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| "No encuentro la guía".to_owned())
}

#[cfg(test)]
mod tests {
    /// Dentro de la carpeta de proyectos es dentro por trozos de ruta, no por
    /// texto: `proyectos-copia` empieza igual que `proyectos` y no está dentro.
    #[test]
    fn una_carpeta_hermana_no_esta_dentro_de_los_proyectos() {
        let base = std::env::temp_dir().join(format!("adeorq-raiz-{}", std::process::id()));
        let raiz = base.join("proyectos");
        std::fs::create_dir_all(raiz.join("uno")).unwrap();
        std::fs::create_dir_all(base.join("proyectos-copia").join("dos")).unwrap();
        let en = |r: std::path::PathBuf| super::en_la_raiz(&raiz, &r.to_string_lossy()).map(|_| ());
        let dentro = en(raiz.join("uno"));
        let la_raiz = en(raiz.clone());
        let hermana = en(base.join("proyectos-copia").join("dos"));
        let _ = std::fs::remove_dir_all(&base);
        assert!(dentro.is_ok() && la_raiz.is_ok());
        assert!(hermana.is_err(), "la carpeta hermana contó como dentro");
    }

    /// PowerShell 5.1 escribe en ANSI con `Add-Content` sin `-Encoding`, y eso
    /// no es UTF-8: el `.gitignore` se leía como vacío y se reescribía con SOLO
    /// `BUZON.md`, y el `.env` dejaba de estar ignorado.
    #[test]
    fn un_gitignore_que_no_es_utf8_no_se_pisa() {
        let dir = std::env::temp_dir().join(format!("adeorq-gitignore-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let antes: &[u8] = b".env\n# configuraci\xf3n\nnode_modules\n";
        std::fs::write(dir.join(".gitignore"), antes).unwrap();
        let r = super::asegurar_ignorado(&dir);
        let despues = std::fs::read(dir.join(".gitignore")).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        assert!(despues.starts_with(antes), "se perdió lo que había: {:?}", String::from_utf8_lossy(&despues));
        assert!(r.is_err());
    }
}
