//! Lo que usas de Adeorq, apuntado SOLO en tu equipo y SOLO si lo pides.
//!
//! Munir quería saber qué pantallas usa más y menos sin que Adeorq mande nada
//! de nadie (decisión d1a213fec659, 25-nov-2026, con el informe en
//! `_docs/METRICAS-DE-USO.md`). Por eso el interruptor es un archivo y no una
//! compilación: si existe `uso-local.on` en la carpeta de datos, cada cambio de
//! pantalla se apunta en `uso-local-AAAA-MM.jsonl`, en esa misma carpeta; si no
//! existe, no se escribe nada. No hay red ni librería de analítica: el código
//! es público y cualquiera puede comprobar que esto no sale del disco.
//! Se lee con `node scripts/uso-local.mjs`.

use serde_json::{Map, Value};
use std::path::Path;

/// El archivo que lo enciende, en la carpeta de datos.
const INTERRUPTOR: &str = "uso-local.on";
/// Un archivo por mes, y solo los últimos doce.
const MESES: usize = 12;
/// Una línea no pasa de esto: lo que se apunta son nombres de pantallas y números.
const TOPE_LINEA: usize = 1024;

fn encendido_en(dir: &Path) -> bool {
    dir.join(INTERRUPTOR).is_file()
}

/// Si hay que apuntar. La ventana lo pregunta una vez al abrirse.
#[tauri::command(async)]
pub fn uso_local_encendido() -> bool {
    crate::dir_datos_creado().map(|d| encendido_en(&d)).unwrap_or(false)
}

/// Apunta un evento (un objeto: `{"ev":"vista","de":"panel","a":"cabina","ms":4200}`).
/// Sin el interruptor no hace nada, aunque la ventana lo pida.
#[tauri::command(async)]
pub fn uso_local_anotar(evento: Value) -> Result<(), String> {
    let dir = crate::dir_datos_creado()?;
    anotar_en(&dir, evento, &crate::ahora(), env!("CARGO_PKG_VERSION"))
}

fn anotar_en(dir: &Path, evento: Value, ahora: &str, version: &str) -> Result<(), String> {
    use std::io::Write;
    if !encendido_en(dir) {
        return Ok(());
    }
    let Value::Object(campos) = evento else {
        return Err("el evento de uso tiene que ser un objeto".into());
    };
    let mut linea = Map::new();
    linea.insert("t".into(), ahora.into());
    linea.insert("v".into(), version.into());
    for (k, v) in campos {
        if k != "t" && k != "v" {
            linea.insert(k, v);
        }
    }
    let mut texto = serde_json::to_string(&Value::Object(linea)).map_err(|e| e.to_string())?;
    if texto.len() > TOPE_LINEA {
        return Err(format!("el evento de uso pasa de {TOPE_LINEA} caracteres"));
    }
    texto.push('\n');
    let mes = ahora.get(..7).unwrap_or("sin-fecha");
    let ruta = dir.join(format!("uso-local-{mes}.jsonl"));
    let nuevo = !ruta.exists();
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&ruta)
        .map_err(|e| format!("no pude abrir {}: {e}", ruta.display()))?;
    // La línea entera de una vez, como el rastro: escriben la ventana principal
    // y las sueltas.
    f.write_all(texto.as_bytes()).map_err(|e| e.to_string())?;
    if nuevo {
        podar(dir, MESES);
    }
    Ok(())
}

/// Deja solo los `quedan` meses más nuevos.
fn podar(dir: &Path, quedan: usize) {
    let Ok(entradas) = std::fs::read_dir(dir) else { return };
    let mut meses: Vec<_> = entradas
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            let n = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            n.starts_with("uso-local-") && n.ends_with(".jsonl") && n.len() == "uso-local-2026-11.jsonl".len()
        })
        .collect();
    meses.sort();
    let sobran = meses.len().saturating_sub(quedan);
    for p in &meses[..sobran] {
        let _ = std::fs::remove_file(p);
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use serde_json::json;

    fn carpeta(nombre: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("adeorq-uso-local-{nombre}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn archivos(d: &Path) -> Vec<String> {
        let mut v: Vec<String> = std::fs::read_dir(d).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        v.sort();
        v
    }

    #[test]
    fn sin_el_interruptor_no_se_escribe_nada() {
        let d = carpeta("apagado");
        anotar_en(&d, json!({"ev": "vista", "de": "panel", "a": "cabina", "ms": 10}), "2026-11-25 20:00:00", "9.9.9").unwrap();
        assert!(archivos(&d).is_empty(), "{:?}", archivos(&d));
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn con_el_interruptor_apunta_una_linea_con_su_hora_y_version() {
        let d = carpeta("encendido");
        std::fs::write(d.join(INTERRUPTOR), "").unwrap();
        // Lo que manda la ventana no pisa la hora ni la versión.
        anotar_en(&d, json!({"ev": "vista", "de": "panel", "a": "cabina", "ms": 4200, "t": "mentira"}), "2026-11-25 20:00:00", "9.9.9").unwrap();
        anotar_en(&d, json!({"ev": "vista", "de": "cabina", "a": "ajustes", "ms": 9000}), "2026-11-25 20:01:00", "9.9.9").unwrap();
        let texto = std::fs::read_to_string(d.join("uso-local-2026-11.jsonl")).unwrap();
        let lineas: Vec<Value> = texto.lines().map(|l| serde_json::from_str(l).unwrap()).collect();
        assert_eq!(lineas.len(), 2);
        assert_eq!(lineas[0]["t"], "2026-11-25 20:00:00");
        assert_eq!(lineas[0]["v"], "9.9.9");
        assert_eq!(lineas[0]["a"], "cabina");
        assert_eq!(lineas[1]["ms"], 9000);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn rechaza_lo_que_no_es_un_objeto_y_lo_que_es_enorme() {
        let d = carpeta("raro");
        std::fs::write(d.join(INTERRUPTOR), "").unwrap();
        assert!(anotar_en(&d, json!("texto suelto"), "2026-11-25 20:00:00", "9.9.9").is_err());
        assert!(anotar_en(&d, json!({"ev": "x".repeat(2000)}), "2026-11-25 20:00:00", "9.9.9").is_err());
        assert_eq!(archivos(&d), vec![INTERRUPTOR.to_string()]);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn se_queda_con_los_ultimos_doce_meses() {
        let d = carpeta("meses");
        std::fs::write(d.join(INTERRUPTOR), "").unwrap();
        std::fs::write(d.join("rastro.log"), "no es suyo").unwrap();
        for m in 1..=12 {
            std::fs::write(d.join(format!("uso-local-2025-{m:02}.jsonl")), "{}\n").unwrap();
        }
        anotar_en(&d, json!({"ev": "vista"}), "2026-01-03 10:00:00", "9.9.9").unwrap();
        let quedan = archivos(&d);
        assert!(!quedan.contains(&"uso-local-2025-01.jsonl".to_string()), "{quedan:?}");
        assert!(quedan.contains(&"uso-local-2025-02.jsonl".to_string()), "{quedan:?}");
        assert!(quedan.contains(&"uso-local-2026-01.jsonl".to_string()), "{quedan:?}");
        assert!(quedan.contains(&"rastro.log".to_string()) && quedan.contains(&INTERRUPTOR.to_string()), "{quedan:?}");
        assert_eq!(quedan.iter().filter(|n| n.starts_with("uso-local-2")).count(), 12, "{quedan:?}");
        let _ = std::fs::remove_dir_all(&d);
    }
}
