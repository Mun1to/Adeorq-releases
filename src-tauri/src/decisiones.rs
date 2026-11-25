// Las decisiones que un agente le pide a Munir, para contestarlas desde el
// móvil o desde cualquier navegador emparejado.
//
// Munir, 2026-10-09, antes de irse al instituto: «que desde el móvil o otro
// dispositivo haya una sección de decisiones». Hasta hoy una decisión era una
// página HTML que el agente abría en el navegador del PC (regla AC): estando
// fuera no le llegaba, y la sesión se quedaba esperando.
//
// Cómo va: el agente la crea con la herramienta `ask_decision` del MCP (sus
// preguntas, cada una con 2 a 6 opciones numeradas y como mucho una
// recomendada); llega un aviso al móvil; Munir la contesta en «Decisiones»
// (una opción y, si quiere, sus palabras, por pregunta); y la respuesta se
// teclea en la terminal que preguntó, si sigue siendo la misma. El agente
// también la puede leer cuando quiera con `get_decision`.
//
// Por qué un formato y no la página HTML del agente: la página del móvil vive
// en un origen que guarda la clave de emparejar, y un HTML escrito por un
// agente (que puede haber leído cualquier cosa de internet) no puede ejecutar
// su JavaScript ahí. Aquí solo viajan textos, y la página los pinta escapados.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub const TOPE_PREGUNTAS: usize = 8;
pub const TOPE_OPCIONES: usize = 6;
pub const TOPE_TITULO: usize = 200;
pub const TOPE_TEXTO: usize = 2000;
/// Las que ya no esperan a nadie y se guardan; las vivas no se borran nunca solas.
pub const TOPE_GUARDADAS: usize = 100;
/// Lo que dura una que ya no espera a nadie, desde lo último que le pasó.
/// Munir, 2026-10-11, con nueve sin nadie detrás en la pestaña: «haz algo para
/// que se limpie sola».
pub const DIAS_GUARDADAS: u64 = 7;
/// Lo que pesa como mucho una imagen de una decisión, y todas las de una juntas.
/// Una captura de pantalla entera en PNG ronda de 0,5 a 3 MB; el móvil las baja
/// por datos, y una decisión llega a llevar 56 (8 preguntas con 6 opciones y la
/// suya cada una).
pub const TOPE_IMAGEN: usize = 8 * 1024 * 1024;
pub const TOPE_IMAGENES: usize = 40 * 1024 * 1024;
/// El lado más largo que se acepta: más allá, el navegador del móvil la pinta
/// a trozos o no la pinta.
pub const TOPE_LADO: u32 = 16_384;
/// Y los píxeles de toda la imagen: cada lado puede caber y la imagen no, que
/// descodificada ocupa cuatro bytes por píxel (16.384 × 16.384 es un giga).
/// 25 millones dejan pasar una página entera hecha captura (1.440 × 16.000).
pub const TOPE_PIXELES: u64 = 25_000_000;

