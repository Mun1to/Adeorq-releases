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
