// Por qué existe cada sesión.
//
// El Capataz despliega sesiones con un cometido, se lo pasa a Claude como
// primer mensaje y ahí se pierde para siempre. Un rato después la barra
// lateral enseña siete títulos cortados —"Construir fro…", "Diseñar front…"—
// y no hay forma de saber cuál era cuál, ni de qué encargo salió ninguna
// (Munir, 2026-07-29). El título lo pone Claude resumiendo la conversación,
// que no es lo mismo que para qué la abriste.
//
// Así que se apunta aquí, indexado por el id de la sesión, que es lo único
// que sobrevive a cerrar el panel y a apagar el ordenador. Es un archivo
// aparte y no una segunda copia de nada: el CLI guarda la CONVERSACIÓN, y
// esto guarda la INTENCIÓN, que él no tiene por qué conocer.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Encargo {
    /// Lo que se le mandó hacer, tal cual salió del plan.
    pub encargo: String,
    /// El puesto, cuando nació dentro de una cuadrilla ("Frontend").
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub rol: String,
    /// El objetivo común de esa cuadrilla, si lo tenía.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub objetivo: String,
    /// Cuándo se desplegó, en ISO. Lo pone el front, que es quien tiene reloj
    /// de verdad; aquí solo se guarda.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub cuando: String,
}

fn encargos_path() -> Result<PathBuf, String> {
    Ok(crate::dir_datos_creado()?.join("encargos.json"))
}

fn leer_todos() -> HashMap<String, Encargo> {
    let Ok(p) = encargos_path() else {
        return HashMap::new();
    };
    let Ok(raw) = std::fs::read_to_string(&p) else {
        return HashMap::new();
    };
    // Un archivo ilegible no puede impedir desplegar una sesión: se empieza de
    // cero y el siguiente encargo lo reescribe. Perder por qué se abrió una
    // sesión es molesto; no poder abrirla sería peor.
    serde_json::from_str(&raw).unwrap_or_default()
}

/// Cuántos se guardan. Sin tope esto crece para siempre, y un archivo que se
/// lee entero en cada arranque no puede depender de que nadie trabaje mucho.
const MAX: usize = 500;

#[tauri::command]
pub fn save_encargo(session_id: String, encargo: Encargo) -> Result<(), String> {
    if session_id.trim().is_empty() {
        return Err("sin id de sesión".into());
    }
    let mut todos = leer_todos();
    todos.insert(session_id, encargo);
    if todos.len() > MAX {
        // Se van los más viejos por fecha. Los que no la tengan se quedan: sin
        // fecha no se puede decir que sean los viejos, y tirar por si acaso lo
        // que no se sabe ordenar es justo como se pierden datos.
        let mut con_fecha: Vec<(String, String)> = todos
            .iter()
            .filter(|(_, e)| !e.cuando.is_empty())
            .map(|(k, e)| (k.clone(), e.cuando.clone()))
            .collect();
        con_fecha.sort_by(|a, b| a.1.cmp(&b.1));
        let sobran = todos.len() - MAX;
        for (k, _) in con_fecha.into_iter().take(sobran) {
            todos.remove(&k);
        }
    }
    let p = encargos_path()?;
    let tmp = p.with_extension("json.tmp");
    let txt = serde_json::to_string_pretty(&todos).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, txt).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_encargos() -> Result<HashMap<String, Encargo>, String> {
    Ok(leer_todos())
}
