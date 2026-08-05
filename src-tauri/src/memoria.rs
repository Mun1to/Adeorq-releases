// El segundo cerebro: sus notas de Obsidian, dentro de Adeorq.
//
// No se importa nada y no se copia nada. La bóveda sigue siendo una carpeta de
// markdown en su disco, se abre con Obsidian como siempre y Adeorq la lee
// donde está. Copiarla habría creado dos verdades que divergen el mismo día.
//
// Lo que aquí sí puede hacerse y en Obsidian no es enlazar una nota con la
// SESIÓN que la produjo y con el proyecto donde pasó; eso viene después. Este
// módulo es lo de debajo: encontrar los documentos, leerlos, guardarlos sin
// romperlos y saber quién enlaza a quién.
//
// **La red no son los wikilinks.** Medido en la bóveda real de Munir el
// 2026-08-02: 517 documentos con 24 enlaces `[[así]]` repartidos entre 7
// archivos, y 975 enlaces markdown normales `[texto](archivo.md)` en 173. Un
// grafo que solo entendiera los primeros habría salido con siete puntos unidos
// y quinientos sueltos, o sea vacío. Se leen las dos formas.
//
// Escribir da miedo por un motivo concreto y escrito en `docs/METAS.md`: una
// memoria que corrompe notas de dos años es un daño que no se deshace. Por eso
// `memoria_write` no escribe encima jamás: escribe al lado y renombra de
// golpe, y antes comprueba que el archivo sigue siendo el que leíste.

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

/// Carpetas que no son cerebro de nadie. Sin esto, `C:\proyectos` son medio
/// millón de archivos de dependencias y el escaneo no termina nunca.
const SALTAR: [&str; 12] = [
    "node_modules",
    "target",
    "dist",
    "build",
    "vendor",
    "coverage",
    "out",
    ".next",
    ".nuxt",
    "__pycache__",
    "Pods",
    "bin",
];

/// Un markdown más grande que esto no es una nota, es un volcado. Leerlo
/// entero para buscar dentro no compensa.
const MAX_DOC: u64 = 2 * 1024 * 1024;

