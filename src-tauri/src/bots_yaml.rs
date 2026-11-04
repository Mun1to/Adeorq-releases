// La entrada de Adeorq en el `config.yaml` de Hermes, sin tocar nada más.
//
// Ese archivo es de Munir y de Hermes: el suyo mide 90 KB, con 1.671 líneas casi
// todas de comentarios, y Hermes guarda su configuración reescribiéndolo entero. Por
// eso el cambio se hace por líneas, y lo demás queda byte a byte, y por eso no se
// escribe nada sin comprobarlo antes con un lector de YAML de verdad (lo mismo que
// `mcp_estable::con_entorno_comprobado` tras la revisión E9): tiene que poder leerse
// antes, poder leerse después, y lo único que cambia al leerlo es esta entrada. Lo
// que no cumple eso no se toca, y se dice.

use yaml_rust2::{yaml::Hash, Yaml, YamlLoader};

const SERVIDORES: &str = "mcp_servers";
const NOMBRE: &str = "adeorq";
const BOM: char = '\u{feff}';

/// Cómo se lanza el enlace de Adeorq para un bot.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entrada {
    pub comando: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
}

const NO_SE_ENTIENDE: &str = "no entiendo la forma de ese archivo, así que no lo he tocado";
const ENTRADA_AJENA: &str = "ese archivo ya tiene una entrada «adeorq» que no puse yo: quítala o cámbiale el nombre, y vuelve a pulsar";

/// Lo que se apunta en la cabecera de una lista que ya estaba vacía: dejar la línea de
/// antes en un comentario es lo que permite devolverla tal cual al quitar la entrada.
const ANTES: &str = " # Adeorq, antes: ";
/// Lo mismo, si además esa línea era la última y no acababa en salto.
const ANTES_SIN_SALTO: &str = " # Adeorq, antes sin salto: ";

fn clave(s: &str) -> Yaml {
    Yaml::String(s.to_string())
}

/// El documento, con un lector de verdad. Un archivo vacío o solo con comentarios vale.
fn leer(texto: &str) -> Result<Yaml, String> {
    let sin_bom = texto.strip_prefix(BOM).unwrap_or(texto);
    let docs = YamlLoader::load_from_str(sin_bom).map_err(|_| NO_SE_ENTIENDE.to_string())?;
    match docs.as_slice() {
        [] | [Yaml::Null] => Ok(Yaml::Hash(Hash::new())),
        [d @ Yaml::Hash(_)] => Ok(d.clone()),
        _ => Err(NO_SE_ENTIENDE.to_string()),
    }
}

fn servidores(doc: &Yaml) -> Option<&Hash> {
    doc.as_hash()?.get(&clave(SERVIDORES))?.as_hash()
}

/// El documento sin la entrada de Adeorq, ni la lista si se queda vacía: lo que tiene
/// que ser igual antes y después de cualquier cambio.
fn sin_la_entrada(doc: &Yaml) -> Yaml {
    let mut d = doc.clone();
    if let Yaml::Hash(raiz) = &mut d {
        let vacia = match raiz.get_mut(&clave(SERVIDORES)) {
            Some(Yaml::Hash(s)) => {
                s.remove(&clave(NOMBRE));
                s.is_empty()
            }
            Some(Yaml::Null) => true,
            _ => false,
        };
        if vacia {
            raiz.remove(&clave(SERVIDORES));
        }
    }
    d
}

/// Cómo se lee la entrada que se va a escribir.
fn entrada_leida(e: &Entrada) -> Yaml {
    let mut h = Hash::new();
    h.insert(clave("command"), clave(&e.comando));
    h.insert(clave("args"), Yaml::Array(e.args.iter().map(|a| clave(a)).collect()));
    let mut env = Hash::new();
    for (k, v) in &e.env {
        env.insert(clave(k), clave(v));
    }
    h.insert(clave("env"), Yaml::Hash(env));
    Yaml::Hash(h)
}

