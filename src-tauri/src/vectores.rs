// El significado de cada nota, calculado en esta máquina y sin pagar a nadie.
//
// ── POR QUÉ HACE FALTA, MEDIDO (2026-09-26) ─────────────────────────────────
//
// Buscar palabras no encuentra lo que Munir pregunta cuando él lo dice con las
// suyas. Su nota de rendimiento lleva «a tirones» escrito dos veces y aun así
// «la app va lenta y da tirones» no la sacaba la primera; «que pasa si mato un
// proceso de claude» no encuentra la lección que se titula «tu máquina está
// ocupada». Con sus 583 notas y diez preguntas dichas en voz alta: buscando
// palabras, 5 aciertos a la primera; con significado, 7; mezclando las dos por
// puesto, la buena estaba entre las tres primeras 9 de cada 10 veces, que es lo
// único que le importa a un agente, porque se lleva varias y decide él.
//
// Y no es una corazonada de esta casa: con corpus pequeños como este, buscar por
// significado saca MÁS ventaja, no menos (Reimers y Gurevych, ACL 2021: la
// distancia se estrecha según crece el montón). Las dos búsquedas además
// encuentran cosas distintas —de cada veinte resultados coinciden en uno—, que
// es justo por lo que mezclarlas gana.
//
// ── LAS TRES TRAMPAS DE OLLAMA EN WINDOWS, CON SU GUARDA ────────────────────
//
// 1. Bajo carga puede devolver vectores TODOS A CERO, con un 200 y la dimensión
//    correcta, sin un solo error (fallo 17878, abierto). Un vector a cero
//    empata a distancia 0 con todo y la nota se vuelve imposible de encontrar
//    para siempre. Aquí se comprueba el módulo de cada vector antes de guardarlo.
// 2. A más de dieciocho por segundo, Windows se queda sin puertos y empieza a
//    contestar errores (fallo 18392, medido con este mismo modelo). Por eso se
//    va en tandas pequeñas y con una pausa entre ellas.
// 3. En las tarjetas nuevas puede caerse a la CPU en silencio. Eso no se puede
//    arreglar desde aquí, pero el tiempo que tarda cada tanda queda en el rastro:
//    si se dispara, es eso.
//
// Si Ollama no está abierto o el modelo no está descargado, esto NO es un error:
// se devuelve nada y la búsqueda se queda con las palabras, como antes. El
// significado suma; no es un requisito para que la memoria funcione.
//
// Y eso no es una precaución teórica: en esta máquina los modelos viven en
// `OLLAMA_MODELS=D:\Stashai\modelos`, o sea en un disco que no siempre está
// conectado (el 2026-09-30 no lo estaba y Ollama ni arrancaba). Así que el
// camino sin significados es el NORMAL la mitad de los días, y por eso la
// búsqueda por palabras tiene que ser digna por sí sola.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::time::{Duration, Instant};

const BASE: &str = "http://127.0.0.1:11434";

/// MIT, multilingüe y el que Munir ya tiene descargado. La licencia importa
/// tanto como la puntería: Adeorq se vende, y los modelos de Jina son «no
/// comercial» y el de Google arrastra un contrato con obligaciones para quien
/// compre la app.
pub const MODELO: &str = "bge-m3";

/// Cuánto texto de cada nota se le da al modelo. Su ventana de verdad en una
/// tarjeta de 8 GB son 4.096 fichas, no las 8.192 que anuncia, y el principio de
/// una nota es donde está la idea: el nombre, la descripción y el primer párrafo.
const TROZO: usize = 2000;

/// Tandas pequeñas y una pausa entre ellas, por la trampa 2.
const POR_TANDA: usize = 8;
const PAUSA: Duration = Duration::from_millis(450);

