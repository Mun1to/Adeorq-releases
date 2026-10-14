//! Lo que Adeorq deja en la carpeta temporal y nadie recoge.
//!
//! Cada actualización baja su instalador a `Adeorq-<versión>-updater-XXXXXX`
//! (lo hace el plugin del actualizador) y la carpeta se queda ahí: el
//! instalador se lanza mientras la app se cierra, así que no hay quien la
//! borre. El 2026-10-13 había 147 en la máquina de Munir. Se recogen al
//! arrancar, que es cuando la actualización anterior ya está instalada.

use std::path::Path;
use std::time::{Duration, SystemTime};

/// Más joven que esto puede ser una actualización bajándose ahora mismo.
const EDAD_MINIMA: Duration = Duration::from_secs(24 * 60 * 60);

/// ¿Es una carpeta del actualizador de Adeorq? Por el nombre entero, para no
/// llevarse nada de otro programa que también use «updater».
fn es_del_actualizador(nombre: &str) -> bool {
    nombre.starts_with("Adeorq-") && nombre.contains("-updater-")
}

/// Borra de `dir` las carpetas del actualizador con más de un día. Devuelve
/// cuántas se llevó. Lo que no se puede leer o borrar se deja estar.
pub fn recoger_actualizador(dir: &Path, ahora: SystemTime) -> usize {
    let Ok(entradas) = std::fs::read_dir(dir) else { return 0 };
    let mut borradas = 0;
    for e in entradas.flatten() {
        let nombre = e.file_name().to_string_lossy().to_string();
        if !es_del_actualizador(&nombre) {
            continue;
        }
        let Ok(meta) = e.metadata() else { continue };
        if !meta.is_dir() {
            continue;
        }
        let vieja = meta
            .modified()
            .ok()
            .and_then(|m| ahora.duration_since(m).ok())
            .is_some_and(|edad| edad >= EDAD_MINIMA);
        if vieja && std::fs::remove_dir_all(e.path()).is_ok() {
            borradas += 1;
        }
    }
    borradas
}

#[cfg(test)]
mod tests {
    use super::*;

    fn casa(nombre: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("adeorq-temporales-{}-{nombre}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn solo_se_lleva_las_del_actualizador_y_solo_las_viejas() {
        let d = casa("viejas");
        let suya = d.join("Adeorq-0.9.164-updater-IsAwxP");
        let otra = d.join("Adeorq-0.9.165-updater-h01lky");
        let ajena = d.join("OtroPrograma-1.0-updater-abc");
        let parecida = d.join("adeorq-pub-x1BMZL");
        for c in [&suya, &otra, &ajena, &parecida] {
            std::fs::create_dir_all(c).unwrap();
        }
        std::fs::write(suya.join("Adeorq-0.9.164-installer.exe"), b"x").unwrap();
        // Un archivo con ese nombre no es una carpeta del actualizador.
        let archivo = d.join("Adeorq-0.1.0-updater-nota.txt");
        std::fs::write(&archivo, b"x").unwrap();

        // Recién hechas: puede ser una actualización bajándose. No se tocan.
        assert_eq!(recoger_actualizador(&d, SystemTime::now()), 0);
        assert!(suya.exists() && otra.exists());

        // Dos días después sobran las dos, con lo que lleven dentro.
        let luego = SystemTime::now() + Duration::from_secs(2 * 24 * 60 * 60);
        assert_eq!(recoger_actualizador(&d, luego), 2);
        assert!(!suya.exists() && !otra.exists());
        assert!(ajena.exists() && parecida.exists() && archivo.exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn una_carpeta_que_no_existe_no_rompe_nada() {
        let d = std::env::temp_dir().join("adeorq-temporales-no-existe");
        assert_eq!(recoger_actualizador(&d, SystemTime::now()), 0);
    }
}