/// Comilla simple de YAML: lo de dentro va tal cual, barras incluidas, y es lo único
/// que hay que doblar.
fn entre_comillas(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// La entrada, escrita con esa sangría y ese salto de línea. Sale también en la ventana
/// de Ajustes, con la clave tapada: lo que se enseña es lo que se escribe.
pub fn bloque(e: &Entrada, sangria: usize, eol: &str) -> String {
    let (uno, dos, tres) = (" ".repeat(sangria), " ".repeat(sangria + 2), " ".repeat(sangria + 4));
    let args = e.args.iter().map(|a| entre_comillas(a)).collect::<Vec<_>>().join(", ");
    let mut t = format!("{uno}{NOMBRE}:{eol}{dos}command: {}{eol}{dos}args: [{args}]{eol}{dos}env:{eol}", entre_comillas(&e.comando));
    for (k, v) in &e.env {
        t.push_str(&format!("{tres}{k}: {}{eol}", entre_comillas(v)));
    }
    t
}

/// Lo que se enseña antes de escribir: el bloque entero, como quedaría en un archivo
/// sin lista de servidores.
pub fn vista(e: &Entrada) -> String {
    format!("{SERVIDORES}:\n{}", bloque(e, 2, "\n"))
}

fn sangria(linea: &str) -> usize {
    linea.len() - linea.trim_start_matches(' ').len()
}

fn sin_contenido(linea: &str) -> bool {
    let t = linea.trim();
    t.is_empty() || t.starts_with('#')
}

/// Lo que hay detrás de `<clave>:` en una línea, si la línea es esa clave.
fn tras_la_clave<'a>(linea: &'a str, nombre: &str) -> Option<&'a str> {
    let resto = linea.trim_start_matches(' ');
    let resto = [String::new(), "\"".to_string(), "'".to_string()].iter().find_map(|q| {
        let r = resto.strip_prefix(q.as_str())?.strip_prefix(nombre)?.strip_prefix(q.as_str())?;
        r.strip_prefix(':')
    })?;
    (resto.is_empty() || resto.starts_with([' ', '\r', '\n', '\t'])).then_some(resto)
}

/// Dónde está la lista de servidores: su línea, lo que la sigue y la sangría de sus hijos.
struct Lista {
    cabecera: usize,
    /// La primera línea que ya no es suya.
    fin: usize,
    sangria: Option<usize>,
}

fn buscar_lista(lineas: &[&str]) -> Option<Lista> {
    let cabecera = lineas.iter().position(|l| sangria(l) == 0 && tras_la_clave(l.trim_start_matches(BOM), SERVIDORES).is_some())?;
    let fin = (cabecera + 1..lineas.len()).find(|&i| !sin_contenido(lineas[i]) && sangria(lineas[i]) == 0).unwrap_or(lineas.len());
    let sangria = lineas[cabecera + 1..fin].iter().find(|l| !sin_contenido(l)).map(|l| sangria(l));
    Some(Lista { cabecera, fin, sangria })
}

/// Las líneas de la entrada de Adeorq, dentro de la lista. Los comentarios y huecos del
/// final se quedan: suelen ser de lo que viene después.
fn buscar_entrada(lineas: &[&str], lista: &Lista) -> Option<(usize, usize)> {
    let hijos = lista.sangria?;
    let inicio = (lista.cabecera + 1..lista.fin).find(|&i| sangria(lineas[i]) == hijos && !sin_contenido(lineas[i]) && tras_la_clave(lineas[i], NOMBRE).is_some())?;
    let mut fin = (inicio + 1..lista.fin).find(|&i| !sin_contenido(lineas[i]) && sangria(lineas[i]) <= hijos).unwrap_or(lista.fin);
    while fin > inicio + 1 && sin_contenido(lineas[fin - 1]) {
        fin -= 1;
    }
    Some((inicio, fin))
}

fn salto_de(texto: &str) -> &'static str {
    if texto.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    }
}

/// Las líneas con su salto incluido, para volver a juntarlas tal cual.
fn trozos(texto: &str) -> Vec<&str> {
    texto.split_inclusive('\n').collect()
}

