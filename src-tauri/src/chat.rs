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
    /// Lo que cuesta releer lo ya cacheado, y lo que cuesta cachearlo.
    ///
    /// Cero significa **que este modelo no cachea**, no que sea gratis: 169 de
    /// los 415 no publican este precio y en esos la entrada se paga entera en
    /// cada turno. Y no es un detalle de céntimos: midiendo las sesiones de
    /// Munir, el 97 % de lo que entra en una petición es caché releída, así que
    /// ignorar esto multiplica el precio calculado por 37.
    pub cache_leida_millon: f64,
    pub cache_escrita_millon: f64,
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

#[derive(Deserialize, Default)]
struct Precio {
    #[serde(default)]
    prompt: String,
    #[serde(default)]
    completion: String,
    #[serde(default)]
    input_cache_read: String,
    #[serde(default)]
    input_cache_write: String,
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
            let p = m.pricing.unwrap_or_default();
            Modelo {
                nombre: if m.name.is_empty() { m.id.clone() } else { m.name.clone() },
                id: m.id,
                // Vienen como texto y por token; aquí se pasan a dólares por
                // millón, que es la unidad en la que todo el mundo los compara.
                entrada_millon: p.prompt.parse::<f64>().unwrap_or(0.0) * 1_000_000.0,
                salida_millon: p.completion.parse::<f64>().unwrap_or(0.0) * 1_000_000.0,
                cache_leida_millon: p.input_cache_read.parse::<f64>().unwrap_or(0.0) * 1_000_000.0,
                cache_escrita_millon: p.input_cache_write.parse::<f64>().unwrap_or(0.0)
                    * 1_000_000.0,
                contexto: m.context_length.unwrap_or(0),
            }
        })
        .collect();
    out.sort_by(|a, b| a.nombre.to_lowercase().cmp(&b.nombre.to_lowercase()));
    Ok(out)
}

/* ── Las promociones ──────────────────────────────────────────────────────
   Lo que está de oferta HOY, que es lo que convierte «este modelo es barato»
   en «este modelo es barato ahora mismo».

   Va por un endpoint del FRONTEND de OpenRouter y no por `/api/v1/models`, y
   eso hay que decirlo en voz alta: el catálogo público NO trae el descuento
   por ningún lado —se comprobó mirando la red de su propia web (2026-08-19)—
   así que el único sitio donde ese dato existe es el que usa su página. No
   necesita clave. A cambio, no está documentado y puede cambiar sin avisar,
   por eso todo lo de aquí falla suave: sin promociones se sigue pudiendo
   recomendar por precio, que es la respuesta de siempre.

   El precio que devuelve YA viene rebajado, así que no se aplica el descuento
   otra vez. El porcentaje se guarda solo para poder decir «al 75 %», que es lo
   que hace que merezca la pena mirar. */

const PROMOS_API: &str =
    "https://openrouter.ai/api/frontend/v1/models/find?active=true&discount=true&fmt=cards";

/// Cuánto vale una foto de las promociones antes de volver a pedirla. Un
/// descuento no aparece ni se va en cinco minutos, y esto se consulta cada vez
/// que alguien pide consejo: sin caché, pedir opinión tres veces seguidas serían
/// tres llamadas a un servidor que no es nuestro.
const PROMOS_FRESCAS: Duration = Duration::from_secs(15 * 60);

static PROMOS_CACHE: std::sync::OnceLock<
    std::sync::Mutex<Option<(std::time::Instant, Vec<Promo>)>>,
> = std::sync::OnceLock::new();

