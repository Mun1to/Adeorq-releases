// El único sitio de Adeorq que escribe en el código de TU proyecto.
//
// ── DE DÓNDE VIENE LO QUE LLEGA AQUÍ ────────────────────────────────────────
//
// El panel de web enseña tu localhost. Dentro de esa página corre la sonda
// (`vite-plugin-adeorq/sonda.js`), que es quien sabe qué has seleccionado y
// qué has arrastrado. La sonda NO escribe: cambia el estilo en vivo para que
// lo veas al momento y le manda a Adeorq el cambio ya cocinado. Esto es la
// otra punta de ese viaje.
//
// Que haya un solo escritor es a propósito. Repartir la escritura entre el
// front y aquí acabaría con dos maneras distintas de tocar un fichero y una
// sola de romperlo.
//
// ── QUÉ ES UN `loc` ─────────────────────────────────────────────────────────
//
// `src/App.jsx:47:71`. Ruta relativa a la raíz del proyecto y los dos números
// son el trozo EXACTO que ocupa la etiqueta de apertura en el fichero,
// contando caracteres. Los pone el plugin de Vite parseando el fuente, así que
// no hay que volver a parsear nada aquí: se corta por ahí y se vuelve a pegar.
//
// ── LAS TRES CERRADURAS ─────────────────────────────────────────────────────
//
//  1. El fichero tiene que caer DENTRO de la raíz que se pasa. Un `..` en el
//     camino no llega a abrirse.
//  2. El trozo cortado tiene que seguir siendo la etiqueta que dice ser. Si
//     has tocado el fichero mientras tanto, los números ya no valen y esto
//     falla en vez de escribir en mitad de otra cosa.
//  3. Cada propiedad pasa por una lista blanca con su forma. Un valor que no
//     encaja no se escribe: aquí se está metiendo texto en TU código fuente,
//     y lo que no se comprueba, se cuela.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/* ── El sitio del fichero ────────────────────────────────────────────────── */

struct Sitio {
    fichero: PathBuf,
    inicio: usize,
    fin: usize,
    jsx: bool,
}

fn parsear_loc(raiz: &str, loc: &str) -> Result<Sitio, String> {
    let (ruta, resto) = loc
        .rsplit_once(':')
        .and_then(|(a, fin)| a.rsplit_once(':').map(|(r, ini)| (r, (ini, fin))))
        .ok_or("la marca del elemento no tiene la forma «fichero:inicio:fin»")?;
    let inicio: usize = resto
        .0
        .parse()
        .map_err(|_| "la marca del elemento trae un número que no lo es".to_string())?;
    let fin: usize = resto
        .1
        .parse()
        .map_err(|_| "la marca del elemento trae un número que no lo es".to_string())?;
    if fin <= inicio {
        return Err("la marca del elemento está del revés".into());
    }

    let base = std::fs::canonicalize(raiz)
        .map_err(|e| format!("no se pudo abrir la carpeta del proyecto: {e}"))?;
    let destino = base.join(ruta);
    let destino = std::fs::canonicalize(&destino)
        .map_err(|_| format!("«{ruta}» no existe dentro del proyecto"))?;
    if !destino.starts_with(&base) {
        return Err(format!("«{ruta}» se sale de la carpeta del proyecto"));
    }

    // Solo ficheros donde vive una interfaz. La raíz la anuncia la página, así
    // que sin esto una web de localhost cualquiera podría señalar a cualquier
    // fichero del disco; acotando la extensión, apuntar fuera deja de servir
    // para nada.
    let extension = destino
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(
        extension.as_str(),
        "jsx" | "tsx" | "js" | "ts" | "html" | "htm" | "vue" | "svelte" | "astro"
    ) {
        return Err(format!(
            "Adeorq no escribe en ficheros «.{extension}», solo donde vive la interfaz"
        ));
    }
    let jsx = matches!(extension.as_str(), "jsx" | "tsx" | "js" | "ts");
    Ok(Sitio {
        fichero: destino,
        inicio,
        fin,
        jsx,
    })
}

