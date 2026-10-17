//! Lo que has trabajado con cada IA, hora a hora: los tokens de cada respuesta,
//! con su modelo, leídos de los archivos que los propios CLI ya escriben.
//!
//! Para la tarjeta de compartir tu uso y el calendario (Munir, 2026-10-17). El
//! `stats-cache.json` de Claude Code (`usage::stats_historia`) no vale para eso:
//! en su máquina lleva calculado desde el 18 de agosto, y no separa la caché.
//! Los transcripts sí van al día, y cada respuesta apunta su `usage` entero.
//!
//! Tres cosas medidas en su disco que deciden cómo se lee:
//!
//!  · Claude Code escribe UNA línea por trozo de la respuesta (lo que piensa,
//!    lo que dice, cada herramienta), todas con el mismo `message.id` y el
//!    mismo `usage`: 600 líneas eran 266 mensajes. Sin quitar los repetidos se
//!    contaba más del doble.
//!  · Un transcript puede pesar más de un gigabyte (el de esta sesión, 1,1 GB),
//!    y entre todos 4,7 GB. Se lee línea a línea, sin cargar el archivo, y se
//!    recuerda hasta dónde se llegó en cada uno: la segunda vez solo se lee lo
//!    nuevo. Lo recordado se guarda en `<datos>\uso-historia.json`.
//!  · Codex apunta en cada turno el TOTAL acumulado de la sesión
//!    (`total_token_usage`) y a veces repite el mismo evento: se suma lo que
//!    crece, no cada evento. Su `input_tokens` ya incluye lo leído de caché.
//!
//! Y el proyecto, para la tarjeta («en qué proyecto has gastado tokens», Munir,
//! el mismo día): cada línea de Claude lleva su `cwd` y Codex lo apunta en el
//! `session_meta`. Se guarda tal cual y se convierte en la raíz del proyecto al
//! devolverlo, mirando el disco: una subcarpeta cuenta para su repositorio, un
//! worktree para el repositorio del que sale, y el scratchpad de una sesión de
//! Claude Code (`Temp\claude\C--proyectos-Adeorq\<sesión>\scratchpad`) para el
//! proyecto de esa sesión. En su máquina, octubre: el 63 % en Adeorq.
//!
//! La hora va en UTC (`AAAA-MM-DDTHH`) y el día lo pone la ventana con su zona
//! horaria, que es la única que la conoce bien (los cambios de hora incluidos).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Lo trabajado en una hora con un modelo en una carpeta.
#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cubo {
    /// En UTC, `AAAA-MM-DDTHH`.
    pub hora: String,
    /// El CLI: `claude` o `codex`.
    pub cli: String,
    /// El id del modelo tal cual (`claude-opus-5-5`, `gpt-5.6-terra`).
    pub modelo: String,
    /// Dónde se trabajó. En lo leído, la carpeta tal cual la apunta el CLI; en
    /// lo que devuelve `uso_historia`, la raíz de su proyecto. Vacía si la
    /// respuesta no lo dice.
    #[serde(default)]
    pub carpeta: String,
    /// Entrada nueva, sin lo leído de caché.
    pub entrada: u64,
    pub salida: u64,
    pub cache_leida: u64,
    pub cache_escrita: u64,
    pub respuestas: u64,
}

/// Una sesión: de qué CLI es y entre qué horas trabajó.
#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sesion {
    pub cli: String,
    pub desde: String,
    pub hasta: String,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Historia {
    pub cubos: Vec<Cubo>,
    pub sesiones: Vec<Sesion>,
    /// Cuántos archivos se han leído, para decir de dónde sale.
    pub archivos: usize,
}

/// Lo que se recuerda de un archivo entre una lectura y la siguiente.
#[derive(Clone, Default, Serialize, Deserialize)]
struct Leido {
    /// Hasta qué byte se leyó.
    hasta: u64,
    /// Claude: los últimos mensajes contados, para no contar dos veces los
    /// trozos de una misma respuesta.
    ids: Vec<String>,
    /// Codex: el último total visto (entrada, de caché, salida, caché escrita).
    total: [u64; 4],
    /// Codex: el modelo del último `turn_context`.
    modelo: String,
    /// Codex: la carpeta de la sesión, de su `session_meta` o su `turn_context`.
    #[serde(default)]
    carpeta: String,
    cubos: Vec<Cubo>,
    sesion: Option<Sesion>,
}