#[derive(Serialize, Clone, Debug)]
pub struct Promo {
    /// El slug con el que se le llama de verdad, con su variante si la tiene
    /// (`…:batch`, `…:free`). Sin la variante, la llamada iría a otro precio.
    pub id: String,
    pub nombre: String,
    /// De 0 a 1. `0.75` es un 75 % de descuento.
    pub descuento: f64,
    /// Dólares por millón, YA rebajados.
    pub entrada_millon: f64,
    pub salida_millon: f64,
    pub contexto: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct Promos {
    pub lista: Vec<Promo>,
    /// De cuándo es la foto. La pantalla lo dice, porque un precio sin fecha
    /// parece de ahora mismo y puede tener un cuarto de hora.
    pub hace_segundos: u64,
}

#[derive(Deserialize)]
struct PromosRes {
    data: PromosData,
}

#[derive(Deserialize)]
struct PromosData {
    #[serde(default)]
    models: Vec<PromoApi>,
}

#[derive(Deserialize)]
struct PromoApi {
    #[serde(default)]
    slug: String,
    #[serde(default)]
    short_name: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    context_length: Option<u64>,
    #[serde(default)]
    endpoint: Option<PromoEndpoint>,
}

#[derive(Deserialize)]
struct PromoEndpoint {
    #[serde(default)]
    model_variant_slug: String,
    #[serde(default)]
    pricing: Option<PromoPrecio>,
}

#[derive(Deserialize)]
struct PromoPrecio {
    #[serde(default)]
    prompt: String,
    #[serde(default)]
    completion: String,
    #[serde(default)]
    discount: Option<f64>,
}

async fn bajar_promos() -> Result<Vec<Promo>, String> {
    let res = cliente(20)?
        .get(PROMOS_API)
        .header("HTTP-Referer", "https://github.com/Mun1to/Adeorq")
        .header("X-Title", "Adeorq")
        .send()
        .await
        .map_err(|e| format!("no he podido pedir las promociones: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("OpenRouter devolvió {}", res.status()));
    }
    let lista = res
        .json::<PromosRes>()
        .await
        .map_err(|e| format!("promociones ilegibles: {e}"))?;

    Ok(promos_de(lista))
}

/// El mapeo, aparte de la red para poder comprobarlo con una respuesta real.
/// Es donde puede romperse sin avisar: si OpenRouter renombra un campo, esto
/// devolvería una lista vacía y las promociones desaparecerían en silencio.
fn promos_de(lista: PromosRes) -> Vec<Promo> {
    let mut out: Vec<Promo> = lista
        .data
        .models
        .into_iter()
        .filter_map(|m| {
            let e = m.endpoint?;
            let p = e.pricing?;
            // Sin porcentaje no es una promoción, es un modelo cualquiera que
            // se ha colado: no se enseña como oferta lo que no lo es.
            let descuento = p.discount.filter(|d| *d > 0.0)?;
            let id = if e.model_variant_slug.is_empty() {
                m.slug
            } else {
                e.model_variant_slug
            };
            Some(Promo {
                nombre: if !m.short_name.is_empty() {
                    m.short_name
                } else if !m.name.is_empty() {
                    m.name
                } else {
                    id.clone()
                },
                id,
                descuento,
                entrada_millon: p.prompt.parse::<f64>().unwrap_or(0.0) * 1_000_000.0,
                salida_millon: p.completion.parse::<f64>().unwrap_or(0.0) * 1_000_000.0,
                contexto: m.context_length.unwrap_or(0),
            })
        })
        .collect();
    // El descuento más gordo primero, que es el orden en el que se miran.
    out.sort_by(|a, b| b.descuento.partial_cmp(&a.descuento).unwrap_or(std::cmp::Ordering::Equal));
    out
}

/// Los modelos que están de oferta ahora mismo.
///
/// No falla nunca hacia arriba: si el endpoint no responde o cambia de forma,
/// devuelve la última foto que hubiera, y si tampoco la hay, una lista vacía.
/// El recomendador tiene que poder seguir recomendando por precio aunque las
/// ofertas no se puedan mirar; lo contrario sería que un endpoint sin
/// documentar tumbara una función que no depende de él.
#[tauri::command]
pub async fn chat_promos() -> Result<Promos, String> {
    let cache = PROMOS_CACHE.get_or_init(|| std::sync::Mutex::new(None));
    if let Ok(g) = cache.lock() {
        if let Some((cuando, lista)) = g.as_ref() {
            let edad = cuando.elapsed();
            if edad < PROMOS_FRESCAS {
                return Ok(Promos {
                    lista: lista.clone(),
                    hace_segundos: edad.as_secs(),
                });
            }
        }
    }

    match bajar_promos().await {
        Ok(lista) => {
            if let Ok(mut g) = cache.lock() {
                *g = Some((std::time::Instant::now(), lista.clone()));
            }
            Ok(Promos { lista, hace_segundos: 0 })
        }
        Err(_) => {
            // La foto vieja vale más que nada: un descuento de hace media hora
            // sigue siendo verdad casi siempre, y la pantalla dice su edad.
            let vieja = cache
                .lock()
                .ok()
                .and_then(|g| g.as_ref().map(|(c, l)| (c.elapsed().as_secs(), l.clone())));
            match vieja {
                Some((edad, lista)) => Ok(Promos { lista, hace_segundos: edad }),
                None => Ok(Promos { lista: Vec::new(), hace_segundos: 0 }),
            }
        }
    }
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
    Ok(crate::dir_datos_creado()?.join("gasto.json"))
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
    let dir = crate::dir_datos()?.join("chats");
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

#[cfg(test)]
mod pruebas {
    use super::*;

    /// Recorte de una respuesta REAL del endpoint (2026-08-19), con solo los
    /// campos que se leen. Está aquí y no en un archivo aparte porque lo que se
    /// protege es que el mapeo siga entendiendo esa forma exacta: si OpenRouter
    /// renombra un campo, este test se pone rojo en vez de que las promociones
    /// se vacíen en silencio.
    const REAL: &str = r#"{"data":{"models":[
      {"slug":"google/gemini-3.7-flash","short_name":"Gemini 3.7 Flash (batch)",
       "name":"Google: Gemini 3.7 Flash (batch)","context_length":1048576,
       "endpoint":{"model_variant_slug":"google/gemini-3.7-flash:batch",
       "pricing":{"prompt":"0.0000001875","completion":"0.0000009375","discount":0.75}}},
      {"slug":"google/gemini-3.7-flash","short_name":"Gemini 3.7 Flash",
       "name":"Google: Gemini 3.7 Flash","context_length":1048576,
       "endpoint":{"model_variant_slug":"google/gemini-3.7-flash",
       "pricing":{"prompt":"0.000000375","completion":"0.000001875","discount":0.75}}}
    ]}}"#;

