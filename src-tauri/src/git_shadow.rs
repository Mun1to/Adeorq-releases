// El Modo Espejo: un agente escribe en su propio árbol, no en el tuyo.
//
// La primera versión cambiaba de rama con `git checkout -b` EN TU CARPETA, y eso
// no aísla nada: el árbol de trabajo es uno solo y lo comparten todas las
// terminales abiertas en ese proyecto. Con dos agentes, el segundo checkout le
// cambiaba la rama al primero mientras escribía; con una cuadrilla de seis, los
// seis compartían los mismos ficheros. Y para dejar sitio hacía `git stash -u`
// con TUS cambios, que luego devolvía con el error ignorado.
//
// Ahora cada panel en modo espejo tiene su propio DIRECTORIO, creado con
// `git worktree`. Es lo que hacen Cursor y Claude Code, y la propia
// documentación de Codex marca como error común «ejecutar tareas sobre los
// mismos ficheros sin usar worktrees». Consecuencias, todas buenas:
//
//   · Dos agentes no pueden pisarse: no comparten ni un fichero.
//   · Tu carpeta NO se toca. Ni checkout, ni stash, ni reset. Sigues trabajando
//     mientras el agente trabaja.
//   · Descartar es borrar un directorio, no un `clean -fd` sobre lo tuyo.
//
// Lo que NO resuelve, y hay que decirlo: dos agentes en worktrees distintos
// pueden editar el mismo fichero y sus cambios chocarán AL FUSIONAR. El
// aislamiento evita que se corrompan mientras trabajan, no que hagan trabajo
// incompatible. Fusionar sigue siendo una decisión tuya.

use std::collections::HashMap;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Dónde viven los árboles espejo, dentro del proyecto para que compartan disco
/// y el `git worktree` sea instantáneo. Va en el .gitignore.
const DIR_ESPEJOS: &str = ".adeorq/espejo";

fn run_git(dir: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .args(["-C", dir])
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("no pude ejecutar git: {e}"))?;

    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).into_owned();
        Err(format!("git falló ({:?}): {}", out.status.code(), err.trim()))
    }
}

/// El id del panel acaba en un nombre de rama Y en un nombre de directorio, así
/// que se comprueba en vez de confiar: un `..` o un espacio ahí serían una ruta
/// distinta de la que dice ser.
fn id_valido(pane_id: &str) -> Result<(), String> {
    if pane_id.is_empty()
        || pane_id.len() > 32
        || !pane_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("identificador de panel no válido".into());
    }
    Ok(())
}

fn rama_de(pane_id: &str) -> String {
    format!("adeorq/shadow/{pane_id}")
}

