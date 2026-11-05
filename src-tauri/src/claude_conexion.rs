// Conectar tu Claude Code a las herramientas de Adeorq (decisión B1 de Munir,
// 2026-11-04, `docs/contexto/claude-conexion.md`).
//
// Hasta hoy, quien instalaba Adeorq no tenía las herramientas en sus agentes hasta que
// tecleaba `claude mcp add adeorq --scope user -- "<ruta>" --mcp`, que solo estaba en la
// guía. Esto es ese mismo comando con un botón: una entrada `adeorq` en los `mcpServers`
// del `.claude.json` de cada cuenta de Claude, apuntando al enlace estable de
// `mcp_estable::ruta_del_enlace()` (el que sobrevive a una actualización).
//
// NO se lanza `claude mcp add`: medido el 2026-11-04 con Claude Code 2.1.318 sobre un
// archivo de ejemplo, tarda 1,8 s, y reescribe el archivo ENTERO a su manera (cambió el
// `userID`, quitó `autoUpdates`, un entero de 20 dígitos perdió los últimos y `1.5e300`
// pasó a `1.5e+300`). Aquí se hace un único empalme de texto en el sitio de la entrada:
// todo lo demás del archivo queda byte a byte, que es lo que hay que poder demostrar
// de un archivo que Claude Code reescribe a menudo y que lleva la configuración ENTERA
// de la persona (sus proyectos, sus otros servidores MCP).
//
// Reglas, las mismas que las de `bots_yaml.rs` con el `config.yaml` de Hermes:
//  · Lo que no se entiende no se escribe: el archivo tiene que leerse antes y después, y
//    lo único que cambia al leerlo es la entrada de Adeorq.
//  · Siempre queda una copia al lado y no se pisa lo que Claude Code guardara mientras
//    tanto (`mcp_estable::retocar_con_copia`).
//  · Una entrada `adeorq` que no es la nuestra no se toca, ni para conectar ni para quitar.
//  · Desconectar quita esa entrada y deja el archivo como estaba antes de conectar.

use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const NOMBRE_EN_CLAUDE: &str = "adeorq";

/// Cómo está una cuenta respecto a Adeorq.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Estado {
    /// No hay entrada `adeorq` (o ni siquiera hay archivo).
    Libre,
    /// Hay una entrada `adeorq` que lanza el enlace de Adeorq.
    Conectado,
    /// Hay una entrada que se llama `adeorq` pero no es la nuestra: no se toca.
    Ajena,
    /// El archivo existe y no se entiende: no se toca.
    NoEntendido,
}

/// Una cuenta de Claude y lo que se sabe de ella.
#[derive(Clone, Debug, Serialize)]
pub struct CuentaDeClaude {
    /// `principal`, o el nombre de la carpeta de la cuenta (`claude-2da-main`).
    pub id: String,
    /// La carpeta de la cuenta tal cual se abre (`CLAUDE_CONFIG_DIR`); vacía en la principal.
    pub carpeta: String,
    /// El archivo que se toca.
    pub archivo: String,
    pub existe: bool,
    pub estado: Estado,
    /// Conectado: a dónde apunta si no es al sitio de siempre. NoEntendido y Ajena: por qué.
    pub detalle: Option<String>,
}

/// Lo que se va a escribir, para enseñarlo antes.
#[derive(Clone, Debug, Serialize)]
pub struct Plan {
    pub cuentas: Vec<CuentaDeClaude>,
    /// El comando que se apunta, tal como lo lanzará Claude Code.
    pub comando: String,
    /// Claude Code está en este equipo.
    pub instalado: bool,
}

/// Lo que pasó al conectar o desconectar.
#[derive(Clone, Debug, Serialize)]
pub struct Resultado {
    pub plan: Plan,
    /// Dónde quedó el archivo de antes.
    pub copia: Option<String>,
}

// ── Leer un JSON por el texto, sin tocarlo ────────────────────────────────────

fn saltar_blancos(b: &[u8], mut i: usize) -> usize {
    while i < b.len() && matches!(b[i], b' ' | b'\t' | b'\n' | b'\r') {
        i += 1;
    }
    i
}

/// Donde acaba la cadena que empieza en `b[i]` (una comilla), contando la de cierre.
fn fin_de_cadena(b: &[u8], i: usize) -> Option<usize> {
    let mut j = i + 1;
    while j < b.len() {
        match b[j] {
            b'\\' => j += 2,
            b'"' => return Some(j + 1),
            _ => j += 1,
        }
    }
    None
}

/// Donde acaba el valor que empieza en `b[i]` (sin blancos delante).
fn fin_de_valor(b: &[u8], i: usize) -> Option<usize> {
    match *b.get(i)? {
        b'"' => fin_de_cadena(b, i),
        b'{' | b'[' => {
            let mut profundidad = 0usize;
            let mut j = i;
            while j < b.len() {
                match b[j] {
                    b'"' => {
                        j = fin_de_cadena(b, j)?;
                        continue;
                    }
                    b'{' | b'[' => profundidad += 1,
                    b'}' | b']' => {
                        profundidad = profundidad.checked_sub(1)?;
                        if profundidad == 0 {
                            return Some(j + 1);
                        }
                    }
                    _ => {}
                }
                j += 1;
            }
            None
        }
        _ => {
            let mut j = i;
            while j < b.len() && !matches!(b[j], b',' | b'}' | b']' | b' ' | b'\t' | b'\n' | b'\r') {
                j += 1;
            }
            (j > i).then_some(j)
        }
    }
}

/// Un miembro de un objeto: dónde empieza su clave y dónde acaba su valor.
struct Miembro {
    clave: String,
    ini: usize,
    ini_valor: usize,
    fin: usize,
}

/// Un objeto leído por el texto: dónde abre y cierra, y sus miembros de primer nivel.
struct Objeto {
    abre: usize,
    cierra: usize,
    miembros: Vec<Miembro>,
}