/// Tope de carpetas anidadas. Un enlace simbólico circular es raro, pero deja
/// la app colgada sin ventana donde pararlo.
const MAX_HONDO: usize = 12;

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Doc {
    /// Ruta relativa a la bóveda, siempre con `/`. Es el identificador: es
    /// estable, se lee y sirve para resolver un enlace relativo.
    pub id: String,
    /// El primer `# encabezado`, y si no lo hay, el nombre del archivo. Un
    /// documento sin título no existe para quien busca.
    pub title: String,
    /// La carpeta que lo contiene, relativa. Vacía en la raíz. Es lo que da el
    /// color en el grafo: el proyecto de una nota, no una raya más.
    pub folder: String,
    /// Última escritura, en milisegundos.
    pub stamp: u64,
    pub words: u32,
    /// A qué otros documentos enlaza, ya resueltos a ids de esta bóveda. Los
    /// enlaces que no llevan a ningún archivo de aquí se descartan: una flecha
    /// a la nada no es información.
    pub links: Vec<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Vault {
    pub root: String,
    pub docs: Vec<Doc>,
    /// Cuántos archivos se miraron, incluidos los que no entraron por tamaño.
    pub vistos: u32,
    /// Si la carpeta tiene un `.obsidian` dentro, o sea si es una bóveda de
    /// verdad y no una carpeta cualquiera con markdown.
    pub obsidian: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DocText {
    pub id: String,
    pub text: String,
    pub stamp: u64,
    /// La ruta entera, para poder abrirla fuera de Adeorq.
    pub path: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    pub id: String,
    pub title: String,
    /// El trozo donde aparece lo buscado, con lo de alrededor. Sin esto, una
    /// lista de resultados obliga a abrirlos uno a uno para saber cuál era.
    pub excerpt: String,
    /// Cuántas veces aparece en ese documento.
    pub hits: u32,
    /// Para ordenar: el título pesa más que el cuerpo.
    pub score: u32,
}

/// El índice vivo. Guardar el TEXTO en memoria es lo que permite buscar
/// mientras se escribe: son diez megas en la bóveda real, y releer quinientos
/// archivos del disco en cada tecla sí se nota.
#[derive(Default)]
pub struct Indice {
    pub root: String,
    pub docs: Vec<Doc>,
    pub texto: HashMap<String, String>,
}

#[derive(Default)]
pub struct MemoriaCache(pub Mutex<Indice>);

/* ------------------------------------------------------------------ rutas */

/// El id que manda la ventana se convierte en una ruta REAL comprobando que no
/// se sale de la bóveda. Sin esto, un `..\..\.ssh\id_rsa` sería un documento
/// más: quien toca el disco es este módulo, así que la comprobación vive aquí.
fn ruta_de(root: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() {
        return Err("documento sin nombre".into());
    }
    let rel = PathBuf::from(id.replace('/', std::path::MAIN_SEPARATOR_STR));
    for c in rel.components() {
        match c {
            Component::Normal(_) => {}
            _ => return Err("ruta de documento no válida".into()),
        }
    }
    if rel.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("md")) != Some(true) {
        return Err("solo se abren archivos .md".into());
    }
    Ok(root.join(rel))
}

fn stamp_de(p: &Path) -> u64 {
    std::fs::metadata(p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/* --------------------------------------------------------------- lectura */

/// El título de un documento: su primer `# encabezado`, y si no tiene, el
/// nombre del archivo. Se mira solo el principio porque un `# ` en la línea
/// cuatrocientas es una sección, no el título.
fn titulo_de(texto: &str, id: &str) -> String {
    for linea in texto.lines().take(40) {
        let l = linea.trim();
        if let Some(resto) = l.strip_prefix("# ") {
            let t = resto.trim();
            if !t.is_empty() {
                return t.to_string();
            }
        }
    }
    id.rsplit('/').next().unwrap_or(id).trim_end_matches(".md").to_string()
}

/// Los destinos que nombra un documento, sin resolver todavía.
///
/// Las dos formas, porque las dos se usan: `[[nota]]` de Obsidian y el enlace
/// markdown de toda la vida `[texto](carpeta/nota.md)`. Lo que empieza por
/// `http` no se mira: una web no es un nodo de este grafo.
fn destinos(texto: &str) -> Vec<String> {
    let mut out = Vec::new();
    let b = texto.as_bytes();
    let mut i = 0;
    while i < b.len() {
        // [[wikilink]], con alias y ancla opcionales: [[nota|así se lee#sec]]
        if b[i] == b'[' && i + 1 < b.len() && b[i + 1] == b'[' {
            if let Some(fin) = texto[i + 2..].find("]]") {
                let dentro = &texto[i + 2..i + 2 + fin];
                let limpio = dentro.split(['|', '#']).next().unwrap_or("").trim();
                if !limpio.is_empty() {
                    out.push(limpio.to_string());
                }
                i += fin + 4;
                continue;
            }
        }
        // [texto](destino)
        if b[i] == b'(' {
            if let Some(fin) = texto[i + 1..].find(')') {
                let dentro = texto[i + 1..i + 1 + fin].trim();
                let sin_ancla = dentro.split('#').next().unwrap_or("").trim();
                let es_web = sin_ancla.starts_with("http")
                    || sin_ancla.starts_with("mailto:")
                    || sin_ancla.starts_with("obsidian://");
                if !es_web && sin_ancla.to_ascii_lowercase().ends_with(".md") {
                    out.push(sin_ancla.to_string());
                }
                i += fin + 2;
                continue;
            }
        }
        i += 1;
    }
    out
}

/// Un destino escrito a mano se convierte en un id de la bóveda.
///
/// Se prueba en el orden en que la gente escribe: tal cual desde la raíz, luego
/// relativo a la carpeta del documento que enlaza (que es como funciona el
/// enlace markdown), y por último por nombre suelto, que es como funciona
/// Obsidian. Lo que no lleva a ningún archivo se descarta.
fn resolver(destino: &str, desde: &str, por_id: &HashMap<String, String>, por_nombre: &HashMap<String, String>) -> Option<String> {
    let limpio = destino.trim().trim_start_matches("./").replace('\\', "/");
    let con_md = if limpio.to_ascii_lowercase().ends_with(".md") {
        limpio.clone()
    } else {
        format!("{limpio}.md")
    };

    if let Some(id) = por_id.get(&con_md.to_lowercase()) {
        return Some(id.clone());
    }

    // Relativo al que enlaza: "../otro/nota.md" desde "a/b/doc.md".
    let base: Vec<&str> = desde.split('/').collect();
    let mut pila: Vec<&str> = base[..base.len().saturating_sub(1)].to_vec();
    let mut ok = true;
    for parte in con_md.split('/') {
        match parte {
            "" | "." => {}
            ".." => {
                if pila.pop().is_none() {
                    ok = false;
                    break;
                }
            }
            otro => pila.push(otro),
        }
    }
    if ok {
        let junto = pila.join("/");
        if let Some(id) = por_id.get(&junto.to_lowercase()) {
            return Some(id.clone());
        }
    }

    // Por nombre suelto, la forma de Obsidian. Si dos carpetas tienen una nota
    // con el mismo nombre, el índice se quedó con una sola: adivinar cuál de
    // las dos quería es justo lo que no se debe hacer, así que se acepta la
    // primera y no se inventa una segunda flecha.
    let nombre = con_md.rsplit('/').next().unwrap_or(&con_md).to_lowercase();
    por_nombre.get(&nombre).cloned()
}

/// Recorre la carpeta y devuelve los `.md`, con su ruta relativa.
fn recoger(root: &Path, dir: &Path, hondo: usize, out: &mut Vec<PathBuf>, vistos: &mut u32) {
    if hondo > MAX_HONDO {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else {
        return;
    };
    for e in rd.flatten() {
        let p = e.path();
        let Some(nombre) = p.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        // Ocultas fuera, incluida `.obsidian`: ahí dentro está la
        // configuración de la aplicación, no las notas de nadie.
        if nombre.starts_with('.') {
            continue;
        }
        let dir_e = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if dir_e {
            if SALTAR.iter().any(|s| s.eq_ignore_ascii_case(nombre)) {
                continue;
            }
            recoger(root, &p, hondo + 1, out, vistos);
        } else if nombre.to_ascii_lowercase().ends_with(".md") {
            *vistos += 1;
            if std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0) <= MAX_DOC {
                out.push(p);
            }
        }
    }
}

fn rel_id(root: &Path, p: &Path) -> Option<String> {
    p.strip_prefix(root)
        .ok()
        .map(|r| r.to_string_lossy().replace('\\', "/"))
}

/* -------------------------------------------------------------- comandos */

/// Una bóveda que Obsidian ya conoce, para no tener que buscarla a mano.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VaultInfo {
    pub path: String,
    /// La última carpeta de la ruta, que es como la llama Obsidian.
    pub name: String,
    /// Cuántos markdown tiene dentro. Es lo que dice de un vistazo cuál de las
    /// tres es la que buscas.
    pub docs: u32,
    /// La que Obsidian tenía abierta la última vez.
    pub abierta: bool,
}

/// Las bóvedas de Obsidian de este equipo.
///
/// Obsidian lleva su propia lista en `%APPDATA%\obsidian\obsidian.json`, así
/// que no hay que rastrear el disco buscando carpetas `.obsidian`: se lee la
/// lista que él ya mantiene. Si no está ese archivo (no usa Obsidian, o lo
/// tiene portable), simplemente no sale ninguna y se elige la carpeta a mano,
/// que es lo que había antes.
///
/// Las que ya no existen en disco se descartan: la lista de Obsidian recuerda
/// bóvedas borradas, y ofrecer una carpeta que no está es ofrecer un error.
#[tauri::command(async)]
pub async fn memoria_vaults() -> Vec<VaultInfo> {
    let Ok(appdata) = std::env::var("APPDATA") else {
        return Vec::new();
    };
    let reg = PathBuf::from(appdata).join("obsidian").join("obsidian.json");
    let Ok(txt) = std::fs::read_to_string(&reg) else {
        return Vec::new();
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&txt) else {
        return Vec::new();
    };
    let Some(vaults) = json.get("vaults").and_then(|v| v.as_object()) else {
        return Vec::new();
    };

    // Por la última vez que la abriste: la de arriba es casi siempre la que
    // quieres, y así no hay que leer tres rutas para elegir.
    let mut orden: Vec<(&serde_json::Value, i64)> = vaults
        .values()
        .map(|v| (v, v.get("ts").and_then(|t| t.as_i64()).unwrap_or(0)))
        .collect();
    orden.sort_by(|a, b| b.1.cmp(&a.1));

    let mut out = Vec::new();
    for (v, _) in orden {
        let Some(p) = v.get("path").and_then(|p| p.as_str()) else {
            continue;
        };
        let ruta = PathBuf::from(p);
        if !ruta.is_dir() {
            continue;
        }
        let mut archivos = Vec::new();
        let mut vistos = 0u32;
        recoger(&ruta, &ruta, 0, &mut archivos, &mut vistos);
        out.push(VaultInfo {
            name: ruta
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| p.to_string()),
            path: p.to_string(),
            docs: vistos,
            abierta: v.get("open").and_then(|o| o.as_bool()).unwrap_or(false),
        });
    }
    out
}

/// El escaneo de verdad, sin nada de Tauri alrededor: entra una carpeta y sale
/// el índice. Está aparte del comando para poder probarlo contra una bóveda de
/// verdad, que es la única forma de saber si el grafo sale lleno o vacío.
fn escanear(raiz: &Path) -> Result<(Vec<Doc>, HashMap<String, String>, u32), String> {
    if !raiz.is_dir() {
        return Err(format!("no existe la carpeta {}", raiz.display()));
    }

    let mut archivos = Vec::new();
    let mut vistos = 0u32;
    recoger(raiz, raiz, 0, &mut archivos, &mut vistos);
    archivos.sort();

    // Primera pasada: leer y quedarse con lo que no depende de los demás.
    let mut texto: HashMap<String, String> = HashMap::new();
    let mut docs: Vec<Doc> = Vec::new();
    let mut por_id: HashMap<String, String> = HashMap::new();
    let mut por_nombre: HashMap<String, String> = HashMap::new();

    for p in &archivos {
        let Some(id) = rel_id(raiz, p) else { continue };
        let Ok(t) = std::fs::read_to_string(p) else {
            continue;
        };
        let folder = match id.rfind('/') {
            Some(i) => id[..i].to_string(),
            None => String::new(),
        };
        por_id.insert(id.to_lowercase(), id.clone());
        let nombre = id.rsplit('/').next().unwrap_or(&id).to_lowercase();
        por_nombre.entry(nombre).or_insert_with(|| id.clone());
        docs.push(Doc {
            title: titulo_de(&t, &id),
            folder,
            stamp: stamp_de(p),
            words: t.split_whitespace().count() as u32,
            links: Vec::new(),
            id: id.clone(),
        });
        texto.insert(id, t);
    }

    // Segunda pasada: ya se sabe qué documentos existen, así que ahora se puede
    // decir a cuál lleva cada enlace.
    for d in docs.iter_mut() {
        let Some(t) = texto.get(&d.id) else { continue };
        let mut links: Vec<String> = Vec::new();
        for destino in destinos(t) {
            if let Some(id) = resolver(&destino, &d.id, &por_id, &por_nombre) {
                if id != d.id && !links.contains(&id) {
                    links.push(id);
                }
            }
        }
        d.links = links;
    }

    Ok((docs, texto, vistos))
}

/// Lee la bóveda entera y deja el índice listo para buscar.
///
/// Se hace a mano (al abrir la pestaña o al pulsar refrescar) y no en bucle:
/// recorrer quinientos archivos es barato, pero hacerlo cada pocos segundos
/// para nada no lo es.
#[tauri::command(async)]
pub async fn memoria_scan(
    cache: tauri::State<'_, MemoriaCache>,
    root: String,
) -> Result<Vault, String> {
    let raiz = PathBuf::from(&root);
    let (docs, texto, vistos) = escanear(&raiz)?;
    let vault = Vault {
        root: root.clone(),
        docs: docs.clone(),
        vistos,
        obsidian: raiz.join(".obsidian").is_dir(),
    };

    let mut g = cache.0.lock().map_err(|e| e.to_string())?;
    *g = Indice { root, docs, texto };
    Ok(vault)
}

/// Un documento entero, para leerlo o editarlo.
#[tauri::command(async)]
pub async fn memoria_read(root: String, id: String) -> Result<DocText, String> {
    let raiz = PathBuf::from(&root);
    let p = ruta_de(&raiz, &id)?;
    let text = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    Ok(DocText {
        stamp: stamp_de(&p),
        path: p.to_string_lossy().into_owned(),
        id,
        text,
    })
}

/// Guardar, que es lo único de aquí que puede hacer daño.
///
/// Dos redes, y ninguna sobra:
/// 1. **No se escribe encima.** Se escribe un archivo nuevo al lado y se
///    renombra de golpe. Si la app muere a mitad de escritura, la nota vieja
///    sigue entera: lo peor que queda es un `.tmp` suelto.
/// 2. **Se comprueba que el archivo es el que leíste.** Si Obsidian, un agente
///    o el propio Munir lo tocaron por detrás mientras estaba abierto aquí,
///    guardar se niega y lo dice, en vez de tirar ese cambio a la basura.
#[tauri::command(async)]
pub async fn memoria_write(
    cache: tauri::State<'_, MemoriaCache>,
    root: String,
    id: String,
    text: String,
    stamp: u64,
) -> Result<DocText, String> {
    let raiz = PathBuf::from(&root);
    let p = ruta_de(&raiz, &id)?;
    if !p.is_file() {
        return Err("ese documento ya no está donde estaba".into());
    }

    let ahora = stamp_de(&p);
    // Un margen de un segundo: algunos sistemas de archivos guardan la fecha
    // con menos resolución que la que leemos, y negarse a guardar por eso
    // sería un error que nadie entiende.
    if stamp > 0 && ahora > stamp && ahora - stamp > 1000 {
        return Err("Este documento cambió por fuera desde que lo abriste. Vuelve a abrirlo para no perder lo que dice ahora.".into());
    }

    let tmp = p.with_extension("md.adeorq-tmp");
    std::fs::write(&tmp, &text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })?;

    let nuevo = stamp_de(&p);
    // El índice se entera sin volver a leer la bóveda entera: el que acaba de
    // escribir es quien mejor sabe lo que dice ahora ese documento.
    if let Ok(mut g) = cache.0.lock() {
        if g.root == root {
            let titulo = titulo_de(&text, &id);
            let palabras = text.split_whitespace().count() as u32;
            if let Some(d) = g.docs.iter_mut().find(|d| d.id == id) {
                d.title = titulo;
                d.words = palabras;
                d.stamp = nuevo;
            }
            g.texto.insert(id.clone(), text.clone());
        }
    }

    Ok(DocText {
        stamp: nuevo,
        path: p.to_string_lossy().into_owned(),
        id,
        text,
    })
}

