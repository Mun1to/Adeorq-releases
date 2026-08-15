// Leer y escribir los archivos del proyecto, para el panel de Archivos.
//
// ── POR QUÉ NO VALE `esquema.rs`, QUE YA RECORRE CARPETAS ────────────────────
//
// Porque recorre el proyecto ENTERO de una sentada para dibujar un mapa. Un
// explorador hace lo contrario: lee UNA carpeta, la que acabas de desplegar, y
// no toca las demás hasta que las abras. Con un mapa esperas; con un árbol, no.
// Es la misma decisión que toma Orca (`file-explorer-directory-listing.ts`), y
// está anotada en `docs/ARCHIVOS.md`.
//
// ── LA PARTE QUE NO TIENE UN EDITOR NORMAL ──────────────────────────────────
//
// En VS Code el archivo lo cambias tú. Aquí lo cambia un agente mientras lo
// miras, y eso convierte «guardar» en algo que puede borrar trabajo ajeno. Por
// eso `guardar_archivo` recibe CUÁNDO se leyó lo que hay en pantalla: si el
// disco es más nuevo que eso, no escribe y lo dice. La decisión de qué hacer
// (recargar, comparar, pisar) es de quien mira, no de esta función.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Lo que nunca se lista. Misma lista que `esquema.rs`, y por el mismo motivo:
/// `node_modules` tiene decenas de miles de archivos y ninguno es tuyo.
const FUERA: &[&str] = &[
    "node_modules", "target", ".git", "dist", "build", ".next", ".nuxt",
    "vendor", "__pycache__", ".venv", "venv", ".cache", "coverage", ".turbo",
    "out", ".svelte-kit", "Pods", ".gradle",
];

/// Tope de lectura. Un archivo más gordo que esto no se abre entero: se dice lo
/// que pesa y ya. Un editor que se cuelga con un log de 300 MB es peor que uno
/// que se niega.
const TOPE: u64 = 2 * 1024 * 1024;

/// Cuánto se mira para decidir si es texto. Un PNG tiene ceros en la cabecera,
/// así que con el principio basta y no hay que leer el archivo entero.
const OLFATO: usize = 8 * 1024;

#[derive(Serialize)]
pub struct Entrada {
    pub nombre: String,
    pub ruta: String,
    pub carpeta: bool,
    pub peso: u64,
}

#[derive(Serialize)]
pub struct Carpeta {
    pub ruta: String,
    pub filas: Vec<Entrada>,
}

#[derive(Serialize)]
pub struct Archivo {
    pub ruta: String,
    /// El contenido, ya con saltos de línea normalizados a `\n`. `None` cuando
    /// no se puede enseñar, y entonces `pega` dice por qué.
    pub texto: Option<String>,
    /// "grande" o "binario". `None` si el texto vino bien.
    pub pega: Option<String>,
    pub peso: u64,
    /// Cuándo se tocó por última vez, en milisegundos. Es lo que hay que
    /// devolver al guardar para que se note si alguien lo cambió por debajo.
    pub cuando: f64,
    /// Venía con saltos de Windows. Se guarda para devolverlo como estaba: un
    /// archivo que entra con CRLF y sale con LF aparece en `git diff` entero
    /// aunque solo hayas tocado una línea.
    pub crlf: bool,
}

#[derive(Serialize)]
pub struct Guardado {
    /// La marca de tiempo nueva, para seguir vigilando desde ahí.
    pub cuando: f64,
    /// No se escribió NADA porque el disco es más nuevo que lo que se leyó.
    pub pisaria: bool,
}

/// Milisegundos desde el epoch, o 0 si el sistema no lo sabe.
fn cuando_de(meta: &std::fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

/// Una ruta utilizable, o el porqué de que no lo sea. Rechaza lo vacío y lo
/// relativo: todo lo que llega aquí sale de un listado nuestro, así que una
/// ruta a medias es un fallo de quien llama, no algo que apañar.
fn ruta_de(p: &str) -> Result<PathBuf, String> {
    let ruta = Path::new(p);
    if p.is_empty() || !ruta.is_absolute() {
        return Err("ruta no válida".into());
    }
    Ok(ruta.to_path_buf())
}

/// Lista UNA carpeta. Carpetas primero y por nombre, que es como lo espera
/// cualquiera que haya abierto un explorador en su vida.
#[tauri::command]
pub async fn listar_carpeta(ruta: String) -> Result<Carpeta, String> {
    let dir = ruta_de(&ruta)?;
    let leidas = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;

    let mut filas: Vec<Entrada> = Vec::new();
    for entrada in leidas.flatten() {
        let nombre = entrada.file_name().to_string_lossy().to_string();
        let Ok(meta) = entrada.metadata() else { continue };
        let carpeta = meta.is_dir();
        if carpeta && FUERA.contains(&nombre.as_str()) {
            continue;
        }
        filas.push(Entrada {
            ruta: entrada.path().to_string_lossy().to_string(),
            nombre,
            carpeta,
            peso: if carpeta { 0 } else { meta.len() },
        });
    }

    filas.sort_by(|a, b| match (a.carpeta, b.carpeta) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.nombre.to_lowercase().cmp(&b.nombre.to_lowercase()),
    });

    Ok(Carpeta {
        ruta: dir.to_string_lossy().to_string(),
        filas,
    })
}