fn objeto_en(t: &str, abre: usize) -> Option<Objeto> {
    let b = t.as_bytes();
    if b.get(abre) != Some(&b'{') {
        return None;
    }
    let mut i = saltar_blancos(b, abre + 1);
    let mut miembros = Vec::new();
    if b.get(i) == Some(&b'}') {
        return Some(Objeto { abre, cierra: i, miembros });
    }
    loop {
        if b.get(i) != Some(&b'"') {
            return None;
        }
        let ini = i;
        let fin_clave = fin_de_cadena(b, i)?;
        let clave: String = serde_json::from_str(&t[ini..fin_clave]).ok()?;
        i = saltar_blancos(b, fin_clave);
        if b.get(i) != Some(&b':') {
            return None;
        }
        i = saltar_blancos(b, i + 1);
        let ini_valor = i;
        let fin = fin_de_valor(b, i)?;
        miembros.push(Miembro { clave, ini, ini_valor, fin });
        i = saltar_blancos(b, fin);
        match b.get(i)? {
            b',' => i = saltar_blancos(b, i + 1),
            b'}' => return Some(Objeto { abre, cierra: i, miembros }),
            _ => return None,
        }
    }
}

/// El objeto de la raíz. Nada más en el archivo: ni antes (un BOM, un comentario) ni después.
fn raiz_de(t: &str) -> Result<Objeto, String> {
    let b = t.as_bytes();
    let ini = saltar_blancos(b, 0);
    if ini >= b.len() {
        return Err("está vacío".to_string());
    }
    let obj = objeto_en(t, ini).ok_or("no empieza por una llave o no se lee como lo escribe Claude Code")?;
    if saltar_blancos(b, obj.cierra + 1) != b.len() {
        return Err("tiene algo detrás del objeto".to_string());
    }
    Ok(obj)
}

/// El único miembro de ese nombre. Dos con el mismo nombre no se tocan: cuál manda
/// depende de quien lea.
fn unico<'a>(o: &'a Objeto, clave: &str) -> Result<Option<&'a Miembro>, String> {
    let mut hallados = o.miembros.iter().filter(|m| m.clave == clave);
    let primero = hallados.next();
    if hallados.next().is_some() {
        return Err(format!("«{clave}» aparece dos veces"));
    }
    Ok(primero)
}

/// Los espacios entre el principio de la línea y `pos`, si es lo único que hay.
fn sangria_de(t: &str, pos: usize) -> Option<&str> {
    let linea = t[..pos].rsplit('\n').next()?;
    linea.chars().all(|c| c == ' ' || c == '\t').then_some(linea)
}

// ── Lo que se escribe ────────────────────────────────────────────────────────

/// Cómo se lanza el enlace.
#[derive(Clone, Debug, PartialEq)]
pub struct Entrada {
    pub comando: String,
    pub env: Vec<(String, String)>,
}

fn json_de(e: &Entrada) -> Value {
    let env: serde_json::Map<String, Value> = e.env.iter().map(|(k, v)| (k.clone(), Value::String(v.clone()))).collect();
    json!({ "type": "stdio", "command": e.comando, "args": ["--mcp"], "env": env })
}

fn cadena(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_string())
}

/// La entrada escrita como la escribe Claude Code (`"adeorq": {…}`), con la sangría de su sitio.
fn texto_de(e: &Entrada, sangria: &str, unidad: &str, eol: &str, compacto: bool) -> String {
    let nombre = cadena(NOMBRE_EN_CLAUDE);
    if compacto {
        let env: Vec<String> = e.env.iter().map(|(k, v)| format!("{}:{}", cadena(k), cadena(v))).collect();
        return format!("{nombre}:{{\"type\":\"stdio\",\"command\":{},\"args\":[\"--mcp\"],\"env\":{{{}}}}}", cadena(&e.comando), env.join(","));
    }
    let (s1, s2) = (format!("{sangria}{unidad}"), format!("{sangria}{unidad}{unidad}"));
    let env = if e.env.is_empty() {
        "{}".to_string()
    } else {
        let filas: Vec<String> = e.env.iter().map(|(k, v)| format!("{s2}{}: {}", cadena(k), cadena(v))).collect();
        format!("{{{eol}{}{eol}{s1}}}", filas.join(&format!(",{eol}")))
    };
    format!(
        "{nombre}: {{{eol}{s1}\"type\": \"stdio\",{eol}{s1}\"command\": {},{eol}{s1}\"args\": [{eol}{s2}\"--mcp\"{eol}{s1}],{eol}{s1}\"env\": {env}{eol}{sangria}}}",
        cadena(&e.comando)
    )
}

/// Un único cambio sobre el texto: se quita `ini..fin` y se pone `nuevo`.
struct Empalme {
    ini: usize,
    fin: usize,
    nuevo: String,
}

impl Empalme {
    fn aplicar(&self, t: &str) -> String {
        format!("{}{}{}", &t[..self.ini], self.nuevo, &t[self.fin..])
    }
}

fn estilo_de(t: &str) -> (&'static str, bool) {
    (if t.contains("\r\n") { "\r\n" } else { "\n" }, !t.contains('\n'))
}

/// Dónde y qué escribir para añadir la entrada.
fn empalme_de_alta(t: &str, e: &Entrada) -> Result<Empalme, String> {
    let raiz = raiz_de(t)?;
    let (eol, compacto) = estilo_de(t);
    let unidad = raiz.miembros.first().and_then(|m| sangria_de(t, m.ini)).filter(|s| !s.is_empty()).unwrap_or("  ");
    let servidores = unico(&raiz, "mcpServers")?;
    match servidores {
        Some(m) => {
            let lista = objeto_en(t, m.ini_valor).ok_or("«mcpServers» no es una lista de servidores")?;
            if lista.miembros.iter().any(|x| x.clave == NOMBRE_EN_CLAUDE) {
                return Err("ya hay una entrada «adeorq»".to_string());
            }
            let sangria_clave = if compacto { "" } else { sangria_de(t, m.ini).unwrap_or("") };
            let sangria = format!("{sangria_clave}{unidad}");
            let entrada = texto_de(e, &sangria, unidad, eol, compacto);
            Ok(match lista.miembros.last() {
                Some(ultimo) if compacto => Empalme { ini: ultimo.fin, fin: ultimo.fin, nuevo: format!(",{entrada}") },
                Some(ultimo) => Empalme { ini: ultimo.fin, fin: ultimo.fin, nuevo: format!(",{eol}{sangria}{entrada}") },
                None if compacto => Empalme { ini: lista.abre + 1, fin: lista.cierra, nuevo: entrada },
                None => Empalme { ini: lista.abre + 1, fin: lista.cierra, nuevo: format!("{eol}{sangria}{entrada}{eol}{sangria_clave}") },
            })
        }
        None => {
            let dentro = format!("{unidad}{unidad}");
            let entrada = texto_de(e, &dentro, unidad, eol, compacto);
            let miembro = if compacto {
                format!("\"mcpServers\":{{{entrada}}}")
            } else {
                format!("\"mcpServers\": {{{eol}{dentro}{entrada}{eol}{unidad}}}")
            };
            Ok(match raiz.miembros.last() {
                Some(ultimo) if compacto => Empalme { ini: ultimo.fin, fin: ultimo.fin, nuevo: format!(",{miembro}") },
                Some(ultimo) => Empalme { ini: ultimo.fin, fin: ultimo.fin, nuevo: format!(",{eol}{unidad}{miembro}") },
                None if compacto => Empalme { ini: raiz.abre + 1, fin: raiz.cierra, nuevo: miembro },
                None => Empalme { ini: raiz.abre + 1, fin: raiz.cierra, nuevo: format!("{eol}{unidad}{miembro}{eol}") },
            })
        }
    }
}

