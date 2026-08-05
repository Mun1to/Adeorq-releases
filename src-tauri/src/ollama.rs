// El modelo de casa: el que corre en este ordenador y no gasta cuota de nadie.
//
// Sirve para una cosa muy concreta y pequeña: mirar la última respuesta de una
// sesión que te está esperando y escribir UNA línea con qué necesita de ti.
// Nada más. La Agenda sabe por su cuenta quién espera, de cuándo es y para qué
// se abrió; eso sale del disco y es exacto. Lo único que no puede saber sin
// leer es QUÉ te está preguntando, y para eso basta un modelo pequeño.
//
// Por eso todo aquí falla en silencio y hacia el lado bueno: si Ollama no está
// abierto, si el modelo no está descargado o si tarda demasiado, la Agenda
// sigue funcionando entera y solo se queda sin esa línea. El modelo añade
// prosa, no información.

use serde::Deserialize;
use std::time::Duration;

const BASE: &str = "http://127.0.0.1:11434";

/// Corto a propósito. Si el modelo no ha contestado en este rato, es que es
/// demasiado grande para esto y lo que toca es elegir uno más pequeño en
/// Ajustes, no esperar más: esto corre en bucle y por detrás.
const TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Deserialize)]
struct Tags {
    models: Vec<Tag>,
}

#[derive(Deserialize)]
struct Tag {
    name: String,
}

/// Qué modelos hay descargados en este equipo. Lista vacía = Ollama no está
/// escuchando, que no es un error: es que ahora mismo no lo tienes abierto.
#[tauri::command]
pub async fn ollama_models() -> Vec<String> {
    let Ok(client) = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
    else {
        return Vec::new();
    };
    let Ok(res) = client.get(format!("{BASE}/api/tags")).send().await else {
        return Vec::new();
    };
    let Ok(tags) = res.json::<Tags>().await else {
        return Vec::new();
    };
    tags.models.into_iter().map(|m| m.name).collect()
}

#[derive(Deserialize)]
struct Generated {
    response: String,
}

/// Una línea, sobre el texto que se le dé.
///
/// `num_predict` corta por arriba: se pide una frase y un modelo pequeño que se
/// venga arriba escribiendo tres párrafos costaría más tiempo que toda la
/// tarea. Y la temperatura va baja porque esto no es escritura creativa, es
/// resumir lo que pone ahí.
#[tauri::command]
pub async fn ollama_line(model: String, prompt: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .post(format!("{BASE}/api/generate"))
        .json(&serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": false,
            "options": { "temperature": 0.1, "num_predict": 120 }
        }))
        .send()
        .await
        .map_err(|e| format!("Ollama no responde: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("Ollama devolvió {}", res.status()));
    }
    let out = res
        .json::<Generated>()
        .await
        .map_err(|e| format!("respuesta ilegible: {e}"))?;
    // Los modelos que razonan en voz alta abren con un bloque <think>. Fuera:
    // lo que se enseña es la frase, no cómo llegó a ella.
    let limpio = match out.response.split_once("</think>") {
        Some((_, resto)) => resto,
        None => &out.response,
    };
    Ok(limpio.trim().to_string())
}

// ---------------------------------------------------------------------------
// Si una página se deja meter en el lienzo, preguntado ANTES de intentarlo.
//
// Vive aquí de prestado porque este archivo ya tiene el cliente HTTP montado.
// El motivo de existir es que un <iframe> al que le niegan la entrada no avisa:
// se queda en blanco, sin error y sin decir de quién es la culpa. Preguntar
// primero convierte ese cuadro blanco en una frase que explica qué pasa y
// ofrece abrirlo fuera.
// ---------------------------------------------------------------------------

/// `Ok(())` = se deja. `Err(motivo)` = no, y el motivo se le enseña.
#[tauri::command]
pub async fn puede_empotrarse(url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("eso no es una dirección web".into());
    }
    // localhost no se comprueba: es lo que esta pieza existe para enseñar, y
    // un servidor de desarrollo a medio arrancar daría un "no" que es mentira.
    if url.contains("://localhost") || url.contains("://127.0.0.1") {
        return Ok(());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    // HEAD y no GET: solo interesan las cabeceras, y bajarse la página entera
    // para leer dos líneas es tráfico que no hace falta.
    let res = client
        .head(&url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|_| "no he podido llegar a esa dirección".to_string())?;

    let h = res.headers();
    if let Some(xfo) = h.get("x-frame-options").and_then(|v| v.to_str().ok()) {
        let v = xfo.to_lowercase();
        if v.contains("deny") || v.contains("sameorigin") {
            return Err("esa página se niega a abrirse dentro de otra".into());
        }
    }
    for csp in h.get_all("content-security-policy").iter() {
        let Ok(v) = csp.to_str() else { continue };
        let v = v.to_lowercase();
        if let Some(i) = v.find("frame-ancestors") {
            let regla = &v[i..];
            let regla = regla.split(';').next().unwrap_or(regla);
            // 'self' y 'none' nos dejan fuera igual; una lista de dominios
            // concretos también, porque el nuestro no va a estar en ella.
            if !regla.contains('*') {
                return Err("esa página solo se deja abrir dentro de sí misma".into());
            }
        }
    }
    Ok(())
}