/// Corta el trozo y comprueba que sigue siendo una etiqueta de apertura.
fn etiqueta_de(texto: &str, sitio: &Sitio) -> Result<String, String> {
    if sitio.fin > texto.len() {
        return Err("el fichero ha cambiado desde que se abrió la página; recárgala".into());
    }
    // Se corta por BYTES: los números vienen de contar caracteres en el
    // JavaScript del plugin, y coinciden mientras el fichero sea ASCII en esa
    // zona. Si no lo fuera, `get` devuelve None en vez de partir un carácter.
    let trozo = texto
        .get(sitio.inicio..sitio.fin)
        .ok_or("el fichero ha cambiado desde que se abrió la página; recárgala")?;
    if !trozo.starts_with('<') || !trozo.ends_with('>') {
        return Err("el fichero ha cambiado desde que se abrió la página; recárgala".into());
    }
    Ok(trozo.to_string())
}

/* ── La lista blanca ─────────────────────────────────────────────────────── */

/// Qué forma puede tener el valor de cada propiedad.
#[derive(Clone, Copy, PartialEq)]
enum Forma {
    /// `12px`, `50%`, `1.5rem`, `auto`, `0`.
    Medida,
    /// `#a1b2c3`, `rgb(1, 2, 3)`, `rgba(1, 2, 3, .5)`, `transparent`.
    Color,
    /// Un número pelado: `0.5`, `700`, `-1`.
    Numero,
    /// Un puñado de palabras sueltas y nada más.
    Palabra,
    /// `translate(1px, 2px)` y `rotate(9deg)`, encadenadas.
    Transformacion,
    /// `linear-gradient(...)` con colores y medidas dentro.
    Degradado,
    /// `0 2px 8px rgba(0,0,0,.2)`, y `none`.
    Sombra,
}

fn permitidas() -> BTreeMap<&'static str, Forma> {
    use Forma::*;
    BTreeMap::from([
        ("width", Medida),
        ("height", Medida),
        ("minWidth", Medida),
        ("minHeight", Medida),
        ("maxWidth", Medida),
        ("maxHeight", Medida),
        ("padding", Medida),
        ("paddingTop", Medida),
        ("paddingRight", Medida),
        ("paddingBottom", Medida),
        ("paddingLeft", Medida),
        ("margin", Medida),
        ("marginTop", Medida),
        ("marginRight", Medida),
        ("marginBottom", Medida),
        ("marginLeft", Medida),
        ("gap", Medida),
        ("borderRadius", Medida),
        ("fontSize", Medida),
        ("lineHeight", Medida),
        ("letterSpacing", Medida),
        ("color", Color),
        ("backgroundColor", Color),
        ("borderColor", Color),
        ("opacity", Numero),
        ("zIndex", Numero),
        ("fontWeight", Numero),
        ("textAlign", Palabra),
        ("fontStyle", Palabra),
        ("textDecoration", Palabra),
        ("display", Palabra),
        ("transform", Transformacion),
        ("backgroundImage", Degradado),
        ("boxShadow", Sombra),
    ])
}

const PALABRAS: &[&str] = &[
    "left", "right", "center", "justify", "normal", "italic", "underline", "none", "block",
    "inline", "inline-block", "flex", "inline-flex", "grid", "contents",
];

fn es_medida(v: &str) -> bool {
    let v = v.trim();
    if v == "auto" || v == "0" || v == "normal" || v == "none" {
        return true;
    }
    // Puede llevar hasta cuatro valores: `8px 12px`.
    v.split_whitespace().take(5).count() <= 4
        && v.split_whitespace().all(|t| {
            let (num, unidad) = t.split_at(
                t.find(|c: char| c.is_ascii_alphabetic() || c == '%')
                    .unwrap_or(t.len()),
            );
            !num.is_empty()
                && num.parse::<f64>().is_ok()
                && matches!(unidad, "px" | "%" | "rem" | "em" | "vh" | "vw" | "")
        })
}