/// Dónde y qué quitar para sacar la entrada, o `None` si no está.
fn empalme_de_baja(t: &str) -> Result<Option<Empalme>, String> {
    let raiz = raiz_de(t)?;
    let Some(m) = unico(&raiz, "mcpServers")? else { return Ok(None) };
    let Some(lista) = objeto_en(t, m.ini_valor) else { return Ok(None) };
    let Some(k) = lista.miembros.iter().position(|x| x.clave == NOMBRE_EN_CLAUDE) else { return Ok(None) };
    if lista.miembros.iter().filter(|x| x.clave == NOMBRE_EN_CLAUDE).count() > 1 {
        return Err("«adeorq» aparece dos veces".to_string());
    }
    let n = lista.miembros.len();
    Ok(Some(if n == 1 {
        Empalme { ini: lista.abre + 1, fin: lista.cierra, nuevo: String::new() }
    } else if k > 0 {
        Empalme { ini: lista.miembros[k - 1].fin, fin: lista.miembros[k].fin, nuevo: String::new() }
    } else {
        Empalme { ini: lista.miembros[0].ini, fin: lista.miembros[1].ini, nuevo: String::new() }
    }))
}

/// Lo que el texto tiene que ser tras el cambio, leído con un lector de JSON de verdad.
fn comprobar(antes: &str, despues: &str, cambio: impl Fn(&mut Value)) -> Result<(), String> {
    let mut esperado: Value = serde_json::from_str(antes).map_err(|e| format!("antes no se leía ({e})"))?;
    cambio(&mut esperado);
    let leido: Value = serde_json::from_str(despues).map_err(|e| format!("quedaría un archivo que no se lee ({e})"))?;
    if leido != esperado {
        return Err("lo que quedaría escrito no es solo el cambio pedido".to_string());
    }
    Ok(())
}

/// El texto con la entrada añadida. Lo que no se entienda, no se escribe.
pub fn con_entrada(t: &str, e: &Entrada) -> Result<String, String> {
    let nuevo = empalme_de_alta(t, e)?.aplicar(t);
    let entrada = json_de(e);
    comprobar(t, &nuevo, |v| {
        if let Some(raiz) = v.as_object_mut() {
            if let Some(Value::Object(lista)) = raiz.get_mut("mcpServers") {
                lista.insert(NOMBRE_EN_CLAUDE.to_string(), entrada.clone());
            } else {
                raiz.insert("mcpServers".to_string(), json!({ NOMBRE_EN_CLAUDE: entrada.clone() }));
            }
        }
    })?;
    Ok(nuevo)
}

/// El texto sin la entrada. `Ok(None)` si no estaba.
pub fn sin_entrada(t: &str) -> Result<Option<String>, String> {
    let Some(empalme) = empalme_de_baja(t)? else { return Ok(None) };
    let nuevo = empalme.aplicar(t);
    comprobar(t, &nuevo, |v| {
        if let Some(lista) = v.get_mut("mcpServers").and_then(Value::as_object_mut) {
            lista.remove(NOMBRE_EN_CLAUDE);
        }
    })?;
    Ok(Some(nuevo))
}

/// Un archivo que no existía: solo lo nuestro.
fn archivo_nuevo(e: &Entrada) -> Result<String, String> {
    con_entrada("{}\n", e).map(|t| t.trim_end().to_string() + "\n")
}

// ── Cómo está una cuenta ─────────────────────────────────────────────────────

/// Mira la entrada `adeorq` de un texto ya leído.
pub fn estado_de(t: &str) -> (Estado, Option<String>) {
    // Se lee por el texto (que es por donde se escribe) y por un lector de JSON de
    // verdad: si uno de los dos no lo entiende, no se toca.
    let raiz = match raiz_de(t) {
        Ok(r) => r,
        Err(motivo) => return (Estado::NoEntendido, Some(motivo)),
    };
    if let Err(motivo) = unico(&raiz, "mcpServers") {
        return (Estado::NoEntendido, Some(motivo));
    }
    let Ok(valor) = serde_json::from_str::<Value>(t) else {
        return (Estado::NoEntendido, Some("no se lee como JSON".to_string()));
    };
    let servidores = match valor.get("mcpServers") {
        None => return (Estado::Libre, None),
        Some(Value::Object(s)) => s,
        Some(_) => return (Estado::NoEntendido, Some("«mcpServers» no es una lista de servidores".to_string())),
    };
    let Some(entrada) = servidores.get(NOMBRE_EN_CLAUDE) else { return (Estado::Libre, None) };
    // Es la nuestra si lanza un programa con `--mcp` por la entrada estándar: lo que
    // escribe esta pantalla y lo que dice la guía.
    let por_stdio = entrada.get("type").and_then(Value::as_str).is_none_or(|t| t == "stdio");
    let con_mcp = entrada.get("args").and_then(Value::as_array).is_some_and(|a| a.iter().any(|x| x.as_str() == Some("--mcp")));
    let comando = entrada.get("command").and_then(Value::as_str);
    match comando {
        Some(c) if por_stdio && con_mcp => (Estado::Conectado, Some(c.to_string())),
        _ => (Estado::Ajena, Some("no lanza el enlace de Adeorq".to_string())),
    }
}