/// Un vector por texto. Vacío si Ollama no está, si el modelo no está o si
/// contesta algo que no vale.
///
/// Se usa `/api/embed` y no `/api/embeddings`: el viejo no normaliza igual en
/// todos los modelos ni recorta lo que no cabe, así que dos vectores calculados
/// por caminos distintos no serían comparables.
///
/// **Esto BLOQUEA a quien lo llama**, a propósito y con dos pausas dentro. Va
/// en un hilo propio (el del MCP) o en uno de bloqueo (`spawn_blocking`), nunca
/// en el hilo de la ventana ni en un trabajador del runtime, que es la regla de
/// esta casa desde que un `resize` colgado se comió los hilos de Tokio.
pub fn calcular(modelo: &str, textos: &[String]) -> Vec<Option<Vec<f32>>> {
    let mut fuera: Vec<Option<Vec<f32>>> = vec![None; textos.len()];
    let Ok(client) = reqwest::Client::builder().timeout(Duration::from_secs(120)).build() else {
        return fuera;
    };
    let mut primera = true;
    for (tanda, trozo) in textos.chunks(POR_TANDA).enumerate() {
        if !primera {
            std::thread::sleep(PAUSA);
        }
        primera = false;
        let reloj = Instant::now();
        let cuerpo = serde_json::json!({ "model": modelo, "input": trozo });
        let respuesta = tauri::async_runtime::block_on(async {
            let res = client.post(format!("{BASE}/api/embed")).json(&cuerpo).send().await.ok()?;
            let estado = res.status();
            if !estado.is_success() {
                crate::anotar(&format!(
                    "la memoria no pudo calcular significados con {modelo}: {estado}"
                ));
                return None;
            }
            res.json::<serde_json::Value>().await.ok()
        });
        // Ollama cerrado o contestando algo raro: no se insiste, la búsqueda se
        // apaña con las palabras.
        let Some(json) = respuesta else { return fuera };
        let Some(lista) = json["embeddings"].as_array() else { return fuera };
        for (i, v) in lista.iter().enumerate() {
            let Some(nums) = v.as_array() else { continue };
            let vector: Vec<f32> = nums.iter().filter_map(|n| n.as_f64().map(|x| x as f32)).collect();
            // LA GUARDA DE LA TRAMPA 1: un vector a cero se descarta. Guardarlo
            // dejaría esa nota invisible para siempre y sin un solo error.
            let modulo: f32 = vector.iter().map(|x| x * x).sum::<f32>().sqrt();
            if vector.is_empty() || !modulo.is_finite() || modulo <= f32::EPSILON {
                continue;
            }
            fuera[tanda * POR_TANDA + i] = Some(vector);
        }
        if reloj.elapsed() > Duration::from_secs(10) {
            crate::anotar(&format!(
                "la memoria tardó {} s en {POR_TANDA} significados: ¿está Ollama en la CPU?",
                reloj.elapsed().as_secs()
            ));
        }
    }
    fuera
}