fn es_color(v: &str) -> bool {
    let v = v.trim();
    if v == "transparent" || v == "currentColor" || v == "inherit" {
        return true;
    }
    if let Some(hex) = v.strip_prefix('#') {
        return matches!(hex.len(), 3 | 4 | 6 | 8) && hex.chars().all(|c| c.is_ascii_hexdigit());
    }
    for cabeza in ["rgb(", "rgba(", "hsl(", "hsla("] {
        if let Some(dentro) = v.strip_prefix(cabeza).and_then(|d| d.strip_suffix(')')) {
            return !dentro.is_empty()
                && dentro
                    .chars()
                    .all(|c| c.is_ascii_digit() || " ,.%/".contains(c));
        }
    }
    false
}

fn es_numero(v: &str) -> bool {
    v.trim().parse::<f64>().is_ok()
}

fn es_transformacion(v: &str) -> bool {
    let v = v.trim();
    if v.is_empty() || v == "none" {
        return true;
    }
    // Cada función tiene que ser una de las dos, con números dentro y nada más.
    let mut resto = v;
    while !resto.is_empty() {
        let resto2 = resto.trim_start();
        let Some(abre) = resto2.find('(') else { return false };
        let nombre = &resto2[..abre];
        if !matches!(nombre, "translate" | "translateX" | "translateY" | "rotate" | "scale") {
            return false;
        }
        let Some(cierra) = resto2.find(')') else { return false };
        let dentro = &resto2[abre + 1..cierra];
        if dentro.is_empty()
            || !dentro
                .chars()
                .all(|c| c.is_ascii_digit() || " ,.-pxdeg%".contains(c))
        {
            return false;
        }
        resto = &resto2[cierra + 1..];
    }
    true
}

fn es_degradado(v: &str) -> bool {
    let v = v.trim();
    if v.is_empty() || v == "none" {
        return true;
    }
    let Some(dentro) = v
        .strip_prefix("linear-gradient(")
        .or_else(|| v.strip_prefix("radial-gradient("))
        .and_then(|d| d.strip_suffix(')'))
    else {
        return false;
    };
    !dentro.is_empty()
        && dentro.chars().all(|c| {
            c.is_ascii_alphanumeric() || " ,.%#()-".contains(c)
        })
}

fn es_sombra(v: &str) -> bool {
    let v = v.trim();
    if v.is_empty() || v == "none" {
        return true;
    }
    v.len() < 200
        && v.chars()
            .all(|c| c.is_ascii_alphanumeric() || " ,.%#()-".contains(c))
}

fn valor_valido(propiedad: &str, valor: &str) -> bool {
    // Nada de comillas ni llaves: eso sale del literal y entra en tu código.
    if valor.contains('"') || valor.contains('\'') || valor.contains('\\') {
        return false;
    }
    if valor.contains('{') || valor.contains('}') || valor.contains(';') {
        return false;
    }
    if valor.contains('\n') || valor.len() > 200 {
        return false;
    }
    match permitidas().get(propiedad) {
        None => false,
        Some(Forma::Medida) => es_medida(valor),
        Some(Forma::Color) => es_color(valor),
        Some(Forma::Numero) => es_numero(valor),
        Some(Forma::Palabra) => PALABRAS.contains(&valor.trim()),
        Some(Forma::Transformacion) => es_transformacion(valor),
        Some(Forma::Degradado) => es_degradado(valor),
        Some(Forma::Sombra) => es_sombra(valor),
    }
}

/* ── Fusionar el estilo dentro de la etiqueta ────────────────────────────── */

