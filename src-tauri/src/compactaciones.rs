//! Cuántas veces se ha compactado una conversación de Claude Code.
//!
//! Cada `/compact` (a mano o el automático del CLI) deja en el transcript una
//! línea `"subtype":"compact_boundary"`, y la conversación sigue en el mismo
//! fichero. Ya compactada dos veces, otra más sale peor que seguir en una
//! terminal nueva: cada resumen se hace sobre el anterior (Munir, 2026-10-22,
//! D4: «Sí, que me la ofrezca»; ver `COMPACTADA_DE_MAS` en `lib/contexto.ts`).
//!
//! Un transcript largo pasa de 100 MB, así que se lee por trozos sin cargarlo
//! entero, y se recuerda hasta dónde se contó: la vez siguiente solo se mira lo
//! que creció. Dentro del texto de un mensaje las comillas van escapadas
//! (`\"subtype\"`), así que una línea citada no cuenta.

use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const MARCA: &[u8] = br#""subtype":"compact_boundary""#;
const TROZO: usize = 1 << 20;

/// Las marcas que hay en lo que da `r`, leído de `trozo` en `trozo` bytes. Una
/// marca partida entre dos trozos se cuenta una vez: de cada trozo se guardan
/// los últimos `MARCA.len() - 1` bytes, donde no cabe una entera.
fn contar_en<R: Read>(mut r: R, trozo: usize) -> std::io::Result<u32> {
    let guarda = MARCA.len() - 1;
    let mut buf = vec![0u8; trozo];
    let mut cola: Vec<u8> = Vec::new();
    let mut n = 0u32;
    loop {
        let leidos = r.read(&mut buf)?;
        if leidos == 0 {
            return Ok(n);
        }
        cola.extend_from_slice(&buf[..leidos]);
        n += cola.windows(MARCA.len()).filter(|w| *w == MARCA).count() as u32;
        let corte = cola.len().saturating_sub(guarda);
        cola.drain(..corte);
    }
}

/// Lo contado de cada transcript: hasta qué byte y cuántas.
fn hecho() -> &'static Mutex<HashMap<PathBuf, (u64, u32)>> {
    static HECHO: OnceLock<Mutex<HashMap<PathBuf, (u64, u32)>>> = OnceLock::new();
    HECHO.get_or_init(Default::default)
}

/// Las de `path`, contando solo lo que creció desde la última vez. Si el
/// fichero encogió (otro fichero con el mismo nombre), se cuenta entero.
pub fn contar(path: &Path) -> std::io::Result<u32> {
    let largo = std::fs::metadata(path)?.len();
    let (desde, antes) = hecho()
        .lock()
        .ok()
        .and_then(|h| h.get(path).copied())
        .filter(|(hasta, _)| *hasta <= largo)
        .unwrap_or((0, 0));
    let mut f = std::fs::File::open(path)?;
    // Se vuelve atrás lo justo para ver entera una marca que quedó partida.
    let inicio = desde.saturating_sub(MARCA.len() as u64 - 1);
    f.seek(SeekFrom::Start(inicio))?;
    let nuevas = contar_en(f.take(largo - inicio), TROZO)?;
    let total = antes + nuevas;
    if let Ok(mut h) = hecho().lock() {
        h.insert(path.to_path_buf(), (largo, total));
    }
    Ok(total)
}

/// Para la ventana: las de la conversación de un panel. Sin transcript, 0.
#[tauri::command(async)]
pub fn session_compactions(cwd: String, session_id: Option<String>) -> u32 {
    crate::sessions::transcript_de(&cwd, session_id.as_deref())
        .and_then(|p| contar(&p).ok())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    const LINEA: &str = "{\"type\":\"system\",\"subtype\":\"compact_boundary\",\"compactMetadata\":{\"postTokens\":30000}}\n";

    #[test]
    fn cuenta_las_marcas_aunque_queden_partidas_entre_trozos() {
        let texto = format!("{{\"type\":\"user\"}}\n{LINEA}{{\"a\":1}}\n{LINEA}{LINEA}");
        // Trozos de 7 bytes: casi todas las marcas caen partidas.
        for trozo in [1, 7, 31, 1 << 20] {
            assert_eq!(contar_en(texto.as_bytes(), trozo).unwrap(), 3, "con trozos de {trozo}");
        }
    }

    #[test]
    fn una_marca_citada_dentro_de_un_mensaje_no_cuenta() {
        let citada = "{\"type\":\"user\",\"message\":{\"content\":\"grep \\\"subtype\\\":\\\"compact_boundary\\\"\"}}\n";
        assert_eq!(contar_en(citada.as_bytes(), 1 << 20).unwrap(), 0);
    }

    /// Cuántas tiene un transcript de verdad y cuánto tarda, la primera vez y la
    /// segunda: `TRANSCRIPT="C:\…\x.jsonl" cargo test --lib mide_un_transcript -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn mide_un_transcript() {
        let p = PathBuf::from(std::env::var("TRANSCRIPT").expect("TRANSCRIPT=<ruta del .jsonl>"));
        let mb = std::fs::metadata(&p).unwrap().len() / (1 << 20);
        let t = std::time::Instant::now();
        let n = contar(&p).unwrap();
        let primera = t.elapsed();
        let t = std::time::Instant::now();
        assert_eq!(contar(&p).unwrap(), n);
        println!("{n} compactaciones en {mb} MB: {primera:?} la primera vez, {:?} la segunda", t.elapsed());
    }

    #[test]
    fn la_segunda_vez_solo_cuenta_lo_que_crecio() {
        let dir = std::env::temp_dir().join(format!("adeorq-compactaciones-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("s.jsonl");
        std::fs::write(&p, format!("{LINEA}{{\"x\":1}}\n")).unwrap();
        assert_eq!(contar(&p).unwrap(), 1);
        // Crece con otra marca: se cuenta una más, no las dos otra vez.
        let mut f = std::fs::OpenOptions::new().append(true).open(&p).unwrap();
        std::io::Write::write_all(&mut f, LINEA.as_bytes()).unwrap();
        drop(f);
        assert_eq!(contar(&p).unwrap(), 2);
        assert_eq!(contar(&p).unwrap(), 2, "sin crecer, las mismas");
        // Reescrito más corto: se cuenta entero otra vez.
        std::fs::write(&p, "{}\n").unwrap();
        assert_eq!(contar(&p).unwrap(), 0);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
