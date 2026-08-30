// Pedir un token sin que pase por el agente.
//
// Un agente que necesita una clave no puede leerla: lo que lee queda en su
// transcript, que es un fichero en disco, y además vuelve al modelo en la
// vuelta siguiente. Hasta hoy la salida era abrir un bloc de notas y dejar un
// `token-loquesea.txt` en la carpeta del proyecto, que es exactamente lo que no
// debe existir (Munir, 2026-08-30: «me abren bloc de notas cuando se lo pido,
// después de tres veces peleándome con él»).
//
// Ahora el agente escribe una línea y ya:
//
//     SUPABASE_ACCESS_TOKEN=$(adeorq secreto supabase) supabase projects list
//
// `adeorq secreto` habla con la app por el mismo puerto que el MCP. Si el
// secreto no está guardado, se abre una ventana en Adeorq donde se pega, y solo
// entonces el puente lo escribe por su salida, que va directa a la variable de
// entorno del comando. En la pantalla de la terminal no aparece nunca, así que
// tampoco en el transcript ni en el contexto del modelo.
//
// **La garantía no depende de la buena voluntad del agente.** El puente
// comprueba que su salida NO sea una consola: si alguien ejecuta
// `adeorq secreto supabase` a pelo para verlo en pantalla, no imprime el valor,
// imprime cómo se usa. Un secreto solo sale hacia una tubería.
//
// Guardado va donde ya van los demás (`secrets.rs`): Gestor de Credenciales en
// Windows, fichero con permisos 600 en Linux. Aquí solo vive la ESPERA.