/// Los pares que ya hay escritos en un `style={{ ... }}`.
///
/// Devuelve `None` si dentro hay algo que no sea `clave: "literal"`, y eso es
/// justo lo que salva el fichero: un `style={{ width: ancho }}` con una
/// variable dentro no se toca, se avisa. Reescribirlo a ciegas borraría código
/// que funciona.
fn pares_jsx(dentro: &str) -> Option<Vec<(String, String)>> {
    let dentro = dentro.trim();
    if dentro.is_empty() {
        return Some(Vec::new());
    }
    let mut pares = Vec::new();
    for trozo in partir_por_comas(dentro)? {
        let (clave, valor) = trozo.split_once(':')?;
        let clave = clave.trim().trim_matches('"').trim_matches('\'');
        if clave.is_empty() || !clave.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return None;
        }
        let valor = valor.trim();
        // Solo literales de texto. Un número pelado o una variable, no.
        let valor = valor
            .strip_prefix('"')
            .and_then(|v| v.strip_suffix('"'))
            .or_else(|| valor.strip_prefix('\'').and_then(|v| v.strip_suffix('\'')))?;
        if valor.contains('"') || valor.contains('\'') {
            return None;
        }
        pares.push((clave.to_string(), valor.to_string()));
    }
    Some(pares)
}

/// Parte por las comas de primer nivel. Sin esto, `rgba(0, 0, 0, .2)` se
/// rompería en cuatro pedazos y el estilo saldría destrozado.
fn partir_por_comas(texto: &str) -> Option<Vec<String>> {
    let mut fuera = Vec::new();
    let mut actual = String::new();
    let mut hondo = 0i32;
    let mut comilla: Option<char> = None;
    for c in texto.chars() {
        match c {
            '"' | '\'' => {
                comilla = match comilla {
                    Some(q) if q == c => None,
                    Some(q) => Some(q),
                    None => Some(c),
                };
                actual.push(c);
            }
            '(' | '[' | '{' if comilla.is_none() => {
                hondo += 1;
                actual.push(c);
            }
            ')' | ']' | '}' if comilla.is_none() => {
                hondo -= 1;
                if hondo < 0 {
                    return None;
                }
                actual.push(c);
            }
            ',' if comilla.is_none() && hondo == 0 => {
                if !actual.trim().is_empty() {
                    fuera.push(actual.trim().to_string());
                }
                actual.clear();
            }
            _ => actual.push(c),
        }
    }
    if comilla.is_some() || hondo != 0 {
        return None;
    }
    if !actual.trim().is_empty() {
        fuera.push(actual.trim().to_string());
    }
    Some(fuera)
}

fn pintar_jsx(pares: &[(String, String)]) -> String {
    let cuerpo = pares
        .iter()
        .map(|(k, v)| {
            let clave = if k.chars().all(|c| c.is_ascii_alphanumeric()) {
                k.clone()
            } else {
                format!("\"{k}\"")
            };
            format!("{clave}: \"{v}\"")
        })
        .collect::<Vec<_>>()
        .join(", ");
    format!("style={{{{ {cuerpo} }}}}")
}