fn misma_ruta(a: &str, b: &str) -> bool {
    let norma = |s: &str| s.trim().trim_matches('"').replace('/', "\\").to_lowercase();
    norma(a) == norma(b)
}

fn archivo_de(carpeta: Option<&Path>) -> Option<PathBuf> {
    match carpeta {
        Some(c) => Some(c.join(".claude.json")),
        None => crate::dir_casa().map(|c| c.join(".claude.json")),
    }
}

/// Las cuentas de Claude que conoce Adeorq: la de siempre y las que creó, que viven en
/// `accounts\claude-*`. Cada una es una carpeta que Claude Code lee entera (`CLAUDE_CONFIG_DIR`).
fn carpetas_de_cuentas() -> Vec<(String, Option<PathBuf>)> {
    let mut v = vec![("principal".to_string(), None)];
    if let Ok(raiz) = crate::dir_datos().map(|d| d.join("accounts")) {
        let mut propias: Vec<(String, PathBuf)> = std::fs::read_dir(raiz)
            .into_iter()
            .flatten()
            .flatten()
            .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
            .map(|e| (e.file_name().to_string_lossy().to_string(), e.path()))
            .filter(|(n, _)| n.starts_with("claude-"))
            .collect();
        propias.sort();
        v.extend(propias.into_iter().map(|(n, p)| (n, Some(p))));
    }
    v
}

fn entrada_con_el_enlace() -> Result<Entrada, String> {
    let comando = crate::mcp_estable::ruta_del_enlace()?.to_string_lossy().to_string();
    // El puerto va si esta Adeorq usa otro, como una aislada de pruebas: sin él, su
    // Claude Code hablaría con la Adeorq de verdad.
    let env = std::env::var("ADEORQ_MCP_PUERTO").ok().filter(|p| !p.trim().is_empty()).map(|p| vec![("ADEORQ_MCP_PUERTO".to_string(), p)]).unwrap_or_default();
    Ok(Entrada { comando, env })
}

fn leer_cuenta(id: &str, carpeta: Option<&Path>, enlace: Option<&str>) -> CuentaDeClaude {
    let archivo = archivo_de(carpeta).unwrap_or_default();
    let (existe, estado, detalle) = match std::fs::read_to_string(&archivo) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (false, Estado::Libre, None),
        Err(e) => (true, Estado::NoEntendido, Some(format!("no pude leerlo: {e}"))),
        Ok(t) => {
            let (estado, detalle) = estado_de(&t);
            // A dónde apunta solo se cuenta si no es al sitio de siempre.
            let detalle = match (estado, detalle, enlace) {
                (Estado::Conectado, Some(c), Some(e)) if misma_ruta(&c, e) => None,
                (_, d, _) => d,
            };
            (true, estado, detalle)
        }
    };
    CuentaDeClaude {
        id: id.to_string(),
        carpeta: carpeta.map(|c| c.to_string_lossy().to_string()).unwrap_or_default(),
        archivo: archivo.to_string_lossy().to_string(),
        existe,
        estado,
        detalle,
    }
}

fn plan() -> Result<Plan, String> {
    let e = entrada_con_el_enlace()?;
    let cuentas = carpetas_de_cuentas().iter().map(|(id, c)| leer_cuenta(id, c.as_deref(), Some(&e.comando))).collect();
    let instalado = !crate::accounts::detect_clis(vec![("claude".to_string(), "claude".to_string())]).is_empty();
    Ok(Plan { cuentas, comando: format!("\"{}\" --mcp", e.comando), instalado })
}

/// La cuenta que dice la ventana, y solo si es una de las que conoce Adeorq: ese texto
/// viene de fuera y acaba siendo una ruta que se escribe. Devuelve su carpeta y su archivo.
fn cuenta_pedida(id: &str) -> Result<(Option<PathBuf>, PathBuf), String> {
    let (_, carpeta) = carpetas_de_cuentas().into_iter().find(|(n, _)| n == id).ok_or_else(|| format!("No conozco la cuenta «{id}»."))?;
    let archivo = archivo_de(carpeta.as_deref()).ok_or("No sé cuál es tu carpeta de usuario.")?;
    Ok((carpeta, archivo))
}

/// Cuánto se espera al candado de Claude Code, y desde cuándo se da por muerto.
#[derive(Clone, Copy)]
struct Paciencia {
    espera: std::time::Duration,
    vieja: std::time::Duration,
}

const PACIENCIA: Paciencia = Paciencia { espera: std::time::Duration::from_secs(3), vieja: std::time::Duration::from_secs(10) };

/// El candado de Claude Code puesto por Adeorq: se quita al soltarlo.
struct Candado(PathBuf);

impl Drop for Candado {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir(&self.0);
    }
}

/// Claude Code guarda su `.claude.json` con una carpeta `<archivo>.lock` puesta
/// (`proper-lockfile`, medido en la 2.1.318: «saveConfigWithLock», y la 2.1.318 la da
/// por muerta a los 10 s sin tocarla). Sin ella, lo que él guardara entre que Adeorq
/// lee y escribe se perdía: un «permitir siempre», un `claude mcp add`. `None` si la
/// carpeta del archivo no existe: ahí no hay nadie con quien pisarse.
fn candado_de_claude(archivo: &Path, p: Paciencia) -> Result<Option<Candado>, String> {
    let nombre = archivo.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let ruta = archivo.with_file_name(format!("{nombre}.lock"));
    let hasta = std::time::Instant::now() + p.espera;
    loop {
        match std::fs::create_dir(&ruta) {
            Ok(()) => return Ok(Some(Candado(ruta))),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                let muerto = std::fs::metadata(&ruta).and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok()).is_some_and(|edad| edad >= p.vieja);
                if muerto {
                    let _ = std::fs::remove_dir(&ruta);
                } else if std::time::Instant::now() >= hasta {
                    return Err("Claude Code está guardando su archivo justo ahora. Vuelve a pulsar.".to_string());
                } else {
                    std::thread::sleep(std::time::Duration::from_millis(25));
                }
            }
            Err(e) => return Err(format!("no pude poner el candado de Claude Code en {}: {e}", ruta.display())),
        }
    }
}