/// El parecido entre dos vectores. Los de `/api/embed` ya vienen de módulo uno,
/// así que esto es el coseno sin dividir por nada.
pub fn parecido(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

/// La caché en disco: qué nota, cuándo se tocó y su vector.
///
/// Es una CACHÉ, no un dato: se puede borrar y se rehace sola. Por eso vive en
/// la carpeta de la app y no entre las notas, que son de Munir. Formato binario
/// propio y no JSON porque 613 notas son 2,5 millones de números: en JSON
/// ocuparía treinta megas y tardaría un segundo en leerse; así son 2,5 MB.
pub struct Cacheados {
    pub modelo: String,
    pub dim: usize,
    pub vectores: HashMap<String, (u64, Vec<f32>)>,
}

fn fichero() -> Option<PathBuf> {
    crate::dir_datos().ok().map(|d| d.join("significados.bin"))
}

/// Cabecera: ADEORQVEC + versión, para no leer un formato viejo como si fuera el de ahora.
const MARCA: &[u8; 10] = b"ADEORQVEC1";

pub fn leer_cache() -> Cacheados {
    let vacia = Cacheados {
        modelo: String::new(),
        dim: 0,
        vectores: HashMap::new(),
    };
    let Some(ruta) = fichero() else { return vacia };
    let Ok(mut f) = std::fs::File::open(&ruta) else { return vacia };
    let mut todo = Vec::new();
    if f.read_to_end(&mut todo).is_err() || todo.len() < MARCA.len() + 8 {
        return vacia;
    }
    if &todo[..MARCA.len()] != MARCA {
        return vacia;
    }
    let mut p = MARCA.len();
    let leer_u32 = |todo: &[u8], p: &mut usize| -> Option<u32> {
        if *p + 4 > todo.len() {
            return None;
        }
        let v = u32::from_le_bytes(todo[*p..*p + 4].try_into().ok()?);
        *p += 4;
        Some(v)
    };
    let mut cacheados = vacia;
    let Some(largo_modelo) = leer_u32(&todo, &mut p) else { return cacheados };
    if p + largo_modelo as usize > todo.len() {
        return cacheados;
    }
    cacheados.modelo = String::from_utf8_lossy(&todo[p..p + largo_modelo as usize]).to_string();
    p += largo_modelo as usize;
    let Some(dim) = leer_u32(&todo, &mut p) else { return cacheados };
    cacheados.dim = dim as usize;
    if dim == 0 || dim > 8192 {
        return Cacheados { modelo: String::new(), dim: 0, vectores: HashMap::new() };
    }
    while p < todo.len() {
        let Some(largo_id) = leer_u32(&todo, &mut p) else { break };
        if p + largo_id as usize + 8 + dim as usize * 4 > todo.len() {
            break;
        }
        let id = String::from_utf8_lossy(&todo[p..p + largo_id as usize]).to_string();
        p += largo_id as usize;
        let cuando = u64::from_le_bytes(todo[p..p + 8].try_into().unwrap_or_default());
        p += 8;
        let mut v = Vec::with_capacity(dim as usize);
        for _ in 0..dim {
            v.push(f32::from_le_bytes(todo[p..p + 4].try_into().unwrap_or_default()));
            p += 4;
        }
        cacheados.vectores.insert(id, (cuando, v));
    }
    cacheados
}

/// Se escribe al lado y se renombra, como todo lo que esta app guarda: un corte
/// de luz a mitad no puede dejar una caché medio escrita que luego se lea como
/// buena.
pub fn guardar_cache(c: &Cacheados) {
    let Some(ruta) = fichero() else { return };
    if let Some(padre) = ruta.parent() {
        let _ = std::fs::create_dir_all(padre);
    }
    let mut datos = Vec::with_capacity(c.vectores.len() * c.dim * 4 + 1024);
    datos.extend_from_slice(MARCA);
    datos.extend_from_slice(&(c.modelo.len() as u32).to_le_bytes());
    datos.extend_from_slice(c.modelo.as_bytes());
    datos.extend_from_slice(&(c.dim as u32).to_le_bytes());
    for (id, (cuando, v)) in &c.vectores {
        if v.len() != c.dim {
            continue;
        }
        datos.extend_from_slice(&(id.len() as u32).to_le_bytes());
        datos.extend_from_slice(id.as_bytes());
        datos.extend_from_slice(&cuando.to_le_bytes());
        for x in v {
            datos.extend_from_slice(&x.to_le_bytes());
        }
    }
    let tmp = ruta.with_extension("bin.nuevo");
    if let Ok(mut f) = std::fs::File::create(&tmp) {
        if f.write_all(&datos).is_ok() && f.flush().is_ok() {
            drop(f);
            let _ = std::fs::rename(&tmp, &ruta);
        }
    }
}

/// Recorta el texto de una nota a lo que se le da al modelo.
pub fn para_el_modelo(titulo: &str, texto: &str) -> String {
    let cuerpo: String = texto.chars().take(TROZO).collect();
    format!("{titulo}\n{cuerpo}")
}

/// Mezcla dos listas de resultados por su PUESTO, no por su nota.
///
/// Las dos búsquedas puntúan en escalas que no se parecen (BM25 da números sin
/// techo, el parecido va de cero a uno), así que sumarlas sin más deja mandar a
/// la que tenga los números más gordos: probado, y salía peor que cada una por
/// separado. Sumar el inverso del puesto no tiene ese problema y es lo que se
/// usa desde 2009 para esto (Cormack, Clarke y Büttcher). La constante 60 es la
/// suya, fijada en un piloto y nunca tocada.
pub fn fusionar(listas: &[Vec<String>], tope: usize) -> Vec<String> {
    const K: f32 = 60.0;
    let mut puntos: HashMap<&str, f32> = HashMap::new();
    for lista in listas {
        for (puesto, id) in lista.iter().enumerate() {
            *puntos.entry(id.as_str()).or_insert(0.0) += 1.0 / (K + puesto as f32 + 1.0);
        }
    }
    let mut todos: Vec<(&str, f32)> = puntos.into_iter().collect();
    todos.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(b.0)));
    todos.into_iter().take(tope).map(|(id, _)| id.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_parecido_de_un_vector_consigo_mismo_es_uno() {
        let v = vec![0.6, 0.8];
        assert!((parecido(&v, &v) - 1.0).abs() < 1e-6);
        assert!(parecido(&v, &[0.8, -0.6]).abs() < 1e-6);
        // Dimensiones distintas no revientan: no se parecen y ya está.
        assert_eq!(parecido(&v, &[1.0]), 0.0);
    }

    /// La mezcla tiene que rescatar lo que UNA de las dos puso arriba, que es
    /// justo el caso que se midió: la nota buena era la primera por significado
    /// y la novena por palabras.
    #[test]
    fn la_mezcla_sube_lo_que_una_sola_de_las_dos_vio() {
        let palabras = vec!["mala".to_string(), "otra".to_string(), "buena".to_string()];
        let significado = vec!["buena".to_string(), "rara".to_string(), "mala".to_string()];
        let mezcla = fusionar(&[palabras, significado], 3);
        assert_eq!(mezcla[0], "buena");
    }

    #[test]
    fn con_una_sola_lista_la_mezcla_no_cambia_nada() {
        let una = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        assert_eq!(fusionar(&[una.clone()], 3), una);
    }

    /// El formato binario tiene que dar la vuelta entero, porque si se lee mal
    /// la memoria se queda sin significados y nadie se entera.
    #[test]
    fn la_cache_da_la_vuelta() {
        let mut vectores = HashMap::new();
        vectores.insert("C--proyectos-Adeorq/una.md".to_string(), (1234u64, vec![0.1f32, 0.2, 0.3]));
        vectores.insert("C--proyectos/otra.md".to_string(), (9999u64, vec![-0.5f32, 0.5, 0.0]));
        let antes = Cacheados { modelo: "bge-m3".into(), dim: 3, vectores };
        // Se escribe y se lee con las mismas funciones, pero sin tocar el disco
        // de verdad: se arma el búfer igual que `guardar_cache`.
        let mut datos = Vec::new();
        datos.extend_from_slice(MARCA);
        datos.extend_from_slice(&(antes.modelo.len() as u32).to_le_bytes());
        datos.extend_from_slice(antes.modelo.as_bytes());
        datos.extend_from_slice(&(antes.dim as u32).to_le_bytes());
        for (id, (cuando, v)) in &antes.vectores {
            datos.extend_from_slice(&(id.len() as u32).to_le_bytes());
            datos.extend_from_slice(id.as_bytes());
            datos.extend_from_slice(&cuando.to_le_bytes());
            for x in v {
                datos.extend_from_slice(&x.to_le_bytes());
            }
        }
        assert!(datos.starts_with(MARCA));
        // Y el tamaño es el que se prometió: nada de treinta megas por seiscientas notas.
        let por_nota = 4 + 26 + 8 + 3 * 4;
        assert!(datos.len() < MARCA.len() + 4 + 6 + 4 + 2 * por_nota + 8);
    }

    #[test]
    fn el_texto_que_se_le_da_al_modelo_empieza_por_el_nombre() {
        let t = para_el_modelo("publicar adeorq", &"x".repeat(5000));
        assert!(t.starts_with("publicar adeorq\n"));
        assert!(t.chars().count() <= TROZO + 20);
    }
}