/// Mete los cambios en la etiqueta y devuelve la etiqueta nueva.
fn fusionar(etiqueta: &str, cambios: &BTreeMap<String, String>, jsx: bool) -> Result<String, String> {
    let (abre, cierra) = if jsx {
        ("style={{", "}}")
    } else {
        ("style=\"", "\"")
    };

    let mut pares: Vec<(String, String)>;
    let (antes, despues) = match etiqueta.find(abre) {
        Some(i) => {
            let desde = i + abre.len();
            let hasta = etiqueta[desde..]
                .find(cierra)
                .map(|j| desde + j)
                .ok_or("el `style` de ese elemento está sin cerrar")?;
            let dentro = &etiqueta[desde..hasta];
            pares = if jsx {
                pares_jsx(dentro).ok_or(
                    "ese elemento tiene un `style` con código dentro, no solo valores. \
                     No se toca a mano para no romperlo.",
                )?
            } else {
                pares_css(dentro).ok_or("ese elemento tiene un `style` que no se pudo leer")?
            };
            (
                etiqueta[..i].trim_end().to_string(),
                etiqueta[hasta + cierra.len()..].to_string(),
            )
        }
        None => {
            // Sin `style`: se cuela justo después del nombre de la etiqueta.
            pares = Vec::new();
            let fin_nombre = etiqueta
                .find(|c: char| c.is_whitespace() || c == '>' || c == '/')
                .ok_or("esa etiqueta no se entiende")?;
            (
                etiqueta[..fin_nombre].to_string(),
                etiqueta[fin_nombre..].to_string(),
            )
        }
    };

    for (clave, valor) in cambios {
        // El vacío es «quítalo», no un valor: se deja pasar y lo barre el
        // `retain` de abajo. Comprobarlo aquí haría que borrar un color fuese
        // un error y borrar un ancho no, según lo estricta que sea cada forma.
        if !valor.trim().is_empty() && !valor_valido(clave, valor) {
            return Err(format!("«{clave}: {valor}» no es un valor que se pueda escribir"));
        }
        if valor.trim().is_empty() && !permitidas().contains_key(clave.as_str()) {
            return Err(format!("«{clave}» no es una propiedad que Adeorq escriba"));
        }
        let en_css = a_guiones(clave);
        let buscada = if jsx { clave.as_str() } else { en_css.as_str() };
        match pares.iter_mut().find(|(k, _)| k == buscada) {
            Some(p) => p.1 = valor.clone(),
            None => pares.push((buscada.to_string(), valor.clone())),
        }
    }
    // Un valor vacío es «quítalo», que es como se deshace un cambio.
    pares.retain(|(_, v)| !v.trim().is_empty());

    if pares.is_empty() {
        return Ok(format!("{antes}{despues}"));
    }
    let pintado = if jsx {
        pintar_jsx(&pares)
    } else {
        let cuerpo = pares
            .iter()
            .map(|(k, v)| format!("{k}: {v}"))
            .collect::<Vec<_>>()
            .join("; ");
        format!("style=\"{cuerpo}\"")
    };
    Ok(format!("{antes} {pintado}{despues}"))
}

fn pares_css(dentro: &str) -> Option<Vec<(String, String)>> {
    let mut pares = Vec::new();
    for trozo in dentro.split(';') {
        let trozo = trozo.trim();
        if trozo.is_empty() {
            continue;
        }
        let (k, v) = trozo.split_once(':')?;
        pares.push((k.trim().to_string(), v.trim().to_string()));
    }
    Some(pares)
}

fn a_guiones(camello: &str) -> String {
    let mut s = String::new();
    for c in camello.chars() {
        if c.is_ascii_uppercase() {
            s.push('-');
            s.push(c.to_ascii_lowercase());
        } else {
            s.push(c);
        }
    }
    s
}

/* ── Escribir ────────────────────────────────────────────────────────────── */

fn guardar(fichero: &Path, contenido: &str) -> Result<(), String> {
    // Al lado del destino y luego renombrar: si algo falla a mitad, el fichero
    // de verdad no se queda cortado. En Windows `rename` reemplaza.
    let temporal = fichero.with_extension("adeorq-tmp");
    std::fs::write(&temporal, contenido).map_err(|e| format!("no se pudo escribir: {e}"))?;
    std::fs::rename(&temporal, fichero).map_err(|e| {
        let _ = std::fs::remove_file(&temporal);
        format!("no se pudo guardar: {e}")
    })
}

/* ── Los comandos ────────────────────────────────────────────────────────── */

#[tauri::command]
pub async fn editor_escribir_estilo(
    raiz: String,
    loc: String,
    estilos: BTreeMap<String, String>,
) -> Result<String, String> {
    aplicar_estilo(&raiz, &loc, &estilos)
}

/// La misma faena, sin `async`, para poder probarla sin levantar la app.
fn aplicar_estilo(
    raiz: &str,
    loc: &str,
    estilos: &BTreeMap<String, String>,
) -> Result<String, String> {
    if estilos.is_empty() {
        return Err("no había ningún cambio que escribir".into());
    }
    let sitio = parsear_loc(raiz, loc)?;
    let texto = std::fs::read_to_string(&sitio.fichero)
        .map_err(|e| format!("no se pudo leer el fichero: {e}"))?;
    let etiqueta = etiqueta_de(&texto, &sitio)?;
    let nueva = fusionar(&etiqueta, estilos, sitio.jsx)?;
    if nueva == etiqueta {
        return Ok("no hacía falta cambiar nada".into());
    }
    let salida = format!(
        "{}{}{}",
        &texto[..sitio.inicio],
        nueva,
        &texto[sitio.fin..]
    );
    guardar(&sitio.fichero, &salida)?;
    Ok(nombre_corto(&sitio.fichero))
}