/// `retocar_con_copia` sobre el archivo de una cuenta de Claude, con su candado puesto.
fn retocar_como_claude(archivo: &Path, crear: bool, paciencia: Paciencia, cambio: impl Fn(&str) -> Result<String, String>) -> Result<Option<PathBuf>, String> {
    let _candado = candado_de_claude(archivo, paciencia)?;
    crate::mcp_estable::retocar_con_copia(archivo, crear, cambio)
}

// ── Los comandos de la ventana ───────────────────────────────────────────────

#[tauri::command(async)]
pub fn claude_conexiones() -> Result<Plan, String> {
    plan()
}

#[tauri::command(async)]
pub fn claude_conectar(cuenta: String) -> Result<Resultado, String> {
    let (carpeta, archivo) = cuenta_pedida(&cuenta)?;
    let e = entrada_con_el_enlace()?;
    let existia = archivo.exists();
    let copia = retocar_como_claude(&archivo, true, PACIENCIA, |t| {
        if !existia && t.is_empty() {
            return archivo_nuevo(&e);
        }
        match estado_de(t) {
            (Estado::Conectado, _) => Err("Ya está conectado.".to_string()),
            (Estado::Ajena, _) => Err("Ya hay en ese archivo una entrada llamada «adeorq» que no es la de Adeorq: no la he tocado.".to_string()),
            (Estado::NoEntendido, motivo) => Err(format!("No entiendo ese archivo ({}), así que no lo he tocado.", motivo.unwrap_or_default())),
            (Estado::Libre, _) => con_entrada(t, &e),
        }
    })?;
    // Claude Code reescribe este archivo cuando quiere, con lo que tuviera en memoria:
    // se mira que lo nuestro siga ahí un momento después.
    std::thread::sleep(std::time::Duration::from_millis(300));
    if leer_cuenta(&cuenta, carpeta.as_deref(), Some(&e.comando)).estado != Estado::Conectado {
        return Err("Claude Code acaba de reescribir su archivo y no se ha quedado. Vuelve a pulsar.".to_string());
    }
    crate::anotar(&format!("Claude Code ({cuenta}): conectado a las herramientas de Adeorq."));
    Ok(Resultado { plan: plan()?, copia: copia.map(|c| c.to_string_lossy().to_string()) })
}

