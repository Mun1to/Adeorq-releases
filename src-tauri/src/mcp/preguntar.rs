//! `adeorq preguntar <herramienta> '<json>'`: una llamada al MCP, de una sola vez.
//!
//! Es la única vía de Grok Bot, que vive en la nube y no llega al puerto: su app de
//! escritorio puede ejecutar comandos en este equipo, y pide aprobación por cada uno
//! (`docs/contexto/bots.md`). Va por la misma puerta que todo lo demás: con
//! `ADEORQ_BOT_CLAVE` es ese bot, con su escalón, y sin ella es lo de fuera. Lo que se
//! le contesta sale por su salida, y lo que falla, con código 1 (`decir_el_error`).

use std::io::{self, BufRead, BufReader, Write};
use std::net::TcpStream;
use std::time::Duration;

use serde_json::{json, Value};

use super::{presentarse, Presentacion, SIN_ADEORQ_PARA_UN_BOT};

/// Lo que puede tardar una respuesta: abrir con encargo espera un clic hasta 2 minutos.
const PLAZO: Duration = Duration::from_secs(130);

const USO: &str = "Uso: adeorq preguntar <herramienta> [nombre=valor ...]\n\nEjemplos:\n  adeorq preguntar get_active_panes\n  adeorq preguntar read_pane_screen paneId=3\n\nTambién vale un objeto JSON en lugar de nombre=valor.";

/// `nombre=valor` por cada argumento: PowerShell 5.1 le quita las comillas a un JSON al
/// pasárselo a un programa (`'{"paneId":3}'` llega como `{paneId:3}`, medido), y esta forma
/// no depende de cada shell. El valor es JSON si lo es (`3`, `true`) y si no, un texto.
fn de_pares(pares: &[String]) -> Result<Value, String> {
    let mut objeto = serde_json::Map::new();
    for p in pares {
        let (nombre, valor) = p.split_once('=').filter(|(n, _)| !n.trim().is_empty()).ok_or_else(|| {
            format!("«{p}» no vale: los argumentos tienen que ser nombre=valor o un objeto JSON, como paneId=3.")
        })?;
        let valor = serde_json::from_str::<Value>(valor).unwrap_or_else(|_| json!(valor));
        objeto.insert(nombre.trim().to_string(), valor);
    }
    Ok(Value::Object(objeto))
}

/// La herramienta y sus argumentos, o qué falta.
fn leer_pedido(args: &[String]) -> Result<(String, Value), String> {
    let herramienta = args.first().map(|h| h.trim()).filter(|h| !h.is_empty() && !h.starts_with('-')).ok_or(USO)?;
    let argumentos = match &args[1..] {
        [t] if t.trim_start().starts_with('{') => serde_json::from_str::<Value>(t)
            .map_err(|e| format!("Los argumentos no son JSON: {e}. PowerShell 5.1 les quita las comillas: ahí, escribe nombre=valor, como paneId=3."))?,
        pares => de_pares(pares)?,
    };
    Ok((herramienta.to_string(), argumentos))
}

/// Si la llamada señala una terminal por su número. El puerto no se lo cree a una
/// conexión que no ha mirado la lista (`numero_dudoso`), y esta solo vive una llamada.
fn nombra_terminal(argumentos: &Value) -> bool {
    ["paneId", "from", "to"].iter().any(|k| argumentos[*k].is_number())
}

/// Lo que dice una respuesta de `tools/call`, o su error.
fn texto_de(respuesta: &Value) -> Result<String, String> {
    if let Some(m) = respuesta["error"]["message"].as_str() {
        return Err(m.to_string());
    }
    let partes = respuesta["result"]["content"].as_array().ok_or("Adeorq contestó algo que no entiendo.")?;
    let texto = partes.iter().filter_map(|p| p["text"].as_str()).collect::<Vec<_>>().join("\n");
    // Una herramienta que dice que no pudo, aunque la llamada haya ido bien.
    if respuesta["result"]["isError"].as_bool() == Some(true) {
        return Err(texto);
    }
    Ok(texto)
}

/// Lo que falló. En Windows va por la salida normal: el binario publicado no tiene consola,
/// y con la línea que se le da a Grok Bot (`| Out-String`) PowerShell no recoge su salida de
/// errores, así que «Adeorq no está abierta» no se veía en ningún sitio (medido).
fn decir_el_error(e: &str) {
    if cfg!(windows) {
        let mut out = io::stdout().lock();
        let _ = writeln!(out, "{e}");
        let _ = out.flush();
    } else {
        eprintln!("{e}");
    }
}

struct Conexion {
    tcp: TcpStream,
    lector: BufReader<TcpStream>,
    siguiente: u64,
}

impl Conexion {
    fn pedir(&mut self, metodo: &str, params: Value) -> Result<Value, String> {
        self.siguiente += 1;
        let id = self.siguiente;
        let linea = json!({ "jsonrpc": "2.0", "id": id, "method": metodo, "params": params });
        self.tcp.write_all(format!("{linea}\n").as_bytes()).map_err(|e| e.to_string())?;
        loop {
            let mut l = String::new();
            let n = self.lector.read_line(&mut l).map_err(|e| format!("Adeorq no contestó: {e}"))?;
            if n == 0 {
                return Err("Adeorq cerró la conexión sin contestar.".to_string());
            }
            // Un aviso de por medio (su lista ha cambiado) no es la respuesta.
            if let Ok(v) = serde_json::from_str::<Value>(&l) {
                if v["id"].as_u64() == Some(id) {
                    return Ok(v);
                }
            }
        }
    }
}

