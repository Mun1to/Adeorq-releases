//! A la papelera, las conversaciones de las terminales que abrió un agente.
//!
//! Munir, 2026-11-08, con la barra llena de delegadas de la segunda cuenta y de
//! «Archivadas»: «quiero que se eliminen y ya no se archiven, y estén las
//! sesiones supremas y ya está». Es lo que pidió el 2026-10-15 al decidir qué se
//! hace con ellas («se elimina por completo, para mantener un espacio limpio,
//! con su respectivo rastro»), y entonces se quedó en archivarlas.
//!
//! Solo las que abrió un agente y se cerraron con su rastro (`close_pane` o tu
//! X), y que nadie retomó después: ni las tuyas, ni el relevo, ni los rastros
//! escritos a mano, ni las fijadas o traídas, ni una abierta en un panel. Van a
//! la papelera de Windows, como con el botón de borrar de la barra, y su rastro
//! apunta que se tiró: sacarla de la papelera la devuelve a «Archivadas» y no se
//! vuelve a tirar. Lo que trabajó sigue contando en tu uso (`uso_historia`).

use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Lo que se espera desde el rastro antes de tocar nada: el rastro se escribe
/// antes de cerrar el panel, y el CLI tiene que haber muerto y soltado su
/// última línea.
pub const ASENTAR_MS: u64 = 3 * 60 * 1000;
/// Cuánto puede escribirse la conversación después de su rastro sin contar
/// como retomada.
pub const MARGEN_MS: u64 = 2 * 60 * 1000;
/// La línea que apunta en el rastro que su conversación ya se tiró.
pub const MARCA: &str = "- A la papelera:";

/// Si el rastro dice que la terminal la abrió un agente: `close_pane` sobre una
/// delegada («La abrió el panel N», «La abrió un agente sin panel») o tu X sobre
/// una («La abrió la sesión «…» y la cerró Munir con la X»). El relevo, los
/// escritos a mano al ordenar la barra y una tuya que cerró un agente («No la
/// abrió un agente») no.
pub fn es_de_agente(md: &str) -> bool {
    md.lines().any(|l| {
        l.starts_with("- La abrió el panel ")
            || l.starts_with("- La abrió un agente sin panel ")
            || (l.starts_with("- La abrió la sesión «") && l.contains("la cerró Munir con la X"))
    })
}

fn carpeta_del_rastro(md: &str) -> Option<&str> {
    md.lines().find_map(|l| l.strip_prefix("- Carpeta: `"))?.strip_suffix('`')
}

fn mtime_ms(p: &Path) -> Option<u64> {
    let t = std::fs::metadata(p).ok()?.modified().ok()?;
    Some(t.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as u64)
}

fn apuntar(rastro: &Path, ahora_ms: u64) -> std::io::Result<()> {
    let (dia, hora) = super::fecha_hora_utc(ahora_ms);
    let mut f = std::fs::OpenOptions::new().append(true).open(rastro)?;
    write!(
        f,
        "\n{MARCA} {dia} {hora} UTC. Su conversación se tiró a la papelera de Windows: sacándola de ahí vuelve a la barra, en «Archivadas».\n"
    )
}

/// Lo que dejó una vuelta.
#[derive(Debug, Default)]
pub struct Vuelta {
    /// Las conversaciones tiradas.
    pub tiradas: Vec<String>,
    /// Lo que no se pudo, para el registro.
    pub fallos: Vec<String>,
}

