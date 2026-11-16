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
    let candado = candado_de(&ruta);
    let _turno = candado.lock().unwrap_or_else(|e| e.into_inner());

    // Un espejo de una sesión anterior que quedó colgado: se reutiliza en vez de
    // borrarlo. Dentro puede haber trabajo sin fusionar, y borrarlo sin mirar es
    // exactamente lo que hacía la versión anterior con `branch -D`. Pero solo si
    // sigue siendo una copia de git: la que Windows no dejó borrar al aceptarla
    // o tirarla no lo es, y dentro el git del agente subía hasta tu repo.
    if ruta.is_dir() {
        if copia_viva(&ruta) {
            let mut res = HashMap::new();
            res.insert("baseBranch".into(), base_branch);
            res.insert("shadowBranch".into(), rama);
            res.insert("worktreePath".into(), ruta_txt);
            res.insert("reutilizado".into(), "true".into());
            return Ok(res);
        }
        despejar(&ruta)?;
    }

    std::fs::create_dir_all(ruta.parent().unwrap_or(&ruta)).map_err(|e| e.to_string())?;
    fuera_de_tu_git(&project_path);

    // Si la rama existe de antes, se engancha; si no, se crea desde HEAD.
    let existe = run_git(&project_path, &["rev-parse", "--verify", &rama]).is_ok();
    let montada = if existe {
        run_git(&project_path, &["worktree", "add", &ruta_txt, &rama])
    } else {
        run_git(&project_path, &["worktree", "add", "-b", &rama, &ruta_txt])
    };
    // La carpeta puede seguir ahí, cogida por el agente de antes: sin copia
    // encima, que su git no llegue al tuyo.
    if let Err(e) = montada {
        tapar(&ruta);
        return Err(e);
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
    // Sin rama de antes, no lleva trabajo: si la terminal se cerró mientras se
    // montaba, la ventana la tira (`copiaSinEstrenar`).
    res.insert("nueva".into(), (!existe).to_string());
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
    // Borrada a mano, o aceptada o tirada con el agente dentro (`limpiar`): no
    // queda nada que aceptar, y sin esto esa terminal no se podía cerrar nunca.
    // En la segunda, el `status` de abajo contaba lo tuyo sin guardar.
    if !copia_viva(Path::new(&worktree_path)) {
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
    // Sin su `.git`, el `add -A` y el `commit` de abajo caerían en TU repo, con
    // lo tuyo sin guardar dentro.
    if !copia_viva(Path::new(&worktree_path)) {
        return Err(format!("«{worktree_path}» ya no es una copia de git, así que no hay nada que aceptar."));
    }

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
    let candado = candado_de(&ruta_espejo(&project_path, &pane_id));
    let _turno = candado.lock().unwrap_or_else(|e| e.into_inner());
    limpiar(&project_path, &worktree_path, &rama_de(&pane_id))
}

/// Un candado por copia, para montarla o tirarla de una en una. Dos montajes del
/// mismo nombre a la vez (Ctrl+Z nada más cerrar la terminal, o un panel que se
/// vuelve a montar al caerse) fallaban los dos: el que perdía el `worktree add`
/// tapaba el `.git` del otro (medido en `dos_montajes_a_la_vez_de_la_misma_copia_no_la_tapan`).
/// Uno por carpeta y no uno para todas: montar copias distintas no espera.
fn candado_de(ruta: &Path) -> std::sync::Arc<std::sync::Mutex<()>> {
    static CANDADOS: std::sync::OnceLock<std::sync::Mutex<HashMap<PathBuf, std::sync::Arc<std::sync::Mutex<()>>>>> = std::sync::OnceLock::new();
    let mut candados = CANDADOS.get_or_init(Default::default).lock().unwrap_or_else(|e| e.into_inner());
    candados.entry(ruta.to_path_buf()).or_default().clone()
}

/// Quitar el árbol y su rama. `--force` aquí es seguro: el directorio es de
/// Adeorq y de un solo panel, no hay nada tuyo dentro.
fn limpiar(project_path: &str, worktree_path: &str, rama: &str) -> Result<(), String> {
    let _ = run_git(project_path, &["worktree", "remove", "--force", worktree_path]);
    // Por si el directorio quedó a medias y git ya no lo reconoce.
    let _ = std::fs::remove_dir_all(worktree_path);
    // En Windows la carpeta sigue si un programa trabaja dentro (el agente de
    // esta misma terminal, que la tiene de carpeta de trabajo): queda sin su
    // `.git`, y lo que siga corriendo ahí llegaría con git a tu repo de verdad.
    tapar(Path::new(worktree_path));
    let _ = run_git(project_path, &["worktree", "prune"]);
    let _ = run_git(project_path, &["branch", "-D", rama]);
    Ok(())
}

/// El `.git` que deja `limpiar` en una copia que no pudo borrar. Git no lo
/// entiende y se para ahí («invalid gitfile format»), en vez de subir hasta el
/// repo de fuera; y quien lo abra para ver qué pasa lee por qué.
const TAPON: &str = "Esta copia aparte ya se aceptó o se tiró en Adeorq: aquí no queda repositorio de git.\n";

fn tapada(ruta: &Path) -> bool {
    std::fs::read_to_string(ruta.join(".git")).is_ok_and(|t| t == TAPON)
}

fn tapar(ruta: &Path) {
    if ruta.is_dir() {
        let _ = std::fs::write(ruta.join(".git"), TAPON);
    }
}

/// Que la carpeta siga siendo la copia de git que montó `shadow_init`: su
/// `.git` es un fichero que apunta a una carpeta que existe. Sin preguntarle a
/// git, para que un git que no arranca no se lea como «aquí no hay nada».
fn copia_viva(ruta: &Path) -> bool {
    let Ok(texto) = std::fs::read_to_string(ruta.join(".git")) else {
        return false;
    };
    let Some(destino) = texto.trim().strip_prefix("gitdir:") else {
        return false;
    };
    let destino = Path::new(destino.trim());
    ruta.join(destino).is_dir()
}

/// Algo que no sea una carpeta, a cualquier profundidad. Un enlace cuenta como
/// fichero y no se sigue: podría apuntar fuera.
fn hay_ficheros(ruta: &Path) -> bool {
    let Ok(dentro) = std::fs::read_dir(ruta) else {
        return false;
    };
    dentro.flatten().any(|e| match e.file_type() {
        Ok(t) if t.is_dir() => hay_ficheros(&e.path()),
        _ => true,
    })
}

/// Un fichero más nuevo que `t`, sin contar el tapón y sin seguir enlaces.
fn escrito_despues(ruta: &Path, t: std::time::SystemTime) -> bool {
    let Ok(dentro) = std::fs::read_dir(ruta) else {
        return false;
    };
    dentro.flatten().any(|e| match e.file_type() {
        Ok(ft) if ft.is_dir() => escrito_despues(&e.path(), t),
        // La fecha, pidiéndosela al fichero: `DirEntry::metadata` en Windows es la
        // del listado de la carpeta, que NTFS pone al día tarde en un fichero que
        // alguien sigue escribiendo, y un log vivo parecería viejo. Sin poder
        // leerla cuenta como escrito después: dudar aquí es no borrarlo.
        _ => e.file_name() != ".git" && !std::fs::symlink_metadata(e.path()).and_then(|m| m.modified()).is_ok_and(|m| m <= t),
    })
}

/// La carpeta de un espejo que ya no es una copia de git, antes de montar otra
/// en su sitio. Con el tapón de `limpiar`, lo que quede dentro ya se aceptó o
/// se tiró y se borra; sin él no se sabe de quién es, así que no se toca. Si la
/// carpeta sigue cogida y vacía, `git worktree add` la acepta igual.
fn despejar(ruta: &Path) -> Result<(), String> {
    // Lo que el agente escribió DESPUÉS de cerrarla (su CLI sigue viva y nadie se
    // lo dice) no se ha aceptado ni tirado: eso tampoco se borra.
    let tapon = std::fs::metadata(ruta.join(".git")).and_then(|m| m.modified()).ok();
    if tapada(ruta) && tapon.is_some_and(|t| escrito_despues(ruta, t)) {
        return Err(format!(
            "En «{}» hay ficheros escritos después de aceptar o tirar esa copia, así que no la borro \
             para montar otra: míralos y borra esa carpeta si no te hacen falta.",
            ruta.display()
        ));
    }
    if !tapada(ruta) && hay_ficheros(ruta) {
        return Err(format!(
            "«{}» ya no es una copia de git y quedan ficheros dentro, así que no la uso: ahí el git \
             del agente llegaría a tu repo de verdad. Mira lo que hay y borra esa carpeta si no te hace falta.",
            ruta.display()
        ));
    }
    let _ = std::fs::remove_dir_all(ruta);
    let vacia = std::fs::read_dir(ruta).map_or(true, |mut d| d.next().is_none());
    if !vacia {
        tapar(ruta);
        return Err(format!(
            "«{}», de una copia anterior, sigue cogida por un programa (seguramente el agente que \
             trabajaba dentro): ciérralo y vuelve a abrir esta terminal.",
            ruta.display()
        ));
    }
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

    /// Tirar la copia con su agente aún dentro (su CLI tiene ahí su carpeta de
    /// trabajo): Windows no deja borrar esa carpeta, quedaba vacía y sin su
    /// `.git`, y el git de dentro subía hasta tu repo de verdad; al volver a
    /// abrir esa terminal, `shadow_init` la daba por copia (2026-11-16).
    #[test]
    fn una_copia_tirada_con_el_agente_dentro_no_deja_paso_a_tu_repo() {
        use std::process::{Command, Stdio};
        fn block_on<F: std::future::Future>(f: F) -> F::Output {
            tauri::async_runtime::block_on(f)
        }
        let dir = std::env::temp_dir().join(format!("adeorq-tapon-{}", std::process::id()));
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
        let raiz_de = |a: &str| {
            Command::new("git").args(["-C", a, "rev-parse", "--show-toplevel"]).output()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default()
        };

        let arbol = block_on(super::shadow_init(p.clone(), "4-lab".into())).unwrap()["worktreePath"].clone();
        // El agente, dentro: un programa cualquiera con su carpeta de trabajo ahí.
        let (prog, args): (&str, &[&str]) = if cfg!(windows) { ("ping", &["-n", "30", "127.0.0.1"]) } else { ("sleep", &["30"]) };
        let mut agente = Command::new(prog).args(args).current_dir(&arbol).stdout(Stdio::null()).spawn().unwrap();
        // Algo tuyo sin guardar: el `status` que subía hasta tu repo lo contaba como de la copia.
        std::fs::write(dir.join("tuyo.txt"), "mío").unwrap();
        let tirada = block_on(super::shadow_discard(p.clone(), arbol.clone(), "4-lab".into()));
        let sigue_la_carpeta = std::path::Path::new(&arbol).is_dir();
        let tras_tirar = raiz_de(&arbol);
        let pendiente = block_on(super::shadow_pendiente(arbol.clone(), "main".into())).map(|x| (x.sueltos, x.commits));
        // Lo que su agente escriba después de tirarla no se ha tirado: no se borra para montar otra.
        let despues = std::path::Path::new(&arbol).join("despues.txt");
        let con_despues = if sigue_la_carpeta {
            std::fs::write(&despues, "de después").unwrap();
            let r = block_on(super::shadow_init(p.clone(), "4-lab".into())).map(|s| s["reutilizado"].clone());
            let sigue = despues.exists();
            let _ = std::fs::remove_file(&despues);
            Some((r, sigue))
        } else {
            None
        };
        let otra = block_on(super::shadow_init(p.clone(), "4-lab".into())).map(|s| s["reutilizado"].clone());
        let raiz_otra = raiz_de(&arbol);
        let _ = agente.kill();
        let _ = agente.wait();
        // Y una carpeta que no es copia, con ficheros que Adeorq no sabe de quién son.
        let ajena = super::ruta_espejo(&p, "5-lab");
        std::fs::create_dir_all(&ajena).unwrap();
        std::fs::write(ajena.join("nota.txt"), "mía").unwrap();
        let sobre_ajena = block_on(super::shadow_init(p.clone(), "5-lab".into()));
        let sigue = ajena.join("nota.txt").exists();
        let _ = block_on(super::shadow_discard(p.clone(), arbol.clone(), "4-lab".into()));
        let _ = std::fs::remove_dir_all(&dir);

        assert!(tirada.is_ok(), "{tirada:?}");
        // En Windows la carpeta se queda (es la de trabajo del agente): si no, esto no prueba el tapón.
        assert!(!cfg!(windows) || sigue_la_carpeta, "la carpeta se borró entera con un programa dentro");
        if let Some((r, sigue)) = con_despues {
            assert!(r.is_err_and(|e| e.contains("después")) && sigue, "borró lo que su agente escribió después de tirarla");
        }
        assert!(!super::misma_carpeta(&tras_tirar, &p), "tras tirarla, el git de dentro llega a tu repo");
        assert_eq!(pendiente, Ok((0, 0)), "una copia tirada no deja nada pendiente");
        assert_eq!(otra, Ok("false".into()), "volver a abrirla monta una copia nueva");
        assert!(super::misma_carpeta(&raiz_otra, &arbol), "la que vuelve a abrir no es una copia de git: {raiz_otra}");
        assert!(sobre_ajena.is_err_and(|e| e.contains("no la uso")), "se montó encima de una carpeta que no es copia");
        assert!(sigue, "borró ficheros que no sabía de quién eran");
    }

    /// Dos montajes de la misma copia a la vez (Ctrl+Z nada más cerrarla, o un panel
    /// que se vuelve a montar al caerse): el que perdía el `worktree add` tapaba el
    /// `.git` de la copia viva del otro (cuarta revisión aparte, 2026-11-16).
    #[test]
    fn dos_montajes_a_la_vez_de_la_misma_copia_no_la_tapan() {
        use std::process::Command;
        let dir = std::env::temp_dir().join(format!("adeorq-a-la-vez-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_string_lossy().into_owned();
        let git = |args: &[&str]| {
            let ok = Command::new("git").args(["-C", &p, "-c", "user.name=lab", "-c", "user.email=lab@lab"]).args(args).status().unwrap().success();
            assert!(ok, "git {args:?}");
        };
        git(&["init", "-q", "-b", "main"]);
        std::fs::write(dir.join("a.txt"), "uno").unwrap();
        git(&["add", "a.txt"]);
        git(&["commit", "-q", "-m", "base"]);
        let mut malas = Vec::new();
        for n in 0..4 {
            let nombre = format!("{n}-par");
            let salida = std::sync::Arc::new(std::sync::Barrier::new(2));
            let hilos: Vec<_> = (0..2)
                .map(|_| {
                    let (p, nombre, salida) = (p.clone(), nombre.clone(), salida.clone());
                    std::thread::spawn(move || {
                        salida.wait();
                        tauri::async_runtime::block_on(super::shadow_init(p, nombre)).map(|s| s["reutilizado"].clone())
                    })
                })
                .collect();
            let r: Vec<_> = hilos.into_iter().map(|h| h.join().unwrap()).collect();
            let viva = super::copia_viva(&super::ruta_espejo(&p, &nombre));
            if !viva || r.iter().any(|x| x.is_err()) {
                malas.push((nombre, r, viva));
            }
        }
        let _ = std::fs::remove_dir_all(&dir);
        assert!(malas.is_empty(), "montajes a la vez que se pisan: {malas:?}");
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