#[tauri::command(async)]
pub fn claude_desconectar(cuenta: String) -> Result<Resultado, String> {
    let (_, archivo) = cuenta_pedida(&cuenta)?;
    let copia = if archivo.exists() {
        retocar_como_claude(&archivo, false, PACIENCIA, |t| match estado_de(t) {
            (Estado::Libre, _) => Err("Ya estaba desconectado.".to_string()),
            (Estado::Ajena, _) => Err("La entrada «adeorq» de ese archivo no es la de Adeorq: no la he tocado.".to_string()),
            (Estado::NoEntendido, motivo) => Err(format!("No entiendo ese archivo ({}), así que no lo he tocado.", motivo.unwrap_or_default())),
            (Estado::Conectado, _) => sin_entrada(t).and_then(|n| n.ok_or_else(|| "Ya no estaba.".to_string())),
        })?
    } else {
        None
    };
    crate::anotar(&format!("Claude Code ({cuenta}): desconectado de las herramientas de Adeorq."));
    Ok(Resultado { plan: plan()?, copia: copia.map(|c| c.to_string_lossy().to_string()) })
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn e() -> Entrada {
        Entrada { comando: r"C:\Users\x\AppData\Local\Adeorq\mcp\adeorq.exe".into(), env: vec![] }
    }

    /// Un `.claude.json` con la forma del de verdad (orden que no es alfabético, otros
    /// servidores, números que un lector de JSON corrientes cambia, otros proyectos).
    const REAL: &str = "{\n  \"numStartups\": 482,\n  \"installMethod\": \"native\",\n  \"autoUpdates\": false,\n  \"big\": 12345678901234567890,\n  \"exp\": 1.5e300,\n  \"mcpServers\": {\n    \"playwright\": {\n      \"type\": \"stdio\",\n      \"command\": \"npx\",\n      \"args\": [\n        \"@playwright/mcp@latest\"\n      ],\n      \"env\": {}\n    },\n    \"remoto\": {\n      \"type\": \"http\",\n      \"url\": \"https://example.com/mcp\",\n      \"headers\": {\n        \"X-Test\": \"ñandú ✓ } , \\\" {\"\n      }\n    }\n  },\n  \"projects\": {\n    \"C:/x\": {\n      \"mcpServers\": {\n        \"adeorq\": { \"command\": \"viejo\" }\n      }\n    }\n  }\n}\n";

    #[test]
    fn conectar_y_desconectar_deja_el_archivo_byte_a_byte() {
        let con = con_entrada(REAL, &e()).unwrap();
        // El archivo de antes es el de ahora menos un único trozo, en medio de nada suyo.
        let sin = sin_entrada(&con).unwrap().unwrap();
        assert_eq!(sin, REAL, "{con}");
        // La entrada está donde Claude Code la pone, con su forma, y lo demás ni se mueve.
        assert!(con.contains("    \"adeorq\": {\n      \"type\": \"stdio\",\n      \"command\": \"C:\\\\Users\\\\x\\\\AppData\\\\Local\\\\Adeorq\\\\mcp\\\\adeorq.exe\",\n      \"args\": [\n        \"--mcp\"\n      ],\n      \"env\": {}\n    }\n  },\n  \"projects\""), "{con}");
        assert!(con.contains("12345678901234567890") && con.contains("1.5e300") && con.contains("\"autoUpdates\": false"));
        assert_eq!(estado_de(&con).0, Estado::Conectado);
        assert_eq!(estado_de(REAL).0, Estado::Libre, "la de un proyecto no cuenta como la de la cuenta");
    }

    fn vuelve(t: &str) {
        let con = con_entrada(t, &e()).unwrap_or_else(|m| panic!("{m}\n{t:?}"));
        assert_eq!(estado_de(&con).0, Estado::Conectado, "{con:?}");
        let sin = sin_entrada(&con).unwrap().unwrap();
        let antes: Value = serde_json::from_str(t).unwrap();
        let mut despues: Value = serde_json::from_str(&sin).unwrap();
        // Si no había lista de servidores, queda vacía: lo mismo para quien lo lee.
        if antes.get("mcpServers").is_none() {
            despues.as_object_mut().unwrap().remove("mcpServers");
        }
        assert_eq!(antes, despues, "{sin:?}");
    }

    #[test]
    fn todas_las_formas_de_escribirlo_vuelven_a_lo_que_eran() {
        vuelve("{}");
        vuelve("{ }");
        vuelve("{\n}\n");
        vuelve("{\"mcpServers\":{}}");
        vuelve("{\n  \"mcpServers\": {}\n}");
        vuelve("{\n  \"mcpServers\": {\n  }\n}\n");
        vuelve("{\n  \"a\": 1\n}");
        vuelve("{\"a\":1,\"mcpServers\":{\"x\":{\"command\":\"y\"}},\"z\":[1,2,{\"mcpServers\":3}]}");
        vuelve("{\r\n  \"a\": 1,\r\n  \"mcpServers\": {\r\n    \"x\": {}\r\n  }\r\n}\r\n");
        vuelve("{\n\t\"a\": 1,\n\t\"mcpServers\": {\n\t\t\"x\": {}\n\t}\n}\n");
        vuelve("{\n    \"a\": 1,\n    \"mcpServers\": {\n        \"x\": {}\n    },\n    \"b\": 2\n}");
        vuelve("  {  \"mcpServers\"  :  {  \"x\"  :  1  }  }  ");
        vuelve("{\"\\u006dcpServers\":{\"x\":1}}");
        vuelve("{\"ñ\":\"✓\",\"mcpServers\":{\"ñandú\":{\"a\":\"}\"}}}");
    }

    #[test]
    fn la_baja_sin_la_primera_del_medio_y_la_ultima() {
        let tres = "{\n  \"mcpServers\": {\n    \"a\": 1,\n    \"adeorq\": {\"command\": \"x\", \"args\": [\"--mcp\"]},\n    \"b\": 2\n  }\n}\n";
        assert_eq!(sin_entrada(tres).unwrap().unwrap(), "{\n  \"mcpServers\": {\n    \"a\": 1,\n    \"b\": 2\n  }\n}\n");
        let primera = "{\"mcpServers\":{\"adeorq\":{\"command\":\"x\",\"args\":[\"--mcp\"]},\"b\":2}}";
        assert_eq!(sin_entrada(primera).unwrap().unwrap(), "{\"mcpServers\":{\"b\":2}}");
        let sola = "{\"mcpServers\":{\"adeorq\":{}}}";
        assert_eq!(sin_entrada(sola).unwrap().unwrap(), "{\"mcpServers\":{}}");
        assert_eq!(sin_entrada("{\"mcpServers\":{}}").unwrap(), None);
        assert_eq!(sin_entrada("{}").unwrap(), None);
    }

    #[test]
    fn lo_que_no_se_entiende_no_se_escribe() {
        for malo in [
            "",
            "   ",
            "\u{feff}{}",
            "[]",
            "{",
            "{\"a\": 1,}",
            "{\"a\": 1} // comentario",
            "// comentario\n{}",
            "{\"a\": 1}{\"b\": 2}",
            "{\"mcpServers\": [], \"a\": 1}",
            "{\"mcpServers\": 3}",
            "{\"mcpServers\": {}, \"mcpServers\": {}}",
            "{\"mcpServers\": {\"adeorq\": {}}}",
            "{\"a\": 'x'}",
            "no es json",
        ] {
            assert!(con_entrada(malo, &e()).is_err(), "se habría escrito en {malo:?}");
        }
        assert_eq!(estado_de("").0, Estado::NoEntendido);
        assert_eq!(estado_de("{\"mcpServers\": 3}").0, Estado::NoEntendido);
        assert_eq!(estado_de("[1]").0, Estado::NoEntendido);
    }

    #[test]
    fn solo_la_que_lanza_el_enlace_es_nuestra() {
        let con = |entrada: &str| format!("{{\"mcpServers\":{{\"adeorq\":{entrada}}}}}");
        assert_eq!(estado_de(&con(r#"{"type":"stdio","command":"C:\\a\\adeorq.exe","args":["--mcp"],"env":{}}"#)).0, Estado::Conectado);
        assert_eq!(estado_de(&con(r#"{"command":"/opt/adeorq","args":["--mcp"]}"#)).0, Estado::Conectado, "como lo deja la guía: sin type");
        assert_eq!(estado_de(&con(r#"{"type":"http","url":"https://x"}"#)).0, Estado::Ajena);
        assert_eq!(estado_de(&con(r#"{"command":"node","args":["servidor.js"]}"#)).0, Estado::Ajena);
        assert_eq!(estado_de(&con("3")).0, Estado::Ajena);
        // Una ajena ni se quita ni se pisa.
        let ajena = con(r#"{"type":"http","url":"https://x"}"#);
        assert!(con_entrada(&ajena, &e()).is_err());
    }

    #[test]
    fn un_archivo_nuevo_trae_solo_lo_nuestro() {
        let t = archivo_nuevo(&e()).unwrap();
        let v: Value = serde_json::from_str(&t).unwrap();
        assert_eq!(v, json!({ "mcpServers": { "adeorq": json_de(&e()) } }));
        assert!(t.ends_with("}\n"));
        assert_eq!(estado_de(&t).0, Estado::Conectado);
    }

    #[test]
    fn el_puerto_de_una_aislada_va_en_la_entrada() {
        let con_puerto = Entrada { comando: "/o/adeorq".into(), env: vec![("ADEORQ_MCP_PUERTO".into(), "47123".into())] };
        let t = con_entrada("{\n  \"mcpServers\": {}\n}\n", &con_puerto).unwrap();
        let v: Value = serde_json::from_str(&t).unwrap();
        assert_eq!(v["mcpServers"]["adeorq"]["env"]["ADEORQ_MCP_PUERTO"], "47123");
        assert!(t.contains("\"env\": {\n        \"ADEORQ_MCP_PUERTO\": \"47123\"\n      }"), "{t}");
        assert_eq!(sin_entrada(&t).unwrap().unwrap(), "{\n  \"mcpServers\": {}\n}\n");
        let compacto = con_entrada("{\"a\":1}", &con_puerto).unwrap();
        assert!(!compacto.contains('\n'), "{compacto}");
        assert_eq!(serde_json::from_str::<Value>(&compacto).unwrap()["mcpServers"]["adeorq"]["env"]["ADEORQ_MCP_PUERTO"], "47123");
    }

    /// Un generador sin dependencias: mismos archivos en cada pasada.
    struct Azar(u64);
    impl Azar {
        fn siguiente(&mut self) -> u64 {
            self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            self.0 >> 33
        }
        fn hasta(&mut self, n: u64) -> u64 {
            self.siguiente() % n
        }
    }

    fn valor_al_azar(a: &mut Azar, prof: u32) -> String {
        let cadenas = ["x", "ñandú ✓", "a\\\"b", "}{][,:", "C:\\\\r\\\\adeorq.exe", "", "mcpServers", "adeorq", "\\u00e9"];
        match a.hasta(if prof > 2 { 4 } else { 7 }) {
            0 => a.hasta(100000).to_string(),
            1 => format!("\"{}\"", cadenas[a.hasta(cadenas.len() as u64) as usize]),
            2 => ["true", "false", "null", "1.5e300", "-0.25", "12345678901234567890"][a.hasta(6) as usize].to_string(),
            3 => format!("\"{}\"", cadenas[a.hasta(cadenas.len() as u64) as usize]),
            4 | 5 => {
                let n = a.hasta(4);
                let miembros: Vec<String> = (0..n).map(|i| format!("\"k{i}{}\":{}", a.hasta(3), valor_al_azar(a, prof + 1))).collect();
                format!("{{{}}}", miembros.join(","))
            }
            _ => {
                let n = a.hasta(4);
                let items: Vec<String> = (0..n).map(|_| valor_al_azar(a, prof + 1)).collect();
                format!("[{}]", items.join(","))
            }
        }
    }

    /// Re-escribe un JSON con la sangría de Claude Code, a mano (los espacios se meten
    /// entre las fichas, que es donde un lector de JSON no los distingue).
    fn con_espacios(t: &str, a: &mut Azar, estilo: u64) -> String {
        if estilo == 0 {
            return t.to_string();
        }
        let b = t.as_bytes();
        let mut salida = String::new();
        let mut prof = 0usize;
        let mut i = 0;
        let eol = if estilo == 3 { "\r\n" } else { "\n" };
        let unidad = if estilo == 2 { "\t" } else { "  " };
        while i < b.len() {
            match b[i] {
                b'"' => {
                    let fin = fin_de_cadena(b, i).unwrap();
                    salida.push_str(&t[i..fin]);
                    i = fin;
                    continue;
                }
                b'{' | b'[' => {
                    salida.push(b[i] as char);
                    prof += 1;
                    if !matches!(b.get(i + 1), Some(b'}') | Some(b']')) {
                        salida.push_str(eol);
                        salida.push_str(&unidad.repeat(prof));
                    }
                }
                b'}' | b']' => {
                    prof -= 1;
                    if !matches!(b.get(i.wrapping_sub(1)), Some(b'{') | Some(b'[')) {
                        salida.push_str(eol);
                        salida.push_str(&unidad.repeat(prof));
                    }
                    salida.push(b[i] as char);
                }
                b',' => {
                    salida.push(',');
                    salida.push_str(eol);
                    salida.push_str(&unidad.repeat(prof));
                }
                b':' => salida.push_str(if a.hasta(5) == 0 { " : " } else { ": " }),
                c => salida.push(c as char),
            }
            i += 1;
        }
        if a.hasta(2) == 0 {
            salida.push_str(eol);
        }
        salida
    }

    #[test]
    fn mil_archivos_al_azar_nunca_pierden_nada() {
        let mut azar = Azar(20261104);
        let (mut escritos, mut rechazados) = (0, 0);
        for n in 0..1500 {
            let miembros: Vec<String> = (0..azar.hasta(6)).map(|i| {
                let nombre = if azar.hasta(4) == 0 { "mcpServers".to_string() } else { format!("raiz{i}") };
                let valor = if nombre == "mcpServers" && azar.hasta(3) > 0 {
                    let servidores: Vec<String> = (0..azar.hasta(3)).map(|j| format!("\"s{j}\":{}", valor_al_azar(&mut azar, 1))).collect();
                    format!("{{{}}}", servidores.join(","))
                } else {
                    valor_al_azar(&mut azar, 0)
                };
                format!("\"{nombre}\":{valor}")
            }).collect();
            let crudo = format!("{{{}}}", miembros.join(","));
            let estilo = azar.hasta(4);
            let t = con_espacios(&crudo, &mut azar, estilo);
            let leido: Result<Value, _> = serde_json::from_str(&t);
            match con_entrada(&t, &e()) {
                Ok(con) => {
                    escritos += 1;
                    let antes = leido.unwrap_or_else(|x| panic!("se escribió en un archivo que no se leía ({x}): {t:?}"));
                    let despues: Value = serde_json::from_str(&con).unwrap_or_else(|x| panic!("quedó un archivo que no se lee ({x}): {con:?}"));
                    let mut esperado = antes.clone();
                    esperado.as_object_mut().unwrap().entry("mcpServers").or_insert(json!({})).as_object_mut().unwrap().insert("adeorq".into(), json_de(&e()));
                    assert_eq!(despues, esperado, "n={n}\n{t:?}\n{con:?}");
                    // Fuera del trozo escrito, ni un byte distinto.
                    let empalme = empalme_de_alta(&t, &e()).unwrap();
                    assert_eq!(&con[..empalme.ini], &t[..empalme.ini]);
                    assert_eq!(&con[con.len() - (t.len() - empalme.fin)..], &t[empalme.fin..]);
                    let sin = sin_entrada(&con).unwrap().unwrap();
                    let mut vuelto: Value = serde_json::from_str(&sin).unwrap();
                    if antes.get("mcpServers").is_none() {
                        vuelto.as_object_mut().unwrap().remove("mcpServers");
                    }
                    assert_eq!(vuelto, antes, "n={n}\n{t:?}");
                    // Si la lista ya llevaba algo, quitar lo nuestro deja el archivo EXACTO.
                    if antes.get("mcpServers").and_then(Value::as_object).is_some_and(|l| !l.is_empty()) {
                        assert_eq!(sin, t, "n={n}");
                    }
                }
                Err(_) => rechazados += 1,
            }
        }
        assert!(escritos > 300, "el generador no prueba lo bastante: {escritos} escritos, {rechazados} rechazados");
    }

    // ── En disco ────────────────────────────────────────────────────────────

    fn carpeta(nombre: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("adeorq-claude-conexion-{nombre}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn en_disco_deja_una_copia_y_no_toca_un_archivo_que_no_entiende() {
        let d = carpeta("disco");
        let f = d.join(".claude.json");
        std::fs::write(&f, REAL).unwrap();
        let copia = crate::mcp_estable::retocar_con_copia(&f, true, |t| con_entrada(t, &e())).unwrap().expect("tenía que dejar una copia");
        assert_eq!(std::fs::read_to_string(&copia).unwrap(), REAL, "la copia es el archivo de antes");
        assert_eq!(estado_de(&std::fs::read_to_string(&f).unwrap()).0, Estado::Conectado);
        let conectado = std::fs::read_to_string(&f).unwrap();
        let copia = crate::mcp_estable::retocar_con_copia(&f, false, |t| sin_entrada(t).and_then(|n| n.ok_or_else(|| "no estaba".into()))).unwrap().expect("tenía que dejar una copia");
        assert_eq!(std::fs::read_to_string(&f).unwrap(), REAL, "desconectar lo deja como estaba");
        assert_eq!(std::fs::read_to_string(&copia).unwrap(), conectado, "la copia es lo de antes del último cambio");

        let raro = d.join("raro.json");
        std::fs::write(&raro, "{ esto no es json").unwrap();
        assert!(crate::mcp_estable::retocar_con_copia(&raro, true, |t| con_entrada(t, &e())).is_err());
        assert_eq!(std::fs::read_to_string(&raro).unwrap(), "{ esto no es json");
        let copias = std::fs::read_dir(&d).unwrap().flatten().filter(|x| x.file_name().to_string_lossy().contains("antes-de-adeorq")).count();
        assert_eq!(copias, 1, "la del último cambio, y ninguna por lo que no se escribió");
        std::fs::remove_dir_all(&d).unwrap();
    }

    /// Claude Code guarda su `.claude.json` con la carpeta `.claude.json.lock` puesta
    /// (`proper-lockfile`, medido en la 2.1.318: «saveConfigWithLock»). Si se escribe
    /// mientras la tiene, lo que él guarde en ese momento se pierde.
    #[test]
    fn con_el_candado_de_claude_puesto_se_espera_a_que_lo_suelte() {
        use std::time::{Duration, Instant};
        let d = carpeta("candado");
        let f = d.join(".claude.json");
        std::fs::write(&f, REAL).unwrap();
        let candado = d.join(".claude.json.lock");
        std::fs::create_dir(&candado).unwrap();
        let suelta = {
            let c = candado.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(400));
                std::fs::remove_dir(&c).unwrap();
            })
        };
        let t0 = Instant::now();
        retocar_como_claude(&f, true, PACIENCIA, |t| con_entrada(t, &e())).unwrap();
        assert!(t0.elapsed() >= Duration::from_millis(350), "escribió con el candado de Claude Code puesto ({:?})", t0.elapsed());
        suelta.join().unwrap();
        assert_eq!(estado_de(&std::fs::read_to_string(&f).unwrap()).0, Estado::Conectado);
        assert!(!candado.exists(), "el que pone Adeorq lo quita al acabar");

        // Si no lo suelta, se dice y no se toca nada; el suyo se queda.
        std::fs::create_dir(&candado).unwrap();
        let antes = std::fs::read_to_string(&f).unwrap();
        let corta = Paciencia { espera: Duration::from_millis(200), vieja: Duration::from_secs(600) };
        let r = retocar_como_claude(&f, false, corta, |t| sin_entrada(t).and_then(|n| n.ok_or_else(|| "no estaba".into())));
        assert!(r.as_ref().is_err_and(|m| m.contains("Vuelve a pulsar")), "{r:?}");
        assert_eq!(std::fs::read_to_string(&f).unwrap(), antes);
        assert!(candado.is_dir(), "el candado de Claude Code no es nuestro");

        // Uno que nadie toca desde hace más de lo que aguanta `proper-lockfile` es de un
        // Claude Code que se cayó: se toma, como haría él.
        let muerto = Paciencia { espera: Duration::from_millis(200), vieja: Duration::ZERO };
        retocar_como_claude(&f, false, muerto, |t| sin_entrada(t).and_then(|n| n.ok_or_else(|| "no estaba".into()))).unwrap();
        assert_eq!(std::fs::read_to_string(&f).unwrap(), REAL);
        assert!(!candado.exists());
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn un_archivo_de_solo_lectura_no_se_toca() {
        let d = carpeta("lectura");
        let f = d.join(".claude.json");
        std::fs::write(&f, REAL).unwrap();
        let mut p = std::fs::metadata(&f).unwrap().permissions();
        p.set_readonly(true);
        std::fs::set_permissions(&f, p.clone()).unwrap();
        let r = crate::mcp_estable::retocar_con_copia(&f, true, |t| con_entrada(t, &e()));
        #[allow(clippy::permissions_set_readonly_false)]
        p.set_readonly(false);
        std::fs::set_permissions(&f, p).unwrap();
        assert!(r.unwrap_err().contains("solo lectura"));
        assert_eq!(std::fs::read_to_string(&f).unwrap(), REAL);
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn una_cuenta_que_no_conoce_adeorq_no_se_escribe() {
        assert!(cuenta_pedida("../../etc").is_err());
        assert!(cuenta_pedida("C:\\Windows").is_err());
        assert!(cuenta_pedida("").is_err());
        assert!(claude_conectar("claude-que-no-existe".into()).is_err());
        assert!(claude_desconectar("..".into()).is_err());
        assert!(cuenta_pedida("principal").is_ok() || crate::dir_casa().is_none());
    }

    #[test]
    fn las_rutas_se_comparan_como_las_compara_windows() {
        assert!(misma_ruta("C:/A/b.exe", r"c:\a\B.EXE"));
        assert!(misma_ruta("\"C:\\a\"", r"C:\a"));
        assert!(!misma_ruta(r"C:\a", r"C:\b"));
    }
}
