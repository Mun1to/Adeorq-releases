// Los mods: lo que el usuario pone encima de la app, en SU carpeta.
//
// Decisión de Munir del 2026-10-12 («A2, B1, C1, D1, E1», ver
// `docs/contexto/mods.md`): un usuario que quiere los iconos redondos no abre
// una issue y espera una versión; se lo pide a su agente, el cambio se guarda
// en `mods\<id>\` dentro de la carpeta de datos y una actualización no lo pisa,
// porque el instalador solo escribe sus propios archivos.
//
// Aquí vive lo único que Rust hace con un mod: LEERLO y decidir si se deja
// pasar. Aplicarlo es de la ventana (`src/lib/mods.ts`).
//
// ── POR QUÉ SOLO ESTILO ─────────────────────────────────────────────────────
//
// Lo que corre dentro de la ventana alcanza todos los comandos de la app,
// también los que escriben en una terminal. Un agente entra hoy por el MCP con
// su escalón (`mcp_clientes.rs`) y de fábrica no puede teclear en una terminal
// ajena; si pudiera dejar código en esta carpeta y se cargara solo, se saltaría
// esa puerta. Por eso lo que no declara `"tipo": "estilo"` se rechaza aquí, en
// el lado que el agente no reescribe, y no en la ventana.
//
// ── Y POR QUÉ UNA HOJA TAMPOCO PASA SIN MIRAR ───────────────────────────────
//
// Una hoja de estilo no ejecuta nada, pero sí puede pedir cosas a la red: la
// app va con `csp: null`, así que un `url(https://…)` es una petición a fuera,
// y un selector de atributo puede elegir CUÁNDO hacerla. Un mod no habla con
// la red: fuera `@import`, fuera `image-set(` (que admite direcciones sin
// `url`), fuera cualquier `url(` que no sea `data:`, y fuera la barra
// invertida, porque en CSS `\75rl(` es `url(` y un filtro de texto no lo ve.
// El filtro mira el texto tal cual, comentarios incluidos: quitarlos antes
// obligaría a entender las cadenas igual que el navegador, y un `"/*"` dentro
// de una cadena escondería lo que viene detrás.

use serde::{Deserialize, Serialize};
use std::path::Path;

/// Más de esto no es un usuario con sus gustos, es algo llenando la carpeta.
const MAX_MODS: usize = 64;
const MAX_MANIFIESTO: u64 = 16 * 1024;
const MAX_HOJA: u64 = 256 * 1024;

/// Lo que dice `mod.json`. Todo opcional al leer, para poder decir QUÉ falta
/// en vez de un error de formato que no le sirve a nadie.
#[derive(Debug, Default, Deserialize)]
struct Manifiesto {
    id: Option<String>,
    nombre: Option<String>,
    pedido: Option<String>,
    hecho_para: Option<String>,
    tipo: Option<String>,
    toca: Option<Vec<String>>,
}

/// Un mod tal como le llega a la ventana.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mod {
    /// El nombre de su carpeta, que es quien manda.
    pub id: String,
    pub nombre: String,
    /// La frase con que se pidió. Es lo que deja rehacerlo tras una actualización.
    pub pedido: String,
    /// La versión de Adeorq para la que se escribió.
    pub hecho_para: String,
    /// A qué se agarra: las variables que cambia.
    pub toca: Vec<String>,
    /// Su hoja de estilo, o vacía si no pasó.
    pub hoja: String,
    /// Por qué no se aplica, en cristiano. `None` si pasó.
    pub fallo: Option<String>,
}

/// Minúsculas, números y guiones, empezando por letra o número: lo que vale
/// igual como nombre de carpeta en Windows, en Linux y en un selector.
fn id_valido(s: &str) -> bool {
    let largo = s.len();
    (1..=40).contains(&largo)
        && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        && s.as_bytes()[0] != b'-'
}

/// Lo que una hoja no puede llevar, o `Ok` si no lleva nada de eso.
fn hoja_limpia(css: &str) -> Result<(), String> {
    if css.contains('\\') {
        return Err("la hoja lleva una barra invertida: escribe el carácter tal cual, sin escapes".into());
    }
    let baja = css.to_ascii_lowercase();
    if baja.contains("@import") {
        return Err("la hoja lleva un @import: un mod no trae hojas de fuera".into());
    }
    if baja.contains("image-set(") {
        return Err("la hoja lleva un image-set(): un mod no pide nada a la red".into());
    }
    let mut resto = baja.as_str();
    while let Some(i) = resto.find("url(") {
        let dentro = resto[i + 4..].trim_start_matches([' ', '\t', '\r', '\n', '"', '\'']);
        if !dentro.starts_with("data:") {
            return Err("la hoja lleva un url() que no es data: un mod no pide nada a la red".into());
        }
        resto = &resto[i + 4..];
    }
    Ok(())
}