/// Buscar por lo que dice, no solo por cómo se llama.
///
/// Sin acentos y sin mayúsculas, porque nadie escribe «brújula» en la caja de
/// búsqueda con su tilde puesta cuando tiene prisa.
#[tauri::command(async)]
pub async fn memoria_search(
    cache: tauri::State<'_, MemoriaCache>,
    q: String,
    limite: Option<u32>,
) -> Result<Vec<Hit>, String> {
    let aguja = plano(&q);
    if aguja.len() < 2 {
        return Ok(Vec::new());
    }
    let tope = limite.unwrap_or(60) as usize;
    let g = cache.0.lock().map_err(|e| e.to_string())?;

    let mut out: Vec<Hit> = Vec::new();
    for d in &g.docs {
        let Some(t) = g.texto.get(&d.id) else { continue };
        let cuerpo = plano(t);
        let titulo = plano(&d.title);
        let en_titulo = titulo.contains(&aguja);
        let veces = cuerpo.matches(&aguja).count() as u32;
        let en_ruta = plano(&d.id).contains(&aguja);
        if !en_titulo && veces == 0 && !en_ruta {
            continue;
        }
        // El título pesa mucho más que una aparición suelta en el cuerpo: quien
        // busca «reparto» quiere el documento que trata de eso, no los treinta
        // que lo mencionan de pasada.
        let score = if en_titulo { 1000 } else { 0 } + if en_ruta { 200 } else { 0 } + veces.min(50);
        out.push(Hit {
            id: d.id.clone(),
            title: d.title.clone(),
            excerpt: trozo(t, &cuerpo, &aguja),
            hits: veces,
            score,
        });
    }
    out.sort_by(|a, b| b.score.cmp(&a.score).then(a.title.cmp(&b.title)));
    out.truncate(tope);
    Ok(out)
}