/// El texto de dentro de la etiqueta. Solo si el elemento tiene texto y nada
/// más: si dentro hay otras etiquetas, esto no es un texto que se pueda
/// cambiar entero sin llevarse algo por delante.
#[tauri::command]
pub async fn editor_escribir_texto(
    raiz: String,
    loc: String,
    valor: String,
    antes: String,
) -> Result<String, String> {
    if valor.contains('<') || valor.contains('>') || valor.contains('{') || valor.contains('}') {
        return Err("ese texto lleva signos que romperían el código; cámbialo a mano".into());
    }
    let sitio = parsear_loc(&raiz, &loc)?;
    let texto = std::fs::read_to_string(&sitio.fichero)
        .map_err(|e| format!("no se pudo leer el fichero: {e}"))?;
    let etiqueta = etiqueta_de(&texto, &sitio)?;
    if etiqueta.ends_with("/>") {
        return Err("ese elemento no tiene texto dentro".into());
    }

    let nombre: String = etiqueta[1..]
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    let cierre = format!("</{nombre}>");
    let desde = sitio.fin;
    let hasta = texto[desde..]
        .find(&cierre)
        .map(|i| desde + i)
        .ok_or("no se encontró el cierre de esa etiqueta")?;

    let dentro = &texto[desde..hasta];
    if dentro.contains('<') || dentro.contains('{') {
        return Err("ese elemento tiene más cosas dentro además del texto".into());
    }
    if dentro.trim() != antes.trim() {
        return Err("el texto del fichero ya no es el que había en pantalla; recarga la página".into());
    }

    // Se conservan los espacios y saltos que rodeaban al texto: en JSX la
    // sangría es parte de cómo está escrito el fichero, y aplastarla deja un
    // diff enorme por cambiar tres palabras.
    let izq: String = dentro.chars().take_while(|c| c.is_whitespace()).collect();
    let der: String = dentro
        .chars()
        .rev()
        .take_while(|c| c.is_whitespace())
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    let salida = format!(
        "{}{}{}{}{}",
        &texto[..desde],
        izq,
        valor.trim(),
        der,
        &texto[hasta..]
    );
    guardar(&sitio.fichero, &salida)?;
    Ok(nombre_corto(&sitio.fichero))
}

fn nombre_corto(p: &Path) -> String {
    p.file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| p.to_string_lossy().to_string())
}

/* ── Pruebas ─────────────────────────────────────────────────────────────── */

#[cfg(test)]
mod tests {
    use super::*;