/// El texto con la entrada de Adeorq puesta, o cambiada si ya estaba. Lo demás, igual.
pub fn con_entrada(texto: &str, e: &Entrada) -> Result<String, String> {
    let antes = leer(texto)?;
    // Una que ya estaba y no lleva nuestra variable la escribió otro: pisarla la perdería
    // al desconectar. La nuestra sí se cambia, por si se quedó de otra vez.
    if let Some(ya) = servidores(&antes).and_then(|s| s.get(&clave(NOMBRE))) {
        let es_nuestra = e.env.first().is_some_and(|(k, _)| ya["env"][k.as_str()].as_str().is_some());
        if !es_nuestra {
            return Err(ENTRADA_AJENA.to_string());
        }
    }
    let eol = salto_de(texto);
    let lineas = trozos(texto);
    let nuevo = match buscar_lista(&lineas) {
        None => {
            // Exactamente un salto si hay algo escrito: acaba la última línea o deja un
            // hueco, y es el que `sin_entrada` quita.
            let mut t = texto.to_string();
            let cuerpo = t.trim_start_matches(BOM);
            if !cuerpo.trim().is_empty() || (!cuerpo.is_empty() && !cuerpo.ends_with('\n')) {
                t.push_str(eol);
            }
            t.push_str(&format!("{SERVIDORES}:{eol}"));
            t.push_str(&bloque(e, 2, eol));
            t
        }
        Some(lista) => {
            let hijos = lista.sangria.unwrap_or(2);
            let hasta = |i: usize| lineas[..i].concat();
            let desde = |i: usize| lineas[i..].concat();
            match buscar_entrada(&lineas, &lista) {
                Some((inicio, fin)) => format!("{}{}{}", hasta(inicio), bloque(e, hijos, eol), desde(fin)),
                None => {
                    // `mcp_servers:` a secas, `{}` o `null`, con su comentario si lo lleva.
                    let linea = lineas[lista.cabecera];
                    let resto = tras_la_clave(linea.trim_start_matches(BOM), SERVIDORES).unwrap_or_default();
                    let sin_salto = resto.trim_end_matches(['\r', '\n']);
                    let valor = sin_salto.split_once(" #").map_or(sin_salto, |(v, _)| v).trim();
                    if !matches!(valor, "" | "{}" | "null" | "~") || (!valor.is_empty() && lista.sangria.is_some()) {
                        return Err(NO_SE_ENTIENDE.to_string());
                    }
                    if lista.sangria.is_some() {
                        // Con otros servidores debajo, su cabecera no cambia.
                        format!("{}{linea}{}{}", hasta(lista.cabecera), bloque(e, hijos, eol), desde(lista.cabecera + 1))
                    } else {
                        let tal_cual = linea.trim_end_matches(['\r', '\n']);
                        let marca = if tal_cual.len() == linea.len() { ANTES_SIN_SALTO } else { ANTES };
                        let cabecera = format!("{SERVIDORES}:{marca}{tal_cual}{eol}");
                        format!("{}{cabecera}{}{}", hasta(lista.cabecera), bloque(e, hijos, eol), desde(lista.cabecera + 1))
                    }
                }
            }
        }
    };
    let despues = leer(&nuevo)?;
    let leida = servidores(&despues).and_then(|s| s.get(&clave(NOMBRE)));
    if leida != Some(&entrada_leida(e)) || sin_la_entrada(&antes) != sin_la_entrada(&despues) {
        return Err(NO_SE_ENTIENDE.to_string());
    }
    Ok(nuevo)
}

/// El valor de una variable de la entrada de Adeorq, si la hay: para saber si esa
/// entrada la puso Adeorq antes de quitarla.
pub fn variable_de_la_entrada(texto: &str, variable: &str) -> Option<String> {
    let doc = leer(texto).ok()?;
    let entrada = servidores(&doc)?.get(&clave(NOMBRE))?.as_hash()?;
    entrada.get(&clave("env"))?.as_hash()?.get(&clave(variable))?.as_str().map(str::to_string)
}