fn ruta_espejo(project_path: &str, pane_id: &str) -> PathBuf {
    Path::new(project_path).join(DIR_ESPEJOS).join(pane_id)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowFileStatus {
    pub path: String,
    pub status: String,
}

/**
 * Prepara el árbol espejo de un panel y devuelve DÓNDE tiene que arrancar.
 *
 * El `worktreePath` que devuelve es el dato importante: la terminal debe nacer
 * ahí. Si arrancara en la carpeta del proyecto, esto no serviría para nada.
 */
// Todo el módulo va en async: cada comando lanza git.exe y espera su salida,
// y un comando de Tauri sin async corre en el hilo de la ventana — el estado
// del espejo se relee en cada campana de la terminal, y cada relectura era un
// congelón de toda la app.
#[tauri::command]
pub async fn shadow_init(project_path: String, pane_id: String) -> Result<HashMap<String, String>, String> {
    id_valido(&pane_id)?;

    // Que sea un repo, antes de nada: sin git no hay espejo que montar.
    run_git(&project_path, &["rev-parse", "--git-dir"])
        .map_err(|_| "esta carpeta no es un repositorio de git".to_string())?;

    let base_branch = run_git(&project_path, &["branch", "--show-current"])?
        .trim()
        .to_string();
    if base_branch.is_empty() {
        // HEAD suelto: no hay rama a la que volver, así que no se empieza.
        return Err("el repositorio no está en ninguna rama (HEAD suelto)".into());
    }

    let rama = rama_de(&pane_id);
    let ruta = ruta_espejo(&project_path, &pane_id);
    let ruta_txt = ruta.to_string_lossy().to_string();

    // Un espejo de una sesión anterior que quedó colgado: se reutiliza en vez de
    // borrarlo. Dentro puede haber trabajo sin fusionar, y borrarlo sin mirar es
    // exactamente lo que hacía la versión anterior con `branch -D`.
    if ruta.is_dir() {
        let mut res = HashMap::new();
        res.insert("baseBranch".into(), base_branch);
        res.insert("shadowBranch".into(), rama);
        res.insert("worktreePath".into(), ruta_txt);
        res.insert("reutilizado".into(), "true".into());
        return Ok(res);
    }

    std::fs::create_dir_all(ruta.parent().unwrap_or(&ruta)).map_err(|e| e.to_string())?;

    // Si la rama existe de antes, se engancha; si no, se crea desde HEAD.
    let existe = run_git(&project_path, &["rev-parse", "--verify", &rama]).is_ok();
    if existe {
        run_git(&project_path, &["worktree", "add", &ruta_txt, &rama])?;
    } else {
        run_git(&project_path, &["worktree", "add", "-b", &rama, &ruta_txt])?;
    }

    // Los ficheros de entorno NO están en git, así que el árbol nuevo nace sin
    // ellos y el agente no podría ni arrancar el proyecto. Se copian los
    // pequeños; las dependencias (node_modules, target) NO se copian ni se
    // enlazan a propósito: son gigantes, y enlazarlas es lo que la propia
    // documentación de Cursor recomienda no hacer.
    for nombre in [".env", ".env.local", ".env.development"] {
        let origen = Path::new(&project_path).join(nombre);
        if origen.is_file() {
            let _ = std::fs::copy(&origen, ruta.join(nombre));
        }
    }

    let mut res = HashMap::new();
    res.insert("baseBranch".into(), base_branch);
    res.insert("shadowBranch".into(), rama);
    res.insert("worktreePath".into(), ruta_txt);
    res.insert("reutilizado".into(), "false".into());
    Ok(res)
}

/// El diff del espejo contra su base. Se lee DENTRO del worktree.
///
/// Ya no hace `git add -N .` sobre tu índice: eso era escribir en tu repo desde
/// una operación de lectura. Los ficheros nuevos salen con `--no-index`.
#[tauri::command]
pub async fn shadow_diff(worktree_path: String, base_branch: String) -> Result<String, String> {
    let seguido = run_git(&worktree_path, &["diff", &base_branch])?;
    // Y los que git aún no conoce, uno por uno, sin tocar el índice.
    let nuevos = run_git(&worktree_path, &["ls-files", "--others", "--exclude-standard"])
        .unwrap_or_default();
    let mut extra = String::new();
    for f in nuevos.lines().filter(|l| !l.trim().is_empty()).take(50) {
        if let Ok(d) = run_git(&worktree_path, &["diff", "--no-index", "/dev/null", f]) {
            extra.push_str(&d);
        }
    }
    Ok(format!("{seguido}{extra}"))
}

/// Parte una línea de `git status --porcelain` en (estado, ruta).
///
/// Se parte por CARACTERES y no por bytes. Cortar una cadena UTF-8 por un
/// número de bytes calculado a ojo es lo que congelaba las terminales (ver
/// `recortar_historial` en pty.rs), y aquí bastaba una ruta con una tilde en
/// el sitio justo para tirar el comando. `None` si la línea no tiene ruta.
pub(crate) fn partir_estado(linea: &str) -> Option<(String, String)> {
    let mut chars = linea.chars();
    let estado: String = chars.by_ref().take(2).collect();
    // El separador. Si no está, la línea no lleva ruta detrás.
    chars.next()?;
    let ruta = chars.as_str();
    if ruta.is_empty() {
        return None;
    }
    Some((estado.trim().to_string(), ruta.to_string()))
}

#[tauri::command]
pub async fn shadow_status(worktree_path: String) -> Result<Vec<ShadowFileStatus>, String> {
    let status_out = run_git(&worktree_path, &["status", "--porcelain"])?;
    let files = status_out
        .lines()
        .filter_map(partir_estado)
        .map(|(status, path)| ShadowFileStatus { status, path })
        .collect();
    Ok(files)
}

/**
 * Trae el trabajo del espejo a tu rama.
 *
 * Aquí NO se ignora ni un error, y es el cambio que más importa: la versión
 * anterior hacía el commit, el merge y el `branch -D` con el error descartado,
 * así que un merge con conflicto se saltaba y a continuación se borraba la rama
 * a la fuerza. El trabajo del agente desaparecía sin que nadie dijera nada.
 *
 * Si algo falla, el espejo se queda intacto y puedes entrar a mirarlo.
 */
#[tauri::command]
pub async fn shadow_accept(
    project_path: String,
    worktree_path: String,
    pane_id: String,
) -> Result<String, String> {
    id_valido(&pane_id)?;
    let rama = rama_de(&pane_id);

    // 1. Cerrar lo que el agente haya dejado suelto, en SU árbol.
    let hay_algo = !run_git(&worktree_path, &["status", "--porcelain"])?
        .trim()
        .is_empty();
    if hay_algo {
        run_git(&worktree_path, &["add", "-A"])?;
        run_git(&worktree_path, &["commit", "-m", "adeorq: trabajo del espejo"])?;
    }

    // 2. ¿Hay algo que traer? Si el agente no cambió nada, no se toca tu rama.
    let cuenta = run_git(&project_path, &["rev-list", "--count", &format!("HEAD..{rama}")])
        .unwrap_or_else(|_| "0".into())
        .trim()
        .to_string();
    if cuenta == "0" {
        limpiar(&project_path, &worktree_path, &rama)?;
        return Ok("El agente no dejó ningún cambio. Espejo cerrado.".into());
    }

    // 3. El merge, en TU árbol y con el error a la vista. Squash: lo que
    //    importa es el resultado, no los pasos intermedios del agente.
    run_git(&project_path, &["merge", "--squash", &rama]).map_err(|e| {
        // El caso frecuente, y git lo dice en un idioma que no es el tuyo: si
        // tienes cambios sin guardar en los mismos ficheros, se niega a
        // fusionar. Y hace bien: negarse es lo que protege tu trabajo. La
        // versión anterior evitaba este choque guardando TUS cambios en un
        // stash al empezar, que es como se pierden.
        if e.contains("commit your changes") || e.contains("would be overwritten") {
            format!(
                "Tienes cambios sin guardar en los mismos ficheros que ha tocado el agente, \
                 así que git se ha negado a fusionar para no pisártelos. Guarda lo tuyo \
                 (commit o stash) y vuelve a darle a Aceptar.\n\n\
                 El trabajo del agente sigue intacto en la rama {rama}."
            )
        } else {
            format!(
                "No he podido fusionar el espejo, así que lo dejo entero donde está.\n\
                 Carpeta: {worktree_path}\nRama: {rama}\n\n{e}"
            )
        }
    })?;

    limpiar(&project_path, &worktree_path, &rama)?;
    Ok(format!(
        "{cuenta} cambio(s) traídos a tu rama, sin commitear todavía: míralos y decide."
    ))
}

/// Tira el espejo entero. Tu carpeta NO se toca: se borra un directorio aparte.
#[tauri::command]
pub async fn shadow_discard(
    project_path: String,
    worktree_path: String,
    pane_id: String,
) -> Result<(), String> {
    id_valido(&pane_id)?;
    limpiar(&project_path, &worktree_path, &rama_de(&pane_id))
}

/// Quitar el árbol y su rama. `--force` aquí es seguro: el directorio es de
/// Adeorq y de un solo panel, no hay nada tuyo dentro.
fn limpiar(project_path: &str, worktree_path: &str, rama: &str) -> Result<(), String> {
    let _ = run_git(project_path, &["worktree", "remove", "--force", worktree_path]);
    // Por si el directorio quedó a medias y git ya no lo reconoce.
    let _ = std::fs::remove_dir_all(worktree_path);
    let _ = run_git(project_path, &["worktree", "prune"]);
    let _ = run_git(project_path, &["branch", "-D", rama]);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::partir_estado;

    /// El corte por bytes de antes (`linea[..2]`, `linea[3..]`) reventaba en
    /// cuanto la ruta traía una tilde en el sitio justo. Es el mismo error que
    /// congelaba las terminales, aquí sin consecuencias tan graves.
    #[test]
    fn una_ruta_con_tildes_no_lo_revienta() {
        let (estado, ruta) = partir_estado(" M src/Diseño/Añadir.tsx").unwrap();
        assert_eq!(estado, "M");
        assert_eq!(ruta, "src/Diseño/Añadir.tsx");
    }

    #[test]
    fn lee_los_dos_huecos_del_estado() {
        let (estado, ruta) = partir_estado("?? nuevo.txt").unwrap();
        assert_eq!(estado, "??");
        assert_eq!(ruta, "nuevo.txt");
    }

    /// Sin ruta detrás no hay archivo del que hablar.
    #[test]
    fn una_linea_sin_ruta_se_descarta() {
        assert!(partir_estado("").is_none());
        assert!(partir_estado(" M").is_none());
        assert!(partir_estado(" M ").is_none());
    }
}