/// Lee un archivo para verlo. Nunca devuelve un error por ser gordo o binario:
/// eso no es un fallo, es una respuesta, y el panel tiene que poder decirlo con
/// sus palabras en vez de enseñar un mensaje de excepción.
#[tauri::command]
pub async fn leer_archivo(ruta: String) -> Result<Archivo, String> {
    let f = ruta_de(&ruta)?;
    let meta = std::fs::metadata(&f).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        return Err("es una carpeta".into());
    }
    let peso = meta.len();
    let cuando = cuando_de(&meta);
    let salida = |texto, pega, crlf| Archivo {
        ruta: f.to_string_lossy().to_string(),
        texto,
        pega,
        peso,
        cuando,
        crlf,
    };

    if peso > TOPE {
        return Ok(salida(None, Some("grande".into()), false));
    }

    let bytes = std::fs::read(&f).map_err(|e| e.to_string())?;
    let hasta = bytes.len().min(OLFATO);
    if bytes[..hasta].contains(&0) {
        return Ok(salida(None, Some("binario".into()), false));
    }

    // Y si no es UTF-8 tampoco es texto para nosotros: enseñar caracteres de
    // reemplazo sería peor que decir la verdad, porque al guardar se
    // escribirían tal cual y el archivo quedaría destrozado.
    let Ok(bruto) = String::from_utf8(bytes) else {
        return Ok(salida(None, Some("binario".into()), false));
    };

    let crlf = bruto.contains("\r\n");
    let texto = if crlf { bruto.replace("\r\n", "\n") } else { bruto };
    Ok(salida(Some(texto), None, crlf))
}

/// Guarda, salvo que eso fuera a pisar trabajo de otro.
///
/// `visto` es cuándo se leyó lo que hay en pantalla. Si el archivo del disco es
/// más nuevo, alguien (casi siempre un agente) lo reescribió mientras tanto:
/// aquí se para y se devuelve `pisaria: true`. Sin esto, el guardado se lleva
/// por delante lo que el agente acabara de escribir y nadie se entera hasta que
/// falla algo tres horas después.
#[tauri::command]
pub async fn guardar_archivo(
    ruta: String,
    texto: String,
    crlf: bool,
    visto: Option<f64>,
    forzar: Option<bool>,
) -> Result<Guardado, String> {
    let f = ruta_de(&ruta)?;

    if !forzar.unwrap_or(false) {
        if let (Some(visto), Ok(meta)) = (visto, std::fs::metadata(&f)) {
            // Un margen de un segundo: hay sistemas de archivos que redondean
            // la marca de tiempo, y un aviso falso cada vez que guardas enseña
            // a ignorar el aviso de verdad.
            if cuando_de(&meta) > visto + 1000.0 {
                return Ok(Guardado { cuando: cuando_de(&meta), pisaria: true });
            }
        }
    }

    let cuerpo = if crlf { texto.replace('\n', "\r\n") } else { texto };
    std::fs::write(&f, cuerpo).map_err(|e| e.to_string())?;
    let meta = std::fs::metadata(&f).map_err(|e| e.to_string())?;
    Ok(Guardado { cuando: cuando_de(&meta), pisaria: false })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn una_ruta_relativa_no_se_acepta() {
        assert!(ruta_de("src/App.tsx").is_err());
        assert!(ruta_de("").is_err());
        #[cfg(windows)]
        assert!(ruta_de("C:\\proyectos").is_ok());
        #[cfg(unix)]
        assert!(ruta_de("/home/munir").is_ok());
    }

    #[test]
    fn las_carpetas_de_dependencias_no_se_listan() {
        assert!(FUERA.contains(&"node_modules"));
        assert!(FUERA.contains(&"target"));
        assert!(FUERA.contains(&".git"));
        // Pero un archivo con ese nombre sí: la lista es de CARPETAS, y el
        // filtro pregunta antes si lo es.
        assert!(!FUERA.contains(&"App.tsx"));
    }

    /// El orden es el del explorador de toda la vida, no el del disco.
    #[test]
    fn las_carpetas_van_antes_y_luego_por_nombre() {
        let mut filas = vec![
            Entrada { nombre: "zeta.ts".into(), ruta: "z".into(), carpeta: false, peso: 1 },
            Entrada { nombre: "src".into(), ruta: "s".into(), carpeta: true, peso: 0 },
            Entrada { nombre: "App.tsx".into(), ruta: "a".into(), carpeta: false, peso: 1 },
            Entrada { nombre: "docs".into(), ruta: "d".into(), carpeta: true, peso: 0 },
        ];
        filas.sort_by(|a, b| match (a.carpeta, b.carpeta) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.nombre.to_lowercase().cmp(&b.nombre.to_lowercase()),
        });
        let nombres: Vec<&str> = filas.iter().map(|f| f.nombre.as_str()).collect();
        assert_eq!(nombres, ["docs", "src", "App.tsx", "zeta.ts"]);
    }

    /// Lo importante del guardado: leer y escribir tienen que devolver el
    /// archivo tal y como estaba, saltos de línea incluidos.
    #[test]
    fn los_saltos_de_windows_vuelven_como_estaban() {
        let bruto = "uno\r\ndos\r\ntres";
        let crlf = bruto.contains("\r\n");
        let texto = bruto.replace("\r\n", "\n");
        assert_eq!(texto, "uno\ndos\ntres");
        let devuelto = if crlf { texto.replace('\n', "\r\n") } else { texto };
        assert_eq!(devuelto, bruto);
    }

    #[test]
    fn un_archivo_de_linux_no_gana_retornos_de_carro() {
        let bruto = "uno\ndos";
        let crlf = bruto.contains("\r\n");
        assert!(!crlf);
        let devuelto = if crlf { bruto.replace('\n', "\r\n") } else { bruto.to_string() };
        assert_eq!(devuelto, bruto);
    }
}
