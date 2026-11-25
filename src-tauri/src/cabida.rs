//! Cuántas terminales con su agente caben todavía en la RAM del equipo.
//!
//! Un tope fijo («seis a la vez») sirve igual de mal en un portátil de 8 GB, que se
//! ahoga antes, que en uno de 64, que podría con el doble. Munir, 2026-11-25: que
//! los agentes, «en base a la memoria que tienes», puedan abrir terminales «sin
//! saturar tu ordenador». Aquí se hace la cuenta con lo que el equipo dice que le
//! queda y con lo que pesan de verdad las terminales que ya están abiertas.
//!
//! La cuenta es pura (`caben`, `reserva_mb`, `por_terminal_mb`) para poder
//! probarla sin máquina; `medir` es la única parte que mira el equipo.
//!
//! La usan los dos topes que eligió poner en automático (decisión d1a213cb2ce0,
//! «Los dos»): el de las terminales que abren los agentes por MCP, que se decide
//! aquí, en Rust, donde el agente no lo toca (`TopeAgentes`, `tope_ahora`), y el
//! de «Cuántas sesiones abre de golpe un proyecto», que pide `cabida` desde la
//! ventana (`src/lib/topeAbrir.ts`). En los dos, el número de Ajustes pasa a ser
//! «como mucho»: la memoria decide hasta ahí, nunca más.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Lo que se deja siempre libre: un 15 % de la RAM, y nunca menos de 2 GB. Es lo
/// que necesita Windows para no empezar a tirar del disco, más la ventana de
/// Adeorq, el navegador y lo que tengas abierto aparte de los agentes.
const RESERVA_PCT: u64 = 15;
const RESERVA_MIN_MB: u64 = 2048;

/// Lo que se cuenta por terminal como poco. Un Claude Code con su envoltorio
/// pesaba 514 MB el 2026-08-08, y el 2026-11-25 los ocho abiertos daban 494 de
/// media y 895 el mayor. Una terminal recién nacida pesa menos de lo que pesará
/// en cuanto trabaje, así que la media de las abiertas nunca baja de aquí.
const POR_TERMINAL_MIN_MB: u64 = 500;

/// La RAM del equipo y la cuenta hecha con ella, en megas.
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Cabida {
    pub total_mb: u64,
    pub libre_mb: u64,
    pub reserva_mb: u64,
    pub por_terminal_mb: u64,
    /// Cuántas terminales más caben sin bajar de la reserva.
    pub caben: usize,
}

/// Lo que se guarda libre en un equipo con `total_mb` de RAM.
pub fn reserva_mb(total_mb: u64) -> u64 {
    (total_mb * RESERVA_PCT / 100).max(RESERVA_MIN_MB)
}

/// Lo que se cuenta que ocupará una terminal más: la media de las que ya tienen un
/// agente dentro, y nunca menos del mínimo. Sin ninguna abierta, el mínimo.
pub fn por_terminal_mb(medidas_mb: &[u64]) -> u64 {
    if medidas_mb.is_empty() {
        return POR_TERMINAL_MIN_MB;
    }
    let media = medidas_mb.iter().sum::<u64>() / medidas_mb.len() as u64;
    media.max(POR_TERMINAL_MIN_MB)
}

/// Cuántas terminales de `por_terminal_mb` caben en `libre_mb` sin bajar de la
/// reserva de un equipo de `total_mb`.
pub fn caben(libre_mb: u64, total_mb: u64, por_terminal_mb: u64) -> usize {
    let por = por_terminal_mb.max(1);
    (libre_mb.saturating_sub(reserva_mb(total_mb)) / por) as usize
}

/// La cuenta con lo que tiene el equipo ahora mismo. `None` si el sistema no dijo
/// cuánta RAM tiene: sin ese dato no se decide nada por la memoria.
pub fn medir(app: &tauri::AppHandle) -> Option<Cabida> {
    let (total, libre) = crate::pulso::memoria_equipo();
    if total == 0 {
        return None;
    }
    let mb = |b: u64| b / 1_048_576;
    let medidas: Vec<u64> =
        crate::pulso::medir_paneles(app).into_iter().filter(|p| p.agente).map(|p| p.ram_mb).collect();
    let por = por_terminal_mb(&medidas);
    Some(Cabida {
        total_mb: mb(total),
        libre_mb: mb(libre),
        reserva_mb: reserva_mb(mb(total)),
        por_terminal_mb: por,
        caben: caben(mb(libre), mb(total), por),
    })
}

/// La cuenta de ahora, para la ventana: Ajustes la enseña y «abrir de golpe» la usa.
#[tauri::command(async)]
pub fn cabida(app: tauri::AppHandle) -> Option<Cabida> {
    medir(&app)
}

/* ------------------------------------------- el tope de las que abren los agentes */

/// Sin dato de la memoria (el sistema no contestó), el tope fijo de siempre.
pub const SIN_MEMORIA: usize = 6;

/// Lo que se elige en Ajustes › Terminales para las terminales que abren los
/// agentes por MCP. De fábrica, según la memoria y como mucho doce, que es lo que
/// deja abrir el tope por hora (`MAX_POR_HORA`): por encima no se llegaría nunca.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TopeAgentes {
    pub por_memoria: bool,
    pub como_mucho: usize,
}