/// Una vuelta por los rastros de `dir`. `raices` son las carpetas de las
/// cuentas de Claude (`sessions::raices_claude`), `guardar` lo que no se toca
/// (abiertas en un panel, fijadas, traídas) y `tirar` la papelera; en las
/// pruebas, otra carpeta.
pub fn barrer(
    dir: &Path,
    raices: &[PathBuf],
    guardar: &HashSet<String>,
    ahora_ms: u64,
    tirar: impl Fn(&Path) -> Result<(), String>,
) -> Vuelta {
    let mut v = Vuelta::default();
    let Ok(entradas) = std::fs::read_dir(dir) else { return v };
    for e in entradas.flatten() {
        let rastro = e.path();
        if rastro.extension().and_then(|x| x.to_str()) != Some("md") {
            continue;
        }
        let Ok(md) = std::fs::read_to_string(&rastro) else { continue };
        if md.lines().any(|l| l.starts_with(MARCA)) || !es_de_agente(&md) {
            continue;
        }
        let (Some(sesion), Some(carpeta)) = (super::sesion_del_rastro(&md), carpeta_del_rastro(&md)) else { continue };
        if carpeta.is_empty() || guardar.contains(&sesion) || v.tiradas.contains(&sesion) {
            continue;
        }
        let Some(cuando) = mtime_ms(&rastro) else { continue };
        if ahora_ms < cuando + ASENTAR_MS {
            continue;
        }
        let en_claude = crate::sessions::encode_claude(carpeta);
        let nombre = format!("{sesion}.jsonl");
        let Some(jsonl) = raices.iter().map(|r| r.join("projects").join(&en_claude).join(&nombre)).find(|p| p.is_file()) else {
            continue;
        };
        // Retomada: alguien la siguió después de cerrarla, y ya es suya.
        if mtime_ms(&jsonl).is_none_or(|m| m > cuando + MARGEN_MS) {
            continue;
        }
        if let Err(err) = tirar(&jsonl) {
            v.fallos.push(format!("papelera: no pude tirar {}: {err}", jsonl.display()));
            continue;
        }
        // Lo que Claude Code guarda a su lado con el mismo nombre (subagentes,
        // salidas largas de herramientas).
        let lado = jsonl.with_extension("");
        if lado.is_dir() {
            if let Err(err) = tirar(&lado) {
                v.fallos.push(format!("papelera: no pude tirar {}: {err}", lado.display()));
            }
        }
        if let Err(err) = apuntar(&rastro, ahora_ms) {
            v.fallos.push(format!("papelera: no pude apuntarlo en {}: {err}", rastro.display()));
        }
        v.tiradas.push(sesion);
    }
    v
}

fn ahora_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

fn una_vuelta(app: &tauri::AppHandle) {
    let Ok(dir) = crate::dir_datos().map(|d| d.join("rastros")) else { return };
    // Si el estado de la barra no se deja leer no se sabe qué guardar.
    let Some(a_la_vista) = crate::manage::a_la_vista(app) else { return };
    let mut guardar: HashSet<String> = a_la_vista.into_iter().collect();
    guardar.extend(
        crate::pty::fichas(app)
            .iter()
            .filter_map(|f| f.command.as_deref().and_then(super::sesion_del_comando)),
    );
    let raices: Vec<PathBuf> = crate::sessions::raices_claude().into_iter().map(|(_, p)| p).collect();
    let v = barrer(&dir, &raices, &guardar, ahora_ms(), crate::manage::to_recycle_bin);
    if !v.tiradas.is_empty() {
        crate::anotar(&format!(
            "papelera: {} conversaciones de terminales que abrió un agente: {}",
            v.tiradas.len(),
            v.tiradas.join(", ")
        ));
    }
    for f in v.fallos {
        crate::anotar(&f);
    }
}

