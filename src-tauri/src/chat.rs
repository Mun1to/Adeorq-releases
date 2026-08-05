// Hablar con un modelo por su API, sin CLI de por medio.
//
// Las terminales de Adeorq abren agentes que se loguean con TU cuenta y gastan
// de TU suscripción. Esto es la otra forma de llegar a un modelo: una clave de
// API y una conversación normal. Sirve para lo que no merece una sesión de
// agente entera —una duda, una traducción, «explícame este error»— y para
// hablar con modelos que no tienen CLI.
//
// Todo pasa por Rust y no por el WebView, por dos razones que no son la misma:
//
//   1. La clave NO puede volver al front. Se guarda cifrada en el Gestor de
//      Credenciales y de ahí solo sale hacia OpenRouter. Si el front la pidiera
//      para llamar él, acabaría en el estado de React, en un log o en una
//      captura de pantalla.
//   2. Desde el WebView la llamada es de otro origen, así que dependería del
//      CORS de un servidor que no controlamos.
//
// Se habla con OpenRouter y no con cada proveedor por separado porque UNA clave
// da acceso a casi todos los modelos. Un conector por marca sería el mismo
// trabajo repetido cinco veces y cinco claves que mantener.

use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::secrets;

const CLAVE: &str = "openrouter";
const API: &str = "https://openrouter.ai/api/v1";

/// Un turno de la conversación, tal como lo espera la API.
#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Mensaje {
    pub role: String,
    pub content: String,
}

/// Lo que ha costado una respuesta. El coste lo dice OpenRouter, no se estima
/// aquí multiplicando tokens por precios: los precios cambian y una cuenta
/// inventada es peor que ninguna.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Uso {
    pub entrada: u64,
    pub salida: u64,
    /// En dólares. Cero cuando el modelo es gratuito.
    pub coste: f64,
}

/// Un modelo del catálogo, para el selector.
#[derive(Serialize, Clone, Debug)]
pub struct Modelo {
    pub id: String,
    pub nombre: String,
    /// Dólares por millón de tokens, ya multiplicado: la API los da por token y
    /// «0.000003» no le dice nada a nadie.
    pub entrada_millon: f64,
    pub salida_millon: f64,
    pub contexto: u64,
}

#[derive(Deserialize)]
struct ModelosRes {
    data: Vec<ModeloApi>,
}

#[derive(Deserialize)]
struct ModeloApi {
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    context_length: Option<u64>,
    #[serde(default)]
    pricing: Option<Precio>,
}

#[derive(Deserialize)]
struct Precio {
    #[serde(default)]
    prompt: String,
    #[serde(default)]
    completion: String,
}

fn cliente(segundos: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(segundos))
        .build()
        .map_err(|e| e.to_string())
}

fn key() -> Result<String, String> {
    secrets::get(CLAVE).ok_or_else(|| {
        "no hay clave de OpenRouter guardada: ponla en Cuentas".to_string()
    })
}