    fn cambios(pares: &[(&str, &str)]) -> BTreeMap<String, String> {
        pares
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn le_pone_estilo_a_una_etiqueta_que_no_tenia() {
        let r = fusionar("<div className=\"caja\">", &cambios(&[("color", "#ff0000")]), true).unwrap();
        assert_eq!(r, "<div style={{ color: \"#ff0000\" }} className=\"caja\">");
    }

    #[test]
    fn cambia_lo_que_ya_estaba_y_conserva_lo_demas() {
        let r = fusionar(
            "<h1 style={{ fontSize: \"38px\", color: \"#16181d\" }}>",
            &cambios(&[("color", "#0000ff")]),
            true,
        )
        .unwrap();
        assert_eq!(r, "<h1 style={{ fontSize: \"38px\", color: \"#0000ff\" }}>");
    }

    #[test]
    fn un_valor_vacio_borra_esa_propiedad() {
        let r = fusionar(
            "<h1 style={{ fontSize: \"38px\", color: \"#16181d\" }}>",
            &cambios(&[("fontSize", "")]),
            true,
        )
        .unwrap();
        assert_eq!(r, "<h1 style={{ color: \"#16181d\" }}>");
    }

    #[test]
    fn si_no_queda_ninguna_el_style_desaparece_entero() {
        let r = fusionar("<h1 style={{ color: \"#16181d\" }}>", &cambios(&[("color", "")]), true).unwrap();
        assert_eq!(r, "<h1>");
    }

    #[test]
    fn un_style_con_una_variable_dentro_no_se_toca() {
        let e = fusionar(
            "<div style={{ width: ancho }}>",
            &cambios(&[("color", "#ff0000")]),
            true,
        );
        assert!(e.is_err(), "tenía que negarse, y devolvió {e:?}");
        assert!(e.unwrap_err().contains("código dentro"));
    }

    #[test]
    fn una_sombra_con_comas_no_se_parte_en_pedazos() {
        let r = fusionar(
            "<div style={{ boxShadow: \"0 2px 8px rgba(0, 0, 0, 0.2)\" }}>",
            &cambios(&[("color", "#111111")]),
            true,
        )
        .unwrap();
        assert!(r.contains("rgba(0, 0, 0, 0.2)"), "se rompió la sombra: {r}");
        assert!(r.contains("color: \"#111111\""));
    }

    #[test]
    fn en_html_el_estilo_va_con_guiones_y_punto_y_coma() {
        let r = fusionar("<div class=\"caja\">", &cambios(&[("fontSize", "18px")]), false).unwrap();
        assert_eq!(r, "<div style=\"font-size: 18px\" class=\"caja\">");
    }

    #[test]
    fn una_propiedad_que_no_esta_en_la_lista_no_entra() {
        let e = fusionar("<div>", &cambios(&[("behavior", "url(x.htc)")]), true);
        assert!(e.is_err(), "debería rechazarla");
    }

    #[test]
    fn un_valor_con_comillas_no_entra() {
        assert!(!valor_valido("color", "#fff\" onload=\"malo()"));
        assert!(!valor_valido("width", "10px; background: url(x)"));
        assert!(!valor_valido("transform", "translate(1px,2px) url(javascript:1)"));
    }

    #[test]
    fn las_formas_de_cada_propiedad() {
        assert!(valor_valido("width", "120px"));
        assert!(valor_valido("width", "50%"));
        assert!(valor_valido("padding", "8px 12px"));
        assert!(valor_valido("color", "#a1b2c3"));
        assert!(valor_valido("color", "rgba(1, 2, 3, .5)"));
        assert!(valor_valido("opacity", "0.5"));
        assert!(valor_valido("transform", "translate(-4px, 12px)"));
        assert!(valor_valido("transform", "rotate(9deg)"));
        assert!(valor_valido("backgroundImage", "linear-gradient(90deg, #fff, #000)"));
        assert!(!valor_valido("width", "loquesea"));
        assert!(!valor_valido("color", "rojo"));
        assert!(!valor_valido("opacity", "medio"));
        assert!(!valor_valido("transform", "matrix(1,2,3,4,5,6)"));
    }

    #[test]
    fn un_trozo_que_ya_no_es_una_etiqueta_se_rechaza() {
        let sitio = Sitio {
            fichero: PathBuf::from("x.jsx"),
            inicio: 0,
            fin: 5,
            jsx: true,
        };
        assert!(etiqueta_de("hola que tal", &sitio).is_err());
        assert!(etiqueta_de("<h1>x", &sitio).is_err(), "el trozo tiene que acabar en >");
    }

    /// El camino entero sobre un fichero de verdad: la marca que da el plugin,
    /// el corte, la fusión y el guardado. Es la ruta que toca el código de
    /// Munir, así que se prueba con un fichero en el disco, no con cadenas.
    #[test]
    fn de_punta_a_punta_sobre_un_fichero_de_verdad() {
        let dir = std::env::temp_dir().join(format!("adeorq-editor-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("src")).unwrap();
        let fichero = dir.join("src/App.jsx");

        let fuente = "export default function App() {\n  return (\n    <div className=\"caja\">\n      <h1 style={{ fontSize: \"38px\" }}>Hola</h1>\n    </div>\n  );\n}\n";
        std::fs::write(&fichero, fuente).unwrap();

        // Los números que estamparía el plugin para el <h1>.
        let inicio = fuente.find("<h1").unwrap();
        let fin = fuente[inicio..].find('>').unwrap() + inicio + 1;
        let loc = format!("src/App.jsx:{inicio}:{fin}");

        let sitio = parsear_loc(dir.to_str().unwrap(), &loc).unwrap();
        let texto = std::fs::read_to_string(&sitio.fichero).unwrap();
        let etiqueta = etiqueta_de(&texto, &sitio).unwrap();
        assert_eq!(etiqueta, "<h1 style={{ fontSize: \"38px\" }}>");

        let nueva = fusionar(
            &etiqueta,
            &cambios(&[("fontSize", "44px"), ("color", "#0a84ff")]),
            sitio.jsx,
        )
        .unwrap();
        let salida = format!("{}{}{}", &texto[..sitio.inicio], nueva, &texto[sitio.fin..]);
        guardar(&sitio.fichero, &salida).unwrap();

        let final_ = std::fs::read_to_string(&fichero).unwrap();
        assert!(
            final_.contains("<h1 style={{ fontSize: \"44px\", color: \"#0a84ff\" }}>Hola</h1>"),
            "quedó así:\n{final_}"
        );
        // Y lo de alrededor, intacto: cambiar un estilo no puede reformatear.
        assert!(final_.starts_with("export default function App() {\n  return (\n    <div className=\"caja\">\n"));
        assert!(final_.ends_with("    </div>\n  );\n}\n"));
        assert!(!dir.join("src/App.adeorq-tmp").exists(), "quedó el temporal");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// La costura entre las dos mitades, con datos REALES de la sonda.
    ///
    /// Se lanza a mano con lo que la sonda acaba de mandar, para comprobar que
    /// el `loc` que produce el plugin lo entiende el escritor:
    ///
    /// ```text
    /// ADEORQ_RAIZ=... ADEORQ_LOC=src/App.jsx:435:486 ADEORQ_ESTILOS=fontSize=52px,color=#0a84ff     ///   cargo test --lib con_datos_de_la_sonda -- --ignored --nocapture
    /// ```
    #[test]
    #[ignore = "necesita una raíz y una marca de verdad por variables de entorno"]
    fn con_datos_de_la_sonda() {
        let raiz = std::env::var("ADEORQ_RAIZ").expect("falta ADEORQ_RAIZ");
        let loc = std::env::var("ADEORQ_LOC").expect("falta ADEORQ_LOC");
        let crudo = std::env::var("ADEORQ_ESTILOS").expect("falta ADEORQ_ESTILOS");
        let estilos: BTreeMap<String, String> = crudo
            .split(',')
            .filter_map(|p| p.split_once('='))
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();

        let sitio = parsear_loc(&raiz, &loc).expect("la marca no se pudo resolver");
        let antes = std::fs::read_to_string(&sitio.fichero).unwrap();
        println!("etiqueta antes: {}", etiqueta_de(&antes, &sitio).unwrap());

        let donde = aplicar_estilo(&raiz, &loc, &estilos).expect("no se pudo escribir");
        let despues = std::fs::read_to_string(&sitio.fichero).unwrap();
        let sitio2 = parsear_loc(&raiz, &loc).unwrap();
        println!("etiqueta despues: {}", etiqueta_de(&despues, &sitio2).unwrap());
        println!("guardado en: {donde}");
        assert_ne!(antes, despues, "el fichero no cambió");
        for (k, v) in &estilos {
            assert!(despues.contains(v), "«{k}: {v}» no llegó al fichero");
        }
    }

    #[test]
    fn una_marca_que_se_sale_del_proyecto_no_abre_nada() {
        let dir = std::env::temp_dir().join("adeorq-editor-prueba");
        std::fs::create_dir_all(&dir).unwrap();
        let e = parsear_loc(dir.to_str().unwrap(), "../../../secreto.txt:0:5");
        assert!(e.is_err(), "tenía que negarse a salir de la carpeta");
    }
}
