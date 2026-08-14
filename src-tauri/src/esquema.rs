// El árbol de un proyecto o de una carpeta, para dibujarlo como esquema.
//
// ── QUÉ ES Y QUÉ NO ES ──────────────────────────────────────────────────────
//
// Esto NO decide cómo se ve nada. Solo recorre el disco y devuelve una lista
// plana de nodos con quién es hijo de quién. Colocar, colorear y animar es del
// front (`src/lib/esquema.ts`), que es donde se puede probar sin tocar disco.
//
// ── LAS TRES COSAS QUE HACEN QUE ESTO NO CUELGUE LA APP ─────────────────────
//
// 1. NO ENTRA en las carpetas que no son tuyas. `node_modules` de un proyecto
//    web tiene decenas de miles de archivos y no dice absolutamente nada de la
//    estructura: recorrerlo son varios segundos y un esquema ilegible. Igual
//    con `target` de Rust, `.git` y las carpetas de build.
// 2. TOPE DE NODOS. Un proyecto puede tener miles de archivos y un esquema con
//    miles de cajas no se lee. Se corta y se DICE que se ha cortado, en vez de
//    enseñar medio árbol como si fuera entero.
// 3. TOPE DE HONDURA. Ocho niveles es más de lo que cualquier proyecto usa de
//    verdad, y evita que un enlace simbólico en bucle se lo lleve todo por
//    delante.

use serde::Serialize;
use std::path::Path;

/// Hasta dónde se baja. Más allá, la estructura ya no la ve nadie.
const HONDO: usize = 8;
/// Cuántos nodos como mucho. Por encima, el dibujo deja de ser un mapa.
const TOPE: usize = 900;

/// Lo que nunca se abre, por nombre exacto de carpeta.
const FUERA: &[&str] = &[
    "node_modules", "target", ".git", "dist", "build", ".next", ".nuxt",
    "vendor", "__pycache__", ".venv", "venv", ".cache", "coverage", ".turbo",
    "out", ".svelte-kit", "Pods", ".gradle", ".idea", ".vscode",
];

#[derive(Serialize)]
pub struct Nodo {
    /// Ruta relativa a la raíz, con barras normales. Es la identidad.
    pub id: String,
    pub nombre: String,
    /// Quién lo contiene. `None` solo la raíz.
    pub padre: Option<String>,
    pub carpeta: bool,
    /// Bytes del archivo, o suma de lo que cuelga si es carpeta.
    pub peso: u64,
    /// Cuántos descendientes tiene, para poder pintarlo más gordo.
    pub dentro: usize,
    /// De qué familia es, que es de donde sale el color: "rust", "front",
    /// "docs", "config", "datos", "otro". Se decide por la extensión y por
    /// dónde vive, no por adivinar el contenido.
    pub clase: String,
}

#[derive(Serialize)]
pub struct Esquema {
    pub raiz: String,
    pub nombre: String,
    pub nodos: Vec<Nodo>,
    /// Si se llegó al tope y hay más cosas de las que se enseñan. Se dice
    /// SIEMPRE: un esquema recortado en silencio se lee como uno completo.
    pub recortado: bool,
    /// Cuántas carpetas no se abrieron por estar en la lista de fuera.
    pub saltadas: usize,
}

/// La familia de un archivo. El orden importa: lo primero que encaja gana.
fn clase_de(nombre: &str, carpeta: bool) -> &'static str {
    if carpeta {
        return "carpeta";
    }
    let n = nombre.to_ascii_lowercase();
    let ext = n.rsplit('.').next().unwrap_or("");
    match ext {
        "rs" | "toml" if n != "package.json" => "rust",
        "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" | "vue" | "svelte" => "front",
        "css" | "scss" | "sass" | "less" | "html" => "estilo",
        "md" | "mdx" | "txt" => "docs",
        "json" | "yaml" | "yml" | "ini" | "conf" | "env" | "lock" => "config",
        "png" | "jpg" | "jpeg" | "svg" | "gif" | "webp" | "ico" | "mp4" | "webm" => "media",
        "py" | "go" | "java" | "kt" | "rb" | "php" | "cs" | "c" | "cpp" | "h" => "codigo",
        _ => "otro",
    }
}