/// Cada dos minutos, en su hilo. En la ventana de desarrollo NO arranca: no ve
/// los paneles de la Adeorq de verdad y podría tirar una que está abierta allí.
/// Para probarlo ahí, `ADEORQ_PAPELERA=1`.
pub fn arrancar(app: tauri::AppHandle) {
    if cfg!(debug_assertions) && std::env::var_os("ADEORQ_PAPELERA").is_none() {
        return;
    }
    std::thread::spawn(move || {
        // Un respiro al arrancar, para que se restauren los paneles.
        std::thread::sleep(Duration::from_secs(60));
        loop {
            una_vuelta(&app);
            std::thread::sleep(Duration::from_secs(120));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rastros::{escribir, escribir_de_la_x, escribir_de_relevo, Rastro};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn poner_hora(p: &Path, ms: u64) {
        let f = std::fs::File::options().write(true).open(p).unwrap();
        f.set_modified(UNIX_EPOCH + Duration::from_millis(ms)).unwrap();
    }

    #[test]
    fn tira_solo_las_de_agente_cerradas_y_sin_retomar_y_una_vez() {
        let base = std::env::temp_dir().join(format!("adeorq-papelera-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let (rastros, papelera) = (base.join("rastros"), base.join("papelera"));
        let (cuenta1, cuenta2) = (base.join("claude"), base.join("claude-2da"));
        std::fs::create_dir_all(&papelera).unwrap();
        let carpeta = r"C:\proyectos\Demo";
        let ahora = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
        // Los rastros se escribieron hace diez minutos.
        let hace = ahora - 10 * 60 * 1000;

        let delegada = |nombre: &str, sesion: &str, delegada: bool| {
            let r = Rastro {
                nombre,
                carpeta,
                sesion: Some(sesion.into()),
                delegada,
                abierta_por: Some(3),
                cerrada_por: Some(3),
                texto: "Hizo su parte; está en BUZON.md y en su commit, y no queda nada.",
            };
            let p = escribir(&rastros, &r, hace).unwrap();
            poner_hora(&p, hace);
            p
        };
        let conversacion = |cuenta: &Path, sesion: &str, ms: u64| {
            let p = cuenta.join("projects").join("C--proyectos-Demo").join(format!("{sesion}.jsonl"));
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(&p, "{}\n").unwrap();
            poner_hora(&p, ms);
            p
        };

        let a = delegada("Demo · hecha", "aaaa0001", true);
        let a_jsonl = conversacion(&cuenta1, "aaaa0001", hace - 60_000);
        std::fs::create_dir_all(a_jsonl.with_extension("").join("subagents")).unwrap();
        delegada("Demo · retomada", "bbbb0002", true);
        let b = conversacion(&cuenta1, "bbbb0002", hace + 5 * 60 * 1000);
        delegada("Demo · tuya", "cccc0003", false);
        let c = conversacion(&cuenta1, "cccc0003", hace);
        let d_rastro = escribir_de_relevo(&rastros, "Demo · relevo", carpeta, "dddd0004", hace).unwrap();
        poner_hora(&d_rastro, hace);
        let d = conversacion(&cuenta1, "dddd0004", hace);
        delegada("Demo · fijada", "eeee0005", true);
        let e = conversacion(&cuenta1, "eeee0005", hace);
        let f_rastro = delegada("Demo · recién cerrada", "ffff0006", true);
        poner_hora(&f_rastro, ahora - 60_000);
        let f = conversacion(&cuenta1, "ffff0006", ahora - 90_000);
        // La X de Munir, sobre una de la segunda cuenta.
        let g_rastro = escribir_de_la_x(&rastros, "Demo · con la X", carpeta, "aaaa0007", "Demo General", hace).unwrap();
        poner_hora(&g_rastro, hace);
        let g = conversacion(&cuenta2, "aaaa0007", hace);
        // Una escrita a mano al ordenar la barra (2026-10-21) no es de agente.
        std::fs::write(
            rastros.join("a-mano.md"),
            "# Rastro de «Vieja»\n\n- Carpeta: `C:\\proyectos\\Demo`\n- Conversación: `aaaa0008` (se retoma)\n- La cerró la sesión 572c3eb8 al ordenar la barra, no su agente\n",
        )
        .unwrap();
        poner_hora(&rastros.join("a-mano.md"), hace);
        let h = conversacion(&cuenta1, "aaaa0008", hace);

        let guardar: HashSet<String> = ["eeee0005".to_string()].into();
        let raices = vec![cuenta1.clone(), cuenta2.clone()];
        let tirar = |p: &Path| std::fs::rename(p, papelera.join(p.file_name().unwrap())).map_err(|e| e.to_string());
        let mut v = barrer(&rastros, &raices, &guardar, ahora, tirar);
        v.tiradas.sort();
        assert_eq!(v.tiradas, vec!["aaaa0001", "aaaa0007"], "{:?}", v.fallos);
        assert!(v.fallos.is_empty(), "{:?}", v.fallos);
        assert!(!a_jsonl.exists() && !a_jsonl.with_extension("").exists());
        assert!(papelera.join("aaaa0001.jsonl").is_file() && papelera.join("aaaa0001").join("subagents").is_dir());
        assert!(!g.exists() && papelera.join("aaaa0007.jsonl").is_file());
        for (p, por) in [(&b, "retomada"), (&c, "tuya"), (&d, "relevo"), (&e, "fijada"), (&f, "recién cerrada"), (&h, "a mano")] {
            assert!(p.is_file(), "la {por} no se toca");
        }
        let md = std::fs::read_to_string(&a).unwrap();
        assert!(md.lines().any(|l| l.starts_with(MARCA)), "{md}");

        // Sacada de la papelera no se vuelve a tirar.
        std::fs::rename(papelera.join("aaaa0001.jsonl"), &a_jsonl).unwrap();
        let otra = barrer(&rastros, &raices, &guardar, ahora + 3_600_000, |p: &Path| {
            std::fs::rename(p, papelera.join(p.file_name().unwrap())).map_err(|e| e.to_string())
        });
        assert_eq!(otra.tiradas, vec!["ffff0006"], "solo la que ya asentó: {:?}", otra.tiradas);
        assert!(a_jsonl.is_file());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn lee_la_carpeta_del_rastro() {
        assert_eq!(carpeta_del_rastro("x\n- Carpeta: `C:\\proyectos\\Adeorq`\n"), Some(r"C:\proyectos\Adeorq"));
        assert_eq!(carpeta_del_rastro("- Carpeta: ``\n"), Some(""));
        assert_eq!(carpeta_del_rastro("nada"), None);
    }
}