/// El texto sin la entrada de Adeorq. `Ok(None)` si no estaba.
pub fn sin_entrada(texto: &str) -> Result<Option<String>, String> {
    let antes = leer(texto)?;
    if servidores(&antes).and_then(|s| s.get(&clave(NOMBRE))).is_none() {
        return Ok(None);
    }
    let lineas = trozos(texto);
    let lista = buscar_lista(&lineas).ok_or(NO_SE_ENTIENDE)?;
    let (inicio, fin) = buscar_entrada(&lineas, &lista).ok_or(NO_SE_ENTIENDE)?;
    let quedan_hijos = lineas[lista.cabecera + 1..lista.fin].iter().enumerate().any(|(i, l)| {
        let i = i + lista.cabecera + 1;
        !sin_contenido(l) && (i < inicio || i >= fin)
    });
    let cabecera = lineas[lista.cabecera];
    let de_antes = [(ANTES_SIN_SALTO, false), (ANTES, true)].iter().find_map(|(marca, con_salto)| cabecera.split_once(marca).map(|(_, l)| (l, *con_salto)));
    let nuevo = match de_antes {
        _ if quedan_hijos => format!("{}{}", lineas[..inicio].concat(), lineas[fin..].concat()),
        // La lista ya estaba vacía antes de conectar: vuelve su línea, tal cual.
        Some((linea, con_salto)) => {
            let tal_cual = linea.trim_end_matches(['\r', '\n']);
            let salto = if con_salto { &linea[tal_cual.len()..] } else { "" };
            format!("{}{tal_cual}{salto}{}{}", lineas[..lista.cabecera].concat(), lineas[lista.cabecera + 1..inicio].concat(), lineas[fin..].concat())
        }
        // La lista la puso Adeorq: se va entera, con el salto que se le puso delante.
        None => {
            let mut t = lineas[..lista.cabecera].concat();
            if cabecera.starts_with(BOM) {
                t.push(BOM);
            }
            let cola = lineas[fin..].concat();
            if cola.trim().is_empty() && !t.trim_start_matches(BOM).trim().is_empty() {
                let corte = t.strip_suffix("\r\n").or_else(|| t.strip_suffix('\n')).map_or(t.len(), str::len);
                t.truncate(corte);
            }
            t + &cola
        }
    };
    let despues = leer(&nuevo)?;
    if servidores(&despues).and_then(|s| s.get(&clave(NOMBRE))).is_some() || sin_la_entrada(&antes) != sin_la_entrada(&despues) {
        return Err(NO_SE_ENTIENDE.to_string());
    }
    Ok(Some(nuevo))
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn entrada() -> Entrada {
        Entrada {
            comando: r"C:\Users\Mun i\AppData\Local\Adeorq\mcp\adeorq.exe".into(),
            args: vec!["--mcp".into()],
            env: vec![("ADEORQ_BOT_CLAVE".into(), "abc123".into())],
        }
    }

    /// Cómo empieza y acaba el `config.yaml` de verdad de Hermes: comentarios, saltos de
    /// Windows, y ninguna lista de servidores.
    const DE_HERMES: &str = "# Hermes Agent CLI Configuration\r\n# Copy settings\r\n\r\nmodel:\r\n  default: \"x\"\r\n  # comentario dentro\r\nterminal:\r\n  backend: local\r\n";

    #[test]
    fn sin_lista_la_pone_al_final_y_lo_demas_queda_byte_a_byte() {
        let nuevo = con_entrada(DE_HERMES, &entrada()).unwrap();
        assert!(nuevo.starts_with(DE_HERMES), "{nuevo}");
        let puesto = &nuevo[DE_HERMES.len()..];
        assert_eq!(
            puesto,
            "\r\nmcp_servers:\r\n  adeorq:\r\n    command: 'C:\\Users\\Mun i\\AppData\\Local\\Adeorq\\mcp\\adeorq.exe'\r\n    args: ['--mcp']\r\n    env:\r\n      ADEORQ_BOT_CLAVE: 'abc123'\r\n"
        );
        assert_eq!(variable_de_la_entrada(&nuevo, "ADEORQ_BOT_CLAVE").as_deref(), Some("abc123"));
    }

    #[test]
    fn poner_y_quitar_deja_el_archivo_como_estaba() {
        for original in [
            DE_HERMES,
            "a: 1\n",
            "",
            "\n",
            "# solo un comentario\n",
            // Sin salto al final, con saltos mezclados y con huecos al final.
            "a: 1",
            "# solo un comentario",
            "a: 1\r\nb: 2\n",
            "a: 1\nb: 2\r\n",
            "a: 1\r\nb: 2",
            "a: 1\n\n\n",
            // Con BOM.
            "\u{feff}a: 1",
            "\u{feff}",
            "\u{feff}mcp_servers: {}\n",
            "\u{feff}mcp_servers:\n  fotos:\n    command: a\n",
            // La lista ya estaba, vacía, en todas sus formas.
            "mcp_servers:\n",
            "mcp_servers:",
            "mcp_servers:\r\n",
            "mcp_servers: {}\n",
            "mcp_servers: {}",
            "mcp_servers: null\n",
            "mcp_servers: ~\n",
            "mcp_servers:   \n",
            "mcp_servers:  # nada\n",
            "mcp_servers:  {}  # nada\n",
            "\"mcp_servers\":\n",
            "'mcp_servers': {}\n",
            "a: 1\nmcp_servers:\n",
            "a: 1\n\nmcp_servers:\n",
            "a: 1\n\nmcp_servers:\nb: 2\n",
            "a: 1\nmcp_servers: {}\nb: 2\n",
            "mcp_servers:\n\nb: 2\n",
            // Vacía, con los ejemplos comentados debajo.
            "mcp_servers:\n  # fotos:\n  #   command: x\nmodel: y\n",
            "mcp_servers:\n# fotos:\n#   command: x\n",
            "mcp_servers: # los mios\n  # fotos:\n  #   command: x\n",
            // Con otros servidores, y su cabecera escrita de otra forma.
            "mcp_servers:\n  fotos:\n    command: a",
            "\"mcp_servers\":\n  fotos:\n    command: a\n",
            "mcp_servers: # c\n  fotos:\n    command: a\n",
        ] {
            let puesto = con_entrada(original, &entrada()).unwrap();
            assert_eq!(variable_de_la_entrada(&puesto, "ADEORQ_BOT_CLAVE").as_deref(), Some("abc123"), "con {original:?}");
            assert_eq!(sin_entrada(&puesto).unwrap().unwrap(), original, "con {original:?}");
        }
    }

    /// Una entrada `adeorq` hecha a mano se perdería al desconectar.
    #[test]
    fn la_entrada_que_escribio_otro_no_se_pisa() {
        for ajena in ["mcp_servers:\n  adeorq:\n    command: propia\n", "mcp_servers:\n  adeorq: {command: propia}\n", "mcp_servers:\n  a:\n    command: b\n  adeorq:\n    command: c\n    env:\n      OTRA: 1\n"] {
            assert_eq!(con_entrada(ajena, &entrada()).unwrap_err(), ENTRADA_AJENA, "con {ajena:?}");
        }
    }

    /// Hermes reescribe el archivo entero al guardar, sin comentarios y a su manera.
    #[test]
    fn se_quita_aunque_hermes_la_haya_reescrito() {
        let suya = "mcp_servers:\n  adeorq:\n    command: C:\\x\\adeorq.exe\n    args:\n    - --mcp\n    env:\n      ADEORQ_BOT_CLAVE: vieja\nmodel: y\n";
        assert_eq!(variable_de_la_entrada(suya, "ADEORQ_BOT_CLAVE").as_deref(), Some("vieja"));
        assert_eq!(sin_entrada(suya).unwrap().unwrap(), "model: y\n");
    }

    /// Si tras conectar otro añadió un servidor a una lista que estaba vacía, se quita
    /// solo lo nuestro: su cabecera ya no puede volver a ser `{}`.
    #[test]
    fn lo_que_se_anadio_despues_se_queda() {
        let puesto = con_entrada("mcp_servers: {}\n", &entrada()).unwrap();
        let con_otro = format!("{puesto}  fotos:\n    command: a\n");
        let quitado = sin_entrada(&con_otro).unwrap().unwrap();
        assert!(quitado.ends_with("  fotos:\n    command: a\n"), "{quitado}");
        assert!(leer(&quitado).unwrap()[SERVIDORES]["fotos"]["command"].as_str() == Some("a"), "{quitado}");
    }

    #[test]
    fn con_otros_servidores_no_los_toca() {
        let texto = "# mis cosas\nmcp_servers:\n    # el de las fotos\n    fotos:\n        command: uvx\n        args: [\"a\"]\n\n    otro:\n        url: http://x\n\nmodel: y\n";
        let nuevo = con_entrada(texto, &entrada()).unwrap();
        // Con la sangría de sus hermanos, justo detrás de la cabecera.
        assert!(nuevo.starts_with("# mis cosas\nmcp_servers:\n    adeorq:\n      command: '"), "{nuevo}");
        assert!(nuevo.ends_with("    # el de las fotos\n    fotos:\n        command: uvx\n        args: [\"a\"]\n\n    otro:\n        url: http://x\n\nmodel: y\n"), "{nuevo}");
        assert_eq!(sin_entrada(&nuevo).unwrap().unwrap(), texto);
    }

    #[test]
    fn volver_a_conectar_cambia_solo_la_suya() {
        let texto = "mcp_servers:\n  antes:\n    command: a\n  adeorq:\n    command: 'viejo'\n    args: ['--mcp']\n    env:\n      ADEORQ_BOT_CLAVE: 'vieja'\n\n  # el siguiente\n  luego:\n    command: b\nfin: 1\n";
        let nuevo = con_entrada(texto, &entrada()).unwrap();
        assert_eq!(variable_de_la_entrada(&nuevo, "ADEORQ_BOT_CLAVE").as_deref(), Some("abc123"));
        assert!(!nuevo.contains("vieja"), "{nuevo}");
        assert!(nuevo.starts_with("mcp_servers:\n  antes:\n    command: a\n  adeorq:\n"), "{nuevo}");
        assert!(nuevo.ends_with("\n\n  # el siguiente\n  luego:\n    command: b\nfin: 1\n"), "{nuevo}");
    }

    #[test]
    fn una_lista_vacia_o_nula_se_rellena() {
        for (texto, cabecera) in [
            ("mcp_servers: {}\nfin: 1\n", "mcp_servers: # Adeorq, antes: mcp_servers: {}\n"),
            ("mcp_servers:\nfin: 1\n", "mcp_servers: # Adeorq, antes: mcp_servers:\n"),
            ("mcp_servers: null # nada\nfin: 1\n", "mcp_servers: # Adeorq, antes: mcp_servers: null # nada\n"),
        ] {
            let nuevo = con_entrada(texto, &entrada()).unwrap();
            assert!(nuevo.starts_with(&format!("{cabecera}  adeorq:\n")), "{nuevo}");
            assert!(nuevo.ends_with("fin: 1\n"), "{nuevo}");
        }
    }

    #[test]
    fn lo_que_no_se_entiende_no_se_toca() {
        for raro in [
            // Otra forma de la lista.
            "mcp_servers: {fotos: {command: a}}\n",
            "mcp_servers:\n- fotos\n",
            "mcp_servers: 3\n",
            // No se puede leer.
            "a: [\n",
            "a: 1\n  b: 2\n: :\n",
            // Dos documentos, o uno que no es un mapa.
            "a: 1\n---\nb: 2\n",
            "- a\n- b\n",
            // La cabecera dentro de un texto largo: se escribiría dentro del texto.
            "nota: |\n  mcp_servers:\n    otra: 1\n",
        ] {
            let r = con_entrada(raro, &entrada());
            if raro.starts_with("nota") {
                // Aquí el texto no es la lista: se añade al final, y lo de dentro sigue igual.
                let n = r.unwrap();
                assert!(n.starts_with(raro), "{n}");
            } else {
                assert_eq!(r.unwrap_err(), NO_SE_ENTIENDE, "con {raro:?}");
            }
        }
    }

    #[test]
    fn una_ruta_con_comilla_se_lee_igual() {
        let mut e = entrada();
        e.comando = r"C:\Users\O'Neil\adeorq.exe".into();
        let nuevo = con_entrada("a: 1\n", &e).unwrap();
        assert!(nuevo.contains(r"command: 'C:\Users\O''Neil\adeorq.exe'"), "{nuevo}");
    }

    #[test]
    fn un_archivo_con_bom_lo_conserva() {
        let con_bom = "\u{feff}a: 1\n";
        let nuevo = con_entrada(con_bom, &entrada()).unwrap();
        assert!(nuevo.starts_with(con_bom));
        assert_eq!(sin_entrada(&nuevo).unwrap().unwrap(), con_bom);
    }

    #[test]
    fn quitar_una_que_no_esta_no_hace_nada() {
        assert_eq!(sin_entrada("a: 1\n").unwrap(), None);
        assert_eq!(sin_entrada("mcp_servers:\n  otra:\n    command: a\n").unwrap(), None);
        assert_eq!(variable_de_la_entrada("a: 1\n", "X"), None);
    }

    #[test]
    fn la_vista_es_lo_que_se_escribe() {
        assert!(vista(&entrada()).starts_with("mcp_servers:\n  adeorq:\n    command: '"));
    }
}
