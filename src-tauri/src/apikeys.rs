// Las claves de API de los modelos.
//
// Una cuenta de Adeorq puede ser dos cosas muy distintas, y esto es la segunda:
//
//   · Un LOGIN: el CLI guarda su sesión en una carpeta, y esa carpeta es la
//     cuenta. Es lo que hay en accounts.rs, y es lo que gasta tu suscripción.
//   · Una CLAVE: no se instala ni se loguea, se guarda. Y factura por tokens.
//
// La diferencia importa porque se paga distinto. Con suscripción no puedes
// pasarte; con clave sí, y sin verlo, y por eso el chat lleva su contador.
//
// La clave se guarda cifrada en el Gestor de Credenciales de Windows y NO vuelve
// al front nunca: ni para enseñarla ni para arrancar un CLI con ella. Cuando una
// terminal necesita una, el front pide `@secreto:api:<proveedor>` y quien lo
// cambia por la clave de verdad es Rust, justo antes de crear el proceso (ver
// pty.rs). Así la clave no pasa por el WebView ni aparece en ningún estado.

use serde::Serialize;

use crate::secrets;

/// Bajo qué nombre vive la clave de un proveedor.
fn nombre(proveedor: &str) -> Result<String, String> {
    // Solo lo que puede ser un id de proveedor: esto compone el nombre de una
    // credencial del sistema, y no se construyen nombres con lo que llegue.
    if proveedor.is_empty()
        || proveedor.len() > 32
        || !proveedor.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("proveedor no válido".into());
    }
    Ok(format!("api:{proveedor}"))
}

#[derive(Serialize)]
pub struct EstadoClave {
    pub proveedor: String,
    /// Los cuatro últimos caracteres, que es lo único que se puede enseñar sin
    /// enseñar la clave: sirve para saber CUÁL pusiste, no para usarla.
    pub cola: String,
}

/// Guarda la clave de un proveedor. No se comprueba contra su API a propósito:
/// cada proveedor valida de una forma y algunos cobran por intentarlo. La que
/// sí se comprueba es la de OpenRouter, porque su endpoint de cuenta es gratis
/// (ver openrouter.rs).
#[tauri::command]
pub fn api_key_put(proveedor: String, clave: String) -> Result<(), String> {
    let clave = clave.trim();
    if clave.is_empty() {
        return Err("no has pegado ninguna clave".into());
    }
    secrets::put(&nombre(&proveedor)?, clave)
}

#[tauri::command]
pub fn api_key_forget(proveedor: String) -> Result<(), String> {
    secrets::forget(&nombre(&proveedor)?)
}

/// Qué claves hay guardadas. Devuelve la cola de cada una y nunca la clave.
#[tauri::command]
pub fn api_keys_estado(proveedores: Vec<String>) -> Vec<EstadoClave> {
    let mut out = Vec::new();
    for p in proveedores {
        let Ok(n) = nombre(&p) else { continue };
        if let Some(k) = secrets::get(&n) {
            let cola: String = k.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
            out.push(EstadoClave { proveedor: p, cola });
        }
    }
    out
}