static LEIDOS: Mutex<Option<HashMap<String, Leido>>> = Mutex::new(None);

/// Una cuenta de la que leer: su CLI y su carpeta (vacía = la de siempre).
#[derive(Deserialize)]
pub struct CuentaUso {
    pub provider: String,
    #[serde(default)]
    pub dir: String,
}

fn casa() -> Option<PathBuf> {
    std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).ok().map(PathBuf::from)
}

/// Dónde guarda cada CLI lo que hay que leer, para una cuenta.
fn raiz_de(cuenta: &CuentaUso) -> Option<(String, PathBuf)> {
    let propia = (!cuenta.dir.trim().is_empty()).then(|| PathBuf::from(&cuenta.dir));
    match cuenta.provider.as_str() {
        "claude" => Some(("claude".into(), propia.or_else(|| casa().map(|c| c.join(".claude")))?.join("projects"))),
        "codex" => Some(("codex".into(), propia.or_else(|| casa().map(|c| c.join(".codex")))?.join("sessions"))),
        _ => None,
    }
}

/// Los archivos que leer de todas esas cuentas, cada uno UNA vez. Dos cuentas
/// pueden apuntar a la misma carpeta escrita distinto (una con `dir` vacío, que
/// es la de siempre, y otra con `C:\Users\Muni\.claude`), y sin juntarlas se
/// sumaba dos veces todo lo que hay dentro (lo cazó la sesión del Perfil el
/// 2026-10-17). Se junta por la ruta canónica de la carpeta.
fn archivos_de(cuentas: &[CuentaUso]) -> Vec<(String, PathBuf)> {
    let mut raices = std::collections::HashSet::new();
    let mut fuera = Vec::new();
    for cuenta in cuentas {
        let Some((cli, raiz)) = raiz_de(cuenta) else { continue };
        let raiz = std::fs::canonicalize(&raiz).unwrap_or(raiz);
        if !raices.insert(raiz.clone()) {
            continue;
        }
        let mut archivos = Vec::new();
        jsonl_dentro(&raiz, &mut archivos);
        fuera.extend(archivos.into_iter().map(|p| (cli.clone(), p)));
    }
    fuera
}