    fn leer(txt: &str) -> Vec<Promo> {
        promos_de(serde_json::from_str::<PromosRes>(txt).expect("no se pudo leer"))
    }

    #[test]
    fn entiende_la_respuesta_de_verdad() {
        let p = leer(REAL);
        assert_eq!(p.len(), 2, "se han perdido promociones por el camino");
        // Por token en la API, por millón aquí, que es como se comparan.
        assert!((p[0].entrada_millon - 0.1875).abs() < 1e-9, "{}", p[0].entrada_millon);
        assert!((p[0].salida_millon - 0.9375).abs() < 1e-9, "{}", p[0].salida_millon);
        assert_eq!(p[0].contexto, 1_048_576);
        assert!((p[0].descuento - 0.75).abs() < 1e-9);
    }

    #[test]
    fn el_id_lleva_su_variante() {
        // Sin la variante, la llamada iría al precio normal y no al de oferta:
        // `…:batch` y `…:free` son modelos distintos para la API.
        let p = leer(REAL);
        assert!(p.iter().any(|x| x.id == "google/gemini-3.7-flash:batch"));
        assert!(p.iter().any(|x| x.id == "google/gemini-3.7-flash"));
    }

    #[test]
    fn sin_descuento_no_es_promocion() {
        let sin = r#"{"data":{"models":[{"slug":"a/b","short_name":"B","name":"B",
          "endpoint":{"model_variant_slug":"a/b","pricing":{"prompt":"0.000001",
          "completion":"0.000002"}}}]}}"#;
        assert!(leer(sin).is_empty(), "un modelo sin descuento no se enseña como oferta");

        let cero = r#"{"data":{"models":[{"slug":"a/b","short_name":"B","name":"B",
          "endpoint":{"model_variant_slug":"a/b","pricing":{"prompt":"0.000001",
          "completion":"0.000002","discount":0}}}]}}"#;
        assert!(leer(cero).is_empty(), "un descuento del 0 % tampoco");
    }

    #[test]
    fn el_mas_barato_de_verdad_va_primero() {
        let dos = r#"{"data":{"models":[
          {"slug":"a/poco","short_name":"Poco","name":"Poco","endpoint":{"model_variant_slug":"a/poco",
           "pricing":{"prompt":"0.000001","completion":"0.000002","discount":0.2}}},
          {"slug":"a/mucho","short_name":"Mucho","name":"Mucho","endpoint":{"model_variant_slug":"a/mucho",
           "pricing":{"prompt":"0.000001","completion":"0.000002","discount":0.9}}}]}}"#;
        assert_eq!(leer(dos)[0].nombre, "Mucho");
    }

    #[test]
    fn una_respuesta_rota_no_revienta_nada() {
        // El endpoint no está documentado: puede cambiar de forma cualquier día.
        // Lo que NO puede pasar es que eso tumbe al recomendador.
        assert!(leer(r#"{"data":{}}"#).is_empty());
        assert!(leer(r#"{"data":{"models":[]}}"#).is_empty());
        let sin_endpoint = r#"{"data":{"models":[{"slug":"a/b","short_name":"B","name":"B"}]}}"#;
        assert!(leer(sin_endpoint).is_empty());
    }
}