impl Default for TopeAgentes {
    fn default() -> Self {
        Self { por_memoria: true, como_mucho: crate::mcp::MAX_POR_HORA }
    }
}

impl TopeAgentes {
    /// Entre 1 y el tope por hora, venga de donde venga: un archivo tocado a mano
    /// no sube el freno por encima de lo que la app deja elegir.
    fn limpio(self) -> Self {
        Self { como_mucho: self.como_mucho.clamp(1, crate::mcp::MAX_POR_HORA), ..self }
    }
}

fn ruta() -> Result<PathBuf, String> {
    crate::dir_datos().map(|d| d.join("tope-agentes.json"))
}

fn leer_de(ruta: &Path) -> TopeAgentes {
    std::fs::read_to_string(ruta)
        .ok()
        .and_then(|s| serde_json::from_str::<TopeAgentes>(&s).ok())
        .unwrap_or_default()
        .limpio()
}

fn guardar_en(ruta: &Path, tope: TopeAgentes) -> Result<TopeAgentes, String> {
    let limpio = tope.limpio();
    if let Some(dir) = ruta.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let texto = serde_json::to_string_pretty(&limpio).map_err(|e| e.to_string())?;
    // Atómico, como `partes.rs`: una caída a medias no deja un JSON roto.
    let tmp = ruta.with_extension("json.tmp");
    std::fs::write(&tmp, texto).map_err(|e| format!("no pude escribir {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, ruta).map_err(|e| format!("no pude renombrar a {}: {e}", ruta.display()))?;
    Ok(limpio)
}

/// Lo elegido. Se lee del disco cada vez, como las partes: se mira al abrir o
/// cerrar una terminal, y así no hay un estado que se desfase.
#[tauri::command(async)]
pub fn tope_agentes() -> TopeAgentes {
    ruta().map(|r| leer_de(&r)).unwrap_or_default()
}

/// Ajustes lo cambia. Devuelve lo que quedó guardado, ya dentro de sus límites.
#[tauri::command(async)]
pub fn fijar_tope_agentes(tope: TopeAgentes) -> Result<TopeAgentes, String> {
    guardar_en(&ruta()?, tope)
}

/// El tope que manda ahora mismo: el número elegido y, si va por la memoria, la
/// cuenta de este momento.
#[derive(Debug, Clone, PartialEq)]
pub struct TopeAhora {
    pub como_mucho: usize,
    pub ram: Option<Cabida>,
}

/// Lo elegido con la memoria de ahora. Mira los procesos del equipo, así que se
/// llama ANTES de coger ningún candado.
pub fn tope_ahora(app: &tauri::AppHandle) -> TopeAhora {
    resolver(tope_agentes(), || medir(app))
}

fn resolver(elegido: TopeAgentes, medir: impl FnOnce() -> Option<Cabida>) -> TopeAhora {
    if !elegido.por_memoria {
        return TopeAhora { como_mucho: elegido.como_mucho, ram: None };
    }
    match medir() {
        Some(c) => TopeAhora { como_mucho: elegido.como_mucho, ram: Some(c) },
        None => TopeAhora { como_mucho: elegido.como_mucho.min(SIN_MEMORIA), ram: None },
    }
}

impl TopeAhora {
    /// Por qué no cabe otra con `vivas` abiertas y `en_curso` abriéndose, o `None`.
    /// Las que se están abriendo aún no ocupan memoria: se descuentan de las que caben.
    pub fn por_que_no(&self, vivas: usize, en_curso: usize) -> Option<String> {
        if vivas + en_curso >= self.como_mucho {
            return Some(format!(
                "Tope alcanzado: ya hay {} terminales vivas abiertas por MCP, que es lo que deja \
                 Ajustes › Terminales. Cierra alguna (o pide que la cierren) antes de abrir otra.",
                self.como_mucho
            ));
        }
        let c = self.ram.as_ref()?;
        (c.caben <= en_curso).then(|| {
            format!(
                "No cabe otra en la memoria: al equipo le quedan {} MB libres, cada terminal con su \
                 agente ocupa unos {} y Adeorq guarda {} libres para que el equipo no se ahogue. \
                 Cierra alguna (o pide que la cierren) antes de abrir otra.",
                c.libre_mb, c.por_terminal_mb, c.reserva_mb
            )
        })
    }

    /// Para cuántas más hay sitio con `vivas` abiertas.
    pub fn sitio(&self, vivas: usize) -> usize {
        let por_numero = self.como_mucho.saturating_sub(vivas);
        self.ram.as_ref().map_or(por_numero, |c| por_numero.min(c.caben))
    }

    /// El tope dicho en pocas palabras, para lo que contesta `close_pane`.
    pub fn en_palabras(&self) -> String {
        match self.ram {
            Some(_) => format!("como mucho {} a la vez, y las que quepan en la memoria libre", self.como_mucho),
            None => format!("el tope es {} a la vez", self.como_mucho),
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn con_memoria(como_mucho: usize, caben: usize) -> TopeAhora {
        TopeAhora {
            como_mucho,
            ram: Some(Cabida { total_mb: 32_768, libre_mb: 9_000, reserva_mb: 4_915, por_terminal_mb: 500, caben }),
        }
    }

    #[test]
    fn por_memoria_abre_las_que_caben_y_nunca_mas_del_numero() {
        let t = con_memoria(12, 3);
        assert_eq!(t.por_que_no(2, 0), None, "dos vivas, tres caben");
        assert_eq!(t.por_que_no(2, 2), None, "con dos abriéndose queda sitio para una");
        assert!(t.por_que_no(2, 3).unwrap().contains("memoria"), "las tres que caben ya se están abriendo");
        assert_eq!(t.sitio(2), 3);
        // Con memoria de sobra manda el número.
        let sobra = con_memoria(4, 40);
        assert!(sobra.por_que_no(4, 0).unwrap().contains("vivas"));
        assert!(sobra.por_que_no(3, 1).unwrap().contains("vivas"), "la que se abre también cuenta");
        assert_eq!(sobra.sitio(1), 3);
        assert_eq!(sobra.sitio(9), 0);
    }

    #[test]
    fn sin_memoria_manda_el_numero_y_sin_dato_el_de_siempre() {
        let fijo = resolver(TopeAgentes { por_memoria: false, como_mucho: 9 }, || panic!("sin memoria no se mide"));
        assert_eq!(fijo, TopeAhora { como_mucho: 9, ram: None });
        assert_eq!(fijo.por_que_no(8, 0), None);
        assert!(fijo.por_que_no(9, 0).unwrap().contains("vivas"));
        assert_eq!(fijo.en_palabras(), "el tope es 9 a la vez");
        // Por memoria, pero el sistema no dijo cuánta tiene: seis, como antes.
        let sin_dato = resolver(TopeAgentes::default(), || None);
        assert_eq!(sin_dato, TopeAhora { como_mucho: SIN_MEMORIA, ram: None });
        let medido = resolver(TopeAgentes::default(), || con_memoria(0, 5).ram);
        assert_eq!(medido.como_mucho, crate::mcp::MAX_POR_HORA, "de fábrica, como mucho el tope por hora");
        assert!(medido.en_palabras().contains("memoria libre"));
    }

    #[test]
    fn lo_guardado_vuelve_dentro_de_sus_limites() {
        let d = std::env::temp_dir().join(format!("adeorq-tope-agentes-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        let r = d.join("tope-agentes.json");
        assert_eq!(leer_de(&r), TopeAgentes::default(), "sin archivo, el de fábrica");
        assert_eq!(guardar_en(&r, TopeAgentes { por_memoria: false, como_mucho: 3 }).unwrap().como_mucho, 3);
        assert_eq!(leer_de(&r), TopeAgentes { por_memoria: false, como_mucho: 3 });
        assert_eq!(guardar_en(&r, TopeAgentes { por_memoria: true, como_mucho: 0 }).unwrap().como_mucho, 1);
        // Un archivo tocado a mano no pasa del tope por hora.
        std::fs::write(&r, r#"{"porMemoria":false,"comoMucho":500}"#).unwrap();
        assert_eq!(leer_de(&r).como_mucho, crate::mcp::MAX_POR_HORA);
        std::fs::write(&r, "roto").unwrap();
        assert_eq!(leer_de(&r), TopeAgentes::default(), "un JSON roto es el de fábrica");
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn la_reserva_es_un_quince_por_ciento_y_nunca_menos_de_dos_gigas() {
        assert_eq!(reserva_mb(32_768), 4_915, "en 32 GB, el 15 %");
        assert_eq!(reserva_mb(8_192), 2_048, "en 8 GB el 15 % serían 1,2 GB: se quedan 2");
        assert_eq!(reserva_mb(0), 2_048);
    }

    #[test]
    fn una_terminal_cuenta_la_media_de_las_abiertas_y_nunca_menos_del_minimo() {
        assert_eq!(por_terminal_mb(&[]), 500, "sin ninguna abierta, el mínimo");
        assert_eq!(por_terminal_mb(&[600, 800, 1000]), 800);
        assert_eq!(por_terminal_mb(&[90, 120]), 500, "dos Codex ligeros no bajan la cuenta");
    }

    #[test]
    fn caben_las_que_dejan_libre_la_reserva() {
        // Su equipo el 2026-11-25: 31,4 GB y 11,6 libres, a 500 MB por terminal.
        // Reserva 4.822: (11.878 - 4.822) / 500 = 14.
        assert_eq!(caben(11_878, 32_153, 500), 14);
        // Un portátil de 8 GB con 3 libres: 3.072 - 2.048 = 1.024, dos de 500.
        assert_eq!(caben(3_072, 8_192, 500), 2);
        // Justo en la reserva, o por debajo: ninguna.
        assert_eq!(caben(2_048, 8_192, 500), 0);
        assert_eq!(caben(1_000, 8_192, 500), 0);
        // Una terminal que pesa cero no divide por cero.
        assert_eq!(caben(10_000, 8_192, 0), 7_952);
    }
}
