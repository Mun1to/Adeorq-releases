// Tu cuenta de OpenRouter en el centro de cuentas.
//
// Es de otra especie que las demás y por eso no entra en `providers.rs`: las
// otras son PROGRAMAS instalados, con su ejecutable y su carpeta de config, y
// se conectan haciendo login en su terminal. OpenRouter es una CLAVE, y una
// clave no se instala ni se loguea: se guarda. Meterla a la fuerza en el
// molde de un CLI habría obligado a inventarle un ejecutable que no existe.
//
// Dónde se guarda es lo importante: en el Gestor de Credenciales de Windows,
// cifrada por el sistema, nunca en un JSON al lado del resto de los ajustes.
// Es el escalón 3 de la META 6, y esta es su primera clave de verdad.
//
// Y la clave NO vuelve a salir de aquí. El front la manda una vez al
// guardarla; a partir de ahí pide datos, no la llave. Así ni pasa por el
// estado de React, ni acaba en un log, ni puede colarse en una captura.

use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::secrets;

/// Con qué nombre vive en el Gestor de Credenciales.
const CLAVE: &str = "openrouter";

#[derive(Deserialize)]
struct Envuelto {
    data: Datos,
}

/// Lo que devuelve `GET /api/v1/key`. Se piden los campos que la tarjeta
/// enseña y ninguno más: `limit` en null significa "sin tope", que no es lo
/// mismo que cero y hay que poder distinguirlo, de ahí los Option.
#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Datos {
    #[serde(default)]
    pub label: String,
    pub limit: Option<f64>,
    pub limit_remaining: Option<f64>,
    #[serde(default)]
    pub usage: f64,
    #[serde(default)]
    pub usage_daily: f64,
    #[serde(default)]
    pub usage_weekly: f64,
    #[serde(default)]
    pub usage_monthly: f64,
    #[serde(default)]
    pub is_free_tier: bool,
}

/// Guarda la clave, comprobándola antes contra OpenRouter.
///
/// Se comprueba primero a propósito: guardar una clave mal copiada y que la
/// tarjeta diga «conectado» hasta que un día falle es peor que no guardarla.
/// Si OpenRouter no la reconoce, no se guarda nada.
#[tauri::command]
pub async fn openrouter_connect(key: String) -> Result<Datos, String> {
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("no has pegado ninguna clave".into());
    }
    let datos = pedir(&key).await?;
    secrets::put(CLAVE, &key)?;
    Ok(datos)
}

/// Los datos de la cuenta guardada. `Ok(None)` = todavía no has puesto clave,
/// que no es un error y no se enseña como tal.
#[tauri::command]
pub async fn openrouter_info() -> Result<Option<Datos>, String> {
    let Some(key) = secrets::get(CLAVE) else {
        return Ok(None);
    };
    pedir(&key).await.map(Some)
}

/// Olvida la clave. Solo borra la de Adeorq: la cuenta de OpenRouter sigue
/// existiendo y la clave sigue siendo válida hasta que la revoques allí.
#[tauri::command]
pub fn openrouter_forget() -> Result<(), String> {
    secrets::forget(CLAVE)
}

/* ── La voz del Asistente ─────────────────────────────────────────────────
   Munir lo pidió el 2026-08-17: «podríamos utilizar Grok TTS, tengo 10$ en
   OpenRouter, para el Asistente». Va por aquí y no por el front porque la
   clave no sale de Rust (la regla de este módulo), y porque OpenRouter ya es
   un vecino conocido: mismo host, misma cabecera, mismo reqwest. */

/// Las voces que Grok ofrece hoy. La primera es la de la casa.
pub const VOCES: [&str; 5] = ["Eve", "Ara", "Rex", "Sal", "Leo"];

/// El texto dicho en alto: mp3 como data URL, listo para un `<audio>` sin
/// pasar por archivos temporales. El modelo admite 15.000 caracteres por
/// petición; se recorta bastante antes porque una respuesta del Asistente que
/// no cabe en 4.000 tampoco se iba a escuchar entera.
#[tauri::command]
pub async fn tts_hablar(texto: String, voz: Option<String>) -> Result<String, String> {
    let Some(key) = secrets::get(CLAVE) else {
        return Err("no hay clave de OpenRouter guardada (Cuentas › OpenRouter)".into());
    };
    let bytes = decir(&key, &texto, voz.as_deref()).await?;
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    Ok(format!("data:audio/mpeg;base64,{}", STANDARD.encode(&bytes)))
}

async fn decir(key: &str, texto: &str, voz: Option<&str>) -> Result<Vec<u8>, String> {
    let texto = texto.trim();
    if texto.is_empty() {
        return Err("nada que decir".into());
    }
    let texto: String = texto.chars().take(4000).collect();
    let voz = voz
        .filter(|v| VOCES.contains(v))
        .unwrap_or(VOCES[0]);
    let client = reqwest::Client::builder()
        // Generar audio tarda más que leer una clave: minuto de margen.
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .post("https://openrouter.ai/api/v1/audio/speech")
        .header("Authorization", format!("Bearer {key}"))
        .json(&serde_json::json!({
            "model": "x-ai/grok-voice-tts-1.0",
            "input": texto,
            "voice": voz,
            "response_format": "mp3",
        }))
        .send()
        .await
        .map_err(|e| format!("no he podido hablar con OpenRouter: {e}"))?;
    if !res.status().is_success() {
        let code = res.status();
        let cuerpo = res.text().await.unwrap_or_default();
        let corto: String = cuerpo.chars().take(200).collect();
        return Err(format!("OpenRouter devolvió {code}: {corto}"));
    }
    res.bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| format!("no he podido bajar el audio: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Contra OpenRouter DE VERDAD, con la clave guardada en esta máquina.
    /// Gasta unos céntimos, por eso va con #[ignore]:
    /// `cargo test la_voz_de_verdad -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn la_voz_de_verdad() {
        let Some(key) = secrets::get(CLAVE) else {
            eprintln!("sin clave de OpenRouter en esta máquina: nada que probar");
            return;
        };
        let bytes = tauri::async_runtime::block_on(decir(&key, "Klk Munito, la voz ya está puesta.", Some("Eve")))
            .expect("la llamada de voz falló");
        // mp3 de verdad: etiqueta ID3 o cabecera de frame MPEG.
        let es_mp3 = bytes.starts_with(b"ID3") || (bytes.len() > 2 && bytes[0] == 0xFF);
        assert!(es_mp3, "lo que volvió no parece un mp3 ({} bytes)", bytes.len());
        assert!(bytes.len() > 4_000, "un audio dicho no puede pesar {} bytes", bytes.len());
        eprintln!("VOZ OK: {} bytes de mp3", bytes.len());
    }
}

async fn pedir(key: &str) -> Result<Datos, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get("https://openrouter.ai/api/v1/key")
        .header("Authorization", format!("Bearer {key}"))
        .send()
        .await
        .map_err(|e| format!("no he podido hablar con OpenRouter: {e}"))?;
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("OpenRouter dice que esa clave no vale".into());
    }
    if !res.status().is_success() {
        return Err(format!("OpenRouter devolvió {}", res.status()));
    }
    res.json::<Envuelto>()
        .await
        .map(|e| e.data)
        .map_err(|e| format!("respuesta ilegible: {e}"))
}