fn llamar(herramienta: &str, argumentos: Value) -> Result<String, String> {
    let puerto = super::puerto()?;
    let mut tcp = TcpStream::connect(("127.0.0.1", puerto)).map_err(|_| SIN_ADEORQ_PARA_UN_BOT.to_string())?;
    tcp.set_read_timeout(Some(PLAZO)).map_err(|e| e.to_string())?;
    presentarse(&mut tcp, &Presentacion::del_entorno(false)).map_err(|e| e.to_string())?;
    let lector = BufReader::new(tcp.try_clone().map_err(|e| e.to_string())?);
    let mut c = Conexion { tcp, lector, siguiente: 0 };
    let version = env!("CARGO_PKG_VERSION");
    c.pedir("initialize", json!({ "protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": { "name": "adeorq-preguntar", "version": version } }))?;
    c.tcp.write_all(b"{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}\n").map_err(|e| e.to_string())?;
    if nombra_terminal(&argumentos) && herramienta != "get_active_panes" {
        c.pedir("tools/call", json!({ "name": "get_active_panes", "arguments": {} }))?;
    }
    let r = c.pedir("tools/call", json!({ "name": herramienta, "arguments": argumentos }))?;
    texto_de(&r)
}

pub fn principal(args: &[String]) -> i32 {
    let (herramienta, argumentos) = match leer_pedido(args) {
        Ok(p) => p,
        Err(e) => {
            decir_el_error(&e);
            return 2;
        }
    };
    match llamar(&herramienta, argumentos) {
        Ok(texto) => {
            let mut out = io::stdout().lock();
            let _ = writeln!(out, "{texto}");
            let _ = out.flush();
            0
        }
        Err(e) => {
            decir_el_error(&e);
            1
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn v(l: &[&str]) -> Vec<String> {
        l.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn lee_lo_que_se_le_pide() {
        assert_eq!(leer_pedido(&v(&["get_usage"])).unwrap(), ("get_usage".to_string(), json!({})));
        assert_eq!(leer_pedido(&v(&["read_pane_screen", r#"{"paneId":3}"#])).unwrap().1, json!({ "paneId": 3 }));
        assert!(leer_pedido(&[]).unwrap_err().contains("Uso"));
        assert!(leer_pedido(&v(&["--clave"])).is_err(), "una bandera no es una herramienta");
        assert!(leer_pedido(&v(&["x", "{ esto no"])).unwrap_err().contains("JSON"));
        assert!(leer_pedido(&v(&["x", "[1]"])).unwrap_err().contains("objeto"));
        assert!(leer_pedido(&v(&["x", "{}", "de más"])).is_err());
    }

    /// Lo que le llega desde PowerShell 5.1 con el JSON entre comillas simples.
    #[test]
    fn el_json_sin_comillas_de_powershell_dice_como_escribirlo() {
        assert!(leer_pedido(&v(&["read_pane_screen", "{paneId:3}"])).unwrap_err().contains("paneId=3"));
    }

    #[test]
    fn nombre_igual_a_valor_no_depende_de_la_shell() {
        assert_eq!(leer_pedido(&v(&["read_pane_screen", "paneId=3"])).unwrap().1, json!({ "paneId": 3 }));
        assert_eq!(
            leer_pedido(&v(&["open_pane", "cli=shell", "cwd=C:\\a b", "name=x=y", "auto=true"])).unwrap().1,
            json!({ "cli": "shell", "cwd": "C:\\a b", "name": "x=y", "auto": true })
        );
        assert_eq!(leer_pedido(&v(&["send_keys", "paneId=3", r#"keys=["enter"]"#])).unwrap().1, json!({ "paneId": 3, "keys": ["enter"] }));
        assert!(leer_pedido(&v(&["x", "=3"])).is_err());
    }

    #[test]
    fn mira_la_lista_antes_si_nombra_una_terminal() {
        assert!(nombra_terminal(&json!({ "paneId": 3 })));
        assert!(nombra_terminal(&json!({ "from": 1, "to": 2 })));
        assert!(!nombra_terminal(&json!({ "cwd": "x" })));
    }

    #[test]
    fn saca_el_texto_o_el_error() {
        let bien = json!({ "result": { "content": [{ "type": "text", "text": "uno" }, { "type": "text", "text": "dos" }] } });
        assert_eq!(texto_de(&bien).unwrap(), "uno\ndos");
        assert_eq!(texto_de(&json!({ "error": { "message": "no" } })).unwrap_err(), "no");
        assert!(texto_de(&json!({})).is_err());
        let no_pudo = json!({ "result": { "isError": true, "content": [{ "type": "text", "text": "se quedó en la caja" }] } });
        assert_eq!(texto_de(&no_pudo).unwrap_err(), "se quedó en la caja");
    }
}
