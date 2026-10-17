//! Las partes grandes de Adeorq que se pueden apagar enteras: la Cabina, el
//! Lienzo, la Memoria y el Chat (Munir, 2026-10-17, A2 B1 C2).
//!
//! Lo decide la ventana (`src/lib/partes.ts`, que también explica las reglas)
//! y aquí se guarda una copia, porque lo que corre en Rust sin preguntarle a
//! la ventana tiene que saberlo por su cuenta: el hilo que calcula los
//! significados de la memoria, las herramientas que el MCP les da a los
//! agentes y las que se le prestan al conserje. Se lee del disco cada vez:
//! son unas pocas veces por minuto, y así no hay un estado que se desfase.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Las que se pueden apagar. Lo demás (Panel, Agenda, Decisiones, Cuentas,
/// Comandos y Ajustes) va siempre.
pub const PARTES: [&str; 4] = ["cabina", "lienzo", "memoria", "chat"];

#[derive(Default, Serialize, Deserialize)]
struct Guardado {
    #[serde(default)]
    apagadas: Vec<String>,
}

fn ruta() -> Result<PathBuf, String> {
    crate::dir_datos().map(|d| d.join("partes.json"))
}

/// Lo apagado, ya limpio. Sin archivo (lo normal hasta que alguien apague
/// algo), ninguna.
fn leer_de(ruta: &Path) -> Vec<String> {
    let guardado: Guardado = std::fs::read_to_string(ruta)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    validar(&guardado.apagadas).unwrap_or_default()
}

/// Si esa parte está apagada.
pub fn apagada(parte: &str) -> bool {
    ruta().map(|r| leer_de(&r).iter().any(|p| p == parte)).unwrap_or(false)
}

/// Lo que llega de la ventana, comprobado: solo las cuatro, sin repetir, y
/// nunca la Cabina y el Lienzo a la vez (sin ninguno no hay dónde abrir una
/// terminal). La ventana ya no lo deja hacer; esto es por si llega de otro sitio.
fn validar(apagadas: &[String]) -> Result<Vec<String>, String> {
    let mut limpias: Vec<String> = Vec::new();
    for p in apagadas {
        if !PARTES.contains(&p.as_str()) {
            return Err(format!("«{p}» no es una parte que se pueda apagar"));
        }
        if !limpias.contains(p) {
            limpias.push(p.clone());
        }
    }
    if limpias.iter().any(|p| p == "cabina") && limpias.iter().any(|p| p == "lienzo") {
        return Err("La Cabina y el Lienzo no se pueden apagar a la vez".into());
    }
    Ok(limpias)
}

fn guardar_en(ruta: &Path, apagadas: &[String]) -> Result<(), String> {
    let limpias = validar(apagadas)?;
    if let Some(dir) = ruta.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let texto = serde_json::to_string_pretty(&Guardado { apagadas: limpias }).map_err(|e| e.to_string())?;
    // Atómico, como `mcp_clientes`: una caída a medias no deja un JSON roto
    // que se leería como «ninguna apagada».
    let tmp = ruta.with_extension("json.tmp");
    std::fs::write(&tmp, texto).map_err(|e| format!("no pude escribir {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, ruta).map_err(|e| format!("no pude renombrar a {}: {e}", ruta.display()))
}

/// La ventana cuenta qué partes están apagadas, al abrir y cada vez que cambia.
#[tauri::command(async)]
pub fn fijar_partes(apagadas: Vec<String>) -> Result<(), String> {
    guardar_en(&ruta()?, &apagadas)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn carpeta(nombre: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("adeorq-partes-{nombre}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn se_guarda_y_se_lee_limpio() {
        let d = carpeta("guardar");
        let r = d.join("partes.json");
        assert!(leer_de(&r).is_empty(), "sin archivo no hay ninguna apagada");
        guardar_en(&r, &["memoria".into(), "chat".into(), "memoria".into()]).unwrap();
        assert_eq!(leer_de(&r), vec!["memoria".to_string(), "chat".to_string()]);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn no_se_apagan_las_dos_de_terminales_ni_lo_que_no_es_una_parte() {
        let d = carpeta("reglas");
        let r = d.join("partes.json");
        assert!(guardar_en(&r, &["cabina".into(), "lienzo".into()]).is_err());
        assert!(guardar_en(&r, &["agenda".into()]).is_err());
        assert!(guardar_en(&r, &["ajustes".into()]).is_err());
        // Un archivo tocado a mano con las dos no apaga ninguna, en vez de
        // dejar a Adeorq sin sitio para las terminales.
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(&r, r#"{"apagadas":["cabina","lienzo"]}"#).unwrap();
        assert!(leer_de(&r).is_empty());
        std::fs::write(&r, "{roto").unwrap();
        assert!(leer_de(&r).is_empty(), "un JSON roto no apaga nada");
        std::fs::remove_dir_all(&d).ok();
    }
}