/// Un archivo de la carpeta del mod, con techo y sin seguir enlaces: un enlace
/// ahí dentro sacaría la lectura de la carpeta del usuario.
fn leer_con_techo(ruta: &Path, techo: u64) -> Result<Option<String>, String> {
    let meta = match std::fs::symlink_metadata(ruta) {
        Ok(m) => m,
        Err(_) => return Ok(None),
    };
    let nombre = ruta.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    if !meta.is_file() {
        return Err(format!("{nombre} no es un archivo normal"));
    }
    if meta.len() > techo {
        return Err(format!("{nombre} pesa más de {} KB", techo / 1024));
    }
    std::fs::read_to_string(ruta).map(Some).map_err(|e| format!("{nombre}: {e}"))
}

/// Un mod, leído de su carpeta. Nunca falla: lo que no vale vuelve con su
/// `fallo` puesto y la hoja vacía, para que la ventana pueda decir por qué.
fn leer_uno(carpeta: &Path, id: &str) -> Mod {
    let mut m = Mod {
        id: id.to_string(),
        nombre: id.to_string(),
        pedido: String::new(),
        hecho_para: String::new(),
        toca: Vec::new(),
        hoja: String::new(),
        fallo: None,
    };
    let manifiesto = match leer_con_techo(&carpeta.join("mod.json"), MAX_MANIFIESTO) {
        Ok(Some(t)) => t,
        Ok(None) => {
            m.fallo = Some("falta mod.json".into());
            return m;
        }
        Err(e) => {
            m.fallo = Some(e);
            return m;
        }
    };
    // Un BOM delante es lo que deja PowerShell al escribir un JSON; no es motivo
    // para rechazar el mod de nadie.
    let datos: Manifiesto = match serde_json::from_str(manifiesto.trim_start_matches('\u{feff}')) {
        Ok(d) => d,
        Err(e) => {
            m.fallo = Some(format!("mod.json no se entiende: {e}"));
            return m;
        }
    };
    if let Some(n) = datos.nombre.filter(|n| !n.trim().is_empty()) {
        m.nombre = n;
    }
    m.pedido = datos.pedido.unwrap_or_default();
    m.hecho_para = datos.hecho_para.unwrap_or_default();
    m.toca = datos.toca.unwrap_or_default();
    if datos.id.as_deref().is_some_and(|i| i != id) {
        m.fallo = Some(format!("mod.json dice otro id que el de su carpeta ({id})"));
        return m;
    }
    match datos.tipo.as_deref() {
        Some("estilo") => {}
        Some(otro) => {
            m.fallo = Some(format!("el tipo «{otro}» no se carga: de momento solo «estilo»"));
            return m;
        }
        None => {
            m.fallo = Some("mod.json no dice su tipo".into());
            return m;
        }
    }
    match leer_con_techo(&carpeta.join("estilo.css"), MAX_HOJA) {
        Ok(Some(css)) => match hoja_limpia(&css) {
            Ok(()) => m.hoja = css,
            Err(e) => m.fallo = Some(e),
        },
        Ok(None) => m.fallo = Some("falta estilo.css".into()),
        Err(e) => m.fallo = Some(e),
    }
    m
}

/// Todos los mods de una carpeta, por orden de nombre: el orden es la cascada,
/// así que tiene que ser el mismo en cada arranque.
pub fn leer_de(carpeta: &Path) -> Vec<Mod> {
    let Ok(entradas) = std::fs::read_dir(carpeta) else {
        return Vec::new();
    };
    let mut ids: Vec<String> = entradas
        .flatten()
        .filter(|e| std::fs::symlink_metadata(e.path()).map(|m| m.is_dir()).unwrap_or(false))
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| id_valido(n))
        .collect();
    ids.sort();
    ids.truncate(MAX_MODS);
    ids.iter().map(|id| leer_uno(&carpeta.join(id), id)).collect()
}