use std::collections::HashMap;
use std::sync::mpsc::{channel, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use tauri::Emitter;

/// Cuánto se espera a que alguien pegue el secreto antes de rendirse. Cinco
/// minutos es de sobra para ir a por el token y volver, y poco para que un
/// comando olvidado se quede colgado toda la noche.
const ESPERA: Duration = Duration::from_secs(300);

/// El prefijo con el que estos secretos viven en el almacén, para no chocar con
/// las claves de API de los proveedores (`api:claude` y compañía).
const ESPACIO: &str = "agente:";

/// Las peticiones que están esperando respuesta, por nombre de secreto.
fn esperando() -> &'static Mutex<HashMap<String, Sender<Option<String>>>> {
    static M: OnceLock<Mutex<HashMap<String, Sender<Option<String>>>>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Un nombre de secreto válido: letras, números, guion y guion bajo.
///
/// Se valida porque acaba formando el nombre de una credencial de Windows y
/// llega de fuera, de la línea que escribe un agente. Ver `secrets.rs`, que hace
/// lo mismo por el mismo motivo.
fn nombre_valido(nombre: &str) -> bool {
    !nombre.is_empty()
        && nombre.len() <= 64
        && nombre
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Lo que hace la app cuando un agente pide un secreto.
///
/// Si ya está guardado se devuelve sin molestar a nadie. Si no, se abre la
/// ventana y se espera a que lo peguen.
pub fn atender(app: &tauri::AppHandle, nombre: &str, motivo: &str) -> Result<String, String> {
    if !nombre_valido(nombre) {
        return Err(
            "el nombre solo puede llevar letras, números, guion y guion bajo (64 como mucho)"
                .into(),
        );
    }
    let clave = format!("{ESPACIO}{nombre}");

    if let Some(valor) = crate::secrets::get(&clave) {
        return Ok(valor);
    }

    let (tx, rx) = channel();
    {
        let mut mapa = esperando().lock().map_err(|_| "el buzón está roto")?;
        // Dos peticiones del mismo secreto a la vez: la segunda se rinde en vez
        // de abrir otra ventana encima. Pedir dos veces lo mismo es un bucle,
        // no una necesidad.
        if mapa.contains_key(nombre) {
            return Err(format!("ya hay una ventana abierta pidiendo «{nombre}»"));
        }
        mapa.insert(nombre.to_string(), tx);
    }

    let aviso = app.emit(
        "secreto-pedido",
        serde_json::json!({ "nombre": nombre, "motivo": motivo }),
    );
    if aviso.is_err() {
        esperando().lock().ok().map(|mut m| m.remove(nombre));
        return Err("no se pudo abrir la ventana para pegarlo".into());
    }

    let respuesta = rx.recv_timeout(ESPERA);
    esperando().lock().ok().map(|mut m| m.remove(nombre));

    match respuesta {
        Ok(Some(valor)) => Ok(valor),
        Ok(None) => Err("lo has cancelado".into()),
        Err(_) => Err("nadie lo pegó a tiempo".into()),
    }
}

/// El front, cuando alguien pega el secreto o cierra la ventana.
///
/// `guardar` decide si queda en el almacén para la próxima vez o si vale solo
/// para este comando: un token de una tarde no tiene por qué quedarse a vivir.
#[tauri::command]
pub fn secreto_responder(nombre: String, valor: Option<String>, guardar: bool) -> Result<(), String> {
    if !nombre_valido(&nombre) {
        return Err("nombre no válido".into());
    }
    if let (Some(v), true) = (valor.as_ref(), guardar) {
        crate::secrets::put(&format!("{ESPACIO}{nombre}"), v)?;
        apuntar(&nombre);
    }
    let tx = {
        let mut mapa = esperando().lock().map_err(|_| "el buzón está roto")?;
        mapa.remove(&nombre)
    };
    match tx {
        // El error de envío se traga a propósito: significa que el que
        // esperaba ya se cansó, y eso no es culpa de quien acaba de pegar.
        Some(tx) => {
            let _ = tx.send(valor);
            Ok(())
        }
        None => Err(format!("ya no había nadie esperando «{nombre}»")),
    }
}

/// El índice de nombres guardados.
///
/// El almacén de secretos sabe guardar, leer y olvidar, pero no ENUMERAR, y sin
/// enumerar un token guardado se queda ahí para siempre sin forma de verlo ni de
/// borrarlo. Se lleva aparte, en un fichero de la carpeta de datos, y solo con
/// los NOMBRES: el valor sigue viviendo únicamente en el almacén cifrado.
fn indice() -> Result<std::path::PathBuf, String> {
    Ok(crate::dir_datos_creado()?.join("secretos-de-agente.json"))
}

fn leer_indice() -> Vec<String> {
    let Ok(p) = indice() else { return Vec::new() };
    let Ok(txt) = std::fs::read_to_string(p) else { return Vec::new() };
    serde_json::from_str(&txt).unwrap_or_default()
}

fn escribir_indice(nombres: &[String]) {
    if let Ok(p) = indice() {
        if let Ok(txt) = serde_json::to_string(nombres) {
            let _ = std::fs::write(p, txt);
        }
    }
}

fn apuntar(nombre: &str) {
    let mut v = leer_indice();
    if !v.iter().any(|x| x == nombre) {
        v.push(nombre.to_string());
        v.sort();
        escribir_indice(&v);
    }
}

/// Los secretos de agente que ya están guardados, para poder verlos y borrarlos
/// desde Ajustes. Solo los NOMBRES: el valor no vuelve nunca al front.
#[tauri::command]
pub fn secretos_de_agente() -> Vec<String> {
    leer_indice()
}

/// Olvidar uno.
#[tauri::command]
pub fn secreto_de_agente_olvidar(nombre: String) -> Result<(), String> {
    if !nombre_valido(&nombre) {
        return Err("nombre no válido".into());
    }
    crate::secrets::forget(&format!("{ESPACIO}{nombre}"))?;
    let v: Vec<String> = leer_indice().into_iter().filter(|x| *x != nombre).collect();
    escribir_indice(&v);
    Ok(())
}

/// Lo que corre cuando un agente escribe `adeorq secreto <nombre>`.
///
/// Se ejecuta en OTRO proceso, el que lanza el agente en su terminal, y su
/// único trabajo es traer el valor y escribirlo por su salida.
///
/// El seguro está aquí: **si la salida es una consola, no imprime el secreto**.
/// Un secreto solo sale hacia una tubería, o sea hacia un `$(...)`, una
/// variable o un fichero. Ejecutarlo a pelo para mirarlo no funciona, y no
/// porque el agente sea bueno, sino porque no puede.
pub fn puente(nombre: &str, motivo: &str) -> Result<(), String> {
    let valor = traer(3012, nombre, motivo)?;
    escribir(&valor)
}

/// Traer el valor, hablando con la app por su puerto.
///
/// El puerto es un parámetro y no una constante para poder probar el protocolo
/// contra un servidor de mentira: en la máquina de trabajo el 3012 lo tiene la
/// Adeorq de verdad, así que sin esto no habría forma de probarlo.
fn traer(puerto: u16, nombre: &str, motivo: &str) -> Result<String, String> {
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpStream;

    if !nombre_valido(nombre) {
        return Err("el nombre solo puede llevar letras, números, guion y guion bajo".into());
    }

    let stream = TcpStream::connect(("127.0.0.1", puerto))
        .map_err(|_| "Adeorq no está abierto, o su puerto lo tiene otra ventana".to_string())?;
    // Sin tope de tiempo en la lectura: al otro lado hay una persona buscando un
    // token, y los cinco minutos de espera los pone la app, no esto.
    let mut escritor = stream.try_clone().map_err(|e| e.to_string())?;
    let mut lector = BufReader::new(stream);

    let peticion = serde_json::json!({
        "adeorq": "secreto",
        "nombre": nombre,
        "motivo": motivo,
    });
    writeln!(escritor, "{peticion}").map_err(|e| e.to_string())?;
    escritor.flush().map_err(|e| e.to_string())?;

    // El acuse tiene tope corto: dice si al otro lado hay una Adeorq que sabe de
    // esto. Un Adeorq viejo sirviendo el puerto se queda callado, y sin este
    // tope quien pregunta se colgaba para siempre sin decir por qué.
    lector
        .get_ref()
        .set_read_timeout(Some(std::time::Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;
    let mut acuse = String::new();
    lector.read_line(&mut acuse).map_err(|_| {
        "esta versión de Adeorq no sabe pedir claves: actualízala, o cierra la ventana "
            .to_owned()
            + "vieja que tiene cogido el puerto."
    })?;
    if !acuse.contains("esperando") {
        return Err("Adeorq no ha entendido la petición".into());
    }

    // Y a partir de aquí el tope es largo: al otro lado hay una persona buscando
    // un token. Un pelo por encima de lo que espera la app, para que quien se
    // rinda primero sea ella y el mensaje lo ponga ella.
    lector
        .get_ref()
        .set_read_timeout(Some(std::time::Duration::from_secs(330)))
        .map_err(|e| e.to_string())?;
    let mut linea = String::new();
    lector
        .read_line(&mut linea)
        .map_err(|_| "Adeorq dejó de contestar".to_string())?;
    let res: serde_json::Value = serde_json::from_str(&linea).map_err(|e| e.to_string())?;
    if let Some(error) = res["error"].as_str() {
        return Err(error.to_string());
    }
    Ok(res["valor"].as_str().ok_or("respuesta sin valor")?.to_string())
}

/// Escribir el valor por la salida, y solo si la salida no es una pantalla.
fn escribir(valor: &str) -> Result<(), String> {
    use std::io::IsTerminal;
    escribir_si(valor, std::io::stdout().is_terminal())
}

/// La decisión aparte de la salida real, para poder probar el caso que importa:
/// que con una pantalla delante NO salga el secreto.
fn escribir_si(valor: &str, es_pantalla: bool) -> Result<(), String> {
    use std::io::Write;

    if es_pantalla {
        return Err(concat!(
            "esto no escribe el secreto en pantalla nunca. Úsalo así:\n\n",
            "    MI_TOKEN=$(adeorq secreto <nombre>) mi-comando\n\n",
            "El valor entra directo en la variable y no pasa por la terminal."
        )
        .into());
    }

    // Sin salto de línea al final: `$(...)` ya lo quitaría, pero un token con un
    // retorno pegado detrás rompe cabeceras HTTP y da errores que no dicen nada.
    let salida = std::io::stdout();
    let mut salida = salida.lock();
    salida.write_all(valor.as_bytes()).map_err(|e| e.to_string())?;
    salida.flush().map_err(|e| e.to_string())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    /// El protocolo entero contra un servidor de mentira: se manda la petición,
    /// se contesta, y el valor llega. Con puerto propio porque el 3012 lo tiene
    /// la Adeorq de verdad en la máquina de trabajo.
    #[test]
    fn el_protocolo_trae_el_valor_y_cuenta_los_errores() {
        use std::io::{BufRead, BufReader, Write};
        use std::net::TcpListener;

        let oreja = TcpListener::bind("127.0.0.1:0").unwrap();
        let puerto = oreja.local_addr().unwrap().port();

        std::thread::spawn(move || {
            for flujo in oreja.incoming().take(2) {
                let flujo = flujo.unwrap();
                let mut escritor = flujo.try_clone().unwrap();
                let mut linea = String::new();
                BufReader::new(flujo).read_line(&mut linea).unwrap();
                let v: serde_json::Value = serde_json::from_str(&linea).unwrap();
                // Lo que manda el cliente tiene que ser reconocible.
                assert_eq!(v["adeorq"], "secreto");
                writeln!(escritor, "{{\"adeorq\":\"esperando\"}}").unwrap();
                let res = if v["nombre"] == "supabase" {
                    serde_json::json!({ "valor": "sbp_tokendeprueba" })
                } else {
                    serde_json::json!({ "error": "lo has cancelado" })
                };
                writeln!(escritor, "{res}").unwrap();
            }
        });

        assert_eq!(
            traer(puerto, "supabase", "listar proyectos").unwrap(),
            "sbp_tokendeprueba"
        );
        assert_eq!(traer(puerto, "otro", "").unwrap_err(), "lo has cancelado");
    }

    /// Lo que impide que el secreto acabe en la pantalla del agente, y por tanto
    /// en su transcript. No depende de que el agente se porte bien: con una
    /// consola delante no se escribe, se explica cómo se usa.
    #[test]
    fn con_una_pantalla_delante_no_sale_el_secreto() {
        let e = escribir_si("sbp_loquesea", true).unwrap_err();
        assert!(!e.contains("sbp_loquesea"), "el error no puede llevar el valor dentro");
        assert!(e.contains("$(adeorq secreto"), "y tiene que decir cómo se usa: {e}");
        // Sin pantalla sí escribe: en un test la salida está capturada.
        assert!(escribir_si("sbp_loquesea", false).is_ok());
    }

    /// El fallo que costó una prueba colgada: un Adeorq viejo sirviendo el
    /// puerto recibe la petición, no la entiende y se queda callado. Antes eso
    /// dejaba al que preguntaba esperando para siempre.
    #[test]
    fn si_al_otro_lado_no_entienden_no_se_queda_colgado() {
        use std::net::TcpListener;

        let oreja = TcpListener::bind("127.0.0.1:0").unwrap();
        let puerto = oreja.local_addr().unwrap().port();
        std::thread::spawn(move || {
            // Acepta y no dice nada, como el Adeorq de antes de esto.
            let _mudo: Vec<_> = oreja.incoming().take(1).collect();
            std::thread::sleep(std::time::Duration::from_secs(20));
        });

        let empezo = std::time::Instant::now();
        let e = traer(puerto, "supabase", "").unwrap_err();
        assert!(empezo.elapsed() < std::time::Duration::from_secs(12), "tardó demasiado en rendirse");
        assert!(e.contains("actualízala"), "y tiene que decir qué hacer: {e}");
    }

    /// Un nombre inventado no llega ni a abrir el socket.
    #[test]
    fn un_nombre_raro_no_sale_de_casa() {
        assert!(traer(1, "api:claude", "").unwrap_err().contains("solo puede llevar"));
    }

    #[test]
    fn el_nombre_se_valida_porque_llega_de_fuera() {
        assert!(nombre_valido("supabase"));
        assert!(nombre_valido("CLOUDFLARE_API_TOKEN"));
        assert!(nombre_valido("token-de-hoy"));
        // Lo que no puede pasar: vacío, con separadores, o largo de más.
        assert!(!nombre_valido(""));
        assert!(!nombre_valido("api:claude"));
        assert!(!nombre_valido("../otro"));
        assert!(!nombre_valido("con espacio"));
        assert!(!nombre_valido(&"x".repeat(65)));
        assert!(nombre_valido(&"x".repeat(64)));
    }
}