fn jsonl_dentro(dir: &Path, salida: &mut Vec<PathBuf>) {
    let Ok(entradas) = std::fs::read_dir(dir) else { return };
    for e in entradas.flatten() {
        let p = e.path();
        // Sin seguir enlaces: una carpeta enlazada fuera de la casa no es suya.
        let Ok(tipo) = e.file_type() else { continue };
        if tipo.is_dir() {
            jsonl_dentro(&p, salida);
        } else if tipo.is_file() && p.extension().is_some_and(|x| x == "jsonl") {
            salida.push(p);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn sumar(cubos: &mut Vec<Cubo>, hora: &str, cli: &str, modelo: &str, carpeta: &str, e: u64, s: u64, cl: u64, ce: u64) {
    if let Some(c) = cubos.iter_mut().find(|c| c.hora == hora && c.modelo == modelo && c.carpeta == carpeta) {
        c.entrada += e;
        c.salida += s;
        c.cache_leida += cl;
        c.cache_escrita += ce;
        c.respuestas += 1;
    } else {
        cubos.push(Cubo {
            hora: hora.into(),
            cli: cli.into(),
            modelo: modelo.into(),
            carpeta: carpeta.into(),
            entrada: e,
            salida: s,
            cache_leida: cl,
            cache_escrita: ce,
            respuestas: 1,
        });
    }
}

fn apuntar_sesion(l: &mut Leido, cli: &str, hora: &str) {
    match &mut l.sesion {
        Some(s) => {
            if hora < s.desde.as_str() {
                s.desde = hora.into();
            }
            if hora > s.hasta.as_str() {
                s.hasta = hora.into();
            }
        }
        None => l.sesion = Some(Sesion { cli: cli.into(), desde: hora.into(), hasta: hora.into() }),
    }
}

/// `AAAA-MM-DDTHH` de una marca ISO, o nada si no lo parece.
fn hora_de(ts: &str) -> Option<&str> {
    let h = ts.get(..13)?;
    (h.as_bytes().get(10) == Some(&b'T')).then_some(h)
}

fn u(v: &Value) -> u64 {
    v.as_u64().unwrap_or(0)
}

/// Una línea de un transcript de Claude Code.
fn linea_claude(l: &mut Leido, linea: &str, es_sesion: bool) {
    if !linea.contains("\"usage\"") || !linea.contains("\"assistant\"") {
        return;
    }
    let Ok(v) = serde_json::from_str::<Value>(linea) else { return };
    if v["type"] != "assistant" {
        return;
    }
    let m = &v["message"];
    let (Some(id), Some(modelo), Some(hora)) = (m["id"].as_str(), m["model"].as_str(), v["timestamp"].as_str().and_then(hora_de)) else {
        return;
    };
    // Las respuestas que no son de un modelo (los avisos del propio CLI) llevan
    // `<synthetic>` y ceros.
    if modelo.starts_with('<') || l.ids.iter().any(|x| x == id) {
        return;
    }
    l.ids.push(id.into());
    if l.ids.len() > 16 {
        l.ids.remove(0);
    }
    let us = &m["usage"];
    sumar(
        &mut l.cubos,
        hora,
        "claude",
        modelo,
        v["cwd"].as_str().unwrap_or(""),
        u(&us["input_tokens"]),
        u(&us["output_tokens"]),
        u(&us["cache_read_input_tokens"]),
        u(&us["cache_creation_input_tokens"]),
    );
    if es_sesion {
        apuntar_sesion(l, "claude", hora);
    }
}

/// Una línea de un rollout de Codex.
fn linea_codex(l: &mut Leido, linea: &str) {
    let turno = linea.contains("\"turn_context\"");
    let meta = linea.contains("\"session_meta\"");
    if !turno && !meta && !linea.contains("\"token_count\"") {
        return;
    }
    let Ok(v) = serde_json::from_str::<Value>(linea) else { return };
    let p = &v["payload"];
    if turno || meta {
        if let Some(m) = p["model"].as_str() {
            l.modelo = m.into();
        }
        if let Some(c) = p["cwd"].as_str() {
            l.carpeta = c.into();
        }
        return;
    }
    let t = &p["info"]["total_token_usage"];
    if t.is_null() {
        return;
    }
    let ahora = [u(&t["input_tokens"]), u(&t["cached_input_tokens"]), u(&t["output_tokens"]), u(&t["cache_write_input_tokens"])];
    let d: Vec<u64> = ahora.iter().zip(l.total.iter()).map(|(a, b)| a.saturating_sub(*b)).collect();
    // Un total que BAJA es otra sesión dentro del mismo archivo: cuenta entero.
    let reinicio = ahora[0] < l.total[0];
    let d = if reinicio { ahora.to_vec() } else { d };
    l.total = ahora;
    if d.iter().all(|x| *x == 0) {
        return;
    }
    let Some(hora) = v["timestamp"].as_str().and_then(hora_de) else { return };
    let modelo = if l.modelo.is_empty() { "codex".to_string() } else { l.modelo.clone() };
    // `input_tokens` ya incluye lo leído de caché: la entrada nueva es la resta.
    let carpeta = l.carpeta.clone();
    sumar(&mut l.cubos, hora, "codex", &modelo, &carpeta, d[0].saturating_sub(d[1]), d[2], d[1], d[3]);
    apuntar_sesion(l, "codex", hora);
}

/// Lee lo nuevo de un archivo desde donde se quedó.
fn leer_lo_nuevo(path: &Path, cli: &str, l: &mut Leido) -> std::io::Result<()> {
    let largo = std::fs::metadata(path)?.len();
    if largo < l.hasta {
        // Más corto que lo leído: es otro archivo con el mismo nombre.
        *l = Leido::default();
    }
    if largo == l.hasta {
        return Ok(());
    }
    let mut f = std::fs::File::open(path)?;
    f.seek(SeekFrom::Start(l.hasta))?;
    let mut r = BufReader::with_capacity(1 << 20, f);
    let es_sesion = cli == "claude" && !path.components().any(|c| c.as_os_str() == "subagents");
    let mut buf = Vec::new();
    loop {
        buf.clear();
        let n = r.read_until(b'\n', &mut buf)?;
        // Una última línea sin salto es una que se está escribiendo: se deja
        // para la próxima vuelta.
        if n == 0 || buf.last() != Some(&b'\n') {
            break;
        }
        l.hasta += n as u64;
        let linea = String::from_utf8_lossy(&buf);
        if cli == "claude" {
            linea_claude(l, &linea, es_sesion);
        } else {
            linea_codex(l, &linea);
        }
    }
    Ok(())
}

/// Cómo nombra Claude Code la carpeta de una sesión: todo lo que no es letra o
/// cifra pasa a `-` (`C:\proyectos\Adeorq` → `C--proyectos-Adeorq`).
fn codificar(nombre: &str) -> String {
    nombre.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect()
}

/// Lo contrario, mirando el disco. A ciegas no se puede (`taskbar-groups-fluent`
/// lleva sus propios guiones), así que en cada nivel se busca la carpeta que,
/// codificada, encaja con el principio de lo que queda. Si ya no hay ninguna
/// (un proyecto borrado), lo que queda va entero como último nombre.
fn decodificar(cod: &str) -> Option<PathBuf> {
    let b = cod.as_bytes();
    let (mut dir, mut resto) = if b.len() >= 3 && b[0].is_ascii_alphabetic() && &b[1..3] == b"--" {
        (PathBuf::from(format!("{}:\\", b[0] as char)), &cod[3..])
    } else if let Some(r) = cod.strip_prefix('-') {
        (PathBuf::from("/"), r)
    } else {
        return None;
    };
    while !resto.is_empty() {
        let mut mejor: Option<(usize, PathBuf)> = None;
        for h in std::fs::read_dir(&dir).into_iter().flatten().flatten() {
            if !h.file_type().is_ok_and(|t| t.is_dir()) {
                continue;
            }
            let n = codificar(&h.file_name().to_string_lossy());
            let encaja = resto == n || (resto.starts_with(&n) && resto.as_bytes().get(n.len()) == Some(&b'-'));
            if encaja && mejor.as_ref().is_none_or(|(largo, _)| n.len() > *largo) {
                mejor = Some((n.len(), h.path()));
            }
        }
        let Some((largo, p)) = mejor else {
            dir.push(resto);
            break;
        };
        dir = p;
        resto = resto.get(largo + 1..).unwrap_or("");
    }
    Some(dir)
}

/// El repositorio principal de un worktree, de su `.git`, que es un archivo:
/// `gitdir: C:/proyectos/Adeorq/.git/worktrees/<nombre>`.
fn principal_de_worktree(texto: &str) -> Option<PathBuf> {
    let dir = texto.trim().strip_prefix("gitdir:")?.trim().replace('\\', "/");
    let i = dir.find("/.git/worktrees/")?;
    Some(PathBuf::from(&dir[..i]).components().collect())
}

/// La raíz del proyecto de una carpeta de trabajo: el repositorio que la
/// contiene, subiendo por el disco. Sin repositorio, la carpeta misma.
fn raiz_del_proyecto(cwd: &str, temp: &Path, casa: Option<&Path>) -> PathBuf {
    let mut p: PathBuf = PathBuf::from(cwd).components().collect();
    // El scratchpad de una sesión de Claude Code es del proyecto de esa sesión.
    let cod = p.strip_prefix(temp.join("claude")).ok().and_then(|d| d.components().next()).map(|c| c.as_os_str().to_string_lossy().into_owned());
    if let Some(d) = cod.as_deref().and_then(decodificar) {
        p = d;
    }
    let mut actual = Some(p.as_path());
    while let Some(a) = actual {
        // Un `.git` en la carpeta personal o en la raíz del disco no convierte
        // todo lo que cuelga de ellas en un solo proyecto.
        let tope = Some(a) == casa || a.parent().is_none();
        if tope && a != p {
            break;
        }
        let git = a.join(".git");
        if git.is_dir() {
            return a.to_path_buf();
        }
        if git.is_file() {
            return std::fs::read_to_string(&git).ok().and_then(|t| principal_de_worktree(&t)).unwrap_or_else(|| a.to_path_buf());
        }
        if tope {
            break;
        }
        actual = a.parent();
    }
    p
}

/// El proyecto del panel de Adeorq que contiene esa raíz, si alguno lo hace.
/// Hace falta porque un repositorio puede vivir dentro de otro proyecto
/// (`C:\proyectos\Orquio\web` tiene su propio `.git`, y para él es Orquio) y
/// porque la carpeta madre puede ser también un repositorio (en su máquina,
/// `C:\proyectos` lo es): ni el de dentro ni el de fuera es «el proyecto».
fn al_proyecto<'a>(raiz: &str, proyectos: &'a [String]) -> Option<&'a str> {
    let norm = |s: &str| {
        let s = s.replace('\\', "/").trim_end_matches('/').to_string();
        if cfg!(windows) {
            s.to_lowercase()
        } else {
            s
        }
    };
    let r = norm(raiz);
    proyectos
        .iter()
        .filter(|p| {
            let p = norm(p);
            !p.is_empty() && (r == p || r.starts_with(&format!("{p}/")))
        })
        .max_by_key(|p| p.len())
        .map(String::as_str)
}

/// Lo recordado lleva la carpeta de cada respuesta desde el 2026-10-17: el
/// archivo de antes no la tenía y se lee todo otra vez, una sola vez.
fn guardado() -> Option<PathBuf> {
    crate::dir_datos().ok().map(|d| d.join("uso-historia-2.json"))
}

/// Lo trabajado con todas esas cuentas. La primera vez lee todo (en su equipo,
/// unos 4,7 GB); las siguientes, solo lo que ha crecido. `proyectos` son las
/// carpetas de los proyectos del panel (`list_projects`): la carpeta de cada
/// cubo sale como la del proyecto que la contiene, o como la raíz de su
/// repositorio si no está en ninguno.
#[tauri::command(async)]
pub fn uso_historia(cuentas: Vec<CuentaUso>, proyectos: Option<Vec<String>>) -> Result<Historia, String> {
    let proyectos = proyectos.unwrap_or_default();
    let mut guardia = LEIDOS.lock().unwrap_or_else(|e| e.into_inner());
    let leidos = guardia.get_or_insert_with(|| {
        if let Ok(d) = crate::dir_datos() {
            let _ = std::fs::remove_file(d.join("uso-historia.json"));
        }
        guardado()
            .and_then(|r| std::fs::read_to_string(r).ok())
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    });
    let mut vistos = Vec::new();
    for (cli, path) in archivos_de(&cuentas) {
        let clave = path.to_string_lossy().into_owned();
        let l = leidos.entry(clave.clone()).or_default();
        // Un archivo que no se deja leer se queda con lo que ya tenía.
        let _ = leer_lo_nuevo(&path, &cli, l);
        vistos.push(clave);
    }
    // Cada carpeta se convierte en su proyecto una sola vez por llamada.
    let (temp, casa) = (std::env::temp_dir(), casa());
    let mut raices: HashMap<String, String> = HashMap::new();
    let mut todos: HashMap<(String, String, String), Cubo> = HashMap::new();
    let mut sesiones = Vec::new();
    for clave in &vistos {
        let Some(l) = leidos.get(clave) else { continue };
        for c in &l.cubos {
            let raiz = match c.carpeta.as_str() {
                "" => String::new(),
                cwd => raices
                    .entry(cwd.to_string())
                    .or_insert_with(|| {
                        let r = raiz_del_proyecto(cwd, &temp, casa.as_deref()).to_string_lossy().into_owned();
                        al_proyecto(&r, &proyectos).map(str::to_string).unwrap_or(r)
                    })
                    .clone(),
            };
            // En Windows `C:\proyectos\adeorq` y `C:\proyectos\Adeorq` son la misma.
            let junta = if cfg!(windows) { raiz.to_lowercase() } else { raiz.clone() };
            let t = todos
                .entry((c.hora.clone(), c.modelo.clone(), junta))
                .or_insert_with(|| Cubo { hora: c.hora.clone(), cli: c.cli.clone(), modelo: c.modelo.clone(), carpeta: raiz, ..Cubo::default() });
            t.entrada += c.entrada;
            t.salida += c.salida;
            t.cache_leida += c.cache_leida;
            t.cache_escrita += c.cache_escrita;
            t.respuestas += c.respuestas;
        }
        if let Some(s) = &l.sesion {
            sesiones.push(s.clone());
        }
    }
    if let (Some(r), Ok(texto)) = (guardado(), serde_json::to_string(&*leidos)) {
        let tmp = r.with_extension("json.tmp");
        if std::fs::write(&tmp, texto).is_ok() {
            let _ = std::fs::rename(&tmp, &r);
        }
    }
    let mut cubos: Vec<Cubo> = todos.into_values().collect();
    cubos.sort_by(|a, b| a.hora.cmp(&b.hora).then(a.modelo.cmp(&b.modelo)).then(a.carpeta.cmp(&b.carpeta)));
    Ok(Historia { cubos, sesiones, archivos: vistos.len() })
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn respuesta(id: &str, modelo: &str, ts: &str, e: u64, s: u64, cl: u64, ce: u64) -> String {
        format!(
            r#"{{"type":"assistant","timestamp":"{ts}","message":{{"id":"{id}","model":"{modelo}","usage":{{"input_tokens":{e},"output_tokens":{s},"cache_read_input_tokens":{cl},"cache_creation_input_tokens":{ce}}}}}}}"#
        )
    }

    fn carpeta(n: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("adeorq-uso-{n}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// Los trozos de una respuesta llevan el mismo id y el mismo uso: una vez.
    #[test]
    fn una_respuesta_partida_en_lineas_cuenta_una_vez() {
        let mut l = Leido::default();
        for _ in 0..3 {
            linea_claude(&mut l, &respuesta("msg_1", "claude-opus-5-5", "2026-10-17T05:12:00.000Z", 10, 20, 300, 4), true);
        }
        linea_claude(&mut l, &respuesta("msg_2", "claude-opus-5-5", "2026-10-17T05:40:00.000Z", 1, 2, 3, 0), true);
        linea_claude(&mut l, &respuesta("msg_3", "<synthetic>", "2026-10-17T05:41:00.000Z", 0, 0, 0, 0), true);
        assert_eq!(l.cubos.len(), 1);
        let c = &l.cubos[0];
        assert_eq!((c.hora.as_str(), c.entrada, c.salida, c.cache_leida, c.cache_escrita, c.respuestas), ("2026-10-17T05", 11, 22, 303, 4, 2));
        assert_eq!(l.sesion, Some(Sesion { cli: "claude".into(), desde: "2026-10-17T05".into(), hasta: "2026-10-17T05".into() }));
    }

    /// La misma hora y el mismo modelo en dos carpetas son dos cubos, y Codex
    /// toma la carpeta de su `session_meta`.
    #[test]
    fn cada_respuesta_apunta_su_carpeta() {
        let mut l = Leido::default();
        let con_cwd = |id: &str, cwd: &str| respuesta(id, "claude-opus-5-5", "2026-10-17T05:12:00.000Z", 1, 1, 1, 1).replacen('{', &format!(r#"{{"cwd":{},"#, serde_json::to_string(cwd).unwrap()), 1);
        linea_claude(&mut l, &con_cwd("a", r"C:\proyectos\Adeorq"), true);
        linea_claude(&mut l, &con_cwd("b", r"C:\proyectos\Adeorq"), true);
        linea_claude(&mut l, &con_cwd("c", r"C:\proyectos\Orquio"), true);
        let carpetas: Vec<(&str, u64)> = l.cubos.iter().map(|c| (c.carpeta.as_str(), c.respuestas)).collect();
        assert_eq!(carpetas, [(r"C:\proyectos\Adeorq", 2), (r"C:\proyectos\Orquio", 1)]);

        let mut l = Leido::default();
        linea_codex(&mut l, r#"{"timestamp":"2026-10-16T21:00:00.000Z","type":"session_meta","payload":{"cwd":"C:\\proyectos\\ProductSea"}}"#);
        linea_codex(&mut l, r#"{"timestamp":"2026-10-16T21:01:00.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":10,"cached_input_tokens":0,"output_tokens":5,"cache_write_input_tokens":0}}}}"#);
        assert_eq!(l.cubos[0].carpeta, r"C:\proyectos\ProductSea");
    }

    /// Una subcarpeta cuenta para su repositorio, un worktree para el
    /// principal, el scratchpad de una sesión para el proyecto de la sesión
    /// (con espacios y guiones en el nombre) y lo que no está en ningún
    /// repositorio, para sí mismo. También un proyecto que ya no existe.
    #[test]
    fn la_carpeta_se_convierte_en_su_proyecto() {
        let base = carpeta("raiz");
        let repo = base.join("mi proyecto-x");
        std::fs::create_dir_all(repo.join(".git")).unwrap();
        std::fs::create_dir_all(repo.join("src")).unwrap();
        let wt = repo.join(".claude").join("worktrees").join("rama");
        std::fs::create_dir_all(wt.join("src")).unwrap();
        std::fs::write(wt.join(".git"), format!("gitdir: {}/.git/worktrees/rama\n", repo.to_string_lossy().replace('\\', "/"))).unwrap();
        std::fs::create_dir_all(base.join("suelta").join("sub")).unwrap();
        let temp = base.join("tmp");
        let scratch = |p: &Path| temp.join("claude").join(codificar(&p.to_string_lossy())).join("sesion").join("scratchpad");
        let raiz = |p: &Path| raiz_del_proyecto(&p.to_string_lossy(), &temp, Some(&base));

        assert_eq!(raiz(&repo.join("src")), repo);
        assert_eq!(raiz(&wt.join("src")), repo);
        assert_eq!(raiz(&scratch(&repo)), repo);
        assert_eq!(raiz(&base.join("suelta").join("sub")), base.join("suelta").join("sub"));
        assert_eq!(raiz(&scratch(&base.join("borrado"))), base.join("borrado"));
        std::fs::remove_dir_all(&base).ok();
    }

    /// La misma carpeta escrita de tres formas es una sola: sus archivos salen
    /// una vez, no tres.
    #[test]
    fn dos_cuentas_con_la_misma_carpeta_no_suman_dos_veces() {
        let base = carpeta("dobles");
        let claude = base.join(".claude");
        std::fs::create_dir_all(claude.join("projects").join("p")).unwrap();
        std::fs::write(claude.join("projects").join("p").join("s.jsonl"), "").unwrap();
        let cuenta = |dir: String| CuentaUso { provider: "claude".into(), dir };
        let tal_cual = claude.to_string_lossy().into_owned();
        let cuentas = [cuenta(tal_cual.clone()), cuenta(format!("{tal_cual}{}", std::path::MAIN_SEPARATOR)), cuenta(base.join(".").join(".claude").to_string_lossy().into_owned())];
        assert_eq!(archivos_de(&cuentas).len(), 1);
        std::fs::remove_dir_all(&base).ok();
    }

    /// Un repositorio dentro de un proyecto cuenta para el proyecto, y la
    /// carpeta madre (aunque sea un repositorio) no es ninguno.
    #[test]
    fn un_repositorio_dentro_cuenta_para_su_proyecto() {
        let proyectos = [r"C:\proyectos\Orquio".to_string(), r"C:\proyectos\Orquio-Core".to_string(), r"C:\proyectos\Adeorq\".to_string()];
        assert_eq!(al_proyecto(r"C:\proyectos\Orquio\web", &proyectos), Some(r"C:\proyectos\Orquio"));
        assert_eq!(al_proyecto(r"C:\proyectos\Orquio-Core", &proyectos), Some(r"C:\proyectos\Orquio-Core"));
        assert_eq!(al_proyecto(r"C:\proyectos\Adeorq", &proyectos), Some(r"C:\proyectos\Adeorq\"));
        assert_eq!(al_proyecto(r"C:\proyectos", &proyectos), None);
        assert_eq!(al_proyecto(r"C:\proyectos\OrquioWeb", &proyectos), None);
    }

    /// Codex: se suma lo que crece el total, y un evento repetido no suma.
    #[test]
    fn codex_suma_lo_que_crece_el_total() {
        let mut l = Leido::default();
        let ctx = r#"{"timestamp":"2026-10-16T21:00:00.000Z","type":"turn_context","payload":{"model":"gpt-5.6-terra"}}"#;
        let tc = |ts: &str, e: u64, c: u64, s: u64| format!(r#"{{"timestamp":"{ts}","type":"event_msg","payload":{{"type":"token_count","info":{{"total_token_usage":{{"input_tokens":{e},"cached_input_tokens":{c},"output_tokens":{s},"cache_write_input_tokens":0}}}}}}}}"#);
        linea_codex(&mut l, ctx);
        linea_codex(&mut l, &tc("2026-10-16T21:01:00.000Z", 1000, 800, 50));
        linea_codex(&mut l, &tc("2026-10-16T21:02:00.000Z", 1000, 800, 50));
        linea_codex(&mut l, &tc("2026-10-16T22:05:00.000Z", 1500, 1100, 70));
        assert_eq!(l.cubos.len(), 2);
        let c = &l.cubos[0];
        assert_eq!((c.modelo.as_str(), c.entrada, c.cache_leida, c.salida, c.respuestas), ("gpt-5.6-terra", 200, 800, 50, 1));
        let c = &l.cubos[1];
        assert_eq!((c.hora.as_str(), c.entrada, c.cache_leida, c.salida), ("2026-10-16T22", 200, 300, 20));
    }

    /// Contra los archivos de verdad de quien lo lanza, sin guardar nada:
    /// cuánto tarda la primera lectura y qué sale por CLI y modelo.
    ///   cargo test --lib uso_historia::pruebas::con_los_datos_de_verdad -- --ignored --nocapture
    #[test]
    #[ignore]
    fn con_los_datos_de_verdad() {
        let reloj = std::time::Instant::now();
        let mut por_modelo: HashMap<String, [u64; 5]> = HashMap::new();
        let mut por_proyecto_octubre: HashMap<String, u64> = HashMap::new();
        let (temp, casa) = (std::env::temp_dir(), casa());
        let proyectos: Vec<String> = std::fs::read_dir(crate::workspace::raiz_de(None)).into_iter().flatten().flatten().filter(|e| e.path().is_dir()).map(|e| e.path().to_string_lossy().into_owned()).collect();
        let mut archivos = 0;
        for cuenta in [CuentaUso { provider: "claude".into(), dir: String::new() }, CuentaUso { provider: "codex".into(), dir: String::new() }] {
            let Some((cli, raiz)) = raiz_de(&cuenta) else { continue };
            let mut lista = Vec::new();
            jsonl_dentro(&raiz, &mut lista);
            for p in lista {
                let mut l = Leido::default();
                let _ = leer_lo_nuevo(&p, &cli, &mut l);
                archivos += 1;
                for c in l.cubos {
                    if c.hora.starts_with("2026-10") {
                        let r = if c.carpeta.is_empty() {
                            "(sin carpeta)".into()
                        } else {
                            let r = raiz_del_proyecto(&c.carpeta, &temp, casa.as_deref()).to_string_lossy().into_owned();
                            al_proyecto(&r, &proyectos).map(str::to_string).unwrap_or(r)
                        };
                        *por_proyecto_octubre.entry(r).or_default() += c.entrada + c.salida + c.cache_leida + c.cache_escrita;
                    }
                    let t = por_modelo.entry(c.modelo).or_default();
                    t[0] += c.entrada;
                    t[1] += c.salida;
                    t[2] += c.cache_leida;
                    t[3] += c.cache_escrita;
                    t[4] += c.respuestas;
                }
            }
        }
        println!("{archivos} archivos en {:.1} s", reloj.elapsed().as_secs_f64());
        let mut filas: Vec<_> = por_modelo.into_iter().collect();
        filas.sort_by_key(|(_, t)| std::cmp::Reverse(t[0] + t[1] + t[2] + t[3]));
        for (m, t) in filas {
            println!("{m}: entrada {} · salida {} · caché leída {} · caché escrita {} · {} respuestas", t[0], t[1], t[2], t[3], t[4]);
        }
        let mut proyectos: Vec<_> = por_proyecto_octubre.into_iter().collect();
        proyectos.sort_by_key(|(_, t)| std::cmp::Reverse(*t));
        for (p, t) in proyectos.iter().take(8) {
            println!("octubre, {p}: {} M", t / 1_000_000);
        }
    }

    /// Lo que se añade a un archivo se lee la vez siguiente, sin contar dos
    /// veces lo de antes, y una línea a medio escribir espera.
    #[test]
    fn se_lee_solo_lo_nuevo() {
        let d = carpeta("nuevo");
        let f = d.join("s.jsonl");
        std::fs::write(&f, format!("{}\n", respuesta("a", "claude-sonnet-5-5", "2026-10-17T01:00:00.000Z", 1, 1, 1, 1))).unwrap();
        let mut l = Leido::default();
        leer_lo_nuevo(&f, "claude", &mut l).unwrap();
        let mut texto = std::fs::read_to_string(&f).unwrap();
        texto.push_str(&format!("{}\n", respuesta("b", "claude-sonnet-5-5", "2026-10-17T01:30:00.000Z", 2, 2, 2, 2)));
        texto.push_str(r#"{"type":"assistant","timestamp":"2026-10-17T01:31"#);
        std::fs::write(&f, &texto).unwrap();
        leer_lo_nuevo(&f, "claude", &mut l).unwrap();
        assert_eq!(l.cubos[0].entrada, 3);
        assert_eq!(l.cubos[0].respuestas, 2);
        assert!(l.hasta < texto.len() as u64, "la línea a medio escribir no se da por leída");
        std::fs::remove_dir_all(&d).ok();
    }
}