/// Minúsculas y sin tildes, para que buscar «brujula» encuentre «brújula».
/// A mano y no con un crate: son seis vocales y una eñe que se conserva,
/// porque en castellano «año» y «ano» no son la misma palabra.
fn plano(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'á' | 'à' | 'ä' | 'â' | 'Á' | 'À' | 'Ä' | 'Â' => 'a',
            'é' | 'è' | 'ë' | 'ê' | 'É' | 'È' | 'Ë' | 'Ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' | 'Í' | 'Ì' | 'Ï' | 'Î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' | 'Ó' | 'Ò' | 'Ö' | 'Ô' => 'o',
            'ú' | 'ù' | 'ü' | 'û' | 'Ú' | 'Ù' | 'Ü' | 'Û' => 'u',
            otro => otro.to_ascii_lowercase(),
        })
        .collect()
}

/// El trozo donde aparece lo buscado, con contexto alrededor.
///
/// La posición se busca en la versión sin tildes y el texto se corta de la
/// ORIGINAL: las dos tienen la misma longitud en caracteres, así que se cuenta
/// en caracteres y no en bytes, que es donde esto se rompería con acentos.
fn trozo(original: &str, plano_txt: &str, aguja: &str) -> String {
    const ANTES: usize = 40;
    const LARGO: usize = 180;
    let Some(byte) = plano_txt.find(aguja) else {
        return original.chars().take(LARGO).collect::<String>().replace('\n', " ");
    };
    let en_chars = plano_txt[..byte].chars().count();
    let desde = en_chars.saturating_sub(ANTES);
    let corte: String = original.chars().skip(desde).take(LARGO).collect();
    let limpio = corte.split_whitespace().collect::<Vec<_>>().join(" ");
    if desde > 0 {
        format!("…{limpio}")
    } else {
        limpio
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_titulo_sale_del_primer_encabezado_y_si_no_del_nombre() {
        assert_eq!(titulo_de("# Metas de Adeorq\n\ntexto", "docs/METAS.md"), "Metas de Adeorq");
        assert_eq!(titulo_de("sin encabezado", "docs/METAS.md"), "METAS");
        // Un `# ` a mitad de un documento largo es una sección, no el título.
        let tarde = "linea\n".repeat(60) + "# Tarde\n";
        assert_eq!(titulo_de(&tarde, "a/b.md"), "b");
    }

    #[test]
    fn se_leen_las_dos_formas_de_enlazar_y_ninguna_web() {
        let t = "ver [[nota uno]] y [[otra|alias]] y [esto](docs/tres.md) \
                 y [fuera](https://munito.dev/x.md) y [ancla](cuatro.md#seccion)";
        let d = destinos(t);
        assert_eq!(d, vec!["nota uno", "otra", "docs/tres.md", "cuatro.md"]);
    }

    #[test]
    fn un_enlace_relativo_se_resuelve_desde_la_carpeta_del_que_enlaza() {
        let mut por_id = HashMap::new();
        por_id.insert("proyectos/adeorq/docs/metas.md".into(), "proyectos/Adeorq/docs/METAS.md".into());
        let por_nombre = HashMap::new();
        let r = resolver("../docs/METAS.md", "proyectos/Adeorq/src/nota.md", &por_id, &por_nombre);
        assert_eq!(r.as_deref(), Some("proyectos/Adeorq/docs/METAS.md"));
    }

    #[test]
    fn un_wikilink_encuentra_la_nota_por_su_nombre_suelto() {
        let por_id = HashMap::new();
        let mut por_nombre = HashMap::new();
        por_nombre.insert("ideas.md".to_string(), "vida/Ideas.md".to_string());
        assert_eq!(
            resolver("Ideas", "otra/cosa.md", &por_id, &por_nombre).as_deref(),
            Some("vida/Ideas.md")
        );
        // Y lo que no existe no inventa una flecha.
        assert_eq!(resolver("no existe", "otra/cosa.md", &por_id, &por_nombre), None);
    }

    #[test]
    fn buscar_no_distingue_tildes_ni_mayusculas_pero_si_la_ene() {
        assert_eq!(plano("BRÚJULA"), "brujula");
        assert_eq!(plano("Año"), "año", "año y ano no son la misma palabra");
    }

    #[test]
    fn el_trozo_se_corta_de_la_original_aunque_haya_acentos() {
        let original = "áéíóú la brújula está aquí y sigue el texto";
        let p = plano(original);
        let t = trozo(original, &p, "brujula");
        assert!(t.contains("brújula"), "vuelve el texto de verdad, no el aplanado: {t}");
    }

    /// La bóveda de verdad, la de esta máquina. Marcado `#[ignore]` como la
    /// prueba de Discord: depende de que exista `C:\proyectos`, así que no
    /// puede correr en cualquier sitio, pero es la única que contesta a la
    /// pregunta que importa (¿el grafo sale lleno o sale vacío?).
    ///
    /// `cargo test --ignored la_boveda_de_verdad -- --nocapture`
    #[test]
    #[ignore]
    fn la_boveda_de_verdad_sale_conectada() {
        let raiz = Path::new("C:/proyectos");
        if !raiz.is_dir() {
            return;
        }
        let t0 = std::time::Instant::now();
        let (docs, texto, vistos) = escanear(raiz).expect("se lee");
        let con_enlaces = docs.iter().filter(|d| !d.links.is_empty()).count();
        let flechas: usize = docs.iter().map(|d| d.links.len()).sum();
        let bytes: usize = texto.values().map(|t| t.len()).sum();
        println!(
            "{} documentos de {vistos} vistos · {con_enlaces} enlazan a algo · {flechas} flechas · {} KB · {} ms",
            docs.len(),
            bytes / 1024,
            t0.elapsed().as_millis()
        );
        assert!(docs.len() > 50, "una bóveda con menos de 50 notas no es esta");
        assert!(
            flechas > 200,
            "solo {flechas} flechas: el grafo saldría vacío y la vista no serviría"
        );
    }

    #[test]
    fn una_ruta_que_se_sale_de_la_boveda_no_es_un_documento() {
        let raiz = Path::new("C:/proyectos");
        assert!(ruta_de(raiz, "../.ssh/id_rsa.md").is_err());
        // Una ruta ABSOLUTA no vale, y absoluta se escribe distinto en cada
        // sistema: con barra inicial en todos, y además con letra de unidad en
        // Windows. Ese segundo caso solo se comprueba allí porque en Linux
        // «C:/otro» NO es absoluta: es una carpeta que se llama «C:», y no se
        // sale de ninguna bóveda.
        assert!(ruta_de(raiz, "/otro/sitio.md").is_err());
        #[cfg(windows)]
        assert!(ruta_de(raiz, "C:/otro/sitio.md").is_err());
        assert!(ruta_de(raiz, "notas/una.txt").is_err(), "solo markdown");
        assert!(ruta_de(raiz, "notas/una.md").is_ok());
    }
}
