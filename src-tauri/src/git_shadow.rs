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
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use crate::SinVentana;


/// Dónde viven los árboles espejo, dentro del proyecto para que compartan disco
/// y el `git worktree` sea instantáneo. Va en el .gitignore.
const DIR_ESPEJOS: &str = ".adeorq/espejo";

fn run_git(dir: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .args(["-C", dir])
        .args(args)
        .sin_ventana()
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

/// Que `worktree_path` sea el espejo de ESE panel en ESE proyecto y ninguna
/// otra carpeta. Aceptar y tirar acaban en `remove_dir_all`, que no pasa por la
/// papelera, y la ruta llega del front: con la del proyecto, se lo llevaba.
fn espejo_de(project_path: &str, worktree_path: &str, pane_id: &str) -> Result<(), String> {
    if Path::new(worktree_path) != ruta_espejo(project_path, pane_id) {
        return Err(format!("«{worktree_path}» no es el espejo de este panel, así que no lo toco."));
    }
    Ok(())
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
    let base_branch = rama_base(&project_path)?;

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
    fuera_de_tu_git(&project_path);

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
    for nombre in COPIADOS {
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

/// La rama de la que nacería un espejo, o por qué no se puede montar: sin repo
/// no hay espejo, y con HEAD suelto no hay rama a la que volver.
///
/// Y el repo tiene que ser SUYO: `C:\proyectos` es un repo, y una carpeta de
/// dentro sin repo propio (Moneorq, `_docs`…) pasaba el `rev-parse`, así que el
/// `worktree add` copiaba `C:\proyectos` entero, sin sus ficheros, y Aceptar
/// fusionaba en la rama del de fuera (revisión del 2026-11-15).
fn rama_base(project_path: &str) -> Result<String, String> {
    let raiz = run_git(project_path, &["rev-parse", "--show-toplevel"])
        .map_err(|_| "esta carpeta no es un repositorio de git".to_string())?;
    if !misma_carpeta(raiz.trim(), project_path) {
        return Err(format!("esta carpeta no tiene su propio repositorio de git (está dentro del de {})", raiz.trim()));
    }
    let rama = run_git(project_path, &["branch", "--show-current"])?.trim().to_string();
    if rama.is_empty() {
        return Err("el repositorio no está en ninguna rama (HEAD suelto)".into());
    }
    Ok(rama)
}

/// Que `.adeorq/` no salga en TU `git status`. Va al `info/exclude` del repo,
/// que no se versiona: tu `.gitignore` no se toca. Sin esto, un proyecto que no
/// lo ignora enseña `?? .adeorq/`, y un `git add .` despistado mete el árbol
/// del espejo como un repo dentro de otro.
fn fuera_de_tu_git(project_path: &str) {
    use std::io::Write;
    let Ok(comun) = run_git(project_path, &["rev-parse", "--path-format=absolute", "--git-common-dir"]) else {
        return;
    };
    let excluir = Path::new(comun.trim()).join("info").join("exclude");
    // Uno que no se puede leer (otra codificación) no se toca: reescribirlo
    // como vacío se llevaba lo que tenías. Se AÑADE al final, nunca se reescribe.
    let hay = match std::fs::read(&excluir) {
        Ok(b) => String::from_utf8_lossy(&b).into_owned(),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(_) => return,
    };
    if hay.lines().any(|l| matches!(l.trim(), ".adeorq" | ".adeorq/" | "/.adeorq" | "/.adeorq/")) {
        return;
    }
    let _ = std::fs::create_dir_all(excluir.parent().unwrap_or(&excluir));
    let salto = if hay.is_empty() || hay.ends_with('\n') { "" } else { "\n" };
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&excluir) {
        let _ = write!(f, "{salto}/.adeorq/\n");
    }
}

/// La misma carpeta, venga como venga escrita: git la da con `/` y Windows con
/// `\`, y una unidad hecha con `subst` se compara por lo que es de verdad.
fn misma_carpeta(a: &str, b: &str) -> bool {
    let plano = |s: &str| s.replace('\\', "/").trim_end_matches('/').to_lowercase();
    if plano(a) == plano(b) {
        return true;
    }
    matches!((std::fs::canonicalize(a), std::fs::canonicalize(b)), (Ok(x), Ok(y)) if x == y)
}

/// Lo que Adeorq copió al montar el espejo (`shadow_init`): suelto en un
/// proyecto que no lo ignora, no es trabajo del agente.
const COPIADOS: [&str; 3] = [".env", ".env.local", ".env.development"];

/// Si en esta carpeta se puede montar un espejo, antes de abrir la terminal:
/// una que nace sin él cuando lo pidió no se abre (`TerminalPane`), y un
/// encargo de la noche en una carpeta sin git tiene que nacer como siempre.
#[tauri::command]
pub async fn shadow_disponible(project_path: String) -> Result<String, String> {
    rama_base(&project_path)
}

/// Lo que el espejo tiene sin aceptar: ficheros sueltos y commits que su rama
/// lleva por delante de la base. Los dos cuentan: un agente que hace commit en
/// su árbol deja el `status` limpio y el trabajo entero en la rama.
#[derive(Serialize)]
pub struct Pendiente {
    pub sueltos: usize,
    pub commits: usize,
}

#[tauri::command]
pub async fn shadow_pendiente(worktree_path: String, base_branch: String) -> Result<Pendiente, String> {
    // Borrada a mano: no queda nada que aceptar, y sin esto esa terminal no se
    // podía cerrar nunca.
    if !Path::new(&worktree_path).is_dir() {
        return Ok(Pendiente { sueltos: 0, commits: 0 });
    }
    let sueltos = run_git(&worktree_path, &["--no-optional-locks", "status", "--porcelain"])?
        .lines()
        .filter_map(partir_estado)
        .filter(|(estado, ruta)| !(estado == "??" && COPIADOS.contains(&ruta.as_str())))
        .count();
    let commits = run_git(&worktree_path, &["rev-list", "--count", &format!("{base_branch}..HEAD")])?
        .trim()
        .parse()
        .unwrap_or(0);
    Ok(Pendiente { sueltos, commits })
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
pub async fn shadow_status(worktree_path: String, base_branch: Option<String>) -> Result<Vec<ShadowFileStatus>, String> {
    // Se relee en cada campana del panel, dentro del árbol donde el agente hace
    // sus commits: sin coger su `index.lock`.
    let status_out = run_git(&worktree_path, &["--no-optional-locks", "status", "--porcelain"])?;
    let mut files: Vec<ShadowFileStatus> = status_out
        .lines()
        .filter_map(partir_estado)
        .map(|(status, path)| ShadowFileStatus { status, path })
        .collect();
    // Y lo que ya guardó en commits de su rama, que el `status` no ve: un agente
    // que hace commit en su árbol (el de la noche lo hace) dejaba la lista en
    // cero con todo su trabajo dentro.
    if let Some(base) = base_branch.filter(|b| !b.is_empty()) {
        let hechos = run_git(&worktree_path, &["diff", "--name-status", &format!("{base}...HEAD")]).unwrap_or_default();
        for (status, path) in hechos.lines().filter_map(partir_hecho) {
            if !files.iter().any(|f| f.path == path) {
                files.push(ShadowFileStatus { status, path });
            }
        }
    }
    Ok(files)
}

/// Una línea de `git diff --name-status`: «M\truta», o «R100\tvieja\tnueva» en
/// un renombre, que cuenta por la nueva.
pub(crate) fn partir_hecho(linea: &str) -> Option<(String, String)> {
    let (estado, resto) = linea.split_once('\t')?;
    let ruta = resto.rsplit('\t').next()?.trim();
    let letra: String = estado.chars().take(1).collect();
    (!ruta.is_empty() && !letra.is_empty()).then(|| (letra, ruta.to_string()))
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
    espejo_de(&project_path, &worktree_path, &pane_id)?;
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
    espejo_de(&project_path, &worktree_path, &pane_id)?;
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
    use super::{partir_estado, partir_hecho};

    #[test]
    fn lo_guardado_en_commits_cuenta_por_su_ruta_nueva() {
        assert_eq!(partir_hecho("M\tsrc/Añadir.tsx"), Some(("M".into(), "src/Añadir.tsx".into())));
        assert_eq!(partir_hecho("R087\tviejo.txt\tnuevo.txt"), Some(("R".into(), "nuevo.txt".into())));
        assert_eq!(partir_hecho("A\t"), None);
        assert_eq!(partir_hecho(""), None);
    }

    /// Un repo de verdad en `%TEMP%`: el espejo nace, el agente deja un fichero
    /// suelto y un commit, y los dos cuentan como pendientes; tu `git status`
    /// no enseña `.adeorq/` aunque el proyecto no lo ignore.
    #[test]
    fn el_espejo_cuenta_lo_suelto_y_lo_guardado_y_no_ensucia_tu_status() {
        use std::process::Command;
        let dir = std::env::temp_dir().join(format!("adeorq-pendiente-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_string_lossy().into_owned();
        let git = |d: &str, args: &[&str]| {
            let ok = Command::new("git").args(["-C", d, "-c", "user.name=lab", "-c", "user.email=lab@lab"]).args(args).status().unwrap().success();
            assert!(ok, "git {args:?}");
        };
        git(&p, &["init", "-q", "-b", "main"]);
        std::fs::write(dir.join("a.txt"), "uno").unwrap();
        git(&p, &["add", "a.txt"]);
        git(&p, &["commit", "-q", "-m", "base"]);
        // Un `.env` que el proyecto no ignora: Adeorq lo copia, y no es trabajo del agente.
        std::fs::write(dir.join(".env"), "CLAVE=x").unwrap();
        // Y una carpeta de dentro sin repo propio, como Moneorq en `C:\proyectos`.
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        let dentro = tauri::async_runtime::block_on(super::shadow_disponible(dir.join("sub").to_string_lossy().into_owned()));

        assert_eq!(tauri::async_runtime::block_on(super::shadow_disponible(p.clone())).unwrap(), "main");
        let s = tauri::async_runtime::block_on(super::shadow_init(p.clone(), "9-lab".into())).unwrap();
        let arbol = s["worktreePath"].clone();
        let pend = |a: &str| tauri::async_runtime::block_on(super::shadow_pendiente(a.into(), "main".into())).unwrap();
        let al_nacer = (pend(&arbol).sueltos, pend(&arbol).commits);

        std::fs::write(std::path::Path::new(&arbol).join("b.txt"), "dos").unwrap();
        assert_eq!(pend(&arbol).sueltos, 1);
        git(&arbol, &["add", "b.txt"]);
        git(&arbol, &["commit", "-q", "-m", "del agente"]);
        let (sueltos, commits) = (pend(&arbol).sueltos, pend(&arbol).commits);
        let lista = tauri::async_runtime::block_on(super::shadow_status(arbol.clone(), Some("main".into()))).unwrap();
        let tuyo = Command::new("git").args(["-C", &p, "status", "--porcelain"]).output().unwrap();
        let tuyo = String::from_utf8_lossy(&tuyo.stdout).into_owned();
        let _ = tauri::async_runtime::block_on(super::shadow_discard(p.clone(), arbol.clone(), "9-lab".into()));
        let tirado = (pend(&arbol).sueltos, pend(&arbol).commits);
        let _ = std::fs::remove_dir_all(&dir);

        assert!(dentro.as_ref().is_err_and(|e| e.contains("propio repositorio")), "una carpeta sin repo propio no tiene espejo: {dentro:?}");
        assert_eq!(al_nacer, (0, 0), "lo que copia Adeorq al nacer no cuenta como trabajo");
        assert_eq!(tirado, (0, 0), "una copia que ya no está no deja nada pendiente");
        assert_eq!((sueltos, commits), (0, 1), "el commit del agente cuenta aunque el status esté limpio");
        assert!(lista.iter().any(|f| f.path == "b.txt"), "la lista enseña lo que ya está en commits");
        assert!(!tuyo.contains(".adeorq"), "tu status enseña el espejo: {tuyo}");
    }

    #[test]
    fn sin_repo_no_hay_espejo() {
        let dir = std::env::temp_dir().join(format!("adeorq-sin-git-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let r = tauri::async_runtime::block_on(super::shadow_disponible(dir.to_string_lossy().into_owned()));
        let _ = std::fs::remove_dir_all(&dir);
        assert!(r.unwrap_err().contains("no es un repositorio"));
    }

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

    /// Tirar el espejo borra su carpeta con `remove_dir_all`, sin papelera, y
    /// la ruta llega del front: si llegara la del proyecto, se lo llevaba entero.
    #[test]
    fn tirar_el_espejo_no_borra_una_carpeta_que_no_es_el_espejo() {
        let dir = std::env::temp_dir().join(format!("adeorq-espejo-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("tuyo.txt"), "trabajo").unwrap();
        let p = dir.to_string_lossy().into_owned();

        let r = tauri::async_runtime::block_on(super::shadow_discard(p.clone(), p.clone(), "7".into()));
        let sigue = dir.join("tuyo.txt").exists();
        let _ = std::fs::remove_dir_all(&dir);
        assert!(sigue, "borró la carpeta del proyecto");
        assert!(r.is_err());

        // El espejo de verdad sí pasa, escrito como lo devuelve `shadow_init`.
        let espejo = super::ruta_espejo(&p, "7").to_string_lossy().into_owned();
        assert!(super::espejo_de(&p, &espejo, "7").is_ok());
        assert!(super::espejo_de(&p, &espejo, "8").is_err());
    }
}