/// Una imagen de la decisión, ya copiada a su carpeta del almacén
/// (`decisiones/<id>/<n>.<ext>`). Munir, 2026-11-19, desde el móvil y con la
/// captura de una decisión de diseño cuyas fotos solo estaban en una página del
/// PC: «Tiene que haber una manera la cual se puedan ver las imagenes de las
/// decisiones».
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Imagen {
    /// Su número dentro de la decisión, desde 1: lo único que pide el móvil.
    pub n: u32,
    /// Su tipo, leído de sus bytes (no de la extensión).
    pub tipo: String,
    /// Para que la página le guarde el sitio antes de que llegue: en la
    /// pantalla de una decisión nada puede moverse bajo el dedo.
    pub ancho: u32,
    pub alto: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Opcion {
    pub texto: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detalle: Option<String>,
    #[serde(default)]
    pub recomendada: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub imagen: Option<Imagen>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Pregunta {
    /// A, B, C… en el orden en que llegan.
    pub id: String,
    pub titulo: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contexto: Option<String>,
    pub opciones: Vec<Opcion>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub imagen: Option<Imagen>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct Eleccion {
    /// El número de la opción, desde 1.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opcion: Option<usize>,
    /// «Otra cosa, con tus palabras».
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub texto: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Respuesta {
    pub cuando: u64,
    /// Desde dónde: el nombre del aparato emparejado.
    pub desde: String,
    pub elecciones: BTreeMap<String, Eleccion>,
    /// Si se tecleó en la terminal que preguntó.
    #[serde(default)]
    pub entregada: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Decision {
    pub id: String,
    pub titulo: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contexto: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proyecto: Option<String>,
    /// La terminal que pregunta (su `ADEORQ_PANE_ID`), y el arranque de Adeorq
    /// en que ese número valía: los números vuelven a 1 al abrir la app.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub panel: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arranque: Option<u64>,
    pub creada: u64,
    pub preguntas: Vec<Pregunta>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub respuesta: Option<Respuesta>,
    /// Cuándo la apartó Munir sin contestarla (milisegundos).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub descartada: Option<u64>,
    /// Cuándo le escribió Munir a la terminal que preguntó, sin haberla
    /// contestado aquí (milisegundos): lo habló con el agente.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hablada: Option<u64>,
    /// La dio por resuelta el agente: la respuesta le llegó por otro lado, o
    /// la sustituye otra que pregunta lo mismo mejor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resuelta: Option<Resuelta>,
}

/// Munir, 2026-11-07, con tres «te esperan» en el móvil: «por qué hay
/// decisiones waiting for me en móvil que ya he decidido». Las seis del escudo
/// las había contestado pegándolas en el chat de otra sesión, que se las pasó a
/// la terminal que preguntaba, y la misma pregunta seguía abierta dos veces: la
/// primera y su versión reescrita. Ninguna de las dos vías la cerraba.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Resuelta {
    pub cuando: u64,
    /// Cómo se resolvió, dicho por el agente («me lo pegó la Suprema: A1, B1…»).
    pub como: String,
    /// La decisión que la sustituye, si es eso.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sustituta: Option<String>,
}

/// En qué punto está una decisión, que es lo que se pinta.
///
/// Munir, 2026-10-10: «lo de las decisiones, si siguen activas o no». Tenía
/// seis «pendientes» que ya había contestado de palabra en el chat, o cuya
/// terminal llevaba días cerrada, mezcladas con la única que de verdad le
/// esperaba, y todas sumaban igual en el número del botón.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Vigencia {
    /// Sin contestar, y quien preguntó sigue ahí para recibir la respuesta.
    Viva,
    /// Sin contestar, pero su terminal ya no está: nadie la espera.
    Huerfana,
    /// Sin contestar aquí, pero Munir le escribió después a la terminal que
    /// preguntó. Es como casi siempre contesta (2026-10-11: nueve «pendientes»
    /// que ya había resuelto de palabra), y la misma regla de la campana: lo
    /// que atiendes en su terminal deja de esperarte.
    Hablada,
    Contestada,
    Descartada,
    /// El agente la dio por resuelta: le llegó la respuesta por otro lado, o la
    /// sustituye otra.
    Resuelta,
}

/// Una decisión con su vigencia al lado: lo que viaja a la app y al móvil.
#[derive(Clone, Debug, Serialize)]
pub struct ConVigencia {
    #[serde(flatten)]
    pub decision: Decision,
    pub vigencia: Vigencia,
    /// Si contestarla ahora se teclearía en su terminal (`se_teclearia`). Con
    /// él, una hablada cuya terminal sigue abierta se sigue viendo arriba: le
    /// escribiste, pero no tiene por qué haber sido la respuesta (Munir,
    /// 2026-11-24, buscando las que había que decidir: «no lo veo»).
    pub se_teclea: bool,
}

/// `abiertos` son los paneles que tienen terminal ahora mismo. Una decisión
/// sin terminal apuntada no se puede mirar así, y vale el arranque: la de otro
/// arranque de Adeorq ya no tiene a nadie detrás.
pub fn vigencia(d: &Decision, arranque: u64, abiertos: &[u32]) -> Vigencia {
    if d.respuesta.is_some() {
        return Vigencia::Contestada;
    }
    if d.descartada.is_some() {
        return Vigencia::Descartada;
    }
    if d.resuelta.is_some() {
        return Vigencia::Resuelta;
    }
    if d.hablada.is_some() {
        return Vigencia::Hablada;
    }
    let sigue = match (d.panel, d.arranque) {
        (Some(panel), Some(a)) => a == arranque && abiertos.contains(&panel),
        _ => d.creada >= crate::conserje::desde_para_lo_suelto(arranque),
    };
    if sigue { Vigencia::Viva } else { Vigencia::Huerfana }
}

/// Lo último que le pasó, para saber cuánto lleva sin esperar a nadie.
fn ultimo_movimiento(d: &Decision) -> u64 {
    [d.respuesta.as_ref().map(|r| r.cuando), d.descartada, d.hablada, d.resuelta.as_ref().map(|r| r.cuando)]
        .into_iter()
        .flatten()
        .fold(d.creada, u64::max)
}

pub fn con_vigencia(d: Decision, arranque: u64, abiertos: &[u32]) -> ConVigencia {
    let vigencia = vigencia(&d, arranque, abiertos);
    let se_teclea = se_teclearia(&d, arranque, abiertos);
    ConVigencia { decision: d, vigencia, se_teclea }
}

/// Ya no hay nada que hacer con ella: contestada, descartada o resuelta.
fn cerrada(d: &Decision) -> bool {
    d.respuesta.is_some() || d.descartada.is_some() || d.resuelta.is_some()
}

/// Cuándo dejó de esperar: lo que viaja como `cerrada` al móvil y a la app.
pub fn cuando_se_cerro(d: &Decision) -> Option<u64> {
    d.respuesta.as_ref().map(|r| r.cuando).or(d.descartada).or(d.resuelta.as_ref().map(|r| r.cuando)).or(d.hablada)
}

/// Lo que pide el agente, antes de tener id ni fecha.
#[derive(Clone, Debug, Default, Deserialize)]
pub struct Pedido {
    pub titulo: String,
    #[serde(default)]
    pub contexto: Option<String>,
    #[serde(default)]
    pub proyecto: Option<String>,
    #[serde(default)]
    pub panel: Option<u32>,
    pub preguntas: Vec<PedidoPregunta>,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct PedidoPregunta {
    pub titulo: String,
    #[serde(default)]
    pub contexto: Option<String>,
    pub opciones: Vec<PedidoOpcion>,
    /// La ruta de una imagen para la pregunta entera (`image` en el MCP).
    #[serde(default)]
    pub imagen: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct PedidoOpcion {
    pub texto: String,
    #[serde(default)]
    pub detalle: Option<String>,
    #[serde(default)]
    pub recomendada: bool,
    /// La ruta de una imagen de esta opción: cómo queda, una variante, una captura.
    #[serde(default)]
    pub imagen: Option<String>,
}

fn limpio(s: &str, tope: usize) -> String {
    s.chars().filter(|c| !c.is_control() || *c == '\n').take(tope).collect::<String>().trim().to_string()
}

fn opcional(s: &Option<String>, tope: usize) -> Option<String> {
    s.as_deref().map(|t| limpio(t, tope)).filter(|t| !t.is_empty())
}

/// Comprueba y limpia lo que pide el agente. El error se le devuelve tal cual,
/// así que dice qué arreglar.
pub fn validar(p: &Pedido, ahora: u64, arranque: u64) -> Result<Decision, String> {
    let titulo = limpio(&p.titulo, TOPE_TITULO);
    if titulo.is_empty() {
        return Err("La decisión necesita un título (title).".into());
    }
    if p.preguntas.is_empty() || p.preguntas.len() > TOPE_PREGUNTAS {
        return Err(format!("Entre 1 y {TOPE_PREGUNTAS} preguntas (questions)."));
    }
    let mut preguntas = Vec::new();
    for (i, q) in p.preguntas.iter().enumerate() {
        let letra = char::from(b'A' + i as u8).to_string();
        let t = limpio(&q.titulo, TOPE_TITULO);
        if t.is_empty() {
            return Err(format!("La pregunta {letra} no tiene título."));
        }
        if q.opciones.len() < 2 || q.opciones.len() > TOPE_OPCIONES {
            return Err(format!("La pregunta {letra} necesita entre 2 y {TOPE_OPCIONES} opciones."));
        }
        if q.opciones.iter().filter(|o| o.recomendada).count() > 1 {
            return Err(format!("La pregunta {letra} recomienda más de una opción: como mucho una."));
        }
        let mut opciones = Vec::new();
        for (j, o) in q.opciones.iter().enumerate() {
            let texto = limpio(&o.texto, TOPE_TITULO);
            if texto.is_empty() {
                return Err(format!("La opción {} de la pregunta {letra} está vacía.", j + 1));
            }
            opciones.push(Opcion { texto, detalle: opcional(&o.detalle, TOPE_TEXTO), recomendada: o.recomendada, imagen: None });
        }
        preguntas.push(Pregunta { id: letra, titulo: t, contexto: opcional(&q.contexto, TOPE_TEXTO), opciones, imagen: None });
    }
    Ok(Decision {
        id: format!("d{ahora:x}"),
        titulo,
        contexto: opcional(&p.contexto, TOPE_TEXTO),
        proyecto: opcional(&p.proyecto, TOPE_TITULO),
        panel: p.panel,
        arranque: p.panel.map(|_| arranque),
        creada: ahora,
        preguntas,
        respuesta: None,
        descartada: None,
        hablada: None,
        resuelta: None,
    })
}

/// Las imágenes de una decisión, leídas y comprobadas, esperando a que la
/// decisión tenga su id para guardarse con ella: (número, extensión, bytes).
#[derive(Debug, Default)]
pub struct Imagenes(Vec<(u32, &'static str, Vec<u8>)>);

impl Imagenes {
    pub fn cuantas(&self) -> usize {
        self.0.len()
    }
}

/// Lo que dicen los primeros bytes de una imagen: su tipo, su extensión y su
/// tamaño en píxeles. `None` si no es un PNG, JPEG, GIF o WebP de verdad (un
/// HTML con extensión `.png` no pasa).
pub fn leer_cabecera(b: &[u8]) -> Option<(&'static str, &'static str, u32, u32)> {
    let be16 = |i: usize| u32::from(u16::from_be_bytes([b[i], b[i + 1]]));
    let le16 = |i: usize| u32::from(u16::from_le_bytes([b[i], b[i + 1]]));
    let le24 = |i: usize| u32::from(b[i]) | u32::from(b[i + 1]) << 8 | u32::from(b[i + 2]) << 16;
    if b.len() >= 24 && b.starts_with(b"\x89PNG\r\n\x1a\n") && &b[12..16] == b"IHDR" {
        let ancho = u32::from_be_bytes([b[16], b[17], b[18], b[19]]);
        let alto = u32::from_be_bytes([b[20], b[21], b[22], b[23]]);
        // Chromium gira una PNG con EXIF (`eXIf`, antes de los datos) como un JPEG.
        let girada = orientacion_png(b).is_some_and(|o| (5..=8).contains(&o));
        return Some(if girada { ("image/png", "png", alto, ancho) } else { ("image/png", "png", ancho, alto) });
    }
    if b.len() >= 10 && (b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a")) {
        return Some(("image/gif", "gif", le16(6), le16(8)));
    }
    if b.len() >= 30 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        let (ancho, alto) = match &b[12..16] {
            b"VP8 " if b[23..26] == [0x9d, 0x01, 0x2a] => (le16(26) & 0x3fff, le16(28) & 0x3fff),
            b"VP8L" if b[20] == 0x2f => {
                let v = u32::from_le_bytes([b[21], b[22], b[23], b[24]]);
                ((v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1)
            }
            b"VP8X" => (le24(24) + 1, le24(27) + 1),
            _ => return None,
        };
        return Some(("image/webp", "webp", ancho, alto));
    }
    if b.starts_with(&[0xff, 0xd8]) {
        // Se recorren los segmentos hasta el que dice el tamaño (SOF0 a SOF15,
        // menos DHT, JPG y DAC, que comparten esos números). Antes viene el
        // EXIF (APP1): una foto tumbada que se pinta girada (orientación 5 a 8)
        // ocupa con los lados cambiados.
        let mut girada = false;
        let mut i = 2;
        while i + 4 <= b.len() {
            if b[i] != 0xff {
                return None;
            }
            let m = b[i + 1];
            if m == 0xff {
                i += 1;
                continue;
            }
            if m == 0xd8 || m == 0x01 || (0xd0..=0xd7).contains(&m) {
                i += 2;
                continue;
            }
            if m == 0xd9 || m == 0xda {
                return None;
            }
            let largo = be16(i + 2) as usize;
            if largo < 2 {
                return None;
            }
            if (0xc0..=0xcf).contains(&m) && !matches!(m, 0xc4 | 0xc8 | 0xcc) {
                if i + 9 > b.len() {
                    return None;
                }
                let (ancho, alto) = (be16(i + 7), be16(i + 5));
                return Some(if girada { ("image/jpeg", "jpg", alto, ancho) } else { ("image/jpeg", "jpg", ancho, alto) });
            }
            if m == 0xe1 {
                let fin = (i + 2 + largo).min(b.len());
                girada |= b.get(i + 4..fin).and_then(orientacion_exif).is_some_and(|o| (5..=8).contains(&o));
            }
            i += 2 + largo;
        }
    }
    None
}

/// La orientación (etiqueta 0x0112) del IFD0 de un segmento APP1 «Exif», en
/// cualquiera de los dos órdenes de bytes. `None` si no está o no se entiende.
fn orientacion_exif(s: &[u8]) -> Option<u16> {
    orientacion_tiff(s.strip_prefix(b"Exif\0\0")?)
}

/// La orientación del trozo `eXIf` de una PNG, buscado entre el IHDR y el
/// primer IDAT. El trozo es el TIFF a secas, aunque hay programas que le
/// dejan delante el «Exif\0\0» del JPEG.
fn orientacion_png(b: &[u8]) -> Option<u16> {
    let mut i = 33;
    while let Some(cab) = b.get(i..i + 8) {
        let largo = u32::from_be_bytes([cab[0], cab[1], cab[2], cab[3]]) as usize;
        match &cab[4..8] {
            b"IDAT" | b"IEND" => return None,
            b"eXIf" => {
                let t = b.get(i + 8..i.checked_add(8)?.checked_add(largo)?)?;
                return orientacion_tiff(t.strip_prefix(b"Exif\0\0").unwrap_or(t));
            }
            _ => i = i.checked_add(12)?.checked_add(largo)?,
        }
    }
    None
}

/// La orientación (etiqueta 0x0112) del IFD0 de un TIFF de EXIF.
fn orientacion_tiff(t: &[u8]) -> Option<u16> {
    let motorola = match t.get(0..2)? {
        b"MM" => true,
        b"II" => false,
        _ => return None,
    };
    let u16_en = |i: usize| -> Option<u16> {
        let x: [u8; 2] = t.get(i..i + 2)?.try_into().ok()?;
        Some(if motorola { u16::from_be_bytes(x) } else { u16::from_le_bytes(x) })
    };
    let u32_en = |i: usize| -> Option<u32> {
        let x: [u8; 4] = t.get(i..i + 4)?.try_into().ok()?;
        Some(if motorola { u32::from_be_bytes(x) } else { u32::from_le_bytes(x) })
    };
    if u16_en(2)? != 42 {
        return None;
    }
    let ifd = u32_en(4)? as usize;
    let entradas = u16_en(ifd)? as usize;
    (0..entradas.min(256)).find_map(|k| {
        let e = ifd + 2 + k * 12;
        (u16_en(e)? == 0x0112 && u16_en(e + 2)? == 3).then(|| u16_en(e + 8)).flatten()
    })
}

/// El tipo guardado de una imagen, solo si es uno de los cuatro: lo que se
/// sirve nunca lleva un tipo que no se haya puesto aquí.
fn tipo_conocido(tipo: &str) -> Option<(&'static str, &'static str)> {
    Some(match tipo {
        "image/png" => ("image/png", "png"),
        "image/jpeg" => ("image/jpeg", "jpg"),
        "image/gif" => ("image/gif", "gif"),
        "image/webp" => ("image/webp", "webp"),
        _ => return None,
    })
}

/// Lee y comprueba UNA imagen que pide el agente, con las mismas reglas de
/// carpetas que `compartir_en_el_movil` (`compartidos::ruta_valida`): ruta
/// entera, dentro de la carpeta de proyectos o de la temporal, y por ninguna
/// carpeta protegida. Los tipos y el tope son los suyos, y así se dicen: los
/// de compartir (una página HTML, 25 MB) aquí no valen.
/// Se lee entera ahora: lo que se guarda es lo que se miró.
fn una_imagen(ruta: &str, n: u32, raices: &[PathBuf]) -> Result<(Imagen, &'static str, Vec<u8>), String> {
    use std::io::Read;
    let (real, meta) = crate::compartidos::ruta_valida(ruta, raices)?;
    let ext = real.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase);
    if !matches!(ext.as_deref(), Some("png" | "jpg" | "jpeg" | "gif" | "webp")) {
        return Err(format!("«{ruta}» no es una imagen: solo valen png, jpg, webp o gif."));
    }
    if meta.len() > TOPE_IMAGEN as u64 {
        return Err(format!("«{ruta}» pesa demasiado: como mucho {} MB por imagen.", TOPE_IMAGEN / 1024 / 1024));
    }
    let mut bytes = Vec::new();
    std::fs::File::open(&real)
        .and_then(|f| f.take(TOPE_IMAGEN as u64 + 1).read_to_end(&mut bytes))
        .map_err(|e| format!("no se puede leer «{ruta}»: {e}"))?;
    if bytes.len() > TOPE_IMAGEN {
        return Err(format!("«{ruta}» pesa demasiado: como mucho {} MB por imagen.", TOPE_IMAGEN / 1024 / 1024));
    }
    let (mime, ext, ancho, alto) =
        leer_cabecera(&bytes).ok_or_else(|| format!("«{ruta}» no es una imagen PNG, JPEG, GIF o WebP de verdad."))?;
    if ancho == 0 || alto == 0 || ancho.max(alto) > TOPE_LADO {
        return Err(format!("«{ruta}» mide {ancho} × {alto} px: cada lado entre 1 y {TOPE_LADO}."));
    }
    let pixeles = u64::from(ancho) * u64::from(alto);
    if pixeles > TOPE_PIXELES {
        let mega = |p: u64| (p + 500_000) / 1_000_000;
        return Err(format!(
            "«{ruta}» mide {ancho} × {alto} px, {} megapíxeles: como mucho {}.",
            mega(pixeles),
            mega(TOPE_PIXELES)
        ));
    }
    Ok((Imagen { n, tipo: mime.into(), ancho, alto }, ext, bytes))
}

/// Las imágenes que pide el agente, comprobadas todas ANTES de guardar nada, y
/// apuntadas en `d` (que sale de `validar` con este mismo pedido). Se numeran
/// en el orden en que se ven: la de la pregunta y luego las de sus opciones.
/// Una ruta mala es un error que dice cuál y por qué: nunca se guarda una
/// decisión con la mitad de sus imágenes.
pub fn preparar_imagenes(p: &Pedido, d: &mut Decision, raices: &[PathBuf]) -> Result<Imagenes, String> {
    let ruta = |r: &Option<String>| r.as_deref().map(str::trim).filter(|r| !r.is_empty()).map(str::to_string);
    let mut guardar = Imagenes::default();
    let mut total = 0usize;
    let mut sumar = |donde: String, r: String, guardar: &mut Imagenes| -> Result<Imagen, String> {
        let n = guardar.0.len() as u32 + 1;
        let (img, ext, bytes) = una_imagen(&r, n, raices).map_err(|e| format!("{donde}: {e}"))?;
        total += bytes.len();
        if total > TOPE_IMAGENES {
            return Err(format!("Las imágenes de la decisión pesan demasiado juntas: como mucho {} MB entre todas.", TOPE_IMAGENES / 1024 / 1024));
        }
        guardar.0.push((n, ext, bytes));
        Ok(img)
    };
    for (q, pq) in d.preguntas.iter_mut().zip(&p.preguntas) {
        if let Some(r) = ruta(&pq.imagen) {
            q.imagen = Some(sumar(format!("La imagen de la pregunta {}", q.id), r, &mut guardar)?);
        }
        for (j, (o, po)) in q.opciones.iter_mut().zip(&pq.opciones).enumerate() {
            if let Some(r) = ruta(&po.imagen) {
                o.imagen = Some(sumar(format!("La imagen de la opción {} de la pregunta {}", j + 1, q.id), r, &mut guardar)?);
            }
        }
    }
    Ok(guardar)
}

/// Todas las imágenes de una decisión.
fn imagenes_de(d: &Decision) -> impl Iterator<Item = &Imagen> {
    d.preguntas.iter().flat_map(|q| q.imagen.iter().chain(q.opciones.iter().filter_map(|o| o.imagen.as_ref())))
}

/// Una imagen de la decisión `id` por su número, como la pide el móvil o la
/// pestaña del PC: su tipo y sus bytes. Nunca una ruta: la carpeta sale del id
/// (que no puede salir del almacén) y el nombre, del número y del tipo guardado.
pub fn imagen(dir: &Path, id: &str, n: u32) -> Option<(&'static str, Vec<u8>)> {
    let d = leer(dir, id)?;
    let img = imagenes_de(&d).find(|i| i.n == n)?;
    let (mime, ext) = tipo_conocido(&img.tipo)?;
    let bytes = std::fs::read(carpeta(dir, &d.id)?.join(format!("{n}.{ext}"))).ok()?;
    Some((mime, bytes))
}

/// Un id que no es de este almacén no puede llevar a ningún otro archivo.
fn id_valido(id: &str) -> bool {
    id.len() >= 2 && id.len() <= 24 && id.starts_with('d') && id[1..].chars().all(|c| c.is_ascii_hexdigit())
}

fn ruta(dir: &Path, id: &str) -> Option<PathBuf> {
    id_valido(id).then(|| dir.join(format!("{id}.json")))
}

/// Donde viven las imágenes de una decisión: `listar` solo lee los `.json`, así
/// que esta carpeta no le estorba.
fn carpeta(dir: &Path, id: &str) -> Option<PathBuf> {
    id_valido(id).then(|| dir.join(id))
}

fn borrar_imagenes(dir: &Path, id: &str) {
    if let Some(c) = carpeta(dir, id) {
        let _ = std::fs::remove_dir_all(c);
    }
}

/// Distinto en cada llamada, también entre hilos del mismo milisegundo.
fn sufijo_unico() -> String {
    static CUENTA: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
    let n = CUENTA.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|t| t.subsec_nanos()).unwrap_or(0);
    format!("{}-{n}-{nanos}", std::process::id())
}

/// Lo que tiene que pasar para que una carpeta sin su decisión se dé por
/// perdida: mientras se crea una, su carpeta existe un instante antes que su json.
const HUERFANA_TRAS_MS: u64 = 3_600_000;

/// Las carpetas de imágenes que se quedaron sin decisión (la app se cayó al
/// guardar, o falló un renombrado o un borrado) y las temporales a medias. Solo
/// lo que es del almacén: `<id>/` sin `<id>.json` y `<id>.….imagenes.tmp`.
fn barrer_huerfanas(dir: &Path, ahora: u64) {
    for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        if !e.file_type().is_ok_and(|t| t.is_dir()) {
            continue;
        }
        let nombre = e.file_name().to_string_lossy().into_owned();
        let temporal = nombre.ends_with(".imagenes.tmp") && nombre.split('.').next().is_some_and(id_valido);
        let sola = id_valido(&nombre) && !dir.join(format!("{nombre}.json")).exists();
        if !temporal && !sola {
            continue;
        }
        let tocada = e.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok());
        if tocada.is_some_and(|t| ahora.saturating_sub(t.as_millis() as u64) > HUERFANA_TRAS_MS) {
            let _ = std::fs::remove_dir_all(e.path());
        }
    }
}

fn escribir(dir: &Path, d: &Decision) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let destino = ruta(dir, &d.id).ok_or("Ese id no es de una decisión.")?;
    let temporal = destino.with_extension("json.tmp");
    std::fs::write(&temporal, serde_json::to_vec_pretty(d).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&temporal, &destino).map_err(|e| {
        let _ = std::fs::remove_file(&temporal);
        e.to_string()
    })
}

/// Guarda una decisión nueva. Si en el mismo milisegundo ya había otra, el id
/// corre uno: dos agentes preguntando a la vez no se pisan.
pub fn crear(dir: &Path, d: Decision) -> Result<Decision, String> {
    crear_con_imagenes(dir, d, Imagenes::default())
}

/// Como `crear`, con sus imágenes (`preparar_imagenes`). Van primero a una
/// carpeta temporal que se renombra entera, y la decisión se escribe después:
/// si algo falla no queda ni la decisión ni la mitad de sus imágenes.
pub fn crear_con_imagenes(dir: &Path, mut d: Decision, imagenes: Imagenes) -> Result<Decision, String> {
    let ocupado = |d: &Decision| ruta(dir, &d.id).is_some_and(|r| r.exists()) || carpeta(dir, &d.id).is_some_and(|c| c.exists());
    let correr = |d: &mut Decision| {
        d.creada += 1;
        d.id = format!("d{:x}", d.creada);
    };
    while ocupado(&d) {
        correr(&mut d);
    }
    if !imagenes.0.is_empty() {
        let fallo = |e: std::io::Error| format!("No se pudieron guardar las imágenes de la decisión: {e}");
        // Propia de esta creación: otra del mismo milisegundo saca el mismo id.
        let temporal = dir.join(format!("{}.{}.imagenes.tmp", d.id, sufijo_unico()));
        let copiar = || -> std::io::Result<()> {
            std::fs::create_dir_all(dir)?;
            std::fs::create_dir(&temporal)?;
            for (n, ext, bytes) in &imagenes.0 {
                std::fs::write(temporal.join(format!("{n}.{ext}")), bytes)?;
            }
            Ok(())
        };
        if let Err(e) = copiar() {
            let _ = std::fs::remove_dir_all(&temporal);
            return Err(fallo(e));
        }
        // Renombrar sobre una carpeta que ya tiene imágenes falla: si otra se
        // quedó ese id entre la comprobación y aquí, el id corre otra vez.
        let mut intentos = 0;
        loop {
            let destino = carpeta(dir, &d.id).ok_or("Ese id no es de una decisión.")?;
            match std::fs::rename(&temporal, &destino) {
                Ok(()) => break,
                Err(_) if ocupado(&d) && intentos < 64 => {
                    intentos += 1;
                    while ocupado(&d) {
                        correr(&mut d);
                    }
                }
                Err(e) => {
                    let _ = std::fs::remove_dir_all(&temporal);
                    return Err(fallo(e));
                }
            }
        }
    }
    if let Err(e) = escribir(dir, &d) {
        borrar_imagenes(dir, &d.id);
        return Err(e);
    }
    Ok(d)
}

pub fn leer(dir: &Path, id: &str) -> Option<Decision> {
    let r = ruta(dir, id)?;
    serde_json::from_slice(&std::fs::read(r).ok()?).ok()
}

/// Todas, las pendientes primero y dentro de cada grupo la más nueva arriba.
pub fn listar(dir: &Path) -> Vec<Decision> {
    let mut todas: Vec<Decision> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| serde_json::from_slice(&std::fs::read(e.path()).ok()?).ok())
        .collect();
    todas.sort_by(|a, b| cerrada(a).cmp(&cerrada(b)).then(b.creada.cmp(&a.creada)));
    todas
}

/// La limpieza, que se hace sola: de las que ya no esperan a nadie (todo menos
/// las vivas) se van las que llevan más de `DIAS_GUARDADAS` sin que les pase
/// nada, y de las que quedan, las que pasen de `TOPE_GUARDADAS`. Una viva no se
/// borra nunca. Barre también las carpetas de imágenes que se quedaron sin su
/// decisión (`barrer_huerfanas`). Devuelve cuántas se fueron.
pub fn podar(dir: &Path, arranque: u64, abiertos: &[u32], ahora: u64) -> usize {
    let caduca = DIAS_GUARDADAS * 86_400_000;
    let mut pasadas: Vec<Decision> =
        listar(dir).into_iter().filter(|d| vigencia(d, arranque, abiertos) != Vigencia::Viva).collect();
    pasadas.sort_by_key(|d| std::cmp::Reverse(ultimo_movimiento(d)));
    let mut fuera = 0;
    for (i, d) in pasadas.iter().enumerate() {
        if i < TOPE_GUARDADAS && ahora.saturating_sub(ultimo_movimiento(d)) <= caduca {
            continue;
        }
        if ruta(dir, &d.id).is_some_and(|r| std::fs::remove_file(r).is_ok()) {
            borrar_imagenes(dir, &d.id);
            fuera += 1;
        }
    }
    barrer_huerfanas(dir, ahora);
    fuera
}

/// Munir acaba de escribirle a esa terminal: lo que le hubiera preguntado y
/// siguiera esperando se da por hablado. Solo las de este arranque (en otro,
/// ese número es otra terminal) y las de antes de `ahora`. Devuelve sus ids.
pub fn marcar_habladas(dir: &Path, panel: u32, arranque: u64, ahora: u64) -> Vec<String> {
    let mut ids = Vec::new();
    for mut d in listar(dir) {
        let suya = d.panel == Some(panel) && d.arranque == Some(arranque);
        if !suya || cerrada(&d) || d.hablada.is_some() || d.creada > ahora {
            continue;
        }
        d.hablada = Some(ahora);
        if escribir(dir, &d).is_ok() {
            ids.push(d.id);
        }
    }
    ids
}

/// Apunta la respuesta. Cada pregunta necesita una opción que exista o unas
/// palabras (o las dos); una decisión ya contestada no se vuelve a contestar,
/// que el agente puede estar trabajando ya con la primera.
pub fn responder(dir: &Path, id: &str, elecciones: BTreeMap<String, Eleccion>, desde: &str, ahora: u64) -> Result<Decision, String> {
    let mut d = leer(dir, id).ok_or("Esa decisión ya no está.")?;
    if d.respuesta.is_some() {
        return Err("Esa decisión ya está contestada.".into());
    }
    if d.descartada.is_some() {
        return Err("Esa decisión está descartada: al agente ya se le dijo que no esperase respuesta.".into());
    }
    if let Some(r) = &d.resuelta {
        return Err(ya_resuelta(r));
    }
    let mut limpias = BTreeMap::new();
    for q in &d.preguntas {
        let e = elecciones.get(&q.id).cloned().unwrap_or_default();
        let texto = opcional(&e.texto, TOPE_TEXTO);
        if let Some(n) = e.opcion {
            if n == 0 || n > q.opciones.len() {
                return Err(format!("La pregunta {} no tiene opción {n}.", q.id));
            }
        }
        if e.opcion.is_none() && texto.is_none() {
            return Err(format!("Falta contestar la pregunta {}.", q.id));
        }
        limpias.insert(q.id.clone(), Eleccion { opcion: e.opcion, texto });
    }
    d.respuesta = Some(Respuesta { cuando: ahora, desde: limpio(desde, 60), elecciones: limpias, entregada: false });
    escribir(dir, &d)?;
    Ok(d)
}

/// La aparta sin contestarla: deja de contar entre las que te esperan y el
/// agente, si la pide, lee que no hay respuesta. Descartar dos veces no es un
/// error (dos aparatos a la vez); descartar una contestada, sí.
pub fn descartar(dir: &Path, id: &str, ahora: u64) -> Result<Decision, String> {
    let mut d = leer(dir, id).ok_or("Esa decisión ya no está.")?;
    if d.respuesta.is_some() {
        return Err("Esa decisión ya está contestada.".into());
    }
    // Resuelta por el agente ya no espera a nadie: descartarla no cambia nada.
    if d.descartada.is_none() && d.resuelta.is_none() {
        d.descartada = Some(ahora);
        escribir(dir, &d)?;
    }
    Ok(d)
}

fn ya_resuelta(r: &Resuelta) -> String {
    match &r.sustituta {
        Some(id) => format!("Esa decisión ya no se contesta: la sustituye la {id}."),
        None => format!("Esa decisión ya está resuelta por otra vía: {}", r.como),
    }
}

/// El agente la da por resuelta: la respuesta le llegó por otro lado (Munir se
/// la dijo en su terminal, otra sesión se la pegó). Deja de esperarle en el
/// móvil y en la app. Una contestada no se toca, que esa respuesta es la buena;
/// una que ya no espera (descartada o resuelta antes) se queda como estaba.
pub fn resolver(dir: &Path, id: &str, como: &str, ahora: u64) -> Result<Decision, String> {
    cerrar_por_el_agente(dir, id, como, None, ahora)
}

/// La `vieja` deja de esperar porque la `nueva` pregunta lo mismo, mejor. Lo
/// pide el agente al preguntar otra vez (`replaces` en `ask_decision`).
pub fn sustituir(dir: &Path, vieja: &str, nueva: &Decision, ahora: u64) -> Result<Decision, String> {
    let como = format!("La sustituye «{}» ({}).", nueva.titulo, nueva.id);
    cerrar_por_el_agente(dir, vieja, &como, Some(nueva.id.clone()), ahora)
}

fn cerrar_por_el_agente(dir: &Path, id: &str, como: &str, sustituta: Option<String>, ahora: u64) -> Result<Decision, String> {
    let mut d = leer(dir, id).ok_or_else(|| format!("No hay ninguna decisión {id}."))?;
    if d.respuesta.is_some() {
        return Err(format!("La decisión {id} ya está contestada desde «Decisiones»: lee su respuesta con get_decision."));
    }
    if cerrada(&d) {
        return Ok(d);
    }
    let como = limpio(como, TOPE_TEXTO);
    if como.is_empty() {
        return Err("Di en una frase cómo se resolvió (how): qué contestó Munir y por dónde.".into());
    }
    d.resuelta = Some(Resuelta { cuando: ahora, como, sustituta });
    escribir(dir, &d)?;
    Ok(d)
}

/// A quién hay que decirle que su decisión se descartó, y qué: solo a una
/// terminal que seguía esperándola. `antes` es su vigencia de antes de
/// descartarla, que después ya es «descartada» para todas.
pub fn aviso_de_descarte(d: &Decision, antes: Vigencia) -> Option<(u32, String)> {
    match (d.panel, antes) {
        (Some(panel), Vigencia::Viva) => Some((panel, como_texto(d))),
        _ => None,
    }
}

/// Apunta que la respuesta ya se tecleó en la terminal que preguntó.
pub fn marcar_entregada(dir: &Path, id: &str) {
    if let Some(mut d) = leer(dir, id) {
        if let Some(r) = d.respuesta.as_mut() {
            r.entregada = true;
            let _ = escribir(dir, &d);
        }
    }
}

/// La respuesta como texto para el agente: lo que se teclea en su terminal y
/// lo que devuelve `get_decision`.
pub fn como_texto(d: &Decision) -> String {
    let Some(r) = &d.respuesta else {
        if d.descartada.is_some() {
            return format!(
                "Munir ha descartado la decisión «{}» ({}) sin contestarla: no esperes respuesta. Si sigue haciendo falta, pregúntaselo de nuevo.",
                d.titulo, d.id
            );
        }
        if let Some(r) = &d.resuelta {
            return match &r.sustituta {
                Some(id) => format!("La decisión «{}» ({}) ya no espera respuesta: la sustituye la {id}.", d.titulo, d.id),
                None => format!("La decisión «{}» ({}) está resuelta por otra vía: {}", d.titulo, d.id, r.como),
            };
        }
        if d.hablada.is_some() {
            return format!(
                "La decisión «{}» ({}) no se contestó en la pestaña: Munir te escribió en tu terminal después de que preguntaras, así que su respuesta está en lo que te dijo allí. Si no te contestó eso, pregúntaselo de nuevo.",
                d.titulo, d.id
            );
        }
        return format!("La decisión «{}» ({}) sigue sin contestar.", d.titulo, d.id);
    };
    let mut s = format!("Munir ha contestado a «{}» (decisión {}):", d.titulo, d.id);
    for q in &d.preguntas {
        let e = r.elecciones.get(&q.id).cloned().unwrap_or_default();
        s.push_str(&format!("\n{}) {}: ", q.id, q.titulo));
        match e.opcion.and_then(|n| q.opciones.get(n - 1).map(|o| (n, o))) {
            Some((n, o)) => s.push_str(&format!("opción {n}, «{}»", o.texto)),
            None => s.push_str("ninguna de las opciones"),
        }
        if let Some(t) = &e.texto {
            s.push_str(&format!(". Con sus palabras: «{t}»"));
        }
    }
    s
}

/// El panel de la terminal que preguntó, solo si la decisión es de este mismo
/// arranque de Adeorq: en otro, ese número puede ser ya otra terminal.
fn su_panel(d: &Decision, arranque: u64) -> Option<u32> {
    match (d.panel, d.arranque) {
        (Some(panel), Some(a)) if a == arranque => Some(panel),
        _ => None,
    }
}

/// En qué terminal se teclea la respuesta, y qué: solo si la decisión es de
/// este mismo arranque de Adeorq (`su_panel`). No mira si esa terminal sigue
/// abierta: si no lo está, escribirle falla y la respuesta se queda guardada.
/// Lo usan el móvil y la pestaña «Decisiones» de la app.
pub fn a_teclear(d: &Decision, arranque: u64) -> Option<(u32, String)> {
    d.respuesta.as_ref()?;
    su_panel(d, arranque).map(|panel| (panel, como_texto(d)))
}

/// Si contestarla ahora la teclearía en su terminal: la regla de `a_teclear`
/// y que esa terminal siga abierta. Se lo dice el PC al móvil antes de enviar,
/// que lo deducía de la vigencia y a una hablada le decía que no cuando sí:
/// hablada es que ya no te espera, no que su respuesta no se teclee.
pub fn se_teclearia(d: &Decision, arranque: u64, abiertos: &[u32]) -> bool {
    su_panel(d, arranque).is_some_and(|panel| abiertos.contains(&panel))
}

/// Dónde viven, al lado del resto de datos de Adeorq.
pub fn dir_de_verdad() -> Result<PathBuf, String> {
    Ok(crate::dir_datos_creado()?.join("decisiones"))
}

/// Lo que escucha la ventana para tener al día la pestaña «Decisiones» y su
/// cuenta: una nueva del MCP, una contestada desde el móvil o desde aquí.
pub const EVENTO_CAMBIAN: &str = "decisiones:cambian";

pub fn avisar_cambio(app: &tauri::AppHandle) {
    use tauri::Emitter;
    let _ = app.emit(EVENTO_CAMBIAN, ());
}

/// Todas, para la pestaña «Decisiones» de la app (Munir, 2026-10-09,
/// contestando la primera decisión de verdad: «una sección Decisiones dentro
/// de la app de escritorio»).
#[tauri::command(async)]
pub fn decisiones_listar(app: tauri::AppHandle) -> Result<Vec<ConVigencia>, String> {
    let abiertos = crate::pty::paneles_abiertos(&app);
    let arranque = crate::conserje::arranque();
    let dir = dir_de_verdad()?;
    // La limpieza va con la lectura: es cuando alguien la está mirando.
    podar(&dir, arranque, &abiertos, ahora_ms());
    Ok(listar(&dir).into_iter().map(|d| con_vigencia(d, arranque, &abiertos)).collect())
}

/// Munir escribió en esa terminal (lo dice la ventana, que es quien ve las
/// teclas): lo que le hubiera preguntado deja de esperarle.
#[tauri::command(async)]
pub fn decisiones_habladas(app: tauri::AppHandle, panel: u32) -> Result<usize, String> {
    let ids = marcar_habladas(&dir_de_verdad()?, panel, crate::conserje::arranque(), ahora_ms());
    if !ids.is_empty() {
        avisar_cambio(&app);
    }
    Ok(ids.len())
}

fn ahora_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Descartar desde la app. Como al contestar, si hay una terminal esperándola
/// devuelve el panel y el texto, y lo teclea la ventana.
#[tauri::command(async)]
pub fn decision_descartar(app: tauri::AppHandle, id: String) -> Result<serde_json::Value, String> {
    let dir = dir_de_verdad()?;
    let antes = leer(&dir, &id)
        .map(|d| vigencia(&d, crate::conserje::arranque(), &crate::pty::paneles_abiertos(&app)))
        .ok_or("Esa decisión ya no está.")?;
    let d = descartar(&dir, &id, ahora_ms())?;
    avisar_cambio(&app);
    let teclear = aviso_de_descarte(&d, antes);
    Ok(serde_json::json!({
        "panel": teclear.as_ref().map(|t| t.0),
        "texto": teclear.map(|t| t.1),
    }))
}

/// Contestar desde la app. Devuelve la decisión ya contestada y, si toca, el
/// panel y el texto que hay que teclear allí: lo teclea la ventana, que es la
/// que tiene las terminales, y luego lo apunta con `decision_entregada`.
#[tauri::command(async)]
pub fn decision_responder(
    app: tauri::AppHandle,
    id: String,
    elecciones: BTreeMap<String, Eleccion>,
) -> Result<serde_json::Value, String> {
    let d = responder(&dir_de_verdad()?, &id, elecciones, "el PC", ahora_ms())?;
    avisar_cambio(&app);
    let teclear = a_teclear(&d, crate::conserje::arranque());
    Ok(serde_json::json!({
        "decision": d,
        "panel": teclear.as_ref().map(|t| t.0),
        "texto": teclear.map(|t| t.1),
    }))
}

#[tauri::command(async)]
pub fn decision_entregada(app: tauri::AppHandle, id: String) -> Result<(), String> {
    marcar_entregada(&dir_de_verdad()?, &id);
    avisar_cambio(&app);
    Ok(())
}

/// Una imagen de una decisión para la pestaña del PC, por su id y su número
/// (como el móvil): bytes en binario, que en base64 engordan un tercio y cruzan
/// el puente como texto (lo mismo que `read_paste`).
#[tauri::command(async)]
pub fn decision_imagen(id: String, n: u32) -> Result<tauri::ipc::Response, String> {
    let (_, bytes) = imagen(&dir_de_verdad()?, &id, n).ok_or("Esa imagen ya no está.")?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pedido() -> Pedido {
        Pedido {
            titulo: "Diseño de la guía".into(),
            contexto: Some("Dos cosas de la web".into()),
            proyecto: Some("Adeorq".into()),
            panel: Some(3),
            preguntas: vec![
                PedidoPregunta {
                    titulo: "La barra".into(),
                    contexto: None,
                    opciones: vec![
                        PedidoOpcion { texto: "Como está".into(), ..Default::default() },
                        PedidoOpcion { texto: "La de la portada".into(), detalle: Some("una sola barra".into()), recomendada: true, imagen: None },
                    ],
                    imagen: None,
                },
                PedidoPregunta {
                    titulo: "El menú".into(),
                    contexto: None,
                    opciones: vec![
                        PedidoOpcion { texto: "Botón".into(), ..Default::default() },
                        PedidoOpcion { texto: "Fila".into(), ..Default::default() },
                    ],
                    imagen: None,
                },
            ],
        }
    }

    fn dir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("adeorq-decisiones-{}-{}", std::process::id(), rand_sufijo()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    /// La hora sola no basta: dos pruebas en paralelo sacaban el mismo sufijo y
    /// una borraba la carpeta de la otra a media prueba («no se encuentra la ruta»).
    fn rand_sufijo() -> String {
        static CUENTA: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = CUENTA.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        format!("{}-{n}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos())
    }

    #[test]
    fn un_pedido_mal_hecho_dice_que_arreglar() {
        let mut p = pedido();
        p.titulo = "  ".into();
        assert!(validar(&p, 1, 1).unwrap_err().contains("título"));
        let mut p = pedido();
        p.preguntas[0].opciones.truncate(1);
        assert!(validar(&p, 1, 1).unwrap_err().contains("entre 2"));
        let mut p = pedido();
        p.preguntas[0].opciones[0].recomendada = true;
        assert!(validar(&p, 1, 1).unwrap_err().contains("más de una"));
        let mut p = pedido();
        p.preguntas = (0..9).map(|_| pedido().preguntas[0].clone()).collect();
        assert!(validar(&p, 1, 1).is_err());
    }

    #[test]
    fn se_crea_se_contesta_una_vez_y_se_le_cuenta_al_agente() {
        let d = dir();
        let nueva = crear(&d, validar(&pedido(), 1000, 77).unwrap()).unwrap();
        assert_eq!(nueva.preguntas[1].id, "B");
        assert_eq!(nueva.arranque, Some(77));
        // Dos en el mismo milisegundo no se pisan.
        let otra = crear(&d, validar(&pedido(), 1000, 77).unwrap()).unwrap();
        assert_ne!(nueva.id, otra.id);
        assert_eq!(listar(&d).len(), 2);

        let mut el = BTreeMap::new();
        el.insert("A".to_string(), Eleccion { opcion: Some(2), texto: None });
        assert!(responder(&d, &nueva.id, el.clone(), "Android · Chrome", 2000).unwrap_err().contains("pregunta B"));
        el.insert("B".to_string(), Eleccion { opcion: None, texto: Some("ninguna, déjalo".into()) });
        let hecha = responder(&d, &nueva.id, el.clone(), "Android · Chrome", 2000).unwrap();
        assert_eq!(hecha.respuesta.as_ref().unwrap().desde, "Android · Chrome");
        assert!(responder(&d, &nueva.id, el, "x", 3000).unwrap_err().contains("ya está contestada"));

        let t = como_texto(&leer(&d, &nueva.id).unwrap());
        assert!(t.contains("A) La barra: opción 2, «La de la portada»"), "{t}");
        assert!(t.contains("B) El menú: ninguna de las opciones. Con sus palabras: «ninguna, déjalo»"), "{t}");
        // Las pendientes van primero.
        assert_eq!(listar(&d)[0].id, otra.id);
        marcar_entregada(&d, &nueva.id);
        assert!(leer(&d, &nueva.id).unwrap().respuesta.unwrap().entregada);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn una_opcion_que_no_existe_no_vale() {
        let d = dir();
        let nueva = crear(&d, validar(&pedido(), 5, 1).unwrap()).unwrap();
        let mut el = BTreeMap::new();
        el.insert("A".to_string(), Eleccion { opcion: Some(3), texto: None });
        el.insert("B".to_string(), Eleccion { opcion: Some(1), texto: None });
        assert!(responder(&d, &nueva.id, el, "x", 6).unwrap_err().contains("no tiene opción 3"));
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn la_respuesta_solo_se_teclea_en_el_mismo_arranque() {
        let d = dir();
        let nueva = crear(&d, validar(&pedido(), 10, 77).unwrap()).unwrap();
        assert_eq!(a_teclear(&nueva, 77), None, "sin contestar no hay nada que teclear");
        // Lo que se le dice al móvil antes de enviar: la misma regla, y con su terminal abierta.
        assert!(se_teclearia(&nueva, 77, &[3]));
        assert!(!se_teclearia(&nueva, 77, &[4]), "con su terminal cerrada no se teclea");
        assert!(!se_teclearia(&nueva, 78, &[3]), "en otro arranque el panel 3 es otra terminal");
        // Hablada deja de esperarte, pero su respuesta se teclea igual.
        assert_eq!(marcar_habladas(&d, 3, 77, 15), vec![nueva.id.clone()]);
        let hablada = leer(&d, &nueva.id).unwrap();
        assert_eq!(vigencia(&hablada, 77, &[3]), Vigencia::Hablada);
        assert!(se_teclearia(&hablada, 77, &[3]));
        // Y lo que viaja a la app y al móvil lo dice, para seguir enseñándola arriba.
        assert!(con_vigencia(hablada.clone(), 77, &[3]).se_teclea);
        assert!(!con_vigencia(hablada.clone(), 77, &[4]).se_teclea, "con su terminal cerrada ya pasó");
        let mut el = BTreeMap::new();
        el.insert("A".to_string(), Eleccion { opcion: Some(1), texto: None });
        el.insert("B".to_string(), Eleccion { opcion: Some(2), texto: None });
        let hecha = responder(&d, &nueva.id, el, "el PC", 20).unwrap();
        let (panel, texto) = a_teclear(&hecha, 77).unwrap();
        assert_eq!(panel, 3);
        assert!(texto.starts_with("Munir ha contestado"), "{texto}");
        // Tras reabrir Adeorq el panel 3 puede ser otra terminal.
        assert_eq!(a_teclear(&hecha, 78), None);
        // Sin panel, el agente la lee con get_decision.
        let mut sin_panel = pedido();
        sin_panel.panel = None;
        let suelta = crear(&d, validar(&sin_panel, 30, 77).unwrap()).unwrap();
        let mut el = BTreeMap::new();
        el.insert("A".to_string(), Eleccion { opcion: Some(1), texto: None });
        el.insert("B".to_string(), Eleccion { opcion: None, texto: Some("ya veremos".into()) });
        assert_eq!(a_teclear(&responder(&d, &suelta.id, el, "el PC", 40).unwrap(), 77), None);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn un_id_raro_no_sale_del_almacen() {
        let d = dir();
        assert!(leer(&d, "../movil").is_none());
        assert!(leer(&d, "d12/../x").is_none());
        assert!(responder(&d, "..\\..\\algo", BTreeMap::new(), "x", 1).is_err());
        assert!(descartar(&d, "..\\..\\algo", 1).is_err());
    }

    /// Lo que pidió Munir el 2026-10-10: saber cuáles siguen activas. Solo
    /// espera la de una terminal que sigue abierta en este mismo arranque.
    #[test]
    fn solo_espera_la_de_una_terminal_que_sigue_abierta() {
        let d = dir();
        let suya = crear(&d, validar(&pedido(), 5000, 77).unwrap()).unwrap();
        assert_eq!(vigencia(&suya, 77, &[1, 3]), Vigencia::Viva);
        assert_eq!(vigencia(&suya, 77, &[1, 2]), Vigencia::Huerfana, "su terminal se cerró");
        assert_eq!(vigencia(&suya, 78, &[1, 3]), Vigencia::Huerfana, "el panel 3 de otro arranque es otra terminal");
        // Sin terminal apuntada no se puede mirar si sigue abierta: vale cuándo se pidió.
        let mut sin_panel = pedido();
        sin_panel.panel = None;
        let suelta = crear(&d, validar(&sin_panel, 6000, 77).unwrap()).unwrap();
        assert_eq!(vigencia(&suelta, 5500, &[]), Vigencia::Viva, "pedida después de abrir Adeorq");
        assert_eq!(vigencia(&suelta, 7000, &[]), Vigencia::Huerfana, "pedida antes de este arranque");

        // Descartada: deja de esperar, el agente lo lee, y ya no se contesta.
        assert_eq!(aviso_de_descarte(&suya, Vigencia::Huerfana), None, "a una terminal que no está no se le escribe");
        let fuera = descartar(&d, &suya.id, 9000).unwrap();
        assert_eq!(vigencia(&fuera, 77, &[3]), Vigencia::Descartada);
        let (panel, texto) = aviso_de_descarte(&fuera, Vigencia::Viva).unwrap();
        assert_eq!(panel, 3);
        assert!(texto.contains("ha descartado la decisión «Diseño de la guía»") && texto.contains("no esperes respuesta"), "{texto}");
        assert_eq!(descartar(&d, &suya.id, 9999).unwrap().descartada, Some(9000), "descartar otra vez no cambia nada");
        let mut el = BTreeMap::new();
        el.insert("A".to_string(), Eleccion { opcion: Some(1), texto: None });
        el.insert("B".to_string(), Eleccion { opcion: Some(1), texto: None });
        assert!(responder(&d, &suya.id, el.clone(), "x", 9500).unwrap_err().contains("descartada"));
        // Las cerradas van detrás de la que sigue abierta, y una contestada no se descarta.
        assert_eq!(listar(&d).iter().map(|x| x.id.as_str()).collect::<Vec<_>>(), [suelta.id.as_str(), suya.id.as_str()]);
        let hecha = responder(&d, &suelta.id, el, "x", 9600).unwrap();
        assert_eq!(vigencia(&hecha, 7000, &[]), Vigencia::Contestada);
        assert!(descartar(&d, &suelta.id, 9700).unwrap_err().contains("ya está contestada"));
        // Un archivo de antes de que existiera «descartada» se sigue leyendo.
        let viejo = serde_json::json!({ "id": "d1", "titulo": "Vieja", "creada": 1, "preguntas": [] });
        assert_eq!(serde_json::from_value::<Decision>(viejo).unwrap().descartada, None);
        let _ = std::fs::remove_dir_all(&d);
    }

    /// Lo que pidió Munir el 2026-10-11: «que se limpie sola». Escribirle a la
    /// terminal que preguntó la da por hablada, y lo que ya no espera a nadie
    /// se borra a la semana.
    #[test]
    fn hablarle_a_su_terminal_la_cierra_y_lo_viejo_se_va_solo() {
        let d = dir();
        let dia = 86_400_000u64;
        let suya = crear(&d, validar(&pedido(), 1000, 77).unwrap()).unwrap();
        let mut otro = pedido();
        otro.panel = Some(5);
        let de_otro = crear(&d, validar(&otro, 2000, 77).unwrap()).unwrap();
        let futura = crear(&d, validar(&pedido(), 9000, 77).unwrap()).unwrap();

        // Solo la de ESE panel, de este arranque y de antes de escribir.
        assert!(marcar_habladas(&d, 3, 78, 5000).is_empty(), "el panel 3 de otro arranque es otra terminal");
        assert_eq!(marcar_habladas(&d, 3, 77, 5000), [suya.id.clone()]);
        assert!(marcar_habladas(&d, 3, 77, 6000).is_empty(), "dos veces no la vuelve a marcar");
        let hablada = leer(&d, &suya.id).unwrap();
        assert_eq!(hablada.hablada, Some(5000));
        assert_eq!(vigencia(&hablada, 77, &[3, 5]), Vigencia::Hablada);
        assert_eq!(vigencia(&leer(&d, &de_otro.id).unwrap(), 77, &[3, 5]), Vigencia::Viva);
        assert_eq!(vigencia(&leer(&d, &futura.id).unwrap(), 77, &[3, 5]), Vigencia::Viva, "la que pregunta después sigue esperando");
        assert!(como_texto(&hablada).contains("te escribió en tu terminal"), "{}", como_texto(&hablada));
        // Se puede contestar todavía, y entonces es una contestada más.
        let mut el = BTreeMap::new();
        el.insert("A".to_string(), Eleccion { opcion: Some(1), texto: None });
        el.insert("B".to_string(), Eleccion { opcion: Some(1), texto: None });
        assert_eq!(vigencia(&responder(&d, &suya.id, el, "el PC", 7000).unwrap(), 77, &[3, 5]), Vigencia::Contestada);

        // La limpieza: una viva no se borra aunque sea vieja; lo demás, a la semana
        // de lo último que le pasó (la respuesta del 7000, no cuando se creó).
        assert_eq!(podar(&d, 77, &[3, 5], 7000 + 7 * dia), 0, "a los siete días justos sigue");
        assert_eq!(podar(&d, 77, &[3, 5], 7001 + 7 * dia), 1, "pasada la semana se va la contestada");
        assert!(leer(&d, &suya.id).is_none() && leer(&d, &de_otro.id).is_some() && leer(&d, &futura.id).is_some());
        // Se cierra el panel 5: su decisión ya no espera a nadie y también caduca.
        assert_eq!(podar(&d, 77, &[3], 2000 + 8 * dia), 1);
        assert!(leer(&d, &de_otro.id).is_none() && leer(&d, &futura.id).is_some());
        // Un archivo de antes de que existiera «hablada» se sigue leyendo.
        let viejo = serde_json::json!({ "id": "d1", "titulo": "Vieja", "creada": 1, "preguntas": [] });
        assert_eq!(serde_json::from_value::<Decision>(viejo).unwrap().hablada, None);
        let _ = std::fs::remove_dir_all(&d);
    }

    /// Lo del 2026-11-07: «por qué hay decisiones waiting for me en móvil que
    /// ya he decidido». La del escudo y su versión reescrita seguían vivas
    /// aunque las había contestado por el chat de otra sesión.
    #[test]
    fn la_que_se_resuelve_por_otra_via_o_se_sustituye_deja_de_esperar() {
        let d = dir();
        let primera = crear(&d, validar(&pedido(), 1000, 77).unwrap()).unwrap();
        let mut reescrita = pedido();
        reescrita.titulo = "Diseño de la guía (preguntas reescritas)".into();
        let segunda = crear(&d, validar(&reescrita, 2000, 77).unwrap()).unwrap();
        assert_eq!(vigencia(&primera, 77, &[3]), Vigencia::Viva);

        // La reescrita retira la de antes, y la de antes dice cuál la sustituye.
        let vieja = sustituir(&d, &primera.id, &segunda, 2000).unwrap();
        assert_eq!(vigencia(&vieja, 77, &[3]), Vigencia::Resuelta);
        assert_eq!(vieja.resuelta.as_ref().unwrap().sustituta.as_deref(), Some(segunda.id.as_str()));
        assert!(como_texto(&vieja).contains(&format!("la sustituye la {}", segunda.id)), "{}", como_texto(&vieja));

        // La respuesta llega por el chat: el agente la cierra con sus palabras.
        assert!(resolver(&d, &segunda.id, "   ", 3000).unwrap_err().contains("cómo se resolvió"));
        let hecha = resolver(&d, &segunda.id, "Me la pegó la Suprema: A1, B1.", 3000).unwrap();
        assert_eq!(vigencia(&hecha, 77, &[3]), Vigencia::Resuelta);
        assert!(como_texto(&hecha).contains("resuelta por otra vía: Me la pegó la Suprema: A1, B1."), "{}", como_texto(&hecha));
        assert_eq!(cuando_se_cerro(&hecha), Some(3000));
        assert_eq!(resolver(&d, &segunda.id, "otra cosa", 4000).unwrap().resuelta.unwrap().cuando, 3000, "dos veces no la cambia");

        // Ya no se contesta, ni se marca hablada, y descartarla no la cambia.
        let mut el = BTreeMap::new();
        el.insert("A".to_string(), Eleccion { opcion: Some(1), texto: None });
        el.insert("B".to_string(), Eleccion { opcion: Some(1), texto: None });
        assert!(responder(&d, &segunda.id, el.clone(), "x", 5000).unwrap_err().contains("resuelta por otra vía"));
        assert!(responder(&d, &primera.id, el.clone(), "x", 5000).unwrap_err().contains("la sustituye"));
        assert!(marcar_habladas(&d, 3, 77, 6000).is_empty());
        assert_eq!(descartar(&d, &segunda.id, 7000).unwrap().descartada, None);

        // Una contestada no la cierra el agente: esa respuesta es la buena.
        let tercera = crear(&d, validar(&pedido(), 8000, 77).unwrap()).unwrap();
        responder(&d, &tercera.id, el, "Android · Chrome", 8500).unwrap();
        assert!(resolver(&d, &tercera.id, "ya está", 9000).unwrap_err().contains("ya está contestada"));
        assert!(resolver(&d, "d999", "x", 9000).unwrap_err().contains("No hay ninguna decisión d999"));
        // Caducan como las demás: a la semana de cuando se resolvieron.
        assert_eq!(podar(&d, 77, &[3], 2000 + 7 * 86_400_000), 0, "a los siete días justos siguen");
        assert_eq!(podar(&d, 77, &[3], 2001 + 7 * 86_400_000), 1, "pasada la semana se va la primera");
        assert!(leer(&d, &primera.id).is_none() && leer(&d, &segunda.id).is_some());
        let _ = std::fs::remove_dir_all(&d);
    }

    pub(crate) fn png(ancho: u32, alto: u32) -> Vec<u8> {
        let mut b = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        b.extend(ancho.to_be_bytes());
        b.extend(alto.to_be_bytes());
        b.extend([8, 6, 0, 0, 0, 0, 0, 0, 0]);
        b
    }

    fn riff(trozo: &[u8], datos: &[u8]) -> Vec<u8> {
        let mut b = b"RIFF\0\0\0\0WEBP".to_vec();
        b.extend(trozo);
        b.extend((datos.len() as u32).to_le_bytes());
        b.extend(datos);
        b.extend([0; 8]);
        b
    }

    /// Las cuatro clases que se aceptan, leídas de sus bytes; lo demás no pasa.
    #[test]
    fn la_cabecera_dice_el_tipo_y_el_tamano() {
        assert_eq!(leer_cabecera(&png(1920, 1080)), Some(("image/png", "png", 1920, 1080)));
        let mut gif = b"GIF89a".to_vec();
        gif.extend([0x90, 0x01, 0x2c, 0x01, 0, 0]);
        assert_eq!(leer_cabecera(&gif), Some(("image/gif", "gif", 400, 300)));
        // Un JPEG con su APP0 delante y el tamaño en el SOF2 (progresivo).
        let mut jpg = vec![0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
        jpg.extend(b"JFIF\0\x01\x01\0\0\x01\0\x01\0\0");
        jpg.extend([0xff, 0xff, 0xc2, 0x00, 0x11, 0x08, 0x03, 0x20, 0x05, 0x00, 0x03, 0, 0, 0]);
        assert_eq!(leer_cabecera(&jpg), Some(("image/jpeg", "jpg", 1280, 800)));
        // El DHT (C4) no es un SOF aunque caiga entre ellos.
        let mut dht = vec![0xff, 0xd8, 0xff, 0xc4, 0x00, 0x04, 0x00, 0x00];
        dht.extend([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x0a, 0x00, 0x14, 0x03]);
        assert_eq!(leer_cabecera(&dht), Some(("image/jpeg", "jpg", 20, 10)));
        assert_eq!(leer_cabecera(&riff(b"VP8X", &[0, 0, 0, 0, 0x7f, 0x07, 0, 0x37, 0x04, 0])), Some(("image/webp", "webp", 1920, 1080)));
        let ancho_alto = (99u32) | (49u32 << 14);
        let mut l = vec![0x2f];
        l.extend(ancho_alto.to_le_bytes());
        assert_eq!(leer_cabecera(&riff(b"VP8L", &l)), Some(("image/webp", "webp", 100, 50)));
        assert_eq!(leer_cabecera(&riff(b"VP8 ", &[0, 0, 0, 0x9d, 0x01, 0x2a, 0x40, 0x01, 0xf0, 0x00])), Some(("image/webp", "webp", 320, 240)));
        // Un HTML con nombre de imagen, un PNG cortado y un JPEG sin tamaño, no.
        assert_eq!(leer_cabecera(b"<!doctype html><script>alert(1)</script>"), None);
        assert_eq!(leer_cabecera(&png(10, 10)[..20]), None);
        assert_eq!(leer_cabecera(&[0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]), None);
        assert_eq!(leer_cabecera(&[0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]), None);
    }

    /// Un JPEG del móvil guarda la foto tumbada y dice en su EXIF cómo girarla; el
    /// navegador la pinta girada, así que el hueco se guarda con la forma girada
    /// (revisión del 2026-11-19).
    #[test]
    fn un_jpeg_girado_por_exif_guarda_su_hueco_girado() {
        // FFD8, APP1 con «Exif» y un TIFF de una entrada (0x0112, la orientación), y el SOF0 de 300 × 100.
        let jpeg = |motorola: bool, orientacion: u16| {
            let (s16, s32): (fn(u16) -> [u8; 2], fn(u32) -> [u8; 4]) =
                if motorola { (u16::to_be_bytes, u32::to_be_bytes) } else { (u16::to_le_bytes, u32::to_le_bytes) };
            let mut tiff = if motorola { b"MM".to_vec() } else { b"II".to_vec() };
            tiff.extend(s16(42));
            tiff.extend(s32(8));
            tiff.extend(s16(1));
            tiff.extend(s16(0x0112));
            tiff.extend(s16(3));
            tiff.extend(s32(1));
            tiff.extend(s16(orientacion));
            tiff.extend([0, 0, 0, 0, 0, 0]);
            let mut app1 = b"Exif\0\0".to_vec();
            app1.extend(tiff);
            let mut b = vec![0xff, 0xd8, 0xff, 0xe1];
            b.extend(((app1.len() + 2) as u16).to_be_bytes());
            b.extend(app1);
            b.extend([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x01, 0x2c, 0x03]);
            b
        };
        for motorola in [false, true] {
            for o in 5..=8 {
                assert_eq!(leer_cabecera(&jpeg(motorola, o)), Some(("image/jpeg", "jpg", 100, 300)), "orientación {o}, MM {motorola}");
            }
            for o in [1, 2, 3, 4] {
                assert_eq!(leer_cabecera(&jpeg(motorola, o)), Some(("image/jpeg", "jpg", 300, 100)), "orientación {o}, MM {motorola}");
            }
        }
        // Un EXIF roto no tumba la cabecera: se queda con lo del SOF.
        let mut roto = jpeg(false, 6);
        roto[12] = b'X';
        assert_eq!(leer_cabecera(&roto), Some(("image/jpeg", "jpg", 300, 100)));
    }

    /// Una PNG también puede llevar EXIF, en su trozo `eXIf` antes de los datos,
    /// y Chromium la pinta girada como un JPEG; WebP no (medido en Chromium 157,
    /// revisión del 2026-11-19).
    #[test]
    fn una_png_girada_por_exif_guarda_su_hueco_girado() {
        let trozo = |tipo: &[u8; 4], datos: &[u8]| {
            let mut t = (datos.len() as u32).to_be_bytes().to_vec();
            t.extend(tipo);
            t.extend(datos);
            t.extend([0; 4]);
            t
        };
        let tiff = |orientacion: u16| {
            let mut t = b"MM\0\x2a\0\0\0\x08\0\x01\x01\x12\0\x03\0\0\0\x01".to_vec();
            t.extend(orientacion.to_be_bytes());
            t.extend([0; 6]);
            t
        };
        // IHDR de 300 × 100 (`png` ya lleva su CRC), el eXIf (con o sin el «Exif\0\0» que ponen algunos programas) y un IDAT.
        let png_con = |exif: Vec<u8>| {
            let mut b = png(300, 100);
            b.extend(trozo(b"eXIf", &exif));
            b.extend(trozo(b"IDAT", &[0; 8]));
            b
        };
        for o in 5..=8 {
            assert_eq!(leer_cabecera(&png_con(tiff(o))), Some(("image/png", "png", 100, 300)), "orientación {o}");
            let mut con_prefijo = b"Exif\0\0".to_vec();
            con_prefijo.extend(tiff(o));
            assert_eq!(leer_cabecera(&png_con(con_prefijo)), Some(("image/png", "png", 100, 300)), "orientación {o} con «Exif»");
        }
        assert_eq!(leer_cabecera(&png_con(tiff(1))), Some(("image/png", "png", 300, 100)));
        // Un eXIf roto, o un trozo que dice medir más de lo que hay, deja el tamaño del IHDR.
        assert_eq!(leer_cabecera(&png_con(b"XX\0\x2a".to_vec())), Some(("image/png", "png", 300, 100)));
        let mut cortada = png(300, 100);
        cortada.extend(u32::MAX.to_be_bytes());
        cortada.extend(b"eXIf");
        assert_eq!(leer_cabecera(&cortada), Some(("image/png", "png", 300, 100)));
    }

    /// Munir, 2026-11-19: «Tiene que haber una manera la cual se puedan ver las
    /// imagenes de las decisiones». La imagen se copia al almacén (el
    /// scratchpad de la sesión se borra), se sirve por id y número y se va con
    /// la decisión.
    #[test]
    fn las_imagenes_se_copian_se_sirven_y_se_van_con_la_decision() {
        let d = dir();
        let raiz = dir();
        std::fs::create_dir_all(&raiz).unwrap();
        let raices = [raiz.canonicalize().unwrap()];
        let foto = png(800, 600);
        std::fs::write(raiz.join("a.png"), &foto).unwrap();
        let mut gif = b"GIF89a".to_vec();
        gif.extend([20, 0, 10, 0, 0, 0]);
        std::fs::write(raiz.join("b.gif"), &gif).unwrap();

        let mut p = pedido();
        p.preguntas[0].opciones[1].imagen = Some(raiz.join("a.png").display().to_string());
        p.preguntas[1].imagen = Some(raiz.join("b.gif").display().to_string());
        p.preguntas[1].opciones[0].imagen = Some("   ".into());
        let mut nueva = validar(&p, 1000, 77).unwrap();
        let imgs = preparar_imagenes(&p, &mut nueva, &raices).unwrap();
        assert_eq!(imgs.cuantas(), 2, "una ruta en blanco es que no lleva imagen");
        assert_eq!(nueva.preguntas[0].opciones[1].imagen, Some(Imagen { n: 1, tipo: "image/png".into(), ancho: 800, alto: 600 }));
        assert_eq!(nueva.preguntas[1].imagen, Some(Imagen { n: 2, tipo: "image/gif".into(), ancho: 20, alto: 10 }));
        assert_eq!(nueva.preguntas[0].opciones[0].imagen, None);
        let hecha = crear_con_imagenes(&d, nueva, imgs).unwrap();

        // El original se puede borrar: lo que se sirve es la copia.
        std::fs::remove_file(raiz.join("a.png")).unwrap();
        assert_eq!(imagen(&d, &hecha.id, 1), Some(("image/png", foto)));
        assert_eq!(imagen(&d, &hecha.id, 2), Some(("image/gif", gif)));
        assert_eq!(imagen(&d, &hecha.id, 3), None, "un número que no es de la decisión");
        assert_eq!(imagen(&d, &hecha.id, 0), None);
        assert_eq!(imagen(&d, "../decisiones", 1), None);
        assert_eq!(imagen(&d, "d1", 1), None, "una decisión que no existe");
        // Se guarda en el JSON, y la carpeta no cuenta como otra decisión.
        assert_eq!(leer(&d, &hecha.id).unwrap().preguntas[1].imagen.as_ref().map(|i| i.n), Some(2));
        assert_eq!(listar(&d).len(), 1);
        // Un archivo de antes de las imágenes se sigue leyendo.
        let viejo = serde_json::json!({ "id": "d1", "titulo": "Vieja", "creada": 1, "preguntas": [
            { "id": "A", "titulo": "¿Cuál?", "opciones": [{ "texto": "Una" }, { "texto": "Otra" }] }
        ] });
        assert_eq!(serde_json::from_value::<Decision>(viejo).unwrap().preguntas[0].opciones[0].imagen, None);

        // Al podarla se va también su carpeta.
        descartar(&d, &hecha.id, 2000).unwrap();
        assert!(d.join(&hecha.id).is_dir());
        assert_eq!(podar(&d, 77, &[3], 2001 + 7 * 86_400_000), 1);
        assert!(!d.join(&hecha.id).exists());
        assert_eq!(imagen(&d, &hecha.id, 1), None);
        let _ = std::fs::remove_dir_all(&d);
        let _ = std::fs::remove_dir_all(&raiz);
    }

    /// Una ruta mala es un error que dice cuál y por qué, y no se guarda nada.
    #[test]
    fn una_imagen_mala_no_deja_una_decision_a_medias() {
        let d = dir();
        let raiz = dir();
        let fuera = dir();
        std::fs::create_dir_all(raiz.join("bunker")).unwrap();
        std::fs::create_dir_all(&fuera).unwrap();
        let raices = [raiz.canonicalize().unwrap()];
        std::fs::write(raiz.join("bien.png"), png(10, 10)).unwrap();
        std::fs::write(raiz.join("bunker").join("x.png"), png(10, 10)).unwrap();
        std::fs::write(fuera.join("y.png"), png(10, 10)).unwrap();
        std::fs::write(raiz.join("nota.txt"), "hola").unwrap();
        std::fs::write(raiz.join("pagina.html"), "<p>hola</p>").unwrap();
        std::fs::write(raiz.join("falsa.png"), "<!doctype html><script>alert(1)</script>").unwrap();
        std::fs::write(raiz.join("enorme.png"), png(20_000, 10)).unwrap();
        let mut pesada = png(10, 10);
        pesada.resize(TOPE_IMAGEN + 1, 0);
        std::fs::write(raiz.join("pesada.png"), pesada).unwrap();

        let intento = |ruta: String| {
            let mut p = pedido();
            p.preguntas[0].opciones[0].imagen = Some(raiz.join("bien.png").display().to_string());
            p.preguntas[1].opciones[1].imagen = Some(ruta);
            let mut nueva = validar(&p, 1000, 77).unwrap();
            preparar_imagenes(&p, &mut nueva, &raices).map(|_| ()).unwrap_err()
        };
        let e = intento("bien.png".into());
        assert!(e.starts_with("La imagen de la opción 2 de la pregunta B: ") && e.contains("ruta entera"), "{e}");
        assert!(intento(raiz.join("bunker").join("x.png").display().to_string()).contains("carpeta protegida"));
        assert!(intento(fuera.join("y.png").display().to_string()).contains("Solo se comparte lo que está en"));
        assert!(intento(raiz.join("no-existe.png").display().to_string()).contains("No encuentro"));
        assert!(intento(raiz.join("nota.txt").display().to_string()).contains("no es una imagen"));
        assert!(intento(raiz.join("pagina.html").display().to_string()).contains("no es una imagen"));
        assert!(intento(raiz.join("falsa.png").display().to_string()).contains("de verdad"));
        assert!(intento(raiz.join("enorme.png").display().to_string()).contains("cada lado"));
        assert!(intento(raiz.join("pesada.png").display().to_string()).contains("como mucho 8 MB por imagen"));
        assert!(intento(raiz.to_string_lossy().into_owned()).contains("nunca una carpeta"));

        // Juntas tampoco pasan de su tope, aunque cada una quepa.
        let mut grande = png(10, 10);
        grande.resize(7 * 1024 * 1024, 0);
        std::fs::write(raiz.join("grande.png"), grande).unwrap();
        let mut p = pedido();
        let grande = raiz.join("grande.png").display().to_string();
        p.preguntas[0].opciones = (0..6).map(|i| PedidoOpcion { texto: format!("Variante {i}"), imagen: Some(grande.clone()), ..Default::default() }).collect();
        let mut nueva = validar(&p, 1000, 77).unwrap();
        assert!(preparar_imagenes(&p, &mut nueva, &raices).unwrap_err().contains("pesan demasiado juntas"));

        // Nada de lo anterior escribió en el almacén.
        assert!(!d.exists());
        for c in [&raiz, &fuera] {
            let _ = std::fs::remove_dir_all(c);
        }
    }

    fn ahora_de_verdad() -> u64 {
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64
    }

    fn con_una_imagen(raiz: &Path, creada: u64) -> (Decision, Imagenes) {
        let raices = [raiz.canonicalize().unwrap()];
        let mut p = pedido();
        p.preguntas[0].imagen = Some(raiz.join("a.png").display().to_string());
        let mut nueva = validar(&p, creada, 77).unwrap();
        let imgs = preparar_imagenes(&p, &mut nueva, &raices).unwrap();
        (nueva, imgs)
    }

    /// Lo que queda a medias si la app se cae al guardar, o si falla un
    /// renombrado o un borrado: una carpeta sin su decisión o una temporal. La
    /// poda la barre pasado un rato, nunca la de una que se está creando ahora.
    #[test]
    fn podar_barre_las_carpetas_que_se_quedaron_sin_su_decision() {
        let d = dir();
        let raiz = dir();
        std::fs::create_dir_all(&raiz).unwrap();
        std::fs::write(raiz.join("a.png"), png(10, 10)).unwrap();
        let (nueva, imgs) = con_una_imagen(&raiz, 1000);
        let viva = crear_con_imagenes(&d, nueva, imgs).unwrap();
        let sueltas = ["d1234", "d1235.imagenes.tmp", "d1236.99-1-5.imagenes.tmp"];
        for s in sueltas.iter().chain(&["otra"]) {
            std::fs::create_dir_all(d.join(s)).unwrap();
            std::fs::write(d.join(s).join("1.png"), png(10, 10)).unwrap();
        }
        let ahora = ahora_de_verdad();
        podar(&d, 77, &[3], ahora);
        assert!(sueltas.iter().all(|s| d.join(s).exists()), "recién hechas pueden ser de una que se está guardando");
        podar(&d, 77, &[3], ahora + 2 * 3_600_000);
        for s in sueltas {
            assert!(!d.join(s).exists(), "{s} se quedó para siempre");
        }
        assert!(d.join("otra").exists(), "lo que no es del almacén no se toca");
        assert_eq!(imagen(&d, &viva.id, 1).map(|(t, _)| t), Some("image/png"), "la de una decisión que sigue, tampoco");
        let _ = std::fs::remove_dir_all(&d);
        let _ = std::fs::remove_dir_all(&raiz);
    }

    /// Dos decisiones con imágenes en el mismo milisegundo sacan el mismo id: cada
    /// una prepara sus imágenes en su propia carpeta temporal y la segunda corre
    /// el id. Antes compartían `<id>.imagenes.tmp` y una borraba la de la otra.
    #[test]
    fn dos_decisiones_del_mismo_milisegundo_no_se_pisan_las_imagenes() {
        let d = dir();
        let raiz = dir();
        std::fs::create_dir_all(&raiz).unwrap();
        std::fs::write(raiz.join("a.png"), png(10, 10)).unwrap();
        // La temporal de otra que se está guardando con ese mismo id.
        let (nueva, imgs) = con_una_imagen(&raiz, 5000);
        let ajena = d.join(format!("{}.imagenes.tmp", nueva.id));
        std::fs::create_dir_all(&ajena).unwrap();
        std::fs::write(ajena.join("1.png"), png(20, 20)).unwrap();
        crear_con_imagenes(&d, nueva, imgs).unwrap();
        assert!(ajena.join("1.png").exists(), "se borró la carpeta temporal de otra decisión");

        // Y a la vez de verdad: ocho hilos con el mismo milisegundo.
        let barrera = std::sync::Barrier::new(8);
        let hechas: Vec<Decision> = std::thread::scope(|s| {
            let hilos: Vec<_> = (0..8)
                .map(|_| {
                    s.spawn(|| {
                        let (nueva, imgs) = con_una_imagen(&raiz, 9000);
                        barrera.wait();
                        crear_con_imagenes(&d, nueva, imgs)
                    })
                })
                .collect();
            hilos.into_iter().map(|h| h.join().unwrap().unwrap()).collect()
        });
        let mut ids: Vec<&str> = hechas.iter().map(|x| x.id.as_str()).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), 8, "dos se quedaron con el mismo id");
        for h in &hechas {
            assert!(imagen(&d, &h.id, 1).is_some(), "{} sin su imagen", h.id);
        }
        let _ = std::fs::remove_dir_all(&d);
        let _ = std::fs::remove_dir_all(&raiz);
    }

    /// Cada lado cabe y aun así son demasiados píxeles: 16.384 × 16.384 es un
    /// giga de memoria al descodificarla en el móvil (revisión del 2026-11-19).
    #[test]
    fn una_imagen_no_pasa_de_su_tope_de_pixeles() {
        let raiz = dir();
        std::fs::create_dir_all(&raiz).unwrap();
        let raices = [raiz.canonicalize().unwrap()];
        std::fs::write(raiz.join("cuadrada.png"), png(16_000, 16_000)).unwrap();
        std::fs::write(raiz.join("justa.png"), png(5_000, 5_000)).unwrap();
        std::fs::write(raiz.join("pagina-larga.png"), png(1_440, 16_000)).unwrap();
        let prueba = |nombre: &str| {
            let mut p = pedido();
            p.preguntas[0].imagen = Some(raiz.join(nombre).display().to_string());
            let mut nueva = validar(&p, 1000, 77).unwrap();
            preparar_imagenes(&p, &mut nueva, &raices).map(|_| ())
        };
        let e = prueba("cuadrada.png").unwrap_err();
        assert!(e.contains("256 megapíxeles") && e.contains("como mucho 25"), "{e}");
        assert!(prueba("justa.png").is_ok(), "25 megapíxeles justos caben");
        // Una página entera hecha captura sí entra: es para lo que sirve.
        assert!(prueba("pagina-larga.png").is_ok());
        let _ = std::fs::remove_dir_all(&raiz);
    }

    /// Lo que no vale como imagen lo dice con las reglas de las imágenes, no con
    /// las de compartir en el móvil: allí caben 25 MB y una página HTML, aquí
    /// ninguna de las dos (revisión del 2026-11-19).
    #[test]
    fn los_errores_de_una_imagen_dicen_su_tope_y_sus_tipos() {
        let raiz = dir();
        std::fs::create_dir_all(&raiz).unwrap();
        let raices = [raiz.canonicalize().unwrap()];
        std::fs::write(raiz.join("nota.txt"), "hola").unwrap();
        std::fs::write(raiz.join("pagina.html"), "<p>hola</p>").unwrap();
        // Más que el tope de compartir: antes decía «como mucho 25 MB».
        let f = std::fs::File::create(raiz.join("enorme.png")).unwrap();
        f.set_len(crate::compartidos::TOPE_BYTES + 1).unwrap();
        drop(f);
        let error = |nombre: &str| {
            let mut p = pedido();
            p.preguntas[0].imagen = Some(raiz.join(nombre).display().to_string());
            let mut nueva = validar(&p, 1000, 77).unwrap();
            preparar_imagenes(&p, &mut nueva, &raices).map(|_| ()).unwrap_err()
        };
        for nombre in ["nota.txt", "pagina.html"] {
            let e = error(nombre);
            assert!(e.contains("png, jpg, webp o gif") && !e.contains("HTML"), "{nombre}: {e}");
        }
        let e = error("enorme.png");
        assert!(e.contains("como mucho 8 MB por imagen") && !e.contains("25 MB"), "{e}");
        let _ = std::fs::remove_dir_all(&raiz);
    }
}