/// El catálogo de modelos. No necesita clave: es público.
#[tauri::command]
pub async fn chat_modelos() -> Result<Vec<Modelo>, String> {
    let res = cliente(20)?
        .get(format!("{API}/models"))
        .send()
        .await
        .map_err(|e| format!("no he podido pedir los modelos: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("OpenRouter devolvió {}", res.status()));
    }
    let lista = res
        .json::<ModelosRes>()
        .await
        .map_err(|e| format!("catálogo ilegible: {e}"))?;
    let mut out: Vec<Modelo> = lista
        .data
        .into_iter()
        .map(|m| {
            let p = m.pricing.unwrap_or(Precio {
                prompt: String::new(),
                completion: String::new(),
            });
            Modelo {
                nombre: if m.name.is_empty() { m.id.clone() } else { m.name.clone() },
                id: m.id,
                // Vienen como texto y por token; aquí se pasan a dólares por
                // millón, que es la unidad en la que todo el mundo los compara.
                entrada_millon: p.prompt.parse::<f64>().unwrap_or(0.0) * 1_000_000.0,
                salida_millon: p.completion.parse::<f64>().unwrap_or(0.0) * 1_000_000.0,
                contexto: m.context_length.unwrap_or(0),
            }
        })
        .collect();
    out.sort_by(|a, b| a.nombre.to_lowercase().cmp(&b.nombre.to_lowercase()));
    Ok(out)
}

#[derive(Deserialize)]
struct Trozo {
    #[serde(default)]
    choices: Vec<Eleccion>,
    #[serde(default)]
    usage: Option<UsoApi>,
}

#[derive(Deserialize)]
struct Eleccion {
    #[serde(default)]
    delta: Delta,
}

#[derive(Deserialize, Default)]
struct Delta {
    #[serde(default)]
    content: Option<String>,
}

#[derive(Deserialize)]
struct UsoApi {
    #[serde(default)]
    prompt_tokens: u64,
    #[serde(default)]
    completion_tokens: u64,
    #[serde(default)]
    cost: Option<f64>,
}

/**
 * Manda la conversación y devuelve lo que ha costado.
 *
 * El texto NO vuelve por aquí: sale por el evento `chat:<canal>` según llega,
 * palabra a palabra. Una respuesta larga tarda medio minuto, y un chat que se
 * queda en blanco todo ese rato parece colgado aunque no lo esté.
 */
#[tauri::command]
pub async fn chat_enviar(
    app: AppHandle,
    canal: String,
    modelo: String,
    mensajes: Vec<Mensaje>,
) -> Result<Uso, String> {
    let key = key()?;
    let cuerpo = serde_json::json!({
        "model": modelo,
        "messages": mensajes,
        "stream": true,
        // Con esto el último trozo trae el coste de verdad de esta llamada.
        "usage": { "include": true },
    });

    let mut res = cliente(300)?
        .post(format!("{API}/chat/completions"))
        .header("Authorization", format!("Bearer {key}"))
        // OpenRouter los usa para el ranking público de aplicaciones.
        .header("HTTP-Referer", "https://github.com/Mun1to/Adeorq")
        .header("X-Title", "Adeorq")
        .json(&cuerpo)
        .send()
        .await
        .map_err(|e| format!("no he podido hablar con OpenRouter: {e}"))?;

    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("OpenRouter dice que tu clave no vale".into());
    }
    if !res.status().is_success() {
        let code = res.status();
        let detalle = res.text().await.unwrap_or_default();
        // El cuerpo del error lleva el motivo (sin crédito, modelo que no
        // existe, contexto pasado), y sin él solo se ve un número.
        return Err(format!("OpenRouter devolvió {code}: {}", detalle.trim()));
    }

    let mut uso = Uso::default();
    // Los trozos de red no respetan las líneas: uno puede acabar a mitad de un
    // JSON. Se acumula y solo se procesa lo que ya tiene su salto de línea.
    let mut resto = String::new();
    while let Some(bytes) = res
        .chunk()
        .await
        .map_err(|e| format!("se cortó la respuesta: {e}"))?
    {
        resto.push_str(&String::from_utf8_lossy(&bytes));
        while let Some(corte) = resto.find('\n') {
            let linea = resto[..corte].trim().to_string();
            resto = resto[corte + 1..].to_string();
            let Some(dato) = linea.strip_prefix("data:") else {
                // Los comentarios (`: keep-alive`) y las líneas vacías del
                // protocolo no son errores: se saltan.
                continue;
            };
            let dato = dato.trim();
            if dato == "[DONE]" {
                continue;
            }
            let Ok(t) = serde_json::from_str::<Trozo>(dato) else {
                continue;
            };
            if let Some(u) = t.usage {
                uso.entrada = u.prompt_tokens;
                uso.salida = u.completion_tokens;
                uso.coste = u.cost.unwrap_or(0.0);
            }
            for c in t.choices {
                if let Some(txt) = c.delta.content {
                    if !txt.is_empty() {
                        let _ = app.emit(&format!("chat:{canal}"), txt);
                    }
                }
            }
        }
    }

    if uso.coste > 0.0 {
        apuntar_gasto(uso.coste)?;
    }
    Ok(uso)
}