fn recorrer(
    dir: &Path,
    raiz: &Path,
    padre: Option<String>,
    nivel: usize,
    hondo: usize,
    out: &mut Vec<Nodo>,
    saltadas: &mut usize,
) -> (u64, usize) {
    if nivel > hondo || out.len() >= TOPE {
        return (0, 0);
    }
    let mut entradas: Vec<_> = match std::fs::read_dir(dir) {
        Ok(it) => it.filter_map(|e| e.ok()).collect(),
        // Una carpeta sin permisos no puede tumbar el esquema entero.
        Err(_) => return (0, 0),
    };
    // Carpetas primero y por nombre: que dos escaneos del mismo proyecto den el
    // mismo dibujo. Sin esto el orden lo decide el sistema de archivos y el
    // esquema cambia de forma entre una vez y la siguiente sin motivo.
    entradas.sort_by_key(|e| {
        let carpeta = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
        (!carpeta, e.file_name().to_string_lossy().to_lowercase())
    });

    let mut peso_total = 0u64;
    let mut cuantos = 0usize;

    for e in entradas {
        if out.len() >= TOPE {
            break;
        }
        let nombre = e.file_name().to_string_lossy().to_string();
        // Lo oculto no es estructura: es fontanería del sistema o del editor.
        if nombre.starts_with('.') && nombre != ".github" {
            continue;
        }
        let es_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if es_dir && FUERA.contains(&nombre.as_str()) {
            *saltadas += 1;
            continue;
        }
        let ruta = e.path();
        let id = ruta
            .strip_prefix(raiz)
            .unwrap_or(&ruta)
            .to_string_lossy()
            .replace('\\', "/");

        if es_dir {
            // El nodo se mete ANTES de bajar, para que el hijo pueda apuntar a
            // su padre; el peso se corrige al volver.
            let sitio = out.len();
            out.push(Nodo {
                id: id.clone(),
                nombre,
                padre: padre.clone(),
                carpeta: true,
                peso: 0,
                dentro: 0,
                clase: "carpeta".into(),
            });
            let (peso, dentro) = recorrer(&ruta, raiz, Some(id), nivel + 1, hondo, out, saltadas);
            out[sitio].peso = peso;
            out[sitio].dentro = dentro;
            peso_total += peso;
            cuantos += dentro + 1;
        } else {
            let peso = e.metadata().map(|m| m.len()).unwrap_or(0);
            let clase = clase_de(&nombre, false).to_string();
            out.push(Nodo {
                id,
                nombre,
                padre: padre.clone(),
                carpeta: false,
                peso,
                dentro: 0,
                clase,
            });
            peso_total += peso;
            cuantos += 1;
        }
    }
    (peso_total, cuantos)
}

