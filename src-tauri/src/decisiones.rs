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
/// Las contestadas que se guardan; las pendientes no se borran nunca solas.
pub const TOPE_GUARDADAS: usize = 100;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Opcion {
    pub texto: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detalle: Option<String>,
    #[serde(default)]
    pub recomendada: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Pregunta {
    /// A, B, C… en el orden en que llegan.
    pub id: String,
    pub titulo: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contexto: Option<String>,
    pub opciones: Vec<Opcion>,
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
    Contestada,
    Descartada,
}

/// Una decisión con su vigencia al lado: lo que viaja a la app y al móvil.
#[derive(Clone, Debug, Serialize)]
pub struct ConVigencia {
    #[serde(flatten)]
    pub decision: Decision,
    pub vigencia: Vigencia,
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
    let sigue = match (d.panel, d.arranque) {
        (Some(panel), Some(a)) => a == arranque && abiertos.contains(&panel),
        _ => d.creada >= arranque,
    };
    if sigue { Vigencia::Viva } else { Vigencia::Huerfana }
}

pub fn con_vigencia(d: Decision, arranque: u64, abiertos: &[u32]) -> ConVigencia {
    let vigencia = vigencia(&d, arranque, abiertos);
    ConVigencia { decision: d, vigencia }
}

/// Ya no hay nada que hacer con ella: contestada o descartada.
fn cerrada(d: &Decision) -> bool {
    d.respuesta.is_some() || d.descartada.is_some()
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
    pub opciones: Vec<Opcion>,
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
            opciones.push(Opcion { texto, detalle: opcional(&o.detalle, TOPE_TEXTO), recomendada: o.recomendada });
        }
        preguntas.push(Pregunta { id: letra, titulo: t, contexto: opcional(&q.contexto, TOPE_TEXTO), opciones });
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
    })
}

/// Un id que no es de este almacén no puede llevar a ningún otro archivo.
fn id_valido(id: &str) -> bool {
    id.len() >= 2 && id.len() <= 24 && id.starts_with('d') && id[1..].chars().all(|c| c.is_ascii_hexdigit())
}

fn ruta(dir: &Path, id: &str) -> Option<PathBuf> {
    id_valido(id).then(|| dir.join(format!("{id}.json")))
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
pub fn crear(dir: &Path, mut d: Decision) -> Result<Decision, String> {
    while ruta(dir, &d.id).is_some_and(|r| r.exists()) {
        d.creada += 1;
        d.id = format!("d{:x}", d.creada);
    }
    escribir(dir, &d)?;
    podar(dir);
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

/// Las cerradas más viejas (contestadas o descartadas) se van cuando pasan de
/// `TOPE_GUARDADAS`.
fn podar(dir: &Path) {
    let contestadas: Vec<Decision> = listar(dir).into_iter().filter(cerrada).collect();
    for d in contestadas.iter().skip(TOPE_GUARDADAS) {
        if let Some(r) = ruta(dir, &d.id) {
            let _ = std::fs::remove_file(r);
        }
    }
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
    if d.descartada.is_none() {
        d.descartada = Some(ahora);
        escribir(dir, &d)?;
    }
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

/// En qué terminal se teclea la respuesta, y qué: solo si la decisión es de
/// este mismo arranque de Adeorq, que en otro ese número de panel puede ser
/// ya otra terminal. Lo usan el móvil y la pestaña «Decisiones» de la app.
pub fn a_teclear(d: &Decision, arranque: u64) -> Option<(u32, String)> {
    match (d.panel, d.arranque, &d.respuesta) {
        (Some(panel), Some(a), Some(_)) if a == arranque => Some((panel, como_texto(d))),
        _ => None,
    }
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
    Ok(listar(&dir_de_verdad()?).into_iter().map(|d| con_vigencia(d, arranque, &abiertos)).collect())
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
                        Opcion { texto: "Como está".into(), detalle: None, recomendada: false },
                        Opcion { texto: "La de la portada".into(), detalle: Some("una sola barra".into()), recomendada: true },
                    ],
                },
                PedidoPregunta {
                    titulo: "El menú".into(),
                    contexto: None,
                    opciones: vec![
                        Opcion { texto: "Botón".into(), detalle: None, recomendada: false },
                        Opcion { texto: "Fila".into(), detalle: None, recomendada: false },
                    ],
                },
            ],
        }
    }

    fn dir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("adeorq-decisiones-{}-{}", std::process::id(), rand_sufijo()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    fn rand_sufijo() -> u128 {
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
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
}