/// Los mods del usuario. Sin carpeta de mods no hay ninguno, y no es un error.
#[tauri::command(async)]
pub fn mods_leer() -> Vec<Mod> {
    match crate::dir_datos() {
        Ok(d) => leer_de(&d.join("mods")),
        Err(_) => Vec::new(),
    }
}

/// La carpeta de los mods, ya creada: la que abre Ajustes y donde escribe un agente.
fn carpeta_creada() -> Result<std::path::PathBuf, String> {
    let d = crate::dir_datos()?.join("mods");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

#[tauri::command(async)]
pub fn mods_carpeta() -> Result<String, String> {
    carpeta_creada().map(|d| d.to_string_lossy().into_owned())
}

/// El nombre de la guía. Un archivo suelto en la carpeta, que `leer_de` no
/// mira porque solo entra en carpetas.
const GUIA: &str = "LEEME.md";
const MAX_GUIA: usize = 64 * 1024;

/// Deja escrita la guía en una carpeta y devuelve su ruta. Si ya dice lo
/// mismo no la toca: se llama en cada arranque y no hay por qué moverle la fecha.
fn escribir_guia_en(carpeta: &Path, texto: &str) -> Result<String, String> {
    if texto.len() > MAX_GUIA {
        return Err("la guía pesa demasiado".into());
    }
    let ruta = carpeta.join(GUIA);
    if std::fs::read_to_string(&ruta).ok().as_deref() != Some(texto) {
        std::fs::write(&ruta, texto).map_err(|e| e.to_string())?;
    }
    Ok(ruta.to_string_lossy().into_owned())
}

/// La guía para quien escribe un mod, que es un agente: qué es un mod, dónde
/// va y a qué se puede agarrar EN ESTA VERSIÓN. La redacta la ventana, que es
/// quien tiene la lista de piezas, y vive al lado de los mods para que la lea
/// un agente de cualquier proveedor sin más herramienta que abrir un archivo.
#[tauri::command(async)]
pub fn mods_escribir_guia(texto: String) -> Result<String, String> {
    escribir_guia_en(&carpeta_creada()?, &texto)
}

/// Lo que se le cuenta a un agente que pregunta por los mods (`get_mods`, en el
/// MCP).
///
/// Un agente al que le piden «los iconos redondos» no sabe que esto existe, y
/// sin saberlo cambiaría el código de la app, que la siguiente actualización
/// pisa. La guía entera la redacta la ventana (`guiaDeMods`, con las piezas de
/// ESTA versión) y solo se escribe desde que se encienden los mods: aquí va si
/// está y, si no, lo justo para empezar y cómo conseguirla. Solo lee: preguntar
/// no deja una carpeta en casa de nadie.
pub fn parte_para_agente(carpeta: &Path, version: &str) -> String {
    let mut t = format!(
        "# Los mods de Adeorq\n\n\
         Un mod es como una persona cambia cómo se ve SU Adeorq sin perderlo en la siguiente \
         actualización: una carpeta suya con un `mod.json` y un `estilo.css`, que Adeorq pone \
         encima de su propia hoja. Para eso NO cambies los archivos de Adeorq: la actualización \
         los pisa. Solo hay mods de estilo (CSS), sin código.\n\n\
         Carpeta de los mods: {}\n",
        carpeta.display()
    );
    let ruta = carpeta.join(GUIA);
    let guia = std::fs::read_to_string(&ruta).ok().filter(|g| !g.trim().is_empty());
    match &guia {
        Some(g) if g.contains(&format!("Adeorq {version} ")) => {
            t.push_str(&format!("La guía de esta versión está en {}. Va entera al final: léela antes de escribir nada.\n", ruta.display()));
        }
        Some(_) => t.push_str(&format!(
            "La guía de {} la escribió otra versión de Adeorq (esta es la {version}) y puede nombrar piezas que ya no existen; \
             se rehace sola cuando la persona abre Adeorq con los mods encendidos. Va entera al final.\n",
            ruta.display()
        )),
        None => t.push_str(&format!(
            "Todavía no hay guía: Adeorq la escribe en {} cuando la persona enciende los mods. Lo básico mientras tanto: \
             cada mod es una carpeta `<id>` (minúsculas, números y guiones) con un `mod.json` \
             (`id`, `pedido` con la frase de la persona tal cual, `hecho_para`: \"{version}\", `tipo`: \"estilo\" y `toca` \
             con las variables que cambias) y un `estilo.css`. Una hoja con `@import`, con un `url()` que no sea `data:` \
             o con una barra invertida no se carga. Las piezas que Adeorq mantiene estables (como `--r-icono`) vienen \
             en la guía: pídele que encienda los mods y léela antes de escribir nada.\n",
            ruta.display()
        )),
    }
    t.push_str(
        "Vienen apagados de fábrica y la persona los enciende en Ajustes > Mods > «Encendidos»: si no ve tu cambio, \
         que mire ahí. Con los mods encendidos y Adeorq abierta, uno nuevo se aplica solo en unos segundos.\n",
    );

    let mods = leer_de(carpeta);
    if mods.is_empty() {
        t.push_str("\nAhora no hay ningún mod.\n");
    } else {
        t.push_str(&format!("\nLos que hay ahora ({}):\n", mods.len()));
        for m in &mods {
            match &m.fallo {
                None => t.push_str(&format!("- {}: «{}» (hecho para {})\n", m.id, m.pedido, m.hecho_para)),
                Some(f) => t.push_str(&format!("- {}: NO SE CARGA ({f}). Su pedido: «{}»\n", m.id, m.pedido)),
            }
        }
        t.push_str("Otro cambio es otro mod. Si te piden rehacer uno, conserva su `pedido`.\n");
    }
    if let Some(g) = guia {
        t.push_str("\n---\n\n");
        t.push_str(&g);
    }
    t
}

/// Quita un mod de una carpeta con lo que se le diga que es «tirar». El id
/// tiene que ser un nombre llano: es lo que impide salir de la carpeta.
fn quitar_de(carpeta: &Path, id: &str, tirar: impl Fn(&Path) -> Result<(), String>) -> Result<(), String> {
    if !id_valido(id) {
        return Err("ese no es el nombre de un mod".into());
    }
    let ruta = carpeta.join(id);
    match std::fs::symlink_metadata(&ruta) {
        Ok(m) if m.is_dir() => tirar(&ruta),
        _ => Err("Ya no está.".into()),
    }
}

/// A la papelera del sistema, como todo lo que borra Adeorq: se puede deshacer.
#[tauri::command(async)]
pub fn mods_quitar(id: String) -> Result<(), String> {
    quitar_de(&carpeta_creada()?, &id, crate::manage::to_recycle_bin)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    /// Una carpeta de mods de usar y tirar, con los mods que se le pidan.
    fn casa(nombre: &str, mods: &[(&str, &str, Option<&str>)]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("adeorq-mods-{}-{nombre}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        for (id, manifiesto, hoja) in mods {
            let c = dir.join(id);
            std::fs::create_dir_all(&c).unwrap();
            std::fs::write(c.join("mod.json"), manifiesto).unwrap();
            if let Some(h) = hoja {
                std::fs::write(c.join("estilo.css"), h).unwrap();
            }
        }
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    const BUENO: &str = r#"{"id":"iconos-redondos","pedido":"quiero los iconos redondos","hecho_para":"0.9.192","tipo":"estilo","toca":["--r-icono"]}"#;

    #[test]
    fn un_mod_de_estilo_se_lee_entero() {
        let dir = casa("bueno", &[("iconos-redondos", BUENO, Some(":root { --r-icono: 999px; }"))]);
        let mods = leer_de(&dir);
        assert_eq!(mods.len(), 1);
        let m = &mods[0];
        assert_eq!(m.id, "iconos-redondos");
        assert_eq!(m.pedido, "quiero los iconos redondos");
        assert_eq!(m.hecho_para, "0.9.192");
        assert_eq!(m.toca, vec!["--r-icono"]);
        assert_eq!(m.hoja, ":root { --r-icono: 999px; }");
        assert_eq!(m.fallo, None);
        let _ = std::fs::remove_dir_all(dir);
    }

    /// La ventana lee estos nombres tal cual (`Mod` en `src/lib/mods.ts`): si
    /// uno cambia aquí, allí llega `undefined` y no falla nada a la vista.
    #[test]
    fn a_la_ventana_le_llegan_los_nombres_que_espera() {
        let dir = casa("nombres", &[("iconos-redondos", BUENO, Some(":root { --r-icono: 999px; }"))]);
        let json = serde_json::to_value(&leer_de(&dir)[0]).unwrap();
        let mut claves: Vec<&str> = json.as_object().unwrap().keys().map(String::as_str).collect();
        claves.sort_unstable();
        assert_eq!(claves, ["fallo", "hechoPara", "hoja", "id", "nombre", "pedido", "toca"]);
        assert!(json["fallo"].is_null());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn sin_carpeta_no_hay_mods_y_no_es_un_error() {
        let dir = std::env::temp_dir().join(format!("adeorq-mods-{}-no-existe", std::process::id()));
        assert!(leer_de(&dir).is_empty());
    }

    #[test]
    fn lo_que_no_es_estilo_no_se_carga() {
        let codigo = r#"{"tipo":"codigo","pedido":"un botón nuevo"}"#;
        let dir = casa("codigo", &[("con-codigo", codigo, Some("a { color: red; }")), ("sin-tipo", "{}", Some("a {}"))]);
        let mods = leer_de(&dir);
        assert_eq!(mods.len(), 2);
        assert!(mods[0].fallo.as_deref().unwrap().contains("codigo"));
        assert!(mods[0].hoja.is_empty(), "la hoja de un mod rechazado no viaja a la ventana");
        assert!(mods[1].fallo.as_deref().unwrap().contains("tipo"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn una_hoja_no_habla_con_la_red() {
        for (caso, hoja) in [
            ("importa", "@import url(https://ejemplo.com/a.css);"),
            ("importa en mayúsculas", "@IMPORT 'https://ejemplo.com/a.css';"),
            ("pide una imagen", ".pane { background: url(https://ejemplo.com/x.png); }"),
            ("la pide con comillas", ".pane { background: URL( \"//ejemplo.com/x.png\" ); }"),
            ("la pide sin url", ".pane { background: image-set('https://ejemplo.com/x.png' 1x); }"),
            ("la esconde con un escape", ".pane { background: \\75rl(https://ejemplo.com/x.png); }"),
            ("una buena y una mala", ".a { background: url(data:image/png;base64,AAAA); } .b { background: url(http://ejemplo.com); }"),
        ] {
            assert!(hoja_limpia(hoja).is_err(), "tenía que rechazar: {caso}");
        }
        for (caso, hoja) in [
            ("solo variables", ":root { --r-icono: 999px; --accent: #ff0000; }"),
            ("una imagen metida dentro", ".pane { background: url(data:image/png;base64,AAAA); }"),
            ("con comillas y espacios", ".pane { background: url( 'data:image/svg+xml,<svg/>' ); }"),
        ] {
            assert_eq!(hoja_limpia(hoja), Ok(()), "tenía que pasar: {caso}");
        }
    }

    #[test]
    fn la_carpeta_manda_sobre_lo_que_diga_el_manifiesto() {
        let dir = casa("id", &[("uno", r#"{"id":"otro","tipo":"estilo"}"#, Some("a {}"))]);
        let mods = leer_de(&dir);
        assert_eq!(mods[0].id, "uno");
        assert!(mods[0].fallo.as_deref().unwrap().contains("otro id"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn solo_carpetas_con_nombre_llano_y_siempre_en_el_mismo_orden() {
        let estilo = r#"{"tipo":"estilo"}"#;
        let dir = casa("orden", &[("zeta", estilo, Some("a {}")), ("alfa", estilo, Some("a {}")), ("Con Espacios", estilo, Some("a {}"))]);
        std::fs::write(dir.join("suelto.css"), "a {}").unwrap();
        let ids: Vec<String> = leer_de(&dir).into_iter().map(|m| m.id).collect();
        assert_eq!(ids, vec!["alfa", "zeta"]);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn un_archivo_que_falta_o_que_pesa_de_mas_se_dice() {
        let estilo = r#"{"tipo":"estilo"}"#;
        let gorda = "a{}".repeat((MAX_HOJA as usize / 3) + 10);
        let dir = casa("faltas", &[("sin-hoja", estilo, None), ("gorda", estilo, Some(&gorda)), ("roto", "{ esto no es json", Some("a {}"))]);
        std::fs::create_dir_all(dir.join("vacio")).unwrap();
        let mods = leer_de(&dir);
        let fallo = |id: &str| mods.iter().find(|m| m.id == id).unwrap().fallo.clone().unwrap();
        assert!(fallo("sin-hoja").contains("falta estilo.css"));
        assert!(fallo("gorda").contains("pesa más"));
        assert!(fallo("roto").contains("no se entiende"));
        assert!(fallo("vacio").contains("falta mod.json"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn quitar_solo_alcanza_a_una_carpeta_de_mod() {
        let estilo = r#"{"tipo":"estilo"}"#;
        let dir = casa("quitar", &[("uno", estilo, Some("a {}")), ("dos", estilo, Some("a {}"))]);
        std::fs::write(dir.join("LEEME.md"), "guía").unwrap();
        let tirados = std::cell::RefCell::new(Vec::new());
        let tirar = |r: &Path| {
            tirados.borrow_mut().push(r.to_path_buf());
            std::fs::remove_dir_all(r).map_err(|e| e.to_string())
        };
        for malo in ["", "..", "../uno", "uno/..", "Uno", "uno dos", "c:uno", "LEEME.md", "-uno"] {
            assert!(quitar_de(&dir, malo, tirar).is_err(), "tenía que negarse: «{malo}»");
        }
        assert!(quitar_de(&dir, "leeme", tirar).is_err(), "un archivo no es un mod, y lo que no está tampoco");
        assert!(tirados.borrow().is_empty(), "nada de lo anterior tira nada");
        assert_eq!(quitar_de(&dir, "uno", tirar), Ok(()));
        assert_eq!(*tirados.borrow(), vec![dir.join("uno")]);
        let ids: Vec<String> = leer_de(&dir).into_iter().map(|m| m.id).collect();
        assert_eq!(ids, vec!["dos"]);
        assert!(dir.join("LEEME.md").exists());
        assert_eq!(quitar_de(&dir, "uno", tirar), Err("Ya no está.".into()));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn la_guia_vive_al_lado_de_los_mods_y_no_cuenta_como_uno() {
        let dir = casa("guia", &[("uno", r#"{"tipo":"estilo"}"#, Some("a {}"))]);
        let ruta = escribir_guia_en(&dir, "# Cómo se escribe un mod").unwrap();
        assert!(ruta.ends_with("LEEME.md"));
        assert_eq!(std::fs::read_to_string(&ruta).unwrap(), "# Cómo se escribe un mod");
        assert_eq!(leer_de(&dir).len(), 1);
        // Con el mismo texto no se reescribe: la fecha del archivo no se mueve.
        let antes = std::fs::metadata(&ruta).unwrap().modified().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(30));
        escribir_guia_en(&dir, "# Cómo se escribe un mod").unwrap();
        assert_eq!(std::fs::metadata(&ruta).unwrap().modified().unwrap(), antes);
        assert!(escribir_guia_en(&dir, &"a".repeat(MAX_GUIA + 1)).is_err());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn un_json_con_bom_se_lee_igual() {
        let con_bom = format!("\u{feff}{BUENO}");
        let dir = casa("bom", &[("iconos-redondos", &con_bom, Some(":root { --r-icono: 999px; }"))]);
        assert_eq!(leer_de(&dir)[0].fallo, None);
        let _ = std::fs::remove_dir_all(dir);
    }

    /// Lo que lee un agente por `get_mods`: dónde van, la guía si la hay y de
    /// qué versión es, y los mods que ya hay, también el que no se carga.
    #[test]
    fn un_agente_sabe_de_los_mods_sin_que_nadie_le_de_la_guia() {
        let nada = std::env::temp_dir().join(format!("adeorq-mods-{}-no-existe", std::process::id()));
        let t = parte_para_agente(&nada, "0.9.196");
        assert!(t.contains(&nada.display().to_string()), "dice dónde van");
        assert!(t.contains("Todavía no hay guía") && t.contains("Ajustes > Mods") && t.contains("\"0.9.196\""));
        assert!(t.contains("no hay ningún mod"));
        assert!(!nada.exists(), "preguntar no crea la carpeta");

        let dir = casa("parte", &[("iconos-redondos", BUENO, Some(":root { --r-icono: 999px; }")), ("con-red", r#"{"pedido":"un fondo","tipo":"estilo"}"#, Some("a { background: url(https://x.y/z.png) }"))]);
        escribir_guia_en(&dir, "Esta guía la escribe Adeorq 0.9.196 y la rehace en cada versión.").unwrap();
        let t = parte_para_agente(&dir, "0.9.196");
        assert!(t.contains("La guía de esta versión") && t.ends_with("la rehace en cada versión."), "la guía va entera al final");
        assert!(t.contains("- iconos-redondos: «quiero los iconos redondos» (hecho para 0.9.192)"));
        assert!(t.contains("- con-red: NO SE CARGA ("), "el que no pasa se dice: {t}");
        assert!(parte_para_agente(&dir, "0.9.197").contains("la escribió otra versión"), "una guía de otra versión se avisa");
        let _ = std::fs::remove_dir_all(dir);
    }
}