// ---------------------------------------------------------------------------
// El contador de gasto.
//
// Por suscripción no puedes pasarte: pagas lo mismo hables mucho o poco. Por
// API sí, y sin verlo, que es lo que convierte una tarde de pruebas en una
// factura. Se apunta lo que OpenRouter dice que ha costado cada llamada.
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct Gasto {
    /// Lo gastado desde siempre, en dólares.
    #[serde(default)]
    pub total: f64,
    /// Por día, con la fecha como «2026-07-30». Se guardan los últimos 90.
    #[serde(default)]
    pub dias: std::collections::BTreeMap<String, f64>,
}

fn gasto_path() -> Result<PathBuf, String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA no disponible")?;
    let dir = PathBuf::from(local).join("Adeorq");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("gasto.json"))
}

fn hoy() -> String {
    // Sin crate de fechas: los días desde el epoch a fecha civil, que son diez
    // líneas del algoritmo de Howard Hinnant y no una dependencia más.
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let z = secs / 86_400 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

fn apuntar_gasto(coste: f64) -> Result<(), String> {
    let p = gasto_path()?;
    let mut g: Gasto = std::fs::read_to_string(&p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    g.total += coste;
    *g.dias.entry(hoy()).or_insert(0.0) += coste;
    // Noventa días es de sobra para ver una racha cara, y evita que el archivo
    // crezca para siempre.
    while g.dias.len() > 90 {
        let Some(viejo) = g.dias.keys().next().cloned() else {
            break;
        };
        g.dias.remove(&viejo);
    }
    // Escritura atómica: un corte a mitad no puede dejar el contador ilegible.
    let tmp = p.with_extension("tmp");
    let texto = serde_json::to_string_pretty(&g).map_err(|e| e.to_string())?;
    {
        let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(texto.as_bytes()).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

/// Lo gastado por API. Es SOLO lo que ha pasado por Adeorq: lo que gastes con
/// tu clave fuera de aquí no lo ve, y por eso la pantalla lo dice.
#[tauri::command]
pub fn gasto_leer() -> Gasto {
    gasto_path()
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Las conversaciones guardadas.
//
// Cada una en su archivo, y en el tablero del lienzo solo va su id. Es lo mismo
// que hacen las notas y por el mismo motivo: una charla larga son cientos de
// miles de caracteres, y metida dentro de `lienzo.json` engordaría el tablero
// entero (que se lee y se escribe cada vez que mueves una pieza) con texto que
// solo mira una pieza.
// ---------------------------------------------------------------------------

/// Un id de conversación solo puede ser esto. Va a un nombre de archivo, así
/// que un `..\..\algo` sería salirse de la carpeta: se RECHAZA, no se limpia.
fn chat_path(id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("id de conversación no válido".into());
    }
    let local = std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA no disponible")?;
    let dir = PathBuf::from(local).join("Adeorq").join("chats");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{id}.json")))
}

/// Una conversación guardada. Vacía si todavía no existe, que no es un error.
#[tauri::command]
pub fn chat_leer(id: String) -> Result<Vec<Mensaje>, String> {
    let p = chat_path(&id)?;
    match std::fs::read_to_string(&p) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| format!("conversación ilegible: {e}")),
        Err(_) => Ok(Vec::new()),
    }
}

#[tauri::command]
pub fn chat_guardar(id: String, mensajes: Vec<Mensaje>) -> Result<(), String> {
    let p = chat_path(&id)?;
    let texto = serde_json::to_string(&mensajes).map_err(|e| e.to_string())?;
    let tmp = p.with_extension("tmp");
    {
        let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(texto.as_bytes()).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

/// Borra una conversación. La pieza que la enseñaba ya no está, y guardar para
/// siempre una charla que quitaste del tablero es guardar basura.
#[tauri::command]
pub fn chat_olvidar(id: String) -> Result<(), String> {
    let p = chat_path(&id)?;
    let _ = std::fs::remove_file(p);
    Ok(())
}