/// Lee el árbol de una carpeta. Vale para un proyecto de código y para una
/// carpeta de la bóveda: lo único que cambia es la ruta que se le pasa.
#[tauri::command]
pub async fn escanear_arbol(ruta: String, hondo: Option<usize>) -> Result<Esquema, String> {
    let raiz = Path::new(&ruta);
    if !raiz.is_dir() {
        return Err(format!("«{ruta}» no es una carpeta"));
    }
    let nombre = raiz
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| ruta.clone());

    // En un hilo aparte: recorrer miles de archivos con el antivirus mirando
    // tarda, y en el hilo de la ventana eso es la app congelada.
    let ruta2 = ruta.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let raiz = Path::new(&ruta2);
        let mut nodos = Vec::new();
        let mut saltadas = 0usize;
        // La hondura la puede recortar quien llama. Sirve para mirar la carpeta
        // de proyectos ENTERA: a fondo, el tope de nodos se llenaría con los
        // primeros por orden alfabético y los últimos no saldrían, que es peor
        // que no enseñarlos, porque el mapa parecería completo.
        let hondo = hondo.unwrap_or(HONDO).clamp(1, HONDO);
        let (peso, dentro) = recorrer(raiz, raiz, None, 0, hondo, &mut nodos, &mut saltadas);
        // La raíz va la primera y no dentro del recorrido: no tiene padre y su
        // peso es la suma de todo, que solo se sabe al terminar.
        nodos.insert(
            0,
            Nodo {
                id: String::new(),
                nombre: nombre.clone(),
                padre: None,
                carpeta: true,
                peso,
                dentro,
                clase: "raiz".into(),
            },
        );
        // Y los hijos del primer nivel cuelgan de ella. Se hace aquí y no en el
        // recorrido porque el id de la raíz es la cadena vacía y compararla
        // dentro del bucle es más fácil de romper que arreglarlo una vez.
        for n in nodos.iter_mut().skip(1) {
            if n.padre.is_none() {
                n.padre = Some(String::new());
            }
        }
        Ok(Esquema {
            raiz: ruta2,
            nombre,
            recortado: nodos.len() >= TOPE,
            saltadas,
            nodos,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/* ── La ficha de cada proyecto, para el mapa del taller ─────────────────────
 *
 * Cuando se pide el mapa de TODOS los proyectos, el Capataz necesita saber qué
 * es cada uno. Dejarle que lo averigüe él sale carísimo: veintiocho proyectos
 * por dos archivos cada uno son cincuenta y seis lecturas, y eso pasó de los
 * seis minutos en la primera prueba (2026-08-14). Leer la primera línea de un
 * README no es un trabajo de modelo: es un trabajo de disco, y aquí cuesta
 * milisegundos.
 *
 * Con esto el Capataz recibe la lista ya masticada y no abre ni un archivo. */

/// Dónde mira, en orden. El primero que exista gana: `AGENTS.md` va antes que
/// `README.md` porque en esta casa es el que está al día.
const FICHAS: &[&str] = &["AGENTS.md", "README.md", "readme.md", "CLAUDE.md"];

/// La primera frase de verdad de un markdown: sin el título, sin insignias y
/// sin líneas vacías. Es lo que dice qué es el proyecto.
fn primera_frase(texto: &str) -> String {
    for linea in texto.lines() {
        let l = linea.trim();
        // Fuera el título, las citas, las insignias y los bloques de código: un
        // markdown de proyecto empieza casi siempre con dos o tres de esos.
        if l.is_empty()
            || l.starts_with('#')
            || l.starts_with('>')
            || l.starts_with("[!")
            || l.starts_with("![")
            || l.starts_with("```")
            || l.starts_with("---")
            || l.starts_with('|')
        {
            continue;
        }
        let limpio: String = l.chars().take(220).collect();
        return limpio;
    }
    String::new()
}

/// Un renglón por proyecto: su carpeta, cuántas cosas tiene y qué dice de sí
/// mismo. Es todo lo que hace falta para dibujar el taller.
#[tauri::command]
pub async fn resumen_taller(ruta: String) -> Result<String, String> {
    let raiz = Path::new(&ruta);
    if !raiz.is_dir() {
        return Err(format!("«{ruta}» no es una carpeta"));
    }
    let ruta2 = ruta.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let raiz = Path::new(&ruta2);
        let mut entradas: Vec<_> = std::fs::read_dir(raiz)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
            .collect();
        entradas.sort_by_key(|e| e.file_name().to_string_lossy().to_lowercase());

        let mut out = String::new();
        for e in entradas {
            let nombre = e.file_name().to_string_lossy().to_string();
            // Lo oculto y lo archivado no es taller: es el trastero.
            if nombre.starts_with('.') || nombre.starts_with('_') {
                continue;
            }
            let dir = e.path();
            let cuantos = std::fs::read_dir(&dir).map(|it| it.count()).unwrap_or(0);
            let mut ficha = String::new();
            for f in FICHAS {
                if let Ok(t) = std::fs::read_to_string(dir.join(f)) {
                    ficha = primera_frase(&t);
                    if !ficha.is_empty() {
                        break;
                    }
                }
            }
            // Qué clase de proyecto es, por lo que tiene en la raíz. Son tres
            // comprobaciones de existencia y le ahorran al modelo tener que
            // adivinarlo por el nombre de la carpeta.
            let mut pistas: Vec<&str> = Vec::new();
            if dir.join("src-tauri").is_dir() {
                pistas.push("app de escritorio (Tauri)");
            } else if dir.join("Cargo.toml").is_file() {
                pistas.push("Rust");
            }
            if dir.join("package.json").is_file() {
                pistas.push("web o Node");
            }
            if dir.join("pyproject.toml").is_file() || dir.join("requirements.txt").is_file() {
                pistas.push("Python");
            }
            out.push_str(&format!(
                "- {nombre} ({cuantos} cosas dentro{}){}\n",
                if pistas.is_empty() {
                    String::new()
                } else {
                    format!(", {}", pistas.join(", "))
                },
                if ficha.is_empty() {
                    String::new()
                } else {
                    format!(": {ficha}")
                }
            ));
        }
        if out.is_empty() {
            return Err("ahí dentro no hay ningún proyecto".into());
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

/* ── El mapa guardado ───────────────────────────────────────────────────────
 *
 * Leer un proyecto entero con el Capataz cuesta unos tres minutos, así que un
 * mapa que se recalcula cada vez que entras en la pestaña es un mapa que nadie
 * mira. Se guarda uno por carpeta y se enseña al instante; volver a leer el
 * código es un botón, con su fecha al lado para saber de cuándo es lo que estás
 * viendo. Un mapa viejo SIN fecha sería el fallo de verdad: se leería como si
 * fuera de ahora. */

/// El nombre del archivo de una carpeta. Minúsculas y sin nada que Windows no
/// deje escribir, para que `C:\proyectos\Adeorq` y `c:/proyectos/adeorq` caigan
/// en el mismo sitio: son la misma carpeta y no pueden tener dos mapas.
fn clave_de(ruta: &str) -> String {
    let limpio: String = ruta
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    // Con tope: una ruta muy honda daría un nombre más largo de lo que el
    // sistema de archivos acepta, y ahí el guardado fallaría en silencio.
    let corto = if limpio.len() > 90 { &limpio[limpio.len() - 90..] } else { &limpio };
    format!("{corto}.json")
}

fn carpeta_mapas() -> Result<std::path::PathBuf, String> {
    let dir = crate::dir_datos_creado()?.join("mapas");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Lo que hay guardado de esa carpeta, tal cual se escribió. `None` si nunca se
/// leyó, y también si el archivo está roto: un mapa a medias no se enseña.
#[tauri::command]
pub async fn mapa_guardado(ruta: String) -> Result<Option<String>, String> {
    let f = carpeta_mapas()?.join(clave_de(&ruta));
    match std::fs::read_to_string(&f) {
        Ok(s) if !s.trim().is_empty() => Ok(Some(s)),
        _ => Ok(None),
    }
}

#[tauri::command]
pub async fn guardar_mapa(ruta: String, contenido: String) -> Result<(), String> {
    let f = carpeta_mapas()?.join(clave_de(&ruta));
    std::fs::write(&f, contenido).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::{clase_de, clave_de};

    #[test]
    fn cada_cosa_a_su_familia() {
        assert_eq!(clase_de("pty.rs", false), "rust");
        assert_eq!(clase_de("App.tsx", false), "front");
        assert_eq!(clase_de("App.css", false), "estilo");
        assert_eq!(clase_de("AGENTS.md", false), "docs");
        assert_eq!(clase_de("tauri.conf.json", false), "config");
        assert_eq!(clase_de("icono.png", false), "media");
        assert_eq!(clase_de("main.py", false), "codigo");
        assert_eq!(clase_de("LICENSE", false), "otro");
    }

    /// Una carpeta es una carpeta aunque se llame como un archivo de Rust.
    #[test]
    fn una_carpeta_manda_sobre_su_nombre() {
        assert_eq!(clase_de("src.rs", true), "carpeta");
    }

    /// Las mayúsculas no cambian de qué es un archivo.
    #[test]
    fn la_extension_no_distingue_mayusculas() {
        assert_eq!(clase_de("README.MD", false), "docs");
        assert_eq!(clase_de("Main.RS", false), "rust");
    }

    /// La misma carpeta escrita de dos maneras guarda UN mapa, no dos.
    #[test]
    fn la_misma_carpeta_da_la_misma_clave() {
        assert_eq!(clave_de(r"C:\proyectos\Adeorq"), clave_de("c:/proyectos/adeorq"));
    }

    /// Y dos carpetas distintas, dos.
    #[test]
    fn dos_carpetas_no_comparten_mapa() {
        assert_ne!(clave_de(r"C:\proyectos\Adeorq"), clave_de(r"C:\proyectos\VoCript"));
    }

    /// Una ruta larguísima no puede dar un nombre de archivo impasable.
    #[test]
    fn la_clave_tiene_tope() {
        let honda = format!(r"C:\{}", "carpeta\\".repeat(40));
        assert!(clave_de(&honda).len() <= 95);
    }
}
